# La Nico la Obor — Site

Site for the Anton family stall at Piața Obor, Bucharest. Being rebuilt from a
presentation site into a shop with accounts, orders and card payments.

## Repo
- GitHub: https://github.com/adriananton1-MechEng/La-Nico-La-Obor
- Single branch: `main` (no other branches without explicit request)
- Live: https://adriananton1-mecheng.github.io/La-Nico-La-Obor/

## Current state — Phase 1 complete
The static front-end has been rebuilt on the **"Tarabă"** design system and the
insecure admin panel has been removed. Phases 2–7 (database, accounts, checkout,
payments, admin dashboard) are planned but **not yet built**.

```
index.html              homepage (hero, today's board, about, products, map, reviews, contact)
retete.html             recipes (salată de vinete, zacuscă)
galerie.html            gallery (loads data/gallery.json)
termeni.html            terms of sale          ─┐
confidentialitate.html  GDPR privacy policy     │ required for a Romanian
cookies.html            cookie policy           │ online shop
livrare.html            delivery & returns     ─┘
robots.txt, sitemap.xml
assets/css/style.css    the whole design system (tokens → components)
assets/js/site.js       nav, scroll reveal, gallery + lightbox, cookie bar
data/gallery.json       { "images": [...] }
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
- **Static content** (hero, about, products, recipes, legal) lives in HTML.
- **Gallery** is data-driven from `data/gallery.json`.
- **Reviews** come from the embedded Trustindex Google widget. There is no reviews
  table and no review form — don't reintroduce one; the Google widget is the source.
- Prices in the "Astăzi la tarabă" board are **placeholders** pending Phase 2.

## Security — read before touching auth or payments
The previous admin panel took a **GitHub PAT with repo write access** and kept it in
`localStorage`. It has been deleted. Do not reintroduce any browser-held credential.

When Phases 2–7 are built, these are non-negotiable:
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

## Standing permissions for Claude
- Create/edit HTML/CSS/JS files and CLAUDE.md in this folder without asking.
- Never create new git branches; work directly on `main`.

## Next steps
The full plan lives at `~/.claude/plans/i-want-to-remake-eager-eagle.md`.
Phase 0 is blocked on the owner: Supabase, Stripe and Resend accounts, plus the
company details (CUI, registration number, sediu) needed to fill the `[DE COMPLETAT]`
placeholders in the legal pages.
