// MAP ENGINE — cartografia de Nexus City no estilo "mapa de jogo de mundo aberto".
// A geometria (litoral, rio, ruas, avenidas, rodovias, parques) é gerada de forma determinística a partir de
// uma semente e dos bairros liberados, e fica só em memória (cache). O que é dado do mundo — onde cada
// estabelecimento, imóvel e morador está — fica salvo como "nó" da malha viária, com endereço próprio.
// Rotas usam o menor caminho na malha (Dijkstra) com pesos por tipo de via.
import { onUpgrade } from './core.js';

export const W = 2000;
export const H = 1200;
export const SCALE = 2; // bairros são definidos em 1000×600 e desenhados em 2000×1200
export const METERS_PER_UNIT = 5;

const STYLE = {
  centro: { s: 34, a: 0 }, tecnologia: { s: 40, a: 12 }, residencial: { s: 48, a: -8 }, nobre: { s: 56, a: 21 }, educacao: { s: 50, a: 4 },
  comercio: { s: 38, a: 6 }, popular: { s: 36, a: -15 }, noturno: { s: 42, a: 28 },
};
const ROW_NAMES = ['das Acácias', 'Neon', 'dos Ipês', 'Aurora', 'do Porto', 'Cristal', 'das Palmeiras', 'Horizonte', 'do Comércio', 'Prisma', 'das Flores', 'Sete de Setembro', 'Vértice', 'dos Pescadores', 'da Lua', 'Pixel', 'do Sol', 'Atlântica', 'Quantum', 'dos Andradas', 'Faro', 'da Serra', 'Brisa', 'Órbita'];
const COL_NAMES = ['Mário Quintana', 'Cecília Meireles', 'Santos Dumont', 'Machado de Assis', 'Clarice Lispector', 'Oscar Niemeyer', 'Chiquinha Gonzaga', 'Tom Jobim', 'Carmen Miranda', 'Paulo Freire', 'Anita Garibaldi', 'Zumbi dos Palmares', 'Dandara', 'Pixinguinha', 'Tarsila do Amaral', 'Cora Coralina', 'Vinicius de Moraes', 'Lina Bo Bardi', 'Darcy Ribeiro', 'Nise da Silveira'];
const KIND_COST = { rodovia: 0.45, avenida: 0.75, acesso: 0.9, rua: 1 };

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const scaled = (poly) => poly.map(([x, y]) => [x * SCALE, y * SCALE]);
export function inside(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi)) c = !c;
  }
  return c;
}
function distSeg(p, a, b) {
  const dx = b[0] - a[0]; const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
const edgeDist = (p, poly) => Math.min(...poly.map((a, i) => distSeg(p, a, poly[(i + 1) % poly.length])));
const centroid = (poly) => [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// ---------------------------------------------------------------- geração
const cache = new Map();
export function geo(w) {
  const seed = w.city?.mapSeed || 7;
  const open = (w.city?.districts || []).filter((d) => !d.locked).map((d) => d.id).sort().join(',');
  const key = `${seed}|${open}`;
  if (cache.has(key)) return cache.get(key);
  const g = build(w, seed);
  cache.clear();
  cache.set(key, g);
  return g;
}

function build(w, seed) {
  const rnd = mulberry(seed);
  const nodes = []; const nodeInfo = []; const edges = []; const adj = [];
  const addNode = (pt, info) => { nodes.push([Math.round(pt[0]), Math.round(pt[1])]); nodeInfo.push(info); adj.push([]); return nodes.length - 1; };
  const addEdge = (a, b, kind, name) => {
    if (a === b || adj[a].some((e) => e.to === b)) return;
    const len = dist(nodes[a], nodes[b]);
    const e = { a, b, kind, name, len };
    edges.push(e); adj[a].push({ to: b, e }); adj[b].push({ to: a, e });
  };
  const districts = (w.city?.districts || []).map((d) => ({ ...d, P: scaled(d.poly) }));
  const byDistrict = {};

  // malha de ruas por bairro
  for (const d of districts.filter((x) => !x.locked)) {
    const st = STYLE[d.kind] || STYLE.residencial;
    const s = st.s; const ang = (st.a * Math.PI) / 180; const c = centroid(d.P);
    const cos = Math.cos(ang); const sin = Math.sin(ang);
    const R = Math.max(...d.P.map((p) => dist(p, c))) + s;
    const n = Math.ceil(R / s);
    const grid = new Map();
    byDistrict[d.id] = [];
    const rowOff = Math.floor(rnd() * ROW_NAMES.length); const colOff = Math.floor(rnd() * COL_NAMES.length);
    for (let i = -n; i <= n; i++) {
      for (let j = -n; j <= n; j++) {
        const pt = [c[0] + (i * cos - j * sin) * s, c[1] + (i * sin + j * cos) * s];
        if (!inside(pt, d.P) || edgeDist(pt, d.P) < s * 0.35) continue;
        const id = addNode(pt, { d: d.id, i, j, row: `${(j + 1000) % 4 === 0 ? 'Avenida' : 'Rua'} ${ROW_NAMES[(j + 1000 + rowOff) % ROW_NAMES.length]}`, col: `${(i + 1000) % 5 === 0 ? 'Avenida' : 'Rua'} ${COL_NAMES[(i + 1000 + colOff) % COL_NAMES.length]}` });
        grid.set(`${i},${j}`, id);
        byDistrict[d.id].push(id);
      }
    }
    for (const [k, id] of grid) {
      const [i, j] = k.split(',').map(Number);
      const right = grid.get(`${i + 1},${j}`); const down = grid.get(`${i},${j + 1}`);
      // algumas quadras são maiores (ruas que não atravessam), como numa cidade de verdade
      if (right != null && !(rnd() < 0.05 && (j + 1000) % 4 !== 0)) addEdge(id, right, (j + 1000) % 4 === 0 ? 'avenida' : 'rua', nodeInfo[id].row);
      if (down != null && !(rnd() < 0.05 && (i + 1000) % 5 !== 0)) addEdge(id, down, (i + 1000) % 5 === 0 ? 'avenida' : 'rua', nodeInfo[id].col);
    }
  }
  // ligações entre bairros vizinhos (avenidas de ligação)
  const open = districts.filter((d) => !d.locked && byDistrict[d.id]?.length);
  for (let x = 0; x < open.length; x++) {
    for (let y = x + 1; y < open.length; y++) {
      const A = open[x]; const B = open[y];
      const shared = A.P.filter((p) => B.P.some((q) => dist(p, q) < 2)).length;
      if (shared < 1) continue;
      const near = byDistrict[A.id].map((id) => ({ id, dd: Math.min(...byDistrict[B.id].map((k) => dist(nodes[id], nodes[k]))) })).sort((p, q) => p.dd - q.dd);
      let made = 0;
      for (const { id } of near) {
        if (made >= 5) break;
        const other = byDistrict[B.id].reduce((best, k) => (dist(nodes[id], nodes[k]) < dist(nodes[id], nodes[best]) ? k : best), byDistrict[B.id][0]);
        if (dist(nodes[id], nodes[other]) > 140) break;
        if (edges.some((e) => e.kind === 'avenida' && e.name?.startsWith('Ligação') && (dist(nodes[e.a], nodes[id]) < 70))) continue;
        addEdge(id, other, 'avenida', `Ligação ${A.name}–${B.name}`);
        made++;
      }
    }
  }
  // rodovias: anel do centro, eixo norte–sul e via costeira
  const HW = [
    { name: 'Anel Nexus', closed: true, pts: [[640, 300], [1260, 260], [1470, 470], [1320, 740], [760, 760], [560, 540]] },
    { name: 'Rodovia Norte–Sul', pts: [[1210, 40], [1260, 260], [1320, 740], [1390, 1150]] },
    { name: 'Via Costeira', pts: [[170, 880], [600, 900], [760, 760]] },
    { name: 'Expressa Leste', pts: [[1470, 470], [1750, 520], [1980, 560]] },
  ];
  const hwPaths = [];
  for (const h of HW) {
    const pts = h.closed ? [...h.pts, h.pts[0]] : h.pts;
    const sampled = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const [a, b] = [pts[k], pts[k + 1]]; const L = dist(a, b); const steps = Math.max(1, Math.round(L / 70));
      for (let t = 0; t < steps; t++) sampled.push([a[0] + ((b[0] - a[0]) * t) / steps, a[1] + ((b[1] - a[1]) * t) / steps]);
    }
    if (!h.closed) sampled.push(pts.at(-1));
    const ids = sampled.map((p) => addNode(p, { hw: h.name }));
    for (let k = 0; k < ids.length - 1; k++) addEdge(ids[k], ids[k + 1], 'rodovia', h.name);
    if (h.closed) addEdge(ids.at(-1), ids[0], 'rodovia', h.name);
    ids.forEach((id, k) => {
      if (k % 3) return;
      let best = -1; let bd = 1e9;
      for (const list of Object.values(byDistrict)) for (const n2 of list) { const dd = dist(nodes[id], nodes[n2]); if (dd < bd) { bd = dd; best = n2; } }
      if (best >= 0 && bd < 75) addEdge(id, best, 'acesso', `Acesso ${h.name}`);
    });
    hwPaths.push({ name: h.name, pts: sampled.concat(h.closed ? [sampled[0]] : []).map((p) => p.map(Math.round)) });
  }
  // componentes isolados (ilhas de ruas) ligam ao nó mais próximo do maior componente
  const comp = new Array(nodes.length).fill(-1); let cid = 0;
  for (let s = 0; s < nodes.length; s++) {
    if (comp[s] >= 0) continue;
    const stack = [s]; comp[s] = cid;
    while (stack.length) { const v = stack.pop(); for (const { to } of adj[v]) if (comp[to] < 0) { comp[to] = cid; stack.push(to); } }
    cid++;
  }
  const sizes = Array.from({ length: cid }, (_, k) => comp.filter((c) => c === k).length);
  const main = sizes.indexOf(Math.max(...sizes));
  for (let k = 0; k < cid; k++) {
    if (k === main) continue;
    let best = null;
    for (let v = 0; v < nodes.length; v++) if (comp[v] === k) for (let u = 0; u < nodes.length; u++) if (comp[u] === main) { const dd = dist(nodes[v], nodes[u]); if (!best || dd < best.dd) best = { v, u, dd }; }
    if (best) { addEdge(best.v, best.u, 'avenida', 'Ponte de ligação'); for (let v = 0; v < nodes.length; v++) if (comp[v] === k) comp[v] = main; }
  }
  // litoral (oeste e sul) com recortes, rio, lago, parques e píeres
  const coast = [];
  for (let y = 0; y <= H; y += 40) coast.push([110 + Math.sin(y / 70) * 22 + rnd() * 26 - (y > 760 && y < 900 ? 40 : 0), y]);
  const south = [];
  for (let x = 2000; x >= 110; x -= 40) south.push([x, 1150 + Math.sin(x / 90) * 18 + rnd() * 20 + (x > 680 && x < 1420 ? 28 : 0)]);
  const land = [[2000, 0], ...coast.filter((p) => p[1] < 1150), ...south.reverse().filter((p) => p[0] > 110)].map((p) => p.map(Math.round));
  const landPath = `M${[[2000, 0], ...coast.map((p) => [Math.round(p[0]), p[1]]).filter((p) => p[1] <= 1140), ...south.slice().map((p) => [p[0], Math.round(p[1])])].map((p) => p.join(',')).join('L')}L2000,1200Z`;
  void land;
  const parks = [];
  for (const d of districts.filter((x) => ['nobre', 'residencial', 'educacao'].includes(x.kind))) {
    const c = centroid(d.P);
    for (let k = 0; k < 2; k++) {
      const pc = [c[0] + (rnd() - 0.5) * 160, c[1] + (rnd() - 0.5) * 100]; const pw = 40 + rnd() * 60; const ph = 30 + rnd() * 50;
      parks.push([[pc[0] - pw, pc[1] - ph], [pc[0] + pw, pc[1] - ph * 0.8], [pc[0] + pw * 0.9, pc[1] + ph], [pc[0] - pw * 0.8, pc[1] + ph * 0.9]].map((p) => p.map(Math.round)));
    }
  }
  const piers = [];
  for (let k = 0; k < 6; k++) piers.push([720 + k * 95, 1150, 18, 50 + Math.round(rnd() * 40)]);
  const labels = districts.map((d) => ({ id: d.id, name: d.name, at: centroid(d.P).map(Math.round), locked: Boolean(d.locked) }));
  return {
    w: W, h: H, nodes, nodeInfo, edges, adj, byDistrict, hwPaths, landPath, parks, piers,
    river: 'M0,950 C360,880 520,1000 840,940 S1400,840 2000,940', lake: { cx: 860, cy: 150, rx: 70, ry: 38 },
    districts: districts.map((d) => ({ id: d.id, name: d.name, kind: d.kind, color: d.color, poly: d.P.map((p) => p.map(Math.round)), locked: Boolean(d.locked) })), labels,
  };
}

// ---------------------------------------------------------------- endereços, posições e rotas
export function address(w, node) {
  const g = geo(w);
  const info = g.nodeInfo[node];
  if (!info) return 'Nexus City';
  if (info.hw) return `${info.hw}, km ${Math.round(node % 40) + 1} — Nexus City`;
  const street = (info.i + info.j) % 2 === 0 ? info.row : info.col;
  const number = 10 + ((Math.abs(info.i) * 37 + Math.abs(info.j) * 53 + node) % 1900);
  const d = g.districts.find((x) => x.id === info.d);
  return `${street}, ${number} — ${d?.name || ''}`;
}
// escolhe um nó livre num bairro (ou perto de um ponto)
export function freeNode(w, districtId, { near = null, used = null } = {}) {
  const g = geo(w);
  const taken = used || new Set((w.city?.places || []).map((p) => p.node));
  let list = (g.byDistrict[districtId] || []).filter((n) => !taken.has(n));
  if (!list.length) list = Object.values(g.byDistrict).flat().filter((n) => !taken.has(n));
  if (!list.length) return 0;
  if (near) return list.reduce((b, n) => (dist(g.nodes[n], near) < dist(g.nodes[b], near) ? n : b), list[0]);
  return list[Math.floor(Math.random() * list.length)];
}
export function nodeOf(w, pt) {
  const g = geo(w);
  let best = 0; let bd = 1e9;
  for (const list of Object.values(g.byDistrict)) for (const n of list) { const dd = dist(g.nodes[n], pt); if (dd < bd) { bd = dd; best = n; } }
  return best;
}
export function districtOfNode(w, node) { return geo(w).nodeInfo[node]?.d || null; }
export const pos = (w, node) => geo(w).nodes[node] || [W / 2, H / 2];

export function route(w, from, to) {
  const g = geo(w);
  const n = g.nodes.length;
  if (from == null || to == null || from >= n || to >= n) return null;
  const distA = new Float64Array(n).fill(Infinity); const prev = new Int32Array(n).fill(-1); const via = new Array(n);
  const done = new Uint8Array(n);
  distA[from] = 0;
  // fila de prioridade simples (heap binário)
  const heap = [[0, from]];
  const push = (x) => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1; const r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [dcur, v] = pop();
    if (done[v]) continue;
    done[v] = 1;
    if (v === to) break;
    for (const { to: u, e } of g.adj[v]) {
      const nd = dcur + e.len * (KIND_COST[e.kind] || 1);
      if (nd < distA[u]) { distA[u] = nd; prev[u] = v; via[u] = e; push([nd, u]); }
    }
  }
  if (!Number.isFinite(distA[to])) return null;
  const path = []; const streets = [];
  let length = 0;
  for (let v = to; v !== -1; v = prev[v]) { path.push(g.nodes[v]); if (via[v]) { length += via[v].len; if (streets.at(-1) !== via[v].name) streets.push(via[v].name); } }
  path.reverse(); streets.reverse();
  const meters = Math.round(length * METERS_PER_UNIT);
  return { path, meters, streets: streets.filter(Boolean).slice(0, 8), minutes: { pe: Math.max(1, Math.round(meters / 80)), onibus: Math.max(3, Math.round(meters / 330) + 6), taxi: Math.max(2, Math.round(meters / 500) + 2) } };
}

