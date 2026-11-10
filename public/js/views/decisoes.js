// Assistente de decisões: passos guiados, alternativas com vantagens/riscos/consequências,
// critérios com peso, matriz de notas, ranking, perguntas-guia e lembrete de revisão.
// Ele organiza o raciocínio — quem decide é você.
import { coll } from '../api.js';
import { icon } from '../icons.js';
import { esc, dmy, toast, todayISO, confirmDialog } from '../ui.js';

const uid = () => Math.random().toString(36).slice(2, 9);
const STEPS = ['Problema', 'Alternativas', 'Critérios', 'Notas', 'Resultado'];
const CRIT_SUGGEST = ['Custo', 'Tempo', 'Risco', 'Alinhado com meus objetivos', 'Reversível', 'Impacto na saúde / energia', 'Retorno financeiro', 'Aprendizado', 'Impacto na família'];
const GUIDE = [
  ['tenten', 'Regra 10-10-10: como vou me sentir com essa escolha daqui a 10 minutos, 10 meses e 10 anos?'],
  ['friend', 'Se um amigo estivesse no meu lugar, o que eu aconselharia?'],
  ['worst', 'Qual o pior cenário realista de cada opção? Eu aguento esse cenário?'],
  ['reverse', 'Dá para voltar atrás? Quanto custa desfazer?'],
  ['info', 'Que informação me falta, e como consigo em poucos dias?'],
  ['fear', 'Estou evitando alguma opção só por medo ou comodidade?'],
];
const STATUS = { rascunho: ['Rascunho', ''], decidida: ['Decidida', 'ok'], avaliada: ['Avaliada', 'yellow'] };

function ranking(d) {
  const total = d.criteria.reduce((a, c) => a + (Number(c.weight) || 0), 0) || 1;
  return d.alternatives.map((a) => {
    const score = d.criteria.reduce((s, c) => s + (Number(d.scores?.[a.id]?.[c.id]) || 0) * (Number(c.weight) || 0), 0) / total;
    return { ...a, score };
  }).sort((x, y) => y.score - x.score);
}

async function list(el) {
  const items = await coll('decisions').list();
  const today = todayISO();
  el.innerHTML = `<div class="page-head"><div><h1>Decisões</h1><p>Organize alternativas, pesos e riscos — e reavalie depois para aprender com suas escolhas.</p></div><button class="btn primary" id="new">${icon('plus', 14)} Nova decisão</button></div>
    <div class="honest" style="margin-bottom:var(--gap)">Este assistente <b>não pensa por você</b> e não usa IA: ele aplica um método (alternativas → critérios com peso → notas → ranking → perguntas-guia). O número final é um apoio; sua intuição e seus valores continuam valendo.</div>
    <div class="list">${items.map((d) => { const st = STATUS[d.status || 'rascunho']; const review = d.reviewAt && d.reviewAt <= today && !d.review; return `<a class="row-item" href="#/decisoes/${d.id}"><span class="kind-ico">⚖️</span><div class="grow"><b>${esc(d.title)}</b><small>${(d.alternatives || []).length} alternativa(s) · ${(d.criteria || []).length} critério(s)${d.chosen ? ` · escolhida: ${esc((d.alternatives || []).find((a) => a.id === d.chosen)?.name || '')}` : ''}${d.reviewAt ? ` · revisar em ${dmy(d.reviewAt)}` : ''}</small></div>${review ? '<span class="chip medium">hora de avaliar</span>' : ''}<span class="chip ${st[1]}">${st[0]}</span></a>`; }).join('') || '<div class="empty-mini">Nenhuma decisão ainda. Comece por algo concreto: “Trocar de carro?”, “Fazer faculdade ou curso?”.</div>'}</div>`;
  el.querySelector('#new').onclick = async () => {
    const d = await coll('decisions').add({ title: 'Nova decisão', status: 'rascunho', alternatives: [], criteria: [], scores: {}, guide: {} });
    location.hash = `#/decisoes/${d.id}`;
  };
}

