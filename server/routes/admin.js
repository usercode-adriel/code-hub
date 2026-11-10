// Painel de administração (somente administradores): usuários, sistema, imagens, aparência avançada,
// backup e restauração, rede (acesso pelo celular), logs e reinício.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import { db, save, now, DATA_DIR, UPLOAD_DIR, DB_FILE, USER_COLLECTIONS } from '../db.js';
import { requireAdmin, hashPassword, publicUser } from '../auth.js';
import { createUser, systemConfig, THEMES, APP_VERSION } from '../seed.js';
import { single, removeUpload } from './uploads.js';
import { assistantMode } from '../assistant.js';
import { logEvent } from '../notify.js';
import { listBackups, runBackup, restoreBackup, backupDir, defaultBackupDir } from '../backup.js';
import { KB_SIZE } from '../kb.js';

const router = express.Router();
router.use(requireAdmin);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const admins = () => db().users.filter((u) => u.role === 'admin');
export const IMAGE_SLOTS = {
  logo: 'Logo do sistema (tela de login)',
  logoIcon: 'Ícone do menu (quadrado)',
  loginBg: 'Fundo da tela de login',
  loginArt: 'Imagem lateral da tela de login',
  heroDefault: 'Banner principal do dashboard',
  cardFocus: 'Card "Foco do dia"',
  cardForYou: 'Card "Para você"',
  cardSoon: 'Card "Próximos prazos"',
  cardNews: 'Card "Últimas atualizações"',
  hojeBanner: 'Banner da aba Hoje',
  booksHero: 'Banner da aba Livros',
};

// O servidor principal registra aqui a função de reinício (precisa do objeto do servidor HTTP).
let restartFn = null;
export const setRestart = (fn) => { restartFn = fn; };

function dirSize(dir) {
  let total = 0; let count = 0;
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
    const st = fs.statSync(path.join(dir, f));
    if (st.isFile()) { total += st.size; count++; }
  }
  return { total, count };
}

router.get('/overview', (_req, res) => {
  const d = db();
  res.json({
    version: APP_VERSION, node: process.version, uptime: Math.round(process.uptime()), aiMode: assistantMode(), dataDir: DATA_DIR,
    memoryMb: Math.round(process.memoryUsage().rss / 1048576), kbSize: KB_SIZE,
    dbSize: fs.existsSync(DB_FILE) ? fs.statSync(DB_FILE).size : 0, uploads: dirSize(UPLOAD_DIR),
    counts: { users: d.users.length, projects: d.projects.length, pages: d.pages.length, tasks: d.tasks.length, finance: d.finance.length, money: d.money.length, events: d.events.length, cards: d.cards.length },
  });
});

// ---------- Usuários ----------
router.get('/users', (_req, res) => {
  const d = db();
  res.json(d.users.map((u) => ({ ...publicUser(u), projects: d.projects.filter((p) => p.userId === u.id).length, pages: d.pages.filter((p) => p.userId === u.id).length })));
});

router.post('/users', (req, res) => {
  const name = str(req.body.name, 80);
  const email = str(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || '');
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return bad(res, 'Informe nome e e-mail válidos');
  if (password.length < 6) return bad(res, 'A senha precisa de pelo menos 6 caracteres');
  if (db().users.some((u) => u.email === email)) return bad(res, 'E-mail já cadastrado', 409);
  const user = createUser({ name, email, password, role: req.body.role === 'admin' ? 'admin' : 'user' });
  user.lastSeenVersion = APP_VERSION;
  save();
  logEvent(req.user.id, 'system', 'create', `Usuário ${name} criado`);
  res.status(201).json(publicUser(user));
});

router.put('/users/:id', (req, res) => {
  const u = db().users.find((x) => x.id === req.params.id);
  if (!u) return bad(res, 'Usuário não encontrado', 404);
  if (req.body.role && ['admin', 'user'].includes(req.body.role)) {
    if (u.role === 'admin' && req.body.role === 'user' && admins().length === 1) return bad(res, 'O sistema precisa de pelo menos um administrador');
    u.role = req.body.role;
  }
  if (req.body.name) u.name = str(req.body.name, 80) || u.name;
  save();
  res.json(publicUser(u));
});

router.post('/users/:id/reset-password', (req, res) => {
  const u = db().users.find((x) => x.id === req.params.id);
  if (!u) return bad(res, 'Usuário não encontrado', 404);
  const temp = crypto.randomBytes(5).toString('hex');
  u.password = hashPassword(temp);
  save();
  res.json({ password: temp });
});

router.delete('/users/:id', (req, res) => {
  const d = db();
  const u = d.users.find((x) => x.id === req.params.id);
  if (!u) return bad(res, 'Usuário não encontrado', 404);
  if (u.id === req.user.id) return bad(res, 'Você não pode excluir a própria conta por aqui');
  if (u.role === 'admin' && admins().length === 1) return bad(res, 'O sistema precisa de pelo menos um administrador');
  removeUpload(u.avatar);
  for (const p of d.projects.filter((x) => x.userId === u.id)) removeUpload(p.cover);
  for (const p of d.pages.filter((x) => x.userId === u.id)) removeUpload(p.cover);
  for (const coll of USER_COLLECTIONS) d[coll] = d[coll].filter((x) => x.userId !== u.id);
  for (const key of ['settings', 'threads', 'garage', 'budgets']) delete d[key][u.id];
  d.users = d.users.filter((x) => x.id !== u.id);
  save();
  res.json({ ok: true });
});

// ---------- Sistema ----------
router.get('/system', (_req, res) => res.json({ ...systemConfig(), imageSlots: IMAGE_SLOTS, backupDefault: defaultBackupDir(), backupDir: backupDir() }));

