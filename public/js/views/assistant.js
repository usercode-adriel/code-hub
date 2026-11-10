// Assistente em tela cheia, estilo Telegram: conversas, personagens, grupos, anexos (foto/PDF),
// mensagens automáticas e atualização ao vivo.
import { api, auth, coll, streamChat } from '../api.js';
import { store, emit, on } from '../store.js';
import { icon } from '../icons.js';
import { esc, chatMd, toast, confirmDialog, timeAgo, modal, validateImage, pickImage } from '../ui.js';
import { TOOL_LABEL, PERSONA, botAvatar, bindDictation, MODE_LABEL } from '../chatui.js';

const STARTERS = [['☀️', 'Como está meu dia hoje?'], ['💸', 'Gastei 50 de gasolina'], ['📚', 'Me ajuda a montar um plano de estudo de inglês'], ['📎', 'Envie uma foto ou PDF e me pergunte sobre ele']];
export const FOCUS = { geral: '🧭 Rotina em geral', financas: '💰 Finanças pessoais', indrive: '🚗 InDrive e carro', tarefas: '✅ Tarefas e prazos', estudos: '📚 Estudos e leitura', ingles: '🇺🇸 Inglês', habitos: '🔥 Hábitos e bem-estar' };
const ticks = `<span class="ticks">${icon('check', 11)}${icon('check', 11)}</span>`;
const hhmm = (iso) => new Date(iso || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dayOf = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
const fileUrl = (f) => `/api/assistant/files/${encodeURIComponent(f.file)}?token=${encodeURIComponent(auth.token)}`;
const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const BOT_COLORS = ['#e5484d', '#7c3aed', '#0ea5e9', '#22c55e', '#f59e0b', '#ec4899', '#14b8a6'];

// Rosto do personagem: foto enviada ou a inicial do nome.
export function faceOf(bot, size = 40) {
  if (!bot || bot.id === 'niac') return botAvatar(size);
  if (bot.avatar) return `<div class="avatar bot-photo" style="--s:${size}px"><img src="${esc(bot.avatar)}" alt=""></div>`;
  return `<div class="avatar bot-face" style="--s:${size}px;background:${esc(bot.color || 'var(--accent)')}">${esc((bot.name || '?').trim()[0].toUpperCase())}</div>`;
}
function groupFace(group, members, size = 44) {
  if (group?.avatar) return `<div class="avatar bot-photo" style="--s:${size}px"><img src="${esc(group.avatar)}" alt=""></div>`;
  const list = members.slice(0, 3);
  return `<div class="group-face" style="--s:${size}px">${list.map((m) => faceOf(m, Math.round(size * 0.62))).join('')}</div>`;
}
function filesHtml(files = []) {
  return files.map((f) => (f.mime?.startsWith('image/')
    ? `<a class="tg-img" href="${fileUrl(f)}" target="_blank" rel="noopener"><img src="${fileUrl(f)}" alt="${esc(f.name)}" loading="lazy"></a>`
    : `<a class="tg-file" href="${fileUrl(f)}" target="_blank" rel="noopener"><span class="fi">${icon('file', 18)}</span><span><b>${esc(f.name)}</b><small>PDF · ${fmtSize(f.size || 0)}</small></span></a>`)).join('');
}

// Formulário de criar/editar personagem (com função e mensagens automáticas).
export function botForm(bot = null) {
  return new Promise((resolve) => {
    let avatar = bot?.avatar || null;
    let personality = bot?.personality || 'amigavel';
    modal({
      title: bot ? `Editar ${bot.name}` : 'Criar personagem', wide: true,
      body: `<form class="form bot-form"><div class="bot-form-top"><button type="button" class="bot-photo-pick" id="bfPhoto" title="Enviar foto">${avatar ? `<img src="${esc(avatar)}" alt="">` : icon('camera', 26)}<span>${avatar ? 'Trocar foto' : 'Foto de perfil'}</span></button>
          <div class="grow"><div class="field"><label>Nome</label><input name="name" maxlength="40" value="${esc(bot?.name || '')}" placeholder="Ex.: Clara das Finanças, Teacher Ana, Capitão Rex" required></div>
          <div class="field" style="margin-top:10px"><label>Primeira mensagem (opcional)</label><input name="greeting" maxlength="400" value="${esc(bot?.greeting || '')}" placeholder="Ex.: Oi! Vou cuidar das suas contas daqui pra frente 💰"></div></div></div>
        <div class="field"><label>Personalidade</label><div class="persona-grid">${Object.entries(PERSONA).map(([k, p]) => `<button type="button" class="persona ${k === personality ? 'on' : ''}" data-pe="${k}"><span class="pe">${p.emoji}</span><b>${p.label}</b><small>${p.desc}</small></button>`).join('')}</div></div>
        <div class="field"><label>Características</label><textarea name="traits" rows="4" maxlength="2000" placeholder="Quem é, como fala, do que entende, manias e regras.">${esc(bot?.traits || '')}</textarea></div>
        <div class="bot-auto"><div class="field"><label>Função deste chat</label><select name="focus">${Object.entries(FOCUS).map(([k, l]) => `<option value="${k}" ${(bot?.focus || 'geral') === k ? 'selected' : ''}>${l}</option>`).join('')}</select><span class="hint">É sobre isso que ele vai puxar assunto sozinho.</span></div>
          <div class="field"><label>Mensagens automáticas</label><div class="setting-row" style="padding:6px 0;border:0"><div class="txt"><small>Ele te manda mensagem sem você pedir</small></div><label class="switch"><input type="checkbox" name="proactive" ${bot?.proactive ? 'checked' : ''}><span></span></label></div></div>
          <div class="field"><label>Horários</label><input name="times" value="${esc(bot?.times || '09:00')}" placeholder="09:00, 19:30"><span class="hint">Separe com vírgula. Funciona enquanto o Codeniac estiver ligado.</span></div></div>
        <p class="hint" style="margin:0">Com o Gemini ligado, o personagem segue a personalidade e as características. Sem IA, ele aparece com nome e foto e manda lembretes simples.</p>
        <div class="form-actions">${bot ? `<button type="button" class="btn danger" id="bfDel" style="margin-right:auto">${icon('trash', 13)} Excluir</button><button type="button" class="btn outline" id="bfPing">${icon('send', 13)} Mandar mensagem agora</button>` : ''}<button type="button" class="btn outline" data-close>Cancelar</button><button class="btn primary">${bot ? 'Salvar' : 'Criar e conversar'}</button></div></form>`,
      onMount: (m, close) => {
        const photo = m.querySelector('#bfPhoto');
        photo.onclick = () => pickImage(async (file) => {
          if (!validateImage(file)) return;
          const r = await api.upload('/uploads', file);
          avatar = r.url;
          photo.innerHTML = `<img src="${esc(avatar)}" alt=""><span>Trocar foto</span>`;
        });
        m.querySelectorAll('[data-pe]').forEach((b) => { b.onclick = () => { personality = b.dataset.pe; m.querySelectorAll('[data-pe]').forEach((x) => x.classList.toggle('on', x === b)); }; });
        const body = (f) => ({ name: f.name.value.trim(), greeting: f.greeting.value.trim(), traits: f.traits.value.trim(), personality, avatar: avatar || '',
          focus: f.focus.value, proactive: f.proactive.checked, times: f.times.value, color: bot?.color || BOT_COLORS[Math.floor(Math.random() * BOT_COLORS.length)] });
        m.querySelector('form').onsubmit = async (e) => {
          e.preventDefault();
          const data = body(e.target);
          if (!data.name) return toast('Dê um nome ao personagem', '', 'error');
          try { const saved = bot ? await coll('bots').update(bot.id, data) : await coll('bots').add(data); close(); resolve(saved); }
          catch (err) { toast('Erro', err.message, 'error'); }
        };
        m.querySelector('#bfPing')?.addEventListener('click', async (e) => {
          e.target.disabled = true; e.target.textContent = 'Escrevendo...';
          try { await coll('bots').update(bot.id, body(m.querySelector('form'))); await api.post(`/assistant/bots/${bot.id}/ping`); close(); resolve({ pinged: true }); }
          catch (err) { toast('Erro', err.message, 'error'); e.target.disabled = false; }
        });
        m.querySelector('#bfDel')?.addEventListener('click', async () => {
          if (!(await confirmDialog('Excluir personagem', `${bot.name} será excluído. As conversas antigas continuam, com o assistente padrão.`))) return;
          await coll('bots').remove(bot.id); close(); resolve({ deleted: true });
        });
      },
    });
  });
}

// Formulário de criar/editar grupo.
function groupForm(bots, niacName, group = null) {
  return new Promise((resolve) => {
    let avatar = group?.avatar || null;
    const chosen = new Set(group?.members || []);
    const people = [{ id: 'niac', name: niacName }, ...bots];
    modal({
      title: group ? 'Editar grupo' : 'Criar grupo', wide: true,
      body: `<form class="form"><div class="bot-form-top"><button type="button" class="bot-photo-pick" id="gPhoto">${avatar ? `<img src="${esc(avatar)}" alt="">` : icon('users', 26)}<span>${avatar ? 'Trocar foto' : 'Foto do grupo'}</span></button>
        <div class="grow"><div class="field"><label>Nome do grupo</label><input name="name" maxlength="60" value="${esc(group?.name || '')}" placeholder="Ex.: Conselho, Família, Estudos" required></div>
        <div class="field" style="margin-top:10px"><label>Sobre o grupo (opcional)</label><input name="description" maxlength="300" value="${esc(group?.description || '')}" placeholder="Ex.: decisões de dinheiro e carreira"></div></div></div>
        <div class="field"><label>Participantes (escolha 2 ou mais)</label><div class="bot-grid pick">${people.map((p) => `<button type="button" class="bot-card ${chosen.has(p.id) ? 'on' : ''}" data-m="${p.id}">${faceOf(p, 46)}<b>${esc(p.name)}</b><small>${p.id === 'niac' ? 'Assistente do Codeniac' : esc((PERSONA[p.personality] || PERSONA.amigavel).label)}</small><span class="tick">${icon('check', 12)}</span></button>`).join('')}</div>
          ${bots.length ? '' : '<span class="hint">Você ainda não tem personagens. Crie alguns em “Criar chat → Criar personagem” para montar um grupo animado.</span>'}</div>
        <p class="hint" style="margin:0">No grupo, cada personagem responde do seu jeito e eles conversam entre si (precisa do Gemini).</p>
        <div class="form-actions"><button type="button" class="btn outline" data-close>Cancelar</button><button class="btn primary">${group ? 'Salvar' : 'Criar grupo'}</button></div></form>`,
      onMount: (m, close) => {
        const photo = m.querySelector('#gPhoto');
        photo.onclick = () => pickImage(async (file) => { if (!validateImage(file)) return; avatar = (await api.upload('/uploads', file)).url; photo.innerHTML = `<img src="${esc(avatar)}" alt=""><span>Trocar foto</span>`; });
        m.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => { const k = b.dataset.m; if (chosen.has(k)) chosen.delete(k); else chosen.add(k); b.classList.toggle('on', chosen.has(k)); }; });
        m.querySelector('form').onsubmit = (e) => {
          e.preventDefault();
          if (chosen.size < 2) return toast('Escolha pelo menos 2 participantes', '', 'error');
          close(); resolve({ name: e.target.name.value.trim(), description: e.target.description.value.trim(), members: [...chosen], avatar: avatar || '' });
        };
      },
    });
  });
}

