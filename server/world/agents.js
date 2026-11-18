// AI AGENTS — as pessoas do mundo.
// Cada pessoa da Rede ganha uma "vida de agente": rotina no próprio fuso, traços (ambição, sociabilidade,
// honestidade, fofoca, temperamento, curiosidade), necessidades estilo The Sims, dinheiro, relacionamentos
// com outras pessoas e uma relação própria com o usuário (afeto, confiança, promessas, saudade).
// As decisões são por regras e pesos (consistentes com a personalidade), sem gastar IA; a IA entra só
// para escrever textos quando há cota. Emoções são estados simulados, não consciência.
import {
  onHourly, onDaily, onTick, onGenesis, handle, record, schedule, pace, actorRef,
} from './core.js';
import {
  rnd, pick, chance, clamp, uid, nowIso, MIN, HOUR, DAY, ago, str, weighted, gauss, shuffle, cap, dayKey,
} from './util.js';
import {
  net, worldPost, remember, genderize, userInteractionHooks, removalGuards, personaRemovedHooks, publicPersona,
} from '../social.js';
import { notify, emit } from '../notify.js';
import { db } from '../db.js';
import { deliverMessage, listConversations } from '../assistant.js';
import { debit, credit, account } from './bank.js';

// ---------------------------------------------------------------- ações registradas pelos módulos
const ACTIONS = [];
// { name, weight(ctx, p) -> número, run(ctx, p) }
export const registerAction = (a) => ACTIONS.push(a);

export const REL_LABEL = {
  desconhecido: 'Desconhecido', conhecido: 'Conhecido', amigo: 'Amigo', 'melhor-amigo': 'Melhor amigo', rival: 'Rival', inimigo: 'Inimigo',
  namoro: 'Namoro', casado: 'Casados', familia: 'Família', colega: 'Colega de trabalho',
};
const BOND = new Set(['namoro', 'casado', 'familia']);
export function relType(r) {
  if (!r) return 'desconhecido';
  if (BOND.has(r.bond)) return r.bond;
  if (r.aff <= -60) return 'inimigo';
  if (r.aff <= -25) return 'rival';
  if (r.aff >= 70) return 'melhor-amigo';
  if (r.aff >= 35) return 'amigo';
  if (r.colleague) return 'colega';
  if (r.aff >= 3 || r.met) return 'conhecido';
  return 'desconhecido';
}

// ---------------------------------------------------------------- criação do agente
const TRAIT_HINTS = [
  [/ansios|perfeccion/, { volatility: 0.15 }], [/explosiv|teimos|dramátic|dramatic/, { volatility: 0.3 }], [/calm|zen|reflexiv/, { volatility: -0.25 }],
  [/engraçad|divertid|curios/, { sociability: 0.2, curiosity: 0.2 }], [/tímid/, { sociability: -0.3 }], [/competitiv|sonhador/, { ambition: 0.3 }],
  [/leal|carinhos|doce|sentimental/, { honesty: 0.2 }], [/sarcástic|desconfiad|polêmic|arrogant/, { gossip: 0.2, honesty: -0.1 }],
];
export function agentOf(w, p) {
  if (p.agent) return p.agent;
  const t = { ambition: Math.random(), sociability: Math.random(), honesty: 0.12 + Math.random() * 0.88, gossip: Math.random(), volatility: Math.random() * 0.8, curiosity: Math.random() };
  const words = (p.traits || []).join(' ').toLowerCase();
  for (const [re, add] of TRAIT_HINTS) if (re.test(words)) for (const [k, v] of Object.entries(add)) t[k] = clamp(t[k] + v, 0, 1);
  const night = /enfermeir|motorista|segurança|garçom|garçonete|streamer|músico/.test(p.job || '') && chance(0.5);
  const wake = night ? 11 + rnd(3) : 5 + rnd(4);
  const sleep = night ? 3 + rnd(2) : 22 + rnd(3); // 24 = meia-noite, 25 = 1h
  const workStart = night ? 18 + rnd(2) : 8 + rnd(2);
  const month = 1 + rnd(12);
  p.agent = {
    traits: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v * 100) / 100])),
    needs: { social: 50 + rnd(40), fun: 50 + rnd(40), energy: 60 + rnd(35), money: 50 },
    routine: { wake, sleep, workStart, workEnd: (workStart + 8) % 24 },
    cash: Math.round(Math.exp(gauss(8.2, 0.9))), // ~ 800 a 20 mil NXC
    birthday: `${String(month).padStart(2, '0')}-${String(1 + rnd(28)).padStart(2, '0')}`,
    ideology: Math.round(clamp(gauss(0, 0.5) + (t.ambition - 0.5) * 0.4, -1, 1) * 100) / 100,
    autonomy: 'normal', status: 'ativo', statusUntil: null, resident: false, districtId: null,
    companyId: null, role: null, salary: 0, skill: Math.round((0.6 + Math.random() * 0.8) * 100) / 100, diplomas: [],
    partyId: null, clubId: null, rel: {},
    user: { aff: p.friend ? 30 : 0, trust: 50, lastContact: p.friendSince || null, metAt: p.friend ? (p.friendSince || nowIso()) : null, notes: [], lastMiss: null, lastCall: null },
  };
  // relação antiga (contador simples da 2.0) vira afeto
  for (const [k, v] of Object.entries(p.relations || {})) {
    if (k === 'me') p.agent.user.aff = clamp(p.agent.user.aff + v, -100, 100);
    else p.agent.rel[k] = { aff: clamp(v * 3, -100, 100), trust: 50, met: true, since: p.createdAt };
  }
  return p.agent;
}

