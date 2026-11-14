// Personagens no Telegram de verdade: o Codeniac conversa por um robô do Telegram (grátis, criado no @BotFather).
// Usa "long polling" (só conexões de saída), então funciona no PC de casa sem abrir portas.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, id, save, now, DATA_DIR } from './db.js';
import { logEvent } from './notify.js';
import { CHAT_FILES } from './routes/chatfiles.js';
import { chat, onDeliver, getConversation, createConversation, assistantMode } from './assistant.js';
import { confirmAction } from './agent.js';

const API = () => (process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/$/, '');
const token = () => process.env.TELEGRAM_BOT_TOKEN || '';
const meta = (uid) => (db().userMeta[uid] ??= {});
const tg = (uid) => (meta(uid).telegram ??= {});
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const clean = (t) => String(t || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/`{3}\w*\n?/g, '').trim();

export const telegramState = { running: false, bot: null, error: null, lastUpdateAt: null };

async function call(method, body, tok = token()) {
  const res = await fetch(`${API()}/bot${tok}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), signal: AbortSignal.timeout(65000),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) { const e = new Error(data.description || `Telegram respondeu ${res.status}`); e.code = data.error_code; throw e; }
  return data.result;
}

export async function testTelegramToken(tok) {
  try { const me = await call('getMe', {}, tok); return { ok: true, bot: me }; }
  catch (err) { return { ok: false, error: err.message }; }
}

async function send(chatId, text, extra = {}) {
  const parts = [];
  let rest = clean(text);
  while (rest.length > 4000) { const cut = rest.lastIndexOf('\n', 4000) > 2000 ? rest.lastIndexOf('\n', 4000) : 4000; parts.push(rest.slice(0, cut)); rest = rest.slice(cut); }
  parts.push(rest);
  let last = null;
  for (const [i, p] of parts.entries()) if (p.trim()) last = await call('sendMessage', { chat_id: chatId, text: p, ...(i === parts.length - 1 ? extra : {}) });
  return last;
}

// lembra qual conversa do Codeniac gerou cada mensagem (para responder com "responder" no Telegram)
function remember(uid, messageId, convId, botId) {
  const t = tg(uid);
  t.map = [...(t.map || []).filter((m) => m.m !== messageId), { m: messageId, c: convId, b: botId }].slice(-300);
  save();
}

// Código para vincular a conta do Codeniac ao chat do Telegram
export function linkCode(uid) {
  const t = tg(uid);
  t.code = String(crypto.randomInt(100000, 999999));
  t.codeAt = Date.now();
  save();
  return t.code;
}
export function unlink(uid) { const t = tg(uid); delete t.chatId; delete t.username; t.linkedAt = null; save(); }

const userByChat = (chatId) => db().users.find((u) => tg(u.id).chatId === chatId) || null;
const botsOf = (uid) => db().bots.filter((b) => b.userId === uid);

function targetConversation(user, t, replyTo) {
  if (replyTo) {
    const m = (t.map || []).find((x) => x.m === replyTo);
    if (m && getConversation(user.id, m.c)) return m.c;
  }
  if (t.convId && getConversation(user.id, t.convId)) return t.convId;
  const st = db().threads[user.id];
  const botId = t.target && t.target !== 'niac' ? t.target : null;
  let conv = st?.conversations.filter((c) => (botId ? c.botId === botId : !c.botId) && !c.group && (botId || c.telegram)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!conv) {
    const bot = botId ? db().bots.find((b) => b.id === botId) : null;
    conv = createConversation(user.id, bot ? `Chat com ${bot.name}` : 'Telegram', bot);
    if (!bot) conv.telegram = true;
    save();
  }
  return conv.id;
}

