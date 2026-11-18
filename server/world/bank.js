// BANKING ENGINE — conta do usuário no Banco Nexus (moeda NXC).
// Regras: o dinheiro não aparece do nada (conta nova começa em zero); a senha bancária de 4 dígitos é guardada
// só como hash (scrypt + sal) e nunca vai para logs; operações sensíveis exigem a senha; cada operação pode levar
// um identificador (opId) e nunca é processada duas vezes; juros e multas de atraso são aplicados uma única vez
// por dia por parcela; o dinheiro emprestado sai do caixa do Banco Nexus e os juros voltam para ele.
import crypto from 'node:crypto';
import { uid, nowIso, round2, cap, clamp, DAY, MIN } from './util.js';

export const START_BALANCE = 0;
export const PERIOD_DAYS = 5;          // parcelas a cada 5 dias
export const PIN_MAX_FAILS = 5;
export const PIN_LOCK_MIN = 15;
export const DEFAULT_BANDS = [
  { min: 0, label: 'Sem histórico', mult: 0, rate: 0.09 },
  { min: 200, label: 'Crédito inicial', mult: 3, rate: 0.07 },
  { min: 400, label: 'Intermediário', mult: 6, rate: 0.05 },
  { min: 600, label: 'Bom histórico', mult: 10, rate: 0.035 },
  { min: 800, label: 'Premium', mult: 15, rate: 0.025 },
];
const INCOME_TYPES = new Set(['salario', 'dividendo', 'aluguel', 'freela', 'venda', 'premio', 'rendimento']);

export class BankError extends Error { constructor(msg, code = 'BANK') { super(msg); this.code = code; } }

// ---------------------------------------------------------------- conta
export function account(w) {
  w.user ??= {};
  const u = w.user;
  if (!u.bank) u.bank = { balance: START_BALANCE, history: [] };
  const b = u.bank;
  b.blocked ??= 0; b.blockedItems ??= []; b.history ??= []; b.score ??= 0; b.scoreLog ??= []; b.contracts ??= []; b.proposals ??= [];
  b.debts ??= []; b.savings ??= []; b.ops ??= []; b.wallet ??= 0; b.pin ??= null; b.card ??= null;
  // empréstimos do formato antigo (2.1) viram contratos de uma parcela
  if (Array.isArray(b.loans)) {
    for (const l of b.loans.filter((x) => x.status === 'aberto')) {
      b.contracts.push({ id: l.id, principal: l.principal, rate: 0.05, periods: 1, installment: l.owed, total: l.owed, createdAt: l.takenAt, status: 'ativo', autopay: true, migrated: true,
        schedule: [{ n: 1, due: l.dueAt, amount: round2(l.owed), paid: 0, status: 'aberta', lateFee: false, lastInterestDay: null }], text: 'Contrato convertido da versão anterior.' });
    }
    delete b.loans;
  }
  u.portfolio ??= {}; u.properties ??= []; u.inventory ??= []; u.diplomas ??= [];
  u.reputation ??= 50; u.fame ??= 0; u.xp ??= 0;
  return u;
}
export const bankOf = (w) => account(w).bank;
export const bandsOf = (w) => w.bankCfg?.bands || DEFAULT_BANDS;

function entry(b, amount, desc, at, type) {
  b.history.push({ id: uid(), at: at?.toISOString ? at.toISOString() : nowIso(), desc: String(desc).slice(0, 160), amount: round2(amount), balance: b.balance, type });
  cap(b.history, 600);
}
export function credit(w, amount, desc, at = new Date(), type = 'outro') {
  const b = bankOf(w);
  if (!(amount > 0)) return b.balance;
  b.balance = round2(b.balance + amount);
  entry(b, amount, desc, at, type);
  return b.balance;
}
export function debit(w, amount, desc, at = new Date(), type = 'outro') {
  const b = bankOf(w);
  amount = round2(amount);
  if (!(amount > 0)) throw new BankError('Valor inválido');
  if (b.balance < amount) throw new BankError(`Saldo insuficiente (disponível: ${b.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} NXC)`, 'FUNDS');
  b.balance = round2(b.balance - amount);
  entry(b, -amount, desc, at, type);
  return b.balance;
}
export function addXp(w, n) {
  const u = account(w);
  u.xp += n;
  u.level = 1 + Math.floor(Math.sqrt(u.xp / 40));
}

