-- Arias Suite — migración 078
-- Catálogo operativo, control de stock y solicitudes de material.
-- No se ejecuta automáticamente en producción. Aplicar primero en entorno de pruebas.

BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.maintenance_material_request_number_seq;

ALTER TABLE public.maintenance_material_catalog
  ADD COLUMN IF NOT EXISTS reference_code text,
  ADD COLUMN IF NOT EXISTS unit_of_measure text NOT NULL DEFAULT 'ud',
  ADD COLUMN IF NOT EXISTS stock_quantity numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stock_counted_at timestamptz,
  ADD COLUMN IF NOT EXISTS stock_counted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS minimum_stock numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_url text,
  ADD COLUMN IF NOT EXISTS storage_location text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'maintenance_material_catalog_stock_nonnegative'
      AND conrelid = 'public.maintenance_material_catalog'::regclass
  ) THEN
    ALTER TABLE public.maintenance_material_catalog
      ADD CONSTRAINT maintenance_material_catalog_stock_nonnegative
      CHECK (stock_quantity >= 0 AND minimum_stock >= 0);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS ix_maintenance_material_catalog_low_stock
  ON public.maintenance_material_catalog (hotel_id, active, stock_quantity, minimum_stock);

CREATE TABLE IF NOT EXISTS public.maintenance_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE RESTRICT,
  material_id uuid NOT NULL REFERENCES public.maintenance_material_catalog(id) ON DELETE RESTRICT,
  movement_type text NOT NULL CHECK (movement_type IN ('RECEIVE', 'ISSUE', 'ADJUSTMENT', 'COUNT')),
  quantity_delta numeric(12,2) NOT NULL CHECK (quantity_delta <> 0 OR movement_type IN ('ADJUSTMENT', 'COUNT')),
  stock_before numeric(12,2) CHECK (stock_before IS NULL OR stock_before >= 0),
  stock_after numeric(12,2) NOT NULL CHECK (stock_after >= 0),
  reason text NOT NULL,
  reference text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT maintenance_stock_movement_type_sign CHECK (
    (movement_type = 'RECEIVE' AND quantity_delta > 0)
    OR (movement_type = 'ISSUE' AND quantity_delta < 0)
    OR movement_type = 'ADJUSTMENT'
    OR (movement_type = 'COUNT' AND (
      (stock_before IS NULL AND quantity_delta = 0)
      OR (stock_before IS NOT NULL AND quantity_delta = stock_after - stock_before)
    ))
  )
);

