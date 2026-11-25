// ASSET ACQUISITION MANAGER: traz pacotes gráficos gratuitos de fontes conhecidas, com licença verificada e APROVAÇÃO do usuário.
// Fluxo: analisar o link → mostrar licença e prévia → o usuário aprova → importar para o Asset Studio.
// Segurança: só hosts permitidos (também nos redirecionamentos), limite de tamanho e tempo, nada é executado,
// só PNG e textos são aproveitados, nada é sobrescrito, nenhum dado do Hub é enviado ao site de origem.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DATA_DIR } from '../db.js';
import { area, auditar, erro, txt, id, now, save } from './store.js';
import { extrairPermitidos, LIMITES } from './zip.js';
import { inspecionarPng } from './png.js';
import { detectarLicenca, importarZip } from './assets.js';

const HOSTS = ['kenney.nl', 'opengameart.org', 'itch.io', 'github.com', 'raw.githubusercontent.com', 'codeload.github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'];
const MAX_PAGINA = 1_500_000;
const MAX_ZIP = LIMITES.total;
const TTL_MS = 24 * 3600 * 1000;

export function hostPermitido(url) {
  let u; try { u = new URL(url); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const h = u.hostname.toLowerCase();
  return HOSTS.some((d) => h === d || h.endsWith(`.${d}`));
}

const pendentes = (userId) => path.join(DATA_DIR, 'commerce-assets', String(userId).replace(/[^\w-]/g, '_'), '_pendentes');

/** Links de busca nas fontes (fluxo assistido: abra, escolha o pacote e cole o link aqui). Não raspa nenhuma página. */
export function linksDeBusca(termo) {
  const q = encodeURIComponent(txt(termo, 80) || 'isometric office');
  return [
    { fonte: 'Kenney', url: 'https://kenney.nl/assets', nota: 'Pacotes da Kenney costumam ser CC0 (domínio público). Confira a licença na página de cada pacote.' },
    { fonte: 'OpenGameArt', url: `https://opengameart.org/art-search-advanced?keys=${q}&field_art_type_tid%5B%5D=9`, nota: 'A licença varia por item (CC0, CC-BY, CC-BY-SA, GPL...). Verifique cada um.' },
    { fonte: 'itch.io (assets grátis)', url: `https://itch.io/game-assets/free?q=${q}`, nota: 'A licença é definida por cada autor. O download no itch.io costuma exigir a página do autor.' },
    { fonte: 'GitHub', url: `https://github.com/search?q=${q}+isometric+assets&type=repositories`, nota: 'Só use repositórios com arquivo de licença verificável.' },
  ];
}

async function baixar(url, maxBytes, fetchImpl = fetch) {
  let atual = url;
  for (let salto = 0; salto < 5; salto++) {
    if (!hostPermitido(atual)) throw erro(`Endereço não permitido: ${new URL(atual).hostname}. Fontes aceitas: ${HOSTS.join(', ')}.`, 400);
    const r = await fetchImpl(atual, { redirect: 'manual', signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'Codeniac-AssetManager/1.0', Accept: '*/*' } });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { atual = new URL(r.headers.get('location'), atual).toString(); continue; }
    if (!r.ok) throw erro(`O site respondeu ${r.status}.`, 502);
    const declarado = Number(r.headers.get('content-length') || 0);
    if (declarado > maxBytes) throw erro(`O arquivo é grande demais (limite ${Math.round(maxBytes / 1048576)} MB).`, 413);
    const partes = []; let total = 0;
    for await (const parte of r.body) { total += parte.length; if (total > maxBytes) throw erro(`O arquivo passou do limite de ${Math.round(maxBytes / 1048576)} MB.`, 413); partes.push(Buffer.from(parte)); }
    return { dados: Buffer.concat(partes), tipo: r.headers.get('content-type') || '', url: atual };
  }
  throw erro('Redirecionamentos demais.', 502);
}

const ehZip = (b) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b;
const textoPagina = (html) => String(html).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

function limpar(userId) {
  const a = area(userId);
  const velhas = a.aquisicoes.filter((x) => Date.now() - Date.parse(x.criadaEm) > TTL_MS && x.estado === 'aguardando_aprovacao');
  for (const v of velhas) { fs.rmSync(path.join(pendentes(userId), `${v.id}.zip`), { force: true }); v.estado = 'expirada'; }
  if (velhas.length) save();
}

/**
 * Analisa um link. Página → licença e links de .zip encontrados. Pacote .zip → prévia e proposta aguardando aprovação.
 * Nada é importado aqui.
 */
