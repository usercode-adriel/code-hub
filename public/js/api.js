// Cliente HTTP da API do Codeniac.
const TOKEN_KEY = 'codeniac.token';

export const auth = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  set(token) { localStorage.setItem(TOKEN_KEY, token); },
  clear() { localStorage.removeItem(TOKEN_KEY); },
};

async function request(method, url, body) {
  const headers = {};
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`/api${url}`, { method, headers, body: payload });
  if (res.status === 401 && !url.startsWith('/auth/')) {
    auth.clear();
    location.href = '/login';
    throw new Error('Sessão expirada');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body ?? {}),
  put: (url, body) => request('PUT', url, body ?? {}),
  del: (url) => request('DELETE', url),
  upload: (url, file, field = 'image') => { const fd = new FormData(); fd.append(field, file); return request('POST', url, fd); },
};

// Coleções simples da 1.3 (agenda, hábitos, cartões...): /api/c/:coleção
export const coll = (name) => ({
  list: () => api.get(`/c/${name}`),
  add: (body) => api.post(`/c/${name}`, body),
  update: (id, body) => api.put(`/c/${name}/${id}`, body),
  remove: (id) => api.del(`/c/${name}/${id}`),
});

// Lê uma resposta em streaming (SSE sobre POST) do assistente.
export async function streamChat(message, conversationId, onEvent, signal) {
  const res = await fetch('/api/assistant/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
    body: JSON.stringify({ message, conversationId }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || 'Falha no assistente');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const line = chunk.split('\n').find((l) => l.startsWith('data: '));
      if (line) onEvent(JSON.parse(line.slice(6)));
    }
  }
}
