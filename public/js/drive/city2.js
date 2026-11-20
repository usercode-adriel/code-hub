// AURORA — segunda cidade do mapa, no leste do continente (longe de Nexus City), ligada pela Rodovia Aurora (4 faixas).
// Cidade inteligente: Av. Central larga de 4 faixas (2 por sentido), Boulevard Aurora, quatro diagonais que se
// encontram na Praça da Estrela (rotatória grande), segunda rotatória na Av. das Palmeiras, anel viário de esquinas
// curvas, semáforos inteligentes (sensores de fila), radares e pontos de blitz. Em volta, nada quadrado: estradas
// que saem das diagonais para três vilas do interior (Vila Serena, Vila Esperança e Porto Aurora), a Av. Beira-Mar
// pela orla, o Aeroporto Internacional Aurora e o trevo da rodovia. Determinístico, com sorteio próprio (não mexe
// no sorteio de Nexus City, que continua idêntica).
// Coordenadas absolutas do mundo (fora do núcleo 4096×2816 de Nexus City).

// ---------------------------------------------------------------- traçado
export const AX = [5600, 5920, 6240, 6560, 6880, 7200, 7520, 7840, 8160];
export const AY = [-1120, -800, -480, -160, 160, 480, 800];
const RING = 40; const CEN = 72; const BLV = 48; const PALM = 40; const ST = 32; const DG = 40; const RC = 160; const VW = 28;
export const STAR = { x: 6880, y: -160, r: 84 }; const PALMR = { x: 6880, y: 480, r: 54 };
const RB = { x: 6880, y: 1240, r: 56 }; const J1 = { x: 5480, y: 1960, r: 52 }; const BMJ = { x: 8560, y: -160, r: 50 };
export const wV = (x) => (x === AX[0] || x === AX[8] ? RING : x === 6880 ? CEN : ST);
export const wH = (y) => (y === AY[0] || y === AY[6] ? RING : y === -160 ? BLV : y === 480 ? PALM : ST);
const NAMES = {
  V: { 5600: 'Anel Aurora Oeste', 5920: 'Rua das Acácias', 6240: 'Rua dos Ipês', 6560: 'Rua da Inovação', 6880: 'Av. Central', 7200: 'Rua do Farol', 7520: 'Rua das Gaivotas', 7840: 'Rua do Mirante', 8160: 'Anel Aurora Leste' },
  H: { [-1120]: 'Anel Aurora Norte', [-800]: 'Rua das Estrelas', [-480]: 'Rua do Sol', [-160]: 'Boulevard Aurora', 160: 'Rua da Brisa', 480: 'Av. das Palmeiras', 800: 'Anel Aurora Sul' },
};
// zonas dos quarteirões [linha][coluna] (mesmos tipos de Nexus City, mais o centro financeiro "torres")
const ZONES = [
  ['cantoSO', 'diagA', 'residencial', 'hoteis', 'torres', 'shopping', 'diagB', 'cantoSO'],
  ['residencial', 'misto', 'diagA', 'torres', 'torres', 'diagB', 'comercial', 'residencial'],
  ['residencial', 'comercial', 'banco', 'diagA', 'diagB', 'prefeitura', 'praca', 'residencial'],
  ['misto', 'escola', 'policia', 'diagB', 'diagA', 'hospital', 'comercial', 'residencial'],
  ['residencial', 'misto', 'diagB', 'mercado', 'parque', 'diagA', 'estacionamento', 'posto'],
  ['cantoSO', 'diagB', 'residencial', 'estadio', 'terminal', 'residencial', 'diagA', 'cantoSO'],
];
const CORNERS = new Set([`${AX[0]},${AY[0]}`, `${AX[8]},${AY[0]}`, `${AX[0]},${AY[6]}`, `${AX[8]},${AY[6]}`]);
// vilas do interior: grade pequena (2 quarteirões) com ruas estreitas
export const VILLAGES = [
  { id: 'serena', name: 'Vila Serena', xs: [4920, 5180, 5440], ys: [-1900, -1660], zones: ['vila', 'vilaCentro'] },
  { id: 'esperanca', name: 'Vila Esperança', xs: [5040, 5300, 5560], ys: [1100, 1340], zones: ['vilaCentro', 'vila'] },
  { id: 'porto', name: 'Porto Aurora', xs: [8100, 8360, 8620], ys: [-1760, -1500], zones: ['vila', 'vilaPorto'] },
];
export const AIRPORT2 = { runway: [7060, 1680, 1240, 72], taxi: [7080, 1612, 1200, 36], apron: [7240, 1380, 960, 222], gate: [7240, 1262, 60, 124] };

