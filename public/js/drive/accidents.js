// Diretor de acidentes de trânsito: cenas programadas que acontecem de vez em quando, uma por vez, perto de onde o
// jogador está. Um motorista se distrai (avança o sinal, não freia) e a colisão é de verdade (retângulos dos carros).
//
// BATIDA entre carros → os dois ficam danificados e soltando fumaça; os motoristas saem e conversam frente a frente.
//   Caminho 1: a polícia chega, o policial conversa com os dois, vem um guincho por carro, os carros são rebocados
//              para a oficina e os motoristas vão embora com a polícia.
//   Caminho 2: só os guinchos aparecem, rebocam os carros e cada motorista vai junto no guincho.
// ATROPELAMENTO → a pessoa cai e fica no local; o motorista sai e vai até ela; um grupo de pessoas se aglomera em
//   volta; a ambulância chega e leva a vítima ao hospital; a aglomeração se desfaz e o motorista segue viagem.
// Tudo vira notícia e post de testemunha no servidor (report). O jogador também dispara as cenas quando bate num
// carro de morador ou atropela alguém.
import { along, nearestWalk, canWalk } from './world.js';
import { respawnNear, gather } from './peds.js';
import { pickTraffic } from './traffic.js';
import { obb } from './obst.js';

const LINES = {
  batida: [['Você não viu o sinal?!', 'Foi mal, eu me distraí...'], ['Olha o estado do meu carro!', 'Calma, o seguro cobre.'], ['Você estava rápido demais!', 'Eu? Você que freou do nada!'], ['Alguém se machucou?', 'Não, só o susto mesmo.']],
  policia: ['Documentos, por favor.', 'Alguém ferido?', 'Vou registrar a ocorrência.', 'O guincho já está a caminho.', 'Os dois vêm comigo prestar depoimento.'],
  atropelo: ['Meu Deus! Você está bem?!', 'Chamem uma ambulância!', 'Ela apareceu do nada...', 'Não mexam nela!'],
  roda: ['Chama a ambulância!', 'Coitada...', 'Ela tá respirando?', 'Que susto!', 'Afasta, dá espaço!'],
};
const pick = (l) => l[Math.floor(Math.random() * l.length)];

