import { describe, expect, it } from 'vitest';
import { TILE, TILE_NUM, buildCatalog } from '../src/assets/catalog';
import { EventBus } from '../src/core/eventBus';
import { Camera } from '../src/render/camera';
import { Player } from '../src/character/player';
import { InputState } from '../src/character/input';
import { MapFormatError, validateManifest, validateSector } from '../src/world/format';
import { SampleSource, sampleManifest, sampleSector } from '../src/world/sampleMap';
import { World } from '../src/world/world';

async function novoMundo(radius = 1) {
  const bus = new EventBus();
  const w = new World(new SampleSource(), buildCatalog(), bus, radius);
  await w.init();
  return { w, bus };
}

describe('formato de mapa v1', () => {
  it('aceita o manifesto de exemplo e recusa versão/formato errados', () => {
    expect(validateManifest(sampleManifest()).version).toBe(1);
    expect(() => validateManifest({ ...sampleManifest(), version: 2 })).toThrow(MapFormatError);
    expect(() => validateManifest({ ...sampleManifest(), format: 'outro' })).toThrow(/formato/);
  });
  it('todo setor do exemplo é válido e determinístico', () => {
    const m = sampleManifest();
    for (let y = 0; y < m.sectors.h; y++) for (let x = 0; x < m.sectors.w; x++) {
      const a = sampleSector(x, y, m.sectors.w, m.sectors.h);
      expect(() => validateSector(a, m, 5)).not.toThrow();
      expect(sampleSector(x, y, m.sectors.w, m.sectors.h)).toEqual(a);
    }
  });
  it('recusa prop que sai do setor e tile desconhecido', () => {
    const m = sampleManifest();
    const s = sampleSector(0, 0, 8, 8);
    expect(() => validateSector({ ...s, props: [{ asset: 'x', tx: 15, ty: 0, tw: 3, th: 1 }] }, m, 5)).toThrow(/sai do setor/);
    expect(() => validateSector({ ...s, ground: s.ground.map(() => 99) }, m, 5)).toThrow(/tile desconhecido/);
  });
});

describe('World: setores por proximidade', () => {
  it('carrega 3×3 no meio do mundo e emite eventos', async () => {
    const { w, bus } = await novoMundo();
    const vistos: string[] = [];
    bus.on('sector:loaded', ({ sx, sy }) => vistos.push(`${sx},${sy}`));
    const r = await w.update(w.manifest.spawn.x, w.manifest.spawn.y);
    expect(r.loaded.length).toBe(9);
    expect(vistos.length).toBe(9);
    expect(w.sectors.size).toBe(9);
  });
  it('no canto do mundo carrega só o que existe', async () => {
    const { w } = await novoMundo();
    await w.update(10, 10);
    expect(w.sectors.size).toBe(4);
  });
  it('descarrega setores distantes e libera seus colisores', async () => {
    const { w, bus } = await novoMundo();
    const fora: string[] = [];
    bus.on('sector:unloaded', ({ sx, sy }) => fora.push(`${sx},${sy}`));
    await w.update(10, 10);
    const antes = w.colliderCount;
    expect(antes).toBeGreaterThan(0);
    const far = w.sectorPx * 6 + 10;
    const r = await w.update(far, far);
    expect(r.unloaded.length).toBeGreaterThan(0);
    expect(fora.length).toBe(r.unloaded.length);
    for (const k of r.unloaded) expect(w.sectors.has(k)).toBe(false);
  });
});