// dados enviados ao navegador (estáticos enquanto a cidade não cresce)
export function geoPublic(w) {
  const g = geo(w);
  const byKind = { rua: [], avenida: [], rodovia: [], acesso: [] };
  for (const e of g.edges) (byKind[e.kind] || byKind.rua).push([e.a, e.b]);
  return { w: g.w, h: g.h, nodes: g.nodes, edges: byKind, hw: g.hwPaths, land: g.landPath, river: g.river, lake: g.lake, parks: g.parks, piers: g.piers, districts: g.districts, labels: g.labels, version: `${w.city?.mapSeed}-${g.districts.filter((d) => !d.locked).length}` };
}

// ---------------------------------------------------------------- atualização: mundos existentes ganham o mapa novo
onUpgrade(2, (ctx) => {
  const w = ctx.w;
  if (!w.city) return;
  w.city.mapSeed ??= 1 + Math.floor(Math.random() * 1e6);
  w.city.name = 'Nexus City';
  const used = new Set();
  for (const pl of w.city.places) {
    const near = [(pl.x || 500) * SCALE, (pl.y || 300) * SCALE];
    pl.node = freeNode(w, pl.districtId, { near, used });
    used.add(pl.node);
    [pl.x, pl.y] = pos(w, pl.node);
    pl.address = address(w, pl.node);
  }
  // nomes antigos da cidade nos perfis
  for (const p of w.social?.personas || []) if (typeof p.city === 'string') p.city = p.city.replace('Codeniac Society', 'Nexus City');
});
