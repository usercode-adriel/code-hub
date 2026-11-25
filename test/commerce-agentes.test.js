// Commerce Office — agentes reais: bots do chat existente, ferramentas na área "commerce", estados vindos de eventos reais,
// despacho de tarefas, aprovação humana, orquestração (sem duplicidade) e reuniões.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

let G; let S; let D; let Ag; let DB;
const user = (id) => ({ id, name: id, role: 'user' });
before(async () => {
  fs.mkdirSync(path.resolve('.tmp-testes'), { recursive: true });
  process.env.DATA_DIR = fs.mkdtempSync(path.join(path.resolve('.tmp-testes'), 'agt-'));
  process.env.AI_PROVIDER = 'local'; process.env.GEMINI_API_KEY = ''; process.env.ANTHROPIC_API_KEY = '';
  DB = await import('../server/db.js'); DB.load();
  S = await import('../server/commerce/store.js'); D = await import('../server/commerce/dados.js'); Ag = await import('../server/commerce/agentes.js');
  await import('../server/commerce/ferramentas.js');
  G = await import('../server/agent.js');
});

// executor falso: devolve eventos como a IA real faria (não chama nenhuma IA)
const executor = (eventos, retorno = 'conv-1') => async (_u, _ag, _prompt, write) => { for (const e of eventos) { write(e); await new Promise((r) => setImmediate(r)); } return retorno; };

test('os cinco agentes iniciais são bots reais do sistema, com nomes e cargos editáveis', () => {
  const ags = Ag.garantirAgentes('e1');
  assert.deepEqual(ags.map((a) => a.nome), ['Helena', 'Arthur', 'Sofia', 'Isabela', 'Marina']);
  assert.deepEqual(ags.map((a) => a.departamento), ['diretoria', 'pesquisa', 'produtos', 'marketing', 'audiovisual']);
  const bots = DB.db().bots.filter((b) => b.userId === 'e1');
  assert.equal(bots.length, 5); assert.ok(bots.every((b) => b.commerceAgent && b.permissions.includes('commerce')));
  assert.equal(Ag.garantirAgentes('e1').length, 5, 'não duplica ao chamar de novo');
  Ag.atualizarAgente('e1', ags[1].id, { nome: 'Artur', cargo: 'Pesquisador Sênior' });
  const bot = DB.db().bots.find((b) => b.id === ags[1].botId);
  assert.equal(bot.name, 'Artur'); assert.equal(S.area('e1').agentes[1].cargo, 'Pesquisador Sênior');
  assert.throws(() => Ag.atualizarAgente('e1', ags[2].id, { nome: 'artur' }), /Já existe/);
});

test('ferramentas commerce existem só para os agentes do escritório (permissão por área)', () => {
  Ag.garantirAgentes('e2');
  const bot = DB.db().bots.find((b) => b.userId === 'e2');
  const nomes = (b) => G.toolDeclarations(b, user('e2')).map((t) => t.name);
  assert.ok(nomes(bot).includes('commerce_produtos') && nomes(bot).includes('commerce_financeiro') && nomes(bot).includes('commerce_tarefas') && nomes(bot).includes('commerce_campanhas'));
  assert.ok(!nomes(null).some((n) => n.startsWith('commerce_')), 'o assistente comum não recebe as ferramentas do escritório');
  assert.ok(!nomes({ id: 'outro', permissions: ['tarefas'] }).some((n) => n.startsWith('commerce_')), 'um personagem sem a permissão também não');
  assert.ok(!nomes(bot).includes('commerce_lancar'), 'agentes não lançam dinheiro');
});

test('ferramentas: registram produto só com origem; financeiro é só leitura; solicitar a outro agente deixa pendente', async () => {
  const ags = Ag.garantirAgentes('e3'); const bot = DB.db().bots.find((b) => b.id === ags[1].botId);
  const ctx = { user: user('e3'), bot, conv: null, write: () => {}, actions: [], sources: [] };
  assert.match((await G.callTool(ctx, 'commerce_produtos', { acao: 'registrar', nome: 'Fone' })).error, /origem/);
  const ok = await G.callTool(ctx, 'commerce_produtos', { acao: 'registrar', nome: 'Fone X', preco: 100, comissao_pct: 10, origem: 'https://loja.exemplo/fone', plataforma: 'tiktokshop' });
  assert.equal(ok.result.comissaoPotencial, 10); assert.match(S.area('e3').produtos[0].origem, /Arthur: https/);
  assert.match((await G.callTool(ctx, 'commerce_produtos', { acao: 'registrar', nome: 'Y', origem: 'x', avaliacao_nota: 5 })).error, /fonte/);
  const fin = await G.callTool(ctx, 'commerce_financeiro', {}); assert.ok(fin.result.real.indicadores); assert.ok(fin.result.observacao.includes('NÃO'));
  const sol = await G.callTool(ctx, 'commerce_tarefas', { acao: 'solicitar', nome: 'Analisar comissões', para_agente: 'Sofia', departamento: 'produtos' });
  assert.equal(sol.result.status, 'pendente');
  const t = S.area('e3').tarefas[0]; assert.equal(t.agenteId, ags[2].id); assert.ok(t.historico.some((h) => h.acao === 'solicitada' && h.por === 'Arthur'));
  assert.match((await G.callTool(ctx, 'commerce_tarefas', { acao: 'solicitar', nome: 'x', para_agente: 'Fantasma' })).error, /não encontrado/);
  const semPermissao = { ...ctx, bot: { id: 'z', permissions: ['tarefas'] } };
  assert.match((await G.callTool(semPermissao, 'commerce_produtos', { acao: 'listar' })).error, /Sem permissão/);
});

