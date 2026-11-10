// Peças compartilhadas entre o painel lateral do chat e a tela completa do assistente.
import { esc, toast } from './ui.js';
import { store } from './store.js';

export const TOOL_LABEL = {
  create_task: 'Tarefa criada', update_task_status: 'Tarefa atualizada', list_tasks: 'Consultou tarefas',
  add_finance_entry: 'Lançamento registrado no InDrive', finance_summary: 'Consultou o InDrive',
  money: 'Lançamento no Financeiro', inbox: 'Guardado na caixa de entrada', agenda: 'Compromisso na agenda',
};
export const PERSONA = {
  amigavel: { label: 'Amigável', desc: 'Caloroso e casual, como um amigo', emoji: '😊' },
  profissional: { label: 'Profissional', desc: 'Objetivo e cordial, como um consultor', emoji: '💼' },
  divertido: { label: 'Divertido', desc: 'Bem-humorado, com piadas rápidas', emoji: '😄' },
  mentor: { label: 'Mentor', desc: 'Encorajador, faz você refletir', emoji: '🧭' },
  zen: { label: 'Zen', desc: 'Calmo, ajuda a focar no essencial', emoji: '🍃' },
  nerd: { label: 'Nerd', desc: 'Referências geek e de tecnologia', emoji: '🤓' },
};
export const COMMANDS = ['/corrida 35 12km', '/gasto 50 gasolina', '/tarefa ', '/nota ', '/agenda 15/11 14:00 ', '/despesa ', '/briefing', '/ajuda'];
export const MODE_LABEL = { gemini: 'Gemini', ollama: 'IA local', claude: 'Claude', local: 'sem IA' };

export function botAvatar(size = 26) {
  return `<div class="avatar bot-face" style="--s:${size}px">${esc(store.settings.assistantAvatar || '🤖')}</div>`;
}

export function bindDictation(btn, input) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  btn.onclick = () => {
    if (!SR) { toast('Voz indisponível', 'Seu navegador não suporta ditado.', 'error'); return; }
    const rec = new SR();
    rec.lang = 'pt-BR';
    btn.classList.add('listening');
    rec.onresult = (ev) => { input.value = ev.results[0][0].transcript; input.focus(); };
    rec.onend = () => btn.classList.remove('listening');
    rec.start();
  };
}
