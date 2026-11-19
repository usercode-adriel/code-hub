// Modo Reforma (editor da cidade, estilo construtor de cidades): mover a câmera, colocar o que foi comprado na
// Construtora, apagar qualquer coisa (inclusive o que já existia), pintar ruas/calçadas/praças/água em blocos de
// 32×32 e escolher o formato do mapa. Cada mudança refaz a cidade (geração determinística + reforma) e é salva
// sozinha no servidor, que confere o estoque comprado.
import { CATALOG, CATS, SHAPES, TILE, genKey, coastOf } from './obra.js';
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
        <a href="#/construtora" title="Comprar mais">🛒<span>Construtora</span></a><button data-e="exit" class="ok">✔<span>Concluir</span></button>
      </div></div>
    <div class="ed-status" id="edStatus"></div>
    <div class="ed-pal"><div class="ed-cats" id="edCats"></div><div class="ed-items" id="edItems"></div></div>
    <div class="ed-modal" id="edShape" hidden></div>`;
  stage.appendChild(box);

  const S = { on: false, tool: 'pan', sel: null, cat: 'predios', rot: 0, scale: 1, hover: null, owned: {}, rf: null, hist: [], saveT: 0, saving: false, dirty: false, rebuildT: 0, pend: false };
  let seq = 0;
  const uid = () => `u${Date.now().toString(36)}${(seq++).toString(36)}`.slice(0, 24);
  const used = () => { const n = {}; for (const a of S.rf.add) n[a.k] = (n[a.k] || 0) + 1; for (const f of S.rf.floor) n[f.k] = (n[f.k] || 0) + 1; return n; };
  const avail = (k, u = used()) => Math.max(0, (S.owned[k] || 0) - (u[k] || 0));
  const status = (t, kind = '') => { const el = $('#edStatus'); el.textContent = t; el.className = `ed-status ${kind}`; };
  const snapshot = () => { S.hist.push(JSON.stringify(S.rf)); if (S.hist.length > 60) S.hist.shift(); };

  // ---------------------------------------------------------------- paleta
  function drawPalette() {
    const u = used();
    const mine = Object.values(CATALOG).filter((c) => (S.owned[c.key] || 0) > 0);
    $('#edCats').innerHTML = CATS.map(([k, l]) => { const n = mine.filter((c) => c.cat === k).length; return `<button data-c="${k}" class="${S.cat === k ? 'on' : ''}">${l}${n ? ` <i>${n}</i>` : ''}</button>`; }).join('');
    const list = Object.values(CATALOG).filter((c) => c.cat === S.cat).sort((a, b) => (avail(b.key, u) > 0) - (avail(a.key, u) > 0));
    $('#edItems').innerHTML = list.map((c) => { const n = avail(c.key, u); return `<button data-k="${esc(c.key)}" class="${S.sel === c.key ? 'on' : ''} ${n ? '' : 'off'}" title="${esc(c.name)}">${c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy">` : `<i class="ed-sw" style="--c:${esc(c.color)}"></i>`}<span>${esc(c.name)}</span><b>${n ? `${n}` : 'comprar'}</b></button>`; }).join('');
    $('#edCats').querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => { S.cat = b.dataset.c; drawPalette(); }; });
    $('#edItems').querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => {
      const c = CATALOG[b.dataset.k];
      if (!avail(c.key)) { toast('Sem estoque', `Compre ${c.name} na Construtora Nexus (${c.price.toLocaleString('pt-BR')} NXC${c.kind === 'floor' ? ' por bloco' : ''}).`, 'info'); return; }
      S.sel = c.key; S.rot = 0; S.scale = 1; setTool(c.kind === 'floor' ? 'floor' : 'place'); drawPalette();
    }; });
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
    if (t === 'erase') status('Toque no que quer remover. Itens comprados voltam para o estoque.', 'tip');
    else if (t === 'pan') status('Arraste para mover a câmera. Roda/pinça para zoom.', 'tip');
    else if (S.sel) status(`${CATALOG[S.sel].name}: ${avail(S.sel)} disponível(is). ${t === 'floor' ? 'Arraste para pintar.' : 'Toque no mapa para colocar.'}`, 'tip');
  }

  // ---------------------------------------------------------------- regras de colocação
  function ghostOf(wx, wy) {
    const c = S.sel && CATALOG[S.sel]; if (!c) return null;
    if (c.kind === 'floor') { const x = Math.floor(wx / TILE) * TILE; const y = Math.floor(wy / TILE) * TILE; return { c, x, y, w: TILE, h: TILE, ok: floorOk(x, y, c) }; }
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
  function floorOk(x, y, c) {
    const cx = x + TILE / 2; const cy = y + TILE / 2;
    if (city.coast && city.coast.zone(cx, cy) === 0) return false; // mar aberto: só com expansão
    const mine = S.rf.floor.find((f) => f.x === x && f.y === y);
    if (mine?.k === c.key) return false;
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
    if (!avail(g.c.key)) { toast('Acabou o estoque', `Compre mais ${g.c.name} na Construtora.`, 'info'); return; }
    if (!g.ok) { status(g.c.kind === 'bld' ? 'Não cabe aqui: construções vão em grama, areia, praça ou estacionamento livres.' : 'Aqui não dá (rua, água ou algo no caminho).', 'err'); return; }
    snapshot();
    const a = { id: uid(), k: g.c.key, x: g.x, y: g.y }; if (S.rot) a.r = S.rot; if (S.scale !== 1) a.s = S.scale;
    S.rf.add.push(a);
    changed(g.c.kind === 'bld' ? pad(g.x, g.y, g.w, g.h) : pad(g.x - g.w / 2, g.y - g.h, g.w, g.h));
    status(`${g.c.name} colocado · ${avail(g.c.key)} restante(s)`, 'ok');
  }
  const painted = new Set();
  function paint(wx, wy) {
    const g = ghostOf(wx, wy); if (!g || g.c.kind !== 'floor') return;
    const key = `${g.x},${g.y}`; if (painted.has(key)) return; painted.add(key);
    if (!g.ok) return;
    const old = S.rf.floor.findIndex((f) => f.x === g.x && f.y === g.y);
    if (old < 0 && !avail(g.c.key)) { status(`Acabaram os blocos de ${g.c.name}. Compre mais na Construtora.`, 'err'); return; }
    if (!painted.snap) { snapshot(); painted.snap = true; }
    if (old >= 0) S.rf.floor.splice(old, 1);
    S.rf.floor.push({ k: g.c.key, x: g.x, y: g.y });
    changed(pad(g.x, g.y, TILE, TILE, 40));
  }
  function erase(wx, wy) {
    const h = hitAt(wx, wy); if (!h) { status('Nada para apagar aqui (o chão original só muda pintando outro piso por cima).', 'tip'); return; }
    snapshot();
    const o = h.o; let name = '';
    if (h.t === 'f') { S.rf.floor.splice(S.rf.floor.indexOf(o), 1); name = CATALOG[o.k].name; changed(pad(o.x, o.y, TILE, TILE, 40)); }
    else if (o.user) { const i = S.rf.add.findIndex((a) => a.id === o.user); if (i >= 0) { name = CATALOG[S.rf.add[i].k]?.name || ''; S.rf.add.splice(i, 1); } }
    else { S.rf.del.push(genKey(o)); name = 'item da cidade'; }
    if (h.t !== 'f') changed(h.t === 'b' ? pad(o.x, o.y, o.w, o.h) : h.t === 'd' ? pad(o.x, o.y, o.w, o.h) : pad(o.x - o.w / 2, o.y - o.h, o.w, o.h));
    status(`Removido: ${name}${o.user || h.t === 'f' ? ' (voltou para o estoque)' : ''}`, 'ok');
  }
  function undo() {
    const last = S.hist.pop(); if (!last) { status('Nada para desfazer.', 'tip'); return; }
    S.rf = JSON.parse(last); changed(null, true); status('Desfeito.', 'ok');
  }
  function shapeModal() {
    const m = $('#edShape'); m.hidden = false;
    m.innerHTML = `<div class="ed-card"><h3>Formato do mapa</h3><p>A cidade continua igual; muda o contorno da costa e do terreno em volta. Expansões compradas: ${S.rf.level} de 4.</p>
      <div class="ed-shapes">${Object.entries(SHAPES).map(([k, s]) => `<button data-s="${k}" class="${S.rf.shape === k ? 'on' : ''}"><canvas width="120" height="90" data-p="${k}"></canvas><span>${esc(s.label)}</span></button>`).join('')}</div>
      <div class="ed-row"><a class="cx-btn ghost" href="#/construtora">Comprar expansão</a><button class="cx-btn" data-x>Fechar</button></div></div>`;
    m.querySelectorAll('canvas[data-p]').forEach((cv) => {
      const g = cv.getContext('2d'); const co = coastOf(cv.dataset.p, S.rf.level); const b = city.bounds; const k = Math.min(120 / (b.x1 - b.x0), 90 / (b.y1 - b.y0));
      g.fillStyle = '#2f6fd0'; g.fillRect(0, 0, 120, 90); g.save(); g.scale(k, k); g.translate(-b.x0, -b.y0);
      g.fillStyle = '#e8cf8a'; g.beginPath(); co.poly(0, 180).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.fill();
      g.fillStyle = '#4f9a3a'; g.beginPath(); co.poly(-60, 180, 320).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.fill();
      g.fillStyle = '#6b6f7a'; g.fillRect(320, 0, (city.core?.w || 4096) - 320, city.core?.h || 2816); g.restore();
    });
    m.querySelectorAll('[data-s]').forEach((b) => { b.onclick = () => { if (S.rf.shape === b.dataset.s) return; snapshot(); S.rf.shape = b.dataset.s; changed(null, true); m.hidden = true; status(`Formato: ${SHAPES[S.rf.shape].label}`, 'ok'); }; });
    m.querySelector('[data-x]').onclick = () => { m.hidden = true; };
  }

  box.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => setTool(b.dataset.t); });
  box.querySelector('[data-e="rot"]').onclick = () => { S.rot = (S.rot + Math.PI / 2) % (Math.PI * 2); status(`Rotação ${Math.round((S.rot * 180) / Math.PI)}° (vale para decoração, não para prédios)`, 'tip'); };
  box.querySelector('[data-e="minus"]').onclick = () => { S.scale = Math.max(0.6, Math.round((S.scale - 0.1) * 10) / 10); status(`Tamanho ${Math.round(S.scale * 100)}%`, 'tip'); };
  box.querySelector('[data-e="plus"]').onclick = () => { S.scale = Math.min(1.6, Math.round((S.scale + 0.1) * 10) / 10); status(`Tamanho ${Math.round(S.scale * 100)}%`, 'tip'); };
  box.querySelector('[data-e="undo"]').onclick = undo;
  box.querySelector('[data-e="shape"]').onclick = shapeModal;
  box.querySelector('[data-e="exit"]').onclick = () => close();
  const keyd = (e) => { if (!S.on || e.target.closest?.('input,textarea')) return; if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); } else if (e.key.toLowerCase() === 'r' && !e.ctrlKey) box.querySelector('[data-e="rot"]').click(); else if (e.key === 'Escape') close(); };
  addEventListener('keydown', keyd);

  // ---------------------------------------------------------------- abrir / fechar
  async function open(reforma) {
    S.rf = JSON.parse(JSON.stringify({ shape: 'quadrado', level: 0, add: [], floor: [], del: [], ...(reforma || {}) }));
    delete S.rf.owned; delete S.rf.updatedAt;
    S.owned = { ...(reforma?.owned || {}) }; S.hist = [];
    S.on = true; box.hidden = false; stage.classList.add('edit'); cam.follow = false;
    try { const d = await api.get('/mundo/construtora'); S.owned = Object.fromEntries(d.items.filter((i) => i.owned).map((i) => [i.key, i.owned])); S.rf.level = d.level; if (d.level !== reforma?.level) changed(null, true); } catch { /* usa o que veio com o mapa */ }
    const mine = Object.values(CATALOG).find((c) => S.owned[c.key]); if (mine) S.cat = mine.cat;
    drawPalette(); setTool('pan');
    status(Object.keys(S.owned).length ? 'Escolha um item na paleta e toque no mapa. Arraste para mover a câmera.' : 'Seu estoque de obra está vazio: compre na Construtora (botão 🛒). Você já pode apagar itens da cidade e mudar o formato do mapa.', 'tip');
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
      if (c.kind === 'floor') { ctx.fillStyle = c.color; ctx.fillRect(g.x, g.y, TILE, TILE); }
      else if (c.kind === 'bld') { const im = IMG[`bld/${c.spr}`]; if (im) ctx.drawImage(im, g.x, g.y, g.w, g.h); }
      else {
        const im = c.spr.startsWith('d:') ? IMG[`deco/${c.spr.slice(2)}`] : IMG[`props/${c.spr}`];
        if (im) { ctx.save(); if (c.kind === 'decal') { ctx.translate(g.x, g.y); ctx.rotate(S.rot); ctx.drawImage(im, -g.w / 2, -g.h / 2, g.w, g.h); } else { ctx.translate(g.x, g.y - g.h / 2); ctx.rotate(S.rot); ctx.drawImage(im, -g.w / 2, -g.h / 2, g.w, g.h); } ctx.restore(); }
      }
      ctx.globalAlpha = 1;
      const r = c.kind === 'floor' || c.kind === 'bld' ? [g.x, g.y, g.w, g.h] : c.kind === 'decal' ? [g.x - g.w / 2, g.y - g.h / 2, g.w, g.h] : [g.x - g.w / 2, g.y - g.h, g.w, g.h];
      ctx.strokeStyle = g.ok ? '#2fd27a' : '#ff4d5e'; ctx.lineWidth = 2 / z; ctx.setLineDash([4 / z, 3 / z]); ctx.strokeRect(...r); ctx.setLineDash([]);
    },
    destroy() { removeEventListener('keydown', keyd); clearTimeout(S.saveT); clearTimeout(S.rebuildT); if (S.dirty) save(); box.remove(); },
  };
}
