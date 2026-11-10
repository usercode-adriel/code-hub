// Rotas da rotina (1.3): agenda, hábitos, caixa de entrada, decisões, diário, garagem, estudos,
// financeiro pessoal, central de acontecimentos, briefing e detector de procrastinação.
import os from 'node:os';
import express from 'express';
import { db, id, now, save, localDate } from '../db.js';
import { logEvent, notify } from '../notify.js';
import { briefing, procrastination, financeTotals, indrivePage, serviceStatus, nextOccurrence, streak, prefs } from '../briefing.js';

const router = express.Router();
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const brl = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const addDays = (date, n) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + n); return localDate(d); };

// ---------- Validadores ----------
const F = {
  str: (n) => (v) => (typeof v === 'string' ? v.trim().slice(0, n) : v == null ? '' : undefined),
  date: (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : v === '' || v == null ? null : undefined),
  time: (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(v || '') ? v : v === '' || v == null ? null : undefined),
  num: (v) => {
    if (v === '' || v == null) return null;
    const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) && Math.abs(n) < 1e9 ? Math.round(n * 100) / 100 : undefined;
  },
  int: (min, max) => (v) => (v === '' || v == null ? null : Number.isInteger(Number(v)) && Number(v) >= min && Number(v) <= max ? Number(v) : undefined),
  bool: (v) => Boolean(v),
  oneOf: (...l) => (v) => (v == null || v === '' ? null : l.includes(v) ? v : undefined),
  arr: (n) => (v) => (Array.isArray(v) ? v.slice(0, n).map((x) => String(x).trim().slice(0, 60)).filter(Boolean) : undefined),
  img: (v) => (v == null || v === '' ? null : /^\/uploads\/[\w.-]+$/.test(v) ? v : undefined),
  json: (max) => (v) => { if (v == null) return null; const s = JSON.stringify(v); return s.length <= max ? JSON.parse(s) : undefined; },
};
// Personagens do assistente (criar chat): nome, foto, personalidade e características.
const MOODS = ['otimo', 'bem', 'neutro', 'cansado', 'mal'];

