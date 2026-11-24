// Arte placeholder em Pixel Art HD (tiles de 32 px), gerada por código e registrada no Asset Registry.
// É provisória: quando houver arte final, ela entra pelo mesmo registro, com os mesmos ids.
import { PixelImage, rng, shade } from './pixel';
import { AssetRegistry } from './registry';

export const TILE = 32;
export const DIRECTIONS = 8;
export const ANIM_FRAMES = 4;
export const PLAYER_W = 24;
export const PLAYER_H = 36;

/** ids de tile guardados nos setores (índice = id numérico) */
export const TILE_IDS = ['grama', 'rua', 'agua', 'calcada', 'terra'] as const;
export type TileName = (typeof TILE_IDS)[number];
export const TILE_NUM: Record<TileName, number> = { grama: 0, rua: 1, agua: 2, calcada: 3, terra: 4 };
const SOLID: Record<TileName, boolean> = { grama: false, rua: false, agua: true, calcada: false, terra: false };

function noiseTile(base: number, seed: number, speckle: number, amount: number): PixelImage {
  const img = new PixelImage(TILE, TILE);
  const r = rng(seed);
  img.rect(0, 0, TILE, TILE, base);
  for (let i = 0; i < amount; i++) img.set(Math.floor(r() * TILE), Math.floor(r() * TILE), shade(base, r() < 0.5 ? -speckle : speckle));
  return img;
}

function tileGrama(): PixelImage {
  const img = noiseTile(0x4f9d3a, 11, 18, 90);
  const r = rng(12);
  for (let i = 0; i < 10; i++) { const x = Math.floor(r() * 30), y = Math.floor(r() * 28); img.set(x, y, 0x6dbb4f); img.set(x, y + 1, 0x3e7f2d); }
  return img;
}

function tileRua(): PixelImage {
  const img = noiseTile(0x4a4d55, 21, 10, 70);
  img.rect(0, 0, TILE, 2, 0x3a3c43);
  img.rect(0, TILE - 2, TILE, 2, 0x3a3c43);
  img.rect(4, 15, 10, 2, 0xe7d36a);
  return img;
}

function tileAgua(): PixelImage {
  const img = noiseTile(0x2c6fb7, 31, 14, 60);
  const r = rng(32);
  for (let i = 0; i < 6; i++) { const x = Math.floor(r() * 24), y = Math.floor(r() * 30); img.rect(x, y, 6, 1, 0x7cc1f0); }
  return img;
}

function tileCalcada(): PixelImage {
  const img = noiseTile(0xb9b4a6, 41, 12, 50);
  img.rect(0, 15, TILE, 1, 0x8d887b);
  img.rect(15, 0, 1, TILE, 0x8d887b);
  return img;
}

function tileTerra(): PixelImage {
  return noiseTile(0x8a6a43, 51, 16, 80);
}

function propArvore(): PixelImage {
  const img = new PixelImage(40, 56);
  img.ellipse(20, 52, 12, 3, 0x2e5d22);            // sombra no chão
  img.rect(17, 36, 6, 16, 0x6b4423);                // tronco
  img.rect(17, 36, 2, 16, 0x7d5430);
  img.ellipse(20, 22, 17, 18, 0x2f7a2b);            // copa
  img.ellipse(15, 17, 9, 9, 0x3f9a38);
  img.ellipse(26, 26, 8, 8, 0x266824);
  return img;
}

function propCasa(): PixelImage {
  // 3×3 tiles de base (96×96) mais 32 px de telhado acima
  const img = new PixelImage(96, 128);
  img.rect(0, 40, 96, 88, 0xd8c8a4);                // parede
  img.rect(0, 120, 96, 8, 0x8d7f5f);                // rodapé
  for (let y = 40; y < 120; y += 8) img.rect(0, y, 96, 1, 0xc4b48f);
  img.rect(40, 80, 16, 40, 0x6b3f22);               // porta
  img.rect(52, 100, 2, 2, 0xe7d36a);
  img.rect(10, 68, 20, 20, 0x9fd3f2); img.rect(10, 68, 20, 2, 0x5b4a33); img.rect(10, 86, 20, 2, 0x5b4a33); img.rect(19, 68, 2, 20, 0x5b4a33);
  img.rect(66, 68, 20, 20, 0x9fd3f2); img.rect(66, 68, 20, 2, 0x5b4a33); img.rect(66, 86, 20, 2, 0x5b4a33); img.rect(75, 68, 2, 20, 0x5b4a33);
  for (let i = 0; i < 40; i++) {                    // telhado em degraus
    img.rect(0, i, 96, 1, i % 8 < 4 ? 0xa83c2f : 0x8f3126);
  }
  img.rect(0, 40, 96, 3, 0x6e251c);
  return img;
}

