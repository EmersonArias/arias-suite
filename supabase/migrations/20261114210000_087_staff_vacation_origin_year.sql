-- Explicit accrual year for vacation days taken in another calendar year.
-- This is independent from actual enjoyment / confirmation.
alter table public.staff_schedule_entries
  add column if not exists vacation_origin_year integer null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conrelid = 'public.staff_schedule_entries'::regclass
      and conname = 'staff_schedule_entries_vacation_origin_year_check'
  ) then
    alter table public.staff_schedule_entries
      add constraint staff_schedule_entries_vacation_origin_year_check
      check (vacation_origin_year is null or
        (vacation_origin_year between 2000 and 2100 and
        vacation_origin_year <= extract(year from work_date)::integer));
  end if;
end $$;

comment on column public.staff_schedule_entries.vacation_origin_year is
  'Año al que pertenecen los días de vacaciones, distinto del año natural en el que se disfrutan. NULL = año sin confirmar cuando el estado es VACATION_PREVIOUS.';
