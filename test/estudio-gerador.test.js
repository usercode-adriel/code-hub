// STRUCTURE STUDIO, gerador por IA de imagem: prompt, capacidades declaradas, remoção de fundo, e o servidor com um OpenRouter falso
import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import {
  montarPromptImagem, capacidadesDoModelo, geraImagem, temAlfaNativo, corDoFundo, removerFundo, recortar, prepararAsset, MAX_REFERENCIAS,
} from '../public/js/estudio/gerador.js';
import { listarModelos, limparCacheModelos, gerarImagens, imagensDaResposta, lerPendentes, aprovarPendente } from '../server/estudio-gerador.js';
import { componentesDoUsuario } from '../server/estudio-biblioteca.js';

const CHAVE = 'sk-or-chave-de-teste-1234567890123456';
const UID = `teste-gen-${Date.now()}`;
const guardada = process.env.OPENROUTER_API_KEY; process.env.OPENROUTER_API_KEY = CHAVE;
after(() => { if (guardada === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = guardada; for (const d of ['estudio', 'estudio-arquivos']) fs.rmSync(new URL(`../data/${d}/${UID}`, import.meta.url), { recursive: true, force: true }); });
beforeEach(() => limparCacheModelos());

function png(w, h, cor = [90, 120, 200]) {
  const crcTab = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcTab[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const bloco = (tipo, d) => { const t = Buffer.from(tipo); const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, d]))); return Buffer.concat([len, t, d, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const linha = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [...cor, 255]).flat())]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bloco('IHDR', ihdr), bloco('IDAT', zlib.deflateSync(Buffer.concat(Array.from({ length: h }, () => linha)))), bloco('IEND', Buffer.alloc(0))]);
}

// ---------------------------------------------------------------- módulo puro
test('prompt: padrão visual do jogo, câmera do preset, dica da peça e o papel de cada referência na ordem enviada', () => {
  const p = montarPromptImagem({ descricao: 'janela azul de vidro fumê', sub: 'janela', categoria: 'fachada', perspectiva: 'arq25d', referencias: [{ tipo: 'perspectiva' }, { tipo: 'material' }, { tipo: 'estilo' }, { tipo: 'composicao' }] });
  assert.match(p, /janela azul de vidro fumê/); assert.match(p, /NOT cartoon, NOT pixel art, NOT low-poly/); assert.match(p, /magenta/); assert.match(p, /Elevated camera/); assert.match(p, /single window module/);
  assert.match(p, /Image 1: perspectiva reference \(match this camera angle/); assert.match(p, /Image 2: material reference/); assert.match(p, /Image 3: estilo arquitetônico reference/); assert.match(p, /Image 4: composição reference/);
  const topo = montarPromptImagem({ descricao: 'rua', sub: 'reta', categoria: 'via', perspectiva: 'topo' }); assert.match(topo, /top-down orthographic/); assert.ok(!/Reference images/.test(topo), 'sem referências, sem a seção');
});

test('capacidades: lê o que o OpenRouter declara e deixa o resto como desconhecido', () => {
  const a = capacidadesDoModelo({ id: 'a/img', name: 'Img', architecture: { input_modalities: ['text', 'image'], output_modalities: ['image', 'text'] } });
  assert.deepEqual([a.geraImagem, a.aceitaReferencia, a.multiplasReferencias, a.transparencia], [true, true, null, null]);
  const b = capacidadesDoModelo({ id: 'b/txt', architecture: { input_modalities: ['text'], output_modalities: ['text'] } }); assert.deepEqual([b.geraImagem, b.aceitaReferencia], [false, false]);
  const c = capacidadesDoModelo({ id: 'c/velho', architecture: { modality: 'text+image->text+image' } }); assert.deepEqual([c.geraImagem, c.aceitaReferencia], [true, true]);
  const d = capacidadesDoModelo({ id: 'd/nada' }); assert.deepEqual([d.geraImagem, d.aceitaReferencia], [null, null]); assert.equal(geraImagem({ id: 'd/nada' }), false, 'desconhecido não conta como gerador');
  assert.equal(MAX_REFERENCIAS, 4);
});

// imagem sintética: fundo magenta com leve ruído, objeto cinza 8×8 no centro com um pixel magenta DENTRO dele
function cena(w = 24, h = 24, { fundo = [255, 0, 255] } = {}) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; const ruido = (x * 7 + y * 3) % 9 - 4; px.set([fundo[0] + ruido, fundo[1] + Math.abs(ruido), fundo[2] - Math.abs(ruido), 255], i); }
  for (let y = 8; y < 16; y++) for (let x = 8; x < 16; x++) px.set([120, 120, 130, 255], (y * w + x) * 4);
  px.set([255, 0, 255, 255], (11 * w + 11) * 4);
  return px;
}
test('fundo: remove só o que toca a borda; o objeto e o magenta de dentro dele ficam; recorta justo', () => {
  const w = 24; const h = 24; const px = cena(w, h);
  assert.equal(temAlfaNativo(px), false); const fundo = corDoFundo(px, w, h); assert.ok(Math.abs(fundo[0] - 255) < 8 && fundo[1] < 12 && Math.abs(fundo[2] - 255) < 12, 'estima o fundo mesmo com ruído');
  const r = removerFundo(px, w, h);
  assert.equal(r.rgba[3], 0, 'o canto ficou transparente'); assert.equal(r.rgba[(12 * w + 12) * 4 + 3], 255, 'o centro do objeto continua opaco');
  assert.equal(r.rgba[(11 * w + 11) * 4 + 3], 255, 'o magenta isolado dentro do objeto não foi apagado');
  assert.equal(r.removidos, w * h - 64, 'todo o fundo conectado, e só ele');
  const c = recortar(r.rgba, w, h, { folga: 1 }); assert.deepEqual([c.w, c.h], [10, 10]);
  assert.equal(recortar(new Uint8ClampedArray(16), 2, 2), null, 'imagem vazia');
});

