// WORLD MAP + cidade: Codeniac Society. Bairros, locais, moradores, clima, Liga Nexus (esportes),
// Universidade e laboratórios (ciência), polícia (crimes, escândalos e desaparecimentos) e expansão da cidade.
import { onDaily, onGenesis, handle, record, schedule, services } from './core.js';
import { registerAction, people, residents, personById, agentOf, active, rumors, createRumor } from './agents.js';
import { account, debit, addXp } from './bank.js';
import { worldPost, remember, genderize, personaAddedHooks } from '../social.js';
import { rnd, pick, chance, clamp, uid, DAY, HOUR, gauss, poisson, cap, shuffle } from './util.js';
import { notify } from '../notify.js';
import { gameNow, cityHour } from './clock.js';
import { courseLessons, maybeLecture } from './society.js';

// ---------------------------------------------------------------- geografia (mapa 1000 × 600)
const DISTRICTS = [
  { id: 'centro', name: 'Centro', kind: 'centro', color: '#3b82f6', value: 1.6, poly: [[330, 170], [600, 150], [700, 230], [640, 350], [380, 360], [300, 260]] },
  { id: 'tech', name: 'Distrito Tech', kind: 'tecnologia', color: '#06b6d4', value: 1.9, poly: [[600, 150], [560, 30], [880, 60], [900, 200], [700, 230]] },
  { id: 'serra', name: 'Alto da Serra', kind: 'residencial', color: '#22c55e', value: 1.3, poly: [[260, 40], [560, 30], [600, 150], [330, 170]] },
  { id: 'jardins', name: 'Jardins', kind: 'nobre', color: '#a855f7', value: 2.2, poly: [[60, 80], [260, 40], [330, 170], [300, 260], [90, 240]] },
  { id: 'campus', name: 'Campus', kind: 'educacao', color: '#f59e0b', value: 1.1, poly: [[700, 230], [900, 200], [950, 380], [760, 420], [640, 350]] },
  { id: 'mercado', name: 'Mercado Velho', kind: 'comercio', color: '#f97316', value: 0.9, poly: [[90, 240], [300, 260], [380, 360], [300, 450], [70, 420]] },
  { id: 'vila', name: 'Vila Operária', kind: 'popular', color: '#ef4444', value: 0.6, poly: [[70, 420], [300, 450], [330, 570], [60, 580]] },
  { id: 'porto', name: 'Porto Neon', kind: 'noturno', color: '#ec4899', value: 1.2, poly: [[300, 450], [380, 360], [640, 350], [760, 420], [700, 570], [330, 570]] },
];
const EXPANSIONS = [
  { id: 'orla', name: 'Nova Orla', kind: 'residencial', color: '#14b8a6', value: 1.5, poly: [[760, 420], [950, 380], [965, 580], [700, 570]], minResidents: 70 },
  { id: 'ilha', name: 'Ilha Digital', kind: 'tecnologia', color: '#8b5cf6', value: 2.4, poly: [[880, 60], [990, 50], [995, 300], [950, 380], [900, 200]], minResidents: 95 },
];
const PLACE_KINDS = [['bar', ['Bar do', 'Boteco', 'Neon Bar']], ['restaurante', ['Cantina', 'Restaurante', 'Bistrô']], ['parque', ['Parque', 'Praça']], ['salao', ['Salão', 'Espaço']], ['clube', ['Clube']]];
const SURN = ['Aurora', 'Estrela', 'Horizonte', 'Neon', 'Lua', 'Pixel', 'Vento', 'Sol', 'Rio', 'Cristal', 'Farol', 'Brisa'];

export function city(w) { return w.city; }
export const districtById = (w, id) => (w.city?.districts || []).find((d) => d.id === id);
function inside(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]; const [xj, yj] = poly[j];
    if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi)) c = !c;
  }
  return c;
}
export function pointIn(d) {
  const xs = d.poly.map((p) => p[0]); const ys = d.poly.map((p) => p[1]);
  for (let i = 0; i < 60; i++) {
    const pt = [Math.min(...xs) + Math.random() * (Math.max(...xs) - Math.min(...xs)), Math.min(...ys) + Math.random() * (Math.max(...ys) - Math.min(...ys))];
    if (inside(pt, d.poly)) return pt.map((v) => Math.round(v));
  }
  return [Math.round(xs.reduce((s, v) => s + v, 0) / xs.length), Math.round(ys.reduce((s, v) => s + v, 0) / ys.length)];
}
function addPlace(w, d, kind, name, extra = {}) {
  const [x, y] = pointIn(d);
  const pl = { id: uid(), name, kind, districtId: d.id, x, y, ...extra };
  w.city.places.push(pl);
  return pl;
}
function makeResident(ctx, p, d = null) {
  const w = ctx.w; const a = agentOf(w, p);
  d = d || pick(w.city.districts.filter((x) => !x.locked));
  a.resident = true; a.districtId = d.id;
  if (!p.origin) p.origin = p.city;
  p.city = `Codeniac Society – ${d.name}`;
  return d;
}

