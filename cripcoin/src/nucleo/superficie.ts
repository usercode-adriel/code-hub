// GEOMETRIA DE OBJETOS: escala individual, pegada (colisão) escalada, retângulo do sprite, superfícies de apoio (mesas, estantes, armários)
// e fixação em parede. Tudo em TILES (1 tile = 32 px lógicos = 64 px de arte). Nada aqui conhece o canvas: serve ao renderer, às regras e aos testes.
import { item } from '../dados/catalogo';
import { ART_POR_TILE, dimSprite } from '../dados/propriedades';
import type { ItemDef, ObjetoColocado, Projeto, Retangulo } from '../tipos';

export const RODAPE = 7 / 32;                                              // faixa do rodapé da parede (tiles)
const ROT_DIR = ['S', 'E', 'N', 'W'] as const;
/** Sprite (e espelhamento) correspondente à rotação do objeto. */
export function spriteDe(d: ItemDef, rot: number): { nome: string; espelhar: boolean } {
  const v = d.variantes?.[ROT_DIR[rot % 4]]; if (v) return { nome: v.sprite, espelhar: !!v.espelhar };
  return { nome: d.sprite, espelhar: d.girar && rot >= 2 };
}
const lim = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
const MIN_DIM = 0.05;

/** Multiplicadores individuais (1 = tamanho padrão do asset), sempre dentro dos limites do asset. */
export const escalaIndividual = (o: ObjetoColocado, d: ItemDef): { ex: number; ey: number } => ({ ex: lim(o.ex ?? 1, d.escala.min, d.escala.max), ey: lim(o.ey ?? o.ex ?? 1, d.escala.min, d.escala.max) });
/** Escala visual final = escala padrão do asset × escala individual. */
export const escalaVisual = (o: ObjetoColocado, d: ItemDef): { sx: number; sy: number } => { const e = escalaIndividual(o, d); return { sx: d.escala.padrao * e.ex, sy: d.escala.padrao * e.ey }; };
export const escalaValida = (d: ItemDef, ex: number, ey: number): boolean => Number.isFinite(ex) && Number.isFinite(ey) && ex >= d.escala.min - 1e-9 && ex <= d.escala.max + 1e-9 && ey >= d.escala.min - 1e-9 && ey <= d.escala.max + 1e-9;

/** Pegada (colisão) em células: cresce/encolhe junto com a escala individual (mínimo 1×1). Itens "sobre" ocupam uma célula de apoio. */
export function tamanhoPegada(o: { rot: number; ex?: number; ey?: number }, d: ItemDef): { w: number; h: number } {
  if (d.camada === 'sobre') return { w: 1, h: 1 };
  const ex = lim(o.ex ?? 1, d.escala.min, d.escala.max); const ey = lim(o.ey ?? o.ex ?? 1, d.escala.min, d.escala.max);
  if (d.camada === 'parede') return { w: Math.max(1, Math.round(d.w * ex)), h: 1 };
  const w0 = Math.max(1, Math.round(d.w * ex)); const h0 = Math.max(1, Math.round(d.h * ey));
  return o.rot % 2 === 1 ? { w: h0, h: w0 } : { w: w0, h: h0 };
}
export interface Ret { left: number; top: number; w: number; h: number }
const tamSprite = (o: ObjetoColocado, d: ItemDef): { w: number; h: number } => { const dm = dimSprite(spriteDe(d, o.rot).nome); const s = escalaVisual(o, d); return { w: (dm.w / ART_POR_TILE) * s.sx, h: (dm.h / ART_POR_TILE) * s.sy }; };

/** Altura (tiles) da face visível da parede. */
export const alturaFace = (p: Pick<Projeto, 'alturaParede'>): number => p.alturaParede;
/** Base (tiles, em Y do mundo) do sprite de um objeto de parede, dada a altura `alt` (0 rodapé .. 1 topo). */
export function baseParede(p: Pick<Projeto, 'alturaParede'>, o: ObjetoColocado, d: ItemDef): number {
  const t = tamSprite(o, d); const livre = Math.max(0, alturaFace(p) - RODAPE - t.h); const alt = lim(o.alt ?? d.alturaPadrao ?? 0.6, 0, 1);
  return o.y + 1 - RODAPE - alt * livre;
}

