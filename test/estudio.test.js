// STRUCTURE STUDIO: presets coerentes e validação das estruturas (perspectivas não se misturam, limites, tipos)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, CATEGORIAS, GRADE, subcategoriaValida } from '../public/js/estudio/presets.js';
import { validarEstrutura } from '../server/estudio.js';

test('todo preset só lista categorias que existem na biblioteca', () => {
  for (const p of Object.values(PRESETS)) for (const c of p.categorias) assert.ok(CATEGORIAS[c], `${p.id}: categoria ${c}`);
  assert.equal(GRADE, 32);
  assert.ok(subcategoriaValida('fachada', 'janela'));
  assert.ok(!subcategoriaValida('fachada', 'cruzamento'));
});

test('estrutura nova: preset, tipo e área padrão', () => {
  const d = validarEstrutura({ preset: 'arq25d', tipo: 'delegacia' });
  assert.equal(d.preset, 'arq25d'); assert.equal(d.tipo, 'delegacia'); assert.deepEqual(d.area, PRESETS.arq25d.area);
  assert.deepEqual(d.componentes, []);
});

test('recusa preset desconhecido, tipo de outro preset e área fora do limite', () => {
  assert.throws(() => validarEstrutura({ preset: 'xyz' }), /preset/);
  assert.throws(() => validarEstrutura({ preset: 'topo', tipo: 'shopping' }), /tipo inválido/);
  assert.throws(() => validarEstrutura({ preset: 'arq25d', area: { w: 2, h: 10 } }), /área/);
  assert.throws(() => validarEstrutura({ preset: 'arq25d', area: { w: 10, h: 500 } }), /área/);
});

test('o preset de câmera não muda depois de criado', () => {
  const base = { preset: 'arq25d', tipo: 'loja', area: { w: 10, h: 10 }, componentes: [] };
  assert.throws(() => validarEstrutura({ preset: 'topo' }, base), /não pode mudar/);
  assert.equal(validarEstrutura({ tipo: 'casa' }, base).tipo, 'casa');
});
