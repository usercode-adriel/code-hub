// STRUCTURE STUDIO: biblioteca central de componentes.
// Dois conjuntos, com o mesmo formato de metadados (ver public/js/estudio/presets.js):
//  - existentes: os assets que já estão no jogo (manifesto gerado por tools/estudio/componentes.py), sem copiar arquivo
//  - do usuário: importados ou gerados por IA e aprovados, em DATA_DIR/estudio/<uid>/componentes.json
// Cada arquivo é guardado uma vez só, pelo hash (SHA-256): importar o mesmo arquivo duas vezes devolve o componente que já existe.
import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR, APP_ROOT } from './db.js';
import {
  CATEGORIAS, MATERIAIS, CAMADA_DA_SUB, CAMADAS, PERSPECTIVAS_COMP, ORIGENS, GRADE, subcategoriaValida, compativelComPreset, PRESETS,
} from '../public/js/estudio/presets.js';

const router = express.Router();
const MANIFESTO = path.join(APP_ROOT, 'public', 'assets', 'estudio', 'componentes', 'manifesto.json');
export const ARQUIVOS = path.join(DATA_DIR, 'estudio-arquivos'); // servido em /estudio-arquivos/<uid>/<hash>.png
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_LADO = 4096;

let estaticos = null;
export function componentesExistentes() {
  if (!estaticos) {
    try { estaticos = JSON.parse(fs.readFileSync(MANIFESTO, 'utf8')).componentes; } catch { estaticos = []; }
  }
  return estaticos;
}

