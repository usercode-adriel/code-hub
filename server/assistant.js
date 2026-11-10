// Assistente do Codeniac (1.3).
// Ordem de resposta: comandos (/gasto, /tarefa...) → ações do sistema → briefing/procrastinação →
// base de conhecimento → IA opcional (Ollama local ou Claude) → conversa básica por regras.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { db, id, now, save, DATA_DIR, localDate } from './db.js';
import { DEFAULT_SETTINGS } from './seed.js';
import { createTask, updateTask } from './routes/api.js';
import { addFinanceEntry } from './routes/pages.js';
import { guessCategory } from './routes/life.js';
import { logEvent } from './notify.js';
import { briefing, procrastination, financeTotals, indrivePage } from './briefing.js';
import { searchKB } from './kb.js';

const MODEL = process.env.CODENIAC_AI_MODEL || 'claude-opus-5-5';
const EFFORT = process.env.CODENIAC_AI_EFFORT || 'low';
const MAX_API_MESSAGES = 80;
const OLLAMA_HISTORY = 12;

const hasCredentials = () =>
  Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE);

let client = null;
const getClient = () => (client ??= new Anthropic());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const brl = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---------- Configuração da IA opcional (ai.json na pasta de dados) ----------
const AI_FILE = path.join(DATA_DIR, 'ai.json');
const DEFAULT_OLLAMA = (process.env.OLLAMA_HOST && /^https?:\/\//.test(process.env.OLLAMA_HOST))
  ? process.env.OLLAMA_HOST.replace(/\/$/, '') : 'http://127.0.0.1:11434';
const AI_DEFAULT = { provider: 'local', model: '', ollamaUrl: DEFAULT_OLLAMA };
export const PROVIDERS = ['auto', 'ollama', 'claude', 'local'];

export const CATALOG = [
  { name: 'gemma3:1b', label: 'Gemma 3 · 1B', size: '0,8 GB', ram: 4, desc: 'Bem leve. Para computadores com pouca memória; respostas mais simples.' },
  { name: 'qwen2.5:1.5b', label: 'Qwen 2.5 · 1.5B', size: '1,0 GB', ram: 4, desc: 'Leve e rápido, bom em português. Indicado se a Gemma ficou lenta.' },
  { name: 'qwen2.5:3b', label: 'Qwen 2.5 · 3B', size: '1,9 GB', ram: 8, desc: 'Rápido. Bom em português, programação e matemática.' },
  { name: 'llama3.2:3b', label: 'Llama 3.2 · 3B', size: '2,0 GB', ram: 8, desc: 'Rápido e simpático. Muito bom para praticar inglês.' },
  { name: 'gemma3:4b', label: 'Gemma 3 · 4B', size: '3,3 GB', ram: 12, desc: 'Conversa natural e ótimo português, porém mais pesado.' },
  { name: 'qwen2.5:7b', label: 'Qwen 2.5 · 7B', size: '4,7 GB', ram: 16, desc: 'Mais inteligente, precisa de PC forte.' },
];

export function recommendModel() {
  const gb = os.totalmem() / 1024 ** 3;
  if (gb < 8) return 'gemma3:1b';
  if (gb < 16) return 'qwen2.5:1.5b';
  return 'qwen2.5:3b';
}

let configCache = null;
export function aiConfig() {
  if (!configCache) {
    try { configCache = { ...AI_DEFAULT, ...JSON.parse(fs.readFileSync(AI_FILE, 'utf8')) }; } catch { configCache = { ...AI_DEFAULT }; }
  }
  return configCache;
}

export function saveAiConfig(patch) {
  const c = { ...aiConfig() };
  if (PROVIDERS.includes(patch.provider)) c.provider = patch.provider;
  if (typeof patch.model === 'string' && /^[\w.\-:/]{0,80}$/.test(patch.model)) c.model = patch.model;
  if (typeof patch.ollamaUrl === 'string' && /^https?:\/\/[\w.\-:[\]]+\/?$/.test(patch.ollamaUrl)) c.ollamaUrl = patch.ollamaUrl.replace(/\/$/, '');
  configCache = c;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(AI_FILE, JSON.stringify(c, null, 2));
  return c;
}

export const ollamaState = { running: false, version: null, models: [], checkedAt: null, error: null };

export async function refreshOllama() {
  const base = aiConfig().ollamaUrl;
  try {
    const [v, t] = await Promise.all([
      fetch(`${base}/api/version`, { signal: AbortSignal.timeout(2500) }).then((r) => r.json()),
      fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2500) }).then((r) => r.json()),
    ]);
    Object.assign(ollamaState, {
      running: true, version: v.version || null, error: null,
      models: (t.models || []).map((m) => ({ name: m.name, size: m.size, family: m.details?.family, params: m.details?.parameter_size })),
    });
  } catch (err) {
    Object.assign(ollamaState, { running: false, version: null, models: [], error: err?.cause?.code || err?.name || 'erro' });
  }
  ollamaState.checkedAt = now();
  return ollamaState;
}
// só verifica o Ollama quando a IA local pode ser usada (evita trabalho à toa no modo básico)
const wantsOllama = () => ['auto', 'ollama'].includes(aiConfig().provider);
if (wantsOllama()) refreshOllama();
setInterval(() => { if (wantsOllama()) refreshOllama(); }, 30000).unref();

