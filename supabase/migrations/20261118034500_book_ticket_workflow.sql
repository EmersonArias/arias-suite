begin;
-- Each binding pins a specific hotel, plan and inventory asset. If a plan changes equipment,
-- it ceases to match until the mapping is reviewed.
create table public.technical_book_plan_bindings (
 hotel_id uuid not null references public.hotels(id),
 book_id text not null,
 plan_id uuid not null references public.maintenance_plans(id),
 equipment_id uuid not null references public.apparatus_registry(id),
 primary key(hotel_id,book_id,plan_id)
);
alter table public.technical_book_plan_bindings enable row level security;
revoke all on public.technical_book_plan_bindings from public,anon,authenticated;
grant select on public.technical_book_plan_bindings to authenticated;
create policy bindings_read on public.technical_book_plan_bindings for select to authenticated
using (public.has_hotel_permission(hotel_id,'maintenance.view'));

with source_rows(row_number,book,ids) as (values
 (7,'pool',array[334]), (8,'spa',array[335]),
 (10,'bombas',array[145,181,182,183,184,185]),
 (11,'climatizadores',array[22,25,34,60,61,62,75,76,77,78,79,97,98,99,100,101,102,103,104,105,106,107,134,199,200,201,202,203,269,276,277]),
 (13,'cuadros-bt',array[16,192,222,223,316,324,325]),
 (15,'luces-emergencia',array[11]), (16,'puertas-cortafuegos',array[9]),
 (18,'calibraciones',array[29,35,36,37,38,39,40,43,46,56,57,63,64,65,71,278,288]))
insert into public.technical_book_plan_bindings
select distinct p.hotel_id,s.book,p.id,a.id from public.maintenance_plans p
join public.apparatus_registry a on a.id=p.apparatus_registry_id and a.hotel_id=p.hotel_id
join public.pam_maintenance_plan_links l on l.maintenance_plan_id=p.id and l.source_apparatus_id=a.source_id
join public.pam_source_groups g on g.id=l.source_group_id and g.hotel_id=p.hotel_id
join source_rows s on s.row_number=g.source_row and a.source_id=any(s.ids)
where p.hotel_id='9e2e3d56-25d7-41a5-8dd6-df6858e735bd' and p.active and l.plan_year=2026;

create view public.technical_book_due_tickets with (security_invoker=true) as
 select b.hotel_id,b.book_id,w.id ticket_id,w.ot_number,b.plan_id,b.equipment_id,
 a.name equipment,a.location,p.name plan_name
 from public.technical_book_plan_bindings b
 join public.maintenance_plans p on p.id=b.plan_id and p.hotel_id=b.hotel_id and p.active and p.apparatus_registry_id=b.equipment_id
 join public.apparatus_registry a on a.id=b.equipment_id and a.hotel_id=b.hotel_id and a.active
 join public.maintenance_work_orders w on w.hotel_id=b.hotel_id and w.maintenance_plan_id=b.plan_id
 join public.maintenance_exercise_start x on x.hotel_id=b.hotel_id and x.started_at is not null
 where w.work_type='PREVENTIVE' and w.status in ('PENDING','IN_MANAGEMENT','IN_PROGRESS')
 and w.scheduled_date between timezone('Europe/Madrid',x.started_at)::date and timezone('Europe/Madrid',now())::date
 and p.next_due_date<=timezone('Europe/Madrid',now())::date;
revoke all on public.technical_book_due_tickets from public,anon,authenticated;
grant select on public.technical_book_due_tickets to authenticated;

create function public.stamp_book_revision() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare operator_name text; ticket public.technical_book_due_tickets; local_time timestamp := timezone('Europe/Madrid',now());
begin
 if new.payload->>'supersedes' is not null then raise exception 'Los registros finalizados se conservan sin editar.'; end if;
 select coalesce(nullif(trim(full_name),''),nullif(login_identifier,''),id::text) into strict operator_name from public.profiles where id=auth.uid();
 new.payload := (new.payload - 'pamPlanId' - 'pamEquipmentId' - 'pamTicketNumber') ||
 jsonb_build_object('technician',operator_name,'date',to_char(local_time,'YYYY-MM-DD'),'time',to_char(local_time,'HH24:MI'));
 if new.payload->>'pamTicketId' is not null then
   select * into ticket from public.technical_book_due_tickets where ticket_id=(new.payload->>'pamTicketId')::uuid and hotel_id=new.hotel_id and book_id=new.book_id;
   if not found then raise exception 'Ticket no disponible para este libro, hotel o fecha.'; end if;
   new.payload := new.payload || jsonb_build_object('pamTicketNumber',ticket.ot_number,'pamPlanId',ticket.plan_id,'pamEquipmentId',ticket.equipment_id);
 end if;
 return new;
end $$;
revoke all on function public.stamp_book_revision() from public,anon,authenticated;
create trigger book_record_stamp before insert or update on public.technical_book_records for each row execute function public.stamp_book_revision();

create function public.complete_book_ticket() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare w public.maintenance_work_orders; outcome text := new.payload->>'pamOutcome';
begin
 select * into w from public.maintenance_work_orders where id=(new.payload->>'pamTicketId')::uuid for update;
 if not found or w.hotel_id<>new.hotel_id or w.maintenance_plan_id is distinct from (new.payload->>'pamPlanId')::uuid or
    w.status not in ('PENDING','IN_PROGRESS','IN_MANAGEMENT') then raise exception 'El ticket ha cambiado. Recarga la ficha.'; end if;
 if outcome is null or outcome not in ('COMPLETED','COMPLETED_WITH_ISSUES') then raise exception 'Indica el resultado del ticket.'; end if;
 if not exists(select 1 from jsonb_each(new.payload->'answers') a where a.value->>'value' not in ('','NA')) then raise exception 'Faltan controles realizados.'; end if;
 select * into w from public.complete_maintenance_work_order(w.id,outcome,
   concat_ws(' · ',new.payload->'template'->>'code',new.id::text,nullif(new.payload->>'observations','')));
 if w.status is distinct from 'COMPLETED' then raise exception 'No se ha podido completar el ticket.'; end if;
 return null;
end $$;
revoke all on function public.complete_book_ticket() from public,anon,authenticated;
create trigger book_record_complete_ticket after insert or update on public.technical_book_records
 for each row when (new.payload->>'status'='FINAL' and new.payload->>'pamTicketId' is not null) execute function public.complete_book_ticket();
create unique index book_one_final_per_ticket on public.technical_book_records((payload->>'pamTicketId'))
 where payload->>'status'='FINAL' and payload->>'pamTicketId' is not null;
commit;
