// ECONOMY — moeda Nexus (NXC), empresas, bolsa, banco, imóveis, empregos, loja e inflação.
// Regras simuladas e consistentes (não números soltos):
//   receita da empresa = demanda do setor × fatia de mercado (reputação, equipe, marketing, ânimo do mercado) + vendas diretas;
//   custos = salários + aluguel do bairro + marketing + imposto (definido pela política);
//   preço da ação persegue o valor da empresa (lucro médio e caixa) com pequena oscilação;
//   inflação reage ao crédito e aos impostos; leis e descobertas científicas mudam a demanda dos setores.
import { onHourly, onDaily, onGenesis, onEvent, handle, record, schedule } from './core.js';
import { registerAction, people, residents, personById, agentOf, active, isWorking, bump, bumpUser, userName, rel } from './agents.js';
import { account, credit, debit, addXp, outstanding } from './bank.js';
import { worldPost, remember, genderize } from '../social.js';
import { rnd, pick, chance, clamp, uid, nowIso, DAY, HOUR, gauss, cap, round2, shuffle, slug } from './util.js';

export const SECTORS = {
  tecnologia: { label: 'Tecnologia', demand: 11000, cat: 'tecnologia', roles: ['desenvolvedor(a)', 'designer', 'analista de dados', 'gerente de produto'], products: ['app', 'assistente de IA', 'óculos inteligente', 'plataforma em nuvem', 'smartwatch'] },
  varejo: { label: 'Varejo e e-commerce', demand: 12000, cat: 'economia', roles: ['vendedor(a)', 'atendente', 'gerente de loja', 'estoquista'], products: ['tênis neon', 'fone sem fio', 'jaqueta térmica', 'mochila urbana', 'luminária RGB'] },
  midia: { label: 'Mídia e notícias', demand: 9000, cat: 'entretenimento', roles: ['jornalista', 'editor(a)', 'fotógrafo(a)', 'apresentador(a)'], products: [] },
  alimentacao: { label: 'Alimentação', demand: 10000, cat: 'economia', roles: ['cozinheiro(a)', 'garçom/garçonete', 'gerente', 'entregador(a)'], products: ['combo do dia', 'café especial', 'hambúrguer da casa', 'marmita fit'] },
  financas: { label: 'Finanças', demand: 9000, cat: 'economia', roles: ['analista financeiro(a)', 'gerente de contas', 'economista'], products: [] },
  entretenimento: { label: 'Entretenimento', demand: 7000, cat: 'entretenimento', roles: ['produtor(a)', 'ator/atriz', 'músico(a)', 'roteirista'], products: ['ingresso de cinema', 'álbum digital', 'passe de show'] },
  saude: { label: 'Saúde', demand: 9000, cat: 'sociedade', roles: ['enfermeiro(a)', 'médico(a)', 'recepcionista'], products: ['consulta', 'check-up'] },
  publicidade: { label: 'Publicidade', demand: 5000, cat: 'economia', roles: ['publicitário(a)', 'designer', 'redator(a)'], products: [] },
  pesquisa: { label: 'Pesquisa e ciência', demand: 5000, cat: 'ciencia', roles: ['pesquisador(a)', 'cientista', 'técnico(a) de laboratório'], products: [] },
  submundo: { label: 'Submundo', demand: 2500, cat: 'seguranca', roles: ['vendedor(a)', 'olheiro(a)'], products: [] },
  construcao: { label: 'Construção e imóveis', demand: 9000, cat: 'economia', roles: ['engenheiro(a)', 'corretor(a)', 'mestre de obras'], products: [] },
};
const SALARY = { gerente: 520, 'gerente de produto': 560, 'gerente de loja': 380, 'gerente de contas': 450, economista: 500, 'médico(a)': 700, 'desenvolvedor(a)': 480, 'analista de dados': 450, 'analista financeiro(a)': 430, 'pesquisador(a)': 420, 'cientista': 520, 'engenheiro(a)': 520, 'apresentador(a)': 480, 'editor(a)': 380, jornalista: 320, CEO: 900 };
const salaryFor = (role) => SALARY[role] || 220 + rnd(120);

// Empresas da gênese (marcadas como "da gênese" na história)
const GENESIS = [
  ['Mundo Agora', 'midia', 'mundoagora.nx', 'noticias', '#ef4444', 'O portal de notícias da Codeniac Society'],
  ['TechVision', 'tecnologia', 'techvision.nx', 'tech', '#06b6d4', 'Tecnologia e inovação'],
  ['NovaTech', 'tecnologia', 'novatech.nx', 'empresa', '#8b5cf6', 'Software para a cidade inteligente'],
  ['CryptoDaily', 'midia', 'cryptodaily.nx', 'cripto', '#f59e0b', 'Criptomoedas, ações e mercado'],
  ['Empregos BR', 'publicidade', 'empregosbr.nx', 'empregos', '#22c55e', 'Vagas de emprego na cidade'],
  ['Vitrine Digital', 'varejo', 'vitrine.nx', 'loja', '#ec4899', 'O shopping on-line da Codeniac Society'],
  ['Fórum Central', 'midia', 'forumcentral.nx', 'forum', '#3b82f6', 'Discussões públicas e comunidades'],
  ['Diário Urbano', 'midia', 'diariourbano.nx', 'blog', '#14b8a6', 'Blogs pessoais dos moradores'],
  ['Banco Nexus', 'financas', 'banconexus.nx', 'empresa', '#0ea5e9', 'Seu dinheiro em Nexus'],
  ['Grupo Nexus de Comunicação', 'midia', 'gruponexus.nx', 'tv', '#a855f7', 'TV, rádio e entretenimento'],
  ['Estúdio Aurora', 'entretenimento', 'aurora.nx', 'empresa', '#f97316', 'Filmes e séries'],
  ['Sabor da Vila', 'alimentacao', 'sabordavila.nx', 'empresa', '#84cc16', 'Comida boa no bairro'],
  ['Clínica Vida+', 'saude', 'vidamais.nx', 'empresa', '#10b981', 'Saúde perto de você'],
  ['Construtora Horizonte', 'construcao', 'horizonte.nx', 'empresa', '#eab308', 'Construindo a cidade'],
  ['Instituto Quantum', 'pesquisa', 'quantum.nx', 'empresa', '#6366f1', 'Pesquisa e descobertas'],
  ['Agência Pulso', 'publicidade', 'pulso.nx', 'empresa', '#e11d48', 'Publicidade e marketing'],
];
const NAME_A = ['Nova', 'Hyper', 'Quantum', 'Pixel', 'Aurora', 'Vértice', 'Órbita', 'Prisma', 'Nexo', 'Lume', 'Atlas', 'Zênite', 'Faro', 'Brisa', 'Ícone'];
const NAME_B = { tecnologia: ['Tech', 'Labs', 'Systems', 'AI'], varejo: ['Store', 'Market', 'Shop'], alimentacao: ['Café', 'Cozinha', 'Burger', 'Sabores'], midia: ['News', 'Mídia', 'Press'], entretenimento: ['Studios', 'Produções', 'Play'], saude: ['Saúde', 'Care'], publicidade: ['Ads', 'Criativa'], pesquisa: ['Lab', 'Ciência'], construcao: ['Obras', 'Engenharia'], financas: ['Invest', 'Capital'] };

