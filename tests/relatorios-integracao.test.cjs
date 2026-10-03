const {test}=require('node:test'),assert=require('node:assert/strict');
const {edge}=require('./helpers/edge.cjs'),D=require('../diagnostico-itens.js'),A=require('../alertas-sync.js'),C=require('../conferencia-entrega.js');
const original=()=>({id:'o',numero:'QA-1',tipo:'externo',rev:1,equipe:['Ana'],cliente:'Cliente fictício',valorTotal:18000,itens:[{uid:'a',item:1,descricao:'Placa',qtde:4,subtotal:12000,valorUnit:3000},{uid:'b',item:2,descricao:'Adesivo',qtde:3,subtotal:8000}],erpAlteracoes:[{campos:[{campo:'valorTotal',antes:20000,depois:18000}]}]});
test('servidor omite monetários em list e upsert restritos e mantém valores ao reordenar/fotografar',async()=>{
 for(const papel of ['montagem','operacao','comercial']){
 const o=original(),e=await edge('pcp-sync',{pcp_registros:[{id:'o',colecao:'os',apagado:false,registro:o}],registros:[]});
 const who={papel,nome:'Ana'},r=await e.call({action:'list'},who);assert.equal(r.status,200);assert.equal(r.os[0].valorTotal,undefined);assert.equal(r.os[0].itens[0].subtotal,undefined);assert.equal(r.os[0].erpAlteracoes,undefined);
 if(papel==='comercial')continue;
 const up=await e.call({action:'upsert',os:{...r.os[0],itens:r.os[0].itens.slice().reverse(),fotosCheckinIds:['foto-ficticia']}},who);
 assert.equal(up.status,200,JSON.stringify(up));assert.equal(up.os.valorTotal,undefined);
 const saved=e.db.pcp_registros.find(r=>r.id==='o').registro;assert.equal(saved.valorTotal,18000);assert.equal(saved.itens.find(i=>i.uid==='a').subtotal,12000);assert.deepEqual(saved.fotosCheckinIds,['foto-ficticia']);
 const gestao=await e.call({action:'list'},{papel:'pcp'});assert.equal(gestao.os[0].valorTotal,18000);
 }
});
test('payload financeiro forjado não altera valores e conflito não os revela',async()=>{
 const o=original(),e=await edge('pcp-sync',{pcp_registros:[{id:'o',colecao:'os',apagado:false,registro:o}]});
 const r=await e.call({action:'upsert',os:{...o,valorTotal:1,itens:o.itens.map(i=>({...i,subtotal:1}))}},{papel:'operacao'});
 assert.equal(r.status,200,JSON.stringify(r));assert.equal(e.db.pcp_registros[0].registro.valorTotal,18000);
 const conflict=await e.call({action:'upsert',os:{...o,rev:1}},{papel:'operacao'});assert.equal(conflict.conflito,true);assert.equal(conflict.servidor.valorTotal,undefined);
});
test('diagnóstico distingue sem UID, alternativa válida, ambiguidade e referência órfã sem alterar dados',()=>{
 const o=original(),cat=C.catalogo(o);o.conferenciasEntrega=[{id:'e',dia:'2026-10-01',itens:[{...cat[0],qtde:1}]}];const antes=JSON.stringify(o);o.itens.reverse();assert.equal(C.validar(o,o.conferenciasEntrega),'');assert.equal(D.medir([o]).linhas[0].referenciasOrfas,0);
 delete o.itens[0].uid;assert.equal(D.medir([o]).linhas[0].alternativasValidas,1);o.itens.push({...o.itens[0]});const r=D.medir([o]);assert.equal(r.semUID,2);assert.equal(r.ambiguos,2);assert.equal(r.mesclaAutomatica,false);assert.ok(antes.includes('18000'));
});
test('fila: data inválida ignorada, mais antiga preservada, offline/sessão/recusa e incidentes deduplicados',()=>{
 const agora=Date.parse('2026-10-03T12:00:00Z'),q=[{enfileiradoEm:'inválida'},{enfileiradoEm:'2026-10-03T10:00:00Z'},{enfileiradoEm:'2026-10-03T11:00:00Z'}];
 assert.equal(Date.parse(A.fila(q,{agora}).desde),Date.parse(q[1].enfileiradoEm));assert.equal(A.fila(q,{agora,online:false}).tipo,'offline');assert.equal(A.fila(q,{agora,sessao:false}).tipo,'sem-sessao');assert.equal(A.fila(q,{agora,recusada:true}).tipo,'recusa');
 const m=new Map(),s={getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)},v=A.fila(q,{agora});assert.equal(A.registrar(s,'fila',v).notificar,true);assert.equal(A.registrar(s,'fila',v).notificar,false);assert.equal(A.registrar(s,'fila',null).recuperou,true);assert.equal(A.registrar(s,'fila',v).notificar,true);
});

