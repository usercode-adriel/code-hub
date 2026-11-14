// Acesso ao GitHub pela API (sem precisar do git instalado): ler o código, propor alterações (branch + pull request)
// e atualizar este computador com o que está no GitHub. O token fica só em DATA_DIR/.env.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { APP_ROOT, DATA_DIR } from './db.js';
import { systemConfig } from './seed.js';

const API = () => (process.env.GITHUB_API_BASE || 'https://api.github.com').replace(/\/$/, '');
export const ghConfig = () => systemConfig().github;
export const ghToken = () => process.env.CODENIAC_GITHUB_TOKEN || '';
export const ghReady = () => Boolean(ghToken() && ghConfig().repo);
export const ghDevOn = () => ghReady() && ghConfig().devMode === true;

// Só arquivos de texto do próprio sistema; segredos, dependências e binários ficam de fora.
const ROOTS = /^(server|public|installer)\//;
const ROOT_FILES = /^(README\.md|HOSPEDAR\.md|package\.json|Dockerfile|\.dockerignore)$/;
const TEXT_EXT = /\.(js|mjs|cjs|css|html|json|md|txt|webmanifest|svg|nsi|vbs|sh|py)$/i;
const DENY = /(^|\/)(\.env[^/]*|node_modules|\.git|\.github|package-lock\.json)(\/|$)/i;
export const SENSITIVE_FILES = /^server\/(auth|agent|github|db|index)\.js$|^server\/routes\/(dev|admin|connect)\.js$/;
export function checkPath(p) {
  const clean = String(p || '').replace(/\\/g, '/').replace(/^\.?\//, '');
  if (!clean || clean.includes('..') || clean.startsWith('/') || DENY.test(clean)) throw new Error(`Caminho não permitido: ${p}`);
  if (!(ROOTS.test(clean) || ROOT_FILES.test(clean))) throw new Error(`Só posso mexer em server/, public/, installer/ e nos arquivos principais (README, package.json...). Recebi: ${p}`);
  if (!TEXT_EXT.test(clean) && !ROOT_FILES.test(clean)) throw new Error(`Só edito arquivos de texto (${p}).`);
  return clean;
}

async function gh(route, { method = 'GET', body, token = ghToken(), raw = false } = {}) {
  const res = await fetch(`${API()}${route}`, {
    method, signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Codeniac', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text.slice(0, 200) }; }
  if (!res.ok) {
    const e = new Error(
      res.status === 401 ? 'O GitHub recusou o token (inválido ou expirado).'
        : res.status === 404 ? 'Não encontrei esse repositório/arquivo, ou o token não tem acesso a ele.'
          : res.status === 403 ? `O GitHub negou o acesso: ${data.message || 'permissão insuficiente (o token precisa de “Contents” e “Pull requests” com escrita).'}`
            : res.status === 409 ? `Conflito no GitHub: ${data.message || ''}`
              : res.status === 422 ? `O GitHub não aceitou o pedido: ${data.message || ''} ${JSON.stringify(data.errors || '').slice(0, 160)}`
                : `GitHub respondeu ${res.status}: ${data.message || ''}`);
    e.status = res.status;
    throw e;
  }
  return data;
}
const repoPath = (extra = '') => `/repos/${ghConfig().repo}${extra}`;
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

export async function testRepo(token, repo) {
  const r = await gh(`/repos/${repo}`, { token });
  return { name: r.full_name, defaultBranch: r.default_branch, private: r.private, canPush: Boolean(r.permissions?.push) };
}
export async function whoami(token) { const u = await gh('/user', { token }); return { login: u.login }; }

// ---------- leitura ----------
const treeCache = { at: 0, ref: '', list: [] };
export async function tree(ref = ghConfig().branch) {
  if (treeCache.ref === ref && Date.now() - treeCache.at < 20000) return treeCache.list;
  const r = await gh(repoPath(`/git/trees/${encodeURIComponent(ref)}?recursive=1`));
  const list = (r.tree || []).filter((t) => t.type === 'blob').map((t) => ({ path: t.path, sha: t.sha, size: t.size }));
  Object.assign(treeCache, { at: Date.now(), ref, list });
  return list;
}
const blobCache = new Map();
async function blobText(sha) {
  if (blobCache.has(sha)) return blobCache.get(sha);
  const b = await gh(repoPath(`/git/blobs/${sha}`));
  const text = Buffer.from(b.content || '', 'base64').toString('utf8');
  blobCache.set(sha, text);
  if (blobCache.size > 400) blobCache.delete(blobCache.keys().next().value);
  return text;
}

export async function readRaw(p) {
  const f = (await tree()).find((x) => x.path === p);
  return f ? blobText(f.sha) : null;
}

export async function listDir(dir = '') {
  const d = String(dir || '').replace(/^\/+|\/+$/g, '');
  const all = await tree();
  const seen = new Map();
  for (const f of all) {
    if (d && !f.path.startsWith(`${d}/`)) continue;
    const rest = d ? f.path.slice(d.length + 1) : f.path;
    const i = rest.indexOf('/');
    if (i < 0) seen.set(rest, { name: rest, tipo: 'arquivo', bytes: f.size });
    else if (!seen.has(rest.slice(0, i))) seen.set(rest.slice(0, i), { name: rest.slice(0, i), tipo: 'pasta' });
  }
  return [...seen.values()].filter((x) => !DENY.test(x.name)).sort((a, b) => (a.tipo === b.tipo ? a.name.localeCompare(b.name) : a.tipo === 'pasta' ? -1 : 1));
}

export async function readFile(p, from = 1, to = 400) {
  const clean = String(p || '').replace(/\\/g, '/').replace(/^\.?\//, '');
  if (!clean || clean.includes('..') || DENY.test(clean)) throw new Error(`Caminho não permitido: ${p}`);
  const f = (await tree()).find((x) => x.path === clean);
  if (!f) throw new Error(`O arquivo ${clean} não existe no GitHub (branch ${ghConfig().branch}). Use repo_listar para ver os nomes.`);
  if (!TEXT_EXT.test(clean) && !ROOT_FILES.test(clean)) throw new Error('Esse arquivo não é de texto');
  const text = await blobText(f.sha);
  const lines = text.split('\n');
  const a = Math.max(1, Number(from) || 1); const b = Math.min(lines.length, Math.max(a, Number(to) || a + 399), a + 599);
  return { path: clean, sha: f.sha, totalLinhas: lines.length, de: a, ate: b, texto: lines.slice(a - 1, b).map((l, i) => `${a + i}| ${l}`).join('\n'), completo: a === 1 && b === lines.length, bruto: text };
}

export async function grepRepo(query, { regex = false, pasta = '', max = 30 } = {}) {
  const q = String(query || '');
  if (!q) throw new Error('Informe o texto a procurar');
  let re;
  try { re = regex ? new RegExp(q, 'i') : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); } catch { throw new Error('Expressão regular inválida'); }
  const base = String(pasta || '').replace(/^\/+|\/+$/g, '');
  const files = (await tree()).filter((f) => (ROOTS.test(f.path) || ROOT_FILES.test(f.path)) && TEXT_EXT.test(f.path) && !DENY.test(f.path) && (!base || f.path.startsWith(base)) && (f.size || 0) < 400000).slice(0, 250);
  const out = [];
  let i = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (i < files.length && out.length < max) {
      const f = files[i++];
      let text; try { text = await blobText(f.sha); } catch { continue; }
      const lines = text.split('\n');
      for (let n = 0; n < lines.length && out.length < max; n++) if (re.test(lines[n])) out.push({ arquivo: f.path, linha: n + 1, texto: lines[n].trim().slice(0, 200) });
    }
  }));
  return out.sort((a, b) => a.arquivo.localeCompare(b.arquivo) || a.linha - b.linha);
}