// ---------------------------------------------------------------- estado
export function eco(w) {
  w.eco ??= { cpi: 1, inflation: 0.4, baseRate: 0.0015, taxRate: 0.12, index: 1000, indexHistory: [], demandMult: {}, crimeMult: 1, housingMult: 1, eduDiscount: 0, monthDay: 0, lastMonth: null, loansOut: 0 };
  w.companies ??= [];
  w.properties ??= [];
  return w.eco;
}
export const companies = (w) => (w.companies ??= []);
export const companyById = (w, id) => companies(w).find((c) => c.id === id);
const live = (c) => c.status !== 'falida';
export const priceNow = (w, base) => round2(base * eco(w).cpi);

function makeCompany(ctx, { name, sector, founderId, districtId, domain = null, siteKind = 'empresa', color = null, slogan = '', cash = 30000, origin = null }) {
  const w = ctx.w;
  const c = {
    id: uid(), name, ticker: `${name.replace(/[^A-Za-zÀ-ú]/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 4).toUpperCase()}3`, sector, founderId, ceoId: founderId, districtId,
    foundedAt: ctx.at.toISOString(), status: 'ativa', employees: [], openings: [], applicants: [], cash, revenueDay: 0, profitDay: 0, profitHistory: [], salesToday: 0, productivity: 0,
    shares: 10000, price: 0, priceHistory: [], sentiment: 0, reputation: 50 + rnd(20), marketing: 200 + rnd(400), products: [], color: color || pick(['#06b6d4', '#8b5cf6', '#f59e0b', '#22c55e', '#ec4899', '#ef4444', '#3b82f6']),
    slogan, domain: domain || `${slug(name).replace(/-/g, '')}.nx`, siteKind, negDays: 0, origin: origin || (ctx.live ? 'vivo' : 'recuperado'),
  };
  c.price = round2(Math.max(5, (c.cash * 0.6 + 1500 * 120) / c.shares));
  c.priceHistory.push({ t: ctx.at.toISOString(), v: c.price });
  for (const prod of (SECTORS[sector].products || []).slice(0, 2 + rnd(2))) c.products.push({ id: uid(), name: `${prod} ${name.split(' ')[0]}`, price: Math.round(30 + Math.random() * 400), launchedAt: c.foundedAt });
  companies(w).push(c);
  return c;
}

export function hire(ctx, c, p, role = null, salary = null, { silent = false } = {}) {
  const a = agentOf(ctx.w, p);
  if (a.companyId && a.companyId !== c.id) leaveJob(ctx, p, 'mudou de emprego', true);
  const raw = role || pick(SECTORS[c.sector].roles);
  role = genderize(p, raw);
  const pay = Math.round((salary || salaryFor(raw)) * eco(ctx.w).cpi);
  c.employees = c.employees.filter((e) => e.personaId !== p.id);
  c.employees.push({ personaId: p.id, role, salary: pay, since: ctx.at.toISOString() });
  Object.assign(a, { companyId: c.id, role, salary: pay });
  p.job = `${role} na ${c.name}`;
  for (const e of c.employees) { const q = personById(ctx.w, e.personaId); if (q && q.id !== p.id) { rel(p, q.id).colleague = true; rel(q, p.id).colleague = true; } }
  if (!silent) {
    record(ctx, { type: 'contratacao', cat: 'economia', title: `${p.name} foi contratado(a) pela ${c.name}`.replace('contratado(a)', genderize(p, 'contratada(o)')), text: `Cargo: ${role}.`, actors: [p.id], refs: [{ t: 'company', id: c.id }], importance: 1 });
    if (chance(0.5)) worldPost(ctx, p, genderize(p, pick([`Novo emprego! Agora sou ${role} na ${c.name} 🎉`, `Primeiro dia na ${c.name} amanhã. Nervosa(o) e feliz!`])));
  }
}
export function leaveJob(ctx, p, reason = 'demissão', quiet = false) {
  const a = agentOf(ctx.w, p);
  const c = companyById(ctx.w, a.companyId);
  if (c) c.employees = c.employees.filter((e) => e.personaId !== p.id);
  Object.assign(a, { companyId: null, role: null, salary: 0 });
  p.job = p.job?.replace(/ na .*/, '') ? `${p.job.replace(/ na .*/, '')} (procurando emprego)` : 'procurando emprego';
  if (!quiet && c) {
    const fired = reason === 'demissão';
    const ev = record(ctx, { type: fired ? 'demissao' : 'pediu-demissao', cat: 'economia', title: fired ? `${p.name} foi demitido(a) da ${c.name}`.replace('demitido(a)', genderize(p, 'demitida(o)')) : `${p.name} pediu demissão da ${c.name}`, text: reason, actors: [p.id], refs: [{ t: 'company', id: c.id }], importance: fired ? 2 : 1 });
    remember(p, fired ? `Fui demitida(o) da ${c.name}.` : `Pedi demissão da ${c.name}.`, ev.at);
    p.mood = fired ? { emotion: 'triste', intensity: 0.85, reason: 'perdeu o emprego' } : { emotion: 'animada', intensity: 0.6, reason: 'recomeço' };
    if (fired) { p.problem = genderize(p, 'precisa achar um emprego novo rápido'); if (chance(0.6)) worldPost(ctx, p, genderize(p, pick(['Fui desligada(o) hoje. Ainda não caiu a ficha.', 'Desempregada(o) a partir de hoje. Aceito indicações 🙏']))); }
  }
}

// ---------------------------------------------------------------- gênese
onGenesis((ctx) => {
  const w = ctx.w;
  eco(w);
  account(w);
  const pool = shuffle(residents(w));
  for (const [name, sector, domain, kind, color, slogan] of GENESIS) {
    const founder = pool.find((p) => !p.agent.companyId && p.age >= 25) || pool[0];
    const c = makeCompany(ctx, { name, sector, founderId: founder.id, districtId: pick(w.city.districts).id, domain, siteKind: kind, color, slogan, cash: 25000 + rnd(40000), origin: 'genese' });
    hire(ctx, c, founder, 'CEO', 900, { silent: true });
    founder.agent.cash += 15000;
  }
  // os demais moradores: maioria empregada, conforme a profissão de origem
  const MATCH = [[/jornal|fotógraf|youtuber|streamer/, 'midia'], [/desenvolv|dados|designer|gamer/, 'tecnologia'], [/vend|loja|atendente/, 'varejo'], [/cozinh|confeit|barista|garç/, 'alimentacao'], [/enfermeir|veterin|psicól|médic/, 'saude'], [/engenh|pedreir|mecânic/, 'construcao'], [/biólog|estudante de medicina/, 'pesquisa'], [/músic|tatuad/, 'entretenimento'], [/advog|analista/, 'financas']];
  for (const p of pool) {
    if (p.agent.companyId || !chance(0.78)) continue;
    const sector = (MATCH.find(([re]) => re.test(p.job || '')) || [null, pick(Object.keys(SECTORS))])[1];
    const options = companies(w).filter((c) => c.sector === sector && c.employees.length < 9);
    const c = pick(options.length ? options : companies(w).filter((x) => x.employees.length < 9));
    if (c) hire(ctx, c, p, null, null, { silent: true });
  }
  for (const c of companies(w)) { c.price = valuePerShare(w, c); c.priceHistory = [{ t: ctx.at.toISOString(), v: c.price }]; }
  // imóveis por bairro
  const KINDS = [['apartamento', 80000], ['casa', 150000], ['escritorio', 120000], ['terreno', 60000]];
  for (const d of w.city.districts) {
    for (let i = 0; i < 5; i++) {
      const [kind, base] = pick(KINDS);
      w.properties.push({ id: uid(), districtId: d.id, kind, name: `${{ apartamento: 'Apto', casa: 'Casa', escritorio: 'Sala comercial', terreno: 'Terreno' }[kind]} ${d.name} ${100 + rnd(900)}`, base: Math.round(base * d.value * (0.8 + Math.random() * 0.4)), ownerType: 'cidade', ownerId: null, origin: 'genese' });
    }
  }
  updateIndex(w, ctx.at);
});

