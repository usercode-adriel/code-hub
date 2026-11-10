// Dashboard: banner em carrossel, foco do dia, prazos, novidades e grade de projetos.
import { api } from '../api.js';
import { store } from '../store.js';
import { icon } from '../icons.js';
import { esc, dmy, isLate, brl, PRIORITY } from '../ui.js';
import { projectCard, openTaskModal, openProjectModal, heroArt } from '../components.js';

const img = (slot) => store.images?.[slot];
const bg = (url) => (url ? `<div class="bg" style="background-image:url('${esc(url)}')"></div>` : '');

function heroTitle(name) {
  // troca o primeiro "o" pelo emblema, como no layout de referência
  const i = name.toLowerCase().indexOf('o');
  if (i < 0 || name.length > 14) return esc(name);
  return `${esc(name.slice(0, i))}<span class="hero-emblem">${icon('sparkles', 20)}</span>${esc(name.slice(i + 1))}`;
}

export default async function render(el) {
  const d = await api.get('/dashboard');
  const projects = d.projects;
  const slides = (projects.filter((p) => p.favorite).length ? projects.filter((p) => p.favorite) : projects).slice(0, 6);
  const first = (store.user.name || '').split(' ')[0];
  const taskRow = (t) => `<a class="lib-item" href="#/tasks?open=${t.id}"><span class="thumb" style="background:${esc(t.project.color || 'var(--accent)')}">${icon(t.project.icon || 'check', 15)}</span><span class="info"><b>${esc(t.title)}</b><small>${esc(t.project.name || '')}${t.dueDate ? ` · ${dmy(t.dueDate)}` : ''}</small></span>${isLate(t) ? '<span class="chip late">atrasada</span>' : `<span class="chip ${t.priority}">${PRIORITY[t.priority]}</span>`}</a>`;

  el.innerHTML = `
    ${store.settings.showHero !== false && slides.length ? `<section class="hero" id="hero"><div class="hero-cover" id="heroCover"></div><div class="hero-body" id="heroBody"></div><div id="heroArt"></div>
      <div class="hero-nav"><button class="icon-btn sm" id="hPrev" aria-label="Anterior">${icon('chevLeft', 14)}</button><button class="icon-btn sm" id="hNext" aria-label="Próximo">${icon('chevRight', 14)}</button></div>
      <div class="hero-dots">${slides.map((_, i) => `<button data-i="${i}" aria-label="Slide ${i + 1}"></button>`).join('')}</div></section>` : ''}
    <section class="dash-grid">
      <a class="poster" href="#/tasks" style="--c:#f5c518;--art:#f5c518">${bg(img('cardFocus'))}${img('cardFocus') ? '' : `<div class="art">${icon('target', 80)}</div>`}
        <div class="body" style="margin-top:auto"><span class="chip yellow">Foco do dia</span><h4 style="margin-top:8px">${d.focus.length ? esc(d.focus[0].title) : 'Nenhuma prioridade alta'}</h4>
          <small class="muted">${d.focus.length ? `${d.focus.length} tarefa(s) de prioridade alta` : 'Aproveite para adiantar algo importante.'}</small>
          <div class="foot"><span class="tag-row"><span>${icon('tasks', 12)} ${d.totals.open} abertas</span></span><span class="btn sm primary">Ver tarefas</span></div></div></a>
      <div class="dash-right">
        <div class="dash-pair">
          <a class="card news-card" href="#/hoje">${bg(img('cardForYou'))}<div class="txt"><h4>Para você, ${esc(first)}</h4><p>Veja o briefing do dia: agenda, contas, hábitos e o que está travado.</p><span class="btn sm outline">${icon('sun', 13)} Abrir Hoje</span></div><div class="vis"><span class="orb" style="width:80px;height:80px;border-radius:50%;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent)">${icon('sun', 34)}</span></div></a>
          <div class="card" style="position:relative;overflow:hidden">${bg(img('cardSoon'))}<div class="section-head" style="position:relative"><h3>Próximos prazos</h3><a class="see-more" href="#/tasks">Ver todos ${icon('chevRight', 12)}</a></div>
            <div class="list" style="position:relative">${d.upcoming.slice(0, 3).map(taskRow).join('') || '<div class="empty-mini">Sem prazos marcados.</div>'}</div></div>
        </div>
        <a class="card news-card" href="#/notifications">${bg(img('cardNews'))}<div class="txt"><span class="chip">${icon('rocket', 11)} Últimas atualizações</span><h4 style="margin-top:8px">${esc(d.latestUpdate?.title || `Codeniac ${store.version}`)}</h4><p>${esc(d.latestUpdate?.message || 'Hoje, Garagem, Financeiro, Estudos, Diário, Decisões, Atividade e 8 temas novos.')}</p><span class="btn sm outline">Ver novidades</span></div><div class="vis"><span class="version-art">${esc(store.version)}</span></div></a>
      </div>
    </section>
    <section class="stats">
      <a class="card stat" href="#/tasks"><span class="s-ico">${icon('tasks', 18)}</span><div><b>${d.totals.open}</b><span>Tarefas abertas</span></div></a>
      <a class="card stat" href="#/tasks?filter=late"><span class="s-ico" style="background:rgba(239,68,68,.14);color:#ff8a8a">${icon('clock', 18)}</span><div><b>${d.totals.overdue}</b><span>Atrasadas</span></div></a>
      <a class="card stat" href="#/financeiro"><span class="s-ico" style="background:rgba(34,197,94,.14);color:var(--ok)">${icon('wallet', 18)}</span><div><b style="font-size:16px">${brl(d.financeMonth.in - d.financeMonth.out)}</b><span>Saldo InDrive no mês</span></div></a>
      <a class="card stat" href="#/achievements"><span class="s-ico" style="background:rgba(245,197,24,.14);color:#f5c518">${icon('note', 18)}</span><div><b>${d.pagesCount}</b><span>Páginas criadas</span></div></a>
    </section>
    <div class="section-head"><h3>Seus projetos</h3><button class="see-more" id="newP">${icon('plus', 12)} Novo projeto</button></div>
    <section class="projects-grid">${projects.map(projectCard).join('')}<button class="project-card new-project" id="newP2">${icon('plus', 26)}<b>Novo projeto</b><small>Crie um espaço para qualquer área</small></button></section>`;

  el.querySelector('#newP').onclick = el.querySelector('#newP2').onclick = () => openProjectModal().then((p) => { if (p) location.hash = `#/project/${p.slug}`; });

  // carrossel
  let idx = 0;
  let timer = null;
  const show = (i) => {
    if (!slides.length || !el.querySelector('#hero')) return;
    idx = (i + slides.length) % slides.length;
    const p = slides[idx];
    const cover = p.cover || img('heroDefault');
    el.querySelector('#heroCover').style.backgroundImage = cover ? `url('${cover}')` : '';
    el.querySelector('#hero').classList.toggle('has-cover', Boolean(cover));
    el.querySelector('#heroBody').innerHTML = `<h1 class="hero-title">${heroTitle(p.name)}</h1><p class="hero-sub">${esc(p.tagline || 'Projeto')}</p><p class="hero-desc">${esc(p.description || '')}</p>
      <div class="hero-actions"><span class="price">${p.pages || 0} página(s)</span><a class="btn primary" href="#/project/${esc(p.slug)}">Abrir projeto <span class="circle">${icon('chevRight', 11)}</span></a><button class="btn" id="hTask" style="background:none">${icon('plus', 13)} Tarefa</button></div>`;
    el.querySelector('#heroArt').innerHTML = cover ? '' : heroArt(p.icon, p.color);
    el.querySelectorAll('.hero-dots button').forEach((b, k) => b.classList.toggle('on', k === idx));
    el.querySelector('#hTask').onclick = () => openTaskModal(null, { projectId: p.id });
  };
  const restart = () => { clearInterval(timer); if (store.settings.heroAutoplay !== false && slides.length > 1) timer = setInterval(() => show(idx + 1), 7000); };
  if (el.querySelector('#hero')) {
    show(0); restart();
    el.querySelector('#hPrev').onclick = () => { show(idx - 1); restart(); };
    el.querySelector('#hNext').onclick = () => { show(idx + 1); restart(); };
    el.querySelectorAll('.hero-dots button').forEach((b) => b.addEventListener('click', () => { show(Number(b.dataset.i)); restart(); }));
  }
  return () => clearInterval(timer);
}
