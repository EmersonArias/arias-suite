-- Arias Suite — migración 021
-- Correcciones del núcleo de ejecuciones de mantenimiento.
--
-- Corrige:
-- 1) La próxima fecha se calcula desde la fecha real de ejecución.
-- 2) El recalculado del resultado funciona también al eliminar un resultado.

BEGIN;

CREATE OR REPLACE FUNCTION public.recalculate_maintenance_plan_due_date(
  target_plan_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  plan_record public.maintenance_plans%ROWTYPE;
  latest_execution_date date;
  calculated_due date;
BEGIN
  SELECT *
    INTO plan_record
  FROM public.maintenance_plans
  WHERE id = target_plan_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT MAX(
    COALESCE(me.executed_at::date, me.scheduled_date)
  )
  INTO latest_execution_date
  FROM public.maintenance_executions me
  WHERE me.maintenance_plan_id = target_plan_id
    AND me.executed_at IS NOT NULL
    AND me.result <> 'CANCELLED';

  IF latest_execution_date IS NULL THEN
    UPDATE public.maintenance_plans
    SET next_due_date = plan_record.start_date,
        updated_at = now()
    WHERE id = target_plan_id;
    RETURN;
  END IF;

  calculated_due := CASE
    WHEN plan_record.periodicity_unit = 'DAY' THEN
      latest_execution_date + plan_record.periodicity_value
    WHEN plan_record.periodicity_unit = 'WEEK' THEN
      latest_execution_date + (plan_record.periodicity_value * 7)
    WHEN plan_record.periodicity_unit = 'MONTH' THEN
      (
        latest_execution_date
        + make_interval(months => plan_record.periodicity_value)
      )::date
    WHEN plan_record.periodicity_unit = 'YEAR' THEN
      (
        latest_execution_date
        + make_interval(years => plan_record.periodicity_value)
      )::date
    ELSE NULL
  END;

  UPDATE public.maintenance_plans
  SET next_due_date = calculated_due,
      updated_at = now()
  WHERE id = target_plan_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_maintenance_plan_due_date(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.recalculate_maintenance_execution_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_execution_id uuid;
  target_plan_id uuid;
  required_count integer;
  completed_required_count integer;
  out_of_range_count integer;
BEGIN
  target_execution_id := COALESCE(NEW.execution_id, OLD.execution_id);

  SELECT maintenance_plan_id
    INTO target_plan_id
  FROM public.maintenance_executions
  WHERE id = target_execution_id;

  IF target_plan_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COUNT(*)
    INTO required_count
  FROM public.maintenance_controls mc
  WHERE mc.maintenance_plan_id = target_plan_id
    AND mc.active = true
    AND mc.required = true;

  SELECT COUNT(DISTINCT mcr.maintenance_control_id)
    INTO completed_required_count
  FROM public.maintenance_control_results mcr
  JOIN public.maintenance_controls mc
    ON mc.id = mcr.maintenance_control_id
  WHERE mcr.execution_id = target_execution_id
    AND mc.required = true
    AND mcr.status <> 'NOT_COMPLETED';

  SELECT COUNT(*)
    INTO out_of_range_count
  FROM public.maintenance_control_results
  WHERE execution_id = target_execution_id
    AND status = 'OUT_OF_RANGE';

  UPDATE public.maintenance_executions
  SET result = CASE
    WHEN out_of_range_count > 0 THEN 'COMPLETED_WITH_ISSUES'
    WHEN required_count = completed_required_count THEN 'COMPLETED'
    ELSE 'COMPLETED_WITH_ISSUES'
  END,
  updated_at = now()
  WHERE id = target_execution_id
    AND executed_at IS NOT NULL
    AND result <> 'CANCELLED';

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_maintenance_execution_result() FROM PUBLIC;

COMMIT;
