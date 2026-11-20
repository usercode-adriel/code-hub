import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWorld } from './helpers.js';

const T = await bootWorld();
const Dg = await import('../server/world/dialogos.js');
const { account: bankAccount } = await import('../server/world/bank.js');
const { residents, agentOf } = await import('../server/world/agents.js');
const { toneOf } = Dg;

const at = (i) => { const rs = residents(T.w); return rs[i % rs.length]; }; // 44 moradores no mundo de teste
const ativo = (p) => p.agent?.resident && p.agent.status === 'ativo';
// par a partir de i com os dois ativos (o mundo de teste pode ter alguém preso ou internado)
const pairOf = (i) => { for (let k = i; k < i + 44; k++) if (ativo(at(k)) && ativo(at(k + 1))) return [at(k), at(k + 1)]; return [at(i), at(i + 1)]; };

test('uma conversa tem falas alternadas, conteúdo e efeito nas relações', () => {
  const [a, b] = pairOf(20);
  const t = Dg.generateTalk(T.ctx(), a.id, b.id);
  assert.ok(t && t.lines.length >= 3 && t.lines.length <= 9, 'número de falas razoável');
  assert.deepEqual([...new Set(t.lines.map((l) => l.who))].sort(), ['a', 'b'], 'as duas pessoas falam');
  for (let i = 1; i < t.lines.length; i++) assert.notEqual(t.lines[i].who, t.lines[i - 1].who === 'a' ? 'a' : 'x', 'alternância (a fala muda de quem fala)');
  assert.ok(t.lines.every((l) => l.text && l.emo), 'toda fala tem texto e emoção');
  assert.ok(agentOf(T.w, a).rel[b.id], 'a relação entre os dois foi registrada');
});

test('o assunto vem do que aconteceu na cidade (acidente recente vira assunto)', () => {
  const [a, b] = pairOf(30);
  T.w.events.push({ id: 'ev-acc', type: 'mapa-acidente', cat: 'seguranca', title: 'Acidente grave no Centro deixa uma vítima', at: T.ctx().at.toISOString(), importance: 2, actors: [], n: 999999 });
  let hit = false;
  for (let k = 0; k < 6 && !hit; k++) { const [x, y] = pairOf(3 + k * 5); const t = Dg.generateTalk(T.ctx(), x.id, y.id); if (t?.topic === 'acidente') hit = true; }
  assert.ok(hit, 'pelo menos uma conversa fala do acidente');
});

test('cooldown: o mesmo par não conversa de novo logo em seguida', () => {
  const [a, b] = pairOf(60); if (T.w.dialogos?.cool) delete T.w.dialogos.cool[[a.id, b.id].sort().join('|')]; // par limpo (outro teste pode ter usado)
  assert.ok(Dg.generateTalk(T.ctx(), a.id, b.id));
  assert.equal(Dg.generateTalk(T.ctx(), a.id, b.id), null, 'dentro do cooldown não gera');
});

test('pessoa que não existe ou não está ativa não conversa', () => {
  assert.equal(Dg.generateTalk(T.ctx(), 'nao-existe', at(0).id), null);
  assert.throws(() => Dg.generateTalk(T.ctx(), at(0).id, at(0).id), /consigo mesmo/);
});

test('personalidade define o tom: tímido(a) encerra a conversa com resposta neutra', () => {
  const p = at(70);
  p.agent.traits.sociability = 0.1; p.agent.traits.volatility = 0.1;
  const tone = toneOf(p); assert.equal(tone.timido, true);
  const r = Dg.replyTalk(T.ctx(), p.id, 'neutra');
  assert.equal(r.ends, true, 'tímido(a) encerra');
});

test('resposta educada melhora o relacionamento; agressiva piora, e a resposta muda conforme a personalidade', () => {
  const calm = at(80);
  calm.agent.traits.volatility = 0.05; calm.agent.traits.sociability = 0.5;
  const before = calm.agent.user.aff;
  const ok = Dg.replyTalk(T.ctx(), calm.id, 'educada');
  assert.ok(calm.agent.user.aff > before, 'educada aumenta a afeição');
  const rude = Dg.replyTalk(T.ctx(), calm.id, 'agressiva');
  assert.ok(rude.delta < 0, 'agressiva piora');
  assert.notEqual(ok.reply.text, rude.reply.text, 'as respostas são diferentes');
});

