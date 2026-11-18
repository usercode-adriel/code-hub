// ORGANIZAÇÕES AUTÔNOMAS — grupos fundados e administrados por personagens de IA, sem depender do usuário.
// Cada organização é uma entidade persistente: identidade, cargos, membros, caixa, sede, reputação,
// relações com outras organizações, conflitos internos e histórico de decisões.
import { onUpgrade, onDaily, onHourly, record, services } from './core.js';
import { people, personById, residents, active, bumpUser, userName, agentOf, registerAction } from './agents.js';
import { account } from './bank.js';
import { freeNode, pos, districtOfNode, address } from './map.js';
import { worldPost, genderize, remember } from '../social.js';
import { notify } from '../notify.js';
import { uid, pick, chance, clamp, rnd, round2, cap, shuffle, nowIso, DAY, HOUR } from './util.js';

// tipos de organização (categorias originais da Codeniac Digital Society)
export const ORG_KINDS = {
  grupo: { label: 'Grupo econômico', cat: 'empresarial', icon: 'briefcase', color: '#22c55e', growth: 1.0, prefix: ['Nexus', 'Órion', 'Vértice', 'Meridian', 'Apex', 'Aurora'], suffix: ['Capital', 'Holding', 'Group', 'Ventures', 'Partners'] },
  cooperativa: { label: 'Cooperativa', cat: 'empresarial', icon: 'users', color: '#16a34a', growth: 0.6, prefix: ['Coop', 'União', 'Raiz', 'Comum'], suffix: ['Cooperativa', 'Coletivo', 'Rede'] },
  associacao: { label: 'Associação comercial', cat: 'profissional', icon: 'briefcase', color: '#0ea5e9', growth: 0.5, prefix: ['Associação', 'Câmara', 'Federação'], suffix: ['do Comércio', 'de Lojistas', 'Empresarial'] },
  sindicato: { label: 'Sindicato', cat: 'profissional', icon: 'flag', color: '#f97316', growth: 0.4, prefix: ['Sindicato', 'Frente', 'União'], suffix: ['dos Trabalhadores', 'da Categoria', 'Profissional'] },
  clube: { label: 'Clube social', cat: 'social', icon: 'star', color: '#a855f7', growth: 0.5, prefix: ['Clube', 'Círculo', 'Sociedade'], suffix: ['Aurora', 'Prestígio', 'Boêmio', 'Elite'] },
  moradores: { label: 'Associação de moradores', cat: 'social', icon: 'pin', color: '#14b8a6', growth: 0.3, prefix: ['Amigos d', 'Moradores d', 'Vizinhança d'], suffix: [''] },
  movimento: { label: 'Movimento social', cat: 'social', icon: 'flag', color: '#ef4444', growth: 0.4, prefix: ['Movimento', 'Coletivo', 'Frente'], suffix: ['por Nexus', 'Cidadão', 'Popular'] },
  ong: { label: 'Organização beneficente', cat: 'social', icon: 'heart', color: '#ec4899', growth: 0.4, prefix: ['Instituto', 'Fundação', 'Mãos'], suffix: ['do Bem', 'Solidária', 'Esperança'] },
  influencia: { label: 'Grupo de influência', cat: 'politica', icon: 'zap', color: '#eab308', growth: 0.6, prefix: ['Grupo', 'Fórum', 'Aliança'], suffix: ['Estratégico', 'de Ideias', 'Nexus'] },
  submundo: { label: 'Sociedade reservada', cat: 'submundo', icon: 'eye', color: '#6b7280', growth: 0.8, prefix: ['Círculo', 'Ordem', 'Sociedade'], suffix: ['Sombra', 'Reservada', 'do Porto'], secret: true },
};
export const ORG_CATS = { empresarial: 'Empresarial', social: 'Social', politica: 'Política', profissional: 'Profissional', submundo: 'Submundo' };
// cargos com nível de permissão (quanto maior, mais decide)
export const ROLES = [
  { key: 'presidente', label: 'Presidente', power: 5 }, { key: 'vice', label: 'Vice-presidente', power: 4 },
  { key: 'diretor-fin', label: 'Diretor(a) financeiro', power: 3 }, { key: 'diretor-op', label: 'Diretor(a) operacional', power: 3 },
  { key: 'conselheiro', label: 'Conselheiro(a)', power: 2 }, { key: 'gerente', label: 'Gerente', power: 2 },
  { key: 'membro', label: 'Membro', power: 1 }, { key: 'recruta', label: 'Recruta', power: 0 },
];
export const roleLabel = (k) => ROLES.find((r) => r.key === k)?.label || k;
const REL_LABELS = { alianca: 'Aliança', parceria: 'Parceria', concorrencia: 'Concorrência', rivalidade: 'Rivalidade', cooperacao: 'Cooperação' };

