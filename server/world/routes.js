// Rotas do System 2.0 (/api/mundo/...). Toda alteração passa pelas regras do mundo e vira registro histórico.
import express from 'express';
import { world, touch, activityReport, publicEvent, record, aiTake, aiReady, aiBudget, CATS, PACES, actorRef } from './core.js';
import { saveWorld, resetWorld } from './store.js';
import {
  people, residents, personById, agentOf, publicAgent, relType, REL_LABEL, requests, answerRequest, invites, publicInvite, rumors, answerCall, bumpUser, userName,
} from './agents.js';
import {
  eco, companies, companyById, publicCompany, SECTORS, trade, netWorth, applyUser, workDay, WORK_TASKS, foundUserCompany, manageCompany, FOUND_COST, priceNow, fireUser,
} from './economy.js';
import { account, credit, debit, addXp, verifyPin, bankOf, isLate, outstanding } from './bank.js';
import { justice } from './justice.js';
import { gigs, loans } from './finance.js';
import { society, hasAuthority, professionsFor, claimProfession, readLesson } from './society.js';
import { inv } from './inventory.js';
import { districtById, weatherNow, enroll, startInvestigation, quiz } from './city.js';
import { publicPolitics, joinParty, runForOffice, campaign, userProposeLaw, voteLaw } from './politics.js';
import { articles, communities, createCommunity, media, CHANNELS, program, searchWorld, siteOf } from './media.js';
import { net, publicPost } from '../social.js';
import { geminiJSON } from '../assistant.js';
import { uid, str, fold, cap, round2, clamp, pick, shuffle, ago, DAY } from './util.js';

const router = express.Router();
const ctxOf = (req) => ({ user: req.user, uid: req.user.id, w: world(req.user.id), live: true, at: new Date() });
router.use('/mundo', (req, res, next) => { const w = world(req.user.id); touch(w); account(w); next(); });
const ok = (res, fn) => { try { const out = fn(); saveWorld(); res.json(out ?? { ok: true }); } catch (err) { res.status(400).json({ error: err.message }); } };
const born = (w) => Boolean(w.core.genesisAt);
const need = (req, res) => { const w = world(req.user.id); if (!born(w)) { res.status(409).json({ error: 'O mundo ainda está nascendo. Aguarde alguns segundos.' }); return null; } return w; };
const who = (w, id) => actorRef(w, id);

// ---------------------------------------------------------------- 01 · Command Center
router.get('/mundo/resumo', (req, res) => {
  const w = world(req.user.id);
  const u = account(w);
  if (!born(w)) return res.json({ born: false, people: net(req.user.id).personas.length });
  const e = eco(w);
  const evs = w.events.filter((x) => x.type !== 'genese');
  const ticker = evs.filter((x) => x.cat === 'seguranca' || x.importance >= 4).slice(-4).reverse().map((x) => publicEvent(x, w));
  const s = net(req.user.id);
  const prevIdx = e.indexHistory.length > 24 ? e.indexHistory.at(-25).v : e.indexHistory[0]?.v || e.index;
  const movers = companies(w).filter((c) => c.status !== 'falida').map((c) => publicCompany(w, c)).sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 4);
  const pendInv = invites(w).filter((i) => i.user === 'pendente' && i.status === 'agendado');
  const nextInv = invites(w).filter((i) => i.status === 'agendado' && (i.user === 'aceito' || i.user === 'pendente')).sort((a, b) => a.at.localeCompare(b.at))[0];
  const el = w.politics?.election;
  res.json({
    born: true, now: new Date().toISOString(), weather: weatherNow(w), gameMinutes: Math.round((Date.now() - new Date(w.core.genesisAt).getTime()) / 60000), heroImage: w.city.heroImage || null, city: { name: w.city.name || 'Nexus City', residents: residents(w).length, people: people(w).length, districts: w.city.districts.filter((d) => !d.locked).length },
    me: { name: req.user.name, avatar: req.user.avatar || null, balance: u.bank.balance, wallet: u.bank.wallet || 0, score: u.bank.score || 0,
      popularity: (() => { const met = people(w).filter((p) => p.agent?.user?.metAt); return met.length ? Math.round((met.filter((p) => p.agent.user.aff > 15).length / met.length) * 100) : 0; })(),
      influence: Math.min(100, Math.round(Math.log10((u.fame || 0) + 1) * 28)), friends: people(w).filter((p) => p.friend).length,
      contracts: (u.bank.contracts || []).filter((c) => ['ativo', 'inadimplente'].includes(c.status)).length, items: (u.inventory || []).length, installed: u.installed || {}, vipUntil: u.vipUntil || null,
      location: u.location?.placeId ? (w.city.places.find((p) => p.id === u.location.placeId)?.name || null) : null, reputation: u.reputation, fame: u.fame, level: u.level || 1, xp: u.xp, netWorth: netWorth(w), job: u.job ? { role: u.job.role, company: companyById(w, u.job.companyId)?.name, performance: u.job.performance, workedToday: u.job.lastWork === new Date().toISOString().slice(0, 10) } : null, office: u.office || null, partyId: u.partyId || null, studying: u.studying || null },
    ticker, events: evs.slice(-10).reverse().map((x) => publicEvent(x, w)),
    news: articles(w).filter((a) => !a.blog).slice(-6).reverse().map((a) => ({ id: a.id, title: a.title, cat: a.cat, catLabel: CATS[a.cat], at: a.at, site: siteOf(w, companyById(w, a.siteId) || {}) })),
    social: s.posts.slice().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5).map((p) => publicPost(s, p, req.user.id)),
    economy: { index: e.index, change: prevIdx ? round2(((e.index - prevIdx) / prevIdx) * 100) : 0, history: e.indexHistory.slice(-48).map((x) => x.v), inflation: e.inflation, movers, mine: companies(w).filter((c) => c.founderId === 'me').map((c) => publicCompany(w, c)) },
    invites: { pending: pendInv.length, next: nextInv ? publicInvite(w, nextInv) : null },
    requests: requests(w).filter((r) => ['aberto', 'prometido'].includes(r.status)).length,
    election: el ? { phase: el.phase, ends: el.phaseEnds, n: el.n } : null,
    ai: { ready: aiReady(), left: aiBudget(w), pace: w.core.cfg.pace },
    map: mapData(w, true),
  });
});
router.get('/mundo/relatorio', (req, res) => { const w = world(req.user.id); const r = activityReport(w); saveWorld(); res.json(r); });
// contadores do menu (sempre há algo em cada aba): pendências, novidades e alertas por ambiente
router.get('/mundo/badges', (req, res) => {
  const w = world(req.user.id);
  if (!born(w)) return res.json({ born: false, badges: {} });
  const u = account(w); const b = bankOf(w); const J = justice(w);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recent = w.events.filter((e) => e.at > since && e.type !== 'genese');
  const pendInv = invites(w).filter((i) => i.user === 'pendente' && i.status === 'agendado').length;
  const reqs = requests(w).filter((r) => ['aberto', 'prometido'].includes(r.status)).length;
  const lateInst = (b.contracts || []).reduce((n, c) => n + c.schedule.filter((i) => i.status === 'atrasada').length, 0);
  const debts = (b.debts || []).filter((d) => d.status !== 'paga').length;
  const bills = (b.card?.bills || []).filter((x) => x.status !== 'paga').length;
  const myCases = J.cases.filter((c) => (c.suspect?.type === 'user' || c.plaintiff === 'me') && !['arquivado', 'absolvido', 'multa', 'condenado', 'acordo', 'preso'].includes(c.status)).length;
  const myFines = (b.debts || []).filter((d) => ['multa', 'judicial'].includes(d.kind) && d.status !== 'paga').length;
  const myCos = companies(w).filter((c) => c.founderId === 'me' && c.status !== 'falida');
  const openGigs = gigs(w).filter((g) => g.status === 'aberto' && g.until > new Date().toISOString()).length;
  const promos = (w.city?.places || []).filter((p) => p.promo && p.promo.until > new Date().toISOString()).length;
  const items = (u.inventory || []).length;
  const news = articles(w).filter((a) => a.at > since).length;
  const alerts = recent.filter((e) => e.cat === 'seguranca').length;
  const badges = {
    centro: recent.filter((e) => e.importance >= 3).length,
    mapa: (w.invites || []).filter((i) => ['agendado', 'acontecendo'].includes(i.status) && i.placeId).length + alerts,
    social: pendInv + reqs,
    internet: news,
    mercado: promos || openGigs,
    empresas: myCos.reduce((n, c) => n + (c.openings || 0), 0) + openGigs,
    banco: lateInst + debts + bills + (isLate(w) ? 1 : 0),
    policia: hasAuthority(w, 'policia') ? J.cases.filter((c) => ['aberto', 'investigacao'].includes(c.status)).length : alerts,
    justica: myCases + myFines,
    inventario: items,
    midia: news,
  };
  res.json({ born: true, badges });
});


