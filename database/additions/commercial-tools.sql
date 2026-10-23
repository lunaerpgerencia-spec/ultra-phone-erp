create table public.device_channels(
 id uuid primary key default gen_random_uuid(),store_id uuid not null references public.stores(id),device_id uuid not null,
 channel text not null check(channel in ('Mercado Livre','Shopee','Site')),status text not null default 'Rascunho' check(status in ('Rascunho','Publicado','Pausado')),
 price_cents bigint not null check(price_cents>0),fee_percent numeric not null default 0 check(fee_percent between 0 and 100),fixed_fee_cents bigint not null default 0 check(fixed_fee_cents>=0),shipping_cents bigint not null default 0 check(shipping_cents>=0),
 url text not null default '' check(url='' or (url ~ '^https://' and length(url)<=2000)),description text not null default '' check(length(description)<=6000),created_at timestamptz not null default now(),
 foreign key(store_id,device_id) references public.devices(store_id,id),unique(store_id,device_id,channel)
);
create table public.trade_appraisals(
 id uuid primary key default gen_random_uuid(),store_id uuid not null references public.stores(id),customer_id uuid,
 model text not null check(length(trim(model)) between 2 and 250),storage text not null default '',color text not null default '',imei text not null default '' check(imei='' or public.check_imei(imei)),condition text not null default 'Seminovo' check(condition in ('Novo','Seminovo','Usado','Recondicionado')),
 checks jsonb not null default '{}'::jsonb check(jsonb_typeof(checks)='object' and octet_length(checks::text)<=8000),
 resale_cents bigint not null check(resale_cents>0),repair_cents bigint not null default 0 check(repair_cents>=0),expenses_cents bigint not null default 0 check(expenses_cents>=0),profit_cents bigint not null default 0 check(profit_cents>=0),
 basis_cents bigint generated always as (greatest(0,resale_cents-repair_cents-expenses_cents-profit_cents)) stored,
 offer_cents bigint not null default 0 check(offer_cents>=0),notes text not null default '' check(length(notes)<=3000),created_at timestamptz not null default now(),created_by uuid not null default auth.uid() references auth.users(id),
 foreign key(store_id,customer_id) references public.customers(store_id,id)
);
create index trade_appraisals_store_date on public.trade_appraisals(store_id,created_at);
do $$declare t text;begin
 foreach t in array array['device_channels','trade_appraisals'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select,insert,update on public.%I to authenticated',t);
  execute format('create policy commercial_read on public.%I for select to authenticated using(public.can_access(store_id))',t);
  if t='trade_appraisals' then
   execute format('create policy commercial_insert on public.%I for insert to authenticated with check(public.can_access(store_id,array[''admin'',''gerente'']) and created_by=(select auth.uid()))',t);
  else
   execute format('create policy commercial_insert on public.%I for insert to authenticated with check(public.can_access(store_id,array[''admin'',''gerente'']))',t);
  end if;
  execute format('create policy commercial_update on public.%I for update to authenticated using(public.can_access(store_id,array[''admin'',''gerente''])) with check(public.can_access(store_id,array[''admin'',''gerente'']))',t);
  execute format('create trigger audit_changes after insert or update on public.%I for each row execute function ultra_private.record_audit()',t);
 end loop;
end $$;