export const orgs = (w) => (w.orgs ??= []);
export const orgById = (w, id) => orgs(w).find((o) => o.id === id);
const leaderOf = (w, o) => personById(w, o.leaderId);

function orgName(kind) {
  const k = ORG_KINDS[kind];
  const a = pick(k.prefix); const b = pick(k.suffix);
  return (b ? `${a} ${b}` : `${a}${pick(['Serra', 'Porto', 'Jardins', 'Centro', 'Vila'])}`).replace(/\s+/g, ' ').trim();
}
function sigla(name) { return name.split(/\s+/).filter((x) => /[A-Za-zÀ-ÿ]/.test(x)).slice(0, 3).map((x) => x[0].toUpperCase()).join(''); }

// ---------------------------------------------------------------- fundação
function foundOrg(ctx, founder, { kind = null, seed: seedMode = false } = {}) {
  const w = ctx.w; const a = agentOf(w, founder);
  if (!a.resident || a.orgLead) return null;
  // tipo pela vocação do fundador
  kind = kind || (a.diplomas?.includes('Administração') || a.companyId ? pick(['grupo', 'associacao', 'cooperativa'])
    : a.diplomas?.includes('Direito') ? pick(['influencia', 'movimento'])
      : a.traits.honesty < 0.3 && chance(0.5) ? 'submundo'
        : pick(['clube', 'moradores', 'movimento', 'ong', 'sindicato', 'influencia']));
  const k = ORG_KINDS[kind];
  // recursos: precisa de caixa mínimo e de recrutar ao menos 1 aliado
  const seed = Math.round(Math.min(a.cash * 0.4, 2000 + rnd(8000)));
  if (a.cash < seed + 300) return null;
  let friends = residents(w).filter((p) => p.id !== founder.id && active(p) && !p.agent.orgId && !p.agent.orgLead && (a.rel[p.id]?.met) && a.rel[p.id]?.aff > 15);
  // na semeadura (gênese) a cidade ainda tem poucas relações: aceita conhecidos do mesmo bairro
  if (seedMode && friends.length < 2) friends = shuffle(residents(w).filter((p) => p.id !== founder.id && active(p) && !p.agent.orgId && !p.agent.orgLead && p.agent.districtId === a.districtId));
  const cofounders = shuffle(friends).slice(0, 1 + rnd(2));
  if (!cofounders.length && k.cat !== 'submundo') return null; // ninguém topou: fundação fracassa
  a.cash = round2(a.cash - seed);
  const name = orgName(kind);
  const node = freeNode(w, a.districtId || 'centro', { used: new Set((w.city?.places || []).map((p) => p.node)) });
  const o = {
    id: uid(), name, sigla: sigla(name), kind, cat: k.cat, color: k.color, secret: Boolean(k.secret),
    foundedAt: ctx.at.toISOString(), origin: 'vivo', founderIds: [founder.id, ...cofounders.map((p) => p.id)],
    leaderId: founder.id, members: [{ personaId: founder.id, role: 'presidente', since: ctx.at.toISOString() }],
    cash: seed, patrimony: seed, objective: objectiveFor(kind), districtId: a.districtId || districtOfNode(w, node) || 'centro',
    node, address: address(w, node), reputation: 45 + rnd(15), influence: 10 + rnd(15),
    relations: {}, log: [], seeking: true, userInvite: null, userMember: false,
  };
  const roles = ['vice', 'diretor-fin', 'diretor-op', 'conselheiro'];
  cofounders.forEach((p, i) => { o.members.push({ personaId: p.id, role: roles[i] || 'membro', since: ctx.at.toISOString() }); agentOf(w, p).orgId = o.id; });
  a.orgLead = o.id; a.orgId = o.id;
  logOrg(o, ctx, `${founder.name} fundou a ${name} com ${cofounders.map((p) => p.name).join(', ') || 'uma equipe enxuta'}.`);
  orgs(w).push(o); cap(orgs(w), 80);
  record(ctx, { type: 'org-fundada', cat: k.cat === 'politica' ? 'politica' : k.cat === 'submundo' ? 'seguranca' : 'economia', title: `Nova organização: ${name} (${k.label})`, text: `${founder.name} reuniu ${o.members.length} pessoa(s). Objetivo: ${o.objective}`, actors: o.members.map((m) => m.personaId), refs: [{ t: 'org', id: o.id }], importance: 3, storyId: o.id });
  if (!o.secret) worldPost(ctx, founder, genderize(founder, `Oficial: acabei de fundar a ${name}! ${o.objective} 🚀 Quem quiser fazer parte, chama.`));
  return o;
}
function objectiveFor(kind) {
  return pick({
    grupo: ['Investir e crescer no mercado de Nexus City', 'Formar um conglomerado de empresas', 'Financiar grandes projetos na cidade'],
    cooperativa: ['Unir pequenos negócios e dividir custos', 'Fortalecer os produtores locais'],
    associacao: ['Defender os interesses do comércio', 'Representar os lojistas da cidade'],
    sindicato: ['Lutar por melhores salários e condições', 'Representar a categoria nas negociações'],
    clube: ['Reunir gente influente em eventos exclusivos', 'Networking e prestígio'],
    moradores: ['Melhorar a vida no bairro', 'Cobrar mais segurança e infraestrutura'],
    movimento: ['Mobilizar a cidade por uma causa', 'Pressionar o governo por mudanças'],
    ong: ['Ajudar quem mais precisa em Nexus City', 'Projetos sociais e doações'],
    influencia: ['Influenciar as decisões do governo', 'Articular apoios e alianças'],
    submundo: ['Fazer negócios longe dos holofotes', 'Operar nos bastidores da cidade'],
  }[kind] || ['Fazer a diferença em Nexus City']);
}
function logOrg(o, ctx, text) { o.log.push({ at: ctx.at.toISOString(), text }); cap(o.log, 60); }

