# La Nico la Obor

Site-ul afacerii de familie **La Nico la Obor** — legume de sezon și covrigi
tradiționali de Buzău, din Piața Obor, București. Țarc 81.

🔗 https://adriananton1-mecheng.github.io/La-Nico-La-Obor/

## Pagini

| Pagină | Conținut |
|---|---|
| `index.html` | Prima pagină — povestea, tabla cu prețurile zilei, produse, hartă, recenzii, contact |
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

## Stadiu

Etapa 1 (redesign complet + eliminarea vechiului panou de administrare) este
finalizată. Urmează magazinul online: conturi de client, coș, comandă cu plata
prin card sau ramburs, și panou de administrare pentru comenzi.

> **Înainte de lansarea magazinului** trebuie completate datele firmei
> (denumire, CUI, nr. Registrul Comerțului, sediu, e-mail) în paginile legale —
> sunt marcate cu `[DE COMPLETAT]`. De asemenea, taxa de livrare, comanda minimă
> și ora-limită din `livrare.html` trebuie confirmate.
