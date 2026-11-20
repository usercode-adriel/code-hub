import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameAt, lying, rxCell, framesOf, REACTIONS } from '../public/js/drive/reactions.js';
import { RX } from '../public/js/drive/chrmeta.js';
import { existsSync } from 'node:fs';
import { CHR } from '../public/js/drive/chrmeta.js';
import { createCela, ROOM, DOOR } from '../public/js/drive/cela.js';test('reações tocam os quadros desenhados de cada personagem, na ordem, e param no último', () => {
  assert.deepEqual([...REACTIONS].sort(), ['atropelado', 'baleado', 'caido', 'dor', 'ferido', 'morto', 'morto-de-pe', 'morto-sentado', 'quase-morte', 'sangramento']);
  for (const k of Object.keys(CHR)) for (const r of REACTIONS) assert.ok(CHR[k].rx[r] >= 2, `${k}/${r} tem quadros`);
  const n = framesOf('chr/barbudo', 'atropelado'); assert.equal(n, 7);
  const seen = new Set(); for (let t = 0; t < 2; t += 0.01) seen.add(frameAt('atropelado', t, n).i);
  assert.deepEqual([...seen], [0, 1, 2, 3, 4, 5, 6], 'atropelado passa por todos os quadros');
  assert.equal(frameAt('morto', 99, 4).i, 3, 'para no último');
  for (const k of ['atropelado', 'baleado', 'caido', 'ferido', 'sangramento', 'quase-morte']) { assert.ok(!lying(k, 0, 6), `${k} começa de pé`); assert.ok(lying(k, 10, 6), `${k} termina no chão`); }
  assert.equal(frameAt('sentado', 5, 4).i, 0, 'sentado: primeiro quadro do morto sentado');
  assert.equal(frameAt('levantando', 0, 6).i, 5); assert.equal(frameAt('levantando', 9, 6).i, 0);
  assert.equal(rxCell('dor', 2).sy, RX.order.indexOf('dor') * RX.cell[1]);
});

test('todo personagem tem folha de caminhada (7 linhas, com corrida) e de reações', () => {
  for (const k of Object.keys(CHR)) { assert.ok(existsSync(new URL(`../public/assets/rpg/chr/${k}-rx.png`, import.meta.url)), k); assert.equal(CHR[k].rows, 7); }
});

test('personagens: os 11 das folhas animadas, com polícia e enfermeira', () => {
  assert.equal(Object.keys(CHR).length, 11);
  for (const k of ['policial', 'policial2', 'enfermeira', 'barbudo']) assert.ok(CHR[k], k);
  assert.ok(Object.values(CHR).every((v) => v.h === 48 && ['m', 'f'].includes(v.g)));
});



test('cela: o jogador anda dentro, mas a porta está trancada', () => {
  const C = createCela();
  for (let k = 0; k < 200; k++) C.step(0.05, { mx: 0, my: 1 }, k * 50); // anda até a grade
  assert.ok(C.y < ROOM.h - 60, 'não atravessa a grade');
  C.x = DOOR.x + DOOR.w / 2; for (let k = 0; k < 50; k++) C.step(0.05, { mx: 0, my: 1 }, 20000 + k * 50);
  assert.ok(C.y < ROOM.h - 60 && /trancada/.test(C.msg), 'porta trancada');
  for (let k = 0; k < 200; k++) C.step(0.05, { mx: -1, my: 0 }, k); assert.ok(C.x > 0, 'parede da esquerda');
});