// operação idempotente: a mesma opId devolve o mesmo resultado e não repete o efeito
export function once(w, opId, fn) {
  const b = bankOf(w);
  if (opId) {
    const prev = b.ops.find((o) => o.id === opId);
    if (prev) return prev.result;
  }
  const result = fn();
  if (opId) { b.ops.push({ id: String(opId).slice(0, 80), at: nowIso(), result }); cap(b.ops, 300); }
  return result;
}

// ---------------------------------------------------------------- senha de 4 dígitos
const hashPin = (pin, salt) => crypto.scryptSync(String(pin), salt, 32).toString('hex');
export const hasPin = (w) => Boolean(bankOf(w).pin?.hash);
export function setPin(w, pin, oldPin = null) {
  const b = bankOf(w);
  if (!/^\d{4}$/.test(String(pin || ''))) throw new BankError('A senha precisa ter exatamente 4 números');
  if (b.pin?.hash) verifyPin(w, oldPin);
  if (/^(\d)\1{3}$/.test(pin) || ['1234', '4321', '0123'].includes(pin)) throw new BankError('Senha muito fácil. Evite sequências e números repetidos.');
  const salt = crypto.randomBytes(16).toString('hex');
  b.pin = { hash: hashPin(pin, salt), salt, fails: 0, lockedUntil: null, setAt: nowIso() };
  return true;
}
export function verifyPin(w, pin) {
  const b = bankOf(w);
  if (!b.pin?.hash) throw new BankError('Crie sua senha bancária de 4 dígitos primeiro', 'PIN_SETUP');
  if (b.pin.lockedUntil && b.pin.lockedUntil > nowIso()) {
    const m = Math.ceil((new Date(b.pin.lockedUntil) - Date.now()) / MIN);
    throw new BankError(`Senha bloqueada por excesso de tentativas. Tente de novo em ${m} min.`, 'PIN_LOCKED');
  }
  const ok = /^\d{4}$/.test(String(pin || '')) && crypto.timingSafeEqual(Buffer.from(hashPin(pin, b.pin.salt), 'hex'), Buffer.from(b.pin.hash, 'hex'));
  if (!ok) {
    b.pin.fails = (b.pin.fails || 0) + 1;
    if (b.pin.fails >= PIN_MAX_FAILS) { b.pin.fails = 0; b.pin.lockedUntil = new Date(Date.now() + PIN_LOCK_MIN * MIN).toISOString(); throw new BankError(`Senha incorreta. Por segurança, ela ficou bloqueada por ${PIN_LOCK_MIN} minutos.`, 'PIN_LOCKED'); }
    throw new BankError(`Senha incorreta (${PIN_MAX_FAILS - b.pin.fails} tentativa(s) restante(s))`, 'PIN_WRONG');
  }
  b.pin.fails = 0; b.pin.lockedUntil = null;
  return true;
}

