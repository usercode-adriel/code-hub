// Construtora Nexus — loja de tudo o que dá para colocar na cidade: prédios, natureza, mobiliário urbano,
// sinalização, fachadas, obras e pisos (ruas, calçadas, praças, água). O que você compra vai para o estoque de
// obra (Inventário) e é colocado no mapa pelo botão Reforma. Também vende expansões de terreno.
import { shell, nx, api, esc, icon, toast } from '../world/wui.js';

export default async function render(el) {
  const body = shell(el, 'construtora');
  let d = null; let cat = 'predios'; let q = ''; let onlyMine = false;
  const qty = {};
  const card = (it) => `<article class="ob-item ${it.available ? 'has' : ''}" data-key="${esc(it.key)}">
      <div class="ob-art">${it.img ? `<img src="${esc(it.img)}" alt="" loading="lazy">` : `<i class="ob-floor" style="--c:${esc(it.color)}"></i>`}${it.available ? `<span class="ob-have">${it.available} livre${it.available > 1 ? 's' : ''}</span>` : ''}</div>
      <b>${esc(it.name)}</b>
      <small class="cx-mut">${it.kind === 'floor' ? 'por bloco 32×32' : it.kind === 'bld' ? `${it.w}×${it.h} · construção` : it.solid ? 'sólido' : 'decorativo'}${it.owned ? ` · você tem ${it.owned} (${it.placed} no mapa)` : ''}</small>
      <div class="ob-buy"><em>${nx(it.price, 0)}</em><input type="number" min="1" max="500" value="${qty[it.key] || (it.kind === 'floor' ? 20 : 1)}" aria-label="Quantidade" data-q="${esc(it.key)}"><button class="cx-btn sm" data-buy="${esc(it.key)}">${icon('cart', 13)} Comprar</button></div>
    </article>`;
  const draw = () => {
    const list = d.items.filter((it) => (onlyMine ? it.owned : it.cat === cat) && (!q || it.name.toLowerCase().includes(q)));
    const lv = d.level;
    body.innerHTML = `<div class="ob">
      <header class="cx-card ob-head"><span class="cx-h-ic" style="--c:#f59e0b">${icon('building', 18)}</span>
        <div><h1>Construtora Nexus</h1><p class="cx-mut">Compre prédios, canteiros, ruas e decoração. Tudo vai para o seu estoque de obra. No mapa, toque em <b>Reforma</b> para posicionar, remover e pintar ruas.</p></div>
        <div class="ob-bal"><small>Saldo</small><b>${nx(d.balance, 0)}</b></div>
        <a class="cx-btn" href="#/mapa?reforma=1">${icon('map', 14)} Abrir modo Reforma</a></header>
      <section class="cx-card ob-exp"><div><h3>${icon('layers', 15)} Terreno da cidade · expansão ${lv} de ${d.maxLevel}</h3>
        <div class="ob-lv">${Array.from({ length: d.maxLevel }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>
        <p class="cx-mut">Cada expansão aumenta a área de terra em volta da cidade, onde você pode abrir ruas e construir. O formato do mapa (${esc(d.shapes.find((s) => s.key === d.shape)?.label || d.shape)}) é escolhido no modo Reforma: quadrado, arredondado, circular ou ilha.</p></div>
        ${d.next ? `<button class="cx-btn" id="obExp">${icon('plus', 14)} Comprar expansão ${d.next.level} · ${nx(d.next.price, 0)}</button>` : '<span class="w-chip ok">Tamanho máximo</span>'}</section>
      <div class="ob-bar"><div class="sh-chips">${d.cats.map(([k, l]) => `<button data-cat="${k}" class="${!onlyMine && cat === k ? 'on' : ''}">${l} (${d.items.filter((it) => it.cat === k).length})</button>`).join('')}<button data-mine="1" class="${onlyMine ? 'on' : ''}">${icon('layers', 12)} Meu estoque (${d.items.filter((it) => it.owned).length})</button></div>
        <label class="gm-search ob-q">${icon('search', 14)}<input id="obQ" placeholder="Buscar item…" value="${esc(q)}" autocomplete="off"></label></div>
      ${list.length ? `<div class="ob-grid">${list.map(card).join('')}</div>` : `<div class="cx-card w-empty"><b>${onlyMine ? 'Seu estoque de obra está vazio' : 'Nada encontrado'}</b><p class="cx-mut">${onlyMine ? 'Compre itens nas categorias acima.' : ''}</p></div>`}
    </div>`;
    body.querySelectorAll('[data-cat]').forEach((b) => { b.onclick = () => { cat = b.dataset.cat; onlyMine = false; draw(); }; });
    body.querySelector('[data-mine]').onclick = () => { onlyMine = true; draw(); };
    const qi = body.querySelector('#obQ'); qi.oninput = () => { q = qi.value.trim().toLowerCase(); const pos = qi.selectionStart; draw(); const n = body.querySelector('#obQ'); n.focus(); n.setSelectionRange(pos, pos); };
    body.querySelectorAll('[data-q]').forEach((i) => { i.oninput = () => { qty[i.dataset.q] = Math.max(1, Math.min(500, Math.floor(Number(i.value) || 1))); }; });
    body.querySelectorAll('[data-buy]').forEach((b) => { b.onclick = async () => {
      const key = b.dataset.buy; const it = d.items.find((x) => x.key === key); const n = qty[key] || (it.kind === 'floor' ? 20 : 1);
      b.disabled = true;
      try { const r = await api.post('/mundo/construtora/comprar', { key, qty: n }); toast('Compra feita', `${n}× ${it.name} · ${nx(r.total, 0)}. Já está no seu estoque de obra.`, 'success'); await load(); } catch (err) { toast('Não deu', err.message, 'error'); b.disabled = false; }
    }; });
    body.querySelector('#obExp')?.addEventListener('click', async () => {
      try { const r = await api.post('/mundo/construtora/expandir', {}); toast('Cidade maior', `Expansão ${r.level} comprada. Abra o modo Reforma para construir na área nova.`, 'success'); await load(); } catch (err) { toast('Não deu', err.message, 'error'); }
    });
  };
  const load = async () => { d = await api.get('/mundo/construtora'); draw(); };
  try { await load(); } catch (err) { body.innerHTML = `<div class="w-empty"><b>${esc(err.message)}</b></div>`; }
}
