-- Guardar el histórico: un descanso ya registrado manualmente no se vuelve a descontar.
-- Sustituye solo la función de sincronización; no altera movimientos existentes.
CREATE OR REPLACE FUNCTION public.staff_sync_compensatory_rest()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE earned_minutes integer;
DECLARE already_consumed integer;
BEGIN
 IF NEW.state='PUBLIC_HOLIDAY' AND NEW.holiday_source_date IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.staff_calendar_holidays h
      WHERE h.hotel_id=NEW.hotel_id AND h.holiday_date=NEW.holiday_source_date) THEN
   RAISE EXCEPTION 'El festivo seleccionado no existe en el calendario del hotel';
 END IF;
 IF NEW.state='COMP_REST' AND NEW.comp_source_entry_id IS NOT NULL THEN
   IF NEW.comp_rest_minutes IS NULL OR NEW.comp_rest_minutes<=0 THEN
      RAISE EXCEPTION 'Indica las horas de recuperación';
   END IF;
   SELECT l.minutes INTO earned_minutes FROM public.staff_overtime_ledger l
     WHERE l.id=NEW.comp_source_entry_id AND l.hotel_id=NEW.hotel_id
       AND l.operator_id=NEW.operator_id AND l.entry_type IN ('EARNED','ADJUSTMENT_PLUS')
     FOR UPDATE;
   IF earned_minutes IS NULL THEN
      RAISE EXCEPTION 'Las horas generadas no pertenecen al trabajador seleccionado';
   END IF;
   IF EXISTS (
     SELECT 1 FROM public.staff_overtime_ledger historical
     WHERE historical.hotel_id=NEW.hotel_id AND historical.operator_id=NEW.operator_id
       AND historical.entry_type='REST_TAKEN' AND historical.entry_date=NEW.work_date
       AND historical.linked_schedule_entry_id IS NULL
   ) THEN
     RAISE EXCEPTION 'Este día ya tiene horas disfrutadas registradas manualmente. Revisa el histórico para evitar duplicar el descuento.';
   END IF;
   SELECT coalesce(sum(l.minutes),0) INTO already_consumed
     FROM public.staff_overtime_ledger l
     WHERE l.compensates_entry_id=NEW.comp_source_entry_id
       AND (l.linked_schedule_entry_id IS NULL OR l.linked_schedule_entry_id<>NEW.id);
   IF already_consumed+NEW.comp_rest_minutes>earned_minutes THEN
      RAISE EXCEPTION 'Las horas recuperadas superan las horas disponibles de ese registro';
   END IF;
   INSERT INTO public.staff_overtime_ledger
     (hotel_id,operator_id,entry_date,entry_type,minutes,reason,source_kind,confirmed,changed_by,
      compensates_entry_id,linked_schedule_entry_id)
   VALUES (NEW.hotel_id,NEW.operator_id,NEW.work_date,'REST_TAKEN',NEW.comp_rest_minutes,
      'Descanso compensatorio vinculado al cuadrante','SCHEDULE',true,NEW.changed_by,
      NEW.comp_source_entry_id,NEW.id)
   ON CONFLICT (linked_schedule_entry_id) WHERE linked_schedule_entry_id IS NOT NULL
   DO UPDATE SET entry_date=excluded.entry_date,minutes=excluded.minutes,
      compensates_entry_id=excluded.compensates_entry_id,
      changed_by=excluded.changed_by;
 ELSE
   DELETE FROM public.staff_overtime_ledger
    WHERE linked_schedule_entry_id=NEW.id AND source_kind='SCHEDULE';
 END IF;
 RETURN NEW;
END $$;
