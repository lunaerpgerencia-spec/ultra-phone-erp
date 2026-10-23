import type {Row,DataSet} from './data';
export function openNotes(data:DataSet,sale:Row):Array<Row&{balance:number}>{
 if(sale.status!=='Ativa')return [];
 return data.installments.filter(p=>p.sale_id===sale.id&&!p.canceled).map((p):Row&{balance:number}=>({...p,balance:Number(p.amount_cents)-data.receipts.filter(r=>r.installment_id===p.id).reduce((sum,r)=>sum+Number(r.amount_cents),0)})).filter(p=>p.balance>0).sort((a,b)=>a.number-b.number);
}
export function brazilToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
// Standard PDF fonts use WinAnsi; octal escapes keep offsets byte-exact.
function literal(s:string){return '('+Array.from(s).map(c=>{const n=c.charCodeAt(0);return n>=32&&n<=126&&!['(',')','\\'].includes(c)?c:'\\'+(n<=255?n:63).toString(8).padStart(3,'0')}).join('')+')'}
export function notePDF(sale:Row,notes:Row[],debtor:Row,creditor:string){
 const objects:string[]=['','<< /Type /Catalog /Pages 2 0 R >>','','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'];
 const pages:number[]=[];
 const money=(n:number)=>(n/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
 const date=(s:string)=>s.slice(0,10).split('-').reverse().join('/');
 for(let start=0;start<notes.length;start+=3){
  let stream='';
  notes.slice(start,start+3).forEach((p,i)=>{
   const top=810-i*264;let y=top;let body='';
   function line(s:string,size=9){const limit=Math.floor(510/(size*.56));const words=s.split(/\s+/).flatMap(w=>w.match(new RegExp(`.{1,${limit}}`,'g'))||[]);let row='';for(const word of words){if((row+' '+word).length>limit&&row){draw(row,size);row=''}row+=(row?' ':'')+word}if(row)draw(row,size)}
   function draw(s:string,size:number){body+=`BT /F1 ${size} Tf 1 0 0 1 38 ${y} Tm ${literal(s)} Tj ET\n`;y-=size+4}
   line('NOTA PROMISSÓRIA - '+creditor,12);
   line(`Venda ${sale.number} | Parcela ${p.number} | Ref. ${String(p.id).slice(0,8)}`);
   line(`VALOR: ${money(p.balance)}   VENCIMENTO: ${date(p.due_date)}`,11);
   line(`Por esta nota promissória, prometo pagar, pura e simplesmente, a ${creditor}, ou à sua ordem, a quantia de ${money(p.balance)}, no vencimento acima.`);
   line('Local de pagamento: __________________________________________________________');
   line('Emitente: '+(debtor.name||'________________________________'));
   line(`CPF: ${debtor.document||'________________'}   RG: ${debtor.rg||'________________'}   Telefone: ${debtor.phone||'________________'}`);
   line('Endereço: '+(debtor.address||'__________________________________________________'));
   line('Local e data de emissão: ______________________________, ____/____/________');
   y-=12;line('______________________________________________________');line('Assinatura do emitente (devedor)',8);
   line('Conferir dados, locais, valor e pagamentos anteriores antes de assinar. Não é boleto nem nota fiscal.',7);
   const scale=Math.min(1,232/(top-y));
   stream+=`q ${scale} 0 0 ${scale} ${38*(1-scale)} ${top*(1-scale)} cm\n${body}Q\n[3 3] 0 d 30 ${top-245} m 565 ${top-245} l S\n`;
  });
  const content=objects.length;objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
  const page=objects.length;objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 3 0 R >> >> /Contents ${content} 0 R >>`);pages.push(page);
 }
 objects[2]=`<< /Type /Pages /Kids [${pages.map(p=>p+' 0 R').join(' ')}] /Count ${pages.length} >>`;
 let pdf='%PDF-1.4\n';const offsets=[0];for(let i=1;i<objects.length;i++){offsets[i]=pdf.length;pdf+=`${i} 0 obj\n${objects[i]}\nendobj\n`}const xref=pdf.length;
 pdf+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 return new Blob([pdf],{type:'application/pdf'});
}
