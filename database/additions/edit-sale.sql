-- Atomic sale corrections. Existing receipts and ledger entries remain append-only.
alter table public.sales add column if not exists edit_version bigint not null default 0;
alter table public.sales add column if not exists last_edit_request uuid;
create policy sale_item_correction on public.sale_items for update to authenticated
 using(public.can_access(store_id,array['admin','gerente','financeiro']) and current_setting('ultra.transaction',true)='yes')
 with check(public.can_access(store_id,array['admin','gerente','financeiro']) and current_setting('ultra.transaction',true)='yes');
grant update(price_cents) on public.sale_items to authenticated;

create function public.sale_edit_state(p_sale uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('sale',jsonb_build_object(
 'customer_id',s.customer_id,'subtotal_cents',s.subtotal_cents,'discount_cents',s.discount_cents,'status',s.status,'notes',s.notes,
 'payment_method',s.payment_method,'payment_count',s.payment_count,'interest_percent',s.interest_percent,'interest_cents',s.interest_cents,
 'entry_method',s.entry_method,'customer_snapshot',s.customer_snapshot,'installment_period',s.installment_period,'edit_version',s.edit_version),
 'installments',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'amount_cents',i.amount_cents,'due_date',i.due_date,'canceled',i.canceled,'number',i.number) order by i.id) from public.installments i where i.sale_id=s.id),'[]'::jsonb),
 'receipts',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'amount_cents',r.amount_cents,'installment_id',r.installment_id,'reversal_of',r.reversal_of,'method',r.method) order by r.id) from public.receipts r where r.sale_id=s.id),'[]'::jsonb))
 from public.sales s where s.id=p_sale;
$$;
revoke all on function public.sale_edit_state(uuid) from public,anon;
grant execute on function public.sale_edit_state(uuid) to authenticated;