test('preparar: usa a transparência nativa quando existe, avisa quando o fundo não é chapado e recusa fundo que ocupa tudo', () => {
  const w = 24; const h = 24;
  const ok = prepararAsset(cena(w, h), w, h); assert.equal(ok.info.transparencia, 'removida'); assert.equal(ok.w, 12); assert.equal(ok.h, 12);
  const nativa = cena(w, h); for (let i = 0; i < w * h; i++) if (i % 3 !== 0) nativa[i * 4 + 3] = 0;
  const n = prepararAsset(nativa, w, h); assert.equal(n.info.transparencia, 'nativa'); assert.equal(n.info.removidos, 0, 'não mexeu em quem já veio transparente');
  const tudo = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) tudo.set([255, 0, 255, 255], i * 4);
  assert.match(prepararAsset(tudo, w, h).erro, /fundo ocupou/);
  const ruido = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) ruido.set([(i * 53) % 256, (i * 97) % 256, (i * 29) % 256, 255], i * 4);
  assert.match(prepararAsset(ruido, w, h).info.aviso || '', /fundo não parece/);
});

// ---------------------------------------------------------------- servidor, com um OpenRouter falso
const MODELOS = { data: [
  { id: 'x/texto', name: 'Só texto', architecture: { input_modalities: ['text'], output_modalities: ['text'] } },
  { id: 'x/imagem', name: 'Gerador A', architecture: { input_modalities: ['text', 'image'], output_modalities: ['image', 'text'] } },
  { id: 'x/imagem-so-texto', name: 'Gerador B', architecture: { input_modalities: ['text'], output_modalities: ['image'] } },
  { id: 'x/imagem-nao-diz', name: 'Gerador C', architecture: { output_modalities: ['image', 'text'] } },
] };
const resposta = (corpo, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });
const comImagem = (buf, mime = 'image/png') => ({ choices: [{ message: { content: 'pronto', images: [{ type: 'image_url', image_url: { url: `data:${mime};base64,${buf.toString('base64')}` } }] } }] });
function falso({ imagem = png(32, 32), status = 200, corpo = null, chamadas = [] } = {}) {
  return async (url, opcoes = {}) => {
    chamadas.push({ url, opcoes });
    if (url.endsWith('/models')) return resposta(MODELOS);
    return resposta(corpo || comImagem(imagem), status);
  };
}
const pedido = (extra = {}) => ({ uid: UID, descricao: 'janela moderna de vidro azul', modelo: 'x/imagem', categoria: 'fachada', sub: 'janela', perspectiva: 'arq25d', ...extra });

test('modelos: só os que declaram saída de imagem, com o que aceitam; a lista é guardada em cache', async () => {
  const chamadas = []; const f = falso({ chamadas });
  const lista = await listarModelos({ fetchImpl: f });
  assert.deepEqual(lista.map((m) => m.id), ['x/imagem', 'x/imagem-so-texto', 'x/imagem-nao-diz']);
  assert.deepEqual(lista.map((m) => m.aceitaReferencia), [true, false, null]);
  await listarModelos({ fetchImpl: f }); assert.equal(chamadas.length, 1, 'a segunda chamada vem do cache');
});

