-- Customer contact and identity fields are optional for store-financed sales.
create or replace function public.make_sale_v3(p_store uuid,p_customer uuid,p_devices uuid[],p_discount bigint,p_entry bigint,p_count integer,p_first_due date,p_method text,p_notes text,p_request uuid,p_interest numeric,p_entry_method text) returns uuid language plpgsql security invoker set search_path='' as $$
declare buyer public.customers;sid uuid;
begin
 if not public.can_access(p_store,array['admin','gerente','vendedor']) then raise exception 'Sem permissão para vender.';end if;
 if exists(select 1 from public.sales where id=p_request and store_id=p_store) then return p_request;end if;
 select * into buyer from public.customers where id=p_customer and store_id=p_store for share;
 if buyer.id is null or not buyer.active then raise exception 'Selecione um cliente ativo.';end if;
 sid:=public.make_sale_v2(p_store,p_customer,p_devices,p_discount,p_entry,p_count,p_first_due,p_method,p_notes,p_request,p_interest,p_entry_method);
 update public.sales set customer_snapshot=jsonb_build_object('name',buyer.name,'document',buyer.document,'rg',buyer.rg,'phone',buyer.phone,'email',buyer.email,'address',buyer.address) where id=sid and customer_snapshot is null;
 return sid;
end $$;
revoke all on function public.make_sale_v3(uuid,uuid,uuid[],bigint,bigint,int,date,text,text,uuid,numeric,text) from public,anon;
grant execute on function public.make_sale_v3(uuid,uuid,uuid[],bigint,bigint,int,date,text,text,uuid,numeric,text) to authenticated;