// Coleções com CRUD genérico: campos válidos, obrigatórios, rótulo para o feed e valores iniciais.
const COLL = {
  agenda: { kind: 'agenda', label: 'Compromisso', title: 'title', link: '#/hoje', required: ['title', 'date'],
    fields: { title: F.str(160), date: F.date, time: F.time, place: F.str(120), notes: F.str(1000), done: F.bool } },
  habits: { kind: 'habit', label: 'Hábito', title: 'name', link: '#/hoje', required: ['name'], init: () => ({ days: [] }),
    fields: { name: F.str(60), icon: F.str(8) } },
  inbox: { kind: 'inbox', label: 'Captura', title: 'text', link: '#/hoje', required: ['text'],
    fields: { text: F.str(2000), kind: F.oneOf('ideia', 'tarefa', 'nota', 'link'), url: F.str(800), done: F.bool } },
  decisions: { kind: 'decision', label: 'Decisão', title: 'title', link: '#/decisoes', required: ['title'], quietUpdate: true,
    fields: { title: F.str(160), problem: F.str(4000), alternatives: F.json(20000), criteria: F.json(10000), scores: F.json(30000),
      analysis: F.json(40000), guide: F.json(20000), chosen: F.str(64), reviewAt: F.date, review: F.json(4000), status: F.oneOf('rascunho', 'decidida', 'avaliada') } },
  journal: { kind: 'journal', label: 'Página do diário', title: 'title', link: '#/diario', required: ['date'], quietUpdate: true,
    fields: { date: F.date, title: F.str(160), mood: F.oneOf(...MOODS), weather: F.oneOf('sol', 'nublado', 'chuva', 'tempestade', 'neve', 'vento'),
      text: F.str(30000), gratitude: F.str(2000), lesson: F.str(2000), tomorrow: F.str(2000), sketch: F.oneOf('montanhas', 'fogueira', 'cavalo', 'cacto', 'lua', 'trem') } },
  dayClose: { kind: 'journal', label: 'Encerramento do dia', title: 'date', link: '#/hoje', required: ['date'],
    fields: { date: F.date, did: F.str(2000), blocked: F.str(2000), energy: F.int(1, 5), mood: F.oneOf(...MOODS) } },
  fuel: { kind: 'garage', label: 'Abastecimento', title: 'station', link: '#/garagem', required: ['date', 'liters'],
    fields: { date: F.date, liters: F.num, price: F.num, total: F.num, km: F.num, full: F.bool, station: F.str(80) } },
  services: { kind: 'garage', label: 'Manutenção', title: 'name', link: '#/garagem', required: ['name'],
    fields: { name: F.str(80), everyKm: F.num, everyDays: F.int(1, 3650), lastKm: F.num, lastDate: F.date, notes: F.str(500) } },
  docs: { kind: 'garage', label: 'Documento', title: 'name', link: '#/garagem', required: ['name', 'due'],
    fields: { name: F.str(80), due: F.date, notes: F.str(500) } },
  shifts: { kind: 'garage', label: 'Turno', title: 'notes', link: '#/garagem', required: [],
    fields: { notes: F.str(500), startKm: F.num, endKm: F.num } },
  cards: { kind: 'study', label: 'Cartão de inglês', title: 'front', link: '#/estudos', required: ['front'],
    init: () => ({ ease: 2.5, interval: 0, reps: 0, lapses: 0, due: localDate() }),
    fields: { deck: F.str(40), front: F.str(600), back: F.str(600), example: F.str(600) } },
  snippets: { kind: 'study', label: 'Snippet', title: 'title', link: '#/estudos/programacao', required: ['title'],
    fields: { title: F.str(120), lang: F.str(24), code: F.str(30000), tags: F.arr(12), notes: F.str(1000) } },
  trail: { kind: 'study', label: 'Etapa da trilha', title: 'title', link: '#/estudos/programacao', required: ['title'],
    fields: { title: F.str(160), area: F.str(40), done: F.bool, order: F.int(0, 9999), notes: F.str(1000) } },
  books: { kind: 'study', label: 'Livro', title: 'title', link: '#/livros', required: ['title'],
    fields: { title: F.str(160), author: F.str(120), cover: F.img, category: F.str(40), status: F.oneOf('quero', 'lendo', 'lido'), pages: F.int(0, 20000), current: F.int(0, 20000),
      startedAt: F.date, finishedAt: F.date, rating: F.int(0, 5), quotes: F.json(30000), notes: F.str(4000) } },
  studyLog: { kind: 'study', label: 'Sessão de estudo', title: 'area', link: '#/estudos', required: ['minutes'],
    fields: { area: F.oneOf('ingles', 'programacao', 'livros', 'foco', 'outro'), minutes: F.int(1, 1440), date: F.date, note: F.str(300) } },
  enJournal: { kind: 'study', label: 'Diário em inglês', title: 'date', link: '#/estudos', required: ['text'], quietUpdate: true,
    fields: { date: F.date, text: F.str(30000) } },
  bots: { kind: 'system', label: 'Personagem do chat', title: 'name', link: '#/assistente', required: ['name'],
    fields: { name: F.str(40), avatar: F.img, personality: F.oneOf('amigavel', 'profissional', 'divertido', 'mentor', 'zen', 'nerd'),
      traits: F.str(2000), greeting: F.str(400), color: F.str(9) } },
  money: { kind: 'money', label: 'Lançamento', title: 'desc', link: '#/financeiro', required: ['date', 'desc', 'amount'],
    fields: { date: F.date, desc: F.str(160), amount: F.num, category: F.str(40), account: F.str(40), notes: F.str(500) } },
  bills: { kind: 'money', label: 'Conta a pagar', title: 'name', link: '#/financeiro', required: ['name', 'due'],
    fields: { name: F.str(80), amount: F.num, due: F.date, cycle: F.oneOf('once', 'monthly', 'yearly'), category: F.str(40), paid: F.bool, notes: F.str(500) } },
  subscriptions: { kind: 'money', label: 'Assinatura', title: 'name', link: '#/financeiro', required: ['name', 'amount'],
    fields: { name: F.str(80), amount: F.num, cycle: F.oneOf('monthly', 'yearly'), nextCharge: F.date, category: F.str(40), active: F.bool, notes: F.str(500) } },
};

