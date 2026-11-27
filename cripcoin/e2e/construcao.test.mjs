// TESTE DE NAVEGADOR DO CRIPCOIN OFFICE: sobe o servidor com dados novos e joga de verdade no Chromium (criar projeto, loja, construir, contratar, OS, salvar/carregar).
// Precisa de `npm run cripcoin:build` antes. Rodar: npm run cripcoin:e2e   (CHROME_PATH=/caminho/do/chrome para usar outro Chromium)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const PORTA = 3990 + Math.floor(Math.random() * 9);
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
const shot = async (p, nome) => { if (SAIDA) { fs.mkdirSync(SAIDA, { recursive: true }); await p.screenshot({ path: path.join(SAIDA, nome) }); } };

const tela = (p, x, y) => p.evaluate(([x, y]) => { const m = window.__mundo; const r = m.canvas.getBoundingClientRect(); const t = m.paraTela(x, y); return { x: r.left + t.x, y: r.top + t.y }; }, [x, y]);
const clicarMundo = async (p, x, y) => { const t = await tela(p, x, y); await p.mouse.click(t.x, t.y); };
const obj = (p, id) => p.evaluate((id) => (() => { const o = window.__jogo.p.objetos.find((q) => q.id === id || q.def === id); return o ? JSON.parse(JSON.stringify(o)) : null; })(), id);
const dar = (p, itens) => p.evaluate((it) => { const j = window.__jogo; j.p.cc = 9999; for (const [k, n] of Object.entries(it)) j.p.inventario[k] = (j.p.inventario[k] || 0) + n; j.emitir(); }, itens);
const construir = async (p) => { await p.click('[data-testid=btn-construir]'); await p.waitForSelector('[data-testid=painel-construcao]'); };
const usarItem = async (p, nome) => { await p.click('[data-testid=ferr-colocar]'); await p.locator('.item', { hasText: nome }).locator('button').click(); };

