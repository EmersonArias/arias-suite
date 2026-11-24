-- Arias Suite — migración 060
-- Sincronización general de periodicidad y primeras fechas desde el PAM.
--
-- Objetivo:
--   - Cada maintenance_plan materializado desde un candidato PAM confirmado
--     conserva la periodicidad derivada de las marcas reales del PAM.
--   - Si el plan aún no tiene fecha de inicio, se toma la primera posición
--     mes/semana real del PAM como start_date.
--   - Los trabajos programados derivados de las marcas reciben su fecha de
--     calendario real.
--   - El generador existente puede materializar en Tickets el trabajo que ya
--     corresponde realizar, sea diario, semanal, quincenal, mensual, etc.
--
-- El bloque Diario de la migración 058 queda respetado: sus 27 planes no se
-- sobreescriben aquí.
--
-- No modifica migraciones anteriores.

BEGIN;

-- 1) Periodicidad: el código/marca del PAM ya tiene una periodicidad derivada
--    en pam_plan_candidates. La llevamos al plan vivo para que el motor de
--    Tickets trabaje con la misma regla.
UPDATE public.maintenance_plans mp
SET
  periodicity_value = c.derived_periodicity_value,
  periodicity_unit = c.derived_periodicity_unit,
  updated_at = now()
FROM public.pam_plan_candidates c
JOIN public.pam_maintenance_plan_links l
  ON l.source_apparatus_id = c.source_apparatus_id
 AND l.mark_code = c.mark_code
 AND l.plan_year = c.plan_year
JOIN public.pam_source_groups psg
  ON psg.id = l.source_group_id
 AND psg.hotel_id = c.hotel_id
 AND psg.source_version = c.source_version
 AND psg.source_sheet = c.source_sheet
 AND psg.source_row = c.source_row
WHERE mp.id = l.maintenance_plan_id
  AND mp.active = true
  AND c.apparatus_registry_id IS NOT NULL
  AND c.definition_status = 'CONFIRMED'
  AND c.derived_periodicity_unit <> 'VARIABLE'
  AND c.source_row NOT IN (6, 7, 8);

-- 2) Primera fecha: primera marca real del PAM para cada plan.
UPDATE public.maintenance_plans mp
SET
  start_date = COALESCE(
    mp.start_date,
    (
      SELECT public.pam_week_slot_start_date(
        psm.plan_year,
        psm.month_number,
        psm.week_slot
      )
      FROM public.pam_maintenance_plan_links l
      JOIN public.pam_source_groups psg
        ON psg.id = l.source_group_id
      JOIN public.pam_source_marks psm
        ON psm.hotel_id = psg.hotel_id
       AND psm.source_version = psg.source_version
       AND psm.source_sheet = psg.source_sheet
       AND psm.source_row = psg.source_row
       AND psm.source_apparatus_id = l.source_apparatus_id
       AND psm.mark_code = l.mark_code
       AND psm.plan_year = l.plan_year
      WHERE l.maintenance_plan_id = mp.id
      ORDER BY psm.plan_year, psm.month_number, psm.week_slot, psm.source_column, psm.id
      LIMIT 1
    )
  ),
  updated_at = now()
WHERE mp.active = true
  AND EXISTS (
    SELECT 1
    FROM public.pam_maintenance_plan_links l
    JOIN public.pam_plan_candidates c
      ON c.source_apparatus_id = l.source_apparatus_id
     AND c.mark_code = l.mark_code
     AND c.plan_year = l.plan_year
    JOIN public.pam_source_groups psg
      ON psg.id = l.source_group_id
     AND psg.hotel_id = c.hotel_id
     AND psg.source_version = c.source_version
     AND psg.source_sheet = c.source_sheet
     AND psg.source_row = c.source_row
    WHERE l.maintenance_plan_id = mp.id
      AND c.apparatus_registry_id IS NOT NULL
      AND c.definition_status = 'CONFIRMED'
      AND c.derived_periodicity_unit <> 'VARIABLE'
  );

