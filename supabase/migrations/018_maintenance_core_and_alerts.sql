-- Arias Suite — migración 018
-- Núcleo de mantenimiento programado, ejecuciones, controles y alertas.
--
-- No modifica ni reejecuta migraciones anteriores.
-- La información de estado se deriva de las ejecuciones reales y de las fechas
-- programadas; no existe un campo manual "revisado".

BEGIN;

-- =========================================================
-- PERMISOS DEL NÚCLEO DE MANTENIMIENTO
-- =========================================================

INSERT INTO public.permissions (code, name, module, action, description)
VALUES
  (
    'maintenance.view',
    'Consultar mantenimientos',
    'maintenance',
    'view',
    'Permite consultar planes, ejecuciones, controles y alertas de mantenimiento.'
  ),
  (
    'maintenance.create',
    'Crear mantenimientos',
    'maintenance',
    'create',
    'Permite crear planes de mantenimiento y sus controles.'
  ),
  (
    'maintenance.update',
    'Modificar mantenimientos',
    'maintenance',
    'update',
    'Permite modificar planes, controles y configuraciones de avisos.'
  ),
  (
    'maintenance.delete',
    'Eliminar mantenimientos',
    'maintenance',
    'delete',
    'Permite eliminar planes de mantenimiento cuando corresponda según las reglas de borrado.'
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  action = EXCLUDED.action,
  description = EXCLUDED.description;

-- Por defecto, los responsables SSTT pueden consultar y modificar
-- el núcleo de mantenimiento. La administración de cliente también puede
-- consultarlo y administrarlo dentro de sus hoteles.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code IN ('CLIENT_ADMIN', 'MAINTENANCE_CHIEF', 'TECHNICIAN')
  AND p.module = 'maintenance'
  AND p.action IN ('view', 'create', 'update')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'VIEWER'
  AND p.code = 'maintenance.view'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'CLIENT_ADMIN'
  AND p.code = 'maintenance.delete'
ON CONFLICT DO NOTHING;

-- =========================================================
-- MÓDULO DE MANTENIMIENTO EN LA LICENCIA DE EVALUACIÓN ACTUAL
-- =========================================================

INSERT INTO public.tenant_contract_modules (
  contract_id,
  module_code,
  active
)
SELECT
  tc.id,
  'maintenance',
  true
FROM public.tenant_contracts tc
WHERE tc.contract_code = 'EVAL-SBH-SBDZ-2026-01'
ON CONFLICT (contract_id, module_code) DO UPDATE SET
  active = true;

-- =========================================================
-- PLANES DE MANTENIMIENTO
-- =========================================================

CREATE TABLE IF NOT EXISTS public.maintenance_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE RESTRICT,
  apparatus_registry_id uuid REFERENCES public.apparatus_registry(id) ON DELETE RESTRICT,
  code text,
  name text NOT NULL,
  description text,
  maintenance_type text NOT NULL DEFAULT 'INTERNAL',
  external_company text,
  periodicity_value integer,
  periodicity_unit text,
  start_date date,
  next_due_date date,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_plans_type_check
    CHECK (maintenance_type IN ('INTERNAL', 'EXTERNAL')),
  CONSTRAINT maintenance_plans_periodicity_value_check
    CHECK (
      periodicity_value IS NULL
      OR periodicity_value > 0
    ),
  CONSTRAINT maintenance_plans_periodicity_unit_check
    CHECK (
      periodicity_unit IS NULL
      OR periodicity_unit IN ('DAY', 'WEEK', 'MONTH', 'YEAR', 'VARIABLE')
    )
);

CREATE INDEX IF NOT EXISTS ix_maintenance_plans_hotel_id
  ON public.maintenance_plans (hotel_id);

CREATE INDEX IF NOT EXISTS ix_maintenance_plans_apparatus_registry_id
  ON public.maintenance_plans (apparatus_registry_id);

