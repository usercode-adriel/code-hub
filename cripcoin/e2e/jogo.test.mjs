// TESTE DE NAVEGADOR DO CRIPCOIN OFFICE: sobe o servidor com dados novos e joga de verdade no Chromium (criar projeto, loja, construir, contratar, OS, salvar/carregar).
// Precisa de `npm run cripcoin:build` antes. Rodar: npm run cripcoin:e2e   (CHROME_PATH=/caminho/do/chrome para usar outro Chromium)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const PORTA = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORTA}`;
const DADOS_RAIZ = path.join(RAIZ, '.tmp-testes'); fs.mkdirSync(DADOS_RAIZ, { recursive: true });
const dados = fs.mkdtempSync(path.join(DADOS_RAIZ, 'cripcoin-'));
const SAIDA = process.env.CRIPCOIN_E2E_SAIDA || null;
let servidor; let browser;

before(async () => {
  assert.ok(fs.existsSync(path.join(RAIZ, 'public/cripcoin/index.html')), 'rode npm run cripcoin:build antes dos testes de navegador');
  servidor = spawn(process.execPath, ['server/index.js'], { cwd: RAIZ, env: { ...process.env, DATA_DIR: dados, PORT: String(PORTA) }, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* subindo */ } await new Promise((r) => setTimeout(r, 250)); }
  browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: process.env.CHROME_PATH || undefined });
});
after(async () => {
  await browser?.close();
  if (servidor && servidor.exitCode === null) { const saiu = new Promise((r) => servidor.once('exit', r)); servidor.kill(); await saiu; }
  fs.rmSync(dados, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

async function abrir() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage(); p.erros = [];
  p.on('pageerror', (e) => p.erros.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) p.erros.push(m.text()); });
  await p.goto(`${BASE}/cripcoin/`); await p.waitForSelector('[data-testid=cr-criar], [data-testid=novo-projeto]'); p.ctx = ctx; return p;
}
const novoProjeto = async (p, nome = 'Escritório Teste') => { await p.fill('[data-testid=cr-nome]', nome); await p.click('[data-testid=cr-criar]'); await p.waitForSelector('[data-testid=canvas]'); await p.evaluate(() => { window.__jogo.p.minuto = 10 * 60; window.__jogo.mudou(); }); await p.waitForTimeout(300); };
const estado = (p) => p.evaluate(() => { const j = window.__jogo; return { cc: j.p.cc, objetos: j.p.objetos.map((o) => o.def), inv: j.p.inventario, func: j.p.funcionarios.map((f) => ({ estado: f.estado, nome: f.nome, estacao: f.estacao })), cand: j.p.candidatos.length, minuto: j.p.minuto }; });
const clicarCelula = async (p, x, y) => { const pos = await p.evaluate(([x, y]) => { const m = window.__mundo; const r = m.canvas.getBoundingClientRect(); const t = m.paraTela(x + 0.5, y + 0.5); return { x: r.left + t.x, y: r.top + t.y }; }, [x, y]); await p.mouse.click(pos.x, pos.y); };
const clicarObjeto = async (p, def) => { const c = await p.evaluate((def) => { const o = window.__jogo.p.objetos.find((q) => q.def === def); const r = window.__mundo.retDe(window.__jogo.p, o); const t = window.__mundo.paraTela(r.left + r.w / 2, r.top + r.h / 2); const b = window.__mundo.canvas.getBoundingClientRect(); return { x: b.left + t.x, y: b.top + t.y }; }, def); await p.mouse.click(c.x, c.y); };
const shot = async (p, nome) => { if (SAIDA) { fs.mkdirSync(SAIDA, { recursive: true }); await p.screenshot({ path: path.join(SAIDA, nome) }); } };

test('novo projeto: sala pedida, escritório inicial mínimo e CC 5000', async () => {
  const p = await abrir(); try {
    await p.fill('[data-testid=cr-w]', '12'); await p.fill('[data-testid=cr-h]', '9'); await novoProjeto(p);
    const dim = await p.evaluate(() => ({ w: window.__jogo.p.largura, h: window.__jogo.p.altura })); assert.deepEqual(dim, { w: 12, h: 9 });
    const e = await estado(p); assert.deepEqual([...e.objetos].sort(), ['cadeira-escritorio', 'laptop', 'mesa-simples']); assert.equal(e.func.length, 0);
    assert.match(await p.textContent('[data-testid=saldo]'), /5000/); await shot(p, 'inicial.png'); assert.deepEqual(p.erros, []);
  } finally { await p.ctx.close(); }
});

