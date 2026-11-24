-- Arias Suite — base multi-tenant / multi-hotel
-- Fase 1: crea el núcleo de aislamiento. No modifica todavía las tablas operativas existentes.
-- Las tablas operativas recibirán hotel_id en una migración posterior, después de auditar
-- exactamente qué tablas existen en la base actual.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hotels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotels_tenant_code_key UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  module text NOT NULL,
  action text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.user_hotel_roles (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, hotel_id, role_id)
);

CREATE INDEX IF NOT EXISTS ix_hotels_tenant_id
  ON public.hotels (tenant_id);

CREATE INDEX IF NOT EXISTS ix_user_hotel_roles_user_id
  ON public.user_hotel_roles (user_id);

CREATE INDEX IF NOT EXISTS ix_user_hotel_roles_hotel_id
  ON public.user_hotel_roles (hotel_id);

CREATE INDEX IF NOT EXISTS ix_user_hotel_roles_role_id
  ON public.user_hotel_roles (role_id);

-- Helper: hoteles a los que el usuario autenticado pertenece.
CREATE OR REPLACE FUNCTION public.has_hotel_access(target_hotel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_hotel_roles uhr
    WHERE uhr.user_id = auth.uid()
      AND uhr.hotel_id = target_hotel_id
  );
$$;

REVOKE ALL ON FUNCTION public.has_hotel_access(uuid) FROM PUBLIC;

-- Helper: determina si el usuario tiene un permiso concreto en un hotel.
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
  SELECT EXISTS (
    SELECT 1
    FROM public.user_hotel_roles uhr
    JOIN public.role_permissions rp
      ON rp.role_id = uhr.role_id
    JOIN public.permissions p
      ON p.id = rp.permission_id
    WHERE uhr.user_id = auth.uid()
      AND uhr.hotel_id = target_hotel_id
      AND p.code = permission_code
  );
$$;

REVOKE ALL ON FUNCTION public.has_hotel_permission(uuid, text) FROM PUBLIC;

-- RLS del núcleo.
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_hotel_roles ENABLE ROW LEVEL SECURITY;

-- El usuario solo puede ver su propio perfil.
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Acceso de lectura al hotel/cliente solo a través de una relación hotel-usuario.
DROP POLICY IF EXISTS hotels_select_members ON public.hotels;
CREATE POLICY hotels_select_members
  ON public.hotels
  FOR SELECT
  TO authenticated
  USING (public.has_hotel_access(id));

DROP POLICY IF EXISTS tenants_select_members ON public.tenants;
CREATE POLICY tenants_select_members
  ON public.tenants
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.hotels h
      WHERE h.tenant_id = tenants.id
        AND public.has_hotel_access(h.id)
    )
  );

DROP POLICY IF EXISTS user_hotel_roles_select_self ON public.user_hotel_roles;
CREATE POLICY user_hotel_roles_select_self
  ON public.user_hotel_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Roles y permisos quedan cerrados hasta que definamos la administración.
-- No se crean políticas de lectura/escritura para authenticated todavía.

-- Perfil automático al crear una cuenta de Supabase Auth.
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name'
    )
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile
ON auth.users;

CREATE TRIGGER on_auth_user_created_profile
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_profile();

-- Datos iniciales del entorno actual. No duplica si ya existen.
INSERT INTO public.tenants (code, name)
VALUES ('SBH', 'SB Hotels')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.hotels (tenant_id, code, name)
SELECT id, 'SB-DZ', 'Hotel SB Diagonal Zero'
FROM public.tenants
WHERE code = 'SBH'
ON CONFLICT (tenant_id, code) DO NOTHING;

COMMIT;
