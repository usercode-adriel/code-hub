// Gerador da cidade do mapa jogável (Nexus City) — traçado urbano refeito do zero. Determinístico.
// Cidade compacta dentro de um anel viário de esquinas curvas (7×4 quarteirões), cortada por duas avenidas
// (Av. Nexus N–S e Av. Brasil L–O, com rotatória central ao lado da Praça Central) e por duas diagonais em "V".
// Anexo logístico/industrial (2×2) junto ao aeroporto. Em volta: cerca com portões, mata densa, lago com parque,
// serra com montanhas e a costa recortada (fora do núcleo, no terreno).
// Quarteirões sem grama: calçada contínua com esquinas arredondadas, miolo calçado, prédios alinhados nas bordas,
// pátios com chafariz, bancos, vasos e postes. As ruas são o asfalto entre os quarteirões ("base" do distrito).
// Saída: só dados (ruas para o grafo de trânsito, chão, construções, objetos, máscara de colisão, alturas, luzes,
// pontos de interesse, regiões, aeroporto e vagas). Unidade = 1 "pixel de arte"; 1 unidade ≈ 0,2 m.
import { BLD } from './bldmeta.js';
import { DECO } from './decometa.js';
import { EXTRA } from './extrameta.js';
import { SOLID, WALK, ROAD, CROSS, LOT, WATER, GRASS, RUNWAY, PLAZA, SAND } from './world.js';
import { CATALOG, genKey, placed } from './obra.js';
import { terrainOf } from './terreno.js';

export const W = 4096; export const H = 2816; export const CS = 4;

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const snap = (v) => Math.round(v / CS) * CS;

// ---------------------------------------------------------------- geometria
const nrm = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
// polígono convexo recuado: cada lado anda d[i] para dentro (vértice i' = encontro dos lados i-1 e i recuados)
function insetPoly(P, d) {
  const n = P.length; const cx = P.reduce((s, p) => s + p[0], 0) / n; const cy = P.reduce((s, p) => s + p[1], 0) / n;
  const L = P.map((p, i) => { const q = P[(i + 1) % n]; const [ex, ey] = nrm(q[0] - p[0], q[1] - p[1]); let nx = -ey; let ny = ex; if (nx * (cx - p[0]) + ny * (cy - p[1]) < 0) { nx = -nx; ny = -ny; } return { px: p[0] + nx * d[i], py: p[1] + ny * d[i], ex, ey }; });
  return P.map((_, i) => {
    const a = L[(i - 1 + n) % n]; const b = L[i]; const den = a.ex * b.ey - a.ey * b.ex;
    if (Math.abs(den) < 1e-9) return [b.px, b.py];
    const t = ((b.px - a.px) * b.ey - (b.py - a.py) * b.ex) / den; return [a.px + a.ex * t, a.py + a.ey * t];
  });
}
// cantos arredondados (raio por vértice) — arcos tangentes aos dois lados
function roundPoly(P, r) {
  const n = P.length; const out = [];
  for (let i = 0; i < n; i++) {
    const V = P[i]; const A = P[(i - 1 + n) % n]; const B = P[(i + 1) % n]; let rad = typeof r === 'number' ? r : r[i];
    const [u1x, u1y] = nrm(A[0] - V[0], A[1] - V[1]); const [u2x, u2y] = nrm(B[0] - V[0], B[1] - V[1]);
    const th = Math.acos(Math.max(-1, Math.min(1, u1x * u2x + u1y * u2y)));
    if (!rad || th > 3.1) { out.push(V); continue; }
    let t = rad / Math.tan(th / 2); const lim = 0.48 * Math.min(Math.hypot(A[0] - V[0], A[1] - V[1]), Math.hypot(B[0] - V[0], B[1] - V[1]));
    if (t > lim) { t = lim; rad = t * Math.tan(th / 2); }
    const [bx, by] = nrm(u1x + u2x, u1y + u2y); const dc = rad / Math.sin(th / 2); const C = [V[0] + bx * dc, V[1] + by * dc];
    const T1 = [V[0] + u1x * t, V[1] + u1y * t]; const T2 = [V[0] + u2x * t, V[1] + u2y * t];
    let a1 = Math.atan2(T1[1] - C[1], T1[0] - C[0]); const a2 = Math.atan2(T2[1] - C[1], T2[0] - C[0]); let da = a2 - a1;
    while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    const st = Math.max(2, Math.ceil(Math.abs(da) / 0.22));
    for (let k = 0; k <= st; k++) { const a = a1 + (da * k) / st; out.push([C[0] + Math.cos(a) * rad, C[1] + Math.sin(a) * rad]); }
    void a1;
  }
  return out;
}
const rectPts = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const bboxOf = (pts) => { let a = Infinity; let b = Infinity; let c = -Infinity; let d = -Infinity; for (const [x, y] of pts) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); } return [a, b, c, d]; };
const inPoly = (pts, x, y) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i]; const [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };

// ---------------------------------------------------------------- traçado
const XL = [440, 760, 1080, 1400, 1720, 2040, 2360, 2680]; const YL = [1248, 1568, 1888, 2208, 2528];
const AX = [2680, 3140, 3600]; const AY = [1248, 1728, 2208];
const RING = 40; const AV = 48; const ST = 32; const DG = 40; const RC = 160; // raio das esquinas do anel
const wV = (x) => (x === 440 || x === 2680 ? RING : x === 1400 ? AV : ST);
const wH = (y) => (y === 1248 || y === 2528 ? RING : y === 1888 ? AV : ST);
const NAMES = {
  V: { 440: 'Anel Viário Oeste', 760: 'Rua das Flores', 1080: 'Rua Central', 1400: 'Av. Nexus', 1720: 'Rua do Comércio', 2040: 'Rua dos Bancos', 2360: 'Rua da Estação', 2680: 'Anel Viário Leste', 3140: 'Rua dos Galpões', 3600: 'Rua do Porto Seco' },
  H: { 1248: 'Anel Viário Norte', 1568: 'Rua das Nações', 1888: 'Av. Brasil', 2208: 'Rua da Ponte', 2528: 'Anel Viário Sul', 1728: 'Rua das Fábricas' },
};
// zona de cada quarteirão [linha][coluna]
const ZONES = [
  ['estadio', 'escola', 'hoteis', 'banco', 'prefeitura', 'shopping', 'concessionaria'],
  ['residencial', 'diagA', 'comercial', 'praca', 'comercial', 'diagB', 'hospital'],
  ['residencial', 'terminal', 'diagA', 'policia', 'diagB', 'estacionamento', 'posto'],
  ['cantoSO', 'misto', 'parque', 'mercado', 'misto', 'residencial', 'cantoSE'],
];
const ANNEX = [['aeroparque', 'galpoes'], ['fabrica', 'conteineres']];
const REGION = { estadio: 'Estádio', escola: 'Vila Escolar', hoteis: 'Distrito Hoteleiro', banco: 'Distrito Empresarial', prefeitura: 'Centro Cívico', shopping: 'Centro Comercial', concessionaria: 'Centro',
  residencial: 'Bairro Residencial', diagA: 'Largo das Diagonais', diagB: 'Largo das Diagonais', comercial: 'Centro Comercial', praca: 'Praça Central', hospital: 'Centro', terminal: 'Terminal Rodoviário',
  policia: 'Centro', estacionamento: 'Centro', posto: 'Centro', cantoSO: 'Bairro Residencial', cantoSE: 'Bairro Residencial', misto: 'Bairro Residencial', parque: 'Parque Sul', mercado: 'Centro Comercial',
  aeroparque: 'Aeroporto Nexus', galpoes: 'Área Industrial', fabrica: 'Área Industrial', conteineres: 'Porto Seco' };

