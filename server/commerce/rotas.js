// ROTAS DO COMMERCE OFFICE (/api/commerce). Montadas atrás do mesmo requireAuth do Hub; tudo é filtrado pelo usuário logado.
import express from 'express';
import multer from 'multer';
import { area, erro } from './store.js';
import * as Fin from './finance.js';
import * as Imp from './importador.js';
import * as Con from './conectores.js';
import * as Dad from './dados.js';
import * as Ag from './agentes.js';
import * as Ast from './assets.js';
import * as Aq from './aquisicao.js';
import * as Lay from './layouts.js';
import * as Per from './personagens.js';
import * as Eq from './equipe.js';
import * as Est from './estoque.js';
import * as Doc from './documentos.js';

const router = express.Router();
const h = (fn) => async (req, res) => {
  try { const r = await fn(req, res); if (r !== undefined && !res.headersSent) res.json(r); }
  catch (e) { res.status(e.status || (e.code === 'LIMIT_FILE_SIZE' ? 413 : 500)).json({ error: e.status || e.code === 'LIMIT_FILE_SIZE' ? (e.code === 'LIMIT_FILE_SIZE' ? 'Arquivo grande demais.' : e.message) : 'Erro interno no Commerce Office.' }); if (!e.status) console.error('[commerce]', e); }
};
const uid = (req) => req.user.id;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 64 * 1024 * 1024, files: 1 } });
const bool = (v) => (v === undefined ? undefined : v === 'true' || v === true);

// ---------- visão geral e o que está operacional ----------
router.get('/estado', h((req) => {
  const a = area(uid(req)); const ags = Ag.garantirAgentes(uid(req));
  return {
    agentes: ags.map((x) => ({ id: x.id, nome: x.nome, estado: x.estado, departamento: x.departamento })),
    contagens: { tarefas: a.tarefas.length, produtos: a.produtos.length, campanhas: a.campanhas.length, lancamentos: a.lancamentos.length, assets: a.assets.length, layouts: a.layouts.length, personagens: a.personagens.length },
    conectores: Con.unificado(uid(req)),
    status: [
      { modulo: 'Escritório isométrico', situacao: 'operacional' }, { modulo: 'Agentes de IA', situacao: 'operacional (exige IA configurada em Configurações → Assistente)' },
      { modulo: 'Tarefas e produtividade', situacao: 'operacional' }, { modulo: 'Financeiro e comissões', situacao: 'operacional (dados reais e de teste separados)' },
      { modulo: 'Importação de relatórios CSV', situacao: 'operacional' }, { modulo: 'TikTok Shop / Shopee / Temu — API', situacao: 'pendente: sem confirmação oficial; modo importação ativo' },
      { modulo: 'Asset Studio e aquisição de assets', situacao: 'operacional (pesquisa em sites é assistida)' }, { modulo: 'Editor de Vídeo e Video Cut', situacao: 'pendente: ainda não existem no Estúdio' },
      { modulo: 'Publicação externa de campanhas', situacao: 'pendente: depende de APIs e da sua aprovação' },
    ],
  };
}));
router.get('/auditoria', h((req) => area(uid(req)).auditoria.slice(-200).reverse()));

// ---------- agentes, tarefas e reuniões ----------
router.get('/agentes', h((req) => { Ag.garantirAgentes(uid(req)); return area(uid(req)).agentes.filter((x) => req.query.todos === 'true' || !x.arquivado).map((x) => Ag.resumoAgente(uid(req), x)); }));
router.post('/agentes', h((req) => Ag.criarAgente(uid(req), req.body || {})));
router.put('/agentes/:id', h((req) => Ag.atualizarAgente(uid(req), req.params.id, req.body || {})));
router.delete('/agentes/:id', h((req) => { Ag.removerAgente(uid(req), req.params.id); return { ok: true }; }));
router.post('/agentes/:id/pausar', h((req) => Ag.pausar(uid(req), req.params.id, req.body?.pausado !== false)));
router.post('/agentes/:id/reconhecer', h((req) => Ag.reconhecer(uid(req), req.params.id)));
router.get('/agentes/:id/conversa', h(async (req) => {
  const ag = Ag.acharAgente(uid(req), req.params.id);
  const { createConversation, getConversation } = await import('../assistant.js');
  const { db } = await import('../db.js');
  if (!ag.conversaId || !getConversation(uid(req), ag.conversaId)) { const bot = db().bots.find((b) => b.id === ag.botId); ag.conversaId = createConversation(uid(req), `Escritório — ${ag.nome}`, bot).id; }
  return { conversaId: ag.conversaId, agente: ag.nome };
}));

