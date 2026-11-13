// IA que age no sistema: ferramentas (function calling do Gemini), permissões por personagem,
// confirmação de ações sensíveis, registro de tudo o que a IA fez e "desfazer".
import { db, id, now, save, localDate } from './db.js';
import { logEvent, emit } from './notify.js';
import { createTask, updateTask } from './routes/api.js';
import { addFinanceEntry } from './routes/pages.js';
import { guessCategory } from './routes/life.js';
import { indrivePage, streak } from './briefing.js';

export const AREAS = {
  tarefas: 'Tarefas', financeiro: 'Finanças pessoais (gastos, receitas, contas)', indrive: 'InDrive', agenda: 'Agenda',
  livros: 'Livros', habitos: 'Hábitos', notas: 'Notas e ideias', ingles: 'Cartões de inglês', memoria: 'Memória',
};
const FOCUS_AREAS = {
  geral: Object.keys(AREAS), financas: ['financeiro', 'memoria'], indrive: ['indrive', 'memoria'], tarefas: ['tarefas', 'agenda', 'notas', 'memoria'],
  estudos: ['livros', 'ingles', 'tarefas', 'memoria'], ingles: ['ingles', 'memoria'], habitos: ['habitos', 'memoria'],
};
// Áreas que um personagem pode alterar. O Niac (sem personagem) pode tudo.
export function areasOf(bot) {
  if (!bot) return Object.keys(AREAS);
  if (Array.isArray(bot.permissions)) return bot.permissions.filter((a) => AREAS[a]);
  return FOCUS_AREAS[bot.focus] || FOCUS_AREAS.geral;
}

// ---------- utilidades ----------
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const mine = (coll, uid) => db()[coll].filter((x) => x.userId === uid);
const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
const clone = (x) => JSON.parse(JSON.stringify(x));
const toNum = (v) => { const n = Number(String(v ?? '').replace(/[R$\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN; };
function addDays(date, n) { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + n); return localDate(d); }
function range(de, ate, fallbackDays = 30) {
  const to = isDate(ate) ? ate : localDate();
  const from = isDate(de) ? de : addDays(to, -fallbackDays + 1);
  return [from, to];
}
// Encontra um item pelo id ou por parte do texto; devolve erro claro se houver mais de um.
const STOP = new Set(['o', 'a', 'os', 'as', 'de', 'do', 'da', 'dos', 'das', 'com', 'pra', 'para', 'em', 'no', 'na', 'nos', 'nas', 'um', 'uma', 'e', 'meu', 'minha', 'que', 'ao']);
const tokens = (s) => norm(s).split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w));
function findOne(coll, uid, q, field, extra = () => true) {
  const list = mine(coll, uid).filter(extra);
  const byId = list.find((x) => x.id === q);
  if (byId) return { item: byId };
  const nq = norm(q);
  if (!nq) return { error: 'Informe qual item.' };
  const exact = list.filter((x) => norm(x[field]) === nq);
  if (exact.length === 1) return { item: exact[0] };
  const part = list.filter((x) => norm(x[field]).includes(nq) || nq.includes(norm(x[field])));
  if (part.length === 1) return { item: part[0] };
  // busca por palavras: "reunião com o cliente" encontra "Reunião com cliente"
  const qt = tokens(q);
  const scored = list.map((x) => { const tt = tokens(x[field]); const hit = qt.filter((w) => tt.some((t) => t.startsWith(w) || w.startsWith(t))).length; return { x, score: qt.length ? hit / qt.length : 0 }; })
    .filter((r) => r.score >= 0.6).sort((a, b) => b.score - a.score);
  if (scored.length === 1 || (scored.length > 1 && scored[0].score > scored[1].score)) return { item: scored[0].x };
  const cands = scored.length ? scored.map((r) => r.x) : part;
  if (!cands.length) return { error: `Não encontrei "${q}". Use a ferramenta consultar para ver os itens existentes.` };
  return { error: `Encontrei ${cands.length} itens parecidos, diga qual: ${cands.slice(0, 6).map((x) => `"${x[field]}" (id ${x.id})`).join('; ')}` };
}

// ---------- ferramentas ----------
const S = (type, description, extra = {}) => ({ type, description, ...extra });
const OBJ = (properties, required = []) => ({ type: 'OBJECT', properties, required });
const TIPOS_CONSULTA = ['tarefas', 'gastos_receitas', 'indrive', 'contas', 'assinaturas', 'agenda', 'habitos', 'livros', 'abastecimentos', 'turnos', 'notas', 'cartoes_ingles', 'memorias'];

