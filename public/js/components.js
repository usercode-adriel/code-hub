// Componentes reutilizáveis: cards de projeto, modais de tarefa/projeto, popovers e estados vazios.
import { icon, PROJECT_ICONS } from './icons.js';
import { esc, formModal, toast, modal, todayISO, confirmDialog } from './ui.js';
import { api } from './api.js';
import { store, refreshProjects, emit } from './store.js';

export const PROJECT_COLORS = ['#1f8fff', '#8b5cf6', '#f7931a', '#22c55e', '#ef4444', '#06b6d4', '#eab308', '#ec4899', '#14b8a6', '#f97316'];
export const EMOJIS = ['📄', '📝', '📌', '📚', '💡', '🚀', '🎯', '💼', '💻', '🧠', '📈', '💰', '🪙', '🚗', '🎨', '🗂️', '✅', '⭐', '🔥', '🌎', '🎧', '📷', '🧾', '🏁', '🛠️', '📅', '🧩', '🏆', '🌱', '☕', '🎮', '🇺🇸', '📖', '🔔', '❤️', '🤖'];

export function emptyState(ic, title, text = '', action = '') {
  return `<div class="empty-state"><div class="e-ico">${icon(ic, 22)}</div><b>${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;
}

export function projectCard(p) {
  const cover = p.cover ? `<div class="bg" style="background-image:url('${esc(p.cover)}')"></div>` : '';
  return `<a class="project-card" href="#/project/${esc(p.slug)}" style="--c:${esc(p.color)}">
    ${cover}<span class="glyph">${icon(p.icon, 130)}</span>
    <span class="ico" style="background:${esc(p.color)}">${icon(p.icon, 20)}</span>
    ${p.favorite ? `<span class="fav">${icon('star', 15)}</span>` : ''}
    <div class="body"><h4>${esc(p.name)}</h4><div class="tagline">${esc(p.tagline || '')}</div>
      <div class="meta"><span>${icon('note', 12)} ${p.pages || 0} página(s)</span><span>Abrir ${icon('chevRight', 12)}</span></div></div></a>`;
}

const RECUR = [['', 'Não repete'], ['daily', 'Todo dia'], ['weekly', 'Toda semana'], ['monthly', 'Todo mês']];
export async function openTaskModal(task = null, defaults = {}) {
  if (!store.projects.length) await refreshProjects();
  const t = task || { title: '', description: '', status: 'todo', priority: 'medium', dueDate: '', recurrence: '', projectId: defaults.projectId || store.projects[0]?.id };
  return formModal({
    title: task ? 'Editar tarefa' : 'Nova tarefa',
    fields: [
      { name: 'title', label: 'Título', value: t.title, full: true, placeholder: 'O que precisa ser feito?' },
      { name: 'projectId', label: 'Projeto', type: 'select', value: t.projectId, options: store.projects.map((p) => [p.id, p.name]) },
      { name: 'priority', label: 'Prioridade', type: 'select', value: t.priority, options: [['high', 'Alta'], ['medium', 'Média'], ['low', 'Baixa']] },
      { name: 'status', label: 'Status', type: 'select', value: t.status, options: [['todo', 'A fazer'], ['doing', 'Em andamento'], ['done', 'Concluído']] },
      { name: 'dueDate', label: 'Prazo', type: 'date', value: t.dueDate || defaults.dueDate || '' },
      { name: 'recurrence', label: 'Repetir', type: 'select', value: t.recurrence || '', options: RECUR, hint: 'Ao concluir, a próxima é criada sozinha.' },
      { name: 'description', label: 'Descrição', type: 'textarea', value: t.description, full: true, rows: 3 },
    ],
    onSubmit: async (data) => {
      if (!data.title.trim()) throw new Error('Dê um título para a tarefa');
      const saved = task ? await api.put(`/tasks/${task.id}`, data) : await api.post('/tasks', data);
      toast(task ? 'Tarefa atualizada' : 'Tarefa criada', saved.title, 'success');
      emit('tasks-changed');
      return saved;
    },
    onDelete: task ? async () => {
      if (!(await confirmDialog('Excluir tarefa', `"${task.title}" será removida.`))) return;
      await api.del(`/tasks/${task.id}`);
      toast('Tarefa excluída');
      emit('tasks-changed');
    } : null,
  });
}

export function openProjectModal(project = null) {
  let color = project?.color || PROJECT_COLORS[store.projects.length % PROJECT_COLORS.length];
  let ic = project?.icon || 'folder';
  return new Promise((resolve) => {
    modal({
      title: project ? 'Editar projeto' : 'Novo projeto',
      body: `<form class="form">
        <div class="field"><label>Nome</label><input name="name" value="${esc(project?.name || '')}" maxlength="60" required></div>
        <div class="field"><label>Subtítulo</label><input name="tagline" value="${esc(project?.tagline || '')}" maxlength="60" placeholder="Ex.: Clientes · Entregas"></div>
        <div class="field"><label>Descrição</label><textarea name="description" maxlength="300" rows="2">${esc(project?.description || '')}</textarea></div>
        <div class="field"><label>Ícone</label><div class="icon-pick">${PROJECT_ICONS.map((n) => `<button type="button" data-ic="${n}" class="${n === ic ? 'on' : ''}" aria-label="${n}">${icon(n, 16)}</button>`).join('')}</div></div>
        <div class="field"><label>Cor</label><div class="swatches">${PROJECT_COLORS.map((c) => `<button type="button" class="swatch ${c === color ? 'on' : ''}" data-c="${c}" style="--c:${c}" aria-label="${c}"></button>`).join('')}</div></div>
        <div class="form-actions">${project ? `<button type="button" class="btn danger" data-del style="margin-right:auto">${icon('trash', 13)} Excluir</button>` : ''}
          <button type="button" class="btn outline" data-close>Cancelar</button><button class="btn primary">Salvar</button></div></form>`,
      onMount: (m, close) => {
        m.querySelectorAll('[data-ic]').forEach((b) => b.addEventListener('click', () => { ic = b.dataset.ic; m.querySelectorAll('[data-ic]').forEach((x) => x.classList.toggle('on', x === b)); }));
        m.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => { color = b.dataset.c; m.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x === b)); }));
        m.querySelector('form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const f = e.target;
          const body = { name: f.name.value, tagline: f.tagline.value, description: f.description.value, icon: ic, color };
          try {
            const saved = project ? await api.put(`/projects/${project.id}`, body) : await api.post('/projects', body);
            await refreshProjects();
            close(); toast(project ? 'Projeto atualizado' : 'Projeto criado', saved.name, 'success'); resolve(saved);
          } catch (err) { toast('Erro', err.message, 'error'); }
        });
        m.querySelector('[data-del]')?.addEventListener('click', async () => {
          if (!(await confirmDialog('Excluir projeto', `"${project.name}", suas páginas e lançamentos serão removidos. Não dá para desfazer.`))) return;
          await api.del(`/projects/${project.id}`);
          await refreshProjects();
          close(); toast('Projeto excluído'); location.hash = '#/dashboard'; resolve(null);
        });
      },
    });
  });
}

// Popover flutuante ancorado num elemento (menus do editor, emojis...).
export function popover(anchor, html, onMount, { width } = {}) {
  document.querySelectorAll('.pop').forEach((p) => p.remove());
  const pop = document.createElement('div');
  pop.className = 'pop';
  if (width) pop.style.width = `${width}px`;
  pop.innerHTML = html;
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  const z = Number(getComputedStyle(document.body).zoom) || 1;
  const top = r.bottom / z + 6;
  const left = Math.min(r.left / z, window.innerWidth / z - pop.offsetWidth - 10);
  pop.style.top = `${top + pop.offsetHeight > window.innerHeight / z - 10 ? Math.max(10, r.top / z - pop.offsetHeight - 6) : top}px`;
  pop.style.left = `${Math.max(10, left)}px`;
  const close = () => { pop.remove(); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', esc_); };
  const outside = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(); };
  const esc_ = (e) => { if (e.key === 'Escape') close(); };
  setTimeout(() => { document.addEventListener('mousedown', outside, true); document.addEventListener('keydown', esc_); });
  onMount?.(pop, close);
  return close;
}

export function emojiPicker(anchor, current, onPick) {
  return popover(anchor, `<div class="pop-title">Escolha um ícone</div><div class="emoji-grid">${EMOJIS.map((e) => `<button type="button" class="${e === current ? 'on' : ''}">${e}</button>`).join('')}</div>`, (pop, close) => {
    pop.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { onPick(b.textContent); close(); }));
  });
}

// Arte do banner (órbita com ícone do projeto).
export function heroArt(ic = 'sparkles', color = 'var(--accent)') {
  return `<div class="hero-art" aria-hidden="true" style="--c:${color}"><div class="ring r2"></div><div class="ring"></div>
    <div class="orb" style="--c:${color}">${icon(ic, 64)}</div><span class="sat" style="--c:${color};top:22%;right:46%"></span><span class="sat" style="--c:#f5c518;top:74%;right:20%"></span></div>`;
}

export function kpi(label, value, sub = '', cls = '') {
  return `<div class="card kpi ${cls}"><span>${esc(label)}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;
}

export { todayISO };