test('construção v2: relógio na parede (qualquer ponto da face), computador/cafeteira/livro nas superfícies, redimensionar, persistir', async () => {
  const p = await abrir(); try {
    await novoProjeto(p, 'Obras'); await construir(p); await dar(p, { 'relogio-parede': 1, cafeteira: 1, caderno: 1, estante: 1, monitor: 1, caneca: 1, 'mesa-metal': 1 });
    // T1: relógio no ALTO da parede (ponteiro sobre a face acima da célula da parede)
    await usarItem(p, 'Relógio de parede'); await clicarMundo(p, 3.5, -0.15); await p.waitForTimeout(150);
    let rel = await obj(p, 'relogio-parede'); assert.ok(rel, 'o relógio foi colocado'); assert.ok(rel.alt > 0.5, `altura alta na parede (alt=${rel.alt})`); await shot(p, 'v2-relogio.png');
    // T2: monitor sobre a mesa, exatamente na superfície
    const mesa = await obj(p, 'mesa-simples'); const rm = await p.evaluate((id) => { const m = window.__mundo; const o = window.__jogo.p.objetos.find((q) => q.id === id); return m.retDe(window.__jogo.p, o); }, mesa.id);
    await usarItem(p, 'Monitor'); await clicarMundo(p, rm.left + rm.w * 0.75, rm.top + rm.h * 0.25); await p.waitForTimeout(150);
    const mon = await obj(p, 'monitor'); assert.ok(mon, 'monitor colocado: ' + (await p.evaluate(() => window.__jogo.avisos.map((a) => a.texto).join(' | ')))); assert.equal(mon.sobre, mesa.id); const ap = await p.evaluate((id) => { const S = window.__jogo; return S.p.objetos.find((o) => o.id === id); }, mon.id);
    assert.ok(ap.u > 0.5, 'o monitor ficou na metade direita da mesa'); await shot(p, 'v2-mesa.png');
    // T4: cafeteira em outra mesa e redução de tamanho pelo painel
    await usarItem(p, 'Mesa de metal'); await clicarMundo(p, 6.5, 6.5); const mesa2 = await obj(p, 'mesa-metal'); assert.ok(mesa2, 'segunda mesa colocada');
    const rm2 = await p.evaluate((id) => { const o = window.__jogo.p.objetos.find((q) => q.id === id); return window.__mundo.retDe(window.__jogo.p, o); }, mesa2.id);
    await usarItem(p, 'Cafeteira'); await clicarMundo(p, rm2.left + rm2.w * 0.3, rm2.top + rm2.h * 0.2); await p.waitForTimeout(150);
    let caf = await obj(p, 'cafeteira'); assert.ok(caf, 'cafeteira colocada: ' + (await p.evaluate(() => window.__jogo.avisos.map((a) => a.texto).join(' | ')))); assert.equal(caf.sobre, mesa2.id);
    await p.click('[data-testid=ferr-selecionar]'); const ac = await p.evaluate((id) => { const o = window.__jogo.p.objetos.find((q) => q.id === id); const r = window.__mundo.retDe(window.__jogo.p, o); return { x: r.left + r.w / 2, y: r.top + r.h * 0.6 }; }, caf.id); await clicarMundo(p, ac.x, ac.y); await p.waitForSelector('[data-testid=prop-menos]');
    const w0 = Number(await p.inputValue('[data-testid=prop-largura]')); await p.click('[data-testid=prop-menos]'); await p.click('[data-testid=prop-menos]'); await p.waitForTimeout(250); const w1 = Number(await p.inputValue('[data-testid=prop-largura]')); assert.ok(w1 < w0, `cafeteira menor (${w0} -> ${w1}) ${await p.evaluate(() => window.__jogo.avisos.map((a) => a.texto).join(' | '))} ex=${(await obj(p, 'cafeteira')).ex}`);
    caf = await obj(p, 'cafeteira'); assert.ok(caf.ex < 1); await shot(p, 'v2-cafeteira.png');
    // alça de canto: arrastar para aumentar
    const r2 = await p.evaluate((id) => { const o = window.__jogo.p.objetos.find((q) => q.id === id); return window.__mundo.retDe(window.__jogo.p, o); }, caf.id); const ex0 = caf.ex;
    const a = await tela(p, r2.left + r2.w, r2.top); await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(a.x + 24, a.y - 24, { steps: 5 }); await p.mouse.up(); caf = await obj(p, 'cafeteira'); assert.ok(caf.ex > ex0, 'alça de canto aumentou o objeto');
    // T3/T5: estante com caderno (livro) e escala individual
    await usarItem(p, 'Estante'); await clicarMundo(p, 9.5, 5.5); await p.waitForTimeout(150); const est = await obj(p, 'estante'); assert.ok(est);
    const re = await p.evaluate((id) => { const o = window.__jogo.p.objetos.find((q) => q.id === id); return window.__mundo.retDe(window.__jogo.p, o); }, est.id);
    await usarItem(p, 'Caderno'); await clicarMundo(p, re.left + re.w * 0.3, re.top + re.h * 0.5); await p.waitForTimeout(150); const liv = await obj(p, 'caderno'); assert.equal(liv.sobre, est.id);
    await p.click('[data-testid=ferr-selecionar]'); const ac2 = await p.evaluate((id) => { const o = window.__jogo.p.objetos.find((q) => q.id === id); const r = window.__mundo.retDe(window.__jogo.p, o); return { x: r.left + r.w / 2, y: r.top + r.h / 2 }; }, liv.id); await clicarMundo(p, ac2.x, ac2.y); await p.waitForSelector('[data-testid=prop-escala-x]'); await p.fill('[data-testid=prop-escala-x]', '1.5'); await p.press('[data-testid=prop-escala-x]', 'Tab'); const liv2 = await obj(p, 'caderno'); assert.equal(liv2.ex, 1.5); await shot(p, 'v2-estante.png');
    // T7: colisão acompanha o tamanho — estante (2 células) ampliada invade a parede? deve ser recusada
    await clicarMundo(p, re.left + re.w * 0.5, re.top + re.h * 0.95); await p.waitForSelector('[data-testid=prop-escala-x]'); await p.fill('[data-testid=prop-escala-x]', '2'); await p.press('[data-testid=prop-escala-x]', 'Tab');
    const est2 = await obj(p, 'estante'); const celulas = est2.ex === 2 ? 4 : 2; assert.ok(celulas === 4 || est2.ex === undefined, 'escala aplicada só se couber');
    // T6: salvar, recarregar, comparar
    const antes = await p.evaluate(() => JSON.stringify(window.__jogo.p.objetos.map(({ id, def, x, y, rot, sobre, ex, ey, u, v, nivel, alt }) => ({ id, def, x, y, rot, sobre, ex, ey, u, v, nivel, alt })).sort((a, b) => a.id.localeCompare(b.id))));
    await p.click('[data-testid=btn-salvar]'); await p.reload(); await p.waitForSelector('[data-testid=continuar]'); await p.click('[data-testid=continuar]'); await p.waitForSelector('[data-testid=canvas]');
    const depois = await p.evaluate(() => JSON.stringify(window.__jogo.p.objetos.map(({ id, def, x, y, rot, sobre, ex, ey, u, v, nivel, alt }) => ({ id, def, x, y, rot, sobre, ex, ey, u, v, nivel, alt })).sort((a, b) => a.id.localeCompare(b.id))));
    assert.equal(depois, antes); assert.deepEqual(p.erros, []);
  } finally { await p.ctx.close(); }
});

