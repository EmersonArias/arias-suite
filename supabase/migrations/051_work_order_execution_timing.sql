-- =========================================================
-- 051 — TRAZABILIDAD DE EJECUCIÓN DE OT Y FUERA DE FECHA
-- =========================================================
-- Regla:
--   - La OT conserva su fecha prevista.
--   - Al ejecutarse se enlaza directamente con la ejecución real.
--   - Si la fecha real de ejecución es distinta de la prevista,
--     la OT queda guardada como OUT_OF_DATE.
--   - La expresión visible de UI será "Fuera de fecha".
--
-- "OUT_OF_RANGE" se reserva para resultados de controles técnicos
-- (por ejemplo temperatura/presión fuera de límites).
-- =========================================================

BEGIN;

-- =========================================================
-- VINCULO DIRECTO OT -> EJECUCIÓN
-- =========================================================

ALTER TABLE public.maintenance_executions
  ADD COLUMN IF NOT EXISTS work_order_id uuid
    REFERENCES public.maintenance_work_orders(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_maintenance_executions_work_order_id
  ON public.maintenance_executions (work_order_id);

-- =========================================================
-- RESULTADO TEMPORAL DE LA EJECUCIÓN DE LA OT
-- =========================================================

ALTER TABLE public.maintenance_work_orders
  ADD COLUMN IF NOT EXISTS completion_timing text;

ALTER TABLE public.maintenance_work_orders
  DROP CONSTRAINT IF EXISTS maintenance_work_orders_completion_timing_check;

ALTER TABLE public.maintenance_work_orders
  ADD CONSTRAINT maintenance_work_orders_completion_timing_check
  CHECK (
    completion_timing IS NULL
    OR completion_timing IN ('ON_TIME', 'OUT_OF_DATE')
  );

-- Backfill de OTs ya finalizadas cuando hay fecha suficiente.
UPDATE public.maintenance_work_orders
SET completion_timing = CASE
  WHEN scheduled_date IS NULL OR completed_at IS NULL THEN NULL
  WHEN completed_at::date = scheduled_date THEN 'ON_TIME'
  ELSE 'OUT_OF_DATE'
END
WHERE status = 'COMPLETED';

COMMENT ON COLUMN public.maintenance_work_orders.completion_timing IS
'Indica si la OT preventiva fue completada en su fecha prevista (ON_TIME) o fuera de fecha (OUT_OF_DATE).';

-- =========================================================
-- ENLAZAR AUTOMÁTICAMENTE UNA EJECUCIÓN CON SU OT
-- =========================================================
-- Se prioriza:
--   1) work_order_id explícito y compatible;
--   2) OT abierta con la misma fecha programada;
--   3) única OT abierta del mantenimiento.
--
-- La migración 050 garantiza una única OT abierta por mantenimiento.
-- =========================================================

CREATE OR REPLACE FUNCTION public.link_maintenance_execution_work_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  linked_plan_id uuid;
  candidate_work_order_id uuid;
BEGIN
  IF NEW.work_order_id IS NOT NULL THEN
    SELECT wo.maintenance_plan_id
      INTO linked_plan_id
    FROM public.maintenance_work_orders wo
    WHERE wo.id = NEW.work_order_id;

    IF linked_plan_id IS NULL THEN
      RAISE EXCEPTION 'La OT indicada no existe.';
    END IF;

    IF linked_plan_id <> NEW.maintenance_plan_id THEN
      RAISE EXCEPTION 'La OT indicada no pertenece al mantenimiento de esta ejecución.';
    END IF;

    RETURN NEW;
  END IF;

  SELECT wo.id
    INTO candidate_work_order_id
  FROM public.maintenance_work_orders wo
  WHERE wo.maintenance_plan_id = NEW.maintenance_plan_id
    AND wo.status IN ('PENDING', 'IN_PROGRESS')
  ORDER BY
    CASE
      WHEN NEW.scheduled_date IS NOT NULL
       AND wo.scheduled_date = NEW.scheduled_date
      THEN 0
      ELSE 1
    END,
    wo.scheduled_date ASC NULLS LAST,
    wo.created_at ASC
  LIMIT 1;

  NEW.work_order_id := candidate_work_order_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_maintenance_execution_work_order
ON public.maintenance_executions;

CREATE TRIGGER trg_link_maintenance_execution_work_order
BEFORE INSERT ON public.maintenance_executions
FOR EACH ROW
EXECUTE FUNCTION public.link_maintenance_execution_work_order();

