begin;
-- Preserve the original PCI plan and its schedule while replacing the unrelated asset.
do $$
declare
 hotel constant uuid := '9e2e3d56-25d7-41a5-8dd6-df6858e735bd';
 g public.pam_source_groups; l public.pam_maintenance_plan_links; group_asset uuid; place uuid;
begin
 if not exists(select 1 from public.pam_source_groups where hotel_id=hotel and source_row=17 and plan_year=2026) then return; end if;
 lock table public.apparatus_registry in share row exclusive mode;
 select * into strict g from public.pam_source_groups where hotel_id=hotel and source_sheet='PAM' and source_row=17 and plan_year=2026 for update;
 select * into strict l from public.pam_maintenance_plan_links where source_group_id=g.id and mark_code='F' and plan_year=2026 for update;
 if g.source_apparatus_expression<>'12' or l.source_apparatus_id<>12
 or (select max(source_id) from public.apparatus_registry where hotel_id=hotel)<>340 then
  raise exception 'El inventario o el grupo PCI ha cambiado. Revisar el ID antes de continuar.';
 end if;
 select id into strict place from public.hotel_locations where hotel_id=hotel and code='HOTEL';
 insert into public.apparatus_registry(hotel_id,source_id,name,plant,location,location_id)
 values(hotel,341,'SISTEMAS CONTRA INCENDIOS','HOTEL','ZONAS COMUNES',place) returning id into group_asset;
 update public.pam_source_groups set source_apparatus_expression='341' where id=g.id;
 update public.pam_source_marks set source_apparatus_id=341,apparatus_registry_id=group_asset
 where hotel_id=hotel and source_version=g.source_version and source_sheet=g.source_sheet and source_row=17 and plan_year=2026 and source_apparatus_id=12;
 update public.pam_maintenance_plan_links set source_apparatus_id=341 where id=l.id;
 update public.maintenance_plans set apparatus_registry_id=group_asset,code='PAM-2026-R17-A341-F',updated_at=now() where id=l.maintenance_plan_id;
end $$;
create table public.technical_book_group_assets (
 hotel_id uuid not null references public.hotels(id),
 group_asset_id uuid not null references public.apparatus_registry(id),
 member_asset_id uuid not null references public.apparatus_registry(id),
 primary key(hotel_id,group_asset_id,member_asset_id)
);
alter table public.technical_book_group_assets enable row level security;
revoke all on public.technical_book_group_assets from public,anon,authenticated;
grant select on public.technical_book_group_assets to authenticated;
create policy book_group_assets_read on public.technical_book_group_assets for select to authenticated
using(public.has_hotel_permission(hotel_id,'maintenance.view'));
insert into public.technical_book_group_assets
select g.hotel_id,g.id,a.id from public.apparatus_registry g join public.apparatus_registry a on a.hotel_id=g.hotel_id
where g.hotel_id='9e2e3d56-25d7-41a5-8dd6-df6858e735bd' and g.source_id=341
and a.source_id in (10,17,19,55,212,217,243,272,328);

-- Fancoils in common areas use their own worksheet in R-SSTT-01-06.
update public.technical_book_plan_bindings b set book_id='fancoils-comunes'
from public.apparatus_registry a where a.id=b.equipment_id and a.hotel_id=b.hotel_id
and b.book_id='climatizadores' and a.name ~* 'fan.?coil';
-- Assets 159,160,319 are present in the inventory but missing from the imported
-- equipment expression for the semiannual common-area worksheet.
do $$
declare
 hotel constant uuid := '9e2e3d56-25d7-41a5-8dd6-df6858e735bd';
 g public.pam_source_groups; template_plan public.maintenance_plans; item record; plan_id uuid;
begin
 select * into g from public.pam_source_groups where hotel_id=hotel and source_row=11 and plan_year=2026 and source_sheet='PAM';
 if not found then return; end if;
 select p.* into strict template_plan from public.maintenance_plans p
 join public.pam_maintenance_plan_links l on l.maintenance_plan_id=p.id
 where l.source_group_id=g.id and l.source_apparatus_id=25 and l.mark_code='F';
 for item in select * from public.apparatus_registry where hotel_id=hotel and active and source_id in (159,160,319) loop
  if exists(select 1 from public.pam_maintenance_plan_links where source_group_id=g.id and source_apparatus_id=item.source_id and mark_code='F') then continue; end if;
  insert into public.pam_source_marks(hotel_id,source_version,source_sheet,source_row,source_column,source_apparatus_id,apparatus_registry_id,plan_year,month_number,week_slot,mark_code)
  select hotel,source_version,source_sheet,source_row,source_column,item.source_id,item.id,plan_year,month_number,week_slot,mark_code
  from public.pam_source_marks where hotel_id=hotel and source_row=11 and plan_year=2026 and source_apparatus_id=25 and mark_code='F';
  insert into public.maintenance_plans(hotel_id,apparatus_registry_id,code,name,maintenance_type,periodicity_value,periodicity_unit,start_date,active)
  values(hotel,item.id,'PAM-2026-R11-A'||item.source_id||'-F',template_plan.name,template_plan.maintenance_type,
   template_plan.periodicity_value,template_plan.periodicity_unit,template_plan.start_date,true) returning id into plan_id;
  insert into public.pam_maintenance_plan_links(maintenance_plan_id,source_group_id,source_apparatus_id,mark_code,plan_year)
  values(plan_id,g.id,item.source_id,'F',2026);
  insert into public.technical_book_plan_bindings(hotel_id,book_id,plan_id,equipment_id) values(hotel,'fancoils-comunes',plan_id,item.id);
 end loop;
 if not g.source_apparatus_expression like '%159-160-319%' then
  update public.pam_source_groups set source_apparatus_expression=g.source_apparatus_expression||'-159-160-319' where id=g.id;
 end if;
