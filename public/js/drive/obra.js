// Construtora + Reforma — catálogo de tudo o que pode ser colocado na cidade (uso livre) (prédios, decoração,
// natureza, mobiliário e pisos), formatos do mapa e expansões de terreno. Usado pelo servidor (preços, validação)
// e pelo navegador (loja, editor e geração da cidade). Só dados e contas: nada de desenho aqui.
import { BLD } from './bldmeta.js';
import { DECO } from './decometa.js';
import { EXTRA } from './extrameta.js';

// núcleo da cidade gerada e margem de terreno em volta (onde a cidade pode crescer)
export const CORE = { w: 4096, h: 2816 };
export const PAD = 1536;
export const BOUNDS = { x0: -PAD, y0: -PAD, x1: CORE.w + PAD, y1: CORE.h + PAD };
export const TILE = 32; // pisos são pintados em quadrados de 32×32 unidades
export const LEVELS = 4; // expansões de terreno compráveis
export const EXPANSION = [0, 40000, 90000, 180000, 350000];
export const BEACH = 34; // largura da faixa de areia na costa
const SEA_X = 232; const SAND_X = 320; // mar e praia da orla oeste do núcleo

// formatos do mapa (superelipse |x/rx|^n + |y/ry|^n = 1; quanto maior o n, mais quadrado)
export const SHAPES = {
  continente: { label: 'Continente com ilhas (padrão)' },
  quadrado: { label: 'Quadrado com cantos suaves', n: 10 },
  arredondado: { label: 'Arredondado', n: 4 },
  circular: { label: 'Circular / oval', n: 2 },
  ilha: { label: 'Ilha (costa recortada)', n: 2.6, noise: true },
};

// raio da costa em função do ângulo, para um formato e nível de expansão
export function coastOf(shape = 'quadrado', level = 0) {
  const S = SHAPES[shape]?.n ? SHAPES[shape] : SHAPES.quadrado; const n = S.n;
  // centro da parte em terra do núcleo (a oeste dele já é mar)
  const hw = (CORE.w - SEA_X) / 2; const hh = CORE.h / 2; const cx = SEA_X + hw; const cy = hh; const k = 2 ** (1 / n); // k: menor escala que ainda contém o núcleo
  const margin = 150; const nz = S.noise ? 70 : 0;
  const exX = Math.max(0, (CORE.w + PAD - cx - 110 - nz - hw * k - margin) / LEVELS);
  const exY = Math.max(0, (hh + PAD - 110 - nz - hh * k - margin) / LEVELS);
  const L = Math.max(0, Math.min(LEVELS, level | 0));
  const rx = hw * k + margin + exX * L; const ry = hh * k + margin + exY * L;
  const noise = (a) => (S.noise ? 38 * Math.sin(a * 5 + 1.3) + 26 * Math.sin(a * 11 + 0.4) + 14 * Math.sin(a * 23 + 2.1) + 22 : 0);
  const r = (a) => { const c = Math.abs(Math.cos(a)) / rx; const s = Math.abs(Math.sin(a)) / ry; return (c ** n + s ** n) ** (-1 / n) + noise(a); };
  // tabela do raio por ângulo (consulta rápida para preencher a máscara do terreno)
  const NT = 4096; const tab = new Float32Array(NT + 1); for (let i = 0; i <= NT; i++) tab[i] = r(-Math.PI + (i / NT) * Math.PI * 2);
  const rFast = (a) => tab[Math.round(((a + Math.PI) / (Math.PI * 2)) * NT)];
  // dentro da terra? 0 = mar, 1 = areia, 2 = terra
  // a oeste a cidade já termina no mar (orla): o terreno novo não passa da praia existente
  const zone = (x, y) => { if (x < SEA_X) return 0; const dx = x - cx; const dy = y - cy; const d = Math.hypot(dx, dy); const R = rFast(Math.atan2(dy, dx)); const z = d > R ? 0 : d > R - BEACH ? 1 : 2; return x < SAND_X ? Math.min(z, 1) : z; };
  const poly = (off = 0, steps = 720, clampX = SEA_X - off) => { const pts = []; for (let i = 0; i < steps; i++) { const a = (i / steps) * Math.PI * 2; const R = r(a) + off; pts.push([Math.max(clampX, cx + Math.cos(a) * R), cy + Math.sin(a) * R]); } return pts; };
  return { shape: SHAPES[shape] ? shape : 'quadrado', level: L, cx, cy, r, zone, poly };
}