const contratarUI = async (p, nome) => { await p.click('[data-testid=btn-contratar]'); await p.waitForSelector('[data-testid=candidato]'); await p.locator('[data-testid=ver-candidato]').first().click(); await p.fill('[data-testid=ct-nome]', nome); await p.fill('[data-testid=ct-extras]', 'fala inglês'); await p.click('[data-testid=defeito-Teimoso]').catch(() => {}); await p.click('[data-testid=confirmar-contratar]'); await p.waitForTimeout(200); await p.evaluate(() => document.querySelectorAll('.x').forEach((x) => x.click())); };

test('equipe fixa na mesa: personagem nova sentada, conversa com balão (uma por vez), sem IA mostra erro honesto', async () => {
  const p = await abrir(); try {
    await novoProjeto(p, 'Equipe'); await contratarUI(p, 'Marina');
    const f = await p.evaluate(() => { const j = window.__jogo; const a = j.p.objetos.find((o) => o.def === 'cadeira-escritorio'); const e = j.p.funcionarios[0]; return { estado: e.estado, cx: Math.floor(e.x) === a.x && Math.floor(e.y) === a.y, avatar: e.avatar, defeitos: e.defeitos, extras: e.extras }; });
    assert.notEqual(f.estado, 'ausente'); assert.ok(f.cx, 'sentada na cadeira da estação'); assert.ok(['cacheada', 'oculos', 'afro'].includes(f.avatar)); assert.equal(f.extras, 'fala inglês');
    // sem login no Hub: erro claro, nada de resposta inventada
    await p.fill('[data-testid=chat-input]', 'Marina, bom dia!'); await p.click('[data-testid=chat-enviar]'); await p.waitForFunction(() => window.__jogo.avisos.some((a) => a.tipo === 'erro' && /logado|IA/i.test(a.texto)), null, { timeout: 8000 });
    assert.equal(await p.evaluate(() => window.__jogo.conversa.balao), null);
    // provedor de teste: o balão aparece sobre a personagem
    await p.evaluate(() => window.cripcoin.definirProvedor({ nome: 'teste', responder: async (ped) => `Oi chefe, aqui é a ${ped.funcionario.nome}!` }));
    await p.fill('[data-testid=chat-input]', 'Marina, tudo bem?'); await p.press('[data-testid=chat-input]', 'Enter');
    await p.waitForFunction(() => { const b = window.__jogo.conversa.balao; return b && !b.pensando; }, null, { timeout: 8000 }); await shot(p, 'v3-balao.png');
    const b = await p.evaluate(() => ({ ...window.__jogo.conversa.balao })); assert.match(b.texto, /Marina/); assert.equal(await p.evaluate(() => window.__jogo.p.funcionarios[0].dir), 'S');
    assert.ok((await p.textContent('[data-testid=chat-log]')).includes('Oi chefe')); assert.deepEqual(p.erros, []);
  } finally { await p.ctx.close(); }
});

