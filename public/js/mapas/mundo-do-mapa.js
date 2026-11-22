// MUNDO DO MAPA CRIADO: transforma o mapa do editor ("Criar mapa") no formato que o motor do jogo já usa.
// Entrada: mapa {largura, altura, celulas {"x,y": chave}, itens [{chave, x, y, rot, dados}]} e o inventário (chave → peça).
// Saída: o mesmo formato de cidade que o jogo recebia do gerador antigo (chão, máscara de colisão, vias, construções,
// pontos de interesse, regiões, vagas e aeronaves). A lógica (trânsito, pedestres, colisão) não muda.
// Pura (sem DOM): pode rodar no navegador e no servidor.

export const CELULA = 32;   // tamanho da célula do editor, em unidades do mundo
const CS = 4;                // resolução da máscara de colisão (igual ao motor)
const GRAMA = 'terreno/grama-base';

// tipo de cada tile de terreno para o motor
const MATERIAL = {
  'terreno/grama-base': { mat: 'grass', mascara: 6 },        // GRASS
  'terreno/grama': { mat: 'grass', mascara: 6 },
  'terreno/grama-clara': { mat: 'grass', mascara: 6 },
  'terreno/grama-flores': { mat: 'grass', mascara: 6 },
  'terreno/grama-florida': { mat: 'grass', mascara: 6 },
  'terreno/grama-roxa': { mat: 'grass', mascara: 6 },
  'terreno/mata': { mat: 'grass', mascara: 6 },
  'terreno/terra': { mat: 'grass', mascara: 6 },
  'terreno/canteiro': { mat: 'grass', mascara: 6 },
  'terreno/asfalto': { mat: 'road', mascara: 2 },           // ROAD: pista de carros
  'terreno/calcada': { mat: 'walk', mascara: 1 },           // WALK: calçada
  'terreno/areia': { mat: 'sand', mascara: 9 },             // SAND
  'terreno/agua': { mat: 'water', mascara: 5 },             // WATER: não anda
  'terreno/pedra': { mat: 'plaza', mascara: 8 },            // PLAZA: praça
};
const SOLIDO = 0;

export function mundoDoMapa(mapa, inventario) {
  const W = mapa.largura * CELULA; const H = mapa.altura * CELULA;
  const mw = W / CS; const mh = H / CS;
  const chave = (x, y) => mapa.celulas[`${x},${y}`] || GRAMA;
  // máscara: começa com o chão de cada célula; construções e objetos sólidos viram SOLIDO
  const mask = new Uint8Array(mw * mh);
  const ground = [];
  for (let y = 0; y < mapa.altura; y++) for (let x = 0; x < mapa.largura; x++) {
    const k = chave(x, y); const m = MATERIAL[k] || MATERIAL[GRAMA];
    ground.push({ mat: m.mat, shape: 'rect', x: x * CELULA, y: y * CELULA, w: CELULA, h: CELULA });
    for (let j = y * CELULA / CS; j < (y + 1) * CELULA / CS; j++) mask.fill(m.mascara, j * mw + x * CELULA / CS, j * mw + (x + 1) * CELULA / CS);
  }
  const blds = []; const props = []; const pois = []; const planeSpots = []; const personagens = [];
  const marcarSolido = (x0, y0, w, h) => {
    const i0 = Math.max(0, Math.floor(x0 / CS)); const i1 = Math.min(mw, Math.ceil((x0 + w) / CS));
    const j0 = Math.max(0, Math.floor(y0 / CS)); const j1 = Math.min(mh, Math.ceil((y0 + h) / CS));
    for (let j = j0; j < j1; j++) mask.fill(SOLIDO, j * mw + i0, j * mw + i1);
  };
  for (const p of mapa.itens || []) {
    const it = inventario.get(p.chave); if (!it) continue;
    const w = it.w; const h = it.h;
    if (it.categoria === 'personagens') { // personagens colocados no mapa andam pelas calçadas (sprite chr/<nome>)
      personagens.push({ id: p.id, nome: p.dados?.nome || it.nome, spr: 'chr/' + it.chave.replace(/^personagens\//, ''), x: p.x, y: p.y });
      continue;
    }
    if (it.tipo === 'veiculo') { // veículos entram depois, como agentes do mundo
      if (it.categoria === 'aeronaves') planeSpots.push([p.x, p.y, -Math.PI / 2]);
      continue;
    }
    // (x, y) é o pé do item (centro horizontal da base), como no editor
    const rot = Math.round(((p.rot || 0) % 360 + 360) % 360 / 90) % 4;
    const ww = rot % 2 ? h : w; const hh = rot % 2 ? w : h;
    const x0 = p.x - ww / 2; const y0 = p.y - hh;
    const spr = 'm:' + it.chave; // ex.: m:construcoes/hospital (o renderizador já sabe achar esse sprite)
    if (it.categoria === 'construcoes') {
      blds.push({ kind: 'sprite', spr, x: x0, y: y0, w: ww, h: hh, floors: Math.max(1, Math.round(hh / 24)), i: blds.length });
      // corpo sólido: as paredes, sem a faixa de cima (calçada da frente) e a de baixo (porta)
      marcarSolido(x0 + ww * 0.06, y0 + hh * 0.12, ww * 0.88, hh * 0.74);
      if (p.dados?.nome || p.dados?.rota) {
        pois.push({ id: p.id, label: p.dados.nome || it.nome, at: [Math.round(p.x), Math.round(p.y + 14)], route: p.dados.rota || '#/mapa', icon: 'building' });
      }
    } else if (it.categoria === 'objetos' || it.categoria === 'vegetacao' || it.categoria === 'relevo') {
      props.push({ spr, x: p.x, y: p.y, w: ww, h: hh, solid: it.categoria !== 'objetos' });
      if (it.categoria !== 'objetos') marcarSolido(p.x - ww * 0.2, p.y - hh * 0.25, ww * 0.4, hh * 0.25);
    }
  }
  const estradas = viasDoChao(mapa);
  const nodes = estradas.nodes; const roads = estradas.roads;
  const lines = roads.map((r) => ({ pts: [nodes[r.path[0]].slice(0, 2), nodes[r.path.at(-1)].slice(0, 2)], w: r.w, ca: 0, cb: 0, diag: false, road: r.id, out: false }));
  const segs = roads.map((r) => { const a = nodes[r.path[0]]; const b = nodes[r.path.at(-1)]; return a[0] === b[0] ? { v: true, x: a[0], y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]), w: r.w, name: r.name, noStub: true } : { v: false, y: a[1], x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), w: r.w, name: r.name, noStub: true }; });
  const lights = Object.keys(nodes).filter((id) => estradas.grau[id] >= 3);
  const nodeInfo = Object.fromEntries(Object.entries(nodes).map(([id, n]) => [id, { x: n[0], y: n[1], kind: estradas.grau[id] >= 3 ? 'cross' : 'corner', maxW: estradas.maxW[id] || 0, r: 46 }]));
  // vagas e aeronaves: se o mapa não tem, há posições de reserva no centro (o jogo precisa de pelo menos duas)
  const cx = W / 2; const cy = H / 2;
  if (planeSpots.length < 2) { planeSpots.push([cx - 60, cy, -Math.PI / 2], [cx + 60, cy, -Math.PI / 2]); }
  const spots = Array.from({ length: 8 }, (_, i) => [cx - 140 + i * 40, cy + 70, -Math.PI / 2]);
  return {
    name: mapa.nome || 'Meu mapa', W, H, CS, mw, mh, mask, heights: new Uint8Array(mw * mh), ox: 0, oy: 0,
    bounds: { x0: 0, y0: 0, x1: W, y1: H }, coast: null, core: { w: W, h: H }, stubs: [], ground,
    blds, props, decals: [], lamps: [], pois, regions: [{ name: mapa.nome || 'Meu mapa', rect: [0, 0, W, H] }],
    bridges: [], driveways: [], fence: [], airport: null, runwayLights: [], spots, rentSpot: null, planeSpots,
    aurora: { blitz: [], area: [0, 0, W, H] }, personagens,
    R: { w: W, h: H, nodes, roads, lights, smartLights: [], lots: [], pois, regions: [{ name: mapa.nome || 'Meu mapa', rect: [0, 0, W, H] }], radars: [] },
    segs, lines, nodeInfo,
  };
}

