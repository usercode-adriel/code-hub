// Acidentes de trânsito entre os moradores: de tempos em tempos um motorista se distrai (avança o sinal, não
// freia para o carro da frente ou para quem atravessa fora da faixa). A colisão é de verdade: o carro distraído
// segue sem frear e, quando encosta em outro carro ou numa pessoa, há batida ou atropelamento. O ferido fica
// caído no local até a ambulância chegar e é levado ao hospital (depois de um tempo volta a andar pela cidade);
// curiosos se juntam em volta; a ocorrência vai para o servidor (notícia e post de uma testemunha).
import { along } from './world.js';
import { respawnNear } from './peds.js';
import { pickTraffic } from './traffic.js';

export function createAccidents({ T, P, INC, report, regionAt, notify }) {
  const S = { timer: 45 + Math.random() * 40, reckless: [], wrecks: [], hosp: [] };
  const free = (c) => !c.temp && !c.siren && !c.job && !c.mode && !(c.wrecked > 0) && !c.reckless && c.kind !== 'policia';
  const inView = (o, v, k = 0.85) => Math.hypot(o.x - v.x, o.y - v.y) < v.r * k;

  // batida: carro distraído atrás de outro na mesma faixa (ou chegando num cruzamento com fila)
  function tryCrash(view) {
    const cands = T.cars.filter((c) => free(c) && !c.turn && c.v > 12 && inView(c, view));
    for (const c of cands.sort(() => Math.random() - 0.5)) {
      const lead = T.cars.find((o) => o !== c && !o.temp && o.lane === c.lane && !o.turn && o.s - c.s > 30 && o.s - c.s < 140);
      if (!lead) continue;
      c.reckless = { kind: 'carro', t: 0, target: lead }; c.maxV0 = c.maxV; c.maxV = Math.max(c.maxV, 56);
      S.reckless.push(c); return true;
    }
    return false;
  }
  // atropelamento: alguém atravessa fora da faixa e o motorista distraído não freia
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

  // vítima: no atropelamento é quem foi atingido; na batida, um morador vira o motorista ferido
  function driverVictim(car, view) {
    const far = P.peds.filter((p) => p.real && p.state === 'walk' && Math.hypot(p.x - view.x, p.y - view.y) > view.r + 120);
    const p = far[Math.floor(Math.random() * far.length)] || P.peds.find((x) => x.state === 'walk' && !inView(x, view, 1));
    if (!p) return null;
    const side = car.a + Math.PI / 2; p.x = car.x + Math.cos(side) * 12; p.y = car.y + Math.sin(side) * 12; p.state = 'ferido'; p.cross = null; p.jay = null;
    return p;
  }
  function crash(c, o, view) {
    for (const k of [c, o]) { k.wrecked = 999; k.smoke = 1; k.v = 0; k.reckless = null; }
    const x = (c.x + o.x) / 2; const y = (c.y + o.y) / 2;
    INC.addFx('fumaca', x, y - 4, 6, 1.2);
    const victims = [driverVictim(o, view), Math.random() < 0.35 ? driverVictim(c, view) : null].filter(Boolean);
    const inc = INC.create('acidente', x, y, { injured: victims, npc: true });
    S.wrecks.push({ cars: [c, o], inc, t: 0 });
    for (const v of victims) report({ tipo: 'acidente', personaId: v.real ? v.id : null, nome: v.real ? v.name : null, regiao: regionAt({ x, y }), culpa: false, npc: true });
    if (!victims.length) report({ tipo: 'acidente', regiao: regionAt({ x, y }), culpa: false, npc: true });
    if (inView({ x, y }, view, 1.4)) notify('💥 Acidente de trânsito', `Batida em ${regionAt({ x, y })}${victims.length ? `: ${victims.map((v) => v.name).join(' e ')} ferido(s)` : ''}. Ambulância a caminho.`, 'warning');
  }
  function hitPed(c, p, view) {
    p.state = 'ferido'; p.jay = null; p.cross = null;
    c.v = 0; c.wrecked = 25; c.reckless = null; if (c.maxV0) c.maxV = c.maxV0;
    const inc = INC.create('atropelamento', p.x, p.y, { injured: [p], npc: true });
    S.wrecks.push({ cars: [], inc, t: 0 });
    report({ tipo: 'atropelamento', personaId: p.real ? p.id : null, nome: p.real ? p.name : 'Pedestre', regiao: regionAt(p), culpa: false, npc: true });
    if (inView(p, view, 1.4)) notify('🚑 Atropelamento', `${p.real ? p.name : 'Um pedestre'} foi atropelado(a) em ${regionAt(p)}. A ambulância está a caminho.`, 'warning');
  }

  function step(dt, view) {
    // agenda do próximo acidente (só quando não há outros em andamento por perto)
    S.timer -= dt;
    if (S.timer <= 0) {
      const busy = S.reckless.length || S.wrecks.some((w) => !w.inc.done);
      const ok = !busy && (Math.random() < 0.55 ? tryCrash(view) || tryPed(view) : tryPed(view) || tryCrash(view));
      S.timer = ok ? 120 + Math.random() * 150 : 12;
    }
    // motorista distraído: procura colisão de verdade com carros e pessoas
    for (let i = S.reckless.length - 1; i >= 0; i--) {
      const c = S.reckless[i]; const r = c.reckless;
      if (!r) { S.reckless.splice(i, 1); continue; }
      r.t += dt;
      let hit = false;
      for (const o of T.cars) {
        if (o === c || o.temp) continue;
        if (Math.abs(o.x - c.x) > 40 || Math.abs(o.y - c.y) > 40) continue;
        if (Math.hypot(o.x - c.x, o.y - c.y) < (c.L + o.L) / 2 - 3) { crash(c, o, view); hit = true; break; }
      }
      if (!hit) for (const p of P.peds) {
        if (p.state !== 'jay' && p.state !== 'cross') continue;
        if (Math.hypot(p.x - c.x, p.y - c.y) < 7 && c.v > 8) { hitPed(c, p, view); hit = true; break; }
      }
      if (hit) { S.reckless.splice(i, 1); continue; }
      if (r.t > 14) { if (r.kind === 'pessoa' && r.target.state === 'jay') r.target.state = 'walk'; c.reckless = null; if (c.maxV0) c.maxV = c.maxV0; S.reckless.splice(i, 1); }
    }
    // depois do atendimento: carros batidos são rebocados (e outros entram no trânsito); feridos voltam do hospital
    for (let i = S.wrecks.length - 1; i >= 0; i--) {
      const w = S.wrecks[i]; w.t += dt;
      if ((w.inc.done && w.t > 30) || w.t > 160) {
        for (const c of w.cars) { c.done = true; T.add(pickTraffic(5), view); }
        S.wrecks.splice(i, 1);
      }
    }
    for (const p of P.peds) if (p.state === 'levado') { p.hosp = (p.hosp ?? 150) - dt; if (p.hosp <= 0) { p.hosp = null; p.state = 'walk'; respawnNear(P, p, view); } }
  }
  return { step, S, tryCrash, tryPed };
}
