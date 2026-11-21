// Cidade 2D: garagem no mundo aberto, estacionamento salvo e fiscalização de trânsito (multas reais e limitadas).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWorld } from './helpers.js';

const T = await bootWorld();
const D = await import('../server/world/drive.js');
const I = await import('../server/world/inventory.js');
const { bankOf } = await import('../server/world/bank.js');

test('carros comprados aparecem na cidade 2D e o estacionamento é salvo', () => {
  const ctx = T.ctx();
  const car = I.makeItem(ctx, { key: 'car-sedan-vinho', price: 32000 });
  const st = D.driveState(T.w);
  assert.ok(st.cars.some((c) => c.id === car.id && c.sprite === 'trans-am'), 'carro antigo usa a arte da frota nova');
  assert.ok(st.people.length > 10, 'moradores reais viram pedestres');
  D.park(T.w, { itemId: car.id, x: 900, y: 330, a: 1.2 });
  assert.deepEqual(D.driveState(T.w).cars.find((c) => c.id === car.id).parked.x, 900);
  assert.throws(() => D.park(T.w, { itemId: 'nao-e-meu', x: 1, y: 1 }), /não é seu/);
});

test('multa de trânsito vira dívida no banco, com intervalo mínimo por tipo e limite diário', () => {
  const ctx = T.ctx();
  const before = bankOf(T.w).debts.length;
  const r = D.infraction(ctx, { tipo: 'sinal' });
  assert.equal(r.ok, true); assert.equal(r.fine.amount, 293);
  assert.equal(bankOf(T.w).debts.length, before + 1);
  assert.equal(D.infraction(ctx, { tipo: 'sinal' }).ok, false, 'a mesma infração não multa duas vezes seguidas');
  assert.throws(() => D.infraction(ctx, { tipo: 'inventada' }), /desconhecida/);
  for (const t of ['velocidade', 'velocidade-grave', 'velocidade-gravissima', 'estacionamento']) D.infraction(ctx, { tipo: t, kmh: 70, limite: 40 });
  const n = bankOf(T.w).debts.length;
  assert.ok(n - before <= 6);
});

test('mapa v3: estacionamento no mapa novo, aeronaves na garagem, dano e reboque cobrado', async () => {
  const ctx = T.ctx();
  const B = await import('../server/world/bank.js');
  const car = I.makeItem(ctx, { key: 'car-esportivo-verde', price: 78000 });
  const plane = I.makeItem(ctx, { key: 'air-mono-azul', price: 158000 });
  let st = D.driveState(T.w);
  assert.equal(st.map.w, 4096);
  assert.ok(st.cars.some((c) => c.id === plane.id && c.type === 'aeronave' && c.sprite === 'mono-azul'));
  D.park(T.w, { itemId: car.id, x: 3000, y: 2000, a: 0 });
  st = D.driveState(T.w); assert.equal(st.cars.find((c) => c.id === car.id).parked.x, 3000);
  D.damage(T.w, { itemId: car.id, health: 0 });
  B.credit(T.w, 20000, 'teste', ctx.at);
  const before = B.bankOf(T.w).balance;
  const r = D.tow(ctx, { itemId: car.id });
  assert.ok(r.total > 180 && B.bankOf(T.w).balance < before, 'reboque e reparo cobrados');
  st = D.driveState(T.w); const c = st.cars.find((x) => x.id === car.id);
  assert.ok(c.repairUntil && !c.parked, 'na oficina, sem vaga no mapa');
  assert.throws(() => D.tow(ctx, { itemId: car.id }), /oficina/);
});