registerAction({
  name: 'fundar-org',
  weight: (ctx, p) => {
    const a = p.agent;
    if (!a.resident || a.orgLead || a.office || a.candidate || a.police) return 0;
    if (a.cash < 3000 || a.age < 22) return 0;
    return (a.traits.ambition - 0.45) * 0.1 + (a.diplomas?.length ? 0.03 : 0);
  },
  run(ctx, p) { foundOrg(ctx, p); },
});

// ---------------------------------------------------------------- vida diária das organizações
onDaily((ctx) => {
  const w = ctx.w;
  for (const o of orgs(w)) {
    const k = ORG_KINDS[o.kind]; const leader = leaderOf(w, o);
    if (!leader || !active(leader)) { reassignLeader(ctx, o); }
    // finanças próprias (independentes): empresariais crescem, sociais gastam
    const mult = (k.cat === 'empresarial' ? 0.03 : -0.015) * k.growth;
    const flow = round2(o.cash * mult + o.members.length * (k.cat === 'empresarial' ? 40 : -12) + rnd(200) - 60);
    o.cash = round2(o.cash + flow); o.patrimony = round2(Math.max(o.patrimony, o.cash) * 0.98 + o.cash * 0.02);
    o.influence = clamp(o.influence + (o.members.length > 6 ? 0.4 : -0.1) + (flow > 0 ? 0.2 : -0.3), 0, 100);
    o.reputation = clamp(o.reputation + (o.cash > 0 ? 0.1 : -0.6), 0, 100);
    // crise financeira
    if (o.cash < -2000 && chance(0.5)) orgCrisis(ctx, o);
    // recrutamento
    if (o.seeking && o.members.length < 12 && chance(0.4)) recruit(ctx, o);
    // objetivo cumprido / expansão: um grupo econômico pode financiar uma obra (ligação com o motor urbano)
    if (k.cat === 'empresarial' && o.cash > 30000 && chance(0.25) && services.orgFundProject) services.orgFundProject(ctx, o);
  }
  // relações entre organizações (alianças, rivalidades)
  if (orgs(w).length >= 2 && chance(0.5)) formRelation(ctx);
  // conflito interno ocasional
  for (const o of orgs(w)) if (o.members.length >= 3 && chance(0.06)) internalConflict(ctx, o);
  // a cidade mantém uma base de organizações vivas
  if (orgs(w).filter((o) => !o.dissolvedAt).length < 6 && chance(0.5)) seedOne(ctx);
  // convite espontâneo ao usuário (organização influente procura gente de boa reputação)
  maybeInviteUser(ctx);
});

