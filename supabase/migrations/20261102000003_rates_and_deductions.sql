-- Customer haulage rates and recurring monthly deductions.
-- Decisions: one rate per customer, versioned by date (Q22); the rate used is
-- the one in force on the invoice date (Q4); the diesel deduction is a fixed
-- monthly amount (Q25). See docs/PHASE-1-ARCHITECTURE.md §0, §0.1 and §6.
--
-- Rows are never edited in place. A change is a new row from a new date; the
-- previous row is closed by setting effective_to. Overlaps are impossible
-- (exclusion constraints).

-------------------------------------------------------------------------------
-- Rates
-------------------------------------------------------------------------------

create table public.customer_rates (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null references public.customers (id) on delete restrict,
  rate_per_ton    numeric(12, 2) not null check (rate_per_ton > 0),
  effective_from  date not null,
  effective_to    date,  -- inclusive; null = still in force
  reason          text,
  created_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id) default auth.uid(),
  constraint customer_rates_dates check (effective_to is null or effective_to >= effective_from),
  constraint customer_rates_no_overlap exclude using gist (
    customer_id with =,
    daterange(effective_from, effective_to, '[]') with &&
  )
);

-------------------------------------------------------------------------------
-- Recurring deductions (e.g. "Monthly diesel deduction")
-------------------------------------------------------------------------------

create table public.customer_recurring_deductions (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references public.customers (id) on delete restrict,
  description      text not null check (char_length(btrim(description)) between 1 and 120),
  description_key  text generated always as (lower(regexp_replace(btrim(description), '\s+', ' ', 'g'))) stored,
  monthly_amount   numeric(14, 2) not null check (monthly_amount > 0),
  effective_from   date not null,
  effective_to     date,  -- inclusive; null = still in force
  reason           text,
  created_at       timestamptz not null default now(),
  created_by       uuid references auth.users (id) default auth.uid(),
  constraint customer_recurring_deductions_dates check (effective_to is null or effective_to >= effective_from),
  constraint customer_recurring_deductions_no_overlap exclude using gist (
    customer_id with =,
    description_key with =,
    daterange(effective_from, effective_to, '[]') with &&
  )
);

-------------------------------------------------------------------------------
-- Immutability: only effective_to may change after a row is created, and only
-- rows that have not started yet may be deleted.
-------------------------------------------------------------------------------

create function public.guard_dated_value_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- Generated columns are not yet computed in NEW during a BEFORE trigger,
  -- so they are left out of the comparison along with effective_to.
  v_ignored text[] := array['effective_to', 'description_key'];
  v_old jsonb := to_jsonb(old) - v_ignored;
  v_new jsonb;
begin
  if tg_op = 'DELETE' then
    if old.effective_from <= current_date then
      raise exception 'A value that has already taken effect cannot be deleted; end it instead'
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  v_new := to_jsonb(new) - v_ignored;
  if v_new is distinct from v_old then
    raise exception 'Rates and deductions cannot be edited; add a new one from a new date'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger customer_rates_guard
  before update or delete on public.customer_rates
  for each row execute function public.guard_dated_value_change();

create trigger customer_recurring_deductions_guard
  before update or delete on public.customer_recurring_deductions
  for each row execute function public.guard_dated_value_change();

-------------------------------------------------------------------------------
-- Changing values: close the current row and add the new one atomically.
-- SECURITY INVOKER, so RLS still applies to the caller.
-------------------------------------------------------------------------------

create function public.set_customer_rate(
  p_customer_id    uuid,
  p_rate_per_ton   numeric,
  p_effective_from date,
  p_reason         text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can change rates' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.customer_rates
    where customer_id = p_customer_id and effective_from >= p_effective_from
  ) then
    raise exception 'This customer already has a rate starting on or after %', p_effective_from
      using errcode = 'P0001';
  end if;

  update public.customer_rates
     set effective_to = p_effective_from - 1
   where customer_id = p_customer_id
     and (effective_to is null or effective_to >= p_effective_from);

  insert into public.customer_rates (customer_id, rate_per_ton, effective_from, reason)
  values (p_customer_id, p_rate_per_ton, p_effective_from, nullif(btrim(p_reason), ''))
  returning id into v_id;

  return v_id;
