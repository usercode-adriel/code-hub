// Aba "Hoje": briefing automático, agenda, prioridades, detector de procrastinação, hábitos,
// pomodoro, caixa de entrada e encerramento do dia.
import { api, coll } from '../api.js';
import { store, on } from '../store.js';
import { icon } from '../icons.js';
import { esc, dmy, brl, toast, speak, todayISO, formModal, modal, confirmDialog, PRIORITY } from '../ui.js';
import { openTaskModal } from '../components.js';

const MOODS = [['otimo', '😄', 'Ótimo'], ['bem', '🙂', 'Bem'], ['neutro', '😐', 'Neutro'], ['cansado', '😮‍💨', 'Cansado'], ['mal', '😞', 'Mal']];
const KIND_ICO = { ideia: '💡', tarefa: '✅', nota: '📝', link: '🔗' };

// ---------- Pomodoro (continua contando mesmo se você trocar de aba) ----------
const POMO_KEY = 'codeniac.pomo';
const pomo = JSON.parse(localStorage.getItem(POMO_KEY) || 'null') || { endAt: null, left: null, total: null, area: 'foco' };
let pomoTick = null;
const savePomo = () => localStorage.setItem(POMO_KEY, JSON.stringify(pomo));
function pomoLeft() { return pomo.endAt ? Math.max(0, Math.round((pomo.endAt - Date.now()) / 1000)) : pomo.left ?? (store.settings.pomodoroMinutes || 25) * 60; }
function ensurePomoTick() {
  clearInterval(pomoTick);
  if (!pomo.endAt) return;
  pomoTick = setInterval(async () => {
    paintPomo();
    if (pomoLeft() > 0) return;
    clearInterval(pomoTick);
    const minutes = Math.round((pomo.total || 1500) / 60);
    pomo.endAt = null; pomo.left = null; savePomo(); paintPomo();
    toast('Pomodoro concluído! 🍅', `${minutes} min de ${pomo.area}. Faça uma pausa de 5 minutos.`, 'success');
    try { const c = new AudioContext(); const o = c.createOscillator(); o.connect(c.destination); o.frequency.value = 660; o.start(); o.stop(c.currentTime + 0.4); } catch { /* sem som */ }
    try { await coll('studyLog').add({ area: pomo.area, minutes, date: todayISO() }); } catch { /* ok */ }
  }, 1000);
}
function paintPomo() {
  const box = document.getElementById('pomo');
  if (!box) return;
  const left = pomoLeft();
  const total = pomo.total || (store.settings.pomodoroMinutes || 25) * 60;
  box.querySelector('.tm').textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
  box.querySelector('circle.fg').style.strokeDashoffset = String(339.3 * (1 - left / total));
  box.querySelector('#pStart').innerHTML = pomo.endAt ? `${icon('pause', 13)} Pausar` : `${icon('play', 13)} ${pomo.left ? 'Continuar' : 'Começar'}`;
}
ensurePomoTick();

