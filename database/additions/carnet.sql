-- Add fields and signed copies without replacing any sale, receipt or stock data.
alter table public.customers add column rg text not null default '';
alter table public.sales add column customer_snapshot jsonb;
create function public.ultra_valid_cpf(v text) returns boolean language plpgsql immutable set search_path='' as $$
declare n int;i int;size int;d int;
begin
 if v is null or v !~ '^[0-9]{11}$' or v=repeat(left(v,1),11) then return false;end if;
 for size in 9..10 loop n:=0;for i in 1..size loop n:=n+substring(v,i,1)::int*(size+2-i);end loop;d:=((n*10)%11)%10;if d<>substring(v,size+1,1)::int then return false;end if;end loop;return true;
end $$;
create function public.make_sale_v3(p_store uuid,p_customer uuid,p_devices uuid[],p_discount bigint,p_entry bigint,p_count int,p_first_due date,p_method text,p_notes text,p_request uuid,p_interest numeric,p_entry_method text) returns uuid language plpgsql security invoker set search_path='' as $$
declare buyer public.customers;sid uuid;
begin
 if not public.can_access(p_store,array['admin','gerente','vendedor']) then raise exception 'Sem permissão para vender.';end if;
 if exists(select 1 from public.sales where id=p_request and store_id=p_store) then return p_request;end if;
 select * into buyer from public.customers where id=p_customer and store_id=p_store for share;
 if buyer.id is null or not buyer.active then raise exception 'Selecione um cliente ativo.';end if;
 if p_method='Carnê' and (length(trim(buyer.name))<2 or length(regexp_replace(buyer.phone,'[^0-9]','','g'))<10 or length(trim(buyer.address))<5 or not public.ultra_valid_cpf(buyer.document) or length(trim(buyer.rg))<3) then raise exception 'Carnê exige nome, telefone, endereço, CPF e RG completos no cadastro do cliente.';end if;
 sid:=public.make_sale_v2(p_store,p_customer,p_devices,p_discount,p_entry,p_count,p_first_due,p_method,p_notes,p_request,p_interest,p_entry_method);
 update public.sales set customer_snapshot=jsonb_build_object('name',buyer.name,'document',buyer.document,'rg',buyer.rg,'phone',buyer.phone,'email',buyer.email,'address',buyer.address) where id=sid and customer_snapshot is null;
 return sid;
end $$;
revoke all on function public.make_sale_v3(uuid,uuid,uuid[],bigint,bigint,int,date,text,text,uuid,numeric,text) from public,anon;
grant execute on function public.make_sale_v3(uuid,uuid,uuid[],bigint,bigint,int,date,text,text,uuid,numeric,text) to authenticated;
create table public.signed_documents(
 id uuid primary key default gen_random_uuid(),store_id uuid not null,sale_id uuid not null,installment_id uuid,
 kind text not null check(kind in ('Contrato','Promissória')),file_name text not null,object_path text not null unique,
 created_at timestamptz not null default now(),created_by uuid not null default auth.uid() references auth.users(id),
 foreign key(store_id,sale_id) references public.sales(store_id,id),foreign key(store_id,installment_id) references public.installments(store_id,id),
 check((kind='Contrato' and installment_id is null) or (kind='Promissória' and installment_id is not null))
);
create index signed_documents_sale on public.signed_documents(store_id,sale_id);
alter table public.signed_documents enable row level security;
create policy signed_docs_read on public.signed_documents for select to authenticated using(public.can_access(store_id,array['admin','gerente','vendedor','financeiro']));
create policy signed_docs_insert on public.signed_documents for insert to authenticated with check(created_by=(select auth.uid()) and public.can_access(store_id,array['admin','gerente','vendedor','financeiro']) and split_part(object_path,'/',1)=store_id::text and split_part(object_path,'/',2)=sale_id::text and split_part(object_path,'/',3)=coalesce(installment_id::text,'contract') and (installment_id is null or exists(select 1 from public.installments i where i.id=installment_id and i.sale_id=signed_documents.sale_id)) and exists(select 1 from storage.objects o where o.bucket_id='ultra-signed-documents' and o.name=object_path));
revoke all on public.signed_documents from anon,authenticated;
grant select,insert on public.signed_documents to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('ultra-signed-documents','ultra-signed-documents',false,10485760,array['application/pdf','image/jpeg','image/png']);
create policy ultra_signed_upload on storage.objects for insert to authenticated with check(bucket_id='ultra-signed-documents' and exists(select 1 from public.sales s where s.id::text=(storage.foldername(name))[2] and s.store_id::text=(storage.foldername(name))[1] and public.can_access(s.store_id,array['admin','gerente','vendedor','financeiro']) and ((storage.foldername(name))[3]='contract' or exists(select 1 from public.installments i where i.sale_id=s.id and i.id::text=(storage.foldername(name))[3]))));
create policy ultra_signed_read on storage.objects for select to authenticated using(bucket_id='ultra-signed-documents' and exists(select 1 from public.sales s where s.id::text=(storage.foldername(name))[2] and s.store_id::text=(storage.foldername(name))[1] and public.can_access(s.store_id,array['admin','gerente','vendedor','financeiro'])));
