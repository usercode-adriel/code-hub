// FORMATO DE MAPA v1 (documentado em docs/jogo/formatos.md).
// Um mapa é um manifesto + setores. Cada setor é um quadrado de `sectorSize` × `sectorSize` tiles, carregado
// sob demanda por proximidade. Os dois lados (editor e jogo) usam este mesmo formato.
export const MAP_FORMAT = 'codeniac-map';
export const MAP_VERSION = 1;

export interface MapManifest {
  format: typeof MAP_FORMAT;
  version: number;
  id: string;
  name: string;
  tileSize: number;
  sectorSize: number;
  /** tamanho do mundo, em setores */
  sectors: { w: number; h: number };
  spawn: { x: number; y: number };
}

export interface PropPlacement {
  asset: string;
  /** tile do canto superior esquerdo da base, local ao setor */
  tx: number;
  ty: number;
  /** tamanho da base em tiles */
  tw: number;
  th: number;
  /** colisor em pixels, relativo ao canto superior esquerdo da base; sem colisor, o prop é só decoração */
  collider?: { x: number; y: number; w: number; h: number };
}

export interface SectorData {
  sx: number;
  sy: number;
  /** sectorSize² ids de tile, em linhas */
  ground: number[];
  props: PropPlacement[];
}

export interface SectorSource {
  manifest(): Promise<MapManifest>;
  sector(sx: number, sy: number): Promise<SectorData>;
}

export class MapFormatError extends Error {}

export function validateManifest(m: unknown): MapManifest {
  const x = m as Partial<MapManifest>;
  if (!x || typeof x !== 'object') throw new MapFormatError('manifesto inválido');
  if (x.format !== MAP_FORMAT) throw new MapFormatError(`formato desconhecido: ${String(x.format)}`);
  if (x.version !== MAP_VERSION) throw new MapFormatError(`versão ${String(x.version)} não suportada (esperada ${MAP_VERSION})`);
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0;
  if (!ok(x.tileSize) || !ok(x.sectorSize) || !ok(x.sectors?.w) || !ok(x.sectors?.h)) throw new MapFormatError('tamanhos inválidos');
  if (!x.spawn || typeof x.spawn.x !== 'number' || typeof x.spawn.y !== 'number') throw new MapFormatError('spawn inválido');
  return x as MapManifest;
}

export function validateSector(s: SectorData, m: MapManifest, knownTiles: number): SectorData {
  if (s.sx < 0 || s.sy < 0 || s.sx >= m.sectors.w || s.sy >= m.sectors.h) throw new MapFormatError(`setor fora do mundo: ${s.sx},${s.sy}`);
  if (s.ground.length !== m.sectorSize * m.sectorSize) throw new MapFormatError(`setor ${s.sx},${s.sy}: tamanho do terreno incorreto`);
  if (s.ground.some((t) => !Number.isInteger(t) || t < 0 || t >= knownTiles)) throw new MapFormatError(`setor ${s.sx},${s.sy}: tile desconhecido`);
  for (const p of s.props) {
    if (p.tx < 0 || p.ty < 0 || p.tx + p.tw > m.sectorSize || p.ty + p.th > m.sectorSize) throw new MapFormatError(`setor ${s.sx},${s.sy}: prop ${p.asset} sai do setor`);
  }
  return s;
}