export const people = (w) => (w.social?.personas || []);
export const personById = (w, id) => people(w).find((p) => p.id === id);
export const residents = (w) => people(w).filter((p) => p.agent?.resident && p.agent.status !== 'saiu');
export const active = (p) => !p.agent || p.agent.status === 'ativo';
export function localHour(p, at = new Date()) { return (at.getUTCHours() + (p.tz ?? -3) + 24) % 24; }
export function isAwake(p, at = new Date()) {
  const a = p.agent; if (!a) return true;
  const h = localHour(p, at);
  const sleep = a.routine.sleep % 24;
  return a.routine.sleep >= 24 ? (h >= a.routine.wake || h < sleep) : (h >= a.routine.wake && h < sleep);
}
export function isWorking(p, at = new Date()) {
  const a = p.agent; if (!a?.companyId) return false;
  const h = localHour(p, at); const { workStart: s, workEnd: e } = a.routine;
  if (new Date(at.getTime() + (p.tz ?? -3) * HOUR).getUTCDay() === 0) return false; // domingo de folga
  return s < e ? h >= s && h < e : h >= s || h < e;
}

// ---------------------------------------------------------------- relacionamentos
const weightedPick = (list, fn) => weighted(list.map((x) => [x, fn(x)]));
export function rel(p, otherId) { const a = p.agent; return (a.rel[otherId] ??= { aff: 0, trust: 40, met: false, since: nowIso() }); }
export function bump(ctx, a, b, delta, { trust = 0, reason = '', symmetric = 0.7 } = {}) {
  if (!a?.agent || !b?.agent || a.id === b.id) return;
  const ra = rel(a, b.id); const rb = rel(b, a.id);
  const before = [relType(ra), relType(rb)];
  ra.aff = clamp(ra.aff + delta, -100, 100); ra.trust = clamp(ra.trust + trust, 0, 100); ra.met = true; ra.last = ctx.at.toISOString();
  rb.aff = clamp(rb.aff + delta * symmetric + gauss(0, 1), -100, 100); rb.trust = clamp(rb.trust + trust * symmetric, 0, 100); rb.met = true; rb.last = ra.last;
  const after = relType(ra);
  if (after !== before[0]) relationChanged(ctx, a, b, before[0], after, reason);
}
function relationChanged(ctx, a, b, from, to, reason) {
  const pairs = {
    'melhor-amigo': [`${a.name} e ${b.name} agora são melhores amigos`, 2, 'pessoal'],
    amigo: null, // amizade comum vira só memória (o arquivo guarda o que marca)
    rival: [`${a.name} e ${b.name} viraram rivais`, 2, 'pessoal'],
    inimigo: [`${a.name} rompeu de vez com ${b.name}`, 3, 'pessoal'],
  };
  const info = pairs[to];
  const memo = { 'melhor-amigo': `Virei melhor amiga(o) de ${b.name}.`, amigo: `Fiquei amiga(o) de ${b.name}.`, rival: `${b.name} virou minha rival(o).`, inimigo: `Rompi de vez com ${b.name}.` }[to];
  if (!info) { if (memo && from !== 'melhor-amigo') remember(a, genderize(a, memo), ctx.at.toISOString()); return; }
  const ev = record(ctx, { type: 'relacao', cat: info[2], title: info[0], text: reason || '', actors: [a.id, b.id], importance: info[1], data: { from, to } });
  remember(a, genderize(a, memo || `${b.name}: ${REL_LABEL[to]}.`), ev.at);
  remember(b, genderize(b, { 'melhor-amigo': `Virei melhor amiga(o) de ${a.name}.`, rival: `${a.name} virou minha rival(o).`, inimigo: `${a.name} rompeu comigo.` }[to] || `${a.name}: ${REL_LABEL[to]}.`), ev.at);
  if (to === 'inimigo' && chance(0.6)) worldPost(ctx, a, genderize(a, pick(['Tem gente que mostra quem é de verdade. Aprendi.', 'Cortei uma pessoa da minha vida hoje. Paz.', 'Decepção tem nome e sobrenome. Não vou expor. Ainda.'])), { kind: 'indireta' });
}

// relação do usuário com uma pessoa
export function userRel(p) { return p.agent?.user || { aff: 0, trust: 50 }; }
export function bumpUser(ctx, p, delta, { trust = 0, note = '', contact = false } = {}) {
  const a = p.agent; if (!a) return;
  const before = relType({ aff: a.user.aff, bond: a.user.bond, met: Boolean(a.user.metAt) });
  a.user.aff = clamp(a.user.aff + delta, -100, 100);
  a.user.trust = clamp(a.user.trust + trust, 0, 100);
  a.user.metAt ??= nowIso();
  if (contact) a.user.lastContact = nowIso();
  if (note) { a.user.notes.push({ at: nowIso(), text: str(note, 200) }); cap(a.user.notes, 30); remember(p, note); }
  const after = relType({ aff: a.user.aff, bond: a.user.bond, met: true });
  if (after !== before && ['melhor-amigo', 'rival', 'inimigo', 'amigo'].includes(after)) {
    record(ctx, { type: 'relacao-usuario', cat: 'pessoal', title: `${p.name}: ${REL_LABEL[after].toLowerCase()} seu agora`, text: note, actors: [p.id, 'me'], importance: 2, data: { from: before, to: after } });
    notify(ctx.uid, { type: 'system', title: `${p.name} · ${REL_LABEL[after]}`, message: `Sua relação com ${p.name} mudou: agora é ${REL_LABEL[after].toLowerCase()}.`, link: '#/social/relacoes' });
  }
}

