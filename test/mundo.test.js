// MUNDO NOVO (Ilha de Nexus): contrato com os sistemas do jogo e identidade visual nova
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { generateCity, W, H } from '../public/js/drive/mundo.js';
import { ROAD, CROSS, RUNWAY, SAND, WATER, WALK, SOLID } from '../public/js/drive/world.js';

const city = generateCity();
const at = (x, y) => city.mask[Math.floor((y + city.oy) / city.CS) * city.mw + Math.floor((x + city.ox) / city.CS)];

test('mundo novo: pontos de interesse que os sistemas usam continuam existindo', () => {
  for (const id of ['policia', 'hospital', 'bombeiros', 'posto', 'concessionaria', 'locadora', 'estacionamento', 'aeroporto', 'hangar', 'prefeitura', 'forum', 'banco',
    'escola', 'praca', 'parque', 'shopping', 'mercado2', 'empregos', 'imobiliaria', 'hotel', 'cassino', 'terminal', 'construtora', 'industria', 'porto']) {
    const p = city.pois.find((q) => q.id === id); assert.ok(p, `ponto ${id}`);
    assert.ok(at(p.at[0], p.at[1]) !== SOLID, `entrada de ${id} acessível`);
  }
});

test('mundo novo: vias, rotatória, semáforos, radares e blitz sobre a pista', () => {
  assert.ok(city.R.roads.length >= 12 && city.R.lights.length >= 8 && city.R.smartLights.length >= 5, 'cidade pequena: poucas ruas, cruzamentos com semáforo');
  for (const r of city.R.radars) assert.ok([ROAD, CROSS].includes(at(r.at[0], r.at[1])), `radar na pista ${r.at}`);
  assert.ok(city.aurora.blitz.length >= 5);
  for (const b of city.aurora.blitz) assert.ok([ROAD, CROSS].includes(at(b.at[0], b.at[1])), `blitz na pista: ${b.id}`);
  assert.ok(city.spots.length >= 15 && city.rentSpot, 'vagas e vaga da locadora');
});

test('mundo novo: aeroporto, praia, píer, marina, mar e lago', () => {
  const [rx, ry, rw, rh] = city.airport.runway; assert.equal(at(rx + rw / 2, ry + rh / 2), RUNWAY);
  assert.ok(city.planeSpots.length >= 4 && city.planeSpots.every(([x, y]) => at(x, y) === RUNWAY), 'vagas de avião no pátio');
  assert.equal(at(200, 960), SAND, 'praia'); assert.equal(at(585, 1000), WALK, 'píer'); assert.equal(at(1400, 366), WALK, 'docas da marina');
  assert.equal(at(400, 1140), WATER, 'mar ao sul'); assert.equal(at(1390, 500), WATER, 'água da marina'); assert.equal(at(1075, 120), WATER, 'lago da colina');
  assert.equal(W, 1402); assert.equal(H, 1122); // cidade pequena (referência: 1 px = 1 unidade)
});

test('mundo novo: só arte nova nas construções e objetos, e todo sprite existe', () => {
  assert.ok(city.blds.length > 40 && city.blds.every((b) => b.spr.startsWith('m:')), 'construções novas');
  assert.ok(city.props.every((p) => p.spr.startsWith('m:')), 'objetos novos');
  const usados = new Set([...city.blds, ...city.props].map((o) => o.spr.slice(2)));
  for (const k of usados) assert.ok(fs.existsSync(`public/assets/mundo/${k}.png`), `arquivo de ${k}`);
});
