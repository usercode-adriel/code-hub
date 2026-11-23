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

test('modelagem: gira, espelha, escala e desfaz; criar mapa já vira o do jogo', async () => {
  const { p, ctx } = await paginaLogada();
  await p.goto(`${BASE}/#/criar-mapa`); await p.waitForSelector('#mNovo', { timeout: 30000 });
  await p.click('#mNovo'); await p.waitForSelector('#eTela', { timeout: 15000 });
  // coloca uma peça no centro e confere o painel
  await p.click('#ePaleta [data-chave]'); await p.waitForTimeout(300);
  const tela = await p.locator('#eTela').boundingBox();
  await p.mouse.click(tela.x + tela.width / 2, tela.y + tela.height / 2); await p.waitForTimeout(200);
  assert.ok(await p.isVisible('#pRm'), 'o painel da peça aparece ao colocar');
  await p.click('#pRp'); await p.click('#pEsp');
  await p.fill('#pL', '200'); await p.dispatchEvent('#pL', 'change'); await p.waitForTimeout(150);
  const antes = await p.evaluate(() => document.querySelector('#pR').value);
  assert.equal(antes, '90', 'rotação em 90 graus');
  assert.match(await p.evaluate(() => document.querySelector('#pEV').textContent), /%/);
  // desfazer: largura, depois espelho, depois a rotação (cada ação é um passo)
  await p.keyboard.press('Control+z'); await p.waitForTimeout(150);
  await p.keyboard.press('Control+z'); await p.waitForTimeout(150);
  assert.ok(!(await p.textContent('#eProp')).includes('Espelhado'), 'o espelho foi desfeito');
  await p.keyboard.press('Control+z'); await p.waitForTimeout(150);
  assert.equal(await p.evaluate(() => document.querySelector('#pR').value), '0', 'a rotação foi desfeita');
  await p.click('#eSalvar'); await p.waitForTimeout(600);
  assert.match(await p.evaluate(() => document.querySelector('#eEstado').textContent), /Salvo/);
  // o mapa criado já é o do jogo: a Vida está ativa na lista
  await p.goto(`${BASE}/#/settings/mapas`); await p.waitForSelector('a[href="#/criar-mapa"]', { timeout: 30000 });
  await p.click('a[href="#/criar-mapa"]'); await p.waitForSelector('#mNovo', { timeout: 15000 });
  assert.ok((await p.textContent('body')).includes('Jogo usa este mapa'), 'o mapa criado vira o do jogo');
  assert.deepEqual(p.errosJS, [], 'erros de script no editor');
  await ctx.close();
});

test('caixa de ferramentas: segurar move a peça, alças redimensionam pela borda, barra de opções aparece', async () => {
  const { p, ctx } = await paginaLogada();
  await p.goto(`${BASE}/#/criar-mapa`); await p.waitForSelector('#mNovo', { timeout: 30000 });
  await p.click('#mNovo'); await p.waitForSelector('#eTela', { timeout: 15000 });
  await p.click('#ePaleta [data-chave]'); await p.waitForTimeout(300);
  const t = await p.locator('#eTela').boundingBox();
  const cx = t.x + t.width / 2 + 120, cy = t.y + t.height / 2 + 60;
  await p.mouse.click(cx, cy); await p.waitForTimeout(200);
  assert.ok(await p.isVisible('#eBarra'), 'a barra de opções aparece ao colocar a peça');
  const x0 = Number(await p.inputValue('#pX')); const y0 = Number(await p.inputValue('#pY'));
  // segurar o botão esquerdo sobre a peça e arrastar: ela se move sem escolher Selecionar
  await p.mouse.move(cx, cy); await p.mouse.down(); await p.mouse.move(cx + 60, cy + 20, { steps: 6 }); await p.mouse.up();
  await p.waitForTimeout(150);
  assert.ok(Number(await p.inputValue('#pX')) > x0 + 20, 'a peça seguiu o mouse ao segurar');
  // alça da borda direita (meio): arrastar para fora aumenta a largura, a borda esquerda fica parada
  // (a página pode ter rolado ao clicar: a posição da tela é lida de novo)
  const box2 = await p.locator('#eTela').boundingBox();
  const w0 = Number(await p.inputValue('#pL')); const h0 = Number(await p.inputValue('#pA'));
  const px = Number(await p.inputValue('#pX')); const py = Number(await p.inputValue('#pY'));
  // câmera inicial: centro do mapa de 40×30 células, zoom 0,8
  const paraTela = (wx, wy) => ({ x: box2.x + box2.width / 2 + (wx - 640) * 0.8, y: box2.y + box2.height / 2 + (wy - 480) * 0.8 });
  const alca = paraTela(px + w0 / 2, py - h0 / 2);
  await p.mouse.move(alca.x, alca.y); await p.mouse.down();
  await p.mouse.move(alca.x + 40, alca.y, { steps: 5 }); await p.mouse.up();
  await p.waitForTimeout(150);
  assert.ok(Number(await p.inputValue('#pL')) > w0 + 25, 'a borda direita alargou a peça');
  // botão direito sobre área vazia: mão para mover o mapa (cursor grabbing enquanto segura)
  // (ponto livre: a caixa de ferramentas cobre a esquerda da tela)
  await p.mouse.move(t.x + t.width - 60, t.y + t.height - 60); await p.mouse.down({ button: 'right' });
  await p.mouse.move(t.x + t.width - 90, t.y + t.height - 70, { steps: 4 });
  assert.equal(await p.evaluate(() => document.querySelector('#eTela').style.cursor), 'grabbing');
  await p.mouse.up({ button: 'right' });
  assert.deepEqual(p.errosJS, [], 'erros de script no editor');
  await ctx.close();
});