function recruit(ctx, o) {
  const w = ctx.w;
  const cand = shuffle(residents(w).filter((p) => active(p) && !p.agent.orgId && !p.agent.office && p.id !== 'me')).find((p) => {
    const aff = ORG_KINDS[o.kind].cat === 'submundo' ? p.agent.traits.honesty < 0.35 : true;
    return aff;
  });
  if (!cand) return;
  o.members.push({ personaId: cand.id, role: 'recruta', since: ctx.at.toISOString() }); agentOf(w, cand).orgId = o.id;
  logOrg(o, ctx, `${cand.name} entrou como recruta.`);
  if (o.members.length >= 12) o.seeking = false;
}
function reassignLeader(ctx, o) {
  const w = ctx.w;
  o.members = o.members.filter((m) => { const p = personById(w, m.personaId); return p && active(p); });
  if (!o.members.length) { dissolve(ctx, o, 'sem membros'); return; }
  o.members.sort((a, b) => (ROLES.find((r) => r.key === b.role)?.power || 0) - (ROLES.find((r) => r.key === a.role)?.power || 0));
  const top = o.members[0]; o.leaderId = top.personaId; top.role = 'presidente';
  const p = personById(w, top.personaId); if (p) { p.agent.orgLead = o.id; }
  logOrg(o, ctx, `${p?.name || 'Alguém'} assumiu a presidência.`);
}
function orgCrisis(ctx, o) {
  const w = ctx.w; const k = ORG_KINDS[o.kind];
  record(ctx, { type: 'org-crise', cat: 'economia', title: `${o.name} enfrenta crise financeira`, text: `A organização está no vermelho (${o.cash.toLocaleString('pt-BR')} NXC).`, actors: [o.leaderId].filter(Boolean), refs: [{ t: 'org', id: o.id }], importance: 3, storyId: o.id });
  logOrg(o, ctx, 'Crise financeira: caixa negativo.');
  if (chance(0.4)) dissolve(ctx, o, 'falência'); else { o.cash = round2(o.cash * 0.5); o.reputation = clamp(o.reputation - 10, 0, 100); }
}
function internalConflict(ctx, o) {
  const w = ctx.w;
  const rivals = o.members.filter((m) => m.personaId !== o.leaderId && (ROLES.find((r) => r.key === m.role)?.power || 0) >= 2);
  const rebel = rivals.length ? personById(w, pick(rivals).personaId) : null;
  if (!rebel) return;
  const leader = leaderOf(w, o);
  logOrg(o, ctx, `${rebel.name} discordou da direção de ${leader?.name || 'presidência'}.`);
  if (chance(0.45)) {
    // golpe: assume a liderança
    o.members.forEach((m) => { if (m.personaId === rebel.id) m.role = 'presidente'; else if (m.personaId === o.leaderId) m.role = 'conselheiro'; });
    if (leader) leader.agent.orgLead = null;
    o.leaderId = rebel.id; rebel.agent.orgLead = o.id;
    record(ctx, { type: 'org-golpe', cat: 'economia', title: `${rebel.name} assume o comando da ${o.name}`, text: `Disputa interna muda a liderança da organização.`, actors: [rebel.id, o.leaderId].filter(Boolean), refs: [{ t: 'org', id: o.id }], importance: 3, storyId: o.id });
    if (!o.secret) worldPost(ctx, rebel, genderize(rebel, `Mudança na ${o.name}. A partir de agora eu lidero. Novos tempos. 💼`));
  } else if (chance(0.5)) {
    // dissidência: sai e funda uma rival
    o.members = o.members.filter((m) => m.personaId !== rebel.id); rebel.agent.orgId = null;
    const nova = foundOrg(ctx, rebel, { kind: o.kind });
    if (nova) { o.relations[nova.id] = { type: 'rivalidade', since: ctx.at.toISOString() }; nova.relations[o.id] = { type: 'rivalidade', since: ctx.at.toISOString() };
      record(ctx, { type: 'org-racha', cat: 'economia', title: `Racha na ${o.name}: ${rebel.name} funda organização rival`, actors: [rebel.id], refs: [{ t: 'org', id: o.id }, { t: 'org', id: nova.id }], importance: 3, storyId: o.id }); }
  } else { logOrg(o, ctx, `${rebel.name} foi convencido a ficar.`); }
}
function formRelation(ctx) {
  const w = ctx.w; const list = orgs(w).filter((o) => o.members.length);
  if (list.length < 2) return;
  const [a, b] = shuffle(list).slice(0, 2);
  if (a.id === b.id || a.relations[b.id]) return;
  const sameCat = a.cat === b.cat;
  const type = sameCat ? pick(['concorrencia', 'rivalidade', 'alianca']) : pick(['parceria', 'cooperacao', 'alianca']);
  a.relations[b.id] = { type, since: ctx.at.toISOString() }; b.relations[a.id] = { type, since: ctx.at.toISOString() };
  logOrg(a, ctx, `${REL_LABELS[type]} com a ${b.name}.`); logOrg(b, ctx, `${REL_LABELS[type]} com a ${a.name}.`);
  if (['rivalidade', 'alianca'].includes(type)) record(ctx, { type: 'org-relacao', cat: 'economia', title: `${a.name} e ${b.name}: ${REL_LABELS[type].toLowerCase()}`, actors: [a.leaderId, b.leaderId].filter(Boolean), refs: [{ t: 'org', id: a.id }, { t: 'org', id: b.id }], importance: 2 });
}
function dissolve(ctx, o, reason) {
  const w = ctx.w;
  for (const m of o.members) { const p = personById(w, m.personaId); if (p?.agent) { p.agent.orgId = null; if (p.agent.orgLead === o.id) p.agent.orgLead = null; } }
  o.dissolvedAt = ctx.at.toISOString(); o.dissolveReason = reason; o.members = [];
  record(ctx, { type: 'org-fim', cat: 'economia', title: `${o.name} foi encerrada (${reason})`, refs: [{ t: 'org', id: o.id }], importance: 2, storyId: o.id });
  // remove depois de um tempo do índice ativo (mantém histórico leve)
  if (orgs(w).filter((x) => !x.dissolvedAt).length < 3) seedOne(ctx); // mantém a cidade com organizações
}
function maybeInviteUser(ctx) {
  const w = ctx.w; const u = account(w);
  if (u.citizen?.anonymous && u.reputation < 60) return; // precisa de nome na cidade
  const open = orgs(w).filter((o) => !o.dissolvedAt && !o.userMember && !o.userInvite && o.reputation > 50 && o.members.length >= 3);
  if (!open.length || !chance(0.15)) return;
  const o = pick(open);
  o.userInvite = { at: nowIso(), role: 'membro' };
  record(ctx, { type: 'org-convite', cat: 'pessoal', title: `${o.name} convidou você para entrar`, actors: ['me', o.leaderId].filter(Boolean), refs: [{ t: 'org', id: o.id }], importance: 2 });
  notify(ctx.uid, { type: 'system', title: `🤝 Convite: ${o.name}`, message: `${ORG_KINDS[o.kind].label} quer você como membro.`, link: '#/organizacoes' });
}

