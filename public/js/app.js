// Shell do Codeniac: menu lateral, barra superior, roteador, notificações em tempo real,
// painel do assistente, captura rápida (Alt+N) e banco de vocabulário por seleção.
import { api, auth, coll, streamChat } from './api.js';
import { store, on, emit, refreshProjects, refreshUnread, setUser, applySettings } from './store.js';
import { icon } from './icons.js';
import { $, $$, esc, avatar, chatMd, toast, timeAgo, notifIcon, modal, brl, todayISO } from './ui.js';
import { openProjectModal } from './components.js';
import { animateView } from './fx.js';
import { TOOL_LABEL, botAvatar, bindDictation, COMMANDS, MODE_LABEL } from './chatui.js';
import { renderSide, renderTop, renderDevices, renderBottom, refreshStatus, paintBadges, HUB_ROUTES, CITY_NAV, CITY_PLACES, HUB_NAV } from './chrome.js';
import { bindDevices } from './devices.js';

if (!auth.token) location.replace('/login');

// Menu: chave da rota, rótulo, ícone
export const NAV = [
  ['Principal', [['centro', 'System 2.0', 'globe'], ['dashboard', 'Meu hub', 'dashboard'], ['assistente', 'Assistente', 'bot'], ['rede', 'Rede', 'users'], ['tasks', 'Minhas tarefas', 'tasks'], ['financeiro', 'Financeiro', 'wallet'], ['estudos', 'Estudos', 'school'], ['livros', 'Livros', 'book']]],
  ['Sistema', [['automacoes', 'Automações', 'zap'], ['notifications', 'Notificações', 'bell'], ['achievements', 'Conquistas', 'trophy'], ['settings', 'Configurações', 'settings']]],
];
export const NAV_KEYS = NAV.flatMap(([, items]) => items.map(([k, l]) => [k, l]));

// Telas que saíram do menu continuam funcionando pelo endereço, pelos links e pela busca.
const VIEWS = {
  hoje: () => import('./views/hoje.js'), dashboard: () => import('./views/dashboard.js'), assistente: () => import('./views/assistant.js'),
  atividade: () => import('./views/atividade.js'), tasks: () => import('./views/tasks.js'), garagem: () => import('./views/garagem.js'),
  financeiro: () => import('./views/financeiro.js'), estudos: () => import('./views/estudos.js'), diario: () => import('./views/diario.js'),
  decisoes: () => import('./views/decisoes.js'), notifications: () => import('./views/notifications.js'), achievements: () => import('./views/achievements.js'),
  profile: () => import('./views/profile.js'), settings: () => import('./views/settings.js'), project: () => import('./views/project.js'),
  livros: () => import('./views/livros.js'), automacoes: () => import('./views/automacoes.js'),
  rede: () => import('./views/rede.js'), busca: () => import('./views/busca.js'),
  personagens: () => import('./views/personagens.js'), 'criar-mapa': () => import('./views/criar-mapa.js'), studio: () => import('./views/studio.js'), creditos: () => import('./views/creditos.js'), diagnostico: () => import('./views/diagnostico.js'), centro: () => import('./views/centro.js'), mapa: () => import('./views/mapa.js'), social: () => import('./views/social.js'), internet: () => import('./views/internet.js'),
  midia: () => import('./views/midia.js'), governo: () => import('./views/governo.js'), economia: () => import('./views/economia.js'), arquivo: () => import('./views/arquivo.js'),
  controle: () => import('./views/controle.js'), diversao: () => import('./views/diversao.js'),
  empresas: () => import('./views/economia.js'), banco: () => import('./views/banco.js'), mercado: () => import('./views/mercado.js'),
  inventario: () => import('./views/inventario.js'), policia: () => import('./views/policia.js'), justica: () => import('./views/justica.js'),
  organizacoes: () => import('./views/organizacoes.js'), acontecimentos: () => import('./views/acontecimentos.js'), cidade: () => import('./views/cidade.js'),
  hospital: () => import('./views/hospital.js'), empregos: () => import('./views/empregos.js'), propriedades: () => import('./views/propriedades.js'),
  veiculos: () => import('./views/veiculos.js'), vida: () => import('./views/vida.js'), construtora: () => import('./views/construtora.js'), locadora: () => import('./views/locadora.js'),
};
// atalhos da barra lateral que abrem telas existentes
const ALIAS = { loja: '#/mercado', chat: '#/assistente', inicio: '#/centro' };
// telas da Codeniac Digital Society: ocupam a tela inteira com a barra de navegação própria
const WORLD = new Set(['locadora', 'construtora', 'hospital', 'empregos', 'propriedades', 'veiculos', 'vida', 'centro', 'mapa', 'social', 'internet', 'midia', 'governo', 'empresas', 'arquivo', 'controle', 'diversao', 'banco', 'mercado', 'inventario', 'policia', 'justica', 'organizacoes', 'acontecimentos', 'cidade']);
const FULL_PAGE = new Set(['assistente', 'diario']);
// item do menu que fica aceso em cada tela
const NAV_OF = { locadora: 'centro', construtora: 'centro', empresas: 'centro', banco: 'centro', mercado: 'centro', inventario: 'centro', policia: 'centro', justica: 'centro', mapa: 'centro', organizacoes: 'centro', acontecimentos: 'centro', cidade: 'centro', social: 'centro', internet: 'centro', midia: 'centro', governo: 'centro', economia: 'centro', arquivo: 'centro', controle: 'centro', diversao: 'centro', busca: 'dashboard', garagem: 'financeiro', hoje: 'dashboard', atividade: 'dashboard', decisoes: 'dashboard', diario: 'dashboard', profile: 'settings' };

