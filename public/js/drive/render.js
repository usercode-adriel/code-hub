// CityMap (renderização) — desenha a cidade em pixel art 16-bit, em blocos de 256×256 unidades guardados em cache
// (2 pixels de tela por unidade). Só os blocos visíveis são desenhados; um mapa geral reduzido serve para o zoom
// afastado e para o minimapa. À noite, cada fonte de luz (postes, janelas, fachadas, faróis, pista) é desenhada
// individualmente sobre uma camada de escuridão.
const CH = 256; const PXU = 2;

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = (a, b, c = 0) => { let h = (a * 73856093) ^ (b * 19349663) ^ (c * 83492791); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16); const c = (v) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0'); return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`; };

// texturas (1 pixel da textura = 1 unidade do mundo)
function texture(size, base, dots, seed, extra) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, size, size);
  const r = rng(seed);
  for (const [col, n] of dots) { x.fillStyle = col; for (let i = 0; i < n; i++) x.fillRect(Math.floor(r() * size), Math.floor(r() * size), 1, 1); }
  extra?.(x, r, size);
  return c;
}
function makeTextures() {
  const T = {
    grass: texture(32, '#2f5d27', [['#386b2e', 120], ['#275021', 90], ['#40763a', 30], ['#21461c', 24]], 1),
    park: texture(32, '#33662a', [['#3d7633', 110], ['#2b5824', 80], ['#488340', 20], ['#234a1e', 20]], 2),
    sand: texture(32, '#e8cf8a', [['#f2dca0', 90], ['#d8bb76', 80], ['#c9aa68', 15]], 3),
    water: texture(32, '#2f6fd0', [['#3a80e0', 80], ['#2a62bd', 60]], 4, (x, r) => { x.fillStyle = '#7fb4f2'; for (let i = 0; i < 6; i++) { const px = Math.floor(r() * 28); const py = Math.floor(r() * 32); x.fillRect(px, py, 4, 1); } }),
    road: texture(32, '#4a4d57', [['#555862', 140], ['#41444c', 120], ['#5d606a', 25]], 5),
    lot: texture(32, '#565962', [['#61646d', 120], ['#4d5058', 100]], 6),
    runway: texture(32, '#3c3f47', [['#464951', 120], ['#35383f', 100]], 7),
    walk: texture(16, '#bdb8ad', [['#c9c4b9', 30], ['#aea99e', 30]], 8, (x) => { x.fillStyle = '#a39e93'; x.fillRect(0, 0, 16, 1); x.fillRect(0, 0, 1, 16); x.fillRect(0, 8, 16, 1); x.fillRect(8, 0, 1, 8); x.fillRect(4, 8, 1, 8); x.fillRect(12, 8, 1, 8); }),
    // calçamento de pedra dos quarteirões (fiadas desencontradas)
    pave: texture(16, '#8b867c', [['#958f84', 34], ['#7f7a71', 34], ['#9a948a', 10]], 11, (x) => { x.fillStyle = '#726d65'; x.fillRect(0, 0, 16, 1); x.fillRect(0, 8, 16, 1); x.fillRect(0, 0, 1, 8); x.fillRect(8, 8, 1, 8); }),
    plaza: texture(12, '#cdbd9c', [['#d8c9a8', 14], ['#bfae8c', 14]], 9, (x) => { x.fillStyle = '#b3a283'; x.fillRect(0, 0, 12, 1); x.fillRect(0, 0, 1, 6); x.fillRect(6, 6, 1, 6); x.fillRect(0, 6, 12, 1); }),
  };
  return T;
}

