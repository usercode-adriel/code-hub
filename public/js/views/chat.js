// CHAT: conversa com o assistente do sistema (um só, sem personagens, grupos ou mensagens automáticas).
import { api } from '../api.js';
import { icon } from '../icons.js';
import { esc, timeAgo, confirmDialog, toast } from '../ui.js';
import { montarChat } from '../chat/niac.js';

const CHAVE = 'codeniac.conv';

export default async function render(el) {
  el.innerHTML = `<div class="nx-page" style="overflow:hidden"><div class="nx-chat-pag">
    <aside class="nx-card"><header><h3>Conversas</h3><button type="button" class="nx-btn pri nx-esq" data-nova>${icon('plus', 13)} Nova</button></header><div class="nx-conv" data-lista></div></aside>
    <section class="nx-card" data-chat></section></div></div>`;
  const $ = (s) => el.querySelector(s);
  let convs = [];
  const carregarLista = async () => {
    // só conversas com o assistente: as antigas de personagens e grupos ficam de fora
    convs = (await api.get('/assistant/conversations').catch(() => [])).filter((c) => !c.botId && !c.group);
    const atual = localStorage.getItem(CHAVE);
    if (atual && !convs.some((c) => c.id === atual)) localStorage.removeItem(CHAVE);
    $('[data-lista]').innerHTML = convs.length ? convs.map((c) => `<button type="button" data-c="${esc(c.id)}" class="${c.id === localStorage.getItem(CHAVE) ? 'on' : ''}">${esc(c.title)}<small>${esc(timeAgo(c.updatedAt))}</small></button>`).join('')
      : '<div class="nx-vazio">Nenhuma conversa ainda. Escreva a primeira mensagem.</div>';
  };
  await carregarLista();
  const chat = montarChat($('[data-chat]'), { chave: CHAVE, cheio: true, aoMudar: () => { carregarLista(); } });
  $('[data-lista]').onclick = async (e) => { const b = e.target.closest('[data-c]'); if (b) { await chat.abrir(b.dataset.c); carregarLista(); } };
  $('[data-nova]').onclick = async () => { await chat.nova(); carregarLista(); };
  $('[data-chat]').insertAdjacentHTML('afterbegin', `<div style="display:flex;justify-content:flex-end"><button type="button" class="nx-btn" data-apagar title="Apagar esta conversa">${icon('trash', 13)} Apagar conversa</button></div>`);
  $('[data-apagar]').onclick = async () => {
    const id = chat.id(); if (!id) return;
    if (!(await confirmDialog('Apagar conversa', 'Esta conversa será apagada.', 'Apagar'))) return;
    try { await api.del(`/assistant/conversations/${id}`); await chat.nova(); await carregarLista(); } catch (err) { toast('Chat', err.message, 'error'); }
  };
}