let liveOff = null;
export default async function render(el) {
  let convs = await api.get('/assistant/conversations');
  let current = convs.some((c) => c.id === localStorage.getItem('codeniac.conv')) ? localStorage.getItem('codeniac.conv') : null;
  let bots = await coll('bots').list();
  let detail = null; // conversa aberta (mensagens + participantes)
  let busy = false;
  let pending = []; // anexos prontos para enviar
  const name = store.settings.assistantName || 'Niac';
  const niac = { id: 'niac', name };
  const isMobile = () => matchMedia('(max-width: 760px)').matches;
  const convOf = (cid) => convs.find((x) => x.id === cid);
  const botById = (bid) => (bid === 'niac' ? niac : bots.find((b) => b.id === bid) || null);
  const membersOf = (c) => (c?.group?.members || []).map(botById).filter(Boolean);
  const peer = () => { const c = convOf(current); return c?.botId ? botById(c.botId) : null; };
  const isGroup = () => Boolean(convOf(current)?.group);

  el.innerHTML = `<div class="tg" id="tg"><aside class="tg-list"><div class="tg-list-head"><h2>Conversas</h2><button class="btn sm primary" id="new" title="Criar chat ou grupo">${icon('plus', 13)} Criar</button></div>
      <div class="search tg-search">${icon('search', 14)}<input id="cq" placeholder="Buscar conversa"></div><div class="tg-items" id="items"></div></aside>
    <section class="tg-chat" id="chatPane"><header class="tg-head"><button class="icon-btn sm ghost tg-back" id="back" aria-label="Voltar">${icon('chevLeft', 18)}</button><div class="tg-peer" id="peer"></div>
      <div class="tg-head-actions" id="headActs"></div></header>
      <div class="tg-messages" id="msgs"></div>
      <div class="tg-attach" id="attach" hidden></div>
      <form class="tg-composer" id="form"><button type="button" class="icon-btn ghost" id="clip" title="Enviar foto ou PDF" aria-label="Anexar">${icon('clip', 19)}</button><button type="button" class="icon-btn ghost tg-hide-sm" id="emo" aria-label="Emojis">😊</button><textarea id="input" rows="1" placeholder="Mensagem"></textarea><button type="button" class="icon-btn ghost" id="mic" aria-label="Ditado">${icon('mic', 18)}</button><button class="tg-send" aria-label="Enviar">${icon('send', 17)}</button>
        <input type="file" id="fileIn" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" multiple hidden></form>
      <div class="tg-emoji-pop" id="emoPop" hidden>${'😀😂😊😍🤔😅👍🙏🔥🚗💸📚✅🎯💡🇺🇸☕🎉😴'.match(/./gu).map((e) => `<button type="button" style="font-size:20px;border:0;background:none;padding:4px">${e}</button>`).join('')}</div>
      <div class="tg-drop" id="drop" hidden>${icon('clip', 28)}<b>Solte a foto ou o PDF aqui</b></div></section></div>`;
  const tg = el.querySelector('#tg');
  const msgs = el.querySelector('#msgs');
  const input = el.querySelector('#input');
  const setOpen = (open) => { tg.classList.toggle('show-chat', open); document.body.classList.toggle('chat-full', open && isMobile()); };

  const paintHead = () => {
    const c = convOf(current);
    const peerEl = el.querySelector('#peer');
    const acts = el.querySelector('#headActs');
    if (c?.group) {
      const ms = membersOf(c);
      peerEl.innerHTML = `${groupFace(c.group, ms, 40)}<div><b>${esc(c.group.name)}</b><small id="status">${ms.map((m) => esc(m.name.split(' ')[0])).join(', ')}</small></div>`;
      acts.innerHTML = `<button class="btn sm outline" id="talk" title="Os personagens conversam entre si">${icon('play', 12)}<span class="tg-hide-sm"> Deixar conversarem</span></button><button class="icon-btn sm ghost" id="gEdit" title="Editar grupo">${icon('settings', 15)}</button><button class="icon-btn sm ghost" id="del" title="Apagar">${icon('trash', 15)}</button>`;
    } else {
      const b = peer();
      const p = PERSONA[b?.personality || store.settings.assistantPersonality] || PERSONA.amigavel;
      peerEl.innerHTML = `${faceOf(b, 40)}<div><b>${esc(b?.name || name)} <span class="chip tg-persona">${p.emoji} ${p.label}</span></b><small id="status">${b ? (b.proactive ? 'manda mensagens sozinho' : 'personagem') : 'online'} · ${MODE_LABEL[store.aiMode] || 'sem IA'}</small></div>`;
      acts.innerHTML = `${c ? `<button class="icon-btn sm ghost" id="ren" title="Renomear">${icon('edit', 15)}</button>` : ''}<button class="icon-btn sm ghost" id="pEdit" title="${b ? 'Editar personagem' : 'Personalidade'}">${icon('settings', 15)}</button>${c ? `<button class="icon-btn sm ghost" id="del" title="Apagar">${icon('trash', 15)}</button>` : ''}`;
    }
    acts.querySelector('#talk')?.addEventListener('click', () => send('', { auto: true }));
    acts.querySelector('#gEdit')?.addEventListener('click', async () => {
      const g = await groupForm(bots, name, convOf(current).group);
      if (!g) return;
      try { await api.put(`/assistant/conversations/${current}`, { group: g }); await refresh(); loadMessages(); } catch (err) { toast('Erro', err.message, 'error'); }
    });
    acts.querySelector('#pEdit')?.addEventListener('click', () => { if (peer()) editBot(peer()); else location.hash = '#/settings/assistente'; });
    acts.querySelector('#ren')?.addEventListener('click', async () => {
      const t = prompt('Nome da conversa:', convOf(current)?.title || '');
      if (t?.trim()) { await api.put(`/assistant/conversations/${current}`, { title: t.trim() }); await refresh(); }
    });
    acts.querySelector('#del')?.addEventListener('click', async () => {
      if (!(await confirmDialog(isGroup() ? 'Apagar grupo' : 'Apagar conversa', 'As mensagens serão apagadas.'))) return;
      await api.del(`/assistant/conversations/${current}`);
      convs = convs.filter((x) => x.id !== current); current = null; localStorage.removeItem('codeniac.conv');
      setOpen(false); paintList(); loadMessages(); toast('Apagado');
    });
  };

  const paintList = () => {
    const q = el.querySelector('#cq').value.toLowerCase();
    el.querySelector('#items').innerHTML = convs.filter((c) => !q || c.title.toLowerCase().includes(q)).map((c) => {
      const face = c.group ? groupFace(c.group, membersOf(c), 46) : faceOf(c.botId ? botById(c.botId) : null, 46);
      const who = c.last?.role === 'user' ? '<span class="you">Você: </span>' : c.group && c.last?.botId ? `<span class="you">${esc((botById(c.last.botId)?.name || '').split(' ')[0])}: </span>` : '';
      return `<button class="tg-item ${c.id === current ? 'on' : ''}" data-c="${c.id}">${face}<span class="tg-item-body"><span class="tg-row"><b>${c.group ? `${icon('users', 12)} ` : ''}${esc(c.title)}</b><time>${c.updatedAt ? timeAgo(c.updatedAt) : ''}</time></span>
        <span class="tg-row"><span class="tg-preview">${c.last ? `${who}${esc(c.last.text.replace(/\*\*|__|`/g, '').slice(0, 80))}` : 'Sem mensagens'}</span>${c.unread && c.id !== current ? `<span class="tg-unread">${c.unread}</span>` : ''}</span></span></button>`;
    }).join('') || '<div class="tg-empty-list muted">Nenhuma conversa ainda. Toque em “Criar”.</div>';
    el.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => { current = b.dataset.c; localStorage.setItem('codeniac.conv', current); setOpen(true); paintList(); loadMessages(); }; });
    paintHead();
  };
  const refresh = async () => { convs = await api.get('/assistant/conversations'); paintList(); };

  const bubble = (m) => {
    const out = m.role === 'user';
    const who = !out && isGroup() ? botById(m.botId) : null;
    const face = out ? '' : faceOf(isGroup() ? who : peer(), 30);
    const color = who?.color || 'var(--accent)';
    return `<div class="tg-msg ${out ? 'out' : 'in'}">${face}<div class="tg-bubble">${who ? `<div class="tg-sender" style="color:${esc(color)}">${esc(who.name)}</div>` : ''}${m.auto ? `<div class="tg-auto">${icon('bell', 10)} mensagem automática</div>` : ''}
      ${filesHtml(m.files)}${m.text ? `<div class="tg-text">${out ? esc(m.text) : chatMd(m.text)}</div>` : ''}
      ${(m.tools || []).map((t) => `<div class="tg-tool">${icon('check', 11)} ${esc(TOOL_LABEL[t] || t)}</div>`).join('')}${m.link ? `<a class="tg-go" href="${esc(m.link)}">${icon('chevRight', 11)} Abrir</a>` : ''}
      <div class="tg-meta">${hhmm(m.at)}${out ? ticks : ''}</div></div></div>`;
  };
  const welcome = () => {
    const c = convOf(current);
    if (c?.group) return `<div class="tg-welcome">${groupFace(c.group, membersOf(c), 64)}<h3>${esc(c.group.name)}</h3><p>${membersOf(c).map((x) => esc(x.name)).join(', ')} estão aqui. Mande uma mensagem ou toque em “Deixar conversarem”.</p></div>`;
    if (peer()) return `<div class="tg-welcome">${faceOf(peer(), 64)}<h3>${esc(peer().name)}</h3><p>${esc((peer().traits || 'Diga oi para começar!').slice(0, 240))}</p></div>`;
    return `<div class="tg-welcome">${botAvatar(64)}<h3>Oi, ${esc((store.user.name || '').split(' ')[0])}! Eu sou ${esc(name)}.</h3><p>Pode falar comigo do jeito que você fala com qualquer pessoa. Também leio fotos e PDFs quando o Gemini está ligado.</p>
      <div class="tg-starters">${STARTERS.map(([e, t]) => `<button data-s="${esc(t)}"><span>${e}</span>${esc(t)}</button>`).join('')}</div></div>`;
  };
  const loadMessages = async () => {
    paintHead();
    if (!current) { detail = null; msgs.innerHTML = welcome(); bindStarters(); return; }
    detail = await api.get(`/assistant/conversations/${current}`).catch(() => null);
    if (!detail) { current = null; localStorage.removeItem('codeniac.conv'); msgs.innerHTML = welcome(); bindStarters(); return; }
    const c = convOf(current); if (c) c.unread = 0;
    let lastDay = '';
    msgs.innerHTML = detail.messages.map((m) => { const d = dayOf(m.at); const sep = d !== lastDay ? `<div class="tg-day"><span>${d}</span></div>` : ''; lastDay = d; return sep + bubble(m); }).join('') || welcome();
    bindStarters();
    msgs.scrollTop = msgs.scrollHeight;
  };
  const bindStarters = () => msgs.querySelectorAll('[data-s]').forEach((b) => { b.onclick = () => { if (b.dataset.s.startsWith('Envie')) el.querySelector('#fileIn').click(); else send(b.dataset.s); }; });

  // ---------- anexos ----------
  const paintAttach = () => {
    const box = el.querySelector('#attach');
    box.hidden = !pending.length;
    box.innerHTML = pending.map((f, i) => `<div class="att ${f.done ? '' : 'up'}">${f.mime.startsWith('image/') && f.preview ? `<img src="${f.preview}" alt="">` : `<span class="fi">${icon('file', 16)}</span>`}
      <span class="nm">${esc(f.name)}<small>${f.done ? fmtSize(f.size) : `${f.pct || 0}%`}</small></span><button type="button" class="icon-btn sm ghost" data-rm="${i}" aria-label="Remover">${icon('x', 12)}</button></div>`).join('');
    box.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { pending.splice(Number(b.dataset.rm), 1); paintAttach(); }; });
  };
  const addFiles = (list) => {
    for (const file of list) {
      if (!/^image\/(png|jpe?g|webp|gif)$|^application\/pdf$/.test(file.type)) { toast('Formato não aceito', 'Envie foto (PNG, JPG, WEBP, GIF) ou PDF.', 'error'); continue; }
      if (file.size > 15 * 1048576) { toast('Arquivo muito grande', 'O limite é 15 MB.', 'error'); continue; }
      if (pending.length >= 6) { toast('Máximo de 6 anexos por mensagem', '', 'error'); break; }
      const item = { name: file.name, mime: file.type, size: file.size, done: false, pct: 0, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null };
      pending.push(item);
      const fd = new FormData(); fd.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/assistant/files');
      xhr.setRequestHeader('Authorization', `Bearer ${auth.token}`);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) { item.pct = Math.round((e.loaded / e.total) * 100); paintAttach(); } };
      xhr.onload = () => {
        if (xhr.status === 201) Object.assign(item, JSON.parse(xhr.responseText), { done: true });
        else { pending = pending.filter((x) => x !== item); let msg = 'Falha no envio'; try { msg = JSON.parse(xhr.responseText).error; } catch { /* ok */ } toast('Não deu para anexar', msg, 'error'); }
        paintAttach();
      };
      xhr.send(fd);
    }
    paintAttach();
    input.focus();
  };

  // ---------- envio ----------
  const send = async (text, { auto = false } = {}) => {
    text = (text || '').trim();
    if (pending.some((f) => !f.done)) return toast('Aguarde o envio dos anexos', '', 'info');
    const files = pending.filter((f) => f.done).map(({ file, name: n, mime, size }) => ({ file, name: n, mime, size }));
    if ((!text && !files.length && !auto) || busy) return;
    busy = true;
    input.value = ''; input.style.height = ''; pending = []; paintAttach();
    if (msgs.querySelector('.tg-welcome')) msgs.innerHTML = '';
    if (!auto) msgs.insertAdjacentHTML('beforeend', bubble({ role: 'user', text, files, at: new Date().toISOString() }));
    const status = el.querySelector('#status');
    const statusText = status?.textContent;
    let pend = null; let txt = null; let meta = null; let acc = '';
    const openBubble = (who) => {
      acc = '';
      msgs.insertAdjacentHTML('beforeend', `<div class="tg-msg in pend">${faceOf(who !== undefined ? who : peer(), 30)}<div class="tg-bubble">${who && isGroup() ? `<div class="tg-sender" style="color:${esc(who.color || 'var(--accent)')}">${esc(who.name)}</div>` : ''}<div class="tg-text"><span class="typing"><i></i><i></i><i></i></span></div><div class="tg-meta">${hhmm()}</div></div></div>`);
      pend = [...msgs.querySelectorAll('.tg-msg.pend')].at(-1);
      txt = pend.querySelector('.tg-text'); meta = pend.querySelector('.tg-meta');
      msgs.scrollTop = msgs.scrollHeight;
    };
    if (!isGroup()) openBubble(peer());
    if (status) { status.textContent = isGroup() ? 'alguém está digitando...' : 'digitando...'; status.classList.add('typing-txt'); }
    try {
      await streamChat(text, current, (ev) => {
        if (ev.type === 'conversation' && current !== ev.id) { current = ev.id; localStorage.setItem('codeniac.conv', current); }
        if (ev.type === 'speaker') { openBubble(botById(ev.botId) || { name: ev.name }); if (status) status.textContent = `${ev.name.split(' ')[0]} está digitando...`; }
        if (ev.type === 'speaker_end' && pend) { pend.classList.remove('pend'); pend = null; }
        if (ev.type === 'text' && txt) { acc += ev.text; txt.innerHTML = chatMd(acc); }
        if (ev.type === 'tool' && meta) { meta.insertAdjacentHTML('beforebegin', `<div class="tg-tool">${icon('check', 11)} ${esc(TOOL_LABEL[ev.name] || ev.name)}</div>`); emit('data-changed'); }
        if (ev.type === 'link' && meta) meta.insertAdjacentHTML('beforebegin', `<a class="tg-go" href="${esc(ev.href)}">${icon('chevRight', 11)} Abrir</a>`);
        if (ev.type === 'notice') msgs.insertAdjacentHTML('beforeend', `<div class="tg-notice">${esc(ev.text)}</div>`);
        if (ev.type === 'error' && txt) txt.textContent = ev.text;
        msgs.scrollTop = msgs.scrollHeight;
      }, undefined, { files, auto });
    } catch (err) { toast('Erro', err.message, 'error'); }
    msgs.querySelectorAll('.tg-msg.pend').forEach((p) => { if (p.querySelector('.typing')) p.remove(); else p.classList.remove('pend'); });
    if (status) { status.textContent = statusText; status.classList.remove('typing-txt'); }
    busy = false;
    await refresh();
    emit('data-changed');
  };

  // ---------- criar chat / grupo ----------
  const startChat = async (body) => {
    try {
      const c = await api.post('/assistant/conversations', body);
      convs.unshift(c); current = c.id; localStorage.setItem('codeniac.conv', current);
      setOpen(true); paintList(); loadMessages(); if (!isMobile()) input.focus();
    } catch (err) { toast('Erro', err.message, 'error'); }
  };
  const editBot = async (bot) => {
    const r = await botForm(bot);
    bots = await coll('bots').list();
    if (r?.pinged) { await refresh(); loadMessages(); toast(`${bot.name} mandou uma mensagem`, '', 'success'); } else if (r) { paintList(); loadMessages(); }
  };
  const openNew = () => modal({
    title: 'Criar', wide: true,
    body: `<p class="muted" style="margin:0 0 12px;font-size:12px">Converse com o assistente, com um personagem ou monte um grupo.</p><div class="bot-grid">
      <button class="bot-card" data-pick="">${botAvatar(54)}<b>${esc(name)}</b><small>Assistente do Codeniac</small></button>
      ${bots.map((b) => `<div class="bot-card" data-pick="${b.id}" role="button" tabindex="0">${faceOf(b, 54)}<b>${esc(b.name)}</b><small>${esc(FOCUS[b.focus] || FOCUS.geral)}${b.proactive ? ' · automático' : ''}</small><button class="icon-btn sm ghost bot-edit" data-edit="${b.id}" title="Editar">${icon('edit', 13)}</button></div>`).join('')}
      <button class="bot-card new" data-create>${icon('plus', 26)}<b>Criar personagem</b><small>Nome, foto, personalidade, função e mensagens automáticas</small></button>
      <button class="bot-card new" data-group>${icon('users', 26)}<b>Criar grupo</b><small>Vários personagens conversando entre si</small></button></div>`,
    onMount: (m, close) => {
      m.querySelectorAll('[data-pick]').forEach((c) => {
        const go = (e) => { if (e.target.closest('[data-edit]')) return; close(); startChat(c.dataset.pick ? { botId: c.dataset.pick } : { title: 'Nova conversa' }); };
        c.addEventListener('click', go);
        c.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(e); });
      });
      m.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = async () => { close(); await editBot(bots.find((x) => x.id === b.dataset.edit)); openNew(); }; });
      m.querySelector('[data-create]').onclick = async () => { close(); const b = await botForm(); if (b?.id) { bots = await coll('bots').list(); startChat({ botId: b.id }); } };
      m.querySelector('[data-group]').onclick = async () => { close(); const g = await groupForm(bots, name); if (g) startChat({ group: g }); };
    },
  });

  // ---------- eventos ----------
  el.querySelector('#new').onclick = openNew;
  el.querySelector('#form').onsubmit = (e) => { e.preventDefault(); send(input.value); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !isMobile()) { e.preventDefault(); send(input.value); } });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 140)}px`; });
  input.addEventListener('paste', (e) => { const fs = [...(e.clipboardData?.files || [])]; if (fs.length) { e.preventDefault(); addFiles(fs); } });
  el.querySelector('#clip').onclick = () => el.querySelector('#fileIn').click();
  el.querySelector('#fileIn').onchange = (e) => { addFiles([...e.target.files]); e.target.value = ''; };
  const pane = el.querySelector('#chatPane'); const drop = el.querySelector('#drop');
  pane.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); drop.hidden = false; } });
  drop.addEventListener('dragleave', () => { drop.hidden = true; });
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.hidden = true; addFiles([...e.dataTransfer.files]); });
  el.querySelector('#cq').oninput = paintList;
  el.querySelector('#back').onclick = () => { setOpen(false); };
  const pop = el.querySelector('#emoPop');
  el.querySelector('#emo').onclick = () => { pop.hidden = !pop.hidden; };
  pop.onclick = (e) => { const b = e.target.closest('button'); if (b) { input.value += b.textContent; input.focus(); pop.hidden = true; } };
  bindDictation(el.querySelector('#mic'), input);

  // mensagens automáticas chegando enquanto a tela está aberta
  liveOff?.();
  liveOff = on('chat', async (ev) => {
    if (busy) return;
    await refresh();
    if (ev.conversationId === current) loadMessages();
  });
  const onResize = () => document.body.classList.toggle('chat-full', tg.classList.contains('show-chat') && isMobile());
  window.addEventListener('resize', onResize);

  paintList();
  await loadMessages();
  if (current && !isMobile()) setOpen(true);
  return () => { liveOff?.(); liveOff = null; window.removeEventListener('resize', onResize); document.body.classList.remove('chat-full'); };
}
