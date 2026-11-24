-- Arias Suite — migración 038
-- Corrección de año lógico del PAM importado.
--
-- El archivo/fuente está etiquetado como 2025, pero el usuario confirma
-- que el PAM corresponde al plan de mantenimiento 2026.
--
-- Regla:
--   - NO se modifica la trazabilidad del archivo original (source_version).
--   - Se corrige únicamente el plan_year lógico de 2025 -> 2026.
--   - Se actualizan las capas derivadas ya materializadas para mantener
--     todo el circuito coherente.
--   - No modifica ni reejecuta migraciones anteriores.

BEGIN;

-- 1. Fuente original: el archivo mantiene su nombre/versionado histórico.
UPDATE public.pam_source_groups
SET plan_year = 2026
WHERE source_version = 'R-SSTT-01-01_PLAN_ANUAL_2025_v20260927'
  AND plan_year = 2025;

UPDATE public.pam_source_marks
SET plan_year = 2026
WHERE source_version = 'R-SSTT-01-01_PLAN_ANUAL_2025_v20260927'
  AND plan_year = 2025;

-- 2. Enlaces PAM -> mantenimiento.
UPDATE public.pam_maintenance_plan_links
SET plan_year = 2026
WHERE source_group_id IN (
  SELECT psg.id
  FROM public.pam_source_groups psg
  WHERE psg.source_version = 'R-SSTT-01-01_PLAN_ANUAL_2025_v20260927'
)
AND plan_year = 2025;

-- 3. Trabajos programados ya materializados.
UPDATE public.maintenance_scheduled_jobs
SET plan_year = 2026
WHERE source_mark_id IN (
  SELECT psm.id
  FROM public.pam_source_marks psm
  WHERE psm.source_version = 'R-SSTT-01-01_PLAN_ANUAL_2025_v20260927'
)
AND plan_year = 2025;

-- 4. Los códigos internos de los planes también deben reflejar el año lógico.
UPDATE public.maintenance_plans mp
SET code = replace(mp.code, 'PAM-2025-', 'PAM-2026-'),
    updated_at = now()
WHERE mp.code LIKE 'PAM-2025-%'
  AND EXISTS (
    SELECT 1
    FROM public.pam_maintenance_plan_links l
    JOIN public.pam_source_groups psg
      ON psg.id = l.source_group_id
    WHERE l.maintenance_plan_id = mp.id
      AND l.plan_year = 2026
      AND psg.source_version = 'R-SSTT-01-01_PLAN_ANUAL_2025_v20260927'
  );

COMMIT;
