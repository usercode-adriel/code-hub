import { describe, expect, it } from 'vitest';
import { EventBus } from '../src/core/eventBus';
import { FixedLoop, STEP_MS } from '../src/core/loop';
import { SceneStack, type Scene } from '../src/core/scene';
import { SpatialHash } from '../src/world/spatialHash';

describe('EventBus', () => {
  it('entrega o payload e permite cancelar a inscrição', () => {
    const bus = new EventBus();
    const got: number[] = [];
    const off = bus.on('player:moved', (p) => got.push(p.x));
    bus.emit('player:moved', { x: 1, y: 0, dir: 0 });
    off();
    bus.emit('player:moved', { x: 2, y: 0, dir: 0 });
    expect(got).toEqual([1]);
    expect(bus.listenerCount('player:moved')).toBe(0);
  });
  it('um handler pode se remover durante a emissão', () => {
    const bus = new EventBus();
    let n = 0;
    const off = bus.on('sector:loaded', () => { n++; off(); });
    bus.on('sector:loaded', () => { n++; });
    bus.emit('sector:loaded', { sx: 0, sy: 0 });
    expect(n).toBe(2);
  });
});

describe('FixedLoop', () => {
  it('roda a simulação em passos fixos, independente do tempo do quadro', () => {
    let updates = 0, renders = 0;
    const loop = new FixedLoop(() => updates++, () => renders++);
    loop.advance(STEP_MS * 3.5);
    expect(updates).toBe(3);
    expect(renders).toBe(1);
    loop.advance(STEP_MS * 0.6); // resto 0,5 + 0,6 = 1,1 passo
    expect(updates).toBe(4);
  });
  it('limita os passos por quadro depois de uma pausa longa', () => {
    let updates = 0;
    const loop = new FixedLoop(() => updates++, () => {});
    loop.advance(60_000);
    expect(updates).toBeLessThanOrEqual(5);
  });
});

describe('SceneStack', () => {
  it('entra e sai das cenas na ordem certa', async () => {
    const log: string[] = [];
    const mk = (n: string): Scene => ({ enter: () => { log.push(`+${n}`); }, update() {}, render() {}, exit: () => { log.push(`-${n}`); } });
    const s = new SceneStack();
    await s.push(mk('a'));
    await s.replace(mk('b'));
    expect(log).toEqual(['+a', '-a', '+b']);
    expect(s.size).toBe(1);
  });
});

describe('SpatialHash', () => {
  const box = (x: number, y: number, w = 10, h = 10) => ({ rect: { x, y, w, h } });
  it('acha só o que cruza a área, inclusive itens que ocupam várias células', () => {
    const h = new SpatialHash<ReturnType<typeof box>>(64);
    const a = box(0, 0), b = box(500, 500), wide = box(0, 100, 300, 10);
    [a, b, wide].forEach((i) => h.insert(i));
    expect(h.query({ x: 5, y: 5, w: 2, h: 2 })).toEqual([a]);
    expect(h.query({ x: 250, y: 102, w: 5, h: 5 })).toEqual([wide]);
    expect(h.query({ x: 1000, y: 1000, w: 5, h: 5 })).toEqual([]);
  });
  it('remove sem deixar resto', () => {
    const h = new SpatialHash<ReturnType<typeof box>>(64);
    const a = box(0, 0, 200, 200);
    h.insert(a); h.remove(a);
    expect(h.size).toBe(0);
    expect(h.query({ x: 0, y: 0, w: 200, h: 200 })).toEqual([]);
  });
});
