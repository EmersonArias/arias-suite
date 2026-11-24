-- Trazabilidad íntegra de cambios en el cuadrante, indistintamente del módulo de origen.
-- No se modifica el histórico y la fecha contractual sigue teniendo prioridad.
CREATE TABLE IF NOT EXISTS public.staff_schedule_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
 operator_id uuid NOT NULL REFERENCES public.staff_operators(id) ON DELETE CASCADE,
 schedule_entry_id uuid,
 work_date date NOT NULL,
 action text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
 changed_at timestamptz NOT NULL DEFAULT now(),
 actor_user_id uuid,
 previous_values jsonb,
 new_values jsonb
);
CREATE INDEX IF NOT EXISTS staff_schedule_history_lookup_idx
 ON public.staff_schedule_history(hotel_id,operator_id,changed_at DESC);
ALTER TABLE public.staff_schedule_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_schedule_history_select ON public.staff_schedule_history;
CREATE POLICY staff_schedule_history_select ON public.staff_schedule_history FOR SELECT TO authenticated
 USING (public.is_platform_admin() OR public.has_hotel_permission(hotel_id,'maintenance.configure'));
GRANT SELECT ON public.staff_schedule_history TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.staff_schedule_history FROM authenticated,anon;

CREATE OR REPLACE FUNCTION public.staff_record_schedule_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $
BEGIN
 IF TG_OP='UPDATE' AND to_jsonb(OLD) - ARRAY['updated_at','changed_by']
      = to_jsonb(NEW) - ARRAY['updated_at','changed_by'] THEN
   RETURN NEW;
 END IF;
 INSERT INTO public.staff_schedule_history
   (hotel_id,operator_id,schedule_entry_id,work_date,action,actor_user_id,previous_values,new_values)
 VALUES(
   COALESCE(NEW.hotel_id,OLD.hotel_id),COALESCE(NEW.operator_id,OLD.operator_id),
   COALESCE(NEW.id,OLD.id),COALESCE(NEW.work_date,OLD.work_date),TG_OP,
   auth.uid(),CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,
   CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END
 );
 RETURN COALESCE(NEW,OLD);
END $$;
REVOKE ALL ON FUNCTION public.staff_record_schedule_change() FROM PUBLIC;
DROP TRIGGER IF EXISTS staff_schedule_change_history ON public.staff_schedule_entries;
CREATE TRIGGER staff_schedule_change_history
 AFTER INSERT OR UPDATE OR DELETE ON public.staff_schedule_entries
 FOR EACH ROW EXECUTE FUNCTION public.staff_record_schedule_change();

-- Fecha del primer turno: referencia provisional solamente si join_date es NULL.
CREATE OR REPLACE VIEW public.staff_operator_first_shift WITH (security_invoker=true) AS
 SELECT hotel_id,operator_id,MIN(work_date) AS first_shift_date
 FROM public.staff_schedule_entries WHERE state='SHIFT'
 GROUP BY hotel_id,operator_id;
GRANT SELECT ON public.staff_operator_first_shift TO authenticated;
