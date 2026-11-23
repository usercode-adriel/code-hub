// SPRITE 3D: mesmos quadros e movimentos do sprite pixel (LPC); o que muda é a textura do personagem.
// Esta tela mostra o caminho de produção e os conjuntos de textura cadastrados. Ainda não há conjuntos 3D no projeto:
// até que existam, o personagem 3D não pode ser salvo com textura própria.
import { api } from '../api.js';
import { icon } from '../icons.js';
import { esc } from '../ui.js';

const PASSOS = [
  ['Movimentos', 'Andar, correr, parado, sentar e ferido usam os mesmos quadros do pixel. Nada muda na animação.'],
  ['Texturas', 'Cada peça (corpo, roupa, cabelo, calçado, chapéu) recebe uma textura 3D pré-renderizada, no mesmo recorte de quadros.'],
  ['Conjunto', 'As texturas de um personagem ficam agrupadas em um conjunto. Um conjunto pode ser reaproveitado por vários personagens.'],
];

export default async function render(el) {
  el.innerHTML = `<section class="card" style="padding:16px">
    <div class="row" style="gap:8px;align-items:center">${icon('palette', 18)}<h3 class="title" style="margin:0">Sprite 3D</h3></div>
    <p class="muted">Mesma movimentação do sprite pixel: o que muda é só a textura do personagem.</p>
    <div style="display:grid;gap:8px;margin:12px 0">${PASSOS.map(([t, d], k) => `<div class="card" style="padding:10px"><b>${k + 1}. ${esc(t)}</b><div class="muted" style="font-size:13px">${esc(d)}</div></div>`).join('')}</div>
    <h4 style="margin:14px 0 6px">Conjuntos de textura</h4>
    <div id="p3Conjuntos"><p class="muted">Carregando…</p></div>
    <p class="muted" style="font-size:12px;margin-top:12px">Para criar texturas, use o <a href="#/studio">gerador de imagens</a> do Structure Studio com as referências de personagem, ou renderize as peças em 3D no mesmo formato de quadros do pixel.</p>
    <p style="margin-top:10px"><a href="#/gamecode">← Gamecode</a></p>
  </section>`;
  const box = el.querySelector('#p3Conjuntos');
  let conjuntos = [];
  try { conjuntos = (await api.get('/personagens/texturas3d')).conjuntos || []; } catch { conjuntos = []; }
  box.innerHTML = conjuntos.length
    ? `<div style="display:grid;gap:8px">${conjuntos.map((c) => `<div class="card" style="padding:10px"><b>${esc(c.nome)}</b><div class="muted" style="font-size:12px">${c.pecas} peça(s) · ${esc(c.estilo || '3d')}</div></div>`).join('')}</div>`
    : '<p class="muted">Nenhum conjunto de textura 3D ainda. Assim que houver um, ele aparece aqui para ser usado pelos personagens 3D.</p>';
}
