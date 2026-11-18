-- Arias Suite — migración 008
-- Control de agotamiento de series de codificación.
--
-- Regla:
--   Una serie nunca puede generar automáticamente un código que supere
--   la longitud de dígitos configurada.
--   Al alcanzar el máximo, la creación se bloquea y la serie debe
--   ampliarse/configurarse explícitamente.

BEGIN;

-- Protege la integridad del contador frente al máximo representable
-- por la configuración actual.
ALTER TABLE public.hotel_code_sequences
  DROP CONSTRAINT IF EXISTS hotel_code_sequences_counter_format_check;

ALTER TABLE public.hotel_code_sequences
  ADD CONSTRAINT hotel_code_sequences_counter_format_check
  CHECK (
    digits IS NULL
    OR last_number <= (power(10::numeric, digits) - 1)
  );

-- Si la codificación está habilitada, prefix y digits deben estar configurados.
ALTER TABLE public.hotel_code_sequences
  DROP CONSTRAINT IF EXISTS hotel_code_sequences_enabled_config_check;

ALTER TABLE public.hotel_code_sequences
  ADD CONSTRAINT hotel_code_sequences_enabled_config_check
  CHECK (
    enabled IS NOT TRUE
    OR (
      prefix IS NOT NULL
      AND btrim(prefix) <> ''
      AND digits IS NOT NULL
      AND digits BETWEEN 1 AND 12
    )
  );

CREATE OR REPLACE FUNCTION public.allocate_hotel_code(
  target_hotel_id uuid,
  target_module_code text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  sequence_record public.hotel_code_sequences%ROWTYPE;
  next_number bigint;
  maximum_number bigint;
BEGIN
  SELECT *
  INTO sequence_record
  FROM public.hotel_code_sequences
  WHERE hotel_id = target_hotel_id
    AND module_code = target_module_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'No existe configuración de código para el hotel % y módulo %.',
      target_hotel_id,
      target_module_code;
  END IF;

  IF sequence_record.enabled IS NOT TRUE THEN
    RAISE EXCEPTION
      'La codificación está desactivada para el módulo % en el hotel %.',
      target_module_code,
      target_hotel_id;
  END IF;

  IF sequence_record.prefix IS NULL OR sequence_record.digits IS NULL THEN
    RAISE EXCEPTION
      'La configuración de código del módulo % está incompleta.',
      target_module_code;
  END IF;

  maximum_number := (power(10::numeric, sequence_record.digits) - 1)::bigint;

  IF sequence_record.last_number >= maximum_number THEN
    RAISE EXCEPTION
      'La serie de códigos del módulo % para el hotel % ha alcanzado su límite (%). Configure una nueva longitud de numeración antes de continuar.',
      target_module_code,
      target_hotel_id,
      maximum_number;
  END IF;

  UPDATE public.hotel_code_sequences
  SET
    last_number = last_number + 1,
    format_locked = true,
    updated_at = now()
  WHERE hotel_id = target_hotel_id
    AND module_code = target_module_code
  RETURNING last_number INTO next_number;

  RETURN sequence_record.prefix || LPAD(
    next_number::text,
    sequence_record.digits,
    '0'
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.allocate_hotel_code(uuid, text) FROM PUBLIC;

COMMIT;
