// Commerce Office — base: financeiro auditável, importador CSV, conectores honestos, tarefas, produtos e campanhas.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const U = 'user-teste';
let F; let I; let C; let D; let S;
before(async () => {
  fs.mkdirSync(path.resolve('.tmp-testes'), { recursive: true });
  process.env.DATA_DIR = fs.mkdtempSync(path.join(path.resolve('.tmp-testes'), 'com-'));
  S = await import('../server/commerce/store.js'); F = await import('../server/commerce/finance.js');
  I = await import('../server/commerce/importador.js'); C = await import('../server/commerce/conectores.js'); D = await import('../server/commerce/dados.js');
  (await import('../server/db.js')).load();
});

const venda = (o = {}) => ({ tipo: 'venda', valor: 100, data: '2026-11-20', plataforma: 'tiktokshop', origem: 'manual', pedido: 'P1', produto: 'Fone', ...o });

test('financeiro: duplicidade pelo pedido/produto/valor e pelo identificador externo', () => {
  assert.ok(F.registrar(U, venda()).lancamento);
  assert.ok(F.registrar(U, venda()).duplicado, 'mesma venda não entra duas vezes');
  assert.ok(F.registrar(U, venda({ externoId: 'X1', pedido: 'P2' })).lancamento);
  assert.ok(F.registrar(U, venda({ externoId: 'X1', pedido: 'P2', valor: 999 })).duplicado, 'mesmo id externo = mesmo lançamento');
});

test('financeiro: estimativa nunca conta como recebida; faturamento, comissão e receita ficam separados', () => {
  const U2 = 'u2';
  F.registrar(U2, venda({ pedido: 'A', valor: 200, status: 'confirmada' }));
  F.registrar(U2, venda({ pedido: 'B', valor: 100, status: 'cancelada' }));
  F.registrar(U2, { ...venda({ pedido: 'A' }), tipo: 'comissao', valor: 20, status: 'estimada' });
  F.registrar(U2, { ...venda({ pedido: 'C' }), tipo: 'comissao', valor: 30, status: 'aprovada' });
  F.registrar(U2, { ...venda({ pedido: 'D' }), tipo: 'comissao', valor: 50, status: 'recebida' });
  F.registrar(U2, { ...venda({ pedido: 'E' }), tipo: 'reembolso', valor: 10, sobre: 'comissao', status: 'confirmado' });
  const r = F.resumo(U2).real.indicadores;
  assert.equal(r.vendasBrutas, 200, 'cancelada não entra na venda bruta');
  assert.equal(r.vendasConfirmadas, 200);
  assert.equal(r.cancelamentos, 100);
  assert.equal(r.comissoesEstimadas, 20); assert.equal(r.comissoesAprovadas, 30); assert.equal(r.comissoesRecebidas, 50);
  assert.equal(r.receitaLiquida, 40, 'recebidas (50) menos estorno de comissão (10); estimadas e aprovadas não entram');
  assert.ok(F.resumo(U2).definicoes.receitaLiquida.definicao.includes('Não é lucro'));
});

test('financeiro: dados reais e de teste são calculados separadamente', () => {
  const U3 = 'u3';
  F.registrar(U3, venda({ valor: 100, real: true })); F.registrar(U3, venda({ valor: 5000, real: false, pedido: 'T1' }));
  const r = F.resumo(U3);
  assert.equal(r.real.indicadores.vendasBrutas, 100); assert.equal(r.teste.indicadores.vendasBrutas, 5000);
});

test('financeiro: recusa valor negativo, data inválida, plataforma inválida e falta de origem; mudança de status fica no histórico', () => {
  assert.throws(() => F.registrar(U, venda({ valor: -1 })), /Valor inválido/);
  assert.throws(() => F.registrar(U, venda({ data: '20/11/2026' })), /Data inválida/);
  assert.throws(() => F.registrar(U, venda({ plataforma: 'xyz' })), /Plataforma/);
  assert.throws(() => F.registrar(U, venda({ origem: '' })), /origem/);
  const { lancamento } = F.registrar('u4', { ...venda({ pedido: 'Z' }), tipo: 'comissao', valor: 8, status: 'estimada' });
  F.mudarStatus('u4', lancamento.id, 'recebida');
  assert.equal(S.area('u4').lancamentos[0].historico.length, 2);
  assert.throws(() => F.mudarStatus('u4', lancamento.id, 'confirmada'), /inválido/);
});

