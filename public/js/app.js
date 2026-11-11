// Shell do Codeniac: menu lateral, barra superior, roteador, notificações em tempo real,
// painel do assistente, captura rápida (Alt+N) e banco de vocabulário por seleção.
import { api, auth, coll, streamChat } from './api.js';
import { store, on, emit, refreshProjects, refreshUnread, setUser, applySettings } from './store.js';
import { icon } from './icons.js';
import { $, $$, esc, avatar, chatMd, toast, timeAgo, notifIcon, modal, brl, todayISO } from './ui.js';
import { openProjectModal } from './components.js';
import { TOOL_LABEL, botAvatar, bindDictation, COMMANDS, MODE_LABEL } from './chatui.js';

if (!auth.token) location.replace('/login');

// Menu: chave da rota, rótulo, ícone
export const NAV = [
  ['Principal', [['dashboard', 'Início', 'dashboard'], ['assistente', 'Assistente', 'bot'], ['tasks', 'Minhas tarefas', 'tasks'], ['financeiro', 'Financeiro', 'wallet'], ['estudos', 'Estudos', 'school'], ['livros', 'Livros', 'book']]],
  ['Sistema', [['notifications', 'Notificações', 'bell'], ['achievements', 'Conquistas', 'trophy'], ['settings', 'Configurações', 'settings']]],
];
export const NAV_KEYS = NAV.flatMap(([, items]) => items.map(([k, l]) => [k, l]));

// Telas que saíram do menu continuam funcionando pelo endereço, pelos links e pela busca.
const VIEWS = {
  hoje: () => import('./views/hoje.js'), dashboard: () => import('./views/dashboard.js'), assistente: () => import('./views/assistant.js'),
  atividade: () => import('./views/atividade.js'), tasks: () => import('./views/tasks.js'), garagem: () => import('./views/garagem.js'),
  financeiro: () => import('./views/financeiro.js'), estudos: () => import('./views/estudos.js'), diario: () => import('./views/diario.js'),
  decisoes: () => import('./views/decisoes.js'), notifications: () => import('./views/notifications.js'), achievements: () => import('./views/achievements.js'),
  profile: () => import('./views/profile.js'), settings: () => import('./views/settings.js'), project: () => import('./views/project.js'),
  livros: () => import('./views/livros.js'),
};
const FULL_PAGE = new Set(['assistente', 'diario']);
// item do menu que fica aceso em cada tela
const NAV_OF = { garagem: 'financeiro', hoje: 'dashboard', atividade: 'dashboard', decisoes: 'dashboard', diario: 'dashboard', profile: 'settings' };

// ---------- Moldura: trilho de ícones, trilho direito, barra superior, barra do celular ----------
const currentRoute = () => (location.hash.slice(2).split('?')[0].split('/')[0]) || 'dashboard';
const navLabel = (k, l) => store.menu?.labels?.[k] || l;
const visibleNav = () => NAV.map(([g, items]) => [g, items.filter(([k]) => k === 'settings' || !(store.menu?.hidden || []).includes(k))]);
function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

function renderSidebar() {
  const cur = NAV_OF[currentRoute()] || currentRoute();
  const btn = ([k, l, ic]) => `<a class="rail-btn ${cur === k ? 'active' : ''}" href="#/${k}" data-tip="${esc(navLabel(k, l))}" aria-label="${esc(navLabel(k, l))}">${icon(ic, 19)}${(k === 'notifications' && store.unread) || (k === 'assistente' && store.chatUnread) ? '<i class="rail-dot"></i>' : ''}</a>`;
  const [main, sys] = visibleNav();
  $('#sidebar').innerHTML = `<a class="rail-logo" href="#/dashboard" aria-label="${esc(store.appName)}"><img src="${esc(store.images.logoIcon || '/assets/icon.png')}" alt=""></a>
    <nav class="rail-nav">${main[1].map(btn).join('')}<span class="rail-sep"></span>${sys[1].map(btn).join('')}
      <button class="rail-btn rail-only-mid" id="railProjects" data-tip="Projetos" aria-label="Projetos">${icon('folder', 19)}</button></nav>
    <button class="rail-add" id="railAdd" data-tip="Capturar (Alt+N)" aria-label="Captura rápida">${icon('plus', 18)}</button>`;
  $('#railAdd').onclick = () => openCapture();
  $('#railProjects').onclick = () => openSheet();
  renderRightRail();
  renderBottomNav();
}

