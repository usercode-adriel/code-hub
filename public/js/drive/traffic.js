// TrafficSystem — carros automáticos: seguem as faixas (mão direita), escolhem o caminho em cada cruzamento,
// param no vermelho, reduzem nas curvas e rotatórias, mantêm distância (cone de visão à frente) e esperam
// pedestres atravessarem. Sem física: só rotas, pontos e controle de velocidade.
import { along, turnPath, lightState } from './world.js';

const SPR_CIV = ['civ-branco', 'civ-preto', 'civ-vermelho', 'civ-prata', 'civ-branco2', 'civ-preto2', 'civ-branco3', 'civ-hatch', 'civ-jipe', 'civ-azul', 'civ-amarelo', 'civ-verde'];
const SPR_SPECIAL = [['taxi', 0.14], ['onibus', 0.06], ['onibus-verde', 0.04], ['caminhao-cinza', 0.04], ['caminhao-amarelo', 0.03], ['moto-vermelha', 0.04], ['moto-preta', 0.03], ['moto-azul', 0.03], ['moto-scooter', 0.03], ['ambulancia', 0.02]];
const LEN = { carro: 20, taxi: 20, policia: 20, ambulancia: 21, onibus: 29, caminhao: 27, bombeiros: 27, moto: 12, bike: 11, meu: 20 };
export const lengthOf = (kind) => LEN[kind] || 20;
const KMH = 0.72; // px/s → km/h (1 px = 0,2 m)
export const toKmh = (v) => Math.abs(v) * KMH;

function pickSprite(i) {
  if (i === 0) return 'policia'; // sempre há uma viatura patrulhando
  let r = Math.random();
  for (const [s, p] of SPR_SPECIAL) { if (r < p) return s; r -= p; }
  return SPR_CIV[Math.floor(Math.random() * SPR_CIV.length)];
}

export function createTraffic(world, sprites, count) {
  const cars = [];
  const lanes = world.lanes.filter((l) => !l.narrow && l.path.len > 30);
  const placeCar = (c, avoid) => {
    for (let k = 0; k < 40; k++) {
      const l = lanes[Math.floor(Math.random() * lanes.length)];
      const s = Math.random() * l.path.len;
      const p = along(l.path, s);
      if (avoid && Math.hypot(p.x - avoid.x, p.y - avoid.y) < avoid.r) continue;
      if (cars.some((o) => o !== c && Math.hypot(o.x - p.x, o.y - p.y) < 34)) continue;
      Object.assign(c, { lane: l, s, turn: null, ts: 0, x: p.x, y: p.y, a: p.a, v: 10 + Math.random() * 20, wait: 0, ghost: 0 });
      return true;
    }
    return false;
  };
  for (let i = 0; i < count; i++) {
    const sp = pickSprite(i); const kind = sprites.meta[sp]?.kind || 'carro';
    const c = { id: i, sprite: sp, kind, L: lengthOf(kind), maxV: kind === 'onibus' || kind === 'caminhao' ? 38 : kind === 'moto' ? 52 : 44 + Math.random() * 8 };
    if (placeCar(c)) cars.push(c);
  }
  return { cars, placeCar };
}

// obstáculo mais próximo à frente (carros, carro do jogador, carros estacionados, pedestres na pista)
function ahead(c, list, maxD) {
  const hx = Math.cos(c.a); const hy = Math.sin(c.a);
  let best = Infinity;
  for (const o of list) {
    if (o === c) continue;
    const dx = o.x - c.x; const dy = o.y - c.y;
    const d = dx * hx + dy * hy; if (d <= 0 || d > maxD) continue;
    const lat = Math.abs(-dx * hy + dy * hx);
    const half = (o.W || 6) / 2 + 4;
    if (lat > half) continue;
    // carro vindo de frente na outra faixa não conta
    if (o.a != null && Math.cos(o.a - c.a) < -0.6 && lat > 3) continue;
    best = Math.min(best, d - (c.L / 2 + (o.L || 6) / 2 + 3));
  }
  return best;
}

export function stepTraffic(T, world, dt, t, ctx) {
  const { cars } = T;
  const obstacles = [...cars, ...ctx.extra];
  for (const c of cars) {
    let vmax = c.maxV; let stop = Infinity;
    if (!c.turn) {
      const L = c.lane; const rem = L.path.len - c.s; const n = L.to;
      if (L.narrow) vmax = Math.min(vmax, 28);
      if (n.kind === 'round') vmax = Math.min(vmax, 22 + rem * 0.5);
      else if (n.kind !== 'exit' && rem < 45) vmax = Math.min(vmax, 24 + rem * 0.6);
      if (n.light) {
        const st = lightState(n, L.axis, t);
        if (st === 'red' || (st === 'yellow' && rem > 12)) stop = Math.min(stop, rem - 2);
      } else if (n.out.length > 2 && n.kind === 'cross' && rem < 30) vmax = Math.min(vmax, 18); // cruzamento sem semáforo: devagar
      // pedestres atravessando este cruzamento
      if (rem < 34 && ctx.crossing.has(n.id)) stop = Math.min(stop, rem - 2);
    } else vmax = Math.min(vmax, c.lane.to.kind === 'round' ? 24 : 26);
    // distância segura
    const look = 28 + c.v * 1.1;
    const d = c.ghost > 0 ? Infinity : ahead(c, obstacles, look);
    if (d < Infinity) stop = Math.min(stop, d);
    // velocidade desejada: freia a tempo de parar no ponto (v² = 2·b·d)
    const desired = Math.min(vmax, stop < Infinity ? Math.sqrt(Math.max(0, 2 * 70 * Math.max(0, stop))) : vmax);
    if (c.v < desired) c.v = Math.min(desired, c.v + 26 * dt); else c.v = Math.max(desired, c.v - 90 * dt);
    if (c.v < 0.5 && d < 30) c.wait += dt; else c.wait = 0;
    if (c.wait > 7) { c.ghost = 1.6; c.wait = 0; } // destrava engarrafamento raro em cruzamento
    if (c.ghost > 0) c.ghost -= dt;
    // anda
    let mv = c.v * dt;
    while (mv > 0) {
      if (!c.turn) {
        const rem = c.lane.path.len - c.s;
        if (mv < rem) { c.s += mv; mv = 0; break; }
        mv -= rem; c.s = c.lane.path.len;
        const n = c.lane.to;
        if (n.kind === 'exit' || !n.out.length) { T.placeCar(c, ctx.view); mv = 0; break; }
        const opts = n.out.filter((l) => l.edge !== c.lane.edge && !l.narrow);
        const choices = opts.length ? opts : n.out.filter((l) => l.edge !== c.lane.edge);
        if (!choices.length) { T.placeCar(c, ctx.view); mv = 0; break; }
        const next = choices[Math.floor(Math.random() * choices.length)];
        c.turn = { path: turnPath(world, c.lane, next), next }; c.ts = 0;
      } else {
        const rem = c.turn.path.len - c.ts;
        if (mv < rem) { c.ts += mv; mv = 0; break; }
        mv -= rem; c.lane = c.turn.next; c.s = 0; c.turn = null;
      }
    }
    const p = c.turn ? along(c.turn.path, c.ts) : along(c.lane.path, c.s);
    // vira suavemente (sem tranco no começo das curvas)
    let da = p.a - c.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    c.a += da * Math.min(1, dt * 10); c.x = p.x; c.y = p.y;
  }
}
