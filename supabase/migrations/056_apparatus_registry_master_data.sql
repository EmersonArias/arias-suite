-- Arias Suite — migración 056
-- Amplía la ficha maestra de Equipos e instalaciones.
-- No modifica ni reescribe migraciones ejecutadas anteriormente.

BEGIN;

ALTER TABLE public.apparatus_registry
  ADD COLUMN IF NOT EXISTS equipment_type text,
  ADD COLUMN IF NOT EXISTS system_name text,
  ADD COLUMN IF NOT EXISTS manufacturer text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS serial_number text,
  ADD COLUMN IF NOT EXISTS inventory_number text,
  ADD COLUMN IF NOT EXISTS installation_date date,
  ADD COLUMN IF NOT EXISTS criticality text NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS observations text,
  ADD COLUMN IF NOT EXISTS documents jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.apparatus_registry
  DROP CONSTRAINT IF EXISTS apparatus_registry_criticality_check;

ALTER TABLE public.apparatus_registry
  ADD CONSTRAINT apparatus_registry_criticality_check
  CHECK (criticality IN ('LOW', 'NORMAL', 'HIGH', 'CRITICAL'));

CREATE INDEX IF NOT EXISTS ix_apparatus_registry_system_name
  ON public.apparatus_registry (hotel_id, system_name);

CREATE INDEX IF NOT EXISTS ix_apparatus_registry_criticality
  ON public.apparatus_registry (hotel_id, criticality);

COMMIT;
