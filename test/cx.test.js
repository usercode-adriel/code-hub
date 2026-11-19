// Reconstrução visual: rostos em pixel para os personagens e celulares compráveis/equipáveis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootWorld } from './helpers.js';

const T = await bootWorld();
const { people } = await import('../server/world/agents.js');
const { isPixel, pickPixel, pixelTiles } = await import('../server/pixelfaces.js');
const I = await import('../server/world/inventory.js');
const D = await import('../server/world/devices.js');
const { account } = await import('../server/world/bank.js');
const { PRODUCTS, places } = await import('../server/world/commerce.js');

test('retratos em pixel: manifesto carregado e sem retratos excluídos', () => {
  assert.ok(pixelTiles().length >= 100);
  assert.ok(pixelTiles().every((t) => ['m', 'f'].includes(t.g)));
});

test('todas as pessoas do mundo ganham rosto em pixel, sem repetir enquanto há retratos', async () => {
  await T.advance(1);
  const list = people(T.w);
  assert.ok(list.length > 20);
  const px = list.filter((p) => isPixel(p.avatar));
  assert.ok(px.length >= list.length - 2, `${px.length}/${list.length} com rosto pixel`);
  const unique = new Set(px.filter((p) => !p.pxShared).map((p) => p.avatar));
  assert.equal(unique.size, px.filter((p) => !p.pxShared).length);
  // gênero respeitado
  for (const p of px.slice(0, 20)) { const t = pixelTiles().find((x) => x.url === p.avatar); assert.equal(t.g, p.gender === 'm' ? 'm' : 'f'); }
  // profissão com uniforme
  assert.equal(pixelTiles().find((t) => t.url === pickPixel({ id: 'x', gender: 'm', job: 'policial militar' }).url).role, 'policia');
});

test('celulares: estão nas lojas, vão para o inventário e podem ser equipados e trocados', () => {
  assert.ok(PRODUCTS['phone-quantum-z'] && PRODUCTS['phone-urban-mini']);
  const tv = places(T.w).find((p) => p.name === 'TechVision Store');
  assert.ok(tv.catalog.some((x) => x.key === 'phone-nova-pro'), 'TechVision vende a linha de celulares');
  const ctx = T.ctx();
  const a = I.makeItem(ctx, { key: 'phone-urban-mini', price: 500 });
  const b = I.makeItem(ctx, { key: 'phone-codeniac-x', price: 6400 });
  assert.ok(a.actions.includes('equipar'));
  I.itemAction(ctx, a.id, 'equipar');
  assert.equal(D.phoneOf(T.w).name, 'Urban Mini');
  assert.equal(D.phoneOf(T.w).locked.length > 0, true);
  I.itemAction(ctx, b.id, 'equipar');
  const ph = D.phoneOf(T.w);
  assert.equal(ph.name, 'Codeniac X');
  assert.equal(ph.locked.length, 0, 'profissional libera todos os apps');
  assert.equal(account(T.w).inventory.find((x) => x.id === a.id).state, 'guardado');
  I.itemAction(ctx, b.id, 'descartar');
  assert.equal(D.phoneOf(T.w), null, 'descartar desequipa');
  const wl = D.walletOf(T.w);
  assert.ok(wl.docs.length >= 1 && wl.cards.length >= 1);
});
