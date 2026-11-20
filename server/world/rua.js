// OCORRÊNCIAS DE RUA — o que acontece quando o jogador esbarra ou derruba alguém, e os crimes de rua entre moradores.
// O mapa conta o que viu (quem caiu, como ficou, quem acusou); aqui fica o que é real e persistente: ferimentos,
// crimes na ficha (pelo sistema de Justiça), discussão com o morador (relação), multa por perturbação e a prisão
// (dias na cela da delegacia ou fiança). O jogador segue as mesmas regras dos moradores.
import { record, services } from './core.js';
import { account, addDebt, debit, BankError } from './bank.js';
import { personById, bumpUser } from './agents.js';
import { injure } from './injuries.js';
import { registerCrime, userSheet } from './crimes.js';
import { HOUR_MS, detentionOf } from './blitz.js';
import { nowIso } from './util.js';

// consequência de cada resultado: crime, dias de prisão e fiança (NXC)
export const PENAS = {
  inconsciente: { crime: 'lesao_corporal', dias: 1, fianca: 900, sev: 'moderada', label: 'deixou uma pessoa inconsciente na rua' },
  sangrando: { crime: 'lesao_grave', dias: 1, fianca: 1500, sev: 'grave', label: 'feriu uma pessoa, que ficou sangrando na calçada' },
  morte: { crime: 'homicidio_culposo', dias: 1, fianca: 4000, sev: 'morte', label: 'derrubou uma pessoa, que morreu no local' },
  policial: { crime: 'agressao_policial', dias: 2, fianca: 2500, label: 'agrediu um policial' },
  roubo: { crime: 'roubo_veiculo', dias: 1, fianca: 1200, label: 'roubou um carro na rua' },
};
export const MULTA_PERTURBACAO = 195;
const RESULTS = ['inconsciente', 'sangrando', 'morte'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const where = (l) => String(l || 'na rua').slice(0, 60);

// 1) o jogador derrubou alguém: o ferimento é real (morador com nome), e vira notícia
export function streetIncident(ctx, { resultado, personaId, local }) {
  if (!RESULTS.includes(resultado)) throw new BankError('Resultado inválido');
  const w = ctx.w; const p = personaId ? personById(w, personaId) : null; let estado = null;
  if (p?.agent) {
    const r = injure(ctx, p, { causa: 'esbarrao', local: where(local), sev: PENAS[resultado].sev });
    estado = r?.state || null;
    bumpUser(ctx, p, resultado === 'inconsciente' ? -14 : -22, { trust: -15, note: resultado === 'sangrando' ? 'Me derrubou na rua e me machucou.' : 'Me derrubou na rua.' });
  }
  const nome = p?.name || 'Um pedestre';
  record(ctx, { type: 'rua-queda', cat: 'seguranca', title: resultado === 'morte' ? `${nome} morre após ser derrubado(a) na rua${local ? ` em ${where(local)}` : ''}` : `${nome} é derrubado(a) por alguém correndo${local ? ` em ${where(local)}` : ''}`, text: resultado === 'inconsciente' ? 'A vítima ficou desacordada até a ambulância chegar.' : resultado === 'sangrando' ? 'A vítima ficou sentada na calçada, sangrando, e discutiu com quem a derrubou.' : 'Testemunhas chamaram a polícia e a ambulância.', actors: ['me', ...(p ? [p.id] : [])], importance: resultado === 'morte' ? 4 : 3 });
  return { ok: true, estado };
}

// 2) a polícia ouviu vítima e testemunhas, que apontaram o jogador: abre o inquérito e fica a prisão pendente
export function streetAccuse(ctx, { resultado, personaId, local, testemunhas }) {
  const P = PENAS[resultado]; if (!P || resultado === 'policial') throw new BankError('Ocorrência inválida');
  const w = ctx.w; const u = account(w);
  const r = registerCrime(ctx, { tipo: P.crime, suspeito: 'me', vitima: personaId && personById(w, personaId) ? personaId : null, local: where(local), witnesses: Math.max(1, Math.min(20, Number(testemunhas) || 3)), desc: `Testemunhas apontaram o jogador: ${P.label} ${where(local)}.` });
  u.pendingArrest = { resultado, crime: P.crime, dias: P.dias, fianca: P.fianca, local: where(local), at: nowIso(), caseId: r?.caseId || null };
  return { ok: true, caseId: r?.caseId || null, dias: P.dias, fianca: P.fianca, crime: P.crime };
}

// 3) esbarrou num policial: agressão a policial, prisão de 2 dias ou fiança
export function assaultOfficer(ctx, { local }) {
  const w = ctx.w; const u = account(w); const P = PENAS.policial;
  const r = registerCrime(ctx, { tipo: P.crime, suspeito: 'me', local: where(local), witnesses: 2, desc: `Esbarrou e derrubou um policial ${where(local)}.` });
  u.pendingArrest = { resultado: 'policial', crime: P.crime, dias: P.dias, fianca: P.fianca, local: where(local), at: nowIso(), caseId: r?.caseId || null };
  return { ok: true, dias: P.dias, fianca: P.fianca };
}

// 4) preso(a): cumprir os dias na cela ou pagar a fiança (sem saldo, não dá para pagar)
export function streetArrest(ctx, { opcao, delegacia }) {
  const w = ctx.w; const u = account(w); const pa = u.pendingArrest;
  if (!pa) throw new BankError('Não há prisão pendente');
  if (detentionOf(w)) throw new BankError('Você já está detido(a)');
  const sh = userSheet(w); w.userSheet = sh;
  if (opcao === 'fianca') {
    debit(w, pa.fianca, `Fiança — ${pa.crime.replace(/_/g, ' ')}`, ctx.at, 'justica');
    u.pendingArrest = null; sh.situacao = 'com antecedentes';
    record(ctx, { type: 'fianca', cat: 'seguranca', title: 'Você foi detido(a) e pagou fiança', text: `${pa.fianca} NXC. O inquérito continua.`, actors: ['me'], importance: 2 });
    return { ok: true, resultado: 'fianca', pago: pa.fianca };
  }
  if (opcao !== 'cumprir') throw new BankError('Escolha cumprir a pena ou pagar a fiança');
  const motivo = { roubo_veiculo: 'Roubo de veículo', lesao_corporal: 'Lesão corporal', lesao_grave: 'Lesão corporal grave', homicidio_culposo: 'Homicídio culposo', agressao_policial: 'Agressão a policial' }[pa.crime] || 'Crime';
  u.detention = { at: nowIso(), until: new Date(Date.now() + pa.dias * 24 * HOUR_MS).toISOString(), motivo, local: String(delegacia || 'Delegacia').slice(0, 40), tipo: pa.crime, bail: pa.fianca, dias: pa.dias, caseId: pa.caseId };
  u.pendingArrest = null; sh.prisoes = (sh.prisoes || 0) + 1; sh.situacao = 'preso(a)'; sh.lastPrisao = nowIso();
  u.reputation = Math.max(0, (u.reputation || 50) - (pa.crime === 'homicidio_culposo' ? 15 : 8));
  record(ctx, { type: 'prisao', cat: 'seguranca', title: `Você foi preso(a): ${motivo.toLowerCase()}`, text: `${pa.dias} dia(s) na cela (${u.detention.local}). Fiança possível: ${pa.fianca} NXC.`, actors: ['me'], importance: 3 });
  services.live?.(w, { kind: 'prisao', personaId: 'me', name: 'Você', text: `Você foi preso(a) por ${motivo.toLowerCase()}` });
  return { ok: true, resultado: 'preso', detention: u.detention };
}

// fiança paga de dentro da cela (só quando a pena permite fiança; a blitz não permite)
export function payBail(ctx) {
  const w = ctx.w; const u = account(w); const d = detentionOf(w);
  if (!d) throw new BankError('Você não está detido(a)');
  if (!d.bail) throw new BankError('Essa detenção não tem fiança');
  debit(w, d.bail, `Fiança — ${d.motivo}`, ctx.at, 'justica');
  u.detention = null;
  record(ctx, { type: 'fianca', cat: 'seguranca', title: 'Você pagou fiança e saiu da cela', text: `${d.bail} NXC`, actors: ['me'], importance: 2 });
  return { ok: true, paid: d.bail };
}

// 5) esbarrão leve: discussão com o morador (resposta pela personalidade); pode chamar a polícia
const FALA = {
  educada: { calmo: ['Tudo bem, acontece. Só presta atenção.', 'Tá certo, desculpa aceita.'], bravo: ['Desculpa não conserta nada! Olha por onde anda.', 'Hum. Tá. Mas da próxima vez eu chamo a polícia.'] },
  neutra: { calmo: ['Nem um "desculpa"? Que falta de educação.', 'Você nem olha por onde anda, hein?'], bravo: ['Vai fingir que nada aconteceu? Vou chamar a polícia!', 'Que absurdo! Isso não vai ficar assim.'] },
  agressiva: { calmo: ['Não precisa ser grosso(a). Eu vou embora.', 'Que pessoa estúpida...'], bravo: ['É assim? Vou chamar a polícia agora mesmo!', 'Você me empurra e ainda me ameaça? Polícia!'] },
};
export function streetDiscuss(ctx, { id, tone, situacao }) {
  if (!FALA[tone]) throw new BankError('Resposta inválida');
  const w = ctx.w; const p = id ? personById(w, id) : null;
  const vol = p?.agent?.traits?.volatility ?? 0.5;
  const raiva = (situacao === 'sangrando' ? 0.35 : 0) + vol * 0.6 + (tone === 'agressiva' ? 0.45 : tone === 'neutra' ? 0.15 : -0.3) + Math.random() * 0.2;
  const bravo = raiva > 0.55;
  const chamaPolicia = situacao !== 'sangrando' && bravo && tone !== 'educada' ? true : situacao !== 'sangrando' && tone === 'agressiva' && Math.random() < 0.5;
  if (p?.agent) bumpUser(ctx, p, tone === 'educada' ? 3 : tone === 'neutra' ? -4 : -10, { trust: tone === 'educada' ? 2 : -6, note: tone === 'educada' ? 'Esbarrou em mim, mas pediu desculpas.' : 'Esbarrou em mim e foi grosso(a).' });
  return { ok: true, fala: pick(FALA[tone][bravo ? 'bravo' : 'calmo']), emo: bravo ? 'irritado' : tone === 'educada' ? 'neutro' : 'triste', chamaPolicia, encerra: !bravo || tone === 'educada' };
}

// 6) a polícia atendeu a reclamação de esbarrão: perturbação (multa e ficha, sem prisão)
export function streetComplaint(ctx, { local, presente }) {
  const w = ctx.w; const u = account(w);
  registerCrime(ctx, { tipo: 'perturbacao', suspeito: 'me', local: where(local), witnesses: 1, desc: `Reclamação de morador: esbarrão e discussão ${where(local)}.` });
  let multa = null;
  if (presente) { const d = addDebt(w, { kind: 'multa', amount: MULTA_PERTURBACAO, desc: `Multa: perturbação e vias de fato ${where(local)}`, dueDays: 5, creditor: 'Polícia', at: ctx.at }); multa = { amount: MULTA_PERTURBACAO, debtId: d.id }; u.reputation = Math.max(0, (u.reputation || 50) - 2); }
  return { ok: true, multa };
}

// 8) roubo de carro pelo jogador: o motorista (ou testemunhas) denuncia — vira ocorrência com a descrição do carro e
// do suspeito; a prisão só acontece se a polícia alcançar o jogador (captura → prisão pendente: 1 dia ou fiança)
export function vehicleTheft(ctx, { veiculo, cor, local, testemunhas, aparencia, direcao }) {
  const w = ctx.w; const u = account(w);
  const desc = `Roubo de ${String(veiculo || 'carro').slice(0, 40)}${cor ? ` ${String(cor).slice(0, 20)}` : ''} ${where(local)}.${aparencia ? ` Suspeito: ${String(aparencia).slice(0, 60)}.` : ''}${direcao ? ` Fugiu ${String(direcao).slice(0, 30)}.` : ''}`;
  const r = registerCrime(ctx, { tipo: 'roubo_veiculo', suspeito: 'me', local: where(local), witnesses: Math.max(1, Math.min(10, Number(testemunhas) || 1)), desc });
  u.carThefts = [...(u.carThefts || []), { at: nowIso(), veiculo: String(veiculo || '').slice(0, 40), local: where(local) }].slice(-30);
  return { ok: true, caseId: r?.caseId || null, desc };
}
export function theftCaptured(ctx, { local }) {
  const w = ctx.w; const u = account(w); const P = PENAS.roubo;
  u.pendingArrest = { resultado: 'roubo', crime: P.crime, dias: P.dias, fianca: P.fianca, local: where(local), at: nowIso(), caseId: null };
  return { ok: true, dias: P.dias, fianca: P.fianca };
}
// roubo de carro entre moradores: notícia (e prisão, se a polícia pegou o ladrão)
export function npcTheft(ctx, { local, preso }) {
  record(ctx, { type: 'roubo-veiculo', cat: 'seguranca', title: preso ? `Polícia prende ladrão de carro ${where(local)}` : `Carro roubado ${where(local)}: ladrão fugiu`, text: preso ? 'O motorista chamou a polícia, que perseguiu e prendeu o suspeito.' : 'O motorista chamou a polícia. O suspeito abandonou o carro e fugiu a pé.', actors: [], importance: 2 });
  return { ok: true };
}

// 7) crime de rua entre moradores (assassinato): notícia e investigação, suspeito não identificado
export function streetMurder(ctx, { local }) {
  record(ctx, { type: 'assassinato', cat: 'seguranca', title: `Assassinato ${where(local)}: suspeito fugiu`, text: 'Testemunhas chamaram a polícia. A vítima não resistiu. A polícia abriu investigação.', actors: [], importance: 4 });
  services.live?.(ctx.w, { kind: 'ocorrencia', personaId: null, name: null, text: `Assassinato ${where(local)}: a polícia investiga` });
  return { ok: true };
}
