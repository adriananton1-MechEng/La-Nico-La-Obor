/* ===========================================================
   Catalogue access.

   One source of truth for "what can I buy", with two backends:

     Supabase (once configured) — authoritative; prices come from Postgres.
     data/products.json         — preview fixture so the shop is reviewable
                                  before the database exists.

   `source` on the returned object says which was used, so the UI can be
   honest about preview mode rather than pretending to be a live shop.
   =========================================================== */

import { SUPABASE_URL, SUPABASE_ANON_KEY, PREVIEW_CATALOGUE, isConfigured } from './config.js';

/* ---------- units ---------- */

const UNIT_LABEL = {
  kg: 'kg',
  buc: 'buc',
  legatura: 'legătură',
  sir: 'șir',
};

export function unitLabel(unit) {
  return UNIT_LABEL[unit] || unit || '';
}

/* ---------- season ----------
   Mirrors public.is_in_season() in 0001_init.sql, including the wrap-around
   for ranges like November(11) -> May(5). Keep the two in step. */

export function isInSeason(startMonth, endMonth, onDate = new Date()) {
  if (startMonth == null || endMonth == null) return true;
  const m = onDate.getMonth() + 1;
  const s = Number(startMonth);
  const e = Number(endMonth);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return true;
  return s <= e ? m >= s && m <= e : m >= s || m <= e;
}

const MONTHS_RO = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];

export function monthName(m) {
  const i = Number(m) - 1;
  return MONTHS_RO[i] || '';
}

/**
 * Why a product can't be bought right now, or null if it can.
 * Returns { state, label } where state is 'ok' | 'out' | 'season'.
 */
export function availability(product, onDate = new Date()) {
  const inSeason = isInSeason(product.season_start_month, product.season_end_month, onDate);
  if (!inSeason) {
    return {
      state: 'season',
      label: `Revine în ${monthName(product.season_start_month)}`,
      buyable: false,
    };
  }
  if (!product.in_stock) {
    return { state: 'out', label: 'Epuizat astăzi', buyable: false };
  }
  return { state: 'ok', label: 'În stoc astăzi', buyable: true };
}

/* ---------- normalisation ----------
   Both backends go through this, so the UI only ever sees one shape. */

export function normalizeProduct(row) {
  if (!row || typeof row !== 'object') return null;
  const price = Number(row.price);
  if (!row.slug || !row.name_ro || !Number.isFinite(price) || price <= 0) return null;

  return {
    id: String(row.id ?? row.slug),
    slug: String(row.slug),
    name_ro: String(row.name_ro),
    description_ro: row.description_ro ? String(row.description_ro) : '',
    category_slug: row.category_slug ? String(row.category_slug) : null,
    price,
    unit: String(row.unit || 'buc'),
    step: posNum(row.step, 1),
    min_qty: posNum(row.min_qty, 1),
    max_qty: posNum(row.max_qty, 50),
    image_path: row.image_path ? String(row.image_path) : null,
    in_stock: row.in_stock !== false,
    season_start_month: intOrNull(row.season_start_month),
    season_end_month: intOrNull(row.season_end_month),
    sort_order: Number(row.sort_order) || 0,
  };
}

function posNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function intOrNull(v) {
  if (v == null || v === '') return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

/* ---------- fetching ---------- */

async function fetchFromSupabase() {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    Accept: 'application/json',
  };
  const base = SUPABASE_URL.replace(/\/+$/, '');

  const [prodRes, catRes, delRes] = await Promise.all([
    fetch(`${base}/rest/v1/products?is_active=eq.true&order=sort_order.asc`, { headers }),
    fetch(`${base}/rest/v1/product_categories?is_active=eq.true&order=sort_order.asc`, { headers }),
    fetch(`${base}/rest/v1/delivery_settings?id=eq.1&limit=1`, { headers }),
  ]);

  if (!prodRes.ok) throw new Error(`products: HTTP ${prodRes.status}`);
  if (!catRes.ok) throw new Error(`categories: HTTP ${catRes.status}`);

  const [products, categories, delivery] = await Promise.all([
    prodRes.json(), catRes.json(), delRes.ok ? delRes.json() : [],
  ]);

  return {
    products,
    categories,
    delivery: Array.isArray(delivery) ? delivery[0] : delivery,
  };
}

async function fetchPreview() {
  const res = await fetch(PREVIEW_CATALOGUE, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`preview catalogue: HTTP ${res.status}`);
  return res.json();
}

/**
 * Load the catalogue.
 * @returns {Promise<{source, products, byId, bySlug, categories, delivery}>}
 */
export async function loadCatalogue() {
  const live = isConfigured();
  const raw = live ? await fetchFromSupabase() : await fetchPreview();

  const products = (raw.products || [])
    .map(normalizeProduct)
    .filter(Boolean)
    .sort((a, b) => a.sort_order - b.sort_order || a.name_ro.localeCompare(b.name_ro, 'ro'));

  const byId = {};
  const bySlug = {};
  for (const p of products) {
    byId[p.id] = p;
    bySlug[p.slug] = p;
  }

  const categories = (raw.categories || [])
    .filter((c) => c && c.slug && c.name_ro)
    .map((c) => ({ slug: String(c.slug), name_ro: String(c.name_ro), sort_order: Number(c.sort_order) || 0 }))
    .sort((a, b) => a.sort_order - b.sort_order);

  const d = raw.delivery || {};
  const delivery = {
    city: d.city || 'București',
    fee: Number(d.fee ?? 0),
    free_over: d.free_over == null ? null : Number(d.free_over),
    min_order: Number(d.min_order ?? 0),
    cutoff_hour: Number.isFinite(Number(d.cutoff_hour)) ? Number(d.cutoff_hour) : 18,
    is_accepting: d.is_accepting !== false,
    notice_ro: d.notice_ro || null,
  };

  return { source: live ? 'supabase' : 'preview', products, byId, bySlug, categories, delivery };
}

/** Group products under their category, preserving category order. */
export function groupByCategory(products, categories) {
  const groups = categories.map((c) => ({ ...c, products: [] }));
  const index = new Map(groups.map((g) => [g.slug, g]));
  const loose = { slug: '_other', name_ro: 'Altele', products: [] };

  for (const p of products) {
    const g = p.category_slug ? index.get(p.category_slug) : null;
    (g || loose).products.push(p);
  }
  if (loose.products.length) groups.push(loose);
  return groups.filter((g) => g.products.length);
}
