-- Arias Suite — migración 024
-- Motor final de alertas de vencimiento de mantenimiento.
--
-- Corrige la unicidad de OVERDUE_REVIEW y añade repetición configurable.
-- La migración 023 aporta el motor base; esta migración lo deja preparado
-- para la repetición periódica sin acumular alertas vencidas activas.
--
-- No modifica ni reejecuta migraciones anteriores.

BEGIN;

-- =========================================================
-- ÍNDICE DE ALERTAS DE CALENDARIO
-- =========================================================
-- UPCOMING_REVIEW y DUE_TODAY son estados únicos para una misma fecha.
-- OVERDUE_REVIEW puede generar nuevas notificaciones en días sucesivos,
-- por lo que no forma parte del índice único.

DROP INDEX IF EXISTS public.ux_maintenance_alert_date_state;

CREATE UNIQUE INDEX IF NOT EXISTS ux_maintenance_alert_date_state
  ON public.maintenance_alerts (
    maintenance_plan_id,
    alert_type,
    due_date
  )
  WHERE alert_type IN (
    'UPCOMING_REVIEW',
    'DUE_TODAY'
  );

-- =========================================================
-- REFRESCO DE ALERTAS POR FECHA
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
  days_overdue integer;
  days_before integer;
  repeat_days integer;
  last_overdue_alert_date date;
  should_create_overdue boolean;
  overdue_notifications_enabled boolean;
  desired_type text;
  desired_severity text;
  desired_title text;
  desired_message text;
  new_alert_id uuid;
  inserted_count integer := 0;
