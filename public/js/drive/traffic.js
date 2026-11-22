// TrafficSystem — IA de trânsito. Cada carro é uma máquina de estados (cruise, segue, parado-sinal,
// aguarda-cruzamento, troca-faixa, ultrapassa, abre-passagem, bloqueado, retorno, cena, batido) que anda pelas
// faixas do grafo de ruas (mão direita).
//  • Percepção: procura obstáculos AO LONGO DO TRAJETO real (resto da faixa + curva do cruzamento + começo da próxima
//    faixa), numa grade espacial — vê carros na curva, no cruzamento e na rotatória, não só num cone reto.
//  • Aceleração: modelo IDM (Intelligent Driver Model): distância mínima + tempo de segurança × velocidade, aproximação
//    suave do carro da frente, sem frenagem brusca desnecessária; tempo de reação por perfil de motorista.
//  • Cruzamentos: reserva por movimento — só entra quem não cruza a trajetória de quem já está dentro e quando há espaço
//    na saída (não bloqueia o cruzamento). Semáforo, PARE (parada completa), faixa de pedestre e prioridade da sirene.
//  • Faixas: troca segura nas vias de 4 faixas; ultrapassagem pela contramão só com a contramão livre; retorno quando a
//    via está bloqueada e não há como passar. Rotas e escolhas evitam ruas com bloqueio (cityevents.js).
//  • Trava final: depois de andar, se o carro passaria a sobrepor outro veículo (ou pessoa), o movimento é desfeito.
//    Nenhum carro atravessa outro (só o motorista distraído das cenas de acidente pode encostar — é a batida).
import { along, turnPath, lightState, routeNodes, stepSmartLights } from './world.js';
import { obb } from './obst.js';
import { CITY } from './cityevents.js';
import { medidas, CIVIS, UTILITARIOS, CAMINHOES, TAXIS, ESPECIAIS, SERVICO } from './frota.js';

const LEN = { carro: 22, taxi: 22, policia: 23, ambulancia: 25, bombeiros: 30, caminhao: 30, van: 25, moto: 12, meu: 22, coleta: 30, guincho: 30 };
// comprimento/largura: pela proporção real do sprite da frota nova; sem sprite conhecido, pelo tipo
export const lengthOf = (kind, sprite = null) => medidas(sprite)?.L ?? LEN[kind] ?? 22;
export const widthOf = (kind, sprite = null) => medidas(sprite)?.W ?? (kind === 'moto' ? 6 : 12);
const KMH = 0.72; // unidades/s → km/h (1 unidade ≈ 0,2 m)
export const toKmh = (v) => Math.abs(v) * KMH;
const CIVIL = CIVIS; // frota nova (public/assets/mundo/veiculos)
// viaturas de emergência: modelos com quadros de porta (abre/fecha); demais serviços da frota nova
export const SPRITES = { policia: ['city-policia'], ambulancia: ['city-ambulancia'], bombeiros: ['city-bombeiros'], taxi: TAXIS, guincho: ['truck-cab-sx'], coleta: [SERVICO.coleta], onibus: [SERVICO.onibus] };
export const spriteOf = (kind) => { const l = SPRITES[kind]; return l ? l[Math.floor(Math.random() * l.length)] : kind; };
const BIG = [['city-bombeiros', 'bombeiros', 0.012], ...TAXIS.map((t) => [t, 'taxi', 0.07]), ...UTILITARIOS.map((u) => [u, 'van', 0.035]), ...CAMINHOES.map((c) => [c, 'caminhao', 0.02]),
  [SERVICO.coleta, 'coleta', 0.02], [SERVICO.onibus, 'caminhao', 0.02], ...ESPECIAIS.map((e) => [e, 'carro', 0.01])];
export function pickTraffic(i) {
  if (i === 0 || i === 1) return { sprite: spriteOf('policia'), kind: 'policia' }; // duas viaturas patrulhando
  let r = Math.random();
  for (const [s, k, p] of BIG) { if (r < p) return { sprite: s, kind: k }; r -= p; }
  return { sprite: CIVIL[Math.floor(Math.random() * CIVIL.length)], kind: 'carro' };
}