export async function recentCommits(n = 8) {
  const r = await gh(repoPath(`/commits?sha=${encodeURIComponent(ghConfig().branch)}&per_page=${Math.min(20, n)}`));
  return r.map((c) => ({ sha: c.sha.slice(0, 7), mensagem: String(c.commit.message).split('\n')[0].slice(0, 120), data: c.commit.author?.date, autor: c.commit.author?.name }));
}

// ---------- validação e diferenças ----------
export async function checkSyntax(p, content) {
  if (/\.json$/i.test(p)) { try { JSON.parse(content); return null; } catch (e) { return `JSON inválido em ${p}: ${e.message}`; } }
  if (!/\.(js|mjs|cjs)$/i.test(p)) return null;
  const tmp = path.join(os.tmpdir(), `codeniac-check-${crypto.randomBytes(5).toString('hex')}.${/\.cjs$/i.test(p) ? 'cjs' : 'mjs'}`);
  fs.writeFileSync(tmp, content);
  return new Promise((resolve) => {
    execFile(process.execPath, ['--check', tmp], { timeout: 15000 }, (err, _out, stderr) => {
      fs.rm(tmp, { force: true }, () => {});
      resolve(err ? `Erro de sintaxe em ${p}: ${String(stderr || err.message).split('\n').filter((l) => !l.includes(tmp) || /Error/.test(l)).slice(0, 4).join(' ').replace(new RegExp(tmp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), p).slice(0, 400)}` : null);
    });
  });
}