// curva suave (Catmull-Rom) pelos pontos de controle, amostrada a cada ~step unidades
function smooth(ctrl, step = 36) {
  const out = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)]; const p1 = ctrl[i]; const p2 = ctrl[i + 1]; const p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n; const t2 = t * t; const t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([Math.round(f(p0[0], p1[0], p2[0], p3[0])), Math.round(f(p0[1], p1[1], p2[1], p3[1]))]);
    }
  }
  out.push(ctrl.at(-1).slice());
  return out;
}
// estradas de fora (formato livre): id, nome, largura, faixas por sentido, pontos de controle
const OUT = [
  ['ARH1', 'Rodovia Aurora', 56, 2, [[4096, 2208], [4600, 2208], [5000, 2190], [5300, 2090], [J1.x, J1.y]]],
  ['ARH2', 'Rodovia Aurora', 56, 2, [[J1.x, J1.y], [5800, 1730], [6300, 1430], [6700, 1270], [RB.x, RB.y]]],
  ['AD2X', 'Estrada do Farol', 40, 1, [[7840, 800], [8040, 1010], [8300, 1240]]],
  ['ABM1', 'Av. Beira-Mar', 40, 1, [[8360, -1500], [8520, -1300], [8590, -800], [BMJ.x, BMJ.y]]],
  ['ABM2', 'Av. Beira-Mar', 40, 1, [[BMJ.x, BMJ.y], [8590, 450], [8510, 1000], [8300, 1240]]],
  ['AD3X', 'Estrada do Porto', 32, 1, [[7840, -1120], [7990, -1330], [8100, -1500]]],
  ['AD1X', 'Estrada da Serra', 32, 1, [[5920, -1120], [5700, -1390], [5440, -1660]]],
  ['AD4X', 'Estrada da Vila Esperança', 32, 1, [[5920, 800], [5760, 970], [5560, 1100]]],
  ['AESP', 'Estrada da Vila Esperança', 32, 1, [[5300, 1340], [5330, 1650], [J1.x, J1.y]]],
];
// retas de fora: Av. Central até o trevo, avenida do aeroporto, Boulevard até a orla
const OUT_STRAIGHT = [
  ['AVCS', 'Av. Central', CEN, 2, [[6880, 800], [RB.x, RB.y]]],
  ['AAER', 'Av. do Aeroporto Aurora', 40, 1, [[RB.x, RB.y], [8300, 1240]]],
  ['ABLE', 'Boulevard Aurora', BLV, 1, [[8160, -160], [BMJ.x, BMJ.y]]],
];

