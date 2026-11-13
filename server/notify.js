// Notificações em tempo real (Server-Sent Events) e central de acontecimentos (feed).
import { db, id, now, save } from './db.js';

const clients = new Map(); // userId -> Set<res>

export function subscribe(userId, res) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
  return () => clients.get(userId)?.delete(res);
}

export function emit(userId, event, data) {
  for (const res of clients.get(userId) || []) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// Cria uma notificação respeitando as preferências do usuário. "key" evita duplicar avisos (ex.: lembrete diário).
const notifyHooks = [];
export const onNotify = (fn) => notifyHooks.push(fn);

export function notify(userId, { type = 'task', title, message, link = null, key = null }) {
  const d = db();
  const prefs = d.settings[userId] || {};
  if (type === 'task' && prefs.notifyTasks === false) return null;
  if ((type === 'system' || type === 'update') && prefs.notifySystem === false) return null;
  if (key && d.notifications.some((n) => n.userId === userId && n.key === key)) return null;
  const n = { id: id(), userId, type, title, message, link, key, read: false, createdAt: now() };
  d.notifications.push(n);
  if (d.notifications.length > 3000) d.notifications.splice(0, d.notifications.length - 3000);
  save();
  emit(userId, 'notification', n);
  for (const fn of notifyHooks) { try { fn(userId, n); } catch (e) { console.error('[notificação]', e.message); } }
  return n;
}

// Central de acontecimentos: registra o que acontece no hub.
// kind: task | project | page | upload | finance | money | garage | study | journal | decision | agenda | habit | inbox | settings | system
// "merge" agrupa edições repetidas do mesmo item em 10 minutos (ex.: digitar numa página).
export function logEvent(userId, kind, action, title, { link = null, detail = '', merge = null } = {}) {
  if (!userId) return;
  const d = db();
  if (merge) {
    const recent = d.events.findLast((e) => e.userId === userId && e.merge === merge);
    if (recent && Date.now() - new Date(recent.at).getTime() < 10 * 60 * 1000) {
      recent.at = now(); recent.count = (recent.count || 1) + 1; save(); return recent;
    }
  }
  const e = { id: id(), userId, kind, action, title: String(title || '').slice(0, 160), detail: String(detail || '').slice(0, 300), link, merge, at: now() };
  d.events.push(e);
  if (d.events.length > 20000) d.events.splice(0, d.events.length - 20000);
  save();
  emit(userId, 'event', e);
  return e;
}