// perfis de motorista: v (fator da velocidade), T (s de distância de segurança), s0 (folga parado), a/b (aceleração e
// frenagem confortável), react (tempo de reação, s), amarelo (passa no amarelo), vermelho (chance de furar),
// ultrapassa (vontade de ultrapassar um obstáculo), peso (parcela da população)
export const PROFILES = {
  cauteloso: { name: 'Cauteloso', v: 0.82, T: 1.9, s0: 9, a: 18, b: 26, react: 0.9, amarelo: false, vermelho: 0, ultrapassa: 0.15, peso: 0.25 },
  comum: { name: 'Comum', v: 0.95, T: 1.4, s0: 7, a: 24, b: 32, react: 0.6, amarelo: false, vermelho: 0, ultrapassa: 0.4, peso: 0.45 },
  apressado: { name: 'Apressado', v: 1.08, T: 1.0, s0: 6, a: 30, b: 38, react: 0.45, amarelo: true, vermelho: 0.02, ultrapassa: 0.8, peso: 0.22 },
  imprudente: { name: 'Imprudente', v: 1.2, T: 0.75, s0: 5, a: 34, b: 44, react: 0.35, amarelo: true, vermelho: 0.18, ultrapassa: 1, peso: 0.08 },
};
// parâmetros gerais (configuráveis)
export const TRAFFIC = { hardBrake: 90, look: 140, laneChange: 1.6, stopHold: 0.7, gridCell: 64, blockAfter: 3, overtakeClear: 150, uturnAfter: 16, stuckRespawn: 30, sirenReach: 130, curbLat: 6, spread: true, starve: 10 };
export function pickProfile(r = Math.random()) { for (const [k, p] of Object.entries(PROFILES)) { if (r < p.peso) return k; r -= p.peso; } return 'comum'; }

// ---------------------------------------------------------------- preparação do grafo (uma vez por mundo)
export function laneInit(world) {
  if (world._tinit) return; world._tinit = true;
  for (const n of Object.values(world.nodes)) { n.box = new Set(); n.stop = !n.light && n.out.length > 2 && !['round', 'corner', 'exit'].includes(n.kind); }
  for (const l of world.lanes) {
    l.sib = world.lanes.find((o) => o !== l && o.edge === l.edge && o.from === l.from && Boolean(o.inner) !== Boolean(l.inner)) || null; // faixa ao lado, mesmo sentido
    l.rev = world.lanes.find((o) => o.edge === l.edge && o.from === l.to && !o.inner) || null; // contramão (faixa da direita do outro sentido)
  }
  world.conflictCache = new Map();
  world.penalty = (l) => (CITY.blocked(l) ? 3000 : 0); // rotas (Dijkstra) desviam de faixas bloqueadas
}
let PID = 0; const tp = (world, a, b) => { const p = turnPath(world, a, b); if (p.id == null) { p.id = ++PID; p.from = a; p.to = b; } return p; };
// pontos que o carro ocupa num movimento: fim da chegada (a traseira ainda está lá) + curva + começo da saída
function swept(p) {
  if (p.samp) return p.samp; const out = [];
  if (p.from) for (let s = Math.max(0, p.from.path.len - 12); s <= p.from.path.len; s += 4) { const q = along(p.from.path, s); out.push([q.x, q.y]); }
  for (let s = 0; s <= p.len; s += 4) { const q = along(p, s); out.push([q.x, q.y]); }
  if (p.to) for (let s = 0; s <= Math.min(12, p.to.path.len); s += 4) { const q = along(p.to.path, s); out.push([q.x, q.y]); }
  return (p.samp = out);
}
// duas trajetórias do mesmo cruzamento se cruzam? (amostras a menos de 24: dois carros de 22×12 se tocam até 25 entre os centros)
function conflict(world, p1, p2) {
  if (p1 === p2) return true;
  const key = p1.id < p2.id ? `${p1.id}|${p2.id}` : `${p2.id}|${p1.id}`; let r = world.conflictCache.get(key);
  if (r != null) return r;
  r = false; const A = swept(p1); const B = swept(p2);
  for (const q1 of A) { for (const q2 of B) if (Math.abs(q1[0] - q2[0]) < 24 && Math.abs(q1[1] - q2[1]) < 24 && Math.hypot(q1[0] - q2[0], q1[1] - q2[1]) < 24) { r = true; break; } if (r) break; }
  world.conflictCache.set(key, r); return r;
}

export function createTraffic(world, { count, near } = {}) {
  laneInit(world);
  const cars = [];
  const lanes = world.lanes.filter((l) => !l.narrow && l.path.len > 30);
  // sem vias (mapa vazio ou sem ruas), não há trânsito: o mapa continua funcionando sem carros
  if (!lanes.length) return { cars, lanes, placeCar: () => false, add: () => null };
  // coloca o carro numa faixa (de preferência perto da câmera, mas fora da tela) sem encostar em ninguém
  const placeCar = (c, view) => {
    for (let k = 0; k < 60; k++) {
      const l = lanes[Math.floor(Math.random() * lanes.length)];
      const s = 8 + Math.random() * Math.max(1, l.path.len - 16); const p = along(l.path, s);
      if (view) { const d = Math.hypot(p.x - view.x, p.y - view.y); if (d < view.r || d > view.r + 900) continue; }
      if (cars.some((o) => o !== c && Math.hypot(o.x - p.x, o.y - p.y) < 40)) continue;
      c.lane?.to?.box?.delete(c); c.res = null;
      Object.assign(c, { lane: l, s, turn: null, next: null, ts: 0, x: p.x, y: p.y, a: p.a, v: 10 + Math.random() * 10, wait: 0, far: 0, lat: 0, latT: 0, lc: null, passing: null, stopT: 0, st: 'cruise', stuck: 0, perc: null });
      return true;
    }
    return false;
  };
  const add = (spec, view) => {
    const prof = spec.extra?.prof || pickProfile();
    const c = { id: `t${cars.length}${Math.random().toString(36).slice(2, 6)}`, sprite: spec.sprite, kind: spec.kind, L: lengthOf(spec.kind, spec.sprite), W: widthOf(spec.kind, spec.sprite), maxV: ['caminhao', 'coleta', 'bombeiros'].includes(spec.kind) ? 40 : 46 + Math.random() * 8, driver: true, prof, ...spec.extra };
    if (placeCar(c, view)) { cars.push(c); return c; }
    return null;
  };
  for (let i = 0; i < count; i++) add(pickTraffic(i), near);
  return { cars, placeCar, add, lanes };
}

