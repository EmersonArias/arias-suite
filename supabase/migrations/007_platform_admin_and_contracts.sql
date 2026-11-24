-- Arias Suite — migración 007
-- Núcleo comercial y de administración de plataforma.
--
-- OBJETIVO:
--   1) Separar al Superadmin de los administradores de cliente.
--   2) Registrar qué ha contratado cada cliente.
--   3) Registrar qué hoteles forman parte de cada contrato.
--   4) Registrar qué módulos están contratados.
--
-- Esta migración NO crea clientes, hoteles, usuarios ni contratos de ejemplo.
-- Todos esos datos se crearán mediante el proceso real de alta de Arias Suite.

BEGIN;

-- Permite revocar el acceso de un usuario a un hotel sin borrar su asignación histórica.
ALTER TABLE public.user_hotel_roles
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS ix_user_hotel_roles_active
  ON public.user_hotel_roles (active);

-- =========================================================
-- SUPERADMIN DE LA PLATAFORMA
-- =========================================================

CREATE TABLE IF NOT EXISTS public.platform_superadmins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  platform_identifier text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_superadmins_identifier_check
    CHECK (btrim(platform_identifier) <> '')
);

CREATE INDEX IF NOT EXISTS ix_platform_superadmins_active
  ON public.platform_superadmins (active);

ALTER TABLE public.platform_superadmins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_superadmins_select_own
ON public.platform_superadmins;

CREATE POLICY platform_superadmins_select_own
  ON public.platform_superadmins
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- El identificador identifica la cuenta de plataforma.
-- NO sustituye al login/contraseña de Supabase Auth.

CREATE OR REPLACE FUNCTION public.is_platform_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_superadmins psa
    WHERE psa.user_id = auth.uid()
      AND psa.active = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_superadmin() FROM PUBLIC;

-- =========================================================
-- CONTRATOS / LICENCIAS
-- =========================================================

CREATE TABLE IF NOT EXISTS public.tenant_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  contract_code text NOT NULL UNIQUE,
  plan_name text,
  status text NOT NULL DEFAULT 'ACTIVE',
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_contracts_status_check
    CHECK (status IN ('DRAFT', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED')),
  CONSTRAINT tenant_contracts_dates_check
    CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS ix_tenant_contracts_tenant_id
  ON public.tenant_contracts (tenant_id);

CREATE INDEX IF NOT EXISTS ix_tenant_contracts_status
  ON public.tenant_contracts (status);

CREATE TABLE IF NOT EXISTS public.tenant_contract_hotels (
  contract_id uuid NOT NULL REFERENCES public.tenant_contracts(id) ON DELETE CASCADE,
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contract_id, hotel_id)
);

CREATE INDEX IF NOT EXISTS ix_tenant_contract_hotels_hotel_id
  ON public.tenant_contract_hotels (hotel_id);

CREATE TABLE IF NOT EXISTS public.tenant_contract_modules (
  contract_id uuid NOT NULL REFERENCES public.tenant_contracts(id) ON DELETE CASCADE,
  module_code text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  user_limit integer,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contract_id, module_code),
  CONSTRAINT tenant_contract_modules_user_limit_check
    CHECK (user_limit IS NULL OR user_limit > 0),
  CONSTRAINT tenant_contract_modules_module_code_check
    CHECK (btrim(module_code) <> '')
);

CREATE INDEX IF NOT EXISTS ix_tenant_contract_modules_module_code
  ON public.tenant_contract_modules (module_code);

-- =========================================================
-- FUNCIONES DE ACCESO REAL
-- =========================================================

