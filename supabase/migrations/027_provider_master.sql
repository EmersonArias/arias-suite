-- Arias Suite — migración 027
-- Maestro de proveedores y empresas externas.
--
-- Alcance:
--   proveedor -> hoteles atendidos -> contactos -> servicios
--   Los proveedores son maestros a nivel de cliente (tenant), no duplicados por hotel.
--   La relación proveedor/hotel conserva qué hoteles utiliza cada proveedor.
--
-- No modifica ni reejecuta migraciones anteriores.

BEGIN;

-- =========================================================
-- PERMISOS
-- =========================================================

INSERT INTO public.permissions (code, name, module, action, description)
VALUES
  (
    'providers.view',
    'Consultar proveedores',
    'providers',
    'view',
    'Permite consultar proveedores, contactos y servicios de empresas externas.'
  ),
  (
    'providers.create',
    'Crear proveedores',
    'providers',
    'create',
    'Permite crear proveedores y asociarlos a hoteles autorizados.'
  ),
  (
    'providers.update',
    'Modificar proveedores',
    'providers',
    'update',
    'Permite modificar datos de proveedores, contactos y servicios.'
  ),
  (
    'providers.delete',
    'Eliminar proveedores',
    'providers',
    'delete',
    'Permite eliminar proveedores según las reglas de borrado.'
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
  AND p.code = 'providers.view'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code IN ('CLIENT_ADMIN', 'MAINTENANCE_CHIEF', 'TECHNICIAN')
  AND p.code IN ('providers.create', 'providers.update')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'CLIENT_ADMIN'
  AND p.code = 'providers.delete'
ON CONFLICT DO NOTHING;

-- =========================================================
-- PROVEEDORES
-- =========================================================

CREATE TABLE IF NOT EXISTS public.providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  legal_name text NOT NULL,
  trade_name text,
  tax_id text,
  address_line text,
  postal_code text,
  city text,
  province text,
  country text NOT NULL DEFAULT 'España',
  phone_main text,
  email_main text,
  website_url text,
  portal_url text,
  emergency_phone text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT providers_legal_name_check
    CHECK (length(btrim(legal_name)) >= 2)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_providers_tenant_tax_id
  ON public.providers (tenant_id, tax_id)
  WHERE tax_id IS NOT NULL AND btrim(tax_id) <> '';

CREATE INDEX IF NOT EXISTS ix_providers_tenant_id
  ON public.providers (tenant_id);

CREATE INDEX IF NOT EXISTS ix_providers_name
  ON public.providers (tenant_id, legal_name);

-- =========================================================
-- PROVEEDOR ↔ HOTEL
-- =========================================================

CREATE TABLE IF NOT EXISTS public.provider_hotels (
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  relationship_label text,
  contract_reference text,
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_id, hotel_id)
);

CREATE INDEX IF NOT EXISTS ix_provider_hotels_hotel_id
  ON public.provider_hotels (hotel_id, active);

CREATE INDEX IF NOT EXISTS ix_provider_hotels_provider_id
  ON public.provider_hotels (provider_id);

-- =========================================================
-- CONTACTOS
-- =========================================================

CREATE TABLE IF NOT EXISTS public.provider_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  position text,
  phone text,
  mobile text,
  email text,
  is_primary boolean NOT NULL DEFAULT false,
  emergency_available boolean NOT NULL DEFAULT false,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_contacts_name_check
    CHECK (length(btrim(full_name)) >= 2)
);

CREATE INDEX IF NOT EXISTS ix_provider_contacts_provider_id
  ON public.provider_contacts (provider_id, active, is_primary);

CREATE UNIQUE INDEX IF NOT EXISTS ux_provider_contacts_one_primary
  ON public.provider_contacts (provider_id)
  WHERE is_primary = true AND active = true;

-- =========================================================
-- SERVICIOS
-- =========================================================

CREATE TABLE IF NOT EXISTS public.provider_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  service_name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT provider_services_name_check
    CHECK (length(btrim(service_name)) >= 2)
);

CREATE INDEX IF NOT EXISTS ix_provider_services_provider_id
  ON public.provider_services (provider_id, active);

CREATE UNIQUE INDEX IF NOT EXISTS ux_provider_services_name
  ON public.provider_services (provider_id, lower(btrim(service_name)));

-- =========================================================
-- ALTA ATÓMICA DE PROVEEDOR + HOTEL
-- =========================================================

