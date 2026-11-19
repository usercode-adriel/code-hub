// Terreno em volta da cidade (modo Reforma): contorno da terra, ilhas e lagos como polígonos, e a máscara de
// colisão do terreno (mar, areia, terra) gerada a partir deles. O formato "continente" é um continente original:
// costa recortada, ilha-barreira comprida com laguna a oeste, ilhotas, arquipélago no sudeste, península ao sul
// e um grande lago no interior. A areia da praia fica dos dois lados da linha da costa (mesma regra no desenho).
import { CORE, BOUNDS, BEACH, SHAPES, coastOf } from './obra.js';

const WATER = 5; const SAND = 9; const GRASS = 6; const CS = 4;
export const CONT_BOUNDS = { x0: -2800, y0: -7200, x1: 9600, y1: 5200 };
export const MAX_BOUNDS = { x0: Math.min(BOUNDS.x0, CONT_BOUNDS.x0), y0: Math.min(BOUNDS.y0, CONT_BOUNDS.y0), x1: Math.max(BOUNDS.x1, CONT_BOUNDS.x1), y1: Math.max(BOUNDS.y1, CONT_BOUNDS.y1) };

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// costa "fractal": cada trecho é dividido ao meio com um desvio lateral, até ficar curto (trechos fixos não mexem)
function fractal(ctrl, R, rough = 0.2, minLen = 44, fixed = new Set()) {
  const out = [];
  const seg = (a, b, depth) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < minLen || depth > 12) { out.push(a); return; }
    const nx = -(b[1] - a[1]) / L; const ny = (b[0] - a[0]) / L; const d = (R() * 2 - 1) * L * rough;
    const m = [(a[0] + b[0]) / 2 + nx * d, (a[1] + b[1]) / 2 + ny * d];
    seg(a, m, depth + 1); seg(m, b, depth + 1);
  };
  for (let i = 0; i < ctrl.length; i++) { const a = ctrl[i]; const b = ctrl[(i + 1) % ctrl.length]; if (fixed.has(i)) out.push(a); else seg(a, b, 0); }
  return out.map(([x, y]) => [Math.round(x), Math.round(y)]);
}
function blob(cx, cy, rx, ry, R, n = 16, wob = 0.28) {
  const pts = []; const ph = R() * 6;
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const k = 1 + wob * (Math.sin(a * 3 + ph) * 0.5 + (R() - 0.5)); pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]); }
  return fractal(pts, R, 0.18, Math.max(24, Math.min(rx, ry) / 3));
}

function continente() {
  const R = rng(777);
  const main = [[276, 3100], [276, -350], [-150, -950], [-700, -1500], [-1100, -1300], [-1400, -2100], [-900, -2700], [-1500, -3300], [-2200, -3700], [-2400, -4600], [-1900, -5400], [-2300, -6000],
    [-1500, -6700], [-500, -6500], [300, -6900], [1300, -6600], [1900, -6950], [2900, -6700], [3400, -6200], [3900, -6650], [5000, -6900], [6200, -6600], [7200, -6800], [8200, -6300], [8800, -5600],
    [9100, -4500], [8700, -3800], [9200, -3000], [9300, -1900], [8900, -1000], [9200, 0], [9000, 1100], [8600, 2000], [8000, 2700], [7200, 3300], [6200, 3700], [5300, 3500], [4600, 3900],
    [4100, 4600], [3700, 4950], [3300, 4600], [3100, 3800], [2300, 3500], [1400, 3650], [700, 3350]];
  const land = [fractal(main, R, 0.21, 40, new Set([0]))];
  // ilha-barreira comprida a oeste (com laguna) e ilhotas entre ela e a orla
  land.push(fractal([[-1250, -700], [-1050, -400], [-950, 600], [-900, 1800], [-950, 2800], [-1100, 3300], [-1300, 3100], [-1350, 2000], [-1400, 800], [-1400, -200]], R, 0.12, 36));
  for (const [x, y, rx, ry] of [[-460, 700, 120, 80], [-520, 1900, 160, 95], [-380, 2620, 90, 60], [-650, 3300, 140, 90], [-1700, 3900, 220, 140]]) land.push(blob(x, y, rx, ry, R));
  // ilha grande ao sul e arquipélago na costa sudeste
  land.push(blob(1500, 4550, 520, 300, R, 20)); land.push(blob(2350, 4500, 180, 120, R));
  // ilhas não podem encostar no continente nem umas nas outras (senão a areia aparece por dentro da terra)
  const inside = (poly, x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i]; const [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const box = (p) => { let a = Infinity; let b = Infinity; let c = -Infinity; let d = -Infinity; for (const [x, y] of p) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); } return [a - 90, b - 90, c + 90, d + 90]; };
  const free = (isl) => { const bb = box(isl); for (const q of land) { const qb = q.bb || (q.bb = box(q)); if (bb[0] > qb[2] || bb[2] < qb[0] || bb[1] > qb[3] || bb[3] < qb[1]) continue; if (isl.some(([x, y]) => inside(q, x, y) || inside(q, x + 80, y) || inside(q, x - 80, y) || inside(q, x, y + 80) || inside(q, x, y - 80))) return false; if (q.some(([x, y]) => inside(isl, x, y))) return false; } return true; };
  for (let i = 0; i < 70 && land.length < 44; i++) {
    const t = R(); const ax = 8600 + (4600 - 8600) * t; const ay = 2000 + (3900 - 2000) * t; const off = 200 + R() * 700;
    const isl = blob(ax + off * 0.55, ay + off * 0.8, 35 + R() * 150, 30 + R() * 110, R, 12, 0.35);
    if (free(isl)) land.push(isl);
  }
  // ilhotas no norte, no oeste e no leste
  for (const [x, y, r] of [[600, -7050, 120], [1700, -7080, 80], [4400, -7000, 150], [6900, -7020, 100], [-2550, -5100, 120], [-2600, -3200, 90], [-1900, -2500, 140], [9420, -2400, 110], [9450, -3600, 70], [9380, 600, 130]]) { const b = blob(x, y, r, r * 0.7, R); if (free(b)) land.push(b); }
  // lagos no interior
  const lakes = [blob(4500, -3500, 700, 520, R, 22, 0.22), blob(-1180, 1400, 70, 320, R, 14, 0.1)];
  for (const [x, y, rx, ry] of [[2200, -4800, 250, 180], [6800, -2000, 300, 200], [7600, -4800, 180, 260], [1200, -2500, 160, 120], [5800, -5600, 220, 150], [3000, -1400, 90, 70], [7300, -700, 120, 90],
    [6100, 1200, 140, 100], [1800, -5800, 110, 80], [-900, -5600, 150, 110], [8200, -2600, 100, 140]]) lakes.push(blob(x, y, rx, ry, R, 14));
  return { bounds: CONT_BOUNDS, land, lakes };
}