function clean(coll, body, partial) {
  const spec = COLL[coll];
  const out = {};
  for (const [k, fn] of Object.entries(spec.fields)) {
    if (!(k in body)) continue;
    const v = fn(body[k]);
    if (v === undefined) throw new Error(`Valor inválido em "${k}"`);
    out[k] = v;
  }
  if (!partial) for (const r of spec.required) if (out[r] == null || out[r] === '') throw new Error(`Preencha o campo "${r}"`);
  return out;
}

const mine = (coll, uid) => db()[coll].filter((x) => x.userId === uid);
const owned = (coll, itemId, uid) => db()[coll].find((x) => x.id === itemId && x.userId === uid);

// Categorias automáticas para lançamentos sem categoria (importação de extrato e comandos).
const AUTO_CAT = [
  [/mercad|supermerc|atacad|assai|carrefour|hortifruti|padaria/i, 'Mercado'],
  [/ifood|rappi|restaurante|lanchon|pizza|burger|cafe|almoço|almoco/i, 'Alimentação'],
  [/posto|combust|gasolina|etanol|shell|ipiranga|petrobras|br mania/i, 'Combustível'],
  [/uber|99app|99 pop|onibus|ônibus|metro|metrô|estacionamento|pedagio|pedágio/i, 'Transporte'],
  [/netflix|spotify|prime|disney|hbo|max\b|youtube|apple\.com|google\s*one|deezer|globoplay/i, 'Assinaturas'],
  [/farmac|drogar|droga|hospital|clinica|clínica|médic|medic|dentist/i, 'Saúde'],
  [/aluguel|condominio|condomínio|energia|enel|cemig|light|copel|sabesp|agua|água|gás|gas\b/i, 'Moradia'],
  [/vivo|claro|tim\b|oi\b|internet|telefone/i, 'Telefone/Internet'],
  [/pix recebido|salario|salário|transferencia recebida|transferência recebida|indrive|rendimento/i, 'Receita'],
  [/escola|curso|faculdade|udemy|alura|livro|livraria/i, 'Educação'],
  [/cinema|show|bar\b|lazer|jogo|steam|playstation|xbox/i, 'Lazer'],
];
export const guessCategory = (text, amount = -1) => (AUTO_CAT.find(([re]) => re.test(text)) || [null, amount > 0 ? 'Receita' : 'Outros'])[1];

// ---------- CRUD genérico ----------
router.get('/c/:coll', (req, res) => {
  const { coll } = req.params;
  if (!COLL[coll]) return bad(res, 'Coleção desconhecida', 404);
  const list = mine(coll, req.user.id).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  res.json(list);
});

router.post('/c/:coll', (req, res) => {
  const { coll } = req.params;
  const spec = COLL[coll];
  if (!spec) return bad(res, 'Coleção desconhecida', 404);
  try {
    const item = { id: id(), userId: req.user.id, ...(spec.init?.() || {}), ...clean(coll, req.body || {}), createdAt: now(), updatedAt: now() };
    if (coll === 'money' && !item.category) item.category = guessCategory(item.desc, item.amount);
    if (coll === 'inbox' && !item.kind) item.kind = /^https?:\/\//.test(item.text) ? 'link' : 'ideia';
    if (coll === 'inbox' && item.kind === 'link' && !item.url && /^https?:\/\//.test(item.text)) item.url = item.text;
    db()[coll].push(item);
    save();
    logEvent(req.user.id, spec.kind, 'create', `${spec.label}: ${String(item[spec.title] || '').slice(0, 80) || 'novo'}`, { link: spec.link,
      detail: coll === 'money' ? brl(item.amount) : '' });
    res.status(201).json(item);
  } catch (e) { bad(res, e.message); }
});

router.put('/c/:coll/:id', (req, res) => {
  const { coll } = req.params;
  const spec = COLL[coll];
  if (!spec) return bad(res, 'Coleção desconhecida', 404);
  const item = owned(coll, req.params.id, req.user.id);
  if (!item) return bad(res, 'Item não encontrado', 404);
  try {
    Object.assign(item, clean(coll, req.body || {}, true), { updatedAt: now() });
    save();
    logEvent(req.user.id, spec.kind, 'update', `${spec.label} editado: ${String(item[spec.title] || '').slice(0, 80)}`, { link: spec.link, merge: `${coll}:${item.id}` });
    res.json(item);
  } catch (e) { bad(res, e.message); }
});

router.delete('/c/:coll/:id', (req, res) => {
  const { coll } = req.params;
  const spec = COLL[coll];
  if (!spec) return bad(res, 'Coleção desconhecida', 404);
  const item = owned(coll, req.params.id, req.user.id);
  if (!item) return bad(res, 'Item não encontrado', 404);
  db()[coll] = db()[coll].filter((x) => x !== item);
  save();
  logEvent(req.user.id, spec.kind, 'delete', `${spec.label} excluído: ${String(item[spec.title] || '').slice(0, 80)}`);
  res.json({ ok: true });
});

// ---------- Hábitos ----------
router.post('/habits/:id/toggle', (req, res) => {
  const h = owned('habits', req.params.id, req.user.id);
  if (!h) return bad(res, 'Hábito não encontrado', 404);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.date || '') ? req.body.date : localDate();
  const had = h.days.includes(date);
  h.days = had ? h.days.filter((d) => d !== date) : [...h.days, date].slice(-800);
  save();
  if (!had) logEvent(req.user.id, 'habit', 'done', `Hábito "${h.name}" feito (sequência: ${streak(h.days)} dias)`, { link: '#/hoje' });
  res.json({ ...h, streak: streak(h.days) });
});

