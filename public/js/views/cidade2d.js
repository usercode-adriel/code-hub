// Cidade 2D de Nexus City — mundo aberto dirigível (o novo Mapa).
// Cenário: os assets em pixel art (public/assets/drive). Módulos: world (mapa + colisão), traffic (carros
// automáticos e semáforos), peds (moradores reais andando), player (direção e caminhada), input (teclado,
// toque, pinça) e a câmera. Integra com a garagem real: seus carros comprados aparecem estacionados e você dirige.
import { api } from '../api.js';
import { icon } from '../icons.js';
import { esc, toast } from '../ui.js';
import { loadWorld, lightState, regionAt, nearestWalk, laneDist, at, LOT } from '../drive/world.js';
import { createTraffic, stepTraffic, toKmh, lengthOf } from '../drive/traffic.js';
import { createPeds, stepPeds } from '../drive/peds.js';
import { stepCar, stepWalker } from '../drive/player.js';
import { createInput, createCamera } from '../drive/input.js';
import { cityNow, myAvatar, refreshStatus } from '../chrome.js';
import { personCard } from '../world/wui.js';

const LOT_SPOTS = [[1276, 851, -Math.PI / 2], [1316, 851, -Math.PI / 2], [1216, 889, -Math.PI / 2], [1352, 889, -Math.PI / 2], [1150, 870, 0], [1200, 870, 0], [1250, 870, 0], [1300, 870, 0]];
const POI_IC = { hospital: '✚', shield: '★', flame: '▲', cart: '🛒', fuel: '⛽', scale: '⚖', trophy: '⚽', rocket: '✈', wallet: '$', bag: '🛍', sun: '☘', car: '🚗', briefcase: '⚓', building: '⌂' };

