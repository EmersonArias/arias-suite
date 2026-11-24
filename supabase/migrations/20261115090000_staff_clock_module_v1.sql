-- Arias Suite · Registro de jornada v1, independiente del planificador.
-- Registro append-only, hora del servidor, firma solo al cerrar y GPS configurable por centro.
create table if not exists public.staff_clock_settings (
  hotel_id uuid primary key references public.hotels(id) on delete cascade,
  timezone_name text not null default 'Europe/Madrid',
  location_mode text not null default 'OFF' check (location_mode in ('OFF','OPTIONAL','REQUIRED')),
  signature_on_out boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
create table if not exists public.staff_clock_events (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid not null references public.hotels(id),
  operator_id uuid not null references public.staff_operators(id),
  work_date date not null,
  event_type text not null check (event_type in ('IN','BREAK_START','BREAK_END','OUT')),
  event_at timestamptz not null default clock_timestamp(),
  created_by uuid not null references auth.users(id),
  latitude numeric(9,6),
  longitude numeric(9,6),
  accuracy_m numeric(9,2),
  signature_png text,
  constraint staff_clock_location_consistency check (
    (latitude is null and longitude is null and accuracy_m is null)
    or (latitude between -90 and 90 and longitude between -180 and 180 and accuracy_m between 0 and 100000)
  ),
  constraint staff_clock_signature_only_out check (signature_png is null or event_type='OUT')
);
create index if not exists staff_clock_events_person_time_idx
  on public.staff_clock_events(operator_id,event_at desc);
create index if not exists staff_clock_events_hotel_day_idx
  on public.staff_clock_events(hotel_id,work_date,operator_id);
create index if not exists staff_clock_events_creator_idx
  on public.staff_clock_events(created_by,event_at desc);
alter table public.staff_clock_settings enable row level security;
alter table public.staff_clock_events enable row level security;
revoke all on public.staff_clock_settings from public,anon,authenticated;
revoke all on public.staff_clock_events from public,anon,authenticated;
grant select,insert,update on public.staff_clock_settings to authenticated;
grant select on public.staff_clock_events to authenticated;
create policy staff_clock_settings_read on public.staff_clock_settings for select to authenticated
  using (
    public.is_platform_admin()
    or public.has_hotel_permission(hotel_id,'maintenance.configure')
    or exists (select 1 from public.staff_operators s
      where s.hotel_id=staff_clock_settings.hotel_id and s.linked_user_id=(select auth.uid()) and s.active)
  );
create policy staff_clock_settings_insert on public.staff_clock_settings for insert to authenticated
  with check (public.is_platform_admin() or public.has_hotel_permission(hotel_id,'maintenance.configure'));
create policy staff_clock_settings_update on public.staff_clock_settings for update to authenticated
  using (public.is_platform_admin() or public.has_hotel_permission(hotel_id,'maintenance.configure'))
  with check (public.is_platform_admin() or public.has_hotel_permission(hotel_id,'maintenance.configure'));
create policy staff_clock_events_read on public.staff_clock_events for select to authenticated
  using (
    public.is_platform_admin()
    or public.has_hotel_permission(hotel_id,'maintenance.configure')
    or exists (select 1 from public.staff_operators s where s.id=staff_clock_events.operator_id
      and s.hotel_id=staff_clock_events.hotel_id and s.linked_user_id=(select auth.uid()) and s.active)
  );
-- Only this RPC may INSERT. No UPDATE/DELETE grants or policies on original events.
create or replace function public.staff_clock_punch(
  p_operator_id uuid,
  p_event_type text,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy_m double precision default null,
  p_signature_png text default null
)
returns public.staff_clock_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_hotel_id uuid;
  v_mode text := 'OFF';
  v_timezone text := 'Europe/Madrid';
  v_signature_required boolean := true;
  v_now timestamptz := clock_timestamp();
  v_today date;
  v_work_date date;
  v_last public.staff_clock_events%rowtype;
  v_saved public.staff_clock_events%rowtype;
begin
  if v_uid is null then raise exception 'Inicia sesión para registrar tu jornada.'; end if;
  if p_event_type not in ('IN','BREAK_START','BREAK_END','OUT') or p_event_type is null then
    raise exception 'Tipo de fichaje no válido.';
  end if;
  -- Serialize events for one worker to prevent duplicate or out-of-order clicks.
  select s.hotel_id into v_hotel_id from public.staff_operators s
    join public.hotels h on h.id=s.hotel_id and h.active=true
    join public.profiles pr on pr.id=v_uid and pr.active=true and pr.account_status='ACTIVE'
    where s.id=p_operator_id and s.linked_user_id=v_uid and s.active=true
    for update of s;
  if v_hotel_id is null then raise exception 'No tienes una ficha de trabajador activa vinculada a esta cuenta.'; end if;
  select c.location_mode,c.timezone_name,c.signature_on_out
    into v_mode,v_timezone,v_signature_required
    from public.staff_clock_settings c where c.hotel_id=v_hotel_id;
  v_mode := coalesce(v_mode,'OFF');
  v_timezone := coalesce(v_timezone,'Europe/Madrid');
  v_signature_required := coalesce(v_signature_required,true);
  if not exists (select 1 from pg_catalog.pg_timezone_names where name=v_timezone) then
    raise exception 'Zona horaria del centro no válida; solicita su corrección.';
  end if;
  v_today := (v_now at time zone v_timezone)::date;
  select * into v_last from public.staff_clock_events
    where operator_id=p_operator_id order by event_at desc,id desc limit 1;
  if p_event_type='IN' then
    if v_last.id is not null and v_last.event_type <> 'OUT' then
      raise exception 'Ya hay una jornada abierta. Cierra o comunica el fichaje pendiente.';
    end if;
    if v_last.id is not null and v_last.work_date=v_today then
      raise exception 'Ya se cerró una jornada hoy; comunica la incidencia al responsable.';
    end if;
    v_work_date := v_today;
  else
    if v_last.id is null or v_last.event_type='OUT' then
      raise exception 'Primero debes registrar la entrada.';
    end if;
    if (p_event_type='BREAK_START' and v_last.event_type not in ('IN','BREAK_END'))
       or (p_event_type='BREAK_END' and v_last.event_type <> 'BREAK_START')
       or (p_event_type='OUT' and v_last.event_type not in ('IN','BREAK_END')) then
      raise exception 'El orden de los fichajes no es válido.';
    end if;
    v_work_date := v_last.work_date;
  end if;
  if p_event_type='OUT' and v_signature_required and
      (p_signature_png is null or length(p_signature_png) < 60) then
    raise exception 'Firma en pantalla para cerrar la jornada.';
  end if;
  if p_signature_png is not null then
    if p_event_type <> 'OUT' or length(p_signature_png) > 120000
       or p_signature_png !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' then
      raise exception 'Formato de firma no válido.';
    end if;
  end if;
  if v_mode='OFF' then
    p_latitude := null; p_longitude := null; p_accuracy_m := null;
  elsif v_mode='REQUIRED' and
    (p_latitude is null or p_longitude is null or p_accuracy_m is null) then
    raise exception 'Este centro requiere ubicación en el momento de fichar. Activa el permiso de ubicación o solicita un medio alternativo.';
  end if;
  if (p_latitude is null) <> (p_longitude is null)
     or (p_latitude is null) <> (p_accuracy_m is null)
     or (p_latitude is not null and
       (p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180 or
        p_accuracy_m < 0 or p_accuracy_m > 100000)) then
    raise exception 'Ubicación recibida no válida.';
  end if;
  insert into public.staff_clock_events(
    hotel_id,operator_id,work_date,event_type,event_at,created_by,latitude,longitude,accuracy_m,signature_png)
  values(v_hotel_id,p_operator_id,v_work_date,p_event_type,v_now,v_uid,
    p_latitude,p_longitude,p_accuracy_m,p_signature_png)
  returning * into v_saved;
  return v_saved;
end;
$$;
revoke all on function public.staff_clock_punch(uuid,text,double precision,double precision,double precision,text) from public,anon,authenticated;
grant execute on function public.staff_clock_punch(uuid,text,double precision,double precision,double precision,text) to authenticated;
comment on table public.staff_clock_events is 'Append-only server-timestamped worker punches; do not overwrite or auto-generate punches from planned shifts.';
