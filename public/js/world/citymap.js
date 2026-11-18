// Mapa de Nexus City no estilo "mapa de jogo de mundo aberto": fundo escuro, ruas claras, rodovias com contorno,
// água, parques, prédios e casas por bairro, ícones coloridos por categoria e cidadãos andando em tempo real.
// SVG com zoom (roda, botões e pinça), arrasto, foco e rota. Os cidadãos são animados entre uma consulta e outra.
import { icon } from '../icons.js';
import { esc } from '../ui.js';

const ROAD = { rua: ['#4a5059', 3.2], avenida: ['#7c838d', 5.5], acesso: ['#7c838d', 4], rodovia: ['#c9ced6', 8] };

// estilo dos quarteirões por tipo de bairro: quantos lotes, altura aparente e cores dos telhados
const BSTYLE = {
  centro: { n: [2, 2], gap: 0.14, h: [7, 13], roof: ['#3a4560', '#44506e', '#2f3a52'] },
  tecnologia: { n: [2, 2], gap: 0.14, h: [9, 17], roof: ['#1f4d5a', '#2a6577', '#1b3f4a'] },
  residencial: { n: [3, 3], gap: 0.2, h: [2, 3.5], roof: ['#6b4a3a', '#7a4f3d', '#5b4132'] },
  nobre: { n: [2, 2], gap: 0.3, h: [3, 5], roof: ['#4f3f6e', '#5c4a7c', '#433560'], yard: '#1d3326' },
  educacao: { n: [2, 1], gap: 0.22, h: [4, 6], roof: ['#6b5a2e', '#7b6a38', '#5a4c28'], yard: '#1f3a27' },
  comercio: { n: [3, 2], gap: 0.16, h: [3, 5], roof: ['#7a3b1d', '#8a4a24', '#6a3318'] },
  popular: { n: [3, 3], gap: 0.16, h: [2, 3], roof: ['#5b3a3a', '#4a3f2f', '#6a4538'] },
  noturno: { n: [2, 2], gap: 0.16, h: [5, 9], roof: ['#5b2a63', '#7a2a56', '#3f2a6a'] },
};
const HOUSE_COLOR = { casa: '#f59e0b', mansao: '#a855f7', apartamento: '#38bdf8', 'casa-simples': '#f87171' };

function hash(a, b, c) { let h = (a * 73856093) ^ (b * 19349663) ^ (c * 83492791); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function shade(hex, f) { const n = parseInt(hex.slice(1), 16); const r = (n >> 16) & 255; const g = (n >> 8) & 255; const b = n & 255; const m = (x) => Math.round(x * f).toString(16).padStart(2, '0'); return `#${m(r)}${m(g)}${m(b)}`; }
function inPoly(pt, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i]; const [xj, yj] = poly[j]; if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi)) c = !c; } return c; }

