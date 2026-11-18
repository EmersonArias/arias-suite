-- Arias Suite — migración 058
-- Sincronización operativa del PAM Diario con planes reales y generación de OTs.
--
-- Objetivo:
--   - Los 27 trabajos diarios visibles en PAM deben tener un maintenance_plan real.
--   - La periodicidad diaria se fija para las filas PAM 6, 7 y 8 con marca F.
--   - Los planes diarios sin histórico reciben start_date = CURRENT_DATE para
--     permitir la primera OT del ciclo actual.
--   - Se corrige el vínculo con apparatus_registry para que PAM y OT utilicen
--     el mismo activo real y, por tanto, el mismo código RA-... cuando exista.
--   - Se ejecuta el generador existente para crear las OTs que falten.
--
-- No modifica migraciones anteriores.

BEGIN;

DO $$
DECLARE
  v_hotel_id uuid;
  v_source_group_id uuid;
  v_mark record;
  v_existing_link record;
  v_plan_id uuid;
  v_created_plans integer := 0;
  v_expected_count integer;
  v_resolved_count integer;
BEGIN
  -- Trabajamos sobre los hoteles activos que tengan datos PAM 2026
  -- en las tres filas que componen el bloque Diario.
  FOR v_hotel_id IN
    SELECT DISTINCT psg.hotel_id
    FROM public.pam_source_groups psg
    WHERE psg.plan_year = 2026
      AND psg.source_row IN (6, 7, 8)
  LOOP
    SELECT COUNT(*)
      INTO v_expected_count
    FROM (
      SELECT DISTINCT psm.source_apparatus_id
      FROM public.pam_source_marks psm
      WHERE psm.hotel_id = v_hotel_id
        AND psm.plan_year = 2026
        AND psm.source_row IN (6, 7, 8)
        AND psm.mark_code = 'F'
    ) q;

    SELECT COUNT(*)
      INTO v_resolved_count
    FROM (
      SELECT DISTINCT psm.source_apparatus_id
      FROM public.pam_source_marks psm
      JOIN public.apparatus_registry ar
        ON ar.id = psm.apparatus_registry_id
       AND ar.hotel_id = psm.hotel_id
      WHERE psm.hotel_id = v_hotel_id
        AND psm.plan_year = 2026
        AND psm.source_row IN (6, 7, 8)
        AND psm.mark_code = 'F'
    ) q;

    IF v_expected_count <> 27 THEN
      RAISE EXCEPTION
        'PAM Diario: se esperaban 27 activos en filas 6-8 y se encontraron %.',
        v_expected_count;
    END IF;

    IF v_resolved_count <> 27 THEN
      RAISE EXCEPTION
        'PAM Diario: solo % de 27 activos tienen equipo resuelto en apparatus_registry.',
        v_resolved_count;
    END IF;

    -- Todo el bloque Diario es 1 día.
    UPDATE public.maintenance_plans mp
    SET
      periodicity_value = 1,
      periodicity_unit = 'DAY',
      name = 'PREVENTIVO DIARIO',
      updated_at = now()
    WHERE mp.hotel_id = v_hotel_id
      AND mp.active = true
      AND EXISTS (
        SELECT 1
        FROM public.pam_maintenance_plan_links l
        JOIN public.pam_source_groups psg
          ON psg.id = l.source_group_id
        WHERE l.maintenance_plan_id = mp.id
          AND l.plan_year = 2026
          AND psg.source_row IN (6, 7, 8)
          AND l.mark_code = 'F'
      );

    -- Las primeras revisiones no tienen histórico; se activan hoy.
    -- La migración 050 usa start_date como fecha inicial cuando next_due_date
    -- aún no existe.
    UPDATE public.maintenance_plans mp
    SET
      start_date = COALESCE(mp.start_date, CURRENT_DATE),
      updated_at = now()
    WHERE mp.hotel_id = v_hotel_id
      AND mp.active = true
      AND EXISTS (
        SELECT 1
        FROM public.pam_maintenance_plan_links l
        JOIN public.pam_source_groups psg
          ON psg.id = l.source_group_id
        WHERE l.maintenance_plan_id = mp.id
          AND l.plan_year = 2026
          AND psg.source_row IN (6, 7, 8)
          AND l.mark_code = 'F'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.maintenance_executions me
        WHERE me.maintenance_plan_id = mp.id
          AND me.executed_at IS NOT NULL
          AND me.result <> 'CANCELLED'
      );

    FOR v_mark IN
      SELECT DISTINCT
        psm.source_row,
        psm.source_apparatus_id,
        psm.mark_code,
        psm.apparatus_registry_id
      FROM public.pam_source_marks psm
      JOIN public.apparatus_registry ar
        ON ar.id = psm.apparatus_registry_id
       AND ar.hotel_id = psm.hotel_id
      WHERE psm.hotel_id = v_hotel_id
        AND psm.plan_year = 2026
        AND psm.source_row IN (6, 7, 8)
        AND psm.mark_code = 'F'
      ORDER BY psm.source_row, psm.source_apparatus_id
    LOOP
      SELECT
        l.maintenance_plan_id,
        l.source_group_id
      INTO v_existing_link
      FROM public.pam_maintenance_plan_links l
      JOIN public.pam_source_groups psg
        ON psg.id = l.source_group_id
      WHERE l.plan_year = 2026
        AND psg.hotel_id = v_hotel_id
        AND psg.source_row = v_mark.source_row
        AND l.source_apparatus_id = v_mark.source_apparatus_id
        AND l.mark_code = 'F'
      LIMIT 1;

      IF v_existing_link.maintenance_plan_id IS NULL THEN
        INSERT INTO public.maintenance_plans (
          hotel_id,
          apparatus_registry_id,
          code,
          name,
          description,
          maintenance_type,
          periodicity_value,
          periodicity_unit,
          start_date,
          next_due_date,
          active
        )
        SELECT
          v_hotel_id,
          v_mark.apparatus_registry_id,
          format(
            'PAM-2026-R%s-A%s-F',
            v_mark.source_row,
            v_mark.source_apparatus_id
          ),
          'PREVENTIVO DIARIO',
          NULL,
          'INTERNAL',
          1,
          'DAY',
          CURRENT_DATE,
          NULL,
          true
        RETURNING id INTO v_plan_id;

        SELECT psg.id
          INTO v_source_group_id
        FROM public.pam_source_groups psg
        WHERE psg.hotel_id = v_hotel_id
          AND psg.plan_year = 2026
          AND psg.source_row = v_mark.source_row
        LIMIT 1;

        INSERT INTO public.pam_maintenance_plan_links (
          maintenance_plan_id,
          source_group_id,
          source_apparatus_id,
          mark_code,
          plan_year
        )
        VALUES (
          v_plan_id,
          v_source_group_id,
          v_mark.source_apparatus_id,
          'F',
          2026
        );

        v_created_plans := v_created_plans + 1;
      ELSE
        UPDATE public.maintenance_plans
        SET
          apparatus_registry_id = v_mark.apparatus_registry_id,
          periodicity_value = 1,
          periodicity_unit = 'DAY',
          name = 'PREVENTIVO DIARIO',
          updated_at = now()
        WHERE id = v_existing_link.maintenance_plan_id;
      END IF;
    END LOOP;
  END LOOP;

  -- Crea las OTs faltantes respetando toda la lógica existente:
  -- una OT abierta por plan y sin duplicados.
  PERFORM public.generate_maintenance_work_orders();

  RAISE NOTICE 'Migración 058: planes diarios creados = %.', v_created_plans;
END;
$$;

COMMIT;
