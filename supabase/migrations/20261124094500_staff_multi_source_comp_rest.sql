-- Compensación de una jornada a partir de varios saldos de horas extras.
-- Los movimientos manuales e históricos no se modifican.
DROP INDEX IF EXISTS public.staff_overtime_one_schedule_link;
CREATE UNIQUE INDEX IF NOT EXISTS staff_overtime_schedule_source_unique
 ON public.staff_overtime_ledger(linked_schedule_entry_id,compensates_entry_id)
 WHERE linked_schedule_entry_id IS NOT NULL AND compensates_entry_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.staff_schedule_compensatory_day(
 p_hotel_id uuid, p_operator_id uuid, p_work_date date, p_allocations jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE
 v_day public.staff_schedule_entries%ROWTYPE;
 v_target integer;
 v_total integer := 0;
 v_global_available integer;
 v_count integer;
 v_item jsonb;
 v_id uuid;
 v_minutes integer;
 v_earned integer;
 v_used integer;
 v_hotel uuid;
 v_operator uuid;
 v_type text;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.is_platform_admin() OR
    public.has_hotel_permission(p_hotel_id,'maintenance.configure')) THEN
   RAISE EXCEPTION 'Sin permiso para modificar el planificador' USING ERRCODE='42501';
 END IF;
 IF p_allocations IS NULL OR jsonb_typeof(p_allocations)<>'array' OR
    jsonb_array_length(p_allocations) NOT BETWEEN 1 AND 30 THEN
   RAISE EXCEPTION 'Selecciona uno o varios registros de horas';
 END IF;
 PERFORM 1 FROM public.staff_operators
 WHERE id=p_operator_id AND hotel_id=p_hotel_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Trabajador no válido'; END IF;

 SELECT * INTO v_day FROM public.staff_schedule_entries
 WHERE hotel_id=p_hotel_id AND operator_id=p_operator_id AND work_date=p_work_date
 FOR UPDATE;
 v_target:=COALESCE(
   CASE WHEN v_day.state='COMP_REST' THEN v_day.comp_rest_minutes
        WHEN v_day.state='SHIFT' THEN v_day.planned_minutes ELSE NULL END,480);
 IF v_target NOT BETWEEN 1 AND 1440 THEN
   RAISE EXCEPTION 'La duración del turno previsto no es válida';
 END IF;

 SELECT count(DISTINCT item->>'sourceId') INTO v_count
 FROM jsonb_array_elements(p_allocations) AS item;
 IF v_count<>jsonb_array_length(p_allocations) THEN
   RAISE EXCEPTION 'No se puede seleccionar dos veces el mismo origen';
 END IF;

 -- Bloquear todos los saldos del trabajador en orden estable para serializar consumo.
 PERFORM 1 FROM public.staff_overtime_ledger
 WHERE hotel_id=p_hotel_id AND operator_id=p_operator_id AND
    entry_type IN ('EARNED','ADJUSTMENT_PLUS') FOR UPDATE;

 FOR v_item IN SELECT value FROM jsonb_array_elements(p_allocations) LOOP
   IF NOT (v_item ? 'sourceId' AND v_item ? 'minutes') OR
      (v_item->>'sourceId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR
      (v_item->>'minutes') !~ '^[0-9]+$' THEN
     RAISE EXCEPTION 'Registro o cantidad de horas inválidos';
   END IF;
   v_id:=(v_item->>'sourceId')::uuid;
   v_minutes:=(v_item->>'minutes')::integer;
   IF v_minutes<=0 OR v_minutes>1440 THEN
     RAISE EXCEPTION 'Cantidad de recuperación inválida';
   END IF;
   SELECT l.hotel_id,l.operator_id,l.entry_type,l.minutes
     INTO v_hotel,v_operator,v_type,v_earned
   FROM public.staff_overtime_ledger l WHERE l.id=v_id;
   IF NOT FOUND OR v_hotel<>p_hotel_id OR v_operator<>p_operator_id OR
      v_type NOT IN ('EARNED','ADJUSTMENT_PLUS') THEN
     RAISE EXCEPTION 'Las horas deben pertenecer a este trabajador';
   END IF;
   SELECT COALESCE(sum(l.minutes),0) INTO v_used
   FROM public.staff_overtime_ledger l WHERE l.compensates_entry_id=v_id
     AND (v_day.id IS NULL OR l.linked_schedule_entry_id IS DISTINCT FROM v_day.id);
   IF v_minutes+v_used>v_earned THEN
      RAISE EXCEPTION 'Ese registro no tiene tantas horas disponibles';
   END IF;
   v_total:=v_total+v_minutes;
 END LOOP;

 IF v_total<>v_target THEN
    RAISE EXCEPTION 'La jornada exige % minutos y has asignado % minutos',v_target,v_total;
 END IF;

 IF EXISTS (
    SELECT 1 FROM public.staff_overtime_ledger l
    WHERE l.hotel_id=p_hotel_id AND l.operator_id=p_operator_id
      AND l.entry_date=p_work_date AND l.entry_type='REST_TAKEN'
      AND l.linked_schedule_entry_id IS NULL
 ) THEN
    RAISE EXCEPTION 'Hay un descanso manual ese día. Revísalo para evitar un doble descuento';
 END IF;

 -- El saldo global incluye consumos manuales previos sin origen atribuible.
 SELECT COALESCE(sum(CASE WHEN entry_type IN ('EARNED','ADJUSTMENT_PLUS')
       THEN minutes ELSE -minutes END),0) INTO v_global_available
 FROM public.staff_overtime_ledger
 WHERE hotel_id=p_hotel_id AND operator_id=p_operator_id;
 IF v_day.id IS NOT NULL THEN
    v_global_available:=v_global_available + COALESCE((
       SELECT sum(minutes) FROM public.staff_overtime_ledger
       WHERE linked_schedule_entry_id=v_day.id AND source_kind='SCHEDULE'),0);
 END IF;
 IF v_global_available<v_target THEN
    RAISE EXCEPTION 'Saldo global insuficiente: quedan % minutos',v_global_available;
 END IF;

 INSERT INTO public.staff_schedule_entries(hotel_id,operator_id,work_date,state,
   source_kind,source_code,comp_source_entry_id,comp_rest_minutes,holiday_source_date,
   start_time,end_time,planned_minutes,vacation_origin_year,
   vacation_taken_confirmed,vacation_confirmed_at,vacation_confirmed_by,changed_by)
 VALUES(p_hotel_id,p_operator_id,p_work_date,'COMP_REST','MANUAL',
    'Recuperación de horas · varios registros',NULL,v_target,NULL,NULL,NULL,NULL,NULL,
    false,NULL,NULL,auth.uid())
 ON CONFLICT (operator_id,work_date) DO UPDATE SET state='COMP_REST',
    source_kind='MANUAL',source_code='Recuperación de horas · varios registros',
    comp_source_entry_id=NULL,comp_rest_minutes=v_target,holiday_source_date=NULL,
    start_time=NULL,end_time=NULL,planned_minutes=NULL,vacation_origin_year=NULL,
    vacation_taken_confirmed=false,vacation_confirmed_at=NULL,vacation_confirmed_by=NULL,
    changed_by=auth.uid(),updated_at=now()
 RETURNING * INTO v_day;

 DELETE FROM public.staff_overtime_ledger
 WHERE linked_schedule_entry_id=v_day.id AND source_kind='SCHEDULE';

 FOR v_item IN SELECT value FROM jsonb_array_elements(p_allocations) LOOP
   INSERT INTO public.staff_overtime_ledger(hotel_id,operator_id,entry_date,
     entry_type,minutes,reason,source_kind,confirmed,changed_by,
     compensates_entry_id,linked_schedule_entry_id)
   VALUES (p_hotel_id,p_operator_id,p_work_date,'REST_TAKEN',
     (v_item->>'minutes')::integer,'Descanso vinculado al cuadrante',
     'SCHEDULE',true,auth.uid(),(v_item->>'sourceId')::uuid,v_day.id);
 END LOOP;
 RETURN v_day.id;
END $$;
REVOKE ALL ON FUNCTION public.staff_schedule_compensatory_day(uuid,uuid,date,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_schedule_compensatory_day(uuid,uuid,date,jsonb) TO authenticated;