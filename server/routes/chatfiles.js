// Anexos do chat (fotos e PDFs). Ficam em DATA_DIR/chat-files e só o dono consegue abrir.
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { DATA_DIR, id } from '../db.js';
import { libraryItem, LIBRARY_DIR } from '../library.js';

export const CHAT_FILES = path.join(DATA_DIR, 'chat-files');
export const CHAT_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf',
  // arquivos criados pela IA (só para baixar)
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.json': 'application/json', '.html': 'text/plain; charset=utf-8',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
const INLINE_OK = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf']);
const MIME_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'application/pdf': '.pdf' };
export const MAX_CHAT_FILE_MB = 15;

// Confere se o arquivo pertence ao usuário e devolve os dados dele.
export function chatFile(userId, file) {
  // livros da biblioteca também podem ser anexados ("lib:<id>")
  if (String(file || '').startsWith('lib:')) {
    const item = libraryItem(userId, String(file).slice(4));
    if (!item) return null;
    const full = path.join(LIBRARY_DIR, path.basename(item.file));
    if (!fs.existsSync(full)) return null;
    return { file: `lib:${item.id}`, full, mime: item.format === 'pdf' ? 'application/pdf' : 'application/epub+zip', size: fs.statSync(full).size, name: item.title };
  }
  const name = path.basename(String(file || ''));
  if (!name.startsWith(`${userId}__`)) return null;
  const full = path.join(CHAT_FILES, name);
  if (!fs.existsSync(full)) return null;
  return { file: name, full, mime: CHAT_MIME[path.extname(name).toLowerCase()] || 'application/octet-stream', size: fs.statSync(full).size };
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => { fs.mkdirSync(CHAT_FILES, { recursive: true }); cb(null, CHAT_FILES); },
    filename: (req, file, cb) => cb(null, `${req.user.id}__${id()}${MIME_EXT[file.mimetype]}`),
  }),
  limits: { fileSize: MAX_CHAT_FILE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => (MIME_EXT[file.mimetype] ? cb(null, true) : cb(new Error('Envie uma foto (PNG, JPG, WEBP, GIF) ou um PDF.'))),
});

const router = express.Router();
router.post('/', (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? `Arquivo acima de ${MAX_CHAT_FILE_MB} MB` : err.message });
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8').slice(0, 160);
    res.status(201).json({ file: req.file.filename, name, mime: req.file.mimetype, size: req.file.size });
  });
});
router.get('/:file', (req, res) => {
  const f = chatFile(req.user.id, req.params.file);
  if (f && f.file.startsWith('lib:')) return res.type(f.mime).sendFile(f.full);
  if (!f) return res.status(404).json({ error: 'Arquivo não encontrado' });
  res.set('Cache-Control', 'private, max-age=86400');
  const ext = path.extname(f.file).toLowerCase();
  // o que a IA gerou (html, texto...) nunca abre dentro do sistema: só baixa, sem executar nada
  if (!INLINE_OK.has(ext) || req.query.download) {
    const name = String(req.query.name || f.file).replace(/[\r\n"\\/]/g, '_').slice(0, 120);
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': 'sandbox', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}` });
  }
  res.type(f.mime).sendFile(f.full);
});
export default router;
