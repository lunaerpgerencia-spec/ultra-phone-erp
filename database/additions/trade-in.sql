-- Record an accepted device as non-cash consideration, separately from receipts and cash ledger.
alter table public.sales add column trade_device text not null default '' check(length(trade_device)<=250);
alter table public.sales add column trade_imei text not null default '' check(trade_imei='' or public.check_imei(trade_imei));
alter table public.sales add column trade_value_cents bigint not null default 0 check(trade_value_cents>=0 and trade_value_cents<=total_cents);
CREATE OR REPLACE FUNCTION public.make_sale_exchange(p_store uuid, p_customer uuid, p_devices uuid[], p_discount bigint, p_entry bigint, p_count integer, p_first_due date, p_method text, p_notes text, p_request uuid, p_interest numeric, p_entry_method text, p_period text, p_trade_device text, p_trade_imei text, p_trade_value bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare d public.devices; subtotal bigint:=0; sid uuid:=p_request; remaining bigint; i int; base bigint; extra bigint; due date; r uuid; original bigint; fee bigint; received bigint; price bigint; begin if not public.can_access(p_store,array['admin','gerente','vendedor']) then raise exception 'Sem permissão para vender.'; end if; if p_method is null or p_method not in ('PIX','Dinheiro','Débito','Crédito','Boleto','Carnê') or p_interest is null or p_interest<0 or p_interest>100 or (p_method<>'Crédito' and p_interest<>0) then raise exception 'Forma de pagamento ou juros inválidos.'; end if; if p_method='Crédito' and (p_count is null or p_count<1 or p_count>12) then raise exception 'Crédito permite de 1 a 12 parcelas.';end if; perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request::text,0)); perform set_config('ultra.transaction','yes',true); if exists(select 1 from public.sales where id=sid and store_id=p_store) then return sid; end if; if p_request is null then raise exception 'Solicitação inválida.';end if;
if p_period is null or p_period not in ('Mensal','Semanal','Quinzenal') then raise exception 'Frequência inválida.';end if;
if p_trade_value is null or p_trade_value<0 then raise exception 'Valor da troca inválido.';end if;
if p_trade_value=0 then return public.make_sale_schedule(p_store,p_customer,p_devices,p_discount,p_entry,p_count,p_first_due,p_method,p_notes,p_request,p_interest,p_entry_method,p_period);end if;
if length(trim(coalesce(p_trade_device,'')))<2 or length(p_trade_device)>250 then raise exception 'Informe qual aparelho foi recebido na troca.';end if;
if coalesce(p_trade_imei,'')<>'' and not public.check_imei(p_trade_imei) then raise exception 'IMEI do aparelho recebido inválido.';end if;
if coalesce(p_trade_imei,'')<>'' and exists(select 1 from public.devices where store_id=p_store and id=any(p_devices) and (imei=p_trade_imei or imei2=p_trade_imei)) then raise exception 'O aparelho recebido não pode ser o mesmo aparelho vendido.';end if;
if p_devices is null or cardinality(p_devices)<1 or cardinality(p_devices)>50 or cardinality(p_devices)<>(select count(distinct x) from unnest(p_devices) x) then raise exception 'Selecione aparelhos distintos.'; end if;
if not exists(select 1 from public.customers where id=p_customer and store_id=p_store and active) then raise exception 'Cliente inválido.'; end if;
for d in select * from public.devices where store_id=p_store and id=any(p_devices) order by id for update loop if d.status<>'Disponível' then raise exception 'Aparelho indisponível: %',d.model; end if; subtotal:=subtotal+case when p_method='Crédito' then d.credit_price_cents when p_method='Carnê' then d.book_price_cents else d.price_cents end; end loop;
if (select count(*) from public.devices where store_id=p_store and id=any(p_devices))<>cardinality(p_devices) then raise exception 'Aparelho não encontrado.'; end if;
if p_discount is null or p_discount<0 or p_discount>=subtotal or p_entry is null or p_entry<0 or p_entry>subtotal-p_discount-p_trade_value or p_trade_value>subtotal-p_discount then raise exception 'Valores inválidos.'; end if;
original:=subtotal; fee:=round((subtotal-p_discount-p_trade_value)*p_interest/100)::bigint;subtotal:=subtotal+fee;received:=case when p_method in ('Carnê','Boleto') then p_entry else subtotal-p_discount-p_trade_value end;remaining:=subtotal-p_discount-received-p_trade_value; if remaining>0 and (p_count is null or p_count<1 or p_count>36 or remaining<p_count or p_first_due is null) then raise exception 'Parcelamento inválido.'; end if; if received>0 and p_method in ('Carnê','Boleto') and (p_entry_method is null or p_entry_method not in ('PIX','Dinheiro','Débito','Crédito','Transferência')) then raise exception 'Forma de pagamento inválida.'; end if;
perform set_config('ultra.transaction','yes',true);
insert into public.sales(id,store_id,customer_id,subtotal_cents,discount_cents,notes,payment_method,payment_count,interest_percent,interest_cents,entry_method,installment_period,trade_device,trade_imei,trade_value_cents,customer_snapshot) values(sid,p_store,p_customer,subtotal,p_discount,coalesce(p_notes,''),p_method,case when p_method in ('Crédito','Carnê','Boleto') then p_count else 1 end,p_interest,fee,p_entry_method,case when p_method='Carnê' then p_period else 'Mensal' end,trim(p_trade_device),coalesce(p_trade_imei,''),p_trade_value,(select jsonb_build_object('name',name,'document',document,'rg',rg,'phone',phone,'email',email,'address',address) from public.customers where id=p_customer and store_id=p_store));
insert into public.sale_items(store_id,sale_id,device_id,label,imei,price_cents,cost_cents) select p_store,sid,id,brand||' '||model||' '||storage,imei,case when p_method='Crédito' then credit_price_cents when p_method='Carnê' then book_price_cents else price_cents end,purchase_cents+repair_cents from public.devices where store_id=p_store and id=any(p_devices);
update public.devices set status='Vendido' where store_id=p_store and id=any(p_devices);
if received>0 then insert into public.receipts(store_id,sale_id,amount_cents,method) values(p_store,sid,received,case when p_method in ('Carnê','Boleto') then p_entry_method else p_method end) returning id into r; insert into public.ledger(store_id,amount_cents,description,receipt_id,method) values(p_store,received,'Recebimento da venda',r,case when p_method in ('Carnê','Boleto') then p_entry_method else p_method end); end if;
if remaining>0 then base:=remaining/p_count; extra:=remaining%p_count; for i in 1..p_count loop due:=(date_trunc('month',p_first_due)+(i-1)*interval '1 month')::date; due:=due+(least(extract(day from p_first_due)::int,extract(day from (due+interval '1 month - 1 day'))::int)-1); if p_method='Carnê' and p_period<>'Mensal' then due:=p_first_due+(i-1)*case when p_period='Semanal' then 7 else 15 end;end if; insert into public.installments(store_id,sale_id,number,due_date,amount_cents) values(p_store,sid,i,due,base+case when i<=extra then 1 else 0 end); end loop; end if; return sid; end $function$;

