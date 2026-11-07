import type {DataSet,Row} from './data';
import type {ReportRange} from './period-report';
const reportDay=(value:unknown)=>{const raw=String(value||'');if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;const d=new Date(raw);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(d):''};
export function retailResult(data:DataSet,range:ReportRange,seller='',method=''){
 const inside=(v:unknown)=>{const d=reportDay(v);return d>=range.start&&d<=range.end};
 const sales=(data.sales||[]).filter(s=>s.status==='Ativa'&&inside(s.created_at)&&(!seller||s.seller_label===seller)&&(!method||s.payment_method===method||(data.retail_payments||[]).some(p=>p.sale_id===s.id&&p.method===method)));
 const ids=new Set(sales.map(s=>s.id)),allActive=new Set((data.sales||[]).filter(s=>(!seller||s.seller_label===seller)).map(s=>s.id));
 const payments=(data.retail_payments||[]),pids=new Set(payments.map(p=>p.id)),receipts=data.receipts||[];
 const reversed=new Set(receipts.filter(r=>r.reversal_of).map(r=>r.reversal_of));
 const receivedLegacy=receipts.filter(r=>!pids.has(r.id)&&!pids.has(r.reversal_of)&&r.method!=='Programa de indicação'&&receipts.find(o=>o.id===r.reversal_of)?.method!=='Programa de indicação'&&inside(r.created_at)&&(!seller||allActive.has(r.sale_id))&&(!method||r.method===method||receipts.find(o=>o.id===r.reversal_of)?.method===method)).reduce((n,r)=>n+Number(r.amount_cents),0);
 const receivedRetail=payments.filter(p=>p.settled_date&&inside(p.settled_date)&&(!seller||allActive.has(p.sale_id))&&(!method||p.method===method)).reduce((n,p)=>n+Number(p.net_cents),0)-receipts.filter(r=>pids.has(r.reversal_of)&&inside(r.created_at)&&(!seller||allActive.has(r.sale_id))).reduce((n,r)=>n+(payments.find(p=>p.id===r.reversal_of)?.settled_date?Number(payments.find(p=>p.id===r.reversal_of)?.net_cents):0),0);
 const expenses=(data.work_expenses||[]).filter(e=>!e.deleted&&inside(e.expense_date)&&(!seller||e.responsible===seller||ids.has(e.sale_id))&&(!method||e.method===method));
 const sum=(rows:Row[],key:string)=>rows.reduce((n,r)=>n+Number(r[key]||0),0);
 const items=(data.sale_items||[]).filter(i=>ids.has(i.sale_id));
 const sold=sum(sales,'total_cents'),cost=sum(items,'cost_cents'),fees=payments.filter(p=>ids.has(p.sale_id)).reduce((n,p)=>n+Number(p.gross_cents)-Number(p.net_cents),0),saleExpenses=sum(expenses.filter(e=>e.sale_id),'amount_cents'),dayCosts=sum(expenses.filter(e=>!e.sale_id),'amount_cents');
 const customerPending=sales.reduce((n,s)=>n+Math.max(0,Number(s.total_cents)-sum(receipts.filter(r=>r.sale_id===s.id),'amount_cents')-Number(s.trade_value_cents||0)),0);
 const cardPending=sum(payments.filter(p=>ids.has(p.sale_id)&&!p.settled_date&&!reversed.has(p.id)),'net_cents');
 return {sold,cost,fees,saleExpenses,dayCosts,profit:sold-cost-fees-saleExpenses-dayCosts,received:receivedLegacy+receivedRetail,pending:customerPending+cardPending,cardPending,customerPending,incomplete:items.some(i=>i.cost_cents==null)||sales.some(s=>!items.some(i=>i.sale_id===s.id)),sales,expenses};
}

export function filterRetailReport(data:DataSet,seller:string,method:string):DataSet{
 if(!seller&&!method)return data;
 const sales=(data.sales||[]).filter(s=>(!seller||s.seller_label===seller)&&(!method||s.payment_method===method||(data.receipts||[]).some(r=>r.sale_id===s.id&&r.method===method)));
 const ids=new Set(sales.map(s=>s.id));return {...data,report_filters:[{seller,method}],sales,sale_items:(data.sale_items||[]).filter(i=>ids.has(i.sale_id)),receipts:data.receipts.filter(r=>ids.has(r.sale_id)&&(!method||r.method===method||data.receipts.find(o=>o.id===r.reversal_of)?.method===method)),retail_payments:(data.retail_payments||[]).filter(p=>ids.has(p.sale_id)&&(!method||p.method===method)),work_expenses:(data.work_expenses||[]).filter(e=>(!seller||ids.has(e.sale_id)||e.responsible===seller)&&(!method||e.method===method)),ledger:data.ledger.filter(l=>(!seller||data.receipts.some(r=>r.id===l.receipt_id&&ids.has(r.sale_id)))&&(!method||l.method===method)),purchases:seller||method?[]:data.purchases};
}
