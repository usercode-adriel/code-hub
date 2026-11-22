// GERADOR DE PERSONAGENS: monta um personagem a partir das peças (corpo, roupas, calçado, cabelo, chapéu).
// Sorteio por semente (mesmo número, mesmo personagem). A prévia mostra as animações (andar, correr, parado,
// sentar, ferido). Os personagens salvos ficam na sua conta (servidor); o navegador guarda uma cópia.
import { api } from '../api.js';
import { esc } from '../ui.js';
import { sortear, ORDEM } from '../personagens/escolha.js';
import { quadroAnimacao } from '../personagens/compor.js';

const ROTULO = { corpo: 'Corpo', 'roupa-baixo': 'Calça', 'roupa-cima': 'Camisa', calcado: 'Calçado', cabelo: 'Cabelo', chapeu: 'Chapéu' };
const CACHE = 'codeniac.personagens';
const DIRECOES = { frente: 2, direita: 3, costas: 0, esquerda: 1 }; // linha da folha LPC
// quadros de cada animação na folha LPC: [linha, coluna] por direção ou fixo
const ANIMS = {
  andar: { nome: 'Andar', quadros: (d) => [1, 3, 5, 7].map((c) => [d, c]), dirs: true },
  correr: { nome: 'Correr', quadros: (d) => [0, 2, 4, 6].map((c) => [d === 1 ? 1 : 3, c]), dirs: 'lados' },
  parado: { nome: 'Parado', quadros: (d) => [[d, 0]], dirs: true },
  sentar: { nome: 'Sentar', quadros: () => [[2, 0], [2, 1]], dirs: false },
  ferido: { nome: 'Ferido', quadros: () => [0, 1, 2, 3, 4, 5].map((c) => [0, c]), dirs: false },
};
const ARQUIVO = { andar: 'walk', correr: 'run', parado: 'idle', sentar: 'sit', ferido: 'hurt' };

