begin;
create table public.technical_book_campaigns (
 ticket_id uuid primary key references public.maintenance_work_orders(id),
 hotel_id uuid not null references public.hotels(id),
 kind text not null check(kind in ('FANCOILS','PCI')),
 created_at timestamptz not null default now(),
 closed_at timestamptz,
 closed_by uuid references auth.users(id)
);
create table public.technical_book_campaign_targets (
 id uuid primary key default gen_random_uuid(),
 ticket_id uuid not null references public.technical_book_campaigns(ticket_id),
 hotel_id uuid not null references public.hotels(id),
 book_id text not null,
 target_key text not null,
 label text not null,
 location text not null,
 location_id uuid not null references public.hotel_locations(id),
 equipment_id uuid references public.apparatus_registry(id),
 unit_id uuid references public.technical_book_units(id),
 required_controls jsonb not null check(jsonb_typeof(required_controls)='array'),
 required boolean not null default true,
 started_at timestamptz,
 previous_work jsonb,
 previous_confirmed_at timestamptz,
 previous_confirmed_by uuid references auth.users(id),
 record_id uuid unique references public.technical_book_records(id),
 unique(ticket_id,book_id,target_key)
);
create index book_campaign_targets_hotel on public.technical_book_campaign_targets(hotel_id,ticket_id,book_id);
alter table public.technical_book_campaigns enable row level security;
alter table public.technical_book_campaign_targets enable row level security;
revoke all on public.technical_book_campaigns,public.technical_book_campaign_targets from public,anon,authenticated;
grant select on public.technical_book_campaigns,public.technical_book_campaign_targets to authenticated;
create policy book_campaigns_read on public.technical_book_campaigns for select to authenticated using(public.has_hotel_permission(hotel_id,'maintenance.view'));
create policy book_campaign_targets_read on public.technical_book_campaign_targets for select to authenticated using(public.has_hotel_permission(hotel_id,'maintenance.view'));