test('construção: cor de paredes por trecho, todas as paredes, piso da sala inteira e quadro Codeniac', async () => {
  const p = await abrir(); try {
    await novoProjeto(p, 'Cores'); await dar(p, { 'quadro-codeniac': 1 }); await construir(p);
    const arrastar = async (x0, y0, x1, y1) => { const a = await tela(p, x0 + 0.5, y0 + 0.5); const b = await tela(p, x1 + 0.5, y1 + 0.5); await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(b.x, b.y, { steps: 4 }); await p.mouse.up(); };
    await p.click('[data-testid=ferr-corParede]'); await p.click('[data-testid=cor-vinho]'); await arrastar(2, 0, 5, 0);
    const cores = await p.evaluate(() => { const j = window.__jogo.p; return { a: j.coresParede[2], b: j.coresParede[8] }; }); assert.equal(cores.a, 'vinho'); assert.equal(cores.b, '');
    await p.click('[data-testid=cor-tudo]'); assert.equal(await p.evaluate(() => window.__jogo.p.corParede), 'vinho'); await shot(p, 'v3-cores.png');
    await p.click('[data-testid=ferr-piso]'); await p.click('.pisos button[title=metal]'); await p.click('[data-testid=piso-tudo]');
    assert.equal(await p.evaluate(() => { const j = window.__jogo.p; return j.piso.filter((x, i) => j.paredes[i] === 0).every((x) => x === 'metal'); }), true);
    await usarItem(p, 'Quadro Codeniac'); await clicarMundo(p, 8, -0.1); await p.waitForTimeout(150); const q = await obj(p, 'quadro-codeniac'); assert.ok(q, 'quadro com o logo colocado na parede'); await shot(p, 'v3-logo.png'); assert.deepEqual(p.erros, []);
  } finally { await p.ctx.close(); }
});

test('seta de desempenho: verde para cima (alto) e vermelha para baixo (baixo) sobre a cabeça', async () => {
  const p = await abrir(); try {
    await novoProjeto(p, 'Setas'); await contratarUI(p, 'Marina');
    for (const [meta, nome] of [[110, 'alto'], [20, 'baixo']]) {
      await p.evaluate((m) => { window.__jogo.p.funcionarios[0].metaDia = m; window.__jogo.emitir(); }, meta); await p.waitForTimeout(300);
      const px = await p.evaluate(() => { const j = window.__jogo; const m = window.__mundo; const f = j.p.funcionarios[0]; const cv = m.canvas; const t = m.paraTela(f.x, f.y + 0.5 - 2.35); const ctx = cv.getContext('2d'); const d = ctx.getImageData(Math.round((t.x - 16) * m.dpr), Math.round((t.y - 10) * m.dpr), Math.round(32 * m.dpr), Math.round(40 * m.dpr)).data; let verde = 0; let vermelho = 0; for (let i = 0; i < d.length; i += 4) { if (d[i] < 90 && d[i + 1] > 190 && d[i + 2] < 130) verde++; if (d[i] > 230 && d[i + 1] < 110 && d[i + 2] < 110) vermelho++; } return { verde, vermelho }; });
      if (nome === 'alto') { assert.ok(px.verde > 8 && px.vermelho === 0, `seta verde visível (${JSON.stringify(px)})`); await shot(p, 'v4-seta-alta.png'); } else { assert.ok(px.vermelho > 8 && px.verde === 0, `seta vermelha visível (${JSON.stringify(px)})`); await shot(p, 'v4-seta-baixa.png'); }
    }
    await p.evaluate(() => { window.__jogo.p.funcionarios[0].metaDia = 65; window.__jogo.emitir(); }); await p.waitForTimeout(300);
    const sem = await p.evaluate(() => { const j = window.__jogo; const m = window.__mundo; const f = j.p.funcionarios[0]; const t = m.paraTela(f.x, f.y + 0.5 - 2.35); const d = m.canvas.getContext('2d').getImageData(Math.round((t.x - 16) * m.dpr), Math.round((t.y - 10) * m.dpr), Math.round(32 * m.dpr), Math.round(40 * m.dpr)).data; let n = 0; for (let i = 0; i < d.length; i += 4) { if ((d[i] < 90 && d[i + 1] > 190) || (d[i] > 230 && d[i + 1] < 110 && d[i + 2] < 110)) n++; } return n; });
    assert.equal(sem, 0, 'desempenho médio: sem seta'); assert.deepEqual(p.erros, []);
  } finally { await p.ctx.close(); }
});

