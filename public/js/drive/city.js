// Gerador da cidade do mapa jogável (Nexus City). Determinístico: a mesma semente gera a mesma cidade.
// Produz só dados (sem desenhar): ruas para o grafo de trânsito, chão e construções para a renderização,
// máscara de colisão (4 unidades por célula), altura das construções (para os aviões), luzes, pontos de interesse,
// bairros, aeroporto e vagas. Unidade = 1 "pixel de arte"; 1 unidade ≈ 0,2 m.
import { BLD } from './bldmeta.js';
import { DECO } from './decometa.js';
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
const REGION = { hoteis: 'Distrito Hoteleiro', estadio: 'Estádio', residencial: 'Bairro Residencial', empresarial: 'Distrito Empresarial', banco: 'Distrito Empresarial', praia: 'Orla', comercial: 'Centro Comercial', shopping: 'Centro Comercial', praca: 'Praça Central', hospital: 'Centro', policia: 'Centro', terminal: 'Terminal Rodoviário', prefeitura: 'Centro Cívico', estacionamento: 'Centro', concessionaria: 'Centro', escola: 'Vila Escolar', rio: 'Beira-Rio', lago: 'Parque do Lago', parque: 'Parque Sul', posto: 'Área Industrial', galpoes: 'Área Industrial', tanques: 'Área Industrial', conteineres: 'Porto Seco', fabrica: 'Área Industrial' };

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
  const beachFence = [];
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
    if (k === 'corner') { const m = Math.max(wv, wh); G('walk', x - m / 2 - 16, y - m / 2 - 16, m + 32, m + 32); G('road', x - m / 2, y - m / 2, m, m); continue; }
    if (k === 'exit') continue;
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
  blocks.push({ zone: 'hoteis', r: inner(2752, 3984, 1248, 1504), i: 7, j: 3 });

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
  const tree = (x, y, big = true) => { const k = Math.floor(R() * 5); if (big && R() < 0.4) PX(R() < 0.5 ? 'arvore' : 'arvore-vaso', x, y, true); else P(big ? `arvore${k}` : `arbusto${k % 2}`, x, y, big ? 20 : 14, big ? 34 : 18, true, { ht: 18 }); };

  // ---------------------------------------------------------------- prédios em sprite (folhas de pixel art)
  // cada prédio ocupa exatamente o retângulo desenhado (largura sai da proporção do sprite)
  const SP = (spr, x, y, h, extra = {}) => { const [sw, sh] = BLD[spr] || [100, 150]; const w = (h * sw) / sh; return B({ kind: 'sprite', spr, x, y, w, h, floors: Math.max(1, Math.round((sh / sw) * 4)), ...extra }); };
  const SPw = (spr, x, y, w, extra = {}) => { const [sw, sh] = BLD[spr] || [100, 150]; return B({ kind: 'sprite', spr, x, y, w, h: (w * sh) / sw, floors: Math.max(1, Math.round((sh / sw) * 4)), ...extra }); };
  const wOfS = (spr, h) => { const [sw, sh] = BLD[spr] || [100, 150]; return (h * sw) / sh; };
  // fileira de prédios da esquerda para a direita, sorteando entre os sprites que cabem (copiando os mesmos quando precisa)
  const ACCESS = { on: false };
  function row(x0, x1, y, h, list, { gap = 6, trees = 0, center = true } = {}) {
    const items = []; let x = x0; if (ACCESS.on) ground.push({ mat: 'access', shape: 'rect', x: snap(x0 - 20), y: snap(y + h + 8), w: snap(x1 - x0 + 40), h: 12 });
    for (;;) {
      const fit = list.filter((k) => wOfS(k, h) <= x1 - x);
      if (!fit.length) break;
      const k = pick(fit); items.push([k, x]); x += wOfS(k, h) + gap;
      if (trees && R() < trees && x1 - x > 16) { items.push(['@tree', x + 4]); x += 14; }
    }
    const used = x - gap - x0; const off = center ? Math.max(0, (x1 - x0 - used) / 2) : 0;
    const out = [];
    for (const [k, xx] of items) { if (k === '@tree') tree(xx + off + 4, y + h - 2, R() < 0.6); else out.push(SP(k, xx + off, y, h)); }
    return out;
  }
  const RES = ['house', 'house-blue', 'res-a1', 'res-a2', 'res-a3', 'res-a4', 'house', 'house-blue'];
  const APT = ['apt-beige', 'apt-green', 'apt-brick', 'res-a1', 'res-a2', 'res-a4'];
  const SHOPS = ['shop', 'food', 'cafe', 'market', 'burger', 'pizza', 'diner', 'bar', 'store247', 'grocery', 'pharmacy', 'pizza2', 'burger2', 'video', 'fashion', 'autoparts', 'diner2', 'bar2', 'gym'];
  const TOWERS = ['tower-glass', 'tower-glass2', 'tower-heli', 'tower-beige', 'office', 'office2', 'hotel-tall'];
  const IND = ['warehouse-blue', 'warehouse-brick', 'loading', 'industrial', 'ind-blue'];
  // prédio único centralizado no espaço (w×h máximos), mantendo a proporção
  const fitIn = (spr, x0, y0, w, h, extra) => { const [sw, sh] = BLD[spr]; const k = Math.min(w / sw, h / sh); return B({ kind: 'sprite', spr, x: x0 + (w - sw * k) / 2, y: y0 + (h - sh * k) / 2, w: sw * k, h: sh * k, floors: Math.max(2, Math.round((sh / sw) * 4)), ...extra }); };

  // tamanho de cada objeto decorativo (unidades do mapa), na proporção do sprite
  // sprites da folha "City Decorations & Details": nome, altura (unidades), sólido
  const DH = { arvore: 40, coqueiro: 46, 'arvore-vaso': 26, 'arvore-vaso2': 26, 'flores-v': 12, 'flores-b': 12, 'flores-a': 12, 'arbusto-c': 13, 'arbusto-c2': 13, 'arbusto-vaso': 14, 'arbusto-vaso2': 18,
    banco: 13, banco2: 13, 'lixeira-verde': 11, 'lixeira-cinza': 11, 'correio-azul': 12, 'correio-vermelho': 12, poste: 26, 'poste-duplo': 26, 'poste-triplo': 28, 'poste-madeira': 30,
    grade: 15, grade2: 15, cerca: 12, barreira: 11, cone: 8, cavalete: 10, tambor: 9, hidrante: 10, 'banca-jornal': 18, telefone: 20, 'ponto-onibus': 22, 'placa-onibus': 18,
    'placa-direcao': 22, 'placa-hotel': 24, 'placa-bar': 24, 'placa-motel': 24, 'placa-p': 15, 'placa-proibido': 15, 'placa-50': 15, 'placa-pare': 15, 'placa-pedestre': 15, semaforo: 16,
    'maq-bebida': 17, 'maq-lanche': 17, orelhao: 16, quiosque: 22, feira: 20, guarita: 20, 'caixa-luz': 15, armario: 15, armario2: 15, caixotes: 15, pneus: 10, barril: 14, cavalete2: 11 };
  const PX = (name, x, y, solid = false, extra = {}) => { const [sw, sh] = DECO[name] || [40, 40]; const h = extra.size || DH[name] || 14; const w = (h * sw) / sh; P(`d:${name}`, x, y, w, h, solid, { ht: name.startsWith('arvore') || name === 'coqueiro' ? 18 : 6, deco: true, ...extra }); };
  const PSZ = { arvore: [24, 40], arbusto: [17, 23], canteiro: [26, 16], banco: [24, 15], lixeira: [8, 13], hidrante: [8, 11], chafariz: [44, 39], jardim0: [30, 27], 'guarda-sol': [22, 19], banca: [24, 29] };
  const PD = (spr, x, y, solid = true) => { const k = Object.keys(PSZ).find((n) => spr.startsWith(n)) || 'lixeira'; const [w, h] = PSZ[k]; P(spr, x, y, w, h, solid, { ht: k === 'arvore' ? 18 : 6, deco: true }); };
  // orla: coqueiros na areia, cerca de madeira na divisa com o calçadão (com passagens), bancos voltados para o mar
  for (let y = 40; y < H - 40; y += 30) {
    if (y > 1970 && y < 2100) continue;
    const pass = Math.floor(y / 30) % 7 === 0; // passagem para a areia
    if (!pass) { PX('cerca', 312, y + 8, false, { rot: Math.PI / 2, size: 14 }); beachFence.push([308, y - 9, 6, 30]); }
    else PX('banco', 300, y + 6);
  }
  for (let y = 30; y < H - 30; y += 44) { if (y > 1960 && y < 2110) continue; PX('coqueiro', 252 + ((y * 7) % 30), y + 20, true); if ((y / 44) % 3 < 1) P(`guarda-sol${(y / 44) % 2 | 0}`, 286, y + 34, 18, 16, false, { deco: true, ht: 4 }); }
  for (const bl of blocks) {
    const [x0, y0, x1, y1] = bl.r; const bw = x1 - x0; const bh = y1 - y0; const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2;
    const nB0 = blds.length;
    if (bl.zone !== 'bosque' && bl.zone !== 'aeroporto') regions.push({ name: REGION[bl.zone] || 'Nexus City', rect: [x0 - 24, y0 - 24, x1 + 24, y1 + 24] });
    switch (bl.zone) {
      case 'residencial': case 'rio': {
        ACCESS.on = true;
        const parts = bl.zone === 'rio' ? [[y0, 1960], [2104, y1]] : [[y0, y1]];
        if (bl.zone === 'rio') { G('grass', x0, y0, bw, 1976 - y0, 'rect', { yard: true }); G('grass', x0, 2088, bw, y1 - 2088, 'rect', { yard: true }); }
        else G('grass', x0, y0, bw, bh, 'rect', { yard: true });
        for (const [a, b] of parts) {
          // fileiras de casas e prédios baixos, com quintais e árvores entre elas
          const H = 70; let yy = a + 4;
          while (yy + H <= b - 4) { row(x0 + 4, x1 - 4, yy, H, R() < 0.3 ? APT : RES, { gap: 10, trees: 0.35 }); yy += H + 22; }
          if (b - yy > 30) for (let x = x0 + 20; x < x1 - 10; x += 40) if (R() < 0.6) tree(x, b - 8, true);
        }
        break;
      }
      case 'praia': {
        ACCESS.on = true;
        G('grass', x0, y0, bw, bh);
        let yy = y0 + 4; const H = 118;
        while (yy + H <= y1 - 4) { row(x0 + 4, x1 - 4, yy, H, ['apt-beige', 'hotel-tall', 'tower-beige', 'apt-green', 'res-a1', 'hotel'], { gap: 14, trees: 0.5 }); yy += H + 24; }
        break;
      }
      case 'comercial': {
        G('plaza', x0, y0, bw, bh);
        const H = 82;
        row(x0 + 2, x1 - 2, y0 + 2, H, SHOPS, { gap: 3 });
        const mid = bh - 2 * H - 20;
        // miolo da quadra: prédios de escritório/apartamento (cópias dos sprites), com árvores entre eles
        if (mid >= 56) row(x0 + 8, x1 - 8, y0 + H + 10, Math.min(150, mid), mid >= 110 ? [...TOWERS, ...APT, 'cinema', 'supermarket', 'hotel'] : [...APT, 'res-a1', 'res-a3', 'gym'], { gap: 12, trees: 0.5 });
        row(x0 + 2, x1 - 2, y1 - H - 2, H, SHOPS, { gap: 3 });
        if (bl.i === 1 && bl.j === 1) poi('lojas', 'Lojas do centro', cx, y1 + 20, '#/mercado', 'bag');
        if (bl.i === 2 && bl.j === 1) poi('empregos', 'Agência de Empregos', cx, y1 + 20, '#/empregos', 'briefcase');
        if (bl.i === 4 && bl.j === 2) poi('imobiliaria', 'Imobiliária Horizonte', cx, y1 + 20, '#/propriedades', 'building');
        if (bl.i === 5 && bl.j === 5) poi('mercado2', 'Supermercado', cx, y1 + 20, '#/mercado', 'cart');
        break;
      }
      case 'shopping': {
        G('lot', x0, y0, bw, bh, 'rect', { stalls: true });
        const m = fitIn('mall2', x0 + 6, y0 + 4, bw - 12, bh * 0.52, { label: 'Shopping Nexus' });
        poi('shopping', 'Shopping Nexus', m.x + m.w / 2, m.y + m.h + 10, '#/mercado', 'bag');
        row(x0 + 4, x1 - 4, y1 - 86, 82, ['supermarket', 'mall', 'cinema'], { gap: 8 });
        for (let k = 0; k < 10; k++) spots.push([x0 + 30 + k * ((bw - 60) / 9), y0 + bh * 0.52 + 30, -Math.PI / 2]);
        break;
      }
      case 'empresarial': case 'banco': {
        G('plaza', x0, y0, bw, bh);
        const H = Math.min(200, (bh - 20) / (bh > 380 ? 2 : 1.2));
        let yy = y0 + 6; let first = true;
        while (yy + H <= y1 - 4) {
          const list = bl.zone === 'banco' && first ? ['bank', 'bank2'] : TOWERS;
          const bs = row(x0 + 4, x1 - 4, yy, H, list, { gap: 10, trees: 0.4 });
          if (bl.zone === 'banco' && first && bs[0]) { bs[0].label = 'Banco Nexus'; poi('banco', 'Banco Nexus', bs[0].x + bs[0].w / 2, yy + H + 14, '#/banco', 'wallet'); }
          first = false; yy += H + 18;
        }
        break;
      }
      case 'praca': case 'lago': case 'parque': {
        G('grass', x0, y0, bw, bh, 'rect', { park: true });
        G('plaza', cx - 12, y0, 24, bh); G('plaza', x0, cy - 12, bw, 24);
        if (bl.zone === 'praca') { G('plaza', cx - 70, cy - 70, 140, 140, 'ellipse'); P('chafariz', cx, cy + 14, 44, 40, true, { ht: 6 }); poi('praca', 'Praça Central', cx, cy + 40, '#/social/eventos', 'sun'); }
        if (bl.zone === 'lago') { G('pond', 1432, 1974, 240, 180, 'ellipse'); G('pond', x0, 1992, 1440 - x0 + 4, 80); poi('parque', 'Parque do Lago', cx, y0 + 30, '#/social/eventos', 'sun'); }
        if (bl.zone === 'parque') { G('pond', cx + 50, cy + 40, 90, 60, 'ellipse'); poi('parque2', 'Parque Sul', cx, cy - 30, '#/social/eventos', 'sun'); }
        for (let k = 0; k < Math.floor((bw * bh) / 9000); k++) { const tx = x0 + 20 + R() * (bw - 40); const ty = y0 + 20 + R() * (bh - 40); if (Math.abs(tx - cx) < 26 || Math.abs(ty - cy) < 26) continue; if (bl.zone === 'lago' && Math.hypot((tx - 1552) / 130, (ty - 2064) / 100) < 1) continue; tree(tx, ty, R() < 0.8); }
        if (bl.zone !== 'lago') for (let k = 0; k < 6; k++) P(`banco${k % 2}`, cx - 60 + k * 24, cy + 22, 18, 10, false);
        else for (let k = 0; k < 4; k++) P(`banco${k % 2}`, cx - 40 + k * 26, y1 - 30, 18, 10, false);
        if (bl.zone !== 'lago') P('banca0', cx + 40, cy - 30, 20, 22, true, { ht: 6 });
        else {
          // orla do lago: bancos, postes e flores na margem (fora da água e longe do canal)
          for (let k = 0; k < 18; k++) {
            const a = (k / 18) * Math.PI * 2; if (Math.abs(Math.cos(a) + 1) < 0.35) continue;
            const bx = 1552 + Math.cos(a) * 142; const by = 2064 + Math.sin(a) * 112; if (Math.abs(bx - cx) < 16) continue;
            const t = k % 3; PX(t === 0 ? 'poste-triplo' : t === 1 ? 'banco' : 'flores-b', bx, by + 6, t !== 1, t === 0 ? { lamp: true } : {}); if (t === 0) lamps.push([bx, by + 6]);
          }
          P('banca0', 1552 + 96, 2064 - 132, 20, 22, true, { ht: 6 });
        }
        // bancos e postes ornamentais em volta da praça central do parque
        if (bl.zone !== 'lago') for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; const r = bl.zone === 'praca' ? 84 : 56; const bx = cx + Math.cos(a) * r; const by = cy + Math.sin(a) * r * 0.8; PX(k % 3 === 0 ? 'poste-triplo' : k % 3 === 1 ? 'banco' : 'flores-v', bx, by + 8, k % 3 !== 1, k % 3 === 0 ? { lamp: true } : {}); if (k % 3 === 0) lamps.push([bx, by + 8]); }
        PX('quiosque', x0 + 30, y0 + 40, true); PX('maq-bebida', x0 + 50, y0 + 40, true); PX('lixeira-verde', x0 + 62, y0 + 40);
        break;
      }
      case 'hospital': {
        G('plaza', x0, y0, bw, bh);
        const b = fitIn('hospital2', x0 + 6, y0 + 4, bw * 0.62, bh - 10, { label: 'Hospital Nexus' });
        fitIn('hospital', b.x + b.w + 8, y0 + bh * 0.3, x1 - b.x - b.w - 14, bh * 0.65);
        poi('hospital', 'Hospital Nexus', b.x + b.w / 2, y1 + 20, '#/hospital', 'hospital');
        break;
      }
      case 'policia': {
        G('plaza', x0, y0, bw, bh);
        const p1 = fitIn('police2', x0 + 4, y0 + 6, bw / 2 - 8, bh - 12, { label: 'Delegacia' });
        const f1 = fitIn('fire2', x0 + bw / 2 + 4, y0 + 6, bw / 2 - 8, bh - 12, { label: 'Bombeiros' });
        poi('policia', 'Delegacia', p1.x + p1.w / 2, y1 + 20, '#/policia', 'shield');
        poi('bombeiros', 'Corpo de Bombeiros', f1.x + f1.w / 2, y1 + 20, '#/acontecimentos', 'flame');
        break;
      }
      case 'terminal': {
        G('lot', x0, y0, bw, bh, 'rect', { stalls: false, bus: true });
        const bs = row(x0 + 4, x1 - 4, y0 + 4, 104, ['busterminal'], { gap: 4 });
        for (let k = 0; k < 5; k++) PX('ponto-onibus', x0 + 30 + k * ((bw - 60) / 4), y0 + 150);
        PX('placa-onibus', x0 + 12, y0 + 150); PX('maq-lanche', x1 - 14, y0 + 150, true); PX('maq-bebida', x1 - 28, y0 + 150, true);
        poi('terminal', 'Terminal Rodoviário', cx, y1 + 20, '#/acontecimentos', 'bus');
        if (bs[0]) bs[0].label = 'Terminal Rodoviário';
        break;
      }
      case 'prefeitura': {
        G('plaza', x0, y0, bw, bh);
        const c1 = fitIn('cityhall', x0 + 4, y0 + 4, bw * 0.56, bh - 40, { label: 'Prefeitura' });
        const c2 = fitIn('courthouse', c1.x + c1.w + 8, y0 + 4, x1 - c1.x - c1.w - 12, bh - 40, { label: 'Fórum' });
        for (let x = x0 + 20; x < x1; x += 40) tree(x, y1 - 10, false);
        poi('prefeitura', 'Prefeitura', c1.x + c1.w / 2, y1 + 20, '#/governo', 'flag'); poi('forum', 'Fórum', c2.x + c2.w / 2, y1 + 20, '#/justica', 'scale');
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
        const bs = row(x0 + 4, x1 - 4, y0 + 4, 104, ['garage', 'autoparts', 'garage'], { gap: 6 });
        if (bs[0]) bs[0].label = 'Concessionária Turbo';
        poi('concessionaria', 'Concessionária Turbo', cx, y1 + 20, '#/veiculos', 'car');
        for (let k = 0; k < 6; k++) spots.push([x0 + 40 + k * ((bw - 80) / 5), y0 + 190, -Math.PI / 2]);
        break;
      }
      case 'escola': {
        G('grass', x0, y0, bw, bh);
        const b = fitIn('school', x0 + 10, y0 + 6, bw - 20, bh * 0.6, { label: 'Escola Nexus' });
        G('plaza', x0 + 40, b.y + b.h + 16, bw - 80, Math.max(40, y1 - b.y - b.h - 30), 'rect', { court: true });
        poi('escola', 'Escola e Universidade', b.x + b.w / 2, y1 + 20, '#/empresas/carreira', 'school');
        break;
      }
      case 'estadio': {
        // estádio maior que os demais: ocupa a quadra inteira
        G('lot', x0, y0, bw, bh, 'rect', { stalls: true });
        const b = SPw('stadium', x0, y0, bw, { label: 'Estádio Nexus' });
        for (let k = 0; k < 8; k++) spots.push([x0 + 24 + k * ((bw - 48) / 7), b.y + b.h + 40, -Math.PI / 2]);
        for (let x = x0 + 14; x < x1 - 8; x += 34) tree(x, y1 - 6, false);
        poi('estadio', 'Estádio Nexus', b.x + b.w / 2, y1 + 20, '#/diversao', 'trophy');
        break;
      }
      case 'posto': {
        G('lot', x0, y0, bw, bh, 'rect', { stalls: false });
        const g = SP('gas', x0 + 20, y0 + 30, 110, { label: 'Posto Rota' });
        SP('store247', x1 - wOfS('store247', 90) - 16, y1 - 96, 90, { label: 'Conveniência' });
        row(x0 + 6, x1 - wOfS('store247', 90) - 26, y1 - 100, 96, ['garage', 'autoparts', 'diner2', 'burger2'], { gap: 8, center: false });
        poi(`posto${bl.i}`, 'Posto de combustível', g.x + g.w / 2, y1 + 20, '#/veiculos', 'fuel');
        break;
      }
      case 'galpoes': case 'fabrica': {
        G('lot', x0, y0, bw, bh, 'rect', { stalls: false, industrial: true });
        const H = Math.min(150, (bh - 30) / 2);
        row(x0 + 4, x1 - 4, y0 + 6, H, bl.zone === 'fabrica' ? ['factory', 'industrial', 'cooling'] : IND, { gap: 10 });
        row(x0 + 4, x1 - 4, y0 + H + 22, H, bl.zone === 'fabrica' ? ['factory', 'ind-blue', 'industrial'] : IND, { gap: 10 });
        if (bl.i === 8 && bl.j === 4) poi('industria', 'Distrito Industrial', cx, y1 + 20, '#/empresas', 'briefcase');
        break;
      }
      case 'tanques': {
        G('lot', x0, y0, bw, bh, 'rect', { stalls: false, industrial: true });
        const H = Math.min(150, (bh - 30) / 2);
        row(x0 + 4, x1 - 4, y0 + 6, H, ['silos'], { gap: 8 }); row(x0 + 4, x1 - 4, y0 + H + 22, H, ['silos', 'cooling'], { gap: 8 });
        break;
      }
      case 'hoteis': {
        // faixa entre o aeroporto e a Av. Brasil: hotéis, cassino, escritórios e cinema
        G('plaza', x0, y0, bw, bh);
        const H = Math.min(190, bh - 16);
        const bs = row(x0 + 4, x1 - 4, y0 + 6, H, ['hotel', 'hotel-tall', 'casino', 'office', 'office2', 'cinema', 'tower-glass2'], { gap: 14, trees: 0.6 });
        const cs = bs.find((b) => b.spr === 'casino'); if (cs) { cs.label = 'Cassino Royal'; poi('cassino', 'Cassino Royal', cs.x + cs.w / 2, y1 + 18, '#/diversao', 'trophy'); }
        const ht = bs.find((b) => b.spr.startsWith('hotel')); if (ht) poi('hotel', 'Hotel Aeroporto', ht.x + ht.w / 2, y1 + 18, '#/acontecimentos', 'building');
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
    ACCESS.on = false;
    // calçada com meio-fio na frente de cada prédio (onde ele não está num estacionamento)
    if (!['estacionamento', 'shopping', 'terminal', 'concessionaria', 'posto', 'galpoes', 'fabrica', 'tanques', 'conteineres'].includes(bl.zone)) {
      for (const b of blds.slice(nB0)) if (b.kind === 'sprite' && b.spr !== 'stadium') G('front', b.x - 2, b.y + b.h - 2, b.w + 4, 11);
    }
    // estádio: lixeiras, bancos e canteiros em volta
    if (bl.zone === 'estadio') {
      const st = blds.slice(nB0).find((b) => b.spr === 'stadium');
      if (st) {
        for (let x = st.x + 20; x < st.x + st.w - 10; x += 60) { PX('banco', x, st.y + st.h + 30); PX('lixeira-cinza', x + 18, st.y + st.h + 30); PX('flores-b', x + 34, st.y + st.h + 30); }
        PX('quiosque', st.x + 10, y1 - 60, true); PX('feira', st.x + 40, y1 - 60, true); PX('maq-bebida', st.x + 66, y1 - 60, true); PX('maq-lanche', st.x + 80, y1 - 60, true);
        const cyc = ['lixeira0', 'banco0', 'canteiro1', 'lixeira2', 'banco1', 'canteiro2'];
        let k = 0;
        for (let x = st.x + 10; x < st.x + st.w - 10; x += 22) PD(cyc[k++ % cyc.length], x, st.y + st.h + 14);
        for (let x = st.x + 16; x < st.x + st.w - 10; x += 30) PD(k++ % 2 ? 'canteiro0' : 'lixeira1', x, y1 - 30);
      }
    }
  }

  // ---------------------------------------------------------------- aeroporto
  const airport = { runway: [2880, 392, 1160, 72], taxi: [2900, 640, 1100, 40], apron: [2880, 820, 1000, 300], gate: [2900, 1116, 64, 104] };
  G('grass', 2792, 8, 1296, 1208, 'rect', { park: true, airport: true });
  G('runway', ...airport.runway, 'rect', { kind: 'runway' }); G('runway', ...airport.taxi, 'rect', { kind: 'taxi' });
  G('runway', 2930, 464, 40, 360, 'rect', { kind: 'taxi' }); G('runway', 3440, 464, 40, 360, 'rect', { kind: 'taxi' }); G('runway', 3960, 464, 40, 200, 'rect', { kind: 'taxi' });
  G('runway', ...airport.apron, 'rect', { kind: 'apron' }); G('lot', ...airport.gate, 'rect', { stalls: false });
  SPw('warehouse-blue', 3900, 820, 160, { label: 'Hangar Nexus Aviação' }); SPw('warehouse-blue', 3900, 968, 160);
  { let x = 3010; for (let k = 0; k < 5; k++) { const b = SP('airport', x, 1124, 88, k === 2 ? { label: 'Aeroporto Internacional Nexus' } : {}); x += b.w + 2; } }
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
      const ind = x > 2752 && y > 1504; const centro = x > 640 && x < 2752 && y < 1504;
      const kind = ind ? 'poste-madeira' : s.w >= 48 ? (Math.floor(t / 96) % 3 === 0 ? 'poste-triplo' : 'poste-duplo') : centro ? (Math.floor(t / 96) % 2 ? 'poste' : 'poste-duplo') : 'poste';
      lamps.push([x, y]); PX(kind, x, y + (s.v ? 0 : side > 0 ? 6 : 0), false, { lamp: true });
    }
  }

  // ---------------------------------------------------------------- máscara de colisão e alturas
  const mw = W / CS; const mh = H / CS; const mask = new Uint8Array(mw * mh).fill(GRASS); const heights = new Uint8Array(mw * mh);
  const code = { access: LOT, front: WALK, pond: WATER, water: WATER, sand: SAND, grass: GRASS, walk: WALK, road: ROAD, cross: CROSS, lot: LOT, runway: RUNWAY, plaza: PLAZA };
  const fillRect = (c, x, y, w, h) => { const ax = Math.max(0, Math.floor(x / CS)); const ay = Math.max(0, Math.floor(y / CS)); const bx = Math.min(mw, Math.ceil((x + w) / CS)); const by = Math.min(mh, Math.ceil((y + h) / CS)); for (let j = ay; j < by; j++) mask.fill(c, j * mw + ax, j * mw + bx); };
  const fillEll = (c, x, y, w, h) => { const cx = x + w / 2; const cy = y + h / 2; const ax = Math.max(0, Math.floor(x / CS)); const ay = Math.max(0, Math.floor(y / CS)); const bx = Math.min(mw, Math.ceil((x + w) / CS)); const by = Math.min(mh, Math.ceil((y + h) / CS)); for (let j = ay; j < by; j++) for (let i = ax; i < bx; i++) { const px = (i + 0.5) * CS; const py = (j + 0.5) * CS; if (((px - cx) / (w / 2)) ** 2 + ((py - cy) / (h / 2)) ** 2 <= 1) mask[j * mw + i] = c; } };
  // ordem: base → água/areia → quadras → calçadas → ruas → faixas → aeroporto → pontes
  const order = ['water', 'sand', 'grass', 'plaza', 'pond', 'lot', 'front', 'walk', 'access', 'road', 'cross', 'runway'];
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
  for (const f of beachFence) fillRect(SOLID, ...f);
  for (const b of blds) {
    const hgt = Math.min(250, b.floors * 9 + 6);
    if (b.round) fillEll(SOLID, b.x, b.y, b.w, b.h); else if (b.canopy) { fillRect(SOLID, b.x + 10, b.y + 10, 8, 8); fillRect(SOLID, b.x + b.w - 18, b.y + 10, 8, 8); fillRect(SOLID, b.x + b.w / 2 - 4, b.y + b.h - 20, 8, 8); } else fillRect(SOLID, b.x, b.y, b.w, b.h);
    const ax = Math.floor(b.x / CS); const ay = Math.floor(b.y / CS); const bx2 = Math.ceil((b.x + b.w) / CS); const by2 = Math.ceil((b.y + b.h) / CS);
    for (let j = ay; j < by2; j++) for (let i = ax; i < bx2; i++) if (i >= 0 && j >= 0 && i < mw && j < mh) heights[j * mw + i] = Math.max(heights[j * mw + i], hgt);
  }
  // ---------------------------------------------------------------- decoração (preenche cada espaço livre)
  {
    const free = (x, y, r) => { for (let dy = -r; dy <= r; dy += CS) for (let dx = -r; dx <= r; dx += CS) { const i = Math.floor((x + dx) / CS); const j = Math.floor((y + dy) / CS); if (i < 0 || j < 0 || i >= mw || j >= mh) return false; const c = mask[j * mw + i]; if (c !== GRASS && c !== PLAZA) return false; } return true; };
    const occ = new Set(); const key = (x, y) => `${Math.floor(x / 22)},${Math.floor(y / 22)}`;
    for (const p of props) occ.add(key(p.x, p.y));
    const near = (x, y) => occ.has(key(x, y));
    const inAirport = (x, y) => x > 2780 && y < 1236;
    const GREEN = ['d:arvore', 'd:arvore', 'd:arvore-vaso', 'd:arvore-vaso2', 'd:flores-v', 'd:flores-b', 'd:flores-a', 'd:arbusto-c', 'd:arbusto-c2', 'd:arbusto-vaso', 'd:banco', 'd:banco2', 'd:lixeira-verde', 'arvore0', 'arvore1', 'arvore2', 'arvore3', 'arvore4', 'arvore2', 'arvore3', 'arbusto0', 'arbusto1', 'canteiro0', 'canteiro1', 'canteiro2', 'banco0', 'banco1', 'jardim0', 'lixeira0'];
    const PAVED = ['d:arvore-vaso', 'd:arvore-vaso2', 'd:arbusto-vaso2', 'd:flores-v', 'd:flores-a', 'd:banco', 'd:lixeira-cinza', 'd:correio-azul', 'd:correio-vermelho', 'd:maq-bebida', 'd:maq-lanche', 'd:orelhao', 'd:banca-jornal', 'd:telefone', 'd:quiosque', 'd:feira', 'canteiro0', 'canteiro1', 'canteiro2', 'lixeira0', 'lixeira1', 'lixeira2', 'banco0', 'banco1', 'arvore0', 'arvore2', 'arbusto1', 'guarda-sol0'];
    for (let y = 24; y < H - 24; y += 22) for (let x = 330; x < W - 16; x += 22) {
      if (inAirport(x, y) || near(x, y)) continue;
      const jx = x + (R() - 0.5) * 6; const jy = y + (R() - 0.5) * 6;
      const i = Math.floor(jx / CS); const j = Math.floor(jy / CS); const c = mask[j * mw + i];
      if (c !== GRASS && c !== PLAZA) continue;
      if (!free(jx, jy, 10)) continue;
      if (R() > (c === GRASS ? 0.8 : 0.6)) continue;
      const spr = pick(c === GRASS ? GREEN : PAVED);
      if (spr.startsWith('d:')) PX(spr.slice(2), jx, jy + 6, !/flores|banco|lixeira/.test(spr)); else PD(spr, jx, jy + 6);
      occ.add(key(jx, jy));
      // banco ganha uma lixeira do lado
      if (/banco/.test(spr) && free(jx + 18, jy, 6)) { PX('lixeira-verde', jx + 18, jy + 6); occ.add(key(jx + 18, jy)); }
    }
    // calçadas: hidrantes, lixeiras e canteiros entre os postes
    const nodesL = Object.values(nodes);
    for (const s2 of segs) {
      const off = s2.w / 2 + 13; const len = s2.v ? s2.y1 - s2.y0 : s2.x1 - s2.x0; let k = 0;
      for (let t = 88; t < len; t += 96) for (const side of [-1, 1]) {
        const x = s2.v ? s2.x + side * off : s2.x0 + t; const y = s2.v ? s2.y0 + t : s2.y + side * off;
        if (nodesL.some(([nx, ny]) => Math.abs(nx - x) < s2.w + 14 && Math.abs(ny - y) < s2.w + 14) || x < 240 || x > W - 8 || y < 8 || y > H - 8) continue;
        if (s2.v && y > 1980 && y < 2084 && s2.x < 1440) continue;
        const i = Math.floor(x / CS); const j = Math.floor(y / CS); if (mask[j * mw + i] !== WALK) continue;
        const spr = ['hidrante', 'lixeira-cinza', 'arvore-vaso', 'correio-azul', 'hidrante', 'lixeira-verde', 'banca-jornal', 'arbusto-vaso', 'telefone', 'placa-proibido', 'correio-vermelho', 'orelhao'][k++ % 12];
        PX(spr, x, y + (s2.v ? 0 : 4), false);
      }
    }
  }
  // placas de sinalização e boeiros
  const decals = [];
  {
    const radar50 = [[704, 760], [1728, 2000], [2200, 576], [3300, 1504], [1200, 2304], [2752, 1900]];
    for (const [rx2, ry2] of radar50) PX('placa-50', rx2 + 30, ry2 - 22);
    for (const [id, [nx, ny, k]] of Object.entries(nodes)) {
      if (k === 'exit' || k === 'round') continue;
      let wv = 0; let wh = 0; for (const s2 of segs) { if (s2.v && s2.x === nx && ny >= s2.y0 && ny <= s2.y1) wv = Math.max(wv, s2.w); if (!s2.v && s2.y === ny && nx >= s2.x0 && nx <= s2.x1) wh = Math.max(wh, s2.w); }
      const ox = wv / 2 + 9; const oy = wh / 2 + 9;
      if (k === 'corner') { PX('placa-pedestre', nx + ox, ny + oy + 6); continue; }
      if (!lights.includes(id)) { PX('placa-pare', nx - ox, ny - oy + 6); PX('placa-pare', nx + ox, ny + oy + 6); }
      else PX('placa-pedestre', nx - ox, ny + oy + 6);
      if ((wv === 48 || wh === 48) && (nx + ny) % 3 === 0) PX('placa-direcao', nx + ox + 4, ny - oy + 4);
    }
    for (const d of driveways) PX('placa-p', d[0] - 6, d[1] + (d[1] % 2 ? 4 : 16));
    // boeiros na pista (perto do meio-fio) e tampas de bueiro no meio da faixa
    for (const s2 of segs) {
      const len = s2.v ? s2.y1 - s2.y0 : s2.x1 - s2.x0; let k = 0;
      for (let t = 70; t < len - 40; t += 140) {
        const side = k++ % 2 ? 1 : -1; const off = s2.w / 2 - 5;
        const x = s2.v ? s2.x + side * off : s2.x0 + t; const y = s2.v ? s2.y0 + t : s2.y + side * off;
        if (nodesList.some(([nx, ny]) => Math.abs(nx - x) < s2.w + 20 && Math.abs(ny - y) < s2.w + 20)) continue;
        if (s2.v && y > 1980 && y < 2084 && s2.x < 1440) continue;
        decals.push({ spr: 'grade-rua', x: x - 4, y: y - 3, w: 8, h: 7 });
        if (k % 3 === 0) { const mx = s2.v ? s2.x - side * s2.w * 0.24 : x + 40; const my = s2.v ? y + 40 : s2.y - side * s2.w * 0.24; decals.push({ spr: 'boeiro', x: mx - 5, y: my - 5, w: 10, h: 10 }); }
      }
    }
  }
  for (const p of props) if (p.solid) { const r = p.spr.startsWith('arvore') ? 4 : 3; fillRect(SOLID, p.x - r, p.y - r * 1.5, r * 2, r * 2); const i = Math.floor(p.x / CS); const j = Math.floor(p.y / CS); if (i >= 0 && j >= 0 && i < mw && j < mh) heights[j * mw + i] = Math.max(heights[j * mw + i], p.ht || 10); }

  return {
    W, H, CS, mw, mh, mask, heights, ground, blds, props, decals, lamps, pois, regions, bridges, driveways, fence, airport, runwayLights, spots, planeSpots,
    R: { w: W, h: H, nodes, roads, lights, lots: [], pois, regions, radars: [
      { at: [704, 760], limit: 50 }, { at: [1728, 2000], limit: 50 }, { at: [2200, 576], limit: 50 }, { at: [3300, 1504], limit: 50 }, { at: [1200, 2304], limit: 50 }, { at: [2752, 1900], limit: 50 }, { at: [1600, 1248], limit: 40 }, { at: [900, 928], limit: 40 },
    ] },
    segs,
  };
}
