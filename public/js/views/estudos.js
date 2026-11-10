// Estudos: Inglês (flashcards com repetição espaçada, connected speech, shadowing, pares mínimos,
// ditado, frases para passageiros, diário em inglês), Programação (snippets e trilha) e Livros (estante).
import { api, coll } from '../api.js';
import { store, on } from '../store.js';
import { icon } from '../icons.js';
import { esc, dmy, toast, todayISO, formModal, speak } from '../ui.js';
import { kpi } from '../components.js';

let keyHandler = null;
const say = (t, rate = 0.95) => speak(t, 'en-US', rate);
const sayBtns = (t) => `<button class="icon-btn sm ghost" data-say="${esc(t)}" title="Ouvir">${icon('volume', 13)}</button><button class="icon-btn sm ghost" data-slow="${esc(t)}" title="Ouvir devagar">🐢</button>`;

const LESSONS = [
  { t: 'Linking — consoante + vogal', tag: 'ligação', p: 'Quando uma palavra termina em consoante e a próxima começa com vogal, a consoante “pula” para a palavra seguinte. Não pare entre elas.',
    ex: [['Turn it off', 'tur-ni-toff'], ['Pick it up', 'pi-ki-tup'], ['Get in the car', 'ge-tin the car'], ['Where are you going?', 'whe-rar you going'], ['Hold on a second', 'hol-do-na second']] },
  { t: 'Flap T — o T que vira “r” rápido', tag: 'americano', p: 'No inglês americano, o T entre vogais (ou depois de R) soa como um “r” brando do português (como em “caro”).',
    ex: [['Water', 'wa-rer'], ['Better', 'be-rer'], ['A lot of traffic', 'a-la-ra traffic'], ['Get out', 'ge-rout'], ['What is it?', 'wha-ri-zit']] },
  { t: 'Reductions — gonna, wanna, gotta', tag: 'redução', p: 'Combinações muito comuns são encurtadas na fala natural. Entender isso destrava o listening.',
    ex: [['I am going to drive', "I'm gonna drive"], ['Do you want to stop here?', 'd’ya wanna stop here'], ['I have got to go', 'I gotta go'], ['Let me check', 'lemme check'], ['Give me a minute', 'gimme a minute']] },
  { t: 'Assimilation — sons que se fundem', tag: 'fusão', p: 'D + Y vira “dj”, T + Y vira “tch”. Acontece em perguntas o tempo todo.',
    ex: [['Did you see it?', 'didja see it'], ['Would you like some water?', 'wudja like some wa-rer'], ['Nice to meet you', 'nice to mee-tchu'], ['What do you need?', 'whaddaya need'], ['Got you', 'gotcha']] },
  { t: 'Weak forms — palavras que “somem”', tag: 'átonas', p: 'Palavras de função (to, for, of, and, can, a) ficam fracas, com som de “â” neutro (schwa). A força vai para as palavras de conteúdo.',
    ex: [['A cup of coffee', 'a cup-a coffee'], ['Rock and roll', 'rock-n-roll'], ['I can help you', 'I c’n help you'], ['Going to the airport', 'going t’the airport'], ['For sure', 'f’sure']] },
  { t: 'Elision — sons que desaparecem', tag: 'elisão', p: 'Entre consoantes, T e D muitas vezes nem são pronunciados.',
    ex: [['Next stop', 'nex stop'], ['Last night', 'las night'], ['I don’t know', 'I dunno'], ['Must be', 'mus be'], ['Old man', 'ol man']] },
  { t: 'Intrusion — sons que aparecem', tag: 'intrusão', p: 'Entre duas vogais, surge um /w/ ou /j/ para ligar as palavras sem pausa.',
    ex: [['Go on', 'go-won'], ['Do it', 'do-wit'], ['I am', 'I-yam'], ['The end', 'the-yend'], ['Two eggs', 'two-weggs']] },
];

