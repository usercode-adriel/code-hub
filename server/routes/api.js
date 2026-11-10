import express from 'express';
import { db, id, now, save, slugify, localDate, USER_COLLECTIONS } from '../db.js';
import { single, removeUpload } from './uploads.js';
import {
  requireAuth, requireAdmin, signToken, verifyPassword, hashPassword, publicUser,
} from '../auth.js';
import {
  createUser, DEFAULT_SETTINGS, APP_VERSION, CHANGELOG, THEMES, THEME_VAR_KEYS, PERSONALITIES, systemConfig, ensureRootPage,
} from '../seed.js';
import { notify, subscribe, emit, logEvent } from '../notify.js';

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const str = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const PRIORITIES = ['low', 'medium', 'high'];
const STATUSES = ['todo', 'doing', 'done'];
const ICONS = ['briefcase', 'code', 'bitcoin', 'trending', 'book', 'layers', 'globe', 'folder',
  'star', 'heart', 'music', 'camera', 'rocket', 'target', 'cpu', 'pen'];

// ---------- Helpers de domínio ----------
const userProjects = (uid) => db().projects.filter((p) => p.userId === uid).sort((a, b) => a.order - b.order);
const userTasks = (uid) => db().tasks.filter((t) => t.userId === uid);
const findOwned = (coll, itemId, uid) => db()[coll].find((x) => x.id === itemId && x.userId === uid);

export function projectStats(projectId, uid) {
  const tasks = userTasks(uid).filter((t) => t.projectId === projectId);
  const done = tasks.filter((t) => t.status === 'done').length;
  return {
    total: tasks.length, done,
    doing: tasks.filter((t) => t.status === 'doing').length,
    todo: tasks.filter((t) => t.status === 'todo').length,
    progress: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
  };
}
const withStats = (p, uid) => ({
  ...p,
  stats: projectStats(p.id, uid),
  pages: db().pages.filter((x) => x.projectId === p.id && x.parentId).length,
});

// A dica da conta de demonstração só aparece enquanto ela existir com a senha padrão.
let demoCache = { at: 0, value: false };
function demoActive() {
  if (Date.now() - demoCache.at < 30000) return demoCache.value;
  const u = db().users.find((x) => x.email === 'admin@codeniac.dev');
  demoCache = { at: Date.now(), value: Boolean(u && verifyPassword('codeniac123', u.password)) };
  return demoCache.value;
}

// ---------- Público ----------
router.get('/system/info', (_req, res) => {
  const sys = systemConfig();
  res.json({
    appName: sys.appName, allowRegistration: sys.allowRegistration || db().users.length === 0,
    loginMessage: sys.loginMessage, version: APP_VERSION, images: sys.images,
    demoAccount: demoActive(),
  });
});

// Usado pelo atalho do Windows para saber se o app já está rodando.
router.get('/health', (_req, res) => res.json({ app: 'codeniac', version: APP_VERSION }));

// ---------- Autenticação (com limite de tentativas) ----------
const attempts = new Map(); // ip -> { n, until }
function tooMany(ip) {
  const a = attempts.get(ip);
  return a && a.n >= 8 && Date.now() < a.until;
}
function failed(ip) {
  const a = attempts.get(ip) || { n: 0, until: 0 };
  a.n = Date.now() > a.until ? 1 : a.n + 1;
  a.until = Date.now() + 10 * 60 * 1000;
  attempts.set(ip, a);
}

router.post('/auth/register', wrap(async (req, res) => {
  const name = str(req.body.name, 80);
  const email = str(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || '');
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return bad(res, 'Informe nome e e-mail válidos');
  if (password.length < 6) return bad(res, 'A senha precisa de pelo menos 6 caracteres');
  if (db().users.some((u) => u.email === email)) return bad(res, 'E-mail já cadastrado', 409);
  if (!systemConfig().allowRegistration && db().users.length) return bad(res, 'Novos cadastros estão desativados pelo administrador', 403);
  const user = createUser({ name, email, password });
  user.lastSeenVersion = APP_VERSION;
  save();
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
}));

