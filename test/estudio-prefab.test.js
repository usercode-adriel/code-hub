// STRUCTURE STUDIO, prefab: limites da imagem, pegada, colisões, entradas e materiais, tudo relativo ao pivô
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { novaInstancia } from '../public/js/estudio/montagem.js';
import { montarPrefab, limitesDe, MAX_IMAGEM } from '../public/js/estudio/prefab.js';

const comp = (id, sub, w, h, extra = {}) => ({ id, sub, categoria: 'x', camada: extra.camada || 'base', w, h, area: { w: Math.ceil(w / 32), h: 1 }, material: 'concreto', colisao: extra.colisao || { tipo: 'nenhuma' }, perspectiva: 'arq25d', ...extra });
const C = {
  parede: comp('parede', 'parede', 128, 96, { colisao: { tipo: 'caixa', x: -56, y: -16, w: 112, h: 16 } }),
  porta: comp('porta', 'porta', 40, 64, { camada: 'fachada' }), janela: comp('janela', 'janela', 32, 32, { camada: 'fachada', material: 'vidro' }),
  telhado: comp('telhado', 'telhado-plano', 128, 40, { camada: 'cobertura' }), palmeira: comp('palmeira', 'palmeira', 60, 120, { camada: 'externo', colisao: { tipo: 'caixa', x: -6, y: -10, w: 12, h: 10 }, material: 'vegetal' }),
};
const compDe = (id) => C[id];
function montagem() {
  const w = novaInstancia(C.parede, 200, 300); const porta = novaInstancia(C.porta, 200, 300, { anfitriao: w.id, nome: 'Entrada principal' });
  const jan = novaInstancia(C.janela, 240, 300, { anfitriao: w.id, z: 40, material: 'vidro' }); const t = novaInstancia(C.telhado, 200, 300, { anfitriao: w.id, z: 96 });
  const pal = novaInstancia(C.palmeira, 320, 330);
  return { preset: 'arq25d', tipo: 'delegacia', componentes: [w, porta, jan, t, pal], logica: { entradas: [] } };
}

test('prefab: imagem cobre todas as peças, com a altura das que estão empilhadas', () => {
  const est = montagem(); const lim = limitesDe(est.componentes, compDe);
  assert.equal(lim.y0, 300 - 96 - 40 - 0, 'o topo é o telhado (z 96 + 40 de altura)') ;
  assert.ok(lim.x0 <= 200 - 64 && lim.x1 >= 320 + 30, 'inclui a parede e a palmeira');
  assert.ok(lim.y1 >= 330, 'inclui o pé da palmeira');
  const p = montarPrefab(est, compDe);
  assert.equal(p.imagem.w, lim.w); assert.equal(p.imagem.h, lim.h);
  assert.ok(p.imagem.pivo.x > 0 && p.imagem.pivo.x < 1 && p.imagem.pivo.y > 0 && p.imagem.pivo.y <= 1, 'pivô dentro da imagem');
});

test('prefab: pegada, colisões e entradas são relativas ao pivô', () => {
  const p = montarPrefab(montagem(), compDe);
  assert.equal(p.pegada.w >= 128, true, 'a pegada cobre a parede');
  assert.equal(p.entradas.length, 1); assert.equal(p.entradas[0].tipo, 'porta'); assert.equal(p.entradas[0].nome, 'Entrada principal');
  assert.ok(Math.abs(p.entradas[0].x) < 80, 'a porta fica perto do pivô (relativa)');
  assert.equal(p.colisoes.length, 2, 'parede e palmeira têm colisão');
  const off = montarPrefab({ ...montagem(), componentes: montagem().componentes.map((i) => ({ ...i, colisao: false })) }, compDe);
  assert.equal(off.colisoes.length, 0, 'colisão desligada na peça não entra');
});

test('prefab: preserva componentes, camadas, materiais e metadados; entradas manuais entram', () => {
  const est = { ...montagem(), logica: { entradas: [{ id: 'e1', x: 10, y: 20, nome: 'Garagem' }, { id: 'ruim', x: 'a', y: 2 }] } };
  const p = montarPrefab(est, compDe);
  assert.equal(p.componentes.length, 5); assert.deepEqual(p.metadados.materiais.sort(), ['concreto', 'vegetal', 'vidro']);
  assert.ok(p.metadados.camadas.includes('cobertura')); assert.equal(p.metadados.total, 5);
  assert.equal(p.entradas.filter((e) => e.tipo === 'manual').length, 1, 'só entradas válidas');
  assert.equal(p.preset, 'arq25d'); assert.equal(p.tipo, 'delegacia');
});

test('prefab: recusa estrutura vazia, componente sumido e imagem grande demais', () => {
  assert.throws(() => montarPrefab({ preset: 'arq25d', tipo: 'loja', componentes: [] }, compDe), /vazia/);
  const est = montagem(); est.componentes.push(novaInstancia({ ...C.parede, id: 'sumiu' }, 0, 0));
  assert.throws(() => montarPrefab(est, compDe), /biblioteca/);
  const enorme = novaInstancia(C.parede, 100, 100, { n: 24, escala: 4 });
  assert.throws(() => montarPrefab({ preset: 'arq25d', tipo: 'loja', componentes: [enorme] }, compDe), new RegExp(String(MAX_IMAGEM)));
});
