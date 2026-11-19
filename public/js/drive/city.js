// Gerador da cidade do mapa jogável (Nexus City). Determinístico: a mesma semente gera a mesma cidade.
// Produz só dados (sem desenhar): ruas para o grafo de trânsito, chão e construções para a renderização,
// máscara de colisão (4 unidades por célula), altura das construções (para os aviões), luzes, pontos de interesse,
// bairros, aeroporto e vagas. Unidade = 1 "pixel de arte"; 1 unidade ≈ 0,2 m.
import { SOLID, WALK, ROAD, CROSS, LOT, WATER, GRASS, RUNWAY, PLAZA, SAND } from './world.js';

export const W = 4096; export const H = 2816; export const CS = 4;

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const snap = (v) => Math.round(v / CS) * CS;

// ---------------------------------------------------------------- ruas
// verticais: [x, y0, y1, largura, nome]   horizontais: [y, x0, x1, largura, nome]
const VR = [
  [352, 160, 2720, 32, 'Rua da Orla'], [704, 0, 2816, 48, 'Av. Atlântica'], [1056, 160, 2720, 32, 'Rua das Flores'], [1376, 160, 2720, 32, 'Rua Central'],
  [1728, 0, 2816, 48, 'Av. Nexus'], [2080, 160, 2720, 32, 'Rua do Comércio'], [2400, 160, 2720, 32, 'Rua dos Bancos'], [2752, 0, 2816, 48, 'Av. Industrial'],
  [3104, 1504, 2720, 32, 'Rua do Porto Seco'], [3456, 1504, 2720, 32, 'Rua das Fábricas'], [3808, 1504, 2720, 32, 'Rua dos Galpões'], [3984, 1248, 1504, 32, 'Acesso ao Terminal'],
];
const HR = [
  [160, 352, 2752, 32, 'Rua do Norte'], [576, 352, 2752, 48, 'Av. das Nações'], [928, 352, 2752, 32, 'Rua do Mercado'], [1248, 352, 3984, 32, 'Rua do Aeroporto'],
  [1504, 352, 4096, 48, 'Av. Brasil'], [1824, 352, 4096, 32, 'Rua da Ponte'], [2304, 352, 4096, 48, 'Av. do Rio'], [2720, 352, 4096, 32, 'Rua do Sul'],
];
const ROUND = new Set(['1728,1248']);
const X = [352, 704, 1056, 1376, 1728, 2080, 2400, 2752]; const Y = [160, 576, 928, 1248, 1504, 1824, 2304, 2720];
const X2 = [2752, 3104, 3456, 3808, 4096]; const Y2 = [1504, 1824, 2304, 2720];
const ZONES = [
  ['estadio', 'residencial', 'residencial', 'empresarial', 'empresarial', 'empresarial', 'banco'],
  ['praia', 'comercial', 'comercial', 'comercial', 'shopping', 'empresarial', 'empresarial'],
  ['praia', 'comercial', 'comercial', 'praca', 'comercial', 'hospital', 'policia'],
  ['praia', 'comercial', 'terminal', 'comercial', 'prefeitura', 'estacionamento', 'concessionaria'],
  ['residencial', 'residencial', 'escola', 'residencial', 'residencial', 'residencial', 'residencial'],
  ['rio', 'rio', 'rio', 'lago', 'residencial', 'comercial', 'residencial'],
  ['residencial', 'parque', 'residencial', 'residencial', 'residencial', 'comercial', 'residencial'],
];
const ZONES2 = [['posto', 'galpoes', 'galpoes', 'tanques'], ['galpoes', 'conteineres', 'fabrica', 'galpoes'], ['conteineres', 'galpoes', 'fabrica', 'galpoes']];
const REGION = { estadio: 'Estádio', residencial: 'Bairro Residencial', empresarial: 'Distrito Empresarial', banco: 'Distrito Empresarial', praia: 'Orla', comercial: 'Centro Comercial', shopping: 'Centro Comercial', praca: 'Praça Central', hospital: 'Centro', policia: 'Centro', terminal: 'Terminal Rodoviário', prefeitura: 'Centro Cívico', estacionamento: 'Centro', concessionaria: 'Centro', escola: 'Vila Escolar', rio: 'Beira-Rio', lago: 'Parque do Lago', parque: 'Parque Sul', posto: 'Área Industrial', galpoes: 'Área Industrial', tanques: 'Área Industrial', conteineres: 'Porto Seco', fabrica: 'Área Industrial' };

