// Desenvolvedor (só administrador): GitHub do próprio Codeniac. Token no .env; repositório, branch e modo no sistema.
import express from 'express';
import { db, save } from '../db.js';
import { requireAdmin } from '../auth.js';
import { systemConfig } from '../seed.js';
import { setEnvVar } from '../envfile.js';
import { logEvent } from '../notify.js';
import { ghConfig, ghToken, ghReady, testRepo, whoami, recentCommits, openPrs, updateStatus, applyUpdate, rollbackUpdate, listAppBackups } from '../github.js';
import { requestRestart } from '../agent.js';

const router = express.Router();
router.use(requireAdmin);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const REPO_RE = /^[\w.-]{1,100}\/[\w.-]{1,100}$/;
const BRANCH_RE = /^[\w./-]{1,80}$/;
const TOKEN_RE = /^[\w-]{20,255}$/;

const status = () => {
  const c = ghConfig();
  return { tokenSet: Boolean(ghToken()), tokenHint: ghToken() ? `…${ghToken().slice(-4)}` : null, repo: c.repo, branch: c.branch, mode: c.mode, devMode: c.devMode, ready: ghReady(), backups: listAppBackups().slice(0, 5) };
};

router.get('/dev/status', (_req, res) => res.json(status()));

router.put('/dev/config', (req, res) => {
  const c = systemConfig().github; const b = req.body || {};
  if ('repo' in b) { const r = String(b.repo || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, ''); if (r && !REPO_RE.test(r)) return bad(res, 'Use o formato dono/repositório, por exemplo usercode-adriel/code-hub'); c.repo = r; }
  if ('branch' in b) { const br = String(b.branch || '').trim(); if (!BRANCH_RE.test(br)) return bad(res, 'Nome de branch inválido'); c.branch = br; }
  if ('mode' in b && ['pr', 'direct'].includes(b.mode)) c.mode = b.mode;
  if ('devMode' in b) { if (b.devMode && !ghReady()) return bad(res, 'Configure o token e o repositório antes de ligar o modo desenvolvedor.'); c.devMode = Boolean(b.devMode); }
  save();
  logEvent(req.user.id, 'system', 'update', 'Configurações do GitHub alteradas');
  res.json(status());
});

router.put('/dev/token', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const repo = systemConfig().github.repo;
  if (!TOKEN_RE.test(token)) return bad(res, 'Token inválido. Copie o token inteiro do GitHub (começa com github_pat_ ou ghp_).');
  try {
    if (repo) {
      const r = await testRepo(token, repo);
      if (!r.canPush) return bad(res, `O token enxerga ${r.name}, mas não tem permissão de escrita. Crie o token com “Contents: Read and write” e “Pull requests: Read and write”.`);
    } else await whoami(token);
  } catch (err) { return bad(res, err.message); }
  setEnvVar('CODENIAC_GITHUB_TOKEN', token);
  logEvent(req.user.id, 'system', 'update', 'Token do GitHub configurado');
  res.json(status());
});

router.delete('/dev/token', (req, res) => {
  setEnvVar('CODENIAC_GITHUB_TOKEN', '');
  systemConfig().github.devMode = false; save();
  logEvent(req.user.id, 'system', 'update', 'Token do GitHub removido');
  res.json(status());
});

router.post('/dev/test', async (_req, res) => {
  if (!ghReady()) return bad(res, 'Informe o token e o repositório');
  try { const r = await testRepo(ghToken(), ghConfig().repo); res.json({ ok: true, ...r, commits: await recentCommits(3).catch(() => []), prs: await openPrs().catch(() => []) }); }
  catch (err) { bad(res, err.message); }
});

router.get('/dev/changes', async (_req, res) => {
  if (!ghReady()) return bad(res, 'Configure o GitHub primeiro');
  try { res.json(await updateStatus()); } catch (err) { bad(res, err.message); }
});

router.post('/dev/update', async (req, res) => {
  if (!ghReady()) return bad(res, 'Configure o GitHub primeiro');
  try {
    const r = await applyUpdate();
    logEvent(req.user.id, 'system', 'update', `Sistema atualizado pelo GitHub (${r.applied} arquivo(s))`);
    res.json(r);
    if (r.applied > 0) requestRestart();
  } catch (err) { bad(res, err.message); }
});

router.post('/dev/rollback', (req, res) => {
  try {
    const r = rollbackUpdate(req.body?.name);
    logEvent(req.user.id, 'system', 'update', 'Atualização do GitHub desfeita');
    res.json(r);
    requestRestart();
  } catch (err) { bad(res, err.message); }
});

// Histórico do que a IA propôs/alterou no código.
router.get('/dev/log', (req, res) => {
  res.json(db().aiActions.filter((a) => /^repo_/.test(a.tool)).slice(-40).reverse()
    .map(({ id, tool, summary, status: st, at, link, detail }) => ({ id, tool, summary, status: st, at, link: link || null, detail: detail || null })));
});

export default router;