router.get('/tarefas', h((req) => Dad.listarTarefas(uid(req), req.query)));
router.post('/tarefas', h((req) => Ag.criarTarefaOrquestrada(uid(req), req.body || {})));
router.put('/tarefas/:id', h((req) => Dad.atualizarTarefa(uid(req), req.params.id, req.body || {})));
router.post('/tarefas/:id/despachar', h(async (req) => { const t = await Ag.despachar(req.user, req.params.id); return t; }));
router.post('/tarefas/:id/revisar', h((req) => Ag.revisar(uid(req), req.params.id, { aprovar: req.body?.aprovar === true, motivo: req.body?.motivo })));
router.post('/tarefas/:id/encaminhar', h((req) => Ag.encaminhar(uid(req), req.params.id, req.body?.agenteId, 'usuario')));
router.post('/tarefas/:id/status', h((req) => Dad.mudarStatusTarefa(uid(req), req.params.id, req.body?.status, { motivo: req.body?.motivo })));
router.get('/departamentos', h(() => Dad.DEPARTAMENTOS));

router.get('/reunioes', h((req) => area(uid(req)).reunioes.slice().reverse()));
router.post('/reunioes', h((req) => Ag.criarReuniao(uid(req), req.body || {})));
router.post('/reunioes/:id/pareceres', h((req) => Ag.pedirPareceres(req.user, req.params.id)));
router.post('/reunioes/:id/decisoes', h((req) => Ag.registrarDecisao(uid(req), req.params.id, { texto: req.body?.texto, aprovadaPeloUsuario: req.body?.aprovadaPeloUsuario })));
router.post('/reunioes/:id/encerrar', h((req) => Ag.encerrarReuniao(uid(req), req.params.id)));

// ---------- produtos e campanhas ----------
router.get('/produtos', h((req) => Dad.listarProdutos(uid(req), { plataforma: req.query.plataforma, status: req.query.status, real: bool(req.query.real) })));
router.post('/produtos', h((req) => Dad.criarProduto(uid(req), req.body || {})));
router.put('/produtos/:id', h((req) => Dad.atualizarProduto(uid(req), req.params.id, req.body || {})));
router.delete('/produtos/:id', h((req) => { Dad.removerProduto(uid(req), req.params.id); return { ok: true }; }));
router.get('/campanhas', h((req) => Dad.listarCampanhas(uid(req))));
router.post('/campanhas', h((req) => Dad.criarCampanha(uid(req), req.body || {})));
router.put('/campanhas/:id', h((req) => Dad.atualizarCampanha(uid(req), req.params.id, req.body || {})));
router.post('/campanhas/:id/itens/:tipo', h((req) => Dad.adicionarItemCampanha(uid(req), req.params.id, req.params.tipo, req.body || {})));