onGenesis((ctx) => {
  const w = ctx.w;
  w.city = { name: 'Codeniac Society', districts: [...DISTRICTS.map((d) => ({ ...d })), ...EXPANSIONS.map((d) => ({ ...d, locked: true }))], places: [], weather: null, expansions: [] };
  for (const d of w.city.districts.filter((x) => !x.locked)) {
    for (const [kind, names] of PLACE_KINDS) if (kind !== 'clube' || chance(0.3)) addPlace(w, d, kind, `${pick(names)} ${pick(SURN)}`);
  }
  const centro = districtById(w, 'centro');
  addPlace(w, centro, 'prefeitura', 'Prefeitura de Codeniac Society');
  addPlace(w, centro, 'cobertura', 'Cobertura Skyline');
  addPlace(w, centro, 'delegacia', 'Delegacia Central');
  addPlace(w, districtById(w, 'campus'), 'universidade', 'Universidade de Codeniac');
  addPlace(w, districtById(w, 'porto'), 'estadio', 'Arena Neon');
  addPlace(w, districtById(w, 'jardins'), 'hospital', 'Hospital Jardins');
  // moradores: a maioria das pessoas da Rede que é do Brasil mora na cidade; o resto é a rede global
  for (const p of people(w)) if ((p.country === 'Brasil' && chance(0.85)) || chance(0.25)) makeResident(ctx, p);
  weather(w, ctx.at);
  // esportes
  w.sports = { clubs: [], season: null, history: [] };
  const CLUBS = [['Nexus FC', '#3b82f6', 'centro'], ['Porto Neon EC', '#ec4899', 'porto'], ['Atlético Serra', '#22c55e', 'serra'], ['Real Jardins', '#a855f7', 'jardins']];
  const athletes = shuffle(residents(w).filter((p) => p.age < 34 && /futebol|academia|corrida|basquete/.test((p.interests || []).join(' '))));
  for (const [name, color, did] of CLUBS) {
    const club = { id: uid(), name, color, districtId: did, strength: 0.9 + Math.random() * 0.3, stars: [], fans: 0 };
    for (const p of athletes.splice(0, 2)) { club.stars.push(p.id); p.agent.clubId = club.id; p.agent.athlete = true; p.agent.keep = true; p.job = `atleta do ${name}`; }
    w.sports.clubs.push(club);
  }
  for (const p of residents(w)) if (!p.agent.clubId && chance(0.6)) p.agent.clubId = (w.sports.clubs.find((c) => c.districtId === p.agent.districtId) || pick(w.sports.clubs)).id;
  newSeason(ctx);
  // educação e ciência
  w.edu = {
    university: 'Universidade de Nexus City',
    courses: [
      { id: 'direito', name: 'Direito', days: 3, cost: 3000, path: 'Polícia ou Ministério' },
      { id: 'adm', name: 'Administração', days: 3, cost: 2200, path: 'Abrir empresa' },
      { id: 'economia', name: 'Economia', days: 3, cost: 2400, path: 'Investir na Bolsa' },
      { id: 'infosec', name: 'Segurança da Informação', days: 3, cost: 2600, path: 'Perícia cibernética' },
      { id: 'prog', name: 'Programação', days: 3, cost: 1500 }, { id: 'dados', name: 'Ciência de dados', days: 3, cost: 2500 },
      { id: 'jorn', name: 'Jornalismo', days: 3, cost: 1200 }, { id: 'med', name: 'Medicina', days: 3, cost: 3200 },
    ],
    labs: [
      { id: uid(), name: 'Laboratório de IA da Universidade', field: 'inteligência artificial', sector: 'tecnologia', progress: rnd(40), project: 'Assistentes que entendem emoções' },
      { id: uid(), name: 'Instituto Quantum — Energia', field: 'energia', sector: 'construcao', progress: rnd(40), project: 'Baterias de grafeno' },
      { id: uid(), name: 'Instituto Quantum — Saúde', field: 'saúde', sector: 'saude', progress: rnd(40), project: 'Vacina de dose única' },
    ],
    discoveries: [],
  };
});

// pessoas novas: metade chega para morar na cidade
personaAddedHooks.push((user, w, p) => {
  if (!w.core?.genesisAt || !w.city) return;
  const ctx = { user, uid: user.id, w, live: true, at: new Date() };
  agentOf(w, p);
  if (chance(0.5)) {
    const d = makeResident(ctx, p);
    record(ctx, { type: 'chegada', cat: 'local', title: `${p.name} se mudou para ${d.name}`, text: `Veio de ${p.origin}.`, actors: [p.id], refs: [{ t: 'district', id: d.id }], importance: 1 });
  }
});

