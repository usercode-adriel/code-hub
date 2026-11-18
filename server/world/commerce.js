// COMMERCE — estabelecimentos no mapa, vendedores com personalidade, negociação, compra atômica, furto,
// estoque, horário de funcionamento, vida própria das lojas (reposição, promoções, filiais) e o submundo.
// Cada loja pertence a uma empresa (o dinheiro entra no caixa dela e segue a economia) e tem um vendedor
// que é uma pessoa da cidade. Lojas clandestinas não aparecem no mapa até o usuário descobri-las.
import { onDaily, onUpgrade, onEvent, record, schedule, handle, aiTake, services } from './core.js';
import { people, residents, personById, agentOf, active, bumpUser, userName, dm, registerAction, rumors, createRumor, isWorking } from './agents.js';
import { account, bankOf, debit, credit, cardCharge, verifyPin, BankError, once, addXp } from './bank.js';
import { companies, companyById, SECTORS, eco } from './economy.js';
import { geo, freeNode, address, pos, route, districtOfNode } from './map.js';
import { remember, genderize, worldPost } from '../social.js';
import { geminiJSON } from '../assistant.js';
import { notify } from '../notify.js';
import { rnd, pick, chance, clamp, uid, nowIso, DAY, HOUR, MIN, round2, cap, str, fold, shuffle } from './util.js';

// ---------------------------------------------------------------- categorias do mapa
export const PLACE_CATS = {
  banco: { label: 'Banco', icon: 'wallet', color: '#22c55e', hours: [10, 16], app: '#/banco' },
  'loja-tec': { label: 'Loja de tecnologia', icon: 'cpu', color: '#06b6d4', hours: [9, 21] },
  'loja-social': { label: 'Loja social', icon: 'star', color: '#ec4899', hours: [10, 22] },
  publicidade: { label: 'Agência de publicidade', icon: 'zap', color: '#f43f5e', hours: [9, 19] },
  clube: { label: 'Clube', icon: 'music', color: '#a855f7', hours: [20, 5] },
  shopping: { label: 'Centro comercial', icon: 'bag', color: '#d946ef', hours: [10, 22] },
  mercado: { label: 'Mercado', icon: 'bag', color: '#84cc16', hours: [7, 23] },
  oficina: { label: 'Oficina', icon: 'wrench', color: '#f97316', hours: [8, 18] },
  imobiliaria: { label: 'Imobiliária', icon: 'pin', color: '#eab308', hours: [9, 18], app: '#/empresas/imoveis' },
  empregos: { label: 'Agência de empregos', icon: 'briefcase', color: '#a3e635', hours: [8, 18], app: '#/empresas/carreira' },
  universidade: { label: 'Universidade', icon: 'school', color: '#f59e0b', hours: [7, 22], app: '#/empresas/carreira' },
  delegacia: { label: 'Delegacia', icon: 'shield', color: '#3b82f6', hours: [0, 24], app: '#/policia' },
  tribunal: { label: 'Fórum de Justiça', icon: 'scale', color: '#b45309', hours: [9, 18], app: '#/justica' },
  prefeitura: { label: 'Prefeitura', icon: 'flag', color: '#f59e0b', hours: [8, 18], app: '#/governo' },
  empresa: { label: 'Empresa / escritório', icon: 'briefcase', color: '#64748b', hours: [9, 18] },
  restaurante: { label: 'Restaurante', icon: 'flame', color: '#fb923c', hours: [11, 23] },
  bar: { label: 'Bar', icon: 'music', color: '#c084fc', hours: [17, 2] },
  parque: { label: 'Parque', icon: 'sun', color: '#22c55e', hours: [0, 24] },
  salao: { label: 'Salão de eventos', icon: 'calendar', color: '#facc15', hours: [0, 24] },
  cobertura: { label: 'Cobertura', icon: 'star', color: '#fde047', hours: [0, 24] },
  estadio: { label: 'Estádio', icon: 'trophy', color: '#4ade80', hours: [0, 24] },
  hospital: { label: 'Hospital', icon: 'heart', color: '#f87171', hours: [0, 24] },
  turismo: { label: 'Ponto turístico', icon: 'camera', color: '#2dd4bf', hours: [0, 24] },
  clandestino: { label: 'Submundo', icon: 'eye', color: '#991b1b', hours: [21, 4] },
};
export const isOpen = (pl, at = new Date()) => {
  if (['fechado', 'interditado', 'falido'].includes(pl.status)) return false;
  const [o, c] = pl.hours || PLACE_CATS[pl.kind]?.hours || [0, 24];
  const h = at.getHours();
  if (o === 0 && c === 24) return true;
  return o < c ? h >= o && h < c : h >= o || h < c;
};