const indiceDe = (uid) => path.join(DATA_DIR, 'estudio', uid, 'componentes.json');
export function componentesDoUsuario(uid) {
  try { return JSON.parse(fs.readFileSync(indiceDe(uid), 'utf8')); } catch { return []; }
}
function gravarIndice(uid, lista) {
  fs.mkdirSync(path.dirname(indiceDe(uid)), { recursive: true });
  const tmp = `${indiceDe(uid)}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(lista));
  fs.renameSync(tmp, indiceDe(uid));
}

export const todosOsComponentes = (uid) => [...componentesExistentes(), ...componentesDoUsuario(uid)];
export const componentePorId = (uid, id) => todosOsComponentes(uid).find((c) => c.id === id) || null;

const normalizar = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// filtros: preset, categoria, sub, origem, material, q (busca por nome, subcategoria, material e etiquetas)
export function buscar(uid, f = {}) {
  const q = normalizar(f.q).trim();
  const nomeSub = (c) => CATEGORIAS[c.categoria]?.sub[c.sub] || c.sub;
  const lista = todosOsComponentes(uid).filter((c) => {
    if (f.preset && !compativelComPreset(c, f.preset)) return false;
    if (f.preset && PRESETS[f.preset] && !PRESETS[f.preset].categorias.includes(c.categoria)) return false;
    if (f.categoria && c.categoria !== f.categoria) return false;
    if (f.sub && c.sub !== f.sub) return false;
    if (f.origem && c.origem !== f.origem) return false;
    if (f.material && c.material !== f.material) return false;
    if (q) {
      const texto = normalizar([c.nome, nomeSub(c), CATEGORIAS[c.categoria]?.nome, c.material, ...(c.tags || [])].join(' '));
      if (!q.split(/\s+/).every((p) => texto.includes(p))) return false;
    }
    return true;
  });
  return lista;
}

// ---------- validação de PNG e dos metadados ----------
function lerPng(buf) {
  const ASSINATURA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 33 || !buf.subarray(0, 8).equals(ASSINATURA)) throw new Error('O arquivo precisa ser um PNG (para manter a transparência)');
  const w = buf.readUInt32BE(16); const h = buf.readUInt32BE(20);
  if (!(w >= 4 && h >= 4 && w <= MAX_LADO && h <= MAX_LADO)) throw new Error(`A imagem precisa ter de 4 a ${MAX_LADO} px de lado`);
  return { w, h };
}

export function validarMeta(m) {
  const categoria = String(m.categoria || '');
  const sub = String(m.sub || '');
  if (!CATEGORIAS[categoria]) throw new Error('categoria desconhecida');
  if (!subcategoriaValida(categoria, sub)) throw new Error('subcategoria desconhecida para esta categoria');
  const perspectiva = String(m.perspectiva || '');
  if (!PERSPECTIVAS_COMP.includes(perspectiva)) throw new Error('perspectiva desconhecida');
  const material = String(m.material || 'outro');
  if (!MATERIAIS.includes(material)) throw new Error('material desconhecido');
  const origem = String(m.origem || 'importado');
  if (!ORIGENS.includes(origem) || origem === 'existente') throw new Error('origem inválida (use importado ou gerado)');
  const nome = String(m.nome || '').trim().slice(0, 60);
  if (!nome) throw new Error('dê um nome ao componente');
  const tags = (Array.isArray(m.tags) ? m.tags : String(m.tags || '').split(',')).map((t) => String(t).trim().toLowerCase().slice(0, 24)).filter(Boolean).slice(0, 12);
  return { categoria, sub, perspectiva, material, origem, nome, tags };
}

// grava um PNG pelo hash (uma vez só) e devolve { hash, arquivo, w, h }; usado por componentes e prefabs
export function gravarPng(uid, buf) {
  const dim = lerPng(buf);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  fs.mkdirSync(path.join(ARQUIVOS, uid), { recursive: true });
  const destino = path.join(ARQUIVOS, uid, `${hash}.png`);
  if (!fs.existsSync(destino)) fs.writeFileSync(destino, buf);
  return { hash, arquivo: `/estudio-arquivos/${uid}/${hash}.png`, w: dim.w, h: dim.h };
}
export const removerPng = (uid, hash) => fs.rmSync(path.join(ARQUIVOS, uid, `${hash}.png`), { force: true });

// adiciona um PNG à biblioteca do usuário; se o mesmo arquivo já está lá, devolve o existente
export function adicionarComponente(uid, buf, meta, extras = {}) {
  const dim = lerPng(buf);
  const dados = validarMeta(meta);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  const lista = componentesDoUsuario(uid);
  const igual = lista.find((c) => c.hash === hash) || componentesExistentes().find((c) => c.hash === hash);
  if (igual) return { componente: igual, duplicado: true };
  fs.mkdirSync(path.join(ARQUIVOS, uid), { recursive: true });
  const destino = path.join(ARQUIVOS, uid, `${hash}.png`);
  if (!fs.existsSync(destino)) fs.writeFileSync(destino, buf);
  const c = {
    id: `u:${hash.slice(0, 12)}`, ...dados, arquivo: `/estudio-arquivos/${uid}/${hash}.png`, hash, w: dim.w, h: dim.h,
    pivo: { x: 0.5, y: 1 }, area: { w: Math.max(1, Math.ceil(dim.w / GRADE)), h: Math.max(1, Math.ceil(dim.h * 0.3 / GRADE)) },
    colisao: { tipo: 'nenhuma' }, conectores: [], camada: CAMADA_DA_SUB[dados.sub] || 'externo', criado: new Date().toISOString(),
    ...(extras.geracao ? { geracao: { modelo: String(extras.geracao.modelo || '').slice(0, 80), prompt: String(extras.geracao.prompt || '').slice(0, 300) } } : {}),
  };
  if (!CAMADAS.includes(c.camada)) c.camada = 'externo';
  lista.push(c); gravarIndice(uid, lista);
  return { componente: c, duplicado: false };
}

const envio = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } });
const receber = (req, res, next) => envio.single('imagem')(req, res, (err) => (err
  ? res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Imagem acima de 8 MB' : err.message })
  : next()));

// ---------- rotas (montadas em /api/estudio/componentes) ----------
router.get('/', (req, res) => {
  const f = { preset: req.query.preset, categoria: req.query.categoria, sub: req.query.sub, origem: req.query.origem, material: req.query.material, q: req.query.q };
  const todos = buscar(req.user.id, f);
  const limite = Math.min(300, Math.max(1, Number(req.query.limite) || 120));
  const pagina = Math.max(0, Number(req.query.pagina) || 0);
  // contagem por categoria e subcategoria, sobre os mesmos filtros exceto a própria categoria (para os chips)
  const base = buscar(req.user.id, { ...f, categoria: undefined, sub: undefined });
  const facetas = {};
  for (const c of base) { facetas[c.categoria] ??= { total: 0, sub: {} }; facetas[c.categoria].total++; facetas[c.categoria].sub[c.sub] = (facetas[c.categoria].sub[c.sub] || 0) + 1; }
  res.json({ total: todos.length, pagina, limite, componentes: todos.slice(pagina * limite, (pagina + 1) * limite), facetas });
});

router.get('/item', (req, res) => {
  const c = componentePorId(req.user.id, String(req.query.id || ''));
  if (!c) return res.status(404).json({ error: 'Componente não encontrado' });
  res.json(c);
});

router.post('/', receber, (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Envie a imagem PNG' });
  try { res.status(201).json(adicionarComponente(req.user.id, req.file.buffer, req.body || {})); }
  catch (err) { res.status(400).json({ error: err.message }); }
});

router.delete('/item', async (req, res) => {
  const id = String(req.query.id || '');
  const lista = componentesDoUsuario(req.user.id);
  const c = lista.find((x) => x.id === id);
  if (!c) return res.status(404).json({ error: 'Só componentes da sua biblioteca podem ser apagados' });
  // em uso numa estrutura ou num prefab: não apaga (a montagem ficaria com um buraco)
  const { listarEstruturas } = await import('./estudio-dados.js');
  const uso = listarEstruturas(req.user.id).filter((e) => e.componentes.some((i) => i.comp === id || i.textura === id));
  if (uso.length) return res.status(409).json({ error: `Este componente está em uso em ${uso.length} estrutura(s): ${uso.slice(0, 3).map((e) => e.nome).join(', ')}` });
  gravarIndice(req.user.id, lista.filter((x) => x.id !== id));
  // o arquivo só sai do disco se nenhum outro componente o usa
  if (!lista.some((x) => x.id !== id && x.hash === c.hash)) fs.rmSync(path.join(ARQUIVOS, req.user.id, `${c.hash}.png`), { force: true });
  res.json({ ok: true });
});

export default router;
