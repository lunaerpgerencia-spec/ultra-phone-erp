alter table public.sales add column installment_period text not null default 'Mensal' check(installment_period in ('Mensal','Semanal','Quinzenal'));
create function public.make_sale_schedule(p_store uuid,p_customer uuid,p_devices uuid[],p_discount bigint,p_entry bigint,p_count int,p_first_due date,p_method text,p_notes text,p_request uuid,p_interest numeric,p_entry_method text,p_period text) returns uuid language plpgsql security invoker set search_path='' as $$
declare sid uuid;period text;
begin
 if not public.can_access(p_store,array['admin','gerente','vendedor']) then raise exception 'Sem permissão para vender.';end if;
 if p_period is null or p_period not in ('Mensal','Semanal','Quinzenal') then raise exception 'Periodicidade inválida.';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request::text,0));
 if exists(select 1 from public.sales where id=p_request and store_id=p_store) then return p_request;end if;
 period:=case when p_method='Carnê' then p_period else 'Mensal' end;
 sid:=public.make_sale_v3(p_store,p_customer,p_devices,p_discount,p_entry,p_count,p_first_due,p_method,p_notes,p_request,p_interest,p_entry_method);
 perform set_config('ultra.transaction','yes',true);
 update public.sales set installment_period=period where id=sid;
 if period<>'Mensal' then update public.installments set due_date=p_first_due+(number-1)*case when period='Semanal' then 7 else 15 end where sale_id=sid;end if;
 return sid;
end $$;
revoke all on function public.make_sale_schedule(uuid,uuid,uuid[],bigint,bigint,int,date,text,text,uuid,numeric,text,text) from public,anon;
grant execute on function public.make_sale_schedule(uuid,uuid,uuid[],bigint,bigint,int,date,text,text,uuid,numeric,text,text) to authenticated;
create function public.revise_installments_period(p_sale uuid,p_plan jsonb,p_expected jsonb,p_reason text,p_period text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_period is null or p_period not in ('Mensal','Semanal','Quinzenal') then raise exception 'Periodicidade inválida.';end if;
 perform public.revise_installments(p_sale,p_plan,p_expected,p_reason);
 update public.sales set installment_period=p_period where id=p_sale;
end $$;
revoke all on function public.revise_installments_period(uuid,jsonb,jsonb,text,text) from public,anon;
grant execute on function public.revise_installments_period(uuid,jsonb,jsonb,text,text) to authenticated;