// vias: as células de asfalto viram um grafo. Nós são as células de cruzamento, curva ou fim de rua;
// cada trecho reto entre dois nós vira uma via. Só trechos retos (asfalto da grade de células).
function viasDoChao(mapa) {
  const celulasRua = new Set();
  for (const [k, v] of Object.entries(mapa.celulas)) if (v === 'terreno/asfalto') celulasRua.add(k);
  const viz = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => celulasRua.has(`${x + dx},${y + dy}`)).map(([dx, dy]) => [dx, dy]);
  const nodeCelulas = new Set();
  for (const k of celulasRua) {
    const [x, y] = k.split(',').map(Number); const v = viz(x, y);
    const reta = v.length === 2 && ((v[0][0] === -v[1][0] && v[0][1] === 0 && v[1][1] === 0) || (v[0][1] === -v[1][1] && v[0][0] === 0 && v[1][0] === 0));
    if (v.length !== 2 || !reta) nodeCelulas.add(k);
  }
  const nodes = {}; const roads = []; const maxW = {};
  const id = (x, y) => `n${x}_${y}`;
  for (const k of nodeCelulas) { const [x, y] = k.split(',').map(Number); nodes[id(x, y)] = [x * CELULA + CELULA / 2, y * CELULA + CELULA / 2, 'corner']; }
  // trechos: a partir de cada nó, anda em cada direção até o próximo nó
  const vistos = new Set(); let n = 0;
  for (const k of nodeCelulas) {
    const [x, y] = k.split(',').map(Number);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!celulasRua.has(`${x + dx},${y + dy}`)) continue;
      const chaveTrecho = [k, `${x + dx},${y + dy}`].sort().join('|');
      if (vistos.has(chaveTrecho)) continue;
      let cx = x + dx; let cy = y + dy; let passos = 1;
      while (!nodeCelulas.has(`${cx},${cy}`)) { const nx = cx + dx; const ny = cy + dy; if (!celulasRua.has(`${nx},${ny}`)) break; cx = nx; cy = ny; passos++; }
      if (!nodeCelulas.has(`${cx},${cy}`)) continue; // beco: trecho sem fim em nó
      vistos.add(chaveTrecho); vistos.add([`${cx},${cy}`, `${cx - dx},${cy - dy}`].sort().join('|'));
      const a = id(x, y); const b = id(cx, cy);
      const rid = `R${++n}`;
      roads.push({ id: rid, name: 'Rua', w: 32, path: [a, b] });
      maxW[a] = Math.max(maxW[a] || 0, 32); maxW[b] = Math.max(maxW[b] || 0, 32);
    }
  }
  // nós fora de trechos (ex.: um único quadro isolado) não entram
  const usados = new Set(roads.flatMap((r) => r.path));
  for (const k of Object.keys(nodes)) if (!usados.has(k)) delete nodes[k];
  const grauId = {}; for (const r of roads) for (const p of r.path) grauId[p] = (grauId[p] || 0) + 1;
  return { nodes, roads, grau: grauId, maxW: Object.fromEntries(Object.keys(nodes).map((k) => [k, 32])) };
}
