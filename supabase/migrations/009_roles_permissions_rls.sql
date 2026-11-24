-- Arias Suite — migración 009
-- Roles/permisos operativos y RLS por hotel.
--
-- Cierra la primera capa real de seguridad:
--   usuario -> hotel -> contrato -> módulo -> permiso -> dato.
--
-- El Superadmin de plataforma mantiene acceso mediante is_platform_superadmin().

BEGIN;

-- =========================================================
-- ROLES BASE
-- =========================================================

INSERT INTO public.roles (code, name, description)
VALUES
  ('CLIENT_ADMIN', 'Administrador de cliente', 'Administra la operativa del cliente dentro de sus hoteles contratados.'),
  ('MAINTENANCE_CHIEF', 'Jefe de Mantenimiento', 'Gestiona la operativa técnica del hotel con permisos de responsable SSTT.'),
  ('TECHNICIAN', 'Técnico de Mantenimiento', 'Ejecuta y registra trabajos dentro de los módulos autorizados.'),
  ('VIEWER', 'Consulta', 'Acceso de solo lectura a los módulos autorizados.')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  active = true;

-- =========================================================
-- PERMISOS OPERATIVOS BASE
-- =========================================================

INSERT INTO public.permissions (code, name, module, action, description)
VALUES
  ('apparatusregistry.view', 'Consultar Relación de Aparatos', 'apparatusregistry', 'view', 'Permite consultar la Relación de Aparatos.'),
  ('apparatusregistry.create', 'Crear Relación de Aparatos', 'apparatusregistry', 'create', 'Permite crear registros de Relación de Aparatos.'),
  ('apparatusregistry.update', 'Modificar Relación de Aparatos', 'apparatusregistry', 'update', 'Permite modificar registros de Relación de Aparatos.'),
  ('apparatusregistry.delete', 'Eliminar Relación de Aparatos', 'apparatusregistry', 'delete', 'Permite eliminar registros de Relación de Aparatos.'),

  ('electricalpanels.view', 'Consultar Cuadros Eléctricos', 'electricalpanels', 'view', 'Permite consultar Cuadros Eléctricos.'),
  ('electricalpanels.create', 'Crear Cuadros Eléctricos', 'electricalpanels', 'create', 'Permite crear Cuadros Eléctricos.'),
  ('electricalpanels.update', 'Modificar Cuadros Eléctricos', 'electricalpanels', 'update', 'Permite modificar Cuadros Eléctricos.'),
  ('electricalpanels.delete', 'Eliminar Cuadros Eléctricos', 'electricalpanels', 'delete', 'Permite eliminar Cuadros Eléctricos.'),

  ('assets.view', 'Consultar Activos', 'assets', 'view', 'Permite consultar Activos.'),
  ('assets.create', 'Crear Activos', 'assets', 'create', 'Permite crear Activos.'),
  ('assets.update', 'Modificar Activos', 'assets', 'update', 'Permite modificar Activos.'),
  ('assets.delete', 'Eliminar Activos', 'assets', 'delete', 'Permite eliminar Activos.')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  action = EXCLUDED.action,
  description = EXCLUDED.description;

-- =========================================================
-- ASIGNACIÓN DE PERMISOS A ROLES
-- =========================================================

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code IN ('CLIENT_ADMIN')
  AND p.code LIKE '%.view'
  AND p.module IN ('apparatusregistry', 'electricalpanels', 'assets')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code IN ('CLIENT_ADMIN', 'MAINTENANCE_CHIEF', 'TECHNICIAN')
  AND p.code LIKE '%.create'
  AND p.module IN ('apparatusregistry', 'electricalpanels', 'assets')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code IN ('CLIENT_ADMIN', 'MAINTENANCE_CHIEF', 'TECHNICIAN')
  AND p.code LIKE '%.update'
  AND p.module IN ('apparatusregistry', 'electricalpanels', 'assets')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'CLIENT_ADMIN'
  AND p.code LIKE '%.delete'
  AND p.module IN ('apparatusregistry', 'electricalpanels', 'assets')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code IN ('CLIENT_ADMIN', 'MAINTENANCE_CHIEF', 'TECHNICIAN', 'VIEWER')
  AND p.code LIKE '%.view'
  AND p.module IN ('apparatusregistry', 'electricalpanels', 'assets')
ON CONFLICT DO NOTHING;

-- =========================================================
-- RLS: RELACIÓN DE APARATOS
-- =========================================================

ALTER TABLE public.apparatus_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS apparatus_registry_select_authorized
ON public.apparatus_registry;

CREATE POLICY apparatus_registry_select_authorized
  ON public.apparatus_registry
  FOR SELECT
  TO authenticated
  USING (public.has_hotel_permission(hotel_id, 'apparatusregistry.view'));

