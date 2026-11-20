// VEÍCULOS — carros de verdade na economia: vendidos na concessionária (Oficina Turbo), vão para o inventário,
// você escolhe o principal e passa a se deslocar de carro (paga só o combustível, mais barato que táxi).
import { onUpgrade } from './core.js';
import { account } from './bank.js';
import { PRODUCTS, PLACE_CATS, places, TRANSPORT } from './commerce.js';
import { freeNode, pos, address, districtOfNode } from './map.js';
import { round2, uid } from './util.js';

// sprite: arte top-down em public/assets/rpg/cars (folhas de pixel art do mapa jogável)
export const VEHICLES = {
  'car-hatch-cinza': { name: 'Hatch Urbano', base: 18000, seats: 4, speed: 1, tier: 'popular', sprite: 'branco' },
  'car-compacto-roxo': { name: 'Compacto Neon', base: 21500, seats: 4, speed: 1, tier: 'popular', sprite: 'roxo' },
  'car-sedan-vinho': { name: 'Sedã Executivo Preto', base: 32000, seats: 5, speed: 1.1, tier: 'conforto', sprite: 'preto' },
  'car-van-bege': { name: 'Van Família', base: 36500, seats: 8, speed: 0.9, tier: 'utilitário', sprite: 'van-branca' },
  'car-pickup-azul': { name: 'Picape Trilha', base: 41000, seats: 5, speed: 1, tier: 'utilitário', sprite: 'picape-azul' },
  'car-pickup-laranja': { name: 'Jipe Aventura', base: 39000, seats: 5, speed: 1, tier: 'utilitário', sprite: 'jipe-verde' },
  'car-hatch-rosa': { name: 'Hatch Pop Azul', base: 24000, seats: 4, speed: 1.05, tier: 'popular', sprite: 'azul' },
  'car-classico-amarelo': { name: 'SUV Sol', base: 52000, seats: 5, speed: 1.05, tier: 'conforto', sprite: 'suv-amarelo' },
  'car-esportivo-verde': { name: 'Esportivo GT', base: 78000, seats: 2, speed: 1.35, tier: 'esportivo', sprite: 'verde' },
  'car-conversivel-vermelho': { name: 'Esportivo Turbo Listrado', base: 86000, seats: 2, speed: 1.4, tier: 'esportivo', sprite: 'esportivo-vermelho' },
  'car-tunado-rosa': { name: 'Cupê Laranja', base: 64000, seats: 2, speed: 1.3, tier: 'esportivo', sprite: 'laranja' },
  'car-sorvete': { name: 'Caminhão Baú', base: 47000, seats: 2, speed: 0.8, tier: 'trabalho', sprite: 'caminhao-branco' },
  // só para aluguel (Locadora Nexus Rent): não aparece na concessionária e não pode ser vendido
  'rent-rosso': { name: 'Rosso GT (alugado)', base: 92000, seats: 2, speed: 1.4, tier: 'esportivo', sprite: 'aluguel-vermelho', rental: true },
};
// aeronaves: pilotáveis no aeroporto do mapa jogável
export const AIRCRAFT = {
  'air-mono-vermelho': { name: 'Monomotor Falcão', base: 145000, seats: 2, tier: 'monomotor', sprite: 'mono-vermelho', air: { thrust: 46, vmax: 230, vstall: 96, turn: 0.95 } },
  'air-mono-azul': { name: 'Monomotor Azulão', base: 158000, seats: 4, tier: 'monomotor', sprite: 'mono-azul', air: { thrust: 48, vmax: 240, vstall: 98, turn: 0.9 } },
  'air-jato-branco': { name: 'Jato Executivo Nexus', base: 690000, seats: 8, tier: 'jato', sprite: 'jato-branco', air: { thrust: 80, vmax: 420, vstall: 140, turn: 0.7 } },
  // folha "Aviação — variações & danificados" (cada uma tem sprite inteiro e danificado)
  // fora de venda (removido do aeroporto); continua aqui só para quem já tinha comprado
  'aero-biplano': { name: 'Biplano Clássico Sol', base: 98000, seats: 2, tier: 'biplano', sprite: 'av-biplano', L: 40, retired: true, air: { thrust: 40, vmax: 190, vstall: 78, turn: 1.15 } },
  'aero-mono-branco': { name: 'Monomotor Gaivota', base: 138000, seats: 2, tier: 'monomotor', sprite: 'av-mono-branco', L: 40, air: { thrust: 47, vmax: 235, vstall: 92, turn: 1 } },
  'aero-mono-azul': { name: 'Monomotor Turbo Anil', base: 172000, seats: 4, tier: 'monomotor', sprite: 'av-mono-azul', L: 42, air: { thrust: 52, vmax: 255, vstall: 96, turn: 0.95 } },
  'aero-jato-vermelho': { name: 'Jato Acrobático Rubi', base: 540000, seats: 2, tier: 'jato', sprite: 'av-jato-vermelho', L: 46, air: { thrust: 88, vmax: 430, vstall: 128, turn: 1.05 } },
  'aero-executivo': { name: 'Jato Executivo Aurora', base: 820000, seats: 10, tier: 'jato', sprite: 'av-executivo', L: 60, air: { thrust: 84, vmax: 440, vstall: 138, turn: 0.72 } },
  'aero-caca-cinza': { name: 'Jato Supersônico Granito', base: 2300000, seats: 1, tier: 'jato supersônico', sprite: 'av-caca-cinza', L: 54, air: { thrust: 130, vmax: 560, vstall: 150, turn: 1.1 } },
  'aero-caca-verde': { name: 'Jato Supersônico Selva', base: 2150000, seats: 1, tier: 'jato supersônico', sprite: 'av-caca-verde', L: 54, air: { thrust: 124, vmax: 540, vstall: 148, turn: 1.12 } },
  'aero-airliner': { name: 'Avião Comercial Nexus 320', base: 9800000, seats: 180, tier: 'comercial', sprite: 'av-airliner', L: 96, air: { thrust: 96, vmax: 470, vstall: 165, turn: 0.45 } },
  'aero-heli-azul': { name: 'Helicóptero Céu Azul', base: 420000, seats: 4, tier: 'helicóptero', sprite: 'av-heli-azul', L: 46, heli: true, air: { thrust: 34, vmax: 170, climb: 46, turn: 1.6 } },
  'aero-heli-amarelo': { name: 'Helicóptero Táxi Aéreo', base: 460000, seats: 6, tier: 'helicóptero', sprite: 'av-heli-amarelo', L: 46, heli: true, air: { thrust: 34, vmax: 175, climb: 44, turn: 1.55 } },
  'aero-heli-verde': { name: 'Helicóptero Mata Atlântica', base: 510000, seats: 6, tier: 'helicóptero', sprite: 'av-heli-verde', L: 48, heli: true, air: { thrust: 36, vmax: 185, climb: 44, turn: 1.5 } },
  'aero-heli-preto': { name: 'Helicóptero Executivo Ônix', base: 690000, seats: 6, tier: 'helicóptero', sprite: 'av-heli-preto', L: 48, heli: true, air: { thrust: 40, vmax: 200, climb: 50, turn: 1.5 } },
  'aero-heli-resgate': { name: 'Helicóptero de Resgate', base: 640000, seats: 5, tier: 'helicóptero', sprite: 'av-heli-resgate', L: 46, heli: true, air: { thrust: 36, vmax: 180, climb: 48, turn: 1.55 } },
  'aero-heli-policia': { name: 'Helicóptero Águia (ex-polícia)', base: 600000, seats: 5, tier: 'helicóptero', sprite: 'av-heli-policia', L: 48, heli: true, air: { thrust: 36, vmax: 180, climb: 48, turn: 1.55 } },
};
export const isAircraft = (key) => Boolean(AIRCRAFT[key]);
for (const [key, v] of Object.entries(AIRCRAFT)) {
  PRODUCTS[key] = { name: v.name, cat: 'veiculos', base: v.base, type: 'aeronave', desc: `${v.seats} lugares · ${v.tier}. Fica no pátio do Aeroporto Nexus: ${v.heli ? 'decola e pousa na vertical, em qualquer lugar livre' : 'acelere na pista e puxe a alavanca para decolar'}.`, actions: ['vender', 'transferir', 'descartar'], stock: [1, 2] };
}
export const isVehicle = (key) => Boolean(VEHICLES[key]);
for (const [key, v] of Object.entries(VEHICLES)) {
  PRODUCTS[key] = { name: v.name, cat: 'veiculos', base: v.base, type: 'veiculo', desc: `${v.seats} lugares · categoria ${v.tier}. Vira seu meio de transporte: você paga só o combustível.`, actions: v.rental ? ['equipar'] : ['equipar', 'vender', 'transferir', 'descartar'], stock: [1, 3] };
}
// carro próprio: combustível por metro (bem mais barato que táxi)
TRANSPORT.carro = { label: 'Carro próprio', fee: (m) => round2(1 + m * 0.0009), needs: 'vehicle' };

