// Provedores de IA na nuvem com chave de API gratuita: Groq e OpenRouter (formato "OpenAI").
// O resto do sistema fala o formato do Gemini (contents/parts/functionDeclarations); aqui traduzimos
// para /chat/completions e de volta, então ferramentas, imagens e respostas em fluxo continuam iguais.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const CLOUD_PROVIDERS = {
  gemini: { label: 'Gemini', env: 'GEMINI_API_KEY' },
  groq: {
    label: 'Groq', env: 'GROQ_API_KEY', keyRe: /^gsk_[\w-]{16,200}$/,
    base: () => (process.env.GROQ_API_BASE || 'https://api.groq.com/openai/v1').replace(/\/$/, ''),
    defaultModel: 'llama-3.3-70b-versatile', fallback: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
    visionModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    skip: /whisper|tts|guard|embed|moderation|orpheus/i,
  },
  openrouter: {
    label: 'OpenRouter', env: 'OPENROUTER_API_KEY', keyRe: /^sk-or-[\w-]{16,200}$/,
    base: () => (process.env.OPENROUTER_API_BASE || 'https://openrouter.ai/api/v1').replace(/\/$/, ''),
    defaultModel: '', fallback: ['meta-llama/llama-3.3-70b-instruct:free', 'google/gemma-3-27b-it:free', 'mistralai/mistral-small-3.2-24b-instruct:free'],
    skip: /embed|moderation/i,
  },
};
export const CLOUD_NAMES = Object.keys(CLOUD_PROVIDERS);
export const hasKey = (name) => Boolean(process.env[CLOUD_PROVIDERS[name]?.env]);
export const keyHint = (name) => (hasKey(name) ? `…${process.env[CLOUD_PROVIDERS[name].env].slice(-4)}` : null);