// ---------------------------------------------------------------- valor e bolsa
function valuePerShare(w, c) {
  const hist = c.profitHistory.slice(-10);
  const avg = hist.length ? hist.reduce((s, x) => s + x, 0) / hist.length : 1200;
  const v = (Math.max(0, avg) * 120 + Math.max(0, c.cash) * 0.5) / c.shares;
  return round2(Math.max(0.5, v * (1 + clamp(c.sentiment, -1, 1) * 0.35)));
}
function updateIndex(w, at) {
  const e = eco(w);
  const list = companies(w).filter(live);
  if (!list.length) return;
  e.indexBase ??= list.reduce((s, c) => s + c.price, 0) / list.length;
  e.index = round2((list.reduce((s, c) => s + c.price, 0) / list.length / e.indexBase) * 1000);
  e.indexHistory.push({ t: at.toISOString(), v: e.index });
  cap(e.indexHistory, 24 * 14);
}
onHourly((ctx) => {
  const w = ctx.w;
  for (const c of companies(w).filter(live)) {
    const target = valuePerShare(w, c);
    const vol = c.sector === 'tecnologia' ? 0.009 : 0.005;
    c.price = round2(Math.max(0.5, c.price + (target - c.price) * 0.07 + c.price * gauss(0, vol) + c.price * c.sentiment * 0.002));
    c.priceHistory.push({ t: ctx.at.toISOString(), v: c.price });
    cap(c.priceHistory, 24 * 14);
  }
  updateIndex(w, ctx.at);
});

// ---------------------------------------------------------------- dia das empresas
onDaily((ctx) => {
  const w = ctx.w; const e = eco(w);
  const active = companies(w).filter(live);
  // participação de mercado por setor
  const weight = (c) => (c.reputation / 100) * (1 + (c.marketing + (c.adBoostUntil > ctx.at.toISOString() ? 1500 : 0)) / 2000) * Math.sqrt(c.productivity + 0.5 + c.employees.length * 0.3) * (1 + c.sentiment * 0.2);
  const bySector = {};
  for (const c of active) (bySector[c.sector] ??= []).push(c);
  for (const [sector, list] of Object.entries(bySector)) {
    const total = list.reduce((s, c) => s + weight(c), 0) || 1;
    // choque do setor: oscila em torno de 1 e às vezes despenca ou dispara
    e.shock ??= {};
    let sh = e.shock[sector] ?? 1;
    sh = clamp(1 + (sh - 1) * 0.85 + gauss(0, 0.04), 0.55, 1.5);
    if (chance(0.015)) {
      const up = chance(0.5); sh = clamp(sh * (up ? 1.25 : 0.75), 0.55, 1.5);
      record(ctx, { type: up ? 'setor-alta' : 'setor-baixa', cat: 'economia', title: `${SECTORS[sector].label}: ${up ? 'demanda dispara na cidade' : 'consumo despenca e acende alerta'}`, text: `Empresas afetadas: ${list.map((c) => c.name).join(', ')}.`, refs: list.map((c) => ({ t: 'company', id: c.id })), importance: 3 });
    }
    e.shock[sector] = sh;
    const demand = SECTORS[sector].demand * sh * (e.demandMult[sector] || 1) * e.cpi * Math.pow(Math.min(e.index, 3000) / 1000, 0.15);
    for (const c of list) {
      const open = c.openDays ?? 99;
      // a empresa só entrega o que a equipe consegue produzir: demanda acima disso vira vaga aberta
      const capacity = c.employees.reduce((s, x) => s + (x.personaId === 'me' ? 1 : (personById(w, x.personaId)?.agent?.skill || 1)), 0) * 520 * e.cpi + c.productivity * 40;
      const potential = Math.max(0, demand * (weight(c) / total) * gauss(1, 0.1));
      c.unmet = Math.round(Math.max(0, potential - capacity));
      const revenue = Math.min(potential, capacity) + c.salesToday;
      const payroll = c.employees.reduce((s, x) => s + x.salary, 0);
      const rent = Math.round(150 * (cityDistrict(w, c.districtId)?.value || 1) * e.cpi);
      const tax = Math.max(0, revenue - payroll - rent - c.marketing) * e.taxRate;
      e.treasury = round2((e.treasury || 0) + tax); // impostos pagam serviços públicos (polícia, justiça)
      const profit = round2(revenue - payroll - rent - c.marketing - tax);
      c.cash = round2(c.cash + profit); c.revenueDay = round2(revenue); c.profitDay = profit; c.salesToday = 0; c.productivity = 0; c.openDays = open + 1;
      c.profitHistory.push(profit); cap(c.profitHistory, 30);
      c.sentiment = clamp(c.sentiment * 0.85 + (profit > 0 ? 0.03 : -0.05), -1, 1);
      // salários (o dinheiro sai da empresa e entra na conta das pessoas)
      for (const x of c.employees) {
        if (x.personaId === 'me') continue;
        const p = personById(w, x.personaId);
        if (p?.agent) p.agent.cash += x.salary;
      }
      lifecycle(ctx, c);
      dividends(ctx, c, payroll);
    }
  }
  // custo de vida, contas atrasadas e promoções
  for (const p of residents(w)) {
    const a = p.agent;
    a.cash = round2(a.cash - (90 + 120 * a.traits.ambition) * e.cpi);
    if (a.cash < 0 && !a.broke) { a.broke = true; p.problem = genderize(p, 'está com as contas atrasadas'); remember(p, 'Fechei o mês no vermelho.'); if (chance(0.5)) worldPost(ctx, p, genderize(p, pick(['Conta no vermelho de novo. Alguém tem dica de bico?', 'Fim do mês chegou antes do salário 😩']))); }
    if (a.cash > 500) a.broke = false;
    if (a.companyId) { a.skill = round2(Math.min(2.5, a.skill + 0.004)); if (a.skill > 1.25 && chance(0.012) && !/CEO|gerente/i.test(a.role || '')) promote(ctx, p); }
  }
  // a referência do índice é fixada no 2º dia, quando as ações já acharam o preço justo
  e.days = (e.days || 0) + 1;
  if (e.days === 2) { const list = companies(w).filter(live); e.indexBase = list.reduce((s, c) => s + c.price, 0) / Math.max(1, list.length); e.index = 1000; e.indexHistory = [{ t: ctx.at.toISOString(), v: 1000 }]; }
  // inflação: crédito em excesso e impostos baixos aquecem; impostos altos esfriam
  const loanPressure = Math.min(1, (e.loansOut || 0) / 200000);
  e.inflation = round2(clamp(e.inflation * 0.9 + 0.05 * (0.4 + loanPressure * 0.8 - (e.taxRate - 0.12) * 4) + gauss(0, 0.03), -0.5, 3));
  e.cpi = Math.round(e.cpi * (1 + e.inflation / 100 / 30) * 100000) / 100000;
  e.monthDay = (e.monthDay || 0) + 1;
  if (e.monthDay >= 30) {
    e.monthDay = 0;
    record(ctx, { type: 'inflacao', cat: 'economia', title: `Inflação do mês fica em ${e.inflation.toLocaleString('pt-BR')}%`, text: `Índice de preços acumulado: ${((e.cpi - 1) * 100).toFixed(1)}% desde a gênese. Bolsa Nexus em ${Math.round(e.index)} pontos.`, importance: 3, data: { inflation: e.inflation } });
  }
  userDaily(ctx);
});