const sameModel = (a, b) => a === b || a === `${b}:latest` || b === `${a}:latest`;
export function effectiveModel() {
  const wanted = aiConfig().model;
  if (wanted && ollamaState.models.some((m) => sameModel(m.name, wanted))) return wanted;
  return ollamaState.models[0]?.name || null;
}

export function assistantMode() {
  const forced = (process.env.AI_PROVIDER || '').toLowerCase();
  const provider = PROVIDERS.includes(forced) ? forced : aiConfig().provider;
  const ollamaOk = ollamaState.running && Boolean(effectiveModel());
  if (provider === 'local') return 'local';
  if (provider === 'ollama') return ollamaOk ? 'ollama' : 'local';
  if (provider === 'claude') return hasCredentials() ? 'claude' : 'local';
  if (ollamaOk) return 'ollama';
  if (hasCredentials()) return 'claude';
  return 'local';
}

// ---------- Personalidade ----------
const PERSONALITY = {
  amigavel: { label: 'Amigável', prompt: 'Caloroso e próximo, como um amigo que manja de organização. Linguagem casual e acolhedora.',
    hello: ['Oi, {n}! 😊', 'E aí, {n}! Tudo certo?', '{g}, {n}! Que bom te ver por aqui.'], ok: ['Prontinho!', 'Feito! 👍', 'Pronto, já tá lá!'], close: ['Qualquer coisa, tô por aqui.', 'Bora pra cima! 💪', ''] },
  profissional: { label: 'Profissional', prompt: 'Objetivo, claro e cordial, como um consultor sênior. Sem gírias, sem exageros.',
    hello: ['{g}, {n}.', 'Olá, {n}. Como posso ajudar?'], ok: ['Concluído.', 'Registrado.', 'Feito.'], close: ['Posso ajudar em algo mais?', ''] },
  divertido: { label: 'Divertido', prompt: 'Bem-humorado e leve; faz piadas rápidas e comentários espirituosos, sem atrapalhar a ajuda.',
    hello: ['Opa, {n}! Chegou quem manda 😎', 'Olha quem apareceu! 🎉 {g}, {n}!'], ok: ['Tá na mão! ✨', 'Missão cumprida! 🫡', 'Feito, e nem suei 😄'], close: ['Próxima missão?', 'Manda mais! 🚀', ''] },
  mentor: { label: 'Mentor', prompt: 'Encorajador como um coach: celebra avanços, ajuda a refletir com perguntas e sugere o próximo passo pequeno.',
    hello: ['{g}, {n}! Pronto para avançar hoje?', 'Bem-vindo, {n}. Qual é o próximo passo?'], ok: ['Ótimo passo!', 'Isso aí, mais uma etapa vencida.'], close: ['Qual é a próxima pequena vitória de hoje?', 'Lembre: constância vence intensidade.'] },
  zen: { label: 'Zen', prompt: 'Calmo e sereno; ajuda a reduzir a ansiedade e focar no essencial, com frases curtas e tranquilas.',
    hello: ['{g}, {n}. Respira fundo, vamos com calma. 🍃', 'Oi, {n}. Um passo de cada vez.'], ok: ['Feito, com tranquilidade.', 'Tudo certo. 🍃'], close: ['Sem pressa.', 'Foque no agora. 🍃', ''] },
  nerd: { label: 'Nerd', prompt: 'Entusiasmado com tecnologia e cultura geek; faz referências leves a filmes, games e programação.',
    hello: ['Saudações, {n}! 🖖', 'Hello, world... digo, {g}, {n}! 🤓'], ok: ['Commit realizado! ✅', 'Deploy feito com sucesso 🚀'], close: ['Que a Força esteja com você.', 'Até o próximo sprint! 🤓', ''] },
};
const LENGTH = { curta: 'Responda em 1 a 3 frases.', media: 'Respostas curtas a médias; detalhe só quando for útil.', detalhada: 'Pode dar respostas mais completas, com passos e exemplos quando ajudar.' };

