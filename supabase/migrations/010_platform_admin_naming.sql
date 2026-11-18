-- Arias Suite — migración 010
-- Oculta el concepto de administración privilegiada de la interfaz
-- y normaliza su nomenclatura interna actual como administración de plataforma.
--
-- IMPORTANTE:
--   007 y 009 ya fueron ejecutadas y no se modifican.
--   Esta migración adapta el estado actual de la base sin reescribir historial.

BEGIN;

-- =========================================================
-- NOMBRE INTERNO DE LA CUENTA PRIVILEGIADA
-- =========================================================

ALTER TABLE public.platform_superadmins
  RENAME TO platform_admins;

ALTER TABLE public.platform_admins
  RENAME CONSTRAINT platform_superadmins_pkey
  TO platform_admins_pkey;

ALTER TABLE public.platform_admins
  RENAME CONSTRAINT platform_superadmins_platform_identifier_key
  TO platform_admins_platform_identifier_key;

ALTER TABLE public.platform_admins
  RENAME CONSTRAINT platform_superadmins_identifier_check
  TO platform_admins_identifier_check;

ALTER INDEX IF EXISTS public.ix_platform_superadmins_active
  RENAME TO ix_platform_admins_active;

ALTER POLICY platform_superadmins_select_own
  ON public.platform_admins
  RENAME TO platform_admins_select_own;

-- =========================================================
-- FUNCIÓN DE IDENTIFICACIÓN DE LA CUENTA DE PLATAFORMA
-- =========================================================

ALTER FUNCTION public.is_platform_superadmin()
  RENAME TO is_platform_admin;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins pa
    WHERE pa.user_id = auth.uid()
      AND pa.active = true
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;

-- =========================================================
-- ACTUALIZAR FUNCIONES DE ACCESO
-- =========================================================

CREATE OR REPLACE FUNCTION public.has_hotel_access(target_hotel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    public.is_platform_admin()
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
    public.is_platform_admin()
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
    public.is_platform_admin()
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

REVOKE ALL ON FUNCTION public.has_hotel_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_hotel_module_access(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_hotel_permission(uuid, text) FROM PUBLIC;

COMMIT;