export async function analisar(userId, { url, licencaPagina = null, fetchImpl = fetch } = {}) {
  const a = area(userId); a.aquisicoes ??= [];
  limpar(userId);
  if (!hostPermitido(url)) throw erro(`Endereço não permitido. Use https e uma das fontes: ${HOSTS.join(', ')}.`);
  const r = await baixar(url, MAX_ZIP, fetchImpl);
  if (!ehZip(r.dados)) {
    if (r.dados.length > MAX_PAGINA) throw erro('Página grande demais.');
    const html = r.dados.toString('utf8');
    const texto = textoPagina(html);
    const bloco = (texto.match(/licen[sc][ea][^.]{0,200}/i) || [''])[0];
    const links = [...html.matchAll(/href=["']([^"']+\.zip[^"']*)["']/gi)].map((m) => { try { return new URL(m[1], r.url).toString(); } catch { return null; } }).filter((u) => u && hostPermitido(u));
    return { tipo: 'pagina', url: r.url, licenca: detectarLicenca(`${bloco}\n${texto.slice(0, 20000)}`), pacotes: [...new Set(links)].slice(0, 20), aviso: links.length ? null : 'Nenhum link .zip permitido foi encontrado nesta página. Abra o pacote no site e cole o link direto do .zip.' };
  }
  // é um pacote: extrai SÓ para prévia, na memória
  let extraido;
  try { extraido = extrairPermitidos(r.dados); } catch (e) { throw erro(e.message, 400); }
  const { png, textos, ignorados } = extraido;
  if (!png.length) throw erro('O pacote não tem nenhum PNG utilizável.');
  const licenca = licencaPagina && licencaPagina.tipo !== 'desconhecida' ? licencaPagina : detectarLicenca(textos.map((t) => t.texto).join('\n'));
  const arquivos = []; const previa = [];
  for (const p of png) {
    try { const i = inspecionarPng(p.dados); arquivos.push({ nome: p.nome, largura: i.largura, altura: i.altura, transparencia: i.transparencia }); if (previa.length < 12 && p.dados.length <= 60_000) previa.push({ nome: p.nome, base64: p.dados.toString('base64') }); }
    catch { ignorados.push({ nome: p.nome, motivo: 'PNG inválido' }); }
  }
  const pid = id();
  fs.mkdirSync(pendentes(userId), { recursive: true });
  fs.writeFileSync(path.join(pendentes(userId), `${pid}.zip`), r.dados, { flag: 'wx' });
  const prop = { id: pid, url: r.url, estado: 'aguardando_aprovacao', licenca, totalPng: arquivos.length, tamanho: r.dados.length, hash: crypto.createHash('sha1').update(r.dados).digest('hex'), ignorados: ignorados.slice(0, 50), criadaEm: now() };
  a.aquisicoes.push(prop); save();
  auditar(userId, 'aquisicao.analisar', { proposta: pid, url: r.url, licenca: licenca.tipo });
  return { tipo: 'pacote', ...prop, arquivos: arquivos.slice(0, 200), previa };
}

export const listarPropostas = (userId) => (area(userId).aquisicoes ??= []).slice().reverse();

/** O usuário aprovou: importa para o Asset Studio, com origem e licença registradas. Licença não comercial é recusada. */
export function aprovar(userId, pid, { categoria = null, confirmarLicenca = false, autor = '' } = {}) {
  const a = area(userId); const p = (a.aquisicoes ??= []).find((x) => x.id === pid);
  if (!p) throw erro('Proposta não encontrada.', 404);
  if (p.estado !== 'aguardando_aprovacao') throw erro(`Esta proposta já está ${p.estado}.`, 409);
  if (p.licenca.usoComercial === false) throw erro(`A licença (${p.licenca.tipo}) não permite uso comercial. O Commerce Office é um ambiente comercial: este pacote não será importado.`, 403);
  if (p.licenca.usoComercial !== true && confirmarLicenca !== true) throw erro('A licença não foi identificada com segurança. Confira a licença no site e confirme que o uso comercial é permitido.', 409);
  const arq = path.join(pendentes(userId), `${p.id}.zip`);
  if (!fs.existsSync(arq)) throw erro('O pacote pendente expirou. Analise o link de novo.', 410);
  const r = importarZip(userId, fs.readFileSync(arq), { origem: p.url, autor, licenca: { ...p.licenca, confirmadaPeloUsuario: p.licenca.usoComercial !== true }, licencaUrl: p.url, pacote: p.url.split('/').pop() || 'pacote', categoria });
  fs.rmSync(arq, { force: true });
  p.estado = 'importada'; p.importadaEm = now(); p.resultado = { criados: r.criados, duplicados: r.duplicados }; save();
  auditar(userId, 'aquisicao.aprovar', { proposta: pid, criados: r.criados });
  return { ...r, proposta: p.id };
}

export function rejeitar(userId, pid) {
  const p = (area(userId).aquisicoes ??= []).find((x) => x.id === pid);
  if (!p) throw erro('Proposta não encontrada.', 404);
  fs.rmSync(path.join(pendentes(userId), `${p.id}.zip`), { force: true });
  p.estado = 'rejeitada'; save(); auditar(userId, 'aquisicao.rejeitar', { proposta: pid });
  return p;
}
