// STRUCTURE STUDIO, montagem: encaixe em anfitrião, nada flutuando, grupos, alinhar, ordem de desenho e diagnóstico
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PASSO, novaInstancia, encaixar, moverComFilhos, agrupar, desagrupar, expandirSelecao, alinhar, ordemDeDesenho, diagnosticar,
  normalizarInstancia, pegada, larguraVisual, eModular, modoDeEncaixe, reencaixarFilhos, clonarCom, removerComFilhos, descendentes,
} from '../public/js/estudio/montagem.js';

const comp = (id, sub, w, h, extra = {}) => ({ id, sub, categoria: 'x', camada: extra.camada || 'base', w, h, area: { w: Math.ceil(w / 32), h: 1 }, colisao: { tipo: 'nenhuma' }, perspectiva: 'arq25d', ...extra });
const C = {
  parede: comp('parede', 'parede', 128, 96), janela: comp('janela', 'janela', 32, 32, { camada: 'fachada' }), porta: comp('porta', 'porta', 40, 64, { camada: 'fachada' }),
  telhado: comp('telhado', 'telhado-plano', 128, 40, { camada: 'cobertura' }), ar: comp('ar', 'ar-condicionado', 24, 24, { camada: 'topo' }), palmeira: comp('palmeira', 'palmeira', 60, 120, { camada: 'externo' }),
};
const compDe = (id) => C[id];
const ctx = (instancias) => ({ instancias, compDe, passo: PASSO, raio: 48 });

function paredeEm(x, y) { return novaInstancia(C.parede, x, y); }

test('peça solta no chão encaixa na grade fina', () => {
  const p = novaInstancia(C.palmeira, 0, 0);
  const r = encaixar(p, C.palmeira, 103, 211, ctx([p]));
  assert.equal(r.modo, 'solo'); assert.equal(r.ok, true); assert.equal(r.x % PASSO, 0); assert.equal(r.y % PASSO, 0);
});

test('janela só encaixa em parede: sem parede não pode flutuar', () => {
  const j = novaInstancia(C.janela, 0, 0);
  const r = encaixar(j, C.janela, 200, 200, ctx([j]));
  assert.equal(r.ok, false); assert.match(r.motivo, /parede/);
  const longe = encaixar(j, C.janela, 900, 900, ctx([j, paredeEm(200, 200)]));
  assert.equal(longe.ok, false, 'longe demais da parede');
});

test('janela encaixa na face da parede, dentro dela e na altura certa', () => {
  const w = paredeEm(200, 200); const j = novaInstancia(C.janela, 0, 0);
  const r = encaixar(j, C.janela, 290, 215, ctx([w, j]));  // um pouco além da borda direita (264) e à frente: puxa para dentro
  assert.equal(r.ok, true); assert.equal(r.modo, 'face'); assert.equal(r.anfitriao, w.id);
  assert.equal(r.y, w.y, 'fica no plano da fachada');
  const p = pegada(w, C.parede);
  assert.ok(r.x >= p.x0 + 16 && r.x <= p.x1 - 16, 'a janela inteira cabe dentro da parede');
  assert.ok(r.z >= 0 && r.z + 32 <= 96, 'a janela não passa do topo da parede');
});

test('porta fica no chão do anfitrião; telhado sobe até o topo; equipamento vai em cima do telhado', () => {
  const w = paredeEm(200, 200);
  const porta = novaInstancia(C.porta, 0, 0);
  assert.equal(encaixar(porta, C.porta, 200, 200, ctx([w, porta])).z, 0);
  const t = novaInstancia(C.telhado, 0, 0);
  const rt = encaixar(t, C.telhado, 200, 200, ctx([w, t]));
  assert.equal(rt.ok, true); assert.equal(rt.modo, 'topo'); assert.equal(rt.z, 96, 'topo da parede');
  Object.assign(t, { x: rt.x, y: rt.y, z: rt.z, anfitriao: rt.anfitriao });
  const ar = novaInstancia(C.ar, 0, 0);
  const ra = encaixar(ar, C.ar, 210, 200, ctx([w, t, ar]));
  assert.equal(ra.ok, true); assert.equal(ra.anfitriao, t.id); assert.ok(ra.z > t.z, 'acima do telhado');
});

