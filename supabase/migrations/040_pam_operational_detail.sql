-- Arias Suite — migración 040
-- Consolidación del modelo operativo del PAM.
--
-- El PAM sigue siendo un único módulo de cara al usuario.
-- Esta migración añade la información estructurada necesaria para que cada
-- mantenimiento pueda gestionar programación, proveedor, contrato y reglas
-- de aviso sin depender de una matriz de 12 meses.
--
-- No inventa proveedores, contratos ni fechas.
-- Los datos existentes se conservan.
-- No modifica migraciones anteriores.

BEGIN;

-- =========================================================
-- DATOS ESTRUCTURADOS DEL MANTENIMIENTO
-- =========================================================

ALTER TABLE public.maintenance_plans
  ADD COLUMN IF NOT EXISTS provider_id uuid
    REFERENCES public.providers(id) ON DELETE RESTRICT;

ALTER TABLE public.maintenance_plans
  ADD COLUMN IF NOT EXISTS provider_service_id uuid
    REFERENCES public.provider_services(id) ON DELETE RESTRICT;

ALTER TABLE public.maintenance_plans
  ADD COLUMN IF NOT EXISTS contract_reference text;

ALTER TABLE public.maintenance_plans
  ADD COLUMN IF NOT EXISTS schedule_anchor_date date;

ALTER TABLE public.maintenance_plans
  ADD COLUMN IF NOT EXISTS scheduled_day_of_month integer;

ALTER TABLE public.maintenance_plans
  ADD COLUMN IF NOT EXISTS scheduled_weekday integer;

ALTER TABLE public.maintenance_plans
  ADD COLUMN IF NOT EXISTS tolerance_days integer NOT NULL DEFAULT 0;

ALTER TABLE public.maintenance_plans
  ADD COLUMN IF NOT EXISTS alert_lead_days integer NOT NULL DEFAULT 7;

ALTER TABLE public.maintenance_plans
  ADD COLUMN IF NOT EXISTS booking_required boolean NOT NULL DEFAULT false;

ALTER TABLE public.maintenance_plans
  ADD COLUMN IF NOT EXISTS visit_duration_minutes integer;

ALTER TABLE public.maintenance_plans
  ADD COLUMN IF NOT EXISTS schedule_notes text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'maintenance_plans_day_of_month_check'
      AND conrelid = 'public.maintenance_plans'::regclass
  ) THEN
    ALTER TABLE public.maintenance_plans
      ADD CONSTRAINT maintenance_plans_day_of_month_check
      CHECK (
        scheduled_day_of_month IS NULL
        OR scheduled_day_of_month BETWEEN 1 AND 31
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'maintenance_plans_weekday_check'
      AND conrelid = 'public.maintenance_plans'::regclass
  ) THEN
    ALTER TABLE public.maintenance_plans
      ADD CONSTRAINT maintenance_plans_weekday_check
      CHECK (
        scheduled_weekday IS NULL
        OR scheduled_weekday BETWEEN 1 AND 7
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'maintenance_plans_tolerance_days_check'
      AND conrelid = 'public.maintenance_plans'::regclass
  ) THEN
    ALTER TABLE public.maintenance_plans
      ADD CONSTRAINT maintenance_plans_tolerance_days_check
      CHECK (tolerance_days >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'maintenance_plans_alert_lead_days_check'
      AND conrelid = 'public.maintenance_plans'::regclass
  ) THEN
    ALTER TABLE public.maintenance_plans
      ADD CONSTRAINT maintenance_plans_alert_lead_days_check
      CHECK (alert_lead_days >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'maintenance_plans_visit_duration_check'
      AND conrelid = 'public.maintenance_plans'::regclass
  ) THEN
    ALTER TABLE public.maintenance_plans
      ADD CONSTRAINT maintenance_plans_visit_duration_check
      CHECK (
        visit_duration_minutes IS NULL
        OR visit_duration_minutes > 0
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS ix_maintenance_plans_provider_id
  ON public.maintenance_plans (provider_id)
  WHERE provider_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_maintenance_plans_provider_service_id
  ON public.maintenance_plans (provider_service_id)
  WHERE provider_service_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_maintenance_plans_contract_reference
  ON public.maintenance_plans (hotel_id, contract_reference)
  WHERE contract_reference IS NOT NULL;

-- =========================================================
-- VISTA OPERATIVA PARA LA FICHA DEL PAM
-- =========================================================

CREATE OR REPLACE VIEW public.maintenance_plan_overview
WITH (security_invoker = true)
AS
SELECT
  mp.id,
  mp.hotel_id,
  mp.apparatus_registry_id,
  ar.code AS apparatus_code,
  ar.name AS apparatus_name,
  ar.plant,
  ar.location,
  mp.code AS maintenance_code,
  mp.name AS maintenance_name,
  mp.description,
  mp.maintenance_type,
  mp.provider_id,
  COALESCE(p.trade_name, p.legal_name) AS provider_name,
  mp.provider_service_id,
  ps.service_name AS provider_service_name,
  mp.external_company,
  mp.contract_reference,
  mp.periodicity_value,
  mp.periodicity_unit,
  mp.start_date,
  mp.schedule_anchor_date,
  mp.scheduled_day_of_month,
  mp.scheduled_weekday,
  mp.tolerance_days,
  mp.alert_lead_days,
  mp.booking_required,
  mp.visit_duration_minutes,
  mp.schedule_notes,
  mp.next_due_date,
  mp.active
FROM public.maintenance_plans mp
LEFT JOIN public.apparatus_registry ar
  ON ar.id = mp.apparatus_registry_id
LEFT JOIN public.providers p
  ON p.id = mp.provider_id
LEFT JOIN public.provider_services ps
  ON ps.id = mp.provider_service_id;

COMMENT ON VIEW public.maintenance_plan_overview IS
'Ficha operativa del PAM: activo, mantenimiento, periodicidad, proveedor, contrato, programación y próxima intervención.';

COMMIT;
