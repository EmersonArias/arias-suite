-- Arias Suite — migración 023
-- Motor base de alertas de mantenimiento por fecha.
--
-- La repetición de alertas OVERDUE_REVIEW se incorpora en la migración 024.
-- No modifica ni reejecuta migraciones anteriores.

BEGIN;

-- =========================================================
-- MOTOR BASE DE ALERTAS DE CALENDARIO
-- =========================================================

CREATE OR REPLACE FUNCTION public.refresh_maintenance_due_alerts(
  target_hotel_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  plan_record public.maintenance_plans%ROWTYPE;
  config_record public.maintenance_alert_configs%ROWTYPE;
  days_before integer;
  desired_type text;
  desired_severity text;
  desired_title text;
  desired_message text;
  inserted_count integer := 0;
BEGIN
  -- En una llamada autenticada se comprueba el acceso solicitado.
  -- Durante migraciones/operaciones administrativas auth.uid() puede ser NULL
  -- y, en ese caso, la operación se considera confiable.
  IF target_hotel_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND NOT public.has_hotel_access(target_hotel_id)
  THEN
    RAISE EXCEPTION 'No tienes acceso al hotel solicitado.';
  END IF;

  FOR plan_record IN
    SELECT mp.*
    FROM public.maintenance_plans mp
    WHERE mp.active = true
      AND mp.next_due_date IS NOT NULL
      AND (
        target_hotel_id IS NULL
        OR mp.hotel_id = target_hotel_id
      )
      AND (
        auth.uid() IS NULL
        OR public.has_hotel_access(mp.hotel_id)
      )
  LOOP
    SELECT *
      INTO config_record
    FROM public.maintenance_alert_configs mac
    WHERE mac.maintenance_plan_id = plan_record.id;

    days_before := COALESCE(config_record.days_before, 7);

    desired_type := NULL;
    desired_severity := NULL;
    desired_title := NULL;
    desired_message := NULL;

    IF plan_record.next_due_date < CURRENT_DATE THEN
      IF config_record.notify_when_overdue IS DISTINCT FROM false THEN
        desired_type := 'OVERDUE_REVIEW';
        desired_severity := 'CRITICAL';
        desired_title := plan_record.name || ' — mantenimiento vencido';
        desired_message :=
          'El mantenimiento previsto para ' ||
          to_char(plan_record.next_due_date, 'DD/MM/YYYY') ||
          ' todavía no tiene una ejecución real registrada.';
      END IF;

    ELSIF plan_record.next_due_date = CURRENT_DATE THEN
      IF config_record.notify_on_due IS DISTINCT FROM false THEN
        desired_type := 'DUE_TODAY';
        desired_severity := 'WARNING';
        desired_title := plan_record.name || ' — vence hoy';
        desired_message :=
          'El mantenimiento está previsto para hoy. Registra la ejecución real cuando se haya realizado.';
      END IF;

    ELSIF plan_record.next_due_date <= CURRENT_DATE + days_before THEN
      desired_type := 'UPCOMING_REVIEW';
      desired_severity := 'INFO';
      desired_title := plan_record.name || ' — mantenimiento próximo';
      desired_message :=
        'El próximo mantenimiento está previsto para ' ||
        to_char(plan_record.next_due_date, 'DD/MM/YYYY') || '.';
    END IF;

    IF desired_type IS NOT NULL THEN
      INSERT INTO public.maintenance_alerts (
        hotel_id,
        maintenance_plan_id,
        alert_type,
        severity,
        title,
        message,
        due_date
      )
      VALUES (
        plan_record.hotel_id,
        plan_record.id,
        desired_type,
        desired_severity,
        desired_title,
        desired_message,
        plan_record.next_due_date
      )
      ON CONFLICT DO NOTHING;

      IF FOUND THEN
        inserted_count := inserted_count + 1;
      END IF;
    END IF;

    -- Cierra alertas de calendario que ya no representan el estado actual.
    UPDATE public.maintenance_alerts ma
    SET resolved_at = COALESCE(ma.resolved_at, now())
    WHERE ma.maintenance_plan_id = plan_record.id
      AND ma.alert_type IN (
        'UPCOMING_REVIEW',
        'DUE_TODAY',
        'OVERDUE_REVIEW'
      )
      AND ma.resolved_at IS NULL
      AND (
        desired_type IS NULL
        OR ma.alert_type <> desired_type
        OR ma.due_date <> plan_record.next_due_date
      );
  END LOOP;

  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_maintenance_due_alerts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_maintenance_due_alerts(uuid) TO authenticated;

-- Mantiene las alertas de calendario actualizadas cuando cambia un plan.
CREATE OR REPLACE FUNCTION public.trg_refresh_maintenance_due_alerts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.refresh_maintenance_due_alerts(NEW.hotel_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_maintenance_due_alerts
ON public.maintenance_plans;

CREATE TRIGGER trg_refresh_maintenance_due_alerts
AFTER INSERT OR UPDATE OF next_due_date, active, start_date
ON public.maintenance_plans
FOR EACH ROW
EXECUTE FUNCTION public.trg_refresh_maintenance_due_alerts();

REVOKE ALL ON FUNCTION public.trg_refresh_maintenance_due_alerts() FROM PUBLIC;

-- Genera el estado inicial de alertas para los hoteles activos.
DO $$
DECLARE
  hotel_record public.hotels%ROWTYPE;
BEGIN
  FOR hotel_record IN
    SELECT *
    FROM public.hotels
    WHERE active = true
  LOOP
    PERFORM public.refresh_maintenance_due_alerts(hotel_record.id);
  END LOOP;
END;
$$;

COMMIT;
