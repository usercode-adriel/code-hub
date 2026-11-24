// INÍCIO: notícias internacionais ao vivo (com leitor dentro do sistema), chat Codeniac ao vivo (um só assistente),
// checklist das suas tarefas e insights calculados das manchetes.
import { api } from '../api.js';
import { store } from '../store.js';
import { icon } from '../icons.js';
import { esc, toast } from '../ui.js';
import { montarNoticias, montarInsights } from '../news/noticias.js';
import { montarChat } from '../chat/niac.js';

export default async function render(el) {
  const primeiro = (store.user?.name || '').split(' ')[0];
  el.innerHTML = `<div class="nx-page"><h1>Início</h1>
    <p class="nx-sub">${primeiro ? `Olá, ${esc(primeiro)}. ` : ''}Notícias do mundo sobre tecnologia, IA, software e e-commerce, ao vivo.</p>
    <div class="nx-inicio">
      <section class="nx-card" data-news></section>
      <section class="nx-card" data-chat><header><h3>Chat Codeniac ao vivo</h3></header><div data-chat-box></div></section>
      <div class="nx-baixo">
        <section class="nx-card" data-check><header><h3>Checklist</h3><span class="nx-esq">${icon('check', 14)} suas tarefas abertas</span></header><div class="nx-check" data-itens></div>
          <form class="nx-add" data-add><input placeholder="Nova tarefa…" maxlength="160" aria-label="Nova tarefa"><button class="nx-btn pri" type="submit">${icon('plus', 13)} Adicionar</button></form></section>
        <section class="nx-card" data-ins></section>
      </div></div></div>`;
  const $ = (s) => el.querySelector(s);
  const parar = [
    montarNoticias($('[data-news]'), { compacto: true, limite: 6, titulo: 'Notícias ao vivo' }),
    montarInsights($('[data-ins]')),
  ];
  montarChat($('[data-chat-box]'), { chave: 'codeniac.inicioConv' });

  // checklist: as tarefas abertas do sistema
  const lista = $('[data-itens]');
  const carregarTarefas = async () => {
    try {
      const abertas = (await api.get('/tasks')).filter((t) => t.status !== 'done').slice(0, 8);
      lista.innerHTML = abertas.length
        ? abertas.map((t) => `<label data-t="${esc(t.id)}"><input type="checkbox"><span>${esc(t.title)}</span></label>`).join('')
        : '<div class="nx-vazio">Tudo em dia! Adicione uma tarefa abaixo.</div>';
    } catch { lista.innerHTML = '<div class="nx-vazio">Não consegui carregar as tarefas.</div>'; }
  };
  lista.addEventListener('change', async (e) => {
    const l = e.target.closest('[data-t]'); if (!l) return;
    l.classList.add('feito');
    try { await api.put(`/tasks/${l.dataset.t}`, { status: 'done' }); setTimeout(carregarTarefas, 600); }
    catch (err) { l.classList.remove('feito'); e.target.checked = false; toast('Checklist', err.message, 'error'); }
  });
  $('[data-add]').onsubmit = async (e) => {
    e.preventDefault();
    const inp = e.target.querySelector('input'); const title = inp.value.trim(); if (!title) return;
    const projectId = store.projects?.[0]?.id;
    if (!projectId) { toast('Checklist', 'Crie um projeto em Meu hub para guardar as tarefas.', 'warning'); return; }
    try { await api.post('/tasks', { title, projectId }); inp.value = ''; carregarTarefas(); } catch (err) { toast('Checklist', err.message, 'error'); }
  };
  carregarTarefas();
  return () => parar.forEach((f) => f?.());
}
