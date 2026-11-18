// 09 · WORLD ARCHIVE — a memória coletiva: linha do tempo, biografias, histórias e "pergunte ao arquivo".
import { shell, face, bindEntities, evRow, companyCard, personCard, api, esc, timeAgo, icon, toast } from '../world/wui.js';

export default async function render(el, parts = [], query = new URLSearchParams()) {
  const body = shell(el, 'arquivo', { title: 'World Archive', sub: 'Tudo o que aconteceu em Codeniac Society, em ordem. Nada é apagado: o que importa fica.' });
  bindEntities(body);
  if (parts[0] && parts[1]) return entity(body, parts[0], parts[1]);
  let cat = query.get('cat') || ''; let q = query.get('q') || ''; const story = query.get('historia') || '';
  let events = []; let more = false;
  body.innerHTML = `<form class="w-panel a-ask" id="aAsk"><b>${icon('sparkles', 15)} Pergunte ao arquivo</b><div><input name="q" maxlength="300" placeholder="Ex.: Por que a NovaTech entrou em crise? · Quem é a prefeita? · O que aconteceu com a Marina?"><button class="btn primary">Perguntar</button></div><div id="aAnswer"></div></form>
    <div class="a-tools"><input id="aQ" value="${esc(q)}" placeholder="Filtrar por palavra"><div class="w-filters" id="aCats"></div></div>${story ? `<p class="muted">Mostrando uma história (sequência de acontecimentos ligados). <a href="#/arquivo">Ver tudo</a></p>` : ''}
    <div id="aList" class="a-list"></div><div id="aMore"></div>`;
  const list = body.querySelector('#aList');
  const load = async (append = false) => {
    const before = append && events.length ? `&antes=${encodeURIComponent(events.at(-1).at)}` : '';
    const d = await api.get(`/mundo/eventos?limite=40${cat ? `&cat=${cat}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}${story ? `&historia=${story}` : ''}${before}`);
    events = append ? [...events, ...d.events] : d.events; more = d.more;
    body.querySelector('#aCats').innerHTML = `<button class="w-chip ${!cat ? 'on' : ''}" data-c="">Tudo (${d.total})</button>${Object.entries(d.cats).map(([k, l]) => `<button class="w-chip ${cat === k ? 'on' : ''}" data-c="${k}">${esc(l)}</button>`).join('')}`;
    body.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => { cat = b.dataset.c; load(); }; });
    let lastDay = '';
    list.innerHTML = events.map((e) => { const day = new Date(e.at).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }); const h = day !== lastDay ? `<h4 class="a-day">${esc(day)}</h4>` : ''; lastDay = day; return `${h}<div class="a-item">${evRow(e)}${e.storyId ? `<a class="a-story" href="#/arquivo?historia=${esc(e.storyId)}">ver a história</a>` : ''}</div>`; }).join('') || '<p class="muted">Nada no arquivo com esse filtro.</p>';
    body.querySelector('#aMore').innerHTML = more ? '<button class="btn outline" id="aMoreBtn">Carregar mais antigos</button>' : '';
    body.querySelector('#aMoreBtn')?.addEventListener('click', () => load(true));
  };
  let t;
  body.querySelector('#aQ').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { q = e.target.value.trim(); load(); }, 350); };
  body.querySelector('#aAsk').onsubmit = async (e) => {
    e.preventDefault();
    const out = body.querySelector('#aAnswer');
    out.innerHTML = '<div class="skeleton" style="height:60px;margin-top:10px"></div>';
    try {
      const r = await api.post('/mundo/perguntar', { q: e.target.q.value });
      out.innerHTML = `<div class="a-answer"><p>${esc(r.answer)}</p>${r.events?.length ? `<details><summary>${r.events.length} registro(s) usados</summary>${r.events.map((x) => evRow(x, { compact: true })).join('')}</details>` : ''}</div>`;
    } catch (err) { out.innerHTML = ''; toast('Erro', err.message, 'error'); }
  };
  await load();
  return () => clearTimeout(t);
}

async function entity(body, tipo, id) {
  const d = await api.get(`/mundo/historia/${encodeURIComponent(tipo)}/${encodeURIComponent(id)}`);
  const e = d.entity;
  const title = e.name || 'Registro';
  body.innerHTML = `<a class="w-back" href="#/arquivo">${icon('chevLeft', 14)} Arquivo</a>
    <div class="w-panel a-bio">${tipo === 'persona' ? face(e, 72) : `<span class="w-co-logo big" style="--c:${esc(e.color || '#64748b')}">${esc(title[0])}</span>`}<div class="grow"><small class="muted">${{ persona: 'Biografia', company: 'História da empresa', club: 'História do clube', district: 'História do bairro' }[tipo] || ''}</small><h2>${esc(title)}</h2>
      ${tipo === 'persona' && !e.gone ? `<p>${esc(e.job || '')} · ${esc(e.city || '')} · ${e.age} anos</p><p class="muted">${esc(e.story || '')}</p><button class="btn sm outline" id="aOpen">Ficha completa</button>` : ''}
      ${tipo === 'company' ? `<p>${esc(e.sectorLabel || '')} · ${esc(e.status)} · ${e.origin === 'genese' ? 'existe desde a gênese' : `fundada em ${new Date(e.foundedAt).toLocaleDateString('pt-BR')}`}${e.closedAt ? ` · fechou em ${new Date(e.closedAt).toLocaleDateString('pt-BR')}` : ''}</p><button class="btn sm outline" id="aOpen">Ficha da empresa</button>` : ''}
      ${e.gone ? '<p class="muted">Essa pessoa saiu da cidade. O que ela viveu continua registrado.</p>' : ''}</div></div>
    <h3 class="w-h3">Linha do tempo (${d.events.length})</h3><div class="a-list">${d.events.map((x) => `<div class="a-item">${evRow(x)}${x.storyId ? `<a class="a-story" href="#/arquivo?historia=${esc(x.storyId)}">ver a história</a>` : ''}</div>`).join('') || '<p class="muted">Nenhum acontecimento registrado ainda.</p>'}</div>`;
  body.querySelector('#aOpen')?.addEventListener('click', () => (tipo === 'persona' ? personCard(e.id) : companyCard(e.id)));
}
