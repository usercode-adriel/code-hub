// CONECTORES DE MARKETPLACE. Cada plataforma tem o seu conector independente, com o seu estado, credenciais, logs e histórico.
// Regra de honestidade: nada é simulado. Se a API de uma plataforma não foi verificada ou não está liberada, o conector diz isso
// e o caminho operacional é a importação de relatórios (CSV) e o lançamento manual. Credenciais ficam no .env do servidor
// (fora do banco e dos backups) e nunca voltam para o navegador.
import { setEnvVar } from '../envfile.js';
import { area, auditar, erro, txt, now, id, save } from './store.js';
import { resumo } from './finance.js';

const DOC = {
  tiktokAfiliado: 'https://developers.tiktok.com/blog/2024-tiktok-shop-affiliate-apis-launch-developer-opportunity',
  tiktokEscopos: 'https://developers.tiktok.com/docs/en/scopes-overview',
};

// o que cada plataforma poderia oferecer × o que está disponível em cada modo. Estados:
// 'nao_verificado' = não confirmado em documentação oficial; 'possivel' = viável se o relatório trouxer a coluna;
// 'manual' = só por lançamento manual; 'indisponivel' = não existe nesse modo.
const DADOS = ['perfil', 'produtosVitrine', 'produtosPromovidos', 'pedidosAfiliado', 'comissoesEstimadas', 'comissoesConfirmadas', 'comissoesRecebidas', 'historicoVendas', 'metricas', 'desempenhoCampanhas', 'desempenhoVideos'];
const ROTULO = { perfil: 'Perfil do criador', produtosVitrine: 'Produtos da vitrine', produtosPromovidos: 'Produtos promovidos', pedidosAfiliado: 'Pedidos de afiliados', comissoesEstimadas: 'Comissões estimadas', comissoesConfirmadas: 'Comissões confirmadas', comissoesRecebidas: 'Comissões recebidas', historicoVendas: 'Histórico de vendas', metricas: 'Métricas disponíveis', desempenhoCampanhas: 'Desempenho de campanhas', desempenhoVideos: 'Desempenho de vídeos' };
const porImportacao = new Set(['pedidosAfiliado', 'comissoesEstimadas', 'comissoesConfirmadas', 'comissoesRecebidas', 'historicoVendas']);
const capacidades = () => DADOS.map((d) => ({ dado: d, nome: ROTULO[d], api: 'nao_verificado', importacao: porImportacao.has(d) ? 'possivel' : 'manual', frescor: 'defasado (importação) — sem dados em tempo real' }));

export const CONECTORES = {
  tiktokshop: {
    id: 'tiktokshop', nome: 'TikTok Shop (criador afiliado)', classe: 'TikTokShopConnector', pais: 'Brasil',
    credenciais: ['APP_KEY', 'APP_SECRET', 'ACCESS_TOKEN', 'REFRESH_TOKEN'],
    nota: 'Conta de criador afiliado (Central do Criador). Não usa Seller OAuth no lugar da autorização de criador, nem scraping, cookies ou senhas.',
    checklist: [
      ['elegibilidadeBR', 'Elegibilidade brasileira para Creator Authorization', 'Não confirmado em documentação oficial. Fontes de terceiros divergem sobre o Brasil.'],
      ['affiliateApis', 'Disponibilidade das Affiliate APIs', 'O blog oficial descreve Affiliate APIs voltadas a vendedores/parceiros (campanhas, busca de criadores, links).'],
      ['escopos', 'Escopos de autorização necessários', 'Os nomes exatos dos escopos de pedidos/comissões de afiliado não foram localizados na documentação.'],
      ['partnerCenter', 'Partner Center, allowlist ou aprovação', 'Necessário, em geral, criar app no Partner Center; se há allowlist para criadores no Brasil, não foi confirmado.'],
      ['dadosConsultaveis', 'Quais dados podem ser consultados', 'Depende dos escopos liberados. Até confirmar, tudo cai em importação ou lançamento manual.'],
      ['vendedorXCriador', 'Diferença entre APIs de vendedor e de criador afiliado', 'As APIs de vendedor (Seller) não substituem a autorização de criador.'],
      ['exportacao', 'Exportação de relatórios da Central do Criador', 'Não foi confirmada exportação CSV nativa no Brasil; confira o menu da Central do Criador.'],
    ],
    documentacao: [DOC.tiktokAfiliado, DOC.tiktokEscopos],
  },
  shopee: {
    id: 'shopee', nome: 'Shopee', classe: 'ShopeeConnector', pais: 'Brasil',
    credenciais: ['PARTNER_ID', 'PARTNER_KEY', 'ACCESS_TOKEN'],
    nota: 'API de afiliados da Shopee não foi pesquisada nesta fase: tratada como não verificada. Operacional por importação e lançamento manual.',
    checklist: [['apiAfiliados', 'Existência e liberação de API de afiliados', 'Não verificado.'], ['exportacao', 'Exportação de relatórios de afiliado', 'Não verificado.']],
    documentacao: [],
  },
  temu: {
    id: 'temu', nome: 'Temu', classe: 'TemuConnector', pais: 'Brasil',
    credenciais: ['APP_KEY', 'APP_SECRET', 'ACCESS_TOKEN'],
    nota: 'API pública de afiliados da Temu não foi confirmada: tratada como não verificada. Operacional por importação e lançamento manual.',
    checklist: [['apiAfiliados', 'Existência e liberação de API de afiliados', 'Não verificado.'], ['exportacao', 'Exportação de relatórios de afiliado', 'Não verificado.']],
    documentacao: [],
  },
};