// ---------------------------------------------------------------- 1) ruas (antes do grafo ser fechado)
export function auroraRoads({ node, road, nid }) {
  const ids = new Set(); const N = (x, y, kind, r) => { const id = node(x, y, kind, r); ids.add(id); return id; };
  for (const x of AX) for (const y of AY) if (!CORNERS.has(`${x},${y}`)) N(x, y);
  N(STAR.x, STAR.y, 'round', STAR.r); N(PALMR.x, PALMR.y, 'round', PALMR.r);
  N(RB.x, RB.y, 'round', RB.r); N(J1.x, J1.y, 'round', J1.r); N(BMJ.x, BMJ.y, 'round', BMJ.r); N(8300, 1240);
  N(4096, 2208); // fim da Estrada do Leste: a rodovia começa aqui
  for (const v of VILLAGES) for (const x of v.xs) for (const y of v.ys) N(x, y);
  const R = (id, name, w, pts, extra) => road(id, name, w, pts, extra);
  for (const x of AX.slice(1, 8)) R(`AV${x}`, NAMES.V[x], wV(x), AY.map((y) => [x, y]), x === 6880 ? { lanes: 2 } : {});
  for (const x of [AX[0], AX[8]]) R(`AV${x}`, NAMES.V[x], RING, AY.slice(1, 6).map((y) => [x, y]));
  for (const y of AY.slice(1, 6)) R(`AH${y}`, NAMES.H[y], wH(y), AX.map((x) => [x, y]));
  for (const y of [AY[0], AY[6]]) R(`AH${y}`, NAMES.H[y], RING, AX.slice(1, 8).map((x) => [x, y]));
  // diagonais em estrela (passam pela Praça da Estrela)
  R('AD1', 'Diagonal Norte', DG, [[5920, -1120], [6240, -800], [6560, -480], [6880, -160]], { diag: true });
  R('AD2', 'Diagonal Sul', DG, [[6880, -160], [7200, 160], [7520, 480], [7840, 800]], { diag: true });
  R('AD3', 'Diagonal do Porto', DG, [[6880, -160], [7200, -480], [7520, -800], [7840, -1120]], { diag: true });
  R('AD4', 'Diagonal da Esperança', DG, [[6880, -160], [6560, 160], [6240, 480], [5920, 800]], { diag: true });
  // esquinas curvas do anel
  const arc = (cx, cy, r, a0, a1) => { const o = []; for (let k = 0; k <= 8; k++) { const a = a0 + ((a1 - a0) * k) / 8; o.push([Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r)]); } return o; };
  const curve = (id, a, b, mid) => road(id, 'Anel Aurora', RING, [a, b], { shape: [a, ...mid, b] });
  curve('ACNO', [5920, -1120], [5600, -800], arc(5760, -960, RC, -Math.PI / 2, -Math.PI));
  curve('ACNE', [7840, -1120], [8160, -800], arc(8000, -960, RC, -Math.PI / 2, 0));
  curve('ACSO', [5600, 480], [5920, 800], arc(5760, 640, RC, Math.PI, Math.PI / 2));
  curve('ACSE', [8160, 480], [7840, 800], arc(8000, 640, RC, 0, Math.PI / 2));
  // vilas: ruas em volta e no meio dos dois quarteirões
  for (const v of VILLAGES) {
    for (const y of v.ys) R(`V${v.id}H${y}`, `Rua de ${v.name}`, VW, v.xs.map((x) => [x, y]));
    for (const x of v.xs) R(`V${v.id}V${x}`, `Travessa de ${v.name}`, VW, v.ys.map((y) => [x, y]));
  }
  // estradas e avenidas de fora
  for (const [id, name, w, lanes, ctrl] of OUT) { const sh = smooth(ctrl); road(id, name, w, [ctrl[0], ctrl.at(-1)], { shape: sh, lanes, out: true }); }
  for (const [id, name, w, lanes, pts] of OUT_STRAIGHT) R(id, name, w, pts, { lanes, out: true });
  void nid;
  return ids;
}