CREATE INDEX IF NOT EXISTS ix_maintenance_plans_next_due_date
  ON public.maintenance_plans (hotel_id, next_due_date)
  WHERE active = true;

-- =========================================================
-- CONTROLES / TARJETAS DE UNA REVISIÓN
-- =========================================================

CREATE TABLE IF NOT EXISTS public.maintenance_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_plan_id uuid NOT NULL REFERENCES public.maintenance_plans(id) ON DELETE CASCADE,
  code text,
  label text NOT NULL,
  description text,
  input_type text NOT NULL DEFAULT 'NUMBER',
  unit text,
  min_value numeric,
  max_value numeric,
  required boolean NOT NULL DEFAULT true,
  alert_on_out_of_range boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_controls_input_type_check
    CHECK (
      input_type IN ('NUMBER', 'TEXT', 'BOOLEAN', 'DATE', 'TIME', 'SELECT')
    ),
  CONSTRAINT maintenance_controls_range_check
    CHECK (
      min_value IS NULL
      OR max_value IS NULL
      OR min_value <= max_value
    )
);

CREATE INDEX IF NOT EXISTS ix_maintenance_controls_plan_id
  ON public.maintenance_controls (maintenance_plan_id, sort_order);

-- =========================================================
-- EJECUCIONES REALES
-- =========================================================

CREATE TABLE IF NOT EXISTS public.maintenance_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_plan_id uuid NOT NULL REFERENCES public.maintenance_plans(id) ON DELETE RESTRICT,
  scheduled_date date,
  executed_at timestamptz,
  executed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  performer_name text,
  performer_company text,
  result text NOT NULL DEFAULT 'COMPLETED',
  observations text,
  evidence_files jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_executions_result_check
    CHECK (
      result IN (
        'COMPLETED',
        'COMPLETED_WITH_ISSUES',
        'NOT_CONFORM',
        'CANCELLED'
      )
    )
);

CREATE INDEX IF NOT EXISTS ix_maintenance_executions_plan_id
  ON public.maintenance_executions (maintenance_plan_id, executed_at DESC);

-- =========================================================
-- RESULTADOS DE CADA CONTROL / TARJETA
-- =========================================================

CREATE TABLE IF NOT EXISTS public.maintenance_control_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES public.maintenance_executions(id) ON DELETE CASCADE,
  maintenance_control_id uuid NOT NULL REFERENCES public.maintenance_controls(id) ON DELETE RESTRICT,
  numeric_value numeric,
  text_value text,
  boolean_value boolean,
  date_value date,
  time_value time,
  selected_value text,
  status text NOT NULL DEFAULT 'COMPLIANT',
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_control_results_status_check
    CHECK (
      status IN (
        'COMPLIANT',
        'OUT_OF_RANGE',
        'NOT_COMPLETED'
      )
    ),
  CONSTRAINT maintenance_control_results_single_value_check
    CHECK (
      num_nonnulls(
        numeric_value,
        text_value,
        boolean_value,
        date_value,
        time_value,
        selected_value
      ) <= 1
    ),
  CONSTRAINT maintenance_control_results_unique_control
    UNIQUE (execution_id, maintenance_control_id)
);

CREATE INDEX IF NOT EXISTS ix_maintenance_control_results_execution_id
  ON public.maintenance_control_results (execution_id);

CREATE INDEX IF NOT EXISTS ix_maintenance_control_results_status
  ON public.maintenance_control_results (status)
  WHERE status = 'OUT_OF_RANGE';

-- =========================================================
-- CONFIGURACIÓN DE AVISOS
-- =========================================================

CREATE TABLE IF NOT EXISTS public.maintenance_alert_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_plan_id uuid NOT NULL REFERENCES public.maintenance_plans(id) ON DELETE CASCADE,
  email_enabled boolean NOT NULL DEFAULT false,
  days_before integer NOT NULL DEFAULT 7,
  notify_on_due boolean NOT NULL DEFAULT true,
  notify_when_overdue boolean NOT NULL DEFAULT true,
  overdue_repeat_days integer NOT NULL DEFAULT 2,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_alert_configs_days_before_check
    CHECK (days_before >= 0),
  CONSTRAINT maintenance_alert_configs_overdue_repeat_days_check
    CHECK (overdue_repeat_days >= 1),
  CONSTRAINT maintenance_alert_configs_plan_unique
    UNIQUE (maintenance_plan_id)
);

