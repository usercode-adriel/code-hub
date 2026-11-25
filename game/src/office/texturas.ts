// TEXTURAS: converte a arte (PixelImage) em texturas do PixiJS, com cache e filtro "nearest" (pixel art nítida). Também carrega
// PNGs importados no Asset Studio (pelo backend, com o token do usuário) e recorta quadros de spritesheets.
import { Rectangle, Texture } from 'pixi.js';
import type { PixelImage } from '../assets/pixel';
import { desenharObjeto, type ObjetoArte } from './arte/moveis';
import { desenharParede, texturaPiso, type Parede } from './arte/chao';
import { criarSheetProcedural, paletaPadrao } from './arte/personagem';
import type { SheetDef } from './animacoes';

export function paraTextura(img: PixelImage): Texture {
  const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  const t = Texture.from(canvas); t.source.scaleMode = 'nearest'; return t;
}

export interface TexObjeto { tex: Texture; ox: number; oy: number; arte: ObjetoArte }
export interface TexParede { tex: Texture; ox: number; oy: number; arte: Parede }

export class Texturas {
  private pisos = new Map<string, Texture>();
  private objetos = new Map<string, TexObjeto>();
  private paredes = new Map<string, TexParede>();
  private sheets = new Map<string, { base: Texture; def: SheetDef }>();
  private quadros = new Map<string, Texture>();
  private externas = new Map<string, Texture | null>();
  private pendentes = new Set<string>();
  constructor(private readonly aoCarregar: () => void = () => {}, private readonly token: () => string = () => '') {}

  private canvasesPiso = new Map<string, HTMLCanvasElement>();
  /** Canvas do tile de piso (usado para assar pedaços do chão). */
  canvasPiso(tipo: string): HTMLCanvasElement {
    let c = this.canvasesPiso.get(tipo);
    if (!c) { const img = texturaPiso(tipo); c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0); this.canvasesPiso.set(tipo, c); }
    return c;
  }
  piso(tipo: string): Texture { let t = this.pisos.get(tipo); if (!t) { t = paraTextura(texturaPiso(tipo)); this.pisos.set(tipo, t); } return t; }
  objeto(tipo: string, rot: number): TexObjeto {
    const k = `${tipo}|${rot % 4}`; let o = this.objetos.get(k);
    if (!o) { const arte = desenharObjeto(tipo, rot % 4); o = { tex: paraTextura(arte.img), ox: arte.ox, oy: arte.oy, arte }; this.objetos.set(k, o); }
    return o;
  }
  parede(lado: 'N' | 'W', tipo: string, abertura: 'porta' | 'janela' | null): TexParede {
    const k = `${lado}|${tipo}|${abertura ?? ''}`; let p = this.paredes.get(k);
    if (!p) { const arte = desenharParede(lado, tipo, abertura); p = { tex: paraTextura(arte.img), ox: arte.ox, oy: arte.oy, arte }; this.paredes.set(k, p); }
    return p;
  }

  /** Spritesheet procedural do funcionário (cacheada pela chave). */
  sheetProcedural(chave: string): { base: Texture; def: SheetDef } {
    const k = `proc:${chave}`; let s = this.sheets.get(k);
    if (!s) { const { img, def } = criarSheetProcedural(chave, paletaPadrao(chave)); s = { base: paraTextura(img), def }; this.sheets.set(k, s); }
    return s;
  }
  /** Spritesheet importada: devolve null até o PNG terminar de carregar (e avisa quando chegar). */
  sheetImportada(def: SheetDef): { base: Texture; def: SheetDef } | null {
    const k = `imp:${def.id}`; const ja = this.sheets.get(k); if (ja) return { base: ja.base, def };
    if (def.assetId) { const t = this.externa(def.assetId); if (t) { const s = { base: t, def }; this.sheets.set(k, s); return s; } }
    return null;
  }
  quadro(sheet: { base: Texture; def: SheetDef }, linha: number, coluna: number): Texture {
    const k = `${sheet.def.id}|${linha}|${coluna}`; let t = this.quadros.get(k);
    if (!t) { t = new Texture({ source: sheet.base.source, frame: new Rectangle(coluna * sheet.def.quadroL, linha * sheet.def.quadroA, sheet.def.quadroL, sheet.def.quadroA) }); this.quadros.set(k, t); }
    return t;
  }

  /** PNG do Asset Studio. Carrega em segundo plano; enquanto isso devolve null. */
  externa(assetId: string): Texture | null {
    if (this.externas.has(assetId)) return this.externas.get(assetId) ?? null;
    if (this.pendentes.has(assetId)) return null;
    this.pendentes.add(assetId);
    const img = new Image();
    img.onload = () => { const t = Texture.from(img); t.source.scaleMode = 'nearest'; this.externas.set(assetId, t); this.pendentes.delete(assetId); this.aoCarregar(); };
    img.onerror = () => { this.externas.set(assetId, null); this.pendentes.delete(assetId); };
    img.src = `/api/commerce/assets/${encodeURIComponent(assetId)}/arquivo?token=${encodeURIComponent(this.token())}`;
    return null;
  }
  invalidarExterna(assetId: string): void { this.externas.delete(assetId); for (const k of [...this.sheets.keys()]) if (k.startsWith('imp:')) this.sheets.delete(k); this.quadros.clear(); }
}