// ---------------------------------------------------------------- geometria auxiliar
const nrm = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
// polígono da faixa de uma polilinha com largura w (para o asfalto e o acostamento)
function strip(pts, w) {
  const h = w / 2; const L = []; const Rr = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)]; const b = pts[Math.min(pts.length - 1, i + 1)]; const [dx, dy] = nrm(b[0] - a[0], b[1] - a[1]);
    L.push([pts[i][0] - dy * h, pts[i][1] + dx * h]); Rr.push([pts[i][0] + dy * h, pts[i][1] - dx * h]);
  }
  return [...L, ...Rr.reverse()];
}
// recorta de um polígono o disco (cx, cy, rho): os quarteirões em volta das rotatórias acompanham o círculo
function cutCircle(poly, cx, cy, rho) {
  const inside = (p) => Math.hypot(p[0] - cx, p[1] - cy) < rho;
  if (!poly.some(inside)) return poly;
  const out = []; const n = poly.length; let exitA = null;
  const hit = (a, b) => { // ponto do segmento a→b sobre o círculo
    let lo = 0; let hi = 1; const ain = inside(a);
    for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; const p = [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m]; if (inside(p) === ain) lo = m; else hi = m; }
    return [a[0] + (b[0] - a[0]) * hi, a[1] + (b[1] - a[1]) * hi];
  };
  const arcTo = (p, q) => { let a0 = Math.atan2(p[1] - cy, p[0] - cx); const a1 = Math.atan2(q[1] - cy, q[0] - cx); let da = a1 - a0; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; const st = Math.max(2, Math.ceil(Math.abs(da) / 0.12)); for (let k = 1; k < st; k++) { a0 += da / st; out.push([cx + Math.cos(a0) * rho, cy + Math.sin(a0) * rho]); } };
  let start = poly.findIndex((p) => !inside(p)); if (start < 0) return [];
  for (let k = 0; k < n; k++) {
    const a = poly[(start + k) % n]; const b = poly[(start + k + 1) % n];
    if (!inside(a)) out.push(a);
    if (inside(a) !== inside(b)) { const h = hit(a, b); if (!inside(a)) { out.push(h); exitA = h; } else { if (exitA) arcTo(exitA, h); out.push(h); exitA = null; } }
  }
  return out;
}
const LBL = [[/Nexus/g, 'Aurora'], [/Praça Central/, 'Praça do Farol'], [/Parque Sul/, 'Parque Aurora'], [/Estacionamento Central/, 'Estacionamento Aurora'], [/Terminal Rodoviário/, 'Terminal Aurora'], [/Lojas do centro/, 'Lojas de Aurora']];
export const auroraLabel = (s) => LBL.reduce((t, [a, b]) => t.replace(a, b), String(s || ''));

// ---------------------------------------------------------------- 2) quarteirões
export function auroraBlocks({ insetPoly, roundPoly, rectPts }) {
  const blocks = [];
  const cut = (poly, extra) => [[STAR, STAR.r + extra], [PALMR, PALMR.r + extra]].reduce((p, [c, rho]) => cutCircle(p, c.x, c.y, rho), poly);
  for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) {
    const x0 = AX[c]; const x1 = AX[c + 1]; const y0 = AY[r]; const y1 = AY[r + 1];
    const ins = [wH(y0) / 2, wV(x1) / 2, wH(y1) / 2, wV(x0) / 2];
    const V = rectPts(x0, y0, x1, y1);
    const rad = V.map(([vx, vy]) => (CORNERS.has(`${vx},${vy}`) ? RC - 20 : 14));
    const z = ZONES[r][c]; const pieces = [];
    if (z === 'diagA') { pieces.push([[V[0], V[1], V[2]], [ins[0], ins[1], DG / 2], [rad[0], rad[1], rad[2]], 'tri1']); pieces.push([[V[0], V[2], V[3]], [DG / 2, ins[2], ins[3]], [rad[0], rad[2], rad[3]], 'tri2']); }
    else if (z === 'diagB') { pieces.push([[V[0], V[1], V[3]], [ins[0], DG / 2, ins[3]], [rad[0], rad[1], rad[3]], 'tri1']); pieces.push([[V[1], V[2], V[3]], [ins[1], ins[2], DG / 2], [rad[1], rad[2], rad[3]], 'tri2']); }
    else pieces.push([V, ins, rad, 'rect']);
    for (const [verts, d, rr, part] of pieces) {
      const core = insetPoly(verts, d); const inner = insetPoly(verts, d.map((v) => v + 16));
      blocks.push({ zone: z, part, c: 100 + c, r: 100 + r, cell: [x0, y0, x1, y1], curb: cut(roundPoly(core, rr), 14), inner, pave: cut(roundPoly(inner, rr.map((v) => Math.max(6, v - 16))), 30), city: 'aurora' });
    }
  }
  for (const v of VILLAGES) for (let i = 0; i < v.xs.length - 1; i++) {
    const x0 = v.xs[i]; const x1 = v.xs[i + 1]; const y0 = v.ys[0]; const y1 = v.ys[1]; const V = rectPts(x0, y0, x1, y1); const d = [VW / 2, VW / 2, VW / 2, VW / 2];
    blocks.push({ zone: v.zones[i], part: 'rect', c: 200 + i, r: 200, cell: [x0, y0, x1, y1], curb: roundPoly(insetPoly(V, d), 12), inner: insetPoly(V, d.map((q) => q + 14)), pave: roundPoly(insetPoly(V, d.map((q) => q + 14)), 6), city: 'aurora', village: v });
  }
  return blocks;
}

