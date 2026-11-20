import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../public/js/drive/city.js';
import { buildGraph } from '../public/js/drive/world.js';
import * as TR from '../public/js/drive/traffic.js';
import { createCityEvents, CITY } from '../public/js/drive/cityevents.js';
import { describeCar, FEAR } from '../public/js/drive/carjack.js';
import { TOW } from '../public/js/drive/accidents.js';

globalThis.performance ??= { now: () => Date.now() };
const city = generateCity();
const sim = (x, y, n, secs, setup) => {
  const world = buildGraph(city.R); const view = { x, y, r: 700 };
  const T = TR.createTraffic(world, { count: n, near: { x, y, r: 100 } }); setup?.(T, world);
  let ov = 0; let moving = 0; let samples = 0;
  for (let k = 0; k < secs * 30; k++) {
    TR.stepTraffic(T, world, 1 / 30, k / 30, { extra: [], crossing: new Set(), view });
    if (k % 6 === 0) { ov += TR.overlaps(T.cars).length; for (const c of T.cars) { samples++; if (c.v > 2) moving++; } }
  }
  return { T, world, ov, moving: moving / samples };
};

test('nenhum carro atravessa outro: 60 carros por 60 s em Nexus City e em Aurora', () => {
  for (const [x, y] of [[1560, 1730], [6880, -160]]) {
    const r = sim(x, y, 60, 60);
    assert.equal(r.ov, 0, `sobreposições em ${x},${y}`);
    assert.ok(r.moving > 0.25, `o trânsito anda (${(r.moving * 100).toFixed(0)}% em movimento)`);
  }
});

test('perfis de motorista: cauteloso, comum, apressado e imprudente, com parâmetros diferentes', () => {
  const P = TR.PROFILES; assert.deepEqual(Object.keys(P), ['cauteloso', 'comum', 'apressado', 'imprudente']);
  assert.ok(P.cauteloso.T > P.comum.T && P.comum.T > P.apressado.T && P.apressado.T > P.imprudente.T, 'distância de segurança');
  assert.ok(P.cauteloso.react > P.imprudente.react, 'tempo de reação'); assert.ok(P.imprudente.v > P.cauteloso.v, 'velocidade');
  const n = {}; for (let i = 0; i < 2000; i++) n[TR.pickProfile()] = (n[TR.pickProfile()] || 0) + 1;
  assert.ok(n.imprudente < n.comum, 'imprudentes são minoria');
});

test('via bloqueada: o carro parado de vez publica o bloqueio e os outros desviam ou esperam, sem atravessar', () => {
  const r = sim(1560, 1730, 50, 40, (T) => { const c = T.cars.find((k) => !k.siren && k.lane.path.len > 200); c.sceneHold = true; c.wrecked = 9999; c.blockTest = true; });
  const blocked = r.T.cars.find((k) => k.blockTest);
  assert.ok(CITY.blocked(blocked.lane), 'faixa marcada como bloqueada');
  assert.equal(r.world.penalty(blocked.lane), 3000, 'rotas pagam caro para passar ali');
  assert.equal(r.ov, 0);
});

test('eventos urbanos: assinatura, bloqueio e liberação', () => {
  const E = createCityEvents(); const got = []; E.on('bloqueio', (d) => got.push(['b', d.lane])); E.on('liberado', (d) => got.push(['l', d.lane]));
  const lane = { id: 1 };
  E.beginFrame(); E.block(lane, {}); E.endFrame(); assert.ok(E.blocked(lane));
  E.beginFrame(); E.endFrame(); assert.ok(!E.blocked(lane));
  assert.deepEqual(got.map((g) => g[0]), ['b', 'l']);
  E.close(lane, 'obra'); assert.ok(E.blocked(lane)); E.open(lane); assert.ok(!E.blocked(lane));
});

test('guinchos e roubo: tempos configuráveis e descrição do carro para a denúncia', () => {
  assert.equal(TOW.start, 120); assert.ok(TOW.work >= 50 && TOW.work <= 65, '~1 min por carro');
  assert.deepEqual(describeCar({ sprite: 'city-vermelho', kind: 'carro' }), { modelo: 'Carro', cor: 'vermelho' });
  assert.deepEqual(describeCar({ sprite: 'taxi', kind: 'taxi' }), { modelo: 'Táxi', cor: 'amarelo' });
  assert.ok(FEAR.length >= 7);
});