end;
$$;

create function public.set_customer_recurring_deduction(
  p_customer_id    uuid,
  p_description    text,
  p_monthly_amount numeric,
  p_effective_from date,
  p_reason         text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_key text := lower(regexp_replace(btrim(p_description), '\s+', ' ', 'g'));
  v_id  uuid;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can change deductions' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.customer_recurring_deductions
    where customer_id = p_customer_id and description_key = v_key
      and effective_from >= p_effective_from
  ) then
    raise exception 'This deduction already has an amount starting on or after %', p_effective_from
      using errcode = 'P0001';
  end if;

  update public.customer_recurring_deductions
     set effective_to = p_effective_from - 1
   where customer_id = p_customer_id
     and description_key = v_key
     and (effective_to is null or effective_to >= p_effective_from);

  insert into public.customer_recurring_deductions
    (customer_id, description, monthly_amount, effective_from, reason)
  values
    (p_customer_id, btrim(p_description), p_monthly_amount, p_effective_from, nullif(btrim(p_reason), ''))
  returning id into v_id;

  return v_id;
end;
$$;

-- Stop a recurring deduction from a date onwards (e.g. the arrangement ended).
create function public.end_customer_recurring_deduction(
  p_deduction_id uuid,
  p_last_day     date
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only administrators can change deductions' using errcode = '42501';
  end if;

  update public.customer_recurring_deductions
     set effective_to = p_last_day
   where id = p_deduction_id
     and effective_from <= p_last_day
     and (effective_to is null or effective_to > p_last_day);

  if not found then
    raise exception 'Deduction not found, already ended earlier, or the date is before it starts'
      using errcode = 'P0001';
  end if;
end;
$$;

-- The rate in force for a customer on a date (used by invoicing in Phase 6).
create function public.customer_rate_on(p_customer_id uuid, p_on date)
returns public.customer_rates
language sql
stable
set search_path = ''
as $$
  select r.*
  from public.customer_rates r
  where r.customer_id = p_customer_id
    and p_on >= r.effective_from
    and (r.effective_to is null or p_on <= r.effective_to);
$$;

revoke execute on function public.set_customer_rate(uuid, numeric, date, text) from public, anon;
revoke execute on function public.set_customer_recurring_deduction(uuid, text, numeric, date, text) from public, anon;
revoke execute on function public.end_customer_recurring_deduction(uuid, date) from public, anon;
revoke execute on function public.customer_rate_on(uuid, date) from public, anon;
grant execute on function public.set_customer_rate(uuid, numeric, date, text) to authenticated;
grant execute on function public.set_customer_recurring_deduction(uuid, text, numeric, date, text) to authenticated;
grant execute on function public.end_customer_recurring_deduction(uuid, date) to authenticated;
grant execute on function public.customer_rate_on(uuid, date) to authenticated;

-------------------------------------------------------------------------------
-- Audit and RLS
-------------------------------------------------------------------------------

create trigger audit_customer_rates
  after insert or update or delete on public.customer_rates
  for each row execute function public.audit_row_change();

create trigger audit_customer_recurring_deductions
  after insert or update or delete on public.customer_recurring_deductions
  for each row execute function public.audit_row_change();

alter table public.customer_rates enable row level security;
alter table public.customer_recurring_deductions enable row level security;

create policy "Staff read customer rates"
  on public.customer_rates for select to authenticated
  using ((select public.is_staff()));
create policy "Admins insert customer rates"
  on public.customer_rates for insert to authenticated
  with check ((select public.is_admin()));
create policy "Admins update customer rates"
  on public.customer_rates for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins delete future customer rates"
  on public.customer_rates for delete to authenticated
  using ((select public.is_admin()));

create policy "Staff read recurring deductions"
  on public.customer_recurring_deductions for select to authenticated
  using ((select public.is_staff()));
create policy "Admins insert recurring deductions"
  on public.customer_recurring_deductions for insert to authenticated
  with check ((select public.is_admin()));
create policy "Admins update recurring deductions"
  on public.customer_recurring_deductions for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins delete future recurring deductions"
  on public.customer_recurring_deductions for delete to authenticated
  using ((select public.is_admin()));
