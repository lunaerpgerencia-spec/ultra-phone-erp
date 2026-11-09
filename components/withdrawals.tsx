'use client';
import {useMemo,useState,type FormEvent} from 'react';
import {rpc,type DataSet,type Row} from '@/lib/data';
import {cents,money,isoToday,dateLabel} from '@/lib/domain';

type WithdrawalForm={id:string;withdrawal_date:string;amount:string;method:string;account_label:string;destination:string;recipient:string;reason:string;reference:string;notes:string};
const newForm=():WithdrawalForm=>({id:crypto.randomUUID(),withdrawal_date:isoToday(),amount:'',method:'Dinheiro',account_label:'Caixa físico',destination:'',recipient:'',reason:'',reference:'',notes:''});
const cell=(v:unknown)=>{const t=String(v??'');return '"'+( /^[=+\-@]/.test(t)?"'"+t:t).replaceAll('"','""')+'"'};
export function Withdrawals({data,storeId,role,onSaved}:{data:DataSet;storeId:string;role:string;onSaved:()=>Promise<void>}){
 const [form,setForm]=useState<WithdrawalForm|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [from,setFrom]=useState(()=>isoToday().slice(0,7)+'-01'),[to,setTo]=useState(isoToday());
 const rows=useMemo(()=>(data.withdrawals||[]).filter(x=>x.withdrawal_date>=from&&x.withdrawal_date<=to).sort((a,b)=>b.withdrawal_date.localeCompare(a.withdrawal_date)||b.created_at.localeCompare(a.created_at)),[data.withdrawals,from,to]);
 const cash=rows.filter(x=>x.method==='Dinheiro').reduce((sum,x)=>sum+Number(x.amount_cents),0);
 const bank=rows.filter(x=>x.method!=='Dinheiro').reduce((sum,x)=>sum+Number(x.amount_cents),0);
 const allowed=['admin','gerente','financeiro'].includes(role);
 const change=(key:keyof WithdrawalForm,value:string)=>setForm(current=>current?{...current,[key]:value}:null);
 async function save(e:FormEvent){e.preventDefault();if(!form||busy)return;setBusy(true);setError('');
  try{
   await rpc('record_withdrawal',{p_store:storeId,p_id:form.id,p_data:{...form,amount_cents:cents(form.amount)}});
   setForm(null);await onSaved();
  }catch(ex){setError((ex as Error).message)}finally{setBusy(false)}
 }
 function exportCSV(){const names=['Data','Tipo','Valor','Forma','Origem','Destino','Recebedor','Motivo','Comprovante','Observações','Registrado em'];const values=rows.map(x=>[x.withdrawal_date,x.kind,(Number(x.amount_cents)/100).toFixed(2),x.method,x.account_label,x.destination,x.recipient,x.reason,x.reference,x.notes,x.created_at]);const csv='\ufeff'+[names,...values].map(r=>r.map(cell).join(';')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='ultra-fone-retiradas.csv';a.click();URL.revokeObjectURL(url)}
 if(!storeId)return <section className="panel"><h2>Retiradas e sangrias</h2><p>Selecione sua loja.</p></section>;
 if(!allowed)return <section className="panel"><h2>Retiradas e sangrias</h2><p>Somente administração e financeiro podem consultar e registrar retiradas.</p></section>;
 return <section className="panel retail-expenses"><div className="panel-head"><div><h2>Retiradas e sangrias</h2><p>Registre cada saída, para onde foi o valor e qual conta foi movimentada. Sangria retira dinheiro físico da gaveta; Pix e transferência saem da conta informada.</p></div><button type="button" className="btn primary" disabled={busy} onClick={()=>{setError('');setForm(newForm())}}>Nova retirada</button></div>
 <div className="form-grid"><label className="field"><span>De</span><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="field"><span>Até</span><input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div>
 <div className="report-grid">{[['Total retirado',cash+bank],['Sangrias em dinheiro',cash],['Pix e transferências',bank]].map(([name,value])=><div key={name} className="report-card"><span>{name}</span><strong>{money(Number(value))}</strong></div>)}</div>
 <div className="operations-actions"><button type="button" className="btn secondary" disabled={!rows.length} onClick={exportCSV}>Exportar histórico CSV</button><button type="button" className="btn secondary" onClick={()=>window.print()}>Imprimir histórico</button></div>
 {error&&<p className="error" role="alert">{error}</p>}
 {form&&<form className="operations-form" onSubmit={save}><h3>Registrar saída de valor</h3><fieldset disabled={busy}><div className="form-grid">
 <label className="field"><span>Data da saída</span><input required type="date" max={isoToday()} value={form.withdrawal_date} onChange={e=>change('withdrawal_date',e.target.value)}/></label>
 <label className="field"><span>Forma da saída</span><select value={form.method} onChange={e=>setForm(f=>f?{...f,method:e.target.value,account_label:e.target.value==='Dinheiro'?'Caixa físico':f.account_label==='Caixa físico'?'Conta bancária':f.account_label}:null)}><option>Dinheiro</option><option>PIX</option><option>Transferência</option></select></label>
 <label className="field"><span>Valor retirado (R$)</span><input required type="number" min="0.01" step="0.01" value={form.amount} onChange={e=>change('amount',e.target.value)}/></label>
 <label className="field"><span>Origem do valor / conta</span><input required minLength={2} value={form.account_label} readOnly={form.method==='Dinheiro'} onChange={e=>change('account_label',e.target.value)} placeholder="Caixa físico ou nome da conta bancária"/></label>
 <label className="field"><span>Para onde foi / destino</span><input required minLength={2} value={form.destination} onChange={e=>change('destination',e.target.value)} placeholder="Conta, pessoa, fornecedor ou local"/></label>
 <label className="field"><span>Quem recebeu (opcional)</span><input value={form.recipient} onChange={e=>change('recipient',e.target.value)} placeholder="Nome do destinatário"/></label>
 <label className="field"><span>Motivo</span><input required minLength={3} value={form.reason} onChange={e=>change('reason',e.target.value)} placeholder="Retirada do sócio, repasse, depósito..."/></label>
 <label className="field"><span>Comprovante / referência (opcional)</span><input value={form.reference} onChange={e=>change('reference',e.target.value)} placeholder="Identificador do Pix, banco ou recibo"/></label>
 <label className="field"><span>Observações (opcional)</span><input value={form.notes} onChange={e=>change('notes',e.target.value)}/></label>
 </div><p>Para sangria em dinheiro, o caixa do operador precisa estar aberto e ter saldo. A saída será descontada do saldo esperado. Lançamentos ficam no histórico para auditoria.</p><div className="operations-actions"><button type="button" className="btn secondary" onClick={()=>setForm(null)}>Cancelar</button><button className="btn primary" type="submit">{busy?'Registrando…':'Confirmar retirada'}</button></div></fieldset></form>}
 <div className="table-wrap"><table><thead><tr><th>Data / registro</th><th>Tipo</th><th>Origem</th><th>Destino / recebedor</th><th>Motivo / referência</th><th>Valor</th></tr></thead><tbody>{rows.map((x:Row)=><tr key={x.id}><td>{dateLabel(x.withdrawal_date)}<small>{new Date(x.created_at).toLocaleString('pt-BR')}</small></td><td>{x.kind}<small>{x.method}</small></td><td>{x.account_label}</td><td>{x.destination}<small>{x.recipient}</small></td><td>{x.reason}<small>{x.reference||x.notes}</small></td><td>{money(x.amount_cents)}</td></tr>)}{rows.length===0&&<tr><td colSpan={6}>Nenhuma retirada no período.</td></tr>}</tbody></table></div>
 </section>;
}