// ---------------------------------------------------------------- rumores e segredos
const SECRETS = [
  'está pensando em pedir demissão', 'está com dívidas que ninguém sabe', 'gosta de alguém do trabalho', 'vai se mudar de cidade', 'já foi preso(a) quando jovem',
  'está fazendo terapia', 'está procurando outro emprego escondido', 'perdeu muito dinheiro apostando', 'brigou feio com a família', 'está escrevendo um livro',
];
export function rumors(w) { return (w.rumors ??= []); }
export function createRumor(ctx, { about, aboutType = 'persona', originId, text, truth = 'verdadeiro', storyId = null }) {
  const r = { id: uid(), aboutType, aboutId: about, originId, text: str(text, 240), truth, at: ctx.at.toISOString(), knownBy: [{ id: originId, from: null, at: ctx.at.toISOString(), text: str(text, 240), truth }], posted: [], storyId };
  rumors(ctx.w).push(r);
  cap(rumors(ctx.w), 300);
  return r;
}
function mutate(text, truth) {
  if (truth === 'verdadeiro' && chance(0.18)) return { text: `parece que ${text}`, truth: 'parcial' };
  if (truth === 'parcial' && chance(0.25)) return { text: text.replace(/^parece que /, 'com certeza ').replace(/^ouvi dizer que /, ''), truth: 'falso' };
  if (chance(0.12)) return { text: `ouvi dizer que ${text.replace(/^(parece que|ouvi dizer que) /, '')}`, truth };
  return { text, truth };
}
function spreadRumor(ctx, from, to) {
  const known = rumors(ctx.w).filter((r) => r.knownBy.some((k) => k.id === from.id) && !r.knownBy.some((k) => k.id === to.id) && r.aboutId !== to.id);
  if (!known.length) return null;
  const r = pick(known);
  const mine = r.knownBy.find((k) => k.id === from.id);
  const m = mutate(mine.text, mine.truth);
  r.knownBy.push({ id: to.id, from: from.id, at: ctx.at.toISOString(), text: m.text, truth: m.truth });
  remember(to, `${from.name} me contou que ${m.text}.`, ctx.at.toISOString());
  // quem gosta de uma fofoca e tem plateia solta uma indireta
  if (to.agent.traits.gossip > 0.65 && chance(0.25) && !r.posted.length) {
    const about = r.aboutType === 'persona' ? personById(ctx.w, r.aboutId) : null;
    const post = worldPost(ctx, to, genderize(to, pick([
      'Tem gente aqui que acha que ninguém sabe de nada... 👀', 'Não vou citar nomes, mas a verdade sempre aparece.', 'Fiquei sabendo de cada coisa hoje que nem te conto 🤐',
      `Alguém aqui conhece bem ${about ? about.name.split(' ')[0] : 'certas pessoas'}? Porque eu tô chocada(o).`,
    ])), { kind: 'indireta', rumorId: r.id });
    if (post) r.posted.push(post.id);
    record(ctx, { type: 'indireta', cat: 'sociedade', title: `${to.name} soltou uma indireta na Rede`, text: `Boatos circulam${about ? ` envolvendo ${about.name}` : ''}.`, actors: [to.id, ...(about ? [about.id] : [])], importance: 2, data: { rumorId: r.id } });
  }
  return r;
}

// ---------------------------------------------------------------- ações sociais (registradas no laço de decisão)
registerAction({
  name: 'socializar',
  weight: (ctx, p) => (100 - p.agent.needs.social) / 40 + p.agent.traits.sociability,
  run(ctx, p) {
    const w = ctx.w; const a = p.agent;
    const known = Object.entries(a.rel).filter(([, r]) => r.aff > -30).map(([id]) => personById(w, id)).filter((x) => x?.agent && active(x) && isAwake(x, ctx.at));
    const strangers = (a.resident ? residents(w) : people(w)).filter((x) => x.id !== p.id && x.agent && active(x) && !a.rel[x.id]?.met);
    // a gente procura mais quem já gosta (e às vezes conhece alguém novo)
    const other = (known.length && chance(0.8)) ? weightedPick(known, (x) => 8 + Math.max(0, a.rel[x.id].aff)) : pick(strangers);
    if (!other) return;
    a.needs.social = clamp(a.needs.social + 25, 0, 100);
    other.agent.needs.social = clamp(other.agent.needs.social + 15, 0, 100);
    const shared = (p.interests || []).filter((i) => (other.interests || []).includes(i)).length;
    const clash = (a.traits.volatility + other.agent.traits.volatility) / 2;
    const delta = Math.round(gauss(4 + shared * 5 - clash * 5, 6));
    const fight = delta < -6 && clash > 0.5 && chance(0.5);
    bump(ctx, p, other, fight ? delta - 8 : delta, { trust: delta > 0 ? 2 : -3, reason: fight ? 'discussão' : shared ? `em comum: ${(p.interests || []).find((i) => (other.interests || []).includes(i))}` : '' });
    if (fight) {
      record(ctx, { type: 'briga', cat: 'pessoal', title: `${p.name} e ${other.name} discutiram`, text: pick(['A conversa esquentou e terminou mal.', 'Uma discordância boba virou briga.', 'Os dois saíram irritados.']), actors: [p.id, other.id], importance: 1 });
      p.mood = { emotion: 'irritada', intensity: 0.7, reason: `discutiu com ${other.name.split(' ')[0]}` };
    }
    // fofoca: quem confia, conta
    if (rel(p, other.id).trust > 45 && chance(a.traits.gossip * 0.6)) spreadRumor(ctx, p, other);
    // segredo: só para quem é muito próximo
    if (rel(p, other.id).trust > 75 && chance(0.04)) {
      const secret = genderize(p, pick(SECRETS));
      createRumor(ctx, { about: p.id, originId: other.id, text: `${p.name} ${secret}`, truth: 'verdadeiro' });
      remember(other, `${p.name} me contou um segredo.`, ctx.at.toISOString());
    }
    // romance
    const r = rel(p, other.id);
    const single = (x) => !Object.values(x.agent.rel).some((v) => v.bond === 'namoro' || v.bond === 'casado');
    if (!r.bond && r.aff >= 55 && single(p) && single(other) && p.age >= 18 && other.age >= 18 && Math.abs(p.age - other.age) <= 12 && chance(0.06)) {
      r.bond = 'namoro'; rel(other, p.id).bond = 'namoro'; r.bondSince = ctx.at.toISOString(); rel(other, p.id).bondSince = r.bondSince;
      const story = uid();
      const ev = record(ctx, { type: 'namoro', cat: 'pessoal', title: `${p.name} e ${other.name} estão namorando`, text: 'Assumiram o relacionamento na Rede.', actors: [p.id, other.id], importance: 2, storyId: story });
      worldPost(ctx, p, genderize(p, pick([`Oficialmente com ${other.name.split(' ')[0]} ❤️`, `Não sei explicar, só sei que tô feliz. ${other.name.split(' ')[0]} 💘`])));
      remember(p, `Comecei a namorar ${other.name}.`, ev.at); remember(other, `Comecei a namorar ${p.name}.`, ev.at);
      schedule(ctx, new Date(ctx.at.getTime() + (12 + rnd(20)) * DAY), 'romance-passo', { a: p.id, b: other.id, story });
    }
    if (r.bond === 'namoro' && r.aff < 10 && chance(0.3)) {
      delete r.bond; delete rel(other, p.id).bond;
      record(ctx, { type: 'termino', cat: 'pessoal', title: `${p.name} e ${other.name} terminaram`, actors: [p.id, other.id], importance: 2 });
      p.mood = { emotion: 'triste', intensity: 0.9, reason: 'terminou o namoro' }; other.mood = { emotion: 'triste', intensity: 0.8, reason: 'o namoro acabou' };
      worldPost(ctx, p, genderize(p, pick(['Acabou. Preciso de um tempo.', 'Às vezes amor não basta.'])));
    }
  },
});