// Dividendos: caixa muito acima do necessário volta para os donos (fundador e acionistas, inclusive o usuário).
function dividends(ctx, c, payroll) {
  if (c.status !== 'ativa' || c.founderId === 'me') return;
  const reserve = Math.max(12000, (payroll + c.marketing) * 10);
  if (c.cash <= reserve * 1.4 || c.profitHistory.slice(-3).some((x) => x < 0)) return;
  const pool = round2((c.cash - reserve) * 0.5);
  c.cash = round2(c.cash - pool);
  const perShare = pool / c.shares;
  const u = ctx.w.user;
  const mine = u?.portfolio?.[c.id]?.shares || 0;
  if (mine > 0) {
    const v = round2(perShare * mine);
    if (v >= 0.01) { credit(ctx.w, v, `Dividendos da ${c.name} (${mine} ações)`, ctx.at, 'dividendo'); record(ctx, { type: 'dividendos', cat: 'economia', title: `Você recebeu ${v.toLocaleString('pt-BR')} NXC em dividendos da ${c.name}`, actors: ['me'], refs: [{ t: 'company', id: c.id }], importance: 1 }); }
  }
  const founder = personById(ctx.w, c.founderId);
  if (founder?.agent) founder.agent.cash += round2(pool * 0.4);
  c.lastDividend = { at: ctx.at.toISOString(), perShare: round2(perShare) };
}

function cityDistrict(w, id) { return w.city?.districts?.find((d) => d.id === id); }

function promote(ctx, p) {
  const a = p.agent; const c = companyById(ctx.w, a.companyId);
  if (!c) return;
  const role = genderize(p, pick(['gerente', 'coordenador(a)', 'líder de equipe', 'supervisor(a)']));
  const emp = c.employees.find((x) => x.personaId === p.id);
  if (emp) { emp.role = role; emp.salary = Math.round(emp.salary * 1.3); }
  a.role = role; a.salary = emp?.salary || a.salary; p.job = `${role} na ${c.name}`;
  p.mood = { emotion: 'orgulhosa', intensity: 0.9, reason: 'foi promovida(o)' };
  const ev = record(ctx, { type: 'promocao', cat: 'pessoal', title: `${p.name} foi promovido(a) a ${role} na ${c.name}`.replace('promovido(a)', genderize(p, 'promovida(o)')), actors: [p.id], refs: [{ t: 'company', id: c.id }], importance: 2 });
  remember(p, `Fui promovida(o) a ${role}!`, ev.at);
  worldPost(ctx, p, genderize(p, pick([`Finalmente consegui aquela promoção! Depois de muito esforço, agora sou ${role} 😭🙏`, `PROMOVIDA(O)!!! ${role} na ${c.name}. Obrigada(o) a quem acreditou em mim.`])));
}

// crise, demissões, falência, resgate, vagas e lançamentos
function lifecycle(ctx, c) {
  const w = ctx.w;
  const payroll = c.employees.reduce((s, x) => s + x.salary, 0) + c.marketing;
  const story = c.storyId || (c.storyId = uid());
  if (c.cash < 0) c.negDays += 1; else c.negDays = 0;
  if (c.status === 'ativa' && c.negDays >= 2) {
    c.status = 'crise';
    c.sentiment = clamp(c.sentiment - 0.3, -1, 1);
    record(ctx, { type: 'crise', cat: 'economia', title: `${c.name} entra em crise financeira`, text: `Caixa negativo em ${Math.abs(Math.round(c.cash)).toLocaleString('pt-BR')} NXC.`, refs: [{ t: 'company', id: c.id }], actors: [c.ceoId], importance: 3, storyId: story });
    // corta custos: demite quem custa mais e tem menos tempo de casa
    const cut = c.employees.filter((x) => x.personaId !== c.ceoId && x.personaId !== 'me').sort((a, b) => b.salary - a.salary).slice(0, Math.ceil(c.employees.length / 3));
    for (const x of cut) { const p = personById(w, x.personaId); if (p) leaveJob(ctx, p, 'demissão'); }
    c.marketing = Math.round(c.marketing / 2);
  } else if (c.status === 'crise' && c.cash > payroll * 2) {
    c.status = 'ativa';
    record(ctx, { type: 'recuperacao', cat: 'economia', title: `${c.name} sai da crise`, refs: [{ t: 'company', id: c.id }], importance: 3, storyId: story });
  } else if (c.status === 'crise' && c.negDays >= 5) {
    const savior = residents(w).filter((p) => p.agent.cash > Math.abs(c.cash) * 2 + 5000 && p.id !== c.ceoId).sort((a, b) => b.agent.cash - a.agent.cash)[0];
    if (c.name === 'Banco Nexus') {
      // o banco onde todos (inclusive o usuário) guardam dinheiro não pode quebrar: a prefeitura socorre
      const aid = Math.round(Math.abs(c.cash) + 30000);
      c.cash = round2(c.cash + aid); c.negDays = 0; c.status = 'ativa'; c.sentiment = -0.2;
      eco(w).baseRate = Math.round(eco(w).baseRate * 1.15 * 100000) / 100000;
      record(ctx, { type: 'socorro', cat: 'economia', title: 'Prefeitura socorre o Banco Nexus', text: `Aporte de ${aid.toLocaleString('pt-BR')} NXC. Os juros da cidade sobem 15%.`, refs: [{ t: 'company', id: c.id }], importance: 4, storyId: story });
    } else if (savior && chance(0.45)) {
      const injected = Math.round(Math.abs(c.cash) + 8000);
      savior.agent.cash -= injected; c.cash = round2(c.cash + injected); c.negDays = 0; c.status = 'ativa'; c.sentiment = 0.1;
      const ev = record(ctx, { type: 'resgate', cat: 'economia', title: `${savior.name} salva a ${c.name} da falência`, text: `Aporte de ${injected.toLocaleString('pt-BR')} NXC.`, actors: [savior.id, c.ceoId], refs: [{ t: 'company', id: c.id }], importance: 3, storyId: story });
      remember(savior, `Investi ${injected} NXC para salvar a ${c.name}.`, ev.at);
    } else bankrupt(ctx, c, story);
  }
  if (!live(c)) return;
  // vagas
  const recent = c.profitHistory.slice(-3);
  if (c.status === 'ativa' && (c.unmet || 0) > 500 && recent.at(-1) > -200 && c.openings.length < 2 && c.employees.length < 16 && chance(0.6)) {
    const role = pick(SECTORS[c.sector].roles);
    c.openings.push({ id: uid(), role, salary: Math.round(salaryFor(role) * eco(w).cpi), at: ctx.at.toISOString() });
  }
  // lançamento de produto
  if (c.status === 'ativa' && SECTORS[c.sector].products.length && chance(c.sector === 'tecnologia' ? 0.07 : 0.03) && c.cash > 3000) launchProduct(ctx, c);
  // publicidade: empresas com caixa compram anúncios
  if (c.status === 'ativa' && c.cash > 15000 && chance(0.15)) {
    w.ads ??= [];
    const media = companies(w).filter((m) => m.sector === 'midia' && live(m) && m.id !== c.id);
    const host = pick(media);
    if (host) {
      const cost = Math.round(300 + rnd(900));
      c.cash -= cost; host.salesToday += cost; c.reputation = clamp(c.reputation + 1, 0, 100);
      w.ads.push({ id: uid(), companyId: c.id, hostId: host.id, text: `${c.name}: ${c.slogan || pick(c.products)?.name || SECTORS[c.sector].label}`, until: new Date(ctx.at.getTime() + 3 * DAY).toISOString() });
      cap(w.ads, 60);
    }
  }
}