// ---------------------------------------------------------------- score e crédito
export function scoreChange(w, delta, reason, at = new Date()) {
  const b = bankOf(w);
  const before = b.score;
  b.score = clamp(Math.round(b.score + delta), 0, 1000);
  if (b.score !== before) { b.scoreLog.push({ at: at.toISOString ? at.toISOString() : nowIso(), delta: b.score - before, reason, score: b.score }); cap(b.scoreLog, 120); }
  return b.score;
}
export function band(w) { const s = bankOf(w).score; return bandsOf(w).slice().reverse().find((x) => s >= x.min) || bandsOf(w)[0]; }
export function dailyIncome(w, days = 14) {
  const since = new Date(Date.now() - days * DAY).toISOString();
  return round2(bankOf(w).history.filter((h) => h.at >= since && h.amount > 0 && INCOME_TYPES.has(h.type)).reduce((s, h) => s + h.amount, 0) / days);
}
export function outstanding(w) {
  const b = bankOf(w);
  const loans = b.contracts.filter((c) => ['ativo', 'inadimplente'].includes(c.status)).reduce((s, c) => s + c.schedule.filter((i) => i.status !== 'paga').reduce((t, i) => t + (i.amount - i.paid), 0), 0);
  const debts = b.debts.filter((d) => d.status !== 'paga').reduce((s, d) => s + (d.amount - (d.paid || 0)), 0);
  const card = b.card ? b.card.used : 0;
  return round2(loans + debts + card);
}
export const isLate = (w) => { const b = bankOf(w); return b.contracts.some((c) => c.status === 'inadimplente' || c.schedule.some((i) => i.status === 'atrasada')) || b.debts.some((d) => d.status === 'atrasada') || (b.card?.bills || []).some((x) => x.status === 'atrasada'); };
export function creditLimit(w) {
  if (isLate(w)) return 0;
  const bd = band(w); const inc = dailyIncome(w);
  if (bd.mult === 0) return inc > 0 ? Math.min(200, Math.round(inc * 2)) : 0;
  return Math.max(0, Math.round(inc * 7 * bd.mult - outstanding(w)));
}
export function rateFor(w, eco) { return round2(band(w).rate * ((eco?.baseRate || 0.0015) / 0.0015) * 1000) / 1000; }