async function wizard(el, id) {
  const all = await coll('decisions').list();
  const d = all.find((x) => x.id === id);
  if (!d) { el.innerHTML = '<div class="empty-state"><b>Decisão não encontrada</b></div>'; return; }
  d.alternatives ||= []; d.criteria ||= []; d.scores ||= {}; d.guide ||= {};
  let step = d.status === 'rascunho' ? (d.alternatives.length ? (d.criteria.length ? 3 : 2) : 0) : 4;
  let timer = null;
  const save = (now) => {
    clearTimeout(timer);
    const run = () => coll('decisions').update(d.id, { title: d.title, problem: d.problem || '', alternatives: d.alternatives, criteria: d.criteria, scores: d.scores, guide: d.guide, chosen: d.chosen || '', reviewAt: d.reviewAt || null, review: d.review || null, status: d.status || 'rascunho' }).catch((e) => toast('Erro ao salvar', e.message, 'error'));
    if (now) return run();
    timer = setTimeout(run, 600);
  };

  const body = () => {
    if (step === 0) return `<div class="card"><div class="form"><div class="field"><label>Qual decisão você precisa tomar?</label><input data-k="title" value="${esc(d.title === 'Nova decisão' ? '' : d.title)}" placeholder="Ex.: Trocar o carro agora ou daqui a 1 ano?"></div>
      <div class="field"><label>Contexto: o que está em jogo, prazos, limites</label><textarea data-k="problem" rows="5" placeholder="Escreva livremente. Quanto mais claro o problema, melhor a decisão.">${esc(d.problem || '')}</textarea></div>
      <div class="guide-q"><label>Antes de seguir, pergunte-se:</label><ul class="muted" style="margin:0;padding-left:18px;font-size:12px;line-height:1.8"><li>Qual é o problema real por trás dessa decisão?</li><li>Até quando eu preciso decidir?</li><li>Essa decisão é só minha ou envolve outras pessoas?</li></ul></div></div></div>`;
    if (step === 1) return `<div class="stack">${d.alternatives.map((a, i) => `<div class="card" data-alt="${a.id}"><div style="display:flex;gap:8px;align-items:center;margin-bottom:10px"><span class="chip">${String.fromCharCode(65 + i)}</span><input class="input" data-a="name" value="${esc(a.name)}" placeholder="Nome da alternativa" style="flex:1"><button class="icon-btn sm ghost" data-rm title="Remover">${icon('trash', 13)}</button></div>
        <div class="form-row"><div class="field"><label>👍 Vantagens</label><textarea data-a="pros" rows="3">${esc(a.pros || '')}</textarea></div><div class="field"><label>👎 Desvantagens</label><textarea data-a="cons" rows="3">${esc(a.cons || '')}</textarea></div>
        <div class="field"><label>⚠️ Riscos</label><textarea data-a="risks" rows="2">${esc(a.risks || '')}</textarea></div><div class="field"><label>🔮 Consequências (curto e longo prazo)</label><textarea data-a="consequences" rows="2">${esc(a.consequences || '')}</textarea></div></div></div>`).join('')}
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn outline" id="addAlt">${icon('plus', 13)} Alternativa</button>${d.alternatives.some((a) => /nada|manter|não fazer/i.test(a.name)) ? '' : '<button class="btn outline" id="addNone">+ “Não fazer nada / manter como está”</button>'}</div>
      <div class="honest">Dica: tente ter pelo menos 3 alternativas. Muitas decisões ruins acontecem porque só comparamos “sim” contra “não”.</div></div>`;
    if (step === 2) return `<div class="card"><p class="muted" style="margin:0 0 12px;font-size:12px">O que importa para você nesta decisão? Dê um peso de 1 (pouco) a 5 (essencial).</p>
      <div class="list">${d.criteria.map((c) => `<div class="row-item" data-cr="${c.id}"><input class="input" data-c="name" value="${esc(c.name)}" style="flex:1"><div class="seg">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-w="${n}" class="${Number(c.weight) === n ? 'on' : ''}">${n}</button>`).join('')}</div><button class="icon-btn sm ghost" data-rm>${icon('trash', 13)}</button></div>`).join('') || '<div class="empty-mini">Adicione critérios abaixo.</div>'}</div>
      <div class="tag-row" style="margin-top:12px">${CRIT_SUGGEST.filter((s) => !d.criteria.some((c) => c.name === s)).map((s) => `<button class="chip" data-sug="${esc(s)}" style="border:0;cursor:pointer">+ ${esc(s)}</button>`).join('')}</div>
      <form id="crForm" style="display:flex;gap:8px;margin-top:12px"><input class="input" name="n" placeholder="Outro critério..." style="flex:1"><button class="btn sm primary">Adicionar</button></form></div>`;
    if (step === 3) {
      if (!d.alternatives.length || !d.criteria.length) return '<div class="empty-mini">Preencha alternativas e critérios primeiro.</div>';
      return `<div class="card"><p class="muted" style="margin:0 0 12px;font-size:12px">Dê uma nota de 0 a 10 para cada alternativa em cada critério. Em “Custo” e “Risco”, nota alta = <b>melhor</b> (mais barato, menos arriscado).</p>
        <div class="table-wrap"><table class="table matrix"><thead><tr><th>Critério (peso)</th>${d.alternatives.map((a, i) => `<th>${String.fromCharCode(65 + i)} · ${esc(a.name || '—')}</th>`).join('')}</tr></thead><tbody>
        ${d.criteria.map((c) => `<tr><td>${esc(c.name)} <small class="muted">×${c.weight}</small></td>${d.alternatives.map((a) => `<td><input class="input" type="number" min="0" max="10" data-s="${a.id}|${c.id}" value="${d.scores[a.id]?.[c.id] ?? ''}"></td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
    }
    const rank = ranking(d);
    const best = rank[0];
    const tie = rank[1] && best.score - rank[1].score < 0.5;
    const reviewDefault = d.reviewAt || todayISO(30);
    return `<div class="cols-21"><div class="stack">
        <div class="card"><div class="section-head"><h3>${icon('trophy', 14)} Ranking ponderado</h3><small class="muted">nota média ponderada (0 a 10)</small></div>
          ${rank.map((a, i) => `<div class="rank ${i === 0 ? 'win' : ''}"><span class="pos">${i + 1}º</span><div><b>${esc(a.name || '—')}</b><div class="progress"><span style="width:${a.score * 10}%"></span></div></div><b>${a.score.toFixed(1).replace('.', ',')}</b></div>`).join('') || '<div class="empty-mini">Sem alternativas.</div>'}
          ${best ? `<div class="honest" style="margin-top:10px">${tie ? `<b>Empate técnico</b> entre “${esc(best.name)}” e “${esc(rank[1].name)}”. Os números não resolvem sozinhos: use as perguntas ao lado e veja qual risco você prefere correr.` : `Pelos seus critérios, “<b>${esc(best.name)}</b>” se sai melhor. Se isso te incomoda, talvez falte um critério importante — volte ao passo 3.`}</div>` : ''}</div>
        <div class="card"><div class="section-head"><h3>${icon('flag', 14)} Minha decisão</h3></div>
          <div class="form"><div class="field"><label>Escolhi</label><select id="chosen"><option value="">— ainda não decidi —</option>${d.alternatives.map((a) => `<option value="${a.id}" ${d.chosen === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Revisar como foi em</label><input type="date" id="reviewAt" value="${reviewDefault}"><span class="hint">Você recebe um lembrete nesse dia para avaliar o resultado.</span></div>
          <button class="btn primary" id="decide">${icon('check', 14)} Registrar decisão</button></div>
          ${d.status !== 'rascunho' ? `<div class="guide-q" style="margin-top:14px"><label>Avaliação do resultado ${d.review ? '✅' : ''}</label>
            <div class="seg" id="revScore">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-r="${n}" class="${d.review?.score === n ? 'on' : ''}">${'★'.repeat(n)}</button>`).join('')}</div>
            <textarea class="input" id="revText" rows="3" style="width:100%;margin-top:8px" placeholder="Deu certo? O que eu faria diferente?">${esc(d.review?.text || '')}</textarea><button class="btn sm outline" id="revSave" style="margin-top:8px">Salvar avaliação</button></div>` : ''}</div>
      </div>
      <div class="card"><div class="section-head"><h3>${icon('sparkles', 14)} Perguntas-guia</h3></div><div class="stack">${GUIDE.map(([k, q]) => `<div class="guide-q"><label>${esc(q)}</label><textarea class="input" data-g="${k}" rows="2" style="width:100%">${esc(d.guide[k] || '')}</textarea></div>`).join('')}</div></div></div>`;
  };

  const paint = () => {
    el.innerHTML = `<div class="page-head"><div><a class="see-more" href="#/decisoes">${icon('chevLeft', 12)} Decisões</a><h1>${esc(d.title)}</h1></div><button class="btn danger sm" id="del">${icon('trash', 13)} Excluir</button></div>
      <div class="stepper">${STEPS.map((s, i) => `<button data-st="${i}" class="${i === step ? 'on' : ''} ${i < step ? 'done' : ''}"><span class="n">${i + 1}</span>${s}</button>`).join('')}</div>
      <div id="stepBody">${body()}</div>
      <div class="form-actions" style="margin-top:var(--gap)">${step > 0 ? `<button class="btn outline" id="prev">${icon('chevLeft', 13)} Voltar</button>` : ''}${step < 4 ? `<button class="btn primary" id="next">Próximo ${icon('chevRight', 13)}</button>` : ''}</div>`;
    el.querySelectorAll('[data-st]').forEach((b) => { b.onclick = () => { step = Number(b.dataset.st); save(true); paint(); }; });
    el.querySelector('#prev')?.addEventListener('click', () => { step--; save(true); paint(); });
    el.querySelector('#next')?.addEventListener('click', () => {
      if (step === 0 && !d.title.trim()) return toast('Dê um nome para a decisão', '', 'error');
      if (step === 1 && d.alternatives.filter((a) => a.name.trim()).length < 2) return toast('Pelo menos 2 alternativas', 'Compare ao menos duas opções.', 'error');
      if (step === 2 && !d.criteria.length) return toast('Adicione ao menos 1 critério', '', 'error');
      step++; save(true); paint();
    });
    el.querySelector('#del').onclick = async () => { if (await confirmDialog('Excluir decisão', d.title)) { clearTimeout(timer); await coll('decisions').remove(d.id); location.hash = '#/decisoes'; } };
    // passo 1
    el.querySelectorAll('[data-k]').forEach((i) => i.addEventListener('input', () => { d[i.dataset.k] = i.value || (i.dataset.k === 'title' ? '' : ''); if (i.dataset.k === 'title') el.querySelector('h1').textContent = i.value || 'Nova decisão'; save(); }));
    // passo 2
    el.querySelectorAll('[data-alt]').forEach((card) => {
      const a = d.alternatives.find((x) => x.id === card.dataset.alt);
      card.querySelectorAll('[data-a]').forEach((i) => i.addEventListener('input', () => { a[i.dataset.a] = i.value; save(); }));
      card.querySelector('[data-rm]').onclick = () => { d.alternatives = d.alternatives.filter((x) => x !== a); delete d.scores[a.id]; save(); paint(); };
    });
    el.querySelector('#addAlt')?.addEventListener('click', () => { d.alternatives.push({ id: uid(), name: '' }); save(); paint(); el.querySelector('[data-alt]:last-of-type [data-a="name"]')?.focus(); });
    el.querySelector('#addNone')?.addEventListener('click', () => { d.alternatives.push({ id: uid(), name: 'Não fazer nada / manter como está' }); save(); paint(); });
    // passo 3
    el.querySelectorAll('[data-cr]').forEach((row) => {
      const c = d.criteria.find((x) => x.id === row.dataset.cr);
      row.querySelector('[data-c]').oninput = (e) => { c.name = e.target.value; save(); };
      row.querySelectorAll('[data-w]').forEach((b) => { b.onclick = () => { c.weight = Number(b.dataset.w); save(); paint(); }; });
      row.querySelector('[data-rm]').onclick = () => { d.criteria = d.criteria.filter((x) => x !== c); save(); paint(); };
    });
    el.querySelectorAll('[data-sug]').forEach((b) => { b.onclick = () => { d.criteria.push({ id: uid(), name: b.dataset.sug, weight: 3 }); save(); paint(); }; });
    el.querySelector('#crForm')?.addEventListener('submit', (e) => { e.preventDefault(); const n = e.target.n.value.trim(); if (n) { d.criteria.push({ id: uid(), name: n, weight: 3 }); save(); paint(); } });
    // passo 4
    el.querySelectorAll('[data-s]').forEach((i) => i.addEventListener('input', () => {
      const [a, c] = i.dataset.s.split('|');
      const v = Math.max(0, Math.min(10, Number(i.value)));
      (d.scores[a] ||= {})[c] = i.value === '' ? null : v;
      save();
    }));
    // passo 5
    el.querySelectorAll('[data-g]').forEach((t) => t.addEventListener('input', () => { d.guide[t.dataset.g] = t.value; save(); }));
    el.querySelector('#decide')?.addEventListener('click', async () => {
      d.chosen = el.querySelector('#chosen').value;
      if (!d.chosen) return toast('Escolha uma alternativa', 'Se ainda não decidiu, tudo bem: o rascunho fica salvo.', 'error');
      d.reviewAt = el.querySelector('#reviewAt').value || null;
      d.status = d.review ? 'avaliada' : 'decidida';
      await save(true);
      toast('Decisão registrada', d.reviewAt ? `Vou te lembrar de avaliar em ${dmy(d.reviewAt)}.` : '', 'success');
      paint();
    });
    let revScore = d.review?.score || 0;
    el.querySelectorAll('[data-r]').forEach((b) => { b.onclick = () => { revScore = Number(b.dataset.r); el.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('on', x === b)); }; });
    el.querySelector('#revSave')?.addEventListener('click', async () => {
      d.review = { score: revScore, text: el.querySelector('#revText').value, at: todayISO() };
      d.status = 'avaliada';
      await save(true);
      toast('Avaliação salva', 'Aprender com as próprias decisões é o que faz a próxima ser melhor.', 'success');
      paint();
    });
  };
  paint();
  return () => { if (timer) save(true); };
}

export default async function render(el, [id]) {
  if (id) return wizard(el, id);
  return list(el);
}
