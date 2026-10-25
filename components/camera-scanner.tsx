'use client';
import {useEffect,useRef,useState} from 'react';
import {Camera} from 'lucide-react';

/** Camera stays inside the current form; never submits or records a sale. */
export function CameraScanner({onRead}:{onRead:(code:string)=>void}){
 const [active,setActive]=useState(false),[error,setError]=useState('');
 const video=useRef<HTMLVideoElement>(null),read=useRef(onRead);
 useEffect(()=>{read.current=onRead},[onRead]);
 useEffect(()=>{
  if(!active)return;
  let cancelled=false;
  let controls:{stop:()=>void}|undefined;
  const stop=()=>{controls?.stop();const stream=video.current?.srcObject;if(stream instanceof MediaStream)stream.getTracks().forEach(t=>t.stop());};
  void(async()=>{
   try{
    if(!window.isSecureContext)throw Error('Abra o sistema pelo link HTTPS para usar a câmera.');
    if(!navigator.mediaDevices?.getUserMedia)throw Error('Este navegador não permite câmera. Abra no Safari ou Chrome, ou digite o código.');
    const {BrowserMultiFormatReader}=await import('@zxing/browser');
    if(cancelled||!video.current)return;
    const reader=new BrowserMultiFormatReader();
    const started=await reader.decodeFromConstraints({audio:false,video:{facingMode:{ideal:'environment'}}},video.current,(result,_error,c)=>{
     if(cancelled||!result)return;
     const code=result.getText().trim();
     if(!code)return;
     cancelled=true;c.stop();setActive(false);read.current(code);
    });
    controls=started;
    if(cancelled)started.stop();
   }catch(e){
    if(cancelled)return;
    stop();setActive(false);
    const name=e instanceof Error?e.name:'';
    setError(name==='NotAllowedError'?'Permita o acesso à câmera nas configurações do navegador e tente novamente.':name==='NotFoundError'?'Nenhuma câmera encontrada. Você pode digitar o código.':name==='NotReadableError'?'A câmera está ocupada. Feche outros aplicativos e tente novamente.':e instanceof Error?e.message:'Não foi possível abrir a câmera. Digite o código ou tente novamente.');
   }
  })();
  return()=>{cancelled=true;stop();};
 },[active]);
 return <div style={{margin:'8px 0'}}>{!active?<button type="button" className="btn secondary" onClick={()=>{setError('');setActive(true)}}><Camera size={17}/>Ler código pela câmera</button>:<div><p role="status">Aponte a câmera para o código de barras da etiqueta.</p><video ref={video} autoPlay muted playsInline aria-label="Câmera para leitura de código de barras" style={{width:'100%',maxWidth:480,maxHeight:280,objectFit:'cover',borderRadius:12,background:'#000'}}/><p><button type="button" className="btn secondary" onClick={()=>setActive(false)}>Fechar câmera</button></p></div>}{error&&<p role="alert">{error}</p>}</div>;
}
