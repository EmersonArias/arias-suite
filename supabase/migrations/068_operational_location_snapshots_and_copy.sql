-- Arias Suite — migración 068
-- Ubicación trazable en OT + copia transaccional de subárboles lógicos.
-- No modifica migraciones anteriores ni rellena ubicaciones antiguas por inferencia.
-- Aplicar una sola vez después de 067 en el proyecto Supabase correcto.
BEGIN;

ALTER TABLE public.maintenance_work_orders
  ADD COLUMN IF NOT EXISTS reported_location_id uuid,
  ADD COLUMN IF NOT EXISTS reported_location_snapshot text,
  ADD COLUMN IF NOT EXISTS execution_location_id uuid,
  ADD COLUMN IF NOT EXISTS execution_location_snapshot text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'maintenance_work_orders_reported_location_scope_fkey'
      AND conrelid = 'public.maintenance_work_orders'::regclass
  ) THEN
    ALTER TABLE public.maintenance_work_orders
      ADD CONSTRAINT maintenance_work_orders_reported_location_scope_fkey
      FOREIGN KEY (hotel_id, reported_location_id)
      REFERENCES public.hotel_locations (hotel_id, id)
      ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'maintenance_work_orders_execution_location_scope_fkey'
      AND conrelid = 'public.maintenance_work_orders'::regclass
  ) THEN
    ALTER TABLE public.maintenance_work_orders
      ADD CONSTRAINT maintenance_work_orders_execution_location_scope_fkey
      FOREIGN KEY (hotel_id, execution_location_id)
      REFERENCES public.hotel_locations (hotel_id, id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS ix_work_orders_reported_location
  ON public.maintenance_work_orders (hotel_id, reported_location_id)
  WHERE reported_location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_work_orders_execution_location
  ON public.maintenance_work_orders (hotel_id, execution_location_id)
  WHERE execution_location_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.hotel_location_path(
  target_hotel_id uuid,
  target_location_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH RECURSIVE ancestry(id, parent_location_id, name, depth, visited) AS (
    SELECT l.id, l.parent_location_id, l.name, 0, ARRAY[l.id]::uuid[]
    FROM public.hotel_locations l
    WHERE l.hotel_id = target_hotel_id AND l.id = target_location_id
    UNION ALL
    SELECT parent.id, parent.parent_location_id, parent.name,
           child.depth + 1, child.visited || parent.id
    FROM public.hotel_locations parent
    JOIN ancestry child ON child.parent_location_id = parent.id
    WHERE parent.hotel_id = target_hotel_id
      AND NOT parent.id = ANY(child.visited)
  )
  SELECT string_agg(name, ' / ' ORDER BY depth DESC)
  FROM ancestry;
$$;
REVOKE ALL ON FUNCTION public.hotel_location_path(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.snapshot_maintenance_work_order_locations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  source_equipment_id uuid;
  source_location_id uuid;
  source_plant text;
  source_location text;
BEGIN
  source_equipment_id := NEW.apparatus_registry_id;
  IF source_equipment_id IS NULL AND NEW.maintenance_plan_id IS NOT NULL THEN
    SELECT mp.apparatus_registry_id
      INTO source_equipment_id
    FROM public.maintenance_plans mp
    WHERE mp.id = NEW.maintenance_plan_id AND mp.hotel_id = NEW.hotel_id;
  END IF;
  IF source_equipment_id IS NOT NULL THEN
    SELECT ar.location_id, ar.plant, ar.location
      INTO source_location_id, source_plant, source_location
    FROM public.apparatus_registry ar
    WHERE ar.id = source_equipment_id AND ar.hotel_id = NEW.hotel_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.reported_location_id IS NULL AND source_location_id IS NOT NULL THEN
      NEW.reported_location_id := source_location_id;
    END IF;
    IF NEW.reported_location_snapshot IS NULL THEN
      IF NEW.reported_location_id IS NOT NULL THEN
        NEW.reported_location_snapshot := public.hotel_location_path(NEW.hotel_id, NEW.reported_location_id);
      ELSE
        NEW.reported_location_snapshot := NULLIF(
          concat_ws(' · ', NULLIF(btrim(source_plant), ''), NULLIF(btrim(source_location), '')),
          ''
        );
      END IF;
    END IF;
    IF NEW.status = 'COMPLETED' THEN
      NEW.execution_location_id := COALESCE(NEW.execution_location_id, NEW.reported_location_id);
      IF NEW.execution_location_snapshot IS NULL THEN
        NEW.execution_location_snapshot := COALESCE(
          public.hotel_location_path(NEW.hotel_id, NEW.execution_location_id),
          NEW.reported_location_snapshot,
          NULLIF(concat_ws(' · ', NULLIF(btrim(source_plant), ''), NULLIF(btrim(source_location), '')), '')
        );
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- Las instantáneas existentes son evidencia histórica y nunca se recalculan.
  IF OLD.reported_location_snapshot IS NOT NULL THEN
    IF NEW.reported_location_id IS DISTINCT FROM OLD.reported_location_id THEN
      RAISE EXCEPTION 'La ubicación comunicada original de una OT no se puede cambiar; conserva la instantánea histórica.';
    END IF;
    NEW.reported_location_snapshot := OLD.reported_location_snapshot;
  ELSIF NEW.reported_location_id IS DISTINCT FROM OLD.reported_location_id
        AND NEW.reported_location_id IS NOT NULL THEN
    NEW.reported_location_snapshot := public.hotel_location_path(NEW.hotel_id, NEW.reported_location_id);
  END IF;

  IF OLD.status = 'COMPLETED'
     AND NEW.execution_location_id IS DISTINCT FROM OLD.execution_location_id THEN
    RAISE EXCEPTION 'La ubicación de ejecución de una OT cerrada no se puede modificar.';
  END IF;

  IF OLD.execution_location_snapshot IS NOT NULL THEN
    NEW.execution_location_snapshot := OLD.execution_location_snapshot;
  ELSIF NEW.status = 'COMPLETED' AND OLD.status IS DISTINCT FROM 'COMPLETED' THEN
    NEW.execution_location_id := COALESCE(NEW.execution_location_id, NEW.reported_location_id);
    NEW.execution_location_snapshot := COALESCE(
      public.hotel_location_path(NEW.hotel_id, NEW.execution_location_id),
      NEW.reported_location_snapshot,
      NULLIF(concat_ws(' · ', NULLIF(btrim(source_plant), ''), NULLIF(btrim(source_location), '')), '')
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.snapshot_maintenance_work_order_locations() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_snapshot_maintenance_work_order_locations ON public.maintenance_work_orders;
CREATE TRIGGER trg_snapshot_maintenance_work_order_locations
BEFORE INSERT OR UPDATE ON public.maintenance_work_orders
FOR EACH ROW EXECUTE FUNCTION public.snapshot_maintenance_work_order_locations();

-- Mantiene las columnas anteriores en el mismo orden y añade las nuevas al final.
-- Corrige la unión de equipos en OTs operativas sin plan PAM.
CREATE OR REPLACE VIEW public.maintenance_work_orders_resolved
WITH (security_invoker = true)
AS
SELECT
  wo.id,
  wo.hotel_id,
  wo.scheduled_job_id,
  wo.maintenance_plan_id,
  wo.title,
  wo.description,
  wo.work_type,
  wo.status,
  wo.assigned_user_id,
  p.full_name AS assigned_user_name,
  p.email AS assigned_user_email,
  wo.scheduled_date,
  wo.started_at,
  wo.completed_at,
  wo.completed_by,
  wo.observations,
  mp.code AS maintenance_plan_code,
  mp.name AS maintenance_plan_name,
  mp.maintenance_type,
  COALESCE(wo.apparatus_registry_id, mp.apparatus_registry_id) AS apparatus_registry_id,
  ar.code AS apparatus_code,
  ar.name AS apparatus_name,
  ar.plant,
  ar.location,
  j.plan_year,
  j.month_number,
  j.week_slot,
  j.source_mark_id,
  wo.created_at,
  wo.updated_at,
  wo.ot_number,
  wo.generation_mode,
  wo.completion_timing,
  wo.parent_work_order_id,
  wo.apparatus_registry_id AS work_order_apparatus_registry_id,
  wo.priority,
  COALESCE(wo.apparatus_registry_id, mp.apparatus_registry_id) AS resolved_apparatus_registry_id,
  wo.reported_location_id,
  wo.reported_location_snapshot,
  wo.execution_location_id,
  wo.execution_location_snapshot
FROM public.maintenance_work_orders wo
LEFT JOIN public.maintenance_plans mp ON mp.id = wo.maintenance_plan_id
LEFT JOIN public.maintenance_scheduled_jobs j ON j.id = wo.scheduled_job_id
LEFT JOIN public.apparatus_registry ar
  ON ar.id = COALESCE(wo.apparatus_registry_id, mp.apparatus_registry_id)
LEFT JOIN public.profiles p ON p.id = wo.assigned_user_id;

CREATE OR REPLACE FUNCTION public.create_operational_work_order_at_location(
  target_hotel_id uuid,
  target_work_type text,
  target_title text,
  target_reported_location_id uuid,
  target_description text DEFAULT NULL,
  target_apparatus_registry_id uuid DEFAULT NULL,
  target_parent_work_order_id uuid DEFAULT NULL,
  target_priority text DEFAULT 'NORMAL',
  target_scheduled_date date DEFAULT NULL,
  target_observations text DEFAULT NULL
)
RETURNS public.maintenance_work_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  created_order public.maintenance_work_orders%ROWTYPE;
  target_number text;
  parent_order public.maintenance_work_orders%ROWTYPE;
  effective_location_id uuid;
BEGIN
  IF NOT public.has_hotel_permission(target_hotel_id, 'maintenance.create') THEN
    RAISE EXCEPTION 'No tienes permiso para crear OTs en este hotel.';
  END IF;
  IF target_work_type NOT IN ('CORRECTIVE', 'ACTUATION') THEN
    RAISE EXCEPTION 'El tipo de OT operativa no es válido.';
  END IF;
  IF target_title IS NULL OR length(btrim(target_title)) < 2 THEN
    RAISE EXCEPTION 'El título de la OT es obligatorio.';
  END IF;
  IF target_priority NOT IN ('LOW', 'NORMAL', 'HIGH', 'CRITICAL') THEN
    RAISE EXCEPTION 'La prioridad indicada no es válida.';
  END IF;
  IF target_reported_location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.hotel_locations loc
    WHERE loc.id = target_reported_location_id
      AND loc.hotel_id = target_hotel_id AND loc.active = true
  ) THEN
    RAISE EXCEPTION 'La ubicación debe estar activa y pertenecer al hotel de la OT.';
  END IF;
  IF target_apparatus_registry_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.apparatus_registry ar
    WHERE ar.id = target_apparatus_registry_id AND ar.hotel_id = target_hotel_id
  ) THEN
    RAISE EXCEPTION 'El equipo indicado no pertenece al hotel.';
  END IF;

  effective_location_id := target_reported_location_id;
  IF target_parent_work_order_id IS NOT NULL THEN
    SELECT * INTO parent_order
    FROM public.maintenance_work_orders wo
    WHERE wo.id = target_parent_work_order_id AND wo.hotel_id = target_hotel_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La OT de origen no pertenece al hotel.';
    END IF;
    IF effective_location_id IS NULL
       AND parent_order.reported_location_id IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM public.hotel_locations loc
         WHERE loc.id = parent_order.reported_location_id
           AND loc.hotel_id = target_hotel_id AND loc.active = true
       ) THEN
      effective_location_id := parent_order.reported_location_id;
    END IF;
  END IF;

  target_number := public.next_maintenance_ot_number(target_hotel_id, CURRENT_DATE);
  INSERT INTO public.maintenance_work_orders (
    hotel_id, scheduled_job_id, maintenance_plan_id, apparatus_registry_id,
    reported_location_id, parent_work_order_id, ot_number, title, description,
    work_type, status, scheduled_date, priority, observations, generation_mode, created_by
  )
  VALUES (
    target_hotel_id, NULL, NULL, target_apparatus_registry_id,
    effective_location_id, target_parent_work_order_id, target_number,
    target_number || ' — ' || btrim(target_title),
    NULLIF(btrim(target_description), ''), target_work_type, 'PENDING',
    target_scheduled_date, target_priority,
    NULLIF(btrim(target_observations), ''), 'MANUAL', auth.uid()
  )
  RETURNING * INTO created_order;
  RETURN created_order;
END;
$$;
REVOKE ALL ON FUNCTION public.create_operational_work_order_at_location(uuid, text, text, uuid, text, uuid, uuid, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_operational_work_order_at_location(uuid, text, text, uuid, text, uuid, uuid, text, date, text) TO authenticated;

-- Copia transaccional dentro del mismo hotel. Solo replica ubicaciones.
CREATE OR REPLACE FUNCTION public.copy_hotel_location_subtree(
  target_hotel_id uuid,
  source_location_id uuid,
  target_parent_location_id uuid,
  target_root_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  source_node record;
  source_node_id uuid;
  new_node_id uuid;
  copied_root_id uuid;
  new_parent_id uuid;
  id_map jsonb := '{}'::jsonb;
BEGIN
  IF NOT public.has_hotel_access(target_hotel_id)
     OR NOT public.has_hotel_permission(target_hotel_id, 'maintenance.create') THEN
    RAISE EXCEPTION 'No tienes permiso para copiar ubicaciones en este hotel.';
  END IF;
  IF target_root_name IS NULL OR length(btrim(target_root_name)) = 0 THEN
    RAISE EXCEPTION 'El nombre de la raíz copiada es obligatorio.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.hotel_locations
    WHERE hotel_id = target_hotel_id AND id = source_location_id AND active = true
  ) THEN
    RAISE EXCEPTION 'La ubicación de origen no existe, está inactiva o no pertenece al hotel.';
  END IF;
  IF target_parent_location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.hotel_locations
    WHERE hotel_id = target_hotel_id AND id = target_parent_location_id AND active = true
  ) THEN
    RAISE EXCEPTION 'La ubicación de destino debe estar activa en el mismo hotel.';
  END IF;
  IF target_parent_location_id IS NOT NULL AND EXISTS (
    WITH RECURSIVE subtree(id, parent_location_id, visited) AS (
      SELECT l.id, l.parent_location_id, ARRAY[l.id]::uuid[]
      FROM public.hotel_locations l WHERE l.hotel_id = target_hotel_id AND l.id = source_location_id
      UNION ALL
      SELECT child.id, child.parent_location_id, parent.visited || child.id
      FROM public.hotel_locations child JOIN subtree parent ON child.parent_location_id = parent.id
      WHERE child.hotel_id = target_hotel_id AND NOT child.id = ANY(parent.visited)
    )
    SELECT 1 FROM subtree WHERE id = target_parent_location_id
  ) THEN
    RAISE EXCEPTION 'No puedes copiar una estructura dentro de sí misma o de una ubicación descendiente.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.hotel_locations l
    WHERE l.hotel_id = target_hotel_id
      AND l.parent_location_id IS NOT DISTINCT FROM target_parent_location_id
      AND lower(btrim(l.name)) = lower(btrim(target_root_name))
  ) THEN
    RAISE EXCEPTION 'Ya existe una ubicación con ese nombre en el destino. Cambia el nombre de la copia.';
  END IF;

  FOR source_node IN
    WITH RECURSIVE subtree AS (
      SELECT l.id, l.parent_location_id, l.location_type, l.name, l.description,
             l.sort_order, l.active, 0 AS depth, ARRAY[l.id]::uuid[] AS visited
      FROM public.hotel_locations l WHERE l.hotel_id = target_hotel_id AND l.id = source_location_id
      UNION ALL
      SELECT child.id, child.parent_location_id, child.location_type, child.name,
             child.description, child.sort_order, child.active,
             parent.depth + 1, parent.visited || child.id
      FROM public.hotel_locations child JOIN subtree parent ON child.parent_location_id = parent.id
      WHERE child.hotel_id = target_hotel_id AND NOT child.id = ANY(parent.visited)
    )
    SELECT * FROM subtree ORDER BY depth, sort_order, name, id
  LOOP
    IF source_node.depth = 0 THEN
      new_parent_id := target_parent_location_id;
    ELSE
      new_parent_id := (id_map ->> (source_node.parent_location_id::text))::uuid;
      IF new_parent_id IS NULL THEN
        RAISE EXCEPTION 'No se pudo reconstruir la jerarquía durante la copia.';
      END IF;
    END IF;
    INSERT INTO public.hotel_locations (
      hotel_id, parent_location_id, location_type, code, name, description,
      sort_order, active, created_by, updated_by
    )
    VALUES (
      target_hotel_id, new_parent_id, source_node.location_type, NULL,
      CASE WHEN source_node.depth = 0 THEN btrim(target_root_name) ELSE source_node.name END,
      source_node.description, source_node.sort_order, true, auth.uid(), auth.uid()
    )
    RETURNING id INTO new_node_id;
    id_map := id_map || jsonb_build_object(source_node.id::text, new_node_id::text);
    IF source_node.depth = 0 THEN copied_root_id := new_node_id; END IF;
  END LOOP;

  FOR source_node IN
    WITH RECURSIVE subtree AS (
      SELECT l.id, l.parent_location_id, l.active, 0 AS depth, ARRAY[l.id]::uuid[] AS visited
      FROM public.hotel_locations l WHERE l.hotel_id = target_hotel_id AND l.id = source_location_id
      UNION ALL
      SELECT child.id, child.parent_location_id, child.active, parent.depth + 1, parent.visited || child.id
      FROM public.hotel_locations child JOIN subtree parent ON child.parent_location_id = parent.id
      WHERE child.hotel_id = target_hotel_id AND NOT child.id = ANY(parent.visited)
    )
    SELECT * FROM subtree ORDER BY depth DESC
  LOOP
    IF source_node.active = false THEN
      source_node_id := (id_map ->> (source_node.id::text))::uuid;
      UPDATE public.hotel_locations
      SET active = false, updated_by = auth.uid(), updated_at = now()
      WHERE id = source_node_id AND hotel_id = target_hotel_id;
    END IF;
  END LOOP;

  RETURN copied_root_id;
END;
$$;
REVOKE ALL ON FUNCTION public.copy_hotel_location_subtree(uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copy_hotel_location_subtree(uuid, uuid, uuid, text) TO authenticated;

COMMENT ON COLUMN public.maintenance_work_orders.reported_location_snapshot IS
'Instantánea de la ruta de ubicación comunicada al crear la OT; no se recalcula al renombrar o mover ubicaciones.';
COMMENT ON COLUMN public.maintenance_work_orders.execution_location_snapshot IS
'Instantánea de la ruta donde se ejecutó la OT, capturada al pasar a COMPLETED.';
COMMIT;
