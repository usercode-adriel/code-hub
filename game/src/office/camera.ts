// CÂMERA ISOMÉTRICA: zoom em passos (pixel art fica nítida), pan por arrasto e limites do mapa.
export const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3] as const;

export class CameraIso {
  x = 0; y = 0;                       // ponto do mundo no centro da tela
  private iz = 2;                     // índice em ZOOMS (padrão 1,0)
  viewW = 1280; viewH = 720;
  limites = { x0: -2000, y0: -500, x1: 2000, y1: 2500 };

  get zoom(): number { return ZOOMS[this.iz]; }
  setViewport(w: number, h: number): void { this.viewW = w; this.viewH = h; this.limitar(); }
  setLimites(l: { x0: number; y0: number; x1: number; y1: number }): void { this.limites = l; this.limitar(); }
  centrarEm(x: number, y: number): void { this.x = x; this.y = y; this.limitar(); }

  mundoParaTela(wx: number, wy: number): { x: number; y: number } { return { x: (wx - this.x) * this.zoom + this.viewW / 2, y: (wy - this.y) * this.zoom + this.viewH / 2 }; }
  telaParaMundo(sx: number, sy: number): { x: number; y: number } { return { x: (sx - this.viewW / 2) / this.zoom + this.x, y: (sy - this.viewH / 2) / this.zoom + this.y }; }

  /** Muda um passo de zoom mantendo o ponto sob o cursor no mesmo lugar. */
  zoomPasso(passo: number, sx = this.viewW / 2, sy = this.viewH / 2): void {
    const novo = Math.max(0, Math.min(ZOOMS.length - 1, this.iz + Math.sign(passo)));
    if (novo === this.iz) return;
    const antes = this.telaParaMundo(sx, sy);
    this.iz = novo;
    const depois = this.telaParaMundo(sx, sy);
    this.x += antes.x - depois.x; this.y += antes.y - depois.y;
    this.limitar();
  }
  setZoomIndice(i: number): void { this.iz = Math.max(0, Math.min(ZOOMS.length - 1, i)); this.limitar(); }

  /** Arrasto em pixels de tela. */
  arrastar(dx: number, dy: number): void { this.x -= dx / this.zoom; this.y -= dy / this.zoom; this.limitar(); }

  limitar(): void {
    const meioW = this.viewW / this.zoom / 2; const meioH = this.viewH / this.zoom / 2; const l = this.limites;
    this.x = l.x1 - l.x0 <= meioW * 2 ? (l.x0 + l.x1) / 2 : Math.max(l.x0 + meioW, Math.min(l.x1 - meioW, this.x));
    this.y = l.y1 - l.y0 <= meioH * 2 ? (l.y0 + l.y1) / 2 : Math.max(l.y0 + meioH, Math.min(l.y1 - meioH, this.y));
  }
  /** Ajusta o zoom para o mapa caber na janela (o maior passo que cabe) e centraliza. */
  ajustar(): void {
    const w = this.limites.x1 - this.limites.x0; const h = this.limites.y1 - this.limites.y0;
    let melhor = 0; ZOOMS.forEach((z, i) => { if (w * z <= this.viewW && h * z <= this.viewH) melhor = i; });
    this.iz = melhor; this.centrarEm((this.limites.x0 + this.limites.x1) / 2, (this.limites.y0 + this.limites.y1) / 2);
  }
}