test('structure studio: hub cria estrutura, editor abre e salva; preset não muda', async () => {
  const { p, ctx } = await paginaLogada();
  await p.goto(`${BASE}/#/studio`); await p.waitForSelector('#sNovo', { timeout: 30000 });
  assert.ok((await p.textContent('body')).includes('Game Development Studio'));
  await p.fill('#sNome', 'Delegacia de teste'); await p.selectOption('#sPreset', 'arq25d'); await p.selectOption('#sTipo', 'delegacia');
  await p.click('#sNovo'); await p.waitForSelector('#stTela', { timeout: 15000 });
  assert.ok(await p.isVisible('#stBiblioteca') && await p.isVisible('#stProp'), 'os painéis aparecem');
  await p.fill('#stNome', 'Delegacia renomeada'); await p.click('#stSalvar'); await p.waitForTimeout(600);
  assert.match(await p.evaluate(() => document.querySelector('#stEstado').textContent), /Salvo/);
  // pela API: o preset de câmera não muda depois de criado
  const r = await p.evaluate(async () => {
    const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('codeniac.token')}` };
    const lista = (await (await fetch('/api/estudio/estruturas', { headers: h })).json()).estruturas;
    const e = lista.find((x) => x.nome === 'Delegacia renomeada');
    const troca = await fetch(`/api/estudio/estruturas/${e.id}`, { method: 'PUT', headers: h, body: JSON.stringify({ preset: 'topo' }) });
    return { achou: !!e, status: troca.status };
  });
  assert.ok(r.achou, 'a estrutura salva aparece na lista'); assert.equal(r.status, 400);
  // o 400 acima é provocado de propósito; qualquer outro erro conta
  assert.deepEqual(p.errosJS.filter((e) => !/status of 400/.test(e)), [], 'erros de script no Studio');
  await ctx.close();
});

test('structure studio: biblioteca busca, filtra, mostra detalhes e importa sem duplicar', async () => {
  const { p, ctx } = await paginaLogada();
  await p.goto(`${BASE}/#/studio`); await p.waitForSelector('#sNovo', { timeout: 30000 });
  await p.selectOption('#sPreset', 'arq25d'); await p.click('#sNovo'); await p.waitForSelector('#bLista [data-id]', { timeout: 15000 });
  const todos = await p.locator('#bLista [data-id]').count();
  assert.ok(todos > 10, 'a biblioteca lista componentes');
  // perspectiva arquitetônica não oferece vias
  assert.equal(await p.locator('#bCats [data-cat="via"]').count(), 0);
  // busca por texto
  await p.fill('#bQ', 'palmeira'); await p.waitForTimeout(500);
  const achadas = await p.locator('#bLista [data-id]').count();
  assert.ok(achadas > 0 && achadas < todos, 'a busca reduz a lista');
  // escolher um componente arma a colocação (o painel avisa onde ele encaixa)
  await p.locator('#bLista [data-id]').first().click();
  assert.match(await p.textContent('#stDica'), /Colocando/);
  // importar o mesmo PNG duas vezes: a segunda devolve o existente
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFklEQVR4nGP8z8DwnwEJMDGgAapKAQAHnAEE0/XHCwAAAABJRU5ErkJggg==', 'base64');
  const importar = async (nome) => {
    await p.click('#bImportar'); await p.waitForSelector('#iArq');
    await p.setInputFiles('#iArq', { name: 'peca.png', mimeType: 'image/png', buffer: png }); await p.fill('#iNome', nome);
    await p.selectOption('#iCat', 'fachada'); await p.selectOption('#iSub', 'janela'); await p.click('#iEnviar'); await p.waitForTimeout(700);
  };
  await importar('Janela de teste'); await importar('Janela de teste 2');
  const lista = await p.evaluate(async () => {
    const h = { Authorization: `Bearer ${localStorage.getItem('codeniac.token')}` };
    return (await (await fetch('/api/estudio/componentes?origem=importado&limite=50', { headers: h })).json()).componentes;
  });
  assert.equal(lista.length, 1, 'o mesmo arquivo não duplica na biblioteca');
  assert.equal(lista[0].hash.length, 64);
  // o arquivo importado é servido
  const st = await p.evaluate(async (u) => (await fetch(u)).status, lista[0].arquivo);
  assert.equal(st, 200);
  assert.deepEqual(p.errosJS, [], 'erros de script na biblioteca');
  await ctx.close();
});

// PNG sólido (RGBA) para montar um kit de teste sem depender de arte
function pngSolido(w, h, [r, g, b, a] = [120, 130, 150, 255]) {
  const crcTab = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcTab[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const bloco = (tipo, dados) => { const t = Buffer.from(tipo); const len = Buffer.alloc(4); len.writeUInt32BE(dados.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, dados]))); return Buffer.concat([len, t, dados, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const linha = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b, a]).flat())]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bloco('IHDR', ihdr), bloco('IDAT', zlib.deflateSync(Buffer.concat(Array.from({ length: h }, () => linha)))), bloco('IEND', Buffer.alloc(0))]);
}