-- Usuarios SSTT del hotel que recibirán el aviso.
-- La lista disponible en la UI se obtendrá dinámicamente a partir de
-- MAINTENANCE_CHIEF, TECHNICIAN y VIEWER asignados al hotel.
CREATE TABLE IF NOT EXISTS public.maintenance_alert_users (
  alert_config_id uuid NOT NULL REFERENCES public.maintenance_alert_configs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (alert_config_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_maintenance_alert_users_user_id
  ON public.maintenance_alert_users (user_id);

-- Correos adicionales externos. Una configuración puede tener uno o varios.
CREATE TABLE IF NOT EXISTS public.maintenance_alert_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_config_id uuid NOT NULL REFERENCES public.maintenance_alert_configs(id) ON DELETE CASCADE,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_alert_emails_email_check
    CHECK (
      length(btrim(email)) BETWEEN 3 AND 320
      AND position('@' in email) > 1
    ),
  CONSTRAINT maintenance_alert_emails_unique
    UNIQUE (alert_config_id, email)
);

CREATE INDEX IF NOT EXISTS ix_maintenance_alert_emails_config_id
  ON public.maintenance_alert_emails (alert_config_id);

-- =========================================================
-- ALERTAS GENERADAS
-- =========================================================

CREATE TABLE IF NOT EXISTS public.maintenance_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE RESTRICT,
  maintenance_plan_id uuid NOT NULL REFERENCES public.maintenance_plans(id) ON DELETE RESTRICT,
  maintenance_execution_id uuid REFERENCES public.maintenance_executions(id) ON DELETE SET NULL,
  maintenance_control_id uuid REFERENCES public.maintenance_controls(id) ON DELETE SET NULL,
  alert_type text NOT NULL,
  severity text NOT NULL DEFAULT 'WARNING',
  title text NOT NULL,
  message text NOT NULL,
  due_date date,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_alerts_type_check
    CHECK (
      alert_type IN (
        'UPCOMING_REVIEW',
        'DUE_TODAY',
        'OVERDUE_REVIEW',
        'OUT_OF_RANGE'
      )
    ),
  CONSTRAINT maintenance_alerts_severity_check
    CHECK (
      severity IN ('INFO', 'WARNING', 'CRITICAL')
    )
);

CREATE INDEX IF NOT EXISTS ix_maintenance_alerts_hotel_status
  ON public.maintenance_alerts (hotel_id, resolved_at, severity, triggered_at DESC);

CREATE INDEX IF NOT EXISTS ix_maintenance_alerts_plan_id
  ON public.maintenance_alerts (maintenance_plan_id, triggered_at DESC);

-- =========================================================
-- AYUDA: DESTINATARIOS SSTT DISPONIBLES PARA UN HOTEL
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_maintenance_alert_recipients(
  target_hotel_id uuid
)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  role_code text,
  role_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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
  ORDER BY
    p.id,
    CASE r.code
      WHEN 'MAINTENANCE_CHIEF' THEN 1
      WHEN 'TECHNICIAN' THEN 2
      WHEN 'VIEWER' THEN 3
      ELSE 99
    END;
$$;