// ---------------------------------------------------------------- empréstimo pessoal (proposta → contrato)
export function propose(w, eco, amount, periods) {
  const b = bankOf(w);
  amount = Math.round(Number(amount)); periods = clamp(Math.round(Number(periods) || 3), 1, 12);
  if (!(amount >= 50)) throw new BankError('O valor mínimo é 50 NXC');
  const reasons = [];
  if (isLate(w)) reasons.push('Você tem parcelas, faturas ou multas em atraso. Regularize antes.');
  const limit = creditLimit(w);
  if (!reasons.length && limit < 50) reasons.push(bankOf(w).score < 200 && dailyIncome(w) === 0 ? 'Sem renda comprovada nem histórico de crédito. Consiga uma renda (emprego, trabalhos avulsos) e volte.' : 'Seu limite disponível é muito baixo para um empréstimo agora.');
  const approved = Math.min(amount, Math.floor(limit / 10) * 10);
  const p = { id: uid(), requested: amount, approved: reasons.length ? 0 : approved, periods, at: nowIso(), expiresAt: new Date(Date.now() + 15 * MIN).toISOString(), denied: Boolean(reasons.length), reasons };
  if (!p.denied) {
    const r = rateFor(w, eco);
    const inst = round2((approved * r) / (1 - (1 + r) ** -periods));
    Object.assign(p, { rate: r, installment: inst, total: round2(inst * periods), firstDue: new Date(Date.now() + PERIOD_DAYS * DAY).toISOString(),
      text: `CONTRATO DE EMPRÉSTIMO PESSOAL — BANCO NEXUS\nValor liberado: ${approved.toLocaleString('pt-BR')} NXC. Juros de ${(r * 100).toFixed(1)}% a cada ${PERIOD_DAYS} dias (tabela Price), em ${periods} parcela(s) de ${inst.toLocaleString('pt-BR')} NXC.\nTotal a pagar: ${round2(inst * periods).toLocaleString('pt-BR')} NXC.\nAtraso: multa de 2% sobre a parcela e juros de mora de 1% ao dia; score cai a cada dia de atraso; com 10 dias, o contrato fica inadimplente, o crédito é suspenso e a cobrança é iniciada.\nDébito automático na data de vencimento quando houver saldo.` });
  }
  b.proposals = b.proposals.filter((x) => x.expiresAt > nowIso());
  b.proposals.push(p); cap(b.proposals, 10);
  return p;
}
export function contract(w, proposalId, at = new Date()) {
  const b = bankOf(w);
  const p = b.proposals.find((x) => x.id === proposalId);
  if (!p || p.denied) throw new BankError('Proposta não encontrada');
  if (p.expiresAt < nowIso()) throw new BankError('A proposta expirou. Simule de novo.');
  if (isLate(w)) throw new BankError('Você tem pendências em atraso');
  b.proposals = b.proposals.filter((x) => x.id !== p.id);
  const c = { id: uid(), principal: p.approved, rate: p.rate, periods: p.periods, installment: p.installment, total: p.total, createdAt: at.toISOString(), status: 'ativo', autopay: true, text: p.text,
    schedule: Array.from({ length: p.periods }, (_, i) => ({ n: i + 1, due: new Date(at.getTime() + (i + 1) * PERIOD_DAYS * DAY).toISOString(), amount: p.installment, paid: 0, status: 'aberta', lateFee: false, lastInterestDay: null })) };
  b.contracts.push(c);
  credit(w, c.principal, `Empréstimo pessoal liberado (${c.periods}x de ${c.installment.toLocaleString('pt-BR')} NXC)`, at, 'emprestimo');
  return c;
}
// paga parcelas (a mais antiga primeiro); "all" quita o contrato com desconto dos juros futuros
export function payContract(w, contractId, { all = false, at = new Date() } = {}) {
  const b = bankOf(w);
  const c = b.contracts.find((x) => x.id === contractId);
  if (!c || !['ativo', 'inadimplente'].includes(c.status)) throw new BankError('Contrato não encontrado ou já quitado');
  const open = c.schedule.filter((i) => i.status !== 'paga');
  let paidNow = 0; let onTime = 0; let late = 0;
  const targets = all ? open : open.slice(0, 1);
  // quitação antecipada: parcelas futuras pagam só o principal (sem juros futuros)
  const nowS = at.toISOString();
  const cost = targets.reduce((s, i) => s + (all && i.due > nowS && i.status === 'aberta' ? i.amount / (1 + c.rate) ** (Math.max(1, Math.round((new Date(i.due) - at) / (PERIOD_DAYS * DAY)))) : i.amount - i.paid), 0);
  debit(w, round2(cost), all ? 'Quitação antecipada de empréstimo' : `Parcela de empréstimo ${targets[0].n}/${c.periods}`, at, 'emprestimo');
  for (const i of targets) { if (i.status === 'atrasada') late++; else onTime++; i.paid = i.amount; i.status = 'paga'; i.paidAt = nowS; }
  paidNow = round2(cost);
  if (onTime) scoreChange(w, 8 * onTime, 'Parcela paga em dia', at);
  if (late) scoreChange(w, 5 * late, 'Parcela atrasada regularizada', at);
  if (c.schedule.every((i) => i.status === 'paga')) { c.status = 'quitado'; c.paidAt = nowS; scoreChange(w, c.status === 'quitado' && !c.everLate ? 40 : 20, 'Empréstimo quitado', at); }
  return { paid: paidNow, contract: c };
}
// renegociação: junta o que está devido num contrato novo, mais longo e um pouco mais caro
export function renegotiate(w, eco, contractId, periods, at = new Date()) {
  const b = bankOf(w);
  const c = b.contracts.find((x) => x.id === contractId);
  if (!c || !['ativo', 'inadimplente'].includes(c.status)) throw new BankError('Contrato não encontrado');
  if (!c.schedule.some((i) => i.status === 'atrasada') && c.status !== 'inadimplente') throw new BankError('Só contratos em atraso podem ser renegociados');
  periods = clamp(Math.round(Number(periods) || 6), 2, 12);
  const owed = c.schedule.filter((i) => i.status !== 'paga').reduce((s, i) => s + i.amount - i.paid, 0);
  const r = round2((c.rate + 0.01) * 1000) / 1000;
  const inst = round2((owed * 1.05 * r) / (1 - (1 + r) ** -periods));
  c.status = 'renegociado'; c.renegotiatedAt = at.toISOString();
  const n = { id: uid(), principal: round2(owed * 1.05), rate: r, periods, installment: inst, total: round2(inst * periods), createdAt: at.toISOString(), status: 'ativo', autopay: true, renegotiation: c.id,
    text: `RENEGOCIAÇÃO DE DÍVIDA — saldo devedor de ${round2(owed).toLocaleString('pt-BR')} NXC + 5% de encargos, em ${periods}x de ${inst.toLocaleString('pt-BR')} NXC. Novo atraso cancela o acordo e reduz o score de forma severa.`,
    schedule: Array.from({ length: periods }, (_, i) => ({ n: i + 1, due: new Date(at.getTime() + (i + 1) * PERIOD_DAYS * DAY).toISOString(), amount: inst, paid: 0, status: 'aberta', lateFee: false, lastInterestDay: null })) };
  b.contracts.push(n);
  scoreChange(w, 15, 'Dívida renegociada', at);
  return n;
}

