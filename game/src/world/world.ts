// World Engine: mantém os setores carregados perto do jogador, descarrega os distantes e responde
// perguntas de colisão (tiles sólidos + colisores de props em um Spatial Hash).
import type { AssetRegistry } from '../assets/registry';
import { TILE_IDS } from '../assets/catalog';
import type { EventBus } from '../core/eventBus';
import { validateManifest, validateSector, type MapManifest, type PropPlacement, type SectorData, type SectorSource } from './format';
import { SpatialHash, type Rect } from './spatialHash';

export interface Collider { rect: Rect; sector: string }
export interface LoadedSector { data: SectorData; colliders: Collider[] }

const keyOf = (sx: number, sy: number) => `${sx},${sy}`;

export class World {
  manifest!: MapManifest;
  readonly sectors = new Map<string, LoadedSector>();
  private readonly hash = new SpatialHash<Collider>(64);
  private readonly pending = new Set<string>();
  private solidByTile: boolean[] = [];

  constructor(
    private readonly source: SectorSource,
    private readonly registry: AssetRegistry,
    private readonly bus: EventBus,
    /** quantos setores ao redor do jogador ficam carregados (1 → 3×3) */
    readonly loadRadius = 1,
  ) {}

  async init(): Promise<void> {
    this.manifest = validateManifest(await this.source.manifest());
    this.solidByTile = TILE_IDS.map((n) => this.registry.get(`tile.${n}`).solid === true);
  }

  get tilePx(): number { return this.manifest.tileSize; }
  get sectorPx(): number { return this.manifest.tileSize * this.manifest.sectorSize; }
  get widthPx(): number { return this.sectorPx * this.manifest.sectors.w; }
  get heightPx(): number { return this.sectorPx * this.manifest.sectors.h; }

  sectorOf(x: number, y: number): { sx: number; sy: number } {
    return { sx: Math.floor(x / this.sectorPx), sy: Math.floor(y / this.sectorPx) };
  }

  /** Carrega o que falta e descarrega o que ficou longe. Devolve os setores que entraram e saíram. */
  async update(px: number, py: number): Promise<{ loaded: string[]; unloaded: string[] }> {
    const { sx, sy } = this.sectorOf(px, py);
    const want = new Set<string>();
    for (let y = sy - this.loadRadius; y <= sy + this.loadRadius; y++) {
      for (let x = sx - this.loadRadius; x <= sx + this.loadRadius; x++) {
        if (x >= 0 && y >= 0 && x < this.manifest.sectors.w && y < this.manifest.sectors.h) want.add(keyOf(x, y));
      }
    }
    const loaded: string[] = [];
    const unloaded: string[] = [];
    for (const k of [...this.sectors.keys()]) {
      // histerese de 1 setor: só descarrega quando passa do raio + 1, evitando recarregar na fronteira
      const [kx, ky] = k.split(',').map(Number);
      if (!want.has(k) && Math.max(Math.abs(kx - sx), Math.abs(ky - sy)) > this.loadRadius + 1) { this.drop(k); unloaded.push(k); }
    }
    await Promise.all([...want].filter((k) => !this.sectors.has(k) && !this.pending.has(k)).map(async (k) => {
      this.pending.add(k);
      try {
        const [x, y] = k.split(',').map(Number);
        const data = validateSector(await this.source.sector(x, y), this.manifest, this.solidByTile.length);
        this.sectors.set(k, { data, colliders: this.buildColliders(data) });
        for (const c of this.sectors.get(k)!.colliders) this.hash.insert(c);
        loaded.push(k);
        this.bus.emit('sector:loaded', { sx: x, sy: y });
      } finally { this.pending.delete(k); }
    }));
    for (const k of unloaded) { const [x, y] = k.split(',').map(Number); this.bus.emit('sector:unloaded', { sx: x, sy: y }); }
    return { loaded, unloaded };
  }

  private drop(k: string): void {
    const s = this.sectors.get(k);
    if (!s) return;
    for (const c of s.colliders) this.hash.remove(c);
    this.sectors.delete(k);
  }

  private buildColliders(d: SectorData): Collider[] {
    const out: Collider[] = [];
    const ox = d.sx * this.sectorPx, oy = d.sy * this.sectorPx;
    for (const p of d.props) {
      if (!p.collider) continue;
      out.push({ sector: keyOf(d.sx, d.sy), rect: { x: ox + p.tx * this.tilePx + p.collider.x, y: oy + p.ty * this.tilePx + p.collider.y, w: p.collider.w, h: p.collider.h } });
    }
    return out;
  }

  tileAtPx(x: number, y: number): number | null {
    if (x < 0 || y < 0 || x >= this.widthPx || y >= this.heightPx) return null;
    const { sx, sy } = this.sectorOf(x, y);
    const s = this.sectors.get(keyOf(sx, sy));
    if (!s) return null;
    const lx = Math.floor((x - sx * this.sectorPx) / this.tilePx), ly = Math.floor((y - sy * this.sectorPx) / this.tilePx);
    return s.data.ground[ly * this.manifest.sectorSize + lx];
  }

  /** O retângulo bate em algo sólido? Fora do mundo ou em setor ainda não carregado conta como sólido. */
  blocked(r: Rect): boolean {
    const t = this.tilePx;
    for (let ty = Math.floor(r.y / t); ty <= Math.floor((r.y + r.h - 0.001) / t); ty++) {
      for (let tx = Math.floor(r.x / t); tx <= Math.floor((r.x + r.w - 0.001) / t); tx++) {
        const id = this.tileAtPx(tx * t + 1, ty * t + 1);
        if (id === null || this.solidByTile[id]) return true;
      }
    }
    return this.hash.query(r).length > 0;
  }

  /** Move um retângulo por (dx, dy) resolvendo cada eixo separado: deslizar na parede em vez de grudar. */
  move(r: Rect, dx: number, dy: number): Rect {
    let out = { ...r };
    if (dx !== 0) { const t = { ...out, x: out.x + dx }; if (!this.blocked(t)) out = t; }
    if (dy !== 0) { const t = { ...out, y: out.y + dy }; if (!this.blocked(t)) out = t; }
    return out;
  }

  propsOf(k: string): PropPlacement[] { return this.sectors.get(k)?.data.props ?? []; }
  get colliderCount(): number { return this.hash.size; }
}
