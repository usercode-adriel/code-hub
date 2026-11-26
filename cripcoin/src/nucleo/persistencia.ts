// PERSISTÊNCIA: projetos salvos no localStorage (um índice + um registro por projeto). Vários projetos, salvamento manual e automático.
import type { Projeto } from '../tipos';
import { reacomodar } from './mapa';
import { registrar } from '../sistemas/economia';
import { AVATARES, gerarCandidatos } from '../dados/pessoas';

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
  p.recontratar ??= []; p.candidatos ??= []; p.funcionarios ??= []; p.quadros ??= {}; p.armarios ??= {}; p.computadores ??= {}; p.estoqueLoja ??= {}; p.inventario ??= {}; p.transacoes ??= []; p.config ??= { som: true, papelDeParede: 'azul' }; p.velocidade ||= 1; p.prox ||= 1; if (!p.config.bonus5000) { p.config.bonus5000 = true; p.cc += 5000; registrar(p, 'recompensa', 5000, 'Bônus de 5.000 CC'); }
  p.conversas ??= {}; p.automacoes ??= []; p.coresParede ??= Array(p.largura * p.altura).fill(''); // personagens antigas (5 avatares de 8 direções) foram substituídas pelas 3 atuais: funcionários com avatar antigo saem e os candidatos são refeitos
  p.funcionarios = p.funcionarios.filter((f) => AVATARES.includes(f.avatar)); p.recontratar = p.recontratar.filter((c) => AVATARES.includes(c.avatar));
  if (p.candidatos.some((c) => !AVATARES.includes(c.avatar)) || (p.candidatos.length === 0 && p.recontratar.length === 0 && p.funcionarios.length === 0)) {
    p.candidatos = gerarCandidatos(p.criadoEm).filter((c) => !p.funcionarios.some((f) => f.avatar === c.avatar && f.status !== 'demitido') && !p.recontratar.some((r) => r.avatar === c.avatar));
  }
  for (const f of p.funcionarios) { f.defeitos ??= []; f.extras ??= ''; f.estado = 'ausente'; } reacomodar(p); return p;
}
export const exportar = (p: Projeto): string => JSON.stringify(p);
export function importar(texto: string): Projeto | null { try { const p = JSON.parse(texto) as Projeto; return p && p.versao === 1 && Array.isArray(p.objetos) && Array.isArray(p.paredes) ? migrar(p) : null; } catch { return null; } }