// ---------------------------------------------------------------- dívidas avulsas (multas, indenizações, decisões judiciais)
export function addDebt(w, { kind, amount, desc, dueDays = 5, ref = null, creditor = 'Prefeitura de Nexus City', at = new Date() }) {
  const b = bankOf(w);
  if (ref && b.debts.some((d) => d.ref === ref && d.kind === kind)) return b.debts.find((d) => d.ref === ref && d.kind === kind); // nunca cobrar duas vezes
  const d = { id: uid(), kind, amount: round2(amount), paid: 0, desc: String(desc).slice(0, 200), creditor, ref, createdAt: at.toISOString(), due: new Date(at.getTime() + dueDays * DAY).toISOString(), status: 'aberta', lastInterestDay: null };
  b.debts.push(d); cap(b.debts, 100);
  return d;
}
export function payDebt(w, debtId, at = new Date()) {
  const b = bankOf(w);
  const d = b.debts.find((x) => x.id === debtId);
  if (!d || d.status === 'paga') throw new BankError('Débito não encontrado ou já pago');
  const v = round2(d.amount - d.paid);
  debit(w, v, `Pagamento: ${d.desc}`, at, d.kind);
  d.paid = d.amount; const wasLate = d.status === 'atrasada'; d.status = 'paga'; d.paidAt = at.toISOString();
  scoreChange(w, wasLate ? 10 : 6, wasLate ? 'Débito em atraso regularizado' : 'Débito pago em dia', at);
  return d;
}

// ---------------------------------------------------------------- cartão virtual
export function requestCard(w, at = new Date()) {
  const b = bankOf(w);
  if (b.card && b.card.status !== 'cancelado') throw new BankError('Você já tem um cartão');
  if (b.score < 200) throw new BankError('O cartão exige score a partir de 200');
  if (isLate(w)) throw new BankError('Regularize suas pendências antes');
  const limit = Math.round(creditLimit(w) * 0.3);
  if (limit < 100) throw new BankError('Seu limite ainda é baixo para um cartão. Aumente sua renda e seu score.');
  b.card = { id: uid(), last4: String(1000 + Math.floor(Math.random() * 9000)), limit, used: 0, open: [], cycleStart: at.toISOString(), bills: [], status: 'ativo', createdAt: at.toISOString() };
  return b.card;
}
export function cardCharge(w, amount, desc, at = new Date()) {
  const b = bankOf(w); const c = b.card;
  if (!c || c.status !== 'ativo') throw new BankError('Cartão indisponível');
  if (c.used + amount > c.limit) throw new BankError(`Limite do cartão insuficiente (disponível: ${round2(c.limit - c.used).toLocaleString('pt-BR')} NXC)`, 'FUNDS');
  c.used = round2(c.used + amount);
  c.open.push({ id: uid(), at: at.toISOString(), desc: String(desc).slice(0, 120), amount: round2(amount) }); cap(c.open, 200);
  return c;
}
export function payCardBill(w, billId, at = new Date()) {
  const c = bankOf(w).card;
  const bill = c?.bills.find((x) => x.id === billId);
  if (!bill || bill.status === 'paga') throw new BankError('Fatura não encontrada ou já paga');
  debit(w, round2(bill.amount - (bill.paid || 0)), `Fatura do cartão final ${c.last4}`, at, 'cartao');
  const late = bill.status === 'atrasada';
  bill.paid = bill.amount; bill.status = 'paga'; bill.paidAt = at.toISOString();
  c.used = round2(Math.max(0, c.used - bill.base));
  if (c.status === 'bloqueado' && !c.bills.some((x) => x.status === 'atrasada')) c.status = 'ativo';
  scoreChange(w, late ? 8 : 12, late ? 'Fatura atrasada paga' : 'Fatura paga em dia', at);
  return bill;
}

