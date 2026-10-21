import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  toBani, toRon, formatRon,
  clampQty, addLine, setLine, removeLine, lineCount,
  priceCart, nextDeliveryDate, sanitize,
  load, save, clear, CART_KEY, MAX_LINES,
} from '../assets/js/cart.js';

/* ---------- a stand-in for localStorage ---------- */
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _dump: () => Object.fromEntries(map),
  };
}
const throwingStorage = {
  getItem() { throw new Error('denied'); },
  setItem() { throw new Error('denied'); },
  removeItem() { throw new Error('denied'); },
};

/* ================================================================= money */

test('toBani / toRon round-trip without float drift', () => {
  assert.equal(toBani(12.5), 1250);
  assert.equal(toBani(9.99), 999);
  assert.equal(toBani(0.1), 10);
  assert.equal(toRon(1250), 12.5);
  assert.equal(toRon(999), 9.99);
});

test('money arithmetic avoids the classic 0.1+0.2 error', () => {
  // 0.1 + 0.2 === 0.30000000000000004 in float
  assert.equal(toRon(toBani(0.1) + toBani(0.2)), 0.3);
});

test('formatRon uses Romanian decimal comma', () => {
  assert.equal(formatRon(12.5), '12,50 lei');
  assert.equal(formatRon(9), '9,00 lei');
  assert.equal(formatRon(0), '0,00 lei');
  assert.equal(formatRon('nonsense'), '0,00 lei');
});

/* ============================================================== clampQty */

const kg = { step: 0.5, min_qty: 1, max_qty: 20 };
const buc = { step: 1, min_qty: 1, max_qty: 10 };

test('clampQty snaps to the product step', () => {
  assert.equal(clampQty(1.2, kg), 1);     // nearest 0.5
  assert.equal(clampQty(1.3, kg), 1.5);
  assert.equal(clampQty(2.75, kg), 3);
  assert.equal(clampQty(2.4, buc), 2);
});

test('clampQty enforces the floor and ceiling', () => {
  assert.equal(clampQty(0.2, kg), 1);     // below min -> min
  assert.equal(clampQty(999, kg), 20);    // above max -> max
  assert.equal(clampQty(10, buc), 10);
  assert.equal(clampQty(11, buc), 10);
});

test('clampQty rejects non-quantities', () => {
  for (const bad of [0, -5, NaN, Infinity, null, undefined, 'abc', {}]) {
    assert.equal(clampQty(bad, kg), 0, `expected 0 for ${String(bad)}`);
  }
});

test('clampQty falls back sanely with no product metadata', () => {
  assert.equal(clampQty(3, {}), 3);
  assert.equal(clampQty(3), 3);
});

/* ========================================================= line handling */

test('addLine appends a new line', () => {
  const out = addLine([], 'p1', 2, kg);
  assert.deepEqual(out, [{ id: 'p1', qty: 2 }]);
});

test('addLine sums into an existing line before clamping', () => {
  // Two half-kilos should become one kilo, not clamp to the 1kg minimum twice.
  let c = addLine([], 'p1', 0.5, kg);
  assert.equal(c[0].qty, 1); // first add is floored to min 1
  c = addLine(c, 'p1', 0.5, kg);
  assert.equal(c[0].qty, 1.5);
});

test('addLine respects max_qty when summing', () => {
  let c = addLine([], 'p1', 19, kg);
  c = addLine(c, 'p1', 5, kg);
  assert.equal(c[0].qty, 20);
});

test('addLine is immutable', () => {
  const before = [{ id: 'p1', qty: 1 }];
  const after = addLine(before, 'p2', 1, kg);
  assert.equal(before.length, 1, 'original array must not be mutated');
  assert.equal(after.length, 2);
});

test('addLine ignores a missing id and caps total lines', () => {
  assert.deepEqual(addLine([], '', 1, kg), []);
  let c = [];
  for (let i = 0; i < MAX_LINES + 5; i++) c = addLine(c, `p${i}`, 1, buc);
  assert.equal(c.length, MAX_LINES);
});

test('setLine sets an exact quantity; zero removes', () => {
  let c = addLine([], 'p1', 5, kg);
  c = setLine(c, 'p1', 2, kg);
  assert.equal(c[0].qty, 2);
  c = setLine(c, 'p1', 0, kg);
  assert.deepEqual(c, []);
});

test('removeLine and lineCount', () => {
  let c = addLine(addLine([], 'p1', 1, kg), 'p2', 1, buc);
  assert.equal(lineCount(c), 2);
  c = removeLine(c, 'p1');
  assert.deepEqual(c, [{ id: 'p2', qty: 1 }]);
  assert.equal(lineCount(removeLine(c, 'nope')), 1);
});

/* ============================================================= priceCart */

const products = {
  vinete: { name_ro: 'Vinete', price: 12, unit: 'kg' },
  rosii:  { name_ro: 'Roșii',  price: 9,  unit: 'kg' },
  odd:    { name_ro: 'Ciudat', price: 9.99, unit: 'kg' },
};
const delivery = { fee: 15, free_over: 150, min_order: 50 };

test('priceCart totals a basket', () => {
  const r = priceCart([{ id: 'vinete', qty: 2 }, { id: 'rosii', qty: 1 }], products, delivery);
  assert.equal(r.subtotal, 33);          // 24 + 9
  assert.equal(r.deliveryFee, 15);
  assert.equal(r.total, 48);
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].lineTotal, 24);
});

