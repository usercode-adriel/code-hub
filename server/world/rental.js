// Locadora Nexus Rent — aluguel diário do Rosso GT (esportivo vermelho). O dia de aluguel é o dia da cidade
// (40 min reais). Alugado, o carro aparece no Estacionamento Central do mapa e vale como seu (dirigir, estacionar,
// guincho). Na devolução (ou quando o prazo acaba) a loja vistoria: lataria danificada é cobrada (mais caro quanto
// maior o estrago), batida que precisou de guincho tem taxa de sinistro e perda total custa caro. Sem saldo para
// pagar, a locadora entra na Justiça contra você (processo civil de cobrança).
import { onTick, record, services } from './core.js';
import { account, debit, bankOf, BankError } from './bank.js';
import { VEHICLES } from './vehicles.js';
import { round2, nowIso } from './util.js';

export const RENT = { key: 'rent-rosso', perDay: 85, maxDays: 14, cityDayMs: 40 * 60000, name: 'Locadora Nexus Rent' };
const R = (w) => { const u = account(w); u.rentals ??= { active: null, history: [] }; return u.rentals; };
const itemOf = (w) => { const r = R(w).active; return r ? (account(w).inventory || []).find((x) => x.id === r.itemId) : null; };

// tabela da vistoria
export function damageFee(health, towed) {
  const dmg = Math.max(0, 100 - Math.round(health ?? 100));
  let fee = dmg > 0 ? 180 + dmg * 110 : 0; const items = [];
  if (dmg > 0) items.push(`Lataria com ${dmg}% de dano: ${(180 + dmg * 110).toLocaleString('pt-BR')} NXC`);
  if (towed) { fee += 900; items.push('Taxa de sinistro (guincho): 900 NXC'); }
  if ((health ?? 100) <= 0) { fee += 4000; items.push('Perda total: 4.000 NXC'); }
  return { fee: round2(fee), items };
}

export function rentalView(w) {
  const r = R(w); const it = itemOf(w); const v = VEHICLES[RENT.key];
  if (r.active && !it) r.active = null; // item sumiu (não deveria): encerra
  return {
    shop: RENT.name, car: { key: RENT.key, name: v.name.replace(' (alugado)', ''), seats: v.seats, speed: v.speed, tier: v.tier, art: '/assets/rpg/cars/aluguel-vermelho.png' },
    perDay: RENT.perDay, maxDays: RENT.maxDays, dayMin: RENT.cityDayMs / 60000, balance: bankOf(w).balance,
    active: r.active && it ? { ...r.active, health: it.health ?? 100, inRepair: Boolean(it.repairUntil), leftMs: Math.max(0, new Date(r.active.until).getTime() - Date.now()), preview: damageFee(it.health ?? 100, r.active.towed || Boolean(it.repairUntil)) } : null,
    history: r.history.slice(-6).reverse(),
  };
}

export function rentCar(ctx, { dias }) {
  const w = ctx.w; const r = R(w);
  if (r.active && itemOf(w)) throw new BankError('Você já está com um carro alugado. Devolva antes de alugar de novo.');
  const days = Math.floor(Number(dias) || 0);
  if (days < 1 || days > RENT.maxDays) throw new BankError(`Escolha de 1 a ${RENT.maxDays} dias`);
  const total = RENT.perDay * days;
  debit(w, total, `${RENT.name}: aluguel do Rosso GT por ${days} dia(s)`, ctx.at, 'compra');
  const it = services.makeItem(ctx, { key: RENT.key, price: total, place: { name: RENT.name } });
  const raw = (account(w).inventory || []).find((x) => x.id === it.id); raw.rental = true; raw.state = 'guardado';
  const until = new Date(Date.now() + days * RENT.cityDayMs).toISOString();
  r.active = { itemId: it.id, days, paid: total, start: nowIso(), until, towed: false };
  record(ctx, { type: 'aluguel-carro', cat: 'pessoal', title: `Você alugou o Rosso GT por ${days} dia(s)`, text: `${total.toLocaleString('pt-BR')} NXC na ${RENT.name}. Retire no Estacionamento Central.`, actors: ['me'], importance: 1 });
  return { ok: true, total, until };
}

export function returnCar(ctx, { auto = false } = {}) {
  const w = ctx.w; const r = R(w); const it = itemOf(w); const u = account(w);
  if (!r.active || !it) { r.active = null; throw new BankError('Nenhum carro alugado'); }
  const health = it.health ?? 100; const towed = r.active.towed || Boolean(it.repairUntil) || (it.history || []).some((h) => /Reboque|rebocado/i.test(h.text) && h.at >= r.active.start);
  const { fee, items } = damageFee(health, towed);
  let paid = 'sem custo'; let caseN = null;
  if (fee > 0) {
    try { debit(w, fee, `${RENT.name}: danos no carro alugado`, ctx.at, 'outro'); paid = 'pago na conta'; }
    catch (err) {
      if (err.code !== 'FUNDS') throw err;
      const c = services.openCase?.(ctx, { type: 'dano-locacao', suspect: { type: 'user', id: 'me' }, plaintiff: 'locadora', amount: fee, desc: `A ${RENT.name} cobra ${fee.toLocaleString('pt-BR')} NXC pelos danos no Rosso GT alugado (${items.join('; ')}). O valor não foi pago na devolução.` });
      paid = 'cobrado na Justiça'; caseN = c?.n || null;
    }
  }
  u.inventory = (u.inventory || []).filter((x) => x !== it);
  if (u.devices?.parked) delete u.devices.parked[it.id];
  if (u.devices?.vehicle === it.id) u.devices.vehicle = null;
  r.history.push({ at: nowIso(), days: r.active.days, paid: r.active.paid, fee, items, result: paid, auto }); r.history = r.history.slice(-20);
  r.active = null;
  record(ctx, { type: 'devolucao-carro', cat: fee ? 'justica' : 'pessoal', title: fee ? `Locadora cobra ${fee.toLocaleString('pt-BR')} NXC por danos no carro alugado` : 'Você devolveu o carro alugado sem danos', text: `${auto ? 'Prazo do aluguel terminou: a locadora recolheu o carro. ' : ''}${items.join('; ')}${fee ? ` — ${paid}.` : ''}`, actors: ['me'], importance: fee > 2000 ? 2 : 1 });
  return { ok: true, fee, items, paid, caseN, auto };
}

// prazo acabou: a locadora recolhe o carro sozinha (com a vistoria)
onTick((ctx) => {
  const r = ctx.w && account(ctx.w).rentals; if (!r?.active) return;
  if (new Date(r.active.until).getTime() <= Date.now()) { try { returnCar(ctx, { auto: true }); } catch { /* já resolvido */ } }
});
