-- Arias Suite — migración 048
-- Normaliza el nombre operativo del mantenimiento preventivo diario/semanal.
--
-- Regla:
--   1 día   -> PREVENTIVO DIARIO
--   1 semana -> PREVENTIVO SEMANAL
--
-- También corrige los títulos de las OT existentes que heredaron el nombre
-- anterior.
--
-- No modifica la fuente histórica de origen.

BEGIN;

UPDATE public.maintenance_plans
SET name = CASE
  WHEN periodicity_unit = 'DAY' AND periodicity_value = 1
    THEN 'PREVENTIVO DIARIO'
  WHEN periodicity_unit = 'WEEK' AND periodicity_value = 1
    THEN 'PREVENTIVO SEMANAL'
  ELSE regexp_replace(trim(name), '^_+', '')
END
WHERE lower(trim(name)) IN (
  '_preventivo diario/semanal',
  'preventivo diario/semanal'
);

UPDATE public.maintenance_work_orders wo
SET title = wo.ot_number || ' — ' || mp.name,
    updated_at = now()
FROM public.maintenance_plans mp
WHERE mp.id = wo.maintenance_plan_id
  AND lower(trim(mp.name)) IN (
    'preventivo diario',
    'preventivo semanal'
  )
  AND (
    wo.title ILIKE '%_PREVENTIVO DIARIO/SEMANAL'
    OR wo.title ILIKE '%PREVENTIVO DIARIO/SEMANAL'
    OR wo.title = '_PREVENTIVO DIARIO/SEMANAL'
    OR wo.title = 'PREVENTIVO DIARIO/SEMANAL'
  );

COMMIT;
