// VEÍCULOS — carros de verdade na economia: vendidos na concessionária (Oficina Turbo), vão para o inventário,
// você escolhe o principal e passa a se deslocar de carro (paga só o combustível, mais barato que táxi).
import { onUpgrade } from './core.js';
import { account } from './bank.js';
import { PRODUCTS, places, TRANSPORT } from './commerce.js';
import { round2 } from './util.js';

export const VEHICLES = {
  'car-hatch-cinza': { name: 'Hatch Urbano', base: 18000, seats: 4, speed: 1, tier: 'popular' },
  'car-compacto-roxo': { name: 'Compacto Neon', base: 21500, seats: 4, speed: 1, tier: 'popular' },
  'car-sedan-vinho': { name: 'Sedã Executivo', base: 32000, seats: 5, speed: 1.1, tier: 'conforto' },
  'car-van-bege': { name: 'Van Família', base: 36500, seats: 8, speed: 0.9, tier: 'utilitário' },
  'car-pickup-azul': { name: 'Picape Trilha', base: 41000, seats: 5, speed: 1, tier: 'utilitário' },
  'car-pickup-laranja': { name: 'Picape Sol', base: 39000, seats: 5, speed: 1, tier: 'utilitário' },
  'car-hatch-rosa': { name: 'Hatch Pop', base: 24000, seats: 4, speed: 1.05, tier: 'popular' },
  'car-classico-amarelo': { name: 'Clássico 70', base: 52000, seats: 2, speed: 1.1, tier: 'colecionador' },
  'car-esportivo-verde': { name: 'Esportivo GT', base: 78000, seats: 2, speed: 1.35, tier: 'esportivo' },
  'car-conversivel-vermelho': { name: 'Conversível Riviera', base: 86000, seats: 2, speed: 1.3, tier: 'esportivo' },
  'car-tunado-rosa': { name: 'Tunado Turbo', base: 64000, seats: 2, speed: 1.4, tier: 'esportivo' },
  'car-sorvete': { name: 'Food truck de sorvete', base: 47000, seats: 2, speed: 0.8, tier: 'trabalho' },
};
export const isVehicle = (key) => Boolean(VEHICLES[key]);
for (const [key, v] of Object.entries(VEHICLES)) {
  PRODUCTS[key] = { name: v.name, cat: 'veiculos', base: v.base, type: 'veiculo', desc: `${v.seats} lugares · categoria ${v.tier}. Vira seu meio de transporte: você paga só o combustível.`, actions: ['equipar', 'vender', 'transferir', 'descartar'], stock: [1, 3] };
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
    if (shop.catalog.some((x) => x.key === key)) continue;
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
  return (u.inventory || []).filter((x) => isVehicle(x.key)).map((x) => ({ id: x.id, key: x.key, name: x.name, price: x.price, state: x.state, main: u.devices?.vehicle === x.id, ...VEHICLES[x.key], art: `/assets/items/${x.key}.png` }));
}
