-- Foundation: roles, profiles, company settings, document numbering, audit log.
-- See docs/PHASE-1-ARCHITECTURE.md §0, §4.1, §4.9 and §10.

create extension if not exists btree_gist with schema extensions;

-------------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-------------------------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-------------------------------------------------------------------------------
-- Roles and profiles
-- Drivers do not log in (decision Q12), so there are two roles.
-------------------------------------------------------------------------------

create type public.app_role as enum ('admin', 'finance');

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null check (char_length(btrim(full_name)) between 1 and 120),
  role        public.app_role not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- A profile is created only when an administrator creates the user with
-- app_metadata.role set (app_metadata can only be written with the secret key).
-- Users without a valid role get no profile and therefore no access.
create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := new.raw_app_meta_data ->> 'role';
  v_name text := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), new.email);
begin
  if v_role in ('admin', 'finance') then
    insert into public.profiles (id, full_name, role)
    values (new.id, v_name, v_role::public.app_role);
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Role helpers used by RLS policies. SECURITY DEFINER so policies on profiles
-- don't recurse; they only ever reveal the caller's own role.
create function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.is_active;
$$;

create function public.is_staff()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.current_app_role() is not null;
$$;

create function public.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'admin', false);
$$;

revoke execute on function public.current_app_role() from public, anon;
revoke execute on function public.is_staff() from public, anon;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;

create policy "Staff read own profile; admins read all"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy "Admins update profiles"
  on public.profiles for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- An admin must not lock themselves out by demoting or deactivating their own account.
create function public.guard_own_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id = (select auth.uid())
     and (new.role is distinct from old.role or new.is_active is distinct from old.is_active) then
    raise exception 'You cannot change your own role or deactivate your own account'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_own
  before update on public.profiles
  for each row execute function public.guard_own_profile();

-------------------------------------------------------------------------------
-- Company settings (single row). Values are entered by an administrator;
-- nothing is pre-filled. Bank details live here, never in source control.
-------------------------------------------------------------------------------

create table public.company_settings (
  id                         boolean primary key default true check (id),
  legal_name                 text,
  letterhead_note            text,  -- e.g. "In partnership with MMET Projects"
  registration_number        text,
  physical_address           text,
  phone                      text,
  email                      text,
  vat_registered             boolean not null default false,
  vat_number                 text,
  vat_rate                   numeric(5, 4) check (vat_rate > 0 and vat_rate < 1),
  bank_name                  text,
  bank_account_name          text,
  bank_account_number        text,
  bank_branch_code           text,
  default_payment_terms_days integer check (default_payment_terms_days between 0 and 365),
  weight_difference_highlight_pct numeric(5, 2) check (weight_difference_highlight_pct > 0),
  updated_at                 timestamptz not null default now(),
  updated_by                 uuid references auth.users (id) default auth.uid(),
  constraint vat_details_required check (
    not vat_registered or (vat_number is not null and vat_rate is not null)
  )
);

insert into public.company_settings (id, updated_by) values (true, null);

create function public.set_company_settings_updated()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger company_settings_set_updated
  before update on public.company_settings
  for each row execute function public.set_company_settings_updated();

alter table public.company_settings enable row level security;

create policy "Staff read company settings"
  on public.company_settings for select to authenticated
  using ((select public.is_staff()));

create policy "Admins update company settings"
  on public.company_settings for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-------------------------------------------------------------------------------
-- Gap-free document numbering. A number is taken inside the same transaction
-- that issues the document, so a rollback releases it.
-------------------------------------------------------------------------------

create table public.document_sequences (
  name        text primary key check (name in ('delivery', 'invoice', 'credit_note')),
  next_value  bigint not null check (next_value >= 1),
  updated_at  timestamptz not null default now()
);

-- Starting values. The invoice start is set by an administrator at go-live
-- (next number after the last spreadsheet invoice, decision Q26).
insert into public.document_sequences (name, next_value) values
  ('delivery', 1),
  ('invoice', 1),
  ('credit_note', 1);

create trigger document_sequences_set_updated_at
  before update on public.document_sequences
  for each row execute function public.set_updated_at();

alter table public.document_sequences enable row level security;

create policy "Staff read document sequences"
  on public.document_sequences for select to authenticated
  using ((select public.is_staff()));

create policy "Admins set document sequence starting values"
  on public.document_sequences for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Internal: only called from other database functions that issue documents.
create function public.allocate_document_number(p_name text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value bigint;
begin
  update public.document_sequences
     set next_value = next_value + 1
   where name = p_name
  returning next_value - 1 into v_value;

  if v_value is null then
    raise exception 'Unknown document sequence %', p_name;
  end if;
  return v_value;
end;
$$;

revoke execute on function public.allocate_document_number(text) from public, anon, authenticated;

-------------------------------------------------------------------------------
-- Audit log: append-only record of every change to audited tables.
-------------------------------------------------------------------------------

create table public.audit_log (
  id           bigint generated always as identity primary key,
  table_name   text not null,
  record_id    text not null,
  action       text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data     jsonb,
  new_data     jsonb,
  actor_id     uuid,
  occurred_at  timestamptz not null default now()
);

create index audit_log_record_idx on public.audit_log (table_name, record_id, occurred_at desc);

alter table public.audit_log enable row level security;

create policy "Admins read the audit log"
  on public.audit_log for select to authenticated
  using ((select public.is_admin()));

create function public.prevent_audit_log_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'The audit log is append-only' using errcode = 'P0001';
end;
$$;

create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function public.prevent_audit_log_change();

create function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  insert into public.audit_log (table_name, record_id, action, old_data, new_data, actor_id)
  values (
    tg_table_name,
    coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'name', v_old ->> 'name'),
    tg_op,
    v_old,
    v_new,
    auth.uid()
  );
  return null;
end;
$$;

revoke execute on function public.audit_row_change() from public, anon, authenticated;

create trigger audit_profiles
  after insert or update or delete on public.profiles
  for each row execute function public.audit_row_change();

create trigger audit_company_settings
  after insert or update or delete on public.company_settings
  for each row execute function public.audit_row_change();

create trigger audit_document_sequences
  after insert or update or delete on public.document_sequences
  for each row execute function public.audit_row_change();
