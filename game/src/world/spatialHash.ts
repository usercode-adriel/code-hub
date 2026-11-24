// Spatial Hash: grade esparsa para achar colisores perto de um ponto sem varrer o mundo inteiro.
export interface Rect { x: number; y: number; w: number; h: number }

export const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export class SpatialHash<T extends { rect: Rect }> {
  private cells = new Map<number, Set<T>>();
  private owners = new Map<T, number[]>();
  constructor(private readonly cell = 64) {}

  private key(cx: number, cy: number): number { return (cx + 32768) * 65536 + (cy + 32768); }

  private cellsOf(r: Rect): number[] {
    const x0 = Math.floor(r.x / this.cell), x1 = Math.floor((r.x + r.w) / this.cell);
    const y0 = Math.floor(r.y / this.cell), y1 = Math.floor((r.y + r.h) / this.cell);
    const keys: number[] = [];
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) keys.push(this.key(cx, cy));
    return keys;
  }

  insert(item: T): void {
    const keys = this.cellsOf(item.rect);
    for (const k of keys) {
      let set = this.cells.get(k);
      if (!set) { set = new Set(); this.cells.set(k, set); }
      set.add(item);
    }
    this.owners.set(item, keys);
  }

  remove(item: T): void {
    const keys = this.owners.get(item);
    if (!keys) return;
    for (const k of keys) {
      const set = this.cells.get(k);
      set?.delete(item);
      if (set && set.size === 0) this.cells.delete(k);
    }
    this.owners.delete(item);
  }

  /** Itens cujo retângulo cruza `area`. */
  query(area: Rect): T[] {
    const found = new Set<T>();
    for (const k of this.cellsOf(area)) {
      const set = this.cells.get(k);
      if (!set) continue;
      for (const it of set) if (overlaps(it.rect, area)) found.add(it);
    }
    return [...found];
  }

  get size(): number { return this.owners.size; }
}