async function downloadFile(user, fileId, ext) {
  const f = await call('getFile', { file_id: fileId });
  if (f.file_size && f.file_size > 15 * 1024 * 1024) throw new Error('Arquivo acima de 15 MB');
  const res = await fetch(`${API()}/file/bot${token()}/${f.file_path}`, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error('Não consegui baixar o arquivo do Telegram');
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(CHAT_FILES, { recursive: true });
  const name = `${user.id}__${id()}${ext}`;
  fs.writeFileSync(path.join(CHAT_FILES, name), buf);
  return { file: name, size: buf.length };
}

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = (msg.text || msg.caption || '').trim();
  // vincular conta
  const link = text.match(/^\/vincular\s+(\d{6})$/i);
  if (link) {
    const user = db().users.find((u) => tg(u.id).code === link[1] && Date.now() - (tg(u.id).codeAt || 0) < 15 * 60 * 1000);
    if (!user) return send(chatId, 'Código inválido ou vencido. Gere um novo no Codeniac: Configurações → Telegram.');
    const t = tg(user.id);
    Object.assign(t, { chatId, username: msg.from?.username || msg.from?.first_name || '', linkedAt: now(), code: null, target: t.target || 'niac', forward: t.forward !== false });
    save();
    logEvent(user.id, 'system', 'update', 'Telegram conectado');
    return send(chatId, `Conectado! 🎉 Agora é só conversar comigo por aqui, ${msg.from?.first_name || ''}.\n\nComandos:\n/com Nome — falar com um personagem\n/com niac — voltar ao assistente\n/quem — com quem estou falando\n/desvincular — desconectar\n\nDica: use "responder" numa mensagem de um personagem para falar direto com ele.`);
  }
  const user = userByChat(chatId);
  if (!user) return send(chatId, 'Oi! Eu sou o Codeniac. Para conectar, abra o Codeniac no computador → Configurações → Telegram, gere o código e envie aqui:\n/vincular 123456');
  const t = tg(user.id);
  if (/^\/start\b/i.test(text)) return send(chatId, 'Você já está conectado. Pode mandar mensagem, foto ou PDF!');
  if (/^\/desvincular\b/i.test(text)) { unlink(user.id); return send(chatId, 'Desconectado. Até mais!'); }
  if (/^\/quem\b/i.test(text)) {
    const b = t.target && t.target !== 'niac' ? db().bots.find((x) => x.id === t.target) : null;
    return send(chatId, `Você está falando com ${b ? b.name : 'o assistente (Niac)'}.\nPersonagens: ${botsOf(user.id).map((x) => x.name).join(', ') || 'nenhum ainda'}`);
  }
  const com = text.match(/^\/com\s+(.+)$/i);
  if (com) {
    const q = norm(com[1]);
    if (/^(niac|assistente)$/.test(q)) { t.target = 'niac'; t.convId = null; save(); return send(chatId, 'Pronto, voltamos ao assistente.'); }
    const b = botsOf(user.id).find((x) => norm(x.name).startsWith(q) || norm(x.name).includes(q));
    if (!b) return send(chatId, `Não achei esse personagem. Tenho: ${botsOf(user.id).map((x) => x.name).join(', ') || 'nenhum'}`);
    t.target = b.id; t.convId = null; save();
    return send(chatId, `Agora você está falando com ${b.name}.`);
  }
  if (/^\/ajuda|^\/help/i.test(text)) return send(chatId, 'Mande mensagens normalmente. /com Nome troca de personagem, /quem mostra com quem você fala, /desvincular desconecta.');
  if (msg.voice || msg.audio || msg.video_note) return send(chatId, 'Ainda não consigo ouvir áudio por aqui. Pode mandar em texto?');

  // anexos: foto ou PDF
  const files = [];
  try {
    if (msg.photo?.length) { const p = msg.photo.at(-1); const f = await downloadFile(user, p.file_id, '.jpg'); files.push({ ...f, name: 'foto do Telegram.jpg', mime: 'image/jpeg' }); }
    if (msg.document) {
      if (msg.document.mime_type === 'application/pdf') { const f = await downloadFile(user, msg.document.file_id, '.pdf'); files.push({ ...f, name: msg.document.file_name || 'arquivo.pdf', mime: 'application/pdf' }); }
      else if (/^image\//.test(msg.document.mime_type || '')) { const ext = { 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' }[msg.document.mime_type] || '.jpg'; const f = await downloadFile(user, msg.document.file_id, ext); files.push({ ...f, name: msg.document.file_name || 'imagem', mime: msg.document.mime_type }); }
      else return send(chatId, 'Por enquanto eu leio fotos e PDFs.');
    }
  } catch (err) { return send(chatId, `Não consegui pegar o arquivo: ${err.message}`); }
  if (!text && !files.length) return;

  const convId = targetConversation(user, t, msg.reply_to_message?.message_id);
  const typing = () => call('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});
  typing();
  const typingTimer = setInterval(typing, 4500);
  let buffer = '';
  let speaker = null;
  const out = [];
  const flush = () => { if (buffer.trim()) out.push({ name: speaker, text: buffer }); buffer = ''; };
  const confirms = [];
  await chat(user, text, convId, (ev) => {
    if (ev.type === 'text') buffer += ev.text;
    if (ev.type === 'speaker') { flush(); speaker = ev.name; }
    if (ev.type === 'speaker_end') { flush(); speaker = null; }
    if (ev.type === 'notice') out.push({ name: null, text: `(${ev.text})` });
    if (ev.type === 'confirm') confirms.push(ev);
  }, { files, via: 'telegram' }).finally(() => clearInterval(typingTimer));
  flush();
  const conv = getConversation(user.id, convId);
  for (const o of out) {
    const sent = await send(chatId, o.name ? `${o.name}:\n${o.text}` : o.text);
    if (sent) remember(user.id, sent.message_id, convId, conv?.botId || null);
  }
  for (const c of confirms) {
    await send(chatId, `Confirma? ${c.summary}`, { reply_markup: { inline_keyboard: [[{ text: '✅ Confirmar', callback_data: `c:${c.id}:1` }, { text: '❌ Cancelar', callback_data: `c:${c.id}:0` }]] } });
  }
  if (conv) { conv.unread = 0; save(); }
}

async function handleCallback(q) {
  const user = userByChat(q.message?.chat?.id);
  const m = /^c:([\w-]+):([01])$/.exec(q.data || '');
  if (!user || !m) return call('answerCallbackQuery', { callback_query_id: q.id });
  let msg;
  try { const a = await confirmAction(user, m[1], m[2] === '1'); msg = a.status === 'done' ? `✅ Feito: ${a.summary}${a.link ? `\n${a.link}` : ''}` : '❌ Cancelado.'; }
  catch (err) { msg = err.message; }
  await call('answerCallbackQuery', { callback_query_id: q.id, text: msg.slice(0, 190) }).catch(() => {});
  await call('editMessageText', { chat_id: q.message.chat.id, message_id: q.message.message_id, text: msg }).catch(() => {});
}

// Mensagens automáticas, rotinas, cápsulas etc. também vão para o Telegram.
export async function telegramForward(user, ev, text) {
  const t = tg(user.id);
  if (!token() || !t.chatId || t.forward === false) return;
  try {
    const sent = await send(t.chatId, `${ev.name}:\n${text}`);
    if (sent) remember(user.id, sent.message_id, ev.conversationId, ev.botId);
  } catch (err) { console.error('[telegram]', err.message); }
}
onDeliver((user, ev, text) => { telegramForward(user, ev, text); });

let loopId = 0;
export function startTelegram() {
  const my = ++loopId;
  telegramState.running = false;
  if (!token()) { telegramState.bot = null; return; }
  (async () => {
    let offset = db().meta.telegramOffset || 0;
    let backoff = 2000;
    try { telegramState.bot = await call('getMe'); telegramState.error = null; }
    catch (err) { telegramState.error = err.message; console.error('[telegram]', err.message); }
    telegramState.running = true;
    while (my === loopId && token()) {
      try {
        const updates = await call('getUpdates', { offset, timeout: 45, allowed_updates: ['message', 'callback_query'] });
        backoff = 2000;
        telegramState.error = null;
        for (const u of updates) {
          offset = u.update_id + 1;
          db().meta.telegramOffset = offset;
          telegramState.lastUpdateAt = now();
          try {
            if (u.message) await handleMessage(u.message);
            else if (u.callback_query) await handleCallback(u.callback_query);
          } catch (err) { console.error('[telegram] mensagem:', err.message); }
        }
        if (updates.length) save();
      } catch (err) {
        if (my !== loopId) break;
        telegramState.error = err.message;
        if (err.code === 401 || err.code === 404) { console.error('[telegram] token inválido'); break; }
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, 60000);
      }
    }
    if (my === loopId) telegramState.running = false;
  })();
}
export function stopTelegram() { loopId++; telegramState.running = false; }
export const telegramInfo = (uid) => {
  const t = tg(uid);
  return { configured: Boolean(token()), running: telegramState.running, error: telegramState.error, bot: telegramState.bot ? { username: telegramState.bot.username, name: telegramState.bot.first_name } : null,
    linked: Boolean(t.chatId), username: t.username || null, forward: t.forward !== false, mode: assistantMode() };
};