function renderRightRail() {
  const slug = location.hash.startsWith('#/project/') ? location.hash.split('/')[2] : null;
  const fresh = (p) => Date.now() - new Date(p.updatedAt || 0).getTime() < 3 * 86400000;
  $('#rail').innerHTML = `<div class="rail-card"><a class="rail-me" href="#/profile" data-tip="Meu perfil" aria-label="Meu perfil">${avatar(store.user, '', 44)}</a></div>
    <div class="rail-card rail-projects">${store.projects.map((p) => `<a class="rail-proj ${slug === p.slug ? 'on' : ''}" href="#/project/${esc(p.slug)}" data-tip="${esc(p.name)}" aria-label="${esc(p.name)}" style="--c:${esc(p.color)}">
        <span class="rp-ico">${p.cover ? `<img src="${esc(p.cover)}" alt="">` : icon(p.icon, 17)}</span>${fresh(p) ? '<i class="rp-st"></i>' : ''}${slug === p.slug ? '<em>aberto</em>' : ''}</a>`).join('')}
      <button class="rail-proj add" id="railNewProj" data-tip="Novo projeto" aria-label="Novo projeto"><span class="rp-ico">${icon('plus', 16)}</span></button></div>
    <div class="rail-card"><button class="rail-proj" id="railBot" data-tip="${esc(store.settings.assistantName || 'Assistente')}" aria-label="Abrir assistente">${botAvatar(40)}</button>
      <a class="rail-proj" href="#/settings" data-tip="Configurações" aria-label="Configurações"><span class="rp-ico plain">${icon('settings', 17)}</span></a></div>`;
  $('#railNewProj').onclick = () => openProjectModal().then((p) => { if (p) location.hash = `#/project/${p.slug}`; });
  $('#railBot').onclick = toggleAssistant;
}

function renderBottomNav() {
  const cur = NAV_OF[currentRoute()] || currentRoute();
  const b = (k, l, ic) => `<a class="bn-btn ${cur === k ? 'on' : ''}" href="#/${k}">${icon(ic, 20)}<span>${esc(navLabel(k, l))}</span></a>`;
  $('#bottomNav').innerHTML = `<button class="bn-btn" id="bnMenu">${icon('menu', 20)}<span>Menu</span></button>${b('dashboard', 'Início', 'dashboard')}
    <button class="bn-main" id="bnAdd" aria-label="Captura rápida">${icon('plus', 24)}</button>
    ${b('financeiro', 'Finanças', 'wallet')}<a class="bn-btn ${cur === 'assistente' ? 'on' : ''}" href="#/assistente" style="position:relative">${icon('chat', 20)}<span>Chat</span>${store.chatUnread ? '<i class="rail-dot" style="top:4px;right:14px"></i>' : ''}</a>`;
  $('#bnAdd').onclick = () => openCapture();
  $('#bnMenu').onclick = () => openSheet();
}