// ---------------------------------------------------------------- 3) chão, aeroporto, natureza, radares e blitz
export function auroraExtras(K) {
  const { R, pick, G, GP, B, SP, PX, XP, P, pine, tree, roundPoly, rectPts, roads, nodes, pois, regions, lamps, decals, fence, runwayLights, radars, T0, dens, wOfS } = K;
  // distrito: calçada externa e asfalto (as ruas são o asfalto entre os quarteirões)
  GP('walk', roundPoly(rectPts(AX[0] - 36, AY[0] - 36, AX[8] + 36, AY[6] + 36), RC + 36));
  GP('base', roundPoly(rectPts(AX[0] - 20, AY[0] - 20, AX[8] + 20, AY[6] + 20), RC + 20));
  for (const v of VILLAGES) {
    GP('walk', roundPoly(rectPts(v.xs[0] - VW / 2 - 16, v.ys[0] - VW / 2 - 16, v.xs.at(-1) + VW / 2 + 16, v.ys[1] + VW / 2 + 16), 20));
    GP('base', roundPoly(rectPts(v.xs[0] - VW / 2, v.ys[0] - VW / 2, v.xs.at(-1) + VW / 2, v.ys[1] + VW / 2), 8));
    regions.push({ name: v.name, rect: [v.xs[0] - 120, v.ys[0] - 120, v.xs.at(-1) + 120, v.ys[1] + 120] });
  }
  // estradas de fora: asfalto com acostamento; trevos e rotatórias de fora com o disco de asfalto
  const outRoads = roads.filter((r) => r.out);
  const ptsOf = (rd) => rd.shape || rd.path.map((id) => nodes[id].slice(0, 2));
  for (const rd of outRoads) { const pts = ptsOf(rd); GP('walk', strip(pts, rd.w + 28), { aur: 1 }); GP('road', strip(pts, rd.w), { aur: 1 }); }
  for (const c of [RB, J1, BMJ]) { G('walk', c.x - c.r - 16, c.y - c.r - 16, (c.r + 16) * 2, (c.r + 16) * 2, 'ellipse'); G('road', c.x - c.r, c.y - c.r, c.r * 2, c.r * 2, 'ellipse'); }
  G('road', 8300 - 24, 1240 - 24, 48, 48, 'ellipse');

  // ---- Aeroporto Internacional Aurora (sudeste, junto à orla)
  const A = AIRPORT2;
  G('grass', 7020, 1372, 1320, 424, 'rect', { park: true, airport: true });
  G('runway', ...A.runway, 'rect', { kind: 'runway' }); G('runway', ...A.taxi, 'rect', { kind: 'taxi' });
  G('runway', A.apron[0], A.apron[1], A.apron[2], A.apron[3], 'rect', { kind: 'apron' });
  for (const x of [7120, 7700, 8240]) G('runway', x, A.taxi[1] + A.taxi[3], 40, A.runway[1] - A.taxi[1] - A.taxi[3], 'rect', { kind: 'taxi' });
  G('runway', 7700, A.apron[1] + A.apron[3], 40, A.taxi[1] - A.apron[1] - A.apron[3], 'rect', { kind: 'taxi' });
  G('lot', ...A.gate, 'rect', { stalls: false });
  // terminal de frente para a avenida, estacionamento, torre e hangar
  { let x = 7320; for (let k = 0; k < 4; k++) { const b = SP('airport', x, 1276, 92, k === 1 ? { label: 'Aeroporto Internacional Aurora' } : {}); x += b.w + 2; } }
  G('lot', 6960, 1276, 270, 90, 'rect', { stalls: true }); K.drive([6960, 1276, 7230, 1366], 'n', 7100);
  for (let k = 0; k < 7; k++) K.spots.push([6980 + k * 36, 1300, -Math.PI / 2]);
  B({ kind: 'torre', x: 8250, y: 1400, w: 40, h: 40, floors: 16, roof: '#e8eef2', wall: '#c8d4e0', label: 'Torre Aurora', tower: true });
  SP('warehouse-blue', 7046, 1392, 132, { label: 'Hangar Aurora' });
  decals.push({ spr: '@heli', x: 8260, y: 1500, w: 56, h: 56 });
  fence.push([7020, 1368, 220, 4], [7300, 1368, 1040, 4], [7020, 1368, 4, 432], [8336, 1368, 4, 432], [7020, 1796, 1320, 4]);
  { const [rx, ry, rw, rh] = A.runway; for (let x = rx; x <= rx + rw; x += 40) { runwayLights.push([x, ry - 2, '#fff7d0']); runwayLights.push([x, ry + rh + 2, '#fff7d0']); } for (let y = ry + 4; y < ry + rh; y += 12) { runwayLights.push([rx - 2, y, '#4ade80']); runwayLights.push([rx + rw + 2, y, '#ff4d5e']); } for (let x = A.taxi[0]; x <= A.taxi[0] + A.taxi[2]; x += 60) runwayLights.push([x, A.taxi[1] - 2, '#60a5fa']); }
  pois.push({ id: 'aeroporto-aurora', label: 'Aeroporto Aurora', at: [7760, 1262], route: '#/veiculos', icon: 'rocket' });
  regions.push({ name: 'Aeroporto Aurora', rect: [6940, 1250, 8400, 1820] });

  // ---- regiões amplas (depois dos quarteirões, que já têm nome próprio)
  regions.push({ name: 'Orla de Aurora', rect: [8380, -1500, 8800, 1240] });
  regions.push({ name: 'Rodovia Aurora', rect: [4096, 1200, 6900, 2300] });
  regions.push({ name: 'Cidade Aurora', rect: [AX[0] - 120, AY[0] - 120, AX[8] + 120, AY[6] + 120] });
  pois.push({ id: 'estrela-aurora', label: 'Praça da Estrela', at: [STAR.x, STAR.y + STAR.r + 20], route: '#/social/eventos', icon: 'sun' });

  // ---- vilas: casas, igreja/mercadinho e árvores (compostas pelos tipos 'vila' — ver city.js); orla com coqueiros
  { // coqueiros e guarda-sóis na praia de Aurora (leste da Av. Beira-Mar)
    for (const id of ['ABM1', 'ABM2']) { const rd = roads.find((r) => r.id === id); const pts = rd.shape; for (let i = 2; i < pts.length - 2; i += 2) { const [x, y] = pts[i]; for (const off of [60, 120]) { const px = x + off + R() * 20; if (T0.zone(px, y) === 0) continue; if (off === 60 || R() < 0.4) PX('coqueiro', px, y, true); else P(`guarda-sol${(i / 2) % 2 | 0}`, px, y, 18, 16, false, { deco: true, ht: 4 }); } } }
  }

  // ---- natureza em volta: mata com clareiras e campos (interior), sem invadir ruas, vilas, aeroporto e cidade
  const CELL = 24; const gx0 = 4096; const gy0 = -2600; const gw = Math.ceil((9200 - gx0) / CELL); const gh = Math.ceil((2500 - gy0) / CELL);
  const keep = new Uint8Array(gw * gh);
  const mark = (x0, y0, x1, y1) => { for (let j = Math.max(0, Math.floor((y0 - gy0) / CELL)); j <= Math.min(gh - 1, Math.floor((y1 - gy0) / CELL)); j++) for (let i = Math.max(0, Math.floor((x0 - gx0) / CELL)); i <= Math.min(gw - 1, Math.floor((x1 - gx0) / CELL)); i++) keep[j * gw + i] = 1; };
  mark(AX[0] - 90, AY[0] - 90, AX[8] + 90, AY[6] + 90); mark(6900, 1180, 8420, 1830);
  for (const v of VILLAGES) mark(v.xs[0] - 70, v.ys[0] - 70, v.xs.at(-1) + 70, v.ys[1] + 70);
  for (const rd of outRoads) { const pts = ptsOf(rd); const m = rd.w / 2 + 40; for (let i = 0; i < pts.length - 1; i++) { const [ax, ay] = pts[i]; const [bx, by] = pts[i + 1]; const L = Math.hypot(bx - ax, by - ay); for (let s = 0; s <= L; s += 12) { const x = ax + ((bx - ax) * s) / L; const y = ay + ((by - ay) * s) / L; mark(x - m, y - m, x + m, y + m); } } }
  for (const c of [RB, J1, BMJ]) mark(c.x - c.r - 50, c.y - c.r - 50, c.x + c.r + 50, c.y + c.r + 50);
  const kept = (x, y) => { const i = Math.floor((x - gx0) / CELL); const j = Math.floor((y - gy0) / CELL); return i < 0 || j < 0 || i >= gw || j >= gh ? false : keep[j * gw + i] === 1; };
  // campos abertos (fazendas) entre as vilas: menos árvores
  const field = (x, y) => (x > 4700 && x < 5500 && y > 200 && y < 1000) || (x > 5900 && x < 6700 && y > 1500 && y < 2200) || (x > 6000 && x < 6700 && y > -2000 && y < -1300);
  for (let y = -2560; y < 2460; y += 26) for (let x = 4570; x < 9150; x += 24) {
    const px = x + (R() - 0.5) * 16; const py = y + (R() - 0.5) * 16;
    if (T0.zone(px, py) !== 2 || T0.zone(px, py - 30) !== 2 || kept(px, py)) continue;
    if (x < 4900 && y > -400 && y < 2400) continue; // já plantado pela mata de Nexus City
    if (px > 8450 && py > -1480 && py < 1200) continue; // orla: entre a Av. Beira-Mar e a praia só coqueiros
    if (R() > (field(px, py) ? 0.05 : 0.18 + dens(px, py) * 0.62)) continue;
    pine(px, py);
  }
  for (const [x, y, s] of [[6200, -2350, 2.2], [5400, -2300, 1.8], [7800, -2400, 2.0], [4800, 400, 1.5]]) if (T0.zone(x, y) === 2 && !kept(x, y) && !kept(x, y - 200)) XP('montanhas', x, y, s, true);

  // ---- radares (limites por via) e pontos de blitz
  const onRoad = (id, f) => { const rd = roads.find((r) => r.id === id); const pts = ptsOf(rd); let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); let s = L * f; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (s <= d) { const t = s / d; return [Math.round(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t), Math.round(pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t)]; } s -= d; } return pts.at(-1); };
  const RAD = [[[6880, -640], 60], [[6880, 320], 60], [[6880, 1020], 60], [[6400, -160], 50], [[7680, -160], 50], [onRoad('ARH1', 0.45), 80], [onRoad('ARH2', 0.5), 80], [onRoad('ABM1', 0.6), 50], [onRoad('ABM2', 0.4), 50], [[7600, 1240], 40], [[6400, 800], 50], [[7360, -1120], 50]];
  for (const [at, limit] of RAD) { radars.push({ at, limit, aurora: true }); PX('placa-50', at[0] + 34, at[1] - 30); }
  const blitz = [
    { id: 'rodovia', name: 'Rodovia Aurora (km 12)', at: onRoad('ARH2', 0.3) },
    { id: 'rodovia2', name: 'Rodovia Aurora (km 4)', at: onRoad('ARH1', 0.6) },
    { id: 'central', name: 'Av. Central', at: [6880, -960] },
    { id: 'palmeiras', name: 'Av. das Palmeiras', at: [6080, 480] },
    { id: 'beiramar', name: 'Av. Beira-Mar', at: onRoad('ABM2', 0.55) },
    { id: 'aeroporto', name: 'Av. do Aeroporto Aurora', at: [7200, 1240] },
    { id: 'boulevard', name: 'Boulevard Aurora', at: [7360, -160] },
  ];
  void B; void tree; void pick; void lamps; void wOfS;
  return { blitz, smart: [], area: [AX[0] - 200, AY[0] - 200, AX[8] + 500, 1900] };
}
