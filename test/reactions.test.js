import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameAt, lying, rxCell, REACTIONS, TIMING } from '../public/js/drive/reactions.js';
import { RX } from '../public/js/drive/chrmeta.js';
import { existsSync } from 'node:fs';
import { CHR } from '../public/js/drive/chrmeta.js';
import { createCela, ROOM, DOOR } from '../public/js/drive/cela.js';

test('reações tocam os quadros da folha de referência, na ordem, e param no último', () => {
  assert.deepEqual(REACTIONS.sort(), ['atropelado', 'baleado', 'caido', 'dor', 'ferido', 'morto', 'morto-de-pe', 'morto-sentado', 'quase-morte', 'sangramento']);
  for (const k of REACTIONS) {
    assert.equal(TIMING[k].length, RX.seq[k].n, `${k}: um tempo por quadro da folha`);
    assert.equal(frameAt(k, 0).i, 0); assert.equal(frameAt(k, 30).i, RX.seq[k].n - 1, `${k} termina no último quadro`);
  }
  const seen = new Set(); for (let t = 0; t < 2; t += 0.02) seen.add(frameAt('atropelado', t).i);
  assert.deepEqual([...seen], [0, 1, 2, 3, 4, 5], 'atropelado passa por todos os quadros, em ordem');
  for (const k of ['atropelado', 'baleado', 'caido', 'ferido', 'sangramento', 'quase-morte']) { assert.ok(!lying(k, 0), `${k} começa de pé`); assert.ok(lying(k, 10), `${k} termina no chão`); }
  assert.equal(frameAt('levantando', 0).i, RX.seq.caido.n - 1, 'levantar começa deitado'); assert.equal(frameAt('levantando', 9).i, 0, 'e termina de pé');
  assert.deepEqual(rxCell('dor', 2), { sx: 104, sy: RX.seq.dor.row * 48, w: 52, h: 48 });
});

test('todo personagem tem a folha de reações', () => {
  for (const k of Object.keys(CHR)) assert.ok(existsSync(new URL(`../public/assets/rpg/chr/${k}-rx.png`, import.meta.url)), k);
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
