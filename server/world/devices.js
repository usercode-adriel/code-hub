// DISPOSITIVOS — celular, carteira e relógio do jogador, ligados à economia real.
// Celulares são produtos de verdade das lojas de tecnologia: comprar → inventário → equipar → aparece no trilho
// de dispositivos. Modelos melhores liberam mais apps, câmera e armazenamento.
import { onUpgrade } from './core.js';
import { account, bankOf } from './bank.js';
import { PRODUCTS, places } from './commerce.js';
import { companies, companyById } from './economy.js';
import { invites, publicInvite } from './agents.js';
import { round2 } from './util.js';

// apps do sistema do celular (cada um abre uma tela real do jogo)
export const APPS = {
  social: { label: 'Social', route: 'social', icon: 'users', color: '#3b82f6' },
  mensagens: { label: 'Mensagens', route: 'assistente', icon: 'chat', color: '#22c55e' },
  nexus: { label: 'Nexus', route: 'banco', icon: 'wallet', color: '#6d4aff' },
  maps: { label: 'Maps', route: 'mapa', icon: 'map', color: '#f59e0b' },
  noticias: { label: 'Notícias', route: 'midia', icon: 'news', color: '#ef4444' },
  relogio: { label: 'Relógio', route: 'device:clock', icon: 'clock', color: '#64748b' },
  market: { label: 'Market', route: 'mercado', icon: 'cart', color: '#ec4899' },
  jobs: { label: 'Empregos', route: 'empregos', icon: 'briefcase', color: '#f97316' },
  agenda: { label: 'Agenda', route: 'device:clock', icon: 'calendar', color: '#14b8a6' },
  camera: { label: 'Câmera', route: 'social?foto=1', icon: 'camera', color: '#a855f7' },
  transporte: { label: 'Transporte', route: 'mapa?rota=1', icon: 'bus', color: '#0ea5e9' },
  carteira: { label: 'Carteira', route: 'device:wallet', icon: 'idcard', color: '#eab308' },
  bolsa: { label: 'Bolsa', route: 'empresas', icon: 'trending', color: '#10b981' },
  internet: { label: 'Navegador', route: 'internet', icon: 'globe', color: '#06b6d4' },
};
const BASIC = ['social', 'mensagens', 'nexus', 'maps', 'noticias', 'relogio'];
const MID = [...BASIC, 'market', 'jobs', 'agenda', 'carteira'];
const PREM = [...MID, 'camera', 'transporte', 'internet'];
const ALL = Object.keys(APPS);

export const TIERS = {
  economico: { label: 'Econômico', color: '#94a3b8' },
  intermediario: { label: 'Intermediário', color: '#3b82f6' },
  premium: { label: 'Premium', color: '#a855f7' },
  profissional: { label: 'Profissional', color: '#f59e0b' },
  especial: { label: 'Edição especial', color: '#ec4899' },
};

// modelos à venda (o "smartphone" antigo continua valendo como intermediário)
export const PHONES = {
  'phone-urban-mini': { name: 'Urban Mini', tier: 'economico', base: 520, camera: 8, storage: 32, apps: BASIC, skin: '#64748b', desc: 'Compacto e barato: redes, mensagens, banco e mapa.' },
  'phone-nexus-one': { name: 'Nexus One', tier: 'economico', base: 780, camera: 12, storage: 64, apps: [...BASIC, 'carteira'], skin: '#3b82f6', desc: 'O primeiro celular de muita gente em Nexus City. Inclui carteira digital.' },
  smartphone: { name: 'Smartphone Neon X', tier: 'intermediario', base: 1200, camera: 24, storage: 128, apps: MID, skin: '#06b6d4', desc: 'Liga para os seus amigos e abre o Market, Empregos e Agenda.' },
  'phone-pixelphone-8': { name: 'PixelPhone 8', tier: 'intermediario', base: 1850, camera: 48, storage: 256, apps: [...MID, 'camera'], skin: '#22c55e', desc: 'Câmera de 48 MP: posts com foto rendem mais fama.' },
  'phone-nova-pro': { name: 'Nova Pro', tier: 'premium', base: 3600, camera: 64, storage: 512, apps: PREM, skin: '#a855f7', desc: 'Tudo do intermediário + Câmera, Transporte e Navegador.' },
  'phone-codeniac-x': { name: 'Codeniac X', tier: 'profissional', base: 6400, camera: 108, storage: 1024, apps: ALL, skin: '#f59e0b', desc: 'Todos os apps, incluindo a Bolsa em tempo real.' },
  'phone-quantum-z': { name: 'Quantum Z', tier: 'especial', base: 11800, camera: 200, storage: 2048, apps: ALL, skin: '#ec4899', special: true, desc: 'Edição especial numerada: todos os apps, tema exclusivo e status na cidade.' },
};
export const isPhone = (key) => Boolean(PHONES[key]);

// registra os celulares como produtos (efeito real no inventário: equipar)
for (const [key, ph] of Object.entries(PHONES)) {
  if (key === 'smartphone') { PRODUCTS.smartphone.actions = ['equipar', 'transferir', 'vender', 'descartar']; continue; }
  PRODUCTS[key] = { name: ph.name, cat: 'tecnologia', base: ph.base, type: 'celular', desc: ph.desc, actions: ['equipar', 'transferir', 'vender', 'descartar'], stock: ph.special ? [1, 2] : [2, 6] };
}

