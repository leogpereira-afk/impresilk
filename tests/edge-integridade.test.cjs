const {test}=require('node:test'),assert=require('node:assert/strict');
const {edge}=require('./helpers/edge.cjs');
const row=(id,registro)=>({id,colecao:'os',apagado:false,atualizado_em:'2026-09-19T10:00:00Z',registro:{id,rev:1,...registro}});
test('servidor recusa emissão de montagem sem sessão autenticada',async()=>{
 const e=await edge('pcp-sync');assert.equal((await e.call({action:'entrarMontagem',nome:'Ana'},null)).status,401);
 assert.equal((await e.call({action:'entrarMontagem',nome:'Ana'},{papel:'comercial'})).status,403);
 const r=await e.call({action:'entrarMontagem',nome:'Ana'},{papel:'admin'});assert.equal(r.status,200);assert.ok(r.token);assert.equal(JSON.parse(Buffer.from(r.token.split('.')[1],'base64url')).montagemIndividual,true);
});
test('montagem grava data completa e autor real sem modificar equipe ou origem',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[row('1',{numero:'1',equipe:['Ana'],cliente:'Cliente',saidaEm:''})]});
 const r=await e.call({action:'upsert',os:{id:'1',rev:1,cliente:'Forjado',equipe:['Outra'],horaSaida:'23:30',saidaEm:'2026-09-19T23:30:00-03:00',atualizadoPor:'Outro'}},{nome:'Ana',papel:'montagem',montagemIndividual:true});
 assert.equal(r.status,200);assert.equal(r.os.saidaEm,'2026-09-19T23:30:00-03:00');assert.equal(r.os.saidaPor,'Ana');assert.equal(r.os.cliente,'Cliente');assert.deepEqual(r.os.equipe,['Ana']);
 const negado=await e.call({action:'upsert',os:{id:'1',rev:2}},{nome:'Outra',papel:'montagem'});assert.equal(negado.status,403);
});
test('montagem lista só suas O.S.; reatribuição incremental vira remoção do cache',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[row('1',{equipe:['Ana']}),row('2',{equipe:['Outra']})]});
 const who={nome:'Ana',papel:'montagem'};const lista=await e.call({action:'list'},who);assert.deepEqual(lista.os.map(o=>o.id),['1']);
 const delta=await e.call({action:'list',since:'2026-09-18'},who);assert.deepEqual(delta.os.find(o=>o.id==='2'),{id:'2',apagado:true});
});
test('servidor bloqueia perda por corrida de O.S.',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[row('1',{cliente:'A'})]});
 e.cliente.beforeWrite=db=>{db.pcp_registros[0].atualizado_em='2026-09-19T11:00:00Z';db.pcp_registros[0].registro={id:'1',rev:2,cliente:'Outro aparelho'};};
 const r=await e.call({action:'upsert',os:{id:'1',rev:1,cliente:'Meu aparelho'}});assert.equal(r.conflito,true);assert.equal(e.db.pcp_registros[0].registro.cliente,'Outro aparelho');
});
test('configuração no servidor combina adições simultâneas e recusa conflito',async()=>{
 const base={agendaPCP:{plantoes:[]},instaladores:['Ana']};const e=await edge('pcp-sync',{pcp_config_global:[{id:true,config:base,atualizado_em:'2026-09-19T10:00:00Z'}]});
 const a=await e.call({action:'setCfg',baseCfg:base,cfg:{...base,agendaPCP:{plantoes:[{id:'a',titulo:'A'}]}}});assert.equal(a.ok,true);
 const b=await e.call({action:'setCfg',baseCfg:base,cfg:{...base,agendaPCP:{plantoes:[{id:'b',titulo:'B'}]}}});assert.equal(b.ok,true);assert.equal(b.cfg.agendaPCP.plantoes.length,2);
 const before=b.cfg;await e.call({action:'setCfg',baseCfg:before,cfg:{...before,instaladores:['Ana','Bia']}});
 const conflict=await e.call({action:'setCfg',baseCfg:before,cfg:{...before,instaladores:['Ana','Caio']}});assert.equal(conflict.status,409);assert.equal(conflict.conflitoCfg,true);
});
test('setCfg PCP não amplia acesso e preserva usuários e segredos',async()=>{
 const e=await edge('pcp-sync',{pcp_config_global:[{id:true,config:{usuarios:['privado'],funcionarios:['privado'],niveis:{admin:true},agendaPCP:{}},atualizado_em:'2026-09-19T10:00:00Z'}]});
 const r=await e.call({action:'setCfg',baseCfg:{agendaPCP:{},niveis:{}},cfg:{agendaPCP:{eventos:[{id:'e'}]},niveis:{pcp:{admin:true}}}},{papel:'pcp'});
 assert.equal(r.ok,true);assert.deepEqual(e.db.pcp_config_global[0].config.niveis,{admin:true});assert.equal(r.cfg.usuarios,undefined);assert.equal(r.cfg.funcionarios,undefined);
});
test('conclusão sem evidência é recusada no servidor, exceção recebe autor',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[row('1',{tipo:'externo'})]});
 const os={id:'1',rev:1,tipo:'externo',finalizadaEm:'2026-09-19T12:00:00Z'};
 assert.equal((await e.call({action:'upsert',os},{papel:'pcp'})).status,422);
 const r=await e.call({action:'upsert',os:{...os,justificativaConclusao:'Cliente não permite fotos internas.'}},{papel:'pcp',nome:'Gestor'});
 assert.equal(r.ok,true);assert.equal(r.os.excecaoConclusao.por,'Gestor');
});
test('importação ERP atualiza origem e não revive lápide nem pisa em escrita concorrente',async()=>{
 const r=row('mub-1',{numero:'1',origemMubisys:true,cliente:'Antigo',equipe:['Ana'],fotosCheckinIds:['f']});
 const morto={...row('mub-2',{numero:'2',origemMubisys:true}),apagado:true};
 const e=await edge('pcp-mubisys',{pcp_registros:[r,morto]});
 let out=await e.run(`gravarImportadas(sb,[{numero:'1',cliente:'Novo'},{numero:'2',cliente:'Não reviver'},{numero:'3',cliente:'Nova'}])`);
 assert.equal(out.atualizadas,1);assert.equal(out.novas,1);assert.deepEqual(e.db.pcp_registros[0].registro.equipe,['Ana']);assert.equal(e.db.pcp_registros[1].apagado,true);
 e.cliente.beforeWrite=db=>{db.pcp_registros[0].atualizado_em='depois';db.pcp_registros[0].registro.equipe=['Outra equipe'];};
 out=await e.run(`gravarImportadas(sb,[{numero:'1',cliente:'Mais novo'}])`);assert.equal(out.conflitosAtualizacao,1);assert.deepEqual(e.db.pcp_registros[0].registro.equipe,['Outra equipe']);
});
test('resposta ERP sem valor não vira valor zero',async()=>{
 const e=await edge('pcp-mubisys');assert.equal(e.run(`mapearOS({numero:'1'}).valorTotal`),null);assert.equal(e.run(`mapearOS({numero:'1',valor_total:0}).valorTotal`),0);
});
test('veículo só libera com confirmação no dia da saída registrada, inclusive envio offline',async()=>{
 const agenda={data:'2026-09-19',periodo:'Manhã'};
 const e=await edge('pcp-sync',{pcp_registros:[row('1',{instalacao:agenda,confirmacao:'Confirmado',confEm:'2026-09-18T09:00:00-03:00'})]});
 const os={id:'1',rev:1,instalacao:agenda,confirmacao:'Confirmado',carroLiberado:true,carroLiberadoEm:'2026-09-19T10:00:00-03:00',confEm:'2026-09-18T09:00:00-03:00'};
 assert.equal((await e.call({action:'upsert',os},{papel:'pcp'})).status,422);
 assert.equal((await e.call({action:'upsert',os:{...os,confEm:'2026-09-19T09:00:00-03:00'}},{papel:'pcp'})).ok,true);
});
test('remarcação limpa confirmação anterior e liberação do veículo',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[row('1',{instalacao:{data:'2026-09-19'},confirmacao:'Confirmado',confEm:'2026-09-19T10:00:00Z',carroLiberado:true})]});
 const r=await e.call({action:'upsert',os:{id:'1',rev:1,instalacao:{data:'2026-09-20'},confirmacao:'Confirmado',confEm:'2026-09-19T10:00:00Z',carroLiberado:true}},{papel:'pcp'});
 assert.equal(r.os.confirmacao,'');assert.equal(r.os.confEm,'');assert.equal(r.os.carroLiberado,false);
});