test('despacho: o estado do agente segue os eventos reais e o resultado fica registrado aguardando aprovação humana', async () => {
  const ags = Ag.garantirAgentes('e4'); const arthur = ags[1];
  const t = D.criarTarefa('e4', { nome: 'Pesquisar fones', descricao: 'ver os 3 melhores', agenteId: arthur.id, departamento: 'pesquisa' });
  const prompts = [];
  const ex = async (u, ag, prompt, write) => { prompts.push(prompt); for (const e of [{ type: 'typing' }, { type: 'tool', name: 'pesquisar_web' }, { type: 'tool', name: 'commerce_produtos' }, { type: 'text', text: 'Achei 3 fones. ' }, { type: 'text', text: 'Fonte: loja.exemplo' }]) { write(e); await new Promise((r) => setImmediate(r)); } return 'c1'; };
  const r = await Ag.despachar(user('e4'), t.id, { executor: ex, esperar: true });
  assert.equal(r.status, 'aguardando_aprovacao'); assert.equal(r.resultado, 'Achei 3 fones. Fonte: loja.exemplo');
  assert.match(prompts[0], /Pesquisar fones/); assert.match(prompts[0], /Arthur/);
  const estados = S.area('e4').agentes[1].historico.filter((h) => h.evento === 'estado').map((h) => h.para);
  assert.deepEqual(estados, ['planejando', 'analisando', 'executando', 'concluido'], 'planejando → pesquisa (analisando) → ferramenta (executando) → concluído');
  assert.equal(S.area('e4').agentes[1].tarefaAtual, null);
  const aprovada = Ag.revisar('e4', t.id, { aprovar: true });
  assert.equal(aprovada.status, 'concluida'); assert.ok(aprovada.concluidaEm);
  const ag = S.area('e4').agentes[1]; assert.equal(ag.estado, 'disponivel'); assert.equal(ag.indicadores.concluidas, 1); assert.equal(ag.indicadores.aprovadas, 1);
  assert.equal(Ag.resumoAgente('e4', ag).tarefasAbertas, 0);
  assert.throws(() => Ag.revisar('e4', t.id, { aprovar: true }), /não está aguardando/);
});

test('despacho: erro real aparece como erro (não finge sucesso); recusar o resultado devolve a tarefa; reconhecer libera o agente', async () => {
  const ags = Ag.garantirAgentes('e5'); const sofia = ags[2];
  const t1 = D.criarTarefa('e5', { nome: 'Relatório', agenteId: sofia.id });
  await Ag.despachar(user('e5'), t1.id, { executor: async () => { throw new Error('IA fora do ar'); }, esperar: true });
  assert.equal(D.acharTarefa('e5', t1.id).status, 'erro'); assert.ok(D.acharTarefa('e5', t1.id).historico.at(-1).motivo.includes('IA fora do ar'));
  assert.equal(S.area('e5').agentes[2].estado, 'com_erro'); assert.equal(S.area('e5').agentes[2].indicadores.erros, 1);
  const vazio = D.criarTarefa('e5', { nome: 'Sem resposta', agenteId: sofia.id });
  await Ag.despachar(user('e5'), vazio.id, { executor: executor([{ type: 'typing' }]), esperar: true });
  assert.equal(D.acharTarefa('e5', vazio.id).status, 'erro', 'sem resultado = erro');
  const t2 = D.criarTarefa('e5', { nome: 'Outra', agenteId: sofia.id });
  await Ag.despachar(user('e5'), t2.id, { executor: executor([{ type: 'text', text: 'feito' }]), esperar: true });
  const rec = Ag.revisar('e5', t2.id, { aprovar: false, motivo: 'faltou fonte' });
  assert.equal(rec.status, 'pendente'); assert.ok(rec.historico.at(-1).motivo.includes('faltou fonte'));
  assert.equal(S.area('e5').agentes[2].estado, 'disponivel');
  const ev = D.criarTarefa('e5', { nome: 'Ev', agenteId: sofia.id });
  await Ag.despachar(user('e5'), ev.id, { executor: executor([{ type: 'error', text: 'quota' }]), esperar: true });
  assert.equal(S.area('e5').agentes[2].estado, 'com_erro'); assert.equal(Ag.reconhecer('e5', sofia.id).estado, 'disponivel');
});

