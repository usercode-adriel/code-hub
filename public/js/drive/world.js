// CityMap + CollisionSystem — a cidade dirigível de Nexus City.
// A imagem (public/assets/drive/city.webp) é o cenário; roads.json descreve as ruas por cima dela (eixos, larguras,
// cruzamentos, rotatórias, estacionamentos, semáforos, radares e estabelecimentos). Daqui saem:
//  - o grafo de ruas com as faixas de cada sentido (mão direita), usado pelo trânsito e pelos pedestres;
//  - a máscara de colisão (1 byte por pixel do mapa): 0 sólido (prédios, árvores, água), 1 calçada, 2 rua,
//    3 faixa de pedestre (rua onde se pode atravessar a pé), 4 estacionamento (carro e pedestre).
export const SOLID = 0; export const WALK = 1; export const ROAD = 2; export const CROSS = 3; export const LOT = 4;
export const WATER = 5; export const GRASS = 6; export const RUNWAY = 7; export const PLAZA = 8; export const SAND = 9;
// carros: pista, faixa, estacionamento e pistas do aeroporto
export const canDrive = (c) => c === ROAD || c === CROSS || c === LOT || c === RUNWAY;
// NPCs: só calçadas, faixas de pedestre, praças e estacionamentos
export const canWalk = (c) => c === WALK || c === CROSS || c === LOT || c === PLAZA;
// jogador a pé: qualquer lugar que não seja sólido (rua, calçada, grama, areia e até a água)
export const canFoot = (c) => c !== SOLID;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (v) => Math.hypot(v[0], v[1]);
const norm = (v) => { const l = len(v) || 1; return [v[0] / l, v[1] / l]; };

// desloca uma polilinha para a direita do sentido de percurso (y para baixo: direita de (dx,dy) é (-dy,dx))
function offset(pts, o) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)]; const b = pts[Math.min(pts.length - 1, i + 1)];
    const d = norm(sub(b, a)); return [p[0] - d[1] * o, p[1] + d[0] * o];
  });
}
// corta a parte da polilinha que fica dentro do círculo (c, r), no começo (fromStart) ou no fim
function trim(pts, c, r, fromStart) {
  if (r <= 0) return pts;
  const P = fromStart ? pts.slice() : pts.slice().reverse();
  const d = (q) => len(sub(q, c));
  if (d(P[0]) >= r) return pts;
  let i = 0;
  while (i < P.length - 1 && d(P[i + 1]) < r) i++;
  if (i >= P.length - 1) return [];
  const a = P[i]; const b = P[i + 1];
  let lo = 0; let hi = 1;
  for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (d([a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m]) < r) lo = m; else hi = m; }
  const out = [[a[0] + (b[0] - a[0]) * hi, a[1] + (b[1] - a[1]) * hi], ...P.slice(i + 1)];
  return fromStart ? out : out.reverse();
}
function cumOf(pts) { const c = [0]; for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + len(sub(pts[i], pts[i - 1]))); return c; }
// posição e direção a uma distância s ao longo da polilinha
export function along(path, s) {
  const { pts, cum } = path; const L = cum.at(-1);
  if (s <= 0) { const d = norm(sub(pts[1] || pts[0], pts[0])); return { x: pts[0][0], y: pts[0][1], a: Math.atan2(d[1], d[0]) }; }
  if (s >= L) { const d = norm(sub(pts.at(-1), pts.at(-2) || pts.at(-1))); return { x: pts.at(-1)[0], y: pts.at(-1)[1], a: Math.atan2(d[1], d[0]) }; }
  let i = 1; while (cum[i] < s) i++;
  const t = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1); const a = pts[i - 1]; const b = pts[i];
  return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, a: Math.atan2(b[1] - a[1], b[0] - a[0]) };
}
const mkPath = (pts) => ({ pts, cum: cumOf(pts), get len() { return this.cum.at(-1); } });

