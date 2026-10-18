import assert from 'node:assert/strict';import ts from 'typescript';import {readFile,writeFile,unlink} from 'node:fs/promises';import {renderToStaticMarkup} from 'react-dom/server';import React from 'react';
const target=new URL('./rental-contract-generated.mjs',import.meta.url);
try{
 const source=(await readFile(new URL('../components/rental-contract.tsx',import.meta.url),'utf8')).replace("'@/lib/domain'",JSON.stringify(new URL('../lib/domain.ts',import.meta.url).href));
 await writeFile(target,ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);
 const {RentalContract}=await import(target.href);const sale={id:'s',number:4,total_cents:160000,created_at:'2026-10-18',store_id:'store',customer_id:'c',installment_period:'Semanal'};
 const data={customers:[{id:'c',name:'Cliente <script>alert(1)</script>'}],sale_items:[{sale_id:'s',id:'item',label:'Telefone teste',imei:'123456789012345'}],installments:Array.from({length:13},(_,i)=>({sale_id:'s',id:String(i),number:i+1,due_date:'2026-10-18',amount_cents:10000,canceled:false})),receipts:[{sale_id:'s',amount_cents:30000},{sale_id:'s',installment_id:'0',amount_cents:10000}]};
 const html=renderToStaticMarkup(React.createElement(RentalContract,{sale,data,stores:[{id:'store',name:'ULTRA PHONE'}],storeId:'store'}));const text=html.replace(/<[^>]*>/g,'').replace(/\s/g,' ');
 assert.ok(text.includes('R$ 1.580,00'));assert.ok(text.includes('R$ 80,00 de locação + R$ 20,00 de opção de compra'));assert.ok(text.includes('Valor inicial registrado: R$ 300,00'));assert.ok(text.includes('Quinzenal')===false);assert.ok(text.includes('Semanal'));assert.ok(text.includes('autorizada judicialmente'));assert.ok(text.includes('vícios de fabricação'));assert.ok(!html.includes('<script>'));assert.ok(!text.includes('RG:'));
 console.log('PASS contrato: total preservado, opção de R$20 incluída na última parcela, entrada separada, dados opcionais e texto escapado.');
}finally{await unlink(target).catch(()=>{})}
