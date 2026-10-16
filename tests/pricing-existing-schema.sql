-- Snapshot of pricing functions already present in production; isolated tests only.
alter table devices add column credit_price_cents bigint,add column book_price_cents bigint;
alter table sales add column payment_method text,add column payment_count int default 1,add column interest_percent numeric default 0,add column interest_cents bigint default 0,add column entry_method text default 'PIX';
alter table sale_items add column warranty_days int default 0,add column warranty_snapshot boolean default false;
CREATE OR REPLACE FUNCTION public.intake_device(p_store uuid, p_device jsonb, p_seller text, p_paid boolean, p_due date, p_method text, p_request uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare d uuid; cost bigint; begin if not public.can_access(p_store,array['admin','gerente']) then raise exception 'Sem permissão para compras.'; end if; if exists(select 1 from public.purchases where id=p_request and store_id=p_store) then select device_id into d from public.purchases where id=p_request and store_id=p_store; return d; end if; if length(trim(p_seller))<2 or p_due is null then raise exception 'Informe vendedor e vencimento.'; end if; if p_paid and p_method not in ('PIX','Dinheiro','Débito','Crédito','Transferência') then raise exception 'Forma de pagamento inválida.'; end if; perform set_config('ultra.transaction','yes',true); cost:=(p_device->>'purchase_cents')::bigint;
insert into public.devices(store_id,brand,model,color,storage,imei,imei2,serial,condition,battery,purchase_cents,repair_cents,price_cents,origin,origin_invoice,inspection,warranty_days,credit_price_cents,book_price_cents) values(p_store,p_device->>'brand',p_device->>'model',coalesce(p_device->>'color',''),coalesce(p_device->>'storage',''),p_device->>'imei',nullif(p_device->>'imei2',''),coalesce(p_device->>'serial',''),p_device->>'condition',nullif(p_device->>'battery','')::int,cost,coalesce((p_device->>'repair_cents')::bigint,0),(p_device->>'price_cents')::bigint,p_seller,coalesce(p_device->>'origin_invoice',''),coalesce(p_device->>'inspection',''),coalesce((p_device->>'warranty_days')::int,90),coalesce((p_device->>'credit_price_cents')::bigint,(p_device->>'price_cents')::bigint),coalesce((p_device->>'book_price_cents')::bigint,(p_device->>'price_cents')::bigint)) returning id into d;
insert into public.purchases(id,store_id,device_id,seller,amount_cents,paid,due_date) values(p_request,p_store,d,p_seller,cost,p_paid,p_due);
if p_paid and cost>0 then insert into public.ledger(store_id,amount_cents,description,purchase_id,method) values(p_store,-cost,'Compra de aparelho',p_request,p_method); end if; return d; end $function$
;
CREATE OR REPLACE FUNCTION public.make_sale_v2(p_store uuid, p_customer uuid, p_devices uuid[], p_discount bigint, p_entry bigint, p_count integer, p_first_due date, p_method text, p_notes text, p_request uuid, p_interest numeric, p_entry_method text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare d public.devices; subtotal bigint:=0; sid uuid:=p_request; remaining bigint; i int; base bigint; extra bigint; due date; r uuid; original bigint; fee bigint; received bigint; price bigint; begin if not public.can_access(p_store,array['admin','gerente','vendedor']) then raise exception 'Sem permissão para vender.'; end if; if p_method is null or p_method not in ('PIX','Dinheiro','Débito','Crédito','Boleto','Carnê') or p_interest is null or p_interest<0 or p_interest>100 or (p_method<>'Crédito' and p_interest<>0) then raise exception 'Forma de pagamento ou juros inválidos.'; end if; if p_method='Crédito' and (p_count is null or p_count<1 or p_count>12) then raise exception 'Crédito permite de 1 a 12 parcelas.';end if; perform set_config('ultra.transaction','yes',true); if exists(select 1 from public.sales where id=sid and store_id=p_store) then return sid; end if; if p_devices is null or cardinality(p_devices)<1 or cardinality(p_devices)>50 or cardinality(p_devices)<>(select count(distinct x) from unnest(p_devices) x) then raise exception 'Selecione aparelhos distintos.'; end if;
if not exists(select 1 from public.customers where id=p_customer and store_id=p_store and active) then raise exception 'Cliente inválido.'; end if;
for d in select * from public.devices where store_id=p_store and id=any(p_devices) order by id for update loop if d.status<>'Disponível' then raise exception 'Aparelho indisponível: %',d.model; end if; subtotal:=subtotal+case when p_method='Crédito' then d.credit_price_cents when p_method='Carnê' then d.book_price_cents else d.price_cents end; end loop;
if (select count(*) from public.devices where store_id=p_store and id=any(p_devices))<>cardinality(p_devices) then raise exception 'Aparelho não encontrado.'; end if;
if p_discount is null or p_discount<0 or p_discount>=subtotal or p_entry is null or p_entry<0 or p_entry>subtotal-p_discount then raise exception 'Valores inválidos.'; end if;
original:=subtotal; fee:=round((subtotal-p_discount)*p_interest/100)::bigint;subtotal:=subtotal+fee;received:=case when p_method in ('Carnê','Boleto') then p_entry else subtotal-p_discount end;remaining:=subtotal-p_discount-received; if remaining>0 and (p_count is null or p_count<1 or p_count>36 or remaining<p_count or p_first_due is null) then raise exception 'Parcelamento inválido.'; end if; if received>0 and p_method in ('Carnê','Boleto') and (p_entry_method is null or p_entry_method not in ('PIX','Dinheiro','Débito','Crédito','Transferência')) then raise exception 'Forma de pagamento inválida.'; end if;
perform set_config('ultra.transaction','yes',true);
insert into public.sales(id,store_id,customer_id,subtotal_cents,discount_cents,notes,payment_method,payment_count,interest_percent,interest_cents,entry_method) values(sid,p_store,p_customer,subtotal,p_discount,coalesce(p_notes,''),p_method,case when p_method in ('Crédito','Carnê','Boleto') then p_count else 1 end,p_interest,fee,p_entry_method);
insert into public.sale_items(store_id,sale_id,device_id,label,imei,price_cents,cost_cents) select p_store,sid,id,brand||' '||model||' '||storage,imei,case when p_method='Crédito' then credit_price_cents when p_method='Carnê' then book_price_cents else price_cents end,purchase_cents+repair_cents from public.devices where store_id=p_store and id=any(p_devices);
update public.devices set status='Vendido' where store_id=p_store and id=any(p_devices);
if received>0 then insert into public.receipts(store_id,sale_id,amount_cents,method) values(p_store,sid,received,case when p_method in ('Carnê','Boleto') then p_entry_method else p_method end) returning id into r; insert into public.ledger(store_id,amount_cents,description,receipt_id,method) values(p_store,received,'Recebimento da venda',r,case when p_method in ('Carnê','Boleto') then p_entry_method else p_method end); end if;
if remaining>0 then base:=remaining/p_count; extra:=remaining%p_count; for i in 1..p_count loop due:=(date_trunc('month',p_first_due)+(i-1)*interval '1 month')::date; due:=due+(least(extract(day from p_first_due)::int,extract(day from (due+interval '1 month - 1 day'))::int)-1); insert into public.installments(store_id,sale_id,number,due_date,amount_cents) values(p_store,sid,i,due,base+case when i<=extra then 1 else 0 end); end loop; end if; return sid; end $function$
;
CREATE OR REPLACE FUNCTION public.edit_device(p_id uuid, p_device jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare d public.devices; pur public.purchases;cost bigint;begin
perform set_config('ultra.transaction','yes',true);select * into d from public.devices where id=p_id for update;
if d.id is null or not public.can_access(d.store_id,array['admin','gerente']) then raise exception 'Sem permissão para editar aparelho.';end if;
select * into pur from public.purchases where device_id=d.id and store_id=d.store_id for update;cost:=(p_device->>'purchase_cents')::bigint;
if (pur.paid or d.status='Vendido') and cost<>d.purchase_cents then raise exception 'O custo de uma compra paga ou aparelho vendido deve ser preservado.';end if;
update public.devices set brand=p_device->>'brand',model=p_device->>'model',color=coalesce(p_device->>'color',''),storage=coalesce(p_device->>'storage',''),imei=p_device->>'imei',imei2=nullif(p_device->>'imei2',''),serial=coalesce(p_device->>'serial',''),condition=p_device->>'condition',battery=nullif(p_device->>'battery','')::int,purchase_cents=cost,repair_cents=(p_device->>'repair_cents')::bigint,price_cents=(p_device->>'price_cents')::bigint,credit_price_cents=(p_device->>'credit_price_cents')::bigint,book_price_cents=(p_device->>'book_price_cents')::bigint,origin=p_device->>'origin',origin_invoice=coalesce(p_device->>'origin_invoice',''),inspection=coalesce(p_device->>'inspection',''),warranty_days=(p_device->>'warranty_days')::int where id=d.id;
if not pur.paid then update public.purchases set amount_cents=cost,seller=p_device->>'origin' where id=pur.id;end if;
end $function$
;
grant execute on function make_sale_v2(uuid,uuid,uuid[],bigint,bigint,int,date,text,text,uuid,numeric,text),edit_device(uuid,jsonb) to authenticated;

