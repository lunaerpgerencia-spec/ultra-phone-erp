import type {DataSet,Row} from './data';

export type PaymentReminder={id:string;saleId:string;saleNumber:string;number:number;customerId:string;customerName:string;phone:string;due:string;balance:number;kind:string;status:'today'|'overdue'|'upcoming';daysLate:number};
export function whatsappPhone(value:unknown){
 const digits=String(value||'').replace(/\D/g,'');
 const local=/^55\d{10,11}$/.test(digits)?digits.slice(2):digits;
 return /^[1-9]\d{9,10}$/.test(local)?'55'+local:'';
}
export function paymentReminders(data:DataSet,today:string):PaymentReminder[]{
 const sales=new Map(data.sales.filter(s=>s.status==='Ativa').map(s=>[s.id,s]));
 const customers=new Map(data.customers.map(c=>[c.id,c]));
 const paid=new Map<string,number>();
 for(const r of data.receipts)if(r.installment_id)paid.set(r.installment_id,(paid.get(r.installment_id)||0)+Number(r.amount_cents));
 return data.installments.flatMap((p:Row):PaymentReminder[]=>{
  const sale=sales.get(p.sale_id),balance=Math.max(0,Number(p.amount_cents)-(paid.get(p.id)||0));
  if(p.canceled||!sale||!Number.isSafeInteger(balance)||balance<=0||p.store_id&&sale.store_id&&p.store_id!==sale.store_id)return [];
  const current=customers.get(sale.customer_id),buyer=current||sale.customer_snapshot||{};
  const due=String(p.due_date||'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(due)||!Number.isFinite(Date.parse(due+'T12:00:00Z')))return [];
  const status=due<today?'overdue':due===today?'today':'upcoming';
  return [{id:p.id,saleId:sale.id,saleNumber:String(sale.number),number:Number(p.number),customerId:sale.customer_id,customerName:String(buyer.name||'Cliente'),phone:whatsappPhone(buyer.phone),due,balance,kind:sale.payment_method==='Boleto'?'Boleto':'Parcela',status,daysLate:status==='overdue'?Math.round((Date.parse(today+'T12:00:00Z')-Date.parse(due+'T12:00:00Z'))/86400000):0}];
 }).sort((a,b)=>a.due.localeCompare(b.due)||a.customerName.localeCompare(b.customerName,'pt-BR')||a.number-b.number);
}
export function paymentReminderMessage(rows:PaymentReminder[],store:string){
 if(!rows.length)return '';
 if(new Set(rows.map(r=>r.customerId)).size!==1)throw Error('Cada aviso deve ser de um único cliente.');
 const money=(value:number)=>(value/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 const date=(value:string)=>value.split('-').reverse().join('/');
 const lines=rows.map(r=>`${r.kind} ${r.number} da venda #${r.saleNumber}: ${r.status==='today'?'vence hoje':r.status==='overdue'?`venceu em ${date(r.due)} (${r.daysLate} ${r.daysLate===1?'dia':'dias'} de atraso)`:`vence em ${date(r.due)}`} — saldo em aberto ${money(r.balance)}.`);
 return [`Olá, ${rows[0].customerName}! Aqui é da ${store||'ULTRA PHONE'}.`,'','Lembrete de pagamento:',...lines.map(line=>'• '+line),'',`Total deste aviso: ${money(rows.reduce((total,r)=>total+r.balance,0))}.`,'','Se você já pagou, por favor nos envie o comprovante para conferirmos. Obrigado!'].join('\n');
}
export function paymentReminderLink(rows:PaymentReminder[],store:string){
 if(!rows.length||!rows[0].phone)return '';
 if(new Set(rows.map(r=>r.phone)).size!==1)throw Error('Confira o telefone do cliente.');
 return `https://wa.me/${rows[0].phone}?text=${encodeURIComponent(paymentReminderMessage(rows,store))}`;
}
