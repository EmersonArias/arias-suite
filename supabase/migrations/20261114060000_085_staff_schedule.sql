-- Arias Suite: planificador horario, primera versión (solo estructura aditiva).
-- No modifica migraciones históricas ni otros módulos.
create table if not exists public.staff_operators (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id),
  display_name text not null check (char_length(trim(display_name)) between 2 and 150),
  linked_user_id uuid null references public.profiles(id) on delete set null,
  active boolean not null default true,
  rotation_type text not null default 'NORMAL'
    check (rotation_type in ('NORMAL','EXCEPTIONAL','NONE')),
  weekly_target_minutes integer null check (weekly_target_minutes between 0 and 6000),
  join_date date null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, hotel_id),
  unique (hotel_id, linked_user_id)
);
create index if not exists staff_operators_hotel_idx on public.staff_operators(hotel_id,active,display_name);

create table if not exists public.staff_schedule_entries (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id),
  operator_id uuid not null,
  work_date date not null,
  state text not null default 'UNASSIGNED'
    check (state in ('SHIFT','REST','VACATION','VACATION_PREVIOUS','MEDICAL_LEAVE','PERSONAL_DAY',
       'PERMISSION','COMP_REST','PUBLIC_HOLIDAY','TRAINING','UNJUSTIFIED_ABSENCE','OTHER','UNASSIGNED')),
  start_time time null,
  end_time time null,
  planned_minutes integer null check (planned_minutes between 0 and 1440),
  actual_minutes integer null check (actual_minutes between 0 and 1440),
  actual_confirmed boolean not null default false,
  justification text not null default 'UNKNOWN'
    check (justification in ('UNKNOWN','PENDING','DOCUMENTED','UNJUSTIFIED')),
  source_kind text not null default 'MANUAL'
    check (source_kind in ('MANUAL','EXCEL_2026','EXCEL_2025','OTHER_IMPORT')),
  source_code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  changed_by uuid null references public.profiles(id) on delete set null,
  foreign key (operator_id,hotel_id) references public.staff_operators(id,hotel_id) on delete cascade,
  unique (operator_id,work_date)
);
create index if not exists staff_schedule_entries_hotel_date_idx on public.staff_schedule_entries(hotel_id,work_date);
create index if not exists staff_schedule_entries_operator_date_idx on public.staff_schedule_entries(operator_id,work_date);

create table if not exists public.staff_overtime_ledger (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id),
  operator_id uuid not null,
  entry_date date not null,
  entry_type text not null check (entry_type in ('EARNED','REST_TAKEN','PAID','ADJUSTMENT_PLUS','ADJUSTMENT_MINUS')),
  minutes integer not null check (minutes > 0 and minutes <= 14400),
  reason text not null check (char_length(trim(reason)) between 2 and 1000),
  source_kind text not null default 'MANUAL',
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  changed_by uuid null references public.profiles(id) on delete set null,
  foreign key (operator_id,hotel_id) references public.staff_operators(id,hotel_id) on delete cascade
);
create index if not exists staff_overtime_ledger_operator_date_idx on public.staff_overtime_ledger(operator_id,entry_date);

create table if not exists public.staff_vacation_years (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id),
  operator_id uuid not null,
  year integer not null check (year between 2000 and 2100),
  entitlement_days integer null check (entitlement_days between 0 and 366),
  carryover_days integer not null default 0 check (carryover_days between 0 and 366),
  adjustment_days integer not null default 0 check (adjustment_days between -366 and 366),
  changed_by uuid null references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (operator_id,hotel_id) references public.staff_operators(id,hotel_id) on delete cascade,
  unique (operator_id,year)
);

-- Las observaciones privadas NUNCA se incluyen en las tablas consultables por un operario.
create table if not exists public.staff_private_notes (
  operator_id uuid primary key,
  hotel_id uuid not null references public.hotels(id),
  content text not null default '',
  changed_by uuid null references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  foreign key (operator_id,hotel_id) references public.staff_operators(id,hotel_id) on delete cascade
);

alter table public.staff_operators enable row level security;
alter table public.staff_schedule_entries enable row level security;
alter table public.staff_overtime_ledger enable row level security;
alter table public.staff_vacation_years enable row level security;
alter table public.staff_private_notes enable row level security;

-- El administrador de cliente y el jefe de mantenimiento ya disponen de
-- maintenance.configure; técnicos y lectores NO.
create policy staff_operators_select on public.staff_operators for select to authenticated
using (public.is_platform_admin() or public.has_hotel_permission(hotel_id,'maintenance.configure')
       or linked_user_id = (select auth.uid()));