end $$;

-- The monthly PAM visit and the daily/weekly controls remain distinguishable.
insert into public.technical_book_plan_bindings(hotel_id,book_id,plan_id,equipment_id)
select p.hotel_id,'legionella',p.id,p.apparatus_registry_id from public.maintenance_plans p
join public.pam_maintenance_plan_links l on l.maintenance_plan_id=p.id
join public.pam_source_groups g on g.id=l.source_group_id and g.hotel_id=p.hotel_id
where g.hotel_id='9e2e3d56-25d7-41a5-8dd6-df6858e735bd' and g.source_row=9 and l.plan_year=2026 and p.active
on conflict do nothing;
create table public.technical_book_control_executions (
 record_id uuid not null references public.technical_book_records(id),
 hotel_id uuid not null references public.hotels(id),
 field_id text not null,
 frequency text,
 equipment_id uuid references public.apparatus_registry(id),
 plan_id uuid references public.maintenance_plans(id),
 location_id uuid references public.hotel_locations(id),
 primary key(record_id,field_id)
);
alter table public.technical_book_control_executions enable row level security;
revoke all on public.technical_book_control_executions from public,anon,authenticated;
grant select on public.technical_book_control_executions to authenticated;
create policy book_control_executions_read on public.technical_book_control_executions for select to authenticated
using(public.has_hotel_permission(hotel_id,'maintenance.view'));
create function public.trace_book_control_execution() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare p uuid;
begin
 if nullif(new.payload->>'campaignTicketId','') is not null then
  select maintenance_plan_id into p from public.maintenance_work_orders where id=(new.payload->>'campaignTicketId')::uuid and hotel_id=new.hotel_id;
 elsif nullif(new.payload->>'assetId','') is not null then
  select plan_id into p from public.technical_book_plan_bindings where hotel_id=new.hotel_id and book_id=new.book_id
   and equipment_id=(new.payload->>'assetId')::uuid order by plan_id limit 1;
 end if;
 insert into public.technical_book_control_executions(record_id,hotel_id,field_id,frequency,equipment_id,plan_id,location_id)
 select new.id,new.hotel_id,f->>'id',f->>'frequency',equipment.id,
  coalesce(binding.plan_id,case when new.book_id<>'legionella' then coalesce(nullif(new.payload->>'pamPlanId','')::uuid,p) end),
  nullif(new.payload->>'locationId','')::uuid
 from jsonb_array_elements(new.payload->'template'->'fields') f
 cross join lateral (select case when new.book_id='legionella'
  then coalesce(nullif(new.payload->'controlEquipmentIds'->>(f->>'id'),'')::uuid,
   case when f->>'frequency'='M' then nullif(new.payload->>'pamEquipmentId','')::uuid end)
  else coalesce(nullif(new.payload->>'assetId','')::uuid,nullif(new.payload->>'pamEquipmentId','')::uuid,(select apparatus_registry_id from public.maintenance_plans where id=p)) end id) equipment
 left join lateral (select plan_id from public.technical_book_plan_bindings b
  where b.hotel_id=new.hotel_id and b.book_id=new.book_id and b.equipment_id=equipment.id order by plan_id limit 1) binding on true
 where coalesce(new.payload->'answers'->(f->>'id')->>'value','') not in ('','NA')
 on conflict(record_id,field_id) do nothing;
 return null;
end $$;
revoke all on function public.trace_book_control_execution() from public,anon,authenticated;
create trigger book_control_execution_trace after insert or update on public.technical_book_records
for each row when(new.payload->>'status'='FINAL') execute function public.trace_book_control_execution();
create function public.guard_legionella_monthly_ticket() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
 if new.payload->>'frequency' not in ('M','ALL') then raise exception 'El ticket mensual del PAM requiere los controles mensuales. Los diarios y semanales se conservan en el libro.'; end if;
 if exists(select 1 from jsonb_array_elements(new.payload->'template'->'fields') f where f->>'frequency'='M' and
  (coalesce(trim(new.payload->'answers'->(f->>'id')->>'value'),'')='' or
  (new.payload ? 'controlIds' and not (new.payload->'controlIds') ? (f->>'id')))) then
  raise exception 'Completa todos los controles mensuales para cerrar la visita del PAM.';
 end if;
 return new;
end $$;
revoke all on function public.guard_legionella_monthly_ticket() from public,anon,authenticated;
create trigger ac_legionella_monthly_ticket before insert or update on public.technical_book_records
for each row when(new.book_id='legionella' and new.payload->>'status'='FINAL' and new.payload->>'pamTicketId' is not null)
execute function public.guard_legionella_monthly_ticket();
commit;
