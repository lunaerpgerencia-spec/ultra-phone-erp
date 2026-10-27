'use client';
import {Fragment,useState} from 'react';
import {Plus,Search,Package,Pencil,ChevronDown} from 'lucide-react';
import {DevicePhoto} from '@/components/device-photo';
import {groupDeviceStock,stockSections} from '@/lib/device-stock';
import {money} from '@/lib/domain';
import type {Row} from '@/lib/data';
import './device-stock.css';

type Props={category?:string;devices:Row[];query:string;editable:boolean;techFields:readonly (readonly [string,string])[];onEdit:(d:Row)=>void;onAdd:(d:Row)=>void;onLookup:(d:Row)=>void};
export function DeviceStock({category,devices,query,editable,techFields,onEdit,onAdd,onLookup}:Props){
 const [section,setSection]=useState('Todas');
 const [search,setSearch]=useState('');
 const [status,setStatus]=useState('Todas');
 const [expanded,setExpanded]=useState<string|null>(null);
 const all=groupDeviceStock(devices);
 const sections=Array.from(new Set([...stockSections,...all.map(g=>g.section)]));
 const statuses=Array.from(new Set(devices.map(d=>String(d.status||'Não informado'))));
 const searched=groupDeviceStock(devices,query).flatMap(g=>g.units);
 const filtered=searched.filter(d=>status==='Todas'||String(d.status||'Não informado')===status);
 const groups=groupDeviceStock(filtered,search).filter(g=>section==='Todas'||g.section===section);
 const count=groups.reduce((total,g)=>total+g.units.length,0);
 return <div className="stock-list-layout">
  <div className="stock-list-summary"><span><strong>{devices.length}</strong> cadastrados</span><span><strong>{devices.filter(d=>d.status==='Disponível').length}</strong> disponíveis</span><span><strong>{all.length}</strong> modelos</span></div>
  <div className="stock-list-controls"><label className="stock-list-search"><Search size={17} aria-hidden="true"/><span className="stock-list-sr">Buscar no estoque</span><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar modelo, código, série ou IMEI"/></label><label>Situação <select value={status} onChange={e=>setStatus(e.target.value)}><option value="Todas">Todas as situações</option>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</select></label></div>
  {!category&&<div className="stock-list-sections" aria-label="Seções do estoque">{['Todas',...sections].map(s=><button type="button" key={s} aria-pressed={section===s} onClick={()=>setSection(s)}>{s}</button>)}</div>}
  <p className="stock-list-result" role="status">{count} {count===1?'produto encontrado':'produtos encontrados'} · uma linha por unidade</p>
  {!groups.length?<div className="empty"><Package size={28}/><strong>Nenhum produto encontrado.</strong><button type="button" className="btn secondary" onClick={()=>{setSearch('');setSection('Todas');setStatus('Todas')}}>Limpar filtros do estoque</button>{query&&<small>Uma busca também está aplicada no topo da página.</small>}</div>:
   Array.from(new Set(groups.map(g=>g.section))).map(s=><section className="stock-list-section" key={s}><h3>{s} <small>{groups.filter(g=>g.section===s).reduce((n,g)=>n+g.units.length,0)} unidades</small></h3>
    <div className="stock-list-scroll" role="region" aria-label={'Listagem de '+s} tabIndex={0}><table className="stock-list-table"><caption className="stock-list-sr">Produtos de {s}, identificação, situação e preços por unidade</caption><thead><tr><th scope="col">Produto</th><th scope="col">Memória</th><th scope="col">Cor</th><th scope="col">IMEI / Código</th><th scope="col">Situação</th><th scope="col">À vista</th><th scope="col">Cartão</th><th scope="col">Carnê</th><th scope="col">Ações</th></tr></thead><tbody>{groups.filter(g=>g.section===s).flatMap(g=>g.units.map(d=>{
     const isOpen=expanded===d.id;
     return <Fragment key={d.id}><tr className={isOpen?'stock-list-active':''}><th scope="row"><strong>{g.model}</strong><small>{d.condition||'Estado não informado'}</small></th><td>{d.storage||'—'}</td><td>{d.color||'—'}</td><td><code>{d.imei||d.barcode||d.serial||'Sem IMEI'}</code></td><td><span className={'badge '+(d.status==='Disponível'?'green':'muted')}>{d.status||'Não informado'}</span></td><td className="stock-list-price">{money(d.price_cents)}</td><td className="stock-list-price">{money(d.credit_price_cents??d.price_cents)}</td><td className="stock-list-price">{money(d.book_price_cents??d.price_cents)}</td><td><div className="stock-list-actions">{editable&&<button type="button" className="btn secondary" onClick={()=>onEdit(d)} aria-label={'Editar '+g.model+', '+(d.imei||d.barcode||d.serial||d.id)}><Pencil size={13}/>Editar</button>}<button type="button" className="btn secondary" aria-expanded={isOpen} aria-controls={'stock-unit-'+d.id} onClick={()=>setExpanded(isOpen?null:d.id)}>Detalhes<ChevronDown size={13}/></button>{editable&&<button type="button" className="btn secondary" onClick={()=>onAdd(d)} aria-label={'Adicionar unidade de '+g.model}><Plus size={13}/>Unidade</button>}</div></td></tr>
     <tr id={'stock-unit-'+d.id} hidden={!isOpen} className="stock-list-detail-row"><td colSpan={9}>{isOpen&&<div className="stock-list-detail"><div><h4>{g.model} · {d.storage} · {d.color}</h4>{d.imei?<p>IMEI: {d.imei}</p>:<p>Produto sem IMEI</p>}{d.serial&&<p>Número de série: {d.serial}</p>}{d.imei2&&<p>IMEI 2: {d.imei2}</p>}{d.barcode&&<p>Código de barras: {d.barcode}</p>}<p>Custo total: <strong>{money(Number(d.purchase_cents||0)+Number(d.repair_cents||0))}</strong></p><details className="technical-sheet"><summary>Ficha técnica completa</summary><dl>{[['Armazenamento',d.storage],...techFields.map(([key,label])=>[label,d.specs?.[key]])].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'Não informado'}</dd></div>)}</dl></details>{d.imei&&<button type="button" className="text-link" onClick={()=>onLookup(d)}>Ver histórico deste IMEI</button>}</div><DevicePhoto device={d} editable={editable}/></div>}</td></tr></Fragment>;
    }))}</tbody></table></div>
   </section>)}
 </div>;
}
