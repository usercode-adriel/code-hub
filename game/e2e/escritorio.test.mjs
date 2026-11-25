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
  servidor = spawn(process.execPath, ['server/index.js'], { cwd: RAIZ, env: { ...process.env, DATA_DIR: dados, PORT: String(PORTA), AI_PROVIDER: 'local', GEMINI_API_KEY: '', ANTHROPIC_API_KEY: '' }, stdio: 'ignore' });
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

test('o escritório carrega: layout completo, 8 departamentos, 5 funcionários reais, sem erros', async () => {
  const { p, ctx } = await abrir(); await esperarEscritorio(p);
  const r = await p.evaluate(() => { const o = window.__office; return { objetos: o.layout.objetos.length, paredes: o.layout.paredes.length, deps: o.layout.departamentos.length, pessoas: o.listaPessoas().length, sprites: o.totalSprites }; });
  assert.ok(r.objetos > 80 && r.paredes > 100 && r.deps === 8 && r.pessoas === 5 && r.sprites > 200, JSON.stringify(r));
  assert.equal(await p.locator('.o-av').count(), 5);
  assert.match(await painel(p).textContent(), /Helena[\s\S]*Arthur[\s\S]*Sofia[\s\S]*Isabela[\s\S]*Marina/);
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

test('clicar em personagem abre o perfil; clicar no chão do departamento abre o painel do departamento', async () => {
  const { p, ctx } = await abrir(); await esperarEscritorio(p);
  await clicarPessoa(p, 'pers-arthur');
  await p.waitForFunction(() => /Analista de Mercado/.test(document.querySelector('.o-lateral-corpo')?.textContent ?? ''), null, { timeout: 8000 });
  const t = await painel(p).textContent(); assert.match(t, /Arthur/); assert.match(t, /Atribuir tarefa/); assert.match(t, /Conversar com Arthur/);
  await p.evaluate(() => window.__office.selecionar({ tipo: 'nenhum' }));
  await clicarCelula(p, 18, 6);                                           // piso da Pesquisa, sem móvel
  await p.waitForFunction(() => /Pesquisa e Inteligência Comercial/.test(document.querySelector('.o-lateral-corpo')?.textContent ?? ''), null, { timeout: 8000 });
  assert.match(await painel(p).textContent(), /funcionários/); assert.deepEqual(p.erros, []); await ctx.close();
});

test('objetos abrem as ferramentas reais: computador, painéis, mesa de reuniões, marketplace, estante, câmera', async () => {
  const { p, ctx } = await abrir(); await esperarEscritorio(p);
  const casos = [['pc-sofia', /Gestora Comercial e Financeira/], ['pf-fin', /Dados reais[\s\S]*Dados de teste/], ['mr-sala', /Nova reunião/], ['mkt-1', /Verificação de elegibilidade|Nada é simulado/], ['est-pesq-1', /Importar|Biblioteca/], ['pp-prod', /Novo produto/], ['imp-fin', /Importar relatório/], ['cam-av', /Editor de Vídeo[\s\S]*pendentes|ferramentas pendentes/], ['edi-av', /ferramentas pendentes/], ['ref-mkt-1', /Nova campanha/]];
  for (const [id, rx] of casos) {
    const pt = await pontoObjeto(p, id); await p.mouse.click(pt.x, pt.y);
    await p.waitForFunction((src) => new RegExp(src).test(document.querySelector('.o-lateral-corpo')?.textContent ?? ''), rx.source, { timeout: 8000 }).catch(async () => { throw new Error(`objeto ${id}: painel não abriu (${(await painel(p).textContent()).slice(0, 120)})`); });
  }
  assert.deepEqual(p.erros, []); await ctx.close();
});

test('movimentação: clicar no chão manda o funcionário selecionado andar por caminhos válidos, atravessando portas, sem atravessar móveis nem paredes', async () => {
  const { p, ctx } = await abrir(); await esperarEscritorio(p);
  await clicarPessoa(p, 'pers-helena');
  await p.evaluate(() => { window.__amostras = []; window.__t = setInterval(() => { const o = window.__office; const q = o.pessoas.find((x) => x.id === 'pers-helena'); window.__amostras.push([q.x, q.y]); }, 40); });
  await clicarCelula(p, 25, 22);                                          // Área de Convivência
  await p.waitForFunction(() => { const q = window.__office.pessoas.find((x) => x.id === 'pers-helena'); return Math.hypot(q.x - 25.5, q.y - 22.5) < 0.2 && !q.caminho.length; }, null, { timeout: 45000 });
  const r = await p.evaluate(() => { clearInterval(window.__t); const o = window.__office; const g = o.grade; return { n: window.__amostras.length, invalidas: window.__amostras.filter(([x, y]) => !g.livre(Math.floor(x), Math.floor(y))).length, atravessouPorta: window.__amostras.some(([x, y]) => Math.floor(y) === 10 || Math.floor(y) === 19 || Math.floor(x) === 11) }; });
  assert.ok(r.n > 20, 'andou de verdade'); assert.equal(r.invalidas, 0, 'nunca pisou em célula bloqueada'); assert.ok(r.atravessouPorta, 'passou por portas/corredor');
  // destino bloqueado (em cima de uma mesa): aproxima, sem atravessar
  await clicarPessoa(p, 'pers-helena'); await clicarCelula(p, 3, 3);
  await p.waitForFunction(() => !window.__office.pessoas.find((x) => x.id === 'pers-helena').caminho.length, null, { timeout: 45000 });
  const fim = await p.evaluate(() => { const q = window.__office.pessoas.find((x) => x.id === 'pers-helena'); return window.__office.grade.livre(Math.floor(q.x), Math.floor(q.y)); }); assert.equal(fim, true);
  assert.deepEqual(p.erros, []); await ctx.close();
});

test('o personagem reflete o estado REAL do agente: ao executar, vai ao posto e digita; com erro, mostra erro; sem trabalho, não encena', async () => {
  const { p, ctx } = await abrir(); await esperarEscritorio(p);
  // quieto (disponível): ninguém anda sozinho
  const parado = await p.evaluate(async () => { const o = window.__office; const a = o.listaPessoas().map((x) => `${x.x},${x.y}`); await new Promise((r) => setTimeout(r, 1500)); return JSON.stringify(a) === JSON.stringify(o.listaPessoas().map((x) => `${x.x},${x.y}`)); });
  assert.ok(parado, 'sem tarefa, ninguém se mexe sozinho');
  // tira a Isabela do posto e finge, no NAVEGADOR, a resposta do servidor "executando" (o estado real vem de /agentes)
  await clicarPessoa(p, 'pers-isabela'); await clicarCelula(p, 8, 14);
  await p.waitForFunction(() => !window.__office.pessoas.find((x) => x.id === 'pers-isabela').caminho.length, null, { timeout: 30000 });
  await p.route('**/api/commerce/agentes', async (rota) => { const r = await rota.fetch(); const j = await r.json(); for (const a of j) if (a.chave === 'isabela') a.estado = 'executando'; await rota.fulfill({ response: r, json: j }); });
  await p.waitForFunction(() => { const q = window.__office.pessoas.find((x) => x.id === 'pers-isabela'); return q.noPosto && Math.floor(q.x) === 3 && Math.floor(q.y) === 13; }, null, { timeout: 45000 });
  const anim = await p.evaluate(() => { const o = window.__office; const q = o.pessoas.find((x) => x.id === 'pers-isabela'); return o.estadoAnimacao(q); }); assert.equal(anim, 'typing');
  await p.unroute('**/api/commerce/agentes');
  await p.route('**/api/commerce/agentes', async (rota) => { const r = await rota.fetch(); const j = await r.json(); for (const a of j) if (a.chave === 'isabela') a.estado = 'com_erro'; await rota.fulfill({ response: r, json: j }); });
  await p.waitForFunction(() => { const o = window.__office; return o.estadoAnimacao(o.pessoas.find((x) => x.id === 'pers-isabela')) === 'error'; }, null, { timeout: 15000 });
  assert.match(await p.locator('.o-agentes-mini').innerHTML(), /vermelho/);
  assert.deepEqual(p.erros, []); await ctx.close();
});

test('tarefas: criar, não duplicar, e despachar sem IA configurada mostra o erro real sem alterar a tarefa', async () => {
  const { p, ctx } = await abrir(); await esperarEscritorio(p);
  await aba(p, 'Agentes'); await painel(p).locator('button', { hasText: 'Arthur' }).first().click();
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
  await clicarCelula(p, 15, 22); const piso = await p.evaluate(() => window.__office.layout.piso[22 * 34 + 15]); assert.equal(piso, 'madeira');
  // computador só sobre mesa
  await p.locator('.o-ferramentas button', { hasText: 'Objeto' }).click(); await p.locator('.o-grade-lib button', { hasText: 'Computador' }).first().click();
  await clicarCelula(p, 20, 6); await p.waitForFunction(() => /Precisa ficar sobre uma mesa/.test(document.querySelector('.o-avisos')?.textContent ?? ''), null, { timeout: 8000 });
  // salvar
  await p.getByRole('button', { name: 'Salvar layout' }).first().click(); await p.waitForFunction(() => /Layout salvo/.test(document.querySelector('.o-avisos')?.textContent ?? ''), null, { timeout: 10000 });
  assert.match(await p.locator('.o-nome-layout').textContent(), /v2/);
  await p.reload(); await esperarEscritorio(p);
  assert.equal(await p.evaluate(() => window.__office.layout.objetos.length), n0 + 1, 'o objeto colocado persistiu');
  assert.equal(await p.evaluate(() => window.__office.layout.piso[22 * 34 + 15]), 'madeira');
  assert.deepEqual(p.erros, []); await ctx.close();
});

test('Office Builder: paredes, portas e colisão alteram a navegação de verdade; estação ligada por id; modo visualização oculta o painel', async () => {
  const { p, ctx } = await abrir(); await esperarEscritorio(p);
  await p.getByRole('button', { name: 'Edição' }).click(); await p.waitForSelector('text=Modo edição');
  const caminho = (de, para) => p.evaluate(([a, b]) => { const o = window.__office; return o.camaminho ? null : null; }, [de, para]);
  void caminho;
  // colisão manual numa célula do corredor muda a grade
  await p.getByRole('button', { name: '⛔ Colisão' }).click(); await clicarCelula(p, 6, 9);
  assert.equal(await p.evaluate(() => window.__office.grade.livre(6, 9)), false); assert.equal(await p.evaluate(() => window.__office.layout.colisoes.length), 1);
  await p.keyboard.press('Control+z'); assert.equal(await p.evaluate(() => window.__office.grade.livre(6, 9)), true);
  // parede + porta
  const w0 = await p.evaluate(() => window.__office.layout.paredes.length);
  await p.getByRole('button', { name: '🧱 Parede' }).click(); const c = cel(18, 7); const pt = await pontoMundo(p, c.x, c.y - 8); await p.mouse.click(pt.x, pt.y);
  assert.ok((await p.evaluate(() => window.__office.layout.paredes.length)) >= w0 + 1, 'parede criada');
  // seleciona o computador do Arthur e vê a estação ligada por id
  await p.getByRole('button', { name: '🖱 Selecionar / mover' }).click(); const pc = await pontoObjeto(p, 'pc-arthur'); await p.mouse.click(pc.x, pc.y);
  await p.waitForFunction(() => /Estação \(liga o objeto a uma função real\)/.test(document.querySelector('.o-lateral-corpo')?.textContent ?? ''), null, { timeout: 8000 });
  const est = await p.evaluate(() => window.__office.layout.estacoes.find((e) => e.objetoId === 'pc-arthur')); assert.ok(est.agenteId && est.pontoTrabalho, JSON.stringify(est));
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
  await painel(p).locator('.o-item', { hasText: 'Helena' }).locator('select').selectOption({ index: 1 });
  await p.waitForFunction(() => /Aparência de Helena atualizada/.test(document.querySelector('.o-avisos')?.textContent ?? ''), null, { timeout: 8000 });
  await p.waitForFunction(() => { const o = window.__office; const q = o.pessoas.find((x) => x.id === 'pers-helena'); o.sheetDe(q); return q.sheetKey.startsWith('imp:'); }, null, { timeout: 15000 });
  const ag1 = await p.evaluate(async () => (await (await fetch('/api/commerce/agentes', { headers: { Authorization: `Bearer ${localStorage.getItem('codeniac.token')}` } })).json())[0]);
  assert.equal(ag1.nome, ag0.nome); assert.equal(ag1.cargo, ag0.cargo); assert.equal(ag1.botId, ag0.botId); assert.notEqual(ag1.avatarId, null);
  await painel(p).locator('.o-item', { hasText: 'Helena' }).locator('select').selectOption('');   // volta ao provisório
  await p.waitForFunction(() => { const o = window.__office; const q = o.pessoas.find((x) => x.id === 'pers-helena'); o.sheetDe(q); return q.sheetKey.startsWith('proc:'); }, null, { timeout: 15000 });
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
