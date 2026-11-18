// Peças visuais do System 2.0 (Codeniac Society): navegação dos ambientes, avatares, gráficos,
// linha do tempo, mapa da cidade, horizonte animado e fichas de pessoa/empresa.
import { api } from '../api.js';
import { icon } from '../icons.js';
import { esc, timeAgo, toast, modal, initials, confirmDialog } from '../ui.js';
import { store } from '../store.js';
// fecha o menu "Mais" ao tocar fora (um único ouvinte para o app todo)
document.addEventListener('click', (e) => { for (const d of document.querySelectorAll('.wx-more[open]')) if (!d.contains(e.target)) d.open = false; }, true);

// navegação principal (como na referência) e o menu "Mais"
export const ENVS = [
  ['centro', 'Início', 'dashboard'], ['social', 'Social', 'users'], ['internet', 'Internet', 'globe'], ['mercado', 'Mercado', 'bag'],
  ['empresas', 'Empresas', 'briefcase'], ['banco', 'Banco', 'wallet'], ['policia', 'Polícia', 'shield'], ['justica', 'Justiça', 'scale'], ['inventario', 'Inventário', 'layers'], ['midia', 'Notícias', 'news'],
];
export const MORE = [['organizacoes', 'Organizações', 'briefcase'], ['acontecimentos', 'Acontecimentos', 'zap'], ['cidade', 'Desenvolvimento', 'pin'], ['governo', 'Governo', 'flag'], ['arquivo', 'Arquivo', 'book'], ['controle', 'Controle da IA', 'cpu'], ['diversao', 'Diversão', 'play'], ['settings', 'Configurações', 'settings'], ['dashboard', 'Meu hub pessoal', 'dashboard']];
const ENV_OF = { economia: 'empresas', rede: 'social', busca: 'internet' };
export const CAT_ICON = { politica: 'scale', economia: 'trending', tecnologia: 'cpu', entretenimento: 'play', esportes: 'trophy', seguranca: 'shield', ciencia: 'sparkles', celebridades: 'star', sociedade: 'users', local: 'pin', pessoal: 'heart' };
export const CAT_LABEL = { politica: 'Política', economia: 'Economia', tecnologia: 'Tecnologia', entretenimento: 'Entretenimento', esportes: 'Esportes', seguranca: 'Segurança', ciencia: 'Ciência', celebridades: 'Celebridades', sociedade: 'Sociedade', local: 'Local', pessoal: 'Vida pessoal' };
export const CAT_COLOR = { politica: '#f59e0b', economia: '#22c55e', tecnologia: '#06b6d4', entretenimento: '#a855f7', esportes: '#84cc16', seguranca: '#ef4444', ciencia: '#6366f1', celebridades: '#ec4899', sociedade: '#3b82f6', local: '#14b8a6', pessoal: '#f472b6' };

