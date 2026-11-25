// FINANCEIRO COMERCIAL: lançamentos auditáveis e indicadores que NÃO misturam faturamento, comissão e lucro.
// Regras:
//  - venda      = valor bruto do pedido (faturamento do marketplace, não é dinheiro seu).
//  - comissao   = o que o afiliado ganha: estimada → aprovada → recebida. SÓ "recebida" conta como dinheiro recebido.
//  - reembolso / cancelamento reduzem o que vale.
//  - cada lançamento tem origem e é "real" ou "teste"; os dois nunca são somados juntos.
import { area, auditar, erro, txt, oneOf, numero, dataISO, hoje, id, now, save } from './store.js';

export const TIPOS = ['venda', 'comissao', 'reembolso', 'cancelamento'];
export const STATUS = {
  venda: ['pendente', 'confirmada', 'cancelada'],
  comissao: ['estimada', 'aprovada', 'recebida', 'cancelada'],
  reembolso: ['confirmado'],
  cancelamento: ['confirmado'],
};
export const PLATAFORMAS = ['tiktokshop', 'shopee', 'temu', 'outra'];

// definição e origem de cada indicador (mostrada na tela)
export const INDICADORES = {
  vendasBrutas: { nome: 'Vendas brutas', definicao: 'Soma dos pedidos (vendas) não cancelados, em valor de venda. É faturamento do marketplace, não dinheiro seu.', origem: 'lançamentos do tipo venda' },
  vendasConfirmadas: { nome: 'Vendas confirmadas', definicao: 'Vendas com status confirmada.', origem: 'lançamentos do tipo venda' },
  pedidos: { nome: 'Pedidos', definicao: 'Quantidade de pedidos distintos entre as vendas não canceladas.', origem: 'campo pedido das vendas' },
  produtosVendidos: { nome: 'Produtos vendidos', definicao: 'Soma das quantidades das vendas não canceladas.', origem: 'campo quantidade das vendas' },
  comissoesEstimadas: { nome: 'Comissões estimadas', definicao: 'Comissões ainda não aprovadas pela plataforma. Podem mudar ou ser canceladas. Nunca contam como recebidas.', origem: 'comissões com status estimada' },
  comissoesAprovadas: { nome: 'Comissões aprovadas', definicao: 'Comissões aprovadas pela plataforma e ainda não pagas.', origem: 'comissões com status aprovada' },
  comissoesRecebidas: { nome: 'Comissões recebidas', definicao: 'Comissões efetivamente pagas a você.', origem: 'comissões com status recebida' },
  reembolsos: { nome: 'Reembolsos', definicao: 'Valores devolvidos a compradores (soma dos reembolsos).', origem: 'lançamentos do tipo reembolso' },
  cancelamentos: { nome: 'Cancelamentos', definicao: 'Vendas canceladas mais lançamentos de cancelamento.', origem: 'vendas canceladas e lançamentos do tipo cancelamento' },
  receitaLiquida: { nome: 'Receita líquida', definicao: 'Comissões recebidas menos estornos de comissão. Não é lucro: custos próprios (anúncios, produção) não entram aqui.', origem: 'comissões recebidas e reembolsos sobre comissão' },
};

const arred = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// chave de duplicidade: o identificador externo, quando existe; senão, os campos do lançamento
export function chaveDuplicidade(l) {
  if (l.externoId) return `${l.plataforma}|${l.tipo}|ext:${l.externoId}`;
  return `${l.plataforma}|${l.tipo}|${l.pedido || ''}|${(l.produto || '').toLowerCase()}|${l.data}|${arred(l.valor)}`;
}

export function normalizarLancamento(b) {
  const tipo = oneOf(b.tipo, TIPOS, null);
  if (!tipo) throw erro('Tipo de lançamento inválido. Use venda, comissao, reembolso ou cancelamento.');
  const valor = numero(b.valor);
  if (valor === null || valor < 0) throw erro('Valor inválido (use um número maior ou igual a zero).');
  const data = dataISO(b.data);
  if (!data) throw erro('Data inválida (use AAAA-MM-DD).');
  const plataforma = oneOf(b.plataforma, PLATAFORMAS, null);
  if (!plataforma) throw erro('Plataforma inválida.');
  const status = oneOf(b.status, STATUS[tipo], STATUS[tipo][0]);
  const origem = txt(b.origem, 120);
  if (!origem) throw erro('Informe a origem do lançamento (ex.: manual, importação, api).');
  return {
    data, plataforma, tipo, status, valor: arred(valor), origem,
    produto: txt(b.produto, 160), produtoId: txt(b.produtoId, 60) || null, pedido: txt(b.pedido, 80), campanhaId: txt(b.campanhaId, 60) || null,
    quantidade: Math.max(1, Math.round(numero(b.quantidade, 1))), sobre: oneOf(b.sobre, ['venda', 'comissao'], 'venda'),
    externoId: txt(b.externoId, 120) || null, real: b.real !== false, nota: txt(b.nota, 300),
  };
}

