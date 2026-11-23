// STRUCTURE STUDIO: geração de novos componentes por IA de imagem, pelo OpenRouter, com imagens de referência.
// - A chave (OPENROUTER_API_KEY) fica só no backend: o navegador nunca a vê, e mensagens de erro não a repetem.
// - Capacidades vêm do que o OpenRouter DECLARA de cada modelo (/models). O que ele não declara (quantas referências aceita,
//   se devolve transparência) fica "desconhecido" e é tratado com cautela, nunca presumido.
// - O resultado NÃO entra na biblioteca: vai para uma fila de pendentes (pré-visualização) e só vira componente quando o
//   usuário aprova (a imagem aprovada chega do navegador, já com o fundo removido e recortada).
import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR, APP_ROOT } from './db.js';
import { CLOUD_PROVIDERS, hasKey } from './providers.js';
import { componentePorId, adicionarComponente, ARQUIVOS } from './estudio-biblioteca.js';
import { montarPromptImagem, capacidadesDoModelo, MAX_REFERENCIAS, PAPEIS } from '../public/js/estudio/gerador.js';
import { CATEGORIAS, PERSPECTIVAS_COMP } from '../public/js/estudio/presets.js';
import { logger } from './log.js';

const router = express.Router();
const MAX_IMAGEM = 12 * 1024 * 1024;
const MIMES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const indiceDe = (uid) => path.join(DATA_DIR, 'estudio', uid, 'pendentes.json');
const pastaPend = (uid) => path.join(ARQUIVOS, uid, 'pendentes');

const base = () => CLOUD_PROVIDERS.openrouter.base();
const chave = () => process.env[CLOUD_PROVIDERS.openrouter.env] || '';
const semChave = (t) => { const k = chave(); return k ? String(t).split(k).join('•••') : String(t); }; // nada que contenha a chave sai daqui

// ---------- modelos de imagem (cache de 6 h) ----------
let cacheModelos = { em: 0, lista: [] };
export const limparCacheModelos = () => { cacheModelos = { em: 0, lista: [] }; };
export async function listarModelos({ fetchImpl = fetch } = {}) {
  if (Date.now() - cacheModelos.em < 6 * 3600 * 1000 && cacheModelos.lista.length) return cacheModelos.lista;
  const r = await fetchImpl(`${base()}/models`, { headers: chave() ? { Authorization: `Bearer ${chave()}` } : {} });
  if (!r.ok) throw new Error(`O OpenRouter não listou os modelos (${r.status})`);
  const j = await r.json();
  const lista = (j.data || []).map(capacidadesDoModelo).filter((c) => c.geraImagem === true).map(({ id, nome, aceitaReferencia, saidas }) => ({ id, nome, aceitaReferencia, saidas }));
  cacheModelos = { em: Date.now(), lista };
  return lista;
}

// ---------- fila de pendentes ----------
export function lerPendentes(uid) { try { return JSON.parse(fs.readFileSync(indiceDe(uid), 'utf8')); } catch { return []; } }
function gravarPendentes(uid, lista) {
  fs.mkdirSync(path.dirname(indiceDe(uid)), { recursive: true });
  const tmp = `${indiceDe(uid)}.tmp`; fs.writeFileSync(tmp, JSON.stringify(lista)); fs.renameSync(tmp, indiceDe(uid));
}

// referência vinda da biblioteca: lê o arquivo do disco (existente em public/, do usuário em estudio-arquivos/)
function arquivoDoComponente(uid, c) {
  const rel = c.arquivo.startsWith('/estudio-arquivos/') ? path.join(ARQUIVOS, c.arquivo.replace(/^\/estudio-arquivos\//, '')) : path.join(APP_ROOT, 'public', c.arquivo);
  const buf = fs.readFileSync(rel);
  return { buf, mime: 'image/png' };
}
const dataUrl = (buf, mime) => `data:${mime};base64,${buf.toString('base64')}`;

function erroDoProvedor(status, corpo) {
  if (status === 401 || status === 403) return 'A chave do OpenRouter foi recusada (inválida ou sem permissão).';
  if (status === 402) return 'Saldo insuficiente no OpenRouter para gerar a imagem.';
  if (status === 429) return 'Limite de uso do OpenRouter atingido: tente de novo em instantes.';
  const msg = corpo?.error?.message || corpo?.message || `erro ${status}`;
  return semChave(`O OpenRouter recusou o pedido: ${String(msg).slice(0, 200)}`);
}

// extrai as imagens de uma resposta de chat do OpenRouter (message.images, ou partes de conteúdo com image_url)
export function imagensDaResposta(j) {
  const msg = j?.choices?.[0]?.message || {}; const achadas = [];
  const dataUrls = [];
  for (const im of msg.images || []) dataUrls.push(im?.image_url?.url || im?.url);
  if (Array.isArray(msg.content)) for (const p of msg.content) if (p?.type === 'image_url' || p?.type === 'output_image') dataUrls.push(p.image_url?.url || p.url);
  for (const u of dataUrls) {
    const m = typeof u === 'string' && u.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!m) continue;
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > MAX_IMAGEM || buf.length < 100) continue;
    achadas.push({ buf, mime: m[1] });
  }
  return achadas;
}