BEGIN
  -- En llamadas autenticadas solo se permiten hoteles accesibles.
  -- Durante migraciones/operaciones administrativas auth.uid() puede ser NULL.
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
    repeat_days := COALESCE(config_record.overdue_repeat_days, 2);
    overdue_notifications_enabled :=
      config_record.notify_when_overdue IS DISTINCT FROM false;

    desired_type := NULL;
    desired_severity := NULL;
    desired_title := NULL;
    desired_message := NULL;
    new_alert_id := NULL;

    -- =======================================================
    -- VENCIDO
    -- =======================================================
    IF plan_record.next_due_date < CURRENT_DATE THEN
      days_overdue := CURRENT_DATE - plan_record.next_due_date;
      should_create_overdue := overdue_notifications_enabled;

      IF should_create_overdue THEN
        -- Se consulta todo el histórico de alertas del mismo ciclo,
        -- no solo las activas. Así se evita repetir varias veces el mismo día
        -- aunque la alerta anterior ya haya sido resuelta.
        SELECT MAX(ma.triggered_at::date)
          INTO last_overdue_alert_date
        FROM public.maintenance_alerts ma
        WHERE ma.maintenance_plan_id = plan_record.id
          AND ma.alert_type = 'OVERDUE_REVIEW'
          AND ma.due_date = plan_record.next_due_date;

        IF last_overdue_alert_date IS NOT NULL
           AND CURRENT_DATE < last_overdue_alert_date + repeat_days
        THEN
          should_create_overdue := false;
        END IF;
      END IF;

      IF should_create_overdue THEN
        desired_type := 'OVERDUE_REVIEW';
        desired_severity := CASE
          WHEN days_overdue >= 7 THEN 'CRITICAL'
          ELSE 'WARNING'
        END;
        desired_title := plan_record.name || ' — mantenimiento vencido';
        desired_message :=
          'El mantenimiento previsto para ' ||
          to_char(plan_record.next_due_date, 'DD/MM/YYYY') ||
          ' lleva ' || days_overdue ||
          CASE WHEN days_overdue = 1 THEN ' día' ELSE ' días' END ||
          ' sin una ejecución real registrada.';
      END IF;

    -- =======================================================
    -- VENCE HOY
    -- =======================================================
    ELSIF plan_record.next_due_date = CURRENT_DATE THEN
      IF config_record.notify_on_due IS DISTINCT FROM false THEN
        desired_type := 'DUE_TODAY';
        desired_severity := 'WARNING';
        desired_title := plan_record.name || ' — vence hoy';
        desired_message :=
          'El mantenimiento está previsto para hoy. Registra la ejecución real cuando se haya realizado.';
      END IF;

    -- =======================================================
    -- PRÓXIMO
    -- =======================================================
    ELSIF plan_record.next_due_date <= CURRENT_DATE + days_before THEN
      desired_type := 'UPCOMING_REVIEW';
      desired_severity := 'INFO';
      desired_title := plan_record.name || ' — mantenimiento próximo';
      desired_message :=
        'El próximo mantenimiento está previsto para ' ||
        to_char(plan_record.next_due_date, 'DD/MM/YYYY') || '.';
    END IF;

    -- =======================================================
    -- CREAR ALERTA ACTUAL
    -- =======================================================
    IF desired_type = 'OVERDUE_REVIEW' THEN
      -- Las vencidas no tienen unicidad por índice porque deben repetirse.
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
      RETURNING id INTO new_alert_id;

      inserted_count := inserted_count + 1;

      -- Mantiene solo la notificación vencida más reciente como activa;
      -- las anteriores permanecen como histórico.
      UPDATE public.maintenance_alerts ma
      SET resolved_at = COALESCE(ma.resolved_at, now())
      WHERE ma.maintenance_plan_id = plan_record.id
        AND ma.alert_type = 'OVERDUE_REVIEW'
        AND ma.due_date = plan_record.next_due_date
        AND ma.resolved_at IS NULL
        AND ma.id <> new_alert_id;

    ELSIF desired_type IS NOT NULL THEN
      -- Para próximas/hoy, la unicidad del índice evita duplicados.
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
      ON CONFLICT DO NOTHING
      RETURNING id INTO new_alert_id;

      IF new_alert_id IS NOT NULL THEN
        inserted_count := inserted_count + 1;
      END IF;
    END IF;

    -- =======================================================
    -- CERRAR ESTADOS DE CALENDARIO OBSOLETOS
    -- =======================================================
    -- Importante: también cierra DUE_TODAY cuando el plan pasa a
    -- OVERDUE_REVIEW y cierra alertas si se desactiva su notificación.
    UPDATE public.maintenance_alerts ma
    SET resolved_at = COALESCE(ma.resolved_at, now())
    WHERE ma.maintenance_plan_id = plan_record.id
      AND ma.alert_type IN ('UPCOMING_REVIEW', 'DUE_TODAY')
      AND ma.resolved_at IS NULL
      AND (
        desired_type IS NULL
        OR ma.alert_type <> desired_type
        OR ma.due_date <> plan_record.next_due_date
      );

    -- Si el mantenimiento ya no está vencido, todas las alertas
    -- OVERDUE_REVIEW activas de ciclos anteriores quedan resueltas.
    IF plan_record.next_due_date >= CURRENT_DATE THEN
      UPDATE public.maintenance_alerts ma
      SET resolved_at = COALESCE(ma.resolved_at, now())
      WHERE ma.maintenance_plan_id = plan_record.id
        AND ma.alert_type = 'OVERDUE_REVIEW'
        AND ma.resolved_at IS NULL;
    ELSIF NOT overdue_notifications_enabled THEN
      -- Si el usuario desactiva los avisos de vencimiento, no se mantiene
      -- una alerta de vencido activa.
      UPDATE public.maintenance_alerts ma
      SET resolved_at = COALESCE(ma.resolved_at, now())
      WHERE ma.maintenance_plan_id = plan_record.id
        AND ma.alert_type = 'OVERDUE_REVIEW'
        AND ma.resolved_at IS NULL;
    END IF;
  END LOOP;

  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_maintenance_due_alerts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_maintenance_due_alerts(uuid) TO authenticated;

COMMIT;
