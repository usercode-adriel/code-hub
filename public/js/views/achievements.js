// Conquistas: XP e medalhas calculadas a partir do que você já fez no hub.
import { api, coll } from '../api.js';
import { icon } from '../icons.js';
import { esc } from '../ui.js';

export default async function render(el) {
  const [tasks, d, habits, cards, journal, shifts, books, decisions, money, events] = await Promise.all([api.get('/tasks'), api.get('/dashboard'), coll('habits').list(), coll('cards').list(),
    coll('journal').list(), api.get('/shifts'), coll('books').list(), coll('decisions').list(), coll('money').list(), api.get('/events?limit=300')]);
  const done = tasks.filter((t) => t.status === 'done').length;
  const bestStreak = Math.max(0, ...habits.map((h) => { const s = [...h.days].sort(); let best = 0; let run = 0; let prev = null; for (const x of s) { const dd = new Date(`${x}T12:00:00`); run = prev && (dd - prev) / 86400000 === 1 ? run + 1 : 1; best = Math.max(best, run); prev = dd; } return best; }));
  const reviewed = cards.filter((c) => c.reps > 0).length;
  const learned = cards.filter((c) => c.interval >= 21).length;
  const read = books.filter((b) => b.status === 'lido').length;
  const badges = [
    ['check', 'Primeira tarefa', 'Conclua 1 tarefa', done >= 1], ['trophy', 'Produtivo', 'Conclua 25 tarefas', done >= 25], ['rocket', 'Máquina', 'Conclua 100 tarefas', done >= 100],
    ['note', 'Escritor', 'Crie 5 páginas', d.pagesCount >= 5], ['flame', 'Constância', 'Sequência de 7 dias num hábito', bestStreak >= 7], ['zap', 'Imparável', 'Sequência de 30 dias', bestStreak >= 30],
    ['globe', 'Good start', 'Revise 20 cartões de inglês', reviewed >= 20], ['school', 'Fluência a caminho', 'Memorize 100 cartões', learned >= 100], ['feather', 'Viajante', 'Escreva 10 páginas no diário', journal.length >= 10],
    ['car', 'Na estrada', 'Encerre 10 turnos', shifts.filter((s) => !s.running).length >= 10], ['book', 'Leitor', 'Leia 3 livros', read >= 3], ['scale', 'Pensador', 'Registre 3 decisões', decisions.filter((x) => x.status !== 'rascunho').length >= 3],
    ['wallet', 'No controle', 'Registre 50 lançamentos', money.length >= 50], ['activity', 'Presente', '300 acontecimentos no hub', events.length >= 300],
  ];
  const xp = done * 10 + d.pagesCount * 15 + reviewed * 2 + journal.length * 12 + shifts.length * 8 + read * 40 + decisions.length * 10 + bestStreak * 5;
  const level = Math.floor(Math.sqrt(xp / 50)) + 1;
  const next = (level ** 2) * 50;
  const prev = ((level - 1) ** 2) * 50;
  el.innerHTML = `<div class="page-head"><div><h1>Conquistas</h1><p>${badges.filter((b) => b[3]).length} de ${badges.length} medalhas</p></div></div>
    <section class="card level-card"><div class="level-badge">${level}</div><div style="flex:1"><b style="font-size:16px">Nível ${level}</b><p class="muted" style="margin:2px 0 10px;font-size:12px">${xp} XP · faltam ${next - xp} para o nível ${level + 1}</p><div class="progress" style="height:8px"><span style="width:${((xp - prev) / (next - prev)) * 100}%"></span></div></div></section>
    <section class="badges">${badges.map(([ic, t, s, on]) => `<div class="card badge ${on ? 'on' : ''}"><div class="b-ico">${icon(ic, 22)}</div><b>${esc(t)}</b><small>${esc(s)}</small></div>`).join('')}</section>`;
}