// ---------------------------------------------------------------- cofrinhos, carteira e bloqueios
export function savingsOp(w, { id = null, name = null, goal = 0, amount = 0, op }, at = new Date()) {
  const b = bankOf(w);
  if (op === 'criar') {
    if (b.savings.length >= 8) throw new BankError('Máximo de 8 cofrinhos');
    const s = { id: uid(), name: String(name || 'Meu cofrinho').slice(0, 40), goal: Math.max(0, Math.round(goal)), balance: 0, createdAt: at.toISOString() };
    b.savings.push(s); return s;
  }
  const s = b.savings.find((x) => x.id === id);
  if (!s) throw new BankError('Cofrinho não encontrado');
  amount = round2(amount);
  if (!(amount > 0)) throw new BankError('Valor inválido');
  if (op === 'guardar') { debit(w, amount, `Guardado no cofrinho "${s.name}"`, at, 'cofrinho'); s.balance = round2(s.balance + amount); }
  else if (op === 'resgatar') { if (s.balance < amount) throw new BankError('O cofrinho não tem esse valor'); s.balance = round2(s.balance - amount); credit(w, amount, `Resgate do cofrinho "${s.name}"`, at, 'cofrinho'); }
  else throw new BankError('Operação inválida');
  return s;
}
export function walletOp(w, op, amount, at = new Date()) {
  const b = bankOf(w); amount = round2(amount);
  if (!(amount > 0)) throw new BankError('Valor inválido');
  if (op === 'sacar') { debit(w, amount, 'Saque no caixa eletrônico', at, 'saque'); b.wallet = round2(b.wallet + amount); }
  else if (op === 'depositar') { if (b.wallet < amount) throw new BankError('Você não tem esse dinheiro em mãos'); b.wallet = round2(b.wallet - amount); credit(w, amount, 'Depósito em dinheiro', at, 'deposito'); }
  else throw new BankError('Operação inválida');
  return b.wallet;
}
export function block(w, amount, reason, ref) {
  const b = bankOf(w);
  b.blocked = round2(b.blocked + amount);
  b.blockedItems.push({ id: uid(), amount: round2(amount), reason, ref, at: nowIso() });
}
export function unblock(w, ref, { release = true, at = new Date(), desc = 'Valor liberado' } = {}) {
  const b = bankOf(w);
  const items = b.blockedItems.filter((x) => x.ref === ref);
  const total = round2(items.reduce((s, x) => s + x.amount, 0));
  b.blockedItems = b.blockedItems.filter((x) => x.ref !== ref);
  b.blocked = round2(Math.max(0, b.blocked - total));
  if (release && total > 0) credit(w, total, desc, at, 'liberacao');
  return total;
}

