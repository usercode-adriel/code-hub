// WORLD GOVERNMENT — partidos, cargos, eleições, pesquisas, debates e leis com efeito real na economia.
// Ciclo (tempo real): mandato (12 dias) → inscrições (2) → campanha (5, com pesquisas diárias e um debate na TV)
// → apuração no fim do dia seguinte. Cada morador vota: ideologia, fama, gastos de campanha, situação da economia,
// escândalos e a relação pessoal com cada candidato (inclusive com o usuário) pesam no voto.
import { onDaily, onGenesis, handle, record, schedule } from './core.js';
import { residents, personById, bumpUser, userName, active } from './agents.js';
import { account, debit, addXp } from './bank.js';
import { worldPost, remember, genderize } from '../social.js';
import { rnd, pick, chance, clamp, uid, DAY, HOUR, gauss, cap, shuffle } from './util.js';
import { notify } from '../notify.js';

const PHASE = { mandato: 12, inscricoes: 2, campanha: 5 };
export const PHASE_LABEL = { mandato: 'Mandato em curso', inscricoes: 'Inscrições abertas', campanha: 'Campanha eleitoral', apuracao: 'Votação e apuração' };
export const OFFICES = [{ id: 'prefeito', title: 'Prefeito(a)', seats: 1 }, { id: 'vereador', title: 'Vereador(a)', seats: 5 }];
export const LAWS = [
  { key: 'menos-impostos', title: 'Redução de impostos para empresas', ideology: 0.6, desc: 'Imposto sobre o lucro cai 2 pontos.', apply: (e) => { e.taxRate = clamp(e.taxRate - 0.02, 0.02, 0.4); } },
  { key: 'mais-impostos', title: 'Imposto maior para grandes empresas', ideology: -0.6, desc: 'Imposto sobre o lucro sobe 2 pontos.', apply: (e) => { e.taxRate = clamp(e.taxRate + 0.02, 0.02, 0.4); } },
  { key: 'tecnologia', title: 'Programa Cidade Inteligente', ideology: 0.2, desc: 'Demanda do setor de tecnologia +10%.', apply: (e) => { e.demandMult.tecnologia = (e.demandMult.tecnologia || 1) * 1.1; } },
  { key: 'policia', title: 'Reforço no policiamento', ideology: 0.35, desc: 'Crimes ficam 25% menos frequentes.', apply: (e) => { e.crimeMult = (e.crimeMult || 1) * 0.75; } },
  { key: 'moradia', title: 'Programa de moradia popular', ideology: -0.5, desc: 'Preço dos imóveis desacelera.', apply: (e) => { e.housingMult = (e.housingMult || 1) * 0.97; } },
  { key: 'bolsa', title: 'Bolsa universitária', ideology: -0.3, desc: 'Cursos da Universidade 20% mais baratos.', apply: (e) => { e.eduDiscount = clamp((e.eduDiscount || 0) + 0.2, 0, 0.6); } },
  { key: 'comercio', title: 'Incentivo ao comércio local', ideology: 0, desc: 'Varejo e alimentação +8% de demanda.', apply: (e) => { e.demandMult.varejo = (e.demandMult.varejo || 1) * 1.08; e.demandMult.alimentacao = (e.demandMult.alimentacao || 1) * 1.08; } },
  { key: 'juros', title: 'Juros menores no Banco Nexus', ideology: 0.1, desc: 'Taxa básica de juros cai 15%.', apply: (e) => { e.baseRate = Math.round(e.baseRate * 0.85 * 100000) / 100000; } },
  { key: 'cultura', title: 'Lei de incentivo à cultura', ideology: -0.2, desc: 'Entretenimento e mídia +10% de demanda.', apply: (e) => { e.demandMult.entretenimento = (e.demandMult.entretenimento || 1) * 1.1; e.demandMult.midia = (e.demandMult.midia || 1) * 1.1; } },
];

export function pol(w) { return w.politics; }
const who = (w, h) => (h?.type === 'user' ? { id: 'me', name: 'Você', me: true } : personById(w, h?.id) ? { id: h.id, name: personById(w, h.id).name, avatar: personById(w, h.id).avatar, color: personById(w, h.id).color } : { id: h?.id, name: (w.gone || {})[h?.id] || 'vago' });