// ---------------------------------------------------------------- semear organizações na gênese/atualização
function seedOne(ctx) {
  const w = ctx.w;
  const cand = shuffle(residents(w).filter((p) => active(p) && !p.agent.orgLead && p.agent.cash > 3000 && p.agent.age >= 22));
  for (const p of cand.slice(0, 8)) { const o = foundOrg(ctx, p, { seed: true }); if (o) { o.origin = 'genese'; return o; } }
  return null;
}
onUpgrade(9, (ctx) => {
  const w = ctx.w;
  if (orgs(w).length) return;
  for (let i = 0; i < 7; i++) seedOne(ctx);
});

// ---------------------------------------------------------------- dados públicos + ações do usuário
export function publicOrg(w, o, full = false) {
  const lead = leaderOf(w, o);
  const base = {
    id: o.id, name: o.name, sigla: o.sigla, kind: o.kind, kindLabel: ORG_KINDS[o.kind].label, cat: o.cat, catLabel: ORG_CATS[o.cat],
    color: o.color, icon: ORG_KINDS[o.kind].icon, secret: o.secret, foundedAt: o.foundedAt, origin: o.origin,
    leader: lead ? { id: lead.id, name: lead.name, avatar: lead.avatar, color: lead.color } : null,
    members: o.members.length, reputation: Math.round(o.reputation), influence: Math.round(o.influence),
    objective: o.objective, district: (w.city?.districts || []).find((d) => d.id === o.districtId)?.name || null,
    dissolved: Boolean(o.dissolvedAt), userMember: o.userMember, userRole: o.userRole || null, userInvite: Boolean(o.userInvite),
    cash: o.userMember || o.cat !== 'submundo' ? round2(o.cash) : null,
  };
  if (!full) return base;
  return {
    ...base, address: o.address, patrimony: round2(o.patrimony),
    roster: o.members.map((m) => { const p = personById(w, m.personaId); return p ? { id: p.id, name: p.name, avatar: p.avatar, color: p.color, role: m.role, roleLabel: roleLabel(m.role) } : null; }).filter(Boolean),
    relations: Object.entries(o.relations).map(([id, r]) => { const other = orgById(w, id); return other ? { id, name: other.name, type: r.type, typeLabel: REL_LABELS[r.type] || r.type } : null; }).filter(Boolean),
    log: o.log.slice(-20).reverse(),
    events: (w.events || []).filter((e) => e.refs?.some((r) => r.id === o.id)).slice(-10).reverse().map((e) => ({ at: e.at, title: e.title })),
  };
}
export function orgsCenter(w) {
  const list = orgs(w).filter((o) => !o.dissolvedAt);
  const pub = (o) => publicOrg(w, o);
  return {
    total: list.length, cats: ORG_CATS,
    popular: list.slice().sort((a, b) => b.influence - a.influence).slice(0, 6).map(pub),
    recent: list.slice().sort((a, b) => b.foundedAt.localeCompare(a.foundedAt)).slice(0, 6).map(pub),
    growing: list.slice().sort((a, b) => b.members.length - a.members.length).slice(0, 6).map(pub),
    crisis: list.filter((o) => o.cash < 0 || o.reputation < 30).map(pub),
    rivalries: list.flatMap((o) => Object.entries(o.relations).filter(([id, r]) => r.type === 'rivalidade' && o.id < id).map(([id, r]) => ({ a: { id: o.id, name: o.name, color: o.color }, b: (() => { const x = orgById(w, id); return x ? { id, name: x.name, color: x.color } : null; })(), since: r.since }))).filter((x) => x.b).slice(0, 8),
    alliances: list.flatMap((o) => Object.entries(o.relations).filter(([id, r]) => r.type === 'alianca' && o.id < id).map(([id]) => { const x = orgById(w, id); return x ? { a: { id: o.id, name: o.name, color: o.color }, b: { id, name: x.name, color: x.color } } : null; })).filter(Boolean).slice(0, 8),
    leaders: list.map((o) => leaderOf(w, o)).filter(Boolean).slice(0, 8).map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color })),
    invites: list.filter((o) => o.userInvite && !o.userMember).map(pub),
    mine: list.filter((o) => o.userMember).map((o) => publicOrg(w, o, true)),
    all: list.map(pub),
    news: (w.events || []).filter((e) => e.refs?.some((r) => r.t === 'org')).slice(-10).reverse().map((e) => ({ at: e.at, title: e.title })),
  };
}

