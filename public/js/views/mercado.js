// Mercado — as lojas reais do mapa. Cada loja tem dono, equipe, horário, estoque, preço e um vendedor de IA
// com estilo próprio, que negocia e lembra de você. Para comprar é preciso estar na loja (vá pelo mapa).
import { shell, face, nx, bindEntities, api, esc, icon, toast, withPin, opId, timeAgo } from '../world/wui.js';
import { formModal } from '../ui.js';
import { livePanel } from '../world/live.js';

const stars = (r) => { const n = Math.round(r || 0); return `<span class="mk-stars" aria-label="${(r || 0).toFixed(1)} de 5">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>`; };
const hrs = (h) => (h ? `${String(h[0]).padStart(2, '0')}h–${String(h[1] % 24).padStart(2, '0')}h` : '24 h');
const CATIC = { tecnologia: 'cpu', social: 'star', geral: 'bag' };
const CATCOL = { tecnologia: '#22d3ee', social: '#ec4899', geral: '#f59e0b' };

const art = (key) => `/assets/items/${key}.png`;
const CATNAME = { tecnologia: 'Tecnologia', social: 'Social', geral: 'Geral', submundo: 'Submundo' };
const STORE_ART = { 'loja-tec': 'b-loja', shopping: 'b-loja', mercado: 'b-loja', clandestino: 'b-casa', banco: 'b-banco', farmacia: 'b-hospital', clube: 'b-torre', publicidade: 'b-predio', 'loja-social': 'b-predio', cafe: 'b-loja', padaria: 'b-loja' };
const storeArt = (kind) => `/assets/pixel/${STORE_ART[kind] || 'b-predio'}.png`;

export default async function render(el, parts) {
  const body = shell(el, 'mercado');
  bindEntities(body);
  if (parts[0]) return storePage(body, parts[0]);
  body.innerHTML = '<div class="skeleton" style="height:300px"></div>';
  let d;
  try { d = await api.get('/mundo/lojas'); } catch (err) { body.innerHTML = `<div class="w-empty"><b>${esc(err.message)}</b></div>`; return; }
  const kinds = [...new Set(d.stores.map((s) => s.kind))];
  let filter = ''; let q = '';
  body.innerHTML = `<div class="sh">
    <header class="sh-head cx-card"><img src="/assets/pixel/scene-comercio.png" alt=""><div><h1>Lojas de Nexus City</h1><p>Estoque real, horário, preço e vendedores de IA que negociam e lembram de você. Para comprar, vá até a loja pelo mapa.</p></div>
      <label class="cx-search sh-q">${icon('search', 15)}<input id="mkQ" placeholder="Buscar loja ou produto" aria-label="Buscar"></label></header>
    <div class="sh-chips mk-chips"><button data-k="" class="on">Todas</button>${kinds.map((k) => `<button data-k="${esc(k)}" style="--c:${esc(d.cats[k]?.color || '#64748b')}">${icon(d.cats[k]?.icon || 'bag', 12)} ${esc(d.cats[k]?.label || k)}</button>`).join('')}</div>
    <div class="sh-grid" id="mkGrid"></div></div>`;
  const grid = body.querySelector('#mkGrid');
  const paint = () => {
    const list = d.stores.filter((s) => (!filter || s.kind === filter) && (!q || `${s.name} ${s.kindLabel} ${s.sub || ''} ${(s.products || []).join(' ')}`.toLowerCase().includes(q)));
    grid.innerHTML = list.map((s) => `<a class="sh-store ${s.open ? '' : 'closed'} ${s.hidden ? 'shady' : ''}" href="#/mercado/${esc(s.id)}" style="--c:${esc(d.cats[s.kind]?.color || '#64748b')}">
      <div class="sh-st-art"><img src="${storeArt(s.kind)}" alt=""><span class="sh-st-open ${s.open ? 'up' : 'down'}">${s.open ? 'Aberta' : 'Fechada'} · ${hrs(s.hours)}</span>${s.promo && s.promo.until > new Date().toISOString() ? `<span class="sh-st-promo">-${s.promo.pct}%</span>` : ''}${d.here === s.id ? '<span class="sh-st-here">Você está aqui</span>' : ''}</div>
      <div class="sh-st-b"><div class="sh-st-t">${s.seller ? `<img class="sh-st-sl" src="${esc(s.seller.avatar || '')}" alt="">` : ''}<div><b>${esc(s.name)}</b><small>${esc(s.kindLabel || '')}${s.sub ? ` · ${esc(s.sub)}` : ''}</small></div></div>
        <div class="sh-st-items">${(s.keys || []).map((k) => `<img src="${art(k)}" alt="">`).join('')}</div>
        <div class="sh-st-meta">${stars(s.rating)} <small>(${s.reviews})</small><span>${s.inStock}/${s.items} em estoque</span></div>
        <small class="cx-mut">${icon('pin', 11)} ${esc(s.address || '')}</small></div></a>`).join('') || '<p class="cx-mut">Nenhuma loja encontrada.</p>';
  };
  body.querySelectorAll('.mk-chips button').forEach((b) => { b.onclick = () => { filter = b.dataset.k; body.querySelectorAll('.mk-chips button').forEach((x) => x.classList.toggle('on', x === b)); paint(); }; });
  body.querySelector('#mkQ').oninput = (e) => { q = e.target.value.trim().toLowerCase(); paint(); };
  paint();
}

