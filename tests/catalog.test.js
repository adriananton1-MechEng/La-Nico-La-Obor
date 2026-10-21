import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  isInSeason, availability, normalizeProduct, groupByCategory,
  unitLabel, monthName,
} from '../assets/js/catalog.js';
import { parseSeed } from '../scripts/seed-parse.mjs';
import { isConfigured, FEATURES } from '../assets/js/config.js';

/* ================================================================ season */

test('isInSeason handles a normal within-year range', () => {
  // April(4) to September(9)
  assert.equal(isInSeason(4, 9, new Date(2026, 5, 1)), true);  // June
  assert.equal(isInSeason(4, 9, new Date(2026, 3, 1)), true);  // April, inclusive
  assert.equal(isInSeason(4, 9, new Date(2026, 8, 1)), true);  // September, inclusive
  assert.equal(isInSeason(4, 9, new Date(2026, 1, 1)), false); // February
});

test('isInSeason handles a wrap-around range (Nov -> May)', () => {
  const inSeason = (monthIndex) => isInSeason(11, 5, new Date(2026, monthIndex, 15));
  assert.equal(inSeason(10), true,  'November');
  assert.equal(inSeason(11), true,  'December');
  assert.equal(inSeason(0),  true,  'January');
  assert.equal(inSeason(4),  true,  'May');
  assert.equal(inSeason(5),  false, 'June');
  assert.equal(inSeason(8),  false, 'September');
  assert.equal(inSeason(9),  false, 'October');
});

test('isInSeason treats null bounds as all year', () => {
  assert.equal(isInSeason(null, null, new Date(2026, 0, 1)), true);
  assert.equal(isInSeason(null, 5, new Date(2026, 7, 1)), true);
  assert.equal(isInSeason(undefined, undefined), true);
});

/* ========================================================== availability */

const covrigi = { in_stock: true, season_start_month: 11, season_end_month: 5 };
const vinete = { in_stock: true, season_start_month: null, season_end_month: null };

test('availability reports out-of-season before stock', () => {
  // October: covrigi are not back yet
  const a = availability(covrigi, new Date(2026, 9, 21));
  assert.equal(a.state, 'season');
  assert.equal(a.buyable, false);
  assert.match(a.label, /noiembrie/);
});

test('availability reports in-stock during the season', () => {
  const a = availability(covrigi, new Date(2026, 11, 1)); // December
  assert.equal(a.state, 'ok');
  assert.equal(a.buyable, true);
});

test('availability reports sold out for an in-season product', () => {
  const a = availability({ ...vinete, in_stock: false }, new Date(2026, 6, 1));
  assert.equal(a.state, 'out');
  assert.equal(a.buyable, false);
});

test('an all-year product in stock is buyable any month', () => {
  for (let m = 0; m < 12; m++) {
    assert.equal(availability(vinete, new Date(2026, m, 10)).buyable, true);
  }
});

/* ============================================================ normalise */

test('normalizeProduct fills defaults', () => {
  const p = normalizeProduct({ slug: 'x', name_ro: 'X', price: '5.50', unit: 'kg' });
  assert.equal(p.price, 5.5);
  assert.equal(p.step, 1);
  assert.equal(p.min_qty, 1);
  assert.equal(p.max_qty, 50);
  assert.equal(p.in_stock, true);
  assert.equal(p.season_start_month, null);
  assert.equal(p.id, 'x', 'falls back to slug when no id');
});

test('normalizeProduct rejects unusable rows', () => {
  const bad = [
    null, undefined, 'x', 42,
    { name_ro: 'no slug', price: 1, unit: 'kg' },
    { slug: 'a', price: 1, unit: 'kg' },               // no name
    { slug: 'a', name_ro: 'A', price: 0, unit: 'kg' }, // zero price
    { slug: 'a', name_ro: 'A', price: -3, unit: 'kg' },
    { slug: 'a', name_ro: 'A', price: 'free', unit: 'kg' },
  ];
  for (const row of bad) {
    assert.equal(normalizeProduct(row), null, `expected null for ${JSON.stringify(row)}`);
  }
});

test('normalizeProduct coerces season months to ints or null', () => {
  const p = normalizeProduct({
    slug: 'x', name_ro: 'X', price: 1, unit: 'kg',
    season_start_month: '11', season_end_month: '5',
  });
  assert.equal(p.season_start_month, 11);
  assert.equal(p.season_end_month, 5);
});

/* ================================================================ labels */

