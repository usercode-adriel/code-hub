// MUNDO — Vicewood (gerador determinístico). Reprodução da "cidade pronta" de referência: 1 px da referência = 1 unidade.
// Cidade pequena e orgânica no sudeste da ilha: ruas que contornam os quarteirões (não é grade), construções coladas,
// vegetação ocupando os vãos, praias e água com o contorno da referência, píer central e marina a leste. A ilha em volta
// (costa, lagos, rio, matas, campos, praias e árvores) vem do mapa da ilha de referência (planta.js); a arte é toda da
// prancha de assets (public/assets/mundo, prefixo "m:"). Saída no mesmo formato que os sistemas do jogo usam.
import { SOLID, WALK, ROAD, CROSS, LOT, WATER, GRASS, RUNWAY, PLAZA, SAND } from './world.js';
import { terrainOf } from './terreno.js';
import { CATALOG, genKey, placed } from './obra.js';
import { PECA } from './cenario.js';
import { PLANTA } from './planta.js';

export const W = 1402; export const H = 1122; export const CS = 4;
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const snap = (v) => Math.round(v / CS) * CS;
const nrm = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
const bboxOf = (pts) => { let a = Infinity; let b = Infinity; let c = -Infinity; let d = -Infinity; for (const [x, y] of pts) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); } return [a, b, c, d]; };
const faixa = (a, b, w) => { const [dx, dy] = nrm(b[0] - a[0], b[1] - a[1]); const ox = -dy * w / 2; const oy = dx * w / 2; return [[a[0] + ox, a[1] + oy], [b[0] + ox, b[1] + oy], [b[0] - ox, b[1] - oy], [a[0] - ox, a[1] - oy]]; };
const ilha = (px, py) => [Math.round((px - PLANTA.orig[0]) * PLANTA.esc), Math.round((py - PLANTA.orig[1]) * PLANTA.esc)];

// ---------------------------------------------------------------- ruas (traçado da referência)
const RUAS = [
  ['mirante', 'Rua do Mirante', 34, [[218, 100], [240, 100], [268, 128], [268, 300], [296, 330], [325, 345]]],
  ['poente', 'Av. do Poente', 36, [[325, 345], [325, 610], [325, 695], [325, 825]]],
  ['hospital', 'Rua do Hospital', 34, [[-420, 695], [25, 695], [325, 695]]],
  ['praca', 'Rua da Praça', 34, [[325, 610], [640, 612], [888, 615]]],
  ['oceanica', 'Av. Oceânica', 38, [[-420, 825], [25, 825], [325, 825], [640, 822], [888, 820], [1150, 815], [1238, 815]]],
  ['central', 'Av. Central', 40, [[920, -40], [920, 85], [920, 340], [888, 372], [888, 615], [888, 820], [888, 975]]],
  ['aeroporto', 'Av. do Aeroporto', 34, [[716, 85], [920, 85]]],
  ['prefeitura', 'Rua da Prefeitura', 34, [[640, 340], [920, 340]]],
  ['lago', 'Rua do Lago', 34, [[920, 340], [1265, 335]]],
  ['colina', 'Rua da Colina', 34, [[1265, 335], [1265, 130], [1265, -60], [1420, -140]]],
  ['sol', 'Rua do Sol', 34, [[888, 615], [1150, 625], [1340, 625]]],
  ['posto', 'Rua do Posto', 34, [[1150, 625], [1150, 815]]],
  ['entrada', 'Rua da Entrada', 34, [[-420, 695], [-420, 825]]], // fecha o circuito da entrada oeste (sem beco: viaturas saem para os dois lados)
];
// estradas da ilha (traçadas sobre o mapa da ilha); começam nas saídas da cidade
const ESTRADAS = [
  ['estrada-rio', 'Estrada do Rio', 36, [[-420, 825], [-700, 700], ilha(880, 812), ilha(790, 800), ilha(690, 790), ilha(680, 740), ilha(640, 712), ilha(450, 712), ilha(300, 700), ilha(295, 640), ilha(210, 630)]],
  ['estrada-floresta', 'Estrada da Floresta', 36, [[920, -40], [700, -260], ilha(1040, 600), ilha(900, 585), ilha(760, 590), ilha(610, 598), ilha(560, 600), ilha(520, 560)]],
  ['estrada-serra', 'Estrada da Serra', 34, [ilha(1040, 600), ilha(1030, 500), ilha(1000, 470), ilha(920, 470), ilha(920, 360), ilha(980, 330), ilha(1100, 330)]],
  ['estrada-vale', 'Estrada do Vale', 34, [ilha(920, 360), ilha(700, 360), ilha(560, 340), ilha(330, 330), ilha(310, 250), ilha(300, 200)]],
];
const FIM = new Set(['218,100', '716,85', '640,340', '1340,625', '1238,815', '888,975', '1420,-140', ...ESTRADAS.map(([, , , p]) => p.at(-1).join(','))]);
const ESC_B = 1; // construções na escala da referência

