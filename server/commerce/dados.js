// TAREFAS, PRODUTOS E CAMPANHAS do Commerce Office. Tudo persistido, com histórico, e sem métricas inventadas:
// uma avaliação comercial só aceita nota se vier com a FONTE dela.
import { area, auditar, erro, txt, oneOf, numero, dataISO, hoje, id, now, save } from './store.js';
import { PLATAFORMAS } from './finance.js';

export const DEPARTAMENTOS = {
  diretoria: 'Diretoria', pesquisa: 'Pesquisa e Inteligência Comercial', produtos: 'Produtos e Marketplace', marketing: 'Marketing e Criatividade',
  audiovisual: 'Estúdio Audiovisual', financeiro: 'Financeiro', reunioes: 'Sala de Reuniões', convivencia: 'Área de Convivência',
};

// ---------- tarefas ----------
export const STATUS_TAREFA = ['pendente', 'em_execucao', 'aguardando_aprovacao', 'concluida', 'erro', 'cancelada'];
export const PRIORIDADES = ['baixa', 'media', 'alta', 'urgente'];
const hist = (t, acao, extra = {}) => { t.historico.push({ em: now(), acao, ...extra }); };

export function criarTarefa(userId, b) {
  const nome = txt(b.nome, 160); if (!nome) throw erro('Dê um nome à tarefa.');
  const a = area(userId);
  const agenteId = txt(b.agenteId, 60) || null;
  if (agenteId && !a.agentes.some((x) => x.id === agenteId)) throw erro('Agente não encontrado.', 404);
  const t = {
    id: id(), nome, descricao: txt(b.descricao, 4000), departamento: oneOf(b.departamento, Object.keys(DEPARTAMENTOS), 'diretoria'), agenteId,
    prioridade: oneOf(b.prioridade, PRIORIDADES, 'media'), prazo: dataISO(b.prazo), status: 'pendente', criadaEm: now(), concluidaEm: null, resultado: '',
    produtoId: txt(b.produtoId, 60) || null, campanhaId: txt(b.campanhaId, 60) || null, historico: [],
  };
  hist(t, 'criada', { agenteId });
  a.tarefas.push(t); save(); auditar(userId, 'tarefa.criar', { tarefa: t.id });
  return t;
}

export function acharTarefa(userId, tid) {
  const t = area(userId).tarefas.find((x) => x.id === tid);
  if (!t) throw erro('Tarefa não encontrada.', 404);
  return t;
}

export function atualizarTarefa(userId, tid, b) {
  const t = acharTarefa(userId, tid); const a = area(userId);
  if ('nome' in b) t.nome = txt(b.nome, 160) || t.nome;
  if ('descricao' in b) t.descricao = txt(b.descricao, 4000);
  if ('prioridade' in b) t.prioridade = oneOf(b.prioridade, PRIORIDADES, t.prioridade);
  if ('prazo' in b) t.prazo = dataISO(b.prazo);
  if ('departamento' in b) t.departamento = oneOf(b.departamento, Object.keys(DEPARTAMENTOS), t.departamento);
  if ('agenteId' in b && (b.agenteId || null) !== t.agenteId) {
    const novo = txt(b.agenteId, 60) || null;
    if (novo && !a.agentes.some((x) => x.id === novo)) throw erro('Agente não encontrado.', 404);
    hist(t, 'reatribuida', { de: t.agenteId, para: novo }); t.agenteId = novo;
  }
  save(); return t;
}

/** Transições de estado de uma tarefa. Aprovação e conclusão ficam registradas no histórico. */
export function mudarStatusTarefa(userId, tid, status, { resultado = null, motivo = '' } = {}) {
  const t = acharTarefa(userId, tid);
  if (!STATUS_TAREFA.includes(status)) throw erro('Status inválido.');
  if (t.status === status) return t;
  const de = t.status;
  t.status = status;
  if (resultado !== null) t.resultado = txt(resultado, 20000);
  if (status === 'concluida') t.concluidaEm = now();
  hist(t, 'status', { de, para: status, motivo: txt(motivo, 300) });
  save(); auditar(userId, 'tarefa.status', { tarefa: t.id, de, para: status });
  return t;
}

