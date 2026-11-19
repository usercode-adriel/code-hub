// Mapa vivo de Nexus City — layout aprovado em docs/design/mapa-vivo.png.
// O mapa ocupa a tela toda; por cima ficam o relógio, "Online agora", o deslocamento e o feed ao vivo.
// Os cidadãos andam pelas ruas de verdade (posição vem da rotina de cada um) e a tela se atualiza sozinha.
import { shell, face, nx, bindEntities, personCard, api, esc, icon, toast } from '../world/wui.js';
import { modal } from '../ui.js';
import { cityMap } from '../world/citymap.js';

const QUICK = [['loja-tec', 'Tecnologia'], ['loja-social', 'Social'], ['banco', 'Banco'], ['restaurante', 'Comer'], ['cafe', 'Cafés'], ['padaria', 'Padarias'], ['bar', 'Bares'], ['parque', 'Parques'], ['shopping', 'Shopping'], ['mercado', 'Mercados'], ['farmacia', 'Farmácias'], ['academia', 'Academias'], ['hotel', 'Hotéis'], ['cinema', 'Cinemas'], ['escola', 'Escolas'], ['clinica', 'Clínicas'], ['hospital', 'Saúde'], ['posto', 'Postos'], ['delegacia', 'Polícia'], ['tribunal', 'Justiça'], ['empresa', 'Empresas'], ['turismo', 'Turismo'], ['clube', 'Clubes']];
const FEED_COLOR = { entrada: '#34d399', saida: '#fb923c', compra: '#22d3ee', promo: '#f472b6', noticia: '#a78bfa', alerta: '#ef4444' };
const FEED_ICON = { entrada: '●', saida: '●', compra: '🛒', promo: '', noticia: '📰', alerta: '🚓' };
const hhmm = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export default async function render(el, parts, params = new URLSearchParams()) {
  const body = shell(el, 'mapa');
  bindEntities(body);
  body.innerHTML = '<div class="skeleton" style="height:100%;min-height:70vh"></div>';
  let geo; let layers; let resumo = {};
  try { [geo, layers, resumo] = await Promise.all([api.get('/mundo/mapa/geo'), api.get('/mundo/mapa/camadas'), api.get('/mundo/resumo').catch(() => ({}))]); } catch (err) { body.innerHTML = `<div class="w-empty"><b>${esc(err.message)}</b><p class="muted">Volte em alguns segundos.</p></div>`; return; }
  const kinds = [...new Set(layers.places.map((p) => p.kind))];
  const quick = QUICK.filter(([k]) => kinds.includes(k));
  body.innerHTML = `<div class="lv">
    <div class="lv-stage" id="lvStage"></div>
    <div class="lv-hud lv-clock"><div class="lv-t"><b id="lvCk">--:--</b><small id="lvDy"></small></div><div class="lv-wx" id="lvWx"></div>
      <div class="lv-spd" role="group" aria-label="Velocidade do tempo"><i title="Pausar (em breve)" class="off">⏸</i><i class="on" title="Tempo real">1×</i><i class="off" title="Acelerar o tempo da cidade (em breve)">4×</i><i class="off" title="Acelerar o tempo da cidade (em breve)">16×</i></div></div>
    <div class="lv-top">
      <label class="gm-search">${icon('search', 15)}<input id="gmQ" placeholder="Buscar lugar, loja, rua…" autocomplete="off" aria-label="Buscar no mapa"><div class="gm-results" id="gmRes" hidden></div></label>
      <div class="gm-chips" id="gmChips">${quick.map(([k, l]) => `<button data-k="${k}" style="--c:${esc(layers.cats[k]?.color || '#64748b')}">${icon(layers.cats[k]?.icon || 'pin', 12)} ${l}</button>`).join('')}
        <button data-k="casas" style="--c:#f59e0b">${icon('home', 12)} Casas</button>${layers.smart ? `<button data-k="imoveis" style="--c:#eab308">${icon('pin', 12)} Imóveis</button>` : ''}</div>
    </div>
    <aside class="lv-hud lv-online"><h4><i class="lv-dot"></i>Online agora · <span id="lvCnt">0</span></h4><div id="lvOnl"></div></aside>
    <section class="lv-hud lv-route" id="lvRoute"></section>
    <section class="lv-hud lv-feed"><h4>Ao vivo na cidade <span class="lv-live"><i></i>AO VIVO</span></h4><div id="lvFeed"></div></section>
    <div class="lv-hud lv-legend"><span><i style="background:#a855f7"></i>Você</span><span><i style="background:#22d3ee"></i>Amigos</span><span><i style="background:#f59e0b"></i>Cidadãos</span><span><i style="background:#ef4444"></i>Alertas</span><span><i style="background:#facc15"></i>Eventos</span><span><i style="background:#555"></i>Fechado</span></div>
  </div>`;
  const $ = (s) => body.querySelector(s);
  const stage = $('#lvStage'); const routeBox = $('#lvRoute');
  let alive = true; let current = null; let route = null;

  const map = cityMap(stage, geo, {
    onView: () => pullPeople(),
    onPick: (p) => {
      if (p.type === 'place') openPlace(p.id);
      if (p.type === 'person') personCard(p.id);
      if (p.type === 'house') api.get(`/mundo/mapa/casa/${encodeURIComponent(p.id)}`).then((h) => toast(`${({ casa: 'Casa', mansao: 'Mansão', apartamento: 'Apartamento', 'casa-simples': 'Casa' })[h.kind] || 'Residência'}`, `${h.address}${h.owner ? ` · ${h.owner.name}` : ''}`, 'info')).catch(() => {});
      if (p.type === 'district') { const d = geo.districts.find((x) => x.id === p.id); toast(d?.name || 'Bairro', d?.locked ? 'Área em obras — expansão futura da cidade.' : 'Aproxime o zoom para ver prédios e casas.', 'info'); }
    },
  });
  map.setData(layers);
  if (layers.me?.xy) map.focus(layers.me.xy[0], layers.me.xy[1], 820);

  // ---------------------------------------------------------------- relógio
  const tickClock = () => {
    const n = new Date(); $('#lvCk').textContent = hhmm(n);
    const gd = Math.floor((resumo.gameMinutes || 0) / 1440) + 1;
    $('#lvDy').textContent = `${n.toLocaleDateString('pt-BR', { weekday: 'long' }).replace(/^./, (m) => m.toUpperCase())} · Dia ${gd}`;
    $('#lvWx').textContent = resumo.weather ? `${resumo.weather.icon} ${resumo.weather.temp}°C` : '';
  };
  tickClock();

  // ---------------------------------------------------------------- cidadãos andando + "Online agora"
  let lastPeople = [];
  async function pullPeople() {
    if (!alive || document.hidden) return;
    const v = map.view();
    try {
      const d = await api.get(`/mundo/mapa/pessoas?x0=${v.x0}&y0=${v.y0}&x1=${v.x1}&y1=${v.y1}`);
      if (!alive) return;
      lastPeople = d.people; map.setPeople(d.people, { horizon: d.horizon });
      $('#lvCnt').textContent = d.online;
      $('#lvOnl').innerHTML = d.people.slice(0, 7).map((p) => `<button class="lv-row" data-person="${esc(p.id)}">${p.avatar ? `<img class="lv-av lv-px" src="${esc(p.avatar)}" alt="" style="border-color:${p.friend ? '#22d3ee' : esc(p.color || '#f59e0b')}">` : `<span class="lv-av" style="background:${p.friend ? '#22d3ee' : esc(p.color || '#f59e0b')}">${esc(p.name.split(' ').map((s) => s[0]).join('').slice(0, 2))}</span>`}<span class="lv-nm"><b>${esc(p.name)}</b><small>${esc(p.doing)}</small></span></button>`).join('') || '<p class="muted">Ninguém por perto agora.</p>';
      $('#lvOnl').querySelectorAll('[data-person]').forEach((b) => { b.onclick = () => personCard(b.dataset.person); });
    } catch { /* sem conexão: segue com o que tem */ }
  }

  // ---------------------------------------------------------------- feed ao vivo
  async function pullFeed() {
    if (!alive || document.hidden) return;
    try {
      const items = await api.get('/mundo/mapa/ao-vivo?n=7');
      if (!alive) return;
      $('#lvFeed').innerHTML = items.map((x) => {
        const c = FEED_COLOR[x.kind] || '#c4b5fd';
        const who = x.name ? `<b style="color:${c}">${esc(x.name.split(' ')[0])}</b> ` : '';
        const where = x.placeName ? ` <span class="lv-pl">${esc(x.placeName)}</span>` : '';
        const lead = x.kind === 'promo' ? '' : `<span style="color:${c}">${FEED_ICON[x.kind] || '●'}</span> `;
        return `<div class="lv-l" style="--c:${c}">${lead}${who}${esc(x.text)}${where}<small>${hhmm(new Date(x.at))}</small></div>`;
      }).join('') || '<p class="muted">A cidade está calma por enquanto.</p>';
    } catch { /* ignora */ }
  }

  // ---------------------------------------------------------------- filtros e busca
  const filt = new Set();
  body.querySelectorAll('#gmChips button').forEach((b) => { b.onclick = () => { const k = b.dataset.k; if (filt.has(k)) filt.delete(k); else filt.add(k); b.classList.toggle('on', filt.has(k)); if (k === 'empresa' && filt.has(k)) filt.add('sede'); if (k === 'empresa' && !filt.has(k)) filt.delete('sede'); map.setFilter(filt); }; });
  const q = $('#gmQ'); const res = $('#gmRes');
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

  // ---------------------------------------------------------------- painel de deslocamento
  const where = () => (layers.me?.place ? esc(layers.me.place) : 'algum lugar da cidade');
  function paintIdle() {
    routeBox.innerHTML = `<h4>Deslocamento</h4><div class="lv-to"><span class="lv-ic">${icon('target', 20)}</span><div><b>Você está em ${where()}</b><small>Toque num lugar do mapa para traçar a rota</small></div></div>`;
    map.drawRoute(null);
  }
  paintIdle();
  const kmOf = (m) => (m >= 1000 ? `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : `${Math.round(m)} m`);
  function paintRoute() {
    const { p, r } = { p: current, r: route }; if (!p) return paintIdle();
    const mode = r ? Object.entries(r.fares) : [];
    const cat = layers.cats[p.kind] || {};
    routeBox.innerHTML = `<button class="lv-x" aria-label="Fechar">${icon('x', 14)}</button><h4>Deslocamento</h4>
      <div class="lv-to" style="--c:${esc(cat.color || '#a855f7')}"><span class="lv-ic">${icon(p.icon || cat.icon || 'pin', 20)}</span><div><b>${esc(p.name)}</b><small>${esc(p.address || '')}</small></div></div>
      <div class="lv-meta"><span class="${p.open ? 'up' : 'down'}">${p.open ? 'Aberto agora' : 'Fechado'}</span>${p.hours ? `<span>${String(p.hours[0]).padStart(2, '0')}h–${String(p.hours[1] % 24).padStart(2, '0')}h</span>` : ''}${p.rating ? `<span class="lv-st">★ ${p.rating.toLocaleString('pt-BR')}</span>` : ''}${p.here ? `<span class="lv-here">${icon('target', 11)} Você está aqui</span>` : ''}</div>
      ${r ? `<div class="lv-eta"><span>${kmOf(r.meters)} · ${esc(r.streets.slice(0, 2).join(' → '))}</span></div>
      <div class="lv-modes">${mode.map(([k, f]) => `<button data-mode="${k}"><b>${esc(f.label)}</b>${f.minutes} min · ${f.fee ? nx(f.fee, 0) : 'grátis'}</button>`).join('')}</div>` : ''}
      <div class="lv-acts">${p.here ? (p.shop ? `<a class="btn primary" href="#/mercado/${esc(p.id)}">${icon('bag', 14)} Entrar na loja</a>` : p.app ? `<a class="btn primary" href="${esc(p.app)}">${icon('chevRight', 14)} Entrar</a>` : '')
        : (p.shop ? `<a class="btn outline" href="#/mercado/${esc(p.id)}">${icon('bag', 14)} Ver vitrine</a>` : '')}<button class="btn outline" data-det>${icon('eye', 13)} Detalhes</button></div>`;
    routeBox.querySelector('.lv-x').onclick = () => { current = null; route = null; map.select(null); paintIdle(); };
    routeBox.querySelector('[data-det]').onclick = () => details(p);
    routeBox.querySelectorAll('[data-mode]').forEach((b) => { b.onclick = async () => {
      b.disabled = true;
      try {
        const t = await api.post('/mundo/ir', { placeId: p.id, modo: b.dataset.mode });
        toast(`Você chegou em ${p.name}`, `${r.fares[b.dataset.mode].label}${t.fee ? ` · ${nx(t.fee, 0)}` : ''}`, 'success');
        layers = await api.get('/mundo/mapa/camadas'); map.setData(layers); map.drawRoute(null); route = null; await openPlace(p.id);
      } catch (err) { toast('Não deu para ir', err.message, 'error'); b.disabled = false; }
    }; });
  }
  async function openPlace(id) {
    map.select(id);
    routeBox.innerHTML = '<h4>Deslocamento</h4><div class="skeleton" style="height:120px"></div>';
    let p;
    try { p = await api.get(`/mundo/mapa/local/${encodeURIComponent(id)}`); } catch (err) { routeBox.innerHTML = `<p>${esc(err.message)}</p>`; return; }
    current = p; route = null;
    if (!p.here) {
      try {
        route = await api.get(`/mundo/rota?de=eu&para=${encodeURIComponent(id)}`);
        map.drawRoute(route.path);
        const xs = route.path.map((q2) => q2[0]); const ys = route.path.map((q2) => q2[1]);
        map.focus((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, Math.max(500, (Math.max(...xs) - Math.min(...xs)) * 1.7, (Math.max(...ys) - Math.min(...ys)) * 1.7 * (geo.w / geo.h)));
      } catch { map.drawRoute(null); }
    } else map.drawRoute(null);
    paintRoute();
  }
  function details(p) {
    const stars = p.rating ? `${'★'.repeat(Math.round(p.rating))}${'☆'.repeat(5 - Math.round(p.rating))} <small>${p.rating.toLocaleString('pt-BR')} (${p.reviews})</small>` : '<small class="muted">Sem avaliações</small>';
    modal({ title: p.name, body: `<div class="gm-det"><div class="gm-ph" style="--c:${esc(p.color || '#64748b')}"><span class="gm-pic">${icon(p.icon || 'pin', 22)}</span><div><small>${esc(p.kindLabel)}${p.sub ? ` · ${esc(p.sub)}` : ''}</small><div class="gm-stars">${stars}</div></div></div>
      <div class="gm-kv"><span>${icon('pin', 13)} ${esc(p.address || '—')}</span></div>
      ${p.owner ? `<h5>Dono(a)</h5><button class="gm-person" data-person="${esc(p.owner.id)}">${face(p.owner, 30)}<span>${esc(p.owner.name)}${p.company ? `<small>${esc(p.company.name)}</small>` : ''}</span></button>` : ''}
      ${p.staff.length ? `<h5>Equipe</h5><div class="gm-staff">${p.staff.map((s) => `<button data-person="${esc(s.id)}" title="${esc(s.name)}${s.role ? ` — ${esc(s.role)}` : ''}">${face(s, 30)}</button>`).join('')}</div>` : ''}
      ${p.products.length ? `<h5>Produtos</h5><ul class="gm-prod">${p.products.map((x) => `<li>${esc(x.name)} <small class="${x.stock ? '' : 'down'}">${x.stock ? `${x.stock} em estoque` : 'esgotado'}</small></li>`).join('')}</ul>` : ''}
      ${p.history.length ? `<h5>Aconteceu aqui</h5><ul class="gm-hist">${p.history.map((h) => `<li>${esc(h.title)}</li>`).join('')}</ul>` : ''}</div>`,
    onMount: (m, close) => { m.querySelectorAll('[data-person]').forEach((b) => { b.onclick = () => { close(); personCard(b.dataset.person); }; }); } });
  }

  if (parts?.[0]) openPlace(parts[0]);
  // atalhos vindos de outras telas: casa, bairro, busca
  const hq = params.get('casa'); const bq = params.get('bairro');
  if (hq) { const h = (layers.houses || []).find((x) => x.id === hq); const xy = h ? (h.xy || [h.x, h.y]) : null; if (xy?.[0] != null) map.focus(xy[0], xy[1], 420); }
  if (bq) { const d = geo.districts.find((x) => x.id === bq); if (d) { const cx = d.poly.reduce((a, p) => a + p[0], 0) / d.poly.length; const cy = d.poly.reduce((a, p) => a + p[1], 0) / d.poly.length; map.focus(cx, cy, 700); } }
  pullPeople(); pullFeed();
  const timers = [setInterval(pullPeople, 6000), setInterval(pullFeed, 8000), setInterval(tickClock, 15000),
    setInterval(async () => { if (document.hidden) return; try { layers = await api.get('/mundo/mapa/camadas'); map.setData(layers); } catch { /* sem conexão */ } }, 60000)];
  return () => { alive = false; timers.forEach(clearInterval); map.destroy(); };
}
