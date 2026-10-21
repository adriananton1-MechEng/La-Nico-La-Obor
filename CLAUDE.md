# La Nico la Obor — Site

Site for the Anton family stall at Piața Obor, Bucharest. Being rebuilt from a
presentation site into a shop with accounts, orders and card payments.

## Repo
- GitHub: https://github.com/adriananton1-MechEng/La-Nico-La-Obor
- Single branch: `main` (no other branches without explicit request)
- Live: https://adriananton1-mecheng.github.io/La-Nico-La-Obor/

## Current state — Phases 1–2 complete (Phase 2 unapplied)
Phase 1: front-end rebuilt on the **"Tarabă"** design system; insecure admin
panel removed. Phase 2: schema + RLS + catalogue + cart written, and the shop is
**browsable now** from a preview fixture. Phases 3–7 (accounts, checkout,
payments, admin dashboard, notifications) are **not built**.

**The migrations have never been executed** — no Postgres/Docker was available.
They are statically validated only. Expect small fixes on first `supabase db push`.

### Preview mode
While `assets/js/config.js` still holds placeholders, `isConfigured()` is false
and the catalogue is read from `data/products.json` so the shop can be reviewed.
Checkout is replaced by a "call us" card. Fill in the Supabase URL + anon key and
flip `FEATURES.ordering` to switch over. All `FEATURES` ship `false`.

```
index.html              homepage (hero, today's board, about, products, map, reviews, contact)
retete.html             recipes (salată de vinete, zacuscă)
galerie.html            gallery (loads data/gallery.json)
termeni.html            terms of sale          ─┐
confidentialitate.html  GDPR privacy policy     │ required for a Romanian
cookies.html            cookie policy           │ online shop
livrare.html            delivery & returns     ─┘
produse.html            shop catalogue (JS-rendered from catalog.js)
cos.html                cart (JS-rendered; checkout disabled in preview)
robots.txt, sitemap.xml
assets/css/style.css    the whole design system (tokens → components)
assets/js/site.js       nav, scroll reveal, gallery + lightbox, cookie bar
assets/js/config.js     Supabase URL + anon key (PUBLIC) and FEATURES flags
assets/js/cart.js       cart storage + pure money/qty arithmetic (unit-tested)
assets/js/catalog.js    catalogue access: Supabase, or preview fixture
assets/js/shop.js       shop/cart/board UI wiring
data/gallery.json       { "images": [...] }
data/products.json      PREVIEW catalogue — generated, do not hand-edit
supabase/migrations/    0001 schema · 0002 RLS · 0003 seed (see supabase/README.md)
scripts/                seed parser + preview-catalogue generator
tests/                  node:test suites — run with `npm test`
images/                 art-directed hero (WebP + JPEG, mobile + desktop)
picture/                source art, gitignored — not deployed
```

## Design system — "Tarabă"
Kraft paper ground, ink text, tomato accent, slate chalk price tags.

- Type: **Fraunces** (display, variable — uses its `SOFT`/`WONK` axes) + **Instrument Sans** (UI)
- Signature motif: `.price-tag` — slate chalkboard card, rotated, with a tape corner
- `.chalkboard` + `.board-list` — the "Astăzi la tarabă" dotted-leader price board
- `.edge` — torn-paper section divider, CSS-masked so it inherits the band colour
- Paper grain is a `feTurbulence` data-URI on `body::before`
- Full dark theme via `prefers-color-scheme`, guarded `:root:not([data-theme="light"])`
- **All text pairs verified at WCAG 2.1 AA in both themes.** If you change
  `--tomato`, `--gold`, or any `--text-*` token, re-check contrast — the current
  values are the result of fixing three real failures, not arbitrary choices.

## Content model
- **Static content** (hero, about, recipes, legal) lives in HTML.
- **Products** come from Supabase, or `data/products.json` in preview mode.
  `data/products.json` is **generated** from `supabase/migrations/0003_seed.sql`
  by `scripts/gen-preview-catalogue.mjs`. Never hand-edit it — edit the seed and
  regenerate; `npm test` fails if they drift.
- The homepage "Astăzi la tarabă" board renders from the same catalogue, so
  prices are not written twice.
- **Gallery** is data-driven from `data/gallery.json`.
- **Reviews** come from the embedded Trustindex Google widget. There is no reviews
  table and no review form — don't reintroduce one; the Google widget is the source.
- **Every price in the catalogue is a placeholder** invented during Phase 2. The
  family must correct them in the seed (or the admin panel, once it exists)
  before the shop takes a single real payment.

## Security — read before touching auth or payments
The previous admin panel took a **GitHub PAT with repo write access** and kept it in
`localStorage`. It has been deleted. Do not reintroduce any browser-held credential.

These are non-negotiable, and Phase 2 already encodes 2, 3, 5 and 7 in SQL:
1. Admin is a Supabase account with `profiles.role = 'admin'` + TOTP MFA — never a token in a page.
2. Postgres **Row Level Security is the security boundary**, not the UI. Default deny.
3. **Prices never come from the client.** The cart holds `{product_id, qty}`; an Edge
   Function recomputes every total from the DB.
4. Only the **signature-verified Stripe webhook** may mark an order paid — never a browser redirect.
5. `orders` is written exclusively by the `create-order` Edge Function (service role). No client INSERT.
6. Secrets live only in Edge Function env vars. `.env` is gitignored.
7. Money is `numeric(10,2)` RON. Never a float.

CSP ships as a `<meta>` tag because GitHub Pages cannot set HTTP headers; this means
no `frame-ancestors` and no HSTS. A custom domain behind Cloudflare would fix that.

## Testing
`npm test` runs `node:test` over `tests/`. 63 tests cover money arithmetic in
integer bani, quantity-step snapping, cart immutability, delivery-fee and
minimum-order logic, wrap-around seasonality (Nov→May), seed↔fixture drift, and
a tamper test asserting an edited `localStorage` cart cannot change a price.
There is no browser in this environment, so **nothing is verified visually** and
the Edge Functions and SQL are unexecuted.

Run before committing:
```
npm test
node scripts/gen-preview-catalogue.mjs   # if the seed changed
```

## Standing permissions for Claude
- Create/edit HTML/CSS/JS files and CLAUDE.md in this folder without asking.
- Never create new git branches; work directly on `main`.

## Next steps
The full plan lives at `~/.claude/plans/i-want-to-remake-eager-eagle.md`.
Phase 0 is blocked on the owner: Supabase, Stripe and Resend accounts, plus the
company details (CUI, registration number, sediu) needed to fill the `[DE COMPLETAT]`
placeholders in the legal pages.
