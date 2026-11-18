// 03 · INTERNET — navegador interno: busca dentro do mundo, diretório e sites com identidade própria.
// Os sites são desenhados aqui a partir de dados do mundo (nenhum HTML vindo de IA é executado).
import { shell, face, nx, pct, spark, bindEntities, evRow, CAT_COLOR, CAT_LABEL, api, esc, timeAgo, icon, toast } from '../world/wui.js';

const KIND = { noticias: 'Portal de notícias', tech: 'Tecnologia e inovação', cripto: 'Mercado e cripto', empregos: 'Vagas de emprego', loja: 'Comércio eletrônico', forum: 'Discussões públicas', blog: 'Blogs pessoais', tv: 'TV e rádio', empresa: 'Site da empresa' };
const paras = (t) => String(t || '').split(/\n{2,}|\n/).map((x) => x.trim()).filter(Boolean).map((x) => `<p>${esc(x)}</p>`).join('');

export default async function render(el, parts = [], query = new URLSearchParams()) {
  const body = shell(el, 'internet');
  const url = parts[0] === 'site' ? `${parts[1]}` : parts[0] === 'artigo' ? 'artigo' : parts[0] === 'busca' ? `nexus.search/?q=${query.get('q') || ''}` : 'nexus.search';
  body.innerHTML = `<div class="i-browser"><div class="i-chrome"><button class="icon-btn sm ghost" id="iBack" aria-label="Voltar">${icon('chevLeft', 15)}</button><a class="icon-btn sm ghost" href="#/internet" aria-label="Início">${icon('dashboard', 14)}</a>
      <form class="i-url" id="iUrl">${icon('shield', 12)}<input name="u" value="${esc(url)}" aria-label="Endereço ou busca" autocomplete="off"></form></div><div class="i-page" id="iPage"><div class="skeleton" style="height:240px;margin:16px"></div></div></div>`;
  const page = body.querySelector('#iPage');
  body.querySelector('#iBack').onclick = () => history.back();
  body.querySelector('#iUrl').onsubmit = (e) => {
    e.preventDefault();
    const v = e.target.u.value.trim();
    if (/^[\w-]+\.nx(\/.*)?$/i.test(v)) location.hash = `#/internet/site/${v.split('/')[0].toLowerCase()}`;
    else if (v && v !== 'nexus.search') location.hash = `#/internet/busca?q=${encodeURIComponent(v.replace(/^nexus\.search\/\?q=/, ''))}`;
  };
  bindEntities(body);
  try {
    if (parts[0] === 'site' && parts[1]) await site(page, parts[1]);
    else if (parts[0] === 'artigo' && parts[1]) await article(page, parts[1]);
    else await home(page, query.get('q') || '');
  } catch (err) { page.innerHTML = `<div class="i-404"><b>Não foi possível abrir</b><p>${esc(err.message)}</p><a class="btn outline" href="#/internet">Voltar à busca</a></div>`; }
}

