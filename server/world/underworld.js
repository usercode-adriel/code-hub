// SUBMUNDO — lojas clandestinas escondidas no mapa (só aparecem depois de descobertas), que vendem armas
// fictícias do jogo em dinheiro vivo. O que você compra vai para o seu inventário (estoque) e tem risco:
// a polícia faz abordagens, apreende o que encontra e aplica multa. Esconder o item em casa reduz o risco.
import { onDaily, onUpgrade, record, services } from './core.js';
import { residents } from './agents.js';
import { account, bankOf, addDebt } from './bank.js';
import { PRODUCTS, PLACE_CATS, places } from './commerce.js';
import { companies } from './economy.js';
import { freeNode, pos, address, districtOfNode } from './map.js';
import { notify } from '../notify.js';
import { pick, chance, uid, round2, shuffle } from './util.js';

// arsenal fictício do jogo (ícones em public/assets/items/w-*.png)
export const WEAPONS = {
  'w-pistol': { name: 'Pistola semiautomática', base: 2400, risk: 0.5 },
  'w-revolver': { name: 'Revólver de tambor', base: 1900, risk: 0.45 },
  'w-uzi': { name: 'Submetralhadora compacta', base: 5200, risk: 0.8 },
  'w-smg': { name: 'Submetralhadora tática', base: 6100, risk: 0.85 },
  'w-shotgun': { name: 'Escopeta de bomba', base: 4300, risk: 0.7 },
  'w-ak': { name: 'Fuzil de assalto', base: 9800, risk: 1 },
  'w-m4': { name: 'Fuzil tático', base: 11200, risk: 1 },
  'w-sniper': { name: 'Rifle de precisão', base: 14500, risk: 1 },
  'w-rifle-scope': { name: 'Rifle com luneta', base: 12800, risk: 1 },
  'w-ammo': { name: 'Caixa de munição', base: 380, risk: 0.3 },
  'w-shells': { name: 'Cartuchos de escopeta', base: 320, risk: 0.3 },
  'w-grenade': { name: 'Granada', base: 2900, risk: 0.9 },
  'w-dynamite': { name: 'Banana de dinamite', base: 1600, risk: 0.8 },
};
export const isIllegal = (key) => Boolean(WEAPONS[key]);
for (const [key, x] of Object.entries(WEAPONS)) {
  PRODUCTS[key] = { name: x.name, cat: 'submundo', base: x.base, type: 'arma', illegal: true, desc: 'Item clandestino: sem nota, sem registro. Se a polícia te abordar com ele, é apreendido e você leva multa.', actions: ['esconder', 'vender', 'descartar'], stock: [1, 4] };
}
// kit de primeiros socorros (legal: farmácias)
PRODUCTS.medkit = { name: 'Kit de primeiros socorros', cat: 'geral', base: 140, type: 'consumivel', desc: 'Curativos e remédios básicos. Pode usar ou dar de presente.', actions: ['usar', 'transferir', 'vender', 'descartar'], stock: [4, 12] };
PLACE_CATS.clandestino ??= { label: 'Submundo', icon: 'eye', color: '#991b1b', hours: [21, 4] };

const DENS = [
  { name: 'Galpão 13 do Porto', sub: 'Armas e munição', district: 'porto', items: ['w-pistol', 'w-revolver', 'w-shotgun', 'w-ammo', 'w-shells', 'w-uzi'] },
  { name: 'Ferro-Velho do Beco', sub: 'Peças e armas pesadas', district: 'vila', items: ['w-ak', 'w-m4', 'w-smg', 'w-sniper', 'w-rifle-scope', 'w-grenade', 'w-dynamite', 'w-ammo'] },
];
onUpgrade(14, (ctx) => {
  const w = ctx.w; if (!w.city) return;
  const used = new Set([...places(w).map((p) => p.node), ...(w.city.houses || []).map((h) => h.node)]); // não ocupa terreno de casa
  const shady = shuffle(residents(w).filter((p) => p.agent?.status === 'ativo' && p.agent.traits.honesty < 0.45 && !p.agent.police && !p.agent.office));
  for (const d of DENS) {
    if (places(w).some((p) => p.name === d.name)) continue;
    const node = freeNode(w, d.district, { used }); used.add(node);
    const [x, y] = pos(w, node);
    const owner = shady.shift() || null;
    const pl = { id: uid(), name: d.name, kind: 'clandestino', sub: d.sub, districtId: districtOfNode(w, node) || d.district, node, x, y, address: address(w, node), hours: [21, 4], companyId: null,
      status: 'aberto', hidden: true, security: 0.2, reputation: 3, ratings: [], banned: [], ledger: [], createdAt: ctx.at.toISOString(),
      catalog: d.items.map((k) => ({ key: k, price: Math.round(PRODUCTS[k].base * (0.9 + Math.random() * 0.25)), stock: 1 + Math.floor(Math.random() * 3) })) };
    if (owner) { pl.sellerId = owner.id; owner.agent.seller = { placeId: pl.id, style: 'clandestino', customers: owner.agent.seller?.customers || {} }; owner.agent.keep = true; owner.agent.underworld = true; }
    w.city.places.push(pl);
  }
  // farmácias passam a vender kits de primeiros socorros
  for (const pl of places(w).filter((p) => p.kind === 'farmacia' && p.catalog && !p.catalog.some((x) => x.key === 'medkit'))) pl.catalog.push({ key: 'medkit', price: Math.round(140 * (0.95 + Math.random() * 0.1)), stock: 6 });
  for (const pl of places(w).filter((p) => p.kind === 'farmacia' && !p.catalog)) pl.catalog = [{ key: 'medkit', price: 140, stock: 6 }];
});

// abordagem policial: quem anda com item clandestino pode ser parado; item escondido em casa quase nunca é achado
onDaily((ctx) => {
  const w = ctx.w; const u = account(w);
  const ill = (u.inventory || []).filter((it) => isIllegal(it.key));
  if (!ill.length) return;
  const exposed = ill.filter((it) => it.state !== 'escondido');
  const risk = Math.min(0.5, exposed.reduce((s, it) => s + (WEAPONS[it.key]?.risk || 0.5) * 0.12, 0) + ill.length * 0.01);
  if (!chance(risk)) return;
  const pool = exposed.length ? exposed : ill;
  const it = pick(pool);
  u.inventory.splice(u.inventory.indexOf(it), 1);
  const fine = round2(Math.max(300, (it.price || PRODUCTS[it.key].base) * 0.6));
  addDebt(w, { kind: 'multa', amount: fine, desc: `Multa: porte de ${it.name} (apreendido)`, dueDays: 5, creditor: 'Polícia de Nexus City', at: ctx.at });
  u.reputation = Math.max(0, (u.reputation || 50) - 6);
  record(ctx, { type: 'apreensao', cat: 'seguranca', title: `Polícia apreende ${it.name} com ${ctx.user?.name || 'um morador'}`, text: `Abordagem de rotina. Multa de ${fine.toLocaleString('pt-BR')} NXC.`, actors: ['me'], importance: 2 });
  services.live?.(w, { kind: 'prisao', personaId: 'me', name: 'Você', text: `Você foi abordado(a) pela polícia: ${it.name} apreendido(a)` });
  if (ctx.live) notify(ctx.uid, { type: 'system', title: '🚔 Abordagem policial', message: `A polícia apreendeu ${it.name} e aplicou multa de ${fine.toLocaleString('pt-BR')} NXC.`, link: '#/banco/pendencias' });
});
export { companies, bankOf };
