-- Separate supplier terms from shop post-sale terms without rewriting any sale.
create table public.warranty_terms (
 id uuid primary key default gen_random_uuid(),
 store_id uuid not null,
 device_id uuid not null,
 sale_item_id uuid references public.sale_items(id),
 kind text not null check(kind in ('Fornecedor','Loja')),
 provider text not null default '' check(length(provider)<=160),
 start_date date,
 days integer not null check(days between 0 and 36500),
 notes text not null default '' check(length(notes)<=2000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 created_by uuid not null references auth.users(id),
 updated_by uuid not null references auth.users(id),
 foreign key(store_id,device_id) references public.devices(store_id,id) on delete cascade,
 check((kind='Fornecedor' and sale_item_id is null and start_date is not null) or (kind='Loja' and (sale_item_id is null or start_date is not null)))
);
create unique index warranty_terms_supplier_unique on public.warranty_terms(store_id,device_id) where kind='Fornecedor';
create unique index warranty_terms_shop_unique on public.warranty_terms(store_id,sale_item_id) where kind='Loja' and sale_item_id is not null;
create unique index warranty_terms_shop_preset_unique on public.warranty_terms(store_id,device_id) where kind='Loja' and sale_item_id is null;
create index warranty_terms_sale_item_idx on public.warranty_terms(sale_item_id) where sale_item_id is not null;
alter table public.warranty_terms enable row level security;
revoke all on public.warranty_terms from public,anon,authenticated;
grant select,insert,update on public.warranty_terms to authenticated;
create policy warranty_terms_read on public.warranty_terms for select to authenticated using(public.can_access(store_id));
create policy warranty_terms_insert on public.warranty_terms for insert to authenticated with check(public.can_access(store_id,array['admin','gerente']));
create policy warranty_terms_update on public.warranty_terms for update to authenticated using(public.can_access(store_id,array['admin','gerente'])) with check(public.can_access(store_id,array['admin','gerente']));

create function public.validate_warranty_terms() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if auth.uid() is null or not public.can_access(new.store_id,array['admin','gerente']) then raise exception 'Sem permissão para cadastrar garantias.';end if;
 if tg_op='UPDATE' then
  if (new.id,new.store_id,new.device_id,new.sale_item_id,new.kind) is distinct from (old.id,old.store_id,old.device_id,old.sale_item_id,old.kind) then raise exception 'O vínculo da garantia não pode ser alterado.';end if;
  new.created_at:=old.created_at;new.created_by:=old.created_by;
 else new.created_at:=now();new.created_by:=auth.uid();end if;
 if new.kind='Loja' and new.sale_item_id is null and not exists(select 1 from public.devices where id=new.device_id and store_id=new.store_id and status<>'Vendido') then raise exception 'Informe a venda para alterar a garantia de um produto vendido.';end if;
 if new.kind='Loja' and new.sale_item_id is not null and not exists(select 1 from public.sale_items i join public.sales s on s.id=i.sale_id and s.store_id=i.store_id where i.id=new.sale_item_id and i.store_id=new.store_id and i.device_id=new.device_id and s.status='Ativa') then raise exception 'Selecione um produto de uma venda ativa desta loja.';end if;
 new.updated_at:=now();new.updated_by:=auth.uid();
 return new;
end $$;
revoke all on function public.validate_warranty_terms() from public,anon,authenticated;
create trigger validate_warranty_terms before insert or update on public.warranty_terms for each row execute function public.validate_warranty_terms();
create trigger audit_changes after insert or update on public.warranty_terms for each row execute function ultra_private.record_audit();

create function public.save_warranty_terms(p_store uuid,p_device uuid,p_sale_item uuid,p_supplier jsonb,p_shop jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare term jsonb; kind_value text; i int;
begin
 if not public.can_access(p_store,array['admin','gerente']) then raise exception 'Sem permissão para cadastrar garantias.';end if;
 if not exists(select 1 from public.devices where id=p_device and store_id=p_store) then raise exception 'Produto não encontrado nesta loja.';end if;
 for i in 1..2 loop
  term:=case when i=1 then p_supplier else p_shop end;
  kind_value:=case when i=1 then 'Fornecedor' else 'Loja' end;
  if term is null then continue;end if;
  if jsonb_typeof(term)<>'object' or ((kind_value='Fornecedor' or p_sale_item is not null) and nullif(term->>'start_date','') is null) or nullif(term->>'days','') is null then raise exception 'Informe o início e o prazo em dias de cada garantia selecionada.';end if;
  if kind_value='Fornecedor' then
   insert into public.warranty_terms(store_id,device_id,kind,provider,start_date,days,notes)
   values(p_store,p_device,'Fornecedor',trim(coalesce(term->>'provider','')),(term->>'start_date')::date,(term->>'days')::int,trim(coalesce(term->>'notes','')))
   on conflict(store_id,device_id) where kind='Fornecedor' do update set provider=excluded.provider,start_date=excluded.start_date,days=excluded.days,notes=excluded.notes;
  elsif p_sale_item is null then
   if not exists(select 1 from public.devices where id=p_device and store_id=p_store and status<>'Vendido') then raise exception 'Informe a venda para cadastrar a garantia da loja deste produto.';end if;
   perform set_config('ultra.transaction','yes',true);
   update public.devices set warranty_days=(term->>'days')::int where id=p_device and store_id=p_store;
   insert into public.warranty_terms(store_id,device_id,kind,provider,start_date,days,notes) values(p_store,p_device,'Loja',trim(coalesce(term->>'provider','')),null,(term->>'days')::int,trim(coalesce(term->>'notes','')))
   on conflict(store_id,device_id) where kind='Loja' and sale_item_id is null do update set provider=excluded.provider,days=excluded.days,notes=excluded.notes;
  else
   insert into public.warranty_terms(store_id,device_id,sale_item_id,kind,provider,start_date,days,notes)
   values(p_store,p_device,p_sale_item,'Loja',trim(coalesce(term->>'provider','')),(term->>'start_date')::date,(term->>'days')::int,trim(coalesce(term->>'notes','')))
   on conflict(store_id,sale_item_id) where kind='Loja' and sale_item_id is not null do update set provider=excluded.provider,start_date=excluded.start_date,days=excluded.days,notes=excluded.notes;
  end if;
 end loop;
end $$;
revoke all on function public.save_warranty_terms(uuid,uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.save_warranty_terms(uuid,uuid,uuid,jsonb,jsonb) to authenticated;