test('recuperação isolada valida hashes, relações, idempotência, corrupção e interrupção',()=>{assert.equal(require('../scripts/ensaio-recuperacao.cjs').executar().checks.length,10);});
test('projeção cache e servidor equivalentes, configurações/legados financeiros recursivos',async()=>{
 const server=await import('../supabase/functions/_shared/pcp-integridade.mjs'),client=require('../privacidade-valores.js');
 const v={...original(),catalogo:[{valor:123,preco:456,custo:789,descricao:'Mantida'}],bonusPCP:{orcamento:900},performancePCP:{equipes:[{nome:'Águia'}]}};
 assert.deepEqual(client.podar(v),server.podarValoresPCP(v));assert.deepEqual(client.podar(v).catalogo,[{descricao:'Mantida'}]);assert.equal(client.podar(v).bonusPCP,undefined);
});
test('fixture extensa traz 180 linhas e nomes/valores íntegros, restritos sem coluna financeira',()=>{
 const {pagina}=require('../scripts/preview-relatorios.cjs');const admin=pagina('/?papel=admin&modo=mes'),restrito=pagina('/?papel=montagem');
 assert.match(admin,/QA-0180/);assert.match(admin,/123\.456\.789,99/);assert.match(admin,/2026-10-31/);assert.doesNotMatch(restrito,/123\.456\.789,99|<th>Valor completo/);assert.match(restrito,/table-header-group/);
});
test('item legado financeiro não perde valor em alteração de identidade pelo perfil restrito',async()=>{
 const o=original();delete o.itens[0].uid;const e=await edge('pcp-sync',{pcp_registros:[{id:'o',colecao:'os',apagado:false,registro:o}]});
 const r=await e.call({action:'list'},{papel:'operacao'});r.os[0].itens[0].descricao='Outro produto';
 assert.equal((await e.call({action:'upsert',os:r.os[0]},{papel:'operacao'})).status,422);assert.equal(e.db.pcp_registros[0].registro.itens[0].subtotal,12000);
});
test('payload omitido/malformado não apaga ramos financeiros armazenados',async()=>{
 const {preservarValoresPCP}=await import('../supabase/functions/_shared/pcp-integridade.mjs'),o=original();
 for(const novo of [{id:o.id},{id:o.id,itens:null}]){const r=preservarValoresPCP(novo,o);assert.equal(r.valorTotal,18000);assert.equal(r.itens[0].subtotal,12000);}
});
test('cache previamente da gestão não expõe montantes após trocar papel e mantém operação editável',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),m=new Map([['impresilk_inst_os',JSON.stringify([original()])]]);
 const ctx=vm.createContext({console,navigator:{onLine:false},window:{addEventListener(){}},localStorage:{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)},setTimeout:()=>1,clearTimeout(){},AbortController});
 vm.runInContext(fs.readFileSync('privacidade-valores.js','utf8'),ctx);vm.runInContext(fs.readFileSync('store.js','utf8'),ctx);
 vm.runInContext("STORE.setUser({papel:'pcp'})",ctx);assert.equal(vm.runInContext("STORE.getOS('o').valorTotal",ctx),18000);
 vm.runInContext("STORE.setUser({papel:'montagem'})",ctx);assert.equal(vm.runInContext("STORE.getOS('o').valorTotal",ctx),undefined);assert.equal(vm.runInContext("STORE.getAllOS()[0].itens[0].subtotal",ctx),undefined);
 vm.runInContext("STORE.saveOS({...STORE.getOS('o'),fotosCheckinIds:['foto-teste']})",ctx);assert.equal(vm.runInContext("STORE.getOS('o').fotosCheckinIds[0]",ctx),'foto-teste');assert.equal(vm.runInContext("STORE.getQueue().length",ctx),1);
 assert.ok(Number.isFinite(Date.parse(vm.runInContext('STORE.getQueue()[0].enfileiradoEm',ctx))));
 const primeira=vm.runInContext('STORE.getQueue()[0].enfileiradoEm',ctx);vm.runInContext("STORE.saveOS({...STORE.getOS('o'),obs:'Editado novamente'})",ctx);assert.equal(vm.runInContext('STORE.getQueue()[0].enfileiradoEm',ctx),primeira);
});
test('perfil restrito não duplica valores copiando UID financeiro',async()=>{
 const {preservarValoresPCP}=await import('../supabase/functions/_shared/pcp-integridade.mjs'),o=original();assert.throws(()=>preservarValoresPCP({...o,itens:[...o.itens,{...o.itens[0]}]},o),/identidade/);
});
