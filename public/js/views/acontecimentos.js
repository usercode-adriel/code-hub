// Placeholder — será construído nos próximos passos da Etapa 2.
import { shell, icon } from '../world/wui.js';
export default async function render(el) {
  const body = shell(el, 'acontecimentos');
  body.innerHTML = '<div class="w-empty"><b>Em construção</b><p class="muted">Esta central chega no próximo passo.</p></div>';
}