// ---------- Flashcards (repetição espaçada, variação do SM-2) ----------
router.post('/cards/:id/review', (req, res) => {
  const c = owned('cards', req.params.id, req.user.id);
  if (!c) return bad(res, 'Cartão não encontrado', 404);
  const grade = Number(req.body?.grade); // 0 errei · 1 difícil · 2 bom · 3 fácil
  if (![0, 1, 2, 3].includes(grade)) return bad(res, 'Nota inválida');
  const today = localDate();
  if (grade === 0) {
    c.reps = 0; c.lapses = (c.lapses || 0) + 1; c.interval = 0; c.ease = Math.max(1.3, (c.ease || 2.5) - 0.2); c.due = today;
  } else {
    c.reps = (c.reps || 0) + 1;
    if (c.reps === 1) c.interval = grade === 3 ? 3 : 1;
    else if (c.reps === 2) c.interval = grade === 1 ? 3 : grade === 3 ? 8 : 6;
    else c.interval = Math.max(c.interval + 1, Math.round(c.interval * (c.ease || 2.5) * (grade === 1 ? 0.8 : grade === 3 ? 1.3 : 1)));
    c.ease = Math.min(3.0, Math.max(1.3, (c.ease || 2.5) + (grade === 1 ? -0.15 : grade === 3 ? 0.15 : 0)));
    c.due = addDays(today, c.interval);
  }
  c.lastReview = now();
  save();
  logEvent(req.user.id, 'study', 'review', 'Revisão de flashcards de inglês', { link: '#/estudos', merge: `review:${today}` });
  res.json(c);
});

router.post('/cards/bulk', (req, res) => {
  const list = Array.isArray(req.body?.cards) ? req.body.cards.slice(0, 500) : [];
  const existing = new Set(mine('cards', req.user.id).map((c) => c.front.toLowerCase()));
  let added = 0;
  for (const raw of list) {
    try {
      const c = clean('cards', raw);
      if (existing.has(c.front.toLowerCase())) continue;
      existing.add(c.front.toLowerCase());
      db().cards.push({ id: id(), userId: req.user.id, ...COLL.cards.init(), ...c, createdAt: now(), updatedAt: now() });
      added++;
    } catch { /* ignora linha inválida */ }
  }
  save();
  if (added) logEvent(req.user.id, 'study', 'create', `${added} cartão(ões) de inglês adicionados`, { link: '#/estudos' });
  res.json({ added });
});

// ---------- Garagem: carro, turnos e resumo ----------
router.get('/garage', (req, res) => res.json(db().garage[req.user.id] || {}));
router.put('/garage', (req, res) => {
  const g = db().garage[req.user.id] || {};
  const b = req.body || {};
  if ('model' in b) g.model = String(b.model || '').slice(0, 80);
  for (const k of ['km', 'consumption', 'fuelPrice', 'dailyGoal', 'monthlyGoal']) if (k in b) g[k] = F.num(b[k]) ?? null;
  if (b.reserves && typeof b.reserves === 'object') {
    g.reserves = Object.fromEntries(Object.entries(b.reserves).slice(0, 8).map(([k, v]) => [String(k).slice(0, 30), Math.max(0, Math.min(100, Number(v) || 0))]));
  }
  db().garage[req.user.id] = g;
  save();
  logEvent(req.user.id, 'garage', 'update', 'Dados do carro atualizados', { link: '#/garagem', merge: 'garage' });
  res.json(g);
});