router.put('/system', (req, res) => {
  const sys = systemConfig();
  const b = req.body || {};
  if ('appName' in b) sys.appName = str(b.appName, 40) || 'Codeniac';
  if ('allowRegistration' in b) sys.allowRegistration = Boolean(b.allowRegistration);
  if (THEMES.includes(b.defaultTheme)) sys.defaultTheme = b.defaultTheme;
  if ('loginMessage' in b) sys.loginMessage = str(b.loginMessage, 200);
  if ('customCss' in b) sys.customCss = String(b.customCss || '').slice(0, 50000).replace(/<\/?style/gi, '');
  if (b.menu && typeof b.menu === 'object') {
    sys.menu = {
      hidden: Array.isArray(b.menu.hidden) ? b.menu.hidden.slice(0, 40).map((x) => String(x).slice(0, 30)) : sys.menu.hidden,
      labels: b.menu.labels && typeof b.menu.labels === 'object'
        ? Object.fromEntries(Object.entries(b.menu.labels).slice(0, 40).map(([k, v]) => [String(k).slice(0, 30), str(v, 30)]).filter(([, v]) => v)) : sys.menu.labels,
    };
  }
  if (b.backup && typeof b.backup === 'object') {
    if ('enabled' in b.backup) sys.backup.enabled = Boolean(b.backup.enabled);
    if ('keep' in b.backup) sys.backup.keep = Math.max(1, Math.min(365, Number(b.backup.keep) || 14));
    if ('dir' in b.backup) {
      const dir = str(b.backup.dir, 400);
      if (dir && !path.isAbsolute(dir)) return bad(res, 'Informe o caminho completo da pasta (ex.: C:\\Users\\voce\\OneDrive\\Backups)');
      sys.backup.dir = dir;
    }
  }
  save();
  logEvent(req.user.id, 'system', 'update', 'Configurações do sistema alteradas', { merge: 'system' });
  res.json({ ...sys, imageSlots: IMAGE_SLOTS, backupDefault: defaultBackupDir(), backupDir: backupDir() });
});

// ---------- Imagens do sistema (login, logo, cards) ----------
router.post('/images/:slot', single('image'), (req, res) => {
  const { slot } = req.params;
  if (!IMAGE_SLOTS[slot]) return bad(res, 'Local de imagem desconhecido');
  if (!req.file) return bad(res, 'Nenhuma imagem enviada');
  const sys = systemConfig();
  removeUpload(sys.images[slot]);
  sys.images[slot] = `/uploads/${req.file.filename}`;
  save();
  logEvent(req.user.id, 'upload', 'create', `Imagem do sistema trocada: ${IMAGE_SLOTS[slot]}`, { link: '#/settings/admin' });
  res.json(sys.images);
});

router.delete('/images/:slot', (req, res) => {
  const sys = systemConfig();
  removeUpload(sys.images[req.params.slot]);
  delete sys.images[req.params.slot];
  save();
  res.json(sys.images);
});

// ---------- Backup ----------
router.get('/backups', (_req, res) => res.json({ dir: backupDir(), list: listBackups(), config: systemConfig().backup }));
router.post('/backups/run', (req, res) => {
  const r = runBackup('manual');
  if (!r.ok) return bad(res, `Não consegui salvar o backup: ${r.error}`, 500);
  logEvent(req.user.id, 'system', 'backup', 'Backup manual concluído', { detail: r.dir });
  res.json({ ...r, list: listBackups() });
});
router.post('/backups/:name/restore', (req, res) => {
  try {
    restoreBackup(req.params.name);
    res.json({ ok: true });
  } catch (err) { bad(res, err.message); }
});

// ---------- Rede (acesso pelo celular) ----------
const envFile = () => path.join(DATA_DIR, '.env');
router.put('/network', (req, res) => {
  const enable = Boolean(req.body?.enabled);
  let env = fs.existsSync(envFile()) ? fs.readFileSync(envFile(), 'utf8') : '';
  const HOST_LINE = /^[ \t]*HOST[ \t]*=.*(\r?\n)?/m;
  env = env.replace(HOST_LINE, '');
  if (enable) env = `${env}${env && !/\n$/.test(env) ? '\r\n' : ''}HOST=0.0.0.0\r\n`;
  fs.writeFileSync(envFile(), env);
  logEvent(req.user.id, 'system', 'update', enable ? 'Acesso pelo celular ligado' : 'Acesso pelo celular desligado');
  res.json({ ok: true, enabled: enable, restartNeeded: (process.env.HOST === '0.0.0.0') !== enable });
});

// ---------- Logs e reinício ----------
router.get('/logs', (_req, res) => {
  const file = process.env.LOG_FILE;
  if (!file || !fs.existsSync(file)) return res.json({ file: file || null, lines: [] });
  const text = fs.readFileSync(file, 'utf8');
  res.json({ file, lines: text.split(/\r?\n/).filter(Boolean).slice(-300) });
});

router.post('/restart', (req, res) => {
  if (!restartFn) return bad(res, 'Reinício indisponível neste modo');
  logEvent(req.user.id, 'system', 'restart', 'Codeniac reiniciado pelo administrador');
  res.json({ ok: true });
  setTimeout(restartFn, 300);
});

// Backup completo (sem o segredo de assinatura de sessões).
router.get('/backup', (_req, res) => {
  const { meta, ...rest } = db();
  const { jwtSecret, ...safeMeta } = meta;
  res.set('Content-Disposition', `attachment; filename="codeniac-backup-completo-${now().slice(0, 10)}.json"`);
  res.json({ exportedAt: now(), version: APP_VERSION, meta: safeMeta, ...rest });
});

export default router;
