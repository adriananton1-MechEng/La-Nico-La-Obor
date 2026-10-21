# La Nico la Obor

Site-ul afacerii de familie **La Nico la Obor** — legume de sezon și covrigi
tradiționali de Buzău, din Piața Obor, București. Țarc 81.

🔗 https://adriananton1-mecheng.github.io/La-Nico-La-Obor/

## Pagini

| Pagină | Conținut |
|---|---|
| `index.html` | Prima pagină — povestea, tabla cu prețurile zilei, hartă, recenzii, contact |
| `produse.html` | Catalogul de produse, cu cantități și adăugare în coș |
| `cos.html` | Coșul de cumpărături |
| `retete.html` | Rețete de familie: salată de vinete, zacuscă |
| `galerie.html` | Galerie foto |
| `livrare.html` | Condiții de livrare și retur |
| `termeni.html` | Termeni și condiții |
| `confidentialitate.html` | Politica de confidențialitate (GDPR) |
| `cookies.html` | Politica de cookies |

## Contact

- **Telefon:** 0727 774 567 (Anton Nicoleta)
- **Adresă:** Țarc 81, Piața Obor, București
- **Program:** zilnic, după programul pieței

## Dezvoltare

Site static (HTML/CSS/JS), fără pas de build, găzduit pe GitHub Pages.
Orice `git push` pe `main` publică modificările.

Pentru previzualizare locală:

```bash
python -m http.server 8777
# apoi deschideți http://127.0.0.1:8777
```

### Structură

```
assets/css/style.css   sistemul de design „Tarabă" (tokens → componente)
assets/js/site.js      navigație, animații, galerie, lightbox, banner cookies
data/gallery.json      lista fotografiilor din galerie
images/                imaginile optimizate (WebP + JPEG, mobil + desktop)
picture/               surse originale (exclus din git)
```

Galeria se editează în `data/gallery.json`:

```json
{ "images": [ { "src": "images/nume.jpg", "alt": "...", "caption": "..." } ] }
```

### Teste

```bash
npm test
```

Dacă modificați `supabase/migrations/0003_seed.sql` (produse sau prețuri),
regenerați catalogul de previzualizare:

```bash
node scripts/gen-preview-catalogue.mjs
```

## Stadiu

**Etapele 1–2 finalizate.** Redesign complet, vechiul panou de administrare
eliminat, catalog și coș funcționale. Site-ul rulează momentan în
**modul previzualizare**: produsele se încarcă din `data/products.json`, iar
comanda online nu este activă — în locul ei apare un buton de telefon.

Urmează: conturi de client, comandă cu plata prin card sau ramburs,
și panou de administrare pentru comenzi. Acestea au nevoie de conturi
Supabase, Stripe și Resend.

> **Înainte de lansarea magazinului** trebuie completate datele firmei
> (denumire, CUI, nr. Registrul Comerțului, sediu, e-mail) în paginile legale —
> sunt marcate cu `[DE COMPLETAT]`. De asemenea, taxa de livrare, comanda minimă
> și ora-limită din `livrare.html` trebuie confirmate.
