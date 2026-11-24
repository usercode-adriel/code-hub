// GAMECODE: painel de jogos no estilo do dashboard do Xbox. Cada jogo do catálogo (js/gamecode/jogos.js) vira um cartão;
// o primeiro aparece em destaque. Clicar abre o jogo em tela cheia, com botão para voltar ao painel.
import { icon } from '../icons.js';
import { esc } from '../ui.js';
import { JOGOS } from '../gamecode/jogos.js';

const CSS = `
.gc-xb { border-radius: 16px; overflow: hidden; background: radial-gradient(circle at 80% 0%, #1f3d20 0%, #0b1a0d 60%, #050a06 100%); padding: 22px; color: #e8f5e9; min-height: 70vh; }
.gc-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.gc-top b { font-size: 18px; letter-spacing: .5px; }
.gc-top span { opacity: .6; font-size: 13px; }
.gc-hero { position: relative; display: flex; align-items: flex-end; min-height: 230px; border-radius: 14px; padding: 22px; margin-bottom: 26px; cursor: pointer; border: 2px solid transparent; outline: none; }
.gc-hero:focus-visible, .gc-card:focus-visible { border-color: #bbf7d0; }
.gc-hero h2 { margin: 0 0 6px; font-size: 30px; }
.gc-hero p { margin: 0 0 14px; max-width: 540px; opacity: .85; font-size: 14px; }
.gc-btn { display: inline-flex; align-items: center; gap: 8px; border: 0; border-radius: 8px; padding: 9px 16px; background: #bbf7d0; color: #052e16; font-weight: 700; cursor: pointer; }
.gc-row-h { font-size: 15px; margin: 6px 0 10px; opacity: .85; }
.gc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 14px; }
.gc-card { position: relative; aspect-ratio: 16 / 9; border-radius: 12px; padding: 12px; display: flex; flex-direction: column; justify-content: flex-end; cursor: pointer; border: 2px solid transparent; outline: none; transition: transform .15s, border-color .15s; }
.gc-card:hover, .gc-hero:hover { transform: scale(1.02); border-color: #bbf7d0; }
.gc-card b { font-size: 15px; }
.gc-card small { opacity: .75; font-size: 11px; }
.gc-badge { position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,.45); border-radius: 6px; font-size: 10px; padding: 2px 6px; }
.gc-vazio { opacity: .6; font-size: 13px; margin-top: 16px; }
.gc-play { position: fixed; inset: 0; z-index: 1000; background: #000; display: flex; flex-direction: column; }
.gc-play-bar { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: #0b1a0d; color: #e8f5e9; }
.gc-play-bar b { flex: 1; font-size: 14px; }
.gc-play iframe { flex: 1; border: 0; width: 100%; }
`;

const fundo = (g) => `linear-gradient(135deg, ${g.cores[0]} 0%, ${g.cores[1]} 100%)`;

export default async function render(el) {
  if (!document.getElementById('gc-css')) { const st = document.createElement('style'); st.id = 'gc-css'; st.textContent = CSS; document.head.appendChild(st); }
  const [destaque, ...demais] = JOGOS;
  const cartao = (g) => `<div class="gc-card" role="button" tabindex="0" data-jogo="${esc(g.id)}" style="background:${fundo(g)}">
      <span class="gc-badge">Codeniac</span><b>${esc(g.titulo)}</b><small>${esc(g.versao)}</small></div>`;
  el.innerHTML = `<section class="gc-xb">
    <div class="gc-top"><b>Gamecode</b><span>Seus jogos</span></div>
    ${destaque ? `<div class="gc-hero" role="button" tabindex="0" data-jogo="${esc(destaque.id)}" style="background:${fundo(destaque)}">
      <div><h2>${esc(destaque.titulo)}</h2><p>${esc(destaque.descricao)}</p>
      <button class="gc-btn" type="button" tabindex="-1">${icon('play', 14)} Jogar</button></div></div>` : ''}
    <div class="gc-row-h">Jogos</div>
    <div class="gc-grid">${JOGOS.map(cartao).join('')}</div>
    ${JOGOS.length ? '' : '<p class="gc-vazio">Nenhum jogo ainda. Os jogos que você criar aparecem aqui.</p>'}
  </section>`;
  el.querySelectorAll('[data-jogo]').forEach((b) => {
    const abrir = () => abrirJogo(JOGOS.find((g) => g.id === b.dataset.jogo));
    b.onclick = abrir;
    b.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); } };
  });
}

function abrirJogo(g) {
  if (!g) return;
  const tela = document.createElement('div');
  tela.className = 'gc-play';
  tela.innerHTML = `<div class="gc-play-bar"><button class="gc-btn" type="button" id="gcVoltar">← Voltar</button><b>${esc(g.titulo)}</b></div>
    <iframe src="${esc(g.src)}" title="${esc(g.titulo)}" allow="fullscreen"></iframe>`;
  const sair = () => { tela.remove(); document.removeEventListener('keydown', esc_); };
  const esc_ = (e) => { if (e.key === 'Escape') sair(); };
  tela.querySelector('#gcVoltar').onclick = sair;
  document.addEventListener('keydown', esc_);
  document.body.appendChild(tela);
}
