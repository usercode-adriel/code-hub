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
  ['Principal', [['hoje', 'Hoje', 'sun'], ['dashboard', 'Dashboard', 'dashboard'], ['assistente', 'Assistente', 'bot'], ['atividade', 'Atividade', 'activity']]],
  ['Rotina', [['tasks', 'Minhas tarefas', 'tasks'], ['garagem', 'Garagem', 'car'], ['financeiro', 'Financeiro', 'wallet'], ['estudos', 'Estudos', 'school'], ['diario', 'Diário', 'feather'], ['decisoes', 'Decisões', 'scale']]],
  ['Sistema', [['notifications', 'Notificações', 'bell'], ['achievements', 'Conquistas', 'trophy'], ['settings', 'Configurações', 'settings']]],
];
export const NAV_KEYS = NAV.flatMap(([, items]) => items.map(([k, l]) => [k, l]));

const VIEWS = {
  hoje: () => import('./views/hoje.js'), dashboard: () => import('./views/dashboard.js'), assistente: () => import('./views/assistant.js'),
  atividade: () => import('./views/atividade.js'), tasks: () => import('./views/tasks.js'), garagem: () => import('./views/garagem.js'),
  financeiro: () => import('./views/financeiro.js'), estudos: () => import('./views/estudos.js'), diario: () => import('./views/diario.js'),
  decisoes: () => import('./views/decisoes.js'), notifications: () => import('./views/notifications.js'), achievements: () => import('./views/achievements.js'),
  profile: () => import('./views/profile.js'), settings: () => import('./views/settings.js'), project: () => import('./views/project.js'),
};
const FULL_PAGE = new Set(['assistente', 'diario']);

// ---------- Shell ----------
function logoHtml() {
  const custom = store.images.logo;
  return `<img class="brand-mark ${custom ? 'custom' : ''}" src="${esc(custom || '/assets/logo.png')}" alt="${esc(store.appName)}">`;
}

function renderSidebar() {
  const { hidden = [], labels = {} } = store.menu || {};
  const cur = (location.hash.slice(2) || '').split('/')[0];
  const groups = NAV.map(([g, items]) => {
    const vis = items.filter(([k]) => !hidden.includes(k) || (k === 'settings'));
    if (!vis.length) return '';
    return `<div class="nav-group">${esc(g)}</div>${vis.map(([k, l, ic]) => `<a class="nav-item ${cur === k ? 'active' : ''}" href="#/${k}" data-k="${k}">${icon(ic, 17)}<span>${esc(labels[k] || l)}</span>${k === 'notifications' && store.unread ? `<span class="nav-badge">${store.unread}</span>` : ''}</a>`).join('')}`;
  }).join('');
  const slug = location.hash.startsWith('#/project/') ? location.hash.split('/')[2] : null;
  const projects = store.projects.map((p) => `<a class="project-link ${slug === p.slug ? 'active' : ''}" href="#/project/${esc(p.slug)}"><span class="mini-ico" style="--c:${esc(p.color)}">${icon(p.icon, 12)}</span>${esc(p.name)}<span class="count">${p.pages || ''}</span></a>`).join('');
  const u = store.user;
  $('#sidebar').innerHTML = `<a class="brand" href="#/${store.settings.homePage || 'hoje'}">${logoHtml()}<span class="brand-sub">hub pessoal</span></a>
    <nav class="nav">${groups}
      <div class="nav-section"><div class="nav-section-title" role="button" tabindex="0" id="projToggle" aria-expanded="true">${icon('folder', 17)} Projetos ${icon('chevDown', 14, 'class="chev"')}</div>
        <div class="nav-sub open" id="projList">${projects}<a class="project-link add" href="#" id="newProj"><span class="mini-ico">${icon('plus', 12)}</span>Novo projeto</a></div></div></nav>
    <div class="profile-card">${avatar(u, 'lg')}<div class="name">${esc(u.name)}</div><div class="role">${u.role === 'admin' ? 'Administrador' : 'Membro'}</div>
      <div style="display:flex;gap:6px;justify-content:center"><a class="btn sm outline" href="#/profile">${icon('user', 13)} Perfil</a><button class="icon-btn sm" id="logout" title="Sair">${icon('logout', 14)}</button></div></div>`;
  $('#newProj').onclick = (e) => { e.preventDefault(); openProjectModal().then((p) => { if (p) location.hash = `#/project/${p.slug}`; }); };
  $('#logout').onclick = () => { auth.clear(); localStorage.removeItem('codeniac.conv'); location.href = '/login'; };
  const tg = $('#projToggle');
  const toggle = () => { const open = $('#projList').classList.toggle('open'); tg.setAttribute('aria-expanded', open); };
  tg.onclick = toggle; tg.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } };
}

