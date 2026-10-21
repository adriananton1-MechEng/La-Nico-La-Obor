-- ============================================================================
-- La Nico la Obor — 0002 grants, RLS policies, guest-order RPC
--
-- Two things have to line up for a client to read a row:
--   1. a table-level GRANT to the `anon` / `authenticated` role, and
--   2. an RLS policy that admits the row.
-- Both are explicit here. Anything not granted and not policied is unreachable.
--
-- Note on `orders`: there is intentionally NO insert/update/delete policy for
-- anon or authenticated. Orders are written only by the create-order Edge
-- Function, which uses the service role (it has BYPASSRLS). That is the
-- structural reason a tampered cart cannot forge a price.
-- ============================================================================

begin;

-- ---------------------------------------------------------------- baseline
-- Start from nothing, then grant deliberately.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant usage on schema public to anon, authenticated;

-- ============================================================ public catalogue

grant select on public.product_categories to anon, authenticated;
grant select on public.products           to anon, authenticated;
grant select on public.gallery_images     to anon, authenticated;
grant select on public.delivery_settings  to anon, authenticated;

-- The view must honour the caller's RLS, not its owner's.
alter view public.products_available set (security_invoker = on);
grant select on public.products_available to anon, authenticated;

create policy categories_public_read on public.product_categories
  for select to anon, authenticated
  using (is_active);

create policy categories_admin_all on public.product_categories
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy products_public_read on public.products
  for select to anon, authenticated
  using (is_active);

create policy products_admin_all on public.products
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy gallery_public_read on public.gallery_images
  for select to anon, authenticated
  using (is_active);

create policy gallery_admin_all on public.gallery_images
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Everyone needs the fee / minimum / cut-off to render checkout honestly.
create policy delivery_public_read on public.delivery_settings
  for select to anon, authenticated
  using (true);

create policy delivery_admin_write on public.delivery_settings
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================ profiles

grant select, update on public.profiles to authenticated;

create policy profiles_read_own on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- Self-edit is allowed; the profiles_guard_role trigger from 0001 is what
-- prevents this policy from doubling as a path to role='admin'.
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- No insert policy: rows are created by the on_auth_user_created trigger.
-- No delete policy: deleting the auth user cascades.

-- ============================================================ orders

grant select on public.orders      to authenticated;
grant select on public.order_items to authenticated;

-- A signed-in customer sees exactly their own orders.
create policy orders_read_own on public.orders
  for select to authenticated
  using (user_id = auth.uid());

create policy orders_admin_read on public.orders
  for select to authenticated
  using (public.is_admin());

-- Admins move orders through statuses from the dashboard.
create policy orders_admin_update on public.orders
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy order_items_read_own on public.order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
       where o.id = order_items.order_id
         and (o.user_id = auth.uid() or public.is_admin())
    )
  );

-- ============================================================ audit log

grant select on public.admin_audit_log to authenticated;

create policy audit_admin_read on public.admin_audit_log
  for select to authenticated
  using (public.is_admin());

-- Writes come from the admin-actions Edge Function (service role) only.

-- ============================================================ rate limit
-- No grants, no policies. Service role only, by omission.

-- ============================================================ guest orders
--
-- A guest has no session, so there is no auth.uid() to match on. Rather than
-- opening `orders` to anon with a token predicate (which would let anyone
-- enumerate by brute-forcing tokens against the table), expose exactly one
-- function that takes the token and returns one order.
--
-- 128 bits of randomness in the uuid is the protection; the function returns
-- nothing at all on a miss, and never reveals whether an order id exists.
create or replace function public.get_order_by_token(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
           'order_number',     o.order_number,
           'status',           o.status,
           'payment_method',   o.payment_method,
           'delivery_address', o.delivery_address,
           'delivery_city',    o.delivery_city,
           'delivery_date',    o.delivery_date,
           'timing_note',      o.timing_note,
           'subtotal',         o.subtotal,
           'delivery_fee',     o.delivery_fee,
           'total',            o.total,
           'created_at',       o.created_at,
           'items',            coalesce(items.list, '[]'::jsonb)
         )
    into result
    from public.orders o
    left join lateral (
      select jsonb_agg(
               jsonb_build_object(
                 'name',       i.name_snapshot,
                 'unit',       i.unit_snapshot,
                 'unit_price', i.unit_price,
                 'qty',        i.qty,
                 'line_total', i.line_total
               )
               order by i.created_at
             ) as list
        from public.order_items i
       where i.order_id = o.id
    ) items on true
   where o.access_token = p_token;

  -- Deliberately returns SQL NULL on a miss — no distinction between
  -- "no such order" and "wrong token".
  return result;
end;
$$;

revoke all on function public.get_order_by_token(uuid) from public;
grant execute on function public.get_order_by_token(uuid) to anon, authenticated;

-- ============================================================ helper grants

grant execute on function public.is_admin()                        to authenticated;
grant execute on function public.is_in_season(int, int, date)       to anon, authenticated;

commit;
