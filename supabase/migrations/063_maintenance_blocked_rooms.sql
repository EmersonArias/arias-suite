-- Arias Suite — migración 063
-- Control de habitaciones bloqueadas para el backlog de mantenimiento.
--
-- El estado de bloqueo pertenece a la habitación, no a cada pendiente.
-- Así evitamos duplicar el mismo estado cuando una habitación tiene varios pendientes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.maintenance_blocked_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  room_number text NOT NULL,
  blocked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_maintenance_blocked_room UNIQUE (hotel_id, room_number)
);

CREATE INDEX IF NOT EXISTS ix_maintenance_blocked_rooms_hotel
  ON public.maintenance_blocked_rooms (hotel_id);

ALTER TABLE public.maintenance_blocked_rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_blocked_rooms_select ON public.maintenance_blocked_rooms;
CREATE POLICY maintenance_blocked_rooms_select
  ON public.maintenance_blocked_rooms FOR SELECT TO authenticated
  USING (public.has_hotel_access(hotel_id));

DROP POLICY IF EXISTS maintenance_blocked_rooms_insert ON public.maintenance_blocked_rooms;
CREATE POLICY maintenance_blocked_rooms_insert
  ON public.maintenance_blocked_rooms FOR INSERT TO authenticated
  WITH CHECK (public.has_hotel_permission(hotel_id, 'maintenance.update'));

DROP POLICY IF EXISTS maintenance_blocked_rooms_update ON public.maintenance_blocked_rooms;
CREATE POLICY maintenance_blocked_rooms_update
  ON public.maintenance_blocked_rooms FOR UPDATE TO authenticated
  USING (public.has_hotel_permission(hotel_id, 'maintenance.update'))
  WITH CHECK (public.has_hotel_permission(hotel_id, 'maintenance.update'));

DROP POLICY IF EXISTS maintenance_blocked_rooms_delete ON public.maintenance_blocked_rooms;
CREATE POLICY maintenance_blocked_rooms_delete
  ON public.maintenance_blocked_rooms FOR DELETE TO authenticated
  USING (public.has_hotel_permission(hotel_id, 'maintenance.update'));

COMMENT ON TABLE public.maintenance_blocked_rooms IS
'Habitaciones actualmente bloqueadas por mantenimiento. El bloqueo se guarda por habitación para no duplicar el estado en cada pendiente.';

COMMIT;
