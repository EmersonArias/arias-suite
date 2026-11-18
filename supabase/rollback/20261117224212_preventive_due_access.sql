-- Recuperación del esquema anterior. Las fichas y sus historiales se conservan.
begin;
drop trigger maintenance_work_orders_due on public.maintenance_work_orders;
drop trigger maintenance_executions_due on public.maintenance_executions;
drop trigger technical_book_records_due on public.technical_book_records;
drop function public.guard_preventive_work_order_due();
drop function public.guard_maintenance_execution_due();
drop function public.guard_technical_book_due();
drop function public.technical_book_identity(text);
drop function public.technical_book_period(text,text);
CREATE OR REPLACE FUNCTION public.validate_technical_book_record()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
 if exists(select 1 from jsonb_object_keys(p->'answers') k where not exists(select 1 from jsonb_array_elements(template->'fields') field where field->>'id'=k and (not field ? 'frequency' or frequency='ALL' or field->>'frequency'=frequency))) then raise exception 'Hay controles fuera de la plantilla o frecuencia.'; end if;
 for f in select value from jsonb_array_elements(template->'fields') loop
   if f ? 'frequency' and frequency<>'ALL' and f->>'frequency'<>frequency then continue; end if;
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
end $function$;
commit;
