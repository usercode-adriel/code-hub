// Commerce Office — assets: ZIP seguro, inspeção de PNG, licenças, importação sem sobrescrever, aquisição com aprovação.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

let A; let Z; let P; let Q; let S;
before(async () => {
  fs.mkdirSync(path.resolve('.tmp-testes'), { recursive: true });
  process.env.DATA_DIR = fs.mkdtempSync(path.join(path.resolve('.tmp-testes'), 'ast-'));
  S = await import('../server/commerce/store.js'); A = await import('../server/commerce/assets.js'); Z = await import('../server/commerce/zip.js');
  P = await import('../server/commerce/png.js'); Q = await import('../server/commerce/aquisicao.js');
  (await import('../server/db.js')).load();
});

// monta um ZIP (método "stored" ou deflate) só para os testes
function criarZip(arquivos, { deflate = false } = {}) {
  const locais = []; const centrais = []; let off = 0;
  for (const [nome, dados] of arquivos) {
    const n = Buffer.from(nome); const c = deflate ? zlib.deflateRawSync(dados) : dados; const crc = zlib.crc32(dados) >>> 0;
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(deflate ? 8 : 0, 8); l.writeUInt32LE(crc, 14); l.writeUInt32LE(c.length, 18); l.writeUInt32LE(dados.length, 22); l.writeUInt16LE(n.length, 26);
    locais.push(l, n, c);
    const e = Buffer.alloc(46); e.writeUInt32LE(0x02014b50, 0); e.writeUInt16LE(20, 4); e.writeUInt16LE(20, 6); e.writeUInt16LE(deflate ? 8 : 0, 10); e.writeUInt32LE(crc, 16); e.writeUInt32LE(c.length, 20); e.writeUInt32LE(dados.length, 24); e.writeUInt16LE(n.length, 28); e.writeUInt32LE(off, 42);
    centrais.push(e, n); off += 30 + n.length + c.length;
  }
  const cd = Buffer.concat(centrais); const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(arquivos.length, 8); fim.writeUInt16LE(arquivos.length, 10); fim.writeUInt32LE(cd.length, 12); fim.writeUInt32LE(off, 16);
  return Buffer.concat([...locais, cd, fim]);
}
const png = (w = 32, h = 32, px) => P.criarPngRGBA(w, h, px);

test('png: lê dimensões e transparência; recusa arquivo que não é PNG', () => {
  const i = P.inspecionarPng(png(64, 32));
  assert.equal(i.largura, 64); assert.equal(i.altura, 32); assert.equal(i.transparencia, true); assert.equal(i.proporcao, 2);
  assert.throws(() => P.inspecionarPng(Buffer.from('GIF89a......')), /não é um PNG/);
  assert.throws(() => P.inspecionarPng(Buffer.concat([png().slice(0, 16), Buffer.alloc(40)])), /inválid/i);
  assert.deepEqual(P.sugerirGrade(128, 64), { quadroL: 64, quadroA: 64, colunas: 2, linhas: 1 });
});

test('zip: extrai só PNG e texto; recusa zip-slip, executáveis, links e protege contra zip-bomb', () => {
  const z = criarZip([['pack/floor.png', png()], ['pack/License.txt', Buffer.from('License: CC0 1.0 Universal')], ['../evil.png', png()], ['/abs.png', png()], ['x\\y.png', png()], ['run.exe', Buffer.from('MZ')], ['script.js', Buffer.from('alert(1)')], ['pack/model.obj', Buffer.from('o x')], ['__MACOSX/._floor.png', png()]], { deflate: true });
  const r = Z.extrairPermitidos(z);
  assert.deepEqual(r.png.map((p) => p.nome), ['pack/floor.png']); assert.equal(r.textos.length, 1);
  const motivos = Object.fromEntries(r.ignorados.map((i) => [i.nome, i.motivo]));
  assert.match(motivos['../evil.png'], /inseguro/); assert.match(motivos['/abs.png'], /inseguro/); assert.match(motivos['x\\y.png'], /inseguro/);
  assert.match(motivos['run.exe'], /executável/); assert.match(motivos['script.js'], /executável/); assert.match(motivos['pack/model.obj'], /não suportado/);
  assert.throws(() => Z.extrairPermitidos(Buffer.from('isso não é um zip, é só texto comprido o bastante')), /ZIP/);
  // zip-bomb: 40 arquivos que, juntos, passam do limite total declarado
  const grande = Buffer.alloc(11 * 1024 * 1024, 7);
  const bomba = criarZip(Array.from({ length: 10 }, (_, k) => [`b${k}.png`, grande]));
  assert.throws(() => Z.extrairPermitidos(bomba, { ler: false }), /passa de/);
});

