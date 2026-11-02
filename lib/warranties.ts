import type {DataSet} from './data';
export type WarrantyRow={id:string;saleId:string;saleNumber:string;deviceId:string;customerId:string;customerName:string;phone:string;product:string;imei:string;serial:string;saleDate:string;days:number|null;endDate:string|null;daysLeft:number|null;status:'active'|'ending'|'expired'|'missing'|'no-extra'|'scheduled';startDate:string;provider:string;notes:string;source:'sale'|'manual'|'missing'};
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
  const term=(data.warranty_terms||[]).find(t=>t.kind==='Loja'&&t.sale_item_id===item.id&&t.device_id===item.device_id&&t.store_id===sale.store_id);
  const startDate=term?String(term.start_date).slice(0,10):saleDate;
  if(term)days=Number(term.days);
  let endDate:string|null=null,daysLeft:number|null=null;
  if(days!==null&&days>0&&startDate){const date=new Date(startDate+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);if(Number.isFinite(date.getTime())){endDate=date.toISOString().slice(0,10);daysLeft=Math.round((Date.parse(endDate+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000)}else days=null;}
  const status=!startDate||days===null?'missing':days===0?'no-extra':daysLeft===null?'missing':startDate>today?'scheduled':daysLeft<0?'expired':daysLeft<=7?'ending':'active';
  return [{id:item.id,saleId:sale.id,saleNumber:String(sale.number),deviceId:item.device_id,customerId:sale.customer_id,customerName:String(customer.name||'Cliente'),phone:String(customer.phone||''),product:String(item.label||device?.model||'Produto'),imei:String(item.imei||''),serial:String(device?.serial||''),saleDate,days,endDate,daysLeft,status,startDate,provider:String(term?.provider||''),notes:String(term?.notes||''),source:term?'manual':item.warranty_snapshot===true?'sale':'missing'}];
 }).sort((a,b)=>(a.endDate||'9999').localeCompare(b.endDate||'9999')||a.customerName.localeCompare(b.customerName,'pt-BR'));
}
export function warrantyStatus(row:WarrantyRow){
 if(row.status==='missing')return 'Prazo não informado';
 if(row.status==='no-extra')return 'Sem prazo contratual adicional';
 if(row.status==='scheduled')return 'Início previsto: '+row.startDate.split('-').reverse().join('/');
 if(row.status==='expired')return 'Prazo contratual encerrado';
 if(row.daysLeft===0)return 'Prazo termina hoje';
 return `${row.daysLeft} dias restantes`;
}

export function supplierWarrantyRows(data:DataSet,today:string):WarrantyRow[]{
 const terms=new Map((data.warranty_terms||[]).filter(t=>t.kind==='Fornecedor').map(t=>[t.device_id,t]));
 return data.devices.map((d):WarrantyRow=>{
  const candidate=terms.get(d.id),term=candidate&&candidate.store_id===d.store_id?candidate:undefined;
  const startDate=term?String(term.start_date).slice(0,10):'',days=term?Number(term.days):null;
  let endDate:string|null=null,daysLeft:number|null=null;
  if(startDate&&days!==null&&days>0){const end=new Date(startDate+'T12:00:00Z');end.setUTCDate(end.getUTCDate()+days);if(Number.isFinite(end.getTime())){endDate=end.toISOString().slice(0,10);daysLeft=Math.round((Date.parse(endDate+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000)}}
  const status=!term?'missing':days===0?'no-extra':daysLeft===null?'missing':startDate>today?'scheduled':daysLeft<0?'expired':daysLeft<=7?'ending':'active';
  const date=new Date(d.created_at),reference=Number.isFinite(date.getTime())?new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date):'';
  return {id:d.id,saleId:'',saleNumber:'',deviceId:d.id,customerId:'',customerName:String(term?.provider||d.origin||'Fornecedor não informado'),phone:'',product:[d.brand,d.model,d.storage].filter(Boolean).join(' · '),imei:String(d.imei||''),serial:String(d.serial||''),saleDate:reference,days,endDate,daysLeft,status,startDate,provider:String(term?.provider||d.origin||''),notes:String(term?.notes||''),source:term?'manual':'missing'};
 }).sort((a,b)=>(a.endDate||'9999').localeCompare(b.endDate||'9999')||a.product.localeCompare(b.product,'pt-BR'));
}
