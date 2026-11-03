import type {Row} from './data';
export const referralMethod='Programa de indicação';
// Include reversals under the original method so non-cash credit never becomes cash.
export function referralCredit(receipts:Row[]){
 return receipts.reduce((sum,r)=>sum+((r.method===referralMethod||r.reversal_of&&receipts.some(original=>original.id===r.reversal_of&&original.method===referralMethod))?Number(r.amount_cents):0),0);
}
