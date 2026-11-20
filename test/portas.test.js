// portas dos veículos: quadro pelo estado da porta e animação das unidades de emergência
import test from 'node:test';
import assert from 'node:assert/strict';
import { quadroDaPorta, chaveDoCarro, avancaPorta } from '../public/js/drive/portas.js';

test('quadro muda com o estado da porta: fechada, meio aberta, aberta', () => {
  assert.equal(quadroDaPorta(0), 0);
  assert.equal(quadroDaPorta(0.3), 0);
  assert.equal(quadroDaPorta(0.5), 1);
  assert.equal(quadroDaPorta(0.7), 2);
  assert.equal(quadroDaPorta(1), 2);
});

test('modelos com porta usam o quadro certo; os demais não mudam', () => {
  assert.equal(chaveDoCarro('city-policia', 0), 'cars/city-policia');
  assert.equal(chaveDoCarro('city-policia', 0.5), 'cars/city-policia-p1');
  assert.equal(chaveDoCarro('city-bombeiros', 1), 'cars/city-bombeiros-p2');
  assert.equal(chaveDoCarro('city-ambulancia', 1), 'cars/city-ambulancia-p2');
  assert.equal(chaveDoCarro('city-taxi', 1), 'cars/city-taxi');
});

test('unidade atendendo abre a porta; ao voltar a porta fecha', () => {
  const u = { job: { phase: 'atendendo' }, door: 0 };
  for (let i = 0; i < 60; i++) avancaPorta(u, 1 / 60);
  assert.equal(u.door, 1);
  u.job.phase = 'voltando';
  for (let i = 0; i < 60; i++) avancaPorta(u, 1 / 60);
  assert.equal(u.door, 0);
});

test('porta abre gradualmente, não de uma vez', () => {
  const u = { job: { phase: 'atendendo' }, door: 0 };
  avancaPorta(u, 1 / 60);
  assert.ok(u.door > 0 && u.door < 0.2, `abriu de uma vez: ${u.door}`);
});
