// 02 · SOCIAL WORLD — relacionamentos, eventos e convites, pedidos de ajuda, comunidades e investigações.
import { shell, face, bindEntities, evRow, api, esc, timeAgo, icon, toast, modal, num } from '../world/wui.js';

const TABS = [['relacoes', 'Relacionamentos', 'heart'], ['eventos', 'Eventos', 'calendar'], ['pedidos', 'Pedidos', 'inbox'], ['comunidades', 'Comunidades', 'layers'], ['investigacoes', 'Investigações', 'search']];
const REL_ORDER = ['namoro', 'casado', 'familia', 'melhor-amigo', 'amigo', 'colega', 'conhecido', 'rival', 'inimigo', 'desconhecido'];

export default async function render(el, parts = []) {
  const tab = TABS.some(([k]) => k === parts[0]) ? parts[0] : 'relacoes';
  const body = shell(el, 'social', { title: 'Social World', sub: 'Quem são as pessoas na sua vida e o que elas acham de você.' });
  el.querySelector('#wActs').innerHTML = `<a class="btn sm primary" href="#/rede">${icon('users', 13)} Abrir a Rede</a>`;
  body.innerHTML = `<div class="w-tabs">${TABS.map(([k, l, ic]) => `<a href="#/social/${k}" class="${k === tab ? 'on' : ''}">${icon(ic, 14)} ${l}</a>`).join('')}</div><div id="sBody"><div class="skeleton" style="height:200px"></div></div>`;
  const box = body.querySelector('#sBody');
  bindEntities(body);
  if (tab === 'relacoes') await relacoes(box);
  if (tab === 'eventos') await eventos(box);
  if (tab === 'pedidos') await pedidos(box);
  if (tab === 'comunidades') await (parts[1] ? comunidade(box, parts[1]) : comunidades(box));
  if (tab === 'investigacoes') await investigacoes(box);
}

