'use client';
import {useMemo,useState} from 'react';

type Product={id:string;brand?:string;model?:string;barcode?:string;imei?:string;serial?:string;price_cents?:number};
const alphabet='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';
const patterns=['000110100','100100001','001100001','101100000','000110001','100110000','001110000','000100101','100100100','001100100','100001001','001001001','101001000','000011001','100011000','001011000','000001101','100001100','001001100','000011100','100000011','001000011','101000010','000010011','100010010','001010010','000000111','100000110','001000110','000010110','110000001','011000001','111000000','010010001','110010000','011010000','010000101','110000100','011000100','010101000','010100010','010001010','000101010','010010100','010101000','000110010'];
// Code 39 character patterns: 9 elements, three wide. Asterisks are start/stop.
const star='010010100';
function bars(raw:string){
 const value=raw.toUpperCase().replace(/[^0-9A-Z.\- $/+%]/g,'').slice(0,32);
 const encoded='*'+value+'*';let x=0;const rectangles:{x:number;width:number}[]=[];
 for(const ch of encoded){const pattern=ch==='*'?star:patterns[alphabet.indexOf(ch)];if(!pattern)continue;
 for(let i=0;i<9;i++){const width=pattern[i]==='1'?3:1;if(i%2===0)rectangles.push({x,width});x+=width}x+=1}
 return {rectangles,width:x,value};
}
export function BarcodeA4Labels({products}:{products:Product[]}){
 const [selected,setSelected]=useState<string[]>([]);
 const [columns,setColumns]=useState(3);
 const [copies,setCopies]=useState(1);
 const [showPrice,setShowPrice]=useState(true);
 const selectedProducts=useMemo(()=>products.filter(p=>selected.includes(p.id)).flatMap(p=>Array.from({length:copies},()=>p)),[products,selected,copies]);
 return <section className="panel">
 <style>{`@media print {body *{visibility:hidden!important} #ultra-label-sheet,#ultra-label-sheet *{visibility:visible!important} #ultra-label-sheet{position:absolute;inset:0;width:100%!important} .ultra-label{break-inside:avoid} @page{size:A4;margin:10mm}} .ultra-label{border:1px dashed #aaa;padding:8px;text-align:center;overflow:hidden;min-height:95px;font-family:Arial,sans-serif;color:#111;background:#fff}.ultra-label svg{width:100%;height:38px}.ultra-label small{display:block;font-size:9px;overflow-wrap:anywhere}`}</style>
 <h2>Etiquetas A4 — Ultra Phone</h2><p>Pré-visualize e imprima sem alterar os cadastros nem o estoque. Os códigos internos são derivados do identificador do produto apenas para impressão.</p>
 <div style={{display:'flex',gap:12,flexWrap:'wrap',margin:'12px 0'}}>
 <label>Colunas <select value={columns} onChange={e=>setColumns(Number(e.target.value))}><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option></select></label>
 <label>Cópias por produto <input type="number" min={1} max={100} value={copies} onChange={e=>setCopies(Math.min(100,Math.max(1,Number(e.target.value)||1)))}/></label>
 <label><input type="checkbox" checked={showPrice} onChange={e=>setShowPrice(e.target.checked)}/> Mostrar preço</label>
 <button type="button" onClick={()=>setSelected(products.map(p=>p.id))}>Selecionar todos</button>
 <button type="button" onClick={()=>setSelected([])}>Limpar seleção</button>
 <button type="button" disabled={!selectedProducts.length} onClick={()=>window.print()}>Imprimir A4</button>
 </div>
 <div style={{maxHeight:180,overflowY:'auto'}}>{products.map(p=><label key={p.id} style={{display:'block',padding:4}}><input type="checkbox" checked={selected.includes(p.id)} onChange={e=>setSelected(s=>e.target.checked?[...s,p.id]:s.filter(id=>id!==p.id))}/> {[p.brand,p.model].filter(Boolean).join(' ')||'Produto'} — {p.barcode||p.imei||p.serial||p.id}</label>)}</div>
 <div id="ultra-label-sheet" style={{display:'grid',gridTemplateColumns:`repeat(${columns},minmax(0,1fr))`,gap:4,background:'#fff',padding:8}}>
 {selectedProducts.map((p,index)=>{const code=(p.barcode||p.imei||p.serial||('UF'+p.id.replace(/-/g,'').slice(0,18))).toUpperCase();const b=bars(code);return <div className="ultra-label" key={p.id+'-'+index}>
 <strong style={{fontSize:11}}>ULTRA PHONE</strong><small>{[p.brand,p.model].filter(Boolean).join(' ')||'Produto'}</small>
 {showPrice&&typeof p.price_cents==='number'&&<strong style={{display:'block',fontSize:13}}>{(p.price_cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong>}
 <svg viewBox={`0 0 ${b.width} 40`} preserveAspectRatio="none" role="img" aria-label={`Código de barras ${b.value}`}>{b.rectangles.map((r,i)=><rect key={i} x={r.x} y={0} width={r.width} height={40} fill="black"/>)}</svg><small>{b.value}</small>
 </div>})}</div>
 </section>
}
