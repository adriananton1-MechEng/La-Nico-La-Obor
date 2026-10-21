-- ============================================================================
-- La Nico la Obor — 0001 schema
--
-- Money is numeric(10,2) in RON. Never float.
-- Every table gets RLS enabled here; the policies live in 0002_rls.sql.
-- Default-deny is the point: a table with RLS on and no policy is unreadable.
-- ============================================================================

begin;

-- ---------------------------------------------------------------- extensions
create extension if not exists pgcrypto;  -- gen_random_uuid, gen_random_bytes

-- ---------------------------------------------------------------- helpers

-- Updated-at trigger, reused by every mutable table.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Is the current request an admin?
--
-- SECURITY DEFINER is deliberate and load-bearing: it bypasses RLS on
-- public.profiles, which is what stops the profiles policies from recursing
-- into themselves when they call this function. search_path is pinned so a
-- caller cannot shadow `profiles` with their own table.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.profiles
     where id = auth.uid()
       and role = 'admin'
  );
$$;

-- Seasonal availability, with wrap-around for ranges like Nov(11) -> May(5).
-- Null bounds mean "available all year".
create or replace function public.is_in_season(
  start_month int,
  end_month   int,
  on_date     date default current_date
)
returns boolean
language sql
immutable
as $$
  select case
    when start_month is null or end_month is null then true
    when start_month <= end_month
      then extract(month from on_date)::int between start_month and end_month
    else
      extract(month from on_date)::int >= start_month
      or extract(month from on_date)::int <= end_month
  end;
$$;

-- ---------------------------------------------------------------- profiles
--
-- One row per auth user. `role` is the admin switch, and it is NOT
-- self-assignable — see the guard trigger below.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  phone       text,
  -- Saved delivery address, so repeat customers don't retype it.
  address     text,
  role        text not null default 'customer'
                check (role in ('customer', 'admin')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint profiles_full_name_len check (full_name is null or char_length(full_name) <= 120),
  constraint profiles_phone_len     check (phone     is null or char_length(phone)     <= 32),
  constraint profiles_address_len   check (address   is null or char_length(address)   <= 500)
);

create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Create a profile automatically whenever an auth user signs up.
-- Always 'customer': promotion to admin is a manual DB action, never a signup path.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'phone', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Privilege-escalation guard.
--
-- The UPDATE policy on profiles lets a user edit their own row, which would
-- otherwise let them set role='admin'. This trigger makes `role` immutable
-- unless the caller is already an admin, so the policy can stay simple.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'role is not self-assignable';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- ------------------------------------------------------- product categories
create table public.product_categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name_ro     text not null,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- products
create table public.products (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name_ro            text not null check (char_length(name_ro) between 1 and 120),
  description_ro     text check (description_ro is null or char_length(description_ro) <= 2000),
  category_id        uuid references public.product_categories (id) on delete set null,

  -- The authoritative price. The browser never supplies this.
  price              numeric(10,2) not null check (price > 0 and price <= 100000),
  unit               text not null check (unit in ('kg', 'buc', 'legatura', 'sir')),

  -- How much a customer may order in one go, in `unit`s.
  step               numeric(10,3) not null default 1 check (step > 0),
  min_qty            numeric(10,3) not null default 1 check (min_qty > 0),
  max_qty            numeric(10,3) not null default 50 check (max_qty > 0),

  image_path         text,
  in_stock           boolean not null default true,
  season_start_month int check (season_start_month between 1 and 12),
  season_end_month   int check (season_end_month   between 1 and 12),
  is_active          boolean not null default true,
  sort_order         int not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint products_qty_range check (max_qty >= min_qty),
  -- Season bounds are either both set or both null.
  constraint products_season_pair check (
    (season_start_month is null) = (season_end_month is null)
  )
);

create index products_category_idx on public.products (category_id);
create index products_listing_idx  on public.products (is_active, sort_order);

create trigger products_touch
  before update on public.products
  for each row execute function public.touch_updated_at();

-- Convenience view: what a customer can actually buy right now.
create view public.products_available as
  select p.*,
         public.is_in_season(p.season_start_month, p.season_end_month) as in_season
    from public.products p
   where p.is_active;

-- -------------------------------------------------------- delivery settings
--
-- Single row, id fixed to 1, so the admin UI can upsert without guessing a key.
create table public.delivery_settings (
  id            int primary key default 1 check (id = 1),
  city          text not null default 'București',
  fee           numeric(10,2) not null default 15.00 check (fee >= 0),
  free_over     numeric(10,2) check (free_over is null or free_over > 0),
  min_order     numeric(10,2) not null default 50.00 check (min_order >= 0),
  -- Orders placed before this hour (local time) deliver next day.
  cutoff_hour   int not null default 18 check (cutoff_hour between 0 and 23),
  is_accepting  boolean not null default true,
  notice_ro     text,
  updated_at    timestamptz not null default now()
);

create trigger delivery_settings_touch
  before update on public.delivery_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- orders
