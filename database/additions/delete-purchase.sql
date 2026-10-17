-- Allows removing only an unpaid intake with no sale or service history.
create function public.delete_pending_purchase(p_purchase uuid) returns void language plpgsql security invoker set search_path='' as $$
declare p public.purchases;d public.devices;
begin
 select * into p from public.purchases where id=p_purchase;
 if p.id is null or not public.can_access(p.store_id,array['admin','gerente']) then raise exception 'Compra não encontrada ou sem permissão para excluir.';end if;
 perform set_config('ultra.transaction','yes',true);
 select * into d from public.devices where id=p.device_id and store_id=p.store_id for update;
 select * into p from public.purchases where id=p_purchase for update;
 if p.id is null then raise exception 'A compra já foi excluída.';end if;
 if p.paid or exists(select 1 from public.ledger where purchase_id=p.id) then raise exception 'Esta compra tem pagamento registrado. Preserve o histórico e faça o estorno antes de corrigir a entrada.';end if;
 if d.id is null or d.status<>'Disponível' or exists(select 1 from public.sale_items where device_id=d.id and store_id=d.store_id) or exists(select 1 from public.service_orders where device_id=d.id and store_id=d.store_id) then raise exception 'O aparelho possui histórico de venda ou assistência. A entrada não pode ser excluída.';end if;
 if exists(select 1 from public.purchases where device_id=d.id and id<>p.id) then raise exception 'Existe outra compra vinculada ao aparelho.';end if;
 perform set_config('ultra.delete_purchase',p.id::text,true);perform set_config('ultra.delete_device',d.id::text,true);
 delete from public.purchases where id=p.id;delete from public.devices where id=d.id;
end $$;
revoke all on function public.delete_pending_purchase(uuid) from public,anon;
grant execute on function public.delete_pending_purchase(uuid) to authenticated;
create policy remove_pending_purchase on public.purchases for delete to authenticated using(public.can_access(store_id,array['admin','gerente']) and id::text=current_setting('ultra.delete_purchase',true));
create policy remove_unused_device on public.devices for delete to authenticated using(public.can_access(store_id,array['admin','gerente']) and id::text=current_setting('ultra.delete_device',true));
grant delete on public.purchases,public.devices to authenticated;
create function ultra_private.audit_purchase_removal() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.can_access(old.store_id,array['admin','gerente']) then raise exception 'Sem permissão para excluir.';end if;
 insert into public.audit_events(store_id,actor_id,entity,entity_id,operation,before_data,after_data) values(old.store_id,auth.uid(),TG_TABLE_NAME,old.id,'DELETE',to_jsonb(old),null);
 return old;
end $$;
revoke all on function ultra_private.audit_purchase_removal() from public,anon,authenticated;
create trigger audit_removal after delete on public.purchases for each row execute function ultra_private.audit_purchase_removal();
create trigger audit_removal after delete on public.devices for each row execute function ultra_private.audit_purchase_removal();
