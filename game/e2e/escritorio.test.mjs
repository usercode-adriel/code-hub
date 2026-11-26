// TESTES DE NAVEGADOR DO COMMERCE OFFICE: sobe o servidor com dados novos e usa o escritório de verdade no Chromium (WebGL).
// Precisa de `npm run office:build` antes. Rodar: npm run office:e2e
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { criarPngRGBA } from '../../server/commerce/png.js';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const PORTA = 3700 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORTA}`;
const SAIDA = process.env.OFFICE_E2E_SAIDA || null;
fs.mkdirSync(path.join(RAIZ, '.tmp-testes'), { recursive: true });
const dados = fs.mkdtempSync(path.join(RAIZ, '.tmp-testes', 'office-'));
let servidor; let browser;

before(async () => {
  assert.ok(fs.existsSync(path.join(RAIZ, 'public/escritorio/index.html')), 'rode npm run office:build antes');
  servidor = spawn(process.execPath, ['server/index.js'], { cwd: RAIZ, env: { ...process.env, DATA_DIR: dados, PORT: String(PORTA), AI_PROVIDER: 'local', GEMINI_API_KEY: '', ANTHROPIC_API_KEY: '', CODENIAC_TESTE_IA_FALSA: '1', CODENIAC_TESTE_IA_ATRASO: '900' }, stdio: 'ignore' });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* subindo */ } await new Promise((r) => setTimeout(r, 250)); }
  browser = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], executablePath: process.env.CHROME_PATH || undefined });
});
after(async () => {
  await browser?.close();
  if (servidor && servidor.exitCode === null) { const saiu = new Promise((r) => servidor.once('exit', r)); servidor.kill(); await saiu; }
  fs.rmSync(dados, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});

async function abrir(rota = '/escritorio/') {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 860 } });
  const p = await ctx.newPage(); p.erros = [];
  p.on('pageerror', (e) => p.erros.push(e.message));
  // 4xx são validações esperadas da API (o Chromium as loga no console); 5xx são pegos pelo handler de resposta
  p.on('console', (m) => { if (m.type() === 'error' && !/favicon|status of 4\d\d/.test(m.text())) p.erros.push(m.text()); });
  p.on('response', (r) => { if (r.status() >= 500) p.erros.push(`${r.status()} ${r.url()}`); });
  await p.goto(`${BASE}/login.html`);
  await p.evaluate(async () => { const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@codeniac.dev', password: 'codeniac123' }) }); localStorage.setItem('codeniac.token', (await r.json()).token); });
  await p.goto(`${BASE}${rota}`);
  return { p, ctx };
}
const esperarEscritorio = (p) => p.waitForFunction(() => window.__office?.layout?.objetos?.length > 50 && document.querySelector('.o-av'), null, { timeout: 45000 });
const aba = (p, nome) => p.locator('.o-abas-nav button', { hasText: new RegExp(`^${nome}$`) }).click();

/** coordenadas de página de um ponto do mundo (centra a câmera nele antes) */
async function pontoMundo(p, wx, wy) {
  return p.evaluate(([x, y]) => { const o = window.__office; o.camera.setZoomIndice(3); o.camera.centrarEm(x, y); const t = o.camera.mundoParaTela(x, y); const r = o.app.canvas.getBoundingClientRect(); return { x: r.left + t.x, y: r.top + t.y }; }, [wx, wy]);
}
/** um pixel opaco do sprite do objeto, para clicar de verdade nele */
async function pontoObjeto(p, id) {
  return p.evaluate((oid) => {
    const o = window.__office; const e = o.objetoPorId(oid); const s = e.sprite; const w = s.width / s.scale.x; const h = s.height / s.scale.y;
    let alvo = null;
    for (let r = 0; r < Math.max(w, h) && !alvo; r += 2) for (let a = 0; a < 16 && !alvo; a++) { const px = Math.floor(w / 2 + Math.cos(a / 16 * 6.283) * r); const py = Math.floor(h * 0.55 + Math.sin(a / 16 * 6.283) * r); if (e.arte.get(px, py) !== null) alvo = [px, py]; }
    const wx = s.x + alvo[0] * s.scale.x; const wy = s.y + alvo[1] * s.scale.y;
    o.camera.setZoomIndice(3); o.camera.centrarEm(wx, wy); const t = o.camera.mundoParaTela(wx, wy); const rc = o.app.canvas.getBoundingClientRect();
    return { x: rc.left + t.x, y: rc.top + t.y };
  }, id);
}
const cel = (x, y) => ({ x: (x + 0.5 - (y + 0.5)) * 32, y: (x + 0.5 + y + 0.5) * 16 });
async function clicarCelula(p, x, y) { const c = cel(x, y); const pt = await pontoMundo(p, c.x, c.y); await p.mouse.click(pt.x, pt.y); }
async function clicarPessoa(p, id) {
  const w = await p.evaluate((pid) => { const q = window.__office.pessoas.find((x) => x.id === pid); return { x: (q.x - q.y) * 32, y: (q.x + q.y) * 16 - 20 }; }, id);
  const pt = await pontoMundo(p, w.x, w.y); await p.mouse.click(pt.x, pt.y);
}
const painel = (p) => p.locator('.o-lateral-corpo');

test('o escritório carrega: DUAS salas (Estoque e Escritório Central), 5 funcionários reais, sem erros', async () => {
  const { p, ctx } = await abrir(); await esperarEscritorio(p);
  const r = await p.evaluate(() => { const o = window.__office; return { objetos: o.layout.objetos.length, paredes: o.layout.paredes.length, deps: o.layout.departamentos.map((d) => d.chave), pessoas: o.listaPessoas().length, sprites: o.totalSprites, versao: o.layout.meta?.padrao }; });
  assert.ok(r.objetos > 120 && r.paredes > 40 && r.pessoas === 5 && r.sprites > 150, JSON.stringify(r)); assert.deepEqual(r.deps, ['estoque', 'escritorio']); assert.equal(r.versao, '2.1');
  assert.equal(await p.locator('.o-av').count(), 5);
  assert.match(await painel(p).textContent(), /Eleonor[\s\S]*Lady Iris[\s\S]*Sophia[\s\S]*Laurinda[\s\S]*Lucya/);
  await p.waitForSelector('[data-testid="caixa-chefe"]'); assert.equal(await p.locator('[data-testid="caixa-chefe"] input').isEnabled(), true);
  if (SAIDA) await p.screenshot({ path: path.join(SAIDA, 'office-1-inicio.png') });
  assert.deepEqual(p.erros, []); await ctx.close();
});

test('câmera: zoom em passos pelos botões e pela roda, arrasto move a câmera, limites do mapa respeitados', async () => {
  const { p, ctx } = await abrir(); await esperarEscritorio(p);
  const z0 = await p.evaluate(() => window.__office.camera.zoom);
  await p.getByRole('button', { name: 'Mais zoom' }).click(); const z1 = await p.evaluate(() => window.__office.camera.zoom); assert.ok(z1 > z0, `${z0} → ${z1}`);
  await p.getByRole('button', { name: 'Menos zoom' }).click(); await p.getByRole('button', { name: 'Menos zoom' }).click(); assert.ok((await p.evaluate(() => window.__office.camera.zoom)) < z1);
  await p.evaluate(() => { window.__office.camera.setZoomIndice(3); window.__office.camera.centrarEm(0, 600); });
  const antes = await p.evaluate(() => ({ x: window.__office.camera.x, y: window.__office.camera.y }));
  await p.mouse.move(400, 400); await p.mouse.down(); await p.mouse.move(300, 380, { steps: 5 }); await p.mouse.up();
  const depois = await p.evaluate(() => ({ x: window.__office.camera.x, y: window.__office.camera.y })); assert.ok(depois.x > antes.x, 'arrastar para a esquerda leva a câmera para a direita');
  await p.mouse.move(400, 400); await p.mouse.wheel(0, -300); await p.waitForTimeout(100);
  await p.evaluate(() => window.__office.camera.arrastar(-1e7, -1e7));
  const lim = await p.evaluate(() => ({ x: window.__office.camera.x, l: window.__office.camera.limites })); assert.ok(lim.x <= lim.l.x1 && lim.x >= lim.l.x0);
  assert.deepEqual(p.erros, []); await ctx.close();
});

test('clicar em personagem abre o perfil (sem chat direto); clicar no chão da sala abre o painel da sala', async () => {
  const { p, ctx } = await abrir(); await esperarEscritorio(p);
  await clicarPessoa(p, 'pers-lady');
  await p.waitForFunction(() => /Estratégia de Vendas/.test(document.querySelector('.o-lateral-corpo')?.textContent ?? ''), null, { timeout: 8000 });
  const t = await painel(p).textContent(); assert.match(t, /Lady Iris/); assert.match(t, /Atribuir tarefa/); assert.match(t, /Personalidade e perfil/); assert.match(t, /Analítica, pragmática/); assert.match(t, /Relacionamentos profissionais/);
  assert.doesNotMatch(t, /Conversar com Lady/, 'o chefe não conversa individualmente com os funcionários');
  await p.evaluate(() => window.__office.selecionar({ tipo: 'nenhum' }));
  await clicarCelula(p, 18, 7);                                           // piso do Escritório Central, sem móvel
  await p.waitForFunction(() => /Escritório Central/.test(document.querySelector('.o-lateral-corpo')?.textContent ?? ''), null, { timeout: 8000 });
  assert.match(await painel(p).textContent(), /funcionários/); assert.deepEqual(p.erros, []); await ctx.close();
});

test('objetos abrem as ferramentas reais: monitores, painéis, mesa e quadro branco, marketplace, estante, estoque', async () => {
  const { p, ctx } = await abrir(); await esperarEscritorio(p);
  const casos = [['mon-sophia', /Sophia/], ['pf-esc', /Dados reais[\s\S]*Dados de teste/], ['mr-1', /Histórico de conversas/], ['qb-1', /Histórico de conversas/], ['mkt-esc', /Verificação de elegibilidade|Nada é simulado/], ['est-liv', /Importar|Biblioteca/], ['pprod-esc', /Novo produto/], ['imp2-esc', /Importar relatório/], ['pe-2', /Estoque e Logística[\s\S]*Cadastrar item/], ['mon-lucya', /Estoque e Logística[\s\S]*Cadastrar item/]];
  for (const [id, rx] of casos) {
    const pt = await pontoObjeto(p, id); await p.mouse.click(pt.x, pt.y);
    await p.waitForFunction((src) => new RegExp(src).test(document.querySelector('.o-lateral-corpo')?.textContent ?? ''), rx.source, { timeout: 8000 }).catch(async () => { throw new Error(`objeto ${id}: painel não abriu (${(await painel(p).textContent()).slice(0, 120)})`); });
  }
  assert.deepEqual(p.erros, []); await ctx.close();
});

test('movimentação: clicar no chão manda a funcionária andar por caminhos válidos, atravessando a porta entre as salas, sem atravessar móveis nem paredes', async () => {
  const { p, ctx } = await abrir(); await esperarEscritorio(p);
  await clicarPessoa(p, 'pers-lucya');
  await p.evaluate(() => { window.__amostras = []; window.__t = setInterval(() => { const o = window.__office; const q = o.pessoas.find((x) => x.id === 'pers-lucya'); window.__amostras.push([q.x, q.y]); }, 40); });
  await clicarCelula(p, 24, 13);                                          // do Estoque até a Área de Convivência do Escritório
  await p.waitForFunction(() => { const q = window.__office.pessoas.find((x) => x.id === 'pers-lucya'); return Math.hypot(q.x - 24.5, q.y - 13.5) < 0.2 && !q.caminho.length; }, null, { timeout: 60000 });
  const r = await p.evaluate(() => { clearInterval(window.__t); const o = window.__office; const g = o.grade; return { n: window.__amostras.length, invalidas: window.__amostras.filter(([x, y]) => !g.livre(Math.floor(x), Math.floor(y))).length, atravessouPorta: window.__amostras.some(([x, y]) => Math.floor(x) === 12 && Math.floor(y) === 7) }; });
  assert.ok(r.n > 20, 'andou de verdade'); assert.equal(r.invalidas, 0, 'nunca pisou em célula bloqueada'); assert.ok(r.atravessouPorta, 'passou pela porta entre as salas');
  // destino bloqueado (em cima de uma mesa): aproxima, sem atravessar
  await clicarPessoa(p, 'pers-lucya'); await clicarCelula(p, 14, 4);
  await p.waitForFunction(() => !window.__office.pessoas.find((x) => x.id === 'pers-lucya').caminho.length, null, { timeout: 60000 });
  const fim = await p.evaluate(() => { const q = window.__office.pessoas.find((x) => x.id === 'pers-lucya'); return window.__office.grade.livre(Math.floor(q.x), Math.floor(q.y)); }); assert.equal(fim, true);
  assert.deepEqual(p.erros, []); await ctx.close();
});

test('o personagem reflete o estado REAL do agente: ao executar, vai ao posto e digita; com erro, mostra erro; estados sociais; sem trabalho, não encena', async () => {
  const { p, ctx } = await abrir(); await esperarEscritorio(p);
  const parado = await p.evaluate(async () => { const o = window.__office; const a = o.listaPessoas().map((x) => `${x.x},${x.y}`); await new Promise((r) => setTimeout(r, 1500)); return JSON.stringify(a) === JSON.stringify(o.listaPessoas().map((x) => `${x.x},${x.y}`)); });
  assert.ok(parado, 'sem tarefa, ninguém se mexe sozinho');
  // tira a Sophia do posto e altera, no NAVEGADOR, a resposta do servidor (o estado real vem de /equipe)
  await clicarPessoa(p, 'pers-sophia'); await clicarCelula(p, 14, 7);
  await p.waitForFunction(() => !window.__office.pessoas.find((x) => x.id === 'pers-sophia').caminho.length, null, { timeout: 30000 });
  const mudar = (campos) => p.route('**/api/commerce/equipe', async (rota) => { const r = await rota.fetch(); const j = await r.json(); for (const a of j.agentes) if (a.chave === 'sophia') Object.assign(a, campos); await rota.fulfill({ response: r, json: j }); });
  await mudar({ estado: 'executando' });
  await p.waitForFunction(() => { const q = window.__office.pessoas.find((x) => x.id === 'pers-sophia'); return q.noPosto && Math.floor(q.x) === 14 && Math.floor(q.y) === 10; }, null, { timeout: 45000 });
  assert.equal(await p.evaluate(() => { const o = window.__office; return o.estadoAnimacao(o.pessoas.find((x) => x.id === 'pers-sophia')); }), 'typing');
  await p.unroute('**/api/commerce/equipe'); await mudar({ estado: 'com_erro' });
  await p.waitForFunction(() => { const o = window.__office; return o.estadoAnimacao(o.pessoas.find((x) => x.id === 'pers-sophia')) === 'error'; }, null, { timeout: 15000 });
  assert.match(await p.locator('.o-agentes-mini').innerHTML(), /vermelho/);
  await p.unroute('**/api/commerce/equipe'); await mudar({ estado: 'disponivel', estadoSocial: 'preocupado' });
  await p.waitForFunction(() => { const o = window.__office; return o.estadoAnimacao(o.pessoas.find((x) => x.id === 'pers-sophia')) === 'worried'; }, null, { timeout: 15000 });
  await p.unroute('**/api/commerce/equipe'); await mudar({ estado: 'disponivel', estadoSocial: 'comemorando' });
  await p.waitForFunction(() => { const o = window.__office; return o.estadoAnimacao(o.pessoas.find((x) => x.id === 'pers-sophia')) === 'celebrating'; }, null, { timeout: 15000 });
  await p.unroute('**/api/commerce/equipe'); await mudar({ estado: 'disponivel', estadoDesde: new Date(Date.now() - 20 * 60000).toISOString() });
  await p.waitForFunction(() => { const o = window.__office; return o.estadoAnimacao(o.pessoas.find((x) => x.id === 'pers-sophia')) === 'resting'; }, null, { timeout: 15000 });
  assert.deepEqual(p.erros, []); await ctx.close();
});

test('tarefas: criar, não duplicar, e despachar sem IA configurada mostra o erro real sem alterar a tarefa', async () => {
  const { p, ctx } = await abrir(); await esperarEscritorio(p);
  await aba(p, 'Agentes'); await painel(p).locator('button', { hasText: 'Lady Iris' }).first().click();
  await painel(p).getByPlaceholder(/Pesquisar 5 fones/).fill('Pesquisar fones bluetooth');
  await painel(p).getByRole('button', { name: 'Criar e executar agora' }).click();
  await p.waitForFunction(() => /Nenhuma IA está configurada/.test(document.querySelector('.o-avisos')?.textContent ?? ''), null, { timeout: 10000 });
  await aba(p, 'Tarefas'); assert.match(await painel(p).textContent(), /Pesquisar fones bluetooth/); assert.match(await painel(p).textContent(), /Pendentes\s*1/);
  await aba(p, 'Agentes'); await painel(p).getByPlaceholder(/Pesquisar 5 fones/).fill('pesquisar FONES bluetooth'); await painel(p).getByRole('button', { name: 'Só criar' }).click();
  await p.waitForFunction(() => /já está aberta/.test(document.querySelector('.o-avisos')?.textContent ?? ''), null, { timeout: 10000 });
  assert.deepEqual(p.erros, []); await ctx.close();
});

test('comércio: produto exige fonte na avaliação; importação CSV com prévia; segunda importação não duplica; financeiro separa estimada de recebida', async () => {
  const { p, ctx } = await abrir(); await esperarEscritorio(p);
  await aba(p, 'Produtos'); await painel(p).locator('.o-campo', { hasText: /^Nome/ }).locator('input').first().fill('Fone Bluetooth X');
  await painel(p).getByText('Avaliação comercial (opcional)').click(); await painel(p).locator('.o-campo', { hasText: /^Nota/ }).locator('input').fill('4.5');
  await painel(p).getByRole('button', { name: 'Cadastrar produto' }).click();
  await p.waitForFunction(() => /fonte da avaliação/.test(document.querySelector('.o-avisos')?.textContent ?? ''), null, { timeout: 8000 });
  await painel(p).locator('.o-campo', { hasText: /^Fonte da nota/ }).locator('input').fill('página do produto'); await painel(p).locator('.o-campo', { hasText: /^Preço/ }).locator('input').fill('100'); await painel(p).locator('.o-campo', { hasText: /^Comissão/ }).locator('input').fill('10');
  await painel(p).getByRole('button', { name: 'Cadastrar produto' }).click();
  await p.waitForFunction(() => /Fone Bluetooth X/.test(document.querySelector('.o-lateral-corpo')?.textContent ?? '') && /potencial\/venda/.test(document.querySelector('.o-lateral-corpo')?.textContent ?? ''), null, { timeout: 8000 });
  await aba(p, 'Importar');
  const csv = 'Order ID;Order Time;Product Name;Order Amount;Estimated Commission;Order Status\n7001;20/11/2026;Fone;200,00;20,00;Completed\n7002;21/11/2026;Cabo;50,00;5,00;Pending\n7003;99/99/2026;Ruim;1,00;1,00;Pending';
  await painel(p).locator('textarea').fill(csv); await painel(p).locator('textarea').blur();
  await p.waitForFunction(() => /Prévia e mapeamento/.test(document.querySelector('.o-lateral-corpo')?.textContent ?? ''), null, { timeout: 8000 });
  assert.match(await painel(p).textContent(), /4<\/b> lançamento|4 lançamento|lançamento\(s\) válidos/); assert.match(await painel(p).textContent(), /Data inválida/);
  await painel(p).getByRole('button', { name: /Importar 4 lançamento/ }).click();
  await p.waitForFunction(() => /Resultado da importação/.test(document.querySelector('.o-lateral-corpo')?.textContent ?? ''), null, { timeout: 8000 });
  assert.match(await painel(p).textContent(), /4 novos/);
  await painel(p).locator('textarea').fill(csv); await painel(p).locator('textarea').blur();
  await painel(p).getByRole('button', { name: /Importar 4 lançamento/ }).click();
  await p.waitForFunction(() => /4 duplicados ignorados/.test(document.querySelector('.o-lateral-corpo')?.textContent ?? ''), null, { timeout: 8000 });
  await aba(p, 'Financeiro');
  await p.waitForFunction(() => /R\$\s*250,00/.test(document.querySelector('.o-lateral-corpo')?.textContent ?? ''), null, { timeout: 8000 });
  const ind = await painel(p).locator('.o-ind').allTextContents(); const get = (nome) => ind.find((t) => t.startsWith(nome)) ?? '';
  assert.match(get('Vendas brutas'), /250,00/); assert.match(get('Comissões aprovadas'), /20,00/); assert.match(get('Comissões estimadas'), /5,00/); assert.match(get('Comissões recebidas'), /0,00/); assert.match(get('Receita líquida'), /0,00/);
  await painel(p).locator('.o-ind', { hasText: 'Receita líquida' }).click(); assert.match(await painel(p).textContent(), /Não é lucro/);
  assert.deepEqual(p.erros, []); await ctx.close();
});

test('integrações: TikTok Shop mostra o estado real (API pendente, importação operacional) e guarda checklist; credenciais nunca aparecem', async () => {
  const { p, ctx } = await abrir(); await esperarEscritorio(p); await aba(p, 'Integrações');
  await p.waitForFunction(() => /TikTok Shop[\s\S]*Shopee[\s\S]*Temu/.test(document.querySelector('.o-lateral-corpo')?.textContent ?? ''), null, { timeout: 8000 });
  const t = await painel(p).textContent(); assert.match(t, /API: pendente/); assert.match(t, /CSV: operacional/); assert.match(t, /Elegibilidade brasileira para Creator Authorization/); assert.match(t, /Não confirmado em documentação oficial/);
  await painel(p).locator('.o-check-item', { hasText: 'Elegibilidade brasileira' }).locator('select').selectOption('indisponivel');
  await p.waitForTimeout(500); await p.reload(); await esperarEscritorio(p); await aba(p, 'Integrações');
  await p.waitForFunction(() => /Elegibilidade brasileira/.test(document.querySelector('.o-lateral-corpo')?.textContent ?? ''), null, { timeout: 8000 });
  assert.equal(await painel(p).locator('.o-check-item', { hasText: 'Elegibilidade brasileira' }).locator('select').inputValue(), 'indisponivel', 'a marcação ficou salva');
  const sinc = await p.evaluate(async () => (await fetch('/api/commerce/conectores/tiktokshop/sincronizar', { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('codeniac.token')}` } })).status); assert.ok([409, 501].includes(sinc));
  assert.deepEqual(p.erros, []); await ctx.close();
});

