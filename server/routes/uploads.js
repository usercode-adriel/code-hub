// Upload de imagens compartilhado pelas rotas (perfil, capas, páginas, imagens do sistema).
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import { id, UPLOAD_DIR } from '../db.js';

const MIME_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${id()}${MIME_EXT[file.mimetype]}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    MIME_EXT[file.mimetype] ? cb(null, true) : cb(new Error('Formato inválido. Use PNG, JPG, WEBP ou GIF.')),
});

export const single = (field) => (req, res, next) =>
  upload.single(field)(req, res, (err) => (err
    ? res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Imagem acima de 8 MB' : err.message })
    : next()));

export function removeUpload(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  fs.rm(path.join(UPLOAD_DIR, path.basename(url)), { force: true }, () => {});
}
