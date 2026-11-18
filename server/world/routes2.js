// Rotas da fase 2.2: mapa, deslocamento, banco, dinheiro entre pessoas, comércio, inventário, polícia e justiça.
import express from 'express';
import { world, publicEvent, CATS } from './core.js';
import { saveWorld } from './store.js';
import { people, personById, agentOf, isAwake, isWorking, relType, REL_LABEL, userName, publicAgent } from './agents.js';
import {
  account, bankOf, hasPin, setPin, verifyPin, propose, contract, payContract, renegotiate, requestCard, payCardBill, savingsOp, walletOp, creditLimit, dailyIncome, outstanding, band, bandsOf, once, debit, isLate, BankError, PERIOD_DAYS,
} from './bank.js';
import { eco, companies, companyById } from './economy.js';
import { geoPublic, route, freeNode, pos, districtOfNode, W, H } from './map.js';
import { PLACE_CATS, PRODUCTS, places, placeById, isOpen, storeView, negotiate, sellerChat, buy, rate, travel, TRANSPORT } from './commerce.js';
import { inv, publicItem, itemAction } from './inventory.js';
import { justice, publicCase, testify, settleCase, payFine, report, DEFAULT_PENALTIES, penalty } from './justice.js';
import { hasAuthority, society, professionsFor } from './society.js';
import { loans, askFriendLoan, acceptFriendLoan, repayFriendLoan, createVaquinha, VAQUINHA_MOTIVOS, gigs, doGig } from './finance.js';
import { listConversations } from '../assistant.js';
import { restyleFaces, requestImage } from '../social.js';
import { str, round2, clamp, nowIso, HOUR } from './util.js';

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
// onde cada pessoa está agora (derivado da rotina: casa, trabalho ou lazer)
function personaWhere(w, p, at = new Date()) {
  const a = agentOf(w, p);
  if (!a.resident) return null;
  if (a.status === 'preso') { const d = places(w).find((x) => x.kind === 'delegacia'); return d ? { node: d.node, place: d.name, doing: 'detida(o)' } : null; }
  if (a.status !== 'ativo') return null;
  a.homeNode ??= freeNode(w, a.districtId || 'centro', { used: new Set() });
  if (!isAwake(p, at)) return { node: a.homeNode, place: 'em casa', doing: 'dormindo' };
  if (isWorking(p, at)) { const pl = places(w).find((x) => x.companyId === a.companyId); if (pl) return { node: pl.node, place: pl.name, doing: 'trabalhando' }; }
  const leisure = places(w).filter((x) => ['bar', 'parque', 'restaurante', 'shopping', 'turismo', 'clube'].includes(x.kind) && isOpen(x, at) && !x.hidden);
  const h = at.getHours();
  const idx = [...p.id].reduce((s, ch) => s + ch.charCodeAt(0), h) % (leisure.length + 2);
  if (idx >= leisure.length) return { node: a.homeNode, place: 'em casa', doing: 'em casa' };
  return { node: leisure[idx].node, place: leisure[idx].name, doing: 'passeando' };
}
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
  if (out.smart) {
    out.people = people(w).filter((p) => p.agent?.resident).map((p) => { const where = personaWhere(w, p, at); if (!where) return null; const [x, y] = pos(w, where.node); return { id: p.id, name: p.name, avatar: p.avatar, color: p.color, x, y, place: where.place, doing: where.doing, friend: Boolean(p.friend) }; }).filter(Boolean);
    out.properties = (w.properties || []).filter((p) => p.node != null).map((p) => ({ id: p.id, name: p.name, kind: p.kind, x: p.x, y: p.y, owner: p.ownerType, forSale: p.ownerType === 'cidade', address: p.address }));
  }
  res.json(out);
});
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
    stores: places(w).filter((pl) => pl.catalog && visible(w, pl)).map((pl) => ({ id: pl.id, name: pl.name, kind: pl.kind, kindLabel: PLACE_CATS[pl.kind]?.label, sub: pl.sub, address: pl.address, districtId: pl.districtId, open: isOpen(pl), status: pl.status, hours: pl.hours, rating: round2(pl.reputation || 0), reviews: (pl.ratings || []).length, promo: pl.promo, items: pl.catalog.length, inStock: pl.catalog.filter((x) => x.stock > 0).length, products: pl.catalog.map((x) => PRODUCTS[x.key]?.name).filter(Boolean), hidden: Boolean(pl.hidden) })),
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

// ---------------------------------------------------------------- rostos 3D e imagem da cidade
router.post('/mundo/controle/rostos', (req, res) => { run(res, () => ({ queued: restyleFaces(req.user.id) })); });
router.get('/mundo/heroi', (req, res) => {
  const w = world(req.user.id);
  if (w.city && !w.city.heroImage && !(w.city.heroPending > new Date(Date.now() - 6 * HOUR).toISOString())) {
    w.city.heroPending = nowIso();
    requestImage(req.user.id, 'futuristic cyberpunk megacity at night, aerial view, neon skyscrapers, holographic billboards, flying cars, airship, river reflections, purple and cyan lights, highly detailed open-world video game key art, no text', 1280, 640,
      (url) => { const w2 = world(req.user.id); w2.city.heroImage = url; w2.city.heroPending = null; saveWorld(); });
  }
  res.json({ image: w.city?.heroImage || null });
});

export default router;
