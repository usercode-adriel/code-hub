// LIVING WORLD ENGINE — núcleo.
// Tudo o que acontece no universo vira um registro na linha do tempo (w.events): é a memória histórica.
// Os módulos (agentes, economia, mídia, política, cidade) se inscrevem aqui para:
//   - reagir a acontecimentos (onEvent): uma falência vira notícia, que vira post, que muda amizades...
//   - agir a cada hora e a cada dia do mundo (onHourly / onDaily);
//   - executar eventos programados (schedule + handle): festas, eleições, desdobramentos de uma história.
// O tempo do mundo é o tempo real. Se o servidor ficou desligado, o motor "recupera" hora a hora o que
// aconteceu (até 7 dias), com os horários certos e sem gastar IA, e monta o relatório de ausência.
import { worldOf, saveWorld } from './store.js';
import { uid, nowIso, HOUR, MIN, ago, cap, hourKey, dayKey, clamp } from './util.js';
import { emit } from '../notify.js';
import { assistantMode, isCloud } from '../assistant.js';

export const LIMITS = { events: 6000, queue: 800 };
export const PACES = {
  calma: { act: 0.6, aiPerHour: 10 },
  normal: { act: 1, aiPerHour: 24 },
  agitada: { act: 1.5, aiPerHour: 60 },
};
// Categorias usadas pelas notícias, pelo arquivo e pelos filtros.
export const CATS = {
  politica: 'Política', justica: 'Justiça', economia: 'Economia', tecnologia: 'Tecnologia', entretenimento: 'Entretenimento', esportes: 'Esportes',
  seguranca: 'Segurança', ciencia: 'Ciência', celebridades: 'Celebridades', sociedade: 'Sociedade', local: 'Local', pessoal: 'Vida pessoal',
};

const hooks = { event: [], hourly: [], daily: [], genesis: [], tick: [] };
// atualizações de esquema: rodam uma vez em mundos novos e antigos, na ordem em que foram registradas
const upgrades = [];
export const onUpgrade = (n, fn) => upgrades.push([n, fn]);
const handlers = {};
export const onEvent = (fn) => hooks.event.push(fn);
export const onHourly = (fn) => hooks.hourly.push(fn);
export const onDaily = (fn) => hooks.daily.push(fn);
export const onGenesis = (fn) => hooks.genesis.push(fn);
export const onTick = (fn) => hooks.tick.push(fn);
export const handle = (kind, fn) => { handlers[kind] = fn; };
// serviços que um módulo oferece aos outros sem criar ciclos de importação (ex.: abrir inquérito, entregar item)
export const services = {};

// ---------------------------------------------------------------- estado
export function world(userId) {
  const w = worldOf(userId);
  w.core ??= {};
  const c = w.core;
  c.cfg = { pace: 'normal', aiPerHour: null, modules: {}, ...(c.cfg || {}) };
  c.aiUsage ??= { hour: '', n: 0 };
  c.seq ??= 0;
  w.events ??= [];
  w.queue ??= [];
  return w;
}
export const pace = (w) => PACES[w.core.cfg.pace] || PACES.normal;
export const moduleOn = (w, name) => w.core.cfg.modules?.[name] !== false;

// ---------------------------------------------------------------- IA com orçamento
export const aiReady = () => isCloud(assistantMode());
export function aiBudget(w) {
  const k = hourKey();
  if (w.core.aiUsage.hour !== k) w.core.aiUsage = { hour: k, n: 0 };
  return Math.max(0, (w.core.cfg.aiPerHour || pace(w).aiPerHour) - w.core.aiUsage.n);
}
// Só quando o mundo está "ao vivo" (não durante a recuperação), há IA configurada e sobra cota na hora.
export function aiTake(ctx) {
  if (!ctx.live || !aiReady() || aiBudget(ctx.w) <= 0) return false;
  ctx.w.core.aiUsage.n += 1;
  return true;
}

