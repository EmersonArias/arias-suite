-- Referencia provisional: primer día presente en el horario, incluso descanso o vacaciones.
CREATE OR REPLACE VIEW public.staff_operator_first_day WITH (security_invoker=true) AS
 SELECT hotel_id,operator_id,MIN(work_date) AS first_scheduled_date
 FROM public.staff_schedule_entries GROUP BY hotel_id,operator_id;
GRANT SELECT ON public.staff_operator_first_day TO authenticated;
-- Bloquear cualquier registro con trabajo medido y vacaciones ya confirmadas.
CREATE OR REPLACE FUNCTION public.staff_set_period(
 p_hotel_id uuid,p_operator_id uuid,p_start date,p_end date,p_state text
) RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_days integer;v_join date;v_changed integer;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.is_platform_admin() OR
    public.has_hotel_permission(p_hotel_id,'maintenance.configure')) THEN
  RAISE EXCEPTION 'Sin permiso para modificar jornadas' USING ERRCODE='42501';
 END IF;
 IF p_start IS NULL OR p_end IS NULL OR p_start>p_end
    OR p_end-p_start>92 OR p_state NOT IN ('VACATION','MEDICAL_LEAVE') THEN
  RAISE EXCEPTION 'Período o estado no válido (máximo 93 días)';
 END IF;
 SELECT join_date INTO v_join FROM public.staff_operators
 WHERE id=p_operator_id AND hotel_id=p_hotel_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Operario ajeno al hotel';END IF;
 IF v_join IS NULL THEN
   SELECT MIN(work_date) INTO v_join FROM public.staff_schedule_entries
   WHERE hotel_id=p_hotel_id AND operator_id=p_operator_id;
 END IF;
 IF v_join IS NOT NULL AND p_start<v_join THEN
  RAISE EXCEPTION 'El período comienza antes de la incorporación contractual';
 END IF;
 -- Bloquear jornadas ya disfrutadas, horas confirmadas o otras incidencias de alto impacto.
 PERFORM 1 FROM public.staff_schedule_entries
 WHERE hotel_id=p_hotel_id AND operator_id=p_operator_id
 AND work_date BETWEEN p_start AND p_end FOR UPDATE;
 IF EXISTS(
   SELECT 1 FROM public.staff_schedule_entries e
   WHERE e.hotel_id=p_hotel_id AND e.operator_id=p_operator_id
     AND e.work_date BETWEEN p_start AND p_end
     AND (e.state NOT IN ('SHIFT','REST','UNASSIGNED','VACATION','VACATION_PREVIOUS','MEDICAL_LEAVE')
       OR (COALESCE(e.actual_minutes,0)>0) OR e.vacation_taken_confirmed)
 ) THEN RAISE EXCEPTION 'El período incluye festivos disfrutados, horas confirmadas o descansos compensatorios. Edita esos días individualmente';END IF;
 INSERT INTO public.staff_schedule_entries
 (hotel_id,operator_id,work_date,state,source_kind,source_code,changed_by,
  start_time,end_time,planned_minutes,actual_minutes,actual_confirmed,justification,
  holiday_source_date,comp_source_entry_id,comp_rest_minutes,vacation_origin_year,
  vacation_taken_confirmed,vacation_confirmed_at,vacation_confirmed_by,updated_at)
 SELECT p_hotel_id,p_operator_id,day::date,p_state,'MANUAL',
   CASE WHEN p_state='VACATION' THEN 'Vacaciones programadas desde ficha'
    ELSE 'Baja registrada desde ficha' END,auth.uid(),
    NULL,NULL,NULL,NULL,false,CASE WHEN p_state='MEDICAL_LEAVE' THEN 'PENDING' ELSE 'UNKNOWN' END,
    NULL,NULL,NULL,CASE WHEN p_state='VACATION' THEN EXTRACT(YEAR FROM day)::int ELSE NULL END,
    false,NULL,NULL,now()
 FROM generate_series(p_start,p_end,interval '1 day') AS day
 ON CONFLICT (operator_id,work_date) DO UPDATE SET
  state=excluded.state,source_kind=excluded.source_kind,source_code=excluded.source_code,
  changed_by=excluded.changed_by,start_time=NULL,end_time=NULL,planned_minutes=NULL,
  actual_minutes=NULL,actual_confirmed=false,justification=excluded.justification,
  holiday_source_date=NULL,comp_source_entry_id=NULL,comp_rest_minutes=NULL,
  vacation_origin_year=excluded.vacation_origin_year,vacation_taken_confirmed=false,
  vacation_confirmed_at=NULL,vacation_confirmed_by=NULL,updated_at=now();
 GET DIAGNOSTICS v_changed=ROW_COUNT;
 RETURN v_changed;
END $$;
