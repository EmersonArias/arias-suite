-- Arias Suite — migración 061
-- Estados operativos de tickets y rechazo terminal.
--
-- Estados:
--   PENDING       Pendiente
--   IN_MANAGEMENT  En gestión
--   IN_PROGRESS   En curso
--   COMPLETED     Cerrado / finalizado
--   REJECTED      Rechazado
--
-- "En gestión" significa que el equipo ya ha identificado y asumido el ticket,
-- aunque el trabajo físico todavía no haya comenzado.
--
-- No modifica migraciones anteriores.

BEGIN;

ALTER TABLE public.maintenance_work_orders
  DROP CONSTRAINT IF EXISTS maintenance_work_orders_status_check;

ALTER TABLE public.maintenance_work_orders
  ADD CONSTRAINT maintenance_work_orders_status_check
  CHECK (
    status IN (
      'PENDING',
      'IN_MANAGEMENT',
      'IN_PROGRESS',
      'COMPLETED',
      'REJECTED'
    )
  );

DROP INDEX IF EXISTS public.ux_maintenance_work_orders_one_open_per_plan;

CREATE UNIQUE INDEX IF NOT EXISTS ux_maintenance_work_orders_one_open_per_plan
  ON public.maintenance_work_orders (maintenance_plan_id)
  WHERE status IN ('PENDING', 'IN_MANAGEMENT', 'IN_PROGRESS');

-- Cambia el estado operativo sin finalizar el ticket.
CREATE OR REPLACE FUNCTION public.set_maintenance_work_order_status(
  target_work_order_id uuid,
  target_status text
)
RETURNS public.maintenance_work_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_order public.maintenance_work_orders%ROWTYPE;
BEGIN
  SELECT *
    INTO target_order
  FROM public.maintenance_work_orders
  WHERE id = target_work_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El ticket no existe.';
  END IF;

  IF NOT public.has_hotel_permission(target_order.hotel_id, 'maintenance.update') THEN
    RAISE EXCEPTION 'No tienes permiso para modificar este ticket.';
  END IF;

  IF target_status NOT IN ('IN_MANAGEMENT', 'IN_PROGRESS') THEN
    RAISE EXCEPTION 'El estado operativo indicado no es válido.';
  END IF;

  IF target_order.status IN ('COMPLETED', 'REJECTED') THEN
    RAISE EXCEPTION 'El ticket ya está en histórico.';
  END IF;

  UPDATE public.maintenance_work_orders
  SET
    status = target_status,
    started_at = CASE
      WHEN target_status = 'IN_PROGRESS' THEN COALESCE(started_at, now())
      ELSE started_at
    END,
    updated_at = now()
  WHERE id = target_work_order_id
  RETURNING * INTO target_order;

  RETURN target_order;
END;
$$;

REVOKE ALL ON FUNCTION public.set_maintenance_work_order_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_maintenance_work_order_status(uuid, text) TO authenticated;

-- Rechaza un ticket y lo envía directamente al histórico.
CREATE OR REPLACE FUNCTION public.reject_maintenance_work_order(
  target_work_order_id uuid,
  target_observations text DEFAULT NULL
)
RETURNS public.maintenance_work_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_order public.maintenance_work_orders%ROWTYPE;
BEGIN
  SELECT *
    INTO target_order
  FROM public.maintenance_work_orders
  WHERE id = target_work_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El ticket no existe.';
  END IF;

  IF NOT public.has_hotel_permission(target_order.hotel_id, 'maintenance.update') THEN
    RAISE EXCEPTION 'No tienes permiso para rechazar este ticket.';
  END IF;

  IF target_order.status IN ('COMPLETED', 'REJECTED') THEN
    RETURN target_order;
  END IF;

  UPDATE public.maintenance_work_orders
  SET
    status = 'REJECTED',
    completed_at = now(),
    completed_by = auth.uid(),
    observations = NULLIF(btrim(COALESCE(target_observations, observations)), ''),
    updated_at = now()
  WHERE id = target_work_order_id
  RETURNING * INTO target_order;

  RETURN target_order;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_maintenance_work_order(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_maintenance_work_order(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.set_maintenance_work_order_status(uuid, text) IS
'Marca un ticket como En gestión (IN_MANAGEMENT) o En curso (IN_PROGRESS) sin finalizarlo.';

COMMENT ON FUNCTION public.reject_maintenance_work_order(uuid, text) IS
'Rechaza un ticket y lo envía al histórico como REJECTED.';

COMMIT;
