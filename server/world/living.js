// CIDADE VIVA — casas dos moradores, rotinas diárias e movimento pelas ruas, mais o feed "ao vivo".
// A posição de cada morador é uma função do horário e da rotina dele (casa → trabalho → lazer → casa): nada
// precisa ser guardado nem simulado passo a passo, então centenas de pessoas andam de graça e o resultado
// é o mesmo para qualquer pessoa que olhe o mapa no mesmo instante.
import { onTick, onUpgrade, services } from './core.js';
import { people, residents, personById, agentOf, isAwake, localHour } from './agents.js';
import { places, PLACE_CATS } from './commerce.js';
import { freeNode, pos, address, districtOfNode, walkPath, pointAlong, METERS_PER_UNIT } from './map.js';
import { companyById } from './economy.js';
import { uid, nowIso, HOUR, MIN, DAY, cap } from './util.js';

// ---------------------------------------------------------------- utilidades determinísticas
function h32(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// velocidades em unidades do mapa por minuto
const WALK_UPM = 80 / METERS_PER_UNIT; // a pé: 80 m/min
const CAR_UPM = 420 / METERS_PER_UNIT; // de carro/ônibus: 420 m/min
const CAR_AFTER = 140; // acima disso (unidades) a pessoa vai de carro ou ônibus

// ---------------------------------------------------------------- casas
const HOUSE_KIND = { nobre: 'mansao', popular: 'casa-simples', centro: 'apartamento', tecnologia: 'apartamento' };
export const houses = (w) => (w.city.houses ??= []);

// cada morador tem uma casa no mapa, no bairro dele; novas pessoas ganham a sua quando chegam
export function homeOf(w, p) {
  const a = p.agent;
  if (a.houseId && a.homeNode != null) return a.homeNode;
  const used = new Set([...places(w).map((x) => x.node), ...houses(w).map((h) => h.node)]);
  let node = a.homeNode;
  if (node == null || used.has(node)) node = freeNode(w, a.districtId || 'centro', { used });
  const [x, y] = pos(w, node);
  const d = (w.city.districts || []).find((q) => q.id === (districtOfNode(w, node) || a.districtId));
  const h = { id: uid(), ownerId: p.id, node, x, y, districtId: d?.id || a.districtId || 'centro', kind: HOUSE_KIND[d?.kind] || 'casa', address: address(w, node), since: nowIso() };
  houses(w).push(h);
  a.homeNode = node; a.houseId = h.id;
  return node;
}
onUpgrade(12, (ctx) => {
  const w = ctx.w; if (!w.city) return;
  for (const p of residents(w)) homeOf(w, p);
});

// ---------------------------------------------------------------- lugares de lazer
const LEISURE = { restaurante: 3, cafe: 3, bar: 2, parque: 2, academia: 2, cinema: 1.4, shopping: 2, mercado: 2, padaria: 1.2, turismo: 1, clube: 1, salao: 0.4, farmacia: 0.5, estadio: 0.4 };
const VERB = { restaurante: 'comendo em', cafe: 'tomando café em', bar: 'no bar', parque: 'passeando em', academia: 'treinando em', cinema: 'no cinema', shopping: 'fazendo compras em', mercado: 'fazendo compras em', padaria: 'na padaria', turismo: 'passeando em', clube: 'no clube', salao: 'em', farmacia: 'na farmácia', estadio: 'no estádio' };
function openAtHour(pl, h) {
  if (['fechado', 'interditado', 'falido'].includes(pl.status)) return false;
  const [o, c] = pl.hours || PLACE_CATS[pl.kind]?.hours || [0, 24];
  if (o === 0 && c === 24) return true;
  return o < c ? h >= o && h < c : h >= o || h < c;
}
function pickLeisure(w, rng, homeXY, hour, stayH, { kinds = null, maxDist = null } = {}) {
  const cand = places(w).filter((pl) => LEISURE[pl.kind] && (!kinds || kinds.includes(pl.kind)) && !pl.hidden && pl.node != null && openAtHour(pl, hour) && openAtHour(pl, hour + stayH) && (!maxDist || Math.hypot(pl.x - homeXY[0], pl.y - homeXY[1]) <= maxDist));
  if (!cand.length) return null;
  const wt = cand.map((pl) => {
    let k = LEISURE[pl.kind];
    if (pl.kind === 'bar' && hour < 17) k *= 0.1;
    if (pl.kind === 'cinema' && hour < 13) k *= 0.1;
    if (pl.kind === 'padaria' && hour > 11) k *= 0.3;
    if (pl.kind === 'academia' && (hour < 6 || hour > 21)) k *= 0.3;
    const d = Math.hypot(pl.x - homeXY[0], pl.y - homeXY[1]);
    return k / (1 + d / 260); // gente frequenta o que fica perto de casa
  });
  const tot = wt.reduce((s, x) => s + x, 0); let r = rng() * tot;
  for (let i = 0; i < cand.length; i++) { r -= wt[i]; if (r <= 0) return cand[i]; }
  return cand.at(-1);
}

// ---------------------------------------------------------------- plano do dia
const plans = new Map();
function placeOfCompany(w, p) {
  const a = p.agent; if (!a.companyId) return null;
  const list = places(w).filter((pl) => pl.companyId === a.companyId && pl.node != null && !pl.hidden);
  return list.length ? list[h32(p.id) % list.length] : null;
}
function buildPlan(w, p, ds) {
  const a = p.agent; const tz = (p.tz ?? -3) * HOUR;
  const rng = mulberry(h32(`${p.id}:${ds}`));
  const T = (h) => ds + h * HOUR;
  const home = homeOf(w, p); const homeXY = pos(w, home);
  const dow = new Date(ds + tz + 12 * HOUR).getUTCDay(); const dowPrev = (dow + 6) % 7;
  const { wake, workStart: ws, workEnd: we } = a.routine; const sleepH = Math.min(a.routine.sleep >= 24 ? 23.5 : a.routine.sleep, 23.5);
  const workPl = placeOfCompany(w, p);
  const night = Boolean(workPl) && we < ws;
  const worksToday = Boolean(workPl) && dow !== 0; const workedYesterday = Boolean(workPl) && dowPrev !== 0;
  const HOME = { node: home, kind: 'home', place: null };
  const WORK = workPl ? { node: workPl.node, kind: 'work', place: workPl } : null;
  const segs = [];
  let cur = night && workedYesterday ? WORK : HOME; let t = ds;
  const stayUntil = (until) => { if (until > t) { segs.push({ t0: t, t1: until, type: 'stay', node: cur.node, kind: cur.kind, place: cur.place }); t = until; } };
  const leg = (from, to) => {
    if (from.node === to.node) return null;
    // o hub da busca é sempre o lugar, nunca a casa (uma busca atende todos os moradores do lugar)
    const toHome = to.kind === 'home';
    const path = toHome ? walkPath(w, to.node, from.node) : walkPath(w, from.node, to.node);
    if (!path) return null;
    const mode = path.len > CAR_AFTER ? 'carro' : 'a pé';
    const dur = Math.max(20000, (path.len / (mode === 'carro' ? CAR_UPM : WALK_UPM)) * MIN);
    return { path, reverse: toHome, mode, dur };
  };
  const travel = (to, departAt, label) => {
    const l = leg(cur, to);
    if (!l) { stayUntil(Math.max(t, departAt)); cur = to; return; }
    stayUntil(Math.max(t, departAt));
    segs.push({ t0: t, t1: t + l.dur, type: 'move', path: l.path, reverse: l.reverse, mode: l.mode, label, to: to.place ? to.place.name : null, toKind: to.kind });
    t += l.dur; cur = to;
  };
  const durOf = (from, to) => leg(from, to)?.dur ?? 0;
  // um passeio: vai, fica um tempo e volta para casa (ou segue para o trabalho)
  const outing = (fromT, deadlineT, then, opts = {}) => {
    const stayMin = opts.stayMin || 40 + Math.floor(rng() * 110);
    const startH = (Math.max(t, fromT) - ds) / HOUR;
    const pl = pickLeisure(w, rng, opts.around || homeXY, startH, stayMin / 60, opts);
    if (!pl) return false;
    const spot = { node: pl.node, kind: 'leisure', place: pl };
    const go = durOf(cur, spot); const back = durOf(spot, then);
    const depart = Math.max(t, fromT);
    if (depart + go + stayMin * MIN + back > deadlineT) return false;
    travel(spot, depart, `indo para ${pl.name}`);
    stayUntil(t + stayMin * MIN);
    return true;
  };
  // almoço perto do trabalho: sai, come e volta
  const lunch = () => {
    if (!WORK || rng() > 0.8) return;
    const at = T(ws + 4 + rng() * 1.2);
    if (t > at) return;
    const wxy = pos(w, WORK.node);
    stayUntil(at);
    if (outing(at, at + 90 * MIN, WORK, { kinds: ['restaurante', 'cafe', 'padaria', 'mercado', 'shopping'], around: wxy, maxDist: 520, stayMin: 35 + Math.floor(rng() * 30) })) travel(WORK, t, 'voltando ao trabalho');
  };

  if (night) {
    if (workedYesterday) { stayUntil(T(we)); travel(HOME, T(we), 'voltando para casa'); }
    // antes do turno: às vezes um passeio
    const toWork = durOf(HOME, WORK);
    if (worksToday) {
      if (rng() < 0.6) outing(T(wake + 0.7), T(ws) - toWork - 20 * MIN, HOME);
      if (cur.kind !== 'home') travel(HOME, t, 'voltando para casa');
      travel(WORK, T(ws) - toWork, 'a caminho do trabalho');
    }
  } else if (worksToday) {
    const toWork = durOf(HOME, WORK);
    travel(WORK, Math.max(T(wake + 0.4), T(ws) - toWork), 'a caminho do trabalho');
    lunch();
    stayUntil(T(we));
    if (rng() < 0.7 && outing(T(we) + 10 * MIN, T(sleepH - 0.6), HOME)) { if (rng() < 0.35) outing(t + 10 * MIN, T(sleepH - 0.6), HOME); }
    if (cur.kind !== 'home') travel(HOME, t, 'voltando para casa');
  } else {
    // dia livre: até dois passeios
    if (rng() < 0.8) outing(T(wake + 0.8), T(12), HOME);
    if (cur.kind !== 'home') travel(HOME, t, 'voltando para casa');
    if (rng() < 0.75) outing(T(12.5), T(17), HOME);
    if (cur.kind !== 'home') travel(HOME, t, 'voltando para casa');
    if (rng() < 0.6) outing(T(17.5), T(Math.min(sleepH - 0.5, 22.5)), HOME);
    if (cur.kind !== 'home') travel(HOME, t, 'voltando para casa');
  }
  stayUntil(ds + DAY);
  return segs;
}
function planOf(w, p, ds) {
  const a = p.agent; const key = `${p.id}|${ds}|${a.companyId || ''}|${a.routine.wake}|${a.routine.workStart}|${a.homeNode}`;
  let plan = plans.get(key);
  if (!plan) { plan = buildPlan(w, p, ds); if (plans.size > 20000) plans.clear(); plans.set(key, plan); }
  return plan;
}

// ---------------------------------------------------------------- onde cada um está agora
const kindVerb = (pl) => VERB[pl.kind] || 'em';
function describe(p, seg, t) {
  if (seg.type === 'move') return seg.label;
  if (seg.kind === 'home') return isAwake(p, new Date(t)) ? 'em casa' : 'dormindo';
  if (seg.kind === 'work') return `trabalhando${seg.place ? ` em ${seg.place.name}` : ''}`;
  return `${kindVerb(seg.place)} ${seg.place.name}`.replace(/ em em /, ' em ');
}
export function whereIs(w, p, t = Date.now()) {
  const a = p.agent;
  if (!a?.resident || a.status === 'saiu') return null;
  if (a.status === 'preso') { const st = places(w).find((x) => x.kind === 'delegacia'); return st ? { x: st.x, y: st.y, moving: false, doing: 'detida(o) na delegacia', place: st.name, placeId: st.id } : null; }
  if (a.status !== 'ativo') return null;
  const tz = (p.tz ?? -3) * HOUR; const ds = Math.floor((t + tz) / DAY) * DAY - tz;
  const plan = planOf(w, p, ds);
  const seg = plan.find((s) => t >= s.t0 && t < s.t1) || plan.at(-1);
  if (!seg) return null;
  if (seg.type === 'move') {
    const f = (t - seg.t0) / (seg.t1 - seg.t0);
    const q = pointAlong(seg.path, f * seg.path.len, seg.reverse);
    return { x: q.x, y: q.y, moving: true, dir: q.dir, mode: seg.mode, doing: seg.label, place: seg.to, seg, t0: seg.t0, t1: seg.t1 };
  }
  const [x, y] = pos(w, seg.node);
  return { x, y, moving: false, doing: describe(p, seg, t), place: seg.place?.name || (seg.kind === 'home' ? 'em casa' : null), placeId: seg.place?.id || null, seg, t0: seg.t0, t1: seg.t1 };
}

// moradores que aparecem na área visível, com os próximos segundos para o navegador animar
export function peopleView(w, { bbox = null, t = Date.now(), horizon = 6000, limit = 360, knownIds = null } = {}) {
  const out = [];
  for (const p of residents(w)) {
    const here = whereIs(w, p, t); if (!here) continue;
    if (bbox && (here.x < bbox[0] || here.x > bbox[2] || here.y < bbox[1] || here.y > bbox[3])) continue;
    let wp = null;
    if (here.moving) { wp = []; for (const dt of [horizon / 3, (2 * horizon) / 3, horizon]) { const f = whereIs(w, p, t + dt); if (f) wp.push([Math.round(f.x * 10) / 10, Math.round(f.y * 10) / 10]); } }
    out.push({ id: p.id, name: p.name, avatar: p.avatar, color: p.color, x: Math.round(here.x * 10) / 10, y: Math.round(here.y * 10) / 10, wp, moving: here.moving, mode: here.mode || null, doing: here.doing, place: here.place || null,
      friend: Boolean(p.friend), known: Boolean(p.agent.user?.metAt), job: p.job || null });
  }
  out.sort((a, b) => (b.moving - a.moving) || (b.known - a.known));
  return out.slice(0, limit);
}

// ---------------------------------------------------------------- feed ao vivo
export const live = (w) => (w.live ??= { last: 0, items: [] });
export function liveEvent(w, ev) {
  const L = live(w);
  L.items.push({ id: uid(), at: nowIso(), ...ev });
  cap(L.items, 150);
}
services.live = liveEvent;
function segAt(plan, t) { return plan.find((s) => t >= s.t0 && t < s.t1) || null; }
// detecta chegadas e saídas olhando só para o que mudou desde o último instante
onTick((ctx) => {
  const w = ctx.w; if (!w.city) return;
  const L = live(w); const now = Date.now(); const last = L.last || now; L.last = now;
  if (now - last > 5 * MIN || now <= last) return; // depois de ficar fora, não despeja a história toda no feed
  for (const p of residents(w)) {
    const a = p.agent; if (a.status !== 'ativo') continue;
    const tz = (p.tz ?? -3) * HOUR; const ds = Math.floor((now + tz) / DAY) * DAY - tz;
    if (Math.floor((last + tz) / DAY) !== Math.floor((now + tz) / DAY)) continue;
    const plan = planOf(w, p, ds);
    const s0 = segAt(plan, last); const s1 = segAt(plan, now);
    if (!s0 || !s1 || s0 === s1) continue;
    if (s0.type === 'move' && s1.type === 'stay' && s1.place && s1.kind !== 'home') liveEvent(w, { kind: 'entrada', personaId: p.id, name: p.name, placeId: s1.place.id, placeName: s1.place.name, text: 'entrou em' });
    else if (s0.type === 'stay' && s0.place && s0.kind !== 'home' && s1.type === 'move') liveEvent(w, { kind: 'saida', personaId: p.id, name: p.name, placeId: s0.place.id, placeName: s0.place.name, text: 'saiu de' });
  }
});

// ---------------------------------------------------------------- dados públicos das casas
export function housesPublic(w) {
  return houses(w).map((h) => ({ id: h.id, x: h.x, y: h.y, kind: h.kind, districtId: h.districtId }));
}
export function housePublic(w, id) {
  const h = houses(w).find((x) => x.id === id); if (!h) return null;
  const owner = personById(w, h.ownerId);
  const known = Boolean(owner?.agent?.user?.metAt);
  return { id: h.id, kind: h.kind, address: h.address, districtId: h.districtId, owner: known && owner ? { id: owner.id, name: owner.name, avatar: owner.avatar, color: owner.color } : null };
}
void companyById; void localHour;