export async function loadWorld() {
  const R = await (await fetch('/assets/drive/roads.json')).json();
  const world = buildGraph(R);
  world.mask = buildMask(world); world.cs = 1; world.mw = world.W;
  return world;
}
// grafo de ruas (nós, trechos, faixas por sentido e calçadas) a partir da descrição das ruas
export function buildGraph(R) {
  const nodes = {};
  for (const [id, [x, y, kind]] of Object.entries(R.nodes)) nodes[id] = { id, x, y, kind: kind || 'cross', edges: [], out: [], inn: [], maxW: 0 };
  const edges = [];
  for (const rd of R.roads) {
    const pairs = rd.shape ? [[rd.path[0], rd.path.at(-1), rd.shape]] : rd.path.slice(1).map((b, i) => [rd.path[i], b, null]);
    for (const [a, b, shape] of pairs) {
      const A = nodes[a]; const B = nodes[b];
      const pts = shape ? shape.map((p) => p.slice()) : [rd.via?.[a] || [A.x, A.y], rd.via?.[b] || [B.x, B.y]];
      const e = { id: `${rd.id}:${a}-${b}`, road: rd.id, a: A, b: B, w: rd.w, narrow: Boolean(rd.narrow), pts };
      edges.push(e); A.edges.push(e); B.edges.push(e);
      A.maxW = Math.max(A.maxW, rd.w); B.maxW = Math.max(B.maxW, rd.w);
    }
  }
  const clearance = (n) => (n.kind === 'round' ? 44 : n.kind === 'corner' ? 8 : n.kind === 'exit' ? 0 : n.maxW / 2 + 7);
  for (const n of Object.values(nodes)) n.clear = clearance(n);
  // faixas (um sentido cada) e calçadas (dois lados de cada rua)
  const lanes = [];
  for (const e of edges) {
    const o = e.narrow ? e.w * 0.22 : e.w * 0.24;
    for (const [from, to, raw] of [[e.a, e.b, e.pts], [e.b, e.a, e.pts.slice().reverse()]]) {
      let pts = offset(raw, o);
      pts = trim(pts, [from.x, from.y], from.clear, true);
      pts = trim(pts, [to.x, to.y], to.clear, false);
      if (pts.length < 2) continue;
      const path = mkPath(pts);
      const dEnd = norm(sub(pts.at(-1), pts.at(-2))); const dStart = norm(sub(pts[1], pts[0]));
      const lane = { id: lanes.length, edge: e, from, to, path, dEnd, dStart, axis: Math.abs(dEnd[0]) >= Math.abs(dEnd[1]) ? 'H' : 'V', narrow: e.narrow };
      lanes.push(lane); from.out.push(lane); to.inn.push(lane);
    }
    // calçadas: eixo da rua deslocado para fora da pista
    const so = e.w / 2 + 8;
    e.walks = [1, -1].map((side) => {
      let pts = offset(e.pts, so * side);
      pts = trim(pts, [e.a.x, e.a.y], e.a.kind === 'round' ? 56 : e.a.kind === 'exit' ? 0 : e.a.clear + 6, true);
      pts = trim(pts, [e.b.x, e.b.y], e.b.kind === 'round' ? 56 : e.b.kind === 'exit' ? 0 : e.b.clear + 6, false);
      return pts.length >= 2 ? mkPath(pts) : null;
    });
  }
  const lights = new Set(R.lights || []);
  for (const n of Object.values(nodes)) { n.light = lights.has(n.id) ? { off: (n.x * 7 + n.y * 3) % 22 } : null; }
  return { R, W: R.w, H: R.h, nodes, edges, lanes, mask: null, cs: 1, mw: R.w, turnCache: new Map(), lots: R.lots || [], pois: R.pois || [], radars: R.radars || [], regions: R.regions || [] };
}

// semáforo: ciclo de 22 s; eixo H (leste-oeste) e V (norte-sul) alternam
export function lightState(n, axis, t) {
  if (!n.light) return 'green';
  const c = ((t + n.light.off) % 22 + 22) % 22;
  if (axis === 'H') return c < 8 ? 'green' : c < 10.5 ? 'yellow' : 'red';
  return c >= 11 && c < 19 ? 'green' : c >= 19 && c < 21.5 ? 'yellow' : 'red';
}