// ---------------------------------------------------------------- catálogo
const NAMES = {
  'res-a1': 'Sobrado bege', 'res-a2': 'Sobrado azul', 'res-a3': 'Sobrado verde', 'res-a4': 'Casa geminada', shop: 'Loja de rua', food: 'Lanchonete', cafe: 'Cafeteria', market: 'Mercadinho',
  bank: 'Agência bancária', hospital: 'Clínica', police: 'Posto policial', fire: 'Quartel de bombeiros', supermarket: 'Supermercado', garage: 'Oficina', gym: 'Academia', cinema: 'Cinema',
  burger: 'Hamburgueria', pizza: 'Pizzaria', diner: 'Restaurante', bar: 'Bar', gas: 'Posto de combustível', busterminal: 'Terminal de ônibus', 'warehouse-blue': 'Galpão azul',
  'warehouse-brick': 'Galpão de tijolo', silos: 'Silos', loading: 'Doca de carga', hotel: 'Hotel', office: 'Edifício comercial', mall: 'Shopping', cityhall: 'Prefeitura', house: 'Casa de telhado vermelho',
  'house-blue': 'Casa azul', 'apt-beige': 'Prédio residencial bege', 'apt-green': 'Prédio residencial verde', 'apt-brick': 'Prédio de tijolo', 'tower-beige': 'Torre bege', 'tower-glass': 'Torre de vidro',
  'tower-heli': 'Torre com heliponto', diner2: 'Restaurante 2', bar2: 'Bar 2', 'hotel-tall': 'Hotel alto', office2: 'Escritórios', bank2: 'Banco (sede)', 'tower-glass2': 'Torre de vidro 2',
  store247: 'Loja 24 h', grocery: 'Quitanda', pharmacy: 'Farmácia', pizza2: 'Pizzaria 2', burger2: 'Hamburgueria 2', video: 'Locadora', fashion: 'Loja de roupas', autoparts: 'Autopeças',
  factory: 'Fábrica', industrial: 'Indústria', 'ind-blue': 'Indústria azul', cooling: 'Torres de resfriamento', police2: 'Delegacia', fire2: 'Corpo de bombeiros', hospital2: 'Hospital',
  courthouse: 'Fórum', school: 'Escola', stadium: 'Estádio', airport: 'Terminal de aeroporto', mall2: 'Shopping 2', casino: 'Cassino',
  arvore: 'Árvore', coqueiro: 'Coqueiro', 'arvore-vaso': 'Árvore em vaso', 'arvore-vaso2': 'Árvore em vaso 2', 'flores-v': 'Canteiro de flores vermelhas', 'flores-b': 'Canteiro de flores brancas',
  'flores-a': 'Canteiro de flores amarelas', 'arbusto-c': 'Arbusto', 'arbusto-c2': 'Arbusto 2', 'arbusto-vaso': 'Arbusto em vaso', 'arbusto-vaso2': 'Arbusto em vaso alto', banco: 'Banco de praça',
  banco2: 'Banco de praça 2', 'lixeira-verde': 'Lixeira verde', 'lixeira-cinza': 'Lixeira cinza', 'correio-azul': 'Caixa de correio azul', 'correio-vermelho': 'Caixa de correio vermelha',
  'poste-duplo': 'Poste duplo', poste: 'Poste', 'poste-triplo': 'Poste ornamental triplo', 'poste-madeira': 'Poste de madeira', grade: 'Grade', grade2: 'Grade 2', cerca: 'Cerca de madeira',
  barreira: 'Barreira', cone: 'Cone', cavalete: 'Cavalete', cavalete2: 'Cavalete 2', tambor: 'Tambor', hidrante: 'Hidrante', 'banca-jornal': 'Banca de jornal', telefone: 'Telefone público',
  'ponto-onibus': 'Ponto de ônibus', 'placa-onibus': 'Placa de ônibus', 'placa-direcao': 'Placa de direção', 'placa-hotel': 'Letreiro de hotel', 'placa-bar': 'Letreiro de bar', 'placa-motel': 'Letreiro de motel',
  'placa-p': 'Placa de estacionamento', 'placa-proibido': 'Placa de proibido estacionar', 'placa-50': 'Placa de 50 km/h', 'placa-pare': 'Placa PARE', 'placa-pedestre': 'Placa de pedestres', semaforo: 'Semáforo',
  'maq-bebida': 'Máquina de bebidas', 'maq-lanche': 'Máquina de lanches', orelhao: 'Orelhão', quiosque: 'Quiosque', feira: 'Barraca de feira', guarita: 'Guarita', 'caixa-luz': 'Caixa de luz',
  armario: 'Armário elétrico', armario2: 'Armário elétrico 2', caixotes: 'Caixotes', pneus: 'Pneus', barril: 'Barril', 'faixa-pedestre': 'Faixa de pedestres', boeiro: 'Bueiro', 'grade-rua': 'Grade de escoamento',
  arvore0: 'Árvore frondosa', arvore1: 'Árvore redonda', arvore2: 'Pinheiro', arvore3: 'Árvore alta', arvore4: 'Árvore pequena', arbusto0: 'Moita', arbusto1: 'Moita florida', canteiro0: 'Canteiro', canteiro1: 'Canteiro 2',
  canteiro2: 'Canteiro 3', poste0: 'Poste clássico', poste1: 'Poste clássico 2', poste2: 'Poste clássico 3', poste3: 'Poste clássico 4', banco0: 'Banco de madeira', banco1: 'Banco de madeira 2', lixeira0: 'Lixeira',
  lixeira1: 'Lixeira 2', lixeira2: 'Lixeira 3', chafariz: 'Chafariz', jardim0: 'Jardim', banca0: 'Barraca listrada', banca1: 'Barraca 2', banca2: 'Barraca 3', banca3: 'Barraca 4', 'guarda-sol0': 'Guarda-sol',
  'guarda-sol1': 'Guarda-sol 2', 'fachada-shop': 'Fachada de loja', 'fachada-food': 'Fachada de lanchonete', 'fachada-cafe': 'Fachada de café', 'fachada-game': 'Fachada de games', 'fachada-24': 'Fachada 24 h',
  toldo0: 'Toldo', toldo1: 'Toldo 2', toldo2: 'Toldo 3', toldo3: 'Toldo 4', 'outdoor-sale': 'Outdoor de liquidação', 'outdoor-burger': 'Outdoor de lanche', 'outdoor-drink': 'Outdoor de bebida',
};
// tamanho (altura em unidades) dos sprites de decoração e dos objetos antigos
const DH = { arvore: 40, coqueiro: 46, 'arvore-vaso': 26, 'arvore-vaso2': 26, 'flores-v': 12, 'flores-b': 12, 'flores-a': 12, 'arbusto-c': 13, 'arbusto-c2': 13, 'arbusto-vaso': 14, 'arbusto-vaso2': 18,
  banco: 13, banco2: 13, 'lixeira-verde': 12, 'lixeira-cinza': 12, 'correio-azul': 13, 'correio-vermelho': 13, 'poste-duplo': 34, poste: 30, 'poste-triplo': 34, 'poste-madeira': 34, grade: 12, grade2: 12,
  cerca: 12, barreira: 10, cone: 8, cavalete: 10, cavalete2: 11, tambor: 11, hidrante: 10, 'banca-jornal': 20, telefone: 16, 'ponto-onibus': 22, 'placa-onibus': 22, 'placa-direcao': 22, 'placa-hotel': 26,
  'placa-bar': 22, 'placa-motel': 26, 'placa-p': 18, 'placa-proibido': 18, 'placa-50': 18, 'placa-pare': 18, 'placa-pedestre': 18, semaforo: 22, 'maq-bebida': 17, 'maq-lanche': 17, orelhao: 16,
  quiosque: 22, feira: 20, guarita: 20, 'caixa-luz': 15, armario: 15, armario2: 15, caixotes: 15, pneus: 10, barril: 14, 'faixa-pedestre': 14, boeiro: 10, 'grade-rua': 8 };