test('loja pelo laptop, inventário, construir e vender; saldo muda de verdade', async () => {
  const p = await abrir(); try {
    await novoProjeto(p); const lap = await p.evaluate(() => { const o = window.__jogo.p.objetos.find((q) => q.def === 'laptop'); return { x: o.x, y: o.y }; });
    await clicarObjeto(p, 'laptop'); await p.waitForSelector('[data-testid=so]'); await p.click('[data-testid=ico-loja]'); await p.waitForSelector('[data-testid=loja]');
    await p.click('[data-testid=comprar-mesa-baixa]'); await p.click('[data-testid=confirmar-compra]'); await p.waitForTimeout(150);
    let e = await estado(p); assert.equal(e.inv['mesa-baixa'], 1); assert.equal(e.cc, 5000 - 90); await shot(p, 'loja.png');
    await p.click('[data-testid=so-fechar]'); await p.click('[data-testid=btn-inventario]'); await p.waitForSelector('[data-testid=inv-item]'); await p.click('text=Colocar'); // abre construção com o item
    await p.waitForSelector('[data-testid=painel-construcao]'); await clicarCelula(p, 2, 6); await p.waitForTimeout(150);
    e = await estado(p); assert.ok(e.objetos.includes('mesa-baixa')); assert.equal(e.inv['mesa-baixa'], undefined);
    // seleciona e vende pelo painel
    await p.click('[data-testid=ferr-selecionar]'); await clicarCelula(p, 2, 6); await p.waitForSelector('[data-testid=sel-info]'); await p.click('text=Vender'); await p.click('text=Confirmar'); await p.waitForTimeout(150);
    e = await estado(p); assert.ok(!e.objetos.includes('mesa-baixa')); assert.equal(e.cc, 5000 - 90 + 54); assert.deepEqual(p.erros, []);
  } finally { await p.ctx.close(); }
});

test('contratar: candidato some da lista, funcionário chega, senta e trabalha sozinho', async () => {
  const p = await abrir(); try {
    await novoProjeto(p); const antes = (await estado(p)).cand; await p.click('[data-testid=btn-contratar]'); await p.waitForSelector('[data-testid=candidato]'); await p.click('[data-testid=ver-candidato]');
    await p.fill('[data-testid=ct-nome]', 'Marina'); await p.click('[data-testid=confirmar-contratar]'); await p.waitForTimeout(200);
    let e = await estado(p); assert.equal(e.func.length, 1); assert.equal(e.func[0].nome, 'Marina'); assert.equal(e.cand, antes - 1); assert.ok(e.func[0].estacao);
    await p.evaluate(() => { const j = window.__jogo; j.p.minuto = 9 * 60 - 2; j.p.velocidade = 3; });
    await p.waitForFunction(() => window.__jogo.p.funcionarios[0].estado === 'trabalhando', null, { timeout: 40000 }); await shot(p, 'trabalhando.png');
    const meta = await p.evaluate(() => window.__jogo.p.funcionarios[0].metaDia); assert.ok(meta >= 10 && meta <= 120, `rendimento do dia sorteado entre 10 e 120 (${meta})`);
    const cc0 = (await estado(p)).cc; await p.evaluate(() => { const j = window.__jogo; j.p.minuto = Math.ceil(j.p.minuto / 1440) * 1440 - 1; j.p.velocidade = 3; });
    await p.waitForFunction(() => window.__jogo.p.transacoes.some((t) => t.tipo === 'recompensa' && /Rendimento/.test(t.descricao)), null, { timeout: 20000 });
    const gan = await p.evaluate(() => window.__jogo.p.transacoes.find((t) => /Rendimento/.test(t.descricao)).valor); assert.equal(gan, meta); assert.ok((await estado(p)).cc > cc0 - 200, 'rendimento creditado'); assert.deepEqual(p.erros, []);
  } finally { await p.ctx.close(); }
});

