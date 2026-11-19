// Banco Nexus — app do banco. Conta começa em zero; todo dinheiro vem de algum lugar do mundo.
// Senha de 4 dígitos para operações sensíveis (só a versão criptografada fica no servidor).
import { shell, bindEntities, face, nx, api, esc, icon, toast, modal, withPin, createPin, opId, timeAgo, confirmDialog } from '../world/wui.js';
import { formModal } from '../ui.js';
import { livePanel } from '../world/live.js';
import { myAvatar } from '../chrome.js';

const TABS = [['inicio', 'Conta', 'wallet'], ['emprestimos', 'Empréstimos', 'trending'], ['pendencias', 'Pendências', 'bell'], ['cartao', 'Cartão', 'layers'], ['cofrinhos', 'Cofrinhos', 'star'], ['amigos', 'Amigos e vaquinha', 'users'], ['extrato', 'Extrato', 'list'], ['seguranca', 'Segurança', 'shield']];
const dt = (s) => new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
const ST = { aberta: 'Em aberto', paga: 'Paga', atrasada: 'Atrasada', ativo: 'Em dia', quitado: 'Quitado', inadimplente: 'Inadimplente', renegociado: 'Renegociado', aberto: 'Em aberto', pago: 'Pago', calote: 'Não pago', ativa: 'Ativa', liberada: 'Liberada', 'em-analise': 'Em análise', bloqueada: 'Bloqueada pela polícia', encerrada: 'Encerrada' };

