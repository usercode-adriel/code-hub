// Estruturas do Structure Studio no mundo do jogo: imagem única, colisões, entrada, vagas e dados para simulações futuras
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mundoDoMapa } from '../public/js/mapas/mundo-do-mapa.js';
import { extrasOf } from '../public/js/drive/assets.js';
import { inventarioDeTeste } from './helpers/mapa-teste.js';

const HASH = 'a'.repeat(64);
const prefab = (extra = {}) => ({
  chave: 'estruturas/abc', categoria: 'estruturas', tipo: 'estrutura', nome: 'Delegacia', arquivo: `/estudio-arquivos/u1/${HASH}.png`, w: 160, h: 136,
  estrutura: {
    prefabId: 'abc', estruturaId: 'e1', versao: 1, pegada: { x: -80, y: -48, w: 160, d: 48 },
    colisoes: [{ peca: 'w1', x: -70, y: -30, w: 140, h: 20 }], entradas: [{ id: 'p1', tipo: 'porta', nome: 'Entrada', x: 0, y: -4 }],
    derivada: { vagas: [{ peca: 'v', x: -40, y: 20, w: 40, h: 64 }], caminhavel: [{ peca: 'c', x: -60, y: 0, w: 120, h: 16 }], circulacao: [], conexoes: [{ peca: 'e', tipo: 'escada', x: 50, y: -10, z: 0 }] },
    ...extra,
  },
});
const inv = (p = prefab()) => new Map([...inventarioDeTeste(), [p.chave, p]]);
const mapa = (item = {}) => ({ nome: 'T', largura: 20, altura: 14, celulas: {}, itens: [{ id: 's1', chave: 'estruturas/abc', x: 320, y: 300, rot: 0, dados: { nome: 'Delegacia Central', rota: '#/policia' }, ...item }] });
const solido = (c, x, y) => c.mask[Math.floor(y / c.CS) * c.mw + Math.floor(x / c.CS)] === 0;

test('estrutura: vira um edifício de imagem única, com o pivô no centro da base e a rotação ignorada', () => {
  const c = mundoDoMapa(mapa({ rot: 90 }), inv());
  const b = c.blds.find((x) => x.estrutura === 's1'); assert.ok(b);
  assert.deepEqual([b.spr, b.x, b.y, b.w, b.h], [`x:estudio/u1/${HASH}`, 240, 164, 160, 136], 'sem trocar largura e altura: a imagem tem perspectiva fixa');
  assert.ok(extrasOf(c).includes(`estudio/u1/${HASH}`), 'o motor carrega a imagem sob demanda');
});

test('estrutura: a colisão vem do prefab (e não do retângulo inteiro); sem colisão, a pegada é sólida', () => {
  const c = mundoDoMapa(mapa(), inv());
  assert.ok(solido(c, 300, 280), 'dentro da caixa de colisão'); assert.ok(!solido(c, 200, 280), 'fora da estrutura');
  assert.ok(!solido(c, 260, 255), 'dentro da pegada, mas fora da caixa de colisão: livre');
  const sem = mundoDoMapa(mapa(), inv(prefab({ colisoes: [] })));
  assert.ok(solido(sem, 260, 262), 'sem colisões o prefab usa a pegada inteira');
  const esc = mundoDoMapa(mapa({ escala: 2 }), inv());
  assert.ok(solido(esc, 320 + 120, 300 - 50), 'a colisão acompanha a escala'); assert.equal(esc.blds.find((x) => x.estrutura === 's1').w, 320);
});

test('estrutura: entrada vira ponto de interesse, vagas viram lugares para carros, e sobram dados para simulações futuras', () => {
  const c = mundoDoMapa(mapa(), inv());
  const poi = c.pois.find((x) => x.id === 's1'); assert.deepEqual([poi.label, poi.route, poi.at], ['Delegacia Central', '#/policia', [320, 310]], 'na entrada, um pouco à frente');
  const ult = c.spots.at(-1); assert.deepEqual(ult, [280, 288, -Math.PI / 2], 'a vaga do estacionamento recebe carro'); assert.equal(c.spots.length, 9, 'as 8 vagas padrão continuam');
  const e = c.estruturas[0]; assert.equal(e.prefab, 'abc');
  assert.deepEqual(e.entradas[0], { id: 'p1', tipo: 'porta', nome: 'Entrada', x: 320, y: 296 });
  assert.deepEqual(e.caminhavel[0], { x: 260, y: 300, w: 120, h: 16 }); assert.equal(e.conexoes[0].tipo, 'escada');
});

test('estrutura: sem nome nem rota não cria ponto de interesse; dados faltando ou item desconhecido não quebram', () => {
  assert.equal(mundoDoMapa(mapa({ dados: {} }), inv()).pois.some((x) => x.id === 's1'), false);
  const velho = mundoDoMapa(mapa(), inv({ ...prefab(), estrutura: undefined })); assert.equal(velho.blds.filter((x) => x.estrutura === 's1').length, 1);
  const sumida = mundoDoMapa(mapa({ chave: 'estruturas/naoexiste' }), inv()); assert.equal(sumida.blds.filter((x) => x.estrutura).length, 0);
});
