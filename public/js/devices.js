// Dispositivos do jogador: celular (sistema em pixel com apps que abrem as telas reais),
// carteira (dinheiro, cartões, documentos, licenças, acessos) e relógio (hora, data, compromissos, avisos).
import { api } from './api.js';
import { icon } from './icons.js';
import { esc, timeAgo } from './ui.js';
import { store } from './store.js';

const nx = (v) => `${(Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} NXC`;
let open = null;

function close() { open?.remove(); open = null; document.body.classList.remove('cx-dev-open'); }
function frame(kind, html) {
  close();
  const el = document.createElement('div');
  el.className = `cx-devwrap cx-devwrap-${kind}`;
  el.innerHTML = `<div class="cx-devback"></div>${html}`;
  document.body.append(el);
  document.body.classList.add('cx-dev-open');
  requestAnimationFrame(() => el.classList.add('in'));
  el.querySelector('.cx-devback').onclick = close;
  el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  open = el;
  return el;
}
const loading = (kind) => frame(kind, `<div class="cx-devcard"><div class="skeleton" style="height:320px"></div></div>`);

export async function openPhone() {
  loading('phone');
  let d; try { d = await api.get('/mundo/dispositivos'); } catch (e) { close(); return; }
  const ph = d.phone;
  const now = new Date();
  const time = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (!ph) {
    const el = frame('phone', `<div class="cx-phone off" style="--sk:#475569"><button class="cx-x" data-close aria-label="Fechar">${icon('x', 16)}</button>
      <div class="cx-ph-screen"><div class="cx-ph-bar"><span>${time}</span><span>sem sinal</span></div>
        <div class="cx-ph-empty"><span class="cx-ph-big">${icon('phone', 40)}</span><b>Você ainda não tem celular</b><p>Compre um modelo na TechVision Store, na NovaTech Shop ou no Vitrine Digital. Ele vai para o inventário e você equipa por lá.</p>
        <div class="cx-ph-models">${d.models.map((m) => `<div class="cx-ph-model" style="--c:${esc(m.color)}"><b>${esc(m.name)}</b><small>${esc(m.tierLabel)} · ${m.apps} apps · ${m.camera} MP</small><em>~${nx(m.base)}</em></div>`).join('')}</div>
        <a class="cx-btn" href="#/mercado" data-close>${icon('cart', 15)} Ir às lojas</a></div></div></div>`);
    return el;
  }
  const el = frame('phone', `<div class="cx-phone ${ph.special ? 'special' : ''}" style="--sk:${esc(ph.skin)}"><button class="cx-x" data-close aria-label="Fechar">${icon('x', 16)}</button>
    <div class="cx-ph-screen">
      <div class="cx-ph-bar"><span>${time}</span><span class="cx-ph-sig"><i></i><i></i><i></i><i></i></span><span>${esc(ph.name)}</span></div>
      <div class="cx-ph-wall"><img src="/assets/pixel/skyline-wide.png" alt=""><div class="cx-ph-clock"><b>${time}</b><small>${now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</small></div></div>
      <div class="cx-ph-apps">${ph.apps.map((a) => `<button class="cx-app" data-route="${esc(a.route)}" style="--c:${esc(a.color)}"><span>${icon(a.icon, 22)}</span><small>${esc(a.label)}</small></button>`).join('')}
        ${ph.locked.map((a) => `<span class="cx-app locked" title="Disponível em modelos melhores" style="--c:#334155"><span>${icon('lock', 18)}</span><small>${esc(a.label)}</small></span>`).join('')}</div>
      <div class="cx-ph-foot"><small>${esc(ph.tierLabel)} · câmera ${ph.camera} MP · ${ph.storage >= 1024 ? `${ph.storage / 1024} TB` : `${ph.storage} GB`}</small></div>
      <div class="cx-ph-nav"><button data-close aria-label="Voltar">◁</button><button data-close aria-label="Início">○</button><button data-route="inventario" aria-label="Inventário">▢</button></div>
    </div></div>`);
  el.querySelectorAll('[data-route]').forEach((b) => {
    b.onclick = () => {
      const r = b.dataset.route;
      if (r === 'device:clock') return openClock();
      if (r === 'device:wallet') return openWallet();
      close(); location.hash = `#/${r}`;
    };
  });
  return el;
}

