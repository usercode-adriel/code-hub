// ASSET STUDIO (backend): biblioteca permanente de recursos gráficos. Os arquivos originais NUNCA são modificados nem
// sobrescritos: cada importação vira um arquivo novo; o usuário edita só os metadados (manifesto). Origem e licença
// ficam junto do asset. Imagens iguais (mesmo hash) não são importadas duas vezes.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../db.js';
import { area, auditar, erro, txt, oneOf, numero, id, now, save } from './store.js';
import { inspecionarPng, sugerirGrade } from './png.js';
import { extrairPermitidos } from './zip.js';

export const CATEGORIAS = ['tilesets', 'pisos', 'paredes', 'portas', 'janelas', 'moveis', 'equipamentos', 'computadores', 'decoracao', 'plantas', 'avatares', 'spritesheets', 'animacoes', 'efeitos', 'outros'];
export const CAMADAS = ['fundo', 'piso', 'estrutura', 'parede', 'mobiliario', 'objeto', 'personagem', 'efeito', 'interativo'];
export const PERSPECTIVAS = ['isometrica', 'frontal', 'topo', 'outra'];

const dirDe = (userId) => path.join(DATA_DIR, 'commerce-assets', String(userId).replace(/[^\w-]/g, '_'));
export const arquivoDe = (userId, asset) => path.join(dirDe(userId), `${asset.id}.png`);

// ---------- licenças ----------
/** Procura a licença num texto (README/LICENSE/página). Não assume nada: sem evidência clara = "desconhecida". */
export function detectarLicenca(texto) {
  const t = String(texto || '');
  const ev = (m) => (m ? m[0].slice(0, 120) : '');
  let m;
  if ((m = t.match(/\bCC0\b|creative commons zero|public domain|dom[ií]nio p[uú]blico/i))) return { tipo: 'CC0', usoComercial: true, atribuicao: false, evidencia: ev(m) };
  if ((m = t.match(/CC[ -]?BY[ -]?NC[^\n]{0,12}/i))) return { tipo: 'CC-BY-NC', usoComercial: false, atribuicao: true, evidencia: ev(m) };
  if ((m = t.match(/CC[ -]?BY[ -]?SA[^\n]{0,12}/i))) return { tipo: 'CC-BY-SA', usoComercial: true, atribuicao: true, evidencia: ev(m), nota: 'Obras derivadas devem usar a mesma licença.' };
  if ((m = t.match(/CC[ -]?BY[^\n]{0,12}|creative commons attribution/i))) return { tipo: 'CC-BY', usoComercial: true, atribuicao: true, evidencia: ev(m) };
  if ((m = t.match(/\bMIT License\b/i))) return { tipo: 'MIT', usoComercial: true, atribuicao: true, evidencia: ev(m) };
  if ((m = t.match(/\bGPL\b|GNU General Public/i))) return { tipo: 'GPL', usoComercial: 'desconhecido', atribuicao: true, evidencia: ev(m), nota: 'GPL tem condições especiais de redistribuição.' };
  if ((m = t.match(/non[- ]?commercial|n[aã]o comercial|personal use only/i))) return { tipo: 'nao-comercial', usoComercial: false, atribuicao: true, evidencia: ev(m) };
  return { tipo: 'desconhecida', usoComercial: 'desconhecido', atribuicao: 'desconhecido', evidencia: '' };
}

const guessCategoria = (nome) => {
  const n = String(nome).toLowerCase();
  const tabela = [['spritesheet|sheet', 'spritesheets'], ['avatar|character|char|person|npc|player', 'avatares'], ['floor|piso|ground', 'pisos'], ['wall|parede', 'paredes'], ['door|porta', 'portas'], ['window|janela', 'janelas'],
    ['computer|pc|laptop|monitor|screen', 'computadores'], ['plant|tree|flower|planta|vaso', 'plantas'], ['desk|chair|table|sofa|couch|shelf|cabinet|bed|mesa|cadeira|estante', 'moveis'], ['tile', 'tilesets'], ['effect|fx|particle', 'efeitos'], ['anim', 'animacoes']];
  return (tabela.find(([rx]) => new RegExp(rx).test(n)) || [null, 'outros'])[1];
};
const nomeLimpo = (n) => txt(path.basename(String(n)).replace(/\.png$/i, '').replace(/[_-]+/g, ' '), 80) || 'Asset';

