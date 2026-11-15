-- Preventivos de fancoils por habitación. Independiente del seguimiento LED.
-- Migración nueva: no modifica migraciones históricas ni el PAM.
create table if not exists public.maintenance_room_fancoil_tracking (
  hotel_id uuid not null references public.hotels(id) on delete cascade,
  room_code text not null,
  status text not null default 'PENDING'
    constraint maintenance_room_fancoil_tracking_status_check
      check (status in ('PENDING','IN_PROGRESS','DONE')),
  completed_at date,
  technician text not null default '',
  notes text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maintenance_room_fancoil_tracking_room_code_format
    check (room_code ~ '^[0-9]{1,2}-[0-9]{2}$'),
  primary key (hotel_id, room_code)
);
create index if not exists maintenance_room_fancoil_tracking_hotel_status_idx
  on public.maintenance_room_fancoil_tracking(hotel_id,status);
alter table public.maintenance_room_fancoil_tracking enable row level security;
revoke all on public.maintenance_room_fancoil_tracking from anon, authenticated;
grant select,insert,update on public.maintenance_room_fancoil_tracking to authenticated;

do $fancoil_policy$ begin
  if not exists (select 1 from pg_catalog.pg_policies where schemaname='public' and tablename='maintenance_room_fancoil_tracking' and policyname='maintenance_room_fancoil_tracking_select') then
    create policy maintenance_room_fancoil_tracking_select
 on public.maintenance_room_fancoil_tracking for select to authenticated
 using (public.has_hotel_permission(hotel_id,'maintenance.view'));
  end if;
end $fancoil_policy$;
do $fancoil_policy$ begin
  if not exists (select 1 from pg_catalog.pg_policies where schemaname='public' and tablename='maintenance_room_fancoil_tracking' and policyname='maintenance_room_fancoil_tracking_insert') then
    create policy maintenance_room_fancoil_tracking_insert
 on public.maintenance_room_fancoil_tracking for insert to authenticated
 with check (
   public.has_hotel_permission(hotel_id,'maintenance.create')
   or public.has_hotel_permission(hotel_id,'maintenance.update')
 );
  end if;
end $fancoil_policy$;
do $fancoil_policy$ begin
  if not exists (select 1 from pg_catalog.pg_policies where schemaname='public' and tablename='maintenance_room_fancoil_tracking' and policyname='maintenance_room_fancoil_tracking_update') then
    create policy maintenance_room_fancoil_tracking_update
 on public.maintenance_room_fancoil_tracking for update to authenticated
 using (public.has_hotel_permission(hotel_id,'maintenance.update'))
 with check (public.has_hotel_permission(hotel_id,'maintenance.update'));
  end if;
end $fancoil_policy$;

comment on table public.maintenance_room_fancoil_tracking is
 'Seguimiento independiente de preventivos de fancoils por habitación y centro, con los mismos estados del módulo LED de armario.';
