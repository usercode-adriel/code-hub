// LEITOR DE ZIP seguro, sem dependências. Pacotes de assets são tratados como dado não confiável:
//  - nada é executado; só lemos bytes e gravamos tipos permitidos (PNG e textos de licença);
//  - nomes com "..", barra inicial, unidade (C:), barra invertida ou bytes nulos são recusados (zip-slip);
//  - limites de quantidade de arquivos, tamanho por arquivo e tamanho total descompactado (proteção contra zip-bomb);
//  - executáveis e scripts são listados como "ignorados" e jamais gravados.
import zlib from 'node:zlib';

export const LIMITES = { entradas: 1500, porArquivo: 12 * 1024 * 1024, total: 96 * 1024 * 1024 };
const PERIGOSOS = /\.(exe|dll|bat|cmd|com|msi|scr|ps1|psm1|vbs|vbe|js|mjs|cjs|jar|sh|bash|py|rb|pl|php|app|dmg|apk|lnk|hta|wsf)$/i;
export const nomeSeguro = (n) => !(!n || n.includes('\0') || n.includes('\\') || n.startsWith('/') || /^[a-zA-Z]:/.test(n) || n.split('/').some((p) => p === '..'));

const u16 = (b, o) => b.readUInt16LE(o);
const u32 = (b, o) => b.readUInt32LE(o);

/** Lê o diretório central. Devolve a lista de entradas (sem descompactar nada). */
export function listarZip(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new Error('Arquivo ZIP inválido.');
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (u32(buf, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Arquivo ZIP inválido (sem diretório central).');
  const total = u16(buf, eocd + 10); const tamCentral = u32(buf, eocd + 12); let pos = u32(buf, eocd + 16);
  if (total > LIMITES.entradas) throw new Error(`ZIP com arquivos demais (limite ${LIMITES.entradas}).`);
  if (pos + tamCentral > buf.length) throw new Error('Arquivo ZIP corrompido.');
  const entradas = [];
  for (let k = 0; k < total; k++) {
    if (u32(buf, pos) !== 0x02014b50) throw new Error('Arquivo ZIP corrompido (entrada inválida).');
    const flags = u16(buf, pos + 8); const metodo = u16(buf, pos + 10); const csize = u32(buf, pos + 20); const usize = u32(buf, pos + 24);
    const nLen = u16(buf, pos + 28); const xLen = u16(buf, pos + 30); const cLen = u16(buf, pos + 32); const ext = u32(buf, pos + 38); const off = u32(buf, pos + 42);
    const nome = buf.slice(pos + 46, pos + 46 + nLen).toString((flags & 0x800) ? 'utf8' : 'latin1');
    const unixModo = (ext >>> 16) & 0xffff;
    entradas.push({ nome, metodo, csize, usize, off, pasta: nome.endsWith('/'), criptografado: Boolean(flags & 1), simbolico: (unixModo & 0xf000) === 0xa000 });
    pos += 46 + nLen + xLen + cLen;
  }
  return entradas;
}

export function lerEntrada(buf, e) {
  if (e.criptografado) throw new Error(`"${e.nome}" está criptografado.`);
  if (e.usize > LIMITES.porArquivo) throw new Error(`"${e.nome}" é grande demais (limite ${LIMITES.porArquivo / 1048576} MB).`);
  if (u32(buf, e.off) !== 0x04034b50) throw new Error(`"${e.nome}" está corrompido.`);
  const ini = e.off + 30 + u16(buf, e.off + 26) + u16(buf, e.off + 28);
  const dados = buf.slice(ini, ini + e.csize);
  let saida;
  if (e.metodo === 0) saida = dados;
  else if (e.metodo === 8) saida = zlib.inflateRawSync(dados, { maxOutputLength: LIMITES.porArquivo });
  else throw new Error(`"${e.nome}" usa um método de compressão não suportado.`);
  if (saida.length > LIMITES.porArquivo) throw new Error(`"${e.nome}" é grande demais.`);
  return saida;
}

/**
 * Extrai só o que é permitido. Devolve { png: [{nome, dados}], textos: [{nome, texto}], ignorados: [{nome, motivo}] }.
 * `ler` = false apenas lista (sem descompactar), para a prévia barata.
 */
export function extrairPermitidos(buf, { ler = true } = {}) {
  const png = []; const textos = []; const ignorados = []; let total = 0;
  for (const e of listarZip(buf)) {
    if (e.pasta) continue;
    if (!nomeSeguro(e.nome)) { ignorados.push({ nome: e.nome, motivo: 'nome inseguro' }); continue; }
    if (e.simbolico) { ignorados.push({ nome: e.nome, motivo: 'link simbólico' }); continue; }
    if (/(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)/i.test(e.nome)) continue;
    if (PERIGOSOS.test(e.nome)) { ignorados.push({ nome: e.nome, motivo: 'tipo executável/script (nunca gravado)' }); continue; }
    const ehPng = /\.png$/i.test(e.nome); const ehTexto = /(^|\/)(license|licence|licen[cç]a|readme|credits|attribution|copying)[^/]*\.(txt|md)$|\.(txt|md)$/i.test(e.nome) && e.usize <= 200_000;
    if (!ehPng && !ehTexto) { ignorados.push({ nome: e.nome, motivo: 'tipo não suportado' }); continue; }
    total += e.usize;
    if (total > LIMITES.total) throw new Error(`O pacote descompactado passa de ${LIMITES.total / 1048576} MB.`);
    if (!ler) { (ehPng ? png : textos).push({ nome: e.nome, tamanho: e.usize }); continue; }
    try {
      const dados = lerEntrada(buf, e);
      if (ehPng) png.push({ nome: e.nome, dados }); else textos.push({ nome: e.nome, texto: dados.toString('utf8') });
    } catch (err) { ignorados.push({ nome: e.nome, motivo: err.message }); }
  }
  return { png, textos, ignorados };
}