const CSV = `Order ID;Order Time;Product Name;Order Amount;Estimated Commission;Order Status
1001;20/11/2026 10:15;Fone Bluetooth;"R$ 1.234,50";"R$ 123,45";Completed
1002;2026-11-21;Camiseta;89,90;8,99;Cancelled
1003;31/02/2026;Boné;50,00;5,00;Pending
1004;22/11/2026;Mochila;abc;;Pending
`;

test('importador: lê CSV com ; e aspas, detecta colunas, converte números e datas, e aponta erros por linha', () => {
  const csv = I.lerCsv(CSV);
  assert.equal(csv.delimitador, ';'); assert.equal(csv.linhas.length, 4);
  const m = I.detectarColunas(csv.cabecalho);
  assert.deepEqual([m.pedido, m.data, m.produto, m.valor, m.comissao, m.status], [0, 1, 2, 3, 4, 5]);
  assert.equal(I.lerNumero('R$ 1.234,50'), 1234.5); assert.equal(I.lerNumero('1,234.50'), 1234.5); assert.equal(I.lerNumero('12,30'), 12.3); assert.equal(I.lerNumero('abc'), null);
  assert.equal(I.lerData('20/11/2026 10:15'), '2026-11-20'); assert.equal(I.lerData('31/02/2026'), null);
  const p = I.previa(CSV);
  assert.equal(p.validos, 4, 'duas linhas válidas com venda+comissão... venda e comissão da 1001 e 1002');
  assert.equal(p.totalErros, 2); assert.ok(p.erros.some((e) => e.linha === 4 && /Data inválida/.test(e.motivo)));
});

test('importador: grava com origem, ignora duplicados na segunda importação e preserva os registros', () => {
  const U5 = 'u5';
  const r1 = I.importar(U5, { plataforma: 'tiktokshop', texto: CSV, arquivo: 'tiktok-nov.csv' });
  assert.equal(r1.criados, 4); assert.equal(r1.duplicados, 0); assert.equal(r1.erros, 2);
  const r2 = I.importar(U5, { plataforma: 'tiktokshop', texto: CSV, arquivo: 'tiktok-nov.csv' });
  assert.equal(r2.criados, 0); assert.equal(r2.duplicados, 4);
  const ls = S.area(U5).lancamentos;
  assert.equal(ls.length, 4); assert.ok(ls.every((l) => l.origem === 'importacao:tiktok-nov.csv' && l.importacaoId === r1.id));
  assert.equal(S.area(U5).importacoes.length, 2, 'as duas importações ficam no histórico');
  const cancelada = ls.find((l) => l.pedido === '1002' && l.tipo === 'comissao');
  assert.equal(cancelada.status, 'cancelada');
  assert.ok(ls.find((l) => l.pedido === '1001' && l.tipo === 'comissao').status === 'aprovada', 'Completed = aprovada, não recebida');
  assert.throws(() => I.importar(U5, { plataforma: 'tiktokshop', texto: 'a;b\n1;2', mapeamento: { valor: 1 } }), /data/i);
});

