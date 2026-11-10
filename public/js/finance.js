// Controle financeiro do InDrive (bloco "finance" dentro de uma página): entradas, saídas, gráfico e categorias.
import { api } from './api.js';
import { icon } from './icons.js';
import { esc, dmy, brl, todayISO, formModal, toast, confirmDialog } from './ui.js';

const CATS = { in: ['Corrida', 'Gorjeta', 'Bônus', 'Outros'], out: ['Combustível', 'Manutenção', 'Taxa do app', 'Alimentação', 'Lavagem', 'Seguro', 'Outros'] };
const COLORS = { in: '#3b8fe8', out: '#d4612a' };
const PERIODS = [['7', '7 dias'], ['30', '30 dias'], ['month', 'Mês'], ['year', 'Ano'], ['all', 'Tudo']];

export function mountFinance(box, pageId) {
  let period = '30';
  let entries = [];
  const range = () => {
    const t = todayISO();
    if (period === 'all') return ['0000-01-01', t];
    if (period === 'month') return [`${t.slice(0, 8)}01`, t];
    if (period === 'year') return [`${t.slice(0, 4)}-01-01`, t];
    return [todayISO(-(Number(period) - 1)), t];
  };
  const entryForm = (type, e = {}) => formModal({
    title: e.id ? 'Editar lançamento' : type === 'in' ? 'Nova entrada' : 'Nova saída',
    fields: [
      { name: 'type', label: 'Tipo', type: 'select', value: e.type || type, options: [['in', 'Entrada'], ['out', 'Saída']] },
      { name: 'amount', label: 'Valor (R$)', value: e.amount ?? '', inputmode: 'decimal', placeholder: '0,00' },
      { name: 'category', label: 'Categoria', type: 'select', value: e.category || (type === 'in' ? 'Corrida' : 'Combustível'), options: [...new Set([...CATS.in, ...CATS.out])].map((c) => [c, c]) },
      { name: 'date', label: 'Data', type: 'date', value: e.date || todayISO() },
      { name: 'km', label: 'Km rodados (opcional)', value: e.km ?? '', inputmode: 'decimal' },
      { name: 'description', label: 'Descrição', value: e.description || '' },
    ],
    onSubmit: (d) => (e.id ? api.put(`/finance/${e.id}`, d) : api.post('/finance', { ...d, pageId })),
    onDelete: e.id ? async () => { if (await confirmDialog('Excluir lançamento', `${brl(e.amount)} — ${e.category}`)) await api.del(`/finance/${e.id}`); } : null,
  }).then(load);

  function chart(list, from, to) {
    const days = [];
    const start = new Date(`${from === '0000-01-01' ? (list.at(-1)?.date || to) : from}T12:00:00`);
    const end = new Date(`${to}T12:00:00`);
    const span = Math.round((end - start) / 86400000) + 1;
    const byMonth = span > 62;
    const key = (d) => (byMonth ? d.slice(0, 7) : d);
    const map = new Map();
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + (byMonth ? 28 : 1))) { const k = key(d.toISOString().slice(0, 10)); if (!map.has(k)) map.set(k, { in: 0, out: 0 }); }
    for (const e of list) { const k = key(e.date); if (!map.has(k)) map.set(k, { in: 0, out: 0 }); map.get(k)[e.type] += e.amount; }
    for (const [k, v] of [...map].sort()) days.push({ k, ...v });
    const max = Math.max(1, ...days.map((d) => Math.max(d.in, d.out)));
    const W = 600; const H = 170; const pad = 26; const bw = (W - pad) / days.length;
    const y = (v) => H - 18 - (v / max) * (H - 30);
    const label = (k) => (byMonth ? new Date(`${k}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'short' }) : k.slice(8, 10));
    const every = Math.ceil(days.length / 10);
    return `<svg class="fin-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Entradas e saídas por ${byMonth ? 'mês' : 'dia'}">
      ${[0.5, 1].map((f) => `<line class="grid" x1="${pad}" x2="${W}" y1="${y(max * f)}" y2="${y(max * f)}"/><text class="axis" x="0" y="${y(max * f) + 3}">${Math.round(max * f)}</text>`).join('')}
      <line class="grid" x1="${pad}" x2="${W}" y1="${H - 18}" y2="${H - 18}"/>
      ${days.map((d, i) => { const x = pad + i * bw; const w = Math.max(2, bw / 2 - 2); return `<g class="grp" data-i="${i}"><rect class="hit" x="${x}" y="0" width="${bw}" height="${H - 18}"/>
        <rect x="${x + 1}" y="${y(d.in)}" width="${w}" height="${H - 18 - y(d.in)}" rx="2" fill="${COLORS.in}"/><rect x="${x + 2 + w}" y="${y(d.out)}" width="${w}" height="${H - 18 - y(d.out)}" rx="2" fill="${COLORS.out}"/>
        ${i % every === 0 ? `<text class="axis" x="${x + bw / 2}" y="${H - 4}" text-anchor="middle">${label(d.k)}</text>` : ''}</g>`; }).join('')}</svg><div class="fin-tip" hidden></div>
      <script type="application/json">${JSON.stringify(days.map((d) => ({ ...d, label: byMonth ? label(d.k) : dmy(d.k) })))}</script>`;
  }

  function paint() {
    const [from, to] = range();
    const list = entries.filter((e) => e.date >= from && e.date <= to);
    const sum = (t) => list.filter((e) => e.type === t).reduce((a, e) => a + e.amount, 0);
    const km = list.reduce((a, e) => a + (e.km || 0), 0);
    const inV = sum('in'); const outV = sum('out');
    const cats = {};
    for (const e of list.filter((x) => x.type === 'out')) cats[e.category] = (cats[e.category] || 0) + e.amount;
    const catMax = Math.max(1, ...Object.values(cats));
    box.innerHTML = `<div class="fin"><div class="fin-head"><span class="fin-title">${icon('wallet', 16)} <b>Financeiro do InDrive</b></span>
        <div class="seg fin-periods">${PERIODS.map(([k, l]) => `<button type="button" data-p="${k}" class="${k === period ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="fin-actions"><a class="btn sm outline" href="#/garagem?from=${esc(pageId)}" title="Turno, carro, manutenção e custo por km">${icon('car', 12)} Garagem</a><button type="button" class="btn sm fin-in" data-add="in">${icon('plus', 12)} Entrada</button><button type="button" class="btn sm fin-out" data-add="out">${icon('minus', 12)} Saída</button></div></div>
      <div class="fin-kpis"><div class="card fin-kpi"><span>Entradas</span><b style="color:${COLORS.in}">${brl(inV)}</b><small>${list.filter((e) => e.type === 'in').length} lançamento(s)</small></div>
        <div class="card fin-kpi"><span>Saídas</span><b style="color:${COLORS.out}">${brl(outV)}</b><small>${list.filter((e) => e.type === 'out').length} lançamento(s)</small></div>
        <div class="card fin-kpi"><span>Saldo</span><b style="color:${inV - outV >= 0 ? 'var(--ok)' : 'var(--danger)'}">${brl(inV - outV)}</b><small>${inV ? `margem de ${Math.round(((inV - outV) / inV) * 100)}%` : '—'}</small></div>
        <div class="card fin-kpi"><span>Km rodados</span><b>${km.toLocaleString('pt-BR')}</b><small>${km ? `${brl((inV - outV) / km)} líquido por km` : 'informe km nas corridas'}</small></div></div>
      <div class="fin-grid"><div class="card"><div class="fin-sub"><b>Entradas × saídas</b><span class="legend"><i style="background:${COLORS.in}"></i>Entradas<i style="background:${COLORS.out}"></i>Saídas</span></div><div class="fin-chart">${list.length ? chart(list, from, to) : '<div class="empty-mini">Sem lançamentos no período.</div>'}</div></div>
        <div class="card fin-cats"><div class="fin-sub"><b>Gastos por categoria</b></div><div class="bars">${Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<div class="bar-row"><span>${esc(c)}</span><div class="progress"><span style="width:${(v / catMax) * 100}%;background:${COLORS.out}"></span></div><span class="v">${brl(v)}</span></div>`).join('') || '<div class="empty-mini">Nenhuma saída.</div>'}</div></div></div>
      <div class="card fin-list-card"><div class="fin-sub"><b>Lançamentos</b><small class="muted">dica: no chat, digite <code>/corrida 35 12km</code> ou <code>/despesa 50 combustível</code></small></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Km</th><th style="text-align:right">Valor</th><th></th></tr></thead><tbody>
        ${list.slice(0, 50).map((e) => `<tr data-e="${e.id}"><td>${dmy(e.date)}</td><td><span class="chip" style="background:${e.type === 'in' ? 'rgba(59,143,232,.15)' : 'rgba(212,97,42,.15)'}">${esc(e.category)}</span></td><td>${esc(e.description || '')}</td><td>${e.km ?? '—'}</td><td style="text-align:right;font-variant-numeric:tabular-nums;color:${e.type === 'in' ? COLORS.in : 'var(--text)'}">${e.type === 'in' ? '+' : '−'} ${brl(e.amount)}</td><td><button type="button" class="icon-btn sm ghost" data-edit>${icon('edit', 13)}</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nenhum lançamento.</td></tr>'}</tbody></table></div></div></div>`;
    box.querySelectorAll('[data-p]').forEach((b) => { b.onclick = () => { period = b.dataset.p; paint(); }; });
    box.querySelectorAll('[data-add]').forEach((b) => { b.onclick = () => entryForm(b.dataset.add); });
    box.querySelectorAll('tr[data-e]').forEach((tr) => { tr.querySelector('[data-edit]').onclick = () => entryForm(null, entries.find((x) => x.id === tr.dataset.e)); });
    // tooltip
    const data = JSON.parse(box.querySelector('.fin-chart script')?.textContent || '[]');
    const tip = box.querySelector('.fin-tip');
    box.querySelectorAll('.grp').forEach((g) => {
      g.addEventListener('mouseenter', () => {
        const d = data[Number(g.dataset.i)];
        g.classList.add('hover');
        tip.hidden = false;
        tip.innerHTML = `<b>${esc(d.label)}</b><div><i style="background:${COLORS.in}"></i>Entradas<span>${brl(d.in)}</span></div><div><i style="background:${COLORS.out}"></i>Saídas<span>${brl(d.out)}</span></div><div class="t-total">Saldo<span>${brl(d.in - d.out)}</span></div>`;
        const r = g.getBoundingClientRect(); const pr = box.querySelector('.fin-chart').getBoundingClientRect();
        const z = Number(getComputedStyle(document.body).zoom) || 1;
        tip.style.left = `${Math.min((r.left - pr.left) / z + 8, pr.width / z - 150)}px`; tip.style.top = '6px';
      });
      g.addEventListener('mouseleave', () => { g.classList.remove('hover'); tip.hidden = true; });
    });
  }
  async function load() {
    try { entries = await api.get(`/finance?pageId=${pageId}`); paint(); } catch (e) { box.innerHTML = `<div class="empty-mini">${esc(e.message)}</div>`; }
  }
  load();
  return { reload: load, toast };
}
