-- =========================================================
-- 052 — CORRECCIÓN DEL CONFLICT TARGET DEL MOTOR DE OTs
-- =========================================================
-- 046 creó un índice UNIQUE parcial sobre:
--   (maintenance_plan_id, scheduled_date)
--   WHERE scheduled_date IS NOT NULL
--
-- PostgreSQL exige que el ON CONFLICT indique también el predicado
-- del índice parcial para poder inferir ese índice.
--
-- No modifica la migración 050 ejecutada. Solo reemplaza la función.
-- =========================================================

BEGIN;

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

      -- Una única OT abierta por mantenimiento.
      -- Una OT vencida permanece pendiente y bloquea duplicados diarios.
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

      -- Reutilizamos el trabajo programado de esa fecha si existe.
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
          WHERE scheduled_date IS NOT NULL
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
'Genera una única OT abierta por mantenimiento preventivo. Las OTs vencidas permanecen pendientes y no generan duplicados.';

-- Ejecutamos una generación una vez corregida la función.
DO $$
BEGIN
  PERFORM public.generate_maintenance_work_orders();
END;
$$;

COMMIT;
