// FERRAMENTAS DOS AGENTES DO COMMERCE OFFICE. São registradas no sistema de agentes que já existe (agent.js), na área "commerce":
// só os bots do escritório recebem essa permissão. Regras: agentes não inventam dados (precisam informar a ORIGEM),
// não lançam dinheiro, não publicam nada e só leem o financeiro. Tarefas entre agentes ficam pendentes até um humano despachar.
import { registerTools } from '../agent.js';
import { area, txt, hoje } from './store.js';
import { criarProduto, listarProdutos, criarTarefa, listarTarefas, criarCampanha, listarCampanhas, adicionarItemCampanha, atualizarCampanha, DEPARTAMENTOS } from './dados.js';
import { resumo, PLATAFORMAS } from './finance.js';
import { criarDocumento, listarDocumentos, TIPOS_DOC, CLASSIFICACOES } from './documentos.js';
import { listarItens, cadastrarItem, movimentar, TIPOS_MOV } from './estoque.js';

const S = (type, description, extra = {}) => ({ type, description, ...extra });
const OBJ = (properties, required = []) => ({ type: 'OBJECT', properties, required });
const agenteDe = (ctx) => area(ctx.user.id).agentes.find((a) => a.botId === ctx.bot?.id) || null;
const quem = (ctx) => agenteDe(ctx)?.nome || ctx.bot?.name || 'agente';

