// Conta do usuário no banco do mundo (moeda Nexus, NXC). Módulo pequeno e sem dependências
// para poder ser usado por agentes, economia e rotas sem ciclos de importação.
import { uid, nowIso, round2, cap } from './util.js';

export const START_BALANCE = 5000;
export function account(w) {
  w.user ??= {};
  const u = w.user;
  if (!u.bank) {
    u.bank = { balance: 0, history: [], loans: [] };
    credit(w, START_BALANCE, 'Saldo inicial de boas-vindas à Codeniac Society');
  }
  u.portfolio ??= {};
  u.properties ??= [];
  u.inventory ??= [];
  u.diplomas ??= [];
  u.reputation ??= 50;
  u.fame ??= 0;
  u.xp ??= 0;
  return u;
}
export function credit(w, amount, desc, at = new Date()) {
  const b = w.user.bank;
  b.balance = round2(b.balance + amount);
  b.history.push({ id: uid(), at: at.toISOString ? at.toISOString() : nowIso(), desc: String(desc).slice(0, 160), amount: round2(amount), balance: b.balance });
  cap(b.history, 400);
  return b.balance;
}
export function debit(w, amount, desc, at = new Date()) {
  const u = account(w);
  if (!(amount > 0)) throw new Error('Valor inválido');
  if (u.bank.balance < amount) throw new Error(`Saldo insuficiente (você tem ${u.bank.balance.toLocaleString('pt-BR')} NXC)`);
  return credit(w, -amount, desc, at);
}
export function addXp(w, n) {
  const u = account(w);
  u.xp += n;
  u.level = 1 + Math.floor(Math.sqrt(u.xp / 40));
}
