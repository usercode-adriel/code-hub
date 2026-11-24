// TESTE DE NAVEGADOR DO JOGO: sobe o servidor com dados novos, abre /jogo/ no Chromium e verifica o jogo de verdade
// (WebGL, teclado, setores por proximidade, colisão, FPS). Precisa de `npm run jogo:build` antes.
// Rodar: npm run jogo:e2e   (CHROME_PATH=/caminho/do/chrome para usar um Chromium já instalado)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const PORTA = 3800 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORTA}`;
const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'codeniac-jogo-'));
const SAIDA = process.env.JOGO_E2E_SAIDA || null; // pasta opcional para as capturas de tela
let servidor; let browser;

before(async () => {
  assert.ok(fs.existsSync(path.join(RAIZ, 'public/jogo/index.html')), 'rode npm run jogo:build antes dos testes de navegador');
  servidor = spawn(process.execPath, ['server/index.js'], { cwd: RAIZ, env: { ...process.env, DATA_DIR: dados, PORT: String(PORTA) }, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* subindo */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], executablePath: process.env.CHROME_PATH || undefined });
});

after(async () => {
  await browser?.close();
  if (servidor && servidor.exitCode === null) { const saiu = new Promise((r) => servidor.once('exit', r)); servidor.kill(); await saiu; }
  fs.rmSync(dados, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

async function abrir() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  p.erros = [];
  p.on('pageerror', (e) => p.erros.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') p.erros.push(m.text()); });
  p.on('response', (r) => { if (r.status() >= 400) p.erros.push(`${r.status()} ${r.url()}`); });
  await p.goto(`${BASE}/jogo/`);
  await p.waitForFunction(() => window.__game?.isReady === true, null, { timeout: 30000 });
  return { p, ctx };
}

const estado = (p) => p.evaluate(() => { const g = window.__game; return { x: g.player.x, y: g.player.y, dir: g.player.dir, setores: g.world.sectors.size, stats: g.stats() }; });

test('o jogo abre sem erros, com HUD, canvas WebGL e 9 setores ao redor do jogador', async () => {
  const { p, ctx } = await abrir();
  await p.waitForSelector('[data-testid=hud]');
  const s = await estado(p);
  assert.equal(s.setores, 9);
  assert.equal(await p.locator('canvas').count(), 1);
  assert.match(await p.textContent('[data-testid=hud]'), /FPS/);
  if (SAIDA) await p.screenshot({ path: path.join(SAIDA, 'jogo-inicio.png') });
  assert.deepEqual(p.erros, []);
  await ctx.close();
});

test('andar com o teclado move o jogador, muda a direção e a câmera acompanha', async () => {
  const { p, ctx } = await abrir();
  const a = await estado(p);
  await p.keyboard.down('KeyD'); await p.waitForTimeout(700); await p.keyboard.up('KeyD');
  const b = await estado(p);
  assert.ok(b.x > a.x + 40, `esperava andar para a direita: ${a.x} → ${b.x}`);
  assert.equal(b.dir, 6, 'direção L');
  await p.keyboard.down('KeyW'); await p.keyboard.down('KeyA'); await p.waitForTimeout(500);
  assert.equal((await estado(p)).dir, 3, 'direção NO (lida com as duas teclas seguradas)');
  await p.keyboard.up('KeyW'); await p.keyboard.up('KeyA');
  const cam = await p.evaluate(() => ({ cx: __game.camera.x, px: __game.player.x }));
  assert.ok(Math.abs(cam.cx - cam.px) < 200, 'a câmera fica perto do jogador');
  assert.deepEqual(p.erros, []);
  await ctx.close();
});

test('andar longe carrega setores novos e descarrega os distantes, sem crescer sem limite', async () => {
  const { p, ctx } = await abrir();
  await p.keyboard.down('ShiftLeft'); await p.keyboard.down('KeyD');
  await p.waitForTimeout(5000);
  await p.keyboard.up('KeyD'); await p.keyboard.up('ShiftLeft');
  await p.waitForTimeout(500);
  const s = await estado(p);
  const m = await p.evaluate(() => __game.world.sectorOf(__game.player.x, __game.player.y));
  assert.ok(m.sx >= 4, `o jogador deveria ter cruzado setores (setor ${m.sx})`);
  assert.ok(s.setores <= 16, `setores carregados: ${s.setores}`);
  const todos = await p.evaluate(() => [...__game.world.sectors.keys()]);
  assert.ok(todos.every((k) => Math.abs(Number(k.split(',')[0]) - m.sx) <= 2), 'só ficam setores perto do jogador');
  assert.deepEqual(p.erros, []);
  await ctx.close();
});

test('colisão: o jogador não atravessa um prop sólido', async () => {
  const { p, ctx } = await abrir();
  const r = await p.evaluate(() => {
    const g = window.__game;
    const c = [...g.world.sectors.values()].flatMap((s) => s.colliders)[0].rect;
    g.player.x = c.x - 40; g.player.y = c.y + c.h - 2; // pés alinhados com o colisor, à esquerda dele
    return { alvoX: c.x };
  });
  await p.keyboard.down('KeyD'); await p.waitForTimeout(1200); await p.keyboard.up('KeyD');
  const s = await estado(p);
  assert.ok(s.x + 7 <= r.alvoX + 0.5, `o jogador parou antes do colisor (x=${s.x}, colisor=${r.alvoX})`);
  await ctx.close();
});

// O Chromium do teste usa WebGL por software (SwiftShader), sem GPU: o FPS medido aqui é o do rasterizador, não o do jogo.
// Por isso o critério firme é o custo de CPU por quadro; o FPS entra só como piso de sanidade. Medido neste ambiente:
// 60 FPS em 640×360 e ~35 FPS em 1280×720; os 60 FPS em HD precisam ser confirmados numa máquina com GPU.
test('desempenho: custo de CPU por quadro baixo, poucos sprites e memória sob controle', async () => {
  const { p, ctx } = await abrir();
  await p.keyboard.down('KeyS'); await p.waitForTimeout(4000); await p.keyboard.up('KeyS');
  const s = (await estado(p)).stats;
  console.log(`# desempenho: ${s.fps} FPS, ${s.frameMs} ms/quadro, ${s.sectors} setores, ${s.sprites} sprites, heap ${s.heapMb} MB`);
  assert.ok(s.frameMs < 4, `custo de CPU por quadro alto: ${s.frameMs} ms`);
  assert.ok(s.fps >= 15, `FPS abaixo do piso de sanidade: ${s.fps}`);
  assert.ok(s.sprites < 400, `sprites demais: ${s.sprites}`);
  if (s.heapMb !== null) assert.ok(s.heapMb < 200, `memória alta: ${s.heapMb} MB`);
  if (SAIDA) await p.screenshot({ path: path.join(SAIDA, 'jogo-andando.png') });
  assert.deepEqual(p.erros, []);
  await ctx.close();
});