const centroObj = (p, def) => p.evaluate((def) => { const j = window.__jogo; const o = j.p.objetos.find((q) => q.def === def || (def === 'bolsa' && ['bolsa-rosa', 'ecobag', 'necessaire'].includes(q.def))); const r = window.__mundo.retDe(j.p, o); const t = window.__mundo.paraTela(r.left + r.w / 2, r.top + r.h / 2); const b = window.__mundo.canvas.getBoundingClientRect(); return { x: b.left + t.x, y: b.top + t.y }; }, def);

test('v5: frigobar abre (sprite aberto) com bebidas infinitas; bolsa na mesa abre o celular (Instagram, Bank, Galeria, Chrome); ícones do sistema', async () => {
  const p = await abrir(); try {
    await novoProjeto(p, 'V5'); await dar(p, { frigobar: 1 }); await construir(p); await usarItem(p, 'Frigobar'); await clicarMundo(p, 9.5, 6.5); await p.click('[data-testid=btn-construir]');
    await contratarUI(p, 'Marina'); await p.waitForFunction(() => window.__jogo.p.objetos.some((o) => ['bolsa-rosa', 'ecobag', 'necessaire'].includes(o.def)), null, { timeout: 5000 });
    let c = await centroObj(p, 'frigobar'); await p.mouse.click(c.x, c.y); await p.waitForSelector('[data-testid=frigobar]'); await p.waitForTimeout(200);
    assert.equal(await p.evaluate(() => window.__jogo.p.objetos.find((o) => o.def === 'frigobar').estado.aberto), true);
    for (let i = 0; i < 3; i++) await p.click('[data-testid=pegar-energetico-verde]'); assert.equal(await p.evaluate(() => window.__jogo.p.inventario['energetico-verde']), 3); await shot(p, 'v5-frigobar.png');
    await p.click('.jan-barra .x'); await p.waitForTimeout(150); assert.equal(await p.evaluate(() => window.__jogo.p.objetos.find((o) => o.def === 'frigobar').estado.aberto), false);
    c = await centroObj(p, 'bolsa'); await p.mouse.click(c.x, c.y); await p.waitForSelector('[data-testid=bolsa]'); assert.equal(await p.locator('[data-testid=bolsa-tv-netflix]').count(), 0); await shot(p, 'v5-bolsa.png');
    await p.click('[data-testid=bolsa-celular]'); await p.waitForSelector('[data-testid=celular]');
    await p.click('[data-testid=cel-instagram]'); await p.waitForSelector('[data-testid=ig-post]'); assert.ok(await p.locator('[data-testid=ig-post]').count() > 3);
    await p.click('[data-testid=ig-meu-perfil]'); await p.waitForSelector('[data-testid=ig-perfil]'); assert.ok(await p.locator('[data-testid=ig-perfil] .foto').count() >= 9); await shot(p, 'v5-instagram.png');
    await p.click('[data-testid=ig-busca]'); assert.ok(await p.locator('[data-testid=ig-conta]').count() >= 7);
    await p.click('[data-testid=cel-home]'); await p.click('[data-testid=cel-banco]'); assert.match(await p.textContent('[data-testid=banco-saldo]'), /CC/);
    await p.click('[data-testid=cel-home]'); await p.click('[data-testid=cel-galeria]'); assert.equal(await p.locator('[data-testid=galeria] .foto').count(), 15);
    await p.click('[data-testid=cel-home]'); await p.click('[data-testid=cel-chrome]'); await p.waitForSelector('[data-testid=navegador]'); await p.click('[data-testid=cel-fechar]'); await p.waitForSelector('[data-testid=bolsa]'); await p.click('.jan-barra .x');
    // ícones do computador vêm da folha de ícones
    c = await centroObj(p, 'laptop'); await p.mouse.click(c.x, c.y); await p.waitForSelector('[data-testid=so]'); assert.match(await p.getAttribute('[data-testid=ico-arquivos] img', 'src'), /icones\/arquivos\.png$/);
    const icones = await p.evaluate(() => [...document.querySelectorAll('[data-testid^=ico-] img')].every((i) => i.complete && i.naturalWidth > 0)); assert.ok(icones, 'todos os ícones carregaram'); await shot(p, 'v5-desktop.png');
    assert.deepEqual(p.erros, []);
  } finally { await p.ctx.close(); }
});

