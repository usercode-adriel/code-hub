// Página de projeto estilo Notion: blocos editáveis (texto, títulos, listas, tarefas, citação, destaque,
// código, divisória, imagem, link, subpágina e financeiro), arrastar para reordenar e "/" para comandos.
import { api } from '../api.js';
import { store, refreshProjects } from '../store.js';
import { icon } from '../icons.js';
import { esc, toast, timeAgo, confirmDialog, validateImage, pickImage } from '../ui.js';
import { openProjectModal, popover, emojiPicker, heroArt } from '../components.js';
import { mountFinance } from '../finance.js';

const TYPES = [
  ['text', 'Texto', 'Aa', 'Parágrafo simples'], ['h1', 'Título 1', 'H1', 'Seção grande'], ['h2', 'Título 2', 'H2', 'Seção média'], ['h3', 'Título 3', 'H3', 'Seção pequena'],
  ['todo', 'Lista de tarefas', '☑', 'Itens com caixa de seleção'], ['bullet', 'Lista com marcadores', '•', 'Lista simples'], ['number', 'Lista numerada', '1.', 'Lista com números'],
  ['quote', 'Citação', '❝', 'Destaque uma frase'], ['callout', 'Destaque', '💡', 'Caixa com ícone'], ['code', 'Código', '</>', 'Trecho de código'], ['divider', 'Divisória', '—', 'Linha separadora'],
  ['image', 'Imagem', '🖼', 'Envie ou cole um link'], ['link', 'Link', '🔗', 'Favorito para um site'], ['page', 'Subpágina', '📄', 'Página dentro desta página'], ['finance', 'Financeiro', '💰', 'Entradas e saídas com gráfico'],
];
const TEXTUAL = ['text', 'h1', 'h2', 'h3', 'todo', 'bullet', 'number', 'quote', 'callout', 'code'];
const LISTS = ['todo', 'bullet', 'number'];
const PLACEHOLDER = { text: 'Digite "/" para comandos', h1: 'Título 1', h2: 'Título 2', h3: 'Título 3', todo: 'Tarefa', bullet: 'Item', number: 'Item', quote: 'Citação', callout: 'Escreva algo em destaque', code: 'código...' };
const MD = [[/^# $/, 'h1'], [/^## $/, 'h2'], [/^### $/, 'h3'], [/^[-*] $/, 'bullet'], [/^1[.)] $/, 'number'], [/^\[\s?\] $/, 'todo'], [/^> $/, 'quote'], [/^```$/, 'code'], [/^---$/, 'divider']];
const bid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function caretOffset(el) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return 0;
  const r = sel.getRangeAt(0).cloneRange();
  r.selectNodeContents(el);
  r.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
  return r.toString().length;
}
function placeCaret(el, atStart = false) {
  el.focus();
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(atStart);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
}

export default async function render(el, parts) {
  const [slug, , pageId] = parts;
  let page;
  try { page = pageId ? await api.get(`/pages/${pageId}`) : await api.get(`/projects/${slug}/page`); }
  catch (e) { el.innerHTML = `<div class="empty-state"><b>${esc(e.message)}</b><p><a href="#/dashboard">Voltar ao dashboard</a></p></div>`; return; }
  const project = page.project;
  const isRoot = !page.parentId;
  let blocks = page.blocks.map((b) => ({ ...b }));
  let saveTimer = null; let dirty = false; let saving = Promise.resolve();
  const children = Object.fromEntries(page.children.map((c) => [c.id, c]));

  const meta = (txt) => { const m = el.querySelector('#meta'); if (m) m.textContent = txt; };
  const doSave = () => {
    clearTimeout(saveTimer); saveTimer = null;
    if (!dirty) return saving;
    dirty = false;
    const body = { blocks };
    if (!isRoot) { body.title = page.title; body.icon = page.icon; }
    meta('Salvando...');
    saving = saving.then(() => api.put(`/pages/${page.id}`, body)).then(() => meta('Salvo agora')).catch((e) => { meta('Erro ao salvar'); toast('Erro ao salvar', e.message, 'error'); });
    return saving;
  };
  const schedule = () => { dirty = true; meta('Editando...'); clearTimeout(saveTimer); saveTimer = setTimeout(doSave, 600); };

  // ---------- cabeçalho ----------
  const header = () => {
    if (isRoot) {
      return `<section class="hero project-hero ${project.cover ? 'has-cover' : ''}" style="--c:${esc(project.color)}">${project.cover ? `<div class="hero-cover" style="background-image:url('${esc(project.cover)}')"></div>` : ''}
        <div class="hero-body"><p class="hero-sub" style="margin:0 0 10px">${esc(project.tagline || 'Projeto')}</p><h1 class="hero-title" style="font-size:clamp(26px,3.4vw,42px)">${esc(project.name)}</h1><p class="hero-desc">${esc(project.description || '')}</p>
          <div class="hero-actions no-price"><button class="btn primary" id="editP">${icon('edit', 13)} Editar projeto</button><button class="btn" style="background:none" id="cover">${icon('image', 13)} ${project.cover ? 'Trocar capa' : 'Adicionar capa'}</button>${project.cover ? `<button class="btn" style="background:none" id="rmCover">${icon('x', 13)}</button>` : ''}<button class="btn" style="background:none" id="fav" title="Favoritar (aparece no banner do dashboard)">${icon('star', 13)} ${project.favorite ? 'Favorito' : 'Favoritar'}</button></div></div>
        ${project.cover ? '' : heroArt(project.icon, project.color)}</section>`;
    }
    return `<div class="page-cover">${page.cover ? `<div class="cover-img" style="background-image:url('${esc(page.cover)}')"></div><div class="cover-actions"><button class="btn sm white" id="cover">${icon('image', 12)} Trocar capa</button><button class="btn sm white" id="rmCover">${icon('x', 12)}</button></div>`
      : `<div class="cover-empty"><button class="btn sm outline" id="cover">${icon('image', 12)} Adicionar capa</button></div>`}</div>
      <div class="page-title-row"><button class="page-emoji" id="emoji" title="Trocar ícone">${esc(page.icon || '📄')}</button><h1 class="page-title" id="title" contenteditable="true" spellcheck="true" data-placeholder="Sem título">${esc(page.title)}</h1>
        <button class="icon-btn sm ghost" id="pageMenu" title="Mais">${icon('more', 16)}</button></div>`;
  };
  const crumbs = () => `<nav class="crumbs"><a href="#/dashboard">Início</a>${page.breadcrumb.map((c, i) => `<span class="sep">/</span>${i === page.breadcrumb.length - 1 ? `<span>${esc(c.root ? project.name : `${c.icon || '📄'} ${c.title}`)}</span>` : `<a href="#/project/${esc(project.slug)}${c.root ? '' : `/p/${c.id}`}">${esc(c.root ? project.name : `${c.icon || '📄'} ${c.title}`)}</a>`}`).join('')}</nav>`;

  el.innerHTML = `<div class="page-wrap">${crumbs()}${header()}<p class="page-meta muted" id="meta">Editado ${timeAgo(page.updatedAt)}</p><div class="blocks" id="blocks"></div>
    <div class="add-row"><button class="btn outline add-el" id="addEl">${icon('plus', 14)} Adicionar elemento</button><span class="add-hint muted">ou digite <b>/</b> num bloco vazio · arraste ⋮⋮ para reordenar</span></div></div>`;
  const list = el.querySelector('#blocks');

  // ---------- blocos ----------
  function body(b, num) {
    const ed = (cls = '') => `<div class="ed ${cls}" contenteditable="true" spellcheck="${b.type !== 'code'}" data-placeholder="${PLACEHOLDER[b.type] || ''}">${esc(b.text || '')}</div>`;
    switch (b.type) {
      case 'todo': return `<button class="check ${b.checked ? 'on' : ''}" data-check aria-label="Marcar">${b.checked ? icon('check', 11) : ''}</button>${ed(b.checked ? 'done' : '')}`;
      case 'bullet': return `<span class="bullet-dot">•</span>${ed()}`;
      case 'number': return `<span class="num-dot">${num}.</span>${ed()}`;
      case 'callout': return `<button class="callout-emoji" data-emoji>${esc(b.emoji || '💡')}</button>${ed()}`;
      case 'divider': return '<hr>';
      case 'image':
        if (!b.url) return `<div class="img-empty"><button class="btn outline" data-up>${icon('upload', 14)} Enviar imagem</button><div class="img-url"><input class="input" placeholder="ou cole o link https://..." data-url><button class="btn sm primary" data-urlok>OK</button></div></div>`;
        return `<figure class="img-fig ${b.width === 'half' ? 'half' : ''}"><img src="${esc(b.url)}" alt="${esc(b.caption || '')}" loading="lazy"><div class="img-tools"><button class="btn sm white" data-width>${b.width === 'half' ? 'Largura total' : 'Metade'}</button><button class="btn sm white" data-up>Trocar</button></div>
          <figcaption class="cap ed" contenteditable="true" data-cap data-placeholder="Legenda">${esc(b.caption || '')}</figcaption></figure>`;
      case 'link': {
        if (!b.url) return `<div class="img-url" style="width:100%"><input class="input" placeholder="https://..." data-url><button class="btn sm primary" data-urlok>Salvar link</button></div>`;
        let host = ''; try { host = new URL(b.url).hostname; } catch { /* ok */ }
        return `<a class="bookmark" href="${esc(b.url)}" target="_blank" rel="noopener"><span class="bm-ico">${icon('link', 15)}</span><span class="bm-t"><b>${esc(b.text || host)}</b><small>${esc(b.url)}</small></span></a><button class="icon-btn sm ghost" data-editlink title="Editar">${icon('edit', 13)}</button>`;
      }
      case 'page': {
        const c = children[b.pageId] || { title: 'Página', icon: '📄' };
        return `<a class="subpage-card ${c.cover ? 'has-cover' : ''}" href="#/project/${esc(project.slug)}/p/${esc(b.pageId)}" style="--c:${esc(project.color)}"><span class="sp-cover ${c.cover ? '' : 'sp-art'}" ${c.cover ? `style="background-image:url('${esc(c.cover)}')"` : ''}></span><span class="sp-emoji">${esc(c.icon || '📄')}</span><span class="sp-body"><b>${esc(c.title)}</b><small>${c.updatedAt ? `editada ${timeAgo(c.updatedAt)}` : 'subpágina'}</small></span><span class="sp-open">Abrir ${icon('chevRight', 12)}</span></a>`;
      }
      case 'finance': return '<div class="fin-box" data-fin></div>';
      default: return ed();
    }
  }
  function paint(focusId, atStart) {
    let n = 0;
    list.innerHTML = blocks.map((b) => {
      n = b.type === 'number' ? n + 1 : 0;
      return `<div class="blk blk-${b.type}" data-id="${b.id}"><div class="blk-gutter"><button class="icon-btn ghost" data-g="add" title="Adicionar abaixo">${icon('plus', 14)}</button><button class="icon-btn ghost blk-handle" data-g="menu" draggable="true" title="Arraste para mover · clique para opções">⋮⋮</button></div><div class="blk-body">${body(b, n)}</div></div>`;
    }).join('') || '<div class="empty-page muted">Página vazia. Clique em “Adicionar elemento” ou comece a escrever.</div>';
    if (!blocks.length) list.querySelector('.empty-page').onclick = () => insert(0, 'text');
    list.querySelectorAll('.blk').forEach(bind);
    if (focusId) { const e = list.querySelector(`[data-id="${focusId}"] .ed`); if (e) placeCaret(e, atStart); }
  }
  const idx = (id) => blocks.findIndex((b) => b.id === id);
  async function insert(at, type, extra = {}) {
    if (type === 'page') {
      const child = await api.post('/pages', { parentId: page.id, title: 'Nova página', icon: '📄' });
      children[child.id] = { id: child.id, title: child.title, icon: child.icon, cover: null, updatedAt: child.updatedAt };
      blocks.splice(at, 0, { id: bid(), type: 'page', pageId: child.id });
      await (dirty = true, doSave());
      location.hash = `#/project/${project.slug}/p/${child.id}`;
      return;
    }
    const b = { id: bid(), type, text: '', ...extra };
    if (type === 'callout') b.emoji ||= '💡';
    if (type === 'image') b.width = 'full';
    blocks.splice(at, 0, b);
    schedule(); paint(TEXTUAL.includes(type) ? b.id : null, true);
    if (type === 'image') list.querySelector(`[data-id="${b.id}"] [data-up]`)?.click();
    if (type === 'link') list.querySelector(`[data-id="${b.id}"] [data-url]`)?.focus();
    if (type === 'divider' && at === blocks.length - 1) insert(at + 1, 'text');
  }
  function transform(b, type) {
    if (type === 'page' || type === 'finance' || type === 'image' || type === 'link' || type === 'divider') { insert(idx(b.id) + 1, type); if (!b.text && b.type === 'text') { blocks = blocks.filter((x) => x !== b); schedule(); } return; }
    b.type = type;
    if (type === 'callout') b.emoji ||= '💡';
    schedule(); paint(b.id);
  }
  function typeMenu(anchor, onPick, title = 'Adicionar elemento') {
    popover(anchor, `<div class="pop-title">${title}</div><input class="input pop-search" placeholder="Filtrar..."><div class="pop-list">${TYPES.map(([k, l, g, d]) => `<button data-t="${k}" data-q="${esc(`${l} ${d}`.toLowerCase())}"><span class="pi">${g}</span><span><b>${l}</b><small>${d}</small></span></button>`).join('')}</div>`, (pop, close) => {
      const s = pop.querySelector('.pop-search');
      const items = () => [...pop.querySelectorAll('[data-t]')].filter((x) => !x.hidden);
      let cur = 0;
      const hl = () => items().forEach((x, i) => x.classList.toggle('cur', i === cur));
      s.focus(); hl();
      s.oninput = () => { const q = s.value.toLowerCase(); pop.querySelectorAll('[data-t]').forEach((x) => { x.hidden = q && !x.dataset.q.includes(q); }); cur = 0; hl(); };
      s.onkeydown = (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); cur = (cur + (e.key === 'ArrowDown' ? 1 : -1) + items().length) % items().length; hl(); }
        if (e.key === 'Enter') { e.preventDefault(); const it = items()[cur]; if (it) { close(); onPick(it.dataset.t); } }
      };
      pop.querySelectorAll('[data-t]').forEach((x) => { x.onclick = () => { close(); onPick(x.dataset.t); }; });
    });
  }
  function blockMenu(anchor, b) {
    const i = idx(b.id);
    popover(anchor, `<div class="pop-list compact">${TEXTUAL.includes(b.type) ? '<button data-a="turn"><span class="pi">↻</span><b>Transformar em...</b></button>' : ''}<button data-a="dup"><span class="pi">⧉</span><b>Duplicar</b></button>
      <button data-a="up" ${i === 0 ? 'disabled' : ''}><span class="pi">↑</span><b>Mover para cima</b></button><button data-a="down" ${i === blocks.length - 1 ? 'disabled' : ''}><span class="pi">↓</span><b>Mover para baixo</b></button><hr>
      <button data-a="del" class="danger-item"><span class="pi">${icon('trash', 13)}</span><b>${b.type === 'page' ? 'Excluir subpágina' : 'Excluir bloco'}</b></button></div>`, (pop, close) => {
      pop.querySelectorAll('[data-a]').forEach((x) => { x.onclick = async () => {
        close();
        const a = x.dataset.a;
        if (a === 'turn') typeMenu(anchor, (t) => transform(b, t), 'Transformar em');
        if (a === 'dup') { if (b.type === 'page') return toast('Subpáginas não podem ser duplicadas'); blocks.splice(i + 1, 0, { ...b, id: bid() }); schedule(); paint(); }
        if (a === 'up' || a === 'down') { const j = a === 'up' ? i - 1 : i + 1; [blocks[i], blocks[j]] = [blocks[j], blocks[i]]; schedule(); paint(); }
        if (a === 'del') {
          if (b.type === 'page') {
            if (!(await confirmDialog('Excluir subpágina', `"${children[b.pageId]?.title}" e tudo dentro dela serão excluídos.`))) return;
            await doSave(); await api.del(`/pages/${b.pageId}`); delete children[b.pageId];
            blocks = blocks.filter((x) => x !== b); dirty = false; paint(); toast('Subpágina excluída'); refreshProjects();
          } else { blocks = blocks.filter((x) => x !== b); schedule(); paint(); }
        }
      }; });
    });
  }

  let dragId = null;
  function bind(row) {
    const b = blocks.find((x) => x.id === row.dataset.id);
    if (!b) return;
    row.querySelector('[data-g="add"]').onclick = (e) => typeMenu(e.currentTarget, (t) => insert(idx(b.id) + 1, t));
    const handle = row.querySelector('[data-g="menu"]');
    handle.onclick = (e) => blockMenu(e.currentTarget, b);
    handle.ondragstart = (e) => { dragId = b.id; row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', b.id); };
    handle.ondragend = () => { dragId = null; row.classList.remove('dragging'); list.querySelectorAll('.drop-before,.drop-after').forEach((x) => x.classList.remove('drop-before', 'drop-after')); };
    row.ondragover = (e) => {
      if (!dragId || dragId === b.id) return;
      e.preventDefault();
      const r = row.getBoundingClientRect(); const after = e.clientY > r.top + r.height / 2;
      row.classList.toggle('drop-after', after); row.classList.toggle('drop-before', !after);
    };
    row.ondragleave = () => row.classList.remove('drop-before', 'drop-after');
    row.ondrop = (e) => {
      e.preventDefault();
      if (!dragId || dragId === b.id) return;
      const after = row.classList.contains('drop-after');
      const moving = blocks.splice(idx(dragId), 1)[0];
      blocks.splice(idx(b.id) + (after ? 1 : 0), 0, moving);
      schedule(); paint();
    };
    const ed = row.querySelector('.ed:not([data-cap])');
    if (ed) {
      ed.addEventListener('input', () => {
        b.text = ed.innerText.replace(/\n$/, '');
        if (b.type !== 'code') {
          const hit = MD.find(([re]) => re.test(b.text));
          if (hit) { b.text = ''; transform(b, hit[1]); return; }
        }
        schedule();
      });
      ed.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); });
      ed.addEventListener('keydown', (e) => {
        const i = idx(b.id);
        if (e.key === '/' && !ed.innerText.trim()) { e.preventDefault(); typeMenu(ed, (t) => transform(b, t), 'Transformar em'); return; }
        if (e.key === 'Enter' && !e.shiftKey && b.type !== 'code') {
          e.preventDefault();
          if (LISTS.includes(b.type) && !b.text) { b.type = 'text'; schedule(); paint(b.id); return; }
          const off = caretOffset(ed); const full = ed.innerText.replace(/\n$/, '');
          b.text = full.slice(0, off);
          const nb = { id: bid(), type: LISTS.includes(b.type) ? b.type : 'text', text: full.slice(off) };
          blocks.splice(i + 1, 0, nb); schedule(); paint(nb.id, true);
          return;
        }
        if (e.key === 'Backspace' && caretOffset(ed) === 0 && !window.getSelection().toString()) {
          if (b.type !== 'text') { e.preventDefault(); b.type = 'text'; schedule(); paint(b.id, true); return; }
          const prev = blocks.slice(0, i).reverse().find((x) => TEXTUAL.includes(x.type));
          if (!prev && b.text) return;
          e.preventDefault();
          blocks.splice(i, 1);
          if (prev) { const len = (prev.text || '').length; prev.text = (prev.text || '') + (b.text || ''); schedule(); paint();
            const pe = list.querySelector(`[data-id="${prev.id}"] .ed`); if (pe) { pe.focus(); const r = document.createRange(); const t = pe.firstChild; if (t) { r.setStart(t, Math.min(len, t.length)); r.collapse(true); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } else placeCaret(pe); }
          } else { schedule(); paint(); }
          return;
        }
        if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey) {
          const atEdge = e.key === 'ArrowUp' ? caretOffset(ed) === 0 : caretOffset(ed) >= ed.innerText.replace(/\n$/, '').length;
          if (!atEdge) return;
          const eds = [...list.querySelectorAll('.ed:not([data-cap])')];
          const k = eds.indexOf(ed) + (e.key === 'ArrowUp' ? -1 : 1);
          if (eds[k]) { e.preventDefault(); placeCaret(eds[k], e.key === 'ArrowDown'); }
        }
      });
    }
    row.querySelector('[data-check]')?.addEventListener('click', () => { b.checked = !b.checked; schedule(); paint(); });
    row.querySelector('[data-emoji]')?.addEventListener('click', (e) => emojiPicker(e.currentTarget, b.emoji, (em) => { b.emoji = em; schedule(); paint(); }));
    row.querySelector('[data-cap]')?.addEventListener('input', (e) => { b.caption = e.target.innerText.trim(); schedule(); });
    row.querySelector('[data-width]')?.addEventListener('click', () => { b.width = b.width === 'half' ? 'full' : 'half'; schedule(); paint(); });
    row.querySelector('[data-up]')?.addEventListener('click', () => pickImage(async (file) => {
      if (!validateImage(file)) return;
      try { const r = await api.upload('/uploads', file); b.url = r.url; schedule(); paint(); } catch (err) { toast('Erro no envio', err.message, 'error'); }
    }));
    const url = row.querySelector('[data-url]');
    if (url) {
      const ok = () => {
        const v = url.value.trim();
        if (!/^https?:\/\/\S+$/.test(v) || (b.type === 'image' && !v.startsWith('https://'))) return toast('Link inválido', b.type === 'image' ? 'Use um endereço https://' : 'Comece com http:// ou https://', 'error');
        b.url = v; schedule(); paint();
      };
      row.querySelector('[data-urlok]').onclick = ok;
      url.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); ok(); } };
    }
    row.querySelector('[data-editlink]')?.addEventListener('click', (e) => popover(e.currentTarget, `<div class="pop-title">Link</div><div class="form" style="gap:8px"><input class="input" data-lt placeholder="Título (opcional)" value="${esc(b.text || '')}"><input class="input" data-lu value="${esc(b.url)}"><button class="btn sm primary">Salvar</button></div>`, (pop, close) => {
      pop.querySelector('button').onclick = () => { const u = pop.querySelector('[data-lu]').value.trim(); if (!/^https?:\/\/\S+$/.test(u)) return toast('Link inválido', '', 'error'); b.url = u; b.text = pop.querySelector('[data-lt]').value.trim(); close(); schedule(); paint(); };
    }));
    const fin = row.querySelector('[data-fin]');
    if (fin) mountFinance(fin, page.id);
  }

  // ---------- ações do cabeçalho ----------
  el.querySelector('#addEl').onclick = (e) => typeMenu(e.currentTarget, (t) => insert(blocks.length, t));
  el.querySelector('#cover')?.addEventListener('click', () => pickImage(async (file) => {
    if (!validateImage(file)) return;
    if (isRoot) { await api.upload(`/projects/${project.id}/cover`, file); await refreshProjects(); } else await api.upload(`/pages/${page.id}/cover`, file);
    await doSave(); render(el, parts);
  }));
  el.querySelector('#rmCover')?.addEventListener('click', async () => {
    if (isRoot) { await api.del(`/projects/${project.id}/cover`); await refreshProjects(); } else await api.del(`/pages/${page.id}/cover`);
    await doSave(); render(el, parts);
  });
  if (isRoot) {
    el.querySelector('#editP').onclick = async () => { await doSave(); const p = store.projects.find((x) => x.id === project.id); const saved = await openProjectModal(p); if (saved) { if (saved.slug !== slug) location.hash = `#/project/${saved.slug}`; else render(el, parts); } };
    el.querySelector('#fav').onclick = async () => { await api.put(`/projects/${project.id}`, { favorite: !project.favorite }); await refreshProjects(); render(el, parts); };
  } else {
    const title = el.querySelector('#title');
    title.addEventListener('input', () => { page.title = title.innerText.trim(); schedule(); });
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const first = list.querySelector('.ed'); if (first) placeCaret(first, true); else insert(0, 'text'); } });
    title.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\n/g, ' ')); });
    el.querySelector('#emoji').onclick = (e) => emojiPicker(e.currentTarget, page.icon, (em) => { page.icon = em; e.target.textContent = em; schedule(); });
    el.querySelector('#pageMenu').onclick = (e) => popover(e.currentTarget, `<div class="pop-list compact"><button data-a="del" class="danger-item"><span class="pi">${icon('trash', 13)}</span><b>Excluir esta página</b></button></div>`, (pop, close) => {
      pop.querySelector('[data-a]').onclick = async () => {
        close();
        if (!(await confirmDialog('Excluir página', `"${page.title}" e suas subpáginas serão excluídas.`))) return;
        clearTimeout(saveTimer); dirty = false;
        const r = await api.del(`/pages/${page.id}`);
        const parent = page.breadcrumb.at(-2);
        toast('Página excluída');
        location.hash = parent && !parent.root ? `#/project/${project.slug}/p/${r.parentId}` : `#/project/${project.slug}`;
      };
    });
    if (!page.title || page.title === 'Nova página') { placeCaret(title); document.execCommand('selectAll', false); }
  }
  paint();
  const onLeave = () => { if (dirty) doSave(); };
  window.addEventListener('beforeunload', onLeave);
  return () => { window.removeEventListener('beforeunload', onLeave); onLeave(); };
}