// ---------------------------------------------------------------- produtos (cada um tem efeito real no inventário)
export const PRODUCTS = {
  'central-comando': { name: 'Central de Comando Pessoal', cat: 'tecnologia', base: 1800, type: 'software', desc: 'Microsistema instalável no seu perfil: projetos, tarefas, prazos, metas e seus agentes de IA num painel só (usa os dados reais do seu hub).', actions: ['instalar', 'vender', 'descartar'], stock: [2, 5] },
  'mapa-inteligente': { name: 'Mapa Inteligente', cat: 'tecnologia', base: 950, type: 'software', desc: 'Mostra no mapa onde cada pessoa está agora, imóveis e filtros avançados.', actions: ['instalar', 'vender', 'descartar'], stock: [3, 8] },
  memoria: { name: 'Expansão de memória (+40 lembranças)', cat: 'tecnologia', base: 600, type: 'upgrade', desc: 'Seus amigos de IA guardam mais 40 lembranças cada (até 160) e recuperam memórias antigas. Custo real: o arquivo do mundo cresce.', actions: ['instalar', 'descartar'], stock: [3, 10] },
  smartphone: { name: 'Smartphone Neon X', cat: 'tecnologia', base: 1200, type: 'gadget', desc: 'Permite ligar para os seus amigos (modo ligação por voz).', actions: ['ativar', 'transferir', 'vender', 'descartar'], stock: [2, 8] },
  'clube-vip': { name: 'Assinatura Clube Aurora VIP (30 dias)', cat: 'social', base: 900, type: 'assinatura', desc: 'Festas e eventos exclusivos, networking com gente influente e comunidade privada.', actions: ['ativar'], stock: [5, 30] },
  campanha: { name: 'Campanha publicitária (3 dias)', cat: 'social', base: 700, type: 'servico', desc: 'Divulga sua empresa (mais clientes e reputação) ou seu perfil (mais fama), com anúncios nos sites e na Rede.', actions: ['usar'], stock: [5, 20], target: 'campanha' },
  estudio: { name: 'Sessão no Estúdio Prisma', cat: 'social', base: 400, type: 'servico', desc: 'Grave um podcast ou uma música: ela toca na Neon FM e aumenta sua fama.', actions: ['usar'], stock: [3, 12] },
  camera: { name: 'Câmera profissional Lumen', cat: 'social', base: 1500, type: 'gadget', desc: 'Seus posts na Rede ganham fotos geradas e rendem mais fama.', actions: ['ativar', 'transferir', 'vender', 'descartar'], stock: [1, 5] },
  'kit-empreendedor': { name: 'Kit do Empreendedor', cat: 'social', base: 1200, type: 'upgrade', desc: 'Abrir empresa fica 40% mais barato e libera contratação direta e promoção relâmpago.', actions: ['ativar'], stock: [2, 8] },
  cafe: { name: 'Café especial', cat: 'geral', base: 12, type: 'consumivel', desc: 'Um bom café. Pode oferecer a alguém.', actions: ['usar', 'transferir'], stock: [20, 60] },
};
const SELLER_STYLES = {
  insistente: { flex: 0.12, patience: 4, label: 'Insistente' }, simpatico: { flex: 0.08, patience: 4, label: 'Simpático' }, desconfiado: { flex: 0.03, patience: 2, label: 'Desconfiado' },
  experiente: { flex: 0.06, patience: 3, label: 'Experiente' }, oportunista: { flex: 0.15, patience: 3, markup: 0.12, label: 'Oportunista' }, clandestino: { flex: 0.1, patience: 2, label: 'Clandestino' },
};
const LINES = {
  insistente: { hi: ['Opa, chegou na hora certa! Olha só essa oportunidade.', 'Fica à vontade, mas já te adianto: hoje tem preço especial.'], pitch: (it, p, d) => `Olha, meu parceiro, chegou uma unidade de ${it} hoje. Está saindo por ${p}. Se fechar agora, consigo fazer por ${d}.` },
  simpatico: { hi: ['Oi! Que bom te ver por aqui 😊', 'Seja bem-vindo(a)! Posso ajudar?'], pitch: (it, p, d) => `Se te interessar, o ${it} está ${p}, mas pra você eu faço ${d} hoje.` },
  desconfiado: { hi: ['Pois não?', 'Vai levar alguma coisa?'], pitch: (it, p) => `O ${it} é ${p}. Preço de tabela.` },
  experiente: { hi: ['Bem-vindo. Conheço cada peça desta loja, pode perguntar.', 'Boa tarde. Procurando algo específico?'], pitch: (it, p, d) => `O ${it} é o que mais sai: ${p}. Fechando agora, ${d}.` },
  oportunista: { hi: ['E aí, chefe! Hoje é seu dia de sorte.', 'Chega mais, tenho coisa boa e barata.'], pitch: (it, p, d) => `Esse ${it} vale muito mais, mas faço ${p}... tá bom, ${d} e não se fala mais nisso.` },
  clandestino: { hi: ['Fala baixo. Quem te mandou aqui?', 'Não tem nome, não tem recibo. Vai querer o quê?'], pitch: (it, p, d) => `${it}. ${p} em dinheiro vivo. Pra você, ${d}.` },
};

export const places = (w) => (w.city?.places || []);
export const placeById = (w, id) => places(w).find((p) => p.id === id);
const shops = (w) => places(w).filter((p) => p.catalog);