function periodOf(iso) {
  const h = new Date(iso).getHours();
  return h < 5 ? 'madrugada' : h < 12 ? 'manhã' : h < 18 ? 'tarde' : 'noite';
}

function shiftSummary(uid, s) {
  const page = indrivePage(uid);
  const end = s.end || now();
  const list = page ? db().finance.filter((f) => f.pageId === page.id && f.createdAt >= s.start && f.createdAt <= end) : [];
  const gross = list.filter((f) => f.type === 'in').reduce((a, f) => a + f.amount, 0);
  const costs = list.filter((f) => f.type === 'out').reduce((a, f) => a + f.amount, 0);
  const hours = Math.max((new Date(end) - new Date(s.start)) / 3600000, 0.01);
  const km = s.endKm != null && s.startKm != null ? Math.max(0, s.endKm - s.startKm) : list.reduce((a, f) => a + (f.km || 0), 0);
  const net = gross - costs;
  return { ...s, gross, costs, net, hours, km, rides: list.filter((f) => f.type === 'in' && f.category === 'Corrida').length,
    perHour: net / hours, perKm: km ? net / km : null, period: periodOf(s.start), running: !s.end };
}

router.get('/shifts', (req, res) => {
  const list = mine('shifts', req.user.id).sort((a, b) => b.start.localeCompare(a.start)).slice(0, 200).map((s) => shiftSummary(req.user.id, s));
  res.json(list);
});

router.post('/shifts/start', (req, res) => {
  if (mine('shifts', req.user.id).some((s) => !s.end)) return bad(res, 'Já existe um turno em andamento');
  const g = db().garage[req.user.id] || {};
  const s = { id: id(), userId: req.user.id, start: now(), end: null, startKm: F.num(req.body?.km) ?? (g.km ?? null), endKm: null, notes: '', createdAt: now() };
  db().shifts.push(s);
  save();
  logEvent(req.user.id, 'garage', 'start', 'Turno do InDrive iniciado', { link: '#/garagem' });
  res.status(201).json(shiftSummary(req.user.id, s));
});

router.post('/shifts/:id/stop', (req, res) => {
  const s = owned('shifts', req.params.id, req.user.id);
  if (!s || s.end) return bad(res, 'Turno não encontrado ou já encerrado', 404);
  s.end = now();
  const km = F.num(req.body?.km);
  if (km != null) {
    s.endKm = km;
    const g = db().garage[req.user.id] || {};
    if (!g.km || km > g.km) { g.km = km; db().garage[req.user.id] = g; }
  }
  save();
  const sum = shiftSummary(req.user.id, s);
  logEvent(req.user.id, 'garage', 'stop', `Turno encerrado: ${brl(sum.net)} em ${sum.hours.toFixed(1).replace('.', ',')} h (${brl(sum.perHour)}/h)`, { link: '#/garagem' });
  res.json(sum);
});

