import './runtime.js'; // precisa ser o primeiro import
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import express from 'express';
import { load, saveNow, UPLOAD_DIR, APP_ROOT, DATA_DIR, db } from './db.js';
import { bootstrap, systemConfig } from './seed.js';
import { migrate } from './migrate.js';
import { requireAuth } from './auth.js';
import api from './routes/api.js';
import pages from './routes/pages.js';
import life from './routes/life.js';
import admin, { setRestart } from './routes/admin.js';
import aiRoutes from './ai.js';
import library, { loadLibrary, saveLibraryNow } from './library.js';
import chatFiles from './routes/chatfiles.js';
import { confirmAction, undoAction, actionStatuses } from './agent.js';
import {
  chat, assistantMode, sendProactive, groupMembers, listConversations, getConversation, createConversation, renameConversation, deleteConversation,
} from './assistant.js';
import { startScheduler } from './scheduler.js';

load();
loadLibrary();
migrate();
bootstrap();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(APP_ROOT, 'public');

app.disable('x-powered-by');
app.use(express.json({ limit: '4mb' }));
app.use((_req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
  next();
});

// CSS personalizado pelo administrador (Configurações → Administração → Avançado)
app.get('/custom.css', (_req, res) => {
  res.type('text/css').set('Cache-Control', 'no-cache').send(systemConfig().customCss || '');
});

// Assistente: conversas + resposta em streaming (SSE sobre POST)
app.get('/api/assistant/status', requireAuth, (_req, res) => res.json({ mode: assistantMode() }));
app.get('/api/assistant/conversations', requireAuth, (req, res) => res.json(listConversations(req.user.id)));
app.post('/api/assistant/conversations', requireAuth, (req, res) => {
  if (req.body?.group) {
    const g = cleanGroup(req.user.id, req.body.group);
    if (g.error) return res.status(400).json({ error: g.error });
    const c = createConversation(req.user.id, g.name, null, g);
    return res.status(201).json({ id: c.id, title: c.title, botId: null, group: g, createdAt: c.createdAt, updatedAt: c.updatedAt, count: 0, unread: 0, last: null });
  }
  const bot = req.body?.botId ? db().bots.find((b) => b.id === req.body.botId && b.userId === req.user.id) : null;
  if (req.body?.botId && !bot) return res.status(404).json({ error: 'Personagem não encontrado' });
  const c = createConversation(req.user.id, req.body?.title || (bot ? `Chat com ${bot.name}` : 'Nova conversa'), bot);
  const last = c.display.at(-1);
  res.status(201).json({ id: c.id, title: c.title, botId: c.botId, createdAt: c.createdAt, updatedAt: c.updatedAt, count: c.display.length, last: last ? { role: last.role, text: last.text } : null });
});
app.get('/api/assistant/conversations/:id', requireAuth, (req, res) => {
  const c = getConversation(req.user.id, req.params.id);
  if (!c) return res.status(404).json({ error: 'Conversa não encontrada' });
  if (c.unread) { c.unread = 0; saveNow(); }
  const actionIds = c.display.flatMap((m) => (m.actions || []).map((a) => a.id));
  res.json({ id: c.id, title: c.title, botId: c.botId || null, group: c.group || null, actionStatus: actionStatuses(req.user, actionIds), members: c.group ? groupMembers(req.user, c).map(({ id: mid, name, avatar, color, personality }) => ({ id: mid, name, avatar, color, personality })) : null, messages: c.display });
});
app.put('/api/assistant/conversations/:id', requireAuth, (req, res) => {
  const c = renameConversation(req.user.id, req.params.id, req.body?.title || getConversation(req.user.id, req.params.id)?.title);
  if (!c) return res.status(404).json({ error: 'Conversa não encontrada' });
  if (c.group && req.body?.group) {
    const g = cleanGroup(req.user.id, req.body.group);
    if (g.error) return res.status(400).json({ error: g.error });
    c.group = g; c.title = g.name; saveNow();
  }
  res.json({ id: c.id, title: c.title });
});
app.delete('/api/assistant/conversations/:id', requireAuth, (req, res) => {
  deleteConversation(req.user.id, req.params.id);
  res.json({ ok: true });
});
app.post('/api/assistant/chat', requireAuth, async (req, res) => {
  const text = typeof req.body.message === 'string' ? req.body.message.trim().slice(0, 4000) : '';
  const files = Array.isArray(req.body.files) ? req.body.files.slice(0, 6).filter((f) => f && typeof f.file === 'string') : [];
  const auto = req.body.auto === true;
  if (!text && !files.length && !auto) return res.status(400).json({ error: 'Mensagem vazia' });
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const write = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  try {
    await chat(req.user, text, typeof req.body.conversationId === 'string' ? req.body.conversationId : null, write, { files, auto });
    write({ type: 'done' });
  } catch (err) {
    console.error('[assistente]', err);
    write({ type: 'error', text: 'Não consegui responder agora. Tente novamente.' });
  }
  res.end();
});