function metadadosBase(png, b = {}) {
  const grade = b.categoria === 'spritesheets' || b.categoria === 'avatares' || b.categoria === 'animacoes' ? sugerirGrade(png.largura, png.altura) : null;
  return {
    categoria: oneOf(b.categoria, CATEGORIAS, 'outros'), largura: png.largura, altura: png.altura, transparencia: png.transparencia, proporcao: png.proporcao,
    escala: numero(b.escala, 1) || 1, ancora: { x: numero(b.ancora?.x, 0.5), y: numero(b.ancora?.y, 1) }, perspectiva: oneOf(b.perspectiva, PERSPECTIVAS, 'isometrica'),
    camada: oneOf(b.camada, CAMADAS, 'mobiliario'),
    colisao: { solida: Boolean(b.colisao?.solida), larguraTiles: Math.max(1, Math.round(numero(b.colisao?.larguraTiles, 1))), profundidadeTiles: Math.max(1, Math.round(numero(b.colisao?.profundidadeTiles, 1))) },
    frames: b.frames || grade, animacoes: Array.isArray(b.animacoes) ? b.animacoes : [],
  };
}

/** Importa UM png. Devolve { asset } ou { duplicado } (mesmo conteúdo já existe — nada é sobrescrito). */
export function importarPng(userId, { dados, nome, origem = 'upload', autor = '', licenca = null, licencaUrl = '', pacote = '', ...b }) {
  let png;
  try { png = inspecionarPng(dados); } catch (e) { throw erro(e.message, 400); }
  const hash = crypto.createHash('sha1').update(dados).digest('hex');
  const a = area(userId);
  const igual = a.assets.find((x) => x.hash === hash);
  if (igual) return { duplicado: igual };
  const categoria = oneOf(b.categoria, CATEGORIAS, guessCategoria(nome));
  const lic = licenca || { tipo: 'desconhecida', usoComercial: 'desconhecido', atribuicao: 'desconhecido', evidencia: '' };
  const asset = {
    id: id(), nome: txt(b.nomeExibicao || nomeLimpo(nome), 80), ...metadadosBase(png, { ...b, categoria }), hash, arquivoOriginal: txt(path.basename(String(nome)), 160),
    origem: txt(origem, 300), autor: txt(autor, 120), licenca: lic, licencaUrl: txt(licencaUrl, 400), pacote: txt(pacote, 160), criadoEm: now(), historico: [{ em: now(), acao: 'importado' }],
  };
  fs.mkdirSync(dirDe(userId), { recursive: true });
  fs.writeFileSync(arquivoDe(userId, asset), dados, { flag: 'wx' });   // wx: nunca sobrescreve
  a.assets.push(asset); save();
  auditar(userId, 'asset.importar', { asset: asset.id, origem: asset.origem });
  return { asset };
}

/** Importa um ZIP: só PNG e textos de licença; nada é executado; nomes inseguros são ignorados. */
export function importarZip(userId, buf, { origem = 'upload-zip', autor = '', licenca = null, licencaUrl = '', pacote = '', categoria = null } = {}) {
  let extraido;
  try { extraido = extrairPermitidos(buf); } catch (e) { throw erro(e.message, 400); }
  const { png, textos, ignorados } = extraido;
  if (!png.length) throw erro('O ZIP não tem nenhum PNG utilizável.');
  const licencaDetectada = licenca || detectarLicenca(textos.map((t) => t.texto).join('\n'));
  const criados = []; const duplicados = []; const falhas = [];
  for (const p of png) {
    try {
      const r = importarPng(userId, { dados: p.dados, nome: p.nome, origem, autor, licenca: licencaDetectada, licencaUrl, pacote: pacote || 'zip', categoria: categoria || guessCategoria(p.nome) });
      if (r.asset) criados.push(r.asset); else duplicados.push(r.duplicado.id);
    } catch (e) { falhas.push({ nome: p.nome, motivo: e.message }); }
  }
  return { criados: criados.length, duplicados: duplicados.length, falhas, ignorados, licenca: licencaDetectada, ids: criados.map((c) => c.id) };
}

