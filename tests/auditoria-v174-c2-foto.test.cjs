'use strict';
/* C2 DA AUDITORIA DE 12/10/2026: o 409 da porta deletePhoto (a foto que o
   servidor preserva) saía da fila do aparelho calado, como se a foto tivesse
   sido apagada (no fbc56b9: fila vazia e nenhum aviso). Agora sai da fila com
   o aviso na tela ("A foto não foi apagada no servidor: ..."). Dados
   fictícios. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs'),vm=require('node:vm');
async function lojaCom(resposta){
  const ls=new Map([['impresilk_inst_os','[]'],['impresilk_inst_fila','[]'],['impresilk_inst_user',JSON.stringify({nome:'Gestor',papel:'pcp'})]]);
  const db={transaction(){const tx={objectStore:()=>({get(){const r={};queueMicrotask(()=>r.onsuccess?.({target:{result:null}}));return r;},put(){queueMicrotask(()=>tx.oncomplete?.());},delete(){queueMicrotask(()=>tx.oncomplete?.());}})};return tx;}};
  const ctx=vm.createContext({console:{log(){},warn(){},error(){}},navigator:{onLine:true},window:{addEventListener(){}},
    localStorage:{getItem:k=>ls.get(k)||null,setItem:(k,v)=>ls.set(k,v),removeItem:k=>ls.delete(k)},
    indexedDB:{open(){const r={};queueMicrotask(()=>r.onsuccess({target:{result:db}}));return r;}},
    setTimeout:()=>1,clearTimeout(){},AbortController,API_BASE:'http://teste',
    fetch:async()=>resposta});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','store.js'),'utf8'),ctx);
  const S=vm.runInContext('STORE',ctx);await S.pronto();
  return S;
}
for(const erro of ['Foto preservada para recuperar uma O.S. excluída. Solicite revisão à gestão.','Não foi possível conferir todas as referências da foto. Arquivo preservado.'])
  test('C2: o 409 do deletePhoto ("'+erro.slice(0,30)+'...") sai da fila com aviso na tela',async()=>{
    const S=await lojaCom({ok:false,status:409,json:async()=>({error:erro})});
    const avisos=[];S.on('item-aviso',x=>avisos.push(x.avisos.join(' ')));
    S.delFotoSync('foto_1_1760000000001_abc1','motivo fictício da foto');
    await new Promise(r=>setImmediate(r));await S.trySync();
    assert.equal(S.getQueue().length,0,'sai da fila (a mesma resposta voltaria)');
    assert.deepEqual(avisos,['A foto não foi apagada no servidor: '+erro]);
  });
test('C2: a foto apagada de verdade sai da fila sem aviso',async()=>{
  const S=await lojaCom({ok:true,status:200,json:async()=>({ok:true})});
  const avisos=[];S.on('item-aviso',x=>avisos.push(x));
  S.delFotoSync('foto_1_1760000000001_abc1','motivo fictício da foto');
  await new Promise(r=>setImmediate(r));await S.trySync();
  assert.equal(S.getQueue().length,0);assert.deepEqual(avisos,[]);
});