test('priceCart handles fractional quantities exactly', () => {
  const r = priceCart([{ id: 'odd', qty: 1.5 }], products, delivery);
  assert.equal(r.subtotal, 14.99);       // 9.99 * 1.5 = 14.985 -> 14.99
  assert.equal(r.items[0].unitPrice, 9.99);
});

test('priceCart waives delivery above the free-over threshold', () => {
  const r = priceCart([{ id: 'vinete', qty: 20 }], products, delivery); // 240
  assert.equal(r.subtotal, 240);
  assert.equal(r.deliveryFee, 0);
  assert.equal(r.total, 240);
  assert.equal(r.freeDeliveryShortfall, 0);
});

test('priceCart reports the shortfall under the minimum order', () => {
  const r = priceCart([{ id: 'rosii', qty: 1 }], products, delivery); // 9
  assert.equal(r.belowMinimum, true);
  assert.equal(r.shortfall, 41);
  assert.equal(r.freeDeliveryShortfall, 141);
});

test('priceCart charges nothing for delivery on an empty cart', () => {
  const r = priceCart([], products, delivery);
  assert.equal(r.subtotal, 0);
  assert.equal(r.deliveryFee, 0);
  assert.equal(r.total, 0);
  assert.equal(r.belowMinimum, false);
});

test('priceCart flags products that have disappeared', () => {
  const r = priceCart([{ id: 'vinete', qty: 1 }, { id: 'gone', qty: 3 }], products, delivery);
  assert.deepEqual(r.missing, ['gone']);
  assert.equal(r.subtotal, 12, 'a withdrawn product must not be billed');
  assert.equal(r.items.length, 1);
});

test('priceCart tolerates absent delivery settings', () => {
  const r = priceCart([{ id: 'vinete', qty: 1 }], products, {});
  assert.equal(r.subtotal, 12);
  assert.equal(r.deliveryFee, 0);
  assert.equal(r.total, 12);
});

/* ======================================================== delivery dates */

test('nextDeliveryDate is tomorrow before the cut-off', () => {
  // 21 Oct 2026, 10:00 -> 22 Oct
  assert.equal(nextDeliveryDate(new Date(2026, 9, 21, 10, 0), 18), '2026-10-22');
});

test('nextDeliveryDate slips a day after the cut-off', () => {
  // 21 Oct 2026, 19:00 -> 23 Oct
  assert.equal(nextDeliveryDate(new Date(2026, 9, 21, 19, 0), 18), '2026-10-23');
});

test('nextDeliveryDate crosses month and year boundaries', () => {
  assert.equal(nextDeliveryDate(new Date(2026, 9, 31, 10, 0), 18), '2026-11-01');
  assert.equal(nextDeliveryDate(new Date(2026, 11, 31, 19, 0), 18), '2027-01-02');
});

/* ============================================================== sanitize */

test('sanitize strips anything that is not a usable line', () => {
  const dirty = [
    { id: 'ok', qty: 2 },
    { id: 'ok', qty: 9 },        // duplicate -> dropped
    { id: 'bad', qty: -1 },
    { id: 'bad2', qty: 'abc' },
    { id: 123, qty: 1 },         // non-string id
    null, 'nope', 42,
    { qty: 1 },                  // no id
  ];
  assert.deepEqual(sanitize(dirty), [{ id: 'ok', qty: 2 }]);
});

test('sanitize rejects non-arrays and caps length', () => {
  for (const bad of [null, undefined, {}, 'x', 7]) {
    assert.deepEqual(sanitize(bad), []);
  }
  const many = Array.from({ length: MAX_LINES + 10 }, (_, i) => ({ id: `p${i}`, qty: 1 }));
  assert.equal(sanitize(many).length, MAX_LINES);
});

test('sanitize does not let a stored price sneak in', () => {
  const out = sanitize([{ id: 'p1', qty: 1, price: 0.01, total: 0.01 }]);
  assert.deepEqual(out, [{ id: 'p1', qty: 1 }]);
  assert.equal('price' in out[0], false, 'price must never survive into the cart');
});

/* =============================================================== storage */

test('save then load round-trips', () => {
  const s = fakeStorage();
  assert.equal(save([{ id: 'p1', qty: 2 }], s), true);
  assert.deepEqual(load(s), [{ id: 'p1', qty: 2 }]);
});

test('load returns an empty cart for corrupt stored JSON', () => {
  assert.deepEqual(load(fakeStorage({ [CART_KEY]: '{not json' })), []);
  assert.deepEqual(load(fakeStorage({ [CART_KEY]: '"a string"' })), []);
  assert.deepEqual(load(fakeStorage()), []);
});

test('storage helpers survive a browser that forbids localStorage', () => {
  assert.deepEqual(load(throwingStorage), []);
  assert.equal(save([{ id: 'p1', qty: 1 }], throwingStorage), false);
  assert.doesNotThrow(() => clear(throwingStorage));
});

test('a tampered stored cart cannot inject a price', () => {
  // Simulates someone editing localStorage by hand.
  const s = fakeStorage({
    [CART_KEY]: JSON.stringify([{ id: 'vinete', qty: 1, price: 0.01 }]),
  });
  const lines = load(s);
  assert.deepEqual(lines, [{ id: 'vinete', qty: 1 }]);
  // And pricing still uses the catalogue, not the injected value.
  const r = priceCart(lines, products, delivery);
  assert.equal(r.subtotal, 12);
});
