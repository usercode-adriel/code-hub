import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity, W, H } from '../public/js/drive/city.js';
import { buildGraph, routeNodes, lightState, stepSmartLights, ROAD, RUNWAY, CROSS } from '../public/js/drive/world.js';

const city = generateCity();
const world = buildGraph(city.R);
const at = (x, y) => city.mask[Math.floor((y + city.oy) / 4) * city.mw + Math.floor((x + city.ox) / 4)];

test('Aurora existe longe de Nexus City, com serviços próprios', () => {
  for (const id of ['policia-aurora', 'hospital-aurora', 'bombeiros-aurora', 'aeroporto-aurora', 'prefeitura-aurora', 'estrela-aurora', 'vila-serena-aurora', 'vila-esperanca-aurora', 'vila-porto-aurora']) assert.ok(city.pois.some((p) => p.id === id), id);
  const aur = city.pois.filter((p) => p.id.endsWith('-aurora'));
  assert.ok(aur.every((p) => p.at[0] > W), 'tudo fora do núcleo de Nexus City');
  assert.ok(!aur.some((p) => /Nexus/.test(p.label)), 'nomes de Aurora');
  assert.equal(new Set(city.pois.map((p) => p.id)).size, city.pois.length, 'ids únicos');
});

test('dá para ir de carro de Nexus City até a Praça da Estrela, o aeroporto e as vilas', () => {
  for (const to of ['n6880_-160', 'n8300_1240', 'n5180_-1900', 'n8360_-1760', 'n5300_1100']) assert.ok(routeNodes(world, 'n1400_1888', to), `rota até ${to}`);
});

test('máscara: Av. Central, rodovia, pista do aeroporto e ruas da vila são de carro', () => {
  for (const [x, y] of [[6880, -600], [6880, 1000], [4700, 2208], [5480, 1960]]) assert.ok([ROAD, CROSS].includes(at(x, y)), `${x},${y}`);
  assert.equal(at(7600, 1716), RUNWAY);
  assert.ok([ROAD, CROSS].includes(at(5170, 1100)));
});

test('Av. Central e rodovia têm 2 faixas por sentido; a Praça da Estrela é uma rotatória grande', () => {
  const lanes = world.lanes.filter((l) => l.edge.road === 'AV6880' && l.edge.a.id === 'n6880_-800' && l.edge.b.id === 'n6880_-480');
  assert.equal(lanes.length, 4);
  assert.equal(lanes.filter((l) => l.inner).length, 2);
  assert.ok(world.lanes.some((l) => l.edge.road === 'ARH2' && l.inner));
  const star = world.nodes['n6880_-160'];
  assert.equal(star.kind, 'round'); assert.equal(star.r, 84); assert.ok(star.edges.length >= 8, 'oito braços');
});

test('semáforo inteligente abre para o eixo com fila e respeita o verde mínimo', () => {
  const n = Object.values(world.nodes).find((q) => q.light?.smart);
  assert.ok(n);
  n.light.axis = 'H'; n.light.phase = 'green'; n.light.t = 0;
  assert.equal(lightState(n, 'H', 0), 'green'); assert.equal(lightState(n, 'V', 0), 'red');
  const lane = n.inn.find((l) => l.axis === 'V'); assert.ok(lane, 'há faixa chegando no eixo V');
  const car = { lane, s: lane.path.len - 10, v: 0 };
  stepSmartLights(world, [car], 2, null); assert.equal(n.light.phase, 'green', 'ainda no verde mínimo');
  stepSmartLights(world, [car], 5, null); assert.equal(n.light.phase, 'yellow', 'fila no eixo V: amarelo');
  stepSmartLights(world, [car], 3, null); assert.equal(n.light.axis, 'V'); assert.equal(lightState(n, 'V', 0), 'green');
});

test('radares e pontos de blitz da Aurora', () => {
  const r = city.R.radars.filter((x) => x.aurora);
  assert.ok(r.length >= 10); assert.ok(r.some((x) => x.limit === 80), 'rodovia a 80');
  assert.ok(city.aurora.blitz.length >= 5);
  for (const b of city.aurora.blitz) assert.ok([ROAD, CROSS].includes(at(b.at[0], b.at[1])), `blitz na pista: ${b.id}`);
});

test('Nexus City continua no mesmo lugar (núcleo e saídas)', () => {
  for (const id of ['policia', 'hospital', 'aeroporto', 'praca', 'estadio']) { const p = city.pois.find((q) => q.id === id); assert.ok(p && p.at[0] < W && p.at[1] < H, id); }
  assert.ok(world.nodes['n4096_2208'], 'Estrada do Leste chega na rodovia');
  assert.notEqual(world.nodes['n4096_2208'].kind, 'exit');
});
