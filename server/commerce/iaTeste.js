// DUBLÊ DE IA SÓ PARA TESTES (ativado apenas com CODENIAC_TESTE_IA_FALSA=1 ou injetado nos testes). Tudo que ele produz é marcado como
// "simulada"/"teste" no sistema. Serve para verificar a ORQUESTRAÇÃO (planejar, discutir, executar, registrar, persistir) sem gastar IA —
// NÃO prova a qualidade da IA real. As ações que ele faz usam as mesmas funções reais do servidor (documentos, produtos, estoque, financeiro).
import { criarDocumento } from './documentos.js';
import { criarProduto } from './dados.js';
import { cadastrarItem, movimentar, listarItens } from './estoque.js';
import { resumo } from './finance.js';

const FALAS = {
  eleonor: ['Eu topo! Vejo potencial de conteúdo aqui, mas quero ouvir os números antes de me empolgar demais.', 'Posso escrever um roteiro curto de gancho forte. Só não me peçam milagre com orçamento zero.', 'Fechado: roteiro focado em demonstração rápida do produto.'],
  lady: ['Antes de tudo: qual é a comissão e o preço? Sem isso é só palpite.', 'Discordo de gastar em anúncio já. Teste orgânico primeiro e medimos a conversão.', 'Concordo com o teste orgânico; eu levanto os candidatos com fonte.'],
  sophia: ['Vou olhar o financeiro real antes de aprovar qualquer gasto.', 'Cuidado: comissão estimada não é comissão recebida. Preciso separar isso na análise.', 'De acordo, desde que o teste tenha teto de gasto definido.'],
  laurinda: ['E se a gente testasse uma segunda frente de monetização em paralelo?', 'Proposta: começamos pequeno, medimos e só depois escalamos.', 'Estratégia fechada: teste orgânico, medição e decisão com dados.'],
  lucya: ['Do meu lado, confiro o estoque antes de prometer qualquer coisa.', 'Se vender, precisamos de saldo e embalagem; registro tudo no controle.', 'Ok, acompanho as saídas.'],
};
const atraso = () => new Promise((r) => setTimeout(r, Number(process.env.CODENIAC_TESTE_IA_ATRASO || 0)));
export async function gerar(o) {
  if (o.etapa === 'turno') await atraso();
  if (o.etapa === 'plano') {
    const alvo = o.ativos.filter((n) => n !== 'Lucya');
    return JSON.stringify({ interpretacao: `Ordem do chefe: ${o.ordem.slice(0, 120)}`, tema: o.ordem.slice(0, 120), discutir: alvo.length > 1,
      responsaveis: alvo.map((n) => ({ agente: n, atividade: `Parte de ${n} na ordem (teste)`, tarefa: `${n}: ${o.ordem.slice(0, 60)}` })) });
  }
  if (o.etapa === 'turno') {
    const f = FALAS[o.agente.chave] ?? FALAS.laurinda; const alvo = o.participantes.find((p) => p.id !== o.agente.id);
    const tipo = o.ultima ? 'conclusao' : o.turno === 1 ? 'discordancia' : o.turno === 0 ? 'ideia' : 'conversa';
    return JSON.stringify({ texto: f[Math.min(o.turno % 3, 2)], tipo, para: alvo?.nome ?? null, consenso: o.ultima });
  }
  return JSON.stringify({ texto: `Entreguei a minha parte (${o.agente.nome}); está nos documentos.`, tipo: 'conclusao' });
}

/** Executor de tarefas de teste: usa as funções reais do servidor e registra tudo como simulado. */
export async function executor(user, ag, prompt, write) {
  const uid = user.id; write({ type: 'tool', name: 'commerce_documentos' });
  const tarefa = (await import('./store.js')).area(uid).tarefas.find((t) => t.id === ag.tarefaAtual);
  const doc = (tipo, titulo, texto, extra = {}) => criarDocumento(uid, { tipo, titulo, texto, classificacao: 'simulada', autorAgenteId: ag.id, autor: ag.nome, tarefaId: tarefa?.id, ordemId: tarefa?.ordemId, ...extra });
  let saida = '';
  if (ag.chave === 'lady') { const p = criarProduto(uid, { nome: 'Produto de teste (IA simulada)', plataforma: 'tiktokshop', origem: 'TESTE: dublê de IA, não é pesquisa real', real: false }); doc('proposta', 'Proposta de teste', 'Proposta estruturada de teste.', { produtoId: p.id, estrutura: { objetivo: 'Testar a orquestração', riscos: 'Dado simulado' } }); saida = 'Registrei um produto de TESTE e uma proposta simulada.'; }
  else if (ag.chave === 'eleonor') { doc('roteiro', 'Roteiro de teste', 'Gancho, demonstração e chamada para ação (texto de teste).'); saida = 'Roteiro de teste registrado como documento.'; }
  else if (ag.chave === 'sophia') { const r = resumo(uid, {}); doc('relatorio', 'Análise financeira (dados reais do Hub)', `Lançamentos reais no sistema: ${r.real.lancamentos}.`, { classificacao: 'real', fontes: ['Financeiro do Hub (dados reais)'] }); saida = `Analisei o financeiro real: ${r.real.lancamentos} lançamento(s).`; }
  else if (ag.chave === 'lucya') { let it = listarItens(uid)[0]; if (!it) it = cadastrarItem(uid, { nome: 'Caixa de teste', quantidade: 10, minimo: 2, local: 'Prateleira A1' }, ag.nome); movimentar(uid, { itemId: it.id, tipo: 'saida', quantidade: 1, motivo: 'teste da orquestração' }, ag.nome); saida = 'Registrei uma saída de estoque (teste).'; }
  else { doc('pesquisa', 'Pesquisa de teste', 'Oportunidades de teste (sem fonte real).'); saida = 'Pesquisa de teste registrada.'; }
  write({ type: 'text', text: saida });
  return null;
}
