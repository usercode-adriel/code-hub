// Mundo: mapa e rotas, compras atômicas, inventário, empréstimo entre amigos, vaquinha fiscalizada e justiça com provas.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { bootWorld } from './helpers.js';

const T = await bootWorld();
after(() => T.cleanup());
const B = await import('../server/world/bank.js');
const M = await import('../server/world/map.js');
const C = await import('../server/world/commerce.js');
const I = await import('../server/world/inventory.js');
const F = await import('../server/world/finance.js');
const J = await import('../server/world/justice.js');
const { people } = await import('../server/world/agents.js');
B.setPin(T.w, '4826');
const money = (v) => B.credit(T.w, v, 'renda de teste', new Date(), 'salario');

test('mapa: todos os lugares têm endereço e há rota entre quaisquer dois', () => {
  const pls = C.places(T.w).filter((p) => p.node != null);
  assert.ok(pls.length >= 40);
  for (const p of pls) assert.ok(p.address, `${p.name} sem endereço`);
  for (const p of pls.slice(1)) {
    const r = M.route(T.w, pls[0].node, p.node);
    assert.ok(r && r.path.length >= 1, `sem rota até ${p.name}`);
    assert.ok(r.meters >= 0 && (r.meters < 400 || r.minutes.pe >= r.minutes.taxi), 'em trajetos longos o táxi é mais rápido que andar');
  }
});

test('mapa: o gerador é determinístico', () => {
  const a = JSON.stringify(M.geoPublic(T.w));
  const b = JSON.stringify(M.geoPublic(T.w));
  assert.equal(a, b);
});

const shop = () => C.places(T.w).find((p) => p.name === 'Mercado Central');
const openAt = (pl) => { const d = new Date(); d.setHours(pl.hours[0] + 1, 0, 0, 0); return d; };

test('compra direta: não exige estar na loja (mas exige senha)', () => {
  const pl = shop();
  assert.throws(() => C.buy({ ...T.ctx(), at: openAt(pl) }, pl, 'cafe', { pin: '0000', opId: 'x0' }), (e) => e.code !== 'NOT_HERE');
});

test('compra sem saldo é atômica: nada muda', () => {
  const pl = shop();
  T.w.user.location = { placeId: pl.id, node: pl.node, at: new Date().toISOString() };
  const b = B.bankOf(T.w);
  b.balance = 0; b.card = null;
  const it = pl.catalog.find((x) => x.key === 'cafe'); it.stock = Math.max(it.stock, 3);
  const stock = it.stock; const invN = I.inv(T.w).length;
  assert.throws(() => C.buy({ ...T.ctx(), at: openAt(pl) }, pl, 'cafe', { pin: '4826', opId: 'x1' }), (e) => e.code === 'FUNDS');
  assert.equal(it.stock, stock); assert.equal(b.balance, 0); assert.equal(I.inv(T.w).length, invN);
});

test('compra com senha errada não cobra', () => {
  const pl = shop(); money(500);
  const before = B.bankOf(T.w).balance;
  assert.throws(() => C.buy({ ...T.ctx(), at: openAt(pl) }, pl, 'cafe', { pin: '0000', opId: 'x2' }));
  assert.equal(B.bankOf(T.w).balance, before);
  B.bankOf(T.w).pin.fails = 0;
});

test('compra repetida com o mesmo identificador cobra uma vez só', () => {
  const pl = shop();
  const b = B.bankOf(T.w); const before = b.balance;
  const it = pl.catalog.find((x) => x.key === 'cafe'); const stock = it.stock;
  const r1 = C.buy({ ...T.ctx(), at: openAt(pl) }, pl, 'cafe', { pin: '4826', opId: 'x3' });
  const r2 = C.buy({ ...T.ctx(), at: openAt(pl) }, pl, 'cafe', { pin: '4826', opId: 'x3' });
  assert.equal(r1.item.id, r2.item.id);
  assert.equal(it.stock, stock - 1);
  assert.equal(Math.round((before - b.balance) * 100) / 100, r1.price);
  assert.equal(I.inv(T.w).filter((x) => x.id === r1.item.id).length, 1);
});

test('loja fechada também vende (compra direta liberada)', () => {
  const pl = shop(); const d = new Date(); d.setHours(4, 0, 0, 0);
  const r = C.buy({ ...T.ctx(), at: d }, pl, 'cafe', { pin: '4826', opId: 'x4' });
  assert.ok(r.item && r.price > 0);
});

