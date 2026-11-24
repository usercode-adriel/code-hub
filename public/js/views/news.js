// NEWS: notícias internacionais em tempo real (tecnologia, IA, software, e-commerce e negócios), com leitor dentro do sistema.
import { montarNoticias, montarInsights } from '../news/noticias.js';

export default async function render(el) {
  el.innerHTML = `<div class="nx-page"><h1>News</h1>
    <p class="nx-sub">Notícias internacionais ao vivo, de fontes reais. Toque em uma notícia para ler aqui dentro.</p>
    <div class="nx-inicio"><section class="nx-card" data-news></section><section class="nx-card" data-ins></section></div></div>`;
  const parar = [montarNoticias(el.querySelector('[data-news]'), { titulo: 'Notícias do mundo' }), montarInsights(el.querySelector('[data-ins]'))];
  return () => parar.forEach((f) => f?.());
}
