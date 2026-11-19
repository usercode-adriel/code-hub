// Controles: teclado (W/S/A/D, setas, espaço, E, F, Shift), mouse (roda = zoom, arrastar = explorar) e, no celular,
// controles virtuais com multitoque: joystick a pé; volante ◀ ▶, acelerador, freio, marcha D/N/R e entrar/sair
// dirigindo; potência, subir/descer pilotando. Pinça para zoom. Funciona com a tela girada (modo paisagem forçado).
export function createInput(stage, { onEnter, onZoom, onPan, onTap, onHover, paint } = {}) {
  const keys = new Set();
  const st = { throttle: 0, brake: 0, steer: 0, hand: 0, mx: 0, my: 0, autoGear: true, keys, touch: matchMedia('(pointer: coarse)').matches };
  const rot = () => stage.dataset.rot === '1';
  // coordenadas do evento no sistema do palco (desfaz a rotação de 90° quando a tela está girada)
  const local = (cx, cy) => { const r = stage.getBoundingClientRect(); return rot() ? [cy - r.top, r.right - cx] : [cx - r.left, cy - r.top]; };
  const localDelta = (dx, dy) => (rot() ? [dy, -dx] : [dx, dy]);
  const kd = (e) => {
    if (e.target.closest?.('input,textarea,select')) return;
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'e', 'f', 'shift', 'q', 'z', 'x'].includes(k)) e.preventDefault();
    if ((k === 'e' || k === 'f') && !e.repeat) onEnter?.();
    keys.add(k);
  };
  const ku = (e) => keys.delete(e.key.toLowerCase());
  addEventListener('keydown', kd); addEventListener('keyup', ku);
  const blur = () => keys.clear(); addEventListener('blur', blur);

  // ---- botões de toque (cada botão segura o próprio dedo) ----
  const held = new Map();
  const pad = { steer: 0, gas: 0, brake: 0, hand: 0, pup: 0, pdown: 0 };
  const joy = { id: null, cx: 0, cy: 0, x: 0, y: 0 };
  // alavanca de voo (celular): fica onde for deixada; para baixo = puxar (nariz para cima / subir)
  const lev = { id: null, v: 0, used: false };
  const levMove = (e) => {
    if (e.pointerId !== lev.id) return;
    const tr = stage.querySelector('.d2-lev-track'); if (!tr) return; const r = tr.getBoundingClientRect();
    const rotd = rot(); const t = rotd ? (r.right - e.clientX) / r.width : (e.clientY - r.top) / r.height; // 0 topo, 1 base
    lev.v = Math.max(-1, Math.min(1, (t - 0.5) * 2)); if (Math.abs(lev.v) < 0.08) lev.v = 0; lev.used = true; paintLever();
  };
  const paintLever = () => { const k = stage.querySelector('.d2-lev-track i'); if (k) k.style.top = `${((lev.v + 1) / 2) * 100}%`; };
  const knob = () => stage.querySelector('.d2-joy i');
  const buzz = () => { try { navigator.vibrate?.(8); } catch { /* sem vibração */ } };
  const btnDown = (e) => {
    const b = e.target.closest('[data-ctl]'); if (!b) return;
    e.preventDefault(); b.setPointerCapture?.(e.pointerId);
    const c = b.dataset.ctl;
    if (c === 'lever') { lev.id = e.pointerId; levMove(e); return; }
    if (c === 'joy') { const r = b.getBoundingClientRect(); [joy.cx, joy.cy] = local(r.left + r.width / 2, r.top + r.height / 2); joy.id = e.pointerId; joyMove(e); return; }
    buzz();
    if (c === 'enter') { onEnter?.(); b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 150); return; }
    if (c === 'gear') { st.gearTap = true; b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 150); return; }
    held.set(e.pointerId, c); b.classList.add('on'); sync();
  };
  const joyMove = (e) => {
    if (e.pointerId === lev.id) { levMove(e); return; }
    if (e.pointerId !== joy.id) return;
    const [lx, ly] = local(e.clientX, e.clientY);
    let dx = lx - joy.cx; let dy = ly - joy.cy; const m = Math.hypot(dx, dy); const R = 46;
    if (m > R) { dx = (dx / m) * R; dy = (dy / m) * R; }
    joy.x = dx / R; joy.y = dy / R;
    const k = knob(); if (k) k.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const btnUp = (e) => {
    if (e.pointerId === lev.id) { lev.id = null; return; }
    if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; const k = knob(); if (k) k.style.transform = ''; return; }
    const c = held.get(e.pointerId); if (!c) return;
    held.delete(e.pointerId); for (const el of stage.querySelectorAll(`[data-ctl="${c}"]`)) el.classList.remove('on'); sync();
  };
  const sync = () => {
    const v = [...held.values()];
    pad.steer = (v.includes('right') ? 1 : 0) - (v.includes('left') ? 1 : 0);
    pad.gas = v.includes('gas') ? 1 : 0; pad.brake = v.includes('brake') ? 1 : 0; pad.hand = v.includes('hand') ? 1 : 0;
    pad.pup = v.includes('pup') ? 1 : 0; pad.pdown = v.includes('pdown') ? 1 : 0;
  };
  stage.addEventListener('pointerdown', btnDown);
  addEventListener('pointermove', joyMove);
  addEventListener('pointerup', btnUp); addEventListener('pointercancel', btnUp);

  // ---- mapa: roda, arrastar e pinça ----
  const cv = stage.querySelector('canvas');
  const pts = new Map(); let pinch = null; let drag = null; let painting = false;
  cv.addEventListener('wheel', (e) => { e.preventDefault(); const [lx, ly] = local(e.clientX, e.clientY); onZoom?.(e.deltaY < 0 ? 1.15 : 1 / 1.15, lx, ly); }, { passive: false });
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) }; drag = null; if (painting) { painting = false; paint.end(); } }
    else { const [lx, ly] = local(e.clientX, e.clientY); drag = { x: e.clientX, y: e.clientY, moved: 0, lx, ly }; if (paint?.active()) { painting = true; paint.at(lx, ly); } }
  });
  // passar o mouse por cima (prévia do modo Reforma)
  cv.addEventListener('pointermove', (e) => { if (!pts.has(e.pointerId) && e.pointerType === 'mouse') onHover?.(...local(e.clientX, e.clientY)); });
  cv.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (painting && pts.size === 1) { const [lx, ly] = local(e.clientX, e.clientY); onHover?.(lx, ly); paint.at(lx, ly); return; }
    if (pinch && pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); const [lx, ly] = local((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); onZoom?.(d / pinch.d, lx, ly); pinch.d = d; return; }
    if (drag) { const dx = e.clientX - drag.x; const dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY; if (drag.moved > 6) onPan?.(...localDelta(dx, dy)); }
  });
  const end = (e) => { if (painting) { painting = false; paint.end(); pts.delete(e.pointerId); if (!pts.size) drag = null; return; } if (drag && drag.moved <= 6 && pts.size === 1) onTap?.(drag.lx, drag.ly); pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) drag = null; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);

  st.read = () => {
    const K = (...k) => k.some((x) => keys.has(x));
    st.throttle = K('w', 'arrowup') || pad.gas ? 1 : 0;
    st.brake = K('s', 'arrowdown') || pad.brake ? 1 : 0;
    st.steer = (K('d', 'arrowright') ? 1 : 0) - (K('a', 'arrowleft') ? 1 : 0) || pad.steer;
    st.hand = K(' ') || pad.hand ? 1 : 0;
    st.mx = (K('d', 'arrowright') ? 1 : 0) - (K('a', 'arrowleft') ? 1 : 0) || joy.x;
    st.my = (K('s', 'arrowdown') ? 1 : 0) - (K('w', 'arrowup') ? 1 : 0) || joy.y;
    // avião: W/S potência, A/D curva, Espaço/↑ sobe, Shift/↓ desce (no celular: botões próprios)
    st.plane = { up: K('w') || pad.gas, down: K('s') || pad.brake, left: K('a', 'arrowleft') || pad.steer < 0, right: K('d', 'arrowright') || pad.steer > 0, pitchUp: K(' ', 'arrowup') || pad.pup, pitchDown: K('shift', 'arrowdown') || pad.pdown, brake: K('s') || pad.brake };
    st.autoGear = !st.touchUI;
    if (st.touchUI && lev.used && !(K(' ', 'arrowup', 'shift', 'arrowdown'))) st.plane.lever = lev.v; // alavanca do celular
    else st.plane.lever = undefined;
    return st;
  };
  // volta a alavanca ao centro (ao entrar numa aeronave)
  st.resetLever = (v = 0) => { lev.v = v; lev.used = false; paintLever(); };
  st.destroy = () => { removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('blur', blur); removeEventListener('pointermove', joyMove); removeEventListener('pointerup', btnUp); removeEventListener('pointercancel', btnUp); };
  return st;
}

