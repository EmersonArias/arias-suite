-- Arias Suite — migración 028
-- Registro de actuaciones relevantes de mantenimiento.
--
-- Actuaciones no sustituye al PAM ni a las OT:
--   PAM = mantenimiento preventivo planificado
--   OT  = orden de trabajo operativa
--   Actuación = intervención relevante que debe quedar documentada
--   Histórico = visión temporal que reunirá estos eventos con el resto.
--
-- Ejemplos: reparación importante, intervención de empresa externa,
-- actuación de Legionella, obra/modificación y otras intervenciones relevantes.

BEGIN;

-- =========================================================
-- PERMISOS
-- =========================================================

INSERT INTO public.permissions (code, name, module, action, description)
VALUES
  (
    'actions.view',
    'Consultar actuaciones',
    'actions',
    'view',
    'Permite consultar las actuaciones relevantes registradas en el hotel.'
  ),
  (
    'actions.create',
    'Crear actuaciones',
    'actions',
    'create',
    'Permite registrar actuaciones relevantes.'
  ),
  (
    'actions.update',
    'Modificar actuaciones',
    'actions',
    'update',
    'Permite modificar actuaciones relevantes.'
  ),
  (
    'actions.delete',
    'Eliminar actuaciones',
    'actions',
    'delete',
    'Permite eliminar actuaciones según las reglas de borrado.'
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
WHERE r.code IN ('CLIENT_ADMIN', 'MAINTENANCE_CHIEF', 'TECHNICIAN', 'VIEWER')
  AND p.code = 'actions.view'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code IN ('CLIENT_ADMIN', 'MAINTENANCE_CHIEF', 'TECHNICIAN')
  AND p.code IN ('actions.create', 'actions.update')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'CLIENT_ADMIN'
  AND p.code = 'actions.delete'
ON CONFLICT DO NOTHING;

-- =========================================================
-- ACTUACIONES
-- =========================================================

CREATE TABLE IF NOT EXISTS public.maintenance_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE RESTRICT,
  code text,
  title text NOT NULL,
  action_type text NOT NULL DEFAULT 'OTHER',
  description text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  provider_id uuid REFERENCES public.providers(id) ON DELETE RESTRICT,
  performer_name text,
  external_reference text,
  result text,
  cost_amount numeric(14,2),
  currency text NOT NULL DEFAULT 'EUR',
  notes text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  maintenance_execution_id uuid REFERENCES public.maintenance_executions(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_actions_title_check
    CHECK (length(btrim(title)) >= 2),
  CONSTRAINT maintenance_actions_type_check
    CHECK (
      action_type IN (
        'REPAIR',
        'EXTERNAL_INTERVENTION',
        'LEGIONELLA',
        'PROJECT',
        'OTHER'
      )
    ),
  CONSTRAINT maintenance_actions_result_check
    CHECK (
      result IS NULL OR length(btrim(result)) > 0
    ),
  CONSTRAINT maintenance_actions_cost_check
    CHECK (
      cost_amount IS NULL OR cost_amount >= 0
    )
);

CREATE INDEX IF NOT EXISTS ix_maintenance_actions_hotel_date
  ON public.maintenance_actions (hotel_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS ix_maintenance_actions_provider_id
  ON public.maintenance_actions (provider_id);

CREATE INDEX IF NOT EXISTS ix_maintenance_actions_type
  ON public.maintenance_actions (hotel_id, action_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS ix_maintenance_actions_execution_id
  ON public.maintenance_actions (maintenance_execution_id);

-- =========================================================
-- ACTUACIÓN ↔ EQUIPOS
-- =========================================================

CREATE TABLE IF NOT EXISTS public.maintenance_action_assets (
  action_id uuid NOT NULL REFERENCES public.maintenance_actions(id) ON DELETE CASCADE,
  apparatus_registry_id uuid NOT NULL REFERENCES public.apparatus_registry(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (action_id, apparatus_registry_id)
);

CREATE INDEX IF NOT EXISTS ix_maintenance_action_assets_equipment
  ON public.maintenance_action_assets (apparatus_registry_id, action_id);

-- =========================================================
-- RLS
-- =========================================================

ALTER TABLE public.maintenance_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_action_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_actions_select_authorized
ON public.maintenance_actions;

CREATE POLICY maintenance_actions_select_authorized
  ON public.maintenance_actions
  FOR SELECT
  TO authenticated
  USING (
    public.has_hotel_permission(hotel_id, 'actions.view')
  );

DROP POLICY IF EXISTS maintenance_actions_insert_authorized
ON public.maintenance_actions;

CREATE POLICY maintenance_actions_insert_authorized
  ON public.maintenance_actions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_hotel_permission(hotel_id, 'actions.create')
  );

DROP POLICY IF EXISTS maintenance_actions_update_authorized
ON public.maintenance_actions;

CREATE POLICY maintenance_actions_update_authorized
  ON public.maintenance_actions
  FOR UPDATE
  TO authenticated
  USING (
    public.has_hotel_permission(hotel_id, 'actions.update')
  )
  WITH CHECK (
    public.has_hotel_permission(hotel_id, 'actions.update')
  );

DROP POLICY IF EXISTS maintenance_actions_delete_authorized
ON public.maintenance_actions;

CREATE POLICY maintenance_actions_delete_authorized
  ON public.maintenance_actions
  FOR DELETE
  TO authenticated
  USING (
    public.has_hotel_permission(hotel_id, 'actions.delete')
  );

DROP POLICY IF EXISTS maintenance_action_assets_select_authorized
ON public.maintenance_action_assets;

CREATE POLICY maintenance_action_assets_select_authorized
  ON public.maintenance_action_assets
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.maintenance_actions ma
      WHERE ma.id = maintenance_action_assets.action_id
        AND public.has_hotel_permission(ma.hotel_id, 'actions.view')
    )
  );

DROP POLICY IF EXISTS maintenance_action_assets_write_authorized
ON public.maintenance_action_assets;

CREATE POLICY maintenance_action_assets_write_authorized
  ON public.maintenance_action_assets
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.maintenance_actions ma
      WHERE ma.id = maintenance_action_assets.action_id
        AND public.has_hotel_permission(ma.hotel_id, 'actions.update')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.maintenance_actions ma
      WHERE ma.id = maintenance_action_assets.action_id
        AND public.has_hotel_permission(ma.hotel_id, 'actions.update')
    )
  );

COMMIT;
