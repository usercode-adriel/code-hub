// AGENTES DO COMMERCE OFFICE. Cada funcionário é um agente de IA REAL: um bot do sistema de chat que já existe (db().bots, com
// ferramentas e permissões do agent.js), mais um registro do escritório (departamento, estado, tarefa atual, histórico, indicadores).
// O estado mostrado no escritório vem dos eventos reais da execução — nunca é simulado.
import { db } from '../db.js';
import { area, auditar, erro, txt, oneOf, id, now, save } from './store.js';
import { criarTarefa, acharTarefa, mudarStatusTarefa, DEPARTAMENTOS } from './dados.js';

export const ESTADOS = ['disponivel', 'aguardando', 'planejando', 'executando', 'analisando', 'aguardando_aprovacao', 'concluido', 'com_erro', 'pausado'];
const OCUPADOS = ['planejando', 'executando', 'analisando', 'aguardando_aprovacao'];
const TIMEOUT_MS = 10 * 60 * 1000;

const REGRAS = 'Regras: nunca invente dados comerciais (preço, comissão, demanda, vendas): use as ferramentas, cite a fonte e, se não houver dado, diga que não há. Você não lança dinheiro nem publica nada; ações financeiras, publicações e ações externas dependem de aprovação humana. Responda em português, direto e profissional.';
export const PADRAO = [
  { chave: 'helena', nome: 'Helena', cargo: 'Diretora de Operações', departamento: 'diretoria', personalidade: 'profissional', cor: '#7c3aed', ferramentas: ['tarefas', 'memoria', 'commerce'],
    instrucoes: `Você é a Diretora de Operações do Codeniac Commerce Office. Coordena os departamentos, distribui tarefas, acompanha resultados, pede relatórios, identifica gargalos e organiza prioridades. ${REGRAS}` },
  { chave: 'arthur', nome: 'Arthur', cargo: 'Analista de Mercado', departamento: 'pesquisa', personalidade: 'nerd', cor: '#0ea5e9', ferramentas: ['memoria', 'commerce'],
    instrucoes: `Você é o Analista de Mercado. Pesquisa produtos, avalia oportunidades, identifica tendências, analisa concorrência e potencial comercial, e produz relatórios. Use a pesquisa na web e registre produtos com fonte. ${REGRAS}` },
  { chave: 'sofia', nome: 'Sofia', cargo: 'Gestora Comercial e Financeira', departamento: 'produtos', personalidade: 'profissional', cor: '#16a34a', ferramentas: ['memoria', 'commerce'],
    instrucoes: `Você é a Gestora Comercial e Financeira. Acompanha vendas, analisa comissões, organiza produtos, acompanha pedidos, controla receitas e produz relatórios financeiros. Nunca misture faturamento, comissão e lucro; estimada não é recebida. ${REGRAS}` },
  { chave: 'isabela', nome: 'Isabela', cargo: 'Estrategista de Marketing', departamento: 'marketing', personalidade: 'divertido', cor: '#ec4899', ferramentas: ['memoria', 'commerce'],
    instrucoes: `Você é a Estrategista de Marketing. Cria ideias de campanhas, identifica públicos, planeja conteúdos, desenvolve estratégias e analisa resultados. ${REGRAS}` },
  { chave: 'marina', nome: 'Marina', cargo: 'Diretora Criativa', departamento: 'audiovisual', personalidade: 'mentor', cor: '#f59e0b', ferramentas: ['memoria', 'commerce'],
    instrucoes: `Você é a Diretora Criativa da Produção Audiovisual. Cria conceitos visuais, elabora roteiros, desenvolve criativos e organiza a produção. As ferramentas de edição de vídeo do Estúdio ainda não existem: diga isso com clareza em vez de fingir que editou. ${REGRAS}` },
];

const PERSONALIDADES = ['amigavel', 'profissional', 'divertido', 'mentor', 'zen', 'nerd'];

function criarBot(userId, def) {
  const bot = {
    id: id(), userId, name: txt(def.nome, 40), personality: oneOf(def.personalidade, PERSONALIDADES, 'profissional'), traits: txt(def.instrucoes, 2000), greeting: '', color: def.cor || '#6c4cf5',
    focus: 'geral', proactive: false, times: '09:00', permissions: [...new Set(def.ferramentas || ['commerce'])], ai: def.modelo || '', avatar: '', commerceAgent: true, createdAt: now(),
  };
  db().bots.push(bot);
  return bot;
}

