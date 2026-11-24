// Game Core: junta os engines (mundo, personagem, câmera, renderer) e roda o loop.
import { buildCatalog } from './assets/catalog';
import { Player } from './character/player';
import { InputState, bindKeyboard } from './character/input';
import { EventBus, type FrameStats } from './core/eventBus';
import { FixedLoop } from './core/loop';
import { Camera } from './render/camera';
import { Renderer } from './render/renderer';
import { SampleSource } from './world/sampleMap';
import type { SectorSource } from './world/format';
import { World } from './world/world';

export interface GameOptions { source?: SectorSource }

export class Game {
  readonly bus = new EventBus();
  readonly registry = buildCatalog();
  readonly input = new InputState();
  world!: World;
  player!: Player;
  camera!: Camera;
  renderer!: Renderer;
  private loop!: FixedLoop;
  private raf = 0;
  private last = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private fpsValue = 0;
  private frameMsValue = 0;
  private statsAcc = 0;
  private unbind: () => void = () => {};
  private loading = false;
  private ready = false;

  constructor(private readonly host: HTMLElement, private readonly opts: GameOptions = {}) {}

  async start(): Promise<void> {
    this.world = new World(this.opts.source ?? new SampleSource(), this.registry, this.bus);
    await this.world.init();
    const m = this.world.manifest;
    this.player = new Player(m.spawn.x, m.spawn.y);
    this.camera = new Camera(this.world.widthPx, this.world.heightPx);
    this.renderer = new Renderer(this.registry, this.world);
    await this.renderer.init(this.host);
    this.bus.on('sector:unloaded', ({ sx, sy }) => this.renderer.removeSector(`${sx},${sy}`));
    await this.syncSectors();
    const v = this.renderer.viewport;
    this.camera.setViewport(v.w, v.h); this.camera.autoZoom();
    this.camera.snapTo(this.player.x, this.player.y);
    this.unbind = bindKeyboard(this.input, window, (code) => {
      if (code === 'Equal' || code === 'NumpadAdd') this.camera.setZoom(this.camera.zoom + 1);
      if (code === 'Minus' || code === 'NumpadSubtract') this.camera.setZoom(this.camera.zoom - 1);
    });
    this.loop = new FixedLoop((dt) => this.update(dt), (a) => this.draw(a));
    this.ready = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private async syncSectors(): Promise<void> {
    const r = await this.world.update(this.player.x, this.player.y);
    for (const k of r.loaded) this.renderer.addSector(k, this.world.sectors.get(k)!);
  }

  private update(dt: number): void {
    const a = this.input.axis();
    this.player.update(dt, a, this.input.run, this.world);
    this.camera.follow(this.player.x, this.player.y, dt);
    if (this.player.moving) this.bus.emit('player:moved', { x: this.player.x, y: this.player.y, dir: this.player.dir });
    // setores novos entram quando o jogador cruza para outro setor (a checagem é barata)
    const s = this.world.sectorOf(this.player.x, this.player.y);
    if (s.sx !== this.lastSx || s.sy !== this.lastSy) {
      this.lastSx = s.sx; this.lastSy = s.sy;
      if (!this.loading) { this.loading = true; void this.syncSectors().finally(() => { this.loading = false; }); }
    }
  }
  private lastSx = -1;
  private lastSy = -1;

  private draw(_alpha: number): void {
    const v = this.renderer.viewport;
    if (v.w !== this.camera.viewW || v.h !== this.camera.viewH) { this.camera.setViewport(v.w, v.h); this.camera.autoZoom(); }
    this.renderer.render(this.player, this.camera);
  }

  private frame = (now: number): void => {
    const dt = now - this.last;
    this.last = now;
    const t0 = performance.now();
    this.loop.advance(dt);
    this.frameMsValue = this.frameMsValue * 0.9 + (performance.now() - t0) * 0.1;
    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc >= 500) { this.fpsValue = (this.fpsFrames * 1000) / this.fpsAcc; this.fpsAcc = 0; this.fpsFrames = 0; }
    this.statsAcc += dt;
    if (this.statsAcc >= 250) { this.statsAcc = 0; this.bus.emit('frame:stats', this.stats()); }
    this.raf = requestAnimationFrame(this.frame);
  };

  stats(): FrameStats {
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return {
      fps: Math.round(this.fpsValue), frameMs: Math.round(this.frameMsValue * 100) / 100,
      sectors: this.world.sectors.size, sprites: this.renderer.spriteCount,
      heapMb: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
    };
  }

  get isReady(): boolean { return this.ready; }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.unbind();
    this.renderer.destroy();
  }
}
