// Diário de reflexão — caderno de viagem no estilo velho oeste (papel envelhecido, letra à mão,
// carimbos de humor e clima, esboços a lápis). Salva sozinho enquanto você escreve.
import { coll } from '../api.js';
import { esc, todayISO, toast, confirmDialog } from '../ui.js';

const MOODS = [['otimo', '😄', 'Ótimo'], ['bem', '🙂', 'Bem'], ['neutro', '😐', 'Neutro'], ['cansado', '😮‍💨', 'Cansado'], ['mal', '😞', 'Difícil']];
const WEATHER = [['sol', '☀️', 'Sol'], ['nublado', '☁️', 'Nublado'], ['chuva', '🌧️', 'Chuva'], ['tempestade', '⛈️', 'Tempestade'], ['vento', '🌬️', 'Vento'], ['neve', '❄️', 'Frio']];
const SKETCH = {
  montanhas: '<polyline points="5,80 40,30 60,55 85,15 120,70 150,80"/><polyline points="72,32 85,15 98,32"/><path d="M0 85 Q75 75 155 85"/><circle cx="128" cy="22" r="8"/>',
  fogueira: '<path d="M75 20 C60 45 90 45 70 70 C95 60 100 35 75 20Z"/><path d="M78 45 C70 58 86 60 78 70"/><line x1="40" y1="85" x2="110" y2="70"/><line x1="40" y1="70" x2="110" y2="85"/><path d="M30 88 Q75 80 120 88"/>',
  cavalo: '<path d="M30 70 Q35 45 60 45 L95 45 Q105 30 112 22 L122 26 L118 36 Q125 40 120 46 L108 46 L104 60 Q100 70 102 85"/><path d="M45 68 L40 88 M60 70 L58 88 M95 62 L92 88"/><path d="M30 70 Q18 62 14 74"/><path d="M112 22 L110 14"/>',
  cacto: '<path d="M70 88 L70 20 Q78 12 86 20 L86 88"/><path d="M70 55 L55 55 Q48 55 48 46 L48 32"/><path d="M86 48 L100 48 Q106 48 106 40 L106 28"/><path d="M30 88 Q78 82 130 88"/><line x1="76" y1="30" x2="76" y2="34"/><line x1="80" y1="50" x2="80" y2="54"/>',
  lua: '<path d="M95 15 A35 35 0 1 0 120 70 A28 28 0 1 1 95 15Z"/><circle cx="40" cy="25" r="1.5"/><circle cx="25" cy="55" r="1.5"/><circle cx="60" cy="12" r="1.2"/><path d="M5 88 Q50 80 90 86 T155 84"/>',
  trem: '<rect x="30" y="40" width="60" height="30" rx="3"/><rect x="90" y="30" width="30" height="40" rx="3"/><line x1="40" y1="25" x2="40" y2="40"/><path d="M36 25 h8"/><circle cx="45" cy="76" r="7"/><circle cx="75" cy="76" r="7"/><circle cx="108" cy="76" r="7"/><line x1="10" y1="86" x2="150" y2="86"/><path d="M40 20 Q30 10 45 6"/>',
};
const QUOTES = ['“Não importa o tamanho da estrada, e sim o próximo passo.”', '“Quem escreve o caminho não se perde nele.”', '“Hoje é só mais uma página. Escreva com calma.”', '“Toda trilha começa com poeira nas botas.”', '“O que não se registra, a memória leva embora.”'];
const longDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const shortDate = (d) => d.split('-').reverse().slice(0, 2).join('/');

