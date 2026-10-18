import type {Row,DataSet} from './data';
export const saleEditKeys=['customer_id','subtotal_cents','discount_cents','status','notes','payment_method','payment_count','interest_percent','interest_cents','entry_method','customer_snapshot','installment_period','edit_version','trade_device','trade_imei','trade_value_cents'] as const;
export function saleEditState(sale:Row,data:DataSet){
 const sorted=(rows:Row[])=>rows.slice().sort((a,b)=>a.id.localeCompare(b.id));
 return {sale:Object.fromEntries(saleEditKeys.map(k=>[k,sale[k]??(k==='edit_version'||k==='trade_value_cents'?0:k==='trade_device'||k==='trade_imei'?'':null)])),installments:sorted(data.installments.filter(p=>p.sale_id===sale.id)).map(p=>({id:p.id,amount_cents:Number(p.amount_cents),due_date:p.due_date,canceled:p.canceled,number:p.number})),receipts:sorted(data.receipts.filter(r=>r.sale_id===sale.id)).map(r=>({id:r.id,amount_cents:Number(r.amount_cents),installment_id:r.installment_id,reversal_of:r.reversal_of,method:r.method}))};
}
