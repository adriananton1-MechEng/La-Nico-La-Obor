/* ===========================================================
   Shop UI — catalogue listing, quantity steppers, cart page.

   Loaded as a module on produse.html and cos.html, and (for the header
   cart badge only) on every other page.

   Prices rendered here are informational. The create-order Edge Function
   recomputes every total server-side; see assets/js/cart.js.
   =========================================================== */

import { loadCatalogue, groupByCategory, availability, unitLabel } from './catalog.js';
import { FEATURES, SHOP } from './config.js';
import {
  load as loadCart, save as saveCart, clear as clearCart,
  addLine, setLine, removeLine, lineCount,
  priceCart, clampQty, formatRon, nextDeliveryDate,
} from './cart.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of kids) {
    if (c == null) continue;
    n.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return n;
}

/* ---------- shared state ---------- */

let cart = [];
let cat = null;  // { byId, products, categories, delivery, source }

/* ---------- header badge ---------- */

function paintBadge() {
  const n = lineCount(cart);
  $$('[data-cart-count]').forEach((node) => {
    node.textContent = n ? String(n) : '';
    node.hidden = n === 0;
  });
  $$('[data-cart-link]').forEach((node) => {
    node.setAttribute('aria-label', n ? `Coș — ${n} produse` : 'Coș — gol');
  });
}

function commit() {
  saveCart(cart);
  paintBadge();
}

/* ---------- announcements (screen readers + visible toast) ---------- */

function announce(msg) {
  const live = $('#shopLive');
  if (live) live.textContent = msg;
}

/* ---------- quantity stepper ---------- */

function stepper(product, initial, onChange) {
  const input = el('input', {
    type: 'number',
    class: 'qty-input',
    value: String(initial),
    min: String(product.min_qty),
    max: String(product.max_qty),
    step: String(product.step),
    inputmode: 'decimal',
    'aria-label': `Cantitate ${product.name_ro} (${unitLabel(product.unit)})`,
  });

  const bump = (delta) => {
    const next = clampQty(Number(input.value || 0) + delta, product);
    input.value = String(next || product.min_qty);
    onChange(Number(input.value));
  };

  const minus = el('button', {
    type: 'button', class: 'qty-btn', 'aria-label': 'Scade cantitatea',
    onclick: () => bump(-product.step),
  }, '−');

  const plus = el('button', {
    type: 'button', class: 'qty-btn', 'aria-label': 'Crește cantitatea',
    onclick: () => bump(product.step),
  }, '+');

  input.addEventListener('change', () => {
    const next = clampQty(input.value, product);
    input.value = String(next || product.min_qty);
    onChange(Number(input.value));
  });

  return el('div', { class: 'qty' },
    minus,
    input,
    el('span', { class: 'qty-unit' }, unitLabel(product.unit)),
    plus,
  );
}

/* ---------- product card ---------- */

function productCard(p) {
  const av = availability(p);

  const tag = el('div', { class: 'price-tag', 'aria-label': `${p.price} lei pe ${unitLabel(p.unit)}` },
    el('span', { class: 'amount' }, String(p.price).replace('.', ',')),
    el('span', { class: 'unit' }, `lei / ${unitLabel(p.unit)}`),
  );

  const head = el('div', { class: 'product-head' },
    el('div', {},
      el('h3', {}, p.name_ro),
      el('p', { class: 'sub' }, el('span', { class: 'stock', dataset: { state: av.state === 'ok' ? 'in' : av.state } }, av.label)),
    ),
    tag,
  );

  const body = el('div', { class: 'product-body' },
    head,
    p.description_ro ? el('p', {}, p.description_ro) : null,
  );

  if (!av.buyable) {
    body.append(el('div', { class: 'product-foot' },
      el('span', { class: 'muted-note' },
        av.state === 'season'
          ? `Nu e sezon acum — ${av.label.toLowerCase()}.`
          : 'Întrebați-ne la telefon dacă mai avem.'),
    ));
    return el('article', { class: 'product is-unavailable', dataset: { slug: p.slug } }, body);
  }

  let pending = p.min_qty;
  const existing = cart.find((l) => l.id === p.id);
  if (existing) pending = existing.qty;

  const addBtn = el('button', { type: 'button', class: 'btn btn-sm' },
    existing ? 'Actualizează' : 'Adaugă în coș');

  addBtn.addEventListener('click', () => {
    cart = setLine(cart, p.id, pending, p);
    commit();
    addBtn.textContent = 'Adăugat ✓';
    announce(`${p.name_ro}: ${pending} ${unitLabel(p.unit)} în coș.`);
    setTimeout(() => { addBtn.textContent = 'Actualizează'; }, 1600);
  });

  body.append(el('div', { class: 'product-foot' },
    stepper(p, pending, (v) => { pending = v; }),
    addBtn,
  ));

  return el('article', { class: 'product', dataset: { slug: p.slug } }, body);
}

