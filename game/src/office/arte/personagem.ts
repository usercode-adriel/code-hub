// PERSONAGENS PROVISÓRIOS: spritesheet gerada por código no MESMO formato de uma spritesheet importada (quadros, linhas, animações por
// estado e direção). Quando o proprietário importar um PNG próprio, ele entra pelo Avatar Manager e substitui este, sem mexer nos dados do funcionário.
import { PixelImage, shade } from '../../assets/pixel';
import { elipse, poligono } from './desenho';
import { ESTADOS_ANIM, type AnimDef, type EstadoAnim, type SheetDef } from '../animacoes';
import type { Direcao } from '../iso';

export const QUADRO_L = 28; export const QUADRO_A = 46;
export const DIRS_PROC: Direcao[] = ['SE', 'SW', 'NE', 'NW'];
export interface CoresPessoa { pele: number; cabelo: number; camisa: number; calca: number; estilo?: 'curto' | 'longo' | 'coque' | 'cacheado'; oculos?: boolean; acessorio?: number }

export const PALETAS: Record<string, CoresPessoa> = {
  helena: { pele: 0xe8b890, cabelo: 0x3a2a1e, camisa: 0x6c4cf5, calca: 0x2f3550 }, arthur: { pele: 0xc98f66, cabelo: 0x1f1f26, camisa: 0x0ea5e9, calca: 0x3b3f4d },
  sofia: { pele: 0xf1c8a4, cabelo: 0xa0522d, camisa: 0x16a34a, calca: 0x33384a }, isabela: { pele: 0xdba07a, cabelo: 0x7b2d6b, camisa: 0xec4899, calca: 0x2d3148 },
  marina: { pele: 0x9c6a4a, cabelo: 0x151515, camisa: 0xf59e0b, calca: 0x3a3a46 },
  // equipe 2.1
  eleonor: { pele: 0xdba07a, cabelo: 0xb5367a, camisa: 0xec4899, calca: 0x2d3148, estilo: 'longo', acessorio: 0xf7c948 },
  lady: { pele: 0xe8b890, cabelo: 0x23232e, camisa: 0x0ea5e9, calca: 0x2b3148, estilo: 'coque', oculos: true },
  sophia: { pele: 0xf1c8a4, cabelo: 0x7a4a2a, camisa: 0x2f8f5b, calca: 0x33384a, estilo: 'curto' },
  laurinda: { pele: 0xa9744f, cabelo: 0x2a1a14, camisa: 0x7c3aed, calca: 0x3a3a46, estilo: 'cacheado', acessorio: 0x22d3ee },
  lucya: { pele: 0x9c6a4a, cabelo: 0x151515, camisa: 0xf59e0b, calca: 0x3b4252, estilo: 'longo', acessorio: 0x2f3550 },
};
export const paletaPadrao = (chave: string): CoresPessoa => PALETAS[chave] ?? { pele: 0xd9a77f, cabelo: 0x3b2a1a, camisa: 0x6b7280, calca: 0x2f3550 };

interface Pose { sentado?: boolean; preocupado?: boolean; inclinado?: number; bob?: number; pernas?: number; bracoE?: [number, number]; bracoD?: [number, number]; boca?: boolean; balao?: 'pensar' | 'falar' | 'erro' | 'festa' | 'digitar' | 'zzz' | 'suor' | null; balaoFase?: number }

