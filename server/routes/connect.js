// Conexões: Telegram, notificações no celular (Web Push) e HTTPS pelo Tailscale (necessário para o app no celular).
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import express from 'express';
import { requireAdmin } from '../auth.js';
import { logEvent } from '../notify.js';
import { setEnvVar } from '../ai.js';
import { testTelegramToken, startTelegram, stopTelegram, telegramInfo, linkCode, unlink } from '../telegram.js';
import { pushPublicKey, addSubscription, removeSubscription, pushTo } from '../push.js';
import { db, save } from '../db.js';

const router = express.Router();
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

// ---------- Telegram ----------
router.get('/telegram', (req, res) => res.json({ ...telegramInfo(req.user.id), isAdmin: req.user.role === 'admin' }));
router.put('/telegram/token', requireAdmin, async (req, res) => {
  const tok = String(req.body?.token || '').trim();
  if (!/^\d{5,12}:[\w-]{30,60}$/.test(tok)) return bad(res, 'Token inválido. Copie o token inteiro que o @BotFather enviou (números:letras).');
  const t = await testTelegramToken(tok);
  if (!t.ok) return bad(res, `O Telegram recusou o token: ${t.error}`);
  setEnvVar('TELEGRAM_BOT_TOKEN', tok);
  startTelegram();
  logEvent(req.user.id, 'system', 'update', `Telegram configurado (@${t.bot.username})`);
  res.json({ ok: true, bot: { username: t.bot.username, name: t.bot.first_name } });
});
router.delete('/telegram/token', requireAdmin, (req, res) => { setEnvVar('TELEGRAM_BOT_TOKEN', ''); stopTelegram(); res.json({ ok: true }); });
router.post('/telegram/code', (req, res) => res.json({ code: linkCode(req.user.id), expiresInMin: 15 }));
router.put('/telegram/prefs', (req, res) => {
  const t = ((db().userMeta[req.user.id] ??= {}).telegram ??= {});
  if ('forward' in (req.body || {})) t.forward = Boolean(req.body.forward);
  save();
  res.json(telegramInfo(req.user.id));
});
router.delete('/telegram/link', (req, res) => { unlink(req.user.id); res.json({ ok: true }); });

// ---------- Notificações no celular ----------
router.get('/push/key', (_req, res) => res.json({ publicKey: pushPublicKey() }));
router.post('/push/subscribe', (req, res) => {
  try { addSubscription(req.user.id, req.body?.subscription, req.body?.device); res.json({ ok: true }); } catch (err) { bad(res, err.message); }
});
router.post('/push/unsubscribe', (req, res) => { removeSubscription(req.user.id, String(req.body?.endpoint || '')); res.json({ ok: true }); });
router.post('/push/test', async (req, res) => {
  const n = await pushTo(req.user.id, { title: 'Codeniac ✨', body: 'Notificações funcionando! Seus personagens e lembretes vão chegar assim.', url: '/#/dashboard', tag: 'teste' });
  res.json({ sent: n });
});
router.get('/push/devices', (req, res) => res.json((db().userMeta[req.user.id]?.push || []).map((s) => ({ device: s.device, at: s.at, endpoint: s.endpoint }))));

// ---------- Tailscale (HTTPS para o app no celular) ----------
const TS_BIN = process.platform === 'win32'
  ? ['C:\\Program Files\\Tailscale\\tailscale.exe', 'C:\\Program Files (x86)\\Tailscale\\tailscale.exe'].find((p) => fs.existsSync(p)) || 'tailscale'
  : 'tailscale';
const ts = (args, timeout = 20000) => new Promise((resolve) => {
  execFile(TS_BIN, args, { timeout, windowsHide: true }, (err, stdout, stderr) => resolve({ ok: !err, code: err?.code, stdout: String(stdout || ''), stderr: String(stderr || '') }));
});
router.get('/admin/tailscale', requireAdmin, async (_req, res) => {
  const st = await ts(['status', '--json']);
  if (!st.ok && (st.code === 'ENOENT' || /not found|não é reconhecido/i.test(st.stderr))) return res.json({ installed: false });
  let info = {};
  try { info = JSON.parse(st.stdout); } catch { /* sem json */ }
  const dns = (info.Self?.DNSName || '').replace(/\.$/, '');
  const serve = await ts(['serve', 'status', '--json']);
  let serving = false;
  try { const j = JSON.parse(serve.stdout || '{}'); serving = Boolean(j.Web && Object.keys(j.Web).length) || Boolean(j.TCP && Object.keys(j.TCP).length); } catch { serving = /https:\/\//.test(serve.stdout); }
  res.json({ installed: true, running: info.BackendState === 'Running', dnsName: dns, url: dns ? `https://${dns}` : null, serving, message: st.ok ? null : st.stderr.trim().slice(0, 300) });
});
router.post('/admin/tailscale/serve', requireAdmin, async (req, res) => {
  const port = String(Number(process.env.PORT) || 3000);
  const r = req.body?.enable === false ? await ts(['serve', 'reset']) : await ts(['serve', '--bg', port], 30000);
  const out = `${r.stdout}\n${r.stderr}`.trim().slice(0, 800);
  if (!r.ok) return res.status(400).json({ error: out || 'O Tailscale não aceitou o comando.', needsLink: /https:\/\/login\.tailscale\.com\S*/.exec(out)?.[0] || null });
  logEvent(req.user.id, 'system', 'update', req.body?.enable === false ? 'HTTPS do Tailscale desligado' : 'HTTPS do Tailscale ligado');
  res.json({ ok: true, output: out });
});

export default router;
