import type {DataSet} from './data';
export type WarrantyRow={id:string;saleId:string;saleNumber:string;deviceId:string;customerId:string;customerName:string;phone:string;product:string;imei:string;serial:string;saleDate:string;days:number|null;endDate:string|null;daysLeft:number|null;status:'active'|'ending'|'expired'|'missing'|'no-extra'};
export function warrantyRows(data:DataSet,today:string):WarrantyRow[]{
 const sales=new Map(data.sales.filter(s=>s.status==='Ativa').map(s=>[s.id,s]));
 const customers=new Map(data.customers.map(c=>[c.id,c]));
 const devices=new Map(data.devices.map(d=>[d.id,d]));
 return data.sale_items.flatMap((item):WarrantyRow[]=>{
  const sale=sales.get(item.sale_id);if(!sale||item.store_id&&sale.store_id&&item.store_id!==sale.store_id)return [];
  const device=devices.get(item.device_id),customer=customers.get(sale.customer_id)||sale.customer_snapshot||{};
  const created=new Date(sale.created_at),saleDate=Number.isFinite(created.getTime())?new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(created):'';
  // Use the immutable warranty captured at the sale, never today's editable stock term.
  let days=item.warranty_snapshot===true&&item.warranty_days!==null&&item.warranty_days!==undefined&&Number.isSafeInteger(Number(item.warranty_days))&&Number(item.warranty_days)>=0?Number(item.warranty_days):null;
  let endDate:string|null=null,daysLeft:number|null=null;
  if(days!==null&&days>0&&saleDate){const date=new Date(saleDate+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);if(Number.isFinite(date.getTime())){endDate=date.toISOString().slice(0,10);daysLeft=Math.round((Date.parse(endDate+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000)}else days=null;}
  const status=!saleDate||days===null?'missing':days===0?'no-extra':daysLeft===null?'missing':daysLeft<0?'expired':daysLeft<=7?'ending':'active';
  return [{id:item.id,saleId:sale.id,saleNumber:String(sale.number),deviceId:item.device_id,customerId:sale.customer_id,customerName:String(customer.name||'Cliente'),phone:String(customer.phone||''),product:String(item.label||device?.model||'Produto'),imei:String(item.imei||''),serial:String(device?.serial||''),saleDate,days,endDate,daysLeft,status}];
 }).sort((a,b)=>(a.endDate||'9999').localeCompare(b.endDate||'9999')||a.customerName.localeCompare(b.customerName,'pt-BR'));
}
export function warrantyStatus(row:WarrantyRow){
 if(row.status==='missing')return 'Prazo não informado na venda';
 if(row.status==='no-extra')return 'Sem prazo contratual adicional';
 if(row.status==='expired')return 'Prazo contratual encerrado';
 if(row.daysLeft===0)return 'Prazo termina hoje';
 return `${row.daysLeft} dias restantes`;
}
