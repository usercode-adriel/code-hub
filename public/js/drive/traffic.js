// TrafficSystem — carros automáticos: seguem as faixas (mão direita), escolhem o caminho em cada cruzamento
// (ou seguem uma rota, no caso de viaturas e ambulâncias), param no vermelho, reduzem nas curvas e rotatórias,
// mantêm distância (cone de visão à frente) e esperam pedestres. Sem física: rotas, pontos e controle de velocidade.
import { along, turnPath, lightState, routeNodes } from './world.js';

const LEN = { carro: 22, taxi: 22, policia: 23, ambulancia: 25, bombeiros: 30, caminhao: 30, van: 25, moto: 12, meu: 22, coleta: 30 };
export const lengthOf = (kind) => LEN[kind] || 22;
const KMH = 0.72; // unidades/s → km/h (1 unidade ≈ 0,2 m)
export const toKmh = (v) => Math.abs(v) * KMH;
const CIVIL = ['azul', 'verde', 'laranja', 'branco', 'preto', 'roxo', 'suv-amarelo', 'esportivo-vermelho', 'branco', 'azul', 'preto'];
const BIG = [['taxi', 'taxi', 0.14], ['van-branca', 'van', 0.06], ['picape-azul', 'van', 0.05], ['jipe-verde', 'van', 0.05], ['caminhao-branco', 'caminhao', 0.04], ['caminhao-vermelho', 'caminhao', 0.02], ['caminhao-azul', 'caminhao', 0.02], ['coleta', 'coleta', 0.02], ['betoneira', 'caminhao', 0.015]];
export function pickTraffic(i) {
  if (i === 0 || i === 1) return { sprite: 'policia', kind: 'policia' }; // duas viaturas patrulhando
  let r = Math.random();
  for (const [s, k, p] of BIG) { if (r < p) return { sprite: s, kind: k }; r -= p; }
  return { sprite: CIVIL[Math.floor(Math.random() * CIVIL.length)], kind: 'carro' };
}

export function createTraffic(world, { count, near } = {}) {
  const cars = [];
  const lanes = world.lanes.filter((l) => !l.narrow && l.path.len > 30);
  // coloca o carro numa faixa (de preferência perto da câmera, mas fora da tela)
  const placeCar = (c, view) => {
    for (let k = 0; k < 60; k++) {
      const l = lanes[Math.floor(Math.random() * lanes.length)];
      const s = Math.random() * l.path.len; const p = along(l.path, s);
      if (view) { const d = Math.hypot(p.x - view.x, p.y - view.y); if (d < view.r || d > view.r + 900) continue; }
      if (cars.some((o) => o !== c && Math.hypot(o.x - p.x, o.y - p.y) < 40)) continue;
      Object.assign(c, { lane: l, s, turn: null, ts: 0, x: p.x, y: p.y, a: p.a, v: 10 + Math.random() * 20, wait: 0, ghost: 0, far: 0 });
      return true;
    }
    return false;
  };
  const add = (spec, view) => {
    const c = { id: `t${cars.length}${Math.random().toString(36).slice(2, 6)}`, sprite: spec.sprite, kind: spec.kind, L: lengthOf(spec.kind), W: spec.kind === 'moto' ? 6 : 12, maxV: ['caminhao', 'coleta', 'bombeiros'].includes(spec.kind) ? 40 : 46 + Math.random() * 8, driver: true, ...spec.extra };
    if (placeCar(c, view)) { cars.push(c); return c; }
    return null;
  };
  for (let i = 0; i < count; i++) add(pickTraffic(i), near);
  return { cars, placeCar, add, lanes };
}

// obstáculo mais próximo à frente (carros, jogador, estacionados, pedestres na pista)
function ahead(c, list, maxD) {
  const hx = Math.cos(c.a); const hy = Math.sin(c.a);
  let best = Infinity;
  for (const o of list) {
    if (o === c) continue;
    const dx = o.x - c.x; const dy = o.y - c.y;
    if (Math.abs(dx) > maxD + 30 || Math.abs(dy) > maxD + 30) continue;
    const d = dx * hx + dy * hy; if (d <= 0 || d > maxD) continue;
    const lat = Math.abs(-dx * hy + dy * hx);
    if (lat > (o.W || 6) / 2 + 5) continue;
    if (o.a != null && Math.cos(o.a - c.a) < -0.6 && lat > 3) continue; // vem de frente na outra faixa
    best = Math.min(best, d - (c.L / 2 + (o.L || 6) / 2 + 3));
  }
  return best;
}