function bankrupt(ctx, c, story) {
  const w = ctx.w;
  c.status = 'falida'; c.closedAt = ctx.at.toISOString(); c.price = 0;
  c.priceHistory.push({ t: ctx.at.toISOString(), v: 0 });
  for (const x of c.employees.slice()) { if (x.personaId === 'me') { fireUser(ctx, 'a empresa faliu'); continue; } const p = personById(w, x.personaId); if (p) leaveJob(ctx, p, 'demissão', x.personaId === c.ceoId); }
  c.openings = [];
  const ceo = personById(w, c.ceoId);
  const ev = record(ctx, { type: 'falencia', cat: 'economia', title: `${c.name} decreta falência`, text: `A empresa fundada em ${new Date(c.foundedAt).toLocaleDateString('pt-BR')} fecha as portas. As ações perderam todo o valor.`, actors: ceo ? [ceo.id] : [], refs: [{ t: 'company', id: c.id }], importance: 4, storyId: story });
  if (ceo) { ceo.mood = { emotion: 'triste', intensity: 1, reason: `a ${c.name} faliu` }; remember(ceo, `A ${c.name} faliu.`, ev.at); worldPost(ctx, ceo, genderize(ceo, `Hoje encerro um ciclo. A ${c.name} fechou. Obrigada(o) a todos que acreditaram.`)); }
  const u = w.user;
  if (u?.portfolio?.[c.id]?.shares) {
    record(ctx, { type: 'perda-investimento', cat: 'economia', title: `Suas ações da ${c.name} viraram pó`, text: `${u.portfolio[c.id].shares} ações perdidas.`, actors: ['me'], refs: [{ t: 'company', id: c.id }], importance: 3 });
    u.portfolio[c.id].shares = 0;
  }
}

export function launchProduct(ctx, c, name = null) {
  const base = pick(SECTORS[c.sector].products) || 'produto';
  const prod = { id: uid(), name: name || `${pick(['Neo', 'Pro', 'Max', 'X', 'Ultra', 'Air', 'One'])} ${base}`, price: Math.round(40 + Math.random() * 600), launchedAt: ctx.at.toISOString() };
  c.products.push(prod); cap(c.products, 12);
  const hit = gauss(0.15, 0.35);
  c.sentiment = clamp(c.sentiment + hit, -1, 1); c.reputation = clamp(c.reputation + Math.round(hit * 10), 5, 100);
  const story = uid();
  const ev = record(ctx, { type: 'lancamento', cat: SECTORS[c.sector].cat, title: `${c.name} lança ${prod.name}`, text: hit > 0.3 ? 'O mercado reagiu com entusiasmo.' : hit < 0 ? 'A recepção foi morna.' : 'Expectativa moderada entre os consumidores.', actors: [c.ceoId], refs: [{ t: 'company', id: c.id }], importance: hit > 0.35 ? 3 : 2, storyId: story, data: { productId: prod.id, hit } });
  // um concorrente critica (história emergente)
  const rival = companies(ctx.w).find((x) => x.id !== c.id && x.sector === c.sector && live(x));
  if (rival && hit > 0.2 && chance(0.5)) schedule(ctx, new Date(ctx.at.getTime() + (3 + rnd(20)) * HOUR), 'critica-concorrente', { by: rival.id, target: c.id, product: prod.name, cause: ev.id, story });
  return prod;
}
handle('critica-concorrente', (ctx, { by, target, product, cause, story }) => {
  const r = companyById(ctx.w, by); const c = companyById(ctx.w, target);
  if (!r || !c || !live(r) || !live(c)) return;
  const ceo = personById(ctx.w, r.ceoId);
  const ev = record(ctx, { type: 'critica', cat: SECTORS[c.sector].cat, title: `CEO da ${r.name} critica o ${product}, da ${c.name}`, text: `"Nada de novo. Fizemos isso antes", disse ${ceo?.name || 'a direção'}.`, actors: ceo ? [ceo.id, c.ceoId] : [c.ceoId], refs: [{ t: 'company', id: r.id }, { t: 'company', id: c.id }], importance: 2, causeId: cause, storyId: story });
  const target2 = personById(ctx.w, c.ceoId);
  if (ceo && target2) bump(ctx, ceo, target2, -15, { trust: -10, reason: `crítica ao ${product}` });
});

// ---------------------------------------------------------------- ações das pessoas
registerAction({
  name: 'trabalhar',
  weight: (ctx, p) => (isWorking(p, ctx.at) ? 3 : 0),
  run(ctx, p) {
    const c = companyById(ctx.w, p.agent.companyId);
    if (!c) return;
    c.productivity += p.agent.skill;
    p.agent.needs.energy = clamp(p.agent.needs.energy - 5, 0, 100);
    // colegas convivem
    const mate = personById(ctx.w, pick(c.employees)?.personaId);
    if (mate && mate.id !== p.id && chance(0.3)) bump(ctx, p, mate, Math.round(gauss(1.5, 3)), { reason: 'trabalho' });
  },
});
registerAction({
  name: 'comprar',
  weight: () => 0, // substituída pelas compras nas lojas do mapa (commerce.js)
  run(ctx, p) {
    const shops = companies(ctx.w).filter((c) => live(c) && c.products.length);
    const c = pick(shops); if (!c) return;
    const prod = pick(c.products);
    const price = priceNow(ctx.w, prod.price);
    if (p.agent.cash < price) return;
    p.agent.cash -= price; c.salesToday += price; p.agent.needs.fun = clamp(p.agent.needs.fun + 15, 0, 100);
  },
});
registerAction({
  name: 'procurar-emprego',
  weight: (ctx, p) => (p.agent.resident && !p.agent.companyId && p.age >= 17 ? 2 + (100 - p.agent.needs.money) / 40 : 0),
  run(ctx, p) {
    const open = companies(ctx.w).filter((c) => live(c) && c.openings.length);
    const c = pick(open); if (!c) return;
    // na empresa do usuário, quem decide é o usuário: a pessoa entra na fila de candidatos
    if (c.founderId === 'me') { c.applicants ??= []; if (!c.applicants.includes(p.id)) { c.applicants.push(p.id); cap(c.applicants, 20); } return; }
    const job = c.openings[0];
    if (Math.random() < 0.35 + p.agent.skill * 0.25 + (p.agent.diplomas.length ? 0.15 : 0)) {
      c.openings.shift();
      hire(ctx, c, p, job.role, job.salary);
      p.problem = null;
      p.mood = { emotion: 'feliz', intensity: 0.8, reason: 'conseguiu um emprego' };
    }
  },
});
registerAction({
  name: 'empreender',
  weight: (ctx, p) => (p.agent.resident && p.agent.traits.ambition > 0.6 && p.agent.cash > 9000 && !companies(ctx.w).some((c) => c.founderId === p.id && live(c)) ? 0.06 : 0),
  run(ctx, p) { foundCompany(ctx, p); },
});
registerAction({
  name: 'pedir-demissao',
  weight: (ctx, p) => (p.agent.companyId && p.agent.traits.ambition > 0.75 && p.agent.salary < 300 && !/CEO/.test(p.agent.role || '') ? 0.02 : 0),
  run(ctx, p) { leaveJob(ctx, p, 'quer algo melhor'); },
});

