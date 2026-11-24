-- Arias Suite: referencias de festivos y compensaciones de horas, sin modificar históricos.
ALTER TABLE public.staff_schedule_entries
 ADD COLUMN IF NOT EXISTS holiday_source_date date,
 ADD COLUMN IF NOT EXISTS comp_source_entry_id uuid,
 ADD COLUMN IF NOT EXISTS comp_rest_minutes integer;
ALTER TABLE public.staff_schedule_entries
 DROP CONSTRAINT IF EXISTS staff_schedule_comp_rest_minutes_check;
ALTER TABLE public.staff_schedule_entries
 ADD CONSTRAINT staff_schedule_comp_rest_minutes_check
 CHECK (comp_rest_minutes IS NULL OR (comp_rest_minutes > 0 AND comp_rest_minutes <= 1440));
ALTER TABLE public.staff_overtime_ledger
 ADD COLUMN IF NOT EXISTS compensates_entry_id uuid REFERENCES public.staff_overtime_ledger(id),
 ADD COLUMN IF NOT EXISTS linked_schedule_entry_id uuid REFERENCES public.staff_schedule_entries(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS staff_overtime_one_schedule_link
 ON public.staff_overtime_ledger(linked_schedule_entry_id) WHERE linked_schedule_entry_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS staff_overtime_compensation_source
 ON public.staff_overtime_ledger(compensates_entry_id) WHERE compensates_entry_id IS NOT NULL;

-- Complete only historical ISO dates that belong to the hotel calendar.
UPDATE public.staff_schedule_entries e
 SET holiday_source_date=substring(e.source_code FROM '[0-9]{4}-[0-9]{2}-[0-9]{2}')::date
 WHERE e.state='PUBLIC_HOLIDAY' AND e.holiday_source_date IS NULL
 AND e.source_code ~ '[0-9]{4}-[0-9]{2}-[0-9]{2}'
 AND EXISTS (SELECT 1 FROM public.staff_calendar_holidays h
    WHERE h.hotel_id=e.hotel_id
      AND h.holiday_date=substring(e.source_code FROM '[0-9]{4}-[0-9]{2}-[0-9]{2}')::date);
CREATE UNIQUE INDEX IF NOT EXISTS staff_one_enjoyment_per_holiday
 ON public.staff_schedule_entries(operator_id,holiday_source_date)
 WHERE state='PUBLIC_HOLIDAY' AND holiday_source_date IS NOT NULL;

-- When the day is changed in the planner, keep the generated compensation
-- ledger entry in sync. Existing manual entries remain untouched.
CREATE OR REPLACE FUNCTION public.staff_sync_compensatory_rest()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE earned_minutes integer;
DECLARE already_consumed integer;
BEGIN
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
DROP TRIGGER IF EXISTS staff_schedule_comp_rest_sync ON public.staff_schedule_entries;
CREATE TRIGGER staff_schedule_comp_rest_sync
 AFTER INSERT OR UPDATE OF state,comp_source_entry_id,comp_rest_minutes,work_date
 ON public.staff_schedule_entries
 FOR EACH ROW EXECUTE FUNCTION public.staff_sync_compensatory_rest();
