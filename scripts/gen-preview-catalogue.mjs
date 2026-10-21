/* Regenerate data/products.json from the SQL seed.
   Run after editing supabase/migrations/0003_seed.sql:
     node scripts/gen-preview-catalogue.mjs
*/
import { readFileSync, writeFileSync } from 'node:fs';
import { parseSeed } from './seed-parse.mjs';

const SEED = 'supabase/migrations/0003_seed.sql';
const OUT = 'data/products.json';

const { categories, products, delivery } = parseSeed(readFileSync(SEED, 'utf8'));

if (!products.length) {
  console.error(`No products parsed from ${SEED} — refusing to write an empty catalogue.`);
  process.exit(1);
}

const payload = {
  _comment:
    'PREVIEW CATALOGUE — generated from supabase/migrations/0003_seed.sql by ' +
    'scripts/gen-preview-catalogue.mjs. Do not hand-edit; edit the seed and ' +
    'regenerate. Prices are PLACEHOLDERS. Once Supabase is configured, the ' +
    'database is authoritative and this file is ignored.',
  generated_from: SEED,
  categories,
  products,
  delivery,
};

writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
console.log(`${OUT}: ${products.length} products, ${categories.length} categories`);
for (const p of products) {
  const season = p.season_start_month ? ` [${p.season_start_month}-${p.season_end_month}]` : '';
  console.log(`  ${p.slug.padEnd(20)} ${String(p.price).padStart(7)} lei / ${p.unit}${season}`);
}