// prédios, casas, quintais e árvores: tudo agrupado em poucos <path> para o mapa continuar leve
function buildings(geo) {
  const blocks = geo.blocks || []; if (!blocks.length) return '';
  const yard = []; const walls = {}; const roofs = {}; const trees = []; const win = [];
  const poly = (pts, dx = 0, dy = 0) => `M${pts.map((p) => `${(p[0] + dx).toFixed(1)},${(p[1] + dy).toFixed(1)}`).join('L')}Z`;
  for (const bl of blocks) {
    const kind = geo.districts[bl[0]]?.kind || 'residencial'; const st = BSTYLE[kind] || BSTYLE.residencial;
    const A = [bl[1], bl[2]]; const B = [bl[3], bl[4]]; const C = [bl[5], bl[6]]; const D = [bl[7], bl[8]];
    const at = (u, v) => [A[0] * (1 - u) * (1 - v) + B[0] * u * (1 - v) + C[0] * u * v + D[0] * (1 - u) * v, A[1] * (1 - u) * (1 - v) + B[1] * u * (1 - v) + C[1] * u * v + D[1] * (1 - u) * v];
    const m = 0.17; const ctr = at(0.5, 0.5);
    if ((geo.parks || []).some((pk) => inPoly(ctr, pk))) continue; // praças e parques ficam livres
    if (st.yard) yard.push(poly([at(m, m), at(1 - m, m), at(1 - m, 1 - m), at(m, 1 - m)]));
    // cada quarteirão tem um desenho próprio: um prédio grande, dois lotes desiguais ou a grade do bairro
    const tall = ['centro', 'tecnologia', 'noturno'].includes(kind); const pick = hash(bl[1], bl[2], 11);
    let cellsList = [];
    const [nu, nv] = st.n; const span = 1 - 2 * m;
    if (pick < (tall ? 0.22 : 0.1)) cellsList = [[m + 0.03, 1 - m - 0.03, m + 0.03, 1 - m - 0.03, 1.35]];
    else if (pick < (tall ? 0.5 : 0.32)) { const sp = 0.35 + hash(bl[3], bl[4], 13) * 0.3; const vert = hash(bl[5], bl[6], 17) < 0.5; const gp = 0.03;
      cellsList = vert ? [[m, m + span * sp - gp, m, 1 - m, 1], [m + span * sp + gp, 1 - m, m, 1 - m, 1.15]] : [[m, 1 - m, m, m + span * sp - gp, 1], [m, 1 - m, m + span * sp + gp, 1 - m, 1.15]]; }
    else {
      const g = st.gap; const lu = span / nu; const lv = span / nv;
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { if (hash(bl[1], bl[2], i * 7 + j) < 0.07) continue; cellsList.push([m + i * lu + lu * g / 2, m + (i + 1) * lu - lu * g / 2, m + j * lv + lv * g / 2, m + (j + 1) * lv - lv * g / 2, 1]); }
    }
    for (let n = 0; n < cellsList.length; n++) {
      const [u0, u1, v0, v1, hk] = cellsList[n]; const i = n; const j = 0; const r1 = hash(bl[1], bl[2], n * 7 + 3);
      {
        const quad = [at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)];
        const h = (st.h[0] + hash(bl[3], bl[4], i * 5 + j) * (st.h[1] - st.h[0])) * hk;
        const ci = Math.floor(hash(bl[5], bl[6], i * 3 + j) * st.roof.length);
        const key = `${kind}|${ci}`;
        (walls[key] ??= []).push(poly(quad, h * 0.4, h * 0.75)); (roofs[key] ??= []).push(poly(quad));
        if (tall) win.push(poly(quad));
        if (['residencial', 'nobre', 'popular'].includes(kind) && r1 > 0.55) { const t = at(u0 - 0.03, v1 + 0.02); trees.push(`M${t[0].toFixed(1)},${t[1].toFixed(1)}m-2.2,0a2.2,2.2 0 1,0 4.4,0a2.2,2.2 0 1,0-4.4,0`); }
      }
    }
  }
  let out = yard.length ? `<path d="${yard.join('')}" fill="${'#1d3326'}" opacity=".9"/>` : '';
  for (const [key, list] of Object.entries(walls)) { const [kind, ci] = key.split('|'); out += `<path d="${list.join('')}" fill="${shade(BSTYLE[kind].roof[+ci], 0.42)}"/>`; }
  for (const [key, list] of Object.entries(roofs)) { const [kind, ci] = key.split('|'); out += `<path d="${list.join('')}" fill="${BSTYLE[kind].roof[+ci]}" stroke="${shade(BSTYLE[kind].roof[+ci], 1.35)}" stroke-width=".6" stroke-opacity=".55"/>`; }
  if (win.length) out += `<defs><pattern id="cmWin" width="6" height="6" patternUnits="userSpaceOnUse"><rect x="1.2" y="1.2" width="2.2" height="2.2" fill="#ffe9a8"/></pattern></defs><path d="${win.join('')}" fill="url(#cmWin)" opacity=".5"/>`;
  if (trees.length) out += `<path d="${trees.join('')}" fill="#2f6b3e" opacity=".85"/>`;
  return `<g class="cm-bld">${out}</g>`;
}