// ---------- superfícies de apoio ----------
/** Retângulo do sprite (em tiles) de um móvel de piso: centrado na pegada, base alinhada à base da pegada. */
export function retSprite(p: Projeto, o: ObjetoColocado, d: ItemDef): Ret {
  const t = tamSprite(o, d);
  if (d.camada === 'parede') { const w = tamanhoPegada(o, d).w; return { left: o.x + w / 2 - t.w / 2, top: baseParede(p, o, d) - t.h, w: t.w, h: t.h }; }
  if (d.camada === 'sobre') { const a = ancora(p, o); const ax = a?.x ?? o.x + 0.5; const ay = a?.y ?? o.y + 0.5; return { left: ax - t.w / 2, top: ay - t.h, w: t.w, h: t.h }; }
  const f = tamanhoPegada(o, d); return { left: o.x + f.w / 2 - t.w / 2, top: o.y + f.h - t.h, w: t.w, h: t.h };
}
export const apoioDe = (p: Projeto, o: ObjetoColocado): ObjetoColocado | null => (o.sobre ? p.objetos.find((q) => q.id === o.sobre) ?? null : null);
const nivelDe = (suporte: ItemDef, n: number): Retangulo | null => suporte.superficie?.niveis[Math.min(Math.max(0, Math.floor(n)), suporte.superficie.niveis.length - 1)] ?? null;
/** Ponto do mundo (tiles) onde um item está apoiado: a base do seu sprite. */
export function ponto(p: Projeto, suporte: ObjetoColocado, nivel: number, u: number, v: number): { x: number; y: number } | null {
  const ds = item(suporte.def); const r = ds && nivelDe(ds, nivel); if (!ds || !r) return null; const s = retSprite(p, suporte, ds);
  return { x: s.left + (r.x0 + lim(u, 0, 1) * (r.x1 - r.x0)) * s.w, y: s.top + (r.y0 + lim(v, 0, 1) * (r.y1 - r.y0)) * s.h };
}
export function ancora(p: Projeto, o: ObjetoColocado): { x: number; y: number } | null { const s = apoioDe(p, o); return s ? ponto(p, s, o.nivel ?? 0, o.u ?? 0.5, o.v ?? 0.5) : null; }
/** Posição (nível, u, v) mais próxima de um ponto do mundo, sempre dentro de uma área útil. */
export function localizar(p: Projeto, suporte: ObjetoColocado, mx: number, my: number): { nivel: number; u: number; v: number } | null {
  const ds = item(suporte.def); if (!ds?.superficie) return null; const s = retSprite(p, suporte, ds); const fx = (mx - s.left) / s.w; const fy = (my - s.top) / s.h;
  let melhor = 0; let dist = Infinity;
  ds.superficie.niveis.forEach((r, i) => { const d = Math.max(r.y0 - fy, 0, fy - r.y1); if (d < dist) { dist = d; melhor = i; } });
  const r = ds.superficie.niveis[melhor];
  return { nivel: melhor, u: lim((fx - r.x0) / (r.x1 - r.x0), 0, 1), v: lim((fy - r.y0) / (r.y1 - r.y0), 0, 1) };
}
/** Os dois itens disputam o mesmo espaço da superfície? (largura do sprite × profundidade fixa). */
function colidem(p: Projeto, a: ObjetoColocado, da: ItemDef, b: ObjetoColocado, db: ItemDef): boolean {
  if ((a.nivel ?? 0) !== (b.nivel ?? 0)) return false; const pa = ancora(p, a); const pb = ancora(p, b); if (!pa || !pb) return false;
  return Math.abs(pa.x - pb.x) < 0.38 * (tamSprite(a, da).w + tamSprite(b, db).w) && Math.abs(pa.y - pb.y) < 0.16;
}
export interface Veredito { ok: boolean; motivo: string }
/** O item cabe nessa posição da superfície (tipo compatível, dentro da área útil, sem sobrepor outros itens)? */
export function cabeNaSuperficie(p: Projeto, o: ObjetoColocado, d: ItemDef, suporte: ObjetoColocado): Veredito {
  const ds = item(suporte.def); if (!ds?.superficie) return { ok: false, motivo: 'Isto não tem superfície de apoio.' };
  if (!(d.apoio ?? ['mesa']).includes(ds.superficie.tipo)) return { ok: false, motivo: `${d.nome} não fica em ${ds.nome.toLowerCase()} (apoio: ${(d.apoio ?? ['mesa']).join(', ')}).` };
  const t = tamSprite(o, d); const s = retSprite(p, suporte, ds); const r = nivelDe(ds, o.nivel ?? 0)!; const larguraUtil = (r.x1 - r.x0) * s.w;
  if (t.w > larguraUtil * 1.15) return { ok: false, motivo: `${d.nome} é grande demais para esta superfície; reduza a escala.` };
  const outros = p.objetos.filter((q) => q.id !== o.id && q.sobre === suporte.id);
  for (const q of outros) { const dq = item(q.def); if (dq && colidem(p, { ...o, sobre: suporte.id }, d, q, dq)) return { ok: false, motivo: `Sem espaço livre: ${dq.nome} já ocupa este lugar.` }; }
  return { ok: true, motivo: '' };
}
/** Procura a posição livre mais próxima do desejado (varre para os lados e em profundidade). */
export function acharLugar(p: Projeto, o: ObjetoColocado, d: ItemDef, suporte: ObjetoColocado): { nivel: number; u: number; v: number } | null {
  const base = { nivel: o.nivel ?? 0, u: o.u ?? 0.5, v: o.v ?? 0.5 };
  for (const dv of [0, 0.5, -0.5, 1, -1]) for (let i = 0; i <= 12; i++) for (const sg of i === 0 ? [1] : [1, -1]) {
    const c = { nivel: base.nivel, u: lim(base.u + sg * i * 0.07, 0, 1), v: lim(base.v + dv, 0, 1) };
    if (cabeNaSuperficie(p, { ...o, ...c }, d, suporte).ok) return c;
  }
  return null;
}
/** Célula (grid) sob a âncora de um item apoiado. */
export function celulaSob(p: Projeto, o: ObjetoColocado): { x: number; y: number } { const a = ancora(p, o); return a ? { x: Math.floor(a.x), y: Math.floor(Math.min(a.y, a.y) - 0.01) } : { x: o.x, y: o.y }; }

