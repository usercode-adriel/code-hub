// Polícia de Nexus City — ocorrências, investigações com provas, seus casos, denúncias e alertas.
import { shell, bindEntities, face, nx, evRow, api, esc, icon, toast, confirmDialog } from '../world/wui.js';
import { formModal } from '../ui.js';
import { caseCard } from '../world/cases.js';
import { livePanel } from '../world/live.js';
import { myAvatar } from '../chrome.js';

const RANK = { delegado: ['Delegado', 'Delegada'], investigador: ['Investigador', 'Investigadora'], agente: ['Agente', 'Agente'], escrivao: ['Escrivão', 'Escrivã'], perito: ['Perito', 'Perita'] };
const rk = (r, g) => (RANK[r] ? RANK[r][g === 'f' ? 1 : 0] : r ? r[0].toUpperCase() + r.slice(1) : 'Policial');

export default async function render(el) {
  const body = shell(el, 'policia');

  bindEntities(body);
    let stopLive = null;
  const load = async () => {
    const d = await api.get('/mundo/policia');
    const duty = (d.team || []).find((o) => o.onDuty) || (d.team || [])[0] || null;
    const mineOpen = d.mine.filter((c) => !['arquivado', 'multa', 'condenado', 'preso', 'absolvido', 'encerrado'].includes(c.status));
    body.innerHTML = `<div class="dp">
      <section class="dp-hero cx-card">
        <div class="nb-scene dp-scene"><img class="nb-bg" src="/assets/pixel/scene-bairro.png" alt=""><img class="nb-bld" src="/assets/pixel/b-predio.png" alt="">
          <div class="nb-logo dp-logo"><b>POLICIA</b><small>NEXUS CITY</small></div>
          <div class="nb-mgr">${duty ? `<img src="${esc(duty.avatar || '')}" alt="${esc(duty.name)}"><span class="nb-mgr-tag">${esc(duty.name)} · ${esc(rk(duty.rank, duty.gender))}</span>` : ''}</div>
          <div class="nb-bubble" id="dpBubble"><b>Delegacia de Nexus City</b><p>${duty ? `${esc(duty.name.split(' ')[0])} está ${duty.onDuty ? 'de plantão' : 'no balcão'}. ` : ''}Registre ocorrências, acompanhe seus inquéritos e regularize multas e fianças.</p></div></div>
        <div class="nb-acts">
          <button class="nb-act" id="pjRep"><span style="--c:#fb923c">${icon('flag', 20)}</span>Registrar ocorrência</button>
          <a class="nb-act" href="#dpMine"><span style="--c:#60a5fa">${icon('file', 20)}</span>Meus inquéritos${mineOpen.length ? `<em>${mineOpen.length}</em>` : ''}</a>
          <a class="nb-act" href="#/banco/pendencias"><span style="--c:#f7c948">${icon('scale', 20)}</span>Pagar multa ou fiança${d.fines?.length ? `<em>${d.fines.length}</em>` : ''}</a>
          <button class="nb-act" data-a="falar"><span style="--c:#38d6f5">${icon('chat', 20)}</span>Falar com policial</button>
          <a class="nb-act" href="#/justica"><span style="--c:#c084fc">${icon('book', 20)}</span>Processos (Fórum)</a>
          <a class="nb-act" href="#/acontecimentos"><span style="--c:#ff4d5e">${icon('lock', 20)}</span>Prisões e alertas</a>
        </div>
      </section>
      <section class="nb-chat cx-card dp-chat"><div class="nb-msgs" id="dpMsgs"><div class="nb-m">${duty ? `<img src="${esc(duty.avatar || '')}" alt="">` : '<span></span>'}<p>Delegacia de Nexus City, boa ${new Date().getHours() < 12 ? 'manhã' : new Date().getHours() < 18 ? 'tarde' : 'noite'}. Em que posso ajudar?</p></div></div>
        <form class="nb-send" id="dpSend"><input name="m" placeholder="Fale com a polícia..." autocomplete="off" maxlength="400"><button class="cx-btn" aria-label="Enviar">${icon('send', 16)}</button></form></section>
      <aside class="nb-live cx-card" id="dpLive"></aside>
      <section class="dp-stats">${[['Ocorrências em aberto', d.publicStats?.open ?? d.stats?.open ?? 0, 'flag', '#fb923c'], ['Prisões e apreensões (30 d)', d.publicStats?.arrests ?? d.stats?.arrests ?? 0, 'lock', '#ff4d5e'], ['Alertas de segurança (30 d)', d.publicStats?.alerts ?? 0, 'shield', '#60a5fa'], ['Policiais na cidade', (d.team || []).length, 'users', '#2fd27a']].map(([l, v, ic, c]) => `<div class="cx-card dp-stat"><span class="cx-h-ic" style="--c:${c}">${icon(ic, 16)}</span><div><b>${v}</b><small>${l}</small></div></div>`).join('')}</section>
      <section class="cx-card dp-occ"><header class="cx-card-h"><span class="cx-h-ic" style="--c:#ff4d5e">${icon('news', 15)}</span><h3>Ocorrências noticiadas</h3></header>${d.alerts.map((e) => evRow(e, { compact: true })).join('') || '<p class="cx-mut">Cidade tranquila nas últimas horas.</p>'}</section>
      <section class="cx-card dp-mine" id="dpMine"><header class="cx-card-h"><span class="cx-h-ic" style="--c:#60a5fa">${icon('file', 15)}</span><h3>Meus inquéritos</h3></header>${d.mine.map((c) => caseCard(c)).join('') || '<p class="cx-mut">Nenhum caso envolvendo você. Ótimo sinal.</p>'}</section>
      <section class="cx-card dp-fines"><header class="cx-card-h"><span class="cx-h-ic" style="--c:#f7c948">${icon('scale', 15)}</span><h3>Multas e fianças</h3><a class="cx-more-l" href="#/banco/pendencias">Pagar</a></header>
        ${(d.fines || []).map((f) => `<div class="dp-fine ${f.status === 'atrasada' ? 'late' : ''}"><div><b>${esc(f.desc)}</b><small>${esc(f.creditor || '')} · vence ${new Date(f.due).toLocaleDateString('pt-BR')}</small></div><em>${nx(f.amount)}</em></div>`).join('') || '<p class="cx-mut">Nada em aberto no seu nome.</p>'}</section>
      <section class="cx-card dp-ficha" id="dpFicha"><header class="cx-card-h"><span class="cx-h-ic" style="--c:#f87171">${icon('file', 15)}</span><h3>Antecedentes criminais</h3></header>
        <div class="dp-fichas" data-loading>Carregando fichas…</div></section>
      <section class="cx-card dp-team"><header class="cx-card-h"><span class="cx-h-ic" style="--c:#2fd27a">${icon('shield', 15)}</span><h3>Policiais de IA</h3></header>
        <div class="dp-officers">${(d.team || []).map((o) => `<button data-person="${esc(o.id)}"><img src="${esc(o.avatar || '')}" alt=""><b>${esc(o.name.split(' ')[0])}</b><small>${esc(rk(o.rank, o.gender))}</small>${o.onDuty ? '<i class="dp-duty">plantão</i>' : ''}</button>`).join('') || '<p class="cx-mut">A delegacia ainda está montando a equipe.</p>'}</div></section>
      ${d.restricted ? `<section class="cx-card dp-auth">${icon('lock', 18)}<div><b>Painel interno restrito às autoridades</b><p class="cx-mut">${d.profession?.eligible ? `Você já tem o diploma (${esc((d.profession.needs || []).join(', '))}). Habilite-se pela ${esc(d.profession.via || 'carreira pública')}.` : `Para virar autoridade policial, forme-se em ${esc((d.profession?.needs || ['Direito']).join(' e '))}.`}</p></div><a class="cx-btn sm ghost" href="#/empresas/carreira">Carreira</a></section>`
        : `<section class="cx-card dp-int"><header class="cx-card-h"><span class="cx-h-ic" style="--c:#c084fc">${icon('eye', 15)}</span><h3>Painel interno · casos da cidade</h3></header>${d.cases.filter((c) => c.suspect?.id !== 'me').slice(0, 12).map((c) => caseCard(c, { actions: false })).join('') || '<p class="cx-mut">Nada registrado.</p>'}</section>`}
    </div>`;
    stopLive?.(); stopLive = livePanel(body.querySelector('#dpLive'), { scope: 'policia', title: 'Live da Delegacia', art: '/assets/pixel/scene-bairro.png', n: 10, empty: 'Ocorrências, prisões e alertas da cidade aparecem aqui.' });
    body.querySelector('#pjRep').onclick = () => reportForm(d);
    const msgs = body.querySelector('#dpMsgs'); const f = body.querySelector('#dpSend');
    body.querySelector('[data-a="falar"]').onclick = () => f.m.focus();
    f.onsubmit = async (e) => {
      e.preventDefault(); const t = f.m.value.trim(); if (!t) return; f.m.value = '';
      msgs.insertAdjacentHTML('beforeend', `<div class="nb-m me"><p>${esc(t)}</p><img src="${esc(myAvatar())}" alt=""></div><div class="nb-typing"><i></i><i></i><i></i></div>`); msgs.scrollTop = msgs.scrollHeight;
      try {
        const r = await api.post('/mundo/policia/atendimento', { mensagem: t });
        msgs.querySelector('.nb-typing')?.remove();
        msgs.insertAdjacentHTML('beforeend', `<div class="nb-m"><img src="${esc(r.officer?.avatar || '')}" alt=""><p>${esc(r.text)}</p></div>`);
        body.querySelector('#dpBubble').innerHTML = `<b>${esc(r.officer?.name?.split(' ')[0] || 'Policial')}</b><p>${esc(r.text)}</p>`;
      } catch (err) { msgs.querySelector('.nb-typing')?.remove(); toast('Não deu', err.message, 'error'); }
      msgs.scrollTop = msgs.scrollHeight;
    };
    bindCaseActions(body, load);
  };
  const reportForm = async (d) => {
    const ppl = await api.get('/mundo/relacoes').catch(() => []);
    if (!ppl.length) { toast('Ninguém para denunciar', 'Você só pode registrar ocorrência contra pessoas que conhece.', 'info'); return; }
    formModal({ title: 'Registrar ocorrência', submit: 'Registrar', fields: [
      { name: 'tipo', label: 'Tipo', type: 'select', options: [['calote', 'Não me pagou um empréstimo (ação civil)'], ['furto', 'Furto contra mim'], ['golpe', 'Golpe contra mim']] },
      { name: 'personaId', label: 'Contra quem', type: 'select', options: ppl.map((p) => [p.id, `${p.name}${(d.debtors||[]).find((x) => x.id === p.id) ? ` — te deve ${nx((d.debtors||[]).find((x) => x.id === p.id).amount, 0)}` : ''}`]) },
      { name: 'relato', label: 'O que aconteceu', type: 'textarea', full: true, hint: 'Denúncia falsa sem provas é arquivada e a pessoa pode ficar sabendo.' }],
      onSubmit: async (v) => { const c = await api.post('/mundo/policia/denuncia', v); toast('Ocorrência registrada', `Caso nº ${c.n} · ${c.statusLabel}`, 'success'); await load(); } });
  };
  // fichas criminais: a sua e as da cidade (só o que a polícia registrou), depois que a tela está montada
  const loadFichas = async () => {
    const host = body.querySelector('#dpFicha .dp-fichas'); if (!host) return;
    try {
      const d2 = await api.get('/mundo/fichas');
      const row = (f) => `<div class="dp-ficha-row"><b>${esc(f.name)}</b><small>${esc(f.situacao)} · ${f.crimes.length} registro(s)${f.prisoes ? ` · ${f.prisoes} prisão(ões)` : ''}${f.reincidencia ? ` · reincidente` : ''}</small>
        <ul>${f.crimes.slice(0, 4).map((c) => `<li>${esc(c.label)}${c.local ? ` em ${esc(c.local)}` : ''} · ${new Date(c.at).toLocaleDateString('pt-BR')}${c.reincidente ? ' <em>reincidente</em>' : ''}</li>`).join('')}</ul></div>`;
      host.removeAttribute('data-loading');
      host.innerHTML = d2.fichas.length ? d2.fichas.map(row).join('') : '<p class="cx-mut">Nenhuma ficha criminal registrada na cidade.</p>';
    } catch (err) { host.textContent = 'Não foi possível carregar as fichas.'; }
  };
  
  try { await load(); loadFichas(); } catch (err) { body.innerHTML = `<div class="w-empty"><b>${esc(err.message)}</b></div>`; }
  return () => stopLive?.();
}

export function bindCaseActions(root, reload) {
  root.querySelectorAll('[data-dep]').forEach((b) => { b.onclick = async () => {
    const v = b.dataset.v;
    if (!(await confirmDialog('Depoimento', { negar: 'Você vai negar as acusações. Se as provas forem fortes, negar não ajuda.', confessar: 'Confessar reduz a multa, mas fica no seu histórico.', silencio: 'Você tem o direito de ficar em silêncio. O caso segue com as provas.' }[v], 'Confirmar'))) return;
    try { const c = await api.post(`/mundo/justica/casos/${b.dataset.dep}/depor`, { versao: v }); toast('Depoimento registrado', c.statusLabel, 'success'); await reload(); } catch (err) { toast('Não deu', err.message, 'error'); }
  }; });
  root.querySelectorAll('[data-deal]').forEach((b) => { b.onclick = async () => {
    const { withPin } = await import('../world/wui.js');
    try { const c = await withPin((pin) => api.post(`/mundo/justica/casos/${b.dataset.deal}/acordo`, { pin }), 'Pagar o acordo'); if (c) { toast('Acordo feito', 'O processo foi encerrado.', 'success'); await reload(); } } catch (err) { toast('Não deu', err.message, 'error'); }
  }; });
}