// ---------------------------------------------------------------- grade espacial (vizinhos sem varrer todos)
function buildGrid(list, cell) {
  const g = new Map();
  for (const o of list) { const k = `${Math.floor(o.x / cell)},${Math.floor(o.y / cell)}`; let l = g.get(k); if (!l) g.set(k, (l = [])); l.push(o); }
  return g;
}
function nearby(G, x, y, r, out) {
  out.length = 0; const cell = G.cell; const i0 = Math.floor((x - r) / cell); const i1 = Math.floor((x + r) / cell); const j0 = Math.floor((y - r) / cell); const j1 = Math.floor((y + r) / cell);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const l = G.map.get(`${i},${j}`); if (l) for (const o of l) out.push(o); }
  return out;
}
// parado de vez na via: batido, rebocado, viatura/ambulância atendendo, cena, bloqueio policial
export const isStatic = (o) => Boolean((o.wrecked > 0 && !o.reckless) || o.hold || o.towedBy || o.sceneHold || (o.job && o.job.phase === 'atendendo') || o.mode === 'parked');

// trajeto à frente do carro: lista de [path, s inicial, deslocamento lateral]
function trajectory(world, c) {
  if (c.turn) return [[c.turn.path, c.ts, 0], [c.turn.next.path, c.turn.s1 || 0, 0]];
  const L = c.lc ? c.lc.to : c.lane; const s = c.lc ? c.s * (c.lc.to.path.len / c.lane.path.len) : c.s;
  const segs = [[L.path, s, c.lc ? 0 : c.lat || 0]];
  if (c.next) { segs.push([tp(world, L, c.next), 0, 0]); segs.push([c.next.path, 0, 0]); }
  return segs;
}
const BUF = [];
// obstáculo mais próximo ao longo do trajeto: { d (folga em unidades), who, vl (velocidade dele no nosso sentido) }
function scanAhead(world, G, c, look, skipStatic) {
  let best = Infinity; let who = null; let vl = 0; let acc = 0;
  const step = c.lod ? 10 : 5; const ca = Math.cos(c.a); const sa = Math.sin(c.a);
  for (const [path, s0, lat] of trajectory(world, c)) {
    for (let s = s0; s <= path.len && acc <= look; s += step, acc += step) {
      const q = along(path, s); const hx = Math.cos(q.a); const hy = Math.sin(q.a);
      const px = q.x - hy * lat; const py = q.y + hx * lat;
      for (const o of nearby(G, px, py, 22, BUF)) {
        if (o === c || o.towedBy === c || c.towedBy === o || o.gone || o.done) continue;
        if (skipStatic && isStatic(o)) continue;
        const dx = o.x - px; const dy = o.y - py; const lon = dx * hx + dy * hy; const lt = Math.abs(-dx * hy + dy * hx);
        if (lt > ((o.W || 6) / 2 + c.W / 2 - 1.5) || Math.abs(lon) > (o.L || 6) / 2 + step) continue;
        if ((o.x - c.x) * ca + (o.y - c.y) * sa < c.L / 2 - 1) continue; // atrás do nosso para-choque não conta
        const d = acc + lon - c.L / 2 - (o.L || 6) / 2;
        if (d < best) { best = d; who = o; vl = (o.v || 0) * Math.cos((o.a ?? 0) - q.a); }
      }
      if (best < Infinity) return { d: Math.max(0, best), who, vl };
    }
  }
  return { d: best, who, vl };
}

// IDM: aceleração rumo à velocidade desejada v0, com o obstáculo a d (velocidade vl)
function idm(c, P, v0, d, vl) {
  const v = Math.max(0, c.v); const a = P.a; const b = P.b;
  let acc = a * (1 - (v / Math.max(1, v0)) ** 4);
  if (d < Infinity) { const ss = P.s0 + Math.max(0, v * P.T + (v * (v - vl)) / (2 * Math.sqrt(a * b))); acc -= a * (ss / Math.max(0.5, d)) ** 2; }
  return Math.max(-TRAFFIC.hardBrake, acc);
}