// ---------- Moldura: trilho de ícones, trilho direito, barra superior, barra do celular ----------
const currentRoute = () => (location.hash.slice(2).split('?')[0].split('/')[0]) || 'centro';
const navLabel = (k, l) => store.menu?.labels?.[k] || l;
const visibleNav = () => NAV.map(([g, items]) => [g, items.filter(([k]) => k === 'settings' || !(store.menu?.hidden || []).includes(k))]);
function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

function renderSidebar() {
  const cur = currentRoute();
  renderSide(cur);
  renderBottom(cur);
  const m = $('#bnMenu'); if (m) m.onclick = () => openSheet();
}
function renderRightRail() { renderDevices(); }

// Sair da conta (também cancela as notificações deste aparelho).
export async function logout() {
  const { confirmDialog } = await import('./ui.js');
  if (!(await confirmDialog('Sair da conta', 'Você vai voltar para a tela de login. Seus dados continuam salvos.', 'Sair'))) return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const sub = await reg?.pushManager?.getSubscription();
    if (sub) { await api.post('/push/unsubscribe', { endpoint: sub.endpoint }); await sub.unsubscribe(); }
  } catch { /* sem notificações */ }
  auth.clear();
  localStorage.removeItem('codeniac.conv');
  localStorage.removeItem('codeniac.panelConv');
  location.href = '/login';
}

// Menu completo (celular e tablet): telas, projetos e conta.
function openSheet() {
  closeSheet();
  const sheet = document.createElement('div');
  sheet.className = 'sheet-back cx-sheet';
  const it = ([k, l, ic, c]) => `<a class="sheet-item" href="#/${k}"><span style="--ic:${c}">${icon(ic, 20)}</span>${esc(l)}</a>`;
  sheet.innerHTML = `<div class="sheet" role="dialog" aria-label="Menu"><div class="sheet-grip"></div>
    <h6>Cidade</h6><div class="sheet-grid">${CITY_NAV.map(it).join('')}</div>
    <h6>Lugares da cidade</h6><div class="sheet-grid">${CITY_PLACES.map(it).join('')}</div>
    <h6>Meu hub (pessoal)</h6><div class="sheet-grid">${HUB_NAV.map(it).join('')}
      <button class="sheet-item" data-act="bot"><span>${botAvatar(30)}</span>${esc(store.settings.assistantName || 'Assistente')}</button></div>
    <div class="sheet-foot"><a class="btn sm outline" href="#/profile">${icon('user', 13)} Perfil</a><button class="btn sm outline" data-act="logout">${icon('logout', 13)} Sair</button></div></div>`;
  document.body.append(sheet);
  requestAnimationFrame(() => sheet.classList.add('open'));
  sheet.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (e.target === sheet || e.target.closest('a')) closeSheet();
    if (act === 'bot') { closeSheet(); toggleAssistant(); }
    if (act === 'logout') logout();
  });
}
function closeSheet() { document.querySelectorAll('.sheet-back').forEach((x) => x.remove()); }
function toggleAssistant() {
  if (store.settings.assistantEnabled === false) { location.hash = '#/settings/assistente'; return; }
  document.body.classList.toggle('assistant-open');
  if (document.body.classList.contains('assistant-open')) setTimeout(() => $('#msg')?.focus(), 250);
}

