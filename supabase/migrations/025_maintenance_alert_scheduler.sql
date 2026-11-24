-- Arias Suite — migración 025
-- Ejecución automática server-side del motor de alertas de mantenimiento.
--
-- El estado de alertas no depende de que React esté abierto.
-- Supabase Cron ejecuta periódicamente el ciclo directamente en PostgreSQL.
--
-- No modifica ni reejecuta migraciones anteriores.

BEGIN;

-- =========================================================
-- CICLO GLOBAL DE ALERTAS
-- =========================================================

CREATE OR REPLACE FUNCTION public.run_maintenance_alert_cycle()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  hotel_record public.hotels%ROWTYPE;
  inserted_count integer := 0;
BEGIN
  -- Solo se procesan hoteles activos.
  FOR hotel_record IN
    SELECT *
    FROM public.hotels
    WHERE active = true
  LOOP
    inserted_count := inserted_count
      + public.refresh_maintenance_due_alerts(hotel_record.id);
  END LOOP;

  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.run_maintenance_alert_cycle() FROM PUBLIC;

-- =========================================================
-- SUPABASE CRON
-- =========================================================
-- pg_cron es la ejecución server-side. El job se ejecuta cada hora,
-- suficiente para mantener los estados de fecha actualizados y respetar
-- la repetición diaria o superior configurada para los vencimientos.

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  SELECT jobid
    INTO existing_job_id
  FROM cron.job
  WHERE jobname = 'arias-maintenance-alert-cycle'
  LIMIT 1;

  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;

  PERFORM cron.schedule(
    'arias-maintenance-alert-cycle',
    '5 * * * *',
    'SELECT public.run_maintenance_alert_cycle();'
  );
END;
$$;

COMMIT;
