// TESTES DE NAVEGADOR: sobe o Codeniac com uma pasta de dados nova e percorre as telas no Chromium.
// Falha se houver erro de script, arquivo faltando (404/500), mapa sem carros ou atlas que não carregou.
// Rodar: npm run test:browser   (CHROME_PATH=/caminho/do/chrome para usar um Chromium já instalado)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const PORTA = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORTA}`;
const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'codeniac-teste-'));
let servidor; let browser;

async function esperarSaude() {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.ok) return; } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('o servidor não respondeu a tempo');
}

before(async () => {
  servidor = spawn(process.execPath, ['server/index.js'], { cwd: RAIZ, env: { ...process.env, DATA_DIR: dados, PORT: String(PORTA) }, stdio: 'ignore' });
  await esperarSaude();
  browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: process.env.CHROME_PATH || undefined });
});

after(async () => {
  await browser?.close();
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
  for (const rota of ['#/', '#/mapa', '#/veiculos', '#/configuracoes', '#/chat', '#/diagnostico']) {
    await p.goto(`${BASE}/${rota}`); await p.waitForTimeout(3000);
    const n = await p.evaluate(() => document.querySelectorAll('*').length);
    assert.ok(n > 300, `tela ${rota} parece vazia (${n} elementos)`);
  }
  assert.deepEqual(p.errosJS, [], 'erros de script');
  assert.deepEqual(p.falhas, [], 'arquivos que não carregaram');
  await ctx.close();
});

// cria um mapa com ruas (cruz) e o marca como Vida: o jogo carrega esse mapa
async function mapaComRuasComoVida(p) {
  await p.evaluate(async () => {
    const h = { Authorization: 'Bearer ' + localStorage.getItem('codeniac.token'), 'Content-Type': 'application/json' };
    const m = await (await fetch('/api/mapas', { method: 'POST', headers: h, body: JSON.stringify({ nome: 'Teste de navegador' }) })).json();
    const celulas = {};
    for (let x = 0; x < 20; x++) celulas[`${x},7`] = 'terreno/asfalto';
    for (let y = 0; y < 14; y++) celulas[`10,${y}`] = 'terreno/asfalto';
    for (let x = 0; x < 20; x++) if (x !== 10) celulas[`${x},6`] = 'terreno/calcada';
    const itens = [{ chave: 'construcoes/hospital', x: 200, y: 120, dados: { nome: 'Hospital', rota: '#/hospital' } }];
    for (let k = 0; k < 3; k++) itens.push({ chave: 'personagens/' + ['policial', 'enfermeira', 'barbudo'][k], x: 100 + k * 40, y: 208, dados: { nome: 'Personagem ' + (k + 1) } });
    await fetch(`/api/mapas/${m.id}`, { method: 'PUT', headers: h, body: JSON.stringify({ largura: 20, altura: 14, celulas, itens }) });
    await fetch(`/api/mapas/${m.id}/vida`, { method: 'POST', headers: h, body: '{}' });
  });
}

test('mapa: carros e pedestres aparecem, sprites vêm do atlas em poucas requisições', async () => {
  const { p, ctx } = await paginaLogada();
  await mapaComRuasComoVida(p);
  await p.goto(`${BASE}/#/mapa`);
  await p.waitForFunction(() => window.__d2?.T?.cars?.length > 5, null, { timeout: 60000 });
  await p.waitForTimeout(1500);
  const info = await p.evaluate(() => ({ carros: __d2.T.cars.length, pedestres: __d2.P.peds.length, emMovimento: __d2.T.cars.filter((c) => c.v > 2).length }));
  // pedestres vêm dos personagens colocados no mapa (3 nesta cena de teste)
  const doMapa = await p.evaluate(() => __d2.P.peds.filter((q) => q.spr && q.spr.startsWith('chr/')).length);
  assert.ok(info.carros > 5 && doMapa >= 3, JSON.stringify({ ...info, doMapa }));
  assert.ok(p.pedidosAtlas >= 1 && p.pedidosAtlas <= 8, `requisições do atlas: ${p.pedidosAtlas}`);
  assert.deepEqual(p.errosJS, [], 'erros de script no mapa');
  assert.deepEqual(p.falhas, [], 'assets que não carregaram');
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

test('criar mapa: o editor abre, aceita peça do inventário e salva', async () => {
  const { p, ctx } = await paginaLogada();
  await p.goto(`${BASE}/#/settings/mapas`); await p.waitForSelector('a[href="#/criar-mapa"]', { timeout: 30000 });
  await p.click('a[href="#/criar-mapa"]'); await p.waitForSelector('#mNovo', { timeout: 15000 });
  await p.click('#mNovo'); await p.waitForSelector('#eTela', { timeout: 15000 });
  await p.click('#ePaleta [data-chave]'); await p.waitForTimeout(300);
  const tela = await p.locator('#eTela').boundingBox();
  await p.mouse.click(tela.x + tela.width / 2, tela.y + tela.height / 2);
  await p.click('#eSalvar'); await p.waitForTimeout(800);
  assert.match(await p.evaluate(() => document.querySelector('#eEstado').textContent), /Salvo/);
  assert.deepEqual(p.errosJS, [], 'erros de script no editor');
  await ctx.close();
});

test('gerador de personagens: sorteia, troca peça, salva e mostra a prévia', async () => {
  const { p, ctx } = await paginaLogada();
  await p.goto(`${BASE}/#/personagens`);
  await p.waitForSelector('#pgPrevia', { timeout: 30000 });
  const antes = await p.evaluate(() => document.querySelector('#pgSemente').textContent);
  await p.click('#pgSortear'); await p.waitForTimeout(300);
  assert.notEqual(await p.evaluate(() => document.querySelector('#pgSemente').textContent), antes, 'sortear troca a semente');
  await p.fill('#pgNome', 'Teste'); await p.click('#pgSalvar');
  assert.match(await p.evaluate(() => document.querySelector('#pgSalvos').innerText), /Teste/);
  const visiveis = await p.evaluate(() => { const d = document.querySelector('#pgPrevia').getContext('2d').getImageData(0, 0, 128, 128).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; });
  assert.ok(visiveis > 500, `prévia vazia (${visiveis} pixels)`);
  assert.deepEqual(p.errosJS, [], 'erros de script no gerador');
  await ctx.close();
});