router.get('/garage/summary', (req, res) => {
  const uid = req.user.id;
  const g = db().garage[uid] || {};
  const today = localDate();
  const since = addDays(today, -90);
  // consumo: entre abastecimentos com km informado
  const fuels = mine('fuel', uid).filter((f) => f.km != null).sort((a, b) => a.km - b.km);
  const cons = [];
  for (let i = 1; i < fuels.length; i++) if (fuels[i].full && fuels[i].liters) cons.push((fuels[i].km - fuels[i - 1].km) / fuels[i].liters);
  const consumption = cons.length ? cons.slice(-5).reduce((a, b) => a + b, 0) / Math.min(5, cons.length) : (g.consumption || null);
  const fuelPrice = mine('fuel', uid).sort((a, b) => b.date.localeCompare(a.date)).find((f) => f.price)?.price || g.fuelPrice || null;
  const fuelPerKm = consumption && fuelPrice ? fuelPrice / consumption : null;
  // manutenção e outros custos do carro (saídas do InDrive, exceto combustível) por km rodado nos últimos 90 dias
  const page = indrivePage(uid);
  const outs = page ? db().finance.filter((f) => f.pageId === page.id && f.type === 'out' && f.date >= since) : [];
  const otherCosts = outs.filter((f) => !/combust/i.test(f.category)).reduce((a, f) => a + f.amount, 0);
  const kmWindow = (() => {
    const recent = fuels.filter((f) => f.date >= since);
    const byFuel = recent.length >= 2 ? recent.at(-1).km - recent[0].km : 0;
    const byShift = mine('shifts', uid).filter((s) => s.start.slice(0, 10) >= since && s.endKm != null && s.startKm != null).reduce((a, s) => a + (s.endKm - s.startKm), 0);
    const byEntries = page ? db().finance.filter((f) => f.pageId === page.id && f.date >= since && f.km).reduce((a, f) => a + f.km, 0) : 0;
    return Math.max(byFuel, byShift, byEntries);
  })();
  const otherPerKm = kmWindow ? otherCosts / kmWindow : null;
  // mapa de calor: ganhos por dia da semana × faixa de horário (pela hora em que a corrida foi registrada)
  const heat = Array.from({ length: 7 }, () => Array(6).fill(0));
  if (page) for (const f of db().finance.filter((x) => x.pageId === page.id && x.type === 'in')) {
    const d = new Date(f.createdAt);
    heat[d.getDay()][Math.floor(d.getHours() / 4)] += f.amount;
  }
  // turnos por período do dia
  const periods = {};
  for (const s of mine('shifts', uid).filter((x) => x.end).map((x) => shiftSummary(uid, x))) {
    const p = (periods[s.period] ??= { hours: 0, net: 0, count: 0 });
    p.hours += s.hours; p.net += s.net; p.count++;
  }
  // reservas: percentuais aplicados às entradas do mês e do total
  const month = financeTotals(uid, `${today.slice(0, 8)}01`, today) || { in: 0 };
  const total = financeTotals(uid, '0000-01-01', today) || { in: 0 };
  const reserves = Object.entries(g.reserves || { Manutenção: 10, IPVA: 5, Reserva: 5 }).map(([name, pct]) => ({ name, pct, month: month.in * pct / 100, total: total.in * pct / 100 }));
  const todayFin = financeTotals(uid, today, today) || { in: 0, out: 0, net: 0 };
  res.json({
    garage: g, consumption, fuelPrice, fuelPerKm, otherPerKm, costPerKm: (fuelPerKm || 0) + (otherPerKm || 0) || null, kmWindow,
    services: mine('services', uid).map((sv) => serviceStatus(sv, g)),
    docs: mine('docs', uid).map((x) => ({ ...x, days: Math.round((new Date(`${x.due}T12:00:00`) - new Date(`${today}T12:00:00`)) / 86400000) })).sort((a, b) => a.due.localeCompare(b.due)),
    heat, periods, reserves, today: todayFin, month: financeTotals(uid, `${today.slice(0, 8)}01`, today),
    fuelMonth: mine('fuel', uid).filter((f) => f.date.startsWith(today.slice(0, 7))).reduce((a, f) => a + (f.total || (f.liters || 0) * (f.price || 0)), 0),
  });
});

// ---------- Financeiro pessoal ----------
router.get('/budgets', (req, res) => res.json(db().budgets[req.user.id] || {}));
router.put('/budgets', (req, res) => {
  const b = {};
  for (const [k, v] of Object.entries(req.body || {}).slice(0, 40)) { const n = F.num(v); if (n && n > 0) b[String(k).slice(0, 40)] = n; }
  db().budgets[req.user.id] = b;
  save();
  logEvent(req.user.id, 'money', 'update', 'Orçamento mensal atualizado', { link: '#/financeiro', merge: 'budgets' });
  res.json(b);
});

