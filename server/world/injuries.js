// FERIMENTOS DOS MORADORES — estado de saúde persistente por pessoa, usado pelos acidentes (atropelamento e batida).
// Estados: saudavel → ferido → ferido_grave → internado → em_recuperacao → saudavel, ou morto (raro, nunca automático).
// A gravidade depende do impacto (velocidade do veículo). Internados não trabalham nem conversam; em recuperação
// voltam devagar. O hospital registra internações e altas; tudo fica em agent.health (persiste no mundo salvo).
import { onDaily, record, services } from './core.js';
import { residents, agentOf } from './agents.js';
import { remember, genderize } from '../social.js';
import { chance, pick, nowIso, cap } from './util.js';

const HOUR = 3600000; const DAY = 24 * HOUR;
export const STATES = { saudavel: 'Saudável', ferido: 'Ferido', ferido_grave: 'Ferido grave', internado: 'Internado', em_recuperacao: 'Em recuperação', morto: 'Morto' };

// gravidade pelo impacto (km/h): leve, moderada, grave; a morte exige impacto muito forte e é rara
export function severityOf(kmh, rnd = Math.random()) {
  if (kmh >= 70 && rnd < 0.04 + (kmh - 70) * 0.002) return 'morte';
  if (kmh >= 45) return 'grave';
  if (kmh >= 25) return 'moderada';
  return 'leve';
}

export function injure(ctx, p, { kmh = 30, causa = 'atropelamento', local = '' } = {}) {
  const a = agentOf(ctx.w, p); if (!a || a.health?.state === 'morto') return null;
  const sev = severityOf(kmh);
  const h = a.health ??= { state: 'saudavel', history: [] };
  const now = ctx.at ?? new Date();
  if (sev === 'morte') {
    h.state = 'morto'; h.since = now.toISOString();
    record(ctx, { type: 'obito', cat: 'seguranca', title: `${p.name} morreu após ${causa === 'acidente' ? 'uma batida de carro' : 'um atropelamento'}${local ? ` em ${local}` : ''}`, text: 'Atendimento de emergência não foi suficiente.', actors: [p.id], importance: 4 });
    services.live?.(ctx.w, { kind: 'ocorrencia', personaId: p.id, name: p.name, text: `${p.name} não resistiu aos ferimentos` });
    return { state: 'morto' };
  }
  const state = sev === 'grave' ? 'ferido_grave' : 'ferido';
  h.state = state; h.severity = sev; h.since = now.toISOString(); h.causa = causa;
  // tempo de recuperação em horas do jogo: leve ~3 h, moderada ~10 h, grave ~ 2 dias (internação a partir de ferido grave)
  h.hospitalUntil = sev === 'leve' ? null : new Date(now.getTime() + (sev === 'grave' ? 3 : 1) * HOUR).toISOString();
  h.recoverUntil = new Date(now.getTime() + (sev === 'leve' ? 3 : sev === 'moderada' ? 10 : 48) * HOUR).toISOString();
  h.history.push({ at: now.toISOString(), text: `${STATES[state]} (${causa === 'acidente' ? 'batida' : 'atropelamento'}${local ? ` em ${local}` : ''})` }); cap(h.history, 20);
  a.injuredUntil = h.recoverUntil; // compatibilidade: quem usa injuredUntil continua afastado
  p.mood = { emotion: 'assustada', intensity: 0.8, reason: 'foi ferida(o) e precisa de atendimento' };
  try { remember(p, genderize(p, `Fui ferida(o) em ${causa === 'acidente' ? 'uma batida de carro' : 'um atropelamento'}${local ? ` em ${local}` : ''}. ${sev === 'leve' ? 'Foi um susto.' : 'Fui levada(o) ao Hospital Nexus.'}`)); } catch { /* sem memória */ }
  record(ctx, { type: 'ferimento', cat: 'seguranca', title: `${p.name} ${sev === 'leve' ? 'se machuca levemente' : sev === 'moderada' ? 'fica ferido(a)' : 'sofre ferimentos graves'}${local ? ` em ${local}` : ''}`, text: `Causa: ${causa === 'acidente' ? 'batida de carro' : 'atropelamento'}. Gravidade: ${STATES[state].toLowerCase()}.`, actors: [p.id], importance: sev === 'grave' ? 3 : 2 });
  return { state, severity: sev };
}

// atendimento: a ambulância chegou ao ferido → internação (se preciso) e início da recuperação
export function treat(ctx, p) {
  const a = agentOf(ctx.w, p); const h = a?.health; if (!h || h.state === 'morto' || h.state === 'saudavel') return null;
  if (h.severity !== 'leve') { h.state = 'internado'; h.since = (ctx.at ?? new Date()).toISOString(); h.history.push({ at: h.since, text: 'Internado no Hospital Nexus' }); cap(h.history, 20); services.live?.(ctx.w, { kind: 'atendimento', personaId: p.id, name: p.name, text: `${p.name} foi internado(a) no Hospital Nexus`, placeName: 'Hospital Nexus' }); }
  return h.state;
}

// rotina diária: alta, recuperação e a volta à rotina
export function dailyRecovery(ctx) {
  const now = ctx.at ?? new Date();
  for (const p of residents(ctx.w)) {
    const a = p.agent; const h = a?.health; if (!h || h.state === 'saudavel' || h.state === 'morto') continue;
    if (h.state === 'internado' && h.hospitalUntil && new Date(h.hospitalUntil) <= now) { h.state = 'em_recuperacao'; h.since = now.toISOString(); h.history.push({ at: h.since, text: 'Alta do hospital' }); services.live?.(ctx.w, { kind: 'atendimento', personaId: p.id, name: p.name, text: `${p.name} recebeu alta do hospital`, placeName: 'Hospital Nexus' }); }
    if (h.state === 'ferido' && h.severity === 'leve' && h.recoverUntil && new Date(h.recoverUntil) <= now) { h.state = 'saudavel'; h.history.push({ at: now.toISOString(), text: 'Recuperou-se' }); }
    if (h.state === 'em_recuperacao' && h.recoverUntil && new Date(h.recoverUntil) <= now) { h.state = 'saudavel'; h.history.push({ at: now.toISOString(), text: 'Voltou à rotina' }); }
    if (h.state === 'saudavel') a.injuredUntil = null;
  }
}
onDaily(dailyRecovery);

// quem está afastado (internado, em recuperação ou ferido) não aparece na rotina normal
export const isAfield = (p) => { const h = p.agent?.health; return Boolean(h && ['ferido', 'ferido_grave', 'internado', 'em_recuperacao'].includes(h.state)); };
export const hospitalPatients = (w) => residents(w).filter((p) => p.agent?.health?.state === 'internado').map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, since: p.agent.health.since, severity: p.agent.health.severity }));
