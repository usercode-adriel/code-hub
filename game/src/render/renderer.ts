// Renderer (PixiJS): converte o estado do jogo em sprites. Não decide nada de jogo.
// Camadas: terreno (um sprite por setor) → entidades ordenadas por Y (props e jogador).
import { Application, Container, Sprite, Texture } from 'pixi.js';
import type { AssetRegistry } from '../assets/registry';
import type { PixelImage } from '../assets/pixel';
import { ANIM_FRAMES, TILE_IDS } from '../assets/catalog';
import type { Player } from '../character/player';
import type { LoadedSector, World } from '../world/world';
import type { Camera } from './camera';

function toTexture(img: PixelImage): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = img.width; canvas.height = img.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  const tex = Texture.from(canvas);
  tex.source.scaleMode = 'nearest';
  return tex;
}

export class Renderer {
  readonly app = new Application();
  private readonly worldLayer = new Container();
  private readonly ground = new Container();
  private readonly entities = new Container();
  private readonly textures = new Map<string, Texture[]>();
  private readonly sectorNodes = new Map<string, { ground: Sprite; props: Sprite[] }>();
  private playerSprite!: Sprite;

  constructor(private readonly registry: AssetRegistry, private readonly world: World) {}

  async init(host: HTMLElement): Promise<void> {
    await this.app.init({ resizeTo: host, background: '#0b1020', antialias: false, roundPixels: true, autoStart: false, preference: 'webgl' });
    host.appendChild(this.app.canvas);
    this.entities.sortableChildren = true;
    this.worldLayer.addChild(this.ground, this.entities);
    this.app.stage.addChild(this.worldLayer);
    this.playerSprite = new Sprite();
    this.playerSprite.anchor.set(0.5, 1);
    this.entities.addChild(this.playerSprite);
  }

  get viewport(): { w: number; h: number } { return { w: this.app.screen.width, h: this.app.screen.height }; }
  get spriteCount(): number { return this.ground.children.length + this.entities.children.length; }

  private texturesOf(id: string): Texture[] {
    let t = this.textures.get(id);
    if (!t) { t = this.registry.get(id).frames.map(toTexture); this.textures.set(id, t); }
    return t;
  }

  /** Monta o terreno de um setor inteiro numa textura só (1 sprite em vez de 256). */
  private composeGround(s: LoadedSector): Texture {
    const m = this.world.manifest;
    const size = m.sectorSize * m.tileSize;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const tiles = TILE_IDS.map((n) => this.registry.get(`tile.${n}`).frames[0]);
    const cache = tiles.map((img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0); return c; });
    for (let i = 0; i < s.data.ground.length; i++) ctx.drawImage(cache[s.data.ground[i]], (i % m.sectorSize) * m.tileSize, Math.floor(i / m.sectorSize) * m.tileSize);
    const tex = Texture.from(canvas);
    tex.source.scaleMode = 'nearest';
    return tex;
  }

  addSector(key: string, s: LoadedSector): void {
    if (this.sectorNodes.has(key)) return;
    const sp = this.world.sectorPx, t = this.world.tilePx;
    const g = new Sprite(this.composeGround(s));
    g.position.set(s.data.sx * sp, s.data.sy * sp);
    this.ground.addChild(g);
    const props: Sprite[] = [];
    for (const p of s.data.props) {
      const entry = this.registry.get(p.asset);
      const sprite = new Sprite(this.texturesOf(p.asset)[0]);
      const baseBottom = s.data.sy * sp + (p.ty + p.th) * t;
      sprite.anchor.set(0.5, 1);
      sprite.position.set(s.data.sx * sp + (p.tx + p.tw / 2) * t, baseBottom);
      sprite.zIndex = baseBottom; // Y-sort pela base (o "pé" do objeto)
      void entry;
      this.entities.addChild(sprite);
      props.push(sprite);
    }
    this.sectorNodes.set(key, { ground: g, props });
  }

  removeSector(key: string): void {
    const n = this.sectorNodes.get(key);
    if (!n) return;
    n.ground.destroy({ texture: true, textureSource: true });
    for (const s of n.props) s.destroy();
    this.sectorNodes.delete(key);
  }

  render(player: Player, camera: Camera): void {
    const frames = this.texturesOf('sprite.jogador');
    this.playerSprite.texture = frames[player.dir * ANIM_FRAMES + player.frame];
    this.playerSprite.position.set(Math.round(player.x), Math.round(player.y));
    this.playerSprite.zIndex = player.y;
    const off = camera.offset();
    this.worldLayer.scale.set(camera.zoom);
    this.worldLayer.position.set(off.x, off.y);
    this.app.render();
  }

  destroy(): void { this.app.destroy(true, { children: true, texture: true }); }
}
