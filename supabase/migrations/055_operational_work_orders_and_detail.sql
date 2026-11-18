-- =========================================================
-- 055 — OT OPERATIVAS, FICHA DE OT Y OT CORRECTIVA RELACIONADA
-- =========================================================
-- Regla:
--   - Una OT preventiva sigue naciendo desde PAM.
--   - Una OT correctiva/actuación puede nacer de una necesidad operativa
--     y no necesita trabajo programado ni plan preventivo.
--   - Una OT correctiva creada desde otra OT conserva la trazabilidad
--     mediante parent_work_order_id.
--   - El equipo puede quedar informado directamente en la OT para que
--     una correctiva no dependa de un plan preventivo.
--
-- No modifica migraciones anteriores.

BEGIN;

-- =========================================================
-- EXTENDER OT OPERATIVA
-- =========================================================

ALTER TABLE public.maintenance_work_orders
  ALTER COLUMN scheduled_job_id DROP NOT NULL;

ALTER TABLE public.maintenance_work_orders
  ALTER COLUMN maintenance_plan_id DROP NOT NULL;

ALTER TABLE public.maintenance_work_orders
  ADD COLUMN IF NOT EXISTS apparatus_registry_id uuid
    REFERENCES public.apparatus_registry(id)
    ON DELETE RESTRICT;

ALTER TABLE public.maintenance_work_orders
  ADD COLUMN IF NOT EXISTS parent_work_order_id uuid
    REFERENCES public.maintenance_work_orders(id)
    ON DELETE SET NULL;

ALTER TABLE public.maintenance_work_orders
  ADD COLUMN IF NOT EXISTS priority text
    NOT NULL DEFAULT 'NORMAL';

ALTER TABLE public.maintenance_work_orders
  DROP CONSTRAINT IF EXISTS maintenance_work_orders_priority_check;

ALTER TABLE public.maintenance_work_orders
  ADD CONSTRAINT maintenance_work_orders_priority_check
  CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'CRITICAL'));

CREATE INDEX IF NOT EXISTS ix_maintenance_work_orders_apparatus
  ON public.maintenance_work_orders (apparatus_registry_id);

CREATE INDEX IF NOT EXISTS ix_maintenance_work_orders_parent
  ON public.maintenance_work_orders (parent_work_order_id);

CREATE INDEX IF NOT EXISTS ix_maintenance_work_orders_hotel_priority
  ON public.maintenance_work_orders (hotel_id, priority, status);

-- =========================================================
-- VISTA OPERATIVA: PREVENTIVAS + CORRECTIVAS + ACTUACIONES
-- =========================================================
-- La vista ya existía desde la migración 051.
-- PostgreSQL obliga a conservar el nombre y el orden de las columnas
-- existentes al usar CREATE OR REPLACE VIEW. Las nuevas columnas se
-- añaden únicamente al final.

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
  wo.completion_timing,
  wo.parent_work_order_id,
  wo.apparatus_registry_id AS work_order_apparatus_registry_id,
  wo.priority,
  COALESCE(wo.apparatus_registry_id, mp.apparatus_registry_id) AS resolved_apparatus_registry_id
FROM public.maintenance_work_orders wo
LEFT JOIN public.maintenance_plans mp
  ON mp.id = wo.maintenance_plan_id
LEFT JOIN public.maintenance_scheduled_jobs j
  ON j.id = wo.scheduled_job_id
LEFT JOIN public.apparatus_registry ar
  ON ar.id = mp.apparatus_registry_id
LEFT JOIN public.profiles p
  ON p.id = wo.assigned_user_id;

-- =========================================================
-- CREAR OT CORRECTIVA / ACTUACIÓN DESDE LA OPERACIÓN
-- =========================================================

CREATE OR REPLACE FUNCTION public.create_operational_work_order(
  target_hotel_id uuid,
  target_work_type text,
  target_title text,
  target_description text DEFAULT NULL,
  target_apparatus_registry_id uuid DEFAULT NULL,
  target_parent_work_order_id uuid DEFAULT NULL,
  target_priority text DEFAULT 'NORMAL',
  target_scheduled_date date DEFAULT NULL,
  target_observations text DEFAULT NULL
)
RETURNS public.maintenance_work_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  created_order public.maintenance_work_orders%ROWTYPE;
  target_number text;
  parent_order public.maintenance_work_orders%ROWTYPE;