test('ocorrências do mapa viram acontecimento e ferem o morador atropelado', async () => {
  const ctx = T.ctx();
  const { residents } = await import('../server/world/agents.js');
  const p = residents(T.w).find((x) => x.agent?.status === 'ativo');
  const n0 = T.w.events.length;
  assert.equal(D.incident(ctx, { tipo: 'atropelamento', personaId: p.id, regiao: 'Centro', culpa: true }).ok, true);
  assert.ok(T.w.events.length > n0);
  assert.ok(T.w.events.at(-1).title.includes(p.name));
  assert.ok(p.agent.injuredUntil > new Date().toISOString());
  assert.ok(!D.driveState(T.w).people.some((x) => x.id === p.id), 'ferido não anda pela cidade');
  assert.throws(() => D.incident(ctx, { tipo: 'inventada' }), /desconhecida/);
  assert.equal(D.infraction(ctx, { tipo: 'fuga' }).fine.amount, 2934);
});

test('Construtora e Reforma: catálogo livre, reforma salva e a ilha nova muda com ela', async () => {
  const C = await import('../server/world/construtora.js');
  const { generateCity } = await import('../public/js/drive/mundo.js');
  const v = C.construtoraView(T.w);
  assert.ok(v.items.length > 500, 'catálogo da Construtora');
  assert.ok(v.items.every((i) => i.price === undefined), 'nada à venda');
  const base = generateCity(); const alvo = base.blds.find((b) => b.spr === 'm:construcoes/casa-azul');
  const chave = `${alvo.spr}@${Math.round(alvo.x)},${Math.round(alvo.y)}`;
  const add = [{ id: 'a1', k: 'bld/house', x: -900, y: -2700 }, { id: 'a2', k: 'x/fil-00', x: -800, y: -2700 }, { id: 'a3', k: 'x/montanhas', x: -1200, y: -3000, s: 3 }];
  const floor = [{ k: 'piso/rua', x: -800, y: -2400 }, { k: 'x/rua-reta', x: -768, y: -2400, r: 1.57 }];
  assert.throws(() => C.saveReforma(T.w, { floor: [{ k: 'piso/rua', x: 5, y: 7 }] }), /grade/);
  const s = C.saveReforma(T.w, { add, floor, del: [chave] });
  assert.deepEqual(s.saved, { add: 3, floor: 2, del: 1 });
  const st = D.driveState(T.w);
  const city = generateCity(undefined, { reforma: st.reforma });
  assert.ok(!city.blds.some((b) => b.spr === alvo.spr && b.x === alvo.x && b.y === alvo.y), 'demolição vale');
  assert.equal(city.blds.filter((b) => b.user).length, 2);
  assert.ok(city.props.some((p) => p.user === 'a3' && p.w > 400), 'relevo em escala 3×');
  const at = (x, y) => city.mask[Math.floor((y + city.oy) / city.CS) * city.mw + Math.floor((x + city.ox) / city.CS)];
  assert.equal(at(-790, -2390), 2, 'rua pintada vira pista'); assert.equal(at(-760, -2390), 2, 'rua com textura vira pista');
  assert.equal(at(-4500, -3600), 5, 'canto do mapa é mar');
  assert.equal(at(1075, 120), 5, 'lago da colina');
  assert.ok([6, 9].includes(at(0, -1000)), 'terra firme na ilha');
  assert.equal(at(400, 1140), 5, 'mar ao sul da cidade');
});