function renderTopbar() {
  $('#topbar').innerHTML = `<button class="icon-btn menu-btn" id="menuBtn" aria-label="Menu">${icon('menu', 18)}</button>
    <div class="search" id="search">${icon('search', 15)}<input id="q" placeholder="Buscar projetos, tarefas, páginas, cartões..." autocomplete="off" aria-label="Buscar"><span class="kbd">Ctrl K</span><div class="search-results" id="results"></div></div>
    <div class="spacer"></div>
    <button class="btn sm primary" id="captureBtn" title="Captura rápida (Alt+N)">${icon('plus', 14)}<span class="hide-sm">Capturar</span></button>
    <div class="rel"><button class="icon-btn" id="bell" aria-label="Notificações">${icon('bell', 17)}<span class="dot" id="bellDot" ${store.unread ? '' : 'hidden'}>${store.unread}</span></button><div class="dropdown" id="notifDrop"></div></div>
    <button class="icon-btn assistant-toggle" id="asToggle" aria-label="Assistente">${icon('bot', 17)}</button>
    <a href="#/profile" class="hide-sm" title="Perfil">${avatar(store.user, '', 36)}</a>`;
  $('#menuBtn').onclick = () => document.body.classList.toggle('sidebar-open');
  $('#asToggle').onclick = () => document.body.classList.toggle('assistant-open');
  $('#captureBtn').onclick = openCapture;
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
  es.onerror = () => { es.close(); setTimeout(connectStream, 5000); };
}

// ---------- Painel lateral do assistente ----------
const convKey = 'codeniac.conv';
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
      <div class="suggestions" id="sugs">${['/briefing', 'O que tenho hoje?', '/corrida 35 12km', 'Como funciona o backup?'].map((s) => `<button>${esc(s)}</button>`).join('')}</div>
      <form class="composer" id="composer"><input id="msg" placeholder="Pergunte ou use /comandos..." autocomplete="off"><button type="button" class="icon-btn sm ghost" id="mic" aria-label="Ditado">${icon('mic', 14)}</button><button class="icon-btn sm" aria-label="Enviar" style="background:var(--accent);color:var(--on-accent)">${icon('send', 14)}</button></form></div>`;
  $('#asClose').onclick = () => document.body.classList.remove('assistant-open');
  $('#asNew').onclick = () => { localStorage.removeItem(convKey); loadPanelConversation(); };
  $('#composer').onsubmit = (e) => { e.preventDefault(); sendPanel($('#msg').value); };
  $('#sugs').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; if (b.textContent.endsWith(' ')) { $('#msg').value = b.textContent; $('#msg').focus(); } else sendPanel(b.textContent); };
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
    : msgHtml({ role: 'assistant', text: `Oi, ${first}! Sou ${store.settings.assistantName || 'o Niac'}. Posso montar seu **briefing**, registrar gastos e corridas (\`/gasto 50 gasolina\`, \`/corrida 35 12km\`), criar tarefas (\`/tarefa Estudar SQL\`) e explicar qualquer parte do hub. Digite **/ajuda** para ver tudo.` });
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
  let name = parts[0] || store.settings.homePage || 'hoje';
  if (!VIEWS[name]) name = 'hoje';
  if (store.menu?.hidden?.includes(name) && !['settings', 'profile', 'project'].includes(name)) name = 'dashboard';
  document.body.classList.remove('sidebar-open', 'assistant-open');
  document.body.classList.toggle('on-full-page', FULL_PAGE.has(name));
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
  renderSidebar(); renderTopbar();
  if (me.settings.assistantEnabled !== false) renderAssistantPanel(); else document.body.classList.add('no-assistant');
  on('projects', renderSidebar);
  on('user', () => { renderSidebar(); renderTopbar(); });
  on('unread', (n) => { const d = $('#bellDot'); if (d) { d.hidden = !n; d.textContent = n; } renderSidebar(); });
  on('settings', (s) => { document.body.classList.toggle('no-assistant', s.showAssistantPanel === false || s.assistantEnabled === false); });
  on('system', (sys) => { store.images = sys.images || store.images; store.menu = sys.menu || store.menu; store.appName = sys.appName || store.appName; renderSidebar(); });
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#q')?.focus(); }
    if (e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); openCapture(); }
  });
  $('.overlay').onclick = () => document.body.classList.remove('sidebar-open', 'assistant-open');
  $('#fabCapture').onclick = () => openCapture();
  bindVocab();
  connectStream();
  route();
}
boot();