// ---------------------------------------------------------------- criação das lojas (mundos novos e antigos)
const STORES = [
  { name: 'TechVision Store', kind: 'loja-tec', company: 'TechVision', district: 'tech', items: ['central-comando', 'mapa-inteligente', 'memoria', 'smartphone'] },
  { name: 'NovaTech Shop', kind: 'loja-tec', company: 'NovaTech', district: 'centro', items: ['smartphone', 'mapa-inteligente', 'memoria'] },
  { name: 'Clube Aurora VIP', kind: 'clube', company: 'Clube Aurora', sector: 'entretenimento', district: 'jardins', items: ['clube-vip'] },
  { name: 'Agência Pulso', kind: 'publicidade', company: 'Agência Pulso', district: 'centro', items: ['campanha'] },
  { name: 'Estúdio Prisma', kind: 'loja-social', company: 'Estúdio Prisma', sector: 'entretenimento', district: 'porto', items: ['estudio', 'camera'] },
  { name: 'Empreenda+', kind: 'loja-social', company: 'Empreenda+', sector: 'publicidade', district: 'mercado', items: ['kit-empreendedor'] },
  { name: 'Vitrine Digital Shopping', kind: 'shopping', company: 'Vitrine Digital', district: 'centro', items: ['cafe', 'smartphone', 'clube-vip', 'camera'] },
  { name: 'Mercado Central', kind: 'mercado', company: 'Sabor da Vila', district: 'mercado', items: ['cafe'] },
  { name: 'Oficina Turbo', kind: 'oficina', company: 'Oficina Turbo', sector: 'construcao', district: 'vila' },
  { name: 'Banco Nexus — Agência Central', kind: 'banco', company: 'Banco Nexus', district: 'centro' },
  { name: 'Imobiliária Horizonte', kind: 'imobiliaria', company: 'Construtora Horizonte', district: 'jardins' },
  { name: 'Empregos BR — Agência', kind: 'empregos', company: 'Empregos BR', district: 'mercado' },
  { name: 'Fórum de Justiça de Nexus City', kind: 'tribunal', district: 'centro' },
  { name: 'Mirante da Serra', kind: 'turismo', district: 'serra' }, { name: 'Praia do Porto', kind: 'turismo', district: 'porto' },
];
function ensureCompany(ctx, name, sector, owner) {
  const w = ctx.w;
  let c = companies(w).find((x) => x.name === name);
  if (c) return c;
  c = { id: uid(), name, ticker: `${name.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase()}3`, sector, founderId: owner?.id || null, ceoId: owner?.id || null, districtId: null, foundedAt: ctx.at.toISOString(), status: 'ativa',
    employees: [], openings: [], applicants: [], cash: 15000 + rnd(15000), revenueDay: 0, profitDay: 0, profitHistory: [], salesToday: 0, productivity: 0, shares: 10000, price: 5, priceHistory: [{ t: ctx.at.toISOString(), v: 5 }],
    sentiment: 0, reputation: 50, marketing: sector === 'submundo' ? 0 : 200, products: [], color: sector === 'submundo' ? '#7f1d1d' : pick(['#ec4899', '#a855f7', '#f97316', '#14b8a6']), slogan: '', domain: `${name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')}.nx`, siteKind: 'empresa', negDays: 0, origin: 'vivo', hidden: sector === 'submundo' };
  companies(w).push(c);
  if (owner?.agent) { c.employees.push({ personaId: owner.id, role: sector === 'submundo' ? 'dono(a)' : 'CEO', salary: 400, since: ctx.at.toISOString() }); Object.assign(owner.agent, { companyId: c.id, role: 'dono(a)', salary: 400 }); owner.job = sector === 'submundo' ? owner.job : `dono(a) da ${name}`; }
  return c;
}
function stockFor(key) { const [a, b] = PRODUCTS[key].stock; return a + rnd(b - a + 1); }
function makeCatalog(keys, sector, mult = 1) {
  return keys.map((k) => ({ key: k, price: Math.round(PRODUCTS[k].base * mult * (0.95 + Math.random() * 0.1)), stock: stockFor(k) }));
}
function assignSeller(w, pl, c) {
  const staff = (c?.employees || []).map((e) => personById(w, e.personaId)).filter((p) => p?.agent && p.id !== c?.ceoId);
  let s = pick(staff) || personById(w, c?.ceoId);
  if (!s) return null;
  const t = s.agent.traits;
  const style = pl.kind === 'clandestino' ? 'clandestino' : t.honesty < 0.35 ? 'oportunista' : s.agent.skill > 1.35 ? 'experiente' : t.sociability > 0.65 && t.ambition > 0.55 ? 'insistente' : t.sociability > 0.5 ? 'simpatico' : 'desconfiado';
  s.agent.seller = { placeId: pl.id, style, customers: s.agent.seller?.customers || {} };
  s.agent.keep = true;
  pl.sellerId = s.id;
  return s;
}
// remove itens decorativos antigos (fone/flores/ferramentas) dos catálogos de mundos já existentes
onUpgrade(10, (ctx) => {
  const w = ctx.w;
  for (const pl of (w.city?.places || [])) if (pl.catalog) pl.catalog = pl.catalog.filter((it) => PRODUCTS[it.key]);
  for (const u of [account(w)]) if (u.inventory) u.inventory = u.inventory.filter((it) => PRODUCTS[it.key]);
});
onUpgrade(4, (ctx) => {
  const w = ctx.w;
  if (!w.city) return;
  const used = new Set(places(w).map((p) => p.node));
  const shady = residents(w).filter((p) => p.agent.traits.honesty < 0.4);
  for (const s of STORES) {
    if (places(w).some((p) => p.name === s.name)) continue;
    let c = s.company ? companies(w).find((x) => x.name === s.company) : null;
    if (!c && s.company) c = ensureCompany(ctx, s.company, s.sector || 'varejo', s.hidden ? pick(shady) || pick(residents(w)) : pick(residents(w).filter((p) => !p.agent.companyId)));
    const node = freeNode(w, s.district, { used }); used.add(node);
    const [x, y] = pos(w, node);
    const pl = { id: uid(), name: s.name, kind: s.kind, sub: s.sub || null, districtId: districtOfNode(w, node) || s.district, node, x, y, address: address(w, node), hours: PLACE_CATS[s.kind].hours,
      companyId: c?.id || null, status: 'aberto', hidden: Boolean(s.hidden), security: s.hidden ? 0.25 : 0.3 + Math.random() * 0.4, reputation: 3.5 + Math.random(), ratings: [], banned: [], ledger: [], createdAt: ctx.at.toISOString(), origin: 'genese' };
    if (s.items) pl.catalog = makeCatalog(s.items, s.sector);
    if (c) { c.districtId ??= pl.districtId; c.storeIds = [...new Set([...(c.storeIds || []), pl.id])]; }
    w.city.places.push(pl);
    if (pl.catalog || ['banco', 'imobiliaria', 'empregos'].includes(pl.kind)) assignSeller(w, pl, c);
  }
  // sede de cada empresa visível no mapa
  for (const c of companies(w).filter((x) => !x.hidden && x.status !== 'falida')) {
    if (places(w).some((p) => p.companyId === c.id && p.kind === 'empresa')) continue;
    const node = freeNode(w, c.districtId || 'centro', { used }); used.add(node);
    const [x, y] = pos(w, node);
    w.city.places.push({ id: uid(), name: `${c.name} — sede`, kind: 'empresa', districtId: districtOfNode(w, node) || c.districtId, node, x, y, address: address(w, node), hours: [9, 18], companyId: c.id, status: 'aberto', security: 0.5, reputation: 4, ratings: [], origin: 'genese' });
  }
  // locais antigos ganham categoria de mapa e horário
  for (const pl of places(w)) {
    if (pl.kind === 'universidade' || pl.kind === 'delegacia' || pl.kind === 'prefeitura' || pl.kind === 'hospital' || pl.kind === 'estadio') pl.hours ??= PLACE_CATS[pl.kind]?.hours;
    pl.hours ??= PLACE_CATS[pl.kind]?.hours || [0, 24];
    pl.status ??= 'aberto';
  }
  // imóveis ganham endereço no mapa
  for (const pr of w.properties || []) { if (pr.node != null) continue; pr.node = freeNode(w, pr.districtId, { used }); used.add(pr.node); pr.address = address(w, pr.node); [pr.x, pr.y] = pos(w, pr.node); }
  // o usuário começa no Centro
  account(w).location ??= { placeId: null, node: freeNode(w, 'centro', { used }) };
  w.user.discovered ??= [];
});

