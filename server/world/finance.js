// FINANCE — o lado social do dinheiro: rotina diária do banco (cobrança, avisos), empréstimos entre amigos
// (decisão baseada no estado real da pessoa), empréstimos entre personagens, vaquinha (fiscalizada pela polícia)
// e trabalhos avulsos (freelas). Nenhum dinheiro surge do nada: tudo sai do caixa de alguém.
import { onDaily, onHourly, onUpgrade, handle, record, schedule, services } from './core.js';
import { people, residents, personById, agentOf, active, rel, bump, bumpUser, userName, dm, registerAction, relType } from './agents.js';
import { account, bankOf, credit, debit, dailyBank, block, unblock, scoreChange, BankError, once } from './bank.js';
import { companies, companyById, eco } from './economy.js';
import { remember, genderize, worldPost } from '../social.js';
import { notify } from '../notify.js';
import { rnd, pick, chance, clamp, uid, nowIso, DAY, HOUR, MIN, round2, cap, str } from './util.js';

// ---------------------------------------------------------------- agente de cobrança do Banco Nexus
function bankAgent(w) {
  const bank = companies(w).find((c) => c.name === 'Banco Nexus');
  const staff = (bank?.employees || []).map((e) => personById(w, e.personaId)).filter(Boolean);
  return staff.find((p) => /cobran|contas|gerente/i.test(p.agent?.role || '')) || staff[0] || null;
}
onDaily((ctx) => {
  const w = ctx.w;
  account(w);
  const bank = companies(w).find((c) => c.name === 'Banco Nexus');
  const events = dailyBank(w, ctx.at, eco(w), { bankRevenue: (v) => { if (bank && v > 0) bank.salesToday += v; } });
  const agent = bankAgent(w);
  for (const ev of events) {
    const say = (title, message, link = '#/banco') => { if (ctx.live) notify(ctx.uid, { type: 'system', title, message, link }); };
    if (ev.type === 'parcela-atrasada') { say('⚠️ Parcela em atraso', `Parcela ${ev.inst.n}/${ev.contract.periods} de ${ev.inst.amount.toLocaleString('pt-BR')} NXC venceu. Multa de 2% e juros de 1% ao dia.`); record(ctx, { type: 'atraso-banco', cat: 'economia', title: 'Você atrasou uma parcela no Banco Nexus', actors: ['me'], importance: 1 }); }
    if (ev.type === 'inadimplencia') {
      say('🚫 Contrato inadimplente', 'Seu crédito foi suspenso. Renegocie no app do banco.');
      record(ctx, { type: 'inadimplencia', cat: 'economia', title: 'Você ficou inadimplente no Banco Nexus', text: 'Crédito suspenso e cobrança iniciada.', actors: ['me'], importance: 2 });
      account(w).reputation = clamp(account(w).reputation - 8, 0, 100);
    }
    if (ev.type === 'cobranca' && ev.daysLate >= 20 && !ev.contract.sued) {
      ev.contract.sued = true;
      const owed = ev.contract.schedule.filter((i) => i.status !== 'paga').reduce((s, i) => s + i.amount - i.paid, 0);
      services.openCase(ctx, { type: 'execucao', suspect: { type: 'user', id: 'me' }, plaintiff: 'banco', amount: Math.round(owed), desc: `O Banco Nexus executa judicialmente um contrato inadimplente (${Math.round(owed).toLocaleString('pt-BR')} NXC).` });
    }
    if (ev.type === 'cobranca' && agent) collector(ctx, agent, `Olá, aqui é ${agent.name.split(' ')[0]}, do setor de cobrança do Banco Nexus. Seu contrato está com ${ev.daysLate} dias de atraso. Podemos renegociar: é só abrir o app do banco.`);
    if (ev.type === 'debito-atrasado') say('⚠️ Débito vencido', `${ev.debt.desc}: ${ev.debt.amount.toLocaleString('pt-BR')} NXC. Juros de 1% ao dia.`, '#/banco');
    if (ev.type === 'penhora') { say('⚖️ Penhora judicial', `${ev.amount.toLocaleString('pt-BR')} NXC foram retirados da sua conta: ${ev.debt.desc}.`, '#/justica'); record(ctx, { type: 'penhora', cat: 'justica', title: `Justiça penhora ${ev.amount.toLocaleString('pt-BR')} NXC da sua conta`, text: ev.debt.desc, actors: ['me'], importance: 2 }); }
    if (ev.type === 'fatura') say('💳 Fatura fechada', `Sua fatura do cartão final ${ev.card.last4} fechou. Vence em 3 dias.`);
    if (ev.type === 'fatura-atrasada') say('⚠️ Fatura atrasada', 'Cartão bloqueado até o pagamento.');
  }
});
function collector(ctx, agent, text) {
  // a mensagem chega no chat se a pessoa for contato; senão, como notificação
  if (agent.friend && agent.botId) dm(ctx, agent, text, 'cobranca');
  else if (ctx.live) notify(ctx.uid, { type: 'system', title: `📞 ${agent.name} (cobrança Banco Nexus)`, message: text, link: '#/banco' });
  record(ctx, { type: 'cobranca', cat: 'economia', title: `Banco Nexus cobra uma dívida sua`, text: `Contato de ${agent.name}.`, actors: [agent.id, 'me'], importance: 1 });
}

