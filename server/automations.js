// Automações 1.7: rotinas "se isso, então aquilo", gastos recorrentes, plano do dia, revisão semanal,
// sugestão de turno, comentários noturnos dos grupos, cápsula do tempo e exportar/importar personagens.
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { db, id, now, save, localDate, UPLOAD_DIR } from './db.js';
import { notify, logEvent } from './notify.js';
import { briefing, financeTotals, streak, prefs } from './briefing.js';
import {
  deliverMessage, aiWrite, focusData, hasCloud, groupMembers, groupTurn, NIAC, PERSONALITY_LABELS, geminiJSON, announceDelivery,
} from './assistant.js';

const mine = (coll, uid) => db()[coll].filter((x) => x.userId === uid);
const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dmy = (d) => (d ? d.split('-').reverse().join('/') : '');
const hmNow = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
function addDays(date, n) { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + n); return localDate(d); }
const daysUntil = (date) => Math.round((new Date(`${date}T12:00:00`) - new Date(`${localDate()}T12:00:00`)) / 86400000);
const meta = (uid) => (db().userMeta[uid] ??= {});
const botFor = (user, botId) => (botId && botId !== 'niac' ? db().bots.find((b) => b.id === botId && b.userId === user.id) || null : null);
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ---------------- Rotinas ----------------
export const TRIGGERS = {
  horario: 'Em dias e horário definidos',
  conta_vencendo: 'Quando uma conta estiver para vencer',
  tarefa_atrasada: 'Quando houver tarefa atrasada',
  saldo_baixo: 'Quando o saldo do mês ficar abaixo de um valor',
  meta_indrive: 'Quando bater a meta diária do InDrive',
};
const AREA_OF_TRIGGER = { conta_vencendo: 'financas', saldo_baixo: 'financas', meta_indrive: 'indrive', tarefa_atrasada: 'tarefas', horario: null };

function monthMoney(uid) {
  const month = localDate().slice(0, 7);
  const list = mine('money', uid).filter((m) => m.date.startsWith(month));
  const inc = list.filter((m) => m.amount > 0).reduce((a, m) => a + m.amount, 0);
  const exp = -list.filter((m) => m.amount < 0).reduce((a, m) => a + m.amount, 0);
  return { inc, exp, bal: inc - exp };
}

// Verifica se a rotina deve disparar agora. Devolve { key, data } ou null.
function checkRule(user, r) {
  const today = localDate();
  const time = r.time || '09:00';
  const after = hmNow() >= time;
  const fired = r.fired || [];
  const once = (key) => (fired.includes(key) ? null : key);
  switch (r.trigger) {
    case 'horario': {
      const days = Array.isArray(r.days) && r.days.length ? r.days : [0, 1, 2, 3, 4, 5, 6];
      if (!days.includes(new Date().getDay()) || !after) return null;
      const key = once(today);
      return key && { key, data: focusData(user, r.focus || 'geral') };
    }
    case 'conta_vencendo': {
      if (!after) return null;
      const n = Number.isFinite(Number(r.daysBefore)) ? Number(r.daysBefore) : 2;
      const bills = mine('bills', user.id).filter((b) => !b.paid && b.due && daysUntil(b.due) <= n && daysUntil(b.due) >= -3 && !fired.includes(`${b.id}:${b.due}`));
      if (!bills.length) return null;
      return { key: bills.map((b) => `${b.id}:${b.due}`), data: bills.map((b) => `${b.name}${b.amount ? ` (${brl(b.amount)})` : ''} vence ${dmy(b.due)}${daysUntil(b.due) < 0 ? ' — ATRASADA' : daysUntil(b.due) === 0 ? ' — HOJE' : ` — em ${daysUntil(b.due)} dia(s)`}`).join('\n') };
    }
    case 'tarefa_atrasada': {
      if (!after) return null;
      const late = mine('tasks', user.id).filter((t) => t.status !== 'done' && t.dueDate && t.dueDate < today);
      if (!late.length) return null;
      const key = once(today);
      return key && { key, data: `${late.length} tarefa(s) atrasada(s): ${late.slice(0, 5).map((t) => `${t.title} (desde ${dmy(t.dueDate)})`).join('; ')}` };
    }
    case 'saldo_baixo': {
      if (!after) return null;
      const m = monthMoney(user.id);
      const limit = Number(r.threshold) || 0;
      if (m.bal >= limit) return null;
      const key = once(today);
      return key && { key, data: `Saldo do mês: ${brl(m.bal)} (entradas ${brl(m.inc)}, saídas ${brl(m.exp)}). Limite definido: ${brl(limit)}.` };
    }
    case 'meta_indrive': {
      const goal = Number(r.threshold) || Number(db().garage[user.id]?.dailyGoal) || 0;
      if (!goal) return null;
      const t = financeTotals(user.id, today, today);
      if (!t || t.net < goal) return null;
      const key = once(today);
      return key && { key, data: `Hoje no InDrive: ${brl(t.in)} de entradas, saldo ${brl(t.net)} (meta ${brl(goal)}), ${t.km || 0} km.` };
    }
    default: return null;
  }
}