// curva de uma faixa para a seguinte no cruzamento (Bézier) ou contorno da rotatória (sentido anti-horário)
export function turnPath(world, L1, L2) {
  const key = `${L1.id}>${L2.id}`;
  let p = world.turnCache.get(key); if (p) return p;
  const E = L1.path.pts.at(-1); const S = L2.path.pts[0]; const n = L1.to;
  let pts;
  if (n.kind === 'round') {
    const r = 29; const c = [n.x, n.y];
    let a0 = Math.atan2(E[1] - c[1], E[0] - c[0]); let a1 = Math.atan2(S[1] - c[1], S[0] - c[0]);
    while (a1 > a0 - 0.35) a1 -= Math.PI * 2; // anti-horário na tela = ângulo diminuindo
    pts = [E];
    const steps = Math.max(4, Math.ceil((a0 - a1) / 0.3));
    for (let i = 0; i <= steps; i++) { const a = a0 + ((a1 - a0) * i) / steps; pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]); }
    pts.push(S);
  } else {
    const d1 = L1.dEnd; const d2 = L2.dStart;
    const cr = d1[0] * d2[1] - d1[1] * d2[0];
    let C;
    if (Math.abs(cr) < 0.15) C = [(E[0] + S[0]) / 2, (E[1] + S[1]) / 2];
    else { const t = ((S[0] - E[0]) * d2[1] - (S[1] - E[1]) * d2[0]) / cr; C = [E[0] + d1[0] * t, E[1] + d1[1] * t]; if (len(sub(C, E)) > 80) C = [(E[0] + S[0]) / 2, (E[1] + S[1]) / 2]; }
    pts = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10; const u = 1 - t; pts.push([u * u * E[0] + 2 * u * t * C[0] + t * t * S[0], u * u * E[1] + 2 * u * t * C[1] + t * t * S[1]]); }
  }
  p = mkPath(pts); world.turnCache.set(key, p);
  return p;
}

