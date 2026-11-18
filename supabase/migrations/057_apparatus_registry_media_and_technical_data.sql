-- Arias Suite — migración 057
-- Mejora la ficha maestra de Equipos e instalaciones:
-- fotografías clasificadas, datos técnicos adaptativos y documentación en Storage privado.
-- No modifica ninguna migración anterior.

BEGIN;

ALTER TABLE public.apparatus_registry
  ADD COLUMN IF NOT EXISTS technical_data jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Las fotografías pasan de una lista simple de URLs a objetos estructurados:
-- { id, category, url }.
-- Las fotografías existentes se conservan y se clasifican inicialmente como GENERAL.
UPDATE public.apparatus_registry
SET photos = (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', gen_random_uuid(),
        'category', 'GENERAL',
        'url', value
      )
      ORDER BY ord
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements_text(photos) WITH ORDINALITY AS elements(value, ord)
)
WHERE jsonb_typeof(photos) = 'array'
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(photos) AS element
    WHERE jsonb_typeof(element) <> 'string'
  );

-- Bucket privado para manuales, fichas, certificados, esquemas e informes.
INSERT INTO storage.buckets (id, name, public)
VALUES ('apparatus-registry-documents', 'apparatus-registry-documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS apparatus_registry_documents_select
ON storage.objects;

CREATE POLICY apparatus_registry_documents_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'apparatus-registry-documents'
    AND split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
    AND EXISTS (
      SELECT 1
      FROM public.apparatus_registry ar
      WHERE ar.id = split_part(name, '/', 1)::uuid
        AND public.has_hotel_permission(ar.hotel_id, 'apparatusregistry.view')
    )
  );

DROP POLICY IF EXISTS apparatus_registry_documents_insert
ON storage.objects;

CREATE POLICY apparatus_registry_documents_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'apparatus-registry-documents'
    AND split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
    AND EXISTS (
      SELECT 1
      FROM public.apparatus_registry ar
      WHERE ar.id = split_part(name, '/', 1)::uuid
        AND public.has_hotel_permission(ar.hotel_id, 'apparatusregistry.update')
    )
  );

DROP POLICY IF EXISTS apparatus_registry_documents_delete
ON storage.objects;

CREATE POLICY apparatus_registry_documents_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'apparatus-registry-documents'
    AND split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
    AND EXISTS (
      SELECT 1
      FROM public.apparatus_registry ar
      WHERE ar.id = split_part(name, '/', 1)::uuid
        AND public.has_hotel_permission(ar.hotel_id, 'apparatusregistry.update')
    )
  );

CREATE INDEX IF NOT EXISTS ix_apparatus_registry_technical_data
  ON public.apparatus_registry (hotel_id)
  WHERE technical_data <> '[]'::jsonb;

COMMIT;
