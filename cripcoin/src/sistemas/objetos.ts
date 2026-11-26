// ESTADO E AÇÕES DOS OBJETOS INTERATIVOS: armários (inventário próprio), quadros, cafeteira, impressora, plantas e TV. Tudo persiste no projeto.
import { item } from '../dados/catalogo';
import { novoId } from '../nucleo/rng';
import { diaDe } from '../nucleo/tempo';
import type { ObjetoColocado, Projeto, QuadroDados } from '../tipos';
import { listarArquivos } from './arquivos';
import { registrar } from './economia';

export const estado = <T = unknown>(o: ObjetoColocado, k: string, padrao: T): T => (o.estado && k in o.estado ? (o.estado[k] as T) : padrao);
export const definir = (o: ObjetoColocado, k: string, v: unknown): void => { o.estado = { ...(o.estado ?? {}), [k]: v }; };
const obj = (p: Projeto, id: string): ObjetoColocado => { const o = p.objetos.find((q) => q.id === id); if (!o) throw new Error('Objeto não encontrado.'); return o; };

// ---------- armários ----------
export const conteudoArmario = (p: Projeto, id: string): Record<string, number> => (p.armarios[id] ??= {});
export const ocupacaoArmario = (p: Projeto, id: string): number => Object.values(conteudoArmario(p, id)).reduce((a, b) => a + b, 0);
export const capacidade = (p: Projeto, id: string): number => item(obj(p, id).def)?.capacidade ?? 0;
export function guardarNoArmario(p: Projeto, id: string, itemId: string, qtd = 1): { ok: boolean; motivo: string } {
  if ((p.inventario[itemId] ?? 0) < qtd) return { ok: false, motivo: 'Você não tem esse item no inventário.' };
  if (ocupacaoArmario(p, id) + qtd > capacidade(p, id)) return { ok: false, motivo: 'O armário está cheio.' };
  p.inventario[itemId] -= qtd; if (p.inventario[itemId] <= 0) delete p.inventario[itemId]; const c = conteudoArmario(p, id); c[itemId] = (c[itemId] ?? 0) + qtd; return { ok: true, motivo: 'Guardado.' };
}
export function retirarDoArmario(p: Projeto, id: string, itemId: string, qtd = 1): { ok: boolean; motivo: string } {
  const c = conteudoArmario(p, id); if ((c[itemId] ?? 0) < qtd) return { ok: false, motivo: 'Não há essa quantidade no armário.' };
  c[itemId] -= qtd; if (c[itemId] <= 0) delete c[itemId]; p.inventario[itemId] = (p.inventario[itemId] ?? 0) + qtd; return { ok: true, motivo: 'Retirado para o inventário.' };
}
// ---------- quadros ----------
export const quadro = (p: Projeto, id: string): QuadroDados => (p.quadros[id] ??= { tracos: [], notas: [], ideias: [] });
export function adicionarNota(p: Projeto, id: string, texto: string): void { if (!texto.trim()) return; quadro(p, id).notas.push({ id: novoId('n'), texto: texto.trim().slice(0, 300), feito: false }); }
export function adicionarIdeia(p: Projeto, id: string, texto: string): void { if (!texto.trim()) return; quadro(p, id).ideias.push(texto.trim().slice(0, 300)); }
// ---------- cafeteira ----------
export const cafes = (o: ObjetoColocado): number => estado(o, 'cafes', 0);
export const graos = (o: ObjetoColocado): number => estado(o, 'graos', 6);
export function prepararCafe(p: Projeto, id: string): { ok: boolean; motivo: string } {
  const o = obj(p, id); if (graos(o) < 1) return { ok: false, motivo: 'Sem grãos. Compre uma recarga (5 CC).' }; if (cafes(o) >= 6) return { ok: false, motivo: 'A jarra já está cheia.' };
  definir(o, 'graos', graos(o) - 1); definir(o, 'cafes', Math.min(6, cafes(o) + 2)); return { ok: true, motivo: 'Café pronto!' };
}
export function recarregarGraos(p: Projeto, id: string): { ok: boolean; motivo: string } {
  const o = obj(p, id); if (p.cc < 5) return { ok: false, motivo: 'Saldo insuficiente (5 CC).' }; p.cc -= 5; registrar(p, 'gasto', -5, 'Grãos de café'); definir(o, 'graos', graos(o) + 10); return { ok: true, motivo: '+10 doses de café.' };
}
export function tomarCafe(o: ObjetoColocado): boolean { if (cafes(o) < 1) return false; definir(o, 'cafes', cafes(o) - 1); return true; }
// ---------- impressora ----------
export interface TrabalhoImpressao { id: string; nome: string; origem: string; conteudo: string; estado: 'fila' | 'impresso'; em: number }
export const fila = (o: ObjetoColocado): TrabalhoImpressao[] => estado<TrabalhoImpressao[]>(o, 'fila', []);
export const papel = (o: ObjetoColocado): number => estado(o, 'papel', 40);
export function enviarParaImpressora(p: Projeto, impId: string, compId: string, arquivoId: string): { ok: boolean; motivo: string } {
  const o = obj(p, impId); const c = p.computadores[compId]; const f = c && listarArquivos(c.fs).find((x) => x.no.id === arquivoId); if (!f) return { ok: false, motivo: 'Arquivo não encontrado.' };
  definir(o, 'fila', [...fila(o), { id: novoId('imp'), nome: f.no.nome, origem: f.caminho, conteudo: f.no.conteudo ?? '', estado: 'fila', em: Date.now() }]); return { ok: true, motivo: `“${f.no.nome}” entrou na fila.` };
}
/** Imprime um trabalho da fila: gasta folhas (1 por 600 caracteres, mínimo 1). */
export function imprimirProximo(p: Projeto, impId: string): { ok: boolean; motivo: string } {
  const o = obj(p, impId); const q = fila(o); const t = q.find((x) => x.estado === 'fila'); if (!t) return { ok: false, motivo: 'A fila está vazia.' };
  const folhas = Math.max(1, Math.ceil(t.conteudo.length / 600)); if (papel(o) < folhas) return { ok: false, motivo: `Sem papel (precisa de ${folhas} folha(s)). Compre uma resma (8 CC).` };
  definir(o, 'papel', papel(o) - folhas); definir(o, 'fila', q.map((x) => (x.id === t.id ? { ...x, estado: 'impresso' as const } : x))); return { ok: true, motivo: `“${t.nome}” impresso (${folhas} folha(s)).` };
}
export function comprarPapel(p: Projeto, impId: string): { ok: boolean; motivo: string } { const o = obj(p, impId); if (p.cc < 8) return { ok: false, motivo: 'Saldo insuficiente (8 CC).' }; p.cc -= 8; registrar(p, 'gasto', -8, 'Resma de papel'); definir(o, 'papel', papel(o) + 50); return { ok: true, motivo: '+50 folhas.' }; }
export function limparFila(o: ObjetoColocado): void { definir(o, 'fila', fila(o).filter((x) => x.estado === 'fila')); }
// ---------- plantas ----------
export const agua = (o: ObjetoColocado): number => estado(o, 'agua', 100);
export const seca = (o: ObjetoColocado): boolean => agua(o) <= 0;
export const regar = (o: ObjetoColocado): void => definir(o, 'agua', 100);
/** Passa um dia: as plantas perdem água (a suculenta perde menos). */
export function passarDiaPlantas(p: Projeto): void { for (const o of p.objetos) if (item(o.def)?.interacao === 'planta') definir(o, 'agua', Math.max(0, agua(o) - (o.def === 'suculenta' ? 12 : 35))); }
// ---------- TV / projetor ----------
export const ligada = (o: ObjetoColocado): boolean => estado(o, 'ligada', false);
export const alternarTv = (o: ObjetoColocado): boolean => { definir(o, 'ligada', !ligada(o)); return ligada(o); };
export const resumoDia = (p: Projeto): string => `Dia ${diaDe(p.minuto)} · ${p.cc} CC · ${p.funcionarios.filter((f) => f.status === 'ativo').length} funcionário(s)`;
