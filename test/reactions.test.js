import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pose, lying, REACTIONS } from '../public/js/drive/reactions.js';
import { CHR } from '../public/js/drive/chrmeta.js';
import { createCela, ROOM, DOOR } from '../public/js/drive/cela.js';

test('reações da folha de referência: começam de pé e terminam deitado (quem cai)', () => {
  for (const k of ['atropelado', 'baleado', 'caido', 'ferido', 'sangramento', 'quase-morte']) {
    assert.ok(Math.abs(pose(k, 0).rot) < 0.4, `${k} começa de pé`);
    assert.ok(lying(k, 5), `${k} termina deitado`);
  }
  assert.ok(pose('atropelado', 0.35).dy > 4, 'atropelado é arremessado');
  assert.ok(pose('atropelado', 3).blood > 0.9 && pose('caido', 3).blood === 0, 'sangue só onde há ferimento');
  assert.ok(pose('dor', 2).sy < 0.8 && !lying('dor', 2), 'dor: curvado de joelhos, sem deitar');
  assert.ok(Math.abs(pose('levantando', 1).rot) < 0.01, 'levanta no fim');
  assert.equal(REACTIONS.length, 9);
  assert.ok(lying('morto', 0) && lying('levantando', 0), 'morto e levantando já começam deitados');
});

test('personagens novos: folhas 4×4 com papéis do jogo (polícia, saúde, bombeiro, obra) e gênero', () => {
  const roles = new Set(Object.values(CHR).map((v) => v.role));
  for (const r of ['policia', 'saude', 'bombeiro', 'obra', 'entrega', 'executivo', 'idoso', 'civil']) assert.ok(roles.has(r), r);
  assert.ok(CHR.policial && CHR.jovem, 'policial (cenas) e o visual padrão do jogador');
  assert.ok(Object.values(CHR).every((v) => v.h === 48 && ['m', 'f'].includes(v.g)));
  assert.ok(!CHR.heroi && !CHR.mago, 'personagens antigos removidos');
});

test('cela: o jogador anda dentro, mas a porta está trancada', () => {
  const C = createCela();
  for (let k = 0; k < 200; k++) C.step(0.05, { mx: 0, my: 1 }, k * 50); // anda até a grade
  assert.ok(C.y < ROOM.h - 60, 'não atravessa a grade');
  C.x = DOOR.x + DOOR.w / 2; for (let k = 0; k < 50; k++) C.step(0.05, { mx: 0, my: 1 }, 20000 + k * 50);
  assert.ok(C.y < ROOM.h - 60 && /trancada/.test(C.msg), 'porta trancada');
  for (let k = 0; k < 200; k++) C.step(0.05, { mx: -1, my: 0 }, k); assert.ok(C.x > 0, 'parede da esquerda');
});
