import {createClient, type SupabaseClient} from '@supabase/supabase-js';
export type Row = Record<string, any>;
export type DataSet = { [key: string]: Row[] };
export const tables=['customers','devices','purchases','sales','sale_items','installments','receipts','ledger','device_specs'];
export const emptyData = () => Object.fromEntries(tables.map(t=>[t,[]])) as DataSet;
let client:SupabaseClient|null=null;
export async function getClient(){if(client)return client;const r=await fetch('/api/config',{cache:'no-store'});if(!r.ok)throw new Error('Não foi possível carregar a configuração.');const c=await r.json() as {configured:boolean,url:string,key:string};if(!c.configured)return null;client=createClient(c.url,c.key);return client;}
export async function loadData(c:SupabaseClient,storeId:string){const entries=await Promise.all(tables.map(async t=>{const {data,error}=await c.from(t).select('*').eq('store_id',storeId).order('id').limit(5000);if(error)throw new Error(error.message);return [t,data||[]]}));const result=Object.fromEntries(entries) as DataSet;const specs=new Map(result.device_specs.map(s=>[s.id,s]));result.devices=result.devices.map(d=>({...d,barcode:specs.get(d.id)?.barcode||'',specs:specs.get(d.id)?.specs||{}}));return result;}
export async function rpc(name:string,args:Row){const c=await getClient();if(!c)throw new Error('O banco ainda precisa ser conectado.');const {data,error}=await c.rpc(name,args);if(error)throw new Error(error.message);return data;}
