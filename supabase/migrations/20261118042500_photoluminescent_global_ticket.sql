-- One annual hotel-wide ticket for R-SSTT-01-09, using inventory ID 339.
-- Ticket generation and availability continue to require the hotel exercise start.
do $$
declare
  hotel constant uuid := '9e2e3d56-25d7-41a5-8dd6-df6858e735bd';
  candidate record;
begin
  if not exists (
    select 1 from public.pam_source_groups
    where hotel_id = hotel and plan_year = 2026 and source_row = 14 and source_sheet = 'PAM'
  ) then
    return;
  end if;
  select p.id plan_id, a.id equipment_id into strict candidate
  from public.maintenance_plans p
  join public.apparatus_registry a on a.id = p.apparatus_registry_id and a.hotel_id = p.hotel_id
  join public.pam_maintenance_plan_links l on l.maintenance_plan_id = p.id and l.source_apparatus_id = a.source_id
  join public.pam_source_groups g on g.id = l.source_group_id and g.hotel_id = p.hotel_id
  where p.hotel_id = hotel and p.active and a.active and a.source_id = 339
    and a.name = 'ELEMENTOS FOTOLUMINISCENTES'
    and p.periodicity_value = 1 and p.periodicity_unit = 'YEAR'
    and l.mark_code = 'F' and l.plan_year = 2026
    and g.plan_year = 2026 and g.source_sheet = 'PAM' and g.source_row = 14
    and g.source_apparatus_expression = '339';
  if exists (
    select 1 from public.technical_book_plan_bindings
    where hotel_id = hotel and book_id = 'fotoluminiscentes'
      and (plan_id <> candidate.plan_id or equipment_id <> candidate.equipment_id)
  ) then
    raise exception 'El vínculo de fotoluminiscentes ha cambiado. Revisar antes de continuar.';
  end if;
  insert into public.technical_book_plan_bindings(hotel_id, book_id, plan_id, equipment_id)
  values(hotel, 'fotoluminiscentes', candidate.plan_id, candidate.equipment_id)
  on conflict(hotel_id, book_id, plan_id) do nothing;
end $$;