/** Registra um lançamento. Devolve { lancamento } ou { duplicado } sem criar nada repetido. */
export function registrar(userId, b, { importacaoId = null } = {}) {
  const a = area(userId);
  const l = normalizarLancamento(b);
  const chave = chaveDuplicidade(l);
  const igual = a.lancamentos.find((x) => x.chave === chave);
  if (igual) return { duplicado: igual };
  const novo = { id: id(), ...l, chave, importacaoId, criadoEm: now(), historico: [{ em: now(), acao: 'criado', status: l.status }] };
  a.lancamentos.push(novo);
  save();
  return { lancamento: novo };
}

export function mudarStatus(userId, lancId, status) {
  const l = area(userId).lancamentos.find((x) => x.id === lancId);
  if (!l) throw erro('Lançamento não encontrado.', 404);
  if (!STATUS[l.tipo].includes(status)) throw erro(`Status inválido para ${l.tipo}.`);
  if (l.status === status) return l;
  l.historico.push({ em: now(), acao: 'status', de: l.status, status });
  l.status = status;
  save();
  auditar(userId, 'financeiro.status', { lancamento: l.id, status });
  return l;
}

const soma = (lista) => arred(lista.reduce((t, l) => t + l.valor, 0));

function calcular(lancs) {
  const vendas = lancs.filter((l) => l.tipo === 'venda' && l.status !== 'cancelada');
  const com = (s) => lancs.filter((l) => l.tipo === 'comissao' && l.status === s);
  const reembolsoCom = lancs.filter((l) => l.tipo === 'reembolso' && l.sobre === 'comissao');
  const recebidas = soma(com('recebida'));
  return {
    vendasBrutas: soma(vendas),
    vendasConfirmadas: soma(vendas.filter((l) => l.status === 'confirmada')),
    pedidos: new Set(vendas.map((l) => l.pedido || l.id)).size,
    produtosVendidos: vendas.reduce((t, l) => t + (l.quantidade || 1), 0),
    comissoesEstimadas: soma(com('estimada')),
    comissoesAprovadas: soma(com('aprovada')),
    comissoesRecebidas: recebidas,
    reembolsos: soma(lancs.filter((l) => l.tipo === 'reembolso')),
    cancelamentos: arred(soma(lancs.filter((l) => l.tipo === 'venda' && l.status === 'cancelada')) + soma(lancs.filter((l) => l.tipo === 'cancelamento'))),
    receitaLiquida: arred(recebidas - soma(reembolsoCom)),
  };
}

const agrupar = (lancs, chave) => {
  const grupos = new Map();
  for (const l of lancs) { const k = chave(l) || '—'; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(l); }
  return [...grupos.entries()].map(([nome, ls]) => ({ nome, ...calcular(ls) })).sort((x, y) => y.comissoesRecebidas + y.comissoesAprovadas + y.comissoesEstimadas - (x.comissoesRecebidas + x.comissoesAprovadas + x.comissoesEstimadas));
};

/** Resumo financeiro. Dados reais e de teste são SEMPRE calculados separadamente. */
export function resumo(userId, { de = null, ate = null } = {}) {
  const todos = area(userId).lancamentos.filter((l) => (!de || l.data >= de) && (!ate || l.data <= ate));
  const parte = (real) => {
    const ls = todos.filter((l) => l.real === real);
    return { lancamentos: ls.length, indicadores: calcular(ls), porPlataforma: agrupar(ls, (l) => l.plataforma), porProduto: agrupar(ls, (l) => l.produto), porCampanha: agrupar(ls, (l) => l.campanhaId) };
  };
  return { real: parte(true), teste: parte(false), definicoes: INDICADORES, geradoEm: now() };
}

export const listar = (userId, f = {}) => area(userId).lancamentos
  .filter((l) => (f.plataforma ? l.plataforma === f.plataforma : true) && (f.tipo ? l.tipo === f.tipo : true) && (f.real === undefined ? true : l.real === f.real))
  .sort((x, y) => y.data.localeCompare(x.data) || y.criadoEm.localeCompare(x.criadoEm));
export { hoje };