// ---------------------------------------------------------------- vida própria das lojas
onDaily((ctx) => {
  const w = ctx.w;
  for (const pl of shops(w)) {
    const c = companyById(w, pl.companyId);
    if (c?.status === 'falida') { if (pl.status !== 'falido') { pl.status = 'falido'; record(ctx, { type: 'loja-fechou', cat: 'local', title: `${pl.name} fecha as portas`, text: pl.address, refs: [{ t: 'place', id: pl.id }, { t: 'district', id: pl.districtId }], importance: 2 }); } continue; }
    if (pl.status === 'interditado') continue;
    pl.status = c?.status === 'crise' ? 'aberto' : pl.status === 'fechado' ? 'aberto' : pl.status;
    // reposição: compra estoque com o caixa da empresa (custo = 60% do preço)
    for (const it of pl.catalog) {
      const tpl = PRODUCTS[it.key];
      // preço sobe só quando esgota (procura maior que a oferta) e cai devagar quando encalha
      if (it.stock === 0) it.price = Math.round(it.price * 1.05); else if (!it.soldToday && it.stock > 3) it.price = Math.round(it.price * 0.98);
      it.price = clamp(it.price, Math.round(tpl.base * 0.7), Math.round(tpl.base * 1.5));
      it.soldToday = 0;
      if (tpl.rare && !chance(0.35)) continue; // itens raros nem sempre aparecem
      const want = Math.max(0, stockFor(it.key) - it.stock);
      const cost = round2(want * it.price * 0.6);
      if (want > 0 && c && c.cash > cost + 500) { c.cash = round2(c.cash - cost); it.stock += want; }
    }
    // promoção (vira notícia local e post do dono)
    if (!pl.promo && c && c.status === 'ativa' && chance(pl.hidden ? 0 : 0.08)) {
      const it = pick(pl.catalog);
      pl.promo = { key: it.key, pct: 10 + rnd(21), until: new Date(ctx.at.getTime() + 2 * DAY).toISOString() };
      record(ctx, { type: 'promocao', cat: 'local', title: `${pl.name}: ${PRODUCTS[it.key].name} com ${pl.promo.pct}% de desconto`, text: pl.address, refs: [{ t: 'place', id: pl.id }, { t: 'district', id: pl.districtId }], importance: 1 });
      const owner = personById(w, c.ceoId); if (owner) worldPost(ctx, owner, genderize(owner, `Promoção na ${pl.name}! ${PRODUCTS[it.key].name} com ${pl.promo.pct}% off até amanhã. ${pl.address}`));
    }
    if (pl.promo && pl.promo.until < ctx.at.toISOString()) pl.promo = null;
    // vendedor que saiu da empresa é substituído
    const seller = personById(w, pl.sellerId);
    if (!seller || seller.agent?.companyId !== pl.companyId) assignSeller(w, pl, c);
  }
  // filial: empresas fortes abrem outra loja em outro bairro
  for (const c of companies(w).filter((x) => x.status === 'ativa' && !x.hidden && x.cash > 120000 && (x.storeIds || []).length && (x.storeIds || []).length < 3)) {
    if (!chance(0.05)) continue;
    const base = placeById(w, c.storeIds[0]);
    if (!base?.catalog) continue;
    const district = pick((w.city.districts || []).filter((d) => !d.locked && d.id !== base.districtId));
    const node = freeNode(w, district.id); const [x, y] = pos(w, node);
    const pl = { ...base, id: uid(), name: `${base.name.replace(/ — filial.*/, '')} — filial ${district.name}`, districtId: district.id, node, x, y, address: address(w, node), catalog: base.catalog.map((it) => ({ ...it, stock: Math.ceil(it.stock / 2) })), ratings: [], banned: [], ledger: [], promo: null, createdAt: ctx.at.toISOString(), origin: 'vivo' };
    c.cash = round2(c.cash - 40000);
    w.city.places.push(pl); c.storeIds.push(pl.id);
    assignSeller(w, pl, c);
    record(ctx, { type: 'filial', cat: 'economia', title: `${c.name} abre filial em ${district.name}`, text: pl.address, refs: [{ t: 'company', id: c.id }, { t: 'place', id: pl.id }, { t: 'district', id: district.id }], importance: 3 });
  }
});
// toda empresa nova aberta por alguém da cidade ganha endereço
onEvent((ctx, e) => {
  if (e.type !== 'fundacao') return;
  const c = companyById(ctx.w, e.refs.find((r) => r.t === 'company')?.id);
  if (!c || places(ctx.w).some((p) => p.companyId === c.id)) return;
  const node = freeNode(ctx.w, c.districtId || 'centro'); const [x, y] = pos(ctx.w, node);
  const items = { tecnologia: ['smartphone'], varejo: ['cafe'], alimentacao: ['cafe'], entretenimento: ['estudio'] }[c.sector];
  const pl = { id: uid(), name: items ? c.name : `${c.name} — escritório`, kind: items ? ({ tecnologia: 'loja-tec', varejo: 'shopping', alimentacao: 'restaurante', entretenimento: 'loja-social', construcao: 'oficina' }[c.sector]) : 'empresa', districtId: districtOfNode(ctx.w, node), node, x, y, address: address(ctx.w, node), hours: [9, 20], companyId: c.id, status: 'aberto', security: 0.35, reputation: 3.5, ratings: [], banned: [], ledger: [], createdAt: ctx.at.toISOString(), origin: 'vivo' };
  if (items) pl.catalog = makeCatalog(items, c.sector, 0.95);
  ctx.w.city.places.push(pl);
  c.storeIds = [pl.id];
  if (pl.catalog) assignSeller(ctx.w, pl, c);
});

