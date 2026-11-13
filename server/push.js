// Notificações de verdade no celular (Web Push): chegam mesmo com o app fechado e a tela bloqueada.
// Precisam de HTTPS (ex.: endereço do Tailscale com "tailscale serve") — o navegador exige.
import webpush from 'web-push';
import { db, save } from './db.js';
import { onNotify } from './notify.js';
import { onDeliver } from './assistant.js';

function keys() {
  const m = db().meta;
  if (!m.vapid) { m.vapid = webpush.generateVAPIDKeys(); save(); }
  return m.vapid;
}
const subs = (uid) => ((db().userMeta[uid] ??= {}).push ??= []);

export const pushPublicKey = () => keys().publicKey;

export function addSubscription(uid, sub, device = '') {
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) throw new Error('Inscrição inválida');
  if (!/^https:\/\//.test(sub.endpoint)) throw new Error('Endereço de notificação inválido');
  const list = subs(uid);
  const i = list.findIndex((s) => s.endpoint === sub.endpoint);
  const item = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, device: String(device).slice(0, 80), at: new Date().toISOString() };
  if (i >= 0) list[i] = item; else list.push(item);
  if (list.length > 10) list.splice(0, list.length - 10);
  save();
}
export function removeSubscription(uid, endpoint) {
  const m = db().userMeta[uid];
  if (m?.push) { m.push = m.push.filter((s) => s.endpoint !== endpoint); save(); }
}

export async function pushTo(uid, payload) {
  const list = subs(uid);
  if (!list.length) return 0;
  const k = keys();
  let sent = 0;
  for (const s of [...list]) {
    try {
      await webpush.sendNotification(s, JSON.stringify(payload), { vapidDetails: { subject: 'mailto:codeniac@localhost.invalid', publicKey: k.publicKey, privateKey: k.privateKey }, TTL: 3600 * 12 });
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) removeSubscription(uid, s.endpoint); // inscrição expirada
      else console.error('[push]', err.statusCode || '', err.message);
    }
  }
  return sent;
}

// mensagens dos personagens e notificações do sistema também vão para o celular
onDeliver((user, ev, text) => { pushTo(user.id, { title: ev.name, body: text.slice(0, 240), url: '/#/assistente', tag: `chat-${ev.conversationId}`, conv: ev.conversationId }); });
onNotify((uid, n) => { pushTo(uid, { title: n.title, body: String(n.message || '').slice(0, 240), url: `/${n.link || '#/notifications'}`, tag: n.key || n.id }); });
