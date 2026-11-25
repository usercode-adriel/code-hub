// TESTES DE NAVEGADOR: sobe o Codeniac com uma pasta de dados nova e percorre as telas no Chromium.
// Falha se houver erro de script, arquivo faltando (404/500), mapa sem carros ou atlas que não carregou.
// Rodar: npm run test:browser   (CHROME_PATH=/caminho/do/chrome para usar um Chromium já instalado)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import http from 'node:http';
import { chromium } from 'playwright';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const PORTA = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORTA}`;
const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'codeniac-teste-'));
let servidor; let browser; let feedFalso;
// feed RSS local: as manchetes do teste vêm daqui (nada de rede externa)
const RSS_TESTE = `<?xml version="1.0"?><rss><channel>
  <item><title>Apps de notas com IA chegam ao Brasil</title><link>https://noticias.exemplo/ia-notas</link><description>Ferramenta transcreve reuniões.</description><pubDate>Mon, 23 Nov 2026 10:00:00 GMT</pubDate></item>
  <item><title>Protótipo de robô de cozinha</title><link>https://noticias.exemplo/robo</link><description>Apresentado na feira.</description><pubDate>Mon, 23 Nov 2026 09:00:00 GMT</pubDate></item>
</channel></rss>`;

async function esperarSaude() {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('o servidor não respondeu a tempo');
}

before(async () => {
  feedFalso = http.createServer((req, res) => { res.setHeader('Content-Type', 'application/rss+xml'); res.end(RSS_TESTE); });
  await new Promise((ok) => feedFalso.listen(0, '127.0.0.1', ok));
  const feedUrl = `http://127.0.0.1:${feedFalso.address().port}/feed.xml`;
  servidor = spawn(process.execPath, ['server/index.js'], { cwd: RAIZ, env: { ...process.env, DATA_DIR: dados, PORT: String(PORTA), TECH_FEEDS: `Noticias Exemplo|${feedUrl}`, GEMINI_API_KEY: '', GROQ_API_KEY: '', OPENROUTER_API_KEY: '' }, stdio: 'ignore' });
  await esperarSaude();
  browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: process.env.CHROME_PATH || undefined });
});

after(async () => {
  await browser?.close(); feedFalso?.close();
  if (servidor && servidor.exitCode === null) { const saiu = new Promise((r) => servidor.once('exit', r)); servidor.kill(); await saiu; }
  fs.rmSync(dados, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

async function paginaLogada() {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 820 } });
  const p = await ctx.newPage();
  p.errosJS = []; p.falhas = []; p.pedidosAtlas = 0;
  p.on('pageerror', (e) => p.errosJS.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !/navigator\.vibrate/.test(m.text())) p.errosJS.push(m.text()); });
  p.on('response', (r) => { if (r.status() >= 400) p.falhas.push(`${r.status()} ${r.url()}`); if (r.url().includes('/assets/atlas/')) p.pedidosAtlas++; });
  await p.goto(`${BASE}/login.html`);
  await p.evaluate(async () => {
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@codeniac.dev', password: 'codeniac123' }) });
    localStorage.setItem('codeniac.token', (await r.json()).token);
  });
  return { p, ctx };
}

test('login do administrador padrão funciona', async () => {
  const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@codeniac.dev', password: 'codeniac123' }) });
  assert.equal(r.status, 200);
  const bad = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@codeniac.dev', password: 'errada-123' }) });
  assert.equal(bad.status, 401);
});

test('telas principais carregam sem erro de script e sem arquivo faltando', async () => {
  const { p, ctx } = await paginaLogada();
  for (const rota of ['#/', '#/gamecode', '#/estudio', '#/news', '#/dashboard', '#/configuracoes', '#/chat', '#/diagnostico', '#/veiculos']) {
    await p.goto(`${BASE}/${rota}`); await p.waitForTimeout(3000);
    const n = await p.evaluate(() => document.querySelectorAll('*').length);
    assert.ok(n > 150, `tela ${rota} parece vazia (${n} elementos)`);
  }
  assert.deepEqual(p.errosJS, [], 'erros de script');
  assert.deepEqual(p.falhas, [], 'arquivos que não carregaram');
  await ctx.close();
});