export default async function render(el, parts) {
  const tab = TABS.some(([k]) => k === parts[0]) ? parts[0] : 'inicio';
  const body = shell(el, 'banco');
  let stopLive = null;
  body.innerHTML = `<div class="bk"><nav class="bq-tabs">${TABS.map(([k, l, ic]) => `<a href="#/banco/${k}" class="${k === tab ? 'on' : ''}">${icon(ic, 14)} ${l}</a>`).join('')}</nav><div id="bkBody"><div class="skeleton" style="height:260px"></div></div></div>`;
  const host = body.querySelector('#bkBody');
  bindEntities(host);
  const reload = async () => { const b = await api.get('/mundo/banco'); paint(b); };
  const fail = (err) => toast('Operação não realizada', err.message, 'error');
  const act = async (fn, okTitle, okMsg) => { try { const r = await fn(); if (r !== null && r !== undefined) { toast(okTitle, typeof okMsg === 'function' ? okMsg(r) : okMsg || '', 'success'); await reload(); } return r; } catch (err) { fail(err); return null; } };

  function paint(b) {
    if (!b.hasPin && !['seguranca', 'inicio'].includes(tab)) {
      host.innerHTML = `<div class="w-panel bq-setup">${icon('shield', 34)}<h2>Crie sua senha bancária</h2><p class="muted">Ela protege compras, transferências, saques e empréstimos. São 4 números, e só guardamos uma versão criptografada.</p><button class="btn primary" id="bkPin">Criar senha agora</button></div>`;
      host.querySelector('#bkPin').onclick = async () => { if (await createPin()) reload(); };
      return;
    }
    const views = { inicio, emprestimos, pendencias, cartao, cofrinhos, amigos, extrato, seguranca };
    host.innerHTML = views[tab](b);
    bind(b);
    if (tab === 'inicio') mountManager(b);
  }

  // ------------------------------------------------ telas
  function scoreGauge(b) {
    const a = Math.min(1000, b.score) / 1000; const r = 52; const len = Math.PI * r;
    const color = b.score >= 700 ? '#22c55e' : b.score >= 400 ? '#eab308' : b.score >= 200 ? '#f97316' : '#ef4444';
    return `<div class="bq-gauge"><svg viewBox="0 0 120 70"><path d="M8,64 A52,52 0 0 1 112,64" fill="none" stroke="var(--bg-card-2)" stroke-width="10" stroke-linecap="round"/><path d="M8,64 A52,52 0 0 1 112,64" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(len * a).toFixed(1)} ${len.toFixed(1)}"/></svg>
      <b>${b.score}</b><small>${esc(b.band.label)}</small></div>`;
  }
  // Início do banco (layout da referência): gerente de IA com balão de fala, ações, chat, LIVE do banco e cartão da conta
  function inicio(b) {
    const pend = b.debts.filter((d) => d.status !== 'paga').length + (b.card?.bills || []).filter((x) => x.status !== 'paga').length + b.contracts.reduce((s, c) => s + c.schedule.filter((i) => i.status === 'atrasada').length, 0);
    return `<div class="nb">
      <section class="nb-hero cx-card">
        <div class="nb-scene"><img class="nb-bg" src="/assets/pixel/scene-cidade.png" alt=""><img class="nb-bld" src="/assets/pixel/b-banco.png" alt="">
          <div class="nb-logo"><b>NEXUS</b><small>BANK</small></div>
          <div class="nb-mgr" id="nbMgr"><div class="skeleton" style="width:150px;height:150px;border-radius:20px"></div></div>
          <div class="nb-bubble" id="nbBubble"><b>Olá!</b><p>Carregando atendimento…</p></div></div>
        <div class="nb-acts">
          <a class="nb-act" href="#/banco/emprestimos"><span style="--c:#f7c948">${icon('wallet', 20)}</span>Solicitar empréstimo</a>
          <a class="nb-act" href="#/banco/pendencias"><span style="--c:#a78bfa">${icon('file', 20)}</span>Realizar pagamento${pend ? `<em>${pend}</em>` : ''}</a>
          <button class="nb-act" data-a="saldo"><span style="--c:#fb923c">${icon('eye', 20)}</span>Ver meu saldo</button>
          <a class="nb-act" href="#/banco/cofrinhos"><span style="--c:#2fd27a">${icon('trending', 20)}</span>Investir</a>
          <button class="nb-act" data-a="falar"><span style="--c:#38d6f5">${icon('chat', 20)}</span>Falar com atendente</button>
          <a class="nb-act" href="#/banco/extrato"><span style="--c:#c2c6ef">${icon('more', 20)}</span>Outros serviços</a>
        </div>
      </section>
      <section class="nb-chat cx-card"><div class="nb-msgs" id="nbMsgs"></div>
        <form class="nb-send" id="nbSend"><input name="m" placeholder="Digite sua mensagem para a gerente..." autocomplete="off" maxlength="400"><button class="cx-btn" aria-label="Enviar">${icon('send', 16)}</button></form></section>
      <aside class="nb-live cx-card" id="nbLive"></aside>
      <section class="nb-acc cx-card">
        <header class="cx-card-h"><span class="cx-h-ic" style="--c:#38d6f5">${icon('wallet', 16)}</span><h3>Minha conta</h3></header>
        <div class="nb-acc-top"><div><b class="nb-bal" id="nbBal">${nx(b.balance)}</b><small><i class="nb-n">N</i> Saldo disponível no Nexus</small>
          ${b.wallet ? `<small>+ ${nx(b.wallet)} em mãos</small>` : ''}${b.blocked ? `<small class="down">${nx(b.blocked)} bloqueado</small>` : ''}</div>
          <div class="nb-vcard ${b.card ? '' : 'none'}"><b>NEXUS</b><i class="nb-chip"></i><span>${b.card ? `**** ${esc(b.card.last4)}` : 'sem cartão'}</span></div></div>
        <div class="nb-acc-acts"><button data-a="pix">${icon('send', 18)}<span>Transferir</span></button><a href="#/banco/pendencias">${icon('file', 18)}<span>Pagar</span></a>
          <a href="#/banco/cofrinhos">${icon('trending', 18)}<span>Investir</span></a><a href="#/banco/extrato">${icon('list', 18)}<span>Extrato</span></a></div>
        <div class="nb-score"><span>Score <b>${b.score}</b> · ${esc(b.band.label)}</span><span>Limite <b>${nx(b.limit, 0)}</b></span></div>
        ${b.late ? `<div class="bq-warn">${icon('bell', 13)} Pendências em atraso derrubam seu score. <a href="#/banco/pendencias">Ver</a></div>` : ''}
        ${b.hasPin ? '' : `<div class="bq-warn">${icon('shield', 13)} Crie sua senha bancária de 4 dígitos para operar. <a href="#/banco/seguranca">Criar</a></div>`}
        <div class="nb-acc-row"><button class="cx-btn sm ghost" data-a="sacar">${icon('download', 13)} Sacar</button><button class="cx-btn sm ghost" data-a="depositar">${icon('upload', 13)} Depositar</button>${b.card ? '' : `<button class="cx-btn sm" data-a="card">${icon('layers', 13)} Pedir cartão</button>`}</div>
      </section>
    </div>`;
  }
  // gerente: rosto em pixel, balão, conversa real com a pessoa que atende na agência
  async function mountManager(b) {
    stopLive?.(); stopLive = livePanel(host.querySelector('#nbLive'), { scope: 'banco', title: 'Live do Banco', art: '/assets/pixel/b-banco.png', n: 10, empty: 'Movimentações na agência e na sua conta aparecem aqui.' });
    const msgs = host.querySelector('#nbMsgs'); const bubble = host.querySelector('#nbBubble');
    let g;
    try { g = await api.get('/mundo/banco/gerente'); } catch { return; }
    const m = g.manager;
    host.querySelector('#nbMgr').innerHTML = m ? `<img src="${esc(m.avatar || '')}" alt="${esc(m.name)}"><span class="nb-mgr-tag">${esc(m.name)} · Gerente</span>` : '';
    const first = (g.greeting || '').split('!')[0];
    bubble.innerHTML = `<b>${esc(first)}!</b><p>${esc((g.greeting || '').slice(first.length + 1).trim())}</p>`;
    const msg = (x) => x.who === 'me' ? `<div class="nb-m me"><p>${esc(x.text)}</p><img src="${esc(myAvatar())}" alt=""><small>${new Date(x.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small></div>`
      : `<div class="nb-m"><img src="${esc(m?.avatar || '')}" alt=""><p>${esc(x.text)}${x.action ? ` <a href="#/banco/${x.action === 'pix' ? 'inicio' : x.action}" ${x.action === 'pix' ? 'data-a="pix"' : ''}>Abrir ${icon('chevRight', 11)}</a>` : ''}</p><small>${new Date(x.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small></div>`;
    const list = g.chat.length ? g.chat : [{ who: 'gerente', text: g.greeting, at: new Date().toISOString() }];
    msgs.innerHTML = list.map(msg).join(''); msgs.scrollTop = msgs.scrollHeight;
    const f = host.querySelector('#nbSend');
    f.onsubmit = async (e) => {
      e.preventDefault(); const t = f.m.value.trim(); if (!t) return; f.m.value = '';
      msgs.insertAdjacentHTML('beforeend', msg({ who: 'me', text: t, at: new Date().toISOString() }) + '<div class="nb-typing"><i></i><i></i><i></i></div>'); msgs.scrollTop = msgs.scrollHeight;
      try {
        const r = await api.post('/mundo/banco/gerente', { mensagem: t });
        msgs.querySelector('.nb-typing')?.remove();
        msgs.insertAdjacentHTML('beforeend', msg({ who: 'gerente', text: r.text, action: r.action, at: new Date().toISOString() }));
        bubble.innerHTML = `<b>${esc((m?.name || 'Gerente').split(' ')[0])}</b><p>${esc(r.text)}</p>`;
      } catch (err) { msgs.querySelector('.nb-typing')?.remove(); fail(err); }
      msgs.scrollTop = msgs.scrollHeight;
    };
    host.querySelector('[data-a="falar"]')?.addEventListener('click', () => f.m.focus());
    host.querySelector('[data-a="saldo"]')?.addEventListener('click', () => { bubble.innerHTML = `<b>Seu saldo</b><p>${esc(nx(b.balance))} disponíveis${b.wallet ? ` e ${esc(nx(b.wallet))} em mãos` : ''}. Score ${b.score} (${esc(b.band.label)}).</p>`; });
  }
  const row = (h) => `<div class="bq-row"><span class="bq-ric ${h.amount >= 0 ? 'in' : 'out'}">${icon(h.amount >= 0 ? 'download' : 'upload', 13)}</span><div><b>${esc(h.desc)}</b><small>${new Date(h.at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}${h.type ? ` · ${esc(h.type)}` : ''}</small></div><em class="${h.amount >= 0 ? 'up' : 'down'}">${h.amount >= 0 ? '+' : ''}${nx(h.amount)}</em></div>`;
  function emprestimos(b) {
    const list = b.contracts;
    return `<div class="bq-grid two">
      <section class="w-panel"><h3>Simular empréstimo</h3><p class="muted">O dinheiro sai do caixa do Banco Nexus e volta para ele quando você paga. Parcelas a cada ${b.periodDays} dias, juros de ${(b.band.rate * 100).toFixed(1)}% por período na sua faixa.</p>
        <form class="form" id="bkSim"><div class="form-row"><div class="field"><label>Valor (NXC)</label><input type="number" name="valor" min="50" step="10" value="${Math.max(50, Math.min(1000, Math.floor(b.limit / 10) * 10))}"></div>
          <div class="field"><label>Parcelas</label><select name="parcelas">${[1, 2, 3, 4, 6, 8, 10, 12].map((n) => `<option value="${n}" ${n === 3 ? 'selected' : ''}>${n}x</option>`).join('')}</select></div></div>
          <p class="hint muted">Limite disponível agora: <b>${nx(b.limit, 0)}</b></p><div class="form-actions"><button class="btn primary">Simular</button></div></form><div id="bkProp"></div></section>
      <section class="w-panel"><h3>Seus contratos</h3>${list.length ? list.map((c) => `<div class="bq-ct ${c.status}"><div class="bq-ct-h"><b>${nx(c.principal, 0)} em ${c.periods}x de ${nx(c.installment)}</b><span class="w-chip ${c.status === 'quitado' ? 'ok' : c.status === 'inadimplente' ? 'warn' : ''}">${ST[c.status] || c.status}</span></div>
          <small class="muted">Contratado em ${dt(c.createdAt)} · juros ${(c.rate * 100).toFixed(1)}%/${b.periodDays}d · total ${nx(c.total)}</small>
          <div class="bq-inst">${c.schedule.map((i) => `<span class="${i.status}" title="Parcela ${i.n}: ${nx(i.amount)} · vence ${dt(i.due)} · ${ST[i.status] || i.status}">${i.n}</span>`).join('')}</div>
          ${['ativo', 'inadimplente'].includes(c.status) ? `<div class="bq-acts sm"><button class="btn sm primary" data-pay="${esc(c.id)}">Pagar parcela</button><button class="btn sm outline" data-payall="${esc(c.id)}">Quitar tudo</button>${c.status === 'inadimplente' || c.schedule.some((i) => i.status === 'atrasada') ? `<button class="btn sm outline" data-reneg="${esc(c.id)}">Renegociar</button>` : ''}<button class="btn sm ghost" data-text="${esc(c.id)}">Contrato</button></div>` : `<button class="btn sm ghost" data-text="${esc(c.id)}">Ver contrato</button>`}</div>`).join('') : '<p class="muted">Nenhum contrato.</p>'}</section></div>`;
  }
  function pendencias(b) {
    const late = b.contracts.flatMap((c) => c.schedule.filter((i) => i.status === 'atrasada').map((i) => ({ c, i })));
    const debts = b.debts.filter((d) => d.status !== 'paga');
    const bills = (b.card?.bills || []).filter((x) => x.status !== 'paga');
    return `<div class="bq-grid two"><section class="w-panel"><h3>Contas a pagar</h3>
      ${late.map(({ c, i }) => `<div class="bq-debt late"><div><b>Parcela ${i.n}/${c.periods} do empréstimo</b><small>Venceu ${dt(i.due)} · multa e juros de mora incluídos</small></div><em>${nx(i.amount - (i.paid || 0))}</em><button class="btn sm primary" data-pay="${esc(c.id)}">Pagar</button></div>`).join('')}
      ${bills.map((x) => `<div class="bq-debt ${x.status === 'atrasada' ? 'late' : ''}"><div><b>Fatura do cartão</b><small>Vence ${dt(x.due)} · ${ST[x.status] || x.status}</small></div><em>${nx(x.amount - (x.paid || 0))}</em><button class="btn sm primary" data-bill="${esc(x.id)}">Pagar</button></div>`).join('')}
      ${debts.map((d) => `<div class="bq-debt ${d.status === 'atrasada' ? 'late' : ''}"><div><b>${esc(d.desc)}</b><small>${esc(d.creditor || '')} · vence ${dt(d.due)} · ${ST[d.status] || d.status}</small></div><em>${nx(d.amount - (d.paid || 0))}</em><button class="btn sm primary" data-debt="${esc(d.id)}">Pagar</button></div>`).join('')}
      ${!late.length && !bills.length && !debts.length ? `<div class="w-empty">${icon('check', 26)}<b>Tudo em dia</b><p class="muted">Nenhuma conta pendente.</p></div>` : ''}</section>
      <section class="w-panel"><h3>Como funcionam os atrasos</h3><ul class="bq-rules"><li>Parcela atrasada: multa de 2% (uma vez) e juros de 1% ao dia.</li><li>10 dias de atraso: o contrato fica inadimplente e o score cai bastante.</li><li>20 dias: o banco pode entrar com uma ação de execução na Justiça.</li><li>Multas e decisões judiciais não pagas podem ser descontadas do saldo (penhora).</li><li>Renegociar junta tudo em um contrato novo, com novas parcelas.</li></ul></section></div>`;
  }
  function cartao(b) {
    const c = b.card;
    if (!c) return `<div class="w-panel bq-setup">${icon('layers', 32)}<h2>Cartão virtual Nexus</h2><p class="muted">Compre nas lojas e pague depois na fatura (fecha a cada 7 dias, vence 3 dias depois). Precisa de score a partir de 200.</p><p>Seu score: <b>${b.score}</b></p><button class="btn primary" data-a="card" ${b.score < 200 ? 'disabled' : ''}>Solicitar cartão</button></div>`;
    return `<div class="bq-grid two"><section class="w-panel"><div class="bq-vcard ${c.status}"><span>Banco Nexus</span><b>•••• •••• •••• ${esc(c.last4)}</b><small>${esc(c.status === 'ativo' ? 'Ativo' : 'Bloqueado')}</small></div>
      <div class="bq-kv"><span>Limite</span><b>${nx(c.limit, 0)}</b></div><div class="bq-kv"><span>Usado</span><b>${nx(c.used)}</b></div><div class="bq-kv"><span>Disponível</span><b>${nx(Math.max(0, c.limit - c.used))}</b></div>
      <h5>Compras desta fatura</h5>${(c.open || []).map((x) => `<div class="bq-kv"><span>${esc(x.desc)}</span><b>${nx(x.amount)}</b></div>`).join('') || '<p class="muted">Nenhuma compra no ciclo.</p>'}</section>
      <section class="w-panel"><h3>Faturas</h3>${(c.bills || []).slice().reverse().map((x) => `<div class="bq-debt ${x.status === 'atrasada' ? 'late' : ''}"><div><b>Fechada em ${dt(x.closedAt)}</b><small>Vence ${dt(x.due)} · ${ST[x.status] || x.status}</small></div><em>${nx(x.amount)}</em>${x.status !== 'paga' ? `<button class="btn sm primary" data-bill="${esc(x.id)}">Pagar</button>` : ''}</div>`).join('') || '<p class="muted">Nenhuma fatura ainda.</p>'}</section></div>`;
  }
  function cofrinhos(b) {
    return `<div class="w-panel"><div class="w-ph"><h3>Cofrinhos</h3><button class="btn sm primary" data-a="cofre">${icon('plus', 12)} Novo cofrinho</button></div><p class="muted">Rendem um pouco por dia (pago pelo banco com os juros que ele recebe). Resgatar pede senha.</p>
      <div class="bq-safes">${b.savings.map((s) => `<div class="bq-safe"><b>${esc(s.name)}</b><div class="bq-bal sm">${nx(s.balance)}</div>${s.goal ? `<i class="w-bar"><i style="width:${Math.min(100, (s.balance / s.goal) * 100)}%"></i></i><small class="muted">Meta ${nx(s.goal, 0)}</small>` : ''}
        <div class="bq-acts sm"><button class="btn sm primary" data-save="${esc(s.id)}">Guardar</button><button class="btn sm outline" data-take="${esc(s.id)}">Resgatar</button></div></div>`).join('') || '<p class="muted">Nenhum cofrinho.</p>'}</div></div>`;
  }
  function amigos(b) {
    const fl = b.friendLoans;
    return `<div class="bq-grid two"><section class="w-panel"><div class="w-ph"><h3>Empréstimos com amigos</h3><a class="btn sm primary" href="#/social/emprestimos">${icon('users', 12)} Pedir a um amigo</a></div>
        <p class="muted">Cada pessoa decide pelo que tem no bolso, pela confiança em você e pelo seu histórico. Sem amizade, ninguém empresta.</p>
        ${fl.map((l) => `<div class="bq-debt ${l.status === 'calote' ? 'late' : ''}"><span data-person="${esc(l.lenderId)}">${face(l.lender, 30)}</span><div><b>${esc(l.lender.name)}</b><small>${ST[l.status] || l.status} · vence ${dt(l.due)}</small></div><em>${nx(l.amount)}</em>${l.status === 'aberto' || l.status === 'calote' ? `<button class="btn sm primary" data-fl="${esc(l.id)}">Devolver</button>` : ''}</div>`).join('') || '<p class="muted">Você não pegou dinheiro com amigos.</p>'}
        ${b.lentToFriends.length ? `<h5>Te devem</h5>${b.lentToFriends.map((p) => `<div class="bq-kv"><a data-person="${esc(p.id)}">${esc(p.name)}</a><b>${nx(p.amount)}</b></div>`).join('')}<p class="hint muted">Se alguém não pagar, você pode registrar na <a href="#/policia">Polícia</a> (vira processo civil).</p>` : ''}</section>
      <section class="w-panel"><div class="w-ph"><h3>Vaquinhas</h3><button class="btn sm primary" data-a="vaq">${icon('plus', 12)} Criar vaquinha</button></div>
        <p class="muted">As doações ficam bloqueadas até a auditoria (12 h). A polícia confere o motivo com os fatos da sua vida: motivo falso é fraude, o dinheiro volta para quem doou e abre investigação.</p>
        ${b.vaquinhas.map((v) => `<div class="bq-vaq ${v.status}"><b>${esc(v.title)}</b><small>${ST[v.status] || v.status} · ${dt(v.at)}</small><i class="w-bar"><i style="width:${Math.min(100, (v.raised / v.goal) * 100)}%"></i></i><small>${nx(v.raised, 0)} de ${nx(v.goal, 0)} · ${v.donors.length} doador(es)</small>${v.status === 'ativa' ? `<p class="muted">Auditoria ${new Date(v.auditAt).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>` : ''}</div>`).join('') || '<p class="muted">Nenhuma vaquinha.</p>'}</section></div>`;
  }
  function extrato(b) {
    return `<div class="w-panel"><div class="w-ph"><h3>Extrato</h3><select id="bkFil" aria-label="Filtrar"><option value="">Tudo</option><option value="in">Entradas</option><option value="out">Saídas</option></select></div><div id="bkHist">${b.history.map(row).join('') || '<p class="muted">Sem movimentações.</p>'}</div></div>`;
  }
  function seguranca(b) {
    return `<div class="w-panel bq-setup">${icon('shield', 32)}<h2>Senha bancária</h2>
      <p class="muted">${b.hasPin ? 'Sua senha está ativa. Depois de 5 tentativas erradas ela bloqueia por 15 minutos.' : 'Você ainda não criou a senha.'}</p>${b.pinLocked ? '<p class="down">Senha bloqueada temporariamente.</p>' : ''}
      <button class="btn primary" data-a="${b.hasPin ? 'trocar' : 'criar'}">${b.hasPin ? 'Trocar senha' : 'Criar senha'}</button>
      <ul class="bq-rules"><li>Nunca guardamos sua senha em texto: só uma versão criptografada (scrypt).</li><li>Ninguém da cidade pede sua senha. Lojas, bancos e amigos só pedem o teclado do próprio app.</li></ul></div>`;
  }

  // ------------------------------------------------ ações
  function bind(b) {
    const on = (sel, fn) => host.querySelectorAll(sel).forEach((x) => { x.onclick = () => fn(x); });
    on('[data-a="pix"]', () => formModal({ title: 'Pix', submit: 'Continuar', fields: [{ name: 'chave', label: 'Chave Pix (o @ da pessoa)', placeholder: '@fulano' }, { name: 'valor', label: 'Valor (NXC)', type: 'number', step: '0.01' }, { name: 'motivo', label: 'Mensagem (opcional)', full: true }],
      onSubmit: async (d) => { const id = opId(); return act(() => withPin((pin) => api.post('/mundo/banco/pix', { ...d, valor: Number(d.valor), pin, opId: id }), 'Confirme o Pix'), 'Pix enviado', (r) => `Para ${r.to}`); } }));
    on('[data-a="sacar"]', () => formModal({ title: 'Saque', submit: 'Sacar', fields: [{ name: 'valor', label: 'Valor (NXC)', type: 'number', step: '1' }], onSubmit: async (d) => { const id = opId(); return act(() => withPin((pin) => api.post('/mundo/banco/carteira', { op: 'sacar', valor: Number(d.valor), pin, opId: id }), 'Confirme o saque'), 'Saque feito', 'O dinheiro está na sua carteira.'); } }));
    on('[data-a="depositar"]', () => formModal({ title: 'Depósito', submit: 'Depositar', fields: [{ name: 'valor', label: `Valor (você tem ${nx(b.wallet)} em mãos)`, type: 'number', step: '1' }], onSubmit: async (d) => act(() => api.post('/mundo/banco/carteira', { op: 'depositar', valor: Number(d.valor), opId: opId() }), 'Depósito feito') }));
    on('[data-a="card"]', () => act(() => withPin((pin) => api.post('/mundo/banco/cartao', { pin }), 'Confirme o pedido do cartão'), 'Cartão aprovado', (r) => `Final ${r.last4}, limite ${nx(r.limit, 0)}`));
    on('[data-a="cofre"]', () => formModal({ title: 'Novo cofrinho', submit: 'Criar', fields: [{ name: 'name', label: 'Nome', placeholder: 'Viagem, reserva…' }, { name: 'goal', label: 'Meta (opcional)', type: 'number' }], onSubmit: async (d) => act(() => api.post('/mundo/banco/cofrinho', { ...d, op: 'criar' }), 'Cofrinho criado') }));
    on('[data-save]', (x) => formModal({ title: 'Guardar no cofrinho', submit: 'Guardar', fields: [{ name: 'amount', label: 'Valor', type: 'number' }], onSubmit: async (d) => act(() => api.post('/mundo/banco/cofrinho', { id: x.dataset.save, amount: Number(d.amount), op: 'guardar' }), 'Guardado') }));
    on('[data-take]', (x) => formModal({ title: 'Resgatar', submit: 'Resgatar', fields: [{ name: 'amount', label: 'Valor', type: 'number' }], onSubmit: async (d) => act(() => withPin((pin) => api.post('/mundo/banco/cofrinho', { id: x.dataset.take, amount: Number(d.amount), op: 'resgatar', pin }), 'Confirme o resgate'), 'Resgate feito') }));
    on('[data-a="vaq"]', () => formModal({ title: 'Criar vaquinha', submit: 'Publicar', fields: [{ name: 'motivo', label: 'Motivo', type: 'select', options: Object.entries(b.motivos) }, { name: 'title', label: 'Título', placeholder: 'Ex.: Ajuda para pagar o aluguel' }, { name: 'goal', label: 'Meta (NXC)', type: 'number', value: 500 }, { name: 'pixKey', label: 'Chave Pix', value: 'minha-chave' }],
      onSubmit: async (d) => { const ok = await confirmDialog('Declaração', 'Ao publicar, você declara que o motivo é verdadeiro. Motivo falso é fraude: o dinheiro volta para os doadores e a polícia investiga.', 'Publicar'); if (!ok) return null; return act(() => api.post('/mundo/vaquinha', { ...d, goal: Number(d.goal) }), 'Vaquinha publicada', 'As pessoas da cidade vão ver na Rede.'); } }));
    on('[data-a="trocar"]', async () => { const { askPin } = await import('../world/wui.js'); const old = await askPin('Senha atual'); if (!old) return; const a = await askPin('Nova senha', 'Escolha 4 números'); if (!a) return; const c = await askPin('Confirme a nova senha'); if (a !== c) { toast('As senhas não conferem', '', 'error'); return; } act(() => api.post('/mundo/banco/senha', { pin: a, oldPin: old }), 'Senha trocada 🔒'); });
    on('[data-a="criar"]', async () => { if (await createPin()) reload(); });
    on('[data-pay]', (x) => act(() => withPin((pin) => api.post('/mundo/banco/emprestimo/pagar', { contractId: x.dataset.pay, pin, opId: opId() }), 'Pagar parcela'), 'Parcela paga', (r) => `${nx(r.paid)} pagos`));
    on('[data-payall]', (x) => act(() => withPin((pin) => api.post('/mundo/banco/emprestimo/pagar', { contractId: x.dataset.payall, all: true, pin, opId: opId() }), 'Quitar contrato'), 'Contrato quitado', (r) => `${nx(r.paid)} pagos`));
    on('[data-reneg]', (x) => formModal({ title: 'Renegociar dívida', submit: 'Renegociar', fields: [{ name: 'parcelas', label: 'Novas parcelas', type: 'select', options: [3, 4, 6, 8, 10, 12].map((n) => [n, `${n}x`]) }], onSubmit: async (d) => act(() => withPin((pin) => api.post('/mundo/banco/emprestimo/renegociar', { contractId: x.dataset.reneg, parcelas: Number(d.parcelas), pin }), 'Confirmar renegociação'), 'Dívida renegociada', (r) => `${r.periods}x de ${nx(r.installment)}`) }));
    on('[data-text]', (x) => { const c = b.contracts.find((y) => y.id === x.dataset.text); modal({ title: 'Contrato', body: `<pre class="bq-contract">${esc(c?.text || '')}</pre>` }); });
    on('[data-bill]', (x) => act(() => withPin((pin) => api.post(`/mundo/banco/fatura/${x.dataset.bill}`, { pin }), 'Pagar fatura'), 'Fatura paga'));
    on('[data-debt]', (x) => act(() => withPin((pin) => api.post(`/mundo/banco/debito/${x.dataset.debt}`, { pin }), 'Pagar conta'), 'Conta paga'));
    on('[data-fl]', (x) => act(() => withPin((pin) => api.post(`/mundo/amigos/emprestimo/${x.dataset.fl}/pagar`, { pin, opId: opId() }), 'Devolver ao amigo'), 'Dinheiro devolvido', 'A confiança entre vocês aumenta.'));
    const sim = host.querySelector('#bkSim');
    if (sim) sim.onsubmit = async (e) => {
      e.preventDefault();
      const out = host.querySelector('#bkProp');
      try {
        const p = await api.post('/mundo/banco/emprestimo/simular', { valor: Number(sim.valor.value), parcelas: Number(sim.parcelas.value) });
        if (p.denied) { out.innerHTML = `<div class="bq-deny">${icon('x', 16)}<div><b>Empréstimo negado</b>${p.reasons.map((r) => `<p>${esc(r)}</p>`).join('')}</div></div>`; return; }
        out.innerHTML = `<div class="bq-offer"><b>Aprovado: ${nx(p.approved, 0)}${p.approved < p.requested ? ` <small>(pediu ${nx(p.requested, 0)})</small>` : ''}</b>
          <div class="bq-kv"><span>Parcelas</span><b>${p.periods}x de ${nx(p.installment)}</b></div><div class="bq-kv"><span>Juros</span><b>${(p.rate * 100).toFixed(1)}% a cada ${b.periodDays} dias</b></div><div class="bq-kv"><span>Total a pagar</span><b>${nx(p.total)}</b></div><div class="bq-kv"><span>1ª parcela</span><b>${dt(p.firstDue)}</b></div>
          <details><summary>Ler o contrato</summary><pre class="bq-contract">${esc(p.text)}</pre></details>
          <label class="bq-agree"><input type="checkbox" id="bkAg"> Li e aceito o contrato</label><button class="btn primary" id="bkGo" disabled>Contratar com senha</button><small class="muted">Proposta válida por 15 min.</small></div>`;
        const ag = out.querySelector('#bkAg'); const go = out.querySelector('#bkGo');
        ag.onchange = () => { go.disabled = !ag.checked; };
        const id = opId();
        go.onclick = () => act(() => withPin((pin) => api.post('/mundo/banco/emprestimo/contratar', { proposalId: p.id, pin, opId: id }), 'Assinar contrato'), 'Dinheiro na conta', (r) => `${nx(r.contract.principal, 0)} liberados`);
      } catch (err) { fail(err); }
    };
    const fil = host.querySelector('#bkFil');
    if (fil) fil.onchange = () => { host.querySelector('#bkHist').innerHTML = b.history.filter((h) => !fil.value || (fil.value === 'in' ? h.amount >= 0 : h.amount < 0)).map(row).join(''); };
  }
  try { await reload(); } catch (err) { host.innerHTML = `<div class="w-empty"><b>${esc(err.message)}</b></div>`; }
  return () => stopLive?.();
}