test('licença: reconhece CC0, CC-BY, CC-BY-NC e não assume nada quando não há evidência', () => {
  assert.equal(A.detectarLicenca('Licensed under Creative Commons CC0').usoComercial, true);
  const by = A.detectarLicenca('License: CC-BY 4.0'); assert.equal(by.tipo, 'CC-BY'); assert.equal(by.atribuicao, true);
  const nc = A.detectarLicenca('CC-BY-NC 3.0'); assert.equal(nc.tipo, 'CC-BY-NC'); assert.equal(nc.usoComercial, false);
  assert.equal(A.detectarLicenca('free to use, enjoy!').usoComercial, 'desconhecido');
});

test('asset studio: importa PNG, guarda origem e licença, não duplica e não sobrescreve; edita só o manifesto', () => {
  const dados = png(64, 64, [10, 20, 30, 255]);
  const r = A.importarPng('a1', { dados, nome: 'office-desk.png', origem: 'upload', autor: 'Eu', licenca: { tipo: 'CC0', usoComercial: true, atribuicao: false } });
  assert.equal(r.asset.categoria, 'moveis'); assert.equal(r.asset.largura, 64); assert.equal(r.asset.perspectiva, 'isometrica');
  assert.ok(A.importarPng('a1', { dados, nome: 'outro-nome.png' }).duplicado, 'mesmo conteúdo não entra duas vezes');
  const arq = A.arquivoDe('a1', r.asset); const antes = fs.readFileSync(arq);
  A.atualizarMetadados('a1', r.asset.id, { nome: 'Mesa', escala: 2, ancora: { x: 0.5, y: 0.9 }, camada: 'mobiliario', colisao: { solida: true, larguraTiles: 2, profundidadeTiles: 1 }, categoria: 'moveis' });
  assert.ok(fs.readFileSync(arq).equals(antes), 'o arquivo original não foi tocado');
  assert.equal(A.obter('a1', r.asset.id).colisao.larguraTiles, 2);
  assert.throws(() => A.atualizarMetadados('a1', r.asset.id, { frames: { quadroL: 9999, quadroA: 1 } }), /Tamanho de quadro/);
  S.area('a1').layouts.push({ id: 'l', objetos: [{ assetId: r.asset.id }] });
  assert.throws(() => A.remover('a1', r.asset.id), /em uso/);
});

test('asset studio: importa ZIP com licença detectada; ignora o que não presta', () => {
  const z = criarZip([['tiles/floor_wood.png', png(64, 32, [1, 2, 3, 255])], ['tiles/wall_white.png', png(64, 64, [9, 9, 9, 255])], ['README.txt', Buffer.from('CC-BY 4.0 — Autor X')], ['setup.exe', Buffer.from('MZ')]]);
  const r = A.importarZip('a2', z, { origem: 'upload-zip', pacote: 'pack.zip' });
  assert.equal(r.criados, 2); assert.equal(r.licenca.tipo, 'CC-BY'); assert.equal(r.ignorados.length, 1);
  const cats = A.listar('a2').map((a) => a.categoria).sort(); assert.deepEqual(cats, ['paredes', 'pisos']);
  assert.ok(A.listar('a2').every((a) => a.licenca.tipo === 'CC-BY' && a.pacote === 'pack.zip'));
  assert.throws(() => A.importarZip('a2', criarZip([['a.txt', Buffer.from('x')]])), /nenhum PNG/);
});

