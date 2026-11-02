-- Master data: customers, sites, coal products (with weighbridge aliases),
-- drivers and trucks. See docs/PHASE-1-ARCHITECTURE.md §0, §4.2 and §8.1.
--
-- Records that later deliveries will reference are deactivated, not deleted
-- (foreign keys from later phases use ON DELETE RESTRICT).

-------------------------------------------------------------------------------
-- Customers (e.g. PBSA Logistics)
-------------------------------------------------------------------------------

create table public.customers (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (char_length(btrim(name)) between 1 and 200),
  registration_number text,
  vat_number          text,
  billing_address     text,
  contact_name        text,
  contact_phone       text,
  contact_email       text,
  payment_terms_days  integer check (payment_terms_days between 0 and 365),
  notes               text,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  created_by          uuid references auth.users (id) default auth.uid(),
  updated_at          timestamptz not null default now()
);

create unique index customers_name_key on public.customers (lower(btrim(name)));

-------------------------------------------------------------------------------
-- Sites: where coal is collected (mines / weighbridges) and where it is
-- delivered. Invoice line descriptions use the collection site name (Q27).
-------------------------------------------------------------------------------

create type public.site_kind as enum ('collection', 'destination');

create table public.sites (
  id          uuid primary key default gen_random_uuid(),
  kind        public.site_kind not null,
  name        text not null check (char_length(btrim(name)) between 1 and 200),
  location    text,
  notes       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) default auth.uid(),
  updated_at  timestamptz not null default now()
);

create unique index sites_kind_name_key on public.sites (kind, lower(btrim(name)));

-------------------------------------------------------------------------------
-- Coal products and the names each weighbridge prints for them
-- (e.g. "GG - Peas" at Grootegeluk, "COAL" at Rustenburg Depot).
-------------------------------------------------------------------------------

create table public.coal_products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) default auth.uid(),
  updated_at  timestamptz not null default now()
);

create unique index coal_products_name_key on public.coal_products (lower(btrim(name)));

create table public.coal_product_aliases (
  id              uuid primary key default gen_random_uuid(),
  coal_product_id uuid not null references public.coal_products (id) on delete cascade,
  site_id         uuid references public.sites (id) on delete cascade,  -- null = any weighbridge
  alias           text not null check (char_length(btrim(alias)) between 1 and 120),
  alias_key       text generated always as (upper(regexp_replace(btrim(alias), '\s+', ' ', 'g'))) stored,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id) default auth.uid(),
  constraint coal_product_aliases_unique unique nulls not distinct (site_id, alias_key)
);

create index coal_product_aliases_product_idx on public.coal_product_aliases (coal_product_id);

-------------------------------------------------------------------------------
-- Drivers (records only; drivers do not log in — Q12) and trucks
-------------------------------------------------------------------------------

create table public.drivers (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null check (char_length(btrim(full_name)) between 1 and 120),
  slip_name   text,  -- name as printed on weigh tickets, e.g. "ENOS"
  phone       text,
  notes       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) default auth.uid(),
  updated_at  timestamptz not null default now()
);

create table public.trucks (
  id                     uuid primary key default gen_random_uuid(),
  registration           text not null check (char_length(btrim(registration)) between 2 and 20),
  registration_key       text generated always as (upper(regexp_replace(registration, '[^A-Za-z0-9]', '', 'g'))) stored,
  trailer_registrations  text[] not null default '{}',
  description            text,  -- make, model, vehicle type (e.g. 1x2x2x2)
  default_driver_id      uuid references public.drivers (id) on delete set null,
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  created_by             uuid references auth.users (id) default auth.uid(),
  updated_at             timestamptz not null default now(),
  constraint trucks_registration_key_unique unique (registration_key)
);

create index trucks_default_driver_idx on public.trucks (default_driver_id);

-------------------------------------------------------------------------------
-- updated_at, audit and RLS for every master-data table
-------------------------------------------------------------------------------

create trigger customers_set_updated_at before update on public.customers
  for each row execute function public.set_updated_at();
create trigger sites_set_updated_at before update on public.sites
  for each row execute function public.set_updated_at();
create trigger coal_products_set_updated_at before update on public.coal_products
  for each row execute function public.set_updated_at();
create trigger drivers_set_updated_at before update on public.drivers
  for each row execute function public.set_updated_at();
create trigger trucks_set_updated_at before update on public.trucks
  for each row execute function public.set_updated_at();

do $$
declare
  t text;
begin
  foreach t in array array['customers', 'sites', 'coal_products', 'coal_product_aliases', 'drivers', 'trucks']
  loop
    execute format(
      'create trigger audit_%1$s after insert or update or delete on public.%1$I
         for each row execute function public.audit_row_change()', t);

    execute format('alter table public.%I enable row level security', t);

    execute format(
      'create policy "Staff read %1$s" on public.%1$I for select to authenticated
         using ((select public.is_staff()))', t);
    execute format(
      'create policy "Admins insert %1$s" on public.%1$I for insert to authenticated
         with check ((select public.is_admin()))', t);
    execute format(
      'create policy "Admins update %1$s" on public.%1$I for update to authenticated
         using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format(
      'create policy "Admins delete %1$s" on public.%1$I for delete to authenticated
         using ((select public.is_admin()))', t);
  end loop;
end;
$$;
