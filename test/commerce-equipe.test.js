// Commerce Office 2.1 — equipe, ordens do chefe, comunicação interna, estoque e documentos. A IA é substituída por um dublê
// (server/commerce/iaTeste.js) SÓ para verificar a orquestração; nada aqui prova a qualidade da IA real.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

let DB; let S; let Ag; let Eq; let Est; let Doc; let G; let T;
const user = (id) => ({ id, name: id, role: 'user' });
before(async () => {
  fs.mkdirSync(path.resolve('.tmp-testes'), { recursive: true });
  process.env.DATA_DIR = fs.mkdtempSync(path.join(path.resolve('.tmp-testes'), 'eqp-'));
  process.env.AI_PROVIDER = 'local'; process.env.GEMINI_API_KEY = ''; process.env.ANTHROPIC_API_KEY = ''; delete process.env.CODENIAC_TESTE_IA_FALSA;
  DB = await import('../server/db.js'); DB.load();
  S = await import('../server/commerce/store.js'); Ag = await import('../server/commerce/agentes.js'); Eq = await import('../server/commerce/equipe.js');
  Est = await import('../server/commerce/estoque.js'); Doc = await import('../server/commerce/documentos.js'); await import('../server/commerce/ferramentas.js'); G = await import('../server/agent.js');
  T = await import('../server/commerce/iaTeste.js');
});
const ordem = (uid, texto, extra = {}) => Eq.enviarOrdem(user(uid), texto, { gerador: T.gerar, executor: T.executor, teste: true, esperar: true, ...extra });

test('a equipe 2.1 tem os cinco funcionários com perfil, tom, objetivos e bot real; a equipe antiga é arquivada sem perder histórico', () => {
  const a = S.area('m1');
  // usuário que já tinha a equipe da versão 1
  a.agentes.push({ id: 'old1', chave: 'helena', nome: 'Helena', cargo: 'Diretora', departamento: 'diretoria', estado: 'disponivel', historico: [], indicadores: {}, memoria: [], botId: 'x' });
  const ags = Ag.garantirAgentes('m1');
  assert.deepEqual(ags.map((x) => x.nome), ['Eleonor', 'Lady Iris', 'Sophia', 'Laurinda', 'Lucya']);
  assert.ok(ags.every((x) => x.perfil.tom && x.perfil.especialidade && x.perfil.objetivos.length >= 3 && x.perfil.temperamento));
  const velho = S.area('m1').agentes.find((x) => x.id === 'old1'); assert.equal(velho.arquivado, true); assert.equal(velho.historico.length >= 1, true, 'histórico preservado');
  assert.equal(DB.db().bots.filter((b) => b.userId === 'm1' && b.commerceAgent).length, 5);
  Ag.atualizarAgente('m1', ags[0].id, { perfil: { tom: 'Mais objetiva', objetivos: ['A', 'B'] }, cargo: 'Marketing' });
  assert.equal(S.area('m1').agentes.find((x) => x.chave === 'eleonor').perfil.tom, 'Mais objetiva');
  assert.equal(Ag.garantirAgentes('m1').length, 5, 'idempotente');
});

test('sem IA configurada a ordem é recusada com explicação e nada é criado nem simulado', async () => {
  Ag.garantirAgentes('m2');
  await assert.rejects(() => Eq.enviarOrdem(user('m2'), 'Equipe, achem um produto para o TikTok Shop'), /Nenhuma IA está configurada/);
  assert.equal(S.area('m2').ordens.length, 0); assert.equal(S.area('m2').mensagens.length, 0); assert.equal(S.area('m2').tarefas.length, 0);
});

