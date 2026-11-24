// Câmera: segue um alvo com suavização, respeita os limites do mundo e usa zoom inteiro
// (zoom fracionário borra pixel art).
export class Camera {
  x = 0;
  y = 0;
  zoom = 2;
  viewW = 1280;
  viewH = 720;

  constructor(private worldW: number, private worldH: number) {}

  setViewport(w: number, h: number): void { this.viewW = w; this.viewH = h; }
  setWorld(w: number, h: number): void { this.worldW = w; this.worldH = h; }

  /** zoom inteiro, entre 1 e 4 */
  setZoom(z: number): void { this.zoom = Math.max(1, Math.min(4, Math.round(z))); }

  /** zoom automático: mostra cerca de 360 px de mundo na altura da tela */
  autoZoom(): void { this.setZoom(this.viewH / 360); }

  private clampX(v: number): number {
    const half = this.viewW / this.zoom / 2;
    return this.worldW <= half * 2 ? this.worldW / 2 : Math.max(half, Math.min(this.worldW - half, v));
  }
  private clampY(v: number): number {
    const half = this.viewH / this.zoom / 2;
    return this.worldH <= half * 2 ? this.worldH / 2 : Math.max(half, Math.min(this.worldH - half, v));
  }

  snapTo(tx: number, ty: number): void { this.x = this.clampX(tx); this.y = this.clampY(ty); }

  /** Aproxima a câmera do alvo; `stiffness` é a fração por segundo (independente do FPS). */
  follow(tx: number, ty: number, dt: number, stiffness = 10): void {
    const k = 1 - Math.exp(-stiffness * dt);
    this.x = this.clampX(this.x + (tx - this.x) * k);
    this.y = this.clampY(this.y + (ty - this.y) * k);
  }

  /** deslocamento do contêiner do mundo na tela, em pixels inteiros */
  offset(): { x: number; y: number } {
    return { x: Math.round(this.viewW / 2 - this.x * this.zoom), y: Math.round(this.viewH / 2 - this.y * this.zoom) };
  }

  /** retângulo visível no mundo */
  visible(margin = 0): { x: number; y: number; w: number; h: number } {
    const w = this.viewW / this.zoom, h = this.viewH / this.zoom;
    return { x: this.x - w / 2 - margin, y: this.y - h / 2 - margin, w: w + margin * 2, h: h + margin * 2 };
  }
}
