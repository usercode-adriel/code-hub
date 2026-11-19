// Rotas da fase 2.2: mapa, deslocamento, banco, dinheiro entre pessoas, comércio, inventário, polícia e justiça.
import express from 'express';
import crypto from 'node:crypto';
import { world, publicEvent, CATS, aiTake } from './core.js';
import { geminiJSON } from '../assistant.js';
import { saveWorld } from './store.js';
import { people, residents, personById, agentOf, isAwake, isWorking, relType, REL_LABEL, userName, publicAgent } from './agents.js';
import {
  account, bankOf, hasPin, setPin, verifyPin, propose, contract, payContract, renegotiate, requestCard, payCardBill, savingsOp, walletOp, creditLimit, dailyIncome, outstanding, band, bandsOf, once, debit, isLate, BankError, PERIOD_DAYS,
} from './bank.js';
import { eco, companies, companyById } from './economy.js';
import { geoPublic, route, freeNode, pos, districtOfNode, W, H } from './map.js';
import { PLACE_CATS, PRODUCTS, places, placeById, isOpen, storeView, negotiate, sellerChat, buy, rate, travel, TRANSPORT } from './commerce.js';
import { inv, publicItem, itemAction } from './inventory.js';
import { justice, publicCase, testify, settleCase, payFine, report, DEFAULT_PENALTIES, penalty } from './justice.js';
import { hasAuthority, society, professionsFor } from './society.js';
import { orgsCenter, publicOrg, orgById, requestJoin, acceptInvite, leaveOrg } from './orgs.js';
import { peopleView, housesPublic, housePublic, live } from './living.js';
import { devicesOf, phoneOf, walletOf, clockOf, PHONES, TIERS, APPS } from './devices.js';
import { loans, askFriendLoan, acceptFriendLoan, repayFriendLoan, createVaquinha, VAQUINHA_MOTIVOS, gigs, doGig } from './finance.js';
import { listConversations } from '../assistant.js';
import { restyleFaces, requestImage } from '../social.js';
import { str, round2, clamp, nowIso, HOUR, cap } from './util.js';
import { single, removeUpload } from '../routes/uploads.js';

const router = express.Router();
const ctxOf = (req) => ({ user: req.user, uid: req.user.id, w: world(req.user.id), live: true, at: new Date() });
const run = (res, fn) => {
  Promise.resolve().then(fn).then((out) => { saveWorld(); res.json(out ?? { ok: true }); })
    .catch((err) => { saveWorld(); res.status(err.code === 'PIN_LOCKED' ? 423 : 400).json({ error: err.message, code: err.code || null }); });
};
const visible = (w, pl) => !pl.hidden || (account(w).discovered || []).includes(pl.id);

