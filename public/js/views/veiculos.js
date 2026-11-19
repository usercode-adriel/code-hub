// Veículos — sua garagem (carros comprados de verdade), concessionária com vendedor(a) de IA, postos e meios de transporte.
import { shell, bindEntities, nx, api, esc, icon, toast } from '../world/wui.js';
import { institution } from '../world/inst.js';

export default async function render(el) {
  const body = shell(el, 'veiculos');
  bindEntities(body);
  let ins = null;
  const load = async () => {
    const d = await api.get('/mundo/veiculos');
    const local = d.dealer ? await api.get(`/mundo/mapa/local/${d.dealer.id}`).catch(() => null) : null;
    const a = local?.desk;
    ins?.stop(); body.innerHTML = '';
    ins = institution(body, {
      scene: '/assets/pixel/scene-porto.png', building: d.main ? d.main.art : '/assets/pixel/b-loja.png', logo: ['TURBO', 'VEICULOS'], color: '#60a5fa',
      agent: a ? { ...a, role: a.gender === 'f' ? 'Vendedora' : 'Vendedor' } : null,
      bubble: { title: d.main ? `Seu carro: ${d.main.name}` : 'Sem carro ainda', text: d.main ? 'Escolha "Carro próprio" ao se deslocar pelo mapa: você paga só o combustível.' : 'Com carro próprio você se desloca pagando só o combustível. Veja a vitrine da concessionária.' },
      actions: [
        { href: '#vhGaragem', icon: 'car', label: 'Minha garagem', color: '#60a5fa', badge: d.garage.length || '' },
        { href: d.dealer ? `#/mercado/${d.dealer.id}` : '#/mercado', icon: 'cart', label: 'Comprar na concessionária', color: '#fb923c' },
        { id: 'falar', icon: 'chat', label: 'Falar com o vendedor', color: '#38d6f5' },
        { href: '#/mapa', icon: 'map', label: 'Dirigir pela cidade', color: '#2fd27a' },
      ],
      chat: d.dealer ? { url: `/mundo/lugar/${d.dealer.id}/conversar`, placeholder: 'Pergunte sobre os carros...', greeting: a ? `E aí! Sou ${a.name.split(' ')[0]}. Bora escolher seu carro?` : 'Oficina Turbo.' } : null,
      live: d.dealer ? { scope: `place:${d.dealer.id}`, title: 'Ao vivo na concessionária', art: '/assets/pixel/scene-porto.png', empty: 'Visitas e vendas da concessionária aparecem aqui.' } : null,
    });
    const car = (c, mine) => `<article class="vh-car ${c.main ? 'main' : ''}"><div class="vh-art"><img src="${esc(c.art)}" alt=""></div><b>${esc(c.name)}</b><small>${esc(c.tier)} · ${c.seats} lugares · velocidade ${Math.round(c.speed * 100)}%</small>
      ${mine ? `${c.main ? '<small class="up">● carro principal</small>' : `<button class="cx-btn sm" data-main="${esc(c.id)}">Usar como principal</button>`}` : `<em>${nx(c.price, 0)}</em><small>${c.stock ? `${c.stock} na loja` : 'esgotado'}</small>`}</article>`;
    ins.body.innerHTML = `
      <section class="cx-card" id="vhGaragem"><header class="cx-card-h"><span class="cx-h-ic" style="--c:#60a5fa">${icon('car', 15)}</span><h3>Minha garagem</h3></header>
        <div class="vh-grid">${d.garage.map((c) => car(c, true)).join('') || '<p class="cx-mut">Você ainda não tem veículo. Compre na concessionária e ele aparece aqui.</p>'}</div></section>
      ${d.dealer ? `<section class="cx-card"><header class="cx-card-h"><span class="cx-h-ic" style="--c:#fb923c">${icon('cart', 15)}</span><h3>Vitrine · ${esc(d.dealer.name)}</h3><a class="cx-more-l" href="#/mercado/${esc(d.dealer.id)}">Ir à loja</a></header>
        <div class="vh-grid">${d.dealer.catalog.map((c) => car(c, false)).join('')}</div></section>` : ''}
      <section class="cx-card"><header class="cx-card-h"><span class="cx-h-ic" style="--c:#2fd27a">${icon('bus', 15)}</span><h3>Como se deslocar</h3></header>
        <div class="vh-modes">${d.modes.map((m) => `<div class="vh-mode ${m.needs && !d.main ? 'off' : ''}">${icon({ pe: 'user', onibus: 'bus', taxi: 'car', carro: 'car' }[m.key] || 'map', 20)}<div><b>${esc(m.label)}</b><small>${m.sample ? `~${nx(m.sample)} por 2 km` : 'grátis'}${m.needs && !d.main ? ' · precisa de carro' : ''}</small></div></div>`).join('')}</div>
        ${d.stations.length ? `<h5>Postos de combustível</h5><div class="ins-cards">${d.stations.map((p) => `<a class="ins-u" href="#/mapa/${esc(p.id)}"><b>${esc(p.name)}</b><small>${esc(p.address || '')} · <span class="${p.open ? 'up' : 'down'}">${p.open ? 'aberto' : 'fechado'}</span></small></a>`).join('')}</div>` : ''}</section>`;
    ins.body.querySelectorAll('[data-main]').forEach((b) => { b.onclick = async () => { try { const r = await api.post(`/mundo/inventario/${b.dataset.main}/equipar`, {}); toast('Pronto', r.text, 'success'); await load(); } catch (err) { toast('Não deu', err.message, 'error'); } }; });
  };
  try { await load(); } catch (err) { body.innerHTML = `<div class="w-empty"><b>${esc(err.message)}</b></div>`; }
  return () => ins?.stop();
}