export function generateCity(seed = 20261119) {
  const R = rng(seed);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const nodes = {}; const roads = [];
  const nid = (x, y) => `n${x}_${y}`;
  const addNode = (x, y, kind) => { const id = nid(x, y); if (!nodes[id]) nodes[id] = [x, y, kind]; else if (kind) nodes[id][2] = kind; return id; };
  // cruzamentos
  for (const [x, ya, yb] of VR) for (const [y, xa, xb] of HR) if (x >= xa && x <= xb && y >= ya && y <= yb) addNode(x, y, ROUND.has(`${x},${y}`) ? 'round' : undefined);
  const segs = [];
  for (const [x, y0, y1, w, name] of VR) {
    const ids = Object.values(nodes).filter(([nx, ny]) => nx === x && ny >= y0 && ny <= y1).map(([nx, ny]) => [ny, nid(nx, ny)]);
    if (!ids.some(([y]) => y === y0)) ids.push([y0, addNode(x, y0, y0 <= 0 || y0 >= H ? 'exit' : 'corner')]);
    if (!ids.some(([y]) => y === y1)) ids.push([y1, addNode(x, y1, y1 <= 0 || y1 >= H ? 'exit' : 'corner')]);
    ids.sort((a, b) => a[0] - b[0]);
    roads.push({ id: `V${x}`, name, w, path: ids.map((i) => i[1]) });
    segs.push({ v: true, x, y0, y1, w, name });
  }
  for (const [y, x0, x1, w, name] of HR) {
    const ids = Object.values(nodes).filter(([nx, ny]) => ny === y && nx >= x0 && nx <= x1).map(([nx, ny]) => [nx, nid(nx, ny)]);
    if (!ids.some(([x]) => x === x0)) ids.push([x0, addNode(x0, y, x0 <= 0 || x0 >= W ? 'exit' : 'corner')]);
    if (!ids.some(([x]) => x === x1)) ids.push([x1, addNode(x1, y, x1 <= 0 || x1 >= W ? 'exit' : 'corner')]);
    ids.sort((a, b) => a[0] - b[0]);
    roads.push({ id: `H${y}`, name, w, path: ids.map((i) => i[1]) });
    segs.push({ v: false, y, x0, x1, w, name });
  }
  // grau de cada nó: T e cruzamentos viram "cross"; quinas de duas ruas, "corner"
  const deg = {}; for (const rd of roads) rd.path.forEach((id, i) => { deg[id] = (deg[id] || 0) + (i > 0) + (i < rd.path.length - 1); });
  for (const [id, n] of Object.entries(nodes)) if (!n[2]) n[2] = deg[id] >= 3 ? undefined : 'corner';
  const wOf = (x, y) => { let wv = 0; let wh = 0; for (const s of segs) { if (s.v && s.x === x && y >= s.y0 && y <= s.y1) wv = Math.max(wv, s.w); if (!s.v && s.y === y && x >= s.x0 && x <= s.x1) wh = Math.max(wh, s.w); } return [wv, wh]; };
  // semáforos: todo cruzamento com avenida e metade dos de ruas
  const lights = [];
  for (const [id, [x, y, k]] of Object.entries(nodes)) { if (k) continue; const [wv, wh] = wOf(x, y); if (wv === 48 || wh === 48 || R() < 0.45) lights.push(id); }

  // ---------------------------------------------------------------- camadas
  const ground = []; // { mat, shape: 'rect'|'ellipse', x, y, w, h }
  const G = (mat, x, y, w, h, shape = 'rect', extra = {}) => ground.push({ mat, shape, x: snap(x), y: snap(y), w: snap(w), h: snap(h), ...extra });
  const blds = []; const props = []; const lamps = []; const pois = []; const regions = []; const spots = [];
  // mar, praia e cinturões verdes
  G('water', 0, 0, 232, H); G('sand', 232, 0, 88, H);
  G('water', 0, 1992, 1504, 80);
  // rio cruza as quadras da beira-rio: margens de areia
  G('sand', 0, 1976, 1440, 16); G('sand', 0, 2072, 1440, 16);

  // asfalto e calçadas (calçada = 16 de cada lado)
  for (const s of segs) {
    if (s.v) { G('walk', s.x - s.w / 2 - 16, Math.max(0, s.y0 - 16), s.w + 32, Math.min(H, s.y1 + 16) - Math.max(0, s.y0 - 16), 'rect', { road: s }); }
    else G('walk', Math.max(0, s.x0 - 16), s.y - s.w / 2 - 16, Math.min(W, s.x1 + 16) - Math.max(0, s.x0 - 16), s.w + 32, 'rect', { road: s });
  }
  for (const s of segs) {
    if (s.v) G('road', s.x - s.w / 2, s.y0, s.w, s.y1 - s.y0, 'rect', { road: s }); else G('road', s.x0, s.y - s.w / 2, s.x1 - s.x0, s.w, 'rect', { road: s });
  }
  for (const [id, [x, y, k]] of Object.entries(nodes)) {
    const [wv, wh] = wOf(x, y);
    if (k === 'round') { G('road', x - 46, y - 46, 92, 92, 'ellipse', { round: true }); G('plaza', x - 18, y - 18, 36, 36, 'ellipse', { island: true }); continue; }
    if (k === 'exit' || k === 'corner') continue;
    // faixas de pedestre nos quatro braços
    const cw = 8;
    if (wh) { G('cross', x - wv / 2 - 4 - cw, y - wh / 2, cw, wh, 'rect', { dir: 'v' }); G('cross', x + wv / 2 + 4, y - wh / 2, cw, wh, 'rect', { dir: 'v' }); }
    if (wv) { G('cross', x - wv / 2, y - wh / 2 - 4 - cw, wv, cw, 'rect', { dir: 'h' }); G('cross', x - wv / 2, y + wh / 2 + 4, wv, cw, 'rect', { dir: 'h' }); }
    void id;
  }
  // pontes sobre o rio
  const bridges = [];
  for (const s of segs) if (s.v && s.x < 1440) bridges.push({ x: s.x - s.w / 2 - 16, y: 1992, w: s.w + 32, h: 80 });

  // ---------------------------------------------------------------- quadras
  const sidewalkHalf = (w) => w / 2 + 16;
  const wV = (x) => (VR.find((r) => r[0] === x) || [0, 0, 0, 48])[3]; const wH = (y) => (HR.find((r) => r[0] === y) || [0, 0, 0, 48])[3];
  const inner = (xa, xb, ya, yb) => [xa + sidewalkHalf(wV(xa)), ya + sidewalkHalf(wH(ya)), xb - sidewalkHalf(wV(xb)), yb - sidewalkHalf(wH(yb))];
  const blocks = [];
  for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) blocks.push({ zone: ZONES[j][i], r: inner(X[i], X[i + 1], Y[j], Y[j + 1]), i, j });
  for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) { const r = inner(X2[i], X2[i + 1], Y2[j], Y2[j + 1]); if (i === 3) r[2] = W - 24; blocks.push({ zone: ZONES2[j][i], r, i: 7 + i, j: 4 + j }); }
  // faixa norte (acima da Rua do Norte), sul e entre a praia e a cidade
  blocks.push({ zone: 'bosque', r: [336, 8, 2728, 128] }); blocks.push({ zone: 'bosque', r: [336, 2752, 4088, 2808] });
  blocks.push({ zone: 'aeroporto', r: [2792, 8, 4088, 1216] });

  const B = (o) => { const b = { floors: 2, ...o, x: snap(o.x), y: snap(o.y), w: snap(o.w), h: snap(o.h) }; blds.push(b); return b; };
  const P = (spr, x, y, w, h, solid = false, extra = {}) => props.push({ spr, x, y, w, h, solid, ...extra });
  const ROOF = { loja: ['#b65e3c', '#8b5a3c', '#6d6f7d', '#a8553f', '#7b4f8c', '#3f6f8c'], torre: ['#5b6f8f', '#4a5e7f', '#6b7790', '#3f5470', '#56607a'], casa: ['#c4553d', '#d0703f', '#8f5fc4', '#3f6fd0', '#5a8f3c', '#a9473a', '#d4a24a'], galpao: ['#7d8794', '#6a8aa8', '#8a8f6a', '#9a7a5a'] };
  const facadeSprites = ['fachada-shop', 'fachada-food', 'fachada-cafe', 'fachada-game', 'fachada-24'];
  const awnings = ['toldo0', 'toldo1', 'toldo2', 'toldo3'];
  const poi = (id, label, x, y, route, icon) => pois.push({ id, label, at: [x, y], route, icon });

  // linha de lotes ao longo das bordas da quadra (frente para a rua)
  function perimeterLots(r, depth, minW, maxW, make) {
    const [x0, y0, x1, y1] = r;
    for (const side of ['n', 's']) {
      let x = x0;
      while (x < x1 - minW) { const w = Math.min(x1 - x, minW + Math.floor(R() * (maxW - minW))); const y = side === 'n' ? y0 : y1 - depth; make(x, y, w - 4, depth, side); x += w; }
    }
    for (const side of ['w', 'e']) {
      let y = y0 + depth + 4;
      while (y < y1 - depth - minW) { const h = Math.min(y1 - depth - 4 - y, minW + Math.floor(R() * (maxW - minW))); const x = side === 'w' ? x0 : x1 - depth; make(x, y, depth, h - 4, side); y += h; }
    }
  }
  const tree = (x, y, big = true) => { const k = Math.floor(R() * 5); P(big ? `arvore${k}` : `arbusto${k % 2}`, x, y, big ? 20 : 14, big ? 34 : 18, true, { h: 18 }); };

  for (const bl of blocks) {
    const [x0, y0, x1, y1] = bl.r; const bw = x1 - x0; const bh = y1 - y0; const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2;
    if (bl.zone !== 'bosque' && bl.zone !== 'aeroporto') regions.push({ name: REGION[bl.zone] || 'Nexus City', rect: [x0 - 24, y0 - 24, x1 + 24, y1 + 24] });
    switch (bl.zone) {
      case 'residencial': case 'rio': {
        let ry0 = y0; let ry1 = y1;
        if (bl.zone === 'rio') { G('grass', x0, y0, bw, 1976 - y0, 'rect', { yard: true }); G('grass', x0, 2088, bw, y1 - 2088, 'rect', { yard: true }); }
        else G('grass', x0, y0, bw, bh, 'rect', { yard: true });
        const parts = bl.zone === 'rio' ? [[y0, 1960], [2104, y1]] : [[ry0, ry1]];
        for (const [a, b] of parts) {
          perimeterLots([x0, a, x1, b], 64, 64, 84, (x, y, w, h) => {
            const hw = Math.min(w - 12, 52); const hh = Math.min(h - 14, 44);
            const house = B({ kind: 'casa', x: x + (w - hw) / 2, y: y + (h - hh) / 2, w: hw, h: hh, floors: 1 + (R() < 0.25), roof: pick(ROOF.casa), wall: pick(['#e8dcc0', '#f2e6d0', '#d8c8a8', '#e0d0e0', '#c8d8e8']) });
            if (R() < 0.6) tree(x + 6 + R() * (w - 12), y + h - 4, R() < 0.7);
            void house;
          });
          // miolo da quadra: segunda fileira de casas (de costas), quintais com árvores e piscinas
          for (let yy = a + 92; yy < b - 150; yy += 84) for (let xx = x0 + 92; xx < x1 - 150; xx += 84) {
            const k = R();
            if (k < 0.62) B({ kind: 'casa', x: xx, y: yy, w: 48, h: 42, floors: 1 + (R() < 0.3), roof: pick(ROOF.casa), wall: pick(['#e8dcc0', '#f2e6d0', '#d8c8a8', '#e0d0e0', '#c8d8e8']) });
            else if (k < 0.75) G('pond', xx + 8, yy + 10, 30, 18, 'rect', { pool: true });
            else tree(xx + 24, yy + 30, true);
            if (R() < 0.5) tree(xx + 60, yy + 70, R() < 0.6);
          }
        }
        if (bl.zone === 'rio') { for (let x = x0 + 20; x < x1 - 10; x += 46) { tree(x, 1960, true); tree(x + 20, 2110, true); } }
        break;
      }
      case 'praia': {
        G('grass', x0, y0, bw, bh);
        perimeterLots(bl.r, 70, 70, 92, (x, y, w, h) => { B({ kind: 'casa', x: x + 6, y: y + 8, w: w - 12, h: h - 16, floors: 2 + Math.floor(R() * 3), roof: pick(['#e8e2d0', '#f0c8a0', '#a8d8e8', '#e8a8a8']), wall: '#f4eee0', label: R() < 0.2 ? 'Pousada' : null }); });
        for (let k = 0; k < 10; k++) tree(x0 + 90 + R() * (bw - 180), y0 + 90 + R() * (bh - 180), true);
        break;
      }
      case 'comercial': case 'shopping': {
        G('lot', x0, y0, bw, bh, 'rect', { stalls: false });
        if (bl.zone === 'shopping') {
          const m = B({ kind: 'loja', x: x0 + 20, y: y0 + 20, w: bw - 40, h: bh * 0.5, floors: 3, roof: '#7a6aa8', wall: '#d8d0e8', label: 'Shopping Nexus', facade: 'shopping' });
          poi('shopping', 'Shopping Nexus', m.x + m.w / 2, m.y + m.h + 10, '#/mercado', 'bag');
          G('lot', x0 + 8, y0 + bh * 0.5 + 32, bw - 16, bh * 0.5 - 40, 'rect', { stalls: true });
          for (let k = 0; k < 14; k++) spots.push([x0 + 30 + k * ((bw - 60) / 13), y0 + bh * 0.5 + 60, -Math.PI / 2]);
          break;
        }
        perimeterLots(bl.r, 76, 52, 84, (x, y, w, h, side) => {
          const b = B({ kind: 'loja', x, y, w, h, floors: 2 + Math.floor(R() * 4), roof: pick(ROOF.loja), wall: pick(['#d8c8a8', '#c8b8a8', '#b8c0c8', '#e0c8b0', '#c8d0b8']), facade: side === 's' ? pick(facadeSprites) : null, awning: side === 's' && R() < 0.7 ? pick(awnings) : null });
          if (R() < 0.12) b.billboard = pick(['outdoor-sale', 'outdoor-burger', 'outdoor-drink']);
        });
        // miolo da quadra: prédio maior e pátio
        if (bw > 240 && bh > 240) B({ kind: 'torre', x: x0 + 100, y: y0 + 100, w: bw - 200, h: bh - 200, floors: 5 + Math.floor(R() * 6), roof: pick(ROOF.torre), wall: '#9fb0c8' });
        if (bl.i === 1 && bl.j === 1) poi('lojas', 'Lojas do centro', cx, y1 + 20, '#/mercado', 'bag');
        if (bl.i === 2 && bl.j === 1) poi('empregos', 'Agência de Empregos', cx, y1 + 20, '#/empregos', 'briefcase');
        if (bl.i === 4 && bl.j === 2) poi('imobiliaria', 'Imobiliária Horizonte', cx, y1 + 20, '#/propriedades', 'building');
        if (bl.i === 5 && bl.j === 5) poi('mercado2', 'Supermercado', cx, y1 + 20, '#/mercado', 'cart');
        break;
      }
      case 'empresarial': case 'banco': {
        G('plaza', x0, y0, bw, bh);
        const n = bw > 300 ? 2 : 1; const gap = 32;
        for (let k = 0; k < n; k++) {
          const w = (bw - gap * (n + 1)) / n;
          B({ kind: 'torre', x: x0 + gap + k * (w + gap), y: y0 + gap, w, h: bh - gap * 2 - 24, floors: 10 + Math.floor(R() * 16), roof: pick(ROOF.torre), wall: pick(['#8fb0d8', '#a0b8d0', '#7f98c0']), helipad: R() < 0.4, label: bl.zone === 'banco' && k === 0 ? 'Banco Nexus' : null });
        }
        for (let x = x0 + 16; x < x1 - 10; x += 60) tree(x, y1 - 10, false);
        if (bl.zone === 'banco') poi('banco', 'Banco Nexus', x0 + bw / 4, y1 + 20, '#/banco', 'wallet');
        break;
      }
      case 'praca': case 'lago': case 'parque': {
        G('grass', x0, y0, bw, bh, 'rect', { park: true });
        G('plaza', cx - 12, y0, 24, bh); G('plaza', x0, cy - 12, bw, 24);
        if (bl.zone === 'praca') { G('plaza', cx - 70, cy - 70, 140, 140, 'ellipse'); P('chafariz', cx, cy + 14, 44, 40, true, { h: 6 }); poi('praca', 'Praça Central', cx, cy + 40, '#/social/eventos', 'sun'); }
        if (bl.zone === 'lago') { G('pond', 1432, 1974, 240, 180, 'ellipse'); G('pond', x0, 1992, 1440 - x0 + 4, 80); poi('parque', 'Parque do Lago', cx, y0 + 30, '#/social/eventos', 'sun'); }
        if (bl.zone === 'parque') { G('pond', cx + 50, cy + 40, 90, 60, 'ellipse'); poi('parque2', 'Parque Sul', cx, cy - 30, '#/social/eventos', 'sun'); }
        for (let k = 0; k < Math.floor((bw * bh) / 9000); k++) { const tx = x0 + 20 + R() * (bw - 40); const ty = y0 + 20 + R() * (bh - 40); if (Math.abs(tx - cx) < 26 || Math.abs(ty - cy) < 26) continue; if (bl.zone === 'lago' && Math.hypot((tx - 1552) / 130, (ty - 2064) / 100) < 1) continue; tree(tx, ty, R() < 0.8); }
        if (bl.zone !== 'lago') for (let k = 0; k < 6; k++) P(`banco${k % 2}`, cx - 60 + k * 24, cy + 22, 18, 10, false);
        else for (let k = 0; k < 4; k++) P(`banco${k % 2}`, cx - 40 + k * 26, y1 - 30, 18, 10, false);
        P('banca0', cx + 40, cy - 30, 20, 22, true, { h: 6 });
        break;
      }
      case 'hospital': {
        G('plaza', x0, y0, bw, bh);
        const b = B({ kind: 'hospital', x: x0 + 20, y: y0 + 20, w: bw - 40, h: bh - 90, floors: 6, roof: '#e8eef2', wall: '#f4f6f8', label: 'Hospital Nexus', helipad: true });
        poi('hospital', 'Hospital Nexus', b.x + b.w / 2, y1 + 20, '#/hospital', 'hospital');
        break;
      }
      case 'policia': {
        G('plaza', x0, y0, bw, bh);
        const w2 = bw / 2 - 30;
        B({ kind: 'policia', x: x0 + 16, y: y0 + 20, w: w2, h: bh - 80, floors: 4, roof: '#3f5f9f', wall: '#c8d4e8', label: 'Delegacia' });
        B({ kind: 'bombeiros', x: x0 + bw / 2 + 14, y: y0 + 20, w: w2, h: bh - 80, floors: 3, roof: '#b83a3a', wall: '#e8d0c8', label: 'Bombeiros' });
        poi('policia', 'Delegacia', x0 + 16 + w2 / 2, y1 + 20, '#/policia', 'shield');
        poi('bombeiros', 'Corpo de Bombeiros', x0 + bw / 2 + 14 + w2 / 2, y1 + 20, '#/acontecimentos', 'flame');
        break;
      }
      case 'terminal': {
        G('lot', x0, y0, bw, bh, 'rect', { stalls: false, bus: true });
        const b = B({ kind: 'terminal', x: x0 + 24, y: y0 + 16, w: bw - 48, h: 90, floors: 2, roof: '#5f8fa8', wall: '#d8e4ec', label: 'Terminal Rodoviário' });
        for (let k = 0; k < 5; k++) P('ponto', b.x + 30 + k * ((b.w - 60) / 4), b.y + b.h + 18, 30, 14, false);
        poi('terminal', 'Terminal Rodoviário', b.x + b.w / 2, y1 + 20, '#/acontecimentos', 'bus');
        break;
      }
      case 'prefeitura': {
        G('plaza', x0, y0, bw, bh);
        const b = B({ kind: 'civico', x: x0 + 40, y: y0 + 30, w: bw - 80, h: bh - 110, floors: 4, roof: '#d8d0b8', wall: '#f0e8d8', label: 'Prefeitura e Fórum' });
        for (let x = x0 + 20; x < x1; x += 40) tree(x, y1 - 12, false);
        poi('prefeitura', 'Prefeitura', b.x + b.w / 3, y1 + 20, '#/governo', 'flag'); poi('forum', 'Fórum', b.x + (2 * b.w) / 3, y1 + 20, '#/justica', 'scale');
        break;
      }
      case 'estacionamento': {
        G('lot', x0, y0, bw, bh, 'rect', { stalls: true });
        for (let r2 = 0; r2 < 3; r2++) for (let k = 0; k < 9; k++) spots.push([x0 + 24 + k * ((bw - 48) / 8), y0 + 40 + r2 * ((bh - 80) / 2), -Math.PI / 2]);
        poi('estacionamento', 'Estacionamento Central', cx, y1 + 20, '#/veiculos', 'car');
        break;
      }
      case 'concessionaria': {
        G('lot', x0, y0, bw, bh, 'rect', { stalls: true });
        const b = B({ kind: 'loja', x: x0 + 20, y: y0 + 20, w: bw - 40, h: 100, floors: 2, roof: '#3f6fd0', wall: '#e8eef8', label: 'Concessionária Turbo', facade: 'vitrine' });
        poi('concessionaria', 'Concessionária Turbo', b.x + b.w / 2, y1 + 20, '#/veiculos', 'car');
        for (let k = 0; k < 6; k++) spots.push([x0 + 40 + k * ((bw - 80) / 5), y0 + 190, -Math.PI / 2]);
        break;
      }
      case 'escola': {
        G('grass', x0, y0, bw, bh);
        const b = B({ kind: 'escola', x: x0 + 30, y: y0 + 24, w: bw - 60, h: 110, floors: 3, roof: '#d4a24a', wall: '#f0e0c0', label: 'Escola Nexus' });
        G('plaza', x0 + 40, y0 + 170, bw - 80, 90, 'rect', { court: true });
        poi('escola', 'Escola e Universidade', b.x + b.w / 2, y1 + 20, '#/empresas/carreira', 'school');
        break;
      }
      case 'estadio': {
        G('grass', x0, y0, bw, bh);
        const b = B({ kind: 'estadio', x: x0 + 20, y: y0 + 20, w: bw - 40, h: bh - 60, floors: 4, roof: '#c8ccd8', wall: '#9098a8', label: 'Estádio Nexus' });
        poi('estadio', 'Estádio Nexus', b.x + b.w / 2, y1 + 20, '#/diversao', 'trophy');
        break;
      }
      case 'posto': {
        G('lot', x0, y0, bw, bh, 'rect', { stalls: false });
        const c = B({ kind: 'posto', x: x0 + bw / 2 - 70, y: y0 + 40, w: 140, h: 70, floors: 1, roof: '#d83a3a', wall: '#f0f0f0', canopy: true, label: 'Posto Rota' });
        B({ kind: 'loja', x: x1 - 110, y: y1 - 90, w: 90, h: 60, floors: 1, roof: '#e8b84a', wall: '#f0e8d8', label: 'Conveniência', facade: 'fachada-24' });
        poi(`posto${bl.i}`, 'Posto de combustível', c.x + c.w / 2, y1 + 20, '#/veiculos', 'fuel');
        break;
      }
      case 'galpoes': case 'fabrica': {
        G('lot', x0, y0, bw, bh, 'rect', { stalls: false, industrial: true });
        const n = 2;
        for (let k = 0; k < n; k++) {
          const w = (bw - 60) / n;
          const b = B({ kind: 'galpao', x: x0 + 20 + k * (w + 20), y: y0 + 24, w, h: bh * 0.55, floors: 3, roof: pick(ROOF.galpao), wall: '#a8b0b8' });
          if (bl.zone === 'fabrica' && k === 0) { b.chimney = true; b.floors = 5; }
        }
        for (let k = 0; k < 6; k++) P(`caixa${k % 3}`, x0 + 30 + R() * (bw - 60), y0 + bh * 0.7 + R() * (bh * 0.25), 14, 12, true, { h: 6 });
        if (bl.i === 8 && bl.j === 4) poi('industria', 'Distrito Industrial', cx, y1 + 20, '#/empresas', 'briefcase');
        break;
      }
      case 'tanques': {
        G('lot', x0, y0, bw, bh, 'rect', { stalls: false, industrial: true });
        for (let k = 0; k < 4; k++) B({ kind: 'tanque', x: x0 + 30 + (k % 2) * (bw / 2), y: y0 + 30 + Math.floor(k / 2) * (bh / 2), w: Math.min(bw, bh) / 2 - 50, h: Math.min(bw, bh) / 2 - 50, floors: 4, roof: '#c8ccd0', wall: '#a8b0b8', round: true });
        break;
      }
      case 'conteineres': {
        G('lot', x0, y0, bw, bh, 'rect', { stalls: false, industrial: true });
        const cols = ['#c84a3a', '#3a7ac8', '#3aa85a', '#e8b84a', '#8a5ac8', '#e87a3a'];
        for (let yy = y0 + 30; yy < y1 - 40; yy += 34) for (let xx = x0 + 30; xx < x1 - 70; xx += 70) if (R() < 0.8) B({ kind: 'conteiner', x: xx, y: yy, w: 60, h: 22, floors: 1 + (R() < 0.4), roof: pick(cols), wall: '#555' });
        if (bl.i === 8 && bl.j === 5) poi('porto', 'Porto Seco', cx, y1 + 20, '#/empregos', 'briefcase');
        break;
      }
      case 'bosque': {
        G('grass', x0, y0, bw, bh, 'rect', { park: true });
        for (let k = 0; k < Math.floor((bw * bh) / 2400); k++) tree(x0 + 10 + R() * (bw - 20), y0 + 20 + R() * (bh - 30), R() < 0.85);
        break;
      }
      default: break;
    }
  }

  // ---------------------------------------------------------------- aeroporto
  const airport = { runway: [2880, 392, 1160, 72], taxi: [2900, 640, 1100, 40], apron: [2880, 820, 1000, 300], gate: [2900, 1116, 64, 104] };
  G('grass', 2792, 8, 1296, 1208, 'rect', { park: true, airport: true });
  G('runway', ...airport.runway, 'rect', { kind: 'runway' }); G('runway', ...airport.taxi, 'rect', { kind: 'taxi' });
  G('runway', 2930, 464, 40, 360, 'rect', { kind: 'taxi' }); G('runway', 3440, 464, 40, 360, 'rect', { kind: 'taxi' }); G('runway', 3960, 464, 40, 200, 'rect', { kind: 'taxi' });
  G('runway', ...airport.apron, 'rect', { kind: 'apron' }); G('lot', ...airport.gate, 'rect', { stalls: false });
  B({ kind: 'hangar', x: 3904, y: 820, w: 150, h: 120, floors: 3, roof: '#8a98a8', wall: '#b8c0c8', label: 'Hangar Nexus Aviação' });
  B({ kind: 'hangar', x: 3904, y: 960, w: 150, h: 120, floors: 3, roof: '#7a8898', wall: '#b8c0c8' });
  B({ kind: 'terminal', x: 3020, y: 1132, w: 820, h: 76, floors: 3, roof: '#5f8fa8', wall: '#d8e4ec', label: 'Aeroporto Internacional Nexus' });
  B({ kind: 'torre', x: 2820, y: 720, w: 40, h: 40, floors: 16, roof: '#e8eef2', wall: '#c8d4e0', label: 'Torre de controle', tower: true });
  poi('aeroporto', 'Aeroporto Nexus', 3430, 1236, '#/veiculos', 'rocket');
  poi('hangar', 'Hangar · Aeronaves', 3980, 1100, '#/veiculos', 'rocket');
  regions.push({ name: 'Aeroporto Nexus', rect: [2776, 0, 4096, 1232] });
  // vagas dos aviões no pátio (escola de voo + aeronaves do jogador)
  const planeSpots = []; for (let k = 0; k < 6; k++) planeSpots.push([3000 + k * 140, 960, -Math.PI / 2]);
  // luzes do aeroporto
  const [rx, ry, rw, rh] = airport.runway;
  const runwayLights = [];
  for (let x = rx; x <= rx + rw; x += 40) { runwayLights.push([x, ry - 2, '#fff7d0']); runwayLights.push([x, ry + rh + 2, '#fff7d0']); }
  for (let y = ry + 4; y < ry + rh; y += 12) { runwayLights.push([rx - 2, y, '#4ade80']); runwayLights.push([rx + rw + 2, y, '#ff4d5e']); }
  for (let x = airport.taxi[0]; x <= airport.taxi[0] + airport.taxi[2]; x += 60) { runwayLights.push([x, airport.taxi[1] - 2, '#60a5fa']); runwayLights.push([x, airport.taxi[1] + airport.taxi[3] + 2, '#60a5fa']); }

  // ---------------------------------------------------------------- postes e árvores nas calçadas
  const nodesList = Object.values(nodes);
  const nearNode = (x, y, d) => nodesList.some(([nx, ny]) => Math.abs(nx - x) < d && Math.abs(ny - y) < d);
  for (const s of segs) {
    const off = s.w / 2 + 12; const len = s.v ? s.y1 - s.y0 : s.x1 - s.x0;
    for (let t = 40; t < len; t += 96) for (const side of [-1, 1]) {
      const x = s.v ? s.x + side * off : s.x0 + t; const y = s.v ? s.y0 + t : s.y + side * off;
      if (nearNode(x, y, s.w + 10) || x < 240 || y < 0 || x > W || y > H) continue;
      if (s.v && y > 1990 && y < 2076 && s.x < 1440) continue;
      lamps.push([x, y]); P(`poste${(s.v ? 0 : 2) + (side > 0 ? 1 : 0)}`, x, y + (s.v ? 0 : side > 0 ? 6 : 0), 6, 18, false, { lamp: true });
    }
  }

  // ---------------------------------------------------------------- máscara de colisão e alturas
  const mw = W / CS; const mh = H / CS; const mask = new Uint8Array(mw * mh).fill(GRASS); const heights = new Uint8Array(mw * mh);
  const code = { pond: WATER, water: WATER, sand: SAND, grass: GRASS, walk: WALK, road: ROAD, cross: CROSS, lot: LOT, runway: RUNWAY, plaza: PLAZA };
  const fillRect = (c, x, y, w, h) => { const ax = Math.max(0, Math.floor(x / CS)); const ay = Math.max(0, Math.floor(y / CS)); const bx = Math.min(mw, Math.ceil((x + w) / CS)); const by = Math.min(mh, Math.ceil((y + h) / CS)); for (let j = ay; j < by; j++) mask.fill(c, j * mw + ax, j * mw + bx); };
  const fillEll = (c, x, y, w, h) => { const cx = x + w / 2; const cy = y + h / 2; const ax = Math.max(0, Math.floor(x / CS)); const ay = Math.max(0, Math.floor(y / CS)); const bx = Math.min(mw, Math.ceil((x + w) / CS)); const by = Math.min(mh, Math.ceil((y + h) / CS)); for (let j = ay; j < by; j++) for (let i = ax; i < bx; i++) { const px = (i + 0.5) * CS; const py = (j + 0.5) * CS; if (((px - cx) / (w / 2)) ** 2 + ((py - cy) / (h / 2)) ** 2 <= 1) mask[j * mw + i] = c; } };
  // ordem: base → água/areia → quadras → calçadas → ruas → faixas → aeroporto → pontes
  const order = ['water', 'sand', 'grass', 'plaza', 'pond', 'lot', 'walk', 'road', 'cross', 'runway'];
  for (const m of order) for (const g of ground) if (g.mat === m) (g.shape === 'ellipse' ? fillEll : fillRect)(code[m], g.x, g.y, g.w, g.h);
  for (const g of ground) if (g.island) fillEll(SOLID, g.x + 6, g.y + 6, g.w - 12, g.h - 12);
  for (const b of bridges) { fillRect(WALK, b.x, b.y, b.w, b.h); fillRect(ROAD, b.x + 16, b.y, b.w - 32, b.h); fillRect(SOLID, b.x, b.y, 3, b.h); fillRect(SOLID, b.x + b.w - 3, b.y, 3, b.h); }
  // entradas de carro (rebaixo da calçada) para estacionamentos, posto e terminal
  const driveways = [];
  for (const g of ground) {
    if (g.mat !== 'lot' || g.w < 60) continue;
    // abre a calçada sul e a norte no meio da quadra
    for (const [dx, dy, ww, hh] of [[g.x + g.w / 2 - 20, g.y + g.h, 40, 20], [g.x + g.w / 2 - 20, g.y - 20, 40, 20]]) {
      const i = Math.floor((dx + 20) / CS); const j = Math.floor((dy + (dy > g.y ? 18 : 2)) / CS);
      const c = mask[j * mw + i];
      if (c === WALK) { fillRect(LOT, dx, dy, ww, hh); driveways.push([dx, dy, ww, hh]); }
    }
  }
  // cerca do aeroporto (portão aberto para o pátio)
  const fence = [[2800, 8, 1288, 4], [2800, 8, 4, 1112], [4084, 8, 4, 1112], [2800, 1116, 100, 4], [2964, 1116, 1124, 4]];
  for (const f of fence) fillRect(SOLID, ...f);
  for (const b of blds) {
    const hgt = Math.min(250, b.floors * 9 + 6);
    if (b.round) fillEll(SOLID, b.x, b.y, b.w, b.h); else if (b.canopy) { fillRect(SOLID, b.x + 10, b.y + 10, 8, 8); fillRect(SOLID, b.x + b.w - 18, b.y + 10, 8, 8); fillRect(SOLID, b.x + b.w / 2 - 4, b.y + b.h - 20, 8, 8); } else fillRect(SOLID, b.x, b.y, b.w, b.h);
    const ax = Math.floor(b.x / CS); const ay = Math.floor(b.y / CS); const bx2 = Math.ceil((b.x + b.w) / CS); const by2 = Math.ceil((b.y + b.h) / CS);
    for (let j = ay; j < by2; j++) for (let i = ax; i < bx2; i++) if (i >= 0 && j >= 0 && i < mw && j < mh) heights[j * mw + i] = Math.max(heights[j * mw + i], hgt);
  }
  for (const p of props) if (p.solid) { const r = p.spr.startsWith('arvore') ? 4 : 3; fillRect(SOLID, p.x - r, p.y - r * 1.5, r * 2, r * 2); const i = Math.floor(p.x / CS); const j = Math.floor(p.y / CS); if (i >= 0 && j >= 0 && i < mw && j < mh) heights[j * mw + i] = Math.max(heights[j * mw + i], p.h || 10); }

  return {
    W, H, CS, mw, mh, mask, heights, ground, blds, props, lamps, pois, regions, bridges, driveways, fence, airport, runwayLights, spots, planeSpots,
    R: { w: W, h: H, nodes, roads, lights, lots: [], pois, regions, radars: [
      { at: [704, 760], limit: 50 }, { at: [1728, 2000], limit: 50 }, { at: [2200, 576], limit: 50 }, { at: [3300, 1504], limit: 50 }, { at: [1200, 2304], limit: 50 }, { at: [2752, 1900], limit: 50 }, { at: [1600, 1248], limit: 40 }, { at: [900, 928], limit: 40 },
    ] },
    segs,
  };
}