// ---------------------------------------------------------------- linha do tempo
// ev: { type, cat, title, text, actors:[personaId|'me'], refs:[{t, id}], importance 1..5, causeId, storyId, data }
export function record(ctx, ev) {
  const { w } = ctx;
  const e = {
    id: uid(), n: ++w.core.seq, at: ev.at || (ctx.at ? ctx.at.toISOString() : nowIso()), type: ev.type, cat: ev.cat || 'sociedade',
    title: String(ev.title || '').slice(0, 200), text: String(ev.text || '').slice(0, 1200), actors: [...new Set(ev.actors || [])].slice(0, 12),
    refs: (ev.refs || []).slice(0, 12), importance: clamp(ev.importance || 1, 1, 5), causeId: ev.causeId || null, storyId: ev.storyId || null,
    data: ev.data || {}, origin: ev.origin || (ctx.live ? 'vivo' : 'recuperado'),
  };
  w.events.push(e);
  if (w.events.length > LIMITS.events) {
    // a memória antiga de pouca importância sai primeiro; fatos importantes ficam
    const keep = w.events.filter((x, i) => x.importance >= 3 || i >= w.events.length - LIMITS.events * 0.8);
    w.events = keep.slice(-LIMITS.events);
  }
  for (const fn of hooks.event) { try { fn(ctx, e); } catch (err) { console.error('[mundo] reação a evento:', err.message); } }
  if (ctx.live && e.importance >= 2) emit(ctx.uid, 'world', { type: 'event', event: publicEvent(e, w) });
  return e;
}

export function publicEvent(e, w) {
  return { id: e.id, at: e.at, type: e.type, cat: e.cat, catLabel: CATS[e.cat] || e.cat, title: e.title, text: e.text, importance: e.importance, actors: e.actors.map((a) => actorRef(w, a)), refs: e.refs, storyId: e.storyId, causeId: e.causeId, origin: e.origin };
}
export function actorRef(w, id) {
  if (id === 'me') return { id: 'me', name: 'Você', me: true };
  const p = w.social?.personas?.find((x) => x.id === id);
  return p ? { id: p.id, name: p.name, avatar: p.avatar, color: p.color, handle: p.handle } : { id, name: (w.gone || {})[id] || 'alguém que saiu da cidade' };
}

// ---------------------------------------------------------------- eventos programados
export function schedule(ctx, at, kind, data = {}) {
  const item = { id: uid(), at: (at instanceof Date ? at : new Date(at)).toISOString(), kind, data };
  ctx.w.queue.push(item);
  if (ctx.w.queue.length > LIMITS.queue) {
    ctx.w.queue.sort((a, b) => a.at.localeCompare(b.at));
    ctx.w.queue.splice(LIMITS.queue);
  }
  return item;
}
export const cancelScheduled = (w, pred) => { w.queue = w.queue.filter((q) => !pred(q)); };

function runQueue(ctx, until) {
  const { w } = ctx;
  w.queue.sort((a, b) => a.at.localeCompare(b.at));
  let guard = 0;
  while (w.queue.length && w.queue[0].at <= until.toISOString() && guard++ < 300) {
    const item = w.queue.shift();
    const fn = handlers[item.kind];
    if (!fn) continue;
    const at = new Date(item.at);
    try { fn({ ...ctx, at }, item.data, item); } catch (err) { console.error(`[mundo] evento programado ${item.kind}:`, err.message); }
  }
}

// ---------------------------------------------------------------- tempo
const MAX_CATCHUP_HOURS = 7 * 24;

