begin;
create table public.maintenance_exercise_start (
 hotel_id uuid primary key references public.hotels(id),
 operator_id uuid not null references auth.users(id),
 started_at timestamptz
);
alter table public.maintenance_exercise_start enable row level security;
revoke all on public.maintenance_exercise_start from public, anon, authenticated;
grant select on public.maintenance_exercise_start to authenticated;
create policy exercise_read on public.maintenance_exercise_start for select to authenticated
 using (public.has_suite_access() and public.has_hotel_access(hotel_id));

-- Enrol the existing hotel only. Other installations retain their current settings.
insert into public.maintenance_exercise_start(hotel_id,operator_id)
select h.id,u.id from public.hotels h join auth.users u on u.id='20b5da58-38b9-49af-88b2-9d9bfdfc3a84'
where h.id='9e2e3d56-25d7-41a5-8dd6-df6858e735bd';
update public.maintenance_hotel_config set ot_generation_mode='MANUAL'
where hotel_id in (select hotel_id from public.maintenance_exercise_start where started_at is null)
and ot_generation_mode <> 'MANUAL';

create function public.guard_pending_hotel_exercise() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new.ot_generation_mode='AUTO' and exists(select 1 from public.maintenance_exercise_start
  where hotel_id=new.hotel_id and started_at is null) then
   raise exception 'El ejercicio está pendiente de inicio.';
 end if;
 return new;
end $$;
revoke all on function public.guard_pending_hotel_exercise() from public,anon,authenticated;
create trigger maintenance_exercise_config before insert or update of ot_generation_mode on public.maintenance_hotel_config
for each row execute function public.guard_pending_hotel_exercise();

-- Also protects older generator sessions and automatically generated work from an old schedule.
create function public.guard_auto_ticket_exercise() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare started timestamptz;
begin
 select started_at into started from public.maintenance_exercise_start where hotel_id=new.hotel_id;
 if found and (started is null or new.scheduled_date is null or new.scheduled_date < timezone('Europe/Madrid',started)::date) then
   return null;
 end if;
 return new;
end $$;
revoke all on function public.guard_auto_ticket_exercise() from public,anon,authenticated;
create trigger maintenance_auto_ticket_exercise before insert on public.maintenance_work_orders
for each row when (new.generation_mode='AUTO') execute function public.guard_auto_ticket_exercise();

create function public.start_hotel_exercise(target_hotel_id uuid) returns timestamptz
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 gate public.maintenance_exercise_start;
 started timestamptz := now();
 first_day date := timezone('Europe/Madrid',started)::date;
 plan record;
 due date;
 step interval;
 n integer;
begin
 select * into gate from public.maintenance_exercise_start where hotel_id=target_hotel_id for update;
 if not found or auth.uid() is null or auth.uid() is distinct from gate.operator_id
    or not coalesce(public.has_suite_access(),false) or not coalesce(public.has_hotel_access(target_hotel_id),false) then
   raise exception 'Sin permiso para iniciar el ejercicio de este hotel.';
 end if;
 if gate.started_at is not null then raise exception 'El ejercicio ya está iniciado.'; end if;
 -- Keep the anchored cadence. Skip elapsed occurrences without recording them as work done.
 for plan in select id, coalesce(next_due_date,start_date) anchor, periodicity_value v, periodicity_unit unit
  from public.maintenance_plans where hotel_id=target_hotel_id and active and coalesce(next_due_date,start_date)<first_day
  and periodicity_unit in ('DAY','WEEK','MONTH','YEAR') and periodicity_value>0 for update
 loop
  step := case plan.unit when 'DAY' then make_interval(days=>plan.v) when 'WEEK' then make_interval(weeks=>plan.v)
    when 'MONTH' then make_interval(months=>plan.v) when 'YEAR' then make_interval(years=>plan.v) end;
  n := 1;
  due := (plan.anchor + step)::date;
  while due < first_day loop
    n := n+1;
    due := (plan.anchor + n * step)::date;
  end loop;
  update public.maintenance_plans set next_due_date=due,updated_at=now() where id=plan.id;
 end loop;
 update public.maintenance_exercise_start set started_at=started where hotel_id=target_hotel_id;
 update public.maintenance_hotel_config set ot_generation_mode='AUTO' where hotel_id=target_hotel_id;
 if not found then raise exception 'Falta la configuración de mantenimiento del hotel.'; end if;
 return started;
end $$;
revoke all on function public.start_hotel_exercise(uuid) from public,anon;
grant execute on function public.start_hotel_exercise(uuid) to authenticated;
commit;