registerAction({
  name: 'organizar-evento',
  weight: (ctx, p) => (p.agent.traits.sociability > 0.6 && p.agent.resident && p.agent.cash > 800 && Object.values(p.agent.rel).filter((r) => r.aff > 20).length >= 3 ? 0.12 : 0),
  run(ctx, p) { planEvent(ctx, p, pick(['festa', 'festa', 'churrasco', 'noite-de-jogos', 'happy-hour'])); },
});

// ---------------------------------------------------------------- eventos sociais e convites
export const EVENT_KINDS = {
  aniversario: 'Aniversário', festa: 'Festa', churrasco: 'Churrasco', 'noite-de-jogos': 'Noite de jogos', 'happy-hour': 'Happy hour', casamento: 'Casamento',
  lancamento: 'Lançamento', reuniao: 'Reunião de negócios', debate: 'Debate', partida: 'Jogo da Liga Nexus', estreia: 'Estreia de cinema', comicio: 'Comício', formatura: 'Formatura',
};
export function invites(w) { return (w.invites ??= []); }
export function planEvent(ctx, host, kind, { at = null, title = null, place = null, guests = null, extra = {}, inviteUser = null } = {}) {
  const w = ctx.w;
  if (invites(w).some((i) => i.hostId === host.id && i.status === 'agendado')) return null;
  if (!guests && !inviteUser && Object.values(host.agent.rel).filter((r) => r.aff > 20).length < 2 && !['casamento', 'lancamento', 'debate', 'partida'].includes(kind)) return null;
  const when = at || nextEvening(ctx.at, 1 + rnd(3));
  const places = (w.city?.places || []).filter((pl) => ['bar', 'salao', 'parque', 'restaurante', 'clube', 'cobertura'].includes(pl.kind));
  const pl = place || pick(places);
  const friends = Object.entries(host.agent.rel).filter(([, r]) => r.aff > 20).sort((a, b) => b[1].aff - a[1].aff).slice(0, 12).map(([id]) => id);
  const ev = {
    id: uid(), hostId: host.id, kind, title: title || `${EVENT_KINDS[kind] || 'Evento'} de ${host.name.split(' ')[0]}`, placeId: pl?.id || null, place: pl?.name || 'casa de ' + host.name.split(' ')[0],
    at: when.toISOString(), endAt: new Date(when.getTime() + 4 * HOUR).toISOString(), guests: guests || friends, going: [], user: null, status: 'agendado', createdAt: ctx.at.toISOString(), ...extra,
  };
  const uaff = userRel(host).aff;
  const shouldInvite = inviteUser ?? (uaff >= 20 || (host.friend && uaff >= 5));
  if (shouldInvite) {
    ev.user = 'pendente';
    ev.msg = genderize(host, pick([
      `Espero que você apareça! Faz tempo que não conversamos.`, `Vai ser especial, queria muito você lá.`, `Sem você não tem graça, hein!`, `Bora? Vai ter gente legal.`,
    ]));
  }
  invites(w).push(ev);
  cap(invites(w), 200);
  schedule(ctx, when, 'evento-inicio', { id: ev.id });
  schedule(ctx, new Date(ev.endAt), 'evento-fim', { id: ev.id });
  record(ctx, { type: 'evento-marcado', cat: kind === 'casamento' ? 'celebridades' : 'sociedade', title: `${host.name} marcou: ${ev.title}`, text: `${ev.place}, ${fmtWhen(when)}.`, actors: [host.id], importance: kind === 'casamento' ? 3 : 1, data: { inviteId: ev.id } });
  if (ev.user === 'pendente' && ctx.live) {
    notify(ctx.uid, { type: 'system', title: `📩 Convite: ${ev.title}`, message: `${host.name} convidou você · ${ev.place}, ${fmtWhen(when)}. "${ev.msg}"`, link: '#/social/eventos' });
    emit(ctx.uid, 'world', { type: 'invite', invite: publicInvite(w, ev) });
  }
  return ev;
}
const fmtWhen = (d) => d.toLocaleString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
function nextEvening(from, days) { const d = new Date(from.getTime() + days * DAY); d.setHours(19 + rnd(3), pick([0, 30]), 0, 0); return d; }

export function publicInvite(w, i) {
  const host = personById(w, i.hostId);
  return { id: i.id, kind: i.kind, kindLabel: EVENT_KINDS[i.kind] || i.kind, title: i.title, place: i.place, at: i.at, endAt: i.endAt, msg: i.msg || '', user: i.user, status: i.status, outcome: i.outcome || null,
    host: host ? { id: host.id, name: host.name, avatar: host.avatar, color: host.color } : actorRef(w, i.hostId), going: i.going.length, guests: i.guests.length };
}

