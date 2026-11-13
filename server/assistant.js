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
import { logEvent, emit } from './notify.js';
import { chatFile } from './routes/chatfiles.js';
import { toolDeclarations, callTool, memoriesBlock, areasOf, AREAS } from './agent.js';
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
const AI_DEFAULT = { provider: 'local', model: '', ollamaUrl: DEFAULT_OLLAMA, geminiModel: 'gemini-flash-latest' };
export const PROVIDERS = ['auto', 'gemini', 'ollama', 'claude', 'local'];

// Gemini (Google AI Studio): a chave fica no .env da pasta de dados (GEMINI_API_KEY), nunca no banco nem no backup.
export const GEMINI_MODELS = [
  { name: 'gemini-flash-latest', label: 'Gemini Flash (recomendado)', desc: 'rápido e inteligente, sempre a versão mais nova' },
  { name: 'gemini-flash-lite-latest', label: 'Gemini Flash-Lite', desc: 'o mais rápido e com a maior cota gratuita' },
  { name: 'gemini-pro-latest', label: 'Gemini Pro', desc: 'o mais inteligente, mais lento e com cota menor' },
];
// Se um modelo estiver ocupado, sem cota ou aposentado pelo Google, tenta o próximo.
const GEMINI_FALLBACK = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-pro-latest'];
const GEMINI_HISTORY = 20;
export const hasGemini = () => Boolean(process.env.GEMINI_API_KEY);

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
  if (typeof patch.geminiModel === 'string' && /^[\w.\-]{1,60}$/.test(patch.geminiModel)) c.geminiModel = patch.geminiModel;
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
  if (provider === 'gemini') return hasGemini() ? 'gemini' : 'local';
  if (hasGemini()) return 'gemini';
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

// Personagem do chat (criado em "Novo chat"): muda nome, personalidade e características.
export function botOf(user, conv) {
  if (!conv?.botId) return null;
  return db().bots.find((b) => b.id === conv.botId && b.userId === user.id) || null;
}

// Jeito de escrever: humano, como conversa de mensageiro (vale para a IA em qualquer personagem).
const STYLE = `Jeito de escrever: como uma pessoa conversando por mensagem, nunca como robô ou manual.
- Frases naturais e variadas. Use o português falado do dia a dia ("tá", "pra", "né", "bora") quando combinar com a personalidade.
- Vá direto ao ponto. Não comece com "Claro!", "Com certeza!", "Ótima pergunta!" nem diga que é uma IA.
- Evite listas, títulos e negrito em excesso; prefira um ou dois parágrafos curtos. Use lista só se a pessoa pedir passo a passo ou muitos dados.
- Mostre que lembra do que foi conversado e reaja com emoção quando fizer sentido (comemore, se preocupe, brinque).
- No máximo uma pergunta por mensagem e não repita o nome da pessoa em toda resposta.
- Escreva valores sempre com R$ e números (ex.: R$ 180,50) e datas no formato 12/11 — nada de valores por extenso ou gírias para dinheiro.
- Se a pessoa enviar foto ou PDF, leia com atenção e responda exatamente o que ela pediu; cite números e trechos do arquivo quando ajudar.`;

function agentRules(bot) {
  const areas = areasOf(bot);
  return `Você pode AGIR no Codeniac com ferramentas. Consultar dados é sempre permitido; alterar só nestas áreas: ${areas.map((a) => AREAS[a]).join(', ') || 'nenhuma (apenas consulta)'}.
- Quando a pessoa pedir uma ação (registrar, criar, concluir, mudar, pagar, marcar...), use as ferramentas, mesmo que seja um pedido com várias ações numa frase só. Depois confirme em uma frase curta o que foi feito.
- NUNCA diga que fez, guardou, registrou ou anotou algo sem ter chamado a ferramenta correspondente nesta resposta. Se não conseguir, diga a verdade.
- Nunca invente números: consulte antes (ferramentas consultar/estatisticas). Use as datas no formato AAAA-MM-DD; hoje é ${localDate()}.
- Se receber foto de nota fiscal, recibo, fatura ou boleto e a pessoa pedir para lançar, leia os valores e registre (gasto, conta a pagar ou InDrive, conforme o caso).
- Se pedirem algo fora das suas áreas, explique com leveza que outro personagem (ou o Niac) cuida disso.
- Algumas ações pedem confirmação: nesse caso avise que é só tocar em "Confirmar" no cartão que apareceu.
- Quando a pessoa contar algo duradouro sobre ela (meta, gosto, rotina, pessoa importante) ou pedir para lembrar, chame guardar_memoria (uma vez por fato).
- Ao ensinar uma palavra útil em inglês, crie um cartão com criar_cartao_ingles (se tiver permissão).`;
}

