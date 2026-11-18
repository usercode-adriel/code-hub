// Mercado — as lojas reais do mapa. Cada loja tem dono, equipe, horário, estoque, preço e um vendedor de IA
// com estilo próprio, que negocia e lembra de você. Para comprar é preciso estar na loja (vá pelo mapa).
import { shell, face, nx, bindEntities, api, esc, icon, toast, withPin, opId, timeAgo } from '../world/wui.js';
import { formModal } from '../ui.js';

const stars = (r) => { const n = Math.round(r || 0); return `<span class="mk-stars" aria-label="${(r || 0).toFixed(1)} de 5">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>`; };
const hrs = (h) => (h ? `${String(h[0]).padStart(2, '0')}h–${String(h[1] % 24).padStart(2, '0')}h` : '24 h');
const CATIC = { tecnologia: 'cpu', social: 'star', geral: 'bag' };
const CATCOL = { tecnologia: '#22d3ee', social: '#ec4899', geral: '#f59e0b' };

// menu circular (roleta) de itens: tokens ao redor, item selecionado no centro com os botões de compra
function wheelHtml(s, sel) {
  const cat = s.catalog || [];
  const it = cat[sel] || null;
  const n = cat.length;
  const tokens = cat.map((p, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, n);
    const x = 50 + 40 * Math.cos(ang); const y = 50 + 40 * Math.sin(ang);
    const col = CATCOL[p.cat] || '#a855f7';
    return `<button class="mk-token ${i === sel ? 'on' : ''} ${p.stock ? '' : 'out'}" data-sel="${i}" style="left:${x}%;top:${y}%;--c:${col}" title="${esc(p.name)}">${icon(CATIC[p.cat] || 'bag', 20)}${p.promo ? '<i class="mk-token-promo">%</i>' : ''}</button>`;
  }).join('');
  const buyable = it && s.here && s.open && it.stock && !s.banned;
  return `<div class="mk-wheel-head"><h3>${icon('bag', 16)} Vitrine</h3><small class="muted">Gire e escolha o item</small></div>
    <div class="mk-wheel"><div class="mk-wheel-ring">${tokens}
      <div class="mk-wheel-center">${it ? `<span class="mk-wc-ic" style="--c:${CATCOL[it.cat] || '#a855f7'}">${icon(CATIC[it.cat] || 'bag', 30)}</span>
        <b class="mk-wc-nm">${esc(it.name)}</b>
        <div class="mk-wc-price">${it.promo ? `<s>${nx(it.listPrice, 0)}</s>` : ''}<em>${nx(it.price, 0)}</em></div>
        <small class="mk-wc-stock ${it.stock ? '' : 'down'}">${it.stock ? `${it.stock} em estoque` : 'Esgotado'}</small>` : '<b>Sem itens</b>'}</div></div></div>
    ${it ? `<div class="mk-wc-desc"><p class="muted">${esc(it.desc || '')}</p>
      <div class="mk-wc-acts"><button class="btn primary" data-buy="${esc(it.key)}" ${buyable ? '' : 'disabled'}>${icon('bag', 14)} Comprar</button><button class="btn outline" data-neg="${esc(it.key)}" ${s.open && it.stock ? '' : 'disabled'}>Negociar</button></div>
      ${!s.here ? '<small class="muted mk-wc-hint">Vá até a loja pelo mapa para comprar.</small>' : !s.open ? '<small class="muted mk-wc-hint">A loja está fechada agora.</small>' : ''}</div>` : ''}`;
}

