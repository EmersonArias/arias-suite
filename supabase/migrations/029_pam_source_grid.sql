-- Arias Suite — migración 029
-- Base de lectura del PAM histórico/original.
--
-- El PAM original es un calendario matricial:
--   EQUIPO -> MES -> POSICIÓN SEMANAL -> MARCA
--
-- Esta migración conserva esa fuente sin convertirla todavía en fechas
-- concretas ni en OTs. Es deliberado: algunos códigos del archivo no tienen
-- una definición única y un mismo código puede aparecer con descripciones
-- distintas en la leyenda.
--
-- Orden: 027 -> 028 -> 029.
-- No modifica ni reejecuta migraciones anteriores.

BEGIN;

-- =========================================================
-- CATÁLOGO DE CÓDIGOS DEL PAM
-- =========================================================

CREATE TABLE IF NOT EXISTS public.pam_action_codes (
  code text PRIMARY KEY,
  name text,
  candidate_names jsonb NOT NULL DEFAULT '[]'::jsonb,
  definition_status text NOT NULL DEFAULT 'REVIEW'
    CHECK (definition_status IN ('CONFIRMED', 'REVIEW', 'UNKNOWN')),
  is_action boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_pam_action_codes_status
  ON public.pam_action_codes (definition_status, active);

COMMENT ON TABLE public.pam_action_codes IS
'Catálogo controlado de marcas/códigos del PAM. Los códigos ambiguos o desconocidos permanecen en revisión y no se reinterpretan automáticamente.';

-- =========================================================
-- MARCAS DE LA FUENTE PAM
-- =========================================================

CREATE TABLE IF NOT EXISTS public.pam_source_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE RESTRICT,
  source_version text NOT NULL,
  source_sheet text NOT NULL,
  source_row integer NOT NULL,
  source_column integer NOT NULL,
  source_apparatus_id integer NOT NULL,
  apparatus_registry_id uuid REFERENCES public.apparatus_registry(id) ON DELETE SET NULL,
  plan_year integer NOT NULL,
  month_number integer NOT NULL,
  week_slot integer NOT NULL,
  mark_code text NOT NULL REFERENCES public.pam_action_codes(code) ON DELETE RESTRICT,
  imported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pam_source_marks_month_check CHECK (month_number BETWEEN 1 AND 12),
  CONSTRAINT pam_source_marks_week_check CHECK (week_slot BETWEEN 1 AND 5),
  CONSTRAINT pam_source_marks_unique
    UNIQUE (
      hotel_id,
      source_version,
      source_sheet,
      source_row,
      source_apparatus_id,
      plan_year,
      month_number,
      week_slot,
      mark_code
    )
);

CREATE INDEX IF NOT EXISTS ix_pam_source_marks_hotel_year
  ON public.pam_source_marks (hotel_id, plan_year, month_number, week_slot);

CREATE INDEX IF NOT EXISTS ix_pam_source_marks_apparatus
  ON public.pam_source_marks (hotel_id, source_apparatus_id, plan_year);

CREATE INDEX IF NOT EXISTS ix_pam_source_marks_code
  ON public.pam_source_marks (mark_code, plan_year);

COMMENT ON TABLE public.pam_source_marks IS
'Representación fiel del PAM de origen. Conserva la marca de semana del documento sin inferir una fecha exacta. week_slot admite 1..5 para la futura representación de meses de cinco semanas.';

-- =========================================================
-- VISTA LEGIBLE
-- =========================================================

CREATE OR REPLACE VIEW public.pam_source_marks_resolved AS
SELECT
  psm.id,
  psm.hotel_id,
  psm.source_version,
  psm.source_sheet,
  psm.source_row,
  psm.source_column,
  psm.source_apparatus_id,
  psm.apparatus_registry_id,
  ar.code AS apparatus_code,
  ar.name AS apparatus_name,
  ar.plant,
  ar.location,
  psm.plan_year,
  psm.month_number,
  psm.week_slot,
  psm.mark_code,
  pac.name AS action_name,
  pac.candidate_names,
  pac.definition_status,
  pac.is_action
FROM public.pam_source_marks psm
JOIN public.pam_action_codes pac
  ON pac.code = psm.mark_code
LEFT JOIN public.apparatus_registry ar
  ON ar.id = psm.apparatus_registry_id;

-- =========================================================
-- RLS
-- =========================================================

ALTER TABLE public.pam_action_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pam_source_marks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pam_action_codes_select ON public.pam_action_codes;

CREATE POLICY pam_action_codes_select
  ON public.pam_action_codes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.hotels h
      WHERE h.active = true
        AND public.has_hotel_permission(h.id, 'maintenance.view')
    )
  );

DROP POLICY IF EXISTS pam_source_marks_select ON public.pam_source_marks;

CREATE POLICY pam_source_marks_select
  ON public.pam_source_marks
  FOR SELECT
  TO authenticated
  USING (
    public.has_hotel_permission(hotel_id, 'maintenance.view')
  );

COMMIT;