// Menu completo (celular e tablet): telas, projetos e conta.
function openSheet() {
  closeSheet();
  const sheet = document.createElement('div');
  sheet.className = 'sheet-back';
  const [main, sys] = visibleNav();
  sheet.innerHTML = `<div class="sheet" role="dialog" aria-label="Menu"><div class="sheet-grip"></div>
    <div class="sheet-grid">${[...main[1], ...sys[1]].map(([k, l, ic]) => `<a class="sheet-item" href="#/${k}"><span>${icon(ic, 20)}</span>${esc(navLabel(k, l))}</a>`).join('')}
      <button class="sheet-item" data-act="bot"><span>${botAvatar(30)}</span>${esc(store.settings.assistantName || 'Assistente')}</button></div>
    <h6>Projetos</h6><div class="sheet-grid">${store.projects.map((p) => `<a class="sheet-item" href="#/project/${esc(p.slug)}"><span style="background:${esc(p.color)};color:#fff">${icon(p.icon, 18)}</span>${esc(p.name)}</a>`).join('')}
      <button class="sheet-item" data-act="proj"><span>${icon('plus', 18)}</span>Novo projeto</button></div>
    <div class="sheet-foot"><a class="btn sm outline" href="#/profile">${icon('user', 13)} Perfil</a><button class="btn sm outline" data-act="logout">${icon('logout', 13)} Sair</button></div></div>`;
  document.body.append(sheet);
  requestAnimationFrame(() => sheet.classList.add('open'));
  sheet.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (e.target === sheet || e.target.closest('a')) closeSheet();
    if (act === 'bot') { closeSheet(); toggleAssistant(); }
    if (act === 'proj') { closeSheet(); openProjectModal().then((p) => { if (p) location.hash = `#/project/${p.slug}`; }); }
    if (act === 'logout') { auth.clear(); localStorage.removeItem('codeniac.conv'); location.href = '/login'; }
  });
}
function closeSheet() { document.querySelectorAll('.sheet-back').forEach((x) => x.remove()); }
function toggleAssistant() {
  if (store.settings.assistantEnabled === false) { location.hash = '#/settings/assistente'; return; }
  document.body.classList.toggle('assistant-open');
  if (document.body.classList.contains('assistant-open')) setTimeout(() => $('#msg')?.focus(), 250);
}

function renderTopbar() {
  const first = (store.user.name || '').split(' ')[0];
  $('#topbar').innerHTML = `<div class="greet"><span>${greeting()},</span> <b>${esc(first)}</b></div>
    <div class="search" id="search">${icon('search', 15)}<input id="q" placeholder="Buscar..." autocomplete="off" aria-label="Buscar"><span class="kbd">Ctrl K</span><div class="search-results" id="results"></div></div>
    <button class="round-btn" id="asToggle" title="Assistente" aria-label="Assistente">${icon('bot', 17)}</button>
    <div class="rel"><button class="round-btn" id="bell" aria-label="Notificações">${icon('bell', 17)}<span class="dot" id="bellDot" ${store.unread ? '' : 'hidden'}>${store.unread}</span></button><div class="dropdown" id="notifDrop"></div></div>
    <a class="top-avatar" href="#/profile" title="Perfil">${avatar(store.user, '', 38)}</a>`;
  $('#asToggle').onclick = toggleAssistant;
  $('#bell').onclick = toggleNotifDrop;
  bindSearch();
}

