// CRIME & JUSTICE ENGINE — polícia e justiça independentes do usuário.
// Casos criminais: ocorrência → investigação (provas somadas; sem prova suficiente, arquiva) → intimação para depor
// (não comparecer agrava) → multa administrativa ou processo → audiência → sentença. Casos civis (calote entre
// amigos, execução de dívida bancária): citação → acordo possível → audiência → condenação a pagar quem cobrou.
// Ninguém é punido sem provas. Penalidades são configuráveis. Policiais, investigadores e a juíza são moradores.
import { onDaily, onUpgrade, handle, record, schedule, services } from './core.js';
import { residents, personById, agentOf, bumpUser, userName, dm } from './agents.js';
import { account, bankOf, addDebt, payDebt, debit, credit, verifyPin, BankError } from './bank.js';
import { companies, eco } from './economy.js';
import { places } from './commerce.js';
import { genderize, worldPost, remember } from '../social.js';
import { notify } from '../notify.js';
import { rnd, pick, chance, clamp, uid, nowIso, DAY, HOUR, round2, cap, str, shuffle } from './util.js';

export const DEFAULT_PENALTIES = {
  estelionato: { label: 'Estelionato', kind: 'criminal', sev: 3, fine: 2500 },
  furto: { label: 'Furto', kind: 'criminal', sev: 2, fine: 800 },
  vandalismo: { label: 'Vandalismo', kind: 'criminal', sev: 1, fine: 500 },
  invasao: { label: 'Invasão de propriedade', kind: 'criminal', sev: 2, fine: 900 },
  golpe: { label: 'Golpe digital', kind: 'criminal', sev: 2, fine: 1500 },
  desobediencia: { label: 'Desobediência', kind: 'criminal', sev: 1, fine: 400 },
  calote: { label: 'Cobrança de dívida entre pessoas', kind: 'civil', sev: 1, fine: 0 },
  execucao: { label: 'Execução de dívida bancária', kind: 'civil', sev: 1, fine: 0 },
  'dano-locacao': { label: 'Cobrança de danos em carro alugado', kind: 'civil', sev: 1, fine: 0 },
};
export const STATUS_LABEL = { aberto: 'Ocorrência registrada', investigacao: 'Em investigação', intimado: 'Intimação para depor', decisao: 'Aguardando decisão', processo: 'Processo na Justiça', citado: 'Citação (ação civil)', arquivado: 'Arquivado', multa: 'Multa aplicada', condenado: 'Condenado(a)', absolvido: 'Absolvido(a)', acordo: 'Encerrado por acordo', preso: 'Prisão' };

export function justice(w) {
  w.justice ??= { officers: [], judgeId: null, cases: [], record: [], cfg: { penalties: {} }, seq: 0 };
  return w.justice;
}
export const penalty = (w, type) => ({ ...DEFAULT_PENALTIES[type], ...(justice(w).cfg.penalties[type] || {}) });
const who = (w, s) => (s?.type === 'user' || s === 'me' ? { id: 'me', name: 'Você' } : s?.type === 'banco' || s === 'banco' ? { id: 'banco', name: 'Banco Nexus' } : s === 'locadora' ? { id: 'locadora', name: 'Locadora Nexus Rent' } : s === 'policia' ? { id: 'policia', name: 'Polícia de Nexus City' } : (() => { const p = personById(w, s?.id || s); return p ? { id: p.id, name: p.name, avatar: p.avatar, color: p.color } : { id: s?.id || s, name: (w.gone || {})[s?.id || s] || '—' }; })());

