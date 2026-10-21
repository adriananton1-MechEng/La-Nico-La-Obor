/* ===========================================================
   Cart — storage and pure arithmetic.

   SECURITY: the cart stores ONLY { id, qty }. It never stores or sends a
   price. Everything in `priceCart` below is for DISPLAY ONLY; the
   create-order Edge Function recomputes every figure from the products
   table and is the sole authority on what a customer is charged. If these
   two ever disagree, the server is right and the browser is wrong.

   Money is handled in integer bani internally, so 0.1 + 0.2 problems can't
   reach a total.
   =========================================================== */

export const CART_KEY = 'lanico.cart.v1';
export const MAX_LINES = 40;

/* ---------- money ---------- */

/** RON -> bani (integer). */
export function toBani(ron) {
  return Math.round(Number(ron) * 100);
}

/** bani -> RON, as a number with at most 2 decimals. */
export function toRon(bani) {
  return Math.round(bani) / 100;
}

/** Format for display, Romanian convention: "12,50 lei". */
export function formatRon(ron) {
  const n = Number.isFinite(Number(ron)) ? Number(ron) : 0;
  return n.toFixed(2).replace('.', ',') + ' lei';
}

/* ---------- quantity ---------- */

/**
 * Snap a requested quantity onto the product's allowed grid.
 * Fresh produce is sold in steps (0.5 kg, 1 buc), with a floor and a ceiling.
 * Returns 0 for anything that isn't a usable positive number.
 */
export function clampQty(qty, product = {}) {
  const step = numOr(product.step, 1);
  const min = numOr(product.min_qty, step);
  const max = numOr(product.max_qty, 99);

  let q = Number(qty);
  if (!Number.isFinite(q) || q <= 0) return 0;

  // Snap to the nearest step, working in thousandths to dodge float drift.
  const stepTh = Math.round(step * 1000);
  const qTh = Math.round(q * 1000);
  q = (Math.round(qTh / stepTh) * stepTh) / 1000;

  if (q < min) q = min;
  if (q > max) q = max;

  return round3(q);
}

function numOr(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/* ---------- pure line operations ----------
   All of these take a lines array and return a NEW array. */

/** Add to an existing line, or append a new one. */
export function addLine(lines, id, qty, product = {}) {
  if (!id) return lines.slice();
  const out = lines.slice();
  const at = out.findIndex((l) => l.id === id);

  if (at === -1) {
    if (out.length >= MAX_LINES) return out;
    const q = clampQty(qty, product);
    if (q <= 0) return out;
    out.push({ id, qty: q });
    return out;
  }

  // Sum first, then clamp, so adding 0.5 + 0.5 lands on 1 rather than
  // clamping each half up to the minimum.
  const summed = round3(out[at].qty + Number(qty || 0));
  const q = clampQty(summed, product);
  if (q <= 0) return removeLine(out, id);
  out[at] = { id, qty: q };
  return out;
}

/** Set a line to an exact quantity. Zero or less removes it. */
export function setLine(lines, id, qty, product = {}) {
  const q = clampQty(qty, product);
  if (q <= 0) return removeLine(lines, id);

  const out = lines.slice();
  const at = out.findIndex((l) => l.id === id);
  if (at === -1) {
    if (out.length >= MAX_LINES) return out;
    out.push({ id, qty: q });
  } else {
    out[at] = { id, qty: q };
  }
  return out;
}

export function removeLine(lines, id) {
  return lines.filter((l) => l.id !== id);
}

/** Number of distinct products in the cart. */
export function lineCount(lines) {
  return lines.length;
}

/* ---------- display pricing (NOT authoritative) ---------- */

/**
 * Work out what the cart looks like it costs, for rendering only.
 *
 * @param lines        [{ id, qty }]
 * @param productsById { [id]: { price, unit, name_ro, ... } }
 * @param delivery     { fee, free_over, min_order }
 * @returns { items, subtotal, deliveryFee, total, belowMinimum, shortfall, missing }
 */
export function priceCart(lines, productsById = {}, delivery = {}) {
  const items = [];
  const missing = [];
  let subtotalBani = 0;

  for (const line of lines) {
    const p = productsById[line.id];
    if (!p) {
      // Product withdrawn or renamed since it went in the cart.
      missing.push(line.id);
      continue;
    }
    const unitBani = toBani(p.price);
    const lineBani = Math.round(unitBani * line.qty);
    subtotalBani += lineBani;
    items.push({
      id: line.id,
      qty: line.qty,
      name: p.name_ro,
      unit: p.unit,
      unitPrice: toRon(unitBani),
      lineTotal: toRon(lineBani),
    });
  }

  const feeBani = toBani(numOr(delivery.fee, 0) === 0 ? 0 : delivery.fee);
  const freeOverBani = delivery.free_over == null ? null : toBani(delivery.free_over);
  const minOrderBani = toBani(delivery.min_order || 0);

  // Free delivery once the basket clears the threshold.
  let appliedFeeBani = feeBani;
  if (subtotalBani === 0) appliedFeeBani = 0;
  else if (freeOverBani != null && subtotalBani >= freeOverBani) appliedFeeBani = 0;

  const belowMinimum = subtotalBani > 0 && subtotalBani < minOrderBani;

  return {
    items,
    missing,
    subtotal: toRon(subtotalBani),
    deliveryFee: toRon(appliedFeeBani),
    total: toRon(subtotalBani + appliedFeeBani),
    belowMinimum,
    shortfall: belowMinimum ? toRon(minOrderBani - subtotalBani) : 0,
    freeDeliveryShortfall:
      freeOverBani != null && subtotalBani > 0 && subtotalBani < freeOverBani
        ? toRon(freeOverBani - subtotalBani)
        : 0,
  };
}

/* ---------- delivery date ---------- */

/**
 * Next-day delivery, pushed a further day when past the cut-off hour.
 * Returns a YYYY-MM-DD string.
 */
export function nextDeliveryDate(now = new Date(), cutoffHour = 18) {
  const d = new Date(now.getTime());
  const offset = d.getHours() >= cutoffHour ? 2 : 1;
  d.setDate(d.getDate() + offset);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* ---------- validation ---------- */

/** Reject anything that isn't a plausible stored cart. */
export function sanitize(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const id = typeof entry.id === 'string' ? entry.id : null;
    const qty = Number(entry.qty);
    if (!id || !Number.isFinite(qty) || qty <= 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, qty: round3(qty) });
    if (out.length >= MAX_LINES) break;
  }
  return out;
}

/* ---------- storage ----------
   Wrapped because localStorage throws outright in some privacy modes. */

export function load(storage = globalThis.localStorage) {
  try {
    return sanitize(JSON.parse(storage.getItem(CART_KEY) || '[]'));
  } catch (e) {
    return [];
  }
}

export function save(lines, storage = globalThis.localStorage) {
  try {
    storage.setItem(CART_KEY, JSON.stringify(sanitize(lines)));
    return true;
  } catch (e) {
    return false;
  }
}

export function clear(storage = globalThis.localStorage) {
  try {
    storage.removeItem(CART_KEY);
  } catch (e) { /* nothing we can do */ }
}