router.post('/money/import', (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 3000) : [];
  const uid = req.user.id;
  const seen = new Set(mine('money', uid).map((m) => `${m.date}|${m.desc}|${m.amount}`));
  let added = 0; let skipped = 0;
  for (const r of rows) {
    try {
      const m = clean('money', { date: r.date, desc: r.desc, amount: r.amount, category: r.category || '' });
      const key = `${m.date}|${m.desc}|${m.amount}`;
      if (seen.has(key)) { skipped++; continue; }
      seen.add(key);
      db().money.push({ id: id(), userId: uid, ...m, category: m.category || guessCategory(m.desc, m.amount), source: 'csv', createdAt: now(), updatedAt: now() });
      added++;
    } catch { skipped++; }
  }
  save();
  if (added) logEvent(uid, 'money', 'import', `Extrato importado: ${added} lançamento(s)`, { link: '#/financeiro', detail: skipped ? `${skipped} ignorados (repetidos ou inválidos)` : '' });
  res.json({ added, skipped });
});

router.post('/bills/:id/pay', (req, res) => {
  const b = owned('bills', req.params.id, req.user.id);
  if (!b) return bad(res, 'Conta não encontrada', 404);
  const today = localDate();
  if (b.amount) db().money.push({ id: id(), userId: req.user.id, date: today, desc: b.name, amount: -Math.abs(b.amount), category: b.category || 'Contas', account: '', source: 'conta', createdAt: now(), updatedAt: now() });
  if (!b.cycle || b.cycle === 'once') b.paid = true;
  else {
    const d = new Date(`${b.due}T12:00:00`);
    if (b.cycle === 'monthly') d.setMonth(d.getMonth() + 1); else d.setFullYear(d.getFullYear() + 1);
    b.due = localDate(d); b.paid = false;
  }
  b.lastPaid = today;
  save();
  logEvent(req.user.id, 'money', 'pay', `Conta "${b.name}" paga${b.amount ? ` (${brl(b.amount)})` : ''}`, { link: '#/financeiro' });
  res.json(b);
});

router.get('/money/summary', (req, res) => {
  const uid = req.user.id;
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : localDate().slice(0, 7);
  const list = mine('money', uid).filter((m) => m.date.startsWith(month));
  const income = list.filter((m) => m.amount > 0).reduce((a, m) => a + m.amount, 0);
  const expense = -list.filter((m) => m.amount < 0).reduce((a, m) => a + m.amount, 0);
  const byCat = {};
  for (const m of list.filter((x) => x.amount < 0)) byCat[m.category || 'Outros'] = (byCat[m.category || 'Outros'] || 0) - m.amount;
  const last = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const indrive = financeTotals(uid, `${month}-01`, `${month}-${String(last).padStart(2, '0')}`);
  const subs = mine('subscriptions', uid).filter((s) => s.active !== false);
  const monthlySubs = subs.reduce((a, s) => a + (s.cycle === 'yearly' ? (s.amount || 0) / 12 : (s.amount || 0)), 0);
  const today = localDate();
  res.json({
    month, income, expense, balance: income - expense, byCat, budgets: db().budgets[uid] || {}, indrive,
    subscriptions: { monthly: monthlySubs, yearly: monthlySubs * 12, count: subs.length,
      upcoming: subs.map((s) => ({ ...s, next: nextOccurrence(s.nextCharge, s.cycle) })).filter((s) => s.next).sort((a, b) => a.next.localeCompare(b.next)) },
    bills: mine('bills', uid).filter((b) => !b.paid).sort((a, b) => (a.due || '').localeCompare(b.due || '')).map((b) => ({ ...b, late: b.due < today, days: Math.round((new Date(`${b.due}T12:00:00`) - new Date(`${today}T12:00:00`)) / 86400000) })),
    months: [...new Set(mine('money', uid).map((m) => m.date.slice(0, 7)))].sort().reverse().slice(0, 24),
  });
});

// ---------- Central de acontecimentos ----------
router.get('/events', (req, res) => {
  let list = db().events.filter((e) => e.userId === req.user.id);
  if (req.query.kind) list = list.filter((e) => e.kind === req.query.kind);
  if (req.query.q) { const q = String(req.query.q).toLowerCase(); list = list.filter((e) => `${e.title} ${e.detail}`.toLowerCase().includes(q)); }
  if (req.query.before) list = list.filter((e) => e.at < req.query.before);
  list = list.slice(-Math.min(Number(req.query.limit) || 100, 300)).reverse();
  res.json(list);
});

