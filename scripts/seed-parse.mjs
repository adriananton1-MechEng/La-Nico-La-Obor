/* ===========================================================
   Parse supabase/migrations/0003_seed.sql into plain objects.

   This exists so data/products.json (the preview catalogue the site reads
   before Supabase is configured) is generated from the same seed that
   populates the real database — one source of truth, with a test that fails
   if the two drift apart.
   =========================================================== */

/** Tokenise a SQL `values (...), (...)` block into arrays of JS values. */
export function parseValueRows(block) {
  const rows = [];
  let i = 0;
  const n = block.length;

  while (i < n) {
    // find the start of the next row
    while (i < n && block[i] !== '(') i++;
    if (i >= n) break;
    i++; // past '('

    const row = [];
    let token = '';
    let inString = false;
    let depth = 0;

    for (; i < n; i++) {
      const ch = block[i];

      if (inString) {
        if (ch === "'") {
          // '' is an escaped single quote inside a SQL string
          if (block[i + 1] === "'") { token += "'"; i++; }
          else { inString = false; row.push(decodeToken(token, true)); token = ''; }
        } else {
          token += ch;
        }
        continue;
      }

      if (ch === "'") { inString = true; token = ''; continue; }
      if (ch === '(') { depth++; token += ch; continue; }
      if (ch === ')' && depth > 0) { depth--; token += ch; continue; }

      if (ch === ',' && depth === 0) {
        const t = token.trim();
        if (t) row.push(decodeToken(t, false));
        token = '';
        continue;
      }

      if (ch === ')' && depth === 0) {
        const t = token.trim();
        if (t) row.push(decodeToken(t, false));
        i++;
        break;
      }

      token += ch;
    }

    if (row.length) rows.push(row);

    // stop at the end of the values list
    while (i < n && /[\s,]/.test(block[i])) i++;
    if (block[i] !== '(') break;
  }

  return rows;
}

function decodeToken(t, wasQuoted) {
  if (wasQuoted) return t.replace(/\s+/g, ' ').trim();
  const low = t.toLowerCase();
  if (low === 'null') return null;
  if (low === 'true') return true;
  if (low === 'false') return false;
  const num = Number(t);
  return Number.isFinite(num) ? num : t;
}

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
}

/** Pull the block of rows following a given anchor. */
function blockAfter(sql, anchorRe, endRe) {
  const m = anchorRe.exec(sql);
  if (!m) return null;
  const from = m.index + m[0].length;
  const rest = sql.slice(from);
  const end = endRe.exec(rest);
  return rest.slice(0, end ? end.index : rest.length);
}

/**
 * @param {string} sqlText contents of 0003_seed.sql
 * @returns {{categories:Array,products:Array,delivery:Object}}
 */
export function parseSeed(sqlText) {
  const sql = stripComments(sqlText);

  /* -------- categories -------- */
  const catBlock = blockAfter(
    sql,
    /insert\s+into\s+public\.product_categories\s*\([^)]*\)\s*values/i,
    /\bon\s+conflict\b/i,
  );
  const categories = (catBlock ? parseValueRows(catBlock) : [])
    .filter((r) => r.length >= 3)
    .map(([slug, name_ro, sort_order]) => ({ slug, name_ro, sort_order }));

  /* -------- products --------
     The seed uses `from (values ...) as v(...)`, so anchor on `from (values`. */
  const prodBlock = blockAfter(
    sql,
    /from\s*\(\s*values/i,
    /\)\s*as\s+v\s*\(/i,
  );
  const products = (prodBlock ? parseValueRows(prodBlock) : [])
    .filter((r) => r.length >= 13)
    .map((r) => ({
      slug: r[0],
      name_ro: r[1],
      description_ro: r[2],
      category_slug: r[3],
      price: r[4],
      unit: r[5],
      step: r[6],
      min_qty: r[7],
      max_qty: r[8],
      in_stock: r[9],
      season_start_month: r[10],
      season_end_month: r[11],
      sort_order: r[12],
    }));

  /* -------- delivery settings -------- */
  const delBlock = blockAfter(
    sql,
    /insert\s+into\s+public\.delivery_settings\s*\([^)]*\)\s*values/i,
    /\bon\s+conflict\b/i,
  );
  const delRow = (delBlock ? parseValueRows(delBlock) : [])[0] || [];
  // Row order matches the column list: (id, city, fee, free_over,
  // min_order, cutoff_hour, is_accepting)
  const delivery = delRow.length >= 7
    ? {
      city: delRow[1],
      fee: delRow[2],
      free_over: delRow[3],
      min_order: delRow[4],
      cutoff_hour: delRow[5],
      is_accepting: delRow[6],
    }
    : {};

  return { categories, products, delivery };
}
