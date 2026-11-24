-- Arias Suite — migración 047
-- Evidencias fotográficas de las órdenes de trabajo.
--
-- Las fotografías quedan vinculadas a una OT y a un hotel.
-- Los ficheros se almacenan en el bucket privado maintenance-evidence.
--
-- No modifica migraciones anteriores.

BEGIN;

CREATE TABLE IF NOT EXISTS public.maintenance_work_order_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL
    REFERENCES public.hotels(id) ON DELETE RESTRICT,
  work_order_id uuid NOT NULL
    REFERENCES public.maintenance_work_orders(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  file_size integer NOT NULL CHECK (file_size >= 0),
  uploaded_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_maintenance_work_order_evidence_work_order
  ON public.maintenance_work_order_evidence (work_order_id, uploaded_at DESC);

ALTER TABLE public.maintenance_work_order_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_work_order_evidence_select
ON public.maintenance_work_order_evidence;

CREATE POLICY maintenance_work_order_evidence_select
  ON public.maintenance_work_order_evidence
  FOR SELECT
  TO authenticated
  USING (
    public.has_hotel_permission(hotel_id, 'maintenance.view')
  );

DROP POLICY IF EXISTS maintenance_work_order_evidence_insert
ON public.maintenance_work_order_evidence;

CREATE POLICY maintenance_work_order_evidence_insert
  ON public.maintenance_work_order_evidence
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_hotel_permission(hotel_id, 'maintenance.update')
    AND EXISTS (
      SELECT 1
      FROM public.maintenance_work_orders wo
      WHERE wo.id = work_order_id
        AND wo.hotel_id = public.maintenance_work_order_evidence.hotel_id
    )
  );

DROP POLICY IF EXISTS maintenance_work_order_evidence_delete
ON public.maintenance_work_order_evidence;

CREATE POLICY maintenance_work_order_evidence_delete
  ON public.maintenance_work_order_evidence
  FOR DELETE
  TO authenticated
  USING (
    public.has_hotel_permission(hotel_id, 'maintenance.update')
  );

DROP POLICY IF EXISTS maintenance_evidence_delete
ON storage.objects;

CREATE POLICY maintenance_evidence_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'maintenance-evidence'
    AND split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
    AND public.has_hotel_permission(
      split_part(name, '/', 1)::uuid,
      'maintenance.update'
    )
  );

COMMIT;
