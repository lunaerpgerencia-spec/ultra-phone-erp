import {installmentDate} from '../lib/domain.ts';
import {PGlite} from '@electric-sql/pglite';import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
assert.equal(installmentDate('2027-01-31',1,'Mensal'),'2027-02-28');assert.equal(installmentDate('2026-12-25',1,'Semanal'),'2027-01-01');assert.equal(installmentDate('2026-12-25',1,'Quinzenal'),'2027-01-09');
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:cardinality(string_to_array($1,'/'))-1]$$;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;`);
for(const file of ['../database/schema.sql','./pricing-existing-schema.sql','../database/additions/carnet.sql','../database/additions/optional-customer-details.sql','../database/additions/edit-installments.sql','../database/additions/installment-period.sql'])await db.exec(await readFile(new URL(file,import.meta.url),'utf8'));
const a=crypto.randomUUID(),b=crypto.randomUUID();await db.query('insert into auth.users values($1),($2)',[a,b]);await db.exec(`set role authenticated;set request.jwt.claim.sub='${a}'`);const q=(s,p=[])=>db.query(s,p);const store=(await q("select bootstrap_store('Teste preços') as id")).rows[0].id;const customer=(await q("insert into customers(store_id,name,phone,address,document,rg) values($1,'Cliente teste','21999999999','Rua teste, 123','52998224725','1234567') returning id",[store])).rows[0].id;
const device={brand:'Apple',model:'Teste',imei:'490154203237518',condition:'Seminovo',purchase_cents:80000,repair_cents:0,price_cents:130000,credit_price_cents:150000,book_price_cents:180000,warranty_days:90};
const did=(await q('select intake_device($1,$2,$3,false,$4,$5,$6) as id',[store,device,'Fornecedor','2026-11-01','PIX',crypto.randomUUID()])).rows[0].id;

await q("update customers set phone='',address='',document=null,rg='' where id=$1",[customer]);
for(const [period,dates] of [['Semanal',['2026-12-25','2027-01-01','2027-01-08']],['Quinzenal',['2026-12-25','2027-01-09','2027-01-24']],['Mensal',['2026-12-25','2027-01-25','2027-02-25']]]){
 const sid=crypto.randomUUID();const args=[store,customer,[did],0,30000,3,'2026-12-25','Carnê','Teste',sid,0,'Dinheiro',period];
 const sell=()=>q('select make_sale_schedule($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',args);
 await sell();await sell();const rows=(await q('select due_date::text as due_text,amount_cents::int amount from installments where sale_id=$1 order by number',[sid])).rows;
 assert.deepEqual(rows.map(r=>r.due_text),dates);assert.equal(rows.reduce((n,r)=>n+r.amount,0),150000);assert.equal((await q('select installment_period from sales where id=$1',[sid])).rows[0].installment_period,period);
 await q('select cancel_sale($1,$2)',[sid,'Fim do teste']);
}
console.log('PASS carnê: semanal 7 dias, quinzenal 15 dias, mensal, virada de ano e repetição sem duplicar.');await db.close();
