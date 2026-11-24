-- Arias Suite — migración 049
-- Fotografías de referencia asociadas directamente a un mantenimiento/PAM.
--
-- Son distintas de las evidencias de ejecución/OT.
-- Se reutiliza el bucket privado maintenance-evidence.
--
-- No modifica migraciones anteriores.

BEGIN;

CREATE TABLE IF NOT EXISTS public.maintenance_plan_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL
    REFERENCES public.hotels(id) ON DELETE RESTRICT,
  maintenance_plan_id uuid NOT NULL
    REFERENCES public.maintenance_plans(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type LIKE 'image/%'),
  file_size integer NOT NULL CHECK (file_size >= 0),
  uploaded_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_maintenance_plan_photos_plan
  ON public.maintenance_plan_photos (maintenance_plan_id, uploaded_at DESC);

ALTER TABLE public.maintenance_plan_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_plan_photos_select
ON public.maintenance_plan_photos;

CREATE POLICY maintenance_plan_photos_select
  ON public.maintenance_plan_photos
  FOR SELECT
  TO authenticated
  USING (
    public.has_hotel_permission(hotel_id, 'maintenance.view')
  );

DROP POLICY IF EXISTS maintenance_plan_photos_insert
ON public.maintenance_plan_photos;

CREATE POLICY maintenance_plan_photos_insert
  ON public.maintenance_plan_photos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_hotel_permission(hotel_id, 'maintenance.update')
    AND EXISTS (
      SELECT 1
      FROM public.maintenance_plans mp
      WHERE mp.id = maintenance_plan_id
        AND mp.hotel_id = public.maintenance_plan_photos.hotel_id
    )
  );

DROP POLICY IF EXISTS maintenance_plan_photos_delete
ON public.maintenance_plan_photos;

CREATE POLICY maintenance_plan_photos_delete
  ON public.maintenance_plan_photos
  FOR DELETE
  TO authenticated
  USING (
    public.has_hotel_permission(hotel_id, 'maintenance.update')
  );

COMMENT ON TABLE public.maintenance_plan_photos IS
'Fotografías de referencia del mantenimiento/PAM. Distintas de las evidencias de ejecución u OT.';

COMMIT;
