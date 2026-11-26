// SISTEMA DE ARQUIVOS de cada computador: pastas e arquivos de verdade, salvos no projeto. Operações puras sobre a árvore.
import { novoId } from '../nucleo/rng';
import type { Computador, NoArquivo } from '../tipos';

export const EXT: Record<NoArquivo['tipo'], string> = { pasta: '', txt: '.txt', doc: '.doc', nota: '.nota', projeto: '.proj', relatorio: '.rel' };
export const novoNo = (nome: string, tipo: NoArquivo['tipo'], conteudo = ''): NoArquivo => ({ id: novoId('f'), nome, tipo, ...(tipo === 'pasta' ? { filhos: [] } : { conteudo }), modificado: Date.now() });
export function fsInicial(): Computador {
  const raiz = novoNo('Computador', 'pasta'); const docs = novoNo('Documentos', 'pasta'); const proj = novoNo('Projetos', 'pasta'); const rel = novoNo('Relatórios', 'pasta'); const notas = novoNo('Notas', 'pasta'); const lixo = novoNo('Lixeira', 'pasta');
  docs.filhos!.push(novoNo('Bem-vindo', 'txt', 'Bem-vindo ao Cripcoin Office!\n\nUse a Loja para comprar móveis, construa o escritório e contrate sua equipe.'));
  raiz.filhos!.push(docs, proj, rel, notas, lixo); return { fs: raiz };
}
export function achar(raiz: NoArquivo, id: string): { no: NoArquivo; pai: NoArquivo | null } | null {
  if (raiz.id === id) return { no: raiz, pai: null };
  for (const f of raiz.filhos ?? []) { const r = achar(f, id); if (r) return { no: r.no, pai: r.pai ?? raiz }; }
  return null;
}
export function caminhoDe(raiz: NoArquivo, id: string): string[] { if (raiz.id === id) return [raiz.nome]; for (const f of raiz.filhos ?? []) { const c = caminhoDe(f, id); if (c.length) return [raiz.nome, ...c]; } return []; }
const nomeLivre = (pai: NoArquivo, nome: string, tipo: NoArquivo['tipo'], ignorar?: string): string => {
  const base = nome.trim().slice(0, 60) || (tipo === 'pasta' ? 'Nova pasta' : 'Sem título'); let n = base; let i = 2;
  while ((pai.filhos ?? []).some((f) => f.nome.toLowerCase() === n.toLowerCase() && f.id !== ignorar)) n = `${base} (${i++})`; return n;
};
export function criar(raiz: NoArquivo, paiId: string, nome: string, tipo: NoArquivo['tipo'], conteudo = ''): NoArquivo {
  const p = achar(raiz, paiId)?.no; if (!p || p.tipo !== 'pasta') throw new Error('Pasta de destino inválida.'); const n = novoNo(nomeLivre(p, nome, tipo), tipo, conteudo); p.filhos!.push(n); return n;
}
export function renomear(raiz: NoArquivo, id: string, nome: string): void {
  const r = achar(raiz, id); if (!r || !r.pai) throw new Error('Não dá para renomear a raiz.'); r.no.nome = nomeLivre(r.pai, nome, r.no.tipo, id); r.no.modificado = Date.now();
}
export function salvar(raiz: NoArquivo, id: string, conteudo: string): void { const r = achar(raiz, id); if (!r || r.no.tipo === 'pasta') throw new Error('Arquivo não encontrado.'); r.no.conteudo = conteudo; r.no.modificado = Date.now(); }
/** Move um arquivo/pasta para outra pasta (não permite mover uma pasta para dentro dela mesma). */
export function mover(raiz: NoArquivo, id: string, destinoId: string): void {
  const r = achar(raiz, id); const d = achar(raiz, destinoId)?.no; if (!r || !r.pai || !d || d.tipo !== 'pasta') throw new Error('Movimento inválido.');
  if (achar(r.no, destinoId)) throw new Error('Uma pasta não pode ser movida para dentro dela mesma.'); if (r.pai.id === d.id) return;
  r.pai.filhos = r.pai.filhos!.filter((f) => f.id !== id); r.no.nome = nomeLivre(d, r.no.nome, r.no.tipo); d.filhos!.push(r.no);
}
const clonar = (n: NoArquivo): NoArquivo => ({ ...n, id: novoId('f'), modificado: Date.now(), ...(n.filhos ? { filhos: n.filhos.map(clonar) } : {}) });
export function copiar(raiz: NoArquivo, id: string, destinoId: string): NoArquivo {
  const r = achar(raiz, id); const d = achar(raiz, destinoId)?.no; if (!r || !d || d.tipo !== 'pasta') throw new Error('Cópia inválida.');
  if (achar(r.no, destinoId)) throw new Error('Não dá para copiar uma pasta para dentro dela mesma.'); const c = clonar(r.no); c.nome = nomeLivre(d, `${r.no.nome} - cópia`, c.tipo); d.filhos!.push(c); return c;
}
/** Excluir move para a Lixeira; excluir da Lixeira apaga de vez. */
export function excluir(raiz: NoArquivo, id: string): 'lixeira' | 'apagado' {
  const r = achar(raiz, id); if (!r || !r.pai) throw new Error('Não dá para excluir a raiz.'); const lixo = (raiz.filhos ?? []).find((f) => f.nome === 'Lixeira' && f.tipo === 'pasta');
  if (lixo && (r.no.id === lixo.id)) throw new Error('A Lixeira não pode ser excluída.');
  if (lixo && achar(lixo, id)) { r.pai.filhos = r.pai.filhos!.filter((f) => f.id !== id); return 'apagado'; }
  if (lixo) { mover(raiz, id, lixo.id); return 'lixeira'; } r.pai.filhos = r.pai.filhos!.filter((f) => f.id !== id); return 'apagado';
}
export function esvaziarLixeira(raiz: NoArquivo): number { const l = (raiz.filhos ?? []).find((f) => f.nome === 'Lixeira'); const n = l?.filhos?.length ?? 0; if (l) l.filhos = []; return n; }
export function listarArquivos(raiz: NoArquivo): { no: NoArquivo; caminho: string }[] { const out: { no: NoArquivo; caminho: string }[] = []; const rec = (n: NoArquivo, c: string): void => { for (const f of n.filhos ?? []) { if (f.tipo === 'pasta') rec(f, `${c}/${f.nome}`); else out.push({ no: f, caminho: `${c}/${f.nome}${EXT[f.tipo]}` }); } }; rec(raiz, raiz.nome); return out; }
