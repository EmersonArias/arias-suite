-- Arias Suite — migración 033
-- Conversión controlada de candidatos PAM 2025 a mantenimiento real.
--
-- Regla:
--   Solo se materializan candidatos:
--     - con equipo resuelto;
--     - con código de acción CONFIRMED;
--     - con periodicidad derivada no VARIABLE.
--
-- No genera fechas exactas ni ejecuciones.
-- La planificación temporal se resolverá en el motor de planificación.
-- Mantiene trazabilidad mediante pam_maintenance_plan_links.
--
-- 033 NO debe ejecutarse hasta validar el resultado de 032.

BEGIN;

CREATE TABLE IF NOT EXISTS public.pam_maintenance_plan_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_plan_id uuid NOT NULL
    REFERENCES public.maintenance_plans(id) ON DELETE CASCADE,
  source_group_id uuid NOT NULL
    REFERENCES public.pam_source_groups(id) ON DELETE RESTRICT,
  source_apparatus_id integer NOT NULL,
  mark_code text NOT NULL
    REFERENCES public.pam_action_codes(code) ON DELETE RESTRICT,
  plan_year integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pam_maintenance_plan_links_unique
    UNIQUE (
      source_group_id,
      source_apparatus_id,
      mark_code,
      plan_year
    ),
  CONSTRAINT pam_maintenance_plan_links_plan_unique
    UNIQUE (maintenance_plan_id)
);

CREATE INDEX IF NOT EXISTS ix_pam_maintenance_plan_links_plan
  ON public.pam_maintenance_plan_links (maintenance_plan_id);

CREATE INDEX IF NOT EXISTS ix_pam_maintenance_plan_links_source
  ON public.pam_maintenance_plan_links (
    source_group_id,
    source_apparatus_id,
    mark_code,
    plan_year
  );

ALTER TABLE public.pam_maintenance_plan_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pam_maintenance_plan_links_select
ON public.pam_maintenance_plan_links;

CREATE POLICY pam_maintenance_plan_links_select
  ON public.pam_maintenance_plan_links
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.maintenance_plans mp
      WHERE mp.id = pam_maintenance_plan_links.maintenance_plan_id
        AND public.has_hotel_permission(mp.hotel_id, 'maintenance.view')
    )
  );

DO $$
DECLARE
  v_candidate record;
  v_source_group_id uuid;
  v_plan_id uuid;
  v_plan_code text;
  v_plan_name text;
  v_description text;
  v_maintenance_type text;
BEGIN
  FOR v_candidate IN
    SELECT
      c.hotel_id,
      c.source_version,
      c.source_sheet,
      c.source_row,
      c.maintenance_name,
      c.source_apparatus_id,
      c.apparatus_registry_id,
      c.apparatus_code,
      c.apparatus_name,
      c.plan_year,
      c.mark_code,
      c.action_name,
      c.definition_status,
      c.derived_periodicity_unit,
      c.derived_periodicity_value
    FROM public.pam_plan_candidates c
    WHERE c.apparatus_registry_id IS NOT NULL
      AND c.definition_status = 'CONFIRMED'
      AND c.derived_periodicity_unit <> 'VARIABLE'
    ORDER BY
      c.source_row,
      c.source_apparatus_id,
      c.mark_code
  LOOP
    SELECT psg.id
      INTO v_source_group_id
    FROM public.pam_source_groups psg
    WHERE psg.hotel_id = v_candidate.hotel_id
      AND psg.source_version = v_candidate.source_version
      AND psg.source_sheet = v_candidate.source_sheet
      AND psg.source_row = v_candidate.source_row
    LIMIT 1;

    IF v_source_group_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT l.maintenance_plan_id
      INTO v_plan_id
    FROM public.pam_maintenance_plan_links l
    WHERE l.source_group_id = v_source_group_id
      AND l.source_apparatus_id = v_candidate.source_apparatus_id
      AND l.mark_code = v_candidate.mark_code
      AND l.plan_year = v_candidate.plan_year
    LIMIT 1;

    IF v_plan_id IS NOT NULL THEN
      CONTINUE;
    END IF;

    v_plan_code := format(
      'PAM-%s-R%s-A%s-%s',
      v_candidate.plan_year,
      v_candidate.source_row,
      v_candidate.source_apparatus_id,
      v_candidate.mark_code
    );

    v_plan_name := COALESCE(
      NULLIF(btrim(v_candidate.maintenance_name), ''),
      'Mantenimiento PAM'
    );

    v_description := format(
      'Origen PAM %s / %s / fila %s / equipo %s / acción %s.',
      v_candidate.source_version,
      v_candidate.source_sheet,
      v_candidate.source_row,
      COALESCE(v_candidate.apparatus_name, v_candidate.source_apparatus_id::text),
      v_candidate.mark_code
    );

    v_maintenance_type := CASE
      WHEN v_candidate.mark_code = 'EXT' THEN 'EXTERNAL'
      ELSE 'INTERNAL'
    END;

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
    VALUES (
      v_candidate.hotel_id,
      v_candidate.apparatus_registry_id,
      v_plan_code,
      v_plan_name,
      v_description,
      v_maintenance_type,
      v_candidate.derived_periodicity_value,
      v_candidate.derived_periodicity_unit,
      NULL,
      NULL,
      true
    )
    RETURNING id INTO v_plan_id;

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
      v_candidate.source_apparatus_id,
      v_candidate.mark_code,
      v_candidate.plan_year
    )
    ON CONFLICT (
      source_group_id,
      source_apparatus_id,
      mark_code,
      plan_year
    ) DO NOTHING;
  END LOOP;
END;
$$;

COMMIT;