// ---------------------------------------------------------------- 09 · World Archive
router.get('/mundo/eventos', (req, res) => {
  const w = world(req.user.id);
  let list = w.events;
  const { cat, q, ator, ref, antes, historia } = req.query;
  if (cat) list = list.filter((e) => e.cat === cat);
  if (ator) list = list.filter((e) => e.actors.includes(String(ator)));
  if (ref) list = list.filter((e) => e.refs.some((r) => r.id === ref));
  if (historia) list = list.filter((e) => e.storyId === historia);
  if (q) { const k = fold(q); list = list.filter((e) => fold(`${e.title} ${e.text}`).includes(k)); }
  if (antes) list = list.filter((e) => e.at < antes);
  const page = list.slice(-Number(req.query.limite || 40)).reverse();
  res.json({ events: page.map((e) => publicEvent(e, w)), more: list.length > page.length, total: w.events.length, cats: CATS });
});
router.get('/mundo/historia/:tipo/:id', (req, res) => {
  const w = world(req.user.id);
  const { tipo, id } = req.params;
  const evs = w.events.filter((e) => (tipo === 'persona' ? e.actors.includes(id) : e.refs.some((r) => r.id === id))).map((e) => publicEvent(e, w));
  let entity = null;
  if (tipo === 'persona') { const p = personById(w, id); entity = p ? publicAgent(w, p, true) : { id, name: (w.gone || {})[id] || 'Pessoa que saiu da cidade', gone: true }; }
  if (tipo === 'company') { const c = companyById(w, id); entity = c ? publicCompany(w, c, true) : null; }
  if (tipo === 'club') entity = w.sports?.clubs.find((c) => c.id === id) || null;
  if (tipo === 'district') entity = districtById(w, id) || null;
  if (!entity) return res.status(404).json({ error: 'Não encontrado no arquivo' });
  res.json({ entity, events: evs.reverse() });
});
// "Por que a NovaTech fechou?" — encontra a entidade, junta a linha do tempo e (com IA) explica
router.post('/mundo/perguntar', async (req, res) => {
  const w = need(req, res); if (!w) return;
  const q = str(req.body?.q, 300);
  if (!q) return res.status(400).json({ error: 'Faça uma pergunta' });
  const k = fold(q);
  const company = companies(w).find((c) => k.includes(fold(c.name)));
  const person = people(w).find((p) => k.includes(fold(p.name)) || k.includes(fold(p.name.split(' ')[0])) && p.name.split(' ')[0].length > 3);
  const words = k.split(/\W+/).filter((x) => x.length > 3 && !['porque', 'quando', 'quem', 'como', 'qual', 'onde', 'aconteceu', 'sobre'].includes(x));
  let evs = company ? w.events.filter((e) => e.refs.some((r) => r.id === company.id)) : person ? w.events.filter((e) => e.actors.includes(person.id)) : w.events.filter((e) => words.some((x) => fold(`${e.title} ${e.text}`).includes(x)));
  evs = evs.filter((e) => e.type !== 'genese').slice(-40);
  if (!evs.length && (company || person)) {
    const facts = company
      ? `A ${company.name} é uma empresa de ${SECTORS[company.sector]?.label.toLowerCase()} ${company.origin === 'genese' ? 'que já existia quando a cidade começou a ser registrada (gênese)' : `fundada em ${new Date(company.foundedAt).toLocaleDateString('pt-BR')}`}. Hoje está ${company.status}, com ${company.employees.length} funcionário(s)${personById(w, company.ceoId) ? ` e é comandada por ${personById(w, company.ceoId).name}` : ''}. Ainda não há acontecimentos registrados sobre ela.`
      : `${person.name} tem ${person.age} anos, trabalha como ${person.job} e vive em ${person.city}. Ainda não há acontecimentos registrados sobre essa pessoa no arquivo.`;
    return res.json({ answer: facts, events: [] });
  }
  if (!evs.length) return res.json({ answer: 'Não encontrei nada no arquivo da cidade sobre isso. Tente o nome de uma pessoa, empresa, clube ou bairro.', events: [] });
  const timeline = evs.map((e) => `${new Date(e.at).toLocaleString('pt-BR')} — ${e.title}${e.text ? `: ${e.text}` : ''}`);
  let answer = null;
  const ctx = ctxOf(req);
  if (aiTake(ctx)) {
    try {
      const out = await geminiJSON(`Você é o arquivista de Codeniac Society (uma cidade simulada). Responda à pergunta usando SOMENTE os registros abaixo, em ordem cronológica, em português, em 1 a 3 parágrafos. Se os registros não bastarem, diga o que se sabe e o que não se sabe.\nPergunta: ${q}\nRegistros:\n${timeline.join('\n')}\nJSON: {"resposta":""}`, 1200, 0.3);
      answer = str(out?.resposta, 3000) || null;
    } catch (err) { console.error('[arquivo] IA:', err.message); }
  }
  if (!answer) {
    const subject = company?.name || person?.name || 'o assunto';
    answer = `Segundo o arquivo, esta é a história de ${subject}, em ordem: ${evs.slice(-12).map((e) => `em ${new Date(e.at).toLocaleDateString('pt-BR')}, ${e.title.charAt(0).toLowerCase()}${e.title.slice(1)}`).join('; ')}.`;
  }
  saveWorld();
  res.json({ answer, ai: answer && aiReady(), events: evs.slice().reverse().map((e) => publicEvent(e, w)) });
});