test('diagnóstico: administrador vê os números, visitante não', async () => {
  const d = await fetch(`${BASE}/api/diagnostico`);
  assert.equal(d.status, 401, 'sem login não vê');
  const { p, ctx } = await paginaLogada();
  const token = await p.evaluate(() => localStorage.getItem('codeniac.token'));
  const r = await fetch(`${BASE}/api/diagnostico`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.ok(j.memoriaMB.rss > 0 && Array.isArray(j.pedidos), 'dados do diagnóstico');
  await ctx.close();
});

test('barra lateral: só Início, Gamecode, Estúdio, News, Meu hub, Chat, Configurações e Sair', async () => {
  const { p, ctx } = await paginaLogada();
  await p.goto(`${BASE}/#/centro`); await p.waitForSelector('#cxSide .cx-nav-i', { timeout: 30000 });
  const itens = (await p.locator('#cxSide .cx-nav-i span').allTextContents()).map((t) => t.trim());
  assert.deepEqual(itens, ['Início', 'Gamecode', 'Estúdio', 'News', 'Meu hub', 'Chat', 'Configurações', 'Sair']);
  // as telas removidas não abrem mais: voltam ao Início
  for (const rota of ['inventario', 'mercado', 'empregos', 'veiculos', 'propriedades', 'construtora', 'organizacoes']) {
    await p.goto(`${BASE}/#/${rota}`); await p.waitForFunction(() => location.hash === '#/centro', null, { timeout: 10000 });
  }
  assert.deepEqual(p.errosJS, []);
  await ctx.close();
});

test('início: notícias ao vivo (sem mapa), botão atualizar, leitor dentro do sistema, checklist, insights e chat Codeniac ao vivo', async () => {
  const { p, ctx } = await paginaLogada();
  await p.goto(`${BASE}/#/centro`); await p.waitForSelector('[data-news] .nx-n', { timeout: 30000 });
  const corpo = await p.textContent('body');
  assert.ok(!/Mapa da Cidade/.test(corpo), 'o mapa da cidade saiu do Início');
  assert.match(await p.textContent('[data-news]'), /AO VIVO/);
  assert.match(await p.textContent('[data-news]'), /Apps de notas com IA chegam ao Brasil/);
  assert.equal(await p.locator('[data-news] .nx-barra').count(), 1, 'barra animada do ao vivo');
  await p.click('[data-atualizar]'); await p.waitForFunction(() => /atualizado às/.test(document.querySelector('[data-atualizado]')?.textContent || ''), null, { timeout: 15000 });
  // clicar na notícia abre o leitor dentro do sistema (sem sair da página)
  const url = p.url();
  await p.locator('[data-news] .nx-n').first().click();
  await p.waitForSelector('.nx-leitor', { timeout: 15000 });
  assert.equal(p.url(), url, 'continua dentro do sistema');
  assert.ok(await p.locator('.nx-leitor a[href^="http"]').count() >= 1, 'link para o original');
  await p.click('.nx-leitor [data-fechar]'); assert.equal(await p.locator('.nx-leitor').count(), 0);
  // checklist, insights e chat
  assert.match(await p.textContent('[data-check]'), /Checklist/);
  assert.match(await p.textContent('[data-ins]'), /Insights IA/);
  assert.match(await p.textContent('[data-chat]'), /Chat Codeniac ao vivo/);
  assert.equal(await p.locator('[data-chat] [data-msg]').count(), 1, 'caixa de mensagem do chat');
  assert.ok(!/Tech ao vivo/.test(corpo), 'o painel Tech ao vivo foi trocado pelo chat');
  assert.deepEqual(p.errosJS, [], 'erros de script no Início');
  await ctx.close();
});

test('news: notícias internacionais com filtros por categoria e fontes', async () => {
  const { p, ctx } = await paginaLogada();
  await p.goto(`${BASE}/#/news`); await p.waitForSelector('[data-news] .nx-n', { timeout: 30000 });
  assert.match(await p.textContent('[data-news]'), /AO VIVO/);
  assert.ok(await p.locator('[data-news] [data-cat]').count() >= 3, 'filtros de categoria');
  assert.ok(await p.locator('[data-news] .nx-fonte').count() >= 1, 'lista as fontes');
  await p.click('[data-news] [data-cat="ecommerce"]');
  assert.match(await p.textContent('[data-news] [data-lista]'), /Nenhuma notícia nesta categoria/);
  assert.deepEqual(p.errosJS, []);
  await ctx.close();
});

test('news: carrossel de destaques troca sozinho, pausa com o mouse, é personalizável e abre a matéria', async () => {
  const { p, ctx } = await paginaLogada();
  await p.addInitScript(() => localStorage.setItem('codeniac.newsCarrossel', JSON.stringify({ auto: true, seg: 1, max: 6, cats: null })));
  await p.goto(`${BASE}/#/news`); await p.waitForSelector('[data-car] .nx-slide', { timeout: 30000 });
  await p.waitForFunction(() => document.querySelectorAll('[data-car] [data-ponto]').length >= 2, null, { timeout: 15000 });
  const ativo = () => p.evaluate(() => [...document.querySelectorAll('[data-car] [data-ponto]')].findIndex((b) => b.classList.contains('on')));
  await p.mouse.move(5, 5);
  const a0 = await ativo();
  await p.waitForFunction((n) => [...document.querySelectorAll('[data-car] [data-ponto]')].findIndex((b) => b.classList.contains('on')) !== n, a0, { timeout: 6000 });
  // com o mouse em cima, pausa
  await p.hover('[data-car] [data-car]'); const a1 = await ativo(); await p.waitForTimeout(2500);
  assert.equal(await ativo(), a1, 'pausa com o mouse em cima');
  // personalizar: desligar a troca automática fica salvo
  await p.click('[data-car] [data-config]'); await p.uncheck('[data-car] [data-auto]');
  assert.equal(JSON.parse(await p.evaluate(() => localStorage.getItem('codeniac.newsCarrossel'))).auto, false, 'a escolha fica salva');
  await p.click('[data-car] .nx-slide[aria-hidden="false"] [data-ler]');
  await p.waitForSelector('.nx-leitor', { timeout: 15000 });
  assert.deepEqual(p.errosJS, []);
  await ctx.close();
});

test('estúdio: três cards (Video editor, Video cut, Ecommerce), sem funcionalidade', async () => {
  const { p, ctx } = await paginaLogada();
  await p.goto(`${BASE}/#/estudio`); await p.waitForSelector('.nx-est', { timeout: 30000 });
  assert.deepEqual((await p.locator('.nx-est h3').allTextContents()).map((t) => t.trim()), ['Video editor', 'Video cut', 'Ecommerce']);
  assert.deepEqual(p.errosJS, []);
  await ctx.close();
});

test('chat: um só assistente, sem personagens nem grupos; conversa de verdade com resposta', async () => {
  const { p, ctx } = await paginaLogada();
  await p.goto(`${BASE}/#/assistente`); await p.waitForSelector('[data-chat] [data-msg]', { timeout: 30000 });
  const corpo = await p.textContent('body');
  assert.ok(!/Criar personagem|Criar grupo|Personagens|Mensagens automáticas/.test(corpo), 'sem personagens, grupos ou mensagens automáticas');
  await p.fill('[data-chat] [data-msg]', 'olá');
  await p.click('[data-chat] button[type=submit]');
  await p.waitForFunction(() => document.querySelectorAll('[data-chat] .nx-msg').length >= 3 && !document.querySelector('[data-chat] [data-pend]'), null, { timeout: 30000 });
  assert.ok((await p.locator('[data-chat] .nx-msg.eu').count()) >= 1, 'a mensagem do usuário aparece');
  assert.deepEqual(p.errosJS, []);
  await ctx.close();
});

test('gamecode: painel no estilo PS5 (abas, linha de jogos, Store, cartões); clicar no jogo abre o jogo de verdade', async () => {
  const { p, ctx } = await paginaLogada();
  await p.goto(`${BASE}/#/centro`); await p.waitForSelector('a.cx-nav-i[href="#/gamecode"]', { timeout: 30000 });
  await p.click('a.cx-nav-i[href="#/gamecode"]');
  await p.waitForSelector('.gc-ps5 .gc-tile', { timeout: 15000 });
  assert.deepEqual((await p.locator('.gc-tabs button').allTextContents()).map((t) => t.trim()), ['Games', 'Store']);
  assert.ok((await p.locator('.gc-tile').count()) >= 2, 'tile da Store e do jogo');
  const painel = await p.textContent('[data-paineis]');
  for (const t of [/Armazenamento/, /Controle/, /Tempo de jogo/, /Atividade recente/, /Conquistas/, /Novo na Store/, /Em desenvolvimento/]) assert.match(painel, t);
  assert.equal(await p.locator('.gc-play').count(), 0, 'o jogo só abre depois do clique');
  // setas movem o foco entre os tiles e trocam o destaque
  await p.keyboard.press('ArrowLeft');
  assert.match(await p.textContent('[data-titulo]'), /Codeniac Store/);
  await p.keyboard.press('ArrowRight');
  assert.match(await p.textContent('[data-titulo]'), /Codeniac Open World/);
  // Store: lista o jogo instalado e o que está em desenvolvimento
  await p.click('[data-aba="store"]'); await p.waitForSelector('.gc-item');
  assert.match(await p.textContent('[data-pg="store"]'), /INSTALADO/); assert.match(await p.textContent('[data-pg="store"]'), /EM BREVE/);
  await p.click('[data-aba="games"]');
  await p.click('[data-acao]');
  const jogo = p.frameLocator('.gc-play iframe');
  await jogo.locator('canvas').waitFor({ timeout: 30000 });
  await jogo.locator('[data-testid=hud]').waitFor({ timeout: 30000 });
  await p.waitForTimeout(3500);
  await p.click('#gcVoltar');
  assert.equal(await p.locator('.gc-play').count(), 0, 'Voltar fecha o jogo');
  // a partida jogada entra nas estatísticas e na atividade recente
  const stats = JSON.parse(await p.evaluate(() => localStorage.getItem('codeniac.gamecode.stats')));
  assert.equal(stats.jogos['codeniac-open-world'].vezes, 1);
  assert.match(await p.textContent('[data-paineis]'), /Codeniac Open World/);
  assert.deepEqual(p.errosJS, [], 'erros de script');
  await ctx.close();
});
