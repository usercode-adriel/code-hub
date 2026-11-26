// DOCUMENTOS DOS AGENTES: roteiros, propostas estruturadas e relatórios. Cada documento diz de onde vem a informação:
// real (veio de dados do Hub), estimada (cálculo/projeção), simulada (teste) ou sugestão da IA (opinião/ideia, sem comprovação).
import { area, auditar, erro, txt, oneOf, id, now, save } from './store.js';

export const TIPOS_DOC = ['roteiro', 'proposta', 'relatorio', 'analise', 'pesquisa'];
export const CLASSIFICACOES = ['real', 'estimada', 'simulada', 'sugestao_ia'];
export const ROTULO_CLASS = { real: 'Informação real', estimada: 'Estimativa', simulada: 'Simulada (teste)', sugestao_ia: 'Sugestão da IA' };

export function criarDocumento(userId, b) {
  const a = area(userId); const titulo = txt(b.titulo, 160); const texto = txt(b.texto, 20000);
  if (!titulo) throw erro('Dê um título ao documento.'); if (!texto) throw erro('O documento está sem conteúdo.');
  const fontes = (Array.isArray(b.fontes) ? b.fontes : []).map((f) => txt(f, 300)).filter(Boolean).slice(0, 20);
  const classificacao = oneOf(b.classificacao, CLASSIFICACOES, 'sugestao_ia');
  if (classificacao === 'real' && !fontes.length) throw erro('Informação classificada como real precisa de fonte. Se não há fonte, classifique como sugestão da IA.');
  const proposta = b.tipo === 'proposta' && b.estrutura && typeof b.estrutura === 'object' ? Object.fromEntries(['objetivo', 'publico', 'orcamento', 'riscos', 'proximosPassos', 'indicadores'].map((k) => [k, txt(b.estrutura[k], 1500)])) : null;
  const d = { id: id(), tipo: oneOf(b.tipo, TIPOS_DOC, 'relatorio'), titulo, texto, classificacao, fontes, estrutura: proposta, autorAgenteId: txt(b.autorAgenteId, 60) || null, autor: txt(b.autor, 60) || 'chefe',
    tarefaId: txt(b.tarefaId, 60) || null, ordemId: txt(b.ordemId, 60) || null, produtoId: txt(b.produtoId, 60) || null, campanhaId: txt(b.campanhaId, 60) || null, criadoEm: now() };
  a.documentos.push(d); save(); auditar(userId, 'documento.criar', { documento: d.id, tipo: d.tipo });
  return d;
}
export function listarDocumentos(userId, { ordemId = null, tipo = null } = {}) { return area(userId).documentos.filter((d) => (!ordemId || d.ordemId === ordemId) && (!tipo || d.tipo === tipo)).slice().reverse(); }
export function acharDocumento(userId, did) { const d = area(userId).documentos.find((x) => x.id === did); if (!d) throw erro('Documento não encontrado.', 404); return d; }