const TOOLS = {
  consultar: {
    area: null,
    description: 'Busca dados do usuário no Codeniac. Use para responder perguntas sobre tarefas, finanças, InDrive, contas, agenda, hábitos, livros etc. Sempre consulte antes de afirmar números.',
    parameters: OBJ({
      tipo: S('STRING', 'O que buscar', { enum: TIPOS_CONSULTA }),
      de: S('STRING', 'Data inicial AAAA-MM-DD (opcional)'), ate: S('STRING', 'Data final AAAA-MM-DD (opcional)'),
      busca: S('STRING', 'Texto para filtrar (opcional)'), status: S('STRING', 'Filtro de status, ex.: abertas, concluidas, atrasadas, pendentes (opcional)'),
    }, ['tipo']),
    run(ctx, a) {
      const uid = ctx.user.id;
      const q = norm(a.busca);
      const has = (txt) => !q || norm(txt).includes(q);
      const today = localDate();
      const inRange = (d) => (!a.de || d >= a.de) && (!a.ate || d <= a.ate);
      let rows = [];
      switch (a.tipo) {
        case 'tarefas': {
          const projects = Object.fromEntries(mine('projects', uid).map((p) => [p.id, p.name]));
          rows = mine('tasks', uid).filter((t) => has(t.title))
            .filter((t) => (a.status === 'concluidas' ? t.status === 'done' : a.status === 'atrasadas' ? t.status !== 'done' && t.dueDate && t.dueDate < today : a.status === 'todas' ? true : t.status !== 'done'))
            .map((t) => ({ id: t.id, titulo: t.title, projeto: projects[t.projectId], status: t.status, prioridade: t.priority, prazo: t.dueDate, concluida_em: t.completedAt?.slice(0, 10), adiada: t.postponed || 0 }));
          break;
        }
        case 'gastos_receitas': rows = mine('money', uid).filter((m) => inRange(m.date) && has(`${m.desc} ${m.category}`)).map((m) => ({ id: m.id, data: m.date, descricao: m.desc, valor: m.amount, categoria: m.category })); break;
        case 'indrive': rows = mine('finance', uid).filter((f) => inRange(f.date) && has(`${f.category} ${f.description}`)).map((f) => ({ id: f.id, data: f.date, tipo: f.type === 'in' ? 'entrada' : 'saida', valor: f.amount, categoria: f.category, km: f.km, descricao: f.description, hora: new Date(f.createdAt).getHours() })); break;
        case 'contas': rows = mine('bills', uid).filter((b) => has(b.name) && (a.status === 'todas' || !b.paid)).map((b) => ({ id: b.id, nome: b.name, valor: b.amount, vencimento: b.due, repete: b.cycle, paga: b.paid, ultima_paga: b.lastPaid })); break;
        case 'assinaturas': rows = mine('subscriptions', uid).filter((x) => has(x.name)).map((x) => ({ id: x.id, nome: x.name, valor: x.amount, ciclo: x.cycle, ativa: x.active !== false, cobranca: x.nextCharge })); break;
        case 'agenda': rows = mine('agenda', uid).filter((x) => has(x.title) && inRange(x.date) && (a.status === 'todas' || (!x.done && (a.de || x.date >= today)))).map((x) => ({ id: x.id, titulo: x.title, data: x.date, hora: x.time, local: x.place, feito: x.done })); break;
        case 'habitos': rows = mine('habits', uid).map((h) => ({ id: h.id, nome: h.name, feito_hoje: h.days.includes(today), sequencia: streak(h.days), dias_ultimos_30: h.days.filter((d) => d >= addDays(today, -29)).length })); break;
        case 'livros': rows = mine('books', uid).filter((b) => has(`${b.title} ${b.author}`)).map((b) => ({ id: b.id, titulo: b.title, autor: b.author, status: b.status, pagina: b.current, paginas: b.pages, nota: b.rating })); break;
        case 'abastecimentos': rows = mine('fuel', uid).filter((f) => inRange(f.date)).map((f) => ({ data: f.date, litros: f.liters, preco: f.price, total: f.total, km: f.km })); break;
        case 'turnos': rows = mine('shifts', uid).filter((s) => inRange(s.start.slice(0, 10))).map((s) => ({ inicio: s.start, fim: s.end, km_inicial: s.startKm, km_final: s.endKm })); break;
        case 'notas': rows = mine('inbox', uid).filter((x) => has(x.text) && (a.status === 'todas' || !x.done)).map((x) => ({ id: x.id, texto: x.text, tipo: x.kind, data: x.createdAt.slice(0, 10) })); break;
        case 'cartoes_ingles': rows = mine('cards', uid).filter((c) => has(`${c.front} ${c.back}`)).map((c) => ({ frente: c.front, verso: c.back, revisao: c.due })); break;
        case 'memorias': rows = mine('memories', uid).map((m) => ({ id: m.id, fato: m.text })); break;
        default: return { error: 'Tipo desconhecido' };
      }
      const total = rows.length;
      const sum = rows.reduce((acc, r) => acc + (typeof r.valor === 'number' ? (r.tipo === 'saida' ? -r.valor : r.valor) : 0), 0);
      return { result: { total, ...(rows.some((r) => typeof r.valor === 'number') ? { soma_valores: Math.round(sum * 100) / 100 } : {}), itens: rows.slice(0, 60), ...(total > 60 ? { aviso: `mostrando 60 de ${total}` } : {}) } };
    },
  },
  estatisticas: {
    area: null,
    description: 'Calcula totais e agrupamentos de dinheiro. Use para perguntas como "quanto gastei com mercado nos últimos 3 meses" ou "qual dia da semana eu mais lucro no InDrive".',
    parameters: OBJ({
      fonte: S('STRING', 'financeiro = gastos/receitas pessoais; indrive = corridas e custos do carro', { enum: ['financeiro', 'indrive'] }),
      agrupar: S('STRING', 'Como agrupar', { enum: ['categoria', 'mes', 'dia_semana', 'hora', 'dia', 'nenhum'] }),
      de: S('STRING', 'Data inicial AAAA-MM-DD'), ate: S('STRING', 'Data final AAAA-MM-DD'), busca: S('STRING', 'Filtrar por descrição/categoria (opcional)'),
    }, ['fonte']),
    run(ctx, a) {
      const uid = ctx.user.id;
      const [from, to] = range(a.de, a.ate, 30);
      const q = norm(a.busca);
      const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
      const items = a.fonte === 'indrive'
        ? mine('finance', uid).filter((f) => f.date >= from && f.date <= to && (!q || norm(`${f.category} ${f.description}`).includes(q))).map((f) => ({ date: f.date, v: f.type === 'in' ? f.amount : -f.amount, cat: f.category, hour: new Date(f.createdAt).getHours(), km: f.km || 0 }))
        : mine('money', uid).filter((m) => m.date >= from && m.date <= to && (!q || norm(`${m.desc} ${m.category}`).includes(q))).map((m) => ({ date: m.date, v: m.amount, cat: m.category || 'Outros', hour: new Date(m.createdAt).getHours(), km: 0 }));
      const keyOf = { categoria: (i) => i.cat, mes: (i) => i.date.slice(0, 7), dia_semana: (i) => DIAS[new Date(`${i.date}T12:00:00`).getDay()], hora: (i) => `${String(i.hour).padStart(2, '0')}h`, dia: (i) => i.date, nenhum: () => 'total' }[a.agrupar || 'nenhum'] || (() => 'total');
      const groups = {};
      for (const i of items) {
        const g = (groups[keyOf(i)] ??= { entradas: 0, saidas: 0, saldo: 0, lancamentos: 0, km: 0, dias: new Set() });
        if (i.v > 0) g.entradas += i.v; else g.saidas -= i.v;
        g.saldo += i.v; g.lancamentos++; g.km += i.km; g.dias.add(i.date);
      }
      const out = Object.entries(groups).map(([k, g]) => ({ grupo: k, entradas: +g.entradas.toFixed(2), saidas: +g.saidas.toFixed(2), saldo: +g.saldo.toFixed(2), lancamentos: g.lancamentos, dias_com_lancamento: g.dias.size, ...(g.km ? { km: g.km } : {}) }))
        .sort((x, y) => y.saldo - x.saldo);
      return { result: { periodo: `${from} a ${to}`, fonte: a.fonte, grupos: out.slice(0, 40) } };
    },
  },
  criar_tarefa: {
    area: 'tarefas',
    description: 'Cria uma tarefa.',
    parameters: OBJ({ titulo: S('STRING', 'Título'), projeto: S('STRING', 'Nome do projeto (opcional)'), prioridade: S('STRING', 'Prioridade', { enum: ['alta', 'media', 'baixa'] }),
      prazo: S('STRING', 'AAAA-MM-DD (opcional)'), repetir: S('STRING', 'Repetição (opcional)', { enum: ['nao', 'diaria', 'semanal', 'mensal'] }), descricao: S('STRING', 'Detalhes (opcional)') }, ['titulo']),
    run(ctx, a) {
      const projects = mine('projects', ctx.user.id);
      const p = (a.projeto && projects.find((x) => norm(x.name).includes(norm(a.projeto)) || norm(a.projeto).includes(norm(x.name)))) || projects.find((x) => x.slug === 'trabalhos') || projects[0];
      const t = createTask(ctx.user.id, { projectId: p.id, title: a.titulo, description: a.descricao || '', priority: { alta: 'high', baixa: 'low' }[a.prioridade] || 'medium',
        dueDate: isDate(a.prazo) ? a.prazo : null, recurrence: { diaria: 'daily', semanal: 'weekly', mensal: 'monthly' }[a.repetir] || null });
      return { result: { ok: true, id: t.id }, summary: `Tarefa criada: ${t.title} (${p.name}${t.dueDate ? `, prazo ${t.dueDate.split('-').reverse().join('/')}` : ''})`, touched: [{ coll: 'tasks', id: t.id, before: null }] };
    },
  },
  alterar_tarefa: {
    area: 'tarefas',
    description: 'Altera uma tarefa: concluir, reabrir, mudar prazo, prioridade ou título.',
    parameters: OBJ({ tarefa: S('STRING', 'Id ou parte do título'), status: S('STRING', 'Novo status', { enum: ['a_fazer', 'fazendo', 'concluida'] }),
      prazo: S('STRING', 'Novo prazo AAAA-MM-DD ou "sem" para tirar'), prioridade: S('STRING', 'Nova prioridade', { enum: ['alta', 'media', 'baixa'] }), novo_titulo: S('STRING', 'Novo título') }, ['tarefa']),
    run(ctx, a) {
      const f = findOne('tasks', ctx.user.id, a.tarefa, 'title', a.status === 'concluida' ? (t) => t.status !== 'done' : () => true);
      if (f.error) return { error: f.error };
      const before = clone(f.item);
      const idsBefore = new Set(mine('tasks', ctx.user.id).map((t) => t.id));
      const body = {};
      if (a.status) body.status = { a_fazer: 'todo', fazendo: 'doing', concluida: 'done' }[a.status];
      if (a.prazo) body.dueDate = a.prazo === 'sem' ? null : a.prazo;
      if (a.prioridade) body.priority = { alta: 'high', media: 'medium', baixa: 'low' }[a.prioridade];
      if (a.novo_titulo) body.title = a.novo_titulo;
      const t = updateTask(ctx.user.id, f.item.id, body);
      const created = mine('tasks', ctx.user.id).filter((x) => !idsBefore.has(x.id)).map((x) => ({ coll: 'tasks', id: x.id, before: null }));
      const what = [body.status === 'done' && 'concluída', body.status && body.status !== 'done' && `status ${a.status.replace('_', ' ')}`, a.prazo && (a.prazo === 'sem' ? 'sem prazo' : `prazo ${a.prazo.split('-').reverse().join('/')}`), a.prioridade && `prioridade ${a.prioridade}`, a.novo_titulo && 'título novo'].filter(Boolean).join(', ');
      return { result: { ok: true }, summary: `Tarefa "${t.title}": ${what || 'atualizada'}`, touched: [{ coll: 'tasks', id: t.id, before }, ...created] };
    },
  },
  excluir_tarefa: {
    area: 'tarefas', sensitive: () => true,
    description: 'Exclui uma tarefa (pede confirmação ao usuário).',
    parameters: OBJ({ tarefa: S('STRING', 'Id ou parte do título') }, ['tarefa']),
    prepare(ctx, a) { const f = findOne('tasks', ctx.user.id, a.tarefa, 'title'); return f.error ? f : { label: `Excluir a tarefa "${f.item.title}"`, args: { tarefa: f.item.id } }; },
    run(ctx, a) {
      const f = findOne('tasks', ctx.user.id, a.tarefa, 'title');
      if (f.error) return { error: f.error };
      db().tasks = db().tasks.filter((t) => t !== f.item);
      save();
      return { result: { ok: true }, summary: `Tarefa excluída: ${f.item.title}`, touched: [{ coll: 'tasks', id: f.item.id, before: clone(f.item) }] };
    },
  },
  lancar_financeiro: {
    area: 'financeiro', sensitive: (a) => toNum(a.valor) >= 1000,
    description: 'Registra um gasto ou uma receita nas finanças pessoais (não é InDrive). Valores a partir de R$ 1.000 pedem confirmação.',
    parameters: OBJ({ tipo: S('STRING', 'gasto ou receita', { enum: ['gasto', 'receita'] }), valor: S('NUMBER', 'Valor em reais, positivo'), descricao: S('STRING', 'Descrição'),
      categoria: S('STRING', 'Categoria (opcional; deixe vazio para automática)'), data: S('STRING', 'AAAA-MM-DD (opcional, padrão hoje)') }, ['tipo', 'valor', 'descricao']),
    prepare: (ctx, a) => ({ label: `${a.tipo === 'receita' ? 'Registrar receita' : 'Registrar gasto'} de ${brl(toNum(a.valor))}: ${a.descricao}`, args: a }),
    run(ctx, a) {
      const v = Math.abs(toNum(a.valor));
      if (!v) return { error: 'Valor inválido' };
      const amount = a.tipo === 'receita' ? v : -v;
      const item = { id: id(), userId: ctx.user.id, date: isDate(a.data) ? a.data : localDate(), desc: String(a.descricao || 'Lançamento').slice(0, 160), amount,
        category: String(a.categoria || '').slice(0, 40) || guessCategory(a.descricao || '', amount), account: '', source: 'ia', createdAt: now(), updatedAt: now() };
      db().money.push(item);
      save();
      return { result: { ok: true, id: item.id, categoria: item.category }, summary: `${a.tipo === 'receita' ? 'Receita' : 'Gasto'} de ${brl(v)} — ${item.desc} (${item.category})`, touched: [{ coll: 'money', id: item.id, before: null }] };
    },
  },
  lancar_indrive: {
    area: 'indrive', sensitive: (a) => toNum(a.valor) >= 1000,
    description: 'Registra uma entrada (corrida, gorjeta, bônus) ou saída (combustível, manutenção, taxa) no controle do InDrive.',
    parameters: OBJ({ tipo: S('STRING', 'entrada ou saida', { enum: ['entrada', 'saida'] }), valor: S('NUMBER', 'Valor em reais'), categoria: S('STRING', 'Ex.: Corrida, Gorjeta, Combustível, Manutenção'),
      km: S('NUMBER', 'Km rodados (opcional)'), descricao: S('STRING', 'Descrição (opcional)'), data: S('STRING', 'AAAA-MM-DD (opcional)') }, ['tipo', 'valor']),
    prepare: (ctx, a) => ({ label: `Lançar ${a.tipo} de ${brl(toNum(a.valor))} no InDrive`, args: a }),
    run(ctx, a) {
      const page = indrivePage(ctx.user.id);
      if (!page) return { error: 'Página do InDrive não encontrada.' };
      const e = addFinanceEntry(ctx.user.id, page, { type: a.tipo === 'saida' ? 'out' : 'in', amount: Math.abs(toNum(a.valor)), category: a.categoria || (a.tipo === 'saida' ? 'Outros' : 'Corrida'),
        km: a.km ?? '', description: a.descricao || '', date: isDate(a.data) ? a.data : localDate() });
      return { result: { ok: true, id: e.id }, summary: `InDrive: ${a.tipo === 'saida' ? 'saída' : 'entrada'} de ${brl(e.amount)} (${e.category}${e.km ? `, ${e.km} km` : ''})`, touched: [{ coll: 'finance', id: e.id, before: null }] };
    },
  },
  excluir_lancamento: {
    area: 'financeiro', sensitive: () => true,
    description: 'Exclui um lançamento de gasto/receita ou do InDrive pelo id (pede confirmação).',
    parameters: OBJ({ fonte: S('STRING', 'financeiro ou indrive', { enum: ['financeiro', 'indrive'] }), id: S('STRING', 'Id do lançamento (consulte antes)') }, ['fonte', 'id']),
    prepare(ctx, a) {
      const coll = a.fonte === 'indrive' ? 'finance' : 'money';
      const it = mine(coll, ctx.user.id).find((x) => x.id === a.id);
      return it ? { label: `Excluir lançamento de ${brl(Math.abs(it.amount))} (${it.desc || it.category}) de ${it.date.split('-').reverse().join('/')}`, args: a } : { error: 'Lançamento não encontrado' };
    },
    run(ctx, a) {
      const coll = a.fonte === 'indrive' ? 'finance' : 'money';
      const it = mine(coll, ctx.user.id).find((x) => x.id === a.id);
      if (!it) return { error: 'Lançamento não encontrado' };
      db()[coll] = db()[coll].filter((x) => x !== it);
      save();
      return { result: { ok: true }, summary: `Lançamento excluído: ${brl(Math.abs(it.amount))} ${it.desc || it.category}`, touched: [{ coll, id: it.id, before: clone(it) }] };
    },
  },
  criar_conta: {
    area: 'financeiro',
    description: 'Cadastra uma conta a pagar (boleto, fatura, aluguel...) com vencimento.',
    parameters: OBJ({ nome: S('STRING', 'Nome'), valor: S('NUMBER', 'Valor (opcional)'), vencimento: S('STRING', 'AAAA-MM-DD'), repetir: S('STRING', 'Repetição', { enum: ['nao', 'mensal', 'anual'] }),
      categoria: S('STRING', 'Categoria (opcional)') }, ['nome', 'vencimento']),
    run(ctx, a) {
      if (!isDate(a.vencimento)) return { error: 'Vencimento inválido (use AAAA-MM-DD)' };
      const b = { id: id(), userId: ctx.user.id, name: String(a.nome).slice(0, 80), amount: Number.isFinite(toNum(a.valor)) ? Math.abs(toNum(a.valor)) : null, due: a.vencimento,
        cycle: { mensal: 'monthly', anual: 'yearly' }[a.repetir] || 'once', category: a.categoria || 'Contas', paid: false, notes: '', createdAt: now(), updatedAt: now() };
      db().bills.push(b);
      save();
      return { result: { ok: true, id: b.id }, summary: `Conta cadastrada: ${b.name}${b.amount ? ` ${brl(b.amount)}` : ''}, vence ${b.due.split('-').reverse().join('/')}`, touched: [{ coll: 'bills', id: b.id, before: null }] };
    },
  },
  pagar_conta: {
    area: 'financeiro', sensitive: () => true,
    description: 'Marca uma conta a pagar como paga e lança a saída no Financeiro (pede confirmação).',
    parameters: OBJ({ conta: S('STRING', 'Id ou nome da conta') }, ['conta']),
    prepare(ctx, a) { const f = findOne('bills', ctx.user.id, a.conta, 'name', (b) => !b.paid); return f.error ? f : { label: `Marcar "${f.item.name}"${f.item.amount ? ` (${brl(f.item.amount)})` : ''} como paga`, args: { conta: f.item.id } }; },
    run(ctx, a) {
      const f = findOne('bills', ctx.user.id, a.conta, 'name', (b) => !b.paid);
      if (f.error) return { error: f.error };
      const b = f.item;
      const before = clone(b);
      const touched = [{ coll: 'bills', id: b.id, before }];
      if (b.amount) {
        const m = { id: id(), userId: ctx.user.id, date: localDate(), desc: b.name, amount: -Math.abs(b.amount), category: b.category || 'Contas', account: '', source: 'conta', createdAt: now(), updatedAt: now() };
        db().money.push(m);
        touched.push({ coll: 'money', id: m.id, before: null });
      }
      if (!b.cycle || b.cycle === 'once') b.paid = true;
      else { const d = new Date(`${b.due}T12:00:00`); if (b.cycle === 'monthly') d.setMonth(d.getMonth() + 1); else d.setFullYear(d.getFullYear() + 1); b.due = localDate(d); }
      b.lastPaid = localDate();
      save();
      return { result: { ok: true, proximo_vencimento: b.paid ? null : b.due }, summary: `Conta paga: ${b.name}${b.amount ? ` (${brl(b.amount)})` : ''}`, touched };
    },
  },
  criar_compromisso: {
    area: 'agenda',
    description: 'Cria um compromisso na agenda.',
    parameters: OBJ({ titulo: S('STRING', 'O quê'), data: S('STRING', 'AAAA-MM-DD'), hora: S('STRING', 'HH:MM (opcional)'), local: S('STRING', 'Local (opcional)') }, ['titulo', 'data']),
    run(ctx, a) {
      if (!isDate(a.data)) return { error: 'Data inválida' };
      const it = { id: id(), userId: ctx.user.id, title: String(a.titulo).slice(0, 160), date: a.data, time: /^\d{2}:\d{2}$/.test(a.hora || '') ? a.hora : null, place: a.local || '', notes: '', done: false, createdAt: now(), updatedAt: now() };
      db().agenda.push(it);
      save();
      return { result: { ok: true, id: it.id }, summary: `Compromisso: ${it.title} em ${it.date.split('-').reverse().join('/')}${it.time ? ` às ${it.time}` : ''}`, touched: [{ coll: 'agenda', id: it.id, before: null }] };
    },
  },
  alterar_compromisso: {
    area: 'agenda',
    description: 'Muda data, hora ou título de um compromisso, ou marca como concluído.',
    parameters: OBJ({ compromisso: S('STRING', 'Id ou parte do título'), data: S('STRING', 'Nova data AAAA-MM-DD'), hora: S('STRING', 'Nova hora HH:MM'), titulo: S('STRING', 'Novo título'), concluido: S('BOOLEAN', 'Marcar como feito') }, ['compromisso']),
    run(ctx, a) {
      const f = findOne('agenda', ctx.user.id, a.compromisso, 'title', (x) => !x.done);
      if (f.error) return { error: f.error };
      const before = clone(f.item);
      if (isDate(a.data)) f.item.date = a.data;
      if (/^\d{2}:\d{2}$/.test(a.hora || '')) f.item.time = a.hora;
      if (a.titulo) f.item.title = String(a.titulo).slice(0, 160);
      if (a.concluido === true) f.item.done = true;
      f.item.updatedAt = now();
      save();
      return { result: { ok: true }, summary: `Compromisso "${f.item.title}": ${a.concluido ? 'concluído' : `${f.item.date.split('-').reverse().join('/')}${f.item.time ? ` às ${f.item.time}` : ''}`}`, touched: [{ coll: 'agenda', id: f.item.id, before }] };
    },
  },
  atualizar_livro: {
    area: 'livros',
    description: 'Atualiza um livro da estante: página atual, status (quero, lendo, lido) ou nota de 1 a 5.',
    parameters: OBJ({ livro: S('STRING', 'Id ou parte do título'), pagina_atual: S('NUMBER', 'Página atual'), status: S('STRING', 'Status', { enum: ['quero', 'lendo', 'lido'] }), nota: S('NUMBER', 'Nota de 1 a 5') }, ['livro']),
    run(ctx, a) {
      const f = findOne('books', ctx.user.id, a.livro, 'title');
      if (f.error) return { error: f.error };
      const b = f.item;
      const before = clone(b);
      if (Number.isFinite(Number(a.pagina_atual))) b.current = Math.max(0, Math.round(Number(a.pagina_atual)));
      if (a.status) { b.status = a.status; if (a.status === 'lendo' && !b.startedAt) b.startedAt = localDate(); if (a.status === 'lido' && !b.finishedAt) b.finishedAt = localDate(); }
      if (b.pages && b.current >= b.pages && b.status !== 'lido') { b.status = 'lido'; b.finishedAt = localDate(); }
      if (Number(a.nota) >= 1 && Number(a.nota) <= 5) b.rating = Math.round(Number(a.nota));
      b.updatedAt = now();
      save();
      return { result: { ok: true, status: b.status, pagina: b.current, paginas: b.pages }, summary: `Livro "${b.title}": ${b.status === 'lido' ? 'lido!' : `página ${b.current || 0}${b.pages ? ` de ${b.pages}` : ''}`}`, touched: [{ coll: 'books', id: b.id, before }] };
    },
  },
  marcar_habito: {
    area: 'habitos',
    description: 'Marca um hábito como feito no dia (ou desmarca).',
    parameters: OBJ({ habito: S('STRING', 'Nome do hábito'), data: S('STRING', 'AAAA-MM-DD (opcional, padrão hoje)'), desmarcar: S('BOOLEAN', 'true para desmarcar') }, ['habito']),
    run(ctx, a) {
      const f = findOne('habits', ctx.user.id, a.habito, 'name');
      if (f.error) return { error: f.error };
      const h = f.item;
      const before = clone(h);
      const date = isDate(a.data) ? a.data : localDate();
      h.days = a.desmarcar ? h.days.filter((d) => d !== date) : [...new Set([...h.days, date])];
      save();
      return { result: { ok: true, sequencia: streak(h.days) }, summary: `Hábito "${h.name}" ${a.desmarcar ? 'desmarcado' : 'feito'} (sequência ${streak(h.days)})`, touched: [{ coll: 'habits', id: h.id, before }] };
    },
  },
  criar_nota: {
    area: 'notas',
    description: 'Guarda uma nota, ideia ou link na caixa de entrada.',
    parameters: OBJ({ texto: S('STRING', 'Conteúdo'), tipo: S('STRING', 'Tipo', { enum: ['nota', 'ideia', 'link'] }) }, ['texto']),
    run(ctx, a) {
      const it = { id: id(), userId: ctx.user.id, text: String(a.texto).slice(0, 2000), kind: a.tipo || 'nota', url: (String(a.texto).match(/https?:\/\/\S+/) || [''])[0], done: false, createdAt: now(), updatedAt: now() };
      db().inbox.push(it);
      save();
      return { result: { ok: true }, summary: `Nota guardada: ${it.text.slice(0, 60)}`, touched: [{ coll: 'inbox', id: it.id, before: null }] };
    },
  },
  criar_cartao_ingles: {
    area: 'ingles',
    description: 'Cria um flashcard de inglês (entra na revisão espaçada). Use quando ensinar uma palavra ou expressão nova útil, ou quando o usuário pedir.',
    parameters: OBJ({ frente: S('STRING', 'Palavra/frase em inglês'), verso: S('STRING', 'Significado em português'), exemplo: S('STRING', 'Frase de exemplo em inglês (opcional)') }, ['frente', 'verso']),
    run(ctx, a) {
      const exists = mine('cards', ctx.user.id).find((c) => norm(c.front) === norm(a.frente));
      if (exists) return { result: { ok: true, ja_existia: true } };
      const c = { id: id(), userId: ctx.user.id, deck: 'Vocabulário', front: String(a.frente).slice(0, 600), back: String(a.verso).slice(0, 600), example: String(a.exemplo || '').slice(0, 600),
        ease: 2.5, interval: 0, reps: 0, lapses: 0, due: localDate(), createdAt: now(), updatedAt: now() };
      db().cards.push(c);
      save();
      return { result: { ok: true }, summary: `Cartão de inglês: ${c.front} = ${c.back}`, touched: [{ coll: 'cards', id: c.id, before: null }] };
    },
  },
  guardar_memoria: {
    area: 'memoria',
    description: 'SALVA na memória permanente um fato duradouro sobre o usuário (meta, preferência, gosto, pessoa importante, rotina, trabalho). Chame SEMPRE que ele contar algo assim ou pedir para lembrar/guardar — uma chamada por fato. Não salve coisas passageiras.',
    parameters: OBJ({ fato: S('STRING', 'O fato, numa frase curta em terceira pessoa. Ex.: "Quer trocar de carro em 2027"') }, ['fato']),
    run(ctx, a) {
      const text = String(a.fato || '').trim().slice(0, 300);
      if (!text) return { error: 'Fato vazio' };
      if (mine('memories', ctx.user.id).some((m) => norm(m.text) === norm(text))) return { result: { ok: true, ja_existia: true } };
      const m = { id: id(), userId: ctx.user.id, text, botId: ctx.bot?.id || null, source: 'ia', createdAt: now() };
      db().memories.push(m);
      save();
      return { result: { ok: true }, summary: `Memória guardada: ${text}`, touched: [{ coll: 'memories', id: m.id, before: null }] };
    },
  },
  apagar_memoria: {
    area: 'memoria',
    description: 'Apaga uma memória guardada quando o usuário pedir ou quando ela não for mais verdade.',
    parameters: OBJ({ memoria: S('STRING', 'Id ou parte do texto da memória') }, ['memoria']),
    run(ctx, a) {
      const f = findOne('memories', ctx.user.id, a.memoria, 'text');
      if (f.error) return { error: f.error };
      db().memories = db().memories.filter((m) => m !== f.item);
      save();
      return { result: { ok: true }, summary: `Memória apagada: ${f.item.text}`, touched: [{ coll: 'memories', id: f.item.id, before: clone(f.item) }] };
    },
  },
};

