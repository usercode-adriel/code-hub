// Financeiro pessoal: lançamentos, orçamento por categoria, importação de extrato (CSV),
// contas a pagar com avisos e assinaturas / gastos fixos.
import { api, coll } from '../api.js';
import { on } from '../store.js';
import { icon } from '../icons.js';
import { esc, dmy, brl, toast, todayISO, formModal, modal, confirmDialog } from '../ui.js';
import { kpi } from '../components.js';

const CATS = ['Mercado', 'Alimentação', 'Combustível', 'Transporte', 'Moradia', 'Saúde', 'Educação', 'Lazer', 'Assinaturas', 'Telefone/Internet', 'Contas', 'Investimentos', 'Receita', 'Outros'];
const CYCLE = { once: 'Uma vez', monthly: 'Mensal', yearly: 'Anual' };
let month = todayISO().slice(0, 7);
const monthName = (m) => new Date(`${m}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

// ---------- CSV ----------
function parseCSV(text) {
  const first = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const delim = [';', ',', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = []; let row = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; continue; }
    if (c === '"') q = true;
    else if (c === delim) { row.push(cur.trim()); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur.trim()); if (row.some(Boolean)) rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  row.push(cur.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}
function parseDate(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
function parseAmount(s) {
  s = String(s || '').replace(/[R$\s]/g, '');
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || /-$/.test(s) || /D$/i.test(s);
  s = s.replace(/[()]/g, '').replace(/[-+]$/, '').replace(/[CD]$/i, '');
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -Math.abs(n) : n) : null;
}

function importModal(done) {
  modal({
    title: 'Importar extrato do banco (CSV)', wide: true,
    body: `<div class="form"><p class="muted" style="margin:0;font-size:12px">No app ou site do banco, exporte o extrato em <b>CSV</b> (Nubank, Inter, Itaú, BB, Caixa, C6... quase todos oferecem). O arquivo é lido aqui mesmo, no seu computador. Lançamentos repetidos são ignorados e a categoria é sugerida pela descrição.</p>
      <label class="upload-zone" style="display:block">${icon('upload', 20)}<div>Clique para escolher o arquivo .csv</div><input type="file" accept=".csv,text/csv,.txt" hidden id="csvFile"></label>
      <div id="csvStep" hidden><div class="csv-map"><div class="field"><label>Coluna da data</label><select id="cDate"></select></div><div class="field"><label>Coluna da descrição</label><select id="cDesc"></select></div><div class="field"><label>Coluna do valor</label><select id="cAmt"></select></div></div>
        <div class="setting-row" style="padding:8px 0"><div class="txt"><b>Primeira linha é cabeçalho</b></div><label class="switch"><input type="checkbox" id="cHead" checked><span></span></label>
          <div class="txt"><b>Inverter sinal</b><small>use se as saídas vierem positivas</small></div><label class="switch"><input type="checkbox" id="cInv"><span></span></label></div>
        <div class="csv-preview" id="csvPrev"></div>
        <div class="form-actions"><span class="muted" id="csvCount" style="margin-right:auto"></span><button class="btn outline" data-close>Cancelar</button><button class="btn primary" id="csvGo">Importar</button></div></div></div>`,
    onMount: (m, close) => {
      let rows = [];
      const sel = (id) => m.querySelector(id);
      const build = () => {
        const head = sel('#cHead').checked;
        const data = head ? rows.slice(1) : rows;
        const [di, de, va] = [sel('#cDate').value, sel('#cDesc').value, sel('#cAmt').value].map(Number);
        const inv = sel('#cInv').checked ? -1 : 1;
        return data.map((r) => ({ date: parseDate(r[di]), desc: (r[de] || '').slice(0, 160), amount: parseAmount(r[va]) == null ? null : parseAmount(r[va]) * inv })).filter((r) => r.date && r.desc && r.amount);
      };
      const preview = () => {
        const list = build();
        sel('#csvPrev').innerHTML = `<table class="table"><thead><tr><th>Data</th><th>Descrição</th><th style="text-align:right">Valor</th></tr></thead><tbody>${list.slice(0, 8).map((r) => `<tr><td>${dmy(r.date)}</td><td>${esc(r.desc)}</td><td style="text-align:right" class="${r.amount > 0 ? 'money-pos' : ''}">${brl(r.amount)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Nenhuma linha válida com essas colunas.</td></tr>'}</tbody></table>`;
        sel('#csvCount').textContent = `${list.length} lançamento(s) válidos`;
      };
      sel('#csvFile').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const buf = await file.arrayBuffer();
        let text = new TextDecoder('utf-8').decode(buf);
        if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
        rows = parseCSV(text.replace(/^﻿/, ''));
        if (rows.length < 2) { toast('Arquivo vazio', 'Não encontrei linhas no CSV.', 'error'); return; }
        const head = rows[0];
        const opts = head.map((h, i) => `<option value="${i}">${esc(h || `Coluna ${i + 1}`)}</option>`).join('');
        ['#cDate', '#cDesc', '#cAmt'].forEach((id) => { sel(id).innerHTML = opts; });
        const find = (re, def) => { const i = head.findIndex((h) => re.test(h)); return i >= 0 ? i : def; };
        sel('#cDate').value = find(/data|date/i, 0);
        sel('#cDesc').value = find(/descri|hist|title|lan[cç]amento|estabelec|memo/i, 1);
        sel('#cAmt').value = find(/valor|amount|quantia|montante/i, head.length - 1);
        sel('#csvStep').hidden = false;
        preview();
      };
      m.querySelectorAll('#cDate,#cDesc,#cAmt,#cHead,#cInv').forEach((x) => x.addEventListener('change', preview));
      sel('#csvGo').onclick = async () => {
        const list = build();
        if (!list.length) return toast('Nada para importar', 'Confira as colunas.', 'error');
        const r = await api.post('/money/import', { rows: list });
        close(); toast('Extrato importado', `${r.added} novo(s), ${r.skipped} ignorado(s).`, 'success'); done();
      };
    },
  });
}

