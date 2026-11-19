// Mapa jogável do RPG — Nexus City em pixel art 16-bit, vista de cima.
// Módulos: city (gerador da cidade), render (blocos em cache + noite), world (grafo e colisão), traffic (trânsito
// automático), peds (moradores e passantes), player (direção e caminhada), plane (voo), incidents (acidentes,
// emergência e perseguição) e input (teclado, toque, pinça, tela girada). Integra com a garagem, a economia,
// as multas, as notícias e os moradores reais do RPG.
import { api } from '../api.js';
import { icon } from '../icons.js';
import { esc, toast } from '../ui.js';
import { buildGraph, lightState, nearestWalk, laneDist, at, canFoot, canWalk, canDrive, WATER, RUNWAY } from '../drive/world.js';
import { generateCity, CS } from '../drive/city.js';
import { createRenderer } from '../drive/render.js';
import { loadAssets } from '../drive/assets.js';
import { createTraffic, stepTraffic, toKmh, lengthOf } from '../drive/traffic.js';
import { createPeds, stepPeds, gather } from '../drive/peds.js';
import { stepCar, stepWalker, crashDamage } from '../drive/player.js';
import { createPlane, stepPlane, knots, feet } from '../drive/plane.js';
import { createIncidents } from '../drive/incidents.js';
import { createEditor } from '../drive/editor.js';
import { createInput, createCamera } from '../drive/input.js';
import { cityNow, refreshStatus } from '../chrome.js';
import { personCard } from '../world/wui.js';
import { store } from '../store.js';

const POI_IC = { hospital: '✚', shield: '★', flame: '▲', cart: '🛒', fuel: '⛽', scale: '⚖', trophy: '⚽', rocket: '✈', wallet: '$', bag: '🛍', sun: '☘', car: '🚗', briefcase: '⚓', building: '⌂', flag: '⚑', school: '✎', bus: '🚌' };
const nightOf = (h) => (h >= 20 || h < 5 ? 1 : h >= 17.5 ? (h - 17.5) / 2.5 : h < 7 ? (7 - h) / 2 : 0);