test('revender um item tira o dinheiro de quem comprou (não cria dinheiro)', () => {
  const it = I.inv(T.w).find((x) => x.key === 'cafe');
  const sold = { ...it, key: 'smartphone' }; // item revendível
  I.inv(T.w).push({ ...sold, id: 'sp-teste', name: 'Smartphone', price: 1200, history: [] });
  const total = () => people(T.w).reduce((s, p) => s + (p.agent?.cash || 0), 0) + B.bankOf(T.w).balance;
  const before = total();
  I.itemAction(T.ctx(), 'sp-teste', 'vender');
  assert.ok(Math.abs(total() - before) < 0.02, 'o dinheiro só mudou de mãos');
});

test('empréstimo de amigo: quem não te conhece nega', () => {
  const stranger = people(T.w).find((p) => p.agent && !p.friend && !p.agent.user.metAt);
  const r = F.askFriendLoan(T.ctx(), stranger.id, 200, 7);
  assert.equal(r.decision, 'negado');
});

test('empréstimo de amigo: amigo sem dinheiro diz que não tem', () => {
  const p = people(T.w).find((x) => x.agent && x.agent.resident);
  Object.assign(p.agent.user, { aff: 80, trust: 80, bond: 60, metAt: new Date().toISOString() }); p.friend = true;
  p.agent.cash = 50;
  assert.equal(F.askFriendLoan(T.ctx(), p.id, 200, 7).decision, 'sem-dinheiro');
  p.agent.cash = 5000;
  const r = F.askFriendLoan(T.ctx(), p.id, 200, 7);
  assert.ok(['aceito', 'condicoes', 'parcial'].includes(r.decision), r.decision);
  const cashBefore = p.agent.cash; const balBefore = B.bankOf(T.w).balance;
  F.acceptFriendLoan(T.ctx(), r.id);
  assert.equal(Math.round((cashBefore - p.agent.cash) * 100) / 100, r.offer, 'o dinheiro saiu do bolso do amigo');
  assert.equal(Math.round((B.bankOf(T.w).balance - balBefore) * 100) / 100, r.offer);
});

test('justiça: sem provas suficientes o caso é arquivado e ninguém é punido', async () => {
  const debts = B.bankOf(T.w).debts.length;
  const c = J.openCase(T.ctx(), { type: 'furto', suspect: { type: 'user', id: 'me' }, desc: 'boato', evidence: [{ kind: 'boato', desc: 'alguém comentou', strength: 0.1 }] });
  await T.advance(8);
  assert.equal(c.status, 'arquivado');
  assert.equal(B.bankOf(T.w).debts.length, debts);
});

test('justiça: com provas fortes há intimação e depois decisão com multa', async () => {
  const c = J.openCase(T.ctx(), { type: 'furto', suspect: { type: 'user', id: 'me' }, desc: 'flagrante', evidence: [{ kind: 'flagrante', desc: 'câmera', strength: 0.8 }] });
  await T.advance(8);
  assert.equal(c.status, 'intimado');
  J.testify(T.ctx(), c.id, 'confessar');
  await T.advance(30);
  assert.ok(['multa', 'processo', 'condenado'].includes(c.status), c.status);
  if (c.status === 'multa') assert.ok(B.bankOf(T.w).debts.some((d) => d.kind === 'multa' && d.ref === `caso:${c.id}`));
});

test('vaquinha com motivo que não se confirma é bloqueada e devolvida aos doadores', async () => {
  for (const p of people(T.w).filter((x) => x.agent).slice(0, 30)) { p.agent.user.aff = 90; p.agent.cash = Math.max(p.agent.cash, 3000); }
  const v = F.createVaquinha(T.ctx(), { title: 'Cirurgia', motivo: 'saude', goal: 400, pixKey: 'minha-chave' });
  await T.advance(13);
  assert.equal(v.status, 'bloqueada');
  assert.ok(B.bankOf(T.w).blockedItems.every((x) => !String(x.ref || '').includes(v.id)), 'nada fica bloqueado');
  assert.ok(!B.bankOf(T.w).history.some((h) => h.type === 'liberacao' && h.desc.includes('Cirurgia')), 'nenhum valor foi liberado para você');
  assert.ok(J.justice(T.w).cases.some((c) => c.type === 'estelionato' && c.suspect.type === 'user'));
});