export function foundCompany(ctx, p, { name = null, sector = null } = {}) {
  const w = ctx.w;
  sector = sector || pick(Object.keys(SECTORS).filter((s) => !['midia', 'financas'].includes(s)));
  name = name || `${pick(NAME_A)} ${pick(NAME_B[sector] || ['Co'])}`;
  if (companies(w).some((c) => c.name === name)) name = `${name} ${p.name.split(' ')[1] || 'Nova'}`;
  const invest = Math.round(Math.min(p.agent.cash * 0.8, 25000));
  p.agent.cash -= invest;
  const c = makeCompany(ctx, { name, sector, founderId: p.id, districtId: p.agent.districtId || pick(w.city.districts).id, cash: invest, slogan: pick(['Feito para a cidade', 'O futuro é agora', 'Simples assim', 'Do bairro para o mundo']) });
  hire(ctx, c, p, 'CEO', 900, { silent: true });
  const ev = record(ctx, { type: 'fundacao', cat: SECTORS[sector].cat === 'tecnologia' ? 'tecnologia' : 'economia', title: `${p.name} funda a ${c.name}`, text: `Nova empresa de ${SECTORS[sector].label.toLowerCase()} com ${invest.toLocaleString('pt-BR')} NXC de capital.`, actors: [p.id], refs: [{ t: 'company', id: c.id }], importance: 3, storyId: c.storyId = uid() });
  remember(p, `Fundei a ${c.name}!`, ev.at);
  p.mood = { emotion: 'animada', intensity: 0.95, reason: `abriu a ${c.name}` };
  worldPost(ctx, p, genderize(p, `Hoje nasce a ${c.name} 🚀 um sonho antigo que finalmente saiu do papel.`));
  return c;
}

export const FOUND_COST = 10000;
export function foundUserCompany(ctx, name, sector) {
  const w = ctx.w;
  name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (name.length < 2) throw new Error('Dê um nome à empresa');
  if (!SECTORS[sector] || ['midia', 'financas'].includes(sector)) throw new Error('Escolha um setor válido');
  if (companies(w).some((c) => c.name.toLowerCase() === name.toLowerCase())) throw new Error('Já existe uma empresa com esse nome');
  if (companies(w).some((c) => c.founderId === 'me' && live(c))) throw new Error('Você já tem uma empresa ativa');
  const cost = Math.round(FOUND_COST * (account(w).installed?.kit ? 0.6 : 1));
  debit(w, cost, `Abertura da empresa ${name}`, ctx.at, 'empresa');
  const c = makeCompany(ctx, { name, sector, founderId: 'me', districtId: pick(w.city.districts.filter((d) => !d.locked)).id, cash: cost, slogan: 'Do zero ao topo' });
  c.ceoId = 'me';
  c.employees.push({ personaId: 'me', role: 'CEO', salary: 0, since: ctx.at.toISOString() });
  c.marketing = 200;
  c.openings.push({ id: uid(), role: pick(SECTORS[sector].roles), salary: Math.round(salaryFor('x') * eco(w).cpi), at: ctx.at.toISOString() });
  record(ctx, { type: 'fundacao', cat: SECTORS[sector].cat === 'tecnologia' ? 'tecnologia' : 'economia', title: `${userName(ctx)} funda a ${c.name}`, text: `Nova empresa de ${SECTORS[sector].label.toLowerCase()}.`, actors: ['me'], refs: [{ t: 'company', id: c.id }], importance: 3 });
  addXp(w, 100);
  return c;
}
export function manageCompany(ctx, c, body) {
  const w = ctx.w;
  if (c.founderId !== 'me') throw new Error('Essa empresa não é sua');
  if (!live(c)) throw new Error('A empresa faliu');
  if (body.marketing != null) c.marketing = clamp(Math.round(Number(body.marketing) || 0), 0, 5000);
  if (body.aporte > 0) { debit(w, Number(body.aporte), `Aporte na ${c.name}`, ctx.at); c.cash = round2(c.cash + Number(body.aporte)); }
  if (body.retirada > 0) {
    const v = Number(body.retirada);
    if (v > c.cash) throw new Error(`A empresa tem só ${Math.floor(c.cash).toLocaleString('pt-BR')} NXC em caixa`);
    c.cash = round2(c.cash - v); credit(w, v, `Retirada de lucros da ${c.name}`, ctx.at, 'dividendo');
  }
  if (body.vaga) { if (c.openings.length >= 4) throw new Error('Máximo de 4 vagas abertas'); c.openings.push({ id: uid(), role: String(body.vaga.role || pick(SECTORS[c.sector].roles)).slice(0, 40), salary: clamp(Math.round(Number(body.vaga.salary) || 250), 80, 2000), at: ctx.at.toISOString() }); }
  if (body.contratar) {
    const p = personById(w, body.contratar);
    const kit = Boolean(account(w).installed?.kit);
    if (!p || !((c.applicants || []).includes(p.id) || (kit && p.agent && !p.agent.companyId))) throw new Error('Candidato não encontrado');
    // com o Kit do Empreendedor, dá para contratar direto, sem vaga aberta
    const op = c.openings.shift() || (kit ? { role: pick(SECTORS[c.sector].roles), salary: 250 } : null);
    if (!op) throw new Error('Abra uma vaga antes');
    c.applicants = c.applicants.filter((x) => x !== p.id);
    hire(ctx, c, p, op.role, op.salary);
    bumpUser(ctx, p, 8, { note: `${userName(ctx)} me contratou na ${c.name}.` });
  }
  if (body.demitir) {
    const p = personById(w, body.demitir);
    if (!p || p.agent.companyId !== c.id) throw new Error('Funcionário não encontrado');
    leaveJob(ctx, p, 'demissão');
    bumpUser(ctx, p, -20, { trust: -15, note: `${userName(ctx)} me demitiu da ${c.name}.` });
  }
  return c;
}

