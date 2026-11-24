// NOTÍCIAS INTERNACIONAIS EM TEMPO REAL: busca feeds RSS públicos no servidor, guarda em cache e devolve manchetes reais,
// com fonte, categoria e link. Nada é inventado: se um feed falha, os outros continuam; se todos falham, a lista vem vazia
// e a tela avisa. Os feeds podem ser trocados por TECH_FEEDS (URLs separadas por vírgula).
// Também abre a matéria dentro do sistema (leitor): o servidor baixa a página e entrega só o texto, a imagem e o link original.
// Por segurança, o leitor só abre links que vieram dos feeds (nunca um endereço digitado pelo usuário).
import crypto from 'node:crypto';
import express from 'express';
import { logger } from './log.js';

const router = express.Router();
export const CATEGORIAS = { tecnologia: 'Tecnologia', ia: 'IA', software: 'Software', ecommerce: 'E-commerce', negocios: 'Negócios' };
const FEEDS_PADRAO = [
  { nome: 'TechCrunch', url: 'https://techcrunch.com/feed/', cat: 'tecnologia' },
  { nome: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', cat: 'tecnologia' },
  { nome: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab', cat: 'tecnologia' },
  { nome: 'Wired', url: 'https://www.wired.com/feed/rss', cat: 'tecnologia' },
  { nome: 'Engadget', url: 'https://www.engadget.com/rss.xml', cat: 'tecnologia' },
  { nome: 'The Next Web', url: 'https://thenextweb.com/feed', cat: 'tecnologia' },
  { nome: 'VentureBeat AI', url: 'https://venturebeat.com/category/ai/feed/', cat: 'ia' },
  { nome: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/', cat: 'ia' },
  { nome: 'The Decoder', url: 'https://the-decoder.com/feed/', cat: 'ia' },
  { nome: 'Hacker News', url: 'https://hnrss.org/frontpage', cat: 'software' },
  { nome: 'InfoQ', url: 'https://feed.infoq.com/', cat: 'software' },
  { nome: 'DEV Community', url: 'https://dev.to/feed', cat: 'software' },
  { nome: 'Practical Ecommerce', url: 'https://www.practicalecommerce.com/feed', cat: 'ecommerce' },
  { nome: 'Shopify Blog', url: 'https://www.shopify.com/blog.atom', cat: 'ecommerce' },
  { nome: 'Modern Retail', url: 'https://www.modernretail.co/feed/', cat: 'ecommerce' },
  { nome: 'Fast Company', url: 'https://www.fastcompany.com/latest/rss', cat: 'negocios' },
  { nome: 'Product Hunt', url: 'https://www.producthunt.com/feed', cat: 'negocios' },
];
const TTL_MS = 3 * 60 * 1000;          // as manchetes são refeitas no máximo a cada 3 minutos
const MIN_FORCAR_MS = 20 * 1000;       // o botão "atualizar" não pode martelar as fontes
const LIMITE = 80;
let cache = { em: 0, itens: [], fontes: [] };

/** zera o cache (usado nos testes) */
export function reiniciarCache() { cache = { em: 0, itens: [], fontes: [] }; }

export function feeds() {
  const env = (process.env.TECH_FEEDS || '').split(',').map((u) => u.trim()).filter(Boolean);
  // formato: URL, ou "Nome|URL" para dar um nome à fonte
  return env.length ? env.map((item) => {
    const [nome, url] = item.includes('|') ? item.split('|').map((x) => x.trim()) : [null, item];
    return { nome: nome || new URL(url).hostname.replace(/^www\./, ''), url, cat: 'tecnologia' };
  }) : FEEDS_PADRAO;
}

const decodificar = (s) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
const limpar = (s) => decodificar(String(s || '')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (bloco, nome) => { const m = bloco.match(new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`, 'i')); return m ? m[1] : ''; };

// lê um feed RSS 2.0 (<item>) ou Atom (<entry>). Devolve itens crus, sem fonte.
export function lerRss(xml) {
  const blocos = [...String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  const entradas = blocos.length ? blocos : [...String(xml).matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map((m) => m[1]);
  return entradas.map((b) => {
    const link = limpar(tag(b, 'link')) || (b.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? '');
    const imagem = b.match(/<media:content[^>]*url="([^"]+)"/i)?.[1] || b.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image/i)?.[1] || b.match(/<img[^>]+src="([^"]+)"/i)?.[1] || null;
    return {
      titulo: limpar(tag(b, 'title')), link: decodificar(link).trim(),
      resumo: limpar(tag(b, 'description') || tag(b, 'summary') || tag(b, 'content')).slice(0, 320),
      publicado: limpar(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated')), imagem: imagem ? decodificar(imagem) : null,
    };
  }).filter((i) => i.titulo && /^https?:\/\//.test(i.link));
}

async function buscarFeed(f, fetchImpl) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetchImpl(f.url, { signal: ctrl.signal, headers: { 'User-Agent': 'Codeniac/2.4 (leitor de manchetes)' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return lerRss(await r.text()).map((i) => ({ ...i, fonte: f.nome, categoria: f.cat || 'tecnologia' }));
  } finally { clearTimeout(t); }
}

const idDe = (link) => crypto.createHash('sha1').update(link).digest('hex').slice(0, 12);

// junta, remove repetidos (mesmo link), ordena do mais novo para o mais antigo
export function juntar(listas) {
  const vistos = new Set(); const itens = [];
  for (const i of listas.flat()) {
    if (vistos.has(i.link)) continue; vistos.add(i.link);
    const ts = Date.parse(i.publicado); itens.push({ ...i, ts: Number.isFinite(ts) ? ts : 0 });
  }
  itens.sort((a, b) => b.ts - a.ts);
  return itens.slice(0, LIMITE).map((i) => ({ id: idDe(i.link), titulo: i.titulo, resumo: i.resumo, fonte: i.fonte, categoria: i.categoria || 'tecnologia', link: i.link, imagem: i.imagem, publicado: i.ts ? new Date(i.ts).toISOString() : null }));
}

export async function manchetes({ fetchImpl = fetch, forcar = false } = {}) {
  if (!forcar && cache.itens.length && Date.now() - cache.em < TTL_MS) return cache;
  const lista = feeds();
  const resultados = await Promise.allSettled(lista.map((f) => buscarFeed(f, fetchImpl)));
  const fontes = lista.map((f, k) => ({ nome: f.nome, categoria: f.cat || 'tecnologia', ok: resultados[k].status === 'fulfilled', erro: resultados[k].status === 'rejected' ? String(resultados[k].reason?.message || 'falha').slice(0, 120) : null }));
  for (const f of fontes.filter((x) => !x.ok)) logger.warn(`[tech-news] ${f.nome}: ${f.erro}`);
  const itens = juntar(resultados.filter((r) => r.status === 'fulfilled').map((r) => r.value));
  // se nada chegou agora, mantém o último resultado bom em vez de esvaziar a tela
  if (itens.length) cache = { em: Date.now(), itens, fontes };
  else if (cache.itens.length) cache = { ...cache, fontes };
  else cache = { em: Date.now(), itens: [], fontes };
  return cache;
}

// ---------- leitor: a matéria dentro do sistema ----------
const MAX_HTML = 1_500_000;
const hostPrivado = (h) => /^(localhost|0\.0\.0\.0|\[?::1\]?)$/i.test(h) || /^(127|10)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /\.(local|internal)$/i.test(h);

export function extrairArtigo(html) {
  let h = String(html).slice(0, MAX_HTML);
  const meta = (nome) => decodificar((h.match(new RegExp(`<meta[^>]+(?:property|name)=["']${nome}["'][^>]*content=["']([^"']*)["']`, 'i')) || h.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${nome}["']`, 'i')) || [])[1] || '');
  const titulo = meta('og:title') || limpar(tag(h, 'title'));
  const imagem = meta('og:image') || null;
  h = h.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|noscript|svg|iframe|form|nav|header|footer|aside|figure)\b[\s\S]*?<\/\1>/gi, '');
  const corpo = tag(h, 'article') || tag(h, 'main') || tag(h, 'body') || h;
  const blocos = [];
  let total = 0;
  for (const m of corpo.matchAll(/<(h2|h3|p|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const t = limpar(m[2]);
    const tipo = m[1].toLowerCase();
    const minimo = tipo === 'p' || tipo === 'blockquote' ? 40 : tipo === 'li' ? 25 : 4;
    if (t.length < minimo || /^(share|subscribe|sign up|advertisement|read more|related)\b/i.test(t)) continue;
    blocos.push({ t: tipo === 'h2' || tipo === 'h3' ? 'h' : tipo === 'li' ? 'li' : tipo === 'blockquote' ? 'q' : 'p', texto: t.slice(0, 1200) });
    total += t.length;
    if (blocos.length >= 90 || total > 24000) break;
  }
  return { titulo: titulo.slice(0, 300), imagem: imagem && /^https?:\/\//.test(imagem) ? imagem : null, blocos };
}

export async function lerArtigo(id, { fetchImpl = fetch } = {}) {
  const item = cache.itens.find((i) => i.id === id);
  if (!item) throw Object.assign(new Error('Notícia não encontrada. Atualize a lista e tente de novo.'), { status: 404 });
  const url = new URL(item.link);
  if (!/^https?:$/.test(url.protocol) || hostPrivado(url.hostname)) throw Object.assign(new Error('Endereço não permitido.'), { status: 400 });
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetchImpl(item.link, { signal: ctrl.signal, redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Codeniac/2.4; leitor)', Accept: 'text/html,application/xhtml+xml' } });
    if (!r.ok) throw new Error(`o site respondeu ${r.status}`);
    if (r.url && hostPrivado(new URL(r.url).hostname)) throw new Error('Endereço não permitido.');
    if (!/html/i.test(r.headers?.get?.('content-type') || 'text/html')) throw new Error('a página não é um texto HTML');
    const a = extrairArtigo(await r.text());
    return { id, titulo: a.titulo || item.titulo, imagem: a.imagem || item.imagem, fonte: item.fonte, categoria: item.categoria, publicado: item.publicado, link: item.link, resumo: item.resumo, blocos: a.blocos, semTexto: a.blocos.filter((b) => b.t === 'p').length < 2 };
  } catch (err) {
    // sem conseguir ler (site bloqueia, exige login, etc.): devolve o resumo do feed e o link original
    return { id, titulo: item.titulo, imagem: item.imagem, fonte: item.fonte, categoria: item.categoria, publicado: item.publicado, link: item.link, resumo: item.resumo, blocos: [], semTexto: true, motivo: String(err.message || 'falha').slice(0, 120) };
  } finally { clearTimeout(t); }
}

// ---------- insights: tendências calculadas das manchetes de agora ----------
const TEMAS = [
  ['IA e agentes', /\b(ai|a\.i\.|artificial intelligence|llm|gpt|chatgpt|claude|gemini|openai|anthropic|copilot|agent|agents|machine learning|generative)\b/i, 'Inteligência artificial domina a pauta: vale testar ferramentas de IA no seu fluxo de trabalho.'],
  ['E-commerce e varejo', /\b(e-?commerce|shopify|retail|checkout|marketplace|amazon|shopping|dropship\w*|merchant)\b/i, 'Movimento forte em e-commerce: observe checkout, logística e marketplaces.'],
  ['Segurança e privacidade', /\b(security|breach|hack\w*|privacy|vulnerabilit\w*|ransomware|leak\w*|cyber\w*)\b/i, 'Segurança em alta: revise senhas, acessos e backups dos seus sistemas.'],
  ['Startups e investimento', /\b(startup|raises|funding|series [a-d]|venture|valuation|ipo|acquires?|acquisition)\b/i, 'Capital circulando: startups e aquisições mostram onde o mercado aposta.'],
  ['Chips e hardware', /\b(chip|nvidia|gpu|processor|semiconductor|hardware|robot\w*|device|laptop|phone)\b/i, 'Hardware e chips aparecem muito: a base de IA depende deles.'],
  ['Apps e produtos', /\b(app|apps|launch\w*|release\w*|update|feature|beta|rollout)\b/i, 'Muitos lançamentos de apps e recursos: bom momento para descobrir ideias de produto.'],
  ['Regulação e política', /\b(regulat\w*|law|lawsuit|court|eu|ban|antitrust|fcc|ftc|policy|government)\b/i, 'Regras e disputas legais podem mudar o que plataformas e apps podem fazer.'],
];
export function calcularInsights(itens) {
  const total = itens.length || 1;
  return TEMAS.map(([nome, rx, dica]) => {
    const achados = itens.filter((i) => rx.test(`${i.titulo} ${i.resumo || ''}`));
    return { tema: nome, qtd: achados.length, pct: Math.round((achados.length / total) * 100), dica, exemplo: achados[0] ? { titulo: achados[0].titulo, fonte: achados[0].fonte, id: achados[0].id } : null };
  }).filter((t) => t.qtd > 0).sort((a, b) => b.qtd - a.qtd).slice(0, 4);
}

router.get('/', async (req, res) => {
  // o botão "atualizar" respeita um intervalo mínimo, para não martelar as fontes
  const r = await manchetes({ forcar: req.query.forcar === '1' && Date.now() - cache.em > MIN_FORCAR_MS });
  res.json({ atualizado: r.em ? new Date(r.em).toISOString() : null, itens: r.itens, fontes: r.fontes, categorias: CATEGORIAS });
});

router.get('/artigo/:id', async (req, res) => {
  try { res.json(await lerArtigo(String(req.params.id).replace(/[^a-f0-9]/gi, '').slice(0, 24))); }
  catch (e) { res.status(e.status || 500).json({ error: e.message }); }
});

router.get('/insights', async (req, res) => {
  const r = await manchetes();
  res.json({ atualizado: r.em ? new Date(r.em).toISOString() : null, total: r.itens.length, temas: calcularInsights(r.itens) });
});

export default router;
