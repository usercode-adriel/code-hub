// Imagem em pixels RGBA sem depender de DOM: assim a arte placeholder é gerada e testada em Node,
// e só o renderizador a converte em textura.
export class PixelImage {
  readonly data: Uint8ClampedArray;
  constructor(readonly width: number, readonly height: number) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  set(x: number, y: number, color: number | null): void {
    if (!Number.isInteger(x) || !Number.isInteger(y)) throw new RangeError(`pixel fora da grade: ${x},${y}`);
    if (color === null || x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    this.data[i] = (color >> 16) & 255;
    this.data[i + 1] = (color >> 8) & 255;
    this.data[i + 2] = color & 255;
    this.data[i + 3] = 255;
  }

  get(x: number, y: number): number | null {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return null;
    const i = (y * this.width + x) * 4;
    if (this.data[i + 3] === 0) return null;
    return (this.data[i] << 16) | (this.data[i + 1] << 8) | this.data[i + 2];
  }

  rect(x: number, y: number, w: number, h: number, color: number | null): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color);
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, color: number): void {
    for (let j = -ry; j <= ry; j++) for (let i = -rx; i <= rx; i++) {
      if ((i * i) / (rx * rx) + (j * j) / (ry * ry) <= 1) this.set(cx + i, cy + j, color);
    }
  }

  /** Cola `src` em (x, y), pulando pixels transparentes. */
  blit(src: PixelImage, x: number, y: number): void {
    for (let j = 0; j < src.height; j++) for (let i = 0; i < src.width; i++) this.set(x + i, y + j, src.get(i, j));
  }

  hash(): number {
    let h = 2166136261;
    for (let i = 0; i < this.data.length; i++) { h ^= this.data[i]; h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
}

/** Gerador pseudoaleatório determinístico (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const shade = (color: number, delta: number): number => {
  const c = (v: number) => Math.max(0, Math.min(255, v + delta));
  return (c((color >> 16) & 255) << 16) | (c((color >> 8) & 255) << 8) | c(color & 255);
};