// ---------------------------------------------------------------- o usuário na economia
export function userDaily(ctx) {
  const w = ctx.w; const u = account(w); const e = eco(w);
  // aluguéis dos imóveis do usuário
  for (const pr of (w.properties || []).filter((x) => x.ownerType === 'user' && ['apartamento', 'escritorio'].includes(x.kind))) {
    credit(w, round2(priceNow(w, pr.base) * 0.0012), `Aluguel: ${pr.name}`, ctx.at, 'aluguel');
  }
  // emprego: quem faltou perde desempenho
  const job = u.job;
  if (job) {
    const yesterday = new Date(ctx.at.getTime() - DAY).toISOString().slice(0, 10);
    const workday = new Date(ctx.at.getTime() - DAY).getDay() !== 0;
    if (workday && job.lastWork !== yesterday && job.since.slice(0, 10) < yesterday) {
      job.performance = clamp(job.performance - 12, 0, 100);
      job.absences = (job.absences || 0) + 1;
      if (job.performance < 30) {
        job.warnings = (job.warnings || 0) + 1;
        record(ctx, { type: 'advertencia', cat: 'economia', title: `Você recebeu uma advertência na ${companyById(w, job.companyId)?.name || 'empresa'}`, text: 'Faltas e desempenho baixo.', actors: ['me'], importance: 2 });
        if (job.warnings >= 3) fireUser(ctx, 'faltas e desempenho baixo');
      }
    }
  }
}
export function fireUser(ctx, reason) {
  const w = ctx.w; const u = account(w);
  if (!u.job) return;
  const c = companyById(w, u.job.companyId);
  if (c) c.employees = c.employees.filter((x) => x.personaId !== 'me');
  record(ctx, { type: 'demissao-usuario', cat: 'economia', title: `Você foi demitido(a) da ${c?.name || 'empresa'}`, text: reason, actors: ['me'], refs: c ? [{ t: 'company', id: c.id }] : [], importance: 3 });
  for (const x of c?.employees || []) { const p = personById(w, x.personaId); if (p) remember(p, `${userName(ctx)} foi demitida(o) da ${c.name} (${reason}).`); }
  u.jobHistory ??= []; u.jobHistory.push({ ...u.job, until: ctx.at.toISOString(), reason });
  u.job = null;
}

// tarefas do expediente: cada setor tem uma escolha melhor (o desempenho depende dela)
export const WORK_TASKS = {
  tecnologia: ['Um bug derrubou o sistema às vésperas do lançamento.', ['Corrigir rápido e lançar', 'Adiar o lançamento e testar tudo', 'Culpar a equipe de testes'], 1],
  varejo: ['Um cliente irritado quer devolver um produto sem nota.', ['Ouvir e oferecer troca', 'Recusar e chamar a segurança', 'Ignorar'], 0],
  midia: ['Chegou uma denúncia anônima sobre uma empresa.', ['Publicar na hora', 'Checar com duas fontes antes', 'Engavetar'], 1],
  alimentacao: ['O fornecedor atrasou e a cozinha está sem um ingrediente.', ['Adaptar o cardápio do dia', 'Fechar mais cedo', 'Servir assim mesmo'], 0],
  financas: ['Um cliente quer investir tudo em uma ação que subiu 40% na semana.', ['Recomendar diversificar', 'Executar sem comentar', 'Dizer para ele não investir nunca'], 0],
  entretenimento: ['A estrela do projeto sumiu antes da gravação.', ['Reorganizar a agenda e ligar para ela', 'Cancelar o projeto', 'Gravar sem ela'], 0],
  saude: ['Fila enorme e um paciente com dor forte.', ['Fazer triagem e priorizar', 'Seguir a ordem de chegada', 'Mandar voltar amanhã'], 0],
  publicidade: ['O cliente detestou a campanha um dia antes da estreia.', ['Ajustar o essencial com ele', 'Defender a campanha original', 'Desistir do cliente'], 0],
  pesquisa: ['O experimento deu um resultado estranho.', ['Repetir com controle', 'Publicar como descoberta', 'Descartar os dados'], 0],
  construcao: ['Choveu e a obra atrasou.', ['Replanejar o cronograma com a equipe', 'Trabalhar na chuva', 'Esconder o atraso do cliente'], 0],
};
export function workDay(ctx, choice) {
  const w = ctx.w; const u = account(w);
  if (!u.job) throw new Error('Você não está empregado(a)');
  const c = companyById(w, u.job.companyId);
  if (!c || !live(c)) { u.job = null; throw new Error('A empresa não existe mais'); }
  const today = ctx.at.toISOString().slice(0, 10);
  if (u.job.lastWork === today) throw new Error('Expediente de hoje já feito. Volte amanhã.');
  const [, , best] = WORK_TASKS[c.sector];
  const good = Number(choice) === best;
  u.job.lastWork = today;
  u.job.performance = clamp(u.job.performance + (good ? 9 : -4), 0, 100);
  u.job.days = (u.job.days || 0) + 1;
  c.productivity += good ? 1.4 : 0.6;
  credit(w, u.job.salary, `Salário do dia — ${c.name}`, ctx.at, 'salario');
  addXp(w, good ? 12 : 5);
  // colegas lembram de como você trabalha
  const mate = personById(w, pick(c.employees.filter((x) => x.personaId !== 'me'))?.personaId);
  if (mate) { bumpUser(ctx, mate, good ? 2 : -1, { note: good ? `${userName(ctx)} resolveu bem um problema no trabalho.` : `${userName(ctx)} se enrolou numa tarefa no trabalho.` }); }
  let promoted = false;
  if (u.job.performance >= 85 && u.job.days >= 5 && (!u.job.promotedAt || (u.job.days - (u.job.daysAtPromotion || 0)) >= 7)) {
    u.job.salary = Math.round(u.job.salary * 1.25); u.job.role = `${u.job.role.replace(/^(sênior |pleno )/i, '')}`.startsWith('líder') ? u.job.role : `${u.job.days > 14 ? 'líder' : 'sênior'} ${u.job.role.replace(/^(sênior |líder )/i, '')}`;
    u.job.promotedAt = today; u.job.daysAtPromotion = u.job.days; promoted = true;
    record(ctx, { type: 'promocao-usuario', cat: 'pessoal', title: `Você foi promovido(a) a ${u.job.role} na ${c.name}`, actors: ['me'], refs: [{ t: 'company', id: c.id }], importance: 3 });
    addXp(w, 60);
  }
  return { good, performance: u.job.performance, salary: u.job.salary, promoted, role: u.job.role };
}

export function applyUser(ctx, c, opening) {
  const w = ctx.w; const u = account(w);
  if (u.job) throw new Error('Você já tem um emprego. Peça demissão antes.');
  const ceo = personById(w, c.ceoId);
  const needs = { 'desenvolvedor(a)': 'Programação', 'analista de dados': 'Ciência de dados', jornalista: 'Jornalismo', 'editor(a)': 'Jornalismo', 'analista financeiro(a)': 'Administração', gerente: 'Administração', 'gerente de produto': 'Administração', 'gerente de contas': 'Administração', 'médico(a)': 'Medicina', 'pesquisador(a)': 'Ciência de dados', 'cientista': 'Ciência de dados' }[opening.role];
  const hasDiploma = !needs || u.diplomas.includes(needs);
  const score = u.reputation * 0.5 + (hasDiploma ? 30 : -10) + (ceo ? ceo.agent.user.aff / 3 : 0) + rnd(30) - (u.jobHistory || []).filter((j) => j.reason).length * 8;
  const app = { id: uid(), companyId: c.id, openingId: opening.id, role: opening.role, at: ctx.at.toISOString(), status: 'em análise', score: Math.round(score), needs: hasDiploma ? null : needs };
  u.applications ??= []; u.applications.push(app); cap(u.applications, 40);
  schedule(ctx, new Date(ctx.at.getTime() + 8 * 60 * 1000), 'resultado-candidatura', { id: app.id });
  return app;
}
handle('resultado-candidatura', (ctx, { id }) => {
  const w = ctx.w; const u = account(w);
  const app = (u.applications || []).find((x) => x.id === id);
  if (!app || app.status !== 'em análise') return;
  const c = companyById(w, app.companyId);
  const op = c?.openings.find((o) => o.id === app.openingId);
  if (!c || !live(c) || !op) { app.status = 'vaga encerrada'; return; }
  if (app.score >= 50 && !u.job) {
    app.status = 'aprovado';
    c.openings = c.openings.filter((o) => o.id !== op.id);
    c.employees.push({ personaId: 'me', role: op.role, salary: op.salary, since: ctx.at.toISOString() });
    u.job = { companyId: c.id, role: op.role, salary: op.salary, since: ctx.at.toISOString(), performance: 60, warnings: 0, days: 0 };
    for (const x of c.employees) { const p = personById(w, x.personaId); if (p?.agent) { p.agent.user.colleague = true; bumpUser(ctx, p, 2, { note: `${userName(ctx)} começou a trabalhar comigo na ${c.name}.` }); } }
    record(ctx, { type: 'contratacao-usuario', cat: 'economia', title: `Você foi contratado(a) pela ${c.name}`, text: `Cargo: ${op.role} · ${op.salary} NXC por dia trabalhado.`, actors: ['me'], refs: [{ t: 'company', id: c.id }], importance: 3 });
    addXp(w, 40);
  } else {
    app.status = 'recusado';
    record(ctx, { type: 'candidatura-recusada', cat: 'economia', title: `A ${c.name} recusou sua candidatura`, text: app.needs ? `A vaga pedia formação em ${app.needs}.` : 'Outros candidatos foram escolhidos.', actors: ['me'], refs: [{ t: 'company', id: c.id }], importance: 1 });
  }
});