function systemPrompt(user, mode = 'claude', bot = null) {
  const s = prefs(user);
  const p = PERSONALITY[bot?.personality || s.assistantPersonality] || PERSONALITY.amigavel;
  if (bot) {
    return `Você é ${bot.name}, um personagem criado pelo usuário dentro do Codeniac (hub pessoal de projetos, rotina, InDrive, finanças e estudos).
Fique sempre no personagem.
Personalidade: ${p.prompt}
${bot.traits ? `Características, jeito de falar e história do personagem (definidas pelo usuário):\n${bot.traits}\n` : ''}Chame o usuário de "${callName(user, s)}". ${LENGTH[s.assistantLength] || LENGTH.media}
Cada mensagem chega com um bloco <contexto_codeniac> com o estado atual do hub; use se for útil e não o mencione.
Responda em português do Brasil, a menos que o personagem ou o usuário peçam outro idioma.
${EXPERTISE}
${STYLE}
${mode === 'gemini' ? agentRules(bot) : 'Se a pessoa quiser registrar algo, sugira que ela escreva naturalmente, por exemplo "gastei 87,63 no mercado" ou "tarefa: estudar SQL" — o próprio sistema registra. Nunca diga que você registrou algo.'}${memoriesBlock(user)}`;
  }
  return `Você é ${s.assistantName}, o assistente integrado do Codeniac, um hub pessoal (projetos, rotina, InDrive, finanças, estudos).
Cada mensagem chega com um bloco <contexto_codeniac> com o estado atual; use-o e não o mencione.
Personalidade: ${p.prompt}
Chame o usuário de "${callName(user, s)}". ${LENGTH[s.assistantLength] || LENGTH.media} ${s.assistantEmoji ? 'Use emojis com moderação.' : 'Não use emojis.'}
Responda em português do Brasil, exceto na prática de inglês.
${STYLE}
${EXPERTISE}
${mode === 'claude' ? 'Use as ferramentas para criar/concluir tarefas e registrar entradas/saídas do InDrive; confirme em uma frase.' : mode === 'gemini' ? agentRules(null) : 'Se a pessoa quiser registrar algo, sugira que ela escreva naturalmente, por exemplo "gastei 87,63 no mercado" ou "tarefa: estudar SQL" — o próprio sistema registra. Nunca diga que você registrou algo.'}${memoriesBlock(user)}${s.assistantInstructions ? `\n\nInstruções pessoais do usuário:\n${s.assistantInstructions}` : ''}`;
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
  id: c.id, title: c.title, botId: c.botId || null, unread: c.unread || 0,
  group: c.group ? { name: c.group.name, avatar: c.group.avatar || null, members: c.group.members } : null, createdAt: c.createdAt, updatedAt: c.updatedAt, count: c.display.length,
  last: c.display.at(-1) ? { role: c.display.at(-1).role, botId: c.display.at(-1).botId || null, text: (c.display.at(-1).text || (c.display.at(-1).files?.length ? '📎 Arquivo' : '')).slice(0, 120) } : null,
});
export function listConversations(userId) { return store(userId).conversations.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(summary); }
export function getConversation(userId, convId) { return store(userId).conversations.find((c) => c.id === convId) || null; }
export function createConversation(userId, title = 'Nova conversa', bot = null, group = null) {
  const c = { id: id(), title: String(title).slice(0, 80), botId: bot?.id || null, api: [], display: [], createdAt: now(), updatedAt: now() };
  if (group) c.group = group;
  if (bot?.greeting) c.display.push({ role: 'assistant', text: bot.greeting, at: now(), mode: 'local', tools: [] });
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
        model: MODEL, max_tokens: 16000, system: systemPrompt(user, 'claude', botOf(user, conv)), tools: TOOLS,
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
  const messages = [{ role: 'system', content: `${systemPrompt(user, 'ollama', botOf(user, conv))}\n\n${contextBlock(user)}` }, ...history, { role: 'user', content: text }];
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
    idle();
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

// ---------- Gemini (Google) ----------
async function geminiStream(model, body, write, full = false) {
  // tempos curtos: se o modelo travar (sobrecarga), desiste logo e tenta o próximo modelo
  const ctrl = new AbortController();
  let timer = setTimeout(() => ctrl.abort(new Error('O Gemini demorou para começar a responder')), 25000);
  const idle = () => { clearTimeout(timer); timer = setTimeout(() => ctrl.abort(new Error('O Gemini parou de responder')), 30000); };
  const total = setTimeout(() => ctrl.abort(new Error('Resposta longa demais')), 180000);
  try {
    return await geminiStreamInner(model, body, write, full, ctrl.signal, idle);
  } catch (err) {
    if (ctrl.signal.aborted) { const e = new Error(ctrl.signal.reason?.message || 'Tempo esgotado'); e.status = 504; throw e; }
    throw err;
  } finally { clearTimeout(timer); clearTimeout(total); }
}

async function geminiStreamInner(model, body, write, full, signal, idle) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify(body),
    signal,
  });
  idle();
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(err.error?.message || `Gemini respondeu ${res.status}`);
    e.status = res.status;
    throw e;
  }
  let answer = '';
  let buf = '';
  let blocked = null;
  const rawParts = [];
  const decoder = new TextDecoder();
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0 || (i = buf.indexOf('\r\n\r\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + (buf[i] === '\r' ? 4 : 2));
      const line = block.split(/\r?\n/).find((l) => l.startsWith('data:'));
      if (!line) continue;
      const obj = JSON.parse(line.slice(5).trim());
      if (obj.error) throw new Error(obj.error.message);
      const cand = obj.candidates?.[0];
      if (obj.promptFeedback?.blockReason) blocked = obj.promptFeedback.blockReason;
      if (cand?.finishReason === 'SAFETY') blocked = 'SAFETY';
      for (const p of cand?.content?.parts || []) rawParts.push(p);
      const piece = (cand?.content?.parts || []).filter((p) => p.text && !p.thought).map((p) => p.text).join('');
      if (piece) { answer += piece; write({ type: 'text', text: piece }); }
    }
  }
  const calls = rawParts.filter((p) => p.functionCall);
  if (full) return { text: answer, parts: rawParts, calls, blocked };
  if (!answer.trim() && blocked) return 'Prefiro não responder a esse pedido. Posso ajudar com outra coisa?';
  if (!answer.trim()) throw new Error('O Gemini não respondeu');
  return answer.trim();
}