router.post('/auth/login', wrap(async (req, res) => {
  const ip = req.socket.remoteAddress;
  if (tooMany(ip)) return bad(res, 'Muitas tentativas. Aguarde 10 minutos e tente de novo.', 429);
  const email = str(req.body.email, 120).toLowerCase();
  const user = db().users.find((u) => u.email === email);
  if (!user || !verifyPassword(String(req.body.password || ''), user.password)) {
    failed(ip);
    return bad(res, 'E-mail ou senha incorretos', 401);
  }
  attempts.delete(ip);
  user.lastLoginAt = now();
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);
  logEvent(user.id, 'system', 'login', local ? 'Entrou neste computador' : `Entrou de outro aparelho (${ip.replace('::ffff:', '')})`);
  save();
  res.json({ token: signToken(user), user: publicUser(user) });
}));

router.use(requireAuth);

router.get('/auth/me', (req, res) => {
  const sys = systemConfig();
  res.json({
    user: publicUser(req.user),
    settings: { ...DEFAULT_SETTINGS, ...(db().settings[req.user.id] || {}) },
    version: APP_VERSION,
    system: { appName: sys.appName, images: sys.images, menu: sys.menu },
  });
});

// ---------- Perfil ----------
router.put('/profile', (req, res) => {
  const u = req.user;
  const name = str(req.body.name, 80);
  const email = str(req.body.email, 120).toLowerCase();
  if (!name) return bad(res, 'Nome é obrigatório');
  if (email && email !== u.email) {
    if (!/^\S+@\S+\.\S+$/.test(email)) return bad(res, 'E-mail inválido');
    if (db().users.some((x) => x.email === email)) return bad(res, 'E-mail já em uso', 409);
    u.email = email;
  }
  u.name = name;
  u.bio = str(req.body.bio, 400);
  u.title = str(req.body.title, 60) || 'Membro';
  logEvent(u.id, 'settings', 'update', 'Perfil atualizado');
  save();
  res.json({ user: publicUser(u) });
});

router.put('/profile/password', (req, res) => {
  const { current, next: nextPwd } = req.body;
  if (!verifyPassword(String(current || ''), req.user.password)) return bad(res, 'Senha atual incorreta', 401);
  if (String(nextPwd || '').length < 6) return bad(res, 'A nova senha precisa de pelo menos 6 caracteres');
  req.user.password = hashPassword(String(nextPwd));
  save();
  notify(req.user.id, { type: 'system', title: 'Senha alterada', message: 'Sua senha foi atualizada com sucesso.' });
  logEvent(req.user.id, 'settings', 'update', 'Senha alterada');
  res.json({ ok: true });
});

router.post('/profile/avatar', single('image'), (req, res) => {
  if (!req.file) return bad(res, 'Nenhuma imagem enviada');
  removeUpload(req.user.avatar);
  req.user.avatar = `/uploads/${req.file.filename}`;
  logEvent(req.user.id, 'upload', 'create', 'Nova foto de perfil', { link: '#/profile' });
  save();
  res.json({ user: publicUser(req.user) });
});

router.delete('/profile/avatar', (req, res) => {
  removeUpload(req.user.avatar);
  req.user.avatar = null;
  save();
  res.json({ user: publicUser(req.user) });
});

// ---------- Configurações ----------
const HEX = /^#[0-9a-f]{6}$/i;
const oneOf = (list) => (v) => (list.includes(v) ? v : undefined);
const intIn = (min, max) => (v) => (Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max ? Number(v) : undefined);
const text = (max) => (v) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
const hhmm = (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : undefined);
const SETTINGS_SCHEMA = {
  theme: oneOf(THEMES),
  themeVars: (v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
    return Object.fromEntries(Object.entries(v).filter(([k, c]) => THEME_VAR_KEYS.includes(k) && HEX.test(c)));
  },
  radius: intIn(0, 24),
  fontScale: intIn(85, 120),
  fontFamily: oneOf(['poppins', 'system', 'mono', 'serif', 'retro']),
  density: oneOf(['comfortable', 'compact']),
  homePage: oneOf(['hoje', 'dashboard']),
  briefingTime: hhmm,
  dayCloseTime: hhmm,
  pomodoroMinutes: intIn(5, 90),
  englishDailyGoal: intIn(5, 200),
  readingYearGoal: intIn(1, 200),
  remindDaysBefore: intIn(0, 30),
  assistantPersonality: oneOf(PERSONALITIES),
  assistantLength: oneOf(['curta', 'media', 'detalhada']),
  assistantName: (v) => text(40)(v) || 'Niac',
  assistantAvatar: (v) => text(8)(v) || '🤖',
  assistantNickname: text(40),
  assistantInstructions: text(600),
  language: oneOf(['pt-BR']),
};