const prefs = (user) => ({ ...DEFAULT_SETTINGS, ...(db().settings[user.id] || {}) });
const callName = (user, s) => s.assistantNickname || user.name.split(' ')[0];
const timeGreeting = () => { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'; };
const mine = (coll, user) => db()[coll].filter((x) => x.userId === user.id);

function contextBlock(user) {
  const b = briefing(user.id);
  const projects = mine('projects', user).map((p) => `${p.name} (slug: ${p.slug})`).join(', ');
  const tasks = b.priorities.map((t) => `- tarefa [${t.id}] ${t.title} (${t.priority}${t.dueDate ? `, prazo ${t.dueDate}` : ''})`).join('\n');
  return `<contexto_codeniac data="${localDate()}" usuario="${user.name}">\nProjetos: ${projects}\nPrioridades:\n${tasks}\nResumo do dia: ${b.text}\n</contexto_codeniac>`;
}

const EXPERTISE = `Você conversa sobre qualquer assunto e domina: inglês (se o usuário escrever em inglês ou pedir para praticar, responda em inglês e, no fim, uma linha "✍️ Correções:" em português com os erros), programação (exemplos curtos em blocos \`\`\`), criptomoedas, economia, finanças pessoais e investimentos (de forma educativa, sem recomendar compra/venda de ativos específicos), trabalho como motorista de aplicativo, livros e produtividade. Você não tem acesso à internet: não invente cotações nem notícias atuais.`;

function systemPrompt(user, mode = 'claude') {
  const s = prefs(user);
  const p = PERSONALITY[s.assistantPersonality] || PERSONALITY.amigavel;
  return `Você é ${s.assistantName}, o assistente integrado do Codeniac, um hub pessoal (projetos, rotina, InDrive, finanças, estudos).
Cada mensagem chega com um bloco <contexto_codeniac> com o estado atual; use-o e não o mencione.
Personalidade: ${p.prompt}
Chame o usuário de "${callName(user, s)}". ${LENGTH[s.assistantLength] || LENGTH.media} ${s.assistantEmoji ? 'Use emojis com moderação.' : 'Não use emojis.'}
Converse como uma pessoa: reaja ao que foi dito, no máximo uma pergunta por vez. Responda em português do Brasil, exceto na prática de inglês.
${EXPERTISE}
${mode === 'claude' ? 'Use as ferramentas para criar/concluir tarefas e registrar entradas/saídas do InDrive; confirme em uma frase.' : 'O próprio sistema executa comandos como "/gasto 50 gasolina", "/corrida 35 12km", "/tarefa Estudar SQL". Ensine o comando se o usuário pedir uma ação; nunca diga que registrou algo.'}${s.assistantInstructions ? `\n\nInstruções pessoais do usuário:\n${s.assistantInstructions}` : ''}`;
}

// ---------- Ferramentas (Claude) ----------
const TOOLS = [
  { name: 'create_task', description: 'Cria uma tarefa em um projeto do usuário.', strict: true, eager_input_streaming: true,
    input_schema: { type: 'object', properties: { project_slug: { type: 'string' }, title: { type: 'string' }, priority: { type: 'string', enum: ['low', 'medium', 'high'] }, due_date: { type: 'string', description: 'AAAA-MM-DD ou vazio' } }, required: ['project_slug', 'title', 'priority', 'due_date'], additionalProperties: false } },
  { name: 'update_task_status', description: 'Muda o status de uma tarefa.', strict: true, eager_input_streaming: true,
    input_schema: { type: 'object', properties: { task_id: { type: 'string' }, status: { type: 'string', enum: ['todo', 'doing', 'done'] } }, required: ['task_id', 'status'], additionalProperties: false } },
  { name: 'add_finance_entry', description: 'Registra entrada (in) ou saída (out) no controle do InDrive.', strict: true, eager_input_streaming: true,
    input_schema: { type: 'object', properties: { type: { type: 'string', enum: ['in', 'out'] }, amount: { type: 'number' }, category: { type: 'string' }, description: { type: 'string' } }, required: ['type', 'amount', 'category', 'description'], additionalProperties: false } },
];

function validate(name, input) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool || !input || typeof input !== 'object') return 'Entrada inválida';
  for (const key of tool.input_schema.required) {
    const spec = tool.input_schema.properties[key];
    if (typeof input[key] !== spec.type) return `Campo "${key}" inválido`;
    if (spec.enum && !spec.enum.includes(input[key])) return `Valor inválido para "${key}"`;
  }
  return null;
}