// ---------------------------------------------------------------- empréstimos entre amigos
export const loans = (w) => (w.p2p ??= []);
// pede dinheiro a uma pessoa: a resposta sai do estado real dela
export function askFriendLoan(ctx, personaId, amount, days) {
  const w = ctx.w;
  const p = personById(w, personaId);
  if (!p?.agent) throw new BankError('Pessoa não encontrada');
  amount = Math.round(Number(amount)); days = clamp(Math.round(Number(days) || 7), 1, 30);
  if (!(amount >= 10)) throw new BankError('Valor mínimo: 10 NXC');
  const a = p.agent; const u = a.user;
  const t = relType({ aff: u.aff, bond: u.bond, met: Boolean(u.metAt) });
  const firstName = p.name.split(' ')[0];
  const reply = (decision, text, extra = {}) => ({ id: uid(), personaId: p.id, persona: { id: p.id, name: p.name, avatar: p.avatar, color: p.color }, requested: amount, days, decision, text: genderize(p, text), at: nowIso(), ...extra });
  // pedir "por fora", sem relação, é sempre negado
  if (!p.friend && !['amigo', 'melhor-amigo', 'namoro', 'casado', 'familia', 'colega'].includes(t)) {
    bumpUser(ctx, p, -2, {});
    return reply('negado', pick(['Desculpa, mas a gente nem se conhece direito. Não empresto dinheiro assim.', 'Hã? Por que eu emprestaria dinheiro pra você?']));
  }
  const history = loans(w).filter((l) => l.lenderId === p.id && l.borrower === 'me');
  const defaulted = history.filter((l) => l.status === 'calote').length;
  const open = history.filter((l) => l.status === 'aberto');
  if (defaulted) { bumpUser(ctx, p, -3, {}); return reply('recusado', 'Da última vez você não me pagou. Não dá.'); }
  if (open.length) return reply('recusado', `Você ainda me deve ${open.reduce((s, l) => s + l.amount, 0)} NXC. Paga primeiro, depois a gente conversa.`);
  const reserve = 300 + (a.broke ? 1000 : 0);
  const capacity = Math.max(0, Math.floor(a.cash - reserve));
  if (capacity < 20) return reply('sem-dinheiro', pick(['Eu queria muito te ajudar, mas tô zerada(o) esse mês.', `Sério, ${userName(ctx)}, tô devendo até o aluguel. Não tenho.`]));
  const generosity = a.traits.honesty * 0.5 + a.traits.sociability * 0.5;
  const owesUser = (a.debtToUser || 0) > 0 ? 0.35 : 0;
  const willing = (u.aff / 100) * 0.55 + (u.trust / 100) * 0.35 + generosity * 0.3 + owesUser - (amount > a.cash * 0.5 ? 0.25 : 0);
  if (willing < 0.3) { bumpUser(ctx, p, -1, {}); return reply('recusado', pick(['Ah... não vai dar, desculpa.', 'Agora não consigo. Tenta outra pessoa?'])); }
  const offer = Math.min(amount, Math.floor(capacity * Math.min(1, willing * 1.3) / 10) * 10 || capacity);
  const strictDays = u.trust < 55 ? Math.min(days, 5) : days;
  const interest = u.trust < 45 ? 0.05 : 0;
  const decision = offer >= amount ? (strictDays < days || interest ? 'condicoes' : 'aceito') : 'parcial';
  const text = decision === 'aceito' ? pick([`Claro! Te mando ${offer} NXC. Me devolve em ${days} dias, beleza?`, `Pode contar comigo. ${offer} NXC, sem pressa até ${days} dias.`])
    : decision === 'parcial' ? `Os ${amount} não dá, mas consigo ${offer} NXC. Serve?`
      : `Te empresto, mas preciso de volta em ${strictDays} dias${interest ? ' e com um pouquinho a mais (5%), porque também tô apertada(o)' : ''}.`;
  const proposal = reply(decision, text, { offer, dueDays: strictDays, interest, expiresAt: new Date(Date.now() + 20 * MIN).toISOString() });
  w.p2pProposals ??= []; w.p2pProposals.push(proposal); cap(w.p2pProposals, 20);
  return proposal;
}
export function acceptFriendLoan(ctx, proposalId) {
  const w = ctx.w;
  const pr = (w.p2pProposals || []).find((x) => x.id === proposalId);
  if (!pr || !pr.offer) throw new BankError('Proposta não encontrada');
  if (pr.expiresAt < nowIso()) throw new BankError('A pessoa mudou de ideia (proposta expirada). Peça de novo.');
  const p = personById(w, pr.personaId);
  if (!p?.agent || p.agent.cash < pr.offer) throw new BankError(`${p?.name || 'A pessoa'} não tem mais esse dinheiro.`);
  w.p2pProposals = w.p2pProposals.filter((x) => x.id !== pr.id);
  p.agent.cash = round2(p.agent.cash - pr.offer);
  credit(w, pr.offer, `Empréstimo de ${p.name}`, ctx.at, 'emprestimo-amigo');
  const loan = { id: uid(), lenderId: p.id, borrower: 'me', amount: round2(pr.offer * (1 + pr.interest)), principal: pr.offer, at: ctx.at.toISOString(), due: new Date(ctx.at.getTime() + pr.dueDays * DAY).toISOString(), status: 'aberto', reminders: 0 };
  loans(w).push(loan); cap(loans(w), 200);
  remember(p, `Emprestei ${pr.offer} NXC para ${userName(ctx)}. Vence em ${new Date(loan.due).toLocaleDateString('pt-BR')}.`);
  record(ctx, { type: 'emprestimo-amigo', cat: 'pessoal', title: `${p.name} emprestou ${pr.offer} NXC para você`, actors: [p.id, 'me'], importance: 1 });
  return loan;
}
export function repayFriendLoan(ctx, loanId) {
  const w = ctx.w;
  const l = loans(w).find((x) => x.id === loanId && x.borrower === 'me');
  if (!l || l.status === 'pago') throw new BankError('Empréstimo não encontrado ou já pago');
  const p = personById(w, l.lenderId);
  debit(w, l.amount, `Devolução do empréstimo de ${p?.name || 'amigo'}`, ctx.at, 'emprestimo-amigo');
  if (p?.agent) p.agent.cash = round2(p.agent.cash + l.amount);
  const late = ctx.at.toISOString() > l.due;
  const wasCalote = l.status === 'calote';
  l.status = 'pago'; l.paidAt = ctx.at.toISOString();
  if (p) {
    bumpUser(ctx, p, late ? 3 : 8, { trust: late ? 5 : 15, contact: true, note: late ? `${userName(ctx)} me pagou, mas atrasou.` : `${userName(ctx)} me pagou certinho no prazo.` });
    if (wasCalote) { p.agent.user.bond = undefined; }
    dm(ctx, p, genderize(p, late ? 'Recebi. Demorou, hein... mas obrigada(o).' : 'Recebi! Obrigada(o) por pagar certinho 🙏'), 'emprestimo');
  }
  return l;
}
onDaily((ctx) => {
  const w = ctx.w;
  for (const l of loans(w).filter((x) => x.status === 'aberto' || x.status === 'atrasado')) {
    const lender = l.lenderId === 'me' ? null : personById(w, l.lenderId);
    const borrower = l.borrower === 'me' ? null : personById(w, l.borrower);
    if (ctx.at.toISOString() < l.due) continue;
    const daysLate = Math.floor((ctx.at - new Date(l.due)) / DAY);
    if (l.borrower === 'me' && lender) {
      l.status = 'atrasado';
      if ([0, 2, 6].includes(daysLate)) {
        l.reminders++;
        bumpUser(ctx, lender, -4, { trust: -8, note: `${userName(ctx)} está atrasando o empréstimo que eu fiz.` });
        lender.mood = { emotion: 'irritada', intensity: 0.6, reason: 'um empréstimo não devolvido' };
        dm(ctx, lender, genderize(lender, [`Oi! Lembra dos ${l.amount} NXC? Venceu hoje.`, `Ainda tô esperando os ${l.amount} NXC... preciso desse dinheiro.`, 'Tô muito decepcionada(o). Você sumiu com meu dinheiro.'][Math.min(2, l.reminders - 1)]), 'cobranca');
      }
      if (daysLate >= 10) {
        l.status = 'calote';
        bumpUser(ctx, lender, -30, { trust: -40, note: `${userName(ctx)} me deu calote de ${l.amount} NXC.` });
        record(ctx, { type: 'calote', cat: 'pessoal', title: `${lender.name} rompe com você por causa de uma dívida`, text: `${l.amount} NXC nunca devolvidos.`, actors: [lender.id, 'me'], importance: 2 });
        worldPost(ctx, lender, genderize(lender, 'Lição do dia: nunca empreste dinheiro achando que é amizade.'), { kind: 'indireta' });
        if (lender.agent.traits.honesty > 0.45 && l.amount >= 150) services.openCase(ctx, { type: 'calote', suspect: { type: 'user', id: 'me' }, plaintiff: lender.id, amount: l.amount, desc: `${lender.name} cobra na Justiça ${l.amount} NXC emprestados e não devolvidos.` });
        account(w).reputation = clamp(account(w).reputation - 4, 0, 100);
      }
    } else if (lender && borrower && l.status !== 'pago') {
      // entre personagens: devolve se puder; se não, a amizade sofre
      if (borrower.agent.cash > l.amount + 200 && borrower.agent.traits.honesty > 0.25) {
        borrower.agent.cash = round2(borrower.agent.cash - l.amount); lender.agent.cash = round2(lender.agent.cash + l.amount); l.status = 'pago';
        bump(ctx, lender, borrower, 4, { trust: 6, reason: 'pagou o empréstimo' });
      } else if (daysLate >= 7) {
        l.status = 'calote';
        bump(ctx, lender, borrower, -25, { trust: -30, reason: 'não devolveu o dinheiro' });
        remember(lender, `${borrower.name} não me devolveu ${l.amount} NXC.`);
      }
    }
  }
});
// pessoas sem dinheiro pedem a quem confiam
registerAction({
  name: 'pedir-emprestado',
  weight: (ctx, p) => (p.agent.cash < 150 && !loans(ctx.w).some((l) => l.borrower === p.id && ['aberto', 'atrasado'].includes(l.status)) ? 0.5 : 0),
  run(ctx, p) {
    const w = ctx.w;
    const friends = Object.entries(p.agent.rel).filter(([, r]) => r.aff > 30 && r.trust > 45).map(([id]) => personById(w, id)).filter((q) => q?.agent && active(q) && q.agent.cash > 800);
    const lender = friends.sort((a, b) => b.agent.cash - a.agent.cash)[0];
    if (!lender) return;
    const amount = Math.min(400 + rnd(600), Math.floor(lender.agent.cash * 0.3));
    const r = rel(lender, p.id);
    if (r.trust < 50 || lender.agent.traits.honesty * 0.6 + r.aff / 200 < 0.45) { bump(ctx, p, lender, -2, { reason: 'negou um empréstimo' }); return; }
    lender.agent.cash = round2(lender.agent.cash - amount); p.agent.cash = round2(p.agent.cash + amount);
    loans(w).push({ id: uid(), lenderId: lender.id, borrower: p.id, amount, principal: amount, at: ctx.at.toISOString(), due: new Date(ctx.at.getTime() + (5 + rnd(10)) * DAY).toISOString(), status: 'aberto' });
    remember(p, `${lender.name} me emprestou ${amount} NXC.`); remember(lender, `Emprestei ${amount} NXC para ${p.name}.`);
    bump(ctx, p, lender, 5, { trust: 3, reason: 'emprestou dinheiro' });
  },
});

