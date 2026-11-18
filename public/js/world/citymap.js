// Mapa de Nexus City no estilo "mapa de jogo de mundo aberto": fundo escuro, ruas claras, rodovias com contorno,
// água, parques e ícones coloridos por categoria. SVG com zoom (roda, botões e pinça), arrasto, foco e rota.
import { icon } from '../icons.js';
import { esc } from '../ui.js';

const ROAD = { rua: ['#4a5059', 3.2], avenida: ['#7c838d', 5.5], acesso: ['#7c838d', 4], rodovia: ['#c9ced6', 8] };

export function cityMap(host, geo, { mini = false, onPick = null } = {}) {
  const path = (pairs) => pairs.map(([a, b]) => `M${geo.nodes[a][0]},${geo.nodes[a][1]}L${geo.nodes[b][0]},${geo.nodes[b][1]}`).join('');
  host.innerHTML = `<div class="cm ${mini ? 'mini' : ''}"><svg class="cm-svg" viewBox="0 0 ${geo.w} ${geo.h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mapa de Nexus City">
    <defs><linearGradient id="cmSea" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#28485c"/><stop offset="1" stop-color="#162a37"/></linearGradient>
      <filter id="cmGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <rect width="${geo.w}" height="${geo.h}" fill="url(#cmSea)"/>
    <path d="${geo.land}" fill="#1b1e23" stroke="#2f4555" stroke-width="6"/>
    ${geo.districts.map((d) => `<polygon class="cm-dist ${d.locked ? 'locked' : ''}" data-district="${esc(d.id)}" points="${d.poly.map((p) => p.join(',')).join(' ')}"/>`).join('')}
    ${geo.parks.map((p) => `<polygon points="${p.map((q) => q.join(',')).join(' ')}" fill="#1f3a27" stroke="#2b5236" stroke-width="2"/>`).join('')}
    <path d="${geo.river}" fill="none" stroke="#2b5068" stroke-width="46" stroke-linecap="round"/>
    <ellipse cx="${geo.lake.cx}" cy="${geo.lake.cy}" rx="${geo.lake.rx}" ry="${geo.lake.ry}" fill="#2b5068"/>
    ${geo.piers.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#2a2e35"/>`).join('')}
    <path d="${path(geo.edges.rua)}" stroke="${ROAD.rua[0]}" stroke-width="${ROAD.rua[1]}" stroke-linecap="round" fill="none"/>
    <path d="${path([...geo.edges.avenida, ...geo.edges.acesso])}" stroke="${ROAD.avenida[0]}" stroke-width="${ROAD.avenida[1]}" stroke-linecap="round" fill="none"/>
    <g>${geo.hw.map((h) => `<polyline points="${h.pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#0d0f12" stroke-width="13" stroke-linejoin="round"/><polyline points="${h.pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${ROAD.rodovia[0]}" stroke-width="${ROAD.rodovia[1]}" stroke-linejoin="round"/>`).join('')}</g>
    ${mini ? '' : geo.labels.map((l) => `<text class="cm-label" x="${l.at[0]}" y="${l.at[1]}" text-anchor="middle">${esc(l.name.toUpperCase())}${l.locked ? ' · EM OBRAS' : ''}</text>`).join('')}
    <g class="cm-route"></g><g class="cm-layer"></g></svg>
    ${mini ? '' : `<div class="cm-tools"><button class="cm-btn" data-z="in" aria-label="Aproximar">${icon('plus', 15)}</button><button class="cm-btn" data-z="out" aria-label="Afastar">${icon('minus', 15)}</button><button class="cm-btn" data-z="me" aria-label="Minha localização">${icon('target', 15)}</button><button class="cm-btn" data-z="all" aria-label="Ver a cidade toda">${icon('refresh', 14)}</button></div>`}</div>`;
  const svg = host.querySelector('svg'); const layer = host.querySelector('.cm-layer'); const routeG = host.querySelector('.cm-route');
  let vb = [0, 0, geo.w, geo.h]; let data = { places: [], events: [], alerts: [], people: [], properties: [], me: null };
  let filter = null; let selected = null;
  const px = () => vb[2] / Math.max(1, svg.clientWidth || 600); // unidades do mapa por pixel na tela
  const set = () => { svg.setAttribute('viewBox', vb.map((v) => Math.round(v)).join(' ')); scaleMarkers(); };
  const clampVb = () => { vb[2] = Math.min(geo.w, Math.max(160, vb[2])); vb[3] = vb[2] * (geo.h / geo.w); vb[0] = Math.max(0, Math.min(geo.w - vb[2], vb[0])); vb[1] = Math.max(0, Math.min(geo.h - vb[3], vb[1])); };
  const zoomAt = (f, cx, cy) => { const nw = vb[2] / f; vb[0] = cx - (cx - vb[0]) / f; vb[1] = cy - (cy - vb[1]) / f; vb[2] = nw; clampVb(); set(); };
  const focus = (x, y, width = 520) => { vb = [x - width / 2, y - (width * geo.h / geo.w) / 2, width, width * geo.h / geo.w]; clampVb(); set(); };
  function scaleMarkers() { const k = px(); for (const g of layer.querySelectorAll('[data-x]')) g.setAttribute('transform', `translate(${g.dataset.x},${g.dataset.y}) scale(${k * (mini ? 0.75 : 1)})`); }
  const blip = (p, cats) => {
    const c = cats[p.kind] || { color: '#64748b', icon: 'pin' };
    // pino estilo jogo: sombra no chão, corpo em gota com brilho, anel e ícone branco maior
    return `<g class="cm-mk ${p.open ? '' : 'closed'} ${p.hidden ? 'hidden' : ''} ${selected === p.id ? 'sel' : ''}" data-place="${esc(p.id)}" data-x="${p.x}" data-y="${p.y}" style="--c:${esc(c.color)}"><title>${esc(p.name)}${p.open ? '' : ' (fechado)'}</title>
      <ellipse class="cm-shadow" cx="0" cy="2" rx="12" ry="5"/>
      <path class="cm-pin" d="M0,6 C-11,-6 -16,-12 -16,-19 A16,16 0 1 1 16,-19 C16,-12 11,-6 0,6 Z"/>
      <circle class="cm-pin-face" cx="0" cy="-19" r="12.5"/>
      <g transform="translate(-10,-29)" class="cm-ico">${icon(c.icon, 20)}</g>
      ${p.shop ? '<circle class="cm-dotflag" cx="11" cy="-28" r="3.4"/>' : ''}${p.open ? '' : '<circle class="cm-dotflag closed" cx="11" cy="-28" r="3.4"/>'}</g>`;
  };
  function paint() {
    const cats = data.cats || {};
    const places = data.places.filter((p) => !filter || filter.has(p.kind));
    layer.innerHTML = [
      ...(data.properties || []).filter(() => !filter || filter.has('imoveis')).map((p) => `<g class="cm-prop ${p.forSale ? 'sale' : ''} ${p.owner === 'user' ? 'mine' : ''}" data-x="${p.x}" data-y="${p.y}"><title>${esc(p.name)} — ${p.owner === 'user' ? 'seu' : p.forSale ? 'à venda' : 'vendido'}</title><rect x="-5" y="-5" width="10" height="10" rx="2"/></g>`),
      ...places.map((p) => blip(p, cats)),
      ...(data.events || []).map((e) => `<g class="cm-ev" data-x="${e.x}" data-y="${e.y + 18}"><title>${esc(e.title)}</title><circle r="7"/><text y="4" text-anchor="middle">★</text></g>`),
      ...(data.alerts || []).map((e) => `<g class="cm-al" data-x="${e.x}" data-y="${e.y}"><title>${esc(e.title)}</title><circle r="14" class="ring"/><circle r="8"/><text y="4" text-anchor="middle">!</text></g>`),
      ...(data.people || []).map((p) => `<g class="cm-pp ${p.friend ? 'friend' : ''}" data-person="${esc(p.id)}" data-x="${p.x + ((p.id.charCodeAt(0) % 9) - 4) * 3}" data-y="${p.y - 16 + ((p.id.charCodeAt(1) % 7) - 3) * 3}" style="--c:${esc(p.color || '#a855f7')}"><title>${esc(p.name)} — ${esc(p.doing)} (${esc(p.place)})</title><circle r="6"/></g>`),
      data.me?.xy ? `<g class="cm-me" data-x="${data.me.xy[0]}" data-y="${data.me.xy[1]}"><circle r="16" class="ring"/><circle r="7"/><path d="M0,-12 L6,2 L0,-2 L-6,2Z" transform="translate(0,-2)"/></g>` : '',
    ].join('');
    scaleMarkers();
  }
  // arrasto e pinça
  const pts = new Map(); let drag = null; let pinch = null;
  svg.addEventListener('pointerdown', (e) => { pts.set(e.pointerId, [e.clientX, e.clientY]); svg.setPointerCapture(e.pointerId); if (pts.size === 1) drag = { x: e.clientX, y: e.clientY, vb: vb.slice(), moved: false }; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), vb: vb.slice() }; } });
  svg.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); const f = d / pinch.d; const cx = pinch.vb[0] + pinch.vb[2] / 2; const cy = pinch.vb[1] + pinch.vb[3] / 2; vb = pinch.vb.slice(); zoomAt(f, cx, cy); if (drag) drag.moved = true; return; }
    if (!drag) return;
    const k = vb[2] / svg.clientWidth; const dx = (e.clientX - drag.x) * k; const dy = (e.clientY - drag.y) * k;
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) drag.moved = true;
    vb[0] = drag.vb[0] - dx; vb[1] = drag.vb[1] - dy; clampVb(); set();
  });
  const end = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) setTimeout(() => { drag = null; }, 0); };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  if (!mini) svg.addEventListener('wheel', (e) => { e.preventDefault(); const r = svg.getBoundingClientRect(); const cx = vb[0] + ((e.clientX - r.left) / r.width) * vb[2]; const cy = vb[1] + ((e.clientY - r.top) / r.height) * vb[3]; zoomAt(e.deltaY < 0 ? 1.25 : 0.8, cx, cy); }, { passive: false });
  svg.addEventListener('click', (e) => {
    if (drag?.moved) return;
    const m = e.target.closest('[data-place]'); if (m) { selected = m.dataset.place; paint(); onPick?.({ type: 'place', id: m.dataset.place }); return; }
    const pp = e.target.closest('[data-person]'); if (pp) { onPick?.({ type: 'person', id: pp.dataset.person }); return; }
    const d = e.target.closest('[data-district]'); if (d) onPick?.({ type: 'district', id: d.dataset.district });
  });
  host.querySelectorAll('[data-z]').forEach((b) => { b.onclick = () => {
    if (b.dataset.z === 'in') zoomAt(1.5, vb[0] + vb[2] / 2, vb[1] + vb[3] / 2);
    if (b.dataset.z === 'out') zoomAt(1 / 1.5, vb[0] + vb[2] / 2, vb[1] + vb[3] / 2);
    if (b.dataset.z === 'all') { vb = [0, 0, geo.w, geo.h]; set(); }
    if (b.dataset.z === 'me' && data.me?.xy) focus(data.me.xy[0], data.me.xy[1], 600);
  }; });
  new ResizeObserver(() => scaleMarkers()).observe(svg);
  return {
    setData(d) { data = { ...data, ...d }; paint(); },
    setFilter(f) { filter = f && f.size ? f : null; paint(); },
    select(id) { selected = id; paint(); const p = data.places.find((x) => x.id === id); if (p) focus(p.x, p.y, 700); },
    focus,
    drawRoute(pathPts) { routeG.innerHTML = pathPts?.length ? `<polyline points="${pathPts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#000" stroke-width="16" stroke-linejoin="round" opacity=".5"/><polyline class="cm-route-line" points="${pathPts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#a855f7" stroke-width="9" stroke-linejoin="round" stroke-linecap="round"/>` : ''; },
  };
}