-- 3) Fecha real de cada trabajo programado.
--
-- Existe un índice UNIQUE vigente sobre:
--   (maintenance_plan_id, scheduled_date)
--   WHERE scheduled_date IS NOT NULL.
--
-- Un mismo mantenimiento PAM puede tener varias marcas en una misma
-- semana/fecha. Por ello no intentamos actualizar todas las filas a la misma
-- fecha, porque provocaría una colisión. Se representa una sola vez cada
-- combinación plan + fecha, reutilizando primero el job de la misma marca y,
-- después, otro job sin fecha del mismo plan.
DO $$
DECLARE
  v_desired record;
  v_existing_job_id uuid;
  v_candidate_job_id uuid;
  v_schedule_date date;
BEGIN
  FOR v_desired IN
    SELECT DISTINCT ON (
      l.maintenance_plan_id,
      psm.plan_year,
      psm.month_number,
      psm.week_slot
    )
      l.maintenance_plan_id,
      psm.id AS source_mark_id,
      psm.plan_year,
      psm.month_number,
      psm.week_slot
    FROM public.pam_source_marks psm
    JOIN public.pam_source_groups psg
      ON psg.hotel_id = psm.hotel_id
     AND psg.source_version = psm.source_version
     AND psg.source_sheet = psm.source_sheet
     AND psg.source_row = psm.source_row
    JOIN public.pam_maintenance_plan_links l
      ON l.source_group_id = psg.id
     AND l.source_apparatus_id = psm.source_apparatus_id
     AND l.mark_code = psm.mark_code
     AND l.plan_year = psm.plan_year
    JOIN public.maintenance_plans mp
      ON mp.id = l.maintenance_plan_id
     AND mp.active = true
    WHERE psm.apparatus_registry_id IS NOT NULL
    ORDER BY
      l.maintenance_plan_id,
      psm.plan_year,
      psm.month_number,
      psm.week_slot,
      psm.source_column,
      psm.id
  LOOP
    v_schedule_date := public.pam_week_slot_start_date(
      v_desired.plan_year,
      v_desired.month_number,
      v_desired.week_slot
    );

    SELECT j.id
      INTO v_existing_job_id
    FROM public.maintenance_scheduled_jobs j
    WHERE j.maintenance_plan_id = v_desired.maintenance_plan_id
      AND j.scheduled_date = v_schedule_date
    ORDER BY j.created_at, j.id
    LIMIT 1;

    IF v_existing_job_id IS NOT NULL THEN
      CONTINUE;
    END IF;

    SELECT j.id
      INTO v_candidate_job_id
    FROM public.maintenance_scheduled_jobs j
    WHERE j.maintenance_plan_id = v_desired.maintenance_plan_id
      AND j.source_mark_id = v_desired.source_mark_id
      AND j.scheduled_date IS NULL
    LIMIT 1;

    IF v_candidate_job_id IS NULL THEN
      SELECT j.id
        INTO v_candidate_job_id
      FROM public.maintenance_scheduled_jobs j
      WHERE j.maintenance_plan_id = v_desired.maintenance_plan_id
        AND j.scheduled_date IS NULL
      ORDER BY j.created_at, j.id
      LIMIT 1;
    END IF;

    IF v_candidate_job_id IS NOT NULL THEN
      UPDATE public.maintenance_scheduled_jobs
      SET
        scheduled_date = v_schedule_date,
        updated_at = now()
      WHERE id = v_candidate_job_id;
    ELSE
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
      SELECT
        mp.hotel_id,
        v_desired.maintenance_plan_id,
        v_desired.source_mark_id,
        v_desired.plan_year,
        v_desired.month_number,
        v_desired.week_slot,
        v_schedule_date,
        'PENDING'
      FROM public.maintenance_plans mp
      WHERE mp.id = v_desired.maintenance_plan_id
      ON CONFLICT (maintenance_plan_id, scheduled_date)
        WHERE scheduled_date IS NOT NULL
      DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- 4) Las marcas adicionales del mismo plan y de la misma fecha no generan
--    una segunda fila, porque el índice de la tabla establece una única
--    representación operativa por plan + fecha.

-- 5) El motor existente crea ahora los Tickets que por fecha ya correspondan.
DO $$
BEGIN
  PERFORM public.generate_maintenance_work_orders();
END;
$$;

COMMIT;
