// PROJEÇÃO ISOMÉTRICA 2:1. Grade lógica: tile de 64×32 px na tela. A célula (gx, gy) tem o vértice de cima em
// ((gx − gy)·32, (gx + gy)·16). x cresce para baixo-direita, y cresce para baixo-esquerda.
export const TILE_W = 64;
export const TILE_H = 32;
export const HW = TILE_W / 2;
export const HH = TILE_H / 2;

export interface Ponto { x: number; y: number }

/** Posição na tela (pixels do mundo) de um ponto da grade; `z` é a altura em pixels. */
export const gridParaTela = (gx: number, gy: number, z = 0): Ponto => ({ x: (gx - gy) * HW, y: (gx + gy) * HH - z });

/** Ponto contínuo da grade sob um ponto da tela, para um plano na altura `z`. */
export const telaParaGrid = (sx: number, sy: number, z = 0): Ponto => {
  const yy = sy + z;
  return { x: (sx / HW + yy / HH) / 2, y: (yy / HH - sx / HW) / 2 };
};

/** Célula da grade sob um ponto da tela (plano do chão). */
export const celulaEm = (sx: number, sy: number): Ponto => { const g = telaParaGrid(sx, sy); return { x: Math.floor(g.x), y: Math.floor(g.y) }; };

/** Centro de uma célula na tela. */
export const centroCelula = (gx: number, gy: number, z = 0): Ponto => gridParaTela(gx + 0.5, gy + 0.5, z);

/** Retângulo (na tela) que contém o mapa inteiro, para os limites da câmera. */
export function limitesDoMapa(largura: number, altura: number, margem = 96): { x0: number; y0: number; x1: number; y1: number } {
  const topo = gridParaTela(0, 0); const dir = gridParaTela(largura, 0); const baixo = gridParaTela(largura, altura); const esq = gridParaTela(0, altura);
  return { x0: esq.x - margem, y0: topo.y - margem - 120, x1: dir.x + margem, y1: baixo.y + margem };
}

// Direções em 8 sentidos, na ordem usada pelos personagens (a mesma do servidor).
export const DIRECOES = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'] as const;
export type Direcao = (typeof DIRECOES)[number];

/**
 * Direção na TELA de um movimento na grade. (+x na grade = baixo-direita = SE; +y = baixo-esquerda = SW;
 * +x−y = direita = E; −x+y = esquerda = W...). Parado mantém a anterior.
 */
export function direcaoDe(dx: number, dy: number, anterior: Direcao = 'S'): Direcao {
  if (dx === 0 && dy === 0) return anterior;
  const t = gridParaTela(dx, dy);
  const ang = Math.atan2(t.x, t.y);                 // 0 = para baixo (S), cresce para a direita
  const idx = Math.round((((-ang) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (Math.PI / 4)) % 8;
  return DIRECOES[idx];
}