function desenharPessoa(img: PixelImage, ox: number, oy: number, dir: Direcao, cor: CoresPessoa, p: Pose): void {
  const frente = dir === 'SE' || dir === 'SW'; const olhaDireita = dir === 'SE' || dir === 'NE'; const L = olhaDireita ? 1 : -1;
  const bob = p.bob ?? 0; const baixo = p.sentado ? 9 : 0; const y0 = oy - 42 + bob + baixo;           // topo da cabeça
  const cx = ox + 14;
  const calca = cor.calca; const sapato = 0x1c1c22;
  // pernas
  if (p.sentado) {
    img.rect(cx - 5, y0 + 27, 4, 5, calca); img.rect(cx + 1, y0 + 27, 4, 5, calca);                      // coxas escondidas
    const dx = L * 4; img.rect(cx - 5 + dx, y0 + 31, 5, 4, calca); img.rect(cx + 1 + dx, y0 + 31, 5, 4, shade(calca, -10));
    img.rect(cx - 5 + dx + (L > 0 ? 3 : -1), y0 + 33, 3, 2, sapato); img.rect(cx + 1 + dx + (L > 0 ? 3 : -1), y0 + 33, 3, 2, sapato);
  } else {
    const f = p.pernas ?? 0;
    img.rect(cx - 5, y0 + 28 - Math.max(0, f), 4, 11 + Math.max(0, f), calca); img.rect(cx + 1, y0 + 28 + Math.min(0, f), 4, 11 - Math.min(0, f), shade(calca, -10));
    img.rect(cx - 5, y0 + 39, 5, 2, sapato); img.rect(cx + 1, y0 + 39, 5, 2, sapato);
  }
  // tronco
  img.rect(cx - 6, y0 + 15, 12, 14, cor.camisa); img.rect(cx + 2, y0 + 15, 4, 14, shade(cor.camisa, -26)); img.rect(cx - 6, y0 + 15, 12, 2, shade(cor.camisa, 22));
  // braços
  const bE = p.bracoE ?? [0, 0]; const bD = p.bracoD ?? [0, 0];
  img.rect(cx - 9 + bE[0], y0 + 16 + bE[1], 3, 11, cor.camisa); img.rect(cx - 9 + bE[0], y0 + 26 + bE[1], 3, 3, cor.pele);
  img.rect(cx + 6 + bD[0], y0 + 16 + bD[1], 3, 11, shade(cor.camisa, -18)); img.rect(cx + 6 + bD[0], y0 + 26 + bD[1], 3, 3, cor.pele);
  // pescoço e cabeça
  img.rect(cx - 2, y0 + 12, 4, 4, shade(cor.pele, -14));
  elipse(img, cx, y0 + 7, 6, 7, cor.pele);
  // cabelo: de frente cobre o topo e a franja; de costas cobre a cabeça toda
  const estilo = cor.estilo ?? 'curto';
  if (frente) { elipse(img, cx, y0 + 3, 6, 4, cor.cabelo); img.rect(cx - 6, y0 + 3, 12, 3, cor.cabelo); img.rect(cx - 6, y0 + 3, 2, 8, cor.cabelo); img.rect(cx + 4, y0 + 3, 2, 8, cor.cabelo);
    if (estilo === 'longo') { img.rect(cx - 7, y0 + 3, 3, 20, cor.cabelo); img.rect(cx + 4, y0 + 3, 3, 20, cor.cabelo); img.rect(cx - 7, y0 + 21, 3, 2, shade(cor.cabelo, -18)); img.rect(cx + 4, y0 + 21, 3, 2, shade(cor.cabelo, -18)); }
    if (estilo === 'cacheado') { for (const [dx, dy] of [[-8, 4], [-8, 9], [-8, 14], [7, 4], [7, 9], [7, 14], [-4, -2], [0, -3], [4, -2]]) elipse(img, cx + dx, y0 + dy + 2, 3, 3, cor.cabelo); }
    if (estilo === 'coque') elipse(img, cx, y0 - 3, 4, 4, cor.cabelo); }
  else { elipse(img, cx, y0 + 7, 6, 7, cor.cabelo); img.rect(cx - 6, y0 + 3, 12, 8, cor.cabelo);
    if (estilo === 'longo') img.rect(cx - 7, y0 + 3, 14, 22, cor.cabelo);
    if (estilo === 'cacheado') { for (const [dx, dy] of [[-8, 4], [-8, 10], [-8, 16], [8, 4], [8, 10], [8, 16], [0, 18], [-4, 20], [4, 20]]) elipse(img, cx + dx, y0 + dy + 2, 3, 3, cor.cabelo); }
    if (estilo === 'coque') elipse(img, cx, y0 - 3, 4, 4, cor.cabelo); }
  if (frente) {                                                    // rosto: olhos deslocados para o lado que olha
    const ex = cx + L * 2; img.set(ex - 2, y0 + 8, 0x1c1c22); img.set(ex + 2, y0 + 8, 0x1c1c22); img.set(ex - 2, y0 + 9, 0x1c1c22); img.set(ex + 2, y0 + 9, 0x1c1c22);
    if (p.boca) img.rect(ex - 1, y0 + 12, 3, 2, 0x5a1d1d); else img.rect(ex - 1, y0 + 12, 3, 1, p.preocupado ? 0x5a3a2a : 0x8a4a3a);
    if (p.preocupado) { img.set(ex - 3, y0 + 6, 0x1c1c22); img.set(ex - 2, y0 + 5, 0x1c1c22); img.set(ex + 3, y0 + 6, 0x1c1c22); img.set(ex + 2, y0 + 5, 0x1c1c22); }
    if (cor.oculos) { img.rect(ex - 4, y0 + 7, 4, 3, 0x2a2d36); img.rect(ex + 1, y0 + 7, 4, 3, 0x2a2d36); img.rect(ex - 3, y0 + 8, 2, 1, 0xdff4fb); img.rect(ex + 2, y0 + 8, 2, 1, 0xdff4fb); img.rect(ex, y0 + 8, 1, 1, 0x2a2d36); }
    if (cor.acessorio) { img.rect(cx - 7, y0 + 11, 2, 2, cor.acessorio); img.rect(cx + 5, y0 + 11, 2, 2, cor.acessorio); }
  }
  // balões de estado (acima da cabeça)
  const bx = cx + 8; const by = y0 - 8;
  const bolha = (cor2: number): void => { poligono(img, [[bx - 7, by - 6], [bx + 9, by - 6], [bx + 9, by + 5], [bx - 7, by + 5]], 0xffffff); poligono(img, [[bx - 6, by - 5], [bx + 8, by - 5], [bx + 8, by + 4], [bx - 6, by + 4]], cor2); };
  if (p.balao === 'pensar') { bolha(0xffffff); for (let i = 0; i < 3; i++) img.rect(bx - 4 + i * 5, by - 1, 2, 2, (p.balaoFase ?? 0) % 3 === i ? 0x6c4cf5 : 0xb0b6c4); }
  else if (p.balao === 'falar') { bolha(0xffffff); img.rect(bx - 4, by - 3, 10, 1, 0x6b7280); img.rect(bx - 4, by, 7, 1, 0x6b7280); }
  else if (p.balao === 'erro') { bolha(0xffe0e3); img.rect(bx + 1, by - 4, 2, 5, 0xe53935); img.rect(bx + 1, by + 2, 2, 2, 0xe53935); }
  else if (p.balao === 'festa') { for (const [dx, dy, k] of [[-10, -6, 0xf7c948], [12, -2, 0xec4899], [-4, -12, 0x22d3ee], [9, -10, 0x2fd27a]] as [number, number, number][]) img.rect(cx + dx + ((p.balaoFase ?? 0) % 2) * 2, y0 + dy - ((p.balaoFase ?? 0) % 3), 2, 2, k); }
  else if (p.balao === 'zzz') { const f = (p.balaoFase ?? 0) % 3; for (let i = 0; i <= f; i++) { const zx = bx - 2 + i * 4; const zy = by + 2 - i * 4; img.rect(zx, zy, 4, 1, 0x6c4cf5); img.set(zx + 3, zy + 1, 0x6c4cf5); img.set(zx + 2, zy + 2, 0x6c4cf5); img.set(zx + 1, zy + 3, 0x6c4cf5); img.rect(zx, zy + 4, 4, 1, 0x6c4cf5); } }
  else if (p.balao === 'suor') { img.rect(cx + 7, y0 + 2 + ((p.balaoFase ?? 0) % 2) * 2, 2, 3, 0x4dd0e1); img.rect(cx - 9, y0 + 4 + ((p.balaoFase ?? 0) % 2), 2, 3, 0x4dd0e1); }
  else if (p.balao === 'digitar') { for (let i = 0; i < 3; i++) img.rect(bx - 4 + i * 4, by + 1 - ((p.balaoFase ?? 0) + i) % 2, 2, 2, 0x4dd0e1); }
}