async function fireRule(user, r, data, test = false) {
  const bot = botFor(user, r.botId);
  const instruction = `Rotina "${r.name}" que o usuário configurou. O que ele pediu: ${r.instruction || TRIGGERS[r.trigger]}.`;
  let text = await aiWrite(user, bot, instruction, data);
  if (!text) text = `${r.instruction ? `${r.instruction}\n\n` : ''}${data}`.trim();
  const conversationId = deliverMessage(user, bot, text, { kind: 'rotina' });
  if (!test) logEvent(user.id, 'system', 'rule', `Rotina executada: ${r.name}`, { link: '#/automacoes' });
  return { conversationId, text };
}

let rulesBusy = false;
export async function runRules() {
  if (rulesBusy) return;
  rulesBusy = true;
  try {
    for (const r of db().rules.filter((x) => x.active !== false)) {
      const user = db().users.find((u) => u.id === r.userId);
      if (!user) continue;
      const hit = checkRule(user, r);
      if (!hit) continue;
      r.fired = [...(r.fired || []), ...[].concat(hit.key)].slice(-60);
      r.lastRunAt = now();
      save();
      await fireRule(user, r, hit.data).catch((e) => console.error('[rotina]', e.message));
    }
  } finally { rulesBusy = false; }
}

// ---------------- Gastos recorrentes (assinaturas não cadastradas) ----------------
const keyOfDesc = (d) => norm(d).replace(/\d+/g, '').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
export function recurringSuggestions(uid) {
  const since = addDays(localDate(), -150);
  const groups = {};
  const VARIABLE = /mercado|alimenta|combust|transporte|saude|lazer/i;
  for (const m of mine('money', uid).filter((x) => x.amount < 0 && x.date >= since && !VARIABLE.test(norm(x.category)))) {
    const k = keyOfDesc(m.desc);
    if (k.length < 3) continue;
    (groups[k] ??= []).push(m);
  }
  const known = [...mine('subscriptions', uid).map((s) => keyOfDesc(s.name)), ...mine('bills', uid).map((b) => keyOfDesc(b.name))];
  const ignored = new Set(meta(uid).recurringIgnore || []);
  const out = [];
  for (const [k, list] of Object.entries(groups)) {
    const months = new Set(list.map((m) => m.date.slice(0, 7)));
    if (months.size < 2 || ignored.has(k) || known.some((x) => x && (x.includes(k) || k.includes(x)))) continue;
    const vals = list.map((m) => -m.amount);
    const avg = vals.reduce((a, v) => a + v, 0) / vals.length;
    const steady = vals.every((v) => Math.abs(v - avg) / avg <= 0.2);
    if (!steady) continue;
    const days = list.map((m) => Number(m.date.slice(8)));
    const day = Math.round(days.reduce((a, v) => a + v, 0) / days.length);
    const last = list.map((m) => m.date).sort().at(-1);
    const clean = list.at(-1).desc.replace(/\b\d{1,4}([/-]\d{1,2}){1,2}\b/g, '').replace(/\s{2,}/g, ' ').trim();
    out.push({ key: k, name: clean || list.at(-1).desc, amount: Math.round(avg * 100) / 100, months: months.size, day, last, category: list.at(-1).category || 'Assinaturas' });
  }
  return out.sort((a, b) => b.months - a.months || b.amount - a.amount).slice(0, 10);
}