test('conectores: nada é simulado — API pendente, importação operacional, credenciais nunca voltam', async () => {
  const e = C.estado('c1', 'tiktokshop');
  assert.equal(e.operacional.importacaoCsv, 'operacional'); assert.match(e.operacional.api, /pendente/);
  assert.ok(e.capacidades.every((c) => c.api === 'nao_verificado'));
  assert.equal(e.checklist.length, 7); assert.ok(e.checklist.every((i) => i.status === 'nao_verificado'));
  await assert.rejects(() => C.sincronizar('c1', 'tiktokshop'), /Faltam credenciais/);
  const salvo = C.salvarCredenciais('c1', 'tiktokshop', { APP_KEY: 'chave-secreta', APP_SECRET: 's' });
  assert.ok(!JSON.stringify(salvo).includes('chave-secreta'), 'o valor nunca é devolvido');
  assert.equal(salvo.credenciais.find((c) => c.campo === 'APP_KEY').configurado, true);
  await assert.rejects(() => C.sincronizar('c1', 'tiktokshop'), /Faltam credenciais/);
  C.marcarChecklist('c1', 'tiktokshop', 'elegibilidadeBR', { status: 'confirmado', nota: 'confirmado com o suporte' });
  assert.equal(C.estado('c1', 'tiktokshop').checklist[0].status, 'confirmado');
  const r = C.revogar('c1', 'tiktokshop');
  assert.equal(r.status, 'revogado'); assert.ok(r.credenciais.every((c) => !c.configurado));
  assert.equal(C.listar('c1').length, 3);
});

test('produtos: avaliação com nota exige fonte; comissão potencial é estimativa; produto com lançamento não é apagado', () => {
  assert.throws(() => D.criarProduto('p1', { nome: 'Fone', avaliacao: { nota: 4.5 } }), /fonte/);
  const p = D.criarProduto('p1', { nome: 'Fone', preco: 100, comissaoPct: 12, plataforma: 'tiktokshop', avaliacao: { nota: 4.5, fonte: 'página do produto em 25/11' } });
  assert.equal(p.comissaoPotencial, 12);
  assert.throws(() => D.criarProduto('p1', { nome: 'X', link: 'javascript:alert(1)' }), /http/);
  assert.throws(() => D.criarProduto('p1', { nome: 'X', comissaoPct: 150 }), /0 e 100/);
  F.registrar('p1', { ...venda(), produtoId: p.id });
  assert.throws(() => D.removerProduto('p1', p.id), /lançamentos/);
  const e = D.atualizarProduto('p1', p.id, { status: 'em_promocao' });
  assert.ok(e.historico.some((h) => h.acao === 'editado' && h.campos.includes('status')));
});

test('tarefas: criar, reatribuir, mudar status com histórico, identificar atraso', () => {
  const a = S.area('t1');
  a.agentes.push({ id: 'ag1', nome: 'Arthur' }, { id: 'ag2', nome: 'Sofia' });
  const t = D.criarTarefa('t1', { nome: 'Pesquisar fones', agenteId: 'ag1', departamento: 'pesquisa', prazo: '2020-01-01', prioridade: 'alta' });
  assert.equal(D.listarTarefas('t1')[0].atrasada, true);
  D.atualizarTarefa('t1', t.id, { agenteId: 'ag2' });
  D.mudarStatusTarefa('t1', t.id, 'em_execucao'); D.mudarStatusTarefa('t1', t.id, 'concluida', { resultado: 'ok' });
  const f = D.acharTarefa('t1', t.id);
  assert.equal(f.concluidaEm !== null, true); assert.deepEqual(f.historico.map((h) => h.acao), ['criada', 'reatribuida', 'status', 'status']);
  assert.equal(D.listarTarefas('t1')[0].atrasada, false, 'concluída não é atrasada');
  assert.throws(() => D.criarTarefa('t1', { nome: 'x', agenteId: 'nao-existe' }), /Agente/);
});

test('campanhas: resultado exige fonte; publicar exige aprovação explícita', () => {
  const c = D.criarCampanha('k1', { nome: 'Fone nov' });
  assert.throws(() => D.adicionarItemCampanha('k1', c.id, 'resultados', { metrica: 'views', valor: 1000 }), /fonte/);
  D.adicionarItemCampanha('k1', c.id, 'resultados', { metrica: 'views', valor: 1000, fonte: 'Central do Criador' });
  D.adicionarItemCampanha('k1', c.id, 'roteiros', { texto: 'Cena 1...' });
  assert.throws(() => D.atualizarCampanha('k1', c.id, { status: 'publicada' }), /aprovação/);
  assert.equal(D.atualizarCampanha('k1', c.id, { status: 'publicada', aprovadoPeloUsuario: true }).status, 'publicada');
});
