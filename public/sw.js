// Codeniac no celular: abre rápido (guarda a interface), recebe notificações e abre a tela certa ao tocar.
const CACHE = 'codeniac-1.7.0';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Interface: rede primeiro (sempre atualizada) e cópia guardada se a rede falhar. Dados (/api) nunca ficam em cache.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(e.request);
      if (res.ok) { const c = await caches.open(CACHE); c.put(e.request, res.clone()); }
      return res;
    } catch {
      const hit = await caches.match(e.request) || (e.request.mode === 'navigate' ? await caches.match('/') : null);
      return hit || new Response('Sem conexão com o Codeniac. Verifique se o computador está ligado.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch { d = { title: 'Codeniac', body: e.data?.text() || '' }; }
  e.waitUntil((async () => {
    await self.registration.showNotification(d.title || 'Codeniac', {
      body: d.body || '', icon: '/assets/icon.png', badge: '/assets/badge.png', tag: d.tag || undefined, renotify: Boolean(d.tag),
      data: { url: d.url || '/' }, vibrate: [60, 40, 60],
    });
    try { const n = (await self.registration.getNotifications()).length; if (n) await self.navigator.setAppBadge?.(n); } catch { /* sem selo */ }
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', location.origin).href;
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = all.find((c) => new URL(c.url).origin === location.origin);
    if (win) { await win.focus(); win.postMessage({ type: 'open', url }); }
    else await self.clients.openWindow(url);
    try { await self.navigator.clearAppBadge?.(); } catch { /* ok */ }
  })());
});