// moradores fazem compras nas lojas abertas (o dinheiro vai para o caixa da empresa dona)
registerAction({
  name: 'fazer-compras',
  weight: (ctx, p) => (p.agent.resident && p.agent.cash > 200 ? (100 - p.agent.needs.fun) / 70 : 0),
  run(ctx, p) {
    const w = ctx.w;
    const open = shops(w).filter((pl) => isOpen(pl, ctx.at) && (!pl.hidden || p.agent.traits.honesty < 0.35));
    const pl = pick(open); if (!pl) return;
    const it = pick(pl.catalog.filter((x) => x.stock > 0 && PRODUCTS[x.key].base < p.agent.cash * 0.4));
    if (!it) return;
    const price = finalPrice(w, pl, it);
    p.agent.cash = round2(p.agent.cash - price); it.stock -= 1; it.soldToday = (it.soldToday || 0) + 1;
    const c = companyById(w, pl.companyId); if (c) c.salesToday += price;
    p.agent.needs.fun = clamp(p.agent.needs.fun + 15, 0, 100);
    if (chance(0.3)) { pl.ratings.push({ by: p.id, stars: clamp(Math.round(3 + (pl.reputation - 3) + (Math.random() - 0.4) * 2), 1, 5), at: ctx.at.toISOString() }); cap(pl.ratings, 60); pl.reputation = round2(pl.ratings.reduce((s, r) => s + r.stars, 0) / pl.ratings.length); }
  },
});

// ---------------------------------------------------------------- vitrine: o que o usuário vê ao entrar
export function finalPrice(w, pl, it) {
  const promo = pl.promo?.key === it.key && pl.promo.until > nowIso() ? pl.promo.pct / 100 : 0;
  return round2(it.price * (w.eco?.cpi || 1) * (1 - promo));
}
const sellerOf = (w, pl) => personById(w, pl.sellerId);
const style = (seller) => SELLER_STYLES[seller?.agent?.seller?.style] || SELLER_STYLES.simpatico;
function customer(seller) { const s = seller?.agent?.seller; if (!s) return { visits: 0, purchases: 0, spent: 0 }; return (s.customers.me ??= { visits: 0, purchases: 0, spent: 0, haggles: 0 }); }
export function storeView(ctx, pl) {
  const w = ctx.w; const u = account(w);
  const seller = sellerOf(w, pl);
  const st = seller?.agent?.seller?.style || 'simpatico';
  const cust = customer(seller);
  const here = u.location?.placeId === pl.id;
  const criminal = (w.justice?.record || []).length;
  const banned = (pl.banned || []).some((b) => b.until > nowIso());
  let greeting = pick(LINES[st].hi);
  if (cust.purchases >= 3) greeting = genderize(seller, pick([`Olha quem voltou! Cliente da casa. ${greeting}`, `De novo por aqui? Bom te ver. Da última vez você levou ${cust.last || 'uma coisa boa'}.`]));
  if (criminal && !pl.hidden) greeting = st === 'desconfiado' ? 'Sei quem você é. Vou ficar de olho, viu?' : `${greeting} (o vendedor te observa de canto de olho)`;
  if (pl.hidden && (u.underworld || 0) >= 30) greeting = 'Ah, você. Pode entrar, já ouvi falar de você.';
  // oferta do dia (vale 10 min)
  let pitch = null;
  const avail = (pl.catalog || []).filter((x) => x.stock > 0);
  if (here && avail.length && isOpen(pl, ctx.at) && !banned) {
    const it = pick(avail);
    const p = finalPrice(w, pl, it);
    const d = Math.round(p * (1 - style(seller).flex / 2));
    const offer = { id: uid(), placeId: pl.id, key: it.key, price: d, at: nowIso(), expiresAt: new Date(Date.now() + 10 * MIN).toISOString(), pitch: true };
    w.offers = (w.offers || []).filter((o) => o.expiresAt > nowIso()); w.offers.push(offer); cap(w.offers, 50);
    pitch = { offer, text: genderize(seller, LINES[st].pitch(PRODUCTS[it.key].name, `${p.toLocaleString('pt-BR')} NXC`, `${d.toLocaleString('pt-BR')} NXC`)) };
  }
  if (here) cust.visits += 1;
  const c = companyById(w, pl.companyId);
  return {
    id: pl.id, name: pl.name, kind: pl.kind, kindLabel: PLACE_CATS[pl.kind]?.label, sub: pl.sub, address: pl.address, districtId: pl.districtId, hours: pl.hours, open: isOpen(pl, ctx.at), status: pl.status, here, banned, hidden: pl.hidden,
    reputation: pl.reputation, ratings: (pl.ratings || []).slice(-8).reverse().map((r) => ({ ...r, by: r.by === 'me' ? { id: 'me', name: 'Você' } : (personById(w, r.by) ? { id: r.by, name: personById(w, r.by).name } : null) })), promo: pl.promo,
    company: c ? { id: c.id, name: c.name, status: c.status } : null, owner: c && personById(w, c.ceoId) ? { id: c.ceoId, name: personById(w, c.ceoId).name, avatar: personById(w, c.ceoId).avatar, color: personById(w, c.ceoId).color } : null,
    seller: seller ? { id: seller.id, name: seller.name, avatar: seller.avatar, color: seller.color, style: st, styleLabel: SELLER_STYLES[st].label, job: seller.job, mood: seller.mood, bio: seller.bio, story: seller.story, customer: cust } : null,
    staff: (c?.employees || []).slice(0, 8).map((e) => personById(w, e.personaId)).filter(Boolean).map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color, role: p.agent?.role })),
    greeting: seller ? genderize(seller, greeting) : null, pitch, cashOnly: pl.kind === 'clandestino', security: pl.security,
    catalog: (pl.catalog || []).map((it) => ({ key: it.key, ...PRODUCTS[it.key], price: finalPrice(w, pl, it), listPrice: round2(it.price * (w.eco?.cpi || 1)), stock: it.stock, promo: pl.promo?.key === it.key ? pl.promo.pct : 0 })),
    history: (w.events || []).filter((e) => e.refs?.some((r) => r.id === pl.id) || (c && e.refs?.some((r) => r.id === c.id))).slice(-8).reverse().map((e) => ({ at: e.at, title: e.title })),
  };
}

