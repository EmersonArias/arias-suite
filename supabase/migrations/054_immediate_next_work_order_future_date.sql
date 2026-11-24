-- =========================================================
-- 054 — GENERACIÓN INMEDIATA DE LA SIGUIENTE OT SIN ESPERAR A LA FECHA
-- =========================================================
-- Regla V1:
--   Cuando una OT preventiva se ejecuta correctamente, su siguiente
--   revisión queda calculada en maintenance_plans.next_due_date y la
--   siguiente OT se crea inmediatamente, aunque la fecha prevista sea
--   futura.
--
-- El "lead days" del generador horario sigue controlando cuándo se
-- generan OTs de forma anticipada por el ciclo normal.
-- Este flujo especial de cierre de OT no depende de ese parámetro:
-- una ejecución real abre inmediatamente el siguiente ciclo.
--
-- No modifica migraciones anteriores.

BEGIN;

-- =========================================================
-- GENERADOR DE UNA ÚNICA OT PARA UN PLAN
-- =========================================================

CREATE OR REPLACE FUNCTION public.generate_next_maintenance_work_order(
  target_plan_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  plan_record public.maintenance_plans%ROWTYPE;
  hotel_generation_mode text;
  source_mark_record public.pam_source_marks%ROWTYPE;
  scheduled_job_id uuid;
  work_order_id uuid;
  work_order_number text;
BEGIN
  SELECT mp.*
    INTO plan_record
  FROM public.maintenance_plans mp
  WHERE mp.id = target_plan_id
    AND mp.active = true;

  IF NOT FOUND OR plan_record.next_due_date IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT c.ot_generation_mode
    INTO hotel_generation_mode
  FROM public.maintenance_hotel_config c
  WHERE c.hotel_id = plan_record.hotel_id
  LIMIT 1;

  IF COALESCE(hotel_generation_mode, 'MANUAL') <> 'AUTO' THEN
    RETURN NULL;
  END IF;

  -- No crear una segunda OT abierta para el mismo mantenimiento.
  SELECT wo.id
    INTO work_order_id
  FROM public.maintenance_work_orders wo
  WHERE wo.maintenance_plan_id = plan_record.id
    AND wo.status IN ('PENDING', 'IN_PROGRESS')
  ORDER BY wo.scheduled_date ASC NULLS LAST, wo.created_at ASC
  LIMIT 1;

  IF work_order_id IS NOT NULL THEN
    RETURN work_order_id;
  END IF;

  -- Mantener trazabilidad con una marca PAM cuando exista.
  SELECT psm.*
    INTO source_mark_record
  FROM public.pam_maintenance_plan_links l
  JOIN public.pam_source_marks psm
    ON psm.id = (
      SELECT psm2.id
      FROM public.pam_source_marks psm2
      WHERE psm2.hotel_id = plan_record.hotel_id
        AND psm2.plan_year = l.plan_year
        AND psm2.source_apparatus_id = l.source_apparatus_id
        AND psm2.mark_code = l.mark_code
      ORDER BY psm2.month_number, psm2.week_slot, psm2.id
      LIMIT 1
    )
  WHERE l.maintenance_plan_id = plan_record.id
  ORDER BY psm.month_number, psm.week_slot, psm.id
  LIMIT 1;

  -- Reutilizar el trabajo programado de esa fecha si ya existe.
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
      plan_record.hotel_id,
      plan_record.id,
      source_mark_record.id,
      EXTRACT(YEAR FROM plan_record.next_due_date)::integer,
      EXTRACT(MONTH FROM plan_record.next_due_date)::integer,
      1,
      plan_record.next_due_date,
      'PENDING'
    )
    ON CONFLICT (maintenance_plan_id, scheduled_date)
      WHERE scheduled_date IS NOT NULL
    DO UPDATE SET
      scheduled_date = EXCLUDED.scheduled_date
    RETURNING id INTO scheduled_job_id;
  END IF;

  work_order_number := public.next_maintenance_ot_number(
    plan_record.hotel_id,
    CURRENT_DATE
  );

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
    plan_record.hotel_id,
    scheduled_job_id,
    plan_record.id,
    work_order_number,
    work_order_number || ' — ' || plan_record.name,
    plan_record.description,
    'PREVENTIVE',
    'PENDING',
    plan_record.next_due_date,
    'AUTO',
    NULL
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO work_order_id;

  IF work_order_id IS NULL THEN
    SELECT wo.id
      INTO work_order_id
    FROM public.maintenance_work_orders wo
    WHERE wo.maintenance_plan_id = plan_record.id
      AND wo.scheduled_date = plan_record.next_due_date
    ORDER BY wo.created_at DESC
    LIMIT 1;
  END IF;

  RETURN work_order_id;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_next_maintenance_work_order(uuid)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.generate_next_maintenance_work_order(uuid)
TO authenticated;

-- =========================================================
-- EL CIERRE DE UNA EJECUCIÓN CREA SU SIGUIENTE OT
-- =========================================================

CREATE OR REPLACE FUNCTION public.generate_next_maintenance_work_order_after_execution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.executed_at IS NOT NULL
     AND NEW.result <> 'CANCELLED'
  THEN
    PERFORM public.generate_next_maintenance_work_order(
      NEW.maintenance_plan_id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- =========================================================
-- RECUPERACIÓN DE LAS EJECUCIONES VÁLIDAS DE HOY
-- =========================================================
-- Permite que esta migración deje sincronizado el caso que ya fue
-- ejecutado antes de instalar la corrección. Solo toma planes AUTO
-- cuya última ejecución válida es hoy y que no tienen una OT abierta.

DO $$
DECLARE
  plan_id uuid;
BEGIN
  FOR plan_id IN
    SELECT me.maintenance_plan_id
    FROM public.maintenance_executions me
    JOIN public.maintenance_plans mp
      ON mp.id = me.maintenance_plan_id
    JOIN public.maintenance_hotel_config hc
      ON hc.hotel_id = mp.hotel_id
     AND hc.ot_generation_mode = 'AUTO'
    WHERE me.executed_at IS NOT NULL
      AND me.result <> 'CANCELLED'
    GROUP BY me.maintenance_plan_id
    HAVING MAX(me.executed_at::date) = CURRENT_DATE
       AND NOT EXISTS (
         SELECT 1
         FROM public.maintenance_work_orders wo
         WHERE wo.maintenance_plan_id = me.maintenance_plan_id
           AND wo.status IN ('PENDING', 'IN_PROGRESS')
       )
  LOOP
    PERFORM public.generate_next_maintenance_work_order(plan_id);
  END LOOP;
END;
$$;

COMMIT;