registerTools({
  commerce_produtos: {
    area: 'commerce',
    description: 'Fichas de produtos do Commerce Office. "listar" mostra os produtos já cadastrados; "registrar" cria uma ficha. NUNCA invente preço, comissão, avaliação ou demanda: registre só o que você leu em uma fonte e informe a ORIGEM (link/fonte). Sem fonte, não registre.',
    parameters: OBJ({
      acao: S('STRING', 'listar ou registrar', { enum: ['listar', 'registrar'] }), nome: S('STRING', 'Nome do produto'), preco: S('NUMBER', 'Preço em reais, se a fonte informar'),
      comissao_pct: S('NUMBER', 'Comissão em %, se a fonte informar'), plataforma: S('STRING', 'Plataforma', { enum: PLATAFORMAS }), link: S('STRING', 'Link do produto (http/https)'),
      categoria: S('STRING', 'Categoria'), publico_alvo: S('STRING', 'Público-alvo sugerido'), origem: S('STRING', 'Onde você viu estas informações (URL ou fonte). Obrigatório para registrar.'),
      avaliacao_texto: S('STRING', 'Avaliação comercial em texto (opcional)'), avaliacao_fonte: S('STRING', 'Fonte da avaliação (obrigatória se houver nota)'), avaliacao_nota: S('NUMBER', 'Nota (só com fonte)'),
    }, ['acao']),
    run(ctx, a) {
      if (a.acao === 'listar') {
        const l = listarProdutos(ctx.user.id).slice(0, 30).map((p) => ({ id: p.id, nome: p.nome, plataforma: p.plataforma, preco: p.preco, comissaoPct: p.comissaoPct, status: p.status, origem: p.origem }));
        return { result: { produtos: l, total: l.length } };
      }
      if (!txt(a.origem, 300)) return { error: 'Informe a origem (link ou fonte) das informações do produto. Sem fonte não registro.' };
      try {
        const p = criarProduto(ctx.user.id, { nome: a.nome, preco: a.preco, comissaoPct: a.comissao_pct, plataforma: a.plataforma, link: a.link, categoria: a.categoria, publicoAlvo: a.publico_alvo, origem: `${quem(ctx)}: ${a.origem}`, avaliacao: a.avaliacao_texto || a.avaliacao_nota != null ? { texto: a.avaliacao_texto, nota: a.avaliacao_nota, fonte: a.avaliacao_fonte } : null });
        return { result: { id: p.id, nome: p.nome, comissaoPotencial: p.comissaoPotencial, aviso: 'comissaoPotencial é estimativa (preço × %), não é valor recebido.' }, summary: `Produto cadastrado: ${p.nome}` };
      } catch (e) { return { error: e.message }; }
    },
  },
  commerce_financeiro: {
    area: 'commerce',
    description: 'Lê o resumo financeiro comercial (somente leitura): vendas brutas, comissões estimadas/aprovadas/recebidas, reembolsos, receita líquida, por plataforma e produto. Dados reais e de teste vêm separados. Você NÃO pode lançar valores.',
    parameters: OBJ({ de: S('STRING', 'Data inicial AAAA-MM-DD (opcional)'), ate: S('STRING', 'Data final AAAA-MM-DD (opcional)') }),
    run(ctx, a) { const r = resumo(ctx.user.id, { de: a.de || null, ate: a.ate || null }); return { result: { real: { lancamentos: r.real.lancamentos, indicadores: r.real.indicadores, porPlataforma: r.real.porPlataforma.slice(0, 8), porProduto: r.real.porProduto.slice(0, 8) }, teste: { lancamentos: r.teste.lancamentos }, observacao: 'Estimadas e aprovadas NÃO são recebidas. Receita líquida não é lucro.' } }; },
  },
  commerce_tarefas: {
    area: 'commerce',
    description: 'Tarefas do escritório. "listar" mostra as tarefas; "criar" abre uma tarefa nova; "solicitar" pede uma análise a OUTRO agente (a tarefa fica pendente até um humano despachar).',
    parameters: OBJ({
      acao: S('STRING', 'listar, criar ou solicitar', { enum: ['listar', 'criar', 'solicitar'] }), nome: S('STRING', 'Nome da tarefa'), descricao: S('STRING', 'O que precisa ser feito'),
      departamento: S('STRING', 'Departamento', { enum: Object.keys(DEPARTAMENTOS) }), prioridade: S('STRING', 'Prioridade', { enum: ['baixa', 'media', 'alta', 'urgente'] }), prazo: S('STRING', 'Prazo AAAA-MM-DD'),
      para_agente: S('STRING', 'Nome do agente que deve receber (para solicitar)'),
    }, ['acao']),
    run(ctx, a) {
      const ar = area(ctx.user.id);
      if (a.acao === 'listar') return { result: { tarefas: listarTarefas(ctx.user.id).slice(0, 30).map((t) => ({ id: t.id, nome: t.nome, status: t.status, agente: ar.agentes.find((x) => x.id === t.agenteId)?.nome || null, prazo: t.prazo, atrasada: t.atrasada })) } };
      try {
        let agenteId = null;
        if (a.acao === 'solicitar') {
          const alvo = ar.agentes.find((x) => x.nome.toLowerCase() === String(a.para_agente || '').toLowerCase().trim());
          if (!alvo) return { error: `Agente "${a.para_agente}" não encontrado. Agentes: ${ar.agentes.map((x) => x.nome).join(', ')}.` };
          agenteId = alvo.id;
        }
        const t = criarTarefa(ctx.user.id, { nome: a.nome, descricao: a.descricao, departamento: a.departamento, prioridade: a.prioridade, prazo: a.prazo, agenteId });
        t.historico.push({ em: new Date().toISOString(), acao: a.acao === 'solicitar' ? 'solicitada' : 'criada_por_agente', por: quem(ctx) });
        return { result: { id: t.id, nome: t.nome, status: t.status, observacao: a.acao === 'solicitar' ? 'Fica pendente até um humano despachar.' : undefined }, summary: `Tarefa criada: ${t.nome}` };
      } catch (e) { return { error: e.message }; }
    },
  },
  commerce_campanhas: {
    area: 'commerce',
    description: 'Campanhas de marketing (rascunhos). "listar", "criar", "roteiro" (anexa um roteiro) e "etapa" (muda a etapa do fluxo). Você NÃO publica: publicar é decisão do usuário.',
    parameters: OBJ({
      acao: S('STRING', 'listar, criar, roteiro ou etapa', { enum: ['listar', 'criar', 'roteiro', 'etapa'] }), campanha: S('STRING', 'ID ou nome da campanha (para roteiro/etapa)'), nome: S('STRING', 'Nome da nova campanha'),
      objetivo: S('STRING', 'Objetivo'), produto_id: S('STRING', 'ID do produto (opcional)'), plataforma: S('STRING', 'Plataforma', { enum: PLATAFORMAS }),
      titulo: S('STRING', 'Título do roteiro'), texto: S('STRING', 'Texto do roteiro'), etapa: S('STRING', 'Etapa', { enum: ['pesquisa', 'publico', 'ideias', 'planejamento', 'roteiro', 'criativo', 'edicao', 'aprovacao', 'publicacao', 'analise'] }),
    }, ['acao']),
    run(ctx, a) {
      const uid = ctx.user.id;
      if (a.acao === 'listar') return { result: { campanhas: listarCampanhas(uid).slice(0, 20).map((c) => ({ id: c.id, nome: c.nome, etapa: c.etapa, status: c.status, roteiros: c.roteiros.length })) } };
      try {
        if (a.acao === 'criar') { const c = criarCampanha(uid, { nome: a.nome, objetivo: a.objetivo, produtoId: a.produto_id, plataforma: a.plataforma, responsavelId: agenteDe(ctx)?.id }); return { result: { id: c.id, nome: c.nome, status: c.status }, summary: `Campanha criada: ${c.nome}` }; }
        const c = listarCampanhas(uid).find((x) => x.id === a.campanha || x.nome.toLowerCase() === String(a.campanha || '').toLowerCase());
        if (!c) return { error: `Campanha "${a.campanha}" não encontrada.` };
        if (a.acao === 'roteiro') { adicionarItemCampanha(uid, c.id, 'roteiros', { titulo: a.titulo, texto: a.texto, autor: quem(ctx) }); return { result: { ok: true }, summary: `Roteiro adicionado à campanha ${c.nome}` }; }
        if (a.acao === 'etapa') { atualizarCampanha(uid, c.id, { etapa: a.etapa }); return { result: { ok: true, etapa: a.etapa } }; }
      } catch (e) { return { error: e.message }; }
      return { error: 'Ação desconhecida.' };
    },
  },
});