handle('evento-inicio', (ctx, { id }) => {
  const ev = invites(ctx.w).find((x) => x.id === id);
  if (!ev || ev.status !== 'agendado') return;
  const host = personById(ctx.w, ev.hostId);
  if (!host || !active(host)) { ev.status = 'cancelado'; record(ctx, { type: 'evento-cancelado', cat: 'sociedade', title: `${ev.title} foi cancelado`, actors: [ev.hostId], importance: 1 }); return; }
  ev.status = 'acontecendo';
  ev.going = ev.guests.filter((gid) => { const g = personById(ctx.w, gid); return g?.agent && active(g) && rel(g, host.id).aff > 0 && chance(0.55 + rel(g, host.id).aff / 250); });
  if (ev.user === 'aceito') ev.going.push('me');
});
handle('evento-fim', (ctx, { id }) => {
  const w = ctx.w;
  const ev = invites(w).find((x) => x.id === id);
  if (!ev || ev.status !== 'acontecendo') return;
  ev.status = 'encerrado';
  const host = personById(w, ev.hostId);
  if (!host) return;
  const guests = ev.going.filter((g) => g !== 'me').map((gid) => personById(w, gid)).filter(Boolean);
  for (const g of guests) { bump(ctx, host, g, 4 + rnd(4), { trust: 2 }); g.agent.needs.fun = clamp(g.agent.needs.fun + 30, 0, 100); }
  host.agent.needs.fun = 100; host.agent.needs.social = 100;
  // pares que se conheceram na festa
  for (let i = 0; i < Math.min(3, guests.length - 1); i++) { const [x, y] = shuffle(guests).slice(0, 2); if (x && y) bump(ctx, x, y, 3 + rnd(5), { trust: 1, reason: `se conheceram em ${ev.title}` }); }
  const userWent = ev.user === 'aceito';
  if (ev.user) {
    if (userWent) bumpUser(ctx, host, 8, { trust: 6, note: `${userName(ctx)} foi ao meu evento (${ev.title}).`, contact: true });
    else if (ev.user === 'recusado') bumpUser(ctx, host, -2, { note: `${userName(ctx)} não pôde ir ao meu evento (${ev.title}).` });
    else { bumpUser(ctx, host, -5, { trust: -4, note: `${userName(ctx)} nem respondeu o convite para ${ev.title}.` }); if (host.friend && host.botId) dm(ctx, host, genderize(host, pick(['Senti sua falta ontem... nem respondeu o convite 😕', 'Te esperei lá, viu? Tudo bem com você?']))); }
  }
  ev.outcome = { guests: guests.length + (userWent ? 1 : 0), userWent };
  if (!ev.outcome.guests) {
    host.mood = { emotion: 'sozinha', intensity: 0.8, reason: `ninguém foi ao ${ev.title.toLowerCase()}` };
    record(ctx, { type: 'evento-vazio', cat: 'pessoal', title: `Ninguém apareceu em ${ev.title}`, actors: [host.id], importance: 1, data: { inviteId: ev.id } });
    worldPost(ctx, host, genderize(host, pick(['Fiz tudo com tanto carinho e ninguém veio. Tudo bem. 🙂', 'Lição aprendida: não esperar nada de ninguém.'])), { kind: 'desabafo' });
    return;
  }
  const imp = ev.kind === 'casamento' ? 3 : (host.followers || 0) > 20000 ? 3 : 1;
  record(ctx, { type: 'evento-realizado', cat: imp >= 3 ? 'celebridades' : 'sociedade', title: `${ev.title} reuniu ${ev.outcome.guests} pessoa(s)`, text: `${ev.place}.${userWent ? ' Você estava lá.' : ''}`, actors: [host.id, ...guests.slice(0, 6).map((g) => g.id), ...(userWent ? ['me'] : [])], importance: imp, data: { inviteId: ev.id } });
  worldPost(ctx, host, genderize(host, pick([`Que noite! Obrigada(o) a todo mundo que veio ❤️ ${guests.slice(0, 3).map((g) => `@${g.handle}`).join(' ')}`, `${ev.title}: missão cumprida 🎉`, `Ainda processando essa noite incrível ✨`])), { photo: `${EVENT_KINDS[ev.kind] || 'party'} celebration with friends at ${ev.place}, night, warm lights` });
});
handle('romance-passo', (ctx, { a, b, story }) => {
  const p = personById(ctx.w, a); const q = personById(ctx.w, b);
  if (!p?.agent || !q?.agent) return;
  const r = rel(p, b);
  if (r.bond !== 'namoro') return; // terminaram antes: a história segue outro rumo
  if (r.aff >= 60 && chance(0.6)) {
    r.engaged = true;
    record(ctx, { type: 'noivado', cat: 'pessoal', title: `${p.name} e ${q.name} ficaram noivos`, actors: [a, b], importance: 3, storyId: story });
    worldPost(ctx, p, genderize(p, `EU DISSE SIM!!! 💍 ${q.name.split(' ')[0]}, te amo.`));
    const when = nextEvening(ctx.at, 10 + rnd(10));
    planEvent(ctx, p, 'casamento', { at: when, title: `Casamento de ${p.name.split(' ')[0]} e ${q.name.split(' ')[0]}`, place: pick((ctx.w.city?.places || []).filter((x) => x.kind === 'salao')), extra: { couple: [a, b], storyId: story } });
    schedule(ctx, new Date(when.getTime() + 4 * HOUR + MIN), 'casamento', { a, b, story });
  } else schedule(ctx, new Date(ctx.at.getTime() + (8 + rnd(10)) * DAY), 'romance-passo', { a, b, story });
});
handle('casamento', (ctx, { a, b, story }) => {
  const p = personById(ctx.w, a); const q = personById(ctx.w, b);
  if (!p?.agent || !q?.agent || rel(p, b).bond !== 'namoro') return;
  rel(p, b).bond = 'casado'; rel(q, a).bond = 'casado';
  record(ctx, { type: 'casamento', cat: 'celebridades', title: `${p.name} e ${q.name} se casaram`, actors: [a, b], importance: 3, storyId: story });
  remember(p, `Casei com ${q.name}.`); remember(q, `Casei com ${p.name}.`);
});

// ---------------------------------------------------------------- iniciativas com o usuário
export const userName = (ctx) => (ctx.user?.name || 'você').split(' ')[0];
export function dm(ctx, p, text, kind = 'vida') {
  if (!p.botId) return null;
  const bot = db().bots.find((b) => b.id === p.botId);
  if (!bot) return null;
  deliverMessage(ctx.user, bot, text, { kind });
  record(ctx, { type: 'mensagem-usuario', cat: 'pessoal', title: `${p.name} mandou mensagem para você`, text: str(text, 200), actors: [p.id, 'me'], importance: 1 });
  return true;
}

