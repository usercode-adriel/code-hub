// ORGANIZATIONS CENTER — organizações autônomas da cidade (fundadas e geridas por personagens de IA).
import { shell, face, nx, num, bindEntities, api, esc, timeAgo, icon, toast, modal } from '../world/wui.js';

const REL = { alianca: ['Aliança', '#22c55e'], parceria: ['Parceria', '#06b6d4'], cooperacao: ['Cooperação', '#14b8a6'], concorrencia: ['Concorrência', '#f59e0b'], rivalidade: ['Rivalidade', '#ef4444'] };

export default async function render(el) {
  const body = shell(el, 'organizacoes', { title: 'Organizations Center', sub: 'Grupos, empresas, clubes e movimentos fundados e geridos pelos cidadãos — sem a sua interferência.' });
  bindEntities(body);
  let cat = '';
  const load = async () => {
    const d = await api.get('/mundo/organizacoes');
    const chip = (o) => `<button class="org-chip" data-org="${esc(o.id)}" style="--c:${esc(o.color)}"><span class="org-ic">${icon(o.icon, 15)}</span><span class="org-ct"><b>${esc(o.name)}</b><small>${esc(o.kindLabel)} · ${o.members} membro(s)</small></span>${o.secret ? `<span class="org-secret">${icon('eye', 11)}</span>` : ''}</button>`;
    const list = (cat ? d.all.filter((o) => o.cat === cat) : d.all);
    body.innerHTML = `<div class="org">
      ${d.invites.length ? `<section class="w-panel org-invite"><h3>${icon('heart', 15)} Convites para você</h3>${d.invites.map((o) => `<div class="org-inv-row"><span class="org-ic" style="--c:${esc(o.color)}">${icon(o.icon, 16)}</span><div><b>${esc(o.name)}</b><small class="muted">${esc(o.kindLabel)} · reputação ${o.reputation}</small></div><div class="org-inv-acts"><button class="btn sm primary" data-accept="${esc(o.id)}">Aceitar</button><button class="btn sm ghost" data-org="${esc(o.id)}">Ver</button></div></div>`).join('')}</section>` : ''}
      ${d.mine.length ? `<section class="w-panel"><h3>${icon('star', 15)} Você faz parte</h3><div class="org-grid">${d.mine.map((o) => `<button class="org-card mine" data-org="${esc(o.id)}" style="--c:${esc(o.color)}"><div class="org-card-h"><span class="org-ic">${icon(o.icon, 18)}</span><div><b>${esc(o.name)}</b><small>${esc(o.userRole ? o.userRole : 'membro')}</small></div></div></button>`).join('')}</div></section>` : ''}
      <div class="org-cols">
        <section class="w-panel"><div class="w-ph"><h3>${icon('zap', 15)} Mais influentes</h3></div>${d.popular.map(chip).join('') || '<p class="muted">Nenhuma ainda.</p>'}</section>
        <section class="w-panel"><div class="w-ph"><h3>${icon('rocket', 15)} Recém-fundadas</h3></div>${d.recent.map(chip).join('') || '<p class="muted">—</p>'}</section>
        <section class="w-panel"><div class="w-ph"><h3>${icon('trending', 15)} Em crescimento</h3></div>${d.growing.map(chip).join('')}</section>
      </div>
      <div class="org-cols">
        ${d.rivalries.length ? `<section class="w-panel"><div class="w-ph"><h3>${icon('flame', 15)} Rivalidades</h3></div>${d.rivalries.map((r) => `<div class="org-vs"><button data-org="${esc(r.a.id)}" style="--c:${esc(r.a.color)}">${esc(r.a.name)}</button><span>×</span><button data-org="${esc(r.b.id)}" style="--c:${esc(r.b.color)}">${esc(r.b.name)}</button></div>`).join('')}</section>` : ''}
        ${d.alliances.length ? `<section class="w-panel"><div class="w-ph"><h3>${icon('users', 15)} Alianças</h3></div>${d.alliances.map((r) => `<div class="org-vs ally"><button data-org="${esc(r.a.id)}" style="--c:${esc(r.a.color)}">${esc(r.a.name)}</button><span>+</span><button data-org="${esc(r.b.id)}" style="--c:${esc(r.b.color)}">${esc(r.b.name)}</button></div>`).join('')}</section>` : ''}
        ${d.crisis.length ? `<section class="w-panel"><div class="w-ph"><h3>${icon('shield', 15)} Em crise</h3></div>${d.crisis.map(chip).join('')}</section>` : ''}
      </div>
      <section class="w-panel"><div class="w-ph"><h3>Diretório (${d.total})</h3><div class="org-filters">${[['', 'Todas'], ...Object.entries(d.cats)].map(([k, l]) => `<button class="w-chip ${cat === k ? 'on' : ''}" data-cat="${k}">${l}</button>`).join('')}</div></div>
        <div class="org-grid">${list.map((o) => `<button class="org-card" data-org="${esc(o.id)}" style="--c:${esc(o.color)}"><div class="org-card-h"><span class="org-ic">${icon(o.icon, 18)}</span><div><b>${esc(o.name)}</b><small>${esc(o.kindLabel)}</small></div></div>
          <div class="org-card-m"><span>${icon('users', 11)} ${o.members}</span><span>${icon('star', 11)} ${o.reputation}</span><span>${icon('zap', 11)} ${o.influence}</span></div>
          ${o.leader ? `<div class="org-lead"><span data-person="${esc(o.leader.id)}">${face(o.leader, 20)}</span><small>${esc(o.leader.name)}</small></div>` : ''}</button>`).join('') || '<p class="muted">Nenhuma organização nesta categoria.</p>'}</div></section>
      ${d.news.length ? `<section class="w-panel"><div class="w-ph"><h3>${icon('news', 15)} No noticiário</h3></div>${d.news.map((n) => `<div class="org-nw"><span>${icon('chevRight', 11)}</span><b>${esc(n.title)}</b><small class="muted">${esc(timeAgo(n.at))}</small></div>`).join('')}</section>` : ''}
    </div>`;
    body.querySelectorAll('[data-cat]').forEach((b) => { b.onclick = () => { cat = b.dataset.cat; load(); }; });
    body.querySelectorAll('[data-org]').forEach((b) => { b.onclick = () => openOrg(b.dataset.org); });
    body.querySelectorAll('[data-accept]').forEach((b) => { b.onclick = async () => { try { await api.post(`/mundo/organizacoes/${b.dataset.accept}/aceitar`); toast('Você entrou!', '', 'success'); load(); } catch (err) { toast('Não deu', err.message, 'error'); } }; });
  };
  async function openOrg(id) {
    let o;
    try { o = await api.get(`/mundo/organizacoes/${encodeURIComponent(id)}`); } catch (err) { toast('Indisponível', err.message, 'error'); return; }
    modal({ title: o.name, wide: true, body: `<div class="org-detail" style="--c:${esc(o.color)}">
      <div class="org-d-top"><span class="org-ic big">${icon(o.icon, 26)}</span><div><h3>${esc(o.name)} <small class="w-tick">${esc(o.sigla)}</small></h3><small class="muted">${esc(o.kindLabel)} · ${esc(o.catLabel)}${o.district ? ` · ${esc(o.district)}` : ''}${o.secret ? ' · reservada' : ''}</small>
        <p class="org-obj">${esc(o.objective)}</p></div></div>
      <div class="org-d-stats"><div><small>Membros</small><b>${o.members}</b></div><div><small>Reputação</small><b>${o.reputation}</b></div><div><small>Influência</small><b>${o.influence}</b></div>${o.cash != null ? `<div><small>Caixa</small><b>${nx(o.cash, 0)}</b></div>` : ''}${o.patrimony != null ? `<div><small>Patrimônio</small><b>${nx(o.patrimony, 0)}</b></div>` : ''}</div>
      <h5>Diretoria e membros</h5><div class="org-roster">${o.roster.map((m) => `<button class="org-member" ${m.id !== 'me' ? `data-person="${esc(m.id)}"` : ''}>${face(m, 30)}<span><b>${esc(m.name)}</b><small>${esc(m.roleLabel)}</small></span></button>`).join('')}</div>
      ${o.relations.length ? `<h5>Relações</h5><div class="org-rels">${o.relations.map((r) => `<span class="org-rel" style="--c:${esc((REL[r.type] || [])[1] || '#64748b')}">${esc(r.typeLabel)} · ${esc(r.name)}</span>`).join('')}</div>` : ''}
      <h5>Histórico de decisões</h5><ul class="org-log">${o.log.map((l) => `<li><small class="muted">${esc(timeAgo(l.at))}</small> ${esc(l.text)}</li>`).join('') || '<li class="muted">Sem registros.</li>'}</ul>
      <div class="org-d-acts">${o.userMember ? `<button class="btn outline" data-leave="${esc(o.id)}">Sair da organização</button>` : o.userInvite ? `<button class="btn primary" data-accept2="${esc(o.id)}">Aceitar convite</button>` : `<button class="btn primary" data-join="${esc(o.id)}">Pedir para entrar</button>`}</div>
    </div>`, onMount: (m, close) => {
      bindEntities(m);
      m.querySelector('[data-join]')?.addEventListener('click', async () => { try { await api.post(`/mundo/organizacoes/${id}/entrar`); toast('Bem-vindo(a)!', 'Você entrou na organização.', 'success'); close(); load(); } catch (err) { toast('Ainda não', err.message, 'error'); } });
      m.querySelector('[data-accept2]')?.addEventListener('click', async () => { try { await api.post(`/mundo/organizacoes/${id}/aceitar`); toast('Você entrou!', '', 'success'); close(); load(); } catch (err) { toast('Não deu', err.message, 'error'); } });
      m.querySelector('[data-leave]')?.addEventListener('click', async () => { try { await api.post(`/mundo/organizacoes/${id}/sair`); toast('Você saiu', '', 'info'); close(); load(); } catch (err) { toast('Não deu', err.message, 'error'); } });
    } });
  }
  try { await load(); } catch (err) { body.innerHTML = `<div class="w-empty"><b>${esc(err.message)}</b></div>`; }
}
