// PROPRIEDADES DOS ASSETS: escala de referência por categoria, superfícies de apoio e tipos de apoio aceitos.
// Tudo é regra de dados (não há offset por objeto no renderer): o catálogo chama `aplicar` uma vez ao carregar.
import manifesto from '../../public/arte/manifesto.json';
import type { ItemDef, Retangulo } from '../tipos';

/** Dimensões originais do sprite em pixels de arte (2x). Sem arquivo => 64×64 (placeholder). */
export const dimSprite = (nome: string): { w: number; h: number } => (manifesto.objetos as Record<string, { w: number; h: number }>)[nome] ?? { w: 64, h: 64 };
export const ART_POR_TILE = 64;

// largura-alvo (px de arte, com a mesa de 2 tiles = 128 px) para itens pequenos, por categoria: mantém a proporção objeto × mesa
const ALVO_CATEGORIA: Record<string, number> = { computadores: 48, equipamentos: 44, cafeteria: 34, plantas: 34, decoracao: 30, iluminacao: 34, outros: 36 };
const ALVO_ITEM: Record<string, number> = { monitor: 52, 'monitor-duplo': 64, 'monitor-curvo': 64, laptop: 46, teclado: 40, mouse: 14, telefone: 30, caneca: 15, 'jarra-cafe': 22, cafeteira: 30, microondas: 48, suculenta: 28, caderno: 26, papeis: 30, despertador: 22, trofeu: 22, 'torre-pc': 28, projetor: 44, 'mesa-digitalizadora': 50, webcam: 18 };

const sup = (tipo: string, ...niveis: Retangulo[]): { tipo: string; niveis: Retangulo[] } => ({ tipo, niveis });
const R = (x0: number, y0: number, x1: number, y1: number): Retangulo => ({ x0, y0, x1, y1 });
/** Áreas úteis dos móveis (frações do sprite). Para itens sem entrada, mesas (flag `mesa`) recebem uma superfície padrão. */
const SUPERFICIES: Record<string, { tipo: string; niveis: Retangulo[] }> = {
  'mesa-simples': sup('mesa', R(0.08, 0.14, 0.92, 0.36)), 'mesa-metal': sup('mesa', R(0.08, 0.1, 0.92, 0.3)), 'mesa-l': sup('mesa', R(0.06, 0.1, 0.6, 0.3)),
  'mesa-baixa': sup('mesa', R(0.1, 0.12, 0.9, 0.4)), 'mesa-lateral': sup('mesa', R(0.1, 0.1, 0.9, 0.45)), 'mesa-redonda': sup('mesa', R(0.2, 0.08, 0.8, 0.26)),
  estante: sup('estante', R(0.1, 0.05, 0.9, 0.13), R(0.1, 0.42, 0.9, 0.5), R(0.1, 0.8, 0.9, 0.88)),
  'arquivo-gavetas': sup('armario', R(0.12, 0.03, 0.88, 0.1)), locker: sup('armario', R(0.12, 0.01, 0.88, 0.04)), vitrine: sup('armario', R(0.12, 0.02, 0.88, 0.09)),
  frigobar: sup('armario', R(0.12, 0.02, 0.88, 0.09)), cofre: sup('armario', R(0.12, 0.03, 0.88, 0.1)),
};
const EM_ESTANTE = new Set(['caderno', 'papeis', 'porta-lapis', 'trofeu', 'despertador', 'ampulheta', 'suculenta', 'caneca', 'jarra-cafe', 'almofada', 'webcam', 'luminaria-mesa']);
const EM_ARMARIO = new Set(['caderno', 'papeis', 'porta-lapis', 'trofeu', 'despertador', 'ampulheta', 'suculenta', 'caneca', 'luminaria-mesa']);
const ALTURA_PAREDE: Record<string, number> = { 'relogio-parede': 0.78, calendario: 0.6, diploma: 0.6, 'quadro-paisagem': 0.6, 'prateleira-pastas': 0.5, 'prateleira-livros': 0.5, 'kit-socorros': 0.5, 'placa-saida': 0.85, 'planta-pendurada': 0.7, janela: 0.5, 'tela-projecao': 0.55 };

const limitar = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
export function aplicar(d: ItemDef): void {
  const nat = dimSprite(d.sprite).w;
  if (d.camada === 'sobre') {
    const alvo = ALVO_ITEM[d.id] ?? ALVO_CATEGORIA[d.categoria] ?? 36; const padrao = limitar(alvo / nat, 0.3, 1.2);
    d.escala = { padrao: Math.round(padrao * 100) / 100, min: 0.4, max: 2 };
    d.apoio = ['mesa', ...(EM_ESTANTE.has(d.id) ? ['estante'] : []), ...(EM_ARMARIO.has(d.id) ? ['armario'] : [])];
  } else if (d.camada === 'parede') { d.escala = { padrao: 1, min: 0.5, max: 2 }; d.alturaPadrao = ALTURA_PAREDE[d.id] ?? 0.6; }
  else d.escala = { padrao: 1, min: 0.5, max: 2 };
  const s = SUPERFICIES[d.id] ?? (d.mesa ? sup('mesa', R(0.08, 0.12, 0.92, 0.38)) : undefined); if (s) { d.superficie = s; if (d.camada === 'objeto') d.girar = false; }   // o sprite do móvel tem uma só vista
}
