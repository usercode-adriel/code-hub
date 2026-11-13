// Automações: rotinas "se isso, então aquilo", revisão semanal, mensagens dos personagens e histórico do que a IA fez.
import { api, coll } from '../api.js';
import { store, applySettings, on } from '../store.js';
import { icon } from '../icons.js';
import { esc, toast, confirmDialog, modal, timeAgo } from '../ui.js';

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const FOCUS = { geral: 'Rotina em geral', financas: 'Finanças', indrive: 'InDrive e carro', tarefas: 'Tarefas e agenda', estudos: 'Estudos e leitura', ingles: 'Inglês', habitos: 'Hábitos' };
const TEMPLATES = [
  { name: 'Resumo do InDrive na sexta', trigger: 'horario', days: [5], time: '18:00', focus: 'indrive', instruction: 'Me mande o resumo da semana do InDrive: quanto entrou, lucro, km e uma dica para a próxima semana.' },
  { name: 'Aviso de contas', trigger: 'conta_vencendo', daysBefore: 2, time: '09:00', instruction: 'Me avise das contas que vão vencer, com valor e data, e lembre de separar o dinheiro.' },
  { name: 'Cobrança de tarefas atrasadas', trigger: 'tarefa_atrasada', time: '09:30', instruction: 'Me cobre com carinho as tarefas atrasadas e sugira qual fazer primeiro.' },
  { name: 'Alerta de saldo baixo', trigger: 'saldo_baixo', threshold: 200, time: '20:00', instruction: 'Me alerte que o saldo do mês está baixo e sugira onde cortar gastos.' },
  { name: 'Comemorar meta do InDrive', trigger: 'meta_indrive', threshold: 0, instruction: 'Comemore comigo que bati a meta do dia no InDrive e diga quanto rendeu.' },
  { name: 'Bom dia motivador', trigger: 'horario', days: [1, 2, 3, 4, 5], time: '07:30', focus: 'geral', instruction: 'Me dê bom dia com a prioridade principal do dia e uma frase de motivação curta.' },
];

let TRIG = {};
function ruleSummary(r) {
  const who = r.botName || store.settings.assistantName || 'Niac';
  const when = r.trigger === 'horario' ? `${(r.days?.length ? r.days : [0, 1, 2, 3, 4, 5, 6]).length === 7 ? 'todo dia' : r.days.map((d) => DAYS[d]).join(', ')} às ${r.time || '09:00'}`
    : r.trigger === 'conta_vencendo' ? `${r.daysBefore ?? 2} dia(s) antes do vencimento`
      : r.trigger === 'saldo_baixo' ? `saldo do mês abaixo de R$ ${r.threshold || 0}`
        : r.trigger === 'meta_indrive' ? (r.threshold ? `lucro do dia ≥ R$ ${r.threshold}` : 'ao bater a meta diária da Garagem') : 'quando houver tarefa atrasada';
  return `${when} · ${who} manda`;
}