const DIR_VEC: Array<[number, number]> = [
  [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], // S, SW, W, NW, N, NE, E, SE
];

/** Personagem placeholder: 8 direções × 4 quadros de caminhada. */
function playerFrame(dir: number, frame: number): PixelImage {
  const [dx, dy] = DIR_VEC[dir];
  const img = new PixelImage(PLAYER_W, PLAYER_H);
  const phase = [0, 1, 0, -1][frame];
  img.ellipse(12, 33, 8, 3, 0x1d3b17);                              // sombra
  const side = dx !== 0 && dy === 0;
  const legSpread = side ? phase * 3 : 0;
  const legLift = side ? 0 : phase * 2;
  img.rect(8 + legSpread, 24 - legLift, 4, 9, 0x2a3b6b);            // perna A
  img.rect(13 - legSpread, 24 + legLift, 4, 9, 0x23325c);           // perna B
  img.rect(8 + legSpread, 31 - legLift, 4, 2, 0x1a1a1a);
  img.rect(13 - legSpread, 31 + legLift, 4, 2, 0x1a1a1a);
  const tx = 6 + dx;                                                // tronco inclina para o lado em que olha
  // de perfil o tronco é mais estreito e a cabeça mostra um olho só; nas diagonais aparecem os dois
  const bw = side ? 9 : 12;
  img.rect(tx + (side ? Math.round(1.5 * dx) + 1 : 0), 13, bw, 12, 0xc0392b);
  img.rect(tx + (side ? Math.round(1.5 * dx) + 1 : 0), 13, bw, 2, 0xe05a4a);
  img.rect(tx - 2, 14 + (side ? 0 : phase), 2, 9, 0xe3b48a);        // braços
  img.rect(tx + 12, 14 + (side ? 0 : -phase), 2, 9, 0xe3b48a);
  img.rect(7 + dx, 3, 10, 10, 0xe3b48a);                            // cabeça
  if (dy < 0) img.rect(7 + dx, 3, 10, 9, 0x3b2a1a);                 // de costas: cabelo cobre
  else {
    img.rect(7 + dx, 3, 10, 3, 0x3b2a1a);
    const ex = side ? [dx < 0 ? 8 : 15] : dx === 0 ? [9, 14] : dx < 0 ? [8, 11] : [13, 16];
    for (const e of ex) img.rect(e + dx, 8, 2, 2, 0x1a1a1a);
    if (side) img.rect(dx < 0 ? 7 : 16, 3, 2, 10, 0x3b2a1a);          // cabelo na nuca do perfil
  }
  return img;
}

export function buildCatalog(): AssetRegistry {
  const reg = new AssetRegistry();
  const tiles: Record<TileName, () => PixelImage> = { grama: tileGrama, rua: tileRua, agua: tileAgua, calcada: tileCalcada, terra: tileTerra };
  for (const name of TILE_IDS) {
    reg.register({ id: `tile.${name}`, kind: 'tile', frames: [tiles[name]()], width: TILE, height: TILE, solid: SOLID[name] });
  }
  reg.register({ id: 'prop.arvore', kind: 'prop', frames: [propArvore()], width: 40, height: 56 });
  reg.register({ id: 'prop.casa', kind: 'prop', frames: [propCasa()], width: 96, height: 128 });
  const frames: PixelImage[] = [];
  for (let d = 0; d < DIRECTIONS; d++) for (let f = 0; f < ANIM_FRAMES; f++) frames.push(playerFrame(d, f));
  reg.register({ id: 'sprite.jogador', kind: 'sprite', frames, width: PLAYER_W, height: PLAYER_H, framesPerAnim: ANIM_FRAMES });
  return reg;
}
