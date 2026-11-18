-- Preventivos de Fancoils por habitación. Módulo independiente del seguimiento LED.
create table if not exists public.maintenance_room_fancoil_tracking (
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  room_code text not null,
  status text not null default 'PENDING',
  completed_at date,
  technician text not null default '',
  notes text not null default '',
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maintenance_room_fancoil_tracking_pkey primary key (hotel_id,room_code),
  constraint maintenance_room_fancoil_tracking_status_check check (status in ('PENDING','IN_PROGRESS','DONE')),
  constraint maintenance_room_fancoil_tracking_room_check check (room_code ~ '^[0-9]{1,3}-[0-9]{2,3}$')
);
create index if not exists maintenance_room_fancoil_tracking_hotel_status_idx
  on public.maintenance_room_fancoil_tracking (hotel_id,status);

alter table public.maintenance_room_fancoil_tracking enable row level security;

revoke all on public.maintenance_room_fancoil_tracking from public,anon,authenticated;
grant select,insert,update,delete on public.maintenance_room_fancoil_tracking to authenticated;

create policy maintenance_room_fancoil_tracking_select on public.maintenance_room_fancoil_tracking
  for select to authenticated
  using (public.has_hotel_permission(hotel_id,'maintenance.view'));

create policy maintenance_room_fancoil_tracking_insert on public.maintenance_room_fancoil_tracking
  for insert to authenticated
  with check (public.has_hotel_permission(hotel_id,'maintenance.create') or
              public.has_hotel_permission(hotel_id,'maintenance.update'));

create policy maintenance_room_fancoil_tracking_update on public.maintenance_room_fancoil_tracking
  for update to authenticated
  using (public.has_hotel_permission(hotel_id,'maintenance.update'))
  with check (public.has_hotel_permission(hotel_id,'maintenance.update'));

create policy maintenance_room_fancoil_tracking_delete on public.maintenance_room_fancoil_tracking
  for delete to authenticated
  using (public.has_hotel_permission(hotel_id,'maintenance.update'));

comment on table public.maintenance_room_fancoil_tracking is
  'Control visual independiente de mantenimiento preventivo de fancoils por habitación, centro y empresa.';