test('structure studio: monta parede, encaixa janela e telhado, recusa peça flutuando, move com filhos, desfaz e salva', async () => {
  const { p, ctx } = await paginaLogada();
  const token = await p.evaluate(() => localStorage.getItem('codeniac.token'));
  const h = { Authorization: `Bearer ${token}` };
  // kit mínimo de teste na biblioteca do usuário
  const importar = async (nome, sub, categoria, w, hh, cor) => {
    const fd = new FormData(); fd.append('imagem', new Blob([pngSolido(w, hh, cor)], { type: 'image/png' }), `${nome}.png`);
    for (const [k, v] of Object.entries({ nome, categoria, sub, perspectiva: 'arq25d', material: 'concreto', origem: 'importado' })) fd.append(k, v);
    const r = await fetch(`${BASE}/api/estudio/componentes`, { method: 'POST', headers: h, body: fd }); assert.equal(r.status, 201, `importar ${nome}`);
  };
  await importar('Parede kit', 'parede', 'estrutura', 128, 96, [150, 140, 130, 255]);
  await importar('Janela kit', 'janela', 'fachada', 32, 32, [90, 160, 220, 255]);
  await importar('Telhado kit', 'telhado-plano', 'cobertura', 128, 40, [110, 80, 70, 255]);
  const est = await (await fetch(`${BASE}/api/estudio/estruturas`, { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: 'Montagem de teste', preset: 'arq25d', tipo: 'loja' }) })).json();
  await p.goto(`${BASE}/#/studio?id=${est.id}`); await p.waitForSelector('#bLista [data-id]', { timeout: 20000 });
  const estado = () => p.evaluate(() => { const s = document.querySelector('#stCaixa').__studio; return { n: s.est.componentes.length, comps: JSON.parse(JSON.stringify(s.est.componentes)), cam: { ...s.S.cam } }; });
  // a página rola ao clicar na biblioteca: a posição da tela é lida de novo a cada uso
  const paraTela = async (x, y, cam) => { const t = await p.locator('#stTela').boundingBox(); return { x: t.x + t.width / 2 + (x - cam.x) * cam.z, y: t.y + t.height / 2 + (y - cam.y) * cam.z }; };
  const escolher = async (nome) => { await p.fill('#bQ', nome); await p.waitForTimeout(450); await p.locator('#bLista [data-id]').first().click(); await p.waitForTimeout(100); };
  const cam = (await estado()).cam;

  // 1) parede no chão da área (encaixa na grade fina)
  await escolher('Parede kit');
  const pw = await paraTela(320, 400, cam); await p.mouse.move(pw.x, pw.y); await p.mouse.click(pw.x, pw.y); await p.waitForTimeout(150);
  let e = await estado(); assert.equal(e.n, 1); const parede = e.comps[0];
  assert.equal(parede.x % 8, 0, 'na grade fina'); assert.equal(parede.y % 8, 0);

  // 2) janela longe de qualquer parede não pode flutuar
  await escolher('Janela kit');
  const longe = await paraTela(80, 90, cam); await p.mouse.move(longe.x, longe.y); await p.mouse.click(longe.x, longe.y); await p.waitForTimeout(150);
  assert.equal((await estado()).n, 1, 'a janela solta fora de uma parede foi recusada');

  // 3) janela perto da parede encaixa na face, dentro dela
  const perto = await paraTela(parede.x + 10, parede.y + 12, cam); await p.mouse.move(perto.x, perto.y); await p.mouse.click(perto.x, perto.y); await p.waitForTimeout(150);
  e = await estado(); assert.equal(e.n, 2); const janela = e.comps[1];
  assert.equal(janela.anfitriao, parede.id, 'encaixada na parede'); assert.equal(janela.y, parede.y, 'no plano da fachada');
  assert.ok(janela.x - 16 >= parede.x - 64 && janela.x + 16 <= parede.x + 64, 'dentro da parede');

  // 4) telhado sobe até o topo da parede
  await p.keyboard.press('Escape'); await escolher('Telhado kit');
  const topo = await paraTela(parede.x, parede.y, cam); await p.mouse.move(topo.x, topo.y); await p.mouse.click(topo.x, topo.y); await p.waitForTimeout(150);
  e = await estado(); assert.equal(e.n, 3); const telhado = e.comps[2];
  assert.equal(telhado.anfitriao, parede.id); assert.equal(telhado.z, 96, 'no topo da parede (96 px)');

  // 5) a verificação não acha problema
  await p.keyboard.press('Escape'); await p.click('[data-aba="verificar"]'); await p.waitForTimeout(450);
  assert.match(await p.textContent('#stProp'), /Nenhum problema/);

  // 6) arrastar a parede leva a janela e o telhado juntos
  await p.click('[data-aba="prop"]');
  const base = await paraTela(parede.x - 40, parede.y - 10, cam); // área da parede fora da janela e do telhado
  await p.mouse.move(base.x, base.y); await p.mouse.down(); await p.mouse.move(base.x + 48 * cam.z, base.y + 32 * cam.z, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(200);
  e = await estado();
  const dx = e.comps[0].x - parede.x; const dy = e.comps[0].y - parede.y;
  assert.ok(dx > 0 && dy > 0, 'a parede se moveu');
  assert.equal(e.comps[1].x - janela.x, dx, 'a janela acompanha'); assert.equal(e.comps[2].y - telhado.y, dy, 'o telhado acompanha');

  // 7) desfazer devolve tudo
  await p.keyboard.press('Control+z'); await p.waitForTimeout(200);
  e = await estado(); assert.deepEqual([e.comps[0].x, e.comps[0].y, e.comps[1].x, e.comps[2].y], [parede.x, parede.y, janela.x, telhado.y], 'desfez o movimento de todos');

  // 8) salvar passa na validação do servidor e volta igual
  await p.click('#stSalvar'); await p.waitForTimeout(700);
  assert.match(await p.textContent('#stEstado'), /Salvo/);
  const salvo = await (await fetch(`${BASE}/api/estudio/estruturas/${est.id}`, { headers: h })).json();
  assert.equal(salvo.componentes.length, 3); assert.equal(salvo.componentes[1].anfitriao, parede.id);
  // o servidor também recusa janela sem anfitrião
  const ruim = await fetch(`${BASE}/api/estudio/estruturas/${est.id}`, { method: 'PUT', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify({ componentes: [{ ...salvo.componentes[1], anfitriao: null }] }) });
  assert.equal(ruim.status, 400);
  assert.deepEqual(p.errosJS.filter((x) => !/status of 400/.test(x)), [], 'erros de script no editor');
  await ctx.close();
});

