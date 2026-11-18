-- Configuración explícita por empresa/centro. No genera fichajes retroactivos.
alter table public.staff_clock_settings
  add column if not exists is_enabled boolean not null default false;
alter table public.staff_clock_settings
  add column if not exists enabled_from date not null default current_date;
CREATE OR REPLACE FUNCTION public.staff_clock_punch(p_operator_id uuid, p_event_type text, p_latitude double precision DEFAULT NULL::double precision, p_longitude double precision DEFAULT NULL::double precision, p_accuracy_m double precision DEFAULT NULL::double precision, p_signature_png text DEFAULT NULL::text)
 RETURNS staff_clock_events
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_hotel_id uuid;
  v_mode text := 'OFF';
  v_timezone text := 'Europe/Madrid';
  v_signature_required boolean := true;
  v_is_enabled boolean := false;
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
  select c.location_mode,c.timezone_name,c.signature_on_out,c.is_enabled
    into v_mode,v_timezone,v_signature_required,v_is_enabled
    from public.staff_clock_settings c where c.hotel_id=v_hotel_id;
  if not coalesce(v_is_enabled,false) then
    raise exception 'El registro de jornada aún no está activado para este centro.';
  end if;
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
$function$;
revoke all on function public.staff_clock_punch(uuid,text,double precision,double precision,double precision,text) from public,anon,authenticated;
grant execute on function public.staff_clock_punch(uuid,text,double precision,double precision,double precision,text) to authenticated;