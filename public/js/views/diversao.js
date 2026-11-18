// 10 · ENTERTAINMENT — Quiz da Cidade (perguntas sobre fatos reais do mundo), TV, rádio, cinema e comunidades.
import { shell, nx, api, esc, icon, toast } from '../world/wui.js';

export default async function render(el) {
  const body = shell(el, 'diversao', { title: 'Entertainment', sub: 'Jogos e programas feitos com o que acontece na cidade.' });
  body.innerHTML = `<div class="dv-grid"><section class="w-panel dv-quiz" id="dvQuiz"><div class="skeleton" style="height:200px"></div></section>
    <section class="dv-links">
      <a class="w-panel dv-card" href="#/midia/tv/nxnews" style="--c:#ef4444">${icon('play', 22)}<b>NX News 24h</b><small>Jornal com as notícias reais da cidade</small></a>
      <a class="w-panel dv-card" href="#/midia/tv/show" style="--c:#a855f7">${icon('star', 22)}<b>Nexus Show</b><small>Entrevista com a pessoa mais famosa da semana</small></a>
      <a class="w-panel dv-card" href="#/midia/tv/neonfm" style="--c:#ec4899">${icon('volume', 22)}<b>Neon FM</b><small>Músicas lançadas pelos artistas da cidade</small></a>
      <a class="w-panel dv-card" href="#/midia/cinema" style="--c:#f97316">${icon('star', 22)}<b>Cinema</b><small>Filmes, críticas e o Prêmio Nexus</small></a>
      <a class="w-panel dv-card" href="#/midia/tv/esporte" style="--c:#22c55e">${icon('trophy', 22)}<b>Liga Nexus</b><small>Resultados e próximos jogos</small></a>
      <a class="w-panel dv-card" href="#/social/comunidades" style="--c:#06b6d4">${icon('layers', 22)}<b>Comunidade Games</b><small>Discussões com os moradores</small></a>
    </section></div>`;
  const box = body.querySelector('#dvQuiz');
  const start = async () => {
    try {
      const q = await api.get('/mundo/diversao/quiz');
      const answers = {};
      box.innerHTML = `<div class="w-ph"><h3>${icon('trophy', 16)} Quiz da Cidade</h3><small class="muted">${q.left ? `Vale prêmio: 40 NXC por acerto (${q.left} rodada(s) premiada(s) hoje)` : 'Sem prêmio hoje, mas vale XP'} · recorde ${q.best}/${q.questions.length}</small></div>
        <p class="muted">Todas as perguntas são sobre o que realmente aconteceu em Codeniac Society.</p>
        ${q.questions.map((x, i) => `<div class="dv-q"><b>${i + 1}. ${esc(x.q)}</b><div class="dv-opts">${x.options.map((o) => `<button data-q="${x.id}" data-o="${esc(o)}">${esc(o)}</button>`).join('')}</div></div>`).join('') || '<p class="muted">Ainda não aconteceu coisa suficiente na cidade para um quiz. Volte daqui a pouco.</p>'}
        ${q.questions.length ? '<button class="btn primary" id="dvSend" disabled>Conferir respostas</button>' : ''}`;
      box.querySelectorAll('[data-q]').forEach((b) => { b.onclick = () => { answers[b.dataset.q] = b.dataset.o; box.querySelectorAll(`[data-q="${b.dataset.q}"]`).forEach((x) => x.classList.toggle('on', x === b)); box.querySelector('#dvSend').disabled = Object.keys(answers).length < q.questions.length; }; });
      box.querySelector('#dvSend')?.addEventListener('click', async () => {
        const r = await api.post('/mundo/diversao/quiz', { answers });
        r.results.forEach((x) => box.querySelectorAll(`[data-q="${x.id}"]`).forEach((b) => { b.disabled = true; b.classList.toggle('right', b.dataset.o === x.right); b.classList.toggle('wrong', b.dataset.o === x.chosen && !x.ok); }));
        box.querySelector('#dvSend').outerHTML = `<div class="dv-score"><b>${r.score}/${r.total}</b> acertos${r.prize ? ` · prêmio de ${nx(r.prize, 0)} creditado` : ''}<button class="btn sm outline" id="dvAgain">Jogar de novo</button></div>`;
        box.querySelector('#dvAgain').onclick = start;
        if (r.prize) toast('Prêmio!', `${nx(r.prize, 0)} no seu saldo`, 'success');
      });
    } catch (err) { box.innerHTML = `<p class="muted">${esc(err.message)}</p>`; }
  };
  await start();
}
