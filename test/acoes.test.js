import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWorld } from './helpers.js';

const T = await bootWorld();
const { executar, REGRAS, DEDUPE_MS } = await import('../server/world/acoes.js');
const I = await import('../server/world/infracoes.js');
const P = await import('../server/world/patrimonio.js');
const { residents } = await import('../server/world/agents.js');
const { account, bankOf } = await import('../server/world/bank.js');
const { detentionOf } = await import('../server/world/blitz.js');
const { justice } = await import('../server/world/justice.js');
const sem = () => () => 0.99; // nunca denuncia
const sempre = () => () => 0; // sempre denuncia
const comDinheiro = (i) => { const rs = residents(T.w).filter((q) => q.agent); const p = rs[i % rs.length]; p.agent.cash = 900; return p; }; // 44 moradores no mundo de teste

test('motor: as três infrações novas estão registradas como regras', () => {
  for (const t of ['furto', 'vandalismo', 'invasao']) assert.ok(REGRAS.has(t), t);
});

test('motor: duplicata dentro da janela é recusada; depois da janela, aceita', () => {
  const ctx = T.ctx(); const p = comDinheiro(40);
  const a = { tipo: 'furto', vitima: p.id, valor: 10, rnd: sem(), local: 'Centro' };
  assert.equal(I.infracao(ctx, a).ok, true);
  const dup = I.infracao(ctx, a); assert.equal(dup.ok, false); assert.equal(dup.motivo, 'duplicada');
  const depois = { ...ctx, at: new Date(ctx.at.getTime() + DEDUPE_MS + 1000) };
  assert.equal(I.infracao(depois, a).ok, true, 'passada a janela, a mesma ação volta a valer');
});

test('motor: condição falsa recusa com o motivo, sem registrar nada', () => {
  const ctx = T.ctx(); const n = T.w.events.length;
  // a população de moradores varia a cada geração: escolhe um com agente (sem depender do índice 41)
  const comAgente = residents(T.w).filter((p) => p.agent); const pobre = comAgente[41 % comAgente.length]; pobre.agent.cash = 0; // sem dinheiro: não há o que furtar
  const r = I.infracao(ctx, { tipo: 'furto', vitima: pobre.id, valor: 10, rnd: sem() });
  assert.equal(r.ok, false); assert.equal(r.motivo, 'condicao');
  assert.ok(r.condicoes.some((c) => c.ok === false), 'mostra qual condição falhou');
  assert.equal(T.w.events.length, n, 'nada entra no histórico');
});

test('motor: quem está detido não pratica nova ação (condição contraditória)', () => {
  const ctx = T.ctx(); const p = comDinheiro(42);
  account(T.w).detention = { until: new Date(Date.now() + 3600000).toISOString(), local: 'Delegacia', motivo: 'teste' };
  const r = I.infracao(ctx, { tipo: 'furto', vitima: p.id, valor: 5, rnd: sem() });
  assert.equal(r.ok, false); assert.equal(detentionOf(T.w) != null, true);
  account(T.w).detention = null;
});

test('motor: toda ação aceita entra no histórico como evento acao-<tipo>', () => {
  const ctx = T.ctx(); const p = comDinheiro(43);
  const r = I.infracao(ctx, { tipo: 'furto', vitima: p.id, valor: 20, rnd: sem(), local: 'Praça' });
  assert.ok(r.ok);
  const ev = T.w.events.find((e) => e.id === r.evento);
  assert.equal(ev.type, 'acao-furto'); assert.equal(ev.data.acao, 'furto');
});

test('furto: transfere o dinheiro do NPC para a conta, limitado ao que ele tem', () => {
  const ctx = T.ctx(); const p = comDinheiro(44); p.agent.cash = 60; const antes = bankOf(T.w).balance;
  const r = I.infracao(ctx, { tipo: 'furto', vitima: p.id, valor: 500, rnd: sem(), local: 'Loja' });
  assert.equal(r.consequencias.find((c) => c.tipo === 'dinheiro').valor, 60, 'não furta além do que existe');
  assert.equal(p.agent.cash, 0); assert.equal(bankOf(T.w).balance - antes, 60);
});

test('furto: sem testemunha não há denúncia; com testemunhas, a ficha registra o furto', () => {
  const ctx = T.ctx(); const p = comDinheiro(45); const crimes = () => T.w.userSheet?.crimes?.filter((c) => c.tipo === 'furto').length || 0;
  const n0 = crimes();
  const r1 = I.infracao(ctx, { tipo: 'furto', vitima: p.id, valor: 10, rnd: sem(), testemunhas: 0 });
  assert.equal(r1.consequencias.find((c) => c.tipo === 'denuncia').feita, false);
  assert.equal(crimes(), n0);
  const q = comDinheiro(46);
  const r2 = I.infracao(T.ctx(), { tipo: 'furto', vitima: q.id, valor: 10, rnd: sempre(), testemunhas: 2 });
  assert.equal(r2.consequencias.find((c) => c.tipo === 'denuncia').feita, true);
  assert.equal(crimes(), n0 + 1, 'entra na ficha');
});

