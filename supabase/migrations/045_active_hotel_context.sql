-- Arias Suite — migración 045
-- Contexto de hotel activo por usuario.
--
-- El hotel seleccionado se convierte en el ámbito de trabajo de toda la aplicación.
-- La selección queda en base de datos y las tablas hotelizadas quedan filtradas
-- automáticamente por RLS mediante has_hotel_access / has_hotel_permission.
--
-- El Superadmin de plataforma puede seleccionar cualquier hotel activo.
-- Los demás usuarios solo pueden seleccionar un hotel al que estén asignados.

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_hotel_context (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE RESTRICT,
  selected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_user_hotel_context_hotel
  ON public.user_hotel_context (hotel_id);

ALTER TABLE public.user_hotel_context ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_hotel_context_select_own
ON public.user_hotel_context;

CREATE POLICY user_hotel_context_select_own
  ON public.user_hotel_context
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.get_active_hotel()
RETURNS TABLE (
  id uuid,
  code text,
  name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT h.id, h.code, h.name
  FROM public.user_hotel_context c
  JOIN public.hotels h
    ON h.id = c.hotel_id
   AND h.active = true
  WHERE c.user_id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_active_hotel() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_hotel() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_active_hotel(
  target_hotel_id uuid
)
RETURNS TABLE (
  id uuid,
  code text,
  name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  allowed boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.hotels h
    WHERE h.id = target_hotel_id
      AND h.active = true
      AND (
        public.is_platform_admin()
        OR EXISTS (
          SELECT 1
          FROM public.user_hotel_roles uhr
          JOIN public.profiles p
            ON p.id = uhr.user_id
           AND p.active = true
           AND p.account_status = 'ACTIVE'
          WHERE uhr.user_id = auth.uid()
            AND uhr.hotel_id = h.id
            AND uhr.active IS NOT FALSE
        )
      )
  )
  INTO allowed;

  IF NOT allowed THEN
    RAISE EXCEPTION 'No tienes acceso a este hotel.';
  END IF;

  INSERT INTO public.user_hotel_context (user_id, hotel_id, selected_at, updated_at)
  VALUES (auth.uid(), target_hotel_id, now(), now())
  ON CONFLICT (user_id)
  DO UPDATE SET
    hotel_id = EXCLUDED.hotel_id,
    selected_at = EXCLUDED.selected_at,
    updated_at = EXCLUDED.updated_at;

  RETURN QUERY
  SELECT h.id, h.code, h.name
  FROM public.hotels h
  WHERE h.id = target_hotel_id
    AND h.active = true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_active_hotel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_active_hotel(uuid) TO authenticated;

-- Los usuarios necesitan poder consultar los hoteles a los que están asignados
-- para la pantalla inicial de selección. Esto no concede acceso a los datos del hotel.
DROP POLICY IF EXISTS hotels_select_members
ON public.hotels;

CREATE POLICY hotels_select_members
  ON public.hotels
  FOR SELECT
  TO authenticated
  USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_hotel_roles uhr
      JOIN public.profiles p
        ON p.id = uhr.user_id
       AND p.active = true
       AND p.account_status = 'ACTIVE'
      WHERE uhr.user_id = auth.uid()
        AND uhr.hotel_id = hotels.id
        AND uhr.active IS NOT FALSE
    )
  );

-- El contexto activo es ahora obligatorio para consultar datos hotelizados
-- mediante los helpers de seguridad.
CREATE OR REPLACE FUNCTION public.has_hotel_access(
  target_hotel_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_hotel_context c
    JOIN public.hotels h
      ON h.id = c.hotel_id
     AND h.active = true
    WHERE c.user_id = auth.uid()
      AND c.hotel_id = target_hotel_id
  )
  AND (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_hotel_roles uhr
      JOIN public.profiles p
        ON p.id = uhr.user_id
       AND p.active = true
       AND p.account_status = 'ACTIVE'
      WHERE uhr.user_id = auth.uid()
        AND uhr.hotel_id = target_hotel_id
        AND uhr.active IS NOT FALSE
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
