-- Arias Suite — migración 036
-- OT preventivas derivadas de trabajos programados.
--
-- Una OT preventiva nace de un trabajo programado del PAM.
-- Estados V1:
--   PENDING
--   IN_PROGRESS
--   COMPLETED
--
-- La asignación queda restringida por permiso específico.

BEGIN;

INSERT INTO public.permissions (
  code,
  name,
  module,
  action,
  description
)
VALUES (
  'maintenance.assign',
  'Asignar órdenes de trabajo',
  'maintenance',
  'assign',
  'Permite asignar y reasignar órdenes de trabajo de mantenimiento.'
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  action = EXCLUDED.action,
  description = EXCLUDED.description;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code IN ('CLIENT_ADMIN', 'MAINTENANCE_CHIEF')
  AND p.code = 'maintenance.assign'
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.maintenance_work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL
    REFERENCES public.hotels(id) ON DELETE RESTRICT,
  scheduled_job_id uuid NOT NULL
    REFERENCES public.maintenance_scheduled_jobs(id) ON DELETE RESTRICT,
  maintenance_plan_id uuid NOT NULL
    REFERENCES public.maintenance_plans(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text,
  work_type text NOT NULL DEFAULT 'PREVENTIVE'
    CHECK (work_type IN ('PREVENTIVE', 'CORRECTIVE', 'ACTUATION')),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED')),
  assigned_user_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,
  scheduled_date date,
  started_at timestamptz,
  completed_at timestamptz,
  completed_by uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,
  observations text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_work_orders_job_unique
    UNIQUE (scheduled_job_id)
);

CREATE INDEX IF NOT EXISTS ix_maintenance_work_orders_hotel_status
  ON public.maintenance_work_orders (hotel_id, status, scheduled_date);

CREATE INDEX IF NOT EXISTS ix_maintenance_work_orders_assigned_user
  ON public.maintenance_work_orders (assigned_user_id, status);

ALTER TABLE public.maintenance_work_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_work_orders_select
ON public.maintenance_work_orders;

CREATE POLICY maintenance_work_orders_select
  ON public.maintenance_work_orders
  FOR SELECT
  TO authenticated
  USING (
    public.has_hotel_permission(hotel_id, 'maintenance.view')
  );

DROP POLICY IF EXISTS maintenance_work_orders_insert
ON public.maintenance_work_orders;

CREATE POLICY maintenance_work_orders_insert
  ON public.maintenance_work_orders
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_hotel_permission(hotel_id, 'maintenance.create')
  );

DROP POLICY IF EXISTS maintenance_work_orders_update
ON public.maintenance_work_orders;

CREATE POLICY maintenance_work_orders_update
  ON public.maintenance_work_orders
  FOR UPDATE
  TO authenticated
  USING (
    public.has_hotel_permission(hotel_id, 'maintenance.update')
  )
  WITH CHECK (
    public.has_hotel_permission(hotel_id, 'maintenance.update')
  );

CREATE OR REPLACE FUNCTION public.assign_maintenance_work_order(
  target_work_order_id uuid,
  target_user_id uuid
)
RETURNS public.maintenance_work_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_order public.maintenance_work_orders%ROWTYPE;
  valid_assignee boolean;
BEGIN
  SELECT *
    INTO target_order
  FROM public.maintenance_work_orders
  WHERE id = target_work_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La OT no existe.';
  END IF;

  IF NOT public.has_hotel_permission(
    target_order.hotel_id,
    'maintenance.assign'
  ) THEN
    RAISE EXCEPTION 'No tienes permiso para asignar esta OT.';
  END IF;

  IF target_user_id IS NULL THEN
    UPDATE public.maintenance_work_orders
    SET assigned_user_id = NULL,
        updated_at = now()
    WHERE id = target_work_order_id
    RETURNING * INTO target_order;

    RETURN target_order;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_hotel_roles uhr
    JOIN public.roles r
      ON r.id = uhr.role_id
     AND r.active = true
    JOIN public.profiles p
      ON p.id = uhr.user_id
     AND p.active = true
     AND p.account_status = 'ACTIVE'
    WHERE uhr.hotel_id = target_order.hotel_id
      AND uhr.user_id = target_user_id
      AND uhr.active IS NOT FALSE
      AND r.code IN ('MAINTENANCE_CHIEF', 'TECHNICIAN')
  )
  INTO valid_assignee;

  IF NOT valid_assignee THEN
    RAISE EXCEPTION 'El usuario seleccionado no es un integrante activo de SSTT del hotel.';
  END IF;

  UPDATE public.maintenance_work_orders
  SET assigned_user_id = target_user_id,
      updated_at = now()
  WHERE id = target_work_order_id
  RETURNING * INTO target_order;

  RETURN target_order;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_maintenance_work_order(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_maintenance_work_order(uuid, uuid) TO authenticated;

DO $$
BEGIN
  INSERT INTO public.maintenance_work_orders (
    hotel_id,
    scheduled_job_id,
    maintenance_plan_id,
    title,
    description,
    work_type,
    status,
    scheduled_date
  )
  SELECT
    j.hotel_id,
    j.id,
    j.maintenance_plan_id,
    mp.name,
    mp.description,
    'PREVENTIVE',
    CASE
      WHEN j.status = 'COMPLETED' THEN 'COMPLETED'
      WHEN j.status = 'IN_PROGRESS' THEN 'IN_PROGRESS'
      ELSE 'PENDING'
    END,
    j.scheduled_date
  FROM public.maintenance_scheduled_jobs j
  JOIN public.maintenance_plans mp
    ON mp.id = j.maintenance_plan_id
  ON CONFLICT (scheduled_job_id) DO NOTHING;
END;
$$;

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
  mp.apparatus_registry_id,
  ar.code AS apparatus_code,
  ar.name AS apparatus_name,
  ar.plant,
  ar.location,
  j.plan_year,
  j.month_number,
  j.week_slot,
  j.source_mark_id,
  wo.created_at,
  wo.updated_at
FROM public.maintenance_work_orders wo
JOIN public.maintenance_plans mp
  ON mp.id = wo.maintenance_plan_id
JOIN public.maintenance_scheduled_jobs j
  ON j.id = wo.scheduled_job_id
LEFT JOIN public.apparatus_registry ar
  ON ar.id = mp.apparatus_registry_id
LEFT JOIN public.profiles p
  ON p.id = wo.assigned_user_id;

COMMIT;