function runTool(user, name, input) {
  if (name === 'create_task') {
    const p = mine('projects', user).find((x) => x.slug === input.project_slug);
    if (!p) throw new Error(`Projeto "${input.project_slug}" não existe`);
    const t = createTask(user.id, { projectId: p.id, title: input.title, priority: input.priority, dueDate: input.due_date });
    return { created: t.title };
  }
  if (name === 'update_task_status') return { updated: updateTask(user.id, input.task_id, { status: input.status }).title };
  if (name === 'add_finance_entry') {
    const page = indrivePage(user.id);
    if (!page) throw new Error('Página do InDrive não encontrada');
    return { registrado: addFinanceEntry(user.id, page, { type: input.type, amount: input.amount, category: input.category, description: input.description }) };
  }
  throw new Error('Ferramenta desconhecida');
}

// ---------- Conversas ----------
function store(userId) {
  const d = db();
  d.threads[userId] ??= { conversations: [] };
  d.threads[userId].conversations ??= [];
  return d.threads[userId];
}
const summary = (c) => ({
  id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt, count: c.display.length,
  last: c.display.at(-1) ? { role: c.display.at(-1).role, text: c.display.at(-1).text.slice(0, 120) } : null,
});
export function listConversations(userId) { return store(userId).conversations.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(summary); }
export function getConversation(userId, convId) { return store(userId).conversations.find((c) => c.id === convId) || null; }
export function createConversation(userId, title = 'Nova conversa') {
  const c = { id: id(), title: String(title).slice(0, 80), api: [], display: [], createdAt: now(), updatedAt: now() };
  store(userId).conversations.push(c);
  save();
  return c;
}
export function renameConversation(userId, convId, title) {
  const c = getConversation(userId, convId);
  if (c) { c.title = String(title || '').trim().slice(0, 80) || c.title; save(); }
  return c;
}
export function deleteConversation(userId, convId) {
  const s = store(userId);
  s.conversations = s.conversations.filter((c) => c.id !== convId);
  save();
}

// ---------- Claude ----------
async function runClaude(user, conv, text, write) {
  if (conv.api.length > MAX_API_MESSAGES) conv.api = [];
  const checkpoint = conv.api.length;
  conv.api.push({ role: 'user', content: [{ type: 'text', text: contextBlock(user) }, { type: 'text', text }] });
  let answer = '';
  const used = [];
  try {
    for (let step = 0; step < 6; step++) {
      const stream = getClient().beta.messages.stream({
        model: MODEL, max_tokens: 16000, system: systemPrompt(user, 'claude'), tools: TOOLS,
        output_config: { effort: EFFORT }, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default', messages: conv.api,
      });
      stream.on('text', (delta) => { answer += delta; write({ type: 'text', text: delta }); });
      const msg = await stream.finalMessage();
      conv.api.push({ role: 'assistant', content: msg.content });
      if (msg.stop_reason === 'refusal') { const n = 'Não posso ajudar com esse pedido.'; answer += n; write({ type: 'text', text: n }); break; }
      if (msg.stop_reason !== 'tool_use') break;
      const results = [];
      for (const block of msg.content) {
        if (block.type !== 'tool_use') continue;
        const error = validate(block.name, block.input);
        if (error) { results.push({ type: 'tool_result', tool_use_id: block.id, content: `INVALID_INPUT: ${error}`, is_error: true }); continue; }
        try { results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(runTool(user, block.name, block.input)) }); used.push(block.name); write({ type: 'tool', name: block.name }); }
        catch (e) { results.push({ type: 'tool_result', tool_use_id: block.id, content: e.message, is_error: true }); }
      }
      conv.api.push({ role: 'user', content: results });
    }
  } catch (err) { conv.api.length = checkpoint; throw err; }
  return { text: answer.trim(), tools: used };
}

// ---------- IA local (Ollama) ----------
async function runOllama(user, conv, text, write) {
  const { ollamaUrl } = aiConfig();
  const history = conv.display.slice(0, -1).slice(-OLLAMA_HISTORY).filter((m) => m.text)
    .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));
  const messages = [{ role: 'system', content: `${systemPrompt(user, 'ollama')}\n\n${contextBlock(user)}` }, ...history, { role: 'user', content: text }];
  const res = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: effectiveModel(), messages, stream: true, keep_alive: '5m', options: { temperature: 0.7, num_ctx: 4096 } }),
    signal: AbortSignal.timeout(10 * 60 * 1000),
  });
  if (!res.ok || !res.body) throw new Error(`Ollama respondeu ${res.status}`);
  let answer = '';
  let buf = '';
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const obj = JSON.parse(line);
      if (obj.error) throw new Error(obj.error);
      const piece = obj.message?.content || '';
      if (piece) { answer += piece; write({ type: 'text', text: piece }); }
    }
  }
  if (!answer.trim()) throw new Error('A IA local não respondeu');
  return { text: answer.trim(), tools: [] };
}

