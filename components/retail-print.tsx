'use client';
import {useState} from 'react';
import {createPortal} from 'react-dom';
import {money,dateLabel} from '@/lib/domain';
import type {DataSet,Row} from '@/lib/data';
import './retail.css';
export function RetailPrint({sale,data,store,warranty,onClose}:{sale:Row;data:DataSet;store?:Row;warranty:boolean;onClose:()=>void}){
 const [format,setFormat]=useState(warranty?'A4':'80 mm');const items=data.sale_items.filter(i=>i.sale_id===sale.id),buyer=sale.customer_snapshot||data.customers.find(c=>c.id===sale.customer_id);
 return createPortal(<div className="retail-print-overlay"><div className="retail-print-controls"><h2>Visualizar {warranty?'garantia':'comprovante'}</h2>{!warranty&&<select aria-label="Formato de impressão" value={format} onChange={e=>setFormat(e.target.value)}><option>A4</option><option>58 mm</option><option>80 mm</option></select>}{!warranty&&format!=='A4'&&<span>Na impressora, escolha a bobina {format}, escala 100% e desative cabeçalhos e rodapés.</span>}<button className="btn primary" onClick={()=>window.print()}>Imprimir / Salvar PDF</button><button className="btn secondary" onClick={onClose}>Fechar</button></div><style>{`
.retail-print-sheet:is(.thermal58,.thermal80){box-sizing:border-box;color:#000;background:#fff;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;line-height:1.35;padding:2mm;max-width:100%}
.retail-print-sheet.thermal58{width:54mm;font-size:13px}
.retail-print-sheet.thermal80{width:76mm}
.retail-print-sheet:is(.thermal58,.thermal80) *{color:#000!important;opacity:1!important;text-shadow:none!important}
.retail-print-sheet:is(.thermal58,.thermal80) header{border-bottom:1px dashed #000;padding-bottom:2mm;margin-bottom:2mm}
.retail-print-sheet:is(.thermal58,.thermal80) h1{font-size:20px;font-weight:800;line-height:1.15;margin:0 0 2mm}
.retail-print-sheet:is(.thermal58,.thermal80) h2{font-size:14px;font-weight:700;line-height:1.25;margin:2mm 0}
.retail-print-sheet:is(.thermal58,.thermal80) h3{font-size:15px;font-weight:700;margin:2mm 0 1mm}
.retail-print-sheet:is(.thermal58,.thermal80) p{font-size:inherit;line-height:1.35;margin:1mm 0}
.retail-print-sheet:is(.thermal58,.thermal80) table{font-size:inherit;margin:2mm 0;table-layout:fixed}
.retail-print-sheet:is(.thermal58,.thermal80) :is(th,td){font-size:inherit;font-weight:600;border-bottom:1px solid #000;background:#fff;padding:1mm .5mm;vertical-align:top;line-height:1.3}
.retail-print-sheet:is(.thermal58,.thermal80) th:first-child{width:52%}
.retail-print-sheet:is(.thermal58,.thermal80) th:nth-child(2){width:13%}
.retail-print-sheet:is(.thermal58,.thermal80) :is(th,td):nth-child(2){text-align:center}
.retail-print-sheet:is(.thermal58,.thermal80) :is(th,td):last-child{text-align:right}
.retail-print-sheet:is(.thermal58,.thermal80) small{font-size:11px;font-weight:600;overflow-wrap:anywhere}
.retail-print-sheet:is(.thermal58,.thermal80) .retail-receipt-total{font-size:19px;font-weight:800;border-block:1px solid #000;padding:2mm 0}
@media print{
 @page retailThermal{size:auto;margin:2mm}
 @page retailA4{size:A4;margin:12mm}
 .retail-print-overlay:has(.a4),.retail-print-sheet.a4{page:retailA4}
 .retail-print-overlay:has(:is(.thermal58,.thermal80)),.retail-print-sheet:is(.thermal58,.thermal80){page:retailThermal}
 .retail-print-sheet:is(.thermal58,.thermal80){margin:0!important;padding:0!important;min-height:0!important;box-shadow:none!important;print-color-adjust:exact;-webkit-print-color-adjust:exact}
}
`}</style><article className={'retail-print-sheet '+(format==='A4'?'a4':format==='58 mm'?'thermal58':'thermal80')}><header><h1>{store?.name||'ULTRA PHONE'}</h1><p>CNPJ: {store?.company_document||'Não cadastrado'}</p><p>{store?.address||'Endereço não cadastrado'}</p><p>Telefone: {store?.phone||'Não cadastrado'}</p><h2>{warranty?'TERMO DE GARANTIA':'COMPROVANTE DE VENDA NÃO FISCAL'}</h2><p>Venda #{sale.number} · {new Date(sale.created_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</p>{sale.status==='Cancelada'&&<strong>VENDA CANCELADA</strong>}</header><p>Vendedor: {sale.seller_label||'Não registrado'}</p><p>Cliente: {buyer?.name||'Consumidor não identificado'}{buyer?.document?' · CPF: '+buyer.document:''}</p>{buyer?.phone&&<p>Telefone: {buyer.phone}</p>}{buyer?.address&&<p>Endereço: {buyer.address}</p>}{warranty?items.map(i=>{const d=data.devices.find(d=>d.id===i.device_id);return <section key={i.id}><h3>{i.label}</h3><p>{i.imei?'IMEI: '+i.imei:d?.serial?'Série: '+d.serial:'Sem IMEI / série cadastrada'}</p>{['Fornecedor','Loja'].map(kind=>{const terms=data.warranty_terms.find(t=>t.kind===kind&&(kind==='Loja'?t.sale_item_id===i.id:t.device_id===i.device_id));return <div key={kind}><h4>{kind==='Fornecedor'?'Garantia do fornecedor':'Garantia da loja'}</h4>{terms?<><p>Responsável: {terms.provider||store?.name} · Prazo: {terms.days} dias</p><p>Início: {dateLabel(terms.start_date)}</p><p>Condições: {terms.notes||'Conforme condições cadastradas, sem observações adicionais.'}</p></>:<p>{kind==='Loja'&&i.warranty_snapshot?'Prazo registrado na venda: '+i.warranty_days+' dias a partir de '+dateLabel(sale.created_at):'Não cadastrada.'}</p>}</div>})}</section>}):<><table><thead><tr><th>Produto</th><th>Qtd.</th><th>Preço</th></tr></thead><tbody>{items.map(i=><tr key={i.id}><td>{i.label}<small>{i.imei?'IMEI '+i.imei:''}</small></td><td>1</td><td>{money(i.price_cents)}</td></tr>)}</tbody></table><p>Subtotal: {money(sale.subtotal_cents)}</p><p>Desconto: {money(sale.discount_cents)}</p><h3 className="retail-receipt-total">Total: {money(sale.total_cents)}</h3><h3>Formas de pagamento</h3>{data.receipts.filter(r=>r.sale_id===sale.id&&!r.reversal_of&&Number(r.amount_cents)>0&&!data.receipts.some(x=>x.reversal_of===r.id)).map(r=><p key={r.id}>{r.method}: {money(r.amount_cents)}</p>)}{sale.trade_value_cents>0&&<p>Troca: {money(sale.trade_value_cents)}</p>}{data.installments.filter(i=>i.sale_id===sale.id&&!i.canceled).map(i=><p key={i.id}>Parcela {i.number} · {dateLabel(i.due_date)} · {money(i.amount_cents)}</p>)}{Number(sale.cash_tendered_cents)>0&&<p>Dinheiro entregue: {money(sale.cash_tendered_cents)} · Troco: {money(sale.change_cents)}</p>}<p>Não substitui nota fiscal.</p></>}{warranty&&<><p>As condições registradas não afastam os direitos legais do consumidor.</p><div className="signature-line">Assinatura do cliente · Data: ____/____/________</div><div className="signature-line">Assinatura da loja</div></>}</article></div>,document.body);
}