const ANIMS: { estado: EstadoAnim; quadros: number; fps: number; pose: (q: number) => Pose }[] = [
  { estado: 'idle', quadros: 2, fps: 2, pose: (q) => ({ bob: q % 2 }) },
  { estado: 'walking', quadros: 4, fps: 8, pose: (q) => ({ bob: q % 2, pernas: [-3, 0, 3, 0][q], bracoE: [0, [3, 0, -3, 0][q]], bracoD: [0, [-3, 0, 3, 0][q]] }) },
  { estado: 'sitting', quadros: 1, fps: 1, pose: () => ({ sentado: true }) },
  { estado: 'typing', quadros: 2, fps: 8, pose: (q) => ({ sentado: true, bracoE: [3, q ? 4 : 2], bracoD: [-3, q ? 2 : 4], balao: 'digitar', balaoFase: q }) },
  { estado: 'thinking', quadros: 2, fps: 3, pose: (q) => ({ bracoD: [-2, -6], balao: 'pensar', balaoFase: q }) },
  { estado: 'talking', quadros: 2, fps: 5, pose: (q) => ({ boca: q === 1, bracoE: [0, q ? -3 : 0], balao: 'falar' }) },
  { estado: 'working', quadros: 2, fps: 6, pose: (q) => ({ sentado: true, bracoE: [3, q ? 3 : 5], bracoD: [-3, q ? 5 : 3], balao: 'digitar', balaoFase: q + 1 }) },
  { estado: 'celebrating', quadros: 4, fps: 6, pose: (q) => ({ bob: [-3, 0, -3, 0][q], bracoE: [-2, -10], bracoD: [2, -10], boca: true, balao: 'festa', balaoFase: q }) },
  { estado: 'error', quadros: 2, fps: 3, pose: (q) => ({ bob: q, bracoE: [3, -8], bracoD: [-3, -8], balao: 'erro' }) },
  { estado: 'resting', quadros: 3, fps: 1.5, pose: (q) => ({ sentado: true, bracoE: [-1, 2], bracoD: [1, 2], balao: 'zzz', balaoFase: q }) },
  { estado: 'worried', quadros: 2, fps: 3, pose: (q) => ({ sentado: true, preocupado: true, bracoE: [2, -3], bracoD: [-2, -3], bob: q, balao: 'suor', balaoFase: q }) },
  { estado: 'meeting', quadros: 2, fps: 1.5, pose: (q) => ({ sentado: true, bob: q % 2, bracoE: [2, 1], bracoD: [-2, 1] }) },
  { estado: 'meeting-talking', quadros: 4, fps: 5, pose: (q) => ({ sentado: true, boca: q % 2 === 1, bracoE: [1, [0, -4, -2, -5][q]], bracoD: [-1, [-3, 0, -4, 0][q]] }) },
];

