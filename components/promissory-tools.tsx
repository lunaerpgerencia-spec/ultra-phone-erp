'use client';
import {useEffect,useState} from 'react';
import type {DataSet,Row} from '@/lib/data';
import {openNotes,notePDF,brazilToday} from '@/lib/promissory';
import {money,dateLabel} from '@/lib/domain';

export function ShareNotes({sale,data,creditor}:{sale:Row;data:DataSet;creditor:string}){
 const [file,setFile]=useState<File|null>(null),[message,setMessage]=useState('');
 const debtor=sale.customer_snapshot||data.customers.find(c=>c.id===sale.customer_id)||{};
 const notes=openNotes(data,sale);
 const fingerprint=JSON.stringify([sale.id,debtor,creditor,notes]);
 useEffect(()=>{setFile(null);setMessage('')},[fingerprint]);
 function prepare(){setFile(new File([notePDF(sale,notes,debtor,creditor)],`promissorias-venda-${sale.number}.pdf`,{type:'application/pdf'}));setMessage('PDF com 3 promissórias por folha. Escolha o WhatsApp no compartilhamento. Se indisponível, baixe o PDF e anexe na conversa.');}
 async function share(){if(!file)return;try{if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:`Promissórias da venda ${sale.number}`});}else setMessage('Este navegador não compartilha arquivos. Baixe o PDF, abra o WhatsApp e anexe o arquivo na conversa.')}catch(e){if((e as Error).name!=='AbortError')setMessage('Não foi possível compartilhar. Baixe o PDF e anexe no WhatsApp.')}}
 function download(){if(!file)return;const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000)}
 const digits=String(debtor.phone||'').replace(/\D/g,'');const phone=digits.length===10||digits.length===11?'55'+digits:/^55\d{10,11}$/.test(digits)?digits:'';
 return notes.length?<div className="note-share"><button type="button" className="btn secondary" onClick={prepare}>Enviar promissórias por WhatsApp</button>{file&&<div><p role="status">{message}</p><button type="button" className="btn secondary" onClick={()=>void share()}>Compartilhar PDF</button><button type="button" className="btn secondary" onClick={download}>Baixar PDF</button><a className="btn secondary" href={`https://wa.me/${phone}`} target="_blank" rel="noopener noreferrer">Abrir WhatsApp{phone?' do cliente':''}</a><button type="button" className="btn secondary" onClick={()=>setFile(null)}>Fechar</button></div>}</div>:null;
}

export function NoteDueAlerts({data,onOpen,onReload}:{data:DataSet;onOpen:()=>void;onReload:()=>Promise<void>}){
 const [today,setToday]=useState(brazilToday),[expanded,setExpanded]=useState(false);
 useEffect(()=>{const timer=setInterval(()=>{setToday(brazilToday());if(document.visibilityState==='visible')void onReload()},60000);const visible=()=>{if(document.visibilityState==='visible'){setToday(brazilToday());void onReload()}};document.addEventListener('visibilitychange',visible);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible)}},[onReload]);
 const due=data.sales.flatMap(s=>openNotes(data,s).filter(p=>p.due_date.slice(0,10)<=today).map(p=>({sale:s,note:p})));
 if(!due.length)return null;
 const now=due.filter(x=>x.note.due_date.slice(0,10)===today).length;
 return <section className="note-due-alert" role="status"><strong>Promissórias: {now} vencem hoje · {due.length-now} vencidas</strong><button className="btn secondary" onClick={()=>setExpanded(!expanded)}>{expanded?'Recolher':'Ver vencimentos'}</button><button className="btn secondary" onClick={onOpen}>Abrir promissórias</button>{expanded&&<div><p>Avisos dentro do sistema enquanto estiver aberto. Atualização a cada minuto. Parcelas quitadas e canceladas não aparecem.</p>{due.sort((a,b)=>a.note.due_date.localeCompare(b.note.due_date)).map(({sale,note})=><p key={note.id}>Venda #{sale.number} · {sale.customer_snapshot?.name||data.customers.find(c=>c.id===sale.customer_id)?.name||'Cliente'} · Parcela {note.number} · {dateLabel(note.due_date)} · {money(note.balance)}</p>)}</div>}</section>;
}