// ---------- tradução do pedido ----------
function lowerTypes(s) {
  if (Array.isArray(s)) return s.map(lowerTypes);
  if (s && typeof s === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(s)) o[k] = k === 'type' && typeof v === 'string' ? v.toLowerCase() : lowerTypes(v);
    return o;
  }
  return s;
}
export const hasImages = (body) => (body.contents || []).some((c) => c.parts?.some((p) => p.inlineData && /^image\//.test(p.inlineData.mimeType)));
export const hasOtherMedia = (body) => (body.contents || []).some((c) => c.parts?.some((p) => p.fileData || (p.inlineData && !/^image\//.test(p.inlineData.mimeType))));

export function toMessages(body, { images = true } = {}) {
  const msgs = [];
  const sys = (body.systemInstruction?.parts || []).map((p) => p.text).filter(Boolean).join('\n');
  if (sys) msgs.push({ role: 'system', content: sys });
  let n = 0;
  const pending = [];
  for (const c of body.contents || []) {
    const parts = c.parts || [];
    if (c.role === 'model') {
      const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join('');
      const calls = parts.filter((p) => p.functionCall).map((p) => {
        const id = `call_${++n}`;
        pending.push({ id, name: p.functionCall.name });
        return { id, type: 'function', function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args || {}) } };
      });
      if (text || calls.length) msgs.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
      continue;
    }
    for (const p of parts.filter((x) => x.functionResponse)) {
      const i = pending.findIndex((x) => x.name === p.functionResponse.name);
      const id = i >= 0 ? pending.splice(i, 1)[0].id : `call_${++n}`;
      msgs.push({ role: 'tool', tool_call_id: id, content: JSON.stringify(p.functionResponse.response || {}) });
    }
    const rest = parts.filter((x) => !x.functionResponse);
    if (!rest.length) continue;
    const content = [];
    for (const p of rest) {
      if (p.text) content.push({ type: 'text', text: p.text });
      else if (p.inlineData && /^image\//.test(p.inlineData.mimeType)) {
        if (images) content.push({ type: 'image_url', image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` } });
        else content.push({ type: 'text', text: '[foto enviada: este modelo não enxerga imagens]' });
      } else if (p.inlineData || p.fileData) content.push({ type: 'text', text: '[arquivo enviado: este modelo não consegue ler PDFs; use o Gemini para isso]' });
    }
    if (content.length) msgs.push({ role: 'user', content: content.length === 1 && content[0].type === 'text' ? content[0].text : content });
  }
  return msgs;
}

function toPayload(body, model, { images = true, json = true } = {}) {
  const gc = body.generationConfig || {};
  const wantsJson = json && gc.responseMimeType === 'application/json';
  const messages = toMessages(body, { images });
  if (wantsJson) {
    const sys = messages.find((m) => m.role === 'system');
    const note = '\n\nResponda SOMENTE com um objeto JSON válido, sem texto antes ou depois.';
    if (sys) sys.content += note; else messages.unshift({ role: 'system', content: note.trim() });
  }
  const decl = (body.tools || []).flatMap((t) => t.functionDeclarations || []);
  return {
    model, messages, stream: true,
    temperature: gc.temperature ?? 0.8, max_tokens: gc.maxOutputTokens || 2048,
    ...(decl.length ? { tools: decl.map((d) => ({ type: 'function', function: { name: d.name, description: d.description || '', parameters: lowerTypes(d.parameters || { type: 'OBJECT', properties: {} }) } })), tool_choice: 'auto' } : {}),
    ...(wantsJson ? { response_format: { type: 'json_object' } } : {}),
  };
}

// ---------- resposta em fluxo ----------
async function streamOnce(name, key, payload, write, full, signal, idle) {
  const def = CLOUD_PROVIDERS[name];
  const res = await fetch(`${def.base()}/chat/completions`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...(name === 'openrouter' ? { 'X-Title': 'Codeniac' } : {}) },
    body: JSON.stringify(payload),
  });
  idle();
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(err.error?.message || err.message || `${def.label} respondeu ${res.status}`);
    e.status = res.status;
    throw e;
  }
  let answer = ''; let buf = ''; let inThink = false; let carry = '';
  const tc = []; // chamadas de ferramenta, por índice
  let finish = null;
  const decoder = new TextDecoder();
  const emit = (piece) => {
    // modelos de raciocínio às vezes mandam <think>...</think> no texto: não mostramos isso
    carry += piece;
    let out = '';
    for (;;) {
      if (inThink) {
        const e = carry.indexOf('</think>');
        if (e < 0) { carry = carry.slice(-8); break; }
        carry = carry.slice(e + 8); inThink = false;
      } else {
        const s = carry.indexOf('<think>');
        if (s < 0) { const keep = /<\w{0,5}$/.test(carry) ? carry.length - carry.lastIndexOf('<') : 0; out += carry.slice(0, carry.length - keep); carry = carry.slice(carry.length - keep); break; }
        out += carry.slice(0, s); carry = carry.slice(s + 7); inThink = true;
      }
    }
    if (out) { answer += out; write({ type: 'text', text: out }); }
  };
  for await (const chunk of res.body) {
    idle();
    buf += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      let obj; try { obj = JSON.parse(data); } catch { continue; }
      if (obj.error) { const e = new Error(obj.error.message || 'Erro do provedor'); e.status = obj.error.code && Number(obj.error.code) || 502; throw e; }
      const ch = obj.choices?.[0];
      if (!ch) continue;
      if (ch.finish_reason) finish = ch.finish_reason;
      const d = ch.delta || {};
      if (d.content) emit(d.content);
      for (const t of d.tool_calls || []) {
        const i = t.index ?? 0;
        tc[i] ??= { name: '', args: '' };
        if (t.function?.name) tc[i].name += t.function.name;
        if (t.function?.arguments) tc[i].args += t.function.arguments;
      }
    }
  }
  if (carry && !inThink) { answer += carry; write({ type: 'text', text: carry }); }
  const calls = tc.filter((t) => t?.name).map((t) => {
    let args = {}; try { args = t.args ? JSON.parse(t.args) : {}; } catch { args = {}; }
    return { functionCall: { name: t.name, args } };
  });
  const parts = [...(answer ? [{ text: answer }] : []), ...calls];
  const blocked = finish === 'content_filter' ? 'SAFETY' : null;
  if (full) return { text: answer, parts, calls, blocked };
  if (!answer.trim() && blocked) return 'Prefiro não responder a esse pedido. Posso ajudar com outra coisa?';
  if (!answer.trim()) throw new Error(`${def.label} não respondeu`);
  return answer.trim();
}

async function streamWithTimeouts(name, key, payload, write, full) {
  const label = CLOUD_PROVIDERS[name].label;
  const ctrl = new AbortController();
  let timer = setTimeout(() => ctrl.abort(new Error(`${label} demorou para começar a responder`)), 25000);
  const idle = () => { clearTimeout(timer); timer = setTimeout(() => ctrl.abort(new Error(`${label} parou de responder`)), 30000); };
  const total = setTimeout(() => ctrl.abort(new Error('Resposta longa demais')), 180000);
  try { return await streamOnce(name, key, payload, write, full, ctrl.signal, idle); }
  catch (err) {
    if (ctrl.signal.aborted) { const e = new Error(ctrl.signal.reason?.message || 'Tempo esgotado'); e.status = 504; throw e; }
    throw err;
  } finally { clearTimeout(timer); clearTimeout(total); }
}

// ---------- lista de modelos ----------
const modelCache = new Map();
export async function listModels(name, { force = false } = {}) {
  const def = CLOUD_PROVIDERS[name];
  const hit = modelCache.get(name);
  if (!force && hit && Date.now() - hit.at < 3600 * 1000) return hit.list;
  const res = await fetch(`${def.base()}/models`, { headers: { Authorization: `Bearer ${process.env[def.env] || ''}` }, signal: AbortSignal.timeout(15000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error?.message || `${def.label} respondeu ${res.status}`); e.status = res.status; throw e; }
  let list = (data.data || []).map((m) => ({
    id: m.id, name: m.name || m.id, ctx: m.context_length || m.context_window || 0,
    free: name === 'openrouter' ? (/:free$/.test(m.id) || (m.pricing && Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0)) : true,
    tools: name === 'openrouter' ? (m.supported_parameters || []).includes('tools') : true,
  })).filter((m) => m.id && !def.skip.test(m.id));
  if (name === 'openrouter') list = list.filter((m) => m.free && m.tools);
  list.sort((a, b) => (b.ctx || 0) - (a.ctx || 0) || a.id.localeCompare(b.id));
  modelCache.set(name, { at: Date.now(), list });
  return list;
}

async function candidates(name, wanted, images) {
  const def = CLOUD_PROVIDERS[name];
  const out = [];
  if (images && def.visionModel) out.push(def.visionModel);
  if (wanted) out.push(wanted);
  if (name === 'openrouter') {
    try {
      const prefer = /llama-3\.3|llama-4|gemma-3|qwen|mistral|deepseek|gpt-oss/i;
      const list = await listModels(name);
      out.push(...list.filter((m) => prefer.test(m.id)).slice(0, 4).map((m) => m.id), ...list.slice(0, 2).map((m) => m.id));
    } catch { /* usa a lista fixa */ }
  }
  out.push(...(def.defaultModel ? [def.defaultModel] : []), ...def.fallback);
  return [...new Set(out)].slice(0, 5);
}

export async function openaiCall(name, body, write = () => {}, full = false, wantedModel = '') {
  const def = CLOUD_PROVIDERS[name];
  const key = process.env[def.env];
  if (!key) throw Object.assign(new Error(`${def.label} sem chave`), { status: 401 });
  const images = hasImages(body);
  let lastErr;
  for (const model of await candidates(name, wantedModel, images)) {
    const visionOk = !images || model === def.visionModel || name === 'openrouter';
    try {
      try { return await streamWithTimeouts(name, key, toPayload(body, model, { images: visionOk }), write, full); }
      catch (err) {
        // alguns modelos não aceitam resposta em JSON: tenta de novo sem esse recurso
        if (err.status === 400 && body.generationConfig?.responseMimeType === 'application/json' && /response_format|json/i.test(err.message)) {
          return await streamWithTimeouts(name, key, toPayload(body, model, { images: visionOk, json: false }), write, full);
        }
        throw err;
      }
    } catch (err) {
      lastErr = err;
      console.error(`[assistente] ${def.label} ${model}: ${err.status || ''} ${err.message}`);
      if ([401, 403].includes(err.status)) throw err;
      if (err.status === 429) await sleep(300);
    }
  }
  throw lastErr;
}

export async function testKey(name, key) {
  const def = CLOUD_PROVIDERS[name];
  try {
    const res = await fetch(`${def.base()}/models`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
    if (res.ok) return { ok: true };
    const err = await res.json().catch(() => ({}));
    return { ok: false, error: err.error?.message || `${def.label} respondeu ${res.status}` };
  } catch (e) { return { ok: false, error: e.message }; }
}
