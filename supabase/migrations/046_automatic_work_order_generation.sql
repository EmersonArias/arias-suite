-- Arias Suite — migración 046
-- Motor de generación automática de OT preventivas y numeración.
--
-- Flujo:
--   PAM / mantenimiento -> trabajo programado -> OT
--
-- La generación es idempotente: una misma combinación mantenimiento + fecha
-- prevista no puede crear más de una OT.
--
-- No modifica migraciones anteriores.

BEGIN;

-- =========================================================
-- NUMERACIÓN DE OT
-- =========================================================

CREATE TABLE IF NOT EXISTS public.maintenance_ot_daily_counters (
  hotel_id uuid NOT NULL
    REFERENCES public.hotels(id) ON DELETE RESTRICT,
  ot_date date NOT NULL,
  last_number integer NOT NULL DEFAULT 0
    CHECK (last_number >= 0),
  PRIMARY KEY (hotel_id, ot_date)
);

CREATE OR REPLACE FUNCTION public.next_maintenance_ot_number(
  target_hotel_id uuid,
  target_date date DEFAULT CURRENT_DATE
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  next_number integer;
BEGIN
  INSERT INTO public.maintenance_ot_daily_counters (
    hotel_id,
    ot_date,
    last_number
  )
  VALUES (
    target_hotel_id,
    target_date,
    1
  )
  ON CONFLICT (hotel_id, ot_date)
  DO UPDATE SET
    last_number = public.maintenance_ot_daily_counters.last_number + 1
  RETURNING last_number INTO next_number;

  RETURN 'OT-' ||
    to_char(target_date, 'YYYYMMDD') ||
    '-' ||
    lpad(next_number::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_maintenance_ot_number(uuid, date) FROM PUBLIC;

-- =========================================================
-- AMPLIACIÓN DEL MODELO DE TRABAJOS PROGRAMADOS
-- =========================================================

ALTER TABLE public.maintenance_scheduled_jobs
  ALTER COLUMN source_mark_id DROP NOT NULL;

ALTER TABLE public.maintenance_scheduled_jobs
  DROP CONSTRAINT IF EXISTS maintenance_scheduled_jobs_unique_source;

CREATE UNIQUE INDEX IF NOT EXISTS ux_maintenance_scheduled_jobs_plan_date
  ON public.maintenance_scheduled_jobs (maintenance_plan_id, scheduled_date)
  WHERE scheduled_date IS NOT NULL;

-- =========================================================
-- AMPLIACIÓN DE OT
-- =========================================================

ALTER TABLE public.maintenance_work_orders
  ADD COLUMN IF NOT EXISTS ot_number text;

ALTER TABLE public.maintenance_work_orders
  ADD COLUMN IF NOT EXISTS created_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.maintenance_work_orders
  ADD COLUMN IF NOT EXISTS generation_mode text
    NOT NULL DEFAULT 'MANUAL'
    CHECK (generation_mode IN ('AUTO', 'MANUAL'));

UPDATE public.maintenance_work_orders
SET generation_mode = 'MANUAL'
WHERE generation_mode IS NULL;

-- Numeramos las OTs existentes sin inventar secuencias fuera de su hotel y fecha.
DO $$
DECLARE
  row_record RECORD;
  generated_number text;
  target_date date;
BEGIN
  FOR row_record IN
    SELECT
      wo.id,
      wo.hotel_id,
      COALESCE(wo.scheduled_date, wo.created_at::date) AS effective_date
    FROM public.maintenance_work_orders wo
    WHERE wo.ot_number IS NULL
    ORDER BY wo.created_at, wo.id
  LOOP
    target_date := COALESCE(row_record.effective_date, CURRENT_DATE);
    generated_number := public.next_maintenance_ot_number(
      row_record.hotel_id,
      target_date
    );

    UPDATE public.maintenance_work_orders
    SET ot_number = generated_number
    WHERE id = row_record.id;
  END LOOP;
END;
$$;

ALTER TABLE public.maintenance_work_orders
  ALTER COLUMN ot_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_maintenance_work_orders_hotel_ot_number
  ON public.maintenance_work_orders (hotel_id, ot_number);

CREATE UNIQUE INDEX IF NOT EXISTS ux_maintenance_work_orders_plan_date
  ON public.maintenance_work_orders (maintenance_plan_id, scheduled_date)
  WHERE scheduled_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_maintenance_work_orders_hotel_ot_number
  ON public.maintenance_work_orders (hotel_id, ot_number);

-- =========================================================
-- MOTOR DE GENERACIÓN AUTOMÁTICA
-- =========================================================

CREATE OR REPLACE FUNCTION public.generate_maintenance_work_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  hotel_record public.hotels%ROWTYPE;
  plan_record public.maintenance_plans%ROWTYPE;
  source_mark_record public.pam_source_marks%ROWTYPE;
  scheduled_job_id uuid;
  work_order_number text;
  generated_title text;
  lead_days integer;
  inserted_count integer := 0;
BEGIN
  FOR hotel_record IN
    SELECT h.*
    FROM public.hotels h
    JOIN public.maintenance_hotel_config c
      ON c.hotel_id = h.id
    WHERE h.active = true
      AND c.ot_generation_mode = 'AUTO'
  LOOP
    SELECT COALESCE(c.ot_generation_lead_days, 0)
      INTO lead_days
    FROM public.maintenance_hotel_config c
    WHERE c.hotel_id = hotel_record.id;

    FOR plan_record IN
      SELECT mp.*
      FROM public.maintenance_plans mp
      WHERE mp.hotel_id = hotel_record.id
        AND mp.active = true
        AND mp.next_due_date IS NOT NULL
        AND mp.next_due_date <= CURRENT_DATE + lead_days
        AND NOT EXISTS (
          SELECT 1
          FROM public.maintenance_work_orders wo
          WHERE wo.maintenance_plan_id = mp.id
            AND wo.scheduled_date = mp.next_due_date
        )
    LOOP
      -- Preferimos conservar la trazabilidad con una marca PAM existente.
      SELECT psm.*
        INTO source_mark_record
      FROM public.pam_maintenance_plan_links l
      JOIN public.pam_source_marks psm
        ON psm.id = (
          SELECT psm2.id
          FROM public.pam_source_marks psm2
          WHERE psm2.hotel_id = hotel_record.id
            AND psm2.plan_year = l.plan_year
            AND psm2.source_apparatus_id = l.source_apparatus_id
            AND psm2.mark_code = l.mark_code
          ORDER BY psm2.month_number, psm2.week_slot, psm2.id
          LIMIT 1
        )
      WHERE l.maintenance_plan_id = plan_record.id
      ORDER BY psm.month_number, psm.week_slot, psm.id
      LIMIT 1;

      SELECT j.id
        INTO scheduled_job_id
      FROM public.maintenance_scheduled_jobs j
      WHERE j.maintenance_plan_id = plan_record.id
        AND j.scheduled_date = plan_record.next_due_date
      LIMIT 1;

      IF scheduled_job_id IS NULL THEN
        INSERT INTO public.maintenance_scheduled_jobs (
          hotel_id,
          maintenance_plan_id,
          source_mark_id,
          plan_year,
          month_number,
          week_slot,
          scheduled_date,
          status
        )
        VALUES (
          hotel_record.id,
          plan_record.id,
          source_mark_record.id,
          COALESCE(EXTRACT(YEAR FROM plan_record.next_due_date)::integer, EXTRACT(YEAR FROM CURRENT_DATE)::integer),
          EXTRACT(MONTH FROM plan_record.next_due_date)::integer,
          1,
          plan_record.next_due_date,
          'PENDING'
        )
        ON CONFLICT (maintenance_plan_id, scheduled_date)
        DO UPDATE SET
          scheduled_date = EXCLUDED.scheduled_date
        RETURNING id INTO scheduled_job_id;
      END IF;

      work_order_number := public.next_maintenance_ot_number(
        hotel_record.id,
        CURRENT_DATE
      );

      generated_title := work_order_number || ' — ' || plan_record.name;

      INSERT INTO public.maintenance_work_orders (
        hotel_id,
        scheduled_job_id,
        maintenance_plan_id,
        ot_number,
        title,
        description,
        work_type,
        status,
        scheduled_date,
        generation_mode,
        created_by
      )
      VALUES (
        hotel_record.id,
        scheduled_job_id,
        plan_record.id,
        work_order_number,
        generated_title,
        plan_record.description,
        CASE
          WHEN plan_record.maintenance_type = 'EXTERNAL' THEN 'PREVENTIVE'
          ELSE 'PREVENTIVE'
        END,
        'PENDING',
        plan_record.next_due_date,
        'AUTO',
        NULL
      )
      ON CONFLICT (maintenance_plan_id, scheduled_date)
      DO NOTHING;

      IF FOUND THEN
        inserted_count := inserted_count + 1;
      ELSE
        -- Si una carrera concurrente generó la OT, no dejamos un número
        -- reservado reutilizable para otra OT: la trazabilidad de numeración
        -- sigue siendo monotónica por hotel y fecha.
        NULL;
      END IF;
    END LOOP;
  END LOOP;

  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_maintenance_work_orders() FROM PUBLIC;

-- =========================================================
-- VINCULAR EJECUCIÓN REAL CON SU OT
-- =========================================================

CREATE OR REPLACE FUNCTION public.complete_work_order_from_maintenance_execution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.executed_at IS NOT NULL
     AND NEW.result <> 'CANCELLED'
  THEN
    UPDATE public.maintenance_work_orders
    SET
      status = 'COMPLETED',
      completed_at = NEW.executed_at,
      completed_by = NEW.executed_by,
      observations = COALESCE(NEW.observations, observations),
      updated_at = now()
    WHERE maintenance_plan_id = NEW.maintenance_plan_id
      AND scheduled_date = COALESCE(NEW.scheduled_date, NEW.executed_at::date)
      AND status <> 'COMPLETED';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_complete_work_order_from_execution
ON public.maintenance_executions;

CREATE TRIGGER trg_complete_work_order_from_execution
AFTER INSERT OR UPDATE OF scheduled_date, executed_at, result, executed_by, observations
ON public.maintenance_executions
FOR EACH ROW
EXECUTE FUNCTION public.complete_work_order_from_maintenance_execution();

REVOKE ALL ON FUNCTION public.complete_work_order_from_maintenance_execution() FROM PUBLIC;

-- =========================================================
-- EJECUCIÓN HORARIA SERVER-SIDE
-- =========================================================

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  PERFORM public.generate_maintenance_work_orders();

  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'arias-maintenance-work-order-generation'
  ) THEN
    SELECT jobid
      INTO existing_job_id
    FROM cron.job
    WHERE jobname = 'arias-maintenance-work-order-generation'
    LIMIT 1;

    IF existing_job_id IS NOT NULL THEN
      PERFORM cron.unschedule(existing_job_id);
    END IF;
  END IF;

  PERFORM cron.schedule(
    'arias-maintenance-work-order-generation',
    '10 * * * *',
    'SELECT public.generate_maintenance_work_orders();'
  );
END;
$$;

COMMENT ON FUNCTION public.generate_maintenance_work_orders() IS
'Genera automáticamente OTs preventivas para los mantenimientos con generación automática activa por hotel.';

COMMENT ON COLUMN public.maintenance_work_orders.ot_number IS
'Número único de OT por hotel y fecha de emisión. Formato OT-YYYYMMDD-NNNN.';

COMMIT;