test('structure studio: salva como prefab, duplica, cria variação, exporta e protege componente em uso', async () => {
  const { p, ctx } = await paginaLogada();
  const token = await p.evaluate(() => localStorage.getItem('codeniac.token'));
  const h = { Authorization: `Bearer ${token}` }; const hj = { ...h, 'Content-Type': 'application/json' };
  const importar = async (nome, sub, categoria, w, hh, cor) => {
    const fd = new FormData(); fd.append('imagem', new Blob([pngSolido(w, hh, cor)], { type: 'image/png' }), `${nome}.png`);
    for (const [k, v] of Object.entries({ nome, categoria, sub, perspectiva: 'arq25d', material: 'concreto', origem: 'importado' })) fd.append(k, v);
    const r = await (await fetch(`${BASE}/api/estudio/componentes`, { method: 'POST', headers: h, body: fd })).json(); return r.componente;
  };
  const parede = await importar('Parede prefab', 'parede', 'estrutura', 160, 96, [150, 140, 130, 255]);
  const porta = await importar('Porta prefab', 'porta', 'fachada', 40, 64, [90, 60, 40, 255]);
  const telhado = await importar('Telhado prefab', 'telhado-plano', 'cobertura', 160, 40, [110, 80, 70, 255]);
  const est = await (await fetch(`${BASE}/api/estudio/estruturas`, { method: 'POST', headers: hj, body: JSON.stringify({ nome: 'Delegacia prefab', preset: 'arq25d', tipo: 'delegacia' }) })).json();
  const w = { id: 'w1', comp: parede.id, x: 320, y: 320, camada: 'base', colisao: false };
  const itens = [w, { id: 'p1', comp: porta.id, x: 320, y: 320, camada: 'fachada', anfitriao: 'w1', nome: 'Entrada' }, { id: 't1', comp: telhado.id, x: 320, y: 320, z: 96, camada: 'cobertura', anfitriao: 'w1' }];
  const salvo = await fetch(`${BASE}/api/estudio/estruturas/${est.id}`, { method: 'PUT', headers: hj, body: JSON.stringify({ componentes: itens }) });
  assert.equal(salvo.status, 200, 'a estrutura montada é aceita');

  // o botão gera a imagem no navegador e o servidor recalcula o resto
  await p.goto(`${BASE}/#/studio?id=${est.id}`); await p.waitForSelector('#stPrefab', { timeout: 20000 }); await p.waitForTimeout(800);
  await p.click('#stPrefab'); await p.waitForFunction(() => /Prefab v1 salvo/.test(document.querySelector('#stEstado').textContent), null, { timeout: 15000 });
  const lista = (await (await fetch(`${BASE}/api/estudio/prefabs`, { headers: h })).json()).prefabs;
  assert.equal(lista.length, 1); const pre = await (await fetch(`${BASE}/api/estudio/prefabs/${lista[0].id}`, { headers: h })).json();
  assert.equal(pre.versao, 1); assert.equal(pre.entradas.length, 1, 'a porta virou entrada'); assert.equal(pre.entradas[0].nome, 'Entrada');
  assert.equal(pre.pegada.w, 160); assert.equal(pre.componentes.length, 3, 'os componentes ficam preservados');
  assert.equal(pre.imagem.w, 160); assert.equal(pre.imagem.h, 136, 'a altura inclui o telhado em cima da parede');
  assert.equal((await fetch(`${BASE}${pre.arquivo}`)).status, 200, 'a imagem do prefab é servida');
  // salvar de novo atualiza o mesmo prefab (versão 2), sem duplicar
  await p.click('#stPrefab'); await p.waitForFunction(() => /Prefab v2 salvo/.test(document.querySelector('#stEstado').textContent), null, { timeout: 15000 });
  assert.equal((await (await fetch(`${BASE}/api/estudio/prefabs`, { headers: h })).json()).prefabs.length, 1);

  // duplicar e variação (pela API, que o hub usa): a cópia não herda o prefab; a variação lembra a origem
  const dup = await (await fetch(`${BASE}/api/estudio/estruturas/${est.id}/duplicar`, { method: 'POST', headers: hj, body: JSON.stringify({}) })).json();
  assert.equal(dup.componentes.length, 3); assert.notEqual(dup.id, est.id); assert.equal(dup.prefab, undefined); assert.match(dup.nome, /cópia/);
  const vari = await (await fetch(`${BASE}/api/estudio/estruturas/${est.id}/duplicar`, { method: 'POST', headers: hj, body: JSON.stringify({ variacao: true }) })).json();
  assert.equal(vari.variacaoDe, est.id);
  // exportar traz o prefab e a imagem
  const pacote = await (await fetch(`${BASE}/api/estudio/prefabs/${pre.id}/exportar`, { headers: h })).json();
  assert.equal(pacote.formato, 'codeniac-prefab'); assert.ok(pacote.imagemBase64.length > 100);
  // componente em uso não pode ser apagado
  const del = await fetch(`${BASE}/api/estudio/componentes/item?id=${encodeURIComponent(parede.id)}`, { method: 'DELETE', headers: h });
  assert.equal(del.status, 409);
  // o hub lista os prefabs e as estruturas com os botões novos
  await p.goto(`${BASE}/#/studio`); await p.waitForSelector('[data-dup]', { timeout: 15000 });
  assert.ok(await p.locator('[data-var]').count() >= 1); assert.ok(await p.locator('[data-exp]').count() >= 1);
  assert.deepEqual(p.errosJS.filter((x) => !/status of (400|409)/.test(x)), [], 'erros de script no prefab');
  await ctx.close();
});

