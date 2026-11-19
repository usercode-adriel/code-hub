// Controles: teclado (W/S/A/D, setas, espaço, E), mouse (roda = zoom, arrastar = explorar) e, no celular,
// controles virtuais (joystick a pé; volante ◀ ▶, acelerador, freio, marcha D/N/R e entrar/sair dirigindo),
// com multitoque e pinça para zoom.
export function createInput(stage, { onEnter, onZoom, onPan, onTap } = {}) {
  const keys = new Set();
  const st = { throttle: 0, brake: 0, steer: 0, hand: 0, mx: 0, my: 0, autoGear: true, touch: matchMedia('(pointer: coarse)').matches };
  const kd = (e) => {
    if (e.target.closest?.('input,textarea,select')) return;
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', ' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'e', 'shift'].includes(k)) e.preventDefault();
    if (k === 'e' && !e.repeat) onEnter?.();
    keys.add(k);
  };
  const ku = (e) => keys.delete(e.key.toLowerCase());
  addEventListener('keydown', kd); addEventListener('keyup', ku);
  const blur = () => keys.clear(); addEventListener('blur', blur);

  // ---- toque: botões (cada um segura o próprio dedo) ----
  const held = new Map(); // pointerId -> ação
  const pad = { steer: 0, gas: 0, brake: 0, hand: 0 };
  const joy = { id: null, cx: 0, cy: 0, x: 0, y: 0 };
  const btnDown = (e) => {
    const b = e.target.closest('[data-ctl]'); if (!b) return;
    e.preventDefault(); b.setPointerCapture?.(e.pointerId);
    const c = b.dataset.ctl;
    if (c === 'joy') { const r = b.getBoundingClientRect(); joy.id = e.pointerId; joy.cx = r.left + r.width / 2; joy.cy = r.top + r.height / 2; joyMove(e); return; }
    if (c === 'enter') { onEnter?.(); b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 150); return; }
    if (c === 'gear') { st.gearTap = true; return; }
    held.set(e.pointerId, c); b.classList.add('on'); sync();
  };
  const joyMove = (e) => {
    if (e.pointerId !== joy.id) return;
    let dx = e.clientX - joy.cx; let dy = e.clientY - joy.cy; const m = Math.hypot(dx, dy); const R = 46;
    if (m > R) { dx = (dx / m) * R; dy = (dy / m) * R; }
    joy.x = dx / R; joy.y = dy / R;
    const knob = stage.querySelector('.d2-joy i'); if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const btnUp = (e) => {
    if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; const knob = stage.querySelector('.d2-joy i'); if (knob) knob.style.transform = ''; return; }
    const c = held.get(e.pointerId); if (!c) return;
    held.delete(e.pointerId); stage.querySelector(`[data-ctl="${c}"]`)?.classList.remove('on'); sync();
  };
  const sync = () => { const v = [...held.values()]; pad.steer = (v.includes('right') ? 1 : 0) - (v.includes('left') ? 1 : 0); pad.gas = v.includes('gas') ? 1 : 0; pad.brake = v.includes('brake') ? 1 : 0; pad.hand = v.includes('hand') ? 1 : 0; };
  stage.addEventListener('pointerdown', btnDown);
  addEventListener('pointermove', joyMove);
  addEventListener('pointerup', btnUp); addEventListener('pointercancel', btnUp);

  // ---- mapa: roda, arrastar e pinça ----
  const cv = stage.querySelector('canvas');
  const pts = new Map(); let pinch = null; let drag = null;
  cv.addEventListener('wheel', (e) => { e.preventDefault(); onZoom?.(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.offsetX, e.offsetY); }, { passive: false });
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) }; drag = null; } else drag = { x: e.clientX, y: e.clientY, moved: 0, ox: e.offsetX, oy: e.offsetY };
  });
  cv.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); const r = cv.getBoundingClientRect(); onZoom?.(d / pinch.d, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top); pinch.d = d; return; }
    if (drag) { const dx = e.clientX - drag.x; const dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY; if (drag.moved > 6) onPan?.(dx, dy); }
  });
  const end = (e) => { if (drag && drag.moved <= 6 && pts.size === 1) onTap?.(drag.ox, drag.oy); pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) drag = null; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);

  st.read = () => {
    const K = (...k) => k.some((x) => keys.has(x));
    st.throttle = K('w', 'arrowup') || pad.gas ? 1 : 0;
    st.brake = K('s', 'arrowdown') || pad.brake ? 1 : 0;
    st.steer = (K('d', 'arrowright') ? 1 : 0) - (K('a', 'arrowleft') ? 1 : 0) || pad.steer;
    st.hand = K(' ') || pad.hand ? 1 : 0;
    st.mx = (K('d', 'arrowright') ? 1 : 0) - (K('a', 'arrowleft') ? 1 : 0) || joy.x;
    st.my = (K('s', 'arrowdown') ? 1 : 0) - (K('w', 'arrowup') ? 1 : 0) || joy.y;
    // no celular a marcha é manual (botão D/N/R); no teclado, S parado engata a ré
    st.autoGear = !st.touchUI;
    return st;
  };
  st.destroy = () => { removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('blur', blur); removeEventListener('pointermove', joyMove); removeEventListener('pointerup', btnUp); removeEventListener('pointercancel', btnUp); };
  return st;
}

// CameraSystem — segue o jogador suavemente, olha um pouco à frente do carro, zoom com limites e sem tremor
export function createCamera(world) {
  const cam = { x: 900, y: 500, z: 3, tx: 900, ty: 500, follow: true, vw: 800, vh: 600, zmin: 1, zmax: 5 };
  cam.resize = (w, h) => { cam.vw = w; cam.vh = h; cam.zmin = Math.max(w / world.W, h / world.H); cam.z = Math.max(cam.zmin, Math.min(cam.zmax, cam.z)); };
  cam.clamp = () => {
    const hw = cam.vw / 2 / cam.z; const hh = cam.vh / 2 / cam.z;
    cam.x = Math.max(hw, Math.min(world.W - hw, cam.x)); cam.y = Math.max(hh, Math.min(world.H - hh, cam.y));
  };
  cam.update = (dt, target) => {
    if (cam.follow && target) { cam.tx = target.x; cam.ty = target.y; }
    const k = 1 - Math.exp(-dt * 6);
    cam.x += (cam.tx - cam.x) * k; cam.y += (cam.ty - cam.y) * k;
    cam.clamp();
  };
  cam.zoomAt = (f, sx, sy) => {
    const wx = cam.x + (sx - cam.vw / 2) / cam.z; const wy = cam.y + (sy - cam.vh / 2) / cam.z;
    cam.z = Math.max(cam.zmin, Math.min(cam.zmax, cam.z * f));
    if (!cam.follow) { cam.x = wx - (sx - cam.vw / 2) / cam.z; cam.y = wy - (sy - cam.vh / 2) / cam.z; cam.tx = cam.x; cam.ty = cam.y; }
    cam.clamp();
  };
  cam.pan = (dx, dy) => { cam.follow = false; cam.x -= dx / cam.z; cam.y -= dy / cam.z; cam.tx = cam.x; cam.ty = cam.y; cam.clamp(); };
  cam.toWorld = (sx, sy) => [cam.x + (sx - cam.vw / 2) / cam.z, cam.y + (sy - cam.vh / 2) / cam.z];
  return cam;
}