const envNome = (plat, campo) => `COMMERCE_${plat.toUpperCase()}_${campo}`;
const configuradas = (plat) => CONECTORES[plat].credenciais.filter((c) => process.env[envNome(plat, c)]);

function estadoSalvo(userId, plat) {
  const a = area(userId);
  const base = a.conectores[plat] ??= { modo: 'importacao', status: 'importacao', logs: [], ultimaSincronizacao: null, checklist: {} };
  for (const [k] of CONECTORES[plat].checklist) base.checklist[k] ??= { status: 'nao_verificado', nota: '' };
  return base;
}

function log(userId, plat, nivel, mensagem) {
  const e = estadoSalvo(userId, plat);
  e.logs.push({ id: id(), em: now(), nivel, mensagem: txt(mensagem, 300) });
  if (e.logs.length > 200) e.logs.splice(0, e.logs.length - 200);
  save();
}

export function estado(userId, plat) {
  const def = CONECTORES[plat];
  if (!def) throw erro('Plataforma desconhecida.', 404);
  const e = estadoSalvo(userId, plat);
  const conf = configuradas(plat);
  return {
    id: def.id, nome: def.nome, classe: def.classe, pais: def.pais, nota: def.nota, documentacao: def.documentacao,
    modo: e.modo, status: e.status, ultimaSincronizacao: e.ultimaSincronizacao,
    credenciais: def.credenciais.map((c) => ({ campo: c, configurado: conf.includes(c) })),   // nunca devolve o valor
    capacidades: capacidades(),
    checklist: def.checklist.map(([k, nome, nota]) => ({ id: k, nome, referencia: nota, ...e.checklist[k] })),
    operacional: { api: 'pendente: aguardando confirmação oficial e credenciais', importacaoCsv: 'operacional', lancamentoManual: 'operacional' },
    logs: e.logs.slice(-30).reverse(),
  };
}

export const listar = (userId) => Object.keys(CONECTORES).map((p) => estado(userId, p));

/** Visão unificada: o estado de cada plataforma + o resumo financeiro real dela. Não presume que os campos sejam iguais. */
export function unificado(userId) {
  const fin = resumo(userId).real.porPlataforma;
  return Object.keys(CONECTORES).map((p) => {
    const e = estado(userId, p);
    const f = fin.find((x) => x.nome === p);
    return { id: p, nome: e.nome, modo: e.modo, status: e.status, financeiro: f || null, ultimaSincronizacao: e.ultimaSincronizacao };
  });
}

export function salvarCredenciais(userId, plat, valores = {}) {
  const def = CONECTORES[plat]; if (!def) throw erro('Plataforma desconhecida.', 404);
  let n = 0;
  for (const c of def.credenciais) {
    const v = typeof valores[c] === 'string' ? valores[c].trim() : '';
    if (v) { if (/[\r\n]/.test(v) || v.length > 2000) throw erro(`Valor inválido em ${c}.`); setEnvVar(envNome(plat, c), v); n++; }
  }
  const e = estadoSalvo(userId, plat);
  if (n) { e.modo = 'api'; e.status = 'aguardando_autorizacao'; }
  save(); log(userId, plat, 'info', `Credenciais salvas (${n} campo(s)). A sincronização por API só funciona depois da confirmação oficial.`);
  auditar(userId, 'conector.credenciais', { plataforma: plat, campos: n });
  return estado(userId, plat);
}

export function revogar(userId, plat) {
  const def = CONECTORES[plat]; if (!def) throw erro('Plataforma desconhecida.', 404);
  for (const c of def.credenciais) setEnvVar(envNome(plat, c), '');
  const e = estadoSalvo(userId, plat);
  e.modo = 'importacao'; e.status = 'revogado'; save();
  log(userId, plat, 'aviso', 'Acesso revogado: credenciais removidas do servidor.');
  auditar(userId, 'conector.revogar', { plataforma: plat });
  return estado(userId, plat);
}

export function marcarChecklist(userId, plat, item, { status, nota } = {}) {
  const def = CONECTORES[plat]; if (!def) throw erro('Plataforma desconhecida.', 404);
  if (!def.checklist.some(([k]) => k === item)) throw erro('Item inexistente.', 404);
  const e = estadoSalvo(userId, plat);
  e.checklist[item] = { status: ['nao_verificado', 'confirmado', 'indisponivel'].includes(status) ? status : 'nao_verificado', nota: txt(nota, 400) };
  save(); auditar(userId, 'conector.checklist', { plataforma: plat, item, status });
  return estado(userId, plat);
}

/** Sincronização por API. Só existe quando a API estiver confirmada e implementada; até lá, diz a verdade. */
export async function sincronizar(userId, plat) {
  const def = CONECTORES[plat]; if (!def) throw erro('Plataforma desconhecida.', 404);
  const faltam = def.credenciais.filter((c) => !process.env[envNome(plat, c)]);
  if (faltam.length) { log(userId, plat, 'erro', `Sincronização recusada: faltam credenciais (${faltam.join(', ')}).`); throw erro(`Faltam credenciais: ${faltam.join(', ')}. Use a importação de relatórios enquanto isso.`, 409); }
  log(userId, plat, 'erro', 'Sincronização por API não implementada: aguardando confirmação oficial dos endpoints e escopos.');
  const e = estadoSalvo(userId, plat); e.status = 'erro'; save();
  throw erro('A sincronização por API desta plataforma ainda não está disponível (pendente de confirmação oficial). Use a importação de relatórios.', 501);
}
