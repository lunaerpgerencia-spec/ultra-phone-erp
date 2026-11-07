'use client';
import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {CalendarDays,Printer,RefreshCw,FileBarChart} from 'lucide-react';
import {getClient,type DataSet} from '@/lib/data';
import {money,dateLabel,isoToday} from '@/lib/domain';
import {buildPeriodReport,reportPreset,reportRangeError,type PeriodReport,type ReportRange} from '@/lib/period-report';
import {filterRetailReport} from '@/lib/retail';
import {loadReportData} from '@/lib/report-data';
import './period-report.css';

export type ReportKind='sales'|'receipts'|'complete';
const reportTitles:Record<ReportKind,string>={sales:'Relatório de vendas',receipts:'Relatório de recebimentos',complete:'Relatório completo'};
type Snapshot={data:DataSet;at:string};
type PrintSnapshot={report:PeriodReport;at:string;store:string;kind:ReportKind};
async function fetchSnapshot(storeId:string):Promise<Snapshot>{const client=await getClient();if(!client)throw Error('Entre na conta para carregar os registros.');const data=await loadReportData(client,storeId);return {data,at:new Date().toISOString()};}
function Table({title,description,headers,children,empty}:{title:string;description?:string;headers:string[];children:ReactNode;empty?:boolean}){
 return <section className="period-report-section"><h3>{title}</h3>{description&&<p className="period-report-caption">{description}</p>}<div className="period-report-scroll"><table><thead><tr>{headers.map(h=><th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{empty?<tr><td colSpan={headers.length}>Nenhum registro neste período.</td></tr>:children}</tbody></table></div></section>;
}
export function PeriodReportContent({report,store,at,kind='complete'}:{report:PeriodReport;store:string;at:string;kind?:ReportKind}){
 const t=report.totals,salesMode=kind!=='receipts',receiptsMode=kind!=='sales';
 const net=(method:string)=>report.methods.find(m=>m.method===method)?.net||0;
 const completeCards=[['Vendas no período',money(t.sales),`${t.count} vendas ativas · ${t.units} produtos`],['Recebido nas vendas',money(t.received),'Pagamentos menos estornos no período'],['Dinheiro das vendas',money(report.methods.find(m=>m.method==='Dinheiro')?.net||0),'Líquido de estornos em dinheiro'],['Pix das vendas',money(report.methods.find(m=>m.method==='PIX')?.net||0),'Líquido de estornos em Pix'],['Programa de indicação',money(t.referral),'Crédito aplicado menos créditos estornados'],['Compras registradas',money(t.purchases),`${report.purchases.length} compras · pagas ou pendentes`],['Saídas financeiras',money(t.outflows),'Compras, despesas e estornos registrados'],['Movimento líquido',money(t.netMovement),'Entradas menos saídas do período']];
 const cards=kind==='complete'?completeCards:kind==='sales'?[
  ['Vendas no período',money(t.sales),`${t.count} vendas ativas · ${t.units} produtos`],
  ['Margem bruta',money(t.margin),'Antes de indicações, taxas, despesas e impostos'],
  ['Custo dos produtos vendidos',money(t.cost),'Custos registrados nos itens da venda'],
  ['Saldo atual a receber',money(t.balance),'Das vendas selecionadas, após pagamentos e trocas']
 ]:[
  ['Recebido líquido',money(t.received),'Pagamentos menos estornos do período'],
  ['Recebimentos financeiros',money(t.gross),'Antes dos estornos'],
  ['Estornos financeiros',money(t.reversed),'Devoluções registradas no período'],
  ['Dinheiro recebido',money(net('Dinheiro')),'Líquido de estornos em dinheiro'],
  ['Pix recebido',money(net('PIX')),'Líquido de estornos em Pix'],
  ['Débito recebido',money(net('Débito')),'Líquido de estornos no débito'],
  ['Crédito recebido',money(net('Crédito')),'Líquido de estornos no crédito'],
  ['Programa de indicação',money(t.referral),'Abatimentos separados das entradas financeiras']
 ];
 return <div className="period-report-content">
  <header className="period-report-heading"><div><p className="period-report-eyebrow">{store}</p><h2>{reportTitles[kind]}</h2><p>{dateLabel(report.range.start)} a {dateLabel(report.range.end)} · datas de Brasília</p><p>Vendedor: {report.filters.seller||'Todos'} · Pagamento: {report.filters.method||'Todas as formas'}</p><small>Atualizado em {new Date(at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</small></div><FileBarChart size={38} aria-hidden="true"/></header>
  <div className="period-report-cards">{cards.map(([label,value,note])=><div className="period-report-card" key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}</div>
  {salesMode&&<section className="period-report-section"><h3>Resultado gerencial</h3><div className="period-report-cards">{[['Taxas de cartão',report.result.fees],['Despesas das vendas',report.result.saleExpenses],['Custos gerais do dia',report.result.dayCosts],['Lucro do período',report.result.profit],['Cartão a liquidar',report.result.cardPending]].map(([l,v])=><div className="period-report-card" key={l}><span>{l}</span><strong>{money(Number(v))}</strong></div>)}</div>{report.result.incomplete&&<p>Lucro incompleto: custo histórico ausente em algum produto.</p>}<p>Lucro = vendas − custo histórico dos produtos − taxas − despesas das vendas − custos gerais do dia.</p></section>}
  <div className="period-report-context">{salesMode&&<p><strong>Vendas:</strong> somente vendas atualmente ativas criadas no período. {t.canceled} venda(s) cancelada(s) excluída(s) dos totais de vendas.</p>}{receiptsMode&&<p><strong>Recebimentos:</strong> pela data do pagamento ou estorno, inclusive de vendas antigas. Indicações e trocas ficam separadas do dinheiro recebido. Os valores representam os recebimentos das vendas da loja.</p>}</div>
  {receiptsMode&&<Table title="Recebimentos de vendas por forma" headers={['Forma','Recebimentos / créditos','Estornos','Líquido']}>
   {report.methods.map(m=><tr key={m.method}><td>{m.method}</td><td className="period-report-money">{money(m.gross)}</td><td className="period-report-money">{money(m.reversed)}</td><td className="period-report-money"><strong>{money(m.net)}</strong></td></tr>)}
  </Table>}
  <div className="period-report-extra">{receiptsMode&&<p>Recebimentos financeiros: <strong>{money(t.gross)}</strong> · Estornos financeiros: <strong>{money(t.reversed)}</strong>{kind==='complete'&&<> · Outras entradas no financeiro: <strong>{money(t.otherInflows)}</strong></>}</p>}{salesMode&&<><p>Trocas nas vendas selecionadas: <strong>{money(t.trade)}</strong> · Saldo atual a receber dessas vendas: <strong>{money(t.balance)}</strong> · Deste saldo, em atraso até hoje: <strong>{money(t.overdue)}</strong></p><p>Margem bruta das vendas: <strong>{money(t.margin)}</strong> · Custos dos produtos vendidos: <strong>{money(t.cost)}</strong>. Margem antes de indicações, taxas, despesas e impostos; não representa dinheiro no caixa. Saldos a receber e situação das vendas são atuais, não uma reconstrução histórica.</p></>}</div>
  {salesMode&&<Table title="Despesas e custos do período" headers={['Data','Descrição / categoria','Vínculo','Responsável / destinatário','Pagamento / conta','Valor']} empty={!report.result.expenses.length}>{report.result.expenses.map(e=><tr key={e.id}><td>{dateLabel(e.expense_date)}</td><td>{e.description}<small>{e.category}</small></td><td>{e.sale_id?'Despesa de venda':'Custo geral'}</td><td>{e.responsible}<small>{e.recipient}</small></td><td>{e.method}<small>{e.account_label}</small></td><td>{money(e.amount_cents)}</td></tr>)}</Table>}
  <Table title="Resumo por dia" headers={['Dia',...(salesMode?['Vendas','Valor vendido']:[]),...(receiptsMode?['Recebido líquido','Indicações']:[]),...(kind==='complete'?['Saídas','Movimento líquido']:[])]}>
   {report.daily.map(d=><tr key={d.day}><td>{dateLabel(d.day)}</td>{salesMode&&<><td>{d.count}</td><td className="period-report-money">{money(d.sales)}</td></>}{receiptsMode&&<><td className="period-report-money">{money(d.received)}</td><td className="period-report-money">{money(d.referral)}</td></>}{kind==='complete'&&<><td className="period-report-money">{money(d.outflows)}</td><td className="period-report-money">{money(d.netMovement)}</td></>}</tr>)}
   <tr className="period-report-total"><td>Total</td>{salesMode&&<><td>{t.count}</td><td className="period-report-money">{money(t.sales)}</td></>}{receiptsMode&&<><td className="period-report-money">{money(t.received)}</td><td className="period-report-money">{money(t.referral)}</td></>}{kind==='complete'&&<><td className="period-report-money">{money(t.outflows)}</td><td className="period-report-money">{money(t.netMovement)}</td></>}</tr>
  </Table>
  {salesMode&&<Table title="O que foi vendido" description="Produtos e clientes das vendas criadas no período. Canceladas aparecem para conferência e não somam nas vendas." headers={['Data / venda','Cliente','Produtos','Forma','Total','Situação / saldo atual']} empty={!report.sales.length}>
   {report.sales.map(s=><tr key={s.id}><td>{dateLabel(s.day)}<small>Venda #{s.number}</small></td><td>{s.customer}</td><td>{s.products}</td><td>{s.payment_method||'Não informada'}</td><td className="period-report-money">{money(s.total_cents)}</td><td>{s.status}<small>{s.status==='Ativa'?<>A receber: <span className="period-report-money">{money(s.balance)}</span></>:'Excluída dos totais'}</small></td></tr>)}
  </Table>}
  {receiptsMode&&<Table title="Pagamentos das vendas e estornos" description="Cada lançamento é contado uma vez. Valores negativos são estornos. Indicação é abatimento sem entrada financeira." headers={['Data','Venda / cliente','Referência','Forma','Valor']} empty={!report.receipts.length}>
   {report.receipts.map(r=><tr key={r.id}><td>{dateLabel(r.day)}</td><td>#{r.saleNumber} · {r.customer}</td><td>{r.purpose}</td><td>{r.methodLabel}</td><td className={'period-report-money'+(r.amount<0?' period-report-negative':'')}>{money(r.amount)}</td></tr>)}
  </Table>}
  {kind==='complete'&&<><Table title="Compras do período" description="Data do cadastro da compra; a saída financeira aparece na data do pagamento, na seção seguinte." headers={['Data','Produto','Fornecedor','Valor','Situação atual']} empty={!report.purchases.length}>
   {report.purchases.map(p=><tr key={p.id}><td>{dateLabel(p.day)}</td><td>{p.product}</td><td>{p.seller}</td><td className="period-report-money">{money(p.amount)}</td><td>{p.paid?'Paga':'Pendente'}</td></tr>)}
  </Table>
  <Table title="Movimentações financeiras" description="Conferência do financeiro. Os pagamentos acima já estão nestes movimentos: não some as duas seções. Créditos de indicação não geram movimento de caixa." headers={['Data','Descrição','Forma','Entrada','Saída']} empty={!report.ledger.length}>
   {report.ledger.map(l=><tr key={l.id}><td>{dateLabel(l.day)}</td><td>{l.description}</td><td>{l.method}</td><td className="period-report-money">{l.amount>0?money(l.amount):'—'}</td><td className="period-report-money">{l.amount<0?money(-l.amount):'—'}</td></tr>)}
   {!!report.ledger.length&&<tr className="period-report-total"><td colSpan={3}>Totais financeiros</td><td className="period-report-money">{money(t.inflows)}</td><td className="period-report-money">{money(t.outflows)}</td></tr>}
  </Table></>}
  <footer className="period-report-footer">{store} · Relatório interno gerencial · Documento não fiscal. Valores conforme os registros disponíveis na atualização indicada.</footer>
 </div>;
}
export function PeriodReportModule({storeId,store,role}:{storeId:string;store:string;role:string}){
 const canView=!!storeId&&['admin','gerente','financeiro'].includes(role);
 const [seller,setSeller]=useState(''),[method,setMethod]=useState('');
 const [kind,setKind]=useState<ReportKind>('sales');
 const [range,setRange]=useState<ReportRange>(()=>reportPreset(1,isoToday())),[preset,setPreset]=useState(1),[snapshot,setSnapshot]=useState<Snapshot|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[printSnapshot,setPrintSnapshot]=useState<PrintSnapshot|null>(null);
 const request=useRef(0);
 useEffect(()=>{if(!canView)return;let alive=true;const id=++request.current;void fetchSnapshot(storeId).then(next=>{if(alive&&id===request.current){setSnapshot(next);setError('');}}).catch(e=>{if(alive&&id===request.current)setError((e as Error).message)}).finally(()=>{if(alive&&id===request.current)setBusy(false)});return()=>{alive=false;};},[storeId,canView]);
 const rangeError=reportRangeError(range);
 const report=useMemo(()=>snapshot&&!rangeError?buildPeriodReport(filterRetailReport(snapshot.data,seller,method),storeId,range,isoToday()):null,[snapshot,storeId,range,rangeError,seller,method]);
 useEffect(()=>{if(!printSnapshot)return;let second=0;const done=()=>setPrintSnapshot(null);window.addEventListener('afterprint',done);const first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>window.print())});return()=>{cancelAnimationFrame(first);cancelAnimationFrame(second);window.removeEventListener('afterprint',done)};},[printSnapshot]);
 async function refresh(print=false){const id=++request.current;setBusy(true);setError('');setPrintSnapshot(null);try{const next=await fetchSnapshot(storeId);if(id!==request.current)return;setSnapshot(next);if(print)setPrintSnapshot({report:buildPeriodReport(filterRetailReport(next.data,seller,method),storeId,range,isoToday()),store,at:next.at,kind});}catch(e){if(id===request.current)setError((e as Error).message)}finally{if(id===request.current)setBusy(false)}}
 if(!canView)return <section className="panel"><div className="empty"><strong>{!storeId?'Entre na sua conta para acessar os relatórios.':'Relatório completo disponível para administração, gerência e financeiro.'}</strong></div></section>;
 return <section className="panel period-report-panel"><div className="panel-head"><div><h2><CalendarDays size={20} aria-hidden="true"/>Relatórios por período</h2><p>Escolha o relatório de vendas ou de recebimentos. Depois selecione o período para consultar e imprimir.</p></div></div>
  <div className="period-report-controls"><div className="period-report-types" role="group" aria-label="Tipo de relatório">{(['sales','receipts','complete'] as ReportKind[]).map(type=><button type="button" className={'btn '+(kind===type?'primary':'secondary')} aria-pressed={kind===type} disabled={busy} key={type} onClick={()=>{setKind(type);setPrintSnapshot(null)}}>{reportTitles[type]}</button>)}</div><div className="period-report-presets" role="group" aria-label="Período do relatório">{[[1,'Hoje'],[7,'7 dias'],[15,'15 dias'],[30,'30 dias']].map(([days,label])=><button type="button" className={'btn '+(preset===days?'primary':'secondary')} aria-pressed={preset===days} key={days} disabled={busy} onClick={()=>{setRange(reportPreset(Number(days),isoToday()));setPreset(Number(days));setPrintSnapshot(null)}}>{label}</button>)}</div><div className="period-report-dates"><label className="field"><span>Vendedor</span><select value={seller} onChange={e=>{setSeller(e.target.value);setPrintSnapshot(null)}}><option value="">Todos</option>{Array.from(new Set((snapshot?.data.sales||[]).map(s=>s.seller_label).filter(Boolean))).map(s=><option key={s}>{s}</option>)}</select></label><label className="field"><span>Forma de pagamento</span><select value={method} onChange={e=>{setMethod(e.target.value);setPrintSnapshot(null)}}><option value="">Todas</option>{['PIX','Dinheiro','Débito','Crédito','Transferência','Carnê','Boleto','Programa de indicação'].map(m=><option key={m}>{m}</option>)}</select></label><label className="field"><span>Data inicial</span><input type="date" value={range.start} disabled={busy} onChange={e=>{setRange({...range,start:e.target.value});setPreset(0);setPrintSnapshot(null)}}/></label><label className="field"><span>Data final</span><input type="date" value={range.end} disabled={busy} onChange={e=>{setRange({...range,end:e.target.value});setPreset(0);setPrintSnapshot(null)}}/></label><button type="button" className="btn secondary" disabled={busy} onClick={()=>void refresh()}><RefreshCw size={16} aria-hidden="true"/>{busy?'Carregando…':'Atualizar'}</button><button type="button" className="btn primary" disabled={busy||!!rangeError||!report||!!error} onClick={()=>void refresh(true)}><Printer size={16} aria-hidden="true"/>{kind==='sales'?'Imprimir vendas / PDF':kind==='receipts'?'Imprimir recebimentos / PDF':'Imprimir completo / PDF'}</button></div><p>7, 15 e 30 dias incluem hoje. Você também pode escolher as datas acima.</p></div>
  {rangeError&&<p className="error" role="alert">{rangeError}</p>}{error&&<p className="error" role="alert">{error} Tente atualizar novamente.</p>}{busy?<div className="empty" role="status">Conferindo todos os registros da loja…</div>:!error&&report&&snapshot?<PeriodReportContent report={report} store={store} at={snapshot.at} kind={kind}/>:null}
  {printSnapshot&&createPortal(<div className="period-report-print"><PeriodReportContent report={printSnapshot.report} store={printSnapshot.store} at={printSnapshot.at} kind={printSnapshot.kind}/></div>,document.body)}
 </section>;
}