router.get('/settings', (req, res) => {
  res.json({ ...DEFAULT_SETTINGS, ...(db().settings[req.user.id] || {}) });
});

router.put('/settings', (req, res) => {
  const current = { ...DEFAULT_SETTINGS, ...(db().settings[req.user.id] || {}) };
  const changed = [];
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (!(key in req.body)) continue;
    const v = req.body[key];
    const clean = typeof DEFAULT_SETTINGS[key] === 'boolean' ? Boolean(v) : SETTINGS_SCHEMA[key]?.(v);
    if (clean !== undefined) { current[key] = clean; changed.push(key); }
  }
  db().settings[req.user.id] = current;
  if (changed.includes('theme')) logEvent(req.user.id, 'settings', 'update', `Tema alterado para ${current.theme}`);
  else if (changed.length) logEvent(req.user.id, 'settings', 'update', 'Configurações alteradas', { merge: 'settings' });
  save();
  res.json(current);
});

// ---------- Projetos ----------
router.get('/projects', (req, res) => {
  res.json(userProjects(req.user.id).map((p) => withStats(p, req.user.id)));
});

router.post('/projects', (req, res) => {
  const uid = req.user.id;
  const name = str(req.body.name, 60);
  if (!name) return bad(res, 'Nome do projeto é obrigatório');
  let slug = slugify(name);
  const taken = new Set(userProjects(uid).map((p) => p.slug));
  for (let i = 2; taken.has(slug); i++) slug = `${slugify(name)}-${i}`;
  const p = {
    id: id(), userId: uid, slug, name,
    icon: ICONS.includes(req.body.icon) ? req.body.icon : 'folder',
    color: HEX.test(req.body.color || '') ? req.body.color : '#1f8fff',
    tagline: str(req.body.tagline, 60), description: str(req.body.description, 300),
    cover: null, favorite: false, order: userProjects(uid).length, createdAt: now(), updatedAt: now(),
  };
  db().projects.push(p);
  ensureRootPage(p);
  save();
  logEvent(uid, 'project', 'create', `Projeto "${name}" criado`, { link: `#/project/${slug}` });
  notify(uid, { type: 'task', title: 'Novo projeto criado', message: `"${name}" foi adicionado ao seu hub.`, link: `#/project/${slug}` });
  res.status(201).json(withStats(p, uid));
});

router.put('/projects/:id', (req, res) => {
  const p = findOwned('projects', req.params.id, req.user.id);
  if (!p) return bad(res, 'Projeto não encontrado', 404);
  if ('name' in req.body) p.name = str(req.body.name, 60) || p.name;
  if ('tagline' in req.body) p.tagline = str(req.body.tagline, 60);
  if ('description' in req.body) p.description = str(req.body.description, 300);
  if (ICONS.includes(req.body.icon)) p.icon = req.body.icon;
  if (HEX.test(req.body.color || '')) p.color = req.body.color;
  if ('favorite' in req.body) p.favorite = Boolean(req.body.favorite);
  p.updatedAt = now();
  save();
  logEvent(req.user.id, 'project', 'update', `Projeto "${p.name}" editado`, { link: `#/project/${p.slug}`, merge: `project:${p.id}` });
  res.json(withStats(p, req.user.id));
});

router.post('/projects/:id/cover', single('image'), (req, res) => {
  const p = findOwned('projects', req.params.id, req.user.id);
  if (!p) return bad(res, 'Projeto não encontrado', 404);
  if (!req.file) return bad(res, 'Nenhuma imagem enviada');
  removeUpload(p.cover);
  p.cover = `/uploads/${req.file.filename}`;
  p.updatedAt = now();
  save();
  logEvent(req.user.id, 'upload', 'create', `Nova capa em "${p.name}"`, { link: `#/project/${p.slug}` });
  res.json(withStats(p, req.user.id));
});