-- Called by ticket generation and by the authenticated scope-refresh wrapper.
create function public.seed_technical_book_campaign(target_ticket uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 w public.maintenance_work_orders; asset public.apparatus_registry; campaign_kind text; item record;
begin
 select * into w from public.maintenance_work_orders where id=target_ticket for update;
 if not found or w.work_type<>'PREVENTIVE' or w.status not in ('PENDING','IN_PROGRESS','IN_MANAGEMENT') then return; end if;
 select a.* into asset from public.apparatus_registry a join public.maintenance_plans p on p.apparatus_registry_id=a.id
 where p.id=w.maintenance_plan_id and p.hotel_id=w.hotel_id and a.hotel_id=w.hotel_id and p.active and a.active;
 if not found or asset.source_id not in (340,341) then return; end if;
 if not exists(select 1 from public.maintenance_exercise_start where hotel_id=w.hotel_id and started_at is not null
   and w.scheduled_date>=timezone('Europe/Madrid',started_at)::date) then return; end if;
 campaign_kind:=case asset.source_id when 340 then 'FANCOILS' else 'PCI' end;
 insert into public.technical_book_campaigns(ticket_id,hotel_id,kind) values(w.id,w.hotel_id,campaign_kind)
 on conflict(ticket_id) do nothing;
 -- Scope changes retain every completed item and its original snapshot.
 update public.technical_book_campaign_targets t set required=false
 where t.ticket_id=w.id and t.record_id is null and (
  (t.unit_id is not null and not exists(select 1 from public.technical_book_units where id=t.unit_id and active))
  or not exists(select 1 from public.hotel_locations where id=t.location_id and active));
 for item in
  select 'fancoils'::text book_id,'location:'||l.id target_key,coalesce(l.code,l.name) label,
    l.id location_id,null::uuid equipment_id,null::uuid unit_id
  from public.hotel_locations l where campaign_kind='FANCOILS' and l.hotel_id=w.hotel_id and l.active and l.location_type='HABITACION'
  union all
  select u.book_id,'unit:'||u.id,u.code||' · '||u.name,u.location_id,u.equipment_id,u.id
  from public.technical_book_units u join public.hotel_locations l on l.id=u.location_id and l.active
  where campaign_kind='PCI' and u.hotel_id=w.hotel_id and u.active
  union all
  select b.book_id,'asset:'||asset.id,asset.source_id||' · '||asset.name,asset.location_id,asset.id,null::uuid
  from (values('pci'),('rociadores')) b(book_id) where campaign_kind='PCI' and asset.location_id is not null
 loop
  insert into public.technical_book_campaign_targets(ticket_id,hotel_id,book_id,target_key,label,location,location_id,equipment_id,unit_id,required_controls,previous_work)
  values(w.id,w.hotel_id,item.book_id,item.target_key,item.label,public.book_location_path(item.location_id),item.location_id,item.equipment_id,item.unit_id,
   (select jsonb_agg(f->>'id') from public.technical_book_templates t, jsonb_array_elements(t.definition->'fields') f
    where t.book_id=item.book_id and t.definition_hash=(select min(definition_hash) from public.technical_book_templates where book_id=item.book_id)),
    case when campaign_kind='FANCOILS' then (select to_jsonb(r) from public.maintenance_room_fancoil_tracking r
      join public.hotel_locations l on l.code=r.room_code and l.hotel_id=r.hotel_id
      where r.hotel_id=w.hotel_id and l.id=item.location_id and r.status='DONE') end)
  on conflict(ticket_id,book_id,target_key) do update
  set required=true,label=excluded.label,location=excluded.location,location_id=excluded.location_id
  where public.technical_book_campaign_targets.record_id is null and public.technical_book_campaign_targets.previous_confirmed_at is null;
 end loop;
end $$;
revoke all on function public.seed_technical_book_campaign(uuid) from public,anon,authenticated;
create function public.on_book_campaign_ticket() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin perform public.seed_technical_book_campaign(new.id); return null; end $$;
revoke all on function public.on_book_campaign_ticket() from public,anon,authenticated;
create trigger book_campaign_ticket after insert on public.maintenance_work_orders
for each row when(new.work_type='PREVENTIVE') execute function public.on_book_campaign_ticket();

create function public.refresh_technical_book_campaign(target_ticket uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare h uuid;
begin
 select hotel_id into h from public.maintenance_work_orders where id=target_ticket for update;
 if auth.uid() is null or auth.uid()='6d755017-7348-41ea-aad7-d1b8334fff99'
 or not coalesce(public.has_hotel_permission(h,'maintenance.update'),false) then raise exception 'Sin permiso para actualizar el alcance.'; end if;
 perform public.seed_technical_book_campaign(target_ticket);
 if not exists(select 1 from public.technical_book_campaigns where ticket_id=target_ticket and closed_at is null) then
  raise exception 'Campaña no disponible. Comprueba el arranque y el estado del ticket.';
 end if;
end $$;
revoke all on function public.refresh_technical_book_campaign(uuid) from public,anon;
grant execute on function public.refresh_technical_book_campaign(uuid) to authenticated;

create function public.guard_book_campaign_record() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare t public.technical_book_campaign_targets; w public.maintenance_work_orders;
begin
 if nullif(new.payload->>'campaignTargetId','') is null then
  if nullif(new.payload->>'campaignTicketId','') is not null then raise exception 'Falta seleccionar la unidad de la campaña.'; end if;
  return new;
 end if;
 if auth.uid() is null or auth.uid()='6d755017-7348-41ea-aad7-d1b8334fff99'
 or not coalesce(public.has_hotel_permission(new.hotel_id,'maintenance.update'),false) then raise exception 'Sin permiso para guardar en la campaña.'; end if;
 select * into w from public.maintenance_work_orders where id=(new.payload->>'campaignTicketId')::uuid for update;
 select * into t from public.technical_book_campaign_targets where id=(new.payload->>'campaignTargetId')::uuid and ticket_id=w.id for update;
 if not found or not t.required or (t.hotel_id,t.book_id,t.target_key) is distinct from (new.hotel_id,new.book_id,new.payload->>'targetKey')
 or w.hotel_id<>new.hotel_id or w.status not in ('PENDING','IN_PROGRESS','IN_MANAGEMENT') or w.scheduled_date>timezone('Europe/Madrid',now())::date
 or not exists(select 1 from public.maintenance_exercise_start where hotel_id=w.hotel_id and started_at is not null
 and w.scheduled_date>=timezone('Europe/Madrid',started_at)::date) then raise exception 'Unidad o campaña no disponible para esta fecha.'; end if;
 if new.payload->>'pamTicketId' is not null then raise exception 'La campaña se cierra después de completar todas las unidades.'; end if;
 if t.previous_confirmed_at is not null or (t.record_id is not null and t.record_id<>new.id) then raise exception 'Esta unidad ya tiene una revisión finalizada en la campaña.'; end if;
 if new.payload->>'status'='FINAL' then
  if exists(select 1 from jsonb_array_elements_text(t.required_controls) f where
   coalesce(trim(new.payload->'answers'->f->>'value'),'')='' or (new.payload ? 'controlIds' and not (new.payload->'controlIds') ? f))
  or not exists(select 1 from jsonb_each(new.payload->'answers') a where a.value->>'value' not in ('','NA')) then
   raise exception 'Completa todos los controles de la unidad antes de finalizar.';
  end if;
 end if;
 new.payload:=new.payload||jsonb_build_object('campaign',w.ot_number||' · '||extract(year from w.scheduled_date)::int);
 return new;
end $$;
revoke all on function public.guard_book_campaign_record() from public,anon,authenticated;
create trigger ab_book_campaign_guard before insert or update on public.technical_book_records for each row execute function public.guard_book_campaign_record();
create function public.attach_book_campaign_record() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare t public.technical_book_campaign_targets;
begin
 update public.technical_book_campaign_targets set record_id=new.id,started_at=coalesce(started_at,now())
 where id=(new.payload->>'campaignTargetId')::uuid and hotel_id=new.hotel_id and book_id=new.book_id and (record_id is null or record_id=new.id)
 returning * into strict t;
 return null;
end $$;
revoke all on function public.attach_book_campaign_record() from public,anon,authenticated;
create trigger book_campaign_record_final after insert or update on public.technical_book_records
for each row when(new.payload->>'status'='FINAL' and new.payload->>'campaignTargetId' is not null)
execute function public.attach_book_campaign_record();

create function public.complete_technical_book_campaign(target_ticket uuid,target_outcome text,target_observations text default '') returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.technical_book_campaigns; w public.maintenance_work_orders;
begin
 select * into w from public.maintenance_work_orders where id=target_ticket for update;
 select * into c from public.technical_book_campaigns where ticket_id=w.id for update;
 if not found or auth.uid() is null or auth.uid()='6d755017-7348-41ea-aad7-d1b8334fff99'
 or not coalesce(public.has_hotel_permission(c.hotel_id,'maintenance.update'),false) then raise exception 'Sin permiso para finalizar la campaña.'; end if;
 if c.closed_at is not null or w.status not in ('PENDING','IN_PROGRESS','IN_MANAGEMENT')
 or w.scheduled_date>timezone('Europe/Madrid',now())::date
 or not exists(select 1 from public.maintenance_exercise_start where hotel_id=c.hotel_id and started_at is not null
  and w.scheduled_date>=timezone('Europe/Madrid',started_at)::date) then raise exception 'Campaña no disponible para finalizar.'; end if;
 if target_outcome not in ('COMPLETED','COMPLETED_WITH_ISSUES') or target_outcome is null then raise exception 'Selecciona el resultado global.'; end if;
 lock table public.hotel_locations,public.technical_book_units in share mode;
 if (c.kind='FANCOILS' and exists(
  select 1 from public.hotel_locations l where l.hotel_id=c.hotel_id and l.active and l.location_type='HABITACION'
  and not exists(select 1 from public.technical_book_campaign_targets t where t.ticket_id=w.id and t.required and t.location_id=l.id)
 )) or (c.kind='PCI' and exists(
  select 1 from public.technical_book_units u where u.hotel_id=c.hotel_id and u.active
  and not exists(select 1 from public.technical_book_campaign_targets t where t.ticket_id=w.id and t.required and t.unit_id=u.id)
 )) then raise exception 'El catálogo ha cambiado. Actualiza el alcance de la campaña.'; end if;
 if not exists(select 1 from public.technical_book_campaign_targets where ticket_id=w.id and required)
 or exists(select 1 from public.technical_book_campaign_targets where ticket_id=w.id and required and record_id is null and previous_confirmed_at is null) then
  raise exception 'Quedan unidades o apartados pendientes de revisar.';
 end if;
 if c.kind='PCI' and (
  exists(select 1 from public.technical_book_campaign_targets t join public.technical_book_units u on u.id=t.unit_id where t.ticket_id=w.id and t.required and not u.verified)
  or exists(select 1 from (values('extintores'),('bie'),('pci'),('rociadores')) b(book_id) where not exists(
    select 1 from public.technical_book_campaign_targets t where t.ticket_id=w.id and t.required and t.book_id=b.book_id))
 ) then raise exception 'Confirma el listado vigente de extintores y BIE y los cuatro apartados antes de cerrar.'; end if;
 update public.technical_book_campaigns set closed_at=now(),closed_by=auth.uid() where ticket_id=w.id;
 select * into w from public.complete_maintenance_work_order(w.id,target_outcome,target_observations);
 if w.status is distinct from 'COMPLETED' then raise exception 'No se ha podido cerrar el ticket.'; end if;
end $$;
revoke all on function public.complete_technical_book_campaign(uuid,text,text) from public,anon;
grant execute on function public.complete_technical_book_campaign(uuid,text,text) to authenticated;
create function public.guard_campaign_ticket_close() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if exists(select 1 from public.technical_book_campaigns where ticket_id=new.id and closed_at is null) then
  raise exception 'Finaliza la campaña global con todas sus fichas y la confirmación del operario.';
 end if;
 return new;
end $$;
revoke all on function public.guard_campaign_ticket_close() from public,anon,authenticated;
create trigger campaign_ticket_close before update of status on public.maintenance_work_orders
for each row when(new.status='COMPLETED' and old.status is distinct from new.status)
execute function public.guard_campaign_ticket_close();
create function public.stamp_fancoil_tracking_operator() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null or auth.uid()='6d755017-7348-41ea-aad7-d1b8334fff99' then raise exception 'Acceso de solo lectura.'; end if;
 if new.status<>'DONE' and exists(
  select 1 from public.technical_book_campaign_targets t join public.technical_book_campaigns c on c.ticket_id=t.ticket_id
  join public.hotel_locations l on l.id=t.location_id
  where t.hotel_id=new.hotel_id and t.book_id='fancoils' and t.required and c.closed_at is null
  and l.code=new.room_code and (t.record_id is not null or t.previous_confirmed_at is not null)
 ) then raise exception 'La ficha finalizada de esta campaña se conserva como terminada.'; end if;
 if new.status='DONE' and exists(
  select 1 from public.technical_book_campaign_targets t join public.technical_book_campaigns c on c.ticket_id=t.ticket_id
  join public.hotel_locations l on l.id=t.location_id
  where t.hotel_id=new.hotel_id and t.book_id='fancoils' and t.required and c.closed_at is null
  and l.code=new.room_code and t.record_id is null and t.previous_confirmed_at is null
 ) then raise exception 'Finaliza la ficha de la habitación para marcarla terminada en esta campaña.'; end if;
 select coalesce(nullif(trim(full_name),''),login_identifier,id::text) into strict new.technician from public.profiles where id=auth.uid();
 update public.technical_book_campaign_targets t set started_at=case when new.status='IN_PROGRESS' then now() else null end
 from public.hotel_locations l,public.technical_book_campaigns c
 where t.location_id=l.id and t.ticket_id=c.ticket_id and c.closed_at is null and t.book_id='fancoils'
 and t.hotel_id=new.hotel_id and l.code=new.room_code and t.record_id is null and t.previous_confirmed_at is null;
 new.updated_by:=auth.uid(); new.updated_at:=now();
 if new.status='DONE' then
  new.completed_at:=case when tg_op='UPDATE' and old.status='DONE' then old.completed_at else timezone('Europe/Madrid',now())::date end;
 end if;
 return new;
end $$;
revoke all on function public.stamp_fancoil_tracking_operator() from public,anon,authenticated;
create trigger fancoil_tracking_operator before insert or update on public.maintenance_room_fancoil_tracking
for each row execute function public.stamp_fancoil_tracking_operator();
create function public.track_final_room_fancoil_record() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 insert into public.maintenance_room_fancoil_tracking(hotel_id,room_code,status,completed_at,technician,notes)
 values(new.hotel_id,new.payload->>'asset','DONE',(new.payload->>'date')::date,new.payload->>'technician',new.payload->>'observations')
 on conflict(hotel_id,room_code) do update set status='DONE',completed_at=excluded.completed_at,
  technician=excluded.technician,notes=excluded.notes;
 return null;
end $$;
revoke all on function public.track_final_room_fancoil_record() from public,anon,authenticated;
create trigger book_fancoil_room_tracking after insert or update on public.technical_book_records
for each row when(new.book_id='fancoils' and new.payload->>'status'='FINAL')
execute function public.track_final_room_fancoil_record();
create function public.confirm_previous_fancoil_work(target_ticket uuid,target_ids uuid[]) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare w public.maintenance_work_orders;
begin
 select * into w from public.maintenance_work_orders where id=target_ticket for update;
 if auth.uid() is null or auth.uid()='6d755017-7348-41ea-aad7-d1b8334fff99'
 or not coalesce(public.has_hotel_permission(w.hotel_id,'maintenance.update'),false)
 or w.status not in ('PENDING','IN_PROGRESS','IN_MANAGEMENT') or w.scheduled_date>timezone('Europe/Madrid',now())::date
 or not exists(select 1 from public.technical_book_campaigns where ticket_id=w.id and kind='FANCOILS' and closed_at is null)
 then raise exception 'Campaña no disponible para confirmar trabajos anteriores.'; end if;
 if cardinality(target_ids)=0 or target_ids is null then raise exception 'Selecciona las habitaciones ya realizadas.'; end if;
 if exists(select 1 from unnest(target_ids) id where not exists(
   select 1 from public.technical_book_campaign_targets t where t.id=id and t.ticket_id=w.id and t.required and t.book_id='fancoils'
   and t.previous_work->>'status'='DONE' and t.record_id is null and t.previous_confirmed_at is null
   and (nullif(t.previous_work->>'completed_at','') is null
     or extract(year from (t.previous_work->>'completed_at')::date)=extract(year from w.scheduled_date))
 )) then raise exception 'Hay habitaciones sin un trabajo anterior compatible con esta campaña.'; end if;
 update public.technical_book_campaign_targets set previous_confirmed_at=now(),previous_confirmed_by=auth.uid()
 where id=any(target_ids) and ticket_id=w.id;
end $$;
revoke all on function public.confirm_previous_fancoil_work(uuid,uuid[]) from public,anon;
grant execute on function public.confirm_previous_fancoil_work(uuid,uuid[]) to authenticated;
commit;
