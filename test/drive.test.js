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
  assert.ok(st.cars.some((c) => c.id === car.id && c.sprite === 'car-sedan-vinho'));
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
