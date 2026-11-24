-- Arias Suite — migración 066
-- Catálogo jerárquico de ubicaciones configurable por hotel.
-- Diseño flexible: una ubicación puede ser planta, habitación, espacio técnico,
-- zona común, almacén u otro tipo; no impone niveles universales.
-- Mantiene los campos de texto existentes y NO crea asociaciones automáticas.
-- Las migraciones 001–065 permanecen sin cambios.

BEGIN;

CREATE TABLE IF NOT EXISTS public.hotel_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE RESTRICT,
  parent_location_id uuid,
  location_type text NOT NULL DEFAULT 'OTRO',
  code text,
  name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hotel_locations_hotel_id_id_key UNIQUE (hotel_id, id),
  CONSTRAINT hotel_locations_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT hotel_locations_type_not_blank CHECK (length(btrim(location_type)) > 0),
  CONSTRAINT hotel_locations_not_own_parent CHECK (
    parent_location_id IS NULL OR parent_location_id <> id
  ),
  CONSTRAINT hotel_locations_parent_same_hotel_fkey
    FOREIGN KEY (hotel_id, parent_location_id)
    REFERENCES public.hotel_locations (hotel_id, id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS ix_hotel_locations_hotel_parent_order
  ON public.hotel_locations (hotel_id, parent_location_id, sort_order, name);

CREATE INDEX IF NOT EXISTS ix_hotel_locations_hotel_active
  ON public.hotel_locations (hotel_id, active, location_type);

CREATE UNIQUE INDEX IF NOT EXISTS ux_hotel_locations_root_name
  ON public.hotel_locations (hotel_id, lower(btrim(name)))
  WHERE parent_location_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_hotel_locations_child_name
  ON public.hotel_locations (hotel_id, parent_location_id, lower(btrim(name)))
  WHERE parent_location_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_hotel_locations_code
  ON public.hotel_locations (hotel_id, lower(btrim(code)))
  WHERE code IS NOT NULL AND btrim(code) <> '';

COMMENT ON TABLE public.hotel_locations IS
  'Catálogo jerárquico de ubicaciones físicas por hotel. Ubicaciones y activos son entidades distintas; no usar para duplicar activos físicos.';
COMMENT ON COLUMN public.hotel_locations.parent_location_id IS
  'Ubicación superior opcional del mismo hotel. No representa una secuencia fija de niveles.';
COMMENT ON COLUMN public.hotel_locations.location_type IS
  'Tipo flexible de ubicación; admite valores configurables por hotel/producto.';
COMMENT ON COLUMN public.hotel_locations.active IS
  'La desactivación conserva el histórico y las relaciones existentes.';

-- Valida jerarquía, aislamiento por hotel y desactivación segura.
CREATE OR REPLACE FUNCTION public.validate_hotel_location_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  cycle_found boolean := false;
  active_descendant_found boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.hotel_id IS DISTINCT FROM OLD.hotel_id THEN
    RAISE EXCEPTION 'Una ubicación no se puede trasladar a otro hotel.';
  END IF;

  IF NEW.parent_location_id IS NOT NULL THEN
    IF NEW.parent_location_id = NEW.id THEN
      RAISE EXCEPTION 'Una ubicación no puede ser su propia ubicación superior.';
    END IF;

    WITH RECURSIVE ancestors(id, parent_location_id) AS (
      SELECT l.id, l.parent_location_id
      FROM public.hotel_locations l
      WHERE l.hotel_id = NEW.hotel_id
        AND l.id = NEW.parent_location_id
      UNION
      SELECT parent.id, parent.parent_location_id
      FROM public.hotel_locations parent
      JOIN ancestors child ON parent.id = child.parent_location_id
      WHERE parent.hotel_id = NEW.hotel_id
    )
    SELECT EXISTS (
      SELECT 1 FROM ancestors WHERE id = NEW.id
    )
    INTO cycle_found;

    IF cycle_found THEN
      RAISE EXCEPTION 'La ubicación superior crearía un ciclo en la jerarquía.';
    END IF;

    -- Al crear una ubicación o cambiar su ubicación superior, el padre debe
    -- estar activo. No bloquear la edición/desactivación de un hijo existente
    -- solo porque su padre se haya desactivado tras desactivar el subárbol.
    IF TG_OP = 'INSERT' THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.hotel_locations parent
        WHERE parent.id = NEW.parent_location_id
          AND parent.hotel_id = NEW.hotel_id
          AND parent.active = true
      ) THEN
        RAISE EXCEPTION 'La ubicación superior debe existir y estar activa en este hotel.';
      END IF;
    ELSIF NEW.parent_location_id IS DISTINCT FROM OLD.parent_location_id THEN
      IF NOT EXISTS (
        SELECT 1
        FROM public.hotel_locations parent
        WHERE parent.id = NEW.parent_location_id
          AND parent.hotel_id = NEW.hotel_id
          AND parent.active = true
      ) THEN
        RAISE EXCEPTION 'La ubicación superior debe existir y estar activa en este hotel.';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.active = false
     AND NEW.active = true
     AND NEW.parent_location_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.hotel_locations parent
      WHERE parent.id = NEW.parent_location_id
        AND parent.hotel_id = NEW.hotel_id
        AND parent.active = true
    ) THEN
      RAISE EXCEPTION 'No se puede activar una ubicación cuyo padre está inactivo.';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.active = true AND NEW.active = false THEN
    WITH RECURSIVE descendants(id, parent_location_id, active) AS (
      SELECT l.id, l.parent_location_id, l.active
      FROM public.hotel_locations l
      WHERE l.hotel_id = NEW.hotel_id
        AND l.parent_location_id = NEW.id
      UNION
      SELECT child.id, child.parent_location_id, child.active
      FROM public.hotel_locations child
      JOIN descendants parent ON child.parent_location_id = parent.id
      WHERE child.hotel_id = NEW.hotel_id
    )
    SELECT EXISTS (
      SELECT 1 FROM descendants WHERE active = true
    )
    INTO active_descendant_found;

    IF active_descendant_found THEN
      RAISE EXCEPTION 'No se puede desactivar una ubicación con ubicaciones activas debajo. Desactívalas primero.';
    END IF;
  END IF;

  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_hotel_location_hierarchy() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_validate_hotel_location_hierarchy
  ON public.hotel_locations;

