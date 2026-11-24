// Notícias de tecnologia: leitura de RSS/Atom, junção sem repetidos, cache e falhas parciais de fonte
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerRss, juntar, manchetes, feeds } from '../server/tech-news.js';

const RSS = `<?xml version="1.0"?><rss><channel>
  <item><title><![CDATA[Startup lança app de notas com IA &amp; voz]]></title><link>https://exemplo.com/a</link>
    <description><![CDATA[<p>O app transcreve reuniões &amp; resume.</p>]]></description>
    <pubDate>Mon, 23 Nov 2026 10:00:00 GMT</pubDate><media:content url="https://exemplo.com/a.jpg" /></item>
  <item><title>Robô de cozinha &#233; apresentado</title><link>https://exemplo.com/b</link><description>Protótipo na feira.</description>
    <pubDate>Mon, 23 Nov 2026 08:00:00 GMT</pubDate></item>
  <item><title>Sem link</title></item>
</channel></rss>`;
const ATOM = `<feed><entry><title>Novo sistema de busca</title><link href="https://exemplo.com/c"/><summary>Resumo.</summary><updated>2026-11-23T09:00:00Z</updated></entry></feed>`;

test('lê RSS e Atom, decodifica entidades, tira HTML e descarta itens sem link válido', () => {
  const r = lerRss(RSS);
  assert.equal(r.length, 2, 'o item sem link é descartado');
  assert.equal(r[0].titulo, 'Startup lança app de notas com IA & voz');
  assert.equal(r[0].resumo, 'O app transcreve reuniões & resume.');
  assert.equal(r[0].imagem, 'https://exemplo.com/a.jpg');
  assert.equal(r[1].titulo, 'Robô de cozinha é apresentado');
  assert.equal(r[1].imagem, null);
  const a = lerRss(ATOM); assert.equal(a.length, 1); assert.equal(a[0].link, 'https://exemplo.com/c'); assert.equal(a[0].publicado, '2026-11-23T09:00:00Z');
});

test('junta fontes, tira repetidos pelo link e ordena do mais novo para o mais antigo', () => {
  const x = [{ titulo: 'A', link: 'https://x/1', fonte: 'F1', publicado: 'Mon, 23 Nov 2026 08:00:00 GMT' }];
  const y = [{ titulo: 'A de novo', link: 'https://x/1', fonte: 'F2', publicado: 'Mon, 23 Nov 2026 08:00:00 GMT' }, { titulo: 'B', link: 'https://x/2', fonte: 'F2', publicado: 'Mon, 23 Nov 2026 12:00:00 GMT' }];
  const j = juntar([x, y]);
  assert.deepEqual(j.map((i) => i.titulo), ['B', 'A']); assert.equal(j[1].fonte, 'F1', 'a primeira ocorrência fica');
});

test('manchetes: uma fonte que falha não derruba as outras, e a falha aparece na lista de fontes', async () => {
  process.env.TECH_FEEDS = 'https://ok.exemplo/feed.xml,https://falha.exemplo/feed.xml';
  const f = async (url) => { if (url.includes('falha')) throw new Error('recusado'); return { ok: true, text: async () => RSS }; };
  const r = await manchetes({ fetchImpl: f, forcar: true });
  assert.equal(r.itens.length, 2); assert.equal(r.fontes.find((x) => x.nome === 'falha.exemplo').ok, false);
  assert.equal(r.fontes.find((x) => x.nome === 'ok.exemplo').ok, true);
  assert.equal(feeds().length, 2);
  delete process.env.TECH_FEEDS;
});

test('feeds: formato Nome|URL dá nome à fonte', () => {
  process.env.TECH_FEEDS = 'Minha Fonte|https://a.exemplo/rss,https://b.exemplo/rss';
  assert.deepEqual(feeds().map((f) => f.nome), ['Minha Fonte', 'b.exemplo']);
  delete process.env.TECH_FEEDS;
});

test('manchetes: cache de dez minutos; se todas as fontes caírem, mantém o último resultado bom', async () => {
  process.env.TECH_FEEDS = 'https://cache.exemplo/feed.xml';
  let chamadas = 0;
  const bom = async () => { chamadas++; return { ok: true, text: async () => RSS }; };
  await manchetes({ fetchImpl: bom, forcar: true });
  await manchetes({ fetchImpl: bom });
  assert.equal(chamadas, 1, 'a segunda leitura veio do cache');
  const ruim = async () => { throw new Error('fora do ar'); };
  const depois = await manchetes({ fetchImpl: ruim, forcar: true });
  assert.equal(depois.itens.length, 2, 'não esvazia a tela quando as fontes caem');
  assert.equal(depois.fontes[0].ok, false);
  delete process.env.TECH_FEEDS;
});
