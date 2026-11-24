-- Audit the authenticated user who last changed an LED wardrobe room record.
create or replace function public.set_maintenance_room_led_tracking_audit()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists maintenance_room_led_tracking_audit on public.maintenance_room_led_tracking;
create trigger maintenance_room_led_tracking_audit
before insert or update on public.maintenance_room_led_tracking
for each row execute function public.set_maintenance_room_led_tracking_audit();

revoke all on function public.set_maintenance_room_led_tracking_audit() from public, anon;
grant execute on function public.set_maintenance_room_led_tracking_audit() to authenticated;