test('aquisição: só hosts permitidos (também no redirecionamento); aprovação obrigatória; licença não comercial é recusada', async () => {
  assert.equal(Q.hostPermitido('https://kenney.nl/assets'), true); assert.equal(Q.hostPermitido('https://x.itch.io/pack'), true);
  assert.equal(Q.hostPermitido('http://kenney.nl/a.zip'), false, 'só https'); assert.equal(Q.hostPermitido('https://kenney.nl.evil.com/a.zip'), false); assert.equal(Q.hostPermitido('https://evil.com/a.zip'), false);
  assert.equal(Q.linksDeBusca('office').length, 4);
  const zipCC0 = criarZip([['a/floor.png', png(64, 32, [5, 5, 5, 255])], ['a/License.txt', Buffer.from('Creative Commons Zero, CC0')]]);
  const zipNC = criarZip([['a/x.png', png(32, 32, [6, 6, 6, 255])], ['a/License.txt', Buffer.from('CC-BY-NC 4.0')]]);
  const zipSem = criarZip([['a/y.png', png(32, 32, [7, 7, 7, 255])]]);
  const resposta = (buf) => async () => ({ ok: true, status: 200, headers: { get: () => null }, body: [buf] });
  await assert.rejects(() => Q.analisar('q1', { url: 'https://evil.com/p.zip', fetchImpl: resposta(zipCC0) }), /não permitido/);
  const redireciona = async () => ({ ok: false, status: 302, headers: { get: (h) => (h === 'location' ? 'https://evil.com/p.zip' : null) } });
  await assert.rejects(() => Q.analisar('q1', { url: 'https://kenney.nl/p.zip', fetchImpl: redireciona }), /não permitido/);

  const a = await Q.analisar('q1', { url: 'https://kenney.nl/p.zip', fetchImpl: resposta(zipCC0) });
  assert.equal(a.tipo, 'pacote'); assert.equal(a.estado, 'aguardando_aprovacao'); assert.equal(a.licenca.tipo, 'CC0'); assert.equal(a.previa.length, 1);
  assert.equal(A.listar('q1').length, 0, 'analisar não importa nada');
  const ok = Q.aprovar('q1', a.id, {});
  assert.equal(ok.criados, 1); assert.equal(A.listar('q1')[0].origem, 'https://kenney.nl/p.zip');
  assert.throws(() => Q.aprovar('q1', a.id, {}), /já está/);

  const nc = await Q.analisar('q1', { url: 'https://kenney.nl/nc.zip', fetchImpl: resposta(zipNC) });
  assert.throws(() => Q.aprovar('q1', nc.id, { confirmarLicenca: true }), /não permite uso comercial/);
  const sem = await Q.analisar('q1', { url: 'https://kenney.nl/sem.zip', fetchImpl: resposta(zipSem) });
  assert.throws(() => Q.aprovar('q1', sem.id, {}), /não foi identificada/);
  assert.equal(Q.aprovar('q1', sem.id, { confirmarLicenca: true }).criados, 1);
  assert.equal(A.listar('q1').find((x) => x.nome === 'y').licenca.confirmadaPeloUsuario, true);
  const rej = await Q.analisar('q1', { url: 'https://kenney.nl/p2.zip', fetchImpl: resposta(criarZip([['b.png', png(32, 32, [8, 8, 8, 255])]])) });
  assert.equal(Q.rejeitar('q1', rej.id).estado, 'rejeitada');
  const pagina = async () => ({ ok: true, status: 200, headers: { get: () => null }, body: [Buffer.from('<html><body>License: CC0. <a href="/dl/pack.zip">download</a> <a href="https://evil.com/x.zip">x</a></body></html>')] });
  const pg = await Q.analisar('q1', { url: 'https://kenney.nl/assets/pack', fetchImpl: pagina });
  assert.equal(pg.tipo, 'pagina'); assert.deepEqual(pg.pacotes, ['https://kenney.nl/dl/pack.zip']); assert.equal(pg.licenca.tipo, 'CC0');
});
