-- Festivos del encabezado del cuadrante, distintos del dia de disfrute personal.
-- Migracion aditiva; no altera las migraciones historicas ni Planificador PAM.
create table if not exists public.staff_calendar_holidays (
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  holiday_date date not null,
  label text not null default 'Festivo',
  source_kind text not null default 'CUADRANTE',
  updated_at timestamptz not null default now(),
  primary key (hotel_id, holiday_date)
);
create index if not exists staff_calendar_holidays_date_idx on public.staff_calendar_holidays(holiday_date);
alter table public.staff_calendar_holidays enable row level security;
do $policies$
begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='staff_calendar_holidays' and policyname='staff_calendar_holidays_select') then
    create policy staff_calendar_holidays_select on public.staff_calendar_holidays
      for select to authenticated
      using (public.is_platform_admin()
        or public.has_hotel_permission(hotel_id,'maintenance.configure')
        or exists (
          select 1 from public.staff_operators so
          where so.hotel_id=staff_calendar_holidays.hotel_id and so.linked_user_id=(select auth.uid())
        ));
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='staff_calendar_holidays' and policyname='staff_calendar_holidays_insert') then
    create policy staff_calendar_holidays_insert on public.staff_calendar_holidays
      for insert to authenticated
      with check (public.is_platform_admin()
        or public.has_hotel_permission(hotel_id,'maintenance.configure'));
  end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='staff_calendar_holidays' and policyname='staff_calendar_holidays_update') then
    create policy staff_calendar_holidays_update on public.staff_calendar_holidays
      for update to authenticated
      using (public.is_platform_admin()
        or public.has_hotel_permission(hotel_id,'maintenance.configure'))
      with check (public.is_platform_admin()
        or public.has_hotel_permission(hotel_id,'maintenance.configure'));
  end if;
end
$policies$;
grant select,insert,update on public.staff_calendar_holidays to authenticated;