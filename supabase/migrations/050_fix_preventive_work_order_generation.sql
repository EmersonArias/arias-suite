-- Arias Suite — migración 050
-- Corrección del motor de generación automática de OT preventivas.
--
-- Regla V1:
--   - Un mantenimiento preventivo solo puede tener UNA OT abierta
--     (PENDING o IN_PROGRESS) a la vez.
--   - Una OT pendiente que vence no provoca una nueva OT cada día.
--   - Cuando esa OT se ejecuta, la siguiente fecha se calcula desde la
--     ejecución real y el siguiente ciclo podrá generar una nueva OT.
--   - Para una primera revisión sin ejecución válida, se usa start_date
--     como fecha inicial si existe.
--
-- Limpieza de datos de prueba:
--   En este entorno las OTs existentes son registros de prueba sin una
--   ejecución real. Se eliminan todas las OTs y sus registros de evidencia.
--   No se eliminan trabajos programados PAM ni planes de mantenimiento.
--
-- No modifica migraciones anteriores.

BEGIN;

-- =========================================================
-- LIMPIEZA DE OTs DE PRUEBA
-- =========================================================

DELETE FROM public.maintenance_work_order_evidence;
DELETE FROM public.maintenance_work_orders;

-- Una única OT abierta por mantenimiento: evita duplicados incluso
-- si dos ejecuciones del generador coinciden.
CREATE UNIQUE INDEX IF NOT EXISTS ux_maintenance_work_orders_one_open_per_plan
  ON public.maintenance_work_orders (maintenance_plan_id)
  WHERE status IN ('PENDING', 'IN_PROGRESS');

-- =========================================================
-- GENERACIÓN AUTOMÁTICA CORREGIDA
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
  due_date date;
  open_ot_exists boolean;
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
        AND COALESCE(mp.next_due_date, mp.start_date) IS NOT NULL
    LOOP
      due_date := COALESCE(
        plan_record.next_due_date,
        plan_record.start_date
      );

      IF due_date > CURRENT_DATE + lead_days THEN
        CONTINUE;
      END IF;

      -- Regla fundamental: una sola OT abierta por mantenimiento.
      -- Si la OT está pendiente o en curso, aunque esté vencida, no se
      -- genera otra para el día siguiente.
      SELECT EXISTS (
        SELECT 1
        FROM public.maintenance_work_orders wo
        WHERE wo.maintenance_plan_id = plan_record.id
          AND wo.status IN ('PENDING', 'IN_PROGRESS')
      )
      INTO open_ot_exists;

      IF open_ot_exists THEN
        CONTINUE;
      END IF;

      -- Conservamos la trazabilidad con una marca PAM cuando existe.
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

      -- Reutilizamos un trabajo programado de esa misma fecha si ya existe.
      SELECT j.id
        INTO scheduled_job_id
      FROM public.maintenance_scheduled_jobs j
      WHERE j.maintenance_plan_id = plan_record.id
        AND j.scheduled_date = due_date
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
          EXTRACT(YEAR FROM due_date)::integer,
          EXTRACT(MONTH FROM due_date)::integer,
          1,
          due_date,
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
        'PREVENTIVE',
        'PENDING',
        due_date,
        'AUTO',
        NULL
      )
      ON CONFLICT DO NOTHING;

      IF FOUND THEN
        inserted_count := inserted_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_maintenance_work_orders() FROM PUBLIC;

COMMENT ON FUNCTION public.generate_maintenance_work_orders() IS
'Genera una única OT abierta por mantenimiento preventivo. Una OT vencida permanece abierta y no genera duplicados diarios. Para la primera revisión usa start_date si no existe next_due_date.';

-- Ejecuta una generación inicial limpia tras corregir el motor.
DO $$
BEGIN
  PERFORM public.generate_maintenance_work_orders();
END;
$$;

COMMIT;