// ---------------------------------------------------------------- mapa
router.get('/mundo/mapa/geo', (req, res) => {
  const w = world(req.user.id);
  if (!w.city?.mapSeed) return res.status(409).json({ error: 'O mapa ainda está sendo desenhado' });
  const g = geoPublic(w);
  res.set('Cache-Control', 'private, max-age=600').json(g);
});
router.get('/mundo/mapa/camadas', (req, res) => {
  const w = world(req.user.id); const u = account(w);
  if (!w.city?.mapSeed) return res.status(409).json({ error: 'O mapa ainda está sendo desenhado' });
  const at = new Date();
  const out = {
    cats: PLACE_CATS,
    places: places(w).filter((pl) => visible(w, pl) && pl.node != null).map((pl) => ({ id: pl.id, name: pl.name, kind: pl.kind, sub: pl.sub || null, x: pl.x, y: pl.y, address: pl.address, open: isOpen(pl, at), status: pl.status, hidden: Boolean(pl.hidden), rating: pl.reputation ? round2(pl.reputation) : null, shop: Boolean(pl.catalog), districtId: pl.districtId })),
    events: (w.invites || []).filter((i) => ['agendado', 'acontecendo'].includes(i.status) && i.placeId).map((i) => { const pl = placeById(w, i.placeId); return pl ? { id: i.id, title: i.title, x: pl.x, y: pl.y, status: i.status, at: i.at, mine: Boolean(i.user) } : null; }).filter(Boolean),
    alerts: (w.events || []).filter((e) => e.cat === 'seguranca' && e.at > new Date(Date.now() - 24 * HOUR).toISOString()).slice(-12).map((e) => {
      const pl = placeById(w, e.refs?.find((r) => r.t === 'place')?.id); const d = (w.city.districts || []).find((x) => x.id === e.refs?.find((r) => r.t === 'district')?.id);
      if (pl) return { id: e.id, title: e.title, x: pl.x, y: pl.y };
      if (!d) return null;
      const c = d.poly.reduce((s, p) => [s[0] + p[0] * 2, s[1] + p[1] * 2], [0, 0]).map((v) => Math.round(v / d.poly.length));
      return { id: e.id, title: e.title, x: c[0] + (e.n % 40) - 20, y: c[1] + (e.n % 30) - 15 };
    }).filter(Boolean),
    me: u.location ? { ...u.location, xy: pos(w, u.location.node), place: placeById(w, u.location.placeId)?.name || null } : null,
    smart: Boolean(u.installed?.mapa),
  };
  out.houses = housesPublic(w);
  if (out.smart) {
    out.properties = (w.properties || []).filter((p) => p.node != null).map((p) => ({ id: p.id, name: p.name, kind: p.kind, x: p.x, y: p.y, owner: p.ownerType, forSale: p.ownerType === 'cidade', address: p.address }));
  }
  res.json(out);
});
// cidadãos andando: posição agora e os próximos segundos, para o navegador animar entre uma consulta e outra
router.get('/mundo/mapa/pessoas', (req, res) => {
  const w = world(req.user.id);
  if (!w.city?.mapSeed) return res.status(409).json({ error: 'O mapa ainda está sendo desenhado' });
  const q = req.query; const num = (v) => (v === undefined || v === '' ? null : Number(v));
  const box = [num(q.x0), num(q.y0), num(q.x1), num(q.y1)];
  const bbox = box.every((v) => Number.isFinite(v)) ? box : null;
  const now = Date.now(); let t = now;
  if (Number.isFinite(Number(q.t))) t = Math.max(now - 24 * HOUR, Math.min(now + 24 * HOUR, Number(q.t))); // pré-visualização de outro horário do dia
  const horizon = 6000;
  const online = residents(w).filter((p) => p.agent.status === 'ativo' && isAwake(p, new Date(t))).length;
  res.json({ t, horizon, online, people: peopleView(w, { bbox, t, horizon }) });
});
// feed "ao vivo": entradas e saídas, compras e o que virou notícia
router.get('/mundo/mapa/ao-vivo', (req, res) => {
  const w = world(req.user.id); const n = Math.min(40, Number(req.query.n) || 14);
  const since = new Date(Date.now() - 3 * HOUR).toISOString();
  const items = (live(w).items || []).filter((x) => x.at > since).map((x) => ({ id: x.id, at: x.at, kind: x.kind, personaId: x.personaId || null, name: x.name || null, placeId: x.placeId || null, placeName: x.placeName || null, text: x.text }));
  const news = (w.events || []).filter((e) => e.at > since && e.type !== 'genese' && (e.cat === 'seguranca' || e.importance >= 3)).map((e) => ({ id: e.id, at: e.at, kind: e.cat === 'seguranca' ? 'alerta' : 'noticia', text: e.title }));
  res.json([...items, ...news].sort((a, b) => b.at.localeCompare(a.at)).slice(0, n));
});
// LIVE reutilizável: cidade inteira, um lugar (place:<id>) ou um tema (banco, policia, saude, comercio).
// Só eventos reais (feed de chegadas/saídas/compras + acontecimentos do mundo); "watching" = quem está lá agora.
const LIVE_SCOPES = {
  banco: { kinds: ['banco', 'emprestimo', 'pix', 'deposito', 'saque', 'investimento', 'pagamento'], cats: [], types: /banco|emprest|divida|cartao|pix|investi|bolsa/ , placeKinds: ['banco'] },
  policia: { kinds: ['alerta', 'prisao', 'ocorrencia', 'denuncia', 'fianca'], cats: ['seguranca'], placeKinds: ['delegacia', 'tribunal'] },
  saude: { kinds: ['atendimento'], cats: [], types: /saude|hospital|doen|clinica/, placeKinds: ['hospital', 'clinica', 'farmacia'] },
  comercio: { kinds: ['compra', 'promo', 'devolucao', 'reposicao'], cats: [], placeKinds: null },
};
router.get('/mundo/ao-vivo', (req, res) => {
  const w = world(req.user.id); const n = Math.min(40, Number(req.query.n) || 16);
  const scope = String(req.query.scope || 'cidade'); const since = new Date(Date.now() - 6 * HOUR).toISOString();
  const placeId = scope.startsWith('place:') ? scope.slice(6) : null; const sc = LIVE_SCOPES[scope] || null;
  const placeKind = (id) => placeById(w, id)?.kind;
  const face = (id) => { if (id === 'me') return { id: 'me', name: 'Você', me: true }; const p = id && personById(w, id); return p ? { id: p.id, name: p.name, avatar: p.avatar, color: p.color } : null; };
  let items = (live(w).items || []).filter((x) => x.at > since);
  if (placeId) items = items.filter((x) => x.placeId === placeId);
  else if (sc) items = items.filter((x) => sc.kinds.includes(x.kind) || (sc.placeKinds && x.placeId && sc.placeKinds.includes(placeKind(x.placeId))));
  let evs = (w.events || []).filter((e) => e.at > since && e.type !== 'genese');
  if (placeId) evs = evs.filter((e) => e.refs?.some((r) => r.id === placeId));
  else if (sc) evs = evs.filter((e) => sc.cats.includes(e.cat) || (sc.types && sc.types.test(e.type || '')));
  else evs = evs.filter((e) => e.cat === 'seguranca' || e.importance >= 2);
  const out = [
    ...items.map((x) => ({ id: x.id, at: x.at, kind: x.kind, text: x.text, placeId: x.placeId || null, placeName: x.placeName || null, who: face(x.personaId) || (x.name ? { name: x.name } : null), amount: x.amount ?? null })),
    ...evs.map((e) => ({ id: e.id, at: e.at, kind: e.cat === 'seguranca' ? 'alerta' : 'noticia', cat: e.cat, text: e.title, who: face((e.actors || []).find((a) => a && a !== 'me')) || ((e.actors || []).includes('me') ? { id: 'me', name: 'Você', me: true } : null) })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, n);
  let watching = 0;
  if (placeId || sc?.placeKinds) { const pv = peopleView(w, { limit: 9999, horizon: 0 }); const names = new Set(places(w).filter((pl) => (placeId ? pl.id === placeId : sc.placeKinds.includes(pl.kind))).map((pl) => pl.name)); watching = pv.filter((p) => names.has(p.place)).length; }
  else watching = peopleView(w, { limit: 9999, horizon: 0 }).filter((p) => p.place !== 'em casa').length;
  res.json({ scope, watching, items: out });
});
router.get('/mundo/mapa/casa/:id', (req, res) => { const h = housePublic(world(req.user.id), req.params.id); if (!h) return res.status(404).json({ error: 'Casa não encontrada' }); res.json(h); });
router.get('/mundo/mapa/local/:id', (req, res) => {
  const w = world(req.user.id);
  const pl = placeById(w, req.params.id);
  if (!pl || !visible(w, pl)) return res.status(404).json({ error: 'Local não encontrado' });
  const c = companyById(w, pl.companyId);
  const owner = c ? personById(w, c.ceoId) : null;
  const staff = (c?.employees || []).slice(0, 6).map((e) => personById(w, e.personaId)).filter(Boolean);
  const cat = PLACE_CATS[pl.kind] || {};
  res.json({ id: pl.id, name: pl.name, kind: pl.kind, kindLabel: cat.label || pl.kind, icon: cat.icon, color: cat.color, sub: pl.sub, address: pl.address, hours: pl.hours, open: isOpen(pl), status: pl.status, rating: pl.reputation ? round2(pl.reputation) : null, reviews: (pl.ratings || []).length,
    owner: owner ? { id: owner.id, name: owner.name, avatar: owner.avatar, color: owner.color } : null, company: c ? { id: c.id, name: c.name, status: c.status } : null,
    staff: staff.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color, role: p.agent?.role })), products: (pl.catalog || []).slice(0, 6).map((it) => ({ name: PRODUCTS[it.key].name, stock: it.stock })),
    shop: Boolean(pl.catalog), app: cat.app || null, here: account(w).location?.placeId === pl.id,
    history: (w.events || []).filter((e) => e.refs?.some((r) => r.id === pl.id || (c && r.id === c.id))).slice(-5).reverse().map((e) => ({ at: e.at, title: e.title })) });
});
router.get('/mundo/rota', (req, res) => {
  const w = world(req.user.id); const u = account(w);
  const node = (v) => (v === 'eu' ? u.location?.node : placeById(w, v)?.node);
  const r = route(w, node(String(req.query.de || 'eu')), node(String(req.query.para || '')));
  if (!r) return res.status(404).json({ error: 'Sem rota entre esses pontos' });
  res.json({ ...r, fares: Object.fromEntries(Object.entries(TRANSPORT).map(([k, t]) => [k, { label: t.label, fee: t.fee(r.meters), minutes: r.minutes[k] }])) });
});
router.post('/mundo/ir', (req, res) => { const ctx = ctxOf(req); run(res, () => travel(ctx, req.body?.placeId, req.body?.modo)); });

