// Ocorrências do mapa: atropelamentos, batidas e quedas de avião. Curiosos se juntam, a ambulância sai do hospital
// e leva os feridos, a viatura vai ao local e o bombeiro apaga o fogo. A polícia percebe infrações perto dela e
// persegue o jogador (fuga de local de acidente, avanço de sinal, excesso de velocidade).
import { nearestLane, routeNodes, along } from './world.js';
import { gather } from './peds.js';
import { stepCar } from './player.js';
import { lengthOf } from './traffic.js';

export function createIncidents({ world, T, P, pois, notify, report }) {
  const list = []; const fx = [];
  const station = (id) => pois.find((p) => p.id === id)?.at;
  const H = station('hospital'); const POL = station('policia'); const FIRE = station('bombeiros');
  const chase = { on: false, car: null, level: 0, lost: 0, caught: 0, reason: '', t: 0 };

  // viatura/ambulância/caminhão saindo da base com destino ao local
  function dispatch(kind, inc) {
    const base = kind === 'ambulancia' ? H : kind === 'bombeiros' ? FIRE : POL;
    if (!base) return null;
    const start = nearestLane(world, base[0], base[1] - 30, (l) => !l.narrow);
    const dest = nearestLane(world, inc.x, inc.y, (l) => !l.narrow);
    if (!start || !dest) return null;
    const route = routeNodes(world, start.lane.to.id, dest.lane.from.id, start.lane.edge);
    if (!route) return null;
    const p = along(start.lane.path, start.s);
    const c = { id: `${kind}${Math.random().toString(36).slice(2, 7)}`, sprite: kind, kind, L: lengthOf(kind), W: 12, maxV: 52, temp: true, siren: true, driver: true,
      lane: start.lane, s: start.s, turn: null, ts: 0, x: p.x, y: p.y, a: p.a, v: 0, wait: 0, ghost: 0, route, dest: dest.lane.from.id, target: { lane: dest.lane, s: Math.max(8, dest.s - 14) }, job: { inc, kind, phase: 'indo', t: 0, base } };
    T.cars.push(c); inc.units.push(c);
    return c;
  }
  function create(type, x, y, info = {}) {
    const inc = { id: Math.random().toString(36).slice(2), type, x, y, t: 0, units: [], injured: info.injured || [], fire: info.fire || 0, culprit: info.culprit || false, done: false, ...info };
    list.push(inc);
    gather(P, x, y, type === 'queda-aviao' ? 260 : info.npc ? 240 : 170); // grupos de curiosos se juntam em volta
    if (inc.injured.length || type === 'queda-aviao') dispatch('ambulancia', inc);
    dispatch('policia', inc);
    if (inc.fire) dispatch('bombeiros', inc);
    return inc;
  }
  const addFx = (kind, x, y, secs, scale = 1) => fx.push({ kind, x, y, t: 0, secs, scale });

  // ---- perseguição: viatura sai da patrulha (ou da delegacia) e segue o jogador
  function startChase(level, reason, me) {
    if (chase.on) { chase.level = Math.max(chase.level, level); return; }
    let car = T.cars.filter((c) => c.kind === 'policia' && !c.job && !c.wrecked).sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
    if (!car || Math.hypot(car.x - me.x, car.y - me.y) > 900) {
      const lane = nearestLane(world, me.x + 260, me.y + 260, (l) => !l.narrow) || nearestLane(world, POL[0], POL[1]);
      const p = along(lane.lane.path, lane.s);
      car = { id: `pol${Date.now()}`, sprite: 'policia', kind: 'policia', L: lengthOf('policia'), W: 12, maxV: 60, temp: true, driver: true, lane: lane.lane, s: lane.s, x: p.x, y: p.y, a: p.a, v: 0 };
      T.cars.push(car);
    }
    Object.assign(car, { mode: 'pursuit', siren: true, steer: 0, gear: 'D', speed: 1.2, health: 100, route: [], replan: 0 });
    Object.assign(chase, { on: true, car, level, lost: 0, caught: 0, reason, t: 0 });
    notify('🚨 Perseguição policial', `${reason}. Pare o carro para se entregar ou despiste a viatura.`, 'error');
  }
  function endChase(result, me) {
    const c = chase.car; chase.on = false;
    if (c) { c.mode = null; c.siren = false; c.dest = null; c.route = []; c.target = null; c.maxV = 50; const n = nearestLane(world, c.x, c.y, (l) => !l.narrow); if (n) Object.assign(c, { lane: n.lane, s: n.s, turn: null }); c.temp = true; c.done = Math.hypot(c.x - me.x, c.y - me.y) > 600; }
    report?.({ tipo: result === 'preso' ? 'perseguicao-presa' : 'perseguicao-fuga', motivo: chase.reason, nivel: chase.level });
    if (result === 'preso') notify('🚓 Você foi abordado(a)', 'A polícia aplicou multa por fuga. Pague no Banco → Pendências.', 'error');
    else notify('Você despistou a polícia', 'Mas a ocorrência ficou registrada.', 'warning');
  }
  // controla a viatura em perseguição: pelas ruas (como o trânsito, com sirene e rota até o jogador) e,
  // perto, dirigindo direto até encostar
  const nearNode = (x, y) => Object.values(world.nodes).filter((n) => n.out.length && n.kind !== 'exit').reduce((b, n) => (!b || Math.hypot(n.x - x, n.y - y) < Math.hypot(b.x - x, b.y - y) ? n : b), null);
  function stepChase(dt, me, world2, others) {
    const c = chase.car; if (!c) return;
    chase.t += dt;
    const tgt = me.car || me.plane || me;
    const d = Math.hypot(tgt.x - c.x, tgt.y - c.y);
    if (d > 75) {
      if (c.mode === 'chase') { const n = nearestLane(world, c.x, c.y, (l) => !l.narrow); if (n) Object.assign(c, { lane: n.lane, s: n.s, turn: null }); c.mode = 'pursuit'; }
      c.mode = 'pursuit'; c.maxV = 68;
      c.replan = (c.replan || 0) - dt;
      if (c.replan <= 0) { c.replan = 1.2; const n = nearNode(tgt.x, tgt.y); c.dest = n?.id || null; c.route = []; const tl = nearestLane(world, tgt.x, tgt.y, (l) => !l.narrow); c.target = tl && tl.d < 40 ? { lane: tl.lane, s: Math.max(4, tl.s - 22) } : null; }
    } else {
      c.mode = 'chase'; c.target = null;
      let da = Math.atan2(tgt.y - c.y, tgt.x - c.x) - c.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2;
      const close = d < 34;
      const input = { throttle: close ? 0 : Math.abs(da) > 1.6 ? 0.6 : 1, brake: close ? 1 : 0, steer: Math.max(-1, Math.min(1, da * 2)), hand: 0, autoGear: false };
      if (c.stuck > 1.2) { c.gear = 'R'; input.steer = -input.steer; if (c.stuck > 2.4) { c.stuck = 0; c.gear = 'D'; } } else c.gear = 'D';
      stepCar(c, input, world2, dt, others);
      c.stuck = Math.abs(c.v) < 3 && input.throttle ? (c.stuck || 0) + dt : c.gear === 'R' ? (c.stuck || 0) + dt : Math.max(0, (c.stuck || 0) - dt);
    }
    // abordagem: viatura colada e jogador parado
    if (d < 72 && Math.abs(tgt.v ?? 0) < 8 && (d < 46 || Math.abs(c.v) < 6)) chase.caught += dt; else chase.caught = Math.max(0, chase.caught - dt * 0.5);
    if (chase.caught > 1.6) endChase('preso', me);
    chase.lost = d > 650 ? chase.lost + dt : Math.max(0, chase.lost - dt);
    if (chase.lost > 12) endChase('fuga', me);
  }

  function step(dt, me) {
    for (const inc of list) {
      inc.t += dt;
      for (const u of inc.units) {
        const j = u.job; if (!j || u.done) continue;
        const arrived = j.phase === 'indo' && !u.turn && u.lane === u.target?.lane && u.v < 1 && Math.abs(u.s - u.target.s) < 14;
        if (j.phase === 'indo') {
          j.t += dt;
          // garantia: se travar no caminho, a equipe reaparece um pouco antes do local (pela mesma rua)
          if (j.t > 40 && u.target) { const sp = Math.max(0, u.target.s - 60); const q = along(u.target.lane.path, sp); Object.assign(u, { lane: u.target.lane, s: sp, turn: null, x: q.x, y: q.y, a: q.a, v: 10, route: [], wait: 0 }); j.t = 0; }
        }
        if (arrived || (j.phase === 'indo' && Math.hypot(u.x - inc.x, u.y - inc.y) < 70 && u.v < 1)) { j.phase = 'atendendo'; j.t = 0; u.target = null; u.v = 0; u.wrecked = 0.01; u.hold = true; }
        if (j.phase === 'atendendo') {
          u.wrecked = 0.2; j.t += dt;
          if (j.kind === 'ambulancia' && j.t > 6 && inc.injured.length) { for (const p of inc.injured) { p.state = 'levado'; p.x = -999; } notify('🚑 Ambulância', `${inc.injured.map((p) => p.name).join(', ')} ${inc.injured.length > 1 ? 'foram levados' : 'foi levado(a)'} ao Hospital Nexus.`, 'info'); inc.injured = []; }
          if (j.kind === 'bombeiros' && j.t > 8) inc.fire = 0;
          const done = j.kind === 'ambulancia' ? !inc.injured.length && j.t > 7 : j.kind === 'bombeiros' ? !inc.fire && j.t > 9 : j.t > 14;
          if (done) {
            j.phase = 'voltando'; u.wrecked = 0; u.siren = false; u.hold = false;
            const back = nearestLane(world, j.base[0], j.base[1] - 30, (l) => !l.narrow);
            u.route = back ? routeNodes(world, u.lane.to.id, back.lane.from.id, u.lane.edge) || [] : []; u.dest = back?.lane.from.id || null;
            j.backLane = back?.lane; j.t = 0;
          }
        }
        if (j.phase === 'voltando') { j.t += dt; if ((j.backLane && u.lane === j.backLane) || j.t > 90) u.done = true; }
      }
      if (inc.t > 120 || (inc.units.every((u) => u.done || u.job?.phase === 'voltando') && !inc.injured.length && !inc.fire)) inc.done = true;
      // fuga do local: jogador culpado se afasta antes da polícia chegar
      if (inc.culprit && !inc.fled && !chase.on) { const p = me.car || me.plane || me; if (Math.hypot(p.x - inc.x, p.y - inc.y) > 260 && inc.units.some((u) => u.kind === 'policia' && u.job?.phase === 'indo')) { inc.fled = true; startChase(2, 'Fuga de local de acidente', p); } }
    }
    for (let i = list.length - 1; i >= 0; i--) if (list[i].done) list.splice(i, 1);
    for (const f of fx) f.t += dt;
    for (let i = fx.length - 1; i >= 0; i--) if (fx[i].t > fx[i].secs) fx.splice(i, 1);
  }
  return { list, fx, chase, create, dispatch, addFx, startChase, endChase, stepChase, step };
}