// ---------------- Plano do dia ----------------
function planHeuristic(uid) {
  const today = localDate();
  const order = { high: 0, medium: 1, low: 2 };
  const open = mine('tasks', uid).filter((t) => t.status !== 'done');
  const score = (t) => (t.dueDate && t.dueDate < today ? -3 : t.dueDate === today ? -2 : 0) + order[t.priority] + (t.status === 'doing' ? -1 : 0);
  const picks = open.sort((a, b) => score(a) - score(b)).slice(0, 5);
  const agenda = mine('agenda', uid).filter((a) => a.date === today && !a.done && a.time).sort((a, b) => a.time.localeCompare(b.time));
  let cur = Math.max(new Date().getHours() + 1, 8) * 60;
  const items = [];
  for (const a of agenda) items.push({ type: 'agenda', title: a.title, start: a.time, why: 'Compromisso marcado' });
  for (const t of picks) {
    while (agenda.some((a) => { const m = Number(a.time.slice(0, 2)) * 60 + Number(a.time.slice(3)); return m >= cur && m < cur + 60; })) cur += 60;
    items.push({ type: 'task', taskId: t.id, title: t.title, start: `${String(Math.floor(cur / 60) % 24).padStart(2, '0')}:${String(cur % 60).padStart(2, '0')}`,
      why: t.dueDate && t.dueDate < today ? 'Está atrasada' : t.dueDate === today ? 'Vence hoje' : t.priority === 'high' ? 'Prioridade alta' : 'Próxima da fila' });
    cur += t.priority === 'high' ? 90 : 60;
  }
  return { items: items.sort((a, b) => a.start.localeCompare(b.start)), text: picks.length ? 'Comece pelo que está atrasado e deixe as tarefas leves para o fim do dia.' : 'Nada pendente: dia livre para adiantar algo importante ou descansar.' };
}

export async function makePlan(user) {
  const uid = user.id;
  const today = localDate();
  const projects = Object.fromEntries(mine('projects', uid).map((p) => [p.id, p.name]));
  const open = mine('tasks', uid).filter((t) => t.status !== 'done').slice(0, 40)
    .map((t) => ({ id: t.id, titulo: t.title, projeto: projects[t.projectId], prioridade: t.priority, prazo: t.dueDate, status: t.status, adiada: t.postponed || 0 }));
  if (!hasCloud() || !open.length) return { ...planHeuristic(uid), source: 'regras' };
  const lastClose = mine('dayClose', uid).sort((a, b) => b.date.localeCompare(a.date))[0];
  const s = prefs(uid);
  try {
    const r = await geminiJSON(`Monte o plano de hoje (${today}, agora ${hmNow()}) para o usuário. Encerramento do dia às ${s.dayCloseTime || '21:30'}.
Tarefas abertas: ${JSON.stringify(open)}
Agenda de hoje: ${JSON.stringify(mine('agenda', uid).filter((a) => a.date === today && !a.done).map((a) => ({ titulo: a.title, hora: a.time })))}
Hábitos pendentes: ${briefing(uid).habits.filter((h) => !h.done).map((h) => h.name).join(', ') || 'nenhum'}
Energia/humor do último encerramento: ${lastClose ? `energia ${lastClose.energy}/5, humor ${lastClose.mood}` : 'sem registro'}
Ele também trabalha como motorista de aplicativo (InDrive); deixe uma janela para rodar se fizer sentido.
Escolha no máximo 6 itens realistas, do horário atual em diante, com o mais importante primeiro.
Responda só JSON: {"itens":[{"taskId":"id da tarefa ou vazio","titulo":"...","inicio":"HH:MM","porque":"motivo curto"}],"dica":"uma frase motivadora e prática"}`);
    const ids = new Set(open.map((t) => t.id));
    const items = (r.itens || []).slice(0, 8).map((i) => ({ type: ids.has(i.taskId) ? 'task' : 'livre', taskId: ids.has(i.taskId) ? i.taskId : null, title: String(i.titulo || '').slice(0, 160),
      start: /^\d{2}:\d{2}$/.test(i.inicio || '') ? i.inicio : '', why: String(i.porque || '').slice(0, 160) })).filter((i) => i.title);
    if (!items.length) throw new Error('a IA não devolveu itens'); // volta para as regras locais
    return { items: items.sort((a, b) => (a.start || '99').localeCompare(b.start || '99')), text: String(r.dica || '').slice(0, 300), source: 'ia' };
  } catch (err) {
    console.error('[plano]', err.message);
    return { ...planHeuristic(uid), source: 'regras' };
  }
}

