// Cidade 2D dirigível — dados do jogador para o minigame e a fiscalização de trânsito.
// O mundo 2D roda no navegador; aqui ficam só o que precisa ser real: carros da garagem, onde ficaram
// estacionados e as multas (cobradas de verdade no banco, com limite por tipo e por dia).
import { record, services } from './core.js';
import { account, addDebt, BankError } from './bank.js';
import { garage } from './vehicles.js';
import { residents } from './agents.js';
import { peopleView } from './living.js';
import { round2, nowIso } from './util.js';

export const FINES = {
  sinal: { label: 'Avanço de sinal vermelho', amount: 293 },
  velocidade: { label: 'Excesso de velocidade', amount: 130 },
  'velocidade-grave': { label: 'Excesso de velocidade (grave)', amount: 195 },
  'velocidade-gravissima': { label: 'Excesso de velocidade (gravíssima)', amount: 880 },
  estacionamento: { label: 'Estacionamento irregular na via (veículo removido ao pátio)', amount: 195 },
};
const COOLDOWN = 45 * 1000; const PER_DAY = 6;

export function driveState(w) {
  const u = account(w);
  u.devices ??= {}; u.devices.parked ??= {};
  const cars = garage(w).map((c) => ({ ...c, sprite: c.key, parked: u.devices.parked[c.id] || null }));
  for (const id of Object.keys(u.devices.parked)) if (!cars.some((c) => c.id === id)) delete u.devices.parked[id];
  // pedestres: moradores reais, primeiro quem está na rua agora
  const out = new Set(peopleView(w, { limit: 9999, horizon: 0 }).filter((p) => p.place !== 'em casa' && p.doing !== 'dormindo').map((p) => p.id));
  const people = residents(w).filter((p) => p.agent?.status === 'ativo').sort((a, b) => out.has(b.id) - out.has(a.id))
    .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color, out: out.has(p.id) }));
  const today = nowIso().slice(0, 10);
  const fines = (u.trafficFines || []).filter((f) => f.at.slice(0, 10) === today).length;
  return { cars, main: u.devices.vehicle || null, people, fines, limits: { perDay: PER_DAY }, catalog: FINES };
}

export function park(w, { itemId, x, y, a }) {
  const u = account(w);
  if (!garage(w).some((c) => c.id === itemId)) throw new BankError('Esse veículo não é seu');
  const n = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));
  u.devices ??= {}; u.devices.parked ??= {};
  u.devices.parked[itemId] = { x: round2(n(x, 0, 1536)), y: round2(n(y, 0, 1024)), a: round2(n(a, -10, 10)), at: nowIso() };
  return u.devices.parked[itemId];
}

export function infraction(ctx, { tipo, kmh, limite, veiculo }) {
  const w = ctx.w; const u = account(w);
  const f = FINES[tipo]; if (!f) throw new BankError('Infração desconhecida');
  u.trafficFines ??= [];
  const now = Date.now(); const today = nowIso().slice(0, 10);
  if (u.trafficFines.some((x) => x.tipo === tipo && now - new Date(x.at).getTime() < COOLDOWN)) return { ok: false, reason: 'cooldown' };
  if (u.trafficFines.filter((x) => x.at.slice(0, 10) === today).length >= PER_DAY) return { ok: false, reason: 'limite' };
  const detail = tipo.startsWith('velocidade') ? ` — ${Math.round(Number(kmh) || 0)} km/h numa via de ${Math.round(Number(limite) || 0)} km/h` : '';
  const d = addDebt(w, { kind: 'multa', amount: f.amount, desc: `Multa de trânsito: ${f.label}${detail}`, dueDays: 5, creditor: 'Departamento de Trânsito de Nexus City', at: ctx.at });
  u.trafficFines.push({ tipo, at: nowIso(), amount: f.amount, debtId: d.id }); u.trafficFines = u.trafficFines.slice(-60);
  u.reputation = Math.max(0, (u.reputation || 50) - (tipo === 'velocidade' ? 1 : 2));
  record(ctx, { type: 'multa-transito', cat: 'seguranca', title: `${f.label}: multa de ${f.amount} NXC`, text: `${veiculo ? `Veículo: ${String(veiculo).slice(0, 40)}.` : ''}${detail}`, actors: ['me'], importance: 1 });
  services.live?.(w, { kind: 'ocorrencia', personaId: 'me', name: 'Você', text: `Você levou uma multa de trânsito (${f.label.toLowerCase()})` });
  return { ok: true, fine: { label: f.label, amount: f.amount, debtId: d.id } };
}
