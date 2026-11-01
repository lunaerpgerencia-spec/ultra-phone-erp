import assert from 'node:assert/strict';
import {paymentReminders,paymentReminderMessage,paymentReminderLink,whatsappPhone} from '../lib/payment-reminders.ts';
const data={
 sales:[{id:'sale',number:12,status:'Ativa',store_id:'store',customer_id:'alice',payment_method:'Boleto',customer_snapshot:{name:'Nome antigo',phone:'21988888888'}},{id:'carnet',number:13,status:'Ativa',store_id:'store',customer_id:'bob',payment_method:'Carnê'},{id:'cancel',number:14,status:'Cancelada',store_id:'store',customer_id:'alice'}],
 customers:[{id:'alice',name:'Alice & Família',phone:'(21) 99999-9999',document:'nao-incluir-cpf',family_phone:'21977777777'},{id:'bob',name:'Beto',phone:''}],
 installments:[
  {id:'today',sale_id:'sale',store_id:'store',number:1,due_date:'2026-11-01',amount_cents:10000},
  {id:'late',sale_id:'sale',number:2,due_date:'2026-10-30',amount_cents:12345},
  {id:'next',sale_id:'sale',number:3,due_date:'2026-11-02',amount_cents:5000},
  {id:'paid',sale_id:'sale',number:4,due_date:'2026-10-01',amount_cents:10000},
  {id:'cancelled-parcel',sale_id:'sale',number:5,due_date:'2026-10-01',amount_cents:10000,canceled:true},
  {id:'cancelled-sale',sale_id:'cancel',number:1,due_date:'2026-10-01',amount_cents:10000},
  {id:'wrong-store',sale_id:'sale',store_id:'another-store',number:1,due_date:'2026-10-01',amount_cents:10000},
  {id:'orphan',sale_id:'missing',number:1,due_date:'2026-10-01',amount_cents:10000},
  {id:'no-phone',sale_id:'carnet',number:1,due_date:'2026-11-01',amount_cents:10000},
  {id:'bad-date',sale_id:'sale',number:6,due_date:'',amount_cents:10000}
 ],
 receipts:[{installment_id:'today',amount_cents:4000},{installment_id:'today',amount_cents:-1000},{installment_id:'paid',amount_cents:10000},{sale_id:'sale',installment_id:null,amount_cents:10000}]
};
const before=JSON.stringify(data),rows=paymentReminders(data,'2026-11-01');
assert.equal(rows.length,4);
assert.deepEqual(rows.map(r=>r.id),['late','today','no-phone','next']);
const today=rows.find(r=>r.id==='today'),late=rows.find(r=>r.id==='late');
assert.equal(today.balance,7000,'Partial receipt and reversal affect the remaining balance; sale entry is not counted twice');
assert.equal(today.status,'today');assert.equal(late.daysLate,2);assert.equal(late.status,'overdue');
assert.equal(today.customerName,'Alice & Família');assert.equal(today.phone,'5521999999999','Use current customer contact, never a family contact or stale snapshot');
assert.equal(rows.find(r=>r.id==='next').status,'upcoming');
const alice=rows.filter(r=>r.customerId==='alice'&&r.status!=='upcoming');
const message=paymentReminderMessage(alice,'Ultrafone');
assert.match(message,/vence hoje/);assert.match(message,/2 dias de atraso/);assert.match(message,/30\/10\/2026/);
assert.match(message,/70,00/);assert.match(message,/193,45/);assert.doesNotMatch(message,/nao-incluir-cpf|Nome antigo|9\.777/);
const link=new URL(paymentReminderLink(alice,'Ultrafone'));
assert.equal(link.hostname,'wa.me');assert.equal(link.pathname,'/5521999999999');assert.equal(link.searchParams.get('text'),message);
assert.match(paymentReminderMessage([rows.find(r=>r.id==='no-phone')],'Ultrafone'),/Parcela 1/);
assert.equal(paymentReminderLink([rows.find(r=>r.id==='no-phone')],'Ultrafone'),'','Missing phone never opens an unspecified recipient');
assert.throws(()=>paymentReminderMessage(rows,'Ultrafone'),/único cliente/);
assert.equal(whatsappPhone('+55 (21) 99999-9999'),'5521999999999');
assert.equal(whatsappPhone('(21) 3333-4444'),'552133334444');
for(const value of ['','123','00000000000','123456789012345'])assert.equal(whatsappPhone(value),'');
assert.equal(paymentReminderMessage([],'Ultrafone'),'');
const tomorrow=paymentReminders(data,'2026-11-02');
assert.equal(tomorrow.find(r=>r.id==='today').daysLate,1);assert.equal(tomorrow.find(r=>r.id==='next').status,'today');
const paidNow=structuredClone(data);paidNow.receipts.push({installment_id:'today',amount_cents:7000});
assert.ok(!paymentReminders(paidNow,'2026-11-01').some(r=>r.id==='today'),'Payment refresh removes a newly paid installment from the draft');
assert.equal(JSON.stringify(data),before);
console.log('PASS avisos: hoje, atrasos, futuros, saldo parcial com estorno, exclusão de quitadas/canceladas, separação por cliente, telefone atual, ausência de telefone, mensagem e URL codificadas, mudança de dia e dados preservados.');
