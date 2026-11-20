// o carro do jogador sobe na calçada (WALK) com velocidade reduzida; postes e grama continuam barrando
import test from 'node:test';
import assert from 'node:assert/strict';
import { stepCar, PHYS } from '../public/js/drive/player.js';
import { buildObst } from '../public/js/drive/obst.js';
import { SOLID, WALK, ROAD, GRASS } from '../public/js/drive/world.js';

// mundo mínimo: máscara 300×200, 1 byte por unidade; `cor(x)` diz o tipo de chão em cada x
function mundo(cor, props = []) {
  const W = 300; const H = 200; const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) mask[y * W + x] = cor(x);
  return { mask, mw: W, cs: 1, ox: 0, oy: 0, W, H, obst: buildObst(props) };
}
const carro = (x) => ({ x, y: 100, a: 0, v: 0, steer: 0, L: 22, W: 12, speed: 1, gear: 'D', health: 100 });
const acelera = { throttle: 1, brake: 0, steer: 0, hand: 0, autoGear: false };
function roda(car, world, segundos, input = acelera) {
  for (let t = 0; t < segundos * 60; t++) stepCar(car, input, world, 1 / 60, []);
  return car;
}

test('carro atravessa a calçada e sai da pista', () => {
  const w = mundo((x) => (x < 120 ? ROAD : WALK)); // pista à esquerda, calçada à direita
  const c = roda(carro(60), w, 3);
  assert.ok(c.x > 130, `carro deveria ter subido na calçada, parou em x=${c.x.toFixed(1)}`);
});

test('na calçada a velocidade máxima é menor que na pista', () => {
  const pista = roda(carro(20), mundo(() => ROAD), 6);
  const calcada = roda(carro(20), mundo(() => WALK), 6);
  assert.ok(calcada.v < pista.v * 0.75, `calçada ${calcada.v.toFixed(1)} não é mais lenta que pista ${pista.v.toFixed(1)}`);
  assert.ok(calcada.v <= PHYS.maxF * 0.5 + 0.5, 'calçada deveria limitar a velocidade pela metade');
});

test('poste na calçada continua barrando o carro', () => {
  const w = mundo(() => WALK, [{ spr: 'poste', x: 150, y: 100, w: 6, h: 12 }]);
  const c = roda(carro(60), w, 4);
  assert.ok(c.x < 148, `carro passou pelo poste: x=${c.x.toFixed(1)}`);
});

test('grama continua fora da rota do carro', () => {
  const w = mundo((x) => (x < 120 ? ROAD : x < 200 ? GRASS : WALK));
  const c = roda(carro(60), w, 4);
  assert.ok(c.x < 120, `carro entrou na grama: x=${c.x.toFixed(1)}`);
});
