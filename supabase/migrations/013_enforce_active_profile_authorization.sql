-- Arias Suite — migración 013
-- Refuerza la autorización para que un perfil inactivo no pueda acceder
-- a datos operativos aunque conserve una sesión Auth válida.
--
-- Las migraciones 001–012 son inmutables.

BEGIN;

CREATE OR REPLACE FUNCTION public.has_hotel_access(target_hotel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    (
      public.is_platform_admin()
      AND EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.active = true
      )
    )
    OR (
      EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.active = true
      )
      AND EXISTS (
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
      )
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
    public.has_hotel_access(target_hotel_id)
    AND (
      public.is_platform_admin()
      OR EXISTS (
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
    public.has_hotel_access(target_hotel_id)
    AND (
      public.is_platform_admin()
      OR EXISTS (
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