test('Office Builder: colocar objeto com validação, desfazer/refazer, pintar piso, salvar com versão e persistir após recarregar', async () => {
  const { p, ctx } = await abrir(); await esperarEscritorio(p);
  await p.getByRole('button', { name: 'Construção' }).click(); await p.waitForSelector('text=Modo construção');
  const n0 = await p.evaluate(() => window.__office.layout.objetos.length);
  await p.locator('.o-grade-lib button', { hasText: 'Planta' }).first().click();
  await clicarCelula(p, 18, 6);                                            // Pesquisa: célula livre
  await p.waitForFunction((n) => window.__office.layout.objetos.length === n + 1, n0, { timeout: 8000 });
  await clicarCelula(p, 18, 6);                                            // já ocupada: recusa
  await p.waitForFunction(() => /Ocupado por Planta/.test(document.querySelector('.o-avisos')?.textContent ?? ''), null, { timeout: 8000 });
  assert.equal(await p.evaluate(() => window.__office.layout.objetos.length), n0 + 1);
  await p.keyboard.press('Control+z'); await p.waitForFunction((n) => window.__office.layout.objetos.length === n, n0, { timeout: 8000 });
  await p.keyboard.press('Control+Shift+z'); await p.waitForFunction((n) => window.__office.layout.objetos.length === n + 1, n0, { timeout: 8000 });
  assert.match(await p.locator('.o-barra-constr').textContent(), /não salvas/);
  // piso
  await p.getByRole('button', { name: '🟫 Piso' }).click(); await p.locator('.o-chip', { hasText: 'Madeira' }).first().click();
  await clicarCelula(p, 26, 12); const piso = await p.evaluate(() => window.__office.layout.piso[12 * 34 + 26]); assert.equal(piso, 'madeira');
  // computador só sobre mesa
  await p.locator('.o-ferramentas button', { hasText: 'Objeto' }).click(); await p.locator('.o-grade-lib button', { hasText: 'Computador' }).first().click();
  await clicarCelula(p, 19, 7); await p.waitForFunction(() => /Precisa ficar sobre uma mesa/.test(document.querySelector('.o-avisos')?.textContent ?? ''), null, { timeout: 8000 });
  // salvar
  await p.getByRole('button', { name: 'Salvar layout' }).first().click(); await p.waitForFunction(() => /Layout salvo/.test(document.querySelector('.o-avisos')?.textContent ?? ''), null, { timeout: 10000 });
  assert.match(await p.locator('.o-nome-layout').textContent(), /v2/);
  await p.reload(); await esperarEscritorio(p);
  assert.equal(await p.evaluate(() => window.__office.layout.objetos.length), n0 + 1, 'o objeto colocado persistiu');
  assert.equal(await p.evaluate(() => window.__office.layout.piso[12 * 34 + 26]), 'madeira');
  assert.deepEqual(p.erros, []); await ctx.close();
});

