// Pesquisa na web e leitura de páginas para a IA do chat.
// Pesquisa: Google (pelo próprio Gemini, que devolve as fontes) ou DuckDuckGo quando não houver Gemini.
// Leitura de páginas: só endereços públicos (bloqueia localhost, rede interna e redirecionamentos para eles).
import dns from 'node:dns/promises';
import net from 'node:net';

const UA = 'Mozilla/5.0 (compatible; Codeniac/1.8; +assistente-pessoal)';

function privateIp(ip) {
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === '::1' || l === '::' || l.startsWith('fe80') || l.startsWith('fc') || l.startsWith('fd')) return true;
    const m = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return m ? privateIp(m[1]) : false;
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

// Confere o endereço (e o que ele resolve) antes de qualquer acesso.
export async function assertPublicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { throw new Error('Endereço inválido'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Só abro endereços http e https');
  if (u.username || u.password) throw new Error('Endereço com senha não é permitido');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (process.env.CODENIAC_ALLOW_LOCAL_FETCH === '1') return u; // só para testes automáticos
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new Error('Esse endereço não é público');
  const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((r) => r.address);
  if (!ips.length || ips.some(privateIp)) throw new Error('Esse endereço não é público');
  return u;
}

async function guardedFetch(url, opts = {}, hops = 4) {
  let current = url;
  for (let i = 0; i <= hops; i++) {
    const u = await assertPublicUrl(current);
    const res = await fetch(u, { ...opts, redirect: 'manual', headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8', ...(opts.headers || {}) }, signal: AbortSignal.timeout(15000) });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { current = new URL(res.headers.get('location'), u).href; continue; }
    return res;
  }
  throw new Error('Redirecionamentos demais');
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', ccedil: 'ç', atilde: 'ã', otilde: 'õ', aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú', acirc: 'â', ecirc: 'ê', ocirc: 'ô' };
export const decodeEntities = (s) => String(s).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
  return ENT[e.toLowerCase()] ?? m;
});

function htmlToText(html) {
  let t = html.replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  t = t.replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ');
  return decodeEntities(t).replace(/[ \t\f\v]+/g, ' ').replace(/\n\s*\n\s*/g, '\n\n').trim();
}

export async function fetchPageText(url, maxChars = 9000) {
  const res = await guardedFetch(url);
  if (!res.ok) throw new Error(`A página respondeu ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!/text\/|json|xml/i.test(type)) throw new Error(`Não consigo ler esse tipo de conteúdo (${type.split(';')[0] || 'desconhecido'})`);
  const chunks = []; let size = 0;
  for await (const c of res.body) { size += c.length; chunks.push(c); if (size > 1_500_000) break; }
  const raw = Buffer.concat(chunks).toString('utf8');
  const title = decodeEntities((raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim());
  const text = /html/i.test(type) ? htmlToText(raw) : raw;
  return { url: String(res.url || url), title, text: text.slice(0, maxChars), truncated: text.length > maxChars };
}

// ---------- pesquisa ----------
async function googleSearch(query) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('sem Gemini');
  let lastErr;
  for (const model of ['gemini-flash-latest', 'gemini-flash-lite-latest']) {
    try {
      const base = (process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
      const res = await fetch(`${base}/models/${model}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, signal: AbortSignal.timeout(40000),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: 'Pesquise na web e responda de forma factual, objetiva e completa, em português do Brasil (ou no idioma da pergunta), com datas e números quando houver.' }] },
          contents: [{ role: 'user', parts: [{ text: query }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.3, maxOutputTokens: 1800 },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error?.message || `Google respondeu ${res.status}`);
      const cand = data.candidates?.[0];
      const answer = (cand?.content?.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('').trim();
      const sources = (cand?.groundingMetadata?.groundingChunks || []).map((c) => c.web).filter((w) => w?.uri).map((w) => ({ titulo: w.title || new URL(w.uri).hostname, url: w.uri }));
      if (!answer) throw new Error('Pesquisa sem resposta');
      return { fonte: 'google', resumo: answer, resultados: dedupe(sources) };
    } catch (err) { lastErr = err; }
  }
  throw lastErr;
}

const dedupe = (list) => { const seen = new Set(); return list.filter((r) => (seen.has(r.url) ? false : seen.add(r.url))); };

async function duckSearch(query) {
  const base = process.env.DDG_URL || 'https://html.duckduckgo.com/html/';
  const res = await fetch(`${base}?q=${encodeURIComponent(query)}&kl=br-pt`, { headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`A busca respondeu ${res.status}`);
  const html = await res.text();
  const out = [];
  const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>|<div[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>)?/gi;
  let m;
  while ((m = re.exec(html)) && out.length < 8) {
    let href = decodeEntities(m[1]);
    const u = href.match(/[?&]uddg=([^&]+)/);
    if (u) href = decodeURIComponent(u[1]);
    if (href.startsWith('//')) href = `https:${href}`;
    if (!/^https?:\/\//.test(href) || /duckduckgo\.com\/y\.js/.test(href)) continue;
    const strip = (x) => decodeEntities(String(x || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    out.push({ titulo: strip(m[2]), url: href, trecho: strip(m[3] || m[4]).slice(0, 300) });
  }
  if (!out.length) throw new Error('Nenhum resultado encontrado');
  return { fonte: 'duckduckgo', resultados: dedupe(out) };
}

export async function searchWeb(query) {
  const q = String(query || '').trim().slice(0, 300);
  if (!q) throw new Error('Diga o que pesquisar');
  let first;
  try { return await googleSearch(q); } catch (err) { first = err; }
  try { return await duckSearch(q); } catch (err) { throw new Error(`Não consegui pesquisar agora (${first?.message === 'sem Gemini' ? '' : `${first?.message}; `}${err.message}).`); }
}
