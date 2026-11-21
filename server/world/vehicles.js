// VEÍCULOS — carros de verdade na economia: vendidos na concessionária (Oficina Turbo), vão para o inventário,
// você escolhe o principal e passa a se deslocar de carro (paga só o combustível, mais barato que táxi).
import { onUpgrade } from './core.js';
import { account } from './bank.js';
import { PRODUCTS, PLACE_CATS, places, TRANSPORT } from './commerce.js';
import { freeNode, pos, address, districtOfNode } from './map.js';
import { round2, uid } from './util.js';

// sprite: arte top-down em public/assets/rpg/cars (folhas de pixel art do mapa jogável)
export const VEHICLES = {
  'car-hatch-cinza': { name: 'Hatch Urbano', base: 18000, seats: 4, speed: 1, tier: 'popular', sprite: 'jefferson', retired: true },
  'car-compacto-roxo': { name: 'Compacto Neon', base: 21500, seats: 4, speed: 1, tier: 'popular', sprite: 'panto', retired: true },
  'car-sedan-vinho': { name: 'Sedã Executivo Preto', base: 32000, seats: 5, speed: 1.1, tier: 'conforto', sprite: 'trans-am', retired: true },
  'car-van-bege': { name: 'Van Família', base: 36500, seats: 8, speed: 0.9, tier: 'utilitário', sprite: 'van', retired: true },
  'car-pickup-azul': { name: 'Picape Trilha', base: 41000, seats: 5, speed: 1, tier: 'utilitário', sprite: 'pickup', retired: true },
  'car-pickup-laranja': { name: 'Jipe Aventura', base: 39000, seats: 5, speed: 1, tier: 'utilitário', sprite: 'land-roamer', retired: true },
  'car-hatch-rosa': { name: 'Hatch Pop Azul', base: 24000, seats: 4, speed: 1.05, tier: 'popular', sprite: 'arachnid', retired: true },
  'car-classico-amarelo': { name: 'SUV Sol', base: 52000, seats: 5, speed: 1.05, tier: 'conforto', sprite: 'meteor', retired: true },
  'car-esportivo-verde': { name: 'Esportivo GT', base: 78000, seats: 2, speed: 1.35, tier: 'esportivo', sprite: 'rumbler', retired: true },
  'car-conversivel-vermelho': { name: 'Esportivo Turbo Listrado', base: 86000, seats: 2, speed: 1.4, tier: 'esportivo', sprite: 'furore-gt', retired: true },
  'car-tunado-rosa': { name: 'Cupê Laranja', base: 64000, seats: 2, speed: 1.3, tier: 'esportivo', sprite: 't-rex', retired: true },
  'car-sorvete': { name: 'Caminhão Baú', base: 47000, seats: 2, speed: 0.8, tier: 'trabalho', sprite: 'box-truck', retired: true },
  // frota nova (public/assets/mundo/veiculos): à venda na concessionária
  'car-benson': { name: 'Benson', base: 19500, seats: 4, speed: 1, tier: 'popular', sprite: 'benson' },
  'car-jefferson': { name: 'Jefferson', base: 21000, seats: 5, speed: 1, tier: 'popular', sprite: 'jefferson' },
  'car-panto': { name: 'Panto', base: 16500, seats: 2, speed: 0.95, tier: 'popular', sprite: 'panto' },
  'car-wellard': { name: 'Wellard', base: 22500, seats: 5, speed: 1, tier: 'popular', sprite: 'wellard' },
  'car-eddy': { name: 'Eddy', base: 18500, seats: 4, speed: 1, tier: 'popular', sprite: 'eddy' },
  'car-bug': { name: 'Bug', base: 15500, seats: 4, speed: 0.95, tier: 'popular', sprite: 'bug' },
  'car-big-bug': { name: 'Big Bug', base: 17500, seats: 4, speed: 0.95, tier: 'popular', sprite: 'big-bug' },
  'car-morton': { name: 'Morton', base: 20500, seats: 5, speed: 1, tier: 'popular', sprite: 'morton' },
  'car-minx': { name: 'Minx', base: 19000, seats: 4, speed: 1, tier: 'popular', sprite: 'minx' },
  'car-maurice': { name: 'Maurice', base: 20000, seats: 5, speed: 1, tier: 'popular', sprite: 'maurice' },
  'car-a-type': { name: 'A-Type', base: 23500, seats: 4, speed: 1.05, tier: 'popular', sprite: 'a-type' },
  'car-b-type': { name: 'B-Type', base: 24500, seats: 4, speed: 1.05, tier: 'popular', sprite: 'b-type' },
  'car-schmidt': { name: 'Schmidt', base: 31000, seats: 5, speed: 1.1, tier: 'conforto', sprite: 'schmidt' },
  'car-spritzer': { name: 'Spritzer', base: 29500, seats: 4, speed: 1.1, tier: 'conforto', sprite: 'spritzer' },
  'car-romero': { name: 'Romero', base: 34000, seats: 5, speed: 1.05, tier: 'conforto', sprite: 'romero' },
  'car-beamer': { name: 'Beamer', base: 38000, seats: 5, speed: 1.1, tier: 'conforto', sprite: 'beamer' },
  'car-aniston-bd4': { name: 'Aniston BD4', base: 41000, seats: 5, speed: 1.1, tier: 'conforto', sprite: 'aniston-bd4' },
  'car-meteor': { name: 'Meteor', base: 43000, seats: 5, speed: 1.1, tier: 'conforto', sprite: 'meteor' },
  'car-arachnid': { name: 'Arachnid', base: 36000, seats: 4, speed: 1.15, tier: 'conforto', sprite: 'arachnid' },
  'car-hachura': { name: 'Hachura', base: 33000, seats: 4, speed: 1.1, tier: 'conforto', sprite: 'hachura' },
  'car-t-rex': { name: 'T-Rex', base: 45000, seats: 4, speed: 1.2, tier: 'conforto', sprite: 't-rex' },
  'car-dementia': { name: 'Dementia', base: 28000, seats: 4, speed: 1.05, tier: 'conforto', sprite: 'dementia' },
  'car-shark': { name: 'Shark', base: 47000, seats: 4, speed: 1.2, tier: 'conforto', sprite: 'shark' },
  'car-bulwark': { name: 'Bulwark', base: 39000, seats: 5, speed: 1.1, tier: 'conforto', sprite: 'bulwark' },
  'car-stinger': { name: 'Stinger', base: 82000, seats: 2, speed: 1.4, tier: 'esportivo', sprite: 'stinger' },
  'car-jagular-xk': { name: 'Jagular XK', base: 118000, seats: 2, speed: 1.45, tier: 'esportivo', sprite: 'jagular-xk' },
  'car-furore-gt': { name: 'Furore GT', base: 96000, seats: 2, speed: 1.42, tier: 'esportivo', sprite: 'furore-gt' },
  'car-trans-am': { name: 'Trans Am', base: 74000, seats: 2, speed: 1.35, tier: 'esportivo', sprite: 'trans-am' },
  'car-z-type': { name: 'Z-Type', base: 135000, seats: 2, speed: 1.48, tier: 'esportivo', sprite: 'z-type' },
  'car-michelli-roadster': { name: 'Michelli Roadster', base: 88000, seats: 2, speed: 1.4, tier: 'esportivo', sprite: 'michelli-roadster' },
  'car-rumbler': { name: 'Rumbler', base: 79000, seats: 2, speed: 1.38, tier: 'esportivo', sprite: 'rumbler' },
  'car-miara': { name: 'Miara', base: 142000, seats: 2, speed: 1.5, tier: 'esportivo', sprite: 'miara' },
  'car-gt-a1': { name: 'GT-A1', base: 155000, seats: 2, speed: 1.52, tier: 'esportivo', sprite: 'gt-a1' },
  'car-pickup': { name: 'Pickup', base: 41000, seats: 5, speed: 1, tier: 'utilitário', sprite: 'pickup' },
  'car-redneck': { name: 'Redneck', base: 38500, seats: 5, speed: 1, tier: 'utilitário', sprite: 'redneck' },
  'car-van': { name: 'Van', base: 36500, seats: 8, speed: 0.9, tier: 'utilitário', sprite: 'van' },
  'car-box-truck': { name: 'Box Truck', base: 47000, seats: 2, speed: 0.8, tier: 'trabalho', sprite: 'box-truck' },
  'car-u-jerk-truck': { name: 'U-Jerk Truck', base: 52000, seats: 2, speed: 0.82, tier: 'trabalho', sprite: 'u-jerk-truck' },
  'car-land-roamer': { name: 'Land Roamer', base: 57000, seats: 5, speed: 1.05, tier: 'utilitário', sprite: 'land-roamer' },
  'car-stretch-limousine': { name: 'Stretch Limousine', base: 180000, seats: 8, speed: 1.05, tier: 'luxo', sprite: 'stretch-limousine' },
  'car-sports-limousine': { name: 'Sports Limousine', base: 215000, seats: 8, speed: 1.1, tier: 'luxo', sprite: 'sports-limousine' },
  'car-dementia-limousine': { name: 'Dementia Limousine', base: 165000, seats: 8, speed: 1.05, tier: 'luxo', sprite: 'dementia-limousine' },
  'car-karma-bus': { name: 'Karma Bus', base: 92000, seats: 12, speed: 0.82, tier: 'especial', sprite: 'karma-bus' },
  'car-ice-cream-van': { name: 'Ice-Cream Van', base: 71000, seats: 2, speed: 0.85, tier: 'trabalho', sprite: 'ice-cream-van' },
  'car-hot-dog-van': { name: 'Hot Dog Van', base: 68000, seats: 2, speed: 0.85, tier: 'trabalho', sprite: 'hot-dog-van' },
  'car-tv-van': { name: 'TV Van', base: 76000, seats: 4, speed: 0.9, tier: 'trabalho', sprite: 'tv-van' },
  'car-cop-car': { name: 'Viatura descaracterizada (ex-polícia)', base: 58000, seats: 5, speed: 1.25, tier: 'especial', sprite: 'cop-car' },
  'car-special-agent-car': { name: 'Special Agent Car', base: 99000, seats: 5, speed: 1.3, tier: 'especial', sprite: 'special-agent-car' },
  'car-swat-van': { name: 'SWAT Van (ex-tática)', base: 124000, seats: 8, speed: 0.95, tier: 'especial', sprite: 'swat-van' },
  'car-armed-land-roamer': { name: 'Armed Land Roamer', base: 260000, seats: 4, speed: 1.05, tier: 'militar', sprite: 'armed-land-roamer' },
  'car-pacifier': { name: 'Pacifier', base: 480000, seats: 6, speed: 0.85, tier: 'militar', sprite: 'pacifier' },
  'car-tank': { name: 'Tanque', base: 1500000, seats: 3, speed: 0.55, tier: 'militar', sprite: 'tank' },
  // só para aluguel (Locadora Nexus Rent): não aparece na concessionária e não pode ser vendido
  'rent-rosso': { name: 'Rosso GT (alugado)', base: 92000, seats: 2, speed: 1.4, tier: 'esportivo', sprite: 'stinger', rental: true },
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
    if (VEHICLES[key].rental || VEHICLES[key].retired || shop.catalog.some((x) => x.key === key)) continue;
    shop.catalog.push({ key, price: Math.round(VEHICLES[key].base * (0.95 + Math.random() * 0.1)), stock: 1 + Math.floor(Math.random() * 2) });
  }
});

// mundo novo: a concessionária troca o estoque (modelos antigos saem; a frota nova entra). Carros já comprados continuam
// do dono, com a arte nova equivalente.
onUpgrade(19, (ctx) => {
  const w = ctx.w; if (!w.city) return;
  const shop = places(w).find((p) => p.name === 'Oficina Turbo'); if (!shop) return;
  shop.catalog = (shop.catalog || []).filter((x) => !VEHICLES[x.key]?.retired);
  for (const key of Object.keys(VEHICLES)) {
    const v = VEHICLES[key]; if (v.rental || v.retired || shop.catalog.some((x) => x.key === key)) continue;
    shop.catalog.push({ key, price: Math.round(v.base * (0.95 + Math.random() * 0.1)), stock: 1 + Math.floor(Math.random() * 2) });
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