export function createAccidents({ world, T, P, INC, report, regionAt, notify, chrFor }) {
  const S = { timer: 50 + Math.random() * 40, reckless: [], scenes: [], actors: [] };
  const free = (c) => !c.temp && !c.siren && !c.job && !c.mode && !(c.wrecked > 0) && !c.reckless && !c.sceneHold && !c.towedBy && c.kind !== 'policia';
  const inView = (o, v, k = 0.85) => Math.hypot(o.x - v.x, o.y - v.y) < v.r * k;

  // ---------------------------------------------------------------- atores (motoristas e policial a pé)
  function actor(spr, x, y, name = null) { const a = { spr, x, y, a: Math.PI / 2, to: null, v: 9, face: null, say: null, name, t: 0, gone: false, onArrive: null }; S.actors.push(a); return a; }
  const say = (a, text, secs = 2.6) => { if (a && !a.gone) a.say = { text, until: performance.now() + secs * 1000 }; };
  const walkTo = (a, to, then) => { a.to = to; a.onArrive = then || null; };
  const door = (c, out = 6) => { const ca = Math.cos(c.a); const sa = Math.sin(c.a); const lx = c.L * 0.05; const ly = -(c.W / 2 + out); return [c.x + lx * ca - ly * sa, c.y + lx * sa + ly * ca]; };
  // morador com nome que está longe vira o motorista (sai da simulação durante a cena e volta depois)
  function borrow(view) {
    const far = P.peds.filter((p) => p.real && p.state === 'walk' && Math.hypot(p.x - view.x, p.y - view.y) > view.r + 150);
    const p = far[Math.floor(Math.random() * far.length)]; if (!p) return null;
    p.state = 'cena'; return p;
  }
  const giveBack = (p, view) => { if (p && p.state === 'cena') { p.state = 'walk'; respawnNear(P, p, view); } };
  // o motorista sai do carro sentindo a batida (reação de dor da folha de referência) e depois se recompõe
  function driverFor(c, view) { const p = borrow(view); const [x, y] = door(c); const a = actor(p?.spr || chrFor({ id: `mot${Math.random()}` }), x, y, p?.name || null); a.ped = p; a.react = { kind: 'dor', t0: performance.now(), dur: 2.6, face: Math.random() < 0.5 ? 1 : -1 }; return a; }

  // ---------------------------------------------------------------- início das cenas
  function crashScene(cars, view, { police = Math.random() < 0.55, culprit = false, playerCar = null } = {}) {
    for (const k of cars) { k.wrecked = 9999; k.smoke = 1; k.v = 0; k.reckless = null; k.sceneHold = true; if (k.maxV0) k.maxV = k.maxV0; }
    const x = cars.reduce((s, k) => s + k.x, 0) / cars.length; const y = cars.reduce((s, k) => s + k.y, 0) / cars.length;
    INC.addFx('fumaca', x, y - 4, 5, 1.1);
    const inc = INC.create('acidente', x, y, { units: police ? ['policia'] : [], npc: !culprit, culprit, injured: [] });
    const sc = { kind: 'batida', phase: 'impacto', t: 0, line: 0, cars, police, playerCar, inc, x, y, drivers: [], trucks: [], officer: null, active: true };
    inc.scene = sc; S.scenes.push(sc);
    const reg = regionAt({ x, y });
    if (!culprit) {
      setTimeout(() => report({ tipo: police ? 'batida-policia' : 'batida-guincho', nomes: sc.drivers.map((d) => d.name).filter(Boolean), regiao: reg, culpa: false, npc: true }), 2500);
      if (inView({ x, y }, view, 1.4)) notify('💥 Batida', `Dois carros bateram em ${reg}. ${police ? 'A polícia está a caminho.' : 'Os motoristas chamaram o guincho.'}`, 'warning');
    }
    return sc;
  }
  function pedScene(victim, car, view, { culprit = false } = {}) {
    victim.state = 'ferido'; victim.jay = null; victim.cross = null; victim.say = { text: 'Ai...', until: performance.now() + 3000 };
    if (car) { car.v = 0; car.sceneHold = true; car.reckless = null; if (car.maxV0) car.maxV = car.maxV0; }
    const inc = INC.create('atropelamento', victim.x, victim.y, { injured: [victim], units: culprit ? ['ambulancia', 'policia'] : ['ambulancia'], npc: !culprit, culprit, noCrowd: true });
    const sc = { kind: 'atropelamento', phase: 'impacto', t: 0, car, victim, inc, x: victim.x, y: victim.y, ring: [], driver: null, active: true };
    inc.scene = sc; S.scenes.push(sc);
    if (!culprit) {
      report({ tipo: 'atropelamento', personaId: victim.real ? victim.id : null, nome: victim.real ? victim.name : 'Pedestre', regiao: regionAt(victim), culpa: false, npc: true, kmh: Math.round((car?.v || 0) * 0.72) });
      if (inView(victim, view, 1.4)) notify('🚑 Atropelamento', `${victim.real ? victim.name : 'Um pedestre'} foi atropelado(a) em ${regionAt(victim)}. A ambulância está a caminho.`, 'warning');
    }
    return sc;
  }

  // aglomeração em volta da vítima: os mais próximos formam uma roda; os outros olham da calçada
  function crowd(sc) {
    gather(P, sc.x, sc.y, 240, 999);
    const car = sc.car; const avoid = car ? Math.atan2(car.y - sc.y, car.x - sc.x) : null;
    // roda de 6 a 9 pessoas: curiosos mais próximos e quem passa por perto (até 320) vem ver de perto
    const dist = (p) => Math.hypot(p.x - sc.x, p.y - sc.y);
    const near = P.peds.filter((p) => (p.state === 'olhando' && dist(p) < 200) || (p.state === 'walk' && dist(p) < 320)).sort((a, b) => dist(a) - dist(b)).slice(0, 6 + Math.floor(Math.random() * 4));
    near.forEach((p, i) => {
      let ang = (i / near.length) * Math.PI * 2 + 0.3;
      if (avoid != null) { let d = ang - avoid; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; if (Math.abs(d) < 0.7) ang += 1.4; }
      const r = 12 + Math.random() * 6;
      p.state = 'roda'; p.roda = { to: [sc.x + Math.cos(ang) * r, sc.y + Math.sin(ang) * r], at: [sc.x, sc.y] }; sc.ring.push(p);
    });
  }
  function disperse(sc) {
    for (const p of sc.ring) if (p.state === 'roda') p.state = 'volta';
    for (const p of P.peds) if (p.state === 'olhando' && p.lookAt && Math.hypot(p.lookAt[0] - sc.x, p.lookAt[1] - sc.y) < 5) p.look = Math.random() * 2;
  }

  // ---------------------------------------------------------------- andamento das cenas
  function stepCrash(sc, dt, view) {
    sc.t += dt; sc.pt = (sc.pt || 0) + dt;
    const units = sc.inc.units; const pol = units.find((u) => u.kind === 'policia');
    if (pol && pol.release === undefined) pol.release = false;
    const meet = () => {
      // os motoristas param na calçada ao lado do acidente, frente a frente
      const w = nearestWalk(world, sc.x, sc.y, 50, canWalk) || [sc.x, sc.y + 16]; const k = sc.cars[0]; const ca = Math.cos(k.a); const sa = Math.sin(k.a);
      return [[w[0] - ca * 5, w[1] - sa * 5], [w[0] + ca * 5, w[1] + sa * 5], [w[0] + sa * 4, w[1] - ca * 4]];
    };
    if (sc.phase === 'impacto' && sc.t > 1.4) {
      const spots = meet(); sc.spots = spots;
      sc.cars.forEach((k, i) => { const d = driverFor(k, view); sc.drivers.push(d); walkTo(d, spots[i % 2]); });
      if (sc.playerCar) { const d = sc.drivers[0]; d.face = [sc.playerCar.x, sc.playerCar.y]; setTimeout(() => say(d, 'Ei! Você bateu no meu carro!', 3.5), 1500); }
      sc.phase = 'conversa'; sc.pt = 0;
    }
    if (sc.phase === 'conversa' || sc.phase === 'policia') {
      const [a, b] = sc.drivers;
      if (a && b && !a.to && !b.to) { a.face = [b.x, b.y]; b.face = [a.x, a.y]; }
      sc.lt = (sc.lt || 0) - dt;
      if (sc.lt <= 0 && a && (!a.to)) { sc.lt = 2.4; const pair = sc.pair || (sc.pair = pick(LINES.batida)); const who = sc.line % 2 === 0 ? a : b || a; if (sc.phase === 'conversa' && sc.line < 4) say(who, pair[sc.line % 2]); sc.line++; }
    }
    if (sc.phase === 'conversa') {
      if (sc.police) {
        if (pol?.job?.phase === 'atendendo' && !sc.officer) {
          const [x, y] = door(pol); sc.officer = actor('chr/policial', x, y, 'Policial'); walkTo(sc.officer, sc.spots[2], () => { sc.officer.face = [sc.drivers[0].x, sc.drivers[0].y]; });
          sc.phase = 'policia'; sc.pt = 0;
        } else if (!pol && sc.pt > 30) sc.police = false; // viatura não conseguiu sair: segue só com o guincho
      } else if (sc.pt > 9) towTrucks(sc);
    }
    if (sc.phase === 'policia') {
      const o = sc.officer;
      if (!o.to) { sc.ot = (sc.ot || 0) - dt; if (sc.ot <= 0) { sc.ot = 3; const l = LINES.policia[Math.min(LINES.policia.length - 1, sc.oi = (sc.oi || 0) + 1) - 1]; say(o, l, 2.8); for (const d of sc.drivers) d.face = [o.x, o.y]; } }
      if (sc.pt > 11) towTrucks(sc);
    }
    if (sc.phase === 'guincho') {
      for (const u of sc.trucks) {
        if (u.towing || u.job?.phase !== 'atendendo') continue;
        u.hookT = (u.hookT || 0) + dt;
        if (u.hookT > 3) { const car = u.forCar; car.towedBy = u; car.hookAnim = 0; car.sceneHold = false; u.towing = car; }
      }
      if (sc.trucks.length && sc.trucks.every((u) => u.towing) && !sc.leaving) {
        sc.leaving = true; sc.pt = 0;
        if (sc.police && pol) {
          // motoristas e policial entram na viatura; a polícia vai embora depois deles
          const ppl = [...sc.drivers, sc.officer].filter(Boolean); let left = ppl.length;
          for (const d of ppl) walkTo(d, door(pol, 3), () => { d.gone = true; if (--left <= 0) pol.release = true; });
          for (const u of sc.trucks) u.release = true;
        } else {
          sc.drivers.forEach((d, i) => { const u = sc.trucks[i % sc.trucks.length]; walkTo(d, door(u, 3), () => { d.gone = true; u.release = true; }); });
          if (!sc.drivers.length) for (const u of sc.trucks) u.release = true;
        }
      }
      if (sc.leaving && sc.pt > 25) { for (const d of sc.drivers) d.gone = true; if (sc.officer) sc.officer.gone = true; if (pol) pol.release = true; for (const u of sc.trucks) u.release = true; }
      if (sc.leaving && sc.trucks.every((u) => u.done || !T.cars.includes(u))) end(sc, view);
    }
    if (sc.t > 400) end(sc, view);
  }
  function towTrucks(sc) {
    sc.phase = 'guincho';
    for (const car of sc.cars) {
      const u = INC.dispatch('guincho', sc.inc, { at: [car.x, car.y], back: 30 });
      if (u) { u.forCar = car; u.release = false; sc.trucks.push(u); }
      else { car.done = true; } // sem caminho para o guincho: o carro sai de cena
    }
  }
  function stepPed(sc, dt, view) {
    sc.t += dt;
    if (sc.phase === 'impacto' && sc.t > 1.2) {
      if (sc.car) { const [x, y] = door(sc.car); const d = actor(chrFor({ id: `mot${Math.random()}` }), x, y); sc.driver = d; const ang = Math.atan2(y - sc.y, x - sc.x); walkTo(d, [sc.x + Math.cos(ang) * 8, sc.y + Math.sin(ang) * 8], () => { d.face = [sc.x, sc.y]; say(d, LINES.atropelo[0], 3); }); }
      crowd(sc); sc.phase = 'aglomera'; sc.lt = 3.5;
    }
    if (sc.phase === 'aglomera') {
      sc.lt -= dt;
      if (sc.lt <= 0) { sc.lt = 2.8; const r = sc.ring.filter((p) => p.state === 'roda'); const who = Math.random() < 0.3 && sc.driver ? sc.driver : r[Math.floor(Math.random() * r.length)]; if (who) who.say = { text: who === sc.driver ? pick(LINES.atropelo) : pick(LINES.roda), until: performance.now() + 2600 }; }
      if (sc.victim.state === 'levado' || sc.inc.taken) {
        sc.phase = 'dispersa'; sc.pt = 0; disperse(sc);
        if (sc.driver) walkTo(sc.driver, door(sc.car, 3), () => { sc.driver.gone = true; });
      }
    }
    if (sc.phase === 'dispersa') {
      sc.pt += dt;
      if ((!sc.driver || sc.driver.gone) && sc.pt > 2) { if (sc.car) { sc.car.sceneHold = false; sc.car.smoke = 0; } end(sc, view); }
      if (sc.pt > 30) { if (sc.driver) sc.driver.gone = true; if (sc.car) sc.car.sceneHold = false; end(sc, view); }
    }
    if (sc.t > 300) { disperse(sc); if (sc.car) sc.car.sceneHold = false; if (sc.driver) sc.driver.gone = true; end(sc, view); }
  }
  function end(sc, view) {
    if (!sc.active) return; sc.active = false;
    if (sc.kind === 'batida') {
      for (const k of sc.cars) { k.done = true; k.towedBy = null; if (!k.temp) T.add(pickTraffic(5), view); }
      for (const d of sc.drivers) { d.gone = true; giveBack(d.ped, view); }
      if (sc.officer) sc.officer.gone = true;
    }
  }

  // ---------------------------------------------------------------- disparo (motorista distraído)
  function tryCrash(view) {
    const cands = T.cars.filter((c) => free(c) && !c.turn && c.v > 12 && inView(c, view));
    for (const c of cands.sort(() => Math.random() - 0.5)) {
      const lead = T.cars.find((o) => o !== c && free(o) && o.lane === c.lane && !o.turn && o.s - c.s > 30 && o.s - c.s < 140);
      if (!lead) continue;
      c.reckless = { kind: 'carro', t: 0, target: lead }; c.maxV0 = c.maxV; c.maxV = Math.max(c.maxV, 56);
      S.reckless.push(c); return true;
    }
    return false;
  }
  function tryPed(view) {
    const cands = T.cars.filter((c) => free(c) && !c.turn && c.v > 14 && inView(c, view) && c.lane.path.len - c.s > 140);
    for (const c of cands.sort(() => Math.random() - 0.5)) {
      const sHit = c.s + 70 + Math.random() * 50; const q = along(c.lane.path, sHit);
      if (T.cars.some((o) => o !== c && o.lane === c.lane && o.s > c.s && o.s < sHit + 30)) continue; // pista livre até o ponto
      const ped = P.peds.filter((p) => p.state === 'walk' && !p.pause && Math.hypot(p.x - q.x, p.y - q.y) < 70).sort((a, b) => (b.real - a.real) || Math.hypot(a.x - q.x, a.y - q.y) - Math.hypot(b.x - q.x, b.y - q.y))[0];
      if (!ped) continue;
      const d = Math.hypot(ped.x - q.x, ped.y - q.y); const tCar = (sHit - c.s) / Math.max(20, c.v);
      ped.state = 'jay'; ped.jay = { to: [q.x + (q.x - ped.x) * 1.2, q.y + (q.y - ped.y) * 1.2], v: Math.max(5, Math.min(16, d / tCar)) }; ped.pause = 0;
      c.reckless = { kind: 'pessoa', t: 0, target: ped }; S.reckless.push(c); return true;
    }
    return false;
  }
  const busy = () => S.reckless.length || S.scenes.some((s) => s.active);

  function step(dt, view) {
    // agenda: uma cena por vez, de tempos em tempos, perto do jogador
    S.timer -= dt;
    if (S.timer <= 0) {
      const ok = !busy() && (Math.random() < 0.55 ? tryCrash(view) || tryPed(view) : tryPed(view) || tryCrash(view));
      S.timer = ok ? 140 + Math.random() * 160 : busy() ? 20 : 12;
    }
    // motorista distraído: colisão de verdade com carros (retângulos) e pessoas
    for (let i = S.reckless.length - 1; i >= 0; i--) {
      const c = S.reckless[i]; const r = c.reckless;
      if (!r) { S.reckless.splice(i, 1); continue; }
      r.t += dt; let hit = false;
      for (const o of T.cars) {
        if (o === c || o.temp || o.towedBy) continue;
        if (Math.abs(o.x - c.x) > 40 || Math.abs(o.y - c.y) > 40) continue;
        if (obb(c, o, 0.5)) { crashScene([c, o], view); hit = true; break; }
      }
      if (!hit) for (const p of P.peds) {
        if (p.state !== 'jay' && p.state !== 'cross') continue;
        if (Math.hypot(p.x - c.x, p.y - c.y) < 7 && c.v > 8) { pedScene(p, c, view); hit = true; break; }
      }
      if (hit) { S.reckless.splice(i, 1); continue; }
      if (r.t > 14) { if (r.kind === 'pessoa' && r.target.state === 'jay') r.target.state = 'walk'; c.reckless = null; if (c.maxV0) c.maxV = c.maxV0; S.reckless.splice(i, 1); }
    }
    for (const sc of S.scenes) if (sc.active) (sc.kind === 'batida' ? stepCrash : stepPed)(sc, dt, view);
    for (let i = S.scenes.length - 1; i >= 0; i--) if (!S.scenes[i].active) S.scenes.splice(i, 1);
    // carro no guincho: sobe na traseira do caminhão e vai junto
    for (const c of T.cars) {
      const u = c.towedBy; if (!u) continue;
      if (u.done || !T.cars.includes(u)) { c.done = true; continue; }
      const back = u.L / 2 + c.L / 2 - 3; const tx = u.x - Math.cos(u.a) * back; const ty = u.y - Math.sin(u.a) * back;
      c.hookAnim = Math.min(1, (c.hookAnim ?? 1) + dt / 1.6); const k = c.hookAnim;
      c.x += (tx - c.x) * (k < 1 ? dt * 2.5 : 1); c.y += (ty - c.y) * (k < 1 ? dt * 2.5 : 1);
      let da = u.a - c.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; c.a += da * (k < 1 ? dt * 2.5 : 1);
    }
    // atores a pé
    for (let i = S.actors.length - 1; i >= 0; i--) {
      const a = S.actors[i]; if (a.gone) { S.actors.splice(i, 1); continue; }
      if (a.to) {
        const dx = a.to[0] - a.x; const dy = a.to[1] - a.y; const d = Math.hypot(dx, dy); const st = a.v * dt;
        if (d <= st) { a.x = a.to[0]; a.y = a.to[1]; a.to = null; const f = a.onArrive; a.onArrive = null; f?.(); } else { a.x += (dx / d) * st; a.y += (dy / d) * st; a.a = Math.atan2(dy, dx); a.t += st; }
      } else if (a.face) a.a = Math.atan2(a.face[1] - a.y, a.face[0] - a.x);
    }
    // feridos voltam do hospital depois de um tempo
    for (const p of P.peds) if (p.state === 'levado') { p.hosp = (p.hosp ?? 150) - dt; if (p.hosp <= 0) { p.hosp = null; p.state = 'walk'; respawnNear(P, p, view); } }
  }
  return { step, S, tryCrash, tryPed, crashScene, pedScene, busy };
}
