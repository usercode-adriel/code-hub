// PISOS E PAREDES em pixel art isométrico. Piso = losango 64×32 com padrão por tipo. Parede = painel alto sobre uma aresta.
import { PixelImage, rng, shade } from '../../assets/pixel';
import { poligono, linha, novaImagem, type Pt } from './desenho';
import { PISOS } from '../catalogo';

const LOSANGO: Pt[] = [[32, 0], [64, 16], [32, 32], [0, 16]];
const dentroLosango = (x: number, y: number): boolean => Math.abs(x - 32) / 32 + Math.abs(y - 16) / 16 <= 1;

export function texturaPiso(tipo: string): PixelImage {
  const t = PISOS.find((p) => p.tipo === tipo) ?? PISOS[0];
  const img = new PixelImage(64, 32); const r = rng(tipo.length * 977 + tipo.charCodeAt(0));
  poligono(img, LOSANGO, t.cor);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
    if (!dentroLosango(x + 0.5, y + 0.5)) continue;
    if (tipo === 'madeira' && ((x + y * 2) % 16 === 0 || (x - y * 2 + 64) % 32 === 0)) img.set(x, y, t.cor2);
    else if (tipo.startsWith('carpete') && r() < 0.28) img.set(x, y, r() < 0.5 ? shade(t.cor, 9) : t.cor2);
    else if (tipo === 'porcelanato' && ((x + y * 2) % 32 === 0 || (x - y * 2 + 64) % 32 === 0)) img.set(x, y, t.cor2);
    else if (tipo === 'corredor' && r() < 0.18) img.set(x, y, t.cor2);
    else if (tipo === 'estudio' && r() < 0.12) img.set(x, y, shade(t.cor, 10));
    else if (r() < 0.06) img.set(x, y, t.cor2);
  }
  return img;
}

export interface Parede { img: PixelImage; ox: number; oy: number }
export const ALTURA_PAREDE = 72;

/** Parede sobre a aresta N (do vértice de cima ao da direita) ou W (do vértice de cima ao da esquerda) da célula. (ox,oy) = vértice de cima do chão. */
export function desenharParede(lado: 'N' | 'W', tipo: string, abertura: 'porta' | 'janela' | null): Parede {
  const H = ALTURA_PAREDE; const larg = 34; const img = novaImagem(larg + 2, H + 20); const ox = lado === 'N' ? 1 : larg - 1 + 1; const oy = H + 2;
  const s = lado === 'N' ? 1 : -1;
  const P = (u: number, z: number): Pt => [ox + s * 32 * u, oy + 16 * u - z];        // u de 0 a 1 ao longo da aresta
  const vidro = tipo === 'vidro';
  const base = vidro ? 0x9fd6e8 : lado === 'N' ? 0xe9e3d3 : 0xd6cfbd;               // N recebe mais luz que W
  poligono(img, [P(0, H), P(1, H), P(1, 0), P(0, 0)], base);
  if (!vidro) { poligono(img, [P(0, 10), P(1, 10), P(1, 0), P(0, 0)], 0x8c7e68); poligono(img, [P(0, H), P(1, H), P(1, H - 4), P(0, H - 4)], 0xf6f2e6); }
  const contorno = vidro ? 0x5d97ad : 0x9c917a;
  linha(img, ...P(0, H), ...P(1, H), contorno); linha(img, ...P(0, 0), ...P(1, 0), contorno); linha(img, ...P(0, H), ...P(0, 0), contorno); linha(img, ...P(1, H), ...P(1, 0), contorno);
  if (abertura === 'janela') {
    poligono(img, [P(0.18, 56), P(0.82, 56), P(0.82, 24), P(0.18, 24)], 0xb8e4f4); poligono(img, [P(0.18, 56), P(0.5, 56), P(0.18, 38), P(0.18, 38)], 0xdff4fb);
    linha(img, ...P(0.18, 56), ...P(0.82, 56), 0x6b5a45); linha(img, ...P(0.18, 24), ...P(0.82, 24), 0x6b5a45); linha(img, ...P(0.18, 56), ...P(0.18, 24), 0x6b5a45); linha(img, ...P(0.82, 56), ...P(0.82, 24), 0x6b5a45); linha(img, ...P(0.5, 56), ...P(0.5, 24), 0x6b5a45);
  }
  if (abertura === 'porta') {
    // vão aberto: recorta o painel (transparente) deixando só a moldura
    for (let u = 0.22; u <= 0.78; u += 0.005) for (let z = 0; z <= 54; z += 0.5) { const [x, y] = P(u, z); img.set(Math.round(x), Math.round(y), null); img.data[(Math.round(y) * img.width + Math.round(x)) * 4 + 3] = 0; }
    linha(img, ...P(0.22, 54), ...P(0.78, 54), 0x5a4630); linha(img, ...P(0.22, 55), ...P(0.78, 55), 0x5a4630); linha(img, ...P(0.22, 54), ...P(0.22, 0), 0x5a4630); linha(img, ...P(0.78, 54), ...P(0.78, 0), 0x5a4630);
  }
  return { img, ox, oy };
}