CREATE INDEX IF NOT EXISTS ix_maintenance_stock_movements_hotel_date
  ON public.maintenance_stock_movements (hotel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_maintenance_stock_movements_material_date
  ON public.maintenance_stock_movements (material_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.maintenance_material_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number text NOT NULL UNIQUE DEFAULT (
    'MAT-' || to_char(CURRENT_DATE, 'YYYY') || '-' ||
    lpad(nextval('public.maintenance_material_request_number_seq')::text, 6, '0')
  ),
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE RESTRICT,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requester_name text NOT NULL CHECK (length(btrim(requester_name)) >= 2),
  department text NOT NULL DEFAULT 'MANTENIMIENTO',
  cause text NOT NULL CHECK (length(btrim(cause)) >= 2),
  delivery_date date,
  notes text,
  status text NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'CANCELLED')),
  email_status text NOT NULL DEFAULT 'NOT_SENT'
    CHECK (email_status IN ('NOT_SENT', 'SENDING', 'SENT', 'FAILED')),
  recipient_email text,
  email_sent_at timestamptz,
  email_error text,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_maintenance_material_requests_hotel_date
  ON public.maintenance_material_requests (hotel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_maintenance_material_requests_email_status
  ON public.maintenance_material_requests (email_status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.maintenance_material_request_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.maintenance_material_requests(id) ON DELETE CASCADE,
  material_id uuid REFERENCES public.maintenance_material_catalog(id) ON DELETE SET NULL,
  description text NOT NULL,
  reference_code text,
  order_code text,
  provider_id uuid REFERENCES public.providers(id) ON DELETE SET NULL,
  provider_name text,
  unit_of_measure text NOT NULL DEFAULT 'ud',
  quantity numeric(12,2) NOT NULL CHECK (quantity > 0),
  purchase_url text,
  delivery_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_maintenance_material_request_lines_request
  ON public.maintenance_material_request_lines (request_id, created_at);

ALTER TABLE public.maintenance_stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_material_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_material_request_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_stock_movements_select ON public.maintenance_stock_movements;
CREATE POLICY maintenance_stock_movements_select
  ON public.maintenance_stock_movements FOR SELECT TO authenticated
  USING (public.has_hotel_permission(hotel_id, 'maintenance.view'));

DROP POLICY IF EXISTS maintenance_material_requests_select ON public.maintenance_material_requests;
CREATE POLICY maintenance_material_requests_select
  ON public.maintenance_material_requests FOR SELECT TO authenticated
  USING (public.has_hotel_permission(hotel_id, 'maintenance.view'));

DROP POLICY IF EXISTS maintenance_material_requests_update ON public.maintenance_material_requests;

DROP POLICY IF EXISTS maintenance_material_request_lines_select ON public.maintenance_material_request_lines;
CREATE POLICY maintenance_material_request_lines_select
  ON public.maintenance_material_request_lines FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.maintenance_material_requests mr
      WHERE mr.id = request_id
        AND public.has_hotel_permission(mr.hotel_id, 'maintenance.view')
    )
  );

REVOKE ALL ON TABLE public.maintenance_material_catalog FROM PUBLIC, anon;
-- Remove legacy column-level grants from anon as well as table-level grants.
DO $revoke_anon_columns$
DECLARE
  column_grant record;
BEGIN
  FOR column_grant IN
    SELECT column_name, privilege_type
    FROM information_schema.column_privileges
    WHERE table_schema = 'public' AND table_name = 'maintenance_material_catalog'
      AND grantee = 'anon'
  LOOP
    EXECUTE format(
      'REVOKE %s (%I) ON TABLE public.maintenance_material_catalog FROM anon',
      column_grant.privilege_type, column_grant.column_name
    );
  END LOOP;
END;
$revoke_anon_columns$;
REVOKE INSERT, UPDATE, DELETE ON public.maintenance_material_catalog FROM authenticated;
GRANT SELECT ON public.maintenance_material_catalog TO authenticated;
GRANT INSERT (
  hotel_id, description, order_code, reference_code, provider_id, active,
  unit_of_measure, minimum_stock, purchase_url, storage_location, notes, updated_at
) ON public.maintenance_material_catalog TO authenticated;
GRANT UPDATE (
  description, order_code, reference_code, provider_id, active, unit_of_measure,
  minimum_stock, purchase_url, storage_location, notes, updated_at
) ON public.maintenance_material_catalog TO authenticated;

REVOKE ALL ON TABLE public.maintenance_stock_movements, public.maintenance_material_requests, public.maintenance_material_request_lines FROM PUBLIC, anon;

GRANT SELECT ON public.maintenance_stock_movements TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.maintenance_stock_movements FROM authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.maintenance_material_requests FROM authenticated;
GRANT SELECT ON public.maintenance_material_requests TO authenticated;
GRANT UPDATE (
  email_status, recipient_email, email_sent_at, email_error, updated_at
) ON public.maintenance_material_requests TO service_role;

