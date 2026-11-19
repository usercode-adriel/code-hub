// Hospital de Nexus City — médico(a) de plantão (pessoa real da cidade), check-up pago que recupera sua saúde,
// clínicas e farmácias do mapa, equipe de saúde e LIVE dos atendimentos.
import { shell, bindEntities, nx, api, esc, icon, toast, withPin } from '../world/wui.js';
import { institution } from '../world/inst.js';

export default async function render(el) {
  const body = shell(el, 'hospital');
  bindEntities(body);
  let ins = null;
  const load = async () => {
    const d = await api.get('/mundo/hospital');
    ins?.stop(); body.innerHTML = '';
    const doc = d.duty;
    ins = institution(body, {
      scene: '/assets/pixel/scene-hospital.png', building: '/assets/pixel/b-hospital.png', logo: ['HOSPITAL', 'NEXUS CITY'], color: '#f87171',
      agent: doc ? { ...doc, role: doc.gender === 'f' ? 'Médica de plantão' : 'Médico de plantão' } : null,
      bubble: { title: d.hospital?.name || 'Hospital', text: `Sua saúde está em ${d.health}%. ${d.health < 70 ? 'Que tal um check-up hoje?' : 'Você está bem! Continue se cuidando.'}` },
      actions: [
        { id: 'checkup', icon: 'hospital', label: `Fazer check-up · ${nx(d.price, 0)}`, color: '#f87171' },
        { id: 'falar', icon: 'chat', label: 'Falar com o plantão', color: '#38d6f5' },
        { href: '#/mercado', icon: 'pill', label: 'Farmácias (kit de primeiros socorros)', color: '#2fd27a' },
        { href: d.hospital ? `#/mapa/${d.hospital.id}` : '#/mapa', icon: 'pin', label: 'Ver no mapa', color: '#f7c948' },
      ],
      chat: { url: '/mundo/hospital/atendimento', placeholder: 'Conte como você está se sentindo...', greeting: doc ? `Olá! Sou ${doc.name.split(' ')[0]}, de plantão hoje. Como posso ajudar?` : 'Pronto atendimento de Nexus City.' },
      live: { scope: 'saude', title: 'Live da Saúde', art: '/assets/pixel/scene-hospital.png', empty: 'Atendimentos em hospitais, clínicas e farmácias aparecem aqui.' },
    });
    ins.body.innerHTML = `
      <section class="cx-card"><header class="cx-card-h"><span class="cx-h-ic" style="--c:#2fd27a">${icon('heart', 15)}</span><h3>Sua saúde</h3></header>
        <div class="ins-meter"><i style="width:${d.health}%"></i></div><p class="cx-mut" style="margin-top:8px">${d.health}% · cai um pouco a cada dia. ${d.lastCheckup ? `Último check-up: ${new Date(d.lastCheckup).toLocaleString('pt-BR')}.` : 'Você nunca fez check-up.'}</p></section>
      <section class="cx-card"><header class="cx-card-h"><span class="cx-h-ic" style="--c:#f87171">${icon('hospital', 15)}</span><h3>Unidades de saúde</h3></header>
        <div class="ins-cards">${d.units.map((u) => `<a class="ins-u" href="#/mapa/${esc(u.id)}"><b>${esc(u.name)}</b><small>${esc({ hospital: 'Hospital', clinica: 'Clínica', farmacia: 'Farmácia' }[u.kind] || u.kind)} · <span class="${u.open ? 'up' : 'down'}">${u.open ? 'aberta' : 'fechada'}</span>${u.medkit ? ' · vende kit' : ''}</small><small>${icon('pin', 11)} ${esc(u.address || '')}</small></a>`).join('') || '<p class="cx-mut">Nenhuma unidade no mapa ainda.</p>'}</div></section>
      <section class="cx-card"><header class="cx-card-h"><span class="cx-h-ic" style="--c:#38d6f5">${icon('users', 15)}</span><h3>Profissionais de saúde</h3></header>
        <div class="ins-people">${d.doctors.map((p) => `<button data-person="${esc(p.id)}"><img src="${esc(p.avatar || '')}" alt=""><b>${esc(p.name.split(' ')[0])}</b><small>${esc(p.job || '')}</small></button>`).join('') || '<p class="cx-mut">A cidade ainda não tem profissionais de saúde formados.</p>'}</div></section>`;
    ins.on('checkup', async () => {
      try { const r = await withPin((pin) => api.post('/mundo/hospital/checkup', { pin }), `Check-up · ${nx(d.price, 0)}`); if (r) { toast('Check-up feito', `Saúde: ${r.before}% → 100%`, 'success'); await load(); } } catch (err) { toast('Não deu', err.message, 'error'); }
    });
  };
  try { await load(); } catch (err) { body.innerHTML = `<div class="w-empty"><b>${esc(err.message)}</b></div>`; }
  return () => ins?.stop();
}