// ---------------------------------------------------------------- estrutura: delegacia, policiais e juíza
// monta (e recompõe) a equipe: juíza(iz) e policiais que faltarem — quem saiu da cidade ou foi presa(o) é substituída(o)
function staffJustice(ctx) {
  const w = ctx.w; const J = justice(w);
  const ok = (id) => { const p = personById(w, id); return p?.agent && p.agent.resident !== false && p.agent.status === 'ativo'; };
  J.officers = J.officers.filter((o) => ok(o.personaId));
  if (J.judgeId && !ok(J.judgeId)) J.judgeId = null;
  const taken = new Set([J.judgeId, ...J.officers.map((o) => o.personaId)]);
  const pool = shuffle(residents(w).filter((p) => p.agent.traits.honesty > 0.45 && p.age >= 24 && !p.agent.office && !p.agent.partyLeader && !/CEO|dono/i.test(p.agent.role || '')));
  // a juíza é escolhida primeiro (a pessoa mais íntegra e experiente)
  for (let i = pool.length - 1; i >= 0; i--) if (taken.has(pool[i].id)) pool.splice(i, 1);
  const judge = J.judgeId ? null : (pool.filter((p) => p.age >= 35).sort((a, b) => b.agent.traits.honesty - a.agent.traits.honesty)[0] || pool[0]);
  if (judge) pool.splice(pool.indexOf(judge), 1);
  const ranks = [['delegado', 'delegada(o)'], ['investigador', 'investigador(a)'], ['investigador', 'investigador(a)'], ['patrulha', 'policial'], ['patrulha', 'policial'], ['patrulha', 'policial']];
  const have = J.officers.map((o) => o.rank);
  const missing = ranks.filter(([r]) => { const i = have.indexOf(r); if (i >= 0) { have.splice(i, 1); return false; } return true; });
  for (const [rank, title] of missing) {
    const p = pool.shift(); if (!p) break;
    const a = agentOf(w, p);
    const c = companies(w).find((x) => x.id === a.companyId);
    if (c) c.employees = c.employees.filter((e) => e.personaId !== p.id);
    Object.assign(a, { companyId: null, role: genderize(p, title), salary: 350, police: rank, keep: true });
    p.job = `${genderize(p, title)} da Polícia de Nexus City`;
    J.officers.push({ personaId: p.id, rank });
  }
  if (judge) { const a = agentOf(w, judge); a.keep = true; a.judge = true; a.role = genderize(judge, 'juiz(a)'); judge.job = `${genderize(judge, 'juiz(a)')} do Fórum de Nexus City`; const c = companies(w).find((x) => x.id === a.companyId); if (c) c.employees = c.employees.filter((e) => e.personaId !== judge.id); a.companyId = null; J.judgeId = judge.id; }
}
onUpgrade(5, staffJustice);
onDaily((ctx) => {
  staffJustice(ctx);
  const w = ctx.w; const e = eco(w);
  // salários públicos saem do tesouro (impostos e multas)
  for (const o of justice(w).officers) { const p = personById(w, o.personaId); if (p?.agent && (e.treasury || 0) >= 350) { p.agent.cash += 350; e.treasury = round2(e.treasury - 350); } }
  const j = personById(w, justice(w).judgeId); if (j?.agent && (e.treasury || 0) >= 600) { j.agent.cash += 600; e.treasury = round2(e.treasury - 600); }
  settle(ctx);
});
const officer = (w, rank) => personById(w, pick(justice(w).officers.filter((o) => o.rank === rank))?.personaId) || personById(w, pick(justice(w).officers)?.personaId);