// CameraSystem — segue o jogador suavemente (olhando à frente do veículo), zoom com limites, sem tremor
export function createCamera(world) {
  const cam = { x: 900, y: 500, z: 3, tx: 900, ty: 500, tz: null, follow: true, vw: 800, vh: 600, zmin: 0.3, zmax: 6 };
  const B = () => world.bounds || { x0: 0, y0: 0, x1: world.W, y1: world.H };
  cam.resize = (w, h) => { const b = B(); cam.vw = w; cam.vh = h; cam.zmin = Math.max(w / (b.x1 - b.x0), h / (b.y1 - b.y0), 0.12); cam.z = Math.max(cam.zmin, Math.min(cam.zmax, cam.z)); cam.clamp(); };
  cam.clamp = () => {
    const b = B(); const hw = cam.vw / 2 / cam.z; const hh = cam.vh / 2 / cam.z;
    cam.x = hw * 2 >= b.x1 - b.x0 ? (b.x0 + b.x1) / 2 : Math.max(b.x0 + hw, Math.min(b.x1 - hw, cam.x));
    cam.y = hh * 2 >= b.y1 - b.y0 ? (b.y0 + b.y1) / 2 : Math.max(b.y0 + hh, Math.min(b.y1 - hh, cam.y));
  };
  cam.update = (dt, target) => {
    if (cam.follow && target) { cam.tx = target.x; cam.ty = target.y; }
    const k = 1 - Math.exp(-dt * 6);
    cam.x += (cam.tx - cam.x) * k; cam.y += (cam.ty - cam.y) * k;
    if (cam.tz) { cam.z += (Math.max(cam.zmin, Math.min(cam.zmax, cam.tz)) - cam.z) * (1 - Math.exp(-dt * 2.5)); }
    cam.clamp();
  };
  cam.zoomAt = (f, sx, sy) => {
    cam.tz = null;
    const wx = cam.x + (sx - cam.vw / 2) / cam.z; const wy = cam.y + (sy - cam.vh / 2) / cam.z;
    cam.z = Math.max(cam.zmin, Math.min(cam.zmax, cam.z * f));
    if (!cam.follow) { cam.x = wx - (sx - cam.vw / 2) / cam.z; cam.y = wy - (sy - cam.vh / 2) / cam.z; cam.tx = cam.x; cam.ty = cam.y; }
    cam.clamp();
  };
  cam.pan = (dx, dy) => { cam.follow = false; cam.x -= dx / cam.z; cam.y -= dy / cam.z; cam.tx = cam.x; cam.ty = cam.y; cam.clamp(); };
  cam.toWorld = (sx, sy) => [cam.x + (sx - cam.vw / 2) / cam.z, cam.y + (sy - cam.vh / 2) / cam.z];
  return cam;
}
