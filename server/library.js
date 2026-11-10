// Biblioteca de livros digitais (PDF e EPUB).
// Usa um banco SEPARADO (library.json) e uma pasta própria (library/), para não pesar o banco principal.
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { DATA_DIR, id, now } from './db.js';
import { single, removeUpload } from './routes/uploads.js';
import { logEvent } from './notify.js';

export const LIBRARY_DIR = path.join(DATA_DIR, 'library');
export const LIBRARY_DB = path.join(DATA_DIR, 'library.json');
const FORMATS = { '.pdf': 'pdf', '.epub': 'epub' };
const MAX_MB = 500;
export const CATEGORIES = ['Clássicos', 'Autoajuda & Produtividade', 'Finanças & Economia', 'Programação', 'Inglês', 'Ficção', 'Negócios', 'Outros'];

let lib = null;
let timer = null;
export function loadLibrary() {
  fs.mkdirSync(LIBRARY_DIR, { recursive: true });
  try { lib = JSON.parse(fs.readFileSync(LIBRARY_DB, 'utf8')); } catch { lib = { items: [] }; }
  lib.items ??= [];
  return lib;
}
const store = () => lib || loadLibrary();
function persist() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const tmp = `${LIBRARY_DB}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(lib));
    fs.renameSync(tmp, LIBRARY_DB);
  }, 40);
}
export function saveLibraryNow() {
  if (!lib) return;
  clearTimeout(timer);
  const tmp = `${LIBRARY_DB}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(lib));
  fs.renameSync(tmp, LIBRARY_DB);
}
// usado ao restaurar um backup
export function replaceLibrary(next) { lib = { items: [], ...next }; saveLibraryNow(); }

const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const owned = (itemId, uid) => store().items.find((x) => x.id === itemId && x.userId === uid);
const fileOf = (item) => path.join(LIBRARY_DIR, path.basename(item.file));
const titleFromName = (name) => path.basename(name, path.extname(name)).replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) || 'Livro sem nome';

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => { fs.mkdirSync(LIBRARY_DIR, { recursive: true }); cb(null, LIBRARY_DIR); },
    filename: (_req, file, cb) => cb(null, `${id()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => (FORMATS[path.extname(file.originalname).toLowerCase()]
    ? cb(null, true) : cb(new Error('Formato inválido. Envie arquivos .pdf ou .epub.'))),
});

const router = express.Router();

router.get('/', (req, res) => {
  const items = store().items.filter((x) => x.userId === req.user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ items, categories: CATEGORIES, maxMb: MAX_MB });
});

router.post('/', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `Arquivo acima de ${MAX_MB} MB` : err.message });
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    // nomes vindos do navegador chegam em latin1 no multer; converte para UTF-8
    const original = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const item = {
      id: id(), userId: req.user.id,
      title: str(req.body.title, 160) || titleFromName(original),
      author: str(req.body.author, 120),
      category: CATEGORIES.includes(req.body.category) ? req.body.category : 'Outros',
      format: FORMATS[path.extname(req.file.filename)], size: req.file.size, file: req.file.filename,
      originalName: original.slice(0, 200), cover: null, downloads: 0, lastDownloadAt: null, createdAt: now(), updatedAt: now(),
    };
    store().items.push(item);
    persist();
    logEvent(req.user.id, 'study', 'create', `Livro digital adicionado: ${item.title}`, { link: '#/livros', detail: `${item.format.toUpperCase()} · ${(item.size / 1048576).toFixed(1)} MB` });
    res.status(201).json(item);
  });
});

router.put('/:id', (req, res) => {
  const item = owned(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Livro não encontrado' });
  if ('title' in req.body) item.title = str(req.body.title, 160) || item.title;
  if ('author' in req.body) item.author = str(req.body.author, 120);
  if (CATEGORIES.includes(req.body.category)) item.category = req.body.category;
  item.updatedAt = now();
  persist();
  res.json(item);
});

router.post('/:id/cover', (req, res, next) => (owned(req.params.id, req.user.id) ? next() : res.status(404).json({ error: 'Livro não encontrado' })),
  single('image'), (req, res) => {
    const item = owned(req.params.id, req.user.id);
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });
    removeUpload(item.cover);
    item.cover = `/uploads/${req.file.filename}`;
    item.updatedAt = now();
    persist();
    res.json(item);
  });

router.delete('/:id/cover', (req, res) => {
  const item = owned(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Livro não encontrado' });
  removeUpload(item.cover);
  item.cover = null;
  persist();
  res.json(item);
});

router.delete('/:id', (req, res) => {
  const item = owned(req.params.id, req.user.id);
  if (!item) return res.status(404).json({ error: 'Livro não encontrado' });
  fs.rm(fileOf(item), { force: true }, () => {});
  removeUpload(item.cover);
  lib.items = lib.items.filter((x) => x !== item);
  persist();
  logEvent(req.user.id, 'study', 'delete', `Livro digital removido: ${item.title}`);
  res.json({ ok: true });
});

// Download: o navegador salva o arquivo com o nome do livro.
router.get('/:id/download', (req, res) => {
  const item = owned(req.params.id, req.user.id);
  if (!item || !fs.existsSync(fileOf(item))) return res.status(404).json({ error: 'Arquivo não encontrado' });
  item.downloads = (item.downloads || 0) + 1;
  item.lastDownloadAt = now();
  persist();
  const safe = item.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'livro';
  const name = `${safe}.${item.format}`;
  const ascii = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  res.set({
    'Content-Type': item.format === 'pdf' ? 'application/pdf' : 'application/epub+zip',
    'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
  });
  res.sendFile(fileOf(item));
});

export default router;