export function stepTraffic(T, world, dt, t, ctx) {
  const obstacles = [...T.cars, ...ctx.extra];
  for (const c of T.cars) {
    if (c.mode === 'chase' || c.mode === 'parked') continue; // perseguição é controlada pelo sistema de ocorrências
    if (c.wrecked > 0) { c.wrecked -= dt; c.v = 0; if (c.wrecked <= 0) c.smoke = 0; continue; }
    let vmax = c.maxV * (c.siren ? 1.2 : 1); let stop = Infinity;
    if (!c.turn) {
      const L = c.lane; const rem = L.path.len - c.s; const n = L.to;
      if (L.narrow) vmax = Math.min(vmax, 28);
      if (n.kind === 'round') vmax = Math.min(vmax, 22 + rem * 0.5);
      else if (n.kind !== 'exit' && rem < 45) vmax = Math.min(vmax, 24 + rem * 0.6);
      if (n.light && !c.siren) {
        const st = lightState(n, L.axis, t);
        if (st === 'red' || (st === 'yellow' && rem > 12)) stop = Math.min(stop, rem - 2);
      } else if (n.out.length > 2 && n.kind !== 'round' && rem < 30) vmax = Math.min(vmax, c.siren ? 26 : 18);
      if (rem < 34 && ctx.crossing.has(n.id)) stop = Math.min(stop, rem - 2);
      if (c.target && c.target.lane === L) stop = Math.min(stop, c.target.s - c.s); // chegou ao local da ocorrência
    } else vmax = Math.min(vmax, c.lane.to.kind === 'round' ? 24 : 26);
    const look = 28 + c.v * 1.1;
    const d = c.ghost > 0 ? Infinity : ahead(c, obstacles, look);
    if (d < Infinity) stop = Math.min(stop, d);
    const desired = Math.min(vmax, stop < Infinity ? Math.sqrt(Math.max(0, 2 * 70 * Math.max(0, stop))) : vmax);
    if (c.v < desired) c.v = Math.min(desired, c.v + 26 * dt); else c.v = Math.max(desired, c.v - 90 * dt);
    if (c.v < 0.5 && d < 30) c.wait += dt; else c.wait = 0;
    if (c.wait > 7) { c.ghost = 1.6; c.wait = 0; }
    if (c.ghost > 0) c.ghost -= dt;
    let mv = c.v * dt;
    while (mv > 0) {
      if (!c.turn) {
        const rem = c.lane.path.len - c.s;
        if (mv < rem) { c.s += mv; mv = 0; break; }
        mv -= rem; c.s = c.lane.path.len;
        const n = c.lane.to;
        if (n.kind === 'exit' || !n.out.length) { if (c.temp) c.done = true; else T.placeCar(c, ctx.view); mv = 0; break; }
        let next = null;
        // destino final: entra na rua da ocorrência assim que ela sai deste cruzamento
        if (c.target && n.out.includes(c.target.lane)) next = c.target.lane;
        else if (c.route?.length || c.dest) {
          let want = c.route?.[0]; next = want ? n.out.find((l) => l.to.id === want && l.edge !== c.lane.edge) || null : null;
          // rota quebrada (pediria retorno no mesmo trecho): recalcula daqui, sem voltar pelo mesmo caminho
          if (!next && c.dest && n.id !== c.dest) { c.route = routeNodes(world, n.id, c.dest, c.lane.edge) || []; want = c.route[0]; next = want ? n.out.find((l) => l.to.id === want) || null : null; }
          if (next) c.route.shift();
        }
        if (!next) {
          const opts = n.out.filter((l) => l.edge !== c.lane.edge && !l.narrow);
          const choices = opts.length ? opts : n.out.filter((l) => l.edge !== c.lane.edge);
          if (!choices.length) { if (c.temp) c.done = true; else T.placeCar(c, ctx.view); mv = 0; break; }
          next = choices[Math.floor(Math.random() * choices.length)];
        }
        c.turn = { path: turnPath(world, c.lane, next), next }; c.ts = 0;
      } else {
        const rem = c.turn.path.len - c.ts;
        if (mv < rem) { c.ts += mv; mv = 0; break; }
        mv -= rem; c.lane = c.turn.next; c.s = 0; c.turn = null;
      }
    }
    const p = c.turn ? along(c.turn.path, c.ts) : along(c.lane.path, c.s);
    let da = p.a - c.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
    c.a += da * Math.min(1, dt * 10); c.x = p.x; c.y = p.y;
    // longe da câmera por muito tempo: reaparece perto (mantém o trânsito onde o jogador está)
    if (!c.temp && !c.siren && ctx.view) {
      const far = Math.hypot(c.x - ctx.view.x, c.y - ctx.view.y) > ctx.view.r + 1200;
      c.far = far ? (c.far || 0) + dt : 0;
      if (c.far > 4) T.placeCar(c, ctx.view);
    }
  }
  for (let i = T.cars.length - 1; i >= 0; i--) if (T.cars[i].done) T.cars.splice(i, 1);
}
