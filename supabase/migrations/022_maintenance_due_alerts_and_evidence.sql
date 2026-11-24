-- Arias Suite — migración 022
-- Alertas automáticas por fecha de vencimiento y almacenamiento de evidencias.
--
-- No modifica ni reejecuta migraciones anteriores.

BEGIN;

-- =========================================================
-- ALERTAS DE CALENDARIO DE MANTENIMIENTO
-- =========================================================

CREATE UNIQUE INDEX IF NOT EXISTS ux_maintenance_alert_date_state
  ON public.maintenance_alerts (
    maintenance_plan_id,
    alert_type,
    due_date
  )
  WHERE alert_type IN (
    'UPCOMING_REVIEW',
    'DUE_TODAY',
    'OVERDUE_REVIEW'
  );

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
  alert_days_before integer;
  desired_type text;
  desired_severity text;
  desired_title text;
  desired_message text;
  inserted_count integer := 0;
BEGIN
  -- En una ejecución autenticada se valida el acceso al hotel.
  -- Durante una migración/operación administrativa auth.uid() puede ser NULL;
  -- en ese caso la propia operación se considera confiable.
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
        target_hotel_id IS NULL
        OR public.has_hotel_access(mp.hotel_id)
      )
  LOOP
    SELECT COALESCE(mac.days_before, 7)
      INTO alert_days_before
    FROM public.maintenance_alert_configs mac
    WHERE mac.maintenance_plan_id = plan_record.id;

    IF plan_record.next_due_date < CURRENT_DATE THEN
      desired_type := 'OVERDUE_REVIEW';
      desired_severity := 'CRITICAL';
      desired_title := plan_record.name || ' — mantenimiento vencido';
      desired_message :=
        'El mantenimiento previsto para ' ||
        to_char(plan_record.next_due_date, 'DD/MM/YYYY') ||
        ' todavía no tiene una ejecución real registrada.';
    ELSIF plan_record.next_due_date = CURRENT_DATE THEN
      desired_type := 'DUE_TODAY';
      desired_severity := 'WARNING';
      desired_title := plan_record.name || ' — vence hoy';
      desired_message :=
        'El mantenimiento está previsto para hoy. Registra la ejecución real cuando se haya realizado.';
    ELSIF plan_record.next_due_date <= CURRENT_DATE + alert_days_before THEN
      desired_type := 'UPCOMING_REVIEW';
      desired_severity := 'INFO';
      desired_title := plan_record.name || ' — mantenimiento próximo';
      desired_message :=
        'El próximo mantenimiento está previsto para ' ||
        to_char(plan_record.next_due_date, 'DD/MM/YYYY') ||
        '.';
    ELSE
      desired_type := NULL;
      desired_severity := NULL;
      desired_title := NULL;
      desired_message := NULL;
    END IF;

    IF desired_type IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.maintenance_alerts ma
        WHERE ma.maintenance_plan_id = plan_record.id
          AND ma.alert_type = desired_type
          AND ma.due_date = plan_record.next_due_date
          AND ma.resolved_at IS NULL
      ) THEN
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
        );
        inserted_count := inserted_count + 1;
      END IF;
    END IF;

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

-- Genera el estado inicial de alertas para los planes que ya existen.
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

-- =========================================================
-- EVIDENCIAS DE EJECUCIONES
-- =========================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('maintenance-evidence', 'maintenance-evidence', false)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = false;

DROP POLICY IF EXISTS maintenance_evidence_select
ON storage.objects;

CREATE POLICY maintenance_evidence_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'maintenance-evidence'
    AND split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
    AND public.has_hotel_permission(
      split_part(name, '/', 1)::uuid,
      'maintenance.view'
    )
  );

DROP POLICY IF EXISTS maintenance_evidence_insert
ON storage.objects;

CREATE POLICY maintenance_evidence_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'maintenance-evidence'
    AND split_part(name, '/', 1) ~* '^[0-9a-f-]{36}$'
    AND public.has_hotel_permission(
      split_part(name, '/', 1)::uuid,
      'maintenance.update'
    )
  );

COMMIT;