export function criarAgente(userId, def) {
  const a = area(userId);
  const nome = txt(def.nome, 40); if (!nome) throw erro('Dê um nome ao agente.');
  if (a.agentes.some((x) => x.nome.toLowerCase() === nome.toLowerCase())) throw erro('Já existe um agente com esse nome.', 409);
  const dep = oneOf(def.departamento, Object.keys(DEPARTAMENTOS), 'diretoria');
  const bot = criarBot(userId, { ...def, nome, departamento: dep, ferramentas: [...new Set([...(def.ferramentas || []), 'commerce'])] });
  const ag = {
    id: id(), chave: def.chave || null, nome, cargo: txt(def.cargo, 80) || 'Funcionário', departamento: dep, personalidade: bot.personality, instrucoes: bot.traits, modelo: txt(def.modelo, 60) || 'padrao',
    ferramentas: bot.permissions, memoria: [], botId: bot.id, conversaId: null, avatarId: null, estado: 'disponivel', tarefaAtual: null, historico: [], indicadores: { concluidas: 0, aprovadas: 0, erros: 0, tempoTotalMs: 0 }, criadoEm: now(),
  };
  a.agentes.push(ag); save(); auditar(userId, 'agente.criar', { agente: ag.id });
  return ag;
}

/** Cria os cinco agentes iniciais na primeira vez. Nomes e cargos são editáveis depois. */
export function garantirAgentes(userId) {
  const a = area(userId);
  if (!a.agentes.length) for (const d of PADRAO) criarAgente(userId, d);
  // depois de um reinício do servidor, nenhuma execução continua: estados "ocupados" viram erro com aviso (não fingimos que segue rodando)
  if (!a._boot) {
    Object.defineProperty(a, '_boot', { value: true, enumerable: false });
    for (const ag of a.agentes) if (OCUPADOS.includes(ag.estado)) { definirEstado(ag, 'com_erro', 'o servidor reiniciou durante a execução'); const t = ag.tarefaAtual && a.tarefas.find((x) => x.id === ag.tarefaAtual); if (t && t.status === 'em_execucao') { t.status = 'erro'; t.historico.push({ em: now(), acao: 'status', de: 'em_execucao', para: 'erro', motivo: 'o servidor reiniciou durante a execução' }); } ag.tarefaAtual = null; }
    save();
  }
  return a.agentes;
}

export function acharAgente(userId, aid) {
  const ag = area(userId).agentes.find((x) => x.id === aid);
  if (!ag) throw erro('Agente não encontrado.', 404);
  return ag;
}
const botDe = (ag) => db().bots.find((b) => b.id === ag.botId) || null;

function definirEstado(ag, estado, nota = '') {
  if (ag.estado === estado) return;
  ag.historico.push({ em: now(), evento: 'estado', de: ag.estado, para: estado, ...(nota ? { nota: txt(nota, 200) } : {}) });
  if (ag.historico.length > 300) ag.historico.splice(0, ag.historico.length - 300);
  ag.estado = estado; ag.estadoDesde = now();
}

export function atualizarAgente(userId, aid, p) {
  const ag = acharAgente(userId, aid); const bot = botDe(ag);
  if ('nome' in p) { const n = txt(p.nome, 40); if (n && area(userId).agentes.some((x) => x.id !== aid && x.nome.toLowerCase() === n.toLowerCase())) throw erro('Já existe um agente com esse nome.', 409); if (n) { ag.nome = n; if (bot) bot.name = n; } }
  if ('cargo' in p) ag.cargo = txt(p.cargo, 80) || ag.cargo;
  if ('departamento' in p) ag.departamento = oneOf(p.departamento, Object.keys(DEPARTAMENTOS), ag.departamento);
  if ('instrucoes' in p) { ag.instrucoes = txt(p.instrucoes, 2000); if (bot) bot.traits = ag.instrucoes; }
  if ('personalidade' in p) { ag.personalidade = oneOf(p.personalidade, PERSONALIDADES, ag.personalidade); if (bot) bot.personality = ag.personalidade; }
  if ('modelo' in p) { ag.modelo = txt(p.modelo, 60) || 'padrao'; if (bot) bot.ai = ag.modelo === 'padrao' ? '' : ag.modelo; }
  if ('avatarId' in p) ag.avatarId = txt(p.avatarId, 60) || null;
  if ('ferramentas' in p && Array.isArray(p.ferramentas)) { ag.ferramentas = [...new Set([...p.ferramentas.map(String), 'commerce'])]; if (bot) bot.permissions = ag.ferramentas; }
  if ('memoria' in p && Array.isArray(p.memoria)) ag.memoria = p.memoria.slice(0, 50).map((m) => txt(m, 300)).filter(Boolean);
  save(); auditar(userId, 'agente.editar', { agente: aid });
  return ag;
}