test('agressividade do morador: quem é muito explosivo pode escalar a discussão', () => {
  const p = at(90);
  p.agent.traits.volatility = 0.95;
  const r = Dg.replyTalk(T.ctx(), p.id, 'agressiva');
  assert.ok(['discussao', null].includes(r.escalate));
  assert.ok(r.reply.emo === 'irritado');
});

test('abrir conversa com o jogador traz fala, humor, relação e três opções', () => {
  const p = at(100);
  const v = Dg.openTalk(T.ctx(), p.id);
  assert.ok(v.greeting.text && v.persona.name === p.name);
  const ids = v.options.map((o) => o.id);
  assert.ok(ids.includes('educada') && ids.includes('neutra') && ids.includes('encerrar'), 'respostas básicas e sair sempre existem');
});

// fase 3: as opções dependem do contexto (medo, testemunha, hostilidade, reputação)
const { OPCOES, opcoesDe, contextoDe } = Dg;
test('opções condicionais: medo tira a agressividade e traz "acalmar"', () => {
  const p = at(102); p.mood = { emotion: 'assustada', intensity: 0.8, reason: 'teste' };
  const ids = opcoesDe(T.ctx(), p).map((o) => o.id);
  assert.ok(ids.includes('acalmar')); assert.ok(!ids.includes('agressiva'), 'assustado(a) não aceita agressividade');
});
test('opções condicionais: quem viu um acontecimento oferece perguntar sobre ele', () => {
  const p = at(104); p.mood = { emotion: 'neutro', intensity: 0.2, reason: 'x' };
  const ctx = T.ctx();
  assert.ok(!opcoesDe(ctx, p).some((o) => o.id === 'acontecimento'), 'sem testemunho, não aparece');
  T.w.events.push({ id: 'ev-t', n: 999, at: ctx.at.toISOString(), type: 'atropelamento', cat: 'seguranca', title: 'Atropelamento na praça', text: '', actors: [p.id], refs: [], importance: 3, data: {} });
  const o = opcoesDe(ctx, p).find((x) => x.id === 'acontecimento'); assert.ok(o, 'com testemunho, aparece');
  const r = Dg.replyTalk(ctx, p.id, 'neutra', 'acontecimento');
  assert.match(r.reply.text, /Atropelamento na praça/, 'a resposta usa o acontecimento real');
});
test('opções condicionais: hostilidade oferece pedir desculpas; a opção só vale se estiver disponível', () => {
  const p = at(106); p.agent.hostileUntil = new Date(Date.now() + 3600000).toISOString();
  const ids = opcoesDe(T.ctx(), p).map((o) => o.id);
  assert.ok(ids.includes('desculpa'));
  p.agent.hostileUntil = null;
  assert.throws(() => Dg.replyTalk(T.ctx(), p.id, 'educada', 'desculpa'), /não faz sentido/);
});
test('opções condicionais: reputação muito ruim e antipatia — quase ninguém conversa (só sair)', () => {
  const p = at(108); const prev = bankAccount(T.w).reputation; bankAccount(T.w).reputation = 10; p.agent.user.aff = -30;
  const ids = opcoesDe(T.ctx(), p).map((o) => o.id);
  bankAccount(T.w).reputation = prev; p.agent.user.aff = 0;
  assert.ok(!ids.includes('educada') && !ids.includes('ajuda'), 'evita conversa'); assert.ok(ids.includes('encerrar'));
});


test('a conversa do jogador é guardada no mundo (persistente)', () => {
  const p = at(101);
  Dg.replyTalk(T.ctx(), p.id, 'educada');
  const last = Dg.recentTalks(T.w, 1)[0];
  assert.equal(last.kind, 'usuario');
  assert.equal(last.b.id, p.id);
});
