-- Preserve every existing device and sale. Existing devices remain IMEI-required.
set local lock_timeout = '5s';
alter table public.devices add column product_type text not null default 'Celulares'
 check (product_type in ('Celulares','Relógios','Acessórios','Moto elétrica','Produtos sem IMEI'));
alter table public.devices alter column imei drop not null;
alter table public.devices add constraint devices_mobile_imei_required
 check (product_type <> 'Celulares' or imei is not null);
-- Original IMEI format, checksum and uniqueness constraints are retained.
-- Sale snapshots may omit IMEI only when the source product has none.
alter table public.sale_items alter column imei drop not null;

CREATE OR REPLACE FUNCTION public.intake_device(p_store uuid, p_device jsonb, p_seller text, p_paid boolean, p_due date, p_method text, p_request uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare d uuid; cost bigint; begin if not public.can_access(p_store,array['admin','gerente']) then raise exception 'Sem permissão para compras.'; end if; if exists(select 1 from public.purchases where id=p_request and store_id=p_store) then select device_id into d from public.purchases where id=p_request and store_id=p_store; return d; end if; if length(trim(p_seller))<2 or p_due is null then raise exception 'Informe vendedor e vencimento.'; end if; if p_paid and p_method not in ('PIX','Dinheiro','Débito','Crédito','Transferência') then raise exception 'Forma de pagamento inválida.'; end if; perform set_config('ultra.transaction','yes',true); cost:=(p_device->>'purchase_cents')::bigint;
insert into public.devices(store_id,brand,model,color,storage,imei,imei2,serial,condition,battery,purchase_cents,repair_cents,price_cents,origin,origin_invoice,inspection,warranty_days,credit_price_cents,book_price_cents,product_type) values(p_store,p_device->>'brand',p_device->>'model',coalesce(p_device->>'color',''),coalesce(p_device->>'storage',''),nullif(trim(p_device->>'imei'),''),nullif(p_device->>'imei2',''),coalesce(p_device->>'serial',''),p_device->>'condition',nullif(p_device->>'battery','')::int,cost,coalesce((p_device->>'repair_cents')::bigint,0),(p_device->>'price_cents')::bigint,p_seller,coalesce(p_device->>'origin_invoice',''),coalesce(p_device->>'inspection',''),coalesce((p_device->>'warranty_days')::int,90),coalesce((p_device->>'credit_price_cents')::bigint,(p_device->>'price_cents')::bigint),coalesce((p_device->>'book_price_cents')::bigint,(p_device->>'price_cents')::bigint),coalesce(p_device->>'product_type','Celulares')) returning id into d;
insert into public.purchases(id,store_id,device_id,seller,amount_cents,paid,due_date) values(p_request,p_store,d,p_seller,cost,p_paid,p_due);
if p_paid and cost>0 then insert into public.ledger(store_id,amount_cents,description,purchase_id,method) values(p_store,-cost,'Compra de aparelho',p_request,p_method); end if; return d; end $function$
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
update public.devices set brand=p_device->>'brand',model=p_device->>'model',color=coalesce(p_device->>'color',''),storage=coalesce(p_device->>'storage',''),imei=nullif(trim(p_device->>'imei'),''),product_type=coalesce(p_device->>'product_type','Celulares'),imei2=nullif(p_device->>'imei2',''),serial=coalesce(p_device->>'serial',''),condition=p_device->>'condition',battery=nullif(p_device->>'battery','')::int,purchase_cents=cost,repair_cents=(p_device->>'repair_cents')::bigint,price_cents=(p_device->>'price_cents')::bigint,credit_price_cents=(p_device->>'credit_price_cents')::bigint,book_price_cents=(p_device->>'book_price_cents')::bigint,origin=p_device->>'origin',origin_invoice=coalesce(p_device->>'origin_invoice',''),inspection=coalesce(p_device->>'inspection',''),warranty_days=(p_device->>'warranty_days')::int where id=d.id;
if not pur.paid then update public.purchases set amount_cents=cost,seller=p_device->>'origin' where id=pur.id;end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.save_device_details(p_id uuid, p_store uuid, p_device jsonb, p_specs jsonb, p_barcode text, p_seller text, p_paid boolean, p_due date, p_method text, p_request uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare d uuid; category text;
begin
 if not public.can_access(p_store,array['admin','gerente']) then raise exception 'Sem permissão para cadastrar aparelhos.';end if;
 category:=case when p_specs->>'stock_section' in ('Relógios','Acessórios','Moto elétrica','Produtos sem IMEI')
  then p_specs->>'stock_section' else 'Celulares' end;
 -- Derive the product type on the server; never trust a conflicting client flag.
 p_device:=p_device||jsonb_build_object('product_type',category);
 if p_id is null then
  d:=public.intake_device(p_store,p_device,p_seller,p_paid,p_due,p_method,p_request);
 else
  if not exists(select 1 from public.devices where id=p_id and store_id=p_store) then raise exception 'Aparelho não encontrado nesta loja.';end if;
  perform public.edit_device(p_id,p_device);d:=p_id;
 end if;
 insert into public.device_specs(id,store_id,barcode,specs) values(d,p_store,trim(coalesce(p_barcode,'')),coalesce(p_specs,'{}'::jsonb)) on conflict(id) do update set barcode=excluded.barcode,specs=excluded.specs;
 return d;
end $function$
;