function runUpgrades(base) {
  const w = base.w; const schema = w.core.schema || 1;
  const pending = upgrades.filter(([n]) => n > schema).sort((a, b) => a[0] - b[0]);
  if (!pending.length) return false;
  const ctx = { ...base, at: new Date() };
  for (const [n, fn] of pending) { try { fn(ctx); } catch (err) { console.error(`[mundo] atualização ${n}:`, err); } w.core.schema = Math.max(w.core.schema || 1, n); }
  return true;
}
export async function worldTick(user, { live = true } = {}) {
  const w = world(user.id);
  if (w.core.cfg.enabled === false) return;
  const base = { user, uid: user.id, w, live };
  if (!w.core.genesisAt) {
    const people = w.social?.personas?.length || 0;
    if (people < 30) return; // a rede ainda está se formando
    const ctx = { ...base, at: new Date() };
    w.core.genesisAt = nowIso();
    for (const fn of hooks.genesis) { try { fn(ctx); } catch (err) { console.error('[mundo] gênese:', err); } }
    record(ctx, { type: 'genese', cat: 'local', title: 'Codeniac Society começa a ser registrada', text: 'A partir deste momento, tudo o que acontece na cidade passa a fazer parte da história. Pessoas, empresas, partidos e clubes que já existiam aparecem como "da gênese".', importance: 4, origin: 'genese' });
    w.core.lastHour = hourKey();
    w.core.lastDay = dayKey();
    runUpgrades(base);
    saveWorld();
    return;
  }

  // novos módulos entram em mundos que já existiam (uma vez só)
  if (runUpgrades(base)) saveWorld();

  // horas que passaram desde a última vez (recupera o tempo desligado)
  const nowD = new Date();
  const last = parseHour(w.core.lastHour) || new Date(nowD.getTime() - HOUR);
  const steps = Math.min(MAX_CATCHUP_HOURS, Math.floor((startOfHour(nowD) - startOfHour(last)) / HOUR));
  const recovering = steps > 1;
  if (recovering && !w.core.awaySince) w.core.awaySince = new Date(startOfHour(last).getTime() + HOUR).toISOString();
  for (let i = 1; i <= steps; i++) {
    const hourStart = new Date(startOfHour(last).getTime() + i * HOUR);
    const isNow = i === steps;
    const ctx = { ...base, live: live && isNow, at: isNow ? nowD : new Date(hourStart.getTime() + Math.random() * 50 * MIN) };
    runQueue({ ...ctx }, new Date(hourStart.getTime() + (isNow ? 0 : HOUR - 1)));
    const dk = dayKey(hourStart);
    if (dk !== w.core.lastDay) {
      w.core.lastDay = dk;
      for (const fn of hooks.daily) { try { fn(ctx); } catch (err) { console.error('[mundo] rotina diária:', err); } }
    }
    for (const fn of hooks.hourly) { try { fn(ctx); } catch (err) { console.error('[mundo] rotina de hora:', err); } }
    w.core.lastHour = hourKey(hourStart);
  }
  // a cada tick (30 s): fila do agora e reações rápidas
  const ctx = { ...base, at: nowD };
  runQueue(ctx, nowD);
  for (const fn of hooks.tick) { try { await fn(ctx); } catch (err) { console.error('[mundo] tick:', err.message); } }
  saveWorld();
}

const startOfHour = (d) => { const x = new Date(d); x.setMinutes(0, 0, 0); return x; };
function parseHour(k) {
  if (!k) return null;
  const [date, h] = k.split('T');
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, Number(h), 0, 0, 0);
}

// ---------------------------------------------------------------- presença e relatório de ausência
export function touch(w) {
  if (w.core.lastActive && ago(w.core.lastActive) > 30 * MIN && !w.core.awaySince) w.core.awaySince = w.core.lastActive;
  w.core.lastActive = nowIso();
}

export function activityReport(w) {
  const since = w.core.awaySince;
  if (!since) return null;
  w.core.awaySince = null;
  const evs = w.events.filter((e) => e.at > since && e.type !== 'genese');
  if (!evs.length) return null;
  const by = (pred) => evs.filter(pred).length;
  const interactions = new Set(evs.filter((e) => e.actors.length >= 2).flatMap((e) => e.actors)).size;
  const posts = (w.social?.posts || []).filter((p) => p.at > since).length;
  const comments = (w.social?.posts || []).reduce((n, p) => n + p.comments.filter((c) => c.at > since).length, 0);
  const highlights = evs.slice().sort((a, b) => b.importance - a.importance || b.at.localeCompare(a.at)).slice(0, 5).map((e) => publicEvent(e, w));
  return {
    since, total: evs.length, interactions, posts, comments,
    news: (w.articles || []).filter((a) => a.at > since).length,
    companies: by((e) => (e.refs || []).some((r) => r.t === 'company')),
    messages: by((e) => e.type === 'mensagem-usuario'),
    byCat: Object.entries(evs.reduce((m, e) => ({ ...m, [e.cat]: (m[e.cat] || 0) + 1 }), {})).map(([k, n]) => ({ cat: k, label: CATS[k] || k, n })).sort((a, b) => b.n - a.n),
    highlights,
  };
}
