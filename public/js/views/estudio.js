// ESTÚDIO: ferramentas de criação. Por enquanto só os cartões (sem funcionalidade): Video editor, Video cut e Ecommerce.
import { icon } from '../icons.js';
import { esc } from '../ui.js';

const FERRAMENTAS = [
  { id: 'video-editor', titulo: 'Video editor', texto: 'Edição de vídeo: monte cenas, legendas e exporte.', icone: 'film', cores: ['#4c1d95', '#7c3aed'] },
  { id: 'video-cut', titulo: 'Video cut', texto: 'Cortes de vídeo: separe trechos e gere versões curtas.', icone: 'camera', cores: ['#9d174d', '#ec4899'] },
  { id: 'ecommerce', titulo: 'Ecommerce', texto: 'Ferramentas para loja virtual: produtos, páginas e vídeos de venda.', icone: 'bag', cores: ['#92400e', '#f59e0b'] },
];

export default async function render(el) {
  el.innerHTML = `<div class="nx-page"><h1>Estúdio</h1><p class="nx-sub">Suas ferramentas de criação. Elas chegam em breve.</p>
    <div class="nx-estudio">${FERRAMENTAS.map((f) => `<article class="nx-est" data-ferramenta="${esc(f.id)}" style="background:linear-gradient(135deg, ${f.cores[0]}, ${f.cores[1]})">
      <span class="ic">${icon(f.icone, 24)}</span><h3>${esc(f.titulo)}</h3><p>${esc(f.texto)}</p><span class="em-breve">EM BREVE</span></article>`).join('')}</div></div>`;
}