test('gerar: monta o pedido com modalities e referências, guarda como pendente e NÃO entra na biblioteca', async () => {
  const chamadas = []; const f = falso({ chamadas });
  const r = await gerarImagens(pedido({ referencias: [{ fonte: 'upload', tipo: 'perspectiva' }, { fonte: 'componente', id: 'ex:vegetacao/palmeira', tipo: 'material' }], arquivos: [{ buffer: png(16, 16), mimetype: 'image/png' }] }), { fetchImpl: f });
  assert.equal(r.pendentes.length, 1); assert.equal(r.pendentes[0].modelo, 'x/imagem'); assert.ok(fs.existsSync(new URL(`../data/estudio-arquivos/${UID}/pendentes/${r.pendentes[0].hash}.png`, import.meta.url)));
  const envio = JSON.parse(chamadas.find((c) => c.url.endsWith('/chat/completions')).opcoes.body);
  assert.deepEqual(envio.modalities, ['image', 'text']); assert.equal(envio.model, 'x/imagem');
  const partes = envio.messages[0].content; assert.equal(partes[0].type, 'text'); assert.equal(partes.filter((p) => p.type === 'image_url').length, 2, 'as duas referências seguem como imagens');
  assert.ok(partes[1].image_url.url.startsWith('data:image/png;base64,')); assert.match(partes[0].text, /Image 1: perspectiva/); assert.match(partes[0].text, /Image 2: material/);
  assert.equal(chamadas.find((c) => c.url.endsWith('/chat/completions')).opcoes.headers.Authorization, `Bearer ${CHAVE}`, 'a chave só vai para o provedor');
  assert.equal(componentesDoUsuario(UID).length, 0, 'nada entra na biblioteca antes de aprovar'); assert.equal(lerPendentes(UID).length, 1);
  assert.ok(!JSON.stringify(r).includes(CHAVE), 'a resposta ao navegador nunca traz a chave');
});

test('gerar: respeita o que o modelo declara (referência negada, desconhecida, só imagem de saída)', async () => {
  const ref = { referencias: [{ fonte: 'upload', tipo: 'estilo' }], arquivos: [{ buffer: png(16, 16), mimetype: 'image/png' }] };
  await assert.rejects(gerarImagens(pedido({ modelo: 'x/imagem-so-texto', ...ref }), { fetchImpl: falso() }), /não aceita imagens de referência/);
  const chamadas = []; const desconhecido = await gerarImagens(pedido({ modelo: 'x/imagem-nao-diz', ...ref }), { fetchImpl: falso({ chamadas }) });
  assert.ok(desconhecido.avisos.some((a) => /não informa/.test(a)), 'avisa em vez de presumir');
  const soImagem = chamadas.length && await gerarImagens(pedido({ modelo: 'x/imagem-so-texto' }), { fetchImpl: falso({ chamadas }) });
  assert.deepEqual(JSON.parse(chamadas.filter((c) => c.url.endsWith('/chat/completions')).at(-1).opcoes.body).modalities, ['image'], 'modelo que só devolve imagem pede só imagem');
  assert.ok(soImagem.pendentes.length === 1);
  await assert.rejects(gerarImagens(pedido({ modelo: 'x/texto' }), { fetchImpl: falso() }), /não está na lista de geradores/);
  await assert.rejects(gerarImagens(pedido({ modelo: 'inventado/x' }), { fetchImpl: falso() }), /não está na lista/);
});

test('gerar: valida o pedido (descrição, categoria, papéis, limite de referências)', async () => {
  const f = falso();
  await assert.rejects(gerarImagens(pedido({ descricao: 'ab' }), { fetchImpl: f }), /3 a 600/);
  await assert.rejects(gerarImagens(pedido({ sub: 'cruzamento' }), { fetchImpl: f }), /subcategoria/);
  await assert.rejects(gerarImagens(pedido({ perspectiva: 'lateral' }), { fetchImpl: f }), /perspectiva/);
  await assert.rejects(gerarImagens(pedido({ referencias: [{ fonte: 'upload', tipo: 'cor' }], arquivos: [{ buffer: png(8, 8), mimetype: 'image/png' }] }), { fetchImpl: f }), /papel/);
  await assert.rejects(gerarImagens(pedido({ referencias: Array.from({ length: 5 }, () => ({ fonte: 'upload', tipo: 'estilo' })) }), { fetchImpl: f }), /No máximo 4/);
  await assert.rejects(gerarImagens(pedido({ referencias: [{ fonte: 'componente', id: 'ex:nao/existe', tipo: 'estilo' }] }), { fetchImpl: f }), /não existe mais/);
  await assert.rejects(gerarImagens(pedido({ referencias: [{ fonte: 'upload', tipo: 'estilo' }] }), { fetchImpl: f }), /faltou o arquivo/);
});