CREATE TRIGGER trg_validate_hotel_location_hierarchy
BEFORE INSERT OR UPDATE ON public.hotel_locations
FOR EACH ROW
EXECUTE FUNCTION public.validate_hotel_location_hierarchy();

ALTER TABLE public.hotel_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hotel_locations_select ON public.hotel_locations;
CREATE POLICY hotel_locations_select
  ON public.hotel_locations
  FOR SELECT
  TO authenticated
  USING (public.has_hotel_access(hotel_id));

DROP POLICY IF EXISTS hotel_locations_insert ON public.hotel_locations;
CREATE POLICY hotel_locations_insert
  ON public.hotel_locations
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_hotel_permission(hotel_id, 'maintenance.create'));

DROP POLICY IF EXISTS hotel_locations_update ON public.hotel_locations;
CREATE POLICY hotel_locations_update
  ON public.hotel_locations
  FOR UPDATE
  TO authenticated
  USING (public.has_hotel_permission(hotel_id, 'maintenance.update'))
  WITH CHECK (public.has_hotel_permission(hotel_id, 'maintenance.update'));

-- No hay política DELETE ni privilegio DELETE: las ubicaciones se desactivan.
REVOKE ALL PRIVILEGES ON TABLE public.hotel_locations FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hotel_locations TO authenticated;

-- Añadir relaciones opcionales a las entidades físicas/operativas existentes.
-- Se dejan NULL para no inferir la ubicación de ningún registro antiguo.
ALTER TABLE public.apparatus_registry
  ADD COLUMN IF NOT EXISTS location_id uuid;
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS location_id uuid;
ALTER TABLE public.electrical_panels
  ADD COLUMN IF NOT EXISTS location_id uuid;
ALTER TABLE public.maintenance_pending_items
  ADD COLUMN IF NOT EXISTS location_id uuid;