export default async function render(el) {
  el.innerHTML = `<div class="d2" id="d2">
    <canvas class="d2-cv" aria-label="Cidade de Nexus City"></canvas>
    <div class="d2-load" id="d2Load"><div class="skeleton" style="width:220px;height:14px;border-radius:7px"></div><small>Montando a cidade…</small></div>
    <div class="d2-top"><div class="d2-where"><b id="d2Reg">Nexus City</b><small id="d2Time">--:--</small></div>
      <div class="d2-tools"><button data-z="in" aria-label="Aproximar">${icon('plus', 16)}</button><button data-z="out" aria-label="Afastar">${icon('minus', 16)}</button><button data-z="me" aria-label="Centralizar em mim">${icon('target', 16)}</button><a href="#/mapa?classico=1" title="Mapa de bairros (rotas, lugares e casas)">${icon('map', 16)}</a></div></div>
    <canvas class="d2-mini" id="d2Mini" width="192" height="128" aria-label="Minimapa"></canvas>
    <div class="d2-dash" id="d2Dash" hidden><div class="d2-spd"><b id="d2Kmh">0</b><small>km/h</small></div><div class="d2-gearv" id="d2Gear">D</div><div class="d2-car"><small>Dirigindo</small><b id="d2CarName">—</b></div></div>
    <div class="d2-prompt" id="d2Prompt" hidden></div>
    <div class="d2-help" id="d2Help"><b>W A S D</b> andar/dirigir · <b>Espaço</b> freio de mão · <b>E</b> entrar/sair · <b>roda</b> zoom · <b>arrastar</b> explorar</div>
    <div class="d2-ctl d2-foot"><div class="d2-joy" data-ctl="joy"><i></i></div><button class="d2-act" data-ctl="enter" id="d2EnterF">Entrar</button></div>
    <div class="d2-ctl d2-drive"><div class="d2-steer"><button data-ctl="left" aria-label="Esquerda">${icon('chevLeft', 30)}</button><button data-ctl="right" aria-label="Direita">${icon('chevRight', 30)}</button></div>
      <div class="d2-pedals"><button class="d2-gearb" data-ctl="gear" id="d2GearB"><span>D</span><small>marcha</small></button><button class="d2-exit" data-ctl="enter">Sair</button><button class="d2-brake" data-ctl="brake">Freio</button><button class="d2-gas" data-ctl="gas">Acelerar</button></div></div>
  </div>`;
  const stage = el.querySelector('#d2'); const cv = stage.querySelector('.d2-cv'); const ctx = cv.getContext('2d', { alpha: false });
  const touch = matchMedia('(pointer: coarse)').matches || innerWidth < 900;
  stage.classList.toggle('touch', touch);
  let alive = true; let raf = 0;

  // ---------------- carregamento
  const loadImg = (src) => new Promise((ok, fail) => { const i = new Image(); i.decoding = 'async'; i.onload = () => ok(i); i.onerror = fail; i.src = src; });
  let world; let city; let meta; let state; let semaforo;
  try {
    [world, city, meta, state, semaforo] = await Promise.all([loadWorld(), loadImg('/assets/drive/city.webp'), fetch('/assets/drive/cars/sprites.json').then((r) => r.json()), api.get('/mundo/cidade2d'), loadImg('/assets/drive/semaforo.png').catch(() => null)]);
  } catch (err) { stage.querySelector('#d2Load').innerHTML = `<b>Não foi possível abrir a cidade</b><small>${esc(err.message)}</small>`; return; }
  if (!alive) return;
  stage.querySelector('#d2Load').remove();
  const sprites = { meta, img: {} };
  const spr = (k) => { if (!sprites.img[k]) { const i = new Image(); i.src = `/assets/drive/cars/${k}.png`; sprites.img[k] = i; } return sprites.img[k]; };
  const faces = new Map(); // avatar → imagem
  const face = (url) => { if (!url) return null; let f = faces.get(url); if (!f) { f = new Image(); f.src = url; faces.set(url, f); } return f.complete && f.naturalWidth ? f : null; };

  // ---------------- entidades
  const T = createTraffic(world, sprites, touch ? 14 : 22);
  const P = createPeds(world, state.people.slice(0, touch ? 22 : 36));
  const own = state.cars.map((c, i) => {
    const spot = c.parked ? [c.parked.x, c.parked.y, c.parked.a] : LOT_SPOTS[i % LOT_SPOTS.length];
    return { own: true, id: c.id, key: c.key, name: c.name, sprite: c.key, speed: c.speed || 1, x: spot[0], y: spot[1], a: spot[2], v: 0, steer: 0, gear: 'D', L: lengthOf('meu'), W: 11, main: c.main };
  });
  const startCar = own.find((c) => c.id === state.main) || own[0];
  const spawn = startCar ? nearestWalk(world, startCar.x, startCar.y + 14, 50) : null;
  const me = { x: 0, y: 0, a: 0, mode: 'foot', car: null, moving: false };
  [me.x, me.y] = spawn || nearestWalk(world, 900, 335, 60) || [900, 345];
  const cam = createCamera(world); cam.z = touch ? 3.2 : 3; cam.x = cam.tx = me.x; cam.y = cam.ty = me.y;

  // ---------------- entrada
  const input = createInput(stage, {
    onEnter: () => toggleCar(),
    onZoom: (f, sx, sy) => cam.zoomAt(f, sx, sy),
    onPan: (dx, dy) => cam.pan(dx, dy),
    onTap: (sx, sy) => tap(sx, sy),
  });
  input.touchUI = touch;
  stage.querySelectorAll('[data-z]').forEach((b) => { b.onclick = () => { const z = b.dataset.z; if (z === 'me') { cam.follow = true; return; } cam.zoomAt(z === 'in' ? 1.3 : 1 / 1.3, cam.vw / 2, cam.vh / 2); }; });
  const nearOwn = () => own.filter((c) => c !== me.car).map((c) => [c, Math.hypot(c.x - me.x, c.y - me.y)]).sort((a, b) => a[1] - b[1])[0];
  function toggleCar() {
    if (me.mode === 'car') {
      const c = me.car;
      if (Math.abs(c.v) > 4) { toast('Pare o carro primeiro', 'Freie até parar para poder sair.', 'info'); return; }
      const spot = nearestWalk(world, c.x - Math.sin(c.a) * 12, c.y + Math.cos(c.a) * 12, 46) || nearestWalk(world, c.x, c.y, 60);
      if (!spot) { toast('Sem calçada aqui', 'Encoste perto de uma calçada para sair.', 'info'); return; }
      me.mode = 'foot'; me.car = null; c.v = 0; [me.x, me.y] = spot;
      saveParking(c); checkParking(c);
      return;
    }
    const n = nearOwn();
    if (!n) { toast('Sem carro', 'Compre um carro na concessionária (Oficina Turbo) para dirigir.', 'info'); return; }
    if (n[1] > 30) { toast(`Seu ${n[0].name} está longe`, 'Ande até ele (marcador verde no mapa e no minimapa).', 'info'); return; }
    me.mode = 'car'; me.car = n[0]; n[0].gear = 'D'; n[0].towAt = null; cam.follow = true;
  }
  stage.querySelector('[data-ctl="gear"]').addEventListener('pointerup', () => {
    if (me.mode !== 'car') return;
    const c = me.car; c.gear = c.gear === 'D' ? 'N' : c.gear === 'N' ? 'R' : 'D';
  });
  function tap(sx, sy) {
    const [wx, wy] = cam.toWorld(sx, sy);
    const car = own.find((c) => Math.hypot(c.x - wx, c.y - wy) < 14);
    if (car) { if (me.mode === 'foot' && Math.hypot(car.x - me.x, car.y - me.y) <= 30) toggleCar(); else toast(car.name, me.mode === 'foot' ? 'Ande até o carro e toque em Entrar.' : 'Seu carro estacionado.', 'info'); return; }
    const ped = P.peds.find((p) => Math.hypot(p.x - wx, p.y - wy) < 7);
    if (ped) { personCard(ped.id); return; }
    const poi = world.pois.find((p) => Math.abs(p.at[0] - wx) < 36 / cam.z * 3 && Math.abs(p.at[1] - wy) < 12 / cam.z * 3);
    if (poi) location.hash = poi.route;
  }

  // ---------------- estacionamento e fiscalização
  const saveParking = (c) => api.post('/mundo/cidade2d/estacionar', { itemId: c.id, x: c.x, y: c.y, a: c.a }).catch(() => {});
  function checkParking(c) {
    const inLot = world.lots.some((l) => c.x > l.rect[0] && c.x < l.rect[2] && c.y > l.rect[1] && c.y < l.rect[3]);
    if (inLot || laneDist(world, c.x, c.y) > 7) return;
    c.towAt = performance.now() + 25000; c.towPos = [c.x, c.y];
    toast('Estacionado no meio da via', 'Tire o carro em 25 s ou ele será guinchado para o pátio e você leva multa.', 'warning');
  }
  const fineQ = new Map();
  async function fine(tipo, extra = {}) {
    const k = tipo.replace(/-.*/, ''); if ((fineQ.get(k) || 0) > performance.now()) return; fineQ.set(k, performance.now() + 15000);
    try {
      const r = await api.post('/mundo/cidade2d/infracao', { tipo, veiculo: me.car?.name, ...extra });
      if (r.ok) { toast('🚨 Multa de trânsito', `${r.fine.label}: ${r.fine.amount} NXC (Banco → Pendências)`, 'error'); flash = 1; refreshStatus(true); }
    } catch { /* offline */ }
  }
  let flash = 0; const lightIn = new Map(); const radarHit = new Map();
  function enforce(t) {
    const c = me.car; if (!c) return;
    const kmh = toKmh(c.v);
    for (const n of Object.values(world.nodes)) {
      if (!n.light) continue;
      const d = Math.hypot(c.x - n.x, c.y - n.y); const inside = d < n.clear - 6;
      const was = lightIn.get(n.id) || false;
      if (inside && !was && kmh > 8 && c.v > 0) {
        const axis = Math.abs(Math.cos(c.a)) >= Math.abs(Math.sin(c.a)) ? 'H' : 'V';
        if (lightState(n, axis, t) === 'red') fine('sinal');
      }
      lightIn.set(n.id, inside);
    }
    for (const [i, r] of world.radars.entries()) {
      if (Math.hypot(c.x - r.at[0], c.y - r.at[1]) > 22) continue;
      if ((radarHit.get(i) || 0) > performance.now()) continue;
      if (kmh > r.limit * 1.07 + 2) {
        radarHit.set(i, performance.now() + 8000);
        const ex = kmh / r.limit - 1;
        fine(ex <= 0.2 ? 'velocidade' : ex <= 0.5 ? 'velocidade-grave' : 'velocidade-gravissima', { kmh: Math.round(kmh), limite: r.limit });
      }
    }
  }
  function tow(now) {
    for (const c of own) {
      if (!c.towAt || c === me.car) continue;
      if (Math.hypot(c.x - c.towPos[0], c.y - c.towPos[1]) > 4) { c.towAt = null; continue; }
      if (now < c.towAt) continue;
      c.towAt = null;
      const free = LOT_SPOTS.find((s) => !own.some((o) => o !== c && Math.hypot(o.x - s[0], o.y - s[1]) < 12)) || LOT_SPOTS[0];
      [c.x, c.y, c.a] = free; saveParking(c);
      fine('estacionamento');
      toast(`${c.name} guinchado`, 'Ele foi levado ao estacionamento do supermercado.', 'info');
    }
  }

  // ---------------- tela
  let dpr = 1;
  const resize = () => {
    const r = stage.getBoundingClientRect(); dpr = Math.min(window.devicePixelRatio || 1, touch ? 1.5 : 2);
    cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
    cam.resize(r.width, r.height);
  };
  const ro = new ResizeObserver(resize); ro.observe(stage); resize();
  // minimapa: cidade reduzida desenhada uma vez
  const mini = stage.querySelector('#d2Mini'); const mctx = mini.getContext('2d');
  const miniBase = document.createElement('canvas'); miniBase.width = 192; miniBase.height = 128; miniBase.getContext('2d').drawImage(city, 0, 0, 192, 128);

  const drawSprite = (o, k, Lpx) => {
    const im = spr(k); if (!im.complete || !im.naturalWidth) return;
    const m = sprites.meta[k] || { w: 40, h: 66 }; const L = Lpx || o.L; const W = (L * m.w) / m.h;
    ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.a - Math.PI / 2); // sprites olham para baixo (frente embaixo)
    ctx.drawImage(im, -W / 2, -L / 2, W, L); ctx.restore();
  };
  function draw(t, night) {
    const z = cam.z; const vw = cam.vw; const vh = cam.vh;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#1b3fb0'; ctx.fillRect(0, 0, cv.width, cv.height);
    const k = z * dpr; ctx.setTransform(k, 0, 0, k, dpr * (vw / 2 - cam.x * z), dpr * (vh / 2 - cam.y * z));
    ctx.imageSmoothingEnabled = false;
    const x0 = Math.max(0, Math.floor(cam.x - vw / 2 / z) - 1); const y0 = Math.max(0, Math.floor(cam.y - vh / 2 / z) - 1);
    const x1 = Math.min(world.W, Math.ceil(cam.x + vw / 2 / z) + 1); const y1 = Math.min(world.H, Math.ceil(cam.y + vh / 2 / z) + 1);
    ctx.drawImage(city, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0); // só o pedaço visível
    const inView = (o, pad = 30) => o.x > x0 - pad && o.x < x1 + pad && o.y > y0 - pad && o.y < y1 + pad;
    // semáforos (cor de cada sentido nas esquinas) e radares
    for (const n of Object.values(world.nodes)) {
      if (!n.light || !inView(n, 40)) continue;
      const h = n.maxW / 2 + 5; const col = (s) => (s === 'green' ? '#2fd27a' : s === 'yellow' ? '#f7c948' : '#ff4d5e');
      const H = lightState(n, 'H', t); const V = lightState(n, 'V', t);
      for (const [dx, dy, s] of [[h, -h, H], [-h, h, H], [-h, -h, V], [h, h, V]]) {
        if (semaforo) ctx.drawImage(semaforo, n.x + dx - 2.2, n.y + dy - 9, 4.4, 17.6);
        ctx.fillStyle = col(s); ctx.beginPath(); ctx.arc(n.x + dx, n.y + dy - 6.5, 1.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    for (const r of world.radars) {
      if (!inView({ x: r.at[0], y: r.at[1] })) continue;
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#e11d48'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(r.at[0] + 14, r.at[1] - 16, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#111'; ctx.font = 'bold 5px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(r.limit), r.at[0] + 14, r.at[1] - 15.6);
      ctx.fillStyle = '#334155'; ctx.fillRect(r.at[0] + 19, r.at[1] - 18, 4, 3);
    }
    // pedestres
    for (const p of P.peds) {
      if (!inView(p, 10)) continue;
      ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 2.4, 2.8, 1.3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2); ctx.fill();
      const f = z >= 2 ? face(p.avatar) : null;
      if (f) { ctx.save(); ctx.beginPath(); ctx.arc(p.x, p.y - 2.5, 3.2, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(f, p.x - 3.2, p.y - 5.7, 6.4, 6.4); ctx.restore(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.arc(p.x, p.y - 2.5, 3.2, 0, Math.PI * 2); ctx.stroke(); }
    }
    // carros
    for (const c of T.cars) if (inView(c)) drawSprite(c, c.sprite);
    for (const c of own) {
      if (!inView(c)) continue;
      if (c !== me.car) { ctx.strokeStyle = '#2fd27a'; ctx.lineWidth = 1.2; ctx.setLineDash([2, 1.5]); ctx.beginPath(); ctx.arc(c.x, c.y, 13, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
      drawSprite(c, c.sprite);
    }
    // você a pé
    if (me.mode === 'foot') {
      ctx.fillStyle = 'rgba(56,214,245,.25)'; ctx.beginPath(); ctx.arc(me.x, me.y, 7, 0, Math.PI * 2); ctx.fill();
      const f = face(myAvatar());
      ctx.fillStyle = '#6c4cf5'; ctx.beginPath(); ctx.arc(me.x, me.y, 3.4, 0, Math.PI * 2); ctx.fill();
      if (f) { ctx.save(); ctx.beginPath(); ctx.arc(me.x, me.y - 3, 4, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(f, me.x - 4, me.y - 7, 8, 8); ctx.restore(); }
      ctx.strokeStyle = '#38d6f5'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(me.x, me.y - 3, 4, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#38d6f5'; ctx.beginPath(); ctx.moveTo(me.x + Math.cos(me.a) * 9, me.y + Math.sin(me.a) * 9); ctx.lineTo(me.x + Math.cos(me.a + 2.6) * 6, me.y + Math.sin(me.a + 2.6) * 6); ctx.lineTo(me.x + Math.cos(me.a - 2.6) * 6, me.y + Math.sin(me.a - 2.6) * 6); ctx.fill();
    }
    // noite
    if (night) { ctx.fillStyle = 'rgba(10, 12, 50, .42)'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); for (const c of [...T.cars, ...(me.car ? [me.car] : [])]) { if (!inView(c)) continue; const hx = c.x + Math.cos(c.a) * 16; const hy = c.y + Math.sin(c.a) * 16; const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, 12); g.addColorStop(0, 'rgba(255,240,180,.35)'); g.addColorStop(1, 'rgba(255,240,180,0)'); ctx.fillStyle = g; ctx.fillRect(hx - 12, hy - 12, 24, 24); } }
    // rótulos (em pixels de tela, nítidos)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const S = (x, y) => [(x - cam.x) * z + vw / 2, (y - cam.y) * z + vh / 2];
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const pill = (x, y, text, bg, fg = '#fff', fs = 11) => { ctx.font = `600 ${fs}px Poppins, system-ui, sans-serif`; const w = ctx.measureText(text).width + 12; ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x - w / 2, y - fs * 0.85, w, fs * 1.7, 6); ctx.fill(); ctx.fillStyle = fg; ctx.fillText(text, x, y + 0.5); };
    for (const p of world.pois) { const [sx, sy] = S(p.at[0], p.at[1]); if (sx < -60 || sy < -20 || sx > vw + 60 || sy > vh + 20) continue; pill(sx, sy, `${POI_IC[p.icon] || '•'} ${p.label}`, 'rgba(10,13,43,.82)', '#fff', z < 2 ? 9 : 11); }
    if (z >= 3) { let n = 0; for (const p of P.peds) { if (!inView(p, 0) || n++ > 30) continue; const [sx, sy] = S(p.x, p.y - 8); pill(sx, sy, p.name.split(' ')[0], 'rgba(10,13,43,.7)', '#fff', 9); } }
    for (const c of own) { if (c === me.car || !inView(c, 0)) continue; const [sx, sy] = S(c.x, c.y - 16); pill(sx, sy, `SEU · ${c.name}`, '#1f9d5a', '#fff', 10); }
    if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash * 0.5})`; ctx.fillRect(0, 0, vw, vh); }
  }
  function drawMini() {
    mctx.drawImage(miniBase, 0, 0);
    const kx = 192 / world.W; const ky = 128 / world.H;
    mctx.strokeStyle = 'rgba(255,255,255,.9)'; mctx.lineWidth = 1;
    mctx.strokeRect((cam.x - cam.vw / 2 / cam.z) * kx, (cam.y - cam.vh / 2 / cam.z) * ky, (cam.vw / cam.z) * kx, (cam.vh / cam.z) * ky);
    for (const c of own) { mctx.fillStyle = '#2fd27a'; mctx.fillRect(c.x * kx - 2, c.y * ky - 2, 4, 4); }
    const p = me.car || me; mctx.fillStyle = '#38d6f5'; mctx.beginPath(); mctx.arc(p.x * kx, p.y * ky, 3, 0, Math.PI * 2); mctx.fill(); mctx.strokeStyle = '#0a0d2b'; mctx.stroke();
  }
  mini.onclick = (e) => { const r = mini.getBoundingClientRect(); cam.follow = false; cam.x = cam.tx = ((e.clientX - r.left) / r.width) * world.W; cam.y = cam.ty = ((e.clientY - r.top) / r.height) * world.H; };

  // ---------------- HUD
  const $ = (s) => stage.querySelector(s);
  let hudT = 0; let lastPrompt = '';
  function hud() {
    const k = cityNow(); $('#d2Time').textContent = `${k.text}${k.day ? ` · Dia ${k.day}` : ''}`;
    const p = me.car || me; $('#d2Reg').textContent = regionAt(world, p.x, p.y);
    stage.classList.toggle('driving', me.mode === 'car');
    $('#d2Dash').hidden = me.mode !== 'car';
    if (me.car) { $('#d2Kmh').textContent = Math.round(toKmh(me.car.v)); $('#d2Gear').textContent = me.car.gear; $('#d2CarName').textContent = me.car.name; $('#d2GearB span').textContent = me.car.gear; $('#d2Gear').className = `d2-gearv g-${me.car.gear}`; }
    // interação: carro perto, estabelecimento perto
    let html = '';
    if (me.mode === 'foot') {
      const n = nearOwn();
      if (n && n[1] <= 30) html = `<button data-act="enter">${icon('car', 15)} <b>E</b> Entrar no ${esc(n[0].name)}</button>`;
      $('#d2EnterF').textContent = n && n[1] <= 30 ? 'Entrar' : 'Carro';
    } else if (Math.abs(me.car.v) < 4) html = `<button data-act="enter">${icon('logout', 15)} <b>E</b> Sair do carro</button>`;
    const poi = world.pois.map((q) => [q, Math.hypot(q.at[0] - p.x, q.at[1] - p.y)]).sort((a, b) => a[1] - b[1])[0];
    if (poi && poi[1] < 78) html += `<a href="${esc(poi[0].route)}">${icon('pin', 15)} Entrar: <b>${esc(poi[0].label)}</b></a>`;
    if (html !== lastPrompt) { lastPrompt = html; const pr = $('#d2Prompt'); pr.hidden = !html; pr.innerHTML = html; pr.querySelector('[data-act="enter"]')?.addEventListener('click', toggleCar); }
  }

  // ---------------- laço principal (delta time, pausa em segundo plano)
  let last = performance.now(); let miniT = 0; let saveT = 0; const perf = { frames: 0, work: 0 };
  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = Date.now() / 1000; // mesmo relógio para semáforos, carros e pedestres
    const inp = input.read();
    if (me.mode === 'car') {
      stepCar(me.car, inp, world, dt, [...T.cars, ...own.filter((c) => c !== me.car)]);
      if (me.car.hit === 'carro' && now > (me.bumpAt || 0)) { me.bumpAt = now + 4000; toast('Batida!', 'Cuidado com os outros carros.', 'warning'); }
      enforce(t);
    } else stepWalker(me, inp, world, dt, [...T.cars, ...own]);
    const crossing = stepPeds(P, world, dt, t, [...T.cars, ...(me.car ? [me.car] : [])]);
    const extra = [...own.map((c) => (c === me.car ? c : { x: c.x, y: c.y, a: c.a, L: c.L, W: c.W })), ...(me.mode === 'foot' && at(world, me.x, me.y) !== 1 ? [{ x: me.x, y: me.y, L: 5, W: 5 }] : []), ...P.peds.filter((p) => p.state === 'cross').map((p) => ({ x: p.x, y: p.y, L: 5, W: 6 }))];
    const view = { x: cam.x, y: cam.y, r: Math.max(cam.vw, cam.vh) / cam.z / 2 + 60 };
    stepTraffic(T, world, dt, t, { extra, crossing, view });
    const tgt = me.car ? { x: me.car.x + Math.cos(me.car.a) * me.car.v * 0.35, y: me.car.y + Math.sin(me.car.a) * me.car.v * 0.35 } : me;
    cam.update(dt, tgt);
    if (inp.mx || inp.my || inp.throttle) cam.follow = true;
    if (flash > 0) flash = Math.max(0, flash - dt * 2.5);
    draw(t, cityNow().night);
    perf.frames++; perf.work += performance.now() - now;
    hudT += dt; if (hudT > 0.12) { hudT = 0; hud(); }
    miniT += dt; if (miniT > 0.3) { miniT = 0; drawMini(); }
    saveT += dt; if (saveT > 20 && me.car) { saveT = 0; saveParking(me.car); }
    tow(now);
  }
  raf = requestAnimationFrame(frame);
  window.__d2 = { me, own, T, P, world, cam, input, toggleCar, perf }; // inspeção (testes automáticos)
  // pedestres: a lista de quem está na rua muda com o tempo
  const peopleT = setInterval(async () => {
    try { const s = await api.get('/mundo/cidade2d'); const known = new Set(P.peds.map((p) => p.id)); for (const p of P.peds) { const q = s.people.find((x) => x.id === p.id); if (q) { p.name = q.name; p.avatar = q.avatar; } } void known; } catch { /* ok */ }
  }, 90000);
  if (!touch) setTimeout(() => $('#d2Help')?.classList.add('fade'), 9000);
  return () => { alive = false; if (window.__d2?.me === me) delete window.__d2; cancelAnimationFrame(raf); ro.disconnect(); input.destroy(); clearInterval(peopleT); if (me.car) saveParking(me.car); };
}
export { LOT };
