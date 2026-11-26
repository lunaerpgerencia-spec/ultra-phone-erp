'use client';
import {Fragment,useState} from 'react';
import {Plus,Search,Package,Pencil,ChevronDown,Printer} from 'lucide-react';
import {DevicePhoto} from '@/components/device-photo';
import {groupDeviceStock,stockSections,stockModelName,promotionPrice,nonImeiSection} from '@/lib/device-stock';
import {money} from '@/lib/domain';
import type {Row} from '@/lib/data';
import './device-stock.css';


/** Code 128 B, with checksum and quiet zones. No external barcode service. */
const code128Patterns='212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(' ');
const labelText=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
const labelCodes=(d:Row)=>{
 const imeis=[...new Set([d.imei,d.imei2].map(v=>String(v??'').trim()).filter(v=>/^\d{15}$/.test(v)))];
 if(imeis.length)return imeis.map((value,i)=>({name:value===String(d.imei2??'').trim()&&value!==String(d.imei??'').trim()?'IMEI 2':i===0?'IMEI':'IMEI 2',value}));
 const value=String(d.barcode??'').trim();
 return /^[\x20-\x7e]{1,40}$/.test(value)?[{name:'Código',value}]:[];
};
function barcodeSVG(value:string){
 const symbols=Array.from(value,c=>c.charCodeAt(0)-32);
 const checksum=(104+symbols.reduce((sum,v,i)=>sum+v*(i+1),0))%103;
 let x=10,rects='';
 for(const code of [104,...symbols,checksum,106]){
  for(const [i,n] of Array.from(code128Patterns[code],Number).entries()){
   if(i%2===0)rects+='<rect x="'+x+'" y="0" width="'+n+'" height="36"/>';
   x+=n;
  }
 }
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+(x+10)+' 36" role="img" aria-label="'+labelText(value)+'" style="width:'+((x+10)*0.32)+'mm;max-width:100%;height:12mm" preserveAspectRatio="none" shape-rendering="crispEdges" fill="#000">'+rects+'</svg>';
}
function printStockLabels(rows:Row[]){
 const labels=rows.filter(d=>labelCodes(d).length);
 if(!labels.length)return 'Nenhum produto com IMEI ou código de barras compatível.';
 const popup=window.open('','_blank');
 if(!popup)return 'Permita a abertura de janelas para visualizar e imprimir as etiquetas.';
 popup.opener=null;
 const html=labels.map(d=>'<article class="label"><strong>ULTRA FONE</strong><div class="model">'+labelText(stockModelName(d))+'</div><div class="info">'+labelText([d.storage,d.color].filter(Boolean).join(' · '))+'</div>'+(promotionPrice(d)!==null?'<div class="label-original">De: '+labelText(money(d.price_cents))+'</div><div class="label-price">PROMOÇÃO À VISTA: '+labelText(money(promotionPrice(d)!))+'</div>':'<div class="label-price">À vista: '+labelText(money(d.price_cents))+'</div>')+''+labelCodes(d).map(c=>'<div class="barcode">'+barcodeSVG(c.value)+'<div>'+labelText(c.name)+': '+labelText(c.value)+'</div></div>').join('')+'</article>').join('');
 popup.document.open();
 popup.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Etiquetas de estoque | Ultra Fone</title><style>@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{margin:0;background:#fff;color:#000;font:12px Arial,sans-serif}.toolbar{padding:12px;background:#edf2f7;margin-bottom:12px}.toolbar button{padding:10px 18px;cursor:pointer}.sheet{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2mm;max-width:190mm;margin:auto}.label{height:64mm;min-width:0;overflow:hidden;border:1px dashed #aaa;padding:2mm;text-align:center;break-inside:avoid;page-break-inside:avoid;display:flex;flex-direction:column;align-items:center;justify-content:center}.label strong{font-size:11px}.model{font-weight:bold;font-size:12px;max-width:100%;overflow-wrap:anywhere}.info{font-size:10px}.label-original{font-size:11px;text-decoration:line-through}.label-price{font-size:15px;font-weight:700;line-height:1.2;margin-top:1mm}.barcode{margin-top:1mm;width:100%;font:10px monospace;line-height:1.1;overflow-wrap:anywhere}.barcode svg{display:block;margin:auto}@media print{.toolbar{display:none}.sheet{margin:0;max-width:none}}</style></head><body><div class="toolbar"><button id="print" type="button">Imprimir etiquetas</button> <span>'+labels.length+' etiqueta(s) · A4 · escala 100% · desative cabeçalhos e rodapés</span></div><main class="sheet">'+html+'</main></body></html>');
 popup.document.close();
 popup.document.getElementById('print')?.addEventListener('click',()=>popup.print());
 return '';
}

type Props={category?:string;devices:Row[];query:string;editable:boolean;techFields:readonly (readonly [string,string])[];onEdit:(d:Row)=>void;onAdd:(d:Row)=>void;onLookup:(d:Row)=>void};
export function DeviceStock({category,devices,query,editable,techFields,onEdit,onAdd,onLookup}:Props){
 const [section,setSection]=useState('Todas');
 const [search,setSearch]=useState('');
 const [status,setStatus]=useState('Todas');
 const [expanded,setExpanded]=useState<string|null>(null);
 const [labelError,setLabelError]=useState('');
 const [labelSelection,setLabelSelection]=useState<string[]>([]);
 const all=groupDeviceStock(devices);
 const sections=Array.from(new Set([...stockSections,...all.map(g=>g.section)]));
 const statuses=Array.from(new Set(devices.map(d=>String(d.status||'Não informado'))));
 const searched=groupDeviceStock(devices,query).flatMap(g=>g.units);
 const filtered=searched.filter(d=>status==='Todas'||String(d.status||'Não informado')===status);
 const groups=groupDeviceStock(filtered,search).filter(g=>section==='Todas'||g.section===section);
 const visibleLabels=groups.flatMap(g=>g.units).filter(d=>labelCodes(d).length);
 const selectedLabels=visibleLabels.filter(d=>labelSelection.includes(d.id));
 const printLabels=(rows:Row[])=>setLabelError(printStockLabels(rows));
 const count=groups.reduce((total,g)=>total+g.units.length,0);
 return <div className="stock-list-layout">
  <div className="stock-list-summary"><span><strong>{devices.length}</strong> cadastrados</span><span><strong>{devices.filter(d=>d.status==='Disponível').length}</strong> disponíveis</span><span><strong>{all.length}</strong> modelos</span></div>
  <div className="stock-list-controls"><label className="stock-list-search"><Search size={17} aria-hidden="true"/><span className="stock-list-sr">Buscar no estoque</span><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar modelo, código, série ou IMEI"/></label><label>Situação <select value={status} onChange={e=>setStatus(e.target.value)}><option value="Todas">Todas as situações</option>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</select></label></div>
  {!category&&<div className="stock-list-sections" aria-label="Seções do estoque">{['Todas',...sections].map(s=><button type="button" key={s} aria-pressed={section===s} onClick={()=>setSection(s)}>{s}</button>)}</div>}
  <div className="stock-list-controls"><button type="button" className="btn secondary" disabled={!visibleLabels.length} onClick={()=>printLabels(visibleLabels)}><Printer size={15}/>Etiquetas dos resultados ({visibleLabels.length})</button><button type="button" className="btn secondary" disabled={!selectedLabels.length} onClick={()=>printLabels(selectedLabels)}><Printer size={15}/>Etiquetas selecionadas ({selectedLabels.length})</button><button type="button" className="btn secondary" disabled={!visibleLabels.length} onClick={()=>setLabelSelection(visibleLabels.map(d=>d.id))}>Selecionar resultados</button><button type="button" className="btn secondary" onClick={()=>setLabelSelection([])}>Limpar seleção</button></div>
  {labelError&&<p role="alert">{labelError}</p>}
  <p className="stock-list-result" role="status">{count} {count===1?'produto encontrado':'produtos encontrados'} · uma linha por unidade</p>
  {!groups.length?<div className="empty"><Package size={28}/><strong>Nenhum produto encontrado.</strong><button type="button" className="btn secondary" onClick={()=>{setSearch('');setSection('Todas');setStatus('Todas')}}>Limpar filtros do estoque</button>{query&&<small>Uma busca também está aplicada no topo da página.</small>}</div>:
   Array.from(new Set(groups.map(g=>g.section))).map(s=><section className="stock-list-section" key={s}><h3>{s} <small>{groups.filter(g=>g.section===s).reduce((n,g)=>n+g.units.length,0)} unidades</small></h3>
    <div className="stock-list-scroll" role="region" aria-label={'Listagem de '+s} tabIndex={0}><table className="stock-list-table"><caption className="stock-list-sr">Produtos de {s}, identificação, situação e preços por unidade</caption><thead><tr><th scope="col">Produto</th><th scope="col">Memória</th><th scope="col">Cor</th><th scope="col">IMEI / Código</th><th scope="col">Situação</th><th scope="col">À vista</th><th scope="col">Cartão</th><th scope="col">Carnê</th><th scope="col">Ações</th></tr></thead><tbody>{groups.filter(g=>g.section===s).flatMap(g=>g.units.map(d=>{
     const isOpen=expanded===d.id;
     return <Fragment key={d.id}><tr className={isOpen?'stock-list-active':''}><th scope="row"><strong>{g.model}</strong><small>{d.condition||'Estado não informado'}</small>{nonImeiSection(g.section)&&<small>{all.find(group=>group.id===g.id)?.units.filter(u=>u.status==='Disponível').length??0} disponíveis neste modelo</small>}</th><td>{d.storage||'—'}</td><td>{d.color||'—'}</td><td><code>{d.imei||d.barcode||d.serial||'Sem IMEI'}</code></td><td><span className={'badge '+(d.status==='Disponível'?'green':'muted')}>{d.status||'Não informado'}</span></td><td className="stock-list-price">{promotionPrice(d)!==null?<><del>{money(d.price_cents)}</del><br/><strong>Promoção: {money(promotionPrice(d)!)}</strong></>:money(d.price_cents)}</td><td className="stock-list-price">{money(d.credit_price_cents??d.price_cents)}</td><td className="stock-list-price">{money(d.book_price_cents??d.price_cents)}</td><td><div className="stock-list-actions">{labelCodes(d).length>0&&<><label title="Selecionar para impressão"><input type="checkbox" aria-label={'Selecionar etiqueta de '+g.model+', '+labelCodes(d)[0].value} checked={labelSelection.includes(d.id)} onChange={e=>setLabelSelection(prev=>e.target.checked?[...prev,d.id]:prev.filter(id=>id!==d.id))}/> Selecionar</label><button type="button" className="btn secondary" onClick={()=>printLabels([d])}><Printer size={13}/>Etiqueta</button></>}{editable&&<button type="button" className="btn secondary" onClick={()=>onEdit(d)} aria-label={'Editar '+g.model+', '+(d.imei||d.barcode||d.serial||d.id)}><Pencil size={13}/>Editar</button>}<button type="button" className="btn secondary" aria-expanded={isOpen} aria-controls={'stock-unit-'+d.id} onClick={()=>setExpanded(isOpen?null:d.id)}>Detalhes<ChevronDown size={13}/></button>{editable&&<button type="button" className="btn secondary" onClick={()=>onAdd(d)} aria-label={'Adicionar unidade de '+g.model}><Plus size={13}/>{nonImeiSection(g.section)?'Adicionar quantidade':'Unidade'}</button>}</div></td></tr>
     <tr id={'stock-unit-'+d.id} hidden={!isOpen} className="stock-list-detail-row"><td colSpan={9}>{isOpen&&<div className="stock-list-detail"><div><h4>{g.model} · {d.storage} · {d.color}</h4>{d.imei?<p>IMEI: {d.imei}</p>:<p>Produto sem IMEI</p>}{d.serial&&<p>Número de série: {d.serial}</p>}{d.imei2&&<p>IMEI 2: {d.imei2}</p>}{d.barcode&&<p>Código de barras: {d.barcode}</p>}<p>Custo total: <strong>{money(Number(d.purchase_cents||0)+Number(d.repair_cents||0))}</strong></p><details className="technical-sheet"><summary>Ficha técnica completa</summary><dl>{[['Armazenamento',d.storage],...techFields.map(([key,label])=>[label,d.specs?.[key]])].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'Não informado'}</dd></div>)}</dl></details>{d.imei&&<button type="button" className="text-link" onClick={()=>onLookup(d)}>Ver histórico deste IMEI</button>}</div><DevicePhoto device={d} editable={editable}/></div>}</td></tr></Fragment>;
    }))}</tbody></table></div>
   </section>)}
 </div>;
}
