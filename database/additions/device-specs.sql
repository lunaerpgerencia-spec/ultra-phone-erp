create table public.device_specs (
 id uuid primary key,
 store_id uuid not null,
 barcode text not null default '' check(length(barcode)<=64 and (barcode='' or barcode ~ '^[A-Za-z0-9._/-]+$')),
 specs jsonb not null default '{}'::jsonb check(jsonb_typeof(specs)='object' and octet_length(specs::text)<=12000),
 foreign key(store_id,id) references public.devices(store_id,id) on delete cascade
);
create index device_specs_barcode_idx on public.device_specs(store_id,barcode) where barcode<>'';
alter table public.device_specs enable row level security;
grant select,insert,update on public.device_specs to authenticated;
create policy device_specs_read on public.device_specs for select to authenticated using(public.can_access(store_id));
create policy device_specs_insert on public.device_specs for insert to authenticated with check(public.can_access(store_id,array['admin','gerente']));
create policy device_specs_update on public.device_specs for update to authenticated using(public.can_access(store_id,array['admin','gerente'])) with check(public.can_access(store_id,array['admin','gerente']));
create function public.save_device_details(p_id uuid,p_store uuid,p_device jsonb,p_specs jsonb,p_barcode text,p_seller text,p_paid boolean,p_due date,p_method text,p_request uuid) returns uuid language plpgsql security invoker set search_path='' as $$
declare d uuid;
begin
 if not public.can_access(p_store,array['admin','gerente']) then raise exception 'Sem permissão para cadastrar aparelhos.';end if;
 if p_id is null then
  d:=public.intake_device(p_store,p_device,p_seller,p_paid,p_due,p_method,p_request);
 else
  if not exists(select 1 from public.devices where id=p_id and store_id=p_store) then raise exception 'Aparelho não encontrado nesta loja.';end if;
  perform public.edit_device(p_id,p_device);d:=p_id;
 end if;
 insert into public.device_specs(id,store_id,barcode,specs) values(d,p_store,trim(coalesce(p_barcode,'')),coalesce(p_specs,'{}'::jsonb)) on conflict(id) do update set barcode=excluded.barcode,specs=excluded.specs;
 return d;
end $$;
revoke all on function public.save_device_details(uuid,uuid,jsonb,jsonb,text,text,boolean,date,text,uuid) from public,anon;
grant execute on function public.save_device_details(uuid,uuid,jsonb,jsonb,text,text,boolean,date,text,uuid) to authenticated;
create trigger audit_changes after insert or update on public.device_specs for each row execute function ultra_private.record_audit();