async function draw(el) {
  const [b, agenda, inbox] = await Promise.all([api.get('/briefing'), coll('agenda').list(), coll('inbox').list()]);
  const s = store.settings;
  const now = new Date();
  const closeTime = s.dayCloseTime || '21:30';
  const late = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` >= closeTime;
  const upcoming = agenda.filter((a) => !a.done && a.date >= todayISO()).sort((x, y) => `${x.date}${x.time || ''}`.localeCompare(`${y.date}${y.time || ''}`)).slice(0, 8);
  const inboxOpen = inbox.filter((x) => !x.done);
  const banner = store.images?.hojeBanner;
  const week = [...Array(7)].map((_, i) => todayISO(i - 6));

  const chips = [
    b.overdue.length && `<a class="chip late" href="#/tasks?filter=late">${b.overdue.length} atrasada(s)</a>`,
    b.bills.length && `<a class="chip medium" href="#/financeiro">${b.bills.length} conta(s) a vencer</a>`,
    b.subs.length && `<a class="chip" href="#/financeiro">${b.subs.length} assinatura(s) cobrando</a>`,
    b.cardsDue && `<a class="chip" href="#/estudos">${b.cardsDue} cartão(ões) de inglês</a>`,
    b.services.length && `<a class="chip medium" href="#/garagem">${icon('wrench', 11)} ${b.services.length} manutenção(ões)</a>`,
    b.docs.length && `<a class="chip" href="#/garagem">${b.docs.length} documento(s) vencendo</a>`,
    b.decisionsToReview.length && `<a class="chip" href="#/decisoes/${b.decisionsToReview[0].id}">avaliar decisão</a>`,
    b.inboxCount && `<span class="chip">${b.inboxCount} na caixa de entrada</span>`,
  ].filter(Boolean).join('');

  el.innerHTML = `
    <section class="card today-hero">${banner ? `<div class="bgimg" style="background-image:url('${esc(banner)}')"></div>` : ''}
      <div class="grow"><h1>${esc(b.greeting)}! 👋</h1><p>${now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
      <button class="btn outline" id="listen">${icon('volume', 14)} Ouvir briefing</button>
      <button class="btn primary" id="cap">${icon('plus', 14)} Capturar</button>
    </section>
    <div class="cols-21">
      <div class="stack">
        <section class="card"><div class="section-head"><h3>${icon('sun', 14)} Briefing do dia</h3><small class="muted">gerado automaticamente${s.briefingEnabled ? ` · também chega como notificação às ${esc(s.briefingTime)}` : ''}</small></div>
          <p class="brief-text">${esc(b.text)}</p><div class="brief-chips">${chips}</div></section>
        <section class="card"><div class="section-head"><h3>${icon('calendar', 14)} Agenda</h3><button class="see-more" id="addAg">${icon('plus', 12)} Compromisso</button></div>
          <div class="list">${upcoming.map((a) => `<div class="row-item" data-ag="${a.id}"><button class="check" data-done aria-label="Concluir"></button><span class="pill-time">${a.date === todayISO() ? (a.time || 'hoje') : `${dmy(a.date).slice(0, 5)}${a.time ? ` ${a.time}` : ''}`}</span><div class="grow"><b>${esc(a.title)}</b>${a.place ? `<small>${esc(a.place)}</small>` : ''}</div><div class="acts"><button class="icon-btn sm ghost" data-edit>${icon('edit', 13)}</button></div></div>`).join('') || '<div class="empty-mini">Nada marcado. Use “Compromisso” ou /agenda no chat.</div>'}</div></section>
        <section class="card"><div class="section-head"><h3>${icon('target', 14)} Prioridades</h3><a class="see-more" href="#/tasks">Todas ${icon('chevRight', 12)}</a></div>
          <div class="list">${[...b.overdue, ...b.dueToday, ...b.priorities].filter((t, i, a) => a.findIndex((x) => x.id === t.id) === i).slice(0, 6).map((t) => `<div class="row-item" data-task="${t.id}"><button class="check" data-tdone aria-label="Concluir"></button><div class="grow"><b>${esc(t.title)}</b><small>${esc(t.project || '')}${t.dueDate ? ` · ${dmy(t.dueDate)}` : ''}</small></div>${t.dueDate && t.dueDate < todayISO() ? '<span class="chip late">atrasada</span>' : `<span class="chip ${t.priority}">${PRIORITY[t.priority]}</span>`}</div>`).join('') || '<div class="empty-mini">Nenhuma tarefa aberta. 🎉</div>'}</div></section>
        <section class="card" id="procCard"></section>
      </div>
      <div class="stack">
        <section class="card"><div class="section-head"><h3>${icon('flame', 14)} Hábitos</h3><button class="see-more" id="addHab">${icon('plus', 12)} Hábito</button></div>
          <div class="list" id="habits"></div></section>
        <section class="card pomo" id="pomo"><div class="section-head"><h3>${icon('clock', 14)} Pomodoro</h3><select class="input" id="pArea" style="height:28px;padding:0 8px;font-size:11px">${[['foco', 'Foco'], ['ingles', 'Inglês'], ['programacao', 'Programação'], ['livros', 'Leitura'], ['outro', 'Outro']].map(([k, l]) => `<option value="${k}" ${pomo.area === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="pomo-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="54" stroke="rgba(var(--tint),.1)" stroke-width="8" fill="none"/><circle class="fg" cx="60" cy="60" r="54" stroke="var(--accent)" stroke-width="8" fill="none" stroke-linecap="round" stroke-dasharray="339.3" style="transition:stroke-dashoffset 1s linear"/></svg><span class="tm">25:00</span></div>
          <div style="display:flex;gap:8px;justify-content:center"><button class="btn primary sm" id="pStart"></button><button class="btn outline sm" id="pReset">${icon('refresh', 13)} Zerar</button></div>
          <small class="muted" style="display:block;margin-top:8px">Cada ciclo concluído conta minutos de estudo.</small></section>
        <section class="card"><div class="section-head"><h3>${icon('inbox', 14)} Caixa de entrada</h3><small class="muted">${inboxOpen.length}</small></div>
          <form class="inbox-input" id="inboxForm"><input class="input" name="t" placeholder="Ideia, nota ou link..." autocomplete="off"><button class="btn primary sm" aria-label="Guardar">${icon('plus', 13)}</button></form>
          <div class="list">${inboxOpen.slice(0, 12).map((x) => `<div class="row-item" data-ib="${x.id}"><span class="kind-ico">${KIND_ICO[x.kind] || '💡'}</span><div class="grow"><b>${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.text)}</a>` : esc(x.text)}</b><small>${dmy(x.createdAt.slice(0, 10))}</small></div>
            <div class="acts"><button class="icon-btn sm ghost" data-totask title="Virar tarefa">${icon('tasks', 13)}</button><button class="icon-btn sm ghost" data-ibdone title="Feito / arquivar">${icon('check', 13)}</button><button class="icon-btn sm ghost" data-ibdel title="Excluir">${icon('trash', 13)}</button></div></div>`).join('') || '<div class="empty-mini">Vazia. Capture com Alt+N de qualquer tela.</div>'}</div></section>
        <section class="card" style="${late ? 'border-color:var(--accent)' : ''}"><div class="section-head"><h3>${icon('moon', 14)} Encerramento do dia</h3><small class="muted">a partir das ${esc(closeTime)}</small></div>
          <p class="muted" style="margin:0 0 10px;font-size:11.5px">3 perguntas rápidas: o que fiz, o que travou, como está a energia. Ajuda a planejar amanhã.</p>
          <button class="btn ${late ? 'primary' : 'outline'} sm" id="closeDay">${icon('moon', 13)} Encerrar o dia</button></section>
      </div>
    </div>`;

  // ---- ações ----
  el.querySelector('#listen').onclick = () => speak(b.text);
  el.querySelector('#cap').onclick = () => import('../app.js').then((m) => m.openCapture());
  const reload = () => draw(el);

  const agendaForm = (a = {}) => formModal({
    title: a.id ? 'Editar compromisso' : 'Novo compromisso',
    fields: [{ name: 'title', label: 'O quê', value: a.title || '', full: true }, { name: 'date', label: 'Data', type: 'date', value: a.date || todayISO() },
      { name: 'time', label: 'Horário', type: 'time', value: a.time || '' }, { name: 'place', label: 'Local', value: a.place || '', full: true }, { name: 'notes', label: 'Notas', type: 'textarea', value: a.notes || '', full: true, rows: 2 }],
    onSubmit: (d) => (a.id ? coll('agenda').update(a.id, d) : coll('agenda').add(d)),
    onDelete: a.id ? () => coll('agenda').remove(a.id) : null,
  }).then(reload);
  el.querySelector('#addAg').onclick = () => agendaForm();
  el.querySelectorAll('[data-ag]').forEach((row) => {
    const a = agenda.find((x) => x.id === row.dataset.ag);
    row.querySelector('[data-done]').onclick = async () => { await coll('agenda').update(a.id, { done: true }); toast('Compromisso concluído'); reload(); };
    row.querySelector('[data-edit]').onclick = () => agendaForm(a);
  });
  el.querySelectorAll('[data-task]').forEach((row) => {
    row.querySelector('[data-tdone]').onclick = async () => { await api.put(`/tasks/${row.dataset.task}`, { status: 'done' }); toast('Tarefa concluída', 'Mandou bem! ✅', 'success'); reload(); };
    row.querySelector('.grow').onclick = async () => { const t = (await api.get('/tasks')).find((x) => x.id === row.dataset.task); if (t) openTaskModal(t).then(reload); };
  });

  // ---- detector de procrastinação ----
  const proc = await api.get('/procrastination');
  el.querySelector('#procCard').innerHTML = `<div class="section-head"><h3>${icon('zap', 14)} Detector de procrastinação</h3><small class="muted">${proc.flagged.length} travada(s) de ${proc.openCount}</small></div>
    ${proc.tips.map((t) => `<div class="honest" style="margin-bottom:8px">${esc(t)}</div>`).join('')}
    <div class="list">${proc.flagged.slice(0, 5).map((t) => `<div class="row-item proc-item" data-p="${t.id}"><div class="grow"><b>${esc(t.title)}</b><small>${esc(t.reasons.join(' · '))}</small><small class="sug">💡 ${esc(t.suggestion)}</small></div>
      <div class="acts" style="opacity:1;flex-direction:column"><button class="btn sm primary" data-today>Fazer hoje</button><button class="btn sm outline" data-split>Quebrar</button></div></div>`).join('') || '<div class="empty-mini">Nada travado. Sua organização está em dia! 🙌</div>'}</div>`;
  el.querySelectorAll('[data-p]').forEach((row) => {
    const id = row.dataset.p;
    row.querySelector('[data-today]').onclick = async () => { await api.put(`/tasks/${id}`, { dueDate: todayISO(), status: 'doing' }); toast('Combinado!', 'A tarefa ficou para hoje e em andamento.', 'success'); reload(); };
    row.querySelector('[data-split]').onclick = () => {
      const t = proc.flagged.find((x) => x.id === id);
      const project = store.projects.find((p) => p.name === t.project);
      formModal({ title: `Quebrar "${t.title}"`, fields: [{ name: 'steps', label: 'Um passo por linha (o primeiro deve levar menos de 15 minutos)', type: 'textarea', rows: 5, full: true, value: '' }], submit: 'Criar passos',
        onSubmit: async (d) => {
          const steps = d.steps.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 10);
          if (!steps.length) throw new Error('Escreva ao menos um passo');
          for (const [i, st] of steps.entries()) await api.post('/tasks', { title: st, projectId: project?.id || store.projects[0].id, priority: t.priority, dueDate: i === 0 ? todayISO() : '' });
          toast('Passos criados', `${steps.length} tarefa(s) menores. O primeiro é para hoje.`, 'success');
        } }).then(reload);
    };
  });

  // ---- hábitos ----
  const habits = await coll('habits').list();
  const paintHabits = () => {
    el.querySelector('#habits').innerHTML = habits.map((h) => {
      const done = h.days.includes(todayISO());
      const st = b.habits.find((x) => x.id === h.id)?.streak ?? 0;
      return `<div class="habit-row" data-h="${h.id}"><span class="ic">${esc(h.icon || '⭐')}</span><span class="grow">${esc(h.name)}</span><span class="habit-week">${week.map((d) => `<i class="${h.days.includes(d) ? 'on' : ''}" title="${dmy(d)}"></i>`).join('')}</span><span class="streak">${st ? `🔥${st}` : ''}</span><button class="habit-check ${done ? 'on' : ''}" aria-label="Marcar">${done ? icon('check', 14) : ''}</button></div>`;
    }).join('') || '<div class="empty-mini">Crie um hábito para acompanhar sua sequência.</div>';
    el.querySelectorAll('[data-h]').forEach((row) => {
      const h = habits.find((x) => x.id === row.dataset.h);
      row.querySelector('.habit-check').onclick = async () => {
        const r = await api.post(`/habits/${h.id}/toggle`);
        Object.assign(h, r);
        const bh = b.habits.find((x) => x.id === h.id); if (bh) bh.streak = r.streak;
        if (r.days.includes(todayISO())) toast(`${h.icon || '⭐'} ${h.name}`, r.streak > 1 ? `Sequência de ${r.streak} dias!` : 'Feito hoje!', 'success');
        paintHabits();
      };
      row.querySelector('.grow').ondblclick = () => formModal({ title: 'Editar hábito', fields: [{ name: 'name', label: 'Nome', value: h.name }, { name: 'icon', label: 'Emoji', value: h.icon || '' }],
        onSubmit: (d) => coll('habits').update(h.id, d), onDelete: () => coll('habits').remove(h.id) }).then(reload);
    });
  };
  paintHabits();
  el.querySelector('#addHab').onclick = () => formModal({ title: 'Novo hábito', fields: [{ name: 'name', label: 'Nome', placeholder: 'Ex.: Beber 2L de água' }, { name: 'icon', label: 'Emoji', value: '⭐' }],
    onSubmit: (d) => coll('habits').add(d) }).then(reload);

  // ---- pomodoro ----
  paintPomo();
  el.querySelector('#pArea').onchange = (e) => { pomo.area = e.target.value; savePomo(); };
  el.querySelector('#pStart').onclick = () => {
    if (pomo.endAt) { pomo.left = pomoLeft(); pomo.endAt = null; clearInterval(pomoTick); }
    else { const left = pomoLeft(); pomo.total = pomo.total && pomo.left ? pomo.total : (s.pomodoroMinutes || 25) * 60; pomo.endAt = Date.now() + left * 1000; pomo.left = null; ensurePomoTick(); }
    savePomo(); paintPomo();
  };
  el.querySelector('#pReset').onclick = () => { pomo.endAt = null; pomo.left = null; pomo.total = null; clearInterval(pomoTick); savePomo(); paintPomo(); };

  // ---- caixa de entrada ----
  el.querySelector('#inboxForm').onsubmit = async (e) => {
    e.preventDefault();
    const t = e.target.t.value.trim();
    if (!t) return;
    await coll('inbox').add({ text: t });
    reload();
  };
  el.querySelectorAll('[data-ib]').forEach((row) => {
    const x = inbox.find((i) => i.id === row.dataset.ib);
    row.querySelector('[data-ibdone]').onclick = async () => { await coll('inbox').update(x.id, { done: true }); reload(); };
    row.querySelector('[data-ibdel]').onclick = async () => { if (await confirmDialog('Excluir captura', x.text.slice(0, 80))) { await coll('inbox').remove(x.id); reload(); } };
    row.querySelector('[data-totask]').onclick = async () => {
      const t = await openTaskModal(null, {});
      if (t) { await coll('inbox').update(x.id, { done: true }); reload(); }
    };
  });

  // ---- encerramento do dia ----
  el.querySelector('#closeDay').onclick = async () => {
    const list = await coll('dayClose').list();
    const cur = list.find((x) => x.date === todayISO()) || {};
    let energy = cur.energy || 3; let mood = cur.mood || 'bem';
    modal({
      title: 'Encerramento do dia 🌙',
      body: `<form class="form"><div class="field"><label>O que eu fiz hoje?</label><textarea name="did" rows="3">${esc(cur.did || '')}</textarea></div>
        <div class="field"><label>O que travou ou ficou pendente?</label><textarea name="blocked" rows="2">${esc(cur.blocked || '')}</textarea></div>
        <div class="field"><label>Energia</label><div class="energy" data-g="e">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-v="${n}" class="${n === energy ? 'on' : ''}">${['🪫', '😴', '🙂', '⚡', '🚀'][n - 1]}</button>`).join('')}</div></div>
        <div class="field"><label>Humor</label><div class="energy" data-g="m">${MOODS.map(([k, e, l]) => `<button type="button" data-v="${k}" title="${l}" class="${k === mood ? 'on' : ''}">${e}</button>`).join('')}</div></div>
        <div class="form-actions"><a class="btn outline" href="#/diario" data-close>Escrever no diário</a><button class="btn primary">Salvar</button></div></form>`,
      onMount: (m, close) => {
        m.querySelectorAll('[data-g] button').forEach((btn) => btn.addEventListener('click', () => {
          const g = btn.parentElement.dataset.g;
          btn.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === btn));
          if (g === 'e') energy = Number(btn.dataset.v); else mood = btn.dataset.v;
        }));
        m.querySelector('form').onsubmit = async (e) => {
          e.preventDefault();
          const body = { date: todayISO(), did: e.target.did.value, blocked: e.target.blocked.value, energy, mood };
          if (cur.id) await coll('dayClose').update(cur.id, body); else await coll('dayClose').add(body);
          close(); toast('Dia encerrado', 'Bom descanso! Amanhã o briefing te espera. 🌙', 'success');
        };
      },
    });
  };

}

export default async function render(el) {
  await draw(el);
  return on('data-changed', () => draw(el));
}
