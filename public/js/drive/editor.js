// Modo Reforma (editor da cidade, estilo construtor de cidades): mover a câmera, colocar o que foi comprado na
// catálogo da Construtora (tudo liberado), apagar qualquer coisa (inclusive o que já existia), pintar ruas/calçadas/praças/água em blocos de
// 32×32 e escolher o formato do mapa. Cada mudança refaz a cidade (geração determinística + reforma) e é salva
// sozinha no servidor.
import { CATALOG, CATS, SHAPES, TILE, genKey } from './obra.js';
import { shapePolys } from './terreno.js';
import { at, SOLID, WATER, ROAD, CROSS, RUNWAY, GRASS, SAND, PLAZA, LOT } from './world.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const BLD_OK = new Set([GRASS, SAND, PLAZA, LOT]);

export function createEditor({ stage, cam, city, world, assets, api, toast, rebuild, onExit }) {
  const IMG = assets.img;
  const $ = (s) => stage.querySelector(s);
  const box = document.createElement('div'); box.className = 'ed'; box.hidden = true;
  box.innerHTML = `<div class="ed-top">
      <b class="ed-title">🔨 Modo Reforma</b>
      <div class="ed-tools" role="toolbar">
        <button data-t="pan" title="Mover a câmera (arrastar)">✋<span>Mover</span></button>
        <button data-t="place" title="Colocar o item escolhido">＋<span>Colocar</span></button>
        <button data-t="erase" title="Apagar o que tocar">🗑<span>Apagar</span></button>
        <button data-t="floor" title="Pintar piso (arraste)">▦<span>Piso</span></button>
      </div>
      <div class="ed-acts">
        <button data-e="rot" title="Girar (R)">⟳</button><button data-e="minus" title="Menor">−</button><button data-e="plus" title="Maior">＋</button>
        <button data-e="undo" title="Desfazer (Ctrl+Z)">↶</button><button data-e="shape" title="Formato do mapa">◯<span>Formato</span></button>
        <a href="#/construtora" title="Ver o catálogo completo">📚<span>Catálogo</span></a><button data-e="exit" class="ok">✔<span>Concluir</span></button>
      </div></div>
    <div class="ed-status" id="edStatus"></div>
    <div class="ed-pal"><div class="ed-cats" id="edCats"></div><input class="ed-q" id="edQ" placeholder="Buscar item…" autocomplete="off" aria-label="Buscar item"><div class="ed-items" id="edItems"></div></div>
    <div class="ed-modal" id="edShape" hidden></div>`;
  stage.appendChild(box);

  const S = { on: false, tool: 'pan', sel: null, cat: 'predios', rot: 0, scale: 1, brush: 1, q: '', hover: null, rf: null, hist: [], saveT: 0, saving: false, dirty: false, rebuildT: 0, pend: false };
  let seq = 0;
  const uid = () => `u${Date.now().toString(36)}${(seq++).toString(36)}`.slice(0, 24);
  const used = () => { const n = {}; for (const a of S.rf.add) n[a.k] = (n[a.k] || 0) + 1; for (const f of S.rf.floor) n[f.k] = (n[f.k] || 0) + 1; return n; };
  const status = (t, kind = '') => { const el = $('#edStatus'); el.textContent = t; el.className = `ed-status ${kind}`; };
  const snapshot = () => { S.hist.push(JSON.stringify(S.rf)); if (S.hist.length > 60) S.hist.shift(); };

  // ---------------------------------------------------------------- paleta
  function drawPalette() {
    const u = used();
    $('#edCats').innerHTML = CATS.map(([k, l]) => `<button data-c="${k}" class="${!S.q && S.cat === k ? 'on' : ''}">${l}</button>`).join('');
    const q = S.q.toLowerCase();
    const list = Object.values(CATALOG).filter((c) => (q ? c.name.toLowerCase().includes(q) : c.cat === S.cat));
    $('#edItems').innerHTML = list.slice(0, 400).map((c) => `<button data-k="${esc(c.key)}" class="${S.sel === c.key ? 'on' : ''}" title="${esc(c.name)}">${c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy">` : `<i class="ed-sw" style="--c:${esc(c.color)}"></i>`}<span>${esc(c.name)}</span>${u[c.key] ? `<b>${u[c.key]} no mapa</b>` : ''}</button>`).join('') || '<p class="ed-none">Nada encontrado.</p>';
    $('#edCats').querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => { S.cat = b.dataset.c; S.q = ''; $('#edQ').value = ''; drawPalette(); }; });
    $('#edItems').querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => select(b.dataset.k); });
  }
  function select(k) {
    const c = CATALOG[k]; if (!c) return;
    S.sel = c.key; S.rot = 0; S.scale = 1; setTool(c.kind === 'floor' ? 'floor' : 'place'); drawPalette();
    if (c.img?.includes('/extra/')) assets.ensure?.([c.img.split('/').pop().replace('.png', '')]);
  }
  function setTool(t) {
    if ((t === 'place' && (!S.sel || CATALOG[S.sel].kind === 'floor')) || (t === 'floor' && (!S.sel || CATALOG[S.sel].kind !== 'floor'))) {
      const want = t === 'floor' ? 'pisos' : S.cat === 'pisos' ? 'predios' : S.cat;
      S.cat = want; drawPalette(); status(t === 'floor' ? 'Escolha um piso na paleta (rua, calçada, praça, água…) e arraste no mapa.' : 'Escolha um item na paleta e toque no mapa para colocar.', 'tip');
      if (!S.sel || (t === 'floor') !== (CATALOG[S.sel]?.kind === 'floor')) S.sel = null;
    }
    S.tool = t;
    box.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
    stage.dataset.edtool = t;
    if (t === 'erase') status('Toque no que quer remover (vale também para o que já existia na cidade).', 'tip');
    else if (t === 'pan') status('Arraste para mover a câmera. Roda/pinça para zoom.', 'tip');
    else if (S.sel) status(`${CATALOG[S.sel].name}: ${t === 'floor' ? `arraste para pintar (pincel ${S.brush}×${S.brush}; − e ＋ mudam o pincel, ⟳ gira).` : 'toque no mapa para colocar (− e ＋ mudam o tamanho, ⟳ gira).'}`, 'tip');
  }

  // ---------------------------------------------------------------- regras de colocação
  function ghostOf(wx, wy) {
    const c = S.sel && CATALOG[S.sel]; if (!c) return null;
    if (c.kind === 'floor') { const n = S.brush; const x = (Math.floor(wx / TILE) - Math.floor((n - 1) / 2)) * TILE; const y = (Math.floor(wy / TILE) - Math.floor((n - 1) / 2)) * TILE; return { c, x, y, n, w: TILE * n, h: TILE * n, ok: floorOk(x, y, c, true) }; }
    const s = S.scale; const w = c.w * s; const h = c.h * s;
    if (c.kind === 'bld') { const x = Math.round((wx - w / 2) / 4) * 4; const y = Math.round((wy - h / 2) / 4) * 4; return { c, x, y, w, h, ok: bldOk(x, y, w, h) }; }
    if (c.kind === 'decal') return { c, x: Math.round(wx), y: Math.round(wy), w, h, ok: !bad(at(world, wx, wy)) };
    const bx = Math.round(wx); const by = Math.round(wy + h / 2);
    const code = at(world, bx, by);
    return { c, x: bx, y: by, w, h, ok: !bad(code) && code !== RUNWAY && !(c.solid && (code === ROAD || code === CROSS)) };
  }
  const bad = (code) => code === WATER || code === SOLID;
  function bldOk(x, y, w, h) {
    for (let yy = y + 2; yy < y + h; yy += 4) for (let xx = x + 2; xx < x + w; xx += 4) if (!BLD_OK.has(at(world, xx, yy))) return false;
    return true;
  }
  function floorOk(x, y, c, preview = false) {
    const cx = x + TILE / 2; const cy = y + TILE / 2;
    if (cx < city.bounds.x0 || cy < city.bounds.y0 || cx > city.bounds.x1 || cy > city.bounds.y1) return false;
    const mine = S.rf.floor.find((f) => f.x === x && f.y === y);
    if (!preview && mine?.k === c.key && (mine.r || 0) === (c.tex ? Math.round(S.rot * 100) / 100 : 0)) return false;
    for (const [dx, dy] of [[2, 2], [TILE - 2, 2], [2, TILE - 2], [TILE - 2, TILE - 2], [TILE / 2, TILE / 2]]) {
      const code = at(world, x + dx, y + dy);
      if (code === SOLID) return false;
      if (!mine && (code === ROAD || code === CROSS || code === RUNWAY) && !city.stubs?.some((r) => x + dx >= r[0] && x + dx <= r[0] + r[2] && y + dy >= r[1] && y + dy <= r[1] + r[3])) return false;
    }
    return true;
  }
  // o que está debaixo do dedo para apagar (o que aparece por cima primeiro)
  function hitAt(wx, wy) {
    let best = null;
    for (const p of city.props) { const hw = Math.max(p.w / 2, 5); if (Math.abs(wx - p.x) <= hw && wy >= p.y - p.h - 1 && wy <= p.y + 3 && (!best || p.y > best.o.y)) best = { t: 'p', o: p }; }
    if (best) return best;
    for (const d of city.decals || []) if (wx >= d.x - 2 && wx <= d.x + d.w + 2 && wy >= d.y - 2 && wy <= d.y + d.h + 2) return { t: 'd', o: d };
    for (const b of city.blds) if (wx >= b.x && wx <= b.x + b.w && wy >= b.y && wy <= b.y + b.h && (!best || b.y + b.h > best.o.y + best.o.h)) best = { t: 'b', o: b };
    if (best) return best;
    const tx = Math.floor(wx / TILE) * TILE; const ty = Math.floor(wy / TILE) * TILE;
    const f = S.rf.floor.find((g) => g.x === tx && g.y === ty); if (f) return { t: 'f', o: f };
    return null;
  }

  // ---------------------------------------------------------------- ações
  const changed = (rect, full = false) => { S.dirty = true; drawPalette(); scheduleRebuild(rect, full); scheduleSave(); };
  let rebuildRect = null; let rebuildFull = false;
  function scheduleRebuild(rect, full) {
    if (full) rebuildFull = true;
    if (rect) rebuildRect = rebuildRect ? [Math.min(rebuildRect[0], rect[0]), Math.min(rebuildRect[1], rect[1]), Math.max(rebuildRect[2], rect[2]), Math.max(rebuildRect[3], rect[3])] : rect;
    S.pend = true; clearTimeout(S.rebuildT);
    S.rebuildT = setTimeout(() => { rebuild(S.rf, rebuildFull ? null : rebuildRect, rebuildFull); rebuildRect = null; rebuildFull = false; S.pend = false; }, 90);
  }
  function scheduleSave() { clearTimeout(S.saveT); status('Alterações não salvas…', 'warn'); S.saveT = setTimeout(save, 1400); }
  async function save() {
    clearTimeout(S.saveT); if (!S.dirty || S.saving) return;
    S.saving = true; S.dirty = false;
    try { const r = await api.post('/mundo/cidade2d/reforma', { shape: S.rf.shape, add: S.rf.add, floor: S.rf.floor, del: S.rf.del }); status(`Salvo · ${r.saved.add} itens, ${r.saved.floor} blocos de piso, ${r.saved.del} demolições`, 'ok'); }
    catch (err) { S.dirty = true; status(`Não salvou: ${err.message}`, 'err'); toast('Reforma não salva', err.message, 'error'); }
    S.saving = false;
    if (S.dirty) scheduleSave();
  }
  const pad = (x, y, w, h, m = 80) => [x - m, y - m - 60, x + w + m, y + h + m];

  function place(wx, wy) {
    const g = ghostOf(wx, wy); if (!g) { status('Escolha um item na paleta primeiro.', 'tip'); return; }
    if (!g.ok) { status(g.c.kind === 'bld' ? 'Não cabe aqui: construções vão em grama, areia, praça ou estacionamento livres.' : 'Aqui não dá (rua, água ou algo no caminho).', 'err'); return; }
    snapshot();
    const a = { id: uid(), k: g.c.key, x: g.x, y: g.y }; if (S.rot) a.r = S.rot; if (S.scale !== 1) a.s = S.scale;
    S.rf.add.push(a);
    changed(g.c.kind === 'bld' ? pad(g.x, g.y, g.w, g.h) : pad(g.x - g.w / 2, g.y - g.h, g.w, g.h));
    status(`${g.c.name} colocado`, 'ok');
  }
  const painted = new Set();
  function paint(wx, wy) {
    const c = S.sel && CATALOG[S.sel]; if (!c || c.kind !== 'floor') return;
    const n = S.brush; const bx = Math.floor(wx / TILE) - Math.floor((n - 1) / 2); const by = Math.floor(wy / TILE) - Math.floor((n - 1) / 2);
    let any = false;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = (bx + i) * TILE; const y = (by + j) * TILE; const key = `${x},${y}`; if (painted.has(key)) continue; painted.add(key);
      if (!floorOk(x, y, c)) continue;
      if (!painted.snap) { snapshot(); painted.snap = true; }
      const old = S.rf.floor.findIndex((f) => f.x === x && f.y === y); if (old >= 0) S.rf.floor.splice(old, 1);
      const f = { k: c.key, x, y }; if (S.rot && c.tex) f.r = Math.round(S.rot * 100) / 100; S.rf.floor.push(f); any = true;
    }
    if (any) changed([bx * TILE - 40, by * TILE - 40, (bx + n) * TILE + 40, (by + n) * TILE + 40]);
  }
  function erase(wx, wy) {
    const h = hitAt(wx, wy); if (!h) { status('Nada para apagar aqui (o chão original só muda pintando outro piso por cima).', 'tip'); return; }
    snapshot();
    const o = h.o; let name = '';
    if (h.t === 'f') { S.rf.floor.splice(S.rf.floor.indexOf(o), 1); name = CATALOG[o.k].name; changed(pad(o.x, o.y, TILE, TILE, 40)); }
    else if (o.user) { const i = S.rf.add.findIndex((a) => a.id === o.user); if (i >= 0) { name = CATALOG[S.rf.add[i].k]?.name || ''; S.rf.add.splice(i, 1); } }
    else { S.rf.del.push(genKey(o)); name = 'item da cidade'; }
    if (h.t !== 'f') changed(h.t === 'b' ? pad(o.x, o.y, o.w, o.h) : h.t === 'd' ? pad(o.x, o.y, o.w, o.h) : pad(o.x - o.w / 2, o.y - o.h, o.w, o.h));
    status(`Removido: ${name}`, 'ok');
  }
  function undo() {
    const last = S.hist.pop(); if (!last) { status('Nada para desfazer.', 'tip'); return; }
    S.rf = JSON.parse(last); changed(null, true); status('Desfeito.', 'ok');
  }
  function shapeModal() {
    const m = $('#edShape'); m.hidden = false;
    m.innerHTML = `<div class="ed-card"><h3>Formato do mapa</h3><p>A cidade continua igual; muda o contorno da terra, das ilhas e dos lagos em volta.</p>
      <div class="ed-shapes">${Object.entries(SHAPES).map(([k, s]) => `<button data-s="${k}" class="${S.rf.shape === k ? 'on' : ''}"><canvas width="120" height="96" data-p="${k}"></canvas><span>${esc(s.label)}</span></button>`).join('')}</div>
      <div class="ed-row"><button class="cx-btn" data-x>Fechar</button></div></div>`;
    m.querySelectorAll('canvas[data-p]').forEach((cv) => {
      const g = cv.getContext('2d'); const P = shapePolys(cv.dataset.p); const b = P.bounds; const k = Math.min(120 / (b.x1 - b.x0), 96 / (b.y1 - b.y0));
      g.fillStyle = '#2f6fd0'; g.fillRect(0, 0, 120, 96); g.save(); g.translate((120 - (b.x1 - b.x0) * k) / 2, (96 - (b.y1 - b.y0) * k) / 2); g.scale(k, k); g.translate(-b.x0, -b.y0);
      const path = (polys) => { g.beginPath(); for (const poly of polys) { poly.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); } };
      g.fillStyle = '#2f5d27'; path(P.land); g.fill(); g.fillStyle = '#2f6fd0'; path(P.lakes); g.fill();
      g.fillStyle = '#6b6f7a'; g.fillRect(320, 0, (city.core?.w || 4096) - 320, city.core?.h || 2816); g.restore();
    });
    m.querySelectorAll('[data-s]').forEach((b) => { b.onclick = () => { if (S.rf.shape === b.dataset.s) return; snapshot(); S.rf.shape = b.dataset.s; status('Gerando o terreno…', 'warn'); m.hidden = true; setTimeout(() => { changed(null, true); status(`Formato: ${SHAPES[S.rf.shape].label}`, 'ok'); }, 30); }; });
    m.querySelector('[data-x]').onclick = () => { m.hidden = true; };
  }

  box.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => setTool(b.dataset.t); });
  box.querySelector('[data-e="rot"]').onclick = () => { S.rot = (S.rot + Math.PI / 2) % (Math.PI * 2); status(`Rotação ${Math.round((S.rot * 180) / Math.PI)}° (decoração, peças no chão e pisos; prédios não giram)`, 'tip'); };
  const size = (d) => {
    if (S.tool === 'floor') { S.brush = Math.max(1, Math.min(8, S.brush + d)); status(`Pincel ${S.brush}×${S.brush} blocos`, 'tip'); return; }
    S.scale = Math.max(0.3, Math.min(4, Math.round((S.scale + d * (S.scale >= 1.5 ? 0.25 : 0.1)) * 100) / 100)); status(`Tamanho ${Math.round(S.scale * 100)}%`, 'tip');
  };
  box.querySelector('[data-e="minus"]').onclick = () => size(-1);
  box.querySelector('[data-e="plus"]').onclick = () => size(1);
  $('#edQ').oninput = () => { S.q = $('#edQ').value.trim(); drawPalette(); };
  box.querySelector('[data-e="undo"]').onclick = undo;
  box.querySelector('[data-e="shape"]').onclick = shapeModal;
  box.querySelector('[data-e="exit"]').onclick = () => close();
  const keyd = (e) => { if (!S.on || e.target.closest?.('input,textarea')) return; if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); } else if (e.key.toLowerCase() === 'r' && !e.ctrlKey) box.querySelector('[data-e="rot"]').click(); else if (e.key === 'Escape') close(); };
  addEventListener('keydown', keyd);

  // ---------------------------------------------------------------- abrir / fechar
  async function open(reforma, item = null) {
    S.rf = JSON.parse(JSON.stringify({ shape: 'continente', add: [], floor: [], del: [], ...(reforma || {}) }));
    delete S.rf.owned; delete S.rf.updatedAt; delete S.rf.level; S.hist = [];
    S.on = true; box.hidden = false; stage.classList.add('edit'); cam.follow = false;
    drawPalette(); setTool('pan');
    if (item && CATALOG[item]) { S.cat = CATALOG[item].cat; select(item); }
    else status('Tudo liberado: escolha um item na paleta e toque no mapa. Arraste para mover a câmera.', 'tip');
  }
  async function close() {
    if (!S.on) return;
    clearTimeout(S.rebuildT); if (S.pend) { rebuild(S.rf, null, true); S.pend = false; }
    await save();
    S.on = false; box.hidden = true; stage.classList.remove('edit'); $('#edShape').hidden = true; delete stage.dataset.edtool;
    onExit?.(S.rf);
  }

  return {
    get on() { return S.on; },
    get rf() { return S.rf; },
    open, close, save,
    // pintura arrastando (só com a ferramenta de piso)
    paints: () => S.on && S.tool === 'floor' && S.sel && CATALOG[S.sel]?.kind === 'floor',
    paintAt(sx, sy) { const [wx, wy] = cam.toWorld(sx, sy); paint(wx, wy); },
    paintEnd() { painted.clear(); painted.snap = false; },
    tap(sx, sy) {
      const [wx, wy] = cam.toWorld(sx, sy); S.hover = [wx, wy];
      if (S.tool === 'place') place(wx, wy); else if (S.tool === 'erase') erase(wx, wy); else if (S.tool === 'floor') { paint(wx, wy); painted.clear(); painted.snap = false; }
    },
    hover(sx, sy) { S.hover = cam.toWorld(sx, sy); },
    // prévia (fantasma) e realce, desenhados no contexto já transformado para o mundo
    draw(ctx, z) {
      if (!S.on) return;
      const [x0, y0, x1, y1] = [cam.x - cam.vw / 2 / z, cam.y - cam.vh / 2 / z, cam.x + cam.vw / 2 / z, cam.y + cam.vh / 2 / z];
      if (S.tool === 'floor' && z >= 0.8) { ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 1 / z; ctx.beginPath(); for (let x = Math.floor(x0 / TILE) * TILE; x < x1; x += TILE) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); } for (let y = Math.floor(y0 / TILE) * TILE; y < y1; y += TILE) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); } ctx.stroke(); }
      if (!S.hover) return;
      const [wx, wy] = S.hover;
      if (S.tool === 'erase') {
        const h = hitAt(wx, wy); if (!h) return; const o = h.o;
        const r = h.t === 'b' ? [o.x, o.y, o.w, o.h] : h.t === 'f' ? [o.x, o.y, TILE, TILE] : h.t === 'd' ? [o.x, o.y, o.w, o.h] : [o.x - o.w / 2, o.y - o.h, o.w, o.h];
        ctx.fillStyle = 'rgba(255,60,80,.28)'; ctx.fillRect(...r); ctx.strokeStyle = '#ff4d5e'; ctx.lineWidth = 2 / z; ctx.strokeRect(...r); return;
      }
      const g = ghostOf(wx, wy); if (!g) return;
      ctx.globalAlpha = 0.72;
      const c = g.c;
      if (c.kind === 'floor') {
        const im = c.tex && IMG[`extra/${c.tex.slice(2)}`];
        for (let j = 0; j < g.n; j++) for (let i = 0; i < g.n; i++) { const tx = g.x + i * TILE; const ty = g.y + j * TILE; if (im) { ctx.save(); ctx.translate(tx + TILE / 2, ty + TILE / 2); ctx.rotate(S.rot); ctx.drawImage(im, -TILE / 2, -TILE / 2, TILE, TILE); ctx.restore(); } else { ctx.fillStyle = c.color; ctx.fillRect(tx, ty, TILE, TILE); } }
      } else if (c.kind === 'bld') { const im = IMG[`bld/${c.spr}`]; if (im) ctx.drawImage(im, g.x, g.y, g.w, g.h); }
      else {
        const im = c.spr.startsWith('x:') ? IMG[`extra/${c.spr.slice(2)}`] : c.spr.startsWith('d:') ? IMG[`deco/${c.spr.slice(2)}`] : IMG[`props/${c.spr}`];
        if (im) { ctx.save(); if (c.kind === 'decal') { ctx.translate(g.x, g.y); ctx.rotate(S.rot); ctx.drawImage(im, -g.w / 2, -g.h / 2, g.w, g.h); } else { ctx.translate(g.x, g.y - g.h / 2); ctx.rotate(S.rot); ctx.drawImage(im, -g.w / 2, -g.h / 2, g.w, g.h); } ctx.restore(); }
      }
      ctx.globalAlpha = 1;
      const r = c.kind === 'floor' || c.kind === 'bld' ? [g.x, g.y, g.w, g.h] : c.kind === 'decal' ? [g.x - g.w / 2, g.y - g.h / 2, g.w, g.h] : [g.x - g.w / 2, g.y - g.h, g.w, g.h];
      ctx.strokeStyle = g.ok ? '#2fd27a' : '#ff4d5e'; ctx.lineWidth = 2 / z; ctx.setLineDash([4 / z, 3 / z]); ctx.strokeRect(...r); ctx.setLineDash([]);
    },
    destroy() { removeEventListener('keydown', keyd); clearTimeout(S.saveT); clearTimeout(S.rebuildT); if (S.dirty) save(); box.remove(); },
  };
}
