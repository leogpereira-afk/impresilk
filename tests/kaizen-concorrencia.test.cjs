/* Todos os registros são fictícios. Promessas controlam a rede sem sleeps. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {store}=require('./helpers/store-kaizen.cjs');
const copia=x=>JSON.parse(JSON.stringify(x));
const adiar=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const os=(id,obs)=>({id,obs,rev:1,atualizadoEm:'2026-10-22T12:00:00.000Z'});

test('Kaizen: resposta lenta não apaga edição mais nova no mesmo milissegundo',async()=>{
 const entrou=adiar(),resposta=adiar();
 const b=store({responder:async q=>{entrou.resolve(q);return resposta.promise;}});
 await b.s.pronto();b.ctx.navigator.onLine=false;
 b.s.saveOS(os('ficticia-a','primeira'));
 b.ctx.navigator.onLine=true;const sync=b.s.trySync();await entrou.promise;
 b.s.saveOS(os('ficticia-a','segunda'));
 resposta.resolve({os:{...os('ficticia-a','primeira'),rev:2}});await sync;
 assert.equal(b.s.getOS('ficticia-a').obs,'segunda','resposta antiga não reverte o que o usuário vê');
 assert.equal(b.s.getOS('ficticia-a').rev,2);
 assert.equal(b.s.getQueue()[0].os.obs,'segunda');
 // Editar outro campo depois do retorno não pode reenviar a observação antiga.
 const atual=copia(b.s.getOS('ficticia-a'));atual.servico='Outro campo';
 b.ctx.navigator.onLine=false;b.s.saveOS(atual);
 assert.equal(b.s.getQueue()[0].os.obs,'segunda');
});

test('Kaizen: ação que aguarda envio usa a versão atual da fila',async()=>{
 const entrou=adiar(),resposta=adiar(),pedidos=[];
 const b=store({responder:async q=>{pedidos.push(q);if(q.os.id==='ficticia-a'){entrou.resolve();await resposta.promise;}return {os:{...q.os,rev:2}};}});
 await b.s.pronto();b.ctx.navigator.onLine=false;
 b.s.saveOS(os('ficticia-a','bloqueia a rede'));b.s.saveOS(os('ficticia-b','antiga'));
 b.ctx.navigator.onLine=true;const sync=b.s.trySync();await entrou.promise;
 b.s.saveOS({...os('ficticia-b','corrigida antes do envio'),atualizadoEm:'2026-10-22T12:00:01.000Z'});
 resposta.resolve();await sync;
 assert.equal(pedidos[1].os.obs,'corrigida antes do envio','não enviar um estado que já foi substituído');
 assert.equal(b.s.getQueue().length,0);
});

test('Kaizen: 250 salvamentos offline de uma O.S. chegam como o último estado',async()=>{
 const pedidos=[];const b=store({responder:q=>{pedidos.push(q);return {os:{...q.os,rev:2}};}});
 await b.s.pronto();b.ctx.navigator.onLine=false;
 for(let i=0;i<250;i++) b.s.saveOS({...os('ficticia-c','revisão '+i),itens:[{uid:'p1',descricao:'Peça fictícia '+i}]});
 assert.equal(b.s.getQueue().length,1);b.ctx.navigator.onLine=true;await b.s.trySync();
 assert.equal(pedidos.length,1);assert.equal(pedidos[0].os.obs,'revisão 249');
 assert.equal(b.s.getQueue().length,0);assert.equal(b.s.getOS('ficticia-c').itens[0].descricao,'Peça fictícia 249');
});

test('Kaizen: interrupção na página 10 de 1500 registros preserva toda a base',async()=>{
 let chamadas=0;const lista=Array.from({length:1500},(_,i)=>os('ficticia-'+i,'base original'));
 const b=store({lista,responder:()=>{const n=chamadas++;if(n===9)return {http:503};return {os:lista.slice(n*150,(n+1)*150).map(o=>({...o,obs:'nova'})),nextAfter:'pagina-'+n};}});
 await b.s.pronto();await b.s.pull();
 assert.equal(chamadas,10);assert.equal(b.s.getAllOS().length,1500);
 assert.ok(b.s.getAllOS().every(o=>o.obs==='base original'));
});

test('Kaizen: ação retirada durante a espera não é enviada pelo retrato antigo',async()=>{
 const entrou=adiar(),resposta=adiar(),pedidos=[];
 const b=store({responder:async q=>{pedidos.push(q);entrou.resolve();await resposta.promise;return {os:{...q.os,rev:2}};}});
 await b.s.pronto();b.ctx.navigator.onLine=false;
 b.s.saveOS(os('ficticia-a','primeira'));b.s.saveOS(os('ficticia-b','edição local'));
 b.ctx.navigator.onLine=true;const sync=b.s.trySync();await entrou.promise;
 b.s.aceitarServidor({...os('ficticia-b','escolha do servidor'),rev:7});
 resposta.resolve();await sync;
 assert.deepEqual(pedidos.map(q=>q.os.id),['ficticia-a']);
 assert.equal(b.s.getOS('ficticia-b').obs,'escolha do servidor');assert.equal(b.s.getQueue().length,0);
});

test('Kaizen: 100 O.S., limitação 429 e retomada preservam edições e não duplicam aceites',async()=>{
 let limitar=true;const aceites=[];
 const b=store({responder:q=>{
   if(limitar && aceites.length===37)return {http:429,error:'Aguarde e tente novamente'};
   aceites.push(q.os.id);return {os:{...q.os,rev:2}};
 }});
 await b.s.pronto();b.ctx.navigator.onLine=false;
 for(let i=0;i<100;i++)b.s.saveOS(os('ficticia-'+i,'edição '+i));
 b.ctx.navigator.onLine=true;await b.s.trySync();
 assert.equal(aceites.length,37);assert.equal(b.s.getQueue().length,63);
 limitar=false;await b.s.trySync();
 assert.equal(aceites.length,100);assert.equal(new Set(aceites).size,100);assert.equal(b.s.getQueue().length,0);
 assert.ok(b.s.getAllOS().every(o=>o.rev===2));
});

test('Kaizen: 401 após aceite parcial conserva restante para nova sessão',async()=>{
 let autorizado=true;let aceites=0;
 const b=store({responder:q=>{
   if(!autorizado)return {http:401,error:'Sessão expirada'};
   aceites++;autorizado=false;return {os:{...q.os,rev:2}};
 }});
 await b.s.pronto();b.ctx.navigator.onLine=false;
 b.s.saveOS(os('ficticia-a','A'));b.s.saveOS(os('ficticia-b','B'));
 b.ctx.navigator.onLine=true;await b.s.trySync();assert.equal(b.s.getQueue().length,1);
 autorizado=true;await b.s.trySync();assert.equal(aceites,2);assert.equal(b.s.getQueue().length,0);
});
