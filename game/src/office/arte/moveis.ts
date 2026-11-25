// MÓVEIS E EQUIPAMENTOS em pixel art isométrico, desenhados por código (arte provisória; o Asset Studio permite trocar por PNGs reais).
// Cada desenhista recebe a pegada (w × d tiles, já considerando a rotação) e pinta caixas isométricas. As telas, painéis e cadeiras ficam
// voltados para +y (face esquerda-baixo), onde fica quem usa o móvel.
import type { PixelImage } from '../../assets/pixel';
import { shade } from '../../assets/pixel';
import { caixa, coresDe, emFace, elipse, linha, novaImagem, poligono, proj, type Ctx, type Pt } from './desenho';
import { dimensoes, objetoPorTipo } from '../catalogo';

export interface ObjetoArte { img: PixelImage; ox: number; oy: number }
type Desenho = (c: Ctx, w: number, d: number) => void;

const MADEIRA = 0xb58a5a; const MADEIRA_ESC = 0x6b4a33; const METAL = 0xb7bcc6; const PRETO = 0x2a2d36; const TELA = 0x1d3a6b;
const grafico = (c: Ctx, face: 'esq' | 'dir', gx: number, gy: number, u0: number, u1: number, z0: number, z1: number, cor = 0x4dd0e1): void => {
  // barras de um gráfico dentro de um retângulo da face
  const n = 5; for (let i = 0; i < n; i++) { const a = u0 + ((u1 - u0) * i) / n + 0.02; const b = u0 + ((u1 - u0) * (i + 0.7)) / n; emFace(c, face, gx, gy, a, b, z0 + 1, z0 + 1 + (z1 - z0 - 2) * (0.3 + ((i * 37) % 7) / 10), cor); }
};

function pernas(c: Ctx, w: number, d: number, h: number, cor: number): void { for (const [x, y] of [[0.06, 0.06], [w - 0.18, 0.06], [0.06, d - 0.18], [w - 0.18, d - 0.18]]) caixa(c, x, y, 0.12, 0.12, 0, h, coresDe(cor), false); }
function tampo(c: Ctx, w: number, d: number, z: number, esp: number, cor: number): void { caixa(c, 0, 0, w, d, z, esp, coresDe(cor)); }