create policy staff_operators_insert on public.staff_operators for insert to authenticated
with check (public.is_platform_admin() or public.has_hotel_permission(hotel_id,'maintenance.configure'));
create policy staff_operators_update on public.staff_operators for update to authenticated
using (public.is_platform_admin() or public.has_hotel_permission(hotel_id,'maintenance.configure'))
with check (public.is_platform_admin() or public.has_hotel_permission(hotel_id,'maintenance.configure'));
-- Las bajas de operarios son lógicas: active = false, sin DELETE expuesto.

create policy staff_schedule_entries_select on public.staff_schedule_entries for select to authenticated
using (public.is_platform_admin() or public.has_hotel_permission(hotel_id,'maintenance.configure')
       or exists (select 1 from public.staff_operators s where s.id=operator_id
                  and s.hotel_id=staff_schedule_entries.hotel_id and s.linked_user_id=(select auth.uid())));
create policy staff_schedule_entries_insert on public.staff_schedule_entries for insert to authenticated
with check (public.is_platform_admin() or public.has_hotel_permission(hotel_id,'maintenance.configure'));
create policy staff_schedule_entries_update on public.staff_schedule_entries for update to authenticated
using (public.is_platform_admin() or public.has_hotel_permission(hotel_id,'maintenance.configure'))
with check (public.is_platform_admin() or public.has_hotel_permission(hotel_id,'maintenance.configure'));
create policy staff_schedule_entries_delete on public.staff_schedule_entries for delete to authenticated
using (public.is_platform_admin() or public.has_hotel_permission(hotel_id,'maintenance.configure'));

create policy staff_overtime_ledger_select on public.staff_overtime_ledger for select to authenticated
using (public.is_platform_admin() or public.has_hotel_permission(hotel_id,'maintenance.configure')
       or exists (select 1 from public.staff_operators s where s.id=operator_id
                  and s.hotel_id=staff_overtime_ledger.hotel_id and s.linked_user_id=(select auth.uid())));
create policy staff_overtime_ledger_insert on public.staff_overtime_ledger for insert to authenticated
with check (public.is_platform_admin() or public.has_hotel_permission(hotel_id,'maintenance.configure'));
create policy staff_overtime_ledger_update on public.staff_overtime_ledger for update to authenticated
using (public.is_platform_admin() or public.has_hotel_permission(hotel_id,'maintenance.configure'))
with check (public.is_platform_admin() or public.has_hotel_permission(hotel_id,'maintenance.configure'));
create policy staff_overtime_ledger_delete on public.staff_overtime_ledger for delete to authenticated
using (public.is_platform_admin() or public.has_hotel_permission(hotel_id,'maintenance.configure'));

create policy staff_vacation_years_select on public.staff_vacation_years for select to authenticated
using (public.is_platform_admin() or public.has_hotel_permission(hotel_id,'maintenance.configure')
       or exists (select 1 from public.staff_operators s where s.id=operator_id
                  and s.hotel_id=staff_vacation_years.hotel_id and s.linked_user_id=(select auth.uid())));
create policy staff_vacation_years_insert on public.staff_vacation_years for insert to authenticated
with check (public.is_platform_admin() or public.has_hotel_permission(hotel_id,'maintenance.configure'));
create policy staff_vacation_years_update on public.staff_vacation_years for update to authenticated
using (public.is_platform_admin() or public.has_hotel_permission(hotel_id,'maintenance.configure'))
with check (public.is_platform_admin() or public.has_hotel_permission(hotel_id,'maintenance.configure'));

create policy staff_private_notes_select on public.staff_private_notes for select to authenticated
using (public.is_platform_admin() or public.has_hotel_permission(hotel_id,'maintenance.configure'));
create policy staff_private_notes_insert on public.staff_private_notes for insert to authenticated
with check (public.is_platform_admin() or public.has_hotel_permission(hotel_id,'maintenance.configure'));
create policy staff_private_notes_update on public.staff_private_notes for update to authenticated
using (public.is_platform_admin() or public.has_hotel_permission(hotel_id,'maintenance.configure'))
with check (public.is_platform_admin() or public.has_hotel_permission(hotel_id,'maintenance.configure'));

grant select,insert,update on public.staff_operators to authenticated;
grant select,insert,update,delete on public.staff_schedule_entries to authenticated;
grant select,insert,update,delete on public.staff_overtime_ledger to authenticated;
grant select,insert,update on public.staff_vacation_years to authenticated;
grant select,insert,update on public.staff_private_notes to authenticated;
