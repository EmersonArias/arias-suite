ALTER TABLE public.staff_schedule_history
  ADD COLUMN IF NOT EXISTS administrative_label text;

COMMENT ON COLUMN public.staff_schedule_history.administrative_label IS
  'Etiqueta visible para anotaciones administrativas. No sustituye al autor de la sesión.';

UPDATE public.staff_schedule_history AS h
SET administrative_label = 'Intervención administrativa · sin sesión'
WHERE h.hotel_id = '9e2e3d56-25d7-41a5-8dd6-df6858e735bd'
  AND h.actor_user_id IS NULL
  AND (
    h.changed_at = '2026-11-25 09:12:33.999385+00'
    OR (
      h.changed_at = '2026-11-25 13:47:44.631291+00'
      AND h.work_date = '2026-11-25'
      AND h.entity_kind = 'SCHEDULE'
      AND h.action = 'UPDATE'
      AND h.previous_values->>'justification' = 'PENDING'
      AND h.new_values->>'justification' = 'UNJUSTIFIED'
    )
  );