REVOKE ALL ON FUNCTION public.get_maintenance_alert_recipients(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_maintenance_alert_recipients(uuid) TO authenticated;

-- =========================================================
-- VALIDACIÓN DE DESTINATARIOS
-- =========================================================

CREATE OR REPLACE FUNCTION public.validate_maintenance_alert_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_hotel_id uuid;
  valid_recipient boolean;
BEGIN
  SELECT mac.maintenance_plan_id
    INTO target_hotel_id
  FROM public.maintenance_alert_configs mac
  WHERE mac.id = NEW.alert_config_id;

  SELECT mp.hotel_id
    INTO target_hotel_id
  FROM public.maintenance_alert_configs mac
  JOIN public.maintenance_plans mp
    ON mp.id = mac.maintenance_plan_id
  WHERE mac.id = NEW.alert_config_id;

  IF target_hotel_id IS NULL THEN
    RAISE EXCEPTION 'La configuración de alertas no está vinculada a un hotel válido.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_hotel_roles uhr
    JOIN public.roles r
      ON r.id = uhr.role_id
     AND r.active = true
    JOIN public.profiles p
      ON p.id = uhr.user_id
     AND p.active = true
     AND p.account_status = 'ACTIVE'
    WHERE uhr.user_id = NEW.user_id
      AND uhr.hotel_id = target_hotel_id
      AND uhr.active IS NOT FALSE
      AND r.code IN ('MAINTENANCE_CHIEF', 'TECHNICIAN', 'VIEWER')
  )
  INTO valid_recipient;

  IF NOT valid_recipient THEN
    RAISE EXCEPTION
      'El destinatario % no pertenece a SSTT activo del hotel de este mantenimiento.',
      NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_maintenance_alert_user
ON public.maintenance_alert_users;

CREATE TRIGGER trg_validate_maintenance_alert_user
BEFORE INSERT OR UPDATE
ON public.maintenance_alert_users
FOR EACH ROW
EXECUTE FUNCTION public.validate_maintenance_alert_user();

REVOKE ALL ON FUNCTION public.validate_maintenance_alert_user() FROM PUBLIC;

-- =========================================================
-- RLS
-- =========================================================

ALTER TABLE public.maintenance_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_control_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_alert_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_alert_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_alert_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_alerts ENABLE ROW LEVEL SECURITY;

-- PLANES
DROP POLICY IF EXISTS maintenance_plans_select_authorized
ON public.maintenance_plans;
CREATE POLICY maintenance_plans_select_authorized
  ON public.maintenance_plans
  FOR SELECT
  TO authenticated
  USING (public.has_hotel_permission(hotel_id, 'maintenance.view'));

DROP POLICY IF EXISTS maintenance_plans_insert_authorized
ON public.maintenance_plans;
CREATE POLICY maintenance_plans_insert_authorized
  ON public.maintenance_plans
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_hotel_permission(hotel_id, 'maintenance.create'));

DROP POLICY IF EXISTS maintenance_plans_update_authorized
ON public.maintenance_plans;
CREATE POLICY maintenance_plans_update_authorized
  ON public.maintenance_plans
  FOR UPDATE
  TO authenticated
  USING (public.has_hotel_permission(hotel_id, 'maintenance.update'))
  WITH CHECK (public.has_hotel_permission(hotel_id, 'maintenance.update'));

DROP POLICY IF EXISTS maintenance_plans_delete_authorized
ON public.maintenance_plans;
CREATE POLICY maintenance_plans_delete_authorized
  ON public.maintenance_plans
  FOR DELETE
  TO authenticated
  USING (public.has_hotel_permission(hotel_id, 'maintenance.delete'));

-- CONTROLES
DROP POLICY IF EXISTS maintenance_controls_select_authorized
ON public.maintenance_controls;
CREATE POLICY maintenance_controls_select_authorized
  ON public.maintenance_controls
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.maintenance_plans mp
      WHERE mp.id = maintenance_controls.maintenance_plan_id
        AND public.has_hotel_permission(mp.hotel_id, 'maintenance.view')
    )
  );