// ---------------------------------------------------------------- 02 · Social World
router.get('/mundo/relacoes', (req, res) => {
  const w = world(req.user.id);
  const list = people(w).filter((p) => p.agent && (p.friend || p.agent.user.metAt || Math.abs(p.agent.user.aff) >= 3)).map((p) => publicAgent(w, p)).sort((a, b) => b.relation.aff - a.relation.aff);
  res.json(list);
});
router.get('/mundo/pessoa/:id', (req, res) => {
  const w = world(req.user.id);
  const p = personById(w, req.params.id);
  if (!p) return res.status(404).json({ error: 'Essa pessoa saiu da cidade' });
  agentOf(w, p);
  res.json({ ...publicAgent(w, p, true), company: p.agent.companyId ? publicCompany(w, companyById(w, p.agent.companyId) || {}) : null, district: districtById(w, p.agent.districtId)?.name || null, events: w.events.filter((e) => e.actors.includes(p.id)).slice(-25).reverse().map((e) => publicEvent(e, w)) });
});
router.get('/mundo/pedidos', (req, res) => {
  const w = world(req.user.id);
  res.json(requests(w).slice(-40).reverse().map((r) => ({ ...r, persona: who(w, r.personaId) })));
});
router.post('/mundo/pedidos/:id', (req, res) => {
  const ctx = ctxOf(req);
  const r = requests(ctx.w).find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Pedido não encontrado' });
  ok(res, () => ({ ...answerRequest(ctx, r, String(req.body?.acao)), persona: who(ctx.w, r.personaId) }));
});
router.get('/mundo/convites', (req, res) => {
  const w = world(req.user.id);
  res.json(invites(w).filter((i) => i.user || i.status !== 'encerrado').slice(-60).reverse().map((i) => publicInvite(w, i)));
});
router.post('/mundo/convites/:id', (req, res) => {
  const ctx = ctxOf(req);
  const i = invites(ctx.w).find((x) => x.id === req.params.id);
  if (!i || !i.user) return res.status(404).json({ error: 'Convite não encontrado' });
  if (i.status === 'encerrado' || i.status === 'cancelado') return res.status(400).json({ error: 'Esse evento já passou' });
  const ans = req.body?.resposta === 'aceito' ? 'aceito' : 'recusado';
  ok(res, () => {
    i.user = ans;
    if (ans === 'aceito' && i.status === 'acontecendo' && !i.going.includes('me')) i.going.push('me');
    const host = personById(ctx.w, i.hostId);
    if (host) bumpUser(ctx, host, ans === 'aceito' ? 3 : -1, { note: ans === 'aceito' ? `${userName(ctx)} confirmou presença em ${i.title}.` : '' });
    for (const r of requests(ctx.w).filter((x) => x.personaId === i.hostId && x.kind === 'presenca' && ['aberto', 'prometido'].includes(x.status))) if (ans === 'aceito') r.attended = true;
    return publicInvite(ctx.w, i);
  });
});
router.post('/mundo/ligacoes/:id', (req, res) => { const ctx = ctxOf(req); ok(res, () => answerCall(ctx, req.params.id, Boolean(req.body?.atender))); });

