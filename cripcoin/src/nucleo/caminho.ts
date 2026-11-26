// PATHFINDING A* em grade, 8 vizinhos, sem cortar quina de parede/móvel. `aproximar`: se o destino está bloqueado, vai até a célula livre mais próxima dele.
import type { Grade } from './grade';
export interface Cel { x: number; y: number }
const V = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]] as const;

export function acharCaminho(g: Grade, de: Cel, para: Cel, opts: { aproximar?: boolean; max?: number } = {}): Cel[] | null {
  const max = opts.max ?? 4000; let alvo = para;
  if (!g.livre(alvo.x, alvo.y)) {
    if (!opts.aproximar) return null;
    let melhor: Cel | null = null; let md = Infinity;
    for (let r = 1; r <= 6 && !melhor; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const c = { x: para.x + dx, y: para.y + dy }; if (!g.livre(c.x, c.y)) continue; const d = Math.hypot(dx, dy); if (d < md) { md = d; melhor = c; } }
    if (!melhor) return null; alvo = melhor;
  }
  if (!g.livre(de.x, de.y)) { /* a origem pode estar sobre uma cadeira/porta: permitido */ }
  if (de.x === alvo.x && de.y === alvo.y) return [];
  const W = g.largura; const k = (x: number, y: number): number => y * W + x; const gs = new Map<number, number>(); const pai = new Map<number, number>(); const aberto: { f: number; x: number; y: number }[] = [];
  const h = (x: number, y: number): number => { const dx = Math.abs(x - alvo.x); const dy = Math.abs(y - alvo.y); return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy); };
  gs.set(k(de.x, de.y), 0); aberto.push({ f: h(de.x, de.y), x: de.x, y: de.y }); const fechado = new Set<number>(); let passos = 0;
  while (aberto.length && passos++ < max) {
    let m = 0; for (let i = 1; i < aberto.length; i++) if (aberto[i].f < aberto[m].f) m = i; const a = aberto.splice(m, 1)[0]; const ka = k(a.x, a.y);
    if (fechado.has(ka)) continue; fechado.add(ka);
    if (a.x === alvo.x && a.y === alvo.y) { const out: Cel[] = []; let c = ka; while (c !== k(de.x, de.y)) { out.push({ x: c % W, y: Math.floor(c / W) }); c = pai.get(c)!; } return out.reverse(); }
    for (const [dx, dy, custo] of V) {
      const nx = a.x + dx; const ny = a.y + dy; if (!g.livre(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!g.livre(a.x + dx, a.y) || !g.livre(a.x, a.y + dy))) continue;      // não corta quina
      const kn = k(nx, ny); const ng = gs.get(ka)! + custo; if (ng < (gs.get(kn) ?? Infinity)) { gs.set(kn, ng); pai.set(kn, ka); aberto.push({ f: ng + h(nx, ny), x: nx, y: ny }); }
    }
  }
  return null;
}
