-- Estandariza la relación de aparatos con códigos secuenciales RA-0001, RA-0002, ...
-- y garantiza la asignación transaccional de nuevos códigos.

BEGIN;

CREATE TABLE IF NOT EXISTS public.apparatus_registry_code_counter (
  id boolean PRIMARY KEY DEFAULT true,
  last_number bigint NOT NULL DEFAULT 0,
  CONSTRAINT apparatus_registry_code_counter_id_true CHECK (id = true),
  CONSTRAINT apparatus_registry_code_counter_last_number_nonnegative CHECK (last_number >= 0)
);

UPDATE public.apparatus_registry
SET code = 'TMP-' || id::text;

WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS sequence_number
  FROM public.apparatus_registry
)
UPDATE public.apparatus_registry ar
SET code = 'RA-' || LPAD(numbered.sequence_number::text, 4, '0')
FROM numbered
WHERE ar.id = numbered.id;

INSERT INTO public.apparatus_registry_code_counter (id, last_number)
SELECT true, COUNT(*) FROM public.apparatus_registry
ON CONFLICT (id)
DO UPDATE SET last_number = EXCLUDED.last_number;

CREATE UNIQUE INDEX IF NOT EXISTS ux_apparatus_registry_code
  ON public.apparatus_registry (code);

CREATE OR REPLACE FUNCTION public.assign_apparatus_registry_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  next_number bigint;
BEGIN
  UPDATE public.apparatus_registry_code_counter
  SET last_number = last_number + 1
  WHERE id = true
  RETURNING last_number INTO next_number;

  IF next_number IS NULL THEN
    INSERT INTO public.apparatus_registry_code_counter (id, last_number)
    VALUES (true, 1)
    ON CONFLICT (id) DO UPDATE
      SET last_number = public.apparatus_registry_code_counter.last_number + 1
    RETURNING last_number INTO next_number;
  END IF;

  NEW.code := 'RA-' || LPAD(next_number::text, 4, '0');
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_apparatus_registry_code() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_assign_apparatus_registry_code
ON public.apparatus_registry;

CREATE TRIGGER trg_assign_apparatus_registry_code
BEFORE INSERT ON public.apparatus_registry
FOR EACH ROW
EXECUTE FUNCTION public.assign_apparatus_registry_code();

COMMIT;