export function cityMap(host, geo, { mini = false, onPick = null, onView = null } = {}) {
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
    ${buildings(geo)}
    <path d="${path(geo.edges.rua)}" stroke="${ROAD.rua[0]}" stroke-width="${ROAD.rua[1]}" stroke-linecap="round" fill="none"/>
    <path d="${path([...geo.edges.avenida, ...geo.edges.acesso])}" stroke="${ROAD.avenida[0]}" stroke-width="${ROAD.avenida[1]}" stroke-linecap="round" fill="none"/>
    <g>${geo.hw.map((h) => `<polyline points="${h.pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#0d0f12" stroke-width="13" stroke-linejoin="round"/><polyline points="${h.pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${ROAD.rodovia[0]}" stroke-width="${ROAD.rodovia[1]}" stroke-linejoin="round"/>`).join('')}</g>
    ${mini ? '' : geo.labels.map((l) => `<text class="cm-label" x="${l.at[0]}" y="${l.at[1]}" text-anchor="middle">${esc(l.name.toUpperCase())}${l.locked ? ' · EM OBRAS' : ''}</text>`).join('')}
    <g class="cm-route"></g><g class="cm-layer"></g><g class="cm-walkers"></g></svg>
    ${mini ? '' : `<div class="cm-tools"><button class="cm-btn" data-z="in" aria-label="Aproximar">${icon('plus', 15)}</button><button class="cm-btn" data-z="out" aria-label="Afastar">${icon('minus', 15)}</button><button class="cm-btn" data-z="me" aria-label="Minha localização">${icon('target', 15)}</button><button class="cm-btn" data-z="all" aria-label="Ver a cidade toda">${icon('refresh', 14)}</button></div>`}</div>`;
  const svg = host.querySelector('svg'); const layer = host.querySelector('.cm-layer'); const routeG = host.querySelector('.cm-route'); const wl = host.querySelector('.cm-walkers');
  let vb = [0, 0, geo.w, geo.h]; let data = { places: [], events: [], alerts: [], houses: [], properties: [], me: null };
  let filter = null; let selected = null; let near = false;
  const px = () => vb[2] / Math.max(1, svg.clientWidth || 600); // unidades do mapa por pixel na tela
  let viewTimer = null;
  const set = () => {
    svg.setAttribute('viewBox', vb.map((v) => Math.round(v)).join(' '));
    const n = vb[2] < 950; svg.classList.toggle('cm-near', vb[2] < 1100);
    if (n !== near) { near = n; paint(); } else scaleMarkers();
    if (onView) { clearTimeout(viewTimer); viewTimer = setTimeout(() => onView(view()), 350); }
  };
  const view = () => { const mx = vb[2] * 0.4; const my = vb[3] * 0.4; return { x0: Math.round(vb[0] - mx), y0: Math.round(vb[1] - my), x1: Math.round(vb[0] + vb[2] + mx), y1: Math.round(vb[1] + vb[3] + my), width: vb[2] }; };
  const clampVb = () => { vb[2] = Math.min(geo.w, Math.max(160, vb[2])); vb[3] = vb[2] * (geo.h / geo.w); vb[0] = Math.max(0, Math.min(geo.w - vb[2], vb[0])); vb[1] = Math.max(0, Math.min(geo.h - vb[3], vb[1])); };
  const zoomAt = (f, cx, cy) => { const nw = vb[2] / f; vb[0] = cx - (cx - vb[0]) / f; vb[1] = cy - (cy - vb[1]) / f; vb[2] = nw; clampVb(); set(); };
  const focus = (x, y, width = 520) => { vb = [x - width / 2, y - (width * geo.h / geo.w) / 2, width, width * geo.h / geo.w]; clampVb(); set(); };
  function scaleMarkers() { const k = px(); for (const g of layer.querySelectorAll('[data-x]')) g.setAttribute('transform', `translate(${g.dataset.x},${g.dataset.y}) scale(${k * (mini ? 0.5 : 1)})`); }
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
      // casas dos moradores: só aparecem quando você se aproxima
      ...(!mini && near && (!filter || filter.has('casas')) ? (data.houses || []).map((h) => `<g class="cm-hs" data-house="${esc(h.id)}" data-x="${h.x}" data-y="${h.y}" style="--c:${HOUSE_COLOR[h.kind] || '#f59e0b'}"><path d="M-6,0 L0,-6.5 L6,0 Z" class="r"/><rect x="-4.4" y="0" width="8.8" height="6" rx="1" class="b"/></g>`) : []),
      ...(data.properties || []).filter(() => !filter || filter.has('imoveis')).map((p) => `<g class="cm-prop ${p.forSale ? 'sale' : ''} ${p.owner === 'user' ? 'mine' : ''}" data-x="${p.x}" data-y="${p.y}"><title>${esc(p.name)} — ${p.owner === 'user' ? 'seu' : p.forSale ? 'à venda' : 'vendido'}</title><rect x="-5" y="-5" width="10" height="10" rx="2"/></g>`),
      ...places.map((p) => blip(p, cats)),
      ...(data.events || []).map((e) => `<g class="cm-ev" data-x="${e.x}" data-y="${e.y + 18}"><title>${esc(e.title)}</title><circle r="7"/><text y="4" text-anchor="middle">★</text></g>`),
      ...(data.alerts || []).map((e) => `<g class="cm-al" data-x="${e.x}" data-y="${e.y}"><title>${esc(e.title)}</title><circle r="14" class="ring"/><circle r="8"/><text y="4" text-anchor="middle">!</text></g>`),
      data.me?.xy ? `<g class="cm-me" data-x="${data.me.xy[0]}" data-y="${data.me.xy[1]}"><circle r="16" class="ring"/><circle r="7"/><path d="M0,-12 L6,2 L0,-2 L-6,2Z" transform="translate(0,-2)"/></g>` : '',
    ].join('');
    scaleMarkers();
  }

  // ---------------------------------------------------------------- cidadãos andando
  // O servidor manda onde cada pessoa está e onde estará nos próximos segundos; aqui a animação percorre esses pontos.
  const NS = 'http://www.w3.org/2000/svg';
  const walkers = new Map(); let raf = 0; let lastK = 0;
  const mk = (name, at = {}, parent) => { const e = document.createElementNS(NS, name); for (const [a, b] of Object.entries(at)) e.setAttribute(a, b); parent?.appendChild(e); return e; };
  function createWalker(p) {
    const g = mk('g', { class: 'cm-walker' }, wl);
    const trail = mk('polyline', { class: 'cm-trail', fill: 'none', 'vector-effect': 'non-scaling-stroke' }, g);
    const body = mk('g', { class: 'cm-wbody' }, g);
    mk('circle', { class: 'cm-wglow', r: 15 }, body); mk('circle', { class: 'cm-wdot', r: 10.5 }, body);
    const ini = mk('text', { class: 'cm-wini', y: 3.6, 'text-anchor': 'middle' }, body);
    const lab = mk('g', { class: 'cm-wlabel' }, body); mk('rect', { rx: 6 }, lab); const lt = mk('text', { 'text-anchor': 'middle' }, lab);
    g.dataset.person = p.id;
    return { g, trail, body, ini, lab, lt, x: p.x, y: p.y, track: null, tStart: 0, dur: 6000, hist: [] };
  }
  function setPeople(list, { horizon = 6000 } = {}) {
    if (mini) return;
    const now = performance.now(); const seen = new Set();
    for (const p of list) {
      seen.add(p.id);
      let w = walkers.get(p.id);
      if (!w) { w = createWalker(p); walkers.set(p.id, w); }
      const first = p.name.split(' ')[0];
      w.p = p;
      w.g.style.setProperty('--c', p.friend ? '#22d3ee' : (p.color || '#f59e0b'));
      w.g.classList.toggle('friend', Boolean(p.friend)); w.g.classList.toggle('car', p.mode === 'carro');
      w.ini.textContent = p.name.split(' ').map((s) => s[0]).join('').slice(0, 2);
      if (w.lt.textContent !== first) { w.lt.textContent = first; const wd = first.length * 6.3 + 12; w.lab.firstChild.setAttribute('x', -wd / 2); w.lab.firstChild.setAttribute('y', -29); w.lab.firstChild.setAttribute('width', wd); w.lab.firstChild.setAttribute('height', 17); w.lt.setAttribute('y', -16.5); }
      if (p.moving && p.wp?.length) {
        const far = Math.hypot(w.x - p.x, w.y - p.y) > 40;
        const sx = far ? p.x : w.x; const sy = far ? p.y : w.y;
        w.track = [[sx, sy], ...p.wp]; w.tStart = now; w.dur = horizon;
      } else { w.track = null; w.x = p.x; w.y = p.y; w.hist.length = 0; }
    }
    for (const [id, w] of walkers) if (!seen.has(id)) { w.g.remove(); walkers.delete(id); }
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function frame(ts) {
    raf = requestAnimationFrame(frame);
    const k = px(); const kChanged = Math.abs(k - lastK) > 1e-4; lastK = k;
    const now = performance.now();
    for (const w of walkers.values()) {
      let moved = false;
      if (w.track) {
        const u = Math.min(1, (now - w.tStart) / w.dur); const segs = w.track.length - 1; const f = u * segs; const i = Math.min(segs - 1, Math.floor(f)); const r = f - i;
        const a = w.track[i]; const b = w.track[i + 1];
        w.x = a[0] + (b[0] - a[0]) * r; w.y = a[1] + (b[1] - a[1]) * r; moved = true;
        w.hist.push([now, w.x, w.y]); while (w.hist.length && now - w.hist[0][0] > 2600) w.hist.shift();
      } else if (w.hist.length) { while (w.hist.length && now - w.hist[0][0] > 2600) w.hist.shift(); moved = true; }
      if (moved || kChanged) {
        w.body.setAttribute('transform', `translate(${w.x.toFixed(1)},${w.y.toFixed(1)}) scale(${k.toFixed(4)})`);
        w.trail.setAttribute('points', w.hist.length > 1 ? w.hist.map((h) => `${h[1].toFixed(1)},${h[2].toFixed(1)}`).join(' ') : '');
      }
    }
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
    const hs = e.target.closest('[data-house]'); if (hs) { onPick?.({ type: 'house', id: hs.dataset.house }); return; }
    const d = e.target.closest('[data-district]'); if (d) onPick?.({ type: 'district', id: d.dataset.district });
  });
  host.querySelectorAll('[data-z]').forEach((b) => { b.onclick = () => {
    if (b.dataset.z === 'in') zoomAt(1.5, vb[0] + vb[2] / 2, vb[1] + vb[3] / 2);
    if (b.dataset.z === 'out') zoomAt(1 / 1.5, vb[0] + vb[2] / 2, vb[1] + vb[3] / 2);
    if (b.dataset.z === 'all') { vb = [0, 0, geo.w, geo.h]; set(); }
    if (b.dataset.z === 'me' && data.me?.xy) focus(data.me.xy[0], data.me.xy[1], 600);
  }; });
  new ResizeObserver(() => { scaleMarkers(); lastK = 0; }).observe(svg);
  return {
    setData(d) { data = { ...data, ...d }; paint(); },
    setFilter(f) { filter = f && f.size ? f : null; paint(); },
    select(id) { selected = id; paint(); const p = data.places.find((x) => x.id === id); if (p) focus(p.x, p.y, 700); },
    focus, view, setPeople,
    destroy() { cancelAnimationFrame(raf); raf = 0; clearTimeout(viewTimer); },
    drawRoute(pathPts) { routeG.innerHTML = pathPts?.length ? `<polyline points="${pathPts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#000" stroke-width="16" stroke-linejoin="round" opacity=".5"/><polyline class="cm-route-line" points="${pathPts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="#a855f7" stroke-width="9" stroke-linejoin="round" stroke-linecap="round"/>` : ''; },
  };
}
