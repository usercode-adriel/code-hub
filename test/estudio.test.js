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

// ---------------------------------------------------------------- biblioteca de componentes (fase 2)
import fs from 'node:fs';
import { componentesExistentes, buscar, adicionarComponente, componentesDoUsuario } from '../server/estudio-biblioteca.js';

// PNG mínimo válido (2×2 px) para testes de importação
function pngDe(lado, cor = 0) {
  const zlib = require_zlib();
  const crc = (buf) => { let c; const t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let r = 0xffffffff; for (const b of buf) r = t[(r ^ b) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const bloco = (tipo, dados) => { const t = Buffer.from(tipo); const len = Buffer.alloc(4); len.writeUInt32BE(dados.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, dados]))); return Buffer.concat([len, t, dados, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(lado, 0); ihdr.writeUInt32BE(lado, 4); ihdr[8] = 8; ihdr[9] = 6;
  const linha = Buffer.concat([Buffer.from([0]), Buffer.alloc(lado * 4, cor)]);
  const cru = Buffer.concat(Array.from({ length: lado }, () => linha));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bloco('IHDR', ihdr), bloco('IDAT', zlib.deflateSync(cru)), bloco('IEND', Buffer.alloc(0))]);
}
import zlib from 'node:zlib';
const require_zlib = () => zlib;

test('biblioteca existente: metadados completos, ids únicos e arquivos que existem', () => {
  const lista = componentesExistentes();
  assert.ok(lista.length > 50, 'kit inicial carregado');
  assert.equal(new Set(lista.map((c) => c.id)).size, lista.length, 'ids únicos');
  assert.equal(new Set(lista.map((c) => c.hash)).size, lista.length, 'o mesmo arquivo não entra duas vezes');
  for (const c of lista) {
    assert.ok(CATEGORIAS[c.categoria]?.sub[c.sub], `${c.id}: categoria/sub`);
    assert.ok(c.pivo && c.area && c.colisao && Array.isArray(c.conectores) && c.camada, `${c.id}: metadados`);
    assert.ok(fs.existsSync(new URL(`../public${c.arquivo}`, import.meta.url)), `${c.id}: arquivo ${c.arquivo}`);
  }
});

test('busca e filtros: preset separa as perspectivas; texto acha por nome, subcategoria e acento', () => {
  const arq = buscar('u1', { preset: 'arq25d' }); const topo = buscar('u1', { preset: 'topo' });
  assert.ok(arq.every((c) => c.perspectiva !== 'topo') && topo.every((c) => c.perspectiva !== 'arq25d'), 'perspectivas não se misturam');
  assert.ok(topo.some((c) => c.categoria === 'via'), 'a vista superior tem vias');
  assert.ok(!arq.some((c) => c.categoria === 'via'), 'a arquitetônica não oferece vias');
  assert.ok(buscar('u1', { q: 'palmeira' }).every((c) => c.sub === 'palmeira' || /palmeira/.test(c.nome.toLowerCase())));
  assert.ok(buscar('u1', { q: 'CALÇADA' }).length > 0, 'busca sem acento e sem maiúsculas');
  assert.equal(buscar('u1', { q: 'zzzinexistente' }).length, 0);
  assert.ok(buscar('u1', { categoria: 'externo', sub: 'arvore' }).every((c) => c.sub === 'arvore'));
});

test('importação: PNG válido entra uma vez só (dedupe por hash); inválidos são recusados', () => {
  const uid = `teste-${Date.now()}`;
  const meta = { nome: 'Janela azul', categoria: 'fachada', sub: 'janela', perspectiva: 'arq25d', material: 'vidro', origem: 'importado' };
  const a = adicionarComponente(uid, pngDe(16, 90), meta);
  assert.equal(a.duplicado, false); assert.match(a.componente.id, /^u:/); assert.equal(a.componente.w, 16);
  const b = adicionarComponente(uid, pngDe(16, 90), { ...meta, nome: 'Outro nome' });
  assert.equal(b.duplicado, true); assert.equal(b.componente.id, a.componente.id);
  assert.equal(componentesDoUsuario(uid).length, 1, 'não duplicou');
  assert.ok(buscar(uid, { origem: 'importado' }).length === 1);
  assert.throws(() => adicionarComponente(uid, Buffer.from('nao é png'), meta), /PNG/);
  assert.throws(() => adicionarComponente(uid, pngDe(16, 7), { ...meta, sub: 'cruzamento' }), /subcategoria/);
  assert.throws(() => adicionarComponente(uid, pngDe(16, 8), { ...meta, origem: 'existente' }), /origem/);
  assert.throws(() => adicionarComponente(uid, pngDe(16, 9), { ...meta, nome: '' }), /nome/);
  for (const d of ['estudio', 'estudio-arquivos']) fs.rmSync(new URL(`../data/${d}/${uid}`, import.meta.url), { recursive: true, force: true });
});