// ---------------------------------------------------------------- abertura de casos
export function openCase(ctx, { type, suspect, plaintiff = 'policia', victimId = null, desc, evidence = [], amount = 0, storyId = null, placeId = null }) {
  const w = ctx.w; const J = justice(w);
  const pen = penalty(w, type);
  if (!pen.label) return null;
  const c = { id: uid(), n: ++J.seq, type, kind: pen.kind, suspect, plaintiff, victimId, desc: str(desc, 400), evidence: evidence.map((e) => ({ ...e, at: ctx.at.toISOString() })), amount: round2(amount),
    status: pen.kind === 'civil' ? 'citado' : 'aberto', at: ctx.at.toISOString(), storyId: storyId || uid(), placeId, timeline: [], investigatorId: null };
  const tl = (text) => c.timeline.push({ at: ctx.at.toISOString(), text });
  J.cases.push(c); cap(J.cases, 300);
  const suspectName = who(w, suspect).name;
  if (pen.kind === 'civil') {
    tl(`Ação de ${pen.label.toLowerCase()} proposta por ${who(w, plaintiff).name}: ${c.amount.toLocaleString('pt-BR')} NXC.`);
    c.hearingAt = new Date(ctx.at.getTime() + DAY).toISOString();
    schedule(ctx, new Date(c.hearingAt), 'caso-audiencia', { id: c.id });
    if (suspect.type === 'user' && ctx.live !== false) notify(ctx.uid, { type: 'system', title: `⚖️ Citação: processo nº ${c.n}`, message: `${who(w, plaintiff).name} cobra ${c.amount.toLocaleString('pt-BR')} NXC na Justiça. Audiência em ${new Date(c.hearingAt).toLocaleString('pt-BR')}. Você pode fazer acordo antes.`, link: '#/justica' });
  } else {
    const inv = officer(w, 'investigador');
    c.investigatorId = inv?.id || null;
    tl(`Ocorrência registrada${plaintiff !== 'policia' ? ` por ${who(w, plaintiff).name}` : ''}. ${inv ? `Investigação com ${inv.name}.` : ''}`);
    schedule(ctx, new Date(ctx.at.getTime() + (2 + rnd(5)) * HOUR), 'caso-investigar', { id: c.id });
  }
  record(ctx, { type: 'ocorrencia', cat: pen.kind === 'civil' ? 'justica' : 'seguranca', title: pen.kind === 'civil' ? `Processo nº ${c.n}: ${who(w, plaintiff).name} aciona ${suspectName} na Justiça` : `Polícia abre inquérito nº ${c.n} (${pen.label.toLowerCase()})`, text: c.desc, actors: [suspect.type === 'user' ? 'me' : suspect.id, typeof plaintiff === 'string' && personById(w, plaintiff) ? plaintiff : null].filter(Boolean), importance: pen.kind === 'civil' ? 1 : 2, storyId: c.storyId, data: { caseId: c.id }, refs: placeId ? [{ t: 'place', id: placeId }] : [] });
  return c;
}
services.openCase = openCase;