// ---------- Comandos rápidos ----------
const HELP = 'Comandos que eu entendo:\n'
  + '• /corrida 35 12km — entrada do InDrive (km opcional)\n'
  + '• /gasto 50 gasolina — saída do InDrive (categoria automática)\n'
  + '• /despesa 30 mercado · /receita 200 freela — finanças pessoais\n'
  + '• /tarefa Estudar SQL em Programação !alta 15/11 — nova tarefa\n'
  + '• /nota texto · /ideia texto · /link https://... — caixa de entrada\n'
  + '• /agenda 15/11 14:00 Dentista — compromisso\n'
  + '• /briefing — resumo do dia · /adiadas — tarefas que você vem adiando\n'
  + 'Também respondo dúvidas sobre o sistema: "como troco o tema?", "como importo o extrato?"…';

function parseMoney(s) {
  const m = s.match(/(?:r\$\s*)?(\d{1,6}(?:[.,]\d{1,2})?)/i);
  return m ? Number(m[1].replace(',', '.')) : null;
}
function parseDate(s) {
  const m = s.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (!m) return null;
  const y = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : String(new Date().getFullYear());
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}
const OUT_CATEGORIES = [
  [/combust|gasolin|etanol|alcool|diesel|gnv|abasteci/, 'Combustível'], [/manutenc|oficina|pneu|oleo|revis|mecanic|freio/, 'Manutenção'],
  [/almoc|janta|lanche|comida|cafe|aliment/, 'Alimentação'], [/lavag|lava.?jato|lavei/, 'Lavagem'], [/taxa|comiss/, 'Taxa/Comissão'],
  [/seguro|ipva|licenc/, 'Seguro/IPVA'], [/celular|internet|chip|dados/, 'Celular/Internet'],
];