export const nx = (v, d = 2) => `${(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })} NXC`;
export const num = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1).replace('.0', '')} mi` : v >= 1e3 ? `${(v / 1e3).toFixed(1).replace('.0', '')} mil` : String(Math.round(v || 0)));
export const pct = (v) => `${v > 0 ? '+' : ''}${(Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;

// moldura de cada ambiente: barra de navegação + área do conteúdo
export function shell(el, env, { title = '', sub = '' } = {}) {
  const cur = ENV_OF[env] || env;
  const user = store.user || {};
  el.innerHTML = `<div class="w-env" data-env="${env}">
    <header class="wx-top">
      <a class="wx-brand" href="#/centro" aria-label="Codeniac Digital Society"><span class="wx-logo">${icon('globe', 20)}</span><span class="wx-name"><b>Codeniac</b><small>Digital Society</small></span></a>
      <nav class="w-nav wx-nav" aria-label="Ambientes do System 2.0">${ENVS.map(([k, l, ic]) => `<a href="#/${k}" class="${k === cur ? 'on' : ''}">${icon(ic, 14)}<span>${l}</span><i class="wx-badge" data-badge="${k}"></i></a>`).join('')}
        <details class="wx-more ${MORE.some(([k]) => k === cur) ? 'on' : ''}"><summary>${icon('more', 14)}<span>Mais</span></summary><div class="wx-more-menu">${MORE.map(([k, l, ic]) => `<a href="#/${k}">${icon(ic, 14)} ${l}</a>`).join('')}</div></details></nav>
      <div class="wx-right"><a class="wx-ic" href="#/notifications" aria-label="Notificações">${icon('bell', 17)}</a><span class="wx-online"><i></i>Online</span>
        <a class="wx-me" href="#/profile" aria-label="Meu perfil">${user.avatar ? `<img src="${esc(user.avatar)}" alt="">` : `<span>${esc(initials(user.name || 'Eu'))}</span>`}</a></div>
    </header>
    ${title ? `<header class="w-head"><div><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="w-head-acts" id="wActs"></div></header>` : ''}
    <div class="w-body" id="wBody"></div></div>`;
  el.querySelector('.wx-nav .on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  paintBadges(el);
  return el.querySelector('#wBody');
}
// badges do menu: sempre há um marcador em cada aba (número quando há pendências, ponto quando não).
let badgeCache = null; let badgeAt = 0;
async function paintBadges(root) {
  try {
    if (!badgeCache || Date.now() - badgeAt > 20000) { badgeCache = (await api.get('/mundo/badges')).badges || {}; badgeAt = Date.now(); }
    for (const el of root.querySelectorAll('.wx-badge')) {
      const n = badgeCache[el.dataset.badge] || 0;
      el.textContent = n > 0 ? (n > 99 ? '99+' : String(n)) : '';
      el.classList.toggle('on', n > 0);
      el.classList.toggle('dot', n === 0);
    }
  } catch { /* sem badges */ }
}
export const refreshBadges = () => { badgeCache = null; };
// identificador único de operação: o servidor nunca processa a mesma operação duas vezes
export const opId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
// senha bancária de 4 dígitos com teclado numérico (a senha só vai ao servidor, nunca fica salva no navegador)
export function askPin(title = 'Senha bancária', hint = 'Digite sua senha de 4 dígitos') {
  return new Promise((resolve) => {
    let pin = ''; let done = false;
    modal({
      title,
      body: `<div class="pin-pad"><p class="muted">${esc(hint)}</p><div class="pin-dots">${'<i></i>'.repeat(4)}</div>
        <div class="pin-keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 'x', 0, 'ok'].map((k) => `<button type="button" data-k="${k}" ${k === 'ok' ? 'class="ok" disabled' : ''}>${k === 'x' ? '⌫' : k === 'ok' ? '✓' : k}</button>`).join('')}</div></div>`,
      onMount: (m, closeFn) => {
        const dots = [...m.querySelectorAll('.pin-dots i')]; const ok = m.querySelector('[data-k="ok"]');
        const paint = () => { dots.forEach((d, i) => d.classList.toggle('on', i < pin.length)); ok.disabled = pin.length !== 4; };
        const press = (k) => { if (k === 'x') pin = pin.slice(0, -1); else if (k === 'ok') { if (pin.length === 4) { done = true; closeFn(); resolve(pin); } } else if (pin.length < 4) pin += k; paint(); };
        m.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => press(b.dataset.k); });
        m.addEventListener('keydown', (e) => { if (/^\d$/.test(e.key)) press(e.key); if (e.key === 'Backspace') press('x'); if (e.key === 'Enter') press('ok'); });
        new MutationObserver((_, obs) => { if (!document.body.contains(m)) { obs.disconnect(); if (!done) resolve(null); } }).observe(document.body, { childList: true });
      },
    });
  });
}
// executa uma operação que pede senha; se não houver senha criada, cria primeiro
export async function withPin(fn, title) {
  for (;;) {
    const pin = await askPin(title);
    if (!pin) return null;
    try { return await fn(pin); } catch (err) {
      if (/bloqueada/i.test(err.message)) throw err;
      if (/senha incorreta/i.test(err.message)) { toast('Senha incorreta', err.message, 'error'); continue; }
      if (/crie sua senha/i.test(err.message)) { await createPin(); continue; }
      throw err;
    }
  }
}
export async function createPin() {
  const a = await askPin('Crie sua senha bancária', 'Escolha 4 números. Ela protege compras, transferências, saques e empréstimos.');
  if (!a) return false;
  const b = await askPin('Confirme a senha', 'Digite os mesmos 4 números');
  if (a !== b) { toast('As senhas não conferem', 'Tente de novo.', 'error'); return false; }
  try { await api.post('/mundo/banco/senha', { pin: a }); toast('Senha criada 🔒', 'Guardamos só uma versão criptografada dela.', 'success'); return true; } catch (err) { toast('Não deu', err.message, 'error'); return false; }
}
export function nascendo(body, retry) {
  body.innerHTML = `<div class="w-born"><div class="w-born-orb"></div><h2>A cidade está nascendo…</h2><p>As primeiras pessoas estão chegando, abrindo empresas e formando partidos. Isso leva alguns segundos.</p></div>`;
  const t = setTimeout(retry, 4000);
  return () => clearTimeout(t);
}

export function face(p, size = 36, cls = '') {
  if (!p) return '';
  if (p.me || p.id === 'me') return `<span class="w-face me ${cls}" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.36)}px">EU</span>`;
  const st = `width:${size}px;height:${size}px;--c:${esc(p.color || '#7c3aed')}`;
  return p.avatar ? `<img class="w-face ${cls}" src="${esc(p.avatar)}" alt="" style="${st}" loading="lazy">` : `<span class="w-face ini ${cls}" style="${st};font-size:${Math.round(size * 0.38)}px">${esc(initials(p.name || '?'))}</span>`;
}
export const who = (p) => (p ? (p.me || p.id === 'me' ? '<b>Você</b>' : `<a class="w-link" data-person="${esc(p.id)}">${esc(p.name)}</a>`) : '');

export function spark(values, { w = 160, h = 44, color = 'var(--wa)', fill = true } = {}) {
  const v = (values || []).filter((x) => Number.isFinite(x));
  if (v.length < 2) return `<svg class="w-spark" viewBox="0 0 ${w} ${h}"></svg>`;
  const min = Math.min(...v); const max = Math.max(...v); const span = max - min || 1;
  const pts = v.map((x, i) => [(i / (v.length - 1)) * w, h - 3 - ((x - min) / span) * (h - 6)]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  return `<svg class="w-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">${fill ? `<path d="${d}L${w},${h}L0,${h}Z" fill="${color}" opacity=".14"/>` : ''}<path d="${d}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

export function evRow(e, { compact = false } = {}) {
  const c = CAT_COLOR[e.cat] || '#64748b';
  return `<div class="w-ev ${compact ? 'compact' : ''}" data-ev="${esc(e.id)}"><span class="w-ev-ic" style="--c:${c}">${icon(CAT_ICON[e.cat] || 'bell', 14)}</span>
    <div class="w-ev-tx"><b>${esc(e.title)}</b>${!compact && e.text ? `<p>${esc(e.text)}</p>` : ''}
      <small>${esc(e.catLabel || e.cat)} · ${esc(timeAgo(e.at))}${e.origin === 'recuperado' ? ' · enquanto você estava fora' : e.origin === 'genese' ? ' · gênese' : ''}${'★'.repeat(Math.max(0, e.importance - 2))}</small></div>
    ${!compact && e.actors?.length ? `<span class="w-ev-faces">${e.actors.slice(0, 3).map((a) => `<span data-person="${esc(a.id)}">${face(a, 24)}</span>`).join('')}</span>` : ''}</div>`;
}

// clique em pessoa/empresa em qualquer lugar do ambiente abre a ficha
export function bindEntities(root) {
  root.addEventListener('click', (e) => {
    const p = e.target.closest('[data-person]');
    if (p && p.dataset.person && p.dataset.person !== 'me') { e.preventDefault(); personCard(p.dataset.person); return; }
    const c = e.target.closest('[data-company]');
    if (c) { e.preventDefault(); companyCard(c.dataset.company); }
  });
}

// ---------------------------------------------------------------- mapa
export function mapSvg(m, { mini = false } = {}) {
  const poly = (pts) => pts.map((p) => p.join(',')).join(' ');
  const center = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
  return `<svg class="w-map ${mini ? 'mini' : ''}" viewBox="0 0 1000 600" role="img" aria-label="Mapa de Codeniac Society">
    <defs><pattern id="wgrid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="rgba(120,160,255,.08)"/></pattern>
      <filter id="wglow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <rect width="1000" height="600" fill="url(#wgrid)"/>
    <path d="M0,470 C180,440 260,500 420,470 S700,420 1000,470" stroke="rgba(56,189,248,.35)" stroke-width="22" fill="none"/>
    ${m.districts.map((d) => `<g class="w-dist ${d.locked ? 'locked' : ''}" data-district="${esc(d.id)}"><polygon points="${poly(d.poly)}" style="--c:${esc(d.color)}"/>
      ${mini ? '' : `<text x="${center(d.poly)[0]}" y="${center(d.poly)[1]}" text-anchor="middle">${esc(d.name)}${d.locked ? ' 🔒' : ''}</text>`}</g>`).join('')}
    ${(m.places || []).map((p) => `<circle class="w-place" cx="${p.x}" cy="${p.y}" r="4" data-place="${esc(p.id)}"><title>${esc(p.name)}</title></circle>`).join('')}
    ${(m.companies || []).map((c) => `<g class="w-mk" data-company="${esc(c.id)}" transform="translate(${c.x},${c.y})"><circle r="${mini ? 9 : 8}" style="--c:${esc(c.color)}" filter="url(#wglow)"/><title>${esc(c.name)}${c.status === 'crise' ? ' (em crise)' : ''}</title></g>`).join('')}
    ${(m.events || []).map((e) => `<g class="w-mk ev" transform="translate(${e.x},${e.y})"><circle r="7"/><title>${esc(e.title)}</title></g>`).join('')}
    ${(m.incidents || []).map((e) => `<g class="w-mk alert" transform="translate(${e.x},${e.y})"><circle r="${mini ? 10 : 9}"/><text y="4" text-anchor="middle">!</text><title>${esc(e.title)}</title></g>`).join('')}
  </svg>`;
}

// ---------------------------------------------------------------- horizonte da cidade (gerado, sem imagem externa)
export function skyline(hour = new Date().getHours()) {
  const night = hour >= 19 || hour < 6; const dusk = hour >= 17 && hour < 19;
  let seed = 7;
  const r = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const layer = (n, base, hMin, hMax, color, lit) => {
    let x = -20; let out = '';
    for (let i = 0; i < n && x < 1220; i++) {
      const w = 30 + r() * 70; const h = hMin + r() * (hMax - hMin);
      out += `<rect x="${x.toFixed(0)}" y="${(base - h).toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="${color}"/>`;
      if (lit) for (let wy = base - h + 10; wy < base - 8; wy += 14) for (let wx = x + 6; wx < x + w - 6; wx += 11) if (r() > (night ? 0.55 : 0.85)) out += `<rect class="w-win ${r() > 0.9 ? 'blink' : ''}" x="${wx.toFixed(0)}" y="${wy.toFixed(0)}" width="5" height="7" fill="${r() > 0.5 ? '#38bdf8' : r() > 0.5 ? '#f472b6' : '#fde68a'}"/>`;
      if (r() > 0.82) out += `<rect x="${(x + w / 2 - 1).toFixed(0)}" y="${(base - h - 26).toFixed(0)}" width="2" height="26" fill="${color}"/><circle class="w-win blink" cx="${(x + w / 2).toFixed(0)}" cy="${(base - h - 27).toFixed(0)}" r="2" fill="#ef4444"/>`;
      x += w + 4 + r() * 8;
    }
    return out;
  };
  const sky = night ? ['#050816', '#140b34', '#2a1050'] : dusk ? ['#1e1b4b', '#7c2d92', '#f97316'] : ['#0b2a5c', '#3b4fa8', '#7aa7e8'];
  return `<svg class="w-sky" viewBox="0 0 1200 420" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs><linearGradient id="wsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset=".6" stop-color="${sky[1]}"/><stop offset="1" stop-color="${sky[2]}"/></linearGradient>
      <linearGradient id="wwater" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1e1b4b" stop-opacity=".9"/><stop offset="1" stop-color="#020617"/></linearGradient>
      <radialGradient id="wholo" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#22d3ee" stop-opacity=".55"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/></radialGradient></defs>
    <rect width="1200" height="420" fill="url(#wsky)"/>
    ${night ? Array.from({ length: 60 }, () => `<circle cx="${(r() * 1200).toFixed(0)}" cy="${(r() * 180).toFixed(0)}" r="${(r() * 1.3 + 0.3).toFixed(1)}" fill="#fff" opacity="${(0.3 + r() * 0.6).toFixed(2)}"/>`).join('') : `<circle cx="980" cy="90" r="38" fill="${dusk ? '#fdba74' : '#fef3c7'}" opacity=".9"/>`}
    <g opacity=".55">${layer(30, 330, 60, 170, night ? '#1e1b4b' : '#4c5fa8', false)}</g>
    <g>${layer(26, 345, 80, 230, night ? '#0f0a2a' : '#26306b', true)}</g>
    <ellipse cx="600" cy="150" rx="90" ry="120" fill="url(#wholo)"/>
    <g class="w-blimp"><ellipse cx="0" cy="0" rx="70" ry="18" fill="#0f172a" stroke="#22d3ee" stroke-width="1.5"/><text x="0" y="5" text-anchor="middle" fill="#22d3ee" font-size="13" font-weight="700" font-family="Poppins, sans-serif">SYSTEM 2.0</text></g>
    <g>${layer(22, 360, 40, 120, night ? '#070514' : '#141a46', true)}</g>
    <rect y="360" width="1200" height="60" fill="url(#wwater)"/>
    <g opacity=".25">${Array.from({ length: 40 }, () => `<rect x="${(r() * 1200).toFixed(0)}" y="${(366 + r() * 50).toFixed(0)}" width="${(10 + r() * 40).toFixed(0)}" height="2" fill="${r() > 0.5 ? '#38bdf8' : '#f472b6'}"/>`).join('')}</g>
  </svg>`;
}

// ---------------------------------------------------------------- ficha de pessoa
const NEED = { social: 'Social', fun: 'Diversão', energy: 'Energia', money: 'Dinheiro' };
const TRAIT = { ambition: 'Ambição', sociability: 'Sociabilidade', honesty: 'Honestidade', gossip: 'Fofoca', volatility: 'Pavio curto', curiosity: 'Curiosidade' };
export async function personCard(id) {
  let p;
  try { p = await api.get(`/mundo/pessoa/${encodeURIComponent(id)}`); } catch (err) { toast('Ficha indisponível', err.message, 'error'); return; }
  const bar = (v, c = 'var(--wa)') => `<i class="w-bar"><i style="width:${Math.max(0, Math.min(100, v))}%;background:${c}"></i></i>`;
  modal({
    title: p.name, wide: true,
    body: `<div class="w-card-person"><div class="w-cp-top" style="--c:${esc(p.color)}">${face(p, 84)}<div><h3>${esc(p.name)}</h3><small>@${esc(p.handle)} · ${p.age} anos · ${esc(p.job || '')}</small>
        <div class="w-chips"><span class="w-chip">${esc(p.city || '')}</span>${p.status !== 'ativo' ? `<span class="w-chip warn">${esc(p.status)}</span>` : ''}<span class="w-chip rel-${esc(p.relation.type)}">${esc(p.relation.label)}</span><span class="w-chip">${p.mood?.emoji || ''} ${esc(p.mood?.emotion || '')}</span></div></div></div>
      <div class="w-cp-acts">${p.friend ? `<button class="btn sm primary" data-chat>${icon('send', 12)} Conversar</button>` : `<button class="btn sm primary" data-add>${icon('plus', 12)} Adicionar amizade</button>`}
        <button class="btn sm outline" data-pix>${icon('wallet', 12)} Enviar NXC</button><a class="btn sm outline" href="#/arquivo/persona/${esc(p.id)}" data-close>${icon('book', 12)} História completa</a></div>
      <div class="w-cp-grid">
        <section><h5>O que sente por você</h5><div class="w-kv"><span>Afeto</span>${bar((p.relation.aff + 100) / 2, p.relation.aff >= 0 ? '#22c55e' : '#ef4444')}<b>${p.relation.aff}</b></div><div class="w-kv"><span>Confiança</span>${bar(p.relation.trust, '#38bdf8')}<b>${p.relation.trust}</b></div>
          ${p.notes?.length ? `<ul class="w-notes">${p.notes.slice(0, 5).map((n) => `<li>${esc(n.text)}</li>`).join('')}</ul>` : '<p class="muted">Ainda não lembra de nada específico sobre você.</p>'}</section>
        <section><h5>Momento de vida</h5><p>${esc(p.mood?.reason || 'Dia comum.')}</p>${p.problem ? `<p><b>Enfrentando:</b> ${esc(p.problem)}</p>` : ''}<p><b>Sonho:</b> ${esc(p.goal || '—')}</p>${p.company ? `<p><b>Trabalho:</b> <a class="w-link" data-company="${esc(p.company.id)}">${esc(p.company.name)}</a></p>` : ''}${p.district ? `<p><b>Bairro:</b> ${esc(p.district)}</p>` : ''}</section>
        <section><h5>Necessidades (agora)</h5>${Object.entries(p.needs || {}).map(([k, v]) => `<div class="w-kv"><span>${NEED[k]}</span>${bar(v)}<b>${Math.round(v)}</b></div>`).join('')}</section>
        <section><h5>Personalidade</h5>${Object.entries(p.traits || {}).map(([k, v]) => `<div class="w-kv"><span>${TRAIT[k]}</span>${bar(v * 100, '#a78bfa')}<b>${Math.round(v * 100)}</b></div>`).join('')}</section>
      </div>
      <h5>História</h5><p class="muted">${esc(p.story || '')}</p>
      ${p.relations?.length ? `<h5>Relações</h5><div class="w-rels">${p.relations.slice(0, 12).map((r) => `<button class="w-rel" data-person="${esc(r.id)}">${face(r, 26)}<span>${esc(r.name)}</span><small class="rel-${esc(r.type)}">${esc(r.label)}</small></button>`).join('')}</div>` : ''}
      <h5>Memórias recentes</h5><ul class="w-notes">${(p.lifeLog || []).slice(0, 8).map((l) => `<li><small class="muted">${esc(timeAgo(l.at))}</small> ${esc(l.text)}</li>`).join('')}</ul>
      ${p.events?.length ? `<h5>No arquivo da cidade</h5>${p.events.slice(0, 8).map((e) => evRow(e, { compact: true })).join('')}` : ''}</div>`,
    onMount: (m, close) => {
      m.querySelector('[data-add]')?.addEventListener('click', async () => { try { await api.post(`/rede/pessoas/${p.id}/amizade`); toast('Nova amizade!', `${p.name} agora está no seu chat.`, 'success'); close(); personCard(p.id); } catch (err) { toast('Erro', err.message, 'error'); } });
      m.querySelector('[data-chat]')?.addEventListener('click', async () => { const r = await api.post(`/rede/pessoas/${p.id}/amizade`); if (r.conversationId) localStorage.setItem('codeniac.conv', r.conversationId); close(); location.hash = '#/assistente'; });
      m.querySelector('[data-pix]').onclick = () => { close(); transferModal(p); };
      m.querySelectorAll('.w-rel').forEach((b) => { b.onclick = () => { close(); personCard(b.dataset.person); }; });
    },
  });
}
export function transferModal(p) {
  modal({
    title: `Enviar NXC para ${p.name}`,
    body: `<form class="form"><div class="field"><label>Valor (NXC)</label><input type="number" name="v" min="1" step="1" required value="100"></div><div class="field"><label>Motivo (opcional)</label><input name="m" maxlength="60" placeholder="Ex.: presente, ajuda, pagamento"></div>
      <p class="hint muted">Sai do seu saldo no Banco Nexus. A pessoa lembra do gesto.</p><div class="form-actions"><button type="button" class="btn outline" data-close>Cancelar</button><button class="btn primary">Enviar</button></div></form>`,
    onMount: (m, close) => { m.querySelector('form').onsubmit = async (e) => { e.preventDefault(); try { const r = await api.post('/mundo/banco/transferir', { personaId: p.id, valor: Number(e.target.v.value), motivo: e.target.m.value }); toast('Enviado', `Saldo: ${nx(r.balance)}`, 'success'); close(); } catch (err) { toast('Não deu', err.message, 'error'); } }; },
  });
}

// ---------------------------------------------------------------- ficha de empresa
export async function companyCard(id) {
  let c;
  try { c = await api.get(`/mundo/empresas/${encodeURIComponent(id)}`); } catch (err) { toast('Empresa indisponível', err.message, 'error'); return; }
  const prices = (c.priceHistory || []).map((x) => x.v);
  modal({
    title: c.name, wide: true,
    body: `<div class="w-card-co" style="--c:${esc(c.color)}"><div class="w-co-top"><span class="w-co-logo">${esc(c.name[0])}</span><div><h3>${esc(c.name)} <small class="w-tick">${esc(c.ticker)}</small></h3><small>${esc(c.sectorLabel)} · ${esc(c.domain)} · ${c.origin === 'genese' ? 'da gênese' : `fundada ${esc(timeAgo(c.foundedAt))}`}</small>
        <div class="w-chips"><span class="w-chip ${c.status === 'ativa' ? 'ok' : 'warn'}">${esc(c.status)}</span><span class="w-chip">${c.employees} funcionário(s)</span><span class="w-chip">Reputação ${c.reputation}</span>${c.ceo ? `<span class="w-chip">CEO: ${esc(c.ceo.name)}</span>` : ''}</div></div></div>
      ${c.status !== 'falida' ? `<div class="w-co-price"><div><small>Ação</small><b>${nx(c.price)}</b><em class="${c.change >= 0 ? 'up' : 'down'}">${pct(c.change)} 24h</em></div>${spark(prices, { w: 320, h: 70, color: c.change >= 0 ? '#22c55e' : '#ef4444' })}</div>
      <div class="w-co-trade"><input type="number" min="1" value="10" id="coQty" aria-label="Quantidade"><button class="btn sm primary" data-buy>Comprar</button><button class="btn sm outline" data-sell>Vender</button><small class="muted">${c.position?.shares ? `Você tem ${c.position.shares} ações (preço médio ${nx(c.position.avg)})` : 'Taxa de 0,5% por ordem'}</small></div>` : `<p class="w-closed">Empresa falida em ${new Date(c.closedAt).toLocaleDateString('pt-BR')}. Ações sem valor.</p>`}
      <div class="w-cp-grid"><section><h5>Números do último dia</h5><div class="w-kv"><span>Receita</span><b>${nx(c.revenueDay)}</b></div><div class="w-kv"><span>Lucro</span><b class="${c.profitDay >= 0 ? 'up' : 'down'}">${nx(c.profitDay)}</b></div><div class="w-kv"><span>Caixa</span><b>${nx(c.cash, 0)}</b></div><div class="w-kv"><span>Marketing/dia</span><b>${nx(c.marketing, 0)}</b></div>${spark(c.profitHistory || [], { w: 260, h: 40, color: '#38bdf8' })}</section>
        <section><h5>Equipe</h5><div class="w-rels">${(c.staff || []).slice(0, 12).map((s) => `<button class="w-rel" ${s.id !== 'me' ? `data-person="${esc(s.id)}"` : ''}>${face(s, 26)}<span>${esc(s.name)}</span><small>${esc(s.role)}</small></button>`).join('')}</div></section></div>
      ${c.products?.length ? `<h5>Produtos</h5><div class="w-chips">${c.products.map((p) => `<span class="w-chip">${esc(p.name)} · ${nx(p.price)}</span>`).join('')}</div>` : ''}
      ${c.openingList?.length ? `<h5>Vagas abertas</h5>${c.openingList.map((o) => `<div class="w-row"><span>${esc(o.role)} · ${nx(o.salary, 0)}/dia</span><button class="btn sm outline" data-apply="${esc(o.id)}">Candidatar-se</button></div>`).join('')}` : ''}
      <h5>História</h5>${(c.events || []).slice(0, 10).map((e) => evRow(e, { compact: true })).join('') || '<p class="muted">Ainda sem acontecimentos registrados.</p>'}
      <div class="w-cp-acts"><a class="btn sm outline" href="#/internet/site/${esc(c.domain)}" data-close>${icon('globe', 12)} Abrir site</a><a class="btn sm outline" href="#/arquivo/company/${esc(c.id)}" data-close>${icon('book', 12)} Arquivo</a>${c.mine ? `<a class="btn sm primary" href="#/economia/empresa" data-close>${icon('briefcase', 12)} Gerenciar</a>` : ''}</div></div>`,
    onMount: (m, close) => {
      const trade = async (lado) => { try { const r = await api.post('/mundo/bolsa', { companyId: c.id, qtd: Number(m.querySelector('#coQty').value), lado }); toast(lado === 'venda' ? 'Venda feita' : 'Compra feita', `Você tem ${r.shares} ações a ${nx(r.price)}`, 'success'); close(); companyCard(c.id); } catch (err) { toast('Ordem recusada', err.message, 'error'); } };
      m.querySelector('[data-buy]')?.addEventListener('click', () => trade('compra'));
      m.querySelector('[data-sell]')?.addEventListener('click', () => trade('venda'));
      m.querySelectorAll('[data-apply]').forEach((b) => { b.onclick = async () => { try { await api.post(`/mundo/vagas/${c.id}/${b.dataset.apply}`); toast('Candidatura enviada', 'O resultado sai em alguns minutos.', 'success'); b.disabled = true; } catch (err) { toast('Não deu', err.message, 'error'); } }; });
      bindEntities(m);
    },
  });
}

export { confirmDialog, esc, timeAgo, toast, modal, icon, api };