const strength = (c) => clamp(c.evidence.reduce((s, e) => s + (e.strength || 0), 0), 0, 1);
handle('caso-investigar', (ctx, { id }) => {
  const w = ctx.w; const c = justice(w).cases.find((x) => x.id === id);
  if (!c || c.status !== 'aberto') return;
  c.status = 'investigacao';
  const inv = personById(w, c.investigatorId);
  // provas que já estão nos registros da cidade
  if (c.suspect.type === 'persona') {
    const crimes = (w.events || []).filter((e) => e.cat === 'seguranca' && e.actors.includes(c.suspect.id) && e.at > new Date(ctx.at.getTime() - 15 * DAY).toISOString());
    if (crimes.length) c.evidence.push({ kind: 'registros', desc: `${crimes.length} registro(s) policiais envolvendo a pessoa`, strength: 0.25, at: ctx.at.toISOString() });
  }
  if (inv?.agent) c.evidence.push({ kind: 'diligencia', desc: `Diligências de ${inv.name}`, strength: round2(clamp((inv.agent.skill - 1) * 0.15, 0, 0.12)), at: ctx.at.toISOString() });
  const E = strength(c);
  c.timeline.push({ at: ctx.at.toISOString(), text: `Investigação concluída: força das provas ${Math.round(E * 100)}%.` });
  if (E < 0.4) {
    c.status = 'arquivado';
    c.timeline.push({ at: ctx.at.toISOString(), text: 'Arquivado por falta de provas.' });
    record(ctx, { type: 'arquivamento', cat: 'seguranca', title: `Inquérito nº ${c.n} arquivado por falta de provas`, actors: [c.suspect.type === 'user' ? 'me' : c.suspect.id], importance: 1, storyId: c.storyId });
    return;
  }
  if (c.suspect.type === 'user') {
    c.status = 'intimado'; c.deadline = new Date(ctx.at.getTime() + DAY).toISOString();
    c.timeline.push({ at: ctx.at.toISOString(), text: `Intimação expedida: comparecer para depor até ${new Date(c.deadline).toLocaleString('pt-BR')}.` });
    schedule(ctx, new Date(c.deadline), 'caso-prazo', { id: c.id });
    if (ctx.live !== false) notify(ctx.uid, { type: 'system', title: `📜 Intimação: inquérito nº ${c.n}`, message: `A Polícia de Nexus City quer ouvir você sobre: ${c.desc} Responda em até 24 h.`, link: '#/justica' });
    record(ctx, { type: 'intimacao', cat: 'seguranca', title: `Você foi intimado(a) a depor no inquérito nº ${c.n}`, actors: ['me', inv?.id].filter(Boolean), importance: 2, storyId: c.storyId });
  } else decide(ctx, c);
});
export function testify(ctx, caseId, versao) {
  const w = ctx.w; const c = justice(w).cases.find((x) => x.id === caseId && x.suspect.type === 'user');
  if (!c || c.status !== 'intimado') throw new BankError('Não há intimação aberta para este caso');
  if (!['confessar', 'negar', 'silencio'].includes(versao)) throw new BankError('Escolha como vai depor');
  c.testimony = versao;
  c.timeline.push({ at: ctx.at.toISOString(), text: { confessar: 'Você compareceu e confessou.', negar: 'Você compareceu e negou as acusações.', silencio: 'Você compareceu e ficou em silêncio.' }[versao] });
  const inv = personById(w, c.investigatorId); if (inv && versao === 'confessar') bumpUser(ctx, inv, 3, { note: `${userName(ctx)} colaborou com a investigação.` });
  c.status = 'decisao';
  schedule(ctx, new Date(ctx.at.getTime() + HOUR), 'caso-decidir', { id: c.id });
  return c;
}
handle('caso-prazo', (ctx, { id }) => {
  const c = justice(ctx.w).cases.find((x) => x.id === id);
  if (!c || c.status !== 'intimado') return;
  c.testimony = 'ausente';
  c.evidence.push({ kind: 'ausencia', desc: 'Não compareceu à intimação', strength: 0.05, at: ctx.at.toISOString() });
  c.timeline.push({ at: ctx.at.toISOString(), text: 'Prazo encerrado sem depoimento (desobediência).' });
  c.aggravated = true;
  decide(ctx, c);
});
handle('caso-decidir', (ctx, { id }) => { const c = justice(ctx.w).cases.find((x) => x.id === id); if (c && c.status === 'decisao') decide(ctx, c); });

