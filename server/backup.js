// Backup automático diário: copia o banco (e as imagens, de forma incremental) para uma pasta,
// por padrão dentro do OneDrive quando ele existe — assim o backup também vai para a nuvem.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { saveLibraryNow, replaceLibrary, LIBRARY_DB, LIBRARY_DIR } from './library.js';
import { db, saveNow, replaceState, DB_FILE, UPLOAD_DIR, DATA_DIR, localDate, now, save } from './db.js';
import { systemConfig } from './seed.js';

export function defaultBackupDir() {
  const oneDrive = process.env.OneDrive || process.env.OneDriveConsumer;
  if (oneDrive && fs.existsSync(oneDrive)) return path.join(oneDrive, 'Codeniac-Backups');
  const docs = path.join(os.homedir(), 'Documents');
  return path.join(fs.existsSync(docs) ? docs : os.homedir(), 'Codeniac-Backups');
}

export const backupDir = () => systemConfig().backup.dir || defaultBackupDir();

export function listBackups() {
  const dir = backupDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => /^\d{4}-\d{2}-\d{2}_\d{4}$/.test(n) && fs.existsSync(path.join(dir, n, 'db.json')))
    .sort().reverse()
    .map((name) => ({ name, size: fs.statSync(path.join(dir, name, 'db.json')).size, date: `${name.slice(0, 10)} ${name.slice(11, 13)}:${name.slice(13)}` }));
}

export function runBackup(reason = 'automático') {
  const cfg = systemConfig().backup;
  const dir = backupDir();
  try {
    saveNow();
    const d = new Date();
    const name = `${localDate(d)}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    const target = path.join(dir, name);
    fs.mkdirSync(target, { recursive: true });
    fs.copyFileSync(DB_FILE, path.join(target, 'db.json'));
    saveLibraryNow();
    if (fs.existsSync(LIBRARY_DB)) fs.copyFileSync(LIBRARY_DB, path.join(target, 'library.json'));
    // livros digitais: pasta compartilhada entre os backups, copia só os arquivos novos
    const libDir = path.join(dir, 'library');
    fs.mkdirSync(libDir, { recursive: true });
    for (const f of fs.existsSync(LIBRARY_DIR) ? fs.readdirSync(LIBRARY_DIR) : []) {
      if (!fs.existsSync(path.join(libDir, f))) fs.copyFileSync(path.join(LIBRARY_DIR, f), path.join(libDir, f));
    }
    const ai = path.join(DATA_DIR, 'ai.json');
    if (fs.existsSync(ai)) fs.copyFileSync(ai, path.join(target, 'ai.json'));
    // imagens: pasta compartilhada entre os backups, copia só o que ainda não existe
    const up = path.join(dir, 'uploads');
    fs.mkdirSync(up, { recursive: true });
    let copied = 0;
    for (const f of fs.existsSync(UPLOAD_DIR) ? fs.readdirSync(UPLOAD_DIR) : []) {
      if (!fs.existsSync(path.join(up, f))) { fs.copyFileSync(path.join(UPLOAD_DIR, f), path.join(up, f)); copied++; }
    }
    fs.writeFileSync(path.join(target, 'LEIA-ME.txt'), `Backup do Codeniac (${reason}) em ${d.toLocaleString('pt-BR')}.\r\nPara restaurar: Configurações > Administração > Backup > Restaurar.\r\n`);
    // mantém só os N mais recentes
    const all = listBackups();
    for (const old of all.slice(cfg.keep || 14)) fs.rmSync(path.join(dir, old.name), { recursive: true, force: true });
    Object.assign(cfg, { lastAt: now(), lastFile: target, lastError: null });
    save();
    console.log(`» Backup ${reason} salvo em ${target} (${copied} imagem(ns) nova(s))`);
    return { ok: true, dir: target, copied };
  } catch (err) {
    cfg.lastError = `${err.code || ''} ${err.message}`.trim();
    save();
    console.error('» Falha no backup:', err.message);
    return { ok: false, error: cfg.lastError };
  }
}

// Faz o backup do dia se ainda não foi feito.
export function backupIfDue() {
  const cfg = systemConfig().backup;
  if (!cfg.enabled) return null;
  if (cfg.lastAt && localDate(new Date(cfg.lastAt)) === localDate()) return null;
  return runBackup('automático');
}

export function restoreBackup(name) {
  const dir = backupDir();
  if (!/^\d{4}-\d{2}-\d{2}_\d{4}$/.test(name)) throw new Error('Backup inválido');
  const file = path.join(dir, name, 'db.json');
  if (!fs.existsSync(file)) throw new Error('Backup não encontrado');
  runBackup('antes de restaurar'); // segurança: guarda o estado atual antes
  const next = JSON.parse(fs.readFileSync(file, 'utf8'));
  const keepSecret = db().meta?.jwtSecret;
  replaceState({ ...next, meta: { ...(next.meta || {}), jwtSecret: next.meta?.jwtSecret || keepSecret } });
  const libFile = path.join(dir, name, 'library.json');
  if (fs.existsSync(libFile)) replaceLibrary(JSON.parse(fs.readFileSync(libFile, 'utf8')));
  const libDir = path.join(dir, 'library');
  if (fs.existsSync(libDir)) {
    fs.mkdirSync(LIBRARY_DIR, { recursive: true });
    for (const f of fs.readdirSync(libDir)) if (!fs.existsSync(path.join(LIBRARY_DIR, f))) fs.copyFileSync(path.join(libDir, f), path.join(LIBRARY_DIR, f));
  }
  const up = path.join(dir, 'uploads');
  if (fs.existsSync(up)) for (const f of fs.readdirSync(up)) if (!fs.existsSync(path.join(UPLOAD_DIR, f))) fs.copyFileSync(path.join(up, f), path.join(UPLOAD_DIR, f));
  return true;
}
