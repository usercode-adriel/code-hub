// GERADOR DE PERSONAGENS: monta um personagem a partir das peças (corpo, roupas, calçado, cabelo, chapéu).
// Sorteio por semente (o mesmo número gera o mesmo personagem). Você troca cada peça, sorteia de novo e salva
// na lista do navegador. A prévia anda nas quatro direções. Os créditos das peças aparecem embaixo.
import { esc } from '../ui.js';
import { sortear, ORDEM } from '../personagens/escolha.js';
import { comporFolhaJogo } from '../personagens/compor.js';

const ROTULO = { corpo: 'Corpo', 'roupa-baixo': 'Calça', 'roupa-cima': 'Camisa', calcado: 'Calçado', cabelo: 'Cabelo', chapeu: 'Chapéu' };
const SAVE = 'codeniac.personagens';
const lerSalvos = () => { try { return JSON.parse(localStorage.getItem(SAVE) || '[]'); } catch { return []; } };
const gravarSalvos = (l) => localStorage.setItem(SAVE, JSON.stringify(l.slice(0, 40)));

export default async function render(el) {
  el.innerHTML = '<section class="card"><h3 class="title">Gerador de personagens</h3><p class="muted">Carregando as peças…</p></section>';
  let man;
  try { man = await (await fetch('/assets/personagens/manifesto.json')).json(); } catch { el.innerHTML = '<section class="card"><p>Não consegui carregar as peças.</p></section>'; return; }
  const creditos = await (await fetch('/assets/personagens/CREDITS.txt')).text().catch(() => '');
  // catálogo: cada categoria é uma lista de peças (o chapéu pode ficar vazio)
  const catalogo = {};
  for (const cat of ORDEM) catalogo[cat] = (man.camadas[cat] || []).map((p) => ({ arquivo: `${p.pasta}/walk.png`, nome: p.nome }));
  let semente = Math.floor(Math.random() * 1e6);
  let escolha = sortear(catalogo, semente);
  let quadro = 0; let direcao = 0; let parado = false; let timer = null;

  el.innerHTML = `<section class="card"><h3 class="title">Gerador de personagens</h3>
    <div style="display:grid;grid-template-columns:minmax(220px,300px) 1fr;gap:20px;align-items:start">
      <div style="text-align:center">
        <canvas id="pgPrevia" width="128" height="128" style="width:256px;height:256px;image-rendering:pixelated;background:#2a2f3d;border-radius:12px"></canvas>
        <div class="row" style="justify-content:center;gap:6px;margin-top:8px">
          <button class="btn sm" data-dir="0">Frente</button><button class="btn sm" data-dir="3">Esq.</button><button class="btn sm" data-dir="1">Dir.</button><button class="btn sm" data-dir="2">Costas</button>
        </div>
        <p class="muted" style="font-size:12px">Semente <b id="pgSemente">${semente}</b></p>
      </div>
      <div id="pgPecas"></div>
    </div>
    <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:12px">
      <button class="btn primary" id="pgSortear">Sortear de novo</button>
      <input class="input" id="pgNome" placeholder="Nome do personagem" maxlength="40" style="max-width:220px">
      <button class="btn" id="pgSalvar">Salvar</button>
      <input class="input" id="pgSemIr" type="number" placeholder="semente" style="max-width:140px"><button class="btn sm" id="pgCarregar">Abrir semente</button>
    </div>
    <h4 style="margin-top:16px">Meus personagens (neste navegador)</h4>
    <div id="pgSalvos" class="muted"></div>
    <details style="margin-top:14px"><summary>Créditos das peças</summary><pre style="white-space:pre-wrap;font-size:11px">${esc(creditos)}</pre></details>
  </section>`;

  const previa = el.querySelector('#pgPrevia'); const ctx = previa.getContext('2d'); ctx.imageSmoothingEnabled = false;
  let folha = null;
  async function montar() {
    folha = await comporFolhaJogo(escolha, '/assets/personagens/');
    el.querySelector('#pgSemente').textContent = String(semente);
    desenhar();
    pecas();
  }
  function desenhar() {
    if (!folha) return;
    ctx.clearRect(0, 0, 128, 128);
    const f = Math.min(quadro, 3);
    ctx.drawImage(folha, f * 64, direcao * 64, 64, 64, 0, 0, 128, 128);
  }
  // troca a peça de uma categoria (próxima ou anterior); chapéu inclui "sem chapéu"
  function trocar(cat, passo) {
    const lista = catalogo[cat].map((p) => p.arquivo);
    if (cat === 'chapeu') lista.unshift(null);
    if (!lista.length) return;
    const atual = escolha[cat] ?? null;
    const i = lista.indexOf(atual);
    const prox = lista[(i + passo + lista.length) % lista.length];
    escolha = { ...escolha, [cat]: prox };
    montar();
  }
  function pecas() {
    const linhas = ORDEM.map((cat) => {
      const nome = escolha[cat] ? (catalogo[cat].find((p) => p.arquivo === escolha[cat])?.nome || escolha[cat]) : 'nenhum';
      const n = catalogo[cat].length + (cat === 'chapeu' ? 1 : 0);
      return `<div class="row" style="align-items:center;gap:8px;margin:6px 0"><span style="width:90px">${ROTULO[cat]}</span>
        <button class="btn sm" data-cat="${cat}" data-p="-1">◀</button><span style="min-width:200px">${esc(nome)} <small class="muted">(${n})</small></span><button class="btn sm" data-cat="${cat}" data-p="1">▶</button></div>`;
    }).join('');
    el.querySelector('#pgPecas').innerHTML = linhas;
    el.querySelectorAll('#pgPecas [data-cat]').forEach((b) => { b.onclick = () => trocar(b.dataset.cat, Number(b.dataset.p)); });
  }
  function listaSalvos() {
    const l = lerSalvos();
    el.querySelector('#pgSalvos').innerHTML = l.length ? l.map((s, i) => `<div class="row" style="gap:8px;align-items:center;margin:4px 0"><b>${esc(s.nome)}</b> <small>semente ${s.semente}</small>
      <button class="btn sm" data-abrir="${i}">Abrir</button><button class="btn sm ghost" data-apagar="${i}">Apagar</button></div>`).join('') : 'Nenhum salvo ainda.';
    el.querySelectorAll('[data-abrir]').forEach((b) => { b.onclick = () => abrir(l[Number(b.dataset.abrir)].semente); });
    el.querySelectorAll('[data-apagar]').forEach((b) => { b.onclick = () => { const x = lerSalvos(); x.splice(Number(b.dataset.apagar), 1); gravarSalvos(x); listaSalvos(); }; });
  }
  function abrir(s) { semente = Number(s) >>> 0; escolha = sortear(catalogo, semente); montar(); }

  el.querySelector('#pgSortear').onclick = () => { semente = Math.floor(Math.random() * 1e6); escolha = sortear(catalogo, semente); montar(); };
  el.querySelector('#pgCarregar').onclick = () => { const v = el.querySelector('#pgSemIr').value; if (v !== '') abrir(v); };
  el.querySelector('#pgSalvar').onclick = () => {
    const nome = (el.querySelector('#pgNome').value || '').trim() || `Personagem ${semente}`;
    const l = lerSalvos(); l.unshift({ nome, semente }); gravarSalvos(l); listaSalvos();
  };
  el.querySelectorAll('[data-dir]').forEach((b) => { b.onclick = () => { direcao = Number(b.dataset.dir); desenhar(); }; });
  // animação: 4 passos do andar; para ao passar o mouse sobre a prévia
  previa.onmouseenter = () => { parado = true; quadro = 0; desenhar(); };
  previa.onmouseleave = () => { parado = false; };
  timer = setInterval(() => { if (!previa.isConnected) { clearInterval(timer); return; } if (!parado) quadro = (quadro + 1) % 4; desenhar(); }, 170);

  listaSalvos();
  await montar();
}
