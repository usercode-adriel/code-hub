// Briefing da manhã, detector de procrastinação e resumos — tudo por regras, sem IA.
import { db, localDate } from './db.js';
import { DEFAULT_SETTINGS } from './seed.js';

const brl = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const DAY = 86400000;
const daysBetween = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / DAY);
const addDays = (date, n) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + n); return localDate(d); };
export const prefs = (uid) => ({ ...DEFAULT_SETTINGS, ...(db().settings[uid] || {}) });
const mine = (coll, uid) => db()[coll].filter((x) => x.userId === uid);

export function indrivePage(uid) {
  const pages = mine('pages', uid);
  return pages.find((p) => /indrive/i.test(p.title)) || pages.find((p) => p.blocks?.some((b) => b.type === 'finance'));
}

export function financeTotals(uid, from, to) {
  const page = indrivePage(uid);
  if (!page) return null;
  const list = db().finance.filter((f) => f.pageId === page.id && f.date >= from && f.date <= to);
  const sum = (t) => Math.round(list.filter((f) => f.type === t).reduce((a, f) => a + f.amount, 0) * 100) / 100;
  const km = list.filter((f) => f.type === 'in' && f.km).reduce((a, f) => a + f.km, 0);
  return { in: sum('in'), out: sum('out'), net: Math.round((sum('in') - sum('out')) * 100) / 100, count: list.length, km };
}

// Próxima data de cobrança/vencimento de itens recorrentes.
export function nextOccurrence(date, cycle) {
  if (!date) return null;
  const today = localDate();
  let d = date;
  let guard = 0;
  while (d < today && cycle && cycle !== 'once' && guard++ < 400) {
    const x = new Date(`${d}T12:00:00`);
    if (cycle === 'monthly') x.setMonth(x.getMonth() + 1);
    else if (cycle === 'yearly') x.setFullYear(x.getFullYear() + 1);
    else if (cycle === 'weekly') x.setDate(x.getDate() + 7);
    else break;
    d = localDate(x);
  }
  return d;
}

// ---------- Detector de procrastinação ----------
const SUGGESTIONS = {
  postponed: [
    'Divida em uma primeira ação de 10 minutos e faça só ela hoje.',
    'Marque um horário fixo na agenda em vez de só um prazo.',
    'Pergunte-se: ainda é importante? Se não for, arquive sem culpa.',
    'Reduza o escopo: qual versão "boa o suficiente" resolve?',
  ],
  stale: [
    'Está parada em "em andamento" há dias: anote o que está travando.',
    'Defina o próximo passo concreto (verbo + objeto), ex.: "abrir o arquivo e listar 3 itens".',
    'Peça ajuda ou combine um prazo com alguém para ganhar compromisso.',
  ],
  overdue: [
    'Renegocie o prazo de propósito (uma vez) em vez de deixar atrasar em silêncio.',
    'Faça agora os 5 primeiros minutos: começar é a parte mais difícil.',
  ],
  old: [
    'Criada há muito tempo e nunca iniciada: decida hoje se faz, agenda ou arquiva.',
  ],
};