// lojas de tecnologia passam a vender a linha de celulares
const SHOP_PHONES = {
  'TechVision Store': ['phone-nexus-one', 'phone-pixelphone-8', 'phone-nova-pro', 'phone-codeniac-x', 'phone-quantum-z'],
  'NovaTech Shop': ['phone-urban-mini', 'phone-nexus-one', 'phone-pixelphone-8', 'phone-nova-pro'],
  'Vitrine Digital Shopping': ['phone-urban-mini', 'phone-pixelphone-8'],
};
onUpgrade(13, (ctx) => {
  for (const pl of places(ctx.w)) {
    const keys = SHOP_PHONES[pl.name.replace(/ — filial.*/, '')];
    if (!keys || !pl.catalog) continue;
    for (const k of keys) {
      if (pl.catalog.some((x) => x.key === k)) continue;
      const [a, b] = PRODUCTS[k].stock;
      pl.catalog.push({ key: k, price: Math.round(PRODUCTS[k].base * (0.95 + Math.random() * 0.1)), stock: a + Math.floor(Math.random() * (b - a + 1)) });
    }
  }
});

// equipa um celular do inventário
export function equipPhone(w, it) {
  const u = account(w);
  u.devices ??= {};
  u.devices.phone = it.id;
  u.installed ??= {}; u.installed.phone = true;
  return `${it.name} equipado: ele aparece no seu trilho de dispositivos.`;
}
// quando o item sai do inventário (venda, presente, descarte), o celular é desequipado
export function unequipIfGone(w) {
  const u = account(w);
  if (u.devices?.phone && !(u.inventory || []).some((x) => x.id === u.devices.phone)) {
    u.devices.phone = null;
    u.installed.phone = (u.inventory || []).some((x) => isPhone(x.key));
  }
}

export function phoneOf(w) {
  const u = account(w);
  const it = (u.inventory || []).find((x) => x.id === u.devices?.phone) || (!u.devices?.phone && (u.inventory || []).find((x) => x.key === 'smartphone' && x.state === 'ativo'));
  if (!it) return null;
  const ph = PHONES[it.key];
  return { itemId: it.id, key: it.key, name: ph.name, tier: ph.tier, tierLabel: TIERS[ph.tier].label, tierColor: TIERS[ph.tier].color, camera: ph.camera, storage: ph.storage, skin: ph.skin, special: Boolean(ph.special),
    apps: ph.apps.map((k) => ({ key: k, ...APPS[k] })), locked: Object.keys(APPS).filter((k) => !ph.apps.includes(k)).map((k) => ({ key: k, ...APPS[k] })) };
}

// carteira: dinheiro em mãos, cartões, documentos, licenças e cartões de acesso — tudo derivado do estado real
export function walletOf(w) {
  const u = account(w); const b = bankOf(w);
  const docs = [{ kind: 'rg', title: 'Identidade de Nexus City', sub: `Cidadã(o) desde ${new Date(w.core.genesisAt).toLocaleDateString('pt-BR')}` }];
  if ((u.properties || []).length) docs.push({ kind: 'escritura', title: `Escrituras (${u.properties.length})`, sub: 'Imóveis no seu nome' });
  const licenses = [
    ...(u.diplomas || []).map((d) => ({ kind: 'diploma', title: `Diploma: ${d}`, sub: 'Educação de Nexus City' })),
    ...(u.profession ? [{ kind: 'profissao', title: `Registro profissional`, sub: u.profession }] : []),
  ];
  const access = [];
  if (u.job) access.push({ kind: 'cracha', title: `Crachá — ${companyById(w, u.job.companyId)?.name || 'empresa'}`, sub: u.job.role });
  for (const c of companies(w).filter((x) => x.founderId === 'me' && x.status !== 'falida')) access.push({ kind: 'dono', title: `Chave mestra — ${c.name}`, sub: 'Fundador(a)' });
  for (const o of (w.orgs || []).filter((x) => (x.members || []).some((m) => m.personaId === 'me'))) access.push({ kind: 'org', title: `Membro — ${o.name}`, sub: (o.members.find((m) => m.personaId === 'me') || {}).role || 'membro' });
  if (u.vipUntil && u.vipUntil > new Date().toISOString()) access.push({ kind: 'vip', title: 'Clube Aurora VIP', sub: `Válido até ${new Date(u.vipUntil).toLocaleDateString('pt-BR')}` });
  for (const a of (u.authorities || [])) access.push({ kind: 'autoridade', title: `Credencial: ${a}`, sub: 'Autoridade pública' });
  const cards = [{ kind: 'debito', title: 'Conta Nexus', sub: `Saldo ${round2(b.balance).toLocaleString('pt-BR')} NXC` }];
  if (b.card && b.card.status !== 'cancelado') cards.push({ kind: 'credito', title: `Cartão Nexus •••• ${b.card.last4}`, sub: `Limite ${round2(b.card.limit - (b.card.used || 0)).toLocaleString('pt-BR')} NXC livre` });
  return { cash: round2(b.wallet || 0), cards, docs, licenses, access };
}

// relógio: horário da cidade, próximos compromissos (convites aceitos/pendentes) e avisos
export function clockOf(w) {
  const next = invites(w).filter((i) => i.status === 'agendado' && ['aceito', 'pendente'].includes(i.user)).sort((a, b) => a.at.localeCompare(b.at)).slice(0, 5).map((i) => publicInvite(w, i));
  return { now: new Date().toISOString(), tz: 'America/Sao_Paulo', appointments: next };
}

export function devicesOf(w) {
  return { phone: phoneOf(w), cash: round2(bankOf(w).wallet || 0), appointments: clockOf(w).appointments.length };
}