export default async function render(el, params = new URLSearchParams()) {
  el.innerHTML = `<div class="d2" id="d2">
    <canvas class="d2-cv" aria-label="Mapa jogável de Nexus City"></canvas>
    <div class="d2-load" id="d2Load"><div class="skeleton" style="width:220px;height:14px;border-radius:7px"></div><small>Montando Nexus City…</small></div>
    <div class="d2-top"><div class="d2-where"><b id="d2Reg">Nexus City</b><small id="d2Time">--:--</small></div>
      <div class="d2-tools"><button data-z="in" aria-label="Aproximar">${icon('plus', 16)}</button><button data-z="out" aria-label="Afastar">${icon('minus', 16)}</button><button data-z="me" aria-label="Centralizar em mim">${icon('target', 16)}</button><button data-z="edit" class="d2-editb" title="Modo Reforma: posicionar prédios, canteiros e ruas">🔨<span>Reforma</span></button><button data-z="rot" class="d2-only-touch" aria-label="Girar tela / tela cheia">⟳</button><a href="#/mapa?classico=1" title="Mapa de bairros (rotas, lugares e casas)">${icon('map', 16)}</a></div></div>
    <div class="d2-wanted" id="d2Want" hidden></div>
    <canvas class="d2-mini" id="d2Mini" width="192" height="132" aria-label="Minimapa"></canvas>
    <div class="d2-dash" id="d2Dash" hidden></div>
    <div class="d2-prompt" id="d2Prompt" hidden></div>
    <div class="d2-help" id="d2Help"><b>W A S D</b> andar/dirigir · <b>Espaço</b> freio de mão · <b>E</b> entrar/sair · <b>roda</b> zoom · <b>arrastar</b> explorar · no avião: <b>W/S</b> potência, <b>Espaço</b> sobe, <b>Shift</b> desce</div>
    <div class="d2-ctl d2-foot"><div class="d2-joy" data-ctl="joy"><i></i></div><button class="d2-act" data-ctl="enter" id="d2EnterF">Entrar</button></div>
    <div class="d2-ctl d2-drive"><div class="d2-steer"><button data-ctl="left" aria-label="Esquerda">${icon('chevLeft', 28)}</button><button data-ctl="right" aria-label="Direita">${icon('chevRight', 28)}</button></div>
      <div class="d2-pedals"><button class="d2-gearb" data-ctl="gear" id="d2GearB"><span>D</span><small>marcha</small></button><button class="d2-exit" data-ctl="enter">Sair</button><button class="d2-brake" data-ctl="brake">Freio</button><button class="d2-gas" data-ctl="gas">Acelerar</button></div></div>
    <div class="d2-ctl d2-fly"><div class="d2-steer"><button data-ctl="left" aria-label="Esquerda">${icon('chevLeft', 28)}</button><button data-ctl="right" aria-label="Direita">${icon('chevRight', 28)}</button></div>
      <div class="d2-pedals fly"><button class="d2-pitch" data-ctl="pup">▲<small>subir</small></button><button class="d2-exit" data-ctl="enter">Sair</button><button class="d2-pitch" data-ctl="pdown">▼<small>descer</small></button><button class="d2-brake" data-ctl="brake">− potência</button><button class="d2-gas" data-ctl="gas">+ potência</button></div></div>
  </div>`;
  const stage = el.querySelector('#d2'); const cv = stage.querySelector('.d2-cv'); const ctx = cv.getContext('2d', { alpha: false });
  const touch = matchMedia('(pointer: coarse)').matches || innerWidth < 900;
  stage.classList.toggle('touch', touch);
  const $ = (s) => stage.querySelector(s);
  let alive = true; let raf = 0;

  // ---------------- carregamento
  let assets; let state;
  try { [assets, state] = await Promise.all([loadAssets(), api.get('/mundo/cidade2d')]); } catch (err) { $('#d2Load').innerHTML = `<b>Não foi possível abrir o mapa</b><small>${esc(err.message)}</small>`; return; }
  if (!alive) return;
  await new Promise((r) => setTimeout(r, 0));
  let reforma = state.reforma || null;
  const city = generateCity(undefined, { reforma });
  const world = buildGraph(city.R);
  const syncWorld = () => Object.assign(world, { mask: city.mask, heights: city.heights, cs: CS, mw: city.mw, ox: city.ox, oy: city.oy, bounds: city.bounds, pois: city.pois, regions: city.regions, radars: city.R.radars });
  syncWorld();
  const R = createRenderer(city, assets, { mobile: touch });
  $('#d2Load').remove();
  const IMG = assets.img;
  const meta = (k) => assets.meta[k] || [40, 70];

  // ---------------- entidades
  const T = createTraffic(world, { count: touch ? 30 : 50 });
  const realPeople = state.people.slice(0, touch ? 30 : 46).map((p) => ({ ...p, real: true }));
  const filler = Array.from({ length: touch ? 30 : 64 }, (_, i) => ({ id: `pass${i}`, name: 'Passante', job: i % 9 === 0 ? 'obra' : '' }));
  const P = createPeds(world, [...realPeople, ...filler], assets.roles);
  const sampleColor = (key) => { const im = IMG[key]; if (!im) return '#888'; const c = document.createElement('canvas'); c.width = c.height = 1; const x = c.getContext('2d'); x.drawImage(im, im.width * 0.3, im.height * 0.55, im.width * 0.4, im.height * 0.15, 0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; return `rgb(${d[0]},${d[1]},${d[2]})`; };
  const now0 = Date.now();
  const own = []; // carros e aviões do jogador
  let si = 0; let pi = 0;
  for (const c of state.cars) {
    if (c.repairUntil && new Date(c.repairUntil).getTime() > now0) continue;
    if (c.type === 'aeronave') {
      const sp = c.parked || city.planeSpots[1 + (pi++ % (city.planeSpots.length - 1))];
      const p = createPlane({ ...c, own: true, sprite: c.sprite, L: c.key.includes('jato') ? 52 : 42, W: c.key.includes('jato') ? 46 : 54 }, sp.x ?? sp[0], sp.y ?? sp[1], sp.a ?? sp[2]);
      p.id = c.id; p.health = c.health ?? 100; own.push(p); continue;
    }
    const sp = c.parked ? [c.parked.x, c.parked.y, c.parked.a] : city.spots[(si++ * 3) % city.spots.length];
    own.push({ own: true, kind: 'carro', id: c.id, key: c.key, name: c.name, sprite: c.sprite || 'branco', speed: c.speed || 1, x: sp[0], y: sp[1], a: sp[2], v: 0, steer: 0, gear: 'D', L: lengthOf(c.key === 'car-van-bege' || c.key === 'car-sorvete' ? 'van' : 'carro'), W: 12, health: c.health ?? 100, door: 0, color: sampleColor(`cars/${c.sprite || 'branco'}`) });
  }
  // avião-escola da escola de voo (sempre disponível para treinar)
  const school = createPlane({ name: 'Avião-escola Paulistinha', sprite: 'mono-amarelo', school: true, L: 42, W: 54, air: { thrust: 44, vmax: 220, vstall: 92, turn: 1 } }, ...city.planeSpots[0]);
  school.id = 'escola'; school.health = 100; own.push(school);
  const cars = () => own.filter((o) => o.kind === 'carro');
  const startCar = cars().find((c) => c.id === state.main) || cars()[0];
  const me = { x: 0, y: 0, a: 0, v: 0, mode: 'foot', car: null, plane: null, moving: false, anim: null, spr: `npc/civil${[...String(store.user?.name || 'eu')].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 0) % 24}` };
  [me.x, me.y] = (startCar && nearestWalk(world, startCar.x, startCar.y + 18, 60)) || nearestWalk(world, 1728 - 40, 1504 + 40, 80) || [1690, 1544];
  const cam = createCamera(world); cam.z = touch ? 2.6 : 2.4; cam.x = cam.tx = me.x; cam.y = cam.ty = me.y;
  const particles = [];
  const notify = (t, m, k = 'info') => toast(t, m, k);
  const report = (body) => api.post('/mundo/cidade2d/ocorrencia', { ...body, regiao: regionAt(me.car || me.plane || me) }).catch(() => {});
  const INC = createIncidents({ world, T, P, pois: city.pois, notify, report });

  // ---------------- entrada
  const input = createInput(stage, { onEnter: () => act(), onZoom: (f, sx, sy) => { cam.userZ = performance.now() + 6000; cam.zoomAt(f, sx, sy); }, onPan: (dx, dy) => cam.pan(dx, dy), onTap: (sx, sy) => (ED?.on ? ED.tap(sx, sy) : tap(sx, sy)), onHover: (sx, sy) => ED?.on && ED.hover(sx, sy), paint: { active: () => ED?.paints(), at: (sx, sy) => ED.paintAt(sx, sy), end: () => ED.paintEnd() } });
  input.touchUI = touch;
  stage.querySelectorAll('[data-z]').forEach((b) => { b.onclick = () => { const z = b.dataset.z; if (z === 'me') { cam.follow = true; return; } if (z === 'rot') { rotate(); return; } if (z === 'edit') { if (ED.on) ED.close(); else ED.open(reforma); return; } cam.zoomAt(z === 'in' ? 1.3 : 1 / 1.3, cam.vw / 2, cam.vh / 2); }; });
  // modo Reforma: refaz a cidade com a reforma (geração + edições) e descarta só os blocos afetados
  function rebuildCity(rf, rect, full) {
    const t0 = performance.now();
    Object.assign(city, generateCity(undefined, { reforma: rf })); syncWorld();
    R.reset({ rect, coast: full }); perf.rebuild = Math.round(performance.now() - t0);
  }
  const ED = createEditor({ stage, cam, city, world, assets, api, toast, rebuild: rebuildCity, onExit: (rf) => { reforma = { ...(reforma || {}), ...rf }; cam.follow = true; } });
  $('#d2GearB').addEventListener('pointerup', () => { if (me.mode !== 'car') return; const c = me.car; c.gear = c.gear === 'D' ? 'N' : c.gear === 'N' ? 'R' : 'D'; });

  const regionAt = (p) => { const r = city.regions.find((g) => p.x >= g.rect[0] && p.x < g.rect[2] && p.y >= g.rect[1] && p.y < g.rect[3]); if (r) return r.name; let best = null; let bd = Infinity; for (const g of city.regions) { const dx = Math.max(g.rect[0] - p.x, 0, p.x - g.rect[2]); const dy = Math.max(g.rect[1] - p.y, 0, p.y - g.rect[3]); const d = dx + dy; if (d < bd) { bd = d; best = g; } } return best?.name || 'Nexus City'; };
  const nearest = (list, p, maxD) => list.map((o) => [o, Math.hypot(o.x - p.x, o.y - p.y)]).filter(([, d]) => d <= maxD).sort((a, b) => a[1] - b[1])[0];
  // porta do motorista: lado esquerdo, um pouco à frente do meio (coordenadas locais: x para a frente)
  const doorPoint = (c, out = 9) => { const ca = Math.cos(c.a); const sa = Math.sin(c.a); const lx = c.L * 0.08; const ly = -(c.W / 2 + out); return [c.x + lx * ca - ly * sa, c.y + lx * sa + ly * ca]; };

  // entrar/sair (E ou botão): carro com porta animada, avião no pátio
  function act() {
    if (me.anim) return;
    if (me.mode === 'car') {
      const c = me.car;
      if (Math.abs(c.v) > 4) { toast('Pare o carro primeiro', 'Freie até parar para poder sair.', 'info'); return; }
      const spot = nearestWalk(world, ...doorPoint(c), 40, canFoot);
      if (!spot) { toast('Sem espaço para abrir a porta', 'Encoste num lugar livre.', 'info'); return; }
      me.anim = { kind: 'exit', t: 0, car: c, spot };
      return;
    }
    if (me.mode === 'plane') {
      const p = me.plane;
      if (!p.ground || p.v > 6) { toast('Pouse e pare primeiro', 'Só dá para sair da aeronave parada no chão.', 'info'); return; }
      const spot = nearestWalk(world, p.x, p.y + 40, 60, canFoot);
      me.mode = 'foot'; me.plane = null; [me.x, me.y] = spot || [p.x, p.y + 40]; savePark(p); cam.tz = null;
      return;
    }
    const n = nearest(own.filter((o) => !o.crashed), me, 46);
    if (!n) {
      const c = nearest(cars(), me, 99999);
      toast(c ? `Seu ${c[0].name} está longe` : 'Sem veículo por perto', c ? 'Siga o marcador verde no mapa e no minimapa.' : 'Compre um carro na Concessionária ou use o avião-escola no Aeroporto.', 'info');
      return;
    }
    const o = n[0];
    if (o.kind === 'aviao') { if (n[1] > 46) return; me.mode = 'plane'; me.plane = o; cam.follow = true; toast(o.school ? 'Avião-escola' : o.name, touch ? 'Use "+ potência", acelere na pista e toque em ▲ para decolar.' : 'W aumenta a potência; na pista, segure Espaço para decolar.', 'info'); return; }
    if ((o.health ?? 100) <= 0) { toast(`${o.name} está inutilizado`, 'Chame o reboque para levar à oficina.', 'warning'); return; }
    if (n[1] > 34) return;
    me.anim = { kind: 'enter', t: 0, car: o, from: [me.x, me.y] };
  }
  function stepAnim(dt) {
    const a = me.anim; if (!a) return; a.t += dt; const c = a.car;
    if (a.kind === 'enter') {
      if (a.t < 0.25) c.door = a.t / 0.25;
      else if (a.t < 0.5) { const k = (a.t - 0.25) / 0.25; const [dx, dy] = doorPoint(c, 3); me.x = a.from[0] + (dx - a.from[0]) * k; me.y = a.from[1] + (dy - a.from[1]) * k; c.door = 1; }
      else if (a.t < 0.8) { me.mode = 'car'; me.car = c; c.door = 1 - (a.t - 0.5) / 0.3; c.gear = 'D'; c.towAt = null; cam.follow = true; }
      else { c.door = 0; me.anim = null; }
    } else {
      if (a.t < 0.25) c.door = a.t / 0.25;
      else if (a.t < 0.5) { if (me.mode === 'car') { me.mode = 'foot'; me.car = null; c.v = 0; } const k = (a.t - 0.25) / 0.25; const [dx, dy] = doorPoint(c, 3); me.x = dx + (a.spot[0] - dx) * k; me.y = dy + (a.spot[1] - dy) * k; c.door = 1; }
      else if (a.t < 0.8) c.door = 1 - (a.t - 0.5) / 0.3;
      else { c.door = 0; me.anim = null; savePark(c); checkParking(c); }
    }
  }
  function tap(sx, sy) {
    const [wx, wy] = cam.toWorld(sx, sy);
    const o = own.find((c) => Math.hypot(c.x - wx, c.y - wy) < 18);
    if (o) { if (me.mode === 'foot' && Math.hypot(o.x - me.x, o.y - me.y) <= 46) act(); else toast(o.name, me.mode === 'foot' ? 'Ande até ele e toque em Entrar.' : 'Seu veículo.', 'info'); return; }
    const ped = P.peds.find((p) => p.real && Math.hypot(p.x - wx, p.y - wy + 6) < 9);
    if (ped) { personCard(ped.id); return; }
    const poi = city.pois.find((p) => Math.abs(p.at[0] - wx) < 60 / cam.z * 1.6 && Math.abs(p.at[1] - wy) < 14 / cam.z * 1.6);
    if (poi) location.hash = poi.route;
  }

  // ---------------- garagem: estacionar, danos e reboque
  const savePark = (c) => { if (c.id && c.id !== 'escola') api.post('/mundo/cidade2d/estacionar', { itemId: c.id, x: c.x, y: c.y, a: c.a }).catch(() => {}); };
  let dmgTimer = null;
  const saveDamage = (c) => { if (!c.id || c.id === 'escola') return; clearTimeout(dmgTimer); dmgTimer = setTimeout(() => api.post('/mundo/cidade2d/dano', { itemId: c.id, health: c.health }).catch(() => {}), 800); };
  async function callTow(c) {
    try {
      if (c.id !== 'escola') await api.post('/mundo/cidade2d/dano', { itemId: c.id, health: c.health });
      if (c.id === 'escola') { await fine('acidente-aereo'); Object.assign(c, createPlane({ name: c.name, sprite: c.sprite, school: true, L: 42, W: 54, air: c.air }, ...city.planeSpots[0])); c.id = 'escola'; c.health = 100; toast('Avião-escola recolhido', 'A escola de voo cobrou o conserto (Banco → Pendências).', 'warning'); return; }
      const r = await api.post('/mundo/cidade2d/reboque', { itemId: c.id });
      const i = own.indexOf(c); if (i >= 0) own.splice(i, 1);
      if (me.car === c) { me.mode = 'foot'; me.car = null; }
      toast(`${c.name} ${c.kind === 'aviao' ? 'resgatado' : 'rebocado'}`, `${r.total.toLocaleString('pt-BR')} NXC (${r.paid === 'conta' ? 'debitado' : 'em Pendências'}). Pronto às ${new Date(r.until).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`, 'info');
      refreshStatus(true);
    } catch (err) { toast('Reboque não realizado', err.message, 'error'); }
  }
  function checkParking(c) {
    if (laneDist(world, c.x, c.y) > 7) return;
    c.towAt = performance.now() + 25000; c.towPos = [c.x, c.y];
    toast('Estacionado no meio da via', 'Tire o carro em 25 s ou ele será guinchado e você leva multa.', 'warning');
  }
  function towIllegal(now) {
    for (const c of cars()) {
      if (!c.towAt || c === me.car) continue;
      if (Math.hypot(c.x - c.towPos[0], c.y - c.towPos[1]) > 4) { c.towAt = null; continue; }
      if (now < c.towAt) continue;
      c.towAt = null; const sp = city.spots.find((s) => !cars().some((o) => o !== c && Math.hypot(o.x - s[0], o.y - s[1]) < 14)) || city.spots[0];
      [c.x, c.y, c.a] = sp; savePark(c); fine('estacionamento'); toast(`${c.name} guinchado`, 'Levado ao Estacionamento Central.', 'info');
    }
  }

  // ---------------- fiscalização e polícia
  const fineQ = new Map(); let flash = 0;
  async function fine(tipo, extra = {}) {
    const k = tipo.replace(/-.*/, ''); if ((fineQ.get(k) || 0) > performance.now()) return; fineQ.set(k, performance.now() + 15000);
    try { const r = await api.post('/mundo/cidade2d/infracao', { tipo, veiculo: (me.car || me.plane)?.name, ...extra }); if (r.ok) { toast('🚨 Multa', `${r.fine.label}: ${r.fine.amount} NXC (Banco → Pendências)`, 'error'); flash = 1; refreshStatus(true); } } catch { /* offline */ }
  }
  const policeNear = (p, r) => T.cars.some((c) => c.kind === 'policia' && !c.job && Math.hypot(c.x - p.x, c.y - p.y) < r);
  const lightIn = new Map(); const radarHit = new Map();
  function enforce(t) {
    const c = me.car; if (!c) return; const kmh = toKmh(c.v);
    for (const n of Object.values(world.nodes)) {
      if (!n.light || Math.abs(n.x - c.x) > 80 || Math.abs(n.y - c.y) > 80) { lightIn.delete(n.id); continue; }
      const inside = Math.hypot(c.x - n.x, c.y - n.y) < n.clear - 6; const was = lightIn.get(n.id) || false;
      if (inside && !was && kmh > 8 && c.v > 0) {
        const axis = Math.abs(Math.cos(c.a)) >= Math.abs(Math.sin(c.a)) ? 'H' : 'V';
        if (lightState(n, axis, t) === 'red') { fine('sinal'); if (policeNear(c, 320)) INC.startChase(1, 'Avanço de sinal vermelho na frente da polícia', c); }
      }
      lightIn.set(n.id, inside);
    }
    for (const [i, r] of world.radars.entries()) {
      if (Math.hypot(c.x - r.at[0], c.y - r.at[1]) > 26 || (radarHit.get(i) || 0) > performance.now()) continue;
      if (kmh > r.limit * 1.07 + 2) { radarHit.set(i, performance.now() + 8000); const ex = kmh / r.limit - 1; fine(ex <= 0.2 ? 'velocidade' : ex <= 0.5 ? 'velocidade-grave' : 'velocidade-gravissima', { kmh: Math.round(kmh), limite: r.limit }); if (ex > 0.5 && policeNear(c, 400)) INC.startChase(1, 'Excesso de velocidade', c); }
    }
  }

  // ---------------- colisões com consequências
  function afterCrash(c, wasV) {
    if (!c.hit || !c.impact) return;
    const dmg = crashDamage(c.impact);
    const other = c.hitWith;
    if (other && !other.own && other.kind !== undefined) { other.wrecked = Math.max(other.wrecked || 0, dmg > 15 ? 25 : 4); other.v = 0; if (dmg > 15) other.smoke = 1; }
    if (dmg <= 0) return;
    c.health = Math.max(0, (c.health ?? 100) - dmg); saveDamage(c);
    if (navigator.vibrate) try { navigator.vibrate(dmg > 30 ? [40, 30, 60] : 25); } catch { /* ok */ }
    toast(c.health <= 0 ? '💥 Veículo inutilizado' : 'Batida!', c.health <= 0 ? 'Saia e chame o reboque (oficina cobra o reparo).' : `Lataria: ${Math.round(c.health)}%`, c.health <= 0 ? 'error' : 'warning');
    if (dmg > 25 || other) {
      const inc = INC.create('acidente', c.x, c.y, { culprit: true, injured: [] });
      report({ tipo: 'acidente', culpa: true, veiculo: c.name });
      if (other) fine('colisao');
      void inc; void wasV;
    }
  }
  function hitPeds(c) {
    if (Math.abs(c.v) < 3) return;
    const ca = Math.cos(c.a); const sa = Math.sin(c.a);
    for (const p of P.peds) {
      if (p.state === 'ferido' || p.state === 'levado' || Math.abs(p.x - c.x) > 20 || Math.abs(p.y - c.y) > 20) continue;
      const dx = p.x - c.x; const dy = p.y - c.y; const lx = dx * ca + dy * sa; const ly = -dx * sa + dy * ca;
      if (Math.abs(lx) > c.L / 2 + 2 || Math.abs(ly) > c.W / 2 + 2) continue;
      if (toKmh(c.v) < 9) { p.s += p.dir * 8; continue; }
      p.state = 'ferido'; c.v *= 0.6;
      const inc = INC.create('atropelamento', p.x, p.y, { culprit: true, injured: [p] });
      toast('Atropelamento!', `${p.real ? p.name : 'Um pedestre'} ficou ferido(a). A ambulância e a polícia estão a caminho.`, 'error');
      report({ tipo: 'atropelamento', personaId: p.real ? p.id : null, nome: p.real ? p.name : 'Pedestre', culpa: true, veiculo: c.name });
      fine('atropelamento'); void inc;
    }
  }
  function planeCrash(p, why) {
    p.crashed = true; p.v = 0; p.health = 0;
    INC.addFx('explosao', p.x, p.y, 1.4, 1.6); INC.addFx('fogo', p.x, p.y, 30, 1.2);
    const spot = nearestWalk(world, p.x + 30, p.y + 30, 90, canFoot); me.mode = 'foot'; me.plane = null; if (spot) [me.x, me.y] = spot; cam.tz = null;
    INC.create('queda-aviao', p.x, p.y, { culprit: true, fire: 1 });
    report({ tipo: 'queda-aviao', culpa: true, veiculo: p.name });
    toast('💥 Queda de aeronave', why === 'predio' ? 'Você bateu num prédio. Bombeiros, ambulância e polícia a caminho.' : 'Pouso forçado fora da pista. Equipes de emergência a caminho.', 'error');
    if (!p.school) saveDamage(p);
  }

  // ---------------- tela, tela cheia e tela girada
  let dpr = 1; const qa = { n: 0, t: 0, level: 0, dpr: null };
  function resize() {
    const w = stage.clientWidth; const h = stage.clientHeight; dpr = Math.min(window.devicePixelRatio || 1, touch ? 1.5 : 2, qa.dpr ?? 9);
    cv.width = Math.max(1, Math.round(w * dpr)); cv.height = Math.max(1, Math.round(h * dpr)); cam.resize(w, h);
  }
  const ro = new ResizeObserver(resize); ro.observe(stage); resize();
  async function rotate() {
    if (stage.classList.contains('fs')) { stage.classList.remove('fs'); stage.dataset.rot = '0'; try { screen.orientation?.unlock?.(); } catch { /* ok */ } if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); setTimeout(resize, 60); return; }
    stage.classList.add('fs');
    try { await stage.requestFullscreen?.({ navigationUI: 'hide' }); await screen.orientation.lock('landscape'); stage.dataset.rot = '0'; } catch { /* aparelho não deixa travar a orientação */ }
    // se o aparelho continua em pé, gira o mapa por CSS (paisagem forçada)
    // (o modo tela cheia do navegador anula rotação por CSS, então sai dele e ocupa a tela com o mapa girado)
    setTimeout(async () => { if (innerHeight > innerWidth) { stage.dataset.rot = '1'; if (document.fullscreenElement) await document.exitFullscreen?.().catch(() => {}); } resize(); }, 350);
  }
  const fsOff = () => { if (!document.fullscreenElement && stage.dataset.rot !== '1') { stage.classList.remove('fs'); setTimeout(resize, 60); } };
  document.addEventListener('fullscreenchange', fsOff);
  const mini = $('#d2Mini'); const mctx = mini.getContext('2d');

  // ---------------- desenho
  const drawVeh = (o, key, L = o.L, alpha = 1) => {
    const im = IMG[key]; if (!im) return; const [w, h] = meta(key); const W = (L * w) / h;
    ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.a + Math.PI / 2); ctx.globalAlpha = alpha; ctx.drawImage(im, -W / 2, -L / 2, W, L); ctx.restore();
  };
  const driverHead = (o) => { const ca = Math.cos(o.a); const sa = Math.sin(o.a); const lx = o.L * 0.02; const ly = -o.W * 0.2; const x = o.x + lx * ca - ly * sa; const y = o.y + lx * sa + ly * ca; ctx.fillStyle = '#3a2418'; ctx.beginPath(); ctx.arc(x, y, 2.1, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#f0c8a0'; ctx.beginPath(); ctx.arc(x + ca * 0.6, y + sa * 0.6, 1.5, 0, Math.PI * 2); ctx.fill(); };
  const drawDoor = (c) => {
    if (!c.door) return; const ca = Math.cos(c.a); const sa = Math.sin(c.a);
    const hx = c.L * 0.2; const hy = -c.W / 2; const x = c.x + hx * ca - hy * sa; const y = c.y + hx * sa + hy * ca;
    ctx.save(); ctx.translate(x, y); ctx.rotate(c.a + Math.PI - c.door * 1.05); ctx.fillStyle = c.color || '#999'; ctx.strokeStyle = '#1a1d26'; ctx.lineWidth = 0.6; ctx.fillRect(0, -1, c.L * 0.3, 2); ctx.strokeRect(0, -1, c.L * 0.3, 2); ctx.restore();
  };
  const fxFrame = (kind, t, secs) => {
    if (kind === 'explosao') { const n = Math.min(9, Math.floor((t / secs) * 10)); return IMG[n < 5 ? `fx/exp${n}` : `fx/expf${n - 5}`]; }
    if (kind === 'fogo') return IMG[`fx/fogo${Math.floor(t * 10) % 7}`];
    return IMG[`fx/fumaca${Math.floor(t * 4) % 6}`];
  };
  const puff = (x, y, k = 1) => { if (particles.length < 120) particles.push({ x, y, t: 0, life: 1.6 + Math.random(), vx: (Math.random() - 0.5) * 4, vy: -6 - Math.random() * 4, s: (6 + Math.random() * 4) * k }); };
  // animação de passo: a partir de cada sprite, dois quadros com uma perna à frente (a de cá sobe, a de lá desce)
  // e o tronco levemente inclinado; ciclo: passo A → parado → passo B → parado
  const walkCache = new Map();
  function walkFrames(key) {
    let f = walkCache.get(key); if (f) return f;
    const im = IMG[key]; if (!im) return null;
    const w = im.width; const h = im.height; const leg = Math.round(h * 0.3); const top = h - leg; const k = Math.max(1, Math.round(h * 0.045)); const half = Math.floor(w / 2);
    const make = (left) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
      x.drawImage(im, 0, 0, w, top, 0, left ? -1 : 0, w, top); // tronco balança 1 px
      // perna da frente levanta (encurta), perna de trás estica para baixo
      const [fx, bx] = left ? [0, half] : [half, 0];
      x.drawImage(im, fx, top, half, leg, fx, top - k, half, leg);
      x.drawImage(im, bx, top, w - half, leg - k, bx, top + k * 0.5, w - half, leg - k);
      return c;
    };
    f = [make(true), im, make(false), im]; walkCache.set(key, f); return f;
  }
  const frameOf = (key, t, phase, speed = 1) => { const fr = walkFrames(key); return fr ? fr[Math.floor(t * 7 * speed + phase) % 4] : IMG[key]; };
  function drawPed(p, t) {
    if (p.state === 'levado') return;
    if (p.state === 'ferido') { const im = IMG['npc/caido']; if (im) ctx.drawImage(im, p.x - 9, p.y - 4, 18, 7); ctx.fillStyle = 'rgba(200,0,0,.5)'; ctx.beginPath(); ctx.ellipse(p.x + 3, p.y + 2, 4, 1.6, 0, 0, Math.PI * 2); ctx.fill(); return; }
    const im = IMG[p.spr]; if (!im) return;
    const [w, h] = meta(p.spr); const H = 13; const W = (H * w) / h;
    const moving = p.state === 'walk' || p.state === 'cross';
    const bob = moving && !p.pause ? Math.abs(Math.sin(t * 9 + p.phase)) * 0.9 : 0;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 3.4, 1.4, 0, 0, Math.PI * 2); ctx.fill();
    const fimg = moving && !p.pause ? frameOf(p.spr, t, p.phase * 3, p.v / 9) : im;
    ctx.save(); ctx.translate(p.x, p.y - bob * 0.4); if (p.face < 0) ctx.scale(-1, 1); ctx.drawImage(fimg, -W / 2, -H, W, H); ctx.restore();
    if (p.state === 'olhando') { ctx.fillStyle = '#fff'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(Math.sin(t * 6 + p.phase) > 0 ? '!' : '?', p.x, p.y - H - 1); }
  }
  function drawMe(t) {
    if (me.mode !== 'foot' && !(me.anim && me.anim.kind === 'enter' && me.anim.t < 0.5) && !(me.anim && me.anim.kind === 'exit' && me.anim.t >= 0.25)) return;
    const im = IMG[me.spr]; const [w, h] = meta(me.spr); const H = 14; const W = (H * w) / h;
    ctx.fillStyle = 'rgba(56,214,245,.35)'; ctx.beginPath(); ctx.ellipse(me.x, me.y, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
    if (me.swim) { ctx.save(); ctx.beginPath(); ctx.rect(me.x - 10, me.y - H, 20, H * 0.55); ctx.clip(); }
    const bob = me.moving ? Math.abs(Math.sin(t * 10)) * 1 : 0;
    if (im) { const fimg = me.moving && !me.swim ? frameOf(me.spr, t, 0, 1.3) : im; ctx.save(); ctx.translate(me.x, me.y - bob * 0.4 - (me.swim ? -3 : 0)); if (Math.cos(me.a) < -0.2) ctx.scale(-1, 1); ctx.drawImage(fimg, -W / 2, -H, W, H); ctx.restore(); }
    if (me.swim) { ctx.restore(); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.ellipse(me.x, me.y - 5, 6 + Math.sin(t * 5) * 1.5, 2, 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = '#38d6f5'; ctx.beginPath(); ctx.moveTo(me.x, me.y - H - 6); ctx.lineTo(me.x - 3, me.y - H - 10); ctx.lineTo(me.x + 3, me.y - H - 10); ctx.fill();
  }
  // silhueta (sombra) e versão queimada de cada aeronave, prontas uma vez (filtros por quadro são caros no celular)
  const planeCache = new Map();
  const planeVariant = (key, kind) => {
    const k = `${key}|${kind}`; let c = planeCache.get(k); if (c) return c;
    const im = IMG[key]; c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d');
    x.drawImage(im, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = kind === 'shadow' ? '#000' : 'rgba(20,10,5,.55)'; x.fillRect(0, 0, c.width, c.height);
    planeCache.set(k, c); return c;
  };
  function drawPlane(p) {
    const key = `air/${p.sprite}`; const im = IMG[key]; if (!im) return;
    const [w, h] = meta(key); const sc = 1 + Math.min(1.2, p.h / 260); const L = p.L * sc; const W = (L * w) / h;
    if (p.h > 0.5 || !p.ground) {
      const off = p.h * 0.45; ctx.save(); ctx.translate(p.x + off, p.y + off * 0.7); ctx.rotate(p.a + Math.PI / 2); ctx.globalAlpha = 0.28; ctx.drawImage(planeVariant(key, 'shadow'), -(p.L * w) / h / 2, -p.L / 2, (p.L * w) / h, p.L); ctx.restore();
    }
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a + Math.PI / 2); ctx.drawImage(p.crashed ? planeVariant(key, 'burnt') : im, -W / 2, -L / 2, W, L); ctx.restore();
  }
  function draw(t, night) {
    const z = cam.z; const vw = cam.vw; const vh = cam.vh;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#2f6fd0'; ctx.fillRect(0, 0, cv.width, cv.height);
    const k = z * dpr; ctx.setTransform(k, 0, 0, k, dpr * (vw / 2 - cam.x * z), dpr * (vh / 2 - cam.y * z));
    const view = [cam.x - vw / 2 / z, cam.y - vh / 2 / z, cam.x + vw / 2 / z, cam.y + vh / 2 / z];
    R.beginFrame();
    const lit = R.drawWorld(ctx, view, z);
    const inV = (o, pad = 40) => o.x > view[0] - pad && o.x < view[2] + pad && o.y > view[1] - pad && o.y < view[3] + pad;
    ctx.imageSmoothingEnabled = true;
    const lights = [];
    // semáforos e radares
    if (z >= 0.9) {
      for (const n of Object.values(world.nodes)) {
        if (!n.light || !inV(n, 60)) continue; const hw = n.maxW / 2 + 6; const col = (s) => (s === 'green' ? '#2fd27a' : s === 'yellow' ? '#f7c948' : '#ff4d5e');
        const Hs = lightState(n, 'H', t); const Vs = lightState(n, 'V', t);
        for (const [dx, dy, s] of [[hw, -hw, Hs], [-hw, hw, Hs], [-hw, -hw, Vs], [hw, hw, Vs]]) {
          const sm = IMG['deco/semaforo'];
          if (sm) { const h = 16; const w = (h * sm.width) / sm.height; ctx.drawImage(sm, n.x + dx - w / 2, n.y + dy - h + 6, w, h); ctx.fillStyle = 'rgba(10,10,10,.75)'; for (const yy of [-8.8, -5.9, -3]) ctx.fillRect(n.x + dx - 1.5, n.y + dy + yy, 3, 2.4); ctx.fillStyle = col(s); ctx.fillRect(n.x + dx - 1.4, n.y + dy + (s === 'red' ? -8.7 : s === 'yellow' ? -5.8 : -2.9), 2.8, 2.2); }
          else { ctx.fillStyle = '#20232c'; ctx.fillRect(n.x + dx - 1.6, n.y + dy - 5, 3.2, 7); ctx.fillStyle = col(s); ctx.fillRect(n.x + dx - 1, n.y + dy + (s === 'red' ? -4 : s === 'yellow' ? -2 : 0), 2, 2); }
          lights.push({ x: n.x + dx, y: n.y + dy - 2, r: 7, color: col(s), ka: 0.6, halo: 0.8 });
        }
      }
      for (const r of world.radars) { if (!inV({ x: r.at[0], y: r.at[1] })) continue; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#e11d48'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(r.at[0] + 18, r.at[1] - 18, 4.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#111'; ctx.font = 'bold 4.6px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(r.limit), r.at[0] + 18, r.at[1] - 17.7); ctx.fillStyle = '#334155'; ctx.fillRect(r.at[0] + 23, r.at[1] - 20, 4, 3); }
    }
    // objetos com profundidade (ordenados por y): pedestres, carros, aviões no chão, jogador
    const items = [];
    for (const p of P.peds) if (inV(p, 20)) items.push([p.y, 0, p]);
    for (const c of T.cars) if (inV(c)) items.push([c.y, 1, c]);
    for (const o of own) if (inV(o, 70) && !(o.kind === 'aviao' && !o.ground)) items.push([o.y, o.kind === 'aviao' ? 3 : 2, o]);
    items.push([me.y, 4, me]);
    items.sort((a, b) => a[0] - b[0]);
    for (const [, kind, o] of items) {
      if (kind === 0) drawPed(o, t);
      else if (kind === 1) {
        const dmg = (o.wrecked > 4 || o.smoke) && IMG[`cars/${o.sprite}-dmg`] ? `cars/${o.sprite}-dmg` : `cars/${o.sprite}`;
        drawVeh(o, dmg); if (o.driver && z >= 1.6) driverHead(o);
        if (o.siren) { const on = Math.floor(t * 6) % 2; const c1 = on ? '#ff3a3a' : '#3a7aff'; ctx.fillStyle = c1; ctx.beginPath(); ctx.arc(o.x, o.y, 2.4, 0, Math.PI * 2); ctx.fill(); lights.push({ x: o.x, y: o.y, r: 26, color: c1, ka: 0.7, halo: 0.7 }); }
        if (o.smoke && Math.random() < 0.08) puff(o.x, o.y - 4);
        if (night > 0.05 && !o.wrecked) addCarLights(lights, o);
      } else if (kind === 2) {
        const hp = o.health ?? 100;
        const key = hp < 35 && IMG[`cars/${o.sprite}-dmg`] ? `cars/${o.sprite}-dmg` : `cars/${o.sprite}`;
        if (o !== me.car) { ctx.strokeStyle = hp <= 0 ? '#ff4d5e' : '#2fd27a'; ctx.lineWidth = 1.1; ctx.setLineDash([2, 1.6]); ctx.beginPath(); ctx.arc(o.x, o.y, 15, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
        drawVeh(o, key); drawDoor(o); if (o === me.car && z >= 1.6) driverHead(o);
        if (hp < 45 && Math.random() < (hp <= 0 ? 0.25 : 0.06)) puff(o.x + Math.cos(o.a) * o.L * 0.35, o.y + Math.sin(o.a) * o.L * 0.35 - 3, hp <= 0 ? 1.4 : 1);
        if (hp <= 0) { const f = fxFrame('fogo', t + o.L, 1); if (f) ctx.drawImage(f, o.x - 6 + Math.cos(o.a) * o.L * 0.3, o.y - 14 + Math.sin(o.a) * o.L * 0.3, 12, 14); }
        if (night > 0.05 && o === me.car) addCarLights(lights, o);
      } else if (kind === 3) drawPlane(o);
      else drawMe(t);
    }
    // aviões em voo por cima de tudo (com sombra no chão)
    for (const o of own) if (o.kind === 'aviao' && !o.ground && inV(o, 200)) { drawPlane(o); if (night > 0.05) addPlaneLights(lights, o, t); }
    if (me.plane && me.plane.ground && night > 0.05) addPlaneLights(lights, me.plane, t);
    // efeitos: explosões, fogo, fumaça
    for (const f of INC.fx) { const im = fxFrame(f.kind, f.t, f.secs); if (!im) continue; const s = (f.kind === 'explosao' ? 46 : 24) * f.scale; ctx.drawImage(im, f.x - s / 2, f.y - s * (f.kind === 'fogo' ? 1 : 0.6), s, s); if (f.kind !== 'fumaca') lights.push({ x: f.x, y: f.y - 8, r: f.kind === 'explosao' ? 120 : 60, color: '#ff8a3a', ka: 0.6, halo: 0.6 }); if (f.kind === 'fogo' && Math.random() < 0.2) puff(f.x, f.y - 16, 1.6); }
    for (const p of particles) { const im = IMG[`fx/fumaca${Math.floor(p.t * 3) % 6}`]; if (!im) continue; ctx.globalAlpha = Math.max(0, 0.6 * (1 - p.t / p.life)); const s = p.s * (1 + p.t); ctx.drawImage(im, p.x - s / 2, p.y - s / 2, s, s); }
    ctx.globalAlpha = 1;
    ED.draw(ctx, z);
    // luzes da cidade à noite
    if (night > 0.03) {
      for (const [lx, ly] of city.lamps) if (lx > view[0] - 40 && lx < view[2] + 40 && ly > view[1] - 40 && ly < view[3] + 40) lights.push({ x: lx, y: ly - 22, r: 32, color: '#ffd27a', ka: 0.32, halo: 0.42, lamp: true });
      for (const [lx, ly, col] of city.runwayLights) if (lx > view[0] - 20 && lx < view[2] + 20 && ly > view[1] - 20 && ly < view[3] + 20) lights.push({ x: lx, y: ly, r: 8, color: col, ka: 0.9, halo: 0.9 });
      R.drawNight(ctx, cam, dpr, night, lights, lit);
    }
    // rótulos nítidos em pixels de tela
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const S = (x, y) => [(x - cam.x) * z + vw / 2, (y - cam.y) * z + vh / 2];
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const pill = (x, y, text, bg, fg = '#fff', fs = 11) => { const im = labelImg(text, bg, fg, fs); ctx.drawImage(im, Math.round(x - im.width / 2 / LDPR), Math.round(y - im.height / 2 / LDPR), im.width / LDPR, im.height / LDPR); };
    for (const p of city.pois) { const [sx, sy] = S(p.at[0], p.at[1]); if (sx < -80 || sy < -20 || sx > vw + 80 || sy > vh + 20) continue; if (z < 0.8 && !['aeroporto', 'hospital', 'policia', 'shopping', 'estadio', 'terminal'].includes(p.id)) continue; pill(sx, sy, `${POI_IC[p.icon] || '•'} ${p.label}`, 'rgba(10,13,43,.84)', '#fff', z < 1.4 ? 10 : 11); }
    if (z >= 2.2) { let n = 0; for (const p of P.peds) { if (!p.real || p.state === 'levado' || !inV(p, 0) || n++ > 26) continue; const [sx, sy] = S(p.x, p.y - 17); pill(sx, sy, p.name.split(' ')[0], p.state === 'ferido' ? 'rgba(160,20,30,.85)' : 'rgba(10,13,43,.7)', '#fff', 9); } }
    for (const o of own) { if (o === me.car || o === me.plane || !inV(o, 0)) continue; const [sx, sy] = S(o.x, o.y - (o.kind === 'aviao' ? 30 : 19)); pill(sx, sy, `${o.school ? 'ESCOLA' : 'SEU'} · ${o.name}${(o.health ?? 100) <= 0 ? ' (inutilizado)' : ''}`, (o.health ?? 100) <= 0 ? '#a3122a' : '#1f9d5a', '#fff', 10); }
    if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash * 0.5})`; ctx.fillRect(0, 0, vw, vh); }
  }
  // rótulos desenhados uma vez e reaproveitados (texto é caro de desenhar a cada quadro)
  const LDPR = 2; const labels = new Map();
  function labelImg(text, bg, fg, fs) {
    const k = `${text}|${bg}|${fs}`; let c = labels.get(k); if (c) return c;
    c = document.createElement('canvas'); const x = c.getContext('2d'); const font = `600 ${fs * LDPR}px Poppins, system-ui, sans-serif`; x.font = font;
    const w = Math.ceil(x.measureText(text).width + 12 * LDPR); const h = Math.ceil(fs * 1.7 * LDPR); c.width = w; c.height = h;
    x.font = font; x.fillStyle = bg; x.beginPath(); x.roundRect(0, 0, w, h, 6 * LDPR); x.fill(); x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2 + LDPR * 0.5);
    if (labels.size > 400) labels.clear(); labels.set(k, c); return c;
  }
  function addCarLights(lights, c) {
    const ca = Math.cos(c.a); const sa = Math.sin(c.a);
    for (const side of [-1, 1]) { const fx = c.x + ca * c.L * 0.5 - sa * side * 3.5; const fy = c.y + sa * c.L * 0.5 + ca * side * 3.5; lights.push({ cone: true, x: fx, y: fy, a: c.a, r: 62, color: '#fff2c8', ka: 0.16, k: 0.75 }); }
    for (const side of [-1, 1]) { const bx = c.x - ca * c.L * 0.5 - sa * side * 4; const by = c.y - sa * c.L * 0.5 + ca * side * 4; lights.push({ x: bx, y: by, r: 6, color: '#ff2a2a', ka: 0.8, halo: 0.9 }); }
  }
  function addPlaneLights(lights, p, t) {
    const ca = Math.cos(p.a); const sa = Math.sin(p.a); const sc = 1 + Math.min(1.2, p.h / 260); const span = p.W * 0.45 * sc;
    lights.push({ x: p.x - sa * -span, y: p.y + ca * -span, r: 9, color: '#ff3a3a', ka: 1, halo: 0.9 }); lights.push({ x: p.x - sa * span, y: p.y + ca * span, r: 9, color: '#2fff7a', ka: 1, halo: 0.9 });
    if (Math.floor(t * 1.5) % 2 === 0) lights.push({ x: p.x, y: p.y, r: 14, color: '#ffffff', ka: 0.9, halo: 0.8 });
    if (p.h < 120) lights.push({ cone: true, x: p.x + ca * p.L * 0.5, y: p.y + sa * p.L * 0.5, a: p.a, r: 110, color: '#fff7dc', ka: 0.15, k: 0.8 });
  }
  function drawMini() {
    mctx.imageSmoothingEnabled = true; mctx.drawImage(R.overview, 0, 0, 192, 132);
    const mb = R.bounds; const kx = 192 / (mb.x1 - mb.x0); const ky = 132 / (mb.y1 - mb.y0); const X = (v) => (v - mb.x0) * kx; const Y = (v) => (v - mb.y0) * ky;
    mctx.strokeStyle = 'rgba(255,255,255,.9)'; mctx.lineWidth = 1; mctx.strokeRect(X(cam.x - cam.vw / 2 / cam.z), Y(cam.y - cam.vh / 2 / cam.z), (cam.vw / cam.z) * kx, (cam.vh / cam.z) * ky);
    for (const o of own) { mctx.fillStyle = (o.health ?? 100) <= 0 ? '#ff4d5e' : o.kind === 'aviao' ? '#f7c948' : '#2fd27a'; mctx.fillRect(X(o.x) - 2, Y(o.y) - 2, 4, 4); }
    for (const inc of INC.list) { mctx.fillStyle = '#ff4d5e'; mctx.beginPath(); mctx.arc(X(inc.x), Y(inc.y), 3, 0, Math.PI * 2); mctx.fill(); }
    if (INC.chase.on && INC.chase.car) { mctx.fillStyle = Math.floor(Date.now() / 250) % 2 ? '#3a7aff' : '#ff3a3a'; mctx.fillRect(X(INC.chase.car.x) - 2, Y(INC.chase.car.y) - 2, 4, 4); }
    const p = me.car || me.plane || me; mctx.fillStyle = '#38d6f5'; mctx.beginPath(); mctx.arc(X(p.x), Y(p.y), 3.2, 0, Math.PI * 2); mctx.fill(); mctx.strokeStyle = '#0a0d2b'; mctx.stroke();
  }
  mini.onclick = (e) => { const r = mini.getBoundingClientRect(); const mb = R.bounds; cam.follow = false; cam.x = cam.tx = mb.x0 + ((e.clientX - r.left) / r.width) * (mb.x1 - mb.x0); cam.y = cam.ty = mb.y0 + ((e.clientY - r.top) / r.height) * (mb.y1 - mb.y0); };

  // ---------------- HUD
  let lastPrompt = ''; let lastDash = '';
  function hud() {
    const k = cityNow(); $('#d2Time').textContent = `${k.text}${k.day ? ` · Dia ${k.day}` : ''}`;
    const p = me.car || me.plane || me; $('#d2Reg').textContent = regionAt(p);
    stage.classList.toggle('driving', me.mode === 'car'); stage.classList.toggle('flying', me.mode === 'plane');
    let dash = '';
    if (me.car) { const c = me.car; const hp = Math.round(c.health ?? 100); dash = `<div class="d2-spd"><b>${Math.round(toKmh(c.v))}</b><small>km/h</small></div><div class="d2-gearv g-${c.gear}">${c.gear}</div><div class="d2-car"><small>Dirigindo</small><b>${esc(c.name)}</b><i class="d2-hp"><i style="width:${hp}%;background:${hp > 60 ? '#2fd27a' : hp > 25 ? '#f7c948' : '#ff4d5e'}"></i></i></div>`; $('#d2GearB span').textContent = c.gear; }
    else if (me.plane) { const pl = me.plane; dash = `<div class="d2-spd"><b>${knots(pl.v)}</b><small>nós</small></div><div class="d2-spd"><b>${feet(pl.h)}</b><small>pés</small></div><div class="d2-car"><small>${pl.ground ? 'No solo' : pl.vz > 3 ? 'Subindo' : pl.vz < -3 ? 'Descendo' : 'Nivelado'} · potência ${Math.round(pl.throttle * 100)}%</small><b>${esc(pl.name)}</b><i class="d2-hp"><i style="width:${Math.round(pl.throttle * 100)}%;background:#38d6f5"></i></i></div>${pl.stall ? '<div class="d2-stall">ESTOL</div>' : ''}`; }
    if (dash !== lastDash) { lastDash = dash; const d = $('#d2Dash'); d.hidden = !dash; d.innerHTML = dash; }
    const ch = INC.chase; const wv = $('#d2Want');
    wv.hidden = !ch.on; if (ch.on) wv.innerHTML = `<b>🚨 PERSEGUIÇÃO</b><span>${'★'.repeat(ch.level)}${'☆'.repeat(Math.max(0, 3 - ch.level))}</span><small>${ch.lost > 0 ? `despistando… ${Math.ceil(10 - ch.lost)} s` : 'a viatura está atrás de você'}</small>`;
    // interações
    let html = '';
    if (me.mode === 'foot' && !me.anim) {
      const n = nearest(own.filter((o) => !o.crashed), me, 46);
      if (n) { const o = n[0]; html = (o.health ?? 100) <= 0 ? `<button data-act="tow">${icon('wrench', 15)} Chamar reboque · ${esc(o.name)}</button>` : `<button data-act="enter">${icon(o.kind === 'aviao' ? 'rocket' : 'car', 15)} <b>E</b> ${o.kind === 'aviao' ? 'Pilotar' : 'Entrar no'} ${esc(o.name)}</button>${(o.health ?? 100) < 100 ? `<button data-act="tow">${icon('wrench', 15)} Reparar (${Math.round(o.health)}%)</button>` : ''}`; }
      const crashed = nearest(own.filter((o) => o.crashed), me, 80); if (crashed) html += `<button data-act="tow">${icon('wrench', 15)} Resgatar ${esc(crashed[0].name)}</button>`;
      $('#d2EnterF').textContent = n && (n[0].health ?? 100) > 0 ? (n[0].kind === 'aviao' ? 'Pilotar' : 'Entrar') : 'Veículo';
    } else if (me.car && Math.abs(me.car.v) < 4) html = `<button data-act="enter">${icon('logout', 15)} <b>E</b> Sair do carro</button>${me.car.health <= 0 ? `<button data-act="tow">${icon('wrench', 15)} Chamar reboque</button>` : ''}`;
    else if (me.plane && me.plane.ground && me.plane.v < 6) html = `<button data-act="enter">${icon('logout', 15)} <b>E</b> Sair da aeronave</button>`;
    const poi = city.pois.map((q) => [q, Math.hypot(q.at[0] - p.x, q.at[1] - p.y)]).sort((a, b) => a[1] - b[1])[0];
    if (poi && poi[1] < 70 && me.mode !== 'plane') html += `<a href="${esc(poi[0].route)}">${icon('pin', 15)} Entrar: <b>${esc(poi[0].label)}</b></a>`;
    if (html !== lastPrompt) {
      lastPrompt = html; const pr = $('#d2Prompt'); pr.hidden = !html; pr.innerHTML = html;
      pr.querySelector('[data-act="enter"]')?.addEventListener('click', act);
      pr.querySelector('[data-act="tow"]')?.addEventListener('click', () => { const t = me.car || nearest(own.filter((o) => (o.health ?? 100) < 100 || o.crashed), me, 80)?.[0]; if (t) callTow(t); });
    }
  }

  // ---------------- laço principal (delta time; pausa em segundo plano)
  let last = performance.now(); let hudT = 0; let miniT = 0; let saveT = 0; const perf = { frames: 0, work: 0 };
  function frame(nowMs) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) { last = nowMs; return; }
    const dt = Math.min(0.05, (nowMs - last) / 1000); last = nowMs;
    const t = Date.now() / 1000;
    const inp = input.read();
    stepAnim(dt);
    if (ED.on) { if (inp.mx || inp.my) cam.pan(-inp.mx * 700 * dt, -inp.my * 700 * dt); } else if (me.mode === 'car' && !me.anim) {
      const c = me.car; if (inp.gearTap) { inp.gearTap = false; }
      const v0 = c.v;
      stepCar(c, inp, world, dt, [...T.cars, ...own.filter((o) => o !== c && (o.kind === 'carro' || o.ground))]);
      afterCrash(c, v0); hitPeds(c); enforce(t);
    } else if (me.mode === 'plane') {
      const pl = me.plane; const ev = stepPlane(pl, inp.plane, world, dt);
      if (ev?.crash) planeCrash(pl, ev.crash);
      else if (ev?.landed) toast('Pouso perfeito ✈', 'Bem-vindo(a) ao Aeroporto Nexus.', 'success');
      cam.tz = (cam.userZ || 0) > performance.now() ? null : (touch ? 2.4 : 2.2) / (1 + pl.h / 220);
    } else if (me.mode === 'foot' && !me.anim) stepWalker(me, inp, world, dt, [...T.cars, ...own.filter((o) => o.kind === 'carro' || o.ground)]);
    const viewC = { x: cam.x, y: cam.y, r: Math.max(cam.vw, cam.vh) / cam.z / 2 + 60 };
    const crossing = stepPeds(P, world, dt, t, [...T.cars, ...(me.car ? [me.car] : [])], viewC);
    const extra = [...own.filter((o) => o !== me.car && (o.kind === 'carro' || o.ground)).map((o) => ({ x: o.x, y: o.y, a: o.a, L: o.L, W: o.W })), ...(me.car ? [me.car] : []), ...(me.mode === 'foot' && canDrive(at(world, me.x, me.y)) ? [{ x: me.x, y: me.y, L: 5, W: 5 }] : []), ...P.peds.filter((p) => p.state === 'cross' || p.state === 'ferido').map((p) => ({ x: p.x, y: p.y, L: 6, W: 7 }))];
    const tS = performance.now(); stepTraffic(T, world, dt, t, { extra, crossing, view: viewC }); perf.sim = (perf.sim || 0) + performance.now() - tS;
    if (INC.chase.on) INC.stepChase(dt, me, world, [...T.cars.filter((c) => c !== INC.chase.car), ...own.filter((o) => o !== me.car)]);
    INC.step(dt, me);
    for (const p of particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    for (let i = particles.length - 1; i >= 0; i--) if (particles[i].t > particles[i].life) particles.splice(i, 1);
    const tgtV = me.car || me.plane;
    const tgt = tgtV ? { x: tgtV.x + Math.cos(tgtV.a) * tgtV.v * 0.35, y: tgtV.y + Math.sin(tgtV.a) * tgtV.v * 0.35 } : me;
    cam.update(dt, tgt);
    if (!ED.on && (inp.mx || inp.my || inp.throttle)) cam.follow = true;
    if (flash > 0) flash = Math.max(0, flash - dt * 2.5);
    const tD = performance.now(); draw(t, ED.on ? 0 : window.__forceNight ?? nightOf(cityNow().hour)); perf.draw = (perf.draw || 0) + performance.now() - tD;
    perf.frames++; perf.work += performance.now() - nowMs;
    // qualidade adaptativa: se o aparelho não aguenta, baixa a resolução da tela do mapa
    qa.n++; qa.t += dt; if (qa.t > 2.5) { const fps = qa.n / qa.t; qa.n = 0; qa.t = 0; if (fps < 42 && qa.level < 2) { qa.level++; qa.dpr = qa.level === 1 ? 1.15 : 0.85; resize(); } }
    hudT += dt; if (hudT > 0.12) { hudT = 0; hud(); }
    miniT += dt; if (miniT > 0.35) { miniT = 0; drawMini(); }
    saveT += dt; if (saveT > 20 && (me.car || (me.plane && me.plane.ground))) { saveT = 0; savePark(me.car || me.plane); }
    towIllegal(nowMs);
  }
  raf = requestAnimationFrame(frame);
  window.__d2 = { me, own, T, P, world, city, cam, input, act, perf, INC, R, ED };
  if (params.has('reforma')) setTimeout(() => ED.open(reforma), 50); // inspeção (testes automáticos)
  if (!touch) setTimeout(() => $('#d2Help')?.classList.add('fade'), 10000);
  return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); input.destroy(); ED.destroy(); document.removeEventListener('fullscreenchange', fsOff); if (window.__d2?.me === me) delete window.__d2; if (me.car) savePark(me.car); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); };
}
export { canWalk, WATER, RUNWAY, gather };