export function procrastination(uid) {
  const today = localDate();
  const open = mine('tasks', uid).filter((t) => t.status !== 'done');
  const projects = Object.fromEntries(mine('projects', uid).map((p) => [p.id, p]));
  const flagged = [];
  for (const t of open) {
    const reasons = [];
    let kind = null;
    if ((t.postponed || 0) >= 2) { reasons.push(`prazo adiado ${t.postponed} vezes`); kind ??= 'postponed'; }
    if (t.status === 'doing' && t.statusAt && (Date.now() - new Date(t.statusAt)) / DAY >= 7) {
      reasons.push(`em andamento há ${Math.floor((Date.now() - new Date(t.statusAt)) / DAY)} dias`); kind ??= 'stale';
    }
    if (t.dueDate && t.dueDate < today && daysBetween(t.dueDate, today) >= 3) { reasons.push(`atrasada há ${daysBetween(t.dueDate, today)} dias`); kind ??= 'overdue'; }
    if (t.status === 'todo' && (Date.now() - new Date(t.createdAt)) / DAY >= 21) { reasons.push(`criada há ${Math.floor((Date.now() - new Date(t.createdAt)) / DAY)} dias`); kind ??= 'old'; }
    if (!reasons.length) continue;
    const score = (t.postponed || 0) * 3 + reasons.length * 2 + (t.priority === 'high' ? 2 : 0);
    const list = SUGGESTIONS[kind];
    flagged.push({
      id: t.id, title: t.title, project: projects[t.projectId]?.name, priority: t.priority, dueDate: t.dueDate,
      postponed: t.postponed || 0, reasons, score, suggestion: list[(t.title.length + (t.postponed || 0)) % list.length],
    });
  }
  flagged.sort((a, b) => b.score - a.score);
  // padrões gerais da organização
  const tips = [];
  const byProject = {};
  for (const f of flagged) byProject[f.project] = (byProject[f.project] || 0) + 1;
  const worst = Object.entries(byProject).sort((a, b) => b[1] - a[1])[0];
  if (worst && worst[1] >= 3) tips.push(`O projeto "${worst[0]}" concentra ${worst[1]} tarefas travadas: talvez esteja grande demais. Escolha 1 foco para esta semana.`);
  const high = open.filter((t) => t.priority === 'high').length;
  if (high > 5) tips.push(`Você tem ${high} tarefas de prioridade alta. Quando tudo é urgente, nada é: deixe no máximo 3 como "alta".`);
  if (open.length > 25) tips.push(`São ${open.length} tarefas abertas. Que tal uma faxina: arquivar o que não faz mais sentido?`);
  const noDue = open.filter((t) => !t.dueDate).length;
  if (noDue > 8) tips.push(`${noDue} tarefas não têm prazo. Dar uma data às importantes ajuda a não esquecê-las.`);
  return { flagged: flagged.slice(0, 15), tips, openCount: open.length };
}

