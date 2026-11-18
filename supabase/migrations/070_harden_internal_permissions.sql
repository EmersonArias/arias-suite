-- Arias Suite - migración 070: reducir privilegios directos sobre objetos internos.
-- Los cinco objetos mantienen RLS activado sin políticas intencionadamente:
-- el acceso se realiza a través de funciones controladas SECURITY DEFINER.
-- Retirar los grants directos hace explícito ese límite y evita exposición
-- accidental si posteriormente se añade una política RLS demasiado amplia.

BEGIN;

REVOKE ALL PRIVILEGES ON TABLE
  public.apparatus_registry_code_counter,
  public.apparatus_registry_code_counters,
  public.code_sequence_templates,
  public.hotel_code_sequences,
  public.maintenance_ot_daily_counters
FROM PUBLIC, anon, authenticated;

-- Función de trigger interna. PostgreSQL no necesita que el rol llamante
-- tenga EXECUTE en la función para que la ejecute un trigger ya definido.
-- Se revoca la invocación directa por RPC, conservando los grants existentes
-- de postgres y service_role.
REVOKE EXECUTE ON FUNCTION public.generate_next_maintenance_work_order_after_execution()
FROM PUBLIC, anon, authenticated;

COMMIT;
