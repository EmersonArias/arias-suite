-- Auditoría preventiva: no crear nuevas asignaciones repetidas de un mismo festivo.
-- Los registros históricos (incluido cualquier duplicado existente) no se modifican.
CREATE OR REPLACE FUNCTION public.staff_holiday_origin_ref(
  p_origin date,p_source text,p_work_date date
) RETURNS date LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE v_month integer;
BEGIN
 IF p_origin IS NOT NULL THEN RETURN p_origin; END IF;
 IF p_source IS NULL THEN RETURN NULL; END IF;
 IF p_source ~ '[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN
   RETURN substring(p_source FROM '[0-9]{4}-[0-9]{2}-[0-9]{2}')::date;
 END IF;
 IF p_source !~ '^[0-9]{2}-(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)$'
 THEN RETURN NULL; END IF;
 v_month:=CASE substring(p_source FROM 4 FOR 3)
   WHEN 'ene' THEN 1 WHEN 'feb' THEN 2 WHEN 'mar' THEN 3 WHEN 'abr' THEN 4
   WHEN 'may' THEN 5 WHEN 'jun' THEN 6 WHEN 'jul' THEN 7 WHEN 'ago' THEN 8
   WHEN 'sep' THEN 9 WHEN 'oct' THEN 10 WHEN 'nov' THEN 11 WHEN 'dic' THEN 12 END;
 RETURN make_date(extract(year from p_work_date)::integer,v_month,substring(p_source FROM 1 FOR 2)::integer);
END $$;

CREATE OR REPLACE FUNCTION public.staff_prevent_duplicate_holiday()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_origin date;
BEGIN
 IF NEW.state<>'PUBLIC_HOLIDAY' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.state='PUBLIC_HOLIDAY'
   AND OLD.work_date IS NOT DISTINCT FROM NEW.work_date
   AND OLD.holiday_source_date IS NOT DISTINCT FROM NEW.holiday_source_date
   AND OLD.source_code IS NOT DISTINCT FROM NEW.source_code
 THEN
   -- No bloquear la edición de otros datos de registros históricos duplicados.
   RETURN NEW;
 END IF;
 v_origin:=public.staff_holiday_origin_ref(NEW.holiday_source_date,NEW.source_code,NEW.work_date);
 IF v_origin IS NULL THEN
   RAISE EXCEPTION 'Selecciona un festivo de origen antes de registrar el disfrute';
 END IF;
 IF EXISTS(
   SELECT 1 FROM public.staff_schedule_entries other
   WHERE other.operator_id=NEW.operator_id
     AND other.state='PUBLIC_HOLIDAY'
     AND other.id IS DISTINCT FROM NEW.id
     AND public.staff_holiday_origin_ref(other.holiday_source_date,other.source_code,other.work_date)=v_origin
 ) THEN
   RAISE EXCEPTION 'Este trabajador ya tiene asignado el festivo % en otra fecha. Revisa la pestaña Festivos.',v_origin;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS staff_no_duplicate_holiday ON public.staff_schedule_entries;
CREATE TRIGGER staff_no_duplicate_holiday
BEFORE INSERT OR UPDATE OF state,holiday_source_date,source_code,work_date
ON public.staff_schedule_entries
FOR EACH ROW EXECUTE FUNCTION public.staff_prevent_duplicate_holiday();