router.get('/mundo/comunidades', (req, res) => {
  const w = world(req.user.id);
  res.json(communities(w).map((c) => ({ id: c.id, name: c.name, desc: c.desc, members: c.members.length, threads: c.threads.length, mine: c.adminId === 'me', joined: c.members.includes('me'), admin: c.adminId === 'me' ? { id: 'me', name: 'Você' } : who(w, c.adminId), last: c.threads.at(-1)?.at || c.createdAt, origin: c.origin })).sort((a, b) => b.last.localeCompare(a.last)));
});
router.post('/mundo/comunidades', (req, res) => { const ctx = ctxOf(req); if (!born(ctx.w)) return res.status(409).json({ error: 'O mundo ainda está nascendo' }); ok(res, () => ({ id: createCommunity(ctx, req.body || {}).id })); });
const commOf = (w, id) => communities(w).find((c) => c.id === id);
router.get('/mundo/comunidades/:id', (req, res) => {
  const w = world(req.user.id); const c = commOf(w, req.params.id);
  if (!c) return res.status(404).json({ error: 'Comunidade não encontrada' });
  const author = (id) => (id === 'me' ? { id: 'me', name: 'Você', me: true } : who(w, id));
  res.json({ id: c.id, name: c.name, desc: c.desc, rules: c.rules, members: c.members.length, joined: c.members.includes('me'), mine: c.adminId === 'me', admin: author(c.adminId), mods: c.mods.map(author), createdAt: c.createdAt, origin: c.origin,
    threads: c.threads.slice().sort((a, b) => b.at.localeCompare(a.at)).map((t) => ({ ...t, author: author(t.authorId), comments: t.comments.filter((x) => !x.removed || x.authorId === 'me').map((x) => ({ ...x, author: author(x.authorId) })), removed: t.comments.filter((x) => x.removed).length })),
    sample: c.members.filter((m) => m !== 'me').slice(0, 12).map(author), invitable: c.adminId === 'me' ? people(w).filter((p) => !c.members.includes(p.id) && p.friend).map((p) => ({ id: p.id, name: p.name })) : [] });
});
router.post('/mundo/comunidades/:id/entrar', (req, res) => {
  const ctx = ctxOf(req); const c = commOf(ctx.w, req.params.id);
  if (!c) return res.status(404).json({ error: 'Comunidade não encontrada' });
  ok(res, () => { if (c.adminId === 'me') throw new Error('Você é o administrador'); if (c.members.includes('me')) c.members = c.members.filter((m) => m !== 'me'); else c.members.push('me'); return { joined: c.members.includes('me') }; });
});
router.post('/mundo/comunidades/:id/topicos', (req, res) => {
  const ctx = ctxOf(req); const c = commOf(ctx.w, req.params.id);
  if (!c) return res.status(404).json({ error: 'Comunidade não encontrada' });
  ok(res, () => {
    if (!c.members.includes('me')) throw new Error('Entre na comunidade para postar');
    const title = str(req.body?.title, 160); if (!title) throw new Error('Escreva um título');
    const t = { id: uid(), authorId: 'me', title, body: str(req.body?.body, 1200), at: new Date().toISOString(), votes: 1, comments: [] };
    c.threads.push(t); cap(c.threads, 60);
    // membros respondem nas próximas horas
    for (const p of shuffle(c.members.filter((m) => m !== 'me').map((id) => personById(ctx.w, id)).filter(Boolean)).slice(0, 3)) {
      t.comments.push({ id: uid(), authorId: p.id, text: pick(['Boa pergunta!', 'Concordo com você.', 'Hmm, não sei se é bem assim.', 'Salvei para ler depois.', 'Tenho uma experiência parecida.']), at: new Date(Date.now() + (5 + Math.random() * 40) * 60000).toISOString(), votes: 0 });
      bumpUser(ctx, p, 1, {});
    }
    addXp(ctx.w, 5);
    return t;
  });
});
router.post('/mundo/comunidades/:id/topicos/:tid/comentarios', (req, res) => {
  const ctx = ctxOf(req); const c = commOf(ctx.w, req.params.id); const t = c?.threads.find((x) => x.id === req.params.tid);
  if (!t) return res.status(404).json({ error: 'Tópico não encontrado' });
  ok(res, () => {
    const text = str(req.body?.text, 600); if (!text) throw new Error('Escreva o comentário');
    t.comments.push({ id: uid(), authorId: 'me', text, at: new Date().toISOString(), votes: 0 });
    const author = personById(ctx.w, t.authorId); if (author) bumpUser(ctx, author, 2, { contact: true });
    return { ok: true };
  });
});
router.post('/mundo/comunidades/:id/topicos/:tid/votar', (req, res) => {
  const ctx = ctxOf(req); const c = commOf(ctx.w, req.params.id); const t = c?.threads.find((x) => x.id === req.params.tid);
  if (!t) return res.status(404).json({ error: 'Tópico não encontrado' });
  ok(res, () => { t.voters ??= []; if (!t.voters.includes('me')) { t.voters.push('me'); t.votes += req.body?.dir === -1 ? -1 : 1; } return { votes: t.votes }; });
});
router.post('/mundo/comunidades/:id/convidar', (req, res) => {
  const ctx = ctxOf(req); const c = commOf(ctx.w, req.params.id); const p = personById(ctx.w, req.body?.personaId);
  if (!c || !p) return res.status(404).json({ error: 'Não encontrado' });
  ok(res, () => {
    if (c.adminId !== 'me') throw new Error('Só o administrador convida');
    const interest = (p.interests || []).some((i) => fold(`${c.name} ${c.desc}`).includes(fold(i)));
    const accepted = interest || (p.agent?.user.aff || 0) > 20;
    if (accepted && !c.members.includes(p.id)) c.members.push(p.id);
    return { accepted, reason: accepted ? `${p.name} entrou na comunidade.` : `${p.name} recusou: não tem interesse no tema.` };
  });
});

router.get('/mundo/rumores/:id', (req, res) => {
  const w = world(req.user.id); const r = rumors(w).find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'Boato não encontrado' });
  const inv = (account(w).investigations || []).find((x) => x.rumorId === r.id);
  res.json({ id: r.id, about: r.aboutType === 'persona' ? who(w, r.aboutId) : { name: companyById(w, r.aboutId)?.name }, spread: r.knownBy.length, at: r.at, investigation: inv ? pubInv(w, inv) : null });
});
const pubInv = (w, inv) => {
  const r = rumors(w).find((x) => x.id === inv.rumorId);
  return { ...inv, about: r ? (r.aboutType === 'persona' ? who(w, r.aboutId) : { name: companyById(w, r.aboutId)?.name }) : null, spread: r?.knownBy.length || 0, revealed: inv.revealed.map((x) => ({ ...x, person: who(w, x.id), fromPerson: x.from ? who(w, x.from) : null })), origin: inv.originId ? who(w, inv.originId) : null };
};
router.post('/mundo/rumores/:id/investigar', (req, res) => { const ctx = ctxOf(req); ok(res, () => pubInv(ctx.w, startInvestigation(ctx, req.params.id))); });
router.get('/mundo/investigacoes', (req, res) => { const w = world(req.user.id); res.json((account(w).investigations || []).slice().reverse().map((i) => pubInv(w, i))); });

