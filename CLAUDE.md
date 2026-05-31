# La Nico la Obor — Site

Static HTML site for the Anton family vegetable stall at Piața Obor, Bucharest.

## Repo
- GitHub: https://github.com/adriananton1-MechEng/La-Nico-La-Obor
- Single branch: `main` (no other branches without explicit request)
- Live (after enabling Pages): https://adriananton1-mecheng.github.io/La-Nico-La-Obor/

## Structure
```
index.html      — homepage (hero, about, products, find us, reviews, contact)
retete.html     — recipes (salată de vinete, zacuscă)
galerie.html    — gallery (loads from data/gallery.json)
admin.html      — admin panel (noindex; GitHub-PAT auth)
assets/
  css/style.css — shared site styles
  css/admin.css — admin-only styles
  js/site.js    — public site JS (reviews, gallery, lightbox)
  js/admin.js   — admin panel (GitHub Contents API client)
data/
  reviews.json  — { "reviews": [...] }
  gallery.json  — { "images": [...] }
images/         — gallery image files (uploaded via admin)
```

## Content model
- **Reviews** and **gallery** are data-driven (JSON files). The admin panel commits changes directly to GitHub via the Contents API; GitHub Pages serves them on next build.
- **Static content** (hero, about, products, recipes, contact) lives in HTML.

## Admin panel
- `admin.html` requires a GitHub Personal Access Token with write access to this repo (fine-grained: Contents read+write; or classic with `repo` scope).
- Token is stored only in browser localStorage. No server.
- Image upload writes to `images/<date>-<slug>-<id>.<ext>` via the Contents API.

## Standing permissions for Claude
- Create CLAUDE.md and any HTML/CSS/JS files in this folder without asking.
- Never create new git branches; work directly on `main`.

## TODO / future
- Wire review submission form to a real backend (Web3Forms or similar) once the family has an email — currently submissions are stored in localStorage only.
- Replace the search-based Google Maps embed with an exact place embed if Google indexes the listing.
