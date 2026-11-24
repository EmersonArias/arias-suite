-- Arias Suite — migración 037
-- Fechas de calendario derivadas del PAM.
--
-- Convención V1:
--   semana 1 = días 1..7
--   semana 2 = días 8..14
--   semana 3 = días 15..21
--   semana 4 = días 22..28
--   semana 5 = días 29..fin de mes
--
-- La fuente PAM conserva month_number/week_slot.
-- Esta capa únicamente proyecta esa posición sobre fechas reales.

BEGIN;

CREATE OR REPLACE FUNCTION public.pam_week_slot_start_date(
  target_year integer,
  target_month integer,
  target_week_slot integer
)
RETURNS date
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $fn$
  SELECT CASE target_week_slot
    WHEN 1 THEN make_date(target_year, target_month, 1)
    WHEN 2 THEN make_date(target_year, target_month, 8)
    WHEN 3 THEN make_date(target_year, target_month, 15)
    WHEN 4 THEN make_date(target_year, target_month, 22)
    WHEN 5 THEN make_date(target_year, target_month, 29)
    ELSE NULL
  END;
$fn$;

CREATE OR REPLACE FUNCTION public.pam_week_slot_end_date(
  target_year integer,
  target_month integer,
  target_week_slot integer
)
RETURNS date
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $fn$
  SELECT CASE target_week_slot
    WHEN 1 THEN LEAST(
      make_date(target_year, target_month, 7),
      (make_date(target_year, target_month, 1) + interval '1 month - 1 day')::date
    )
    WHEN 2 THEN LEAST(
      make_date(target_year, target_month, 14),
      (make_date(target_year, target_month, 1) + interval '1 month - 1 day')::date
    )
    WHEN 3 THEN LEAST(
      make_date(target_year, target_month, 21),
      (make_date(target_year, target_month, 1) + interval '1 month - 1 day')::date
    )
    WHEN 4 THEN LEAST(
      make_date(target_year, target_month, 28),
      (make_date(target_year, target_month, 1) + interval '1 month - 1 day')::date
    )
    WHEN 5 THEN LEAST(
      make_date(target_year, target_month, 29),
      (make_date(target_year, target_month, 1) + interval '1 month - 1 day')::date
    )
    ELSE NULL
  END;
$fn$;

CREATE OR REPLACE VIEW public.maintenance_scheduled_jobs_calendar
WITH (security_invoker = true)
AS
SELECT
  j.id,
  j.hotel_id,
  j.maintenance_plan_id,
  j.source_mark_id,
  j.plan_year,
  j.month_number,
  j.week_slot,
  public.pam_week_slot_start_date(
    j.plan_year,
    j.month_number,
    j.week_slot
  ) AS period_start_date,
  public.pam_week_slot_end_date(
    j.plan_year,
    j.month_number,
    j.week_slot
  ) AS period_end_date,
  j.scheduled_date,
  COALESCE(
    j.scheduled_date,
    public.pam_week_slot_start_date(
      j.plan_year,
      j.month_number,
      j.week_slot
    )
  ) AS calendar_anchor_date,
  j.status,
  j.started_at,
  j.completed_at,
  j.completed_by,
  j.observations,
  mp.code AS maintenance_plan_code,
  mp.name AS maintenance_plan_name,
  mp.maintenance_type,
  mp.apparatus_registry_id,
  ar.code AS apparatus_code,
  ar.name AS apparatus_name,
  ar.plant,
  ar.location,
  j.created_at,
  j.updated_at
FROM public.maintenance_scheduled_jobs j
JOIN public.maintenance_plans mp
  ON mp.id = j.maintenance_plan_id
LEFT JOIN public.apparatus_registry ar
  ON ar.id = mp.apparatus_registry_id
WHERE mp.active = true;

COMMENT ON VIEW public.maintenance_scheduled_jobs_calendar IS
'Proyección calendario V1 de trabajos PAM. Mantiene la semana de origen y calcula el intervalo real de días del mes.';

REVOKE ALL ON FUNCTION public.pam_week_slot_start_date(integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pam_week_slot_start_date(integer, integer, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.pam_week_slot_end_date(integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pam_week_slot_end_date(integer, integer, integer) TO authenticated;

COMMIT;
