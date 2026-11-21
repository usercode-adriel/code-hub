import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateCity } from '../public/js/drive/mundo.js';
import { buildGraph, SOLID } from '../public/js/drive/world.js';
import * as W from '../public/js/drive/weapons.js';

const city = generateCity();
const world = buildGraph(city.R);
Object.assign(world, { mask: city.mask, cs: 4, mw: city.mw, ox: city.ox, oy: city.oy, bounds: city.bounds });
// parede de teste: todo ponto com x entre 500 e 510 é sólido (linha vertical)
const parede = (x) => (y, xx) => xx > 500 && xx < 510 && y !== undefined;
const bloq = (x) => x > 40 && x < 50; // parede vertical de teste entre x=40 e x=50
void parede; void SOLID;

test('mira automática: escolhe o alvo válido mais próximo (não o primeiro da lista)', () => {
  const far = { id: 'longe', x: 150, y: 0 }; const near = { id: 'perto', x: 60, y: 0 };
  const best = W.alvoMaisProximo(world, { x: 0, y: 0 }, 200, [far, near], () => false);
  assert.equal(best.id, 'perto');
});

test('mira automática: alvo fora do alcance ou atrás de parede não é escolhido', () => {
  const alem = { id: 'alem', x: 300, y: 0 }; const atras = { id: 'atras', x: 80, y: 0 };
  assert.equal(W.alvoMaisProximo(world, { x: 0, y: 0 }, 200, [alem], () => false), null, 'fora do alcance');
  assert.equal(W.alvoMaisProximo(world, { x: 0, y: 0 }, 200, [atras], bloq), null, 'parede no meio');
});

test('linha de visão: parede sólida bloqueia; caminho livre não', () => {
  assert.equal(W.linhaLivre(world, 0, 0, 100, 0, bloq), false);
  assert.equal(W.linhaLivre(world, 0, 0, 100, 0, () => false), true);
});

test('disparo: mira automática no alvo; sem alvo segue a direção do olhar', () => {
  const S = W.createWeapons({ world, bloqueado: () => false }); S.equipar('w-pistol');
  const r = S.disparar({ dono: 'me', x: 0, y: 0, a: 0, candidatos: [{ id: 'p1', x: 0, y: 80 }] });
  assert.equal(r.alvo, 'p1');
  const t = S.tiros[0]; assert.ok(Math.abs(t.vx) < 1e-6 && t.vy > 0, 'o projétil vai para o alvo (para baixo)');
  const S2 = W.createWeapons({ world, bloqueado: () => false }); S2.equipar('w-pistol');
  S2.disparar({ dono: 'me', x: 0, y: 0, a: Math.PI, candidatos: [] });
  assert.ok(S2.tiros[0].vx < 0, 'sem alvo, segue a direção do olhar');
});

test('munição: pente diminui; vazio recusa; recarga repõe depois do tempo da arma', () => {
  const S = W.createWeapons({ world, bloqueado: () => false }); S.equipar('w-revolver'); // pente de 6
  for (let k = 0; k < 6; k++) { S.disparar({ dono: 'me', x: 0, y: 0, a: 0, candidatos: [] }); S.cad = 0; }
  assert.equal(S.pente, 0);
  assert.equal(S.disparar({ dono: 'me', x: 0, y: 0, a: 0 }).ok, false, 'vazio não atira');
  S.recarregar(); S.passo(2.1, { on: {} });
  assert.equal(S.pente, 6, 'recarregou');
});

test('cadência: não atira duas vezes dentro do intervalo da arma', () => {
  const S = W.createWeapons({ world, bloqueado: () => false }); S.equipar('w-pistol');
  assert.equal(S.disparar({ dono: 'me', x: 0, y: 0, a: 0 }).ok, true);
  assert.equal(S.disparar({ dono: 'me', x: 0, y: 0, a: 0 }).motivo, 'cadencia');
  S.passo(0.4, { on: {} }); assert.equal(S.disparar({ dono: 'me', x: 0, y: 0, a: 0 }).ok, true);
});

