// Construtora Nexus — catálogo de tudo o que dá para colocar na cidade: prédios, relevo, natureza, mobiliário
// urbano, sinalização, veículos, fachadas, obras e pisos (ruas, calçadas, terra, areia, rios). Uso livre:
// "Usar no mapa" abre o modo Reforma já com o item escolhido.
import { shell, api, esc, icon } from '../world/wui.js';

export default async function render(el) {
  const body = shell(el, 'construtora');
  let d = null; let cat = 'predios'; let q = '';
  const kindTxt = (it) => (it.kind === 'floor' ? 'piso · bloco 32×32' : it.kind === 'bld' ? `construção · ${it.w}×${it.h}` : it.kind === 'decal' ? 'peça no chão' : it.solid ? 'objeto sólido' : 'decoração');
  const card = (it) => `<article class="ob-item ${it.placed ? 'has' : ''}">
      <div class="ob-art">${it.img ? `<img src="${esc(it.img)}" alt="" loading="lazy">` : `<i class="ob-floor" style="--c:${esc(it.color)}"></i>`}${it.placed ? `<span class="ob-have">${it.placed} no mapa</span>` : ''}</div>
      <b>${esc(it.name)}</b><small class="cx-mut">${kindTxt(it)}</small>
      <a class="cx-btn sm ob-use" href="#/mapa?reforma=1&item=${encodeURIComponent(it.key)}">${icon('map', 13)} Usar no mapa</a>
    </article>`;
  const draw = () => {
    const list = d.items.filter((it) => (q ? it.name.toLowerCase().includes(q) : it.cat === cat));
    body.innerHTML = `<div class="ob">
      <header class="cx-card ob-head"><span class="cx-h-ic" style="--c:#f59e0b">${icon('building', 18)}</span>
        <div><h1>Construtora Nexus</h1><p class="cx-mut">${d.items.length} itens liberados para usar: prédios, relevo, rios, árvores, ruas, pisos e decoração. Toque em <b>Usar no mapa</b> ou abra o modo <b>Reforma</b> e escolha na paleta.</p></div>
        <a class="cx-btn" href="#/mapa?reforma=1">${icon('map', 14)} Abrir modo Reforma</a></header>
      <section class="cx-card ob-exp"><div><h3>${icon('layers', 15)} Mapa: ${esc(d.shapes.find((s) => s.key === d.shape)?.label || d.shape)}</h3>
        <p class="cx-mut">O terreno em volta da cidade tem costa recortada, ilhas, lagos e muito espaço livre para construir. O formato pode ser trocado no modo Reforma (botão ◯ Formato). ${d.stats.placed} itens e blocos de piso colocados, ${d.stats.demolished} demolições.</p></div></section>
      <div class="ob-bar"><div class="sh-chips">${d.cats.map(([k, l]) => `<button data-cat="${k}" class="${!q && cat === k ? 'on' : ''}">${l} (${d.items.filter((it) => it.cat === k).length})</button>`).join('')}</div>
        <label class="gm-search ob-q">${icon('search', 14)}<input id="obQ" placeholder="Buscar item…" value="${esc(q)}" autocomplete="off"></label></div>
      ${list.length ? `<div class="ob-grid">${list.map(card).join('')}</div>` : '<div class="cx-card w-empty"><b>Nada encontrado</b></div>'}
    </div>`;
    body.querySelectorAll('[data-cat]').forEach((b) => { b.onclick = () => { cat = b.dataset.cat; q = ''; draw(); }; });
    const qi = body.querySelector('#obQ'); qi.oninput = () => { q = qi.value.trim().toLowerCase(); const pos = qi.selectionStart; draw(); const n = body.querySelector('#obQ'); n.focus(); n.setSelectionRange(pos, pos); };
  };
  try { d = await api.get('/mundo/construtora'); draw(); } catch (err) { body.innerHTML = `<div class="w-empty"><b>${esc(err.message)}</b></div>`; }
}