test('aviação: aeronaves novas no hangar e física de decolagem, helicóptero, dano e queda', async () => {
  const V = await import('../server/world/vehicles.js');
  const { createPlane, stepPlane, vRotate } = await import('../public/js/drive/plane.js');
  assert.ok(Object.keys(V.AIRCRAFT).length >= 17 && V.AIRCRAFT['aero-airliner'] && V.AIRCRAFT['aero-heli-policia'].heli);
  // mundo de teste: tudo pista (código 7), sem prédios, um "prédio" de 60 de altura em x > 3000
  const world = { W: 4000, H: 1000, cs: 4, mw: 1000, mask: new Uint8Array(1000 * 250).fill(7), heights: new Uint8Array(1000 * 250), bounds: { x0: 0, y0: 0, x1: 4000, y1: 1000 } };
  for (let j = 0; j < 250; j++) for (let i = 750; i < 1000; i++) world.heights[j * 1000 + i] = 60;
  const p = createPlane({ name: 'teste', air: V.AIRCRAFT['aero-mono-azul'].air }, 50, 500, 0);
  const inp = { up: true, lever: 0 };
  let t = 0; while (p.ground && t < 40) { inp.lever = p.v > vRotate(p) ? 1 : 0; const ev = stepPlane(p, inp, world, 1 / 30); t += 1 / 30; if (ev?.takeoff) break; }
  assert.equal(p.ground, false, 'decola ao passar da velocidade de rotação e puxar a alavanca');
  assert.ok(p.eng < 1, 'o motor acelera aos poucos');
  for (let k = 0; k < 60; k++) stepPlane(p, { up: true, lever: 1 }, world, 1 / 30);
  assert.ok(p.h > 5, 'sobe');
  // batida forte num prédio alto: cai
  p.x = 2990; p.h = 10; let ev = null; for (let k = 0; k < 60 && !ev?.crash; k++) ev = stepPlane(p, { up: true, lever: 0 }, world, 1 / 30);
  assert.equal(ev.crash, 'predio');
  // helicóptero: sobe na vertical, paira e pousa suave
  const h = createPlane({ name: 'heli', heli: true, air: V.AIRCRAFT['aero-heli-azul'].air }, 500, 500, 0);
  h.eng = 0.6; stepPlane(h, { lever: 1 }, world, 1 / 30); assert.equal(h.ground, false);
  for (let k = 0; k < 90; k++) stepPlane(h, { lever: 1 }, world, 1 / 30);
  assert.ok(h.h > 30 && h.v < 5, 'sobe parado no ar');
  let land = null; for (let k = 0; k < 900 && !land; k++) { const e = stepPlane(h, { lever: -0.35 }, world, 1 / 30); if (e?.landed || e?.damage || e?.crash) land = e; }
  assert.deepEqual(land, { landed: true });
});

test('aeroporto e trânsito: agenda de voos com moradores, sem repetir passageiro; batida vira notícia', async () => {
  const Fl = await import('../server/world/flights.js');
  const b = Fl.flightBoard(T.w);
  assert.ok(b.flights.length >= 1 && b.flights.every((f) => f.num && f.city && f.status), 'painel mostra voos válidos (depende da hora do teste)');
  const pax = b.flights.filter((f) => f.kind === 'partida').flatMap((f) => f.pax.map((p) => p.id));
  assert.equal(new Set(pax).size, pax.length, 'cada morador em um voo só');
  const V = await import('../server/world/vehicles.js');
  assert.equal(V.AIRCRAFT['aero-biplano'].retired, true, 'biplano fora do aeroporto');
  const p = (await import('../server/world/agents.js')).residents(T.w)[3];
  const r = D.incident(T.ctx(), { tipo: 'acidente', personaId: p.id, regiao: 'Centro', culpa: false, npc: true });
  assert.equal(r.ok, true);
  assert.ok(p.agent.injuredUntil > new Date().toISOString(), 'ferido vai para o hospital');
  assert.ok((T.w.events || []).some((e) => e.title.includes(p.name) && e.title.includes('batida')), 'vira notícia');
});