// ---------- financeiro e importação ----------
router.get('/financeiro/resumo', h((req) => Fin.resumo(uid(req), { de: req.query.de || null, ate: req.query.ate || null })));
router.get('/financeiro/lancamentos', h((req) => Fin.listar(uid(req), { plataforma: req.query.plataforma, tipo: req.query.tipo, real: bool(req.query.real) }).slice(0, 500)));
router.post('/financeiro/lancamentos', h((req) => { const r = Fin.registrar(uid(req), { ...req.body, origem: req.body?.origem || 'manual' }); if (r.duplicado) throw erro('Este lançamento já existe (duplicado).', 409); return r.lancamento; }));
router.put('/financeiro/lancamentos/:id/status', h((req) => Fin.mudarStatus(uid(req), req.params.id, req.body?.status)));
router.post('/importacao/previa', h((req) => Imp.previa(String(req.body?.texto || ''), req.body?.mapeamento || null)));
router.post('/importacao', h((req) => Imp.importar(uid(req), { plataforma: req.body?.plataforma, texto: String(req.body?.texto || ''), mapeamento: req.body?.mapeamento || null, arquivo: req.body?.arquivo, real: req.body?.real !== false })));
router.get('/importacoes', h((req) => area(uid(req)).importacoes.slice().reverse()));

// ---------- conectores ----------
router.get('/conectores', h((req) => Con.listar(uid(req))));
router.get('/conectores/unificado', h((req) => Con.unificado(uid(req))));
router.get('/conectores/:id', h((req) => Con.estado(uid(req), req.params.id)));
router.put('/conectores/:id/credenciais', h((req) => Con.salvarCredenciais(uid(req), req.params.id, req.body || {})));
router.post('/conectores/:id/revogar', h((req) => Con.revogar(uid(req), req.params.id)));
router.put('/conectores/:id/checklist/:item', h((req) => Con.marcarChecklist(uid(req), req.params.id, req.params.item, req.body || {})));
router.post('/conectores/:id/sincronizar', h((req) => Con.sincronizar(uid(req), req.params.id)));

// ---------- Asset Studio ----------
router.get('/assets', h((req) => Ast.listar(uid(req), { categoria: req.query.categoria || null, q: req.query.q || '' })));
router.get('/assets/categorias', h(() => ({ categorias: Ast.CATEGORIAS, camadas: Ast.CAMADAS, perspectivas: Ast.PERSPECTIVAS })));
router.post('/assets', upload.single('arquivo'), h((req) => {
  if (!req.file) throw erro('Envie um arquivo PNG.');
  const b = req.body || {};
  const r = Ast.importarPng(uid(req), { dados: req.file.buffer, nome: req.file.originalname, origem: b.origem || 'upload', autor: b.autor, licenca: b.licenca ? { tipo: String(b.licenca).slice(0, 40), usoComercial: b.usoComercial === 'true' ? true : b.usoComercial === 'false' ? false : 'desconhecido', atribuicao: 'desconhecido', evidencia: 'informado pelo usuário' } : null, categoria: b.categoria, camada: b.camada, perspectiva: b.perspectiva });
  if (r.duplicado) return { duplicado: true, asset: r.duplicado };
  return { asset: r.asset };
}));
router.post('/assets/zip', upload.single('arquivo'), h((req) => {
  if (!req.file) throw erro('Envie um arquivo ZIP.');
  const b = req.body || {};
  return Ast.importarZip(uid(req), req.file.buffer, { origem: b.origem || 'upload-zip', autor: b.autor, pacote: req.file.originalname, categoria: b.categoria || null });
}));
router.get('/assets/:id', h((req) => Ast.obter(uid(req), req.params.id)));
router.get('/assets/:id/arquivo', (req, res) => { try { res.set('Cache-Control', 'private, max-age=3600').type('image/png').send(Ast.lerArquivo(uid(req), req.params.id)); } catch (e) { res.status(e.status || 500).json({ error: e.message }); } });
router.put('/assets/:id', h((req) => Ast.atualizarMetadados(uid(req), req.params.id, req.body || {})));
router.delete('/assets/:id', h((req) => { Ast.remover(uid(req), req.params.id); return { ok: true }; }));