// ---------------------------------------------------------------- vaquinha (fiscalizada)
export const VAQUINHA_MOTIVOS = { aluguel: 'Aluguel/dívidas atrasadas', negocio: 'Abrir um negócio', estudos: 'Pagar os estudos', saude: 'Emergência de saúde', amigo: 'Ajudar um amigo' };
export function createVaquinha(ctx, { title, motivo, goal, pixKey, friendId }) {
  const w = ctx.w; const u = account(w);
  if (!VAQUINHA_MOTIVOS[motivo]) throw new BankError('Escolha o motivo');
  goal = Math.round(Number(goal));
  if (!(goal >= 100 && goal <= 50000)) throw new BankError('Meta entre 100 e 50.000 NXC');
  if (!/^[\w.@+-]{3,40}$/.test(String(pixKey || ''))) throw new BankError('Informe uma chave Pix válida (3 a 40 caracteres)');
  w.vaquinhas ??= [];
  if (w.vaquinhas.some((v) => v.status === 'ativa')) throw new BankError('Você já tem uma vaquinha ativa');
  const v = { id: uid(), title: str(title, 80) || VAQUINHA_MOTIVOS[motivo], motivo, goal, pixKey, friendId: friendId || null, raised: 0, donors: [], status: 'ativa', at: ctx.at.toISOString(), auditAt: new Date(ctx.at.getTime() + 12 * HOUR).toISOString() };
  w.vaquinhas.push(v); cap(w.vaquinhas, 30);
  schedule(ctx, new Date(v.auditAt), 'vaquinha-auditoria', { id: v.id });
  record(ctx, { type: 'vaquinha', cat: 'sociedade', title: `${userName(ctx)} criou uma vaquinha: ${v.title}`, text: `Meta de ${goal.toLocaleString('pt-BR')} NXC. Chave Pix: ${pixKey}.`, actors: ['me'], importance: 1 });
  return v;
}
onHourly((ctx) => {
  const w = ctx.w;
  for (const v of (w.vaquinhas || []).filter((x) => x.status === 'ativa' && x.raised < x.goal)) {
    for (const p of people(w).filter((x) => x.agent && active(x)).sort(() => Math.random() - 0.5).slice(0, 4)) {
      const a = p.agent; const aff = a.user.aff;
      if (v.donors.includes(p.id) || a.cash < 200) continue;
      const empathy = ({ saude: 0.35, amigo: 0.2, estudos: 0.15, aluguel: 0.1, negocio: 0 })[v.motivo];
      if (!chance(clamp(aff / 120 + empathy + a.traits.sociability * 0.15 - 0.2, 0, 0.8))) continue;
      const amount = Math.min(Math.round(10 + a.cash * (0.01 + Math.max(0, aff) / 2000)), v.goal - v.raised);
      if (amount < 5) continue;
      a.cash = round2(a.cash - amount); v.raised = round2(v.raised + amount); v.donors.push(p.id);
      // vai para saldo BLOQUEADO até a fiscalização liberar
      block(w, amount, `Vaquinha "${v.title}"`, `vaquinha:${v.id}`);
      v.gifts ??= []; v.gifts.push({ personaId: p.id, amount });
      remember(p, `Doei ${amount} NXC na vaquinha de ${userName(ctx)} (${v.title}).`);
    }
  }
});
// auditoria: a polícia confere o motivo com o que realmente aconteceu
handle('vaquinha-auditoria', (ctx, { id }) => {
  const w = ctx.w; const u = account(w);
  const v = (w.vaquinhas || []).find((x) => x.id === id);
  if (!v || v.status !== 'ativa') return;
  const b = bankOf(w);
  const since = new Date(new Date(v.at).getTime() - 15 * DAY).toISOString();
  const facts = {
    aluguel: () => b.debts.some((d) => d.status !== 'paga') || b.contracts.some((c) => c.schedule.some((i) => i.status === 'atrasada')) || (w.p2p || []).some((l) => l.borrower === 'me' && l.status !== 'pago'),
    negocio: () => companies(w).some((c) => c.founderId === 'me' && c.foundedAt > since),
    estudos: () => Boolean(u.studying),
    saude: () => false, // não existe registro de emergência médica do usuário na cidade
    amigo: () => { const p = personById(w, v.friendId); return Boolean(p && (p.agent?.broke || p.agent?.cash < 300 || p.problem)); },
  };
  const truthful = facts[v.motivo]?.() || false;
  const recent = (w.vaquinhas || []).filter((x) => x.at > new Date(ctx.at.getTime() - 30 * DAY).toISOString()).length;
  const record_ = (w.justice?.record || []).length;
  const suspicious = !truthful || recent >= 3 || (record_ >= 2 && v.raised > 1000);
  v.auditedAt = ctx.at.toISOString(); v.truthful = truthful;
  if (!suspicious) {
    v.status = 'liberada';
    unblock(w, `vaquinha:${v.id}`, { at: ctx.at, desc: `Vaquinha "${v.title}" liberada pela fiscalização` });
    record(ctx, { type: 'vaquinha-liberada', cat: 'sociedade', title: `Vaquinha "${v.title}" aprovada na fiscalização`, text: `${v.raised.toLocaleString('pt-BR')} NXC liberados.`, actors: ['me'], importance: 1 });
    if (ctx.live) notify(ctx.uid, { type: 'system', title: '✅ Vaquinha liberada', message: `${v.raised.toLocaleString('pt-BR')} NXC foram para o seu saldo.`, link: '#/banco' });
    return;
  }
  // fraude: devolve aos doadores e a polícia abre caso
  v.status = 'bloqueada';
  unblock(w, `vaquinha:${v.id}`, { release: false });
  for (const g of v.gifts || []) { const p = personById(w, g.personaId); if (p?.agent) { p.agent.cash = round2(p.agent.cash + g.amount); bumpUser(ctx, p, -10, { trust: -20, note: `A vaquinha de ${userName(ctx)} era golpe. Recebi meu dinheiro de volta.` }); } }
  services.openCase(ctx, { type: 'estelionato', suspect: { type: 'user', id: 'me' }, reporter: 'policia', desc: `Vaquinha "${v.title}" com motivo não comprovado (${VAQUINHA_MOTIVOS[v.motivo]}). ${v.raised.toLocaleString('pt-BR')} NXC arrecadados e devolvidos aos doadores.`,
    evidence: [{ kind: 'auditoria', desc: 'Motivo da vaquinha não confere com os registros da cidade', strength: truthful ? 0.25 : 0.55 }, { kind: 'bancario', desc: 'Movimentação bancária da chave Pix informada', strength: 0.3 }] });
  record(ctx, { type: 'vaquinha-fraude', cat: 'seguranca', title: `Polícia bloqueia vaquinha de ${userName(ctx)} por suspeita de golpe`, text: `Motivo alegado: ${VAQUINHA_MOTIVOS[v.motivo]}. Dinheiro devolvido a ${v.donors.length} doador(es).`, actors: ['me'], importance: 3 });
  if (ctx.live) notify(ctx.uid, { type: 'system', title: '🚨 Vaquinha bloqueada pela polícia', message: 'O motivo não foi comprovado. O dinheiro voltou para os doadores e um inquérito foi aberto.', link: '#/policia' });
});

