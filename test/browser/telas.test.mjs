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
  for (const rota of ['#/', '#/gamecode', '#/veiculos', '#/configuracoes', '#/chat', '#/diagnostico']) {
    await p.goto(`${BASE}/${rota}`); await p.waitForTimeout(3000);
    const n = await p.evaluate(() => document.querySelectorAll('*').length);
    assert.ok(n > 300, `tela ${rota} parece vazia (${n} elementos)`);
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

test('tech ao vivo: a tela inicial mostra manchetes reais (com fonte), os apresentadores e o botão Narrar; sem o painel da cidade', async () => {
  const { p, ctx } = await paginaLogada();
  await p.goto(`${BASE}/#/centro`); await p.waitForSelector('#hxLive .tv-palco', { timeout: 30000 });
  await p.waitForFunction(() => /Apps de notas com IA/.test(document.querySelector('#hxLive')?.textContent || ''), null, { timeout: 15000 });
  const live = await p.textContent('#hxLive');
  assert.match(live, /Tech ao vivo/); assert.match(live, /Protótipo de robô de cozinha/);
  assert.equal(await p.locator('#hxLive .tv-pessoa').count(), 2, 'dois apresentadores');
  assert.ok(!/Live da Cidade/.test(await p.textContent('body')), 'o painel da cidade saiu da tela inicial');
  assert.match(await p.textContent('#tvFala'), /Manchete da Noticias Exemplo: Apps de notas com IA/, 'a fala é a manchete real, com a fonte');
  assert.equal(await p.locator('#hxLive a[href="https://noticias.exemplo/ia-notas"]').count() >= 1, true, 'link para a notícia completa');
  await p.click('#tvVoz'); assert.equal(await p.getAttribute('#tvVoz', 'aria-pressed'), 'true');
  await p.click('#tvVoz'); assert.equal(await p.getAttribute('#tvVoz', 'aria-pressed'), 'false');
  assert.deepEqual(p.errosJS, [], 'erros de script na tela inicial');
  await ctx.close();
});

test('gamecode: clicar em Gamecode na barra lateral abre o painel; clicar no cartão abre o jogo de verdade', async () => {
  const { p, ctx } = await paginaLogada();
  await p.goto(`${BASE}/#/centro`); await p.waitForSelector('a.cx-nav-i[href="#/gamecode"]', { timeout: 30000 });
  await p.click('a.cx-nav-i[href="#/gamecode"]');
  await p.waitForSelector('.gc-xb', { timeout: 15000 });
  assert.ok((await p.locator('.gc-card').count()) >= 1, 'o painel tem o cartão do jogo');
  assert.equal(await p.locator('.gc-play').count(), 0, 'o jogo só abre depois do clique no cartão');
  await p.locator('.gc-card').first().click();
  const jogo = p.frameLocator('.gc-play iframe');
  await jogo.locator('canvas').waitFor({ timeout: 30000 });
  await jogo.locator('[data-testid=hud]').waitFor({ timeout: 30000 });
  await p.click('#gcVoltar');
  assert.equal(await p.locator('.gc-play').count(), 0, 'Voltar fecha o jogo');
  assert.deepEqual(p.errosJS, [], 'erros de script');
  await ctx.close();
});
