import { describe, expect, it } from 'vitest';
import { ANIM_FRAMES, DIRECTIONS, TILE, TILE_IDS, buildCatalog } from '../src/assets/catalog';
import { PixelImage } from '../src/assets/pixel';
import { AssetRegistry } from '../src/assets/registry';
import { directionOf } from '../src/character/direction';

describe('PixelImage', () => {
  it('recusa coordenada fracionária em vez de ignorar em silêncio', () => {
    expect(() => new PixelImage(4, 4).set(1.5, 0, 0xffffff)).toThrow(RangeError);
  });
});

describe('AssetRegistry', () => {
  it('recusa id duplicado, asset sem quadros e quadros de tamanhos diferentes', () => {
    const r = new AssetRegistry();
    const img = new PixelImage(4, 4);
    r.register({ id: 'a', kind: 'prop', frames: [img], width: 4, height: 4 });
    expect(() => r.register({ id: 'a', kind: 'prop', frames: [img], width: 4, height: 4 })).toThrow(/duplicado/);
    expect(() => r.register({ id: 'b', kind: 'prop', frames: [], width: 4, height: 4 })).toThrow(/sem quadros/);
    expect(() => r.register({ id: 'c', kind: 'prop', frames: [new PixelImage(5, 4)], width: 4, height: 4 })).toThrow(/difere/);
    expect(() => r.get('nao-existe')).toThrow(/não registrado/);
  });
});

describe('catálogo placeholder', () => {
  const reg = buildCatalog();
  it('registra todos os tiles, com tamanho de tile e água sólida', () => {
    for (const n of TILE_IDS) { const e = reg.get(`tile.${n}`); expect(e.width).toBe(TILE); expect(e.height).toBe(TILE); }
    expect(reg.get('tile.agua').solid).toBe(true);
    expect(reg.get('tile.grama').solid).toBe(false);
  });
  it('o personagem tem 8 direções × 4 quadros, todos desenhados e diferentes entre direções', () => {
    const s = reg.get('sprite.jogador');
    expect(s.frames.length).toBe(DIRECTIONS * ANIM_FRAMES);
    const parados = new Set(Array.from({ length: DIRECTIONS }, (_, d) => s.frames[d * ANIM_FRAMES].hash()));
    expect(parados.size).toBe(DIRECTIONS);
    // todo quadro tem corpo de verdade (não só sombra)
    for (const f of s.frames) expect(f.data.filter((v, i) => i % 4 === 3 && v > 0).length).toBeGreaterThan(250);
    for (const f of s.frames) expect(f.data.some((v, i) => i % 4 === 3 && v > 0)).toBe(true);
  });
  it('é determinístico: duas gerações dão os mesmos pixels', () => {
    const a = buildCatalog().get('tile.grama').frames[0].hash();
    const b = buildCatalog().get('tile.grama').frames[0].hash();
    expect(a).toBe(b);
  });
});

describe('directionOf (8 direções)', () => {
  it('mapeia cada vetor para a direção certa; parado mantém a anterior', () => {
    const casos: Array<[number, number, number]> = [[0, 1, 0], [-1, 1, 1], [-1, 0, 2], [-1, -1, 3], [0, -1, 4], [1, -1, 5], [1, 0, 6], [1, 1, 7]];
    for (const [x, y, d] of casos) expect(directionOf(x, y)).toBe(d);
    expect(directionOf(0, 0, 5)).toBe(5);
  });
});