export function toolDeclarations(bot) {
  const areas = areasOf(bot);
  return Object.entries(TOOLS).filter(([, t]) => !t.area || areas.includes(t.area))
    .map(([name, t]) => ({ name, description: t.description, parameters: t.parameters }));
}

export function memoriesBlock(user) {
  const list = mine('memories', user.id).slice(-40);
  return list.length ? `\n<memorias_do_usuario>\n${list.map((m) => `- ${m.text}`).join('\n')}\n</memorias_do_usuario>\nUse essas memórias com naturalidade (sem citar que estão guardadas).` : '';
}

// ---------- execução, confirmação e desfazer ----------
function record(user, ctx, name, args, extra) {
  const a = { id: id(), userId: user.id, conversationId: ctx.conv?.id || null, botId: ctx.bot?.id || null, tool: name, args, at: now(), ...extra };
  db().aiActions.push(a);
  if (db().aiActions.length > 5000) db().aiActions.splice(0, db().aiActions.length - 5000);
  save();
  return a;
}

// Chamado pelo laço da IA. ctx = { user, conv, bot, write }
export function callTool(ctx, name, args = {}) {
  const t = TOOLS[name];
  if (!t) return { error: `Ferramenta desconhecida: ${name}` };
  if (t.area && !areasOf(ctx.bot).includes(t.area)) return { error: `Sem permissão: este personagem não pode alterar ${AREAS[t.area]}.` };
  try {
    if (t.sensitive?.(args) && !ctx.confirmed) {
      const prep = t.prepare ? t.prepare(ctx, args) : { label: name, args };
      if (prep.error) return { error: prep.error };
      const a = record(ctx.user, ctx, name, prep.args, { status: 'pending', summary: prep.label });
      ctx.write?.({ type: 'confirm', id: a.id, summary: prep.label });
      ctx.actions?.push({ id: a.id, summary: prep.label, kind: 'confirm' });
      return { result: { status: 'aguardando_confirmacao', mensagem: 'Pedi confirmação ao usuário com um botão. Avise que é só confirmar ali; não diga que já foi feito.' } };
    }
    const r = t.run(ctx, args);
    if (r.error) return { error: r.error };
    if (r.summary) {
      const a = record(ctx.user, ctx, name, args, { status: 'done', summary: r.summary, touched: r.touched || [] });
      ctx.write?.({ type: 'action', id: a.id, summary: r.summary, undoable: Boolean(r.touched?.length) });
      ctx.actions?.push({ id: a.id, summary: r.summary, kind: 'action' });
      logEvent(ctx.user.id, 'system', 'ai', `IA${ctx.bot ? ` (${ctx.bot.name})` : ''}: ${r.summary}`, { link: '#/assistente' });
      emit(ctx.user.id, 'data', { kind: 'ai' });
    }
    return { result: r.result };
  } catch (err) {
    return { error: err.message || 'Falhou' };
  }
}