// próxima faixa no cruzamento: destino/rota, ou aleatória evitando ruas bloqueadas (espalha os desvios)
function chooseNext(world, c, n) {
  if (c.target && n.out.includes(c.target.lane)) return c.target.lane;
  if (c.route?.length || c.dest) {
    let want = c.route?.[0]; let next = want ? n.out.find((l) => l.to.id === want && l.edge !== c.lane.edge && !l.inner) || n.out.find((l) => l.to.id === want && l.edge !== c.lane.edge) || null : null;
    if ((!next || CITY.blocked(next)) && c.dest && n.id !== c.dest) { c.route = routeNodes(world, n.id, c.dest, c.lane.edge) || []; want = c.route[0]; next = want ? n.out.find((l) => l.to.id === want && !l.inner) || n.out.find((l) => l.to.id === want) || null : null; }
    if (next) { if (c.route?.[0] === next.to.id) c.route.shift(); return next; }
  }
  const opts = n.out.filter((l) => l.edge !== c.lane.edge && !l.narrow && !l.inner);
  const free = opts.filter((l) => !CITY.blocked(l));
  // rua já cheia (fila até perto do começo) é evitada quando há outra opção: o trânsito se espalha e anéis pequenos
  // (ruas das vilas) não lotam — só influencia a escolha, nunca obriga a esperar
  const roomy = TRAFFIC.spread ? free.filter((l) => (l.load || 0) < l.path.len * 0.6) : [];
  const pool = roomy.length ? roomy : free.length ? free : opts.length ? opts : n.out.filter((l) => l.edge !== c.lane.edge);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
// cruzamento livre para este movimento? (ninguém dentro com trajetória cruzada, espaço na saída, sem sirene chegando)
// trechos finais das outras chegadas que a curva varre (carro parado ali seria raspado): calculado uma vez por curva
function sweeps(world, path, n, from) {
  if (path.sw) return path.sw;
  path.sw = n.inn.filter((l) => l !== from && l.edge !== from.edge && [0, 5, 10, 15, 20, 25].some((back) => { const q = along(l.path, Math.max(0, l.path.len - back)); for (let a = 0; a <= path.len; a += 4) { const p = along(path, a); if (Math.hypot(p.x - q.x, p.y - q.y) < 22) return true; } return false; }));
  return path.sw;
}
// rotatória: preferência de quem já circula. Só espera quem vem pelo círculo e ainda vai passar pela nossa entrada
// (nas próximas ~1,1 rad, ou mais perto que 34). Contra a espera infinita: quem espera há mais de 10 s ganha a vez
// (as outras entradas seguram até ele entrar).
const wrap = (x) => { x %= Math.PI * 2; return x < 0 ? x + Math.PI * 2 : x; };
function canEnterRound(world, c, n, next, all) {
  const path = tp(world, c.lane, next); const e = path.pts[0]; const ea = Math.atan2(e[1] - n.y, e[0] - n.x);
  const gap = 1.1;
  if (n.starve && (n.starve.done || n.starve.turn || !all.includes(n.starve) || n.starve.lane?.to !== n)) n.starve = null;
  if ((c.boxWait || 0) > 10 && !n.starve) n.starve = c;
  if (n.starve && n.starve !== c) return false;
  for (const o of n.box) {
    if (o === c) continue; if (!o.turn || o.done || !all.includes(o)) { if (!o.res || o.done || !all.includes(o)) n.box.delete(o); continue; }
    const oa = Math.atan2(o.y - n.y, o.x - n.x); const d = wrap(oa - ea); // o anda no sentido do ângulo diminuindo
    const xe = o.turn.path.pts.at(-1); const dx = wrap(oa - Math.atan2(xe[1] - n.y, xe[0] - n.x));
    if (dx < d && Math.hypot(o.x - e[0], o.y - e[1]) > 34) continue; // sai antes de chegar na nossa entrada
    if (d < gap || Math.hypot(o.x - e[0], o.y - e[1]) < 34) return false;
  }
  for (const o of all) { if (o === c) continue; if (o.lane === next && !o.turn && o.s < c.L + 10 && o.v < 8) return false; } // espaço na saída
  return true;
}
function canEnter(world, c, n, next, all) {
  // vez garantida a quem espera há mais de 10 s (rotatória ou fluxo contínuo): os outros seguram até ele passar
  if (TRAFFIC.starve) {
    if (n.starve && (n.starve.done || n.starve.turn || !all.includes(n.starve) || n.starve.lane?.to !== n || !n.starve.boxWait)) n.starve = null;
    if ((c.boxWait || 0) > TRAFFIC.starve && !n.starve) n.starve = c;
    if (n.starve && n.starve !== c) return false;
  }
  const path = tp(world, c.lane, next);
  // a carroceria ao longo da curva encostaria em alguém parado nas outras chegadas? (teste geométrico real)
  const sw = sweeps(world, path, n, c.lane);
  if (sw.length) for (const o of all) {
    if (o === c || o.turn || !sw.includes(o.lane) || o.lane.path.len - o.s > 50) continue;
    for (let a = 0; a <= path.len; a += 4) { const q = along(path, a); if (Math.abs(q.x - o.x) < 30 && Math.abs(q.y - o.y) < 30 && obb({ x: q.x, y: q.y, a: q.a, L: c.L, W: c.W }, o, 1)) return false; }
  }
  for (const o of n.box) { if (o === c) continue; const op = o.turn ? o.turn.path : o.res; if (o.done || !all.includes(o) || !op) { n.box.delete(o); continue; } if (conflict(world, op, path)) return false; }
  for (const o of all) { if (o === c) continue; if (o.lane === next && !o.turn && o.s < c.L + 10 && o.v < 8) return false; }
  if (!c.siren) for (const o of all) if (o.siren && o !== c && !o.turn && !isStatic(o) && o.lane?.to === n && o.lane.path.len - o.s < TRAFFIC.sirenReach) return false;
  return true;
}
const clearLane = (all, lane, s0, s1, self) => !all.some((o) => o !== self && ((o.lane === lane && !o.turn && o.s > s0 && o.s < s1) || (o.lc && o.lc.to === lane)));
const turnAngle = (L, next) => { if (!next?.dStart) return 0; const a = L.dEnd; const b = next.dStart; return Math.abs(Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1])); };

