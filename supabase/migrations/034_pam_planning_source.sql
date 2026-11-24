-- Arias Suite — migración 034
-- Fuente de planificación derivada del PAM materializado.
--
-- No crea fechas ficticias.
-- No duplica las marcas del PAM.
-- Expone directamente las posiciones mes/semana que alimentarán
-- la planificación y su calendario.

BEGIN;

CREATE OR REPLACE VIEW public.pam_maintenance_schedule
WITH (security_invoker = true)
AS
SELECT
  l.maintenance_plan_id,
  mp.hotel_id,
  mp.code AS maintenance_plan_code,
  mp.name AS maintenance_plan_name,
  mp.maintenance_type,
  mp.periodicity_value,
  mp.periodicity_unit,
  l.source_group_id,
  psg.source_version,
  psg.source_sheet,
  psg.source_row,
  psg.maintenance_name AS source_maintenance_name,
  l.source_apparatus_id,
  l.mark_code,
  pac.name AS action_name,
  pac.definition_status,
  psm.id AS source_mark_id,
  psm.source_column,
  psm.month_number,
  psm.week_slot,
  psm.plan_year,
  psm.apparatus_registry_id,
  ar.code AS apparatus_code,
  ar.name AS apparatus_name,
  ar.plant,
  ar.location
FROM public.pam_maintenance_plan_links l
JOIN public.maintenance_plans mp
  ON mp.id = l.maintenance_plan_id
JOIN public.pam_source_groups psg
  ON psg.id = l.source_group_id
JOIN public.pam_source_marks psm
  ON psm.hotel_id = psg.hotel_id
 AND psm.source_version = psg.source_version
 AND psm.source_sheet = psg.source_sheet
 AND psm.source_row = psg.source_row
 AND psm.source_apparatus_id = l.source_apparatus_id
 AND psm.mark_code = l.mark_code
 AND psm.plan_year = l.plan_year
LEFT JOIN public.pam_action_codes pac
  ON pac.code = psm.mark_code
LEFT JOIN public.apparatus_registry ar
  ON ar.id = psm.apparatus_registry_id
WHERE mp.active = true;

COMMENT ON VIEW public.pam_maintenance_schedule IS
'Fuente de planificación derivada del PAM. Conserva la posición original mes/semana y no inventa fechas.';

CREATE OR REPLACE VIEW public.pam_maintenance_monthly_summary
WITH (security_invoker = true)
AS
SELECT
  pms.maintenance_plan_id,
  pms.hotel_id,
  pms.maintenance_plan_code,
  pms.maintenance_plan_name,
  pms.plan_year,
  pms.month_number,
  COUNT(DISTINCT pms.source_mark_id)::integer AS scheduled_marks,
  COUNT(DISTINCT pms.source_apparatus_id)::integer AS equipment_count,
  ARRAY_AGG(DISTINCT pms.week_slot ORDER BY pms.week_slot) AS week_slots
FROM public.pam_maintenance_schedule pms
GROUP BY
  pms.maintenance_plan_id,
  pms.hotel_id,
  pms.maintenance_plan_code,
  pms.maintenance_plan_name,
  pms.plan_year,
  pms.month_number;

COMMENT ON VIEW public.pam_maintenance_monthly_summary IS
'Resumen mensual derivado de las marcas reales del PAM, sin almacenar agregados duplicados.';

CREATE OR REPLACE VIEW public.pam_maintenance_annual_summary
WITH (security_invoker = true)
AS
SELECT
  pms.maintenance_plan_id,
  pms.hotel_id,
  pms.maintenance_plan_code,
  pms.maintenance_plan_name,
  pms.plan_year,
  COUNT(DISTINCT pms.source_mark_id)::integer AS annual_scheduled_marks,
  COUNT(DISTINCT pms.month_number)::integer AS active_months,
  COUNT(DISTINCT pms.source_apparatus_id)::integer AS equipment_count,
  ARRAY_AGG(DISTINCT pms.month_number ORDER BY pms.month_number) AS months,
  ARRAY_AGG(DISTINCT pms.week_slot ORDER BY pms.week_slot) AS week_slots
FROM public.pam_maintenance_schedule pms
GROUP BY
  pms.maintenance_plan_id,
  pms.hotel_id,
  pms.maintenance_plan_code,
  pms.maintenance_plan_name,
  pms.plan_year;

COMMENT ON VIEW public.pam_maintenance_annual_summary IS
'Resumen anual derivado del PAM materializado.';

COMMIT;