// ---------------- Revisão semanal ----------------
export function weekData(uid) {
  const today = localDate();
  const from = addDays(today, -6);
  const inWeek = (d) => d && d.slice(0, 10) >= from && d.slice(0, 10) <= today;
  const tasks = mine('tasks', uid);
  const done = tasks.filter((t) => t.status === 'done' && inWeek(t.completedAt));
  const money = mine('money', uid).filter((m) => inWeek(m.date));
  const inc = money.filter((m) => m.amount > 0).reduce((a, m) => a + m.amount, 0);
  const exp = -money.filter((m) => m.amount < 0).reduce((a, m) => a + m.amount, 0);
  const byCat = {};
  for (const m of money.filter((x) => x.amount < 0)) byCat[m.category || 'Outros'] = (byCat[m.category || 'Outros'] || 0) - m.amount;
  const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
  const ind = financeTotals(uid, from, today);
  const shifts = mine('shifts', uid).filter((s) => s.end && inWeek(s.start));
  const hours = shifts.reduce((a, s) => a + (new Date(s.end) - new Date(s.start)) / 3600000, 0);
  const reading = mine('studyLog', uid).filter((l) => l.area === 'livros' && inWeek(l.date)).reduce((a, l) => a + l.minutes, 0);
  const study = mine('studyLog', uid).filter((l) => l.area !== 'livros' && inWeek(l.date)).reduce((a, l) => a + l.minutes, 0);
  const habits = mine('habits', uid).map((h) => `${h.name}: ${h.days.filter((d) => inWeek(d)).length}/7 dias (sequência ${streak(h.days)})`);
  const next = tasks.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate > today && t.dueDate <= addDays(today, 7)).map((t) => `${t.title} (${dmy(t.dueDate)})`);
  const late = tasks.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate <= today).length;
  const bills = mine('bills', uid).filter((b) => !b.paid && b.due && b.due <= addDays(today, 7)).map((b) => `${b.name} ${b.amount ? brl(b.amount) : ''} (${dmy(b.due)})`);
  return [
    `Semana de ${dmy(from)} a ${dmy(today)}.`,
    `Tarefas concluídas: ${done.length}${done.length ? ` (${done.slice(0, 6).map((t) => t.title).join('; ')})` : ''}. Atrasadas agora: ${late}.`,
    `Finanças pessoais: entradas ${brl(inc)}, saídas ${brl(exp)}, saldo ${brl(inc - exp)}${topCat ? `; maior gasto em ${topCat[0]} (${brl(topCat[1])})` : ''}.`,
    ind?.count ? `InDrive: entradas ${brl(ind.in)}, saídas ${brl(ind.out)}, lucro ${brl(ind.net)}, ${ind.km || 0} km${hours ? `, ${hours.toFixed(1).replace('.', ',')} h de turno (${brl(ind.net / hours)}/h)` : ''}.` : 'InDrive: sem lançamentos na semana.',
    `Leitura: ${reading} min. Outros estudos: ${study} min.`,
    habits.length ? `Hábitos: ${habits.join('; ')}.` : '',
    next.length ? `Próximos 7 dias: ${next.slice(0, 6).join('; ')}.` : 'Sem prazos marcados para os próximos 7 dias.',
    bills.length ? `Contas a vencer: ${bills.join('; ')}.` : '',
  ].filter(Boolean).join('\n');
}