export function pausar(userId, aid, pausado) {
  const ag = acharAgente(userId, aid);
  if (pausado) { if (OCUPADOS.includes(ag.estado)) throw erro('O agente está executando uma tarefa. Espere terminar para pausar.', 409); definirEstado(ag, 'pausado'); }
  else if (ag.estado === 'pausado') definirEstado(ag, 'disponivel');
  save(); return ag;
}

export function removerAgente(userId, aid) {
  const a = area(userId); const ag = acharAgente(userId, aid);
  if (OCUPADOS.includes(ag.estado)) throw erro('O agente está ocupado.', 409);
  if (a.tarefas.some((t) => t.agenteId === aid && ['pendente', 'em_execucao', 'aguardando_aprovacao'].includes(t.status))) throw erro('Há tarefas abertas com este agente: reatribua antes de remover.', 409);
  a.agentes.splice(a.agentes.indexOf(ag), 1);
  db().bots = db().bots.filter((b) => b.id !== ag.botId);
  save(); auditar(userId, 'agente.remover', { agente: aid });
}

// ---------- orquestração ----------
/** Sugere o agente ideal para um departamento: o disponível, ou o que tem menos tarefas abertas. Evita sobrecarregar. */
export function sugerirAgente(userId, departamento) {
  const a = area(userId);
  const candidatos = a.agentes.filter((x) => x.departamento === departamento && x.estado !== 'pausado');
  const abertas = (x) => a.tarefas.filter((t) => t.agenteId === x.id && ['pendente', 'em_execucao', 'aguardando_aprovacao'].includes(t.status)).length;
  return candidatos.sort((x, y) => abertas(x) - abertas(y))[0] || null;
}

/** Evita trabalho duplicado: mesma tarefa (nome) já aberta para o mesmo agente. */
export function criarTarefaOrquestrada(userId, b) {
  const a = area(userId); const nome = txt(b.nome, 160).toLowerCase();
  const agenteId = b.agenteId || sugerirAgente(userId, b.departamento || 'diretoria')?.id || null;
  const dup = a.tarefas.find((t) => t.agenteId === agenteId && agenteId && t.nome.toLowerCase() === nome && ['pendente', 'em_execucao', 'aguardando_aprovacao'].includes(t.status));
  if (dup) throw erro('Esta tarefa já está aberta para este agente. Evitamos execuções duplicadas.', 409);
  return criarTarefa(userId, { ...b, agenteId });
}

/** Encaminha uma tarefa para outro agente (registrado no histórico). */
export function encaminhar(userId, tid, paraAgenteId, de = null) {
  const a = area(userId); const t = acharTarefa(userId, tid); const para = acharAgente(userId, paraAgenteId);
  if (t.status === 'em_execucao') throw erro('A tarefa está em execução e não pode ser encaminhada agora.', 409);
  const antes = t.agenteId; t.agenteId = para.id; t.status = t.status === 'erro' ? 'pendente' : t.status;
  t.historico.push({ em: now(), acao: 'encaminhada', de: antes, para: para.id, por: de });
  save(); return t;
}

function montarPrompt(userId, ag, t) {
  const a = area(userId);
  const prod = t.produtoId && a.produtos.find((p) => p.id === t.produtoId); const camp = t.campanhaId && a.campanhas.find((c) => c.id === t.campanhaId);
  return `[Tarefa do Commerce Office — ${DEPARTAMENTOS[t.departamento] || t.departamento}]
Você é ${ag.nome}, ${ag.cargo}. Execute esta tarefa agora, usando as ferramentas quando precisar.
Tarefa: ${t.nome}
${t.descricao ? `Detalhes: ${t.descricao}\n` : ''}Prioridade: ${t.prioridade}${t.prazo ? ` · Prazo: ${t.prazo}` : ''}
${prod ? `Produto relacionado: ${prod.nome} (id ${prod.id})\n` : ''}${camp ? `Campanha relacionada: ${camp.nome} (id ${camp.id})\n` : ''}${ag.memoria.length ? `Memória de trabalho:\n- ${ag.memoria.join('\n- ')}\n` : ''}
Ao terminar, responda com o RESULTADO completo (resumo do que foi feito, achados e próximos passos). Cite as fontes. Se não conseguir ou faltar dado, diga exatamente o quê.`;
}

