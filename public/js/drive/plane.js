// Física de voo (vista de cima com altitude): empuxo, arrasto, sustentação ∝ v², gravidade, estol,
// decolagem na pista, pouso, e colisão com prédios e árvores pela altura real de cada construção.
// Ao soltar os controles a aeronave continua sujeita à gravidade: a potência fica onde estava e o nariz volta ao nível.
import { at, heightAt, RUNWAY } from './world.js';

export const G = 15; // unidades/s²
export function createPlane(spec, x, y, a) {
  const air = spec.air || { thrust: 46, vmax: 230, vstall: 96, turn: 0.95 };
  return { kind: 'aviao', ...spec, air, x, y, a, v: 0, h: 0, vz: 0, throttle: 0, pitch: 0, bank: 0, ground: true, crashed: false, stall: false, L: spec.L || 44, W: spec.W || 48 };
}

// in: { up, down (potência), left, right, pitchUp, pitchDown, brake }
export function stepPlane(p, input, world, dt) {
  if (p.crashed) return null;
  const A = p.air;
  if (input.up) p.throttle = Math.min(1, p.throttle + dt * 0.55);
  if (input.down) p.throttle = Math.max(0, p.throttle - dt * 0.7);
  const want = input.pitchUp ? 1 : input.pitchDown ? -1 : 0;
  p.pitch += (want - p.pitch) * Math.min(1, dt * (want ? 2.2 : 1.2));
  const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  p.bank += (steer - p.bank) * Math.min(1, dt * 3);
  const surface = at(world, p.x, p.y);
  // forças ao longo do movimento
  const thrust = p.throttle * A.thrust;
  const drag = 0.00055 * p.v * p.v * (1 + Math.abs(p.pitch) * 0.6) + (p.ground ? 2.2 + (input.brake ? 38 : 0) : 0);
  const climb = p.ground ? 0 : (p.vz / Math.max(40, p.v)) * G; // subir custa velocidade, descer ganha
  p.v = Math.max(0, Math.min(A.vmax, p.v + (thrust - drag - climb) * dt));
  // sustentação
  const cl = (G / (A.vstall * 1.55) ** 2) * (1 + 0.9 * Math.max(-0.6, p.pitch));
  p.stall = !p.ground && p.v < A.vstall;
  const lift = cl * p.v * p.v * (p.stall ? 0.35 : 1);
  if (p.ground) {
    // rolagem na pista: gira pelo leme; só decola com velocidade e nariz para cima
    const turn = steer * 1.1 * Math.min(1, p.v / 25) / (1 + p.v / 90);
    p.a += turn * dt;
    if (p.v > A.vstall && p.pitch > 0.35 && lift > G) { p.ground = false; p.vz = 8; p.h = 1; return { takeoff: true }; }
  } else {
    p.vz += (lift - G) * dt; p.vz -= p.vz * 0.6 * dt;
    p.vz = Math.max(-140, Math.min(70, p.vz));
    p.h += p.vz * dt;
    p.a += p.bank * A.turn * Math.min(1, p.v / A.vstall) * dt;
  }
  p.x += Math.cos(p.a) * p.v * dt; p.y += Math.sin(p.a) * p.v * dt;
  // limites do mapa: faz a curva sozinho para voltar
  const b = world.bounds || { x0: 0, y0: 0, x1: world.W, y1: world.H };
  if (p.x < b.x0 + 60 || p.y < b.y0 + 60 || p.x > b.x1 - 60 || p.y > b.y1 - 60) { p.x = Math.max(b.x0 + 40, Math.min(b.x1 - 40, p.x)); p.y = Math.max(b.y0 + 40, Math.min(b.y1 - 40, p.y)); if (!p.ground) p.a += Math.PI * dt; }
  // obstáculos pela altura (asas e fuselagem)
  if (!p.ground) {
    for (const [u, w] of [[0, 0], [p.L * 0.4, 0], [0, p.W * 0.4], [0, -p.W * 0.4]]) {
      const c = Math.cos(p.a); const s = Math.sin(p.a);
      const hx = p.x + u * c - w * s; const hy = p.y + u * s + w * c;
      if (p.h < heightAt(world, hx, hy)) { p.crashed = true; return { crash: 'predio' }; }
    }
    if (p.h <= 0 && p.vz <= 0) {
      p.h = 0;
      const okSurface = surface === RUNWAY;
      if (p.vz < -42 || (!okSurface && p.v > 30)) { p.crashed = true; return { crash: okSurface ? 'pouso-forte' : 'solo' }; }
      p.ground = true; p.vz = 0; return { landed: okSurface };
    }
  } else if (surface !== RUNWAY && p.v > 20 && !at(world, p.x, p.y)) { p.crashed = true; return { crash: 'solo' }; }
  else if (surface !== RUNWAY && p.v > 30) { p.v *= 0.9; } // fora da pista: grama freia
  return null;
}
export const knots = (v) => Math.round(v * 0.39); // velocidade de exibição
export const feet = (h) => Math.round(h * 2.2);