revoke all on function public.make_sale_exchange(uuid,uuid,uuid[],bigint,bigint,int,date,text,text,uuid,numeric,text,text,text,text,bigint) from public,anon;
grant execute on function public.make_sale_exchange(uuid,uuid,uuid[],bigint,bigint,int,date,text,text,uuid,numeric,text,text,text,text,bigint) to authenticated;
create or replace function public.sale_edit_state(p_sale uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('sale',jsonb_build_object(
 'customer_id',s.customer_id,'subtotal_cents',s.subtotal_cents,'discount_cents',s.discount_cents,'status',s.status,'notes',s.notes,
 'payment_method',s.payment_method,'payment_count',s.payment_count,'interest_percent',s.interest_percent,'interest_cents',s.interest_cents,
 'entry_method',s.entry_method,'customer_snapshot',s.customer_snapshot,'installment_period',s.installment_period,'edit_version',s.edit_version,'trade_device',s.trade_device,'trade_imei',s.trade_imei,'trade_value_cents',s.trade_value_cents),
 'installments',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'amount_cents',i.amount_cents,'due_date',i.due_date,'canceled',i.canceled,'number',i.number) order by i.id) from public.installments i where i.sale_id=s.id),'[]'::jsonb),
 'receipts',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'amount_cents',r.amount_cents,'installment_id',r.installment_id,'reversal_of',r.reversal_of,'method',r.method) order by r.id) from public.receipts r where r.sale_id=s.id),'[]'::jsonb))
 from public.sales s where s.id=p_sale;
