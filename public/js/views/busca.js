// Busca (2.0): pesquisa estilo Google em que a IA cria na hora os próprios sites com a resposta.
// Os "sites" chegam como dados (títulos, seções, listas) e são desenhados aqui; nenhum HTML vindo da IA é executado.
import { api } from '../api.js';
import { icon } from '../icons.js';
import { esc, timeAgo, toast } from '../ui.js';

const box = (q = '') => `<form class="bx-form" id="bxForm" role="search">${icon('search', 18)}<input name="q" value="${esc(q)}" maxlength="200" placeholder="Pesquise qualquer coisa" autocomplete="off" aria-label="Pesquisar"><button class="btn primary sm">Pesquisar</button></form>`;
const fav = (s, size = 30) => `<span class="bx-fav" style="--c:${esc(s.color)};width:${size}px;height:${size}px">${esc((s.name || '?')[0].toUpperCase())}</span>`;
const safe = (u) => (/^https?:\/\//i.test(String(u || '')) ? u : '#');
const paras = (t) => String(t || '').split(/\n{2,}|\n/).map((x) => x.trim()).filter(Boolean).map((x) => `<p>${esc(x)}</p>`).join('');

export function searchBoxHtml() {
  return `<form class="gsearch" id="gSearch" role="search"><span class="gs-mark">${icon('sparkles', 16)}</span><input name="q" maxlength="200" placeholder="Pesquise qualquer coisa…" title="A IA pesquisa na web e cria sites com a resposta" autocomplete="off" aria-label="Pesquisar"><button class="gs-go" aria-label="Pesquisar">${icon('search', 16)}</button></form>`;
}
export function bindSearchBox(root) {
  const f = root.querySelector('#gSearch');
  if (f) f.onsubmit = (e) => { e.preventDefault(); const q = f.q.value.trim(); if (q) location.hash = `#/busca?q=${encodeURIComponent(q)}`; };
}

export default async function render(el, parts = [], query = new URLSearchParams()) {
  const bindForm = () => {
    const f = el.querySelector('#bxForm');
    if (f) f.onsubmit = (e) => { e.preventDefault(); const q = f.q.value.trim(); if (q) location.hash = `#/busca?q=${encodeURIComponent(q)}`; };
  };

  // ---------- página de um site gerado ----------
  if (parts[0] && parts[1]) {
    el.innerHTML = `<div class="bx-browser"><div class="bx-chrome"><a class="icon-btn sm ghost" href="#/busca/${esc(parts[0])}" title="Voltar">${icon('chevLeft', 16)}</a><div class="bx-url">${icon('shield', 12)}<span id="bxUrl">carregando...</span></div></div>
      <div class="bx-page" id="bxPage"><div class="bx-loading"><span class="typing"><i></i><i></i><i></i></span> A IA está escrevendo este site...</div></div></div>`;
    let tries = 0;
    const paint = async () => {
      let data;
      try { data = await api.get(`/busca/${encodeURIComponent(parts[0])}/sites/${encodeURIComponent(parts[1])}`); }
      catch (err) { el.querySelector('#bxPage').innerHTML = `<div class="empty-state"><b>Página indisponível</b><p>${esc(err.message)}</p><a class="btn outline" href="#/busca/${esc(parts[0])}">Voltar aos resultados</a></div>`; return; }
      const { site } = data; const pg = site.page;
      el.querySelector('#bxUrl').textContent = `${site.domain}/${(pg.title || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').slice(0, 50)}`;
      const page = el.querySelector('#bxPage');
      page.style.setProperty('--sc', site.color);
      page.innerHTML = `<header class="bx-site-head">${fav(site, 34)}<b>${esc(site.name)}</b><nav>${(pg.menu || []).map((m) => `<span>${esc(m)}</span>`).join('')}</nav></header>
        <div class="bx-hero ${pg.image ? 'img' : ''}" ${pg.image ? `style="background-image:url('${esc(pg.image)}')"` : ''}><div><small>${esc(site.style || '')}</small><h1>${esc(pg.title)}</h1>${pg.subtitle ? `<p>${esc(pg.subtitle)}</p>` : ''}${pg.author ? `<span class="bx-by">por ${esc(pg.author)}</span>` : ''}</div></div>
        <article class="bx-article">${pg.highlight ? `<blockquote>${esc(pg.highlight)}</blockquote>` : ''}
          ${(pg.sections || []).map((s) => `<section>${s.title ? `<h2>${esc(s.title)}</h2>` : ''}${paras(s.text)}${s.items?.length ? `<ul>${s.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}</section>`).join('')}
          ${pg.comments?.length ? `<section class="bx-comments"><h2>Comentários</h2>${pg.comments.map((c) => `<div><b>${esc(c.name || 'Visitante')}</b><p>${esc(c.text)}</p></div>`).join('')}</section>` : ''}
          ${pg.sources?.length ? `<footer class="bx-sources"><h3>Fontes reais consultadas</h3>${pg.sources.map((s) => `<a href="${esc(safe(s.url))}" target="_blank" rel="noopener noreferrer">${icon('link', 12)} ${esc(s.titulo || s.url)}</a>`).join('')}</footer>` : ''}
          <p class="bx-disclaimer">Site gerado pela IA do seu hub a partir da pesquisa. Confira as fontes antes de decisões importantes.</p></article>`;
      // a foto do topo chega alguns segundos depois
      if (!pg.image && pg.photo && tries++ < 4) setTimeout(() => { if (document.body.contains(page)) paint(); }, 15000);
    };
    await paint();
    return;
  }

  // ---------- resultados ----------
  const q = query.get('q') || '';
  el.innerHTML = `<div class="bx"><div class="bx-top"><h1 class="bx-logo">${icon('sparkles', 26)} Busca</h1>${box(q)}</div><div id="bxRes"></div></div>`;
  bindForm();
  const res = el.querySelector('#bxRes');

  const paintResults = (s) => {
    res.innerHTML = `<p class="muted bx-meta">${s.sites.length} sites criados para “${esc(s.q)}” · ${esc(timeAgo(s.at))}</p>
      ${s.answer ? `<div class="bx-answer">${icon('sparkles', 15)}<div>${paras(s.answer)}</div></div>` : ''}
      <div class="bx-list">${s.sites.map((x) => `<a class="bx-item" href="#/busca/${esc(s.id)}/${esc(x.id)}"><div class="bx-item-top">${fav(x)}<div><b>${esc(x.name)}</b><small>${esc(x.domain)}</small></div></div>
        <h3>${esc(x.title)}</h3><p>${esc(x.snippet)}</p>${x.style ? `<span class="chip">${esc(x.style)}</span>` : ''}</a>`).join('')}</div>
      ${s.sources?.length ? `<div class="bx-real"><h4>Fontes reais encontradas na web</h4>${s.sources.map((r) => `<a href="${esc(safe(r.url))}" target="_blank" rel="noopener noreferrer">${esc(r.titulo || r.url)}</a>`).join('')}</div>` : ''}`;
  };
  const paintHistory = async () => {
    const list = await api.get('/busca').catch(() => []);
    res.innerHTML = list.length ? `<div class="bx-hist"><h4>Pesquisas recentes</h4>${list.map((h) => `<a href="#/busca/${esc(h.id)}">${icon('clock', 13)} ${esc(h.q)} <small class="muted">${esc(timeAgo(h.at))}</small></a>`).join('')}</div>`
      : '<p class="muted bx-meta">Digite algo acima. A IA pesquisa na web e cria sites próprios com a resposta.</p>';
  };

  if (parts[0]) {
    try { paintResults(await api.get(`/busca/${encodeURIComponent(parts[0])}`)); } catch (err) { res.innerHTML = `<div class="empty-state"><b>Pesquisa não encontrada</b><p>${esc(err.message)}</p></div>`; }
  } else if (q) {
    res.innerHTML = `<div class="bx-loading"><span class="typing"><i></i><i></i><i></i></span> Pesquisando e criando os sites...</div>`;
    try {
      const s = await api.post('/busca', { q });
      history.replaceState(null, '', `#/busca/${s.id}`);
      paintResults(s);
    } catch (err) { res.innerHTML = `<div class="empty-state"><b>Não deu para pesquisar</b><p>${esc(err.message)}</p></div>`; toast('Busca', err.message, 'error'); }
  } else await paintHistory();
  setTimeout(() => { if (!q && !parts[0]) el.querySelector('#bxForm input')?.focus(); }, 50);
}