test('computador: arquivos (criar/editar/salvar), calculadora e navegador sem sessão não inventa resultados', async () => {
  const p = await abrir(); try {
    await novoProjeto(p); const lap = await p.evaluate(() => { const o = window.__jogo.p.objetos.find((q) => q.def === 'laptop'); return { x: o.x, y: o.y }; });
    await clicarObjeto(p, 'laptop'); await p.waitForSelector('[data-testid=so]');
    await p.click('[data-testid=ico-calculadora]'); await p.click('button:text-is("7")'); await p.click('button:text-is("×")'); await p.click('button:text-is("8")'); await p.click('button:text-is("=")'); assert.equal((await p.textContent('[data-testid=calc-tela]')).trim(), '56');
    await p.click('[data-testid=ico-arquivos]'); await p.fill('[data-testid=arq-nome]', 'Relatorio'); await p.click('[data-testid=arq-criar]'); await p.dblclick('[data-testid=arq-item]:has-text("Relatorio")');
    await p.waitForSelector('[data-testid=editor-texto]'); await p.fill('[data-testid=editor-texto]', 'conteúdo real'); await p.click('[data-testid=editor-salvar]');
    const salvo = await p.evaluate(() => { const fs = Object.values(window.__jogo.p.computadores)[0].fs; const acha = (n) => (n.nome === 'Relatorio' ? n : (n.filhos || []).map(acha).find(Boolean)); return acha(fs)?.conteudo; }); assert.equal(salvo, 'conteúdo real');
    await p.click('[data-testid=ico-navegador]'); await p.fill('[data-testid=nav-busca]', 'cripto'); await p.click('[data-testid=nav-ir]'); await p.waitForSelector('[data-testid=nav-erro]'); assert.equal(await p.locator('[data-testid=nav-resultados]').count(), 0);
    await shot(p, 'os.png'); assert.deepEqual(p.erros, []);
  } finally { await p.ctx.close(); }
});

test('salvar e carregar: o projeto volta igual depois de recarregar a página', async () => {
  const p = await abrir(); try {
    await novoProjeto(p, 'Persistente'); await p.evaluate(() => { const j = window.__jogo; j.p.cc = 777; j.emitir(); }); await p.click('[data-testid=btn-salvar]'); await p.reload(); await p.waitForSelector('[data-testid=continuar]');
    await p.click('[data-testid=continuar]'); await p.waitForSelector('[data-testid=canvas]'); const e = await estado(p); assert.equal(e.cc, 777); assert.deepEqual([...e.objetos].sort(), ['cadeira-escritorio', 'laptop', 'mesa-simples']); assert.deepEqual(p.erros, []);
  } finally { await p.ctx.close(); }
});

test('construção: pinta piso, levanta parede, cria porta e mostra colisões', async () => {
  const p = await abrir(); try {
    await novoProjeto(p); await p.click('[data-testid=btn-construir]'); await p.waitForSelector('[data-testid=painel-construcao]');
    const arrastar = async (x0, y0, x1, y1) => { const a = await p.evaluate(([x, y]) => { const m = window.__mundo; const r = m.canvas.getBoundingClientRect(); const t = m.paraTela(x + 0.5, y + 0.5); return { x: r.left + t.x, y: r.top + t.y }; }, [x0, y0]); const b = await p.evaluate(([x, y]) => { const m = window.__mundo; const r = m.canvas.getBoundingClientRect(); const t = m.paraTela(x + 0.5, y + 0.5); return { x: r.left + t.x, y: r.top + t.y }; }, [x1, y1]); await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(b.x, b.y, { steps: 4 }); await p.mouse.up(); };
    await p.click('[data-testid=ferr-piso]'); await p.click('.pisos button[title=parquet]'); await arrastar(2, 5, 4, 6);
    assert.equal(await p.evaluate(() => window.__jogo.p.piso[5 * window.__jogo.p.largura + 3]), 'parquet');
    await p.click('[data-testid=ferr-parede]'); await p.click('text=Modo retângulo'); await arrastar(6, 4, 6, 7);
    assert.equal(await p.evaluate(() => window.__jogo.p.paredes[5 * window.__jogo.p.largura + 6]), 1);
    await p.click('[data-testid=ferr-porta]'); await clicarCelula(p, 6, 5);
    assert.ok(await p.evaluate(() => window.__jogo.p.portas.some((q) => q.x === 6 && q.y === 5)));
    await p.click('[data-testid=ferr-apagarParede]'); await arrastar(6, 4, 6, 4); assert.equal(await p.evaluate(() => window.__jogo.p.paredes[4 * window.__jogo.p.largura + 6]), 0);
    await p.click('text=Colisões'); await p.waitForTimeout(150); await shot(p, 'construcao.png'); assert.deepEqual(p.erros, []);
  } finally { await p.ctx.close(); }
});