test('locadora: aluguel diário, vistoria cobra danos e, sem saldo, a locadora processa', async () => {
  const L = await import('../server/world/rental.js');
  const { justice } = await import('../server/world/justice.js');
  const ctx = T.ctx();
  bankOf(T.w).balance = 5000;
  const r = L.rentCar(ctx, { dias: 2 });
  assert.equal(r.total, 170);
  assert.throws(() => L.rentCar(ctx, { dias: 1 }), /já está com um carro/);
  const st = D.driveState(T.w); const car = st.cars.find((c) => c.key === 'rent-rosso');
  assert.ok(car && car.rental && car.sprite === 'stinger', 'carro alugado aparece no mapa');
  D.damage(T.w, { itemId: car.id, health: 80 });
  const back = L.returnCar(ctx);
  assert.equal(back.fee, 180 + 20 * 110); assert.equal(back.paid, 'pago na conta');
  assert.ok(!D.driveState(T.w).cars.some((c) => c.key === 'rent-rosso'), 'carro sai da garagem');
  // sem saldo: processo civil
  L.rentCar(ctx, { dias: 1 }); const c2 = D.driveState(T.w).cars.find((c) => c.key === 'rent-rosso');
  D.damage(T.w, { itemId: c2.id, health: 0 });
  bankOf(T.w).balance = 10;
  const b2 = L.returnCar(ctx);
  assert.equal(b2.paid, 'cobrado na Justiça');
  assert.ok(justice(T.w).cases.some((k) => k.type === 'dano-locacao' && k.plaintiff === 'locadora' && k.amount === b2.fee));
  const PR = await import('../server/world/protests.js');
  const days = Array.from({ length: 30 }, (_, i) => PR.protestsOfDay(20400 + i)).flat();
  assert.ok(days.length > 10 && days.every((p) => p.end > p.start && p.signs.length && PR.PLACES[p.place]), 'agenda de manifestações');
});

test('ferimentos dos moradores: gravidade pela velocidade, internação do grave e alta depois da recuperação', async () => {
  const I = await import('../server/world/injuries.js');
  const { residents } = await import('../server/world/agents.js');
  assert.equal(I.severityOf(10, 0.99), 'leve'); assert.equal(I.severityOf(30, 0.99), 'moderada'); assert.equal(I.severityOf(50, 0.99), 'grave');
  assert.equal(I.severityOf(90, 0.0), 'morte'); assert.equal(I.severityOf(90, 0.99), 'grave', 'morte não é automática');
  const p = residents(T.w)[5];
  const ctx = T.ctx();
  const r = I.injure(ctx, p, { kmh: 55, causa: 'atropelamento', local: 'Centro' });
  assert.equal(r.state, 'ferido_grave');
  I.treat(ctx, p); assert.equal(p.agent.health.state, 'internado');
  assert.ok(I.isAfield(p), 'internado não segue a rotina');
  assert.ok(I.hospitalPatients(T.w).some((x) => x.id === p.id), 'aparece na lista do hospital');
  p.agent.health.hospitalUntil = new Date(Date.now() - 1000).toISOString();
  p.agent.health.recoverUntil = new Date(Date.now() + 5 * 3600000).toISOString();
  I.dailyRecovery(ctx);
  assert.equal(p.agent.health.state, 'em_recuperacao', 'alta do hospital no dia seguinte');
  p.agent.health.recoverUntil = new Date(Date.now() - 1000).toISOString();
  I.dailyRecovery(ctx);
  assert.equal(p.agent.health.state, 'saudavel', 'volta à rotina depois da recuperação');
  // ferimento leve: volta sozinho depois de um tempo
  const q = residents(T.w)[6];
  I.injure(ctx, q, { kmh: 10 }); assert.equal(q.agent.health.state, 'ferido');
  assert.equal(I.injure(ctx, residents(T.w)[7], { kmh: 80 }).state !== undefined, true);
});

test('frota nova: modelos antigos saem da loja, cada sprite da frota existe e tem arte de inventário', async () => {
  const fs = await import('node:fs');
  const { VEHICLES } = await import('../server/world/vehicles.js');
  const aVenda = Object.entries(VEHICLES).filter(([, v]) => !v.retired && !v.rental);
  assert.ok(aVenda.length >= 50, 'frota nova à venda');
  assert.ok(Object.entries(VEHICLES).filter(([k]) => ['car-hatch-cinza', 'car-sedan-vinho', 'car-sorvete'].includes(k)).every(([, v]) => v.retired), 'modelos antigos aposentados');
  for (const [k, v] of Object.entries(VEHICLES)) {
    assert.ok(fs.existsSync(`public/assets/mundo/veiculos/${v.sprite}.png`), `sprite de ${k}`);
    assert.ok(fs.existsSync(`public/assets/items/${k}.png`), `arte de inventário de ${k}`);
  }
});