// ---------------------------------------------------------------- 03 · Internet
router.get('/mundo/internet', (req, res) => { const w = world(req.user.id); res.json(searchWorld(w, String(req.query.q || ''))); });
router.get('/mundo/internet/sites', (req, res) => {
  const w = world(req.user.id);
  res.json(companies(w).map((c) => ({ ...siteOf(w, c), sectorLabel: SECTORS[c.sector]?.label, articles: articles(w).filter((a) => a.siteId === c.id).length })));
});
router.get('/mundo/internet/site/:domain', (req, res) => {
  const w = world(req.user.id);
  const c = companies(w).find((x) => x.domain === req.params.domain);
  if (!c) return res.status(404).json({ error: 'Site não encontrado (DNS_PROBE_FINISHED_NXDOMAIN)' });
  const site = siteOf(w, c);
  if (c.status === 'falida') return res.json({ site, offline: true, closedAt: c.closedAt, history: w.events.filter((e) => e.refs.some((r) => r.id === c.id)).slice(-8).reverse().map((e) => publicEvent(e, w)) });
  const ads = (w.ads || []).filter((a) => a.until > new Date().toISOString() && a.companyId !== c.id).slice(-3).map((a) => ({ ...a, company: companyById(w, a.companyId)?.name, domain: companyById(w, a.companyId)?.domain }));
  const arts = articles(w).filter((a) => a.siteId === c.id).slice(-20).reverse().map((a) => ({ id: a.id, title: a.title, lead: a.lead || a.body.slice(0, 220), at: a.at, cat: a.cat, author: a.authorId ? who(w, a.authorId) : null, comments: a.comments.length }));
  const out = { site, ads, company: publicCompany(w, c, true), articles: arts };
  if (c.siteKind === 'empregos') out.openings = companies(w).filter((x) => x.status !== 'falida').flatMap((x) => x.openings.map((o) => ({ ...o, companyId: x.id, company: x.name, domain: x.domain })));
  if (c.siteKind === 'loja') out.products = companies(w).filter((x) => x.status !== 'falida' && x.products.length).flatMap((x) => x.products.map((p) => ({ ...p, price: priceNow(w, p.price), companyId: x.id, company: x.name })));
  if (c.siteKind === 'forum') out.communities = communities(w).map((x) => ({ id: x.id, name: x.name, members: x.members.length, threads: x.threads.slice(-2).map((t) => t.title) }));
  if (c.siteKind === 'cripto') out.market = companies(w).filter((x) => x.status !== 'falida').map((x) => publicCompany(w, x)).sort((a, b) => b.change - a.change);
  if (c.siteKind === 'blog') out.articles = articles(w).filter((a) => a.blog).slice(-20).reverse().map((a) => ({ id: a.id, title: a.title, lead: a.body.slice(0, 220), at: a.at, author: who(w, a.authorId), comments: a.comments.length }));
  res.json(out);
});
router.get('/mundo/internet/artigo/:id', (req, res) => {
  const w = world(req.user.id); const a = articles(w).find((x) => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Página não encontrada (404)' });
  a.views += 1;
  const c = companyById(w, a.siteId);
  res.json({ ...a, site: c ? siteOf(w, c) : null, author: a.authorId ? who(w, a.authorId) : null, comments: a.comments.map((x) => ({ ...x, author: x.personaId === 'me' ? { id: 'me', name: 'Você', me: true } : who(w, x.personaId) })), events: w.events.filter((e) => a.eventIds.includes(e.id) || (a.storyId && e.storyId === a.storyId)).slice(-8).map((e) => publicEvent(e, w)) });
});
router.post('/mundo/internet/artigo/:id/comentar', (req, res) => {
  const ctx = ctxOf(req); const a = articles(ctx.w).find((x) => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Página não encontrada' });
  ok(res, () => { const text = str(req.body?.text, 600); if (!text) throw new Error('Escreva o comentário'); a.comments.push({ id: uid(), personaId: 'me', text, at: new Date().toISOString() }); const author = personById(ctx.w, a.authorId); if (author) bumpUser(ctx, author, 1, {}); return { ok: true }; });
});

// ---------------------------------------------------------------- 04 · World Media + 10 · Entretenimento
router.get('/mundo/midia', (req, res) => {
  const w = world(req.user.id); const M = media(w);
  const cat = req.query.cat;
  const news = articles(w).filter((a) => !a.blog && (!cat || a.cat === cat)).slice(-40).reverse().map((a) => ({ id: a.id, title: a.title, lead: a.lead || a.body.slice(0, 200), cat: a.cat, catLabel: CATS[a.cat], at: a.at, site: siteOf(w, companyById(w, a.siteId) || {}), author: a.authorId ? who(w, a.authorId) : null, ai: a.ai, importance: a.importance }));
  const avg = (f) => (f.reviews.length ? Math.round((f.reviews.reduce((s, r) => s + r.score, 0) / f.reviews.length) * 10) / 10 : null);
  res.json({
    news, cats: CATS, channels: CHANNELS,
    films: M.films.slice(-12).reverse().map((f) => ({ ...f, studio: companyById(w, f.studioId)?.name, director: who(w, f.directorId), cast: f.castIds.map((id) => who(w, id)), score: avg(f), reviews: f.reviews.map((r) => ({ ...r, critic: who(w, r.personaId) })) })),
    songs: M.songs.slice(-10).reverse().map((s) => ({ ...s, artist: who(w, s.artistId) })),
    awards: M.awards.slice(-5).reverse().map((a) => ({ ...a, film: M.films.find((f) => f.id === a.filmId)?.title })),
    celebrities: people(w).filter((p) => (p.followers || 0) > 5000).sort((a, b) => b.followers - a.followers).slice(0, 10).map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color, followers: p.followers, job: p.job, mood: p.mood })),
    sponsorships: M.sponsorships.slice(-5).reverse().map((s) => ({ ...s, company: companyById(w, s.companyId)?.name, persona: who(w, s.personaId) })),
  });
});
router.get('/mundo/midia/programa/:id', (req, res) => {
  const w = need(req, res); if (!w) return;
  const p = program(w, req.params.id);
  if (!p) return res.status(404).json({ error: 'Canal não encontrado' });
  saveWorld();
  res.json(p);
});
router.get('/mundo/diversao/quiz', (req, res) => {
  const w = need(req, res); if (!w) return;
  const u = account(w);
  const today = new Date().toISOString().slice(0, 10);
  if (u.quizDay !== today) { u.quizDay = today; u.quizCount = 0; }
  const qs = quiz(w);
  u.quiz = { at: new Date().toISOString(), answers: Object.fromEntries(qs.map((q) => [q.id, q.answer])) };
  saveWorld();
  res.json({ questions: qs.map(({ id, q, options }) => ({ id, q, options })), left: Math.max(0, 3 - u.quizCount), best: u.quizBest || 0 });
});
router.post('/mundo/diversao/quiz', (req, res) => {
  const ctx = ctxOf(req); const u = account(ctx.w);
  ok(res, () => {
    if (!u.quiz) throw new Error('Comece um quiz primeiro');
    const ans = req.body?.answers || {};
    const results = Object.entries(u.quiz.answers).map(([id, right]) => ({ id: Number(id), right, chosen: ans[id] ?? null, ok: ans[id] === right }));
    const score = results.filter((r) => r.ok).length;
    u.quiz = null;
    let prize = 0;
    if ((u.quizCount || 0) < 3) { prize = score * 40; u.quizCount = (u.quizCount || 0) + 1; if (prize) credit(ctx.w, prize, `Prêmio do Quiz da Cidade (${score} acertos)`, new Date(), 'premio'); }
    u.quizBest = Math.max(u.quizBest || 0, score);
    addXp(ctx.w, score * 4);
    return { score, total: results.length, prize, results };
  });
});