onUpgrade(15, (ctx) => {
  const w = ctx.w; if (!w.city) return;
  const shop = places(w).find((p) => p.name === 'Oficina Turbo');
  if (!shop) return;
  shop.sub = 'Concessionária e oficina';
  shop.catalog ??= [];
  for (const key of Object.keys(VEHICLES)) {
    if (VEHICLES[key].rental || shop.catalog.some((x) => x.key === key)) continue;
    shop.catalog.push({ key, price: Math.round(VEHICLES[key].base * (0.95 + Math.random() * 0.1)), stock: 1 + Math.floor(Math.random() * 2) });
  }
});

export function vehicleOf(w) {
  const u = account(w);
  const it = (u.inventory || []).find((x) => x.id === u.devices?.vehicle);
  return it ? { itemId: it.id, key: it.key, name: it.name, ...VEHICLES[it.key], art: `/assets/items/${it.key}.png` } : null;
}
export function equipVehicle(w, it) {
  const u = account(w); u.devices ??= {};
  for (const x of u.inventory || []) if (x !== it && isVehicle(x.key) && x.state === 'equipado') x.state = 'guardado';
  u.devices.vehicle = it.id;
  return `${it.name} agora é o seu carro: escolha "Carro próprio" ao se deslocar pelo mapa.`;
}
export function garage(w) {
  const u = account(w);
  const now = Date.now();
  return (u.inventory || []).filter((x) => isVehicle(x.key) || isAircraft(x.key)).map((x) => {
    // reparo na oficina termina sozinho
    if (x.repairUntil && new Date(x.repairUntil).getTime() <= now) { x.repairUntil = null; x.health = 100; x.history?.push({ at: new Date().toISOString(), text: 'Reparo concluído: voltou para a garagem.' }); }
    const spec = VEHICLES[x.key] || AIRCRAFT[x.key];
    return { id: x.id, key: x.key, name: x.name, price: x.price, state: x.state, main: u.devices?.vehicle === x.id, ...spec, type: isAircraft(x.key) ? 'aeronave' : 'carro',
      health: x.health ?? 100, repairUntil: x.repairUntil || null, art: `/assets/items/${x.key}.png` };
  });
}
// hangar do aeroporto: loja de aeronaves
PLACE_CATS.aviacao ??= { label: 'Aviação', icon: 'rocket', color: '#38bdf8', hours: [6, 22] };
onUpgrade(16, (ctx) => {
  const w = ctx.w; if (!w.city) return;
  if (places(w).some((p) => p.name === 'Hangar Nexus Aviação')) return;
  const used = new Set([...places(w).map((p) => p.node), ...(w.city.houses || []).map((h) => h.node)]); // não ocupa terreno de casa
  const node = freeNode(w, 'tech', { used }); const [x, y] = pos(w, node);
  w.city.places.push({ id: uid(), name: 'Hangar Nexus Aviação', kind: 'aviacao', sub: 'Aeronaves e escola de voo', districtId: districtOfNode(w, node) || 'tech', node, x, y, address: address(w, node), hours: [6, 22],
    companyId: null, status: 'aberto', hidden: false, security: 0.6, reputation: 4.4, ratings: [], banned: [], ledger: [], createdAt: ctx.at.toISOString(),
    catalog: Object.keys(AIRCRAFT).filter((k) => !AIRCRAFT[k].retired).map((k) => ({ key: k, price: Math.round(AIRCRAFT[k].base * (0.96 + Math.random() * 0.08)), stock: 1 + Math.floor(Math.random() * 2) })) });
});
// aeronaves novas (folha de aviação) chegam ao hangar que já existe
onUpgrade(17, (ctx) => {
  const w = ctx.w; if (!w.city) return;
  const shop = places(w).find((p) => p.name === 'Hangar Nexus Aviação'); if (!shop) return;
  shop.catalog ??= [];
  for (const k of Object.keys(AIRCRAFT)) if (!AIRCRAFT[k].retired && !shop.catalog.some((x) => x.key === k)) shop.catalog.push({ key: k, price: Math.round(AIRCRAFT[k].base * (0.96 + Math.random() * 0.08)), stock: 1 + Math.floor(Math.random() * 2) });
// biplano saiu do aeroporto: some da vitrine do hangar
onUpgrade(18, (ctx) => {
  const shop = ctx.w.city && places(ctx.w).find((p) => p.name === 'Hangar Nexus Aviação'); if (!shop?.catalog) return;
  shop.catalog = shop.catalog.filter((x) => !AIRCRAFT[x.key]?.retired);
});
});