const LEITURA = /^(consultar|pesquisar_web|commerce_financeiro|ler_)/;
const executorPadrao = async (user, ag, prompt, write) => {
  const { chat, createConversation, getConversation, assistantMode } = await import('../assistant.js');
  if (assistantMode() === 'local') throw erro('Nenhuma IA está configurada. Em Configurações → Assistente conecte uma IA para os agentes executarem tarefas.', 409);
  let conv = ag.conversaId && getConversation(user.id, ag.conversaId);
  if (!conv) { conv = createConversation(user.id, `Escritório — ${ag.nome}`, botDe(ag)); ag.conversaId = conv.id; save(); }
  await chat(user, prompt, conv.id, write, {});
  return conv.id;
};

const jobs = new Map();
export const emExecucao = (tid) => jobs.has(tid);

/**
 * Despacha uma tarefa ao agente. Roda em segundo plano; o estado do agente acompanha os eventos reais da IA:
 * planejando (antes do primeiro sinal) → executando/analisando (ferramentas e texto) → aguardando aprovação (confirmação pedida)
 * → ao final, a tarefa fica "aguardando aprovação" do resultado (humano) ou "erro". `executor` existe para testes.
 */
export async function despachar(user, tid, { executor = executorPadrao, esperar = false } = {}) {
  const userId = user.id; const a = area(userId);
  const t = acharTarefa(userId, tid);
  if (!t.agenteId) throw erro('Esta tarefa não tem agente responsável.', 409);
  const ag = acharAgente(userId, t.agenteId);
  if (ag.estado === 'pausado') throw erro(`${ag.nome} está pausado.`, 409);
  if (jobs.has(t.id) || t.status === 'em_execucao') throw erro('Esta tarefa já está em execução.', 409);
  if (OCUPADOS.includes(ag.estado) && ag.estado !== 'aguardando_aprovacao') throw erro(`${ag.nome} está ocupado com outra tarefa (${ag.estado}).`, 409);
  if (['concluida', 'cancelada'].includes(t.status)) throw erro('Esta tarefa já foi encerrada.', 409);
  if (executor === executorPadrao) { const { assistantMode } = await import('../assistant.js'); if (assistantMode() === 'local') throw erro('Nenhuma IA está configurada. Em Configurações → Assistente conecte uma IA para os agentes executarem tarefas.', 409); }

  mudarStatusTarefa(userId, t.id, 'em_execucao', { motivo: `despachada para ${ag.nome}` });
  ag.tarefaAtual = t.id; definirEstado(ag, 'planejando'); save();
  const inicio = Date.now();
  let texto = ''; let falha = null; let aguardando = false;
  const write = (ev) => {
    if (!ev) return;
    if (ev.type === 'text') { texto += ev.text || ''; if (ag.estado === 'planejando') definirEstado(ag, 'executando'); }
    else if (ev.type === 'tool') definirEstado(ag, LEITURA.test(ev.name) ? 'analisando' : 'executando', ev.name);
    else if (ev.type === 'confirm') { aguardando = true; definirEstado(ag, 'aguardando_aprovacao', 'ação sensível pediu confirmação'); }
    else if (ev.type === 'error') falha = ev.text || 'erro da IA';
  };
  const rodar = (async () => {
    try {
      const comTempo = Promise.race([executor(user, ag, montarPrompt(userId, ag, t), write), new Promise((_, rej) => setTimeout(() => rej(new Error('Tempo esgotado: a IA não terminou em 10 minutos.')), TIMEOUT_MS).unref())]);
      await comTempo;
      if (falha) throw new Error(falha);
      if (!texto.trim()) throw new Error('A IA não devolveu nenhum resultado.');
      const dur = Date.now() - inicio;
      mudarStatusTarefa(userId, t.id, 'aguardando_aprovacao', { resultado: texto, motivo: aguardando ? 'há ação aguardando confirmação no chat' : 'resultado pronto para revisão' });
      ag.indicadores.concluidas += 1; ag.indicadores.tempoTotalMs += dur; definirEstado(ag, 'concluido');
    } catch (e) {
      mudarStatusTarefa(userId, t.id, 'erro', { resultado: texto || null, motivo: e.message });
      ag.indicadores.erros += 1; definirEstado(ag, 'com_erro', e.message);
    } finally { ag.tarefaAtual = null; jobs.delete(t.id); save(); }
  })();
  jobs.set(t.id, rodar);
  if (esperar) await rodar;
  return acharTarefa(userId, t.id);
}

