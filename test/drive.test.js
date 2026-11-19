// Cidade 2D: garagem no mundo aberto, estacionamento salvo e fiscalização de trânsito (multas reais e limitadas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWorld } from './helpers.js';

const T = await bootWorld();
const D = await import('../server/world/drive.js');
const I = await import('../server/world/inventory.js');
const { bankOf } = await import('../server/world/bank.js');

test('carros comprados aparecem na cidade 2D e o estacionamento é salvo', () => {
  const ctx = T.ctx();
  const car = I.makeItem(ctx, { key: 'car-sedan-vinho', price: 32000 });
  const st = D.driveState(T.w);
  assert.ok(st.cars.some((c) => c.id === car.id && c.sprite === 'preto'), 'sprite novo da folha de carros');
  assert.ok(st.people.length > 10, 'moradores reais viram pedestres');
  D.park(T.w, { itemId: car.id, x: 900, y: 330, a: 1.2 });
  assert.deepEqual(D.driveState(T.w).cars.find((c) => c.id === car.id).parked.x, 900);
  assert.throws(() => D.park(T.w, { itemId: 'nao-e-meu', x: 1, y: 1 }), /não é seu/);
});

test('multa de trânsito vira dívida no banco, com intervalo mínimo por tipo e limite diário', () => {
  const ctx = T.ctx();
  const before = bankOf(T.w).debts.length;
  const r = D.infraction(ctx, { tipo: 'sinal' });
  assert.equal(r.ok, true); assert.equal(r.fine.amount, 293);
  assert.equal(bankOf(T.w).debts.length, before + 1);
  assert.equal(D.infraction(ctx, { tipo: 'sinal' }).ok, false, 'a mesma infração não multa duas vezes seguidas');
  assert.throws(() => D.infraction(ctx, { tipo: 'inventada' }), /desconhecida/);
  for (const t of ['velocidade', 'velocidade-grave', 'velocidade-gravissima', 'estacionamento']) D.infraction(ctx, { tipo: t, kmh: 70, limite: 40 });
  const n = bankOf(T.w).debts.length;
  assert.ok(n - before <= 6);
});

test('mapa v3: estacionamento no mapa novo, aeronaves na garagem, dano e reboque cobrado', async () => {
  const ctx = T.ctx();
  const B = await import('../server/world/bank.js');
  const car = I.makeItem(ctx, { key: 'car-esportivo-verde', price: 78000 });
  const plane = I.makeItem(ctx, { key: 'air-mono-azul', price: 158000 });
  let st = D.driveState(T.w);
  assert.equal(st.map.w, 4096);
  assert.ok(st.cars.some((c) => c.id === plane.id && c.type === 'aeronave' && c.sprite === 'mono-azul'));
  D.park(T.w, { itemId: car.id, x: 3000, y: 2000, a: 0 });
  st = D.driveState(T.w); assert.equal(st.cars.find((c) => c.id === car.id).parked.x, 3000);
  D.damage(T.w, { itemId: car.id, health: 0 });
  B.credit(T.w, 20000, 'teste', ctx.at);
  const before = B.bankOf(T.w).balance;
  const r = D.tow(ctx, { itemId: car.id });
  assert.ok(r.total > 180 && B.bankOf(T.w).balance < before, 'reboque e reparo cobrados');
  st = D.driveState(T.w); const c = st.cars.find((x) => x.id === car.id);
  assert.ok(c.repairUntil && !c.parked, 'na oficina, sem vaga no mapa');
  assert.throws(() => D.tow(ctx, { itemId: car.id }), /oficina/);
});

test('ocorrências do mapa viram acontecimento e ferem o morador atropelado', async () => {
  const ctx = T.ctx();
  const { residents } = await import('../server/world/agents.js');
  const p = residents(T.w).find((x) => x.agent?.status === 'ativo');
  const n0 = T.w.events.length;
  assert.equal(D.incident(ctx, { tipo: 'atropelamento', personaId: p.id, regiao: 'Centro', culpa: true }).ok, true);
  assert.ok(T.w.events.length > n0);
  assert.ok(T.w.events.at(-1).title.includes(p.name));
  assert.ok(p.agent.injuredUntil > new Date().toISOString());
  assert.ok(!D.driveState(T.w).people.some((x) => x.id === p.id), 'ferido não anda pela cidade');
  assert.throws(() => D.incident(ctx, { tipo: 'inventada' }), /desconhecida/);
  assert.equal(D.infraction(ctx, { tipo: 'fuga' }).fine.amount, 2934);
});