/** Spritesheet procedural de um funcionário: 9 animações × 4 direções, 4 colunas de quadros. */
export function criarSheetProcedural(chave: string, cores: CoresPessoa = paletaPadrao(chave)): { img: PixelImage; def: SheetDef } {
  const colunas = 4; const linhas = ANIMS.length * DIRS_PROC.length;
  const img = new PixelImage(colunas * QUADRO_L, linhas * QUADRO_A);
  const animacoes: AnimDef[] = [];
  ANIMS.forEach((a, ai) => DIRS_PROC.forEach((dir, di) => {
    const linha = ai * DIRS_PROC.length + di;
    for (let q = 0; q < a.quadros; q++) { const quadro = new PixelImage(QUADRO_L, QUADRO_A); desenharPessoa(quadro, 0, QUADRO_A - 2, dir, cores, a.pose(q)); img.blit(quadro, q * QUADRO_L, linha * QUADRO_A); }
    animacoes.push({ estado: a.estado, nome: `${a.estado}-${dir}`, direcao: dir, linha, quadros: Array.from({ length: a.quadros }, (_, k) => k), fps: a.fps, loop: true });
  }));
  return { img, def: { id: `proc-${chave}`, nome: `Provisório ${chave}`, assetId: null, quadroL: QUADRO_L, quadroA: QUADRO_A, colunas, linhas, animacoes, escala: 1, ancora: { x: 0.5, y: 1 }, velocidade: 1, direcoes: DIRS_PROC } };
}
export { ESTADOS_ANIM };
