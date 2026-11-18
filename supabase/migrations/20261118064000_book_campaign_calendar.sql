begin;
CREATE OR REPLACE FUNCTION public.recalculate_maintenance_plan_due_date(target_plan_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  plan_record public.maintenance_plans%ROWTYPE;
  latest_execution_date date;
  calculated_due date;
BEGIN
  SELECT *
  INTO plan_record
  FROM public.maintenance_plans
  WHERE id = target_plan_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT CASE c.kind WHEN 'FANCOILS' THEN make_date(extract(year from w.scheduled_date)::int+1,1,1)
    ELSE (date_trunc('quarter',w.scheduled_date)::date+interval '3 months')::date END
  INTO calculated_due
  FROM public.maintenance_executions e
  JOIN public.technical_book_campaigns c ON c.ticket_id=e.work_order_id AND c.closed_at IS NOT NULL
  JOIN public.maintenance_work_orders w ON w.id=c.ticket_id AND w.hotel_id=plan_record.hotel_id
  WHERE e.maintenance_plan_id=target_plan_id AND e.executed_at IS NOT NULL AND e.result<>'CANCELLED'
  ORDER BY e.executed_at DESC LIMIT 1;
  IF FOUND THEN
    UPDATE public.maintenance_plans SET next_due_date=calculated_due,updated_at=now() WHERE id=target_plan_id;
    RETURN;
  END IF;

  SELECT MAX(me.executed_at::date)
  INTO latest_execution_date
  FROM public.maintenance_executions me
  WHERE me.maintenance_plan_id = target_plan_id
    AND me.executed_at IS NOT NULL
    AND me.result <> 'CANCELLED';

  IF latest_execution_date IS NULL THEN
    UPDATE public.maintenance_plans
    SET next_due_date = NULL,
        updated_at = now()
    WHERE id = target_plan_id;
    RETURN;
  END IF;

  calculated_due := CASE
    WHEN plan_record.periodicity_unit = 'DAY'
      AND plan_record.periodicity_value IS NOT NULL
      THEN latest_execution_date + plan_record.periodicity_value
    WHEN plan_record.periodicity_unit = 'WEEK'
      AND plan_record.periodicity_value IS NOT NULL
      THEN latest_execution_date + (plan_record.periodicity_value * 7)
    WHEN plan_record.periodicity_unit = 'MONTH'
      AND plan_record.periodicity_value IS NOT NULL
      THEN (
        latest_execution_date
        + make_interval(months => plan_record.periodicity_value)
      )::date
    WHEN plan_record.periodicity_unit = 'YEAR'
      AND plan_record.periodicity_value IS NOT NULL
      THEN (
        latest_execution_date
        + make_interval(years => plan_record.periodicity_value)
      )::date
    ELSE NULL
  END;

  UPDATE public.maintenance_plans
  SET next_due_date = calculated_due,
      updated_at = now()
  WHERE id = target_plan_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.start_hotel_exercise(target_hotel_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
 gate public.maintenance_exercise_start;
 started timestamptz := now();
 first_day date := timezone('Europe/Madrid',started)::date;
 plan record;
 due date;
 step interval;
 n integer;
begin
 select * into gate from public.maintenance_exercise_start where hotel_id=target_hotel_id for update;
 if not found or auth.uid() is null or auth.uid() is distinct from gate.operator_id
    or not coalesce(public.has_suite_access(),false) or not coalesce(public.has_hotel_access(target_hotel_id),false) then
   raise exception 'Sin permiso para iniciar el ejercicio de este hotel.';
 end if;
 if gate.started_at is not null then raise exception 'El ejercicio ya está iniciado.'; end if;
 -- Keep the anchored cadence. Skip elapsed occurrences without recording them as work done.
 for plan in select id, coalesce(next_due_date,start_date) anchor, periodicity_value v, periodicity_unit unit
  from public.maintenance_plans where hotel_id=target_hotel_id and active and coalesce(next_due_date,start_date)<first_day
  and periodicity_unit in ('DAY','WEEK','MONTH','YEAR') and periodicity_value>0 for update
 loop
  if exists(select 1 from public.maintenance_plans p join public.apparatus_registry a on a.id=p.apparatus_registry_id and a.hotel_id=p.hotel_id where p.id=plan.id and a.source_id in (340,341)) then
   due:=first_day;
  else
  step := case plan.unit when 'DAY' then make_interval(days=>plan.v) when 'WEEK' then make_interval(weeks=>plan.v)
    when 'MONTH' then make_interval(months=>plan.v) when 'YEAR' then make_interval(years=>plan.v) end;
  n := 1;
  due := (plan.anchor + step)::date;
  while due < first_day loop
    n := n+1;
    due := (plan.anchor + n * step)::date;
  end loop;
  end if;
  update public.maintenance_plans set next_due_date=due,updated_at=now() where id=plan.id;
 end loop;
 update public.maintenance_exercise_start set started_at=started where hotel_id=target_hotel_id;
 update public.maintenance_hotel_config set ot_generation_mode='AUTO' where hotel_id=target_hotel_id;
 if not found then raise exception 'Falta la configuración de mantenimiento del hotel.'; end if;
 return started;
end $function$;
commit;
