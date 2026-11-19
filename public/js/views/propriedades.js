// Propriedades — Imobiliária Horizonte com corretor(a) de IA, imóveis à venda e os seus (APIs reais de imóveis).
import { shell, bindEntities, api, esc, icon } from '../world/wui.js';
import { institution } from '../world/inst.js';
import { imoveis } from './economia.js';

export default async function render(el) {
  const body = shell(el, 'propriedades');
  bindEntities(body);
  const layers = await api.get('/mundo/mapa/camadas').catch(() => ({ places: [] }));
  const ag = (layers.places || []).find((p) => p.kind === 'imobiliaria');
  const local = ag ? await api.get(`/mundo/mapa/local/${ag.id}`).catch(() => null) : null;
  const a = local?.desk;
  const ins = institution(body, {
    scene: '/assets/pixel/scene-bairro.png', building: '/assets/pixel/b-casa.png', logo: ['IMOVEIS', 'HORIZONTE'], color: '#34d399',
    agent: a ? { ...a, role: a.gender === 'f' ? 'Corretora' : 'Corretor' } : null,
    bubble: { title: 'Seu lugar em Nexus City', text: 'Casas, apartamentos, salas comerciais e terrenos de verdade no mapa. Imóvel valoriza com o bairro e pode render aluguel.' },
    actions: [
      { href: '#propLista', icon: 'building', label: 'Imóveis à venda e os meus', color: '#34d399' },
      { id: 'falar', icon: 'chat', label: 'Falar com o corretor', color: '#38d6f5' },
      { href: '#/mapa', icon: 'map', label: 'Ver casas no mapa', color: '#f7c948' },
      { href: '#/banco/emprestimos', icon: 'wallet', label: 'Financiar pelo Banco Nexus', color: '#a78bfa' },
    ],
    chat: ag ? { url: `/mundo/lugar/${ag.id}/conversar`, placeholder: 'Pergunte sobre bairros, preços, aluguel...', greeting: a ? `Olá! Sou ${a.name.split(' ')[0]}, corretor(a) da Horizonte. Procurando casa ou investimento?` : 'Imobiliária Horizonte.' } : null,
    live: ag ? { scope: `place:${ag.id}`, title: 'Ao vivo na imobiliária', art: '/assets/pixel/scene-bairro.png', empty: 'Visitas e negócios da imobiliária aparecem aqui.' } : null,
  });
  ins.body.innerHTML = '<section class="cx-card" id="propLista"><div class="skeleton" style="height:200px"></div></section>';
  const box = ins.body.querySelector('#propLista');
  const reload = () => imoveis(box, reload);
  await reload().catch((err) => { box.innerHTML = `<p class="cx-mut">${esc(err.message)}</p>`; });
  return () => ins.stop();
}
export { icon };
