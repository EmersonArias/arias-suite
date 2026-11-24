-- Emerson confirmed the goods lift is inventory ID 4. Keep all six IDs and PAM links.
do $$
declare target public.apparatus_registry;
begin
 if not exists(select 1 from public.apparatus_registry where hotel_id='9e2e3d56-25d7-41a5-8dd6-df6858e735bd') then return; end if;
 select * into strict target from public.apparatus_registry
 where hotel_id='9e2e3d56-25d7-41a5-8dd6-df6858e735bd' and source_id=4 for update;
 if target.name not in ('ASCENSOR DE SERVICIO C','MONTACARGAS') then
  raise exception 'El activo 4 ha cambiado. Revisar antes de renombrar el montacargas.';
 end if;
 update public.apparatus_registry set name='MONTACARGAS'
 where id=target.id and name='ASCENSOR DE SERVICIO C';
end $$;
