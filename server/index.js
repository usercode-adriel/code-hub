import './runtime.js'; // precisa ser o primeiro import
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import express from 'express';
import { load, saveNow, UPLOAD_DIR, APP_ROOT, DATA_DIR } from './db.js';
import { bootstrap, systemConfig } from './seed.js';
import { migrate } from './migrate.js';
import { requireAuth } from './auth.js';
import api from './routes/api.js';
import pages from './routes/pages.js';
import life from './routes/life.js';
import admin, { setRestart } from './routes/admin.js';
import aiRoutes from './ai.js';
import {
  chat, assistantMode, listConversations, getConversation, createConversation, renameConversation, deleteConversation,
} from './assistant.js';
import { startScheduler } from './scheduler.js';

load();
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
  const c = createConversation(req.user.id, req.body?.title || 'Nova conversa');
  res.status(201).json({ id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt, count: 0, last: null });
});
app.get('/api/assistant/conversations/:id', requireAuth, (req, res) => {
  const c = getConversation(req.user.id, req.params.id);
  if (!c) return res.status(404).json({ error: 'Conversa não encontrada' });
  res.json({ id: c.id, title: c.title, messages: c.display });
});
app.put('/api/assistant/conversations/:id', requireAuth, (req, res) => {
  const c = renameConversation(req.user.id, req.params.id, req.body?.title);
  if (!c) return res.status(404).json({ error: 'Conversa não encontrada' });
  res.json({ id: c.id, title: c.title });
});
app.delete('/api/assistant/conversations/:id', requireAuth, (req, res) => {
  deleteConversation(req.user.id, req.params.id);
  res.json({ ok: true });
});
app.post('/api/assistant/chat', requireAuth, async (req, res) => {
  const text = typeof req.body.message === 'string' ? req.body.message.trim().slice(0, 4000) : '';
  if (!text) return res.status(400).json({ error: 'Mensagem vazia' });
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const write = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  try {
    await chat(req.user, text, typeof req.body.conversationId === 'string' ? req.body.conversationId : null, write);
    write({ type: 'done' });
  } catch (err) {
    console.error('[assistente]', err);
    write({ type: 'error', text: 'Não consegui responder agora. Tente novamente.' });
  }
  res.end();
});

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
  fs.rmSync(TOKEN_FILE, { force: true });
  server.close();
  process.exit(0);
}

// Reinício pelo painel de administração: inicia um novo processo com os mesmos argumentos e encerra este.
setRestart(() => {
  saveNow();
  server.close();
  const env = { ...process.env, CODENIAC_RESTARTED: '1' };
  delete env.HOST; // o novo processo relê o .env (acesso pela rede pode ter mudado)
  const child = spawn(process.execPath, process.argv.slice(1), { detached: true, stdio: 'ignore', windowsHide: true, env, cwd: APP_ROOT });
  child.unref();
  setTimeout(() => process.exit(0), 200);
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, shutdown);
