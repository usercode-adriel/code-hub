// PERSISTÊNCIA: projetos salvos no localStorage (um índice + um registro por projeto). Vários projetos, salvamento manual e automático.
import type { Projeto } from '../tipos';

const IND = 'cripcoin:indice'; const CH = (id: string): string => `cripcoin:p:${id}`;
export interface Resumo { id: string; nome: string; empresa: string; atualizadoEm: number; cc: number; dia: number }
const lerIndice = (): Resumo[] => { try { const v = JSON.parse(localStorage.getItem(IND) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
export const listar = (): Resumo[] => lerIndice().sort((a, b) => b.atualizadoEm - a.atualizadoEm);
export function salvar(p: Projeto, dia: number): boolean {
  try {
    p.atualizadoEm = Date.now(); localStorage.setItem(CH(p.id), JSON.stringify(p));
    const ind = lerIndice().filter((r) => r.id !== p.id); ind.push({ id: p.id, nome: p.nome, empresa: p.empresa, atualizadoEm: p.atualizadoEm, cc: Math.floor(p.cc), dia }); localStorage.setItem(IND, JSON.stringify(ind)); return true;
  } catch { return false; }
}
export function carregar(id: string): Projeto | null {
  try { const t = localStorage.getItem(CH(id)); if (!t) return null; const p = JSON.parse(t) as Projeto; return p && p.versao === 1 && Array.isArray(p.objetos) ? migrar(p) : null; } catch { return null; }
}
export function excluir(id: string): void { localStorage.removeItem(CH(id)); localStorage.setItem(IND, JSON.stringify(lerIndice().filter((r) => r.id !== id))); }
/** Completa campos que projetos antigos ainda não tinham. */
function migrar(p: Projeto): Projeto {
  p.recontratar ??= []; p.candidatos ??= []; p.funcionarios ??= []; p.quadros ??= {}; p.armarios ??= {}; p.computadores ??= {}; p.estoqueLoja ??= {}; p.inventario ??= {}; p.transacoes ??= []; p.config ??= { som: true, papelDeParede: 'azul' }; p.velocidade ||= 1; p.prox ||= 1; return p;
}
export const exportar = (p: Projeto): string => JSON.stringify(p);
export function importar(texto: string): Projeto | null { try { const p = JSON.parse(texto) as Projeto; return p && p.versao === 1 && Array.isArray(p.objetos) && Array.isArray(p.paredes) ? migrar(p) : null; } catch { return null; } }
