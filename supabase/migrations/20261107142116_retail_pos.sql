do $$ declare c record; begin for c in select conname from pg_constraint where conrelid='public.sales'::regclass and contype='c' and pg_get_constraintdef(oid) like '%payment_method%' loop execute format('alter table public.sales drop constraint %I',c.conname);end loop;end $$;
alter table public.sales add constraint retail_payment_method_check check(payment_method is null or payment_method in ('PIX','Dinheiro','Débito','Crédito','Transferência','Boleto','Carnê','Misto'));
alter table public.sales alter column customer_id drop not null;
-- Additive retail POS. Existing contracts, receivables and receipts are preserved.
alter table public.stores add column if not exists company_document text not null default '', add column if not exists address text not null default '', add column if not exists phone text not null default '';
alter table public.sales add column if not exists seller_label text not null default '', add column if not exists pos_sale boolean not null default false, add column if not exists cash_tendered_cents bigint not null default 0, add column if not exists change_cents bigint not null default 0;
alter table public.ledger add column if not exists account_label text, add column if not exists cash_session_id uuid references public.cash_sessions(id);
create table public.retail_payments(id uuid primary key,store_id uuid not null references public.stores(id),sale_id uuid not null references public.sales(id),method text not null check(method in ('PIX','Dinheiro','Débito','Crédito','Transferência')),gross_cents bigint not null check(gross_cents>0),net_cents bigint not null check(net_cents>0 and net_cents<=gross_cents),expected_date date not null,settled_date date,account_label text not null,created_at timestamptz not null default now(),unique(store_id,id));
create table public.work_expenses(id uuid primary key,store_id uuid not null references public.stores(id),sale_id uuid references public.sales(id),expense_date date not null,category text not null,description text not null check(length(trim(description))>=2),amount_cents bigint not null check(amount_cents>0),responsible text not null,recipient text not null default '',method text not null check(method in ('PIX','Dinheiro','Débito','Crédito','Transferência')),account_label text not null,location text not null default '',deleted boolean not null default false,last_request uuid not null,created_by uuid not null default auth.uid(),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index retail_payments_store on public.retail_payments(store_id,sale_id);
create index work_expenses_store on public.work_expenses(store_id,expense_date);
alter table public.retail_payments enable row level security;
alter table public.work_expenses enable row level security;
create policy retail_read on public.retail_payments for select to authenticated using(public.can_access(store_id,array['admin','gerente','financeiro','vendedor']));
create policy retail_write on public.retail_payments for all to authenticated using(public.can_access(store_id,array['admin','gerente','financeiro','vendedor']) and current_setting('ultra.retail',true)='yes') with check(public.can_access(store_id,array['admin','gerente','financeiro','vendedor']) and current_setting('ultra.retail',true)='yes');
create policy expense_read on public.work_expenses for select to authenticated using(public.can_access(store_id,array['admin','gerente','financeiro']) or (created_by=auth.uid() and public.can_access(store_id,array['vendedor'])));
create policy expense_write on public.work_expenses for all to authenticated using((created_by=auth.uid() or public.can_access(store_id,array['admin','gerente','financeiro'])) and public.can_access(store_id) and current_setting('ultra.retail',true)='yes') with check(public.can_access(store_id,array['admin','gerente','financeiro','vendedor']) and current_setting('ultra.retail',true)='yes');
grant select,insert,update on public.retail_payments,public.work_expenses to authenticated;
grant update(seller_label,pos_sale,cash_tendered_cents,change_cents) on public.sales to authenticated;
grant update(company_document,address,phone,name) on public.stores to authenticated;
create policy store_details on public.stores for update to authenticated using(public.can_access(id,array['admin','gerente'])) with check(public.can_access(id,array['admin','gerente']));

create function public.save_work_expense(p_store uuid,p_id uuid,p_data jsonb,p_request uuid,p_delete boolean default false) returns uuid language plpgsql security invoker set search_path='' as $$
declare oldrow public.work_expenses; amount bigint; account text; meth text; session uuid; sid uuid;
begin
 if not public.can_access(p_store,array['admin','gerente','financeiro','vendedor']) or p_request is null or p_id is null then raise exception 'Sem permissão.';end if;
 perform set_config('ultra.transaction','yes',true);perform set_config('ultra.retail','yes',true);
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into oldrow from public.work_expenses where id=p_id and store_id=p_store for update;
 if oldrow.last_request=p_request then return p_id;end if;
 if p_delete and oldrow.id is null then raise exception 'Despesa não encontrada.';end if;
 perform set_config('ultra.transaction','yes',true);perform set_config('ultra.retail','yes',true);
 if oldrow.id is not null and not oldrow.deleted then
  -- Corrections are journaled in the current drawer rather than rewriting closed cash history.
  if oldrow.account_label='Caixa físico' then select id into session from public.cash_sessions where store_id=p_store and operator_id=auth.uid() and closed_at is null for update;if session is null then raise exception 'Abra o caixa para corrigir uma saída em dinheiro.';end if;end if;
  insert into public.ledger(store_id,amount_cents,description,method,account_label,cash_session_id) values(p_store,oldrow.amount_cents,'Correção de despesa: '||oldrow.description,oldrow.method,oldrow.account_label,session);
 end if;
 if p_delete then update public.work_expenses set deleted=true,last_request=p_request,updated_at=now() where id=p_id;return p_id;end if;
 amount:=(p_data->>'amount_cents')::bigint;account:=trim(p_data->>'account_label');meth:=p_data->>'method';sid:=nullif(p_data->>'sale_id','')::uuid;
 if amount is null or amount<=0 or coalesce(account,'')='' or coalesce(trim(p_data->>'responsible'),'')='' then raise exception 'Informe valor, responsável e conta.';end if;
 if sid is not null and not exists(select 1 from public.sales where id=sid and store_id=p_store) then raise exception 'Venda inválida.';end if;
 session:=null;if account='Caixa físico' then if meth<>'Dinheiro' then raise exception 'Caixa físico aceita somente dinheiro.';end if;select id into session from public.cash_sessions where store_id=p_store and operator_id=auth.uid() and closed_at is null for update;if session is null then raise exception 'Abra o caixa antes da saída.';end if;end if;
 insert into public.work_expenses(id,store_id,sale_id,expense_date,category,description,amount_cents,responsible,recipient,method,account_label,location,last_request) values(p_id,p_store,sid,(p_data->>'expense_date')::date,p_data->>'category',trim(p_data->>'description'),amount,trim(p_data->>'responsible'),coalesce(p_data->>'recipient',''),meth,account,coalesce(p_data->>'location',''),p_request)
 on conflict(id) do update set sale_id=excluded.sale_id,expense_date=excluded.expense_date,category=excluded.category,description=excluded.description,amount_cents=excluded.amount_cents,responsible=excluded.responsible,recipient=excluded.recipient,method=excluded.method,account_label=excluded.account_label,location=excluded.location,deleted=false,last_request=p_request,updated_at=now();
 insert into public.ledger(store_id,amount_cents,description,method,account_label,cash_session_id) values(p_store,-amount,'Despesa: '||(p_data->>'description'),meth,account,session);return p_id;
end $$;

create function public.checkout_retail(p_store uuid,p_customer uuid,p_items jsonb,p_discount bigint,p_payments jsonb,p_seller text,p_tendered bigint,p_request uuid,p_expenses jsonb default '[]') returns uuid language plpgsql security invoker set search_path='' as $$
declare item jsonb;pay jsonb;ex jsonb;d public.devices;session uuid;subtotal bigint:=0;cash bigint:=0;paid bigint:=0;rid uuid;gross bigint;net bigint;m text;settled date;account text;price bigint;
begin
 if not public.can_access(p_store,array['admin','gerente','vendedor']) or p_request is null then raise exception 'Sem permissão para vender.';end if;
 perform set_config('ultra.transaction','yes',true);perform set_config('ultra.retail','yes',true);
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 if exists(select 1 from public.sales where id=p_request and store_id=p_store) then return p_request;end if;
 select id into session from public.cash_sessions where store_id=p_store and operator_id=auth.uid() and closed_at is null for update;
 if session is null then raise exception 'Abra seu caixa antes de vender.';end if;
 if coalesce(trim(p_seller),'')='' then raise exception 'Selecione o vendedor.';end if;
 if p_customer is not null and not exists(select 1 from public.customers where id=p_customer and store_id=p_store and active) then raise exception 'Cliente inválido.';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 50 or (select count(distinct x->>'id') from jsonb_array_elements(p_items) x)<>jsonb_array_length(p_items) then raise exception 'Carrinho inválido.';end if;
 -- Lock units in a stable order; IMEI and serial inventory stores one row per unit.
 for item in select x from jsonb_array_elements(p_items) x order by x->>'id' loop
 select * into d from public.devices where id=(item->>'id')::uuid and store_id=p_store for update;
 price:=(item->>'price_cents')::bigint;
 if d.id is null or d.status<>'Disponível' or price is null or price<=0 then raise exception 'Produto indisponível ou preço inválido.';end if;
 subtotal:=subtotal+price;
 end loop;
 if p_discount is null or p_discount<0 or p_discount>=subtotal or jsonb_typeof(p_payments)<>'array' or jsonb_array_length(p_payments) not between 1 and 20 then raise exception 'Desconto ou pagamentos inválidos.';end if;
 for pay in select x from jsonb_array_elements(p_payments) x loop
 gross:=(pay->>'gross_cents')::bigint;net:=(pay->>'net_cents')::bigint;m:=pay->>'method';
 if m is null or m not in ('PIX','Dinheiro','Débito','Crédito','Transferência') or gross is null or net is null or gross<=0 or net<=0 or net>gross or (m not in ('Crédito','Débito') and net<>gross) then raise exception 'Valor bruto, líquido ou forma inválida.';end if;
 if m='Dinheiro' then cash:=cash+gross;end if;paid:=paid+gross;
 end loop;
 if paid<>subtotal-p_discount or coalesce(p_tendered,0)<cash then raise exception 'Confira os pagamentos e o dinheiro entregue.';end if;
 perform set_config('ultra.transaction','yes',true);perform set_config('ultra.retail','yes',true);
 insert into public.sales(id,store_id,customer_id,subtotal_cents,discount_cents,payment_method,seller_label,pos_sale,cash_tendered_cents,change_cents,customer_snapshot) values(p_request,p_store,p_customer,subtotal,p_discount,case when jsonb_array_length(p_payments)>1 then 'Misto' else p_payments->0->>'method' end,trim(p_seller),true,coalesce(p_tendered,0),coalesce(p_tendered,0)-cash,(select jsonb_build_object('name',name,'document',document,'phone',phone,'address',address) from public.customers where id=p_customer));
 for item in select x from jsonb_array_elements(p_items) x loop
 select * into d from public.devices where id=(item->>'id')::uuid;
 insert into public.sale_items(store_id,sale_id,device_id,label,imei,price_cents,cost_cents) values(p_store,p_request,d.id,d.brand||' '||d.model||' '||d.storage,d.imei,(item->>'price_cents')::bigint,d.purchase_cents+d.repair_cents);
 update public.devices set status='Vendido' where id=d.id;
 end loop;
 for pay in select x from jsonb_array_elements(p_payments) x loop
 rid:=gen_random_uuid();m:=pay->>'method';gross:=(pay->>'gross_cents')::bigint;net:=(pay->>'net_cents')::bigint;settled:=nullif(pay->>'settled_date','')::date;account:=trim(pay->>'account_label');
 if coalesce(account,'')='' or nullif(pay->>'expected_date','') is null or (m not in ('Crédito','Débito') and settled is null) or settled>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Informe conta e datas de recebimento válidas.';end if;
 if m='Dinheiro' and account<>'Caixa físico' or m<>'Dinheiro' and account='Caixa físico' then raise exception 'Confira a conta de recebimento.';end if;
 insert into public.retail_payments values(rid,p_store,p_request,m,gross,net,(pay->>'expected_date')::date,settled,account,now());
 insert into public.receipts(id,store_id,sale_id,amount_cents,method) values(rid,p_store,p_request,gross,m);
 if settled is not null then insert into public.ledger(store_id,amount_cents,description,receipt_id,method,account_label,cash_session_id) values(p_store,net,'Recebimento líquido da venda',rid,m,account,case when m='Dinheiro' then session end);end if;
 end loop;
 for ex in select x from jsonb_array_elements(p_expenses) x loop perform public.save_work_expense(p_store,(ex->>'id')::uuid,ex||jsonb_build_object('sale_id',p_request),p_request,false);end loop;
 return p_request;
end $$;

create function public.settle_retail_payment(p_id uuid,p_date date) returns void language plpgsql security invoker set search_path='' as $$
declare p public.retail_payments;
begin
 perform set_config('ultra.transaction','yes',true);perform set_config('ultra.retail','yes',true);
 select * into p from public.retail_payments where id=p_id for update;
 if p.id is null or not public.can_access(p.store_id,array['admin','gerente','financeiro']) then raise exception 'Sem permissão.';end if;
 perform 1 from public.sales where id=p.sale_id and status='Ativa' for update;if not found then raise exception 'Venda cancelada.';end if;
 if p.settled_date is not null then return;end if;
 if p_date is null or p_date>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Informe a data efetiva.';end if;
 perform set_config('ultra.transaction','yes',true);perform set_config('ultra.retail','yes',true);
 update public.retail_payments set settled_date=p_date where id=p_id;
 insert into public.ledger(store_id,amount_cents,description,receipt_id,method,account_label) values(p.store_id,p.net_cents,'Liquidação do cartão',p.id,p.method,p.account_label);
end $$;
-- Existing cancellation continues to reverse receipts. Only settled net funds are returned.
create function public.retail_ledger_reversal() returns trigger language plpgsql security invoker set search_path='' as $$
declare p public.retail_payments;
begin
 select pmt.* into p from public.receipts r join public.retail_payments pmt on pmt.id=r.reversal_of where r.id=new.receipt_id;
 if p.id is not null then if p.settled_date is null then return null;end if;new.amount_cents:=-p.net_cents;new.account_label:=p.account_label;end if;return new;
end $$;
create trigger retail_reversal before insert on public.ledger for each row execute function public.retail_ledger_reversal();
create function public.guard_retail_edit() returns trigger language plpgsql security invoker set search_path='' as $$
begin if old.pos_sale and current_setting('ultra.retail',true) is distinct from 'yes' and (new.subtotal_cents,new.customer_id,new.payment_method,new.discount_cents) is distinct from (old.subtotal_cents,old.customer_id,old.payment_method,old.discount_cents) then raise exception 'Venda de PDV: cancele e registre novamente para corrigir os pagamentos.';end if;return new;end $$;
create trigger retail_edit_guard before update on public.sales for each row execute function public.guard_retail_edit();
revoke all on function public.save_work_expense(uuid,uuid,jsonb,uuid,boolean),public.checkout_retail(uuid,uuid,jsonb,bigint,jsonb,text,bigint,uuid,jsonb),public.settle_retail_payment(uuid,date),public.retail_ledger_reversal(),public.guard_retail_edit() from public,anon;
grant execute on function public.save_work_expense(uuid,uuid,jsonb,uuid,boolean),public.checkout_retail(uuid,uuid,jsonb,bigint,jsonb,text,bigint,uuid,jsonb),public.settle_retail_payment(uuid,date) to authenticated;

create or replace function public.guard_cash_session() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='INSERT' then
  if new.operator_id is distinct from auth.uid() or new.closed_at is not null then raise exception 'Abertura inválida.';end if;
  new.opened_at:=clock_timestamp();new.counted_cents:=null;new.expected_cents:=null;
 else
  if old.closed_at is not null or new.closed_at is null or new.counted_cents is null then raise exception 'Caixa fechado ou fechamento inválido.';end if;
  if (new.id,new.store_id,new.operator_id,new.opening_cents,new.opened_at,new.operator_label) is distinct from (old.id,old.store_id,old.operator_id,old.opening_cents,old.opened_at,old.operator_label) then raise exception 'Preserve os dados da abertura.';end if;
  new.closed_at:=clock_timestamp();
  select old.opening_cents+coalesce((select sum(l.amount_cents) from public.ledger l where l.store_id=old.store_id and l.created_by=old.operator_id and (l.method='Dinheiro' or (l.method='Estorno' and exists(select 1 from public.receipts r join public.receipts original on original.id=r.reversal_of where r.id=l.receipt_id and original.method='Dinheiro'))) and (l.account_label is null or l.account_label='Caixa físico') and (l.cash_session_id=old.id or (l.cash_session_id is null and l.created_at>=old.opened_at and l.created_at<new.closed_at)) and l.created_at>=old.opened_at and l.created_at<new.closed_at),0)+coalesce((select sum(case when e.kind='Suprimento' then e.amount_cents else -e.amount_cents end) from public.cash_events e where e.session_id=old.id),0) into new.expected_cents;
 end if;return new;
end $$;

create trigger audit_changes after insert or update on public.work_expenses for each row execute function ultra_private.record_audit();
create trigger audit_changes after insert or update on public.retail_payments for each row execute function ultra_private.record_audit();
