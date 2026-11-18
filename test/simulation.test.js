// Simulação curta: 3 dias de mundo sem erros e com o dinheiro e os estoques consistentes.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootWorld } from './helpers.js';

const errors = [];
const origError = console.error;
console.error = (...a) => { errors.push(a.map(String).join(' ')); origError(...a); };
const T = await bootWorld();
after(() => { console.error = origError; return T.cleanup(); });

test('3 dias de simulação rodam sem erros', { timeout: 240000 }, async () => {
  const day0 = T.w.core.lastDay; const ev0 = T.w.events.length;
  await T.advance(72);
  assert.notEqual(T.w.core.lastDay, day0, 'os dias passaram');
  assert.ok(T.w.events.length > ev0 + 20, `o mundo produziu acontecimentos (${T.w.events.length - ev0})`);
  console.log('dias', day0, '→', T.w.core.lastDay, 'eventos novos', T.w.events.length - ev0);
  assert.deepEqual(errors.filter((e) => e.includes('[mundo]')), []);
});

test('invariantes depois da simulação', async () => {
  const B = await import('../server/world/bank.js');
  const C = await import('../server/world/commerce.js');
  const J = await import('../server/world/justice.js');
  const { people } = await import('../server/world/agents.js');
  const b = B.bankOf(T.w);
  assert.ok(b.balance >= 0, 'saldo do usuário nunca negativo');
  assert.ok(b.wallet >= 0);
  assert.equal(Math.round(b.blocked * 100), Math.round(b.blockedItems.reduce((s, x) => s + x.amount, 0) * 100), 'bloqueado = soma dos itens bloqueados');
  for (const pl of C.places(T.w)) for (const it of pl.catalog || []) assert.ok(it.stock >= 0, `estoque negativo em ${pl.name}`);
  for (const p of people(T.w)) if (p.agent) assert.ok(Number.isFinite(p.agent.cash), `dinheiro inválido: ${p.name}`);
  assert.ok((T.w.eco.treasury || 0) >= 0, 'o tesouro não fica negativo');
  assert.ok(J.justice(T.w).judgeId, 'há juíza(iz)');
  assert.ok(J.justice(T.w).officers.length >= 3, 'há policiais');
  assert.ok(T.w.core.schema >= 6);
});