// ---------------------------------------------------------------- clima
const CONDS = [['Céu limpo', '☀️'], ['Poucas nuvens', '🌤️'], ['Nublado', '☁️'], ['Chuva leve', '🌦️'], ['Chuva forte', '🌧️'], ['Neblina', '🌫️'], ['Tempestade', '⛈️']];
function weather(w, at) {
  const m = at.getMonth();
  const base = [27, 27, 26, 24, 21, 19, 18, 20, 22, 24, 25, 26][m];
  const c = pick(m >= 4 && m <= 8 ? CONDS.slice(0, 6) : CONDS);
  w.city.weather = { base: base + Math.round(gauss(0, 2)), cond: c[0], icon: c[1], day: at.toISOString().slice(0, 10) };
}
// clima segue o relógio da cidade: muda a cada dia de Nexus City (40 min reais) e a temperatura acompanha a hora
export function weatherNow(w) {
  if (!w.city?.weather) return null;
  const g = gameNow(); const gday = Math.floor((g - 3 * HOUR) / DAY);
  if (w.city.weather.gday !== gday) { weather(w, new Date(g)); w.city.weather.gday = gday; }
  const wt = w.city.weather;
  const h = Math.floor(cityHour(g));
  const temp = Math.round(wt.base + Math.sin(((h - 9) / 24) * Math.PI * 2) * 4);
  return { temp, cond: wt.cond, icon: h >= 19 || h < 6 ? (wt.icon === '☀️' ? '🌙' : wt.icon) : wt.icon };
}
onDaily((ctx) => { weather(ctx.w, ctx.at); });

// ---------------------------------------------------------------- expansão da cidade
onDaily((ctx) => {
  const w = ctx.w;
  const n = residents(w).length;
  for (const d of w.city.districts.filter((x) => x.locked)) {
    if (n >= d.minResidents) {
      d.locked = false;
      for (const [kind, names] of PLACE_KINDS.slice(0, 3)) addPlace(w, d, kind, `${pick(names)} ${pick(SURN)}`);
      w.city.expansions.push({ id: d.id, at: ctx.at.toISOString() });
      record(ctx, { type: 'expansao', cat: 'local', title: `Codeniac Society cresce: nasce o bairro ${d.name}`, text: `A cidade passou de ${d.minResidents} moradores registrados e a prefeitura liberou a nova área.`, refs: [{ t: 'district', id: d.id }], importance: 4 });
    }
  }
});

