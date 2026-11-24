// Jogador: posição dos pés, 8 direções, caminhada/corrida e animação. A colisão usa só os pés (uma caixa pequena),
// o que dá a sensação de profundidade 2.5D: dá para passar "atrás" de árvores e casas.
import { ANIM_FRAMES } from '../assets/catalog';
import type { Rect } from '../world/spatialHash';
import type { World } from '../world/world';
import { directionOf } from './direction';

export const WALK_SPEED = 120; // px/s
export const RUN_SPEED = 200;
export const FOOT_W = 14;
export const FOOT_H = 8;

export class Player {
  /** posição dos pés (centro da base) */
  x: number;
  y: number;
  dir = 0;
  moving = false;
  private anim = 0;

  constructor(x: number, y: number) { this.x = x; this.y = y; }

  get foot(): Rect { return { x: this.x - FOOT_W / 2, y: this.y - FOOT_H, w: FOOT_W, h: FOOT_H }; }
  get frame(): number { return this.moving ? Math.floor(this.anim) % ANIM_FRAMES : 0; }

  update(dt: number, axis: { x: number; y: number }, run: boolean, world: World): void {
    const len = Math.hypot(axis.x, axis.y);
    this.moving = len > 0;
    if (!this.moving) { this.anim = 0; return; }
    const speed = run ? RUN_SPEED : WALK_SPEED;
    const vx = (axis.x / len) * speed * dt, vy = (axis.y / len) * speed * dt;
    this.dir = directionOf(axis.x, axis.y, this.dir);
    const before = this.foot;
    const after = world.move(before, vx, vy);
    this.x += after.x - before.x;
    this.y += after.y - before.y;
    const moved = Math.hypot(after.x - before.x, after.y - before.y);
    this.anim += (moved / (run ? 14 : 18));
    if (moved === 0) this.anim = 0;
  }
}