CREATE OR REPLACE FUNCTION public.create_provider_for_hotel(
  target_hotel_id uuid,
  provider_legal_name text,
  provider_trade_name text DEFAULT NULL,
  provider_tax_id text DEFAULT NULL,
  provider_address_line text DEFAULT NULL,
  provider_postal_code text DEFAULT NULL,
  provider_city text DEFAULT NULL,
  provider_province text DEFAULT NULL,
  provider_country text DEFAULT 'España',
  provider_phone_main text DEFAULT NULL,
  provider_email_main text DEFAULT NULL,
  provider_website_url text DEFAULT NULL,
  provider_portal_url text DEFAULT NULL,
  provider_emergency_phone text DEFAULT NULL,
  provider_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_tenant_id uuid;
  new_provider_id uuid;
BEGIN
  SELECT h.tenant_id
    INTO target_tenant_id
  FROM public.hotels h
  WHERE h.id = target_hotel_id
    AND h.active = true;

  IF target_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Hotel no válido o inactivo.';
  END IF;

  IF NOT public.is_platform_admin()
     AND NOT public.has_hotel_permission(target_hotel_id, 'providers.create') THEN
    RAISE EXCEPTION 'No tienes permiso para crear proveedores en este hotel.';
  END IF;

  INSERT INTO public.providers (
    tenant_id,
    legal_name,
    trade_name,
    tax_id,
    address_line,
    postal_code,
    city,
    province,
    country,
    phone_main,
    email_main,
    website_url,
    portal_url,
    emergency_phone,
    notes,
    created_by
  )
  VALUES (
    target_tenant_id,
    btrim(provider_legal_name),
    NULLIF(btrim(provider_trade_name), ''),
    NULLIF(btrim(provider_tax_id), ''),
    NULLIF(btrim(provider_address_line), ''),
    NULLIF(btrim(provider_postal_code), ''),
    NULLIF(btrim(provider_city), ''),
    NULLIF(btrim(provider_province), ''),
    COALESCE(NULLIF(btrim(provider_country), ''), 'España'),
    NULLIF(btrim(provider_phone_main), ''),
    NULLIF(btrim(provider_email_main), ''),
    NULLIF(btrim(provider_website_url), ''),
    NULLIF(btrim(provider_portal_url), ''),
    NULLIF(btrim(provider_emergency_phone), ''),
    NULLIF(btrim(provider_notes), ''),
    auth.uid()
  )
  RETURNING id INTO new_provider_id;

  INSERT INTO public.provider_hotels (
    provider_id,
    hotel_id,
    active
  )
  VALUES (
    new_provider_id,
    target_hotel_id,
    true
  );

  RETURN new_provider_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_provider_for_hotel(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_provider_for_hotel(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) TO authenticated;

-- =========================================================
-- RLS
-- =========================================================

ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS providers_select_authorized
ON public.providers;

CREATE POLICY providers_select_authorized
  ON public.providers
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.provider_hotels ph
      WHERE ph.provider_id = providers.id
        AND public.has_hotel_permission(ph.hotel_id, 'providers.view')
    )
  );

DROP POLICY IF EXISTS providers_insert_authorized
ON public.providers;

CREATE POLICY providers_insert_authorized
  ON public.providers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.hotels h
      WHERE h.tenant_id = providers.tenant_id
        AND public.has_hotel_permission(h.id, 'providers.create')
    )
  );

DROP POLICY IF EXISTS providers_update_authorized
ON public.providers;

CREATE POLICY providers_update_authorized
  ON public.providers
  FOR UPDATE
  TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.provider_hotels ph
      WHERE ph.provider_id = providers.id
        AND public.has_hotel_permission(ph.hotel_id, 'providers.update')
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.provider_hotels ph
      WHERE ph.provider_id = providers.id
        AND public.has_hotel_permission(ph.hotel_id, 'providers.update')
    )
  );

DROP POLICY IF EXISTS providers_delete_authorized
ON public.providers;

CREATE POLICY providers_delete_authorized
  ON public.providers
  FOR DELETE
  TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.provider_hotels ph
      WHERE ph.provider_id = providers.id
        AND public.has_hotel_permission(ph.hotel_id, 'providers.delete')
    )
  );

DROP POLICY IF EXISTS provider_hotels_select_authorized
ON public.provider_hotels;

CREATE POLICY provider_hotels_select_authorized
  ON public.provider_hotels
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR public.has_hotel_permission(hotel_id, 'providers.view')
  );

DROP POLICY IF EXISTS provider_hotels_write_authorized
ON public.provider_hotels;

CREATE POLICY provider_hotels_write_authorized
  ON public.provider_hotels
  FOR ALL
  TO authenticated
  USING (
    public.is_platform_admin()
    OR public.has_hotel_permission(hotel_id, 'providers.update')
    OR public.has_hotel_permission(hotel_id, 'providers.create')
  )
  WITH CHECK (
    public.is_platform_admin()
    OR public.has_hotel_permission(hotel_id, 'providers.update')
    OR public.has_hotel_permission(hotel_id, 'providers.create')
  );

DROP POLICY IF EXISTS provider_contacts_select_authorized
ON public.provider_contacts;

CREATE POLICY provider_contacts_select_authorized
  ON public.provider_contacts
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.provider_hotels ph
      WHERE ph.provider_id = provider_contacts.provider_id
        AND public.has_hotel_permission(ph.hotel_id, 'providers.view')
    )
  );

DROP POLICY IF EXISTS provider_contacts_write_authorized
ON public.provider_contacts;

CREATE POLICY provider_contacts_write_authorized
  ON public.provider_contacts
  FOR ALL
  TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.provider_hotels ph
      WHERE ph.provider_id = provider_contacts.provider_id
        AND public.has_hotel_permission(ph.hotel_id, 'providers.update')
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.provider_hotels ph
      WHERE ph.provider_id = provider_contacts.provider_id
        AND public.has_hotel_permission(ph.hotel_id, 'providers.update')
    )
  );

DROP POLICY IF EXISTS provider_services_select_authorized
ON public.provider_services;

CREATE POLICY provider_services_select_authorized
  ON public.provider_services
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.provider_hotels ph
      WHERE ph.provider_id = provider_services.provider_id
        AND public.has_hotel_permission(ph.hotel_id, 'providers.view')
    )
  );

DROP POLICY IF EXISTS provider_services_write_authorized
ON public.provider_services;

CREATE POLICY provider_services_write_authorized
  ON public.provider_services
  FOR ALL
  TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.provider_hotels ph
      WHERE ph.provider_id = provider_services.provider_id
        AND public.has_hotel_permission(ph.hotel_id, 'providers.update')
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.provider_hotels ph
      WHERE ph.provider_id = provider_services.provider_id
        AND public.has_hotel_permission(ph.hotel_id, 'providers.update')
    )
  );

COMMIT;
