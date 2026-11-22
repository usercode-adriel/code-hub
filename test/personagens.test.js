// escolha de personagem: mesma semente = mesmo personagem; camadas na ordem certa; catálogo vazio não quebra
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortear, camadas, ORDEM } from '../public/js/personagens/escolha.js';

const catalogo = {
  corpo: [{ arquivo: 'corpo/humano-masculino/walk.png' }, { arquivo: 'corpo/humano-feminino/walk.png' }],
  cabelo: [{ arquivo: 'cabelo/cabelo-1/walk.png' }, { arquivo: 'cabelo/cabelo-2/walk.png' }, { arquivo: 'cabelo/cabelo-3/walk.png' }],
  'roupa-cima': [{ arquivo: 'roupa-cima/roupa-cima-1/walk.png' }],
  'roupa-baixo': [{ arquivo: 'roupa-baixo/roupa-baixo-1/walk.png' }],
  calcado: [{ arquivo: 'calcado/calcado-1/walk.png' }],
  chapeu: [{ arquivo: 'chapeu/chapeu-1/walk.png' }, { arquivo: 'chapeu/chapeu-2/walk.png' }],
};

test('mesma semente gera o mesmo personagem; semente diferente muda', () => {
  assert.deepEqual(sortear(catalogo, 8421), sortear(catalogo, 8421));
  const nomes = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(sortear(catalogo, i + 1))));
  assert.ok(nomes.size > 10, 'variedade entre sementes');
});

test('camadas saem na ordem de desenho e sem categoria vazia', () => {
  const e = sortear(catalogo, 99);
  const lista = camadas(e);
  const ordem = ORDEM.filter((c) => e[c]).map((c) => e[c]);
  assert.deepEqual(lista, ordem);
  assert.equal(lista[0], e.corpo, 'corpo sempre por baixo');
  assert.ok(!lista.includes(null));
});

test('catálogo sem uma categoria não quebra o sorteio', () => {
  const e = sortear({ corpo: catalogo.corpo }, 5);
  assert.equal(e.cabelo, null);
  assert.ok(e.corpo);
});