test('probabilidade de denúncia cresce com as testemunhas (1 − (1/2)^n)', () => {
  assert.equal(I.probDenuncia(0), 0); assert.equal(I.probDenuncia(1), 0.5); assert.equal(I.probDenuncia(3), 0.875);
});

test('vandalismo: objeto perde integridade, vira danificado, gera prejuízo em dívida; destruído não é destruído de novo', () => {
  P.registrarObjeto(T.w, 'lixeira-teste-1', 'lixeira');
  const ctx = T.ctx(); const deb = (T.w.justice?.debts || []).length;
  const r = I.infracao(ctx, { tipo: 'vandalismo', objeto: 'lixeira-teste-1', dano: 25, rnd: sem() });
  assert.ok(r.ok); const d = r.consequencias.find((c) => c.tipo === 'dano');
  assert.equal(d.estado, 'danificado'); assert.ok(d.prejuizo > 0);
  assert.ok(d.divida, 'prejuízo vira dívida');
  const r2 = I.infracao(at2(T, 30), { tipo: 'vandalismo', objeto: 'lixeira-teste-1', dano: 100, rnd: sem() });
  assert.ok(r2.ok, 'segundo golpe, 30 s depois, quebra a lixeira: ' + JSON.stringify(r2));
  assert.equal(P.getObj(T.w, 'lixeira-teste-1').estado, 'destruido');
  const r3 = I.infracao(at2(T, 90), { tipo: 'vandalismo', objeto: 'lixeira-teste-1', dano: 10, rnd: sem() });
  assert.equal(r3.ok, false, 'objeto já destruído não é alvo de novo');
  void deb;
});
const at2 = (t, s) => ({ ...t.ctx(), at: new Date(t.ctx().at.getTime() + s * 1000 + 60000) }); // instante deslocado (passado o intervalo de duplicata)

test('estrutura não é destrutível (prédio, parede, rua) e categoria desconhecida é recusada', () => {
  assert.throws(() => P.registrarObjeto(T.w, 'predio-centro-3', 'lixeira'), /estrutural/);
  assert.throws(() => P.registrarObjeto(T.w, 'parede-x', 'lixeira'), /estrutural/);
  assert.throws(() => P.registrarObjeto(T.w, 'coisa', 'categoria-inexistente'), /desconhecida/);
});

test('vandalismo denunciado vai para a ficha; a lixeira destruída deixa de bloquear o caminho', () => {
  P.registrarObjeto(T.w, 'placa-teste-2', 'placa');
  const r = I.infracao(T.ctx(), { tipo: 'vandalismo', objeto: 'placa-teste-2', dano: 200, rnd: sempre(), testemunhas: 3 });
  assert.equal(r.consequencias.find((c) => c.tipo === 'denuncia').feita, true);
  assert.equal(P.bloqueia(P.getObj(T.w, 'placa-teste-2')), false, 'destruída não é mais sólida');
  assert.ok(T.w.userSheet.crimes.some((c) => c.tipo === 'vandalismo'));
});

test('invasão: porta trancada sem chave é invasão; porta aberta não é (acesso permitido)', () => {
  P.registrarPorta(T.w, 'casa-teste-1', { estado: 'trancada', dono: 'outro-morador' });
  P.registrarPorta(T.w, 'casa-teste-2', { estado: 'aberta' });
  const bad = I.infracao(T.ctx(), { tipo: 'invasao', porta: 'casa-teste-1', chave: true, rnd: sem(), testemunhas: 0 });
  assert.equal(bad.ok, false, 'com a chave, entrar não é invasão (acesso permitido)');
  const r = I.infracao(at2(T, 200), { tipo: 'invasao', porta: 'casa-teste-1', rnd: sem(), testemunhas: 0 });
  assert.ok(r.ok, 'trancada e sem chave: invasão');
  const aberta = I.infracao(at2(T, 400), { tipo: 'invasao', porta: 'casa-teste-2', rnd: sem() });
  assert.equal(aberta.ok, false, 'porta aberta não é invasão');
});

test('invasão com alarme sempre gera denúncia', () => {
  P.registrarPorta(T.w, 'loja-alarme', { estado: 'trancada', alarme: true });
  const r = I.infracao(at2(T, 800), { tipo: 'invasao', porta: 'loja-alarme', rnd: sem(), testemunhas: 0 });
  assert.equal(r.consequencias.find((c) => c.tipo === 'denuncia').alarme, true);
  assert.equal(r.consequencias.find((c) => c.tipo === 'denuncia').feita, true);
});

test('portas: estados e entrada (restrita só para quem está na lista; bloqueada para ninguém)', () => {
  P.registrarPorta(T.w, 'escritorio-1', { estado: 'restrita', dono: 'dono-x' });
  P.registrarPorta(T.w, 'deposito-1', { estado: 'bloqueada' });
  assert.equal(P.podeEntrar(T.w, 'escritorio-1', { id: 'me' }).ok, false);
  assert.equal(P.podeEntrar(T.w, 'escritorio-1', { id: 'dono-x' }).ok, true);
  assert.equal(P.podeEntrar(T.w, 'deposito-1', { id: 'dono-x' }).ok, false);
  assert.throws(() => P.registrarPorta(T.w, 'x', { estado: 'girando' }), /inválido/);
});