// ---------------------------------------------------------------- passo de simulação
export function stepTraffic(T, world, dt, t, ctx) {
  laneInit(world);
  stepSmartLights(world, T.cars, dt, ctx.view); // semáforos inteligentes (sensores de fila)
  const all = T.cars; const extra = ctx.extra || []; const view = ctx.view;
  const G = { cell: TRAFFIC.gridCell, map: buildGrid([...all, ...extra], TRAFFIC.gridCell) };
  // bloqueios: carros parados de vez publicam a faixa como bloqueada (rotas e escolhas evitam)
  CITY.beginFrame();
  for (const c of all) { if (isStatic(c) && c.lane && !c.towedBy && !c.done) { c.staticT = (c.staticT || 0) + dt; if (c.staticT > TRAFFIC.blockAfter) CITY.block(c.lane, c); } else c.staticT = 0; }
  CITY.endFrame();
  // ocupação de cada faixa (comprimento de fila), usada na escolha das saídas
  for (const l of world.lanes) l.load = 0;
  for (const c of all) { const l = c.turn ? c.turn.next : c.lane; if (l) l.load += (c.L || 22) + 8; }
  // sirenes: quem está à frente (mesmo trecho, até TRAFFIC.sirenReach) abre passagem
  for (const c of all) c.yieldTo = null;
  for (const s of all) {
    if (!s.siren || s.done || isStatic(s) || s.v < 3) continue;
    const hx = Math.cos(s.a); const hy = Math.sin(s.a);
    for (const c of nearby(G, s.x, s.y, TRAFFIC.sirenReach, [])) {
      if (c === s || c.siren || !c.lane || isStatic(c) || c.mode) continue;
      const dx = c.x - s.x; const dy = c.y - s.y; const ahead = dx * hx + dy * hy; const lat = Math.abs(-dx * hy + dy * hx);
      if (ahead > 0 && ahead < TRAFFIC.sirenReach && lat < 30 && Math.cos(c.a - s.a) > 0.3) c.yieldTo = s;
    }
  }
  for (const c of all) {
    if (c.mode === 'chase' || c.mode === 'parked' || c.towedBy) continue; // perseguição e reboque: controlados por outros sistemas
    if (c.sceneHold) { c.v = 0; c.st = 'cena'; continue; }
    if (c.wrecked > 0) { c.wrecked -= dt; c.v = 0; c.st = 'batido'; if (c.wrecked <= 0) c.smoke = 0; continue; }
    const P = PROFILES[c.prof] || PROFILES.comum; const rk = Boolean(c.reckless);
    c.lod = view ? Math.hypot(c.x - view.x, c.y - view.y) > view.r + 500 : false; // longe da câmera: percepção mais leve
    let v0 = c.maxV * (c.siren ? 1.25 : rk ? 1.15 : P.v); let stopAt = Infinity; let st = 'cruise';
    // ---- aproximação do cruzamento: escolhe a saída, sinal, PARE, pedestres, reserva do cruzamento
    if (!c.turn) {
      const L = c.lane; const rem = L.path.len - c.s; const n = L.to;
      if (L.narrow) v0 = Math.min(v0, 28);
      if (!c.next && rem < 80 && n.kind !== 'exit' && n.out.length) c.next = chooseNext(world, c, n);
      if (c.next && CITY.blocked(c.next) && rem > 25 && !c.route?.length && !c.target) { const nx = chooseNext(world, c, n); if (nx) c.next = nx; } // bloqueio descoberto: troca a saída
      if (n.kind === 'round') v0 = Math.min(v0, 20 + rem * 0.5);
      else if (n.kind !== 'exit' && rem < 50) v0 = Math.min(v0, (turnAngle(L, c.next) > 0.6 ? 18 : 30) + rem * 0.6); // reduz antes da curva
      let mustWait = false; c.why = null; // motivo da espera (diagnóstico)
      if (n.light && !c.siren && !rk) {
        const s = lightState(n, L.axis, t);
        if (s === 'red') { if (c.redRun == null) c.redRun = Math.random() < P.vermelho; if (!c.redRun || rem > 40) { mustWait = true; c.why = 'vermelho'; } }
        else if (s === 'yellow') { const canStop = rem > (c.v * c.v) / (2 * P.b) + 3; if (canStop && !(P.amarelo && rem < 35)) { mustWait = true; c.why = 'amarelo'; } }
        else c.redRun = null;
      }
      if (n.stop && !c.siren && !rk) { // PARE: parada completa antes de entrar
        if (rem < 13 && c.v < 1.5) c.stopT = (c.stopT || 0) + dt; // parou na linha (que fica 8 antes do fim da faixa)
        if ((c.stopT || 0) < (c.prof === 'imprudente' ? 0.1 : TRAFFIC.stopHold)) { mustWait = true; c.why = 'pare'; }
      }
      // alguém fazendo uma curva que varre o fim desta faixa: espera mais atrás, fora do caminho dela
      if (rem < 70 && !rk && n.kind !== 'round') for (const o of n.box) { const op = o.turn ? (o.turn.uturn ? null : o.turn.path) : o.res; if (o !== c && op && op.from && sweeps(world, op, n, op.from).includes(L)) { mustWait = true; stopAt = Math.min(stopAt, rem - 40); c.why = 'curva-de-outro'; break; } }
      if (rem < 34 && ctx.crossing?.has(n.id) && !rk) { mustWait = true; c.why = 'pedestre'; } // pedestres atravessando
      // pede o cruzamento com antecedência (dá para frear antes da linha)
      if (c.res && (mustWait || !c.next || c.res !== tp(world, L, c.next))) { n.box.delete(c); c.res = null; } // desistiu ou mudou a saída: devolve a vaga
      const first = !c.perc || c.perc.d > rem - 12 || (c.perc.who && c.perc.who.turn); // primeiro da fila (ninguém entre ele e a linha)
      if (!mustWait && c.next && rem < 40 && !rk && !c.res && first) { if (canEnter(world, c, n, c.next, all)) { c.res = tp(world, L, c.next); n.box.add(c); } else { mustWait = true; st = 'aguarda-cruzamento'; c.why = 'cruzamento'; c.boxWait = (c.boxWait || 0) + dt; c.waitAll = (c.waitAll || 0) + dt; if (c.boxWait > 6 && !c.route?.length && !c.target) { const nx = chooseNext(world, c, n); if (nx) c.next = nx; c.boxWait = 0; } } }
      if (c.res) c.boxWait = 0;
      // para antes da linha: a curva de quem cruza não varre o nariz do carro
      if (mustWait) { stopAt = Math.min(stopAt, rem - 8); if (st === 'cruise') st = 'parado-sinal'; }
      if (c.target && c.target.lane === L) stopAt = Math.min(stopAt, c.target.s - c.s); // chegou ao local da ocorrência
    } else v0 = Math.min(v0, c.turn.uturn ? 12 : c.lane.to.kind === 'round' ? 22 : 24);
    // ---- percepção (tempo de reação: a leitura do trânsito é atualizada a cada ~P.react s; de perto, sempre)
    c.percT = (c.percT || 0) - dt;
    if (rk) c.perc = { d: Infinity, who: null, vl: 0 };
    else if (c.percT <= 0 || !c.perc || c.perc.d < 25) { const look = Math.min(TRAFFIC.look, 24 + c.v * 2.4); c.perc = scanAhead(world, G, c, look, false); c.percT = P.react * (0.6 + Math.random() * 0.8); }
    let d = c.perc.d; const who = c.perc.who;
    // ---- sirene atrás: vai para a faixa da direita (vias de 4 faixas) ou encosta e reduz
    if (c.yieldTo && !c.turn) {
      st = 'abre-passagem'; const close = Math.hypot(c.yieldTo.x - c.x, c.yieldTo.y - c.y);
      if (c.lane.inner && c.lane.sib && !c.lc && clearLane(all, c.lane.sib, c.s - 30, c.s + 30, c)) c.lc = { to: c.lane.sib, k: 0 };
      else if (!c.lane.inner) { c.latT = TRAFFIC.curbLat; v0 = Math.min(v0, close < 45 ? 0.1 : 9); }
    } else if (c.job?.phase === 'atendendo') c.latT = TRAFFIC.curbLat; // viatura/ambulância estacionada: encosta no meio-fio
    else if (!c.passing) c.latT = 0;
    // ---- obstáculo parado de vez à frente (acidente, viatura atendendo): troca de faixa, ultrapassa ou retorna
    if (!rk && who && isStatic(who) && d < 60 && !c.turn) {
      st = 'bloqueado'; c.blockT = (c.blockT || 0) + dt; const L = c.lane;
      if (L.sib && !c.lc && clearLane(all, L.sib, c.s - 30, c.s + 50, c)) { c.lc = { to: L.sib, k: 0 }; st = 'troca-faixa'; }
      else if (!L.sib && L.rev && !c.passing && c.v < 6 && c.blockT > 1.5 && (c.siren || Math.random() < (P.ultrapassa + 0.3) * dt * 2)) {
        const sRev = L.rev.path.len - c.s; // contramão livre (ninguém vindo nos próximos TRAFFIC.overtakeClear)
        if (clearLane(all, L.rev, sRev - TRAFFIC.overtakeClear, sRev + 20, c)) c.passing = { until: c.s + d + (who.L || 20) + 30 };
      } else if (c.blockT > TRAFFIC.uturnAfter && L.rev && !c.passing && !c.siren) { // sem como passar: faz o retorno
        const sRev = Math.max(6, L.rev.path.len - c.s); if (clearLane(all, L.rev, sRev - 30, sRev + 30, c)) uTurn(c, L.rev, sRev);
      }
    } else if (!c.passing) c.blockT = 0;
    if (c.passing) {
      c.latT = -(c.lane.edge.w * 0.48); st = 'ultrapassa';
      if (c.s > c.passing.until || c.turn || c.lane.path.len - c.s < 20) { c.passing = null; c.latT = 0; } else d = scanAhead(world, G, c, 80, true).d;
    }
    if (c.lc) st = 'troca-faixa';
    if (rk) d = Infinity;
    // ---- velocidade (IDM com o obstáculo e com a linha de parada)
    let acc = idm(c, P, v0, d, c.perc.vl);
    if (stopAt < Infinity) acc = Math.min(acc, idm(c, { ...P, s0: 1.2, T: Math.min(P.T, 1) }, v0, Math.max(0, stopAt), 0)); // linha de parada: encosta nela
    if (d < 1.5 && !rk) acc = Math.min(acc, -TRAFFIC.hardBrake);
    c.v = Math.max(0, c.v + acc * dt); if (c.v < 0.05 && acc < 0) c.v = 0;
    if (st === 'cruise' && d < 60) st = 'segue';
    c.st = st;
    // ---- movimento ao longo da faixa / curva (com a foto de antes para a trava de colisão)
    const b = { lane: c.lane, s: c.s, turn: c.turn, ts: c.ts, next: c.next, x: c.x, y: c.y, a: c.a, lc: c.lc ? { ...c.lc } : null, lat: c.lat };
    let mv = c.v * dt;
    while (mv > 0) {
      if (!c.turn) {
        const rem = c.lane.path.len - c.s;
        if (mv < rem) { c.s += mv; mv = 0; break; }
        mv -= rem; c.s = c.lane.path.len;
        const n = c.lane.to;
        if (n.kind === 'exit' || !n.out.length) { if (c.temp) c.done = true; else T.placeCar(c, view); mv = 0; break; }
        const next = c.next || chooseNext(world, c, n);
        if (!next) { if (c.temp) c.done = true; else T.placeCar(c, view); mv = 0; break; }
        if (c.lc) { c.lane = c.lc.to; c.lc = null; }
        c.turn = { path: tp(world, c.lane, next), next }; c.ts = 0; c.next = null; c.res = null; c.waitAll = 0; c.stopT = 0; c.redRun = null; c.passing = null; n.box.add(c);
      } else {
        const rem = c.turn.path.len - c.ts;
        if (mv < rem) { c.ts += mv; mv = 0; break; }
        mv -= rem; c.lane.to.box.delete(c); c.lane = c.turn.next; c.s = c.turn.s1 || 0; c.turn = null;
      }
    }
    // troca de faixa: desliza até a faixa ao lado
    if (c.lc && !c.turn) { c.lc.k += dt / TRAFFIC.laneChange; if (c.lc.k >= 1) { c.s = Math.min(c.lc.to.path.len, c.s * (c.lc.to.path.len / c.lane.path.len)); c.lane = c.lc.to; c.lc = null; } }
    place(c, dt);
    // ---- trava de colisão: movimento que sobreporia outro veículo/pessoa é desfeito (só o distraído encosta)
    if (!rk && c.done !== true) {
      let hit = false;
      for (const o of nearby(G, c.x, c.y, 40, BUF)) {
        if (o === c || o.gone || o.done || o.towedBy === c || c.towedBy === o) continue;
        if (Math.abs(o.x - c.x) > 36 || Math.abs(o.y - c.y) > 36) continue;
        const ob = { x: o.x, y: o.y, a: o.a ?? 0, L: o.L || 6, W: o.W || 6 };
        if (!obb(c, ob, -0.3)) continue;
        const was = obb({ x: b.x, y: b.y, a: b.a, L: c.L, W: c.W }, ob, -0.3);
        if (!was || Math.hypot(o.x - c.x, o.y - c.y) < Math.hypot(o.x - b.x, o.y - b.y) - 0.01) { hit = true; c.hitBy = o; break; }
      }
      if (hit) {
        if (c.turn && c.turn !== b.turn) c.lane.to.box.delete(c);
        Object.assign(c, { lane: b.lane, s: b.s, turn: b.turn, ts: b.ts, next: b.next, x: b.x, y: b.y, a: b.a, lc: b.lc, lat: b.lat, v: 0 });
        if (b.turn) b.lane.to.box.add(c);
        c.st = 'trava'; c.perc = null;
      }
    }
    // ---- preso há muito tempo: fora da tela reaparece em outro lugar; na tela, nunca teleporta
    if (c.v < 0.3 && !isStatic(c) && !c.temp && c.st !== 'parado-sinal') c.stuck = (c.stuck || 0) + dt; else c.stuck = 0;
    const off = !view || Math.hypot(c.x - view.x, c.y - view.y) > view.r + 150;
    if (c.stuck > TRAFFIC.stuckRespawn && off && !c.siren) T.placeCar(c, view);
    // longe da câmera por muito tempo: volta para perto (mantém o trânsito onde o jogador está)
    if (!c.temp && !c.siren && view) { const far = Math.hypot(c.x - view.x, c.y - view.y) > view.r + 1200; c.far = far ? (c.far || 0) + dt : 0; if (c.far > 4) T.placeCar(c, view); }
  }
  for (let i = T.cars.length - 1; i >= 0; i--) if (T.cars[i].done) { const c = T.cars[i]; c.lane?.to?.box?.delete(c); T.cars.splice(i, 1); }
}
// posição: faixa (com deslocamento lateral e troca de faixa) ou curva
function place(c, dt) {
  c.lat = (c.lat || 0) + ((c.latT || 0) - (c.lat || 0)) * Math.min(1, dt * 2.5);
  let p;
  if (c.turn) p = along(c.turn.path, c.ts);
  else {
    p = along(c.lane.path, c.s);
    if (c.lc) { const q = along(c.lc.to.path, c.s * (c.lc.to.path.len / c.lane.path.len)); const k = c.lc.k * c.lc.k * (3 - 2 * c.lc.k); p = { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k, a: p.a }; }
  }
  let da = p.a - c.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
  c.a += da * Math.min(1, dt * 10);
  const la = c.turn ? 0 : c.lat || 0; c.x = p.x - Math.sin(p.a) * la; c.y = p.y + Math.cos(p.a) * la;
}
// retorno: curva em U do ponto atual até a contramão (sem teleporte)
function uTurn(c, rev, sRev) {
  const a = along(c.lane.path, c.s); const b = along(rev.path, sRev);
  const C1 = [a.x + Math.cos(a.a) * 18, a.y + Math.sin(a.a) * 18]; const C2 = [b.x - Math.cos(b.a) * 18, b.y - Math.sin(b.a) * 18]; const pts = [];
  for (let i = 0; i <= 12; i++) { const k = i / 12; const u = 1 - k; pts.push([u * u * u * a.x + 3 * u * u * k * C1[0] + 3 * u * k * k * C2[0] + k * k * k * b.x, u * u * u * a.y + 3 * u * u * k * C1[1] + 3 * u * k * k * C2[1] + k * k * k * b.y]); }
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const path = { pts, cum, id: ++PID, get len() { return this.cum.at(-1); } };
  c.turn = { path, next: rev, s1: sRev, uturn: true }; c.ts = 0; c.next = null; c.blockT = 0; c.lane.to.box.add(c);
}
// pares de veículos sobrepostos (diagnóstico e testes)
export function overlaps(cars, m = -0.5) {
  const out = [];
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i]; const b = cars[j]; if (a.towedBy === b || b.towedBy === a || a.done || b.done) continue;
    if (Math.abs(a.x - b.x) > 40 || Math.abs(a.y - b.y) > 40) continue;
    if (obb(a, b, m)) out.push([a, b]);
  }
  return out;
}