router.get('/aquisicao/busca', h((req) => Aq.linksDeBusca(req.query.q)));
router.post('/aquisicao/analisar', h((req) => Aq.analisar(uid(req), { url: String(req.body?.url || ''), licencaPagina: req.body?.licencaPagina || null })));
router.get('/aquisicao/propostas', h((req) => Aq.listarPropostas(uid(req))));
router.post('/aquisicao/:id/aprovar', h((req) => Aq.aprovar(uid(req), req.params.id, { categoria: req.body?.categoria || null, confirmarLicenca: req.body?.confirmarLicenca === true, autor: req.body?.autor })));
router.post('/aquisicao/:id/rejeitar', h((req) => Aq.rejeitar(uid(req), req.params.id)));

// ---------- layouts e personagens ----------
router.get('/layouts', h((req) => Lay.listar(uid(req))));
router.get('/layouts/ativo', h((req) => Lay.ativo(uid(req))));
router.post('/layouts', h((req) => Lay.criar(uid(req), { nome: req.body?.nome, dados: req.body?.dados, ativar: req.body?.ativar !== false })));
router.get('/layouts/:id', h((req) => Lay.obter(uid(req), req.params.id)));
router.put('/layouts/:id', h((req) => Lay.salvar(uid(req), req.params.id, { nome: req.body?.nome, dados: req.body?.dados, versaoBase: req.body?.versaoBase })));
router.post('/layouts/:id/duplicar', h((req) => Lay.duplicar(uid(req), req.params.id)));
router.post('/layouts/:id/ativar', h((req) => { Lay.ativar(uid(req), req.params.id); return { ok: true }; }));
router.delete('/layouts/:id', h((req) => { Lay.remover(uid(req), req.params.id); return { ok: true }; }));
router.get('/personagens', h((req) => Per.listar(uid(req))));
router.post('/personagens', h((req) => Per.criar(uid(req), req.body || {})));
router.put('/personagens/:id', h((req) => Per.atualizar(uid(req), req.params.id, req.body || {})));
router.delete('/personagens/:id', h((req) => { Per.remover(uid(req), req.params.id); return { ok: true }; }));
router.post('/agentes/:id/aparencia', h((req) => Per.vincular(uid(req), req.params.id, req.body?.personagemId || null)));

// ---------- equipe 2.1: ordens do chefe, comunicação interna, documentos, estoque ----------
router.get('/equipe', h(async (req) => { const p = Eq.painelEquipe(uid(req)); const { assistantMode } = await import('../assistant.js'); return { ...p, modoIA: assistantMode() }; }));
router.put('/equipe/config', h((req) => Eq.atualizarConfig(uid(req), req.body || {})));
router.get('/ordens', h((req) => Eq.listarOrdens(uid(req))));
router.post('/ordens', h(async (req, res) => { const o = await Eq.enviarOrdem(req.user, req.body?.texto); res.status(202).json(o); }));
router.post('/ordens/:id/cancelar', h((req) => Eq.cancelarOrdem(uid(req), req.params.id)));
router.get('/mensagens', h((req) => Eq.listarMensagens(uid(req), { depois: req.query.depois, ordemId: req.query.ordem || null, limite: req.query.limite })));
router.get('/documentos', h((req) => Doc.listarDocumentos(uid(req), { ordemId: req.query.ordem || null, tipo: req.query.tipo || null })));
router.get('/documentos/:id', h((req) => Doc.acharDocumento(uid(req), req.params.id)));
router.post('/documentos', h((req) => Doc.criarDocumento(uid(req), { ...(req.body || {}), autor: 'chefe' })));
router.get('/estoque', h((req) => ({ itens: Est.listarItens(uid(req)), movimentos: Est.listarMovimentos(uid(req), { itemId: req.query.item || null }), resumo: Est.resumoEstoque(uid(req)) })));
router.post('/estoque/itens', h((req) => Est.cadastrarItem(uid(req), req.body || {}, 'chefe')));
router.post('/estoque/movimentos', h((req) => Est.movimentar(uid(req), req.body || {}, 'chefe')));

export default router;
