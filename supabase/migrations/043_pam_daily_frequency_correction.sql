-- Arias Suite — migración 043
-- Corrección de periodicidad de los trabajos del módulo PAM > Diario.
--
-- La matriz de origen contiene las filas 6, 7 y 8 como trabajos del bloque
-- preventivo que estamos trabajando en el módulo Diario.
-- La materialización anterior interpretó sus 48 posiciones anuales como
-- periodicidad semanal. En el módulo Diario esa clasificación es incorrecta.
--
-- Se corrige únicamente la periodicidad del plan materializado.
-- La trazabilidad del PAM, filas, marcas y source_id permanece intacta.
-- No modifica ni reejecuta migraciones anteriores.

BEGIN;

UPDATE public.maintenance_plans mp
SET
  periodicity_value = 1,
  periodicity_unit = 'DAY',
  updated_at = now()
FROM public.pam_maintenance_plan_links l
JOIN public.pam_source_groups psg
  ON psg.id = l.source_group_id
WHERE l.maintenance_plan_id = mp.id
  AND l.plan_year = 2026
  AND psg.plan_year = 2026
  AND psg.source_row IN (6, 7, 8)
  AND l.mark_code = 'F'
  AND mp.active = true
  AND (
    mp.periodicity_value IS DISTINCT FROM 1
    OR mp.periodicity_unit IS DISTINCT FROM 'DAY'
  );

COMMIT;