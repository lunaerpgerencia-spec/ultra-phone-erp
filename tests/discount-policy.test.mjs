import assert from 'node:assert/strict';
import {canApproveDiscount,discountPercent,validateDiscountPolicy} from '../lib/discount-policy.ts';

assert.equal(discountPercent(500,10000),5);
assert.equal(discountPercent(1000,10000),10);
assert.equal(canApproveDiscount('admin'),true);
assert.equal(canApproveDiscount('gerente'),true);
assert.equal(canApproveDiscount('vendedor'),false);

assert.deepEqual(validateDiscountPolicy({discountCents:0,baseCents:10000,maxPercent:5,role:'vendedor',reason:''}),{
  ok:true,requiresApproval:false,percent:0
});
assert.equal(validateDiscountPolicy({discountCents:500,baseCents:10000,maxPercent:5,role:'vendedor',reason:''}).ok,true);
assert.equal(validateDiscountPolicy({discountCents:501,baseCents:10000,maxPercent:5,role:'vendedor',reason:''}).ok,false);
assert.equal(validateDiscountPolicy({discountCents:1000,baseCents:10000,maxPercent:5,role:'admin',reason:''}).ok,false);
assert.equal(validateDiscountPolicy({discountCents:1000,baseCents:10000,maxPercent:5,role:'admin',reason:'Campanha autorizada'}).ok,true);
assert.equal(validateDiscountPolicy({discountCents:1000,baseCents:10000,maxPercent:5,role:'gerente',reason:'Ajuste negociado'}).ok,true);
assert.equal(validateDiscountPolicy({discountCents:1000,baseCents:0,maxPercent:5,role:'admin',reason:'Motivo válido'}).ok,false);
assert.equal(validateDiscountPolicy({discountCents:1000,baseCents:10000,maxPercent:5,role:'admin',reason:'x'.repeat(501)}).ok,false);
console.log('PASS regras de limite, autorização e justificativa de desconto no PDV.');