const D: Record<string, Desenho> = {
  mesa: (c, w, d) => { pernas(c, w, d, 22, METAL); tampo(c, w, d, 22, 4, MADEIRA); emFace(c, 'esq', 0, d, 0.1, w - 0.1, 14, 21, shade(MADEIRA, -22)); emFace(c, 'esq', 0, d, 0.1, w - 0.1, 20, 21, shade(MADEIRA, -45)); emFace(c, 'esq', 0, d, w / 2 - 0.12, w / 2 + 0.12, 17, 18, 0xd8d2c4); },
  'mesa-executiva': (c, w, d) => { caixa(c, 0.05, 0.05, w - 0.1, d - 0.1, 0, 22, coresDe(MADEIRA_ESC)); tampo(c, w, d, 22, 6, shade(MADEIRA_ESC, 12)); emFace(c, 'esq', 0, d, 0.15, w - 0.15, 6, 19, shade(MADEIRA_ESC, -14)); emFace(c, 'esq', 0, d, w / 2 - 0.22, w / 2 + 0.22, 20, 22, 0xe0c068); },
  cadeira: (c) => { caixa(c, 0.46, 0.46, 0.08, 0.08, 2, 8, coresDe(PRETO), false); caixa(c, 0.2, 0.2, 0.6, 0.6, 0, 3, coresDe(PRETO), false); caixa(c, 0.15, 0.15, 0.7, 0.7, 10, 4, coresDe(0x4a63a8)); caixa(c, 0.15, 0.78, 0.7, 0.1, 13, 15, coresDe(0x4a63a8)); },
  'cadeira-reuniao': (c) => { caixa(c, 0.46, 0.46, 0.08, 0.08, 2, 7, coresDe(PRETO), false); caixa(c, 0.15, 0.15, 0.7, 0.7, 9, 4, coresDe(0x7c5cf0)); caixa(c, 0.15, 0.78, 0.7, 0.1, 12, 12, coresDe(0x7c5cf0)); },
  computador: (c) => {
    caixa(c, 0.22, 0.58, 0.55, 0.22, 0, 2, coresDe(0xd8d8de), false);                              // teclado
    caixa(c, 0.42, 0.4, 0.16, 0.12, 0, 6, coresDe(PRETO), false);                                   // base do monitor
    caixa(c, 0.15, 0.36, 0.7, 0.08, 6, 17, coresDe(PRETO));                                         // monitor
    emFace(c, 'esq', 0, 0.44, 0.2, 0.8, 8, 21, TELA); grafico(c, 'esq', 0, 0.44, 0.2, 0.8, 8, 21);
  },
  'mesa-reuniao': (c, w, d) => { for (const [x, y] of [[0.12, 0.12], [w - 0.24, 0.12], [0.12, d - 0.24], [w - 0.24, d - 0.24]]) caixa(c, x, y, 0.14, 0.14, 0, 22, coresDe(0x3d2b1f)); caixa(c, 0.02, 0.02, w - 0.04, d - 0.04, 22, 5, coresDe(0x5b3a29)); caixa(c, 0.12, 0.12, w - 0.24, d - 0.24, 27, 0, coresDe(0x7a5238, -20), false); for (let i = 0; i < 3; i++) emFace(c, 'esq', 0.3 + i * 0.85, d - 0.02, 0, 0.4, 27.5, 28.5, 0xf0e6cc); emFace(c, 'esq', 0.02, d - 0.02, 0.1, w - 0.1, 22.5, 23.5, shade(0x5b3a29, -26)); },
  'painel-indicadores': (c, w) => { for (const x of [0.15, w - 0.25]) caixa(c, x, 0.4, 0.1, 0.2, 0, 10, coresDe(PRETO), false); caixa(c, 0.05, 0.42, w - 0.1, 0.12, 10, 54, coresDe(PRETO)); emFace(c, 'esq', 0, 0.54, 0.1, w - 0.1, 14, 60, 0x10294f); grafico(c, 'esq', 0, 0.54, 0.15, w - 0.15, 16, 40, 0x4dd0e1); emFace(c, 'esq', 0, 0.54, 0.15, w - 0.15, 46, 47, 0xf7c948); emFace(c, 'esq', 0, 0.54, 0.15, w * 0.5, 52, 56, 0x2fd27a); },
  'painel-financeiro': (c, w) => { for (const x of [0.15, w - 0.25]) caixa(c, x, 0.4, 0.1, 0.2, 0, 10, coresDe(PRETO), false); caixa(c, 0.05, 0.42, w - 0.1, 0.12, 10, 54, coresDe(PRETO)); emFace(c, 'esq', 0, 0.54, 0.1, w - 0.1, 14, 60, 0x0f3b2b); grafico(c, 'esq', 0, 0.54, 0.15, w - 0.15, 16, 42, 0x2fd27a); emFace(c, 'esq', 0, 0.54, w / 2 - 0.1, w / 2 + 0.1, 46, 56, 0xf7c948); },
  'painel-produtos': (c, w) => { for (const x of [0.15, w - 0.25]) caixa(c, x, 0.4, 0.1, 0.2, 0, 10, coresDe(PRETO), false); caixa(c, 0.05, 0.42, w - 0.1, 0.12, 10, 54, coresDe(PRETO)); emFace(c, 'esq', 0, 0.54, 0.1, w - 0.1, 14, 60, 0x241a4a); [[0.15, 0.55, 40, 56, 0xec4899], [0.6, 1.0, 40, 56, 0x0ea5e9], [0.15, 0.55, 18, 36, 0xf59e0b], [0.6, 1.0, 18, 36, 0x22c55e]].forEach(([a, b, z0, z1, k]) => emFace(c, 'esq', 0, 0.54, a, b + (w - 2) * 0.5, z0, z1, k)); },
  'painel-referencias': (c, w) => { for (const x of [0.15, w - 0.25]) caixa(c, x, 0.4, 0.1, 0.2, 0, 10, coresDe(PRETO), false); caixa(c, 0.05, 0.42, w - 0.1, 0.12, 10, 50, coresDe(0x8a5a3a)); emFace(c, 'esq', 0, 0.54, 0.1, w - 0.1, 13, 56, 0xc89a5b); [[0.15, 0.45, 38, 52, 0xfff176], [0.6, 0.95, 36, 50, 0xf48fb1], [0.2, 0.5, 18, 32, 0x81d4fa], [0.7, 1.0, 20, 34, 0xa5d6a7], [1.1, 1.5, 36, 52, 0xffcc80]].forEach(([a, b, z0, z1, k]) => emFace(c, 'esq', 0, 0.54, a, Math.min(b, w - 0.1), z0, z1, k)); },
  estante: (c) => { caixa(c, 0.1, 0.1, 0.8, 0.8, 0, 56, coresDe(0x7a5436)); emFace(c, 'esq', 0, 0.9, 0.08, 0.72, 4, 54, 0x4a3320); for (let s = 0; s < 4; s++) { const z = 6 + s * 12; emFace(c, 'esq', 0, 0.9, 0.08, 0.72, z, z + 1, 0x8f6a46); for (let i = 0; i < 6; i++) emFace(c, 'esq', 0, 0.9, 0.12 + i * 0.1, 0.19 + i * 0.1, z + 1, z + 8 + (i % 3) * 2, [0xe57373, 0x64b5f6, 0xffd54f, 0x81c784, 0xba68c8, 0xff8a65][(i + s) % 6]); } },
  arquivo: (c) => { caixa(c, 0.12, 0.12, 0.76, 0.76, 0, 40, coresDe(0x9aa3b2)); for (let i = 0; i < 3; i++) { const z = 3 + i * 12; emFace(c, 'esq', 0, 0.88, 0.1, 0.66, z, z + 10, shade(0x9aa3b2, -16)); emFace(c, 'esq', 0, 0.88, 0.3, 0.46, z + 6, z + 7, 0x2a2d36); } },
  catalogo: (c) => { caixa(c, 0.15, 0.15, 0.7, 0.7, 0, 16, coresDe(0xd8d2c4)); caixa(c, 0.2, 0.25, 0.25, 0.25, 16, 10, coresDe(0xec4899)); caixa(c, 0.5, 0.3, 0.25, 0.25, 16, 14, coresDe(0x0ea5e9)); caixa(c, 0.3, 0.55, 0.3, 0.2, 16, 8, coresDe(0xf59e0b)); },
  'estacao-marketplace': (c) => { caixa(c, 0.15, 0.2, 0.7, 0.6, 0, 22, coresDe(0x2f3a55)); caixa(c, 0.1, 0.3, 0.8, 0.1, 22, 18, coresDe(PRETO)); emFace(c, 'esq', 0, 0.4, 0.15, 0.85, 24, 38, 0x172a4f); emFace(c, 'esq', 0, 0.4, 0.3, 0.7, 28, 33, 0xff7043); emFace(c, 'esq', 0, 0.4, 0.28, 0.34, 33, 36, 0xff7043); },
  'estacao-importacao': (c) => { caixa(c, 0.15, 0.2, 0.7, 0.6, 0, 20, coresDe(0x2f3a55)); caixa(c, 0.1, 0.3, 0.8, 0.1, 20, 18, coresDe(PRETO)); emFace(c, 'esq', 0, 0.4, 0.15, 0.85, 22, 36, 0x172a4f); emFace(c, 'esq', 0, 0.4, 0.45, 0.55, 27, 35, 0x4dd0e1); emFace(c, 'esq', 0, 0.4, 0.35, 0.65, 25, 28, 0x4dd0e1); },
  camera: (c) => { for (const [x, y] of [[0.25, 0.25], [0.7, 0.25], [0.5, 0.75]]) linha(c.img, ...proj(c, 0.5, 0.5, 26), ...proj(c, x, y, 0), 0x3a3f4b); caixa(c, 0.3, 0.3, 0.4, 0.4, 26, 14, coresDe(PRETO)); caixa(c, 0.4, 0.68, 0.2, 0.18, 29, 8, coresDe(0x555b6b)); emFace(c, 'esq', 0.3, 0.7, 0.04, 0.12, 36, 38, 0xff4d5e); },
  'luz-estudio': (c) => { caixa(c, 0.46, 0.46, 0.08, 0.08, 0, 44, coresDe(0x3a3f4b), false); caixa(c, 0.2, 0.3, 0.6, 0.25, 44, 16, coresDe(0xf5e6a8)); emFace(c, 'esq', 0.2, 0.55, 0.05, 0.55, 46, 58, 0xfff6c8); },
  cenario: (c, w) => { caixa(c, 0.05, 0.3, w - 0.1, 0.1, 0, 70, coresDe(0x8a9ab8)); emFace(c, 'esq', 0, 0.4, 0.08, w - 0.08, 4, 66, 0x6f86b5); emFace(c, 'esq', 0, 0.4, 0.08, w - 0.08, 4, 24, 0x5c73a2); emFace(c, 'esq', 0, 0.4, 0.4, w - 0.4, 26, 62, 0x849bc8); },
  'estacao-edicao': (c, w, d) => { pernas(c, w, d, 20, METAL); tampo(c, w, d, 20, 4, 0x3a3f4b); for (const x of [0.15, w / 2 + 0.05]) { caixa(c, x, 0.4, 0.7, 0.08, 24, 15, coresDe(PRETO)); emFace(c, 'esq', 0, 0.48, x + 0.05, x + 0.65, 26, 37, 0x1b1f3a); for (let i = 0; i < 4; i++) emFace(c, 'esq', 0, 0.48, x + 0.08 + i * 0.15, x + 0.2 + i * 0.15, 28 + (i % 2) * 3, 30 + (i % 2) * 3, [0xec4899, 0x22d3ee, 0xf59e0b, 0xa78bfa][i]); } },
  sofa: (c, w, d) => { caixa(c, 0.05, 0.05, w - 0.1, d - 0.1, 0, 12, coresDe(0x8f4f3a)); caixa(c, 0.05, 0.02, w - 0.1, 0.3, 12, 16, coresDe(0xb0614a)); caixa(c, 0.05, 0.3, 0.2, d - 0.3, 12, 8, coresDe(0xb0614a)); caixa(c, w - 0.25, 0.3, 0.2, d - 0.3, 12, 8, coresDe(0xb0614a)); caixa(c, 0.3, 0.32, w - 0.6, d - 0.4, 12, 3, coresDe(0xc97a62)); },
  'mesa-centro': (c, w, d) => { pernas(c, w, d, 10, METAL); tampo(c, w, d, 10, 4, 0xdcd2bd); },
  planta: (c) => { caixa(c, 0.3, 0.3, 0.4, 0.4, 0, 12, coresDe(0xc0693f)); const g = c.img; for (const [dx, dy, r, z, k] of [[0, 0, 9, 34, 0x3f9a45], [-8, 4, 7, 26, 0x2f7d38], [8, 3, 7, 28, 0x4caf50], [0, -5, 7, 42, 0x66bb6a], [-4, 10, 6, 20, 0x388e3c]] as [number, number, number, number, number][]) { const [sx, sy] = proj(c, 0.5, 0.5, z); elipse(g, sx + dx, sy + dy, r, Math.round(r * 0.8), k); } },
  bebedouro: (c) => { caixa(c, 0.25, 0.25, 0.5, 0.5, 0, 28, coresDe(0xdfe6ee)); caixa(c, 0.3, 0.3, 0.4, 0.4, 28, 16, coresDe(0x6ec6ff)); emFace(c, 'esq', 0.25, 0.75, 0.15, 0.35, 12, 16, 0x1565c0); emFace(c, 'esq', 0.25, 0.75, 0.38, 0.5, 12, 16, 0xe53935); },
  cafeteira: (c) => { caixa(c, 0.1, 0.1, 0.8, 0.8, 0, 22, coresDe(0xa07a54)); caixa(c, 0.3, 0.25, 0.4, 0.35, 22, 14, coresDe(0x3a3f4b)); emFace(c, 'esq', 0.25, 0.6, 0.08, 0.2, 28, 32, 0xff4d5e); caixa(c, 0.18, 0.62, 0.14, 0.14, 22, 5, coresDe(0xf5f5f5), false); },
  tapete: (c, w, d) => { caixa(c, 0.05, 0.05, w - 0.1, d - 0.1, 0, 2, coresDe(0x5b4fb5, -30)); caixa(c, 0.3, 0.3, w - 0.6, d - 0.6, 2, 0, coresDe(0x7a6fd6, -20), false); },
};

/** Desenha um tipo de objeto. Devolve a imagem e o ponto (ox, oy) onde fica o vértice de cima da célula de origem. */
export function desenharObjeto(tipo: string, rot = 0): ObjetoArte {
  const t = objetoPorTipo(tipo);
  const { w, d } = t ? dimensoes(t, rot) : { w: 1, d: 1 };
  const altura = (t?.altura ?? 30) + 6;
  const img = novaImagem((w + d) * 32 + 4, (w + d) * 16 + altura + 4);
  const c: Ctx = { img, ox: d * 32 + 2, oy: altura + 2 };
  (D[tipo] ?? D.mesa)(c, w, d);
  return { img, ox: c.ox, oy: c.oy };
}
export const TIPOS_COM_ARTE = Object.keys(D);
export { poligono };
export type { Pt };
