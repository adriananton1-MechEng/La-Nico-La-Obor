/* ===========================================================
   Runtime configuration.

   The Supabase URL and anon key are PUBLIC by design — the anon key is meant
   to ship in the browser, and Postgres Row Level Security is what actually
   protects the data. Do NOT ever put the service-role key, a Stripe secret
   key, or the Resend API key in this file: those belong only in Supabase
   Edge Function environment variables.

   While SUPABASE_URL is still the placeholder below, the site runs in
   "preview" mode: the catalogue is read from data/products.json so the shop
   can be browsed and reviewed, and checkout is disabled (there is no server
   to price or take an order). Fill these in and the shop switches over.
   =========================================================== */

export const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY';

/** Where the preview catalogue lives when Supabase isn't configured yet. */
export const PREVIEW_CATALOGUE = 'data/products.json';

/** True once real Supabase credentials are in place. */
export function isConfigured() {
  return (
    typeof SUPABASE_URL === 'string' &&
    SUPABASE_URL.startsWith('https://') &&
    !SUPABASE_URL.includes('YOUR-PROJECT') &&
    typeof SUPABASE_ANON_KEY === 'string' &&
    SUPABASE_ANON_KEY.length > 20 &&
    SUPABASE_ANON_KEY !== 'YOUR-ANON-KEY'
  );
}

/**
 * Feature flags.
 *
 * `cardPayments` stays false until Stripe is connected and the webhook is
 * verified end to end. Cash on delivery can go live before card does.
 */
export const FEATURES = {
  ordering: false,      // set true once create-order is deployed
  cardPayments: false,  // set true once the Stripe webhook is verified
  accounts: false,      // set true once Supabase Auth is wired up
};

/** Shop copy that the family may want to change without touching markup. */
export const SHOP = {
  phone: '+40727774567',
  phoneDisplay: '0727 774 567',
  city: 'București',
};