function priors(w) { return justice(w).record.filter((r) => r.kind === 'criminal').length; }
function decide(ctx, c) {
  const w = ctx.w; const pen = penalty(w, c.type); const E = strength(c);
  if (c.suspect.type === 'persona') {
    const p = personById(w, c.suspect.id);
    if (!p?.agent) { c.status = 'arquivado'; return; }
    if (E >= 0.5) {
      c.status = 'preso';
      p.agent.status = 'preso'; p.agent.statusUntil = new Date(ctx.at.getTime() + (1 + pen.sev + rnd(3)) * DAY).toISOString();
      const fine = Math.min(p.agent.cash, pen.fine); p.agent.cash = round2(p.agent.cash - fine); eco(w).treasury = round2((eco(w).treasury || 0) + fine);
      c.timeline.push({ at: ctx.at.toISOString(), text: `Prisão determinada e multa de ${fine.toLocaleString('pt-BR')} NXC.` });
      remember(p, `Fui presa(o) (inquérito nº ${c.n}).`);
      { const sh = p.agent.sheet ??= { crimes: [], prisoes: 0, reincidencia: 0, situacao: 'sem antecedentes' }; sh.prisoes += 1; sh.situacao = 'preso(a)'; sh.lastPrisao = ctx.at.toISOString(); }
      record(ctx, { type: 'prisao', cat: 'seguranca', title: `${p.name} é ${genderize(p, 'presa(o)')} (${pen.label.toLowerCase()})`, actors: [p.id], importance: 3, storyId: c.storyId });
    } else { c.status = 'arquivado'; c.timeline.push({ at: ctx.at.toISOString(), text: 'Provas insuficientes para prisão. Arquivado.' }); }
    return;
  }
  const rec = priors(w);
  const sev = pen.sev - (c.testimony === 'confessar' ? 1 : 0) + (c.aggravated ? 1 : 0);
  if (sev >= 3 && E >= 0.55) {
    c.status = 'processo'; c.hearingAt = new Date(ctx.at.getTime() + DAY).toISOString();
    c.timeline.push({ at: ctx.at.toISOString(), text: `Caso enviado à Justiça. Audiência em ${new Date(c.hearingAt).toLocaleString('pt-BR')}.` });
    schedule(ctx, new Date(c.hearingAt), 'caso-audiencia', { id: c.id });
    if (ctx.live !== false) notify(ctx.uid, { type: 'system', title: `⚖️ Processo nº ${c.n}`, message: 'Seu caso foi para a Justiça. Acompanhe a audiência.', link: '#/justica' });
    record(ctx, { type: 'denuncia-mp', cat: 'justica', title: `Inquérito nº ${c.n} vira processo na Justiça`, actors: ['me'], importance: 2, storyId: c.storyId });
    return;
  }
  const fine = round2(pen.fine * (1 + 0.5 * rec) * (c.testimony === 'confessar' ? 0.7 : 1) * (c.aggravated ? 1.25 : 1) * (eco(w).cpi || 1));
  c.status = 'multa'; c.fine = fine;
  addDebt(w, { kind: 'multa', amount: fine, desc: `Multa — inquérito nº ${c.n} (${pen.label.toLowerCase()})`, dueDays: 5, ref: `caso:${c.id}`, creditor: 'Prefeitura de Nexus City', at: ctx.at });
  justice(w).record.push({ caseId: c.id, n: c.n, type: c.type, label: pen.label, outcome: 'multa', kind: 'criminal', at: ctx.at.toISOString() });
  account(w).reputation = clamp(account(w).reputation - 6, 0, 100);
  c.timeline.push({ at: ctx.at.toISOString(), text: `Multa administrativa de ${fine.toLocaleString('pt-BR')} NXC (vence em 5 dias).` });
  record(ctx, { type: 'multa', cat: 'seguranca', title: `Você foi multado(a) em ${fine.toLocaleString('pt-BR')} NXC (inquérito nº ${c.n})`, text: c.desc, actors: ['me'], importance: 2, storyId: c.storyId });
  if (ctx.live !== false) notify(ctx.uid, { type: 'system', title: '🧾 Multa aplicada', message: `${fine.toLocaleString('pt-BR')} NXC — pague no app do banco.`, link: '#/banco' });
}

