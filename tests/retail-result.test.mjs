import assert from 'node:assert/strict';
import {retailResult} from '../lib/retail.ts';
const day='2026-11-07',range={start:day,end:day};
const d={sales:[{id:'s',status:'Ativa',created_at:day,total_cents:150000}],sale_items:[{sale_id:'s',cost_cents:100000}],receipts:[{id:'p',sale_id:'s',amount_cents:150000,method:'Crédito',created_at:day}],retail_payments:[{id:'p',sale_id:'s',gross_cents:150000,net_cents:148500}],work_expenses:[{id:'e',sale_id:'s',expense_date:day,amount_cents:15000},{id:'daily',expense_date:day,amount_cents:2000}]};
let r=retailResult(d,range);assert.equal(r.received,0);assert.equal(r.pending,148500);assert.equal(r.fees,1500);assert.equal(r.saleExpenses,15000);assert.equal(r.dayCosts,2000);assert.equal(r.profit,31500);
d.retail_payments[0].settled_date=day;r=retailResult(d,range);assert.equal(r.received,148500);assert.equal(r.pending,0);assert.equal(r.profit,31500);
d.sale_items[0].cost_cents=null;assert.equal(retailResult(d,range).incomplete,true);
assert.equal(retailResult({},range).profit,0);
console.log('PASS resultado: competência e recebimento separados, taxa única, despesa vinculada sem duplicação, custo diário, custo ausente e período vazio.');
