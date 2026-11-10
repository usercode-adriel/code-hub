// Assistente em tela cheia, estilo Telegram: lista de conversas, bolhas, comandos rápidos e ditado.
import { api, streamChat } from '../api.js';
import { store, emit } from '../store.js';
import { icon } from '../icons.js';
import { esc, chatMd, toast, confirmDialog, timeAgo } from '../ui.js';
import { TOOL_LABEL, PERSONA, botAvatar, bindDictation, COMMANDS, MODE_LABEL } from '../chatui.js';

const STARTERS = [['☀️', 'Monte meu briefing de hoje', '/briefing'], ['🚗', 'Registrar corrida de R$ 35 com 12 km', '/corrida 35 12km'], ['💸', 'Registrar gasto de R$ 50 com gasolina', '/gasto 50 gasolina'],
  ['✅', 'Criar a tarefa “Estudar SQL”', '/tarefa Estudar SQL'], ['🐢', 'Quais tarefas estou adiando?', '/adiadas'], ['❓', 'O que você sabe fazer?', '/ajuda']];
const ticks = `<span class="ticks">${icon('check', 11)}${icon('check', 11)}</span>`;
const hhmm = (iso) => new Date(iso || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dayOf = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });

export default async function render(el) {
  let convs = await api.get('/assistant/conversations');
  let current = localStorage.getItem('codeniac.conv') && convs.find((c) => c.id === localStorage.getItem('codeniac.conv')) ? localStorage.getItem('codeniac.conv') : null;
  let busy = false;
  const name = store.settings.assistantName || 'Niac';
  const persona = PERSONA[store.settings.assistantPersonality] || PERSONA.amigavel;
  el.innerHTML = `<div class="tg" id="tg"><aside class="tg-list"><div class="tg-list-head"><h2>Conversas</h2><button class="icon-btn sm" id="new" title="Nova conversa">${icon('plus', 15)}</button></div>
      <div class="search tg-search">${icon('search', 14)}<input id="cq" placeholder="Buscar conversa"></div><div class="tg-items" id="items"></div></aside>
    <section class="tg-chat"><header class="tg-head"><button class="icon-btn sm ghost tg-back" id="back">${icon('chevLeft', 16)}</button><div class="tg-peer">${botAvatar(40)}<div><b>${esc(name)} <span class="chip tg-persona">${persona.emoji} ${persona.label}</span></b><small id="status">online · ${MODE_LABEL[store.aiMode] || 'sem IA'}</small></div></div>
      <div class="tg-head-actions"><button class="icon-btn sm ghost" id="ren" title="Renomear">${icon('edit', 15)}</button><button class="icon-btn sm ghost" id="del" title="Apagar conversa">${icon('trash', 15)}</button><a class="icon-btn sm ghost" href="#/settings/assistente" title="Personalidade">${icon('settings', 15)}</a></div></header>
      <div class="tg-messages" id="msgs"></div>
      <div class="tg-cmds" id="cmds">${COMMANDS.map((c) => `<button>${esc(c)}</button>`).join('')}</div>
      <form class="tg-composer" id="form"><button type="button" class="icon-btn ghost" id="emo">😊</button><textarea id="input" rows="1" placeholder="Mensagem ou /comando"></textarea><button type="button" class="icon-btn ghost" id="mic">${icon('mic', 17)}</button><button class="tg-send" aria-label="Enviar">${icon('send', 17)}</button></form>
      <div class="tg-emoji-pop" id="emoPop" hidden>${'😀😂😊😍🤔😅👍🙏🔥🚗💸📚✅🎯💡🇺🇸☕🎉😴'.match(/./gu).map((e) => `<button type="button" style="font-size:20px;border:0;background:none;padding:4px">${e}</button>`).join('')}</div></section></div>`;
  const tg = el.querySelector('#tg');
  const msgs = el.querySelector('#msgs');
  const input = el.querySelector('#input');

  const paintList = () => {
    const q = el.querySelector('#cq').value.toLowerCase();
    el.querySelector('#items').innerHTML = convs.filter((c) => !q || c.title.toLowerCase().includes(q)).map((c) => `<button class="tg-item ${c.id === current ? 'on' : ''}" data-c="${c.id}">${botAvatar(44)}<span class="tg-item-body"><span class="tg-row"><b>${esc(c.title)}</b><time>${c.updatedAt ? timeAgo(c.updatedAt) : ''}</time></span><span class="tg-preview">${c.last ? `${c.last.role === 'user' ? '<span class="you">Você: </span>' : ''}${esc(c.last.text.slice(0, 80))}` : 'Sem mensagens'}</span></span></button>`).join('') || '<div class="tg-empty-list muted">Nenhuma conversa ainda.</div>';
    el.querySelectorAll('[data-c]').forEach((b) => { b.onclick = () => { current = b.dataset.c; localStorage.setItem('codeniac.conv', current); tg.classList.add('show-chat'); paintList(); loadMessages(); }; });
  };
  const bubble = (m) => {
    const out = m.role === 'user';
    return `<div class="tg-msg ${out ? 'out' : 'in'}">${out ? '' : botAvatar(30)}<div class="tg-bubble"><div class="tg-text">${out ? esc(m.text) : chatMd(m.text || '')}</div>
      ${(m.tools || []).map((t) => `<div class="tg-tool">${icon('check', 11)} ${esc(TOOL_LABEL[t] || t)}</div>`).join('')}${m.link ? `<a class="tg-go" href="${esc(m.link)}">${icon('chevRight', 11)} Abrir</a>` : ''}
      <div class="tg-meta">${hhmm(m.at)}${out ? ticks : ''}</div></div></div>`;
  };
  const welcome = () => `<div class="tg-welcome">${botAvatar(64)}<h3>Oi, ${esc((store.user.name || '').split(' ')[0])}! Eu sou ${esc(name)}.</h3><p>Conheço todas as áreas do Codeniac e respondo na hora, sem depender de internet. Use os comandos para registrar coisas em segundos.</p>
    <div class="tg-starters">${STARTERS.map(([e, t, c]) => `<button data-s="${esc(c)}"><span>${e}</span>${esc(t)}</button>`).join('')}</div></div>`;
  const loadMessages = async () => {
    if (!current) { msgs.innerHTML = welcome(); bindStarters(); return; }
    const c = await api.get(`/assistant/conversations/${current}`).catch(() => null);
    if (!c) { current = null; localStorage.removeItem('codeniac.conv'); msgs.innerHTML = welcome(); bindStarters(); return; }
    let lastDay = '';
    msgs.innerHTML = c.messages.map((m) => { const d = dayOf(m.at); const sep = d !== lastDay ? `<div class="tg-day"><span>${d}</span></div>` : ''; lastDay = d; return sep + bubble(m); }).join('') || welcome();
    bindStarters();
    msgs.scrollTop = msgs.scrollHeight;
  };
  const bindStarters = () => msgs.querySelectorAll('[data-s]').forEach((b) => { b.onclick = () => send(b.dataset.s); });

  const send = async (text) => {
    text = text.trim();
    if (!text || busy) return;
    busy = true;
    input.value = ''; input.style.height = '';
    if (msgs.querySelector('.tg-welcome')) msgs.innerHTML = '';
    msgs.insertAdjacentHTML('beforeend', bubble({ role: 'user', text, at: new Date().toISOString() }));
    msgs.insertAdjacentHTML('beforeend', `<div class="tg-msg in" id="pend">${botAvatar(30)}<div class="tg-bubble"><div class="tg-text"><span class="typing"><i></i><i></i><i></i></span></div><div class="tg-meta">${hhmm()}</div></div></div>`);
    msgs.scrollTop = msgs.scrollHeight;
    const status = el.querySelector('#status');
    status.textContent = 'digitando...'; status.classList.add('typing-txt');
    const pend = el.querySelector('#pend');
    const txt = pend.querySelector('.tg-text');
    const meta = pend.querySelector('.tg-meta');
    let acc = '';
    try {
      await streamChat(text, current, (ev) => {
        if (ev.type === 'conversation') { current = ev.id; localStorage.setItem('codeniac.conv', current); }
        if (ev.type === 'text') { acc += ev.text; txt.innerHTML = chatMd(acc); }
        if (ev.type === 'tool') { meta.insertAdjacentHTML('beforebegin', `<div class="tg-tool">${icon('check', 11)} ${esc(TOOL_LABEL[ev.name] || ev.name)}</div>`); emit('data-changed'); }
        if (ev.type === 'link') meta.insertAdjacentHTML('beforebegin', `<a class="tg-go" href="${esc(ev.href)}">${icon('chevRight', 11)} Abrir</a>`);
        if (ev.type === 'notice') meta.insertAdjacentHTML('beforebegin', `<div class="tg-tool" style="color:var(--warn)">${esc(ev.text)}</div>`);
        if (ev.type === 'error') txt.textContent = ev.text;
        msgs.scrollTop = msgs.scrollHeight;
      });
    } catch (err) { txt.textContent = err.message; }
    pend.removeAttribute('id');
    status.textContent = `online · ${MODE_LABEL[store.aiMode] || 'sem IA'}`; status.classList.remove('typing-txt');
    busy = false;
    convs = await api.get('/assistant/conversations');
    paintList();
    emit('data-changed');
  };

  el.querySelector('#form').onsubmit = (e) => { e.preventDefault(); send(input.value); };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); } });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 160)}px`; });
  el.querySelector('#cmds').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; if (b.textContent.endsWith(' ')) { input.value = b.textContent; input.focus(); } else send(b.textContent); };
  el.querySelector('#cq').oninput = paintList;
  el.querySelector('#new').onclick = async () => { const c = await api.post('/assistant/conversations', { title: 'Nova conversa' }); convs.unshift(c); current = c.id; localStorage.setItem('codeniac.conv', current); tg.classList.add('show-chat'); paintList(); loadMessages(); input.focus(); };
  el.querySelector('#back').onclick = () => tg.classList.remove('show-chat');
  el.querySelector('#ren').onclick = async () => {
    if (!current) return;
    const t = prompt('Nome da conversa:', convs.find((c) => c.id === current)?.title || '');
    if (t?.trim()) { await api.put(`/assistant/conversations/${current}`, { title: t.trim() }); convs = await api.get('/assistant/conversations'); paintList(); }
  };
  el.querySelector('#del').onclick = async () => {
    if (!current || !(await confirmDialog('Apagar conversa', 'As mensagens desta conversa serão apagadas.'))) return;
    await api.del(`/assistant/conversations/${current}`);
    convs = convs.filter((c) => c.id !== current); current = null; localStorage.removeItem('codeniac.conv');
    tg.classList.remove('show-chat'); paintList(); loadMessages(); toast('Conversa apagada');
  };
  const pop = el.querySelector('#emoPop');
  el.querySelector('#emo').onclick = () => { pop.hidden = !pop.hidden; };
  pop.onclick = (e) => { const b = e.target.closest('button'); if (b) { input.value += b.textContent; input.focus(); pop.hidden = true; } };
  bindDictation(el.querySelector('#mic'), input);
  paintList();
  await loadMessages();
  if (current) tg.classList.add('show-chat');
}
