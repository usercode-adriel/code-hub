// Garagem: turno do InDrive, "vale a pena essa corrida?", custo por km, mapa de melhores horários,
// abastecimentos, manutenção por km/data, documentos e reservas.
import { api, coll } from '../api.js';
import { on } from '../store.js';
import { icon } from '../icons.js';
import { esc, dmy, brl, toast, todayISO, formModal, confirmDialog } from '../ui.js';
import { kpi } from '../components.js';

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const SLOTS = ['0–4h', '4–8h', '8–12h', '12–16h', '16–20h', '20–24h'];
const num = (v, d = 1) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d }));
const hm = (h) => `${Math.floor(h)}h${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
let clockTimer = null;

async function draw(el) {
  const [sum, shifts, fuel] = await Promise.all([api.get('/garage/summary'), api.get('/shifts'), coll('fuel').list()]);
  const g = sum.garage || {};
  const running = shifts.find((x) => x.running);
  const done = shifts.filter((x) => !x.running);
  const maxHeat = Math.max(1, ...sum.heat.flat());
  const periods = ['madrugada', 'manhã', 'tarde', 'noite'].map((p) => ({ p, ...(sum.periods[p] || { hours: 0, net: 0, count: 0 }) }));
  const bestPeriod = periods.filter((x) => x.hours > 0).sort((a, b) => b.net / b.hours - a.net / a.hours)[0];

  el.innerHTML = `
    <div class="page-head"><div><h1>Garagem</h1><p>Carro, turnos e lucro real do InDrive${g.model ? ` · ${esc(g.model)}` : ''}${g.km ? ` · ${Number(g.km).toLocaleString('pt-BR')} km` : ''}</p></div>
      <div style="display:flex;gap:8px"><a class="btn outline" href="#/project/trabalhos">${icon('wallet', 14)} Lançamentos do InDrive</a><button class="btn outline" id="carBtn">${icon('car', 14)} Dados do carro</button></div></div>
    <section class="card shift-card ${running ? 'running' : ''}">
      <div><small class="muted">${running ? `Turno em andamento · ${running.period}` : 'Nenhum turno em andamento'}</small><div class="clock" id="clock">${running ? hm(running.hours) : '0h00'}</div></div>
      <div class="grow">${running ? `<div class="tag-row" style="font-size:12px"><span>Bruto <b>${brl(running.gross)}</b></span><span>Custos <b>${brl(running.costs)}</b></span><span>Líquido <b>${brl(running.net)}</b></span><span><b>${brl(running.perHour)}</b>/h</span><span>${running.rides} corrida(s)</span></div><small class="muted">Registre corridas no chat: <code>/corrida 35 12km</code></small>`
        : `<small class="muted">Ao iniciar, o Codeniac soma as corridas e gastos lançados até você encerrar, e calcula o valor por hora.</small>`}</div>
      ${running ? `<button class="btn danger" id="stop">${icon('pause', 14)} Encerrar turno</button>` : `<button class="btn primary" id="start">${icon('play', 14)} Iniciar turno</button>`}
    </section>
    <section class="kpi-row">
      ${kpi('Hoje (InDrive)', brl(sum.today.net), `${brl(sum.today.in)} entrou${g.dailyGoal ? ` · meta ${brl(g.dailyGoal)}` : ''}`)}
      ${kpi('No mês', brl(sum.month?.net || 0), `${brl(sum.month?.in || 0)} de entradas${g.monthlyGoal ? ` · meta ${brl(g.monthlyGoal)}` : ''}`)}
      ${kpi('Custo por km', sum.costPerKm ? brl(sum.costPerKm) : '—', sum.fuelPerKm ? `combustível ${brl(sum.fuelPerKm)} + outros ${brl(sum.otherPerKm || 0)}` : 'registre abastecimentos com km')}
      ${kpi('Consumo médio', sum.consumption ? `${num(sum.consumption)} km/l` : '—', sum.fuelPrice ? `litro a ${brl(sum.fuelPrice)}` : '')}
      ${kpi('Combustível no mês', brl(sum.fuelMonth), `${fuel.filter((f) => f.date.startsWith(todayISO().slice(0, 7))).length} abastecimento(s)`)}
    </section>
    <div class="cols-2">
      <section class="card"><div class="section-head"><h3>${icon('scale', 14)} Vale a pena essa corrida?</h3></div>
        <form class="form" id="calc"><div class="form-row"><div class="field"><label>Valor oferecido (R$)</label><input name="v" inputmode="decimal" placeholder="18,50"></div><div class="field"><label>Km até o passageiro</label><input name="k1" inputmode="decimal" placeholder="2"></div>
          <div class="field"><label>Km da corrida</label><input name="k2" inputmode="decimal" placeholder="7"></div><div class="field"><label>Minutos estimados</label><input name="m" inputmode="numeric" placeholder="20"></div></div></form>
        <div class="calc-out" id="calcOut">Preencha os campos para ver o lucro real.${sum.costPerKm ? '' : '<br><small class="muted">Dica: informe consumo e preço do combustível em “Dados do carro” para um cálculo mais preciso.</small>'}</div></section>
      <section class="card"><div class="section-head"><h3>${icon('activity', 14)} Melhores horários</h3><small class="muted">soma das entradas por dia e faixa</small></div>
        <div class="heat"><span></span>${SLOTS.map((x) => `<span class="h">${x}</span>`).join('')}${sum.heat.map((row, d) => `<span class="d">${DAYS[d]}</span>${row.map((v, s) => `<span class="c" title="${DAYS[d]} ${SLOTS[s]}: ${brl(v)}" style="background:color-mix(in srgb, #3b8fe8 ${v ? Math.round(15 + (v / maxHeat) * 85) : 0}%, rgba(127,127,127,.12))">${v ? Math.round(v) : ''}</span>`).join('')}`).join('')}</div>
        <div class="bars" style="margin-top:14px">${periods.map((x) => `<div class="bar-row"><span>${x.p[0].toUpperCase()}${x.p.slice(1)}</span><div class="progress"><span style="width:${x.hours ? Math.min(100, (x.net / x.hours) / Math.max(...periods.map((y) => (y.hours ? y.net / y.hours : 0)), 1) * 100) : 0}%"></span></div><span class="v">${x.hours ? `${brl(x.net / x.hours)}/h` : '—'}</span></div>`).join('')}</div>
        <small class="muted" style="display:block;margin-top:8px">${bestPeriod ? `Seu melhor período até agora: <b>${bestPeriod.p}</b> (${brl(bestPeriod.net / bestPeriod.hours)}/h em ${bestPeriod.count} turno(s)).` : 'Use “Iniciar turno” para comparar manhã, tarde e noite.'}</small></section>
    </div>
    <div class="cols-3" style="margin-top:var(--gap)">
      <section class="card"><div class="section-head"><h3>${icon('wrench', 14)} Manutenção</h3><button class="see-more" id="addSvc">${icon('plus', 12)} Item</button></div>
        <div class="list">${sum.services.map((sv) => `<div class="row-item" data-sv="${sv.id}"><div class="grow"><b>${esc(sv.name)}</b><small style="color:${sv.late ? 'var(--danger)' : sv.soon ? 'var(--warn)' : 'var(--muted)'}">${esc(sv.label.replace(sv.name, '').trim() || 'configure km ou dias')}</small></div><div class="acts"><button class="btn sm outline" data-did>Feito</button><button class="icon-btn sm ghost" data-edit>${icon('edit', 13)}</button></div></div>`).join('') || '<div class="empty-mini">Ex.: troca de óleo a cada 10.000 km, pneus, alinhamento.</div>'}</div></section>
      <section class="card"><div class="section-head"><h3>${icon('note', 14)} Documentos</h3><button class="see-more" id="addDoc">${icon('plus', 12)} Documento</button></div>
        <div class="list">${sum.docs.map((x) => `<div class="row-item" data-doc="${x.id}"><div class="grow"><b>${esc(x.name)}</b><small>vence ${dmy(x.due)}</small></div><span class="chip ${x.days < 0 ? 'late' : x.days <= 30 ? 'medium' : 'ok'}">${x.days < 0 ? 'vencido' : x.days === 0 ? 'hoje' : `${x.days} dias`}</span></div>`).join('') || '<div class="empty-mini">CNH, licenciamento, IPVA, seguro... avisos em 30, 7 e 1 dia.</div>'}</div></section>
      <section class="card"><div class="section-head"><h3>${icon('shield', 14)} Reservas</h3><button class="see-more" id="editRes">${icon('edit', 12)} Ajustar</button></div>
        <div class="list">${sum.reserves.map((r) => `<div class="row-item"><div class="grow"><b>${esc(r.name)} · ${r.pct}%</b><small>Total acumulado ${brl(r.total)}</small></div><b>${brl(r.month)}</b></div>`).join('')}</div>
        <small class="muted" style="display:block;margin-top:8px">Quanto separar das entradas do mês para cada objetivo.</small></section>
    </div>
    <div class="cols-2" style="margin-top:var(--gap)">
      <section class="card"><div class="section-head"><h3>${icon('fuel', 14)} Abastecimentos</h3><button class="see-more" id="addFuel">${icon('plus', 12)} Abastecer</button></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Litros</th><th>R$/l</th><th>Total</th><th>Km</th><th></th></tr></thead><tbody>
        ${fuel.slice(0, 10).map((f) => `<tr data-f="${f.id}"><td>${dmy(f.date)}</td><td>${num(f.liters, 2)}${f.full ? ' <span class="chip">cheio</span>' : ''}</td><td>${f.price ? brl(f.price) : '—'}</td><td>${brl(f.total || (f.liters || 0) * (f.price || 0))}</td><td>${f.km ? Number(f.km).toLocaleString('pt-BR') : '—'}</td><td><button class="icon-btn sm ghost" data-edit>${icon('edit', 13)}</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nenhum abastecimento. Registre com km e “tanque cheio” para calcular o consumo.</td></tr>'}</tbody></table></div></section>
      <section class="card"><div class="section-head"><h3>${icon('clock', 14)} Turnos recentes</h3></div>
        <div class="table-wrap"><table class="table"><thead><tr><th>Início</th><th>Período</th><th>Duração</th><th>Líquido</th><th>R$/h</th></tr></thead><tbody>
        ${done.slice(0, 10).map((x) => `<tr><td>${new Date(x.start).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td><td>${x.period}</td><td>${hm(x.hours)}</td><td>${brl(x.net)}</td><td><b>${brl(x.perHour)}</b></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Nenhum turno encerrado ainda.</td></tr>'}</tbody></table></div></section>
    </div>`;

  const reload = () => draw(el);
  // turno
  clearInterval(clockTimer);
  if (running) {
    const start = new Date(running.start).getTime();
    clockTimer = setInterval(() => { const c = el.querySelector('#clock'); if (!c) return clearInterval(clockTimer); c.textContent = hm((Date.now() - start) / 3600000); }, 30000);
    el.querySelector('#stop').onclick = () => formModal({ title: 'Encerrar turno', fields: [{ name: 'km', label: 'Km do painel agora (opcional)', inputmode: 'decimal', value: '' }], submit: 'Encerrar',
      onSubmit: async (d) => { const r = await api.post(`/shifts/${running.id}/stop`, d); toast('Turno encerrado', `${brl(r.net)} em ${hm(r.hours)} — ${brl(r.perHour)}/h`, 'success'); } }).then(reload);
  } else {
    el.querySelector('#start').onclick = () => formModal({ title: 'Iniciar turno', fields: [{ name: 'km', label: 'Km do painel (opcional)', inputmode: 'decimal', value: g.km || '' }], submit: 'Iniciar',
      onSubmit: async (d) => { await api.post('/shifts/start', d); toast('Turno iniciado', 'Boa sorte nas corridas! 🚗', 'success'); } }).then(reload);
  }
  // calculadora
  const out = el.querySelector('#calcOut');
  el.querySelector('#calc').oninput = (e) => {
    const f = e.currentTarget;
    const n = (x) => Number(String(f[x].value).replace(',', '.')) || 0;
    const v = n('v'); const km = n('k1') + n('k2'); const min = n('m');
    if (!v || !km) { out.innerHTML = 'Preencha ao menos o valor e os km.'; return; }
    const cpk = sum.costPerKm || (g.consumption && g.fuelPrice ? g.fuelPrice / g.consumption : 0.6);
    const cost = km * cpk; const profit = v - cost; const perKm = profit / km; const perHour = min ? profit / (min / 60) : null;
    const good = perKm >= 1 && profit / v >= 0.5;
    out.innerHTML = `Custo estimado: <b>${brl(cost)}</b> (${num(km)} km × ${brl(cpk)}/km${sum.costPerKm ? '' : ', estimativa'})<br>
      Lucro: <b class="${profit > 0 ? 'good' : 'bad'}">${brl(profit)}</b> · ${brl(perKm)} por km rodado${perHour != null ? ` · <b>${brl(perHour)}/h</b>` : ''}<br>
      ${good ? '<b class="good">✔ Vale a pena</b> — sobra mais da metade do valor.' : profit > 0 ? '<b class="bad">⚠ Margem apertada</b> — só aceite se estiver perto ou indo para uma região boa.' : '<b class="bad">✖ Prejuízo</b> — o custo do carro supera o valor.'}`;
  };
  // carro e reservas
  el.querySelector('#carBtn').onclick = () => formModal({ title: 'Dados do carro', fields: [
    { name: 'model', label: 'Modelo', value: g.model || '', full: true }, { name: 'km', label: 'Km atual', value: g.km ?? '', inputmode: 'decimal' },
    { name: 'consumption', label: 'Consumo médio (km/l)', value: g.consumption ?? '', inputmode: 'decimal', hint: 'Usado até haver abastecimentos suficientes.' },
    { name: 'fuelPrice', label: 'Preço do litro (R$)', value: g.fuelPrice ?? '', inputmode: 'decimal' }, { name: 'dailyGoal', label: 'Meta diária (R$)', value: g.dailyGoal ?? '', inputmode: 'decimal' },
    { name: 'monthlyGoal', label: 'Meta mensal (R$)', value: g.monthlyGoal ?? '', inputmode: 'decimal' }],
  onSubmit: (d) => api.put('/garage', d) }).then(reload);
  el.querySelector('#editRes').onclick = () => {
    const res = g.reserves || { Manutenção: 10, IPVA: 5, Reserva: 5 };
    const text = Object.entries(res).map(([k, v]) => `${k}: ${v}`).join('\n');
    formModal({ title: 'Reservas (% das entradas)', fields: [{ name: 'r', label: 'Uma por linha, no formato  Nome: porcentagem', type: 'textarea', rows: 5, full: true, value: text }],
      onSubmit: (d) => {
        const reserves = Object.fromEntries(d.r.split('\n').map((l) => l.split(':')).filter((p) => p.length === 2 && p[0].trim()).map(([k, v]) => [k.trim(), Number(v.replace(',', '.').replace('%', '')) || 0]));
        return api.put('/garage', { reserves });
      } }).then(reload);
  };
  // manutenção
  const svcForm = (sv = {}) => formModal({ title: sv.id ? 'Editar manutenção' : 'Nova manutenção', fields: [
    { name: 'name', label: 'Item', value: sv.name || '', full: true, placeholder: 'Troca de óleo' }, { name: 'everyKm', label: 'A cada (km)', value: sv.everyKm ?? '', inputmode: 'decimal' },
    { name: 'everyDays', label: 'Ou a cada (dias)', value: sv.everyDays ?? '', inputmode: 'numeric' }, { name: 'lastKm', label: 'Última vez com (km)', value: sv.lastKm ?? g.km ?? '', inputmode: 'decimal' },
    { name: 'lastDate', label: 'Última vez em', type: 'date', value: sv.lastDate || todayISO() }, { name: 'notes', label: 'Notas', value: sv.notes || '', full: true }],
  onSubmit: (d) => (sv.id ? coll('services').update(sv.id, d) : coll('services').add(d)), onDelete: sv.id ? () => coll('services').remove(sv.id) : null }).then(reload);
  el.querySelector('#addSvc').onclick = () => svcForm();
  el.querySelectorAll('[data-sv]').forEach((row) => {
    const sv = sum.services.find((x) => x.id === row.dataset.sv);
    row.querySelector('[data-edit]').onclick = () => svcForm(sv);
    row.querySelector('[data-did]').onclick = async () => { await coll('services').update(sv.id, { lastKm: g.km ?? sv.lastKm, lastDate: todayISO() }); toast('Manutenção registrada', sv.name, 'success'); reload(); };
  });
  // documentos
  const docForm = (x = {}) => formModal({ title: x.id ? 'Editar documento' : 'Novo documento', fields: [{ name: 'name', label: 'Documento', value: x.name || '', placeholder: 'Licenciamento' }, { name: 'due', label: 'Vencimento', type: 'date', value: x.due || '' }, { name: 'notes', label: 'Notas', value: x.notes || '', full: true }],
    onSubmit: (d) => (x.id ? coll('docs').update(x.id, d) : coll('docs').add(d)), onDelete: x.id ? () => coll('docs').remove(x.id) : null }).then(reload);
  el.querySelector('#addDoc').onclick = () => docForm();
  el.querySelectorAll('[data-doc]').forEach((row) => { row.onclick = () => docForm(sum.docs.find((x) => x.id === row.dataset.doc)); });
  // abastecimentos
  const fuelForm = (f = {}) => formModal({ title: f.id ? 'Editar abastecimento' : 'Novo abastecimento', fields: [
    { name: 'date', label: 'Data', type: 'date', value: f.date || todayISO() }, { name: 'liters', label: 'Litros', value: f.liters ?? '', inputmode: 'decimal' },
    { name: 'price', label: 'Preço do litro (R$)', value: f.price ?? g.fuelPrice ?? '', inputmode: 'decimal' }, { name: 'total', label: 'Total pago (R$)', value: f.total ?? '', inputmode: 'decimal', hint: 'Se vazio, litros × preço.' },
    { name: 'km', label: 'Km do painel', value: f.km ?? g.km ?? '', inputmode: 'decimal' }, { name: 'station', label: 'Posto', value: f.station || '' }, { name: 'full', label: 'Tanque cheio?', type: 'checkbox', value: f.full ?? true }],
  onSubmit: async (d) => {
    if (!d.total && d.liters && d.price) d.total = (Number(String(d.liters).replace(',', '.')) * Number(String(d.price).replace(',', '.'))).toFixed(2);
    const r = f.id ? await coll('fuel').update(f.id, d) : await coll('fuel').add(d);
    if (d.km && (!g.km || Number(String(d.km).replace(',', '.')) > g.km)) await api.put('/garage', { km: d.km });
    return r;
  }, onDelete: f.id ? () => coll('fuel').remove(f.id) : null }).then(reload);
  el.querySelector('#addFuel').onclick = () => fuelForm();
  el.querySelectorAll('[data-f]').forEach((row) => { row.querySelector('[data-edit]').onclick = () => fuelForm(fuel.find((x) => x.id === row.dataset.f)); });
}

export default async function render(el) {
  await draw(el);
  const off = on('data-changed', () => draw(el));
  return () => { off(); clearInterval(clockTimer); };
}
