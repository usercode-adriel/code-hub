// ALVO DO PONTEIRO: converte "o mouse está neste ponto do mundo" na posição real de um objeto (célula, fixação na parede, lugar na superfície de um móvel).
// É a mesma regra para o fantasma de colocação, para arrastar objetos e para os testes: o editor não tem offsets escondidos.
import { item } from '../dados/catalogo';
import { celulasDe, podeColocar, type Extra, type Veredito } from './mapa';
import { ART_POR_TILE, dimSprite } from '../dados/propriedades';
import { escalaVisual, localizar, paredeSob, retSprite, spriteDe, tamanhoPegada } from './superficie';
import type { ItemDef, ObjetoColocado, Projeto } from '../tipos';

export interface Alvo { x: number; y: number; extra: Extra; v: Veredito }
const lim = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
/** Célula da pegada de `s` mais próxima de um ponto (o ponto pode estar na parte alta do sprite, acima da pegada). */
function celulaMaisPerto(p: Projeto, s: ObjetoColocado, d: ItemDef, mx: number, my: number): { x: number; y: number } {
  let melhor = { x: s.x, y: s.y }; let dist = Infinity;
  for (const c of celulasDe(s, d)) { const dd = Math.hypot(c.x + 0.5 - mx, c.y + 0.5 - my); if (dd < dist) { dist = dd; melhor = c; } }
  void p; return melhor;
}
/** Resolve a posição de `d` (com `rot` e escala em `extra`) quando o ponteiro está em (mx,my). `ignorar` = objeto que está sendo movido. */
export function alvoDe(p: Projeto, d: ItemDef, mx: number, my: number, rot: number, extra: Extra, ignorar: string | null): Alvo {
  const ex = { ...extra };
  if (d.camada === 'parede') {
    const tmp = { id: ignorar ?? '__novo', def: d.id, x: 0, y: 0, rot: 0 as const, ...ex }; const w = tamanhoPegada(tmp, d).w; const h = (dimSprite(spriteDe(d, 0).nome).h / ART_POR_TILE) * escalaVisual(tmp, d).sy;
    const ps = paredeSob(p, mx, my, h);
    if (ps) { const x = Math.floor(mx - w / 2 + 0.5); ex.alt = ps.alt; return { x, y: ps.y, extra: ex, v: podeColocar(p, d, x, ps.y, 0, ignorar, ex) }; }
    return { x: Math.floor(mx), y: Math.floor(my), extra: ex, v: { ok: false, motivo: 'Aponte para uma parede (qualquer ponto da face visível serve).' } };
  }
  if (d.camada === 'sobre') {
    const s = p.objetos.filter((o) => o.id !== ignorar).filter((o) => { const dd = item(o.def); if (!dd?.superficie) return false; const r = retSprite(p, o, dd); return mx >= r.left - 0.1 && mx <= r.left + r.w + 0.1 && my >= r.top - 0.1 && my <= r.top + r.h + 0.1; })
      .sort((a, b) => (item(b.def)!.superficie!.niveis[0].y0 - item(a.def)!.superficie!.niveis[0].y0) || 0)[0];
    if (!s) return { x: Math.floor(mx), y: Math.floor(my), extra: ex, v: { ok: false, motivo: 'Aponte para uma mesa, estante ou armário.' } };
    const ds = item(s.def)!; const l = localizar(p, s, mx, my); if (l) { ex.nivel = l.nivel; ex.u = l.u; ex.v = l.v; }
    const c = celulaMaisPerto(p, s, ds, mx, my); return { x: c.x, y: c.y, extra: ex, v: podeColocar(p, d, c.x, c.y, rot, ignorar, ex) };
  }
  const f = tamanhoPegada({ rot, ...ex }, d); const x = lim(Math.floor(mx - f.w / 2 + 0.5), -1, p.largura); const y = lim(Math.floor(my - f.h / 2 + 0.5), -1, p.altura);
  return { x, y, extra: ex, v: podeColocar(p, d, x, y, rot, ignorar, ex) };
}
/** Objeto temporário (para desenhar o fantasma) com a posição resolvida. */
export function objetoDoAlvo(p: Projeto, d: ItemDef, a: Alvo, rot: number, id = '__novo'): ObjetoColocado {
  const o: ObjetoColocado = { id, def: d.id, x: a.x, y: a.y, rot: (d.girar ? rot : 0) as 0 | 1 | 2 | 3, ...a.extra };
  if (d.camada === 'sobre') { const s = p.objetos.find((q) => { const dd = item(q.def); return dd?.superficie && celulasDe(q, dd).some((c) => c.x === a.x && c.y === a.y); }); if (s) o.sobre = s.id; if (a.v.pos) Object.assign(o, a.v.pos); }
  if (d.camada === 'parede') o.alt = a.extra.alt ?? d.alturaPadrao ?? 0.6;
  return o;
}
