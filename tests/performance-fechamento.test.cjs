const {test}=require('node:test'),assert=require('node:assert/strict');
const {edge}=require('./helpers/edge.cjs');
const who={papel:'pcp',nome:'Gestor'};
const periodo={de:'2026-09-01',ate:'2026-09-19'};
function dados(n=1){
 const os=Array.from({length:n},(_,i)=>({colecao:'os',id:String(i).padStart(6,'0'),apagado:false,atualizado_em:'2020-01-01',registro:{id:String(i).padStart(6,'0'),numero:String(i),tipo:'externo',cliente:'Teste',finalizadaEm:'2026-09-10T14:00:00Z',equipe:['Ana'],valorTotal:100}}));
 const participacoes=os.map(o=>({id:o.id,membros:[{chave:'rh-ana',nome:'Ana',percentual:100}],por:'Gestor',em:'2026-09-11'}));
 return {pcp_registros:os,pcp_config_global:[{id:true,atualizado_em:'2020-01-01',config:{performancePCP:{equipes:[],participacoes}}}],painel_ordens:[]};
}
test('consulta completa ultrapassa 500 registros sem usar o cache e restringe papéis',async()=>{
 const e=await edge('pcp-sync',dados(502));
 const r=await e.call({action:'performancePeriodo',...periodo},who);
 assert.equal(r.status,200);assert.equal(r.completo,true);assert.equal(r.registros.length,502);
 assert.equal((await e.call({action:'performancePeriodo',...periodo},{papel:'comercial'})).status,403);
 assert.equal((await e.call({action:'performanceFechamentos',...periodo},{papel:'montagem'})).status,403);
});
test('data manual governa o período e datas UTC respeitam São Paulo',async()=>{
 const d=dados(3);
 d.pcp_registros[0].registro.finalizadaEm='2026-08-31T10:00:00Z';d.pcp_registros[0].registro.entregaLancada={data:'2026-09-03'};
 d.pcp_registros[1].registro.finalizadaEm='2026-09-01T01:00:00Z'; // agosto em São Paulo
 d.pcp_registros[2].registro.tipo='interno';
 const e=await edge('pcp-sync',d),r=await e.call({action:'performancePeriodo',...periodo},who);
 assert.equal(r.registros.length,1);assert.equal(r.registros[0].dia,'2026-09-03');
});
test('fechamento é idempotente, preserva valores e revisões anteriores',async()=>{
 const e=await edge('pcp-sync',dados());
 const fonte=await e.call({action:'performancePeriodo',...periodo},who);
 const req={action:'performanceFechar',...periodo,hash:fonte.hash,requestId:'request-12345',motivo:'Conferência inicial',anterior:''};
 const r=await e.call(req,who);assert.equal(r.ok,true);assert.equal(r.fechamento.revisao,1);
 assert.equal((await e.call(req,who)).fechamento.id,r.fechamento.id);
 e.db.pcp_registros.find(r=>r.colecao==='os').registro.valorTotal=250;
 assert.equal((await e.call({...req,requestId:'request-56789',anterior:r.fechamento.id},who)).status,409);
 const atual=await e.call({action:'performancePeriodo',...periodo},who);
 const novo=await e.call({...req,requestId:'request-56789',anterior:r.fechamento.id,hash:atual.hash,motivo:'Valor corrigido no ERP'},who);
 assert.equal(novo.fechamento.revisao,2);assert.equal(novo.fechamento.registros[0].valor,250);
 const hist=await e.call({action:'performanceFechamentos',...periodo},who);
 assert.equal(hist.fechamentos.length,2);assert.equal(hist.fechamentos[1].registros[0].valor,100);
});
test('não fecha dados pendentes, ausentes, adulterados ou período inválido',async()=>{
 const d=dados();d.pcp_config_global[0].config.performancePCP.participacoes=[];
 const e=await edge('pcp-sync',d),fonte=await e.call({action:'performancePeriodo',...periodo},who);
 const req={action:'performanceFechar',...periodo,hash:fonte.hash,requestId:'request-12345',motivo:'Conferência inicial'};
 assert.equal((await e.call(req,who)).status,422);
 assert.equal((await e.call({...req,hash:'forjado'},who)).status,409);
 assert.notEqual((await e.call({action:'performancePeriodo',de:'2026-02-30',ate:'2026-03-01'},who)).status,200);
 assert.equal(e.db.pcp_registros.filter(r=>r.colecao==='performance_fechamentos').length,0);
});
test('conflito concorrente não sobrescreve a revisão criada por outro aparelho',async()=>{
 const e=await edge('pcp-sync',dados()),fonte=await e.call({action:'performancePeriodo',...periodo},who);
 e.cliente.beforeWrite=(db,table)=>{if(table==='pcp_registros')db.pcp_registros.push({colecao:'performance_fechamentos',id:periodo.de+':'+periodo.ate+':000001',apagado:false,registro:{id:'outra',de:periodo.de,ate:periodo.ate,revisao:1}});};
 const r=await e.call({action:'performanceFechar',...periodo,hash:fonte.hash,requestId:'request-12345',motivo:'Conferência inicial'},who);
 assert.equal(r.status,409);assert.equal(e.db.pcp_registros.filter(r=>r.colecao==='performance_fechamentos').length,1);
});
test('falha numa página não devolve cobertura completa nem grava fechamento',async()=>{
 const e=await edge('pcp-sync',dados(502));
 const original=e.cliente.from.bind(e.cliente);let reads=0;
 e.cliente.from=table=>{const q=original(table);if(table==='pcp_registros'&&++reads===2)q.then=resolve=>resolve({data:null,error:{message:'Banco indisponível'}});return q;};
 const r=await e.call({action:'performancePeriodo',...periodo},who);
 assert.notEqual(r.status,200);assert.notEqual(r.completo,true);
});
test('falta de valor impede fechamento; valor zero confirmado é válido',async()=>{
 const d=dados();delete d.pcp_registros[0].registro.valorTotal;
 const e=await edge('pcp-sync',d);let r=await e.call({action:'performancePeriodo',...periodo},who);
 assert.equal(r.registros[0].valor,null);
 assert.equal((await e.call({action:'performanceFechar',...periodo,hash:r.hash,requestId:'sem-valor-00001',motivo:'Conferência inicial'},who)).status,422);
 e.db.pcp_registros[0].registro.valorTotal=0;r=await e.call({action:'performancePeriodo',...periodo},who);
 assert.equal((await e.call({action:'performanceFechar',...periodo,hash:r.hash,requestId:'valor-zero-00001',motivo:'Entrega sem cobrança'},who)).ok,true);
});