// máscara desenhada num canvas (mesmas regras do tools/drive/mask.py) e lida uma vez
function buildMask(world) {
  const { W, H, nodes, edges } = world;
  const layer = (draw) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d', { willReadFrequently: true }); x.lineCap = 'round'; x.lineJoin = 'round'; x.fillStyle = x.strokeStyle = '#fff'; draw(x); return x.getImageData(0, 0, W, H).data; };
  const stroke = (x, extra) => { for (const e of edges) { x.lineWidth = e.w + extra; x.beginPath(); x.moveTo(e.pts[0][0], e.pts[0][1]); for (const p of e.pts.slice(1)) x.lineTo(p[0], p[1]); x.stroke(); } };
  const dot = (x, r) => { for (const n of Object.values(nodes)) { x.beginPath(); x.arc(n.x, n.y, r(n), 0, Math.PI * 2); x.fill(); } };
  const road = layer((x) => {
    stroke(x, 0); dot(x, (n) => (n.kind === 'round' ? 40 : n.kind === 'corner' ? n.maxW / 2 : n.kind === 'exit' ? 0 : n.maxW / 2 + 3));
    for (const l of world.lots) x.fillRect(l.rect[0], l.rect[1], l.rect[2] - l.rect[0], l.rect[3] - l.rect[1]);
    x.globalCompositeOperation = 'destination-out';
    for (const n of Object.values(nodes)) if (n.kind === 'round') { x.beginPath(); x.arc(n.x, n.y, 17, 0, Math.PI * 2); x.fill(); }
  });
  const side = layer((x) => { stroke(x, 22); dot(x, (n) => (n.kind === 'round' ? 52 : n.kind === 'exit' ? 0 : n.maxW / 2 + 14)); x.globalCompositeOperation = 'destination-out'; for (const n of Object.values(nodes)) if (n.kind === 'round') { x.beginPath(); x.arc(n.x, n.y, 17, 0, Math.PI * 2); x.fill(); } });
  const lot = layer((x) => { for (const l of world.lots) x.fillRect(l.rect[0], l.rect[1], l.rect[2] - l.rect[0], l.rect[3] - l.rect[1]); });
  const cross = layer((x) => {
    for (const n of Object.values(nodes)) {
      if (n.kind === 'exit' || n.kind === 'corner') continue;
      x.beginPath();
      if (n.kind === 'round') { x.arc(n.x, n.y, 62, 0, Math.PI * 2); x.arc(n.x, n.y, 42, 0, Math.PI * 2, true); } else x.arc(n.x, n.y, n.clear + 10, 0, Math.PI * 2);
      x.fill('evenodd');
    }
  });
  const m = new Uint8Array(W * H);
  for (let i = 0, j = 3; i < m.length; i++, j += 4) {
    if (road[j] > 127) m[i] = lot[j] > 127 ? LOT : cross[j] > 127 ? CROSS : ROAD;
    else if (side[j] > 127) m[i] = WALK;
  }
  return m;
}
export const at = (world, x, y) => { if (x < 0 || y < 0 || x >= world.W || y >= world.H) return SOLID; const cs = world.cs || 1; return world.mask[((y / cs) | 0) * world.mw + ((x / cs) | 0)]; };
export const heightAt = (world, x, y) => { if (!world.heights || x < 0 || y < 0 || x >= world.W || y >= world.H) return 0; const cs = world.cs || 1; return world.heights[((y / cs) | 0) * world.mw + ((x / cs) | 0)]; };
export function regionAt(world, x, y) { const r = world.regions.find((g) => x >= g.rect[0] && x < g.rect[2] && y >= g.rect[1] && y < g.rect[3]); return r?.name || 'Nexus City'; }
// ponto andável mais próximo (para sair do carro)
export function nearestWalk(world, x, y, maxR = 40, ok = canWalk) {
  for (let r = 0; r <= maxR; r += 2) for (let k = 0; k < Math.max(8, r * 2); k++) { const a = (k / Math.max(8, r * 2)) * Math.PI * 2; const px = x + Math.cos(a) * r; const py = y + Math.sin(a) * r; if (ok(at(world, px, py))) return [px, py]; }
  return null;
}
// distância até o eixo de uma faixa de trânsito (para saber se um carro foi largado no meio da via)
export function laneDist(world, x, y) {
  let best = Infinity;
  for (const l of world.lanes) { const p = l.path.pts; for (let i = 1; i < p.length; i++) { const a = p[i - 1]; const b = p[i]; const d = sub(b, a); const L2 = d[0] * d[0] + d[1] * d[1] || 1; const t = Math.max(0, Math.min(1, ((x - a[0]) * d[0] + (y - a[1]) * d[1]) / L2)); best = Math.min(best, Math.hypot(x - a[0] - d[0] * t, y - a[1] - d[1] * t)); } }
  return best;
}

// faixa de trânsito mais próxima de um ponto (para viaturas voltarem à rota e para localizar ocorrências)
export function nearestLane(world, x, y, filter = null) {
  let best = null;
  for (const l of world.lanes) {
    if (filter && !filter(l)) continue;
    const p = l.path.pts; const c = l.path.cum;
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]; const b = p[i]; const dx = b[0] - a[0]; const dy = b[1] - a[1]; const L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2));
      const d = Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t);
      if (!best || d < best.d) best = { lane: l, s: c[i - 1] + (c[i] - c[i - 1]) * t, d };
    }
  }
  return best;
}
// rota (sequência de nós) pelo grafo das faixas — Dijkstra
export function routeNodes(world, fromId, toId, banEdge = null) {
  if (fromId === toId) return [];
  const dist = new Map([[fromId, 0]]); const prev = new Map(); const done = new Set(); const q = [[0, fromId]];
  while (q.length) {
    q.sort((a, b) => a[0] - b[0]); const [d, id] = q.shift();
    if (done.has(id)) continue; done.add(id); if (id === toId) break;
    for (const l of world.nodes[id].out) {
      if (l.narrow || (id === fromId && banEdge && l.edge === banEdge)) continue;
      const nd = d + l.path.len + 20; const to = l.to.id;
      if (nd < (dist.get(to) ?? Infinity)) { dist.set(to, nd); prev.set(to, id); q.push([nd, to]); }
    }
  }
  if (!prev.has(toId)) return null;
  const out = []; let c = toId; while (c !== fromId) { out.unshift(c); c = prev.get(c); }
  return out;
}