// ---------------------------------------------------------------- 05 · Governo
router.get('/mundo/governo', (req, res) => { const w = world(req.user.id); res.json(publicPolitics(w)); });
router.post('/mundo/governo/partido/:id', (req, res) => { const ctx = ctxOf(req); ok(res, () => ({ party: joinParty(ctx, req.params.id) })); });
router.post('/mundo/governo/candidatura', (req, res) => { const ctx = ctxOf(req); ok(res, () => { runForOffice(ctx, req.body?.office, req.body?.ideology); return publicPolitics(ctx.w); }); });
router.post('/mundo/governo/campanha', (req, res) => { const ctx = ctxOf(req); ok(res, () => { campaign(ctx, Number(req.body?.valor)); return publicPolitics(ctx.w); }); });
router.post('/mundo/governo/lei', (req, res) => { const ctx = ctxOf(req); ok(res, () => userProposeLaw(ctx, req.body?.key)); });
router.post('/mundo/governo/lei/:id/voto', (req, res) => { const ctx = ctxOf(req); ok(res, () => voteLaw(ctx, req.params.id, req.body?.voto)); });

// ---------------------------------------------------------------- 06 · Economia
router.get('/mundo/economia', (req, res) => {
  const w = world(req.user.id); const u = account(w); const e = eco(w);
  const portfolio = Object.entries(u.portfolio).filter(([, p]) => p.shares > 0).map(([id, p]) => { const c = companyById(w, id); return { company: c ? publicCompany(w, c) : { id, name: '?' }, shares: p.shares, avg: p.avg, value: round2((c?.price || 0) * p.shares), pl: round2(((c?.price || 0) - p.avg) * p.shares) }; });
  res.json({
    bank: { balance: u.bank.balance, wallet: u.bank.wallet, score: u.bank.score },
    netWorth: netWorth(w), reputation: u.reputation, portfolio,
    market: companies(w).map((c) => publicCompany(w, c)).sort((a, b) => (a.status === 'falida') - (b.status === 'falida') || b.price - a.price),
    index: e.index, indexHistory: e.indexHistory.slice(-72).map((x) => x.v), inflation: e.inflation, cpi: e.cpi, taxRate: e.taxRate, baseRate: e.baseRate,
    sectors: Object.fromEntries(Object.entries(SECTORS).map(([k, v]) => [k, v.label])), foundCost: FOUND_COST,
  });
});
router.post('/mundo/banco/transferir', (req, res) => {
  const ctx = ctxOf(req);
  ok(res, () => {
    const p = personById(ctx.w, req.body?.personaId);
    if (!p) throw new Error('Pessoa não encontrada');
    const v = round2(Number(req.body?.valor));
    verifyPin(ctx.w, req.body?.pin);
    debit(ctx.w, v, `Pix para ${p.name} (@${p.handle})${req.body?.motivo ? ` — ${str(req.body.motivo, 60)}` : ''}`, ctx.at, 'pix');
    agentOf(ctx.w, p).cash += v;
    bumpUser(ctx, p, clamp(Math.round(v / 100), 1, 10), { contact: true, note: `${userName(ctx)} me mandou ${v} NXC${req.body?.motivo ? ` (${str(req.body.motivo, 60)})` : ''}.` });
    record(ctx, { type: 'transferencia', cat: 'pessoal', title: `Você enviou ${v.toLocaleString('pt-BR')} NXC para ${p.name}`, actors: ['me', p.id], importance: 1 });
    return { balance: account(ctx.w).bank.balance };
  });
});
router.post('/mundo/bolsa', (req, res) => { const ctx = ctxOf(req); ok(res, () => { if (!hasAuthority(ctx.w, 'investidor')) throw new Error('Para investir na Bolsa, forme-se em Economia e credencie-se (Carreira).'); return trade(ctx, req.body?.companyId, Number(req.body?.qtd), req.body?.lado === 'venda' ? 'venda' : 'compra'); }); });
router.get('/mundo/empresas/:id', (req, res) => {
  const w = world(req.user.id); const c = companyById(w, req.params.id);
  if (!c) return res.status(404).json({ error: 'Empresa não encontrada' });
  res.json({ ...publicCompany(w, c, true), events: w.events.filter((e) => e.refs.some((r) => r.id === c.id)).slice(-25).reverse().map((e) => publicEvent(e, w)), mine: c.founderId === 'me', position: account(w).portfolio[c.id] || null });
});
router.post('/mundo/empresas', (req, res) => { const ctx = ctxOf(req); if (!born(ctx.w)) return res.status(409).json({ error: 'O mundo ainda está nascendo' }); ok(res, () => { if (!hasAuthority(ctx.w, 'empresario')) throw new Error('Para abrir empresa, forme-se em Administração e registre-se na Junta Comercial (Carreira).'); return publicCompany(ctx.w, foundUserCompany(ctx, req.body?.nome, req.body?.setor), true); }); });
router.post('/mundo/empresas/:id/gestao', (req, res) => {
  const ctx = ctxOf(req); const c = companyById(ctx.w, req.params.id);
  if (!c) return res.status(404).json({ error: 'Empresa não encontrada' });
  ok(res, () => publicCompany(ctx.w, manageCompany(ctx, c, req.body || {}), true));
});