REVOKE ALL ON FUNCTION public.link_maintenance_execution_work_order() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_maintenance_execution_work_order() TO authenticated;

-- =========================================================
-- AL COMPLETAR LA EJECUCIÓN, CERRAR LA OT Y GUARDAR SI FUE
-- FUERA DE FECHA
-- =========================================================

CREATE OR REPLACE FUNCTION public.complete_work_order_from_maintenance_execution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_scheduled_date date;
BEGIN
  IF NEW.executed_at IS NULL
     OR NEW.result = 'CANCELLED'
     OR NEW.work_order_id IS NULL
  THEN
    RETURN NEW;
  END IF;

  SELECT wo.scheduled_date
    INTO target_scheduled_date
  FROM public.maintenance_work_orders wo
  WHERE wo.id = NEW.work_order_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  UPDATE public.maintenance_work_orders
  SET
    status = 'COMPLETED',
    completed_at = NEW.executed_at,
    completed_by = NEW.executed_by,
    observations = COALESCE(NEW.observations, observations),
    completion_timing = CASE
      WHEN target_scheduled_date IS NULL THEN NULL
      WHEN NEW.executed_at::date = target_scheduled_date THEN 'ON_TIME'
      ELSE 'OUT_OF_DATE'
    END,
    updated_at = now()
  WHERE id = NEW.work_order_id
    AND status <> 'COMPLETED';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_complete_work_order_from_execution
ON public.maintenance_executions;

CREATE TRIGGER trg_complete_work_order_from_execution
AFTER INSERT OR UPDATE OF work_order_id, scheduled_date, executed_at, result, executed_by, observations
ON public.maintenance_executions
FOR EACH ROW
EXECUTE FUNCTION public.complete_work_order_from_maintenance_execution();

REVOKE ALL ON FUNCTION public.complete_work_order_from_maintenance_execution() FROM PUBLIC;

-- =========================================================
-- ENLAZAR HISTÓRICO EXISTENTE CUANDO LA FECHA IDENTIFICA
-- UNA ÚNICA OT
-- =========================================================

UPDATE public.maintenance_executions AS me
SET work_order_id = (
  SELECT wo.id
  FROM public.maintenance_work_orders AS wo
  WHERE wo.maintenance_plan_id = me.maintenance_plan_id
    AND wo.scheduled_date = me.scheduled_date
    AND wo.status = 'COMPLETED'
  ORDER BY wo.completed_at ASC NULLS LAST, wo.created_at ASC
  LIMIT 1
)
WHERE me.work_order_id IS NULL
  AND me.scheduled_date IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.maintenance_work_orders AS wo
    WHERE wo.maintenance_plan_id = me.maintenance_plan_id
      AND wo.scheduled_date = me.scheduled_date
      AND wo.status = 'COMPLETED'
  );

-- =========================================================
-- VISTA OPERATIVA DE OT
-- =========================================================
-- Las columnas nuevas se añaden al final para mantener compatibilidad
-- con la definición existente de la vista.
-- =========================================================

CREATE OR REPLACE VIEW public.maintenance_work_orders_resolved
WITH (security_invoker = true)
AS
SELECT
  wo.id,
  wo.hotel_id,
  wo.scheduled_job_id,
  wo.maintenance_plan_id,
  wo.title,
  wo.description,
  wo.work_type,
  wo.status,
  wo.assigned_user_id,
  p.full_name AS assigned_user_name,
  p.email AS assigned_user_email,
  wo.scheduled_date,
  wo.started_at,
  wo.completed_at,
  wo.completed_by,
  wo.observations,
  mp.code AS maintenance_plan_code,
  mp.name AS maintenance_plan_name,
  mp.maintenance_type,
  mp.apparatus_registry_id,
  ar.code AS apparatus_code,
  ar.name AS apparatus_name,
  ar.plant,
  ar.location,
  j.plan_year,
  j.month_number,
  j.week_slot,
  j.source_mark_id,
  wo.created_at,
  wo.updated_at,
  wo.ot_number,
  wo.generation_mode,
  wo.completion_timing
FROM public.maintenance_work_orders wo
JOIN public.maintenance_plans mp
  ON mp.id = wo.maintenance_plan_id
JOIN public.maintenance_scheduled_jobs j
  ON j.id = wo.scheduled_job_id
LEFT JOIN public.apparatus_registry ar
  ON ar.id = mp.apparatus_registry_id
LEFT JOIN public.profiles p
  ON p.id = wo.assigned_user_id;

COMMIT;
