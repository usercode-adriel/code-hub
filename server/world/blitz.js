// BLITZ e CNH — abordagem policial do jogador no mapa (Aurora e Rodovia Aurora). O jogador segue as mesmas regras
// dos moradores: a resposta ao policial decide o desfecho. Entregar a habilitação (regular) libera o motorista;
// dizer que não tem habilitação ou desacatar o policial gera multa, ocorrência criminal (ficha) e detenção na
// delegacia por algumas horas da cidade (com fiança). Tudo persistente no mundo.
import { record, services } from './core.js';
import { account, addDebt, debit, BankError } from './bank.js';
import { registerCrime, userSheet } from './crimes.js';
import { nowIso, round2 } from './util.js';
import { DAY_REAL_MIN } from './clock.js';

export const HOUR_MS = (DAY_REAL_MIN * 60000) / 24; // uma hora da cidade em tempo real (100 s)
export const BLITZ_FINES = {
  'sem-habilitacao': { label: 'Dirigir sem habilitação (blitz)', amount: 880 },
  desacato: { label: 'Desacato à autoridade (blitz)', amount: 1467 },
};
const DETENTION_H = { 'sem-habilitacao': 2, desacato: 3 }; // horas da cidade detido(a)
export const BAIL = { 'sem-habilitacao': 400, desacato: 750 }; // fiança (NXC)

// CNH do jogador: emitida no primeiro uso, válida por 5 anos; pode ser suspensa por desacato
export function cnhOf(w) {
  const u = account(w);
  if (!u.cnh) {
    let n = ''; for (let k = 0; k < 11; k++) n += Math.floor(Math.random() * 10);
    const em = new Date(); const val = new Date(em); val.setFullYear(val.getFullYear() + 5);
    u.cnh = { numero: n, categoria: 'B', emitida: em.toISOString(), validade: val.toISOString(), status: 'regular', pontos: 0 };
  }
  if (u.cnh.status === 'suspensa' && u.cnh.suspensaAte && u.cnh.suspensaAte < nowIso()) { u.cnh.status = 'regular'; u.cnh.suspensaAte = null; }
  return u.cnh;
}
// detenção ativa (some sozinha quando o prazo acaba)
export function detentionOf(w) {
  const u = account(w); const d = u.detention;
  if (!d) return null;
  if (d.until <= nowIso()) { u.detention = null; return null; }
  return d;
}

const LINES = {
  entregar: ['Documentos em ordem. Boa viagem e dirija com cuidado!', 'Tudo certo com a habilitação. Pode seguir.', 'Obrigado pela colaboração. Está liberado(a).'],
  sem: ['Dirigir sem habilitação é infração gravíssima. Desça do veículo: você vai para a delegacia.', 'Sem habilitação? Então o carro fica retido e você vem com a gente.'],
  desacato: ['Isso é desacato à autoridade. Mãos onde eu possa ver: você está detido(a).', 'Desacato não. Você vai ser conduzido(a) à delegacia agora.'],
  suspensa: ['Sua habilitação está suspensa. Isso equivale a dirigir sem habilitação: você vai para a delegacia.'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// resposta do jogador ao policial: 'entregar' | 'sem' | 'desacato'
export function blitzAnswer(ctx, { opcao, local, veiculo }) {
  const w = ctx.w; const u = account(w);
  if (detentionOf(w)) throw new BankError('Você já está detido(a)');
  const cnh = cnhOf(w); const where = String(local || 'blitz').slice(0, 60);
  if (opcao === 'entregar' && cnh.status === 'regular') {
    u.blitzLog = [...(u.blitzLog || []), { at: nowIso(), local: where, resultado: 'liberado' }].slice(-30);
    record(ctx, { type: 'blitz', cat: 'seguranca', title: `Você passou por uma blitz em ${where}`, text: 'Documentos conferidos. Liberado(a).', actors: ['me'], importance: 1 });
    return { ok: true, resultado: 'liberado', fala: pick(LINES.entregar), cnh: { numero: cnh.numero, categoria: cnh.categoria, validade: cnh.validade } };
  }
  if (!['entregar', 'sem', 'desacato'].includes(opcao)) throw new BankError('Resposta inválida');
  // não tem habilitação (ou a dele está suspensa) / desacato: multa, ocorrência e detenção
  const tipo = opcao === 'desacato' ? 'desacato' : 'sem-habilitacao';
  const f = BLITZ_FINES[tipo];
  const debt = addDebt(w, { kind: 'multa', amount: f.amount, desc: `Multa de trânsito: ${f.label}${veiculo ? ` — ${String(veiculo).slice(0, 40)}` : ''}`, dueDays: 5, creditor: 'Polícia Rodoviária de Aurora', at: ctx.at });
  u.trafficFines ??= []; u.trafficFines.push({ tipo, at: nowIso(), amount: f.amount, debtId: debt.id }); u.trafficFines = u.trafficFines.slice(-60);
  let caseId = null;
  try { caseId = registerCrime(ctx, { tipo: opcao === 'desacato' ? 'desacato' : 'dirigir_sem_habilitacao', suspeito: 'me', local: where, witnesses: 2, desc: opcao === 'desacato' ? `Desacato a policial durante blitz em ${where}.` : `Abordado(a) em blitz em ${where} sem habilitação.` })?.caseId || null; } catch { /* sem ocorrência */ }
  if (opcao === 'desacato') { cnh.status = 'suspensa'; cnh.suspensaAte = new Date(Date.now() + 24 * HOUR_MS).toISOString(); cnh.pontos += 7; }
  const hours = DETENTION_H[tipo];
  u.detention = { at: nowIso(), until: new Date(Date.now() + hours * HOUR_MS).toISOString(), motivo: f.label.replace(' (blitz)', ''), local: 'Delegacia de Aurora', bail: BAIL[tipo], tipo, caseId };
  const sh = userSheet(w); w.userSheet = sh; sh.prisoes = (sh.prisoes || 0) + 1; sh.situacao = 'preso(a)'; sh.lastPrisao = nowIso();
  u.reputation = Math.max(0, (u.reputation || 50) - (opcao === 'desacato' ? 8 : 5));
  u.blitzLog = [...(u.blitzLog || []), { at: nowIso(), local: where, resultado: 'preso', tipo }].slice(-30);
  record(ctx, { type: 'prisao', cat: 'seguranca', title: `Você foi detido(a) em blitz em ${where}`, text: `${f.label}. Multa de ${f.amount} NXC e ${hours} h na delegacia.`, actors: ['me'], importance: 3 });
  services.live?.(w, { kind: 'prisao', personaId: 'me', name: 'Você', text: `Você foi detido(a) numa blitz (${f.label.toLowerCase()})` });
  return { ok: true, resultado: 'preso', fala: pick(cnh.status === 'suspensa' && opcao === 'entregar' ? LINES.suspensa : opcao === 'desacato' ? LINES.desacato : LINES.sem), multa: { label: f.label, amount: f.amount, debtId: debt.id }, detention: u.detention };
}

// fiança: paga na hora e sai da delegacia (sem saldo, não sai)
export function payBail(ctx) {
  const w = ctx.w; const u = account(w); const d = detentionOf(w);
  if (!d) throw new BankError('Você não está detido(a)');
  debit(w, d.bail, `Fiança — ${d.motivo}`, ctx.at, 'justica');
  u.detention = null;
  record(ctx, { type: 'fianca', cat: 'seguranca', title: 'Você pagou fiança e foi liberado(a)', text: `${round2(d.bail)} NXC`, actors: ['me'], importance: 2 });
  return { ok: true, paid: d.bail };
}
