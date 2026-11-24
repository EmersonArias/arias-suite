-- Arias Suite — migración 012
-- Base de identidad para la administración de usuarios.
--
-- Añade el correo al perfil visible de aplicación y mantiene sincronizada
-- la información básica con Supabase Auth.
--
-- La creación/eliminación real de cuentas Auth se realizará en una capa
-- servidor/Edge Function; nunca se expondrá service_role al navegador.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_profiles_email_lower
  ON public.profiles (lower(email))
  WHERE email IS NOT NULL;

-- Sincroniza perfiles ya existentes con Auth.
UPDATE public.profiles p
SET email = au.email
FROM auth.users au
WHERE au.id = p.id
  AND p.email IS DISTINCT FROM au.email;

-- Actualiza el trigger de creación de perfil para guardar nombre y correo.
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name'
    ),
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE
  SET
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    email = EXCLUDED.email,
    updated_at = now();

  RETURN NEW;
END;
$$;

-- Mantiene el correo del perfil alineado si cambia en Auth.
CREATE OR REPLACE FUNCTION public.sync_profile_email_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.profiles
  SET
    email = NEW.email,
    updated_at = now()
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_updated_profile
ON auth.users;

CREATE TRIGGER on_auth_user_email_updated_profile
AFTER UPDATE OF email ON auth.users
FOR EACH ROW
WHEN (OLD.email IS DISTINCT FROM NEW.email)
EXECUTE FUNCTION public.sync_profile_email_from_auth();

REVOKE ALL ON FUNCTION public.sync_profile_email_from_auth() FROM PUBLIC;

COMMIT;
