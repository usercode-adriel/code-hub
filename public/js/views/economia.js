// 06 · ECONOMY — banco, bolsa, empresas, minha empresa, carreira e imóveis (moeda Nexus, NXC).
import { shell, withPin, face, nx, pct, spark, bindEntities, companyCard, evRow, api, esc, timeAgo, icon, toast, modal } from '../world/wui.js';

const TABS = [['bolsa', 'Bolsa', 'trending'], ['empresas', 'Empresas', 'briefcase'], ['empresa', 'Minha empresa', 'rocket'], ['carreira', 'Carreira', 'school'], ['imoveis', 'Imóveis', 'pin']];

export default async function render(el, parts = []) {
  const tab = TABS.some(([k]) => k === parts[0]) ? parts[0] : 'bolsa';
  const body = shell(el, 'empresas', { title: 'Empresas e trabalho', sub: 'Bolsa Nexus, empresas, carreira, freelas e imóveis. O banco fica no app Banco.' });
  body.innerHTML = `<div class="w-tabs">${TABS.map(([k, l, ic]) => `<a href="#/empresas/${k}" class="${k === tab ? 'on' : ''}">${icon(ic, 14)} ${l}</a>`).join('')}</div><div id="eBody"><div class="skeleton" style="height:200px"></div></div>`;
  const box = body.querySelector('#eBody');
  bindEntities(body);
  const views = { bolsa, empresas, empresa, carreira, imoveis };
  const reload = () => views[tab](box, reload);
  await reload();
}

async function bolsa(box) {
  const d = await api.get('/mundo/economia');
  const up = d.indexHistory.length > 1 && d.indexHistory.at(-1) >= d.indexHistory[0];
  box.innerHTML = `<div class="w-panel e-index"><div><small>Bolsa Nexus</small><b>${Math.round(d.index).toLocaleString('pt-BR')} pts</b><span class="muted">últimas 72 h</span></div>${spark(d.indexHistory, { w: 600, h: 90, color: up ? '#22c55e' : '#ef4444' })}</div>
    ${d.portfolio.length ? `<h3 class="w-h3">Sua carteira</h3><div class="e-table">${d.portfolio.map((p) => `<button class="e-tr" data-company="${esc(p.company.id)}"><span class="cc-tk" style="--c:${esc(p.company.color)}">${esc(p.company.ticker)}</span><span class="grow">${esc(p.company.name)}<small>${p.shares} ações · médio ${nx(p.avg)}</small></span><b>${nx(p.value)}</b><em class="${p.pl >= 0 ? 'up' : 'down'}">${p.pl >= 0 ? '+' : ''}${nx(p.pl)}</em></button>`).join('')}</div>` : ''}
    <h3 class="w-h3">Ações</h3><div class="e-table">${d.market.map((c) => `<button class="e-tr ${c.status === 'falida' ? 'dead' : ''}" data-company="${esc(c.id)}"><span class="cc-tk" style="--c:${esc(c.color)}">${esc(c.ticker)}</span><span class="grow">${esc(c.name)}<small>${esc(c.sectorLabel)} · ${c.employees} func. · ${esc(c.status)}</small></span><b>${c.status === 'falida' ? '—' : nx(c.price)}</b><em class="${c.change >= 0 ? 'up' : 'down'}">${c.status === 'falida' ? 'falida' : pct(c.change)}</em></button>`).join('')}</div>
    <p class="muted e-note">Toque numa empresa para ver gráfico, números e comprar ou vender. O preço acompanha o lucro e o caixa da empresa e reage às notícias. Empresas lucrativas pagam dividendos a quem tem ações.</p>`;
}

