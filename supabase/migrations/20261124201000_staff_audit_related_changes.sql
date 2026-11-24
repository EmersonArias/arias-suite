-- Auditoría de fichas, saldos y movimientos. Se asocia al mismo historial del planificador.
ALTER TABLE public.staff_schedule_history
 ADD COLUMN IF NOT EXISTS entity_kind text NOT NULL DEFAULT 'SCHEDULE';

CREATE OR REPLACE FUNCTION public.staff_record_related_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $audit$
DECLARE v_new jsonb;v_old jsonb;v_row jsonb;v_type text;v_day date;
BEGIN
 v_new:=CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END;
 v_old:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;
 IF TG_OP='UPDATE' AND (v_new - ARRAY['updated_at','changed_by'])
      =(v_old - ARRAY['updated_at','changed_by']) THEN RETURN NEW; END IF;
 v_row:=COALESCE(v_new,v_old);
 v_type:=CASE TG_TABLE_NAME
    WHEN 'staff_operators' THEN 'OPERATOR'
    WHEN 'staff_vacation_years' THEN 'VACATION_BALANCE'
    WHEN 'staff_overtime_ledger' THEN 'OVERTIME'
    ELSE 'RELATED' END;
 v_day:=CASE v_type
    WHEN 'OPERATOR' THEN current_date
    WHEN 'VACATION_BALANCE' THEN make_date((v_row->>'year')::integer,1,1)
    ELSE (v_row->>'entry_date')::date END;
 INSERT INTO public.staff_schedule_history(hotel_id,operator_id,schedule_entry_id,
   work_date,action,actor_user_id,previous_values,new_values,entity_kind)
 VALUES ((v_row->>'hotel_id')::uuid,
   CASE WHEN v_type='OPERATOR' THEN (v_row->>'id')::uuid
     ELSE (v_row->>'operator_id')::uuid END,
   NULL,v_day,TG_OP,auth.uid(),v_old,v_new,v_type);
 RETURN COALESCE(NEW,OLD);
END $audit$;
REVOKE ALL ON FUNCTION public.staff_record_related_change() FROM PUBLIC;

DROP TRIGGER IF EXISTS staff_operator_change_history ON public.staff_operators;
CREATE TRIGGER staff_operator_change_history AFTER INSERT OR UPDATE
 ON public.staff_operators FOR EACH ROW EXECUTE FUNCTION public.staff_record_related_change();
DROP TRIGGER IF EXISTS staff_vacation_balance_change_history ON public.staff_vacation_years;
CREATE TRIGGER staff_vacation_balance_change_history AFTER INSERT OR UPDATE OR DELETE
 ON public.staff_vacation_years FOR EACH ROW EXECUTE FUNCTION public.staff_record_related_change();
DROP TRIGGER IF EXISTS staff_overtime_change_history ON public.staff_overtime_ledger;
CREATE TRIGGER staff_overtime_change_history AFTER INSERT OR UPDATE OR DELETE
 ON public.staff_overtime_ledger FOR EACH ROW EXECUTE FUNCTION public.staff_record_related_change();