// pedidos de ajuda: viram promessas quando o usuário diz "prometo"
export function requests(w) { return (w.requests ??= []); }
const REQ = {
  emprestimo: (p) => { const v = 100 * (1 + rnd(12)); return { amount: v, text: `Tô numa situação apertada... você conseguiria me emprestar ${v} NXC? Te devolvo assim que der.` }; },
  conselho: (p) => ({ text: `Preciso de um conselho seu sobre uma coisa: ${p.problem ? p.problem.replace(/^está /, 'tô ') : 'minha vida anda confusa'}. Pode me responder quando tiver um tempinho?` }),
  presenca: () => ({ text: 'Vou fazer uma coisa importante e queria muito você lá. Promete que vai?' }),
};
function makeRequest(ctx, p) {
  const w = ctx.w;
  if (requests(w).some((r) => r.personaId === p.id && ['aberto', 'prometido'].includes(r.status))) return;
  const kind = p.agent.cash < 600 ? 'emprestimo' : chance(0.7) ? 'conselho' : 'presenca';
  if (kind === 'presenca') { const ev = planEvent(ctx, p, pick(['festa', 'happy-hour', 'churrasco']), { inviteUser: true }); if (!ev) return; }
  const body = REQ[kind](p);
  const r = { id: uid(), personaId: p.id, kind, amount: body.amount || 0, text: genderize(p, body.text), at: ctx.at.toISOString(), status: 'aberto', dueAt: null };
  requests(w).push(r);
  cap(requests(w), 200);
  dm(ctx, p, r.text, 'pedido');
  record(ctx, { type: 'pedido', cat: 'pessoal', title: `${p.name} pediu sua ajuda`, text: r.text, actors: [p.id, 'me'], importance: 2, data: { requestId: r.id } });
}
// cumprir/prometer/recusar (chamado pela rota)
export function answerRequest(ctx, r, action) {
  const p = personById(ctx.w, r.personaId);
  if (!p) throw new Error('Essa pessoa saiu da cidade');
  if (action === 'recusar') {
    r.status = 'recusado';
    bumpUser(ctx, p, -4, { trust: -2, note: `${userName(ctx)} disse que não podia me ajudar.` });
    dm(ctx, p, genderize(p, pick(['Tudo bem, eu entendo.', 'Ah... tá bom. Valeu mesmo assim.'])));
    return r;
  }
  if (action === 'prometer') {
    r.status = 'prometido'; r.dueAt = new Date(ctx.at.getTime() + 2 * DAY).toISOString();
    schedule(ctx, new Date(r.dueAt), 'promessa-prazo', { id: r.id });
    bumpUser(ctx, p, 3, { note: `${userName(ctx)} prometeu me ajudar até ${new Date(r.dueAt).toLocaleDateString('pt-BR')}.` });
    dm(ctx, p, genderize(p, pick(['Obrigada(o)! Vou contar com você 🙏', 'Sério? Você é demais. Fico no aguardo!'])));
    return r;
  }
  if (action === 'cumprir') {
    if (r.kind === 'emprestimo') debit(ctx.w, r.amount, `Empréstimo para ${p.name}`, ctx.at);
    if (r.kind === 'conselho' && !r.answered) throw new Error(`Responda ${p.name.split(' ')[0]} no chat: o conselho é dado conversando.`);
    if (r.kind === 'presenca' && !r.attended) throw new Error('Esse pedido se cumpre indo ao evento (aceite o convite).');
    fulfil(ctx, r, p);
    return r;
  }
  throw new Error('Ação inválida');
}
function fulfil(ctx, r, p) {
  const kept = r.status === 'prometido';
  r.status = 'cumprido'; r.doneAt = ctx.at.toISOString();
  if (r.kind === 'emprestimo') { p.agent.cash += r.amount; p.agent.debtToUser = (p.agent.debtToUser || 0) + r.amount; schedule(ctx, new Date(ctx.at.getTime() + (3 + rnd(6)) * DAY), 'devolver', { personaId: p.id, amount: r.amount }); }
  bumpUser(ctx, p, kept ? 12 : 10, { trust: kept ? 15 : 8, note: `${userName(ctx)} ${kept ? 'cumpriu a promessa e ' : ''}me ajudou (${r.kind}).`, contact: true });
  record(ctx, { type: 'ajuda', cat: 'pessoal', title: `Você ajudou ${p.name}`, text: kept ? 'Promessa cumprida.' : '', actors: ['me', p.id], importance: 2 });
  dm(ctx, p, genderize(p, pick(['Você não sabe o quanto isso significou pra mim. Obrigada(o) de verdade ❤️', 'Nunca vou esquecer isso. Valeu!'])));
}
handle('promessa-prazo', (ctx, { id }) => {
  const r = requests(ctx.w).find((x) => x.id === id);
  if (!r || r.status !== 'prometido') return;
  const p = personById(ctx.w, r.personaId);
  r.status = 'quebrado';
  if (!p) return;
  bumpUser(ctx, p, -15, { trust: -25, note: `${userName(ctx)} prometeu me ajudar e não cumpriu.` });
  p.mood = { emotion: 'triste', intensity: 0.7, reason: 'uma promessa não cumprida' };
  record(ctx, { type: 'promessa-quebrada', cat: 'pessoal', title: `Você não cumpriu a promessa feita a ${p.name}`, actors: ['me', p.id], importance: 2 });
  dm(ctx, p, genderize(p, pick(['Você tinha prometido... tudo bem, eu me viro.', 'Achei que podia contar com você. Fiquei chateada(o), não vou mentir.'])));
});
handle('devolver', (ctx, { personaId, amount }) => {
  const p = personById(ctx.w, personaId);
  if (!p?.agent || !p.agent.debtToUser) return;
  if (p.agent.cash < amount + 200 || p.agent.traits.honesty < 0.3) { if (p.agent.traits.honesty >= 0.3) schedule(ctx, new Date(ctx.at.getTime() + 3 * DAY), 'devolver', { personaId, amount }); else record(ctx, { type: 'calote', cat: 'pessoal', title: `${p.name} não devolveu o dinheiro que você emprestou`, actors: [p.id, 'me'], importance: 2 }); return; }
  p.agent.cash -= amount; p.agent.debtToUser -= amount;
  account(ctx.w); credit(ctx.w, amount, `${p.name} devolveu o empréstimo`, ctx.at);
  bumpUser(ctx, p, 3, { trust: 5, note: `Devolvi os ${amount} NXC para ${userName(ctx)}.` });
  dm(ctx, p, `Te mandei os ${amount} NXC que você me emprestou. Obrigada(o) de novo!`.replace('Obrigada(o)', genderize(p, 'Obrigada(o)')));
});

