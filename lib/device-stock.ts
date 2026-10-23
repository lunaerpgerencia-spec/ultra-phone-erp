import type {Row} from './data';
export const stockSections=['iPhone','Samsung','Motorola','Xiaomi','HOTWAV','Tablets','Outros'];
const clean=(v:unknown)=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ');
const key=(v:unknown)=>clean(v).toLowerCase().replace(/[^a-z0-9]/g,'');
export function deviceSection(d:Row){
 const explicit=String(d.specs?.stock_section||'').trim();
 if(explicit){return stockSections.find(s=>key(s)===key(explicit))||explicit;}
 const model=clean(d.model).toLowerCase(),brand=clean(d.brand).toLowerCase();
 if(/ipad|tablet|\bpad\s*\d/.test(model))return 'Tablets';
 if(/hotwav/.test(model+' '+brand))return 'HOTWAV';
 if(/i\s*phone/.test(model))return 'iPhone';
 if(/samsung|galaxy/.test(model+' '+brand))return 'Samsung';
 if(/motorola|\bmoto\b/.test(model+' '+brand))return 'Motorola';
 if(/xiaomi|redmi|\bpoco\b/.test(model+' '+brand))return 'Xiaomi';
 if(brand==='apple'&&/^\d/.test(model))return 'iPhone';
 return 'Outros';
}
export function stockModelName(d:Row){
 let model=String(d.model||'Modelo sem nome').trim().replace(/^apple\s+/i,'');
 if(deviceSection(d)==='iPhone')model=model.replace(/^i\s*phone\s*/i,'iPhone ').replace(/^(\d)/,'iPhone $1');
 return !['iPhone','Outros','Tablets'].includes(deviceSection(d))&&!key(model).startsWith(key(deviceSection(d)))?deviceSection(d)+' '+model:model;
}
export type StockGroup={id:string;section:string;model:string;units:Row[]};
export function groupDeviceStock(devices:Row[],query=''){
 const groups=new Map<string,StockGroup>(),q=clean(query).toLowerCase();
 for(const d of devices){
  const section=deviceSection(d),model=stockModelName(d);
  if(q&&![section,model,d.brand,d.model,d.color,d.storage,d.imei,d.imei2,d.serial,d.barcode,d.condition,d.status,...Object.values(d.specs||{})].some(v=>clean(v).toLowerCase().includes(q)))continue;
  const id=JSON.stringify([key(section),key(model)]);
  const group=groups.get(id)||{id,section,model,units:[]};group.units.push(d);groups.set(id,group);
 }
 return [...groups.values()].sort((a,b)=>{const ai=stockSections.indexOf(a.section),bi=stockSections.indexOf(b.section);return (ai<0?99:ai)-(bi<0?99:bi)||a.section.localeCompare(b.section,'pt-BR')||a.model.localeCompare(b.model,'pt-BR',{numeric:true});});
}
