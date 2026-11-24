import { createRoot } from 'react-dom/client';
import { Game } from './game';
import { Hud } from './ui/Hud';
import './style.css';

declare global { interface Window { __game?: Game } }

async function boot() {
  const host = document.getElementById('stage')!;
  const game = new Game(host);
  await game.start();
  window.__game = game; // gancho de depuração e dos testes de navegador
  createRoot(document.getElementById('hud-root')!).render(<Hud bus={game.bus} />);
}

boot().catch((err) => {
  document.body.insertAdjacentHTML('beforeend', `<pre class="fatal">Não foi possível iniciar o jogo: ${String(err?.message ?? err)}</pre>`);
  console.error(err);
});