function command(user, text) {
  const m = text.match(/^\/(\w+)\s*([\s\S]*)$/);
  if (!m) return null;
  const cmd = norm(m[1]);
  const arg = m[2].trim();
  const reply = (t, tools = []) => ({ text: t, tools });
  const s = prefs(user);
  const ok = pick((PERSONALITY[s.assistantPersonality] || PERSONALITY.amigavel).ok);
  const page = indrivePage(user.id);
  if (['ajuda', 'help', 'comandos'].includes(cmd)) return reply(HELP);
  if (['briefing', 'hoje', 'resumo'].includes(cmd)) return reply(briefing(user.id).text);
  if (['adiadas', 'procrastinacao', 'adiando'].includes(cmd)) return procrastinationReply(user);
  if (['corrida', 'ganho', 'entrada'].includes(cmd)) {
    const v = parseMoney(arg);
    if (!v) return reply('Use assim: /corrida 35 12km (valor e, se quiser, os km).');
    if (!page) return reply('Não encontrei a página do InDrive (fica em Trabalhos).');
    const km = arg.match(/(\d+(?:[.,]\d+)?)\s*km/i);
    const cat = /gorjeta/i.test(arg) ? 'Gorjeta' : /bonus|bônus/i.test(arg) ? 'Bônus/Promoção' : 'Corrida';
    const e = addFinanceEntry(user.id, page, { type: 'in', amount: v, category: cat, km: km ? km[1] : '', description: arg.replace(/^[\d.,]+\s*/, '').slice(0, 120) });
    const t = financeTotals(user.id, localDate(), localDate());
    return reply(`${ok} Entrada de **${brl(e.amount)}** (${cat}${e.km ? `, ${e.km} km` : ''}) no InDrive. Hoje: ${brl(t.in)} de entradas, saldo **${brl(t.net)}**.`, ['add_finance_entry']);
  }
  if (['gasto', 'saida', 'custo'].includes(cmd)) {
    const v = parseMoney(arg);
    if (!v) return reply('Use assim: /gasto 50 gasolina');
    if (!page) return reply('Não encontrei a página do InDrive (fica em Trabalhos).');
    const q = norm(arg);
    const cat = (OUT_CATEGORIES.find(([re]) => re.test(q)) || [null, 'Outros'])[1];
    const e = addFinanceEntry(user.id, page, { type: 'out', amount: v, category: cat, description: arg.replace(/^[\d.,]+\s*/, '').slice(0, 120) });
    const t = financeTotals(user.id, `${localDate().slice(0, 8)}01`, localDate());
    return reply(`${ok} Saída de **${brl(e.amount)}** em ${cat} no InDrive. Saldo do mês: **${brl(t.net)}**.`, ['add_finance_entry']);
  }
  if (['despesa', 'receita'].includes(cmd)) {
    const v = parseMoney(arg);
    if (!v) return reply(`Use assim: /${cmd} 30 mercado`);
    const desc = arg.replace(/^(?:r\$\s*)?[\d.,]+\s*/i, '').trim() || (cmd === 'receita' ? 'Receita' : 'Despesa');
    const amount = cmd === 'receita' ? v : -v;
    const item = { id: id(), userId: user.id, date: localDate(), desc: desc.slice(0, 160), amount, category: guessCategory(desc, amount), account: '', source: 'chat', createdAt: now(), updatedAt: now() };
    db().money.push(item);
    save();
    logEvent(user.id, 'money', 'create', `${cmd === 'receita' ? 'Receita' : 'Despesa'}: ${item.desc}`, { link: '#/financeiro', detail: brl(v) });
    return reply(`${ok} ${cmd === 'receita' ? 'Receita' : 'Despesa'} de **${brl(v)}** em ${item.category} registrada no Financeiro.`, ['money']);
  }
  if (cmd === 'tarefa') {
    if (!arg) return reply('Use assim: /tarefa Estudar SQL em Programação !alta 15/11');
    const projects = mine('projects', user);
    let title = arg;
    let project = null;
    const em = arg.match(/\s+(?:em|no|na)\s+([^!]+?)(?=\s+!|\s+\d{1,2}\/|$)/i);
    if (em) {
      project = projects.find((p) => norm(em[1]).includes(norm(p.name)) || norm(em[1]).includes(p.slug));
      if (project) title = title.replace(em[0], '');
    }
    const priority = /!alta|!urgente/i.test(arg) ? 'high' : /!baixa/i.test(arg) ? 'low' : 'medium';
    const dueDate = parseDate(arg);
    title = title.replace(/!\w+/g, '').replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/, '').trim();
    project ??= projects.find((p) => p.slug === 'trabalhos') || projects[0];
    const t = createTask(user.id, { projectId: project.id, title, priority, dueDate });
    return reply(`${ok} Tarefa **${t.title}** criada em ${project.name}${dueDate ? ` para ${dueDate.split('-').reverse().join('/')}` : ''}.`, ['create_task']);
  }
  if (['nota', 'ideia', 'link', 'anotar'].includes(cmd)) {
    if (!arg) return reply(`Use assim: /${cmd} seu texto`);
    const kind = cmd === 'link' || /^https?:\/\//.test(arg) ? 'link' : cmd === 'ideia' ? 'ideia' : 'nota';
    db().inbox.push({ id: id(), userId: user.id, text: arg.slice(0, 2000), kind, url: kind === 'link' ? (arg.match(/https?:\/\/\S+/) || [''])[0] : '', done: false, createdAt: now(), updatedAt: now() });
    save();
    logEvent(user.id, 'inbox', 'create', `Captura: ${arg.slice(0, 80)}`, { link: '#/hoje' });
    return reply(`${ok} Guardei na caixa de entrada (aba Hoje)${kind === 'link' ? ' como link para ler' : ''}.`, ['inbox']);
  }
  if (['agenda', 'compromisso', 'lembrar'].includes(cmd)) {
    const date = parseDate(arg) || localDate();
    const time = (arg.match(/\b([01]?\d|2[0-3])[:h]([0-5]\d)\b/) || []);
    const title = arg.replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/, '').replace(/\b([01]?\d|2[0-3])[:h]([0-5]\d)\b/, '').trim();
    if (!title) return reply('Use assim: /agenda 15/11 14:00 Dentista');
    const item = { id: id(), userId: user.id, title: title.slice(0, 160), date, time: time[0] ? `${time[1].padStart(2, '0')}:${time[2]}` : null, notes: '', done: false, createdAt: now(), updatedAt: now() };
    db().agenda.push(item);
    save();
    logEvent(user.id, 'agenda', 'create', `Compromisso: ${item.title}`, { link: '#/hoje' });
    return reply(`${ok} Compromisso **${item.title}** em ${date.split('-').reverse().join('/')}${item.time ? ` às ${item.time}` : ''}.`, ['agenda']);
  }
  return reply(`Não conheço o comando /${m[1]}. ${HELP}`);
}