// ---------------------------------------------------------------- negociação
export function negotiate(ctx, pl, key, offer) {
  const w = ctx.w;
  const it = (pl.catalog || []).find((x) => x.key === key);
  if (!it) throw new BankError('Produto não encontrado');
  if (!isOpen(pl, ctx.at)) throw new BankError('A loja está fechada agora');
  const seller = sellerOf(w, pl);
  const st = style(seller); const cust = customer(seller);
  const list = finalPrice(w, pl, it);
  const cost = list * 0.6;
  const loyalty = Math.min(0.05, cust.purchases * 0.01);
  const criminal = (w.justice?.record || []).length && !pl.hidden ? 0.05 : 0;
  const floor = Math.max(cost * 1.08, list * (1 - st.flex - loyalty + criminal));
  offer = round2(Number(offer));
  cust.haggles = (cust.haggles || 0) + 1;
  const say = (t) => (seller ? genderize(seller, t) : t);
  w.offers = (w.offers || []).filter((o) => o.expiresAt > nowIso());
  const tries = w.offers.filter((o) => o.placeId === pl.id && o.key === key && !o.pitch).length;
  if (tries >= st.patience) return { result: 'cansou', text: say(pick(['Já falei meu último preço. É pegar ou largar.', 'Olha, assim não dá. O preço é esse.'])), price: list };
  if (!(offer > 0)) throw new BankError('Faça uma oferta em NXC');
  let result; let price;
  if (offer >= list) { result = 'aceito'; price = list; }
  else if (offer >= floor) { result = chance(0.85) ? 'aceito' : 'contraproposta'; price = result === 'aceito' ? offer : round2((offer + list) / 2); }
  else if (offer < cost * 0.8) { result = 'ofendido'; price = list; }
  else { result = 'contraproposta'; price = round2(Math.max(floor, (offer + list) / 2)); }
  const o = { id: uid(), placeId: pl.id, key, price, at: nowIso(), expiresAt: new Date(Date.now() + 10 * MIN).toISOString() };
  if (result !== 'ofendido') w.offers.push(o);
  if (result === 'ofendido') { w.offers.push({ ...o, price: list }); w.offers.push({ ...o, id: uid(), price: list }); }
  cap(w.offers, 60);
  const text = { aceito: pick([`Fechado em ${price.toLocaleString('pt-BR')} NXC.`, `Tá bom, ${price.toLocaleString('pt-BR')} NXC. Vou embrulhar.`]), contraproposta: pick([`Por ${offer.toLocaleString('pt-BR')} não consigo. Faço ${price.toLocaleString('pt-BR')} NXC.`, `Fica difícil... ${price.toLocaleString('pt-BR')} NXC e é meu limite.`]), ofendido: pick(['Tá de brincadeira, né? Isso não paga nem o custo.', 'Aí você me ofende.']) }[result];
  return { result, offerId: result === 'ofendido' ? null : o.id, price, text: say(text) };
}

