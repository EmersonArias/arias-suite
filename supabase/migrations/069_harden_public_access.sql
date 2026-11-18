-- Arias Suite - migracion 069: endurecimiento de acceso anonimo.
-- Importante: se debe probar en un entorno no productivo y revisar la
-- compatibilidad funcional antes de aplicarla a produccion.
-- Mantiene el aislamiento RLS de las tablas y conserva grants autenticados
-- para funciones SECURITY DEFINER que forman parte de las rutas autorizadas.
BEGIN;

-- 1. Retirar politicas abiertas heredadas. Estas politicas con USING/WITH CHECK
--    true anulaban en la practica el aislamiento por hotel de la politica autorizada.
DROP POLICY IF EXISTS "public delete electrical_panels" ON public.electrical_panels;
DROP POLICY IF EXISTS "public insert electrical_panels" ON public.electrical_panels;
DROP POLICY IF EXISTS "public read electrical_panels" ON public.electrical_panels;
DROP POLICY IF EXISTS "public update electrical_panels" ON public.electrical_panels;
DROP POLICY IF EXISTS "public insert inspections" ON public.inspections;
DROP POLICY IF EXISTS "public read inspections" ON public.inspections;
DROP POLICY IF EXISTS "public update inspections" ON public.inspections;

REVOKE ALL PRIVILEGES ON TABLE public.electrical_panels, public.inspections
  FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.electrical_panels, public.inspections
  TO authenticated;

-- 2. Hacer que las vistas PAM apliquen los permisos/RLS del usuario llamante.
ALTER VIEW public.pam_source_marks_resolved SET (security_invoker = true);
ALTER VIEW public.pam_plan_candidates SET (security_invoker = true);
ALTER VIEW public.pam_source_unresolved SET (security_invoker = true);
ALTER VIEW public.pam_source_validation_summary SET (security_invoker = true);
ALTER VIEW public.pam_source_review_queue SET (security_invoker = true);

REVOKE ALL PRIVILEGES ON TABLE
  public.pam_source_marks_resolved,
  public.pam_plan_candidates,
  public.pam_source_unresolved,
  public.pam_source_validation_summary,
  public.pam_source_review_queue
  FROM PUBLIC, anon;
GRANT SELECT ON TABLE
  public.pam_source_marks_resolved,
  public.pam_plan_candidates,
  public.pam_source_unresolved,
  public.pam_source_validation_summary,
  public.pam_source_review_queue
  TO authenticated;

-- 3. SECURITY DEFINER grants: quitar siempre PUBLIC/anon a las funciones
--    SECURITY DEFINER existentes en public, manteniendo los permisos explicitos
--    que ya tienen los usuarios autenticados o service_role cuando proceda.
DO $$
DECLARE
  function_row record;
BEGIN
  FOR function_row IN
    SELECT p.oid::regprocedure AS function_signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon',
      function_row.function_signature
    );
  END LOOP;
END;
$$;

-- 4. Funciones internas/trigger/scheduler que no deben ser invocables por
--    cualquier usuario autenticado. Los triggers siguen ejecutandose como parte
--    de sus sentencias y los procesos internos conservan service_role.
REVOKE EXECUTE ON FUNCTION public.allocate_hotel_code(uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_apparatus_registry_code()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.complete_work_order_from_maintenance_execution()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_viewer_read_only_role()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.evaluate_maintenance_control_result()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_maintenance_work_orders()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_next_maintenance_work_order(uuid)
  FROM PUBLIC, anon, authenticated;
-- get_maintenance_alert_recipients(uuid) se conserva para authenticated:
-- la interfaz de mantenimiento lo usa y la función valida has_hotel_access(target_hotel_id).
REVOKE EXECUTE ON FUNCTION public.handle_maintenance_control_alert()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_profile()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.initialize_hotel_code_sequences(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.initialize_new_hotel_code_sequences()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_maintenance_execution_work_order()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.next_maintenance_ot_number(uuid, date)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.queue_maintenance_alert_emails()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_maintenance_execution_result()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_maintenance_plan_due_date(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_maintenance_alert_cycle()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_profile_email_from_auth()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_profile_name_from_auth()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_recalculate_maintenance_plan_due_date()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_recalculate_maintenance_plan_on_change()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_refresh_maintenance_due_alerts()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_hotel_location_hierarchy()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_maintenance_alert_user()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_has_suite_access(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.allocate_hotel_code(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.user_has_suite_access(uuid) TO service_role;

-- 5. Storage: eliminar listados/escrituras/borrados anonimos de fotografias de
--    equipos. El bucket se mantiene publico para no romper las URL historicas;
--    el acceso de lectura directa por URL sigue siendo publico hasta una futura
--    migracion a URL firmadas. Las operaciones de escritura se limitan al hotel
--    y permiso del activo de la ruta (<apparatus_registry_id>/...).
DROP POLICY IF EXISTS apparatus_registry_photos_select ON storage.objects;
DROP POLICY IF EXISTS apparatus_registry_photos_insert ON storage.objects;
DROP POLICY IF EXISTS apparatus_registry_photos_delete ON storage.objects;

-- Restringir la lectura/listado de metadatos a usuarios autenticados con
-- permiso de lectura sobre el equipo. La URL pública sigue siendo pública
-- mientras el bucket esté configurado como público.
CREATE POLICY apparatus_registry_photos_select
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'apparatus-registry'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND EXISTS (
      SELECT 1
      FROM public.apparatus_registry ar
      WHERE ar.id = split_part(name, '/', 1)::uuid
        AND public.has_hotel_permission(ar.hotel_id, 'apparatusregistry.view')
    )
  );

CREATE POLICY apparatus_registry_photos_insert
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'apparatus-registry'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND EXISTS (
      SELECT 1
      FROM public.apparatus_registry ar
      WHERE ar.id = split_part(name, '/', 1)::uuid
        AND public.has_hotel_permission(ar.hotel_id, 'apparatusregistry.update')
    )
  );

CREATE POLICY apparatus_registry_photos_delete
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'apparatus-registry'
    AND split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND EXISTS (
      SELECT 1
      FROM public.apparatus_registry ar
      WHERE ar.id = split_part(name, '/', 1)::uuid
        AND public.has_hotel_permission(ar.hotel_id, 'apparatusregistry.update')
    )
  );

-- No se encontraron usos del bucket electrical-panels en las pantallas actuales.
-- Retirar las cuatro politicas globales para impedir escritura/gestion anonima.
DROP POLICY IF EXISTS "public delete electrical panel photos" ON storage.objects;
DROP POLICY IF EXISTS "public read electrical panel photos" ON storage.objects;
DROP POLICY IF EXISTS "public update electrical panel photos" ON storage.objects;
DROP POLICY IF EXISTS "public upload electrical panel photos" ON storage.objects;

-- 6. Los nuevos SECURITY DEFINER creados por postgres deben recibir grants
--    explicitos en futuras migraciones, en vez de quedar expuestos por defecto.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;

COMMIT;