export default async function render(el) {
  let list = await coll('journal').list();
  let cur = list.find((j) => j.date === todayISO()) || { date: todayISO(), title: '', text: '', mood: null, weather: null, gratitude: '', lesson: '', tomorrow: '', sketch: 'montanhas' };
  let timer = null;
  let saving = Promise.resolve();

  const paintIndex = () => {
    const year = todayISO().slice(0, 4);
    const moods = {};
    for (const j of list.filter((x) => x.date.startsWith(year))) if (j.mood) moods[j.mood] = (moods[j.mood] || 0) + 1;
    el.querySelector('#left').innerHTML = `<p class="j-title">Diário de viagem</p><p class="j-date">Ano de ${year}</p><p class="j-sub">${list.length} página(s) escrita(s)</p>
      <div class="j-actions"><button class="j-btn" id="jNew">+ Nova página</button><input type="search" class="j-btn ghost" id="jSearch" placeholder="Procurar..." style="width:130px;text-transform:none"></div>
      <ul class="j-index" id="jIdx">${list.slice(0, 60).map((j) => `<li data-id="${j.id}" class="${j.id === cur.id ? 'on' : ''}" data-q="${esc(`${j.title} ${j.text}`.toLowerCase())}"><span class="d">${shortDate(j.date)}</span><span class="t">${esc(j.title || j.text.split('\n')[0] || 'Sem título')}</span><span>${MOODS.find((m) => m[0] === j.mood)?.[1] || ''}</span></li>`).join('') || '<li style="cursor:default">Nenhuma página ainda. A primeira é a de hoje.</li>'}</ul>
      ${Object.keys(moods).length ? `<div class="j-stamps" style="margin-top:20px">${MOODS.filter((m) => moods[m[0]]).map(([k, e, l]) => `<span class="j-stamp blue" title="${l}"><span><span class="e">${e}</span>${moods[k]}×</span></span>`).join('')}</div>` : ''}
      <p class="j-quote">${QUOTES[new Date().getDate() % QUOTES.length]}</p>`;
    el.querySelector('#jNew').onclick = async () => { await flush(); cur = { date: todayISO(), title: '', text: '', sketch: Object.keys(SKETCH)[list.length % 6] }; paintPage(); paintIndex(); };
    el.querySelector('#jSearch').oninput = (e) => { const q = e.target.value.toLowerCase(); el.querySelectorAll('#jIdx li[data-id]').forEach((li) => { li.hidden = q && !li.dataset.q.includes(q); }); };
    el.querySelectorAll('#jIdx li[data-id]').forEach((li) => { li.onclick = async () => { await flush(); cur = list.find((j) => j.id === li.dataset.id); paintPage(); paintIndex(); }; });
  };

  const field = (name, label, ph) => `<div class="j-field"><label>${label}</label><textarea class="j-ink" data-f="${name}" rows="1" placeholder="${ph}">${esc(cur[name] || '')}</textarea></div>`;
  const paintPage = () => {
    el.querySelector('#right').innerHTML = `<div class="j-sketch" title="Trocar esboço" id="jSketch" style="cursor:pointer"><svg viewBox="0 0 155 95" stroke-width="1.6">${SKETCH[cur.sketch || 'montanhas']}</svg></div>
      <p class="j-title">Página do dia</p><p class="j-date">${longDate(cur.date)}</p>
      <input type="date" class="j-btn ghost" id="jDate" value="${cur.date}" style="margin-top:6px;text-transform:none;padding:3px 8px">
      <div class="j-field"><label>Clima</label><div class="j-pick" data-p="weather">${WEATHER.map(([k, e, l]) => `<button type="button" data-v="${k}" class="${cur.weather === k ? 'on' : ''}">${e} ${l}</button>`).join('')}</div></div>
      <div class="j-field"><label>Como eu estou</label><div class="j-stamps" data-p="mood">${MOODS.map(([k, e, l]) => `<button type="button" class="j-stamp" data-v="${k}" style="${cur.mood === k ? 'opacity:1;background:rgba(139,46,31,.14)' : 'opacity:.35'}"><span><span class="e">${e}</span>${l}</span></button>`).join('')}</div></div>
      <div class="j-field"><label>Título</label><input class="j-ink" data-f="title" value="${esc(cur.title || '')}" placeholder="Um nome para este dia..."></div>
      ${field('text', 'Relato', 'O que aconteceu hoje? O que eu senti?')}
      ${field('gratitude', 'Sou grato por', 'Três coisas boas de hoje...')}
      ${field('lesson', 'O que aprendi', 'Uma lição, um erro, uma descoberta...')}
      ${field('tomorrow', 'Amanhã eu vou', 'O passo mais importante de amanhã...')}
      <div class="j-actions"><button class="j-btn" id="jSave">Salvar página</button>${cur.id ? '<button class="j-btn ghost" id="jDel">Arrancar página</button>' : ''}<span class="j-saved" id="jSaved">${cur.id ? 'salvo' : 'nova página'}</span></div>`;
    const grow = (t) => { t.style.height = 'auto'; t.style.height = `${Math.max(t.scrollHeight, 30)}px`; };
    el.querySelectorAll('textarea.j-ink').forEach((t) => { grow(t); t.addEventListener('input', () => grow(t)); });
    el.querySelectorAll('[data-f]').forEach((inp) => inp.addEventListener('input', () => { cur[inp.dataset.f] = inp.value; schedule(); }));
    el.querySelectorAll('[data-p] [data-v]').forEach((b) => b.addEventListener('click', () => { const p = b.closest('[data-p]').dataset.p; cur[p] = cur[p] === b.dataset.v ? null : b.dataset.v; paintPage(); schedule(); }));
    el.querySelector('#jSketch').onclick = () => { const keys = Object.keys(SKETCH); cur.sketch = keys[(keys.indexOf(cur.sketch) + 1) % keys.length]; el.querySelector('#jSketch svg').innerHTML = SKETCH[cur.sketch]; schedule(); };
    el.querySelector('#jDate').onchange = (e) => { if (e.target.value) { cur.date = e.target.value; el.querySelector('.j-date').textContent = longDate(cur.date); schedule(); } };
    el.querySelector('#jSave').onclick = async () => { await flush(true); toast('Página guardada', 'Seu diário foi salvo.', 'success'); };
    el.querySelector('#jDel')?.addEventListener('click', async () => {
      if (!(await confirmDialog('Arrancar página', 'Esta página do diário será excluída para sempre.'))) return;
      clearTimeout(timer);
      await coll('journal').remove(cur.id);
      list = list.filter((j) => j.id !== cur.id);
      cur = { date: todayISO(), title: '', text: '', sketch: 'montanhas' };
      paintPage(); paintIndex();
    });
  };

  const hasContent = () => ['title', 'text', 'gratitude', 'lesson', 'tomorrow'].some((k) => (cur[k] || '').trim()) || cur.mood;
  const persist = async () => {
    if (!hasContent()) return;
    const body = { date: cur.date, title: cur.title || '', text: cur.text || '', mood: cur.mood || null, weather: cur.weather || null, gratitude: cur.gratitude || '', lesson: cur.lesson || '', tomorrow: cur.tomorrow || '', sketch: cur.sketch || 'montanhas' };
    const wasNew = !cur.id;
    const saved = cur.id ? await coll('journal').update(cur.id, body) : await coll('journal').add(body);
    cur.id = saved.id;
    const i = list.findIndex((j) => j.id === saved.id);
    if (i >= 0) list[i] = saved; else list.unshift(saved);
    list.sort((a, b) => b.date.localeCompare(a.date));
    const s = el.querySelector('#jSaved'); if (s) s.textContent = `salvo às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    if (wasNew) { paintIndex(); const del = el.querySelector('#jDel'); if (!del) { /* mostra botão excluir na próxima pintura */ } }
  };
  const flush = (force) => { clearTimeout(timer); if (force || timer) { timer = null; saving = saving.then(persist).catch((e) => toast('Erro ao salvar', e.message, 'error')); } return saving; };
  const schedule = () => { const s = el.querySelector('#jSaved'); if (s) s.textContent = 'escrevendo...'; clearTimeout(timer); timer = setTimeout(() => { timer = null; saving = saving.then(persist).catch((e) => toast('Erro ao salvar', e.message, 'error')); }, 900); };

  el.innerHTML = `<div class="journal-desk"><div class="journal-book"><section class="jpage left" id="left"></section><section class="jpage right" id="right"></section></div></div>`;
  paintIndex(); paintPage();
  return () => { if (timer) { clearTimeout(timer); persist(); } };
}