export default async function render(el) {
  el.innerHTML = '<section class="card"><h3 class="title">Gerador de personagens</h3><p class="muted">Carregando as peças…</p></section>';
  let man;
  try { man = await (await fetch('/assets/personagens/manifesto.json')).json(); } catch { el.innerHTML = '<section class="card"><p>Não consegui carregar as peças.</p></section>'; return; }
  const creditos = await (await fetch('/assets/personagens/CREDITS.txt')).text().catch(() => '');
  const catalogo = {};
  for (const cat of ORDEM) catalogo[cat] = (man.camadas[cat] || []).map((p) => ({ arquivo: `${p.pasta}/walk.png`, nome: p.nome }));
  let semente = Math.floor(Math.random() * 1e6);
  let escolha = sortear(catalogo, semente);
  let anim = 'andar'; let dir = 'frente'; let quadro = 0; let parado = false;

  el.innerHTML = `<section class="card"><h3 class="title">Gerador de personagens</h3>
    <div style="display:grid;grid-template-columns:minmax(220px,300px) 1fr;gap:20px;align-items:start">
      <div style="text-align:center">
        <canvas id="pgPrevia" width="128" height="128" style="width:256px;height:256px;image-rendering:pixelated;background:#2a2f3d;border-radius:12px"></canvas>
        <div class="row" id="pgAnim" style="justify-content:center;gap:6px;margin-top:8px;flex-wrap:wrap">
          ${Object.entries(ANIMS).map(([k, a]) => `<button class="btn sm" data-anim="${k}">${a.nome}</button>`).join('')}</div>
        <div class="row" id="pgDir" style="justify-content:center;gap:6px;margin-top:6px">
          ${Object.keys(DIRECOES).map((d) => `<button class="btn sm" data-dir="${d}">${d[0].toUpperCase() + d.slice(1)}</button>`).join('')}</div>
        <p class="muted" style="font-size:12px">Semente <b id="pgSemente">${semente}</b></p>
      </div>
      <div id="pgPecas"></div>
    </div>
    <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:12px">
      <button class="btn primary" id="pgSortear">Sortear de novo</button>
      <input class="input" id="pgNome" placeholder="Nome do personagem" maxlength="40" style="max-width:220px">
      <button class="btn" id="pgSalvar">Salvar na conta</button>
      <input class="input" id="pgSemIr" type="number" min="0" placeholder="semente" style="max-width:140px"><button class="btn sm" id="pgCarregar">Abrir semente</button>
    </div>
    <p class="muted" id="pgStatus" style="font-size:12px;min-height:16px"></p>
    <h4 style="margin-top:16px">Meus personagens</h4>
    <div id="pgSalvos" class="muted"></div>
    <p style="margin-top:14px"><a href="#/creditos">Ver créditos das peças e licenças</a></p>
  </section>`;

  const previa = el.querySelector('#pgPrevia'); const ctx = previa.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const status = (t) => { el.querySelector('#pgStatus').textContent = t; };

  // ----- personagens salvos: servidor é a fonte; o navegador guarda uma cópia para abrir mais rápido
  let salvos = [];
  const lerCache = () => { try { return JSON.parse(localStorage.getItem(CACHE) || '[]'); } catch { return []; } };
  async function carregarSalvos() {
    try { salvos = (await api.get('/personagens')).personagens || []; } catch { salvos = lerCache(); status('Sem conexão: mostrando a cópia deste navegador.'); }
    localStorage.setItem(CACHE, JSON.stringify(salvos)); listaSalvos();
  }
  async function gravarSalvos(nova) {
    const antes = salvos; salvos = nova; listaSalvos();
    try { const r = await api.put('/personagens', { personagens: nova }); salvos = r.personagens; localStorage.setItem(CACHE, JSON.stringify(salvos)); listaSalvos(); status('Salvo na sua conta.'); }
    catch (err) { salvos = antes; listaSalvos(); status(err.message || 'Não consegui salvar.'); }
  }
  function listaSalvos() {
    el.querySelector('#pgSalvos').innerHTML = salvos.length ? salvos.map((s, i) => `<div class="row" style="gap:8px;align-items:center;margin:4px 0"><b>${esc(s.nome)}</b> <small>semente ${s.semente}</small>
      <button class="btn sm" data-abrir="${i}">Abrir</button><button class="btn sm ghost" data-apagar="${i}">Apagar</button></div>`).join('') : 'Nenhum salvo ainda.';
    el.querySelectorAll('[data-abrir]').forEach((b) => { b.onclick = () => abrir(salvos[Number(b.dataset.abrir)].semente); });
    el.querySelectorAll('[data-apagar]').forEach((b) => { b.onclick = () => gravarSalvos(salvos.filter((_, i) => i !== Number(b.dataset.apagar))); });
  }

  // ----- prévia
  let frames = []; let montando = 0;
  async function montarFrames() {
    const id = ++montando; const a = ANIMS[anim];
    let d = DIRECOES[dir];
    if (anim === 'correr') d = dir === 'esquerda' ? 1 : 3;
    const lista = a.quadros(d);
    const out = [];
    for (const [l, c] of lista) out.push(await quadroAnimacao(escolha, ARQUIVO[anim], l, c, '/assets/personagens/'));
    if (id !== montando) return; // chegou outra troca
    frames = out; quadro = 0; desenhar();
    el.querySelectorAll('[data-dir]').forEach((b) => { b.disabled = !a.dirs && anim !== 'correr'; b.style.opacity = b.disabled ? 0.4 : 1; });
  }
  function desenhar() {
    ctx.clearRect(0, 0, 128, 128);
    if (frames.length) ctx.drawImage(frames[quadro % frames.length], 0, 0, 64, 64, 0, 0, 128, 128);
  }
  async function montar() {
    el.querySelector('#pgSemente').textContent = String(semente);
    el.querySelectorAll('[data-anim]').forEach((b) => { b.classList.toggle('primary', b.dataset.anim === anim); });
    el.querySelectorAll('[data-dir]').forEach((b) => { b.classList.toggle('primary', b.dataset.dir === dir); });
    pecas(); await montarFrames();
  }
  function trocar(cat, passo) {
    const lista = catalogo[cat].map((p) => p.arquivo);
    if (cat === 'chapeu') lista.unshift(null);
    if (!lista.length) return;
    const i = lista.indexOf(escolha[cat] ?? null);
    escolha = { ...escolha, [cat]: lista[(i + passo + lista.length) % lista.length] };
    montar();
  }
  function pecas() {
    el.querySelector('#pgPecas').innerHTML = ORDEM.map((cat) => {
      const nome = escolha[cat] ? (catalogo[cat].find((p) => p.arquivo === escolha[cat])?.nome || escolha[cat]) : 'nenhum';
      const n = catalogo[cat].length + (cat === 'chapeu' ? 1 : 0);
      return `<div class="row" style="align-items:center;gap:8px;margin:6px 0"><span style="width:90px">${ROTULO[cat]}</span>
        <button class="btn sm" data-cat="${cat}" data-p="-1">◀</button><span style="min-width:200px">${esc(nome)} <small class="muted">(${n})</small></span><button class="btn sm" data-cat="${cat}" data-p="1">▶</button></div>`;
    }).join('');
    el.querySelectorAll('#pgPecas [data-cat]').forEach((b) => { b.onclick = () => trocar(b.dataset.cat, Number(b.dataset.p)); });
  }
  function abrir(s) { semente = Number(s) >>> 0; escolha = sortear(catalogo, semente); montar(); }

  el.querySelectorAll('[data-anim]').forEach((b) => { b.onclick = () => { anim = b.dataset.anim; montar(); }; });
  el.querySelectorAll('[data-dir]').forEach((b) => { b.onclick = () => { dir = b.dataset.dir; montar(); }; });
  el.querySelector('#pgSortear').onclick = () => { semente = Math.floor(Math.random() * 1e6); escolha = sortear(catalogo, semente); montar(); };
  el.querySelector('#pgCarregar').onclick = () => { const v = el.querySelector('#pgSemIr').value; if (v !== '') abrir(v); };
  el.querySelector('#pgSalvar').onclick = () => {
    const nome = (el.querySelector('#pgNome').value || '').trim() || `Personagem ${semente}`;
    gravarSalvos([{ nome, semente }, ...salvos].slice(0, 40));
  };
  previa.onmouseenter = () => { parado = true; };
  previa.onmouseleave = () => { parado = false; };
  const timer = setInterval(() => { if (!previa.isConnected) { clearInterval(timer); return; } if (!parado && frames.length) { quadro = (quadro + 1) % frames.length; desenhar(); } }, 170);

  await carregarSalvos();
  await montar();
}
