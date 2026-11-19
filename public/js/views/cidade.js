// Desenvolvimento urbano — os bairros de Nexus City: moradores, comércio, empresas, imóveis e valor de cada um,
// bairros em obras que abrem quando a cidade cresce e a evolução urbana registrada no motor do mundo.
import { shell, bindEntities, evRow, api, esc, icon, face } from '../world/wui.js';
import { cityMap } from '../world/citymap.js';

const KIND = { centro: 'Centro', tecnologia: 'Tecnologia', residencial: 'Residencial', nobre: 'Nobre', educacao: 'Educação', comercio: 'Comércio', popular: 'Popular', noturno: 'Vida noturna' };

export default async function render(el) {
  const body = shell(el, 'cidade', { title: 'Desenvolvimento urbano', sub: 'Como Nexus City cresce: bairros, população, comércio, imóveis e novas áreas liberadas.' });
  bindEntities(body);
  body.innerHTML = '<div class="skeleton" style="height:320px"></div>';
  const [geo, r, evs] = await Promise.all([api.get('/mundo/mapa/geo'), api.get('/mundo/resumo'), api.get('/mundo/eventos?cat=local&limite=12').catch(() => ({ events: [] }))]);
  const ds = await Promise.all(geo.districts.map((d) => api.get(`/mundo/bairro/${d.id}`).catch(() => null)));
  const list = ds.filter(Boolean);
  body.innerHTML = `<div class="ur">
    <section class="ur-top">${[['Moradores', r.city.residents, 'users', '#38d6f5'], ['Bairros ativos', list.filter((d) => !d.locked).length, 'map', '#2fd27a'], ['Em obras', list.filter((d) => d.locked).length, 'wrench', '#f7c948'], ['Comércios e serviços', list.reduce((n, d) => n + d.places.length, 0), 'building', '#fb923c']].map(([l, v, ic, c]) => `<div class="cx-card dp-stat"><span class="cx-h-ic" style="--c:${c}">${icon(ic, 16)}</span><div><b>${v}</b><small>${l}</small></div></div>`).join('')}</section>
    <section class="cx-card ur-map"><header class="cx-card-h"><span class="cx-h-ic" style="--c:#f87171">${icon('pin', 15)}</span><h3>Bairros no mapa</h3><a class="cx-more-l" href="#/mapa">Mapa completo</a></header><div class="ur-map-host" id="urMap"></div></section>
    <section class="cx-card ur-evo"><header class="cx-card-h"><span class="cx-h-ic" style="--c:#2fd27a">${icon('trending', 15)}</span><h3>Evolução urbana</h3></header>${(evs.events || []).map((e) => evRow(e, { compact: true })).join('') || '<p class="cx-mut">Nenhuma obra ou expansão registrada ainda.</p>'}</section>
    <section class="ur-grid">${list.map((d) => `<article class="ur-d cx-card ${d.locked ? 'locked' : ''}" style="--c:${esc(d.color || '#6c4cf5')}">
      <header><i></i><div><b>${esc(d.name)}</b><small>${esc(KIND[d.kind] || d.kind)}${d.locked ? ' · em obras' : ''}</small></div><em>${d.value ? `×${Number(d.value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}` : ''}</em></header>
      ${d.locked ? `<p class="cx-mut">Libera quando a cidade tiver ${d.minResidents || '?'} moradores (hoje: ${r.city.residents}).</p><i class="vd-bar"><i style="width:${Math.min(100, (r.city.residents / (d.minResidents || 1)) * 100)}%;background:var(--cx-gold)"></i></i>`
        : `<div class="ur-nums"><span><b>${d.residents.length >= 40 ? '40+' : d.residents.length}</b><small>moradores</small></span><span><b>${d.places.length}</b><small>lugares</small></span><span><b>${d.companies.length}</b><small>empresas</small></span><span><b>${d.properties.length}</b><small>imóveis</small></span></div>
        <div class="ur-faces">${d.residents.slice(0, 7).map((p) => `<span data-person="${esc(p.id)}">${face(p, 28)}</span>`).join('')}</div>`}</article>`).join('')}</section>
  </div>`;
  const m = cityMap(body.querySelector('#urMap'), geo, { onPick: (p) => { if (p.type === 'place') location.hash = `#/mapa/${p.id}`; } });
  api.get('/mundo/mapa/camadas').then((l) => m.setData(l)).catch(() => {});
  return () => m.destroy?.();
}
