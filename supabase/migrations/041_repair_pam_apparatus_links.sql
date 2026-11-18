-- Arias Suite — migración 041
-- Corrección de asociaciones PAM -> equipos.
--
-- Regla:
--   La relación oficial con el equipo se toma de
--   pam_maintenance_plan_links.source_apparatus_id
--   y se resuelve contra apparatus_registry.source_id.
--   No se usan coincidencias por nombre.
--
-- Además, la trazabilidad del origen se conserva en las tablas PAM
-- y deja de mostrarse dentro de la descripción operativa del mantenimiento.
--
-- No modifica migraciones anteriores.

BEGIN;

UPDATE public.maintenance_plans AS mp
SET
  apparatus_registry_id = ar.id,
  description = NULL,
  updated_at = now()
FROM public.pam_maintenance_plan_links AS l
JOIN public.apparatus_registry AS ar
  ON ar.source_id = l.source_apparatus_id
WHERE l.maintenance_plan_id = mp.id
  AND ar.hotel_id = mp.hotel_id
  AND (
    mp.apparatus_registry_id IS DISTINCT FROM ar.id
    OR mp.description IS NOT NULL
  );

COMMIT;