// ---------- Briefing ----------
export function briefing(uid) {
  const d = db();
  const s = prefs(uid);
  const user = d.users.find((u) => u.id === uid);
  const today = localDate();
  const yesterday = addDays(today, -1);
  const soon = addDays(today, s.remindDaysBefore);
  const h = new Date().getHours();
  const greeting = `${h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'}, ${s.assistantNickname || user?.name.split(' ')[0] || ''}`;
  const projects = Object.fromEntries(mine('projects', uid).map((p) => [p.id, p]));
  const open = mine('tasks', uid).filter((t) => t.status !== 'done');
  const order = { high: 0, medium: 1, low: 2 };
  const deco = (t) => ({ id: t.id, title: t.title, priority: t.priority, dueDate: t.dueDate, project: projects[t.projectId]?.name, postponed: t.postponed || 0 });

  const agenda = mine('agenda', uid).filter((a) => a.date === today && !a.done).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today).map(deco);
  const dueToday = open.filter((t) => t.dueDate === today).map(deco);
  const priorities = [...open].sort((a, b) => order[a.priority] - order[b.priority] || (a.dueDate || '9').localeCompare(b.dueDate || '9')).slice(0, 5).map(deco);
  const habits = mine('habits', uid).map((hb) => ({ id: hb.id, name: hb.name, icon: hb.icon, done: hb.days.includes(today), streak: streak(hb.days) }));
  const bills = mine('bills', uid).filter((b) => !b.paid && b.due && b.due <= soon).map((b) => ({ id: b.id, name: b.name, amount: b.amount, due: b.due, late: b.due < today }));
  const subs = mine('subscriptions', uid).filter((x) => x.active !== false).map((x) => ({ ...x, next: nextOccurrence(x.nextCharge, x.cycle) }))
    .filter((x) => x.next && x.next <= soon).map((x) => ({ id: x.id, name: x.name, amount: x.amount, next: x.next }));
  const docs = mine('docs', uid).filter((x) => x.due && x.due <= addDays(today, 30)).map((x) => ({ id: x.id, name: x.name, due: x.due, days: daysBetween(today, x.due) }));
  const garage = d.garage[uid] || {};
  const services = mine('services', uid).map((sv) => serviceStatus(sv, garage)).filter((sv) => sv.soon);
  const cardsDue = mine('cards', uid).filter((c) => c.due <= today).length;
  const toRead = mine('inbox', uid).filter((x) => x.kind === 'link' && !x.done).slice(0, 5).map((x) => ({ id: x.id, text: x.text, url: x.url }));
  const inboxCount = mine('inbox', uid).filter((x) => !x.done).length;
  const proc = procrastination(uid).flagged.slice(0, 3);
  const finYesterday = financeTotals(uid, yesterday, yesterday);
  const finMonth = financeTotals(uid, `${today.slice(0, 8)}01`, today);
  const decisionsToReview = mine('decisions', uid).filter((x) => x.reviewAt && x.reviewAt <= today && !x.review).map((x) => ({ id: x.id, title: x.title }));

  // texto corrido (para notificação e leitura em voz alta)
  const parts = [`${greeting}! Hoje é ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}.`];
  parts.push(agenda.length ? `Você tem ${agenda.length} compromisso(s): ${agenda.map((a) => `${a.time ? `${a.time} ` : ''}${a.title}`).join('; ')}.` : 'Nenhum compromisso na agenda hoje.');
  if (overdue.length) parts.push(`Atenção: ${overdue.length} tarefa(s) atrasada(s), como "${overdue[0].title}".`);
  if (dueToday.length) parts.push(`Vencem hoje: ${dueToday.map((t) => t.title).join(', ')}.`);
  if (priorities.length) parts.push(`Prioridade principal: ${priorities[0].title}.`);
  if (bills.length) parts.push(`Contas a pagar em breve: ${bills.map((b) => `${b.name} (${brl(b.amount)})`).join(', ')}.`);
  if (subs.length) parts.push(`Cobranças de assinaturas chegando: ${subs.map((x) => x.name).join(', ')}.`);
  if (docs.length) parts.push(`Documentos vencendo: ${docs.map((x) => `${x.name} em ${x.days} dia(s)`).join(', ')}.`);
  if (services.length) parts.push(`Carro: ${services.map((x) => x.label).join('; ')}.`);
  if (finYesterday && finYesterday.count) parts.push(`Ontem no InDrive: ${brl(finYesterday.in)} de entradas e saldo de ${brl(finYesterday.net)}.`);
  if (finMonth && finMonth.count) parts.push(`No mês, o saldo do InDrive está em ${brl(finMonth.net)}.`);
  if (cardsDue) parts.push(`${cardsDue} cartão(ões) de inglês para revisar.`);
  if (proc.length) parts.push(`Tarefa que você vem adiando: "${proc[0].title}". ${proc[0].suggestion}`);
  const pendingHabits = habits.filter((x) => !x.done);
  if (pendingHabits.length) parts.push(`Hábitos de hoje: ${pendingHabits.map((x) => x.name).join(', ')}.`);
  if (toRead.length) parts.push(`${toRead.length} link(s) salvo(s) para ler.`);

  return {
    date: today, greeting, agenda, overdue, dueToday, priorities, habits, bills, subs, docs, services, cardsDue,
    toRead, inboxCount, procrastination: proc, finYesterday, finMonth, decisionsToReview, text: parts.join(' '),
  };
}

export function streak(days) {
  const set = new Set(days);
  let n = 0;
  let cur = localDate();
  if (!set.has(cur)) cur = addDays(cur, -1); // ainda dá tempo de marcar hoje
  while (set.has(cur)) { n++; cur = addDays(cur, -1); }
  return n;
}

// Situação de um item de manutenção do carro (por km e/ou por data).
export function serviceStatus(sv, garage) {
  const km = Number(garage.km) || 0;
  const today = localDate();
  let kmLeft = null; let daysLeft = null;
  if (sv.everyKm && sv.lastKm != null) kmLeft = Math.round(Number(sv.lastKm) + Number(sv.everyKm) - km);
  if (sv.everyDays && sv.lastDate) daysLeft = daysBetween(today, addDays(sv.lastDate, Number(sv.everyDays)));
  const soon = (kmLeft != null && kmLeft <= 500) || (daysLeft != null && daysLeft <= 15);
  const late = (kmLeft != null && kmLeft < 0) || (daysLeft != null && daysLeft < 0);
  const bits = [];
  if (kmLeft != null) bits.push(kmLeft < 0 ? `${-kmLeft} km atrasado` : `em ${kmLeft} km`);
  if (daysLeft != null) bits.push(daysLeft < 0 ? `${-daysLeft} dias atrasado` : `em ${daysLeft} dias`);
  return { ...sv, kmLeft, daysLeft, soon, late, label: `${sv.name} ${bits.join(' / ')}` };
}
