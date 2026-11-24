// Notícias de tecnologia: leitura de RSS/Atom, junção sem repetidos, cache e falhas parciais de fonte
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerRss, juntar, manchetes, feeds, extrairArtigo, lerArtigo, calcularInsights, reiniciarCache } from '../server/tech-news.js';

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
  reiniciarCache();
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

test('manchetes: usa o cache; se todas as fontes caírem, mantém o último resultado bom', async () => {
  reiniciarCache();
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

const PAGINA = `<html><head><title>Fallback</title><meta property="og:title" content="Título &amp; da matéria"><meta property="og:image" content="https://exemplo.com/capa.jpg">
<script>var x = "isso não deve aparecer";</script></head><body><nav><p>Menu que não é matéria nenhuma para aparecer</p></nav>
<article><h2>Subtítulo importante</h2><p>Este é o primeiro parágrafo da matéria, longo o bastante para valer.</p>
<p>Este é o segundo parágrafo da matéria, também longo o suficiente para ser mantido.</p><p>curto</p><style>.a{}</style></article><footer><p>Rodapé com texto bem longo que também não deve aparecer na leitura.</p></footer></body></html>`;

test('leitor: extrai título, imagem e só o texto da matéria (sem menu, script, rodapé)', () => {
  const a = extrairArtigo(PAGINA);
  assert.equal(a.titulo, 'Título & da matéria');
  assert.equal(a.imagem, 'https://exemplo.com/capa.jpg');
  assert.deepEqual(a.blocos.map((b) => b.t), ['h', 'p', 'p']);
  assert.ok(!JSON.stringify(a).includes('isso não deve aparecer') && !JSON.stringify(a).includes('Rodapé') && !JSON.stringify(a).includes('Menu que'));
});

test('leitor: só abre notícias que vieram dos feeds; link interno é recusado; site que falha devolve o resumo', async () => {
  reiniciarCache();
  process.env.TECH_FEEDS = 'Fonte|https://ok.exemplo/feed.xml';
  const RSS2 = `<rss><channel><item><title>Matéria boa</title><link>https://noticias.exemplo/boa</link><description>Resumo do feed.</description><pubDate>Mon, 23 Nov 2026 10:00:00 GMT</pubDate></item>
    <item><title>Matéria interna</title><link>http://127.0.0.1:8080/segredo</link><description>x</description></item></channel></rss>`;
  const feed = async () => ({ ok: true, text: async () => RSS2 });
  const r = await manchetes({ fetchImpl: feed, forcar: true });
  const boa = r.itens.find((i) => i.titulo === 'Matéria boa'); const interna = r.itens.find((i) => i.titulo === 'Matéria interna');
  assert.ok(boa.id && boa.categoria);
  const pagina = async () => ({ ok: true, url: boa.link, headers: { get: () => 'text/html' }, text: async () => PAGINA });
  const lida = await lerArtigo(boa.id, { fetchImpl: pagina });
  assert.equal(lida.semTexto, false); assert.equal(lida.fonte, 'Fonte'); assert.equal(lida.link, 'https://noticias.exemplo/boa');
  await assert.rejects(() => lerArtigo('aaaaaaaaaaaa', { fetchImpl: pagina }), /não encontrada/);
  await assert.rejects(() => lerArtigo(interna.id, { fetchImpl: pagina }), /não permitido/);
  const caiu = await lerArtigo(boa.id, { fetchImpl: async () => { throw new Error('bloqueado'); } });
  assert.equal(caiu.semTexto, true); assert.equal(caiu.resumo, 'Resumo do feed.'); assert.deepEqual(caiu.blocos, []);
  delete process.env.TECH_FEEDS;
});

test('insights: conta os temas das manchetes e ordena do mais frequente', () => {
  const itens = [
    { id: 'a', titulo: 'OpenAI launches new AI agent', fonte: 'F', resumo: '' }, { id: 'b', titulo: 'Shopify checkout update for merchants', fonte: 'F', resumo: '' },
    { id: 'c', titulo: 'New AI model beats benchmark', fonte: 'F', resumo: '' }, { id: 'd', titulo: 'Receita de bolo', fonte: 'F', resumo: '' },
  ];
  const t = calcularInsights(itens);
  assert.equal(t[0].tema, 'IA e agentes'); assert.equal(t[0].qtd, 2); assert.equal(t[0].pct, 50);
  assert.ok(t.some((x) => x.tema === 'E-commerce e varejo'));
  assert.ok(!t.some((x) => x.qtd === 0));
});