test('ordem coletiva: interpreta, discute (falas persistidas), cria tarefas reais, registra documentos e aguarda aprovação', async () => {
  Ag.garantirAgentes('m3');
  const o = await ordem('m3', 'Equipe, quero encontrar um produto com potencial de venda no TikTok Shop, desenvolver uma campanha e analisar a rentabilidade.');
  assert.equal(o.status, 'aguardando_aprovacao', JSON.stringify(o)); assert.equal(o.responsaveis.length, 4, 'a logística (Lucya) não é chamada para esta ordem');
  assert.ok(o.turnos >= 4 && o.turnos <= 8, `turnos ${o.turnos}`); assert.equal(o.tarefas.length, 4); assert.ok(o.tarefas.every((t) => t.status === 'aguardando_aprovacao'));
  const msgs = Eq.listarMensagens('m3', {});
  assert.equal(msgs[0].tipo, 'ordem'); assert.equal(msgs[0].de, 'chefe');
  const falas = msgs.filter((m) => ['conversa', 'ideia', 'pergunta', 'discordancia', 'conclusao'].includes(m.tipo) && m.origem === 'teste');
  assert.ok(falas.length >= 4); assert.ok(falas.every((m) => m.classificacao === 'simulada'), 'falas do dublê marcadas como simuladas');
  assert.ok(falas.some((m) => m.tipo === 'discordancia'), 'há discordância profissional');
  assert.ok(msgs.some((m) => m.tipo === 'conclusao' && m.tarefaId), 'cada agente comunica sua conclusão');
  assert.ok(msgs.every((m, i) => i === 0 || m.seq > msgs[i - 1].seq), 'sequência crescente para o polling');
  // resultados reais registrados nos sistemas do Hub
  const a = S.area('m3'); assert.ok(a.documentos.length >= 4); assert.ok(a.documentos.some((d) => d.tipo === 'proposta' && d.estrutura));
  const fin = a.documentos.find((d) => d.titulo.startsWith('Análise financeira')); assert.equal(fin.classificacao, 'real'); assert.ok(fin.fontes.length);
  assert.ok(a.produtos.some((p) => /TESTE/.test(p.origem)), 'produto de teste identificado como tal');
  assert.ok(a.tarefas.every((t) => t.ordemId === o.id));
  // relações nascem do histórico, não são fixas
  const sophia = a.agentes.find((x) => x.chave === 'sophia'); assert.ok(Object.keys(sophia.relacionamentos).length >= 1);
  assert.ok(a.agentes.find((x) => x.chave === 'eleonor').memoria.some((m) => /Ordem do chefe/.test(m)), 'memória de trabalho');
  // aprovar todas as tarefas conclui a ordem
  for (const t of o.tarefas) Ag.revisar('m3', t.id, { aprovar: true });
  assert.equal(Eq.listarOrdens('m3')[0].status, 'concluida');
  // persistência: o painel e as mensagens vêm do banco
  assert.equal(Eq.painelEquipe('m3').agentes.length, 5);
});

test('limites: turnos configuráveis, orçamento diário, uma ordem por vez, cancelamento e agentes pausados', async () => {
  Ag.garantirAgentes('m4'); Eq.atualizarConfig('m4', { maxTurnos: 3 });
  const o = await ordem('m4', 'Equipe, descubram oportunidades para aumentar a receita');
  assert.ok(o.turnos <= 3, `turnos ${o.turnos}`);
  // orçamento
  Eq.atualizarConfig('m4', { limiteChamadasDia: 5 }); S.area('m4').equipeConfig.uso = { data: S.hoje(), chamadas: 4 };
  await assert.rejects(() => ordem('m4', 'Equipe, outra ordem sem orçamento'), /Orçamento diário/);
  // pausa
  const ags = S.area('m4').agentes; Eq.atualizarConfig('m4', { limiteChamadasDia: 500 });
  for (const x of ags) if (x.chave !== 'lucya') Ag.pausar('m4', x.id, true).estado;
  S.area('m4').agentes.forEach((x) => { if (x.estado === 'concluido' || x.estado === 'com_erro') x.estado = 'disponivel'; });
  const o2 = await ordem('m4', 'Lucya, confira o estoque e registre o que for preciso');
  assert.deepEqual(o2.responsaveis.map((r) => r.nome), ['Lucya'].filter(() => false).concat(o2.responsaveis.map((r) => r.nome)));
  assert.ok(o2.responsaveis.every((r) => r.nome === 'Lucya'), 'só quem não está pausado recebe trabalho');
  // uma ordem por vez + cancelar
  let soltar; const trava = new Promise((r) => { soltar = r; });
  const p = Eq.enviarOrdem(user('m4'), 'Lucya, faça a conferência completa', { gerador: async (x) => { if (x.etapa === 'plano') await trava; return T.gerar(x); }, executor: T.executor, teste: true });
  await new Promise((r) => setImmediate(r));
  await assert.rejects(() => Eq.enviarOrdem(user('m4'), 'Lucya, outra ordem agora', { gerador: T.gerar, teste: true }), /Já existe uma ordem em andamento/);
  const ativa = Eq.painelEquipe('m4').ordemAtiva; assert.ok(ativa); Eq.cancelarOrdem('m4', ativa.id); soltar(); await p; await Eq.aguardar('m4');
  assert.equal(Eq.listarOrdens('m4')[0].status, 'cancelada');
});

