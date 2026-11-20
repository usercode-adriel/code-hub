import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWorld } from './helpers.js';
import { createStreet, gz, looksOf, TIMES } from '../public/js/drive/street.js';

const T = await bootWorld();
const R = await import('../server/world/rua.js');
const { residents } = await import('../server/world/agents.js');
const { account, bankOf } = await import('../server/world/bank.js');
const { detentionOf } = await import('../server/world/blitz.js');

// mundo falso: uma calçada reta, pedestres e uma viatura/ambulância que "chega" quando despachada
function fake(n = 24) {
  const path = { pts: [[0, 0], [1000, 0]], cum: [0, 1000], get len() { return 1000; } };
  const lane = { path, edge: {}, from: { id: 'a' }, to: { id: 'b' }, narrow: false, axis: 'H' };
  const world = { lanes: [lane], nodes: {} };
  const peds = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, real: i === 0, name: i === 0 ? 'Ana Lima' : 'Passante', spr: i % 2 ? 'chr/executiva' : 'chr/barbudo', state: 'walk', x: 100 + i * 8, y: 4, a: 0, v: 9, walk: { path }, s: 100 + i * 8, phase: 0 }));
  const units = []; let clock = 0; const posts = [];
  const INC = { create: (type, x, y) => ({ type, x, y, units: [], scene: { active: true } }), dispatch: (kind, inc, opts) => { const u = { kind, x: opts.at?.[0] ?? inc.x, y: opts.at?.[1] ?? inc.y, a: 0, job: { phase: 'indo' }, at: clock }; units.push(u); return u; }, startChase: (lvl, why, me, cb) => { INC.chased = { why, cb }; } };
  const ACC = { S: { actors: [] } };
  const me = { x: 96, y: 4, a: 0, spr: 'chr/barbudo', run: true, moving: true };
  const arrests = [];
  const S = createStreet({ P: { peds }, INC, ACC, world, me, post: async (path, body) => { posts.push([path, body]); return path === 'acusacao' ? { dias: 1, fianca: 900 } : path === 'policial' ? { dias: 2, fianca: 2500 } : { ok: true }; }, ui: { arrest: (x) => arrests.push(x), discuss: (o) => { o.onResult?.({ fala: 'Vou chamar a polícia!', emo: 'irritado', chamaPolicia: true }); } }, rand: () => 0.5, now: () => clock * 1000 });
  // passo: viaturas chegam 8 s depois de despachadas; atores andam instantaneamente até o destino
  const step = (secs) => { for (let k = 0; k < secs * 10; k++) { clock += 0.1; for (const u of units) if (clock - u.at > TIMES.lead - 1) u.job.phase = 'atendendo'; for (const a of ACC.S.actors) if (a.to) { a.x = a.to[0]; a.y = a.to[1]; a.to = null; const f = a.onArrive; a.onArrive = null; f?.(); } S.step(0.1, { x: 100, y: 0, r: 500 }); } };
  return { S, peds, units, posts, step, INC, ACC, arrests, me, clock: () => clock };
}

test('derrubar alguém correndo: um dos três desfechos, roda de 5 a 20 curiosos e registro no servidor', async () => {
  const F = fake(); const v = F.peds[0];
  const sc = F.S.knock(v);
  assert.ok(['inconsciente', 'sangrando', 'morte'].includes(sc.kind)); assert.equal(v.state, 'vitima');
  assert.ok(sc.crowd.length >= 5 && sc.crowd.length <= 20, `roda com ${sc.crowd.length}`);
  assert.ok(sc.dur >= TIMES.minDur && sc.dur <= TIMES.maxDur, 'dura de 3 a 5 min');
  await null; assert.deepEqual(F.posts[0][0], 'queda');
});