// ---------------------------------------------------------------- esportes: Liga Nexus
function newSeason(ctx) {
  const w = ctx.w; const s = w.sports;
  const n = (s.season?.n || 0) + 1;
  const clubs = s.clubs.map((c) => c.id);
  const pairs = [];
  for (let i = 0; i < clubs.length; i++) for (let j = i + 1; j < clubs.length; j++) pairs.push([clubs[i], clubs[j]], [clubs[j], clubs[i]]);
  const order = shuffle(pairs);
  const start = new Date(ctx.at.getTime() + DAY); start.setHours(20, 0, 0, 0);
  const matches = order.map(([home, away], i) => ({ id: uid(), home, away, at: new Date(start.getTime() + Math.floor(i / 2) * 2 * DAY + (i % 2) * HOUR).toISOString(), score: null, status: 'agendada' }));
  s.season = { n, table: Object.fromEntries(clubs.map((c) => [c, { p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }])), matches, startedAt: ctx.at.toISOString() };
  for (const m of matches) schedule(ctx, new Date(m.at), 'partida', { id: m.id, season: n });
}
handle('partida', (ctx, { id, season }) => {
  const w = ctx.w; const s = w.sports;
  if (!s?.season || s.season.n !== season) return;
  const m = s.season.matches.find((x) => x.id === id);
  if (!m || m.status !== 'agendada') return;
  const club = (cid) => s.clubs.find((c) => c.id === cid);
  const H = club(m.home); const A = club(m.away);
  const power = (c) => c.strength * (1 + c.stars.map((pid) => personById(w, pid)).filter((p) => p?.agent && active(p)).reduce((t, p) => t + (p.agent.skill - 1) * 0.15, 0));
  const gh = poisson(1.35 * power(H) / power(A) * 1.1); const ga = poisson(1.35 * power(A) / power(H));
  m.score = [gh, ga]; m.status = 'encerrada';
  const t = s.season.table;
  const upd = (cid, f, a) => { const r = t[cid]; r.p++; r.gf += f; r.ga += a; if (f > a) { r.w++; r.pts += 3; } else if (f === a) { r.d++; r.pts++; } else r.l++; };
  upd(m.home, gh, ga); upd(m.away, ga, gh);
  const winner = gh > ga ? H : ga > gh ? A : null;
  const scorers = [...H.stars, ...A.stars].map((pid) => personById(w, pid)).filter(Boolean);
  const hero = winner ? personById(w, pick(winner.stars)) : null;
  record(ctx, { type: 'partida', cat: 'esportes', title: `${H.name} ${gh} × ${ga} ${A.name}`, text: winner ? `${winner.name} venceu${hero ? `, com destaque para ${hero.name}` : ''}.` : 'Empate.', actors: scorers.map((p) => p.id), refs: [{ t: 'club', id: H.id }, { t: 'club', id: A.id }], importance: Math.abs(gh - ga) >= 3 ? 3 : 2, data: { score: m.score } });
  // torcedores comemoram ou lamentam
  for (const p of shuffle(residents(w).filter((x) => [H.id, A.id].includes(x.agent.clubId))).slice(0, 3)) {
    const mine = club(p.agent.clubId);
    const won = winner?.id === mine.id; const lost = winner && winner.id !== mine.id;
    p.mood = won ? { emotion: 'feliz', intensity: 0.7, reason: `vitória do ${mine.name}` } : lost ? { emotion: 'irritada', intensity: 0.6, reason: `derrota do ${mine.name}` } : p.mood;
    worldPost(ctx, p, genderize(p, won ? pick([`VAMO ${mine.name.toUpperCase()}!!! ⚽🔥`, `Que jogo! ${mine.name} é muito grande.`]) : lost ? pick([`Que vergonha, ${mine.name}...`, 'Nem quero falar de futebol hoje.']) : 'Empate com gosto de derrota.'));
  }
  if (s.season.matches.every((x) => x.status === 'encerrada')) {
    const [champId] = Object.entries(t).sort((a, b) => b[1].pts - a[1].pts || (b[1].gf - b[1].ga) - (a[1].gf - a[1].ga))[0];
    const champ = club(champId);
    s.history.push({ n: s.season.n, champion: champ.id, at: ctx.at.toISOString(), table: t });
    cap(s.history, 30);
    champ.strength = clamp(champ.strength + 0.03, 0.6, 1.6);
    record(ctx, { type: 'campeao', cat: 'esportes', title: `${champ.name} é campeão da Liga Nexus (temporada ${s.season.n})`, refs: [{ t: 'club', id: champ.id }], actors: champ.stars, importance: 4 });
    // janela de transferências
    const star = personById(w, pick(s.clubs.filter((c) => c.id !== champ.id).flatMap((c) => c.stars)));
    if (star && chance(0.6)) {
      const from = club(star.agent.clubId); from.stars = from.stars.filter((x) => x !== star.id);
      champ.stars.push(star.id); star.agent.clubId = champ.id; star.job = `atleta do ${champ.name}`;
      record(ctx, { type: 'transferencia', cat: 'esportes', title: `${star.name} troca o ${from.name} pelo ${champ.name}`, actors: [star.id], refs: [{ t: 'club', id: champ.id }, { t: 'club', id: from.id }], importance: 3 });
    }
    schedule(ctx, new Date(ctx.at.getTime() + 2 * DAY), 'nova-temporada', {});
  }
});
handle('nova-temporada', (ctx) => newSeason(ctx));

