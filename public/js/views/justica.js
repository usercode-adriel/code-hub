// Fórum de Justiça — seus processos, multas e decisões, ficha de antecedentes e a tabela de penalidades.
import { shell, bindEntities, face, nx, api, esc, icon, toast, withPin } from '../world/wui.js';
import { caseCard } from '../world/cases.js';
import { bindCaseActions } from './policia.js';

export default async function render(el) {
  const body = shell(el, 'justica');
  bindEntities(body);
  const load = async () => {
    const d = await api.get('/mundo/justica');
    const open = d.debts.filter((x) => x.status !== 'paga');
    body.innerHTML = `<div class="pj">
      <section class="w-panel pj-top"><div><h1>${icon('scale', 22)} Fórum de Justiça</h1><p class="muted">${d.court ? `${esc(d.court.name)} · ${esc(d.court.address || '')}` : ''}</p></div>
        ${d.judge ? `<button class="gm-person" data-person="${esc(d.judge.id)}">${face(d.judge, 36)}<span>${esc(d.judge.name)}<small>Juíza(iz) da comarca</small></span></button>` : ''}</section>
      <div class="pj-cols"><div class="pj-main">
          ${open.length ? `<h3>Multas e condenações a pagar</h3>${open.map((x) => `<div class="w-panel bq-debt ${x.status === 'atrasada' ? 'late' : ''}"><div><b>${esc(x.desc)}</b><small>${esc(x.creditor || '')} · vence ${new Date(x.due).toLocaleDateString('pt-BR')}${x.status === 'atrasada' ? ' · atrasada (pode haver penhora do saldo)' : ''}</small></div><em>${nx(x.amount - (x.paid || 0))}</em><button class="btn sm primary" data-pay="${esc(x.id)}">Pagar</button></div>`).join('')}` : ''}
          <h3>Seus processos</h3>${d.mine.map((c) => caseCard(c)).join('') || '<p class="muted">Nenhum processo envolvendo você.</p>'}
          <h3>${d.authorized ? 'Decisões recentes' : 'Julgamentos no noticiário'}</h3>${d.authorized
            ? (d.sentences.filter((c) => c.suspect?.id !== 'me').map((c) => caseCard(c, { actions: false })).join('') || '<p class="muted">Nenhuma decisão ainda.</p>')
            : (d.sentences.length ? d.sentences.map((e) => `<div class="w-panel w-ev compact"><b>${esc(e.title)}</b><small class="muted"> ${esc(e.catLabel || '')}</small></div>`).join('') : '<p class="muted">Os processos de terceiros são sigilosos. Você acompanha pelo <a href="#/midia">portal da cidade</a>.</p>')}</div>
        <aside class="pj-side">${!d.authorized ? `<section class="w-panel pj-note"><h5>${icon('scale', 12)} Acesso de cidadão</h5><p class="muted">Você vê apenas os seus processos, multas e antecedentes. Os autos de terceiros e a tabela de penas são sigilosos — para acessá-los, torne-se <b>ministro(a)</b> (diploma de Direito).</p></section>` : ''}
          <section class="w-panel"><h5>Seus antecedentes</h5>${d.record.map((r) => `<div class="bq-kv"><span>${esc(r.label || r.type)}</span><small>${new Date(r.at).toLocaleDateString('pt-BR')}</small></div>`).join('') || '<p class="muted">Ficha limpa.</p>'}</section>
          ${d.penalties ? `<section class="w-panel"><h5>Penalidades em vigor</h5>${Object.entries(d.penalties).filter(([, p]) => p.kind === 'criminal').map(([, p]) => `<div class="bq-kv"><span>${esc(p.label)}</span><b>${nx(p.fine, 0)}</b></div>`).join('')}<p class="hint muted">Multas crescem com reincidência e caem com confissão.</p></section>` : ''}</aside></div></div>`;
    body.querySelectorAll('[data-pay]').forEach((b) => { b.onclick = async () => { try { const r = await withPin((pin) => api.post(`/mundo/banco/debito/${b.dataset.pay}`, { pin }), 'Pagar'); if (r) { toast('Pago', 'Débito quitado.', 'success'); await load(); } } catch (err) { toast('Não deu', err.message, 'error'); } }; });
    bindCaseActions(body, load);
  };
  try { await load(); } catch (err) { body.innerHTML = `<div class="w-empty"><b>${esc(err.message)}</b></div>`; }
}
