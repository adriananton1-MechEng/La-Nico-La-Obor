# Supabase — setup and migrations

Nothing here has been applied to a real database yet. These files are written
and statically validated, but **not executed** — there was no Postgres
available when they were authored. Expect to fix small things on first apply.

## Files

| File | What it does |
|---|---|
| `migrations/0001_init.sql` | Tables, constraints, triggers, helper functions. Enables RLS on every table. |
| `migrations/0002_rls.sql` | Grants, RLS policies, and the guest-order RPC. |
| `migrations/0003_seed.sql` | Categories, 10 products, delivery settings. **All prices are placeholders.** |

Order matters: `0001` → `0002` → `0003`.

## Applying them

```bash
# 1. Install the CLI and log in
npm i -g supabase
supabase login

# 2. Link to your project (get the ref from the dashboard URL)
supabase link --project-ref YOUR-PROJECT-REF

# 3. Push the migrations
supabase db push
```

Or paste each file, in order, into the dashboard SQL editor.

## After applying

1. **Create the admin account.** Sign up through the site normally, then promote
   that user by hand — there is deliberately no self-serve path to admin:

   ```sql
   update public.profiles
      set role = 'admin'
    where id = (select id from auth.users where email = 'YOUR-EMAIL');
   ```

2. **Turn on MFA** for that account in the Supabase dashboard (Authentication →
   Multi-Factor). The admin panel assumes TOTP is enrolled.

3. **Fix the prices.** Every figure in `0003_seed.sql` is invented. Correct them
   before taking a single real payment.

4. **Point the site at the project.** Edit `assets/js/config.js`:

   ```js
   export const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJ...';
   ```

   The anon key is public by design — it is meant to ship in the browser, and
   RLS is what protects the data. Also replace `YOUR-PROJECT` in the
   `connect-src` of the CSP meta tag on `index.html`, `produse.html` and
   `cos.html` with the real project ref, so the policy stays as tight as
   possible.

5. **Never put these in the repo:** the service-role key, any Stripe secret key,
   the Stripe webhook secret, or the Resend API key. They belong only in Edge
   Function environment variables.

## The security model, in short

- RLS is the boundary, not the UI. Every table is default-deny.
- `orders` has **no** INSERT/DELETE policy for `anon` or `authenticated`. Orders
  are written only by the `create-order` Edge Function under the service role.
  This is why a tampered cart cannot forge a price — not validation, structure.
- `is_admin()` is `SECURITY DEFINER` with a pinned `search_path`. The DEFINER
  part is load-bearing: it stops the `profiles` policies recursing into
  themselves.
- `profiles.role` is guarded by the `profiles_guard_role` trigger, so the
  "edit your own profile" policy cannot double as a route to admin.
- Guests read their order through `get_order_by_token(uuid)`, a `SECURITY
  DEFINER` function that returns SQL NULL on a miss — so it cannot be used to
  distinguish "no such order" from "wrong token". There is no anon policy on
  `orders` to brute-force against.
- Money is `numeric(10,2)`. The validator asserts no float/real/money column
  exists anywhere.

## Preview catalogue

Until `config.js` is filled in, the site reads `data/products.json` instead of
the database, so the shop can be browsed and reviewed. That file is **generated**
from `0003_seed.sql`:

```bash
node scripts/gen-preview-catalogue.mjs
```

`npm test` fails if the two drift apart. Edit the seed, regenerate, commit both.

## Still to build (Phases 4–7)

Not written yet, and deliberately so — they cannot be tested without live
credentials:

- `functions/create-order/` — validates input, **recomputes every total from the
  products table**, inserts the order, returns a Stripe Checkout URL or confirms
  a cash-on-delivery order.
- `functions/stripe-webhook/` — signature-verified; the only thing allowed to
  move an order from `pending` to `paid`.
- `functions/notify-order/` — Resend email to customer and owner.
- `functions/admin-actions/` — privileged mutations with a server-side role
  check, writing to `admin_audit_log`.
