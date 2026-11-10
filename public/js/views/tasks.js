// Minhas tarefas: lista com filtros, recorrência e conclusão rápida.
import { api } from '../api.js';
import { store, on } from '../store.js';
import { icon } from '../icons.js';
import { esc, dmy, isLate, PRIORITY, STATUS, STATUS_COLOR, toast } from '../ui.js';
import { openTaskModal } from '../components.js';

const REC = { daily: 'diária', weekly: 'semanal', monthly: 'mensal' };
export default async function render(el, _parts, query) {
  let filter = query.get('filter') || 'open';
  let project = '';
  let q = '';
  const draw = async () => {
    const tasks = await api.get('/tasks');
    const byId = Object.fromEntries(store.projects.map((p) => [p.id, p]));
    const list = tasks.filter((t) => (filter === 'open' ? t.status !== 'done' : filter === 'late' ? isLate(t) : filter === 'done' ? t.status === 'done' : filter === 'doing' ? t.status === 'doing' : true))
      .filter((t) => !project || t.projectId === project).filter((t) => !q || t.title.toLowerCase().includes(q));
    const count = (f) => tasks.filter((t) => (f === 'open' ? t.status !== 'done' : f === 'late' ? isLate(t) : f === 'done' ? t.status === 'done' : f === 'doing' ? t.status === 'doing' : true)).length;
    el.innerHTML = `<div class="page-head"><div><h1>Minhas tarefas</h1><p>${tasks.filter((t) => t.status !== 'done').length} aberta(s) · ${tasks.filter(isLate).length} atrasada(s)</p></div><button class="btn primary" id="new">${icon('plus', 14)} Nova tarefa</button></div>
      <div class="toolbar"><div class="tabs" style="margin:0">${[['open', 'Abertas'], ['doing', 'Em andamento'], ['late', 'Atrasadas'], ['done', 'Concluídas'], ['all', 'Todas']].map(([k, l]) => `<button data-f="${k}" class="${filter === k ? 'on' : ''}">${l} <small>${count(k)}</small></button>`).join('')}</div>
        <div class="grow"></div><select class="input" id="proj" style="height:34px"><option value="">Todos os projetos</option>${store.projects.map((p) => `<option value="${p.id}" ${project === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select><input class="input" id="tq" value="${esc(q)}" placeholder="Buscar..." style="height:34px;max-width:200px"></div>
      <div class="card table-wrap"><table class="table"><thead><tr><th style="width:30px"></th><th>Tarefa</th><th>Projeto</th><th>Prioridade</th><th>Status</th><th>Prazo</th></tr></thead><tbody>
      ${list.map((t) => { const p = byId[t.projectId]; return `<tr data-t="${t.id}" style="cursor:pointer"><td><button class="check ${t.status === 'done' ? 'on' : ''}" data-done aria-label="Concluir">${t.status === 'done' ? icon('check', 11) : ''}</button></td><td><b style="font-weight:500;${t.status === 'done' ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(t.title)}</b>${t.recurrence ? ` <span class="chip">${icon('refresh', 10)} ${REC[t.recurrence]}</span>` : ''}${t.postponed >= 2 ? ` <span class="chip medium" title="Prazo adiado ${t.postponed} vezes">adiada ${t.postponed}×</span>` : ''}</td>
        <td>${p ? `<span class="proj"><span class="mini-ico" style="--c:${esc(p.color)}">${icon(p.icon, 11)}</span>${esc(p.name)}</span>` : ''}</td><td><span class="chip ${t.priority}">${PRIORITY[t.priority]}</span></td><td><span class="status-dot" style="background:${STATUS_COLOR[t.status]}"></span> ${STATUS[t.status]}</td><td>${t.dueDate ? `<span class="${isLate(t) ? 'chip late' : ''}">${dmy(t.dueDate)}</span>` : '<span class="muted">—</span>'}</td></tr>`; }).join('') || '<tr><td colspan="6"><div class="empty-mini">Nenhuma tarefa aqui.</div></td></tr>'}</tbody></table></div>`;
    el.querySelector('#new').onclick = () => openTaskModal();
    el.querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => { filter = b.dataset.f; draw(); }; });
    el.querySelector('#proj').onchange = (e) => { project = e.target.value; draw(); };
    el.querySelector('#tq').oninput = (e) => { q = e.target.value.toLowerCase(); clearTimeout(el._t); el._t = setTimeout(() => { draw().then(() => { const i = el.querySelector('#tq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }); }, 250); };
    el.querySelectorAll('tr[data-t]').forEach((tr) => {
      const t = tasks.find((x) => x.id === tr.dataset.t);
      tr.onclick = (e) => { if (!e.target.closest('[data-done]')) openTaskModal(t); };
      tr.querySelector('[data-done]').onclick = async () => {
        await api.put(`/tasks/${t.id}`, { status: t.status === 'done' ? 'todo' : 'done' });
        if (t.status !== 'done') toast('Tarefa concluída ✅', t.recurrence ? 'A próxima repetição já foi criada.' : t.title, 'success');
        draw();
      };
    });
    const open = query.get('open');
    if (open) { query.delete('open'); const t = tasks.find((x) => x.id === open); if (t) openTaskModal(t); }
  };
  await draw();
  const offs = [on('tasks-changed', draw), on('data-changed', draw)];
  return () => offs.forEach((f) => f());
}