export function generateCity(seed = 20261121, { reforma = null } = {}) {
  const R = rng(seed); const pick = (a) => a[Math.floor(R() * a.length)];
  const RF = reforma || {}; const DEL = new Set(RF.del || []);
  const userAdd = (RF.add || []).map((a) => [a, placed(a)]).filter(([, o]) => o);
  const userFloor = (RF.floor || []).filter((f) => CATALOG[f.k]?.kind === 'floor').map((f) => ({ mat: CATALOG[f.k].mat, shape: 'rect', x: f.x, y: f.y, w: 32, h: 32, u: 1, tex: CATALOG[f.k].tex, rot: f.r || 0 }));

  // ---------------------------------------------------------------- grafo de vias
  const nodes = {}; const roads = [];
  const nid = (x, y) => `n${x}_${y}`;
  const node = (x, y, kind, r) => { const id = nid(x, y); if (!nodes[id]) nodes[id] = r ? [x, y, kind, r] : [x, y, kind]; else { if (kind) nodes[id][2] = kind; if (r) nodes[id][3] = r; } return id; };
  const road = (id, name, w, pts, extra = {}) => { for (const [x, y] of pts) node(x, y); roads.push({ id, name, w, path: pts.map(([x, y]) => nid(x, y)), ...extra }); };
  for (const [id, name, w, pts] of RUAS) road(id, name, w, pts);
  for (const [id, name, w, pts] of ESTRADAS) road(id, name, w, pts, { rural: true });
  for (const k of FIM) { const [x, y] = k.split(',').map(Number); if (nodes[nid(x, y)]) nodes[nid(x, y)][2] = 'exit'; }
  const deg = {}; const maxW = {};
  for (const rd of roads) rd.path.forEach((id, i) => { deg[id] = (deg[id] || 0) + (i > 0) + (i < rd.path.length - 1); maxW[id] = Math.max(maxW[id] || 0, rd.w); });
  for (const [id, n] of Object.entries(nodes)) if (!n[2]) n[2] = deg[id] >= 3 ? undefined : 'corner';
  const AREA = [300, 300, 1300, 850]; // centro monitorado (semáforos inteligentes e câmeras)
  const lights = []; const smartLights = [];
  for (const [id, [x, y, k]] of Object.entries(nodes)) {
    if (k) continue; lights.push(id);
    if (x >= AREA[0] && x <= AREA[2] && y >= AREA[1] && y <= AREA[3]) smartLights.push(id);
  }
  const clearOf = (id) => { const k = nodes[id][2]; return k === 'corner' || k === 'exit' ? 0 : maxW[id] / 2 + 12; };
  const lines = []; const segs = [];
  for (const rd of roads) {
    for (let i = 1; i < rd.path.length; i++) {
      const a = rd.path[i - 1]; const b = rd.path[i]; const pa = nodes[a]; const pb = nodes[b];
      lines.push({ pts: [pa.slice(0, 2), pb.slice(0, 2)], w: rd.w, ca: clearOf(a), cb: clearOf(b), diag: pa[0] !== pb[0] && pa[1] !== pb[1], road: rd.id, out: Boolean(rd.rural) });
      if (pa[0] === pb[0]) segs.push({ v: true, x: pa[0], y0: Math.min(pa[1], pb[1]), y1: Math.max(pa[1], pb[1]), w: rd.w, name: rd.name, noStub: true });
      else if (pa[1] === pb[1]) segs.push({ v: false, y: pa[1], x0: Math.min(pa[0], pb[0]), x1: Math.max(pa[0], pb[0]), w: rd.w, name: rd.name, noStub: true });
    }
  }

  // ---------------------------------------------------------------- camadas e auxiliares
  const ground = []; const blds = []; const props = []; const lamps = []; const pois = []; const regions = []; const spots = []; const decals = []; const fence = [];
  const runwayLights = []; const bridges = []; const driveways = []; let rentSpot = null;
  const G = (mat, x, y, w, h, shape = 'rect', extra = {}) => ground.push({ mat, shape, x: snap(x), y: snap(y), w: snap(w), h: snap(h), ...extra });
  const GP = (mat, pts, extra = {}) => { if (pts.length < 3) return; const [a, b, c, d] = bboxOf(pts); ground.push({ mat, shape: 'poly', pts, x: a, y: b, w: c - a, h: d - b, ...extra }); };
  const poi = (id, label, x, y, route, icon) => pois.push({ id, label, at: [Math.round(x), Math.round(y)], route, icon });
  const tam = (peca, k) => { const t = PECA[peca] || [40, 40]; return [t[0] * k, t[1] * k]; };
  // construção na largura da referência: (x0, yBase) = canto esquerdo da base; w = largura
  // topo: o sprite não passa dessa linha (calçada da rua acima) — encolhe por inteiro, mantendo base, centro e proporção
  const B = (peca, x0, yBase, w, extra = {}) => { const t = PECA[peca]; let k = (w / t[0]) * ESC_B; let h = t[1] * k; if (extra.topo != null && yBase - h < extra.topo) { const k2 = (yBase - extra.topo) / h; x0 += (w - w * k2) / 2; w *= k2; k *= k2; h = yBase - extra.topo; } delete extra.topo; const b = { kind: 'sprite', spr: `m:${peca}`, x: snap(x0), y: snap(yBase - h), w: snap(w), h: snap(h), floors: Math.max(1, Math.round(h / 24)), ...extra }; blds.push(b); return b; };
  const P = (peca, x, y, k, solid = false, extra = {}) => { const [w, h] = tam(peca, k); props.push({ spr: `m:${peca}`, x, y, w, h, solid, ...extra }); };
  const PALMS = ['vegetacao/palmeira', 'vegetacao/palmeira-2', 'vegetacao/palmeira-3', 'vegetacao/palmeira-alta'];
  const TREES = ['vegetacao/arvore-grande', 'vegetacao/arvore-copa', 'vegetacao/arvore-pequena', 'vegetacao/arvore-copa', 'vegetacao/arvore-grande'];
  const BUSH = ['vegetacao/arbusto-1', 'vegetacao/arbusto-2', 'vegetacao/arbusto-3', 'vegetacao/moita-alta', 'vegetacao/moita-alta-2', 'vegetacao/samambaia', 'vegetacao/moita-flor'];
  const palm = (x, y, k = 0.42) => P(pick(PALMS), x, y, k * (0.9 + R() * 0.25), true, { ht: 40 });
  const tree = (x, y, k = 0.42) => P(pick(TREES), x, y, k * (0.85 + R() * 0.3), true, { ht: 30 });
  const bush = (x, y, k = 0.42) => P(pick(BUSH), x, y, k * (0.8 + R() * 0.4), false);
  const porta = (bl) => [bl.x + bl.w / 2, bl.y + bl.h + 12];
  const lamp = (x, y) => { P('objetos/poste-luz', x, y, 0.22, false, { lamp: true }); lamps.push([x, y]); };
  const lot = (x, y, w, h, n = 0, extra = {}) => { G('lot', x, y, w, h, 'rect', { stalls: true, ...extra }); for (let k = 0; k < n; k++) spots.push([x + 20 + k * ((w - 40) / Math.max(1, n - 1)), y + h / 2, -Math.PI / 2]); };

  // ---------------------------------------------------------------- chão da cidade: grama (ladrilho), praias e mar da referência
  G('grass', -10, -10, W + 20, H + 20, 'rect', { park: true });
  for (const p of PLANTA.cidadeAreia) GP('sand', p);
  // mar ao sul (contorno das pedras e da areia da referência) e água da marina a leste — medidos na referência
  GP('water', [[-30, 1000], [60, 994], [150, 1004], [250, 1010], [340, 1030], [420, 1062], [540, 1066], [640, 1042], [760, 1022], [830, 1046], [900, 1086], [1000, 1096], [1100, 1092], [1160, 1110], [1190, 1150], [-30, 1150]]);
  GP('water', [[1342, 218], [1580, 190], [1600, 820], [1330, 778], [1334, 650], [1338, 330]]);
  // calçadas: largas, contínuas e com esquinas arredondadas (círculo em cada nó); ruas por cima
  for (const rd of roads) {
    const pts = rd.path.map((id) => nodes[id]); const cal = rd.rural ? 10 : 30;
    for (let i = 1; i < pts.length; i++) GP('walk', faixa(pts[i - 1], pts[i], rd.w + cal), { ext: rd.rural ? 1 : 0 });
    for (const p of pts) G('walk', p[0] - (rd.w + cal) / 2, p[1] - (rd.w + cal) / 2, rd.w + cal, rd.w + cal, 'ellipse');
  }
  for (const rd of roads) {
    const pts = rd.path.map((id) => nodes[id]);
    for (let i = 1; i < pts.length; i++) GP('road', faixa(pts[i - 1], pts[i], rd.w), { ext: rd.rural ? 1 : 0 });
    for (const p of pts) G('road', p[0] - rd.w / 2, p[1] - rd.w / 2, rd.w, rd.w, 'ellipse');
  }

  // ---------------------------------------------------------------- construções (posição e tamanho da referência)
  // noroeste: mansão com piscina e a torre de vidro curva
  B('construcoes/sobrado-vermelho', 58, 150, 130); P('objetos/piscina', 122, 190, 0.95, true);
  B('construcoes/torre-vidro', 36, 462, 205); P('objetos/piscina', 240, 462, 0.45, true);
  regions.push({ name: 'Colina das Palmeiras', rect: [0, 0, 300, 480] });
  // hospital e lojas
  const hosp = B('construcoes/hospital', 80, 660, 188); poi('hospital', 'Hospital Vicewood', ...porta(hosp), '#/hospital', 'hospital');
  const loj = B('construcoes/lanchonete', 84, 795, 100, { topo: 728 }); B('construcoes/mercado-24h', 186, 795, 104, { topo: 728 }); poi('lojas', 'Lojas da Rua do Hospital', ...porta(loj), '#/mercado', 'bag');
  B('construcoes/predio-azul-baixo', -2, 795, 66);
  regions.push({ name: 'Centro Médico', rect: [0, 480, 310, 810] });
  // aeroporto: torre + terminal (pátio a leste; pista logo ao norte)
  const term = B('construcoes/aeroporto', 362, 292, 300);
  poi('aeroporto', 'Aeroporto Nexus', ...porta(term), '#/veiculos', 'rocket');
  const airport = { runway: [300, -210, 1180, 56], taxi: [666, -150, 30, 262], apron: [642, 112, 252, 190], gate: [600, 180, 40, 100] };
  G('runway', ...airport.runway); G('runway', ...airport.taxi, 'rect', { taxi: true }); G('runway', 300, -150, 1180, 26, 'rect', { taxi: true });
  G('runway', ...airport.apron, 'rect', { kind: 'apron' }); G('lot', ...airport.gate, 'rect', { stalls: false });
  const planeSpots = [[690, 200, -Math.PI / 2], [760, 200, -Math.PI / 2], [840, 200, -Math.PI / 2], [720, 270, -Math.PI / 2], [810, 270, -Math.PI / 2]];
  poi('hangar', 'Hangar · Aeronaves', 860, 300, '#/veiculos', 'rocket');
  regions.push({ name: 'Aeroporto Nexus', rect: [280, -260, 940, 300] });
  for (const [x, y, w, h] of [[280, -240, 1220, 4], [280, -240, 4, 130], [1496, -240, 4, 130]]) fence.push([x, y, w, h]);
  { const [rx, ry, rw, rh] = airport.runway; for (let x = rx; x <= rx + rw; x += 40) { runwayLights.push([x, ry - 2, '#fff7d0']); runwayLights.push([x, ry + rh + 2, '#fff7d0']); } for (let y = ry + 4; y < ry + rh; y += 12) { runwayLights.push([rx - 2, y, '#4ade80']); runwayLights.push([rx + rw + 2, y, '#ff4d5e']); } }
  // centro: torre Vicewood, prefeitura com chafariz, Vinewood e prédio branco
  const torreV = B('construcoes/torre-cilindrica', 382, 455, 118); poi('banco', 'Banco Vicewood', ...porta(torreV), '#/banco', 'wallet');
  const imob = B('construcoes/predio-laranja', 382, 586, 80); poi('imobiliaria', 'Imobiliária Horizonte', ...porta(imob), '#/propriedades', 'building');
  G('pave', 362, 300, 150, 300);
  const pref = B('construcoes/predio-bege', 596, 470, 168, { topo: 372 }); poi('prefeitura', 'Prefeitura', ...porta(pref), '#/governo', 'flag'); poi('forum', 'Fórum', pref.x + 20, pref.y + pref.h + 12, '#/justica', 'scale');
  G('pave', 560, 470, 230, 128); decals.push({ spr: '@fonte', x: 645, y: 492, w: 90, h: 90 }); poi('praca', 'Praça da Fonte', 690, 590, '#/social/eventos', 'sun');
  for (const [x, y] of [[586, 500], [586, 580], [774, 500], [774, 580]]) P('objetos/banco-jardim', x, y, 0.3, true);
  const vine = B('construcoes/casa-noturna', 410, 800, 230); poi('cassino', 'Vinewood Club & Cassino', ...porta(vine), '#/diversao', 'trophy');
  const branco = B('construcoes/predio-branco', 650, 792, 112); poi('empregos', 'Agência de Empregos', ...porta(branco), '#/empregos', 'briefcase');
  regions.push({ name: 'Centro de Vicewood', rect: [310, 300, 900, 810] });
  // leste: hotel com heliponto, prédios, casas do lago, marina e posto
  B('construcoes/predio-bege', 904, 470, 98); B('construcoes/predio-azul-baixo', 906, 568, 94);
  const hotel = B('construcoes/hotel', 1008, 600, 150); poi('hotel', 'Hotel Vicewood', ...porta(hotel), '#/acontecimentos', 'building');
  G('pond', 990, 96, 172, 80, 'ellipse'); G('pier', 1040, 150, 70, 12); poi('lago', 'Lago da Colina', 1075, 190, '#/social/eventos', 'sun');
  B('construcoes/casa-branca', 1030, 266, 76); B('construcoes/casa-azul', 1120, 276, 72); B('construcoes/casa-vermelha', 1296, 66, 76);
  regions.push({ name: 'Colina do Lago', rect: [930, 0, 1300, 330] });
  const mar = B('construcoes/predio-bege', 1178, 460, 150, { topo: 368 }); lot(1180, 466, 112, 130, 8, { showroom: true });
  poi('concessionaria', 'Concessionária Turbo', ...porta(mar), '#/veiculos', 'car');
  const posto = B('construcoes/posto', 905, 792, 226); lot(910, 792, 216, 14, 0); poi('posto', 'Posto Vicewood', ...porta(posto), '#/veiculos', 'fuel');
  const shop = B('construcoes/predio-laranja', 1170, 772, 120, { topo: 658 }); poi('shopping', 'Galeria do Sol', ...porta(shop), '#/mercado', 'bag');
  regions.push({ name: 'Avenida do Sol', rect: [900, 330, 1340, 810] });
  // marina: calçadão de madeira e píeres
  G('pier', 1336, 345, 32, 280); for (const y of [360, 420, 480, 540, 600]) G('pier', 1368, y, 90, 14);
  poi('porto', 'Marina Vicewood', 1350, 640, '#/empregos', 'briefcase'); regions.push({ name: 'Marina', rect: [1300, 330, 1500, 700] });
  // orla: prédios, parque com coreto, farol com a casinha
  B('construcoes/predio-laranja', 414, 938, 60); const sup = B('construcoes/predio-laranja', 642, 960, 116, { topo: 858 }); poi('mercado2', 'Supermercado da Orla', ...porta(sup), '#/mercado', 'cart');
  G('grass', 900, 838, 240, 150, 'rect', { park: true }); G('pond', 922, 912, 80, 40, 'ellipse');
  B('construcoes/quiosque-palafita', 1030, 952, 72); poi('parque', 'Parque do Coreto', 1010, 990, '#/social/eventos', 'sun'); poi('parque2', 'Parque da Orla', 520, 870, '#/social/eventos', 'sun');
  B('construcoes/farol', 1268, 952, 74); B('construcoes/casa-vermelha', 1334, 968, 50);
  regions.push({ name: 'Ponta do Farol', rect: [1150, 830, 1402, 1122] }, { name: 'Orla de Vicewood', rect: [0, 830, 1150, 1122] });
  // píer central (madeira) entrando no mar
  G('pier', 572, 950, 30, 172); G('pier', 520, 1060, 172, 40); G('pier', 640, 990, 50, 70);
  // praia: guarda-sóis, cadeiras, salva-vidas, cabines e pranchas (onde a referência mostra areia)
  const naAreia = (x, y) => PLANTA.cidadeAreia.some((p) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i]; const [xj, yj] = p[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; });
  for (const [x, y, k] of [[300, 955, 'salva-vidas'], [880, 1040, 'salva-vidas'], [120, 930, 'cabine-azul'], [160, 935, 'cabine-vermelha'], [470, 1000, 'pranchas']]) if (naAreia(x, y)) P(`objetos/${k}`, x, y, 0.45, true);
  for (let k = 0; k < 60; k++) { const x = R() * W; const y = 860 + R() * 220; if (!naAreia(x, y) || Math.abs(x - 590) < 80) continue; if (R() < 0.55) { P(pick(['objetos/guarda-sol', 'objetos/guarda-sol-2']), x, y, 0.42); P('objetos/cadeira-praia', x + 12, y + 10, 0.36); } }

  // ---------------------------------------------------------------- saídas da cidade: serviços (anel compacto a oeste e nordeste)
  const pol = B('construcoes/delegacia', -394, 660, 170); poi('policia', 'Delegacia', ...porta(pol), '#/policia', 'shield');
  const bomb = B('construcoes/predio-bege', -208, 660, 120); poi('bombeiros', 'Corpo de Bombeiros', ...porta(bomb), '#/acontecimentos', 'flame');
  lot(-400, 730, 360, 58, 0); for (let k = 0; k < 7; k++) { const sp = [-380 + k * 52, 760, -Math.PI / 2]; spots.push(sp); if (!rentSpot && k === 0) rentSpot = sp; }
  poi('estacionamento', 'Estacionamento da Entrada', -220, 794, '#/veiculos', 'car'); poi('locadora', 'Locadora Nexus Rent', -380, 794, '#/locadora', 'car'); poi('terminal', 'Terminal Rodoviário', -60, 794, '#/acontecimentos', 'bus');
  const esc = B('construcoes/predio-laranja', -150, 124, 92); G('pave', -300, 36, 140, 88, 'rect', { court: true });
  poi('escola', 'Escola e Universidade', ...porta(esc), '#/empresas/carreira', 'school'); poi('estadio', 'Quadra da Escola', -230, 132, '#/diversao', 'trophy');
  const cons = B('construcoes/predio-azul-baixo', 1300, 60, 108); cons.label = 'Construtora Nexus'; G('lot', 1414, -20, 70, 90, 'rect', { industrial: true });
  poi('construtora', 'Construtora Nexus', ...porta(cons), '#/construtora', 'building'); poi('industria', 'Distrito Industrial', 1450, 74, '#/empresas', 'briefcase');
  regions.push({ name: 'Entrada Oeste', rect: [-460, 560, 0, 860] }, { name: 'Vila Escolar', rect: [-320, 0, 0, 160] });

  // ---------------------------------------------------------------- ilha: praias, matas, campos, vilas, serra, cânion e árvores
  for (const p of PLANTA.sand) GP('sand', p, { ext: 1 });
  for (const p of PLANTA.campos) GP('campo', p, { ext: 1 });
  for (const p of PLANTA.matas) GP('mata', p, { ext: 1 });
  // cânion (oeste) e campos de cultivo das fazendas
  { // cânion: contorno orgânico (elipse com ondulação), não um polígono reto
    const [cx, cy] = ilha(220, 505); const pts = [];
    for (let k = 0; k < 36; k++) { const a = (k / 36) * Math.PI * 2; const r = 1 + 0.16 * Math.sin(a * 3 + 1) + 0.08 * Math.sin(a * 7) + (R() - 0.5) * 0.08; pts.push([Math.round(cx + Math.cos(a) * 880 * r), Math.round(cy + Math.sin(a) * 520 * r)]); }
    GP('terra', pts, { ext: 1 });
  }
  for (const [x0, y0, x1, y1] of [[300, 250, 500, 305], [850, 280, 1050, 340], [330, 650, 420, 700], [800, 860, 860, 900], [940, 210, 1040, 250]]) { const [ax, ay] = ilha(x0, y0); const [bx, by] = ilha(x1, y1); G('canteiro', ax, ay, bx - ax, by - ay, 'rect', { ext: 1 }); }
  const NAT = [];
  // serra (norte), montanhas a leste e no meio, e o anel de relevo junto às bordas do mapa
  for (const [px, py, k] of [[540, 70, 1.5], [640, 60, 1.6], [740, 90, 1.4], [600, 150, 1.3], [700, 170, 1.2], [480, 130, 1.1], [760, 220, 0.9], [1000, 200, 0.9], [1050, 360, 1.1], [1010, 600, 0.8], [470, 380, 0.8],
    [250, 90, 0.8], [130, 300, 0.7], [90, 600, 0.6], [110, 760, 0.7], [1200, 180, 0.7], [1220, 420, 0.7], [850, 70, 0.8]]) { const [x, y] = ilha(px, py); P('relevo/montanha', x, y, k * 1.2, true, { ht: 160 }); NAT.push([x, y, 480 * k]); }
  for (const [peca, px, py] of [['penhasco-caverna', 120, 470], ['penhasco-grande', 200, 520], ['penhasco-medio', 290, 450], ['penhasco-baixo', 330, 560], ['penhasco-grande', 70, 540], ['penhasco-medio', 360, 500],
    ['penhasco-cascata', 520, 180], ['penhasco-baixo', 90, 200], ['penhasco-medio', 60, 420], ['penhasco-grande', 1230, 260], ['penhasco-baixo', 1200, 560], ['penhasco-medio', 430, 860], ['penhasco-baixo', 250, 830],
    ['penhasco-grande', 160, 140], ['penhasco-medio', 1120, 120]]) { const [x, y] = ilha(px, py); P(`relevo/${peca}`, x, y, 1.15, true, { ht: 120 }); NAT.push([x, y, 220]); }
  regions.push({ name: 'Serra Violeta', rect: [...ilha(430, 0), ...ilha(860, 280)] }, { name: 'Cânion Vermelho', rect: [...ilha(20, 390), ...ilha(420, 620)] }, { name: 'Vale do Rio', rect: [...ilha(420, 280), ...ilha(900, 800)] });
  const longeDaEstrada = (x, y) => ESTRADAS.every(([, , w, pts]) => pts.slice(1).every((b, i) => { const a = pts[i]; const [dx, dy] = nrm(b[0] - a[0], b[1] - a[1]); const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const t = Math.max(0, Math.min(L, (x - a[0]) * dx + (y - a[1]) * dy)); return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t) > w / 2 + 22; }));
  // vilas e fazendas (casas nas posições do mapa)
  const CASAS = ['construcoes/casa-azul', 'construcoes/casa-cinza', 'construcoes/casa-vermelha', 'construcoes/casa-branca', 'construcoes/casa-ardosia', 'construcoes/sobrado-vermelho'];
  for (const [px, py] of [[330, 65], [210, 275], [345, 270], [515, 290], [410, 360], [520, 430], [760, 445], [655, 545], [950, 225], [940, 420], [1095, 395], [1120, 620], [910, 665], [1020, 665], [720, 770], [410, 770], [240, 760], [540, 870], [820, 880], [330, 575], [230, 600], [150, 870]]) {
    const [x, y] = ilha(px, py); const w = 96 + R() * 30;
    if (![[x - 50, y - 60], [x - 50 + w, y - 60], [x - 50, y + 40], [x - 50 + w, y + 40], [x - 50 + w / 2, y - 10]].every(([qx, qy]) => longeDaEstrada(qx, qy))) continue;
    B(pick(CASAS), x - 50, y + 40, w);
  }
  regions.push({ name: 'Ilha de Vicewood', rect: [PLANTA.bounds.x0, PLANTA.bounds.y0, PLANTA.bounds.x1, PLANTA.bounds.y1] });
  // árvores da ilha (sorteadas pela densidade da mata do mapa); longe das estradas, das casas e do relevo
  const naCidade = (x, y) => x > -470 && x < W + 120 && y > -280 && y < H + 20;
  const pertoDeCasa = (x, y) => blds.some((b) => x > b.x - 16 && x < b.x + b.w + 16 && y > b.y - 10 && y < b.y + b.h + 30);
  for (const [x, y, v] of PLANTA.arvores) {
    if (naCidade(x, y) || !longeDaEstrada(x, y) || NAT.some(([nx, ny, r]) => Math.abs(x - nx) < r * 0.55 && y < ny + 30 && y > ny - r * 0.45) || pertoDeCasa(x, y)) continue;
    if (v < 55) tree(x, y, 0.4); else if (v < 72) palm(x, y, 0.4); else if (v < 92) bush(x, y, 0.5); else P(pick(['relevo/pedras', 'relevo/pedras-2', 'relevo/pedras-3']), x, y, 0.35, true);
  }
  // farol do ilhéu ao sul (como no mapa)
  { const [x, y] = ilha(525, 1010); B('construcoes/farol', x - 40, y, 80); }

  // ---------------------------------------------------------------- vegetação da cidade: palmeiras e arbustos em todo vão livre
  const T0 = terrainOf('ilha');
  const BB = T0.bounds; const OX = -BB.x0; const OY = -BB.y0; const mw = T0.mw; const mh = T0.mh;
  const mask = T0.grid.slice(); const heights = new Uint8Array(mw * mh);
  const cl = (v, m) => Math.max(0, Math.min(m, v));
  const code = { access: LOT, front: WALK, pond: WATER, water: WATER, sand: SAND, grass: GRASS, walk: WALK, road: ROAD, cross: CROSS, lot: LOT, runway: RUNWAY, plaza: PLAZA, base: ROAD, curb: WALK, pave: PLAZA, bed: GRASS, pier: WALK, mata: GRASS, campo: GRASS, terra: GRASS, canteiro: GRASS };
  const fillRect = (c, x, y, w, h) => { const ax = cl(Math.floor((x + OX) / CS), mw); const ay = cl(Math.floor((y + OY) / CS), mh); const bx = cl(Math.ceil((x + w + OX) / CS), mw); const by = cl(Math.ceil((y + h + OY) / CS), mh); if (bx <= ax) return; for (let j = ay; j < by; j++) mask.fill(c, j * mw + ax, j * mw + bx); };
  const fillEll = (c, x, y, w, h) => { const cx = x + w / 2 + OX; const cy = y + h / 2 + OY; for (let j = cl(Math.floor((y + OY) / CS), mh); j < cl(Math.ceil((y + h + OY) / CS), mh); j++) for (let i = cl(Math.floor((x + OX) / CS), mw); i < cl(Math.ceil((x + w + OX) / CS), mw); i++) { const dx = ((i + 0.5) * CS - cx) / (w / 2); const dy = ((j + 0.5) * CS - cy) / (h / 2); if (dx * dx + dy * dy <= 1) mask[j * mw + i] = c; } };
  const fillPoly = (c, pts) => {
    const [, b0, , b1] = bboxOf(pts); const xs = [];
    for (let j = Math.max(0, Math.floor((b0 + OY) / CS)); j <= Math.min(mh - 1, Math.ceil((b1 + OY) / CS)); j++) {
      const y = (j + 0.5) * CS - OY; xs.length = 0;
      for (let i = 0, n = pts.length; i < n; i++) { const [ax, ay] = pts[i]; const [bx, by] = pts[(i + 1) % n]; if ((ay > y) !== (by > y)) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax)); }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) { const i0 = Math.max(0, Math.ceil((xs[k] + OX) / CS - 0.5)); const i1 = Math.min(mw - 1, Math.floor((xs[k + 1] + OX) / CS - 0.5)); if (i1 >= i0) mask.fill(c, j * mw + i0, j * mw + i1 + 1); }
    }
  };
  // faixas de pedestre nos braços dos cruzamentos da cidade
  for (const [id, [nx, ny, k]] of Object.entries(nodes)) {
    if (k) continue;
    for (const L of lines) {
      if (L.out) continue;
      for (const [p0, p1] of [[L.pts[0], L.pts[1]], [L.pts.at(-1), L.pts.at(-2)]]) {
        if (p0[0] !== nx || p0[1] !== ny) continue;
        const dist = maxW[id] / 2 + 8; const [dx, dy] = nrm(p1[0] - p0[0], p1[1] - p0[1]); const cx = nx + dx * dist; const cy = ny + dy * dist; const hw = L.w / 2; const ox = -dy; const oy = dx;
        GP('cross', [[cx - dx * 5 + ox * hw, cy - dy * 5 + oy * hw], [cx + dx * 5 + ox * hw, cy + dy * 5 + oy * hw], [cx + dx * 5 - ox * hw, cy + dy * 5 - oy * hw], [cx - dx * 5 - ox * hw, cy - dy * 5 - oy * hw]], { cx, cy, ang: Math.atan2(dy, dx), cw: L.w });
      }
    }
  }
  const order = ['grass', 'water', 'sand', 'campo', 'mata', 'terra', 'canteiro', 'plaza', 'front', 'walk', 'curb', 'base', 'pave', 'lot', 'bed', 'pond', 'access', 'pier', 'road', 'cross', 'runway'];
  for (const m of order) for (const g of ground) if (g.mat === m) { if (g.shape === 'poly') fillPoly(code[m], g.pts); else (g.shape === 'ellipse' ? fillEll : fillRect)(code[m], g.x, g.y, g.w, g.h); }
  for (const f of userFloor) { ground.push(f); fillRect(code[f.mat], f.x, f.y, f.w, f.h); }
  for (const f of fence) fillRect(SOLID, ...f);
  for (let i = blds.length - 1; i >= 0; i--) if (DEL.has(genKey(blds[i]))) blds.splice(i, 1);
  for (const [, o] of userAdd) if (o.kind === 'sprite') blds.push(o);
  for (const [, o] of userAdd) if (!o.kind && !o.decal) props.push(o);
  for (const [, o] of userAdd) if (o.decal) decals.push(o);
  blds.forEach((b, i) => { b.i = i; });
  for (const b of blds) {
    const hgt = Math.min(250, b.floors * 9 + 6); const top = b.y + b.h * 0.12; const fundo = b.y + b.h * 0.86;
    fillRect(SOLID, b.x + b.w * 0.06, top, b.w * 0.88, fundo - top);
    const ax = Math.floor((b.x + OX) / CS); const ay = Math.floor((b.y + OY) / CS); const bx2 = Math.ceil((b.x + b.w + OX) / CS); const by2 = Math.ceil((fundo + OY) / CS);
    for (let j = ay; j < by2; j++) for (let i = ax; i < bx2; i++) if (i >= 0 && j >= 0 && i < mw && j < mh) heights[j * mw + i] = Math.max(heights[j * mw + i], hgt);
  }
  const maskAt = (x, y) => { const i = Math.floor((x + OX) / CS); const j = Math.floor((y + OY) / CS); return i < 0 || j < 0 || i >= mw || j >= mh ? -1 : mask[j * mw + i]; };
  const livre = (x, y, r) => [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dy]) => maskAt(x + dx, y + dy) === GRASS) && !blds.some((b) => x > b.x - r && x < b.x + b.w + r && y > b.y - 4 && y < b.y + b.h + r + 14);
  // a cidade é cheia de verde: palmeiras e arbustos preenchem cada vão de grama (grade com sorteio)
  for (let y = 12; y < H; y += 26) for (let x = -440; x < W + 100; x += 26) {
    const jx = x + (R() - 0.5) * 14; const jy = y + (R() - 0.5) * 14;
    if (!livre(jx, jy, 9)) continue;
    const r = R(); if (r < 0.42) palm(jx, jy, 0.4); else if (r < 0.62) bush(jx, jy, 0.42); else if (r < 0.7) tree(jx, jy, 0.36);
  }
  // borda da cidade em direção à ilha: mata fechando o contorno (sem linha reta)
  for (let k = 0; k < 500; k++) { const x = -470 + R() * (W + 600); const y = -300 + R() * (H + 300); if (naCidade(x, y) && x > 0 && x < W && y > 0 && y < H) continue; if (maskAt(x, y) !== GRASS || !livre(x, y, 10) || !longeDaEstrada(x, y)) continue; (R() < 0.5 ? tree : palm)(x, y, 0.42); }

  // ---------------------------------------------------------------- postes de luz ao longo das ruas da cidade e placas
  for (const L of lines) {
    if (L.out) continue;
    const len = Math.hypot(L.pts[1][0] - L.pts[0][0], L.pts[1][1] - L.pts[0][1]); const s0 = L.ca + 20; const s1 = len - L.cb - 20; if (s1 <= s0) continue;
    const [dx, dy] = nrm(L.pts[1][0] - L.pts[0][0], L.pts[1][1] - L.pts[0][1]); const nx = -dy; const ny = dx;
    for (let s = s0, k = 0; s <= s1; s += 120, k++) {
      const side = k % 2 ? 1 : -1; const x = L.pts[0][0] + dx * s + nx * side * (L.w / 2 + 9); const y = L.pts[0][1] + dy * s + ny * side * (L.w / 2 + 9);
      if (maskAt(x, y) === WALK) lamp(x, y + 4);
    }
  }

  // ---------------------------------------------------------------- radares, blitz e área monitorada
  const radars = [{ at: [888, 480], limit: 40 }, { at: [500, 822], limit: 40 }, { at: [325, 480], limit: 40 }, { at: [1060, 337], limit: 40 }, { at: [-200, 825], limit: 60 }];
  const blitz = [
    { id: 'oceanica', name: 'Av. Oceânica', at: [500, 822] },
    { id: 'central', name: 'Av. Central', at: [888, 480] },
    { id: 'poente', name: 'Av. do Poente', at: [325, 480] },
    { id: 'entrada-oeste', name: 'Entrada Oeste (Av. Oceânica)', at: [-200, 825] },
    { id: 'estrada-rio', name: 'Estrada do Rio', at: ESTRADAS[0][3][1] },
    { id: 'estrada-floresta', name: 'Estrada da Floresta', at: [810, -150] },
    { id: 'lago', name: 'Rua do Lago', at: [1100, 337] },
  ];
  const nodeInfo = Object.fromEntries(Object.entries(nodes).map(([id, n]) => [id, { x: n[0], y: n[1], kind: n[2], maxW: maxW[id] || 0, r: n[3] || 46 }]));
  return {
    name: 'Vicewood', W, H, CS, mw, mh, mask, heights, ox: OX, oy: OY, bounds: BB, coast: T0, core: { w: W, h: H }, stubs: [], ground, blds, props, decals, lamps, pois, regions, bridges, driveways, fence, airport, runwayLights, spots, rentSpot, planeSpots,
    aurora: { blitz, area: AREA },
    R: { w: W, h: H, nodes, roads, lights, smartLights, lots: [], pois, regions, radars }, segs, lines, nodeInfo,
  };
}