/* ---------------- Revisão da avaliação individual (23/09/2026) ---------------- */
test('fechamento sela os pesos da nota: trocar os pesos depois não reordena a revisão', async () => {
 const d = dados();
 d.pcp_config_global[0].config.performancePCP.criterios = {producao:70, limpeza:15, equipamentos:15};
 const e = await edge('pcp-sync', d);
 const fonte = await e.call({action:'performancePeriodo', ...periodo}, who);
 assert.deepEqual({...fonte.criterios}, {producao:70, limpeza:15, equipamentos:15});
 const r = await e.call({action:'performanceFechar', ...periodo, hash:fonte.hash, requestId:'request-pesos', motivo:'Fechamento com pesos', anterior:''}, who);
 assert.equal(r.ok, true);
 e.db.pcp_config_global[0].config.performancePCP.criterios = {producao:40, limpeza:30, equipamentos:30};
 const hist = await e.call({action:'performanceFechamentos', ...periodo}, who);
 assert.deepEqual({...hist.fechamentos[0].criterios}, {producao:70, limpeza:15, equipamentos:15}, 'a revisão guarda os pesos da época');
 const atual = await e.call({action:'performancePeriodo', ...periodo}, who);
 assert.notEqual(atual.hash, fonte.hash, 'pesos novos mudam o conteúdo: fechar com o hash velho dá 409');
});
test('pesos inválidos na configuração não entram no fechamento: vale o padrão', async () => {
 const d = dados();
 d.pcp_config_global[0].config.performancePCP.criterios = {producao:90, limpeza:20, equipamentos:20};
 const e = await edge('pcp-sync', d);
 const fonte = await e.call({action:'performancePeriodo', ...periodo}, who);
 assert.deepEqual({...fonte.criterios}, {producao:60, limpeza:20, equipamentos:20});
});
