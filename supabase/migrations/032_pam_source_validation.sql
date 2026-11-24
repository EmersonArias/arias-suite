-- Arias Suite — migración 032
-- Validación de importación PAM 2025.
--
-- Alcance:
--   - No crea maintenance_plans.
--   - No genera fechas.
--   - No genera OTs.
--   - No altera datos operativos.
--   - Facilita validar cobertura y referencias no resueltas antes de convertir
--     la fuente histórica en planificación viva.
--
-- Se ejecuta después de 031.

BEGIN;

CREATE OR REPLACE VIEW public.pam_source_unresolved AS
SELECT
  psm.hotel_id,
  psm.source_version,
  psm.source_sheet,
  psm.source_row,
  psg.maintenance_name,
  psm.source_apparatus_id,
  psm.plan_year,
  psm.month_number,
  psm.week_slot,
  psm.mark_code
FROM public.pam_source_marks psm
LEFT JOIN public.pam_source_groups psg
  ON psg.hotel_id = psm.hotel_id
 AND psg.source_version = psm.source_version
 AND psg.source_sheet = psm.source_sheet
 AND psg.source_row = psm.source_row
WHERE psm.apparatus_registry_id IS NULL;

CREATE OR REPLACE VIEW public.pam_source_validation_summary AS
SELECT
  psg.hotel_id,
  psg.source_version,
  psg.source_sheet,
  psg.source_row,
  psg.plan_year,
  psg.maintenance_name,
  psg.source_apparatus_expression,
  COUNT(DISTINCT psm.source_apparatus_id)::integer AS referenced_source_ids,
  COUNT(psm.id)::integer AS imported_marks,
  COUNT(DISTINCT psm.apparatus_registry_id)
    FILTER (WHERE psm.apparatus_registry_id IS NOT NULL)::integer AS resolved_equipment,
  COUNT(DISTINCT psm.source_apparatus_id)
    FILTER (WHERE psm.apparatus_registry_id IS NULL)::integer AS unresolved_source_ids,
  ARRAY_AGG(DISTINCT psm.source_apparatus_id ORDER BY psm.source_apparatus_id)
    FILTER (WHERE psm.apparatus_registry_id IS NULL) AS unresolved_ids
FROM public.pam_source_groups psg
LEFT JOIN public.pam_source_marks psm
  ON psm.hotel_id = psg.hotel_id
 AND psm.source_version = psg.source_version
 AND psm.source_sheet = psg.source_sheet
 AND psm.source_row = psg.source_row
GROUP BY
  psg.hotel_id,
  psg.source_version,
  psg.source_sheet,
  psg.source_row,
  psg.plan_year,
  psg.maintenance_name,
  psg.source_apparatus_expression;

CREATE OR REPLACE VIEW public.pam_source_review_queue AS
SELECT
  c.hotel_id,
  c.source_version,
  c.source_sheet,
  c.source_row,
  c.maintenance_name,
  c.source_apparatus_id,
  c.apparatus_registry_id,
  c.apparatus_code,
  c.apparatus_name,
  c.plan_year,
  c.mark_code,
  c.action_name,
  c.definition_status,
  c.mark_count,
  c.month_count,
  c.months,
  c.week_slots,
  c.derived_periodicity_unit,
  c.derived_periodicity_value,
  CASE
    WHEN c.apparatus_registry_id IS NULL THEN 'EQUIPO_NO_RESUELTO'
    WHEN c.definition_status <> 'CONFIRMED' THEN 'MARCA_EN_REVISION'
    WHEN c.derived_periodicity_unit = 'VARIABLE' THEN 'PERIODICIDAD_EN_REVISION'
    ELSE 'OK'
  END AS review_status
FROM public.pam_plan_candidates c
WHERE c.apparatus_registry_id IS NULL
   OR c.definition_status <> 'CONFIRMED'
   OR c.derived_periodicity_unit = 'VARIABLE';

COMMIT;
