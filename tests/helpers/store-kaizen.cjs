/* Bancada isolada: armazenamento e servidor simulados; nenhum acesso externo. */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const OS='impresilk_inst_os', FILA='impresilk_inst_fila';
function store({lista=[],fila=[],responder=()=>({os:[]}),falhaMigracao=false,entregues=null}={}) {
  const ls=new Map([[OS,JSON.stringify(lista)],[FILA,JSON.stringify(fila)]]);
  if(entregues)ls.set('impresilk_inst_entregues',JSON.stringify(entregues));
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
    API_BASE:'http://teste', // na página, vem do config.js (carregado antes do store.js)
    fetch:async(_url,req)=>{const r=await responder(JSON.parse(req.body));return {ok:!(r.http>=400),status:r.http||200,json:async()=>r};}
  });
  const src=fs.readFileSync(path.join(process.env.PCP_BASELINE || path.join(__dirname,'../..'),'store.js'),'utf8');
  vm.runInContext(src,ctx); const s=vm.runInContext('STORE',ctx);
  s.on('pull-truncado',e=>eventos.push(e));
  return {s,ls,ctx,eventos,gravados};
}

module.exports = {store};
