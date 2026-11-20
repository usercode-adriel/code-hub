// Obstáculos físicos dos objetos da cidade e da Construtora (postes, bancos, árvores, cercas, lixeiras, hidrantes,
// placas, relevo...): círculos na base de cada objeto, num índice por células para consulta rápida. Valem para o
// jogador (a pé e dirigindo). Também a colisão precisa entre veículos: retângulos orientados (teorema do eixo separador).
const CELL = 32;
const SKIP = /^(d:)?(flores|faixa|boeiro|grade-rua|fachada|toldo|outdoor)|^x:(passeio|praia|pier|quadra|ponte|lago|rio|trilha|cachoeira|corredeira|ninfeias|rotatoria|heliponto|telhado|cais|bueiro|arrozal|patio|parque|praca|beira|gramado|canteiro-cercado|chafariz-praca|caminho)/;
export function buildObst(props) {
  const grid = new Map(); let n = 0;
  const add = (x, y, r) => { const i0 = Math.floor((x - r) / CELL); const i1 = Math.floor((x + r) / CELL); const j0 = Math.floor((y - r) / CELL); const j1 = Math.floor((y + r) / CELL); const o = { x, y, r }; for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = `${i},${j}`; let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(o); } n++; };
  for (const p of props) {
    if (!p.spr || SKIP.test(p.spr) || p.w < 3) continue;
    const big = p.w > 60 && p.h > 40; // relevo, construções grandes de decoração
    if (big) { const r = Math.min(p.w * 0.4, p.h * 0.35); add(p.x, p.y - r * 0.8, r); continue; }
    const rot = p.rot && Math.abs(Math.sin(p.rot)) > 0.7; // cerca girada fica na vertical
    const len = rot ? p.h : p.w; const r = Math.max(1.6, Math.min(5.5, (rot ? p.w : Math.min(p.w, p.h)) * 0.3));
    if (len > r * 3.2) { const k = Math.min(10, Math.ceil(len / (r * 1.8))); for (let s = 0; s < k; s++) { const t = (s + 0.5) / k - 0.5; if (rot) add(p.x, p.y - p.w / 2 + t * len, r); else add(p.x + t * len, p.y - r * 0.6, r); } }
    else add(p.x, p.y - r * 0.6, r);
  }
  return { grid, n };
}
const near = (O, x, y, pad) => { const out = []; if (!O) return out; const i0 = Math.floor((x - pad) / CELL); const i1 = Math.floor((x + pad) / CELL); const j0 = Math.floor((y - pad) / CELL); const j1 = Math.floor((y + pad) / CELL); for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const l = O.grid.get(`${i},${j}`); if (l) for (const o of l) out.push(o); } return out; };
// ponto (com raio) encosta em algum objeto?
export const obstAt = (O, x, y, rad = 2) => near(O, x, y, rad + 8).some((o) => Math.hypot(o.x - x, o.y - y) < o.r + rad);
// carro (retângulo L×W orientado) encosta em algum objeto?
export function obstCar(O, x, y, a, L, W) {
  const c = Math.cos(a); const s = Math.sin(a);
  for (const o of near(O, x, y, L / 2 + 8)) {
    const dx = o.x - x; const dy = o.y - y; const lx = dx * c + dy * s; const ly = -dx * s + dy * c;
    const qx = Math.max(-L / 2, Math.min(L / 2, lx)); const qy = Math.max(-W / 2, Math.min(W / 2, ly));
    if (Math.hypot(lx - qx, ly - qy) < o.r) return o;
  }
  return null;
}
// dois veículos (retângulos orientados) se sobrepõem? m: folga (negativa = exige encostar de verdade)
export function obb(a, b, m = 0) {
  const A = [Math.cos(a.a), Math.sin(a.a)]; const B = [Math.cos(b.a), Math.sin(b.a)];
  const axes = [A, [-A[1], A[0]], B, [-B[1], B[0]]];
  const ha = [(a.L || 20) / 2 + m, (a.W || 10) / 2 + m]; const hb = [(b.L || 20) / 2 + m, (b.W || 10) / 2 + m];
  const d = [b.x - a.x, b.y - a.y];
  for (const ax of axes) {
    const ra = ha[0] * Math.abs(A[0] * ax[0] + A[1] * ax[1]) + ha[1] * Math.abs(-A[1] * ax[0] + A[0] * ax[1]);
    const rb = hb[0] * Math.abs(B[0] * ax[0] + B[1] * ax[1]) + hb[1] * Math.abs(-B[1] * ax[0] + B[0] * ax[1]);
    if (Math.abs(d[0] * ax[0] + d[1] * ax[1]) > ra + rb) return false;
  }
  return true;
}