onGenesis((ctx) => {
  const w = ctx.w;
  const parties = [
    { id: 'ppd', name: 'Partido Progresso Digital', sigla: 'PPD', color: '#06b6d4', ideology: 0.55 },
    { id: 'ap', name: 'Aliança Popular', sigla: 'AP', color: '#ef4444', ideology: -0.55 },
    { id: 'vn', name: 'Verde Nexus', sigla: 'VN', color: '#22c55e', ideology: -0.05 },
  ].map((p) => ({ ...p, members: [], leaderId: null, origin: 'genese' }));
  for (const p of residents(w)) {
    const best = parties.slice().sort((a, b) => Math.abs(a.ideology - p.agent.ideology) - Math.abs(b.ideology - p.agent.ideology))[0];
    if (Math.abs(best.ideology - p.agent.ideology) < 0.35 && chance(0.45)) { best.members.push(p.id); p.agent.partyId = best.id; }
  }
  for (const party of parties) {
    const leader = party.members.map((id) => personById(w, id)).sort((a, b) => b.agent.traits.ambition - a.agent.traits.ambition)[0];
    if (leader) { party.leaderId = leader.id; leader.agent.partyLeader = true; }
  }
  const offices = OFFICES.map((o) => ({ ...o, holders: [] }));
  const pool = (partyId) => parties.find((x) => x.id === partyId).members.map((id) => personById(w, id)).filter(Boolean);
  const mayorParty = parties.slice().sort((a, b) => b.members.length - a.members.length)[0];
  const mayor = pool(mayorParty.id).sort((a, b) => b.agent.traits.ambition - a.agent.traits.ambition)[0] || pick(residents(w));
  offices[0].holders.push({ type: 'persona', id: mayor.id, partyId: mayor.agent.partyId, since: ctx.at.toISOString(), origin: 'genese' });
  mayor.agent.office = 'prefeito'; mayor.agent.keep = true; mayor.job = `${mayor.gender === 'f' ? 'prefeita' : 'prefeito'} de Codeniac Society`;
  const council = shuffle(parties.flatMap((p) => pool(p.id)).filter((p) => p.id !== mayor.id)).slice(0, 5);
  for (const p of council) { offices[1].holders.push({ type: 'persona', id: p.id, partyId: p.agent.partyId, since: ctx.at.toISOString(), origin: 'genese' }); p.agent.office = 'vereador'; p.agent.keep = true; }
  w.politics = { parties, offices, election: { n: 1, phase: 'mandato', phaseEnds: new Date(ctx.at.getTime() + 5 * DAY).toISOString(), candidates: [], polls: [], debateAt: null }, history: [], laws: [] };
});

// ---------------------------------------------------------------- ciclo eleitoral
onDaily((ctx) => {
  const w = ctx.w; const P = w.politics;
  if (!P) return;
  const el = P.election;
  if (el.phaseEnds > ctx.at.toISOString()) {
    if (el.phase === 'campanha') poll(ctx);
    if (el.phase === 'mandato' && chance(0.5)) { try { proposeLaw(ctx); } catch { /* lei igual já em votação */ } }
    return;
  }
  if (el.phase === 'mandato') {
    el.phase = 'inscricoes'; el.phaseEnds = new Date(ctx.at.getTime() + PHASE.inscricoes * DAY).toISOString(); el.candidates = []; el.polls = [];
    record(ctx, { type: 'eleicao-inscricoes', cat: 'politica', title: `Abertas as inscrições para a ${el.n}ª eleição de Codeniac Society`, text: 'Prefeitura e 5 vagas na Câmara.', importance: 3 });
    // políticos se inscrevem
    for (const party of P.parties) {
      const members = party.members.map((id) => personById(w, id)).filter((p) => p?.agent && active(p)).sort((a, b) => b.agent.traits.ambition - a.agent.traits.ambition);
      if (members[0]) addCandidate(ctx, { type: 'persona', id: members[0].id }, 'prefeito', party.id);
      for (const m of members.slice(1, 4)) if (m.agent.traits.ambition > 0.35 || m.agent.office) addCandidate(ctx, { type: 'persona', id: m.id }, 'vereador', party.id);
    }
  } else if (el.phase === 'inscricoes') {
    el.phase = 'campanha'; el.phaseEnds = new Date(ctx.at.getTime() + PHASE.campanha * DAY).toISOString();
    const debate = new Date(ctx.at.getTime() + 2 * DAY); debate.setHours(21, 0, 0, 0);
    el.debateAt = debate.toISOString();
    schedule(ctx, debate, 'debate-eleitoral', { n: el.n });
    record(ctx, { type: 'eleicao-campanha', cat: 'politica', title: `Começa a campanha: ${el.candidates.filter((c) => c.office === 'prefeito').length} candidatos à prefeitura`, text: el.candidates.filter((c) => c.office === 'prefeito').map((c) => who(w, c.who).name).join(', '), importance: 3 });
    poll(ctx);
  } else if (el.phase === 'campanha') {
    el.phase = 'apuracao';
    const at = new Date(ctx.at); at.setHours(20, 0, 0, 0);
    el.phaseEnds = new Date(at.getTime() + DAY).toISOString();
    schedule(ctx, at, 'apuracao', { n: el.n });
  }
});