// ---------- geração ----------
export async function gerarImagens({ uid, descricao, modelo, categoria, sub, perspectiva, referencias = [], arquivos = [] }, { fetchImpl = fetch } = {}) {
  const texto = String(descricao || '').trim();
  if (texto.length < 3 || texto.length > 600) throw new Error('Descreva o componente em 3 a 600 caracteres');
  if (!CATEGORIAS[categoria]?.sub[sub]) throw new Error('categoria ou subcategoria inválida');
  if (!PERSPECTIVAS_COMP.includes(perspectiva)) throw new Error('perspectiva inválida');
  if (!chave()) throw new Error('OpenRouter não configurado: peça ao administrador para salvar a chave em Configurações → Assistente.');
  const modelos = await listarModelos({ fetchImpl });
  const info = modelos.find((m) => m.id === modelo);
  if (!info) throw new Error('Esse modelo não está na lista de geradores de imagem do OpenRouter. Atualize a lista e escolha de novo.');
  if (referencias.length > MAX_REFERENCIAS) throw new Error(`No máximo ${MAX_REFERENCIAS} imagens de referência`);

  const avisos = []; const refs = []; let usadoUpload = 0;
  for (const r of referencias) {
    if (!PAPEIS[r.tipo]) throw new Error('papel de referência inválido (use perspectiva, material, estilo ou composicao)');
    if (r.fonte === 'componente') {
      const c = componentePorId(uid, String(r.id || '')); if (!c) throw new Error('um componente de referência não existe mais na biblioteca');
      const a = arquivoDoComponente(uid, c); refs.push({ tipo: r.tipo, ...a });
    } else {
      const f = arquivos[usadoUpload++]; if (!f) throw new Error('faltou o arquivo de uma imagem de referência');
      refs.push({ tipo: r.tipo, buf: f.buffer, mime: f.mimetype });
    }
  }
  if (refs.length && info.aceitaReferencia === false) throw new Error(`O modelo "${info.nome}" não aceita imagens de referência. Escolha outro modelo ou gere sem referências.`);
  if (refs.length && info.aceitaReferencia === null) avisos.push('O OpenRouter não informa se este modelo aceita imagens de referência: se der erro, tente sem elas.');
  if (refs.length > 1) avisos.push('Nem todo modelo usa várias referências ao mesmo tempo; o resultado pode ignorar algumas.');

  const prompt = montarPromptImagem({ descricao: texto, sub, categoria, perspectiva, referencias: refs });
  const corpo = {
    model: info.id,
    modalities: info.saidas?.includes('text') === false ? ['image'] : ['image', 'text'],
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, ...refs.map((r) => ({ type: 'image_url', image_url: { url: dataUrl(r.buf, r.mime) } }))] }],
  };
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 150000);
  let resp; let json;
  try {
    resp = await fetchImpl(`${base()}/chat/completions`, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chave()}`, 'X-Title': 'Codeniac' }, body: JSON.stringify(corpo) });
    json = await resp.json().catch(() => ({}));
  } catch (err) { throw new Error(err.name === 'AbortError' ? 'O OpenRouter demorou demais para gerar a imagem.' : semChave(`Não consegui falar com o OpenRouter: ${err.message}`)); } finally { clearTimeout(t); }
  if (!resp.ok) { logger.warn(`[estudio-gerador] OpenRouter ${resp.status}`); throw new Error(erroDoProvedor(resp.status, json)); }
  const imagens = imagensDaResposta(json);
  if (!imagens.length) throw new Error('O modelo respondeu, mas não devolveu nenhuma imagem. Tente reescrever o pedido ou escolher outro modelo.');

  fs.mkdirSync(pastaPend(uid), { recursive: true });
  const lista = lerPendentes(uid); const novos = [];
  for (const im of imagens.slice(0, 4)) {
    const hash = crypto.createHash('sha256').update(im.buf).digest('hex'); const ext = MIMES[im.mime];
    fs.writeFileSync(path.join(pastaPend(uid), `${hash}.${ext}`), im.buf);
    const p = { id: crypto.randomUUID(), hash, ext, arquivo: `/estudio-arquivos/${uid}/pendentes/${hash}.${ext}`, mime: im.mime, bytes: im.buf.length, prompt: texto.slice(0, 300), modelo: info.id, categoria, sub, perspectiva, referencias: refs.map((r) => r.tipo), criado: new Date().toISOString() };
    lista.push(p); novos.push(p);
  }
  gravarPendentes(uid, lista.slice(-60));
  return { pendentes: novos, avisos, modelo: info.nome };
}

function removerPendente(uid, id) {
  const lista = lerPendentes(uid); const p = lista.find((x) => x.id === id); if (!p) return null;
  const resto = lista.filter((x) => x.id !== id); gravarPendentes(uid, resto);
  if (!resto.some((x) => x.hash === p.hash)) fs.rmSync(path.join(pastaPend(uid), `${p.hash}.${p.ext}`), { force: true });
  return p;
}

// aprovar: a imagem final (PNG transparente, recortado) vem do navegador; só aqui ela entra na biblioteca definitiva
export function aprovarPendente(uid, id, png, meta) {
  const p = lerPendentes(uid).find((x) => x.id === id);
  if (!p) throw new Error('Pendente não encontrado (já foi aprovado ou rejeitado)');
  const r = adicionarComponente(uid, png, { ...meta, origem: 'gerado', tags: ['ia', ...(Array.isArray(meta.tags) ? meta.tags : [])] }, { geracao: { modelo: p.modelo, prompt: p.prompt } });
  removerPendente(uid, id);
  return r;
}

// ---------- rotas ----------
const envio = multer({ storage: multer.memoryStorage(), limits: { fileSize: 4 * 1024 * 1024, files: MAX_REFERENCIAS }, fileFilter: (_q, f, cb) => cb(MIMES[f.mimetype] ? null : new Error('Referência: use PNG, JPG ou WEBP'), Boolean(MIMES[f.mimetype])) });
const receberRefs = (req, res, next) => envio.array('ref', MAX_REFERENCIAS)(req, res, (err) => (err ? res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Cada referência pode ter até 4 MB' : err.message }) : next()));
const envioPng = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
const receberPng = (req, res, next) => envioPng.single('imagem')(req, res, (err) => (err ? res.status(400).json({ error: err.message }) : next()));

router.get('/estado', (_req, res) => res.json({ chave: hasKey('openrouter'), modeloPadrao: process.env.OPENROUTER_IMAGE_MODEL || null }));
router.get('/modelos', async (_req, res) => { try { res.json({ modelos: await listarModelos() }); } catch (err) { res.status(502).json({ error: semChave(err.message) }); } });
router.get('/pendentes', (req, res) => res.json({ pendentes: lerPendentes(req.user.id) }));

router.post('/gerar', receberRefs, async (req, res) => {
  let referencias = [];
  try { referencias = JSON.parse(req.body?.referencias || '[]'); if (!Array.isArray(referencias)) throw new Error('x'); } catch { return res.status(400).json({ error: 'referências inválidas' }); }
  try { res.json(await gerarImagens({ uid: req.user.id, descricao: req.body?.descricao, modelo: String(req.body?.modelo || ''), categoria: req.body?.categoria, sub: req.body?.sub, perspectiva: req.body?.perspectiva, referencias, arquivos: req.files || [] })); }
  catch (err) { res.status(400).json({ error: semChave(err.message) }); }
});

router.post('/pendentes/:id/aprovar', receberPng, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Envie a imagem final (PNG)' });
  try { res.status(201).json(aprovarPendente(req.user.id, req.params.id, req.file.buffer, req.body || {})); } catch (err) { res.status(400).json({ error: err.message }); }
});
router.delete('/pendentes/:id', (req, res) => { const p = removerPendente(req.user.id, req.params.id); if (!p) return res.status(404).json({ error: 'Pendente não encontrado' }); res.json({ ok: true }); });

export default router;