/* ---------- catalogue page ---------- */

function renderCatalogue(root) {
  const groups = groupByCategory(cat.products, cat.categories);
  root.replaceChildren();

  if (!groups.length) {
    root.append(el('div', { class: 'empty-state' }, 'Catalogul este în pregătire.'));
    return;
  }

  for (const g of groups) {
    const grid = el('div', { class: 'grid-products' }, ...g.products.map(productCard));
    root.append(
      el('div', { class: 'catalogue-group' },
        el('h2', { class: 'group-title', id: `cat-${g.slug}` }, g.name_ro),
        grid,
      ),
    );
  }
}

/* ---------- cart page ---------- */

function renderCart(root, summaryRoot) {
  const priced = priceCart(cart, cat.byId, cat.delivery);

  root.replaceChildren();

  if (priced.missing.length) {
    // Silently drop anything no longer on sale, and say so.
    for (const id of priced.missing) cart = removeLine(cart, id);
    commit();
    root.append(el('div', { class: 'note' },
      el('strong', {}, 'Atenție: '),
      'unele produse nu mai sunt disponibile și au fost scoase din coș.'));
  }

  if (!cart.length) {
    root.append(el('div', { class: 'empty-state' },
      el('p', {}, 'Coșul este gol.'),
      el('p', { class: 'mt-6' },
        el('a', { href: 'produse.html', class: 'btn' }, 'Vezi produsele →')),
    ));
    summaryRoot.replaceChildren();
    return;
  }

  const rows = priced.items.map((item) => {
    const p = cat.byId[item.id];
    const line = el('div', { class: 'cart-line', dataset: { id: item.id } });

    line.append(
      el('div', { class: 'cart-line-main' },
        el('h3', {}, item.name),
        el('p', { class: 'muted-note' }, `${formatRon(item.unitPrice)} / ${unitLabel(item.unit)}`),
      ),
      stepper(p, item.qty, (v) => {
        cart = setLine(cart, item.id, v, p);
        commit();
        renderCart(root, summaryRoot);
      }),
      el('div', { class: 'cart-line-total' }, formatRon(item.lineTotal)),
      el('button', {
        type: 'button', class: 'cart-remove',
        'aria-label': `Scoate ${item.name} din coș`,
        onclick: () => {
          cart = removeLine(cart, item.id);
          commit();
          announce(`${item.name} scos din coș.`);
          renderCart(root, summaryRoot);
        },
      }, '×'),
    );
    return line;
  });

  root.append(el('div', { class: 'cart-lines' }, ...rows));

  /* ---- summary ---- */
  const sum = el('div', { class: 'info-card cart-summary' },
    el('h3', {}, 'Sumar comandă'),
    el('dl', { class: 'totals' },
      row('Produse', formatRon(priced.subtotal)),
      row('Livrare', priced.deliveryFee === 0 ? 'Gratuită' : formatRon(priced.deliveryFee)),
      row('Total', formatRon(priced.total), 'grand'),
    ),
  );

  if (priced.belowMinimum) {
    sum.append(el('p', { class: 'warn-note' },
      `Comanda minimă este ${formatRon(cat.delivery.min_order)}. `
      + `Mai adăugați ${formatRon(priced.shortfall)}.`));
  } else if (priced.freeDeliveryShortfall > 0) {
    sum.append(el('p', { class: 'muted-note' },
      `Adăugați ${formatRon(priced.freeDeliveryShortfall)} și livrarea este gratuită.`));
  }

  sum.append(el('p', { class: 'muted-note mt-6' },
    `Livrare în ${cat.delivery.city}, estimat `
    + `${nextDeliveryDate(new Date(), cat.delivery.cutoff_hour)}.`));

  // Checkout, or an honest explanation of why it isn't open yet.
  if (FEATURES.ordering && cat.source === 'supabase' && cat.delivery.is_accepting) {
    sum.append(el('p', { class: 'mt-6' },
      el('a', {
        href: 'comanda.html',
        class: 'btn btn-lg btn-block',
        'aria-disabled': priced.belowMinimum ? 'true' : null,
      }, 'Continuă la comandă →')));
  } else {
    sum.append(
      el('div', { class: 'note mt-6' },
        el('strong', {}, 'Comenzile online se deschid în curând. '),
        'Până atunci, sunați-ne și pregătim coșul exact așa cum l-ați făcut aici.'),
      el('p', { class: 'mt-6' },
        el('a', { href: `tel:${SHOP.phone}`, class: 'btn btn-lg btn-block' },
          `Sună ${SHOP.phoneDisplay}`)),
    );
  }

  sum.append(el('p', { class: 'center mt-6' },
    el('button', {
      type: 'button', class: 'link-btn',
      onclick: () => {
        cart = [];
        clearCart();
        paintBadge();
        announce('Coșul a fost golit.');
        renderCart(root, summaryRoot);
      },
    }, 'Golește coșul')));

  summaryRoot.replaceChildren(sum);
}