function renderTopbar() {
  renderTop({ onBell: toggleNotifDrop, onSearch: bindSearch });
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

// Ligação de um amigo da Rede: toca, e quem atende cai direto no modo ligação do chat.
function incomingCall(call) {
  document.querySelector('.w-call')?.remove();
  const p = call.persona;
  const box = document.createElement('div');
  box.className = 'w-call';
  box.innerHTML = `<div class="w-call-av">${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : `<span style="background:${esc(p.color || '#7c3aed')}">${esc((p.name || '?')[0])}</span>`}</div>
    <div><b>${esc(p.name)}</b><small>está ligando para você…</small></div>
    <button class="w-call-btn no" aria-label="Recusar">${icon('x', 18)}</button><button class="w-call-btn yes" aria-label="Atender">${icon('mic', 18)}</button>`;
  document.body.append(box);
  try { if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]); } catch { /* sem vibração */ }
  const ring = setInterval(() => { if (store.settings.notifySound !== false) beep(); }, 1800);
  const done = async (accept) => {
    clearInterval(ring); box.remove();
    try { await api.post(`/mundo/ligacoes/${call.id}`, { atender: accept }); } catch { /* ligação expirou */ }
    if (accept && call.conversationId) { localStorage.setItem('codeniac.conv', call.conversationId); localStorage.setItem('codeniac.autocall', call.conversationId); location.hash = '#/assistente'; }
  };
  box.querySelector('.yes').onclick = () => done(true);
  box.querySelector('.no').onclick = () => done(false);
  setTimeout(() => { if (document.body.contains(box)) { clearInterval(ring); box.remove(); } }, 65000);
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
  es.addEventListener('social', (e) => emit('social', JSON.parse(e.data)));
  es.addEventListener('world', (e) => { const ev = JSON.parse(e.data); emit('world', ev); if (ev.type === 'call') incomingCall(ev.call); });
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
  navigator.vibrate?.([30, 40, 30]);
  updateBadge();
}
function updateBadge() {
  const n = (store.chatUnread || 0) + (store.unread || 0);
  try { if (n) navigator.setAppBadge?.(n); else navigator.clearAppBadge?.(); } catch { /* sem suporte */ }
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
  // a 2.0 abre na cidade (Command Center); quem escolheu "Hoje" continua abrindo nele
  let name = parts[0] || (store.settings.homePage === 'hoje' ? 'hoje' : 'centro');
  if (name === 'economia') { location.replace(`#/${parts[1] === 'banco' ? 'banco' : ['empresas', ...parts.slice(1)].join('/')}`); return; }
  if (ALIAS[name] && !VIEWS[name]) { location.replace(ALIAS[name]); return; }
  if (!VIEWS[name]) name = 'centro';
  if (name === 'estudos' && parts[1] === 'livros') { location.replace('#/livros'); return; }
  if (parts[0] === 'capturar') { location.replace('#/dashboard'); setTimeout(() => openCapture(), 300); return; }
  if (store.menu?.hidden?.includes(name) && !['settings', 'profile', 'project', 'centro'].includes(name)) name = 'centro';
  document.body.classList.remove('sidebar-open', 'assistant-open', 'cx-side-open');
  closeSheet();
  document.body.classList.toggle('on-full-page', FULL_PAGE.has(name));
  document.body.classList.toggle('world-mode', WORLD.has(name));
  document.body.classList.toggle('hub-mode', HUB_ROUTES.has(name));
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
    if (seq === routeSeq) animateView(el);
  } catch (err) {
    console.error(err);
    if (seq === routeSeq) view.innerHTML = `<div class="empty-state"><b>Não foi possível abrir esta tela</b><p>${esc(err.message)}</p></div>`;
  }
  $('#view').scrollTop = 0;
  $('.content').scrollTop = 0;
  renderSidebar();
  refreshStatus();
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