export function trade(ctx, companyId, qty, side) {
  const w = ctx.w; const u = account(w);
  const c = companyById(w, companyId);
  if (!c || !live(c)) throw new Error('Empresa fora da bolsa');
  qty = Math.floor(qty);
  if (!(qty >= 1)) throw new Error('Quantidade inválida');
  const pos = (u.portfolio[c.id] ??= { shares: 0, avg: 0 });
  const gross = round2(qty * c.price);
  const fee = round2(Math.max(1, gross * 0.005));
  if (side === 'compra') {
    debit(w, gross + fee, `Compra de ${qty} ações ${c.ticker}`, ctx.at);
    pos.avg = round2((pos.avg * pos.shares + gross) / (pos.shares + qty)); pos.shares += qty;
    c.sentiment = clamp(c.sentiment + qty / c.shares * 2, -1, 1);
  } else {
    if (pos.shares < qty) throw new Error(`Você tem só ${pos.shares} ações`);
    credit(w, gross - fee, `Venda de ${qty} ações ${c.ticker}`, ctx.at, 'investimento');
    pos.shares -= qty;
    c.sentiment = clamp(c.sentiment - qty / c.shares * 2, -1, 1);
  }
  addXp(w, 3);
  return { price: c.price, shares: pos.shares, avg: pos.avg, fee };
}

export function netWorth(w) {
  const u = account(w);
  const stocks = Object.entries(u.portfolio).reduce((s, [id, pos]) => s + (companyById(w, id)?.price || 0) * pos.shares, 0);
  const props = (w.properties || []).filter((p) => p.ownerType === 'user').reduce((s, p) => s + priceNow(w, p.base), 0);
  const items = u.inventory.reduce((s, i) => s + i.price * 0.4, 0);
  const debts = outstanding(w);
  const own = companies(w).filter((c) => c.founderId === 'me' && live(c)).reduce((s, c) => s + Math.max(0, c.cash), 0);
  return round2(u.bank.balance + stocks + props + items + own - debts);
}

// mercado imobiliário: moradores com dinheiro compram; preços acompanham a demanda do bairro
onDaily((ctx) => {
  const w = ctx.w;
  for (const d of w.city?.districts || []) d.value = round2(clamp(d.value * (1 + gauss(0.0005, 0.004)) * (eco(w).housingMult || 1) ** 0.02, 0.3, 4));
  for (const pr of w.properties) {
    const d = cityDistrict(w, pr.districtId);
    pr.base = Math.round(pr.base * (1 + ((d?.value || 1) - (pr.lastValue || d?.value || 1)) / Math.max(0.3, pr.lastValue || 1)));
    pr.lastValue = d?.value || 1;
  }
  const rich = residents(w).filter((p) => p.agent.cash > 90000);
  const forSale = w.properties.filter((p) => p.ownerType === 'cidade');
  if (rich.length && forSale.length && chance(0.3)) {
    const p = pick(rich); const pr = pick(forSale);
    const price = priceNow(w, pr.base);
    if (p.agent.cash > price) {
      p.agent.cash -= price; pr.ownerType = 'persona'; pr.ownerId = p.id; p.agent.districtId = pr.districtId;
      record(ctx, { type: 'imovel', cat: 'local', title: `${p.name} comprou ${pr.name}`, text: `${price.toLocaleString('pt-BR')} NXC.`, actors: [p.id], refs: [{ t: 'district', id: pr.districtId }], importance: 1 });
      worldPost(ctx, p, genderize(p, pick(['Chave na mão! Casa nova 🏡', 'Mudança feita. Agora é arrumar tudo!'])));
    }
  }
});

onEvent((ctx, e) => {
  // notícias boas e ruins mexem com o humor do mercado
  for (const r of e.refs.filter((x) => x.t === 'company')) {
    const c = companyById(ctx.w, r.id);
    if (!c || !live(c)) continue;
    if (['escandalo', 'investigacao', 'processo'].includes(e.type)) c.sentiment = clamp(c.sentiment - 0.25 * e.importance / 3, -1, 1);
    if (['premio', 'descoberta', 'patente'].includes(e.type)) c.sentiment = clamp(c.sentiment + 0.2, -1, 1);
  }
});

export function publicCompany(w, c, full = false) {
  const ceo = c.ceoId === 'me' ? { id: 'me', name: 'Você' } : personById(w, c.ceoId);
  const prev = c.priceHistory.length > 24 ? c.priceHistory.at(-25).v : c.priceHistory[0]?.v || c.price;
  const base = { id: c.id, name: c.name, ticker: c.ticker, sector: c.sector, sectorLabel: SECTORS[c.sector]?.label, status: c.status, price: c.price, change: prev ? round2(((c.price - prev) / prev) * 100) : 0,
    color: c.color, domain: c.domain, employees: c.employees.length, ceo: ceo ? { id: ceo.id, name: ceo.name, avatar: ceo.avatar } : null, founderId: c.founderId, mine: c.founderId === 'me', reputation: c.reputation, origin: c.origin, foundedAt: c.foundedAt, closedAt: c.closedAt || null, openings: c.openings.length };
  if (!full) return base;
  return { ...base, cash: c.cash, revenueDay: c.revenueDay, profitDay: c.profitDay, profitHistory: c.profitHistory, marketing: c.marketing, slogan: c.slogan, products: c.products.map((p) => ({ ...p, price: priceNow(w, p.price) })),
    priceHistory: c.priceHistory.filter((_, i, a) => i % 2 === 0 || i === a.length - 1), staff: c.employees.map((e) => (e.personaId === 'me' ? { id: 'me', name: 'Você', role: e.role, salary: e.salary } : { ...(personById(w, e.personaId) ? { id: e.personaId, name: personById(w, e.personaId).name, avatar: personById(w, e.personaId).avatar, color: personById(w, e.personaId).color } : { id: e.personaId, name: (w.gone || {})[e.personaId] || '—' }), role: e.role, salary: e.salary })),
    openingList: c.openings, applicants: (c.applicants || []).map((id) => personById(w, id)).filter(Boolean).map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, skill: p.agent.skill, diplomas: p.agent.diplomas })) };
}