router.delete('/projects/:id/cover', (req, res) => {
  const p = findOwned('projects', req.params.id, req.user.id);
  if (!p) return bad(res, 'Projeto não encontrado', 404);
  removeUpload(p.cover);
  p.cover = null;
  save();
  res.json(withStats(p, req.user.id));
});

router.delete('/projects/:id', (req, res) => {
  const d = db();
  const p = findOwned('projects', req.params.id, req.user.id);
  if (!p) return bad(res, 'Projeto não encontrado', 404);
  removeUpload(p.cover);
  d.projects = d.projects.filter((x) => x.id !== p.id);
  d.tasks = d.tasks.filter((x) => x.projectId !== p.id);
  d.notes = d.notes.filter((x) => x.projectId !== p.id);
  d.links = d.links.filter((x) => x.projectId !== p.id);
  const pageIds = new Set(d.pages.filter((x) => x.projectId === p.id).map((x) => x.id));
  d.pages.filter((x) => pageIds.has(x.id)).forEach((x) => removeUpload(x.cover));
  d.pages = d.pages.filter((x) => !pageIds.has(x.id));
  d.finance = d.finance.filter((x) => !pageIds.has(x.pageId));
  save();
  logEvent(req.user.id, 'project', 'delete', `Projeto "${p.name}" excluído`);
  res.json({ ok: true });
});

// ---------- Tarefas ----------
const projectOf = (t) => db().projects.find((p) => p.id === t.projectId);

export function createTask(uid, body) {
  const project = findOwned('projects', body.projectId, uid);
  if (!project) throw Object.assign(new Error('Projeto inválido'), { status: 400 });
  const title = str(body.title, 160);
  if (!title) throw Object.assign(new Error('Título é obrigatório'), { status: 400 });
  const t = {
    id: id(), userId: uid, projectId: project.id, title,
    description: str(body.description, 2000),
    status: STATUSES.includes(body.status) ? body.status : 'todo',
    priority: PRIORITIES.includes(body.priority) ? body.priority : 'medium',
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate || '') ? body.dueDate : null,
    recurrence: ['daily', 'weekly', 'monthly'].includes(body.recurrence) ? body.recurrence : null,
    postponed: 0, statusAt: now(),
    createdAt: now(), updatedAt: now(), completedAt: null,
  };
  if (t.status === 'done') t.completedAt = now();
  db().tasks.push(t);
  save();
  logEvent(uid, 'task', 'create', `Tarefa "${t.title}" criada`, { link: '#/tasks', detail: project.name });
  emit(uid, 'data', { kind: 'task' });
  return t;
}

function nextDate(date, rec) {
  const d = new Date(`${date || localDate()}T12:00:00`);
  if (rec === 'daily') d.setDate(d.getDate() + 1);
  if (rec === 'weekly') d.setDate(d.getDate() + 7);
  if (rec === 'monthly') d.setMonth(d.getMonth() + 1);
  return localDate(d);
}

