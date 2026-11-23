// STRUCTURE STUDIO: prefab (módulo puro, sem DOM). Calcula, a partir de uma estrutura montada, tudo o que o prefab preserva:
// imagem (limites), área ocupada no chão, colisões, pontos de entrada, materiais e a lista de componentes (para editar depois).
// O servidor recalcula isto da estrutura salva: o cliente só envia a imagem "assada" (PNG), nunca os números.
// Coordenadas da pegada, das colisões e das entradas são relativas ao PIVÔ do prefab: centro da base da pegada.
import { larguraVisual, alturaVisual, pegada, ordemDeDesenho } from './montagem.js';

export const MAX_IMAGEM = 4096;
const ENTRADA_SUBS = new Set(['porta', 'entrada-saida', 'portao']);
const rad = (g) => g * Math.PI / 180;

// retângulo desenhado de uma peça (com rotação e altura z), em coordenadas do mundo: os 4 cantos
export function cantosDesenhados(i, c) {
  const w = larguraVisual(i, c); const h = alturaVisual(i, c);
  const ox = i.x; const oy = i.y - (i.z || 0); const t = rad(i.rot || 0);
  return [[-w / 2, -h], [w / 2, -h], [w / 2, 0], [-w / 2, 0]].map(([lx, ly]) => ({ x: ox + lx * Math.cos(t) - ly * Math.sin(t), y: oy + lx * Math.sin(t) + ly * Math.cos(t) }));
}

export function limitesDe(instancias, compDe) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const i of instancias) {
    const c = compDe(i.comp); if (!c) continue;
    for (const p of cantosDesenhados(i, c)) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  }
  if (!Number.isFinite(x0)) return null;
  x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.ceil(x1); y1 = Math.ceil(y1);
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

// união das pegadas das peças que formam o edifício (base, fachada, cobertura); sem elas, de tudo
function pegadaTotal(instancias, compDe) {
  const estrut = instancias.filter((i) => ['base', 'fachada', 'cobertura'].includes(i.camada) && compDe(i.comp));
  const lista = estrut.length ? estrut : instancias.filter((i) => compDe(i.comp));
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const i of lista) { const p = pegada(i, compDe(i.comp)); x0 = Math.min(x0, p.x0); y0 = Math.min(y0, p.y0); x1 = Math.max(x1, p.x1); y1 = Math.max(y1, p.y1); }
  return { x0, y0, x1, y1 };
}

export function montarPrefab(est, compDe) {
  const lista = est.componentes || [];
  if (!lista.length) throw new Error('a estrutura está vazia');
  if (lista.some((i) => !compDe(i.comp))) throw new Error('há componentes que não estão mais na biblioteca');
  const lim = limitesDe(lista, compDe);
  if (!lim || lim.w < 4 || lim.h < 4) throw new Error('a estrutura não tem tamanho');
  if (lim.w > MAX_IMAGEM || lim.h > MAX_IMAGEM) throw new Error(`a estrutura passa de ${MAX_IMAGEM} px e não cabe numa imagem de prefab`);
  const p = pegadaTotal(lista, compDe);
  const pivo = { x: (p.x0 + p.x1) / 2, y: p.y1 };
  const rel = (x, y) => ({ x: Math.round((x - pivo.x) * 10) / 10, y: Math.round((y - pivo.y) * 10) / 10 });

  // colisões: caixa de cada componente com colisão ligada (a caixa do componente, na escala e no lugar da peça)
  const colisoes = [];
  for (const i of lista) {
    const c = compDe(i.comp);
    if (!i.colisao || c.colisao?.tipo !== 'caixa') continue;
    const k = c.colisao; const e = i.escala;
    const a = rel(i.x + k.x * e, i.y + k.y * e);
    colisoes.push({ peca: i.id, x: a.x, y: a.y, w: Math.round(k.w * e), h: Math.round(k.h * e) });
  }
  // entradas: portas, portões e entradas/saídas da estrutura, mais as marcadas à mão em logica.entradas
  const entradas = [];
  for (const i of lista) {
    const c = compDe(i.comp);
    if (ENTRADA_SUBS.has(c.sub)) entradas.push({ id: i.id, tipo: c.sub, nome: i.nome || '', ...rel(i.x, i.y) });
  }
  for (const m of est.logica?.entradas || []) if (Number.isFinite(m.x) && Number.isFinite(m.y)) entradas.push({ id: String(m.id || `manual-${entradas.length}`), tipo: 'manual', nome: String(m.nome || '').slice(0, 60), x: Math.round(m.x), y: Math.round(m.y) });

  const materiais = [...new Set(lista.map((i) => i.material || compDe(i.comp).material))].sort();
  const camadas = [...new Set(lista.map((i) => i.camada))];
  return {
    versao: 1, preset: est.preset, tipo: est.tipo,
    imagem: { w: lim.w, h: lim.h, origem: { x: lim.x0, y: lim.y0 }, pivo: { x: (pivo.x - lim.x0) / lim.w, y: (pivo.y - lim.y0) / lim.h } },
    pegada: { ...rel(p.x0, p.y0), w: Math.round(p.x1 - p.x0), d: Math.round(p.y1 - p.y0) },
    colisoes, entradas,
    componentes: ordemDeDesenho(lista).map((i) => ({ ...i })),
    metadados: { total: lista.length, materiais, camadas, grupos: new Set(lista.filter((i) => i.grupo).map((i) => i.grupo)).size },
    logica: { ...(est.logica || {}), entradas: est.logica?.entradas || [] },
  };
}
