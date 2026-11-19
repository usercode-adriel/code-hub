// Física de voo (vista de cima com altitude).
// Avião: o motor acompanha a potência com atraso (o giro sobe aos poucos); o empuxo cai com a velocidade; na pista
// há tração dos pneus (atrito de rolagem, freio de roda e aderência lateral que limita a curva); no ar, sustentação
// ∝ v² × ângulo da alavanca, arrasto parasita + arrasto induzido (curvas e nariz alto custam velocidade), gravidade,
// estol abaixo da velocidade mínima. Para decolar: potência máxima, acelerar pela pista e puxar a alavanca
// (abaixar = nariz para cima) quando passar da velocidade de rotação.
// Helicóptero: a alavanca é o coletivo (abaixar = subir), a potência é a velocidade para a frente, gira parado.
// Dano: batidas leves, pouso duro e raspões tiram saúde (o sprite muda para o danificado e solta fumaça); com a
// saúde zerada, ou numa batida forte, a aeronave cai.
import { at, heightAt, RUNWAY, WATER, SOLID } from './world.js';

export const G = 15; // unidades/s²
export function createPlane(spec, x, y, a) {
  const air = spec.air || { thrust: 46, vmax: 230, vstall: 96, turn: 0.95 };
  return { kind: 'aviao', ...spec, air, heli: Boolean(spec.heli || air.climb), x, y, a, v: 0, h: 0, vz: 0, throttle: 0, eng: 0, pitch: 0, lever: 0, bank: 0, ground: true, crashed: false, stall: false, health: spec.health ?? 100, L: spec.L || 44, W: spec.W || 48 };
}
// velocidade de rotação (decolagem) e de toque recomendadas
export const vRotate = (p) => p.air.vstall * 1.08;

// in: { up, down (potência), left, right, pitchUp, pitchDown (teclado), lever (-1..1, alavanca do celular), brake }
export function stepPlane(p, input, world, dt) {
  if (p.crashed) return null;
  if (p.heli) return stepHeli(p, input, world, dt);
  const A = p.air; const hp = Math.max(0, p.health ?? 100) / 100;
  if (input.up) p.throttle = Math.min(1, p.throttle + dt * 0.55);
  if (input.down) p.throttle = Math.max(0, p.throttle - dt * 0.7);
  // alavanca: no celular fica onde foi deixada; no teclado volta ao centro ao soltar
  if (typeof input.lever === 'number') p.lever = input.lever;
  else { const want = input.pitchUp ? 1 : input.pitchDown ? -1 : 0; p.lever += (want - p.lever) * Math.min(1, dt * (want ? 2.4 : 1.4)); }
  p.pitch += (p.lever - p.pitch) * Math.min(1, dt * 2.5);
  const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  p.bank += (steer - p.bank) * Math.min(1, dt * 2.6);
  // motor: o giro segue a potência com atraso; avariado rende menos e "tosse"
  p.eng += (p.throttle - p.eng) * Math.min(1, dt * 1.4);
  const cough = hp < 0.35 ? 0.75 + 0.25 * Math.sin(performance.now() / 160) : 1;
  const thrust = p.eng * A.thrust * (1 - 0.32 * (p.v / A.vmax)) * (0.5 + 0.5 * hp) * cough;
  const surface = at(world, p.x, p.y);
  let drag;
  if (p.ground) {
    // tração na pista: atrito de rolagem (grama prende mais), freio das rodas, resistência do ar
    const rough = surface === RUNWAY ? 1 : 3.2;
    drag = 0.0005 * p.v * p.v + (p.v > 0.5 ? 2.4 * rough + (input.brake && !input.up ? 34 : 0) : 0);
  } else {
    const induced = (Math.abs(p.bank) * 0.5 + Math.max(0, p.pitch) * 0.45) * (A.vstall / Math.max(40, p.v)) * 6;
    drag = 0.00052 * p.v * p.v + induced;
  }
  const climb = p.ground ? 0 : (p.vz / Math.max(40, p.v)) * G; // subir custa velocidade, descer ganha
  p.v = Math.max(0, Math.min(A.vmax, p.v + (thrust - drag - climb) * dt));
  // sustentação
  const cl = (G / (A.vstall * 1.55) ** 2) * (1 + 0.9 * Math.max(-0.6, p.pitch));
  p.stall = !p.ground && p.v < A.vstall;
  const lift = cl * p.v * p.v * (p.stall ? 0.35 : 1) * (0.85 + 0.15 * hp);
  if (p.ground) {
    // curva no chão pela bequilha: aderência lateral limita a curva em alta velocidade
    const grip = Math.min(1, p.v / 22) / (1 + p.v / 70);
    p.a += steer * 1.15 * grip * dt;
    if (p.v > vRotate(p) && p.pitch > 0.3 && lift > G) { p.ground = false; p.vz = 6 + p.pitch * 6; p.h = 1; return { takeoff: true }; }
  } else {
    p.vz += (lift - G - Math.abs(p.bank) * 1.2) * dt; p.vz -= p.vz * 0.6 * dt;
    p.vz = Math.max(-150, Math.min(70, p.vz));
    p.h += p.vz * dt;
    p.a += p.bank * A.turn * Math.min(1, p.v / A.vstall) * dt;
    if (hp < 0.4) p.a += Math.sin(performance.now() / 700) * 0.12 * dt; // avariado: puxa para os lados
  }
  p.x += Math.cos(p.a) * p.v * dt; p.y += Math.sin(p.a) * p.v * dt;
  bounds(p, world, dt);
  if (!p.ground) {
    const hit = obstacle(p, world); if (hit) return hit;
    if (p.h <= 0 && p.vz <= 0) {
      p.h = 0; const okSurface = surface === RUNWAY; const sink = -p.vz;
      if (surface === WATER || sink > 44 || (!okSurface && p.v > 70)) { p.crashed = true; return { crash: surface === WATER ? 'agua' : okSurface ? 'pouso-forte' : 'solo' }; }
      p.ground = true; p.vz = 0;
      let dmg = 0; if (sink > 24) dmg += Math.round((sink - 24) * 2.2); if (!okSurface && p.v > 30) { dmg += Math.round(p.v * 0.6); p.v *= 0.4; }
      return dmg ? { landed: false, damage: dmg, why: okSurface ? 'pouso duro' : 'pouso fora da pista' } : { landed: okSurface };
    }
  } else {
    const c = at(world, p.x, p.y);
    if (c === SOLID && p.v > 4) { const dmg = Math.round(10 + p.v * 0.9); const v = p.v; p.x -= Math.cos(p.a) * v * dt * 2; p.y -= Math.sin(p.a) * v * dt * 2; p.v = 0; p.eng *= 0.5; if (v > 50) { p.crashed = true; return { crash: 'solo' }; } return { damage: dmg, why: 'colisão no solo' }; }
    if (c === WATER && p.v > 5) { p.crashed = true; return { crash: 'agua' }; }
  }
  return null;
}

