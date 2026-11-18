-- Arias Suite — migración 065
-- Corrige políticas RLS permisivas heredadas en el inventario de equipos y activos.
-- Hallazgo confirmado en Supabase el 2026-10-11:
--   * apparatus_registry tenía políticas *_public con USING/WITH CHECK (true)
--   * assets tenía políticas públicas con condiciones true
--   * anon y authenticated disponían de privilegios SQL de lectura y escritura
--
-- Las políticas *_authorized existentes para authenticated se conservan.
-- No modifica datos ni ninguna migración histórica.

BEGIN;

-- Quitar políticas públicas que permitirían saltarse la autorización por hotel.
DROP POLICY IF EXISTS apparatus_registry_select_public
  ON public.apparatus_registry;
DROP POLICY IF EXISTS apparatus_registry_insert_public
  ON public.apparatus_registry;
DROP POLICY IF EXISTS apparatus_registry_update_public
  ON public.apparatus_registry;
DROP POLICY IF EXISTS apparatus_registry_delete_public
  ON public.apparatus_registry;

DROP POLICY IF EXISTS "public read assets"
  ON public.assets;
DROP POLICY IF EXISTS "public insert assets"
  ON public.assets;
DROP POLICY IF EXISTS "public update assets"
  ON public.assets;

-- Eliminar privilegios heredados de PUBLIC y permisos directos de anon.
-- Se vuelven a conceder CRUD a authenticated de forma explícita; RLS seguirá
-- filtrando cada operación a través de las políticas *_authorized existentes.
REVOKE ALL PRIVILEGES
  ON TABLE public.apparatus_registry, public.assets
  FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.apparatus_registry, public.assets
  TO authenticated;

COMMIT;