// Diferença linha a linha (formato parecido com o "git diff"), cortando o começo e o fim iguais.
export function unifiedDiff(oldText, newText, name, ctx = 3, maxLines = 220) {
  const a = oldText === null ? [] : oldText.split('\n'); const b = newText.split('\n');
  let s = 0; while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length; let eb = b.length; while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  const A = a.slice(s, ea); const B = b.slice(s, eb);
  const ops = [];
  if (A.length * B.length > 4_000_000) { A.forEach((l) => ops.push(['-', l])); B.forEach((l) => ops.push(['+', l])); }
  else {
    const w = B.length + 1; const dp = new Uint16Array((A.length + 1) * w);
    for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) dp[i * w + j] = A[i] === B[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    let i = 0; let j = 0;
    while (i < A.length && j < B.length) { if (A[i] === B[j]) { ops.push([' ', A[i]]); i++; j++; } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) ops.push(['-', A[i++]]); else ops.push(['+', B[j++]]); }
    while (i < A.length) ops.push(['-', A[i++]]); while (j < B.length) ops.push(['+', B[j++]]);
  }
  const pre = a.slice(Math.max(0, s - ctx), s).map((l) => [' ', l]); const post = a.slice(ea, ea + ctx).map((l) => [' ', l]);
  const all = [...pre, ...ops, ...post];
  // mostra só o contexto em volta das mudanças
  const keep = new Array(all.length).fill(false);
  all.forEach((o, i) => { if (o[0] !== ' ') for (let k = Math.max(0, i - ctx); k <= Math.min(all.length - 1, i + ctx); k++) keep[k] = true; });
  const out = [`--- ${oldText === null ? '/dev/null' : `a/${name}`}`, `+++ b/${name}`];
  let gap = false;
  all.forEach((o, i) => { if (keep[i]) { gap = false; out.push(`${o[0]}${o[1]}`); } else if (!gap) { out.push('…'); gap = true; } });
  const added = ops.filter((o) => o[0] === '+').length; const removed = ops.filter((o) => o[0] === '-').length;
  return { text: out.length > maxLines ? `${out.slice(0, maxLines).join('\n')}\n… (diferença cortada)` : out.join('\n'), added, removed };
}