DROP POLICY IF EXISTS maintenance_controls_write_authorized
ON public.maintenance_controls;
CREATE POLICY maintenance_controls_write_authorized
  ON public.maintenance_controls
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.maintenance_plans mp
      WHERE mp.id = maintenance_controls.maintenance_plan_id
        AND (
          public.has_hotel_permission(mp.hotel_id, 'maintenance.create')
          OR public.has_hotel_permission(mp.hotel_id, 'maintenance.update')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.maintenance_plans mp
      WHERE mp.id = maintenance_controls.maintenance_plan_id
        AND (
          public.has_hotel_permission(mp.hotel_id, 'maintenance.create')
          OR public.has_hotel_permission(mp.hotel_id, 'maintenance.update')
        )
    )
  );

-- EJECUCIONES
DROP POLICY IF EXISTS maintenance_executions_select_authorized
ON public.maintenance_executions;
CREATE POLICY maintenance_executions_select_authorized
  ON public.maintenance_executions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.maintenance_plans mp
      WHERE mp.id = maintenance_executions.maintenance_plan_id
        AND public.has_hotel_permission(mp.hotel_id, 'maintenance.view')
    )
  );

DROP POLICY IF EXISTS maintenance_executions_write_authorized
ON public.maintenance_executions;
CREATE POLICY maintenance_executions_write_authorized
  ON public.maintenance_executions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.maintenance_plans mp
      WHERE mp.id = maintenance_executions.maintenance_plan_id
        AND public.has_hotel_permission(mp.hotel_id, 'maintenance.create')
    )
  );

DROP POLICY IF EXISTS maintenance_executions_update_authorized
ON public.maintenance_executions;
CREATE POLICY maintenance_executions_update_authorized
  ON public.maintenance_executions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.maintenance_plans mp
      WHERE mp.id = maintenance_executions.maintenance_plan_id
        AND public.has_hotel_permission(mp.hotel_id, 'maintenance.update')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.maintenance_plans mp
      WHERE mp.id = maintenance_executions.maintenance_plan_id
        AND public.has_hotel_permission(mp.hotel_id, 'maintenance.update')
    )
  );

-- RESULTADOS DE CONTROLES
DROP POLICY IF EXISTS maintenance_control_results_select_authorized
ON public.maintenance_control_results;
CREATE POLICY maintenance_control_results_select_authorized
  ON public.maintenance_control_results
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.maintenance_executions me
      JOIN public.maintenance_plans mp
        ON mp.id = me.maintenance_plan_id
      WHERE me.id = maintenance_control_results.execution_id
        AND public.has_hotel_permission(mp.hotel_id, 'maintenance.view')
    )
  );

DROP POLICY IF EXISTS maintenance_control_results_write_authorized
ON public.maintenance_control_results;
CREATE POLICY maintenance_control_results_write_authorized
  ON public.maintenance_control_results
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.maintenance_executions me
      JOIN public.maintenance_plans mp
        ON mp.id = me.maintenance_plan_id
      WHERE me.id = maintenance_control_results.execution_id
        AND (
          public.has_hotel_permission(mp.hotel_id, 'maintenance.create')
          OR public.has_hotel_permission(mp.hotel_id, 'maintenance.update')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.maintenance_executions me
      JOIN public.maintenance_plans mp
        ON mp.id = me.maintenance_plan_id
      WHERE me.id = maintenance_control_results.execution_id
        AND (
          public.has_hotel_permission(mp.hotel_id, 'maintenance.create')
          OR public.has_hotel_permission(mp.hotel_id, 'maintenance.update')
        )
    )
  );

-- ALERTAS CONFIG
DROP POLICY IF EXISTS maintenance_alert_configs_select_authorized
ON public.maintenance_alert_configs;
CREATE POLICY maintenance_alert_configs_select_authorized
  ON public.maintenance_alert_configs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.maintenance_plans mp
      WHERE mp.id = maintenance_alert_configs.maintenance_plan_id
        AND public.has_hotel_permission(mp.hotel_id, 'maintenance.view')
    )
  );