// ---------- parede ----------
/** A célula é uma parede com chão logo ao sul? (a "face" visível onde se fixam relógios, quadros e prateleiras.) */
export const temFace = (p: Projeto, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < p.largura && y + 1 < p.altura && p.paredes[y * p.largura + x] === 1 && p.paredes[(y + 1) * p.largura + x] !== 1 && p.piso[(y + 1) * p.largura + x] !== '' && !p.portas.some((q) => q.x === x && q.y === y);
/** Face de parede sob um ponto do mundo: vale a célula da parede E a faixa vertical visível acima dela. Devolve também a altura `alt` correspondente. */
export function paredeSob(p: Projeto, mx: number, my: number, altura = 0): { x: number; y: number; alt: number } | null {
  const x = Math.floor(mx); const face = alturaFace(p);
  for (let y = Math.floor(my) + Math.ceil(face) + 1; y >= Math.floor(my) - 1; y--) {
    if (!temFace(p, x, y)) continue; const base = y + 1 - RODAPE; const topo = y + 1 - face;
    if (my <= y + 1 + 1e-9 && my >= topo - 1e-9) { const livre = Math.max(0.0001, face - RODAPE - altura); return { x, y, alt: lim((base - (my + altura / 2)) / livre, 0, 1) }; }
  }
  return null;
}
export { MIN_DIM };
