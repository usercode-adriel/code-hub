// Páginas estilo Notion (blocos) e controle financeiro do InDrive (entradas/saídas).
import express from 'express';
import { db, id, now, save } from '../db.js';
import { createPage, ensureRootPage } from '../seed.js';
import { single, removeUpload } from './uploads.js';
import { logEvent } from '../notify.js';

const router = express.Router();
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

export const BLOCK_TYPES = ['text', 'h1', 'h2', 'h3', 'todo', 'bullet', 'number', 'quote', 'callout', 'divider',
  'image', 'link', 'code', 'page', 'finance'];

const ownedPage = (pid, uid) => db().pages.find((p) => p.id === pid && p.userId === uid);
const projectOf = (page) => db().projects.find((p) => p.id === page.projectId);
const pageLink = (page) => { const p = projectOf(page); return p ? `#/project/${p.slug}${page.parentId ? `/p/${page.id}` : ''}` : null; };

function breadcrumb(page) {
  const trail = [];
  let cur = page;
  while (cur) {
    trail.unshift({ id: cur.id, title: cur.title, icon: cur.icon, root: !cur.parentId });
    cur = cur.parentId ? db().pages.find((p) => p.id === cur.parentId) : null;
  }
  return trail;
}

function children(page) {
  return db().pages.filter((p) => p.parentId === page.id)
    .map(({ id: pid, title, icon, cover, updatedAt }) => ({ id: pid, title, icon, cover, updatedAt }));
}

function payload(page) {
  const project = projectOf(page);
  return {
    ...page,
    breadcrumb: breadcrumb(page),
    children: children(page),
    project: project && { id: project.id, slug: project.slug, name: project.name, icon: project.icon, color: project.color, cover: project.cover, tagline: project.tagline, description: project.description, favorite: project.favorite },
  };
}

function cleanBlocks(blocks, page) {
  if (!Array.isArray(blocks)) return null;
  const childIds = new Set(db().pages.filter((p) => p.parentId === page.id).map((p) => p.id));
  const out = [];
  for (const b of blocks.slice(0, 600)) {
    if (!b || !BLOCK_TYPES.includes(b.type)) continue;
    const c = { id: typeof b.id === 'string' && b.id.length <= 64 ? b.id : id(), type: b.type };
    if (['text', 'h1', 'h2', 'h3', 'todo', 'bullet', 'number', 'quote', 'callout', 'code', 'link'].includes(b.type)) c.text = str(b.text, 10000);
    if (b.type === 'todo') c.checked = Boolean(b.checked);
    if (b.type === 'callout') c.emoji = str(b.emoji, 8) || '💡';
    if (b.type === 'image') {
      const url = str(b.url, 800);
      if (!/^(\/uploads\/[\w.-]+|https:\/\/\S+)$/.test(url) && url) continue;
      c.url = url; c.caption = str(b.caption, 300); c.width = b.width === 'half' ? 'half' : 'full';
    }
    if (b.type === 'link') {
      const url = str(b.url, 800);
      if (!/^https?:\/\/\S+$/.test(url)) continue;
      c.url = url;
    }
    if (b.type === 'page') { if (!childIds.has(b.pageId)) continue; c.pageId = b.pageId; childIds.delete(b.pageId); }
    out.push(c);
  }
  for (const orphan of childIds) out.push({ id: id(), type: 'page', pageId: orphan });
  return out;
}

router.get('/projects/:slug/page', (req, res) => {
  const project = db().projects.find((p) => p.userId === req.user.id && (p.slug === req.params.slug || p.id === req.params.slug));
  if (!project) return bad(res, 'Projeto não encontrado', 404);
  const root = ensureRootPage(project);
  save();
  res.json(payload(root));
});

router.get('/pages/:id', (req, res) => {
  const page = ownedPage(req.params.id, req.user.id);
  if (!page) return bad(res, 'Página não encontrada', 404);
  res.json(payload(page));
});

router.post('/pages', (req, res) => {
  const parent = ownedPage(req.body.parentId, req.user.id);
  if (!parent) return bad(res, 'Página de origem inválida');
  const page = createPage({
    userId: req.user.id, projectId: parent.projectId, parentId: parent.id,
    title: str(req.body.title, 120).trim() || 'Nova página', icon: str(req.body.icon, 8) || '📄',
    blocks: [{ id: id(), type: 'text', text: '' }],
  });
  parent.updatedAt = now();
  save();
  logEvent(req.user.id, 'page', 'create', `Página "${page.title}" criada`, { link: pageLink(page) });
  res.status(201).json(payload(page));
});