// ---------- enviar alterações ----------
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'ajuste';
export async function commitChanges(changes, message, body = '') {
  const cfg = ghConfig();
  const base = cfg.branch;
  const head = await gh(repoPath(`/git/ref/heads/${enc(base)}`));
  const baseSha = head.object.sha;
  const baseCommit = await gh(repoPath(`/git/commits/${baseSha}`));
  const pr = cfg.mode !== 'direct';
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const branch = pr ? `codeniac/${stamp}-${slug(message)}` : base;
  if (pr) await gh(repoPath('/git/refs'), { method: 'POST', body: { ref: `refs/heads/${branch}`, sha: baseSha } });
  try {
    const entries = [];
    for (const c of changes) {
      const blob = await gh(repoPath('/git/blobs'), { method: 'POST', body: { content: c.content, encoding: 'utf-8' } });
      entries.push({ path: c.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const t = await gh(repoPath('/git/trees'), { method: 'POST', body: { base_tree: baseCommit.tree.sha, tree: entries } });
    const commit = await gh(repoPath('/git/commits'), { method: 'POST', body: { message, tree: t.sha, parents: [baseSha] } });
    await gh(repoPath(`/git/refs/heads/${enc(branch)}`), { method: 'PATCH', body: { sha: commit.sha } });
    treeCache.at = 0;
    let prInfo = null;
    if (pr) {
      const p = await gh(repoPath('/pulls'), { method: 'POST', body: { title: message.slice(0, 120), head: branch, base, body: `${body}\n\n_Alteração feita pelo assistente do Codeniac, aprovada pelo usuário._`.trim() } });
      prInfo = { number: p.number, url: p.html_url };
    }
    return { branch, commit: commit.sha.slice(0, 7), url: `https://github.com/${cfg.repo}/commit/${commit.sha}`, pr: prInfo, direct: !pr };
  } catch (err) {
    if (pr) await gh(repoPath(`/git/refs/heads/${enc(branch)}`), { method: 'DELETE' }).catch(() => {}); // não deixa branch vazia para trás
    throw err;
  }
}

export async function mergePr(number) {
  const n = Number(number);
  if (!Number.isInteger(n) || n < 1) throw new Error('Número de pull request inválido');
  const pr = await gh(repoPath(`/pulls/${n}`));
  if (pr.state !== 'open') throw new Error(`O pull request #${n} não está aberto (${pr.merged ? 'já foi mesclado' : pr.state}).`);
  if (!String(pr.head?.ref || '').startsWith('codeniac/')) throw new Error('Só mesclo pull requests criados pelo assistente (branches codeniac/...).');
  await gh(repoPath(`/pulls/${n}/merge`), { method: 'PUT', body: { merge_method: 'squash', commit_title: `${pr.title} (#${n})` } });
  await gh(repoPath(`/git/refs/heads/${enc(pr.head.ref)}`), { method: 'DELETE' }).catch(() => {});
  treeCache.at = 0;
  return { number: n, url: pr.html_url, title: pr.title };
}

export async function openPrs() {
  const r = await gh(repoPath('/pulls?state=open&per_page=15'));
  return r.map((p) => ({ numero: p.number, titulo: p.title, branch: p.head.ref, url: p.html_url }));
}

// ---------- atualizar este computador ----------
const gitSha = (buf) => crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest('hex');
const inScope = (p) => /^(server|public)\//.test(p) || p === 'package.json';
function localFiles() {
  const out = new Map();
  const walk = (dir, rel) => {
    for (const e of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(path.join(dir, e.name), r); }
      else out.set(r, gitSha(fs.readFileSync(path.join(dir, e.name))));
    }
  };
  walk(path.join(APP_ROOT, 'server'), 'server'); walk(path.join(APP_ROOT, 'public'), 'public');
  const pkg = path.join(APP_ROOT, 'package.json');
  if (fs.existsSync(pkg)) out.set('package.json', gitSha(fs.readFileSync(pkg)));
  return out;
}

export async function updateStatus() {
  const remote = (await tree()).filter((f) => inScope(f.path) && !DENY.test(f.path));
  const local = localFiles();
  const changes = [];
  for (const f of remote) {
    const l = local.get(f.path);
    if (l === undefined) changes.push({ path: f.path, status: 'novo', sha: f.sha });
    else if (l !== f.sha) changes.push({ path: f.path, status: 'alterado', sha: f.sha });
  }
  const names = new Set(remote.map((f) => f.path));
  for (const p of local.keys()) if (!names.has(p)) changes.push({ path: p, status: 'removido' });
  let depsChanged = false;
  const pk = changes.find((c) => c.path === 'package.json' && c.status !== 'removido');
  if (pk) {
    try {
      const remoteDeps = JSON.parse(await blobText(pk.sha)).dependencies || {};
      const localDeps = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8')).dependencies || {};
      depsChanged = JSON.stringify(remoteDeps, Object.keys(remoteDeps).sort()) !== JSON.stringify(localDeps, Object.keys(localDeps).sort());
    } catch { depsChanged = true; }
  }
  return { changes: changes.sort((a, b) => a.path.localeCompare(b.path)), depsChanged, branch: ghConfig().branch };
}

const backupsRoot = () => path.join(DATA_DIR, 'app-backups');
export async function applyUpdate() {
  const st = await updateStatus();
  if (!st.changes.length) return { ok: true, applied: 0, message: 'Este computador já está igual ao GitHub.' };
  if (st.depsChanged) throw new Error('Essa atualização muda as dependências (package.json). Instale a versão nova pelo instalador, que inclui os pacotes.');
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const bdir = path.join(backupsRoot(), stamp);
  const written = []; const removed = [];
  try {
    for (const c of st.changes) {
      const dest = path.join(APP_ROOT, c.path);
      if (!dest.startsWith(APP_ROOT + path.sep)) continue;
      if (fs.existsSync(dest)) { fs.mkdirSync(path.dirname(path.join(bdir, c.path)), { recursive: true }); fs.copyFileSync(dest, path.join(bdir, c.path)); }
      if (c.status === 'removido') { fs.rmSync(dest, { force: true }); removed.push(c.path); continue; }
      const b = await gh(repoPath(`/git/blobs/${c.sha}`));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, Buffer.from(b.content || '', 'base64'));
      written.push({ path: c.path, existed: c.status === 'alterado' });
    }
  } catch (err) {
    restoreFrom(bdir, written, removed); // volta tudo como estava
    throw new Error(`A atualização falhou e nada foi mudado: ${err.message}`);
  }
  fs.writeFileSync(path.join(bdir, 'LISTA.json'), JSON.stringify({ at: new Date().toISOString(), written, removed }, null, 2));
  pruneBackups();
  return { ok: true, applied: st.changes.length, backup: stamp, message: `${st.changes.length} arquivo(s) atualizado(s). O Codeniac vai reiniciar.` };
}
function restoreFrom(bdir, written, removed) {
  for (const w of written) {
    const dest = path.join(APP_ROOT, w.path); const bk = path.join(bdir, w.path);
    if (fs.existsSync(bk)) fs.copyFileSync(bk, dest); else if (!w.existed) fs.rmSync(dest, { force: true });
  }
  for (const r of removed) { const bk = path.join(bdir, r); if (fs.existsSync(bk)) { fs.mkdirSync(path.dirname(path.join(APP_ROOT, r)), { recursive: true }); fs.copyFileSync(bk, path.join(APP_ROOT, r)); } }
}
function pruneBackups() {
  const dirs = fs.existsSync(backupsRoot()) ? fs.readdirSync(backupsRoot()).sort() : [];
  for (const d of dirs.slice(0, Math.max(0, dirs.length - 5))) fs.rmSync(path.join(backupsRoot(), d), { recursive: true, force: true });
}
export function listAppBackups() { return fs.existsSync(backupsRoot()) ? fs.readdirSync(backupsRoot()).sort().reverse() : []; }
export function rollbackUpdate(name) {
  const bdir = path.join(backupsRoot(), path.basename(name || listAppBackups()[0] || ''));
  const listFile = path.join(bdir, 'LISTA.json');
  if (!fs.existsSync(listFile)) throw new Error('Não há atualização para desfazer.');
  const { written, removed } = JSON.parse(fs.readFileSync(listFile, 'utf8'));
  restoreFrom(bdir, written, removed);
  fs.rmSync(bdir, { recursive: true, force: true });
  return { ok: true, restored: written.length + removed.length };
}
