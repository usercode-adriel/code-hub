// Banco: senha, bloqueio, idempotência, saldo nunca negativo, empréstimo (tabela Price) e atrasos.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootWorld } from './helpers.js';

const T = await bootWorld();
after(() => T.cleanup());
const B = await import('../server/world/bank.js');
const { eco } = await import('../server/world/economy.js');

test('a conta começa em zero', () => {
  assert.equal(B.START_BALANCE, 0);
  assert.ok(B.bankOf(T.w).balance >= 0);
});

test('senha: rejeita senhas fracas e nunca guarda o número em texto', () => {
  assert.throws(() => B.setPin(T.w, '1111'), /fácil/);
  assert.throws(() => B.setPin(T.w, '1234'), /fácil/);
  assert.throws(() => B.setPin(T.w, '12a4'), /4 números/);
  B.setPin(T.w, '4826');
  assert.ok(B.hasPin(T.w));
  assert.ok(!JSON.stringify(B.bankOf(T.w).pin).includes('4826'), 'a senha não pode aparecer no armazenamento');
  assert.doesNotThrow(() => B.verifyPin(T.w, '4826'));
});

test('senha: 5 erros bloqueiam, inclusive para a senha certa', () => {
  for (let i = 0; i < 4; i++) assert.throws(() => B.verifyPin(T.w, '0000'), (e) => e.code === 'PIN_WRONG');
  assert.throws(() => B.verifyPin(T.w, '0000'), (e) => e.code === 'PIN_LOCKED');
  assert.throws(() => B.verifyPin(T.w, '4826'), (e) => e.code === 'PIN_LOCKED');
  B.bankOf(T.w).pin.lockedUntil = null; // fim do bloqueio
  assert.doesNotThrow(() => B.verifyPin(T.w, '4826'));
});

test('trocar a senha exige a senha atual', () => {
  assert.throws(() => B.setPin(T.w, '7391', '0000'));
  B.bankOf(T.w).pin.fails = 0;
  B.setPin(T.w, '7391', '4826');
  assert.doesNotThrow(() => B.verifyPin(T.w, '7391'));
});

test('débito sem saldo falha e não altera nada', () => {
  const b = B.bankOf(T.w); const before = b.balance; const n = b.history.length;
  assert.throws(() => B.debit(T.w, before + 1, 'teste', new Date()), (e) => e.code === 'FUNDS');
  assert.equal(b.balance, before); assert.equal(b.history.length, n);
});

test('operação com o mesmo identificador roda uma única vez', () => {
  const b = B.bankOf(T.w);
  B.credit(T.w, 100, 'renda de teste', new Date(), 'salario');
  const before = b.balance;
  const op = () => { B.debit(T.w, 10, 'compra única', new Date(), 'compra'); return b.balance; };
  const r1 = B.once(T.w, 'op-unica', op); const r2 = B.once(T.w, 'op-unica', op);
  assert.equal(r1, r2);
  assert.equal(b.balance, before - 10);
});

test('sem renda nem histórico o empréstimo é negado com motivo', () => {
  const w2 = { user: {}, eco: {}, core: {} };
  const p = B.propose(w2, {}, 500, 3);
  assert.equal(p.denied, true);
  assert.ok(p.reasons.length > 0);
});

test('empréstimo: parcelas da tabela Price somam o valor presente e o dinheiro entra na conta', () => {
  const b = B.bankOf(T.w);
  for (let i = 0; i < 14; i++) B.credit(T.w, 300, 'salário', new Date(Date.now() - i * 86400000), 'salario');
  b.score = 650;
  const p = B.propose(T.w, eco(T.w), 1000, 4);
  assert.equal(p.denied, false, JSON.stringify(p.reasons));
  const pv = Array.from({ length: p.periods }, (_, i) => p.installment / (1 + p.rate) ** (i + 1)).reduce((s, x) => s + x, 0);
  assert.ok(Math.abs(pv - p.approved) < 0.05 * p.periods, `valor presente ${pv} ≠ ${p.approved}`);
  const before = b.balance;
  const c = B.contract(T.w, p.id, new Date());
  assert.equal(b.balance, Math.round((before + c.principal) * 100) / 100);
  assert.throws(() => B.contract(T.w, p.id, new Date()), 'a mesma proposta não pode ser contratada duas vezes');
});

test('atraso: multa de 2% uma única vez e juros só a partir do dia seguinte', () => {
  const b = B.bankOf(T.w);
  const c = b.contracts.find((x) => x.status === 'ativo');
  c.autopay = false;
  const inst = c.schedule[0];
  inst.due = new Date(Date.now() - 3600 * 1000).toISOString();
  const base = inst.amount;
  const now = new Date();
  B.dailyBank(T.w, now, eco(T.w)); B.dailyBank(T.w, now, eco(T.w)); B.dailyBank(T.w, now, eco(T.w));
  assert.equal(inst.status, 'atrasada');
  assert.equal(inst.amount, Math.round(base * 1.02 * 100) / 100, 'multa aplicada uma vez, sem juros no mesmo dia');
  const tomorrow = new Date(now.getTime() + 86400000);
  B.dailyBank(T.w, tomorrow, eco(T.w)); B.dailyBank(T.w, tomorrow, eco(T.w));
  const r2 = (v) => Math.round(v * 100) / 100; const fee = r2(base * 1.02);
  assert.equal(inst.amount, r2(fee + fee * 0.01), 'um dia de juros, mesmo rodando duas vezes');
  assert.ok(B.isLate(T.w));
  assert.equal(B.creditLimit(T.w), 0, 'com atraso não há crédito novo');
});

test('pagar o contrato inteiro quita e libera crédito de novo', () => {
  const b = B.bankOf(T.w);
  const c = b.contracts.find((x) => ['ativo', 'inadimplente'].includes(x.status));
  B.credit(T.w, 5000, 'prêmio', new Date(), 'premio');
  B.payContract(T.w, c.id, { all: true });
  assert.equal(c.status, 'quitado');
  assert.equal(B.isLate(T.w), false);
});

test('dívida com a mesma referência nunca é cobrada duas vezes', () => {
  const a = B.addDebt(T.w, { kind: 'multa', amount: 300, desc: 'multa', ref: 'caso-x' });
  const b2 = B.addDebt(T.w, { kind: 'multa', amount: 300, desc: 'multa', ref: 'caso-x' });
  assert.equal(a.id, b2.id);
  assert.equal(B.bankOf(T.w).debts.filter((d) => d.ref === 'caso-x').length, 1);
});
