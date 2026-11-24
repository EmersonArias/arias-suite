-- Arias Suite — migración 020
-- Automatiza estados derivados de ejecuciones y controles de mantenimiento.
--
-- No modifica ni reejecuta migraciones anteriores.

BEGIN;

-- =========================================================
-- SIGUIENTE FECHA: SE RECALCULA A PARTIR DE LA ÚLTIMA EJECUCIÓN REAL
-- =========================================================

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
  SELECT * INTO plan_record
  FROM public.maintenance_plans
  WHERE id = target_plan_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(
    MAX(COALESCE(me.scheduled_date, me.executed_at::date))
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
    WHEN plan_record.periodicity_unit = 'DAY' THEN latest_execution_date + plan_record.periodicity_value
    WHEN plan_record.periodicity_unit = 'WEEK' THEN latest_execution_date + (plan_record.periodicity_value * 7)
    WHEN plan_record.periodicity_unit = 'MONTH' THEN (latest_execution_date + make_interval(months => plan_record.periodicity_value))::date
    WHEN plan_record.periodicity_unit = 'YEAR' THEN (latest_execution_date + make_interval(years => plan_record.periodicity_value))::date
    ELSE NULL
  END;

  UPDATE public.maintenance_plans
  SET next_due_date = calculated_due,
      updated_at = now()
  WHERE id = target_plan_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_maintenance_plan_due_date(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.trg_recalculate_maintenance_plan_due_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.recalculate_maintenance_plan_due_date(
    COALESCE(NEW.maintenance_plan_id, OLD.maintenance_plan_id)
  );
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_maintenance_execution_recalculate_due
ON public.maintenance_executions;

CREATE TRIGGER trg_maintenance_execution_recalculate_due
AFTER INSERT OR UPDATE OR DELETE
ON public.maintenance_executions
FOR EACH ROW
EXECUTE FUNCTION public.trg_recalculate_maintenance_plan_due_date();

REVOKE ALL ON FUNCTION public.trg_recalculate_maintenance_plan_due_date() FROM PUBLIC;

-- =========================================================
-- RESULTADO AUTOMÁTICO DE CONTROLES NUMÉRICOS
-- =========================================================

CREATE OR REPLACE FUNCTION public.evaluate_maintenance_control_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  control_record public.maintenance_controls%ROWTYPE;
BEGIN
  SELECT * INTO control_record
  FROM public.maintenance_controls
  WHERE id = NEW.maintenance_control_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El control de mantenimiento no existe.';
  END IF;

  IF control_record.input_type = 'NUMBER' THEN
    IF NEW.numeric_value IS NULL THEN
      NEW.status := CASE WHEN control_record.required THEN 'NOT_COMPLETED' ELSE 'COMPLIANT' END;
    ELSIF (control_record.min_value IS NOT NULL AND NEW.numeric_value < control_record.min_value)
       OR (control_record.max_value IS NOT NULL AND NEW.numeric_value > control_record.max_value) THEN
      NEW.status := CASE
        WHEN control_record.alert_on_out_of_range THEN 'OUT_OF_RANGE'
        ELSE 'COMPLIANT'
      END;
    ELSE
      NEW.status := 'COMPLIANT';
    END IF;
  ELSIF num_nonnulls(
    NEW.numeric_value, NEW.text_value, NEW.boolean_value, NEW.date_value, NEW.time_value, NEW.selected_value
  ) = 0 THEN
    NEW.status := CASE WHEN control_record.required THEN 'NOT_COMPLETED' ELSE 'COMPLIANT' END;
  ELSE
    NEW.status := 'COMPLIANT';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_evaluate_maintenance_control_result
ON public.maintenance_control_results;

CREATE TRIGGER trg_evaluate_maintenance_control_result
BEFORE INSERT OR UPDATE
ON public.maintenance_control_results
FOR EACH ROW
EXECUTE FUNCTION public.evaluate_maintenance_control_result();

REVOKE ALL ON FUNCTION public.evaluate_maintenance_control_result() FROM PUBLIC;

-- =========================================================
-- ALERTA AUTOMÁTICA POR CADA CONTROL FUERA DE RANGO
-- =========================================================

CREATE UNIQUE INDEX IF NOT EXISTS ux_maintenance_alert_out_of_range_control
  ON public.maintenance_alerts (maintenance_execution_id, maintenance_control_id, alert_type)
  WHERE maintenance_execution_id IS NOT NULL
    AND maintenance_control_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_maintenance_control_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  execution_plan_id uuid;
  target_hotel_id uuid;
  control_label text;
  equipment_name text;
  value_text text;
  range_text text;
BEGIN
  SELECT
    me.maintenance_plan_id,
    mp.hotel_id,
    mc.label,
    COALESCE(ar.name, mp.name),
    CASE WHEN NEW.numeric_value IS NOT NULL THEN NEW.numeric_value::text ELSE COALESCE(NEW.text_value, NEW.selected_value, '—') END,
    CASE
      WHEN mc.min_value IS NOT NULL AND mc.max_value IS NOT NULL THEN mc.min_value::text || ' – ' || mc.max_value::text
      WHEN mc.min_value IS NOT NULL THEN '≥ ' || mc.min_value::text
      WHEN mc.max_value IS NOT NULL THEN '≤ ' || mc.max_value::text
      ELSE 'Sin rango definido'
    END
  INTO execution_plan_id, target_hotel_id, control_label, equipment_name, value_text, range_text
  FROM public.maintenance_executions me
  JOIN public.maintenance_plans mp ON mp.id = me.maintenance_plan_id
  JOIN public.maintenance_controls mc ON mc.id = NEW.maintenance_control_id
  LEFT JOIN public.apparatus_registry ar ON ar.id = mp.apparatus_registry_id
  WHERE me.id = NEW.execution_id;

  IF NEW.status = 'OUT_OF_RANGE' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.maintenance_alerts ma
      WHERE ma.maintenance_execution_id = NEW.execution_id
        AND ma.maintenance_control_id = NEW.maintenance_control_id
        AND ma.alert_type = 'OUT_OF_RANGE'
    ) THEN
      INSERT INTO public.maintenance_alerts (
        hotel_id, maintenance_plan_id, maintenance_execution_id, maintenance_control_id,
        alert_type, severity, title, message, due_date
      )
      VALUES (
        target_hotel_id, execution_plan_id, NEW.execution_id, NEW.maintenance_control_id,
        'OUT_OF_RANGE', 'WARNING',
        equipment_name || ' — ' || control_label || ' fuera de rango',
        'Valor registrado: ' || value_text || '. Rango configurado: ' || range_text || '.',
        NULL
      );
    END IF;
  ELSE
    UPDATE public.maintenance_alerts
    SET resolved_at = COALESCE(resolved_at, now())
    WHERE maintenance_execution_id = NEW.execution_id
      AND maintenance_control_id = NEW.maintenance_control_id
      AND alert_type = 'OUT_OF_RANGE'
      AND resolved_at IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_maintenance_control_alert
ON public.maintenance_control_results;

CREATE TRIGGER trg_maintenance_control_alert
AFTER INSERT OR UPDATE
ON public.maintenance_control_results
FOR EACH ROW
EXECUTE FUNCTION public.handle_maintenance_control_alert();

REVOKE ALL ON FUNCTION public.handle_maintenance_control_alert() FROM PUBLIC;

-- =========================================================
-- RESULTADO GLOBAL DE LA EJECUCIÓN
-- =========================================================

CREATE OR REPLACE FUNCTION public.recalculate_maintenance_execution_result()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_execution_id uuid;
  required_count integer;
  completed_required_count integer;
  out_of_range_count integer;
BEGIN
  target_execution_id := COALESCE(NEW.execution_id, OLD.execution_id);

  SELECT COUNT(*)
  INTO required_count
  FROM public.maintenance_controls mc
  WHERE mc.maintenance_plan_id = (SELECT maintenance_plan_id FROM public.maintenance_executions WHERE id = NEW.execution_id)
    AND mc.active = true
    AND mc.required = true;

  SELECT COUNT(DISTINCT mcr.maintenance_control_id)
  INTO completed_required_count
  FROM public.maintenance_control_results mcr
  JOIN public.maintenance_controls mc ON mc.id = mcr.maintenance_control_id
  WHERE mcr.execution_id = target_execution_id
    AND mc.required = true
    AND mcr.status <> 'NOT_COMPLETED';

  SELECT COUNT(*) INTO out_of_range_count
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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_maintenance_execution_result
ON public.maintenance_control_results;

CREATE TRIGGER trg_maintenance_execution_result
AFTER INSERT OR UPDATE OR DELETE
ON public.maintenance_control_results
FOR EACH ROW
EXECUTE FUNCTION public.recalculate_maintenance_execution_result();

REVOKE ALL ON FUNCTION public.recalculate_maintenance_execution_result() FROM PUBLIC;

-- Recalcula el estado de los planes actuales una vez instaladas las funciones.
DO $$
DECLARE
  plan_id uuid;
BEGIN
  FOR plan_id IN SELECT id FROM public.maintenance_plans LOOP
    PERFORM public.recalculate_maintenance_plan_due_date(plan_id);
  END LOOP;
END;
$$;

COMMIT;