async function relacoes(box) {
  const list = await api.get('/mundo/relacoes');
  let filter = 'todos';
  const paint = () => {
    const shown = list.filter((p) => filter === 'todos' || p.relation.type === filter || (filter === 'amigos' && ['amigo', 'melhor-amigo'].includes(p.relation.type)));
    box.innerHTML = `<div class="w-filters">${[['todos', 'Todos'], ['amigos', 'Amigos'], ['namoro', 'Namoro'], ['colega', 'Colegas'], ['conhecido', 'Conhecidos'], ['rival', 'Rivais'], ['inimigo', 'Inimigos']].map(([k, l]) => `<button class="w-chip ${filter === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
      ${shown.length ? `<div class="w-people">${shown.sort((a, b) => REL_ORDER.indexOf(a.relation.type) - REL_ORDER.indexOf(b.relation.type) || b.relation.aff - a.relation.aff).map((p) => `<button class="w-person" data-person="${esc(p.id)}">${face(p, 52)}<b>${esc(p.name)}</b><small>${esc(p.job || '')}</small>
        <span class="w-chip rel-${esc(p.relation.type)}">${esc(p.relation.label)}</span>
        <div class="w-mini-bars"><span title="Afeto">♥ <i class="w-bar"><i style="width:${(p.relation.aff + 100) / 2}%;background:${p.relation.aff >= 0 ? '#22c55e' : '#ef4444'}"></i></i></span><span title="Confiança">◆ <i class="w-bar"><i style="width:${p.relation.trust}%;background:#38bdf8"></i></i></span></div>
        <small class="muted">${p.relation.lastContact ? `contato ${esc(timeAgo(p.relation.lastContact))}` : 'sem contato direto'}${p.friend ? ' · no chat' : ''}</small></button>`).join('')}</div>`
        : `<div class="w-empty">${icon('heart', 30)}<b>Ninguém aqui ainda</b><p>Curta, comente e adicione pessoas na <a href="#/rede">Rede</a>. Cada interação muda o que elas sentem por você.</p></div>`}`;
    box.querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => { filter = b.dataset.f; paint(); }; });
  };
  paint();
}

async function eventos(box) {
  const list = await api.get('/mundo/convites');
  const mine = list.filter((i) => i.user);
  const others = list.filter((i) => !i.user && i.status !== 'encerrado');
  const card = (i) => `<div class="w-inv ${esc(i.status)}"><span data-person="${esc(i.host.id)}">${face(i.host, 44)}</span><div class="grow"><small class="muted">${esc(i.kindLabel)} · ${esc(i.status)}</small><b>${esc(i.title)}</b>
      <span>${icon('pin', 12)} ${esc(i.place)} · ${icon('clock', 12)} ${new Date(i.at).toLocaleString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
      ${i.msg ? `<p>"${esc(i.msg)}"</p>` : ''}${i.outcome ? `<small>${i.outcome.guests} pessoa(s) foram${i.outcome.userWent ? ', inclusive você' : ''}.</small>` : ''}</div>
    ${i.user === 'pendente' && i.status !== 'encerrado' ? `<div class="w-inv-acts"><button class="btn sm primary" data-ans="aceito" data-id="${esc(i.id)}">Aceitar</button><button class="btn sm outline" data-ans="recusado" data-id="${esc(i.id)}">Recusar</button></div>` : i.user ? `<span class="w-chip ${i.user === 'aceito' ? 'ok' : ''}">${i.user === 'aceito' ? 'Você vai' : i.user === 'recusado' ? 'Recusado' : 'Sem resposta'}</span>` : ''}</div>`;
  box.innerHTML = `<h3 class="w-h3">Convites para você</h3>${mine.map(card).join('') || '<p class="muted">Nenhum convite ainda. Quem gosta de você convida para festas, aniversários e casamentos.</p>'}
    <h3 class="w-h3">Agenda da cidade</h3>${others.map(card).join('') || '<p class="muted">Nada marcado por enquanto.</p>'}`;
  box.querySelectorAll('[data-ans]').forEach((b) => { b.onclick = async () => { try { await api.post(`/mundo/convites/${b.dataset.id}`, { resposta: b.dataset.ans }); toast(b.dataset.ans === 'aceito' ? 'Presença confirmada 🎉' : 'Convite recusado', '', 'success'); eventos(box); } catch (err) { toast('Erro', err.message, 'error'); } }; });
}

async function pedidos(box) {
  const list = await api.get('/mundo/pedidos');
  const label = { emprestimo: 'Empréstimo', conselho: 'Conselho', presenca: 'Presença' };
  const st = { aberto: 'Aguardando você', prometido: 'Você prometeu', cumprido: 'Cumprido', recusado: 'Recusado', quebrado: 'Promessa quebrada' };
  box.innerHTML = list.length ? list.map((r) => `<div class="w-req ${esc(r.status)}"><span data-person="${esc(r.persona.id)}">${face(r.persona, 44)}</span><div class="grow"><small class="muted">${esc(label[r.kind])}${r.amount ? ` · ${r.amount} NXC` : ''} · ${esc(timeAgo(r.at))}</small><b>${esc(r.persona.name)}</b><p>"${esc(r.text)}"</p>
      <span class="w-chip ${r.status === 'cumprido' ? 'ok' : r.status === 'quebrado' ? 'warn' : ''}">${esc(st[r.status])}${r.dueAt && r.status === 'prometido' ? ` até ${new Date(r.dueAt).toLocaleString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</span></div>
      ${['aberto', 'prometido'].includes(r.status) ? `<div class="w-inv-acts">${r.kind === 'conselho' ? `<button class="btn sm primary" data-chat="${esc(r.persona.id)}">Responder no chat</button>` : r.kind === 'presenca' ? '<a class="btn sm primary" href="#/social/eventos">Ver convite</a>' : `<button class="btn sm primary" data-act="cumprir" data-id="${esc(r.id)}">Ajudar agora</button>`}${r.status === 'aberto' ? `<button class="btn sm outline" data-act="prometer" data-id="${esc(r.id)}">Prometer p/ depois</button><button class="btn sm ghost" data-act="recusar" data-id="${esc(r.id)}">Recusar</button>` : ''}</div>` : ''}</div>`).join('')
    : `<div class="w-empty">${icon('inbox', 30)}<b>Nenhum pedido</b><p>Amigos próximos pedem ajuda quando passam por problemas. Promessas cumpridas aumentam a confiança; quebradas, acabam com ela.</p></div>`;
  box.querySelectorAll('[data-act]').forEach((b) => { b.onclick = async () => { try { await api.post(`/mundo/pedidos/${b.dataset.id}`, { acao: b.dataset.act }); toast({ cumprir: 'Você ajudou ❤️', prometer: 'Promessa feita', recusar: 'Pedido recusado' }[b.dataset.act], '', 'success'); pedidos(box); } catch (err) { toast('Não deu', err.message, 'error'); } }; });
  box.querySelectorAll('[data-chat]').forEach((b) => { b.onclick = async () => { const r = await api.post(`/rede/pessoas/${b.dataset.chat}/amizade`); if (r.conversationId) localStorage.setItem('codeniac.conv', r.conversationId); location.hash = '#/assistente'; }; });
}

async function comunidades(box) {
  const list = await api.get('/mundo/comunidades');
  box.innerHTML = `<div class="w-ph"><h3 class="w-h3">Comunidades</h3><button class="btn sm primary" id="cNew">${icon('plus', 12)} Criar comunidade</button></div>
    <div class="w-comms">${list.map((c) => `<a class="w-comm" href="#/social/comunidades/${esc(c.id)}"><span class="w-comm-ic">${esc(c.name[0])}</span><div><b>${esc(c.name)}</b><small>${num(c.members)} membros · ${c.threads} tópicos · ${esc(timeAgo(c.last))}</small><p>${esc(c.desc)}</p></div>${c.mine ? '<span class="w-chip gold">sua</span>' : c.joined ? '<span class="w-chip ok">membro</span>' : ''}</a>`).join('')}</div>`;
  box.querySelector('#cNew').onclick = () => modal({
    title: 'Criar comunidade',
    body: `<form class="form"><div class="field"><label>Nome</label><input name="name" maxlength="50" required placeholder="Ex.: Café e código"></div><div class="field"><label>Descrição (o tema atrai quem se interessa)</label><input name="desc" maxlength="300" placeholder="Ex.: café, tecnologia e boas conversas"></div>
      <div class="field"><label>Regras (uma por linha)</label><textarea name="rules" rows="3" placeholder="Seja gentil&#10;Sem spam"></textarea></div><div class="form-actions"><button type="button" class="btn outline" data-close>Cancelar</button><button class="btn primary">Criar</button></div></form>`,
    onMount: (m, close) => { m.querySelector('form').onsubmit = async (e) => { e.preventDefault(); try { const r = await api.post('/mundo/comunidades', { name: e.target.name.value, desc: e.target.desc.value, rules: e.target.rules.value }); close(); location.hash = `#/social/comunidades/${r.id}`; } catch (err) { toast('Erro', err.message, 'error'); } }; },
  });
}

async function comunidade(box, id) {
  const c = await api.get(`/mundo/comunidades/${encodeURIComponent(id)}`);
  const by = (a) => (a?.me ? '<b>Você</b>' : `<a class="w-link" data-person="${esc(a?.id)}">${esc(a?.name || 'alguém')}</a>`);
  box.innerHTML = `<a class="w-back" href="#/social/comunidades">${icon('chevLeft', 14)} Comunidades</a>
    <div class="w-comm-head"><span class="w-comm-ic big">${esc(c.name[0])}</span><div class="grow"><h2>${esc(c.name)}</h2><p>${esc(c.desc)}</p><small class="muted">${num(c.members)} membros · admin: ${by(c.admin)}${c.mods.length ? ` · moderação: ${c.mods.map(by).join(', ')}` : ''}${c.origin === 'genese' ? ' · da gênese' : ''}</small></div>
      ${c.mine ? '' : `<button class="btn sm ${c.joined ? 'outline' : 'primary'}" id="cJoin">${c.joined ? 'Sair' : 'Entrar'}</button>`}</div>
    <div class="w-comm-grid"><div>
      ${c.joined ? `<form class="w-post-form" id="cPost"><input name="title" maxlength="160" placeholder="Título do tópico" required><textarea name="body" rows="2" maxlength="1200" placeholder="Conte mais (opcional)"></textarea><button class="btn sm primary">Publicar</button></form>` : ''}
      ${c.threads.map((t) => `<article class="w-thread"><div class="w-vote"><button data-vote="${esc(t.id)}" aria-label="Votar">▲</button><b>${t.votes}</b></div><div class="grow"><small class="muted">${by(t.author)} · ${esc(timeAgo(t.at))}</small><h4>${esc(t.title)}</h4>${t.body ? `<p>${esc(t.body)}</p>` : ''}
        <details><summary>${t.comments.length} comentário(s)${t.removed ? ` · ${t.removed} removido(s) pela moderação` : ''}</summary>${t.comments.map((x) => `<div class="w-cm"><small>${by(x.author)} · ${esc(timeAgo(x.at))}</small><p>${x.removed ? '<i class="muted">[removido pela moderação]</i>' : esc(x.text)}</p></div>`).join('')}
        ${c.joined ? `<form class="w-cm-form" data-thread="${esc(t.id)}"><input maxlength="600" placeholder="Comentar..." required><button class="btn sm primary">${icon('send', 12)}</button></form>` : ''}</details></div></article>`).join('') || '<p class="muted">Nenhum tópico ainda.</p>'}
    </div><aside class="w-panel w-rules"><h4>Regras</h4><ol>${c.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol><h4>Membros</h4><div class="w-faces">${c.sample.map((p) => `<span data-person="${esc(p.id)}" title="${esc(p.name)}">${face(p, 30)}</span>`).join('')}</div>
      ${c.mine && c.invitable.length ? `<h4>Convidar amigos</h4><select id="cInv"><option value="">Escolha</option>${c.invitable.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select><button class="btn sm outline" id="cInvGo" style="margin-top:6px">Convidar</button>` : ''}</aside></div>`;
  box.querySelector('#cJoin')?.addEventListener('click', async () => { await api.post(`/mundo/comunidades/${c.id}/entrar`); comunidade(box, id); });
  box.querySelector('#cPost')?.addEventListener('submit', async (e) => { e.preventDefault(); try { await api.post(`/mundo/comunidades/${c.id}/topicos`, { title: e.target.title.value, body: e.target.body.value }); toast('Publicado', 'Os membros vão responder.', 'success'); comunidade(box, id); } catch (err) { toast('Erro', err.message, 'error'); } });
  box.querySelectorAll('[data-vote]').forEach((b) => { b.onclick = async () => { const r = await api.post(`/mundo/comunidades/${c.id}/topicos/${b.dataset.vote}/votar`, { dir: 1 }); b.nextElementSibling.textContent = r.votes; b.disabled = true; }; });
  box.querySelectorAll('[data-thread]').forEach((f) => { f.onsubmit = async (e) => { e.preventDefault(); try { await api.post(`/mundo/comunidades/${c.id}/topicos/${f.dataset.thread}/comentarios`, { text: f.querySelector('input').value }); comunidade(box, id); } catch (err) { toast('Erro', err.message, 'error'); } }; });
  box.querySelector('#cInvGo')?.addEventListener('click', async () => { const pid = box.querySelector('#cInv').value; if (!pid) return; const r = await api.post(`/mundo/comunidades/${c.id}/convidar`, { personaId: pid }); toast(r.accepted ? 'Convite aceito' : 'Convite recusado', r.reason, r.accepted ? 'success' : 'info'); comunidade(box, id); });
}

async function investigacoes(box) {
  const list = await api.get('/mundo/investigacoes');
  box.innerHTML = `<p class="muted">Boatos circulam de pessoa em pessoa e mudam no caminho. Quando alguém solta uma indireta na <a href="#/rede">Rede</a>, toque em “Investigar” no post para descobrir quem contou para quem e se é verdade.</p>
    ${list.map((i) => `<div class="w-inv-card"><div class="w-ph"><b>Boato sobre ${esc(i.about?.name || '?')}</b><span class="w-chip ${i.status === 'concluída' ? (i.truth === 'verdadeiro' ? 'ok' : 'warn') : ''}">${i.status === 'concluída' ? `É ${esc(i.truth)}` : 'Em andamento…'}</span></div>
      <small class="muted">Começou ${esc(timeAgo(i.startedAt))} · passou por ${i.spread} pessoa(s)</small>
      <ol class="w-chain">${i.revealed.map((x) => `<li>${x.fromPerson ? `<a class="w-link" data-person="${esc(x.fromPerson.id)}">${esc(x.fromPerson.name)}</a> contou para ` : '<b>Origem:</b> '}<a class="w-link" data-person="${esc(x.person.id)}">${esc(x.person.name)}</a><p>"${esc(x.text)}" <small class="muted">(${esc(x.truth)})</small></p></li>`).join('')}</ol>
      ${i.origin ? `<p><b>Quem começou:</b> <a class="w-link" data-person="${esc(i.origin.id)}">${esc(i.origin.name)}</a></p>` : ''}</div>`).join('') || `<div class="w-empty">${icon('search', 30)}<b>Nenhuma investigação</b></div>`}`;
}
