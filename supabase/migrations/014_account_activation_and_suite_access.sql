-- Arias Suite — migración 014
-- Cierra el ciclo de identidad y autorización de acceso a la aplicación.
--
-- No modifica ni reejecuta migraciones anteriores.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'ACTIVE';

UPDATE public.profiles
SET account_status = CASE
  WHEN active THEN 'ACTIVE'
  ELSE 'INACTIVE'
END
WHERE account_status IS NULL
   OR account_status NOT IN ('PENDING_INVITATION', 'ACTIVE', 'INACTIVE');

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_account_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_account_status_check
  CHECK (account_status IN ('PENDING_INVITATION', 'ACTIVE', 'INACTIVE'));

-- El usuario final no modifica directamente su perfil. Los cambios de identidad
-- y de estado se realizan mediante funciones/capas de administración controladas.
DROP POLICY IF EXISTS profiles_update_own
ON public.profiles;

CREATE OR REPLACE FUNCTION public.has_suite_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.active = true
        AND p.account_status = 'ACTIVE'
        AND public.is_platform_admin()
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.user_hotel_roles uhr
        ON uhr.user_id = p.id
       AND uhr.active IS NOT FALSE
      JOIN public.hotels h
        ON h.id = uhr.hotel_id
       AND h.active = true
      JOIN public.roles r
        ON r.id = uhr.role_id
       AND r.active = true
      JOIN public.tenant_contract_hotels tch
        ON tch.hotel_id = h.id
       AND tch.active = true
      JOIN public.tenant_contracts tc
        ON tc.id = tch.contract_id
       AND tc.tenant_id = h.tenant_id
       AND tc.status = 'ACTIVE'
      WHERE p.id = auth.uid()
        AND p.active = true
        AND p.account_status = 'ACTIVE'
        AND (tc.start_date IS NULL OR tc.start_date <= CURRENT_DATE)
        AND (tc.end_date IS NULL OR tc.end_date >= CURRENT_DATE)
    );
$$;

REVOKE ALL ON FUNCTION public.has_suite_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_suite_access() TO authenticated;

-- Una cuenta invitada solo puede pasar de PENDING_INVITATION a ACTIVE
-- después de haber establecido su propia contraseña desde el enlace de invitación.
CREATE OR REPLACE FUNCTION public.activate_my_account()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.profiles
  SET
    account_status = 'ACTIVE',
    updated_at = now()
  WHERE id = auth.uid()
    AND active = true
    AND account_status = 'PENDING_INVITATION';

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_my_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_my_account() TO authenticated;

-- El acceso efectivo sigue dependiendo de has_suite_access().
-- Las funciones RLS existentes continúan aplicando usuario -> hotel -> rol -> permiso.

COMMIT;
