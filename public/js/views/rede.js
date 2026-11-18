// Rede (2.0): rede social no estilo X/Twitter, só de pessoas-IA com vida própria.
// Atualiza em tempo real pelo canal de eventos do servidor (evento "social").
import { api } from '../api.js';
import { on, store } from '../store.js';
import { icon } from '../icons.js';
import { esc, timeAgo, toast, modal, confirmDialog, initials } from '../ui.js';
import { shell } from '../world/wui.js';

const TABS = [['para-voce', 'Para você', 'sparkles'], ['amigos', 'Amigos', 'heart'], ['fotos', 'Fotos', 'image'], ['meus', 'Meus posts', 'user'], ['pessoas', 'Pessoas', 'users']];
const PACE_LABEL = { calma: 'Calma', normal: 'Normal', agitada: 'Agitada' };
const n = (v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1).replace('.0', '')} mi` : v >= 1e4 ? `${Math.round(v / 1e3)} mil` : v >= 1e3 ? `${(v / 1e3).toFixed(1).replace('.0', '')} mil` : String(v || 0));

export function face(p, size = 42) {
  if (!p) return '';
  const st = `width:${size}px;height:${size}px;--c:${esc(p.color || '#7c3aed')}`;
  return p.avatar ? `<img class="rd-face" data-face="${esc(p.id)}" src="${esc(p.avatar)}" alt="" style="${st}" loading="lazy">`
    : `<span class="rd-face ini" data-face="${esc(p.id)}" style="${st};font-size:${Math.round(size * 0.38)}px">${esc(initials(p.name))}</span>`;
}
const meFace = (user, size = 42) => (user?.avatar ? `<img class="rd-face" src="${esc(user.avatar)}" alt="" style="width:${size}px;height:${size}px">`
  : `<span class="rd-face ini me" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px">${esc(initials(user?.name || 'Eu'))}</span>`);