// ---------------------------------------------------------------- educação e ciência
export function enroll(ctx, courseId) {
  const w = ctx.w; const u = account(w);
  const c = w.edu?.courses.find((x) => x.id === courseId);
  if (!c) throw new Error('Curso não encontrado');
  if (u.studying) throw new Error('Termine o curso atual antes');
  if (u.diplomas.includes(c.name)) throw new Error('Você já tem esse diploma');
  const cost = Math.round(c.cost * (w.eco?.cpi || 1) * (1 - (w.eco?.eduDiscount || 0)));
  debit(w, cost, `Matrícula: ${c.name} (Universidade de Codeniac)`, ctx.at);
  const lessons = maybeLecture(ctx, courseLessons(c.name), c.name);
  u.studying = { courseId: c.id, name: c.name, days: c.days, until: new Date(ctx.at.getTime() + c.days * DAY).toISOString(), startedAt: ctx.at.toISOString(), lessons };
  schedule(ctx, new Date(u.studying.until), 'formatura-usuario', { courseId: c.id });
  record(ctx, { type: 'matricula', cat: 'local', title: `Você se matriculou em ${c.name}`, actors: ['me'], importance: 1 });
  return u.studying;
}
handle('formatura-usuario', (ctx, { courseId }) => {
  const u = account(ctx.w);
  if (u.studying?.courseId !== courseId) return;
  u.diplomas.push(u.studying.name); u.studying = null; u.reputation = clamp(u.reputation + 5, 0, 100);
  addXp(ctx.w, 80);
  const name = ctx.w.edu.courses.find((c) => c.id === courseId)?.name;
  record(ctx, { type: 'formatura', cat: 'local', title: `Você se formou em ${name}`, actors: ['me'], importance: 3 });
  notify(ctx.uid, { type: 'system', title: `🎓 Diploma de ${name}`, message: 'Novas vagas aceitam você agora.', link: '#/empresas/carreira' });
});
registerAction({
  name: 'estudar',
  weight: (ctx, p) => (p.agent.resident && p.age < 32 && p.agent.diplomas.length < 2 && p.agent.cash > 3000 && !p.agent.studying ? 0.08 : 0),
  run(ctx, p) {
    const c = pick(ctx.w.edu?.courses || []);
    if (!c || p.agent.diplomas.includes(c.name)) return;
    p.agent.cash -= c.cost; p.agent.studying = c.id;
    schedule(ctx, new Date(ctx.at.getTime() + c.days * DAY), 'formatura', { personaId: p.id, course: c.name });
  },
});
handle('formatura', (ctx, { personaId, course }) => {
  const p = personById(ctx.w, personaId);
  if (!p?.agent) return;
  p.agent.diplomas.push(course); p.agent.studying = null; p.agent.skill = Math.min(2.5, p.agent.skill + 0.25);
  record(ctx, { type: 'formatura', cat: 'local', title: `${p.name} se formou em ${course}`, actors: [p.id], importance: 1 });
  worldPost(ctx, p, genderize(p, `FORMADA(O) EM ${course.toUpperCase()}! 🎓 Valeu cada noite sem dormir.`));
});
onDaily((ctx) => {
  const w = ctx.w;
  for (const lab of w.edu?.labs || []) {
    const researchers = residents(w).filter((p) => /pesquis|cientist|biólog|técnic/i.test(p.agent.role || p.job || ''));
    lab.progress += 2 + researchers.reduce((s, p) => s + p.agent.skill, 0) * 0.8 + rnd(5);
    if (lab.progress >= 100) {
      lab.progress = 0;
      const lead = pick(researchers);
      const boost = 1.08 + Math.random() * 0.12;
      w.eco.demandMult[lab.sector] = Math.round((w.eco.demandMult[lab.sector] || 1) * boost * 1000) / 1000;
      const d = { id: uid(), at: ctx.at.toISOString(), title: lab.project, field: lab.field, lab: lab.name, leadId: lead?.id || null, effect: `demanda de ${lab.sector} +${Math.round((boost - 1) * 100)}%` };
      w.edu.discoveries.push(d); cap(w.edu.discoveries, 40);
      record(ctx, { type: 'descoberta', cat: 'ciencia', title: `Descoberta: ${lab.project}`, text: `${lab.name}${lead ? `, sob liderança de ${lead.name}` : ''}. Impacto esperado: ${d.effect}.`, actors: lead ? [lead.id] : [], importance: 4, data: { field: lab.field } });
      if (lead) { remember(lead, `Minha equipe conseguiu: ${lab.project}!`); lead.followers = (lead.followers || 0) + 3000; }
      lab.project = pick(['Chip neural de baixo consumo', 'Concreto que se regenera', 'Tradução de emoções por voz', 'Exame de sangue por foto', 'Painel solar transparente', 'Remédio contra insônia', 'Cidade sem trânsito por IA']);
    }
  }
});

