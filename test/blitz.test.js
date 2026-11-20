import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWorld } from './helpers.js';
import { schedule, activeAt, createBlitz } from '../public/js/drive/blitz.js';

const T = await bootWorld();
const B = await import('../server/world/blitz.js');
const { account } = await import('../server/world/bank.js');
const expire = () => { account(T.w).detention.until = new Date(Date.now() - 1000).toISOString(); }; // o horário da cela terminou

const SPOTS = [{ id: 'a', name: 'Av. A', at: [0, 0] }, { id: 'b', name: 'Av. B', at: [500, 0] }, { id: 'c', name: 'Av. C', at: [0, 500] }, { id: 'd', name: 'Av. D', at: [900, 900] }];

test('agenda da blitz: mesmos pontos e horários no mesmo dia, 3 por dia, janelas de 2,5 h', () => {
  const a = schedule(SPOTS, 12); const b = schedule(SPOTS, 12); const c = schedule(SPOTS, 13);
  assert.deepEqual(a, b, 'determinística por dia');
  assert.equal(a.length, 3);
  for (const x of a) { assert.ok(x.from >= 6 && x.from < 22); assert.equal(x.to - x.from, 2.5); }
  assert.notDeepEqual(a.map((x) => x.id + x.from), c.map((x) => x.id + x.from), 'outro dia, outra agenda');
  assert.deepEqual(activeAt(a, a[0].from + 1).map((x) => x.id), a.filter((x) => a[0].from + 1 >= x.from && a[0].from + 1 < x.to).map((x) => x.id));
});

test('abordagem: o policial manda parar, o jogador para e o diálogo é aberto', () => {
  let stopped = null; let fled = null; const notes = [];
  const S = createBlitz({ spots: SPOTS, notify: (t) => notes.push(t), onStop: (b) => { stopped = b.id; }, onFlee: (b) => { fled = b.id; }, now: () => 0 });
  S.active = [{ ...SPOTS[0], from: 0, to: 24 }];
  const car = { x: -100, y: 0, v: 20 };
  S.step(car); assert.equal(S.stage.phase, 'sinal'); assert.ok(notes[0].includes('Blitz'));
  car.x = -60; car.v = 0; S.step(car);
  assert.equal(S.stage.phase, 'abordagem'); assert.equal(stopped, 'a'); assert.equal(fled, null);
  S.finish(); assert.equal(S.stage, null);
  S.step({ x: -100, y: 0, v: 20 }); assert.equal(S.stage, null, 'a mesma blitz não para de novo logo em seguida');
});

test('passar direto pela blitz é fuga', () => {
  let fled = null;
  const S = createBlitz({ spots: SPOTS, onFlee: (b) => { fled = b.id; }, now: () => 0 });
  S.active = [{ ...SPOTS[1], from: 0, to: 24 }];
  const car = { x: 400, y: 0, v: 40 };
  S.step(car); assert.equal(S.stage.phase, 'sinal');
  for (const x of [480, 560, 680, 800]) { car.x = x; S.step(car); }
  assert.equal(fled, 'b'); assert.equal(S.stage, null);
});

test('entregar a habilitação regular: liberado, sem multa nem detenção', () => {
  const ctx = T.ctx(); const u = account(T.w); const debts = (u.debts || []).length;
  const r = B.blitzAnswer(ctx, { opcao: 'entregar', local: 'Av. Central', veiculo: 'Carro' });
  assert.equal(r.resultado, 'liberado'); assert.ok(r.fala.length > 5); assert.equal(r.cnh.categoria, 'B');
  assert.equal(B.detentionOf(T.w), null);
  assert.equal((u.debts || []).length, debts);
});

test('não ter habilitação: multa, ocorrência na ficha e cela pelo tempo da detenção (sem saída antes)', () => {
  const ctx = T.ctx();
  const r = B.blitzAnswer(ctx, { opcao: 'sem', local: 'Rodovia Aurora', veiculo: 'Carro' });
  assert.equal(r.resultado, 'preso'); assert.equal(r.multa.amount, B.BLITZ_FINES['sem-habilitacao'].amount);
  const d = B.detentionOf(T.w); assert.ok(d); assert.equal(d.local, 'Delegacia de Aurora'); assert.equal(d.bail, undefined, 'sem fiança');
  assert.ok(new Date(d.until) - Date.now() > 1.9 * B.HOUR_MS, 'duas horas da cidade');
  assert.ok(T.w.userSheet.crimes.some((c) => c.tipo === 'dirigir_sem_habilitacao'), 'entra na ficha criminal');
  assert.ok(T.w.userSheet.prisoes >= 1);
  assert.throws(() => B.blitzAnswer(ctx, { opcao: 'entregar' }), /detido/, 'preso(a) não passa por outra blitz');
  expire(); assert.equal(B.detentionOf(T.w), null, 'cumprido o horário, sai da cela');
});

test('desacato: multa maior, CNH suspensa e 3 h de cela; depois, CNH suspensa também leva à delegacia', () => {
  const ctx = T.ctx();
  const r = B.blitzAnswer(ctx, { opcao: 'desacato', local: 'Boulevard Aurora' });
  assert.equal(r.resultado, 'preso'); assert.equal(r.multa.amount, B.BLITZ_FINES.desacato.amount);
  assert.ok(new Date(r.detention.until) - Date.now() > 2.9 * B.HOUR_MS);
  assert.equal(B.cnhOf(T.w).status, 'suspensa');
  assert.ok(T.w.userSheet.crimes.some((c) => c.tipo === 'desacato'));
  expire();
  const r2 = B.blitzAnswer(ctx, { opcao: 'entregar', local: 'Av. Central' });
  assert.equal(r2.resultado, 'preso', 'habilitação suspensa = dirigir sem habilitação');
  expire();
});

test('estado do mapa informa CNH e detenção (persistente)', async () => {
  const { driveState } = await import('../server/world/drive.js');
  const s = driveState(T.w);
  assert.equal(s.detention, null); assert.ok(['regular', 'suspensa'].includes(s.cnh.status));
});
