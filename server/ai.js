// Rotas da página "IA local" (opcional): status do Ollama, escolha do modelo e download com progresso.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { DATA_DIR } from './db.js';
import { logEvent } from './notify.js';
import { requireAuth, requireAdmin } from './auth.js';
import {
  aiConfig, saveAiConfig, ollamaState, refreshOllama, assistantMode, effectiveModel, CATALOG, recommendModel, PROVIDERS,
  hasGemini, testGeminiKey, GEMINI_MODELS,
} from './assistant.js';

const router = express.Router();
router.use(requireAuth);
const MODEL_RE = /^[\w.\-:/]{1,80}$/;

function status(req) {
  return {
    mode: assistantMode(), config: aiConfig(), providers: PROVIDERS, model: effectiveModel(), ollama: ollamaState,
    ramGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10, recommended: recommendModel(), catalog: CATALOG,
    claudeKey: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN), isAdmin: req.user.role === 'admin',
    gemini: { configured: hasGemini(), hint: hasGemini() && req.user.role === 'admin' ? `…${process.env.GEMINI_API_KEY.slice(-4)}` : null, models: GEMINI_MODELS },
  };
}

router.get('/status', async (req, res) => {
  if (req.query.refresh) await refreshOllama();
  res.json(status(req));
});

router.put('/config', requireAdmin, async (req, res) => {
  saveAiConfig(req.body || {});
  if (['auto', 'ollama'].includes(aiConfig().provider)) await refreshOllama();
  res.json(status(req));
});

// ---------- Chave do Gemini (só administrador). Fica no .env da pasta de dados, fora do banco e dos backups. ----------
const ENV_FILE = () => path.join(DATA_DIR, '.env');
function setEnvVar(name, value) {
  let env = fs.existsSync(ENV_FILE()) ? fs.readFileSync(ENV_FILE(), 'utf8') : '';
  env = env.replace(new RegExp(`^[ \\t]*${name}[ \\t]*=.*(\\r?\\n)?`, 'gm'), '');
  if (value) env = `${env}${env && !/\n$/.test(env) ? '\r\n' : ''}${name}=${value}\r\n`;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(ENV_FILE(), env, { mode: 0o600 });
  if (value) process.env[name] = value; else delete process.env[name];
}

router.put('/gemini-key', requireAdmin, async (req, res) => {
  const key = String(req.body?.key || '').trim();
  if (!/^[\w.\-]{20,200}$/.test(key)) return res.status(400).json({ error: 'Chave inválida. Copie a chave inteira do Google AI Studio.' });
  const test = await testGeminiKey(key).catch((e) => ({ ok: false, error: e.message }));
  if (!test.ok) return res.status(400).json({ error: `O Google recusou a chave: ${test.error}` });
  setEnvVar('GEMINI_API_KEY', key);
  if (aiConfig().provider === 'local') saveAiConfig({ provider: 'gemini' });
  logEvent(req.user.id, 'system', 'update', 'Chave do Gemini configurada');
  res.json(status(req));
});

router.delete('/gemini-key', requireAdmin, (req, res) => {
  setEnvVar('GEMINI_API_KEY', '');
  if (aiConfig().provider === 'gemini') saveAiConfig({ provider: 'local' });
  logEvent(req.user.id, 'system', 'update', 'Chave do Gemini removida');
  res.json(status(req));
});

router.post('/pull', requireAdmin, async (req, res) => {
  const model = String(req.body?.model || '');
  if (!MODEL_RE.test(model)) return res.status(400).json({ error: 'Nome de modelo inválido' });
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  const ctrl = new AbortController();
  res.on('close', () => { if (!res.writableEnded) ctrl.abort(); }); // só cancela se o navegador desconectar
  try {
    const r = await fetch(`${aiConfig().ollamaUrl}/api/pull`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model, stream: true }), signal: ctrl.signal });
    if (!r.ok || !r.body) throw new Error(`Ollama respondeu ${r.status}`);
    const decoder = new TextDecoder();
    let buf = '';
    let ok = false;
    for await (const chunk of r.body) {
      buf += decoder.decode(chunk, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const obj = JSON.parse(line);
        if (obj.error) throw new Error(obj.error);
        if (obj.status === 'success') ok = true;
        send({ type: 'progress', status: obj.status, total: obj.total || 0, completed: obj.completed || 0 });
      }
    }
    await refreshOllama();
    if (ok && !aiConfig().model) saveAiConfig({ model });
    send({ type: ok ? 'done' : 'error', text: ok ? 'Modelo pronto!' : 'O download terminou sem confirmação.', status: status(req) });
  } catch (err) {
    if (err.name !== 'AbortError') send({ type: 'error', text: err.cause?.code === 'ECONNREFUSED' ? 'O Ollama não está aberto neste computador.' : err.message });
  }
  res.end();
});

router.delete('/models/:name', requireAdmin, async (req, res) => {
  const model = req.params.name;
  if (!MODEL_RE.test(model)) return res.status(400).json({ error: 'Nome de modelo inválido' });
  try {
    const r = await fetch(`${aiConfig().ollamaUrl}/api/delete`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }) });
    if (!r.ok) throw new Error(`Ollama respondeu ${r.status}`);
    await refreshOllama();
    if (aiConfig().model === model) saveAiConfig({ model: '' });
    res.json(status(req));
  } catch (err) { res.status(502).json({ error: err.message }); }
});

export default router;
