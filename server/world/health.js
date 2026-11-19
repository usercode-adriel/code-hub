// SAÚDE — hospital, clínicas e farmácias de verdade no mapa. Sua saúde cai um pouco por dia; um check-up
// (pago à instituição, dinheiro real da economia) recupera. Moradores também se consultam e isso aparece no LIVE.
import { onDaily, record, services } from './core.js';
import { residents, personById, userName } from './agents.js';
import { account, debit, verifyPin, addXp, BankError } from './bank.js';
import { places, isOpen } from './commerce.js';
import { companyById } from './economy.js';
import { roleOf } from '../pixelfaces.js';
import { pick, chance, clamp, round2, nowIso, str, cap } from './util.js';

const KINDS = ['hospital', 'clinica', 'farmacia'];
export const CHECKUP_PRICE = 180;
export const healthOf = (w) => { const u = account(w); u.health ??= 100; return u.health; };

export function doctors(w) {
  return residents(w).filter((p) => p.agent?.status === 'ativo' && roleOf(p.job || p.agent?.role || '') === 'saude');
}
function onDuty(w) {
  const ds = doctors(w);
  const h = new Date().getHours();
  return ds.find((p) => (p.agent?.companyId && h >= 8 && h < 20)) || ds[0] || null;
}
export function hospitalView(w) {
  const u = account(w);
  const list = places(w).filter((p) => KINDS.includes(p.kind));
  const main = list.find((p) => p.kind === 'hospital') || list[0] || null;
  const doc = onDuty(w);
  return {
    hospital: main ? { id: main.id, name: main.name, address: main.address, open: isOpen(main) } : null,
    units: list.map((p) => ({ id: p.id, name: p.name, kind: p.kind, address: p.address, open: isOpen(p), hours: p.hours, medkit: (p.catalog || []).some((x) => x.key === 'medkit') })),
    doctors: doctors(w).slice(0, 12).map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color, job: p.job, gender: p.gender })),
    duty: doc ? { id: doc.id, name: doc.name, avatar: doc.avatar, job: doc.job, gender: doc.gender } : null,
    health: healthOf(w), lastCheckup: u.lastCheckup || null, price: CHECKUP_PRICE,
  };
}

// check-up pago (PIN): recupera a saúde, rende XP e o dinheiro vai para a instituição
export function checkup(ctx, pin) {
  const w = ctx.w; const u = account(w);
  verifyPin(w, pin);
  if (u.lastCheckup && Date.now() - new Date(u.lastCheckup).getTime() < 20 * 3600 * 1000) throw new BankError('Você já fez um check-up hoje. Volte amanhã.');
  const pl = places(w).find((p) => p.kind === 'hospital') || places(w).find((p) => p.kind === 'clinica');
  debit(w, CHECKUP_PRICE, `Check-up — ${pl?.name || 'Hospital'}`, ctx.at, 'saude');
  const c = pl?.companyId && companyById(w, pl.companyId); if (c) { c.cash = round2((c.cash || 0) + CHECKUP_PRICE); c.salesToday = (c.salesToday || 0) + CHECKUP_PRICE; }
  const before = healthOf(w);
  u.health = 100; u.lastCheckup = ctx.at.toISOString(); addXp(w, 8);
  services.live?.(w, { kind: 'atendimento', personaId: 'me', name: 'Você', text: 'Você fez um check-up completo', placeId: pl?.id || null, placeName: pl?.name || null });
  record(ctx, { type: 'checkup', cat: 'pessoal', title: `${userName(ctx)} fez um check-up`, actors: ['me'], importance: 1 });
  return { health: 100, before, price: CHECKUP_PRICE };
}

// rotina: sua saúde cai devagar; moradores vão a clínicas e farmácias (e pagam por isso)
onDaily((ctx) => {
  const w = ctx.w; const u = account(w);
  u.health = clamp(healthOf(w) - 3, 20, 100);
  const units = places(w).filter((p) => KINDS.includes(p.kind));
  if (!units.length) return;
  for (const p of residents(w)) {
    if (p.agent?.status !== 'ativo' || !chance(0.03)) continue;
    const pl = pick(units); const fee = pl.kind === 'farmacia' ? 40 : 120;
    if ((p.agent.cash || 0) < fee + 50) continue;
    p.agent.cash = round2(p.agent.cash - fee);
    const c = pl.companyId && companyById(w, pl.companyId); if (c) { c.cash = round2((c.cash || 0) + fee); c.salesToday = (c.salesToday || 0) + fee; }
    services.live?.(w, { kind: 'atendimento', personaId: p.id, name: p.name, text: `${p.name} ${pl.kind === 'farmacia' ? 'comprou remédios em' : 'foi atendido(a) em'}`, placeId: pl.id, placeName: pl.name });
  }
});

// conversa com o(a) médico(a) de plantão (orientação geral, sem diagnóstico real)
export async function doctorChat(ctx, message, ai) {
  const w = ctx.w; const doc = onDuty(w); const msg = str(message, 400);
  if (!msg) throw new BankError('Escreva uma mensagem');
  w.healthChat ??= []; w.healthChat.push({ who: 'me', text: msg, at: nowIso() });
  let text = null;
  if (doc && ai) text = await ai(`Você é ${doc.name}, ${doc.job || 'médico(a)'} de plantão no hospital de Nexus City (cidade simulada de um jogo). A saúde do jogador no jogo está em ${healthOf(w)}%. Dê orientação geral e acolhedora em 1 a 3 frases, sem diagnóstico; sugira o check-up (custa ${CHECKUP_PRICE} NXC) quando fizer sentido. Mensagem: "${msg}".`).catch(() => null);
  if (!text) text = healthOf(w) < 70 ? `Sua saúde está em ${healthOf(w)}%. Recomendo um check-up hoje: custa ${CHECKUP_PRICE} NXC e deixa você em 100%.` : 'Você está bem! Durma direito, coma bem e volte para um check-up quando quiser.';
  w.healthChat.push({ who: 'medico', text, at: nowIso() }); cap(w.healthChat, 40);
  return { text, doctor: doc ? { id: doc.id, name: doc.name, avatar: doc.avatar } : null };
}
export { personById };
