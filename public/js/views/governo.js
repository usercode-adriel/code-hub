// 05 · GOVERNO — autônomo. Governador(a) e ministros são personagens de IA que governam sozinhos.
// Como cidadão você acompanha; para integrar o governo, forme-se em Direito e seja indicado(a) ministro(a).
import { shell, face, nx, bindEntities, api, esc, timeAgo, icon } from '../world/wui.js';

export default async function render(el) {
  const body = shell(el, 'governo', { title: 'Governo de Nexus City', sub: 'Governador(a) e ministros governam de forma independente. Você acompanha de fora.' });
  bindEntities(body);
  const g = await api.get('/mundo/governo');
  if (!g) { body.innerHTML = '<div class="w-empty"><b>O governo ainda está sendo formado.</b></div>'; return; }
  const party = (id) => g.parties.find((p) => p.id === id);
  const tag = (id) => (party(id) ? `<span class="g-party" style="--c:${esc(party(id).color)}">${esc(party(id).sigla)}</span>` : '');
  const el2 = g.election; const lastPoll = el2.polls?.at(-1); const me = g.me;
  const holder = (h, role) => `<button class="g-holder" ${h.me ? '' : `data-person="${esc(h.id)}"`}>${face(h, 46)}<b>${esc(h.name)}</b>${tag(h.partyId)}<small class="muted">${role} · desde ${new Date(h.since).toLocaleDateString('pt-BR')}</small></button>`;
  body.innerHTML = `<div class="g-grid">
    <section class="w-panel g-mayor"><h3>${icon('flag', 15)} Governo</h3>${g.offices[0].holders.map((h) => holder(h, 'Governador(a)')).join('') || '<p class="muted">Cargo vago.</p>'}
      <h3>Ministros</h3><div class="g-council">${g.offices[1].holders.map((h) => holder(h, 'Ministro(a)')).join('') || '<p class="muted">Nenhum ministro no momento.</p>'}</div></section>
    <section class="w-panel g-election"><div class="w-ph"><h3>${el2.n}ª composição</h3><span class="w-chip gold">${esc(el2.phaseLabel)}</span></div>
      <p class="muted">${el2.phase === 'mandato' ? 'A próxima recomposição começa' : 'Esta fase termina'} em ${new Date(el2.phaseEnds).toLocaleString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. O processo é conduzido pelo próprio governo.</p>
      ${lastPoll ? `<h4>Apoio popular (${esc(timeAgo(lastPoll.at))})</h4>${lastPoll.results.map((r) => `<div class="g-bar"><span>${esc(r.who.name)}</span><i style="width:${r.pct}%;--c:${esc(party(r.partyId)?.color || '#64748b')}"></i><b>${r.pct}%</b></div>`).join('')}` : ''}
      ${g.history.length ? `<h4>Governos anteriores</h4>${g.history.map((h) => `<div class="w-row"><span>${h.n}ª · ${new Date(h.at).toLocaleDateString('pt-BR')}</span><small>${h.result.prefeito?.[0] ? `${esc(h.result.prefeito[0].who.name)} (${h.result.prefeito[0].pct}%)` : ''}</small></div>`).join('')}` : ''}</section>
    <section class="w-panel g-me"><h3>Você na política</h3>
      <p class="muted">O governo de Nexus City é <b>autônomo</b>: ministros e governador agem sem a sua interferência. Para integrá-lo, você precisa do diploma de <b>Direito</b> e ser habilitado(a) como <b>ministro(a)</b>.</p>
      <a class="btn sm primary" href="#/empresas/carreira">${icon('school', 13)} Estudar Direito</a>
      <h4>Partidos</h4>${g.parties.map((p) => `<div class="w-row"><span>${tag(p.id)} ${esc(p.name)} <small class="muted">${p.members} membros · ${p.ideology > 0.3 ? 'pró-mercado' : p.ideology < -0.3 ? 'social' : 'centro'}${p.leader ? ` · líder ${esc(p.leader.name)}` : ''}</small></span></div>`).join('')}</section>
    <section class="w-panel g-laws"><h3>Leis em vigor</h3><p class="muted">Impostos ${Math.round((g.stats.taxRate || 0) * 100)}% · juros base ${((g.stats.baseRate || 0) * 100).toFixed(2)}%/dia · crime ×${(g.stats.crimeMult || 1).toFixed(2)} · desconto universitário ${Math.round((g.stats.eduDiscount || 0) * 100)}%</p>
      ${g.laws.map((l) => `<div class="g-law ${esc(l.status.replace(/\s/g, '-'))}"><div class="grow"><b>${esc(l.title)}</b><small class="muted">${esc(l.desc)} · por ${esc(l.author?.name || 'governo')} · ${esc(timeAgo(l.at))}</small></div><span class="w-chip ${l.status === 'aprovada' ? 'ok' : l.status === 'em votação' ? 'gold' : 'warn'}">${esc(l.status)}${l.votes ? ` ${l.votes.sim}×${l.votes.nao}` : ''}</span></div>`).join('') || '<p class="muted">Nenhum projeto ainda.</p>'}</section>
  </div>`;
}
