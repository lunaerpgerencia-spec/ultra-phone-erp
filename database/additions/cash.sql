-- Additive module: existing sales, stock and ledger remain unchanged.
create table public.cash_sessions (
 id uuid primary key default gen_random_uuid(),store_id uuid not null references public.stores(id),
 operator_id uuid not null default auth.uid() references auth.users(id),operator_label text not null,
 opened_at timestamptz not null default now(),closed_at timestamptz,
 opening_cents bigint not null check(opening_cents>=0),counted_cents bigint check(counted_cents>=0),
 expected_cents bigint,notes text not null default '',unique(store_id,id),
 check((closed_at is null and counted_cents is null and expected_cents is null) or (closed_at is not null and counted_cents is not null and expected_cents is not null))
);
create unique index cash_one_open_per_operator on public.cash_sessions(store_id,operator_id) where closed_at is null;
create index cash_store_opened on public.cash_sessions(store_id,opened_at);
create table public.cash_events (
 id uuid primary key default gen_random_uuid(),store_id uuid not null,session_id uuid not null,
 kind text not null check(kind in ('Suprimento','Sangria')),amount_cents bigint not null check(amount_cents>0),
 reason text not null check(length(trim(reason))>=3),created_at timestamptz not null default now(),
 foreign key(store_id,session_id) references public.cash_sessions(store_id,id)
);
create index cash_events_session on public.cash_events(session_id);
alter table public.cash_sessions enable row level security;
alter table public.cash_events enable row level security;
create policy cash_read on public.cash_sessions for select to authenticated using(public.can_access(store_id,array['admin','gerente','financeiro']) or (operator_id=(select auth.uid()) and public.can_access(store_id,array['vendedor'])));
create policy cash_open on public.cash_sessions for insert to authenticated with check(operator_id=(select auth.uid()) and public.can_access(store_id,array['admin','gerente','financeiro','vendedor']));
create policy cash_close on public.cash_sessions for update to authenticated using(operator_id=(select auth.uid()) and public.can_access(store_id,array['admin','gerente','financeiro','vendedor'])) with check(operator_id=(select auth.uid()) and public.can_access(store_id,array['admin','gerente','financeiro','vendedor']));
create policy cash_event_read on public.cash_events for select to authenticated using(exists(select 1 from public.cash_sessions s where s.id=session_id));
create policy cash_event_insert on public.cash_events for insert to authenticated with check(exists(select 1 from public.cash_sessions s where s.id=session_id and s.store_id=cash_events.store_id and s.operator_id=(select auth.uid()) and s.closed_at is null));
create function public.guard_cash_session() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='INSERT' then
  if new.operator_id is distinct from auth.uid() or new.closed_at is not null then raise exception 'Abertura inválida.';end if;
  new.opened_at:=clock_timestamp();new.counted_cents:=null;new.expected_cents:=null;
 else
  if old.closed_at is not null or new.closed_at is null or new.counted_cents is null then raise exception 'Caixa fechado ou fechamento inválido.';end if;
  if (new.id,new.store_id,new.operator_id,new.opening_cents,new.opened_at,new.operator_label) is distinct from (old.id,old.store_id,old.operator_id,old.opening_cents,old.opened_at,old.operator_label) then raise exception 'Preserve os dados da abertura.';end if;
  new.closed_at:=clock_timestamp();
  select old.opening_cents+coalesce((select sum(l.amount_cents) from public.ledger l where l.store_id=old.store_id and l.created_by=old.operator_id and (l.method='Dinheiro' or (l.method='Estorno' and exists(select 1 from public.receipts r join public.receipts original on original.id=r.reversal_of where r.id=l.receipt_id and original.method='Dinheiro'))) and l.created_at>=old.opened_at and l.created_at<new.closed_at),0)+coalesce((select sum(case when e.kind='Suprimento' then e.amount_cents else -e.amount_cents end) from public.cash_events e where e.session_id=old.id),0) into new.expected_cents;
 end if;return new;
end $$;
create trigger cash_session_guard before insert or update on public.cash_sessions for each row execute function public.guard_cash_session();
create function public.guard_cash_event() returns trigger language plpgsql security invoker set search_path='' as $$
declare s public.cash_sessions;
begin
 select * into s from public.cash_sessions where id=new.session_id and store_id=new.store_id for update;
 if s.id is null or s.closed_at is not null or s.operator_id is distinct from auth.uid() then raise exception 'Abra seu caixa antes de movimentar.';end if;
 new.created_at:=clock_timestamp();return new;
end $$;
create trigger cash_event_guard before insert on public.cash_events for each row execute function public.guard_cash_event();
revoke all on public.cash_sessions,public.cash_events from anon,authenticated;
grant select,insert on public.cash_sessions,public.cash_events to authenticated;
grant update(closed_at,counted_cents,notes) on public.cash_sessions to authenticated;
revoke all on function public.guard_cash_session(),public.guard_cash_event() from public,anon;
-- Cashier sales must be included in their own drawer reconciliation.
create policy cashier_own_cash on public.ledger for select to authenticated using(created_by=(select auth.uid()) and (method='Dinheiro' or (method='Estorno' and exists(select 1 from public.receipts r join public.receipts original on original.id=r.reversal_of where r.id=ledger.receipt_id and original.method='Dinheiro'))) and public.can_access(store_id,array['vendedor']));
