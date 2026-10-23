-- Register several physical units of the same model atomically, keeping existing inventory and accounting behavior.
create function public.save_device_batch(p_store uuid,p_device jsonb,p_specs jsonb,p_barcode text,p_seller text,p_paid boolean,p_due date,p_method text,p_request uuid,p_units jsonb)
returns uuid[] language plpgsql security invoker set search_path='' as $$
declare unit jsonb; d uuid; ids uuid[]:=array[]::uuid[]; req uuid; payload jsonb;
begin
 if not public.can_access(p_store,array['admin','gerente']) then raise exception 'Sem permissão para cadastrar aparelhos.';end if;
 if p_request is null then raise exception 'Solicitação inválida.';end if;
 if p_units is null or jsonb_typeof(p_units)<>'array' or jsonb_array_length(p_units)<1 or jsonb_array_length(p_units)>50 then raise exception 'Cadastre de 1 a 50 unidades por vez.';end if;
 if exists(select 1 from jsonb_array_elements(p_units) u where jsonb_typeof(u)<>'object' or nullif(u->>'request','') is null or jsonb_typeof(u->'device') is distinct from 'object') then raise exception 'Preencha os dados de todas as unidades.';end if;
 if (select count(distinct u->>'request') from jsonb_array_elements(p_units) u)<>jsonb_array_length(p_units) then raise exception 'Unidade repetida na solicitação.';end if;
 if exists(select 1 from jsonb_array_elements(p_units) u cross join lateral jsonb_object_keys(u->'device') k where k not in ('imei','imei2','serial','storage','color','condition','battery','purchase_cents','repair_cents','price_cents','credit_price_cents','book_price_cents')) then raise exception 'Todas as unidades devem compartilhar a marca e o modelo informados.';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request::text,0));
 for unit in select value from jsonb_array_elements(p_units) loop
  req:=(unit->>'request')::uuid;
  select device_id into d from public.purchases where id=req and store_id=p_store;
  if d is null then
   payload:=p_device||(unit->'device');
   d:=public.save_device_details(null,p_store,payload,p_specs,coalesce(nullif(unit->>'barcode',''),p_barcode),p_seller,p_paid,p_due,p_method,req);
  end if;
  ids:=array_append(ids,d);
 end loop;
 return ids;
end $$;
revoke all on function public.save_device_batch(uuid,jsonb,jsonb,text,text,boolean,date,text,uuid,jsonb) from public,anon;
grant execute on function public.save_device_batch(uuid,jsonb,jsonb,text,text,boolean,date,text,uuid,jsonb) to authenticated;
