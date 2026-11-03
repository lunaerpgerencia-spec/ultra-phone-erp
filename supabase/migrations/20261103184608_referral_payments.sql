-- Referral credit settles installments without moving cash. Existing records are preserved.
ALTER TABLE public.receipts DROP CONSTRAINT receipts_method_check;
ALTER TABLE public.receipts ADD CONSTRAINT receipts_method_check CHECK(method IN ('PIX','Dinheiro','Débito','Crédito','Transferência','Estorno','Programa de indicação'));
CREATE OR REPLACE FUNCTION public.cancel_sale(p_sale uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare s public.sales; r public.receipts; rid uuid; begin perform set_config('ultra.transaction','yes',true); select * into s from public.sales where id=p_sale for update; if s.id is null or not public.can_access(s.store_id,array['admin','gerente']) then raise exception 'Sem permissão para cancelar.'; end if; if s.status='Cancelada' then return; end if; if length(trim(p_reason))<5 then raise exception 'Informe o motivo do cancelamento.'; end if;
-- Lock installments in the same order as receiving before touching receipts.
perform 1 from public.installments where sale_id=s.id order by id for update;
perform set_config('ultra.transaction','yes',true); for r in select * from public.receipts where sale_id=s.id and amount_cents>0 and not exists(select 1 from public.receipts rr where rr.reversal_of=receipts.id) loop insert into public.receipts(store_id,sale_id,installment_id,amount_cents,method,reversal_of) values(s.store_id,s.id,r.installment_id,-r.amount_cents,'Estorno',r.id) returning id into rid; if r.method<>'Programa de indicação' then insert into public.ledger(store_id,amount_cents,description,receipt_id,method) values(s.store_id,-r.amount_cents,'Cancelamento: '||p_reason,rid,'Estorno'); end if; end loop;
update public.installments set canceled=true where sale_id=s.id; update public.devices set status='Disponível' where store_id=s.store_id and id in(select device_id from public.sale_items where sale_id=s.id); update public.sales set status='Cancelada',notes=notes||E'\nCancelamento: '||p_reason where id=s.id; end $function$
;
CREATE OR REPLACE FUNCTION public.receive_installment(p_installment uuid, p_amount bigint, p_method text, p_request uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$ declare x public.installments; paid bigint; begin perform set_config('ultra.transaction','yes',true); select * into x from public.installments where id=p_installment for update; if x.id is null or not public.can_access(x.store_id,array['admin','gerente','financeiro']) then raise exception 'Parcela não encontrada ou sem permissão.'; end if; if exists(select 1 from public.receipts where id=p_request and store_id=x.store_id) then return p_request; end if; if x.canceled or not exists(select 1 from public.sales where id=x.sale_id and status='Ativa') then raise exception 'Venda cancelada.'; end if; select coalesce(sum(amount_cents),0) into paid from public.receipts where installment_id=x.id; if p_amount is null or p_amount<=0 or p_amount>x.amount_cents-paid then raise exception 'Valor superior ao saldo ou inválido.'; end if; if p_method is null or p_method not in ('PIX','Dinheiro','Débito','Crédito','Transferência','Programa de indicação') then raise exception 'Forma de pagamento inválida.'; end if; perform set_config('ultra.transaction','yes',true); insert into public.receipts(id,store_id,sale_id,installment_id,amount_cents,method) values(p_request,x.store_id,x.sale_id,x.id,p_amount,p_method); if p_method<>'Programa de indicação' then insert into public.ledger(store_id,amount_cents,description,receipt_id,method) values(x.store_id,p_amount,'Recebimento de parcela',p_request,p_method); end if; return p_request; end $function$
;
REVOKE ALL ON FUNCTION public.receive_installment(uuid,bigint,text,uuid),public.cancel_sale(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.receive_installment(uuid,bigint,text,uuid),public.cancel_sale(uuid,text) TO authenticated;