function ruleForm(rule, bots) {
  return new Promise((resolve) => {
    const r = { trigger: 'horario', days: [1, 2, 3, 4, 5], time: '09:00', focus: 'geral', botId: 'niac', active: true, ...rule };
    let days = new Set(r.days || []);
    modal({
      title: rule?.id ? 'Editar rotina' : 'Nova rotina', wide: true,
      body: `<form class="form"><div class="form-row"><div class="field"><label>Nome</label><input name="name" value="${esc(r.name || '')}" maxlength="80" required placeholder="Ex.: Resumo do InDrive"></div>
        <div class="field"><label>Quem manda a mensagem</label><select name="botId"><option value="niac">${esc(store.settings.assistantName || 'Niac')} (assistente)</option>${bots.map((b) => `<option value="${b.id}" ${r.botId === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div></div>
        <div class="field"><label>Quando</label><select name="trigger">${Object.entries(TRIG).map(([k, l]) => `<option value="${k}" ${r.trigger === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
        <div id="trigFields"></div>
        <div class="field"><label>O que a mensagem deve fazer</label><textarea name="instruction" rows="3" maxlength="1000" placeholder="Ex.: me mande o resumo da semana e uma dica">${esc(r.instruction || '')}</textarea><span class="hint">Com o Gemini, o personagem escreve do jeito dele usando seus dados. Sem IA, chega a sua instrução com os dados.</span></div>
        <div class="setting-row" style="padding:6px 0"><div class="txt"><b>Ativa</b></div><label class="switch"><input type="checkbox" name="active" ${r.active !== false ? 'checked' : ''}><span></span></label></div>
        <div class="form-actions"><button type="button" class="btn outline" data-close>Cancelar</button><button class="btn primary">Salvar</button></div></form>`,
      onMount: (m, close) => {
        const f = m.querySelector('form');
        const paint = () => {
          const t = f.trigger.value;
          m.querySelector('#trigFields').innerHTML = `<div class="form-row">${t === 'horario' ? `<div class="field" style="grid-column:1/-1"><label>Dias</label><div class="seg" id="days">${DAYS.map((d, i) => `<button type="button" data-d="${i}" class="${days.has(i) ? 'on' : ''}">${d}</button>`).join('')}</div></div>
              <div class="field"><label>Horário</label><input type="time" name="time" value="${r.time || '09:00'}"></div><div class="field"><label>Dados que ele usa</label><select name="focus">${Object.entries(FOCUS).map(([k, l]) => `<option value="${k}" ${r.focus === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`
            : t === 'conta_vencendo' ? `<div class="field"><label>Quantos dias antes</label><input type="number" min="0" max="30" name="daysBefore" value="${r.daysBefore ?? 2}"></div><div class="field"><label>A partir de que horas</label><input type="time" name="time" value="${r.time || '09:00'}"></div>`
              : t === 'saldo_baixo' ? `<div class="field"><label>Avisar se o saldo do mês ficar abaixo de (R$)</label><input type="number" step="0.01" name="threshold" value="${r.threshold ?? 200}"></div><div class="field"><label>Verificar às</label><input type="time" name="time" value="${r.time || '20:00'}"></div>`
                : t === 'meta_indrive' ? `<div class="field"><label>Lucro do dia (R$) — 0 usa a meta da Garagem</label><input type="number" step="0.01" name="threshold" value="${r.threshold ?? 0}"></div>`
                  : `<div class="field"><label>Verificar a partir de</label><input type="time" name="time" value="${r.time || '09:00'}"></div>`}</div>`;
          m.querySelectorAll('[data-d]').forEach((b) => { b.onclick = () => { const d = Number(b.dataset.d); if (days.has(d)) days.delete(d); else days.add(d); b.classList.toggle('on', days.has(d)); }; });
        };
        paint();
        f.trigger.onchange = paint;
        f.onsubmit = async (e) => {
          e.preventDefault();
          const body = { name: f.name.value.trim(), trigger: f.trigger.value, botId: f.botId.value, instruction: f.instruction.value.trim(), active: f.active.checked,
            time: f.time?.value || '', days: [...days].sort(), focus: f.focus?.value || 'geral', daysBefore: f.daysBefore ? Number(f.daysBefore.value) : null, threshold: f.threshold ? f.threshold.value : null };
          if (!body.name) return toast('Dê um nome à rotina', '', 'error');
          if (body.trigger === 'horario' && !body.days.length) return toast('Escolha pelo menos um dia', '', 'error');
          try { const saved = rule?.id ? await coll('rules').update(rule.id, body) : await coll('rules').add(body); close(); resolve(saved); } catch (err) { toast('Erro', err.message, 'error'); }
        };
      },
    });
  });
}

async function draw(el) {
  const [meta, rules, bots, actions] = await Promise.all([api.get('/automations/meta'), coll('rules').list(), coll('bots').list(), api.get('/assistant/actions')]);
  TRIG = meta.triggers;
  const botName = (bid) => (bid && bid !== 'niac' ? bots.find((b) => b.id === bid)?.name : null);
  const proactive = bots.filter((b) => b.proactive);
  const STATUS = { done: ['feito', 'ok'], undone: ['desfeito', ''], pending: ['aguardando', 'medium'], canceled: ['cancelado', ''], failed: ['falhou', 'late'] };
  el.innerHTML = `<div class="page-head"><div><h1>Automações</h1><p>Rotinas que rodam sozinhas, revisão semanal e tudo o que a IA fez por você.</p></div><button class="btn primary" id="newRule">${icon('plus', 14)} Nova rotina</button></div>
    <section class="card"><div class="section-head"><h3>${icon('zap', 15)} Suas rotinas</h3><small class="muted">rodam enquanto o Codeniac estiver ligado</small></div>
      <div class="list">${rules.map((r) => `<div class="row-item rule ${r.active === false ? 'off' : ''}" data-r="${r.id}"><span class="kind-ico">⚡</span><div class="grow"><b>${esc(r.name)}</b><small>${esc(ruleSummary({ ...r, botName: botName(r.botId) }))}${r.lastRunAt ? ` · última vez ${timeAgo(r.lastRunAt)}` : ''}</small></div>
        <div class="acts" style="opacity:1"><label class="switch" title="Ativa"><input type="checkbox" data-act ${r.active !== false ? 'checked' : ''}><span></span></label><button class="btn sm outline" data-run>Testar</button><button class="icon-btn sm ghost" data-edit>${icon('edit', 13)}</button><button class="icon-btn sm ghost" data-del>${icon('trash', 13)}</button></div></div>`).join('') || '<div class="empty-mini">Nenhuma rotina ainda. Comece por um dos modelos abaixo.</div>'}</div>
      <h6 class="auto-h6">Modelos prontos</h6><div class="tpl-grid">${TEMPLATES.map((t, i) => `<button class="tpl" data-tpl="${i}"><b>${esc(t.name)}</b><small>${esc(t.instruction)}</small></button>`).join('')}</div></section>
    <div class="cols-2" style="margin-top:var(--gap)">
      <section class="card"><h3 class="title">${icon('activity', 15)} Revisão semanal</h3><p class="sub">Domingo, no horário de encerramento do dia (${esc(store.settings.dayCloseTime || '21:30')}), chega o resumo da semana com conquistas, gastos, InDrive, leitura, hábitos e os focos da próxima.</p>
        <div class="setting-row"><div class="txt"><b>Ligada</b></div><label class="switch"><input type="checkbox" id="wr" ${store.settings.weeklyReview !== false ? 'checked' : ''}><span></span></label></div>
        <button class="btn sm outline" id="wrNow">${icon('send', 12)} Mandar a revisão agora</button></section>
      <section class="card"><h3 class="title">${icon('chat', 15)} Personagens que mandam mensagem sozinhos</h3><p class="sub">Configure a função e os horários de cada um na tela do Assistente.</p>
        <div class="list">${proactive.map((b) => `<div class="row-item"><span class="kind-ico">💬</span><div class="grow"><b>${esc(b.name)}</b><small>${esc(FOCUS[b.focus] || FOCUS.geral)} · ${esc(b.times || '—')}</small></div></div>`).join('') || '<div class="empty-mini">Nenhum ainda. No Assistente → editar personagem → “Mensagens automáticas”.</div>'}</div>
        <a class="btn sm outline" href="#/assistente" style="margin-top:10px">${icon('bot', 12)} Abrir o Assistente</a></section>
    </div>
    <section class="card" style="margin-top:var(--gap)"><div class="section-head"><h3>${icon('list', 15)} O que a IA fez</h3><small class="muted">últimas 100 ações</small></div>
      <div class="list">${actions.slice(0, 40).map((a) => `<div class="row-item" data-a="${a.id}"><span class="kind-ico">🤖</span><div class="grow"><b style="white-space:normal">${esc(a.summary || a.tool)}</b><small>${esc(botName(a.botId) || store.settings.assistantName || 'Niac')} · ${timeAgo(a.at)}</small></div>
        <span class="chip ${STATUS[a.status]?.[1] || ''}">${STATUS[a.status]?.[0] || a.status}</span>${a.status === 'done' ? '<button class="btn sm outline" data-undo>Desfazer</button>' : ''}${a.status === 'pending' ? '<button class="btn sm primary" data-ok>Confirmar</button><button class="btn sm outline" data-no>Cancelar</button>' : ''}</div>`).join('') || '<div class="empty-mini">Quando a IA registrar, criar ou alterar algo, aparece aqui com a opção de desfazer.</div>'}</div></section>`;

  const reload = () => draw(el);
  el.querySelector('#newRule').onclick = async () => { if (await ruleForm(null, bots)) reload(); };
  el.querySelectorAll('[data-tpl]').forEach((b) => { b.onclick = async () => { if (await ruleForm({ ...TEMPLATES[Number(b.dataset.tpl)], active: true }, bots)) { toast('Rotina criada', '', 'success'); reload(); } }; });
  el.querySelectorAll('[data-r]').forEach((row) => {
    const r = rules.find((x) => x.id === row.dataset.r);
    row.querySelector('[data-act]').onchange = async (e) => { await coll('rules').update(r.id, { active: e.target.checked }); reload(); };
    row.querySelector('[data-edit]').onclick = async () => { if (await ruleForm(r, bots)) reload(); };
    row.querySelector('[data-del]').onclick = async () => { if (await confirmDialog('Excluir rotina', r.name)) { await coll('rules').remove(r.id); reload(); } };
    row.querySelector('[data-run]').onclick = async (e) => {
      e.target.disabled = true; e.target.textContent = 'Enviando...';
      try { await api.post(`/rules/${r.id}/run`); toast('Mensagem enviada', 'Veja no Assistente (ou no balãozinho).', 'success'); } catch (err) { toast('Erro', err.message, 'error'); }
      e.target.disabled = false; e.target.textContent = 'Testar';
    };
  });
  el.querySelector('#wr').onchange = async (e) => applySettings(await api.put('/settings', { weeklyReview: e.target.checked }));
  el.querySelector('#wrNow').onclick = async (e) => { e.target.disabled = true; await api.post('/review/week'); toast('Revisão enviada', 'Está no chat do assistente.', 'success'); e.target.disabled = false; };
  el.querySelectorAll('[data-a]').forEach((row) => {
    const aid = row.dataset.a;
    row.querySelector('[data-undo]')?.addEventListener('click', async () => { try { await api.post(`/assistant/actions/${aid}/undo`); toast('Desfeito', '', 'success'); reload(); } catch (err) { toast('Erro', err.message, 'error'); } });
    row.querySelector('[data-ok]')?.addEventListener('click', async () => { try { await api.post(`/assistant/actions/${aid}/confirm`, { accept: true }); toast('Feito', '', 'success'); reload(); } catch (err) { toast('Erro', err.message, 'error'); } });
    row.querySelector('[data-no]')?.addEventListener('click', async () => { await api.post(`/assistant/actions/${aid}/confirm`, { accept: false }); reload(); });
  });
}

export default async function render(el) {
  await draw(el);
  return on('data-changed', () => draw(el));
}