export const atrasada = (t) => Boolean(t.prazo && t.prazo < hoje() && !['concluida', 'cancelada'].includes(t.status));
export const listarTarefas = (userId, f = {}) => area(userId).tarefas
  .filter((t) => (f.departamento ? t.departamento === f.departamento : true) && (f.agenteId ? t.agenteId === f.agenteId : true) && (f.status ? t.status === f.status : true))
  .map((t) => ({ ...t, atrasada: atrasada(t) }))
  .sort((x, y) => (x.prazo || '9999').localeCompare(y.prazo || '9999') || y.criadaEm.localeCompare(x.criadaEm));

// ---------- produtos ----------
export const STATUS_PRODUTO = ['em_pesquisa', 'candidato', 'em_promocao', 'descartado'];
export function normalizarProduto(b, atual = {}) {
  const nome = txt(b.nome ?? atual.nome, 200); if (!nome) throw erro('Dê um nome ao produto.');
  const preco = b.preco === undefined || b.preco === '' ? atual.preco ?? null : numero(b.preco);
  if (preco !== null && (preco === undefined || preco < 0)) throw erro('Preço inválido.');
  const comissaoPct = b.comissaoPct === undefined || b.comissaoPct === '' ? atual.comissaoPct ?? null : numero(b.comissaoPct);
  if (comissaoPct !== null && (comissaoPct < 0 || comissaoPct > 100)) throw erro('Comissão deve estar entre 0 e 100%.');
  const av = b.avaliacao ?? atual.avaliacao ?? null;
  let avaliacao = null;
  if (av && (av.nota !== undefined && av.nota !== null && av.nota !== '' || av.texto)) {
    const nota = av.nota === undefined || av.nota === null || av.nota === '' ? null : numero(av.nota);
    const fonte = txt(av.fonte, 300);
    if (nota !== null && !fonte) throw erro('Informe a fonte da avaliação: não registramos notas ou demanda sem fonte verificável.');
    avaliacao = { nota, texto: txt(av.texto, 1000), fonte };
  }
  const link = txt(b.link ?? atual.link, 500);
  if (link && !/^https?:\/\//i.test(link)) throw erro('O link precisa começar com http:// ou https://');
  return {
    nome, imagem: txt(b.imagem ?? atual.imagem, 500), categoria: txt(b.categoria ?? atual.categoria, 80), plataforma: oneOf(b.plataforma ?? atual.plataforma, PLATAFORMAS, 'outra'),
    preco, comissaoPct, link, origem: txt(b.origem ?? atual.origem, 200) || 'manual', publicoAlvo: txt(b.publicoAlvo ?? atual.publicoAlvo, 300), avaliacao,
    status: oneOf(b.status ?? atual.status, STATUS_PRODUTO, 'em_pesquisa'), real: (b.real ?? atual.real) !== false,
  };
}
/** Comissão potencial por venda: preço × % — é ESTIMATIVA e é mostrada como tal. */
export const comissaoPotencial = (p) => (p.preco != null && p.comissaoPct != null ? Math.round(p.preco * p.comissaoPct) / 100 : null);

export function criarProduto(userId, b) {
  const p = { id: id(), ...normalizarProduto(b), criadoEm: now(), historico: [{ em: now(), acao: 'criado' }] };
  area(userId).produtos.push(p); save(); auditar(userId, 'produto.criar', { produto: p.id });
  return { ...p, comissaoPotencial: comissaoPotencial(p) };
}
export function atualizarProduto(userId, pid, b) {
  const p = area(userId).produtos.find((x) => x.id === pid); if (!p) throw erro('Produto não encontrado.', 404);
  const novo = normalizarProduto(b, p);
  const mudou = Object.keys(novo).filter((k) => JSON.stringify(novo[k]) !== JSON.stringify(p[k]));
  Object.assign(p, novo); if (mudou.length) p.historico.push({ em: now(), acao: 'editado', campos: mudou });
  save(); return { ...p, comissaoPotencial: comissaoPotencial(p) };
}
export const listarProdutos = (userId, f = {}) => area(userId).produtos
  .filter((p) => (f.plataforma ? p.plataforma === f.plataforma : true) && (f.status ? p.status === f.status : true) && (f.real === undefined ? true : p.real === f.real))
  .map((p) => ({ ...p, comissaoPotencial: comissaoPotencial(p) })).sort((x, y) => y.criadoEm.localeCompare(x.criadoEm));
export function removerProduto(userId, pid) {
  const a = area(userId); const i = a.produtos.findIndex((x) => x.id === pid); if (i < 0) throw erro('Produto não encontrado.', 404);
  if (a.lancamentos.some((l) => l.produtoId === pid)) throw erro('Este produto tem lançamentos financeiros: marque como descartado em vez de apagar.', 409);
  a.produtos.splice(i, 1); save(); auditar(userId, 'produto.remover', { produto: pid });
}

// ---------- campanhas ----------
export const ETAPAS = ['pesquisa', 'publico', 'ideias', 'planejamento', 'roteiro', 'criativo', 'edicao', 'aprovacao', 'publicacao', 'analise'];
export const STATUS_CAMPANHA = ['ideia', 'planejada', 'em_producao', 'aprovacao', 'publicada', 'encerrada'];
export function criarCampanha(userId, b) {
  const nome = txt(b.nome, 160); if (!nome) throw erro('Dê um nome à campanha.');
  const a = area(userId);
  const produtoId = txt(b.produtoId, 60) || null;
  if (produtoId && !a.produtos.some((x) => x.id === produtoId)) throw erro('Produto não encontrado.', 404);
  const c = {
    id: id(), nome, produtoId, plataforma: oneOf(b.plataforma, PLATAFORMAS, 'tiktokshop'), objetivo: txt(b.objetivo, 300), etapa: oneOf(b.etapa, ETAPAS, 'pesquisa'),
    status: oneOf(b.status, STATUS_CAMPANHA, 'ideia'), responsavelId: txt(b.responsavelId, 60) || null, criativos: [], roteiros: [], resultados: [], criadaEm: now(), historico: [{ em: now(), acao: 'criada' }],
  };
  a.campanhas.push(c); save(); auditar(userId, 'campanha.criar', { campanha: c.id });
  return c;
}
export function atualizarCampanha(userId, cid, b) {
  const c = area(userId).campanhas.find((x) => x.id === cid); if (!c) throw erro('Campanha não encontrada.', 404);
  if ('nome' in b) c.nome = txt(b.nome, 160) || c.nome;
  if ('objetivo' in b) c.objetivo = txt(b.objetivo, 300);
  if ('etapa' in b) { c.etapa = oneOf(b.etapa, ETAPAS, c.etapa); c.historico.push({ em: now(), acao: 'etapa', etapa: c.etapa }); }
  if ('status' in b) {
    const novo = oneOf(b.status, STATUS_CAMPANHA, c.status);
    // publicar é ação externa e comercial: só com aprovação explícita do usuário
    if (novo === 'publicada' && b.aprovadoPeloUsuario !== true) throw erro('Publicar exige a sua aprovação explícita.', 403);
    c.status = novo; c.historico.push({ em: now(), acao: 'status', status: novo });
  }
  if ('responsavelId' in b) c.responsavelId = txt(b.responsavelId, 60) || null;
  save(); return c;
}
/** Adiciona criativo, roteiro ou resultado. Resultados exigem a fonte do número. */
export function adicionarItemCampanha(userId, cid, tipo, b) {
  const c = area(userId).campanhas.find((x) => x.id === cid); if (!c) throw erro('Campanha não encontrada.', 404);
  if (tipo === 'resultados') {
    const valor = numero(b.valor); const fonte = txt(b.fonte, 300);
    if (valor === null || !txt(b.metrica, 80)) throw erro('Informe a métrica e o valor.');
    if (!fonte) throw erro('Informe a fonte do resultado: não registramos números sem fonte.');
    c.resultados.push({ id: id(), data: dataISO(b.data) || hoje(), metrica: txt(b.metrica, 80), valor, fonte });
  } else if (tipo === 'roteiros') {
    if (!txt(b.texto, 20000)) throw erro('O roteiro está vazio.');
    c.roteiros.push({ id: id(), titulo: txt(b.titulo, 160) || 'Roteiro', texto: txt(b.texto, 20000), autor: txt(b.autor, 80) || 'manual', em: now() });
  } else if (tipo === 'criativos') {
    c.criativos.push({ id: id(), titulo: txt(b.titulo, 160) || 'Criativo', tipo: oneOf(b.tipo, ['imagem', 'video', 'texto'], 'texto'), arquivo: txt(b.arquivo, 500), nota: txt(b.nota, 500), em: now() });
  } else throw erro('Tipo de item inválido.');
  save(); return c;
}
export const listarCampanhas = (userId) => area(userId).campanhas.slice().sort((x, y) => y.criadaEm.localeCompare(x.criadaEm));