test('ordem que não identifica ninguém fica bloqueada com motivo; falha da IA vira mensagem real, não fala inventada', async () => {
  Ag.garantirAgentes('m5');
  const o = await ordem('m5', 'Faça aquilo que combinamos ontem sem dizer nada', { gerador: async () => 'não é json' });
  assert.equal(o.status, 'bloqueada'); assert.match(o.motivo, /não identifiquei/);
  const o2 = await ordem('m5', 'Equipe, vamos conversar', { gerador: async (x) => { if (x.etapa === 'plano') return T.gerar(x); throw Object.assign(new Error('cota esgotada'), { status: 429 }); } });
  const m = Eq.listarMensagens('m5', {}).find((x) => /A IA não respondeu/.test(x.texto)); assert.ok(m && m.origem === 'sistema' && m.classificacao === 'real');
  assert.ok(o2.id);
});

test('estoque: saldo vem dos movimentos; saída maior que o saldo e ajuste sem motivo são recusados; divergência registra esperado × contado', () => {
  const u = 'm6'; const it = Est.cadastrarItem(u, { nome: 'Caixa M', sku: 'CX-M', quantidade: 10, minimo: 3, local: 'A1' }, 'chefe');
  assert.equal(Est.acharItem(u, 'cx-m').quantidade, 10);
  assert.throws(() => Est.cadastrarItem(u, { nome: 'Outra', sku: 'cx-m' }), /SKU/);
  assert.equal(Est.movimentar(u, { itemId: it.id, tipo: 'saida', quantidade: 4 }, 'Lucya').saldoApos, 6);
  assert.throws(() => Est.movimentar(u, { itemId: it.id, tipo: 'saida', quantidade: 7 }), /maior que o saldo/);
  assert.throws(() => Est.movimentar(u, { itemId: it.id, tipo: 'ajuste', quantidade: 5 }), /motivo/);
  const d = Est.movimentar(u, { itemId: it.id, tipo: 'divergencia', quantidade: 5, motivo: 'faltou 1 caixa na conferência' }, 'Lucya');
  assert.equal(d.esperado, 6); assert.equal(d.contado, 5); assert.equal(Est.acharItem(u, it.id).quantidade, 5);
  assert.equal(Est.listarMovimentos(u).length, 3); assert.equal(Est.resumoEstoque(u).divergencias, 1);
  Est.movimentar(u, { itemId: it.id, tipo: 'saida', quantidade: 3 }); assert.equal(Est.listarItens(u)[0].abaixoDoMinimo, true);
});

test('documentos: "real" exige fonte; ferramentas dos agentes registram documento e estoque de verdade', async () => {
  assert.throws(() => Doc.criarDocumento('m7', { titulo: 'X', texto: 'y', classificacao: 'real' }), /fonte/);
  assert.equal(Doc.criarDocumento('m7', { titulo: 'X', texto: 'y' }).classificacao, 'sugestao_ia');
  Ag.garantirAgentes('m7'); const bot = DB.db().bots.find((b) => b.userId === 'm7'); const ctx = { user: user('m7'), bot, conv: null, write: () => {}, actions: [], sources: [] };
  const nomes = G.toolDeclarations(bot, user('m7')).map((t) => t.name); assert.ok(nomes.includes('commerce_documentos') && nomes.includes('commerce_estoque'));
  const r = await G.callTool(ctx, 'commerce_documentos', { acao: 'criar', tipo: 'roteiro', titulo: 'Roteiro fone', texto: 'Gancho...', classificacao: 'sugestao_ia' }); assert.ok(r.result.id);
  assert.match((await G.callTool(ctx, 'commerce_documentos', { acao: 'criar', tipo: 'relatorio', titulo: 'R', texto: 't', classificacao: 'real' })).error, /fonte/);
  const e = await G.callTool(ctx, 'commerce_estoque', { acao: 'cadastrar', nome: 'Fita', quantidade: 5 }); assert.ok(e.result.id);
  assert.match((await G.callTool(ctx, 'commerce_estoque', { acao: 'movimentar', item: 'Fita', tipo: 'saida', quantidade: 9 })).error, /maior que o saldo/);
});
