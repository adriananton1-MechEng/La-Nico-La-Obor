/* End-to-end exercise of the data path the shop UI depends on:
   preview fixture -> normalise -> group -> price a basket.

   There is no browser in CI here, so this covers everything up to the DOM.
   It is the closest thing to "the shop works" that can be asserted without
   rendering, and it would have caught a bad fixture, a unit typo, or a
   pricing regression. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { normalizeProduct, groupByCategory, availability, unitLabel } from '../assets/js/catalog.js';
import { addLine, setLine, priceCart, formatRon, load, save, sanitize } from '../assets/js/cart.js';

const fixture = JSON.parse(readFileSync('data/products.json', 'utf8'));

function buildCatalogue() {
  const products = fixture.products
    .map(normalizeProduct)
    .filter(Boolean)
    .sort((a, b) => a.sort_order - b.sort_order);
  const byId = {};
  for (const p of products) byId[p.id] = p;
  return { products, byId, categories: fixture.categories, delivery: fixture.delivery };
}

test('the whole preview catalogue normalises with nothing dropped', () => {
  const { products } = buildCatalogue();
  assert.equal(products.length, fixture.products.length,
    'a product was silently dropped during normalisation');
});

test('every product has a renderable unit label', () => {
  for (const p of buildCatalogue().products) {
    const label = unitLabel(p.unit);
    assert.ok(label && label.length > 0, `no unit label for ${p.slug}`);
    assert.notEqual(label, 'undefined');
  }
});

test('products group under their real categories, none orphaned', () => {
  const { products, categories } = buildCatalogue();
  const groups = groupByCategory(products, categories);
  const other = groups.find((g) => g.slug === '_other');
  assert.equal(other, undefined, `uncategorised products: ${other?.products.map((p) => p.slug)}`);
  const total = groups.reduce((n, g) => n + g.products.length, 0);
  assert.equal(total, products.length);
});

test('seasonal products are correctly unavailable in October', () => {
  const { byId } = buildCatalogue();
  const covrigi = byId['covrigi-de-buzau'];
  assert.ok(covrigi, 'covrigi missing from fixture');
  const av = availability(covrigi, new Date(2026, 9, 21)); // 21 Oct
  assert.equal(av.buyable, false);
  assert.equal(av.state, 'season');
});

test('seasonal products become available in December', () => {
  const { byId } = buildCatalogue();
  const av = availability(byId['covrigi-de-buzau'], new Date(2026, 11, 5));
  assert.equal(av.buyable, true);
});

test('a realistic basket prices correctly end to end', () => {
  const { byId, delivery } = buildCatalogue();

  // 2 kg vinete (12) + 1.5 kg rosii (9) + 1 conopida (8)
  let cart = [];
  cart = addLine(cart, 'vinete', 2, byId['vinete']);
  cart = addLine(cart, 'rosii-de-gradina', 1.5, byId['rosii-de-gradina']);
  cart = addLine(cart, 'conopida', 1, byId['conopida']);

  const r = priceCart(cart, byId, delivery);
  assert.equal(r.items.length, 3);
  assert.equal(r.subtotal, 24 + 13.5 + 8);          // 45.50
  assert.equal(r.subtotal, 45.5);
  assert.equal(r.belowMinimum, true, 'min_order is 50, so 45.50 is short');
  assert.equal(r.shortfall, 4.5);
  assert.equal(r.deliveryFee, delivery.fee);
  assert.equal(r.total, 45.5 + delivery.fee);
  assert.equal(formatRon(r.total), '60,50 lei');
});

test('clearing the minimum removes the warning', () => {
  const { byId, delivery } = buildCatalogue();
  let cart = addLine([], 'vinete', 5, byId['vinete']); // 60
  const r = priceCart(cart, byId, delivery);
  assert.equal(r.subtotal, 60);
  assert.equal(r.belowMinimum, false);
  assert.equal(r.shortfall, 0);
});

test('a large basket earns free delivery', () => {
  const { byId, delivery } = buildCatalogue();
  let cart = addLine([], 'nuci', 5, byId['nuci']); // 35 * 5 = 175 > 150
  const r = priceCart(cart, byId, delivery);
  assert.equal(r.subtotal, 175);
  assert.equal(r.deliveryFee, 0);
  assert.equal(r.total, 175);
});

test('quantity steps are respected through the whole flow', () => {
  const { byId } = buildCatalogue();
  const vinete = byId['vinete'];
  assert.equal(vinete.step, 0.5);

  // Asking for 2.3 kg of something sold in half-kilos snaps to 2.5
  let cart = setLine([], 'vinete', 2.3, vinete);
  assert.equal(cart[0].qty, 2.5);

  // And cannot exceed max_qty
  cart = setLine(cart, 'vinete', 999, vinete);
  assert.equal(cart[0].qty, vinete.max_qty);
});

test('a cart survives a save/load round trip through storage', () => {
  const { byId, delivery } = buildCatalogue();
  const map = new Map();
  const storage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };

  let cart = addLine([], 'vinete', 2, byId['vinete']);
  cart = addLine(cart, 'usturoi', 2, byId['usturoi']);
  save(cart, storage);

  const restored = load(storage);
  assert.deepEqual(restored, cart);

  const a = priceCart(cart, byId, delivery);
  const b = priceCart(restored, byId, delivery);
  assert.equal(a.total, b.total, 'totals must be stable across persistence');
});

test('THE TAMPER TEST: a hand-edited cart cannot change the price', () => {
  const { byId, delivery } = buildCatalogue();

  // Someone opens devtools and rewrites localStorage with a 1-ban price.
  const forged = [{ id: 'nuci', qty: 5, price: 0.01, unit_price: 0.01, line_total: 0.05 }];

  const lines = sanitize(forged);
  assert.deepEqual(lines, [{ id: 'nuci', qty: 5 }],
    'injected price fields must not survive sanitisation');

  const r = priceCart(lines, byId, delivery);
  assert.equal(r.subtotal, 175, 'price must come from the catalogue, not the cart');
  assert.equal(r.items[0].unitPrice, 35);

  // Note: this proves the *client* ignores injected prices. The real guarantee
  // is that create-order recomputes server-side and never reads a client price
  // at all -- see supabase/migrations/0002_rls.sql (no client INSERT on orders).
});

test('a product withdrawn from sale drops out of the basket, unbilled', () => {
  const { byId, delivery } = buildCatalogue();
  const cart = [{ id: 'vinete', qty: 1 }, { id: 'produs-sters', qty: 10 }];
  const r = priceCart(cart, byId, delivery);
  assert.deepEqual(r.missing, ['produs-sters']);
  assert.equal(r.subtotal, 12);
  assert.equal(r.items.length, 1);
});

test('fixture prices are flagged as placeholders', () => {
  assert.match(fixture._comment, /PLACEHOLDER/i,
    'the fixture must announce that its prices are not real, so nobody ships it as live pricing');
  assert.match(fixture._comment, /generated from/i);
});