// o usuário falou com alguém no chat
export function userChatted(ctx, personaId) {
  const p = personById(ctx.w, personaId);
  if (!p?.agent) return;
  const today = dayKey();
  const u = p.agent.user;
  if (u.chatDay !== today) { u.chatDay = today; u.chatToday = 0; }
  if (u.chatToday++ < 6) bumpUser(ctx, p, 1, { contact: true });
  else u.lastContact = nowIso();
  for (const r of requests(ctx.w).filter((x) => x.personaId === p.id && x.kind === 'conselho' && ['aberto', 'prometido'].includes(x.status))) { r.answered = true; fulfil(ctx, r, p); }
}

// ---------------------------------------------------------------- laço de decisão (a cada hora do mundo)
const AUTONOMY = { baixa: 0.25, normal: 0.45, alta: 0.75 };
onHourly((ctx) => {
  const w = ctx.w;
  const factor = pace(w).act;
  for (const p of people(w)) {
    const a = agentOf(w, p);
    if (a.status !== 'ativo') {
      if (a.statusUntil && a.statusUntil <= ctx.at.toISOString()) returnFromStatus(ctx, p);
      continue;
    }
    const awake = isAwake(p, ctx.at);
    // necessidades mudam com o tempo
    a.needs.energy = clamp(a.needs.energy + (awake ? -4 : 9), 0, 100);
    a.needs.social = clamp(a.needs.social - (awake ? 3 : 1), 0, 100);
    a.needs.fun = clamp(a.needs.fun - (awake ? 3 : 0), 0, 100);
    a.needs.money = clamp(50 + Math.log10(Math.max(1, a.cash)) * 12 - 40, 0, 100);
    if (!awake) continue;
    // o humor acompanha as necessidades (quando nada forte aconteceu)
    if ((p.mood?.intensity || 0) < 0.5) {
      const low = Object.entries(a.needs).sort((x, y) => x[1] - y[1])[0];
      if (low[1] < 20) p.mood = { emotion: { social: 'sozinha', fun: 'entediada', energy: 'cansada', money: 'ansiosa' }[low[0]], intensity: 0.55, reason: { social: 'sem falar com ninguém', fun: 'dia sem graça', energy: 'muito cansaço', money: 'aperto no bolso' }[low[0]] };
    }
    if (!chance((AUTONOMY[a.autonomy] || 0.45) * factor)) continue;
    const opts = ACTIONS.map((x) => [x, safeWeight(x, ctx, p)]).filter(([, wt]) => wt > 0);
    const act = weighted(opts);
    if (act) { try { act.run(ctx, p); } catch (err) { console.error(`[mundo] ação ${act.name}:`, err.message); } }
  }
});
const safeWeight = (x, ctx, p) => { try { return x.weight(ctx, p) || 0; } catch { return 0; } };

function returnFromStatus(ctx, p) {
  const was = p.agent.status;
  p.agent.status = 'ativo'; p.agent.statusUntil = null;
  if (was === 'preso') record(ctx, { type: 'soltura', cat: 'seguranca', title: `${p.name} foi solto(a)`, actors: [p.id], importance: 2 });
  if (was === 'viajando') { record(ctx, { type: 'volta', cat: 'pessoal', title: `${p.name} voltou de viagem`, actors: [p.id], importance: 1 }); worldPost(ctx, p, genderize(p, 'De volta! Que saudade de casa.')); }
}

// ---------------------------------------------------------------- rotina diária: aniversários, saudade, pedidos
onDaily((ctx) => {
  const w = ctx.w;
  const mmdd = ctx.at.toISOString().slice(5, 10);
  for (const p of people(w)) {
    const a = agentOf(w, p);
    if (a.status !== 'ativo') continue;
    if (a.birthday === mmdd) {
      record(ctx, { type: 'aniversario', cat: 'pessoal', title: `Hoje é aniversário de ${p.name}`, actors: [p.id], importance: (p.followers || 0) > 20000 ? 2 : 1 });
      worldPost(ctx, p, genderize(p, pick(['Mais um ano de vida! Obrigada(o) pelas mensagens 🎂', 'Aniversariante do dia passando 🎉'])));
      if (a.resident && a.traits.sociability > 0.35) planEvent(ctx, p, 'aniversario', { at: nextEvening(ctx.at, 0.2) });
    }
    // relação com o usuário esfria sem contato; amigos sentem falta e falam
    const u = a.user;
    const since = u.lastContact ? ago(u.lastContact) : null;
    if (since && since > 3 * DAY && u.aff > 10) u.aff = clamp(u.aff - 1, -100, 100);
    if (p.friend && p.botId && since && since > 3 * DAY && u.aff >= 30 && (!u.lastMiss || ago(u.lastMiss) > 4 * DAY) && chance(0.5)) {
      u.lastMiss = nowIso();
      dm(ctx, p, genderize(p, pick(['Ei, sumiu! Tá tudo bem por aí?', 'Saudade de conversar com você... aconteceu alguma coisa?', 'Você desapareceu, hein! Me conta as novidades.'])), 'saudade');
    }
    if (p.friend && p.botId && u.trust < 25 && !u.toldUpset && chance(0.5)) {
      u.toldUpset = true;
      dm(ctx, p, genderize(p, 'Posso ser sincera(o)? Ando meio chateada(o) com você. Sinto que não posso contar contigo.'), 'insatisfacao');
    }
    if (u.trust >= 40) u.toldUpset = false;
    // pedido de ajuda (só para quem já é próximo)
    if (p.friend && p.botId && u.aff >= 25 && (p.problem || a.cash < 600) && chance(0.06)) makeRequest(ctx, p);
    // viagem (some por uns dias e volta)
    if (a.cash > 6000 && chance(0.01)) {
      a.status = 'viajando'; a.statusUntil = new Date(ctx.at.getTime() + (2 + rnd(5)) * DAY).toISOString(); a.cash -= 1500;
      record(ctx, { type: 'viagem', cat: 'pessoal', title: `${p.name} saiu de viagem`, actors: [p.id], importance: 1 });
      worldPost(ctx, p, genderize(p, 'Partiu férias ✈️ volto em uns dias!'), { photo: 'airport window view, airplane, travel' });
    }
  }
});

