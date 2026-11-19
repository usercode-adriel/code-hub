// Empregos — agência Empregos BR com recrutador(a) de IA, vagas, carreira, profissões e freelas (APIs reais).
import { shell, bindEntities, api, esc, icon } from '../world/wui.js';
import { institution } from '../world/inst.js';
import { carreira } from './economia.js';

export default async function render(el) {
  const body = shell(el, 'empregos');
  bindEntities(body);
  const [st, places] = await Promise.all([api.get('/mundo/status').catch(() => ({})), api.get('/mundo/mapa/camadas').catch(() => ({ places: [] }))]);
  const ag = (places.places || []).find((p) => p.kind === 'empregos');
  const local = ag ? await api.get(`/mundo/mapa/local/${ag.id}`).catch(() => null) : null;
  const a = local?.desk;
  const ins = institution(body, {
    scene: '/assets/pixel/scene-comercio.png', building: '/assets/pixel/b-predio.png', logo: ['EMPREGOS', 'NEXUS CITY'], color: '#facc15',
    agent: a ? { ...a, role: a.gender === 'f' ? 'Recrutadora' : 'Recrutador' } : null,
    bubble: { title: st.me?.job ? `Você é ${st.me.job}` : 'Procurando trabalho?', text: st.me?.job ? 'Trabalhe todo dia para manter o desempenho, ou veja vagas melhores abaixo.' : 'Veja as vagas abertas nas empresas da cidade e candidate-se. Cursos abrem profissões com acesso especial.' },
    actions: [
      { href: '#empVagas', icon: 'briefcase', label: 'Ver vagas e carreira', color: '#facc15' },
      { id: 'falar', icon: 'chat', label: 'Falar com o recrutamento', color: '#38d6f5' },
      { href: '#/empresas/empresa', icon: 'rocket', label: 'Abrir minha empresa', color: '#f472b6' },
      { href: '#/empresas/carreira', icon: 'school', label: 'Cursos e profissões', color: '#2fd27a' },
    ],
    chat: ag ? { url: `/mundo/lugar/${ag.id}/conversar`, placeholder: 'Pergunte sobre vagas, salários, cursos...', greeting: a ? `Oi! Sou ${a.name.split(' ')[0]}, da Empregos BR. Vamos achar uma vaga para você?` : 'Agência Empregos BR.' } : null,
    live: ag ? { scope: `place:${ag.id}`, title: 'Ao vivo na agência', art: '/assets/pixel/scene-comercio.png', empty: 'Quem entra e sai da agência aparece aqui.' } : null,
  });
  ins.body.innerHTML = '<section class="cx-card" id="empVagas"><div class="skeleton" style="height:200px"></div></section>';
  const box = ins.body.querySelector('#empVagas');
  const reload = () => carreira(box, reload);
  await reload().catch((err) => { box.innerHTML = `<p class="cx-mut">${esc(err.message)}</p>`; });
  return () => ins.stop();
}
export { icon };
