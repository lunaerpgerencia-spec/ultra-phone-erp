import type {Row} from '@/lib/data';
export function canPrintPayment(receipt:Row,receipts:Row[],sales:Row[]){
 return !!receipt.id&&Number.isSafeInteger(Number(receipt.amount_cents))&&Number(receipt.amount_cents)>0&&!receipt.reversal_of&&receipt.method!=='Estorno'&&sales.some(s=>s.id===receipt.sale_id&&s.status==='Ativa')&&!receipts.some(r=>r.reversal_of===receipt.id);
}
