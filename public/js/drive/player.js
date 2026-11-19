// VehicleSystem + DrivingController — direção simples e gostosa de explorar (não é corrida):
// aceleração progressiva, frenagem gradual, inércia ao soltar, curvas suaves, freio de mão, ré e marcha D/N/R.
// Colide com prédios, calçadas, obstáculos e outros carros; a pé, só anda em calçadas, faixas e estacionamentos.
import { at, canDrive, canFoot, WATER } from './world.js';

export const PHYS = { accel: 30, brake: 95, hand: 150, drag: 9, roll: 3, maxF: 62, maxR: 15, turn: 2.3 };
export const WALK_V = 24;

// pontos de contato do carro (cantos, frente e traseira)
function corners(x, y, a, L, W) {
  const c = Math.cos(a); const s = Math.sin(a); const h = L / 2; const w = W / 2;
  return [[h, 0], [h, w], [h, -w], [-h, w], [-h, -w], [-h, 0], [0, w], [0, -w]].map(([u, v]) => [x + u * c - v * s, y + u * s + v * c]);
}
const fits = (world, x, y, a, L, W) => corners(x, y, a, L, W).every(([px, py]) => canDrive(at(world, px, py)));
const hitCar = (x, y, a, L, others) => {
  const c = Math.cos(a); const s = Math.sin(a);
  for (const o of others) {
    if (Math.abs(o.x - x) > 40 || Math.abs(o.y - y) > 40) continue;
    const oc = Math.cos(o.a); const os = Math.sin(o.a);
    for (const k of [-0.3, 0, 0.3]) for (const j of [-0.3, 0, 0.3]) {
      const ax = x + c * L * k; const ay = y + s * L * k; const bx = o.x + oc * (o.L || 20) * j; const by = o.y + os * (o.L || 20) * j;
      if (Math.hypot(ax - bx, ay - by) < 9.5) return o;
    }
  }
  return null;
};

// in: { throttle, brake, steer (-1..1), hand, reverse (teclado: S parado = ré) }
export function stepCar(car, input, world, dt, others) {
  const spd = car.speed || 1;
  // marcha: no teclado, segurar S parado engata a ré; W com ré engatada e parado volta para D
  if (input.autoGear) {
    if (input.brake && car.v < 1 && car.gear !== 'R') car.gear = 'R';
    else if (input.throttle && car.v > -1 && car.gear === 'R') car.gear = 'D';
  }
  const dirG = car.gear === 'D' ? 1 : car.gear === 'R' ? -1 : 0;
  let pedal = input.autoGear && car.gear === 'R' ? (input.brake ? 1 : 0) : input.throttle;
  if ((car.health ?? 100) <= 0) pedal = 0; // inutilizado: o motor não responde
  const braking = input.autoGear ? (car.gear === 'R' ? input.throttle : input.brake) : input.brake;
  let v = car.v;
  if (pedal && dirG) v += dirG * PHYS.accel * spd * dt * (1 - Math.min(0.85, Math.abs(v) / (PHYS.maxF * spd * 1.1)));
  if (braking) v -= Math.sign(v) * Math.min(Math.abs(v), PHYS.brake * dt);
  if (input.hand) v -= Math.sign(v) * Math.min(Math.abs(v), PHYS.hand * dt);
  if (!pedal) v -= Math.sign(v) * Math.min(Math.abs(v), (PHYS.drag + Math.abs(v) * 0.05) * dt); // inércia
  v = Math.max(-PHYS.maxR, Math.min(PHYS.maxF * spd, v));
  // direção suave, gira menos em alta velocidade, nada parado
  car.steer += (input.steer - car.steer) * Math.min(1, dt * 7);
  const grip = input.hand ? 1.35 : 1;
  const turn = car.steer * PHYS.turn * grip * Math.min(1, Math.abs(v) / 18) / (1 + Math.abs(v) / 70) * Math.sign(v);
  const na = car.a + turn * dt;
  const nx = car.x + Math.cos(na) * v * dt; const ny = car.y + Math.sin(na) * v * dt;
  car.hit = null;
  const other = hitCar(nx, ny, na, car.L, others);
  if (fits(world, nx, ny, na, car.L, car.W) && !other) { car.x = nx; car.y = ny; car.a = na; car.v = v; return; }
  // desliza junto da parede (tenta só um dos eixos) e perde velocidade
  if (!other && fits(world, nx, car.y, na, car.L, car.W)) { car.x = nx; car.a = na; car.v = v * 0.6; car.hit = 'raspou'; return; }
  if (!other && fits(world, car.x, ny, na, car.L, car.W)) { car.y = ny; car.a = na; car.v = v * 0.6; car.hit = 'raspou'; return; }
  if (fits(world, car.x, car.y, na, car.L, car.W) && !hitCar(car.x, car.y, na, car.L, others)) car.a = na;
  car.hit = other ? 'carro' : 'parede'; car.impact = Math.abs(v); car.hitWith = other || null; car.v = -v * 0.2;
}
// dano pela batida: só impactos fortes contam (km/h ≈ v × 0,72)
export function crashDamage(impact) { return impact < 22 ? 0 : Math.min(100, (impact - 18) * 1.6); }

export function stepWalker(me, input, world, dt, blockers) {
  const dx = input.mx; const dy = input.my; const m = Math.hypot(dx, dy);
  if (m < 0.08) { me.moving = false; return; }
  const swim = at(world, me.x, me.y) === WATER; me.swim = swim;
  const k = Math.min(1, m) * (swim ? 0.45 : 1); const vx = (dx / m) * WALK_V * k; const vy = (dy / m) * WALK_V * k;
  me.a = Math.atan2(vy, vx); me.moving = true;
  const free = (x, y) => canFoot(at(world, x, y)) && !blockers.some((o) => Math.abs(o.x - x) < 11 && Math.abs(o.y - y) < 11 && Math.hypot(o.x - x, o.y - y) < (o.L || 20) / 2 + 2);
  const nx = me.x + vx * dt; const ny = me.y + vy * dt;
  if (free(nx, ny)) { me.x = nx; me.y = ny; } else if (free(nx, me.y)) me.x = nx; else if (free(me.x, ny)) me.y = ny;
}