DROP POLICY IF EXISTS apparatus_registry_insert_authorized
ON public.apparatus_registry;

CREATE POLICY apparatus_registry_insert_authorized
  ON public.apparatus_registry
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_hotel_permission(hotel_id, 'apparatusregistry.create'));

DROP POLICY IF EXISTS apparatus_registry_update_authorized
ON public.apparatus_registry;

CREATE POLICY apparatus_registry_update_authorized
  ON public.apparatus_registry
  FOR UPDATE
  TO authenticated
  USING (public.has_hotel_permission(hotel_id, 'apparatusregistry.update'))
  WITH CHECK (public.has_hotel_permission(hotel_id, 'apparatusregistry.update'));

DROP POLICY IF EXISTS apparatus_registry_delete_authorized
ON public.apparatus_registry;

CREATE POLICY apparatus_registry_delete_authorized
  ON public.apparatus_registry
  FOR DELETE
  TO authenticated
  USING (public.has_hotel_permission(hotel_id, 'apparatusregistry.delete'));

-- =========================================================
-- RLS: CUADROS ELÉCTRICOS
-- =========================================================

ALTER TABLE public.electrical_panels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS electrical_panels_select_authorized
ON public.electrical_panels;

CREATE POLICY electrical_panels_select_authorized
  ON public.electrical_panels
  FOR SELECT
  TO authenticated
  USING (public.has_hotel_permission(hotel_id, 'electricalpanels.view'));

DROP POLICY IF EXISTS electrical_panels_insert_authorized
ON public.electrical_panels;

CREATE POLICY electrical_panels_insert_authorized
  ON public.electrical_panels
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_hotel_permission(hotel_id, 'electricalpanels.create'));

DROP POLICY IF EXISTS electrical_panels_update_authorized
ON public.electrical_panels;

CREATE POLICY electrical_panels_update_authorized
  ON public.electrical_panels
  FOR UPDATE
  TO authenticated
  USING (public.has_hotel_permission(hotel_id, 'electricalpanels.update'))
  WITH CHECK (public.has_hotel_permission(hotel_id, 'electricalpanels.update'));

DROP POLICY IF EXISTS electrical_panels_delete_authorized
ON public.electrical_panels;

CREATE POLICY electrical_panels_delete_authorized
  ON public.electrical_panels
  FOR DELETE
  TO authenticated
  USING (public.has_hotel_permission(hotel_id, 'electricalpanels.delete'));

-- =========================================================
-- RLS: ACTIVOS
-- =========================================================

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assets_select_authorized
ON public.assets;

CREATE POLICY assets_select_authorized
  ON public.assets
  FOR SELECT
  TO authenticated
  USING (public.has_hotel_permission(hotel_id, 'assets.view'));

DROP POLICY IF EXISTS assets_insert_authorized
ON public.assets;

CREATE POLICY assets_insert_authorized
  ON public.assets
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_hotel_permission(hotel_id, 'assets.create'));

DROP POLICY IF EXISTS assets_update_authorized
ON public.assets;

CREATE POLICY assets_update_authorized
  ON public.assets
  FOR UPDATE
  TO authenticated
  USING (public.has_hotel_permission(hotel_id, 'assets.update'))
  WITH CHECK (public.has_hotel_permission(hotel_id, 'assets.update'));

DROP POLICY IF EXISTS assets_delete_authorized
ON public.assets;

CREATE POLICY assets_delete_authorized
  ON public.assets
  FOR DELETE
  TO authenticated
  USING (public.has_hotel_permission(hotel_id, 'assets.delete'));

-- =========================================================
-- RLS: INSPECCIONES
-- =========================================================

ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inspections_select_authorized
ON public.inspections;

CREATE POLICY inspections_select_authorized
  ON public.inspections
  FOR SELECT
  TO authenticated
  USING (public.has_hotel_permission(hotel_id, 'assets.view'));

DROP POLICY IF EXISTS inspections_insert_authorized
ON public.inspections;

CREATE POLICY inspections_insert_authorized
  ON public.inspections
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_hotel_permission(hotel_id, 'assets.create'));

DROP POLICY IF EXISTS inspections_update_authorized
ON public.inspections;

CREATE POLICY inspections_update_authorized
  ON public.inspections
  FOR UPDATE
  TO authenticated
  USING (public.has_hotel_permission(hotel_id, 'assets.update'))
  WITH CHECK (public.has_hotel_permission(hotel_id, 'assets.update'));

DROP POLICY IF EXISTS inspections_delete_authorized
ON public.inspections;

CREATE POLICY inspections_delete_authorized
  ON public.inspections
  FOR DELETE
  TO authenticated
  USING (public.has_hotel_permission(hotel_id, 'assets.delete'));

COMMIT;