function stepHeli(p, input, world, dt) {
  const A = p.air; const hp = Math.max(0, p.health ?? 100) / 100;
  if (input.up) p.throttle = Math.min(1, p.throttle + dt * 0.6);
  if (input.down) p.throttle = Math.max(0, p.throttle - dt * 0.8);
  if (typeof input.lever === 'number') p.lever = input.lever;
  else { const want = input.pitchUp ? 1 : input.pitchDown ? -1 : 0; p.lever += (want - p.lever) * Math.min(1, dt * (want ? 2.6 : 2)); }
  const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  p.bank += (steer - p.bank) * Math.min(1, dt * 3);
  p.eng += (Math.max(p.throttle, Math.abs(p.lever) * 0.6, p.ground ? 0 : 0.5) - p.eng) * Math.min(1, dt * 1.5); // rotor
  p.pitch = p.lever;
  // coletivo: alavanca puxada sobe, empurrada desce; centro = pairar (avariado perde altura devagar)
  const target = p.lever * A.climb * (0.55 + 0.45 * hp) - (1 - hp) * 6;
  if (p.ground) {
    p.v = Math.max(0, p.v - 30 * dt);
    if (p.lever > 0.25 && p.eng > 0.3) { p.ground = false; p.h = 1; p.vz = 4; return { takeoff: true }; }
    p.a += steer * 0.8 * dt; return null;
  }
  p.vz += (target - p.vz) * Math.min(1, dt * 1.6);
  p.h = Math.min(420, p.h + p.vz * dt);
  // cíclico: potência = velocidade para a frente (com inércia), freio desacelera
  const vt = p.throttle * A.vmax * (0.6 + 0.4 * hp);
  p.v += (vt - p.v) * Math.min(1, dt * (input.brake ? 1.6 : 0.55));
  p.a += p.bank * A.turn * dt;
  p.x += Math.cos(p.a) * p.v * dt; p.y += Math.sin(p.a) * p.v * dt;
  bounds(p, world, dt);
  const hit = obstacle(p, world); if (hit) return hit;
  if (p.h <= 0) {
    p.h = 0; const c = at(world, p.x, p.y); const sink = -p.vz;
    if (c === WATER) { p.crashed = true; return { crash: 'agua' }; }
    if (sink > 40 || p.v > 70) { p.crashed = true; return { crash: 'solo' }; }
    p.ground = true; p.vz = 0; p.lever = Math.min(p.lever, 0); p.throttle = 0;
    const dmg = (sink > 18 ? Math.round((sink - 18) * 2) : 0) + (p.v > 30 ? Math.round(p.v * 0.5) : 0); p.v = 0;
    return dmg ? { damage: dmg, why: 'pouso duro' } : { landed: true };
  }
  return null;
}

// limites do mapa: faz a curva sozinho para voltar
function bounds(p, world, dt) {
  const b = world.bounds || { x0: 0, y0: 0, x1: world.W, y1: world.H };
  if (p.x < b.x0 + 60 || p.y < b.y0 + 60 || p.x > b.x1 - 60 || p.y > b.y1 - 60) { p.x = Math.max(b.x0 + 40, Math.min(b.x1 - 40, p.x)); p.y = Math.max(b.y0 + 40, Math.min(b.y1 - 40, p.y)); if (!p.ground) p.a += Math.PI * dt; }
}
// obstáculos pela altura (asas e fuselagem): raspão tira saúde e quica para cima; batida de frente derruba
function obstacle(p, world) {
  const c = Math.cos(p.a); const s = Math.sin(p.a);
  for (const [u, w] of [[0, 0], [p.L * 0.4, 0], [0, p.W * 0.4], [0, -p.W * 0.4]]) {
    const hx = p.x + u * c - w * s; const hy = p.y + u * s + w * c;
    const top = heightAt(world, hx, hy); if (top <= 0 || p.h >= top) continue; // chão é tratado no pouso
    const gap = top - p.h;
    if (gap < 16 && (p.health ?? 100) > 30) { p.h = top + 6; p.vz = Math.max(p.vz, 12); p.v *= 0.85; return { damage: Math.round(18 + gap * 1.5), why: 'raspão num telhado' }; }
    p.crashed = true; return { crash: 'predio' };
  }
  return null;
}
export const knots = (v) => Math.round(v * 0.39); // velocidade de exibição
export const feet = (h) => Math.round(h * 2.2);