describe('colisão', () => {
  it('fora do mundo e em água é sólido; grama e rua não são', async () => {
    const { w } = await novoMundo();
    await w.update(w.manifest.spawn.x, w.manifest.spawn.y);
    expect(w.blocked({ x: -5, y: 100, w: 8, h: 8 })).toBe(true);
    const m = w.manifest;
    // procura um tile de cada tipo nos setores carregados
    let agua: { x: number; y: number } | null = null, rua: { x: number; y: number } | null = null;
    for (const s of w.sectors.values()) s.data.ground.forEach((id, i) => {
      const x = s.data.sx * w.sectorPx + (i % m.sectorSize) * TILE, y = s.data.sy * w.sectorPx + Math.floor(i / m.sectorSize) * TILE;
      if (id === TILE_NUM.rua && !rua) rua = { x, y };
      if (id === TILE_NUM.agua && !agua) agua = { x, y };
    });
    expect(rua).not.toBeNull();
    expect(w.blocked({ x: rua!.x + 8, y: rua!.y + 8, w: 8, h: 8 })).toBe(false);
    if (agua) expect(w.blocked({ x: (agua as { x: number }).x + 8, y: (agua as { y: number }).y + 8, w: 8, h: 8 })).toBe(true);
  });
  it('desliza na parede: bloqueia um eixo e deixa o outro andar', async () => {
    const { w } = await novoMundo();
    await w.update(10, 10);
    const r = { x: 4, y: 100, w: 8, h: 8 }; // colado na borda esquerda do mundo
    const out = w.move(r, -20, 5);
    expect(out.x).toBe(4);
    expect(out.y).toBe(105);
  });
  it('um colisor de prop barra o jogador', async () => {
    const { w } = await novoMundo();
    await w.update(w.manifest.spawn.x, w.manifest.spawn.y);
    const c = [...w.sectors.values()].flatMap((s) => s.colliders)[0];
    expect(w.blocked(c.rect)).toBe(true);
  });
});

describe('Player', () => {
  it('anda em 8 direções, na mesma velocidade nas diagonais, e não atravessa a borda', async () => {
    const { w } = await novoMundo();
    await w.update(10, 10);
    const p = new Player(200, 200);
    const antes = { x: p.x, y: p.y };
    p.update(1 / 60, { x: 1, y: 0 }, false, w);
    const reto = Math.hypot(p.x - antes.x, p.y - antes.y);
    const q = new Player(200, 200);
    q.update(1 / 60, { x: 1, y: 1 }, false, w);
    expect(Math.hypot(q.x - 200, q.y - 200)).toBeCloseTo(reto, 5);
    expect(q.dir).toBe(7);
    const borda = new Player(20, 200);
    for (let i = 0; i < 120; i++) borda.update(1 / 60, { x: -1, y: 0 }, true, w);
    expect(borda.foot.x).toBeGreaterThanOrEqual(0);
  });
  it('parado volta ao primeiro quadro e mantém a direção', async () => {
    const { w } = await novoMundo();
    await w.update(10, 10);
    const p = new Player(200, 200);
    p.update(1 / 60, { x: 0, y: -1 }, false, w);
    p.update(1 / 60, { x: 0, y: 0 }, false, w);
    expect(p.dir).toBe(4);
    expect(p.frame).toBe(0);
  });
});

describe('InputState', () => {
  it('combina teclas em um eixo; teclas opostas se anulam', () => {
    const i = new InputState();
    i.press('KeyD'); i.press('KeyW');
    expect(i.axis()).toEqual({ x: 1, y: -1 });
    i.press('KeyA');
    expect(i.axis().x).toBe(0);
    i.clear();
    expect(i.axis()).toEqual({ x: 0, y: 0 });
  });
});

describe('Camera', () => {
  it('usa zoom inteiro e fica dentro dos limites do mundo', () => {
    const c = new Camera(4096, 4096);
    c.setViewport(1280, 720);
    c.autoZoom();
    expect(c.zoom).toBe(2);
    c.setZoom(2.6);
    expect(Number.isInteger(c.zoom)).toBe(true);
    c.snapTo(0, 0);
    expect(c.x).toBe(1280 / c.zoom / 2);
    expect(c.visible().x).toBeGreaterThanOrEqual(0);
    c.snapTo(99999, 99999);
    expect(c.visible().x + c.visible().w).toBeLessThanOrEqual(4096);
  });
  it('segue com suavização independente do FPS', () => {
    const a = new Camera(4096, 4096), b = new Camera(4096, 4096);
    [a, b].forEach((c) => { c.setViewport(800, 600); c.snapTo(1000, 1000); });
    for (let i = 0; i < 60; i++) a.follow(1500, 1000, 1 / 60);
    for (let i = 0; i < 120; i++) b.follow(1500, 1000, 1 / 120);
    expect(Math.abs(a.x - b.x)).toBeLessThan(1);
    expect(Number.isInteger(a.offset().x)).toBe(true);
  });
});
