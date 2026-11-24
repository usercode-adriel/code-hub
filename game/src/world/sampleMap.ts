// Mapa de exemplo, gerado por código e determinístico, no formato v1. Serve de dado de teste e de mundo inicial.
// Um mapa vindo do editor entra pela mesma interface (SectorSource), sem mudar o resto do jogo.
import { rng } from '../assets/pixel';
import { TILE, TILE_NUM } from '../assets/catalog';
import { MAP_FORMAT, MAP_VERSION, type MapManifest, type PropPlacement, type SectorData, type SectorSource } from './format';

const SECTOR = 16;
const BLOCK = 32; // as ruas se repetem a cada 32 tiles

export function sampleManifest(sectorsW = 8, sectorsH = 8): MapManifest {
  const mid = Math.floor((sectorsW * SECTOR) / 2);
  return {
    format: MAP_FORMAT, version: MAP_VERSION, id: 'exemplo', name: 'Cidade de exemplo',
    tileSize: TILE, sectorSize: SECTOR, sectors: { w: sectorsW, h: sectorsH },
    spawn: { x: (mid + 0.5) * TILE, y: (mid + 0.5) * TILE },
  };
}

function tileAt(gx: number, gy: number, sw: number, sh: number): number {
  const rx = gx % BLOCK, ry = gy % BLOCK;
  const road = (rx === 14 || rx === 15) || (ry === 14 || ry === 15);
  if (road) return TILE_NUM.rua;
  const walk = rx === 13 || rx === 16 || ry === 13 || ry === 16;
  if (walk) return TILE_NUM.calcada;
  // lago no canto do mundo
  const cx = sw * SECTOR * 0.8, cy = sh * SECTOR * 0.2;
  if ((gx - cx) ** 2 + (gy - cy) ** 2 < 70) return TILE_NUM.agua;
  return TILE_NUM.grama;
}

export function sampleSector(sx: number, sy: number, sw: number, sh: number): SectorData {
  const ground: number[] = [];
  for (let y = 0; y < SECTOR; y++) for (let x = 0; x < SECTOR; x++) ground.push(tileAt(sx * SECTOR + x, sy * SECTOR + y, sw, sh));
  const r = rng(sx * 73856093 ^ sy * 19349663 ^ 0x9e3779b1);
  const props: PropPlacement[] = [];
  const taken = new Set<number>();
  const free = (x: number, y: number, w: number, h: number) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (i >= SECTOR || j >= SECTOR || ground[j * SECTOR + i] !== TILE_NUM.grama || taken.has(j * SECTOR + i)) return false;
    }
    return true;
  };
  const take = (x: number, y: number, w: number, h: number) => { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) taken.add(j * SECTOR + i); };
  // casas: base 3×3 tiles, colisor na base inteira
  for (let n = 0; n < 3; n++) {
    const x = Math.floor(r() * (SECTOR - 3)), y = Math.floor(r() * (SECTOR - 3));
    if (free(x, y, 3, 3)) { take(x, y, 3, 3); props.push({ asset: 'prop.casa', tx: x, ty: y, tw: 3, th: 3, collider: { x: 0, y: 0, w: 3 * TILE, h: 3 * TILE } }); }
  }
  // árvores: base 1×1, colisor só no tronco
  for (let n = 0; n < 14; n++) {
    const x = Math.floor(r() * SECTOR), y = Math.floor(r() * SECTOR);
    if (free(x, y, 1, 1)) { take(x, y, 1, 1); props.push({ asset: 'prop.arvore', tx: x, ty: y, tw: 1, th: 1, collider: { x: 10, y: 18, w: 12, h: 12 } }); }
  }
  return { sx, sy, ground, props };
}

export class SampleSource implements SectorSource {
  private readonly m: MapManifest;
  constructor(sectorsW = 8, sectorsH = 8) { this.m = sampleManifest(sectorsW, sectorsH); }
  async manifest(): Promise<MapManifest> { return this.m; }
  async sector(sx: number, sy: number): Promise<SectorData> { return sampleSector(sx, sy, this.m.sectors.w, this.m.sectors.h); }
}