// ---------------------------------------------------------------- trabalhos avulsos (freelas)
const GIGS = [
  ['tecnologia', 'Arrumar o site de uma loja', 'Um cliente reclama que o site está lento.', ['Otimizar as imagens e o cache', 'Reescrever tudo do zero', 'Dizer que está bom assim'], 0, [120, 260]],
  ['publicidade', 'Criar um logotipo', 'O dono quer algo "moderno, mas clássico".', ['Mostrar 3 opções simples e ouvir', 'Entregar uma única versão cheia de efeitos', 'Copiar um logo famoso'], 0, [90, 200]],
  ['alimentacao', 'Entregas no horário de pico', 'Chuva forte e cinco pedidos atrasados.', ['Organizar a rota pelo mapa', 'Entregar na ordem que chegaram', 'Desistir de dois pedidos'], 0, [60, 140]],
  ['varejo', 'Inventário de estoque', 'A contagem não bate com o sistema.', ['Recontar por setor com planilha', 'Ajustar o sistema para bater', 'Ignorar a diferença'], 0, [70, 150]],
  ['construcao', 'Ajudar numa mudança', 'Um sofá não passa pela porta.', ['Desmontar os pés e girar', 'Forçar até passar', 'Deixar o sofá na rua'], 0, [80, 160]],
  ['midia', 'Fotografar um evento', 'A luz do salão é muito fraca.', ['Subir o ISO e usar luz rebatida', 'Usar flash direto em todos', 'Fotografar só a decoração'], 0, [100, 220]],
  ['saude', 'Recepção num mutirão de saúde', 'Fila longa e pessoas nervosas.', ['Organizar senhas por prioridade', 'Chamar por ordem de chegada', 'Fechar a porta'], 0, [70, 130]],
];
export const gigs = (w) => (w.gigs ??= []);
function makeGigs(ctx, odds = 0.35) {
  const w = ctx.w;
  gigs(w).splice(0, gigs(w).length, ...gigs(w).filter((g) => g.status !== 'aberto' || g.until > ctx.at.toISOString()));
  for (const c of companies(w).filter((x) => x.status === 'ativa' && x.cash > 3000 && x.founderId !== 'me')) {
    if (!chance(odds)) continue;
    const tpl = GIGS.find((g) => g[0] === c.sector) || pick(GIGS);
    // as opções aparecem embaralhadas: a certa não é sempre a primeira
    const order = tpl[3].map((_, i) => i).sort(() => Math.random() - 0.5);
    gigs(w).push({ id: uid(), companyId: c.id, title: tpl[1], text: tpl[2], options: order.map((i) => tpl[3][i]), best: order.indexOf(tpl[4]), pay: Math.round((tpl[5][0] + rnd(tpl[5][1] - tpl[5][0])) * (w.eco?.cpi || 1)), at: ctx.at.toISOString(), until: new Date(ctx.at.getTime() + 2 * DAY).toISOString(), status: 'aberto' });
  }
  cap(gigs(w), 30);
}
onDaily((ctx) => makeGigs(ctx));
onUpgrade(6, (ctx) => makeGigs(ctx, 0.6)); // primeiros freelas logo na chegada
export function doGig(ctx, gigId, choice) {
  const w = ctx.w;
  const g = gigs(w).find((x) => x.id === gigId);
  if (!g || g.status !== 'aberto') throw new BankError('Esse trabalho não está mais disponível');
  const c = companyById(w, g.companyId);
  if (!c || c.status === 'falida') { g.status = 'cancelado'; throw new BankError('A empresa não existe mais'); }
  const good = Number(choice) === g.best;
  const pay = good ? g.pay : Math.round(g.pay * 0.4);
  if (c.cash < pay) { g.status = 'cancelado'; throw new BankError(`${c.name} está sem caixa para pagar. O trabalho foi cancelado.`); }
  c.cash = round2(c.cash - pay);
  g.status = 'feito'; g.doneAt = ctx.at.toISOString(); g.good = good;
  credit(w, pay, `Trabalho avulso: ${g.title} (${c.name})`, ctx.at, 'freela');
  const u = account(w); u.reputation = clamp(u.reputation + (good ? 1 : -1), 0, 100);
  const ceo = personById(w, c.ceoId); if (ceo) bumpUser(ctx, ceo, good ? 2 : -2, { note: good ? `${userName(ctx)} fez um bom trabalho avulso para a ${c.name}.` : `${userName(ctx)} entregou um trabalho fraco para a ${c.name}.` });
  return { good, pay, company: c.name };
}

// ---------------------------------------------------------------- atualização 3: contas novas e antigas
onUpgrade(3, (ctx) => {
  account(ctx.w);
  // quem já tinha conta continua com o saldo; as regras novas (senha, score) valem daqui em diante
});
export { once };