// audiência: criminal (sentença) ou civil (condenação a pagar)
handle('caso-audiencia', (ctx, { id }) => {
  const w = ctx.w; const J = justice(w);
  const c = J.cases.find((x) => x.id === id);
  if (!c || !['processo', 'citado'].includes(c.status)) return;
  const judge = personById(w, J.judgeId);
  const pen = penalty(w, c.type);
  const by = judge ? `${judge.name}` : 'a Justiça';
  if (c.kind === 'civil') {
    const plaintiffName = who(w, c.plaintiff).name;
    if (c.suspect.type === 'user') {
      const amount = round2(c.amount * 1.1);
      c.status = 'condenado'; c.sentence = amount;
      addDebt(w, { kind: 'judicial', amount, desc: `Condenação no processo nº ${c.n} (${pen.label.toLowerCase()}) a favor de ${plaintiffName}`, dueDays: 3, ref: `caso:${c.id}`, creditor: plaintiffName, at: ctx.at });
      const d = bankOf(w).debts.find((x) => x.ref === `caso:${c.id}`); if (d) d.beneficiary = c.plaintiff;
      J.record.push({ caseId: c.id, n: c.n, type: c.type, label: pen.label, outcome: 'condenação civil', kind: 'civil', at: ctx.at.toISOString() });
      account(w).reputation = clamp(account(w).reputation - 5, 0, 100);
      c.timeline.push({ at: ctx.at.toISOString(), text: `${by} condenou você a pagar ${amount.toLocaleString('pt-BR')} NXC (dívida + 10% de custas). Sem pagamento em 3 dias, há penhora do saldo.` });
      record(ctx, { type: 'sentenca', cat: 'justica', title: `Justiça condena ${userName(ctx)} a pagar ${amount.toLocaleString('pt-BR')} NXC a ${plaintiffName}`, actors: ['me', judge?.id].filter(Boolean), importance: 2, storyId: c.storyId });
      if (ctx.live !== false) notify(ctx.uid, { type: 'system', title: `⚖️ Sentença no processo nº ${c.n}`, message: `Você deve ${amount.toLocaleString('pt-BR')} NXC a ${plaintiffName}.`, link: '#/justica' });
    } else {
      // usuário cobrando uma pessoa
      const p = personById(w, c.suspect.id);
      const pay = p?.agent ? round2(Math.min(Math.max(0, p.agent.cash), c.amount)) : 0;
      if (p?.agent && pay > 0) { p.agent.cash = round2(p.agent.cash - pay); p.agent.debtToUser = Math.max(0, (p.agent.debtToUser || 0) - pay); credit(w, pay, `Pagamento determinado pela Justiça (processo nº ${c.n})`, ctx.at, 'judicial'); }
      c.status = 'condenado'; c.sentence = pay;
      if (p) { bumpUser(ctx, p, -25, { trust: -20, note: `${userName(ctx)} me processou e ganhou.` }); }
      c.timeline.push({ at: ctx.at.toISOString(), text: `${by} condenou ${p?.name || 'a pessoa'} a pagar. Valor recuperado: ${pay.toLocaleString('pt-BR')} NXC.` });
      record(ctx, { type: 'sentenca', cat: 'justica', title: `${p?.name || 'Ré(u)'} é condenado(a) a pagar ${userName(ctx)}`, actors: [p?.id, 'me'].filter(Boolean), importance: 2, storyId: c.storyId });
    }
    return;
  }
  const E = strength(c); const rec = priors(w);
  const pConv = clamp(E * 0.85 + rec * 0.05 + (c.testimony === 'confessar' ? 0.2 : 0), 0.05, 0.97);
  if (Math.random() < pConv) {
    const amount = round2(pen.fine * 2 * (1 + 0.5 * rec) * (eco(w).cpi || 1));
    c.status = 'condenado'; c.sentence = amount;
    addDebt(w, { kind: 'judicial', amount, desc: `Sentença do processo nº ${c.n} (${pen.label.toLowerCase()})`, dueDays: 3, ref: `caso:${c.id}`, creditor: 'Justiça de Nexus City', at: ctx.at });
    J.record.push({ caseId: c.id, n: c.n, type: c.type, label: pen.label, outcome: 'condenação', kind: 'criminal', at: ctx.at.toISOString() });
    const u = account(w); u.reputation = clamp(u.reputation - 15, 0, 100);
    c.timeline.push({ at: ctx.at.toISOString(), text: `${by} condenou você: pena de ${amount.toLocaleString('pt-BR')} NXC e registro de antecedentes.` });
    record(ctx, { type: 'condenacao-usuario', cat: 'justica', title: `${userName(ctx)} é condenado(a) por ${pen.label.toLowerCase()}`, text: `Processo nº ${c.n}. Pena de ${amount.toLocaleString('pt-BR')} NXC.`, actors: ['me', judge?.id].filter(Boolean), importance: 3, storyId: c.storyId });
  } else {
    c.status = 'absolvido';
    account(w).reputation = clamp(account(w).reputation + 3, 0, 100);
    c.timeline.push({ at: ctx.at.toISOString(), text: `${by} absolveu você por falta de provas suficientes.` });
    record(ctx, { type: 'absolvicao', cat: 'justica', title: `${userName(ctx)} é absolvido(a) no processo nº ${c.n}`, actors: ['me', judge?.id].filter(Boolean), importance: 2, storyId: c.storyId });
  }
});

