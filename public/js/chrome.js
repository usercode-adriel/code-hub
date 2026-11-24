// Moldura do Codeniac Society: barra lateral fixa, topo (avatar pixel, nível, busca, saldo, Nexus, avisos),
// trilho de dispositivos (celular, carteira, relógio) e barra inferior no celular. Vale para TODAS as telas:
// a cidade é o principal; o hub pessoal só aparece quando você entra pelo seu perfil.
import { api } from './api.js';
import { store } from './store.js';
import { icon } from './icons.js';
import { esc, initials } from './ui.js';

// barra lateral única (ordem pedida). "Sair" é um botão e aparece no fim, abaixo destes itens.
export const CITY_NAV = [
  ['centro', 'Início', 'home', '#8b7bff'], ['gamecode', 'Gamecode', 'code', '#38bdf8'], ['estudio', 'Estúdio', 'film', '#f472b6'],
  ['news', 'News', 'news', '#fb7185'], ['dashboard', 'Meu hub', 'dashboard', '#a78bfa'], ['assistente', 'Chat', 'chat', '#22d3ee'],
  ['settings', 'Configurações', 'settings', '#94a3b8'],
];
// as telas do hub pessoal (tarefas, finanças, livros...) continuam existindo e acendem "Meu hub"
export const HUB_ROUTES = new Set(['dashboard', 'hoje', 'atividade', 'tasks', 'financeiro', 'garagem', 'estudos', 'livros', 'diario', 'decisoes', 'automacoes', 'rede', 'notifications', 'achievements', 'project', 'busca']);
// telas que acendem outro item do menu
const LIT = { profile: 'settings', diagnostico: 'settings', creditos: 'settings' };