// ---------------------------------------------------------------- rotina diária (chamada pelo módulo financeiro)
export function dailyBank(w, at, eco, hooks = {}) {
  const b = bankOf(w);
  const day = at.toISOString().slice(0, 10);
  const nowS = at.toISOString();
  const events = [];
  for (const c of b.contracts.filter((x) => ['ativo', 'inadimplente'].includes(x.status))) {
    for (const i of c.schedule.filter((x) => x.status !== 'paga' && x.due <= nowS)) {
      const due = round2(i.amount - i.paid);
      if (i.status === 'aberta') {
        if (c.autopay && b.balance >= due) {
          debit(w, due, `Débito automático: parcela ${i.n}/${c.periods}`, at, 'emprestimo');
          i.paid = i.amount; i.status = 'paga'; i.paidAt = nowS; scoreChange(w, 8, 'Parcela paga em dia', at);
          hooks.bankRevenue?.(round2(due - c.principal / c.periods));
          continue;
        }
        i.status = 'atrasada'; c.everLate = true;
        if (!i.lateFee) { i.lateFee = true; i.amount = round2(i.amount * 1.02); }
        scoreChange(w, c.renegotiation ? -80 : -25, c.renegotiation ? 'Atraso em dívida renegociada' : 'Parcela em atraso', at);
        events.push({ type: 'parcela-atrasada', contract: c, inst: i });
      } else if (i.status === 'atrasada' && i.lastInterestDay !== day) {
        i.lastInterestDay = day;
        i.amount = round2(i.amount + (i.amount - i.paid) * 0.01);
        scoreChange(w, -3, 'Dia de atraso', at);
        const daysLate = Math.floor((at - new Date(i.due)) / DAY);
        if (daysLate >= 10 && c.status !== 'inadimplente') { c.status = 'inadimplente'; scoreChange(w, -100, 'Contrato inadimplente', at); events.push({ type: 'inadimplencia', contract: c }); }
        else if (daysLate > 0 && daysLate % 3 === 0) events.push({ type: 'cobranca', contract: c, daysLate });
      }
    }
    if (c.schedule.every((i) => i.status === 'paga')) { c.status = 'quitado'; c.paidAt = nowS; scoreChange(w, 30, 'Empréstimo quitado', at); }
  }
  for (const d of b.debts.filter((x) => x.status !== 'paga' && x.due <= nowS)) {
    if (d.status === 'aberta') { d.status = 'atrasada'; scoreChange(w, d.kind === 'judicial' ? -50 : -20, `Débito em atraso: ${d.kind}`, at); events.push({ type: 'debito-atrasado', debt: d }); }
    else if (d.lastInterestDay !== day) {
      d.lastInterestDay = day; d.amount = round2(d.amount + (d.amount - d.paid) * 0.01); scoreChange(w, -2, 'Dia de atraso em débito', at);
      // penhora: decisões judiciais vencidas há 3 dias são cobradas direto do saldo
      if (d.kind === 'judicial' && (at - new Date(d.due)) / DAY >= 3 && b.balance > 0) {
        const take = round2(Math.min(b.balance, d.amount - d.paid));
        debit(w, take, `Penhora judicial: ${d.desc}`, at, 'judicial');
        d.paid = round2(d.paid + take); if (d.paid >= d.amount - 0.009) { d.status = 'paga'; d.paidAt = nowS; }
        events.push({ type: 'penhora', debt: d, amount: take });
      }
    }
  }
  const card = b.card;
  if (card && card.status !== 'cancelado') {
    if (card.open.length && (at - new Date(card.cycleStart)) / DAY >= 7) {
      const base = round2(card.open.reduce((s, x) => s + x.amount, 0));
      card.bills.push({ id: uid(), amount: base, base, paid: 0, items: card.open.slice(0, 50), closedAt: nowS, due: new Date(at.getTime() + 3 * DAY).toISOString(), status: 'aberta', lastInterestDay: null });
      cap(card.bills, 30); card.open = []; card.cycleStart = nowS;
      events.push({ type: 'fatura', card });
    }
    for (const bill of card.bills.filter((x) => x.status !== 'paga' && x.due <= nowS)) {
      if (bill.status === 'aberta') { bill.status = 'atrasada'; bill.amount = round2(bill.amount * 1.02); card.status = 'bloqueado'; scoreChange(w, -25, 'Fatura em atraso', at); events.push({ type: 'fatura-atrasada', card }); }
      else if (bill.lastInterestDay !== day) { bill.lastInterestDay = day; bill.amount = round2(bill.amount + (bill.amount - bill.paid) * 0.012); scoreChange(w, -3, 'Dia de atraso na fatura', at); }
    }
  }
  // cofrinhos rendem
  for (const s of b.savings) { const y = round2(s.balance * (eco?.baseRate || 0.0015) * 0.8); if (y >= 0.01) s.balance = round2(s.balance + y); }
  // bom comportamento: 30 dias sem atraso e com renda
  b.lastHealthy ??= nowS;
  if ((at - new Date(b.lastHealthy)) / DAY >= 30) { b.lastHealthy = nowS; if (!isLate(w) && dailyIncome(w, 30) > 0) scoreChange(w, 15, 'Histórico financeiro saudável no mês', at); }
  return events;
}
