// EVENTOS DO ESCRITÓRIO (tipados): a engine avisa; o HUD em React escuta. A engine não conhece o React e o React não mexe na engine por dentro.
import type { Layout } from './modelo';
import type { Direcao } from './iso';

export type Modo = 'execucao' | 'visualizacao' | 'construcao' | 'edicao';
export type AlvoSelecao =
  | { tipo: 'personagem'; id: string; agenteId: string | null }
  | { tipo: 'objeto'; id: string; tipoObjeto: string }
  | { tipo: 'departamento'; id: string; chave: string }
  | { tipo: 'celula'; x: number; y: number }
  | { tipo: 'nenhum' };

export interface OfficeEventos {
  selecionar: AlvoSelecao;
  /** Uma estação ou objeto interativo foi acionado: abrir a ferramenta real (painel do escritório ou módulo do Hub). */
  acao: { alvo: string; objetoId: string | null; estacaoId: string | null; agenteId: string | null; rotulo: string };
  modo: Modo;
  camera: { zoom: number };
  layoutMudou: { layout: Layout; podeDesfazer: boolean; podeRefazer: boolean; sujo: boolean };
  hover: { rotulo: string | null };
  pronto: { fps: number };
  aviso: { texto: string };
}
export type { Direcao };