export function updateTask(uid, taskId, body) {
  const t = findOwned('tasks', taskId, uid);
  if (!t) throw Object.assign(new Error('Tarefa não encontrada'), { status: 404 });
  const wasDone = t.status === 'done';
  const oldStatus = t.status;
  const oldDue = t.dueDate;
  if ('title' in body) t.title = str(body.title, 160) || t.title;
  if ('description' in body) t.description = str(body.description, 2000);
  if (STATUSES.includes(body.status)) t.status = body.status;
  if (PRIORITIES.includes(body.priority)) t.priority = body.priority;
  if ('recurrence' in body) t.recurrence = ['daily', 'weekly', 'monthly'].includes(body.recurrence) ? body.recurrence : null;
  if ('dueDate' in body) t.dueDate = /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate || '') ? body.dueDate : null;
  if (body.projectId && findOwned('projects', body.projectId, uid)) t.projectId = body.projectId;
  if (t.status !== oldStatus) t.statusAt = now();
  // Detector de procrastinação: conta quantas vezes o prazo foi empurrado para frente
  if (oldDue && t.dueDate && t.dueDate > oldDue) {
    t.postponed = (t.postponed || 0) + 1;
    logEvent(uid, 'task', 'postpone', `Prazo de "${t.title}" adiado (${t.postponed}ª vez)`, { link: '#/tasks', detail: `${oldDue} → ${t.dueDate}` });
  }
  t.updatedAt = now();
  if (!wasDone && t.status === 'done') {
    t.completedAt = now();
    const p = projectOf(t);
    logEvent(uid, 'task', 'done', `Tarefa "${t.title}" concluída`, { link: '#/tasks', detail: p?.name });
    notify(uid, { type: 'task', title: 'Tarefa concluída ✅', message: `"${t.title}" em ${p?.name}.`, link: '#/tasks' });
    // tarefa recorrente: cria a próxima ocorrência
    if (t.recurrence) {
      createTask(uid, { projectId: t.projectId, title: t.title, description: t.description, priority: t.priority, dueDate: nextDate(t.dueDate, t.recurrence), recurrence: t.recurrence });
    }
  } else if (t.status !== 'done') {
    t.completedAt = null;
    if (body.title || body.priority || body.description) logEvent(uid, 'task', 'update', `Tarefa "${t.title}" editada`, { link: '#/tasks', merge: `task:${t.id}` });
  }
  save();
  emit(uid, 'data', { kind: 'task' });
  return t;
}

router.get('/tasks', (req, res) => {
  let list = userTasks(req.user.id);
  const { projectId, status, priority, q } = req.query;
  if (projectId) list = list.filter((t) => t.projectId === projectId);
  if (status) list = list.filter((t) => t.status === status);
  if (priority) list = list.filter((t) => t.priority === priority);
  if (q) list = list.filter((t) => t.title.toLowerCase().includes(String(q).toLowerCase()));
  res.json(list.sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')));
});

router.post('/tasks', (req, res) => {
  try { res.status(201).json(createTask(req.user.id, req.body)); }
  catch (e) { bad(res, e.message, e.status || 400); }
});

router.put('/tasks/:id', (req, res) => {
  try { res.json(updateTask(req.user.id, req.params.id, req.body)); }
  catch (e) { bad(res, e.message, e.status || 400); }
});

router.delete('/tasks/:id', (req, res) => {
  const d = db();
  const t = findOwned('tasks', req.params.id, req.user.id);
  if (!t) return bad(res, 'Tarefa não encontrada', 404);
  d.tasks = d.tasks.filter((x) => x.id !== t.id);
  save();
  logEvent(req.user.id, 'task', 'delete', `Tarefa "${t.title}" excluída`);
  res.json({ ok: true });
});

// ---------- Uploads genéricos (imagens em páginas) ----------
router.post('/uploads', single('image'), (req, res) => {
  if (!req.file) return bad(res, 'Nenhuma imagem enviada');
  logEvent(req.user.id, 'upload', 'create', 'Imagem enviada', { merge: 'upload' });
  res.status(201).json({ url: `/uploads/${req.file.filename}` });
});

// ---------- Notificações ----------
router.get('/notifications', (req, res) => {
  const list = db().notifications.filter((n) => n.userId === req.user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ items: list.slice(0, 300), unread: list.filter((n) => !n.read).length });
});

router.get('/notifications/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('event: ready\ndata: {}\n\n');
  const off = subscribe(req.user.id, res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.socket.on('close', () => { clearInterval(ping); off(); });
});

router.put('/notifications/read-all', (req, res) => {
  db().notifications.forEach((n) => { if (n.userId === req.user.id) n.read = true; });
  save();
  res.json({ ok: true });
});

router.put('/notifications/:id/read', (req, res) => {
  const n = findOwned('notifications', req.params.id, req.user.id);
  if (!n) return bad(res, 'Notificação não encontrada', 404);
  n.read = req.body.read !== false;
  save();
  res.json(n);
});

router.delete('/notifications/:id', (req, res) => {
  const d = db();
  d.notifications = d.notifications.filter((n) => !(n.id === req.params.id && n.userId === req.user.id));
  save();
  res.json({ ok: true });
});

