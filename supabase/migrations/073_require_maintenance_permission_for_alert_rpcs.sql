-- Arias Suite security audit follow-up (2026-10-13)
-- Restrict alert RPCs to users with maintenance.view and prevent authenticated
-- callers from using a NULL hotel to trigger a multi-hotel refresh.
-- Scheduled/service execution without auth.uid() retains its existing behavior.

CREATE OR REPLACE FUNCTION public.get_maintenance_alert_recipients(target_hotel_id uuid)
RETURNS TABLE(user_id uuid, full_name text, email text, role_code text, role_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT DISTINCT ON (p.id)
    p.id AS user_id,
    p.full_name,
    p.email,
    r.code AS role_code,
    r.name AS role_name
  FROM public.user_hotel_roles uhr
  JOIN public.profiles p
    ON p.id = uhr.user_id
  JOIN public.roles r
    ON r.id = uhr.role_id
  JOIN public.hotels h
    ON h.id = uhr.hotel_id
  WHERE uhr.hotel_id = target_hotel_id
    AND uhr.active IS NOT FALSE
    AND p.active = true
    AND p.account_status = 'ACTIVE'
    AND r.active = true
    AND r.code IN ('MAINTENANCE_CHIEF', 'TECHNICIAN', 'VIEWER')
    AND public.has_hotel_access(target_hotel_id)
    AND public.has_hotel_permission(target_hotel_id, 'maintenance.view')
  ORDER BY
    p.id,
    CASE r.code
      WHEN 'MAINTENANCE_CHIEF' THEN 1
      WHEN 'TECHNICIAN' THEN 2
      WHEN 'VIEWER' THEN 3
      ELSE 99
    END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_maintenance_due_alerts(target_hotel_id uuid DEFAULT NULL::uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  plan_record public.maintenance_plans%ROWTYPE;
  config_record public.maintenance_alert_configs%ROWTYPE;
  reference_date date;
  days_before integer;
  desired_type text;
  desired_severity text;
  desired_title text;
  desired_message text;
  inserted_count integer := 0;
BEGIN
  -- Authenticated callers must operate on one hotel and must be allowed to view
  -- its maintenance module. Scheduled/service execution (no auth.uid()) keeps
  -- the prior all-hotel cycle behavior.
  IF auth.uid() IS NOT NULL THEN
    IF target_hotel_id IS NULL THEN
      RAISE EXCEPTION 'Debes indicar un hotel para actualizar sus alertas.';
    END IF;

    IF NOT public.has_hotel_permission(target_hotel_id, 'maintenance.view') THEN
      RAISE EXCEPTION 'No tienes permiso para consultar las alertas de mantenimiento de este hotel.';
    END IF;
  END IF;

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
      AND COALESCE(mp.next_due_date, mp.start_date) IS NOT NULL
      AND (
        target_hotel_id IS NULL
        OR mp.hotel_id = target_hotel_id
      )
      AND (
        auth.uid() IS NULL
        OR public.has_hotel_access(mp.hotel_id)
      )
    ORDER BY mp.id
  LOOP
    reference_date := COALESCE(
      plan_record.next_due_date,
      plan_record.start_date
    );

    SELECT *
      INTO config_record
    FROM public.maintenance_alert_configs mac
    WHERE mac.maintenance_plan_id = plan_record.id;

    days_before := COALESCE(config_record.days_before, 7);

    desired_type := NULL;
    desired_severity := NULL;
    desired_title := NULL;
    desired_message := NULL;

    IF reference_date < CURRENT_DATE THEN
      IF config_record.notify_when_overdue IS DISTINCT FROM false THEN
        desired_type := 'OVERDUE_REVIEW';
        desired_severity := 'CRITICAL';
        desired_title := plan_record.name || ' — mantenimiento vencido';
        desired_message :=
          CASE
            WHEN plan_record.next_due_date IS NULL
              THEN 'La primera revisión prevista para ' ||
                   to_char(reference_date, 'DD/MM/YYYY') ||
                   ' todavía no tiene una ejecución real registrada.'
            ELSE
              'El mantenimiento previsto para ' ||
              to_char(reference_date, 'DD/MM/YYYY') ||
              ' todavía no tiene una ejecución real registrada.'
          END;
      END IF;

    ELSIF reference_date = CURRENT_DATE THEN
      IF config_record.notify_on_due IS DISTINCT FROM false THEN
        desired_type := 'DUE_TODAY';
        desired_severity := 'WARNING';
        desired_title := plan_record.name || ' — revisión prevista hoy';
        desired_message :=
          CASE
            WHEN plan_record.next_due_date IS NULL
              THEN 'La primera revisión del mantenimiento está prevista para hoy. Registra la ejecución real cuando se haya realizado.'
            ELSE
              'El mantenimiento está previsto para hoy. Registra la ejecución real cuando se haya realizado.'
          END;
      END IF;

    ELSIF reference_date <= CURRENT_DATE + days_before THEN
      desired_type := 'UPCOMING_REVIEW';
      desired_severity := 'INFO';
      desired_title := plan_record.name || ' — mantenimiento próximo';
      desired_message :=
        'El próximo mantenimiento está previsto para ' ||
        to_char(reference_date, 'DD/MM/YYYY') || '.';
    END IF;

    IF desired_type IS NOT NULL THEN
      -- Transaction-scoped lock for each logical alert key.
      PERFORM pg_advisory_xact_lock(
        hashtextextended(
          plan_record.id::text || ':' ||
          desired_type || ':' ||
          to_char(reference_date, 'YYYY-MM-DD'),
          0
        )
      );

      IF NOT EXISTS (
        SELECT 1
        FROM public.maintenance_alerts ma
        WHERE ma.maintenance_plan_id = plan_record.id
          AND ma.alert_type = desired_type
          AND ma.due_date = reference_date
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
          reference_date
        )
        ON CONFLICT DO NOTHING;

        IF FOUND THEN
          inserted_count := inserted_count + 1;
        END IF;
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
        OR ma.due_date <> reference_date
      );
  END LOOP;

  RETURN inserted_count;
END;
$function$;