test('mover a parede leva janela, telhado e o que está em cima', () => {
  const w = paredeEm(200, 200); const j = novaInstancia(C.janela, 220, 200, { anfitriao: w.id, z: 30 });
  const t = novaInstancia(C.telhado, 200, 200, { anfitriao: w.id, z: 96 }); const ar = novaInstancia(C.ar, 210, 190, { anfitriao: t.id, z: 110 });
  const outra = paredeEm(800, 800);
  const todos = [w, j, t, ar, outra];
  const movidos = moverComFilhos(todos, w.id, 64, 32);
  assert.deepEqual([...movidos].sort(), [w.id, j.id, t.id, ar.id].sort());
  assert.deepEqual([j.x, j.y, t.x, ar.x, ar.y], [284, 232, 264, 274, 222]);
  assert.deepEqual([outra.x, outra.y], [800, 800], 'o resto não se mexe');
});

test('agrupar seleciona o grupo todo; desagrupar solta', () => {
  const a = paredeEm(0, 0); const b = paredeEm(200, 0); const c = paredeEm(400, 0);
  const todos = [a, b, c];
  assert.equal(agrupar(todos, [a.id]), null, 'um só não forma grupo');
  const g = agrupar(todos, [a.id, b.id]); assert.ok(g);
  assert.deepEqual([...expandirSelecao(todos, [a.id])].sort(), [a.id, b.id].sort());
  assert.deepEqual([...expandirSelecao(todos, [c.id])], [c.id]);
  desagrupar(todos, [a.id, b.id]); assert.deepEqual([...expandirSelecao(todos, [a.id])], [a.id]);
});

test('alinhar e distribuir usam a pegada das peças', () => {
  const a = paredeEm(100, 100); const b = paredeEm(300, 180); const c = paredeEm(700, 260);
  const todos = [a, b, c]; const ids = new Set(todos.map((i) => i.id));
  alinhar(todos, ids, 'esq', compDe);
  assert.equal(new Set(todos.map((i) => pegada(i, C.parede).x0)).size, 1, 'mesma borda esquerda');
  alinhar(todos, ids, 'base', compDe);
  assert.equal(new Set(todos.map((i) => i.y)).size, 1, 'mesma base');
  const d = paredeEm(0, 100); const e = paredeEm(150, 100); const f = paredeEm(900, 100);
  alinhar([d, e, f], new Set([d.id, e.id, f.id]), 'distribuir-h', compDe);
  const v1 = pegada(e, C.parede).x0 - pegada(d, C.parede).x1; const v2 = pegada(f, C.parede).x0 - pegada(e, C.parede).x1;
  assert.ok(Math.abs(v1 - v2) < 1, 'vãos iguais');
});

test('ordem de desenho: camada, depois profundidade (y maior fica por cima)', () => {
  const t = novaInstancia(C.telhado, 0, 0); const w = paredeEm(0, 0); const p1 = novaInstancia(C.palmeira, 0, 50); const p2 = novaInstancia(C.palmeira, 0, 250);
  const ordem = ordemDeDesenho([t, p2, w, p1]);
  assert.deepEqual(ordem.map((i) => i.comp), ['palmeira', 'palmeira', 'parede', 'telhado']);
  assert.ok(ordem[0].y < ordem[1].y, 'a palmeira de trás vem antes');
});

test('módulos: peça modular cresce repetindo, sem deformar a imagem', () => {
  const w = paredeEm(0, 0); w.n = 3;
  assert.equal(eModular(C.parede), true); assert.equal(eModular(C.janela), false);
  assert.equal(larguraVisual(w, C.parede), 384);
  const j = novaInstancia(C.janela, 0, 0); j.n = 5; assert.equal(larguraVisual(j, C.janela), 32, 'janela não é modular');
  assert.equal(modoDeEncaixe(C.palmeira), 'solo'); assert.equal(modoDeEncaixe(C.janela), 'face'); assert.equal(modoDeEncaixe(C.telhado), 'topo');
});