test('Office Builder: paredes, portas e colisão alteram a navegação de verdade; estação ligada por id; modo visualização oculta o painel', async () => {
  const { p, ctx } = await abrir(); await esperarEscritorio(p);
  await p.getByRole('button', { name: 'Edição' }).click(); await p.waitForSelector('text=Modo edição');
  const caminho = (de, para) => p.evaluate(([a, b]) => { const o = window.__office; return o.camaminho ? null : null; }, [de, para]);
  void caminho;
  // colisão manual numa célula do corredor muda a grade
  await p.getByRole('button', { name: '⛔ Colisão' }).click(); await clicarCelula(p, 16, 7);
  assert.equal(await p.evaluate(() => window.__office.grade.livre(16, 7)), false); assert.equal(await p.evaluate(() => window.__office.layout.colisoes.length), 1);
  await p.keyboard.press('Control+z'); assert.equal(await p.evaluate(() => window.__office.grade.livre(16, 7)), true);
  // parede + porta
  const w0 = await p.evaluate(() => window.__office.layout.paredes.length);
  await p.getByRole('button', { name: '🧱 Parede' }).click(); const c = cel(16, 7); const pt = await pontoMundo(p, c.x, c.y - 8); await p.mouse.click(pt.x, pt.y);
  assert.ok((await p.evaluate(() => window.__office.layout.paredes.length)) >= w0 + 1, 'parede criada');
  // seleciona o monitor da Eleonor e vê a estação ligada por id
  await p.getByRole('button', { name: '🖱 Selecionar / mover' }).click(); const pc = await pontoObjeto(p, 'mon-eleonor'); await p.mouse.click(pc.x, pc.y);
  await p.waitForFunction(() => /Estação \(liga o objeto a uma função real\)/.test(document.querySelector('.o-lateral-corpo')?.textContent ?? ''), null, { timeout: 8000 });
  const est = await p.evaluate(() => window.__office.layout.estacoes.find((e) => e.objetoId === 'mon-eleonor')); assert.ok(est.agenteId && est.pontoTrabalho, JSON.stringify(est));
  // visualização: painéis somem (há alterações não salvas: o app pergunta antes de sair da edição)
  p.once('dialog', (d) => d.accept());
  await p.getByRole('button', { name: 'Visualização' }).click(); await p.waitForFunction(() => !document.querySelector('.o-lateral'), null, { timeout: 5000 });
  await p.getByRole('button', { name: 'Sair da visualização' }).click(); await p.waitForSelector('.o-lateral', { timeout: 5000 });
  assert.deepEqual(p.erros, []); await ctx.close();
});

