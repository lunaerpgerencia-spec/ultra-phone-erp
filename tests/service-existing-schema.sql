-- Existing assistance schema captured for isolated regression tests.
create table public.service_orders (
id uuid not null,
store_id uuid not null,
number bigint generated always as identity not null,
customer_id uuid,
device_id uuid,
device_label text not null,
imei text,
serial text default ''::text not null,
problem text not null,
checklist text default ''::text not null,
diagnosis text default ''::text not null,
parts text default ''::text not null,
technician text default ''::text not null,
status text default 'Recebido'::text not null,
approved boolean default false not null,
approval_note text default ''::text not null,
cost_cents bigint default 0 not null,
fee_cents bigint default 0 not null,
cost_paid boolean default false not null,
warranty_days integer default 90 not null,
previous_status text,
delivered_at timestamp with time zone,
created_at timestamp with time zone default now() not null,
updated_at timestamp with time zone default now() not null);
create table public.service_payments (
id uuid not null,
store_id uuid not null,
order_id uuid not null,
kind text not null,
amount_cents bigint not null,
method text not null,
created_at timestamp with time zone default now() not null,
created_by uuid default auth.uid() not null);
alter table public.service_orders add CHECK (((customer_id IS NOT NULL) OR (device_id IS NOT NULL)));
alter table public.service_orders add CHECK ((cost_cents >= 0));
alter table public.service_orders add CHECK ((length(TRIM(BOTH FROM device_label)) >= 2));
alter table public.service_orders add CHECK ((fee_cents >= 0));
alter table public.service_orders add CHECK (((imei IS NULL) OR check_imei(imei)));
alter table public.service_orders add PRIMARY KEY (id);
alter table public.service_orders add CHECK ((length(TRIM(BOTH FROM problem)) >= 3));
alter table public.service_orders add CHECK ((status = ANY (ARRAY['Recebido'::text, 'Em análise'::text, 'Aguardando aprovação'::text, 'Em manutenção'::text, 'Pronto'::text, 'Entregue'::text, 'Cancelada'::text])));
alter table public.service_orders add FOREIGN KEY (store_id, customer_id) REFERENCES customers(store_id, id);
alter table public.service_orders add FOREIGN KEY (store_id, device_id) REFERENCES devices(store_id, id);
alter table public.service_orders add FOREIGN KEY (store_id) REFERENCES stores(id);
alter table public.service_orders add UNIQUE (store_id, id);
alter table public.service_orders add CHECK (((warranty_days >= 0) AND (warranty_days <= 3650)));
alter table public.service_payments add CHECK ((amount_cents > 0));
alter table public.service_payments add CHECK ((kind = ANY (ARRAY['Recebimento'::text, 'Custo'::text])));
alter table public.service_payments add CHECK ((method = ANY (ARRAY['PIX'::text, 'Dinheiro'::text, 'Débito'::text, 'Crédito'::text, 'Transferência'::text])));
alter table public.service_payments add PRIMARY KEY (id);
alter table public.service_payments add UNIQUE (store_id, id);
alter table public.service_payments add FOREIGN KEY (store_id, order_id) REFERENCES service_orders(store_id, id);
alter table ledger add column service_payment_id uuid unique references service_payments(id);
CREATE OR REPLACE FUNCTION public.record_service_payment(p_order uuid, p_kind text, p_amount bigint, p_method text, p_request uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare o public.service_orders;paid bigint;begin
perform set_config('ultra.transaction','yes',true);select * into o from public.service_orders where id=p_order for update;
if o.id is null or not public.can_access(o.store_id,array['admin','gerente','financeiro']) then raise exception 'Ordem não encontrada ou sem permissão.';end if;
if exists(select 1 from public.service_payments where id=p_request and store_id=o.store_id) then return p_request;end if;
if o.status='Cancelada' or p_amount is null or p_amount<=0 or p_method is null or p_method not in ('PIX','Dinheiro','Débito','Crédito','Transferência') then raise exception 'Pagamento inválido.';end if;
if p_kind='Custo' then if o.cost_paid or p_amount<>o.cost_cents then raise exception 'Informe o custo integral ainda não pago.';end if;elsif p_kind='Recebimento' then select coalesce(sum(amount_cents),0) into paid from public.service_payments where order_id=o.id and kind='Recebimento';if p_amount>o.fee_cents-paid then raise exception 'Recebimento superior ao saldo.';end if;else raise exception 'Tipo de pagamento inválido.';end if;
insert into public.service_payments(id,store_id,order_id,kind,amount_cents,method) values(p_request,o.store_id,o.id,p_kind,p_amount,p_method);
insert into public.ledger(store_id,amount_cents,description,method,service_payment_id) values(o.store_id,case when p_kind='Custo' then -p_amount else p_amount end,p_kind||' da OS #'||o.number,p_method,p_request);
if p_kind='Custo' then update public.service_orders set cost_paid=true where id=o.id;if o.device_id is not null and o.previous_status='Disponível' then update public.devices set repair_cents=repair_cents+p_amount where id=o.device_id;end if;end if;return p_request;end $function$
;
CREATE OR REPLACE FUNCTION public.save_service_order(p_store uuid, p_id uuid, p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare o public.service_orders;d public.devices;did uuid;cid uuid;st text;ap boolean;co bigint;fe bigint;paid bigint;begin
if not public.can_access(p_store,array['admin','gerente']) then raise exception 'Sem permissão para assistência.';end if;
perform set_config('ultra.transaction','yes',true);select * into o from public.service_orders where id=p_id and store_id=p_store for update;
did:=nullif(p_data->>'device_id','')::uuid;cid:=nullif(p_data->>'customer_id','')::uuid;st:=coalesce(p_data->>'status','Recebido');ap:=coalesce((p_data->>'approved')::boolean,false);co:=(p_data->>'cost_cents')::bigint;fe:=(p_data->>'fee_cents')::bigint;
if cid is not null and not exists(select 1 from public.customers where id=cid and store_id=p_store and active) then raise exception 'Cliente inválido.';end if;
if o.id is not null and (o.status in ('Entregue','Cancelada') or did is distinct from o.device_id or cid is distinct from o.customer_id) then raise exception 'Ordem encerrada ou vínculo alterado. Preserve o histórico.';end if;
if o.id is null and st<>'Recebido' then raise exception 'Uma nova ordem começa como Recebido.';end if;
if st in ('Em manutenção','Pronto','Entregue') and not ap then raise exception 'Registre a aprovação do cliente antes da manutenção.';end if;
if ap and length(trim(coalesce(p_data->>'approval_note','')))<3 then raise exception 'Informe data e evidência da aprovação.';end if;
if o.id is not null and st<>o.status and st<>'Cancelada' and not ((o.status='Recebido' and st='Em análise') or (o.status='Em análise' and st='Aguardando aprovação') or (o.status='Aguardando aprovação' and st='Em manutenção') or (o.status='Em manutenção' and st='Pronto') or (o.status='Pronto' and st='Entregue')) then raise exception 'Avance para a próxima etapa do serviço.';end if;
select coalesce(sum(amount_cents),0) into paid from public.service_payments where order_id=p_id and kind='Recebimento';
if (o.cost_paid and co<>o.cost_cents) or fe<paid then raise exception 'Valores pagos devem ser preservados.';end if;
if st='Entregue' and o.previous_status='Disponível' and co>0 and not o.cost_paid then raise exception 'Pague o custo do reparo antes de devolver o aparelho ao estoque.';end if;
if st='Cancelada' and (paid>0 or o.cost_paid) then raise exception 'Há pagamentos nesta ordem. Resolva o estorno antes de cancelar.';end if;
if did is not null then select * into d from public.devices where id=did and store_id=p_store for update;if d.id is null then raise exception 'Aparelho não encontrado.';end if;if o.id is null and d.status='Em manutenção' then raise exception 'Aparelho já está em manutenção.';end if;end if;
if o.id is null then
insert into public.service_orders(id,store_id,customer_id,device_id,device_label,imei,serial,problem,checklist,diagnosis,parts,technician,status,approved,approval_note,cost_cents,fee_cents,warranty_days,previous_status) values(p_id,p_store,cid,did,case when did is null then p_data->>'device_label' else d.brand||' '||d.model end,case when did is null then nullif(p_data->>'imei','') else d.imei end,case when did is null then coalesce(p_data->>'serial','') else d.serial end,p_data->>'problem',coalesce(p_data->>'checklist',''),coalesce(p_data->>'diagnosis',''),coalesce(p_data->>'parts',''),coalesce(p_data->>'technician',''),st,ap,coalesce(p_data->>'approval_note',''),co,fe,(p_data->>'warranty_days')::int,d.status);
else
update public.service_orders set device_label=case when did is null then p_data->>'device_label' else o.device_label end,imei=case when did is null then nullif(p_data->>'imei','') else o.imei end,serial=case when did is null then coalesce(p_data->>'serial','') else o.serial end,problem=p_data->>'problem',checklist=p_data->>'checklist',diagnosis=p_data->>'diagnosis',parts=p_data->>'parts',technician=p_data->>'technician',status=st,approved=ap,approval_note=p_data->>'approval_note',cost_cents=co,fee_cents=fe,warranty_days=(p_data->>'warranty_days')::int,updated_at=now(),delivered_at=case when st='Entregue' then now() else null end where id=o.id;
end if;
if did is not null and d.status<>'Vendido' then update public.devices set status=case when st in ('Entregue','Cancelada') then coalesce(o.previous_status,'Disponível') else 'Em manutenção' end where id=did;end if;return p_id;end $function$
;
alter table service_orders enable row level security;grant select,insert,update on service_orders to authenticated;
alter table service_payments enable row level security;grant select,insert,update on service_payments to authenticated;
create policy service_edit on service_orders for UPDATE to authenticated using ((can_access(store_id, ARRAY['admin'::text, 'gerente'::text, 'financeiro'::text]) AND (( SELECT current_setting('ultra.transaction'::text, true) AS current_setting) = 'yes'::text))) with check ((can_access(store_id, ARRAY['admin'::text, 'gerente'::text, 'financeiro'::text]) AND (( SELECT current_setting('ultra.transaction'::text, true) AS current_setting) = 'yes'::text)));
create policy service_read on service_orders for SELECT to authenticated using (can_access(store_id)) ;
create policy service_write on service_orders for INSERT to authenticated  with check ((can_access(store_id, ARRAY['admin'::text, 'gerente'::text]) AND (( SELECT current_setting('ultra.transaction'::text, true) AS current_setting) = 'yes'::text)));
create policy service_pay_read on service_payments for SELECT to authenticated using (can_access(store_id, ARRAY['admin'::text, 'gerente'::text, 'financeiro'::text])) ;
create policy service_pay_write on service_payments for INSERT to authenticated  with check ((can_access(store_id, ARRAY['admin'::text, 'gerente'::text, 'financeiro'::text]) AND (( SELECT current_setting('ultra.transaction'::text, true) AS current_setting) = 'yes'::text)));
grant usage,select on all sequences in schema public to authenticated;