async function home(page, q) {
  const sites = await api.get('/mundo/internet/sites');
  page.innerHTML = `<div class="i-search ${q ? 'top' : ''}"><h1 class="i-logo">nexus<b>search</b></h1><form id="iQ"><input name="q" value="${esc(q)}" placeholder="Pesquise pessoas, empresas, notícias, produtos…" autocomplete="off"><button class="btn primary">${icon('search', 15)}</button></form>
      <small class="muted">Busca na internet de Codeniac Society. Quer a web real? <a href="#/busca${q ? `?q=${encodeURIComponent(q)}` : ''}">Pesquise com a IA</a>.</small></div><div id="iRes"></div>`;
  page.querySelector('#iQ').onsubmit = (e) => { e.preventDefault(); const v = e.target.q.value.trim(); if (v) location.hash = `#/internet/busca?q=${encodeURIComponent(v)}`; };
  const res = page.querySelector('#iRes');
  if (!q) {
    res.innerHTML = `<h3 class="w-h3">Sites da cidade</h3><div class="i-dir">${sites.map((s) => `<a class="i-site-card ${s.status === 'falida' ? 'off' : ''}" href="#/internet/site/${esc(s.domain)}" style="--c:${esc(s.color)}"><span class="i-fav">${esc(s.name[0])}</span><b>${esc(s.name)}</b><small>${esc(s.domain)}</small><small class="muted">${esc(KIND[s.kind] || s.sectorLabel || '')}${s.status === 'falida' ? ' · fora do ar' : ''}</small></a>`).join('')}</div>`;
    return;
  }
  const r = await api.get(`/mundo/internet?q=${encodeURIComponent(q)}`);
  const total = Object.values(r).reduce((s, v) => s + v.length, 0);
  res.innerHTML = `<p class="muted i-meta">${total} resultado(s) para “${esc(q)}” na internet da cidade</p>
    ${r.sites.map((s) => `<a class="i-r" href="#/internet/site/${esc(s.domain)}"><small>${esc(s.domain)}</small><b>${esc(s.name)}</b><p>${esc(s.slogan || KIND[s.kind] || '')}</p></a>`).join('')}
    ${r.articles.map((a) => `<a class="i-r" href="#/internet/artigo/${esc(a.id)}"><small>${esc(a.site?.domain || '')} › ${esc(a.blog ? 'blog' : CAT_LABEL[a.cat] || a.cat)} · ${esc(timeAgo(a.at))}</small><b>${esc(a.title)}</b><p>${esc(a.lead)}</p></a>`).join('')}
    ${r.people.length ? `<h4>Pessoas</h4><div class="w-rels">${r.people.map((p) => `<button class="w-rel" data-person="${esc(p.id)}">${face(p, 28)}<span>${esc(p.name)}</span><small>${esc(p.job || '')}</small></button>`).join('')}</div>` : ''}
    ${r.companies.length ? `<h4>Empresas</h4><div class="w-chips">${r.companies.map((c) => `<button class="w-chip" data-company="${esc(c.id)}">${esc(c.name)} · ${esc(c.status)}</button>`).join('')}</div>` : ''}
    ${r.communities.length ? `<h4>Comunidades</h4>${r.communities.map((c) => `<a class="i-r" href="#/social/comunidades/${esc(c.id)}"><small>forumcentral.nx › ${esc(c.name)}</small><b>${esc(c.name)}</b><p>${c.members} membros</p></a>`).join('')}` : ''}
    ${r.products.length ? `<h4>Produtos</h4>${r.products.map((p) => `<a class="i-r" href="#/internet/site/vitrine.nx"><small>vitrine.nx › ${esc(p.company)}</small><b>${esc(p.name)}</b><p>${nx(p.price)}</p></a>`).join('')}` : ''}
    ${!total ? `<div class="i-404"><b>Nada encontrado na internet da cidade.</b><p><a href="#/busca?q=${encodeURIComponent(q)}">Pesquisar na web real com a IA</a></p></div>` : ''}`;
}