export async function sendWeeklyReview(user) {
  const data = weekData(user.id);
  let text = await aiWrite(user, null, 'É domingo à noite: escreva a revisão da semana do usuário. Comece com o que foi bom (comemore conquistas concretas), depois o que pode melhorar e termine com 2 ou 3 focos para a próxima semana. Pode usar parágrafos curtos; cite números importantes.', data, 2500);
  if (!text) text = `📊 Revisão da semana\n\n${data}`;
  deliverMessage(user, null, text, { kind: 'revisao' });
  notify(user.id, { type: 'system', key: `review:${localDate()}`, title: '📊 Sua revisão da semana chegou', message: 'Veja o resumo da semana e os focos para a próxima no chat do assistente.', link: '#/assistente' });
}

// ---------------- Sugestão de turno ----------------
export function shiftSuggestion(uid) {
  if (mine('shifts', uid).some((s) => !s.end)) return { suggest: false };
  if (meta(uid).shiftDismiss === localDate()) return { suggest: false };
  const closed = mine('shifts', uid).filter((s) => s.end).sort((a, b) => b.start.localeCompare(a.start)).slice(0, 30);
  if (closed.length < 3) return { suggest: false };
  const wd = new Date().getDay();
  const same = closed.filter((s) => new Date(s.start).getDay() === wd);
  const pool = same.length >= 2 ? same : closed;
  const mins = pool.map((s) => { const d = new Date(s.start); return d.getHours() * 60 + d.getMinutes(); }).sort((a, b) => a - b);
  const med = mins[Math.floor(mins.length / 2)];
  const cur = new Date().getHours() * 60 + new Date().getMinutes();
  const usual = `${String(Math.floor(med / 60)).padStart(2, '0')}:${String(med % 60).padStart(2, '0')}`;
  if (cur < med - 45 || cur > med + 60) return { suggest: false, usual };
  const t = financeTotals(uid, localDate(), localDate());
  return { suggest: true, usual, message: `Você costuma começar a rodar por volta das ${usual}${same.length >= 2 ? ' nesse dia da semana' : ''}. Quer iniciar o turno agora?${t?.count ? ` Hoje já entrou ${brl(t.in)}.` : ''}` };
}

// ---------------- Grupos comentam o dia (à noite) ----------------
async function observeGroups(user) {
  const st = db().threads[user.id];
  if (!st || !hasCloud()) return;
  const today = localDate();
  for (const conv of st.conversations.filter((c) => c.group?.observe)) {
    const time = conv.group.observeTime || '21:00';
    if (hmNow() < time || conv.group.observedOn === today) continue;
    conv.group.observedOn = today;
    save();
    const members = groupMembers(user, conv);
    if (!members.length) continue;
    const order = members.sort(() => Math.random() - 0.5).slice(0, Math.min(3, members.length));
    const day = `${briefing(user.id).text}\n${focusData(user, 'indrive')}\n${focusData(user, 'habitos')}`;
    const before = conv.display.length;
    for (const [i, bot] of order.entries()) {
      try {
        await groupTurn(user, conv, bot, members, () => {}, i === 0
          ? `É noite. Comentem o dia do usuário com base nestes dados reais, como amigos num grupo (elogiem, brinquem, deem um conselho): ${day}\n`
          : '');
      } catch (err) { console.error('[grupo noturno]', err.message); break; }
    }
    const added = conv.display.length - before;
    if (added > 0) {
      conv.unread = (conv.unread || 0) + added;
      save();
      const last = conv.display.at(-1);
      const bot = members.find((m) => m.id === last.botId);
      deliverHookOnly(user, conv, bot, last.text);
    }
  }
}
function deliverHookOnly(user, conv, bot, text) {
  announceDelivery(user, { conversationId: conv.id, botId: bot?.id || null, name: `${bot?.name || 'Grupo'} · ${conv.group.name}`, avatar: bot?.avatar || null, color: bot?.color, text: text.slice(0, 200) }, text);
}