// Envia um arquivo grande para a File API do Gemini (válido por ~48 h) e reaproveita o endereço.
const fileUris = new Map();
async function geminiUpload(full, mime, displayName) {
  const st = fs.statSync(full);
  const key = `${full}:${st.size}:${st.mtimeMs}`;
  const cached = fileUris.get(key);
  if (cached && Date.now() - cached.at < 40 * 3600 * 1000) return cached.uri;
  const boundary = `cdn${Date.now()}`;
  const meta = JSON.stringify({ file: { display_name: String(displayName || 'arquivo').slice(0, 100) } });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),
    fs.readFileSync(full), Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const res = await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=multipart', {
    method: 'POST', headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': `multipart/related; boundary=${boundary}` }, body, signal: AbortSignal.timeout(300000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || `Envio do arquivo falhou (${res.status})`);
  let file = data.file;
  for (let i = 0; i < 30 && file.state === 'PROCESSING'; i++) {
    await sleep(2000);
    file = await (await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}`, { headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY } })).json();
  }
  if (file.state === 'FAILED') throw new Error('O Gemini não conseguiu processar o arquivo');
  fileUris.set(key, { uri: file.uri, at: Date.now() });
  return file.uri;
}

async function partsOfAsync(user, m, budget) {
  const parts = [];
  for (const f of m.files || []) {
    const info = chatFile(user.id, f.file);
    if (!info) { parts.push({ text: `[anexo indisponível: ${f.name || f.file}]` }); continue; }
    if (info.mime === 'application/epub+zip') { parts.push({ text: `[o livro "${f.name}" está em EPUB, formato que a IA não consegue ler; peça o PDF]` }); continue; }
    if (budget.left >= info.size) {
      budget.left -= info.size;
      parts.push({ inlineData: { mimeType: info.mime, data: fs.readFileSync(info.full).toString('base64') } });
    } else if (info.size <= 1024 * 1024 * 1024) {
      try { parts.push({ fileData: { mimeType: info.mime, fileUri: await geminiUpload(info.full, info.mime, f.name) } }); }
      catch (err) { console.error('[arquivo]', err.message); parts.push({ text: `[não consegui enviar o arquivo ${f.name}: ${err.message}]` }); }
    } else parts.push({ text: `[arquivo grande demais: ${f.name}]` });
  }
  if (m.text) parts.push({ text: m.text });
  if (!parts.length) parts.push({ text: '(mensagem vazia)' });
  return parts;
}

// Monta as partes de uma mensagem: texto + fotos/PDFs (enquanto couber no limite de envio).
function partsOf(user, m, budget) {
  const parts = [];
  for (const f of m.files || []) {
    const info = chatFile(user.id, f.file);
    if (info && budget.left >= info.size) {
      budget.left -= info.size;
      parts.push({ inlineData: { mimeType: info.mime, data: fs.readFileSync(info.full).toString('base64') } });
    } else parts.push({ text: `[anexo enviado antes: ${f.name || f.file}]` });
  }
  if (m.text) parts.push({ text: m.text });
  if (!parts.length) parts.push({ text: '(mensagem vazia)' });
  return parts;
}

async function geminiCall(body, write = () => {}, full = false) {
  const wanted = aiConfig().geminiModel || GEMINI_FALLBACK[0];
  const models = [wanted, ...GEMINI_FALLBACK.filter((m) => m !== wanted)];
  let lastErr;
  for (const model of models) {
    try { return await geminiStream(model, body, write, full); }
    catch (err) {
      lastErr = err;
      console.error(`[assistente] Gemini ${model}: ${err.status || ''} ${err.message}`);
      // chave inválida ou sem permissão: não adianta trocar de modelo
      if ([401, 403].includes(err.status) || /api key/i.test(err.message)) throw err;
    }
  }
  throw lastErr;
}

const MEMORY_HINT = /\b(meu objetivo|minha meta|eu quero|pretendo|sonho|eu (odeio|amo|adoro|gosto|prefiro|detesto)|nao gosto|lembra que|lembre que|guarda isso|guarde isso|nao esquece|anota que eu|minha (esposa|mulher|namorada|mae|filha|irma)|meu (marido|namorado|pai|filho|irmao|cachorro|gato)|eu trabalho|eu moro|eu estudo|sou alergico|meu aniversario)\b/;
// Pede ao Gemini só a lista de fatos duradouros da mensagem e guarda (sem repetir os já salvos).
async function extractMemories(ctx, text) {
  const known = db().memories.filter((m) => m.userId === ctx.user.id).map((m) => m.text);
  const out = await geminiCall({
    contents: [{ role: 'user', parts: [{ text: `Mensagem do usuário: "${text}"\nMemórias já salvas: ${JSON.stringify(known.slice(-40))}\n\nListe SOMENTE fatos duradouros novos sobre o usuário (metas, gostos, rotina, pessoas, trabalho), cada um como frase curta em terceira pessoa. Responda apenas um JSON: {"fatos": ["..."]}. Se não houver, {"fatos": []}.` }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 400, responseMimeType: 'application/json' },
  });
  const fatos = (JSON.parse(out).fatos || []).slice(0, 5);
  for (const fato of fatos) callTool({ ...ctx, write: null }, 'guardar_memoria', { fato });
}

async function runGemini(user, conv, text, write, actions = []) {
  const budget = { left: 14 * 1024 * 1024 }; // limite seguro de anexos por pedido
  const recent = conv.display.slice(-GEMINI_HISTORY).filter((m) => m.text || m.files?.length);
  // do mais novo para o mais antigo, para os anexos recentes terem prioridade
  const contents = [];
  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i];
    contents.unshift({ role: m.role === 'user' ? 'user' : 'model', parts: await partsOfAsync(user, m, budget) });
  }
  while (contents.length && contents[0].role !== 'user') contents.shift();
  const bot = botOf(user, conv);
  const kb = searchKB(text);
  const manual = kb && kb.score >= 1.5 ? `\n\n<manual_codeniac>\n${kb.answer}\n</manual_codeniac>\nSe a pergunta for sobre o sistema, baseie-se nesse trecho do manual.` : '';
  const body = {
    systemInstruction: { parts: [{ text: `${systemPrompt(user, 'gemini', bot)}\n\n${contextBlock(user)}${manual}` }] },
    contents,
    tools: [{ functionDeclarations: toolDeclarations(bot) }],
    generationConfig: { temperature: 0.8, maxOutputTokens: 4096 },
  };
  const ctx = { user, conv, bot, write, actions };
  let answer = '';
  for (let round = 0; round < 6; round++) {
    const r = await geminiCall(body, write, true);
    answer += r.text;
    if (!r.calls.length) {
      if (!answer.trim() && r.blocked) answer = 'Prefiro não responder a esse pedido. Posso ajudar com outra coisa?';
      break;
    }
    // devolve a resposta do modelo (com as assinaturas) e o resultado de cada ferramenta
    body.contents.push({ role: 'model', parts: r.parts });
    const responses = r.calls.map(({ functionCall: fc }) => {
      const out = callTool(ctx, fc.name, fc.args || {});
      if (process.env.CODENIAC_DEBUG_TOOLS) console.log('[ferramenta]', fc.name, JSON.stringify(fc.args), '->', JSON.stringify(out).slice(0, 200));
      return { functionResponse: { ...(fc.id ? { id: fc.id } : {}), name: fc.name, response: out.error ? { erro: out.error } : (out.result || { ok: true }) } };
    });
    body.contents.push({ role: 'user', parts: responses });
    if (answer && !/\s$/.test(answer)) { answer += '\n\n'; write({ type: 'text', text: '\n\n' }); }
  }
  if (MEMORY_HINT.test(norm(text)) && !actions.some((a) => /^Memória/.test(a.summary)) && areasOf(bot).includes('memoria')) {
    extractMemories(ctx, text).catch((e) => console.error('[memória]', e.message));
  }
  if (!answer.trim()) {
    answer = actions.length ? 'Pronto!' : 'Hmm, não consegui responder agora.';
    write({ type: 'text', text: answer });
  }
  return { text: answer.trim(), tools: [] };
}

// Confere se uma chave funciona (usado ao salvar a chave nas Configurações).
export async function testGeminiKey(key) {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(15000) });
  if (res.ok) return { ok: true };
  const err = await res.json().catch(() => ({}));
  return { ok: false, error: err.error?.message || `O Google respondeu ${res.status}` };
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
  // finanças pessoais em linguagem natural: "gastei 87,63 no mercado", "recebi 2000 de salário"
  if (money && !/\?\s*$/.test(text) && /(gastei|paguei|comprei)/.test(q) && !CAR_COSTS.test(q)) return command(user, `/despesa ${text.replace(/.*?(\d)/, '$1').replace(/^([\d.,]+)\s+(?:reais\s+)?(?:n[oa]s?|em|com|de)\s+/i, '$1 ')}`);
  if (money && !/\?\s*$/.test(text) && /(recebi|ganhei|entrou)/.test(q) && !RIDE_WORDS.test(q) && /(salari|freela|pix|pagamento|venda|reembolso|extra)/.test(q)) return command(user, `/receita ${text.replace(/.*?(\d)/, '$1').replace(/^([\d.,]+)\s+(?:reais\s+)?(?:n[oa]s?|em|com|de)\s+/i, '$1 ')}`);
  const note = text.match(/^\s*(?:anota|anote|lembra|lembre(?:-me)?|me lembra)\s+(?:que|de|pra|para)?\s*(.{3,})$/i);
  if (note) return command(user, `/nota ${note[1]}`);
  const quick = text.match(/^\s*(?:nova\s+)?tarefa\s*:\s*(.{3,})$/i);
  if (quick) return command(user, `/tarefa ${quick[1]}`);
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

function smallTalk(user, text, bot = null) {
  const s = prefs(user);
  const P = PERSONALITY[bot?.personality || s.assistantPersonality] || PERSONALITY.amigavel;
  const name = callName(user, s);
  const q = norm(text);
  const fill = (t) => t.replace('{n}', name).replace('{g}', timeGreeting());
  if (/^(oi|ola|opa|eai|e ai|bom dia|boa tarde|boa noite|hey|hello|salve)\b/.test(q)) {
    const b = briefing(user.id);
    return `${fill(pick(P.hello))} ${b.agenda.length ? `Você tem ${b.agenda.length} compromisso(s) hoje. ` : ''}${b.overdue.length ? `${b.overdue.length} tarefa(s) atrasada(s). ` : ''}Quer o briefing completo? É só mandar /briefing.`;
  }
  if (/tudo bem|como (voce|vc) esta|beleza\??$/.test(q)) return `Tudo ótimo por aqui! E com você, ${name}? Como posso ajudar hoje?`;
  if (/obrigad|valeu|vlw|brigad/.test(q)) return pick([`Por nada, ${name}!`, 'Imagina! Estou aqui pra isso.', 'Sempre que precisar!']);
  if (/quem (e|é) voce|o que voce faz|^ajuda$/.test(q)) return `Sou ${bot?.name || s.assistantName}, ${bot ? 'um personagem' : 'seu assistente'} aqui no Codeniac. ${HELP}`;
  return null;
}

// ---------- Entrada pública ----------
async function typeOut(result, write) {
  await sleep(Math.min(900, 300 + result.text.length * 2));
  for (const t of result.tools) write({ type: 'tool', name: t });
  for (const chunk of result.text.match(/\S+\s*/g) || []) { write({ type: 'text', text: chunk }); await sleep(10 + Math.random() * 14); }
}

// ---------- Grupos: vários personagens conversando entre si (Gemini) ----------
export const NIAC = (user) => { const s = prefs(user); return { id: 'niac', name: s.assistantName || 'Niac', personality: s.assistantPersonality, traits: 'O assistente oficial do Codeniac: conhece todo o sistema do usuário.', avatar: null, isNiac: true }; };
export function groupMembers(user, conv) {
  return (conv.group?.members || []).map((mid) => (mid === 'niac' ? NIAC(user) : db().bots.find((b) => b.id === mid && b.userId === user.id))).filter(Boolean);
}
const shuffle = (a) => a.map((x) => [Math.random(), x]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

export async function groupTurn(user, conv, bot, members, write, nudge) {
  const s = prefs(user);
  const others = members.filter((m) => m.id !== bot.id).map((m) => m.name);
  const nameOf = (m) => (m.role === 'user' ? callName(user, s) : (members.find((x) => x.id === m.botId)?.name || 'Alguém'));
  const recent = conv.display.slice(-30);
  const transcript = recent.map((m) => `${nameOf(m)}: ${m.text || ''}${m.files?.length ? ` [enviou ${m.files.map((f) => f.name).join(', ')}]` : ''}`).join('\n');
  const lastUser = [...recent].reverse().find((m) => m.role === 'user');
  const budget = { left: 10 * 1024 * 1024 };
  const fileParts = lastUser?.files?.length ? partsOf(user, { files: lastUser.files }, budget).filter((p) => p.inlineData) : [];
  const body = {
    systemInstruction: { parts: [{ text: `${systemPrompt(user, 'gemini', bot.isNiac ? null : bot)}

Você está num grupo de mensagens chamado "${conv.group.name}" com ${callName(user, s)} e ${others.join(', ') || 'mais ninguém'}.
Cada um tem sua personalidade: ${members.map((m) => `${m.name} (${(PERSONALITY[m.personality] || PERSONALITY.amigavel).label}${m.traits ? `: ${m.traits.slice(0, 120)}` : ''})`).join('; ')}.
Escreva SOMENTE a sua próxima mensagem no grupo, como ${bot.name}: curta (1 a 3 frases), natural, sem colocar seu nome na frente.
Pode concordar, discordar, brincar, perguntar ou responder diretamente a outro participante pelo nome. Não repita o que já foi dito.

${contextBlock(user)}` }] },
    contents: [{ role: 'user', parts: [...fileParts, { text: `Conversa até agora:\n${transcript || '(o grupo acabou de ser criado)'}\n\n${nudge || ''}Agora é a vez de ${bot.name}.` }] }],
    generationConfig: { temperature: 0.95, maxOutputTokens: 2048 },
  };
  let text = await geminiCall(body);
  text = text.replace(new RegExp(`^\\s*\\**${bot.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\**\\s*:\\s*`, 'i'), '').trim();
  write({ type: 'speaker', botId: bot.id, name: bot.name });
  await sleep(Math.min(1400, 350 + text.length * 6));
  for (const chunk of text.match(/\S+\s*/g) || []) { write({ type: 'text', text: chunk }); await sleep(8 + Math.random() * 12); }
  write({ type: 'speaker_end' });
  conv.display.push({ role: 'assistant', botId: bot.id, text, at: now(), mode: 'gemini' });
  conv.updatedAt = now();
  save();
}

async function runGroup(user, conv, text, write, auto) {
  const members = groupMembers(user, conv);
  if (!members.length) { write({ type: 'notice', text: 'Este grupo não tem participantes. Adicione personagens nas configurações do grupo.' }); return; }
  if (!hasGemini()) {
    write({ type: 'notice', text: 'Grupos precisam do Gemini para os personagens conversarem. Ligue em Configurações → Assistente.' });
    return;
  }
  let order;
  if (auto) {
    // os personagens conversam entre si por algumas rodadas
    const n = Math.min(4, Math.max(2, members.length + 1));
    order = [];
    for (let i = 0; i < n; i++) {
      const pool = members.filter((m) => m.id !== order.at(-1)?.id);
      order.push(pool[Math.floor(Math.random() * pool.length)] || members[0]);
    }
  } else {
    const q = norm(text);
    const named = members.filter((m) => q.includes(norm(m.name).split(' ')[0]));
    order = [...named, ...shuffle(members.filter((m) => !named.includes(m)))].slice(0, Math.min(3, members.length));
  }
  for (const [i, bot] of order.entries()) {
    try {
      await groupTurn(user, conv, bot, members, write, auto && i === 0 ? 'Puxem um assunto entre vocês (algo do dia do usuário, de interesse dos personagens ou uma brincadeira). ' : '');
    } catch (err) {
      console.error('[grupo]', err.message);
      write({ type: 'notice', text: err.status === 429 ? 'Cota do Gemini esgotada por agora. Tente de novo em alguns minutos.' : 'O Gemini não respondeu agora.' });
      break;
    }
    if (i < order.length - 1) await sleep(500 + Math.random() * 700);
  }
}

// ---------- Mensagens automáticas dos personagens ----------
export const FOCUS = { geral: 'Rotina em geral', financas: 'Finanças pessoais', indrive: 'InDrive e carro', tarefas: 'Tarefas e prazos', estudos: 'Estudos e leitura', ingles: 'Inglês', habitos: 'Hábitos e bem-estar' };
const brlx = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export function focusData(user, focus) {
  const b = briefing(user.id);
  const today = localDate();
  const month = today.slice(0, 7);
  const money = mine('money', user).filter((m) => m.date.startsWith(month));
  const inc = money.filter((m) => m.amount > 0).reduce((a, m) => a + m.amount, 0);
  const exp = -money.filter((m) => m.amount < 0).reduce((a, m) => a + m.amount, 0);
  const allBills = mine('bills', user).filter((x) => !x.paid).sort((x, y) => (x.due || '').localeCompare(y.due || '')).slice(0, 5);
  const lines = {
    financas: [`Mês: entradas ${brlx(inc)}, saídas ${brlx(exp)}, saldo ${brlx(inc - exp)}.`,
      allBills.length ? `Contas a pagar: ${allBills.map((x) => `${x.name} ${x.amount ? brlx(x.amount) : ''} vence ${x.due.split('-').reverse().join('/')}${x.due < today ? ' (ATRASADA)' : ''}`).join('; ')}.` : 'Nenhuma conta pendente cadastrada.',
      b.subs.length ? `Assinaturas cobrando em breve: ${b.subs.map((x) => `${x.name} ${brlx(x.amount)} em ${x.next.split('-').reverse().join('/')}`).join('; ')}.` : '',
      b.finMonth?.count ? `InDrive no mês: saldo ${brlx(b.finMonth.net)}.` : ''],
    indrive: [b.finYesterday?.count ? `Ontem no InDrive: entradas ${brlx(b.finYesterday.in)}, saldo ${brlx(b.finYesterday.net)}.` : 'Ontem não teve lançamento no InDrive.',
      b.finMonth?.count ? `Mês: entradas ${brlx(b.finMonth.in)}, saídas ${brlx(b.finMonth.out)}, saldo ${brlx(b.finMonth.net)}, ${b.finMonth.km || 0} km.` : 'Sem lançamentos no mês ainda.',
      b.services.length ? `Manutenção: ${b.services.map((x) => x.label).join('; ')}.` : '', b.docs.length ? `Documentos vencendo: ${b.docs.map((x) => `${x.name} em ${x.days} dias`).join('; ')}.` : ''],
    tarefas: [b.overdue.length ? `Atrasadas: ${b.overdue.slice(0, 4).map((t) => t.title).join('; ')}.` : 'Nada atrasado.', b.dueToday.length ? `Vencem hoje: ${b.dueToday.map((t) => t.title).join('; ')}.` : '',
      b.priorities.length ? `Prioridades: ${b.priorities.slice(0, 3).map((t) => t.title).join('; ')}.` : '', b.procrastination.length ? `Vem adiando: "${b.procrastination[0].title}".` : '',
      b.agenda.length ? `Agenda de hoje: ${b.agenda.map((a) => `${a.time || ''} ${a.title}`).join('; ')}.` : ''],
    estudos: [b.cardsDue ? `${b.cardsDue} cartões de inglês para revisar.` : 'Cartões de inglês em dia.', (() => { const r = mine('books', user).find((x) => x.status === 'lendo'); return r ? `Lendo "${r.title}" (página ${r.current || 0}${r.pages ? ` de ${r.pages}` : ''}).` : ''; })()],
    ingles: [b.cardsDue ? `${b.cardsDue} cartões de inglês para revisar hoje.` : 'Cartões em dia.', 'Proponha uma mini prática: uma pergunta simples em inglês para o usuário responder.'],
    habitos: [b.habits.length ? `Hábitos: ${b.habits.map((h) => `${h.name} ${h.done ? 'feito hoje' : 'pendente'} (sequência ${h.streak})`).join('; ')}.` : 'Nenhum hábito cadastrado.'],
    geral: [b.text],
  };
  return (lines[focus] || lines.geral).filter(Boolean).join('\n');
}

function localProactive(user, bot, focus) {
  const s = prefs(user);
  const P = PERSONALITY[bot.personality] || PERSONALITY.amigavel;
  const hi = pick(P.hello).replace('{n}', callName(user, s)).replace('{g}', timeGreeting());
  const b = briefing(user.id);
  const today = localDate();
  if (focus === 'financas') {
    const bill = mine('bills', user).filter((x) => !x.paid && x.due).sort((x, y) => x.due.localeCompare(y.due))[0];
    if (bill) return `${hi} Passando pra lembrar: ${bill.name}${bill.amount ? ` (${brlx(bill.amount)})` : ''} ${bill.due < today ? 'já venceu, hein' : bill.due === today ? 'vence hoje' : `vence dia ${bill.due.split('-').reverse().slice(0, 2).join('/')}`}. ${pick(P.close)}`;
    if (b.subs.length) return `${hi} Daqui a pouco tem cobrança de ${b.subs[0].name} (${brlx(b.subs[0].amount)}). Ainda vale a pena manter?`;
    return `${hi} Suas contas estão em dia por aqui. Que tal lançar os gastos de hoje antes de esquecer?`;
  }
  if (focus === 'indrive') return b.finYesterday?.count ? `${hi} Ontem você fechou o InDrive com ${brlx(b.finYesterday.net)} de saldo. Bora pra mais um dia?` : `${hi} Vai rodar hoje? Lembra de iniciar o turno na Garagem pra eu calcular quanto rende por hora.`;
  if (focus === 'tarefas') return b.overdue.length ? `${hi} Tem ${b.overdue.length} tarefa(s) atrasada(s), começando por "${b.overdue[0].title}". Que tal resolver essa primeiro?` : b.priorities[0] ? `${hi} Sua prioridade agora é "${b.priorities[0].title}". Consegue dar um passo nela hoje?` : `${hi} Nenhuma tarefa pendente. Dia livre pra adiantar algo importante!`;
  if (focus === 'estudos' || focus === 'ingles') return b.cardsDue ? `${hi} Tem ${b.cardsDue} cartões de inglês te esperando. Uns 10 minutinhos e já era!` : `${hi} Que tal 15 minutos de leitura ou inglês agora?`;
  if (focus === 'habitos') { const p = b.habits.find((h) => !h.done); return p ? `${hi} Ainda falta "${p.name}" hoje. Sua sequência tá em ${p.streak} dia(s), não deixa quebrar!` : `${hi} Todos os hábitos de hoje feitos. Mandou muito bem! 🔥`; }
  return `${hi} ${b.text.split('. ').slice(1, 3).join('. ')}`;
}

async function proactiveText(user, bot) {
  const focus = FOCUS[bot.focus] ? bot.focus : 'geral';
  if (!hasGemini()) return localProactive(user, bot, focus);
  const body = {
    systemInstruction: { parts: [{ text: systemPrompt(user, 'gemini', bot) }] },
    contents: [{ role: 'user', parts: [{ text: `[Mensagem automática — o usuário NÃO escreveu nada.]
Sua função neste chat: ${FOCUS[focus]}. Agora são ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} de ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}.
Dados atuais do usuário:
${focusData(user, focus)}

