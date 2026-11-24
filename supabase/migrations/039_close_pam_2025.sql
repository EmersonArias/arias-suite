-- Arias Suite — migración 039
-- Cierre histórico del plan 2025.
--
-- Regla:
--   Todo trabajo programado y toda OT preventiva del año lógico 2025
--   queda marcado como FINALIZADO/COMPLETED.
--
-- No se inventan fechas, usuarios ni observaciones de ejecución.
-- Se conserva la trazabilidad existente.
--
-- Debe ejecutarse después de 038.

BEGIN;

UPDATE public.maintenance_scheduled_jobs
SET status = 'COMPLETED',
    updated_at = now()
WHERE plan_year = 2025
  AND status <> 'COMPLETED';

UPDATE public.maintenance_work_orders
SET status = 'COMPLETED',
    updated_at = now()
WHERE scheduled_job_id IN (
  SELECT j.id
  FROM public.maintenance_scheduled_jobs j
  WHERE j.plan_year = 2025
)
AND status <> 'COMPLETED';

COMMIT;