function row(label, value, cls) {
  return el('div', { class: cls ? `total-row ${cls}` : 'total-row' },
    el('dt', {}, label),
    el('dd', {}, value),
  );
}

/* ---------- homepage "Astăzi la tarabă" board ----------
   Reads the same catalogue as the shop, so prices are never written twice. */

function renderBoard(root) {
  const rows = cat.products.map((p) => {
    const av = availability(p);
    return el('li', { dataset: { out: av.buyable ? 'false' : 'true' } },
      el('span', { class: 'name' }, p.name_ro),
      el('span', { class: 'leader' }),
      el('span', { class: 'val' },
        av.state === 'season'
          ? av.label.replace('Revine în', 'din')
          : `${String(p.price).replace('.', ',')} lei / ${unitLabel(p.unit)}`),
    );
  });

  root.replaceChildren(...(rows.length
    ? rows
    : [el('li', {}, el('span', { class: 'name' }, 'Revenim curând cu prețurile zilei.'))]));
}

/* ---------- preview-mode banner ---------- */

function previewBanner() {
  return el('div', { class: 'preview-banner', role: 'status' },
    el('strong', {}, 'Previzualizare. '),
    'Prețurile afișate sunt orientative, iar comanda online nu este încă activă. ',
    el('a', { href: `tel:${SHOP.phone}` }, `Sunați-ne la ${SHOP.phoneDisplay}`),
    ' pentru prețul zilei.',
  );
}

/* ---------- init ---------- */

async function init() {
  cart = loadCart();
  paintBadge();

  const catalogueRoot = $('#catalogueRoot');
  const cartRoot = $('#cartRoot');
  const cartSummary = $('#cartSummary');
  const boardRoot = $('#boardRoot');
  if (!catalogueRoot && !cartRoot && !boardRoot) return;  // badge-only page

  // The board is a <ul>, so its placeholders must be <li>; the others take blocks.
  const blockRoot = catalogueRoot || cartRoot;
  if (blockRoot) {
    blockRoot.replaceChildren(el('p', { class: 'empty-state' }, 'Se încarcă…'));
  }

  try {
    cat = await loadCatalogue();
  } catch (err) {
    if (blockRoot) {
      blockRoot.replaceChildren(el('div', { class: 'empty-state' },
        el('p', {}, 'Nu putem încărca produsele momentan.'),
        el('p', { class: 'mt-6' },
          el('a', { href: `tel:${SHOP.phone}`, class: 'btn' },
            `Sunați-ne: ${SHOP.phoneDisplay}`)),
      ));
    }
    if (boardRoot) {
      boardRoot.replaceChildren(el('li', {},
        el('span', { class: 'name' }, 'Prețurile nu pot fi încărcate acum.'),
        el('span', { class: 'leader' }),
        el('span', { class: 'val' }, SHOP.phoneDisplay),
      ));
    }
    return;
  }

  // Drop any cart lines whose product has vanished from the catalogue.
  const before = cart.length;
  cart = cart.filter((l) => cat.byId[l.id]);
  if (cart.length !== before) commit();

  const banner = $('#previewSlot');
  if (banner && cat.source === 'preview') banner.replaceChildren(previewBanner());

  if (boardRoot) renderBoard(boardRoot);
  if (catalogueRoot) renderCatalogue(catalogueRoot);
  if (cartRoot && cartSummary) renderCart(cartRoot, cartSummary);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
