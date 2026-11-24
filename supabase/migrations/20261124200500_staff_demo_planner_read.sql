-- Cuenta de prueba acotada a lectura de planificador del hotel al que está vinculada.
-- No obtiene permisos de escritura ni acceso a notas privadas ni a otros módulos.
-- El acceso solo existe mientras su pertenencia al hotel siga activa.
DO $$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['staff_operators','staff_schedule_entries',
   'staff_overtime_ledger','staff_vacation_years','staff_calendar_holidays']
 LOOP
  EXECUTE format('DROP POLICY IF EXISTS staff_demo_read_only ON public.%I',tab);
  EXECUTE format($q$CREATE POLICY staff_demo_read_only ON public.%I FOR SELECT TO authenticated
   USING (
      (SELECT auth.uid())='6d755017-7348-41ea-aad7-d1b8334fff99'::uuid
      AND EXISTS (SELECT 1 FROM public.user_hotel_roles membership
        WHERE membership.user_id=(SELECT auth.uid())
          AND membership.hotel_id=%I.hotel_id AND membership.active)
   )$q$,tab,tab);
 END LOOP;
END $$;