router.post('/notifications/broadcast', requireAdmin, (req, res) => {
  const title = str(req.body.title, 120);
  const message = str(req.body.message, 1000);
  if (!title || !message) return bad(res, 'Título e mensagem são obrigatórios');
  let count = 0;
  for (const u of db().users) if (notify(u.id, { type: 'update', title, message })) count++;
  res.json({ ok: true, delivered: count });
});

router.get('/changelog', (_req, res) => res.json({ version: APP_VERSION, entries: [...CHANGELOG].reverse() }));

// ---------- Dashboard & busca ----------
router.get('/dashboard', (req, res) => {
  const uid = req.user.id;
  const projects = userProjects(uid).map((p) => withStats(p, uid));
  const tasks = userTasks(uid);
  const today = localDate();
  const open = tasks.filter((t) => t.status !== 'done');
  const byProject = Object.fromEntries(projects.map((p) => [p.id, p]));
  const decorate = (t) => ({ ...t, project: { name: byProject[t.projectId]?.name, slug: byProject[t.projectId]?.slug, color: byProject[t.projectId]?.color, icon: byProject[t.projectId]?.icon } });
  const notifications = db().notifications.filter((n) => n.userId === uid).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const done = tasks.filter((t) => t.status === 'done').length;
  const month = today.slice(0, 7);
  const fin = db().finance.filter((f) => f.userId === uid && f.date.startsWith(month));
  const sum = (t) => Math.round(fin.filter((f) => f.type === t).reduce((a, f) => a + f.amount, 0) * 100) / 100;
  res.json({
    projects,
    totals: {
      projects: projects.length, tasks: tasks.length, done,
      open: open.length, overdue: open.filter((t) => t.dueDate && t.dueDate < today).length,
      progress: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
    },
    upcoming: open.filter((t) => t.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6).map(decorate),
    focus: open.filter((t) => t.priority === 'high').slice(0, 4).map(decorate),
    latestUpdate: db().notifications.filter((n) => n.userId === uid && n.type === 'update').at(-1) || null,
    pagesCount: db().pages.filter((pg) => pg.userId === uid && pg.parentId).length,
    financeMonth: { in: sum('in'), out: sum('out'), count: fin.length },
  });
});

router.get('/search', (req, res) => {
  const q = str(req.query.q, 80).toLowerCase();
  const empty = { projects: [], tasks: [], pages: [], cards: [], agenda: [] };
  if (!q) return res.json(empty);
  const uid = req.user.id;
  const d = db();
  const projects = userProjects(uid);
  const pname = Object.fromEntries(projects.map((p) => [p.id, p]));
  res.json({
    projects: projects.filter((p) => `${p.name} ${p.description}`.toLowerCase().includes(q)).slice(0, 5),
    tasks: userTasks(uid).filter((t) => t.title.toLowerCase().includes(q)).slice(0, 8)
      .map((t) => ({ ...t, projectSlug: pname[t.projectId]?.slug, projectName: pname[t.projectId]?.name })),
    pages: d.pages.filter((pg) => pg.userId === uid
        && `${pg.title} ${pg.blocks.map((b) => b.text || b.caption || '').join(' ')}`.toLowerCase().includes(q)).slice(0, 8)
      .map((pg) => ({ id: pg.id, title: pg.parentId ? pg.title : pname[pg.projectId]?.name, icon: pg.icon, root: !pg.parentId, projectSlug: pname[pg.projectId]?.slug, projectName: pname[pg.projectId]?.name })),
    cards: d.cards.filter((c) => c.userId === uid && `${c.front} ${c.back}`.toLowerCase().includes(q)).slice(0, 5),
    agenda: d.agenda.filter((a) => a.userId === uid && a.title.toLowerCase().includes(q)).slice(0, 5),
  });
});

// ---------- Exportação de dados ----------
router.get('/export', (req, res) => {
  const uid = req.user.id;
  const d = db();
  const mine = Object.fromEntries(USER_COLLECTIONS.map((c) => [c, d[c].filter((x) => x.userId === uid)]));
  res.set('Content-Disposition', `attachment; filename="codeniac-backup-${localDate()}.json"`);
  res.json({ exportedAt: now(), version: APP_VERSION, user: publicUser(req.user), settings: d.settings[uid], garage: d.garage[uid], budgets: d.budgets[uid], ...mine });
});

export default router;