// ---------------------------------------------------------------- segurança: crimes, escândalos e desaparecimentos
registerAction({
  name: 'crime',
  weight: (ctx, p) => (p.agent.resident && p.agent.traits.honesty < 0.25 && p.agent.cash < 800 ? 0.05 * (ctx.w.eco?.crimeMult || 1) : 0),
  run(ctx, p) {
    const w = ctx.w;
    const d = districtById(w, p.agent.districtId) || pick(w.city.districts);
    const kind = pick(['furto', 'vandalismo', 'golpe digital']);
    const gain = kind === 'vandalismo' ? 0 : 200 + rnd(1500);
    p.agent.cash += gain;
    const caught = chance(0.45 / (w.eco?.crimeMult || 1));
    const ev = record(ctx, { type: 'crime', cat: 'seguranca', title: `${kind === 'golpe digital' ? 'Golpe digital' : kind[0].toUpperCase() + kind.slice(1)} registrado em ${d.name}`, text: caught ? `${p.name} foi detido(a) pela polícia.`.replace('detido(a)', genderize(p, 'detida(o)')) : 'Polícia investiga. Ninguém foi preso até agora.', actors: [p.id], refs: [{ t: 'district', id: d.id }], importance: caught ? 3 : 2, data: { kind, districtId: d.id } });
    services.openCase?.(ctx, { type: kind === 'golpe digital' ? 'golpe' : kind, suspect: { type: 'persona', id: p.id }, plaintiff: 'policia', desc: `${kind[0].toUpperCase() + kind.slice(1)} em ${d.name}.`, evidence: caught ? [{ kind: 'flagrante', desc: 'Detido(a) no ato', strength: 0.8 }] : [{ kind: 'boato', desc: 'Moradores comentam sobre o caso', strength: 0.2 }] });
    if (caught) remember(p, `Fui pega(o) pela polícia (${kind}).`, ev.at);
    else createRumor(ctx, { about: p.id, originId: pick(residents(w).filter((x) => x.agent.districtId === d.id && x.id !== p.id))?.id || p.id, text: `${p.name} está envolvido(a) no ${kind} de ${d.name}`.replace('envolvido(a)', genderize(p, 'envolvida(o)')), truth: 'verdadeiro' });
  },
});
registerAction({
  name: 'fraude',
  weight: (ctx, p) => (p.agent.companyId && /CEO|gerente|diretor/i.test(p.agent.role || '') && p.agent.traits.honesty < 0.3 ? 0.01 : 0),
  run(ctx, p) {
    const c = (ctx.w.companies || []).find((x) => x.id === p.agent.companyId && x.status !== 'falida');
    if (!c || c.scandal) return;
    const amount = Math.round(c.cash * 0.15);
    if (amount < 2000) return;
    c.cash -= amount; p.agent.cash += amount; c.scandal = { by: p.id, amount, at: ctx.at.toISOString() };
    const story = uid();
    const insider = pick(c.employees.map((e) => personById(ctx.w, e.personaId)).filter((x) => x && x.id !== p.id));
    if (insider) createRumor(ctx, { about: c.id, aboutType: 'company', originId: insider.id, text: `alguém na diretoria da ${c.name} está desviando dinheiro`, truth: 'verdadeiro', storyId: story });
    schedule(ctx, new Date(ctx.at.getTime() + (1 + rnd(2)) * DAY), 'escandalo-investigacao', { companyId: c.id, by: p.id, story, amount });
  },
});
handle('escandalo-investigacao', (ctx, { companyId, by, story, amount }) => {
  const w = ctx.w;
  const c = (w.companies || []).find((x) => x.id === companyId);
  const p = personById(w, by);
  if (!c || c.status === 'falida' || !p) return;
  const media = (w.companies || []).find((x) => x.name === 'Mundo Agora');
  const journalist = personById(w, pick((media?.employees || []).filter((e) => /jornal|editor/i.test(e.role)))?.personaId);
  const ev = record(ctx, { type: 'investigacao', cat: 'economia', title: `Investigação aponta desvio de ${amount.toLocaleString('pt-BR')} NXC na ${c.name}`, text: `${journalist ? `Reportagem de ${journalist.name}` : 'Reportagem do Mundo Agora'} revela movimentações suspeitas ligadas à diretoria.`, actors: [journalist?.id, p.id].filter(Boolean), refs: [{ t: 'company', id: c.id }], importance: 4, storyId: story });
  schedule(ctx, new Date(ctx.at.getTime() + (8 + rnd(16)) * HOUR), 'escandalo-resposta', { companyId, by, story, cause: ev.id, amount });
});
handle('escandalo-resposta', (ctx, { companyId, by, story, cause, amount }) => {
  const w = ctx.w;
  const c = (w.companies || []).find((x) => x.id === companyId); const p = personById(w, by);
  if (!c || c.status === 'falida' || !p) return;
  const admits = p.agent.traits.honesty > 0.2 && chance(0.3);
  const ev = record(ctx, { type: admits ? 'confissao' : 'negacao', cat: 'economia', title: admits ? `${p.name} admite erros e pede desculpas` : `${p.name} nega as acusações: "Isso é perseguição"`, actors: [p.id], refs: [{ t: 'company', id: c.id }], importance: 3, storyId: story, causeId: cause });
  worldPost(ctx, p, admits ? 'Errei. Vou responder por isso e devolver cada centavo.' : 'Não vou aceitar mentiras sobre mim. Meus advogados já estão cuidando de tudo.');
  schedule(ctx, new Date(ctx.at.getTime() + (1 + rnd(2)) * DAY), 'escandalo-desfecho', { companyId, by, story, cause: ev.id, amount });
});
handle('escandalo-desfecho', (ctx, { companyId, by, story, cause, amount }) => {
  const w = ctx.w;
  const c = (w.companies || []).find((x) => x.id === companyId); const p = personById(w, by);
  if (!c || !p) return;
  c.scandal = null;
  const fine = Math.round(amount * 0.5);
  c.cash -= fine; c.reputation = clamp(c.reputation - 15, 5, 100);
  p.agent.cash -= Math.min(p.agent.cash, amount);
  if (p.agent.companyId === c.id) {
    c.employees = c.employees.filter((e) => e.personaId !== p.id);
    Object.assign(p.agent, { companyId: null, role: null, salary: 0 });
    p.job = 'ex-executivo(a) investigado(a)';
  }
  if (c.ceoId === p.id) {
    const next = c.employees.map((e) => personById(w, e.personaId)).filter(Boolean).sort((a, b) => b.agent.skill - a.agent.skill)[0];
    c.ceoId = next?.id || null;
    if (next) { const e = c.employees.find((x) => x.personaId === next.id); e.role = 'CEO'; next.agent.role = 'CEO'; next.job = `CEO da ${c.name}`; }
  }
  p.agent.status = 'preso'; p.agent.statusUntil = new Date(ctx.at.getTime() + (4 + rnd(5)) * DAY).toISOString();
  record(ctx, { type: 'condenacao', cat: 'seguranca', title: `${p.name} é afastado(a) e detido(a); ${c.name} pagará multa de ${fine.toLocaleString('pt-BR')} NXC`.replace('afastado(a) e detido(a)', genderize(p, 'afastada(o) e detida(o)')), text: c.ceoId ? `Novo comando: ${personById(w, c.ceoId)?.name}.` : '', actors: [p.id], refs: [{ t: 'company', id: c.id }], importance: 4, storyId: story, causeId: cause });
  remember(p, `Fui afastada(o) da ${c.name} e detida(o).`);
});