// conversa com o vendedor (IA quando há cota; regras quando não)
export async function sellerChat(ctx, pl, message) {
  const w = ctx.w;
  const seller = sellerOf(w, pl);
  if (!seller) return { text: 'Não tem ninguém no balcão agora.' };
  const st = seller.agent.seller.style; const cust = customer(seller);
  const cat = (pl.catalog || []).map((it) => `${PRODUCTS[it.key].name}: ${finalPrice(w, pl, it)} NXC (estoque ${it.stock})`).join('; ');
  pl.chat ??= []; pl.chat.push({ who: 'me', text: str(message, 400), at: nowIso() }); cap(pl.chat, 30);
  let text = null;
  if (aiTake(ctx)) {
    try {
      const out = await geminiJSON(`Você é ${seller.name}, vendedor(a) da loja "${pl.name}" em Nexus City (cidade simulada). Estilo de venda: ${SELLER_STYLES[st].label}. Jeito de falar: ${seller.voice || 'natural'}. Humor: ${seller.mood?.emotion || 'normal'}.
Produtos (preços em NXC, a moeda local): ${cat || 'nenhum'}. Cliente: ${userName(ctx)}, já comprou ${cust.purchases} vez(es) aqui.${pl.kind === 'clandestino' ? ' A loja é clandestina: fale pouco, desconfie, só dinheiro vivo.' : ''}
Responda à mensagem do cliente em 1 a 3 frases, tentando vender, sem inventar produtos ou preços fora da lista. Mensagem: "${str(message, 400)}". JSON: {"resposta":""}`, 500, 0.9);
      text = str(out?.resposta, 500) || null;
    } catch (err) { console.error('[comércio] IA:', err.message); }
  }
  if (!text) {
    const m = fold(message);
    const it = (pl.catalog || []).find((x) => m.includes(fold(PRODUCTS[x.key].name).split(' ')[0]));
    if (/desconto|baixa|abaixa|menos|barato/.test(m)) text = it ? `Pelo ${PRODUCTS[it.key].name} eu consigo conversar. Faz uma oferta no botão "negociar".` : 'Desconto depende do produto. Me diz qual e faz uma oferta.';
    else if (/estoque|tem |acabou|disponi/.test(m)) text = it ? `${PRODUCTS[it.key].name}: ${it.stock ? `${it.stock} unidade(s)` : 'acabou, chega reposição amanhã'}.` : `Tenho ${(pl.catalog || []).filter((x) => x.stock).length} produto(s) em estoque agora.`;
    else if (it) text = `${PRODUCTS[it.key].name}: ${PRODUCTS[it.key].desc} Sai por ${finalPrice(w, pl, it).toLocaleString('pt-BR')} NXC.`;
    else if (/oi|ola|bom dia|boa tarde|boa noite/.test(m)) text = pick(LINES[st].hi);
    else text = pick(['Posso te mostrar o que tem de melhor aqui.', 'Dá uma olhada nos produtos, qualquer dúvida me chama.', st === 'insistente' ? 'Não sai sem levar nada, hein!' : 'Fica à vontade.']);
    text = genderize(seller, text);
  }
  pl.chat.push({ who: seller.id, text, at: nowIso() });
  return { text, seller: { id: seller.id, name: seller.name } };
}

// ---------------------------------------------------------------- deslocamento
export const TRANSPORT = { pe: { label: 'A pé', fee: () => 0 }, onibus: { label: 'Ônibus', fee: () => 4 }, taxi: { label: 'Táxi', fee: (m) => round2(5 + m * 0.0025) } };
export function travel(ctx, placeId, mode = 'pe') {
  const w = ctx.w; const u = account(w);
  const pl = placeById(w, placeId);
  if (!pl || (pl.hidden && !(u.discovered || []).includes(pl.id))) throw new BankError('Local não encontrado');
  const r = route(w, u.location?.node ?? 0, pl.node);
  const tr = TRANSPORT[mode] || TRANSPORT.pe;
  const fee = r ? tr.fee(r.meters) : 0;
  if (fee > 0) {
    const b = bankOf(w);
    if (b.wallet >= fee) b.wallet = round2(b.wallet - fee); else debit(w, fee, `${tr.label} até ${pl.name}`, ctx.at, 'transporte');
  }
  u.location = { placeId: pl.id, node: pl.node, at: ctx.at.toISOString() };
  // explorar de noite revela lugares escondidos por perto
  const h = ctx.at.getHours();
  if (h >= 20 || h < 5) {
    for (const hid of places(w).filter((x) => x.hidden && !(u.discovered || []).includes(x.id))) {
      const [x1, y1] = [hid.x, hid.y];
      if (Math.hypot(x1 - pl.x, y1 - pl.y) < 160 && chance(0.3)) discover(ctx, hid, 'Explorando a vizinhança de noite, você reparou numa porta sem placa.');
    }
  }
  return { location: u.location, route: r, fee, mode };
}
export function discover(ctx, pl, how) {
  const u = account(ctx.w);
  u.discovered ??= [];
  if (u.discovered.includes(pl.id)) return false;
  u.discovered.push(pl.id);
  record(ctx, { type: 'descoberta-submundo', cat: 'seguranca', title: `Você descobriu ${pl.name}`, text: how, actors: ['me'], importance: 1, data: { placeId: pl.id } });
  if (ctx.live) notify(ctx.uid, { type: 'system', title: `👁️ ${pl.name}`, message: `${how} (${pl.sub || 'submundo'})`, link: '#/mapa' });
  return true;
}
// boatos e contatos revelam o submundo
onDaily((ctx) => {
  const w = ctx.w; const u = account(w);
  const hidden = places(w).filter((x) => x.hidden && x.status !== 'interditado' && !(u.discovered || []).includes(x.id));
  if (!hidden.length) return;
  const friends = people(w).filter((p) => p.friend && p.botId && p.agent && (p.agent.traits.gossip > 0.6 || p.agent.traits.honesty < 0.35) && p.agent.user.aff >= 35);
  if (friends.length && chance(0.25)) {
    const f = pick(friends); const pl = pick(hidden);
    dm(ctx, f, genderize(f, `Psiu... ouvi falar de um lugar no ${(w.city.districts.find((d) => d.id === pl.districtId) || {}).name || 'centro'} chamado "${pl.name}". Dizem que vendem ${pl.sub?.toLowerCase() || 'coisa que não se acha em loja'}. Mas não fui eu que te contei 🤐`), 'rumor');
    discover(ctx, pl, `${f.name} te contou sobre esse lugar.`);
  }
  if ((u.underworld || 0) >= 30 && chance(0.3)) discover(ctx, pick(hidden), 'Seus contatos no submundo te passaram o endereço.');
});

