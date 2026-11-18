begin;

create or replace function public.validate_technical_book_record() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 p jsonb := new.payload;
 template jsonb;
 parent public.technical_book_records;
 f jsonb;
 a jsonb;
 v text;
 note text;
 final boolean;
 frequency text;
 evidence jsonb;
begin
 if tg_op='DELETE' then raise exception 'Los registros técnicos no pueden borrarse.'; end if;
 if auth.uid() is null or auth.uid()='6d755017-7348-41ea-aad7-d1b8334fff99'::uuid then
   raise exception 'Usuario de prueba o sin sesión: acceso de solo lectura. Consulte con el administrador.';
 end if;
 if tg_op='UPDATE' then
   if old.payload->>'status'='FINAL' then raise exception 'La revisión finalizada es inmutable. Utiliza Rectificar.'; end if;
   if (new.id,new.hotel_id,new.book_id,new.definition_hash,new.created_by,new.created_at) is distinct from (old.id,old.hotel_id,old.book_id,old.definition_hash,old.created_by,old.created_at) then raise exception 'No se puede cambiar la identidad del registro.'; end if;
   if p->>'supersedes' is distinct from old.payload->>'supersedes' then raise exception 'No se puede cambiar la revisión original.'; end if;
   new.version := old.version+1;
 else
   new.created_by := auth.uid(); new.created_at := now(); new.version := 1;
 end if;
 select definition into template from public.technical_book_templates where book_id=new.book_id and definition_hash=new.definition_hash;
 if template is null or p->'template' is distinct from template then raise exception 'Plantilla no reconocida.'; end if;
 if p->>'id' is distinct from new.id::text or p->>'hotelId' is distinct from new.hotel_id::text or p->>'bookId' is distinct from new.book_id or p->>'definitionHash' is distinct from new.definition_hash then raise exception 'Identidad de la ficha no válida.'; end if;
 if coalesce(p->>'status','') not in ('DRAFT','FINAL') then raise exception 'Estado no válido.'; end if;
 final := p->>'status'='FINAL'; frequency := p->>'frequency';
 if coalesce(frequency,'') not in ('ALL','D','S','M','V') then raise exception 'Frecuencia no válida.'; end if;
 if coalesce(p->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or (p->>'date')::date::text <> p->>'date' or coalesce(p->>'time','') !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'Fecha u hora no válida.'; end if;
 if coalesce(trim(p->>'asset'),'')='' or coalesce(trim(p->>'technician'),'')='' then raise exception 'Indica equipo y técnico responsable.'; end if;
 foreach v in array array['asset','location','technician','campaign'] loop
   if jsonb_typeof(p->v) is distinct from 'string' or length(p->>v)>300 then raise exception 'Datos de revisión no válidos.'; end if;
 end loop;
 if jsonb_typeof(p->'observations') is distinct from 'string' or length(p->>'observations')>15000 or jsonb_typeof(p->'correctionReason') is distinct from 'string' or length(p->>'correctionReason')>3000 then raise exception 'Observaciones no válidas.'; end if;
 new.supersedes := nullif(p->>'supersedes','')::uuid;
 if new.supersedes is not null then
   select * into parent from public.technical_book_records where id=new.supersedes;
   if parent.id is null or parent.hotel_id<>new.hotel_id or parent.book_id<>new.book_id or parent.payload->>'status'<>'FINAL' or coalesce(trim(p->>'correctionReason'),'')='' or (p->>'revision')::integer <> (parent.payload->>'revision')::integer+1 then raise exception 'Rectificación no válida.'; end if;
 elsif coalesce(p->>'revision','') <> '1' then raise exception 'Revisión inicial no válida.';
 end if;
 if jsonb_typeof(p->'answers') is distinct from 'object' or jsonb_typeof(p->'evidence') is distinct from 'array' then raise exception 'Controles o fotografías no válidos.'; end if;
 if exists(select 1 from jsonb_object_keys(p->'answers') k where not exists(select 1 from jsonb_array_elements(template->'fields') field where field->>'id'=k and (not field ? 'frequency' or frequency='ALL' or field->>'frequency'=frequency) and (not p ? 'controlIds' or (p->'controlIds') ? k))) then raise exception 'Hay controles fuera de la plantilla o frecuencia.'; end if;
 for f in select value from jsonb_array_elements(template->'fields') loop
   if f ? 'frequency' and frequency<>'ALL' and f->>'frequency'<>frequency then continue; end if;
   if p ? 'controlIds' and not (p->'controlIds') ? (f->>'id') then continue; end if;
   a := p->'answers'->(f->>'id');
   if a is not null and (jsonb_typeof(a->'value') is distinct from 'string' or jsonb_typeof(a->'note') is distinct from 'string') then raise exception 'Resultado no válido.'; end if;
   v := coalesce(trim(a->>'value'),''); note := coalesce(trim(a->>'note'),'');
   if length(v)>3000 or length(note)>5000 then raise exception 'Resultado demasiado largo.'; end if;
   if v='' then if final then raise exception 'Falta registrar: %',f->>'label'; else continue; end if; end if;
   if (v='NA' or v='X' or v=f->>'adverse') and note='' then raise exception 'Explica el resultado: %',f->>'label'; end if;
   if v='NA' then continue; end if;
   if (f->>'kind'='check' and v not in ('V','X')) or (f->>'kind'='yesno' and v not in ('SI','NO')) then raise exception 'Resultado no permitido.'; end if;
   if f->>'kind'='number' then
     if replace(v,',','.') !~ '^-?(\d+(\.\d*)?|\.\d+)$' then raise exception 'Medición no numérica.'; end if;
     if f ? 'min' and replace(v,',','.')::numeric < (f->>'min')::numeric then raise exception 'Medición inferior al mínimo.'; end if;
   end if;
   if f->>'kind'='date' and (v !~ '^\d{4}-\d{2}-\d{2}$' or v::date::text<>v) then raise exception 'Fecha de control no válida.'; end if;
 end loop;
 evidence := p->'evidence';
 if jsonb_array_length(evidence)>3 then raise exception 'Máximo tres fotografías.'; end if;
 for a in select value from jsonb_array_elements(evidence) loop
   if jsonb_typeof(a->'name') is distinct from 'string' or coalesce(a->>'dataUrl','') !~ '^data:image/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$' or length(a->>'dataUrl')>1400000 then raise exception 'Fotografía no válida.'; end if;
 end loop;
 if final and new.book_id='puertas-cortafuegos' and p->'answers'->'control-G'->>'value'='X' and jsonb_array_length(evidence)=0 then raise exception 'Adjunta una foto de los obstáculos.'; end if;
 new.updated_at := now();
 new.payload := p || jsonb_build_object('userId',new.created_by,'createdAt',new.created_at,'finalizedAt',case when final then to_jsonb(now()) else 'null'::jsonb end);
 return new;
end $$;

-- Pendientes por control/equipo. Sin reescribir registros ni calendarios históricos.
create function public.technical_book_period(book text, frequency text)
returns interval language sql immutable security invoker set search_path=pg_catalog as $$
 select case
 when frequency='D' then interval '1 day'
 when frequency='S' then interval '7 days'
 when frequency='M' then interval '1 month'
 when frequency is not null then null
 when book in ('bombas','climatizadores') then interval '6 months'
 when book in ('fancoils','cuadros-bt','fotoluminiscentes') then interval '1 year'
 when book in ('luces-emergencia','puertas-cortafuegos','extintores','bie','pci','rociadores','calibraciones') then interval '3 months'
 else null end
$$;
revoke all on function public.technical_book_period(text,text) from public,anon;
grant execute on function public.technical_book_period(text,text) to authenticated;
create function public.technical_book_identity(value text)
returns text language sql immutable security invoker set search_path=pg_catalog as $$
 select lower(regexp_replace(trim(coalesce(value,'')), '\s+', ' ', 'g'))
$$;
revoke all on function public.technical_book_identity(text) from public,anon;
grant execute on function public.technical_book_identity(text) to authenticated;

create function public.guard_technical_book_due() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 p jsonb := new.payload;
 parent jsonb;
 f jsonb;
 selected_ids jsonb;
 period interval;
 last_day date;
 next_day date;
 today date := timezone('Europe/Madrid',now())::date;
 recorded_day date := (p->>'date')::date;
begin
 if p->>'supersedes' is not null and p->>'supersedes'<>'' then
   select payload into parent from public.technical_book_records where id=(p->>'supersedes')::uuid;
   -- Rectificar conserva la identidad y la fecha de la ejecución; no abre otro ciclo.
   if parent is null or (p->>'asset',p->>'location',p->>'date',p->>'frequency') is distinct from
      (parent->>'asset',parent->>'location',parent->>'date',parent->>'frequency')
      or p->'controlIds' is distinct from parent->'controlIds' then
     raise exception 'Una rectificación debe conservar el equipo, fecha y controles de la revisión original.';
   end if;
   return new;
 end if;
 if recorded_day>today then raise exception 'No se puede registrar una revisión futura.'; end if;
 if p ? 'controlIds' then
   selected_ids := p->'controlIds';
   if jsonb_typeof(selected_ids) is distinct from 'array' or jsonb_array_length(selected_ids)=0 then
     raise exception 'Selecciona al menos un control pendiente válido.';
   end if;
   if exists(select 1 from jsonb_array_elements(selected_ids) x where jsonb_typeof(x)<>'string')
     or (select count(*) from jsonb_array_elements(selected_ids))<>(select count(distinct x) from jsonb_array_elements(selected_ids) x)
     or exists(select 1 from jsonb_array_elements_text(selected_ids) x where not exists(
       select 1 from public.technical_book_templates t, jsonb_array_elements(t.definition->'fields') field
       where t.book_id=new.book_id and t.definition_hash=new.definition_hash and field->>'id'=x
       and (not field ? 'frequency' or p->>'frequency'='ALL' or field->>'frequency'=p->>'frequency'))) then
     raise exception 'Controles pendientes no válidos.';
   end if;
 end if;
 -- Serializa las finalizaciones simultáneas del mismo hotel, libro e instalación.
 perform pg_advisory_xact_lock(hashtextextended(new.hotel_id::text || ':' || new.book_id || ':' ||
   case when new.book_id='legionella' then 'hotel' else
     public.technical_book_identity(p->>'asset') || ':' || public.technical_book_identity(p->>'location') end,0));
 for f in select field from public.technical_book_templates t, jsonb_array_elements(t.definition->'fields') field
   where t.book_id=new.book_id and t.definition_hash=new.definition_hash
 loop
   if f ? 'frequency' and p->>'frequency'<>'ALL' and f->>'frequency'<>p->>'frequency' then continue; end if;
   if selected_ids is not null and not selected_ids ? (f->>'id') then continue; end if;
   period := public.technical_book_period(new.book_id,f->>'frequency');
   if period is null then continue; end if;
   select max((r.payload->>'date')::date) into last_day from public.technical_book_records r
   where r.hotel_id=new.hotel_id and r.book_id=new.book_id and r.id<>new.id
    and r.payload->>'status'='FINAL' and r.supersedes is null
    and (new.book_id='legionella' or
      (public.technical_book_identity(r.payload->>'asset')=public.technical_book_identity(p->>'asset')
       and public.technical_book_identity(r.payload->>'location')=public.technical_book_identity(p->>'location')))
    and coalesce(trim(r.payload->'answers'->(f->>'id')->>'value'),'') not in ('','NA');
   if last_day is not null then
     next_day := (last_day + period)::date;
     if next_day>today or next_day>recorded_day then
       raise exception 'Todavía no toca: %. Próxima fecha: %.', f->>'label',to_char(next_day,'DD/MM/YYYY');
     end if;
   end if;
 end loop;
 return new;
end $$;
revoke all on function public.guard_technical_book_due() from public,anon,authenticated;
create trigger technical_book_records_due before insert or update on public.technical_book_records
 for each row execute function public.guard_technical_book_due();

create function public.guard_maintenance_execution_due() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare
 plan public.maintenance_plans;
 today date := timezone('Europe/Madrid',now())::date;
 executed_day date := timezone('Europe/Madrid',new.executed_at)::date;
begin
 -- Los resultados se recalculan después de añadir medidas. No confundirlo con otra ejecución.
 if tg_op='UPDATE' then
   if (new.maintenance_plan_id,new.executed_at) is not distinct from (old.maintenance_plan_id,old.executed_at)
      and (old.result<>'CANCELLED' or new.result='CANCELLED') then return new; end if;
 end if;
 if new.result='CANCELLED' then return new; end if;
 select * into plan from public.maintenance_plans where id=new.maintenance_plan_id for update;
 if plan.id is null or not plan.active then raise exception 'Mantenimiento inexistente o desactivado.'; end if;
 if executed_day is null or executed_day>today then raise exception 'No se puede registrar una revisión futura o sin fecha.'; end if;
 if plan.next_due_date is null and plan.periodicity_unit is distinct from 'VARIABLE' then raise exception 'Pendiente de programar: indica la primera fecha en el PAM.'; end if;
 if plan.next_due_date>today or plan.next_due_date>executed_day then
   raise exception 'Todavía no toca esta revisión. Próxima fecha: %.',to_char(plan.next_due_date,'DD/MM/YYYY');
 end if;
 return new;
end $$;
revoke all on function public.guard_maintenance_execution_due() from public,anon,authenticated;
create trigger maintenance_executions_due before insert or update on public.maintenance_executions
 for each row execute function public.guard_maintenance_execution_due();

create function public.guard_preventive_work_order_due() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare planned_day date;
begin
 planned_day := case when tg_op='INSERT' then new.scheduled_date else old.scheduled_date end;
 if new.work_type='PREVENTIVE' and new.status in ('IN_PROGRESS','COMPLETED')
    and (tg_op='INSERT' or new.status is distinct from old.status)
    and (planned_day is null or planned_day>timezone('Europe/Madrid',now())::date) then
   raise exception 'Todavía no toca esta revisión. Consulta la fecha programada en el PAM.';
 end if;
 return new;
end $$;
revoke all on function public.guard_preventive_work_order_due() from public,anon,authenticated;
create trigger maintenance_work_orders_due before insert or update on public.maintenance_work_orders
 for each row execute function public.guard_preventive_work_order_due();

commit;