export async function openWallet() {
  loading('wallet');
  let d; try { d = await api.get('/mundo/dispositivos'); } catch { close(); return; }
  const wl = d.wallet;
  const sec = (t, items, ic) => `<h4>${icon(ic, 14)} ${t}</h4>${items.length ? `<div class="cx-wl-list">${items.map((x) => `<div class="cx-wl-card k-${esc(x.kind)}"><b>${esc(x.title)}</b><small>${esc(x.sub || '')}</small></div>`).join('')}</div>` : '<p class="cx-mut">Nada por aqui ainda.</p>'}`;
  frame('wallet', `<div class="cx-devcard cx-wallet"><button class="cx-x" data-close aria-label="Fechar">${icon('x', 16)}</button>
    <div class="cx-wl-head"><span class="cx-wl-ic">${icon('idcard', 22)}</span><div><small>Dinheiro em mãos</small><b>${nx(wl.cash)}</b></div><a class="cx-btn sm" href="#/banco" data-close>Sacar / depositar</a></div>
    ${sec('Cartões', wl.cards, 'wallet')}${sec('Documentos', wl.docs, 'idcard')}${sec('Licenças e diplomas', wl.licenses, 'school')}${sec('Cartões de acesso', wl.access, 'lock')}</div>`);
}

export async function openClock() {
  loading('clock');
  let d; let n = { items: [] };
  try { [d, n] = await Promise.all([api.get('/mundo/dispositivos'), api.get('/notifications').catch(() => ({ items: [] }))]); } catch { close(); return; }
  const zones = [['Nexus City', 'America/Sao_Paulo'], ['Lisboa', 'Europe/Lisbon'], ['Nova York', 'America/New_York'], ['Tóquio', 'Asia/Tokyo']];
  const el = frame('clock', `<div class="cx-devcard cx-clockcard"><button class="cx-x" data-close aria-label="Fechar">${icon('x', 16)}</button>
    <div class="cx-ck-face"><b id="ckBig">--:--:--</b><small>${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</small></div>
    <div class="cx-ck-zones">${zones.map(([l, z]) => `<div><small>${l}</small><b data-tz="${z}">--:--</b></div>`).join('')}</div>
    <h4>${icon('calendar', 14)} Compromissos</h4>
    ${d.clock.appointments.length ? `<div class="cx-ck-list">${d.clock.appointments.map((a) => `<a class="cx-ck-ap" href="#/social" data-close><b>${esc(a.title)}</b><small>${new Date(a.at).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })} · ${esc(a.place?.name || a.place || '')}${a.user === 'pendente' ? ' · aguardando resposta' : ''}</small></a>`).join('')}</div>` : '<p class="cx-mut">Nenhum compromisso marcado.</p>'}
    <h4>${icon('bell', 14)} Avisos</h4>
    <div class="cx-ck-list">${(n.items || []).slice(0, 5).map((x) => `<a class="cx-ck-ap" href="${esc(x.link || '#/notifications')}" data-close><b>${esc(x.title)}</b><small>${esc(timeAgo(x.createdAt))}</small></a>`).join('') || '<p class="cx-mut">Tudo em dia.</p>'}</div></div>`);
  const paint = () => {
    const big = el.querySelector('#ckBig'); if (!big) return clearInterval(t);
    big.textContent = new Date().toLocaleTimeString('pt-BR');
    el.querySelectorAll('[data-tz]').forEach((b) => { b.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: b.dataset.tz }); });
  };
  const t = setInterval(paint, 1000); paint();
}

export function bindDevices() {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-dev]');
    if (!b) return;
    e.preventDefault();
    ({ phone: openPhone, wallet: openWallet, clock: openClock })[b.dataset.dev]?.();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) close(); });
  window.addEventListener('hashchange', close);
}
export { store };
