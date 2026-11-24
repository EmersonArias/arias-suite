-- Arias Suite — migración 026
-- Bandeja server-side de avisos por correo de mantenimiento.
--
-- No depende del navegador ni de un proveedor concreto de correo.
-- Genera una cola idempotente que un proveedor/Edge Function podrá enviar.
--
-- No modifica ni reejecuta migraciones anteriores.

BEGIN;

-- =========================================================
-- COLA DE ENTREGA DE CORREOS
-- =========================================================

CREATE TABLE IF NOT EXISTS public.maintenance_alert_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  maintenance_alert_id uuid NOT NULL
    REFERENCES public.maintenance_alerts(id) ON DELETE CASCADE,
  hotel_id uuid NOT NULL
    REFERENCES public.hotels(id) ON DELETE RESTRICT,
  recipient_type text NOT NULL,
  recipient_user_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  attempt_count integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT maintenance_alert_deliveries_recipient_type_check
    CHECK (recipient_type IN ('USER', 'EXTERNAL')),

  CONSTRAINT maintenance_alert_deliveries_status_check
    CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED')),

  CONSTRAINT maintenance_alert_deliveries_email_check
    CHECK (
      length(btrim(recipient_email)) BETWEEN 3 AND 320
      AND position('@' in recipient_email) > 1
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS
  ux_maintenance_alert_delivery_recipient
ON public.maintenance_alert_deliveries (
  maintenance_alert_id,
  recipient_email
);

CREATE INDEX IF NOT EXISTS
  ix_maintenance_alert_deliveries_status
ON public.maintenance_alert_deliveries (
  status,
  created_at
);

CREATE INDEX IF NOT EXISTS
  ix_maintenance_alert_deliveries_alert
ON public.maintenance_alert_deliveries (
  maintenance_alert_id,
  created_at
);

ALTER TABLE public.maintenance_alert_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maintenance_alert_deliveries_select_authorized
ON public.maintenance_alert_deliveries;

CREATE POLICY maintenance_alert_deliveries_select_authorized
  ON public.maintenance_alert_deliveries
  FOR SELECT
  TO authenticated
  USING (
    public.has_hotel_permission(hotel_id, 'maintenance.view')
  );

-- =========================================================
-- GENERACIÓN IDEMPOTENTE DE DESTINATARIOS
-- =========================================================

CREATE OR REPLACE FUNCTION public.queue_maintenance_alert_emails()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  alert_record public.maintenance_alerts%ROWTYPE;
  config_record public.maintenance_alert_configs%ROWTYPE;
  inserted_count integer := 0;
  recipient_email text;
BEGIN
  FOR alert_record IN
    SELECT ma.*
    FROM public.maintenance_alerts ma
    JOIN public.maintenance_alert_configs mac
      ON mac.maintenance_plan_id = ma.maintenance_plan_id
    WHERE ma.resolved_at IS NULL
      AND mac.email_enabled = true
  LOOP
    SELECT *
      INTO config_record
    FROM public.maintenance_alert_configs mac
    WHERE mac.maintenance_plan_id = alert_record.maintenance_plan_id;

    -- Destinatarios internos seleccionados explícitamente.
    FOR recipient_email IN
      SELECT lower(btrim(p.email))
      FROM public.maintenance_alert_users mau
      JOIN public.profiles p
        ON p.id = mau.user_id
      WHERE mau.alert_config_id = config_record.id
        AND p.active = true
        AND p.account_status = 'ACTIVE'
        AND p.email IS NOT NULL
        AND length(btrim(p.email)) BETWEEN 3 AND 320
        AND position('@' in p.email) > 1
    LOOP
      INSERT INTO public.maintenance_alert_deliveries (
        maintenance_alert_id,
        hotel_id,
        recipient_type,
        recipient_user_id,
        recipient_email
      )
      SELECT
        alert_record.id,
        alert_record.hotel_id,
        'USER',
        mau.user_id,
        lower(btrim(p.email))
      FROM public.maintenance_alert_users mau
      JOIN public.profiles p
        ON p.id = mau.user_id
      WHERE mau.alert_config_id = config_record.id
        AND p.active = true
        AND p.account_status = 'ACTIVE'
        AND lower(btrim(p.email)) = recipient_email
        AND p.email IS NOT NULL
        AND length(btrim(p.email)) BETWEEN 3 AND 320
        AND position('@' in p.email) > 1
      ON CONFLICT (maintenance_alert_id, recipient_email) DO NOTHING;

      IF FOUND THEN
        inserted_count := inserted_count + 1;
      END IF;
    END LOOP;

    -- Destinatarios externos configurados manualmente.
    FOR recipient_email IN
      SELECT DISTINCT lower(btrim(mae.email))
      FROM public.maintenance_alert_emails mae
      WHERE mae.alert_config_id = config_record.id
    LOOP
      INSERT INTO public.maintenance_alert_deliveries (
        maintenance_alert_id,
        hotel_id,
        recipient_type,
        recipient_user_id,
        recipient_email
      )
      VALUES (
        alert_record.id,
        alert_record.hotel_id,
        'EXTERNAL',
        NULL,
        recipient_email
      )
      ON CONFLICT (maintenance_alert_id, recipient_email) DO NOTHING;

      IF FOUND THEN
        inserted_count := inserted_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_maintenance_alert_emails() FROM PUBLIC;

-- =========================================================
-- CICLO COMPLETO
-- =========================================================
-- La migración 025 ya creó el job horario.
-- Aquí se reemplaza solo la función del ciclo para incorporar la cola.

CREATE OR REPLACE FUNCTION public.run_maintenance_alert_cycle()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  hotel_record public.hotels%ROWTYPE;
  alert_count integer := 0;
  queued_count integer := 0;
BEGIN
  FOR hotel_record IN
    SELECT *
    FROM public.hotels
    WHERE active = true
  LOOP
    alert_count := alert_count
      + public.refresh_maintenance_due_alerts(hotel_record.id);
  END LOOP;

  queued_count := public.queue_maintenance_alert_emails();

  RETURN alert_count + queued_count;
END;
$$;

REVOKE ALL ON FUNCTION public.run_maintenance_alert_cycle() FROM PUBLIC;

COMMIT;
