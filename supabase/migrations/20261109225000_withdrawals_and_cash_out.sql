create table public.withdrawals(id uuid primary key,store_id uuid not null references public.stores(id),withdrawal_date date not null,amount_cents bigint not null check(amount_cents>0),kind text not null check(kind in ('Sangria','Retirada')),method text not null check(method in ('Dinheiro','PIX','Transferência')),account_label text not null,destination text not null,recipient text not null default '',reason text not null,reference text not null default '',notes text not null default '',ledger_id uuid not null unique references public.ledger(id),cash_session_id uuid references public.cash_sessions(id),created_by uuid not null default auth.uid(),created_at timestamptz not null default now(),check((kind='Sangria' and method='Dinheiro' and account_label='Caixa físico' and cash_session_id is not null) or (kind='Retirada' and method in ('PIX','Transferência') and account_label<>'Caixa físico' and cash_session_id is null)));
create index withdrawals_store_date on public.withdrawals(store_id,withdrawal_date desc);
alter table public.withdrawals enable row level security;
revoke all on public.withdrawals from public,anon,authenticated;
grant select,insert on public.withdrawals to authenticated;
create policy withdrawal_read on public.withdrawals for select to authenticated using(public.can_access(store_id,array['admin','gerente','financeiro']));
create policy withdrawal_insert on public.withdrawals for insert to authenticated with check(public.can_access(store_id,array['admin','gerente','financeiro']) and created_by=auth.uid() and current_setting('ultra.withdrawal',true)='yes');
create function public.record_withdrawal(p_store uuid,p_id uuid,p_data jsonb) returns uuid language plpgsql security invoker set search_path='' as $$
declare v_amount bigint;v_date date;v_method text;v_kind text;v_account text;v_destination text;v_reason text;v_session uuid;v_ledger uuid;v_balance bigint;
begin
 if p_id is null or not public.can_access(p_store,array['admin','gerente','financeiro']) then raise exception 'Sem permissão.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 if exists(select 1 from public.withdrawals where id=p_id and store_id=p_store) then return p_id;end if;
 v_amount:=nullif(p_data->>'amount_cents','')::bigint;v_date:=nullif(p_data->>'withdrawal_date','')::date;v_method:=p_data->>'method';v_kind:=case when v_method='Dinheiro' then 'Sangria' else 'Retirada' end;v_account:=trim(coalesce(p_data->>'account_label',''));v_destination:=trim(coalesce(p_data->>'destination',''));v_reason:=trim(coalesce(p_data->>'reason',''));
 if v_amount is null or v_amount<=0 or v_date is null or v_date>(now() at time zone 'America/Sao_Paulo')::date or v_method is null or v_method not in ('Dinheiro','PIX','Transferência') or length(v_account)<2 or length(v_destination)<2 or length(v_reason)<3 then raise exception 'Confira valor, data, origem, destino e motivo.';end if;
 if v_method='Dinheiro' then
  if v_account<>'Caixa físico' then raise exception 'Sangria deve sair do Caixa físico.';end if;
  select id into v_session from public.cash_sessions where store_id=p_store and operator_id=auth.uid() and closed_at is null for update;
  if v_session is null then raise exception 'Abra o caixa antes de fazer sangria.';end if;
  if v_date<>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Sangria do caixa aberto deve ser registrada hoje.';end if;
  select s.opening_cents+coalesce((select sum(l.amount_cents) from public.ledger l where l.store_id=p_store and l.created_by=auth.uid() and (l.method='Dinheiro' or (l.method='Estorno' and exists(select 1 from public.receipts r join public.receipts o on o.id=r.reversal_of where r.id=l.receipt_id and o.method='Dinheiro'))) and (l.account_label is null or l.account_label='Caixa físico') and (l.cash_session_id=v_session or (l.cash_session_id is null and l.created_at>=s.opened_at)) and l.created_at>=s.opened_at),0)+coalesce((select sum(case when e.kind='Suprimento' then e.amount_cents else -e.amount_cents end) from public.cash_events e where e.session_id=v_session),0) into v_balance from public.cash_sessions s where s.id=v_session;
  if v_balance<v_amount then raise exception 'Sangria maior que saldo esperado do caixa.';end if;
 else if v_account='Caixa físico' then raise exception 'Informe a conta bancária de origem.';end if;end if;
 perform set_config('ultra.transaction','yes',true);perform set_config('ultra.withdrawal','yes',true);
 insert into public.ledger(store_id,amount_cents,description,method,account_label,cash_session_id) values(p_store,-v_amount,'Retirada: '||v_reason||' · Destino: '||v_destination,v_method,v_account,v_session) returning id into v_ledger;
 insert into public.withdrawals(id,store_id,withdrawal_date,amount_cents,kind,method,account_label,destination,recipient,reason,reference,notes,ledger_id,cash_session_id) values(p_id,p_store,v_date,v_amount,v_kind,v_method,v_account,v_destination,trim(coalesce(p_data->>'recipient','')),v_reason,trim(coalesce(p_data->>'reference','')),trim(coalesce(p_data->>'notes','')),v_ledger,v_session);
 return p_id;
end $$;
revoke all on function public.record_withdrawal(uuid,uuid,jsonb) from public,anon;
grant execute on function public.record_withdrawal(uuid,uuid,jsonb) to authenticated;
create trigger audit_changes after insert on public.withdrawals for each row execute function ultra_private.record_audit();