// ---------------- Cápsula do tempo ----------------
async function openCapsules(user) {
  const today = localDate();
  for (const c of mine('capsules', user.id).filter((x) => !x.opened && x.openAt && x.openAt <= today)) {
    c.opened = true;
    c.openedAt = now();
    save();
    const bot = botFor(user, c.botId);
    const wrote = dmy(c.createdAt.slice(0, 10));
    const reflection = await aiWrite(user, bot, `Você está entregando uma CÁPSULA DO TEMPO que o usuário escreveu para si mesmo em ${wrote}, para abrir hoje. Primeiro diga com emoção que chegou a cápsula, depois transcreva a carta exatamente entre aspas, e por fim faça uma reflexão curta comparando o que ele escreveu com a vida dele hoje (use os dados).\n\nTítulo: ${c.title}\nCarta:\n${c.text}`, focusData(user, 'geral'), 3000);
    const text = reflection || `📦 Chegou sua cápsula do tempo, escrita em ${wrote}: "${c.title}"\n\n"${c.text}"\n\nComo você se sente lendo isso hoje?`;
    deliverMessage(user, bot, text, { kind: 'capsula' });
    notify(user.id, { type: 'system', key: `capsule:${c.id}`, title: '📦 Sua cápsula do tempo abriu', message: c.title, link: '#/assistente' });
  }
}

// ---------------- agendador ----------------
let tickBusy = false;
export async function automationTick() {
  if (tickBusy) return;
  tickBusy = true;
  try {
    await runRules();
    for (const user of db().users) {
      const s = prefs(user.id);
      const m = meta(user.id);
      // revisão semanal: domingo, a partir do horário de encerramento do dia
      if (new Date().getDay() === 0 && hmNow() >= (s.dayCloseTime || '21:30') && m.lastReview !== localDate() && s.weeklyReview !== false) {
        m.lastReview = localDate();
        save();
        await sendWeeklyReview(user).catch((e) => console.error('[revisão]', e.message));
      }
      await observeGroups(user).catch((e) => console.error('[grupo noturno]', e.message));
      await openCapsules(user).catch((e) => console.error('[cápsula]', e.message));
    }
  } finally { tickBusy = false; }
}

// ---------------- rotas ----------------
const router = express.Router();
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

router.get('/automations/meta', (_req, res) => res.json({ triggers: TRIGGERS, areas: AREA_OF_TRIGGER }));
router.post('/rules/:id/run', async (req, res) => {
  const r = db().rules.find((x) => x.id === req.params.id && x.userId === req.user.id);
  if (!r) return bad(res, 'Rotina não encontrada', 404);
  const hit = checkRule(req.user, { ...r, fired: [], time: '00:00' });
  const data = hit?.data || focusData(req.user, r.focus || 'geral');
  try { res.json(await fireRule(req.user, r, data, true)); } catch (err) { bad(res, err.message, 500); }
});

router.get('/money/recurring', (req, res) => res.json(recurringSuggestions(req.user.id)));
router.post('/money/recurring/ignore', (req, res) => {
  const k = String(req.body?.key || '').slice(0, 80);
  const m = meta(req.user.id);
  m.recurringIgnore = [...new Set([...(m.recurringIgnore || []), k])].slice(-200);
  save();
  res.json({ ok: true });
});

