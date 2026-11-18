// Cidade viva: casas, rotinas e movimento dos moradores pelas ruas.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootWorld } from './helpers.js';

const T = await bootWorld();
after(() => T.cleanup());
const L = await import('../server/world/living.js');
const M = await import('../server/world/map.js');
const C = await import('../server/world/commerce.js');
const { residents } = await import('../server/world/agents.js');

const DAY = 86400000;
const day0 = Math.floor(Date.now() / DAY) * DAY;

test('cada morador tem exatamente uma casa, em um nó válido e fora de estabelecimentos', () => {
  const res = residents(T.w);
  const hs = L.houses(T.w);
  assert.ok(res.length > 0);
  for (const p of res) {
    const mine = hs.filter((h) => h.ownerId === p.id);
    assert.equal(mine.length, 1, `${p.name} deve ter 1 casa`);
    assert.ok(mine[0].address, 'a casa tem endereço');
  }
  const placeNodes = new Set(C.places(T.w).map((p) => p.node));
  for (const h of hs) assert.ok(!placeNodes.has(h.node), 'casa não pode ocupar o nó de um estabelecimento');
});

test('o mapa tem mais lugares e quarteirões para desenhar', () => {
  assert.ok(C.places(T.w).length >= 100, 'cidade com bastante comércio e serviços');
  const g = M.geoPublic(T.w);
  assert.ok(g.blocks.length > 300);
  assert.ok(g.blocks.every((b) => b.length === 9 && b.every(Number.isFinite)));
});

test('ninguém teletransporta: o deslocamento em 20 s nunca passa da velocidade de um carro', () => {
  const carUnitsPerSec = 420 / M.METERS_PER_UNIT / 60;
  for (const p of residents(T.w).slice(0, 25)) {
    let prev = null;
    for (let t = day0; t < day0 + 2 * DAY; t += 20000) {
      const s = L.whereIs(T.w, p, t);
      if (s && prev) assert.ok(Math.hypot(s.x - prev.x, s.y - prev.y) <= carUnitsPerSec * 20 * 1.05, `${p.name} saltou em ${new Date(t).toISOString()}`);
      prev = s;
    }
  }
});

test('o dia é contínuo: a posição à meia-noite coincide entre um dia e o seguinte', () => {
  for (const p of residents(T.w).slice(0, 25)) {
    const a = L.whereIs(T.w, p, day0 + DAY - 1000); const b = L.whereIs(T.w, p, day0 + DAY + 1000);
    if (a && b) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 25, `${p.name} muda de lugar na virada do dia`);
  }
});

test('as pessoas andam: em algum horário do dia há gente em movimento, dormindo e trabalhando', () => {
  const states = new Set();
  for (const p of residents(T.w)) for (let h = 0; h < 24; h += 0.25) { const s = L.whereIs(T.w, p, day0 + h * 3600000); if (s) states.add(s.moving ? 'andando' : /dormindo/.test(s.doing) ? 'dormindo' : /trabalhando/.test(s.doing) ? 'trabalhando' : 'outro'); }
  for (const k of ['andando', 'dormindo', 'trabalhando']) assert.ok(states.has(k), `deveria haver gente ${k}`);
});

test('a visão do mapa respeita a área pedida e traz os próximos pontos de quem anda', () => {
  const all = L.peopleView(T.w, { t: day0 + 17 * 3600000 });
  const box = [0, 0, 700, 600];
  const some = L.peopleView(T.w, { t: day0 + 17 * 3600000, bbox: box });
  assert.ok(some.length <= all.length);
  for (const v of some) assert.ok(v.x >= box[0] && v.x <= box[2] && v.y >= box[1] && v.y <= box[3]);
  for (const v of all.filter((x) => x.moving)) assert.equal(v.wp.length, 3);
});

test('o feed ao vivo registra entradas, saídas e compras', async () => {
  const before = L.live(T.w).items.length;
  L.liveEvent(T.w, { kind: 'compra', name: 'Teste', placeName: 'Loja', text: 'comprou' });
  assert.equal(L.live(T.w).items.length, before + 1);
  await T.advance(24);
  assert.ok(L.live(T.w).items.length >= before + 1, 'o feed não perde os eventos');
  assert.ok(L.live(T.w).items.length <= 150, 'o feed tem limite');
});
