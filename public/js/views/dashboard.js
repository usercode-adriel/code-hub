// Dashboard 1.5: destaque em carrossel, lista rápida, carrossel de projetos, foco agora e estatística.
import { api } from '../api.js';
import { store } from '../store.js';
import { icon } from '../icons.js';
import { esc, dmy, isLate, brl, PRIORITY, toast } from '../ui.js';
import { openTaskModal, openProjectModal } from '../components.js';

let heroTimer = null;
const PALETTE = ['#e0464b', '#f5a524', '#7c3aed', '#22c55e', '#06b6d4', '#ec4899'];

export default async function render(el) {
  clearInterval(heroTimer);
  const d = await api.get('/dashboard');
  const projects = d.projects;
  const favs = projects.filter((p) => p.favorite);
  const slides = (favs.length ? favs : projects).slice(0, 6);
  const open = d.upcoming.length ? d.upcoming : d.focus;
  const focus = d.focus[0] || d.upcoming[0] || null;

  const rows = open.slice(0, 3).map((t) => `<button class="row-card" data-task="${t.id}"><span class="th" style="--cc:${esc(t.project.color || 'var(--accent)')}">${icon(t.project.icon || 'check', 20)}</span>
      <span class="tx">${esc(t.title)} <em>(${esc(t.project.name || 'Projeto')}${t.dueDate ? ` · ${dmy(t.dueDate).slice(0, 5)}` : ''})</em>${isLate(t) ? '<small style="color:var(--danger)">atrasada</small>' : ''}</span><span class="chev">${icon('chevRight', 16)}</span></button>`);
  const shortcuts = [
    ['#/financeiro', 'wallet', '#22c55e', 'Financeiro', `saldo do mês: ${brl(d.financeMonth.in - d.financeMonth.out)}`],
    ['#/livros', 'book', '#e0464b', 'Biblioteca', 'seus livros, PDFs e EPUBs'],
    ['#/assistente', 'bot', '#7c3aed', 'Assistente', 'converse ou crie um personagem'],
  ];
  while (rows.length < 3) {
    const [href, ic, c, t, sub] = shortcuts[rows.length];
    rows.push(`<a class="row-card" href="${href}"><span class="th" style="--cc:${c}">${icon(ic, 20)}</span><span class="tx">${t} <em>(${esc(sub)})</em></span><span class="chev">${icon('chevRight', 16)}</span></a>`);
  }

  el.innerHTML = `
    <section class="d-top">
      ${slides.length ? `<div class="hero2" id="hero"><div class="hero2-cover" id="hCover"></div><div class="hero2-body" id="hBody"></div><div class="hero2-art" id="hArt"></div>
        <div class="hero2-dots">${slides.map((_, i) => `<button data-i="${i}" aria-label="Destaque ${i + 1}"></button>`).join('')}</div></div>`
        : `<div class="hero2"><div class="hero2-body"><h1>Bem-vindo!</h1><p>Crie seu primeiro projeto para começar.</p><div class="hero2-foot"><button class="pill-btn" id="firstP">${icon('plus', 13)} Novo projeto</button></div></div></div>`}
      <div class="d-list">${rows.join('')}</div>
    </section>
    <section class="d-mid">
      <div>
        <div class="section-head"><h3 style="font-size:17px">Seus projetos</h3><button class="see-more" id="newP">${icon('plus', 12)} Novo</button></div>
        <div class="hscroll-wrap"><div class="hscroll" id="pRow">${projects.map((p) => `<a class="pcard" href="#/project/${esc(p.slug)}" style="--c:${esc(p.color)}">
            ${p.cover ? `<span class="bg" style="background-image:url('${esc(p.cover)}')"></span>` : `<span class="gl">${icon(p.icon, 150)}</span>`}
            <span class="ic">${icon(p.icon, 16)}</span>${p.favorite ? `<span class="fv">${icon('star', 15)}</span>` : ''}
            <b>${esc(p.name)}</b><small>${esc(p.description || p.tagline || '')}</small></a>`).join('')}
            <button class="pcard new" id="newP2">${icon('plus', 24)}<span>Novo projeto</span></button></div>
          ${projects.length > 3 ? `<button class="hs-next" id="pNext" aria-label="Mais projetos">${icon('chevRight', 18)}</button>` : ''}</div>
        <div class="section-head"><h3 style="font-size:17px">Foco agora</h3><a class="see-more" href="#/tasks">Ver tarefas ${icon('chevRight', 12)}</a></div>
        ${focus ? `<div class="dl-row" style="--c:${esc(focus.project.color || 'var(--accent)')}"><span class="th">${icon(focus.project.icon || 'target', 26)}</span>
            <div class="tx"><b>${esc(focus.title)}</b><span class="chip">${esc(focus.project.name || '')} · ${PRIORITY[focus.priority]}</span></div>
            <div class="meta">${focus.dueDate ? dmy(focus.dueDate) : 'sem prazo'}<small>${isLate(focus) ? 'atrasada' : focus.status === 'doing' ? 'em andamento' : 'a fazer'}</small></div>
            <div class="acts"><button class="round-btn go" id="fDone" title="Concluir">${icon('check', 14)}</button><button class="round-btn" id="fOpen" title="Abrir">${icon('edit', 13)}</button></div></div>`
          : `<div class="dl-row"><span class="th">${icon('trophy', 26)}</span><div class="tx"><b>Tudo em dia!</b><span class="chip">nenhuma tarefa aberta</span></div><div class="acts"><button class="round-btn go" id="fNew" title="Nova tarefa">${icon('plus', 14)}</button></div></div>`}
      </div>
      <div class="stat-card"><div class="section-head"><h3 style="font-size:17px">Sua estatística</h3><a class="see-more" href="#/achievements">${icon('chevRight', 14)}</a></div>
        <div class="blob"><div class="blob-in"><small>Tarefas concluídas</small><b>${d.totals.done.toLocaleString('pt-BR')}</b><small>${d.totals.progress}% do total</small></div></div>
        <div class="stat-mini">
          <a href="#/tasks"><span style="--cc:${PALETTE[0]}">${icon('tasks', 19)}</span>${d.totals.open}<small>abertas</small></a>
          <a href="#/tasks?filter=late"><span style="--cc:${PALETTE[1]};color:#1a1200">${icon('clock', 19)}</span>${d.totals.overdue}<small>atrasadas</small></a>
          <a href="#/financeiro"><span style="--cc:${PALETTE[2]}">${icon('wallet', 19)}</span>${brl(d.financeMonth.in - d.financeMonth.out).replace(/,\d\d$/, '')}<small>InDrive no mês</small></a>
        </div></div>
    </section>`;

  const newProject = () => openProjectModal().then((p) => { if (p) location.hash = `#/project/${p.slug}`; });
  el.querySelector('#newP').onclick = newProject;
  el.querySelector('#newP2').onclick = newProject;
  el.querySelector('#firstP')?.addEventListener('click', newProject);
  el.querySelector('#pNext')?.addEventListener('click', () => el.querySelector('#pRow').scrollBy({ left: 220, behavior: 'smooth' }));
  const allTasks = [...d.upcoming, ...d.focus];
  el.querySelectorAll('[data-task]').forEach((b) => { b.onclick = () => openTaskModal(allTasks.find((t) => t.id === b.dataset.task)).then(() => render(el)); });
  el.querySelector('#fDone')?.addEventListener('click', async () => { await api.put(`/tasks/${focus.id}`, { status: 'done' }); toast('Tarefa concluída ✅', focus.title, 'success'); render(el); });
  el.querySelector('#fOpen')?.addEventListener('click', () => openTaskModal(focus).then(() => render(el)));
  el.querySelector('#fNew')?.addEventListener('click', () => openTaskModal().then(() => render(el)));

  // carrossel do destaque
  let idx = 0;
  const show = (i) => {
    if (!slides.length || !el.querySelector('#hero')) return;
    idx = (i + slides.length) % slides.length;
    const p = slides[idx];
    const cover = p.cover || store.images?.heroDefault;
    const hero = el.querySelector('#hero');
    hero.style.setProperty('--c', p.color);
    el.querySelector('#hCover').style.backgroundImage = cover ? `url('${cover}')` : '';
    const others = projects.filter((x) => x.id !== p.id).slice(0, 3);
    el.querySelector('#hBody').innerHTML = `<div class="hero2-chips"><span class="chip yellow">${icon('flame', 12)} ${p.favorite ? 'Favorito' : 'Em destaque'}</span>
        <button class="round-btn" id="hTask" title="Nova tarefa neste projeto">${icon('plus', 14)}</button><a class="round-btn" href="#/project/${esc(p.slug)}" title="Páginas">${icon('note', 14)}</a></div>
      <h1>${esc(p.name)}</h1><p>${esc(p.description || p.tagline || '')}</p>
      <div class="hero2-foot"><span class="stack-av">${others.map((o) => `<span style="--cc:${esc(o.color)}">${icon(o.icon, 13)}</span>`).join('')}</span>
        <a class="pill-btn" href="#/project/${esc(p.slug)}">${icon('note', 13)} ${p.pages || 0} página(s)</a><a class="pill-btn" href="#/project/${esc(p.slug)}" style="background:rgba(0,0,0,.3);color:#fff">Abrir ${icon('chevRight', 12)}</a></div>`;
    el.querySelector('#hArt').innerHTML = p.cover ? '' : `<span class="glow"></span><span class="big">${icon(p.icon, 170)}</span>`;
    el.querySelectorAll('.hero2-dots button').forEach((b, k) => b.classList.toggle('on', k === idx));
    el.querySelector('#hTask').onclick = () => openTaskModal(null, { projectId: p.id }).then(() => render(el));
  };
  if (slides.length) {
    show(0);
    if (store.settings.heroAutoplay !== false && slides.length > 1) heroTimer = setInterval(() => show(idx + 1), 7000);
    el.querySelectorAll('.hero2-dots button').forEach((b) => b.addEventListener('click', () => { show(Number(b.dataset.i)); clearInterval(heroTimer); }));
  }
  return () => clearInterval(heroTimer);
}