function addCandidate(ctx, whoRef, office, partyId, ideology = null) {
  const w = ctx.w; const el = w.politics.election;
  if (el.candidates.some((c) => c.who.type === whoRef.type && c.who.id === whoRef.id)) return null;
  const p = whoRef.type === 'persona' ? personById(w, whoRef.id) : null;
  const c = { who: whoRef, office, partyId, ideology: ideology ?? p?.agent.ideology ?? 0, spent: 0, votes: 0 };
  el.candidates.push(c);
  if (p) { p.agent.candidate = office; p.agent.keep = true; }
  return c;
}

function voteScores(w, voter, cands) {
  const econ = (w.eco?.index || 1000) >= 1000 ? 0.3 : -0.3;
  const mayor = w.politics.offices[0].holders[0];
  return cands.map((c) => {
    const fame = c.who.type === 'user' ? account(w).fame : (personById(w, c.who.id)?.followers || 0);
    const p = c.who.type === 'persona' ? personById(w, c.who.id) : null;
    const relAff = c.who.type === 'user' ? voter.agent.user.aff : (voter.agent.rel[c.who.id]?.aff || 0);
    let s = -Math.abs(voter.agent.ideology - c.ideology) * 2.2 + Math.log10(fame + 1) * 0.3 + Math.log10(c.spent + 1) * 0.18 + relAff / 40 + (voter.agent.partyId && voter.agent.partyId === c.partyId ? 0.8 : 0);
    if (mayor && c.partyId === mayor.partyId) s += econ;
    if (p && (p.agent.status === 'preso' || (w.companies || []).some((x) => x.scandal?.by === p.id))) s -= 2;
    if (c.who.type === 'user' && account(w).reputation < 30) s -= 1;
    return s + gauss(0, 0.6);
  });
}
function tally(w, office, sample = 1) {
  const el = w.politics.election;
  const cands = el.candidates.filter((c) => c.office === office);
  const votes = new Map(cands.map((c) => [c, 0]));
  const voters = residents(w).filter((p) => active(p) && p.age >= 16 && chance(sample));
  for (const v of voters) {
    const s = voteScores(w, v, cands);
    const i = s.indexOf(Math.max(...s));
    if (i >= 0) votes.set(cands[i], votes.get(cands[i]) + 1);
  }
  return { cands, votes, total: voters.length };
}
function poll(ctx) {
  const w = ctx.w; const el = w.politics.election;
  const { cands, votes, total } = tally(w, 'prefeito', 0.6);
  if (!total || !cands.length) return;
  const results = cands.map((c) => ({ who: who(w, c.who), partyId: c.partyId, pct: Math.round((votes.get(c) / total) * 1000) / 10 })).sort((a, b) => b.pct - a.pct);
  el.polls.push({ at: ctx.at.toISOString(), results });
  cap(el.polls, 10);
  record(ctx, { type: 'pesquisa', cat: 'politica', title: `Pesquisa: ${results[0].who.name} lidera com ${results[0].pct}%`, text: results.map((r) => `${r.who.name}: ${r.pct}%`).join(' · '), importance: 2 });
}
handle('debate-eleitoral', (ctx, { n }) => {
  const w = ctx.w; const el = w.politics?.election;
  if (!el || el.n !== n || el.phase !== 'campanha') return;
  const cands = el.candidates.filter((c) => c.office === 'prefeito');
  if (cands.length < 2) return;
  // quem vai bem no debate ganha fama; quem é explosivo pode se complicar
  let best = null;
  for (const c of cands) {
    const p = c.who.type === 'persona' ? personById(w, c.who.id) : null;
    const perf = p ? gauss(0.5 + (1 - p.agent.traits.volatility) * 0.3, 0.25) : gauss(0.55, 0.2);
    c.debate = Math.round(perf * 100) / 100;
    if (p) p.followers = (p.followers || 0) + Math.round(perf * 800);
    if (!best || perf > best.debate) best = c;
  }
  record(ctx, { type: 'debate', cat: 'politica', title: `Debate na TV: ${who(w, best.who).name} se sai melhor`, text: `Participaram: ${cands.map((c) => who(w, c.who).name).join(', ')}.`, actors: cands.map((c) => (c.who.type === 'user' ? 'me' : c.who.id)), importance: 3 });
});
handle('apuracao', (ctx, { n }) => {
  const w = ctx.w; const P = w.politics; const el = P.election;
  if (el.n !== n || el.phase !== 'apuracao') return;
  const result = {};
  for (const off of P.offices) {
    const { cands, votes, total } = tally(w, off.id);
    const ranked = cands.map((c) => ({ c, v: votes.get(c) })).sort((a, b) => b.v - a.v);
    const winners = ranked.slice(0, off.seats).filter((x) => x.v > 0);
    if (!winners.length) continue;
    // mandato anterior termina
    for (const h of off.holders) { const p = h.type === 'persona' ? personById(w, h.id) : null; if (p) p.agent.office = null; if (h.type === 'user') account(w).office = null; }
    off.holders = winners.map(({ c }) => ({ type: c.who.type, id: c.who.type === 'user' ? 'me' : c.who.id, partyId: c.partyId, since: ctx.at.toISOString() }));
    for (const { c } of winners) {
      if (c.who.type === 'user') { account(w).office = off.id; addXp(w, 200); }
      const p = c.who.type === 'persona' ? personById(w, c.who.id) : null;
      if (p) { p.agent.office = off.id; p.agent.keep = true; remember(p, `Fui eleita(o) ${off.title.toLowerCase()} de Codeniac Society!`); if (off.id === 'prefeito') p.job = p.gender === 'f' ? 'prefeita de Codeniac Society' : 'prefeito de Codeniac Society'; worldPost(ctx, p, genderize(p, off.id === 'prefeito' ? 'ELEITA(O)! Obrigada(o), Codeniac Society. Vamos trabalhar.' : 'Eleita(o) para a Câmara! A cidade pode contar comigo.')); }
    }
    result[off.id] = ranked.map(({ c, v }) => ({ who: who(w, c.who), partyId: c.partyId, votes: v, pct: total ? Math.round((v / total) * 1000) / 10 : 0 }));
    const top = result[off.id][0];
    record(ctx, { type: 'resultado-eleicao', cat: 'politica', title: off.id === 'prefeito' ? `${top.who.name} é eleito(a) prefeito(a) de Codeniac Society com ${top.pct}% dos votos` : `Câmara eleita: ${winners.map(({ c }) => who(w, c.who).name).join(', ')}`, actors: winners.map(({ c }) => (c.who.type === 'user' ? 'me' : c.who.id)), importance: off.id === 'prefeito' ? 5 : 4, data: { office: off.id } });
    if (winners.some(({ c }) => c.who.type === 'user')) notify(ctx.uid, { type: 'system', title: `🗳️ Você foi eleito(a) ${off.title.toLowerCase()}!`, message: 'Agora você pode propor leis em Governo.', link: '#/governo' });
  }
  for (const c of el.candidates) { const p = c.who.type === 'persona' ? personById(w, c.who.id) : null; if (p) p.agent.candidate = null; }
  if (account(w).candidate) account(w).candidate = null;
  P.history.push({ n: el.n, at: ctx.at.toISOString(), result });
  cap(P.history, 30);
  Object.assign(el, { n: el.n + 1, phase: 'mandato', phaseEnds: new Date(ctx.at.getTime() + PHASE.mandato * DAY).toISOString(), candidates: [], polls: [], debateAt: null });
});