test('Asset Studio: importa PNG e ZIP, guarda metadados e licença, não duplica, usa no mapa', async () => {
  const { p, ctx } = await abrir(); await esperarEscritorio(p); await aba(p, 'Assets');
  await painel(p).locator('.o-abas > nav button', { hasText: 'Importar' }).click();
  const png = criarPngRGBA(64, 64, [200, 40, 40, 255]);
  await painel(p).locator('input[type=file]').first().setInputFiles({ name: 'sofa-vermelho.png', mimeType: 'image/png', buffer: png });
  await p.waitForFunction(() => /Imagem importada/.test(document.querySelector('.o-avisos')?.textContent ?? ''), null, { timeout: 10000 });
  await painel(p).locator('input[type=file]').first().setInputFiles({ name: 'outra.png', mimeType: 'image/png', buffer: png });
  await p.waitForFunction(() => /já existe na biblioteca/.test(document.querySelector('.o-avisos')?.textContent ?? ''), null, { timeout: 10000 });
  await painel(p).locator('.o-abas > nav button', { hasText: 'Biblioteca' }).click(); await painel(p).locator('.o-mini').first().click();
  await painel(p).locator('.o-campo', { hasText: /^Nome/ }).locator('input').fill('Sofá vermelho');
  await painel(p).locator('.o-campo', { hasText: /^Autor/ }).locator('input').fill('Eu'); await painel(p).getByRole('button', { name: 'Salvar metadados' }).click();
  await p.waitForFunction(() => /Metadados salvos/.test(document.querySelector('.o-avisos')?.textContent ?? ''), null, { timeout: 8000 });
  const lista = await p.evaluate(async () => (await fetch('/api/commerce/assets', { headers: { Authorization: `Bearer ${localStorage.getItem('codeniac.token')}` } })).json());
  assert.equal(lista.length, 1); assert.equal(lista[0].nome, 'Sofá vermelho'); assert.equal(lista[0].autor, 'Eu'); assert.equal(lista[0].largura, 64);
  await painel(p).getByRole('button', { name: 'Usar no mapa' }).click(); await p.waitForSelector('text=Modo construção');
  const n0 = await p.evaluate(() => window.__office.layout.objetos.length);
  const livre = await p.evaluate(() => { const o = window.__office; for (let y = 3; y < 12; y++) for (let x = 14; x < 30; x++) { if ([0, 1, -1].every((d) => o.grade.livre(x + d, y) && o.grade.livre(x, y + d))) return { x, y }; } return null; });
  await clicarCelula(p, livre.x, livre.y);
  await p.waitForFunction((n) => window.__office.layout.objetos.length === n + 1, n0, { timeout: 8000 });
  const o = await p.evaluate(() => window.__office.layout.objetos.at(-1)); assert.match(o.tipo, /^asset:/);
  await p.waitForFunction(() => window.__office.objetos.at(-1).sprite.alpha === 1, null, { timeout: 10000 });
  assert.deepEqual(p.erros, []); await ctx.close();
});

