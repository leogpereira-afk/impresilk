'use strict';
/* C2 DA AUDITORIA DE 12/10/2026: o 409 da porta deletePhoto (a foto que o
   servidor preserva) saía da fila do aparelho calado, como se a foto tivesse
   sido apagada (no fbc56b9: fila vazia e nenhum aviso). Agora sai da fila com
   o aviso na tela ("A foto não foi apagada no servidor: ..."). Dados
   fictícios. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs'),vm=require('node:vm');
async function lojaCom(resposta,proxima){
  const ls=new Map([['impresilk_inst_os','[]'],['impresilk_inst_fila','[]'],['impresilk_inst_user',JSON.stringify({nome:'Gestor',papel:'pcp'})]]);
  const db={transaction(){const tx={objectStore:()=>({get(){const r={};queueMicrotask(()=>r.onsuccess?.({target:{result:null}}));return r;},put(){queueMicrotask(()=>tx.oncomplete?.());},delete(){queueMicrotask(()=>tx.oncomplete?.());}})};return tx;}};
  const ctx=vm.createContext({console:{log(){},warn(){},error(){}},navigator:{onLine:true},window:{addEventListener(){}},
    localStorage:{getItem:k=>ls.get(k)||null,setItem:(k,v)=>ls.set(k,v),removeItem:k=>ls.delete(k)},
    indexedDB:{open(){const r={};queueMicrotask(()=>r.onsuccess({target:{result:db}}));return r;}},
    setTimeout:()=>1,clearTimeout(){},AbortController,API_BASE:'http://teste',
    fetch:async()=>proxima?proxima():resposta});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','store.js'),'utf8'),ctx);
  const S=vm.runInContext('STORE',ctx);await S.pronto();
  return S;
}
/* Revisão da onda auditoria, item 11: só o 409 `definitivo` (a foto
   preservada para recuperar uma O.S. excluída) sai da fila. O 409 passageiro
   ("Não foi possível conferir todas as referências da foto") fica na fila,
   com o motivo dito uma vez, e a tentativa seguinte apaga. */
test('C2: o 409 definitivo do deletePhoto ("Foto preservada...") sai da fila com aviso na tela',async()=>{
  const erro='Foto preservada para recuperar uma O.S. excluída. Solicite revisão à gestão.';
  const S=await lojaCom({ok:false,status:409,json:async()=>({error:erro,definitivo:true})});
  const avisos=[];S.on('item-aviso',x=>avisos.push(x.avisos.join(' ')));
  S.delFotoSync('foto_1_1760000000001_abc1','motivo fictício da foto');
  await new Promise(r=>setImmediate(r));await S.trySync();
  assert.equal(S.getQueue().length,0,'sai da fila (a mesma resposta voltaria)');
  assert.deepEqual(avisos,['A foto não foi apagada no servidor: '+erro]);
});
test('C2: o 409 passageiro do deletePhoto ("Não foi possível conferir...") fica na fila, e a tentativa seguinte apaga',async()=>{
  const erro='Não foi possível conferir todas as referências da foto. Arquivo preservado.';
  // A gravação já tenta uma vez (delFotoSync); depois, duas tentativas passageiras e a que apaga.
  const passageiro={ok:false,status:409,json:async()=>({error:erro})};
  const respostas=[passageiro,passageiro,passageiro,{ok:true,status:200,json:async()=>({ok:true})}];
  const S=await lojaCom(null,()=>respostas.shift());
  const avisos=[],pendentes=[];S.on('item-aviso',x=>avisos.push(x));S.on('item-pendente',x=>pendentes.push(x.motivo));
  S.delFotoSync('foto_1_1760000000001_abc1','motivo fictício da foto');
  await new Promise(r=>setImmediate(r));await S.trySync();
  assert.equal(S.getQueue().length,1,'o pedido de apagar continua na fila');
  assert.equal(S.getQueue()[0].action,'deletePhoto');
  await S.trySync();
  assert.equal(S.getQueue().length,1);
  assert.deepEqual(pendentes,['exclusão pendente: '+erro],'o motivo é dito uma vez');
  await S.trySync();
  assert.equal(S.getQueue().length,0,'a tentativa seguinte apaga');
  assert.deepEqual(avisos,[]);
});
test('C2: a foto apagada de verdade sai da fila sem aviso',async()=>{
  const S=await lojaCom({ok:true,status:200,json:async()=>({ok:true})});
  const avisos=[];S.on('item-aviso',x=>avisos.push(x));
  S.delFotoSync('foto_1_1760000000001_abc1','motivo fictício da foto');
  await new Promise(r=>setImmediate(r));await S.trySync();
  assert.equal(S.getQueue().length,0);assert.deepEqual(avisos,[]);
});
test('C2: no servidor, a foto preservada para recuperar uma O.S. excluída é o 409 definitivo',async()=>{
  const {edge}=require('./helpers/edge.cjs');
  const e=await edge('pcp-sync',{pcp_registros:[{colecao:'os',id:'X',apagado:true,atualizado_em:'2026-10-01T00:00:00Z',registro:{id:'X',numero:'9901',cliente:'Cliente fictício',layoutFotoId:'foto_preservada_1'}}],
    registros:[],pcp_config_global:[{id:true,atualizado_em:'2020-01-01',config:{}}]});
  const r=await e.call({action:'deletePhoto',fileId:'foto_preservada_1',motivo:'motivo fictício da foto'},{papel:'pcp',sub:'gestor',nome:'Gestor fictício'});
  assert.equal(r.status,409);
  assert.equal(r.definitivo,true,'sem a marca, o aparelho manteria o pedido na fila para sempre');
});
