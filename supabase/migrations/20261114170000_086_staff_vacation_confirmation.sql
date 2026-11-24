-- Registro separado de vacaciones verificadas; NO confundir calendario pasado con disfrute.
-- Solo el responsable autorizado puede modificar jornadas según RLS existente.
alter table public.staff_schedule_entries
  add column if not exists vacation_taken_confirmed boolean not null default false,
  add column if not exists vacation_confirmed_at timestamptz null,
  add column if not exists vacation_confirmed_by uuid null references public.profiles(id) on delete set null;

comment on column public.staff_schedule_entries.vacation_taken_confirmed is
  'Confirmación administrativa explícita de vacaciones realmente disfrutadas. Las fechas pasadas no se confirman automáticamente.';
comment on column public.staff_schedule_entries.vacation_confirmed_at is
  'Fecha de la última confirmación de disfrute; null cuando no está confirmado.';
comment on column public.staff_schedule_entries.vacation_confirmed_by is
  'Responsable que confirmó el disfrute. Solo permite actualizaciones bajo RLS de horarios.';
