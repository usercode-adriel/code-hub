// Rotas da página "IA local" (opcional): status do Ollama, escolha do modelo e download com progresso.
import os from 'node:os';
import express from 'express';
import { requireAuth, requireAdmin } from './auth.js';
import {
  aiConfig, saveAiConfig, ollamaState, refreshOllama, assistantMode, effectiveModel, CATALOG, recommendModel, PROVIDERS,
} from './assistant.js';

const router = express.Router();
router.use(requireAuth);
const MODEL_RE = /^[\w.\-:/]{1,80}$/;

function status(req) {
  return {
    mode: assistantMode(), config: aiConfig(), providers: PROVIDERS, model: effectiveModel(), ollama: ollamaState,
    ramGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10, recommended: recommendModel(), catalog: CATALOG,
    claudeKey: Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN), isAdmin: req.user.role === 'admin',
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