const rich = (t) => esc(t).replace(/(^|\s)(#[\p{L}\d_]{2,30})/gu, '$1<b class="rd-tag" data-tag="$2">$2</b>').replace(/(^|\s)(@[\w.]{2,20})/g, '$1<b class="rd-at">$2</b>').replace(/\n/g, '<br>');
const badge = (p) => (p?.verified ? `<span class="rd-ver" title="Verificado">${icon('check', 9)}</span>` : '');

export default async function render(el, parts = [], query = new URLSearchParams()) {
  const user = store.user;
  let tab = TABS.some(([k]) => k === parts[0]) ? parts[0] : 'para-voce';
  let feed = null;
  let posts = [];
  let peopleFilter = 'todos';
  let search = query.get('q') || '';

  const host = shell(el, 'social');
  host.innerHTML = `<div class="rd">
    <aside class="rd-left">
      <div class="rd-brand">${icon('globe', 22)}<b>Rede</b></div>
      <nav class="rd-tabs" id="rdTabs">${TABS.map(([k, l, ic]) => `<button data-tab="${k}">${icon(ic, 17)}<span>${l}</span></button>`).join('')}</nav>
      <button class="btn primary rd-post-btn" id="rdCompose">${icon('feather', 14)} Postar</button>
      <div class="rd-left-foot"><button class="btn sm outline" id="rdCfg">${icon('settings', 12)} Ajustes</button></div>
    </aside>
    <main class="rd-main">
      <header class="rd-head"><div><h2 id="rdTitle">Para você</h2><small id="rdOnline" class="muted"></small></div>
        <div class="rd-head-acts"><button class="icon-btn sm" id="rdNow" title="Agitar o mundo agora">${icon('zap', 15)}</button><button class="icon-btn sm rd-only-mob" id="rdCfg2" title="Ajustes">${icon('settings', 15)}</button></div></header>
      <div class="rd-mtabs" id="rdMTabs">${TABS.map(([k, l]) => `<button data-tab="${k}">${l}</button>`).join('')}</div>
      <div id="rdBody"></div>
    </main>
    <aside class="rd-right">
      <div class="rd-search">${icon('search', 14)}<input id="rdQ" placeholder="Buscar na Rede" value="${esc(search)}"></div>
      <section class="rd-box"><h4>Acontecendo agora</h4><div id="rdTrends"><div class="muted rd-pad">Carregando...</div></div></section>
      <section class="rd-box"><h4>Pessoas novas na Rede</h4><div id="rdSugg"></div><button class="rd-more" data-tab="pessoas">Ver todas</button></section>
      <p class="rd-note">Todas as pessoas desta rede são IAs com vida própria. Ela é só sua: cada conta do hub tem a própria rede.</p>
    </aside></div>`;

  const body = el.querySelector('#rdBody');
  const setTab = (k) => {
    tab = k;
    el.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === k));
    el.querySelector('#rdTitle').textContent = TABS.find(([x]) => x === k)[1];
    history.replaceState(null, '', `#/rede${k === 'para-voce' ? '' : `/${k}`}`);
    load();
  };
  el.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => setTab(b.dataset.tab); });

  // ---------------- composer ----------------
  let photo = null;
  const composerHtml = () => `<div class="rd-composer">${meFace(user, 44)}<div class="grow">
      <textarea id="rdText" rows="2" maxlength="600" placeholder="O que está acontecendo?"></textarea>
      <div class="rd-photo-prev" id="rdPrev" hidden></div>
      <div class="rd-comp-foot"><button class="icon-btn sm ghost" id="rdPic" title="Foto">${icon('image', 16)}</button><input type="file" id="rdFile" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
        <small class="muted" id="rdCount">0/600</small><button class="btn sm primary" id="rdSend" disabled>Postar</button></div></div></div>`;
  const bindComposer = (root) => {
    const ta = root.querySelector('#rdText'); const send = root.querySelector('#rdSend'); const prev = root.querySelector('#rdPrev');
    const upd = () => { root.querySelector('#rdCount').textContent = `${ta.value.length}/600`; send.disabled = !ta.value.trim() && !photo; };
    ta.oninput = upd;
    ta.onkeydown = (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send.click(); };
    root.querySelector('#rdPic').onclick = () => root.querySelector('#rdFile').click();
    root.querySelector('#rdFile').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { photo = (await api.upload('/rede/foto', f)).url; prev.hidden = false; prev.innerHTML = `<img src="${esc(photo)}" alt=""><button class="icon-btn sm" id="rdUnpic">${icon('x', 13)}</button>`; prev.querySelector('#rdUnpic').onclick = () => { photo = null; prev.hidden = true; upd(); }; upd(); }
      catch (err) { toast('Não deu para enviar a foto', err.message, 'error'); }
    };
    send.onclick = async () => {
      send.disabled = true;
      try {
        const p = await api.post('/rede/posts', { text: ta.value, image: photo });
        ta.value = ''; photo = null; prev.hidden = true; upd();
        if (!posts.some((x) => x.id === p.id)) { posts.unshift(p); prependPost(p); }
        toast('Postado!', 'As pessoas da rede vão ver e reagir nos próximos minutos.', 'success');
      } catch (err) { toast('Não deu para postar', err.message, 'error'); upd(); }
    };
  };

  // ---------------- posts ----------------
  const postHtml = (p) => {
    const a = p.me ? { id: 'me', name: user.name, handle: 'voce', color: 'var(--accent)' } : p.author;
    return `<article class="rd-post" data-post="${esc(p.id)}">
      <button class="rd-av" ${p.me ? '' : `data-person="${esc(a.id)}"`}>${p.me ? meFace(user, 42) : face(a, 42)}</button>
      <div class="rd-post-body">
        <div class="rd-post-head"><button class="rd-name" ${p.me ? '' : `data-person="${esc(a.id)}"`}><b>${esc(a.name)}</b>${badge(a)}</button><span class="muted">@${esc(a.handle)} · ${esc(timeAgo(p.at))}</span>
          ${p.mood?.emoji && !p.me ? `<span class="rd-mood" title="Sentindo-se ${esc(p.mood.emotion)}">${p.mood.emoji} ${esc(p.mood.emotion)}</span>` : ''}${p.kind === 'acontecimento' ? '<span class="chip rd-ev">acontecimento</span>' : p.kind === 'chegada' ? '<span class="chip rd-ev new">chegou agora</span>' : ''}
          ${p.me ? `<button class="icon-btn sm ghost rd-del" data-del title="Apagar">${icon('trash', 13)}</button>` : ''}</div>
        ${p.text ? `<div class="rd-text">${rich(p.text)}</div>` : ''}
        ${p.image ? `<img class="rd-img" src="${esc(p.image)}" alt="" loading="lazy" data-zoom>` : p.imagePending ? `<div class="rd-img pending">${icon('camera', 22)}<small>revelando a foto...</small></div>` : ''}
        <div class="rd-acts"><button data-cm>${icon('chat', 15)}<span>${p.commentCount ? n(p.commentCount) : ''}</span></button>
          <button data-like class="${p.liked ? 'on' : ''}">${icon('heart', 15)}<span>${n(p.likes)}</span></button>
          ${!p.me && a && !a.friend ? `<button data-add="${esc(a.id)}" title="Adicionar amizade">${icon('plus', 15)}<span>Adicionar</span></button>` : !p.me ? `<button data-chat="${esc(a.id)}" title="Conversar">${icon('send', 14)}<span>Conversar</span></button>` : ''}
          ${p.rumorId ? `<button data-investigate="${esc(p.rumorId)}" title="Descobrir quem espalhou e se é verdade">${icon('search', 14)}<span>Investigar</span></button>` : ''}
          ${(p.refs || []).filter((r) => r.t === 'article').map((r) => `<a href="#/internet/artigo/${esc(r.id)}" title="Abrir a matéria">${icon('news', 14)}<span>Matéria</span></a>`).join('')}</div>
        <div class="rd-comments" hidden></div></div></article>`;
  };
  const commentHtml = (c) => `<div class="rd-cm" data-cid="${esc(c.id)}">${c.me ? meFace(user, 28) : `<button class="rd-av" data-person="${esc(c.author?.id)}">${face(c.author, 28)}</button>`}
      <div><div class="rd-cm-head"><b>${esc(c.me ? user.name : c.author?.name || 'alguém')}</b>${c.me ? '' : badge(c.author)}<span class="muted">· ${esc(timeAgo(c.at))}</span></div><div class="rd-text">${rich(c.text)}</div></div></div>`;
  const paintComments = (art, p) => {
    const box = art.querySelector('.rd-comments');
    box.innerHTML = `${p.comments.map(commentHtml).join('') || '<div class="muted rd-pad" style="padding:6px 0">Nenhum comentário ainda.</div>'}
      <form class="rd-cm-form">${meFace(user, 28)}<input maxlength="400" placeholder="Comentar..." required><button class="btn sm primary">${icon('send', 12)}</button></form>`;
    box.querySelector('form').onsubmit = async (e) => {
      e.preventDefault();
      const inp = e.target.querySelector('input');
      const text = inp.value.trim(); if (!text) return;
      inp.value = '';
      try {
        const c = await api.post(`/rede/posts/${p.id}/comentarios`, { text });
        if (!p.comments.some((x) => x.id === c.id)) { p.comments.push(c); p.commentCount++; }
        paintComments(art, p); updCount(art, p);
        art.querySelector('.rd-cm-form input')?.focus();
      } catch (err) { toast('Erro', err.message, 'error'); }
    };
  };
  const updCount = (art, p) => { art.querySelector('[data-cm] span').textContent = p.commentCount ? n(p.commentCount) : ''; };
  const bindPost = (art, p) => {
    art.querySelector('[data-cm]').onclick = () => {
      const box = art.querySelector('.rd-comments');
      box.hidden = !box.hidden;
      if (!box.hidden) { paintComments(art, p); box.querySelector('input')?.focus(); }
    };
    art.querySelector('[data-like]').onclick = async (e) => {
      const b = e.currentTarget;
      try { const r = await api.post(`/rede/posts/${p.id}/curtir`); p.likes = r.likes; p.liked = r.liked; b.classList.toggle('on', r.liked); b.querySelector('span').textContent = n(r.likes); if (r.liked) b.classList.add('pop'); setTimeout(() => b.classList.remove('pop'), 400); }
      catch (err) { toast('Erro', err.message, 'error'); }
    };
    art.querySelector('[data-del]')?.addEventListener('click', async () => {
      if (!(await confirmDialog('Apagar post', 'O post e os comentários somem da rede.', 'Apagar'))) return;
      await api.del(`/rede/posts/${p.id}`); art.remove(); posts = posts.filter((x) => x.id !== p.id);
    });
    art.querySelector('[data-add]')?.addEventListener('click', (e) => befriend(e.currentTarget.dataset.add));
    art.querySelector('[data-investigate]')?.addEventListener('click', async (e) => {
      try { await api.post(`/mundo/rumores/${e.currentTarget.dataset.investigate}/investigar`); toast('Investigação iniciada 🔎', 'A cada 5 minutos você descobre mais uma pessoa da cadeia.', 'success'); }
      catch (err) { toast('Investigação', err.message, 'info'); }
    });
    art.querySelector('[data-chat]')?.addEventListener('click', (e) => openChat(e.currentTarget.dataset.chat));
    art.querySelector('[data-zoom]')?.addEventListener('click', () => modal({ title: 'Foto', wide: true, body: `<img src="${esc(p.image)}" alt="" style="width:100%;border-radius:12px">` }));
  };
  const prependPost = (p) => {
    const list = body.querySelector('#rdList'); if (!list) return;
    list.querySelector('.rd-empty')?.remove();
    list.insertAdjacentHTML('afterbegin', postHtml(p));
    const art = list.firstElementChild; art.classList.add('rd-in'); bindPost(art, p);
  };
  const paintPosts = (append = false) => {
    const list = body.querySelector('#rdList');
    if (!append) list.innerHTML = '';
    if (!posts.length) { list.innerHTML = `<div class="rd-empty">${icon('globe', 34)}<b>${tab === 'meus' ? 'Você ainda não postou' : tab === 'amigos' ? 'Seus amigos ainda não postaram' : 'O mundo está acordando...'}</b><p class="muted">${tab === 'amigos' ? 'Adicione pessoas da rede para elas aparecerem aqui e no seu chat.' : 'As pessoas postam sozinhas, aos poucos. Toque no raio ⚡ para agitar agora.'}</p></div>`; return; }
    const start = append ? list.children.length : 0;
    list.insertAdjacentHTML('beforeend', posts.slice(start).map(postHtml).join(''));
    [...list.children].slice(start).forEach((art) => bindPost(art, posts.find((x) => x.id === art.dataset.post)));
  };

  // ---------------- pessoas ----------------
  const personCard = (p) => `<div class="rd-person" data-person="${esc(p.id)}" role="button" tabindex="0"><div class="rd-person-top" style="--c:${esc(p.color)}"></div>${face(p, 64)}
      <b>${esc(p.name)}${badge(p)}</b><small class="muted">@${esc(p.handle)}</small><p>${esc(p.bio || '')}</p>
      <div class="rd-person-meta"><span>${p.mood.emoji} ${esc(p.mood.emotion)}</span><span>${n(p.followers)} seguidores</span></div>
      ${p.isNew ? '<span class="chip rd-ev new">novo</span>' : ''}
      ${p.friend ? `<button class="btn sm outline" data-chat="${esc(p.id)}">${icon('send', 12)} Conversar</button>` : `<button class="btn sm primary" data-add="${esc(p.id)}">${icon('plus', 12)} Adicionar</button>`}</div>`;
  const loadPeople = async () => {
    body.innerHTML = `<div class="rd-pfilter">${[['todos', 'Todas'], ['novos', 'Novas'], ['amigos', 'Amigos']].map(([k, l]) => `<button class="chip ${peopleFilter === k ? 'on' : ''}" data-pf="${k}">${l}</button>`).join('')}</div><div class="rd-people" id="rdPeople"><div class="skeleton" style="height:180px"></div></div>`;
    body.querySelectorAll('[data-pf]').forEach((b) => { b.onclick = () => { peopleFilter = b.dataset.pf; loadPeople(); }; });
    const list = await api.get(`/rede/pessoas?filtro=${peopleFilter}&q=${encodeURIComponent(search)}`);
    const box = body.querySelector('#rdPeople');
    box.innerHTML = list.map(personCard).join('') || '<div class="rd-empty"><b>Ninguém encontrado</b></div>';
    bindPeople(box);
  };
  const bindPeople = (root) => {
    root.querySelectorAll('[data-add]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); befriend(b.dataset.add); }; });
    root.querySelectorAll('[data-chat]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); openChat(b.dataset.chat); }; });
  };

  // ---------------- carregamento ----------------
  const load = async (more = false) => {
    if (tab === 'pessoas') { await loadPeople(); return; }
    if (!more) body.innerHTML = `${tab === 'meus' || tab === 'para-voce' ? composerHtml() : ''}<div id="rdAway"></div><div id="rdList"><div class="skeleton" style="height:140px;margin:12px"></div></div><div id="rdMoreBox"></div>`;
    if (!more && body.querySelector('#rdText')) bindComposer(body);
    const before = more && posts.length ? `&before=${encodeURIComponent(posts.at(-1).at)}` : '';
    feed = await api.get(`/rede/feed?tab=${tab}&q=${encodeURIComponent(search)}${before}`);
    posts = more ? [...posts, ...feed.posts] : feed.posts;
    paintPosts(more);
    if (feed.away && !more) {
      body.querySelector('#rdAway').innerHTML = `<div class="rd-away">${icon('clock', 14)} Enquanto você estava fora, a vida continuou: <b>${feed.away.posts} novidades</b> desde ${esc(timeAgo(feed.away.since))}.</div>`;
    }
    body.querySelector('#rdMoreBox').innerHTML = feed.more ? `<button class="rd-more" id="rdMore">Ver mais</button>` : '';
    body.querySelector('#rdMore')?.addEventListener('click', () => load(true));
    paintSide();
  };
  const paintSide = () => {
    if (!feed) return;
    el.querySelector('#rdOnline').innerHTML = `<i class="rd-live"></i> ${n(feed.online)} pessoas acordadas agora · ${feed.people} perfis na sua rede${feed.ai ? '' : ' · modo sem IA'}`;
    el.querySelector('#rdTrends').innerHTML = feed.trends.map((t, i) => `<button class="rd-trend" data-tag="${esc(t.tag)}"><small class="muted">${i + 1} · Em alta</small><b>${esc(t.tag)}</b><small class="muted">${n(t.posts)} posts</small></button>`).join('') || '<div class="muted rd-pad">Ainda sem assuntos em alta.</div>';
    el.querySelector('#rdSugg').innerHTML = feed.suggestions.map((p) => `<div class="rd-sugg" data-person="${esc(p.id)}" role="button" tabindex="0">${face(p, 38)}<div class="grow"><b>${esc(p.name)}${badge(p)}</b><small class="muted">${p.isNew ? 'acabou de chegar · ' : ''}${esc(p.city || '')}</small></div><button class="btn sm primary" data-add="${esc(p.id)}">Adicionar</button></div>`).join('');
    bindPeople(el.querySelector('#rdSugg'));
  };

  // clique em pessoa (qualquer lugar) abre o perfil; clique em #assunto busca
  el.addEventListener('click', (e) => {
    const tag = e.target.closest('[data-tag]');
    if (tag && !tag.closest('[data-tab]')) { search = tag.dataset.tag; el.querySelector('#rdQ').value = search; if (tab === 'pessoas') setTab('para-voce'); else load(); return; }
    const per = e.target.closest('[data-person]');
    if (per && !e.target.closest('[data-add],[data-chat]')) openProfile(per.dataset.person);
  });
  let qTimer;
  el.querySelector('#rdQ').oninput = (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { search = e.target.value.trim(); load(); }, 350); };
  el.querySelector('#rdNow').onclick = async (e) => {
    const b = e.currentTarget; b.disabled = true; b.classList.add('spin');
    try { await api.post('/rede/agora'); if (tab !== 'pessoas') await load(); } catch (err) { toast('Erro', err.message, 'error'); }
    b.disabled = false; b.classList.remove('spin');
  };
  const cfgModal = () => {
    const c = feed?.cfg || { enabled: true, pace: 'normal', photos: true, dms: true };
    modal({
      title: 'Ajustes da Rede',
      body: `<form class="form">
        <label class="switch-row"><span><b>Mundo ativo</b><small>As pessoas vivem, postam e conversam mesmo com a tela fechada.</small></span><span class="switch"><input type="checkbox" name="enabled" ${c.enabled ? 'checked' : ''}><span></span></span></label>
        <div class="field"><label>Ritmo da rede</label><select name="pace">${Object.entries(PACE_LABEL).map(([k, l]) => `<option value="${k}" ${c.pace === k ? 'selected' : ''}>${l}</option>`).join('')}</select><small class="hint">Com IA na nuvem, um ritmo mais agitado gasta mais da cota grátis.</small></div>
        <label class="switch-row"><span><b>Fotos geradas</b><small>Fotos de perfil e de posts criadas por um gerador de imagens gratuito (Pollinations). Ele recebe só a descrição da foto.</small></span><span class="switch"><input type="checkbox" name="photos" ${c.photos ? 'checked' : ''}><span></span></span></label>
        <label class="switch-row"><span><b>Amigos mandam mensagem</b><small>Quem é seu amigo puxa assunto no chat por conta própria (no máximo 2 vezes por dia, das 9h às 22h).</small></span><span class="switch"><input type="checkbox" name="dms" ${c.dms ? 'checked' : ''}><span></span></span></label>
        <div class="form-actions"><button type="button" class="btn outline" data-close>Cancelar</button><button class="btn primary">Salvar</button></div></form>`,
      onMount: (m, close) => {
        m.querySelector('form').onsubmit = async (e) => {
          e.preventDefault();
          const f = e.target;
          try { const cfg = await api.put('/rede/config', { enabled: f.enabled.checked, pace: f.pace.value, photos: f.photos.checked, dms: f.dms.checked }); if (feed) feed.cfg = cfg; close(); toast('Ajustes salvos', '', 'success'); }
          catch (err) { toast('Erro', err.message, 'error'); }
        };
      },
    });
  };
  el.querySelector('#rdCfg').onclick = cfgModal;
  el.querySelector('#rdCfg2').onclick = cfgModal;
  el.querySelector('#rdCompose').onclick = () => { if (!['para-voce', 'meus'].includes(tab)) setTab('para-voce'); setTimeout(() => body.querySelector('#rdText')?.focus(), 200); };

  // ---------------- amizade e perfil ----------------
  async function befriend(pid) {
    try {
      const r = await api.post(`/rede/pessoas/${pid}/amizade`);
      toast('Nova amizade! 🎉', `${r.persona.name} agora está no seu chat.`, 'success');
      el.querySelectorAll(`[data-add="${CSS.escape(pid)}"]`).forEach((b) => { b.outerHTML = `<button class="${b.classList.contains('btn') ? 'btn sm outline' : ''}" data-chat="${esc(pid)}">${icon('send', 12)}<span> Conversar</span></button>`; });
      bindPeople(el);
      el.querySelectorAll(`[data-chat="${CSS.escape(pid)}"]`).forEach((b) => { b.onclick = (e) => { e.stopPropagation(); openChat(pid); }; });
      return r;
    } catch (err) { toast('Não deu para adicionar', err.message, 'error'); return null; }
  }
  async function openChat(pid) {
    try {
      const r = await api.post(`/rede/pessoas/${pid}/amizade`);
      if (r.conversationId) localStorage.setItem('codeniac.conv', r.conversationId);
      location.hash = '#/assistente';
    } catch (err) { toast('Erro', err.message, 'error'); }
  }
  async function openProfile(pid) {
    let p;
    try { p = await api.get(`/rede/pessoas/${pid}`); } catch (err) { toast('Perfil indisponível', err.message, 'error'); return; }
    modal({
      title: p.name, wide: true,
      body: `<div class="rd-prof"><div class="rd-prof-cover" style="--c:${esc(p.color)}"></div>
        <div class="rd-prof-head">${face(p, 92)}<div class="rd-prof-btns">${p.friend ? `<button class="btn sm outline" data-unf>${icon('x', 12)} Desfazer amizade</button><button class="btn sm primary" data-chat="${esc(p.id)}">${icon('send', 12)} Conversar</button>` : `<button class="btn primary" data-add="${esc(p.id)}">${icon('plus', 13)} Adicionar amizade</button>`}</div></div>
        <h3>${esc(p.name)}${badge(p)}</h3><small class="muted">@${esc(p.handle)} · ${p.age} anos · ${esc(p.job)} · ${esc(p.city)}${p.country && p.country !== 'Brasil' ? `, ${esc(p.country)}` : ''}</small>
        <p>${esc(p.bio || '')}</p>
        <div class="rd-prof-stats"><span><b>${n(p.followers)}</b> seguidores</span><span><b>${p.posts}</b> posts</span><span>na rede ${esc(timeAgo(p.since))}</span></div>
        <div class="rd-prof-grid">
          <div class="rd-feel"><small>Como está agora</small><b>${p.mood.emoji} ${esc(p.mood.emotion)}</b>${p.mood.reason ? `<span>${esc(p.mood.reason)}</span>` : ''}</div>
          <div class="rd-feel"><small>Momento de vida</small><b>${esc(p.problem || 'Fase tranquila')}</b><span>Sonho: ${esc(p.goal || '')}</span></div></div>
        <h5>História</h5><p class="muted">${esc(p.story || '')}</p>
        <div class="rd-chips">${(p.interests || []).map((i) => `<span class="chip">${esc(i)}</span>`).join('')}${(p.traits || []).map((t) => `<span class="chip alt">${esc(t)}</span>`).join('')}</div>
        <h5>Memórias recentes</h5><ul class="rd-life">${(p.lifeLog || []).map((l) => `<li><small class="muted">${esc(timeAgo(l.at))}</small> ${esc(l.text)}</li>`).join('')}</ul>
        <h5>Posts</h5><div class="rd-prof-posts">${p.feed.map((x) => `<div class="rd-mini">${x.image ? `<img src="${esc(x.image)}" alt="">` : ''}<span>${rich(x.text)}</span><small class="muted">${esc(timeAgo(x.at))} · ♥ ${n(x.likes)} · 💬 ${x.commentCount}</small></div>`).join('') || '<div class="muted">Nenhum post ainda.</div>'}</div></div>`,
      onMount: (m, close) => {
        m.querySelector('[data-add]')?.addEventListener('click', async () => { if (await befriend(p.id)) { close(); openProfile(p.id); } });
        m.querySelector('[data-chat]')?.addEventListener('click', () => { close(); openChat(p.id); });
        m.querySelector('[data-unf]')?.addEventListener('click', async () => {
          if (!(await confirmDialog('Desfazer amizade', `${p.name} sai do seu chat (as conversas antigas ficam guardadas) e continua vivendo na rede.`, 'Desfazer'))) return;
          await api.del(`/rede/pessoas/${p.id}/amizade`); close(); toast('Amizade desfeita', '', 'info'); load();
        });
      },
    });
  }

  // ---------------- tempo real ----------------
  const off = on('social', (ev) => {
    if (ev.type === 'post' && ['para-voce', 'fotos', 'amigos', 'meus'].includes(tab) && !search) {
      const p = ev.post;
      if (posts.some((x) => x.id === p.id)) return;
      if ((tab === 'fotos' && !p.image && !p.imagePending) || (tab === 'amigos' && !p.me && !p.author?.friend) || (tab === 'meus' && !p.me)) return;
      posts.unshift(p); prependPost(p);
    }
    if (ev.type === 'post-update') {
      const i = posts.findIndex((x) => x.id === ev.post.id);
      const art = body.querySelector(`[data-post="${CSS.escape(ev.post.id)}"]`);
      if (i >= 0 && art) { const open = !art.querySelector('.rd-comments').hidden; posts[i] = ev.post; art.outerHTML = postHtml(ev.post); const nu = body.querySelector(`[data-post="${CSS.escape(ev.post.id)}"]`); bindPost(nu, ev.post); if (open) nu.querySelector('[data-cm]').click(); }
    }
    if (ev.type === 'comment') {
      const p = posts.find((x) => x.id === ev.postId);
      if (!p || p.comments.some((c) => c.id === ev.comment.id)) return;
      p.comments.push(ev.comment); p.commentCount++;
      const art = body.querySelector(`[data-post="${CSS.escape(p.id)}"]`);
      if (art) { updCount(art, p); if (!art.querySelector('.rd-comments').hidden) paintComments(art, p); else art.querySelector('[data-cm]').classList.add('pop'); }
    }
    if (ev.type === 'like') {
      const p = posts.find((x) => x.id === ev.postId);
      const art = p && body.querySelector(`[data-post="${CSS.escape(p.id)}"] [data-like] span`);
      if (p) { p.likes = ev.likes; if (art) art.textContent = n(ev.likes); }
    }
    if (ev.type === 'persona' && ev.persona.avatar) {
      el.querySelectorAll(`[data-face="${CSS.escape(ev.persona.id)}"]`).forEach((f) => { if (f.tagName !== 'IMG') f.outerHTML = face(ev.persona, parseInt(f.style.width, 10) || 42); });
    }
  });
  const clock = setInterval(() => { if (feed && tab !== 'pessoas') api.get('/rede/feed?tab=para-voce').then((f) => { feed = { ...feed, ...f, posts: feed.posts }; paintSide(); }).catch(() => {}); }, 60000);

  setTab(tab);
  return () => { off(); clearInterval(clock); clearTimeout(qTimer); };
}