test('orquestração: sem duplicidade, sem despachar duas vezes, sem agente pausado, sem agente ocupado e sem IA configurada', async () => {
  const ags = Ag.garantirAgentes('e6'); const [helena, arthur] = ags;
  D.criarTarefa('e6', { nome: 'Mapear nichos', agenteId: arthur.id });
  assert.throws(() => Ag.criarTarefaOrquestrada('e6', { nome: 'mapear NICHOS', agenteId: arthur.id }), /duplicadas/);
  assert.equal(Ag.criarTarefaOrquestrada('e6', { nome: 'Mapear nichos', agenteId: helena.id }).agenteId, helena.id, 'mesmo nome em outro agente é permitido');
  assert.equal(Ag.criarTarefaOrquestrada('e6', { nome: 'Achar tendências', departamento: 'pesquisa' }).agenteId, arthur.id, 'sem agente: sugere o do departamento');
  const t = D.criarTarefa('e6', { nome: 'Longa', agenteId: helena.id });
  let soltar; const trava = new Promise((r) => { soltar = r; });
  const p = Ag.despachar(user('e6'), t.id, { executor: async (_u, _a, _p, w) => { w({ type: 'text', text: 'ok' }); await trava; return 'c'; } });
  await new Promise((r) => setImmediate(r));
  await assert.rejects(() => Ag.despachar(user('e6'), t.id, { executor: executor([]) }), /já está em execução/);
  const outra = D.criarTarefa('e6', { nome: 'Outra da Helena', agenteId: helena.id });
  await assert.rejects(() => Ag.despachar(user('e6'), outra.id, { executor: executor([]) }), /ocupado/);
  assert.throws(() => Ag.pausar('e6', helena.id, true), /executando/);
  soltar(); await p; await new Promise((r) => setTimeout(r, 20));
  assert.equal(D.acharTarefa('e6', t.id).status, 'aguardando_aprovacao');
  Ag.reconhecer('e6', helena.id); Ag.pausar('e6', helena.id, true);
  await assert.rejects(() => Ag.despachar(user('e6'), outra.id, { executor: executor([]) }), /pausado/);
  Ag.pausar('e6', helena.id, false);
  await assert.rejects(() => Ag.despachar(user('e6'), outra.id), /Nenhuma IA está configurada/);
  assert.equal(D.acharTarefa('e6', outra.id).status, 'pendente', 'sem IA a tarefa não muda de estado');
});

test('reunião: pede o parecer real de cada participante e monta o relatório; decisão aprovada fica registrada', async () => {
  const ags = Ag.garantirAgentes('e7');
  const r = Ag.criarReuniao('e7', { pauta: 'Lançar campanha de fones', participantes: [ags[0].id, ags[3].id] });
  const rr = await Ag.pedirPareceres(user('e7'), r.id, { executor: async (_u, ag, _p, w) => { w({ type: 'text', text: `Parecer de ${ag.nome}` }); return 'c'; } });
  assert.equal(rr.pareceres.length, 2); assert.match(rr.relatorio, /Parecer de Helena/); assert.match(rr.relatorio, /Parecer de Isabela/);
  assert.equal(Ag.registrarDecisao('e7', r.id, { texto: 'Seguir com a campanha', aprovadaPeloUsuario: true }).decisoes[0].aprovadaPeloUsuario, true);
  assert.equal(Ag.encerrarReuniao('e7', r.id).status, 'encerrada');
  assert.throws(() => Ag.criarReuniao('e7', { pauta: 'x', participantes: ['fantasma'] }), /Agente não encontrado/);
});

test('reinício do servidor: execução interrompida vira erro com aviso (não finge que continua)', () => {
  const a = S.area('e8');
  a.agentes.push({ id: 'ag-x', nome: 'Zé', cargo: 'x', departamento: 'diretoria', botId: 'b', estado: 'executando', tarefaAtual: 't-x', historico: [], indicadores: { concluidas: 0, aprovadas: 0, erros: 0, tempoTotalMs: 0 }, memoria: [] });
  a.tarefas.push({ id: 't-x', nome: 'x', status: 'em_execucao', historico: [] });
  Ag.garantirAgentes('e8');
  assert.equal(a.agentes[0].estado, 'com_erro'); assert.equal(a.tarefas[0].status, 'erro'); assert.match(a.tarefas[0].historico.at(-1).motivo, /reiniciou/);
});
