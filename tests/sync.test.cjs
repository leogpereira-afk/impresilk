const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const OS='impresilk_inst_os', FILA='impresilk_inst_fila';
function store({lista=[],fila=[],responder=()=>({os:[]}),falhaMigracao=false}={}) {
  const ls=new Map([[OS,JSON.stringify(lista)],[FILA,JSON.stringify(fila)]]);
  const eventos=[], gravados=[];
  const db={transaction(_name,modo){
    const tx={objectStore:()=>({
      get(){const req={};queueMicrotask(()=>req.onsuccess?.({target:{result:null}}));return req;},
      put(value){queueMicrotask(()=>{if(falhaMigracao)tx.onabort?.();else{gravados.push(value);tx.oncomplete?.();}});}
    })}; return tx;
  }};
  const ctx=vm.createContext({console:{log(){},warn(){},error(){}},navigator:{onLine:true},window:{addEventListener(){}},
    localStorage:{getItem:k=>ls.get(k)||null,setItem:(k,v)=>ls.set(k,v),removeItem:k=>ls.delete(k)},
    indexedDB:{open(){const req={};queueMicrotask(()=>req.onsuccess({target:{result:db}}));return req;}},
    setTimeout:()=>1,clearTimeout(){},AbortController,
    fetch:async(_url,req)=>{const r=await responder(JSON.parse(req.body));return {ok:!(r.http>=400),status:r.http||200,json:async()=>r};}
  });
  const src=fs.readFileSync(path.join(process.env.PCP_BASELINE || path.join(__dirname,'..'),'store.js'),'utf8');
  vm.runInContext(src,ctx); const s=vm.runInContext('STORE',ctx);
  s.on('pull-truncado',e=>eventos.push(e));
  return {s,ls,ctx,eventos,gravados};
}
test('erro permanente não descarta edição após 25 tentativas',async()=>{
  const item={action:'upsert',os:{id:'a',numero:'100',atualizadoEm:'2026-09-09'}};
  const {s}=store({lista:[item.os],fila:[item],responder:()=>({http:400})});
  for(let i=0;i<26;i++) await s.trySync();
  assert.equal(s.getQueue().length,1);
  assert.equal(s.getQueue()[0].os.numero,'100');
});
test('migração só remove a origem depois de confirmar a gravação no IndexedDB',async()=>{
  const {s,ls,gravados}=store({lista:[{id:'a'}]});
  await s.pronto(); assert.equal(gravados.length,1); assert.equal(ls.has(OS),false);
});
test('migração abortada preserva original no disco e dados em memória',async()=>{
  const {s,ls}=store({lista:[{id:'a'}],falhaMigracao:true});
  await s.pronto(); assert.equal(ls.has(OS),true);assert.equal(s.getAllOS()[0].id,'a');
});
test('cursor repetido interrompe consulta sem remover nem alterar cache',async()=>{
  const {s,eventos}=store({lista:[{id:'a',rev:1},{id:'b',rev:1}],responder:()=>({os:[{id:'a',rev:2}],nextAfter:'a'})});
  await s.pronto();const r=await s.pull();
  assert.equal(r.incompleta,true);assert.equal(s.getAllOS().length,2);assert.equal(s.getOS('a').rev,1);assert.equal(eventos.length,1);
});
test('falha na segunda página preserva cache inteiro sem alteração parcial',async()=>{
  const {s}=store({lista:[{id:'a',rev:1},{id:'b',rev:1}],responder:q=>q.after?{http:500}:{os:[{id:'a',rev:2}],nextAfter:'a'}});
  await s.pronto();await s.pull();assert.equal(s.getOS('a').rev,1);assert.equal(s.getAllOS().length,2);
});
test('lista completa atualiza remoto, remove ausência e preserva edição offline',async()=>{
  const edit={id:'c',rev:1,cliente:'alterado aqui'};
  const {s}=store({lista:[{id:'a',rev:1},{id:'b'},edit],fila:[{action:'upsert',os:edit}],responder:q=>q.after?{os:[]}:{os:[{id:'a',rev:2}],nextAfter:'a'}});
  await s.pronto();await s.pull();assert.equal(s.getOS('a').rev,2);assert.equal(s.getOS('b'),null);assert.equal(s.getOS('c').cliente,'alterado aqui');
});
test('edição durante a consulta vence a resposta antiga e permanece na fila',async()=>{
  let liberar; const resposta=new Promise(r=>liberar=r);
  const {s,ctx}=store({lista:[{id:'a',rev:1}],responder:()=>resposta});
  await s.pronto();const pull=s.pull();
  ctx.navigator.onLine=false;
  s.saveOS({id:'a',rev:1,cliente:'edição durante a rede',atualizadoEm:'2026-09-09T12:00:00'});
  liberar({os:[{id:'a',rev:2,cliente:'antigo'}]});await pull;
  assert.equal(s.getOS('a').cliente,'edição durante a rede');assert.equal(s.getQueue().length,1);
});
test('401 conserva fila e informa sessão recusada',async()=>{
  const {s}=store({fila:[{action:'delete',id:'a'}],responder:()=>({http:401})});
  let status='';s.onSync(e=>status=e);await s.trySync();assert.equal(s.getQueue().length,1);assert.equal(status,'sem-sessao');
});
test('service worker remove apenas caches deste sistema',async()=>{
  const handlers={},apagados=[];
  const ctx=vm.createContext({self:{addEventListener:(e,fn)=>handlers[e]=fn,clients:{claim:async()=>{}}},caches:{keys:async()=>['impresilk-shell-v57','impresilk-shell-v58','impresilk-shell-v59','impresilk-shell-v60','rh-v20','dre-v5'],delete:async k=>apagados.push(k)}});
  vm.runInContext(fs.readFileSync(path.join(process.env.PCP_BASELINE || path.join(__dirname,'..'),'sw.js'),'utf8'),ctx);
  let p;handlers.activate({waitUntil:v=>p=v});await p;assert.deepEqual(apagados,['impresilk-shell-v57','impresilk-shell-v58','impresilk-shell-v59']);
});