// Anexos do chat (fotos e PDFs) e "mandar mensagem agora" de um personagem.
app.use('/api/assistant/files', requireAuth, chatFiles);
app.post('/api/assistant/bots/:id/ping', requireAuth, async (req, res) => {
  const bot = db().bots.find((b) => b.id === req.params.id && b.userId === req.user.id);
  if (!bot) return res.status(404).json({ error: 'Personagem não encontrado' });
  try { res.json(await sendProactive(req.user, bot)); } catch (err) { res.status(500).json({ error: err.message }); }
});
// Ações da IA: confirmar (ou cancelar) e desfazer.
app.post('/api/assistant/actions/:id/confirm', requireAuth, (req, res) => {
  try { const a = confirmAction(req.user, req.params.id, req.body?.accept !== false); res.json({ id: a.id, status: a.status, summary: a.summary }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.post('/api/assistant/actions/:id/undo', requireAuth, (req, res) => {
  try { const a = undoAction(req.user, req.params.id); res.json({ id: a.id, status: a.status, summary: a.summary }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
app.get('/api/assistant/actions', requireAuth, (req, res) => {
  res.json(db().aiActions.filter((a) => a.userId === req.user.id).slice(-100).reverse()
    .map(({ id: aid, tool, summary, status, at, botId }) => ({ id: aid, tool, summary, status, at, botId })));
});
// Memórias da IA sobre o usuário
app.get('/api/assistant/memories', requireAuth, (req, res) => res.json(db().memories.filter((m) => m.userId === req.user.id).reverse()));
app.post('/api/assistant/memories', requireAuth, (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 300);
  if (!text) return res.status(400).json({ error: 'Escreva a memória' });
  const m = { id: crypto.randomUUID(), userId: req.user.id, text, botId: null, source: 'usuario', createdAt: new Date().toISOString() };
  db().memories.push(m); saveNow(); res.status(201).json(m);
});
app.delete('/api/assistant/memories/:id', requireAuth, (req, res) => {
  db().memories = db().memories.filter((m) => !(m.id === req.params.id && m.userId === req.user.id)); saveNow(); res.json({ ok: true });
});

function cleanGroup(userId, g) {
  const name = String(g.name || '').trim().slice(0, 60);
  if (!name) return { error: 'Dê um nome ao grupo' };
  const ids = new Set(db().bots.filter((b) => b.userId === userId).map((b) => b.id));
  const members = [...new Set((Array.isArray(g.members) ? g.members : []).filter((m) => m === 'niac' || ids.has(m)))].slice(0, 8);
  if (members.length < 2) return { error: 'Escolha pelo menos 2 participantes' };
  const avatar = /^\/uploads\/[\w.-]+$/.test(g.avatar || '') ? g.avatar : null;
  return { name, members, avatar, description: String(g.description || '').slice(0, 300) };
}

// Encerramento local seguro (atalho "Parar Codeniac"): só da própria máquina e com o token da pasta de dados.
const CONTROL_TOKEN = crypto.randomBytes(24).toString('hex');
const TOKEN_FILE = path.join(DATA_DIR, '.control-token');
fs.writeFileSync(TOKEN_FILE, CONTROL_TOKEN);
app.post('/api/system/shutdown', (req, res) => {
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  const given = Buffer.from(String(req.get('x-codeniac-control') || ''));
  const ok = local && given.length === CONTROL_TOKEN.length && crypto.timingSafeEqual(given, Buffer.from(CONTROL_TOKEN));
  if (!ok) return res.status(403).json({ error: 'Proibido' });
  res.json({ ok: true });
  console.log('» Encerrado pelo atalho "Parar Codeniac".');
  setTimeout(shutdown, 100);
});

app.use('/api/ai', aiRoutes);
app.use('/api/library', requireAuth, library);
app.use('/api', api);
app.use('/api', requireAuth, pages);
app.use('/api', requireAuth, life);
app.use('/api/admin', requireAuth, admin);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', fallthrough: false }));
app.use(express.static(PUBLIC, { extensions: ['html'] }));
app.get('*', (_req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'Erro interno do servidor' });
});

// Só escuta na máquina local, a não ser que o acesso pelo celular esteja ligado (HOST=0.0.0.0 no .env).
const HOST = process.env.HOST || '127.0.0.1';
let server;
function listen(attempt = 0) {
  server = app.listen(PORT, HOST, () => {
    console.log(`» Codeniac rodando em http://localhost:${PORT}${HOST === '0.0.0.0' ? ' (acesso pela rede ligado)' : ''}  (assistente: ${assistantMode()})`);
  });
  server.on('error', (err) => {
    // logo após um reinício a porta pode levar um instante para ser liberada
    if (err.code === 'EADDRINUSE' && process.env.CODENIAC_RESTARTED && attempt < 20) { setTimeout(() => listen(attempt + 1), 500); return; }
    if (err.code === 'EADDRINUSE') console.error(`» A porta ${PORT} já está em uso. O Codeniac provavelmente já está aberto.`);
    else console.error(err);
    process.exit(1);
  });
}
listen();
startScheduler();

function shutdown() {
  saveNow();
  saveLibraryNow();
  fs.rmSync(TOKEN_FILE, { force: true });
  server.close();
  process.exit(0);
}

// Reinício pelo painel de administração: inicia um novo processo com os mesmos argumentos e encerra este.
setRestart(() => {
  saveNow();
  saveLibraryNow();
  server.close();
  const env = { ...process.env, CODENIAC_RESTARTED: '1' };
  delete env.HOST; // o novo processo relê o .env (acesso pela rede pode ter mudado)
  const child = spawn(process.execPath, process.argv.slice(1), { detached: true, stdio: 'ignore', windowsHide: true, env, cwd: APP_ROOT });
  child.unref();
  setTimeout(() => process.exit(0), 200);
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, shutdown);