// ---------- Briefing, procrastinação e rede ----------
router.get('/briefing', (req, res) => res.json(briefing(req.user.id)));
router.get('/procrastination', (req, res) => res.json(procrastination(req.user.id)));

router.get('/network', (_req, res) => {
  const port = Number(process.env.PORT) || 3000;
  const addresses = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const it of list || []) {
      if ((it.family !== 'IPv4' && it.family !== 4) || it.internal || it.address.startsWith('169.254.')) continue;
      const [a, b] = it.address.split('.').map(Number);
      const kind = a === 100 && b >= 64 && b <= 127 ? 'tailscale'
        : /vethernet|virtual|vmware|vbox|hyper-v|docker|wsl|bluetooth/i.test(name) ? 'virtual'
          : /wi-?fi|wlan|wireless|sem fio/i.test(name) ? 'wifi' : /ethernet|^eth|^en\d|local/i.test(name) ? 'ethernet' : 'other';
      addresses.push({ ip: it.address, url: `http://${it.address}:${port}/`, iface: name, kind });
    }
  }
  const order = { wifi: 0, ethernet: 1, other: 2, tailscale: 3, virtual: 4 };
  addresses.sort((x, y) => order[x.kind] - order[y.kind]);
  res.json({ enabled: process.env.HOST === '0.0.0.0', port, hostname: os.hostname(), addresses });
});

// Lembretes do dia (chamado pelo agendador e também ao abrir a aba Hoje).
export function dailyReminders(uid) {
  const s = prefs(uid);
  const today = localDate();
  const soon = addDays(today, s.remindDaysBefore);
  for (const b of mine('bills', uid).filter((x) => !x.paid && x.due && x.due <= soon)) {
    notify(uid, { type: 'task', key: `bill:${b.id}:${b.due}:${b.due <= today ? 'hoje' : 'antes'}`, title: b.due < today ? 'Conta atrasada ⚠️' : b.due === today ? 'Conta vence hoje' : 'Conta a vencer',
      message: `${b.name}${b.amount ? ` — ${brl(b.amount)}` : ''} (vencimento ${b.due.split('-').reverse().join('/')})`, link: '#/financeiro' });
  }
  for (const x of mine('subscriptions', uid).filter((y) => y.active !== false)) {
    const next = nextOccurrence(x.nextCharge, x.cycle);
    if (next && next <= soon) notify(uid, { type: 'task', key: `sub:${x.id}:${next}`, title: 'Cobrança de assinatura chegando', message: `${x.name} — ${brl(x.amount)} em ${next.split('-').reverse().join('/')}`, link: '#/financeiro' });
  }
  for (const doc of mine('docs', uid).filter((y) => y.due)) {
    const days = Math.round((new Date(`${doc.due}T12:00:00`) - new Date(`${today}T12:00:00`)) / 86400000);
    for (const mark of [30, 7, 1, 0]) if (days === mark) notify(uid, { type: 'task', key: `doc:${doc.id}:${mark}`, title: 'Documento vencendo', message: `${doc.name} vence ${days ? `em ${days} dia(s)` : 'hoje'}.`, link: '#/garagem' });
  }
  const g = db().garage[uid] || {};
  for (const sv of mine('services', uid).map((x) => serviceStatus(x, g)).filter((x) => x.soon)) {
    notify(uid, { type: 'task', key: `svc:${sv.id}:${sv.lastKm}:${sv.lastDate}:${sv.late ? 'late' : 'soon'}`, title: sv.late ? 'Manutenção atrasada 🔧' : 'Manutenção chegando 🔧', message: sv.label, link: '#/garagem' });
  }
  for (const a of mine('agenda', uid).filter((x) => x.date === today && !x.done)) {
    notify(uid, { type: 'task', key: `agenda:${a.id}:${today}`, title: 'Compromisso hoje', message: `${a.time ? `${a.time} — ` : ''}${a.title}`, link: '#/hoje' });
  }
  for (const d of mine('decisions', uid).filter((x) => x.reviewAt && x.reviewAt <= today && !x.review)) {
    notify(uid, { type: 'task', key: `decision:${d.id}:${d.reviewAt}`, title: 'Hora de avaliar uma decisão', message: `Como foi a decisão "${d.title}"?`, link: `#/decisoes/${d.id}` });
  }
}

export default router;
