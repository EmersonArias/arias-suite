-- R-SSTT-01-07, Diagonal Zero. Keep the original plan, mark and scheduled job.
do $$
declare
  hotel constant uuid := '9e2e3d56-25d7-41a5-8dd6-df6858e735bd';
  asset_name constant text := 'FANCOILS DE HABITACIONES';
  source_group public.pam_source_groups%rowtype;
  plan public.maintenance_plans%rowtype;
  link public.pam_maintenance_plan_links%rowtype;
  mark public.pam_source_marks%rowtype;
  lift uuid;
  fancoils uuid;
begin
  if not exists (select 1 from public.pam_source_groups where hotel_id = hotel and plan_year = 2026 and source_sheet = 'PAM' and source_row = 12) then
    return;
  end if;
  -- source_id is not unique in the legacy inventory. Serialize the allocation.
  lock table public.apparatus_registry in share row exclusive mode;
  select * into strict source_group from public.pam_source_groups
    where hotel_id = hotel and plan_year = 2026 and source_sheet = 'PAM' and source_row = 12
      and maintenance_name like '%R-SSTT-01-07 %' for update;
  select * into strict link from public.pam_maintenance_plan_links
    where source_group_id = source_group.id and plan_year = 2026 and mark_code = 'F' for update;
  select * into strict plan from public.maintenance_plans
    where id = link.maintenance_plan_id and hotel_id = hotel for update;
  select * into strict mark from public.pam_source_marks
    where hotel_id = hotel and plan_year = 2026 and source_version = source_group.source_version
      and source_sheet = source_group.source_sheet and source_row = source_group.source_row and mark_code = 'F' for update;
  select id into strict lift from public.apparatus_registry
    where hotel_id = hotel and source_id = 7 and name = 'ASCENSOR CLIENTES C';
  if source_group.source_apparatus_expression = '340' then
    select id into strict fancoils from public.apparatus_registry where hotel_id = hotel and source_id = 340 and name = asset_name;
    if (link.source_apparatus_id, mark.source_apparatus_id, mark.apparatus_registry_id, plan.apparatus_registry_id, plan.code)
         is distinct from (340, 340, fancoils, fancoils, 'PAM-2026-R12-A340-F'::text) then
      raise exception 'Referencia 340 incoherente en la fila 12 del PAM';
    end if;
    return;
  end if;
  if (source_group.source_apparatus_expression, link.source_apparatus_id, mark.source_apparatus_id, mark.apparatus_registry_id, plan.apparatus_registry_id, plan.code)
       is distinct from ('7'::text, 7, 7, lift, lift, 'PAM-2026-R12-A7-F'::text)
     or (select max(source_id) from public.apparatus_registry where hotel_id = hotel) is distinct from 339
     or exists (select 1 from public.apparatus_registry where hotel_id = hotel and upper(name) = asset_name) then
    raise exception 'El inventario o la fila 12 han cambiado. Revisar antes de asignar el ID 340.';
  end if;
  insert into public.apparatus_registry (hotel_id, source_id, name)
    values (hotel, 340, asset_name) returning id into fancoils;
  update public.pam_source_groups set source_apparatus_expression = '340' where id = source_group.id;
  update public.pam_source_marks set source_apparatus_id = 340, apparatus_registry_id = fancoils where id = mark.id;
  update public.pam_maintenance_plan_links set source_apparatus_id = 340 where id = link.id;
  update public.maintenance_plans set code = 'PAM-2026-R12-A340-F', apparatus_registry_id = fancoils, updated_at = now() where id = plan.id;
end $$;
