'use client';
import {useState} from 'react';
import {Plus,ChevronDown,Search,Package,CheckCircle2,Layers3,SlidersHorizontal} from 'lucide-react';
import {DevicePhoto} from '@/components/device-photo';
import {groupDeviceStock} from '@/lib/device-stock';
import {money} from '@/lib/domain';
import type {Row} from '@/lib/data';
import './device-stock.css';

type Props={devices:Row[];query:string;editable:boolean;techFields:readonly (readonly [string,string])[];onEdit:(d:Row)=>void;onAdd:(d:Row)=>void;onLookup:(d:Row)=>void};
function priceRange(units:Row[],field:string){
 const values=units.map(d=>Number(d[field]??d.price_cents));
 const min=Math.min(...values),max=Math.max(...values);
 return min===max?money(min):money(min)+' a '+money(max);
}

export function DeviceStock({devices,query,editable,techFields,onEdit,onAdd,onLookup}:Props){
 const [section,setSection]=useState('Todas');
 const [search,setSearch]=useState('');
 const [status,setStatus]=useState('Todas');
 const [expanded,setExpanded]=useState<string|null>(null);
 const all=groupDeviceStock(devices);
 const sections=Array.from(new Set(all.map(g=>g.section)));
 const statuses=Array.from(new Set(devices.map(d=>String(d.status||'Não informado'))));
 const searched=groupDeviceStock(devices,query).flatMap(g=>g.units);
 const filtered=searched.filter(d=>status==='Todas'||String(d.status||'Não informado')===status);
 const groups=groupDeviceStock(filtered,search).filter(g=>section==='Todas'||g.section===section);
 const visibleUnits=groups.flatMap(g=>g.units);
 const available=devices.filter(d=>d.status==='Disponível').length;

 return <div className="stock-catalog stock-redesign">
  <div className="stock-overview" aria-label="Resumo dos aparelhos cadastrados">
   <div><span className="stock-stat-icon"><Package size={21}/></span><span><small>Unidades cadastradas</small><strong>{devices.length}</strong></span></div>
   <div><span className="stock-stat-icon available"><CheckCircle2 size={21}/></span><span><small>Disponíveis para venda</small><strong>{available}</strong></span></div>
   <div><span className="stock-stat-icon models"><Layers3 size={21}/></span><span><small>Modelos no cadastro</small><strong>{all.length}</strong></span></div>
  </div>
  <div className="stock-controls">
   <label className="stock-search"><Search size={18}/><span className="stock-sr-only">Buscar no estoque</span><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar modelo, cor, memória ou IMEI"/></label>
   <label className="stock-status"><SlidersHorizontal size={16}/><span>Situação</span><select value={status} onChange={e=>setStatus(e.target.value)}><option value="Todas">Todas as situações</option>{statuses.map(s=><option key={s} value={s}>{s}</option>)}</select></label>
  </div>
  <div className="stock-section-tabs" aria-label="Seções do estoque">
   {['Todas',...sections].map(s=><button type="button" key={s} aria-pressed={section===s} onClick={()=>setSection(s)}>{s}<span>{s==='Todas'?all.length:all.filter(g=>g.section===s).length}</span></button>)}
  </div>
  <p className="stock-results" role="status">Exibindo {groups.length} {groups.length===1?'modelo':'modelos'} · {visibleUnits.length} {visibleUnits.length===1?'unidade':'unidades'}</p>
  {!groups.length?<div className="empty"><Package size={30}/><strong>Nenhum aparelho encontrado.</strong><p>Experimente outro modelo, IMEI ou situação.</p><button type="button" className="btn secondary" onClick={()=>{setSearch('');setSection('Todas');setStatus('Todas')}}>Limpar filtros do estoque</button>{query&&<small>Uma busca também está aplicada no topo da página.</small>}</div>:
   Array.from(new Set(groups.map(g=>g.section))).map(s=><section key={s} className="stock-section">
    <div className="stock-section-heading"><h3>{s}</h3><span>{groups.filter(g=>g.section===s).reduce((n,g)=>n+g.units.length,0)} unidades nesta seção</span></div>
    <div className="stock-product-grid">{groups.filter(g=>g.section===s).map(g=>{
     const availableUnits=g.units.filter(d=>d.status==='Disponível');
     const first=availableUnits[0]||g.units[0];
     const pricingUnits=availableUnits.length?availableUnits:g.units;
     const variants=Array.from(new Set(g.units.map(d=>[d.storage,d.color].filter(Boolean).join(' · ')).filter(Boolean)));
     const isOpen=expanded===g.id;
     return <article className={'stock-product'+(isOpen?' expanded':'')} key={g.id}>
      <div className="stock-product-photo"><DevicePhoto key={first.id} device={first} editable={false}/><span className={'badge '+(availableUnits.length?'green':'muted')}>{availableUnits.length?availableUnits.length+' disponíveis':'Sem unidades disponíveis'}</span></div>
      <div className="stock-product-body"><small className="stock-product-brand">{s}</small><h3>{g.model}</h3><p className="stock-product-variants" title={variants.join(' / ')}>{variants.join(' / ')||'Variações por unidade'}</p>
       <div className="stock-product-prices"><span>À vista<strong>{priceRange(pricingUnits,'price_cents')}</strong></span><div><span>Cartão<strong>{priceRange(pricingUnits,'credit_price_cents')}</strong></span><span>Carnê<strong>{priceRange(pricingUnits,'book_price_cents')}</strong></span></div></div>
       <div className="stock-product-actions"><button type="button" className="btn primary" aria-expanded={isOpen} onClick={()=>setExpanded(isOpen?null:g.id)}>{isOpen?'Fechar unidades':'Ver '+g.units.length+(g.units.length===1?' unidade':' unidades')}<ChevronDown size={16} className={isOpen?'stock-chevron-open':''}/></button>{editable&&<button type="button" className="btn secondary" onClick={()=>onAdd(first)} aria-label={'Adicionar unidade de '+g.model}><Plus size={16}/>Adicionar</button>}</div>
      </div>
      {isOpen&&<div className="stock-units stock-expanded-units">{g.units.map(d=><section className="stock-unit" key={d.id}>
       <div className="stock-unit-title"><strong>{[d.storage,d.color,d.condition].filter(Boolean).join(' · ')||'Unidade'}</strong><span className={'badge '+(d.status==='Disponível'?'green':'muted')}>{d.status}</span></div>
       <code>IMEI {d.imei}</code>{d.imei2&&<code>IMEI 2 {d.imei2}</code>}{d.barcode&&<code>Código de barras: {d.barcode}</code>}
       <DevicePhoto device={d} editable={editable}/>
       <div className="device-facts"><span>Custo total<strong>{money(Number(d.purchase_cents)+Number(d.repair_cents))}</strong></span><span>À vista<strong>{money(d.price_cents)}</strong></span><span>Cartão<strong>{money(d.credit_price_cents??d.price_cents)}</strong></span><span>Carnê<strong>{money(d.book_price_cents??d.price_cents)}</strong></span></div>
       <details className="technical-sheet"><summary>Ver ficha técnica</summary><dl>{[['Armazenamento',d.storage],...techFields.map(([key,label])=>[label,d.specs?.[key]])].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'Não informado'}</dd></div>)}</dl></details>
       {editable&&<button type="button" className="btn secondary" onClick={()=>onEdit(d)}>Editar esta unidade / ficha técnica</button>}<button type="button" className="text-link" onClick={()=>onLookup(d)}>Ver histórico deste IMEI</button>
      </section>)}</div>}
     </article>;
    })}</div>
   </section>)}
 </div>;
}