export function createRenderer(city, assets, { mobile = false } = {}) {
  const T = makeTextures();
  const pat = {};
  const tmp = document.createElement('canvas').getContext('2d');
  for (const [k, c] of Object.entries(T)) pat[k] = tmp.createPattern(c, 'repeat');
  // texturas da folha de ruas e calçadas (quando carregadas)
  if (assets.img['tiles/sidewalk']) pat.walk = tmp.createPattern(assets.img['tiles/sidewalk'], 'repeat');
  if (assets.img['tiles/asphalt']) pat.road = tmp.createPattern(assets.img['tiles/asphalt'], 'repeat');
  const frontImg = assets.img['tiles/front'];
  const img = (k) => assets.img[k];
  // índice espacial dos elementos por bloco
  const bins = new Map(); const binKey = (i, j) => `${i},${j}`;
  const addBin = (kind, o, x, y, w, h) => { for (let i = Math.floor(x / CH); i <= Math.floor((x + w) / CH); i++) for (let j = Math.floor(y / CH); j <= Math.floor((y + h) / CH); j++) { const k = binKey(i, j); let b = bins.get(k); if (!b) bins.set(k, (b = { g: [], b: [], p: [], d: [] })); b[kind].push(o); } };
  function index() {
    bins.clear();
    city.ground.forEach((g, i) => { g.i = i; addBin('g', g, g.x - 4, g.y - 4, g.w + 8, g.h + 8); });
    city.blds.forEach((b, i) => { b.i = i; addBin('b', b, b.x - 4, b.y - 50, b.w + 30, b.h + 60); });
    city.props.forEach((p, i) => { p.i = i; const r = Math.max(p.w, p.h); addBin('p', p, p.x - r, p.y - r - 4, r * 2, r + 8); });
    (city.decals || []).forEach((d) => addBin('d', d, d.x, d.y, d.w, d.h));
  }
  index();
  // limites do mapa (núcleo da cidade + terreno das expansões) e a costa desenhada
  const BD = () => city.bounds || { x0: 0, y0: 0, x1: city.W, y1: city.H };
  let coastPaths = null;
  function coastP() {
    if (coastPaths || !city.coast?.land) return coastPaths;
    const mk = (polys) => { const p = new Path2D(); for (const poly of polys) { poly.forEach(([px, py], k) => (k ? p.lineTo(px, py) : p.moveTo(px, py))); p.closePath(); } return p; };
    coastPaths = { land: mk(city.coast.land), lakes: mk(city.coast.lakes || []), hasLakes: (city.coast.lakes || []).length > 0 };
    return coastPaths;
  }
  const BW = 34 * 2; // areia dos dois lados da linha da costa (mesma regra da máscara)
  function drawCoast(x, rect) {
    const C = coastP(); if (!C) return;
    x.fillStyle = pat.water; x.fillRect(rect[0], rect[1], CH, CH);
    x.save(); x.lineJoin = 'round';
    x.strokeStyle = 'rgba(120,190,245,.5)'; x.lineWidth = BW + 70; x.stroke(C.land);
    x.strokeStyle = 'rgba(160,215,250,.6)'; x.lineWidth = BW + 30; x.stroke(C.land);
    x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = BW + 8; x.stroke(C.land);
    x.fillStyle = pat.grass; x.fill(C.land);
    x.strokeStyle = pat.sand; x.lineWidth = BW; x.stroke(C.land);
    if (C.hasLakes) {
      x.fillStyle = pat.water; x.fill(C.lakes);
      x.save(); x.clip(C.lakes); x.strokeStyle = 'rgba(140,200,245,.55)'; x.lineWidth = BW + 40; x.stroke(C.lakes); x.restore();
      x.strokeStyle = pat.sand; x.lineWidth = BW; x.stroke(C.lakes);
    }
    x.restore();
  }
  // sprites das folhas extras ('x:chave') e do pacote de decoração ('d:chave')
  const sprImg = (spr, base) => (spr.startsWith('x:') ? img(`extra/${spr.slice(2)}`) : spr.startsWith('d:') ? img(`deco/${spr.slice(2)}`) : img(`${base}/${spr}`));
  const MAT_ORDER = ['water', 'sand', 'grass', 'plaza', 'front', 'walk', 'base', 'curb', 'pave', 'lot', 'bed', 'pond', 'access', 'road', 'cross', 'runway'];

  const polyPath = (x, g) => { x.beginPath(); g.pts.forEach(([px, py], k) => (k ? x.lineTo(px, py) : x.moveTo(px, py))); x.closePath(); };
  function fillShape(x, g, style) {
    x.fillStyle = style;
    if (g.shape === 'poly') { polyPath(x, g); x.fill(); return; }
    if (g.shape === 'ellipse') { x.beginPath(); x.ellipse(g.x + g.w / 2, g.y + g.h / 2, g.w / 2, g.h / 2, 0, 0, Math.PI * 2); x.fill(); } else x.fillRect(g.x, g.y, g.w, g.h);
  }
  // elementos desenhados no chão: chafariz, ninfeia, píer de madeira e heliponto
  function drawFeature(x, d) {
    const cx = d.x + d.w / 2; const cy = d.y + d.h / 2; const r = d.w / 2;
    if (d.spr === '@fonte') {
      x.fillStyle = 'rgba(20,20,30,.25)'; x.beginPath(); x.ellipse(cx + 2, cy + 3, r, r * 0.9, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#9b958a'; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#6f6a61'; x.lineWidth = 1.5; x.stroke();
      x.fillStyle = '#c9c3b6'; x.beginPath(); x.arc(cx, cy, r - 3, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#3b8ad8'; x.beginPath(); x.arc(cx, cy, r - 6, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#6fb8f0'; for (let k = 0; k < 6; k++) { const a = k * 1.05; x.fillRect(cx + Math.cos(a) * (r - 11) - 2, cy + Math.sin(a) * (r - 11), 4, 1); }
      x.fillStyle = '#b5ae9f'; x.beginPath(); x.arc(cx, cy, r * 0.32, 0, Math.PI * 2); x.fill(); x.strokeStyle = '#7d776c'; x.lineWidth = 1; x.stroke();
      x.fillStyle = '#9fd8ff'; x.beginPath(); x.arc(cx, cy - 1, r * 0.2, 0, Math.PI * 2); x.fill(); x.fillStyle = '#ffffff'; x.beginPath(); x.arc(cx - 1, cy - 2, r * 0.08 + 0.6, 0, Math.PI * 2); x.fill();
      return;
    }
    if (d.spr === '@ninfeia') { x.fillStyle = '#3f8f3a'; x.beginPath(); x.ellipse(cx, cy, d.w / 2, d.h / 2, 0, 0.35, Math.PI * 2); x.lineTo(cx, cy); x.fill(); x.fillStyle = '#5fb04a'; x.beginPath(); x.ellipse(cx - 1, cy - 1, d.w / 4, d.h / 4, 0, 0, Math.PI * 2); x.fill(); if (d.w > 14) { x.fillStyle = '#f2a6c8'; x.fillRect(cx + 2, cy - 2, 3, 3); } return; }
    if (d.spr === '@pier') { x.fillStyle = 'rgba(10,30,60,.3)'; x.fillRect(d.x + 2, d.y + 3, d.w, d.h); x.fillStyle = '#8a5a34'; x.fillRect(d.x, d.y, d.w, d.h); x.fillStyle = '#a8743f'; for (let k = d.y + 1; k < d.y + d.h; k += 5) x.fillRect(d.x + 1, k, d.w - 2, 3); x.fillStyle = '#5a3a20'; for (const px of [d.x, d.x + d.w - 3]) for (let k = d.y + 2; k < d.y + d.h; k += 14) x.fillRect(px, k, 3, 3); return; }
    if (d.spr === '@heli') { x.fillStyle = '#4a4d57'; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); x.strokeStyle = '#f2c94c'; x.lineWidth = 2; x.beginPath(); x.arc(cx, cy, r - 4, 0, Math.PI * 2); x.stroke(); x.fillStyle = '#f0f0ea'; x.fillRect(cx - 9, cy - 11, 4, 22); x.fillRect(cx + 5, cy - 11, 4, 22); x.fillRect(cx - 5, cy - 2, 10, 4); }
  }
  function drawCourt(x, g) { x.fillStyle = '#3f8f5a'; x.fillRect(g.x + 10, g.y + 10, g.w - 20, g.h - 20); x.strokeStyle = '#f0f0f0'; x.lineWidth = 1; x.strokeRect(g.x + 14, g.y + 14, g.w - 28, g.h - 28); x.beginPath(); x.moveTo(g.x + g.w / 2, g.y + 14); x.lineTo(g.x + g.w / 2, g.y + g.h - 14); x.stroke(); }
  function drawGround(x, list) {
    const sorted = list.slice().sort((a, b) => (a.u || 0) - (b.u || 0) || MAT_ORDER.indexOf(a.mat) - MAT_ORDER.indexOf(b.mat) || a.i - b.i);
    for (const g of sorted) {
      if (g.island) { fillShape(x, g, pat.park); x.fillStyle = '#e8e4da'; x.beginPath(); x.ellipse(g.x + g.w / 2, g.y + g.h / 2, g.w / 2, g.h / 2, 0, 0, Math.PI * 2); x.lineWidth = 2; x.strokeStyle = '#e8e4da'; x.stroke(); continue; }
      if (g.pool) { x.fillStyle = '#e8eef2'; x.fillRect(g.x - 2, g.y - 2, g.w + 4, g.h + 4); fillShape(x, g, '#4cb4f0'); x.fillStyle = '#8fd4ff'; x.fillRect(g.x + 2, g.y + 2, g.w - 8, 1); continue; }
      // distritos: asfalto; quarteirões: calçada com meio-fio, calçamento de pedra e canteiros com borda
      if (g.mat === 'base') { fillShape(x, g, pat.road); continue; }
      if (g.mat === 'curb') { fillShape(x, g, pat.walk); polyPath(x, g); x.strokeStyle = '#5f5b54'; x.lineWidth = 2; x.stroke(); x.strokeStyle = 'rgba(255,255,255,.22)'; x.lineWidth = 0.8; x.stroke(); continue; }
      if (g.mat === 'pave') { fillShape(x, g, pat.pave); if (g.shape === 'poly') { polyPath(x, g); x.strokeStyle = 'rgba(60,55,48,.55)'; x.lineWidth = 1; x.stroke(); } if (g.court) drawCourt(x, g); continue; }
      if (g.mat === 'bed') { fillShape(x, g, pat.park); if (g.shape === 'poly') { polyPath(x, g); x.strokeStyle = '#2a4a1f'; x.lineWidth = 3; x.stroke(); x.strokeStyle = '#8a7a5c'; x.lineWidth = 1; x.stroke(); } continue; }
      if (g.mat === 'cross' && g.shape === 'poly') { fillShape(x, g, pat.road); continue; }
      if (g.tex) { const im = sprImg(g.tex); if (im) { if (g.rot) { x.save(); x.translate(g.x + g.w / 2, g.y + g.h / 2); x.rotate(g.rot); x.drawImage(im, -g.w / 2, -g.h / 2, g.w, g.h); x.restore(); } else x.drawImage(im, g.x, g.y, g.w, g.h); continue; } }
      if (g.mat === 'access') { x.fillStyle = pat.road; x.fillRect(g.x, g.y, g.w, g.h); x.fillStyle = '#8f8a80'; x.fillRect(g.x, g.y, g.w, 1); x.fillRect(g.x, g.y + g.h - 1, g.w, 1); x.fillStyle = 'rgba(236,235,230,.7)'; for (let k = g.x + 6; k < g.x + g.w - 6; k += 12) x.fillRect(k, g.y + g.h / 2 - 0.5, 6, 1); continue; }
      if (g.mat === 'front') { if (frontImg) { for (let k = g.x; k < g.x + g.w; k += 16) { const w = Math.min(16, g.x + g.w - k); x.drawImage(frontImg, 0, 0, w, 11, k, g.y, w, g.h); } } else fillShape(x, g, pat.walk); continue; }
      const style = g.mat === 'grass' ? (g.park ? pat.park : pat.grass) : g.mat === 'cross' ? pat.road : g.mat === 'pond' ? pat.water : pat[g.mat] || pat.grass;
      fillShape(x, g, style);
      if (g.mat === 'pond' && g.shape === 'poly') { polyPath(x, g); x.strokeStyle = 'rgba(160,215,250,.55)'; x.lineWidth = 6; x.stroke(); x.strokeStyle = '#d8c48a'; x.lineWidth = 3; x.stroke(); }
      if (g.mat === 'pond' && g.shape === 'ellipse') { x.strokeStyle = '#e8cf8a'; x.lineWidth = 3; x.beginPath(); x.ellipse(g.x + g.w / 2, g.y + g.h / 2, g.w / 2, g.h / 2, 0, 0, Math.PI * 2); x.stroke(); }
      if (g.mat === 'lot' && g.stalls) { x.fillStyle = '#e8e4da'; for (let k = g.x + 12; k < g.x + g.w - 8; k += 22) { x.fillRect(k, g.y + 20, 1, 30); x.fillRect(k, g.y + g.h - 50, 1, 30); } }
      if (g.mat === 'lot' && g.industrial) { x.fillStyle = 'rgba(247,201,72,.5)'; for (let k = g.x; k < g.x + g.w; k += 40) x.fillRect(k, g.y + g.h - 4, 20, 2); }
      if (g.court) drawCourt(x, g);
      if (g.mat === 'cross') { x.fillStyle = '#ecebe6'; if (g.dir === 'v') for (let k = g.y + 2; k < g.y + g.h - 1; k += 5) x.fillRect(g.x, k, g.w, 3); else for (let k = g.x + 2; k < g.x + g.w - 1; k += 5) x.fillRect(k, g.y, 3, g.h); }
      if (g.mat === 'runway') runwayMarks(x, g);
    }
  }
  function runwayMarks(x, g) {
    if (g.kind === 'runway') {
      x.fillStyle = '#e8e8e8'; const cy = g.y + g.h / 2;
      for (let k = g.x + 60; k < g.x + g.w - 60; k += 36) x.fillRect(k, cy - 1, 20, 2);
      for (const ex of [g.x + 6, g.x + g.w - 30]) for (let j = g.y + 6; j < g.y + g.h - 6; j += 8) x.fillRect(ex, j, 24, 4);
      x.fillRect(g.x, g.y + 2, g.w, 1); x.fillRect(g.x, g.y + g.h - 3, g.w, 1);
      x.font = 'bold 14px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.save(); x.translate(g.x + 46, cy); x.rotate(Math.PI / 2); x.fillText('09', 0, 0); x.restore(); x.save(); x.translate(g.x + g.w - 46, cy); x.rotate(-Math.PI / 2); x.fillText('27', 0, 0); x.restore();
    } else if (g.kind === 'taxi') { x.fillStyle = '#f2c94c'; if (g.w > g.h) { for (let k = g.x; k < g.x + g.w; k += 10) x.fillRect(k, g.y + g.h / 2 - 0.5, 6, 1); } else for (let k = g.y; k < g.y + g.h; k += 10) x.fillRect(g.x + g.w / 2 - 0.5, k, 1, 6); }
    else if (g.kind === 'apron') { x.fillStyle = '#f2c94c'; for (const [sx, sy] of city.planeSpots) { x.fillRect(sx - 30, sy + 26, 60, 1); x.fillRect(sx - 0.5, sy - 30, 1, 56); } }
  }
  // marcações das ruas e acabamento dos cruzamentos
  // marcações das faixas ao longo de qualquer traçado (retas, diagonais e curvas), cortadas antes dos cruzamentos
  const offPts = (pts, o) => pts.map((p, i) => { const a = pts[Math.max(0, i - 1)]; const b = pts[Math.min(pts.length - 1, i + 1)]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [p[0] - ((b[1] - a[1]) / l) * o, p[1] + ((b[0] - a[0]) / l) * o]; });
  const trimPts = (pts, a, b) => {
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = cum.at(-1); if (L - a - b < 8) return null;
    const pt = (s) => { let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const t = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]; };
    const out = [pt(a)]; for (let i = 1; i < pts.length - 1; i++) if (cum[i] > a && cum[i] < L - b) out.push(pts[i]); out.push(pt(L - b)); return { pts: out, len: L - a - b, pt: (s) => pt(a + s), raw: pts, a };
  };
  const MARKS = (city.lines || []).map((L) => { const t = trimPts(L.pts, L.ca, L.cb); if (!t) return null; const bb = [Infinity, Infinity, -Infinity, -Infinity]; for (const [px, py] of L.pts) { bb[0] = Math.min(bb[0], px); bb[1] = Math.min(bb[1], py); bb[2] = Math.max(bb[2], px); bb[3] = Math.max(bb[3], py); } return { ...L, t, bb }; }).filter(Boolean);
  const strokePts = (x, pts) => { x.beginPath(); pts.forEach(([px, py], k) => (k ? x.lineTo(px, py) : x.moveTo(px, py))); x.stroke(); };
  function roadMarks(x, rect) {
    const [rx0, ry0, rx1, ry1] = rect;
    x.save(); x.lineCap = 'butt';
    for (const M of MARKS) {
      if (M.bb[2] + 40 < rx0 || M.bb[0] - 40 > rx1 || M.bb[3] + 40 < ry0 || M.bb[1] - 40 > ry1) continue;
      const hw = M.w / 2; const P = M.t.pts;
      // bordas brancas (vias largas) e eixo: avenida = dupla amarela contínua; anel/diagonal = amarela tracejada longa; rua = tracejada
      x.strokeStyle = 'rgba(236,235,230,.72)'; x.lineWidth = 1; x.setLineDash([]);
      if (M.w >= 40) { strokePts(x, offPts(P, hw - 3)); strokePts(x, offPts(P, -(hw - 3))); }
      x.strokeStyle = '#f2c94c';
      if (M.w >= 48) { strokePts(x, offPts(P, 1.6)); strokePts(x, offPts(P, -1.6)); }
      else { x.setLineDash(M.w >= 40 ? [12, 8] : [7, 7]); strokePts(x, P); x.setLineDash([]); }
      // setas no asfalto antes dos cruzamentos (uma por sentido)
      if (M.t.len > 120 && !M.ext) {
        for (const dir of [1, -1]) {
          const s = dir > 0 ? M.t.len - 30 : 30; const p = M.t.pt(s); const q = M.t.pt(s - dir * 4); const ang = Math.atan2(p[1] - q[1], p[0] - q[0]);
          const o = M.w * 0.24; const ax = p[0] - Math.sin(ang) * o; const ay = p[1] + Math.cos(ang) * o;
          x.save(); x.translate(ax, ay); x.rotate(ang); x.fillStyle = 'rgba(240,240,236,.85)'; x.fillRect(-10, -0.8, 8, 1.6); x.beginPath(); x.moveTo(2, 0); x.lineTo(-3, -3.2); x.lineTo(-3, 3.2); x.closePath(); x.fill(); x.restore();
          // linha de parada
          const sp = M.t.pt(dir > 0 ? M.t.len - 2 : 2); x.save(); x.translate(sp[0], sp[1]); x.rotate(ang); x.fillStyle = 'rgba(240,240,236,.8)'; x.fillRect(-1, 1, 2, hw - 2); x.restore();
        }
      }
    }
    // rotatórias: anel branco e ilha central ajardinada
    for (const n of Object.values(city.nodeInfo || {})) {
      if (n.kind !== 'round' || n.x < rx0 - 80 || n.x > rx1 + 80 || n.y < ry0 - 80 || n.y > ry1 + 80) continue;
      x.fillStyle = pat.road; x.beginPath(); x.arc(n.x, n.y, 46, 0, Math.PI * 2); x.fill();
      x.strokeStyle = 'rgba(236,235,230,.8)'; x.lineWidth = 1; x.setLineDash([6, 5]); x.beginPath(); x.arc(n.x, n.y, 31, 0, Math.PI * 2); x.stroke(); x.setLineDash([]);
      x.fillStyle = pat.walk; x.beginPath(); x.arc(n.x, n.y, 20, 0, Math.PI * 2); x.fill(); x.fillStyle = pat.park; x.beginPath(); x.arc(n.x, n.y, 16, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#5f5b54'; x.lineWidth = 1.5; x.beginPath(); x.arc(n.x, n.y, 20, 0, Math.PI * 2); x.stroke();
    }
    // faixas de pedestre (giradas conforme a rua)
    for (const g of city.ground) {
      if (g.mat !== 'cross' || g.x > rx1 + 10 || g.x + g.w < rx0 - 10 || g.y > ry1 + 10 || g.y + g.h < ry0 - 10) continue;
      x.fillStyle = '#ecebe6';
      if (g.shape === 'poly') { x.save(); x.translate(g.cx, g.cy); x.rotate(g.ang); for (let k = -g.cw / 2 + 2; k < g.cw / 2 - 2; k += 5) x.fillRect(-5, k, 10, 3); x.restore(); }
      else if (g.dir === 'v') for (let k = g.y + 2; k < g.y + g.h - 1; k += 5) x.fillRect(g.x, k, g.w, 3); else for (let k = g.x + 2; k < g.x + g.w - 1; k += 5) x.fillRect(k, g.y, 3, g.h);
    }
    x.restore();
    // pontes: guarda-corpo de pedra e sombra na água
    for (const b of city.bridges) {
      if (b.x > rx1 || b.x + b.w < rx0 || b.y > ry1 || b.y + b.h < ry0) continue;
      x.fillStyle = '#9a9488'; x.fillRect(b.x, b.y, 3, b.h); x.fillRect(b.x + b.w - 3, b.y, 3, b.h);
      x.fillStyle = '#c8c2b4'; for (let k = b.y; k < b.y + b.h; k += 8) { x.fillRect(b.x, k, 3, 2); x.fillRect(b.x + b.w - 3, k, 3, 2); }
    }
    // entradas de carro
    for (const d of city.driveways) { if (d[0] > rx1 || d[0] + d[2] < rx0 || d[1] > ry1 || d[1] + d[3] < ry0) continue; x.fillStyle = pat.lot; x.fillRect(...d); }
    // cerca do aeroporto
    x.fillStyle = '#9098a4'; for (const f of city.fence) { if (f[0] > rx1 || f[0] + f[2] < rx0 || f[1] > ry1 || f[1] + f[3] < ry0) continue; x.fillRect(...f); }
    x.fillStyle = '#d0d6de'; for (const f of city.fence) for (let k = 0; k < Math.max(f[2], f[3]); k += 10) { if (f[2] > f[3]) x.fillRect(f[0] + k, f[1], 1, f[3]); else x.fillRect(f[0], f[1] + k, f[2], 1); }
  }

  // ---------------------------------------------------------------- construções (telhado + fachada sul em 3/4)
  const sil = new Map();
  function silhouette(k, im) { let c = sil.get(k); if (c) return c; c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#0a0e1e'; g.fillRect(0, 0, c.width, c.height); sil.set(k, c); return c; }
  function drawBuilding(x, b, lit) {
    if (b.kind === 'sprite') {
      const im = img(`bld/${b.spr}`);
      if (im) {
        // sombra suave à direita/abaixo e o sprite ocupando exatamente o lote
        x.globalAlpha = 0.28; x.drawImage(silhouette(`bld/${b.spr}`, im), b.x + 5, b.y + 4, b.w, b.h); x.globalAlpha = 1;
        x.drawImage(im, b.x, b.y, b.w, b.h);
        const L = img(`bld/${b.spr}-lit`); if (L) lit.push({ img: L, x: b.x, y: b.y, w: b.w, h: b.h });
        return;
      }
    }
    const R = rng(b.i * 977 + 13);
    if (b.round) { // tanque
      const cx = b.x + b.w / 2; const cy = b.y + b.h / 2; const r = b.w / 2;
      x.fillStyle = 'rgba(0,0,0,.28)'; x.beginPath(); x.ellipse(cx + 6, cy + 6, r, r, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#9aa2aa'; x.beginPath(); x.ellipse(cx, cy, r, r, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#c8ccd0'; x.beginPath(); x.ellipse(cx - 2, cy - 2, r - 4, r - 4, 0, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#8a929a'; x.lineWidth = 1; x.beginPath(); x.ellipse(cx - 2, cy - 2, r * 0.6, r * 0.6, 0, 0, Math.PI * 2); x.stroke();
      x.fillStyle = '#e8ecef'; x.fillRect(cx - r * 0.5, cy - r * 0.6, 4, 2); return;
    }
    if (b.kind === 'conteiner') {
      x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect(b.x + 3, b.y + 3, b.w, b.h);
      x.fillStyle = b.roof; x.fillRect(b.x, b.y, b.w, b.h); x.fillStyle = shade(b.roof, 0.75);
      for (let k = b.x + 2; k < b.x + b.w - 1; k += 3) x.fillRect(k, b.y + 1, 1, b.h - 2);
      x.strokeStyle = shade(b.roof, 0.55); x.lineWidth = 1; x.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1); return;
    }
    if (b.canopy) { // posto: cobertura + bombas
      x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      x.fillStyle = '#5a5d66'; for (const [px, py] of [[b.x + 10, b.y + 10], [b.x + b.w - 18, b.y + 10], [b.x + b.w / 2 - 4, b.y + b.h - 20]]) x.fillRect(px, py, 8, 8);
      x.fillStyle = b.roof; x.fillRect(b.x, b.y, b.w, b.h - 14); x.fillStyle = '#f4f4f4'; x.fillRect(b.x, b.y + b.h - 22, b.w, 4); x.fillStyle = shade(b.roof, 0.7); x.fillRect(b.x, b.y + b.h - 18, b.w, 4);
      for (let k = 0; k < 3; k++) { const px = b.x + 20 + k * ((b.w - 40) / 2); x.fillStyle = '#e84a3a'; x.fillRect(px - 3, b.y + b.h + 4, 6, 9); x.fillStyle = '#f0f0f0'; x.fillRect(px - 2, b.y + b.h + 5, 4, 3); }
      lit.push([b.x, b.y + b.h - 14, b.w, 14, '#fff2c8', 0.5]); return;
    }
    const floors = b.floors || 2;
    const wallH = b.kind === 'estadio' ? 10 : Math.max(6, Math.min(Math.round(4 + floors * 2.4), Math.floor(b.h * 0.45), 46));
    const rh = b.h - wallH;
    // sombra projetada (sol da tarde: para a direita e para baixo)
    const sh = Math.min(4 + floors * 1.6, 30);
    x.fillStyle = 'rgba(10,14,30,.28)'; x.beginPath(); x.moveTo(b.x + b.w, b.y); x.lineTo(b.x + b.w + sh, b.y + sh * 0.6); x.lineTo(b.x + b.w + sh, b.y + b.h + sh * 0.6); x.lineTo(b.x + sh, b.y + b.h + sh * 0.6); x.lineTo(b.x, b.y + b.h); x.lineTo(b.x + b.w, b.y + b.h); x.fill();
    // fachada sul
    const wy = b.y + rh;
    x.fillStyle = b.wall || '#c8c0b0'; x.fillRect(b.x, wy, b.w, wallH);
    x.fillStyle = shade(b.wall || '#c8c0b0', 0.78); x.fillRect(b.x, wy + wallH - 2, b.w, 2); x.fillRect(b.x, wy, 1, wallH); x.fillRect(b.x + b.w - 1, wy, 1, wallH);
    const storefront = b.facade && b.facade.startsWith('fachada') ? img(`props/${b.facade}`) : null;
    if (storefront) {
      const fh = Math.min(wallH, 22); const fw = Math.round((fh * storefront.width) / storefront.height);
      const n = Math.max(1, Math.min(3, Math.floor((b.w - 4) / (fw + 2))));
      const start = b.x + (b.w - n * (fw + 2)) / 2;
      for (let k = 0; k < n; k++) x.drawImage(storefront, start + k * (fw + 2), wy + wallH - fh, fw, fh);
      lit.push([b.x + 2, wy + wallH - fh * 0.6, b.w - 4, fh * 0.5, '#ffd28a', 0.55]);
    } else {
      // janelas (algumas acesas à noite)
      const rows = Math.max(1, Math.floor((wallH - 4) / 6)); const isTall = floors > 6 || b.kind === 'torre';
      for (let r = 0; r < rows; r++) for (let cx = b.x + 3; cx < b.x + b.w - 4; cx += isTall ? 5 : 7) {
        const wyy = wy + 2 + r * 6; if (b.kind !== 'galpao' && r === rows - 1 && Math.abs(cx - (b.x + b.w / 2)) < 5) continue;
        x.fillStyle = isTall ? '#3a5b8f' : '#34507a'; x.fillRect(cx, wyy, isTall ? 3 : 4, 3);
        x.fillStyle = '#8fb4e8'; x.fillRect(cx, wyy, 1, 1);
        if (hash(b.i, r, cx) < (b.kind === 'galpao' ? 0.25 : 0.55)) lit.push([cx, wyy, isTall ? 3 : 4, 3, isTall ? '#cfe2ff' : '#ffd88a', 1]);
      }
      if (b.kind !== 'galpao') { x.fillStyle = '#5b3a24'; x.fillRect(b.x + b.w / 2 - 3, wy + wallH - 7, 6, 6); x.fillStyle = '#8a5a34'; x.fillRect(b.x + b.w / 2 - 2, wy + wallH - 6, 1, 5); }
      else { x.fillStyle = '#6a7078'; x.fillRect(b.x + b.w / 2 - 12, wy + wallH - 12, 24, 11); x.fillStyle = '#7a8088'; for (let k = 0; k < 11; k += 2) x.fillRect(b.x + b.w / 2 - 12, wy + wallH - 12 + k, 24, 1); }
    }
    if (b.awning) { const a = img(`props/${b.awning}`); if (a) { const aw = Math.min(b.w - 6, 30); const ah = Math.round((aw * a.height) / a.width * 0.5); x.drawImage(a, 0, 0, a.width, a.height * 0.5, b.x + (b.w - aw) / 2, wy - 1, aw, ah); } }
    // telhado
    const roof = b.roof || '#7a7f8a';
    x.fillStyle = roof; x.fillRect(b.x, b.y, b.w, rh);
    x.fillStyle = shade(roof, 1.18); x.fillRect(b.x, b.y, b.w, 1); x.fillRect(b.x, b.y, 1, rh);
    x.fillStyle = shade(roof, 0.7); x.fillRect(b.x, b.y + rh - 1, b.w, 1); x.fillRect(b.x + b.w - 1, b.y, 1, rh);
    if (b.kind === 'casa') {
      x.fillStyle = shade(roof, 0.82); x.fillRect(b.x + 1, b.y + rh / 2, b.w - 2, rh / 2 - 1);
      x.fillStyle = shade(roof, 1.3); x.fillRect(b.x + 1, b.y + Math.floor(rh / 2), b.w - 2, 1);
      x.fillStyle = shade(roof, 0.65); for (let k = b.y + 3; k < b.y + rh - 2; k += 3) if (Math.abs(k - (b.y + rh / 2)) > 1) x.fillRect(b.x + 2, k, b.w - 4, 1);
      if (R() < 0.7) { x.fillStyle = '#8a5a44'; x.fillRect(b.x + b.w * 0.7, b.y + 2, 4, 5); x.fillStyle = '#5a3a2c'; x.fillRect(b.x + b.w * 0.7, b.y + 2, 4, 1); }
    } else if (b.kind === 'galpao' || b.kind === 'hangar') {
      x.fillStyle = shade(roof, 0.85); for (let k = b.x + 2; k < b.x + b.w - 1; k += 4) x.fillRect(k, b.y + 1, 2, rh - 2);
      if (b.chimney) { x.fillStyle = '#7a5a4a'; x.fillRect(b.x + b.w - 20, b.y + 6, 10, 10); x.fillStyle = '#4a3a30'; x.fillRect(b.x + b.w - 18, b.y + 8, 6, 6); }
      if (b.kind === 'hangar') { x.fillStyle = 'rgba(255,255,255,.4)'; x.fillRect(b.x + b.w / 2 - 1, b.y + 2, 2, rh - 4); }
    } else if (b.kind === 'estadio') {
      x.fillStyle = '#8a92a2'; x.fillRect(b.x + 2, b.y + 2, b.w - 4, rh - 4);
      x.fillStyle = '#3f9a4a'; x.fillRect(b.x + 26, b.y + 22, b.w - 52, rh - 44);
      x.fillStyle = '#4caa58'; for (let k = b.x + 26; k < b.x + b.w - 26; k += 20) x.fillRect(k, b.y + 22, 10, rh - 44);
      x.strokeStyle = '#f0f0f0'; x.lineWidth = 1; x.strokeRect(b.x + 30, b.y + 26, b.w - 60, rh - 52); x.beginPath(); x.moveTo(b.x + b.w / 2, b.y + 26); x.lineTo(b.x + b.w / 2, b.y + rh - 26); x.stroke(); x.beginPath(); x.ellipse(b.x + b.w / 2, b.y + rh / 2, 14, 14, 0, 0, Math.PI * 2); x.stroke();
      x.fillStyle = '#c84a4a'; for (let k = b.x + 6; k < b.x + b.w - 6; k += 3) { x.fillRect(k, b.y + 6, 1, 10); x.fillRect(k, b.y + rh - 16, 1, 10); }
      lit.push([b.x + 26, b.y + 22, b.w - 52, rh - 44, '#f8ffe8', 0.35]);
    } else if (b.kind === 'terminal') {
      x.fillStyle = '#8fc4e0'; for (let k = b.x + 4; k < b.x + b.w - 6; k += 10) x.fillRect(k, b.y + 4, 7, rh - 8);
      x.fillStyle = 'rgba(255,255,255,.5)'; for (let k = b.x + 4; k < b.x + b.w - 6; k += 10) x.fillRect(k, b.y + 4, 2, rh - 8);
    } else {
      // equipamentos de telhado
      const n = Math.floor((b.w * rh) / 900);
      for (let k = 0; k < n; k++) { const px = b.x + 4 + R() * (b.w - 14); const py = b.y + 4 + R() * (rh - 12); x.fillStyle = '#d0d4da'; x.fillRect(px, py, 6, 5); x.fillStyle = '#9aa0a8'; x.fillRect(px + 1, py + 1, 4, 1); x.fillRect(px, py + 4, 6, 1); }
      if (b.kind === 'torre' && rh > 30) { x.fillStyle = shade(roof, 0.88); x.fillRect(b.x + 4, b.y + 4, b.w - 8, 2); }
    }
    if (b.helipad && rh > 34) { const cx = b.x + b.w / 2; const cy = b.y + rh / 2; x.fillStyle = '#5a5d66'; x.beginPath(); x.ellipse(cx, cy, 14, 14, 0, 0, Math.PI * 2); x.fill(); x.strokeStyle = '#f2c94c'; x.lineWidth = 1; x.stroke(); x.fillStyle = '#f0f0f0'; x.fillRect(cx - 5, cy - 6, 2, 12); x.fillRect(cx + 3, cy - 6, 2, 12); x.fillRect(cx - 5, cy - 1, 10, 2); }
    if (b.kind === 'hospital') { const cx = b.x + b.w * 0.3; const cy = b.y + rh / 2; x.fillStyle = '#e03a3a'; x.fillRect(cx - 4, cy - 12, 8, 24); x.fillRect(cx - 12, cy - 4, 24, 8); lit.push([cx - 12, cy - 12, 24, 24, '#ff6a6a', 0.35]); }
    if (b.kind === 'policia') { const cx = b.x + b.w / 2; const cy = b.y + rh / 2; x.fillStyle = '#f2c94c'; x.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? 5 : 11; const a = -Math.PI / 2 + (k * Math.PI) / 5; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } x.fill(); }
    if (b.kind === 'bombeiros') { x.fillStyle = '#f0f0f0'; for (let k = b.x + 6; k < b.x + b.w - 6; k += 14) x.fillRect(k, b.y + rh - 8, 8, 3); }
    if (b.kind === 'civico') { x.fillStyle = '#e8e0cc'; for (let k = b.x + 6; k < b.x + b.w - 6; k += 8) x.fillRect(k, wy, 3, wallH - 2); }
    if (b.tower) { const cx = b.x + b.w / 2; const cy = b.y + rh / 2; x.fillStyle = '#4fa8d8'; x.beginPath(); x.ellipse(cx, cy, 16, 16, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = '#d8eef8'; x.beginPath(); x.ellipse(cx, cy, 10, 10, 0, 0, Math.PI * 2); x.fill(); lit.push([cx - 12, cy - 12, 24, 24, '#bfe6ff', 0.6]); }
    if (b.billboard) { const bb = img(`props/${b.billboard}`); if (bb) x.drawImage(bb, b.x + 4, b.y + 2, Math.min(b.w - 8, 34), Math.min(b.w - 8, 34) * (bb.height / bb.width)); }
  }

  function drawProp(x, p) {
    if (p.hidden) return; // obstáculo invisível (bacia do chafariz desenhado no chão)
    if (p.spr.startsWith('d:') || p.spr.startsWith('x:')) {
      const im = sprImg(p.spr); if (!im) return;
      if (p.rot) { x.save(); x.translate(p.x, p.y - p.h / 2); x.rotate(p.rot); x.drawImage(im, -p.w / 2, -p.h / 2, p.w, p.h); x.restore(); return; }
      if (p.solid || p.h > 14) { x.fillStyle = 'rgba(10,14,30,.22)'; x.beginPath(); x.ellipse(p.x + 1, p.y - 1, p.w * 0.42, Math.max(1.5, p.w * 0.14), 0, 0, Math.PI * 2); x.fill(); }
      x.drawImage(im, p.x - p.w / 2, p.y - p.h, p.w, p.h); return;
    }
    const s = img(`props/${p.spr}`);
    if (s) { x.drawImage(s, p.x - p.w / 2, p.y - p.h, p.w, p.h); return; }
    if (p.spr === 'ponto') { x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(p.x - p.w / 2 + 2, p.y - p.h + 2, p.w, p.h); x.fillStyle = '#3a7ac8'; x.fillRect(p.x - p.w / 2, p.y - p.h, p.w, 4); x.fillStyle = '#9fd0f0'; x.fillRect(p.x - p.w / 2, p.y - p.h + 4, p.w, p.h - 8); x.fillStyle = '#8a5a34'; x.fillRect(p.x - p.w / 2 + 3, p.y - 5, p.w - 6, 3); return; }
    if (p.spr.startsWith('caixa')) { x.fillStyle = '#8a5a34'; x.fillRect(p.x - p.w / 2, p.y - p.h, p.w, p.h); x.fillStyle = '#b07a44'; x.fillRect(p.x - p.w / 2 + 1, p.y - p.h + 1, p.w - 2, 2); x.strokeStyle = '#5a3a20'; x.lineWidth = 1; x.strokeRect(p.x - p.w / 2 + 0.5, p.y - p.h + 0.5, p.w - 1, p.h - 1); }
  }

  // ---------------------------------------------------------------- blocos
  const chunks = new Map(); let order = 0; const MAXC = mobile ? 20 : 36;
  function renderChunk(i, j) {
    const c = document.createElement('canvas'); c.width = c.height = CH * PXU; const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.setTransform(PXU, 0, 0, PXU, -i * CH * PXU, -j * CH * PXU);
    const rect = [i * CH, j * CH, (i + 1) * CH, (j + 1) * CH];
    const bin = bins.get(binKey(i, j)) || { g: [], b: [], p: [], d: [] };
    const core = city.core || { w: city.W, h: city.H };
    if (rect[0] < 0 || rect[1] < 0 || rect[2] > core.w || rect[3] > core.h) { drawCoast(x, rect); x.fillStyle = pat.grass; const ax = Math.max(0, rect[0]); const ay = Math.max(0, rect[1]); const bx = Math.min(core.w, rect[2]); const by = Math.min(core.h, rect[3]); if (bx > ax && by > ay) x.fillRect(ax, ay, bx - ax, by - ay); }
    else { x.fillStyle = pat.grass; x.fillRect(rect[0], rect[1], CH, CH); }
    drawGround(x, bin.g);
    roadMarks(x, rect);
    for (const d of bin.d) { if (d.spr[0] === '@') { drawFeature(x, d); continue; } const im = sprImg(d.spr, 'deco'); if (!im) continue; if (d.rot) { x.save(); x.translate(d.x + d.w / 2, d.y + d.h / 2); x.rotate(d.rot); x.drawImage(im, -d.w / 2, -d.h / 2, d.w, d.h); x.restore(); } else x.drawImage(im, d.x, d.y, d.w, d.h); }
    const lit = [];
    x.imageSmoothingEnabled = true;
    // construções e objetos ordenados pela base (y), como num RPG top-down
    const items = [...bin.b.map((b) => [b.y + b.h, 0, b]), ...bin.p.map((p) => [p.y, 1, p])].sort((a, b) => a[0] - b[0]);
    for (const [, t, o] of items) { if (t === 0) drawBuilding(x, o, lit); else drawProp(x, o); }
    // todas as luzes do bloco (janelas, fachadas) numa imagem só: à noite é um desenho por bloco
    let nl = null;
    if (lit.length) {
      nl = document.createElement('canvas'); nl.width = nl.height = CH; const g = nl.getContext('2d'); g.translate(-i * CH, -j * CH);
      for (const e of lit) { if (e.img) { g.globalAlpha = 0.5; g.drawImage(e.img, e.x, e.y, e.w, e.h); } else { g.globalAlpha = e[5] ?? 1; g.fillStyle = e[4]; g.fillRect(e[0], e[1], e[2], e[3]); } }
    }
    return { c, lit: nl ? [{ img: nl, x: i * CH, y: j * CH, w: CH, h: CH }] : [], used: ++order };
  }
  let rendersThisFrame = 0;
  function getChunk(i, j) {
    const k = binKey(i, j); let ch = chunks.get(k);
    if (ch) { ch.used = ++order; return ch; }
    if (rendersThisFrame >= (mobile ? 2 : 4)) return null;
    rendersThisFrame++;
    ch = renderChunk(i, j); chunks.set(k, ch);
    if (chunks.size > MAXC) { let old = null; for (const [kk, v] of chunks) if (!old || v.used < old[1].used) old = [kk, v]; chunks.delete(old[0]); }
    return ch;
  }

  // mapa geral reduzido (0,25 px por unidade): zoom afastado e minimapa
  let OV = 0.25;
  const overview = document.createElement('canvas');
  // rect: redesenha só uma área (depois de uma reforma); sem rect, o mapa geral inteiro
  function drawOverview(rect = null) {
    const bd = BD(); if (!rect) OV = Math.min(0.25, 2048 / Math.max(bd.x1 - bd.x0, bd.y1 - bd.y0)); const W2 = Math.round((bd.x1 - bd.x0) * OV); const H2 = Math.round((bd.y1 - bd.y0) * OV);
    if (!rect && (overview.width !== W2 || overview.height !== H2)) { overview.width = W2; overview.height = H2; }
    const x = overview.getContext('2d'); x.setTransform(OV, 0, 0, OV, -bd.x0 * OV, -bd.y0 * OV); x.imageSmoothingEnabled = true;
    x.save(); if (rect) { x.beginPath(); x.rect(rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]); x.clip(); }
    const hit = (o, m = 0) => !rect || (o.x - m < rect[2] && o.x + (o.w || 0) + m > rect[0] && o.y - m - 60 < rect[3] && o.y + (o.h || 0) + m > rect[1]);
    x.fillStyle = '#2f6fd0'; x.fillRect(bd.x0, bd.y0, bd.x1 - bd.x0, bd.y1 - bd.y0);
    const C = coastP(); if (C) { x.lineJoin = 'round'; x.strokeStyle = '#7fbff0'; x.lineWidth = BW + 60; x.stroke(C.land); x.fillStyle = '#2f5d27'; x.fill(C.land); x.strokeStyle = '#e8cf8a'; x.lineWidth = BW; x.stroke(C.land); if (C.hasLakes) { x.fillStyle = '#2f6fd0'; x.fill(C.lakes); x.strokeStyle = '#e8cf8a'; x.stroke(C.lakes); } } else { x.fillStyle = '#2f5d27'; x.fillRect(0, 0, city.W, city.H); }
    const core = city.core || { w: city.W, h: city.H }; x.fillStyle = '#2f5d27'; x.fillRect(0, 0, core.w, core.h);
    const col = { base: '#3f424b', curb: '#a9a59b', pave: '#8b867c', bed: '#33662a', access: '#4a4d57', front: '#bdb8ad', pond: '#2f6fd0', water: '#2f6fd0', sand: '#e8cf8a', grass: '#2f5d27', plaza: '#cdbd9c', lot: '#565962', walk: '#bdb8ad', road: '#4a4d57', cross: '#4a4d57', runway: '#3c3f47' };
    for (const m of MAT_ORDER) for (const g of city.ground) if (g.mat === m && !g.u && hit(g)) fillShape(x, g, g.island ? '#33662a' : col[m]);
    for (const g of city.ground) if (g.u && hit(g)) fillShape(x, g, col[g.mat] || '#2f5d27');
    x.fillStyle = '#f2c94c'; for (const s of city.segs) if (s.w >= 48) { if (s.v) x.fillRect(s.x - 2, s.y0, 4, s.y1 - s.y0); else x.fillRect(s.x0, s.y - 2, s.x1 - s.x0, 4); }
    for (const b of city.blds) { if (!hit(b)) continue; if (b.kind === 'sprite' && img(`bld/${b.spr}`)) { x.drawImage(img(`bld/${b.spr}`), b.x, b.y, b.w, b.h); continue; } x.fillStyle = 'rgba(10,14,30,.3)'; x.fillRect(b.x + 6, b.y + 6, b.w, b.h); x.fillStyle = b.roof || '#888'; if (b.round) { x.beginPath(); x.ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, 0, 0, Math.PI * 2); x.fill(); } else x.fillRect(b.x, b.y, b.w, b.h); }
    const TRE = /^(arvore|arbusto|d:arvore|d:coqueiro|x:pinheiro|x:arvore-nat)/;
    for (const p of city.props) { if (!hit(p, 20)) continue;
      if (p.spr === 'x:montanhas') { const im = img('extra/montanhas'); if (im) x.drawImage(im, p.x - p.w / 2, p.y - p.h, p.w, p.h); continue; }
      if (TRE.test(p.spr)) { const pn = p.spr.startsWith('x:pinheiro'); x.fillStyle = pn ? '#1f4d22' : '#2b5f22'; x.beginPath(); x.ellipse(p.x, p.y - 10, pn ? 7 : 9, pn ? 9 : 9, 0, 0, Math.PI * 2); x.fill(); x.fillStyle = 'rgba(120,170,80,.35)'; x.beginPath(); x.ellipse(p.x - 2, p.y - 13, 3, 3, 0, 0, Math.PI * 2); x.fill(); } }
    x.restore();
  }
  drawOverview();

  // luz: brilho radial e cone de farol pré-desenhados
  const glow = document.createElement('canvas'); glow.width = glow.height = 64;
  { const x = glow.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); }
  const cone = document.createElement('canvas'); cone.width = 128; cone.height = 64;
  { const x = cone.getContext('2d'); const g = x.createLinearGradient(0, 0, 128, 0); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.beginPath(); x.moveTo(0, 26); x.lineTo(128, 0); x.lineTo(128, 64); x.lineTo(0, 38); x.fill(); }
  const tints = {};
  const tinted = (src, color) => { const k = `${src === glow ? 'g' : 'c'}${color}`; if (tints[k]) return tints[k]; const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; const x = c.getContext('2d'); x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height); tints[k] = c; return c; };
  const dark = document.createElement('canvas'); const dctx = dark.getContext('2d');

  return {
    overview, get OV() { return OV; }, glow, cone,
    beginFrame() { rendersThisFrame = 0; },
    // desenha o chão/construções visíveis no contexto já transformado para o mundo
    drawWorld(ctx, view, z) {
      const [x0, y0, x1, y1] = view;
      const bd = BD();
      if (z < 0.55) { ctx.imageSmoothingEnabled = true; ctx.drawImage(overview, (x0 - bd.x0) * OV, (y0 - bd.y0) * OV, (x1 - x0) * OV, (y1 - y0) * OV, x0, y0, x1 - x0, y1 - y0); return []; }
      ctx.imageSmoothingEnabled = false;
      const lit = [];
      for (let i = Math.max(Math.floor(bd.x0 / CH), Math.floor(x0 / CH)); i <= Math.min(Math.ceil(bd.x1 / CH) - 1, Math.floor(x1 / CH)); i++) {
        for (let j = Math.max(Math.floor(bd.y0 / CH), Math.floor(y0 / CH)); j <= Math.min(Math.ceil(bd.y1 / CH) - 1, Math.floor(y1 / CH)); j++) {
          const ch = getChunk(i, j);
          if (ch) { ctx.drawImage(ch.c, i * CH, j * CH, CH + 0.75, CH + 0.75); for (const l of ch.lit) lit.push(l); }
          else ctx.drawImage(overview, (i * CH - bd.x0) * OV, (j * CH - bd.y0) * OV, CH * OV, CH * OV, i * CH, j * CH, CH, CH);
        }
      }
      return lit;
    },
    // noite: escuridão com "buracos" em cada fonte de luz + brilho colorido aditivo
    drawNight(ctx, cam, dpr, night, lights, emissive) {
      if (night < 0.03) return;
      const s = mobile ? 0.34 : 0.5; const w = Math.ceil(cam.vw * s); const h = Math.ceil(cam.vh * s);
      if (dark.width !== w || dark.height !== h) { dark.width = w; dark.height = h; }
      const toS = (wx, wy) => [((wx - cam.x) * cam.z + cam.vw / 2) * s, ((wy - cam.y) * cam.z + cam.vh / 2) * s];
      dctx.globalCompositeOperation = 'source-over'; dctx.clearRect(0, 0, w, h); dctx.fillStyle = `rgba(10,14,46,${0.58 * night})`; dctx.fillRect(0, 0, w, h);
      dctx.globalCompositeOperation = 'destination-out';
      for (const L of lights) {
        const [sx, sy] = toS(L.x, L.y); const r = L.r * cam.z * s;
        if (sx < -r || sy < -r || sx > w + r || sy > h + r) continue;
        if (L.cone) { dctx.save(); dctx.translate(sx, sy); dctx.rotate(L.a); dctx.globalAlpha = L.k ?? 0.9; dctx.drawImage(cone, 0, -r / 2, r, r); dctx.restore(); }
        else { dctx.globalAlpha = L.k ?? 1; dctx.drawImage(glow, sx - r, sy - r, r * 2, r * 2); }
      }
      dctx.globalAlpha = 1;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = true; ctx.drawImage(dark, 0, 0, dark.width, dark.height, 0, 0, cam.vw * dpr, cam.vh * dpr); ctx.restore();
      // brilho aditivo
      // janelas e fachadas acesas (cor própria) e, por cima, brilho aditivo das luzes
      ctx.save();
      for (const e of emissive) { ctx.globalAlpha = Math.min(1, night * 1.2) * (e.img ? 0.9 : e[5] ?? 1); if (e.img) ctx.drawImage(e.img, e.x, e.y, e.w, e.h); else { ctx.fillStyle = e[4]; ctx.fillRect(e[0], e[1], e[2], e[3]); } }
      ctx.globalCompositeOperation = 'lighter';
      for (const L of lights) {
        if (!L.color || (mobile && (L.lamp || L.r < 12))) continue; // no celular os postes só iluminam (sem halo aditivo)
        ctx.globalAlpha = night * (L.ka ?? 0.35);
        if (L.cone) { ctx.save(); ctx.translate(L.x, L.y); ctx.rotate(L.a); ctx.drawImage(tinted(cone, L.color), 0, -L.r / 2, L.r, L.r); ctx.restore(); }
        else { const r = L.r * (L.halo ?? 0.6); ctx.drawImage(tinted(glow, L.color), L.x - r, L.y - r, r * 2, r * 2); }
      }
      ctx.restore();
    },
    stats: () => ({ chunks: chunks.size }),
    // depois de uma reforma: reindexa, descarta os blocos em cache (todos ou só os da área) e refaz o mapa geral
    reset({ rect = null, coast = false, overview: ov = true } = {}) {
      index(); if (coast) coastPaths = null;
      if (!rect) chunks.clear();
      else for (const k of [...chunks.keys()]) { const [i, j] = k.split(',').map(Number); if ((i + 1) * CH >= rect[0] && i * CH <= rect[2] && (j + 1) * CH >= rect[1] && j * CH <= rect[3]) chunks.delete(k); }
      if (ov) drawOverview(rect);
    },
    get bounds() { return BD(); },
  };
}
