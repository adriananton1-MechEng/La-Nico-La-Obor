-- ============================================================================
-- La Nico la Obor — 0003 seed data
--
-- !!! EVERY PRICE BELOW IS A PLACEHOLDER !!!
-- They mirror the indicative figures on the homepage chalkboard so the shop has
-- something coherent to render. Nicoleta must correct them in the admin panel
-- (Phase 5) before the shop goes live and takes a single real payment.
--
-- Idempotent: safe to re-run. Matching is by slug.
-- ============================================================================

begin;

-- ---------------------------------------------------------------- categories
insert into public.product_categories (slug, name_ro, sort_order) values
  ('legume',       'Legume de sezon',        10),
  ('covrigi-nuci', 'Covrigi de Buzău & nuci', 20)
on conflict (slug) do update
  set name_ro    = excluded.name_ro,
      sort_order = excluded.sort_order;

-- ---------------------------------------------------------------- products
--
-- step/min_qty/max_qty are in the product's own unit: 0.5 kg increments for
-- things sold by weight, whole units for everything else.
insert into public.products (
  slug, name_ro, description_ro, category_id, price, unit,
  step, min_qty, max_qty, in_stock,
  season_start_month, season_end_month, sort_order
)
select
  v.slug, v.name_ro, v.description_ro,
  (select id from public.product_categories where slug = v.category_slug),
  v.price, v.unit, v.step, v.min_qty, v.max_qty, v.in_stock,
  v.season_start, v.season_end, v.sort_order
from (values
  -- slug, name, description, category, price, unit, step, min, max, in_stock, season_start, season_end, sort
  ('vinete', 'Vinete',
   'Culese în zori, cu coaja lucioasă și miezul dens. Cele mai bune pentru salată de vinete coaptă pe flacără sau pentru zacuscă.',
   'legume', 12.00, 'kg', 0.5, 1, 20, true, null, null, 10),

  ('rosii-de-gradina', 'Roșii de grădină',
   'Roșii crescute în pământ, nu în soluție. Se simte la gust și la miros. Bune în salată, cu sare și pâine.',
   'legume', 9.00, 'kg', 0.5, 1, 20, true, null, null, 20),

  ('ardei-kapia', 'Ardei kapia',
   'Dulci și cărnoși, ideali copți. Baza oricărei zacuște serioase.',
   'legume', 14.00, 'kg', 0.5, 1, 20, true, null, null, 30),

  ('ardei-bianca', 'Ardei bianca',
   'Subțiri, palizi și fragezi. Buni cruzi în salate sau umpluți.',
   'legume', 11.00, 'kg', 0.5, 1, 20, true, null, null, 40),

  ('conopida', 'Conopidă',
   'Albă, strânsă, fără pete. Se vinde la bucată, după cum iese din grădină.',
   'legume', 8.00, 'buc', 1, 1, 10, true, null, null, 50),

  ('varza', 'Varză',
   'Varză de toamnă, bună pentru sarmale sau murat.',
   'legume', 5.00, 'buc', 1, 1, 10, true, null, null, 60),

  ('castraveti', 'Castraveți',
   'Cornișon și de salată, după sezon. Crocanți, culeși mici.',
   'legume', 10.00, 'kg', 0.5, 1, 15, true, null, null, 70),

  ('usturoi', 'Usturoi',
   'Usturoi românesc, legat în funie. Mic, tare și iute — nu cel de import.',
   'legume', 6.00, 'legatura', 1, 1, 10, true, null, null, 80),

  ('covrigi-de-buzau', 'Covrigi de Buzău — șir de 50',
   'Aduși proaspăt din Buzău, copți pe vatră după rețeta veche. Crocanți pe afară, moi pe dinăuntru. Un șir întreg, 50 de bucăți.',
   'covrigi-nuci', 25.00, 'sir', 1, 1, 10, true, 11, 5, 90),

  ('nuci', 'Nuci',
   'Nuci de sezon, întregi sau curățate. Pentru cozonac, prăjituri sau pur și simplu cu un pahar de vin fiert.',
   'covrigi-nuci', 35.00, 'kg', 0.5, 1, 10, true, 11, 5, 100)
) as v(
  slug, name_ro, description_ro, category_slug, price, unit,
  step, min_qty, max_qty, in_stock, season_start, season_end, sort_order
)
on conflict (slug) do update
  set name_ro            = excluded.name_ro,
      description_ro      = excluded.description_ro,
      category_id         = excluded.category_id,
      unit                = excluded.unit,
      step                = excluded.step,
      min_qty             = excluded.min_qty,
      max_qty             = excluded.max_qty,
      season_start_month  = excluded.season_start_month,
      season_end_month    = excluded.season_end_month,
      sort_order          = excluded.sort_order;
      -- NOTE: `price` and `in_stock` are deliberately NOT overwritten on
      -- conflict. Once the family has set a real price or marked something sold
      -- out, re-running the seed must not quietly undo their work.

-- ---------------------------------------------------------- delivery settings
--
-- Placeholders too — confirm against livrare.html before launch.
insert into public.delivery_settings (id, city, fee, free_over, min_order, cutoff_hour, is_accepting)
values (1, 'București', 15.00, 150.00, 50.00, 18, true)
on conflict (id) do nothing;

commit;
