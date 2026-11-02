import type {DataSet,Row} from './data';
export type ScheduleRow={id:string;installmentId?:string;kind:'entry'|'installment'|'trade';label:string;date:string;amount:number;paid:number;balance:number;status:'paid'|'partial'|'late'|'pending'|'trade'};
export type PaymentSchedule={saleId:string;number:string;customerId:string;customerName:string;phone:string;product:string;total:number;received:number;trade:number;balance:number;paymentCount:number;paidCount:number;rows:ScheduleRow[]};
const localDate=(value:unknown)=>{const raw=String(value||'');if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;const date=new Date(raw);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date):''};
export function paymentSchedule(data:DataSet,sale:Row,today:string):PaymentSchedule|null{
 if(sale.status!=='Ativa')return null;
 const customer=data.customers.find(c=>c.id===sale.customer_id)||sale.customer_snapshot||{};
 const receipts=data.receipts.filter(r=>r.sale_id===sale.id&&(!r.store_id||!sale.store_id||r.store_id===sale.store_id));
 const rows:ScheduleRow[]=[];
 for(const r of receipts.filter(r=>!r.installment_id&&Number(r.amount_cents)>0)){
  const net=Number(r.amount_cents)+receipts.filter(x=>x.reversal_of===r.id).reduce((n,x)=>n+Number(x.amount_cents),0);
  if(net>0)rows.push({id:'entry-'+r.id,kind:'entry',label:'Entrada / pagamento inicial',date:localDate(r.created_at),amount:net,paid:net,balance:0,status:'paid'});
 }
 for(const p of data.installments.filter(p=>p.sale_id===sale.id&&!p.canceled&&(!p.store_id||!sale.store_id||p.store_id===sale.store_id))){
  const amount=Number(p.amount_cents),paid=Math.max(0,receipts.filter(r=>r.installment_id===p.id).reduce((n,r)=>n+Number(r.amount_cents),0));
  const balance=Math.max(0,amount-paid),date=String(p.due_date).slice(0,10);
  rows.push({id:p.id,installmentId:p.id,kind:'installment',label:'Parcela '+p.number,date,amount,paid,balance,status:balance===0?'paid':paid>0?'partial':date<today?'late':'pending'});
 }
 const trade=Math.max(0,Number(sale.trade_value_cents||0));
 if(trade>0)rows.push({id:'trade-'+sale.id,kind:'trade',label:'Aparelho na troca (abatimento)',date:localDate(sale.created_at),amount:trade,paid:0,balance:0,status:'trade'});
 rows.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 const total=Number(sale.total_cents),received=receipts.reduce((n,r)=>n+Number(r.amount_cents),0);
 return {saleId:sale.id,number:String(sale.number),customerId:sale.customer_id,customerName:String(customer.name||'Cliente'),phone:String(customer.phone||''),product:data.sale_items.filter(i=>i.sale_id===sale.id).map(i=>String(i.label||'Produto')).join(' + ')||'Venda #'+sale.number,total,received,trade,balance:Math.max(0,total-received-trade),paymentCount:rows.filter(r=>r.kind!=='trade').length,paidCount:rows.filter(r=>r.kind!=='trade'&&r.status==='paid').length,rows};
}
export const scheduleStatus=(row:ScheduleRow)=>row.status==='paid'?'PAGO':row.status==='trade'?'ABATIDO NA TROCA':row.status==='partial'?'PARCIAL':row.status==='late'?'EM ATRASO':'PENDENTE';
export function paymentScheduleText(schedule:PaymentSchedule,store:string){
 const money=(n:number)=>(n/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),date=(s:string)=>s.split('-').reverse().join('/');
 return [`📱 ${schedule.product}`,`CRONOGRAMA DE PAGAMENTOS — ${store}`,`Cliente: ${schedule.customerName} · Venda #${schedule.number}`,'',...schedule.rows.map(r=>`${r.status==='paid'?'✅':r.status==='trade'?'🔄':r.status==='partial'?'🟡':'⬜'} ${date(r.date)} — ${money(r.amount)} — ${scheduleStatus(r)}${r.status==='partial'?` (recebido ${money(r.paid)}; falta ${money(r.balance)})`:''}`),'',`VALOR TOTAL: ${money(schedule.total)}`,`RECEBIDO: ${money(schedule.received)}`,...(schedule.trade?[`ABATIDO NA TROCA: ${money(schedule.trade)}`]:[]),`SALDO RESTANTE: ${money(schedule.balance)}`,`${schedule.paymentCount} pagamentos · ${schedule.paidCount} quitados`,'Atualizado conforme os recebimentos registrados na loja.'].join('\n');
}