onDaily((ctx) => {
  const w = ctx.w;
  const cand = residents(w).filter((p) => active(p) && ['triste', 'sozinha', 'ansiosa'].includes(p.mood?.emotion) && !p.agent.office);
  if (cand.length && chance(0.04)) {
    const p = pick(cand);
    p.agent.status = 'desaparecido'; p.agent.statusUntil = null;
    const story = uid();
    const ev = record(ctx, { type: 'desaparecimento', cat: 'seguranca', title: `${p.name} está ${genderize(p, 'desaparecida(o)')}`, text: `Visto(a) pela última vez em ${districtById(w, p.agent.districtId)?.name || 'Codeniac Society'}. Amigos pedem ajuda.`.replace('Visto(a)', genderize(p, 'Vista(o)')), actors: [p.id], importance: 3, storyId: story });
    for (const f of Object.entries(p.agent.rel).filter(([, r]) => r.aff > 30).slice(0, 2).map(([id]) => personById(w, id)).filter(Boolean)) worldPost(ctx, f, genderize(f, `Alguém viu ${p.name.split(' ')[0]}? Não responde desde ontem. Tô preocupada(o) 🙏`));
    // pistas: algumas verdadeiras, outras não
    const reason = pick([['precisava de um tempo sozinho(a) e foi para a serra', 'na rodoviária com uma mala'], ['foi internado(a) depois de passar mal', 'entrando numa ambulância'], ['viajou para visitar a família sem avisar', 'comprando passagem']]);
    const witnesses = shuffle(residents(w).filter((x) => x.id !== p.id)).slice(0, 3);
    witnesses.forEach((x, i) => createRumor(ctx, { about: p.id, originId: x.id, text: i === 0 ? `viram ${p.name} ${reason[1]}` : pick([`${p.name} fugiu com dívidas`, `${p.name} foi visto(a) no Porto Neon de madrugada`, `${p.name} está com problemas com a polícia`]), truth: i === 0 ? 'verdadeiro' : 'falso', storyId: story }));
    schedule(ctx, new Date(ctx.at.getTime() + (2 + rnd(3)) * DAY), 'encontrado', { personaId: p.id, story, cause: ev.id, reason: genderize(p, reason[0]) });
  }
});
handle('encontrado', (ctx, { personaId, story, cause, reason }) => {
  const p = personById(ctx.w, personaId);
  if (!p?.agent || p.agent.status !== 'desaparecido') return;
  p.agent.status = 'ativo';
  p.mood = { emotion: 'grata', intensity: 0.7, reason: 'voltou para casa' };
  record(ctx, { type: 'encontrado', cat: 'seguranca', title: `${p.name} foi ${genderize(p, 'encontrada(o)')}`, text: `Ela(e) ${reason}.`.replace('Ela(e)', p.gender === 'f' ? 'Ela' : 'Ele'), actors: [p.id], importance: 3, storyId: story, causeId: cause });
  worldPost(ctx, p, genderize(p, 'Desculpa o susto, gente. Tô bem. Obrigada(o) por cada mensagem ❤️'));
});

