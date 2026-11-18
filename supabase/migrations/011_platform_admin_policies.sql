-- Arias Suite — migración 011
-- Administración de plataforma: políticas para gestionar clientes,
-- hoteles, usuarios, roles, permisos y contratos desde Arias Suite.
--
-- La cuenta de plataforma privilegiada sigue siendo invisible en la UI.
-- Las políticas se basan exclusivamente en is_platform_admin().

BEGIN;

-- =========================================================
-- CLIENTES / HOTELES
-- =========================================================

DROP POLICY IF EXISTS tenants_platform_admin_all
ON public.tenants;

CREATE POLICY tenants_platform_admin_all
  ON public.tenants
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS hotels_platform_admin_all
ON public.hotels;

CREATE POLICY hotels_platform_admin_all
  ON public.hotels
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- =========================================================
-- PERFILES
-- =========================================================

DROP POLICY IF EXISTS profiles_platform_admin_select
ON public.profiles;

CREATE POLICY profiles_platform_admin_select
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin() OR id = auth.uid());

DROP POLICY IF EXISTS profiles_platform_admin_insert
ON public.profiles;

CREATE POLICY profiles_platform_admin_insert
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS profiles_platform_admin_update
ON public.profiles;

CREATE POLICY profiles_platform_admin_update
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin() OR id = auth.uid())
  WITH CHECK (public.is_platform_admin() OR id = auth.uid());

-- =========================================================
-- ROLES / PERMISOS
-- =========================================================

DROP POLICY IF EXISTS roles_platform_admin_all
ON public.roles;

CREATE POLICY roles_platform_admin_all
  ON public.roles
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS permissions_platform_admin_all
ON public.permissions;

CREATE POLICY permissions_platform_admin_all
  ON public.permissions
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS role_permissions_platform_admin_all
ON public.role_permissions;

CREATE POLICY role_permissions_platform_admin_all
  ON public.role_permissions
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- =========================================================
-- USUARIO ↔ HOTEL ↔ ROL
-- =========================================================

DROP POLICY IF EXISTS user_hotel_roles_platform_admin_all
ON public.user_hotel_roles;

CREATE POLICY user_hotel_roles_platform_admin_all
  ON public.user_hotel_roles
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS user_hotel_roles_select_self
ON public.user_hotel_roles;

CREATE POLICY user_hotel_roles_select_self
  ON public.user_hotel_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- =========================================================
-- CONTRATOS
-- =========================================================

DROP POLICY IF EXISTS tenant_contracts_platform_admin_all
ON public.tenant_contracts;

CREATE POLICY tenant_contracts_platform_admin_all
  ON public.tenant_contracts
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS tenant_contract_hotels_platform_admin_all
ON public.tenant_contract_hotels;

CREATE POLICY tenant_contract_hotels_platform_admin_all
  ON public.tenant_contract_hotels
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS tenant_contract_modules_platform_admin_all
ON public.tenant_contract_modules;

CREATE POLICY tenant_contract_modules_platform_admin_all
  ON public.tenant_contract_modules
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- =========================================================
-- ADMINISTRADORES DE PLATAFORMA
-- =========================================================

-- La cuenta de plataforma puede gestionarse desde la base, pero no desde
-- las pantallas de usuarios normales. No se concede escritura a authenticated
-- para evitar que una cuenta privilegiada pueda ser creada desde el cliente.
-- Las altas/cambios de este registro se realizarán mediante procedimiento
-- de administración controlado.

COMMIT;