const SHADOW = [
  { t: 'Recebendo o passageiro', lvl: 'A2', text: 'Hi, are you Michael? Great, hop in. Is the address on the app correct? Perfect. Feel free to adjust the air conditioning if you want.' },
  { t: 'Conversa leve no trânsito', lvl: 'B1', text: 'Traffic is a little heavy right now, but we should get there in about fifteen minutes. Are you visiting the city or do you live here?' },
  { t: 'Falando de você', lvl: 'B1', text: 'I work as a driver, and I am also studying programming. My goal is to work with technology in the next couple of years.' },
  { t: 'Rotina de estudo', lvl: 'B1', text: 'Every morning I review my flashcards, and at night I watch a short video with subtitles. It is slow, but I can see my progress.' },
  { t: 'Explicando um problema', lvl: 'B2', text: 'Sorry about the delay. There was an accident on the main avenue, so I had to take a detour. It should not affect the price of the ride.' },
];

const PAIRS = [['ship', 'sheep'], ['live', 'leave'], ['full', 'fool'], ['cat', 'cut'], ['think', 'sink'], ['very', 'berry'], ['bad', 'bed'], ['work', 'walk'], ['three', 'tree'], ['hat', 'hot']];
const PROMPTS = ['What did you do today?', 'Describe your favorite place in your city.', 'What is one goal for this month?', 'Tell a funny story from a ride.', 'What are you learning right now?', 'Describe your dream job.', 'What would you do with a free day?'];

function wordsScore(target, heard) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(Boolean);
  const a = norm(target); const b = new Set(norm(heard));
  const hit = a.filter((w) => b.has(w)).length;
  return { pct: a.length ? Math.round((hit / a.length) * 100) : 0, missed: a.filter((w) => !b.has(w)) };
}

function listenSpeech(btn, onText) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('Microfone indisponível', 'Use o Chrome ou o Edge para testar a pronúncia.', 'error'); return; }
  const rec = new SR(); rec.lang = 'en-US';
  btn.classList.add('listening');
  rec.onresult = (e) => onText(e.results[0][0].transcript);
  rec.onerror = () => toast('Não ouvi nada', 'Verifique a permissão do microfone.', 'error');
  rec.onend = () => btn.classList.remove('listening');
  rec.start();
}