// reforma: { shape, add: [{id,k,x,y,r,s}], del: [chaves de itens gerados], floor: [{k,x,y}] } (modo Reforma)
export function generateCity(seed = 20261119, { reforma = null } = {}) {
  const R = rng(seed);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const RF = reforma || {}; const DEL = new Set(RF.del || []);
  const userAdd = (RF.add || []).map((a) => [a, placed(a)]).filter(([, o]) => o);
  const userFloor = (RF.floor || []).filter((f) => CATALOG[f.k]?.kind === 'floor').map((f) => ({ mat: CATALOG[f.k].mat, shape: 'rect', x: f.x, y: f.y, w: 32, h: 32, u: 1, tex: CATALOG[f.k].tex, rot: f.r || 0 }));
  const reserved = userFloor.map((f) => [f.x, f.y, f.w, f.h]);

  // ---------------------------------------------------------------- grafo de ruas
  const nodes = {}; const roads = [];
  const nid = (x, y) => `n${x}_${y}`;
  const node = (x, y, kind) => { const id = nid(x, y); if (!nodes[id]) nodes[id] = [x, y, kind]; else if (kind) nodes[id][2] = kind; return id; };
  const CORNERS = new Set(['440,1248', '440,2528', '2680,2528']);
  for (const x of XL) for (const y of YL) if (!CORNERS.has(`${x},${y}`)) node(x, y);
  for (const [x, y] of [[3140, 1248], [3600, 1248], [2680, 1728], [3140, 1728], [3600, 1728], [3140, 2208], [3600, 2208]]) node(x, y);
  node(1400, 0, 'exit'); node(1400, H, 'exit'); node(0, 1888, 'exit'); node(W, 2208, 'exit');
  node(1400, 1888, 'round');
  const road = (id, name, w, pts, extra = {}) => roads.push({ id, name, w, path: pts.map(([x, y]) => nid(x, y)), ...extra });
  for (const x of [760, 1080, 1400, 1720, 2040, 2360]) road(`V${x}`, NAMES.V[x], wV(x), [...(x === 1400 ? [[1400, 0]] : []), ...YL.map((y) => [x, y]), ...(x === 1400 ? [[1400, H]] : [])]);
  road('V440', NAMES.V[440], RING, [[440, 1568], [440, 1888], [440, 2208]]);
  road('V2680', NAMES.V[2680], RING, [[2680, 1248], [2680, 1568], [2680, 1728], [2680, 1888], [2680, 2208]]);
  for (const y of [1568, 1888, 2208]) road(`H${y}`, NAMES.H[y], y === 2208 ? ST : wH(y), [...(y === 1888 ? [[0, 1888]] : []), ...XL.map((x) => [x, y])]);
  road('H2208L', 'Estrada do Leste', 40, [[2680, 2208], [3140, 2208], [3600, 2208], [W, 2208]]);
  road('H1248', NAMES.H[1248], RING, XL.slice(1).map((x) => [x, 1248]));
  road('H1248L', 'Av. do Aeroporto', ST, [[2680, 1248], [3140, 1248], [3600, 1248]]);
  road('H2528', NAMES.H[2528], RING, XL.slice(1, 7).map((x) => [x, 2528]));
  road('V3140', NAMES.V[3140], ST, [[3140, 1248], [3140, 1728], [3140, 2208]]);
  road('V3600', NAMES.V[3600], ST, [[3600, 1248], [3600, 1728], [3600, 2208]]);
  road('H1728', NAMES.H[1728], ST, [[2680, 1728], [3140, 1728], [3600, 1728]]);
  road('DA', 'Diagonal das Flores', DG, [[760, 1568], [1080, 1888], [1400, 2208]]);
  road('DB', 'Diagonal do Comércio', DG, [[2360, 1568], [2040, 1888], [1720, 2208]]);
  // esquinas curvas do anel (traçado em arco)
  const arc = (cx, cy, r, a0, a1) => { const o = []; for (let k = 0; k <= 8; k++) { const a = a0 + ((a1 - a0) * k) / 8; o.push([Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r)]); } return o; };
  const curve = (id, name, a, b, mid) => roads.push({ id, name, w: RING, path: [nid(...a), nid(...b)], shape: [a, ...mid, b] });
  curve('CNO', 'Anel Viário', [760, 1248], [440, 1568], arc(600, 1408, RC, -Math.PI / 2, -Math.PI));
  curve('CSO', 'Anel Viário', [440, 2208], [760, 2528], arc(600, 2368, RC, Math.PI, Math.PI / 2));
  curve('CSE', 'Anel Viário', [2360, 2528], [2680, 2208], arc(2520, 2368, RC, Math.PI / 2, 0));
  // tipo de cada nó: cruzamento (3+ ligações) ou esquina
  const deg = {}; const maxW = {};
  for (const rd of roads) rd.path.forEach((id, i) => { deg[id] = (deg[id] || 0) + (i > 0) + (i < rd.path.length - 1); maxW[id] = Math.max(maxW[id] || 0, rd.w); });
  for (const [id, n] of Object.entries(nodes)) if (!n[2]) n[2] = deg[id] >= 3 ? undefined : 'corner';
  const lights = [];
  for (const [id, [, , k]] of Object.entries(nodes)) { if (k) continue; if (maxW[id] >= 40 || deg[id] >= 5 || R() < 0.35) lights.push(id); }
  // linhas (para as marcações das faixas) e trechos retos (para continuar as saídas no terreno)
  const clearOf = (id) => { const k = nodes[id][2]; return k === 'round' ? 52 : k === 'corner' || k === 'exit' ? 0 : maxW[id] / 2 + 14; };
  const lines = []; const segs = [];
  for (const rd of roads) {
    const pairs = rd.shape ? [[rd.path[0], rd.path.at(-1), rd.shape]] : rd.path.slice(1).map((b, i) => [rd.path[i], b, null]);
    for (const [a, b, sh] of pairs) lines.push({ pts: sh ? sh.map((p) => p.slice()) : [nodes[a].slice(0, 2), nodes[b].slice(0, 2)], w: rd.w, ca: clearOf(a), cb: clearOf(b), diag: rd.id.startsWith('D'), road: rd.id });
    if (rd.shape || rd.id.startsWith('D')) continue;
    const P = rd.path.map((id) => nodes[id]); const v = P[0][0] === P.at(-1)[0];
    if (v) segs.push({ v: true, x: P[0][0], y0: P[0][1], y1: P.at(-1)[1], w: rd.w, name: rd.name }); else segs.push({ v: false, y: P[0][1], x0: P[0][0], x1: P.at(-1)[0], w: rd.w, name: rd.name });
  }

  // ---------------------------------------------------------------- camadas e auxiliares
  const ground = [];
  const G = (mat, x, y, w, h, shape = 'rect', extra = {}) => ground.push({ mat, shape, x: snap(x), y: snap(y), w: snap(w), h: snap(h), ...extra });
  const GP = (mat, pts, extra = {}) => { const [a, b, c, d] = bboxOf(pts); ground.push({ mat, shape: 'poly', pts, x: a, y: b, w: c - a, h: d - b, ...extra }); };
  const blds = []; const props = []; const lamps = []; const pois = []; const regions = []; const spots = []; const decals = []; let rentSpot = null;
  const B = (o) => { const b = { floors: 2, ...o, x: snap(o.x), y: snap(o.y), w: snap(o.w), h: snap(o.h) }; blds.push(b); return b; };
  const P = (spr, x, y, w, h, solid = false, extra = {}) => props.push({ spr, x, y, w, h, solid, ...extra });
  const poi = (id, label, x, y, route, icon) => pois.push({ id, label, at: [Math.round(x), Math.round(y)], route, icon });
  const SP = (spr, x, y, h, extra = {}) => { const [sw, sh] = BLD[spr] || [100, 150]; const w = (h * sw) / sh; return B({ kind: 'sprite', spr, x, y, w, h, floors: Math.max(1, Math.round((sh / sw) * 4)), ...extra }); };
  const wOfS = (spr, h) => { const [sw, sh] = BLD[spr] || [100, 150]; return (h * sw) / sh; };
  const fitIn = (spr, x0, y0, w, h, extra) => { const [sw, sh] = BLD[spr]; const k = Math.min(w / sw, h / sh); return B({ kind: 'sprite', spr, x: x0 + (w - sw * k) / 2, y: y0 + (h - sh * k), w: sw * k, h: sh * k, floors: Math.max(2, Math.round((sh / sw) * 4)), ...extra }); };
  const DH = { arvore: 40, coqueiro: 46, 'arvore-vaso': 26, 'arvore-vaso2': 26, 'flores-v': 12, 'flores-b': 12, 'flores-a': 12, 'arbusto-c': 13, 'arbusto-c2': 13, 'arbusto-vaso': 14, 'arbusto-vaso2': 18,
    banco: 13, banco2: 13, 'lixeira-verde': 11, 'lixeira-cinza': 11, 'correio-azul': 12, 'correio-vermelho': 12, poste: 26, 'poste-duplo': 26, 'poste-triplo': 28, 'poste-madeira': 30,
    grade: 15, grade2: 15, cerca: 12, barreira: 11, cone: 8, cavalete: 10, tambor: 9, hidrante: 10, 'banca-jornal': 18, telefone: 20, 'ponto-onibus': 22, 'placa-onibus': 18,
    'placa-direcao': 22, 'placa-hotel': 24, 'placa-bar': 24, 'placa-motel': 24, 'placa-p': 15, 'placa-proibido': 15, 'placa-50': 15, 'placa-pare': 15, 'placa-pedestre': 15, semaforo: 16,
    'maq-bebida': 17, 'maq-lanche': 17, orelhao: 16, quiosque: 22, feira: 20, guarita: 20, 'caixa-luz': 15, armario: 15, armario2: 15, caixotes: 15, pneus: 10, barril: 14, cavalete2: 11 };
  const PX = (name, x, y, solid = false, extra = {}) => { const [sw, sh] = DECO[name] || [40, 40]; const h = extra.size || DH[name] || 14; const w = (h * sw) / sh; P(`d:${name}`, x, y, w, h, solid, { ht: name.startsWith('arvore') || name === 'coqueiro' ? 18 : 6, deco: true, ...extra }); };
  // sprites das folhas extras (natureza, relevo, mobiliário): escala própria × k
  const XP = (key, x, y, k = 1, solid = true, extra = {}) => { const e = EXTRA[key]; if (!e) return; const w = e[0] * e[5] * k; const h = e[1] * e[5] * k; P(`x:${key}`, x, y, w, h, solid, { ht: e[3] === 'relevo' ? Math.min(200, Math.round(h * 0.8)) : 14, deco: true, ...extra }); };
  const XD = (key, cx, cy, k = 1) => { const e = EXTRA[key]; if (!e) return; const w = e[0] * e[5] * k; const h = e[1] * e[5] * k; decals.push({ spr: `x:${key}`, x: cx - w / 2, y: cy - h / 2, w, h }); };
  // chafariz desenhado no chão (borda de pedra, água e jato): círculo de raio r
  const FONTE = (cx, cy, k = 1) => { const r = 30 * k; decals.push({ spr: '@fonte', x: cx - r, y: cy - r, w: r * 2, h: r * 2 }); };
  const TREES = ['arvore0', 'arvore1', 'arvore2', 'arvore3', 'arvore4'];
  const tree = (x, y, big = true) => { if (big && R() < 0.35) PX(R() < 0.6 ? 'arvore' : 'arvore-vaso', x, y, true); else P(big ? pick(TREES) : `arbusto${R() < 0.5 ? 0 : 1}`, x, y, big ? 20 : 14, big ? 34 : 18, true, { ht: 18 }); };
  // árvore de mata (nunca de vaso): pinheiros, copas grandes e árvores das folhas
  const pine = (x, y) => { const r = R(); if (r < 0.32) XP('pinheiro', x, y, 0.55 + R() * 0.2); else if (r < 0.44) XP(pick(['arvore-nat3', 'arvore-nat1', 'arvore-nat4']), x, y, 0.45 + R() * 0.15); else if (r < 0.56) PX('arvore', x, y, true, { size: 36 + R() * 10 }); else P(pick(TREES), x, y, 20, 34, true, { ht: 18 }); };
  // densidade da mata varia (bosques fechados e clareiras)
  const dens = (x, y) => 0.5 + 0.5 * Math.sin(x * 0.0061 + Math.sin(y * 0.0043) * 2.1) * Math.cos(y * 0.0057 + x * 0.0013);
  // fileira de prédios que preenche a largura (o que sobra vira espaço entre eles, com plantas nos vãos maiores)
  function row(x0, x1, y, h, list, { gap = 4, trees = 0, maxGap = 14 } = {}) {
    const picks = []; let x = x0;
    for (;;) { const fit = list.filter((k) => wOfS(k, h) <= x1 - x); if (!fit.length) break; const k = pick(fit); picks.push(k); x += wOfS(k, h) + gap; }
    const total = picks.reduce((a, k) => a + wOfS(k, h), 0); const n = picks.length;
    const g = n > 1 ? Math.max(gap, Math.min(maxGap, (x1 - x0 - total) / (n - 1))) : 0;
    let xx = x0 + Math.max(0, (x1 - x0 - (total + g * Math.max(0, n - 1))) / 2); const out = [];
    picks.forEach((k, i) => { out.push(SP(k, xx, y, h)); xx += wOfS(k, h); if (i < n - 1) { if (g >= 10 && R() < (trees || 0.7)) PX(R() < 0.5 ? 'arvore-vaso' : 'arbusto-vaso2', xx + g / 2, y + h - 1, true); xx += g; } });
    return out;
  }
  const RES = ['house', 'house-blue', 'res-a1', 'res-a2', 'res-a3', 'res-a4', 'house', 'house-blue'];
  const APT = ['apt-beige', 'apt-green', 'apt-brick', 'res-a1', 'res-a2', 'res-a4'];
  const SHOPS = ['shop', 'food', 'cafe', 'market', 'burger', 'pizza', 'diner', 'bar', 'store247', 'grocery', 'pharmacy', 'pizza2', 'burger2', 'video', 'fashion', 'diner2', 'bar2', 'gym'];
  const TOWERS = ['tower-glass', 'tower-glass2', 'tower-heli', 'tower-beige', 'office', 'office2', 'hotel-tall'];
  const IND = ['warehouse-blue', 'warehouse-brick', 'loading', 'industrial', 'ind-blue'];

  // ---------------------------------------------------------------- distritos: asfalto (as ruas) e calçada externa
  const cityBase = roundPoly(rectPts(440 - 20, 1248 - 20, 2680 + 20, 2528 + 20), [RC + 20, 0, RC + 20, RC + 20]);
  const cityWalk = roundPoly(rectPts(440 - 36, 1248 - 36, 2680 + 36, 2528 + 36), [RC + 36, 0, RC + 36, RC + 36]);
  const annexBase = roundPoly(rectPts(2680, 1248 - 16, 3600 + 16, 2208 + 20), [0, 16, 16, 0]);
  const annexWalk = roundPoly(rectPts(2680, 1248 - 32, 3600 + 32, 2208 + 36), [0, 30, 30, 0]);
  GP('walk', cityWalk); GP('walk', annexWalk); GP('base', cityBase); GP('base', annexBase);
  // saídas: estrada com acostamento (calçada) até a borda do núcleo
  for (const [rx, ry, rw, rh, wk] of [[1376, 0, 48, 1230, 'v'], [1376, 2546, 48, H - 2546, 'v'], [0, 1864, 422, 48, 'h'], [3614, 2188, W - 3614, 40, 'h']]) {
    if (wk === 'v') G('walk', rx - 16, ry, rw + 32, rh); else G('walk', rx, ry - 16, rw, rh + 32);
    G('road', rx, ry, rw, rh);
  }

  // ---------------------------------------------------------------- quarteirões (polígonos)
  const blocks = [];
  const ROT = [1400, 1888];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 7; c++) {
    const x0 = XL[c]; const x1 = XL[c + 1]; const y0 = YL[r]; const y1 = YL[r + 1];
    const ins = [wH(y0) / 2, wV(x1) / 2, wH(y1) / 2, wV(x0) / 2]; // topo, direita, base, esquerda
    if (y1 === 2208) ins[2] = ST / 2; if (y0 === 2208) ins[0] = ST / 2;
    const V = rectPts(x0, y0, x1, y1);
    const rad = V.map(([vx, vy]) => (CORNERS.has(`${vx},${vy}`) ? RC - 20 : vx === ROT[0] && vy === ROT[1] ? 44 : 14));
    const z = ZONES[r][c];
    const pieces = [];
    if (z === 'diagA') { pieces.push([[V[0], V[1], V[2]], [ins[0], ins[1], DG / 2], [rad[0], rad[1], rad[2]], 'tri1']); pieces.push([[V[0], V[2], V[3]], [DG / 2, ins[2], ins[3]], [rad[0], rad[2], rad[3]], 'tri2']); }
    else if (z === 'diagB') { pieces.push([[V[0], V[1], V[3]], [ins[0], DG / 2, ins[3]], [rad[0], rad[1], rad[3]], 'tri1']); pieces.push([[V[1], V[2], V[3]], [ins[1], ins[2], DG / 2], [rad[1], rad[2], rad[3]], 'tri2']); }
    else pieces.push([V, ins, rad, 'rect']);
    for (const [verts, d, rr, part] of pieces) {
      const core = insetPoly(verts, d); const inner = insetPoly(verts, d.map((v) => v + 16));
      blocks.push({ zone: z, part, c, r, cell: [x0, y0, x1, y1], curb: roundPoly(core, rr), inner, pave: roundPoly(inner, rr.map((v) => Math.max(6, v - 16))) });
    }
  }
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const x0 = AX[i]; const x1 = AX[i + 1]; const y0 = AY[j]; const y1 = AY[j + 1];
    const d = [16, 16, j === 1 ? 20 : 16, i === 0 ? RING / 2 : 16]; const V = rectPts(x0, y0, x1, y1);
    blocks.push({ zone: ANNEX[j][i], part: 'rect', c: 7 + i, r: 4 + j, cell: [x0, y0, x1, y1], curb: roundPoly(insetPoly(V, d), 14), inner: insetPoly(V, d.map((v) => v + 16)), pave: roundPoly(insetPoly(V, d.map((v) => v + 16)), 6) });
  }

  // ---------------------------------------------------------------- composição de cada quarteirão
  const drive = (bb, side, x) => { // rebaixo de calçada (entrada de carro) até a rua
    const [x0, y0, x1, y1] = bb;
    if (side === 's') G('lot', x - 20, y1 - 4, 40, 22); else if (side === 'n') G('lot', x - 20, y0 - 18, 40, 22);
    else if (side === 'e') G('lot', x1 - 4, x - 20, 22, 40); else G('lot', x0 - 18, x - 20, 22, 40);
  };
  function compose(b) {
    const z = b.zone; const bb = bboxOf(b.pave); const [x0, y0, x1, y1] = bb; const bw = x1 - x0; const bh = y1 - y0; const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2;
    const groundMat = ['estacionamento', 'aeroparque', 'galpoes', 'fabrica', 'conteineres', 'posto', 'concessionaria'].includes(z) ? 'lot' : 'pave';
    GP('curb', b.curb); GP(groundMat, b.pave, groundMat === 'lot' ? { stalls: ['estacionamento', 'aeroparque'].includes(z), industrial: ['galpoes', 'fabrica', 'conteineres'].includes(z) } : {});
    const south = YL[b.r + 1] ? YL[b.r + 1] : AY[b.r - 3]; void south;
    const poiY = y1 + 22; // calçada da rua de baixo
    const courtyard = (ya, yb) => { // pátio entre fileiras: chafariz no meio, bancos, vasos e flores
      const h = yb - ya; const m = (ya + yb) / 2; if (h < 26) return;
      if (h >= 50) { FONTE( cx, m - 2, Math.min(0.8, h / 80)); P('chafariz', cx, m + 10, 24, 20, true, { ht: 6, deco: true, hidden: true }); }
      for (const s of [-1, 1]) { PX('banco', cx + s * 46, m + 6); PX(s < 0 ? 'flores-v' : 'flores-b', cx + s * 74, m + 6); PX('arvore-vaso', cx + s * (bw / 2 - 14), m + 10, true); PX('lixeira-verde', cx + s * 60, m + 6); }
      PX('poste', cx - 26, m - 10, false, { lamp: true, size: 22 }); lamps.push([cx - 26, m - 10]);
    };
    switch (z) {
      case 'comercial': case 'mercado': {
        const H1 = 84;
        const top = row(x0 + 2, x1 - 2, y0 + 2, z === 'mercado' ? 104 : H1, z === 'mercado' ? ['supermarket', 'grocery', 'pharmacy'] : SHOPS);
        row(x0 + 2, x1 - 2, y1 - H1 - 2, H1, SHOPS);
        courtyard(y0 + (z === 'mercado' ? 108 : H1 + 4), y1 - H1 - 6);
        if (z === 'mercado') { poi('mercado2', 'Supermercado', cx, poiY, '#/mercado', 'cart'); poi('imobiliaria', 'Imobiliária Horizonte', x0 + 40, poiY, '#/propriedades', 'building'); if (top[0]) top[0].label = 'Supermercado Nexus'; }
        if (b.c === 2 && b.r === 1) poi('lojas', 'Lojas do centro', cx, poiY, '#/mercado', 'bag');
        if (b.c === 4 && b.r === 1) poi('empregos', 'Agência de Empregos', cx, poiY, '#/empregos', 'briefcase');
        break;
      }
      case 'misto': row(x0 + 2, x1 - 2, y0 + 2, 116, APT, { gap: 6 }); row(x0 + 2, x1 - 2, y1 - 86, 84, SHOPS); courtyard(y0 + 122, y1 - 90); break;
      case 'residencial': {
        row(x0 + 4, x1 - 4, y0 + 2, 96, RES, { gap: 8 }); row(x0 + 4, x1 - 4, y1 - 98, 96, RES, { gap: 8 });
        // quintal comum: canteiro com árvores e flores entre as duas fileiras
        const ya = y0 + 104; const yb = y1 - 104;
        if (yb - ya > 18) { GP('bed', roundPoly(rectPts(x0 + 10, ya, x1 - 10, yb), 8)); for (let x = x0 + 26; x < x1 - 16; x += 34) tree(x, (ya + yb) / 2 + 12, R() < 0.7); }
        break;
      }
      case 'estadio': {
        // quina curva do anel a noroeste: o estádio fica afastado do canto arredondado
        const s = fitIn('stadium', x0 + 64, y0 + 20, bw - 70, bh - 84, { label: 'Estádio Nexus' });
        for (let k = 0; k < 5; k++) tree(x0 + 30 + k * 7, y0 + 120 + k * 22, R() < 0.6);
        G('lot', x0 + 10, y1 - 56, bw - 20, 50, 'rect', { stalls: true }); drive(bb, 's', cx);
        for (let k = 0; k < 7; k++) spots.push([x0 + 30 + k * ((bw - 60) / 6), y1 - 30, -Math.PI / 2]);
        for (let x = x0 + 24; x < x1 - 16; x += 40) PX(x % 80 < 40 ? 'arvore-vaso' : 'banco', x, s.y + s.h + 12, x % 80 < 40);
        poi('estadio', 'Estádio Nexus', s.x + s.w / 2, poiY, '#/diversao', 'trophy');
        break;
      }
      case 'escola': {
        const s = fitIn('school', x0 + 10, y0 + 4, bw - 20, 150, { label: 'Escola Nexus' });
        G('pave', x0 + 24, y0 + 166, bw - 48, bh - 180, 'rect', { court: true });
        for (const x of [x0 + 12, x1 - 12]) for (let y = y0 + 170; y < y1 - 10; y += 30) PX('arvore-vaso', x, y, true);
        XP('mastro', s.x + s.w + 8, s.y + s.h, 1, false);
        poi('escola', 'Escola e Universidade', cx, poiY, '#/empresas/carreira', 'school');
        break;
      }
      case 'hoteis': {
        const bs = row(x0 + 2, x1 - 2, y0 + 2, 150, ['hotel', 'casino', 'hotel-tall'], { gap: 6 });
        courtyard(y0 + 156, y1 - 4);
        const cs = bs.find((q) => q.spr === 'casino'); if (cs) { cs.label = 'Cassino Royal'; poi('cassino', 'Cassino Royal', cs.x + cs.w / 2, poiY, '#/diversao', 'trophy'); }
        const ht = bs.find((q) => q.spr.startsWith('hotel')); if (ht) poi('hotel', 'Hotel Nexus Palace', ht.x + ht.w / 2, poiY, '#/acontecimentos', 'building');
        break;
      }
      case 'banco': {
        const bs = row(x0 + 2, x1 - 2, y0 + 2, 168, ['bank', 'bank2', 'tower-glass', 'office2'], { gap: 6 });
        const bk = bs.find((q) => q.spr.startsWith('bank')) || bs[0]; if (bk) { bk.label = 'Banco Nexus'; poi('banco', 'Banco Nexus', bk.x + bk.w / 2, poiY, '#/banco', 'wallet'); }
        courtyard(y0 + 174, y1 - 4);
        break;
      }
      case 'prefeitura': {
        const c1 = fitIn('cityhall', x0 + 2, y0 + 4, bw * 0.56, 150, { label: 'Prefeitura' });
        const c2 = fitIn('courthouse', c1.x + c1.w + 6, y0 + 4, x1 - c1.x - c1.w - 8, 150, { label: 'Fórum' });
        courtyard(y0 + 160, y1 - 4);
        for (const k of [-1, 0, 1]) XP('mastro', c1.x + c1.w / 2 + k * 16, c1.y + c1.h + 18, 1, false);
        poi('prefeitura', 'Prefeitura', c1.x + c1.w / 2, poiY, '#/governo', 'flag'); poi('forum', 'Fórum', c2.x + c2.w / 2, poiY, '#/justica', 'scale');
        break;
      }
      case 'shopping': {
        const m = fitIn('mall2', x0 + 6, y0 + 4, bw - 12, 150, { label: 'Shopping Nexus' });
        G('lot', x0 + 6, y0 + 166, bw - 12, bh - 172, 'rect', { stalls: true }); drive(bb, 's', cx);
        for (let k = 0; k < 8; k++) spots.push([x0 + 26 + k * ((bw - 52) / 7), y0 + 196, -Math.PI / 2]);
        poi('shopping', 'Shopping Nexus', m.x + m.w / 2, poiY, '#/mercado', 'bag');
        break;
      }
      case 'concessionaria': {
        const bs = row(x0 + 4, x1 - 4, y0 + 4, 104, ['garage', 'autoparts', 'garage'], { gap: 6 }); if (bs[0]) bs[0].label = 'Concessionária Turbo';
        drive(bb, 's', cx); for (let k = 0; k < 6; k++) spots.push([x0 + 30 + k * ((bw - 60) / 5), y0 + 170, -Math.PI / 2]);
        for (const x of [x0 + 10, x1 - 10]) PX('arvore-vaso', x, y1 - 8, true);
        poi('concessionaria', 'Concessionária Turbo', cx, poiY, '#/veiculos', 'car');
        break;
      }
      case 'hospital': {
        const h = fitIn('hospital2', x0 + 4, y0 + 4, bw * 0.66, bh - 70, { label: 'Hospital Nexus' });
        fitIn('hospital', h.x + h.w + 6, y0 + 40, x1 - h.x - h.w - 10, bh - 110);
        G('lot', x0 + 6, y1 - 58, bw - 12, 52, 'rect', { stalls: false }); drive(bb, 's', cx);
        PX('placa-p', x0 + 14, y1 - 60); poi('hospital', 'Hospital Nexus', h.x + h.w / 2, poiY, '#/hospital', 'hospital');
        break;
      }
      case 'policia': {
        const p1 = fitIn('police2', x0 + 26, y0 + 30, bw / 2 - 30, 150, { label: 'Delegacia' });
        const f1 = fitIn('fire2', x0 + bw / 2 + 4, y0 + 30, bw / 2 - 10, 150, { label: 'Bombeiros' });
        G('lot', x0 + 6, y1 - 60, bw - 12, 54, 'rect', { stalls: false }); drive(bb, 's', p1.x + p1.w / 2); drive(bb, 's', f1.x + f1.w / 2);
        poi('policia', 'Delegacia', p1.x + p1.w / 2, poiY, '#/policia', 'shield'); poi('bombeiros', 'Corpo de Bombeiros', f1.x + f1.w / 2, poiY, '#/acontecimentos', 'flame');
        break;
      }
      case 'terminal': {
        const bs = row(x0 + 4, x1 - 4, y0 + 4, 116, ['busterminal'], { gap: 4 }); if (bs[0]) bs[0].label = 'Terminal Rodoviário';
        G('lot', x0 + 6, y0 + 128, bw - 12, bh - 134, 'rect', { stalls: false, bus: true }); drive(bb, 's', cx); drive(bb, 'w', y0 + 180);
        for (let k = 0; k < 3; k++) XP('abrigo-onibus', x0 + 50 + k * ((bw - 100) / 2), y0 + 152, 0.9, true);
        PX('placa-onibus', x0 + 14, y0 + 150); PX('maq-lanche', x1 - 14, y0 + 150, true); PX('maq-bebida', x1 - 28, y0 + 150, true);
        poi('terminal', 'Terminal Rodoviário', cx, poiY, '#/acontecimentos', 'bus');
        break;
      }
      case 'estacionamento': {
        for (let r2 = 0; r2 < 3; r2++) for (let k = 0; k < 7; k++) spots.push([x0 + 30 + k * ((bw - 60) / 6), y0 + 44 + r2 * ((bh - 88) / 2), -Math.PI / 2]);
        for (const yy of [y0 + 86, y0 + 170]) { GP('bed', roundPoly(rectPts(x0 + 26, yy - 7, x1 - 26, yy + 7), 6)); for (let x = x0 + 40; x < x1 - 30; x += 46) tree(x, yy + 8, R() < 0.5); }
        drive(bb, 's', cx); drive(bb, 'n', cx); PX('guarita', x0 + 18, y1 - 8, true); PX('placa-p', x0 + 40, y1 - 4);
        for (const x of [x0 + 10, x1 - 10]) for (const y of [y0 + 10, y1 - 10]) PX('arvore-vaso', x, y, true);
        poi('estacionamento', 'Estacionamento Central', cx, poiY, '#/veiculos', 'car');
        break;
      }
      case 'posto': {
        const g = fitIn('gas', x0 + 6, y0 + 10, bw * 0.7, 120, { label: 'Posto Rota' });
        SP('store247', x1 - wOfS('store247', 90) - 6, y1 - 96, 90, { label: 'Conveniência' });
        row(x0 + 6, x1 - wOfS('store247', 90) - 16, y1 - 98, 92, ['autoparts', 'diner2', 'burger2'], { gap: 6 });
        drive(bb, 'n', cx); drive(bb, 'w', y0 + 90);
        poi('posto', 'Posto de combustível', g.x + g.w / 2, poiY, '#/veiculos', 'fuel');
        break;
      }
      case 'praca': {
        // praça: canteiros nos quatro cantos, caminhos em cruz e chafariz no centro com roda de bancos e postes
        const pw = 30;
        for (const [ax, ay, bx, by] of [[x0 + 8, y0 + 8, cx - pw, cy - pw], [cx + pw, y0 + 8, x1 - 8, cy - pw], [x0 + 8, cy + pw, cx - pw, y1 - 8], [cx + pw, cy + pw, x1 - 8, y1 - 8]]) {
          GP('bed', roundPoly(rectPts(ax, ay, bx, by), 12));
          tree(ax + 18, ay + 30, true); tree(bx - 18, ay + 30, true); tree(ax + 18, by - 6, true); tree(bx - 18, by - 6, true);
          PX(pick(['flores-v', 'flores-b', 'flores-a']), (ax + bx) / 2, (ay + by) / 2 + 6);
        }
        FONTE( cx, cy, 1.3); P('chafariz', cx, cy + 22, 52, 46, true, { ht: 6, deco: true, hidden: true });
        for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; const bx = cx + Math.cos(a) * 64; const by = cy + Math.sin(a) * 56; if (k % 2) PX('banco', bx, by + 6); else { PX('poste-triplo', bx, by + 8, false, { lamp: true }); lamps.push([bx, by + 8]); } }
        PX('quiosque', x0 + 22, cy + 4, true); PX('banca-jornal', x1 - 22, cy + 4, true); XP('relogio-rua', cx + pw + 6, y1 - 4, 1, false);
        poi('praca', 'Praça Central', cx, cy + 60, '#/social/eventos', 'sun');
        break;
      }
      case 'parque': {
        GP('bed', roundPoly(rectPts(x0 + 8, y0 + 8, x1 - 8, y1 - 8), 20));
        G('pond', cx - 70, cy - 36, 140, 84, 'ellipse');
        for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; tree(cx + Math.cos(a) * (bw / 2 - 26), cy + 8 + Math.sin(a) * (bh / 2 - 30), R() < 0.8); }
        for (const s of [-1, 1]) { PX('banco', cx + s * 30, cy + 66); PX('poste-triplo', cx + s * 86, cy + 56, false, { lamp: true }); lamps.push([cx + s * 86, cy + 56]); }
        PX('quiosque', cx, y0 + 34, true);
        poi('parque2', 'Parque Sul', cx, cy + 82, '#/social/eventos', 'sun');
        break;
      }
      case 'cantoSO': case 'cantoSE': {
        // esquina curva do anel: bosque de bolso com bancos
        GP('bed', b.pave);
        for (let k = 0; k < 16; k++) { const tx = x0 + 20 + R() * (bw - 40); const ty = y0 + 26 + R() * (bh - 40); if (inPoly(b.pave, tx, ty) && inPoly(b.pave, tx, ty - 24)) tree(tx, ty, R() < 0.8); }
        PX('banco', cx, y0 + 30); PX('poste-triplo', cx + 26, y0 + 30, false, { lamp: true }); lamps.push([cx + 26, y0 + 30]);
        break;
      }
      case 'diagA': case 'diagB': {
        // triângulo cortado pela diagonal: no canto reto um café/loja; ao longo da diagonal, praça de bolso
        const T = b.inner; let ri = 0; for (let i = 0; i < 3; i++) { const A = T[(i + 2) % 3]; const V = T[i]; const C = T[(i + 1) % 3]; const d = (A[0] - V[0]) * (C[0] - V[0]) + (A[1] - V[1]) * (C[1] - V[1]); if (Math.abs(d) < 1) ri = i; }
        const V = T[ri]; const A = T[(ri + 2) % 3]; const C = T[(ri + 1) % 3];
        const leg = Math.min(Math.hypot(A[0] - V[0], A[1] - V[1]), Math.hypot(C[0] - V[0], C[1] - V[1])); const s = leg * 0.46;
        const sx = Math.sign(A[0] - V[0] || C[0] - V[0]); const sy = Math.sign(A[1] - V[1] || C[1] - V[1]);
        const bx0 = sx > 0 ? V[0] + 4 : V[0] - 4 - s; const by0 = sy > 0 ? V[1] + 4 : V[1] - 4 - s;
        const kk = (b.c * 3 + b.r + (b.part === 'tri1' ? 1 : 0)) % 4;
        if (kk !== 3) fitIn(['cafe', 'diner', 'pizza', 'bar2'][kk], bx0, by0, s, s); else { GP('bed', roundPoly(insetPoly(T, [12, 12, 12]), 10)); for (let q = 0; q < 6; q++) tree(V[0] + sx * (16 + R() * s), V[1] + sy * (24 + R() * s), true); }
        const M = [(A[0] + C[0]) / 2, (A[1] + C[1]) / 2]; const gx = (V[0] + A[0] + C[0]) / 3; const gy = (V[1] + A[1] + C[1]) / 3;
        const [dx, dy] = nrm(C[0] - A[0], C[1] - A[1]); const [ix, iy] = nrm(V[0] - M[0], V[1] - M[1]);
        const px = M[0] + ix * 34; const py = M[1] + iy * 34;
        FONTE( px, py, 0.55); P('chafariz', px, py + 10, 22, 18, true, { ht: 6, deco: true, hidden: true });
        for (const t of [-1, 1]) { PX('banco', px + dx * t * 40, py + dy * t * 40 + 6); PX('arvore-vaso', px + dx * t * 70, py + dy * t * 70 + 10, true); }
        if (b.part === 'tri1') { PX('ponto-onibus', M[0] + ix * 12 + dx * 80, M[1] + iy * 12 + dy * 80 + 8, true); PX('placa-onibus', M[0] + ix * 12 + dx * 100, M[1] + iy * 12 + dy * 100 + 8); }
        PX('poste-triplo', gx, gy, false, { lamp: true }); lamps.push([gx, gy]);
        break;
      }
      case 'aeroparque': {
        // estacionamento do aeroporto + Locadora Nexus Rent + ponto de ônibus
        const lo = fitIn('garage', x0 + 6, y0 + 6, 130, 110, { label: 'Locadora Nexus Rent' });
        for (let r2 = 0; r2 < 3; r2++) for (let k = 0; k < 6; k++) { const sp = [x0 + 170 + k * ((bw - 200) / 5), y0 + 50 + r2 * ((bh - 100) / 2), -Math.PI / 2]; spots.push(sp); if (!rentSpot && r2 === 0 && k === 0) rentSpot = sp; }
        drive(bb, 'n', x0 + 300); drive(bb, 'w', y0 + 260); drive(bb, 's', cx);
        XP('abrigo-onibus', x0 + 60, y0 + 160, 0.9, true); PX('placa-onibus', x0 + 100, y0 + 160);
        for (const yy of [y0 + 129, y0 + 287]) { GP('bed', roundPoly(rectPts(x0 + 150, yy - 8, x1 - 16, yy + 8), 6)); for (let x = x0 + 166; x < x1 - 20; x += 44) tree(x, yy + 9, R() < 0.6); }
        for (const y of [y0 + 200, y0 + 280, y0 + 360]) PX('arvore-vaso', x0 + 20, y, true);
        poi('locadora', 'Locadora Nexus Rent', lo.x + lo.w / 2, lo.y + lo.h + 16, '#/locadora', 'car');
        break;
      }
      case 'galpoes': case 'fabrica': {
        const H1 = Math.min(190, (bh - 26) / 2);
        const L1 = z === 'fabrica' ? ['factory', 'industrial', 'cooling'] : ['warehouse-brick', 'loading', 'warehouse-blue'];
        const L2 = z === 'fabrica' ? ['factory', 'ind-blue', 'industrial'] : IND;
        row(x0 + 4, x1 - 4, y0 + 4, H1, L1, { gap: 8 }); row(x0 + 4, x1 - 4, y1 - H1 - 4, H1, L2, { gap: 8 });
        for (let x = x0 + 30; x < x1 - 20; x += 60) PX(pick(['caixotes', 'barril', 'pneus', 'tambor']), x, (y0 + y1) / 2 + 8, true);
        drive(bb, 'w', (y0 + y1) / 2);
        if (z === 'fabrica') poi('industria', 'Distrito Industrial', cx, poiY, '#/empresas', 'briefcase');
        break;
      }
      case 'conteineres': {
        const cols = ['#c84a3a', '#3a7ac8', '#3aa85a', '#e8b84a', '#8a5ac8', '#e87a3a'];
        const nx = Math.floor((bw - 12) / 63); const ny = Math.floor((bh - 12) / 25); const ox = x0 + (bw - (nx * 63 - 3)) / 2; const oy = y0 + (bh - (ny * 25 - 3)) / 2;
        for (let j = 0; j < ny; j++) { if (j % 5 === 4) continue; for (let i = 0; i < nx; i++) { if (i === Math.floor(nx / 2)) continue; if (R() < 0.9) B({ kind: 'conteiner', x: ox + i * 63, y: oy + j * 25, w: 60, h: 22, floors: 1 + (R() < 0.4), roof: pick(cols), wall: '#555' }); } }
        drive(bb, 'n', cx);
        poi('porto', 'Porto Seco', cx, poiY, '#/empregos', 'briefcase');
        break;
      }
      default: break;
    }
  }
  for (const b of blocks) { compose(b); const bb = bboxOf(b.curb); regions.push({ name: REGION[b.zone] || 'Nexus City', rect: [bb[0] - 20, bb[1] - 20, bb[2] + 20, bb[3] + 20] }); }

  // ---------------------------------------------------------------- aeroporto (mesmas coordenadas da pista, pátio e portões)
  const airport = { runway: [2880, 392, 1160, 72], taxi: [2900, 640, 1100, 40], apron: [2880, 820, 1000, 300], gate: [2900, 1116, 64, 104] };
  G('grass', 2792, 8, 1296, 1208, 'rect', { park: true, airport: true });
  G('runway', ...airport.runway, 'rect', { kind: 'runway' }); G('runway', ...airport.taxi, 'rect', { kind: 'taxi' });
  G('runway', 2930, 464, 40, 360, 'rect', { kind: 'taxi' }); G('runway', 3440, 464, 40, 360, 'rect', { kind: 'taxi' }); G('runway', 3960, 464, 40, 200, 'rect', { kind: 'taxi' });
  G('runway', ...airport.apron, 'rect', { kind: 'apron' }); G('lot', ...airport.gate, 'rect', { stalls: false });
  SP('warehouse-blue', 3900, 820, 152, { label: 'Hangar Nexus Aviação' }); SP('warehouse-blue', 3900, 968, 152);
  { let x = 3010; for (let k = 0; k < 5; k++) { const b = SP('airport', x, 1124, 88, k === 2 ? { label: 'Aeroporto Internacional Nexus' } : {}); x += b.w + 2; } }
  B({ kind: 'torre', x: 2820, y: 720, w: 40, h: 40, floors: 16, roof: '#e8eef2', wall: '#c8d4e0', label: 'Torre de controle', tower: true });
  poi('aeroporto', 'Aeroporto Nexus', 3430, 1236, '#/veiculos', 'rocket');
  poi('hangar', 'Hangar · Aeronaves', 3980, 1100, '#/veiculos', 'rocket');
  regions.push({ name: 'Aeroporto Nexus', rect: [2776, 0, 4096, 1226] });
  const planeSpots = []; for (let k = 0; k < 6; k++) planeSpots.push([3000 + k * 140, 960, -Math.PI / 2]);
  {
    const clear = [airport.runway, airport.taxi, [2930, 464, 40, 360], [3440, 464, 40, 360], [3960, 464, 40, 200], airport.apron, airport.gate, [2790, 1206, 1310, 40]];
    const airFree = (x, y, m = 26) => clear.every(([a, b2, c2, d2]) => x < a - m || x > a + c2 + m || y < b2 - m || y > b2 + d2 + m) && !blds.some((b) => x > b.x - 14 && x < b.x + b.w + 14 && y > b.y - 10 && y < b.y + b.h + 14);
    G('lot', 2980, 480, 450, 150, 'rect', { stalls: false, industrial: true });
    { let x = 2990; for (const k of ['silos', 'silos', 'cooling']) { const b2 = SP(k, x, 486, 138); x += b2.w + 14; } }
    G('lot', 3490, 480, 460, 150, 'rect', { stalls: false, industrial: true });
    { let x = 3500; for (const k of ['loading', 'warehouse-brick']) { const b2 = SP(k, x, 486, 138); x += b2.w + 16; } }
    for (let x = 3800; x < 3940; x += 34) PX(pick(['caixotes', 'barril', 'pneus']), x, 626, true);
    for (let x = 2900; x < 3860; x += 46) PX(pick(['cone', 'caixa-luz', 'tambor', 'cavalete']), x + (R() * 10 | 0), 806);
    decals.push({ spr: '@heli', x: 3912, y: 1124, w: 56, h: 56 });
    for (let y = 22; y < 1200; y += 22) for (let x = 2800; x < 4084; x += 22) {
      if (y > 345 && y < 530 && x > 4000) continue;
      const px = x + (R() - 0.5) * 12; const py = y + (R() - 0.5) * 12;
      const zone = py < 340 || px < 2880 || px > 4010 || (py > 700 && py < 800);
      if (!zone || !airFree(px, py, py > 700 && py < 800 ? 24 : 26) || R() < 0.22) continue;
      pine(px, py);
    }
    for (let x = 3030; x < 3500; x += 48) PX(x % 96 < 48 ? 'banco' : 'arvore-vaso', x, 1218, x % 96 >= 48);
  }
  const fence = [[2800, 8, 1288, 4], [2800, 8, 4, 1112], [4084, 8, 4, 1112], [2800, 1116, 100, 4], [2964, 1116, 1124, 4]];
  const [rx, ry, rw, rh] = airport.runway;
  const runwayLights = [];
  for (let x = rx; x <= rx + rw; x += 40) { runwayLights.push([x, ry - 2, '#fff7d0']); runwayLights.push([x, ry + rh + 2, '#fff7d0']); }
  for (let y = ry + 4; y < ry + rh; y += 12) { runwayLights.push([rx - 2, y, '#4ade80']); runwayLights.push([rx + rw + 2, y, '#ff4d5e']); }
  for (let x = airport.taxi[0]; x <= airport.taxi[0] + airport.taxi[2]; x += 60) { runwayLights.push([x, airport.taxi[1] - 2, '#60a5fa']); runwayLights.push([x, airport.taxi[1] + airport.taxi[3] + 2, '#60a5fa']); }

  // ---------------------------------------------------------------- natureza: lago, serra, mata e cerca
  // Parque do Lago (noroeste): lago com trilha em volta, bancos e postes; trilha até a Av. Nexus
  const LK = { x: 960, y: 620, a: 300, b: 160 };
  const lakeR = (a, off = 0) => [LK.x + Math.cos(a) * (LK.a + off) * (1 + 0.08 * Math.sin(a * 3 + 0.7) + 0.05 * Math.sin(a * 5 + 2.1)), LK.y + Math.sin(a) * (LK.b + off) * (1 + 0.1 * Math.sin(a * 2 + 1.3) + 0.05 * Math.cos(a * 7))];
  const lakePoly = (off) => Array.from({ length: 96 }, (_, k) => lakeR((k / 96) * Math.PI * 2, off));
  GP('plaza', lakePoly(26)); GP('pond', lakePoly(0));
  G('plaza', LK.x + LK.a + 6, LK.y - 12, 1376 - (LK.x + LK.a + 6), 24);
  for (let k = 0; k < 22; k++) { const a = (k / 22) * Math.PI * 2; const [bx, by] = lakeR(a, 40); if (Math.abs(Math.sin(a)) < 0.12 && Math.cos(a) > 0) continue; if (k % 2) PX('banco', bx, by + 6); else { PX('poste-triplo', bx, by + 8, false, { lamp: true }); lamps.push([bx, by + 8]); } }
  for (let k = 0; k < 18; k++) { const a = R() * Math.PI * 2; const [bx, by] = lakeR(a, -6); XP(pick(['pedras', 'pedras2', 'pedra-m']), bx, by + 4, 0.9, false); }
  decals.push({ spr: '@pier', x: LK.x - 52, y: LK.y + LK.b - 46, w: 24, h: 60 }); XP('bangka', LK.x - 120, LK.y + 30, 1.1, false); XP('bangka', LK.x + 140, LK.y - 50, 1, false);
  for (let k = 0; k < 14; k++) decals.push({ spr: '@ninfeia', x: LK.x - 220 + R() * 440, y: LK.y - 100 + R() * 200, w: 10 + R() * 8, h: 8 + R() * 5 });
  for (let k = 0; k < 16; k++) { const [bx, by] = lakeR(R() * Math.PI * 2, 66 + R() * 40); PX(pick(['flores-v', 'flores-b', 'flores-a', 'arbusto-c', 'arbusto-c2']), bx, by + 6); }
  PX('quiosque', LK.x + 70, LK.y + LK.b + 50, true); XP('placa-madeira', LK.x - 40, LK.y + LK.b + 50, 1, false);
  poi('parque', 'Parque do Lago', LK.x, LK.y + LK.b + 26, '#/social/eventos', 'sun');
  regions.push({ name: 'Parque do Lago', rect: [LK.x - LK.a - 120, LK.y - LK.b - 120, LK.x + LK.a + 120, LK.y + LK.b + 140] });
  regions.push({ name: 'Serra Nexus', rect: [0, 0, 2780, 1180] });
  // serra: montanhas ao fundo (norte e cantos)
  // só a cordilheira nevada (fundo transparente), em grupos de tamanhos diferentes, com pedras na base
  const MT = [['montanhas', 260, 330, 2.4], ['montanhas', 620, 220, 1.7], ['montanhas', 1820, 330, 2.6], ['montanhas', 2240, 250, 1.9], ['montanhas', 2560, 470, 1.6], ['montanhas', 170, 800, 1.8],
    ['montanhas', 2020, 900, 1.5], ['montanhas', 120, 2700, 1.6], ['montanhas', 3350, 2730, 2.0], ['montanhas', 3900, 2650, 1.9], ['montanhas', 3950, 1660, 1.4]];
  const mtns = [];
  for (const [k, x, y, s] of MT) { XP(k, x, y, s, true); const e = EXTRA[k]; mtns.push([x, y - (e[1] * s) / 2, (e[0] * s) / 2 + 20]); for (let q = 0; q < 4; q++) XP(pick(['pedras', 'pedras2', 'pedra-m']), x + (R() - 0.5) * e[0] * s * 0.9, y + 6 + R() * 10, 1, false); }
  // mata: preenche toda a natureza do núcleo (fora dos distritos, do lago, das estradas e das montanhas)
  const exitCorr = (x, y) => (Math.abs(x - 1400) < 70 && (y < 1240 || y > 2540)) || (Math.abs(y - 1888) < 70 && x < 440) || (Math.abs(y - 2208) < 64 && x > 3600);
  const inDistrict = (x, y) => (x > 440 - 96 && x < 2680 + 96 && y > 1248 - 96 && y < 2528 + 96) || (x > 2640 && x < 3600 + 90 && y > 1200 && y < 2208 + 90);
  const inAir = (x, y) => x > 2770 && y < 1250;
  const inLake = (x, y) => ((x - LK.x) / (LK.a + 70)) ** 2 + ((y - LK.y) / (LK.b + 70)) ** 2 < 1 || (y > LK.y - 50 && y < LK.y + 50 && x > LK.x && x < 1380);
  const inMt = (x, y) => mtns.some(([mx, my, mr]) => Math.hypot(x - mx, (y - my) * 1.3) < mr);
  for (let y = 18; y < H - 6; y += 24) for (let x = 10; x < W - 6; x += 22) {
    const px = x + (R() - 0.5) * 14; const py = y + (R() - 0.5) * 14;
    if (inDistrict(px, py) || inAir(px, py) || inLake(px, py) || exitCorr(px, py) || inMt(px, py) || R() > 0.25 + dens(px, py) * 0.75) continue;
    pine(px, py);
  }
  // cerca de madeira em volta da cidade, com portões a cada ~220 e aberturas nas saídas
  const fenceRun = (pts, step = 15) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i]; const [bx, by] = pts[i + 1]; const L = Math.hypot(bx - ax, by - ay); const ang = Math.atan2(by - ay, bx - ax);
      for (let t = 0; t < L; t += step) {
        const x = ax + ((bx - ax) * t) / L; const y = ay + ((by - ay) * t) / L;
        if (exitCorr(x, y) || Math.floor((x + y) / 15) % 15 === 0) continue;
        PX('cerca', x, y + 6, false, { rot: ang, size: 14 });
      }
    }
  };
  { // contorno da cidade (sem o trecho do anexo/aeroporto a leste), em trechos contínuos
    const ring = roundPoly(rectPts(440 - 52, 1248 - 52, 2680 + 52, 2528 + 52), [RC + 52, 0, RC + 52, RC + 52]);
    const skip = ([x, y]) => x > 2620 && y < 2262; const k0 = ring.findIndex(skip); const ord = [...ring.slice(k0), ...ring.slice(0, k0)];
    let run = []; for (const p of [...ord, ord[0]]) { if (skip(p)) { if (run.length > 1) fenceRun(run); run = []; } else run.push(p); } if (run.length > 1) fenceRun(run);
  }
  fenceRun([[3600 + 50, 1260], [3600 + 50, 2160]]); fenceRun([[2730, 2208 + 54], [3560, 2208 + 54]]);
  // costa (fora do núcleo): coqueiros na beira da praia e pedras na areia, ao longo da costa recortada
  const T0 = terrainOf(RF.shape || 'continente');
  for (const poly of T0.land.slice(0, 1)) {
    poly.forEach(([x, y], i) => {
      if (x < -900 || x > 200 || y < -1000 || y > 3600 || i % 2) return;
      const [qx, qy] = poly[(i + 1) % poly.length]; const [tx, ty] = nrm(qx - x, qy - y); let nx = -ty; let ny = tx;
      if (T0.zone(x + nx * 60, y + ny * 60) !== 2) { nx = -nx; ny = -ny; }
      if (T0.zone(x + nx * 60, y + ny * 60) !== 2) return;
      if (i % 4 === 0) PX('coqueiro', x + nx * (48 + R() * 20), y + ny * (48 + R() * 20), true);
      if (i % 10 === 2) XP(pick(['pedras', 'pedras2', 'pedra-m']), x + nx * 6, y + ny * 6 + 6, 1, false);
      if (i % 14 === 6) P(`guarda-sol${(i / 14) % 2 | 0}`, x + nx * 24, y + ny * 24, 18, 16, false, { deco: true, ht: 4 });
    });
  }
  // mata e montanhas no terreno em volta do núcleo (norte, leste e sul), deixando livres as saídas
  {
    const onExit = (x, y) => (Math.abs(x - 1400) < 70 && (y < 0 || y > H)) || (Math.abs(y - 2208) < 60 && x > W) || (Math.abs(y - 1888) < 60 && x < 0);
    const plant = (xa, ya, xb, yb, sx, sy, thin) => { for (let y = ya; y < yb; y += sy) for (let x = xa; x < xb; x += sx) { const px = x + (R() - 0.5) * sx * 0.8; const py = y + (R() - 0.5) * sy * 0.8; if (R() < thin || R() > 0.35 + dens(px, py) * 0.65 || onExit(px, py) || T0.zone(px, py) !== 2) continue; if (px > 4040 && py > 330 && py < 530) continue; pine(px, py); } };
    plant(-400, -340, 4560, 6, 22, 24, 0.12); plant(W + 6, 6, 4560, H + 6, 22, 24, 0.12); plant(-400, H + 6, 4560, 3140, 22, 24, 0.12); plant(-400, 6, -2, H + 6, 24, 26, 0.35);
    plant(-400, -760, 4900, -340, 30, 32, 0.5);
    for (const [k, x, y, s] of [['montanhas', 600, -420, 3], ['montanhas', 1700, -500, 3.4], ['montanhas', 2700, -430, 3.2], ['montanhas', 3800, -520, 3], ['montanhas', 4500, 600, 2.6], ['montanhas', 4550, 1900, 2.6], ['montanhas', 2300, 3350, 2.6], ['montanhas', 800, 3280, 2.2]]) if (T0.zone(x, y) === 2 && T0.zone(x, y - 120) === 2) XP(k, x, y, s, true);
  }

  // ---------------------------------------------------------------- máscara de colisão e alturas
  const mw = W / CS; const mh = H / CS; const mask = new Uint8Array(mw * mh).fill(GRASS); const heights = new Uint8Array(mw * mh);
  const code = { access: LOT, front: WALK, pond: WATER, water: WATER, sand: SAND, grass: GRASS, walk: WALK, road: ROAD, cross: CROSS, lot: LOT, runway: RUNWAY, plaza: PLAZA, base: ROAD, curb: WALK, pave: PLAZA, bed: GRASS };
  const cl = (v, m) => Math.max(0, Math.min(m, v)); // fill de array tipado com índice negativo conta do fim: sempre limitar
  const fillRect = (c, x, y, w, h) => { const ax = cl(Math.floor(x / CS), mw); const ay = cl(Math.floor(y / CS), mh); const bx = cl(Math.ceil((x + w) / CS), mw); const by = cl(Math.ceil((y + h) / CS), mh); if (bx <= ax) return; for (let j = ay; j < by; j++) mask.fill(c, j * mw + ax, j * mw + bx); };
  const fillEll = (c, x, y, w, h) => { const cx = x + w / 2; const cy = y + h / 2; const ax = Math.max(0, Math.floor(x / CS)); const ay = Math.max(0, Math.floor(y / CS)); const bx = Math.min(mw, Math.ceil((x + w) / CS)); const by = Math.min(mh, Math.ceil((y + h) / CS)); for (let j = ay; j < by; j++) for (let i = ax; i < bx; i++) { const dx = ((i + 0.5) * CS - cx) / (w / 2); const dy = ((j + 0.5) * CS - cy) / (h / 2); if (dx * dx + dy * dy <= 1) mask[j * mw + i] = c; } };
  const fillPoly = (c, pts) => {
    const [, b0, , b1] = bboxOf(pts); const xs = [];
    for (let j = Math.max(0, Math.floor(b0 / CS)); j <= Math.min(mh - 1, Math.ceil(b1 / CS)); j++) {
      const y = (j + 0.5) * CS; xs.length = 0;
      for (let i = 0, n = pts.length; i < n; i++) { const [ax, ay] = pts[i]; const [bx, by] = pts[(i + 1) % n]; if ((ay > y) !== (by > y)) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax)); }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) { const i0 = Math.max(0, Math.ceil(xs[k] / CS - 0.5)); const i1 = Math.min(mw - 1, Math.floor(xs[k + 1] / CS - 0.5)); if (i1 >= i0) mask.fill(c, j * mw + i0, j * mw + i1 + 1); }
    }
  };
  // faixas de pedestre nos braços dos cruzamentos (ruas retas), giradas conforme a rua
  for (const [id, [nx, ny, k]] of Object.entries(nodes)) {
    if (k === 'exit' || k === 'corner') continue;
    const dist = k === 'round' ? 60 : maxW[id] / 2 + 8;
    for (const L of lines) {
      if (L.diag) continue;
      const ends = [[L.pts[0], L.pts[1]], [L.pts.at(-1), L.pts.at(-2)]];
      for (const [p0, p1] of ends) {
        if (p0[0] !== nx || p0[1] !== ny) continue;
        const [dx, dy] = nrm(p1[0] - p0[0], p1[1] - p0[1]); const cx = nx + dx * dist; const cy = ny + dy * dist; const hw = L.w / 2; const ox = -dy; const oy = dx;
        const pts = [[cx - dx * 5 + ox * hw, cy - dy * 5 + oy * hw], [cx + dx * 5 + ox * hw, cy + dy * 5 + oy * hw], [cx + dx * 5 - ox * hw, cy + dy * 5 - oy * hw], [cx - dx * 5 - ox * hw, cy - dy * 5 - oy * hw]];
        GP('cross', pts, { cx, cy, ang: Math.atan2(dy, dx), cw: L.w });
      }
    }
  }
  const order = ['water', 'sand', 'grass', 'plaza', 'front', 'walk', 'base', 'curb', 'pave', 'lot', 'bed', 'pond', 'access', 'road', 'cross', 'runway'];
  for (const m of order) for (const g of ground) if (g.mat === m) { if (g.shape === 'poly') fillPoly(code[m], g.pts); else (g.shape === 'ellipse' ? fillEll : fillRect)(code[m], g.x, g.y, g.w, g.h); }
  const bridges = []; const driveways = [];
  for (const f of userFloor) { ground.push(f); fillRect(code[f.mat], f.x, f.y, f.w, f.h); }
  for (const f of fence) fillRect(SOLID, ...f);
  // reforma: demolições de construções geradas e construções do jogador
  for (let i = blds.length - 1; i >= 0; i--) if (DEL.has(genKey(blds[i]))) { const b = blds[i]; reserved.push([b.x, b.y, b.w, b.h]); blds.splice(i, 1); }
  for (const [, o] of userAdd) if (o.kind === 'sprite') blds.push(o);
  for (const [, o] of userAdd) if (!o.kind && !o.decal) props.push(o);
  for (const b of blds) {
    const hgt = Math.min(250, b.floors * 9 + 6);
    if (b.round) fillEll(SOLID, b.x, b.y, b.w, b.h); else fillRect(SOLID, b.x, b.y, b.w, b.h);
    const ax = Math.floor(b.x / CS); const ay = Math.floor(b.y / CS); const bx2 = Math.ceil((b.x + b.w) / CS); const by2 = Math.ceil((b.y + b.h) / CS);
    for (let j = ay; j < by2; j++) for (let i = ax; i < bx2; i++) if (i >= 0 && j >= 0 && i < mw && j < mh) heights[j * mw + i] = Math.max(heights[j * mw + i], hgt);
  }
  const maskAt = (x, y) => { const i = Math.floor(x / CS); const j = Math.floor(y / CS); return i < 0 || j < 0 || i >= mw || j >= mh ? -1 : mask[j * mw + i]; };
  const nearBld = (x, y, m = 8) => blds.some((b) => x > b.x - m && x < b.x + b.w + m && y > b.y - m && y < b.y + b.h + m);

  // ---------------------------------------------------------------- calçadas: postes, mobiliário, placas e bueiros
  const along = (pts, cb) => { let acc = 0; for (let i = 0; i < pts.length - 1; i++) { const [ax, ay] = pts[i]; const [bx, by] = pts[i + 1]; const L = Math.hypot(bx - ax, by - ay); cb(ax, ay, bx, by, L, acc); acc += L; } return acc; };
  const total = (pts) => along(pts, () => {});
  const at = (pts, s) => { let res = null; along(pts, (ax, ay, bx, by, L, acc) => { if (!res && s <= acc + L) { const t = (s - acc) / (L || 1); res = [ax + (bx - ax) * t, ay + (by - ay) * t, Math.atan2(by - ay, bx - ax)]; } }); return res || [...pts.at(-1), 0]; };
  const FURN = ['hidrante', 'lixeira-cinza', 'correio-azul', 'arvore-vaso', 'telefone', 'lixeira-verde', 'banca-jornal', 'correio-vermelho', 'arvore-vaso2', 'orelhao'];
  let fk = 0;
  for (const L of lines) {
    const len = total(L.pts); const hw = L.w / 2; const s0 = L.ca + 26; const s1 = len - L.cb - 26; if (s1 <= s0) continue;
    const ind = L.pts[0][0] >= 2680 && L.pts.at(-1)[0] >= 2680 && !(L.pts[0][1] === 1248 && L.pts.at(-1)[1] === 1248); const outside = L.road === 'V1400' && (L.pts[0][1] < 1248 || L.pts[0][1] > 2528);
    for (let s = s0; s <= s1; s += 88) {
      const [x, y, a] = at(L.pts, s); const nx = -Math.sin(a); const ny = Math.cos(a);
      for (const side of [-1, 1]) {
        const lx = x + nx * side * (hw + 4); const ly = y + ny * side * (hw + 4);
        if ([WALK].includes(maskAt(lx, ly)) && !nearBld(lx, ly, 4)) {
          const kind = ind || outside ? 'poste-madeira' : L.w >= 48 ? 'poste-duplo' : L.w >= 40 ? 'poste-triplo' : 'poste';
          PX(kind, lx, ly + 4, false, { lamp: true }); lamps.push([lx, ly + 4]);
        }
        const [fx, fy] = at(L.pts, s + 44); const fxx = fx + nx * side * (hw + 12); const fyy = fy + ny * side * (hw + 12);
        if (s + 44 < s1 && maskAt(fxx, fyy) === WALK && !nearBld(fxx, fyy, 3) && !ind) PX(FURN[fk++ % FURN.length], fxx, fyy + 4, false); // mobiliário da calçada não bloqueia o caminho dos pedestres
      }
    }
    // bueiros junto ao meio-fio e tampas no meio da faixa
    for (let s = s0 + 30, k = 0; s < s1; s += 150, k++) {
      const [x, y, a] = at(L.pts, s); const nx = -Math.sin(a); const ny = Math.cos(a); const side = k % 2 ? 1 : -1;
      decals.push({ spr: 'grade-rua', x: x + nx * side * (hw - 5) - 4, y: y + ny * side * (hw - 5) - 3, w: 8, h: 7 });
      if (k % 3 === 1) decals.push({ spr: 'boeiro', x: x - nx * side * L.w * 0.24 - 5, y: y - ny * side * L.w * 0.24 - 5, w: 10, h: 10 });
    }
  }
  // placas nos cruzamentos: PARE onde não há semáforo, pedestres onde há; direção nas avenidas
  for (const [id, [nx, ny, k]] of Object.entries(nodes)) {
    if (k === 'exit' || k === 'round' || k === 'corner') continue;
    for (const L of lines) {
      const ends = [[L.pts[0], L.pts[1]], [L.pts.at(-1), L.pts.at(-2)]];
      for (const [p0, p1] of ends) {
        if (p0[0] !== nx || p0[1] !== ny) continue;
        const [dx, dy] = nrm(p1[0] - p0[0], p1[1] - p0[1]); const d = maxW[id] / 2 + 24; const ox = dy; const oy = -dx; // lado direito de quem chega
        const sx = nx + dx * d + ox * (L.w / 2 + 9); const sy = ny + dy * d + oy * (L.w / 2 + 9);
        if (maskAt(sx, sy) !== WALK || nearBld(sx, sy, 2)) continue;
        PX(lights.includes(id) ? (L.w >= 48 && (nx + ny) % 3 === 0 ? 'placa-direcao' : 'placa-pedestre') : 'placa-pare', sx, sy + 6);
      }
    }
  }
  const radars = [{ at: [1400, 1728], limit: 50 }, { at: [1400, 2368], limit: 50 }, { at: [920, 1888], limit: 50 }, { at: [2200, 1888], limit: 50 }, { at: [1880, 1248], limit: 50 }, { at: [3370, 1248], limit: 40 }, { at: [3850, 2208], limit: 60 }, { at: [1880, 2528], limit: 40 }];
  for (const r of radars) PX('placa-50', r.at[0] + 34, r.at[1] - 30);
  if (DEL.size) {
    for (let i = props.length - 1; i >= 0; i--) { const p = props[i]; if (p.user || !DEL.has(genKey(p))) continue; props.splice(i, 1); if (p.lamp) for (let k = lamps.length - 1; k >= 0; k--) if (Math.abs(lamps[k][0] - p.x) < 4 && Math.abs(lamps[k][1] - p.y) < 10) lamps.splice(k, 1); }
    for (let i = decals.length - 1; i >= 0; i--) if (DEL.has(genKey(decals[i]))) decals.splice(i, 1);
  }
  for (const [, o] of userAdd) { if (o.decal) decals.push(o); else if (o.lamp) lamps.push([o.x, o.y]); }
  // o que o jogador pinta ou constrói limpa a mata/decoração gerada que estava ali
  { const zones = [...userFloor.map((f) => [f.x - 4, f.y - 4, f.w + 8, f.h + 30]), ...blds.filter((b) => b.user).map((b) => [b.x - 4, b.y - 4, b.w + 8, b.h + 30])];
    if (zones.length) for (let i = props.length - 1; i >= 0; i--) { const p = props[i]; if (!p.user && zones.some(([zx, zy, zw, zh]) => p.x > zx && p.x < zx + zw && p.y > zy && p.y < zy + zh)) props.splice(i, 1); } }
  for (const p of props) if (p.solid) {
    const big = p.w > 60 && p.h > 40;
    if (big) { const r = Math.min(p.w * 0.36, p.h * 0.3); fillEll(SOLID, p.x - r, p.y - r * 1.6, r * 2, r * 1.6); } else { const r = p.spr.startsWith('arvore') || p.spr.startsWith('x:') ? 4 : 3; fillRect(SOLID, p.x - r, p.y - r * 1.5, r * 2, r * 2); }
    const i = Math.floor(p.x / CS); const j = Math.floor(p.y / CS); if (i >= 0 && j >= 0 && i < mw && j < mh) heights[j * mw + i] = Math.max(heights[j * mw + i], p.ht || 10);
  }
  // travessias: o caminho das calçadas (mesma conta do grafo de ruas) cruza o asfalto perto das esquinas e das
  // diagonais; esses pontos viram faixa (pedestre e carro podem passar), sem mudar o desenho
  {
    const nclear = (id) => { const k = nodes[id][2]; return k === 'round' ? 44 : k === 'corner' ? 8 : k === 'exit' ? 0 : maxW[id] / 2 + 7; };
    const wtrim = (id) => { const k = nodes[id][2]; return k === 'round' ? 56 : k === 'exit' ? 0 : nclear(id) + 6; };
    for (const rd of roads) {
      const pairs = rd.shape ? [[rd.path[0], rd.path.at(-1), rd.shape]] : rd.path.slice(1).map((b, i) => [rd.path[i], b, null]);
      for (const [a, b, sh] of pairs) {
        const pts = sh ? sh : [nodes[a].slice(0, 2), nodes[b].slice(0, 2)];
        for (const side of [1, -1]) {
          const o = (rd.w / 2 + 8) * side;
          const off = pts.map((p, i) => { const A = pts[Math.max(0, i - 1)]; const Bp = pts[Math.min(pts.length - 1, i + 1)]; const [dx, dy] = nrm(Bp[0] - A[0], Bp[1] - A[1]); return [p[0] - dy * o, p[1] + dx * o]; });
          const t0 = wtrim(a); const t1 = wtrim(b); const L = total(off);
          for (let s2 = 0; s2 <= L; s2 += 2) {
            const [x, y] = at(off, s2);
            if (Math.hypot(x - nodes[a][0], y - nodes[a][1]) < t0 || Math.hypot(x - nodes[b][0], y - nodes[b][1]) < t1) continue;
            for (const [ex, ey] of [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]]) { const i = Math.floor((x + ex) / CS); const j = Math.floor((y + ey) / CS); if (i >= 0 && j >= 0 && i < mw && j < mh && mask[j * mw + i] === ROAD) mask[j * mw + i] = CROSS; }
          }
        }
      }
    }
  }
  // Construtora Nexus (loja do modo Reforma) num galpão da área industrial
  const wb = blds.find((b) => b.spr === 'warehouse-brick' && b.x > 3140 && b.y > 1240 && b.y < 1728) || blds.find((b) => IND.includes(b.spr) && b.x > 3140 && b.y > 1240 && b.y < 1728);
  if (wb) wb.label = 'Construtora Nexus';
  if (wb) pois.push({ id: 'construtora', label: 'Construtora Nexus', at: [Math.round(wb.x + wb.w / 2), Math.round(wb.y + wb.h + 14)], route: '#/construtora', icon: 'building' });

  // ---------------------------------------------------------------- terreno em volta (expansões) e costa
  const coast = T0; const BB = coast.bounds; const OX = -BB.x0; const OY = -BB.y0;
  const emw = coast.mw; const emh = coast.mh; const oi = OX / CS; const oj = OY / CS;
  const emask = coast.grid.slice(); const eh = new Uint8Array(emw * emh);
  for (let j = 0; j < mh; j++) { emask.set(mask.subarray(j * mw, (j + 1) * mw), (j + oj) * emw + oi); eh.set(heights.subarray(j * mw, (j + 1) * mw), (j + oj) * emw + oi); }
  const eFill = (c, x, y, w, h) => { const ax = cl(Math.floor((x + OX) / CS), emw); const ay = cl(Math.floor((y + OY) / CS), emh); const bx = cl(Math.ceil((x + w + OX) / CS), emw); const by = cl(Math.ceil((y + h + OY) / CS), emh); if (bx <= ax) return; for (let j = ay; j < by; j++) emask.fill(c, j * emw + ax, j * emw + bx); };
  // estradas que saem do núcleo continuam pelo terreno até a praia/borda (com barreira no fim)
  const stubs = [];
  for (const s2 of segs) {
    const ends = s2.v ? [[s2.y0, -1], [s2.y1, 1]] : [[s2.x0, -1], [s2.x1, 1]];
    for (const [e, dir] of ends) {
      if (s2.v ? (e > 0 && e < H) : (e > 0 && e < W)) continue;
      let L = 0; while (L < 900) { const px = s2.v ? s2.x : e + dir * (L + 8); const py = s2.v ? e + dir * (L + 8) : s2.y; if (coast.zone(px, py) !== 2) break; L += 8; }
      L -= 24; if (L < 24) continue;
      const half = s2.w / 2;
      const rr = s2.v ? [s2.x - half, dir < 0 ? e - L : e, s2.w, L] : [dir < 0 ? e - L : e, s2.y - half, L, s2.w];
      const wk = s2.v ? [[rr[0] - 14, rr[1], 14, L], [rr[0] + s2.w, rr[1], 14, L]] : [[rr[0], rr[1] - 14, L, 14], [rr[0], rr[1] + s2.w, L, 14]];
      for (const k of wk) { ground.push({ mat: 'walk', shape: 'rect', x: k[0], y: k[1], w: k[2], h: k[3], ext: 1 }); eFill(WALK, ...k); }
      ground.push({ mat: 'road', shape: 'rect', x: rr[0], y: rr[1], w: rr[2], h: rr[3], ext: 1 }); eFill(ROAD, ...rr);
      stubs.push(rr);
      lines.push({ pts: s2.v ? [[s2.x, dir < 0 ? e : e], [s2.x, e + dir * L]] : [[e, s2.y], [e + dir * L, s2.y]], w: s2.w, ca: 0, cb: 30, ext: true });
      const ex = s2.v ? s2.x : e + dir * (L - 4); const ey = s2.v ? e + dir * (L - 4) : s2.y;
      for (let k = -1; k <= 1; k++) PX('barreira', s2.v ? ex + k * (s2.w / 3) : ex, (s2.v ? ey : ey + k * (s2.w / 3)) + 5, true);
    }
  }
  for (const f of userFloor) eFill(code[f.mat], f.x, f.y, f.w, f.h);
  for (const b of blds) if (b.user) { eFill(SOLID, b.x, b.y, b.w, b.h); const ax = Math.floor((b.x + OX) / CS); const ay = Math.floor((b.y + OY) / CS); const hgt = Math.min(250, b.floors * 9 + 6); for (let j = ay; j < Math.ceil((b.y + b.h + OY) / CS) && j < emh; j++) for (let i = ax; i < Math.ceil((b.x + b.w + OX) / CS) && i < emw; i++) if (i >= 0 && j >= 0) eh[j * emw + i] = Math.max(eh[j * emw + i], hgt); }
  for (const p of props) if (p.solid && (p.user || p.x < 0 || p.y < 0 || p.x > W || p.y > H)) { const big = p.w > 60 && p.h > 40; const r = big ? Math.min(p.w * 0.36, p.h * 0.3) : p.spr.startsWith('arvore') || p.spr.startsWith('x:') ? 4 : 3; eFill(SOLID, p.x - r, p.y - r * (big ? 1.6 : 1.5), r * 2, r * (big ? 1.6 : 2)); }
  // continuação das estradas desenhada por cima da mata (some com as árvores que caíram em cima)
  for (let i = props.length - 1; i >= 0; i--) { const p = props[i]; if (p.user || !(p.x < 0 || p.y < 0 || p.x > W || p.y > H)) continue; if (stubs.some(([a, b2, c2, d2]) => p.x > a - 26 && p.x < a + c2 + 26 && p.y > b2 - 10 && p.y < b2 + d2 + 40)) props.splice(i, 1); }

  const nodeInfo = Object.fromEntries(Object.entries(nodes).map(([id, n]) => [id, { x: n[0], y: n[1], kind: n[2], maxW: maxW[id] || 0 }]));
  return {
    W, H, CS, mw: emw, mh: emh, mask: emask, heights: eh, ox: OX, oy: OY, bounds: BB, coast, core: { w: W, h: H }, stubs, ground, blds, props, decals, lamps, pois, regions, bridges, driveways, fence, airport, runwayLights, spots, rentSpot, planeSpots,
    R: { w: W, h: H, nodes, roads, lights, lots: [], pois, regions, radars }, segs, lines, nodeInfo,
  };
}