CREATE OR REPLACE FUNCTION public.has_hotel_access(target_hotel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    public.is_platform_superadmin()
    OR EXISTS (
      SELECT 1
      FROM public.user_hotel_roles uhr
      JOIN public.hotels h
        ON h.id = uhr.hotel_id
      JOIN public.tenant_contract_hotels tch
        ON tch.hotel_id = h.id
      JOIN public.tenant_contracts tc
        ON tc.id = tch.contract_id
       AND tc.tenant_id = h.tenant_id
      WHERE uhr.user_id = auth.uid()
        AND uhr.hotel_id = target_hotel_id
        AND uhr.active IS NOT FALSE
        AND h.active = true
        AND tch.active = true
        AND tc.status = 'ACTIVE'
        AND (tc.start_date IS NULL OR tc.start_date <= CURRENT_DATE)
        AND (tc.end_date IS NULL OR tc.end_date >= CURRENT_DATE)
    );
$$;

REVOKE ALL ON FUNCTION public.has_hotel_access(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.has_hotel_module_access(
  target_hotel_id uuid,
  target_module_code text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    public.is_platform_superadmin()
    OR (
      public.has_hotel_access(target_hotel_id)
      AND EXISTS (
        SELECT 1
        FROM public.hotels h
        JOIN public.tenant_contract_hotels tch
          ON tch.hotel_id = h.id
         AND tch.active = true
        JOIN public.tenant_contracts tc
          ON tc.id = tch.contract_id
         AND tc.tenant_id = h.tenant_id
         AND tc.status = 'ACTIVE'
        JOIN public.tenant_contract_modules tcm
          ON tcm.contract_id = tc.id
         AND lower(tcm.module_code) = lower(target_module_code)
         AND tcm.active = true
        WHERE h.id = target_hotel_id
          AND h.active = true
          AND (tc.start_date IS NULL OR tc.start_date <= CURRENT_DATE)
          AND (tc.end_date IS NULL OR tc.end_date >= CURRENT_DATE)
      )
    );
$$;

REVOKE ALL ON FUNCTION public.has_hotel_module_access(uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.has_hotel_permission(
  target_hotel_id uuid,
  permission_code text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    public.is_platform_superadmin()
    OR (
      public.has_hotel_access(target_hotel_id)
      AND EXISTS (
        SELECT 1
        FROM public.user_hotel_roles uhr
        JOIN public.hotels h
          ON h.id = uhr.hotel_id
        JOIN public.tenant_contract_hotels tch
          ON tch.hotel_id = h.id
         AND tch.active = true
        JOIN public.tenant_contracts tc
          ON tc.id = tch.contract_id
         AND tc.tenant_id = h.tenant_id
         AND tc.status = 'ACTIVE'
        JOIN public.tenant_contract_modules tcm
          ON tcm.contract_id = tc.id
         AND tcm.active = true
        JOIN public.roles r
          ON r.id = uhr.role_id
         AND r.active = true
        JOIN public.role_permissions rp
          ON rp.role_id = r.id
        JOIN public.permissions p
          ON p.id = rp.permission_id
         AND p.code = permission_code
         AND lower(p.module) = lower(tcm.module_code)
        WHERE uhr.user_id = auth.uid()
          AND uhr.hotel_id = target_hotel_id
          AND uhr.active IS NOT FALSE
          AND h.active = true
          AND (tc.start_date IS NULL OR tc.start_date <= CURRENT_DATE)
          AND (tc.end_date IS NULL OR tc.end_date >= CURRENT_DATE)
      )
    );
$$;

REVOKE ALL ON FUNCTION public.has_hotel_permission(uuid, text) FROM PUBLIC;

-- RLS de las tablas comerciales.
ALTER TABLE public.tenant_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_contract_hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_contract_modules ENABLE ROW LEVEL SECURITY;

-- Los clientes/usuarios no administran contratos desde estas tablas directamente.
-- La administración se implementará mediante funciones/pantallas autorizadas.
-- El Superadmin podrá consultarlas mediante sus futuras políticas de plataforma.

DROP POLICY IF EXISTS tenant_contracts_select_superadmin
ON public.tenant_contracts;

CREATE POLICY tenant_contracts_select_superadmin
  ON public.tenant_contracts
  FOR SELECT
  TO authenticated
  USING (public.is_platform_superadmin());

DROP POLICY IF EXISTS tenant_contract_hotels_select_superadmin
ON public.tenant_contract_hotels;

CREATE POLICY tenant_contract_hotels_select_superadmin
  ON public.tenant_contract_hotels
  FOR SELECT
  TO authenticated
  USING (public.is_platform_superadmin());

DROP POLICY IF EXISTS tenant_contract_modules_select_superadmin
ON public.tenant_contract_modules;

CREATE POLICY tenant_contract_modules_select_superadmin
  ON public.tenant_contract_modules
  FOR SELECT
  TO authenticated
  USING (public.is_platform_superadmin());

COMMIT;
