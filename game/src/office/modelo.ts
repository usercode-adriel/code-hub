// MODELO DO ESCRITÓRIO — formato "codeniac-office" v1 (o mesmo validado pelo servidor em server/commerce/layouts.js).
import type { Direcao } from './iso';

export const FORMATO = 'codeniac-office';
export const VERSAO_FORMATO = 1;

export interface ObjetoLayout { id: string; tipo: string; x: number; y: number; rot?: number; assetId?: string | null; nome?: string; escala?: number; camada?: number }   // x,y podem ser fracionários (posicionamento livre); escala 0,4–3; camada -10..10
export interface ParedeLayout { x: number; y: number; lado: 'N' | 'W'; tipo?: string; abertura?: 'porta' | 'janela' | null }
export interface EstacaoLayout {
  id: string; objetoId?: string | null;
  agenteId?: string | null; agenteChave?: string | null;     // agenteChave só serve para ligar ao agente real na primeira vez
  departamento?: string | null; ferramenta: string; rotulo?: string; pontoTrabalho?: { x: number; y: number }; tarefaId?: string | null;
}
export interface PersonagemLayout { id: string; agenteId?: string | null; personagemId?: string | null; x: number; y: number; dir?: Direcao }
export interface DepartamentoLayout { id: string; chave: string; nome: string; x: number; y: number; w: number; h: number; cor?: string }

export interface Layout {
  formato: typeof FORMATO; versaoFormato: number; largura: number; altura: number;
  piso: string[];                        // largura×altura tipos de piso por linha ('' = vazio/sem chão)
  paredes: ParedeLayout[]; objetos: ObjetoLayout[]; colisoes: { x: number; y: number }[];
  personagens: PersonagemLayout[]; departamentos: DepartamentoLayout[]; estacoes: EstacaoLayout[];
  camadas?: Record<string, boolean>;
  meta?: { padrao?: string };            // marca o layout padrão de fábrica (ex.: "2.1")
}

export const layoutVazio = (largura = 24, altura = 18, piso = 'madeira'): Layout => ({
  formato: FORMATO, versaoFormato: VERSAO_FORMATO, largura, altura, piso: Array(largura * altura).fill(piso), paredes: [], objetos: [], colisoes: [], personagens: [], departamentos: [], estacoes: [],
});

export const copiar = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
export const indice = (l: { largura: number }, x: number, y: number): number => y * l.largura + x;
export const dentro = (l: { largura: number; altura: number }, x: number, y: number): boolean => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < l.largura && y < l.altura;
let contador = 0;
export const novoId = (prefixo: string): string => `${prefixo}-${Date.now().toString(36)}${(contador++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Redimensiona o mapa preservando o que couber (objetos/paredes fora da nova área são removidos). */
export function redimensionar(l: Layout, largura: number, altura: number, pisoNovo = 'madeira'): Layout {
  const n = layoutVazio(largura, altura, pisoNovo);
  for (let y = 0; y < Math.min(altura, l.altura); y++) for (let x = 0; x < Math.min(largura, l.largura); x++) n.piso[indice(n, x, y)] = l.piso[indice(l, x, y)];
  const fica = (o: { x: number; y: number }) => dentro(n, o.x, o.y);
  n.paredes = l.paredes.filter(fica); n.objetos = l.objetos.filter(fica); n.colisoes = l.colisoes.filter(fica); n.personagens = l.personagens.filter(fica);
  n.departamentos = l.departamentos.filter((d) => d.x < largura && d.y < altura).map((d) => ({ ...d, w: Math.min(d.w, largura - d.x), h: Math.min(d.h, altura - d.y) }));
  const ids = new Set(n.objetos.map((o) => o.id));
  n.estacoes = l.estacoes.filter((e) => !e.objetoId || ids.has(e.objetoId));
  if (l.camadas) n.camadas = { ...l.camadas };
  return n;
}
