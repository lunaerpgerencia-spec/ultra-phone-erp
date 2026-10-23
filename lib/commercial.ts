export function tradeBasis(resale:number,repairs:number,expenses:number,profit:number){
 if(![resale,repairs,expenses,profit].every(n=>Number.isSafeInteger(n)&&n>=0))throw Error('Informe valores válidos para a avaliação.');
 return Math.max(0,resale-repairs-expenses-profit);
}
export function channelEstimate(price:number,percent:number,fixed:number,shipping:number,cost:number){
 if(![price,fixed,shipping,cost].every(n=>Number.isSafeInteger(n)&&n>=0)||!Number.isFinite(percent)||percent<0||percent>100)throw Error('Confira o preço e as taxas do canal.');
 const fees=Math.round(price*percent/100)+fixed;
 return {fees,net:price-fees-shipping,result:price-fees-shipping-cost};
}