// acordo antes da audiência civil: paga e encerra
export function settleCase(ctx, caseId, pin) {
  const w = ctx.w; const c = justice(w).cases.find((x) => x.id === caseId && x.kind === 'civil' && x.suspect.type === 'user');
  if (!c || c.status !== 'citado') throw new BankError('Não há acordo possível neste caso');
  verifyPin(w, pin);
  debit(w, c.amount, `Acordo no processo nº ${c.n}`, ctx.at, 'judicial');
  payBeneficiary(ctx, c.plaintiff, c.amount);
  c.status = 'acordo';
  c.timeline.push({ at: ctx.at.toISOString(), text: `Acordo: você pagou ${c.amount.toLocaleString('pt-BR')} NXC.` });
  const p = personById(w, c.plaintiff); if (p) bumpUser(ctx, p, 6, { trust: 8, note: `${userName(ctx)} fez acordo e me pagou.` });
  return c;
}
function payBeneficiary(ctx, ben, amount) {
  const w = ctx.w;
  if (ben === 'banco') { const b = companies(w).find((c) => c.name === 'Banco Nexus'); if (b) b.salesToday += amount; return; }
  const p = personById(w, ben); if (p?.agent) p.agent.cash = round2(p.agent.cash + amount);
}
// dívidas pagas (por você ou por penhora) chegam a quem tem direito
export function settle(ctx) {
  const w = ctx.w; const e = eco(w);
  for (const d of bankOf(w).debts.filter((x) => x.status === 'paga' && !x.settled)) {
    d.settled = true;
    if (d.beneficiary) payBeneficiary(ctx, d.beneficiary, d.amount);
    else e.treasury = round2((e.treasury || 0) + d.amount);
  }
}
export function payFine(ctx, debtId, pin) {
  verifyPin(ctx.w, pin);
  const d = payDebt(ctx.w, debtId, ctx.at);
  settle(ctx);
  return d;
}

// ---------------------------------------------------------------- denúncia feita pelo usuário
export function report(ctx, personaId, tipo, relato) {
  const w = ctx.w; const p = personById(w, personaId);
  if (!p?.agent) throw new BankError('Pessoa não encontrada');
  if (tipo === 'calote') {
    const owed = round2(p.agent.debtToUser || 0);
    if (owed <= 0) throw new BankError(`${p.name} não te deve nada nos registros do banco.`);
    if (justice(w).cases.some((c) => c.type === 'calote' && c.suspect.id === p.id && ['citado'].includes(c.status))) throw new BankError('Já existe um processo aberto');
    return openCase(ctx, { type: 'calote', suspect: { type: 'persona', id: p.id }, plaintiff: 'me', amount: owed, desc: `${userName(ctx)} cobra ${owed.toLocaleString('pt-BR')} NXC emprestados a ${p.name}. ${str(relato, 200)}` });
  }
  const crimes = (w.events || []).filter((e) => e.cat === 'seguranca' && e.actors.includes(p.id));
  const c = openCase(ctx, { type: tipo === 'golpe' ? 'golpe' : 'furto', suspect: { type: 'persona', id: p.id }, plaintiff: 'me', desc: `Denúncia de ${userName(ctx)}: ${str(relato, 300) || 'sem detalhes'}`, evidence: [{ kind: 'denuncia', desc: 'Relato do denunciante', strength: 0.15 }, ...(crimes.length ? [{ kind: 'registros', desc: 'Há registros policiais compatíveis', strength: 0.35 }] : [])] });
  if (!crimes.length && chance(0.5)) bumpUser(ctx, p, -20, { trust: -20, note: `Soube que ${userName(ctx)} me denunciou à polícia sem motivo.` });
  return c;
}

// ---------------------------------------------------------------- dados públicos
export function publicCase(w, c) {
  const pen = penalty(w, c.type);
  return { id: c.id, n: c.n, type: c.type, typeLabel: pen.label, kind: c.kind, status: c.status, statusLabel: STATUS_LABEL[c.status] || c.status, desc: c.desc, at: c.at, amount: c.amount, fine: c.fine || null, sentence: c.sentence || null,
    suspect: who(w, c.suspect), plaintiff: who(w, c.plaintiff), investigator: c.investigatorId ? who(w, c.investigatorId) : null, deadline: c.deadline || null, hearingAt: c.hearingAt || null, testimony: c.testimony || null,
    evidence: c.evidence.map((e) => ({ kind: e.kind, desc: e.desc, strength: Math.round((e.strength || 0) * 100) })), strength: Math.round(strength(c) * 100), timeline: c.timeline };
}