BEGIN
  IF NOT public.has_hotel_permission(target_hotel_id, 'maintenance.create') THEN
    RAISE EXCEPTION 'No tienes permiso para crear OTs en este hotel.';
  END IF;

  IF target_work_type NOT IN ('CORRECTIVE', 'ACTUATION') THEN
    RAISE EXCEPTION 'El tipo de OT operativa no es válido.';
  END IF;

  IF target_title IS NULL OR length(btrim(target_title)) < 2 THEN
    RAISE EXCEPTION 'El título de la OT es obligatorio.';
  END IF;

  IF target_priority NOT IN ('LOW', 'NORMAL', 'HIGH', 'CRITICAL') THEN
    RAISE EXCEPTION 'La prioridad indicada no es válida.';
  END IF;

  IF target_apparatus_registry_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.apparatus_registry ar
      WHERE ar.id = target_apparatus_registry_id
        AND ar.hotel_id = target_hotel_id
    ) THEN
      RAISE EXCEPTION 'El equipo indicado no pertenece al hotel.';
    END IF;
  END IF;

  IF target_parent_work_order_id IS NOT NULL THEN
    SELECT *
      INTO parent_order
    FROM public.maintenance_work_orders wo
    WHERE wo.id = target_parent_work_order_id
      AND wo.hotel_id = target_hotel_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'La OT de origen no pertenece al hotel.';
    END IF;
  END IF;

  target_number := public.next_maintenance_ot_number(
    target_hotel_id,
    CURRENT_DATE
  );

  INSERT INTO public.maintenance_work_orders (
    hotel_id,
    scheduled_job_id,
    maintenance_plan_id,
    apparatus_registry_id,
    parent_work_order_id,
    ot_number,
    title,
    description,
    work_type,
    status,
    scheduled_date,
    priority,
    observations,
    generation_mode,
    created_by
  )
  VALUES (
    target_hotel_id,
    NULL,
    NULL,
    target_apparatus_registry_id,
    target_parent_work_order_id,
    target_number,
    target_number || ' — ' || btrim(target_title),
    NULLIF(btrim(target_description), ''),
    target_work_type,
    'PENDING',
    target_scheduled_date,
    target_priority,
    NULLIF(btrim(target_observations), ''),
    'MANUAL',
    auth.uid()
  )
  RETURNING * INTO created_order;

  RETURN created_order;
END;
$$;