$$;

create function public.edit_sale_exchange(p_sale uuid,p_customer uuid,p_total bigint,p_entry bigint,p_method text,p_entry_method text,p_count int,p_period text,p_notes text,p_plan jsonb,p_expected jsonb,p_reason text,p_request uuid,p_trade_device text,p_trade_imei text,p_trade_value bigint)
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
 if p_trade_value is null or p_trade_value<0 or p_trade_value>p_total then raise exception 'Valor da troca inválido.';end if;
 if p_trade_value>0 and (length(trim(coalesce(p_trade_device,'')))<2 or length(p_trade_device)>250) then raise exception 'Informe qual aparelho foi recebido na troca.';end if;
 if coalesce(p_trade_imei,'')<>'' and not public.check_imei(p_trade_imei) then raise exception 'IMEI do aparelho recebido inválido.';end if;
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
 if plan_total+p_entry+p_trade_value<>p_total then raise exception 'A entrada em dinheiro, a troca e as parcelas devem somar o total da venda.';end if;
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
 trade_device=case when p_trade_value>0 then trim(p_trade_device) else '' end,trade_imei=case when p_trade_value>0 then coalesce(p_trade_imei,'') else '' end,trade_value_cents=p_trade_value,installment_period=p_period,notes=coalesce(p_notes,'')||E'\nEdição da venda: '||trim(p_reason),edit_version=edit_version+1,last_edit_request=p_request where id=s.id;
end $$;

revoke all on function public.edit_sale_exchange(uuid,uuid,bigint,bigint,text,text,int,text,text,jsonb,jsonb,text,uuid,text,text,bigint) from public,anon;
grant execute on function public.edit_sale_exchange(uuid,uuid,bigint,bigint,text,text,int,text,text,jsonb,jsonb,text,uuid,text,text,bigint) to authenticated;
create or replace function public.edit_sale(p_sale uuid,p_customer uuid,p_total bigint,p_entry bigint,p_method text,p_entry_method text,p_count int,p_period text,p_notes text,p_plan jsonb,p_expected jsonb,p_reason text,p_request uuid)
returns void language plpgsql security invoker set search_path='' as $$
declare s public.sales; buyer public.customers; x public.installments; r public.receipts; v jsonb; old_entry bigint; plan_total bigint; paid bigint; rid uuid; next_number int; item record; weight bigint; allocation bigint; assigned bigint:=0; left_items int;
begin
 perform set_config('ultra.transaction','yes',true);
 select * into s from public.sales where id=p_sale for update;
 if s.id is null or not public.can_access(s.store_id,array['admin','gerente','financeiro']) then raise exception 'Sem permissão para editar esta venda.';end if;
 if p_request is null then raise exception 'Solicitação inválida.';end if;
 if s.last_edit_request=p_request then return;end if;
 if s.trade_value_cents>0 then raise exception 'Atualize a página e use a edição com troca de aparelho.';end if;
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