const pxOf = (seed) => { let h = 0; for (const c of String(seed || 'eu')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `/assets/px/p${String(h % 123).padStart(3, '0')}.png`; };
export const myAvatar = () => store.user?.avatar || pxOf(store.user?.id || store.user?.name);
export const status = { data: null, at: 0 };
// relógio da cidade: um dia em Nexus City dura 40 minutos reais (o servidor manda a mesma âncora e velocidade)
const CLK = { speed: 36, anchor: Date.UTC(2026, 10, 1, 3, 0, 0), base: null };
const TZ = -3 * 3600000; const dayIdx = (g) => Math.floor((g + TZ) / 86400000);
export function cityNow() {
  const g = CLK.anchor + (Date.now() - CLK.anchor) * CLK.speed;
  const d = new Date(g + TZ); const h = d.getUTCHours(); const m = d.getUTCMinutes();
  const day = CLK.base ? CLK.base.day + dayIdx(g) - dayIdx(CLK.base.game) : null;
  return { game: g, hh: String(h).padStart(2, '0'), mm: String(m).padStart(2, '0'), hour: h + m / 60, night: h >= 19 || h < 6, day,
    weekday: d.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'UTC' }), text: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` };
}
export function setCityClock(c) { if (c?.speed) { CLK.speed = c.speed; CLK.anchor = c.anchor; CLK.base = { day: c.day, game: c.game }; } }
const fmt = (v) => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });

export function renderSide(cur) {
  const lit = LIT[cur] || (HUB_ROUTES.has(cur) ? 'dashboard' : cur);
  const item = ([k, l, ic, c]) => `<a href="#/${k}" class="cx-nav-i ${k === lit ? 'on' : ''}" style="--ic:${c}">${icon(ic, 19)}<span>${esc(l)}</span><i class="cx-badge" data-badge="${k}"></i></a>`;
  document.getElementById('cxSide').innerHTML = `
    <a class="cx-logo" href="#/centro" aria-label="Codeniac — início">
      <img src="/assets/pixel/skyline.png" alt="" class="cx-logo-art"><b>CODENIAC</b><small>SOCIETY</small></a>
    <nav class="cx-nav" aria-label="Menu">
      ${CITY_NAV.map(item).join('')}
      <button type="button" class="cx-nav-i cx-sair" data-act="logout" style="--ic:#f87171">${icon('logout', 19)}<span>Sair</span></button>
    </nav>`;
  paintBadges();
}

export function renderTop({ onBell, onSearch } = {}) {
  const u = store.user || {};
  const s = status.data?.me || {};
  document.getElementById('cxTop').innerHTML = `
    <button class="cx-burger" id="cxBurger" aria-label="Menu">${icon('menu', 20)}</button>
    <a class="cx-me" href="#/profile" title="Meu perfil e hub pessoal">
      <img class="cx-px" src="${esc(myAvatar())}" alt="">
      <span class="cx-me-tx"><b>${esc(u.name || 'Você')}</b><small><em class="cx-lvl" id="cxLvl">Nv ${s.level || 1}</em><i class="cx-xp"><i id="cxXp" style="width:${xpPct(s)}%"></i></i></small></span></a>
    <div class="cx-search" id="search">${icon('search', 16)}<input id="q" placeholder="Buscar na cidade..." autocomplete="off" aria-label="Buscar"><div class="search-results" id="results"></div></div>
    <div class="cx-top-r">
      <a class="cx-pill" href="#/banco" title="Saldo na conta Nexus"><span class="cx-coin">${icon('wallet', 14)}</span><b id="cxBal">${s.balance != null ? fmt(s.balance) : '—'}</b><small>NXC</small></a>
      <a class="cx-pill cx-nexus" href="#/banco" title="Banco Nexus">${icon('gem', 15)}<b>Nexus</b></a>
      <div class="rel"><button class="cx-ic" id="bell" aria-label="Notificações">${icon('bell', 18)}<span class="cx-dotn" id="bellDot" ${store.unread ? '' : 'hidden'}>${store.unread || ''}</span></button><div class="dropdown" id="notifDrop"></div></div>
      <a class="cx-ic" href="#/settings" aria-label="Configurações">${icon('settings', 18)}</a>
    </div>`;
  document.getElementById('cxBurger').onclick = () => document.body.classList.toggle('cx-side-open');
  document.getElementById('bell').onclick = onBell;
  onSearch?.();
}
const xpPct = (s) => { if (!s?.level) return 0; const lo = 40 * (s.level - 1) ** 2; const hi = 40 * s.level ** 2; return Math.max(4, Math.min(100, Math.round(((s.xp - lo) / (hi - lo || 1)) * 100))); };

export function renderDevices() {
  const d = status.data?.devices || {};
  const ph = d.phone;
  document.getElementById('cxDev').innerHTML = `
    <button class="cx-dev-b" data-dev="phone" title="${ph ? esc(ph.name) : 'Sem celular'}" style="--sk:${esc(ph?.skin || '#475569')}">
      <span class="cx-dev-phone ${ph ? '' : 'off'}"><i></i></span><small>${ph ? esc(ph.name.split(' ')[0]) : 'Celular'}</small></button>
    <button class="cx-dev-b" data-dev="wallet" title="Carteira"><span class="cx-dev-ic">${icon('idcard', 20)}</span><small id="cxCash">${d.cash != null ? fmt(d.cash) : 'Carteira'}</small></button>
    <button class="cx-dev-b" data-dev="clock" title="Relógio"><span class="cx-dev-clock" id="cxClock">--:--</span><small id="cxDay">${cityNow().day ? `Dia ${cityNow().day}` : 'Cidade'}</small></button>`;
  tickClock();
}
function tickClock() { const c = document.getElementById('cxClock'); if (c) { const k = cityNow(); c.textContent = k.text; c.title = `Hora em Nexus City${k.day ? ` · Dia ${k.day}` : ''} (1 dia = 40 min)`; c.classList.toggle('night', k.night); } const dd = document.getElementById('cxDay'); if (dd && cityNow().day) dd.textContent = `Dia ${cityNow().day}`; }
setInterval(tickClock, 1500);

export function renderBottom(cur) {
  const lit = LIT[cur] || (HUB_ROUTES.has(cur) ? 'dashboard' : cur);
  const b = (k, l, ic) => `<a class="cx-bn ${lit === k ? 'on' : ''}" href="#/${k}">${icon(ic, 21)}<span>${l}</span></a>`;
  document.getElementById('bottomNav').innerHTML = `${b('centro', 'Início', 'home')}${b('gamecode', 'Gamecode', 'code')}
    ${b('news', 'News', 'news')}${b('assistente', 'Chat', 'chat')}<button class="cx-bn" id="bnMenu">${icon('menu', 21)}<span>Mais</span></button>`;
}

// dados vivos da moldura (saldo, nível, população na rua, celular equipado)
export async function refreshStatus(force = false) {
  if (!force && status.data && Date.now() - status.at < 12000) return status.data;
  try {
    status.data = await api.get('/mundo/status'); status.at = Date.now();
    setCityClock(status.data.clock);
    const s = status.data.me || {};
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    if (s.balance != null) set('cxBal', fmt(s.balance));
    set('cxLvl', `Nv ${s.level || 1}`);
    const xp = document.getElementById('cxXp'); if (xp) xp.style.width = `${xpPct(s)}%`;
    if (status.data.born) set('cxOnline', `${status.data.online} de ${status.data.population} na rua agora`);
    renderDevices();
  } catch { /* offline */ }
  return status.data;
}

let badgeAt = 0; let badges = null;
export async function paintBadges(force = false) {
  try {
    if (force || !badges || Date.now() - badgeAt > 20000) { badges = (await api.get('/mundo/badges')).badges || {}; badgeAt = Date.now(); }
    for (const el of document.querySelectorAll('.cx-badge')) {
      const n = badges[el.dataset.badge] || 0;
      el.textContent = n > 0 ? (n > 99 ? '99+' : String(n)) : '';
      el.classList.toggle('on', n > 0);
    }
  } catch { /* sem badges */ }
}
export { initials };