REVOKE ALL ON FUNCTION public.create_operational_work_order(
  uuid,
  text,
  text,
  text,
  uuid,
  uuid,
  text,
  date,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_operational_work_order(
  uuid,
  text,
  text,
  text,
  uuid,
  uuid,
  text,
  date,
  text
) TO authenticated;

-- =========================================================
-- INICIAR OT
-- =========================================================

CREATE OR REPLACE FUNCTION public.start_maintenance_work_order(
  target_work_order_id uuid
)
RETURNS public.maintenance_work_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_order public.maintenance_work_orders%ROWTYPE;
BEGIN
  SELECT *
    INTO target_order
  FROM public.maintenance_work_orders
  WHERE id = target_work_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La OT no existe.';
  END IF;

  IF NOT public.has_hotel_permission(target_order.hotel_id, 'maintenance.update') THEN
    RAISE EXCEPTION 'No tienes permiso para modificar esta OT.';
  END IF;

  IF target_order.status = 'COMPLETED' THEN
    RAISE EXCEPTION 'La OT ya está finalizada.';
  END IF;

  UPDATE public.maintenance_work_orders
  SET
    status = 'IN_PROGRESS',
    started_at = COALESCE(started_at, now()),
    updated_at = now()
  WHERE id = target_work_order_id
  RETURNING * INTO target_order;

  RETURN target_order;
END;
$$;

REVOKE ALL ON FUNCTION public.start_maintenance_work_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_maintenance_work_order(uuid) TO authenticated;

-- =========================================================
-- FINALIZAR OT
-- =========================================================
-- Preventiva:
--   Se crea la ejecución real y los triggers existentes hacen el resto:
--   cerrar OT, guardar ON_TIME/OUT_OF_DATE, recalcular próxima revisión
--   y generar la siguiente OT automáticamente.
--
-- Correctiva / Actuación:
--   Se cierra directamente como OT operativa.
-- =========================================================

CREATE OR REPLACE FUNCTION public.complete_maintenance_work_order(
  target_work_order_id uuid,
  target_result text DEFAULT 'COMPLETED',
  target_observations text DEFAULT NULL
)
RETURNS public.maintenance_work_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_order public.maintenance_work_orders%ROWTYPE;
  execution_record public.maintenance_executions%ROWTYPE;
BEGIN
  SELECT *
    INTO target_order
  FROM public.maintenance_work_orders
  WHERE id = target_work_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La OT no existe.';
  END IF;

  IF NOT public.has_hotel_permission(target_order.hotel_id, 'maintenance.update') THEN
    RAISE EXCEPTION 'No tienes permiso para finalizar esta OT.';
  END IF;

  IF target_order.status = 'COMPLETED' THEN
    RETURN target_order;
  END IF;

  IF target_result NOT IN ('COMPLETED', 'COMPLETED_WITH_ISSUES', 'NOT_CONFORM', 'CANCELLED') THEN
    RAISE EXCEPTION 'El resultado de la OT no es válido.';
  END IF;

  IF target_order.work_type = 'PREVENTIVE' THEN
    IF target_order.maintenance_plan_id IS NULL THEN
      RAISE EXCEPTION 'La OT preventiva no está vinculada a un mantenimiento PAM.';
    END IF;

    INSERT INTO public.maintenance_executions (
      maintenance_plan_id,
      work_order_id,
      scheduled_date,
      executed_at,
      executed_by,
      performer_name,
      performer_company,
      result,
      observations
    )
    SELECT
      target_order.maintenance_plan_id,
      target_order.id,
      target_order.scheduled_date,
      now(),
      auth.uid(),
      p.full_name,
      NULL,
      target_result,
      NULLIF(btrim(COALESCE(target_observations, target_order.observations)), '')
    FROM public.profiles p
    WHERE p.id = auth.uid();

    IF NOT FOUND THEN
      INSERT INTO public.maintenance_executions (
        maintenance_plan_id,
        work_order_id,
        scheduled_date,
        executed_at,
        executed_by,
        result,
        observations
      )
      VALUES (
        target_order.maintenance_plan_id,
        target_order.id,
        target_order.scheduled_date,
        now(),
        auth.uid(),
        target_result,
        NULLIF(btrim(COALESCE(target_observations, target_order.observations)), '')
      );
    END IF;

    SELECT *
      INTO target_order
    FROM public.maintenance_work_orders
    WHERE id = target_work_order_id;

    RETURN target_order;
  END IF;

  UPDATE public.maintenance_work_orders
  SET
    status = CASE WHEN target_result = 'CANCELLED' THEN 'PENDING' ELSE 'COMPLETED' END,
    completed_at = CASE WHEN target_result = 'CANCELLED' THEN NULL ELSE now() END,
    completed_by = CASE WHEN target_result = 'CANCELLED' THEN NULL ELSE auth.uid() END,
    observations = NULLIF(btrim(COALESCE(target_observations, observations)), ''),
    updated_at = now()
  WHERE id = target_work_order_id
  RETURNING * INTO target_order;

  RETURN target_order;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_maintenance_work_order(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_maintenance_work_order(uuid, text, text) TO authenticated;

COMMENT ON COLUMN public.maintenance_work_orders.parent_work_order_id IS
'OT de origen que detectó o generó esta OT operativa.';

COMMENT ON COLUMN public.maintenance_work_orders.apparatus_registry_id IS
'Equipo asociado directamente a una OT operativa, aunque no proceda de un PAM.';

COMMENT ON COLUMN public.maintenance_work_orders.priority IS
'Prioridad operativa de la OT: LOW, NORMAL, HIGH o CRITICAL.';

COMMIT;
