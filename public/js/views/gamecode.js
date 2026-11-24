// GAMECODE: porta de entrada do jogo. O jogo antigo foi removido; o novo (game/, PixiJS) abre aqui quando estiver compilado.
import { icon } from '../icons.js';

export default async function render(el) {
  const pronto = await fetch('/jogo/index.html', { method: 'HEAD' }).then((r) => r.ok).catch(() => false);
  el.innerHTML = `<section class="card" style="padding:16px">
    <div class="row" style="gap:8px;align-items:center">${icon('code', 18)}<h3 class="title" style="margin:0">Gamecode</h3></div>
    <p class="muted">Jogo novo, recomeçado do zero em TypeScript + PixiJS (pixel art HD, vista de cima).</p>
    ${pronto ? '<iframe src="/jogo/" title="Gamecode" style="width:100%;height:70vh;border:0;border-radius:12px;background:#0b1020"></iframe>'
      : '<p>O jogo ainda não foi compilado. Rode <code>npm run jogo:build</code> para gerar <code>public/jogo/</code>.</p>'}
  </section>`;
}