export default async function render(el, parts) {
  const body = shell(el, 'mercado');
  bindEntities(body);
  if (parts[0]) return storePage(body, parts[0]);
  body.innerHTML = '<div class="skeleton" style="height:300px"></div>';
  let d;
  try { d = await api.get('/mundo/lojas'); } catch (err) { body.innerHTML = `<div class="w-empty"><b>${esc(err.message)}</b></div>`; return; }
  const kinds = [...new Set(d.stores.map((s) => s.kind))];
  let filter = ''; let q = '';
  body.innerHTML = `<div class="mk">
    <header class="mk-head w-panel"><div><h1>${icon('bag', 22)} Mercado de Nexus City</h1><p class="muted">Lojas de verdade, com estoque, horário e vendedores que negociam. Para comprar, vá até a loja pelo mapa.</p></div>
      <label class="gm-search mk-search">${icon('search', 15)}<input id="mkQ" placeholder="Buscar loja ou produto" aria-label="Buscar"></label></header>
    <div class="gm-chips mk-chips"><button data-k="" class="on">Todas</button>${kinds.map((k) => `<button data-k="${esc(k)}" style="--c:${esc(d.cats[k]?.color || '#64748b')}">${icon(d.cats[k]?.icon || 'bag', 12)} ${esc(d.cats[k]?.label || k)}</button>`).join('')}</div>
    <div class="mk-grid" id="mkGrid"></div></div>`;
  const grid = body.querySelector('#mkGrid');
  const paint = () => {
    const list = d.stores.filter((s) => (!filter || s.kind === filter) && (!q || `${s.name} ${s.kindLabel} ${s.sub || ''} ${(s.products || []).join(' ')}`.toLowerCase().includes(q)));
    grid.innerHTML = list.map((s) => `<a class="mk-store w-panel ${s.open ? '' : 'closed'}" href="#/mercado/${esc(s.id)}" style="--c:${esc(d.cats[s.kind]?.color || '#64748b')}">
      <div class="mk-st-top"><span class="mk-ic">${icon(d.cats[s.kind]?.icon || 'bag', 20)}</span><div><b>${esc(s.name)}</b><small>${esc(s.kindLabel || '')}${s.sub ? ` · ${esc(s.sub)}` : ''}</small></div>${d.here === s.id ? '<span class="w-chip ok">Você está aqui</span>' : ''}</div>
      <div class="mk-st-meta">${stars(s.rating)} <small>(${s.reviews})</small><span class="${s.open ? 'up' : 'down'}">${s.open ? 'Aberta' : 'Fechada'} · ${hrs(s.hours)}</span></div>
      <small class="muted">${icon('pin', 11)} ${esc(s.address || '')}</small>
      <div class="mk-st-foot"><span>${s.inStock}/${s.items} produtos em estoque</span>${s.promo && s.promo.until > new Date().toISOString() ? `<span class="mk-promo">-${s.promo.pct}%</span>` : ''}</div></a>`).join('') || '<p class="muted">Nenhuma loja encontrada.</p>';
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
  function paint() {
    const promoOn = s.promo && s.promo.until > new Date().toISOString();
    body.innerHTML = `<div class="mk-page">
      <a class="mk-back" href="#/mercado">${icon('chevRight', 13)} Voltar ao Mercado</a>
      <header class="mk-hero w-panel"><div class="mk-hero-l"><h1>${esc(s.name)}</h1><small>${esc(s.kindLabel || '')}${s.sub ? ` · ${esc(s.sub)}` : ''}${s.company ? ` · <a data-company="${esc(s.company.id)}">${esc(s.company.name)}</a>` : ''}</small>
          <div class="mk-st-meta">${stars(s.reputation)} <small>${(s.reputation || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} · ${s.ratings.length} avaliação(ões) recentes</small></div>
          <div class="mk-hero-kv"><span>${icon('pin', 12)} ${esc(s.address || '')}</span><span>${icon('clock', 12)} ${hrs(s.hours)} · <b class="${s.open ? 'up' : 'down'}">${s.open ? 'Aberta' : 'Fechada'}</b></span>${s.owner ? `<span>${icon('user', 12)} Dono(a): <a data-person="${esc(s.owner.id)}">${esc(s.owner.name)}</a></span>` : ''}</div></div>
        <div class="mk-hero-r">${s.here ? `<span class="w-chip ok">${icon('target', 11)} Você está na loja</span>` : `<a class="btn primary" href="#/mapa/${esc(s.id)}">${icon('pin', 14)} Ir até a loja</a><small class="muted">Você precisa estar aqui para comprar</small>`}
          ${s.banned ? '<span class="w-chip warn">O vendedor se recusa a te atender</span>' : ''}</div></header>
      ${promoOn ? `<div class="mk-banner">${icon('zap', 14)} Promoção: ${s.promo.pct}% de desconto em ${esc(s.catalog.find((c) => c.key === s.promo.key)?.name || 'um produto')} até ${new Date(s.promo.until).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</div>` : ''}
      <div class="mk-cols">
        <section class="mk-showcase w-panel">${wheelHtml(s, sel)}</section>
        <aside class="mk-side">
          ${s.seller ? `<section class="w-panel mk-seller"><div class="mk-sl-h"><span data-person="${esc(s.seller.id)}">${face(s.seller, 48)}</span><div><b>${esc(s.seller.name)}</b><small>Vendedor(a) · estilo ${esc(s.seller.styleLabel)}</small>${s.seller.customer?.purchases ? `<small>Você já comprou ${s.seller.customer.purchases}× aqui</small>` : ''}</div></div>
            ${s.greeting ? `<p class="mk-bubble">“${esc(s.greeting)}”</p>` : ''}
            ${s.pitch ? `<div class="mk-pitch"><p>“${esc(s.pitch.text)}”</p><button class="btn sm primary" data-pitch>Aceitar oferta · ${nx(s.pitch.offer.price, 0)}</button><small class="muted">Vale por 10 min</small></div>` : ''}
            <div class="mk-chat" id="mkChat">${chatLog.map((m) => `<p class="${m.me ? 'me' : ''}">${esc(m.text)}</p>`).join('')}</div>
            <form class="mk-chat-f" id="mkChatF"><input name="m" placeholder="Pergunte algo ao vendedor" maxlength="400" ${s.open ? '' : 'disabled'} aria-label="Mensagem"><button class="btn sm primary" ${s.open ? '' : 'disabled'}>${icon('send', 13)}</button></form></section>` : ''}
          ${s.staff.length ? `<section class="w-panel"><h5>Equipe</h5><div class="gm-staff">${s.staff.map((p) => `<button data-person="${esc(p.id)}" title="${esc(p.name)}">${face(p, 30)}</button>`).join('')}</div></section>` : ''}
          <section class="w-panel"><div class="w-ph"><h5>Avaliações</h5><button class="btn sm ghost" data-rate>${icon('star', 12)} Avaliar</button></div>${s.ratings.map((r) => `<div class="mk-rv">${stars(r.stars)} <b>${esc(r.by?.name || 'Cliente')}</b>${r.text ? `<p>${esc(r.text)}</p>` : ''}<small class="muted">${esc(timeAgo(r.at))}</small></div>`).join('') || '<p class="muted">Sem avaliações ainda.</p>'}</section>
          ${s.history.length ? `<section class="w-panel"><h5>Histórico da loja</h5><ul class="gm-hist">${s.history.map((h) => `<li>${esc(h.title)}</li>`).join('')}</ul></section>` : ''}
        </aside></div></div>`;
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
    body.querySelectorAll('[data-sel]').forEach((b) => { b.onclick = () => { sel = Number(b.dataset.sel); paint(); }; });
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
}