test('gerar: erros do provedor viram mensagens claras e nunca repetem a chave', async () => {
  for (const [status, esperado] of [[401, /chave do OpenRouter foi recusada/], [402, /Saldo insuficiente/], [429, /Limite de uso/]]) await assert.rejects(gerarImagens(pedido(), { fetchImpl: falso({ status, corpo: { error: { message: `falhou com ${CHAVE}` } } }) }), esperado);
  await assert.rejects(gerarImagens(pedido(), { fetchImpl: falso({ status: 400, corpo: { error: { message: `modelo recusou a chave ${CHAVE} no pedido` } } }) }), (e) => /O OpenRouter recusou/.test(e.message) && !e.message.includes(CHAVE));
  await assert.rejects(gerarImagens(pedido(), { fetchImpl: falso({ corpo: { choices: [{ message: { content: 'só texto' } }] } }) }), /não devolveu nenhuma imagem/);
  await assert.rejects(gerarImagens(pedido(), { fetchImpl: async (u) => { if (u.endsWith('/models')) return resposta(MODELOS); throw new Error(`rede caiu usando ${CHAVE}`); } }), (e) => /Não consegui falar/.test(e.message) && !e.message.includes(CHAVE));
  assert.deepEqual(imagensDaResposta({ choices: [{ message: { images: [{ image_url: { url: 'http://x/y.png' } }, { image_url: { url: 'data:text/html;base64,AAAA' } }] } }] }), [], 'só data URL de imagem é aceita');
});

test('aprovar: a imagem final entra na biblioteca como "gerado", com a origem do pedido; o pendente some; arquivo repetido não duplica', async () => {
  const r = await gerarImagens(pedido(), { fetchImpl: falso({ imagem: png(32, 32, [10, 20, 30]) }) });
  const id = r.pendentes[0].id; const final = png(24, 24, [200, 100, 50]);
  const a = aprovarPendente(UID, id, final, { nome: 'Janela IA', categoria: 'fachada', sub: 'janela', perspectiva: 'arq25d', material: 'vidro' });
  assert.equal(a.duplicado, false); assert.equal(a.componente.origem, 'gerado'); assert.ok(a.componente.tags.includes('ia')); assert.equal(a.componente.geracao.modelo, 'x/imagem'); assert.match(a.componente.geracao.prompt, /janela moderna/);
  assert.equal(lerPendentes(UID).some((p) => p.id === id), false, 'saiu da fila');
  assert.ok(!fs.existsSync(new URL(`../data/estudio-arquivos/${UID}/pendentes/${r.pendentes[0].hash}.png`, import.meta.url)), 'o arquivo bruto foi removido');
  assert.throws(() => aprovarPendente(UID, id, final, { nome: 'x', categoria: 'fachada', sub: 'janela', perspectiva: 'arq25d' }), /não encontrado/);
  const r2 = await gerarImagens(pedido(), { fetchImpl: falso({ imagem: png(32, 32, [11, 21, 31]) }) });
  const b = aprovarPendente(UID, r2.pendentes[0].id, final, { nome: 'Outra', categoria: 'fachada', sub: 'janela', perspectiva: 'arq25d' });
  assert.equal(b.duplicado, true, 'o mesmo PNG final não vira dois componentes'); assert.equal(componentesDoUsuario(UID).length, 1);
  const r3 = await gerarImagens(pedido(), { fetchImpl: falso({ imagem: png(32, 32, [12, 22, 32]) }) });
  const naFila = lerPendentes(UID).length;
  assert.throws(() => aprovarPendente(UID, r3.pendentes[0].id, Buffer.from('nao-e-png'), { nome: 'x', categoria: 'fachada', sub: 'janela', perspectiva: 'arq25d' }), /PNG/);
  assert.equal(lerPendentes(UID).length, naFila, 'uma aprovação inválida não apaga o pendente');
  assert.ok(lerPendentes(UID).some((p) => p.id === r3.pendentes[0].id));
});