test('structure studio: IA monta a prévia, usuário aprova, edita por instrução e a montagem segue editável', async () => {
  const { p, ctx } = await paginaLogada();
  const token = await p.evaluate(() => localStorage.getItem('codeniac.token'));
  const h = { Authorization: `Bearer ${token}` }; const hj = { ...h, 'Content-Type': 'application/json' };
  const importar = async (nome, sub, categoria, w, hh, cor, material = 'concreto') => {
    const fd = new FormData(); fd.append('imagem', new Blob([pngSolido(w, hh, cor)], { type: 'image/png' }), `${nome}.png`);
    for (const [k, v] of Object.entries({ nome, categoria, sub, perspectiva: 'arq25d', material, origem: 'gerado' })) fd.append(k, v);
    await fetch(`${BASE}/api/estudio/componentes`, { method: 'POST', headers: h, body: fd });
  };
  await importar('Parede ia', 'parede', 'estrutura', 128, 96, [160, 150, 140, 255]); await importar('Janela ia', 'janela', 'fachada', 32, 32, [80, 150, 210, 255], 'vidro');
  await importar('Porta ia', 'porta', 'fachada', 48, 72, [90, 60, 40, 255]); await importar('Telhado ia', 'telhado-plano', 'cobertura', 128, 40, [120, 90, 80, 255]);
  await importar('Palmeira ia', 'palmeira', 'externo', 60, 120, [40, 140, 60, 255], 'vegetal'); await importar('Vaga ia', 'vaga', 'estacionamento', 40, 64, [70, 70, 80, 255], 'asfalto');
  const est = await (await fetch(`${BASE}/api/estudio/estruturas`, { method: 'POST', headers: hj, body: JSON.stringify({ nome: 'Casa por IA', preset: 'arq25d', tipo: 'casa' }) })).json();
  await p.goto(`${BASE}/#/studio?id=${est.id}`); await p.waitForSelector('#stIABotao', { timeout: 20000 });
  const estado = () => p.evaluate(() => { const s = document.querySelector('#stCaixa').__studio; return { n: s.est.componentes.length, subs: s.est.componentes.map((i) => s.compDe(i.comp)?.sub), previa: !!s.S.previa, nPrevia: s.S.previa?.lista.length || 0 }; });
  // 1) pedir uma montagem: aparece a prévia, nada muda na estrutura até aprovar
  await p.click('#stIABotao'); await p.waitForSelector('#iaDesc');
  assert.match(await p.textContent('#iaModo').then((t) => t || '').catch(() => ''), /./);
  await p.fill('#iaDesc', 'Casa pequena de 2 andares com palmeiras e estacionamento para 6 veículos'); await p.click('#iaMontar');
  await p.waitForSelector('#iaOk', { timeout: 20000 });
  let e = await estado(); assert.equal(e.previa, true); assert.equal(e.n, 0, 'a estrutura só muda quando o usuário aceita'); assert.ok(e.nPrevia > 10);
  assert.match(await p.textContent('#stProp'), /Prévia da IA/);
  // 2) descartar não muda nada; pedir de novo e aceitar
  await p.click('#iaNo'); e = await estado(); assert.deepEqual([e.previa, e.n], [false, 0]);
  await p.click('#stIABotao'); await p.fill('#iaDesc', 'Casa pequena de 2 andares com palmeiras e estacionamento para 6 veículos'); await p.click('#iaMontar'); await p.waitForSelector('#iaOk', { timeout: 20000 });
  await p.click('#iaOk'); await p.waitForTimeout(300);
  e = await estado(); assert.equal(e.previa, false); assert.ok(e.n > 10, 'a montagem foi aplicada');
  assert.equal(e.subs.filter((s) => s === 'parede').length, 2, 'um bloco de parede por andar'); assert.equal(e.subs.filter((s) => s === 'porta').length, 1);
  assert.ok(e.subs.includes('telhado-plano') && e.subs.includes('palmeira') && e.subs.includes('vaga'));
  // 3) é uma montagem de peças individuais: dá para selecionar e a verificação está limpa
  await p.click('[data-aba="verificar"]'); await p.waitForTimeout(450); assert.match(await p.textContent('#stProp'), /Nenhum problema/);
  await p.click('[data-aba="camadas"]'); assert.ok(await p.locator('[data-linha]').count() > 10, 'cada peça aparece na lista de camadas');
  // 4) editar por instrução: mais dois andares, só o necessário muda
  const antes = await p.evaluate(() => JSON.parse(JSON.stringify(document.querySelector('#stCaixa').__studio.est.componentes)));
  await p.click('#stAbaIA'); await p.fill('#iaInstr', 'Adicione mais dois andares.'); await p.click('#iaEditar'); await p.waitForSelector('#iaOk', { timeout: 20000 });
  await p.click('#iaOk'); await p.waitForTimeout(300);
  const depois = await p.evaluate(() => JSON.parse(JSON.stringify(document.querySelector('#stCaixa').__studio.est.componentes)));
  const soTerreo = antes.filter((i) => (i.z || 0) === 0 && i.papel === 'parede');
  assert.equal(depois.filter((i) => i.papel === 'parede').length, antes.filter((i) => i.papel === 'parede').length + 2);
  assert.ok(soTerreo.every((w) => JSON.stringify(depois.find((d) => d.id === w.id)) === JSON.stringify(w)), 'o térreo não foi tocado');
  // 5) desfazer (Ctrl+Z) volta ao estado anterior à edição
  await p.keyboard.press('Control+z'); await p.waitForTimeout(250);
  assert.equal((await estado()).n, antes.length);
  // 6) salvar passa na validação do servidor
  await p.click('#stSalvar'); await p.waitForTimeout(800); assert.match(await p.textContent('#stEstado'), /Salvo/);
  // 7) pedido sem sentido não inventa nada
  await p.click('#stAbaIA'); await p.fill('#iaInstr', 'bom dia'); await p.click('#iaEditar'); await p.waitForTimeout(800);
  assert.equal((await estado()).previa, false);
  assert.deepEqual(p.errosJS.filter((x) => !/status of 400/.test(x)), [], 'erros de script na IA');
  await ctx.close();
});

test('structure studio: criar com IA a partir do hub abre a prévia direto', async () => {
  const { p, ctx } = await paginaLogada();
  await p.goto(`${BASE}/#/studio`); await p.waitForSelector('#sNovoIA', { timeout: 20000 });
  await p.fill('#sIA', 'Casa com 2 andares e palmeiras'); await p.click('#sNovoIA');
  await p.waitForSelector('#iaOk', { timeout: 25000 });
  assert.equal(await p.evaluate(() => document.querySelector('#stCaixa').__studio.S.previa.lista.length > 5), true);
  assert.deepEqual(p.errosJS, [], 'erros de script');
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
