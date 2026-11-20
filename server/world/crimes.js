// CRIMES E FICHA CRIMINAL — ocorrências criminais de moradores e do jogador (agressão, briga, agressão a policial,
// dano ao patrimônio, atropelamento com dolo). Cada crime tem gravidade própria e vira um inquérito pelo sistema de
// Justiça já existente (openCase → investigação → intimação → decisão). A polícia não sabe quem foi: a identificação
// vem das provas (testemunhas, registros) e a investigação decide. A ficha criminal é persistente por pessoa.
import { record, services } from './core.js';
import { personById, residents } from './agents.js';
import { openCase } from './justice.js';
import { remember, genderize } from '../social.js';
import { BankError } from './bank.js';

export const CRIMES = {
  agressao: { label: 'Agressão física', sev: 2, type: 'furto' },
  briga: { label: 'Briga de rua', sev: 1, type: 'vandalismo' },
  agressao_policial: { label: 'Agressão a policial', sev: 3, type: 'desobediencia' },
  resistencia: { label: 'Resistência à prisão', sev: 2, type: 'desobediencia' },
  dano: { label: 'Dano ao patrimônio', sev: 1, type: 'vandalismo' },
  atropelamento_doloso: { label: 'Atropelamento criminoso', sev: 3, type: 'estelionato' },
  desacato: { label: 'Desacato à autoridade', sev: 2, type: 'desobediencia' },
  lesao_corporal: { label: 'Lesão corporal', sev: 2, type: 'furto' },
  lesao_grave: { label: 'Lesão corporal grave', sev: 3, type: 'furto' },
  homicidio_culposo: { label: 'Homicídio culposo', sev: 3, type: 'estelionato' },
  homicidio: { label: 'Homicídio', sev: 3, type: 'estelionato' },
  perturbacao: { label: 'Perturbação e vias de fato', sev: 1, type: 'vandalismo' },
  roubo_veiculo: { label: 'Roubo de veículo', sev: 2, type: 'furto' },
  furto: { label: 'Furto', sev: 2, type: 'furto' },
  homicidio: { label: 'Homicídio', sev: 3, type: 'estelionato' },
  disparo: { label: 'Disparo de arma de fogo em via pública', sev: 3, type: 'desobediencia' },
  invasao: { label: 'Invasão de propriedade', sev: 2, type: 'invasao' },
  vandalismo: { label: 'Vandalismo', sev: 1, type: 'vandalismo' },
  dirigir_sem_habilitacao: { label: 'Dirigir sem habilitação', sev: 1, type: 'desobediencia' },
};

// ficha criminal: histórico persistente por pessoa (o agente guarda o próprio registro)
export function sheetOf(p) { const a = p.agent; if (!a) return null; a.sheet ??= { crimes: [], prisoes: 0, reincidencia: 0, situacao: 'sem antecedentes' }; return a.sheet; }

// registra o crime e abre a ocorrência; provas iniciais dependem de testemunhas próximas
export function registerCrime(ctx, { tipo, suspeito, personaId = null, vitima = null, local = '', witnesses = 0, desc = '' }) {
  const w = ctx.w; const C = CRIMES[tipo]; if (!C) throw new BankError('Crime desconhecido');
  // suspeito: o próprio jogador ('me') ou um morador; o jogador tem ficha na conta
  const isMe = suspeito === 'me' || suspeito == null && tipo === 'atropelamento_doloso' && !personaId;
  const sus = isMe ? { name: 'Você', agent: null } : personById(w, suspeito);
  if (!isMe && !sus?.agent) return null;
  const sheet = isMe ? (w.userSheet ??= { crimes: [], prisoes: 0, reincidencia: 0, situacao: 'sem antecedentes' }) : sheetOf(sus);
  const reincid = sheet.crimes.some((c) => c.tipo === tipo && (ctx.at - new Date(c.at)) < 14 * 86400000);
  const entry = { tipo, label: C.label, sev: C.sev, at: ctx.at.toISOString(), local, vitima: vitima ? (personById(w, vitima)?.name || null) : null, reincidente: reincid };
  sheet.crimes.push(entry); if (sheet.crimes.length > 60) sheet.crimes.splice(0, sheet.crimes.length - 60);
  if (reincid) sheet.reincidencia += 1;
  sheet.situacao = sheet.prisoes ? 'já foi preso(a)' : 'com antecedentes';
  // provas: testemunhas e flagrante (a polícia não conhece o suspeito sem elas)
  const evidence = []; if (witnesses > 0) evidence.push({ kind: 'testemunhas', desc: `${witnesses} testemunha(s) do fato`, strength: Math.min(0.5, 0.15 * witnesses) });
  const c = openCase(ctx, { type: C.type, suspect: isMe ? { type: 'user', id: 'me' } : { type: 'persona', id: suspeito }, plaintiff: vitima ? vitima : 'policia', victimId: vitima, evidence, desc: desc || `${C.label}${local ? ` em ${local}` : ''}.` });
  record(ctx, { type: 'crime', cat: 'seguranca', title: `${C.label}${local ? ` em ${local}` : ''}: ocorrência registrada`, text: desc || 'Suspeito(a) identificado(a) pelo registro.', actors: [isMe ? 'me' : suspeito, vitima].filter(Boolean), importance: C.sev >= 3 ? 3 : 2 });
  services.live?.(w, { kind: 'ocorrencia', personaId: isMe ? 'me' : suspeito, name: sus.name, text: `${C.label} registrado(a)` });
  return { caseId: c?.id || null, sheet: entry };
}

// ficha visível (delegacia): só o que a polícia já registrou
export function userSheet(w) { return w.userSheet || { crimes: [], prisoes: 0, reincidencia: 0, situacao: 'sem antecedentes' }; }
export function publicSheet(p) { const s = sheetOf(p); return s ? { name: p.name, situacao: s.situacao, prisoes: s.prisoes, reincidencia: s.reincidencia, crimes: s.crimes.slice(-12).reverse() } : null; }

export function criminalRecords(w) {
  const me = userSheet(w);
  const list = residents(w).filter((p) => p.agent?.sheet?.crimes?.length).map((p) => publicSheet(p));
  if (me.crimes.length) list.push({ name: 'Você', situacao: me.situacao, prisoes: me.prisoes, reincidencia: me.reincidencia, crimes: me.crimes.slice(-12).reverse(), user: true });
  return list.sort((a, b) => b.crimes.length - a.crimes.length).slice(0, 40);
}
