-- Persist LED de armario progress per hotel and room.
-- Access is restricted by the same hotel-scoped maintenance permissions used elsewhere.

create table if not exists public.maintenance_room_led_tracking (
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  room_code text not null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'IN_PROGRESS', 'DONE')),
  completed_at date,
  technician text not null default '',
  notes text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (hotel_id, room_code),
  constraint maintenance_room_led_tracking_room_code_format
    check (room_code ~ '^[0-9]{1,2}-[0-9]{2}$')
);

create index if not exists maintenance_room_led_tracking_hotel_status_idx
  on public.maintenance_room_led_tracking (hotel_id, status);

alter table public.maintenance_room_led_tracking enable row level security;

drop policy if exists maintenance_room_led_tracking_select on public.maintenance_room_led_tracking;
create policy maintenance_room_led_tracking_select
  on public.maintenance_room_led_tracking for select to authenticated
  using (has_hotel_permission(hotel_id, 'maintenance.view'));

drop policy if exists maintenance_room_led_tracking_insert on public.maintenance_room_led_tracking;
create policy maintenance_room_led_tracking_insert
  on public.maintenance_room_led_tracking for insert to authenticated
  with check (
    has_hotel_permission(hotel_id, 'maintenance.create')
    or has_hotel_permission(hotel_id, 'maintenance.update')
  );

drop policy if exists maintenance_room_led_tracking_update on public.maintenance_room_led_tracking;
create policy maintenance_room_led_tracking_update
  on public.maintenance_room_led_tracking for update to authenticated
  using (has_hotel_permission(hotel_id, 'maintenance.update'))
  with check (has_hotel_permission(hotel_id, 'maintenance.update'));

drop policy if exists maintenance_room_led_tracking_delete on public.maintenance_room_led_tracking;
create policy maintenance_room_led_tracking_delete
  on public.maintenance_room_led_tracking for delete to authenticated
  using (has_hotel_permission(hotel_id, 'maintenance.update'));

revoke all on public.maintenance_room_led_tracking from anon;
grant select, insert, update, delete on public.maintenance_room_led_tracking to authenticated;