router.put('/pages/:id', (req, res) => {
  const page = ownedPage(req.params.id, req.user.id);
  if (!page) return bad(res, 'Página não encontrada', 404);
  if ('title' in req.body && page.parentId) page.title = str(req.body.title, 120).trim() || 'Sem título';
  if ('icon' in req.body && page.parentId) page.icon = str(req.body.icon, 8) || null;
  if ('blocks' in req.body) {
    const blocks = cleanBlocks(req.body.blocks, page);
    if (!blocks) return bad(res, 'Blocos inválidos');
    page.blocks = blocks;
  }
  page.updatedAt = now();
  const project = projectOf(page);
  if (project) project.updatedAt = now();
  save();
  logEvent(req.user.id, 'page', 'update', `Página "${page.parentId ? page.title : project?.name}" editada`, { link: pageLink(page), merge: `page:${page.id}` });
  res.json({ ok: true, updatedAt: page.updatedAt, blocks: page.blocks });
});

router.delete('/pages/:id', (req, res) => {
  const d = db();
  const page = ownedPage(req.params.id, req.user.id);
  if (!page) return bad(res, 'Página não encontrada', 404);
  if (!page.parentId) return bad(res, 'A página principal do projeto não pode ser excluída');
  const doomed = new Set([page.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of d.pages) if (p.parentId && doomed.has(p.parentId) && !doomed.has(p.id)) { doomed.add(p.id); grew = true; }
  }
  for (const p of d.pages) if (doomed.has(p.id)) removeUpload(p.cover);
  d.pages = d.pages.filter((p) => !doomed.has(p.id));
  d.finance = d.finance.filter((f) => !doomed.has(f.pageId));
  const parent = d.pages.find((p) => p.id === page.parentId);
  if (parent) parent.blocks = parent.blocks.filter((b) => !(b.type === 'page' && b.pageId === page.id));
  save();
  logEvent(req.user.id, 'page', 'delete', `Página "${page.title}" excluída`);
  res.json({ ok: true, parentId: page.parentId });
});

router.post('/pages/:id/cover', single('image'), (req, res) => {
  const page = ownedPage(req.params.id, req.user.id);
  if (!page) return bad(res, 'Página não encontrada', 404);
  if (!req.file) return bad(res, 'Nenhuma imagem enviada');
  removeUpload(page.cover);
  page.cover = `/uploads/${req.file.filename}`;
  save();
  logEvent(req.user.id, 'upload', 'create', `Nova capa na página "${page.title}"`, { link: pageLink(page) });
  res.json(payload(page));
});

router.delete('/pages/:id/cover', (req, res) => {
  const page = ownedPage(req.params.id, req.user.id);
  if (!page) return bad(res, 'Página não encontrada', 404);
  removeUpload(page.cover);
  page.cover = null;
  save();
  res.json(payload(page));
});

// ---------- Financeiro do InDrive ----------
const TYPES = ['in', 'out'];
const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export function cleanEntry(body, entry = {}) {
  const amount = Math.round(Number(String(body.amount ?? entry.amount).replace(',', '.')) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e7) throw new Error('Informe um valor maior que zero');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '') ? body.date : entry.date || new Date().toISOString().slice(0, 10);
  const km = body.km === '' || body.km == null ? (entry.km ?? null) : Number(String(body.km).replace(',', '.'));
  return {
    type: TYPES.includes(body.type) ? body.type : entry.type || 'in',
    amount, date,
    category: str(body.category, 40).trim() || entry.category || 'Outros',
    description: str(body.description, 200).trim(),
    km: Number.isFinite(km) && km >= 0 && km < 1e5 ? Math.round(km * 10) / 10 : null,
  };
}

export function addFinanceEntry(uid, page, body) {
  const entry = { id: id(), userId: uid, pageId: page.id, ...cleanEntry(body), createdAt: now() };
  db().finance.push(entry);
  save();
  logEvent(uid, 'finance', 'create', `${entry.type === 'in' ? 'Entrada' : 'Saída'} de ${brl(entry.amount)} no InDrive`, { link: pageLink(page), detail: entry.category });
  return entry;
}

router.get('/finance', (req, res) => {
  const page = ownedPage(req.query.pageId, req.user.id);
  if (!page) return bad(res, 'Página não encontrada', 404);
  res.json(db().finance.filter((f) => f.pageId === page.id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)));
});

router.post('/finance', (req, res) => {
  const page = ownedPage(req.body.pageId, req.user.id);
  if (!page) return bad(res, 'Página não encontrada', 404);
  try { res.status(201).json(addFinanceEntry(req.user.id, page, req.body)); }
  catch (e) { bad(res, e.message); }
});

router.put('/finance/:id', (req, res) => {
  const entry = db().finance.find((f) => f.id === req.params.id && f.userId === req.user.id);
  if (!entry) return bad(res, 'Lançamento não encontrado', 404);
  try { Object.assign(entry, cleanEntry(req.body, entry)); save(); res.json(entry); }
  catch (e) { bad(res, e.message); }
});

router.delete('/finance/:id', (req, res) => {
  const d = db();
  const entry = d.finance.find((f) => f.id === req.params.id && f.userId === req.user.id);
  if (!entry) return bad(res, 'Lançamento não encontrado', 404);
  d.finance = d.finance.filter((f) => f.id !== req.params.id);
  save();
  logEvent(req.user.id, 'finance', 'delete', `Lançamento de ${brl(entry.amount)} excluído do InDrive`);
  res.json({ ok: true });
});

export default router;
