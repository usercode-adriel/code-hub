import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapText, balloonSecs, createTalks } from '../public/js/drive/talk.js';

test('o balão quebra o texto em linhas curtas e preserva as palavras', () => {
  const l = wrapText('Você viu o acidente que aconteceu ali na esquina hoje cedo?', 20);
  assert.ok(l.length >= 3 && l.every((x) => x.length <= 20 || !x.includes(' ')));
  assert.equal(l.join(' '), 'Você viu o acidente que aconteceu ali na esquina hoje cedo?');
  assert.deepEqual(wrapText(''), ['']);
});

test('a duração do balão cresce com o texto e tem limites', () => {
  assert.ok(balloonSecs('oi') < balloonSecs('um texto bem mais longo que o anterior para testar'));
  assert.ok(balloonSecs('x'.repeat(500)) <= 6.5);
  assert.ok(balloonSecs('') >= 2.2);
});

function fakeWorld(n) {
  const peds = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, real: true, state: 'walk', x: 100 + i * 5, y: 100, a: 0, face: 1, pause: 0 }));
  return { peds };
}

test('duas pessoas que se encontram conversam em turnos e voltam a andar no fim', async () => {
  const P = fakeWorld(2);
  const lines = [{ who: 'a', text: 'Oi, tudo bem?', emo: 'feliz' }, { who: 'b', text: 'Tudo ótimo!', emo: 'feliz' }, { who: 'a', text: 'Ótimo.', emo: 'neutro' }];
  let clock = 0; const T = createTalks({ P, request: async () => ({ lines }), now: () => clock, rand: () => 0 });
  const view = { x: 100, y: 100, r: 500 };
  T.scan(2, view); await new Promise((r) => setTimeout(r, 0));
  assert.equal(P.peds[0].state, 'conversa', 'a conversa começou e os dois param');
  const said = []; const seen = new Set();
  for (let k = 0; k < 400; k++) { clock += 33; T.tick(0.033); for (const p of P.peds) if (p.say && !seen.has(p.say)) { seen.add(p.say); said.push(p.say.text); } }
  assert.deepEqual(said, ['Oi, tudo bem?', 'Tudo ótimo!', 'Ótimo.'], 'as falas aparecem na ordem, uma de cada vez');
  assert.ok(P.peds.every((p) => p.state === 'walk' && !p.talk), 'no fim, os dois voltam a andar');
});

test('quem é atropelado (ou sai da conversa) encerra a conversa na hora', async () => {
  const P = fakeWorld(2);
  const lines = [{ who: 'a', text: 'Oi!', emo: 'feliz' }, { who: 'b', text: 'Oi de novo!', emo: 'feliz' }];
  let clock = 0; const T = createTalks({ P, request: async () => ({ lines }), now: () => clock, rand: () => 0 });
  T.scan(2, { x: 100, y: 100, r: 500 }); await new Promise((r) => setTimeout(r, 0));
  assert.equal(P.peds[0].state, 'conversa');
  P.peds[1].state = 'ferido'; // foi atingido por um carro
  T.tick(0.05);
  assert.equal(P.peds[0].state, 'walk', 'o outro volta a andar');
  assert.equal(T.active.length, 0, 'a conversa foi encerrada');
});

test('não conversa quem está fora da área visível, longe demais ou em cooldown', async () => {
  const P = { peds: [{ id: 'x', real: true, state: 'walk', x: 9000, y: 9000, pause: 0 }, { id: 'y', real: true, state: 'walk', x: 9005, y: 9000, pause: 0 }] };
  let calls = 0; const T = createTalks({ P, request: async () => { calls++; return { lines: [{ who: 'a', text: 'x', emo: 'neutro' }] }; } });
  T.scan(2, { x: 100, y: 100, r: 500 });
  assert.equal(calls, 0, 'fora da tela não busca conversa');
});

test('no máximo três conversas ao mesmo tempo na tela', async () => {
  const P = fakeWorld(12);
  const lines = [{ who: 'a', text: 'Oi', emo: 'feliz' }];
  let clock = 0; const T = createTalks({ P, request: async () => ({ lines }), now: () => clock, rand: () => 0 });
  for (let k = 0; k < 40; k++) { T.scan(2, { x: 100, y: 100, r: 500 }); await new Promise((r) => setTimeout(r, 0)); clock += 50000; T.tick(0.02); }
  assert.ok(T.active.length <= 3, `conversas ativas: ${T.active.length}`);
});

test('quem já fez uma pausa (contador levemente negativo) continua podendo conversar', async () => {
  const P = fakeWorld(2); P.peds[0].pause = -0.013; P.peds[1].pause = -0.2;
  const T = createTalks({ P, request: async () => ({ lines: [{ who: 'a', text: 'Oi!' }] }), now: () => 0, rand: () => 0 });
  T.scan(2, { x: 100, y: 100, r: 500 }); await new Promise((r) => setTimeout(r, 0));
  assert.equal(P.peds[0].state, 'conversa');
  const Q = fakeWorld(2); Q.peds[0].pause = 1.5; // parado de verdade: não puxa conversa
  const T2 = createTalks({ P: Q, request: async () => ({ lines: [{ who: 'a', text: 'Oi!' }] }), now: () => 0, rand: () => 0 });
  T2.scan(2, { x: 100, y: 100, r: 500 }); await new Promise((r) => setTimeout(r, 0));
  assert.equal(Q.peds[0].state, 'walk');
});
