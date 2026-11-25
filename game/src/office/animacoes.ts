// ANIMAÇÕES DE PERSONAGEM. Qualquer spritesheet (gerada por código ou importada) usa o mesmo formato: quadros em linhas e colunas,
// e uma lista de animações associadas a estados e direções. As animações refletem o estado REAL do agente: nada é encenado.
import { DIRECOES, type Direcao } from './iso';

export type EstadoAnim = 'idle' | 'walking' | 'sitting' | 'typing' | 'thinking' | 'talking' | 'working' | 'celebrating' | 'error';
export const ESTADOS_ANIM: EstadoAnim[] = ['idle', 'walking', 'sitting', 'typing', 'thinking', 'talking', 'working', 'celebrating', 'error'];

export interface AnimDef { estado: EstadoAnim | null; nome: string; direcao: Direcao | null; linha: number; quadros: number[]; fps: number; loop: boolean }
export interface SheetDef {
  id: string; nome: string; assetId?: string | null; quadroL: number; quadroA: number; colunas: number; linhas: number;
  animacoes: AnimDef[]; escala: number; ancora: { x: number; y: number }; velocidade: number; direcoes?: string[];
}

const distDir = (a: Direcao, b: Direcao): number => { const d = Math.abs(DIRECOES.indexOf(a) - DIRECOES.indexOf(b)); return Math.min(d, 8 - d); };

/** Escolhe a animação do estado pedido: a da direção exata, senão a da direção mais próxima, senão a sem direção, senão idle. */
export function escolherAnimacao(def: SheetDef, estado: EstadoAnim, dir: Direcao): AnimDef | null {
  const doEstado = def.animacoes.filter((a) => a.estado === estado);
  const lista = doEstado.length ? doEstado : def.animacoes.filter((a) => a.estado === 'idle');
  if (!lista.length) return null;
  const comDir = lista.filter((a) => a.direcao);
  if (comDir.length) return comDir.slice().sort((a, b) => distDir(a.direcao!, dir) - distDir(b.direcao!, dir))[0];
  return lista[0];
}

/** Índice do quadro (coluna) no instante `t` (segundos). */
export function quadroEm(a: AnimDef, t: number): number {
  const n = a.quadros.length; if (!n) return 0;
  const passo = Math.floor(t * a.fps);
  return a.quadros[a.loop ? passo % n : Math.min(passo, n - 1)];
}

export function retanguloDoQuadro(def: SheetDef, linha: number, coluna: number): { x: number; y: number; w: number; h: number } {
  return { x: coluna * def.quadroL, y: linha * def.quadroA, w: def.quadroL, h: def.quadroA };
}

/** Estado do AGENTE (vindo do servidor) → animação. Andar só quando está de fato se movendo. */
export function estadoParaAnimacao(estadoAgente: string, { noPosto = false, movendo = false }: { noPosto?: boolean; movendo?: boolean } = {}): EstadoAnim {
  if (movendo) return 'walking';
  switch (estadoAgente) {
    case 'planejando': return 'thinking';
    case 'executando': return noPosto ? 'typing' : 'working';
    case 'analisando': return noPosto ? 'typing' : 'thinking';
    case 'aguardando_aprovacao': return 'thinking';
    case 'concluido': return 'celebrating';
    case 'com_erro': return 'error';
    case 'pausado': return 'sitting';
    default: return 'idle';                      // disponível, aguardando
  }
}
/** Estados em que o agente de fato trabalha e, por isso, vai ao posto de trabalho. */
export const ESTADOS_DE_TRABALHO = ['planejando', 'executando', 'analisando'];
