-- Arias Suite — migración 035
-- Motor base de trabajos programados derivados del PAM.
--
-- Un trabajo programado representa una marca real del PAM para un equipo
-- y una posición mes/semana. No inventa una fecha de calendario.
-- La fecha exacta queda nullable hasta aplicar las reglas de planificación.
--
-- Estados V1:
--   PENDING
--   IN_PROGRESS
--   COMPLETED

BEGIN;

CREATE TABLE IF NOT EXISTS public.maintenance_scheduled_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL
    REFERENCES public.hotels(id) ON DELETE RESTRICT,
  maintenance_plan_id uuid NOT NULL
    REFERENCES public.maintenance_plans(id) ON DELETE RESTRICT,
  source_mark_id uuid NOT NULL
    REFERENCES public.pam_source_marks(id) ON DELETE RESTRICT,
  plan_year integer NOT NULL,
  month_number integer NOT NULL
    CHECK (month_number BETWEEN 1 AND 12),
  week_slot integer NOT NULL
    CHECK (week_slot BETWEEN 1 AND 5),
  scheduled_date date,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED')),
  started_at timestamptz,
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  observations text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_scheduled_jobs_unique_source
    UNIQUE (maintenance_plan_id, source_mark_id)
);

CREATE INDEX IF NOT EXISTS ix_maintenance_scheduled_jobs_hotel_date
  ON public.maintenance_scheduled_jobs (
    hotel_id,
    scheduled_date,
    status
  );

CREATE INDEX IF NOT EXISTS ix_maintenance_scheduled_jobs_hotel_period
  ON public.maintenance_scheduled_jobs (
    hotel_id,
    plan_year,
    month_number,
    week_slot,
    status
  );

CREATE INDEX IF NOT EXISTS ix_maintenance_scheduled_jobs_plan
  ON public.maintenance_scheduled_jobs (
    maintenance_plan_id,
    plan_year,
    month_number,
    week_slot
  );

ALTER TABLE public.maintenance_scheduled_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_scheduled_jobs_select
ON public.maintenance_scheduled_jobs;

CREATE POLICY maintenance_scheduled_jobs_select
  ON public.maintenance_scheduled_jobs
  FOR SELECT
  TO authenticated
  USING (
    public.has_hotel_permission(hotel_id, 'maintenance.view')
  );

DROP POLICY IF EXISTS maintenance_scheduled_jobs_insert
ON public.maintenance_scheduled_jobs;

CREATE POLICY maintenance_scheduled_jobs_insert
  ON public.maintenance_scheduled_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_hotel_permission(hotel_id, 'maintenance.create')
  );

DROP POLICY IF EXISTS maintenance_scheduled_jobs_update
ON public.maintenance_scheduled_jobs;

CREATE POLICY maintenance_scheduled_jobs_update
  ON public.maintenance_scheduled_jobs
  FOR UPDATE
  TO authenticated
  USING (
    public.has_hotel_permission(hotel_id, 'maintenance.update')
  )
  WITH CHECK (
    public.has_hotel_permission(hotel_id, 'maintenance.update')
  );

DO $$
BEGIN
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
    psm.hotel_id,
    l.maintenance_plan_id,
    psm.id,
    psm.plan_year,
    psm.month_number,
    psm.week_slot,
    NULL,
    'PENDING'
  FROM public.pam_source_marks psm
  JOIN public.pam_maintenance_plan_links l
    ON l.source_group_id = (
      SELECT psg.id
      FROM public.pam_source_groups psg
      WHERE psg.hotel_id = psm.hotel_id
        AND psg.source_version = psm.source_version
        AND psg.source_sheet = psm.source_sheet
        AND psg.source_row = psm.source_row
      LIMIT 1
    )
   AND l.source_apparatus_id = psm.source_apparatus_id
   AND l.mark_code = psm.mark_code
   AND l.plan_year = psm.plan_year
  WHERE psm.apparatus_registry_id IS NOT NULL
  ON CONFLICT (
    maintenance_plan_id,
    source_mark_id
  ) DO NOTHING;
END;
$$;

CREATE OR REPLACE VIEW public.maintenance_scheduled_jobs_resolved
WITH (security_invoker = true)
AS
SELECT
  j.id,
  j.hotel_id,
  j.maintenance_plan_id,
  j.source_mark_id,
  j.plan_year,
  j.month_number,
  j.week_slot,
  j.scheduled_date,
  j.status,
  j.started_at,
  j.completed_at,
  j.completed_by,
  j.observations,
  mp.code AS maintenance_plan_code,
  mp.name AS maintenance_plan_name,
  mp.maintenance_type,
  mp.apparatus_registry_id,
  ar.code AS apparatus_code,
  ar.name AS apparatus_name,
  ar.plant,
  ar.location,
  j.created_at,
  j.updated_at
FROM public.maintenance_scheduled_jobs j
JOIN public.maintenance_plans mp
  ON mp.id = j.maintenance_plan_id
LEFT JOIN public.apparatus_registry ar
  ON ar.id = mp.apparatus_registry_id;

COMMENT ON TABLE public.maintenance_scheduled_jobs IS
'Trabajos programados derivados directamente de las marcas del PAM. La fecha exacta es opcional hasta resolver las reglas de calendario.';

COMMENT ON VIEW public.maintenance_scheduled_jobs_resolved IS
'Vista operativa de trabajos programados del PAM con equipo y mantenimiento resueltos.';

COMMIT;