// Sugestão de turno do InDrive e outros avisos rápidos em cartão.
function promptCard({ icon: ic = 'car', title, text, actions }) {
  document.querySelector('.prompt-card')?.remove();
  const el = document.createElement('div');
  el.className = 'prompt-card';
  el.innerHTML = `<span class="pc-ico">${icon(ic, 20)}</span><div class="pc-body"><b>${esc(title)}</b><p>${esc(text)}</p><div class="pc-acts">${actions.map((a, i) => `<button class="btn sm ${i === 0 ? 'primary' : 'outline'}" data-i="${i}">${esc(a.label)}</button>`).join('')}</div></div>`;
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  el.querySelectorAll('[data-i]').forEach((b) => { b.onclick = async () => { el.remove(); await actions[Number(b.dataset.i)].run?.(); }; });
}
async function checkShift() {
  try {
    const r = await api.get('/shifts/suggest');
    if (!r.suggest) return;
    promptCard({ title: 'Hora de rodar?', text: r.message, actions: [
      { label: 'Iniciar turno', run: async () => { await api.post('/shifts/start', {}); toast('Turno iniciado', 'Boa sorte nas corridas! 🚗', 'success'); emit('data-changed'); } },
      { label: 'Hoje não', run: () => api.post('/shifts/suggest/dismiss') },
    ] });
  } catch { /* ok */ }
}

// App no celular: registra o service worker (precisa de HTTPS ou do próprio PC).
async function registerSW() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'open' && e.data.url) location.href = e.data.url; });
  } catch (err) { console.warn('service worker', err); }
}

async function boot() {
  let me;
  try { me = await api.get('/auth/me'); } catch { return; }
  store.version = me.version;
  store.appName = me.system?.appName || 'Codeniac';
  store.images = me.system?.images || {};
  store.avatars = me.system?.avatars || store.avatars;
  store.menu = me.system?.menu || { hidden: [], labels: {} };
  document.title = store.appName;
  setUser(me.user);
  applySettings(me.settings);
  try { store.aiMode = (await api.get('/assistant/status')).mode; } catch { /* ok */ }
  await Promise.all([refreshProjects(), refreshUnread()]);
  try { store.chatUnread = (await api.get('/assistant/conversations')).reduce((a, c) => a + (c.unread || 0), 0); } catch { /* ok */ }
  renderSidebar(); renderTopbar(); renderDevices();
  renderAssistantPanel();
  bindDevices();
  refreshStatus(true);
  setInterval(() => refreshStatus(), 15000);
  $('#cxScrim').onclick = () => document.body.classList.remove('cx-side-open');
  on('projects', renderSidebar);
  on('user', () => { renderSidebar(); renderTopbar(); });
  on('unread', (n) => { const d = $('#bellDot'); if (d) { d.hidden = !n; d.textContent = n; } renderSidebar(); });
  on('system', (sys) => { store.images = sys.images || store.images; store.avatars = sys.avatars || store.avatars; store.menu = sys.menu || store.menu; store.appName = sys.appName || store.appName; renderSidebar(); });
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#q')?.focus(); }
    if (e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); openCapture(); }
  });
  $('.overlay').onclick = () => document.body.classList.remove('sidebar-open', 'assistant-open');
  on('world-changed', () => { refreshStatus(true); paintBadges(true); });
  setInterval(() => { const g = $('.greet span'); if (g) g.textContent = `${greeting()},`; }, 600000);
  bindVocab();
  connectStream();
  route();
  registerSW();
  setTimeout(checkShift, 2500);
  on('unread', updateBadge);
  updateBadge();
}
boot();
