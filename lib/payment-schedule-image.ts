import type {PaymentSchedule} from './payment-schedule';
import {scheduleStatus} from './payment-schedule';

// Draw the registered amounts and statuses exactly; no screenshots or third-party service.
export async function paymentScheduleImages(schedule:PaymentSchedule,store:string):Promise<File[]>{
 const pages=Math.max(1,Math.ceil(schedule.rows.length/24)),files:File[]=[];
 const money=(n:number)=>(n/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),date=(s:string)=>s.split('-').reverse().join('/');
 for(let page=0;page<pages;page++){
  const rows=schedule.rows.slice(page*24,(page+1)*24),canvas=document.createElement('canvas');
  canvas.width=1080;canvas.height=440+rows.length*72+200;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Não foi possível gerar a imagem neste navegador.');
  ctx.fillStyle='#f8fafc';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#061b36';ctx.fillRect(0,0,1080,290);ctx.fillStyle='#48b7ff';ctx.font='bold 30px Arial';ctx.fillText(store,48,52);
  ctx.fillStyle='#ffffff';ctx.font='bold 32px Arial';ctx.fillText('CRONOGRAMA DE PAGAMENTOS',48,104);
  const fit=(text:string,maxWidth:number)=>{let t=text;while(t.length>1&&ctx.measureText(t).width>maxWidth)t=t.slice(0,-1);return t.length<text.length?t+'…':t};
  ctx.font='26px Arial';ctx.fillText(fit(schedule.product,960),48,150);ctx.font='24px Arial';ctx.fillText(fit('Cliente: '+schedule.customerName,960),48,194);
  ctx.fillStyle='#bedcff';ctx.font='21px Arial';ctx.fillText(`Venda #${schedule.number} · ${schedule.paymentCount} pagamentos · ${schedule.paidCount} quitados`,48,238);
  ctx.fillStyle='#0f172a';ctx.font='bold 24px Arial';ctx.fillText('DATA',48,340);ctx.fillText('VALOR',300,340);ctx.fillText('SITUAÇÃO',588,340);
  let y=365;
  for(const row of rows){
   const paid=row.status==='paid',trade=row.status==='trade';ctx.fillStyle=paid?'#dcfce7':trade?'#dbeafe':row.status==='partial'?'#fef3c7':row.status==='late'?'#fee2e2':'#ffffff';ctx.fillRect(36,y,1008,66);
   ctx.fillStyle=paid?'#14532d':trade?'#1e40af':'#172033';ctx.font='25px Arial';ctx.fillText(date(row.date),48,y+28);ctx.fillText(money(row.amount),300,y+28);ctx.font='bold 22px Arial';ctx.fillText(scheduleStatus(row),588,y+28);
   ctx.font='17px Arial';ctx.fillText(row.label,48,y+53);if(row.status==='partial')ctx.fillText(`Recebido ${money(row.paid)} · Falta ${money(row.balance)}`,588,y+53);
   y+=72;
  }
  y+=35;ctx.fillStyle='#0f172a';ctx.font='bold 27px Arial';ctx.fillText('VALOR TOTAL: '+money(schedule.total),48,y);
  ctx.font='24px Arial';ctx.fillText('Recebido: '+money(schedule.received),48,y+42);ctx.fillText('Saldo restante: '+money(schedule.balance),540,y+42);
  if(schedule.trade)ctx.fillText('Abatido na troca: '+money(schedule.trade),48,y+80);
  ctx.fillStyle='#475569';ctx.font='18px Arial';const payments=schedule.rows.filter(r=>r.kind!=='trade');if(payments.length)ctx.fillText(`Primeiro: ${date(payments[0].date)} · Último: ${date(payments[payments.length-1].date)}`,48,canvas.height-94);
  ctx.fillText('Verde = pagamento registrado · Valores em reais',48,canvas.height-62);
  ctx.fillText(`Atualizado em ${new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo'}).format(new Date())} · Página ${page+1}/${pages}`,48,canvas.height-30);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Não foi possível preparar a tabela.')),'image/png'));
  files.push(new File([blob],`cronograma-venda-${schedule.number}-pagina-${page+1}.png`,{type:'image/png'}));
 }
 return files;
}