async function site(page, domain) {
  const d = await api.get(`/mundo/internet/site/${encodeURIComponent(domain)}`);
  const s = d.site;
  page.style.setProperty('--sc', s.color);
  if (d.offline) {
    page.innerHTML = `<div class="i-404"><b>${esc(s.domain)} está fora do ar</b><p>A ${esc(s.name)} faliu ${d.closedAt ? `em ${new Date(d.closedAt).toLocaleDateString('pt-BR')}` : ''}. O que o arquivo registra:</p>${d.history.map((e) => evRow(e, { compact: true })).join('')}</div>`;
    return;
  }
  const c = d.company;
  const ads = d.ads.length ? `<aside class="i-ads"><small>Publicidade</small>${d.ads.map((a) => `<a href="#/internet/site/${esc(a.domain)}">${esc(a.text)}</a>`).join('')}</aside>` : '';
  const head = `<header class="i-site-head i-${esc(s.kind)}"><span class="i-fav big">${esc(s.name[0])}</span><div><b>${esc(s.name)}</b><small>${esc(s.slogan || KIND[s.kind] || '')}</small></div><nav><a href="#/internet/site/${esc(s.domain)}">Início</a><button class="w-link" data-company="${esc(c.id)}">Sobre</button></nav></header>`;
  let main = '';
  if (['noticias', 'tech', 'blog'].includes(s.kind) || (s.kind === 'cripto' && d.articles.length)) {
    const [lead, ...rest] = d.articles;
    main = lead ? `<a class="i-lead" href="#/internet/artigo/${esc(lead.id)}" style="--c:${CAT_COLOR[lead.cat] || 'var(--sc)'}"><small>${esc(CAT_LABEL[lead.cat] || lead.cat || '')} · ${esc(timeAgo(lead.at))}</small><h2>${esc(lead.title)}</h2><p>${esc(lead.lead)}</p>${lead.author ? `<small>por ${esc(lead.author.name)}</small>` : ''}</a>
      <div class="i-list">${rest.map((a) => `<a href="#/internet/artigo/${esc(a.id)}"><small>${esc(timeAgo(a.at))}${a.author ? ` · ${esc(a.author.name)}` : ''}</small><b>${esc(a.title)}</b><p>${esc(a.lead)}</p><small class="muted">💬 ${a.comments}</small></a>`).join('')}</div>`
      : '<p class="muted i-pad">Nenhuma publicação ainda. As matérias aparecem quando algo importante acontece na cidade.</p>';
  }
  if (s.kind === 'cripto') main = `<div class="i-market">${d.market.map((m) => `<button class="i-mk" data-company="${esc(m.id)}"><b>${esc(m.ticker)}</b><span>${esc(m.name)}</span><span>${nx(m.price)}</span><em class="${m.change >= 0 ? 'up' : 'down'}">${pct(m.change)}</em></button>`).join('')}</div>${main}`;
  if (s.kind === 'loja') main = `<div class="i-shop">${d.products.map((p) => `<div class="i-prod"><div class="i-prod-img" style="--h:${(p.name.length * 47) % 360}">${icon('bag', 26)}</div><b>${esc(p.name)}</b><small>${esc(p.company)}</small><span>${nx(p.price)}</span><button class="btn sm primary" data-buy="${esc(p.companyId)}|${esc(p.id)}">Comprar</button></div>`).join('') || '<p class="muted">Sem produtos.</p>'}</div>`;
  if (s.kind === 'empregos') main = `<h2 class="i-pad">Vagas abertas em Codeniac Society</h2>${d.openings.map((o) => `<div class="w-row i-job"><span><b>${esc(o.role)}</b> · <button class="w-link" data-company="${esc(o.companyId)}">${esc(o.company)}</button> <small class="muted">${nx(o.salary, 0)}/dia · ${esc(timeAgo(o.at))}</small></span><a class="btn sm outline" href="#/economia/carreira">Candidatar</a></div>`).join('') || '<p class="muted i-pad">Nenhuma vaga aberta agora.</p>'}`;
  if (s.kind === 'forum') main = `<h2 class="i-pad">Comunidades</h2>${d.communities.map((x) => `<a class="i-r" href="#/social/comunidades/${esc(x.id)}"><b>${esc(x.name)}</b><small>${x.members} membros</small>${x.threads.map((t) => `<p>• ${esc(t)}</p>`).join('')}</a>`).join('')}`;
  if (s.kind === 'tv') main = `<div class="i-pad"><h2>Grupo Nexus de Comunicação</h2><p>TV, rádio e entretenimento da cidade.</p><a class="btn primary" href="#/midia/tv">${icon('play', 13)} Assistir e ouvir agora</a></div>`;
  if (s.kind === 'empresa' || !main) {
    main = `<div class="i-about"><h2>${esc(c.name)}</h2><p>${esc(c.slogan || '')}</p><p>Setor: ${esc(c.sectorLabel)} · ${c.employees} funcionário(s) · CEO: ${c.ceo ? `<a class="w-link" data-person="${esc(c.ceo.id)}">${esc(c.ceo.name)}</a>` : '—'}</p>
      ${c.products.length ? `<h3>Nossos produtos</h3><div class="w-chips">${c.products.map((p) => `<span class="w-chip">${esc(p.name)} · ${nx(p.price)}</span>`).join('')}</div>` : ''}
      ${c.openingList.length ? `<h3>Trabalhe conosco</h3>${c.openingList.map((o) => `<div class="w-row"><span>${esc(o.role)} · ${nx(o.salary, 0)}/dia</span><a class="btn sm outline" href="#/economia/carreira">Candidatar</a></div>`).join('')}` : ''}
      <h3>Equipe</h3><div class="w-rels">${c.staff.slice(0, 10).map((p) => `<button class="w-rel" ${p.id !== 'me' ? `data-person="${esc(p.id)}"` : ''}>${face(p, 26)}<span>${esc(p.name)}</span><small>${esc(p.role)}</small></button>`).join('')}</div>
      <h3>Investidores</h3><p>Ação ${esc(c.ticker)}: <b>${nx(c.price)}</b> ${spark((c.priceHistory || []).map((x) => x.v), { w: 200, h: 36 })}</p></div>`;
  }
  page.innerHTML = `<div class="i-site i-${esc(s.kind)}">${head}<div class="i-site-body"><main>${main}</main>${ads}</div><footer class="i-foot">© ${esc(s.name)} · ${esc(s.domain)} · site da internet de Codeniac Society</footer></div>`;
  page.querySelectorAll('[data-buy]').forEach((b) => { b.onclick = async () => { const [cid, pid] = b.dataset.buy.split('|'); try { const r = await api.post(`/mundo/loja/${cid}/${pid}`); toast('Comprado 🛍️', `Saldo: ${nx(r.balance)}`, 'success'); } catch (err) { toast('Não deu', err.message, 'error'); } }; });
}

