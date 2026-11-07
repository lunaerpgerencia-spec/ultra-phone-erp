import type {SupabaseClient} from '@supabase/supabase-js';
import type {DataSet,Row} from './data';
const reportTables:Record<string,string>={sales:'id,store_id,customer_id,number,total_cents,discount_cents,status,created_at,payment_method,customer_snapshot,trade_value_cents,seller_label',sale_items:'id,store_id,sale_id,label,cost_cents,price_cents',receipts:'id,store_id,sale_id,installment_id,amount_cents,method,reversal_of,created_at',installments:'id,store_id,sale_id,number,due_date,amount_cents,canceled',customers:'id,store_id,name',ledger:'id,store_id,amount_cents,description,receipt_id,purchase_id,method,created_at',purchases:'id,store_id,device_id,seller,amount_cents,paid,due_date,created_at',devices:'id,store_id,brand,model,storage,color',retail_payments:'*',work_expenses:'*'};
// Exact count and an explicit order prevent silently printing only the API's first page.
export async function readReportTable(client:SupabaseClient,storeId:string,table:string,columns:string){
 const rows:Row[]=[],ids=new Set<string>();let expected:number|null=null;
 do{const {data,error,count}=await client.from(table).select(columns,{count:'exact'}).eq('store_id',storeId).order('id').range(rows.length,rows.length+499).returns<Row[]>();if(error)throw Error('Não foi possível carregar '+table+': '+error.message);if(count===null||!Array.isArray(data))throw Error('Não foi possível conferir todos os registros. Atualize o relatório.');if(expected!==null&&count!==expected)throw Error('Os registros mudaram durante a leitura. Atualize o relatório.');expected=count;if(data.length===0&&rows.length<expected)throw Error('A leitura ficou incompleta. Atualize o relatório.');for(const row of data){if(ids.has(row.id)||row.store_id!==storeId)throw Error('Não foi possível conferir os registros da loja. Atualize o relatório.');ids.add(row.id);rows.push(row);}}while(rows.length<expected);
 if(rows.length!==expected)throw Error('Os registros mudaram durante a leitura. Atualize o relatório.');return rows;
}
export async function loadReportData(client:SupabaseClient,storeId:string):Promise<DataSet>{
 const {data:{user},error}=await client.auth.getUser();if(error||!user)throw Error('Entre na sua conta para gerar o relatório.');
 const membership=await client.from('members').select('role').eq('store_id',storeId).eq('user_id',user.id).single();
 if(membership.error||!['admin','gerente','financeiro'].includes(membership.data?.role))throw Error('Este relatório completo está disponível para administração, gerência e financeiro.');
 const entries=await Promise.all(Object.entries(reportTables).map(async([table,columns])=>[table,await readReportTable(client,storeId,table,columns)]));return Object.fromEntries(entries);
}