// ---------------------------------------------------------------- ligações (a cada tick, raras)
onTick((ctx) => {
  if (!ctx.live) return;
  const w = ctx.w;
  w.calls ??= [];
  const h = new Date().getHours();
  if (h < 10 || h >= 21) return;
  if (w.calls.some((c) => ago(c.at) < 6 * HOUR)) return;
  const cand = people(w).filter((p) => p.friend && p.botId && p.agent && active(p) && isAwake(p) && p.agent.user.aff >= 45 && (!p.agent.user.lastCall || ago(p.agent.user.lastCall) > 2 * DAY) && (!p.agent.user.lastContact || ago(p.agent.user.lastContact) > 20 * HOUR));
  if (!cand.length || !chance(0.004)) return;
  const p = pick(cand);
  p.agent.user.lastCall = nowIso();
  const conv = listConversations(ctx.uid).find((c) => c.botId === p.botId && !c.group);
  const call = { id: uid(), personaId: p.id, at: nowIso(), status: 'tocando', conversationId: conv?.id || null };
  w.calls.push(call); cap(w.calls, 50);
  emit(ctx.uid, 'world', { type: 'call', call: { id: call.id, conversationId: call.conversationId, persona: { id: p.id, name: p.name, avatar: p.avatar, color: p.color } } });
  schedule(ctx, new Date(Date.now() + 70 * 1000), 'ligacao-perdida', { id: call.id });
});
handle('ligacao-perdida', (ctx, { id }) => {
  const call = (ctx.w.calls || []).find((c) => c.id === id);
  if (!call || call.status !== 'tocando') return;
  call.status = 'perdida';
  const p = personById(ctx.w, call.personaId);
  if (!p) return;
  bumpUser(ctx, p, -1, {});
  dm(ctx, p, genderize(p, pick(['Te liguei agora, mas acho que você tá ocupada(o). Me chama depois!', 'Tentei te ligar 📞 me retorna quando puder.'])), 'ligacao');
  record(ctx, { type: 'ligacao-perdida', cat: 'pessoal', title: `Ligação perdida de ${p.name}`, actors: [p.id, 'me'], importance: 1 });
});
export function answerCall(ctx, id, accept) {
  const call = (ctx.w.calls || []).find((c) => c.id === id);
  if (!call) throw new Error('Ligação não encontrada');
  if (call.status !== 'tocando') return call;
  call.status = accept ? 'atendida' : 'recusada';
  const p = personById(ctx.w, call.personaId);
  if (p) bumpUser(ctx, p, accept ? 3 : -1, { contact: accept, note: accept ? `Liguei para ${userName(ctx)} e conversamos.` : '' });
  return call;
}

// ---------------------------------------------------------------- reações a curtidas/comentários do usuário na Rede
userInteractionHooks.push((user, w, p, kind) => {
  if (!p?.agent) return;
  const ctx = { user, uid: user.id, w, live: true, at: new Date() };
  if (kind === 'like') bumpUser(ctx, p, 1, {});
  if (kind === 'comment') bumpUser(ctx, p, 2, { contact: true });
  if (kind === 'friend') { bumpUser(ctx, p, 10, { contact: true, note: `Virei amiga(o) de ${userName(ctx)}.` }); }
  if (kind === 'unfriend') bumpUser(ctx, p, -20, { trust: -10 });
});
// quem tem papel no mundo não "some" da rede pela limpeza automática
removalGuards.push((p) => !p.agent || (!p.agent.companyId && !p.agent.office && !p.agent.partyLeader && !p.agent.candidate && Math.abs(p.agent.user.aff) < 10 && !p.agent.keep));
personaRemovedHooks.push((user, w, p) => {
  w.gone ??= {};
  w.gone[p.id] = p.name;
  record({ user, uid: user.id, w, live: true, at: new Date() }, { type: 'saiu-da-cidade', cat: 'local', title: `${p.name} saiu da Rede e da cidade`, actors: [p.id], importance: 1 });
  for (const q of people(w)) if (q.agent?.rel[p.id]) delete q.agent.rel[p.id];
});

onGenesis((ctx) => {
  for (const p of people(ctx.w)) agentOf(ctx.w, p);
});

// ---------------------------------------------------------------- dados públicos
export function publicAgent(w, p, full = false) {
  const a = agentOf(w, p);
  const base = { ...publicPersona(w.social, p, full), status: a.status, resident: a.resident, districtId: a.districtId, role: a.role, companyId: a.companyId, autonomy: a.autonomy,
    relation: { type: relType({ aff: a.user.aff, bond: a.user.bond, met: Boolean(a.user.metAt) }), label: REL_LABEL[relType({ aff: a.user.aff, bond: a.user.bond, met: Boolean(a.user.metAt) })], aff: Math.round(a.user.aff), trust: Math.round(a.user.trust), lastContact: a.user.lastContact } };
  if (!full) return base;
  const rels = Object.entries(a.rel).filter(([, r]) => r.met).map(([id, r]) => ({ ...actorRef(w, id), type: relType(r), label: REL_LABEL[relType(r)], aff: Math.round(r.aff), trust: Math.round(r.trust) }))
    .sort((x, y) => Math.abs(y.aff) - Math.abs(x.aff)).slice(0, 20);
  return { ...base, traits: a.traits, needs: a.needs, routine: a.routine, cash: Math.round(a.cash), birthday: a.birthday, ideology: a.ideology, skill: a.skill, diplomas: a.diplomas, partyId: a.partyId, clubId: a.clubId, relations: rels, notes: a.user.notes.slice(-10).reverse() };
}