router.get('/plan', (req, res) => {
  const p = meta(req.user.id).plan;
  res.json(p && p.date === localDate() ? p : null);
});
router.post('/plan', async (req, res) => {
  try { res.json(await makePlan(req.user)); } catch (err) { bad(res, err.message, 500); }
});
router.put('/plan', (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 10) : [];
  const ids = new Set(mine('tasks', req.user.id).map((t) => t.id));
  const clean = items.map((i) => ({ type: i.type === 'task' && ids.has(i.taskId) ? 'task' : i.type === 'agenda' ? 'agenda' : 'livre', taskId: ids.has(i.taskId) ? i.taskId : null,
    title: String(i.title || '').slice(0, 160), start: /^\d{2}:\d{2}$/.test(i.start || '') ? i.start : '', why: String(i.why || '').slice(0, 160), done: Boolean(i.done) })).filter((i) => i.title);
  // aceitar o plano: as tarefas escolhidas passam a ter prazo hoje (se não tinham ou era mais tarde)
  if (req.body?.accept) {
    const today = localDate();
    for (const i of clean.filter((x) => x.taskId)) {
      const t = db().tasks.find((x) => x.id === i.taskId);
      if (t && (!t.dueDate || t.dueDate > today)) { t.dueDate = today; t.updatedAt = now(); }
    }
    logEvent(req.user.id, 'task', 'plan', `Plano do dia aceito (${clean.length} itens)`, { link: '#/dashboard' });
  }
  meta(req.user.id).plan = { date: localDate(), items: clean, text: String(req.body?.text || '').slice(0, 300), acceptedAt: now() };
  save();
  res.json(meta(req.user.id).plan);
});

router.get('/review/week', (req, res) => res.json({ text: weekData(req.user.id) }));
router.post('/review/week', async (req, res) => { await sendWeeklyReview(req.user); res.json({ ok: true }); });

router.get('/shifts/suggest', (req, res) => res.json(shiftSuggestion(req.user.id)));
router.post('/shifts/suggest/dismiss', (req, res) => { meta(req.user.id).shiftDismiss = localDate(); save(); res.json({ ok: true }); });

// Debate de decisão: personagens defendem, criticam e votam nas alternativas.
const DEFAULT_DEBATERS = [
  { name: 'Otimista', personality: 'divertido', traits: 'Vê as oportunidades e defende o que pode dar certo.' },
  { name: 'Advogado do diabo', personality: 'profissional', traits: 'Questiona tudo e aponta os furos de cada opção.' },
  { name: 'Analista de riscos', personality: 'mentor', traits: 'Calcula riscos, custos e o pior cenário realista.' },
];
router.post('/decisions/:id/debate', async (req, res) => {
  const d = db().decisions.find((x) => x.id === req.params.id && x.userId === req.user.id);
  if (!d) return bad(res, 'Decisão não encontrada', 404);
  if (!hasCloud()) return bad(res, 'O debate precisa de uma IA na nuvem ligada (Configurações → Assistente).');
  if ((d.alternatives || []).filter((a) => a.name).length < 2) return bad(res, 'Cadastre pelo menos 2 alternativas antes do debate.');
  const chosen = (Array.isArray(req.body?.bots) ? req.body.bots : []).map((bid) => db().bots.find((b) => b.id === bid && b.userId === req.user.id)).filter(Boolean).slice(0, 4);
  const debaters = chosen.length >= 2 ? chosen : DEFAULT_DEBATERS;
  const alts = d.alternatives.filter((a) => a.name);
  try {
    const r = await geminiJSON(`Simule um debate entre conselheiros sobre uma decisão do usuário. Português do Brasil, falas naturais e curtas (1 a 3 frases), cada um fiel ao seu jeito, respondendo uns aos outros pelo nome.
Decisão: ${d.title}
Contexto: ${d.problem || '-'}
Alternativas: ${JSON.stringify(alts.map((a) => ({ nome: a.name, vantagens: a.pros, desvantagens: a.cons, riscos: a.risks, consequencias: a.consequences })))}
Critérios (peso 1-5): ${JSON.stringify((d.criteria || []).map((c) => ({ nome: c.name, peso: c.weight })))}
Conselheiros: ${JSON.stringify(debaters.map((b) => ({ nome: b.name, personalidade: PERSONALITY_LABELS[b.personality] || b.personality, jeito: b.traits || '' })))}
Dados atuais do usuário (use se ajudar): ${focusData(req.user, 'financas').slice(0, 800)}
Gere de 6 a 9 falas alternando os conselheiros; depois cada um vota em UMA alternativa (use exatamente o nome dela) com o motivo; por fim um resumo neutro do que pesa mais.
Responda só JSON: {"falas":[{"nome":"","texto":""}],"votos":[{"nome":"","escolha":"","motivo":""}],"resumo":""}`, 4000);
    const names = new Set(debaters.map((b) => b.name));
    const altNames = alts.map((a) => a.name);
    const debate = {
      at: now(), debaters: debaters.map((b) => ({ id: b.id || null, name: b.name, avatar: b.avatar || null, color: b.color || null })),
      lines: (r.falas || []).filter((f) => f.texto).slice(0, 12).map((f) => ({ name: names.has(f.nome) ? f.nome : debaters[0].name, text: String(f.texto).slice(0, 600) })),
      votes: (r.votos || []).slice(0, 6).map((v) => ({ name: String(v.nome || ''), choice: altNames.find((n) => norm(n) === norm(v.escolha)) || String(v.escolha || ''), reason: String(v.motivo || '').slice(0, 300) })),
      summary: String(r.resumo || '').slice(0, 800),
    };
    d.debate = debate;
    d.updatedAt = now();
    save();
    logEvent(req.user.id, 'decision', 'debate', `Debate sobre "${d.title}"`, { link: `#/decisoes/${d.id}` });
    res.json(debate);
  } catch (err) { bad(res, `O debate não saiu agora: ${err.message}`, 502); }
});