--
-- Rows here are written ONLY by the create-order Edge Function, under the
-- service role. There is deliberately no INSERT policy for anon or
-- authenticated — see 0002_rls.sql. That is what makes client-side price
-- tampering structurally impossible rather than merely validated against.
create sequence public.order_number_seq;

create table public.orders (
  id               uuid primary key default gen_random_uuid(),
  order_number     text not null unique,

  -- Null user_id = guest checkout.
  user_id          uuid references auth.users (id) on delete set null,
  -- Opaque token letting a guest read their own order back.
  access_token     uuid not null default gen_random_uuid(),

  guest_name       text,
  guest_email      text,
  guest_phone      text,

  delivery_address text not null check (char_length(delivery_address) between 8 and 500),
  delivery_city    text not null default 'București',
  delivery_notes   text check (delivery_notes is null or char_length(delivery_notes) <= 500),
  delivery_date    date not null,
  timing_note      text check (timing_note is null or char_length(timing_note) <= 200),

  payment_method   text not null check (payment_method in ('card', 'cod')),
  status           text not null default 'pending'
                     check (status in ('pending', 'paid', 'confirmed',
                                       'out_for_delivery', 'delivered',
                                       'cancelled', 'refunded')),

  subtotal         numeric(10,2) not null check (subtotal     >= 0),
  delivery_fee     numeric(10,2) not null check (delivery_fee >= 0),
  total            numeric(10,2) not null check (total        >= 0),

  stripe_session_id        text unique,
  stripe_payment_intent    text,
  -- Makes a double-submit or a webhook retry a no-op instead of a second order.
  idempotency_key  text not null unique,

  paid_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- A guest order is useless without a way to reach the customer.
  constraint orders_contactable check (
    user_id is not null
    or (guest_email is not null and guest_phone is not null)
  ),
  -- Totals must actually add up; cheap insurance against a logic bug upstream.
  constraint orders_total_consistent check (total = subtotal + delivery_fee)
);

create index orders_user_idx    on public.orders (user_id, created_at desc);
create index orders_status_idx  on public.orders (status, created_at desc);
create index orders_token_idx   on public.orders (access_token);
create index orders_date_idx    on public.orders (delivery_date);

create trigger orders_touch
  before update on public.orders
  for each row execute function public.touch_updated_at();

-- Human-readable order number: NICO-2026-0042
create or replace function public.assign_order_number()
returns trigger
language plpgsql
as $$
begin
  if new.order_number is null or new.order_number = '' then
    new.order_number := 'NICO-'
      || to_char(now(), 'YYYY') || '-'
      || lpad(nextval('public.order_number_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger orders_number
  before insert on public.orders
  for each row execute function public.assign_order_number();

-- ---------------------------------------------------------------- order items
--
-- name/unit/price are snapshotted so that editing a product price later never
-- rewrites the history of what someone was actually charged.
create table public.order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders (id) on delete cascade,
  product_id     uuid references public.products (id) on delete set null,

  name_snapshot  text not null,
  unit_snapshot  text not null,
  unit_price     numeric(10,2) not null check (unit_price > 0),
  qty            numeric(10,3) not null check (qty > 0),
  line_total     numeric(10,2) not null check (line_total >= 0),

  created_at     timestamptz not null default now()
);

create index order_items_order_idx on public.order_items (order_id);

-- ---------------------------------------------------------------- gallery
create table public.gallery_images (
  id           uuid primary key default gen_random_uuid(),
  storage_path text not null,
  caption_ro   text check (caption_ro is null or char_length(caption_ro) <= 200),
  alt_ro       text check (alt_ro     is null or char_length(alt_ro)     <= 200),
  sort_order   int not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create index gallery_listing_idx on public.gallery_images (is_active, sort_order);

-- ---------------------------------------------------------------- audit log
create table public.admin_audit_log (
  id          bigserial primary key,
  actor       uuid references auth.users (id) on delete set null,
  action      text not null,
  table_name  text,
  record_id   text,
  diff        jsonb,
  created_at  timestamptz not null default now()
);

create index admin_audit_created_idx on public.admin_audit_log (created_at desc);

-- ------------------------------------------------------------ rate limiting
--
-- Written by the create-order Edge Function. IPs are stored hashed so the
-- table is not itself a log of who visited.
create table public.order_rate_limit (
  ip_hash      text not null,
  window_start timestamptz not null,
  count        int not null default 1 check (count >= 0),
  primary key (ip_hash, window_start)
);

create index order_rate_limit_window_idx on public.order_rate_limit (window_start);

-- ---------------------------------------------------------------- RLS on
-- Enabled for every table. No policy yet = nobody can read anything.
alter table public.profiles          enable row level security;
alter table public.product_categories enable row level security;
alter table public.products          enable row level security;
alter table public.delivery_settings enable row level security;
alter table public.orders            enable row level security;
alter table public.order_items       enable row level security;
alter table public.gallery_images    enable row level security;
alter table public.admin_audit_log   enable row level security;
alter table public.order_rate_limit  enable row level security;

commit;
