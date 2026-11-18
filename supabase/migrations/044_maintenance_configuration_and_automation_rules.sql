-- Arias Suite — migración 044
-- Configuración por hotel y reglas automáticas de mantenimiento/PAM.
--
-- No modifica ni reejecuta migraciones anteriores.
-- La configuración es multihotel y las reglas se almacenan de forma flexible
-- para poder ampliar el motor de automatización sin rehacer el modelo.

BEGIN;

INSERT INTO public.permissions (
  code,
  name,
  module,
  action,
  description
)
VALUES (
  'maintenance.configure',
  'Configurar automatizaciones de mantenimiento',
  'maintenance',
  'configure',
  'Permite configurar la generación de OT, asignación, avisos y reglas automáticas del mantenimiento.'
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  action = EXCLUDED.action,
  description = EXCLUDED.description;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code IN ('CLIENT_ADMIN', 'MAINTENANCE_CHIEF')
  AND p.code = 'maintenance.configure'
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.maintenance_hotel_config (
  hotel_id uuid PRIMARY KEY REFERENCES public.hotels(id) ON DELETE RESTRICT,
  ot_generation_mode text NOT NULL DEFAULT 'MANUAL'
    CHECK (ot_generation_mode IN ('AUTO', 'MANUAL')),
  ot_generation_lead_days integer NOT NULL DEFAULT 0
    CHECK (ot_generation_lead_days BETWEEN 0 AND 365),
  ot_assignment_mode text NOT NULL DEFAULT 'MANUAL'
    CHECK (ot_assignment_mode IN ('NONE', 'MANUAL', 'RULES')),
  ot_overdue_action text NOT NULL DEFAULT 'KEEP_PENDING'
    CHECK (ot_overdue_action IN ('KEEP_PENDING', 'ESCALATE')),
  notify_on_ot_created boolean NOT NULL DEFAULT true,
  notify_unassigned boolean NOT NULL DEFAULT true,
  notify_overdue boolean NOT NULL DEFAULT true,
  require_evidence_on_close boolean NOT NULL DEFAULT false,
  require_observations_on_close boolean NOT NULL DEFAULT false,
  allow_manual_ot_creation boolean NOT NULL DEFAULT true,
  duplicate_protection boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_maintenance_hotel_config_updated
  ON public.maintenance_hotel_config (hotel_id, updated_at DESC);

ALTER TABLE public.maintenance_hotel_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_hotel_config_select
ON public.maintenance_hotel_config;

CREATE POLICY maintenance_hotel_config_select
  ON public.maintenance_hotel_config
  FOR SELECT
  TO authenticated
  USING (
    public.has_hotel_permission(hotel_id, 'maintenance.view')
  );

DROP POLICY IF EXISTS maintenance_hotel_config_write
ON public.maintenance_hotel_config;

CREATE POLICY maintenance_hotel_config_write
  ON public.maintenance_hotel_config
  FOR ALL
  TO authenticated
  USING (
    public.has_hotel_permission(hotel_id, 'maintenance.configure')
  )
  WITH CHECK (
    public.has_hotel_permission(hotel_id, 'maintenance.configure')
  );

CREATE TABLE IF NOT EXISTS public.maintenance_automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE RESTRICT,
  name text NOT NULL,
  description text,
  trigger_event text NOT NULL
    CHECK (
      trigger_event IN (
        'PAM_JOB_PENDING',
        'PAM_JOB_DUE',
        'PAM_JOB_OVERDUE',
        'EXECUTION_NOT_CONFORM',
        'EXECUTION_WITH_ISSUES',
        'CONTROL_OUT_OF_RANGE'
      )
    ),
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  actions jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority integer NOT NULL DEFAULT 100
    CHECK (priority >= 0),
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_maintenance_automation_rules_hotel
  ON public.maintenance_automation_rules (hotel_id, active, priority, created_at);

ALTER TABLE public.maintenance_automation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_automation_rules_select
ON public.maintenance_automation_rules;

CREATE POLICY maintenance_automation_rules_select
  ON public.maintenance_automation_rules
  FOR SELECT
  TO authenticated
  USING (
    public.has_hotel_permission(hotel_id, 'maintenance.view')
  );

DROP POLICY IF EXISTS maintenance_automation_rules_write
ON public.maintenance_automation_rules;

CREATE POLICY maintenance_automation_rules_write
  ON public.maintenance_automation_rules
  FOR ALL
  TO authenticated
  USING (
    public.has_hotel_permission(hotel_id, 'maintenance.configure')
  )
  WITH CHECK (
    public.has_hotel_permission(hotel_id, 'maintenance.configure')
  );

COMMENT ON TABLE public.maintenance_hotel_config IS
'Configuración de automatización y operación de mantenimiento por hotel.';

COMMENT ON TABLE public.maintenance_automation_rules IS
'Reglas automáticas de mantenimiento por hotel. conditions/actions son JSONB para permitir ampliar el motor sin cambiar el esquema base.';

COMMIT;