Escreva UMA mensagem espontânea que você mandaria agora no chat, como alguém que acompanha a vida dele nesse assunto: curta (1 a 3 frases), natural, focando no ponto mais importante (lembrete, alerta, parabéns ou incentivo). Não liste todos os dados e não diga que é automática.` }] }],
    generationConfig: { temperature: 0.95, maxOutputTokens: 2048 },
  };
  try { return await geminiCall(body); } catch (err) { console.error('[automático]', err.message); return localProactive(user, bot, focus); }
}

// Entrega uma mensagem de um personagem (ou do Niac, bot = null) sem o usuário pedir.
const deliverHooks = [];
export const onDeliver = (fn) => deliverHooks.push(fn);
export function deliverMessage(user, bot, text, { groupConvId = null, kind = 'auto' } = {}) {
  const st = store(user.id);
  let conv;
  if (groupConvId) conv = st.conversations.find((c) => c.id === groupConvId);
  else if (bot) conv = st.conversations.filter((c) => c.botId === bot.id && !c.group).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  else conv = st.conversations.find((c) => c.inbox && !c.botId && !c.group);
  if (!conv) {
    conv = createConversation(user.id, bot ? `Chat com ${bot.name}` : `Avisos do ${prefs(user).assistantName || 'Niac'}`, bot);
    if (!bot) conv.inbox = true;
  }
  conv.display.push({ role: 'assistant', text, at: now(), mode: hasGemini() ? 'gemini' : 'local', auto: true, kind, ...(groupConvId && bot ? { botId: bot.id } : {}) });
  conv.unread = (conv.unread || 0) + 1;
  conv.updatedAt = now();
  save();
  const name = bot?.name || prefs(user).assistantName || 'Niac';
  const ev = { conversationId: conv.id, botId: bot?.id || null, name: groupConvId ? `${name} · ${conv.group?.name || 'grupo'}` : name, avatar: bot?.avatar || null, color: bot?.color, text: text.slice(0, 200) };
  announceDelivery(user, ev, text);
  return conv.id;
}
// Avisa a tela (balão flutuante) e os canais extras (Telegram, notificação no celular).
export function announceDelivery(user, ev, text) {
  emit(user.id, 'chat', ev);
  for (const fn of deliverHooks) { try { fn(user, ev, text); } catch (e) { console.error('[entrega]', e.message); } }
}

// Pede uma resposta em JSON ao Gemini.
export async function geminiJSON(prompt, maxTokens = 3000) {
  const out = await geminiCall({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: maxTokens, responseMimeType: 'application/json' } });
  return JSON.parse(out.replace(/^```(?:json)?\s*|\s*```$/g, ''));
}

// Texto escrito pela IA no estilo do personagem, a partir de uma instrução e dos dados (null se não houver Gemini).
export async function aiWrite(user, bot, instruction, data = '', maxTokens = 1500) {
  if (!hasGemini()) return null;
  try {
    const out = await geminiCall({
      systemInstruction: { parts: [{ text: systemPrompt(user, 'gemini', bot) }] },
      contents: [{ role: 'user', parts: [{ text: `[Mensagem automática — o usuário NÃO escreveu nada.] Agora são ${new Date().toLocaleString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.
${instruction}
${data ? `\nDados atuais do usuário:\n${data}\n` : ''}
Escreva só a mensagem, natural e no seu jeito, como no WhatsApp. Não diga que é automática.` }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: maxTokens },
    });
    return out.trim();
  } catch (err) { console.error('[aiWrite]', err.message); return null; }
}

export async function sendProactive(user, bot) {
  const text = (await proactiveText(user, bot)).trim();
  if (!text) return null;
  const conversationId = deliverMessage(user, bot, text);
  return { conversationId, text };
}

const validTimes = (t) => String(t || '').split(/[,;\s]+/).filter((x) => /^([01]\d|2[0-3]):[0-5]\d$/.test(x)).sort();
let proactiveBusy = false;
export async function runProactive() {
  if (proactiveBusy) return;
  proactiveBusy = true;
  try {
    const d = new Date();
    const today = localDate(d);
    const hmNow = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    for (const bot of db().bots.filter((b) => b.proactive)) {
      const due = validTimes(bot.times).filter((t) => t <= hmNow).map((t) => `${today}_${t}`);
      const pending = due.filter((k) => !(bot.sentSlots || []).includes(k));
      if (!pending.length) continue;
      bot.sentSlots = [...(bot.sentSlots || []), ...pending].slice(-20);
      save();
      const user = db().users.find((u) => u.id === bot.userId);
      if (user) await sendProactive(user, bot).catch((e) => console.error('[automático]', e.message));
    }
  } finally { proactiveBusy = false; }
}

export async function chat(user, text, convId, write, opts = {}) {
  const s = prefs(user);
  if (!s.assistantEnabled) { write({ type: 'text', text: 'O assistente está desativado nas Configurações.' }); return { conversationId: convId }; }
  let conv = convId ? getConversation(user.id, convId) : null;
  if (!conv) conv = createConversation(user.id);
  write({ type: 'conversation', id: conv.id });
  const files = (opts.files || []).map((f) => ({ ...chatFile(user.id, f.file), name: String(f.name || '').slice(0, 160) })).filter((f) => f.file)
    .map(({ file, name, mime, size }) => ({ file, name: name || file, mime, size })).slice(0, 6);
  if (!opts.auto) {
    if (conv.title === 'Nova conversa' && !conv.display.length) conv.title = (text || files[0]?.name || 'Conversa').slice(0, 42);
    conv.display.push({ role: 'user', text, at: now(), ...(files.length ? { files } : {}) });
  }
  conv.unread = 0;
  conv.updatedAt = now();
  write({ type: 'typing' });

  if (conv.group) {
    await runGroup(user, conv, text, write, opts.auto);
    conv.updatedAt = now();
    save();
    return { conversationId: conv.id };
  }

  let mode = assistantMode();
  const actions = [];
  // com o Gemini, a própria IA entende e executa (inclusive pedidos com várias ações); sem ele, regras locais
  let result = files.length ? null : mode === 'gemini' ? (/^\//.test(text) ? command(user, text) : null) : command(user, text) || naturalAction(user, text, mode !== 'local');
  if (!result && !files.length && mode !== 'gemini') {
    const kb = searchKB(text);
    if (kb && (mode === 'local' || kb.score >= 3)) result = { text: kb.answer, tools: [], link: kb.link };
  }
  if (!result && files.length && mode !== 'gemini') {
    result = { text: `Recebi ${files.length > 1 ? 'os arquivos' : `"${files[0].name}"`}, mas pra eu ler fotos e PDFs preciso do Gemini ligado. É grátis: Configurações → Assistente → Gemini.`, tools: [], link: '#/settings/assistente' };
  }
  if (!result && mode === 'ollama') {
    try { result = await runOllama(user, conv, text, write); result.streamed = true; }
    catch (err) { console.error('[assistente] IA local falhou:', err?.message); refreshOllama(); write({ type: 'notice', text: 'IA local indisponível. Respondendo no modo básico.' }); mode = 'local'; }
  } else if (!result && mode === 'gemini') {
    try { result = await runGemini(user, conv, text, write, actions); result.streamed = true; }
    catch (err) {
      console.error('[assistente] Gemini falhou:', err?.message);
      if (!files.length) result = naturalAction(user, text, false);
      write({ type: 'notice', text: err.status === 429 ? 'A cota grátis do Gemini acabou por agora. Respondo no modo básico até ela voltar.' : 'O Gemini não respondeu agora. Respondo no modo básico.' });
      mode = 'local';
    }
  } else if (!result && mode === 'claude') {
    try { result = await runClaude(user, conv, text, write); result.streamed = true; }
    catch (err) { console.error('[assistente] Claude falhou:', err?.message); write({ type: 'notice', text: 'IA indisponível. Respondendo no modo básico.' }); mode = 'local'; }
  }
  if (!result) {
    const talk = smallTalk(user, text, botOf(user, conv));
    const kb = searchKB(text);
    result = { text: talk || kb?.answer || (files.length ? 'Recebi seu arquivo, mas não consegui ler agora. Tenta de novo daqui a pouco?' : pick([
      `Hmm, essa eu não peguei, ${callName(user, s)}. Me pergunta sobre o Codeniac ("como importo o extrato?") ou me diz o que quer registrar, tipo "gastei 50 de gasolina".`,
      'Essa eu não sei responder sem IA. Se quiser conversar sobre qualquer assunto, liga o Gemini em Configurações → Assistente, é grátis.',
    ])), tools: [], link: talk ? null : kb?.link };
  }
  if (!s.assistantEmoji) result.text = result.text.replace(/\p{Extended_Pictographic}️?/gu, '').replace(/ {2,}/g, ' ').trim();
  if (!result.streamed) await typeOut(result, write);
  if (result.link) write({ type: 'link', href: result.link });
  conv.display.push({ role: 'assistant', text: result.text, at: now(), mode, tools: result.tools, link: result.link || null, ...(actions.length ? { actions } : {}) });
  if (conv.display.length > 400) conv.display = conv.display.slice(-400);
  conv.updatedAt = now();
  save();
  return { conversationId: conv.id };
}

export const PERSONALITY_LABELS = Object.fromEntries(Object.entries(PERSONALITY).map(([k, v]) => [k, v.label]));