test('diagnóstico acusa peça flutuando, fora da área, atravessando e componente sumido', () => {
  const area = { w: 10, h: 10 };
  const w = paredeEm(160, 160);
  const ok = novaInstancia(C.janela, 160, 160, { anfitriao: w.id, z: 30 });
  assert.deepEqual(diagnosticar([w, ok], area, 'arq25d', compDe).filter((p) => p.gravidade === 'erro'), []);
  const solta = novaInstancia(C.janela, 160, 160, { z: 30 });
  assert.ok(diagnosticar([w, solta], area, 'arq25d', compDe).some((p) => p.tipo === 'flutuando' && p.id === solta.id));
  const longe = novaInstancia(C.janela, 900, 160, { anfitriao: w.id });
  assert.ok(diagnosticar([w, longe], area, 'arq25d', compDe).some((p) => p.tipo === 'flutuando'));
  const fora = novaInstancia(C.palmeira, 5000, 100);
  assert.ok(diagnosticar([fora], area, 'arq25d', compDe).some((p) => p.tipo === 'fora-da-area'));
  const w2 = paredeEm(180, 160);
  assert.ok(diagnosticar([w, w2], area, 'arq25d', compDe).some((p) => p.tipo === 'atravessando'));
  const g1 = paredeEm(0, 0); const g2 = paredeEm(10, 0); agrupar([g1, g2], [g1.id, g2.id]);
  assert.ok(!diagnosticar([g1, g2], area, 'arq25d', compDe).some((p) => p.tipo === 'atravessando'), 'o mesmo grupo pode se sobrepor');
  const sumida = novaInstancia({ id: 'nao-existe', sub: 'parede', camada: 'base', colisao: { tipo: 'nenhuma' } }, 10, 10);
  assert.ok(diagnosticar([sumida], area, 'arq25d', compDe).some((p) => p.tipo === 'sem-componente'));
  const girada = novaInstancia(C.palmeira, 96, 96, { rot: 45 });
  assert.ok(diagnosticar([girada], area, 'arq25d', compDe).some((p) => p.tipo === 'rotacao'));
});

test('normalizar limita escala, módulos e rotação e recusa cores inválidas', () => {
  const n = normalizarInstancia({ comp: 'a', x: 1.4, y: -3.6, escala: 99, n: 999, rot: -90, cor: 'vermelho', camada: 'xx' });
  assert.equal(n.escala, 4); assert.equal(n.n, 24); assert.equal(n.rot, 270); assert.equal(n.cor, null); assert.equal(n.camada, 'externo');
  assert.equal(normalizarInstancia({ comp: 'a', escala: 0.01 }).escala, 0.25);
  assert.equal(normalizarInstancia({ comp: 'a', cor: '#A1b2C3' }).cor, '#A1b2C3');
});

test('escalar o anfitrião reencaixa os filhos; clonar e apagar levam os encaixados juntos', () => {
  const w = paredeEm(200, 200); const j = novaInstancia(C.janela, 0, 0); Object.assign(j, encaixar(j, C.janela, 200, 200, ctx([w, j])), {});
  j.anfitriao = w.id;
  const t = novaInstancia(C.telhado, 0, 0); Object.assign(t, { anfitriao: w.id, x: 200, y: 200, z: 96 });
  const todos = [w, j, t];
  w.escala = 2; // parede 256 de largura e 192 de altura
  assert.equal(reencaixarFilhos(todos, w.id, compDe), 2);
  assert.equal(t.z, 192, 'o telhado subiu com a parede');
  assert.ok(j.z + 32 <= 192, 'a janela continua dentro da parede nova');
  assert.deepEqual([...descendentes(todos, w.id)].sort(), [j.id, t.id].sort());
  const copias = clonarCom(todos, [w.id], 64, 0);
  assert.equal(copias.length, 3); assert.ok(copias.every((c) => !todos.some((o) => o.id === c.id)), 'ids novos');
  const cw = copias.find((c) => c.comp === 'parede'); assert.ok(copias.filter((c) => c.anfitriao).every((c) => c.anfitriao === cw.id), 'filhos apontam para a cópia');
  const { restantes, removidos } = removerComFilhos([...todos, ...copias], [w.id]);
  assert.equal(removidos, 3); assert.equal(restantes.length, 3, 'a cópia continua');
});

test('diagnóstico: andares empilhados não se atravessam, mas paredes na mesma altura sim', () => {
  const area = { w: 10, h: 10 };
  const terreo = paredeEm(160, 160); const andar1 = novaInstancia(C.parede, 160, 160, { z: 96 });
  assert.ok(!diagnosticar([terreo, andar1], area, 'arq25d', compDe).some((p) => p.tipo === 'atravessando'), 'um andar sobre o outro é válido');
  const dentro = novaInstancia(C.parede, 160, 160, { z: 40 });
  assert.ok(diagnosticar([terreo, dentro], area, 'arq25d', compDe).some((p) => p.tipo === 'atravessando'), 'paredes que se interpenetram em altura são acusadas');
});
