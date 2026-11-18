-- =========================================================
-- 053 — GENERACIÓN INMEDIATA DE LA SIGUIENTE OT PREVENTIVA
-- =========================================================
-- Regla:
--   Cuando una ejecución válida cierra una OT preventiva y recalcula
--   maintenance_plans.next_due_date, la siguiente OT debe quedar
--   creada inmediatamente, sin esperar al cron horario.
--
-- El cron horario de la 046/052 se mantiene como red de seguridad:
-- si por cualquier motivo una generación no se ejecuta en el flujo de
-- cierre, el proceso horario podrá recuperar la OT pendiente de generar.
--
-- Se usa un CONSTRAINT TRIGGER DEFERRABLE INITIALLY DEFERRED para que
-- esta acción se ejecute al final de la transacción, después de los
-- triggers normales que:
--   1) enlazan la ejecución con su OT;
--   2) cierran la OT;
--   3) recalculan next_due_date.
--
-- No modifica migraciones anteriores.

BEGIN;

-- =========================================================
-- GENERAR LA SIGUIENTE OT CUANDO CAMBIA EL CICLO REAL
-- =========================================================

CREATE OR REPLACE FUNCTION public.generate_next_maintenance_work_order_after_execution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Solo una ejecución válida puede abrir el siguiente ciclo.
  -- CANCELLED / No realizada no mueve el ciclo.
  IF NEW.executed_at IS NOT NULL
     AND NEW.result <> 'CANCELLED'
  THEN
    PERFORM public.generate_maintenance_work_orders();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_next_maintenance_work_order_after_execution()
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.generate_next_maintenance_work_order_after_execution()
TO authenticated;

DROP TRIGGER IF EXISTS trg_generate_next_maintenance_work_order_after_execution
ON public.maintenance_executions;

CREATE CONSTRAINT TRIGGER trg_generate_next_maintenance_work_order_after_execution
AFTER INSERT OR UPDATE OF work_order_id, scheduled_date, executed_at, result
ON public.maintenance_executions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.generate_next_maintenance_work_order_after_execution();

COMMENT ON FUNCTION public.generate_next_maintenance_work_order_after_execution() IS
'Genera inmediatamente la siguiente OT preventiva al finalizar una ejecución válida. El cron horario permanece como mecanismo de recuperación.';

-- =========================================================
-- RECUPERACIÓN INICIAL
-- =========================================================
-- La OT de prueba ya completada puede haber dejado next_due_date
-- calculada sin una nueva OT. Esta ejecución inicial sincroniza el
-- estado actual de todos los planes configurados en AUTO.

DO $$
BEGIN
  PERFORM public.generate_maintenance_work_orders();
END;
$$;

COMMIT;
