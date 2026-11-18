// Mapa de Nexus City (estilo mapa de jogo de mundo aberto): ruas, rodovias, água, parques e lugares reais do mundo.
// Toque num ícone para ver o local (dono, equipe, horário, produtos), traçar rota, ir até lá e entrar.
import { shell, face, nx, bindEntities, personCard, api, esc, icon, toast } from '../world/wui.js';
import { cityMap } from '../world/citymap.js';

const QUICK = [['loja-tec', 'Tecnologia'], ['loja-social', 'Social'], ['banco', 'Banco'], ['restaurante', 'Comer'], ['bar', 'Bares'], ['parque', 'Parques'], ['shopping', 'Shopping'], ['delegacia', 'Polícia'], ['tribunal', 'Justiça'], ['empresa', 'Empresas'], ['turismo', 'Turismo'], ['mercado', 'Mercado'], ['clube', 'Clubes'], ['hospital', 'Saúde']];

export default async function render(el, parts) {
  const body = shell(el, 'mapa');
  bindEntities(body);
  body.innerHTML = '<div class="skeleton" style="height:70vh;border-radius:18px"></div>';
  let geo; let layers;
  try { [geo, layers] = await Promise.all([api.get('/mundo/mapa/geo'), api.get('/mundo/mapa/camadas')]); } catch (err) { body.innerHTML = `<div class="w-empty"><b>${esc(err.message)}</b><p class="muted">Volte em alguns segundos.</p></div>`; return; }
  const kinds = [...new Set(layers.places.map((p) => p.kind))];
  const quick = QUICK.filter(([k]) => kinds.includes(k));
  body.innerHTML = `<div class="gm">
    <div class="gm-stage" id="gmStage"></div>
    <div class="gm-top">
      <label class="gm-search">${icon('search', 15)}<input id="gmQ" placeholder="Buscar lugar, loja, rua…" autocomplete="off" aria-label="Buscar no mapa"><div class="gm-results" id="gmRes" hidden></div></label>
      <div class="gm-chips" id="gmChips">${quick.map(([k, l]) => `<button data-k="${k}" style="--c:${esc(layers.cats[k]?.color || '#64748b')}">${icon(layers.cats[k]?.icon || 'pin', 12)} ${l}</button>`).join('')}
        ${layers.smart ? `<button data-k="imoveis" style="--c:#eab308">${icon('pin', 12)} Imóveis</button>` : ''}</div>
    </div>
    <div class="gm-me" id="gmMe"></div>
    <aside class="gm-panel" id="gmPanel" hidden></aside>
    <div class="gm-legend">${layers.smart ? `<span><i class="lg pp"></i>Pessoas agora</span>` : `<a href="#/mercado">${icon('sparkles', 11)} Mapa Inteligente mostra pessoas e imóveis</a>`}<span><i class="lg ev"></i>Eventos</span><span><i class="lg al"></i>Alertas 24 h</span><span><i class="lg cl"></i>Fechado</span></div>
  </div>`;
  const stage = body.querySelector('#gmStage'); const panel = body.querySelector('#gmPanel');
  const map = cityMap(stage, geo, { onPick: (p) => { if (p.type === 'place') openPlace(p.id); if (p.type === 'person') personCard(p.id); if (p.type === 'district') toast(geo.districts.find((d) => d.id === p.id)?.name || 'Bairro', geo.districts.find((d) => d.id === p.id)?.locked ? 'Área em obras — expansão futura da cidade.' : 'Toque nos ícones para ver os lugares.', 'info'); } });
  map.setData(layers);
  const paintMe = () => { body.querySelector('#gmMe').innerHTML = layers.me ? `${icon('target', 13)} Você está em <b>${esc(layers.me.place || 'algum lugar da cidade')}</b>` : ''; };
  paintMe();
  if (layers.me?.xy) map.focus(layers.me.xy[0], layers.me.xy[1], 900);
  // filtros
  const filt = new Set();
  body.querySelectorAll('#gmChips button').forEach((b) => { b.onclick = () => { const k = b.dataset.k; if (filt.has(k)) filt.delete(k); else filt.add(k); b.classList.toggle('on', filt.has(k)); if (k === 'empresa' && filt.has(k)) filt.add('sede'); if (k === 'empresa' && !filt.has(k)) filt.delete('sede'); map.setFilter(filt); }; });
  // busca
  const q = body.querySelector('#gmQ'); const res = body.querySelector('#gmRes');
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  q.oninput = () => {
    const k = fold(q.value.trim());
    if (k.length < 2) { res.hidden = true; return; }
    const hits = layers.places.filter((p) => fold(`${p.name} ${p.address} ${layers.cats[p.kind]?.label || ''} ${p.sub || ''}`).includes(k)).slice(0, 8);
    res.hidden = false;
    res.innerHTML = hits.map((p) => `<button data-id="${esc(p.id)}"><span style="--c:${esc(layers.cats[p.kind]?.color || '#64748b')}">${icon(layers.cats[p.kind]?.icon || 'pin', 13)}</span><b>${esc(p.name)}</b><small>${esc(p.address || '')}</small></button>`).join('') || '<p class="muted">Nada encontrado.</p>';
    res.querySelectorAll('button').forEach((b) => { b.onclick = () => { res.hidden = true; q.value = ''; openPlace(b.dataset.id); }; });
  };
  q.onkeydown = (e) => { if (e.key === 'Escape') { res.hidden = true; q.blur(); } if (e.key === 'Enter') res.querySelector('button')?.click(); };

  async function openPlace(id) {
    map.select(id);
    panel.hidden = false;
    panel.innerHTML = '<div class="skeleton" style="height:200px"></div>';
    let p;
    try { p = await api.get(`/mundo/mapa/local/${encodeURIComponent(id)}`); } catch (err) { panel.innerHTML = `<p>${esc(err.message)}</p>`; return; }
    const stars = p.rating ? `${'★'.repeat(Math.round(p.rating))}${'☆'.repeat(5 - Math.round(p.rating))} <small>${p.rating.toLocaleString('pt-BR')} (${p.reviews})</small>` : '<small class="muted">Sem avaliações</small>';
    panel.innerHTML = `<button class="gm-x" aria-label="Fechar">${icon('x', 16)}</button>
      <div class="gm-ph" style="--c:${esc(p.color || '#64748b')}"><span class="gm-pic">${icon(p.icon || 'pin', 22)}</span><div><small>${esc(p.kindLabel)}${p.sub ? ` · ${esc(p.sub)}` : ''}</small><h3>${esc(p.name)}</h3><div class="gm-stars">${stars}</div></div></div>
      <div class="gm-kv"><span>${icon('pin', 13)} ${esc(p.address || '—')}</span>
        <span>${icon('clock', 13)} ${p.hours ? `${String(p.hours[0]).padStart(2, '0')}h às ${String(p.hours[1] % 24).padStart(2, '0')}h` : 'Sempre aberto'} · <b class="${p.open ? 'up' : 'down'}">${p.open ? 'Aberto agora' : 'Fechado'}</b></span>
        ${p.status && !['ativo', 'aberto', 'ativa'].includes(p.status) ? `<span class="w-chip warn">${esc(p.status)}</span>` : ''}${p.here ? `<span class="w-chip ok">${icon('target', 11)} Você está aqui</span>` : ''}</div>
      ${p.owner ? `<h5>Dono(a)</h5><button class="gm-person" data-person="${esc(p.owner.id)}">${face(p.owner, 30)}<span>${esc(p.owner.name)}${p.company ? `<small>${esc(p.company.name)}</small>` : ''}</span></button>` : ''}
      ${p.staff.length ? `<h5>Equipe</h5><div class="gm-staff">${p.staff.map((s) => `<button data-person="${esc(s.id)}" title="${esc(s.name)}${s.role ? ` — ${esc(s.role)}` : ''}">${face(s, 30)}</button>`).join('')}</div>` : ''}
      ${p.products.length ? `<h5>Produtos</h5><ul class="gm-prod">${p.products.map((x) => `<li>${esc(x.name)} <small class="${x.stock ? '' : 'down'}">${x.stock ? `${x.stock} em estoque` : 'esgotado'}</small></li>`).join('')}</ul>` : ''}
      ${p.history.length ? `<h5>Aconteceu aqui</h5><ul class="gm-hist">${p.history.map((h) => `<li>${esc(h.title)}</li>`).join('')}</ul>` : ''}
      <div class="gm-route" id="gmRoute"></div>
      <div class="gm-acts">${p.here
        ? (p.shop ? `<a class="btn primary" href="#/mercado/${esc(p.id)}">${icon('bag', 14)} Entrar na loja</a>` : p.app ? `<a class="btn primary" href="${esc(p.app)}">${icon('chevRight', 14)} Entrar</a>` : `<span class="muted">Você está aqui.</span>`)
        : `<button class="btn primary" data-goroute>${icon('pin', 14)} Traçar rota</button>`}
        ${!p.here && p.shop ? `<a class="btn outline" href="#/mercado/${esc(p.id)}">${icon('bag', 14)} Ver vitrine</a>` : ''}</div>`;
    panel.querySelector('.gm-x').onclick = () => { panel.hidden = true; map.drawRoute(null); map.select(null); };
    panel.querySelectorAll('[data-person]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); personCard(b.dataset.person); }; });
    panel.querySelector('[data-goroute]')?.addEventListener('click', () => showRoute(p));
  }
  async function showRoute(p) {
    const box = panel.querySelector('#gmRoute');
    box.innerHTML = '<div class="skeleton" style="height:80px"></div>';
    let r;
    try { r = await api.get(`/mundo/rota?de=eu&para=${encodeURIComponent(p.id)}`); } catch (err) { box.innerHTML = `<p class="down">${esc(err.message)}</p>`; return; }
    map.drawRoute(r.path);
    { const xs = r.path.map((q) => q[0]); const ys = r.path.map((q) => q[1]); map.focus((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, Math.max(500, (Math.max(...xs) - Math.min(...xs)) * 1.6, (Math.max(...ys) - Math.min(...ys)) * 1.6 * (geo.w / geo.h))); }
    const km = r.meters >= 1000 ? `${(r.meters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : `${Math.round(r.meters)} m`;
    box.innerHTML = `<h5>Rota · ${km}</h5><small class="muted">${esc(r.streets.slice(0, 4).join(' → '))}${r.streets.length > 4 ? ' …' : ''}</small>
      <div class="gm-modes">${Object.entries(r.fares).map(([k, f]) => `<button data-mode="${k}"><b>${esc(f.label)}</b><small>${f.minutes} min · ${f.fee ? nx(f.fee, 0) : 'grátis'}</small></button>`).join('')}</div>`;
    box.querySelectorAll('[data-mode]').forEach((b) => { b.onclick = async () => {
      b.disabled = true;
      try {
        const t = await api.post('/mundo/ir', { placeId: p.id, modo: b.dataset.mode });
        toast(`Você chegou em ${p.name}`, `${r.fares[b.dataset.mode].label}${t.fee ? ` · ${nx(t.fee, 0)}` : ''}`, 'success');
        layers = await api.get('/mundo/mapa/camadas'); map.setData(layers); map.drawRoute(null); paintMe(); openPlace(p.id);
      } catch (err) { toast('Não deu para ir', err.message, 'error'); b.disabled = false; }
    }; });
  }
  if (parts?.[0]) openPlace(parts[0]);
  // camadas vivas: atualiza a cada minuto
  const t = setInterval(async () => { try { layers = await api.get('/mundo/mapa/camadas'); map.setData(layers); paintMe(); } catch { /* sem conexão */ } }, 60000);
  return () => clearInterval(t);
}