// ---------------- Inglês ----------------
async function english(el) {
  const [cards, log, journal] = await Promise.all([coll('cards').list(), coll('studyLog').list(), coll('enJournal').list()]);
  const today = todayISO();
  const due = cards.filter((c) => c.due <= today).sort((a, b) => a.due.localeCompare(b.due));
  const goal = store.settings.englishDailyGoal || 20;
  const reviewedToday = cards.filter((c) => c.lastReview && c.lastReview.slice(0, 10) === today).length;
  const session = due.slice(0, Math.max(0, goal - reviewedToday) || due.length);
  const decks = {};
  for (const c of cards) decks[c.deck || 'Geral'] = (decks[c.deck || 'Geral'] || 0) + 1;
  const weekMin = log.filter((l) => l.area === 'ingles' && l.date >= todayISO(-6)).reduce((a, l) => a + l.minutes, 0);
  const prompt = PROMPTS[new Date().getDate() % PROMPTS.length];
  const todayJ = journal.find((j) => j.date === today);
  const learned = cards.filter((c) => c.interval >= 21).length;

  el.innerHTML = `
    <section class="kpi-row">${kpi('Para revisar hoje', String(due.length), `meta diária: ${goal}`)}${kpi('Revisados hoje', String(reviewedToday))}${kpi('Cartões', String(cards.length), `${learned} já memorizados (21+ dias)`)}${kpi('Inglês na semana', `${weekMin} min`, 'pomodoros de inglês somam aqui')}</section>
    <div class="flash-wrap">
      <section class="card"><div class="section-head"><h3>${icon('layers', 14)} Revisão espaçada</h3><small class="muted" id="left"></small></div><div id="flash"></div></section>
      <section class="card"><div class="section-head"><h3>${icon('plus', 14)} Novo cartão</h3><button class="see-more" id="bulk">${icon('upload', 12)} Vários de uma vez</button></div>
        <form class="form" id="newCard"><div class="field"><label>Inglês</label><input name="front" placeholder="Could you drop me off here?"></div><div class="field"><label>Português</label><input name="back" placeholder="Você pode me deixar aqui?"></div>
          <div class="field"><label>Exemplo (opcional)</label><input name="example"></div><div class="form-row"><div class="field"><label>Baralho</label><input name="deck" value="Vocabulário" list="decks"><datalist id="decks">${Object.keys(decks).map((d) => `<option value="${esc(d)}">`).join('')}</datalist></div><div class="field" style="justify-content:flex-end"><button class="btn primary">Adicionar</button></div></div></form>
        <small class="muted" style="display:block;margin-top:8px">💡 Dica: selecione qualquer palavra em inglês no sistema e clique em “+ Vocabulário”.</small>
        <div class="tag-row" style="margin-top:10px">${Object.entries(decks).map(([d, n]) => `<span class="chip">${esc(d)} · ${n}</span>`).join('')}</div></section>
    </div>
    <div class="cols-2" style="margin-top:var(--gap)">
      <section class="card"><div class="section-head"><h3>${icon('volume', 14)} Connected speech</h3><small class="muted">como os nativos realmente falam</small></div>
        ${LESSONS.map((l, i) => `<details class="lesson" ${i === 0 ? 'open' : ''}><summary>${esc(l.t)}<span class="chip">${esc(l.tag)}</span></summary><div class="in"><p style="margin:0 0 6px">${esc(l.p)}</p>
          ${l.ex.map(([a, b]) => `<div class="ex"><div class="grow"><div class="say">${esc(a)}</div><div class="sounds">/${esc(b)}/</div></div>${sayBtns(a)}<button class="icon-btn sm ghost" data-try="${esc(a)}" title="Testar minha pronúncia">${icon('mic', 13)}</button></div>`).join('')}</div></details>`).join('')}</section>
      <div class="stack">
        <section class="card"><div class="section-head"><h3>${icon('mic', 14)} Shadowing</h3><small class="muted">ouça, repita junto, grave</small></div>
          <p class="muted" style="font-size:11.5px;margin:0 0 10px">1) Ouça devagar · 2) Ouça normal acompanhando o texto · 3) Fale <b>junto</b> com o áudio · 4) Clique no microfone e leia: o Codeniac mostra as palavras que não reconheceu.</p>
          ${SHADOW.map((s) => `<details class="lesson"><summary>${esc(s.t)}<span class="chip">${s.lvl}</span></summary><div class="in"><p style="margin:0 0 8px;color:var(--text)">${esc(s.text)}</p><div style="display:flex;gap:6px;align-items:center">${sayBtns(s.text)}<button class="btn sm outline" data-try="${esc(s.text)}">${icon('mic', 12)} Ler em voz alta</button></div><div class="calc-out" data-res hidden></div></div></details>`).join('')}</section>
        <section class="card"><div class="section-head"><h3>${icon('columns', 14)} Pares mínimos</h3><small class="muted">treine o ouvido</small></div>
          <div class="list" id="pairs">${PAIRS.map(([a, b]) => `<div class="row-item"><div class="grow"><b>${a} × ${b}</b></div>${sayBtns(a)}${sayBtns(b)}</div>`).join('')}</div>
          <button class="btn sm primary" id="quiz" style="margin-top:10px">${icon('play', 12)} Quiz: qual palavra eu falei?</button><div class="calc-out" id="quizOut" hidden></div></section>
        <section class="card"><div class="section-head"><h3>${icon('pen', 14)} Ditado</h3></div>
          <p class="muted" style="font-size:11.5px;margin:0 0 8px">Ouça uma frase dos seus cartões e escreva o que entendeu.</p>
          <div style="display:flex;gap:8px"><button class="btn sm outline" id="dPlay">${icon('volume', 12)} Tocar frase</button><input class="input" id="dIn" placeholder="Escreva aqui..." style="flex:1"><button class="btn sm primary" id="dCheck">Conferir</button></div><div class="calc-out" id="dOut" hidden></div></section>
      </div>
    </div>
    <section class="card" style="margin-top:var(--gap)"><div class="section-head"><h3>${icon('feather', 14)} Diário em inglês</h3><small class="muted">Today's prompt: <b>${esc(prompt)}</b></small></div>
      <textarea class="input" id="enJ" rows="5" style="width:100%;resize:vertical" placeholder="Write 3 to 5 sentences. Don't worry about mistakes.">${esc(todayJ?.text || '')}</textarea>
      <div style="display:flex;gap:8px;align-items:center;margin-top:8px"><button class="btn sm primary" id="enSave">Salvar</button><button class="btn sm outline" id="enRead">${icon('volume', 12)} Ler para mim</button><small class="muted" id="enInfo">${journal.length} entrada(s) · selecione uma palavra para virar cartão</small></div>
      ${journal.filter((j) => j.date !== today).slice(0, 3).map((j) => `<div class="row-item" style="margin-top:8px"><div class="grow"><small>${dmy(j.date)}</small><div style="white-space:pre-wrap">${esc(j.text.slice(0, 400))}</div></div></div>`).join('')}</section>`;

  const reload = () => english(el);
  // ---- sessão de flashcards ----
  let i = 0;
  const flash = el.querySelector('#flash');
  const paint = () => {
    el.querySelector('#left').textContent = session.length ? `${Math.min(i + 1, session.length)} de ${session.length}` : '';
    if (i >= session.length) {
      flash.innerHTML = `<div class="empty-state"><div class="e-ico">${icon('trophy', 22)}</div><b>${session.length ? 'Sessão concluída! 🎉' : 'Nada para revisar agora'}</b><p>${due.length > session.length ? `Ainda há ${due.length - session.length} cartão(ões) além da meta. ` : ''}Volte amanhã: cartões que você acerta aparecem com intervalos cada vez maiores.</p>${due.length > session.length ? '<button class="btn sm outline" id="more">Revisar mais</button>' : ''}</div>`;
      el.querySelector('#more')?.addEventListener('click', () => { session.push(...due.slice(session.length)); paint(); });
      return;
    }
    const c = session[i];
    flash.innerHTML = `<div class="flashcard" id="fc" tabindex="0"><div class="inner"><div class="face"><span class="flash-deck">${esc(c.deck || 'Geral')}</span><div>${esc(c.front)}<small>clique ou espaço para virar</small></div></div>
      <div class="face back"><div>${esc(c.back || '—')}${c.example ? `<small>“${esc(c.example)}”</small>` : ''}</div></div></div></div>
      <div style="display:flex;justify-content:center;gap:6px;margin-top:10px">${sayBtns(c.front)}<button class="icon-btn sm ghost" id="fcEdit" title="Editar">${icon('edit', 13)}</button></div>
      <div class="grade-row" id="grades" hidden><button class="btn g0" data-g="0">Errei<small style="opacity:.7">&nbsp;1</small></button><button class="btn g1" data-g="1">Difícil<small style="opacity:.7">&nbsp;2</small></button><button class="btn g2" data-g="2">Bom<small style="opacity:.7">&nbsp;3</small></button><button class="btn g3" data-g="3">Fácil<small style="opacity:.7">&nbsp;4</small></button></div>`;
    const fc = flash.querySelector('#fc');
    const flip = () => { fc.classList.toggle('flipped'); flash.querySelector('#grades').hidden = false; if (fc.classList.contains('flipped')) say(c.front); };
    fc.onclick = flip;
    flash.querySelector('#fcEdit').onclick = () => formModal({ title: 'Editar cartão', fields: [{ name: 'front', label: 'Inglês', value: c.front, full: true }, { name: 'back', label: 'Português', value: c.back, full: true }, { name: 'example', label: 'Exemplo', value: c.example || '', full: true }, { name: 'deck', label: 'Baralho', value: c.deck || '' }],
      onSubmit: async (d) => Object.assign(c, await coll('cards').update(c.id, d)), onDelete: async () => { await coll('cards').remove(c.id); session.splice(i, 1); } }).then(paint);
    flash.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => grade(Number(b.dataset.g))));
    bindSay(flash);
  };
  const grade = async (g) => {
    const c = session[i];
    const r = await api.post(`/cards/${c.id}/review`, { grade: g });
    if (g === 0) session.push(r); // volta para o fim da sessão
    i++; paint();
  };
  const onKey = (e) => {
    if (!document.body.contains(flash) || e.target.closest('input, textarea')) return;
    if (e.code === 'Space' && flash.querySelector('#fc')) { e.preventDefault(); flash.querySelector('#fc').click(); }
    if (['1', '2', '3', '4'].includes(e.key) && !flash.querySelector('#grades')?.hidden) grade(Number(e.key) - 1);
  };
  if (keyHandler) document.removeEventListener('keydown', keyHandler);
  keyHandler = onKey;
  document.addEventListener('keydown', onKey);
  paint();

  el.querySelector('#newCard').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    if (!f.front.value.trim()) return;
    await coll('cards').add({ front: f.front.value, back: f.back.value, example: f.example.value, deck: f.deck.value });
    toast('Cartão criado', f.front.value, 'success');
    f.front.value = ''; f.back.value = ''; f.example.value = ''; f.front.focus();
  };
  el.querySelector('#bulk').onclick = () => formModal({ title: 'Adicionar vários cartões', fields: [{ name: 'lines', label: 'Um por linha:  inglês ; português ; exemplo (opcional)', type: 'textarea', rows: 10, full: true, value: '' }, { name: 'deck', label: 'Baralho', value: 'Vocabulário' }], submit: 'Importar',
    onSubmit: async (d) => {
      const list = d.lines.split('\n').map((l) => l.split(/\s*[;|\t]\s*/)).filter((p) => p[0]?.trim()).map(([front, back = '', example = '']) => ({ front, back, example, deck: d.deck }));
      const r = await api.post('/cards/bulk', { cards: list });
      toast('Cartões importados', `${r.added} novo(s) (repetidos são ignorados).`, 'success');
    } }).then(reload);

  bindSay(el);
  // pronúncia
  el.querySelectorAll('[data-try]').forEach((b) => b.addEventListener('click', () => listenSpeech(b, (heard) => {
    const r = wordsScore(b.dataset.try, heard);
    const box = b.closest('.in')?.querySelector('[data-res]');
    const msg = `Ouvi: “${esc(heard)}” — <b class="${r.pct >= 80 ? 'good' : 'bad'}">${r.pct}% das palavras</b>${r.missed.length ? `<br>Treine: ${r.missed.slice(0, 8).map(esc).join(', ')}` : ' 👏'}`;
    if (box) { box.hidden = false; box.innerHTML = msg; } else toast(`${r.pct}% reconhecido`, `Ouvi: "${heard}"`, r.pct >= 80 ? 'success' : 'info');
  })));
  // quiz de pares mínimos
  el.querySelector('#quiz').onclick = () => {
    const [a, b] = PAIRS[Math.floor(Math.random() * PAIRS.length)];
    const right = Math.random() < 0.5 ? a : b;
    const out = el.querySelector('#quizOut');
    out.hidden = false;
    out.innerHTML = `Ouça e escolha: <button class="btn sm outline" data-ans="${a}">${a}</button> <button class="btn sm outline" data-ans="${b}">${b}</button> <button class="icon-btn sm ghost" id="again">${icon('refresh', 12)}</button>`;
    say(right, 0.85);
    out.querySelector('#again').onclick = () => say(right, 0.85);
    out.querySelectorAll('[data-ans]').forEach((x) => x.addEventListener('click', () => { out.innerHTML = x.dataset.ans === right ? `<b class="good">Acertou!</b> Era “${right}”.` : `<b class="bad">Quase.</b> Era “${right}”. Ouça os dois de novo acima.`; }));
  };
  // ditado
  let dict = null;
  const pool = cards.filter((c) => c.front.split(' ').length >= 3);
  el.querySelector('#dPlay').onclick = () => {
    dict = dict || (pool.length ? pool[Math.floor(Math.random() * pool.length)].front : SHADOW[0].text.split('. ')[0]);
    say(dict, 0.85);
  };
  el.querySelector('#dCheck').onclick = () => {
    if (!dict) return toast('Toque a frase primeiro');
    const r = wordsScore(dict, el.querySelector('#dIn').value);
    const out = el.querySelector('#dOut');
    out.hidden = false;
    out.innerHTML = `Frase: <b>${esc(dict)}</b><br><b class="${r.pct >= 80 ? 'good' : 'bad'}">${r.pct}%</b> das palavras${r.missed.length ? ` · faltou: ${r.missed.map(esc).join(', ')}` : ' — perfeito!'}`;
    dict = null; el.querySelector('#dIn').value = '';
  };
  // diário em inglês
  el.querySelector('#enSave').onclick = async () => {
    const text = el.querySelector('#enJ').value.trim();
    if (!text) return;
    if (todayJ) await coll('enJournal').update(todayJ.id, { text }); else await coll('enJournal').add({ date: today, text });
    toast('Saved!', 'Diário em inglês salvo.', 'success');
  };
  el.querySelector('#enRead').onclick = () => say(el.querySelector('#enJ').value, 0.95);
  return () => document.removeEventListener('keydown', onKey);
}