/** O humano aprova ou recusa o resultado de uma tarefa. */
export function revisar(userId, tid, { aprovar, motivo = '' }) {
  const t = acharTarefa(userId, tid);
  if (t.status !== 'aguardando_aprovacao') throw erro('Esta tarefa não está aguardando aprovação.', 409);
  const ag = t.agenteId ? area(userId).agentes.find((x) => x.id === t.agenteId) : null;
  if (aprovar) { mudarStatusTarefa(userId, tid, 'concluida', { motivo: 'resultado aprovado' }); if (ag) { ag.indicadores.aprovadas += 1; if (ag.estado === 'concluido') definirEstado(ag, 'disponivel'); } }
  else { mudarStatusTarefa(userId, tid, 'pendente', { motivo: `resultado recusado: ${txt(motivo, 200) || 'sem motivo'}` }); if (ag && ag.estado === 'concluido') definirEstado(ag, 'disponivel'); }
  save(); return acharTarefa(userId, tid);
}

/** Libera um agente em "concluído" ou "com erro" depois que o humano viu. */
export function reconhecer(userId, aid) {
  const ag = acharAgente(userId, aid);
  if (['concluido', 'com_erro'].includes(ag.estado)) { definirEstado(ag, 'disponivel'); save(); }
  return ag;
}

export function resumoAgente(userId, ag) {
  const a = area(userId);
  const tarefas = a.tarefas.filter((t) => t.agenteId === ag.id);
  const n = ag.indicadores.concluidas;
  return { ...ag, tarefasAbertas: tarefas.filter((t) => ['pendente', 'em_execucao', 'aguardando_aprovacao', 'erro'].includes(t.status)).length, tempoMedioMs: n ? Math.round(ag.indicadores.tempoTotalMs / n) : null };
}

// ---------- reuniões ----------
export function criarReuniao(userId, b) {
  const a = area(userId); const pauta = txt(b.pauta, 300); if (!pauta) throw erro('Informe a pauta da reunião.');
  const ids = [...new Set((Array.isArray(b.participantes) ? b.participantes : []).map(String))];
  for (const p of ids) acharAgente(userId, p);
  const r = { id: id(), pauta, participantes: ids, status: 'aberta', criadaEm: now(), pareceres: [], decisoes: [], relatorio: '' };
  a.reunioes.push(r); save(); auditar(userId, 'reuniao.criar', { reuniao: r.id });
  return r;
}
/** Pede o parecer real de cada participante (uma tarefa por agente, executada pela IA). */
export async function pedirPareceres(user, rid, opcoes = {}) {
  const a = area(user.id); const r = a.reunioes.find((x) => x.id === rid); if (!r) throw erro('Reunião não encontrada.', 404);
  const ocupados = r.participantes.map((p) => acharAgente(user.id, p)).filter((ag) => OCUPADOS.includes(ag.estado) && ag.estado !== 'aguardando_aprovacao');
  if (ocupados.length) throw erro(`Agentes ocupados: ${ocupados.map((x) => x.nome).join(', ')}.`, 409);
  const feitas = [];
  for (const p of r.participantes) {
    const t = criarTarefa(user.id, { nome: `Parecer para a reunião: ${r.pauta}`.slice(0, 160), descricao: `Dê o seu parecer, do ponto de vista do seu departamento, sobre a pauta: ${r.pauta}. Seja objetivo e baseie-se apenas em dados reais disponíveis nas ferramentas.`, agenteId: p, departamento: acharAgente(user.id, p).departamento });
    await despachar(user, t.id, { ...opcoes, esperar: true });
    const f = acharTarefa(user.id, t.id);
    r.pareceres.push({ agenteId: p, tarefaId: t.id, status: f.status, texto: f.resultado || '', em: now() });
    feitas.push(f);
  }
  r.relatorio = r.pareceres.map((x) => `### ${acharAgente(user.id, x.agenteId).nome}\n${x.texto || `(sem parecer: ${x.status})`}`).join('\n\n');
  save(); return r;
}
export function registrarDecisao(userId, rid, { texto, aprovadaPeloUsuario = false }) {
  const r = area(userId).reunioes.find((x) => x.id === rid); if (!r) throw erro('Reunião não encontrada.', 404);
  if (!txt(texto, 500)) throw erro('Descreva a decisão.');
  r.decisoes.push({ id: id(), texto: txt(texto, 500), aprovadaPeloUsuario: aprovadaPeloUsuario === true, em: now() }); save();
  return r;
}
export function encerrarReuniao(userId, rid) {
  const r = area(userId).reunioes.find((x) => x.id === rid); if (!r) throw erro('Reunião não encontrada.', 404);
  r.status = 'encerrada'; save(); return r;
}
