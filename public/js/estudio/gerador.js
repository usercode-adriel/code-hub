// STRUCTURE STUDIO: geração de assets por IA (módulo puro, sem DOM nem rede; usado pelo servidor, pelo navegador e pelos testes).
//  - montarPromptImagem: o pedido do usuário + o padrão visual do jogo + o papel de cada imagem de referência
//  - capacidadesDoModelo: lê o que o OpenRouter DECLARA do modelo (entradas e saídas); o que não é declarado fica "desconhecido",
//    nunca presumido. Transparência não é declarada por API nenhuma: o fundo é removido por chave de cor depois (removerFundo).
//  - removerFundo / recortar / temAlfaNativo: trabalham em RGBA bruto (Uint8ClampedArray), por isso rodam em qualquer lugar.
import { CATEGORIAS } from './presets.js';

export const PAPEIS = { perspectiva: 'perspectiva', material: 'material', estilo: 'estilo arquitetônico', composicao: 'composição' };
export const MAX_REFERENCIAS = 4;
export const COR_CHAVE = [255, 0, 255]; // fundo pedido ao modelo: magenta chapado, fácil de remover

const PADRAO_VISUAL = 'Pre-rendered 3D architectural miniature asset: photorealistic materials and textures, soft studio lighting, subtle contact shadows, fine surface detail, depth. NOT cartoon, NOT pixel art, NOT low-poly, NOT a flat illustration.';
const CAMERA = {
  arq25d: 'Elevated camera looking slightly down at the object: the front facade is fully visible, the sides are partly visible, the top or roof is visible. Consistent perspective, as in a pre-rendered isometric-like game building.',
  topo: 'Strict top-down orthographic view, as seen from directly above. Geometry must be exact and straight, edges aligned to the image axes.',
  ambas: 'Neutral, evenly lit view.',
};
// dica por subcategoria: o que o recorte precisa ser para servir como peça modular
const DICA_SUB = {
  parede: 'A single straight wall module, flat front face, edges that can repeat side by side without a visible seam.',
  janela: 'A single window module on its own, frontal view, with its frame; no wall around it.',
  porta: 'A single door on its own, frontal view, with its frame and handle; no wall around it.',
  vitrine: 'A single shop display window module, frontal view.', 'fachada-envidracada': 'A glass curtain-wall facade module, frontal view, edges that repeat side by side.',
  'telhado-plano': 'A flat roof section seen from the elevated camera, with parapet edge.', 'telhado-inclinado': 'A pitched roof section seen from the elevated camera.',
  'cobertura-metalica': 'A metal canopy or metal roof section seen from the elevated camera.', 'ar-condicionado': 'A single rooftop air-conditioning unit.', antena: 'A single antenna mast.',
  palmeira: 'A single palm tree, whole, with its trunk base at the bottom center.', arvore: 'A single tree, whole, with its trunk base at the bottom center.',
  vaga: 'A single parking space with painted lines, top-down.', calcada: 'A sidewalk section with paving stones and curb.', reta: 'A straight road section with lane markings.',
};

// O prompt final. As imagens de referência entram na mesma ordem em que são enviadas ao modelo.
export function montarPromptImagem({ descricao, sub, categoria, perspectiva = 'arq25d', referencias = [] }) {
  const nomeSub = CATEGORIAS[categoria]?.sub[sub] || sub || 'object';
  const partes = [
    `Create ONE isolated game asset: ${String(descricao || '').trim() || nomeSub}.`,
    `Asset type: ${nomeSub}. ${DICA_SUB[sub] || ''}`.trim(),
    PADRAO_VISUAL, CAMERA[perspectiva] || CAMERA.arq25d,
    `Background: a perfectly flat solid magenta color (#FF00FF) filling the whole image around the object, with no gradient, no floor, no cast shadow on the background, and no magenta inside the object. No text, no watermark, no frame, no extra objects.`,
  ];
  if (referencias.length) {
    partes.push('Reference images are attached in this order:');
    referencias.forEach((r, k) => partes.push(`Image ${k + 1}: ${PAPEIS[r.tipo] || 'referência'} reference${r.tipo === 'perspectiva' ? ' (match this camera angle and perspective exactly)' : r.tipo === 'material' ? ' (reproduce these materials and textures)' : r.tipo === 'estilo' ? ' (follow this architectural style)' : r.tipo === 'composicao' ? ' (follow this composition and proportions)' : ''}.`));
    partes.push('Use the references for what they are labeled; do not copy unrelated elements or any background from them.');
  }
  return partes.join('\n');
}

// O que o OpenRouter declara do modelo (objeto de /models). null = não declarado (desconhecido).
export function capacidadesDoModelo(m) {
  const arq = m?.architecture || {};
  const ent = Array.isArray(arq.input_modalities) ? arq.input_modalities : (typeof arq.modality === 'string' ? arq.modality.split('->')[0].split('+') : null);
  const sai = Array.isArray(arq.output_modalities) ? arq.output_modalities : (typeof arq.modality === 'string' && arq.modality.includes('->') ? arq.modality.split('->')[1].split('+') : null);
  return {
    id: m?.id, nome: m?.name || m?.id, saidas: sai,
    geraImagem: sai ? sai.includes('image') : null,
    aceitaReferencia: ent ? ent.includes('image') : null,
    // nenhuma API declara quantas referências um modelo aceita nem se ele devolve transparência: fica desconhecido
    multiplasReferencias: null, transparencia: null,
  };
}
export const geraImagem = (m) => capacidadesDoModelo(m).geraImagem === true;