test('linha do tempo: ambulância chega ~1 min, polícia ~20 s depois, paradas afastadas; acusação, perseguição e prisão', async () => {
  const F = fake(); const sc = F.S.knock(F.peds[0]);
  F.step(24); assert.equal(F.units.length, 0, 'ninguém antes do envio');
  F.step(41); const amb = F.units.find((u) => u.kind === 'ambulancia'); assert.ok(amb, 'ambulância despachada');
  assert.ok(sc.amb.arrived >= 55 && sc.amb.arrived <= 62, `ambulância chegou em ${sc.amb.arrived?.toFixed(1)} s`);
  F.step(25); const pol = F.units.find((u) => u.kind === 'policia'); assert.ok(pol && sc.pol.arrived >= 75 && sc.pol.arrived <= 82, `polícia em ${sc.pol?.arrived?.toFixed(1)} s`);
  assert.ok(Math.hypot(amb.x - pol.x, amb.y - pol.y) >= 50, 'viaturas afastadas');
  assert.ok(F.ACC.S.actors.some((a) => a.name === 'Enfermeira') && F.ACC.S.actors.some((a) => a.name === 'Policial'), 'enfermeira e policial a pé');
  F.step(30); await null; await null;
  assert.ok(F.posts.some(([p]) => p === 'acusacao'), 'testemunhas acusam e o inquérito é aberto');
  assert.ok(F.INC.chased, 'a polícia persegue'); F.INC.chased.cb('preso'); assert.equal(F.arrests[0].dias, 1, 'pego: 1 dia ou fiança');
  F.step(260); assert.equal(F.S.scenes.length, 0, 'a cena acaba em até 5 min'); assert.equal(F.peds[0].state, 'levado', 'a vítima foi levada');
});

test('esbarrão andando: discussão; se chamar a polícia, a viatura vem e registra a reclamação', async () => {
  const F = fake(); F.me.run = false; const p = F.peds[3];
  F.S.bump(p); assert.equal(p.state, 'discute');
  assert.equal(F.S.complaints.length, 1, 'chamou a polícia'); F.step(40); await null;
  assert.ok(F.posts.some(([path, b]) => path === 'reclamacao' && b.presente), 'policial registrou com o jogador presente');
});

test('esbarrar num policial: agressão a policial, 2 dias ou fiança', async () => {
  const F = fake(); const cop = F.peds[2]; cop.spr = 'chr/policial';
  F.S.knock(cop); await null; await null;
  assert.ok(F.posts.some(([p]) => p === 'policial')); assert.equal(F.arrests[0].dias, 2);
});

test('falas no gênero certo e descrição do culpado', () => {
  assert.equal(gz('{Ele|Ela} caiu', 'f'), 'Ela caiu'); assert.equal(gz('Senhor{|a}?', 'm'), 'Senhor?');
  assert.equal(looksOf('chr/executiva'), 'aquela executiva');
});

test('servidor: queda fere o morador, acusação vai para a ficha; prisão de 1 dia ou fiança', () => {
  const ctx = T.ctx(); const p = residents(T.w)[20]; bankOf(T.w).balance = 10000;
  assert.equal(R.streetIncident(ctx, { resultado: 'sangrando', personaId: p.id, local: 'Centro' }).estado, 'ferido_grave');
  const a = R.streetAccuse(ctx, { resultado: 'sangrando', personaId: p.id, local: 'Centro', testemunhas: 8 });
  assert.equal(a.dias, 1); assert.equal(a.fianca, R.PENAS.sangrando.fianca);
  assert.ok(T.w.userSheet.crimes.some((c) => c.tipo === 'lesao_grave'));
  const r = R.streetArrest(ctx, { opcao: 'cumprir', delegacia: 'Delegacia de Aurora' });
  const d = detentionOf(T.w); assert.ok(d && d.bail === a.fianca && d.dias === 1);
  assert.ok(new Date(d.until) - Date.now() > 23 * 100000, 'um dia da cidade'); void r;
  const before = bankOf(T.w).balance; R.payBail(ctx); assert.equal(detentionOf(T.w), null); assert.equal(before - bankOf(T.w).balance, a.fianca);
});

test('servidor: agressão a policial com fiança; morte; discussão e reclamação', () => {
  const ctx = T.ctx(); bankOf(T.w).balance = 10000;
  assert.equal(R.assaultOfficer(ctx, { local: 'Centro' }).dias, 2);
  assert.equal(R.streetArrest(ctx, { opcao: 'fianca' }).resultado, 'fianca'); assert.equal(detentionOf(T.w), null);
  const p = residents(T.w)[21]; assert.equal(R.streetIncident(ctx, { resultado: 'morte', personaId: p.id }).estado, 'morto');
  const q = residents(T.w)[22]; const x = R.streetDiscuss(ctx, { id: q.id, tone: 'agressiva', situacao: 'esbarrao' }); assert.ok(x.fala.length > 5);
  const c = R.streetComplaint(ctx, { local: 'Centro', presente: true }); assert.equal(c.multa.amount, R.MULTA_PERTURBACAO);
  assert.ok(T.w.userSheet.crimes.some((k) => k.tipo === 'perturbacao'));
  void account;
});