export function confirmAction(user, actionId, accept) {
  const a = db().aiActions.find((x) => x.id === actionId && x.userId === user.id);
  if (!a) throw new Error('Ação não encontrada');
  if (a.status !== 'pending') throw new Error('Esta ação já foi resolvida');
  if (!accept) { a.status = 'canceled'; save(); return a; }
  const bot = a.botId ? db().bots.find((b) => b.id === a.botId) : null;
  const t = TOOLS[a.tool];
  const r = t.run({ user, bot, confirmed: true }, a.args);
  if (r.error) { a.status = 'failed'; a.error = r.error; save(); throw new Error(r.error); }
  Object.assign(a, { status: 'done', summary: r.summary || a.summary, touched: r.touched || [], doneAt: now() });
  save();
  logEvent(user.id, 'system', 'ai', `IA (confirmado): ${a.summary}`, { link: '#/assistente' });
  emit(user.id, 'data', { kind: 'ai' });
  return a;
}

export function undoAction(user, actionId) {
  const a = db().aiActions.find((x) => x.id === actionId && x.userId === user.id);
  if (!a || a.status !== 'done') throw new Error('Nada para desfazer');
  for (const t of [...(a.touched || [])].reverse()) {
    const list = db()[t.coll];
    const i = list.findIndex((x) => x.id === t.id);
    if (t.before === null) { if (i >= 0) list.splice(i, 1); }
    else if (i >= 0) list[i] = t.before;
    else list.push(t.before);
  }
  a.status = 'undone';
  a.undoneAt = now();
  save();
  logEvent(user.id, 'system', 'ai', `Desfeito: ${a.summary}`, { link: '#/assistente' });
  emit(user.id, 'data', { kind: 'ai' });
  return a;
}

export function actionStatuses(user, ids) {
  const set = new Set(ids);
  return Object.fromEntries(db().aiActions.filter((a) => a.userId === user.id && set.has(a.id)).map((a) => [a.id, a.status]));
}