// ---------------------------------------------------------------- banco
router.get('/mundo/banco', (req, res) => {
  const w = world(req.user.id); const u = account(w); const b = u.bank; const e = eco(w);
  res.json({
    hasPin: hasPin(w), pinLocked: Boolean(b.pin?.lockedUntil && b.pin.lockedUntil > nowIso()), balance: b.balance, blocked: b.blocked, blockedItems: b.blockedItems, wallet: b.wallet,
    score: b.score, band: band(w), bands: bandsOf(w), limit: creditLimit(w), income: dailyIncome(w), outstanding: outstanding(w), late: isLate(w), periodDays: PERIOD_DAYS,
    contracts: b.contracts.slice().reverse().slice(0, 12), debts: b.debts.slice().reverse(), card: b.card, savings: b.savings, history: b.history.slice(-80).reverse(), scoreLog: b.scoreLog.slice(-25).reverse(),
    friendLoans: loans(w).filter((l) => l.borrower === 'me').slice().reverse().map((l) => ({ ...l, lender: personById(w, l.lenderId) ? { id: l.lenderId, name: personById(w, l.lenderId).name, avatar: personById(w, l.lenderId).avatar, color: personById(w, l.lenderId).color } : { name: '—' } })),
    lentToFriends: people(w).filter((p) => (p.agent?.debtToUser || 0) > 0).map((p) => ({ id: p.id, name: p.name, amount: p.agent.debtToUser })),
    vaquinhas: (w.vaquinhas || []).slice().reverse(), motivos: VAQUINHA_MOTIVOS, baseRate: e.baseRate, inflation: e.inflation,
  });
});
// movimentações do próprio jogador entram no LIVE do banco (só o que de fato aconteceu)
const BANK_LIVE = [[/\/pix$|\/transferir$/, 'pix', 'fez uma transferência'], [/emprestimo\/contratar$/, 'emprestimo', 'contratou um empréstimo'], [/emprestimo\/pagar$/, 'pagamento', 'pagou uma parcela do empréstimo'],
  [/emprestimo\/renegociar$/, 'emprestimo', 'renegociou uma dívida'], [/\/cartao$/, 'banco', 'recebeu o cartão Nexus'], [/fatura\//, 'pagamento', 'pagou a fatura do cartão'], [/debito\//, 'pagamento', 'pagou uma conta'], [/cofrinho$/, 'investimento', 'mexeu no cofrinho']];
router.use('/mundo/banco', (req, res, next) => {
  if (req.method === 'POST') res.on('finish', () => {
    if (res.statusCode >= 400) return;
    let hit = BANK_LIVE.find(([re]) => re.test(req.path));
    if (/carteira$/.test(req.path)) hit = [null, req.body?.op === 'depositar' ? 'deposito' : 'saque', req.body?.op === 'depositar' ? 'depositou dinheiro' : 'sacou dinheiro'];
    if (!hit) return;
    const w = world(req.user.id); const ag = places(w).find((p) => p.kind === 'banco');
    live(w).items.push({ id: crypto.randomUUID(), at: nowIso(), kind: hit[1], personaId: 'me', name: 'Você', text: `Você ${hit[2]}`, placeId: ag?.id || null, placeName: ag?.name || null });
  });
  next();
});
// gerente do Banco Nexus: uma pessoa real da cidade (quem atende na agência), que conversa sabendo da sua conta
function bankAgency(w) { return places(w).find((p) => p.kind === 'banco' && !/filial/.test(p.name)) || places(w).find((p) => p.kind === 'banco'); }
function managerOf(w, ag) { return ag?.sellerId ? personById(w, ag.sellerId) : null; }
router.get('/mundo/banco/gerente', (req, res) => {
  const w = world(req.user.id); const ag = bankAgency(w); const m = managerOf(w, ag);
  const first = String(req.user.name || '').split(' ')[0];
  res.json({ place: ag ? { id: ag.id, name: ag.name, open: isOpen(ag) } : null, manager: m ? { id: m.id, name: m.name, avatar: m.avatar, color: m.color, gender: m.gender } : null,
    greeting: m ? `Olá, ${first}! Seja bem-vindo(a) ao Banco Nexus. Sou ${m.name.split(' ')[0]}, sua gerente${m.gender === 'm' ? '' : ''}. Como posso te ajudar hoje?`.replace('sua gerente', m.gender === 'm' ? 'seu gerente' : 'sua gerente') : 'Olá! Seja bem-vindo(a) ao Banco Nexus.',
    chat: (ag?.bankChat || []).slice(-20) });
});
router.post('/mundo/banco/gerente', (req, res) => {
  const ctx = ctxOf(req);
  run(res, async () => {
    const w = ctx.w; const ag = bankAgency(w); const m = managerOf(w, ag); const b = bankOf(w);
    const msg = str(req.body?.mensagem, 400); if (!msg) throw new BankError('Escreva uma mensagem');
    ag.bankChat ??= []; ag.bankChat.push({ who: 'me', text: msg, at: nowIso() });
    const pend = (b.debts || []).filter((d) => d.status !== 'paga').length + (b.card?.bills || []).filter((x) => x.status !== 'paga').length;
    const facts = `saldo ${round2(b.balance)} NXC, em mãos ${round2(b.wallet || 0)} NXC, score ${b.score} (${band(w).label}), limite de crédito ${round2(creditLimit(w))} NXC, dívida total ${round2(outstanding(w))} NXC, contratos ativos ${b.contracts.filter((c) => ['ativo', 'inadimplente'].includes(c.status)).length}, pendências ${pend}, cartão ${b.card ? `final ${b.card.last4}` : 'não tem'}`;
    let text = null; let action = null;
    const f = msg.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (/emprest|credito|dinheiro empre/.test(f)) action = 'emprestimos';
    else if (/pix|transfer/.test(f)) action = 'pix';
    else if (/fatura|conta|boleto|pagar|pendenc/.test(f)) action = 'pendencias';
    else if (/cartao/.test(f)) action = 'cartao';
    else if (/guardar|poupar|cofrinho|investi|render/.test(f)) action = 'cofrinhos';
    else if (/extrato|movimenta/.test(f)) action = 'extrato';
    if (m && aiTake(ctx)) {
      try {
        const out = await geminiJSON(`Você é ${m.name}, gerente do Banco Nexus em Nexus City (cidade simulada, moeda NXC). Jeito de falar: ${m.voice || 'cordial e profissional'}. Dados REAIS da conta do cliente ${userName(ctx)}: ${facts}.
Responda em 1 a 3 frases, em português, de forma útil e honesta. Nunca invente aprovação: empréstimos dependem do limite e do score; explique o próximo passo no app (simular empréstimo, Pix, pagar pendências, cartão, cofrinhos). Nunca peça a senha. Mensagem: "${msg}". JSON: {"resposta":""}`, 500, 0.7);
        text = str(out?.resposta, 500) || null;
      } catch (err) { console.error('[banco] gerente:', err.message); }
    }
    if (!text) {
      text = action === 'emprestimos' ? (creditLimit(w) > 0 ? `Seu limite hoje é de ${round2(creditLimit(w)).toLocaleString('pt-BR')} NXC com score ${b.score}. Posso simular para você: abra "Solicitar empréstimo" e escolha valor e parcelas.` : `No momento seu score (${b.score}) não libera crédito. Pagar as pendências em dia e ter renda ajuda a subir.`)
        : action === 'pix' ? `Para enviar um Pix, toque em "Transferir" e use o @ da pessoa. Seu saldo disponível é ${round2(b.balance).toLocaleString('pt-BR')} NXC.`
        : action === 'pendencias' ? (pend ? `Você tem ${pend} pendência(s). Recomendo pagar logo para não perder score: abra "Realizar pagamento".` : 'Você está em dia, sem contas pendentes. Parabéns!')
        : action === 'cartao' ? (b.card ? `Seu cartão final ${b.card.last4} está ${b.card.status}. A fatura fecha a cada 7 dias.` : 'Você ainda não tem o cartão Nexus. Peça em "Cartão Nexus": a aprovação depende do seu score.')
        : action === 'cofrinhos' ? 'Os cofrinhos rendem um pouco por dia e ajudam a juntar para metas. Abra "Investir" para criar um.'
        : action === 'extrato' ? 'Seu extrato completo está em "Extrato", com entradas e saídas.'
        : `Sua conta: saldo ${round2(b.balance).toLocaleString('pt-BR')} NXC, score ${b.score}. Posso ajudar com empréstimo, pagamentos, Pix, cartão ou cofrinhos.`;
    }
    ag.bankChat.push({ who: 'gerente', text, at: nowIso(), action }); cap(ag.bankChat, 40);
    return { text, action, manager: m ? { id: m.id, name: m.name, avatar: m.avatar } : null };
  });
});
router.post('/mundo/banco/senha', (req, res) => { const w = world(req.user.id); run(res, () => { setPin(w, String(req.body?.pin || ''), req.body?.oldPin ? String(req.body.oldPin) : null); return { ok: true }; }); });
router.post('/mundo/banco/emprestimo/simular', (req, res) => { const w = world(req.user.id); run(res, () => propose(w, eco(w), req.body?.valor, req.body?.parcelas)); });
router.post('/mundo/banco/emprestimo/contratar', (req, res) => {
  const ctx = ctxOf(req);
  run(res, () => once(ctx.w, req.body?.opId, () => {
    verifyPin(ctx.w, req.body?.pin);
    const c = contract(ctx.w, req.body?.proposalId, ctx.at);
    const bank = companies(ctx.w).find((x) => x.name === 'Banco Nexus'); if (bank) bank.cash = round2(bank.cash - c.principal);
    eco(ctx.w).loansOut = (eco(ctx.w).loansOut || 0) + c.principal;
    return { contract: c, balance: bankOf(ctx.w).balance };
  }));
});
router.post('/mundo/banco/emprestimo/pagar', (req, res) => {
  const ctx = ctxOf(req);
  run(res, () => once(ctx.w, req.body?.opId, () => {
    verifyPin(ctx.w, req.body?.pin);
    const r = payContract(ctx.w, req.body?.contractId, { all: Boolean(req.body?.all), at: ctx.at });
    const bank = companies(ctx.w).find((x) => x.name === 'Banco Nexus'); if (bank) bank.salesToday += r.paid;
    return { paid: r.paid, balance: bankOf(ctx.w).balance };
  }));
});
router.post('/mundo/banco/emprestimo/renegociar', (req, res) => { const ctx = ctxOf(req); run(res, () => { verifyPin(ctx.w, req.body?.pin); return renegotiate(ctx.w, eco(ctx.w), req.body?.contractId, req.body?.parcelas, ctx.at); }); });
router.post('/mundo/banco/cartao', (req, res) => { const ctx = ctxOf(req); run(res, () => { verifyPin(ctx.w, req.body?.pin); return requestCard(ctx.w, ctx.at); }); });
router.post('/mundo/banco/fatura/:id', (req, res) => { const ctx = ctxOf(req); run(res, () => { verifyPin(ctx.w, req.body?.pin); return payCardBill(ctx.w, req.params.id, ctx.at); }); });
router.post('/mundo/banco/debito/:id', (req, res) => { const ctx = ctxOf(req); run(res, () => payFine(ctx, req.params.id, req.body?.pin)); });
router.post('/mundo/banco/cofrinho', (req, res) => {
  const ctx = ctxOf(req);
  run(res, () => { if (req.body?.op === 'resgatar') verifyPin(ctx.w, req.body?.pin); return savingsOp(ctx.w, { id: req.body?.id, name: req.body?.name, goal: Number(req.body?.goal) || 0, amount: Number(req.body?.amount) || 0, op: req.body?.op }, ctx.at); });
});
router.post('/mundo/banco/carteira', (req, res) => {
  const ctx = ctxOf(req);
  run(res, () => once(ctx.w, req.body?.opId, () => { if (req.body?.op === 'sacar') verifyPin(ctx.w, req.body?.pin); return { wallet: walletOp(ctx.w, req.body?.op, Number(req.body?.valor), ctx.at), balance: bankOf(ctx.w).balance }; }));
});
router.post('/mundo/banco/pix', (req, res) => {
  const ctx = ctxOf(req);
  run(res, () => once(ctx.w, req.body?.opId, () => {
    const key = String(req.body?.chave || '').trim().replace(/^@/, '').toLowerCase();
    const p = people(ctx.w).find((x) => x.handle?.toLowerCase() === key);
    if (!p?.agent) throw new BankError('Chave Pix não encontrada. Use o @ da pessoa na Rede.');
    const v = round2(Number(req.body?.valor));
    verifyPin(ctx.w, req.body?.pin);
    debit(ctx.w, v, `Pix para ${p.name} (@${p.handle})${req.body?.motivo ? ` — ${str(req.body.motivo, 60)}` : ''}`, ctx.at, 'pix');
    p.agent.cash = round2(p.agent.cash + v);
    if ((p.agent.debtToUser || 0) < 0) p.agent.debtToUser = 0;
    return { balance: bankOf(ctx.w).balance, to: p.name };
  }));
});

// ---------------------------------------------------------------- dinheiro entre pessoas, vaquinha e freelas
router.post('/mundo/amigos/emprestimo', (req, res) => { const ctx = ctxOf(req); run(res, () => askFriendLoan(ctx, req.body?.personaId, req.body?.valor, req.body?.dias)); });
router.post('/mundo/amigos/emprestimo/:id/aceitar', (req, res) => { const ctx = ctxOf(req); run(res, () => acceptFriendLoan(ctx, req.params.id)); });
router.post('/mundo/amigos/emprestimo/:id/pagar', (req, res) => { const ctx = ctxOf(req); run(res, () => once(ctx.w, req.body?.opId, () => { verifyPin(ctx.w, req.body?.pin); return repayFriendLoan(ctx, req.params.id); })); });
router.post('/mundo/vaquinha', (req, res) => { const ctx = ctxOf(req); run(res, () => createVaquinha(ctx, req.body || {})); });
router.get('/mundo/freelas', (req, res) => {
  const w = world(req.user.id);
  res.json(gigs(w).filter((g) => g.status === 'aberto' && g.until > nowIso()).map((g) => ({ ...g, best: undefined, company: companyById(w, g.companyId)?.name })));
});
router.post('/mundo/freelas/:id', (req, res) => { const ctx = ctxOf(req); run(res, () => doGig(ctx, req.params.id, req.body?.escolha)); });

// ---------------------------------------------------------------- comércio
router.get('/mundo/lojas', (req, res) => {
  const w = world(req.user.id); const u = account(w);
  res.json({
    cats: PLACE_CATS, here: u.location?.placeId || null,
    stores: places(w).filter((pl) => pl.catalog && visible(w, pl)).map((pl) => ({ id: pl.id, name: pl.name, kind: pl.kind, kindLabel: PLACE_CATS[pl.kind]?.label, sub: pl.sub, address: pl.address, districtId: pl.districtId, open: isOpen(pl), status: pl.status, hours: pl.hours, rating: round2(pl.reputation || 0), reviews: (pl.ratings || []).length, promo: pl.promo, keys: pl.catalog.slice(0, 5).map((it) => it.key), seller: pl.sellerId && personById(w, pl.sellerId) ? { id: pl.sellerId, name: personById(w, pl.sellerId).name, avatar: personById(w, pl.sellerId).avatar } : null, items: pl.catalog.length, inStock: pl.catalog.filter((x) => x.stock > 0).length, products: pl.catalog.map((x) => PRODUCTS[x.key]?.name).filter(Boolean), hidden: Boolean(pl.hidden) })),
  });
});
const storeOf = (req) => { const w = world(req.user.id); const pl = placeById(w, req.params.id); if (!pl || !pl.catalog || !visible(w, pl)) throw new BankError('Loja não encontrada'); return pl; };
router.get('/mundo/lojas/:id', (req, res) => { const ctx = ctxOf(req); run(res, () => storeView(ctx, storeOf(req))); });
router.post('/mundo/lojas/:id/conversar', (req, res) => { const ctx = ctxOf(req); run(res, () => sellerChat(ctx, storeOf(req), str(req.body?.mensagem, 400))); });
router.post('/mundo/lojas/:id/negociar', (req, res) => { const ctx = ctxOf(req); run(res, () => negotiate(ctx, storeOf(req), req.body?.key, req.body?.oferta)); });
router.post('/mundo/lojas/:id/comprar', (req, res) => { const ctx = ctxOf(req); run(res, () => buy(ctx, storeOf(req), req.body?.key, { method: req.body?.metodo, pin: req.body?.pin, offerId: req.body?.offerId, opId: req.body?.opId })); });
router.post('/mundo/lojas/:id/avaliar', (req, res) => { const ctx = ctxOf(req); run(res, () => ({ reputation: rate(ctx, storeOf(req), Number(req.body?.estrelas), req.body?.texto) })); });

// ---------------------------------------------------------------- inventário
router.get('/mundo/inventario', (req, res) => {
  const w = world(req.user.id); const u = account(w);
  res.json({ items: inv(w).slice().reverse().map(publicItem), installed: u.installed || {}, vipUntil: u.vipUntil || null, memCap: u.memCap || 40, friends: people(w).filter((p) => p.friend).map((p) => ({ id: p.id, name: p.name })), hasCompany: companies(w).some((c) => c.founderId === 'me' && c.status !== 'falida') });
});
router.post('/mundo/inventario/:id/:acao', (req, res) => { const ctx = ctxOf(req); run(res, () => itemAction(ctx, req.params.id, req.params.acao, req.body || {})); });

// ligar para um amigo (precisa do smartphone)
router.post('/mundo/ligar/:personaId', (req, res) => {
  const ctx = ctxOf(req);
  run(res, () => {
    if (!account(ctx.w).installed?.phone) throw new BankError('Você precisa de um smartphone (TechVision Store ou NovaTech Shop).');
    const p = personById(ctx.w, req.params.personaId);
    if (!p?.friend || !p.botId) throw new BankError('Só dá para ligar para amigos que estão no seu chat.');
    const conv = listConversations(ctx.uid).find((c) => c.botId === p.botId && !c.group);
    if (!isAwake(p) || p.agent?.status !== 'ativo') return { answered: false, text: `${p.name} não atendeu${isAwake(p) ? '' : ' (deve estar dormindo)'}.` };
    return { answered: true, conversationId: conv?.id || null };
  });
});

// ---------------------------------------------------------------- polícia e justiça
const mine = (c) => c.suspect.type === 'user' || c.plaintiff === 'me';
router.get('/mundo/policia', (req, res) => {
  const w = world(req.user.id); const J = justice(w);
  const st = places(w).find((p) => p.kind === 'delegacia');
  const since = new Date(Date.now() - 30 * 24 * HOUR).toISOString();
  const authorized = hasAuthority(w, 'policia');
  // público (qualquer cidadão): só o que já foi noticiado + os seus próprios casos + registrar ocorrência
  const base = {
    authorized,
    station: st ? { id: st.id, name: st.name, address: st.address } : null,
    alerts: (w.events || []).filter((e) => e.cat === 'seguranca').slice(-10).reverse().map((e) => publicEvent(e, w)),
    mine: J.cases.filter((c) => mine(c) && c.kind === 'criminal').slice().reverse().map((c) => publicCase(w, c)),
    profession: professionsFor(w).find((x) => x.key === 'policia'),
  };
  if (!authorized) { res.json({ ...base, restricted: true }); return; }
  // acesso interno (autoridade policial): painel completo e sigiloso
  res.json({
    ...base,
    officers: J.officers.map((o) => { const p = personById(w, o.personaId); return p ? { id: p.id, name: p.name, avatar: p.avatar, color: p.color, rank: o.rank, role: p.agent?.role } : null; }).filter(Boolean),
    stats: { open: J.cases.filter((c) => ['aberto', 'investigacao', 'intimado', 'decisao'].includes(c.status)).length, solved: J.cases.filter((c) => c.at > since && ['multa', 'condenado', 'preso'].includes(c.status)).length, archived: J.cases.filter((c) => c.at > since && c.status === 'arquivado').length, arrests: J.cases.filter((c) => c.at > since && c.status === 'preso').length },
    cases: J.cases.filter((c) => c.kind === 'criminal').slice(-40).reverse().map((c) => publicCase(w, c)),
    cyber: hasAuthority(w, 'ciber') ? J.cases.filter((c) => c.type === 'cibernetico').slice(-20).reverse().map((c) => publicCase(w, c)) : null,
    debtors: people(w).filter((p) => (p.agent?.debtToUser || 0) > 0).map((p) => ({ id: p.id, name: p.name, amount: p.agent.debtToUser })),
  });
});
router.post('/mundo/policia/denuncia', (req, res) => { const ctx = ctxOf(req); run(res, () => publicCase(ctx.w, report(ctx, req.body?.personaId, req.body?.tipo, req.body?.relato))); });
router.get('/mundo/justica', (req, res) => {
  const w = world(req.user.id); const J = justice(w); const b = bankOf(w);
  const court = places(w).find((p) => p.kind === 'tribunal');
  const judge = personById(w, J.judgeId);
  const authorized = hasAuthority(w, 'ministro') || hasAuthority(w, 'policia');
  res.json({
    authorized, restricted: !authorized,
    court: court ? { id: court.id, name: court.name, address: court.address } : null, judge: judge ? { id: judge.id, name: judge.name, avatar: judge.avatar, color: judge.color } : null,
    // os seus próprios processos, multas e antecedentes você sempre vê
    mine: J.cases.filter(mine).slice().reverse().map((c) => publicCase(w, c)), record: J.record.slice().reverse(),
    debts: b.debts.filter((d) => ['multa', 'judicial'].includes(d.kind)).slice().reverse(),
    // decisões de terceiros e a tabela de penas só com autoridade; senão, só o que virou notícia
    sentences: authorized
      ? J.cases.filter((c) => ['condenado', 'absolvido', 'acordo', 'preso'].includes(c.status)).slice(-15).reverse().map((c) => publicCase(w, c))
      : (w.events || []).filter((e) => e.cat === 'justica').slice(-10).reverse().map((e) => publicEvent(e, w)),
    penalties: authorized ? Object.fromEntries(Object.keys(DEFAULT_PENALTIES).map((k) => [k, penalty(w, k)])) : null,
    profession: professionsFor(w).find((x) => x.key === 'ministro'),
  });
});
router.post('/mundo/justica/casos/:id/depor', (req, res) => { const ctx = ctxOf(req); run(res, () => publicCase(ctx.w, testify(ctx, req.params.id, req.body?.versao))); });
router.post('/mundo/justica/casos/:id/acordo', (req, res) => { const ctx = ctxOf(req); run(res, () => publicCase(ctx.w, settleCase(ctx, req.params.id, req.body?.pin))); });
router.put('/mundo/justica/penalidades', (req, res) => {
  const w = world(req.user.id);
  run(res, () => {
    if (!hasAuthority(w, 'ministro')) throw new BankError('Apenas um ministro pode alterar as penas.');
    const J = justice(w);
    for (const [k, v] of Object.entries(req.body || {})) if (DEFAULT_PENALTIES[k] && DEFAULT_PENALTIES[k].kind === 'criminal') J.cfg.penalties[k] = { fine: clamp(Math.round(Number(v?.fine) || DEFAULT_PENALTIES[k].fine), 0, 100000) };
    return Object.fromEntries(Object.keys(DEFAULT_PENALTIES).map((k) => [k, penalty(w, k)]));
  });
});

// ---------------------------------------------------------------- organizações autônomas
router.get('/mundo/organizacoes', (req, res) => { const w = world(req.user.id); res.json(orgsCenter(w)); });
router.get('/mundo/organizacoes/:id', (req, res) => { const w = world(req.user.id); const o = orgById(w, req.params.id); if (!o) return res.status(404).json({ error: 'Organização não encontrada' }); res.json(publicOrg(w, o, true)); });
router.post('/mundo/organizacoes/:id/entrar', (req, res) => { const ctx = ctxOf(req); run(res, () => requestJoin(ctx, req.params.id)); });
router.post('/mundo/organizacoes/:id/aceitar', (req, res) => { const ctx = ctxOf(req); run(res, () => acceptInvite(ctx, req.params.id)); });
router.post('/mundo/organizacoes/:id/sair', (req, res) => { const ctx = ctxOf(req); run(res, () => leaveOrg(ctx, req.params.id)); });

// ---------------------------------------------------------------- rostos 3D e imagem da cidade
router.post('/mundo/controle/rostos', (req, res) => { run(res, () => ({ queued: restyleFaces(req.user.id) })); });
router.get('/mundo/heroi', (req, res) => {
  const w = world(req.user.id);
  if (w.city && !w.city.heroImage && !(w.city.heroPending > new Date(Date.now() - 6 * HOUR).toISOString())) {
    w.city.heroPending = nowIso();
    requestImage(req.user.id, 'futuristic cyberpunk megacity at night, aerial view, neon skyscrapers, holographic billboards, flying cars, airship, river reflections, purple and cyan lights, highly detailed open-world video game key art, no text', 1280, 640,
      (url) => { const w2 = world(req.user.id); w2.city.heroImage = url; w2.city.heroPending = null; saveWorld(); });
  }
  res.json({ image: account(w).heroImage || w.city?.heroImage || null });
});
// capa personalizada do início (upload de PNG/JPG, no mesmo tamanho da capa)
router.post('/mundo/capa', single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });
  const w = world(req.user.id); const u = account(w);
  if (u.heroImage?.startsWith('/uploads/')) removeUpload(u.heroImage);
  u.heroImage = `/uploads/${req.file.filename}`;
  saveWorld();
  res.status(201).json({ image: u.heroImage });
});
router.delete('/mundo/capa', (req, res) => {
  const w = world(req.user.id); const u = account(w);
  if (u.heroImage?.startsWith('/uploads/')) removeUpload(u.heroImage);
  u.heroImage = null; saveWorld();
  res.json({ image: w.city?.heroImage || null });
});