async function empresas(box, reload) {
  const d = await api.get('/mundo/economia');
  const soc = d.society;
  const big = (v) => (v >= 1e9 ? `${(v / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} bi` : v >= 1e6 ? `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : Math.round(v).toLocaleString('pt-BR'));
  box.innerHTML = `${soc ? `<section class="w-panel e-society"><div><small>Valor bruto da sociedade</small><b>${big(soc.grossValue)} NXC</b></div><div><small>Em circulação</small><b>${big(soc.circulating)} NXC</b></div><div><small>${icon('flag', 12)} Cofres públicos</small><b>${big(soc.treasury)} NXC</b></div></section>` : ''}
    <div class="w-ph"><h3 class="w-h3">Empresas de Nexus City</h3><button class="btn sm primary" id="found">${icon('rocket', 12)} Abrir minha empresa</button></div>
    <div class="e-cos">${d.market.map((c) => `<button class="w-panel e-co ${c.status}" data-company="${esc(c.id)}" style="--c:${esc(c.color)}"><span class="w-co-logo">${esc(c.name[0])}</span><b>${esc(c.name)}</b><small>${esc(c.sectorLabel)}</small>
      <span class="w-chips"><span class="w-chip ${c.status === 'ativa' ? 'ok' : 'warn'}">${esc(c.status)}</span><span class="w-chip">${c.employees} func.</span>${c.openings ? `<span class="w-chip gold">${c.openings} vaga(s)</span>` : ''}${c.mine ? '<span class="w-chip gold">sua</span>' : ''}</span>
      <small class="muted">${c.ceo ? `CEO: ${esc(c.ceo.name)}` : ''}${c.origin === 'genese' ? ' · da gênese' : ''}</small></button>`).join('')}</div>`;
  box.querySelector('#found').onclick = () => modal({
    title: 'Abrir empresa',
    body: `<form class="form"><p class="muted" style="margin:0">Custa ${nx(d.foundCost, 0)} (vira o caixa inicial). A empresa entra no mesmo mercado das outras: precisa de equipe, marketing e clientes.</p>
      <div class="field"><label>Nome</label><input name="n" maxlength="40" required></div><div class="field"><label>Setor</label><select name="s">${Object.entries(d.sectors).filter(([k]) => !['midia', 'financas'].includes(k)).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></div>
      <div class="form-actions"><button type="button" class="btn outline" data-close>Cancelar</button><button class="btn primary">Abrir</button></div></form>`,
    onMount: (m, close) => { m.querySelector('form').onsubmit = async (e) => { e.preventDefault(); try { await api.post('/mundo/empresas', { nome: e.target.n.value, setor: e.target.s.value }); close(); toast('Empresa aberta! 🚀', 'Abra vagas e contrate gente.', 'success'); location.hash = '#/empresas/empresa'; } catch (err) { toast('Não deu', err.message, 'error'); } }; },
  });
}

async function empresa(box, reload) {
  const d = await api.get('/mundo/economia');
  const mine = d.market.find((c) => c.mine && c.status !== 'falida');
  if (!mine) { box.innerHTML = `<div class="w-empty">${icon('rocket', 30)}<b>Você ainda não tem empresa</b><p>Abra uma em <a href="#/empresas/empresas">Empresas</a> (custa ${nx(d.foundCost, 0)}).</p></div>`; return; }
  const c = await api.get(`/mundo/empresas/${mine.id}`);
  box.innerHTML = `<div class="w-panel e-mine" style="--c:${esc(c.color)}"><div class="w-ph"><div><h2>${esc(c.name)} <small class="w-tick">${esc(c.ticker)}</small></h2><small class="muted">${esc(c.sectorLabel)} · ${esc(c.status)}</small></div><button class="btn sm outline" data-company="${esc(c.id)}">Ficha completa</button></div>
      <div class="e-top"><div class="e-card"><small>Caixa</small><b>${nx(c.cash, 0)}</b></div><div class="e-card"><small>Receita (último dia)</small><b>${nx(c.revenueDay, 0)}</b></div><div class="e-card"><small>Lucro (último dia)</small><b class="${c.profitDay >= 0 ? 'up' : 'down'}">${nx(c.profitDay, 0)}</b></div><div class="e-card"><small>Ação</small><b>${nx(c.price)}</b></div></div>
      ${spark(c.profitHistory, { w: 600, h: 60, color: '#38bdf8' })}
      <form class="e-manage" id="mg"><label>Marketing por dia <input type="number" name="marketing" min="0" max="5000" value="${c.marketing}"></label><label>Aporte (do seu saldo) <input type="number" name="aporte" min="0" placeholder="0"></label><label>Retirar lucro <input type="number" name="retirada" min="0" placeholder="0"></label><button class="btn sm primary">Aplicar</button></form>
      <h3 class="w-h3">Equipe</h3>${c.staff.map((s) => `<div class="w-row"><span>${face(s, 26)} ${esc(s.name)} · ${esc(s.role)} ${s.salary ? `· ${nx(s.salary, 0)}/dia` : ''}</span>${s.id !== 'me' ? `<button class="btn sm ghost" data-fire="${esc(s.id)}">Demitir</button>` : ''}</div>`).join('')}
      <h3 class="w-h3">Vagas abertas</h3>${c.openingList.map((o) => `<div class="w-row"><span>${esc(o.role)} · ${nx(o.salary, 0)}/dia</span></div>`).join('') || '<p class="muted">Nenhuma.</p>'}
      <form class="e-inline" id="op"><input name="role" placeholder="Cargo (ex.: desenvolvedor(a))" maxlength="40"><input type="number" name="salary" placeholder="Salário/dia" min="80" max="2000" value="300"><button class="btn sm outline">Abrir vaga</button></form>
      <h3 class="w-h3">Candidatos</h3>${c.applicants.map((p) => `<div class="w-row"><span data-person="${esc(p.id)}">${face(p, 26)} ${esc(p.name)} · habilidade ${p.skill}${p.diplomas.length ? ` · ${esc(p.diplomas.join(', '))}` : ''}</span><button class="btn sm primary" data-hire="${esc(p.id)}">Contratar</button></div>`).join('') || '<p class="muted">Quando você abre vagas, moradores desempregados se candidatam.</p>'}
      <h3 class="w-h3">História</h3>${c.events.slice(0, 8).map((e) => evRow(e, { compact: true })).join('')}</div>`;
  const act = async (b) => { try { await api.post(`/mundo/empresas/${c.id}/gestao`, b); toast('Feito', '', 'success'); reload(); } catch (err) { toast('Não deu', err.message, 'error'); } };
  box.querySelector('#mg').onsubmit = (e) => { e.preventDefault(); act({ marketing: Number(e.target.marketing.value), aporte: Number(e.target.aporte.value) || 0, retirada: Number(e.target.retirada.value) || 0 }); };
  box.querySelector('#op').onsubmit = (e) => { e.preventDefault(); act({ vaga: { role: e.target.role.value, salary: Number(e.target.salary.value) } }); };
  box.querySelectorAll('[data-hire]').forEach((b) => { b.onclick = () => act({ contratar: b.dataset.hire }); });
  box.querySelectorAll('[data-fire]').forEach((b) => { b.onclick = () => act({ demitir: b.dataset.fire }); });
}

export async function carreira(box, reload) {
  const d = await api.get('/mundo/carreira');
  const j = d.job;
  box.innerHTML = `${j ? `<div class="w-panel e-job"><div class="w-ph"><div><small class="muted">Seu emprego</small><h2>${esc(j.role)} na <a class="w-link" data-company="${esc(j.company?.id)}">${esc(j.company?.name)}</a></h2><small class="muted">${nx(j.salary, 0)} por dia trabalhado · desde ${new Date(j.since).toLocaleDateString('pt-BR')} · ${j.days || 0} dia(s) de trabalho</small></div><button class="btn sm ghost" id="quit">Pedir demissão</button></div>
      <div class="w-kv"><span>Desempenho</span><i class="w-bar"><i style="width:${j.performance}%;background:${j.performance >= 60 ? '#22c55e' : j.performance >= 30 ? '#f59e0b' : '#ef4444'}"></i></i><b>${j.performance}</b></div>${j.warnings ? `<p class="down">${j.warnings} advertência(s). Com 3, você é demitido(a).</p>` : ''}
      ${j.workedToday ? '<p class="e-done">✅ Expediente de hoje feito. Volte amanhã (faltar derruba o desempenho).</p>' : d.task ? `<div class="e-task"><b>Expediente de hoje</b><p>${esc(d.task.text)}</p><div class="e-opts">${d.task.options.map((o, i) => `<button class="btn sm outline" data-work="${i}">${esc(o)}</button>`).join('')}</div></div>` : ''}
      ${j.colleagues.length ? `<h4>Colegas</h4><div class="w-rels">${j.colleagues.map((p) => `<button class="w-rel" data-person="${esc(p.id)}">${face(p, 26)}<span>${esc(p.name)}</span><small>${esc(p.role)}${p.relation ? ` · ${esc(p.relation)}` : ''}</small></button>`).join('')}</div>` : ''}</div>`
    : `<div class="w-panel e-job"><h2>Você está sem emprego</h2><p class="muted">Candidate-se às vagas abaixo. A empresa avalia sua reputação (${d.reputation}), seus diplomas e o que o CEO acha de você.</p></div>`}
    ${d.applications.length ? `<h3 class="w-h3">Suas candidaturas</h3>${d.applications.slice(0, 6).map((a) => `<div class="w-row"><span>${esc(a.role)} · ${esc(a.company || '')} <small class="muted">${esc(timeAgo(a.at))}</small></span><span class="w-chip ${a.status === 'aprovado' ? 'ok' : a.status === 'recusado' ? 'warn' : ''}">${esc(a.status)}</span></div>`).join('')}` : ''}
    <h3 class="w-h3">Vagas abertas (${d.openings.length})</h3>${d.openings.map((o) => `<div class="w-row"><span><b>${esc(o.role)}</b> · <a class="w-link" data-company="${esc(o.companyId)}">${esc(o.company)}</a> <small class="muted">${esc(o.sector)} · ${nx(o.salary, 0)}/dia</small></span><button class="btn sm outline" data-apply="${esc(o.companyId)}|${esc(o.id)}" ${j ? 'disabled title="Você já trabalha"' : ''}>Candidatar</button></div>`).join('') || '<p class="muted">Nenhuma vaga agora. Empresas abrem vagas quando a demanda passa da capacidade da equipe.</p>'}
    ${professionsPanel(d)}
    <h3 class="w-h3">${icon('school', 16)} Universidade de Nexus City</h3>
    ${d.studying ? apostila(d.studying) : '<p class="muted">Todos os cursos duram 3 dias. A cada dia há uma mini apostila para ler e, às vezes, uma palestra. O diploma habilita a sua profissão.</p>'}
    <div class="e-courses">${d.courses.map((c) => `<div class="w-panel e-course"><b>${esc(c.name)}</b><small>${c.days} dias · ${nx(c.cost, 0)}</small>${c.path ? `<small class="e-path">${icon('chevRight', 10)} ${esc(c.path)}</small>` : ''}${c.done ? '<span class="w-chip ok">diplomado</span>' : `<button class="btn sm outline" data-course="${esc(c.id)}" ${d.studying ? 'disabled' : ''}>Matricular</button>`}</div>`).join('')}</div>
    ${d.discoveries.length ? `<h3 class="w-h3">Descobertas científicas recentes</h3>${d.discoveries.map((x) => `<div class="w-row"><span><b>${esc(x.title)}</b> <small class="muted">${esc(x.lab)} · ${esc(x.effect)}</small></span></div>`).join('')}` : ''}
    <h3 class="w-h3">Laboratórios</h3>${d.labs.map((l) => `<div class="w-kv"><span>${esc(l.name)}: ${esc(l.project)}</span><i class="w-bar"><i style="width:${Math.min(100, l.progress)}%;background:#6366f1"></i></i><b>${Math.round(l.progress)}%</b></div>`).join('')}`;
  freelas(box);
  box.querySelectorAll('[data-work]').forEach((b) => { b.onclick = async () => { try { const r = await api.post('/mundo/trabalho', { escolha: Number(b.dataset.work) }); toast(r.good ? 'Boa decisão! 👏' : 'Decisão arriscada…', `Desempenho: ${r.performance}. Salário de ${nx(r.salary, 0)} creditado.${r.promoted ? ` PROMOÇÃO: ${r.role}!` : ''}`, r.good ? 'success' : 'info'); reload(); } catch (err) { toast('Não deu', err.message, 'error'); } }; });
  box.querySelectorAll('[data-apply]').forEach((b) => { b.onclick = async () => { const [cid, oid] = b.dataset.apply.split('|'); try { await api.post(`/mundo/vagas/${cid}/${oid}`); toast('Candidatura enviada', 'Resposta em alguns minutos.', 'success'); reload(); } catch (err) { toast('Não deu', err.message, 'error'); } }; });
  box.querySelectorAll('[data-course]').forEach((b) => { b.onclick = async () => { try { await api.post(`/mundo/educacao/${b.dataset.course}`); toast('Matrícula feita 🎓', '', 'success'); reload(); } catch (err) { toast('Não deu', err.message, 'error'); } }; });
  box.querySelector('#quit')?.addEventListener('click', async () => { const { confirmDialog } = await import('../ui.js'); if (!(await confirmDialog('Pedir demissão', 'Seus colegas vão lembrar disso.', 'Pedir demissão'))) return; await api.post('/mundo/trabalho/sair'); reload(); });
  box.querySelectorAll('[data-lesson]').forEach((b) => { b.onclick = async () => { try { await api.post(`/mundo/educacao/aula/${b.dataset.lesson}`); reload(); } catch (err) { toast('Não deu', err.message, 'error'); } }; });
  box.querySelectorAll('[data-prof]').forEach((b) => { b.onclick = async () => { try { await api.post(`/mundo/profissao/${b.dataset.prof}`); toast('Profissão assumida ✅', 'Novos acessos liberados.', 'success'); reload(); } catch (err) { toast('Ainda não', err.message, 'error'); } }; });
}
// painel de profissões: o que cada diploma habilita e o que você já pode assumir
function professionsPanel(d) {
  const label = { policia: 'Polícia', ciber: 'Perícia cibernética', ministro: 'Ministério', investidor: 'Investidor', empresario: 'Empresa própria', banqueiro: 'Banco próprio' };
  return `<h3 class="w-h3">${icon('shield', 16)} Profissões e autoridades</h3>
    <p class="muted">Como cidadão comum, seu acesso é só o hub. Cada diploma abre uma carreira. ${d.authorities?.length ? `Você é: <b>${d.authorities.map((a) => label[a] || a).join(', ')}</b>.` : 'Você ainda não exerce nenhuma profissão.'}</p>
    <div class="e-profs">${(d.professions || []).map((p) => `<div class="w-panel e-prof ${p.active ? 'on' : p.eligible ? 'elig' : ''}"><div class="e-prof-h">${icon(p.active ? 'check' : p.eligible ? 'star' : 'lock', 15)}<b>${esc(p.label)}</b></div>
      <small class="muted">${esc(p.via)} · requer ${esc(p.needs.join(' + '))}</small>
      ${p.active ? '<span class="w-chip ok">Ativa</span>' : p.eligible ? `<button class="btn sm primary" data-prof="${esc(p.key)}">Assumir</button>` : `<small class="e-miss">Falta: ${esc(p.missing.join(', '))}</small>`}</div>`).join('')}</div>`;
}
// leitor de apostila do curso em andamento
function apostila(st) {
  const done = (st.lessons || []).filter((l) => l.read).length;
  return `<div class="w-panel e-study"><div class="w-ph"><div><small class="muted">Cursando</small><h2>${esc(st.name)}</h2></div><span class="w-chip">${done}/${(st.lessons || []).length} aulas lidas</span></div>
    <p class="muted">Conclui em ${new Date(st.until).toLocaleString('pt-BR')}.</p>
    <div class="e-lessons">${(st.lessons || []).map((l) => `<div class="e-lesson ${l.read ? 'read' : ''}"><div class="e-lesson-h"><b>Aula ${l.day}: ${esc(l.title)}</b>${l.read ? `<span class="w-chip ok sm">lida</span>` : ''}</div>
      ${l.lecture ? `<div class="e-lecture"><span data-person="${esc(l.lecture.id)}">${face(l.lecture, 24)}</span><small>Palestra de <b>${esc(l.lecture.name)}</b> · ${esc(l.lecture.role)}</small></div>` : ''}
      <p>${esc(l.text)}</p>${l.read ? '' : `<button class="btn sm outline" data-lesson="${l.day}">${icon('check', 12)} Marcar como lida</button>`}</div>`).join('')}</div></div>`;
}

export async function imoveis(box, reload) {
  const [list, eco] = await Promise.all([api.get('/mundo/imoveis'), api.get('/mundo/economia')]);
  let filter = 'todos';
  const paint = () => {
    const shown = list.filter((p) => filter === 'todos' || (filter === 'meus' ? p.ownerType === 'user' : filter === 'venda' ? p.ownerType === 'cidade' : p.kind === filter));
    box.innerHTML = `<p class="muted">Seu saldo: <b>${nx(eco.bank.balance)}</b>. Apartamentos e salas comerciais rendem aluguel todo dia. Preços seguem o bairro e a inflação.</p>
      <div class="w-filters">${[['todos', 'Todos'], ['venda', 'À venda'], ['meus', 'Meus'], ['apartamento', 'Apartamentos'], ['casa', 'Casas'], ['escritorio', 'Escritórios'], ['terreno', 'Terrenos']].map(([k, l]) => `<button class="w-chip ${filter === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
      <div class="e-props">${shown.map((p) => `<div class="w-panel e-prop"><small class="muted">${esc(p.district)} · ${esc(p.kind)}</small><b>${esc(p.name)}</b><span>${nx(p.price, 0)}</span>${p.rentDay ? `<small class="muted">aluguel ${nx(p.rentDay)}/dia</small>` : ''}
        ${p.ownerType === 'cidade' ? `<button class="btn sm primary" data-buy="${esc(p.id)}">Comprar</button>` : p.ownerType === 'user' ? `<button class="btn sm outline" data-sell="${esc(p.id)}">Vender (95%)</button>` : `<small>Dono(a): <a class="w-link" data-person="${esc(p.owner?.id)}">${esc(p.owner?.name || '')}</a></small>`}</div>`).join('')}</div>`;
    box.querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => { filter = b.dataset.f; paint(); }; });
    box.querySelectorAll('[data-buy],[data-sell]').forEach((b) => { b.onclick = async () => { try { const send = (pin) => api.post(`/mundo/imoveis/${b.dataset.buy || b.dataset.sell}/${b.dataset.buy ? 'comprar' : 'vender'}`, { pin }); if (b.dataset.buy) { if (!(await withPin(send, 'Confirme a compra do imóvel'))) return; } else await send(); toast(b.dataset.buy ? 'Imóvel comprado 🏠' : 'Imóvel vendido', '', 'success'); reload(); } catch (err) { toast('Não deu', err.message, 'error'); } }; });
  };
  paint();
}

// trabalhos avulsos: as empresas pagam do próprio caixa; a escolha certa rende mais
async function freelas(box) {
  const list = await api.get('/mundo/freelas').catch(() => []);
  box.insertAdjacentHTML('afterbegin', `<section class="w-panel e-gigs"><div class="w-ph"><h3>${icon('zap', 14)} Freelas disponíveis</h3><small class="muted">renda extra · conta para o score</small></div>${list.map((g) => `<div class="e-gig"><div><b>${esc(g.title)}</b> <small class="muted">${esc(g.company || '')} · paga até ${nx(g.pay, 0)}</small><p>${esc(g.text)}</p></div>
    <div class="e-gig-opts">${g.options.map((o, i) => `<button class="btn sm outline" data-gig="${esc(g.id)}" data-o="${i}">${esc(o)}</button>`).join('')}</div></div>`).join('') || '<p class="muted">Nenhum freela agora. Novos aparecem todo dia.</p>'}</section>`);
  box.querySelectorAll('[data-gig]').forEach((b) => { b.onclick = async () => { try { const r = await api.post(`/mundo/freelas/${b.dataset.gig}`, { escolha: Number(b.dataset.o) }); toast(r.good ? 'Ótimo trabalho!' : 'Trabalho entregue', `${r.company} pagou ${nx(r.pay, 0)}.`, 'success'); b.closest('.e-gig').remove(); } catch (err) { toast('Não deu', err.message, 'error'); } }; });
}