// polígonos do formato (barato: serve também para as miniaturas do seletor)
const POLYS = new Map();
export function shapePolys(shape) {
  const k = SHAPES[shape] ? shape : 'continente';
  if (POLYS.has(k)) return POLYS.get(k);
  let p;
  if (k === 'continente') p = continente();
  else { const c = coastOf(k, 4); p = { bounds: BOUNDS, land: [c.poly(0, 720, 276)], lakes: [] }; }
  p.shape = k; POLYS.set(k, p);
  return p;
}

// preenche polígonos numa grade (regra par-ímpar, linha a linha)
function rasterize(grid, mw, mh, b, polys, val) {
  for (const poly of polys) {
    let y0 = Infinity; let y1 = -Infinity; for (const [, y] of poly) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const j0 = Math.max(0, Math.floor((y0 - b.y0) / CS)); const j1 = Math.min(mh - 1, Math.ceil((y1 - b.y0) / CS));
    const xs = [];
    for (let j = j0; j <= j1; j++) {
      const y = b.y0 + (j + 0.5) * CS; xs.length = 0;
      for (let i = 0, n = poly.length; i < n; i++) { const [ax, ay] = poly[i]; const [bx, by] = poly[(i + 1) % n]; if ((ay > y) !== (by > y)) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax)); }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) { const i0 = Math.max(0, Math.ceil((xs[k] - b.x0) / CS - 0.5)); const i1 = Math.min(mw - 1, Math.floor((xs[k + 1] - b.x0) / CS - 0.5)); if (i1 >= i0) grid.fill(val, j * mw + i0, j * mw + i1 + 1); }
    }
  }
}

// máscara do terreno (mar, areia, terra) do formato — calculada uma vez por formato
const TERR = new Map();
export function terrainOf(shape) {
  const P = shapePolys(shape);
  if (TERR.has(P.shape)) return TERR.get(P.shape);
  const b = P.bounds; const mw = (b.x1 - b.x0) / CS; const mh = (b.y1 - b.y0) / CS;
  const g = new Uint8Array(mw * mh).fill(WATER);
  rasterize(g, mw, mh, b, P.land, GRASS); rasterize(g, mw, mh, b, P.lakes, WATER);
  // praia: até BEACH unidades de cada lado da linha entre terra e água
  const D = Math.round(BEACH / CS); const dist = new Uint8Array(mw * mh).fill(255); let q = [];
  for (let j = 1; j < mh - 1; j++) for (let i = 1; i < mw - 1; i++) { const k = j * mw + i; const v = g[k]; if (g[k - 1] !== v || g[k + 1] !== v || g[k - mw] !== v || g[k + mw] !== v) { dist[k] = 0; q.push(k); } }
  for (let d = 1; d <= D; d++) { const nq = []; for (const k of q) for (const n of [k - 1, k + 1, k - mw, k + mw]) if (n >= 0 && n < dist.length && dist[n] === 255) { dist[n] = d; nq.push(n); } q = nq; }
  for (let k = 0; k < g.length; k++) if (dist[k] <= D) g[k] = SAND;
  const t = { shape: P.shape, bounds: b, mw, mh, grid: g, land: P.land, lakes: P.lakes, level: 4,
    // 0 mar, 1 areia, 2 terra (fora do núcleo; dentro dele vale o mapa da cidade)
    zone(x, y) { const i = Math.floor((x - b.x0) / CS); const j = Math.floor((y - b.y0) / CS); if (i < 0 || j < 0 || i >= mw || j >= mh) return 0; const c = g[j * mw + i]; return c === WATER ? 0 : c === SAND ? 1 : 2; } };
  TERR.clear(); TERR.set(P.shape, t);
  return t;
}
export { CORE };
