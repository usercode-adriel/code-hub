// PRIMITIVAS DE DESENHO EM PIXEL ART ISOMÉTRICO (sem DOM): preencher polígono, linha, caixa isométrica com três faces.
import { PixelImage, shade } from '../../assets/pixel';

export type Pt = [number, number];

export function linha(img: PixelImage, x0: number, y0: number, x1: number, y1: number, cor: number): void {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0); const dy = -Math.abs(y1 - y0); const sx = x0 < x1 ? 1 : -1; const sy = y0 < y1 ? 1 : -1; let e = dx + dy;
  for (;;) { img.set(x0, y0, cor); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
}

/** Preenche um polígono (convexo ou côncavo simples) por linhas de varredura, com regra par-ímpar. */
export function poligono(img: PixelImage, pts: Pt[], cor: number): void {
  const ys = pts.map((p) => p[1]); const y0 = Math.floor(Math.min(...ys)); const y1 = Math.ceil(Math.max(...ys));
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5; const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i]; const [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) img.set(x, y, cor);
  }
}

export interface CoresCaixa { topo: number; esq: number; dir: number; borda: number }
export const coresDe = (base: number, borda = -55): CoresCaixa => ({ topo: shade(base, 26), esq: shade(base, -8), dir: shade(base, -34), borda: shade(base, borda) });

/** Contexto de projeção: (ox, oy) é onde, na imagem, fica o vértice de cima da célula de origem do objeto, no chão. */
export interface Ctx { img: PixelImage; ox: number; oy: number }
export const proj = (c: Ctx, gx: number, gy: number, z = 0): Pt => [c.ox + (gx - gy) * 32, c.oy + (gx + gy) * 16 - z];

/**
 * Caixa isométrica em (x,y) com largura w, profundidade d, começando na altura z e com h pixels de altura.
 * As faces visíveis são as voltadas para +y (esquerda-baixo) e +x (direita-baixo), mais o topo.
 */
export function caixa(c: Ctx, x: number, y: number, w: number, d: number, z: number, h: number, cores: CoresCaixa, borda = true): void {
  const T = (gx: number, gy: number): Pt => proj(c, gx, gy, z + h); const B = (gx: number, gy: number): Pt => proj(c, gx, gy, z);
  const A = T(x, y); const Bt = T(x + w, y); const C = T(x + w, y + d); const D = T(x, y + d);
  poligono(c.img, [D, C, B(x + w, y + d), B(x, y + d)], cores.esq);
  poligono(c.img, [C, Bt, B(x + w, y), B(x + w, y + d)], cores.dir);
  poligono(c.img, [A, Bt, C, D], cores.topo);
  if (borda) {
    const bx = B(x, y + d); const bc = B(x + w, y + d); const bb = B(x + w, y);
    linha(c.img, D[0], D[1], bx[0], bx[1], cores.borda); linha(c.img, C[0], C[1], bc[0], bc[1], cores.borda); linha(c.img, Bt[0], Bt[1], bb[0], bb[1], cores.borda);
    linha(c.img, bx[0], bx[1], bc[0], bc[1], cores.borda); linha(c.img, bc[0], bc[1], bb[0], bb[1], cores.borda);
    linha(c.img, A[0], A[1], Bt[0], Bt[1], cores.borda); linha(c.img, Bt[0], Bt[1], C[0], C[1], cores.borda); linha(c.img, C[0], C[1], D[0], D[1], cores.borda); linha(c.img, D[0], D[1], A[0], A[1], cores.borda);
  }
}

/** Retângulo "colado" numa face: face='esq' (voltada para +y) ou 'dir' (voltada para +x). u,v em tiles ao longo da face, alt/z em pixels. */
export function emFace(c: Ctx, face: 'esq' | 'dir', gx: number, gy: number, u0: number, u1: number, z0: number, z1: number, cor: number): void {
  const P = (u: number, z: number): Pt => (face === 'esq' ? proj(c, gx + u, gy, z) : proj(c, gx, gy + u, z));
  poligono(c.img, [P(u0, z1), P(u1, z1), P(u1, z0), P(u0, z0)], cor);
}

export function elipse(img: PixelImage, cx: number, cy: number, rx: number, ry: number, cor: number): void { img.ellipse(Math.round(cx), Math.round(cy), Math.round(rx), Math.round(ry), cor); }

/** Sombra suave no chão sob um objeto (elipse achatada, semitransparente simulada por escurecer pixels já pintados do piso é feito no renderer). */
export function novaImagem(w: number, h: number): PixelImage { return new PixelImage(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h))); }