// moldura do app (topo, barra lateral e dispositivos): dados leves, atualizados a cada poucos segundos
router.get('/mundo/status', (req, res) => {
  const w = world(req.user.id);
  if (!w.core?.genesisAt) return res.json({ born: false, me: { name: req.user.name, avatar: req.user.avatar || null } });
  const u = account(w); const b = bankOf(w);
  const res0 = residents(w); const t = Date.now();
  let out = 0; let moving = 0;
  for (const p of peopleView(w, { limit: 9999, horizon: 0 })) { if (p.place !== 'em casa') out++; if (p.moving) moving++; }
  res.json({
    born: true, now: new Date(t).toISOString(), city: w.city.name || 'Nexus City', population: res0.length, online: out, moving,
    me: { name: req.user.name, avatar: req.user.avatar || null, level: u.level || 1, xp: u.xp || 0, nextXp: 40 * (u.level || 1) ** 2, balance: b.balance, wallet: b.wallet || 0, reputation: u.reputation, fame: u.fame || 0, underworld: u.underworld || 0, job: u.job?.role || null },
    devices: devicesOf(w),
  });
});

router.get('/mundo/dispositivos', (req, res) => {
  const w = world(req.user.id);
  if (!w.core?.genesisAt) return res.json({ born: false });
  res.json({ born: true, phone: phoneOf(w), wallet: walletOf(w), clock: clockOf(w), models: Object.entries(PHONES).map(([key, p]) => ({ key, name: p.name, tier: p.tier, tierLabel: TIERS[p.tier].label, color: TIERS[p.tier].color, base: p.base, camera: p.camera, storage: p.storage, apps: p.apps.length, desc: p.desc })), appCount: Object.keys(APPS).length });
});

export default router;