create function public.edit_sale(p_sale uuid,p_customer uuid,p_total bigint,p_entry bigint,p_method text,p_entry_method text,p_count int,p_period text,p_notes text,p_plan jsonb,p_expected jsonb,p_reason text,p_request uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare s public.sales; buyer public.customers; x public.installments; r public.receipts; v jsonb; old_entry bigint; plan_total bigint; paid bigint; rid uuid; next_number int; item record; weight bigint; allocation bigint; assigned bigint:=0; left_items int;
begin
 perform set_config('ultra.transaction','yes',true);
 select * into s from public.sales where id=p_sale for update;
 if s.id is null or not public.can_access(s.store_id,array['admin','gerente','financeiro']) then raise exception 'Sem permissão para editar esta venda.';end if;
 if p_request is null then raise exception 'Solicitação inválida.';end if;
 if s.last_edit_request=p_request then return;end if;
 if s.status<>'Ativa' then raise exception 'A venda está cancelada.';end if;
 if p_reason is null or length(trim(p_reason))<5 then raise exception 'Informe o motivo da alteração (mínimo 5 letras).';end if;
 perform 1 from public.installments where sale_id=s.id order by id for update;
 if public.sale_edit_state(s.id) is distinct from p_expected then raise exception 'A venda ou os pagamentos mudaram. Feche, atualize e abra a edição novamente.';end if;
 if p_total is null or p_total<1 or p_total>100000000000 or p_entry is null or p_entry<0 or p_entry>p_total then raise exception 'Confira o total e o valor recebido na entrada.';end if;
 if p_method is null or p_method not in ('PIX','Dinheiro','Débito','Crédito','Carnê','Boleto') or p_entry_method is null or p_entry_method not in ('PIX','Dinheiro','Débito','Crédito','Transferência') then raise exception 'Forma de pagamento inválida.';end if;
 if p_count is null or p_count<1 or p_count>(case when p_method='Crédito' then 12 else 36 end) then raise exception 'Quantidade de parcelas inválida.';end if;
 if p_period is null or p_period not in ('Mensal','Semanal','Quinzenal') then raise exception 'Frequência inválida.';end if;
 select * into buyer from public.customers where id=p_customer and store_id=s.store_id for share;
 if buyer.id is null or (not buyer.active and buyer.id<>s.customer_id) then raise exception 'Selecione um cliente da loja.';end if;
 if p_plan is null or jsonb_typeof(p_plan)<>'array' or jsonb_array_length(p_plan)>36 then raise exception 'Plano inválido (máximo 36 parcelas).';end if;
 if exists(select 1 from jsonb_array_elements(p_plan) a where a->>'amount_cents' is null or (a->>'amount_cents')::bigint<=0 or nullif(a->>'due_date','') is null) then raise exception 'Preencha valor e vencimento das parcelas.';end if;
 if (select count(*) from jsonb_array_elements(p_plan) a where nullif(a->>'id','') is not null)<>(select count(distinct a->>'id') from jsonb_array_elements(p_plan) a where nullif(a->>'id','') is not null) then raise exception 'Parcela repetida.';end if;
 select coalesce(sum((a->>'amount_cents')::bigint),0) into plan_total from jsonb_array_elements(p_plan) a;
 if plan_total+p_entry<>p_total then raise exception 'A entrada mais as parcelas deve ser igual ao total da venda.';end if;
 for v in select value from jsonb_array_elements(p_plan) loop
  perform (v->>'due_date')::date;
  paid:=0;
  if nullif(v->>'id','') is not null then
   select * into x from public.installments where id=(v->>'id')::uuid and sale_id=s.id and not canceled;
   if x.id is null then raise exception 'Parcela inválida para esta venda.';end if;
   select coalesce(sum(amount_cents),0) into paid from public.receipts where installment_id=x.id;
   if (v->>'amount_cents')::bigint<paid then raise exception 'A parcela não pode ser menor que o valor já recebido.';end if;
  end if;
  if p_method not in ('Carnê','Boleto') and (v->>'amount_cents')::bigint<>paid then raise exception 'Pagamento integral não pode manter parcelas em aberto. Confira o valor recebido.';end if;
 end loop;
 for x in select * from public.installments where sale_id=s.id and not canceled loop
  if not exists(select 1 from jsonb_array_elements(p_plan) a where a->>'id'=x.id::text) and (select coalesce(sum(amount_cents),0) from public.receipts where installment_id=x.id)<>0 then raise exception 'Mantenha as parcelas que já possuem valores recebidos.';end if;
 end loop;
 perform set_config('ultra.transaction','yes',true);
 select coalesce(sum(amount_cents),0) into old_entry from public.receipts where sale_id=s.id and installment_id is null;
 -- Correct only the entry. Installment payments are never rewritten.
 if old_entry<>p_entry or (p_entry>0 and exists(select 1 from public.receipts a where a.sale_id=s.id and a.installment_id is null and a.amount_cents>0 and a.method<>p_entry_method and not exists(select 1 from public.receipts b where b.reversal_of=a.id))) then
  for r in select * from public.receipts a where sale_id=s.id and installment_id is null and amount_cents>0 and not exists(select 1 from public.receipts b where b.reversal_of=a.id) loop
   insert into public.receipts(store_id,sale_id,amount_cents,method,reversal_of) values(s.store_id,s.id,-r.amount_cents,'Estorno',r.id) returning id into rid;
   insert into public.ledger(store_id,amount_cents,description,receipt_id,method) values(s.store_id,-r.amount_cents,'Correção de entrada: '||trim(p_reason),rid,'Estorno');
  end loop;
  if p_entry>0 then
   insert into public.receipts(store_id,sale_id,amount_cents,method) values(s.store_id,s.id,p_entry,p_entry_method) returning id into rid;
   insert into public.ledger(store_id,amount_cents,description,receipt_id,method) values(s.store_id,p_entry,'Entrada corrigida: '||trim(p_reason),rid,p_entry_method);
  end if;
 end if;
 update public.installments i set canceled=true where sale_id=s.id and not canceled and not exists(select 1 from jsonb_array_elements(p_plan) a where a->>'id'=i.id::text);
 select coalesce(max(number),0) into next_number from public.installments where sale_id=s.id;
 for v in select value from jsonb_array_elements(p_plan) loop
  if nullif(v->>'id','') is not null then
   update public.installments set amount_cents=(v->>'amount_cents')::bigint,due_date=(v->>'due_date')::date where id=(v->>'id')::uuid and sale_id=s.id;
  else
   next_number:=next_number+1;
   insert into public.installments(store_id,sale_id,number,due_date,amount_cents) values(s.store_id,s.id,next_number,(v->>'due_date')::date,(v->>'amount_cents')::bigint);
  end if;
 end loop;
 if p_total<>s.total_cents then
  select sum(price_cents),count(*) into weight,left_items from public.sale_items where sale_id=s.id;
  if left_items<1 or p_total<left_items then raise exception 'Total insuficiente para os aparelhos da venda.';end if;
  -- Proportional allocation with exact cents and at least one cent per item.
  for item in select id,price_cents from public.sale_items where sale_id=s.id order by id loop
   allocation:=case when left_items=1 then p_total-assigned else greatest(1,least(p_total-assigned-left_items+1,floor(p_total::numeric*item.price_cents/weight)::bigint)) end;
   update public.sale_items set price_cents=allocation where id=item.id;
   assigned:=assigned+allocation;left_items:=left_items-1;
  end loop;
 end if;
 update public.sales set customer_id=p_customer,
 customer_snapshot=case when customer_id=p_customer then customer_snapshot else jsonb_build_object('name',buyer.name,'document',buyer.document,'rg',buyer.rg,'phone',buyer.phone,'email',buyer.email,'address',buyer.address) end,
 subtotal_cents=case when p_total<>s.total_cents then p_total else subtotal_cents end,
 discount_cents=case when p_total<>s.total_cents then 0 else discount_cents end,
 interest_cents=case when p_total<>s.total_cents then 0 else interest_cents end,
 interest_percent=case when p_total<>s.total_cents then 0 else interest_percent end,
 payment_method=p_method,entry_method=p_entry_method,payment_count=case when p_method='Crédito' then p_count when p_method in ('Carnê','Boleto') then greatest(1,jsonb_array_length(p_plan)) else 1 end,
 installment_period=p_period,notes=coalesce(p_notes,'')||E'\nEdição da venda: '||trim(p_reason),edit_version=edit_version+1,last_edit_request=p_request where id=s.id;
end $$;
revoke all on function public.edit_sale(uuid,uuid,bigint,bigint,text,text,int,text,text,jsonb,jsonb,text,uuid) from public,anon;
grant execute on function public.edit_sale(uuid,uuid,bigint,bigint,text,text,int,text,text,jsonb,jsonb,text,uuid) to authenticated;
