// Polícia de Nexus City — ocorrências, investigações com provas, seus casos, denúncias e alertas.
import { shell, bindEntities, face, nx, evRow, api, esc, icon, toast, confirmDialog } from '../world/wui.js';
import { formModal } from '../ui.js';
import { caseCard } from '../world/cases.js';

export default async function render(el) {
  const body = shell(el, 'policia');
  bindEntities(body);
  const load = async () => {
    const d = await api.get('/mundo/policia');
    if (d.restricted) { renderRestricted(d); return; }
    body.innerHTML = `<div class="pj">
      <section class="w-panel pj-top"><div><h1>${icon('shield', 22)} Polícia de Nexus City</h1><p class="muted">${d.station ? `${esc(d.station.name)} · ${esc(d.station.address || '')}` : 'Delegacia'} · Investigações seguem provas: sem provas, o caso é arquivado.</p></div>
        <button class="btn primary" id="pjRep">${icon('flag', 14)} Registrar ocorrência</button></section>
      <div class="pj-stats">${[['Casos abertos', d.stats.open], ['Resolvidos (30 d)', d.stats.solved], ['Arquivados (30 d)', d.stats.archived], ['Prisões (30 d)', d.stats.arrests]].map(([l, v]) => `<div class="w-panel"><small>${l}</small><b>${v}</b></div>`).join('')}</div>
      <div class="pj-cols"><div class="pj-main">
          <h3>Seus casos</h3>${d.mine.map((c) => caseCard(c)).join('') || '<p class="muted">Nenhum caso envolvendo você.</p>'}
          <h3>Ocorrências recentes na cidade</h3>${d.cases.filter((c) => c.suspect?.id !== 'me').slice(0, 12).map((c) => caseCard(c, { actions: false })).join('') || '<p class="muted">Nada registrado.</p>'}</div>
        <aside class="pj-side"><section class="w-panel"><h5>Equipe</h5>${d.officers.map((o) => `<button class="gm-person" data-person="${esc(o.id)}">${face(o, 30)}<span>${esc(o.name)}<small>${esc({ delegado: 'Delegado(a)', investigador: 'Investigador(a)', patrulha: 'Policial de patrulha' }[o.rank] || o.rank)}</small></span></button>`).join('') || '<p class="muted">Sem policiais.</p>'}</section>
          <section class="w-panel"><h5>Alertas</h5>${d.alerts.map((e) => evRow(e, { compact: true })).join('') || '<p class="muted">Cidade tranquila.</p>'}</section></aside></div></div>`;
    body.querySelector('#pjRep').onclick = () => reportForm(d);
    bindCaseActions(body, load);
  };
  // visão de cidadão comum: a delegacia é sigilosa. Você só vê o que virou notícia e os seus próprios casos.
  const renderRestricted = (d) => {
    const pr = d.profession || {};
    body.innerHTML = `<div class="pj">
      <section class="w-panel pj-locked"><div class="pj-lock-ic">${icon('shield', 30)}</div>
        <div><h1>Delegacia de Nexus City</h1><p class="muted">${d.station ? `${esc(d.station.name)} · ${esc(d.station.address || '')}` : ''}</p>
        <p>O painel da polícia é <b>restrito às autoridades</b>. Os crimes — inclusive os cibernéticos — acontecem a todo momento e a polícia trabalha em sigilo. Como cidadão, você acompanha apenas o que é <b>noticiado</b> e os <b>seus próprios casos</b>.</p>
        ${pr.eligible ? `<p class="pj-elig">${icon('check', 13)} Você tem o diploma necessário (${esc((pr.needs || []).join(', '))}). Habilite-se pela ${esc(pr.via || 'carreira pública')} em Carreira.</p><a class="btn primary" href="#/empresas/carreira">${icon('briefcase', 13)} Ir para Carreira</a>`
          : `<p class="muted">Para virar autoridade policial, forme-se em <b>${esc((pr.needs || ['Direito']).join(' e '))}</b> na Universidade.</p><a class="btn outline" href="#/empresas/carreira">${icon('school', 13)} Ver cursos</a>`}</div>
        <button class="btn outline pj-rep-sm" id="pjRep">${icon('flag', 13)} Registrar ocorrência</button></section>
      <div class="pj-cols"><div class="pj-main">
          <h3>Seus casos</h3>${d.mine.map((c) => caseCard(c)).join('') || '<p class="muted">Você não tem nenhum caso em aberto. Ótimo sinal.</p>'}</div>
        <aside class="pj-side"><section class="w-panel"><h5>${icon('news', 12)} Segurança no noticiário</h5>${d.alerts.length ? d.alerts.map((e) => evRow(e, { compact: true })).join('') : '<p class="muted">Nada publicado nas últimas horas.</p>'}<a class="w-morelink" href="#/midia">Ver no portal da cidade →</a></section></aside></div></div>`;
    body.querySelector('#pjRep').onclick = () => reportForm(d);
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
  try { await load(); } catch (err) { body.innerHTML = `<div class="w-empty"><b>${esc(err.message)}</b></div>`; }
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
