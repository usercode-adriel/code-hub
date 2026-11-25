// INSPETOR DE PNG (sem dependências): confere a assinatura e lê o cabeçalho para extrair dimensões, transparência e profundidade.
// Não decodifica pixels: só valida e descreve. Arquivos que não são PNG de verdade são recusados.
import zlib from 'node:zlib';

const ASSINATURA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const MAX_DIM = 8192;

export function inspecionarPng(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 33 || !buf.slice(0, 8).equals(ASSINATURA)) throw new Error('O arquivo não é um PNG válido.');
  if (buf.readUInt32BE(8) !== 13 || buf.slice(12, 16).toString('ascii') !== 'IHDR') throw new Error('PNG inválido (sem cabeçalho IHDR).');
  const largura = buf.readUInt32BE(16); const altura = buf.readUInt32BE(20); const profundidade = buf[24]; const tipoCor = buf[25];
  if (!largura || !altura || largura > MAX_DIM || altura > MAX_DIM) throw new Error(`Dimensões inválidas (máximo ${MAX_DIM}×${MAX_DIM}).`);
  let tRNS = false;
  for (let pos = 8; pos + 12 <= buf.length;) {
    const len = buf.readUInt32BE(pos); const tipo = buf.slice(pos + 4, pos + 8).toString('ascii');
    if (tipo === 'tRNS') tRNS = true;
    if (tipo === 'IDAT' || tipo === 'IEND') break;
    pos += 12 + len;
  }
  const alfa = tipoCor === 4 || tipoCor === 6;
  return { largura, altura, profundidade, tipoCor, transparencia: alfa || tRNS, proporcao: Math.round((largura / altura) * 1000) / 1000, bytes: buf.length };
}

/** Sugere a grade de quadros de uma spritesheet. É só uma sugestão: o usuário confirma ou ajusta. */
export function sugerirGrade(largura, altura) {
  const candidatos = [16, 24, 32, 48, 64, 96, 128, 192, 256];
  let melhor = null;
  for (const lado of candidatos) {
    if (largura % lado === 0 && altura % lado === 0) {
      const cols = largura / lado; const lins = altura / lado;
      if (cols * lins > 1 && (!melhor || cols * lins < melhor.colunas * melhor.linhas + 1 && lado > melhor.quadroL)) melhor = { quadroL: lado, quadroA: lado, colunas: cols, linhas: lins };
    }
  }
  return melhor || { quadroL: largura, quadroA: altura, colunas: 1, linhas: 1 };
}

// (usado nos testes) monta um PNG RGBA mínimo, para não depender de arquivos externos
export function criarPngRGBA(largura, altura, pixel = [255, 0, 0, 255]) {
  const crc = (b) => zlib.crc32(b) >>> 0;
  const chunk = (tipo, dados) => { const t = Buffer.from(tipo, 'ascii'); const len = Buffer.alloc(4); len.writeUInt32BE(dados.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, dados]))); return Buffer.concat([len, t, dados, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(largura, 0); ihdr.writeUInt32BE(altura, 4); ihdr[8] = 8; ihdr[9] = 6;
  const linha = Buffer.concat([Buffer.from([0]), Buffer.concat(Array.from({ length: largura }, () => Buffer.from(pixel)))]);
  const bruto = Buffer.concat(Array.from({ length: altura }, () => linha));
  return Buffer.concat([ASSINATURA, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(bruto)), chunk('IEND', Buffer.alloc(0))]);
}