function bindSay(root) {
  root.querySelectorAll('[data-say]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); say(b.dataset.say); }; });
  root.querySelectorAll('[data-slow]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); say(b.dataset.slow, 0.6); }; });
}

// ---------------- Programação ----------------
async function programming(el) {
  const [snips, trail] = await Promise.all([coll('snippets').list(), coll('trail').list()]);
  trail.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt.localeCompare(b.createdAt));
  const doneN = trail.filter((t) => t.done).length;
  const areas = [...new Set(trail.map((t) => t.area || 'Geral'))];
  el.innerHTML = `
    <div class="cols-21">
      <section class="card"><div class="section-head"><h3>${icon('code', 14)} Snippets</h3><div style="display:flex;gap:8px"><input class="input" id="sq" placeholder="Buscar por título, linguagem ou tag" style="height:30px"><button class="btn sm primary" id="addS">${icon('plus', 12)} Snippet</button></div></div>
        <div class="cols-2" id="snips">${snips.map((s) => `<div class="card snip" data-s="${s.id}" data-q="${esc(`${s.title} ${s.lang} ${(s.tags || []).join(' ')}`.toLowerCase())}" style="background:var(--bg-card-2)"><div style="display:flex;align-items:center;gap:8px"><b style="flex:1">${esc(s.title)}</b><span class="chip">${esc(s.lang || 'texto')}</span><button class="icon-btn sm ghost" data-copy title="Copiar">${icon('layers', 13)}</button><button class="icon-btn sm ghost" data-edit>${icon('edit', 13)}</button></div><pre>${esc(s.code)}</pre>${(s.tags || []).length ? `<div class="tag-row">${s.tags.map((t) => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}${s.notes ? `<small class="muted">${esc(s.notes)}</small>` : ''}</div>`).join('') || '<div class="empty-mini" style="grid-column:1/-1">Guarde comandos, consultas SQL e trechos que você sempre procura no Google.</div>'}</div></section>
      <section class="card"><div class="section-head"><h3>${icon('flag', 14)} Trilha de estudos</h3><button class="see-more" id="addT">${icon('plus', 12)} Etapa</button></div>
        <div class="progress" style="height:8px;margin-bottom:6px"><span style="width:${trail.length ? (doneN / trail.length) * 100 : 0}%"></span></div><small class="muted">${doneN} de ${trail.length} etapa(s) concluída(s)</small>
        ${areas.map((a) => `<div class="feed-day">${esc(a)}</div><div class="list">${trail.filter((t) => (t.area || 'Geral') === a).map((t) => `<div class="row-item" data-t="${t.id}"><button class="check ${t.done ? 'on' : ''}" data-tg>${t.done ? icon('check', 11) : ''}</button><div class="grow"><b style="${t.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(t.title)}</b>${t.notes ? `<small>${esc(t.notes)}</small>` : ''}</div><div class="acts"><button class="icon-btn sm ghost" data-edit>${icon('edit', 13)}</button></div></div>`).join('')}</div>`).join('') || '<div class="empty-mini" style="margin-top:10px">Monte sua trilha: lógica → Git → HTML/CSS → JavaScript → SQL → Node...</div>'}
        ${trail.length ? '' : '<button class="btn sm outline" id="seedT" style="margin-top:10px">Usar trilha sugerida</button>'}</section>
    </div>`;
  const reload = () => programming(el);
  const snipForm = (s = {}) => formModal({ title: s.id ? 'Editar snippet' : 'Novo snippet', wide: true, fields: [
    { name: 'title', label: 'Título', value: s.title || '' }, { name: 'lang', label: 'Linguagem', value: s.lang || '', placeholder: 'js, sql, bash...' },
    { name: 'code', label: 'Código', type: 'textarea', rows: 10, full: true, value: s.code || '' }, { name: 'tags', label: 'Tags (separadas por vírgula)', value: (s.tags || []).join(', ') }, { name: 'notes', label: 'Notas', value: s.notes || '' }],
  onSubmit: (d) => { d.tags = d.tags.split(',').map((x) => x.trim()).filter(Boolean); return s.id ? coll('snippets').update(s.id, d) : coll('snippets').add(d); }, onDelete: s.id ? () => coll('snippets').remove(s.id) : null }).then(reload);
  el.querySelector('#addS').onclick = () => snipForm();
  el.querySelector('#sq').oninput = (e) => { const q = e.target.value.toLowerCase(); el.querySelectorAll('[data-s]').forEach((x) => { x.hidden = q && !x.dataset.q.includes(q); }); };
  el.querySelectorAll('[data-s]').forEach((card) => {
    const s = snips.find((x) => x.id === card.dataset.s);
    card.querySelector('[data-edit]').onclick = () => snipForm(s);
    card.querySelector('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText(s.code); toast('Copiado!'); } catch { toast('Não foi possível copiar', '', 'error'); } };
  });
  const trailForm = (t = {}) => formModal({ title: t.id ? 'Editar etapa' : 'Nova etapa', fields: [{ name: 'title', label: 'Etapa', value: t.title || '', full: true }, { name: 'area', label: 'Área', value: t.area || 'Fundamentos' }, { name: 'order', label: 'Ordem', value: t.order ?? trail.length, inputmode: 'numeric' }, { name: 'notes', label: 'Notas / links', value: t.notes || '', full: true }],
    onSubmit: (d) => (t.id ? coll('trail').update(t.id, d) : coll('trail').add(d)), onDelete: t.id ? () => coll('trail').remove(t.id) : null }).then(reload);
  el.querySelector('#addT').onclick = () => trailForm();
  el.querySelectorAll('[data-t]').forEach((row) => {
    const t = trail.find((x) => x.id === row.dataset.t);
    row.querySelector('[data-tg]').onclick = async () => { await coll('trail').update(t.id, { done: !t.done }); reload(); };
    row.querySelector('[data-edit]').onclick = () => trailForm(t);
  });
  el.querySelector('#seedT')?.addEventListener('click', async () => {
    const steps = [['Lógica de programação', 'Fundamentos'], ['Git e GitHub', 'Fundamentos'], ['Terminal básico', 'Fundamentos'], ['HTML e CSS', 'Front-end'], ['JavaScript moderno', 'Front-end'], ['DOM e eventos', 'Front-end'],
      ['SQL: SELECT, JOIN, GROUP BY', 'Dados'], ['Modelagem de banco', 'Dados'], ['Node.js e Express', 'Back-end'], ['APIs REST', 'Back-end'], ['Projeto de portfólio', 'Carreira'], ['Currículo e LinkedIn em inglês', 'Carreira']];
    for (const [i, [title, area]] of steps.entries()) await coll('trail').add({ title, area, order: i });
    reload();
  });
}

// ---------------- Livros ----------------
const BOOK_COLORS = ['#8b2e1f', '#2c4a6b', '#3f6b2c', '#6b4c2c', '#5b2c6b', '#1f6b66', '#7a5a12', '#334155'];
const colorOf = (t) => BOOK_COLORS[[...t].reduce((a, c) => a + c.charCodeAt(0), 0) % BOOK_COLORS.length];
async function books(el) {
  const list = await coll('books').list();
  const year = todayISO().slice(0, 4);
  const readYear = list.filter((b) => b.status === 'lido' && (b.finishedAt || '').startsWith(year)).length;
  const goal = store.settings.readingYearGoal || 12;
  const groups = [['lendo', 'Lendo agora'], ['quero', 'Quero ler'], ['lido', 'Lidos']];
  const quotes = list.flatMap((b) => (b.quotes || []).map((q) => ({ ...q, book: b.title })));
  const q = quotes.length ? quotes[new Date().getDate() % quotes.length] : null;
  el.innerHTML = `
    <section class="kpi-row">${kpi(`Meta de ${year}`, `${readYear} / ${goal}`, `<span class="progress" style="display:block;margin-top:6px"><span style="width:${Math.min(100, (readYear / goal) * 100)}%"></span></span>`)}${kpi('Lendo agora', String(list.filter((b) => b.status === 'lendo').length))}${kpi('Na fila', String(list.filter((b) => b.status === 'quero').length))}${kpi('Citações salvas', String(quotes.length))}</section>
    ${q ? `<section class="card" style="margin-bottom:var(--gap)"><div class="brief-text" style="font-size:15px">“${esc(q.text)}”</div><small class="muted">— ${esc(q.book)}${q.page ? `, p. ${q.page}` : ''}</small></section>` : ''}
    <div class="section-head"><h3>${icon('book', 14)} Estante</h3><button class="btn sm primary" id="addB">${icon('plus', 12)} Livro</button></div>
    ${groups.map(([k, l]) => { const items = list.filter((b) => (b.status || 'quero') === k); return items.length ? `<div class="feed-day">${l} · ${items.length}</div><div class="shelf">${items.map((b) => `<div class="book" data-b="${b.id}" style="--c:${colorOf(b.title)};cursor:pointer"><b>${esc(b.title)}</b><small>${esc(b.author || '')}</small><div class="bottom">${b.pages ? `<div class="progress"><span style="width:${Math.min(100, ((b.current || 0) / b.pages) * 100)}%"></span></div><small>${b.current || 0} de ${b.pages} páginas</small>` : ''}${b.rating ? `<small>${'★'.repeat(b.rating)}${'☆'.repeat(5 - b.rating)}</small>` : ''}</div></div>`).join('')}</div>` : ''; }).join('') || '<div class="empty-mini">Sua estante está vazia. Adicione o livro que está lendo agora.</div>'}`;
  const reload = () => books(el);
  const bookForm = (b = {}) => formModal({ title: b.id ? b.title : 'Novo livro', wide: true, fields: [
    { name: 'title', label: 'Título', value: b.title || '' }, { name: 'author', label: 'Autor', value: b.author || '' },
    { name: 'status', label: 'Status', type: 'select', value: b.status || 'quero', options: [['quero', 'Quero ler'], ['lendo', 'Lendo'], ['lido', 'Lido']] }, { name: 'rating', label: 'Nota (0 a 5)', type: 'select', value: b.rating || 0, options: [0, 1, 2, 3, 4, 5].map((n) => [n, n ? '★'.repeat(n) : 'Sem nota']) },
    { name: 'pages', label: 'Total de páginas', value: b.pages ?? '', inputmode: 'numeric' }, { name: 'current', label: 'Página atual', value: b.current ?? '', inputmode: 'numeric' },
    { name: 'quotes', label: 'Citações (uma por linha; use "p. 42 |" no início para a página)', type: 'textarea', rows: 4, full: true, value: (b.quotes || []).map((x) => `${x.page ? `p. ${x.page} | ` : ''}${x.text}`).join('\n') },
    { name: 'notes', label: 'Resumo / anotações', type: 'textarea', rows: 4, full: true, value: b.notes || '' }],
  onSubmit: (d) => {
    d.quotes = d.quotes.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const m = l.match(/^p\.?\s*(\d+)\s*\|\s*(.*)$/i); return m ? { page: Number(m[1]), text: m[2] } : { text: l }; });
    d.rating = Number(d.rating) || 0;
    if (d.status === 'lendo' && !b.startedAt) d.startedAt = todayISO();
    if (d.status === 'lido' && !b.finishedAt) d.finishedAt = todayISO();
    if (d.status === 'lido' && b.status !== 'lido') toast('Livro concluído! 📚', `${readYear + 1} de ${goal} na meta do ano.`, 'success');
    return b.id ? coll('books').update(b.id, d) : coll('books').add(d);
  }, onDelete: b.id ? () => coll('books').remove(b.id) : null }).then(reload);
  el.querySelector('#addB').onclick = () => bookForm();
  el.querySelectorAll('[data-b]').forEach((x) => { x.onclick = () => bookForm(list.find((b) => b.id === x.dataset.b)); });
}

const TABS = [['ingles', 'Inglês', 'globe', english], ['programacao', 'Programação', 'code', programming], ['livros', 'Livros', 'book', books]];
export default async function render(el, [tab = 'ingles']) {
  const cur = TABS.find((t) => t[0] === tab) || TABS[0];
  el.innerHTML = `<div class="page-head"><div><h1>Estudos</h1><p>Inglês com repetição espaçada, programação e leitura</p></div></div>
    <div class="tabs">${TABS.map(([k, l, ic]) => `<button class="${k === cur[0] ? 'on' : ''}" data-t="${k}">${icon(ic, 13)} ${l}</button>`).join('')}</div><div id="tab"></div>`;
  el.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { location.hash = `#/estudos/${b.dataset.t}`; }; });
  const box = el.querySelector('#tab');
  let clean = await cur[3](box);
  const off = on('data-changed', async () => { if (typeof clean === 'function') clean(); clean = await cur[3](box); });
  return () => { off(); if (typeof clean === 'function') clean(); };
}