// carreira: vagas, expediente, cursos
router.get('/mundo/carreira', (req, res) => {
  const w = world(req.user.id); const u = account(w);
  const c = u.job ? companyById(w, u.job.companyId) : null;
  const task = c ? WORK_TASKS[c.sector] : null;
  res.json({
    job: u.job ? { ...u.job, company: c ? publicCompany(w, c) : null, workedToday: u.job.lastWork === new Date().toISOString().slice(0, 10), colleagues: (c?.employees || []).filter((e) => e.personaId !== 'me').slice(0, 8).map((e) => ({ ...who(w, e.personaId), role: e.role, relation: personById(w, e.personaId)?.agent ? REL_LABEL[relType({ aff: personById(w, e.personaId).agent.user.aff, met: true })] : '' })) } : null,
    task: task ? { text: task[0], options: task[1] } : null,
    applications: (u.applications || []).slice().reverse().map((a) => ({ ...a, company: companyById(w, a.companyId)?.name })),
    openings: companies(w).filter((x) => x.status !== 'falida' && x.founderId !== 'me').flatMap((x) => x.openings.map((o) => ({ ...o, companyId: x.id, company: x.name, sector: SECTORS[x.sector]?.label, reputation: x.reputation }))),
    courses: (w.edu?.courses || []).map((x) => ({ ...x, cost: Math.round(x.cost * (w.eco?.cpi || 1) * (1 - (w.eco?.eduDiscount || 0))), done: u.diplomas.includes(x.name) })),
    studying: u.studying || null, diplomas: u.diplomas, history: u.jobHistory || [], reputation: u.reputation,
    professions: professionsFor(w), authorities: u.authorities || [],
    discoveries: (w.edu?.discoveries || []).slice(-5).reverse(), labs: w.edu?.labs || [],
  });
});
router.post('/mundo/vagas/:companyId/:openingId', (req, res) => {
  const ctx = ctxOf(req); const c = companyById(ctx.w, req.params.companyId); const op = c?.openings.find((o) => o.id === req.params.openingId);
  if (!op) return res.status(404).json({ error: 'Vaga encerrada' });
  ok(res, () => applyUser(ctx, c, op));
});
router.post('/mundo/trabalho', (req, res) => { const ctx = ctxOf(req); ok(res, () => workDay(ctx, req.body?.escolha)); });
router.post('/mundo/trabalho/sair', (req, res) => {
  const ctx = ctxOf(req);
  ok(res, () => { const u = account(ctx.w); if (!u.job) throw new Error('Você não está empregado(a)'); const c = companyById(ctx.w, u.job.companyId); if (c) c.employees = c.employees.filter((e) => e.personaId !== 'me'); u.jobHistory ??= []; u.jobHistory.push({ ...u.job, until: new Date().toISOString(), reason: 'pediu demissão' }); u.job = null; record(ctx, { type: 'pediu-demissao-usuario', cat: 'economia', title: `Você pediu demissão da ${c?.name || 'empresa'}`, actors: ['me'], importance: 2 }); return { ok: true }; });
});
router.post('/mundo/educacao/:id', (req, res) => { const ctx = ctxOf(req); ok(res, () => enroll(ctx, req.params.id)); });
router.post('/mundo/educacao/aula/:dia', (req, res) => { const ctx = ctxOf(req); ok(res, () => readLesson(ctx, req.params.dia)); });
router.post('/mundo/profissao/:key', (req, res) => { const ctx = ctxOf(req); ok(res, () => ({ professions: claimProfession(ctx, req.params.key) })); });

router.get('/mundo/imoveis', (req, res) => {
  const w = world(req.user.id);
  res.json((w.properties || []).map((p) => ({ ...p, price: priceNow(w, p.base), district: districtById(w, p.districtId)?.name, owner: p.ownerType === 'user' ? { id: 'me', name: 'Você' } : p.ownerType === 'persona' ? who(w, p.ownerId) : null, rentDay: ['apartamento', 'escritorio'].includes(p.kind) ? round2(priceNow(w, p.base) * 0.0012) : 0 })).sort((a, b) => a.price - b.price));
});
router.post('/mundo/imoveis/:id/:acao', (req, res) => {
  const ctx = ctxOf(req); const pr = (ctx.w.properties || []).find((x) => x.id === req.params.id);
  if (!pr) return res.status(404).json({ error: 'Imóvel não encontrado' });
  ok(res, () => {
    const price = priceNow(ctx.w, pr.base);
    if (req.params.acao === 'comprar') {
      if (pr.ownerType !== 'cidade') throw new Error('Esse imóvel não está à venda');
      verifyPin(ctx.w, req.body?.pin);
      debit(ctx.w, price, `Compra: ${pr.name}`, ctx.at, 'imovel'); pr.ownerType = 'user'; pr.ownerId = 'me'; eco(ctx.w).treasury = round2((eco(ctx.w).treasury || 0) + price); // o imóvel era da cidade: o dinheiro vai para o tesouro
      record(ctx, { type: 'imovel-usuario', cat: 'local', title: `Você comprou ${pr.name}`, text: `${price.toLocaleString('pt-BR')} NXC.`, actors: ['me'], refs: [{ t: 'district', id: pr.districtId }], importance: 2 });
      addXp(ctx.w, 60);
    } else if (req.params.acao === 'vender') {
      if (pr.ownerType !== 'user') throw new Error('Esse imóvel não é seu');
      const v = round2(price * 0.95);
      if ((eco(ctx.w).treasury || 0) < v) throw new Error('A prefeitura não tem caixa para recomprar esse imóvel agora. Tente outro dia.');
      eco(ctx.w).treasury = round2(eco(ctx.w).treasury - v);
      credit(ctx.w, v, `Venda: ${pr.name}`, ctx.at, 'venda'); pr.ownerType = 'cidade'; pr.ownerId = null;
      record(ctx, { type: 'imovel-venda', cat: 'local', title: `Você vendeu ${pr.name}`, text: `${v.toLocaleString('pt-BR')} NXC.`, actors: ['me'], importance: 1 });
    } else throw new Error('Ação inválida');
    return { ok: true };
  });
});

