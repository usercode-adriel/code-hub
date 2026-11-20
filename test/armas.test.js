import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWorld } from './helpers.js';

const T = await bootWorld();
const A = await import('../server/world/armas.js');
const { residents } = await import('../server/world/agents.js');
const { account } = await import('../server/world/bank.js');
const { executar } = await import('../server/world/acoes.js');
const sem = () => () => 0.99; const sempre = () => () => 0; // geradores injetados (funções)
const comArma = (key = 'w-pistol') => { const u = account(T.w); u.inventory ??= []; if (!u.inventory.some((i) => i.key === key)) u.inventory.push({ id: `it-${key}`, key, name: key }); };
const sem_arma = () => { account(T.w).inventory = (account(T.w).inventory || []).filter((i) => i.key !== 'w-pistol'); };
const vivo = (i) => residents(T.w).filter((q) => q.agent && q.agent.status === 'ativo')[i];

test('tiro: sem a arma no inventário, o motor recusa (posse real)', () => {
  sem_arma(); const r = A.disparar(T.ctx(), { arma: 'w-pistol', alvo: vivo(3).id, acertou: true });
  assert.equal(r.ok, false); assert.ok(r.condicoes.some((c) => c.nome === 'armaNaPosse' && !c.ok));
});

test('tiro: com a arma, acertar aplica ferimento pelo sistema de ferimentos e entra no histórico', () => {
  comArma(); const p = vivo(4);
  const r = A.disparar(T.ctx(), { arma: 'w-pistol', alvo: p.id, acertou: true, dano: 30, testemunhas: 0, rnd: sem() });
  assert.ok(r.ok); const f = r.consequencias.find((c) => c.tipo === 'ferimento');
  assert.equal(f.acertou, true); assert.equal(f.gravidade, 'moderada');
  assert.ok(['ferido', 'ferido_grave', 'internado', 'em_recuperacao'].includes(p.agent.health?.state), `estado: ${p.agent.health?.state}`);
  assert.equal(T.w.events.find((e) => e.id === r.evento).type, 'acao-tiro');
});

test('tiro: cada disparo é um evento próprio (rajada no mesmo alvo não é duplicata)', () => {
  comArma(); const p = vivo(5); const ctx = T.ctx();
  const a = A.disparar(ctx, { arma: 'w-pistol', alvo: p.id, acertou: false, rnd: sem() });
  const b = A.disparar(ctx, { arma: 'w-pistol', alvo: p.id, acertou: false, rnd: sem() });
  assert.ok(a.ok && b.ok, 'as duas ações contam');
});

test('tiro: morto não é alvo de novo; detido não atira', () => {
  comArma(); const p = vivo(6);
  const m = A.disparar(T.ctx(), { arma: 'w-pistol', alvo: p.id, acertou: true, letal: true, rnd: sem() });
  assert.ok(m.ok); assert.equal(p.agent.health.state, 'morto');
  const again = A.disparar(T.ctx(), { arma: 'w-pistol', alvo: p.id, acertou: true, rnd: sem() });
  assert.equal(again.ok, false, 'morto não é alvo de novo');
  account(T.w).detention = { until: new Date(Date.now() + 3600000).toISOString(), local: 'Delegacia', motivo: 'x' };
  const det = A.disparar(T.ctx(), { arma: 'w-pistol', alvo: vivo(7).id, acertou: false, rnd: sem() });
  assert.equal(det.ok, false, 'detido não atira'); account(T.w).detention = null;
});

test('tiro letal com testemunhas vira homicídio na ficha', () => {
  comArma(); const p = vivo(8); const n = (T.w.userSheet?.crimes || []).filter((c) => c.tipo === 'homicidio').length;
  comArma('w-shotgun'); const r = A.disparar(T.ctx(), { arma: 'w-shotgun', alvo: p.id, acertou: true, letal: true, testemunhas: 3, local: 'Praça', rnd: sempre() });
  assert.equal(r.consequencias.find((c) => c.tipo === 'denuncia').crime, 'homicidio');
  assert.equal((T.w.userSheet.crimes.filter((c) => c.tipo === 'homicidio').length), n + 1);
});

test('disparo sem alvo (para o ar) é ouvido: denúncia com chance mínima de 60%', () => {
  comArma(); const r = A.disparar(T.ctx(), { arma: 'w-pistol', alvo: null, acertou: false, testemunhas: 0, rnd: sempre() });
  assert.equal(r.consequencias.find((c) => c.tipo === 'denuncia').feita, true);
  const r2 = A.disparar(T.ctx(), { arma: 'w-pistol', alvo: null, acertou: false, testemunhas: 0, rnd: sem() });
  assert.equal(r2.consequencias.find((c) => c.tipo === 'denuncia').feita, false, 'com a sorte, não é denunciado');
});

test('policial usa a mesma regra sem inventário e sem ficha criminal', () => {
  const n = (T.w.userSheet?.crimes || []).length;
  sem_arma();
  const r = A.disparar(T.ctx(), { ator: 'policia', arma: 'w-pistol', alvo: null, acertou: false, rnd: sempre() });
  assert.equal(r.ok, true, 'policial atira sem depender do inventário do jogador');
  assert.equal(r.consequencias.find((c) => c.tipo === 'denuncia'), undefined, 'tiro policial não gera ficha do jogador');
  assert.equal((T.w.userSheet?.crimes || []).length, n);
});

test('arma desconhecida é recusada', () => { assert.throws(() => A.disparar(T.ctx(), { arma: 'w-bazuca' }), /desconhecida/); });
test('gravidade do ferimento segue o dano', () => { assert.equal(A.gravidadeDe(10), 'leve'); assert.equal(A.gravidadeDe(30), 'moderada'); assert.equal(A.gravidadeDe(50), 'grave'); assert.equal(A.gravidadeDe(10, true), 'morte'); });
void executar;