// ---------------------------------------------------------------- leis
function proposeLaw(ctx, { author = null, key = null } = {}) {
  const w = ctx.w; const P = w.politics;
  const council = P.offices.find((o) => o.id === 'vereador').holders;
  const h = author || pick(council);
  if (!h) return null;
  const p = h.type === 'persona' ? personById(w, h.id) : null;
  const ideol = p ? p.agent.ideology : 0;
  const recent = new Set(P.laws.filter((l) => l.at > new Date(ctx.at.getTime() - 12 * DAY).toISOString()).map((l) => l.key));
  const tpl = key ? LAWS.find((l) => l.key === key) : LAWS.filter((l) => !recent.has(l.key)).sort((a, b) => Math.abs(a.ideology - ideol) - Math.abs(b.ideology - ideol))[rnd(3)];
  if (!tpl) throw new Error('Lei não encontrada');
  if (P.laws.some((l) => l.key === tpl.key && l.status === 'em votação')) throw new Error('Essa lei já está em votação');
  const law = { id: uid(), key: tpl.key, title: tpl.title, desc: tpl.desc, ideology: tpl.ideology, author: h.type === 'user' ? { type: 'user', id: 'me' } : { type: 'persona', id: h.id }, status: 'em votação', at: ctx.at.toISOString(), votes: null };
  P.laws.push(law); cap(P.laws, 60);
  record(ctx, { type: 'projeto-lei', cat: 'politica', title: `${who(w, law.author).name} propõe: ${law.title}`, text: law.desc, actors: [h.type === 'user' ? 'me' : h.id], importance: 2 });
  schedule(ctx, new Date(ctx.at.getTime() + (12 + rnd(24)) * HOUR), 'votacao-lei', { id: law.id });
  return law;
}
handle('votacao-lei', (ctx, { id }) => {
  const w = ctx.w; const P = w.politics;
  const law = P.laws.find((l) => l.id === id);
  if (!law || law.status !== 'em votação') return;
  const council = P.offices.find((o) => o.id === 'vereador').holders;
  let yes = 0; let no = 0;
  for (const h of council) {
    if (h.type === 'user') { if (law.author.type === 'user' || law.userVote === 'sim') yes++; else if (law.userVote === 'nao') no++; else yes += chance(0.5) ? 1 : 0; continue; }
    const p = personById(w, h.id);
    const auth = law.author.type === 'persona' ? personById(w, law.author.id) : null;
    const s = 0.6 - Math.abs((p?.agent.ideology || 0) - law.ideology) + (auth && p?.agent.partyId === auth.agent.partyId ? 0.3 : 0) + (p && law.author.type === 'user' ? p.agent.user.aff / 100 : 0) + gauss(0, 0.2);
    if (s > 0) yes++; else no++;
  }
  law.votes = { sim: yes, nao: no };
  const mayorH = P.offices[0].holders[0];
  const mayor = mayorH?.type === 'persona' ? personById(w, mayorH.id) : null;
  const veto = yes > no && mayor && Math.abs(mayor.agent.ideology - law.ideology) > 0.9 && chance(0.6);
  law.status = yes > no ? (veto ? 'vetada' : 'aprovada') : 'rejeitada';
  law.decidedAt = ctx.at.toISOString();
  if (law.status === 'aprovada') LAWS.find((l) => l.key === law.key)?.apply(w.eco);
  if (law.author.type === 'user') { account(w).reputation = clamp(account(w).reputation + (law.status === 'aprovada' ? 4 : -1), 0, 100); }
  record(ctx, { type: `lei-${law.status}`, cat: 'politica', title: `${law.title}: ${law.status === 'aprovada' ? 'aprovada' : law.status === 'vetada' ? 'vetada pela prefeitura' : 'rejeitada'} (${yes} × ${no})`, text: law.status === 'aprovada' ? `Efeito: ${law.desc}` : '', actors: law.author.type === 'user' ? ['me'] : [law.author.id], importance: law.status === 'aprovada' ? 3 : 2 });
});