DROP POLICY IF EXISTS maintenance_alert_configs_write_authorized
ON public.maintenance_alert_configs;
CREATE POLICY maintenance_alert_configs_write_authorized
  ON public.maintenance_alert_configs
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.maintenance_plans mp
      WHERE mp.id = maintenance_alert_configs.maintenance_plan_id
        AND public.has_hotel_permission(mp.hotel_id, 'maintenance.update')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.maintenance_plans mp
      WHERE mp.id = maintenance_alert_configs.maintenance_plan_id
        AND public.has_hotel_permission(mp.hotel_id, 'maintenance.update')
    )
  );

-- DESTINATARIOS INTERNOS
DROP POLICY IF EXISTS maintenance_alert_users_select_authorized
ON public.maintenance_alert_users;
CREATE POLICY maintenance_alert_users_select_authorized
  ON public.maintenance_alert_users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.maintenance_alert_configs mac
      JOIN public.maintenance_plans mp
        ON mp.id = mac.maintenance_plan_id
      WHERE mac.id = maintenance_alert_users.alert_config_id
        AND public.has_hotel_permission(mp.hotel_id, 'maintenance.view')
    )
  );

DROP POLICY IF EXISTS maintenance_alert_users_write_authorized
ON public.maintenance_alert_users;
CREATE POLICY maintenance_alert_users_write_authorized
  ON public.maintenance_alert_users
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.maintenance_alert_configs mac
      JOIN public.maintenance_plans mp
        ON mp.id = mac.maintenance_plan_id
      WHERE mac.id = maintenance_alert_users.alert_config_id
        AND public.has_hotel_permission(mp.hotel_id, 'maintenance.update')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.maintenance_alert_configs mac
      JOIN public.maintenance_plans mp
        ON mp.id = mac.maintenance_plan_id
      WHERE mac.id = maintenance_alert_users.alert_config_id
        AND public.has_hotel_permission(mp.hotel_id, 'maintenance.update')
    )
  );

-- EMAILS EXTERNOS
DROP POLICY IF EXISTS maintenance_alert_emails_select_authorized
ON public.maintenance_alert_emails;
CREATE POLICY maintenance_alert_emails_select_authorized
  ON public.maintenance_alert_emails
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.maintenance_alert_configs mac
      JOIN public.maintenance_plans mp
        ON mp.id = mac.maintenance_plan_id
      WHERE mac.id = maintenance_alert_emails.alert_config_id
        AND public.has_hotel_permission(mp.hotel_id, 'maintenance.view')
    )
  );

DROP POLICY IF EXISTS maintenance_alert_emails_write_authorized
ON public.maintenance_alert_emails;
CREATE POLICY maintenance_alert_emails_write_authorized
  ON public.maintenance_alert_emails
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.maintenance_alert_configs mac
      JOIN public.maintenance_plans mp
        ON mp.id = mac.maintenance_plan_id
      WHERE mac.id = maintenance_alert_emails.alert_config_id
        AND public.has_hotel_permission(mp.hotel_id, 'maintenance.update')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.maintenance_alert_configs mac
      JOIN public.maintenance_plans mp
        ON mp.id = mac.maintenance_plan_id
      WHERE mac.id = maintenance_alert_emails.alert_config_id
        AND public.has_hotel_permission(mp.hotel_id, 'maintenance.update')
    )
  );

-- ALERTAS GENERADAS
DROP POLICY IF EXISTS maintenance_alerts_select_authorized
ON public.maintenance_alerts;
CREATE POLICY maintenance_alerts_select_authorized
  ON public.maintenance_alerts
  FOR SELECT
  TO authenticated
  USING (public.has_hotel_permission(hotel_id, 'maintenance.view'));

DROP POLICY IF EXISTS maintenance_alerts_update_authorized
ON public.maintenance_alerts;
CREATE POLICY maintenance_alerts_update_authorized
  ON public.maintenance_alerts
  FOR UPDATE
  TO authenticated
  USING (public.has_hotel_permission(hotel_id, 'maintenance.update'))
  WITH CHECK (public.has_hotel_permission(hotel_id, 'maintenance.update'));

COMMIT;