async function draw(el) {
  const [sum, all, subsAll, billsAll] = await Promise.all([api.get(`/money/summary?month=${month}`), coll('money').list(), coll('subscriptions').list(), coll('bills').list()]);
  const list = all.filter((x) => x.date.startsWith(month));
  const months = [...new Set([todayISO().slice(0, 7), ...sum.months, month])].sort().reverse();
  const cats = Object.entries(sum.byCat).sort((a, b) => b[1] - a[1]);
  const budgetCats = [...new Set([...Object.keys(sum.budgets), ...cats.map(([c]) => c)])];
  const maxCat = Math.max(1, ...cats.map(([, v]) => v));

  el.innerHTML = `
    <div class="page-head"><div><h1>Financeiro</h1><p>Finanças pessoais · ${monthName(month)}</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><select class="input" id="month" style="height:34px">${months.map((m) => `<option value="${m}" ${m === month ? 'selected' : ''}>${monthName(m)}</option>`).join('')}</select>
        <button class="btn outline" id="imp">${icon('upload', 14)} Importar extrato</button><button class="btn primary" id="add">${icon('plus', 14)} Lançamento</button></div></div>
    <section class="kpi-row">
      ${kpi('Entradas', `<span class="money-pos">${brl(sum.income)}</span>`)}
      ${kpi('Saídas', brl(sum.expense))}
      ${kpi('Saldo do mês', `<span style="color:${sum.balance >= 0 ? 'var(--ok)' : 'var(--danger)'}">${brl(sum.balance)}</span>`)}
      ${kpi('Assinaturas e fixos', `${brl(sum.subscriptions.monthly)}/mês`, `${brl(sum.subscriptions.yearly)} por ano · ${sum.subscriptions.count} ativa(s)`)}
      ${kpi('InDrive no mês', brl(sum.indrive?.net || 0), `${brl(sum.indrive?.in || 0)} entrou · <a href="#/garagem" style="color:var(--accent)">Garagem</a>`)}
    </section>
    <div class="cols-21">
      <section class="card"><div class="section-head"><h3>${icon('list', 14)} Lançamentos</h3><input class="input" id="filter" placeholder="Filtrar..." style="height:30px;max-width:200px"></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th style="text-align:right">Valor</th><th></th></tr></thead><tbody id="rows">
        ${list.map((m) => `<tr data-m="${m.id}" data-s="${esc(`${m.desc} ${m.category}`.toLowerCase())}"><td>${dmy(m.date)}</td><td>${esc(m.desc)}${m.source === 'csv' ? ' <span class="chip">extrato</span>' : ''}</td><td><span class="chip">${esc(m.category || 'Outros')}</span></td><td style="text-align:right;font-variant-numeric:tabular-nums" class="${m.amount > 0 ? 'money-pos' : 'money-neg'}">${brl(m.amount)}</td><td><button class="icon-btn sm ghost" data-edit>${icon('edit', 13)}</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nenhum lançamento neste mês. Use “Lançamento”, importe o extrato ou digite /gasto 50 mercado no chat.</td></tr>'}</tbody></table></div></section>
      <div class="stack">
        <section class="card"><div class="section-head"><h3>${icon('target', 14)} Orçamento por categoria</h3><button class="see-more" id="bud">${icon('edit', 12)} Definir</button></div>
          <div class="bars">${budgetCats.map((c) => { const spent = sum.byCat[c] || 0; const lim = sum.budgets[c]; const pct = lim ? Math.min(100, (spent / lim) * 100) : (spent / maxCat) * 100; return `<div class="budget-row ${lim && spent > lim ? 'over' : ''}"><span>${esc(c)}</span><div class="progress"><span style="width:${pct}%;background:${lim && spent > lim ? 'var(--danger)' : '#d4612a'}"></span></div><span class="v">${brl(spent)}${lim ? ` / ${brl(lim)}` : ''}</span></div>`; }).join('') || '<div class="empty-mini">Sem saídas no mês.</div>'}</div></section>
        <section class="card"><div class="section-head"><h3>${icon('calendar', 14)} Contas a pagar</h3><button class="see-more" id="addBill">${icon('plus', 12)} Conta</button></div>
          <div class="list">${sum.bills.map((b) => `<div class="row-item" data-b="${b.id}"><div class="grow"><b>${esc(b.name)}</b><small>${dmy(b.due)} · ${CYCLE[b.cycle || 'once']}${b.amount ? ` · ${brl(b.amount)}` : ''}</small></div><span class="chip ${b.late ? 'late' : b.days <= 3 ? 'medium' : ''}">${b.late ? 'atrasada' : b.days === 0 ? 'hoje' : `${b.days}d`}</span><button class="btn sm primary" data-pay>Pagar</button></div>`).join('') || '<div class="empty-mini">Nenhuma conta pendente. Avisos chegam alguns dias antes do vencimento.</div>'}</div>
          ${billsAll.some((b) => b.paid) ? `<small class="muted" style="display:block;margin-top:8px">${billsAll.filter((b) => b.paid).length} conta(s) única(s) já paga(s).</small>` : ''}</section>
      </div>
    </div>
    <section class="card" style="margin-top:var(--gap)"><div class="section-head"><h3>${icon('refresh', 14)} Assinaturas e gastos fixos</h3><button class="see-more" id="addSub">${icon('plus', 12)} Assinatura</button></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Ciclo</th><th style="text-align:right">Valor</th><th style="text-align:right">Por mês</th><th style="text-align:right">Por ano</th><th>Próxima cobrança</th><th>Ativa</th></tr></thead><tbody>
      ${subsAll.map((x) => { const next = sum.subscriptions.upcoming.find((u) => u.id === x.id)?.next; const mo = x.cycle === 'yearly' ? (x.amount || 0) / 12 : (x.amount || 0); return `<tr data-sub="${x.id}" style="${x.active === false ? 'opacity:.5' : ''}"><td><b>${esc(x.name)}</b> <small class="muted">${esc(x.category || '')}</small></td><td>${CYCLE[x.cycle] || 'Mensal'}</td><td style="text-align:right">${brl(x.amount)}</td><td style="text-align:right">${brl(mo)}</td><td style="text-align:right">${brl(mo * 12)}</td><td>${next ? dmy(next) : '—'}</td><td><label class="switch"><input type="checkbox" data-act ${x.active !== false ? 'checked' : ''}><span></span></label></td></tr>`; }).join('') || '<tr><td colspan="7" class="muted">Streaming, academia, celular, nuvem... Veja quanto custam por ano e receba aviso antes de cada cobrança.</td></tr>'}</tbody></table></div></section>`;

  const reload = () => draw(el);
  el.querySelector('#month').onchange = (e) => { month = e.target.value; reload(); };
  el.querySelector('#imp').onclick = () => importModal(reload);
  el.querySelector('#filter').oninput = (e) => { const q = e.target.value.toLowerCase(); el.querySelectorAll('#rows tr[data-m]').forEach((tr) => { tr.hidden = q && !tr.dataset.s.includes(q); }); };
  const moneyForm = (m = {}) => formModal({ title: m.id ? 'Editar lançamento' : 'Novo lançamento', fields: [
    { name: 'type', label: 'Tipo', type: 'select', value: m.amount > 0 ? 'in' : 'out', options: [['out', 'Saída (gasto)'], ['in', 'Entrada']] },
    { name: 'amount', label: 'Valor (R$)', value: m.amount ? Math.abs(m.amount) : '', inputmode: 'decimal' },
    { name: 'desc', label: 'Descrição', value: m.desc || '', full: true }, { name: 'date', label: 'Data', type: 'date', value: m.date || todayISO() },
    { name: 'category', label: 'Categoria', type: 'select', value: m.category || '', options: [['', 'Automática'], ...CATS.map((c) => [c, c])] },
    { name: 'account', label: 'Conta / cartão', value: m.account || '' }],
  onSubmit: (d) => {
    const v = Math.abs(Number(String(d.amount).replace(',', '.')));
    if (!v) throw new Error('Informe o valor');
    const body = { desc: d.desc || 'Lançamento', date: d.date, category: d.category, account: d.account, amount: d.type === 'in' ? v : -v };
    return m.id ? coll('money').update(m.id, body) : coll('money').add(body);
  }, onDelete: m.id ? () => coll('money').remove(m.id) : null }).then(reload);
  el.querySelector('#add').onclick = () => moneyForm();
  el.querySelectorAll('tr[data-m]').forEach((tr) => { tr.querySelector('[data-edit]').onclick = () => moneyForm(list.find((x) => x.id === tr.dataset.m)); });
  el.querySelector('#bud').onclick = () => {
    const text = [...new Set([...Object.keys(sum.budgets), ...CATS.filter((c) => c !== 'Receita').slice(0, 8)])].map((c) => `${c}: ${sum.budgets[c] || ''}`).join('\n');
    formModal({ title: 'Orçamento mensal', fields: [{ name: 'b', label: 'Limite por categoria (Categoria: valor). Deixe em branco para não limitar.', type: 'textarea', rows: 9, full: true, value: text }],
      onSubmit: (d) => api.put('/budgets', Object.fromEntries(d.b.split('\n').map((l) => l.split(':')).filter((p) => p.length === 2).map(([k, v]) => [k.trim(), v.trim()]))) }).then(reload);
  };
  // contas
  const billForm = (b = {}) => formModal({ title: b.id ? 'Editar conta' : 'Nova conta a pagar', fields: [
    { name: 'name', label: 'Conta', value: b.name || '', placeholder: 'Energia, aluguel, fatura...' }, { name: 'amount', label: 'Valor (R$)', value: b.amount ?? '', inputmode: 'decimal' },
    { name: 'due', label: 'Vencimento', type: 'date', value: b.due || '' }, { name: 'cycle', label: 'Repete', type: 'select', value: b.cycle || 'monthly', options: Object.entries(CYCLE) },
    { name: 'category', label: 'Categoria', type: 'select', value: b.category || 'Contas', options: CATS.map((c) => [c, c]) }, { name: 'notes', label: 'Notas', value: b.notes || '' }],
  onSubmit: (d) => (b.id ? coll('bills').update(b.id, d) : coll('bills').add(d)), onDelete: b.id ? () => coll('bills').remove(b.id) : null }).then(reload);
  el.querySelector('#addBill').onclick = () => billForm();
  el.querySelectorAll('[data-b]').forEach((row) => {
    const b = billsAll.find((x) => x.id === row.dataset.b);
    row.querySelector('.grow').onclick = () => billForm(b);
    row.querySelector('[data-pay]').onclick = async () => {
      if (!(await confirmDialog('Marcar como paga', `${b.name}${b.amount ? ` — ${brl(b.amount)}` : ''}. ${b.amount ? 'Uma saída será lançada hoje.' : ''}${b.cycle !== 'once' ? ' O próximo vencimento é criado sozinho.' : ''}`, 'Paguei'))) return;
      await api.post(`/bills/${b.id}/pay`); toast('Conta paga', b.name, 'success'); reload();
    };
  });
  // assinaturas
  const subForm = (x = {}) => formModal({ title: x.id ? 'Editar assinatura' : 'Nova assinatura / gasto fixo', fields: [
    { name: 'name', label: 'Nome', value: x.name || '', placeholder: 'Streaming, academia...' }, { name: 'amount', label: 'Valor da cobrança (R$)', value: x.amount ?? '', inputmode: 'decimal' },
    { name: 'cycle', label: 'Ciclo', type: 'select', value: x.cycle || 'monthly', options: [['monthly', 'Mensal'], ['yearly', 'Anual']] }, { name: 'nextCharge', label: 'Data de uma cobrança', type: 'date', value: x.nextCharge || '', hint: 'As próximas são calculadas sozinhas.' },
    { name: 'category', label: 'Categoria', type: 'select', value: x.category || 'Assinaturas', options: CATS.map((c) => [c, c]) }, { name: 'active', label: 'Ativa', type: 'checkbox', value: x.active !== false }],
  onSubmit: (d) => (x.id ? coll('subscriptions').update(x.id, d) : coll('subscriptions').add(d)), onDelete: x.id ? () => coll('subscriptions').remove(x.id) : null }).then(reload);
  el.querySelector('#addSub').onclick = () => subForm();
  el.querySelectorAll('tr[data-sub]').forEach((tr) => {
    const x = subsAll.find((s) => s.id === tr.dataset.sub);
    tr.querySelector('[data-act]').onchange = async (e) => { await coll('subscriptions').update(x.id, { active: e.target.checked }); reload(); };
    tr.querySelector('td').onclick = () => subForm(x);
    tr.querySelector('td').style.cursor = 'pointer';
  });
}

export default async function render(el) {
  await draw(el);
  return on('data-changed', () => draw(el));
}
