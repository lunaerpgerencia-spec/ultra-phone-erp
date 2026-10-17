import assert from 'node:assert/strict';
import {GET} from '../app/api/cep/[cep]/route.ts';
const original=globalThis.fetch;let calls=0;const request=cep=>GET(new Request('http://localhost/api/cep/'+cep),{params:Promise.resolve({cep})});
try{
 globalThis.fetch=async(url)=>{calls++;assert.equal(url,'https://viacep.com.br/ws/20040002/json/');return Response.json({cep:'20040-002',logradouro:'Rua teste',bairro:'Centro',localidade:'Rio de Janeiro',uf:'RJ'})};
 assert.equal((await request('123')).status,400);assert.equal(calls,0);const found=await request('20040002');assert.equal(found.status,200);const address=await found.json();assert.equal(address.city,'Rio de Janeiro');assert.equal(address.state,'RJ');
 globalThis.fetch=async()=>Response.json({erro:true});assert.equal((await request('99999999')).status,404);
 globalThis.fetch=async()=>{throw Error('timeout')};assert.equal((await request('20040002')).status,503);
 globalThis.fetch=async()=>Response.json({unexpected:true});assert.equal((await request('20040002')).status,503);
 console.log('PASS CEP: formato inválido, endereço encontrado, CEP inexistente e indisponibilidade tratados.');
}finally{globalThis.fetch=original}