test('unitLabel renders Romanian units', () => {
  assert.equal(unitLabel('kg'), 'kg');
  assert.equal(unitLabel('legatura'), 'legătură');
  assert.equal(unitLabel('sir'), 'șir');
  assert.equal(unitLabel('buc'), 'buc');
  assert.equal(unitLabel('mystery'), 'mystery');
});

test('monthName is 1-indexed Romanian', () => {
  assert.equal(monthName(1), 'ianuarie');
  assert.equal(monthName(11), 'noiembrie');
  assert.equal(monthName(99), '');
});

/* ============================================================== grouping */

test('groupByCategory keeps category order and drops empties', () => {
  const cats = [
    { slug: 'legume', name_ro: 'Legume', sort_order: 10 },
    { slug: 'covrigi-nuci', name_ro: 'Covrigi', sort_order: 20 },
    { slug: 'gol', name_ro: 'Gol', sort_order: 30 },
  ];
  const prods = [
    { slug: 'a', category_slug: 'covrigi-nuci' },
    { slug: 'b', category_slug: 'legume' },
  ];
  const groups = groupByCategory(prods, cats);
  assert.deepEqual(groups.map((g) => g.slug), ['legume', 'covrigi-nuci']);
  assert.equal(groups[0].products[0].slug, 'b');
});

test('groupByCategory collects uncategorised products into Altele', () => {
  const groups = groupByCategory(
    [{ slug: 'orphan', category_slug: null }],
    [{ slug: 'legume', name_ro: 'Legume', sort_order: 10 }],
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].slug, '_other');
});

/* ===================================================== seed <-> fixture
   data/products.json is generated from the SQL seed. If someone edits the
   seed and forgets to regenerate, this fails rather than letting the preview
   shop silently show stale prices. */

test('data/products.json is in sync with 0003_seed.sql', () => {
  const seed = parseSeed(readFileSync('supabase/migrations/0003_seed.sql', 'utf8'));
  const fixture = JSON.parse(readFileSync('data/products.json', 'utf8'));

  assert.equal(seed.products.length, fixture.products.length,
    'product count differs — run: node scripts/gen-preview-catalogue.mjs');
  assert.deepEqual(seed.products, fixture.products,
    'products differ — run: node scripts/gen-preview-catalogue.mjs');
  assert.deepEqual(seed.categories, fixture.categories,
    'categories differ — run: node scripts/gen-preview-catalogue.mjs');
  assert.deepEqual(seed.delivery, fixture.delivery,
    'delivery settings differ — run: node scripts/gen-preview-catalogue.mjs');
});

test('seed parses into something plausible', () => {
  const { products, categories, delivery } = parseSeed(
    readFileSync('supabase/migrations/0003_seed.sql', 'utf8'),
  );
  assert.ok(products.length >= 10, 'expected at least 10 seeded products');
  assert.ok(categories.length >= 2);

  for (const p of products) {
    assert.ok(p.slug && /^[a-z0-9-]+$/.test(p.slug), `bad slug: ${p.slug}`);
    assert.ok(p.name_ro && p.name_ro.length > 1, `bad name: ${p.slug}`);
    assert.ok(typeof p.price === 'number' && p.price > 0, `bad price: ${p.slug}`);
    assert.ok(['kg', 'buc', 'legatura', 'sir'].includes(p.unit), `bad unit: ${p.unit}`);
    assert.ok(p.max_qty >= p.min_qty, `qty range inverted: ${p.slug}`);
    // Season bounds must be both set or both null, matching the DB constraint.
    assert.equal(
      p.season_start_month === null, p.season_end_month === null,
      `season bounds must be paired: ${p.slug}`,
    );
  }

  assert.equal(delivery.city, 'București');
  assert.ok(delivery.min_order > 0);
  assert.ok(delivery.cutoff_hour >= 0 && delivery.cutoff_hour <= 23);
});

test('every seeded product normalises successfully', () => {
  const { products } = parseSeed(readFileSync('supabase/migrations/0003_seed.sql', 'utf8'));
  for (const row of products) {
    assert.notEqual(normalizeProduct(row), null, `failed to normalise ${row.slug}`);
  }
});

/* ================================================================ config */

test('config ships unconfigured, so the site stays in preview mode', () => {
  assert.equal(isConfigured(), false,
    'placeholders must not look configured — otherwise the live site would ' +
    'try to query a non-existent Supabase project');
});

test('ordering and card payments ship switched off', () => {
  assert.equal(FEATURES.ordering, false);
  assert.equal(FEATURES.cardPayments, false);
  assert.equal(FEATURES.accounts, false);
});
