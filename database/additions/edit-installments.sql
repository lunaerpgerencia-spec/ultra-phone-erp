-- Replaces the payment schedule without changing the sale price or receipts.
create function public.revise_installments(p_sale uuid,p_plan jsonb,p_expected jsonb,p_reason text) returns void language plpgsql security invoker set search_path='' as $$
declare s public.sales; x public.installments; r jsonb; actual jsonb; original bigint; proposed bigint; paid bigint; n int:=0; next_number int;
begin
 perform set_config('ultra.transaction','yes',true);
 select * into s from public.sales where id=p_sale for update;
 if s.id is null or not public.can_access(s.store_id,array['admin','gerente','financeiro']) then raise exception 'Sem permissão para editar parcelas.';end if;
 if s.status<>'Ativa' then raise exception 'A venda está cancelada.';end if;
 if p_reason is null or length(trim(p_reason))<5 then raise exception 'Informe o motivo da alteração (mínimo 5 letras).';end if;
 if p_plan is null or jsonb_typeof(p_plan)<>'array' or jsonb_array_length(p_plan)<1 or jsonb_array_length(p_plan)>36 then raise exception 'Mantenha entre 1 e 36 parcelas.';end if;
 perform 1 from public.installments where sale_id=s.id order by id for update;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'amount_cents',amount_cents,'due_date',due_date) order by id),'[]'::jsonb),coalesce(sum(amount_cents),0) into actual,original from public.installments where sale_id=s.id and not canceled;
 if actual is distinct from p_expected then raise exception 'As parcelas mudaram. Feche, atualize a tela e abra novamente.';end if;
 select sum((v->>'amount_cents')::bigint) into proposed from jsonb_array_elements(p_plan) v;
 if proposed is distinct from original then raise exception 'A soma das parcelas deve continuar igual ao total original. Use Distribuir saldo.';end if;
 if exists(select 1 from jsonb_array_elements(p_plan) v where (v->>'amount_cents') is null or (v->>'amount_cents')::bigint<=0 or (v->>'due_date') is null) then raise exception 'Preencha valor e vencimento de todas as parcelas.';end if;
 if (select count(*) from jsonb_array_elements(p_plan) v where nullif(v->>'id','') is not null)<>(select count(distinct v->>'id') from jsonb_array_elements(p_plan) v where nullif(v->>'id','') is not null) then raise exception 'Parcela repetida.';end if;
 for r in select value from jsonb_array_elements(p_plan) loop
  if nullif(r->>'id','') is not null then
   select * into x from public.installments where id=(r->>'id')::uuid and sale_id=s.id and not canceled;
   if x.id is null then raise exception 'Parcela inválida.';end if;
   select coalesce(sum(amount_cents),0) into paid from public.receipts where installment_id=x.id;
   if (r->>'amount_cents')::bigint<paid then raise exception 'O valor não pode ser menor que o já recebido.';end if;
  end if;
 end loop;
 for x in select * from public.installments where sale_id=s.id and not canceled loop
  if not exists(select 1 from jsonb_array_elements(p_plan) v where v->>'id'=x.id::text) then
   if exists(select 1 from public.receipts where installment_id=x.id) then raise exception 'Não exclua parcela com recebimento. Edite o saldo ou estorne a venda.';end if;
   update public.installments set canceled=true where id=x.id;
  end if;
 end loop;
 select coalesce(max(number),0) into next_number from public.installments where sale_id=s.id;
 for r in select value from jsonb_array_elements(p_plan) loop
  n:=n+1;
  if nullif(r->>'id','') is not null then
   update public.installments set due_date=(r->>'due_date')::date,amount_cents=(r->>'amount_cents')::bigint where id=(r->>'id')::uuid and sale_id=s.id;
  else
   next_number:=next_number+1;
   insert into public.installments(store_id,sale_id,number,due_date,amount_cents) values(s.store_id,s.id,next_number,(r->>'due_date')::date,(r->>'amount_cents')::bigint);
  end if;
 end loop;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='sales' and column_name='payment_count') then execute 'update public.sales set payment_count=$1 where id=$2' using n,s.id;end if;
 update public.sales set notes=notes||E'\nAlteração de parcelas: '||trim(p_reason) where id=s.id;
end $$;
revoke all on function public.revise_installments(uuid,jsonb,jsonb,text) from public,anon;
grant execute on function public.revise_installments(uuid,jsonb,jsonb,text) to authenticated;