export function requestJoin(ctx, orgId) {
  const w = ctx.w; const o = orgById(w, orgId); const u = account(w);
  if (!o || o.dissolvedAt) throw new Error('Organização não encontrada');
  if (o.userMember) throw new Error('Você já faz parte');
  // critérios: reputação e, para submundo, um pé no submundo
  const need = o.cat === 'politica' ? 55 : o.cat === 'empresarial' ? 50 : 40;
  if (o.secret && (u.underworld || 0) < 20) throw new Error('Essa sociedade não aceita qualquer um. Você ainda não é conhecido nesse meio.');
  if (u.reputation < need) throw new Error(`A ${o.name} exige reputação ${need} (a sua é ${u.reputation}). Construa seu nome na cidade.`);
  joinUser(ctx, o, 'recruta');
  return publicOrg(w, o, true);
}
export function acceptInvite(ctx, orgId) {
  const w = ctx.w; const o = orgById(w, orgId);
  if (!o || !o.userInvite) throw new Error('Não há convite dessa organização');
  joinUser(ctx, o, o.userInvite.role || 'membro'); o.userInvite = null;
  return publicOrg(w, o, true);
}
function joinUser(ctx, o, role) {
  const w = ctx.w;
  o.members.push({ personaId: 'me', role, since: ctx.at.toISOString() });
  o.userMember = true; o.userRole = role; o.userInvite = null;
  account(w).orgs = [...new Set([...(account(w).orgs || []), o.id])];
  logOrg(o, ctx, `${userName(ctx)} entrou como ${roleLabel(role)}.`);
  record(ctx, { type: 'org-entrou', cat: 'pessoal', title: `Você entrou na ${o.name}`, actors: ['me'], refs: [{ t: 'org', id: o.id }], importance: 2 });
}
export function leaveOrg(ctx, orgId) {
  const w = ctx.w; const o = orgById(w, orgId);
  if (!o || !o.userMember) throw new Error('Você não faz parte dessa organização');
  o.members = o.members.filter((m) => m.personaId !== 'me'); o.userMember = false; o.userRole = null;
  account(w).orgs = (account(w).orgs || []).filter((x) => x !== o.id);
  record(ctx, { type: 'org-saiu', cat: 'pessoal', title: `Você saiu da ${o.name}`, actors: ['me'], refs: [{ t: 'org', id: o.id }], importance: 1 });
  return { ok: true };
}