// ---------------------------------------------------------------- compra (atômica)
export function buy(ctx, pl, key, { method = 'saldo', pin, offerId, targetId, opId }) {
  const w = ctx.w; const u = account(w);
  return once(w, opId, () => {
    if (u.location?.placeId !== pl.id) throw new BankError('Você precisa estar na loja. Vá até ela pelo mapa.', 'NOT_HERE');
    if (!isOpen(pl, ctx.at)) throw new BankError(`${pl.name} está fechada agora (horário: ${pl.hours[0]}h às ${pl.hours[1] % 24}h).`, 'CLOSED');
    if ((pl.banned || []).some((b) => b.until > nowIso())) throw new BankError('O vendedor se recusa a te atender.', 'BANNED');
    const it = (pl.catalog || []).find((x) => x.key === key);
    if (!it) throw new BankError('Produto não encontrado');
    if (it.stock < 1) throw new BankError('Esgotado. A loja repõe o estoque todo dia.', 'STOCK');
    const tpl = PRODUCTS[key];
    if (tpl.target === 'persona' && !personById(w, targetId)) throw new BankError('Escolha a pessoa-alvo');
    if (tpl.target === 'company' && !companyById(w, targetId)) throw new BankError('Escolha a empresa-alvo');
    let price = finalPrice(w, pl, it);
    if (offerId) {
      const o = (w.offers || []).find((x) => x.id === offerId && x.placeId === pl.id && x.key === key && x.expiresAt > nowIso() && !x.used);
      if (!o) throw new BankError('A oferta expirou. Negocie de novo.');
      price = Math.min(price, o.price); o.used = true;
    }
    // senha antes de mexer em qualquer coisa
    verifyPin(w, pin);
    const b = bankOf(w);
    if (pl.kind === 'clandestino') { if (b.wallet < price) throw new BankError(`Aqui só aceitam dinheiro vivo. Você tem ${b.wallet.toLocaleString('pt-BR')} NXC em mãos. Saque no banco.`, 'FUNDS'); }
    else if (method === 'cartao') { if (!b.card || b.card.status !== 'ativo') throw new BankError('Cartão indisponível'); if (b.card.used + price > b.card.limit) throw new BankError('Limite do cartão insuficiente', 'FUNDS'); }
    else if (b.balance < price) throw new BankError(`Saldo insuficiente (disponível: ${b.balance.toLocaleString('pt-BR')} NXC)`, 'FUNDS');
    // a partir daqui nada pode falhar: cobra, baixa estoque e entrega
    if (pl.kind === 'clandestino') b.wallet = round2(b.wallet - price);
    else if (method === 'cartao') cardCharge(w, price, `${tpl.name} — ${pl.name}`, ctx.at);
    else debit(w, price, `${tpl.name} — ${pl.name}`, ctx.at, 'compra');
    it.stock -= 1; it.soldToday = (it.soldToday || 0) + 1;
    const c = companyById(w, pl.companyId); if (c) c.salesToday += price;
    const seller = sellerOf(w, pl);
    const item = services.makeItem(ctx, { key, price, place: pl, seller, targetId });
    const cust = customer(seller); cust.purchases += 1; cust.spent = round2(cust.spent + price); cust.last = tpl.name;
    if (seller) { seller.agent.seller.sales = (seller.agent.seller.sales || 0) + 1; bumpUser(ctx, seller, 1, {}); }
    if (pl.kind === 'clandestino') { u.underworld = clamp((u.underworld || 0) + 4, 0, 100); pl.ledger ??= []; pl.ledger.push({ who: 'me', key, at: ctx.at.toISOString(), price }); cap(pl.ledger, 80); }
    addXp(w, 3);
    record(ctx, { type: pl.kind === 'clandestino' ? 'compra-clandestina' : 'compra', cat: pl.kind === 'clandestino' ? 'seguranca' : 'economia', title: `Você comprou ${tpl.name} na ${pl.name}`, text: `${price.toLocaleString('pt-BR')} NXC${method === 'cartao' ? ' no cartão' : pl.kind === 'clandestino' ? ' em dinheiro vivo' : ''}.`, actors: ['me', seller?.id].filter(Boolean), refs: [{ t: 'place', id: pl.id }], importance: 1, data: { itemId: item.id }, origin: 'vivo' });
    return { item, price, balance: b.balance, wallet: b.wallet };
  });
}

export function rate(ctx, pl, stars, text) {
  const w = ctx.w;
  if (!(account(w).inventory || []).some((i) => i.placeId === pl.id)) throw new BankError('Só quem comprou na loja pode avaliar');
  pl.ratings ??= []; pl.ratings = pl.ratings.filter((r) => r.by !== 'me');
  pl.ratings.push({ by: 'me', stars: clamp(Math.round(stars), 1, 5), text: str(text, 200), at: nowIso() });
  pl.reputation = round2(pl.ratings.reduce((s, r) => s + r.stars, 0) / pl.ratings.length);
  const seller = sellerOf(w, pl); if (seller) bumpUser(ctx, seller, stars >= 4 ? 3 : -3, { note: `${userName(ctx)} deu ${stars} estrela(s) para a ${pl.name}.` });
  return pl.reputation;
}

