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


// ---------- Commerce Office 2.1 ----------
const CORES_LIVRO = [0xc0392b, 0x2e86c1, 0x27ae60, 0xf1c40f, 0x8e44ad, 0xe67e22, 0x1abc9c, 0xecf0f1, 0x34495e];
/** Fileira de livros em pé numa face (gy = plano da frente), com alturas e cores variadas. */
function livros(c: Ctx, gx: number, gy: number, u0: number, u1: number, z: number, hMax: number, semente = 0): void {
  let u = u0; let i = semente;
  while (u < u1 - 0.06) { const larg = 0.07 + ((i * 7) % 4) * 0.02; const h = hMax - 3 + ((i * 5) % 4); emFace(c, 'esq', gx, gy, u, Math.min(u1, u + larg), z, z + h, CORES_LIVRO[i % CORES_LIVRO.length]); u += larg + 0.01; i++; }
}
const CARTAO = 0xc8975a; const FITA = 0xe8d9a8;
/** Caixa de papelão com fita e etiqueta. */
function caixaPapelao(c: Ctx, x: number, y: number, w: number, d: number, z: number, h: number, etiqueta = true): void {
  caixa(c, x, y, w, d, z, h, coresDe(CARTAO)); emFace(c, 'esq', x, y + d, w / 2 - 0.05, w / 2 + 0.05, z, z + h, FITA);
  if (etiqueta && h >= 10) emFace(c, 'esq', x, y + d, 0.1 * w, 0.4 * w, z + h * 0.3, z + h * 0.3 + Math.min(6, h * 0.35), 0xffffff);
}
const quadroFino = (c: Ctx, x: number, w: number, z: number, h: number, moldura: number): void => { caixa(c, x, 0.02, w, 0.1, z, h, coresDe(moldura)); };

