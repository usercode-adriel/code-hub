// Página de instituição no padrão do Banco Nexus: cena em pixel, atendente de IA com balão de fala,
// botões de ação, conversa real com o balcão e LIVE do lugar. Usada por Hospital, Empregos, Imobiliária e Veículos.
import { api } from '../api.js';
import { icon } from '../icons.js';
import { esc, toast } from '../ui.js';
import { livePanel } from './live.js';
import { myAvatar } from '../chrome.js';

// opts: { scene, building, logo: [linha1, linha2], color, agent, bubble: {title, text}, actions: [{icon, label, color, href|id, badge}],
//         chat: { url, placeholder, greeting }, live: { scope, title, art, empty } }
export function institution(host, opts) {
  const a = opts.agent;
  host.insertAdjacentHTML('afterbegin', `<div class="ins" style="--ins:${opts.color || '#6c4cf5'}">
    <section class="ins-hero cx-card">
      <div class="nb-scene"><img class="nb-bg" src="${esc(opts.scene)}" alt="">${opts.building ? `<img class="nb-bld" src="${esc(opts.building)}" alt="">` : ''}
        ${opts.logo ? `<div class="nb-logo ins-logo"><b>${esc(opts.logo[0])}</b><small>${esc(opts.logo[1] || '')}</small></div>` : ''}
        <div class="nb-mgr">${a ? `<img src="${esc(a.avatar || '')}" alt="${esc(a.name)}"><span class="nb-mgr-tag">${esc(a.name)} · ${esc(a.role || '')}</span>` : ''}</div>
        <div class="nb-bubble ins-bubble"><b>${esc(opts.bubble?.title || 'Olá!')}</b><p>${esc(opts.bubble?.text || '')}</p></div></div>
      <div class="nb-acts">${(opts.actions || []).map((x) => (x.href ? `<a class="nb-act" href="${esc(x.href)}">` : `<button class="nb-act" data-ins="${esc(x.id)}">`) + `<span style="--c:${esc(x.color || '#a78bfa')}">${icon(x.icon, 20)}</span>${esc(x.label)}${x.badge ? `<em>${esc(x.badge)}</em>` : ''}` + (x.href ? '</a>' : '</button>')).join('')}</div>
    </section>
    ${opts.chat ? `<section class="nb-chat cx-card ins-chat"><div class="nb-msgs"><div class="nb-m">${a ? `<img src="${esc(a.avatar || '')}" alt="">` : '<span></span>'}<p>${esc(opts.chat.greeting || 'Em que posso ajudar?')}</p></div></div>
      <form class="nb-send"><input name="m" placeholder="${esc(opts.chat.placeholder || 'Digite sua mensagem...')}" autocomplete="off" maxlength="400"><button class="cx-btn" aria-label="Enviar">${icon('send', 16)}</button></form></section>` : ''}
    <aside class="nb-live cx-card ins-live"></aside>
    <div class="ins-body"></div></div>`);
  const root = host.querySelector('.ins');
  const stop = opts.live ? livePanel(root.querySelector('.ins-live'), opts.live) : null;
  if (!opts.live) root.querySelector('.ins-live').remove();
  const bubble = root.querySelector('.ins-bubble');
  if (opts.chat) {
    const msgs = root.querySelector('.nb-msgs'); const f = root.querySelector('.nb-send');
    root.querySelector('[data-ins="falar"]')?.addEventListener('click', () => f.m.focus());
    f.onsubmit = async (e) => {
      e.preventDefault(); const t = f.m.value.trim(); if (!t) return; f.m.value = '';
      msgs.insertAdjacentHTML('beforeend', `<div class="nb-m me"><p>${esc(t)}</p><img src="${esc(myAvatar())}" alt=""></div><div class="nb-typing"><i></i><i></i><i></i></div>`); msgs.scrollTop = msgs.scrollHeight;
      try {
        const r = await api.post(opts.chat.url, { mensagem: t });
        const who = r.agent || r.doctor || r.officer || a;
        msgs.querySelector('.nb-typing')?.remove();
        msgs.insertAdjacentHTML('beforeend', `<div class="nb-m"><img src="${esc(who?.avatar || '')}" alt=""><p>${esc(r.text)}</p></div>`);
        bubble.innerHTML = `<b>${esc((who?.name || 'Atendimento').split(' ')[0])}</b><p>${esc(r.text)}</p>`;
      } catch (err) { msgs.querySelector('.nb-typing')?.remove(); toast('Não deu', err.message, 'error'); }
      msgs.scrollTop = msgs.scrollHeight;
    };
  }
  return { root, body: root.querySelector('.ins-body'), bubble, on: (id, fn) => root.querySelector(`[data-ins="${id}"]`)?.addEventListener('click', fn), stop: () => stop?.() };
}
