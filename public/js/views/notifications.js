// Central de notificações + novidades do sistema (changelog).
import { api } from '../api.js';
import { refreshUnread, on } from '../store.js';
import { icon } from '../icons.js';
import { esc, timeAgo, notifIcon } from '../ui.js';

export default async function render(el) {
  let tab = 'all';
  const draw = async () => {
    const [{ items }, log] = await Promise.all([api.get('/notifications'), api.get('/changelog')]);
    const list = items.filter((n) => tab === 'all' || (tab === 'unread' ? !n.read : n.type === tab));
    el.innerHTML = `<div class="page-head"><div><h1>Notificações</h1><p>Lembretes, briefing diário e atualizações do sistema</p></div><button class="btn outline" id="readAll">${icon('check', 14)} Marcar todas como lidas</button></div>
      <div class="tabs">${[['all', 'Todas'], ['unread', 'Não lidas'], ['task', 'Lembretes'], ['update', 'Atualizações'], ['system', 'Sistema'], ['log', 'Novidades']].map(([k, l]) => `<button data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${tab === 'log' ? log.entries.map((e) => `<div class="card" style="margin-bottom:10px"><h3 class="title">${icon('rocket', 15)} Versão ${esc(e.version)}${e.version === log.version ? ' <span class="chip ok">atual</span>' : ''}</h3><p style="margin:0 0 4px;font-weight:500">${esc(e.title || '')}</p><p class="sub" style="margin:0;white-space:pre-line">${esc(e.message || '')}</p></div>`).join('')
        : list.map((n) => `<div class="notif ${n.type} ${n.read ? '' : 'unread'}" data-n="${n.id}"><div class="n-ico">${icon(notifIcon(n.type), 17)}</div><div class="n-body"><h5>${esc(n.title)}</h5><p>${esc(n.message)}</p><time>${timeAgo(n.createdAt)}</time></div>
          <div class="n-acts">${n.link ? `<a class="icon-btn sm ghost" href="${esc(n.link)}" title="Abrir" data-open>${icon('chevRight', 14)}</a>` : ''}<button class="icon-btn sm ghost" data-read title="${n.read ? 'Marcar como não lida' : 'Marcar como lida'}">${icon(n.read ? 'eye' : 'check', 14)}</button><button class="icon-btn sm ghost" data-del title="Excluir">${icon('trash', 14)}</button></div></div>`).join('') || '<div class="empty-state"><div class="e-ico">' + icon('bell', 22) + '</div><b>Nada por aqui</b></div>'}`;
    el.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { tab = b.dataset.t; draw(); }; });
    el.querySelector('#readAll').onclick = async () => { await api.put('/notifications/read-all'); await refreshUnread(); draw(); };
    el.querySelectorAll('[data-n]').forEach((row) => {
      const n = items.find((x) => x.id === row.dataset.n);
      row.querySelector('[data-read]').onclick = async () => { await api.put(`/notifications/${n.id}/read`, { read: !n.read }); await refreshUnread(); draw(); };
      row.querySelector('[data-del]').onclick = async () => { await api.del(`/notifications/${n.id}`); await refreshUnread(); draw(); };
      row.querySelector('[data-open]')?.addEventListener('click', () => { if (!n.read) api.put(`/notifications/${n.id}/read`).then(refreshUnread); });
    });
  };
  await draw();
  return on('notification', draw);
}