// ---------------------------------------------------------------- 07 · Mapa
function mapData(w, mini = false) {
  const since = new Date(Date.now() - DAY).toISOString();
  const dist = w.city.districts.map((d) => ({ id: d.id, name: d.name, color: d.color, kind: d.kind, poly: d.poly, locked: Boolean(d.locked), value: d.value, residents: residents(w).filter((p) => p.agent.districtId === d.id).length }));
  const companiesM = companies(w).filter((c) => c.status !== 'falida').map((c) => { c.pos ??= pointFor(w, c.districtId); return { id: c.id, name: c.name, x: c.pos[0], y: c.pos[1], color: c.color, kind: 'empresa', status: c.status }; });
  const incidents = w.events.filter((e) => e.at > since && e.cat === 'seguranca' && e.refs.some((r) => r.t === 'district')).slice(-8).map((e) => { const d = districtById(w, e.refs.find((r) => r.t === 'district').id); const pt = d ? centroid(d.poly) : [500, 300]; return { id: e.id, title: e.title, x: pt[0] + (e.n % 30) - 15, y: pt[1] + (e.n % 20) - 10, kind: 'alerta' }; });
  const out = { districts: dist, companies: companiesM, incidents };
  if (!mini) out.places = w.city.places.filter((p) => !districtById(w, p.districtId)?.locked);
  if (!mini) out.events = invites(w).filter((i) => ['agendado', 'acontecendo'].includes(i.status) && i.placeId).map((i) => { const pl = w.city.places.find((p) => p.id === i.placeId); return pl ? { id: i.id, title: i.title, x: pl.x, y: pl.y, status: i.status, at: i.at } : null; }).filter(Boolean);
  return out;
}
const centroid = (poly) => [Math.round(poly.reduce((s, p) => s + p[0], 0) / poly.length), Math.round(poly.reduce((s, p) => s + p[1], 0) / poly.length)];
function pointFor(w, did) { const d = districtById(w, did); if (!d) return [500, 300]; const c = centroid(d.poly); return [c[0] + Math.round((Math.random() - 0.5) * 70), c[1] + Math.round((Math.random() - 0.5) * 50)]; }
router.get('/mundo/mapa', (req, res) => {
  const w = need(req, res); if (!w) return;
  const out = mapData(w);
  out.recent = w.events.filter((e) => e.refs.some((r) => r.t === 'district')).slice(-10).reverse().map((e) => publicEvent(e, w));
  out.clubs = (w.sports?.clubs || []).map((c) => ({ id: c.id, name: c.name, color: c.color, districtId: c.districtId }));
  out.weather = weatherNow(w);
  res.json(out);
});
router.get('/mundo/bairro/:id', (req, res) => {
  const w = world(req.user.id); const d = districtById(w, req.params.id);
  if (!d) return res.status(404).json({ error: 'Bairro não encontrado' });
  res.json({ ...d, residents: residents(w).filter((p) => p.agent.districtId === d.id).slice(0, 40).map((p) => publicAgent(w, p)), places: w.city.places.filter((p) => p.districtId === d.id), companies: companies(w).filter((c) => c.districtId === d.id).map((c) => publicCompany(w, c)), properties: (w.properties || []).filter((p) => p.districtId === d.id).map((p) => ({ ...p, price: priceNow(w, p.base) })), events: w.events.filter((e) => e.refs.some((r) => r.id === d.id)).slice(-15).reverse().map((e) => publicEvent(e, w)) });
});

// ---------------------------------------------------------------- 08 · AI Control
router.get('/mundo/controle', (req, res) => {
  const w = world(req.user.id);
  const list = people(w).map((p) => publicAgent(w, p));
  res.json({
    cfg: w.core.cfg, paces: Object.keys(PACES), ai: { ready: aiReady(), left: aiBudget(w), perHour: w.core.cfg.aiPerHour || PACES[w.core.cfg.pace]?.aiPerHour }, born: born(w), genesisAt: w.core.genesisAt || null,
    stats: { people: list.length, residents: list.filter((x) => x.resident).length, events: w.events.length, companies: companies(w).length, articles: articles(w).length, queue: w.queue.length, rumors: rumors(w).length, communities: communities(w).length, origin: { genese: w.events.filter((e) => e.origin === 'genese').length, vivo: w.events.filter((e) => e.origin === 'vivo').length, recuperado: w.events.filter((e) => e.origin === 'recuperado').length } },
    agents: list.sort((a, b) => b.relation.aff - a.relation.aff),
  });
});
router.put('/mundo/controle', (req, res) => {
  const w = world(req.user.id);
  ok(res, () => {
    const b = req.body || {};
    if (PACES[b.pace]) w.core.cfg.pace = b.pace;
    if ('aiPerHour' in b) w.core.cfg.aiPerHour = b.aiPerHour == null || b.aiPerHour === '' ? null : clamp(Math.round(Number(b.aiPerHour)), 0, 200);
    if ('enabled' in b) w.core.cfg.enabled = Boolean(b.enabled);
    const s = net(req.user.id);
    if (PACES[b.pace]) s.cfg.pace = b.pace;
    return w.core.cfg;
  });
});
router.put('/mundo/agentes/:id', (req, res) => {
  const w = world(req.user.id); const p = personById(w, req.params.id);
  if (!p) return res.status(404).json({ error: 'Pessoa não encontrada' });
  ok(res, () => { const a = agentOf(w, p); if (['baixa', 'normal', 'alta'].includes(req.body?.autonomy)) a.autonomy = req.body.autonomy; return publicAgent(w, p, true); });
});
router.post('/mundo/controle/reiniciar', (req, res) => {
  if (req.body?.confirmar !== 'REINICIAR') return res.status(400).json({ error: 'Digite REINICIAR para confirmar' });
  const w = world(req.user.id);
  const social = w.social;
  resetWorld(req.user.id);
  // a rede (pessoas e posts) fica; a história da cidade recomeça do zero
  const fresh = world(req.user.id);
  if (social) { for (const p of social.personas) { delete p.agent; delete p.origin; } fresh.social = social; }
  saveWorld();
  res.json({ ok: true });
});

export default router;