const PSZ = { arvore: [24, 40], arbusto: [17, 23], canteiro: [26, 16], banco: [24, 15], lixeira: [8, 13], hidrante: [8, 11], chafariz: [44, 39], jardim0: [30, 27], 'guarda-sol': [22, 19], banca: [24, 29],
  poste: [10, 30], fachada: [40, 30], toldo: [30, 14], outdoor: [48, 34] };
const OLD_PROPS = ['arvore0', 'arvore1', 'arvore2', 'arvore3', 'arvore4', 'arbusto0', 'arbusto1', 'canteiro0', 'canteiro1', 'canteiro2', 'poste0', 'poste1', 'poste2', 'poste3', 'banco0', 'banco1',
  'lixeira0', 'lixeira1', 'lixeira2', 'hidrante', 'chafariz', 'jardim0', 'banca0', 'banca1', 'banca2', 'banca3', 'guarda-sol0', 'guarda-sol1', 'fachada-shop', 'fachada-food', 'fachada-cafe', 'fachada-game',
  'fachada-24', 'toldo0', 'toldo1', 'toldo2', 'toldo3', 'outdoor-sale', 'outdoor-burger', 'outdoor-drink'];
const BIG = new Set(['stadium', 'airport', 'mall2', 'hospital2', 'police2', 'fire2', 'school', 'courthouse', 'office', 'office2', 'bank2', 'casino', 'tower-glass', 'tower-glass2', 'tower-beige', 'tower-heli', 'hotel-tall', 'factory', 'warehouse-blue', 'cityhall', 'cinema']);
export const FLOORS = {
  rua: { name: 'Asfalto (rua)', mat: 'road', price: 30, color: '#4a4d57' },
  calcada: { name: 'Calçada', mat: 'walk', price: 15, color: '#bdb8ad' },
  praca: { name: 'Piso de praça', mat: 'plaza', price: 18, color: '#cdbd9c' },
  estacionamento: { name: 'Estacionamento', mat: 'lot', price: 22, color: '#565962' },
  grama: { name: 'Grama', mat: 'grass', price: 6, color: '#4f9a3a' },
  areia: { name: 'Areia', mat: 'sand', price: 8, color: '#e8cf8a' },
  agua: { name: 'Água (lago)', mat: 'pond', price: 25, color: '#2f6fd0' },
};
export const CATS = [['predios', 'Prédios'], ['relevo', 'Relevo, lagos e rios'], ['veiculos', 'Veículos e barcos'], ['natureza', 'Natureza e canteiros'], ['mobiliario', 'Mobiliário urbano'], ['sinalizacao', 'Sinalização e postes'], ['comercio', 'Comércio e fachadas'], ['obras', 'Obras e indústria'], ['pisos', 'Ruas e pisos']];
const catOfDeco = (k) => (/arvore|coqueiro|flores|arbusto|canteiro|jardim|chafariz/.test(k) ? 'natureza'
  : /placa|poste|semaforo|faixa|boeiro|grade-rua/.test(k) ? 'sinalizacao'
    : /quiosque|feira|banca|maq-|fachada|toldo|outdoor|guarda-sol/.test(k) ? 'comercio'
      : /barreira|cone|cavalete|tambor|caixotes|pneus|barril|armario|caixa-luz|guarita/.test(k) ? 'obras' : 'mobiliario');
