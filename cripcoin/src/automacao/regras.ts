// AUTOMAÇÕES: regras "quando ACONTECER (evento + filtro) faça AÇÕES". Ficam salvas no projeto (`projeto.automacoes`) e rodam sobre o barramento de eventos.
// Ações são registradas por tipo (`registrarAcao`), então integrações novas (webhook, planilha, etc.) entram sem alterar o núcleo.
// Hoje NÃO há tela para criar regras: a base (modelo, persistência, execução, ações básicas) está pronta e testada para essa tela/integrações.
import type { Jogo } from '../nucleo/jogo';
import type { Automacao } from '../tipos';
import { novoId } from '../nucleo/rng';
import type { Dados } from './eventos';

export interface ContextoAcao { jogo: Jogo; params: Record<string, string | number | boolean>; dados: Dados }
export type Acao = (ctx: ContextoAcao) => void | Promise<void>;
const ACOES = new Map<string, Acao>();
export const registrarAcao = (tipo: string, fn: Acao): void => { ACOES.set(tipo, fn); };
export const tiposDeAcao = (): string[] => [...ACOES.keys()];
const molde = (t: string, d: Dados): string => t.replace(/\{(\w+)\}/g, (_, k: string) => (k in d ? String(d[k]) : `{${k}}`));

// ações básicas
registrarAcao('aviso', ({ jogo, params, dados }) => { jogo.aviso(molde(String(params.texto ?? ''), dados), 'info'); });
registrarAcao('falar', ({ jogo, params, dados }) => { jogo.conversa.falar(String(params.funcionario ?? ''), molde(String(params.texto ?? ''), dados)); });
registrarAcao('recompensa', ({ jogo, params, dados }) => { const v = Number(params.valor); if (!(v > 0 && v <= 100000)) return; jogo.p.cc += v; jogo.registrarTransacao('recompensa', v, molde(String(params.descricao ?? 'Recompensa de automação'), dados)); });

export const casa = (a: Automacao, evento: string, dados: Dados): boolean => a.ativa && a.gatilho.evento === evento && Object.entries(a.gatilho.filtro ?? {}).every(([k, v]) => dados[k] === v);
/** Liga as regras do projeto ao barramento do jogo. Devolve a função que desliga. */
export function instalar(jogo: Jogo): () => void {
  return jogo.eventos.on('*', (evento, dados) => {
    for (const a of jogo.p.automacoes ?? []) {
      if (!casa(a, evento, dados)) continue;
      for (const ac of a.acoes) { const fn = ACOES.get(ac.tipo); if (!fn) { console.error('[automação] ação desconhecida:', ac.tipo); continue; } try { void Promise.resolve(fn({ jogo, params: ac.params, dados })).catch((e) => console.error('[automação]', ac.tipo, e)); } catch (e) { console.error('[automação]', ac.tipo, e); } }
    }
  });
}
export function adicionarAutomacao(jogo: Jogo, a: Omit<Automacao, 'id'>): Automacao { const r: Automacao = { id: novoId('auto'), ...a }; (jogo.p.automacoes ??= []).push(r); jogo.emitir(); return r; }
export function removerAutomacao(jogo: Jogo, id: string): void { jogo.p.automacoes = (jogo.p.automacoes ?? []).filter((a) => a.id !== id); jogo.emitir(); }
