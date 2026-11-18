-- Arias Suite — migración 015
-- Ajustes de roles, informes y perfil propio.
--
-- No modifica ni reejecuta migraciones anteriores.

BEGIN;

-- =========================================================
-- AYUDANTE DE MANTENIMIENTO
-- =========================================================

UPDATE public.roles
SET
  name = 'Ayudante de mantenimiento',
  description = 'Consulta la información autorizada y puede ver/imprimir informes.',
  updated_at = now()
WHERE code = 'VIEWER';

-- El rol VIEWER solo puede conservar permisos de consulta o impresión.
DELETE FROM public.role_permissions rp
USING public.roles r, public.permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.code = 'VIEWER'
  AND p.action NOT IN ('view', 'print');

CREATE OR REPLACE FUNCTION public.enforce_viewer_read_only_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  role_code text;
  permission_action text;
BEGIN
  SELECT code
  INTO role_code
  FROM public.roles
  WHERE id = NEW.role_id;

  IF role_code = 'VIEWER' THEN
    SELECT action
    INTO permission_action
    FROM public.permissions
    WHERE id = NEW.permission_id;

    IF permission_action NOT IN ('view', 'print') THEN
      RAISE EXCEPTION 'El rol Ayudante de mantenimiento solo admite permisos de consulta e impresión.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_viewer_read_only_role_trigger
ON public.role_permissions;

CREATE TRIGGER enforce_viewer_read_only_role_trigger
BEFORE INSERT OR UPDATE
ON public.role_permissions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_viewer_read_only_role();

REVOKE ALL ON FUNCTION public.enforce_viewer_read_only_role() FROM PUBLIC;

-- =========================================================
-- INFORMES
-- =========================================================

INSERT INTO public.permissions (code, name, module, action, description)
VALUES
  ('reports.view', 'Consultar informes', 'reports', 'view', 'Permite consultar los informes disponibles.'),
  ('reports.print', 'Imprimir informes', 'reports', 'print', 'Permite imprimir o guardar en PDF los informes disponibles.')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  action = EXCLUDED.action,
  description = EXCLUDED.description;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.active = true
  AND p.code IN ('reports.view', 'reports.print')
ON CONFLICT DO NOTHING;

-- =========================================================
-- SINCRONIZACIÓN DEL NOMBRE PROPIO
-- =========================================================

UPDATE public.profiles p
SET
  full_name = NULLIF(
    COALESCE(
      au.raw_user_meta_data ->> 'full_name',
      au.raw_user_meta_data ->> 'name',
      ''
    ),
    ''
  ),
  updated_at = now()
FROM auth.users au
WHERE au.id = p.id
  AND NULLIF(
    COALESCE(
      au.raw_user_meta_data ->> 'full_name',
      au.raw_user_meta_data ->> 'name',
      ''
    ),
    ''
  ) IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_profile_name_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.profiles
  SET
    full_name = NULLIF(
      COALESCE(
        NEW.raw_user_meta_data ->> 'full_name',
        NEW.raw_user_meta_data ->> 'name',
        ''
      ),
      ''
    ),
    updated_at = now()
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_metadata_updated_profile
ON auth.users;

CREATE TRIGGER on_auth_user_metadata_updated_profile
AFTER UPDATE OF raw_user_meta_data ON auth.users
FOR EACH ROW
WHEN (
  OLD.raw_user_meta_data IS DISTINCT FROM NEW.raw_user_meta_data
)
EXECUTE FUNCTION public.sync_profile_name_from_auth();

REVOKE ALL ON FUNCTION public.sync_profile_name_from_auth() FROM PUBLIC;

COMMIT;