function procrastinationReply(user) {
  const p = procrastination(user.id);
  if (!p.flagged.length) return { text: `Nada travado por aqui! Nenhuma tarefa adiada repetidamente. ${p.tips[0] || ''}`.trim(), tools: [] };
  const top = p.flagged.slice(0, 3).map((f) => `• **${f.title}** (${f.reasons.join(', ')})\n  → ${f.suggestion}`).join('\n');
  return { text: `Estas tarefas estão travando:\n${top}${p.tips.length ? `\n\n💡 ${p.tips[0]}` : ''}`, tools: [] };
}

// Ações em linguagem natural (sempre exatas). strict = há IA para conversar, então só age com frases claras.
const RIDE_WORDS = /corrida|indrive|uber|\b99\b|gorjeta|bonus|passageiro|\bapp\b/;
const CAR_COSTS = /combust|gasolin|etanol|alcool|diesel|gnv|abasteci|manutenc|oficina|pneu|oleo|revis|mecanic|freio|lavag|lava.?jato|lavei|taxa|comiss|seguro|ipva|licenc|indrive|corrida|carro|almoc|janta|lanche|comida|aliment/;
const NOT_RIDE = /\ba[cç](ao|oes|ões)\b|acoes|cripto|bitcoin|btc|ethereum|\bfii|tesouro|cdb|investi|poupanca|curso|livro|faculdade|aluguel|mercado|roupa|presente/;

function naturalAction(user, text, strict) {
  const q = norm(text);
  const money = parseMoney(text);
  const offTopic = NOT_RIDE.test(q) || (strict && /\?\s*$/.test(text));
  if (money && !offTopic && /(ganhei|recebi|faturei|entrou|corrida de|gorjeta|bonus)/.test(q) && !/gastei|paguei/.test(q) && (!strict || RIDE_WORDS.test(q))) {
    return command(user, `/corrida ${text.replace(/.*?(\d)/, '$1')}`);
  }
  if (money && !offTopic && /(gastei|paguei|abasteci|despesa|custo)/.test(q) && CAR_COSTS.test(q)) return command(user, `/gasto ${text.replace(/.*?(\d)/, '$1')}`);
  if (/quanto (eu )?(ganhei|lucrei|gastei|faturei)|saldo (do |no )?indrive|resumo (do |no )?indrive|meu saldo/.test(q)) {
    const period = /hoje/.test(q) ? 'today' : /semana/.test(q) ? 'week' : /tudo|total|geral/.test(q) ? 'all' : 'month';
    const today = localDate();
    const from = { today, week: (() => { const d = new Date(); d.setDate(d.getDate() - 6); return localDate(d); })(), month: `${today.slice(0, 8)}01`, all: '0000-01-01' }[period];
    const f = financeTotals(user.id, from, today);
    if (!f) return { text: 'Ainda não encontrei a página do InDrive (fica em Trabalhos).', tools: [] };
    const label = { today: 'hoje', week: 'nos últimos 7 dias', month: 'neste mês', all: 'no total' }[period];
    if (!f.count) return { text: `Nada lançado no InDrive ${label}. Registre com "/corrida 35" ou "/gasto 50 gasolina".`, tools: [] };
    return { text: `InDrive ${label}: entraram **${brl(f.in)}**, saíram **${brl(f.out)}** e o saldo ficou em **${brl(f.net)}** (${f.count} lançamentos)${f.km ? `, ${f.km} km rodados (${brl(f.in / f.km)}/km)` : ''}.`, tools: ['finance_summary'] };
  }
  const create = text.match(/(?:cri(?:e|ar)|adicion(?:e|ar)|nova)\s+(?:uma\s+)?tarefa\s*:?\s*["“]?(.+?)["”]?\s+(?:em|no|na|para)\s+(.+)$/i);
  if (create) return command(user, `/tarefa ${create[1]} em ${create[2]}`);
  const complete = text.match(/^\s*(?:conclu(?:ir|a|i)|finaliz(?:ar|e|ei)|marc(?:ar|e) como feit[ao])\s+(?:a\s+tarefa\s+)?["“]?(.+?)["”]?$/i);
  if (complete) {
    const t = mine('tasks', user).find((x) => x.status !== 'done' && norm(x.title).includes(norm(complete[1])));
    if (t) { updateTask(user.id, t.id, { status: 'done' }); return { text: `Feito ✅ **${t.title}** concluída. Mandou bem!`, tools: ['update_task_status'] }; }
  }
  if (/^(briefing|resumo do dia|meu dia|o que tenho (pra|para) hoje|agenda de hoje)/.test(q)) return { text: briefing(user.id).text, tools: [] };
  if (/(adiando|procrastin|travad|enrolando)/.test(q)) return procrastinationReply(user);
  return null;
}