async function article(page, id) {
  const a = await api.get(`/mundo/internet/artigo/${encodeURIComponent(id)}`);
  const s = a.site || { name: '', domain: '', color: '#3b82f6' };
  page.style.setProperty('--sc', s.color);
  body(page);
  function body(p) {
    p.innerHTML = `<div class="i-site"><header class="i-site-head"><span class="i-fav big">${esc(s.name[0] || '?')}</span><div><b>${esc(s.name)}</b><small>${esc(s.domain)}</small></div><nav><a href="#/internet/site/${esc(s.domain)}">Início</a></nav></header>
      <article class="i-article"><small class="i-cat" style="--c:${CAT_COLOR[a.cat] || 'var(--sc)'}">${esc(CAT_LABEL[a.cat] || a.cat)}</small><h1>${esc(a.title)}</h1>${a.lead ? `<p class="i-sub">${esc(a.lead)}</p>` : ''}
        <small class="muted">${a.author ? `Por <a class="w-link" data-person="${esc(a.author.id)}">${esc(a.author.name)}</a> · ` : ''}${new Date(a.at).toLocaleString('pt-BR')} · ${a.views} leituras${a.ai ? ' · texto reescrito pela IA a partir dos fatos' : ''}</small>
        <div class="i-text">${paras(a.body)}</div>
        ${a.events?.length ? `<aside class="i-facts"><b>Fatos registrados no arquivo</b>${a.events.map((e) => evRow(e, { compact: true })).join('')}</aside>` : ''}
        <section class="i-comments"><h3>Comentários (${a.comments.length})</h3>${a.comments.map((c) => `<div class="w-cm">${face(c.author, 26)}<div><small>${c.author?.me ? '<b>Você</b>' : `<a class="w-link" data-person="${esc(c.author?.id)}">${esc(c.author?.name || '')}</a>`} · ${esc(timeAgo(c.at))}</small><p>${esc(c.text)}</p></div></div>`).join('')}
          <form class="w-cm-form" id="iCm"><input maxlength="600" placeholder="Comente esta matéria" required><button class="btn sm primary">${icon('send', 12)}</button></form></section></article></div>`;
    p.querySelector('#iCm').onsubmit = async (e) => { e.preventDefault(); try { await api.post(`/mundo/internet/artigo/${a.id}/comentar`, { text: e.target.querySelector('input').value }); a.comments.push({ author: { me: true, name: 'Você' }, text: e.target.querySelector('input').value, at: new Date().toISOString() }); body(p); } catch (err) { toast('Erro', err.message, 'error'); } };
  }
}
