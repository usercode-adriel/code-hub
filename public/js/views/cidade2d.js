// Mapa jogável do RPG — Nexus City em pixel art 16-bit, vista de cima.
// Módulos: city (gerador da cidade), render (blocos em cache + noite), world (grafo e colisão), traffic (trânsito
// automático), peds (moradores e passantes), player (direção e caminhada), plane (voo), incidents (acidentes,
// emergência e perseguição) e input (teclado, toque, pinça, tela girada). Integra com a garagem, a economia,
// as multas, as notícias e os moradores reais do RPG.
import { api } from '../api.js';
import { icon } from '../icons.js';
import { esc, toast } from '../ui.js';
import { buildGraph, lightState, nearestWalk, nearestLane, along, laneDist, at, canFoot, canWalk, canDrive, WATER, RUNWAY } from '../drive/world.js';
import { createBlitz } from '../drive/blitz.js';
import { drawReaction } from '../drive/reactions.js';
import { createCela } from '../drive/cela.js';
import { createStreet, looksOf } from '../drive/street.js';
import { createCarjack } from '../drive/carjack.js';
import { generateCity, CS } from '../drive/city.js';
import { createRenderer } from '../drive/render.js';
import { loadAssets, extrasOf } from '../drive/assets.js';
import * as TR from '../drive/traffic.js';
import { CITY } from '../drive/cityevents.js';
import { createTraffic, stepTraffic, toKmh, lengthOf } from '../drive/traffic.js';
import { createPeds, stepPeds, gather, chrRow, CHR_KEYS, spriteFor } from '../drive/peds.js';
import { CHR } from '../drive/chrmeta.js';
import { stepCar, stepWalker, crashDamage } from '../drive/player.js';
import { createPlane, stepPlane, knots, feet, vRotate } from '../drive/plane.js';
import { createSky } from '../drive/sky.js';
import { createIncidents } from '../drive/incidents.js';
import { createAccidents } from '../drive/accidents.js';
import { buildObst } from '../drive/obst.js';
import { createProtests } from '../drive/protest.js';
import { createTalks, wrapText, balloonSecs, EMO_ICON } from '../drive/talk.js';
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
      <div class="d2-tools"><button data-z="in" aria-label="Aproximar">${icon('plus', 16)}</button><button data-z="out" aria-label="Afastar">${icon('minus', 16)}</button><button data-z="me" aria-label="Centralizar em mim">${icon('target', 16)}</button><button data-z="voos" title="Painel de voos do Aeroporto Nexus" aria-label="Voos">✈</button><button data-z="look" title="Escolher o visual do seu personagem" aria-label="Visual do personagem">${icon('user', 16)}</button><button data-z="edit" class="d2-editb" title="Modo Reforma: posicionar prédios, canteiros e ruas">🔨<span>Reforma</span></button><button data-z="rot" class="d2-only-touch" aria-label="Girar tela / tela cheia">⟳</button><a href="#/mapa?classico=1" title="Mapa de bairros (rotas, lugares e casas)">${icon('map', 16)}</a></div></div>
    <div class="d2-wanted" id="d2Want" hidden></div><div class="d2-sky" id="d2Sky" hidden></div><button class="d2-air" id="d2Air" hidden></button>
    <canvas class="d2-mini" id="d2Mini" width="192" height="132" aria-label="Minimapa"></canvas>
    <div class="d2-dash" id="d2Dash" hidden></div>
    <div class="d2-prompt" id="d2Prompt" hidden></div>
    <div class="d2-help" id="d2Help"><b>W A S D</b> andar/dirigir (aperte 2× para correr) · <b>Espaço</b> freio de mão · <b>E</b> entrar/sair · <b>roda</b> zoom · <b>arrastar</b> explorar · no avião: <b>W/S</b> acelerar/reduzir, <b>A/D</b> virar, <b>Espaço</b> puxa a alavanca (sobe), <b>Shift</b> empurra (desce)</div>
    <div class="d2-ctl d2-foot"><div class="d2-joy" data-ctl="joy"><i></i></div><button class="d2-act" data-ctl="enter" id="d2EnterF">Entrar</button></div>
    <div class="d2-ctl d2-drive"><div class="d2-steer"><button data-ctl="left" aria-label="Esquerda">${icon('chevLeft', 28)}</button><button data-ctl="right" aria-label="Direita">${icon('chevRight', 28)}</button></div>
      <div class="d2-pedals"><button class="d2-gearb" data-ctl="gear" id="d2GearB"><span>D</span><small>marcha</small></button><button class="d2-exit" data-ctl="enter">Sair</button><button class="d2-brake" data-ctl="brake">Freio</button><button class="d2-gas" data-ctl="gas">Acelerar</button></div></div>
    <div class="d2-ctl d2-fly"><div class="d2-steer"><button data-ctl="left" aria-label="Esquerda">${icon('chevLeft', 28)}</button><button data-ctl="right" aria-label="Direita">${icon('chevRight', 28)}</button></div>
      <div class="d2-lever" data-ctl="lever" aria-label="Alavanca: abaixe para subir"><small>▲ descer</small><div class="d2-lev-track"><i></i></div><small>▼ subir</small></div>
      <div class="d2-pedals fly"><button class="d2-exit" data-ctl="enter">Sair</button><button class="d2-brake" data-ctl="brake">Reduzir</button><button class="d2-gas" data-ctl="gas">Acelerar</button></div></div>
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
  const syncWorld = () => Object.assign(world, { mask: city.mask, heights: city.heights, cs: CS, mw: city.mw, ox: city.ox, oy: city.oy, bounds: city.bounds, pois: city.pois, regions: city.regions, radars: city.R.radars, obst: buildObst(city.props) });
  syncWorld();
  await assets.ensure(extrasOf(city));
  const R = createRenderer(city, assets, { mobile: touch });
  $('#d2Load').remove();
  const IMG = assets.img;
  const meta = (k) => assets.meta[k] || [40, 70];

  // ---------------- entidades
  const T = createTraffic(world, { count: touch ? 30 : 50 });
  const realPeople = state.people.slice(0, touch ? 30 : 46).map((p) => ({ ...p, real: true }));
  const filler = Array.from({ length: touch ? 30 : 64 }, (_, i) => ({ id: `pass${i}`, name: 'Passante', job: i % 9 === 0 ? 'obra' : '' }));
  const P = createPeds(world, [...realPeople, ...filler], assets.roles);
  // conversas entre moradores: o conteúdo vem do servidor (sem IA paga), o mapa só reproduz as falas em turnos
  const TALKS = createTalks({ P, request: (a, b) => api.post('/mundo/dialogo/gerar', { a, b }).catch(() => null) });
  const sampleColor = (key) => { const im = IMG[key]; if (!im) return '#888'; const c = document.createElement('canvas'); c.width = c.height = 1; const x = c.getContext('2d'); x.drawImage(im, im.width * 0.3, im.height * 0.55, im.width * 0.4, im.height * 0.15, 0, 0, 1, 1); const d = x.getImageData(0, 0, 1, 1).data; return `rgb(${d[0]},${d[1]},${d[2]})`; };
  const now0 = Date.now();
  const own = []; // carros e aviões do jogador
  let si = 0; let pi = 0;
  for (const c of state.cars) {
    if (c.repairUntil && new Date(c.repairUntil).getTime() > now0) continue;
    if (c.type === 'aeronave') {
      const sp = c.parked || city.planeSpots[1 + (pi++ % (city.planeSpots.length - 1))];
      const p = createPlane({ ...c, own: true, sprite: c.sprite, L: c.L || (c.key.includes('jato') ? 52 : 42), W: c.L || (c.key.includes('jato') ? 46 : 54) }, sp.x ?? sp[0], sp.y ?? sp[1], sp.a ?? sp[2]);
      p.id = c.id; p.health = c.health ?? 100; own.push(p); continue;
    }
    const sp = c.parked ? [c.parked.x, c.parked.y, c.parked.a] : c.rental && city.rentSpot ? city.rentSpot : city.spots[(si++ * 3) % city.spots.length];
    own.push({ own: true, rental: Boolean(c.rental), kind: 'carro', id: c.id, key: c.key, name: c.name, sprite: c.sprite || 'branco', speed: c.speed || 1, x: sp[0], y: sp[1], a: sp[2], v: 0, steer: 0, gear: 'D', L: lengthOf(c.key === 'car-van-bege' || c.key === 'car-sorvete' ? 'van' : 'carro'), W: 12, health: c.health ?? 100, door: 0, color: sampleColor(`cars/${c.sprite || 'branco'}`) });
  }
  // avião-escola da escola de voo (sempre disponível para treinar)
  const school = createPlane({ name: 'Avião-escola Paulistinha', sprite: 'mono-amarelo', school: true, L: 42, W: 54, air: { thrust: 44, vmax: 220, vstall: 92, turn: 1 } }, ...city.planeSpots[0]);
  school.id = 'escola'; school.health = 100; own.push(school);
  const cars = () => own.filter((o) => o.kind === 'carro');
  const startCar = cars().find((c) => c.id === state.main) || cars()[0];
  const me = { x: 0, y: 0, a: 0, v: 0, mode: 'foot', car: null, plane: null, moving: false, anim: null, spr: (() => { const saved = localStorage.getItem('codeniac.chr2'); return `chr/${saved && CHR[saved] ? saved : 'barbudo'}`; })(), row: 0, walkT: 0 };
  [me.x, me.y] = (startCar && nearestWalk(world, startCar.x, startCar.y + 18, 60)) || nearestWalk(world, 1728 - 40, 1504 + 40, 80) || [1690, 1544];
  // detido(a) numa blitz: começa na delegacia (a detenção corre no relógio do servidor)
  let DET = state.detention || null;
  const stationNear = (id, x, y) => city.pois.filter((p) => p.id === id || p.id.startsWith(`${id}-`)).sort((a, b) => Math.hypot(a.at[0] - x, a.at[1] - y) - Math.hypot(b.at[0] - x, b.at[1] - y))[0]?.at;
  if (DET) { const pol = city.pois.find((p) => p.id === 'policia-aurora')?.at || stationNear('policia', me.x, me.y); if (pol) [me.x, me.y] = nearestWalk(world, pol[0], pol[1] - 10, 60) || pol; }
  const cam = createCamera(world); cam.z = touch ? 2.6 : 2.4; cam.x = cam.tx = me.x; cam.y = cam.ty = me.y;
  const particles = [];
  const notify = (t, m, k = 'info') => toast(t, m, k);
  const report = (body) => api.post('/mundo/cidade2d/ocorrencia', { regiao: regionAt(me.car || me.plane || me), ...body }).catch(() => {});
  const SKY = createSky(world, { chrFor: (p) => spriteFor(p, assets.roles, p.id) });
  // agenda de voos do servidor (painel, nomes dos passageiros); atualiza a cada 30 s
  const PR = createProtests({ world, pois: city.pois, chrFor: (p) => spriteFor(p, assets.roles, p.id), mobile: touch });
  const loadBoard = () => Promise.all([api.get('/mundo/voos').then((b) => { SKY.board = b; }), api.get('/mundo/manifestacoes').then((m) => PR.set(m))]).catch(() => {});
  loadBoard(); const boardTimer = setInterval(loadBoard, 30000);
  let ACC = null; // acidentes entre moradores (criado depois das ocorrências)
  const INC = createIncidents({ world, T, P, pois: city.pois, notify, report });
  ACC = createAccidents({ world, T, P, INC, report, regionAt: (p) => regionAt(p), notify, chrFor: (p) => spriteFor(p, assets.roles, p.id) });
  // ocorrências de rua (esbarrão, queda, crime entre moradores): street.js conduz a cena; o servidor guarda o que é real
  // roubo de veículos (jogador e moradores) e nível de procurado
  const CARJ = createCarjack({ T, P, INC, ACC, world, me, own, notify, regionAt: (p) => regionAt(p), looks: () => looksOf(me.spr), chrFor: (c) => spriteFor({ id: c.id }, assets.roles, c.id),
    post: (path, body) => api.post(`/mundo/rua/${path}`, body).catch(() => null),
    ui: { enter: (o) => { me.anim = { kind: 'enter', t: 0, car: o, from: [me.x, me.y] }; }, arrest: (x) => arrestPanel(x), exitCar: () => { const c = me.car; if (!c) return; c.v = 0; const sp = nearestWalk(world, ...doorPoint(c), 40, canFoot) || [c.x + 14, c.y]; me.mode = 'foot'; me.car = null; me.anim = null; [me.x, me.y] = sp; } } });
  const STREET = createStreet({ P, INC, ACC, world, me, notify, regionAt: (p) => regionAt(p), post: (path, body) => api.post(`/mundo/rua/${path}`, body).catch((err) => { toast('Ocorrência', err.message, 'error'); return null; }), ui: { discuss: (o) => discussPanel(o), arrest: (x) => arrestPanel(x) } });

  // ---------------- entrada
  const input = createInput(stage, { onEnter: () => act(), onZoom: (f, sx, sy) => { cam.userZ = performance.now() + 6000; cam.zoomAt(f, sx, sy); }, onPan: (dx, dy) => cam.pan(dx, dy), onTap: (sx, sy) => (ED?.on ? ED.tap(sx, sy) : tap(sx, sy)), onHover: (sx, sy) => ED?.on && ED.hover(sx, sy), paint: { active: () => ED?.paints(), at: (sx, sy) => ED.paintAt(sx, sy), end: () => ED.paintEnd() } });
  input.touchUI = touch;
  stage.querySelectorAll('[data-z]').forEach((b) => { b.onclick = () => { const z = b.dataset.z; if (z === 'me') { cam.follow = true; return; } if (z === 'rot') { rotate(); return; } if (z === 'edit') { if (ED.on) ED.close(); else ED.open(reforma); return; } if (z === 'look') { pickLook(); return; } if (z === 'voos') { flightPanel(); return; } cam.zoomAt(z === 'in' ? 1.3 : 1 / 1.3, cam.vw / 2, cam.vh / 2); }; });
  // modo Reforma: refaz a cidade com a reforma (geração + edições) e descarta só os blocos afetados
  function rebuildCity(rf, rect, full) {
    const t0 = performance.now();
    Object.assign(city, generateCity(undefined, { reforma: rf })); syncWorld();
    R.reset({ rect, coast: full }); perf.rebuild = Math.round(performance.now() - t0);
    assets.ensure(extrasOf(city)).then((got) => { if (got) R.reset({ rect, coast: false }); });
  }
  // balão de fala: caixa branca com quebra automática de linha, humor no começo, some aos poucos no fim
  function balloon(sx, sy, say, nowMs) {
    const alpha = Math.max(0, Math.min(1, (say.until - nowMs) / 450));
    const lines = wrapText(((EMO_ICON[say.emo] || '') + ' ' + say.text).trim(), 24);
    ctx.save(); ctx.font = '600 10px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const lh = 12; const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 10; const h = lines.length * lh + 6;
    const x = Math.round(sx - w / 2); const y = Math.round(sy - h - 6);
    ctx.globalAlpha = alpha * 0.96; ctx.fillStyle = '#fbfbf7'; ctx.strokeStyle = 'rgba(20,24,50,.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y, w, h, 6); else ctx.rect(x, y, w, h); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx - 3, y + h); ctx.lineTo(sx + 3, y + h); ctx.lineTo(sx, y + h + 4); ctx.closePath(); ctx.fillStyle = '#fbfbf7'; ctx.fill();
    ctx.fillStyle = '#141832';
    lines.forEach((l, i) => ctx.fillText(l, x + 5, y + 6 + lh / 2 + i * lh));
    ctx.restore();
  }
  // discussão depois de um esbarrão (ou com quem ficou sentado sangrando): três respostas; o servidor decide a reação
  function discussPanel({ ped, situacao, opening, onResult }) {
    stage.querySelector('.d2-talk')?.remove();
    const nm = ped.real ? ped.name : 'Pedestre'; const box = document.createElement('div'); box.className = 'd2-talk d2-disc';
    box.innerHTML = `<div class="tk-head"><span class="bz-badge" aria-hidden="true">😠</span><div><b>${esc(nm)}</b><small>${situacao === 'sangrando' ? 'caído(a), sangrando · muito irritado(a)' : 'irritado(a) com o esbarrão'}</small></div><button class="tk-x" aria-label="Fechar">×</button></div>
      <div class="tk-log"><p class="tk-npc">${esc(nm.split(' ')[0])}: ${esc(opening)}</p></div>
      <div class="tk-opts"><button data-t="educada" class="tk-educada">Pedir desculpas</button><button data-t="neutra" class="tk-neutra">Ignorar</button><button data-t="agressiva" class="tk-agressiva">Provocar</button></div>`;
    stage.appendChild(box); const log = box.querySelector('.tk-log');
    const close = (r = null) => { box.remove(); onResult?.(r); onResult = null; };
    box.querySelector('.tk-x').onclick = () => close(null);
    box.querySelectorAll('[data-t]').forEach((b) => { b.onclick = async () => {
      box.querySelectorAll('[data-t]').forEach((x) => { x.disabled = true; });
      let r = null;
      if (ped.real) r = await api.post('/mundo/rua/discussao', { id: ped.id, tone: b.dataset.t, situacao }).catch(() => null);
      if (!r) { const brav = b.dataset.t === 'agressiva' || (b.dataset.t === 'neutra' && Math.random() < 0.5); r = { fala: b.dataset.t === 'educada' ? 'Tá bom... mas presta atenção.' : brav ? 'Vou chamar a polícia!' : 'Que falta de educação.', emo: brav ? 'irritado' : 'neutro', chamaPolicia: situacao !== 'sangrando' && brav, encerra: true }; }
      log.insertAdjacentHTML('beforeend', `<p class="tk-me">Você: ${esc(b.textContent)}</p><p class="tk-npc">${esc(nm.split(' ')[0])}: ${esc(r.fala)}</p>`);
      if (r.chamaPolicia) log.insertAdjacentHTML('beforeend', '<p class="tk-npc"><b>📞 Está ligando para a polícia.</b></p>');
      setTimeout(() => close(r), 1800);
    }; });
  }
  // prisão: cumprir os dias na cela (1 dia = 24 h da cidade) ou pagar a fiança
  function arrestPanel(x) {
    stage.querySelector('.d2-talk')?.remove();
    const ref = me.car || me; const pol = city.pois.filter((q) => q.id === 'policia' || q.id.startsWith('policia-')).sort((a, b) => Math.hypot(a.at[0] - ref.x, a.at[1] - ref.y) - Math.hypot(b.at[0] - ref.x, b.at[1] - ref.y))[0];
    const deleg = pol?.id.endsWith('aurora') ? 'Delegacia de Aurora' : 'Delegacia de Nexus City';
    const box = document.createElement('div'); box.className = 'd2-talk d2-blitz';
    box.innerHTML = `<div class="tk-head"><span class="bz-badge" aria-hidden="true">🚓</span><div><b>Você foi detido(a)</b><small>${esc(x.motivo || 'Crime')} · ${esc(deleg)}</small></div></div>
      <div class="tk-log"><p class="tk-npc">Policial: Você está sendo levado(a) para a delegacia. Pena: ${x.dias} dia(s) na cela, ou fiança de ${x.fianca} NXC.</p></div>
      <div class="tk-opts"><button data-o="cumprir" class="tk-neutra">Cumprir ${x.dias} dia(s) na cela</button><button data-o="fianca" class="tk-educada">Pagar fiança · ${x.fianca} NXC</button></div>
      <div class="tk-foot"><small>1 dia da cidade = 40 min reais. O inquérito continua na Delegacia nos dois casos.</small></div>`;
    stage.appendChild(box);
    box.querySelectorAll('[data-o]').forEach((b) => { b.onclick = async () => {
      try {
        const r = await api.post('/mundo/rua/prisao', { opcao: b.dataset.o, delegacia: deleg }); box.remove(); refreshStatus(true);
        if (r.resultado === 'preso') arrest(r.detention, me.car || null); else toast('💸 Fiança paga', `${r.pago} NXC. Você está livre, mas responde ao inquérito.`, 'warning');
      } catch (err) { toast('Prisão', err.message, 'error'); }
    }; });
  }
  // conversa com um morador (toque nele): fala contextual, humor, relação e três respostas com consequências
  async function talkPanel(ped) {
    stage.querySelector('.d2-talk')?.remove();
    let d;
    try { d = await api.get(`/mundo/dialogo/abrir/${encodeURIComponent(ped.id)}`); }
    catch (err) { toast(ped.name, err.message, 'info'); return; }
    const pr = d.persona; const MOOD = { feliz: 'feliz', triste: 'triste', irritado: 'irritado', neutro: 'tranquilo(a)', apaixonada: 'apaixonado(a)', grata: 'grato(a)' };
    const box = document.createElement('div'); box.className = 'd2-talk';
    box.innerHTML = `<div class="tk-head"><img src="${esc(pr.avatar || '')}" alt=""><div><b>${esc(pr.name)}</b><small>${esc(pr.relation)} · ${esc(MOOD[pr.mood] || pr.mood || 'tranquilo(a)')}${pr.hostile ? ' · irritado(a) com você' : ''}</small></div><button class="tk-x" aria-label="Fechar">×</button></div>
      <div class="tk-log" id="tkLog"><p class="tk-npc">${esc(pr.name.split(' ')[0])}: ${esc(d.greeting.text)}</p></div>
      <div class="tk-opts">${d.options.map((o) => `<button data-t="${o.tone}" data-o="${esc(o.id)}" class="tk-${o.tone}">${esc(o.label)}</button>`).join('')}</div>
      <div class="tk-foot"><small id="tkRel">Afeição ${pr.aff} · confiança ${pr.trust}</small><a href="#" class="tk-card">Ver ficha</a></div>`;
    stage.appendChild(box);
    ped.say = { text: d.greeting.text, emo: d.greeting.emo, until: performance.now() + balloonSecs(d.greeting.text) * 1000 };
    const log = box.querySelector('#tkLog'); let busy = false;
    box.querySelector('.tk-x').onclick = () => box.remove();
    box.querySelector('.tk-card').onclick = (e) => { e.preventDefault(); personCard(ped.id); };
    box.querySelectorAll('[data-t]').forEach((b) => { b.onclick = async () => {
      if (busy) return; busy = true; box.querySelectorAll('[data-t]').forEach((x) => { x.disabled = true; });
      try {
        const r = await api.post('/mundo/dialogo/responder', { id: ped.id, tone: b.dataset.t, opcao: b.dataset.o });
        log.insertAdjacentHTML('beforeend', `<p class="tk-me">Você: ${esc(b.textContent)}</p><p class="tk-npc">${esc(pr.name.split(' ')[0])}: ${esc(r.reply.text)}</p>`);
        log.scrollTop = log.scrollHeight;
        ped.say = { text: r.reply.text, emo: r.reply.emo, until: performance.now() + balloonSecs(r.reply.text) * 1000 };
        box.querySelector('#tkRel').textContent = `${r.relation} · afeição ${r.aff} · confiança ${r.trust}`;
        if (r.escalate) toast('⚠️ Discussão', `${pr.name.split(' ')[0]} ficou irritado(a) com você.`, 'warning');
        if (r.ends) setTimeout(() => box.remove(), 1600);
        else { box.querySelectorAll('[data-t]').forEach((x) => { x.disabled = false; }); }
      } catch (err) { toast('Não deu', err.message, 'error'); box.querySelectorAll('[data-t]').forEach((x) => { x.disabled = false; }); }
      busy = false;
    }; });
  }
  // painel de voos (partidas e chegadas do dia, status, portão e passageiros conhecidos)
  const hhmm = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
  const ST_COL = { Programado: '#94a3b8', 'Check-in aberto': '#38bdf8', Embarque: '#fbbf24', 'Portas fechadas': '#fb923c', Decolou: '#2fd27a', 'Em voo': '#2fd27a', Previsto: '#94a3b8', 'Em aproximação': '#fbbf24', Pousou: '#2fd27a', Desembarcado: '#64748b' };
  async function flightPanel() {
    let m = stage.querySelector('.d2-fb'); if (m) { m.remove(); return; }
    await loadBoard(); const b = SKY.board; if (!b) { toast('Painel de voos', 'Sem conexão com o aeroporto agora.', 'info'); return; }
    m = document.createElement('div'); m.className = 'd2-fb ed-modal';
    const row = (f) => `<tr><td><b>${esc(f.num)}</b><small>${esc(f.plane)}</small></td><td>${f.kind === 'partida' ? '🛫' : '🛬'} ${esc(f.city)}</td><td>${hhmm(f.at)}${f.tomorrow ? '<small>amanhã</small>' : ''}</td><td>${esc(f.gate)}</td><td><i style="--c:${ST_COL[f.status] || '#94a3b8'}">${esc(f.status)}</i></td>
      <td class="fb-pax">${f.pax.map((p) => `<span title="${esc(p.name)}">${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : ''}${esc(p.name.split(' ')[0])}</span>`).join('') || `<small>${f.visitors} passageiros</small>`}</td></tr>`;
    m.innerHTML = `<div class="ed-card fb-card"><h3>✈ Aeroporto Internacional Nexus</h3><p>Agora: ${hhmm(b.hour)} · moradores com nome estão nos voos marcados; o embarque começa ~30 min antes no pátio.</p>
      <table class="fb-t"><thead><tr><th>Voo</th><th>Destino / origem</th><th>Hora</th><th>Portão</th><th>Status</th><th>Passageiros</th></tr></thead><tbody>${b.flights.map(row).join('')}</tbody></table>
      <div class="ed-row"><button class="cx-btn ghost" data-go>Ir ao aeroporto</button><button class="cx-btn" data-x>Fechar</button></div></div>`;
    stage.appendChild(m);
    m.querySelector('[data-x]').onclick = () => m.remove();
    m.querySelector('[data-go]').onclick = () => { m.remove(); cam.follow = false; cam.x = cam.tx = 3300; cam.y = cam.ty = 960; cam.z = Math.max(cam.z, 2); };
  }
  // visual do jogador: escolhe um dos personagens animados (fica salvo neste aparelho)
  function pickLook() {
    let m = stage.querySelector('.d2-look'); if (m) { m.remove(); return; }
    m = document.createElement('div'); m.className = 'd2-look ed-modal';
    m.innerHTML = `<div class="ed-card"><h3>Seu personagem</h3><p>Escolha o visual com que você anda pela cidade.</p><div class="d2-looks">${CHR_KEYS.map((k) => `<button data-k="${k}" class="${me.spr === `chr/${k}` ? 'on' : ''}" title="${esc(CHR[k].name)}"><i style="background-image:url(/assets/rpg/chr/${k}.png);background-size:400% ${(CHR[k].rows || 4) * 100}%;aspect-ratio:${CHR[k].w}/${CHR[k].h}"></i><span>${esc(CHR[k].name)}</span></button>`).join('')}</div><div class="ed-row"><button class="cx-btn" data-x>Fechar</button></div></div>`;
    stage.appendChild(m);
    m.querySelectorAll('[data-k]').forEach((b) => { b.onclick = () => { me.spr = `chr/${b.dataset.k}`; localStorage.setItem('codeniac.chr2', b.dataset.k); m.remove(); toast('Visual trocado', CHR[b.dataset.k].name, 'success'); }; });
    m.querySelector('[data-x]').onclick = () => m.remove();
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
    if (DET) { toast('Você está detido(a)', 'Espere a liberação ou pague a fiança.', 'warning'); return; }
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
    if ((!n || n[1] > 30) && CARJ.tryJack()) return; // carro da cidade perto: roubo (o motorista sai e o jogador entra)
    if (!n) {
      const c = nearest(cars(), me, 99999);
      toast(c ? `Seu ${c[0].name} está longe` : 'Sem veículo por perto', c ? 'Siga o marcador verde no mapa e no minimapa.' : 'Compre um carro na Concessionária ou use o avião-escola no Aeroporto.', 'info');
      return;
    }
    const o = n[0];
    if (o.kind === 'aviao') {
      if (n[1] > 46) return;
      if ((o.health ?? 100) <= 0) { toast(`${o.name} está inutilizado`, 'Chame o resgate para levar ao hangar.', 'warning'); return; }
      me.mode = 'plane'; me.plane = o; cam.follow = true; input.resetLever(0); o.lever = 0;
      const how = o.heli ? (touch ? 'Toque em Acelerar para ligar o rotor e abaixe a alavanca para subir. Setas viram, Acelerar vai para a frente.' : 'W acelera, Espaço sobe, Shift desce, A/D viram. Decola e pousa em qualquer lugar livre.')
        : (touch ? `Acelere até o fim da pista e, passando de ${knots(vRotate(o))} nós, abaixe a alavanca para decolar. Setas viram.` : `Segure W até passar de ${knots(vRotate(o))} nós na pista e puxe com Espaço para decolar. A/D viram.`);
      toast(o.school ? 'Avião-escola' : o.name, how, 'info'); return;
    }
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
    if (ped) { talkPanel(ped); return; }
    const poi = city.pois.find((p) => Math.abs(p.at[0] - wx) < 60 / cam.z * 1.6 && Math.abs(p.at[1] - wy) < 14 / cam.z * 1.6);
    if (poi) location.hash = poi.route;
  }

  // ---------------- garagem: estacionar, danos e reboque
  const savePark = (c) => { if (c.id && c.id !== 'escola' && !c.stolen) api.post('/mundo/cidade2d/estacionar', { itemId: c.id, x: c.x, y: c.y, a: c.a }).catch(() => {}); };
  let dmgTimer = null;
  const saveDamage = (c) => { if (!c.id || c.id === 'escola' || c.stolen) return; clearTimeout(dmgTimer); dmgTimer = setTimeout(() => api.post('/mundo/cidade2d/dano', { itemId: c.id, health: c.health }).catch(() => {}), 800); };
  async function callTow(c) {
    try {
      if (c.stolen) { toast('Carro roubado', 'A oficina não aceita carro sem documento. Abandone-o.', 'warning'); return; }
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
  const policeNear = (p, r) => T.cars.some((c) => c.kind === 'policia' && (!c.job || c.job.kind === 'blitz') && Math.hypot(c.x - p.x, c.y - p.y) < r);
  // Aurora (cidade inteligente): câmeras da Central de Monitoramento cobrem a cidade toda
  const inAurora = (p) => { const a = city.aurora?.area; return Boolean(a) && p.x > a[0] && p.x < a[2] && p.y > a[1] && p.y < a[3]; };
  let camNote = 0;
  const centralSaw = (what) => { if (camNote > performance.now()) return; camNote = performance.now() + 20000; toast('📹 Central de Monitoramento', `${what} registrado pelas câmeras de Aurora.`, 'warning'); };
  const lightIn = new Map(); const radarHit = new Map();
  function enforce(t) {
    const c = me.car; if (!c) return; const kmh = toKmh(c.v);
    for (const n of Object.values(world.nodes)) {
      if (!n.light || Math.abs(n.x - c.x) > 80 || Math.abs(n.y - c.y) > 80) { lightIn.delete(n.id); continue; }
      const inside = Math.hypot(c.x - n.x, c.y - n.y) < n.clear - 6; const was = lightIn.get(n.id) || false;
      if (inside && !was && kmh > 8 && c.v > 0) {
        const axis = Math.abs(Math.cos(c.a)) >= Math.abs(Math.sin(c.a)) ? 'H' : 'V';
        if (lightState(n, axis, t) === 'red') { fine('sinal'); if (inAurora(c)) centralSaw('Avanço de sinal vermelho'); if (policeNear(c, 320)) INC.startChase(1, 'Avanço de sinal vermelho na frente da polícia', c); }
      }
      lightIn.set(n.id, inside);
    }
    for (const [i, r] of world.radars.entries()) {
      if (Math.hypot(c.x - r.at[0], c.y - r.at[1]) > 26 || (radarHit.get(i) || 0) > performance.now()) continue;
      if (kmh > r.limit * 1.07 + 2) {
        radarHit.set(i, performance.now() + 8000); const ex = kmh / r.limit - 1; fine(ex <= 0.2 ? 'velocidade' : ex <= 0.5 ? 'velocidade-grave' : 'velocidade-gravissima', { kmh: Math.round(kmh), limite: r.limit });
        // em Aurora a central manda uma viatura atrás de quem passa muito acima do limite, mesmo sem polícia por perto
        if (ex > 0.5 && (policeNear(c, 400) || r.aurora)) { if (r.aurora) centralSaw(`Excesso de velocidade (${Math.round(kmh)} km/h)`); INC.startChase(1, r.aurora ? 'Central de Monitoramento: excesso de velocidade' : 'Excesso de velocidade', c); }
      }
    }
  }

  // ---------------- colisões com consequências
  function afterCrash(c, wasV) {
    if (!c.hit || !c.impact) return;
    const dmg = crashDamage(c.impact);
    const other = c.hitWith;
    // batida em carro de morador: os dois ficam danificados na hora e soltam fumaça; o motorista sai e reclama,
    // a polícia vem e o guincho leva o carro dele (cena programada)
    if (other && T.cars.includes(other) && !other.temp && !other.sceneHold && !other.towedBy && c.impact > 8) {
      ACC.crashScene([other], viewNow(), { culprit: true, police: true, playerCar: c, kmh: c.impact * 0.72 });
      c.smokeT = 8; fine('colisao'); report({ tipo: 'acidente', culpa: true, veiculo: c.name });
      const d2 = Math.max(dmg, 6); c.health = Math.max(0, (c.health ?? 100) - d2); saveDamage(c);
      toast('💥 Batida!', `Você bateu num carro. Lataria: ${Math.round(c.health)}%. A polícia está a caminho.`, 'warning');
      return;
    }
    if (other && !other.own && other.kind !== undefined) { other.wrecked = Math.max(other.wrecked || 0, dmg > 15 ? 25 : 4); other.v = 0; other.smoke = 1; }
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
  const viewNow = () => ({ x: cam.x, y: cam.y, r: Math.max(cam.vw, cam.vh) / cam.z / 2 + 60 });
  function hitPeds(c) {
    if (Math.abs(c.v) < 3) return;
    const ca = Math.cos(c.a); const sa = Math.sin(c.a);
    for (const p of P.peds) {
      if (p.state === 'ferido' || p.state === 'levado' || p.state === 'cena' || Math.abs(p.x - c.x) > 20 || Math.abs(p.y - c.y) > 20) continue;
      const dx = p.x - c.x; const dy = p.y - c.y; const lx = dx * ca + dy * sa; const ly = -dx * sa + dy * ca;
      if (Math.abs(lx) > c.L / 2 + 2 || Math.abs(ly) > c.W / 2 + 2) continue;
      if (toKmh(c.v) < 9) { p.s += p.dir * 8; continue; }
      c.v *= 0.6;
      const inc = ACC.pedScene(p, null, viewNow(), { culprit: true }); // vítima no chão, roda de curiosos, ambulância e polícia
      toast('Atropelamento!', `${p.real ? p.name : 'Um pedestre'} ficou ferido(a). A ambulância e a polícia estão a caminho.`, 'error');
      report({ tipo: 'atropelamento', personaId: p.real ? p.id : null, nome: p.real ? p.name : 'Pedestre', culpa: true, veiculo: c.name, kmh: Math.round(toKmh(c.v)) }).then((r) => { if (r?.estado === 'morto') p.dead = true; }); // morte (rara): o servidor decide
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
  // personagem da folha animada: linha pela direção (frente, direita, costas, esquerda), quadro pelo passo
  function drawChr(key, x, y, row, frame, H) {
    const im = IMG[key]; const m = CHR[key.slice(4)]; if (!im || !m) return false;
    const W = (H * m.w) / m.h; ctx.drawImage(im, frame * m.w, row * m.h, m.w, m.h, x - W / 2, y - H, W, H); return true;
  }
  // personagem fazendo uma reação da folha de referência (quadros desenhados, com as cores dele)
  function reactChr(key, x, y, kind, t, face, H) {
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(x, y, H * 0.42, 1.5, 0, 0, Math.PI * 2); ctx.fill();
    if (!drawReaction(ctx, IMG[`${key}-rx`], key, kind, t, x, y, H, face)) drawChr(key, x, y, 0, 0, H);
  }
  function drawPed(p, t) {
    if (p.state === 'levado' || p.state === 'cena') return;
    // reações (folha de referência): caído (esbarrão) se levanta no fim; atropelado fica deitado esperando a ambulância
    if (p.state === 'caido' || p.state === 'ferido') {
      const kind = p.state === 'caido' ? 'caido' : 'atropelado';
      if (!p.react || p.react.kind !== kind) p.react = { kind, t0: performance.now(), face: Math.cos(p.fallA ?? p.a) < 0 ? -1 : 1 };
      const el = (performance.now() - p.react.t0) / 1000;
      if (p.state === 'caido' && p.fall < 0.8) reactChr(p.spr, p.x, p.y + 0.5, 'levantando', 0.8 - p.fall, p.react.face, 15); // levanta no fim
      else if (p.dead && el > 0.9) reactChr(p.spr, p.x, p.y + 0.5, 'morto', el - 0.9, p.react.face, 15); // depois do atropelamento, morto (deitado)
      else reactChr(p.spr, p.x, p.y + 0.5, kind, el, p.react.face, 15);
      return;
    }
    // ocorrências de rua: vítima (reação), fugindo/atacando (corrida), discutindo (braço levantado, virado para o jogador)
    if (p.state === 'vitima' && p.react) { reactChr(p.spr, p.x, p.y + 0.5, p.react.kind, (performance.now() - p.react.t0) / 1000, p.react.face, 15); return; }
    if (p.state === 'foge' || p.state === 'ataca') { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 3.4, 1.4, 0, 0, Math.PI * 2); ctx.fill(); drawChr(p.spr, p.x, p.y + 0.5, Math.cos(p.a) >= 0 ? 4 : 5, Math.floor(t * 9 + p.phase) % 4, 15); return; }
    if (p.state === 'discute') { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 3.4, 1.4, 0, 0, Math.PI * 2); ctx.fill(); drawChr(p.spr, p.x, p.y + 0.5, 6, Math.floor(t * 1.6) % 2, 15); return; }
    p.react = null;
    const moving = ((p.state === 'walk' || p.state === 'cross' || p.state === 'jay') && !p.pause) || ((p.state === 'roda' || p.state === 'volta') && p.rmove);
    // olhando uma ocorrência: vira para ela; parado: mantém a última direção
    const ang = p.state === 'olhando' && p.lookAt ? Math.atan2(p.lookAt[1] - p.y, p.lookAt[0] - p.x) : p.state === 'conversa' && p.talk ? Math.atan2(p.talk.with.y - p.y, p.talk.with.x - p.x) : p.a;
    if (moving || p.state === 'olhando' || p.state === 'conversa' || p.row == null) p.row = chrRow(ang);
    // o passo acompanha a velocidade (≈ 0,7 passo por unidade/s); parado fica no quadro de descanso
    const frame = moving ? Math.floor(t * (p.v || 9) * 0.75 + p.phase * 4) % 4 : 0;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 3.4, 1.4, 0, 0, Math.PI * 2); ctx.fill();
    drawChr(p.spr, p.x, p.y + 0.5, p.row, frame, 15);
    if (p.state === 'olhando') { ctx.fillStyle = '#fff'; ctx.font = 'bold 6px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(Math.sin(t * 6 + p.phase) > 0 ? '!' : '?', p.x, p.y - 17); }
  }
  function drawMe(t) {
    if (me.mode !== 'foot' && !(me.anim && me.anim.kind === 'enter' && me.anim.t < 0.5) && !(me.anim && me.anim.kind === 'exit' && me.anim.t >= 0.25)) return;
    const H = 16;
    ctx.fillStyle = 'rgba(56,214,245,.35)'; ctx.beginPath(); ctx.ellipse(me.x, me.y, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
    if (me.swim) { ctx.save(); ctx.beginPath(); ctx.rect(me.x - 10, me.y - H, 20, H * 0.55); ctx.clip(); }
    if (me.moving) me.row = chrRow(me.a);
    const walking = me.moving && !me.swim; const side = me.row === 1 || me.row === 3;
    // correndo de lado: quadros de corrida da folha (linhas 4 direita e 5 esquerda); de frente/costas, passos mais rápidos
    if (walking && me.run && side) drawChr(me.spr, me.x, me.y + 0.5, me.row === 1 ? 4 : 5, Math.floor(me.walkT) % 4, H);
    else drawChr(me.spr, me.x, me.y + 0.5 + (me.swim ? 3 : 0), me.row || 0, walking ? Math.floor(me.walkT) % 4 : 0, H);
    if (me.run && walking && Math.random() < 0.25) particles.push({ x: me.x - Math.cos(me.a) * 3, y: me.y, vx: 0, vy: -2, t: 0, life: 0.6, s: 3 });
    if (me.swim) { ctx.restore(); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.ellipse(me.x, me.y - 5, 6 + Math.sin(t * 5) * 1.5, 2, 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = '#38d6f5'; ctx.beginPath(); ctx.moveTo(me.x, me.y - H - 4); ctx.lineTo(me.x - 3, me.y - H - 8); ctx.lineTo(me.x + 3, me.y - H - 8); ctx.fill();
  }
  // silhueta (sombra) e versão queimada de cada aeronave, prontas uma vez (filtros por quadro são caros no celular)
  const planeCache = new Map();
  const planeVariant = (key, kind) => {
    const k = `${key}|${kind}`; let c = planeCache.get(k); if (c) return c;
    const im = IMG[key]; c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d');
    x.drawImage(im, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = kind === 'shadow' ? '#000' : kind === 'worn' ? 'rgba(40,22,10,.32)' : 'rgba(20,10,5,.55)'; x.fillRect(0, 0, c.width, c.height);
    planeCache.set(k, c); return c;
  };
  // sprite conforme o estado: inteiro, danificado (saúde < 60%) ou queimado; helicóptero com rotor girando;
  // avariado solta fumaça (e fogo quando grave) com animação leve
  function drawPlane(p) {
    const base = `air/${p.sprite}`; const im = IMG[base]; if (!im) return;
    const hp = p.health ?? 100; const dk = `${base}-dmg`;
    const pic = p.crashed ? (IMG[dk] ? planeVariant(dk, 'burnt') : planeVariant(base, 'burnt')) : hp < 60 ? (IMG[dk] || planeVariant(base, 'worn')) : im;
    const [w, h] = meta(base); const sc = 1 + Math.min(1.2, p.h / 260); const L = p.L * sc; const W = (L * w) / h;
    if (p.h > 0.5 || !p.ground) {
      const off = p.h * 0.45; ctx.save(); ctx.translate(p.x + off, p.y + off * 0.7); ctx.rotate(p.a + Math.PI / 2); ctx.globalAlpha = 0.28; ctx.drawImage(planeVariant(base, 'shadow'), -(p.L * w) / h / 2, -p.L / 2, (p.L * w) / h, p.L); ctx.restore();
    }
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a + Math.PI / 2); ctx.drawImage(pic, -W / 2, -L / 2, W, L);
    if (p.heli && !p.crashed && (p.eng > 0.05 || !p.ground)) {
      // rotor: disco translúcido girando por cima das pás desenhadas
      const r = W * 0.5; const ang = performance.now() / 40; ctx.globalAlpha = 0.22; ctx.fillStyle = '#e8eef8'; ctx.beginPath(); ctx.arc(0, -L * 0.1, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.55; ctx.strokeStyle = '#1d2333'; ctx.lineWidth = 1.6; for (let k = 0; k < 2; k++) { const a2 = ang + (k * Math.PI) / 2; ctx.beginPath(); ctx.moveTo(Math.cos(a2) * r, -L * 0.1 + Math.sin(a2) * r); ctx.lineTo(-Math.cos(a2) * r, -L * 0.1 - Math.sin(a2) * r); ctx.stroke(); }
    }
    ctx.restore();
    if (!p.crashed && hp < 60 && Math.random() < (hp < 30 ? 0.35 : 0.14)) puff(p.x - Math.cos(p.a) * p.L * 0.2 + (Math.random() - 0.5) * 6, p.y - Math.sin(p.a) * p.L * 0.2 - 2, hp < 30 ? 1.3 : 0.9);
    if (!p.crashed && hp < 30) { const f = fxFrame('fogo', performance.now() / 1000 + p.L, 1); if (f) ctx.drawImage(f, p.x - 5, p.y - 10 * sc, 10 * sc, 12 * sc); }
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
      for (const sc of blitzScene.values()) if (sc) for (const [x, y] of sc.cones) { if (!inV({ x, y })) continue; const cn = IMG['prisao/cone']; ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(x - 2.4, y - 0.6, 4.8, 1.4); if (cn) { const h = 8; const w = (h * cn.width) / cn.height; ctx.drawImage(cn, x - w / 2, y - h, w, h); } }
      for (const r of world.radars) { if (!inV({ x: r.at[0], y: r.at[1] })) continue; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#e11d48'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(r.at[0] + 18, r.at[1] - 18, 4.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#111'; ctx.font = 'bold 4.6px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(r.limit), r.at[0] + 18, r.at[1] - 17.7); ctx.fillStyle = '#334155'; ctx.fillRect(r.at[0] + 23, r.at[1] - 20, 4, 3); }
    }
    // objetos com profundidade (ordenados por y): pedestres, carros, aviões no chão, jogador
    const items = [];
    for (const p of P.peds) if (inV(p, 20)) items.push([p.y, 0, p]);
    for (const c of T.cars) if (inV(c)) items.push([c.y, 1, c]);
    for (const o of own) if (inV(o, 70) && !(o.kind === 'aviao' && !o.ground)) items.push([o.y, o.kind === 'aviao' ? 3 : 2, o]);
    for (const o of SKY.parked) if (inV(o, 90)) items.push([o.y, 3, o]);
    for (const w of SKY.walkers) if (w.delay <= 0 && inV(w, 20)) items.push([w.y, 5, w]);
    for (const a of ACC.S.actors) if (inV(a, 20)) items.push([a.y, 6, a]);
    for (const m of PR.members()) if (inV(m, 20)) items.push([m.y, 6, m]);
    for (const o of SKY.flights) if (o.ground && inV(o, 90)) items.push([o.y, 3, o]);
    items.push([me.y, 4, me]);
    items.sort((a, b) => a[0] - b[0]);
    for (const [, kind, o] of items) {
      if (kind === 0) drawPed(o, t);
      else if (kind === 1) {
        const dmg = (o.wrecked > 4 || o.smoke) && IMG[`cars/${o.sprite}-dmg`] ? `cars/${o.sprite}-dmg` : `cars/${o.sprite}`;
        drawVeh(o, dmg);
        if (o.beacon) { const on = Math.floor(t * 4) % 2; ctx.fillStyle = on ? '#ffb020' : '#6b4a00'; ctx.beginPath(); ctx.arc(o.x, o.y, 2.2, 0, Math.PI * 2); ctx.fill(); if (on) lights.push({ x: o.x, y: o.y, r: 20, color: '#ffb020', ka: 0.6, halo: 0.6 }); }
        if (o.siren) { const on = Math.floor(t * 6) % 2; const c1 = on ? '#ff3a3a' : '#3a7aff'; ctx.fillStyle = c1; ctx.beginPath(); ctx.arc(o.x, o.y, 2.4, 0, Math.PI * 2); ctx.fill(); lights.push({ x: o.x, y: o.y, r: 26, color: c1, ka: 0.7, halo: 0.7 }); }
        if (o.smoke && Math.random() < 0.08) puff(o.x, o.y - 4);
        if (night > 0.05 && !o.wrecked) addCarLights(lights, o);
      } else if (kind === 2) {
        const hp = o.health ?? 100;
        const key = hp < 35 && IMG[`cars/${o.sprite}-dmg`] ? `cars/${o.sprite}-dmg` : `cars/${o.sprite}`;
        if (o !== me.car) { ctx.strokeStyle = hp <= 0 ? '#ff4d5e' : '#2fd27a'; ctx.lineWidth = 1.1; ctx.setLineDash([2, 1.6]); ctx.beginPath(); ctx.arc(o.x, o.y, 15, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
        drawVeh(o, key); drawDoor(o);
        if (o.smokeT > 0) { o.smokeT -= 1 / 60; if (Math.random() < 0.12) puff(o.x + Math.cos(o.a) * o.L * 0.35, o.y + Math.sin(o.a) * o.L * 0.35 - 3, 0.8); }
        if (hp < 45 && Math.random() < (hp <= 0 ? 0.25 : 0.06)) puff(o.x + Math.cos(o.a) * o.L * 0.35, o.y + Math.sin(o.a) * o.L * 0.35 - 3, hp <= 0 ? 1.4 : 1);
        if (hp <= 0) { const f = fxFrame('fogo', t + o.L, 1); if (f) ctx.drawImage(f, o.x - 6 + Math.cos(o.a) * o.L * 0.3, o.y - 14 + Math.sin(o.a) * o.L * 0.3, 12, 14); }
        if (night > 0.05 && o === me.car) addCarLights(lights, o);
      } else if (kind === 3) drawPlane(o);
      else if (kind === 6 && o.react && (performance.now() - o.react.t0) / 1000 < (o.react.dur || 99)) reactChr(o.spr, o.x, o.y + 0.5, o.react.kind, (performance.now() - o.react.t0) / 1000, o.react.face || 1, 15);
      else if (kind === 6) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(o.x, o.y, 3.4, 1.4, 0, 0, Math.PI * 2); ctx.fill(); if (o.pose === 'maos') drawChr(o.spr, o.x, o.y + 0.5, 6, 1, 15); else if (o.run && o.to) drawChr(o.spr, o.x, o.y + 0.5, Math.cos(o.a) >= 0 ? 4 : 5, Math.floor(o.t / 5) % 4, 15); else drawChr(o.spr, o.x, o.y + 0.5, chrRow(o.a), o.to ? Math.floor(o.t / 3.2) % 4 : 0, 15); } // mãos para cima (assalto), correndo (fuga)
      else if (kind === 5) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(o.x, o.y, 3.4, 1.4, 0, 0, Math.PI * 2); ctx.fill(); drawChr(o.spr, o.x, o.y + 0.5, chrRow(o.a), Math.floor(o.t / 3.2) % 4, 15); }
      else drawMe(t);
    }
    // aviões em voo por cima de tudo (com sombra no chão)
    for (const o of own) if (o.kind === 'aviao' && !o.ground && inV(o, 200)) { drawPlane(o); if (night > 0.05) addPlaneLights(lights, o, t); }
    for (const o of SKY.flights) { if (!inV(o, 260)) continue; if (!o.ground) drawPlane(o); if (night > 0.05) addPlaneLights(lights, o, t); if (o.smoke && Math.random() < 0.5) particles.push({ x: o.x - Math.cos(o.a) * o.L * 0.5, y: o.y - Math.sin(o.a) * o.L * 0.5, vx: 0, vy: 0, t: 0, life: 2.2, s: 7 }); }
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
    // falas (motoristas, policial, curiosos, quem caiu)
    if (z >= 1.2) {
      const nowMs = performance.now(); const bub = (o, H) => { if (!o.say || o.say.until < nowMs || !inV(o, 0)) return; const [sx, sy] = S(o.x, o.y - H); balloon(sx, sy, o.say, nowMs); };
      for (const a of ACC.S.actors) bub(a, 22); for (const p of P.peds) if (p.say) bub(p, p.state === 'caido' || p.state === 'ferido' ? 9 : 22);
      // manifestação: cartazes balançando sobre as cabeças e palavras de ordem
      for (const m of PR.members()) { if (!inV(m, 0)) continue; if (m.sign) { const up = m.state === 'protesta' ? Math.abs(Math.sin(t * 3 + m.phase)) * 3 : 0; const [sx, sy] = S(m.x, m.y - 19 - up); ctx.fillStyle = '#7a5230'; ctx.fillRect(Math.round(sx) - 0.5, Math.round(sy), 1.4, 6 * z / 3); pill(sx, sy, m.sign, '#fdfdf7', '#b4121f', 8); } bub(m, 27); }
    }
    if (z >= 2.2) { let n = 0; for (const p of P.peds) { if (!p.real || p.state === 'levado' || !inV(p, 0) || n++ > 26) continue; const [sx, sy] = S(p.x, p.y - 17); pill(sx, sy, p.name.split(' ')[0], p.state === 'ferido' ? 'rgba(160,20,30,.85)' : 'rgba(10,13,43,.7)', '#fff', 9); } }
    for (const sc of blitzScene.values()) { if (!sc || !inV(sc.car, 0)) continue; const [sx, sy] = S(sc.car.x, sc.car.y - 22); pill(sx, sy, '🚓 BLITZ', '#b4121f', '#fff', 10); }
    for (const o of own) { if (o === me.car || o === me.plane || !inV(o, 0)) continue; const [sx, sy] = S(o.x, o.y - (o.kind === 'aviao' ? 30 : 19)); pill(sx, sy, `${o.school ? 'ESCOLA' : o.rental ? 'ALUGADO' : 'SEU'} · ${o.name.replace(' (alugado)', '')}${(o.health ?? 100) <= 0 ? ' (inutilizado)' : ''}`, (o.health ?? 100) <= 0 ? '#a3122a' : '#1f9d5a', '#fff', 10); }
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
    // mapa inteiro sem distorcer (faixas de mar nas sobras)
    const mb = R.bounds; const kk = Math.min(192 / (mb.x1 - mb.x0), 132 / (mb.y1 - mb.y0)); const kx = kk; const ky = kk; const mx = (192 - (mb.x1 - mb.x0) * kk) / 2; const my = (132 - (mb.y1 - mb.y0) * kk) / 2;
    mctx.fillStyle = '#2f6fd0'; mctx.fillRect(0, 0, 192, 132); mctx.imageSmoothingEnabled = true; mctx.drawImage(R.overview, mx, my, 192 - mx * 2, 132 - my * 2);
    const X = (v) => mx + (v - mb.x0) * kx; const Y = (v) => my + (v - mb.y0) * ky;
    mctx.strokeStyle = 'rgba(255,255,255,.9)'; mctx.lineWidth = 1; mctx.strokeRect(X(cam.x - cam.vw / 2 / cam.z), Y(cam.y - cam.vh / 2 / cam.z), (cam.vw / cam.z) * kx, (cam.vh / cam.z) * ky);
    for (const o of own) { mctx.fillStyle = (o.health ?? 100) <= 0 ? '#ff4d5e' : o.kind === 'aviao' ? '#f7c948' : '#2fd27a'; mctx.fillRect(X(o.x) - 2, Y(o.y) - 2, 4, 4); }
    for (const inc of INC.list) { mctx.fillStyle = '#ff4d5e'; mctx.beginPath(); mctx.arc(X(inc.x), Y(inc.y), 3, 0, Math.PI * 2); mctx.fill(); }
    for (const sc of blitzScene.values()) if (sc) { mctx.fillStyle = Math.floor(Date.now() / 400) % 2 ? '#ff3a3a' : '#3a7aff'; mctx.fillRect(X(sc.car.x) - 2, Y(sc.car.y) - 2, 4, 4); }
    if (INC.chase.on && INC.chase.car) { mctx.fillStyle = Math.floor(Date.now() / 250) % 2 ? '#3a7aff' : '#ff3a3a'; mctx.fillRect(X(INC.chase.car.x) - 2, Y(INC.chase.car.y) - 2, 4, 4); }
    const p = me.car || me.plane || me; mctx.fillStyle = '#38d6f5'; mctx.beginPath(); mctx.arc(X(p.x), Y(p.y), 3.2, 0, Math.PI * 2); mctx.fill(); mctx.strokeStyle = '#0a0d2b'; mctx.stroke();
  }
  mini.onclick = (e) => { const r = mini.getBoundingClientRect(); const mb = R.bounds; const kk = Math.min(192 / (mb.x1 - mb.x0), 132 / (mb.y1 - mb.y0)); const mx = (192 - (mb.x1 - mb.x0) * kk) / 2; const my = (132 - (mb.y1 - mb.y0) * kk) / 2; cam.follow = false; cam.x = cam.tx = mb.x0 + (((e.clientX - r.left) / r.width) * 192 - mx) / kk; cam.y = cam.ty = mb.y0 + (((e.clientY - r.top) / r.height) * 132 - my) / kk; };

  // ---------------- HUD
  let lastPrompt = ''; let lastDash = '';
  function hud() {
    const k = cityNow(); $('#d2Time').textContent = `${k.text}${k.day ? ` · Dia ${k.day}` : ''}`;
    const p = me.car || me.plane || me; $('#d2Reg').textContent = regionAt(p);
    stage.classList.toggle('driving', me.mode === 'car'); stage.classList.toggle('flying', me.mode === 'plane');
    let dash = '';
    if (me.car) { const c = me.car; const hp = Math.round(c.health ?? 100); dash = `<div class="d2-spd"><b>${Math.round(toKmh(c.v))}</b><small>km/h</small></div><div class="d2-gearv g-${c.gear}">${c.gear}</div><div class="d2-car"><small>Dirigindo</small><b>${esc(c.name)}</b><i class="d2-hp"><i style="width:${hp}%;background:${hp > 60 ? '#2fd27a' : hp > 25 ? '#f7c948' : '#ff4d5e'}"></i></i></div>`; $('#d2GearB span').textContent = c.gear; }
    else if (me.plane) {
      const pl = me.plane; const hp = Math.round(pl.health ?? 100); const vr = knots(vRotate(pl));
      const st = pl.ground ? (pl.heli ? (pl.lever > 0.2 ? 'Decolando' : 'No solo · abaixe a alavanca para subir') : knots(pl.v) >= vr ? 'Velocidade de decolagem! Abaixe a alavanca' : `No solo · decola a ${vr} nós`) : pl.vz > 3 ? 'Subindo' : pl.vz < -3 ? 'Descendo' : 'Nivelado';
      dash = `<div class="d2-spd"><b>${knots(pl.v)}</b><small>nós</small></div><div class="d2-spd"><b>${feet(pl.h)}</b><small>pés</small></div><div class="d2-car"><small>${st}</small><b>${esc(pl.name)}</b>
        <span class="d2-gauge"><em>motor</em><i class="d2-hp"><i style="width:${Math.round((pl.eng ?? pl.throttle) * 100)}%;background:#38d6f5"></i></i></span>
        <span class="d2-gauge"><em>alavanca</em><i class="d2-hp"><i style="width:${Math.round(Math.max(0, pl.lever) * 100)}%;background:#a78bfa"></i></i></span>
        <span class="d2-gauge"><em>saúde</em><i class="d2-hp"><i style="width:${hp}%;background:${hp > 60 ? '#2fd27a' : hp > 30 ? '#f7c948' : '#ff4d5e'}"></i></i></span></div>${pl.stall ? '<div class="d2-stall">ESTOL</div>' : ''}`;
    }
    if (dash !== lastDash) { lastDash = dash; const d = $('#d2Dash'); d.hidden = !dash; d.innerHTML = dash; }
    // no aeroporto: próximo voo (toque abre o painel)
    const air = $('#d2Air'); const inAir = regionAt(me.car || me.plane || me) === 'Aeroporto Nexus' && !ED.on && SKY.board;
    const nx = inAir ? SKY.board.flights.find((f) => !['Desembarcado', 'Em voo'].includes(f.status)) : null;
    const at = nx ? `✈ ${nx.num} · ${nx.kind === 'partida' ? 'para' : 'de'} ${nx.city} · ${hhmm(nx.at)} · ${nx.status}` : '';
    if (air.dataset.t !== at) { air.dataset.t = at; air.hidden = !at; air.textContent = at; }
    const sb = $('#d2Sky'); const ban = SKY.banner && SKY.banner.until > performance.now() ? SKY.banner.text : '';
    if (sb.dataset.t !== ban) { sb.dataset.t = ban; sb.hidden = !ban; sb.textContent = ban ? `✈ ${ban}` : ''; }
    jailHud();
    const ch = INC.chase; const wv = $('#d2Want');
    const lvl = Math.max(CARJ.level, ch.on ? ch.level : 0); wv.hidden = !lvl;
    if (lvl) { const html = `<b>🚨 ${ch.on ? 'PERSEGUIÇÃO' : 'PROCURADO'}</b><span>${'★'.repeat(Math.min(4, lvl))}${'☆'.repeat(Math.max(0, 4 - lvl))}</span><small>${ch.on ? (ch.lost > 0 ? `despistando… ${Math.ceil(12 - ch.lost)} s` : 'a viatura está atrás de você') : esc(CARJ.reason || 'evite as viaturas')}</small>`; if (wv.dataset.h !== html) { wv.dataset.h = html; wv.innerHTML = html; } }
    // interações
    let html = '';
    if (me.mode === 'foot' && !me.anim) {
      const n = nearest(own.filter((o) => !o.crashed), me, 46);
      if (n) { const o = n[0]; html = (o.health ?? 100) <= 0 ? `<button data-act="tow">${icon('wrench', 15)} Chamar reboque · ${esc(o.name)}</button>` : `<button data-act="enter">${icon(o.kind === 'aviao' ? 'rocket' : 'car', 15)} <b>E</b> ${o.kind === 'aviao' ? 'Pilotar' : 'Entrar no'} ${esc(o.name)}</button>${(o.health ?? 100) < 100 ? `<button data-act="tow">${icon('wrench', 15)} Reparar (${Math.round(o.health)}%)</button>` : ''}`; }
      const crashed = nearest(own.filter((o) => o.crashed), me, 80); if (crashed) html += `<button data-act="tow">${icon('wrench', 15)} Resgatar ${esc(crashed[0].name)}</button>`;
      const jk = !n && !me.jacking ? CARJ.canJack() : null; if (jk) html += `<button data-act="enter">${icon('car', 15)} <b>E</b> Roubar este carro</button>`;
      $('#d2EnterF').textContent = n && (n[0].health ?? 100) > 0 ? (n[0].kind === 'aviao' ? 'Pilotar' : 'Entrar') : jk ? 'Roubar' : 'Veículo';
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

  // ---------------- blitz policial (Aurora e Rodovia Aurora): agenda sorteada por dia da cidade; viatura com giroflex
  // no acostamento, cones e dois policiais. O policial manda parar, vem até a janela e pede a habilitação; o servidor
  // decide o desfecho (liberado, ou multa + ocorrência + detenção). Arrancar sem responder é fuga (multa e perseguição).
  const blitzScene = new Map();
  const BLZ = createBlitz({ spots: city.aurora?.blitz || [], notify, onStop: (b, car) => blitzApproach(b, car), onFlee: (b, car) => blitzFlee(b, car) });
  function blitzSetup(b) {
    const ln = nearestLane(world, b.at[0], b.at[1], (l) => !l.narrow && !l.inner); if (!ln) return null;
    const p = along(ln.lane.path, Math.min(ln.lane.path.len - 12, Math.max(12, ln.s)));
    const e = ln.lane.edge; const off = e.lanes >= 2 ? e.w * 0.37 : e.w * 0.24; const side = e.w / 2 - off + 7; // acostamento à direita
    const nx = -Math.sin(p.a); const ny = Math.cos(p.a); const cx = p.x + nx * side; const cy = p.y + ny * side; const ca = Math.cos(p.a); const sa = Math.sin(p.a);
    const car = { id: `blz-${b.id}`, sprite: 'city-policia', kind: 'policia', L: lengthOf('policia'), W: 12, x: cx, y: cy, a: p.a, v: 0, mode: 'parked', siren: true, job: { kind: 'blitz' }, driver: false };
    T.cars.push(car);
    const cones = [0, 1, 2, 3, 4].map((i) => [cx - ca * (24 + i * 11) - nx * (3 + i * 1.6), cy - sa * (24 + i * 11) - ny * (3 + i * 1.6)]);
    const mk = (x, y, a) => ({ spr: 'chr/policial', x, y, a, to: null, v: 9, face: null, say: null, name: 'Policial', t: 0, gone: false, onArrive: null });
    const o1 = mk(cx - ca * 16 - nx * 2, cy - sa * 16 - ny * 2, p.a + Math.PI); const o2 = mk(cx + ca * 16 + nx * 9, cy + sa * 16 + ny * 9, p.a + Math.PI / 2);
    ACC.S.actors.push(o1, o2);
    return { b, car, cones, o1, o2, home: [o1.x, o1.y] };
  }
  function blitzTeardown(sc) { if (!sc) return; const i = T.cars.indexOf(sc.car); if (i >= 0) T.cars.splice(i, 1); sc.o1.gone = true; sc.o2.gone = true; }
  const blitzReturn = (sc) => { if (!sc) return; sc.o1.v = 9; sc.o1.to = sc.home; sc.o1.onArrive = () => { sc.o1.face = null; }; };
  let blzT = 0;
  function blitzTick(dt) {
    blzT -= dt;
    if (blzT <= 0) {
      blzT = 1; const k = cityNow(); const act = BLZ.update(k.day || 0, k.hour);
      for (const b of act) if (!blitzScene.has(b.id)) blitzScene.set(b.id, blitzSetup(b));
      for (const [id, sc] of blitzScene) if (!act.some((x) => x.id === id) && BLZ.stage?.blitz.id !== id) { blitzTeardown(sc); blitzScene.delete(id); }
    }
    if (DET) return;
    const st = BLZ.step(me.car && !me.anim ? me.car : null);
    if (!st) return;
    const sc = blitzScene.get(st.blitz.id);
    if (st.phase === 'sinal' && sc && me.car) { sc.o1.face = [me.car.x, me.car.y]; if (!sc.o1.say || sc.o1.say.until < performance.now()) sc.o1.say = { text: 'Encoste o veículo!', emo: 'surpresa', until: performance.now() + 2200 }; }
    // abordagem em andamento: arrancar com o carro antes de responder é fuga
    if (st.phase === 'abordagem' && me.car && st.stopAt && Math.hypot(me.car.x - st.stopAt[0], me.car.y - st.stopAt[1]) > 40) blitzFlee(st.blitz, me.car);
  }
  function blitzApproach(b, car) {
    const st = BLZ.stage; st.stopAt = [car.x, car.y];
    const sc = blitzScene.get(b.id); if (!sc) { BLZ.finish(); return; }
    const [dx, dy] = doorPoint(car, 8);
    sc.o1.say = { text: 'Desligue o motor, por favor.', emo: 'neutro', until: performance.now() + 2400 };
    sc.o1.v = 24; sc.o1.to = [dx, dy]; sc.o1.onArrive = () => { sc.o1.face = [car.x, car.y]; if (BLZ.stage?.phase === 'abordagem') blitzPanel(b, sc, car); };
  }
  function blitzFlee(b, car) {
    stage.querySelector('.d2-blitz')?.remove(); BLZ.cool.set(b.id, performance.now() + 120000); BLZ.stage = null;
    blitzReturn(blitzScene.get(b.id)); fine('fuga'); INC.startChase(2, `Furou a blitz (${b.name})`, car);
  }
  function blitzPanel(b, sc, car) {
    stage.querySelector('.d2-talk')?.remove();
    const hr = cityNow().hour; const greet = hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite';
    const ask = `${greet}. Blitz da Polícia de Aurora. Habilitação e documento do veículo, por favor.`;
    const box = document.createElement('div'); box.className = 'd2-talk d2-blitz';
    box.innerHTML = `<div class="tk-head"><span class="bz-badge" aria-hidden="true">🚓</span><div><b>Policial · Blitz</b><small>${esc(b.name)} · ${esc(car.name || 'seu carro')}</small></div></div>
      <div class="tk-log" id="bzLog"><p class="tk-npc">Policial: ${esc(ask)}</p></div>
      <div class="tk-opts"><button data-o="entregar" class="tk-educada">Entregar habilitação</button><button data-o="sem" class="tk-neutra">Não tenho habilitação</button><button data-o="desacato" class="tk-agressiva">Desacato à autoridade</button></div>
      <div class="tk-foot"><small>Responda ao policial. Arrancar com o carro conta como fuga.</small></div>`;
    stage.appendChild(box);
    sc.o1.say = { text: ask, emo: 'neutro', until: performance.now() + balloonSecs(ask) * 1000 };
    const log = box.querySelector('#bzLog');
    box.querySelectorAll('[data-o]').forEach((btn) => { btn.onclick = async () => {
      box.querySelectorAll('[data-o]').forEach((x) => { x.disabled = true; });
      log.insertAdjacentHTML('beforeend', `<p class="tk-me">Você: ${esc(btn.textContent)}</p>`);
      let r;
      try { r = await api.post('/mundo/blitz/responder', { opcao: btn.dataset.o, local: b.name, veiculo: car.name }); }
      catch (err) { toast('Blitz', err.message, 'error'); box.remove(); BLZ.finish(); blitzReturn(sc); return; }
      log.insertAdjacentHTML('beforeend', `<p class="tk-npc">Policial: ${esc(r.fala)}</p>`); log.scrollTop = log.scrollHeight;
      sc.o1.say = { text: r.fala, emo: r.resultado === 'preso' ? 'irritado' : 'feliz', until: performance.now() + balloonSecs(r.fala) * 1000 };
      if (r.resultado === 'liberado') { toast('✅ Liberado(a)', `CNH categoria ${r.cnh?.categoria || 'B'} conferida. Boa viagem!`, 'success'); setTimeout(() => { box.remove(); BLZ.finish(); blitzReturn(sc); }, 1800); return; }
      toast('🚔 Detido(a) na blitz', `${r.multa.label}: ${r.multa.amount} NXC (Banco → Pendências)`, 'error'); refreshStatus(true);
      setTimeout(() => { box.remove(); BLZ.finish(); blitzReturn(sc); arrest(r.detention, car); }, 2400);
    }; });
  }
  // prisão: o carro fica retido no pátio perto da delegacia e o jogador é conduzido(a) à delegacia
  function arrest(det, car) {
    const ref = car || me.car || me; DET = det; const pol = stationNear('policia', ref.x, ref.y); if (!pol) return;
    if (car && me.car === car) { car.v = 0; car.door = 0; me.car = null; me.mode = 'foot'; me.anim = null; }
    const spot = city.spots.map((s) => [s, Math.hypot(s[0] - pol[0], s[1] - pol[1])]).sort((a, b) => a[1] - b[1])[0]?.[0];
    if (spot && car) { [car.x, car.y, car.a] = spot; car.v = 0; savePark(car); }
    [me.x, me.y] = nearestWalk(world, pol[0], pol[1] - 10, 60) || pol; cam.follow = true; flash = 1;
    toast('🚓 Conduzido(a) à delegacia', `${det.local}.${car ? ' Seu carro ficou no pátio ao lado.' : ''}`, 'warning');
  }
  const CELA = createCela();
  const celaMsg = () => { const m = $('#d2Jail .jl-m'); if (m) { const txt = CELA.msgUntil > performance.now() ? CELA.msg : 'Use as setas / WASD para andar pela cela.'; if (m.textContent !== txt) m.textContent = txt; } };
  function jailHud() {
    let el = $('#d2Jail');
    if (!DET) { el?.remove(); return; }
    const left = new Date(DET.until).getTime() - Date.now();
    if (left <= 0) { DET = null; el?.remove(); toast('🔓 Liberado(a)', 'Você cumpriu a detenção e saiu da delegacia.', 'success'); return; }
    if (!el) {
      el = document.createElement('div'); el.id = 'd2Jail'; el.className = 'd2-jail';
      el.innerHTML = `<b>🚔 Cela · ${esc(DET.local)}</b><small>${esc(DET.motivo)} · ${DET.dias ? `${DET.dias} dia(s) de pena` : 'porta trancada até cumprir o horário'}</small><span class="jl-t"></span><em class="jl-m"></em>${DET.bail ? `<button class="cx-btn" data-bail>Pagar fiança · ${DET.bail} NXC</button>` : ''}`;
      stage.appendChild(el);
      el.querySelector('[data-bail]')?.addEventListener('click', async () => { try { await api.post('/mundo/rua/fianca', {}); DET = null; el.remove(); toast('🔓 Fiança paga', 'Você saiu da cela. O inquérito continua.', 'success'); refreshStatus(true); } catch (err) { toast('Fiança', err.message, 'error'); } });
    }
    const s = Math.ceil(left / 1000); el.querySelector('.jl-t').textContent = `Liberação em ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} (horário real)`;
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
    stage.classList.toggle('jailed', Boolean(DET));
    if (DET) { CELA.step(dt, inp, performance.now()); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); CELA.draw(ctx, { W: cam.vw, H: cam.vh, img: (k) => IMG[k], chr: (key, x, y, row, fr, H) => drawChr(key, x, y, row, fr, H), mySpr: me.spr, guardSpr: 'chr/policial', t }); celaMsg(); hudT += dt; if (hudT > 0.12) { hudT = 0; hud(); } return; }
    stepAnim(dt);
    if (ED.on) { if (inp.mx || inp.my) cam.pan(-inp.mx * 700 * dt, -inp.my * 700 * dt); } else if (me.mode === 'car' && !me.anim) {
      const c = me.car; if (inp.gearTap) { inp.gearTap = false; }
      const v0 = c.v;
      stepCar(c, inp, world, dt, [...T.cars, ...own.filter((o) => o !== c && (o.kind === 'carro' || o.ground)), ...SKY.parked]);
      afterCrash(c, v0); hitPeds(c); enforce(t);
    } else if (me.mode === 'plane') {
      const pl = me.plane; const ev = stepPlane(pl, inp.plane, world, dt);
      if (ev?.damage) { pl.health = Math.max(0, (pl.health ?? 100) - ev.damage); flash = 0.6; saveDamage(pl); if (pl.health <= 0) { pl.crashed = true; planeCrash(pl, 'dano'); } else toast(`⚠ ${pl.name} danificado`, `${ev.why[0].toUpperCase()}${ev.why.slice(1)}: saúde ${Math.round(pl.health)}%. ${pl.health < 40 ? 'Pouse logo: o motor está falhando.' : 'Dá para continuar voando.'}`, 'warning'); }
      if (ev?.crash) planeCrash(pl, ev.crash);
      else if (ev?.landed) toast('Pouso perfeito ✈', `Bem-vindo(a) ao ${regionAt(pl).includes('Aurora') ? 'Aeroporto Aurora' : 'Aeroporto Nexus'}.`, 'success');
      cam.tz = (cam.userZ || 0) > performance.now() ? null : (touch ? 2.4 : 2.2) / (1 + pl.h / 220);
    } else if (me.mode === 'foot' && !me.anim && !DET && !me.jacking) { const ox = me.x; const oy = me.y; const pedsNear = P.peds.filter((q) => (q.state === 'walk' || q.state === 'olhando' || q.state === 'wait') && Math.abs(q.x - me.x) < 12 && Math.abs(q.y - me.y) < 12).map((q) => ({ x: q.x, y: q.y, L: 5 }));
      stepWalker(me, inp, world, dt, [...T.cars, ...own.filter((o) => o.kind === 'carro' || o.ground), ...SKY.parked, ...(inp.run ? [] : pedsNear)]);
      // esbarrões: correndo derruba (inconsciente, sentado sangrando ou morte); andando, o morador discute;
      // num policial (morador policial ou policial a pé das cenas) é agressão a policial
      if (me.moving) {
        for (const q of P.peds) if (['walk', 'olhando', 'wait', 'cross', 'conversa'].includes(q.state) && Math.hypot(q.x - me.x, q.y - me.y) < (me.run ? 5.5 : 6.6)) { if (me.run) { if (STREET.knock(q)) me.walkT += 1; } else if ((q.x - me.x) * Math.cos(me.a) + (q.y - me.y) * Math.sin(me.a) > 0) STREET.bump(q); }
        for (const a of ACC.S.actors) if (!a.gone && /policial/.test(a.spr) && Math.hypot(a.x - me.x, a.y - me.y) < 6) STREET.officer(a);
      }
      me.walkT += Math.hypot(me.x - ox, me.y - oy) / (me.run ? 5 : 3.2); } // um quadro a cada ~3 unidades andadas (correndo, passadas maiores)
    const viewC = { x: cam.x, y: cam.y, r: Math.max(cam.vw, cam.vh) / cam.z / 2 + 60 };
    const crossing = stepPeds(P, world, dt, t, [...T.cars, ...(me.car ? [me.car] : [])], viewC);
    TALKS.scan(dt, viewC); TALKS.tick(dt); STREET.step(dt, viewC); CARJ.step(dt, viewC); // ocorrências de rua, roubos e procurado // conversas entre moradores que se encontram na rua
    const extra = [...own.filter((o) => o !== me.car && (o.kind === 'carro' || o.ground)).map((o) => ({ x: o.x, y: o.y, a: o.a, L: o.L, W: o.W })), ...(me.car ? [me.car] : []), ...(me.mode === 'foot' && canDrive(at(world, me.x, me.y)) ? [{ x: me.x, y: me.y, L: 5, W: 5, state: 'me' }] : []), ...P.peds.filter((p) => ['cross', 'ferido', 'jay', 'roda', 'volta', 'caido'].includes(p.state)).map((p) => ({ x: p.x, y: p.y, L: 6, W: 7, state: 'ped' })), ...ACC.S.actors.map((a) => ({ x: a.x, y: a.y, L: 5, W: 6, state: 'ped' }))];
    const tS = performance.now(); stepTraffic(T, world, dt, t, { extra, crossing, view: viewC }); perf.sim = (perf.sim || 0) + performance.now() - tS;
    if (INC.chase.on) INC.stepChase(dt, me, world, [...T.cars.filter((c) => c !== INC.chase.car), ...own.filter((o) => o !== me.car)]);
    blitzTick(dt);
    INC.step(dt, me); SKY.step(dt, cityNow().hour); ACC.step(dt, viewC); PR.step(dt, viewC, cityNow().hour); if (PR.banner && PR.banner.until > performance.now() && (!SKY.banner || SKY.banner.until < performance.now())) SKY.banner = PR.banner;
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
  $('#d2Air').onclick = () => flightPanel();
  window.__d2 = { me, own, T, P, world, city, cam, input, act, perf, INC, R, ED, SKY, ACC, PR, viewNow, TALKS, talkPanel, STREET, BLZ, TR, CITY, CARJ, blitzScene, blitzSetup, get DET() { return DET; } };
  if (params.has('reforma')) setTimeout(() => ED.open(reforma, params.get('item')), 50); // inspeção (testes automáticos)
  if (!touch) setTimeout(() => $('#d2Help')?.classList.add('fade'), 10000);
  if (touch && !localStorage.getItem('codeniac.runhint')) { localStorage.setItem('codeniac.runhint', '1'); setTimeout(() => toast('Correr', 'Toque duas vezes no joystick e segure para correr.', 'info'), 2500); }
  return () => { alive = false; clearInterval(boardTimer); cancelAnimationFrame(raf); ro.disconnect(); input.destroy(); ED.destroy(); document.removeEventListener('fullscreenchange', fsOff); if (window.__d2?.me === me) delete window.__d2; if (me.car) savePark(me.car); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); };
}
export { canWalk, WATER, RUNWAY, gather };
