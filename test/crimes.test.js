import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWorld } from './helpers.js';

const T = await bootWorld();
const C = await import('../server/world/crimes.js');
const { residents } = await import('../server/world/agents.js');
const { justice } = await import('../server/world/justice.js');

test('crime cria inquérito pelo sistema de Justiça e registra na ficha criminal', () => {
  const ctx = T.ctx();
  const p = residents(T.w)[10];
  const r = C.registerCrime(ctx, { tipo: 'agressao', suspeito: p.id, local: 'Centro', witnesses: 2 });
  assert.ok(r.caseId, 'abre inquérito');
  assert.ok(justice(T.w).cases.some((c) => c.id === r.caseId && c.suspect.id === p.id), 'o inquérito aponta o suspeito');
  const f = C.publicSheet(p);
  assert.equal(f.crimes.length, 1); assert.equal(f.crimes[0].tipo, 'agressao');
  assert.equal(f.situacao, 'com antecedentes');
});

test('reincidência em 14 dias é marcada e a ficha conta os antecedentes', () => {
  const ctx = T.ctx();
  const p = residents(T.w)[11];
  C.registerCrime(ctx, { tipo: 'briga', suspeito: p.id, local: 'Praça Central', witnesses: 1 });
  const r2 = C.registerCrime(ctx, { tipo: 'briga', suspeito: p.id, local: 'Praça Central', witnesses: 1 });
  assert.equal(r2.sheet.reincidente, true);
  assert.equal(C.sheetOf(p).reincidencia, 1);
});

test('crime não é registrado para quem não existe', () => {
  assert.equal(C.registerCrime(T.ctx(), { tipo: 'briga', suspeito: 'nao-existe' }), null);
});

test('tipo desconhecido é recusado', () => {
  assert.throws(() => C.registerCrime(T.ctx(), { tipo: 'inventado', suspeito: residents(T.w)[0].id }), /desconhecido/);
});

test('atropelamento criminoso do jogador entra na ficha do próprio jogador, com testemunhas', () => {
  const ctx = T.ctx();
  const vit = residents(T.w)[12];
  const r = C.registerCrime(ctx, { tipo: 'atropelamento_doloso', suspeito: 'me', vitima: vit.id, local: 'Centro', witnesses: 2 });
  assert.ok(r.caseId, 'abre inquérito contra o jogador');
  assert.equal(C.userSheet(T.w).crimes.length, 1, 'a ficha do jogador guarda o crime');
  assert.ok(justice(T.w).cases.some((c) => c.id === r.caseId && c.suspect.type === 'user'), 'suspeito é o jogador');
});

test('sem testemunhas a ocorrência ainda é aberta, mas com provas fracas (a investigação decide)', () => {
  const ctx = T.ctx();
  const r = C.registerCrime(ctx, { tipo: 'dano', suspeito: residents(T.w)[13].id, local: 'Praça Central', witnesses: 0 });
  const c = justice(T.w).cases.find((x) => x.id === r.caseId);
  assert.equal(c.evidence.length, 0, 'nenhuma prova inicial sem testemunhas');
});

test('a lista de fichas da cidade inclui a ficha do jogador', () => {
  const list = C.criminalRecords(T.w);
  assert.ok(list.some((f) => f.user && f.crimes.length >= 1), 'a ficha do jogador aparece na Delegacia');
});