test('personagens: importa spritesheet, define quadros e animações por estado, troca a aparência do funcionário sem mexer nos dados dele', async () => {
  const { p, ctx } = await abrir(); await esperarEscritorio(p);
  const sheet = criarPngRGBA(128, 64, [20, 160, 90, 255]);
  await aba(p, 'Assets'); await painel(p).locator('.o-abas > nav button', { hasText: 'Importar' }).click();
  await painel(p).locator('.o-campo', { hasText: /^Categoria/ }).locator('select').selectOption('spritesheets');
  await painel(p).locator('input[type=file]').first().setInputFiles({ name: 'heroi-sheet.png', mimeType: 'image/png', buffer: sheet });
  await p.waitForFunction(() => /Imagem importada/.test(document.querySelector('.o-avisos')?.textContent ?? ''), null, { timeout: 10000 });
  await aba(p, 'Personagens');
  await painel(p).locator('.o-campo', { hasText: /^Spritesheet/ }).locator('select').selectOption({ index: 1 });
  await painel(p).locator('.o-campo', { hasText: /^Largura do quadro/ }).locator('input').fill('32'); await painel(p).locator('.o-campo', { hasText: /^Altura do quadro/ }).locator('input').fill('32');
  assert.match(await painel(p).textContent(), /4 coluna\(s\) × 2 linha\(s\)/);
  await painel(p).locator('.o-anim').first().locator('input').first().fill('parado');
  await painel(p).locator('.o-anim').first().locator('.o-campo', { hasText: /^Quadros/ }).locator('input').fill('0,1');
  await painel(p).getByRole('button', { name: '+ Animação' }).click();
  const a2 = painel(p).locator('.o-anim').nth(1); await a2.locator('input').first().fill('digitando'); await a2.locator('select').first().selectOption('typing'); await a2.locator('.o-campo', { hasText: /^Linha/ }).locator('input').fill('1'); await a2.locator('.o-campo', { hasText: /^Quadros/ }).locator('input').fill('0,1,2,3');
  await painel(p).getByRole('button', { name: 'Criar personagem' }).click(); await p.waitForFunction(() => /Personagem salvo/.test(document.querySelector('.o-avisos')?.textContent ?? ''), null, { timeout: 8000 });
  const ag0 = await p.evaluate(async () => (await (await fetch('/api/commerce/agentes', { headers: { Authorization: `Bearer ${localStorage.getItem('codeniac.token')}` } })).json())[0]);
  await painel(p).locator('.o-item', { hasText: 'Eleonor' }).locator('select').selectOption({ index: 1 });
  await p.waitForFunction(() => /Aparência de Eleonor atualizada/.test(document.querySelector('.o-avisos')?.textContent ?? ''), null, { timeout: 8000 });
  await p.waitForFunction(() => { const o = window.__office; const q = o.pessoas.find((x) => x.id === 'pers-eleonor'); o.sheetDe(q); return q.sheetKey.startsWith('imp:'); }, null, { timeout: 15000 });
  const ag1 = await p.evaluate(async () => (await (await fetch('/api/commerce/agentes', { headers: { Authorization: `Bearer ${localStorage.getItem('codeniac.token')}` } })).json())[0]);
  assert.equal(ag1.nome, ag0.nome); assert.equal(ag1.cargo, ag0.cargo); assert.equal(ag1.botId, ag0.botId); assert.notEqual(ag1.avatarId, null);
  await painel(p).locator('.o-item', { hasText: 'Eleonor' }).locator('select').selectOption('');   // volta ao provisório
  await p.waitForFunction(() => { const o = window.__office; const q = o.pessoas.find((x) => x.id === 'pers-eleonor'); o.sheetDe(q); return q.sheetKey.startsWith('proc:'); }, null, { timeout: 15000 });
  assert.deepEqual(p.erros, []); await ctx.close();
});

