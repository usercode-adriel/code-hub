// Commerce Office — API HTTP de ponta a ponta contra o servidor real (autenticação, isolamento entre usuários, uploads, layouts).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { criarPngRGBA } from '../server/commerce/png.js';

const RAIZ = path.resolve('.');
const PORTA = 4100 + Math.floor(Math.random() * 400);
const BASE = `http://localhost:${PORTA}`;
let servidor; let dados; let tokA; let tokB;
const api = (tok) => async (metodo, rota, corpo) => {
  const opts = { method: metodo, headers: { Authorization: `Bearer ${tok}` } };
  if (corpo instanceof FormData) opts.body = corpo; else if (corpo !== undefined) { opts.body = JSON.stringify(corpo); opts.headers['Content-Type'] = 'application/json'; }
  const r = await fetch(`${BASE}/api/commerce${rota}`, opts);
  const tipo = r.headers.get('content-type') || '';
  return { status: r.status, corpo: tipo.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
};
let A; let B;

before(async () => {
  fs.mkdirSync(path.resolve('.tmp-testes'), { recursive: true });
  dados = fs.mkdtempSync(path.join(path.resolve('.tmp-testes'), 'api-'));
  servidor = spawn(process.execPath, ['server/index.js'], { cwd: RAIZ, env: { ...process.env, DATA_DIR: dados, PORT: String(PORTA), AI_PROVIDER: 'local', GEMINI_API_KEY: '', ANTHROPIC_API_KEY: '' }, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* subindo */ } await new Promise((r) => setTimeout(r, 250)); }
  const login = async (email, password) => (await (await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json()).token;
  tokA = await login('admin@codeniac.dev', 'codeniac123');
  await fetch(`${BASE}/api/admin/users`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokA}` }, body: JSON.stringify({ name: 'Outra Pessoa', email: 'outra@teste.dev', password: 'senha123' }) });
  tokB = await login('outra@teste.dev', 'senha123');
  A = api(tokA); B = api(tokB);
});
after(async () => { if (servidor && servidor.exitCode === null) { const saiu = new Promise((r) => servidor.once('exit', r)); servidor.kill(); await saiu; } fs.rmSync(dados, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); });

test('exige login; cada usuário só vê os próprios dados', async () => {
  assert.equal((await fetch(`${BASE}/api/commerce/estado`)).status, 401);
  const p = await A('POST', '/produtos', { nome: 'Fone do Admin', origem: 'teste' });
  assert.equal(p.status, 200);
  assert.equal((await A('GET', '/produtos')).corpo.length, 1);
  assert.equal((await B('GET', '/produtos')).corpo.length, 0, 'o outro usuário não vê');
  assert.equal((await B('PUT', `/produtos/${p.corpo.id}`, { nome: 'invadido' })).status, 404);
  assert.equal((await B('DELETE', `/produtos/${p.corpo.id}`)).status, 404);
});

test('estado geral: agentes criados, módulos com situação honesta (operacional/pendente)', async () => {
  const e = (await A('GET', '/estado')).corpo;
  assert.deepEqual(e.agentes.map((a) => a.nome), ['Eleonor', 'Lady Iris', 'Sophia', 'Laurinda', 'Lucya']);
  const sit = Object.fromEntries(e.status.map((s) => [s.modulo, s.situacao]));
  assert.match(sit['TikTok Shop / Shopee / Temu — API'], /pendente/); assert.match(sit['Editor de Vídeo e Video Cut'], /pendente/); assert.match(sit['Importação de relatórios CSV'], /operacional/);
  assert.equal(e.conectores.length, 3);
});

test('tarefas: criar sem duplicar; despachar sem IA configurada devolve erro claro e não muda a tarefa', async () => {
  const ags = (await A('GET', '/agentes')).corpo;
  const t = (await A('POST', '/tarefas', { nome: 'Pesquisar nichos', agenteId: ags[1].id, departamento: 'pesquisa' })).corpo;
  assert.equal((await A('POST', '/tarefas', { nome: 'pesquisar NICHOS', agenteId: ags[1].id })).status, 409);
  const d = await A('POST', `/tarefas/${t.id}/despachar`);
  assert.equal(d.status, 409); assert.match(d.corpo.error, /Nenhuma IA/);
  assert.equal((await A('GET', '/tarefas')).corpo.find((x) => x.id === t.id).status, 'pendente');
  assert.equal((await A('POST', `/agentes/${ags[1].id}/pausar`, { pausado: true })).corpo.estado, 'pausado');
  assert.equal((await A('POST', `/agentes/${ags[1].id}/pausar`, { pausado: false })).corpo.estado, 'disponivel');
  const conv = (await A('GET', `/agentes/${ags[0].id}/conversa`)).corpo; assert.ok(conv.conversaId);
  const lista = (await fetch(`${BASE}/api/assistant/conversations`, { headers: { Authorization: `Bearer ${tokA}` } }).then((r) => r.json()));
  assert.ok(lista.some((c) => c.id === conv.conversaId && c.botId), 'a conversa é do chat real, ligada ao bot do agente');
});

test('importação CSV de ponta a ponta e financeiro separado entre real e teste', async () => {
  const csv = 'Order ID;Order Time;Product Name;Order Amount;Estimated Commission;Order Status\n9001;20/11/2026;Fone;100,00;10,00;Completed\n9002;21/11/2026;Cabo;50,00;5,00;Pending';
  const previa = (await A('POST', '/importacao/previa', { texto: csv })).corpo; assert.equal(previa.validos, 4); assert.equal(previa.totalErros, 0);
  const r = (await A('POST', '/importacao', { plataforma: 'tiktokshop', texto: csv, arquivo: 'nov.csv' })).corpo; assert.equal(r.criados, 4);
  assert.equal((await A('POST', '/importacao', { plataforma: 'tiktokshop', texto: csv, arquivo: 'nov.csv' })).corpo.duplicados, 4);
  const resumo = (await A('GET', '/financeiro/resumo')).corpo;
  assert.equal(resumo.real.indicadores.vendasBrutas, 150); assert.equal(resumo.real.indicadores.comissoesAprovadas, 10); assert.equal(resumo.real.indicadores.comissoesEstimadas, 5); assert.equal(resumo.real.indicadores.comissoesRecebidas, 0);
  assert.equal(resumo.teste.indicadores.vendasBrutas, 0);
  assert.equal((await B('GET', '/financeiro/resumo')).corpo.real.indicadores.vendasBrutas, 0, 'isolamento');
  assert.equal((await A('POST', '/financeiro/lancamentos', { tipo: 'venda', valor: 1, data: '2026-11-22', plataforma: 'xyz' })).status, 400);
});

test('conectores: nunca devolvem credenciais; sincronização por API diz a verdade', async () => {
  const s = (await A('PUT', '/conectores/shopee/credenciais', { PARTNER_ID: '123', PARTNER_KEY: 'chave-super-secreta' })).corpo;
  assert.ok(!JSON.stringify(s).includes('chave-super-secreta'));
  const sinc = await A('POST', '/conectores/shopee/sincronizar'); assert.ok([409, 501].includes(sinc.status));
  assert.ok(!JSON.stringify((await A('GET', '/conectores')).corpo).includes('chave-super-secreta'));
  await A('POST', '/conectores/shopee/revogar');
});

test('assets: upload de PNG por multipart, arquivo servido de volta, duplicado detectado, bloqueio de não-PNG', async () => {
  const png = criarPngRGBA(64, 64, [1, 2, 3, 255]);
  const form = () => { const f = new FormData(); f.append('arquivo', new Blob([png], { type: 'image/png' }), 'mesa-escritorio.png'); f.append('licenca', 'CC0'); f.append('usoComercial', 'true'); return f; };
  const up = (await A('POST', '/assets', form())).corpo; assert.equal(up.asset.categoria, 'moveis'); assert.equal(up.asset.licenca.tipo, 'CC0');
  assert.equal((await A('POST', '/assets', form())).corpo.duplicado, true);
  const arq = await A('GET', `/assets/${up.asset.id}/arquivo`); assert.equal(arq.status, 200); assert.ok(arq.corpo.equals(png));
  assert.equal((await B('GET', `/assets/${up.asset.id}/arquivo`)).status, 404, 'o outro usuário não acessa');
  const ruim = new FormData(); ruim.append('arquivo', new Blob(['não sou png'], { type: 'image/png' }), 'x.png');
  assert.equal((await A('POST', '/assets', ruim)).status, 400);
  const meta = (await A('PUT', `/assets/${up.asset.id}`, { nome: 'Mesa', escala: 2 })).corpo; assert.equal(meta.escala, 2);
  assert.equal((await A('GET', '/assets?categoria=moveis')).corpo.length, 1);
});

test('aquisição: endereço fora da lista é recusado antes de qualquer acesso à rede', async () => {
  const r = await A('POST', '/aquisicao/analisar', { url: 'https://site-qualquer.exemplo/pack.zip' });
  assert.equal(r.status, 400); assert.match(r.corpo.error, /não permitido/);
  assert.equal((await A('GET', '/aquisicao/busca?q=office')).corpo.length, 4);
});

const layoutMin = (extra = {}) => ({ formato: 'codeniac-office', versaoFormato: 1, largura: 8, altura: 8, piso: Array(64).fill('madeira'), paredes: [], objetos: [{ id: 'o1', tipo: 'mesa', x: 2, y: 2, rot: 0 }], colisoes: [], personagens: [], departamentos: [], estacoes: [], ...extra });

test('layouts: valida, salva com controle de versão (conflito 409), duplica e não deixa remover o último', async () => {
  assert.equal((await A('POST', '/layouts', { nome: 'x', dados: { ...layoutMin(), piso: [] } })).status, 400);
  assert.equal((await A('POST', '/layouts', { nome: 'x', dados: layoutMin({ objetos: [{ id: 'o1', tipo: 'mesa', x: 99, y: 0 }] }) })).status, 400);
  assert.equal((await A('POST', '/layouts', { nome: 'x', dados: layoutMin({ estacoes: [{ id: 'e1', objetoId: 'nao-existe' }] }) })).status, 400);
  const l = (await A('POST', '/layouts', { nome: 'Sede', dados: layoutMin() })).corpo; assert.equal(l.versao, 1);
  const ok = await A('PUT', `/layouts/${l.id}`, { dados: layoutMin({ objetos: [] }), versaoBase: 1 }); assert.equal(ok.corpo.versao, 2);
  const conflito = await A('PUT', `/layouts/${l.id}`, { dados: layoutMin(), versaoBase: 1 }); assert.equal(conflito.status, 409);
  const dup = (await A('POST', `/layouts/${l.id}/duplicar`)).corpo; assert.notEqual(dup.id, l.id);
  assert.equal((await A('GET', '/layouts/ativo')).corpo.id, l.id);
  assert.equal((await A('DELETE', `/layouts/${dup.id}`)).status, 200);
  assert.equal((await A('DELETE', `/layouts/${l.id}`)).status, 409, 'não remove o último');
  assert.equal((await B('GET', `/layouts/${l.id}`)).status, 404);
});

test('personagens: spritesheet com animações por estado e troca de aparência sem mexer no funcionário', async () => {
  const sheet = criarPngRGBA(128, 64, [9, 9, 9, 255]);
  const f = new FormData(); f.append('arquivo', new Blob([sheet], { type: 'image/png' }), 'hero-sheet.png'); f.append('categoria', 'spritesheets');
  const asset = (await A('POST', '/assets', f)).corpo.asset;
  const p = await A('POST', '/personagens', { nome: 'Helena pixel', assetId: asset.id, quadroL: 32, quadroA: 32, animacoes: [{ estado: 'idle', quadros: [0, 1], linha: 0, fps: 4 }, { estado: 'typing', quadros: [0, 1, 2, 3], linha: 1, fps: 10 }, { estado: 'invalido', quadros: [0] }] });
  assert.equal(p.status, 200); assert.equal(p.corpo.colunas, 4); assert.equal(p.corpo.linhas, 2); assert.equal(p.corpo.animacoes.length, 3); assert.equal(p.corpo.animacoes[2].estado, null, 'animação nomeada sem estado válido fica sem estado associado');
  assert.equal((await A('POST', '/personagens', { nome: 'x', assetId: asset.id, quadroL: 9999 })).status, 400);
  const ag = (await A('GET', '/agentes')).corpo[0];
  assert.equal((await A('POST', `/agentes/${ag.id}/aparencia`, { personagemId: p.corpo.id })).corpo.avatarId, p.corpo.id);
  assert.equal((await A('GET', '/agentes')).corpo[0].nome, ag.nome, 'dados do funcionário intactos');
  assert.equal((await A('DELETE', `/personagens/${p.corpo.id}`)).status, 409, 'em uso por um funcionário');
  assert.equal((await A('DELETE', `/assets/${asset.id}`)).status, 409, 'em uso por um personagem');
});

test('regressão: rotas do Hub continuam respondendo', async () => {
  for (const rota of ['/api/health', '/api/tech-news']) assert.equal((await fetch(`${BASE}${rota}`, { headers: { Authorization: `Bearer ${tokA}` } })).status, 200);
  assert.equal((await fetch(`${BASE}/api/projects`, { headers: { Authorization: `Bearer ${tokA}` } })).status, 200);
});

test('equipe 2.1 pela API: ordem sem IA é recusada com explicação; estoque, documentos e config funcionam e são isolados por usuário', async () => {
  const eq = await A('GET', '/equipe'); assert.equal(eq.status, 200); assert.equal(eq.corpo.agentes.length, 5); assert.equal(eq.corpo.modoIA, 'local'); assert.equal(eq.corpo.ordemAtiva, null);
  assert.ok(eq.corpo.agentes.every((a) => a.perfil.tom && Array.isArray(a.relacionamentos)));
  const o = await A('POST', '/ordens', { texto: 'Equipe, encontrem um produto para o TikTok Shop' }); assert.equal(o.status, 409); assert.match(o.corpo.error, /Nenhuma IA está configurada/);
  assert.equal((await A('POST', '/ordens', { texto: 'x' })).status, 400); assert.equal((await A('GET', '/ordens')).corpo.length, 0); assert.equal((await A('GET', '/mensagens')).corpo.length, 0);
  assert.equal((await A('PUT', '/equipe/config', { maxTurnos: 99, limiteChamadasDia: 1, balaoSegundos: 9 })).corpo.maxTurnos, 12, 'limites são travados');
  const it = await A('POST', '/estoque/itens', { nome: 'Caixa P', quantidade: 5, minimo: 2 }); assert.equal(it.status, 200);
  assert.equal((await A('POST', '/estoque/movimentos', { itemId: it.corpo.id, tipo: 'saida', quantidade: 9 })).status, 409);
  assert.equal((await A('POST', '/estoque/movimentos', { itemId: it.corpo.id, tipo: 'saida', quantidade: 2 })).corpo.saldoApos, 3);
  assert.equal((await B('GET', '/estoque')).corpo.itens.length, 0, 'o outro usuário não vê o estoque');
  assert.equal((await A('POST', '/documentos', { titulo: 'R', texto: 'x', classificacao: 'real' })).status, 400, 'real exige fonte');
  assert.equal((await A('POST', '/documentos', { titulo: 'Plano', texto: 'x' })).corpo.classificacao, 'sugestao_ia'); assert.equal((await B('GET', '/documentos')).corpo.length, 0);
  assert.equal((await A('GET', '/layouts/ativo')).status, 200);
});