const tarefaDe = (ctx) => { const ag = agenteDe(ctx); return ag?.tarefaAtual ? area(ctx.user.id).tarefas.find((t) => t.id === ag.tarefaAtual) || null : null; };
registerTools({
  commerce_documentos: {
    area: 'commerce',
    description: 'Registra e lista DOCUMENTOS reais do escritório: roteiro, proposta estruturada, relatório, análise ou pesquisa. Sempre classifique a informação: "real" (veio de dados do Hub ou de fonte citada — exige fontes), "estimada" (cálculo/projeção), "sugestao_ia" (ideia/opinião sem comprovação). Nunca invente números.',
    parameters: OBJ({
      acao: S('STRING', 'listar ou criar', { enum: ['listar', 'criar'] }), tipo: S('STRING', 'Tipo do documento', { enum: TIPOS_DOC }), titulo: S('STRING', 'Título'), texto: S('STRING', 'Conteúdo completo em texto'),
      classificacao: S('STRING', 'Natureza da informação', { enum: CLASSIFICACOES.filter((c) => c !== 'simulada') }), fontes: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Fontes (links ou nomes dos dados do Hub) — obrigatório para "real"' },
      objetivo: S('STRING', 'Proposta: objetivo'), publico: S('STRING', 'Proposta: público'), orcamento: S('STRING', 'Proposta: orçamento (estimado)'), riscos: S('STRING', 'Proposta: riscos'), proximos_passos: S('STRING', 'Proposta: próximos passos'),
      produto_id: S('STRING', 'ID do produto relacionado (opcional)'), campanha_id: S('STRING', 'ID da campanha relacionada (opcional)'),
    }, ['acao']),
    run(ctx, a) {
      if (a.acao === 'listar') return { result: { documentos: listarDocumentos(ctx.user.id).slice(0, 20).map((d) => ({ id: d.id, tipo: d.tipo, titulo: d.titulo, classificacao: d.classificacao, autor: d.autor })) } };
      try {
        const t = tarefaDe(ctx);
        const d = criarDocumento(ctx.user.id, { tipo: a.tipo, titulo: a.titulo, texto: a.texto, classificacao: a.classificacao, fontes: a.fontes, autorAgenteId: agenteDe(ctx)?.id, autor: quem(ctx), tarefaId: t?.id, ordemId: t?.ordemId, produtoId: a.produto_id, campanhaId: a.campanha_id,
          estrutura: { objetivo: a.objetivo, publico: a.publico, orcamento: a.orcamento, riscos: a.riscos, proximosPassos: a.proximos_passos } });
        return { result: { id: d.id, titulo: d.titulo, classificacao: d.classificacao }, summary: `Documento registrado: ${d.titulo}` };
      } catch (e) { return { error: e.message }; }
    },
  },
  commerce_estoque: {
    area: 'commerce',
    description: 'Controle de estoque da Sala de Estoque e Logística. "listar" mostra itens e saldos; "cadastrar" cria um item; "movimentar" registra entrada, saída, ajuste (informe o saldo correto e o motivo) ou divergência (quantidade CONTADA e a descrição). Registre só o que realmente aconteceu ou foi informado; nunca invente saldos.',
    parameters: OBJ({
      acao: S('STRING', 'listar, cadastrar ou movimentar', { enum: ['listar', 'cadastrar', 'movimentar'] }), item: S('STRING', 'ID, SKU ou nome do item'), nome: S('STRING', 'Nome do item novo'), sku: S('STRING', 'SKU (opcional)'),
      quantidade: S('NUMBER', 'Quantidade (saldo inicial no cadastro; quantidade do movimento)'), minimo: S('NUMBER', 'Estoque mínimo (cadastro)'), local: S('STRING', 'Local/prateleira (cadastro)'),
      tipo: S('STRING', 'Tipo do movimento', { enum: TIPOS_MOV }), motivo: S('STRING', 'Motivo / descrição da divergência / pedido ou nota'),
    }, ['acao']),
    run(ctx, a) {
      const uid = ctx.user.id;
      if (a.acao === 'listar') return { result: { itens: listarItens(uid).slice(0, 60).map((i) => ({ id: i.id, sku: i.sku, nome: i.nome, quantidade: i.quantidade, minimo: i.minimo, local: i.local, abaixoDoMinimo: i.abaixoDoMinimo })) } };
      try {
        if (a.acao === 'cadastrar') { const it = cadastrarItem(uid, { nome: a.nome, sku: a.sku, quantidade: a.quantidade, minimo: a.minimo, local: a.local }, quem(ctx)); return { result: { id: it.id, sku: it.sku, nome: it.nome, quantidade: it.quantidade }, summary: `Item cadastrado: ${it.nome}` }; }
        const m = movimentar(uid, { item: a.item, tipo: a.tipo, quantidade: a.quantidade, motivo: a.motivo }, quem(ctx));
        return { result: { movimento: m.id, tipo: m.tipo, saldoApos: m.saldoApos }, summary: `Estoque: ${m.tipo} de ${m.quantidade} em ${m.itemNome} (saldo ${m.saldoApos})` };
      } catch (e) { return { error: e.message }; }
    },
  },
});
export { hoje };
