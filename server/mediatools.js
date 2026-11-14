// Imagens e arquivos que a IA do chat cria para o usuário (ficam em chat-files, só o dono abre).
import fs from 'node:fs';
import path from 'node:path';
import { id } from './db.js';
import { CHAT_FILES } from './routes/chatfiles.js';

const save = (userId, ext, buf) => {
  fs.mkdirSync(CHAT_FILES, { recursive: true });
  const file = `${userId}__${id()}.${ext}`;
  fs.writeFileSync(path.join(CHAT_FILES, file), buf);
  return file;
};

// ---------------- Imagens ----------------
let imageModels = { at: 0, list: [] };
async function geminiImageModels() {
  if (Date.now() - imageModels.at < 6 * 3600 * 1000) return imageModels.list;
  const base = (process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  let list = [];
  try {
    const res = await fetch(`${base}/models?pageSize=200`, { headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY }, signal: AbortSignal.timeout(15000) });
    const data = await res.json();
    list = (data.models || []).filter((m) => /image/i.test(m.name) && !/imagen/i.test(m.name) && (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
    list.sort((a, b) => (/flash/.test(b) ? 1 : 0) - (/flash/.test(a) ? 1 : 0) || (/preview/.test(a) ? 1 : 0) - (/preview/.test(b) ? 1 : 0));
  } catch { /* usa os nomes conhecidos */ }
  if (!list.length) list = ['gemini-2.5-flash-image'];
  imageModels = { at: Date.now(), list: list.slice(0, 3) };
  return imageModels.list;
}

const sniff = (buf) => (buf[0] === 0x89 && buf[1] === 0x50 ? 'png' : buf[0] === 0xff && buf[1] === 0xd8 ? 'jpg' : buf.slice(0, 4).toString() === 'RIFF' ? 'webp' : null);

async function geminiImage(prompt) {
  if (!process.env.GEMINI_API_KEY) throw new Error('sem Gemini');
  const base = (process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  let lastErr;
  for (const model of await geminiImageModels()) {
    try {
      const res = await fetch(`${base}/models/${model}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, signal: AbortSignal.timeout(90000),
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error?.message || `Gemini respondeu ${res.status}`);
      const part = (data.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
      if (!part) throw new Error('O Gemini não devolveu imagem');
      const buf = Buffer.from(part.inlineData.data, 'base64');
      return { buf, ext: sniff(buf) || 'png', via: 'Gemini' };
    } catch (err) { lastErr = err; }
  }
  throw lastErr;
}

async function freeImage(prompt) {
  const base = (process.env.IMAGE_API_URL || 'https://image.pollinations.ai/prompt').replace(/\/$/, '');
  const res = await fetch(`${base}/${encodeURIComponent(prompt.slice(0, 600))}?width=1024&height=1024&nologo=true&seed=${Math.floor(Math.random() * 1e6)}`, { signal: AbortSignal.timeout(90000) });
  if (!res.ok) throw new Error(`O gerador gratuito respondeu ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = sniff(buf);
  if (!ext || buf.length < 2000) throw new Error('O gerador gratuito não devolveu uma imagem');
  return { buf, ext, via: 'gerador gratuito (Pollinations)' };
}

export async function generateImage(userId, prompt) {
  const p = String(prompt || '').trim().slice(0, 1500);
  if (!p) throw new Error('Descreva a imagem');
  let out; let first;
  try { out = await geminiImage(p); } catch (err) { first = err; }
  if (!out) {
    try { out = await freeImage(p); }
    catch (err) { throw new Error(`Não consegui gerar a imagem agora (${first && first.message !== 'sem Gemini' ? `${first.message}; ` : ''}${err.message}).`); }
  }
  const file = save(userId, out.ext, out.buf);
  return { file, name: `imagem-${new Date().toISOString().slice(0, 10)}.${out.ext}`, mime: `image/${out.ext === 'jpg' ? 'jpeg' : out.ext}`, size: out.buf.length, via: out.via };
}

// ---------------- Arquivos ----------------
const MIME = {
  txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json', html: 'text/html', pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
export const FILE_FORMATS = Object.keys(MIME);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

// zip simples (sem compressão) para .docx e .xlsx
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files) {
  const parts = []; const central = []; let offset = 0;
  for (const [name, content] of files) {
    const data = Buffer.from(content, 'utf8'); const nm = Buffer.from(name); const crc = crc32(data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(0, 8); h.writeUInt16LE(0, 10); h.writeUInt16LE(0x21, 12);
    h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nm.length, 26);
    parts.push(h, nm, data);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10); c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nm.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, nm);
    offset += 30 + nm.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

// Texto simples com marcações leves: "# Título", "## Subtítulo", "- item", linhas em branco entre parágrafos.
function blocks(text) {
  const out = [];
  for (const raw of String(text).replace(/\r/g, '').split('\n')) {
    const l = raw.replace(/\s+$/, '');
    let m;
    if (!l.trim()) out.push({ t: 'gap' });
    else if ((m = l.match(/^(#{1,3})\s+(.*)$/))) out.push({ t: `h${m[1].length}`, s: m[2].replace(/\*\*/g, '') });
    else if ((m = l.match(/^\s*[-*•]\s+(.*)$/))) out.push({ t: 'li', s: m[1].replace(/\*\*/g, '') });
    else if ((m = l.match(/^\s*(\d+)[.)]\s+(.*)$/))) out.push({ t: 'li', num: true, s: `${m[1]}. ${m[2].replace(/\*\*/g, '')}` });
    else out.push({ t: 'p', s: l.replace(/\*\*/g, '') });
  }
  return out;
}

function docx(text, title) {
  const run = (s, o = {}) => `<w:r><w:rPr>${o.b ? '<w:b/>' : ''}${o.sz ? `<w:sz w:val="${o.sz}"/>` : ''}</w:rPr><w:t xml:space="preserve">${esc(s)}</w:t></w:r>`;
  const para = (s, o = {}) => `<w:p><w:pPr>${o.ind ? `<w:ind w:left="${o.ind}" w:hanging="260"/>` : ''}<w:spacing w:after="${o.after ?? 120}"/></w:pPr>${run(s, o)}</w:p>`;
  const body = blocks(text).map((b) => (b.t === 'gap' ? '' : b.t === 'h1' ? para(b.s, { b: 1, sz: 36, after: 200 }) : b.t === 'h2' ? para(b.s, { b: 1, sz: 28, after: 160 }) : b.t === 'h3' ? para(b.s, { b: 1, sz: 24 })
    : b.t === 'li' ? para(`${b.num ? '' : '•  '}${b.s}`, { ind: 540 }) : para(b.s))).join('');
  const titleP = title ? para(title, { b: 1, sz: 40, after: 240 }) : '';
  return zip([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${titleP}${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`],
  ]);
}

function parseTable(text) {
  const t = String(text).trim();
  if (t.startsWith('[')) { try { const j = JSON.parse(t); if (Array.isArray(j)) return j.map((r) => (Array.isArray(r) ? r : Object.values(r))); } catch { /* segue como texto */ } }
  const lines = t.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  const delim = [';', '\t', ','].map((d) => [d, (lines[0]?.split(d).length || 1)]).sort((a, b) => b[1] - a[1])[0][0];
  return lines.map((l) => {
    const cells = []; let cur = ''; let q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (ch === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (ch === delim && !q) { cells.push(cur); cur = ''; } else cur += ch;
    }
    cells.push(cur);
    return cells.map((c) => c.trim());
  });
}
const colName = (i) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

function xlsx(text, sheetName) {
  const rows = parseTable(text).slice(0, 5000);
  const num = (v) => (typeof v === 'number' ? v : /^-?\d{1,15}([.,]\d+)?$/.test(String(v).trim()) ? Number(String(v).replace(',', '.')) : null);
  const sheet = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
    const ref = `${colName(ci)}${ri + 1}`; const n = ri === 0 ? null : num(v);
    return n !== null ? `<c r="${ref}"><v>${n}</v></c>` : `<c r="${ref}" t="inlineStr"${ri === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const cols = Math.max(1, ...rows.map((r) => r.length));
  return zip([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(String(sheetName || 'Planilha').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
    ['xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="${cols}" width="22" customWidth="1"/></cols><sheetData>${sheet}</sheetData></worksheet>`],
  ]);
}

// PDF simples (Helvetica, A4, várias páginas) escrito à mão: não depende de nenhuma biblioteca.
const W = { ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191, '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611, '[': 278, '\\': 278, ']': 278, '^': 469, _: 556, '`': 333,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500, '{': 334, '|': 260, '}': 334, '~': 584 };
const CP1252 = { '€': 0x80, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '…': 0x85, '™': 0x99 };
const charWidth = (ch) => { if (/\d/.test(ch)) return 556; const base = ch.normalize('NFD')[0]; return W[base] ?? 556; };
function toWinAnsi(s) {
  const out = [];
  for (const ch of String(s).normalize('NFC')) {
    const c = ch.codePointAt(0);
    if (CP1252[ch]) out.push(CP1252[ch]); else if (c >= 32 && c < 127) out.push(c); else if (c >= 160 && c <= 255) out.push(c); else if (c === 9) out.push(32, 32, 32, 32); else if (c > 255) out.push(63);
  }
  return Buffer.from(out);
}
const pdfEsc = (buf) => Buffer.from(buf.toString('latin1').replace(/([\\()])/g, '\\$1'), 'latin1');

function pdf(text, title) {
  const PAGE_W = 595; const PAGE_H = 842; const M = 56; const maxW = PAGE_W - 2 * M;
  const style = { h1: [20, 1, 12], h2: [15, 1, 9], h3: [12.5, 1, 7], p: [11, 0, 5], li: [11, 0, 3] };
  const lines = []; // {size,bold,x,text,gap}
  const addTitle = title ? [{ t: 'h1', s: title }] : [];
  for (const b of [...addTitle, ...blocks(text)]) {
    if (b.t === 'gap') { lines.push({ size: 11, gap: 6, text: '' }); continue; }
    const [size, bold, after] = style[b.t];
    const indent = b.t === 'li' ? 16 : 0;
    const words = (b.t === 'li' && !b.num ? `•  ${b.s}` : b.s).split(/\s+/).filter(Boolean);
    let cur = ''; let w = 0; const first = lines.length;
    const mult = bold ? 1.06 : 1;
    const sp = 278 * size / 1000;
    for (const word of words) {
      const ww = [...word].reduce((a, ch) => a + charWidth(ch), 0) * size / 1000 * mult;
      if (!cur) { cur = word; w = ww; }
      else if (w + sp + ww > maxW - indent) { lines.push({ size, bold, x: M + (b.t === 'li' && lines.length > first ? 14 : 0), text: cur, indent }); cur = word; w = ww; }
      else { cur += ` ${word}`; w += sp + ww; }
    }
    if (cur) lines.push({ size, bold, x: M + (b.t === 'li' && lines.length > first ? 14 : 0), text: cur, indent });
    if (lines.length) lines[lines.length - 1].gap = after;
  }
  const pages = []; let content = []; let y = PAGE_H - M;
  const flush = () => { pages.push(content); content = []; y = PAGE_H - M; };
  for (const l of lines) {
    const lead = l.size * 1.3;
    if (!l.text) { y -= l.gap || 6; continue; }
    if (y - lead < M) flush();
    y -= lead;
    content.push(`BT /${l.bold ? 'F2' : 'F1'} ${l.size} Tf ${(l.x + (l.indent || 0)).toFixed(1)} ${y.toFixed(1)} Td (${pdfEsc(toWinAnsi(l.text)).toString('latin1')}) Tj ET`);
    y -= l.gap || 0;
  }
  if (content.length || !pages.length) flush();
  // objetos: 1 catálogo, 2 páginas, 3 e 4 fontes, depois (página, conteúdo) para cada página
  const objs = [];
  const n = pages.length;
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ')}] /Count ${n} >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  pages.forEach((c, i) => {
    const stream = Buffer.from(c.join('\n'), 'latin1');
    objs[5 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`;
    objs[6 + i * 2] = { stream };
  });
  const chunks = [Buffer.from('%PDF-1.4\n%âãÏÓ\n', 'latin1')]; const offsets = []; let pos = chunks[0].length;
  for (let i = 1; i < objs.length; i++) {
    const o = objs[i]; offsets[i] = pos;
    const buf = o.stream
      ? Buffer.concat([Buffer.from(`${i} 0 obj\n<< /Length ${o.stream.length} >>\nstream\n`), o.stream, Buffer.from('\nendstream\nendobj\n')])
      : Buffer.from(`${i} 0 obj\n${o}\nendobj\n`);
    chunks.push(buf); pos += buf.length;
  }
  let xref = `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`));
  return Buffer.concat(chunks);
}

const safeName = (n) => String(n || 'arquivo').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'arquivo';

export function createFile(userId, { nome, formato, conteudo, titulo }) {
  const fmt = String(formato || '').toLowerCase().replace(/^\./, '');
  if (!MIME[fmt]) throw new Error(`Formato não suportado. Use: ${FILE_FORMATS.join(', ')}.`);
  const text = String(conteudo ?? '');
  if (!text.trim()) throw new Error('O conteúdo do arquivo está vazio');
  if (text.length > 300000) throw new Error('Conteúdo grande demais (máximo 300 mil caracteres)');
  const base = safeName(String(nome || titulo || 'arquivo').replace(/\.[a-z0-9]{2,5}$/i, ''));
  let buf;
  if (fmt === 'pdf') buf = pdf(text, titulo);
  else if (fmt === 'docx') buf = docx(text, titulo);
  else if (fmt === 'xlsx') buf = xlsx(text, titulo || base);
  else if (fmt === 'csv') buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]); // BOM: o Excel abre acentos certinho
  else buf = Buffer.from(text, 'utf8');
  const file = save(userId, fmt, buf);
  return { file, name: `${base}.${fmt}`, mime: MIME[fmt], size: buf.length };
}
