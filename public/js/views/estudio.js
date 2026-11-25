// ESTÚDIO: ferramentas de criação. O cartão Ecommerce abre o Codeniac Commerce Office (escritório isométrico com agentes de IA).
// Video editor e Video cut continuam sem funcionalidade (cartões "em breve").
import { icon } from '../icons.js';
import { esc } from '../ui.js';

const FERRAMENTAS = [
  { id: 'video-editor', titulo: 'Video editor', texto: 'Edição de vídeo: monte cenas, legendas e exporte.', icone: 'film', cores: ['#4c1d95', '#7c3aed'], pronto: false },
  { id: 'video-cut', titulo: 'Video cut', texto: 'Cortes de vídeo: separe trechos e gere versões curtas.', icone: 'camera', cores: ['#9d174d', '#ec4899'], pronto: false },
  { id: 'ecommerce', titulo: 'Ecommerce', texto: 'Commerce Office: escritório com agentes de IA, produtos, vendas, comissões e campanhas.', icone: 'bag', cores: ['#92400e', '#f59e0b'], pronto: true },
];

export default async function render(el, parts = []) {
  if (parts[0] === 'ecommerce') return escritorio(el);
  el.innerHTML = `<div class="nx-page"><h1>Estúdio</h1><p class="nx-sub">Suas ferramentas de criação.</p>
    <div class="nx-estudio">${FERRAMENTAS.map((f) => `<${f.pronto ? 'a href="#/estudio/ecommerce"' : 'article'} class="nx-est" data-ferramenta="${esc(f.id)}" style="background:linear-gradient(135deg, ${f.cores[0]}, ${f.cores[1]});color:#fff;text-decoration:none">
      <span class="ic">${icon(f.icone, 24)}</span><h3>${esc(f.titulo)}</h3><p>${esc(f.texto)}</p>${f.pronto ? '<span class="em-breve" style="background:rgba(255,255,255,.25)">ABRIR →</span>' : '<span class="em-breve">EM BREVE</span>'}</${f.pronto ? 'a' : 'article'}>`).join('')}</div></div>`;
}

async function escritorio(el) {
  const ok = await fetch('/escritorio/index.html', { method: 'HEAD' }).then((r) => r.ok).catch(() => false);
  el.innerHTML = `<div class="nx-page" style="padding:0;overflow:hidden;display:flex;flex-direction:column">
    <div style="display:flex;align-items:center;gap:10px;padding:6px 12px;background:#0b1030"><a href="#/estudio" class="nx-btn">← Estúdio</a><b>Codeniac Commerce Office</b></div>
    ${ok ? '<iframe src="/escritorio/" title="Codeniac Commerce Office" style="flex:1;border:0;width:100%;min-height:0;background:#0b1030" allow="fullscreen"></iframe>'
      : '<p style="padding:24px">O Commerce Office ainda não foi compilado. Rode <code>npm run office:build</code> para gerar <code>public/escritorio/</code>.</p>'}</div>`;
}
