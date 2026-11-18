-- Arias Suite — migración correctiva 067
-- Asegura que authenticated no conserve un privilegio DELETE heredado
-- por los privilegios por defecto del proyecto al crear hotel_locations.
-- No modifica migraciones anteriores ni datos.
BEGIN;

REVOKE ALL PRIVILEGES ON TABLE public.hotel_locations
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.hotel_locations
  TO authenticated;

COMMIT;