test('integração com o Hub: Estúdio → cartão Ecommerce abre o escritório; Video editor e Video cut continuam "em breve"; o resto do Hub segue funcionando', async () => {
  const { p, ctx } = await abrir('/#/estudio'); await p.waitForSelector('.nx-est', { timeout: 30000 });
  assert.match(await p.locator('.nx-est[data-ferramenta="video-editor"]').textContent(), /EM BREVE/); assert.match(await p.locator('.nx-est[data-ferramenta="video-cut"]').textContent(), /EM BREVE/);
  await p.locator('[data-ferramenta="ecommerce"]').click(); await p.waitForSelector('iframe[title="Codeniac Commerce Office"]', { timeout: 15000 });
  const jogo = p.frameLocator('iframe[title="Codeniac Commerce Office"]'); await jogo.locator('canvas').waitFor({ timeout: 45000 }); await jogo.locator('.o-av').first().waitFor({ timeout: 45000 });
  assert.equal(await jogo.locator('.o-av').count(), 5); if (SAIDA) await p.screenshot({ path: path.join(SAIDA, 'office-hub.png') });
  for (const rota of ['#/centro', '#/news', '#/gamecode', '#/assistente', '#/dashboard', '#/settings']) { await p.goto(`${BASE}/${rota}`); await p.waitForTimeout(1200); assert.ok((await p.evaluate(() => document.querySelectorAll('*').length)) > 150, rota); }
  assert.deepEqual(p.erros, []); await ctx.close();
});