GRANT SELECT ON public.maintenance_material_request_lines TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.maintenance_material_request_lines FROM authenticated;
REVOKE ALL ON SEQUENCE public.maintenance_material_request_number_seq FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_maintenance_material_request_email_send(
  target_request_id uuid,
  target_recipient_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  request_record public.maintenance_material_requests%ROWTYPE;
  normalized_email text := lower(btrim(coalesce(target_recipient_email, '')));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para enviar una petición de material.';
  END IF;
  IF normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'El correo destinatario no es válido.';
  END IF;

  SELECT * INTO request_record
  FROM public.maintenance_material_requests
  WHERE id = target_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encuentra la petición de material.';
  END IF;
  IF NOT public.has_hotel_permission(request_record.hotel_id, 'maintenance.update') THEN
    RAISE EXCEPTION 'No tienes permiso para enviar peticiones de este hotel.';
  END IF;
  IF request_record.status <> 'CONFIRMED' THEN
    RAISE EXCEPTION 'Solo se pueden enviar peticiones confirmadas.';
  END IF;
  IF request_record.email_status = 'SENT' THEN
    RAISE EXCEPTION 'Esta petición ya consta como enviada.';
  END IF;
  IF request_record.email_status NOT IN ('NOT_SENT', 'FAILED') THEN
    RAISE EXCEPTION 'Esta petición ya tiene un envío en curso.';
  END IF;

  UPDATE public.maintenance_material_requests
  SET email_status = 'SENDING',
      recipient_email = normalized_email,
      email_error = NULL,
      updated_at = now()
  WHERE id = request_record.id;

  RETURN jsonb_build_object(
    'id', request_record.id,
    'request_number', request_record.request_number,
    'recipient_email', normalized_email
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_maintenance_material_request_email_send(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_maintenance_material_request_email_send(uuid, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.count_maintenance_material_stock(
  target_hotel_id uuid, target_material_id uuid, target_quantity numeric,
  target_reason text, target_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  material_record public.maintenance_material_catalog%ROWTYPE;
  before_quantity numeric(12,2);
  after_quantity numeric(12,2);
  quantity_delta numeric(12,2);
  movement_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_hotel_permission(target_hotel_id, 'maintenance.update') THEN
    RAISE EXCEPTION 'No tienes permiso para inventariar el stock de este hotel.';
  END IF;
  IF target_quantity IS NULL OR target_quantity < 0 OR round(target_quantity, 2) <> target_quantity THEN
    RAISE EXCEPTION 'La cantidad inventariada debe ser cero o mayor y tener como máximo dos decimales.';
  END IF;
  IF length(btrim(coalesce(target_reason, ''))) < 2 THEN
    RAISE EXCEPTION 'Indica el motivo del conteo físico.';
  END IF;
  SELECT * INTO material_record FROM public.maintenance_material_catalog
  WHERE id = target_material_id AND hotel_id = target_hotel_id AND active = true FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El material no existe, está inactivo o pertenece a otro hotel.';
  END IF;

  -- Unknown initial stock is not treated as a real zero; the first count establishes the baseline.
  before_quantity := CASE WHEN material_record.stock_verified THEN material_record.stock_quantity ELSE NULL END;
  after_quantity := target_quantity;
  quantity_delta := CASE WHEN before_quantity IS NULL THEN 0 ELSE after_quantity - before_quantity END;

  UPDATE public.maintenance_material_catalog
  SET stock_quantity = after_quantity, stock_verified = true,
      stock_counted_at = now(), stock_counted_by = auth.uid(),
      updated_by = auth.uid(), updated_at = now()
  WHERE id = material_record.id;

  INSERT INTO public.maintenance_stock_movements (
    hotel_id, material_id, movement_type, quantity_delta,
    stock_before, stock_after, reason, reference, created_by
  )
  VALUES (
    target_hotel_id, target_material_id, 'COUNT', quantity_delta,
    before_quantity, after_quantity, btrim(target_reason),
    NULLIF(btrim(coalesce(target_reference, '')), ''), auth.uid()
  )
  RETURNING id INTO movement_id;

  RETURN jsonb_build_object('movement_id', movement_id, 'stock_before', before_quantity,
    'stock_after', after_quantity, 'stock_verified', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.count_maintenance_material_stock(uuid, uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.count_maintenance_material_stock(uuid, uuid, numeric, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_maintenance_stock_movement(
  target_hotel_id uuid,
  target_material_id uuid,
  target_movement_type text,
  target_quantity_delta numeric,
  target_reason text,
  target_reference text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  material_record public.maintenance_material_catalog%ROWTYPE;
  before_quantity numeric(12,2);
  after_quantity numeric(12,2);
  movement_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_hotel_permission(target_hotel_id, 'maintenance.update') THEN
    RAISE EXCEPTION 'No tienes permiso para modificar el stock de este hotel.';
  END IF;

  IF target_movement_type NOT IN ('RECEIVE', 'ISSUE', 'ADJUSTMENT') THEN
    RAISE EXCEPTION 'Tipo de movimiento no válido.';
  END IF;
  IF target_quantity_delta IS NULL OR target_quantity_delta = 0 OR round(target_quantity_delta, 2) <> target_quantity_delta THEN
    RAISE EXCEPTION 'La cantidad del movimiento debe ser distinta de cero y tener como máximo dos decimales.';
  END IF;
  IF target_movement_type = 'RECEIVE' AND target_quantity_delta < 0 THEN
    RAISE EXCEPTION 'Una entrada debe tener una cantidad positiva.';
  END IF;
  IF target_movement_type = 'ISSUE' AND target_quantity_delta > 0 THEN
    RAISE EXCEPTION 'Una salida debe tener una cantidad negativa.';
  END IF;
  IF length(btrim(coalesce(target_reason, ''))) < 2 THEN
    RAISE EXCEPTION 'Indica el motivo del movimiento.';
  END IF;

  SELECT * INTO material_record
  FROM public.maintenance_material_catalog
  WHERE id = target_material_id
    AND hotel_id = target_hotel_id
    AND active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El material no existe, está inactivo o pertenece a otro hotel.';
  END IF;

  IF NOT material_record.stock_verified THEN
    RAISE EXCEPTION 'El stock no está inventariado. Registra primero un conteo físico.';
  END IF;

  before_quantity := material_record.stock_quantity;
  after_quantity := before_quantity + target_quantity_delta;
  IF after_quantity < 0 THEN
    RAISE EXCEPTION 'El stock resultante no puede ser negativo. Disponible: %.',
      before_quantity;
  END IF;

  UPDATE public.maintenance_material_catalog
  SET stock_quantity = after_quantity,
      updated_by = auth.uid(),
      updated_at = now()
  WHERE id = material_record.id;

  INSERT INTO public.maintenance_stock_movements (
    hotel_id, material_id, movement_type, quantity_delta,
    stock_before, stock_after, reason, reference, created_by
  )
  VALUES (
    target_hotel_id, target_material_id, target_movement_type, target_quantity_delta,
    before_quantity, after_quantity, btrim(target_reason),
    NULLIF(btrim(coalesce(target_reference, '')), ''), auth.uid()
  )
  RETURNING id INTO movement_id;

  RETURN jsonb_build_object(
    'movement_id', movement_id,
    'stock_before', before_quantity,
    'stock_after', after_quantity
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.record_maintenance_stock_movement(uuid, uuid, text, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_maintenance_stock_movement(uuid, uuid, text, numeric, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_maintenance_material_request(
  target_hotel_id uuid,
  target_requester_name text,
  target_department text,
  target_cause text,
  target_delivery_date date,
  target_notes text,
  target_lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  request_record public.maintenance_material_requests%ROWTYPE;
  line_record jsonb;
  material_record public.maintenance_material_catalog%ROWTYPE;
  provider_label text;
  line_quantity numeric(12,2);
  line_count integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_hotel_permission(target_hotel_id, 'maintenance.update') THEN
    RAISE EXCEPTION 'No tienes permiso para crear peticiones de material en este hotel.';
  END IF;
  IF length(btrim(coalesce(target_requester_name, ''))) < 2 THEN
    RAISE EXCEPTION 'Indica la persona solicitante.';
  END IF;
  IF length(btrim(coalesce(target_cause, ''))) < 2 THEN
    RAISE EXCEPTION 'Indica la causa de la petición.';
  END IF;
  IF jsonb_typeof(target_lines) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'La lista de materiales debe tener formato de lista.';
  END IF;
  IF jsonb_array_length(target_lines) = 0 THEN
    RAISE EXCEPTION 'Añade al menos un material a la petición.';
  END IF;

  INSERT INTO public.maintenance_material_requests (
    hotel_id, requested_by, requester_name, department, cause,
    delivery_date, notes, status, email_status
  )
  VALUES (
    target_hotel_id, auth.uid(), btrim(target_requester_name),
    COALESCE(NULLIF(btrim(target_department), ''), 'MANTENIMIENTO'),
    btrim(target_cause), target_delivery_date,
    NULLIF(btrim(coalesce(target_notes, '')), ''), 'CONFIRMED', 'NOT_SENT'
  )
  RETURNING * INTO request_record;

  FOR line_record IN
    SELECT value FROM jsonb_array_elements(target_lines)
  LOOP
    IF NULLIF(line_record->>'material_id', '') IS NULL THEN
      RAISE EXCEPTION 'Selecciona un artículo del catálogo para cada línea.';
    END IF;

    SELECT * INTO material_record
    FROM public.maintenance_material_catalog
    WHERE id = (line_record->>'material_id')::uuid
      AND hotel_id = target_hotel_id
      AND active = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Uno de los artículos ya no está disponible en el catálogo.';
    END IF;

    IF (line_record->>'quantity')::numeric <> round((line_record->>'quantity')::numeric, 2) THEN
      RAISE EXCEPTION 'Las cantidades deben tener como máximo dos decimales.';
    END IF;
    line_quantity := NULLIF(line_record->>'quantity', '')::numeric;
    IF line_quantity IS NULL OR line_quantity <= 0 THEN
      RAISE EXCEPTION 'Todas las cantidades deben ser mayores que cero.';
    END IF;

    SELECT COALESCE(NULLIF(btrim(p.trade_name), ''), p.legal_name)
      INTO provider_label
    FROM public.providers p
    WHERE p.id = material_record.provider_id;

    INSERT INTO public.maintenance_material_request_lines (
      request_id, material_id, description, reference_code, order_code,
      provider_id, provider_name, unit_of_measure, quantity, purchase_url, delivery_date
    )
    VALUES (
      request_record.id, material_record.id, material_record.description,
      material_record.reference_code, material_record.order_code,
      material_record.provider_id, provider_label, material_record.unit_of_measure,
      line_quantity, material_record.purchase_url,
      NULLIF(line_record->>'delivery_date', '')::date
    );

    line_count := line_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'id', request_record.id,
    'request_number', request_record.request_number,
    'line_count', line_count,
    'confirmed_at', request_record.confirmed_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_maintenance_material_request(uuid, text, text, text, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_maintenance_material_request(uuid, text, text, text, date, text, jsonb) TO authenticated;

COMMENT ON TABLE public.maintenance_stock_movements IS
  'Libro de movimientos de stock. La cantidad_delta es positiva en entradas y negativa en salidas.';
COMMENT ON COLUMN public.maintenance_material_catalog.stock_verified IS
  'Indica si el stock es conocido por un conteo físico; false no equivale a existencia real cero.';
COMMENT ON COLUMN public.maintenance_material_catalog.stock_counted_at IS
  'Fecha del último conteo físico confirmado del material.';
COMMENT ON TABLE public.maintenance_material_requests IS
  'Solicitudes de material confirmadas, con estado de correo y trazabilidad.';
COMMENT ON TABLE public.maintenance_material_request_lines IS
  'Detalle inmutable de cada solicitud con descripción, proveedor, fecha de entrega por línea y enlace de compra capturados al confirmar.';

NOTIFY pgrst, 'reload schema';

COMMIT;