// ---------------------------------------------------------------- ações do usuário
export function joinParty(ctx, partyId) {
  const w = ctx.w; const u = account(w); const P = w.politics;
  const party = P.parties.find((p) => p.id === partyId);
  if (!party) throw new Error('Partido não encontrado');
  if (u.partyId === partyId) { u.partyId = null; record(ctx, { type: 'desfiliacao', cat: 'politica', title: `Você saiu do ${party.sigla}`, actors: ['me'], importance: 1 }); return null; }
  u.partyId = partyId;
  record(ctx, { type: 'filiacao', cat: 'politica', title: `Você se filiou ao ${party.name} (${party.sigla})`, actors: ['me'], importance: 2 });
  for (const id of party.members.slice(0, 20)) { const p = personById(w, id); if (p) bumpUser(ctx, p, 2, {}); }
  return party;
}
export const CANDIDATE_RULES = { reputation: 40, fee: 3000 };
export function runForOffice(ctx, office, ideology) {
  const w = ctx.w; const u = account(w); const el = w.politics.election;
  if (el.phase !== 'inscricoes') throw new Error('As inscrições não estão abertas agora');
  if (!u.partyId) throw new Error('Filie-se a um partido primeiro');
  if (u.reputation < CANDIDATE_RULES.reputation) throw new Error(`Reputação mínima: ${CANDIDATE_RULES.reputation} (a sua é ${u.reputation})`);
  if (!OFFICES.some((o) => o.id === office)) throw new Error('Cargo inválido');
  if (el.candidates.some((c) => c.who.type === 'user')) throw new Error('Você já é candidato(a)');
  debit(w, CANDIDATE_RULES.fee, `Taxa de candidatura (${office})`, ctx.at);
  addCandidate(ctx, { type: 'user', id: 'me' }, office, u.partyId, clamp(Number(ideology) || 0, -1, 1));
  u.candidate = office;
  record(ctx, { type: 'candidatura-usuario', cat: 'politica', title: `${userName(ctx)} é candidato(a) a ${OFFICES.find((o) => o.id === office).title.toLowerCase()}`, actors: ['me'], importance: 3 });
}
export function campaign(ctx, amount) {
  const w = ctx.w; const u = account(w); const el = w.politics.election;
  const c = el.candidates.find((x) => x.who.type === 'user');
  if (!c || !['inscricoes', 'campanha'].includes(el.phase)) throw new Error('Você não está em campanha');
  amount = Math.round(amount);
  debit(w, amount, 'Gastos de campanha', ctx.at);
  c.spent += amount; u.fame += Math.round(amount / 8);
  record(ctx, { type: 'campanha-usuario', cat: 'politica', title: `Sua campanha investiu ${amount.toLocaleString('pt-BR')} NXC`, actors: ['me'], importance: 1 });
  return c;
}
export function userProposeLaw(ctx, key) {
  const u = account(ctx.w);
  if (u.office !== 'vereador' && u.office !== 'prefeito') throw new Error('Só quem tem mandato pode propor leis');
  return proposeLaw(ctx, { author: { type: 'user', id: 'me' }, key });
}
export function voteLaw(ctx, id, vote) {
  const u = account(ctx.w);
  if (u.office !== 'vereador') throw new Error('Só vereadores votam leis');
  const law = ctx.w.politics.laws.find((l) => l.id === id && l.status === 'em votação');
  if (!law) throw new Error('Lei não encontrada');
  law.userVote = vote === 'sim' ? 'sim' : 'nao';
  return law;
}

