// 05 · WORLD GOVERNMENT — cargos, eleição, pesquisas, partidos, leis e a sua carreira política.
import { shell, face, nx, bindEntities, api, esc, timeAgo, icon, toast } from '../world/wui.js';

export default async function render(el) {
  const body = shell(el, 'governo', { title: 'World Government', sub: 'Prefeitura e Câmara de Codeniac Society. Eleições a cada 20 dias.' });
  bindEntities(body);
  const load = async () => {
    const g = await api.get('/mundo/governo');
    if (!g) { body.innerHTML = '<div class="w-empty"><b>O governo ainda está sendo formado.</b></div>'; return; }
    const party = (id) => g.parties.find((p) => p.id === id);
    const tag = (id) => (party(id) ? `<span class="g-party" style="--c:${esc(party(id).color)}">${esc(party(id).sigla)}</span>` : '');
    const el2 = g.election;
    const lastPoll = el2.polls?.at(-1);
    const me = g.me;
    const holder = (h) => `<button class="g-holder" ${h.me ? '' : `data-person="${esc(h.id)}"`}>${face(h, 46)}<b>${esc(h.name)}</b>${tag(h.partyId)}<small class="muted">desde ${new Date(h.since).toLocaleDateString('pt-BR')}${h.origin === 'genese' ? ' · gênese' : ''}</small></button>`;
    body.innerHTML = `<div class="g-grid">
      <section class="w-panel g-mayor"><h3>Prefeitura</h3>${g.offices[0].holders.map(holder).join('') || '<p class="muted">Cargo vago.</p>'}
        <h3>Câmara de Vereadores</h3><div class="g-council">${g.offices[1].holders.map(holder).join('')}</div></section>
      <section class="w-panel g-election"><div class="w-ph"><h3>${el2.n}ª eleição</h3><span class="w-chip gold">${esc(el2.phaseLabel)}</span></div>
        <p class="muted">${el2.phase === 'mandato' ? 'Inscrições começam' : 'Esta fase termina'} em ${new Date(el2.phaseEnds).toLocaleString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.${el2.debateAt ? ` Debate na TV: ${new Date(el2.debateAt).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}.` : ''}</p>
        ${el2.candidates.length ? `<h4>Candidatos</h4>${['prefeito', 'vereador'].map((o) => `<small class="muted">${o === 'prefeito' ? 'Prefeitura' : 'Câmara'}</small>${el2.candidates.filter((c) => c.office === o).map((c) => `<div class="w-row"><span ${c.who.me ? '' : `data-person="${esc(c.who.id)}"`}>${face(c.who, 24)} ${esc(c.who.name)} ${tag(c.partyId)}</span><small class="muted">${c.spent ? `${nx(c.spent, 0)} em campanha` : ''}${c.debate != null ? ` · debate ${Math.round(c.debate * 10)}/10` : ''}</small></div>`).join('')}`).join('')}` : ''}
        ${lastPoll ? `<h4>Última pesquisa (${esc(timeAgo(lastPoll.at))})</h4>${lastPoll.results.map((r) => `<div class="g-bar"><span>${esc(r.who.name)}</span><i style="width:${r.pct}%;--c:${esc(party(r.partyId)?.color || '#64748b')}"></i><b>${r.pct}%</b></div>`).join('')}` : ''}
        ${g.history.length ? `<h4>Eleições anteriores</h4>${g.history.map((h) => `<div class="w-row"><span>${h.n}ª · ${new Date(h.at).toLocaleDateString('pt-BR')}</span><small>${h.result.prefeito?.[0] ? `${esc(h.result.prefeito[0].who.name)} (${h.result.prefeito[0].pct}%)` : ''}</small></div>`).join('')}` : ''}</section>
      <section class="w-panel g-me"><h3>Sua vida política</h3>
        <p>Reputação <b>${me.reputation}</b> · fama <b>${me.fame}</b>${me.partyId ? ` · filiado(a) ao ${tag(me.partyId)}` : ' · sem partido'}${me.office ? ` · <b>${me.office === 'prefeito' ? 'Prefeito(a)' : 'Vereador(a)'}</b>` : ''}${me.candidate ? ` · candidato(a) a ${me.candidate}` : ''}</p>
        <h4>Partidos</h4>${g.parties.map((p) => `<div class="w-row"><span>${tag(p.id)} ${esc(p.name)} <small class="muted">${p.members} membros · ${p.ideology > 0.3 ? 'pró-mercado' : p.ideology < -0.3 ? 'social' : 'centro'}${p.leader ? ` · líder ${esc(p.leader.name)}` : ''}</small></span><button class="btn sm ${me.partyId === p.id ? 'outline' : 'primary'}" data-party="${esc(p.id)}">${me.partyId === p.id ? 'Sair' : 'Filiar-se'}</button></div>`).join('')}
        ${el2.phase === 'inscricoes' && !me.candidate ? `<h4>Candidatar-se</h4><p class="muted">Exige partido, reputação ≥ ${me.rules.reputation} e taxa de ${nx(me.rules.fee, 0)}.</p>
          <form class="g-run" id="run"><select name="office"><option value="vereador">Vereador(a)</option><option value="prefeito">Prefeito(a)</option></select><label>Sua ideologia <input type="range" name="ideology" min="-1" max="1" step="0.1" value="0"><small>social ↔ pró-mercado</small></label><button class="btn sm primary">Registrar candidatura</button></form>`
          : el2.phase === 'mandato' ? `<p class="muted">As inscrições abrem em ${new Date(el2.phaseEnds).toLocaleDateString('pt-BR')}. Filie-se e cuide da sua reputação até lá.</p>` : ''}
        ${me.candidate && ['inscricoes', 'campanha'].includes(el2.phase) ? `<h4>Campanha</h4><form class="e-inline" id="camp"><input type="number" name="v" min="50" step="50" value="500"><button class="btn sm primary">Investir na campanha</button></form><small class="muted">Os moradores votam por ideologia, fama, gastos e pelo que sentem por você.</small>` : ''}
        ${me.office ? `<h4>Propor uma lei</h4><select id="lawKey">${g.templates.map((t) => `<option value="${esc(t.key)}">${esc(t.title)} — ${esc(t.desc)}</option>`).join('')}</select><button class="btn sm primary" id="propose" style="margin-top:6px">Propor</button>` : ''}</section>
      <section class="w-panel g-laws"><h3>Leis</h3><p class="muted">Impostos ${Math.round((g.stats.taxRate || 0) * 100)}% · juros base ${((g.stats.baseRate || 0) * 100).toFixed(2)}%/dia · crime ×${(g.stats.crimeMult || 1).toFixed(2)} · desconto universitário ${Math.round((g.stats.eduDiscount || 0) * 100)}%</p>
        ${g.laws.map((l) => `<div class="g-law ${esc(l.status.replace(/\s/g, '-'))}"><div class="grow"><b>${esc(l.title)}</b><small class="muted">${esc(l.desc)} · por ${esc(l.author?.name || '')} · ${esc(timeAgo(l.at))}</small></div><span class="w-chip ${l.status === 'aprovada' ? 'ok' : l.status === 'em votação' ? 'gold' : 'warn'}">${esc(l.status)}${l.votes ? ` ${l.votes.sim}×${l.votes.nao}` : ''}</span>
          ${l.status === 'em votação' && me.office === 'vereador' && l.author?.id !== 'me' ? `<span><button class="btn sm outline" data-vote="${esc(l.id)}" data-v="sim">Sim</button><button class="btn sm ghost" data-vote="${esc(l.id)}" data-v="nao">Não</button></span>` : ''}</div>`).join('') || '<p class="muted">Nenhum projeto ainda.</p>'}</section>
    </div>`;
    const act = async (fn, msg) => { try { await fn(); if (msg) toast(msg, '', 'success'); load(); } catch (err) { toast('Não deu', err.message, 'error'); } };
    body.querySelectorAll('[data-party]').forEach((b) => { b.onclick = () => act(() => api.post(`/mundo/governo/partido/${b.dataset.party}`), 'Feito'); });
    body.querySelector('#run')?.addEventListener('submit', (e) => { e.preventDefault(); act(() => api.post('/mundo/governo/candidatura', { office: e.target.office.value, ideology: Number(e.target.ideology.value) }), 'Candidatura registrada 🗳️'); });
    body.querySelector('#camp')?.addEventListener('submit', (e) => { e.preventDefault(); act(() => api.post('/mundo/governo/campanha', { valor: Number(e.target.v.value) }), 'Campanha reforçada'); });
    body.querySelector('#propose')?.addEventListener('click', () => act(() => api.post('/mundo/governo/lei', { key: body.querySelector('#lawKey').value }), 'Projeto enviado à Câmara'));
    body.querySelectorAll('[data-vote]').forEach((b) => { b.onclick = () => act(() => api.post(`/mundo/governo/lei/${b.dataset.vote}/voto`, { voto: b.dataset.v }), 'Voto registrado'); });
  };
  await load();
}
