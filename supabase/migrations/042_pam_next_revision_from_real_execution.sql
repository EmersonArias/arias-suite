-- Arias Suite — migración 042
-- Próxima revisión derivada exclusivamente de revisiones reales.
--
-- Regla operativa:
--   - Sin una revisión válida ejecutada: no existe próxima revisión.
--   - CANCELLED / No realizada no mueve el ciclo.
--   - La próxima revisión se calcula desde la última revisión válida
--     y la periodicidad configurada en el plan.
--
-- Además, cualquier cambio de periodicidad o fecha de inicio
-- recalcula la próxima revisión a partir del histórico real.
--
-- No modifica migraciones anteriores.

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

  SELECT MAX(me.executed_at::date)
  INTO latest_execution_date
  FROM public.maintenance_executions me
  WHERE me.maintenance_plan_id = target_plan_id
    AND me.executed_at IS NOT NULL
    AND me.result <> 'CANCELLED';

  IF latest_execution_date IS NULL THEN
    UPDATE public.maintenance_plans
    SET next_due_date = NULL,
        updated_at = now()
    WHERE id = target_plan_id;
    RETURN;
  END IF;

  calculated_due := CASE
    WHEN plan_record.periodicity_unit = 'DAY'
      AND plan_record.periodicity_value IS NOT NULL
      THEN latest_execution_date + plan_record.periodicity_value
    WHEN plan_record.periodicity_unit = 'WEEK'
      AND plan_record.periodicity_value IS NOT NULL
      THEN latest_execution_date + (plan_record.periodicity_value * 7)
    WHEN plan_record.periodicity_unit = 'MONTH'
      AND plan_record.periodicity_value IS NOT NULL
      THEN (
        latest_execution_date
        + make_interval(months => plan_record.periodicity_value)
      )::date
    WHEN plan_record.periodicity_unit = 'YEAR'
      AND plan_record.periodicity_value IS NOT NULL
      THEN (
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

CREATE OR REPLACE FUNCTION public.trg_recalculate_maintenance_plan_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.recalculate_maintenance_plan_due_date(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_recalculate_maintenance_plan_on_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_recalculate_maintenance_plan_on_change
ON public.maintenance_plans;

CREATE TRIGGER trg_recalculate_maintenance_plan_on_change
AFTER INSERT OR UPDATE OF periodicity_value, periodicity_unit, start_date, active
ON public.maintenance_plans
FOR EACH ROW
EXECUTE FUNCTION public.trg_recalculate_maintenance_plan_on_change();

-- Limpia los next_due_date que todavía provengan del comportamiento anterior
-- cuando el plan nunca ha tenido una revisión válida.
DO $$
DECLARE
  plan_id uuid;
BEGIN
  FOR plan_id IN
    SELECT mp.id
    FROM public.maintenance_plans mp
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.maintenance_executions me
      WHERE me.maintenance_plan_id = mp.id
        AND me.executed_at IS NOT NULL
        AND me.result <> 'CANCELLED'
    )
  LOOP
    PERFORM public.recalculate_maintenance_plan_due_date(plan_id);
  END LOOP;
END;
$$;

COMMIT;
