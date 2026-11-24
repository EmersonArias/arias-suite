CREATE OR REPLACE FUNCTION public.guard_technical_book_due()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
 if nullif(p->>'campaignTargetId','') is not null then return new; end if;
 -- Serializa las finalizaciones simultáneas del mismo hotel, libro e instalación.
 perform pg_advisory_xact_lock(hashtextextended(new.hotel_id::text || ':' || new.book_id || ':' ||
   case when new.book_id='legionella' then 'hotel' else coalesce(p->>'targetKey',
     public.technical_book_identity(p->>'asset') || ':' || public.technical_book_identity(p->>'location')) end,0));
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
    and (case when new.book_id='legionella' and nullif(p->'controlEquipmentIds'->>(f->>'id'),'') is not null
     then r.payload->'controlEquipmentIds'->>(f->>'id')=p->'controlEquipmentIds'->>(f->>'id')
     when p ? 'targetKey' then r.payload->>'targetKey'=p->>'targetKey' else
     (new.book_id='legionella' or (public.technical_book_identity(r.payload->>'asset')=public.technical_book_identity(p->>'asset')
     and public.technical_book_identity(r.payload->>'location')=public.technical_book_identity(p->>'location'))) end)
    and coalesce(trim(r.payload->'answers'->(f->>'id')->>'value'),'') not in ('','NA');
   if last_day is not null then
     next_day := (last_day + period)::date;
     if next_day>today or next_day>recorded_day then
       raise exception 'Todavía no toca: %. Próxima fecha: %.', f->>'label',to_char(next_day,'DD/MM/YYYY');
     end if;
   end if;
 end loop;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION public.technical_book_period(book text, frequency text)
 RETURNS interval
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
 select case
 when frequency='D' then interval '1 day'
 when frequency='S' then interval '7 days'
 when frequency='M' then interval '1 month'
 when frequency is not null then null
 when book in ('bombas','climatizadores','fancoils-comunes') then interval '6 months'
 when book in ('fancoils','cuadros-bt','fotoluminiscentes') then interval '1 year'
 when book in ('luces-emergencia','puertas-cortafuegos','extintores','bie','pci','rociadores','calibraciones') then interval '3 months'
 else null end
$function$;