const roundP = (v) => Math.max(10, Math.round(v / 10) * 10);
const SOFT = /flores|banco|lixeira|faixa|boeiro|grade-rua|cerca|placa|poste|semaforo|hidrante|correio|cone|telefone/;

function buildCatalog() {
  const C = {};
  for (const [k, [sw, sh]] of Object.entries(BLD)) {
    if (k.endsWith('-lit')) continue;
    const s = k === 'stadium' ? 1.5 : BIG.has(k) ? 0.95 : 0.55; const w = Math.round(sw * s); const h = Math.round(sh * s);
    C[`bld/${k}`] = { key: `bld/${k}`, kind: 'bld', cat: 'predios', spr: k, name: NAMES[k] || k, w, h, solid: true, price: roundP(4000 + w * h * 2.2), img: `/assets/rpg/bld/${k}.png` };
  }
  for (const [k, [sw, sh]] of Object.entries(DECO)) {
    const h = DH[k] || 14; const w = Math.round(((h * sw) / sh) * 10) / 10; const decal = ['faixa-pedestre', 'boeiro', 'grade-rua'].includes(k);
    C[`deco/${k}`] = { key: `deco/${k}`, kind: decal ? 'decal' : 'prop', cat: catOfDeco(k), spr: `d:${k}`, name: NAMES[k] || k, w, h, solid: !decal && !SOFT.test(k), lamp: /poste/.test(k), price: roundP(20 + w * h * 0.6), img: `/assets/rpg/deco/${k}.png` };
  }
  for (const k of OLD_PROPS) {
    const pk = Object.keys(PSZ).find((n) => k.startsWith(n)) || 'lixeira'; const [w, h] = PSZ[pk];
    C[`props/${k}`] = { key: `props/${k}`, kind: 'prop', cat: catOfDeco(k), spr: k, name: NAMES[k] || k, w, h, solid: !SOFT.test(k) && !/toldo|fachada/.test(k), lamp: /poste/.test(k), price: roundP(20 + w * h * 0.6), img: `/assets/rpg/props/${k}.png` };
  }
  // folhas extras (cidade filipina, natureza, cidade 16 bit, prédios modernos)
  for (const [k, [pw, ph, name, cat, kind, f, mat]] of Object.entries(EXTRA)) {
    const w = Math.round(pw * f * 10) / 10; const h = Math.round(ph * f * 10) / 10; const img = `/assets/rpg/extra/${k}.png`;
    if (kind === 'F') C[`x/${k}`] = { key: `x/${k}`, kind: 'floor', cat: 'pisos', mat, tex: `x:${k}`, name, w: TILE, h: TILE, price: 0, color: '#777', img, unit: 'bloco 32×32' };
    else if (kind === 'B') C[`x/${k}`] = { key: `x/${k}`, kind: 'bld', cat, spr: `x:${k}`, name, w: Math.round(w), h: Math.round(h), solid: true, price: 0, img };
    else C[`x/${k}`] = { key: `x/${k}`, kind: kind === 'D' ? 'decal' : 'prop', cat, spr: `x:${k}`, name, w, h, solid: kind === 'P', lamp: /poste|lampiao/.test(k) || undefined, price: 0, img };
  }
  for (const [k, f] of Object.entries(FLOORS)) C[`piso/${k}`] = { key: `piso/${k}`, kind: 'floor', cat: 'pisos', mat: f.mat, name: f.name, w: TILE, h: TILE, price: f.price, color: f.color, unit: 'bloco 32×32' };
  return C;
}
export const CATALOG = buildCatalog();