export function publicPolitics(w) {
  const P = w.politics; if (!P) return null;
  const u = account(w);
  return {
    parties: P.parties.map((p) => ({ id: p.id, name: p.name, sigla: p.sigla, color: p.color, ideology: p.ideology, members: p.members.length + (u.partyId === p.id ? 1 : 0), leader: p.leaderId ? who(w, { type: 'persona', id: p.leaderId }) : null, origin: p.origin })),
    offices: P.offices.map((o) => ({ id: o.id, title: o.title, holders: o.holders.map((h) => ({ ...who(w, h), partyId: h.partyId, since: h.since, origin: h.origin })) })),
    election: { ...P.election, phaseLabel: PHASE_LABEL[P.election.phase], candidates: P.election.candidates.map((c) => ({ who: who(w, c.who), office: c.office, partyId: c.partyId, spent: c.spent, debate: c.debate ?? null })) },
    history: P.history.slice(-6).reverse(), laws: P.laws.slice(-20).reverse().map((l) => ({ ...l, author: who(w, l.author) })),
    me: { partyId: u.partyId || null, candidate: u.candidate || null, office: u.office || null, reputation: u.reputation, fame: u.fame, rules: CANDIDATE_RULES },
    templates: LAWS.map(({ key, title, desc, ideology }) => ({ key, title, desc, ideology })),
    stats: { taxRate: w.eco?.taxRate, baseRate: w.eco?.baseRate, crimeMult: w.eco?.crimeMult, eduDiscount: w.eco?.eduDiscount },
  };
}