async function storePage(body, id) {
  body.innerHTML = '<div class="skeleton" style="height:360px"></div>';
  let s;
  let sel = 0;
  const load = async () => { s = await api.get(`/mundo/lojas/${encodeURIComponent(id)}`); if (sel >= s.catalog.length) sel = 0; paint(); };
  const chatLog = [];
  let catF = ''; let stopLive = null;
  function paint() {
    const promoOn = s.promo && s.promo.until > new Date().toISOString();
    const cats = [...new Set(s.catalog.map((it) => it.cat))];
    const feat = (promoOn && s.catalog.find((c) => c.key === s.promo.key)) || (s.pitch && s.catalog.find((c) => c.key === s.pitch.offer.key)) || s.catalog.slice().sort((a, b) => b.price - a.price)[0];
    const buyable = (it) => s.here && s.open && it.stock && !s.banned;
    const card = (it) => `<article class="sp-card ${it.stock ? '' : 'out'}" style="--c:${CATCOL[it.cat] || '#a855f7'}">
        <div class="sp-art"><img src="${art(it.key)}" alt="">${it.promo ? `<span class="sp-promo">-${it.promo}%</span>` : ''}<span class="sp-stock ${it.stock ? (it.stock <= 2 ? 'low' : '') : 'zero'}">${it.stock ? `${it.stock} em estoque` : 'Esgotado'}</span></div>
        <b class="sp-nm">${esc(it.name)}</b><small class="sp-cat">${esc(CATNAME[it.cat] || it.cat || '')}</small>
        <div class="sp-price">${it.promo ? `<s>${nx(it.listPrice, 0)}</s>` : ''}<em>${nx(it.price, 0)}</em></div>
        <div class="sp-acts"><button class="cx-btn sm" data-buy="${esc(it.key)}" ${buyable(it) ? '' : 'disabled'}>${icon('cart', 13)} Comprar</button><button class="cx-btn sm ghost" data-neg="${esc(it.key)}" ${s.open && it.stock ? '' : 'disabled'}>Negociar</button></div>
        <button class="sp-info" data-info="${esc(it.key)}" aria-label="Detalhes">${icon('eye', 13)}</button></article>`;
    body.innerHTML = `<div class="sp ${s.kind === 'clandestino' ? 'shady' : ''}">
      <a class="mk-back" href="#/mercado">${icon('chevLeft', 13)} Lojas</a>
      <header class="sp-hero cx-card"><img class="sp-hero-art" src="${storeArt(s.kind)}" alt="">
        <div class="sp-hero-tx"><h1>${esc(s.name)}</h1><small>${esc(s.kindLabel || '')}${s.sub ? ` · ${esc(s.sub)}` : ''}${s.company ? ` · <a data-company="${esc(s.company.id)}">${esc(s.company.name)}</a>` : ''}</small>
          <div class="sp-kv">${stars(s.reputation)} <span>${(s.reputation || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} · ${s.ratings.length} avaliações</span><span>${icon('clock', 12)} ${hrs(s.hours)} · <b class="${s.open ? 'up' : 'down'}">${s.open ? 'Aberta' : 'Fechada'}</b></span><span>${icon('pin', 12)} ${esc(s.address || '')}</span>${s.owner ? `<span>Dono(a): <a data-person="${esc(s.owner.id)}">${esc(s.owner.name)}</a></span>` : ''}${s.cashOnly ? `<span class="down">${icon('wallet', 12)} Só dinheiro vivo</span>` : ''}</div></div>
        <div class="sp-hero-r">${s.here ? `<span class="sp-here">${icon('target', 13)} Você está na loja</span>` : `<a class="cx-btn" href="#/mapa/${esc(s.id)}">${icon('pin', 14)} Ir até a loja</a><small class="cx-mut">Você precisa estar aqui para comprar</small>`}
          ${s.banned ? '<span class="sp-ban">O vendedor se recusa a te atender</span>' : ''}</div></header>
      ${feat ? `<section class="sp-feat cx-card" style="--c:${CATCOL[feat.cat] || '#a855f7'}"><img src="${art(feat.key)}" alt=""><div><small>${promoOn && feat.key === s.promo.key ? `PROMOÇÃO · ${s.promo.pct}% OFF até ${new Date(s.promo.until).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : s.pitch && feat.key === s.pitch.offer.key ? 'OFERTA DO VENDEDOR' : 'DESTAQUE DA LOJA'}</small><b>${esc(feat.name)}</b><p>${esc(feat.desc || '')}</p></div>
        <div class="sp-feat-r"><em>${nx(s.pitch && feat.key === s.pitch.offer.key ? s.pitch.offer.price : feat.price, 0)}</em>${s.pitch && feat.key === s.pitch.offer.key ? `<button class="cx-btn" data-pitch ${s.here ? '' : 'disabled'}>Aceitar oferta</button>` : `<button class="cx-btn" data-buy="${esc(feat.key)}" ${buyable(feat) ? '' : 'disabled'}>${icon('cart', 14)} Comprar</button>`}</div></section>` : ''}
      <div class="sp-cols">
        <section class="sp-main">
          <div class="sh-chips sp-cats"><button data-cf="" class="${catF ? '' : 'on'}">Tudo (${s.catalog.length})</button>${cats.map((c) => `<button data-cf="${esc(c)}" class="${catF === c ? 'on' : ''}">${esc(CATNAME[c] || c)}</button>`).join('')}</div>
          <div class="sp-grid">${s.catalog.filter((it) => !catF || it.cat === catF).map(card).join('') || '<p class="cx-mut">Sem produtos.</p>'}</div>
          <section class="cx-card sp-rev"><header class="cx-card-h"><span class="cx-h-ic" style="--c:#facc15">${icon('star', 15)}</span><h3>Avaliações</h3><button class="cx-more-l" data-rate>${icon('star', 12)} Avaliar</button></header>
            ${s.ratings.map((r) => `<div class="mk-rv">${stars(r.stars)} <b>${esc(r.by?.name || 'Cliente')}</b><p>${esc(r.text || '')}</p></div>`).join('') || '<p class="cx-mut">Ainda sem avaliações.</p>'}
            ${s.history.length ? `<h5>Histórico da loja</h5><ul class="gm-hist">${s.history.map((h) => `<li>${esc(h.title)}</li>`).join('')}</ul>` : ''}</section>
        </section>
        <aside class="sp-side">
          ${s.seller ? `<section class="cx-card sp-seller"><div class="sp-sl-h"><button class="sp-sl-av" data-person="${esc(s.seller.id)}"><img src="${esc(s.seller.avatar || '')}" alt=""></button><div><b>${esc(s.seller.name)}</b><small>Vendedor(a) · ${esc(s.seller.styleLabel || s.seller.style || '')}</small><small class="${s.open ? 'up' : 'down'}">● ${s.open ? 'atendendo' : 'fora do horário'}</small></div></div>
            ${s.greeting ? `<p class="sp-bubble">${esc(s.greeting)}</p>` : ''}
            ${s.pitch && !feat ? `<div class="mk-pitch"><p>${esc(s.pitch.text)}</p><button class="cx-btn sm" data-pitch>Aceitar · ${nx(s.pitch.offer.price, 0)}</button></div>` : s.pitch ? `<p class="sp-bubble alt">${esc(s.pitch.text)}</p>` : ''}
            <div class="sp-chat" id="mkChat">${chatLog.map((m) => `<p class="${m.me ? 'me' : ''}">${esc(m.text)}</p>`).join('')}</div>
            <form class="nb-send" id="mkChatF"><input name="m" placeholder="Fale com ${esc(s.seller.name.split(' ')[0])}..." maxlength="400" ${s.open ? '' : 'disabled'} aria-label="Mensagem"><button class="cx-btn" ${s.open ? '' : 'disabled'} aria-label="Enviar">${icon('send', 15)}</button></form></section>` : ''}
          <section class="cx-card sp-live" id="spLive"></section>
          ${s.staff.length ? `<section class="cx-card"><header class="cx-card-h"><span class="cx-h-ic" style="--c:#38d6f5">${icon('users', 15)}</span><h3>Equipe</h3></header><div class="sp-staff">${s.staff.map((p) => `<button data-person="${esc(p.id)}" title="${esc(p.name)}"><img src="${esc(p.avatar || '')}" alt=""><small>${esc(p.name.split(' ')[0])}</small></button>`).join('')}</div></section>` : ''}
        </aside></div></div>`;
    stopLive?.(); stopLive = livePanel(body.querySelector('#spLive'), { scope: `place:${s.id}`, title: 'Ao vivo na loja', art: null, n: 10, empty: 'Entradas, saídas, compras e devoluções da loja aparecem aqui.' });
    body.querySelectorAll('[data-cf]').forEach((b) => { b.onclick = () => { catF = b.dataset.cf; paint(); }; });
    body.querySelectorAll('[data-info]').forEach((b) => { b.onclick = () => { const it = s.catalog.find((x) => x.key === b.dataset.info); import('../ui.js').then(({ modal }) => modal({ title: it.name, body: `<div class="sp-modal"><img src="${art(it.key)}" alt=""><p>${esc(it.desc || '')}</p><p><b>${nx(it.price, 0)}</b> · ${it.stock} em estoque</p></div>` })); }; });
    bindActions();
  }
  const doBuy = async (key, offerId = null) => {
    const it = s.catalog.find((x) => x.key === key);
    const method = await chooseMethod(it, offerId);
    if (!method) return;
    const op = opId();
    try {
      const r = await withPin((pin) => api.post(`/mundo/lojas/${encodeURIComponent(s.id)}/comprar`, { key, metodo: method, pin, offerId, opId: op }), `Pagar ${it.name}`);
      if (!r) return;
      toast('Compra feita 🛍️', `${it.name} por ${nx(r.price, 0)} — está no seu inventário.`, 'success');
      await load();
    } catch (err) { toast('Compra não realizada', err.message, 'error'); }
  };
  const chooseMethod = (it, offerId) => new Promise((resolve) => {
    import('../ui.js').then(({ modal }) => {
      let chosen = null;
      modal({
        title: 'Forma de pagamento',
        body: `<p><b>${esc(it.name)}</b> · ${offerId ? 'preço negociado' : nx(it.price, 0)}</p><div class="mk-pay"><button class="btn primary" data-m="saldo">${icon('wallet', 14)} Saldo da conta</button><button class="btn outline" data-m="cartao">${icon('layers', 14)} Cartão virtual</button></div><p class="hint muted">Você vai digitar a senha bancária no próximo passo.</p>`,
        onMount: (m, close) => {
          m.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => { chosen = b.dataset.m; close(); resolve(chosen); }; });
          new MutationObserver((_, obs) => { if (!document.body.contains(m)) { obs.disconnect(); if (!chosen) resolve(null); } }).observe(document.body, { childList: true });
        },
      });
    });
  });
  function bindActions() {
    body.querySelectorAll('[data-buy]').forEach((b) => { b.onclick = () => doBuy(b.dataset.buy); });
    body.querySelector('[data-pitch]')?.addEventListener('click', () => doBuy(s.pitch.offer.key, s.pitch.offer.id));
    body.querySelectorAll('[data-neg]').forEach((b) => { b.onclick = () => {
      const it = s.catalog.find((x) => x.key === b.dataset.neg);
      formModal({ title: `Negociar ${it.name}`, submit: 'Fazer oferta', fields: [{ name: 'oferta', label: `Sua oferta (preço: ${nx(it.price, 0)})`, type: 'number', value: Math.round(it.price * 0.85) }],
        onSubmit: async (d) => {
          const r = await api.post(`/mundo/lojas/${encodeURIComponent(s.id)}/negociar`, { key: it.key, oferta: Number(d.oferta) });
          chatLog.push({ me: true, text: `Faço por ${Number(d.oferta).toLocaleString('pt-BR')} NXC?` }, { text: r.text });
          paint();
          if (r.offerId && ['aceito', 'contraproposta'].includes(r.result)) {
            const chat = body.querySelector('#mkChat');
            chat?.insertAdjacentHTML('beforeend', `<button class="btn sm primary mk-deal" data-deal>${r.result === 'aceito' ? 'Fechar negócio' : 'Aceitar contraproposta'} · ${nx(r.price, 0)}</button>`);
            chat?.querySelector('[data-deal]')?.addEventListener('click', () => (s.here ? doBuy(it.key, r.offerId) : toast('Vá até a loja', 'O preço vale por 10 minutos. Use o mapa para chegar.', 'info')));
          }
          return r;
        } });
    }; });
    const f = body.querySelector('#mkChatF');
    if (f) f.onsubmit = async (e) => {
      e.preventDefault();
      const m = f.m.value.trim(); if (!m) return;
      chatLog.push({ me: true, text: m }); f.m.value = '';
      const chat = body.querySelector('#mkChat'); chat.insertAdjacentHTML('beforeend', `<p class="me">${esc(m)}</p><p class="typing">…</p>`); chat.scrollTop = chat.scrollHeight;
      try { const r = await api.post(`/mundo/lojas/${encodeURIComponent(s.id)}/conversar`, { mensagem: m }); chatLog.push({ text: r.text }); } catch (err) { chatLog.push({ text: err.message }); }
      chat.querySelector('.typing')?.remove(); chat.insertAdjacentHTML('beforeend', `<p>${esc(chatLog.at(-1).text)}</p>`); chat.scrollTop = chat.scrollHeight;
    };
    body.querySelector('[data-rate]')?.addEventListener('click', () => formModal({ title: `Avaliar ${s.name}`, submit: 'Enviar avaliação', fields: [{ name: 'estrelas', label: 'Nota', type: 'select', options: [[5, '★★★★★'], [4, '★★★★'], [3, '★★★'], [2, '★★'], [1, '★']] }, { name: 'texto', label: 'Comentário (opcional)', type: 'textarea', full: true }],
      onSubmit: async (d) => { await api.post(`/mundo/lojas/${encodeURIComponent(s.id)}/avaliar`, { estrelas: Number(d.estrelas), texto: d.texto }); toast('Obrigado!', 'Sua avaliação conta para a reputação da loja.', 'success'); await load(); } }));
  }
  try { await load(); } catch (err) { body.innerHTML = `<div class="w-empty"><b>${esc(err.message)}</b><a class="btn outline" href="#/mercado">Voltar</a></div>`; }
  return () => stopLive?.();
}
