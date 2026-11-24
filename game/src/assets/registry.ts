// Asset Registry: ponto único para registrar e achar assets por id. Nada no jogo carrega arquivo por
// caminho solto: tudo passa por aqui, com tipo, tamanho e validação.
import type { PixelImage } from './pixel';

export type AssetKind = 'tile' | 'prop' | 'sprite';

export interface AssetEntry {
  id: string;
  kind: AssetKind;
  /** quadros: tiles e props têm 1; sprites de personagem têm direções × quadros de animação */
  frames: PixelImage[];
  width: number;
  height: number;
  /** tiles: bloqueia a passagem? */
  solid?: boolean;
  /** quantos quadros por animação, quando é sprite (ex.: 4) */
  framesPerAnim?: number;
}

export class AssetRegistry {
  private entries = new Map<string, AssetEntry>();

  register(entry: AssetEntry): void {
    if (this.entries.has(entry.id)) throw new Error(`asset duplicado: ${entry.id}`);
    if (entry.frames.length === 0) throw new Error(`asset sem quadros: ${entry.id}`);
    for (const f of entry.frames) {
      if (f.width !== entry.width || f.height !== entry.height) {
        throw new Error(`asset ${entry.id}: quadro ${f.width}x${f.height} difere de ${entry.width}x${entry.height}`);
      }
    }
    this.entries.set(entry.id, entry);
  }

  has(id: string): boolean { return this.entries.has(id); }

  get(id: string): AssetEntry {
    const e = this.entries.get(id);
    if (!e) throw new Error(`asset não registrado: ${id}`);
    return e;
  }

  list(kind?: AssetKind): AssetEntry[] {
    return [...this.entries.values()].filter((e) => !kind || e.kind === kind);
  }

  get size(): number { return this.entries.size; }
}