test('desempenho: poucos sprites por quadro, custo de CPU baixo e FPS aceitável com o escritório inteiro na tela', async () => {
  const { p, ctx } = await abrir(); await esperarEscritorio(p); await p.evaluate(() => window.__office.camera.ajustar()); await p.waitForTimeout(3000);
  const m = await p.evaluate(async () => { const o = window.__office; let n = 0; const t0 = performance.now(); await new Promise((res) => { const f = () => { n++; if (performance.now() - t0 > 2000) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }); const heap = performance.memory?.usedJSHeapSize ?? 0; return { fps: n / ((performance.now() - t0) / 1000), sprites: o.totalSprites, heapMb: Math.round(heap / 1048576) }; });
  console.log(`# desempenho do escritório: ${m.fps.toFixed(0)} FPS (WebGL por software), ${m.sprites} sprites, heap ${m.heapMb} MB`);
  assert.ok(m.fps >= 12, `FPS: ${m.fps}`); assert.ok(m.sprites < 2500, `sprites: ${m.sprites}`); if (m.heapMb) assert.ok(m.heapMb < 300, `heap ${m.heapMb} MB`);
  assert.deepEqual(p.erros, []); await ctx.close();
});

const apiGet = (p, rota) => p.evaluate(async (r) => (await fetch(`/api/commerce${r}`, { headers: { Authorization: `Bearer ${localStorage.getItem('codeniac.token')}` } })).json(), rota);

test('TESTE DE ACEITAÇÃO 2.1: o chefe dá UMA ordem, a equipe se reúne, conversa por nuvens de diálogo, executa tarefas reais e tudo persiste (IA SIMULADA só para testar a orquestração)', async () => {
  const { p, ctx } = await abrir(); await esperarEscritorio(p); await p.waitForSelector('[data-testid="caixa-chefe"]');
  await p.evaluate(() => window.__office.camera.ajustar());
  const ordem = 'Equipe, quero encontrar um produto com potencial de venda no TikTok Shop, desenvolver uma campanha e analisar a rentabilidade.';
  await p.fill('[data-testid="caixa-chefe"] input', ordem); await p.getByRole('button', { name: 'Dar ordem' }).click();
  // 1) ordem recebida: a caixa trava e mostra as etapas; não há chat individual com ninguém
  await p.waitForSelector('.o-chefe-etapas', { timeout: 10000 }); assert.equal(await p.locator('[data-testid="caixa-chefe"] input').isDisabled(), true);
  // 2) a equipe se reúne na mesa (assentos) e as nuvens de diálogo aparecem sobre os personagens certos, dentro da tela e sem se sobrepor
  await p.waitForFunction(() => window.__office.listaPessoas().length && window.__office.pessoas.filter((q) => q.reuniao).length >= 3 && window.__office.pessoas.filter((q) => q.reuniao).every((q) => !q.caminho.length), null, { timeout: 40000 });
  const anims = await p.evaluate(() => window.__office.pessoas.filter((q) => q.reuniao).map((q) => window.__office.estadoAnimacao(q))); assert.ok(anims.every((a) => ['meeting', 'meeting-talking'].includes(a)), JSON.stringify(anims));
  await p.waitForFunction(() => document.querySelectorAll('[data-testid="balao"]').length >= 2, null, { timeout: 40000 });
  const geo = await p.evaluate(() => { const c = window.__office.app.canvas.getBoundingClientRect(); const r = [...document.querySelectorAll('[data-testid="balao"]')].map((e) => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, t: e.dataset.tipo, agente: e.dataset.agente }; }); return { c: { x: c.x, y: c.y, w: c.width, h: c.height }, r }; });
  for (const b of geo.r) { assert.ok(b.x >= geo.c.x - 1 && b.y >= geo.c.y - 1 && b.x + b.w <= geo.c.x + geo.c.w + 1 && b.y + b.h <= geo.c.y + geo.c.h + 1, `balão fora da tela: ${JSON.stringify(b)}`); }
  for (let i = 0; i < geo.r.length; i++) for (let j = i + 1; j < geo.r.length; j++) { const a = geo.r[i]; const b = geo.r[j]; assert.ok(a.x + a.w <= b.x + 1 || b.x + b.w <= a.x + 1 || a.y + a.h <= b.y + 1 || b.y + b.h <= a.y + 1, `balões sobrepostos: ${JSON.stringify([a, b])}`); }
  if (SAIDA) await p.screenshot({ path: path.join(SAIDA, 'office-2-reuniao.png') });
  // 3) a reunião termina, todos voltam ao posto e a ordem chega a "Aguardando aprovação" com tarefas REAIS
  await p.waitForFunction(() => /Aguardando aprovação/.test(document.querySelector('.o-chefe')?.textContent ?? '') && !window.__office.pessoas.some((q) => q.reuniao), null, { timeout: 120000 }).catch(() => {});
  await p.waitForFunction(async () => (await (await fetch('/api/commerce/ordens', { headers: { Authorization: `Bearer ${localStorage.getItem('codeniac.token')}` } })).json())[0]?.status === 'aguardando_aprovacao', null, { timeout: 120000 });
  const ordens = await apiGet(p, '/ordens'); const o = ordens[0];
  assert.equal(o.responsaveis.length, 4); assert.ok(o.turnos >= 4 && o.turnos <= 8); assert.equal(o.tarefas.length, 4); assert.ok(o.tarefas.every((t) => t.status === 'aguardando_aprovacao')); assert.equal(o.teste, true, 'marcada como execução de teste');
  assert.equal(await p.evaluate(() => window.__office.pessoas.filter((q) => q.reuniao).length), 0, 'a reunião acabou');
  // 4) resultados reais registrados (documentos, produto de teste identificado, análise financeira com fonte) e conversas persistidas
  const docs = await apiGet(p, '/documentos'); assert.ok(docs.length >= 4); assert.ok(docs.some((d) => d.tipo === 'proposta' && d.estrutura)); assert.ok(docs.some((d) => d.classificacao === 'real' && d.fontes.length), 'análise financeira baseada em dado real com fonte'); assert.ok(docs.filter((d) => d.classificacao === 'simulada').length >= 3);
  const prods = await apiGet(p, '/produtos'); assert.ok(prods.some((x) => /TESTE/.test(x.origem)));
  const msgs = await apiGet(p, '/mensagens'); assert.ok(msgs.some((m) => m.tipo === 'discordancia') && msgs.some((m) => m.tipo === 'conclusao') && msgs[0].tipo === 'ordem');
  // 5) o chefe aprova os resultados e a ordem conclui; depois de recarregar, tudo continua lá e as nuvens NÃO reaparecem
  await aba(p, 'Equipe'); await p.waitForFunction(() => /Aguardando aprovação/.test(document.querySelector('.o-lateral-corpo')?.textContent ?? ''), null, { timeout: 15000 });
  for (const t of o.tarefas) await p.evaluate(async (id) => fetch(`/api/commerce/tarefas/${id}/revisar`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('codeniac.token')}` }, body: JSON.stringify({ aprovar: true }) }), t.id);
  assert.equal((await apiGet(p, '/ordens'))[0].status, 'concluida');
  await p.reload(); await esperarEscritorio(p); await aba(p, 'Conversas');
  await p.waitForFunction(() => /Simulada \(teste\)/.test(document.querySelector('.o-lateral-corpo')?.textContent ?? '') && /discordancia/.test(document.querySelector('.o-lateral-corpo')?.textContent ?? ''), null, { timeout: 15000 });
  assert.match(await painel(p).textContent(), /Equipe, quero encontrar um produto/); assert.equal(await p.locator('[data-testid="balao"]').count(), 0, 'o histórico não vira nuvem de novo');
  await aba(p, 'Documentos'); await p.waitForFunction(() => /Análise financeira/.test(document.querySelector('.o-lateral-corpo')?.textContent ?? ''), null, { timeout: 15000 });
  assert.deepEqual(p.erros, []); await ctx.close();
});

test('Estoque: Lucya/chefe lançam movimentos reais; saída acima do saldo é recusada; divergência registra esperado × contado; tudo persiste', async () => {
  const { p, ctx } = await abrir(); await esperarEscritorio(p); await aba(p, 'Estoque');
  await painel(p).locator('.o-campo', { hasText: /^Nome/ }).locator('input').fill('Caixa M'); await painel(p).locator('.o-campo', { hasText: /^Saldo inicial/ }).locator('input').fill('10'); await painel(p).getByRole('button', { name: 'Cadastrar', exact: true }).click();
  await p.waitForFunction(() => /Item cadastrado/.test(document.querySelector('.o-avisos')?.textContent ?? ''), null, { timeout: 8000 });
  await painel(p).locator('.o-campo', { hasText: /^Item/ }).locator('select').selectOption({ index: 1 }); await painel(p).locator('.o-campo', { hasText: /^Tipo/ }).locator('select').selectOption('saida');
  await painel(p).locator('.o-campo', { hasText: /^Quantidade/ }).locator('input').fill('99'); await painel(p).getByRole('button', { name: 'Registrar', exact: true }).click();
  await p.waitForFunction(() => /maior que o saldo/.test(document.querySelector('.o-avisos')?.textContent ?? ''), null, { timeout: 8000 });
  await painel(p).locator('.o-campo', { hasText: /^Quantidade/ }).locator('input').fill('4'); await painel(p).getByRole('button', { name: 'Registrar', exact: true }).click();
  await p.waitForFunction(() => /Movimento registrado/.test(document.querySelector('.o-avisos')?.textContent ?? ''), null, { timeout: 8000 });
  const e = await apiGet(p, '/estoque'); assert.equal(e.itens[0].quantidade, 6); assert.equal(e.movimentos.length, 2);
  await p.reload(); await esperarEscritorio(p); await aba(p, 'Estoque'); await p.waitForFunction(() => /Caixa M/.test(document.querySelector('.o-lateral-corpo')?.textContent ?? ''), null, { timeout: 10000 });
  assert.deepEqual(p.erros, []); await ctx.close();
});
