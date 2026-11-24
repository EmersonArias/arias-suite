-- Arias Suite — migración 016
-- Identidad de acceso independiente del correo electrónico.
--
-- No modifica ni reejecuta migraciones anteriores.

BEGIN;

-- =========================================================
-- IDENTIDAD DE ACCESO
-- =========================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS login_identifier text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS activation_code_hash text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS activation_code_expires_at timestamptz;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS activation_code_used_at timestamptz;

-- Asigna identificadores técnicos únicos a perfiles existentes.
-- Los administradores podrán cambiarlos posteriormente desde Usuarios.
UPDATE public.profiles
SET login_identifier = 'USR-' || upper(left(replace(id::text, '-', ''), 12))
WHERE login_identifier IS NULL
   OR btrim(login_identifier) = '';

ALTER TABLE public.profiles
  ALTER COLUMN login_identifier SET NOT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_login_identifier_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_login_identifier_check
  CHECK (
    length(btrim(login_identifier)) BETWEEN 3 AND 64
    AND login_identifier ~ '^[A-Z0-9._-]+$'
  );

CREATE UNIQUE INDEX IF NOT EXISTS ux_profiles_login_identifier_lower
  ON public.profiles (lower(login_identifier));

-- =========================================================
-- AUTORIZACIÓN POR USUARIO
-- =========================================================

CREATE OR REPLACE FUNCTION public.user_has_suite_access(target_user_id uuid)
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
      WHERE p.id = target_user_id
        AND p.active = true
        AND p.account_status = 'ACTIVE'
        AND EXISTS (
          SELECT 1
          FROM public.platform_admins pa
          WHERE pa.user_id = p.id
            AND pa.active = true
        )
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
      WHERE p.id = target_user_id
        AND p.active = true
        AND p.account_status = 'ACTIVE'
        AND (tc.start_date IS NULL OR tc.start_date <= CURRENT_DATE)
        AND (tc.end_date IS NULL OR tc.end_date >= CURRENT_DATE)
    );
$$;

REVOKE ALL ON FUNCTION public.user_has_suite_access(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_suite_access(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.has_suite_access()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.user_has_suite_access(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.has_suite_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_suite_access() TO authenticated;

-- =========================================================
-- PERFIL Y CORREO
-- =========================================================

-- Para cuentas sin correo individual, Auth utiliza un correo técnico interno.
-- Este correo no se expone como email de Arias Suite ni se usa para invitaciones.
-- El perfil conserva email NULL.
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    full_name,
    email,
    login_identifier
  )
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name'
    ),
    NULLIF(NEW.raw_user_meta_data ->> 'arias_real_email', ''),
    COALESCE(
      NULLIF(upper(NEW.raw_user_meta_data ->> 'login_identifier'), ''),
      'USR-' || upper(left(replace(NEW.id::text, '-', ''), 12))
    )
  )
  ON CONFLICT (id) DO UPDATE
  SET
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    login_identifier = COALESCE(
      EXCLUDED.login_identifier,
      public.profiles.login_identifier
    ),
    updated_at = now();

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_profile_email_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.profiles
  SET
    email = COALESCE(
      NULLIF(NEW.raw_user_meta_data ->> 'arias_real_email', ''),
      public.profiles.email
    ),
    updated_at = now()
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_updated_profile
ON auth.users;

CREATE TRIGGER on_auth_user_email_updated_profile
AFTER UPDATE OF email, raw_user_meta_data ON auth.users
FOR EACH ROW
WHEN (
  OLD.email IS DISTINCT FROM NEW.email
  OR OLD.raw_user_meta_data IS DISTINCT FROM NEW.raw_user_meta_data
)
EXECUTE FUNCTION public.sync_profile_email_from_auth();

REVOKE ALL ON FUNCTION public.sync_profile_email_from_auth() FROM PUBLIC;

-- =========================================================
-- ACTIVACIÓN
-- =========================================================

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
    activation_code_hash = NULL,
    activation_code_expires_at = NULL,
    activation_code_used_at = now(),
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

COMMIT;
