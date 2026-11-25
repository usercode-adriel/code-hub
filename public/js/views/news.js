// NEWS: notícias internacionais em tempo real (tecnologia, IA, software, e-commerce e negócios), com leitor dentro do sistema.
import { montarNoticias, montarInsights, montarCarrossel } from '../news/noticias.js';

export default async function render(el) {
  el.innerHTML = `<div class="nx-page"><h1>News</h1>
    <p class="nx-sub">Notícias internacionais ao vivo, de fontes reais. Toque em uma notícia para ler aqui dentro.</p>
    <section class="nx-card" data-car style="margin-bottom:16px"></section>
    <div class="nx-inicio"><section class="nx-card" data-news></section><section class="nx-card" data-ins></section></div></div>`;
  const car = montarCarrossel(el.querySelector('[data-car]'));
  // o carrossel usa os mesmos dados da lista: quando a lista atualiza (sozinha ou pelo botão), os destaques também
  el.addEventListener('nx-dados', (e) => car.atualizar(e.detail));
  const parar = [montarNoticias(el.querySelector('[data-news]'), { titulo: 'Notícias do mundo' }), montarInsights(el.querySelector('[data-ins]')), () => car.destruir()];
  return () => parar.forEach((f) => f?.());
}