Object.assign(D, {
  monitor: (c) => {
    caixa(c, 0.4, 0.28, 0.2, 0.14, 0, 5, coresDe(PRETO), false); caixa(c, 0.46, 0.32, 0.08, 0.08, 4, 5, coresDe(PRETO), false);
    caixa(c, 0.1, 0.26, 0.8, 0.08, 8, 20, coresDe(PRETO)); emFace(c, 'esq', 0, 0.34, 0.16, 0.84, 10, 26, 0x1d3a6b); emFace(c, 'esq', 0, 0.34, 0.16, 0.5, 18, 26, 0x2f5fa8); grafico(c, 'esq', 0, 0.34, 0.5, 0.84, 11, 25, 0x4dd0e1);
  },
  teclado: (c) => { caixa(c, 0.12, 0.55, 0.62, 0.22, 0, 2, coresDe(0xdcdce2)); for (let i = 0; i < 6; i++) emFace(c, 'esq', 0.12, 0.77, 0.05 + i * 0.09, 0.1 + i * 0.09, 0.5, 1.5, 0x8d93a1); },
  mouse: (c) => { caixa(c, 0.4, 0.6, 0.16, 0.22, 0, 3, coresDe(0x2f3550)); emFace(c, 'esq', 0.4, 0.82, 0.06, 0.1, 1, 2.5, 0x8d93a1); },
  documentos: (c) => { caixa(c, 0.16, 0.2, 0.46, 0.34, 0, 2, coresDe(0xf4f1e8)); caixa(c, 0.22, 0.26, 0.46, 0.34, 2, 2, coresDe(0xffffff)); caixa(c, 0.28, 0.3, 0.4, 0.3, 4, 1, coresDe(0xf4f1e8)); emFace(c, 'esq', 0.28, 0.6, 0.06, 0.34, 4.2, 5, 0x9aa3b2); },
  caneca: (c) => { caixa(c, 0.7, 0.2, 0.16, 0.16, 0, 7, coresDe(0xe84a5f)); caixa(c, 0.72, 0.22, 0.12, 0.12, 7, 0.5, coresDe(0x5b3a29), false); caixa(c, 0.86, 0.26, 0.05, 0.05, 2, 4, coresDe(0xe84a5f), false); },
  'porta-retrato': (c) => { caixa(c, 0.12, 0.2, 0.22, 0.05, 0, 11, coresDe(0x7a5436)); emFace(c, 'esq', 0.12, 0.25, 0.03, 0.19, 2, 9, 0x9fd6e8); emFace(c, 'esq', 0.12, 0.25, 0.05, 0.12, 2, 6, 0x6fbf73); },
  'luminaria-mesa': (c) => { caixa(c, 0.78, 0.3, 0.14, 0.14, 0, 2, coresDe(PRETO), false); caixa(c, 0.83, 0.35, 0.04, 0.04, 2, 14, coresDe(0x555b6b), false); caixa(c, 0.7, 0.25, 0.3, 0.2, 15, 6, coresDe(0xf5e6a8)); emFace(c, 'esq', 0.7, 0.45, 0.04, 0.26, 15, 17, 0xfff6c8); },
  'papeis-pastas': (c) => { caixa(c, 0.15, 0.2, 0.35, 0.45, 0, 4, coresDe(0x4a63a8)); caixa(c, 0.2, 0.25, 0.35, 0.45, 4, 3, coresDe(0xf1c40f)); caixa(c, 0.5, 0.35, 0.3, 0.4, 0, 2, coresDe(0xffffff)); caixa(c, 0.55, 0.4, 0.3, 0.4, 2, 2, coresDe(0xf4f1e8)); },
  impressora: (c) => { caixa(c, 0.12, 0.2, 0.76, 0.6, 0, 11, coresDe(0xd6d9e0)); caixa(c, 0.2, 0.28, 0.6, 0.4, 11, 3, coresDe(0x8d93a1)); caixa(c, 0.25, 0.3, 0.5, 0.3, 14, 2, coresDe(0xffffff)); emFace(c, 'esq', 0.12, 0.8, 0.15, 0.7, 3, 6, 0x555b6b); emFace(c, 'esq', 0.12, 0.8, 0.72, 0.8, 7, 9, 0x2fd27a); },
  'cafeteira-mesa': (c) => { caixa(c, 0.2, 0.2, 0.55, 0.5, 0, 6, coresDe(0x2f3550)); caixa(c, 0.22, 0.2, 0.5, 0.2, 6, 14, coresDe(0x3a3f4b)); emFace(c, 'esq', 0.2, 0.4, 0.3, 0.62, 10, 16, 0x1d1f27); caixa(c, 0.28, 0.45, 0.2, 0.18, 0, 8, coresDe(0xdfe6ee), false); emFace(c, 'esq', 0.2, 0.7, 0.62, 0.7, 4, 6, 0xff4d5e); },
  xicaras: (c) => { for (const [x, y] of [[0.2, 0.3], [0.5, 0.35], [0.72, 0.28]]) { caixa(c, x, y, 0.14, 0.14, 0, 6, coresDe(0xf5f5f5)); caixa(c, x + 0.02, y + 0.02, 0.1, 0.1, 6, 0.4, coresDe(0x5b3a29), false); } },
  'torre-pc': (c) => { caixa(c, 0.25, 0.2, 0.5, 0.6, 0, 34, coresDe(0x2a2d36)); emFace(c, 'esq', 0.25, 0.8, 0.08, 0.42, 22, 30, 0x3a3f4b); emFace(c, 'esq', 0.25, 0.8, 0.12, 0.3, 8, 10, 0x4dd0e1); emFace(c, 'esq', 0.25, 0.8, 0.36, 0.42, 8, 10, 0x2fd27a); },
  'mesa-apoio': (c, w, d) => { pernas(c, w, d, 22, METAL); tampo(c, w, d, 22, 4, 0xe8e2d2); },
  'mesa-balcao': (c, w, d) => { caixa(c, 0.04, 0.04, w - 0.08, d - 0.08, 0, 24, coresDe(0xdfe6ee)); tampo(c, w, d, 24, 4, 0x5b3a29); emFace(c, 'esq', 0, d, 0.12, w / 2 - 0.08, 4, 20, shade(0xdfe6ee, -22)); emFace(c, 'esq', 0, d, w / 2 + 0.08, w - 0.12, 4, 20, shade(0xdfe6ee, -22)); emFace(c, 'esq', 0, d, w / 2 - 0.2, w / 2 - 0.12, 11, 14, 0x8d93a1); emFace(c, 'esq', 0, d, w / 2 + 0.12, w / 2 + 0.2, 11, 14, 0x8d93a1); },
  'quadro-branco': (c, w) => { quadroFino(c, 0.02, w - 0.04, 6, 46, 0x8d93a1); emFace(c, 'esq', 0, 0.12, 0.1, w - 0.1, 10, 48, 0xf7f8fb);
    emFace(c, 'esq', 0, 0.12, 0.2, w * 0.45, 40, 41, 0x2e86c1); emFace(c, 'esq', 0, 0.12, 0.2, w * 0.3, 36, 37, 0x2e86c1); emFace(c, 'esq', 0, 0.12, w * 0.5, w - 0.3, 40, 41, 0xc0392b);
    for (const [a, b, z, k] of [[0.25, 0.5, 20, 0x27ae60], [0.6, 0.85, 24, 0x27ae60], [1.0, 1.2, 28, 0x27ae60]] as [number, number, number, number][]) emFace(c, 'esq', 0, 0.12, a, b, 14, z, k);
    emFace(c, 'esq', 0, 0.12, w - 0.9, w - 0.3, 24, 34, 0xfff176); emFace(c, 'esq', 0, 0.12, w - 0.9, w - 0.3, 24, 25, 0xe0c000); caixa(c, 0.3, 0.02, w - 0.6, 0.12, 6, 2, coresDe(0x8d93a1), false); emFace(c, 'esq', 0, 0.14, 0.4, 0.55, 8, 9, 0xe53935); emFace(c, 'esq', 0, 0.14, 0.62, 0.77, 8, 9, 0x1565c0); },
  'quadro-decorativo': (c, w) => { quadroFino(c, 0.1, w - 0.2, 12, 34, 0x3a2a1e); emFace(c, 'esq', 0, 0.12, 0.2, w - 0.2, 15, 43, 0xf4efe0); poligono(c.img, [proj(c, 0.3, 0.12, 18), proj(c, 0.7, 0.12, 40), proj(c, 1.0, 0.12, 22)], 0x2e86c1); poligono(c.img, [proj(c, 0.9, 0.12, 20), proj(c, 1.3, 0.12, 42), proj(c, 1.7, 0.12, 20)], 0xe67e22); elipse(c.img, proj(c, 1.45, 0.12, 36)[0], proj(c, 1.45, 0.12, 36)[1], 4, 4, 0xf1c40f); },
  'relogio-parede': (c) => { const [x, y] = proj(c, 0.5, 0.1, 40); elipse(c.img, x, y, 11, 11, 0x3a2a1e); elipse(c.img, x, y, 9, 9, 0xf7f8fb); linha(c.img, x, y, x, y - 6, 0x2a2d36); linha(c.img, x, y, x + 4, y + 1, 0x2a2d36); c.img.set(Math.round(x), Math.round(y), 0xe53935); for (const [dx, dy] of [[0, -8], [8, 0], [0, 8], [-8, 0]]) c.img.set(Math.round(x + dx), Math.round(y + dy), 0x2a2d36); },
  'prateleira-parede': (c, w) => { for (const z of [18, 36]) { caixa(c, 0.04, 0.02, w - 0.08, 0.28, z, 3, coresDe(0x7a5436)); } livros(c, 0, 0.3, 0.1, w * 0.55, 21, 11, 3); livros(c, 0, 0.3, 0.1, w * 0.4, 39, 10, 8);
    caixa(c, w * 0.62, 0.08, 0.22, 0.18, 21, 9, coresDe(0xc0693f)); caixa(c, w * 0.66, 0.1, 0.16, 0.14, 30, 6, coresDe(0x3f9a45)); caixa(c, w * 0.6, 0.08, 0.18, 0.18, 39, 8, coresDe(0xe84a5f)); },
  'estante-livros': (c, w, d) => { caixa(c, 0.04, 0.1, w - 0.08, d - 0.2, 0, 62, coresDe(0x7a5436)); emFace(c, 'esq', 0, d - 0.1, 0.1, w - 0.1, 4, 60, 0x4a3320);
    for (let s = 0; s < 5; s++) { const z = 5 + s * 11.5; emFace(c, 'esq', 0, d - 0.1, 0.08, w - 0.08, z - 1, z, 0x8f6a46); livros(c, 0, d - 0.1, 0.12, w - 0.12, z, 9, s * 3); } caixa(c, 0.04, 0.1, w - 0.08, d - 0.2, 62, 0, coresDe(0x7a5436), false); },
  armario: (c, w, d) => { caixa(c, 0.04, 0.08, w - 0.08, d - 0.16, 0, 54, coresDe(0xbfae94)); emFace(c, 'esq', 0, d - 0.08, 0.08, w / 2 - 0.04, 4, 50, shade(0xbfae94, -14)); emFace(c, 'esq', 0, d - 0.08, w / 2 + 0.04, w - 0.08, 4, 50, shade(0xbfae94, -14));
    emFace(c, 'esq', 0, d - 0.08, w / 2 - 0.12, w / 2 - 0.08, 24, 32, 0x555b6b); emFace(c, 'esq', 0, d - 0.08, w / 2 + 0.08, w / 2 + 0.12, 24, 32, 0x555b6b); emFace(c, 'esq', 0, d - 0.08, 0.2, 0.5, 40, 46, 0xf4f1e8); },
  poltrona: (c) => { caixa(c, 0.12, 0.12, 0.76, 0.76, 0, 12, coresDe(0x3a6b8c)); caixa(c, 0.12, 0.08, 0.76, 0.22, 12, 18, coresDe(0x4a82a8)); caixa(c, 0.12, 0.3, 0.16, 0.58, 12, 8, coresDe(0x4a82a8)); caixa(c, 0.72, 0.3, 0.16, 0.58, 12, 8, coresDe(0x4a82a8)); caixa(c, 0.28, 0.32, 0.44, 0.5, 12, 4, coresDe(0x5c98c2)); },
  'luminaria-chao': (c) => { caixa(c, 0.34, 0.34, 0.32, 0.32, 0, 2, coresDe(PRETO), false); caixa(c, 0.47, 0.47, 0.06, 0.06, 2, 46, coresDe(0x555b6b), false); caixa(c, 0.3, 0.3, 0.4, 0.4, 46, 16, coresDe(0xf5e6a8)); emFace(c, 'esq', 0.3, 0.7, 0.06, 0.34, 48, 60, 0xfff6c8); },
  'vaso-grande': (c) => { caixa(c, 0.2, 0.2, 0.6, 0.6, 0, 22, coresDe(0xe8e2d2)); caixa(c, 0.22, 0.22, 0.56, 0.56, 22, 1, coresDe(0x5b3a29), false); for (const [dx, dy, r, z, k] of [[0, 0, 12, 52, 0x3f9a45], [-12, 6, 9, 40, 0x2f7d38], [12, 5, 9, 42, 0x4caf50], [0, -8, 9, 62, 0x66bb6a], [-6, 14, 8, 32, 0x388e3c], [8, 14, 7, 30, 0x4caf50]] as [number, number, number, number, number][]) { const [px, py] = proj(c, 0.5, 0.5, z); elipse(c.img, px + dx, py + dy - 4, r, r * 0.8, k); } },
  frigobar: (c) => { caixa(c, 0.15, 0.15, 0.7, 0.7, 0, 40, coresDe(0xdfe6ee)); emFace(c, 'esq', 0.15, 0.85, 0.06, 0.6, 3, 37, shade(0xdfe6ee, -10)); emFace(c, 'esq', 0.15, 0.85, 0.55, 0.6, 12, 26, 0x8d93a1); emFace(c, 'esq', 0.15, 0.85, 0.12, 0.3, 26, 30, 0x2e86c1); },
  'servidor-rack': (c) => { caixa(c, 0.2, 0.2, 0.6, 0.6, 0, 58, coresDe(0x2a2d36)); for (let i = 0; i < 6; i++) { const z = 4 + i * 9; emFace(c, 'esq', 0.2, 0.8, 0.08, 0.5, z, z + 6, 0x3a3f4b); emFace(c, 'esq', 0.2, 0.8, 0.38, 0.44, z + 2, z + 4, i % 2 ? 0x2fd27a : 0x4dd0e1); } },
  'caixa-p': (c) => caixaPapelao(c, 0.2, 0.2, 0.6, 0.6, 0, 14), 'caixa-m': (c) => caixaPapelao(c, 0.12, 0.12, 0.76, 0.76, 0, 22), 'caixa-g': (c) => caixaPapelao(c, 0.06, 0.06, 0.88, 0.88, 0, 32),
  'pilha-caixas': (c) => { caixaPapelao(c, 0.04, 0.04, 0.92, 0.92, 0, 22); caixaPapelao(c, 0.12, 0.1, 0.76, 0.78, 22, 16); caixaPapelao(c, 0.22, 0.18, 0.56, 0.6, 38, 12, false); },
  'palete-caixas': (c, w, d) => { caixa(c, 0.04, 0.04, w - 0.08, d - 0.08, 0, 6, coresDe(0xa67c52)); for (let i = 0; i < 4; i++) emFace(c, 'esq', 0, d - 0.04, 0.1 + i * ((w - 0.3) / 3.4), 0.28 + i * ((w - 0.3) / 3.4), 0, 5, 0x6b4a33);
    caixaPapelao(c, 0.12, 0.12, 0.88, 0.88, 6, 20); caixaPapelao(c, 1.0, 0.12, 0.86, 0.88, 6, 22); caixaPapelao(c, 0.12, 1.0, 0.88, 0.86, 6, 18); caixaPapelao(c, 1.0, 1.0, 0.86, 0.86, 6, 20); caixaPapelao(c, 0.24, 0.22, 0.8, 0.8, 26, 14); caixaPapelao(c, 1.06, 1.06, 0.74, 0.74, 26, 16, false); caixaPapelao(c, 0.55, 0.5, 0.8, 0.8, 40, 10, false); },
  'prateleira-estoque': (c, w, d) => {
    for (const [x, y] of [[0.04, 0.1], [w - 0.12, 0.1], [0.04, d - 0.18], [w - 0.12, d - 0.18]]) caixa(c, x, y, 0.08, 0.08, 0, 68, coresDe(0x3a6ea5), false);
    for (let n = 0; n < 4; n++) { const z = 4 + n * 16; caixa(c, 0.02, 0.06, w - 0.04, d - 0.12, z, 2, coresDe(0x555b6b)); }
    const cores = [0xc8975a, 0xd9ad73, 0xb9864a];
    for (let n = 0; n < 4; n++) { const z = 6 + n * 16; let u = 0.08; let i = n; while (u < w - 0.3) { const bw = 0.34 + ((i * 3) % 3) * 0.07; const bh = 8 + ((i * 5) % 3) * 2 + (n === 3 ? -2 : 0); caixa(c, u, 0.2, bw, d - 0.4, z, bh, coresDe(cores[i % 3])); emFace(c, 'esq', u, d - 0.2, 0.05, bw - 0.05, z + 2, z + 5, i % 2 ? 0xffffff : 0xf1c40f); u += bw + 0.05; i++; } }
    emFace(c, 'esq', 0, d - 0.06, 0.1, w - 0.1, 66, 68, 0xf1c40f); },
  'mesa-bancada': (c, w, d) => { for (const [x, y] of [[0.1, 0.12], [w - 0.22, 0.12], [0.1, d - 0.24], [w - 0.22, d - 0.24]]) caixa(c, x, y, 0.12, 0.12, 0, 24, coresDe(0x555b6b), false); tampo(c, w, d, 24, 4, 0xd8d2c4); emFace(c, 'esq', 0, d, 0.1, w - 0.1, 14, 15, 0x8d93a1); caixa(c, 0.1, 0.1, w - 0.2, d - 0.2, 12, 1, coresDe(0x8d93a1), false); },
  'impressora-etiquetas': (c) => { caixa(c, 0.2, 0.25, 0.6, 0.5, 0, 9, coresDe(0xf1c40f)); caixa(c, 0.28, 0.3, 0.44, 0.36, 9, 4, coresDe(0x3a3f4b)); emFace(c, 'esq', 0.2, 0.75, 0.2, 0.7, 2, 5, 0x3a3f4b); caixa(c, 0.34, 0.62, 0.3, 0.2, 0, 1, coresDe(0xffffff), false); emFace(c, 'esq', 0.2, 0.75, 0.72, 0.78, 3, 5, 0x2fd27a); },
  balanca: (c) => { caixa(c, 0.2, 0.25, 0.6, 0.5, 0, 3, coresDe(0x555b6b)); caixa(c, 0.26, 0.3, 0.48, 0.4, 3, 1, coresDe(0xdfe6ee)); caixa(c, 0.62, 0.5, 0.14, 0.08, 4, 3, coresDe(0x1d3a6b), false); },
  'materiais-embalagem': (c) => { caixa(c, 0.1, 0.2, 0.3, 0.3, 0, 12, coresDe(0xf4f1e8)); elipse(c.img, proj(c, 0.25, 0.35, 12)[0], proj(c, 0.25, 0.35, 12)[1], 4, 2, 0xc8c8d2); caixa(c, 0.5, 0.2, 0.28, 0.28, 0, 8, coresDe(0xa7d8f0)); caixa(c, 0.3, 0.5, 0.3, 0.3, 0, 3, coresDe(CARTAO)); caixa(c, 0.34, 0.54, 0.22, 0.22, 3, 3, coresDe(0xd9ad73)); emFace(c, 'esq', 0.1, 0.5, 0.02, 0.28, 3, 5, FITA); },
  carrinho: (c, w, d) => { caixa(c, 0.06, 0.12, w - 0.12, d - 0.24, 8, 3, coresDe(0x3a6ea5)); for (const [x, y] of [[0.1, 0.16], [w - 0.2, 0.16], [0.1, d - 0.26], [w - 0.2, d - 0.26]]) caixa(c, x, y, 0.1, 0.1, 0, 8, coresDe(PRETO), false); caixa(c, 0.06, 0.1, 0.06, d - 0.2, 11, 22, coresDe(0x555b6b), false); caixa(c, 0.06, 0.1, 0.06, 0.06, 33, 1, coresDe(0x555b6b), false);
    caixaPapelao(c, 0.2, 0.2, 0.7, 0.6, 11, 14); caixaPapelao(c, 1.0, 0.22, 0.66, 0.56, 11, 18); caixaPapelao(c, 0.3, 0.3, 0.5, 0.4, 25, 8, false); },
  organizador: (c) => { caixa(c, 0.15, 0.15, 0.7, 0.7, 0, 38, coresDe(0x6c7a89)); for (let i = 0; i < 4; i++) { const z = 3 + i * 9; emFace(c, 'esq', 0.15, 0.85, 0.08, 0.62, z, z + 7, shade(0x6c7a89, 16)); emFace(c, 'esq', 0.15, 0.85, 0.26, 0.44, z + 4, z + 5, 0x2a2d36); emFace(c, 'esq', 0.15, 0.85, 0.14, 0.38, z + 1.5, z + 3.5, 0xffffff); } },
  'quadro-avisos': (c, w) => { quadroFino(c, 0.06, w - 0.12, 10, 36, 0x7a5436); emFace(c, 'esq', 0, 0.12, 0.14, w - 0.14, 13, 43, 0xc8975a);
    for (const [a, b, z, k] of [[0.2, 0.55, 30, 0xffffff], [0.65, 1.0, 26, 0xfff176], [1.1, 1.45, 31, 0xffffff], [0.3, 0.62, 18, 0xa7d8f0], [0.85, 1.25, 16, 0xffffff], [1.3, 1.75, 22, 0xf8bbd0]] as [number, number, number, number][]) { emFace(c, 'esq', 0, 0.12, a, b, z, z + 9, k); emFace(c, 'esq', 0, 0.12, a + 0.12, b - 0.08, z + 5, z + 6, 0x8d93a1); } },
  extintor: (c) => { caixa(c, 0.36, 0.36, 0.28, 0.28, 0, 24, coresDe(0xd32f2f)); caixa(c, 0.44, 0.44, 0.12, 0.12, 24, 5, coresDe(PRETO), false); emFace(c, 'esq', 0.36, 0.64, 0.08, 0.2, 12, 18, 0xffffff); },
  lixeira: (c) => { caixa(c, 0.25, 0.25, 0.5, 0.5, 0, 20, coresDe(0x555b6b)); caixa(c, 0.22, 0.22, 0.56, 0.56, 20, 2, coresDe(0x3a3f4b)); emFace(c, 'esq', 0.25, 0.75, 0.1, 0.4, 6, 14, 0x2fd27a); },
} as Record<string, Desenho>);

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