function smallTalk(user, text) {
  const s = prefs(user);
  const P = PERSONALITY[s.assistantPersonality] || PERSONALITY.amigavel;
  const name = callName(user, s);
  const q = norm(text);
  const fill = (t) => t.replace('{n}', name).replace('{g}', timeGreeting());
  if (/^(oi|ola|opa|eai|e ai|bom dia|boa tarde|boa noite|hey|hello|salve)\b/.test(q)) {
    const b = briefing(user.id);
    return `${fill(pick(P.hello))} ${b.agenda.length ? `Você tem ${b.agenda.length} compromisso(s) hoje. ` : ''}${b.overdue.length ? `${b.overdue.length} tarefa(s) atrasada(s). ` : ''}Quer o briefing completo? É só mandar /briefing.`;
  }
  if (/tudo bem|como (voce|vc) esta|beleza\??$/.test(q)) return `Tudo ótimo por aqui! E com você, ${name}? Como posso ajudar hoje?`;
  if (/obrigad|valeu|vlw|brigad/.test(q)) return pick([`Por nada, ${name}!`, 'Imagina! Estou aqui pra isso.', 'Sempre que precisar!']);
  if (/quem (e|é) voce|o que voce faz|^ajuda$/.test(q)) return `Sou ${s.assistantName}, seu assistente aqui no Codeniac. ${HELP}`;
  return null;
}

// ---------- Entrada pública ----------
async function typeOut(result, write) {
  await sleep(Math.min(900, 300 + result.text.length * 2));
  for (const t of result.tools) write({ type: 'tool', name: t });
  for (const chunk of result.text.match(/\S+\s*/g) || []) { write({ type: 'text', text: chunk }); await sleep(10 + Math.random() * 14); }
}

export async function chat(user, text, convId, write) {
  const s = prefs(user);
  if (!s.assistantEnabled) { write({ type: 'text', text: 'O assistente está desativado nas Configurações.' }); return { conversationId: convId }; }
  let conv = convId ? getConversation(user.id, convId) : null;
  if (!conv) conv = createConversation(user.id);
  write({ type: 'conversation', id: conv.id });
  if (conv.title === 'Nova conversa' && !conv.display.length) conv.title = text.length > 42 ? `${text.slice(0, 40).trim()}…` : text;
  conv.display.push({ role: 'user', text, at: now() });
  conv.updatedAt = now();
  write({ type: 'typing' });

  let mode = assistantMode();
  let result = command(user, text) || naturalAction(user, text, mode !== 'local');
  if (!result) {
    const kb = searchKB(text);
    if (kb && (mode === 'local' || kb.score >= 3)) result = { text: kb.answer, tools: [], link: kb.link };
  }
  if (!result && mode === 'ollama') {
    try { result = await runOllama(user, conv, text, write); result.streamed = true; }
    catch (err) { console.error('[assistente] IA local falhou:', err?.message); refreshOllama(); write({ type: 'notice', text: 'IA local indisponível. Respondendo no modo básico.' }); mode = 'local'; }
  } else if (!result && mode === 'claude') {
    try { result = await runClaude(user, conv, text, write); result.streamed = true; }
    catch (err) { console.error('[assistente] Claude falhou:', err?.message); write({ type: 'notice', text: 'IA indisponível. Respondendo no modo básico.' }); mode = 'local'; }
  }
  if (!result) {
    const talk = smallTalk(user, text);
    const kb = searchKB(text);
    result = { text: talk || kb?.answer || pick([
      `Não tenho certeza se entendi, ${callName(user, s)}. Pergunte sobre o sistema ("como importo o extrato?") ou use um comando — mande /ajuda para ver todos.`,
      'Hmm, essa eu não sei responder sem IA. Tente /ajuda para ver o que eu faço, ou uma pergunta sobre o Codeniac.',
    ]), tools: [], link: talk ? null : kb?.link };
  }
  if (!s.assistantEmoji) result.text = result.text.replace(/\p{Extended_Pictographic}️?/gu, '').replace(/ {2,}/g, ' ').trim();
  if (!result.streamed) await typeOut(result, write);
  if (result.link) write({ type: 'link', href: result.link });
  conv.display.push({ role: 'assistant', text: result.text, at: now(), mode, tools: result.tools, link: result.link || null });
  if (conv.display.length > 400) conv.display = conv.display.slice(-400);
  conv.updatedAt = now();
  save();
  return { conversationId: conv.id };
}

export const PERSONALITY_LABELS = Object.fromEntries(Object.entries(PERSONALITY).map(([k, v]) => [k, v.label]));