// investigação do usuário: revela a cadeia de um boato aos poucos
export function startInvestigation(ctx, rumorId) {
  const w = ctx.w; const u = account(w);
  const r = rumors(w).find((x) => x.id === rumorId);
  if (!r) throw new Error('Esse boato não existe mais');
  u.investigations ??= [];
  let inv = u.investigations.find((x) => x.rumorId === r.id);
  if (inv && inv.status === 'em andamento') throw new Error('Investigação já em andamento');
  if (inv?.status === 'concluída') return inv;
  inv = inv || { id: uid(), rumorId: r.id, startedAt: ctx.at.toISOString(), revealed: [], status: 'em andamento' };
  if (!u.investigations.includes(inv)) u.investigations.push(inv);
  inv.status = 'em andamento';
  schedule(ctx, new Date(ctx.at.getTime() + 5 * 60 * 1000), 'investigacao-passo', { id: inv.id });
  return inv;
}
handle('investigacao-passo', (ctx, { id }) => {
  const w = ctx.w; const u = account(w);
  const inv = (u.investigations || []).find((x) => x.id === id);
  const r = inv && rumors(w).find((x) => x.id === inv.rumorId);
  if (!inv || !r) return;
  // revela de trás para frente: quem contou para quem, até a origem
  const chain = r.knownBy.slice().reverse();
  const next = chain.find((k) => !inv.revealed.some((x) => x.id === k.id));
  if (next) {
    inv.revealed.push({ id: next.id, from: next.from, text: next.text, truth: next.truth, at: next.at });
    schedule(ctx, new Date(ctx.at.getTime() + 5 * 60 * 1000), 'investigacao-passo', { id });
    return;
  }
  inv.status = 'concluída'; inv.truth = r.truth; inv.originId = r.originId;
  const origin = personById(w, r.originId);
  addXp(w, 30);
  record(ctx, { type: 'investigacao-usuario', cat: 'sociedade', title: `Sua investigação terminou: o boato é ${r.truth}`, text: `Começou com ${origin?.name || 'alguém'}: "${r.knownBy[0].text}". Passou por ${r.knownBy.length} pessoa(s).`, actors: ['me', r.originId], importance: 2, data: { rumorId: r.id } });
  notify(ctx.uid, { type: 'system', title: '🔎 Investigação concluída', message: `O boato é ${r.truth}. Veja quem espalhou.`, link: '#/social/investigacoes' });
});

// ---------------------------------------------------------------- quiz (entretenimento): perguntas sobre fatos do mundo
export function quiz(w) {
  const qs = [];
  const opts = (right, pool) => shuffle([right, ...shuffle(pool.filter((x) => x && x !== right)).slice(0, 3)]);
  const names = people(w).map((p) => p.name);
  const mayor = w.politics?.offices?.find((o) => o.id === 'prefeito');
  if (mayor?.holder) { const n = mayor.holder.type === 'user' ? 'Você' : personById(w, mayor.holder.id)?.name; if (n) qs.push({ q: 'Quem ocupa a prefeitura de Codeniac Society?', options: opts(n, names), answer: n }); }
  const comps = (w.companies || []).filter((c) => c.status !== 'falida');
  const top = comps.slice().sort((a, b) => b.price - a.price)[0];
  if (top) qs.push({ q: 'Qual empresa tem a ação mais cara da Bolsa Nexus agora?', options: opts(top.name, comps.map((c) => c.name)), answer: top.name });
  for (const c of shuffle(comps).slice(0, 2)) { const f = c.founderId === 'me' ? 'Você' : personById(w, c.founderId)?.name || (w.gone || {})[c.founderId]; if (f) qs.push({ q: `Quem fundou a ${c.name}?`, options: opts(f, names), answer: f }); }
  const t = w.sports?.season?.table;
  if (t) { const lead = Object.entries(t).sort((a, b) => b[1].pts - a[1].pts)[0]; const club = w.sports.clubs.find((c) => c.id === lead[0]); if (club) qs.push({ q: 'Quem lidera a Liga Nexus nesta temporada?', options: opts(club.name, w.sports.clubs.map((c) => c.name)), answer: club.name }); }
  const disc = w.edu?.discoveries?.at(-1);
  if (disc) qs.push({ q: 'Qual foi a descoberta científica mais recente da cidade?', options: opts(disc.title, ['Teletransporte de objetos', 'Carro voador popular', 'Café que não esfria', 'Robô cozinheiro', 'Chuva artificial']), answer: disc.title });
  const big = (w.events || []).filter((e) => e.importance >= 4 && e.type !== 'genese').at(-1);
  if (big) qs.push({ q: 'Qual destes foi um acontecimento real recente na cidade?', options: opts(big.title, ['Prefeitura proíbe o uso de celulares', 'Codeniac Society sedia as Olimpíadas', 'Banco Nexus distribui dinheiro grátis', 'Cidade inteira fica sem internet por uma semana']), answer: big.title });
  for (const p of shuffle(residents(w)).slice(0, 2)) { const d = districtById(w, p.agent.districtId); if (d) qs.push({ q: `Em que bairro mora ${p.name}?`, options: opts(d.name, w.city.districts.filter((x) => !x.locked).map((x) => x.name)), answer: d.name }); }
  return shuffle(qs).slice(0, 6).map((x, i) => ({ id: i, ...x }));
}