const EDITAVEIS = ['nome', 'categoria', 'escala', 'ancora', 'perspectiva', 'camada', 'colisao', 'frames', 'animacoes', 'autor', 'licenca', 'licencaUrl', 'origem'];
/** Edita só o manifesto. O arquivo PNG original não é tocado. */
export function atualizarMetadados(userId, aid, patch) {
  const a = obter(userId, aid);
  const antes = JSON.stringify(a);
  if ('nome' in patch) a.nome = txt(patch.nome, 80) || a.nome;
  if ('categoria' in patch) a.categoria = oneOf(patch.categoria, CATEGORIAS, a.categoria);
  if ('escala' in patch) a.escala = Math.min(8, Math.max(0.1, numero(patch.escala, a.escala)));
  if ('ancora' in patch) a.ancora = { x: Math.min(1, Math.max(0, numero(patch.ancora?.x, a.ancora.x))), y: Math.min(1, Math.max(0, numero(patch.ancora?.y, a.ancora.y))) };
  if ('perspectiva' in patch) a.perspectiva = oneOf(patch.perspectiva, PERSPECTIVAS, a.perspectiva);
  if ('camada' in patch) a.camada = oneOf(patch.camada, CAMADAS, a.camada);
  if ('colisao' in patch) a.colisao = { solida: Boolean(patch.colisao?.solida), larguraTiles: Math.max(1, Math.round(numero(patch.colisao?.larguraTiles, a.colisao.larguraTiles))), profundidadeTiles: Math.max(1, Math.round(numero(patch.colisao?.profundidadeTiles, a.colisao.profundidadeTiles))) };
  if ('frames' in patch) {
    const f = patch.frames;
    if (f) {
      const qL = Math.round(numero(f.quadroL, 0)); const qA = Math.round(numero(f.quadroA, 0));
      if (qL < 1 || qA < 1 || qL > a.largura || qA > a.altura) throw erro('Tamanho de quadro inválido para esta imagem.');
      a.frames = { quadroL: qL, quadroA: qA, colunas: Math.floor(a.largura / qL), linhas: Math.floor(a.altura / qA) };
    } else a.frames = null;
  }
  if ('animacoes' in patch) a.animacoes = (Array.isArray(patch.animacoes) ? patch.animacoes : []).slice(0, 40).map((x) => ({
    nome: txt(x.nome, 40), linha: Math.max(0, Math.round(numero(x.linha, 0))), quadros: (Array.isArray(x.quadros) ? x.quadros : []).slice(0, 64).map((q) => Math.max(0, Math.round(numero(q, 0)))), fps: Math.min(60, Math.max(1, numero(x.fps, 8))), direcao: txt(x.direcao, 20) || null, estado: txt(x.estado, 30) || null,
  })).filter((x) => x.nome);
  if ('autor' in patch) a.autor = txt(patch.autor, 120);
  if ('licencaUrl' in patch) a.licencaUrl = txt(patch.licencaUrl, 400);
  if ('origem' in patch) a.origem = txt(patch.origem, 300) || a.origem;
  if ('licenca' in patch && patch.licenca) a.licenca = { tipo: txt(patch.licenca.tipo, 40) || 'desconhecida', usoComercial: [true, false].includes(patch.licenca.usoComercial) ? patch.licenca.usoComercial : 'desconhecido', atribuicao: [true, false].includes(patch.licenca.atribuicao) ? patch.licenca.atribuicao : 'desconhecido', evidencia: txt(patch.licenca.evidencia, 200) };
  if (JSON.stringify(a) !== antes) { a.historico.push({ em: now(), acao: 'metadados' }); save(); }
  return a;
}

export function obter(userId, aid) {
  const a = area(userId).assets.find((x) => x.id === aid);
  if (!a) throw erro('Asset não encontrado.', 404);
  return a;
}
export const listar = (userId, { categoria = null, q = '' } = {}) => area(userId).assets
  .filter((a) => (!categoria || a.categoria === categoria) && (!q || `${a.nome} ${a.origem} ${a.autor}`.toLowerCase().includes(String(q).toLowerCase())))
  .sort((x, y) => y.criadoEm.localeCompare(x.criadoEm));

export function emUso(userId, aid) {
  return area(userId).layouts.some((l) => (l.objetos || []).some((o) => o.assetId === aid) || (l.pisos || []).some((p) => p.assetId === aid))
    || area(userId).personagens.some((p) => p.assetId === aid);
}
export function remover(userId, aid) {
  const a = obter(userId, aid);
  if (emUso(userId, aid)) throw erro('Este asset está em uso em um layout ou personagem. Substitua-o antes de remover.', 409);
  const lista = area(userId).assets; lista.splice(lista.indexOf(a), 1); save();
  fs.rmSync(arquivoDe(userId, a), { force: true });
  auditar(userId, 'asset.remover', { asset: aid });
}
export const lerArquivo = (userId, aid) => fs.readFileSync(arquivoDe(userId, obter(userId, aid)));