// ---------- Busca ----------
function bindSearch() {
  const q = $('#q');
  const box = $('#results');
  let timer;
  let hl = -1;
  const close = () => { box.classList.remove('open'); hl = -1; };
  q.addEventListener('input', () => {
    clearTimeout(timer);
    if (!q.value.trim()) return close();
    timer = setTimeout(async () => {
      const r = await api.get(`/search?q=${encodeURIComponent(q.value.trim())}`);
      const sec = (title, items) => (items.length ? `<h6>${title}</h6>${items.join('')}` : '');
      const html = sec('Projetos', r.projects.map((p) => `<a href="#/project/${esc(p.slug)}"><span class="mini-ico" style="--c:${esc(p.color)}">${icon(p.icon, 12)}</span>${esc(p.name)}</a>`))
        + sec('Tarefas', r.tasks.map((t) => `<a href="#/tasks?open=${t.id}">${icon('check', 14)}${esc(t.title)}<small class="muted" style="margin-left:auto">${esc(t.projectName || '')}</small></a>`))
        + sec('Páginas', r.pages.map((p) => `<a href="#/project/${esc(p.projectSlug)}${p.root ? '' : `/p/${p.id}`}">${esc(p.icon || '📄')} ${esc(p.title)}<small class="muted" style="margin-left:auto">${esc(p.projectName || '')}</small></a>`))
        + sec('Cartões de inglês', r.cards.map((c) => `<a href="#/estudos">${icon('globe', 14)}${esc(c.front)} <small class="muted">— ${esc(c.back)}</small></a>`))
        + sec('Agenda', r.agenda.map((a) => `<a href="#/hoje">${icon('calendar', 14)}${esc(a.title)}<small class="muted" style="margin-left:auto">${a.date.split('-').reverse().join('/')}</small></a>`));
      box.innerHTML = html || '<div class="empty">Nada encontrado.</div>';
      box.classList.add('open');
    }, 180);
  });
  q.addEventListener('keydown', (e) => {
    const links = $$('a', box);
    if (e.key === 'Escape') { close(); q.blur(); }
    if (!links.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      hl = (hl + (e.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length;
      links.forEach((a, i) => a.classList.toggle('hl', i === hl));
    }
    if (e.key === 'Enter') { (links[hl] || links[0]).click(); close(); q.value = ''; }
  });
  box.addEventListener('click', (e) => { if (e.target.closest('a')) { close(); q.value = ''; } });
  document.addEventListener('mousedown', (e) => { if (!$('#search')?.contains(e.target)) close(); });
}

// ---------- Notificações ----------
async function toggleNotifDrop() {
  const drop = $('#notifDrop');
  if (drop.classList.contains('open')) return drop.classList.remove('open');
  const { items } = await api.get('/notifications');
  drop.innerHTML = `<div class="d-head"><b>Notificações</b><button class="see-more" id="readAll">Marcar todas como lidas</button></div>
    <div class="d-list">${items.slice(0, 10).map((n) => `<a class="notif ${n.type} ${n.read ? '' : 'unread'}" href="${esc(n.link || '#/notifications')}" data-id="${n.id}"><div class="n-ico">${icon(notifIcon(n.type), 16)}</div><div class="n-body"><h5>${esc(n.title)}</h5><p>${esc(n.message)}</p><time>${timeAgo(n.createdAt)}</time></div></a>`).join('') || '<div class="empty-mini">Tudo em dia por aqui ✨</div>'}</div>
    <a class="see-more" href="#/notifications" style="margin:8px auto 0;display:flex;justify-content:center">Ver todas</a>`;
  drop.classList.add('open');
  $('#readAll').onclick = async () => { await api.put('/notifications/read-all'); await refreshUnread(); drop.classList.remove('open'); };
  drop.onclick = async (e) => {
    const a = e.target.closest('a.notif');
    if (a) { api.put(`/notifications/${a.dataset.id}/read`).then(refreshUnread); }
    if (e.target.closest('a')) drop.classList.remove('open');
  };
  setTimeout(() => document.addEventListener('mousedown', function off(ev) { if (!drop.parentElement.contains(ev.target)) { drop.classList.remove('open'); document.removeEventListener('mousedown', off); } }));
}

function beep() {
  try {
    const ctx = new AudioContext(); const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = 880; g.gain.value = 0.05; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.12);
  } catch { /* sem áudio */ }
}

function connectStream() {
  const es = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(auth.token)}`);
  es.addEventListener('notification', (e) => {
    const n = JSON.parse(e.data);
    store.unread++; emit('unread', store.unread);
    toast(n.title, n.message, n.type === 'update' ? 'success' : 'info');
    if (store.settings.notifySound) beep();
    emit('notification', n);
  });
  es.addEventListener('event', (e) => emit('event', JSON.parse(e.data)));
  es.addEventListener('chat', (e) => {
    const ev = JSON.parse(e.data);
    emit('chat', ev);
    showChatHead(ev);
  });
  es.onerror = () => { es.close(); setTimeout(connectStream, 5000); };
}

// ---------- Painel lateral do assistente ----------
const convKey = 'codeniac.panelConv';
let busy = false;
function msgHtml(m) {
  const me = m.role === 'user';
  const time = m.at ? new Date(m.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
  return `<div class="msg ${me ? 'me' : ''}"><div class="who">${me ? '' : botAvatar(24)}<div>${me ? 'Você' : esc(store.settings.assistantName || 'Niac')}</div><time>${time}</time></div>
    <div class="bubble">${me ? esc(m.text) : chatMd(m.text || '')}</div>
    ${(m.tools || []).map((t) => `<span class="tool-note">${icon('check', 11)} ${esc(TOOL_LABEL[t] || t)}</span>`).join('')}
    ${m.link ? `<a class="go-link" href="${esc(m.link)}">${icon('chevRight', 11)} Abrir</a>` : ''}</div>`;
}

async function renderAssistantPanel() {
  const name = store.settings.assistantName || 'Niac';
  $('#assistant').innerHTML = `<div class="assistant-panel"><div class="assistant-head"><h3><span style="display:flex;align-items:center;gap:8px">${botAvatar(26)} ${esc(name)} <span class="online"></span></span>
      <span style="display:flex;gap:4px"><button class="icon-btn sm ghost" id="asNew" title="Nova conversa">${icon('plus', 14)}</button><a class="icon-btn sm ghost" href="#/assistente" title="Abrir em tela cheia">${icon('columns', 14)}</a><button class="icon-btn sm ghost assistant-close" id="asClose">${icon('x', 14)}</button></span></h3>
      <small class="muted" id="asMode">Assistente do Codeniac · ${MODE_LABEL[store.aiMode] || 'sem IA'}</small></div>
      <div class="chat" id="chat"></div>
      <form class="composer" id="composer"><input id="msg" placeholder="Pergunte ou use /comandos..." autocomplete="off"><button type="button" class="icon-btn sm ghost" id="mic" aria-label="Ditado">${icon('mic', 14)}</button><button class="icon-btn sm" aria-label="Enviar" style="background:var(--accent);color:var(--on-accent)">${icon('send', 14)}</button></form></div>`;
  $('#asClose').onclick = () => document.body.classList.remove('assistant-open');
  $('#asNew').onclick = () => { localStorage.removeItem(convKey); loadPanelConversation(); };
  $('#composer').onsubmit = (e) => { e.preventDefault(); sendPanel($('#msg').value); };
  bindDictation($('#mic'), $('#msg'));
  loadPanelConversation();
}

async function loadPanelConversation() {
  const chat = $('#chat');
  if (!chat) return;
  const id = localStorage.getItem(convKey);
  let messages = [];
  if (id) { try { messages = (await api.get(`/assistant/conversations/${id}`)).messages; } catch { localStorage.removeItem(convKey); } }
  const first = (store.user.name || '').split(' ')[0];
  chat.innerHTML = messages.length ? messages.slice(-30).map(msgHtml).join('')
    : msgHtml({ role: 'assistant', text: `Oi, ${first}! Sou ${store.settings.assistantName || 'o Niac'}. Pode falar comigo normalmente: "gastei 50 de gasolina", "tarefa: estudar SQL", "como foi meu mês?". Pra fotos, PDFs, personagens e grupos, abre a tela do **Assistente**.` });
  chat.scrollTop = chat.scrollHeight;
}

export async function sendPanel(text) {
  text = text.trim();
  if (!text || busy) return;
  busy = true;
  const chat = $('#chat');
  $('#msg').value = '';
  chat.insertAdjacentHTML('beforeend', msgHtml({ role: 'user', text, at: new Date().toISOString() }));
  chat.insertAdjacentHTML('beforeend', `<div class="msg" id="pending"><div class="who">${botAvatar(24)}<div>${esc(store.settings.assistantName || 'Niac')}</div></div><div class="bubble"><span class="typing"><i></i><i></i><i></i></span></div></div>`);
  chat.scrollTop = chat.scrollHeight;
  const pending = $('#pending');
  const bubble = pending.querySelector('.bubble');
  let acc = '';
  try {
    await streamChat(text, localStorage.getItem(convKey), (ev) => {
      if (ev.type === 'conversation') localStorage.setItem(convKey, ev.id);
      if (ev.type === 'text') { acc += ev.text; bubble.innerHTML = chatMd(acc); }
      if (ev.type === 'tool') { pending.insertAdjacentHTML('beforeend', `<span class="tool-note">${icon('check', 11)} ${esc(TOOL_LABEL[ev.name] || ev.name)}</span>`); emit('data-changed'); }
      if (ev.type === 'notice') pending.insertAdjacentHTML('beforeend', `<span class="notice">${esc(ev.text)}</span>`);
      if (ev.type === 'link') pending.insertAdjacentHTML('beforeend', `<a class="go-link" href="${esc(ev.href)}">${icon('chevRight', 11)} Abrir</a>`);
      if (ev.type === 'error') bubble.textContent = ev.text;
      chat.scrollTop = chat.scrollHeight;
    });
  } catch (err) { bubble.textContent = err.message; }
  pending.removeAttribute('id');
  busy = false;
  emit('data-changed');
}

// ---------- Balão flutuante: mensagem nova de um personagem ----------
function headFace(ev) {
  if (ev.avatar) return `<span class="ch-img"><img src="${esc(ev.avatar)}" alt=""></span>`;
  return `<span class="ch-img" style="background:${esc(ev.color || 'var(--accent)')}">${esc((ev.name || '?')[0].toUpperCase())}</span>`;
}
function showChatHead(ev) {
  const viewing = document.body.dataset.route === 'assistente' && localStorage.getItem('codeniac.conv') === ev.conversationId && document.visibilityState === 'visible';
  if (viewing) return;
  store.chatUnread = (store.chatUnread || 0) + 1;
  renderSidebar();
  let wrap = $('#chatHeads');
  if (!wrap) { wrap = document.createElement('div'); wrap.id = 'chatHeads'; wrap.className = 'chat-heads'; document.body.append(wrap); }
  let head = wrap.querySelector(`[data-c="${ev.conversationId}"]`);
  if (!head) {
    head = document.createElement('div');
    head.className = 'chat-head';
    head.dataset.c = ev.conversationId;
    head.innerHTML = `<div class="ch-balloon" role="button" tabindex="0"><button class="ch-x" aria-label="Fechar">${icon('x', 12)}</button><b></b><p></p></div><button class="ch-face" aria-label="Abrir conversa">${headFace(ev)}<span class="ch-count">0</span></button>`;
    wrap.prepend(head);
    const open = () => { localStorage.setItem('codeniac.conv', ev.conversationId); head.remove(); if (location.hash.startsWith('#/assistente')) route(); else location.hash = '#/assistente'; };
    head.querySelector('.ch-face').onclick = open;
    head.querySelector('.ch-balloon').onclick = (e) => { if (!e.target.closest('.ch-x')) open(); };
    head.querySelector('.ch-x').onclick = () => head.remove();
  }
  const count = head.querySelector('.ch-count');
  count.textContent = String(Number(count.textContent) + 1);
  head.querySelector('.ch-balloon b').textContent = ev.name;
  head.querySelector('.ch-balloon p').textContent = ev.text;
  head.classList.remove('mini');
  head.classList.add('pop');
  setTimeout(() => head.classList.remove('pop'), 600);
  clearTimeout(head._t);
  head._t = setTimeout(() => head.classList.add('mini'), 10000);
  while (wrap.children.length > 3) wrap.lastElementChild.remove();
  if (store.settings.notifySound) beep();
}

// ---------- Captura rápida ----------
const QC_KINDS = [['ideia', '💡 Ideia'], ['tarefa', '✅ Tarefa'], ['nota', '📝 Nota'], ['link', '🔗 Link'], ['gasto', '💸 Gasto'], ['agenda', '📅 Compromisso']];
export function openCapture(preset = '') {
  if (document.querySelector('.modal-backdrop [data-qc]')) return;
  let kind = /^https?:\/\//.test(preset) ? 'link' : 'ideia';
  modal({
    title: 'Captura rápida',
    body: `<form class="form" data-qc><div class="qc-kinds">${QC_KINDS.map(([k, l]) => `<button type="button" class="chip ${k === kind ? 'yellow' : ''}" data-k="${k}">${l}</button>`).join('')}</div>
      <div class="field"><textarea name="text" rows="3" placeholder="Escreva e pronto. Organize depois na caixa de entrada (aba Hoje).">${esc(preset)}</textarea><span class="hint" id="qcHint">Vai para a caixa de entrada.</span></div>
      <div class="form-row" id="qcExtra"></div>
      <div class="form-actions"><span class="muted" style="margin-right:auto;font-size:11px">Atalho: Alt+N · Ctrl+Enter salva</span><button type="button" class="btn outline" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></form>`,
    onMount: (m, close) => {
      const form = m.querySelector('form');
      const hint = m.querySelector('#qcHint');
      const extra = m.querySelector('#qcExtra');
      const HINTS = { ideia: 'Vai para a caixa de entrada.', nota: 'Vai para a caixa de entrada como nota.', link: 'Salvo em "para ler" (aparece no briefing).',
        tarefa: 'Cria uma tarefa no projeto escolhido.', gasto: 'Ex.: "50 gasolina" ou "32,90 mercado". Entra no Financeiro como saída.', agenda: 'Escolha a data e o horário abaixo.' };
      const paint = () => {
        m.querySelectorAll('[data-k]').forEach((b) => b.classList.toggle('yellow', b.dataset.k === kind));
        hint.textContent = HINTS[kind];
        extra.innerHTML = kind === 'tarefa' ? `<div class="field"><label>Projeto</label><select name="projectId">${store.projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div><div class="field"><label>Prazo</label><input type="date" name="dueDate"></div>`
          : kind === 'agenda' ? `<div class="field"><label>Data</label><input type="date" name="date" value="${todayISO()}"></div><div class="field"><label>Horário</label><input type="time" name="time"></div>` : '';
      };
      paint();
      m.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { kind = b.dataset.k; paint(); form.text.focus(); }));
      form.text.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) form.requestSubmit(); });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = form.text.value.trim();
        if (!text) return;
        try {
          if (kind === 'tarefa') await api.post('/tasks', { title: text, projectId: form.projectId.value, dueDate: form.dueDate.value });
          else if (kind === 'agenda') await coll('agenda').add({ title: text, date: form.date.value, time: form.time.value });
          else if (kind === 'gasto') {
            const mt = text.match(/^(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)\s*(.*)$/i);
            if (!mt) throw new Error('Comece pelo valor, ex.: 50 gasolina');
            const v = Number(mt[1].replace(',', '.'));
            await coll('money').add({ date: todayISO(), desc: mt[2] || 'Gasto', amount: -v });
            toast('Gasto registrado', `${brl(v)} — ${mt[2] || 'Gasto'}`, 'success'); close(); emit('data-changed'); return;
          } else await coll('inbox').add({ text, kind: kind === 'link' ? 'link' : kind });
          toast('Guardado', kind === 'tarefa' ? 'Tarefa criada.' : kind === 'agenda' ? 'Compromisso na agenda.' : 'Está na sua caixa de entrada.', 'success');
          close(); emit('data-changed');
        } catch (err) { toast('Erro', err.message, 'error'); }
      });
    },
  });
}

// ---------- Banco de vocabulário: selecione uma palavra/frase em inglês ----------
function bindVocab() {
  let fab = null;
  const hide = () => { fab?.remove(); fab = null; };
  document.addEventListener('mouseup', (e) => {
    if (e.target.closest('.vocab-fab')) return;
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel?.toString().trim() || '';
      const node = sel?.anchorNode?.parentElement;
      hide();
      if (!text || text.length > 80 || text.split(/\s+/).length > 7 || !/[a-z]/i.test(text)) return;
      if (!node || node.closest('input, textarea, [contenteditable="true"], .modal, .tg-composer, .composer')) return;
      const r = sel.getRangeAt(0).getBoundingClientRect();
      const z = Number(getComputedStyle(document.body).zoom) || 1;
      fab = document.createElement('button');
      fab.className = 'vocab-fab';
      fab.innerHTML = `${icon('plus', 12)} Vocabulário`;
      fab.style.top = `${(r.bottom / z) + 8}px`;
      fab.style.left = `${Math.max(8, r.left / z)}px`;
      const sentence = (node.textContent || '').split(/(?<=[.!?])\s+/).find((s) => s.includes(text)) || '';
      fab.onmousedown = (ev) => ev.preventDefault();
      fab.onclick = () => { hide(); addVocab(text, sentence.trim().slice(0, 300)); };
      document.body.append(fab);
    });
  });
  document.addEventListener('scroll', hide, true);
}

async function addVocab(front, example) {
  const { formModal } = await import('./ui.js');
  formModal({
    title: 'Adicionar ao banco de vocabulário',
    fields: [
      { name: 'front', label: 'Palavra ou expressão (inglês)', value: front, full: true },
      { name: 'back', label: 'Significado (português)', value: '', full: true, placeholder: 'Escreva com suas palavras' },
      { name: 'example', label: 'Frase de exemplo', value: example, full: true, type: 'textarea', rows: 2 },
      { name: 'deck', label: 'Baralho', value: 'Vocabulário' },
    ],
    submit: 'Criar cartão',
    onSubmit: async (d) => { await coll('cards').add(d); toast('Cartão criado', 'Ele entra na revisão espaçada de hoje.', 'success'); emit('data-changed'); },
  });
}

// ---------- Roteador ----------
let cleanup = null;
let routeSeq = 0;
async function route() {
  const seq = ++routeSeq;
  const raw = location.hash.slice(2);
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  let name = parts[0] || store.settings.homePage || 'dashboard';
  if (!VIEWS[name]) name = 'dashboard';
  if (name === 'estudos' && parts[1] === 'livros') { location.replace('#/livros'); return; }
  if (store.menu?.hidden?.includes(name) && !['settings', 'profile', 'project'].includes(name)) name = 'dashboard';
  document.body.classList.remove('sidebar-open', 'assistant-open');
  closeSheet();
  document.body.classList.toggle('on-full-page', FULL_PAGE.has(name));
  document.body.dataset.route = name;
  if (name === 'assistente') { store.chatUnread = 0; document.querySelectorAll('.chat-head').forEach((h) => h.remove()); }
  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* ignore */ } }
  cleanup = null;
  const view = $('#view');
  view.innerHTML = '<div class="skeleton" style="height:220px;border-radius:var(--radius)"></div>';
  try {
    const mod = await VIEWS[name]();
    if (seq !== routeSeq) return;
    const el = document.createElement('div');
    el.className = 'view';
    view.replaceChildren(el);
    cleanup = await mod.default(el, parts.slice(1), new URLSearchParams(query));
  } catch (err) {
    console.error(err);
    if (seq === routeSeq) view.innerHTML = `<div class="empty-state"><b>Não foi possível abrir esta tela</b><p>${esc(err.message)}</p></div>`;
  }
  $('#view').scrollTop = 0;
  $('.content').scrollTop = 0;
  renderSidebar();
}

// ---------- Início ----------
// Altura visível de verdade (descontando barra do navegador e teclado do celular).
function trackViewport() {
  const vv = window.visualViewport;
  const set = () => {
    document.documentElement.style.setProperty('--vvh', `${Math.round(vv ? vv.height : innerHeight)}px`);
    document.documentElement.style.setProperty('--vvt', `${Math.round(vv ? vv.offsetTop : 0)}px`);
  };
  set();
  vv?.addEventListener('resize', set);
  vv?.addEventListener('scroll', set);
  addEventListener('resize', set);
}
trackViewport();

async function boot() {
  let me;
  try { me = await api.get('/auth/me'); } catch { return; }
  store.version = me.version;
  store.appName = me.system?.appName || 'Codeniac';
  store.images = me.system?.images || {};
  store.menu = me.system?.menu || { hidden: [], labels: {} };
  document.title = store.appName;
  setUser(me.user);
  applySettings(me.settings);
  try { store.aiMode = (await api.get('/assistant/status')).mode; } catch { /* ok */ }
  await Promise.all([refreshProjects(), refreshUnread()]);
  try { store.chatUnread = (await api.get('/assistant/conversations')).reduce((a, c) => a + (c.unread || 0), 0); } catch { /* ok */ }
  renderSidebar(); renderTopbar();
  renderAssistantPanel();
  on('projects', renderSidebar);
  on('user', () => { renderSidebar(); renderTopbar(); });
  on('unread', (n) => { const d = $('#bellDot'); if (d) { d.hidden = !n; d.textContent = n; } renderSidebar(); });
  on('system', (sys) => { store.images = sys.images || store.images; store.menu = sys.menu || store.menu; store.appName = sys.appName || store.appName; renderSidebar(); });
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#q')?.focus(); }
    if (e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); openCapture(); }
  });
  $('.overlay').onclick = () => document.body.classList.remove('sidebar-open', 'assistant-open');
  setInterval(() => { const g = $('.greet span'); if (g) g.textContent = `${greeting()},`; }, 600000);
  bindVocab();
  connectStream();
  route();
}
boot();