// identificação estável dos itens gerados (para lembrar o que foi demolido)
export const genKey = (o) => `${o.spr || o.kind}@${Math.round(o.x)},${Math.round(o.y)}`;
// item colocado pelo jogador → objeto da cidade
export function placed(a) {
  const c = CATALOG[a.k]; if (!c) return null;
  const s = Math.max(0.3, Math.min(4, Number(a.s) || 1));
  if (c.kind === 'bld') return { kind: 'sprite', spr: c.spr, x: a.x, y: a.y, w: c.w * s, h: c.h * s, floors: Math.max(1, Math.round((c.h / c.w) * 4 * s)), user: a.id };
  if (c.kind === 'decal') return { decal: true, spr: c.spr.startsWith('d:') ? c.spr.slice(2) : c.spr, x: a.x - (c.w * s) / 2, y: a.y - (c.h * s) / 2, w: c.w * s, h: c.h * s, rot: a.r || 0, user: a.id };
  return { spr: c.spr, x: a.x, y: a.y, w: c.w * s, h: c.h * s, solid: c.solid, ht: c.cat === 'relevo' ? Math.min(200, Math.round(c.h * s * 0.8)) : /arvore|coqueiro|palmeira|pinheiro/.test(c.spr) ? 18 : 6, deco: true, lamp: c.lamp || undefined, rot: a.r || 0, user: a.id };
}
