// Acontecimentos — tudo o que acontece na cidade (eventos reais do motor do mundo), com filtros por categoria,
// busca, paginação e o LIVE da cidade ao lado.
import { shell, bindEntities, evRow, api, esc, icon, CAT_COLOR, CAT_LABEL } from '../world/wui.js';
import { livePanel } from '../world/live.js';

export default async function render(el) {
  const body = shell(el, 'acontecimentos', { title: 'Acontecimentos', sub: 'Tudo o que os moradores, empresas, organizações e autoridades fizeram — em ordem, com causa e consequência.' });
  bindEntities(body);
  let cat = ''; let q = ''; let list = []; let more = false;
  body.innerHTML = `<div class="ac">
    <section class="ac-main">
      <div class="ac-tools cx-card"><label class="cx-search ac-q">${icon('search', 15)}<input id="acQ" placeholder="Buscar acontecimento" aria-label="Buscar"></label>
        <div class="sh-chips" id="acCats"><button data-cat="" class="on">Tudo</button>${Object.entries(CAT_LABEL).map(([k, l]) => `<button data-cat="${k}" style="--c:${CAT_COLOR[k]}"><i class="ac-dot" style="background:${CAT_COLOR[k]}"></i>${l}</button>`).join('')}</div></div>
      <div class="cx-card ac-list" id="acList"><div class="skeleton" style="height:300px"></div></div>
      <button class="cx-btn ghost ac-more" id="acMore" hidden>Carregar mais</button>
    </section>
    <aside class="cx-card ac-live" id="acLive"></aside></div>`;
  const stop = livePanel(body.querySelector('#acLive'), { scope: 'cidade', title: 'Live da Cidade', art: '/assets/pixel/scene-cidade.png', n: 16 });
  const box = body.querySelector('#acList'); const moreBtn = body.querySelector('#acMore');
  const load = async (append = false) => {
    const qs = new URLSearchParams({ limite: '40' });
    if (cat) qs.set('cat', cat); if (q) qs.set('q', q);
    if (append && list.length) qs.set('antes', list.at(-1).at);
    const r = await api.get(`/mundo/eventos?${qs}`);
    list = append ? [...list, ...r.events] : r.events; more = r.more;
    let day = '';
    box.innerHTML = list.map((e) => { const d = new Date(e.at).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }); const h = d !== day ? `<h4 class="ac-day">${esc(d)}</h4>` : ''; day = d; return h + evRow(e); }).join('') || '<p class="cx-mut">Nada encontrado.</p>';
    moreBtn.hidden = !more;
  };
  body.querySelectorAll('[data-cat]').forEach((b) => { b.onclick = () => { cat = b.dataset.cat; body.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('on', x === b)); load(); }; });
  let t; body.querySelector('#acQ').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { q = e.target.value.trim(); load(); }, 300); };
  moreBtn.onclick = () => load(true);
  await load();
  return () => stop();
}