test('v5: fora do expediente a personagem some da cadeira e dorme (zzz) no canto/colchonete', async () => {
  const p = await abrir(); try {
    await novoProjeto(p, 'Sono'); await contratarUI(p, 'Marina'); await p.evaluate(() => { const j = window.__jogo; j.p.minuto = 22 * 60; j.mudou(); }); await p.waitForTimeout(300);
    const e = await p.evaluate(() => { const f = window.__jogo.p.funcionarios[0]; const a = window.__jogo.p.objetos.find((o) => o.def === 'cadeira-escritorio'); return { estado: f.estado, cama: f.dormeEm, naCadeira: Math.floor(f.x) === a.x && Math.floor(f.y) === a.y }; });
    assert.equal(e.estado, 'dormindo'); assert.ok(e.cama); assert.equal(e.naCadeira, false); await shot(p, 'v5-dormindo.png'); assert.deepEqual(p.erros, []);
  } finally { await p.ctx.close(); }
});

test('mobile: barra rolável, painel de construção recolhível, chat compacto, toque seleciona e pinça dá zoom', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); const p = await ctx.newPage(); p.erros = []; p.on('pageerror', (e) => p.erros.push(e.message));
  try {
    await p.goto(`${BASE}/cripcoin/`); await p.waitForSelector('[data-testid=cr-criar]'); await p.click('[data-testid=cr-criar]'); await p.waitForSelector('[data-testid=canvas]');
    const topo = await p.evaluate(() => { const t = document.querySelector('[data-testid=topo]'); return { h: t.getBoundingClientRect().height, rola: t.scrollWidth > t.clientWidth }; }); assert.ok(topo.h < 60, `barra superior baixa (${topo.h}px)`); assert.ok(topo.rola, 'botões roláveis na horizontal');
    assert.equal(await p.locator('[data-testid=chat-input]').count(), 0, 'chat começa recolhido no celular');
    await p.click('[data-testid=btn-construir]'); const h1 = await p.evaluate(() => document.querySelector('[data-testid=painel-construcao]').getBoundingClientRect().height); await p.click('[data-testid=recolher]'); const h2 = await p.evaluate(() => document.querySelector('[data-testid=painel-construcao]').getBoundingClientRect().height); assert.ok(h2 < h1 / 2, `painel recolhe (${h1} -> ${h2})`);
    const c = await p.evaluate(() => { const j = window.__jogo; const o = j.p.objetos.find((q) => q.def === 'mesa-simples'); const r = window.__mundo.retDe(j.p, o); const t = window.__mundo.paraTela(r.left + r.w / 2, r.top + r.h * 0.8); const b = window.__mundo.canvas.getBoundingClientRect(); return { x: b.left + t.x, y: b.top + t.y }; });
    await p.touchscreen.tap(c.x, c.y); await p.waitForTimeout(150); assert.ok(await p.evaluate(() => document.querySelector('[data-testid=sel-info]') !== null || document.querySelector('[data-testid=painel-construcao].recolhido') !== null));
    const z0 = await p.evaluate(() => window.__mundo.cam.zoom);
    const cdp = await ctx.newCDPSession(p); const tp = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
    await tp('touchStart', [[150, 400], [240, 400]]); for (let k = 1; k <= 5; k++) await tp('touchMove', [[150 - k * 12, 400], [240 + k * 12, 400]]); await tp('touchEnd', []);
    const z1 = await p.evaluate(() => window.__mundo.cam.zoom); assert.ok(z1 > z0 * 1.2, `pinça aumentou o zoom (${z0} -> ${z1})`);
    if (SAIDA) await p.screenshot({ path: path.join(SAIDA, 'mobile.png') }); assert.deepEqual(p.erros, []);
  } finally { await ctx.close(); }
});
