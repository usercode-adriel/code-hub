// CHAT COM O SISTEMA: um único assistente (Niac), sem personagens, grupos nem mensagens automáticas.
// Usado no Início (versão pequena, "Chat Codeniac ao vivo") e na tela Chat (com histórico de conversas).
import { api, streamChat } from '../api.js';
import { store, emit } from '../store.js';
import { icon } from '../icons.js';
import { esc, chatMd } from '../ui.js';
import { TOOL_LABEL, botAvatar } from '../chatui.js';

const nome = () => store.settings.assistantName || 'Niac';
const bolha = (m) => `<div class="nx-msg ${m.role === 'user' ? 'eu' : ''}">${chatMd(m.text || '')}</div>`;

/**
 * Monta o chat em `host`. `chave` guarda a conversa aberta no navegador.
 * Devolve { abrir(id), nova(), id() } para a tela de histórico controlar a conversa.
 */
export function montarChat(host, { chave = 'codeniac.inicioConv', cheio = false, aoMudar = null } = {}) {
  let busy = false;
  host.innerHTML = `<div class="nx-chat ${cheio ? 'cheio' : ''}"><div class="nx-quem">${botAvatar(26)}<b>${esc(nome())}</b><span class="nx-vivo"><i></i>AO VIVO</span></div>
    <div class="nx-msgs" data-msgs></div>
    <form data-form><input data-msg placeholder="Pergunte ao ${esc(nome())} ou use /comandos…" autocomplete="off" maxlength="4000" aria-label="Mensagem"><button class="nx-btn pri" type="submit">${icon('send', 14)} Enviar</button></form></div>`;
  const $ = (s) => host.querySelector(s);
  const msgs = $('[data-msgs]');
  const id = () => localStorage.getItem(chave);

  const boasVindas = () => {
    const primeiro = (store.user?.name || '').split(' ')[0] || 'tudo bem';
    msgs.innerHTML = bolha({ role: 'assistant', text: `Oi, ${primeiro}! Sou ${nome()}, o assistente do Codeniac. Pergunte sobre as notícias, peça uma tarefa ("tarefa: revisar proposta") ou um resumo do seu dia.` });
  };
  async function abrir(conversa) {
    if (conversa) localStorage.setItem(chave, conversa); else localStorage.removeItem(chave);
    let lista = [];
    if (conversa) { try { lista = (await api.get(`/assistant/conversations/${conversa}`)).messages || []; } catch { localStorage.removeItem(chave); } }
    if (lista.length) msgs.innerHTML = lista.slice(-60).map(bolha).join(''); else boasVindas();
    msgs.scrollTop = msgs.scrollHeight;
  }
  const nova = () => abrir(null);

  async function enviar(texto) {
    texto = texto.trim();
    if (!texto || busy) return;
    busy = true;
    if (msgs.querySelector('[data-vazio]')) msgs.innerHTML = '';
    msgs.insertAdjacentHTML('beforeend', bolha({ role: 'user', text: texto }));
    msgs.insertAdjacentHTML('beforeend', '<div class="nx-msg" data-pend><span class="typing"><i></i><i></i><i></i></span></div>');
    msgs.scrollTop = msgs.scrollHeight;
    const pend = msgs.querySelector('[data-pend]');
    let acc = '';
    try {
      await streamChat(texto, id(), (ev) => {
        if (ev.type === 'conversation') { localStorage.setItem(chave, ev.id); aoMudar?.(ev.id); }
        if (ev.type === 'text') { acc += ev.text; pend.innerHTML = chatMd(acc); }
        if (ev.type === 'tool') { pend.insertAdjacentHTML('beforeend', `<span class="tool-note">${icon('check', 11)} ${esc(TOOL_LABEL[ev.name] || ev.name)}</span>`); emit('data-changed'); }
        if (ev.type === 'notice') pend.insertAdjacentHTML('beforeend', `<span class="notice">${esc(ev.text)}</span>`);
        if (ev.type === 'link') pend.insertAdjacentHTML('beforeend', `<a class="go-link" href="${esc(ev.href)}">${icon('chevRight', 11)} Abrir</a>`);
        if (ev.type === 'error') pend.textContent = ev.text;
        msgs.scrollTop = msgs.scrollHeight;
      });
    } catch (err) { pend.textContent = err.message; }
    pend.removeAttribute('data-pend');
    busy = false;
    emit('data-changed');
    aoMudar?.(id());
  }

  $('[data-form]').onsubmit = (e) => { e.preventDefault(); const i = $('[data-msg]'); const t = i.value; i.value = ''; enviar(t); };
  abrir(id());
  return { abrir, nova, id };
}
