// NOTÍCIAS DE TECNOLOGIA EM TEMPO REAL: busca feeds RSS públicos (e o feed da Hacker News) no servidor, guarda em cache
// e devolve manchetes reais, com fonte e link. Nada é inventado: se um feed falha, os outros continuam; se todos falham,
// a lista vem vazia e a tela avisa. Os feeds podem ser trocados por TECH_FEEDS (URLs separadas por vírgula).
import express from 'express';
import { logger } from './log.js';

const router = express.Router();
const FEEDS_PADRAO = [
  { nome: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
  { nome: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
  { nome: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/technology-lab' },
  { nome: 'Hacker News', url: 'https://hnrss.org/frontpage' },
  { nome: 'Wired', url: 'https://www.wired.com/feed/rss' },
];
const TTL_MS = 10 * 60 * 1000;
const LIMITE = 40;
let cache = { em: 0, itens: [], fontes: [] };

export function feeds() {
  const env = (process.env.TECH_FEEDS || '').split(',').map((u) => u.trim()).filter(Boolean);
  // formato: URL, ou "Nome|URL" para dar um nome à fonte
  return env.length ? env.map((item) => {
    const [nome, url] = item.includes('|') ? item.split('|').map((x) => x.trim()) : [null, item];
    return { nome: nome || new URL(url).hostname.replace(/^www\./, ''), url };
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
    const r = await fetchImpl(f.url, { signal: ctrl.signal, headers: { 'User-Agent': 'Codeniac/2.3 (leitor de manchetes)' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return lerRss(await r.text()).map((i) => ({ ...i, fonte: f.nome }));
  } finally { clearTimeout(t); }
}

// junta, remove repetidos (mesmo link), ordena do mais novo para o mais antigo
export function juntar(listas) {
  const vistos = new Set(); const itens = [];
  for (const i of listas.flat()) {
    if (vistos.has(i.link)) continue; vistos.add(i.link);
    const ts = Date.parse(i.publicado); itens.push({ ...i, ts: Number.isFinite(ts) ? ts : 0 });
  }
  itens.sort((a, b) => b.ts - a.ts);
  return itens.slice(0, LIMITE).map((i, k) => ({ id: `n${k}-${i.ts}`, titulo: i.titulo, resumo: i.resumo, fonte: i.fonte, link: i.link, imagem: i.imagem, publicado: i.ts ? new Date(i.ts).toISOString() : null }));
}

export async function manchetes({ fetchImpl = fetch, forcar = false } = {}) {
  if (!forcar && cache.itens.length && Date.now() - cache.em < TTL_MS) return cache;
  const lista = feeds();
  const resultados = await Promise.allSettled(lista.map((f) => buscarFeed(f, fetchImpl)));
  const fontes = lista.map((f, k) => ({ nome: f.nome, ok: resultados[k].status === 'fulfilled', erro: resultados[k].status === 'rejected' ? String(resultados[k].reason?.message || 'falha').slice(0, 120) : null }));
  for (const f of fontes.filter((x) => !x.ok)) logger.warn(`[tech-news] ${f.nome}: ${f.erro}`);
  const itens = juntar(resultados.filter((r) => r.status === 'fulfilled').map((r) => r.value));
  // se nada chegou agora, mantém o último resultado bom em vez de esvaziar a tela
  if (itens.length) cache = { em: Date.now(), itens, fontes };
  else if (cache.itens.length) cache = { ...cache, fontes };
  else cache = { em: Date.now(), itens: [], fontes };
  return cache;
}

router.get('/', async (req, res) => {
  const r = await manchetes({ forcar: req.query.forcar === '1' && req.user?.role === 'admin' });
  res.json({ atualizado: r.em ? new Date(r.em).toISOString() : null, itens: r.itens, fontes: r.fontes });
});

export default router;