// Exportar / importar personagem (com a foto embutida)
router.get('/bots/:id/export', (req, res) => {
  const b = db().bots.find((x) => x.id === req.params.id && x.userId === req.user.id);
  if (!b) return bad(res, 'Personagem não encontrado', 404);
  let avatar = null;
  if (b.avatar) {
    const f = path.join(UPLOAD_DIR, path.basename(b.avatar));
    if (fs.existsSync(f)) avatar = `data:image/${path.extname(f).slice(1).replace('jpg', 'jpeg')};base64,${fs.readFileSync(f).toString('base64')}`;
  }
  const { name, personality, traits, greeting, color, focus, voice, voiceRate, voicePitch, permissions } = b;
  const safe = name.replace(/[^\w-]+/g, '_').slice(0, 40) || 'personagem';
  res.set('Content-Disposition', `attachment; filename="${safe}.codeniac-personagem.json"`);
  res.json({ codeniac: 'personagem', version: 1, exportedAt: now(), bot: { name, personality, traits, greeting, color, focus, voice, voiceRate, voicePitch, permissions }, avatar });
});
router.post('/bots/import', (req, res) => {
  const data = req.body || {};
  if (data.codeniac !== 'personagem' || !data.bot?.name) return bad(res, 'Arquivo inválido: não é um personagem do Codeniac');
  const s = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  let avatar = null;
  const m = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(data.avatar || '');
  if (m) {
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length <= 8 * 1024 * 1024) {
      const file = `${id()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, file), buf);
      avatar = `/uploads/${file}`;
    }
  }
  const b = data.bot;
  const PERS = Object.keys(PERSONALITY_LABELS);
  const bot = { id: id(), userId: req.user.id, name: s(b.name, 40), avatar, personality: PERS.includes(b.personality) ? b.personality : 'amigavel', traits: s(b.traits, 2000), greeting: s(b.greeting, 400),
    color: /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : '#7c3aed', focus: s(b.focus, 20) || 'geral', voice: s(b.voice, 120), voiceRate: Number(b.voiceRate) || null, voicePitch: Number(b.voicePitch) || null,
    permissions: Array.isArray(b.permissions) ? b.permissions.map(String).slice(0, 12) : null, proactive: false, times: '', createdAt: now(), updatedAt: now() };
  db().bots.push(bot);
  save();
  logEvent(req.user.id, 'system', 'create', `Personagem importado: ${bot.name}`, { link: '#/assistente' });
  res.status(201).json(bot);
});

export default router;
export { NIAC };