// ---------------------------------------------------------------------------------------------------------------------
// Imagem: transparência nativa, remoção de fundo por chave de cor e recorte. Trabalham em RGBA (Uint8ClampedArray).
// ---------------------------------------------------------------------------------------------------------------------
export function temAlfaNativo(rgba, minimo = 0.01) {
  let n = 0; const total = rgba.length / 4;
  for (let p = 3; p < rgba.length; p += 4) if (rgba[p] < 250) n++;
  return n / total >= minimo;
}

const dist = (r, g, b, c) => Math.hypot(r - c[0], g - c[1], b - c[2]);

// cor do fundo: a mais comum entre os pixels da borda (o modelo raramente devolve exatamente #FF00FF)
export function corDoFundo(rgba, w, h) {
  const cont = new Map();
  const ver = (x, y) => { const i = (y * w + x) * 4; const k = `${rgba[i] >> 3},${rgba[i + 1] >> 3},${rgba[i + 2] >> 3}`; const e = cont.get(k) || { n: 0, r: 0, g: 0, b: 0 }; e.n++; e.r += rgba[i]; e.g += rgba[i + 1]; e.b += rgba[i + 2]; cont.set(k, e); };
  for (let x = 0; x < w; x++) { ver(x, 0); ver(x, h - 1); }
  for (let y = 0; y < h; y++) { ver(0, y); ver(w - 1, y); }
  const melhor = [...cont.values()].sort((a, b) => b.n - a.n)[0];
  return [Math.round(melhor.r / melhor.n), Math.round(melhor.g / melhor.n), Math.round(melhor.b / melhor.n)];
}

// Torna transparente o fundo CONECTADO às bordas (inundação), então um pixel da cor do fundo dentro do objeto fica. Suaviza a borda.
export function removerFundo(rgba, w, h, { tolerancia = 70, cor = null } = {}) {
  const saida = new Uint8ClampedArray(rgba);
  const fundo = cor || corDoFundo(saida, w, h);
  const visto = new Uint8Array(w * h); const pilha = [];
  const proximo = (i) => dist(saida[i * 4], saida[i * 4 + 1], saida[i * 4 + 2], fundo) <= tolerancia;
  const empurra = (x, y) => { const i = y * w + x; if (!visto[i] && proximo(i)) { visto[i] = 1; pilha.push(i); } };
  for (let x = 0; x < w; x++) { empurra(x, 0); empurra(x, h - 1); }
  for (let y = 0; y < h; y++) { empurra(0, y); empurra(w - 1, y); }
  while (pilha.length) {
    const i = pilha.pop(); const x = i % w; const y = (i - x) / w;
    if (x > 0) empurra(x - 1, y); if (x < w - 1) empurra(x + 1, y); if (y > 0) empurra(x, y - 1); if (y < h - 1) empurra(x, y + 1);
  }
  let removidos = 0;
  for (let i = 0; i < visto.length; i++) if (visto[i]) { saida[i * 4 + 3] = 0; removidos++; }
  // borda: pixels do objeto vizinhos do fundo perdem a "contaminação" da cor do fundo (alfa parcial pela distância)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (visto[i]) continue;
    const viz = (x > 0 && visto[i - 1]) || (x < w - 1 && visto[i + 1]) || (y > 0 && visto[i - w]) || (y < h - 1 && visto[i + w]);
    if (!viz) continue;
    const d = dist(saida[i * 4], saida[i * 4 + 1], saida[i * 4 + 2], fundo);
    if (d < tolerancia * 1.8) saida[i * 4 + 3] = Math.round(Math.min(255, Math.max(0, ((d - tolerancia) / (tolerancia * 0.8)) * 255)));
  }
  return { rgba: saida, removidos, fundo, total: w * h };
}

// caixa do objeto (alfa > limite) com uma folga; devolve os pixels recortados
export function recortar(rgba, w, h, { folga = 2, limite = 8 } = {}) {
  let x0 = w; let y0 = h; let x1 = -1; let y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rgba[(y * w + x) * 4 + 3] > limite) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - folga); y0 = Math.max(0, y0 - folga); x1 = Math.min(w - 1, x1 + folga); y1 = Math.min(h - 1, y1 + folga);
  const nw = x1 - x0 + 1; const nh = y1 - y0 + 1; const out = new Uint8ClampedArray(nw * nh * 4);
  for (let y = 0; y < nh; y++) out.set(rgba.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x0 + nw) * 4), y * nw * 4);
  return { rgba: out, w: nw, h: nh };
}

// pipeline completo: usa a transparência nativa se existir; senão remove o fundo; recorta. Devolve o que foi feito, para mostrar ao usuário.
export function prepararAsset(rgba, w, h, { tolerancia = 70, remover = true } = {}) {
  const nativo = temAlfaNativo(rgba);
  let dados = rgba; let info = { transparencia: nativo ? 'nativa' : 'nenhuma', removidos: 0 };
  if (!nativo && remover) {
    const r = removerFundo(rgba, w, h, { tolerancia });
    if (r.removidos / r.total < 0.03) info = { transparencia: 'nenhuma', removidos: r.removidos, aviso: 'quase nada foi removido: o fundo não parece uma cor chapada' };
    else if (r.removidos / r.total > 0.97) return { erro: 'o fundo ocupou quase a imagem inteira: tente uma tolerância menor' };
    else { dados = r.rgba; info = { transparencia: 'removida', removidos: r.removidos, fundo: r.fundo }; }
  }
  const c = recortar(dados, w, h);
  if (!c) return { erro: 'a imagem ficou vazia' };
  return { rgba: c.rgba, w: c.w, h: c.h, info };
}
