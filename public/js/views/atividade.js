// Central de acontecimentos: tudo que acontece no hub, registrado automaticamente.
import { api } from '../api.js';
import { on } from '../store.js';
import { icon } from '../icons.js';
import { esc } from '../ui.js';

export const KINDS = {
  task: ['Tarefas', 'tasks', '#1f8fff'], project: ['Projetos', 'folder', '#8b5cf6'], page: ['Páginas', 'note', '#06b6d4'], upload: ['Arquivos', 'image', '#ec4899'],
  finance: ['InDrive', 'car', '#3b8fe8'], money: ['Financeiro', 'wallet', '#d4612a'], garage: ['Garagem', 'wrench', '#f59e0b'], study: ['Estudos', 'school', '#22c55e'],
  journal: ['Diário', 'feather', '#a16207'], decision: ['Decisões', 'scale', '#14b8a6'], agenda: ['Agenda', 'calendar', '#6366f1'], habit: ['Hábitos', 'flame', '#f97316'],
  inbox: ['Captura', 'inbox', '#64748b'], settings: ['Configurações', 'settings', '#7d828c'], system: ['Sistema', 'shield', '#ef4444'],
};
const dayLabel = (iso) => {
  const d = new Date(iso); const t = new Date(); const y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return 'Hoje';
  if (d.toDateString() === y.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
};
const itemHtml = (e) => {
  const [, ic, color] = KINDS[e.kind] || KINDS.system;
  const inner = `<span class="dot" style="--k:${color}">${icon(ic, 9)}</span><div class="grow">${esc(e.title)}${e.count > 1 ? ` <small>(${e.count}×)</small>` : ''}${e.detail ? `<br><small>${esc(e.detail)}</small>` : ''}</div><time>${new Date(e.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time>`;
  return e.link ? `<a class="feed-item" href="${esc(e.link)}">${inner}</a>` : `<div class="feed-item">${inner}</div>`;
};

export default async function render(el) {
  let kind = ''; let q = ''; let items = []; let done = false;
  el.innerHTML = `<div class="page-head"><div><h1>Atividade</h1><p>Central de acontecimentos: tarefas, projetos, arquivos, gastos, estudos e alterações — registrados sozinhos.</p></div></div>
    <div class="toolbar"><div class="tabs" style="margin:0;flex-wrap:wrap;width:auto" id="kinds"><button class="on" data-k="">Tudo</button>${Object.entries(KINDS).map(([k, [l]]) => `<button data-k="${k}">${l}</button>`).join('')}</div>
      <div class="grow"></div><input class="input" id="fq" placeholder="Buscar no histórico..." style="height:34px;max-width:240px"></div>
    <div id="feed"></div><div style="text-align:center;margin-top:14px"><button class="btn outline sm" id="more">Carregar mais</button></div>`;
  const feed = el.querySelector('#feed');
  const paint = () => {
    let html = ''; let last = '';
    for (const e of items) {
      const day = dayLabel(e.at);
      if (day !== last) { html += `${last ? '</div>' : ''}<div class="feed-day">${esc(day)}</div><div class="feed">`; last = day; }
      html += itemHtml(e);
    }
    feed.innerHTML = html ? `${html}</div>` : '<div class="empty-mini">Nada registrado com esse filtro.</div>';
    el.querySelector('#more').hidden = done || !items.length;
  };
  const load = async (append) => {
    const params = new URLSearchParams({ limit: '80' });
    if (kind) params.set('kind', kind);
    if (q) params.set('q', q);
    if (append && items.length) params.set('before', items.at(-1).at);
    const got = await api.get(`/events?${params}`);
    done = got.length < 80;
    items = append ? [...items, ...got] : got;
    paint();
  };
  el.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => { kind = b.dataset.k; el.querySelectorAll('[data-k]').forEach((x) => x.classList.toggle('on', x === b)); load(); }; });
  let t; el.querySelector('#fq').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { q = e.target.value.trim(); load(); }, 250); };
  el.querySelector('#more').onclick = () => load(true);
  await load();
  return on('event', (e) => {
    if ((kind && e.kind !== kind) || (q && !`${e.title} ${e.detail}`.toLowerCase().includes(q.toLowerCase()))) return;
    items = [e, ...items.filter((x) => x.id !== e.id)];
    paint();
  });
}