test('projétil: para na parede (não atravessa) e acerta a primeira pessoa no caminho', () => {
  const S = W.createWeapons({ world, bloqueado: bloq }); S.equipar('w-ak');
  S.tiros.push({ dono: 'me', x: 0, y: 0, vx: 400, vy: 0, percorrido: 0, alcance: 1000, dano: 40, alvo: null, vida: 3 });
  let bateu = null; S.passo(0.5, { on: { parede: (t) => { bateu = 'parede'; } } });
  assert.equal(bateu, 'parede'); assert.equal(S.tiros.length, 0, 'o projétil não continua do outro lado');
  const S2 = W.createWeapons({ world, bloqueado: () => false }); S2.equipar('w-ak');
  S2.tiros.push({ dono: 'me', x: 0, y: 0, vx: 400, vy: 0, percorrido: 0, alcance: 1000, dano: 40, alvo: null, vida: 3 });
  const pessoas = [{ id: 'npc', x: 60, y: 0 }]; let hit = null;
  S2.passo(0.5, { pessoas, on: { pessoa: (p) => { hit = p.id; } } });
  assert.equal(hit, 'npc');
});

test('projétil: alcance limitado (acaba sozinho) e carro é atingido pelo retângulo', () => {
  const S = W.createWeapons({ world, bloqueado: () => false }); S.equipar('w-pistol');
  S.tiros.push({ dono: 'me', x: 0, y: 0, vx: 300, vy: 0, percorrido: 0, alcance: 40, dano: 30, alvo: null, vida: 3 });
  S.passo(0.5, { on: {} }); assert.equal(S.tiros.length, 0, 'alcance esgotado');
  const S2 = W.createWeapons({ world, bloqueado: () => false }); S2.equipar('w-pistol');
  S2.tiros.push({ dono: 'me', x: 0, y: 0, vx: 300, vy: 0, percorrido: 0, alcance: 200, dano: 30, alvo: null, vida: 3 });
  let carro = null; S2.passo(0.5, { carros: [{ id: 'c1', x: 40, y: 0, a: 0, L: 22, W: 12 }], on: { carro: (c) => { carro = c.id; } } });
  assert.equal(carro, 'c1');
  assert.equal(W.ponteNoCarro({ x: 0, y: 0, a: 0, L: 22, W: 12 }, { x: 15, y: 5 }), false, 'fora da largura');
});

test('escopeta solta vários projéteis em leque', () => {
  const S = W.createWeapons({ world, bloqueado: () => false, rand: () => 0.5 }); S.equipar('w-shotgun');
  S.disparar({ dono: 'me', x: 0, y: 0, a: 0 }); assert.equal(S.tiros.length, 5);
});

test('policial: a mesma mira automática (alvo mais próximo) vale para a viatura', () => {
  const S = W.createWeapons({ world, bloqueado: () => false }); S.equipar('w-pistol');
  const r = S.disparar({ dono: 'policia', x: 0, y: 0, a: 0, candidatos: [{ id: 'jogador', x: 0, y: 120 }, { id: 'npc', x: 60, y: 0 }] });
  assert.equal(r.alvo, 'npc', 'mira no mais próximo, mesmo que seja um NPC');
});

test('polícia: o tiro atinge o jogador (alvo) e não acerta a própria viatura de origem', () => {
  const S = W.createWeapons({ world, bloqueado: () => false });
  const viatura = { id: 'vt', x: 0, y: 0, a: 0, L: 23, W: 12 };
  const r = S.tiroDirecto({ dono: 'policia', x: 0, y: 0, a: 0, candidatos: [{ id: 'me', x: 80, y: 0 }], alcance: 170, vel: 320, dano: 22, erro: 0, origem: viatura });
  assert.equal(r.alvo, 'me');
  let atingido = null;
  S.passo(0.5, { carros: [viatura], alvos: [{ id: 'me', x: 80, y: 0 }], on: { alvo: (q, t) => { atingido = [q.id, t.dano]; }, carro: () => { throw new Error('acertou a própria viatura'); } } });
  assert.deepEqual(atingido, ['me', 22]);
});