ALTER TABLE public.maintenance_blocked_rooms
  ADD COLUMN IF NOT EXISTS location_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'apparatus_registry_location_hotel_required'
      AND conrelid = 'public.apparatus_registry'::regclass
  ) THEN
    ALTER TABLE public.apparatus_registry
      ADD CONSTRAINT apparatus_registry_location_hotel_required
      CHECK (location_id IS NULL OR hotel_id IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assets_location_hotel_required'
      AND conrelid = 'public.assets'::regclass
  ) THEN
    ALTER TABLE public.assets
      ADD CONSTRAINT assets_location_hotel_required
      CHECK (location_id IS NULL OR hotel_id IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'electrical_panels_location_hotel_required'
      AND conrelid = 'public.electrical_panels'::regclass
  ) THEN
    ALTER TABLE public.electrical_panels
      ADD CONSTRAINT electrical_panels_location_hotel_required
      CHECK (location_id IS NULL OR hotel_id IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'maintenance_pending_location_hotel_required'
      AND conrelid = 'public.maintenance_pending_items'::regclass
  ) THEN
    ALTER TABLE public.maintenance_pending_items
      ADD CONSTRAINT maintenance_pending_location_hotel_required
      CHECK (location_id IS NULL OR hotel_id IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'maintenance_blocked_location_hotel_required'
      AND conrelid = 'public.maintenance_blocked_rooms'::regclass
  ) THEN
    ALTER TABLE public.maintenance_blocked_rooms
      ADD CONSTRAINT maintenance_blocked_location_hotel_required
      CHECK (location_id IS NULL OR hotel_id IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'apparatus_registry_location_scope_fkey'
      AND conrelid = 'public.apparatus_registry'::regclass
  ) THEN
    ALTER TABLE public.apparatus_registry
      ADD CONSTRAINT apparatus_registry_location_scope_fkey
      FOREIGN KEY (hotel_id, location_id)
      REFERENCES public.hotel_locations (hotel_id, id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assets_location_scope_fkey'
      AND conrelid = 'public.assets'::regclass
  ) THEN
    ALTER TABLE public.assets
      ADD CONSTRAINT assets_location_scope_fkey
      FOREIGN KEY (hotel_id, location_id)
      REFERENCES public.hotel_locations (hotel_id, id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'electrical_panels_location_scope_fkey'
      AND conrelid = 'public.electrical_panels'::regclass
  ) THEN
    ALTER TABLE public.electrical_panels
      ADD CONSTRAINT electrical_panels_location_scope_fkey
      FOREIGN KEY (hotel_id, location_id)
      REFERENCES public.hotel_locations (hotel_id, id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'maintenance_pending_location_scope_fkey'
      AND conrelid = 'public.maintenance_pending_items'::regclass
  ) THEN
    ALTER TABLE public.maintenance_pending_items
      ADD CONSTRAINT maintenance_pending_location_scope_fkey
      FOREIGN KEY (hotel_id, location_id)
      REFERENCES public.hotel_locations (hotel_id, id)
      ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'maintenance_blocked_location_scope_fkey'
      AND conrelid = 'public.maintenance_blocked_rooms'::regclass
  ) THEN
    ALTER TABLE public.maintenance_blocked_rooms
      ADD CONSTRAINT maintenance_blocked_location_scope_fkey
      FOREIGN KEY (hotel_id, location_id)
      REFERENCES public.hotel_locations (hotel_id, id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS ix_apparatus_registry_location_id
  ON public.apparatus_registry (hotel_id, location_id)
  WHERE location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_assets_location_id
  ON public.assets (hotel_id, location_id)
  WHERE location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_electrical_panels_location_id
  ON public.electrical_panels (hotel_id, location_id)
  WHERE location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_maintenance_pending_location_id
  ON public.maintenance_pending_items (hotel_id, location_id)
  WHERE location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_maintenance_blocked_location_id
  ON public.maintenance_blocked_rooms (hotel_id, location_id)
  WHERE location_id IS NOT NULL;

COMMIT;
