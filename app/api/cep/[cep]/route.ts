export async function GET(_request:Request,{params}:{params:Promise<{cep:string}>}){
 const {cep}=await params;
 if(!/^\d{8}$/.test(cep))return Response.json({error:'Informe um CEP com 8 números.'},{status:400});
 try{
  const response=await fetch(`https://viacep.com.br/ws/${cep}/json/`,{signal:AbortSignal.timeout(8000),next:{revalidate:86400}});
  if(!response.ok)throw Error('Serviço indisponível');
  const data=await response.json();
  if(data.erro)return Response.json({error:'CEP não encontrado. Confira o número ou preencha o endereço manualmente.'},{status:404});
  if(typeof data.localidade!=='string'||typeof data.uf!=='string')throw Error('Resposta inválida');
  return Response.json({cep:data.cep||cep,street:String(data.logradouro||''),neighborhood:String(data.bairro||''),city:data.localidade,state:data.uf});
 }catch{return Response.json({error:'Não foi possível consultar o CEP agora. Tente novamente ou preencha o endereço manualmente.'},{status:503})}
}
