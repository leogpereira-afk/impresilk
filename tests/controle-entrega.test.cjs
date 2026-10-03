const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {edge}=require('./helpers/edge.cjs'),C=require('../conferencia-entrega.js'),O=require('../operacao.js');
const gestor={papel:'pcp',nome:'Gestor',sub:'gestor'};
const row=(os,apagado=false)=>({id:os.id,colecao:'os',apagado,atualizado_em:'2026-09-01T10:00:00Z',registro:{rev:1,...os}});
const os=()=>({id:'teste',numero:'900',tipo:'externo',rev:1,equipe:['100001'],itens:[{uid:'a',qtde:4,subtotal:12000,descricao:'A'},{uid:'b',qtde:3,subtotal:8000,descricao:'B'}]});
const db=o=>({pcp_registros:[row(o)],registros:[{id:'p',colecao:'colaboradores',apagado:false,registro:{nome:'Ana Teste',cpf:'10000111111'}}]});
const sel=(o,a,b)=>C.catalogo(o).map((i,n)=>({chave:i.chave,identidade:i.identidade,qtde:n?b:a})).filter(i=>i.qtde);
const pedido={responsavelId:'100001',prazo:'2026-10-05',motivo:'Conferência individual',evidencia:'Documento da entrega conferido'};
test('estado único: A1+B1=5100, saldo12900, finalização preservada, segunda equipe fecha18000',()=>{
 const o=os();o.finalizadaEm='2026-09-30T12:00:00Z';o.conferenciasEntrega=[{id:'e1',dia:'2026-09-29',itens:sel(o,1,1),alocacao:{equipe:'A'}}];
 const parcial=C.estado(o,18000);assert.equal(parcial.situacao,'parcial');assert.equal(parcial.conferidoValor,510000);assert.equal(parcial.saldo,1290000);assert.equal(parcial.saldoUnidades,5);assert.equal(parcial.divergencia,true);
 delete o.finalizadaEm;assert.equal(C.estado(o,18000).situacao,'parcial');
 o.conferenciasEntrega.push({id:'e2',dia:'2026-09-30',itens:sel(o,3,2),alocacao:{equipe:'B'}});
 const total=C.estado(o,18000);assert.equal(total.situacao,'saldo_concluido');assert.deepEqual(total.entregas.map(e=>e.valor),[510000,1290000]);assert.equal(total.saldo,0);
 o.conferenciasEntrega.push({id:'e3',dia:'2026-09-30',itens:sel(o,1,0)});assert.equal(C.estado(o,18000).situacao,'inconsistente');
});
test('exclusão e recuperação exigem gestão, motivo, revisão e preservam fotos',async()=>{
 const o={...os(),fotosCheckinIds:['foto-preservada']},e=await edge('pcp-sync',db(o));
 for(const papel of ['montagem','operacao','comercial'])assert.equal((await e.call({action:'delete',id:o.id,rev:1,motivo:'Exclusão solicitada'},{papel,nome:'Ana Teste'})).status,403);
 assert.equal((await e.call({action:'delete',id:o.id,rev:1},gestor)).status,422);
 assert.equal((await e.call({action:'delete',id:o.id,rev:0,motivo:'Registro duplicado'},gestor)).status,409);
 assert.equal((await e.call({action:'delete',id:o.id,rev:1,motivo:'Registro duplicado'},gestor)).ok,true);
 const morto=e.db.pcp_registros.find(r=>r.id===o.id);assert.equal(morto.apagado,true);assert.deepEqual(morto.registro.fotosCheckinIds,['foto-preservada']);
 assert.equal((await e.call({action:'upsert',os:{...o,rev:2}},{papel:'pcp'})).status,422);assert.equal(morto.apagado,true);
 assert.equal((await e.call({action:'upsert',os:{...o,id:'outra',rev:0}},{papel:'pcp'})).status,422);
 assert.equal((await e.call({action:'excluidasOS'},{papel:'operacao'})).status,403);
 const lista=await e.call({action:'excluidasOS'},gestor);assert.equal(lista.os.length,1);
 const r=await e.call({action:'restaurarOS',id:o.id,rev:2,motivo:'Corrigir exclusão indevida'},gestor);assert.equal(r.ok,true);assert.equal(morto.apagado,false);assert.deepEqual(r.os.fotosCheckinIds,['foto-preservada']);assert.equal(r.os.cicloRegistro.length,2);assert.equal(r.os.cicloRegistro[1].por,'Gestor');
});
test('exclusão perde corrida de revisão e setReg não reanima lápide',async()=>{
 const e=await edge('pcp-sync',db(os()));e.cliente.beforeWrite=db=>{db.pcp_registros[0].atualizado_em='posterior';};
 assert.equal((await e.call({action:'delete',id:'teste',rev:1,motivo:'Duplicada confirmada'},gestor)).status,409);assert.equal(e.db.pcp_registros[0].apagado,false);
 e.db.pcp_registros[0].apagado=true;await assert.rejects(e.run(`setReg('os','teste',{id:'teste'})`),/excluída/);
});
test('baixa ERP tem responsável confirmado e evidência; classificação não fabrica entrega',async()=>{
 const o={...os(),baixaAutoERP:{em:'2026-09-30T12:00:00Z'},finalizadaEm:'2026-09-30T12:00:00Z'},e=await edge('pcp-sync',db(o));
 const body={action:'controleEntrega',osId:o.id,rev:1,tipo:'erp',pedido:{...pedido,classificacao:'total'}};
 assert.equal((await e.call(body,gestor)).status,422);
 assert.equal((await e.call({...body,pedido:{...pedido,classificacao:'divergencia',responsavelId:'Ana'}},gestor)).status,422);
 const r=await e.call({...body,pedido:{...pedido,classificacao:'baixa_administrativa'}},gestor);assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.os.conferenciaERP.por,'Gestor');assert.equal(r.os.entregaLancada,undefined);assert.equal(r.os.conferenciasEntrega,undefined);
 // O banco fictício responde no mesmo milissegundo; a leitura seguinte começa após o carimbo assinado.
 await new Promise(ok=>setTimeout(ok,3));
 const perf=await e.call({action:'performancePeriodo',de:'2026-09-01',ate:'2026-09-30'},gestor);assert.equal(perf.registros.length,0);
 const up=await e.call({action:'upsert',os:{...r.os,conferenciaERP:{classificacao:'total'}}},gestor);assert.equal(up.os.conferenciaERP.classificacao,'baixa_administrativa');
});
test('regularização mantém saída e autora, não inventa retorno nem mantém equipe na rua',async()=>{
 const o={...os(),saidaEm:'2026-09-01T08:00:00-03:00',horaSaida:'08:00'},e=await edge('pcp-sync',db(o));
 const r=await e.call({action:'controleEntrega',osId:o.id,rev:1,tipo:'saida',pedido:{...pedido,situacao:'regularizada'}},gestor);assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.os.saidaEm,o.saidaEm);assert.equal(r.os.horaRetorno,undefined);assert.equal(O.situacaoSaida(r.os,'2026-10-03'),'');assert.equal(O.horas(r.os),null);
 assert.equal(O.situacaoSaida({...r.os,saidaEm:'2026-10-03T08:00:00-03:00'},'2026-10-03'),'na-rua');
});
test('edição operacional e pedido de revisão permanecem permitidos, sem excluir',async()=>{
 const e=await edge('pcp-sync',db(os()));const r=await e.call({action:'controleEntrega',osId:'teste',rev:1,tipo:'solicitarRevisao',pedido:{motivo:'Confirmar dados com PCP'}},{papel:'operacao',nome:'Operador'});
 assert.equal(r.ok,true);assert.equal(r.os.revisaoSolicitada[0].por,'Operador');
 const up=await e.call({action:'upsert',os:{...r.os,obsTecnicas:'Conferido localmente'}},{papel:'operacao',nome:'Operador'});assert.equal(up.ok,true);
});
test('upload tardio preserva anexo/recebimento no reenvio; captura só depois de confirmação auditada',async()=>{
 const id='foto_teste_1780000000000_abc',o={...os(),fotosCheckinIds:[id]},e=await edge('pcp-sync',db(o));
 e.cliente.storage={from:()=>({upload:async()=>({error:null})})};
 const p={action:'putPhoto',base64:'data:image/jpeg;base64,YQ==',fileId:id,mime:'image/jpeg',anexadoEm:'2026-09-29T18:00:00Z'};
 const a=await e.call(p,gestor);assert.equal(a.status,200,JSON.stringify(a));assert.equal(a.evento.ocorridoEm,null);assert.equal(a.evento.anexadoEm,p.anexadoEm);
 const b=await e.call({...p,anexadoEm:'2026-09-30T18:00:00Z'},gestor);assert.equal(b.evento.recebidoEm,a.evento.recebidoEm);assert.equal(b.evento.anexadoEm,a.evento.anexadoEm);
 const r=await e.call({action:'fotosEvento',osId:'teste',fileId:id,rev:0,ocorridoEm:'2026-09-28T15:00:00Z',motivo:'Foto tirada ontem na instalação'},gestor);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.fotos[0].confirmacao.por,'Gestor');assert.equal(r.fotos[0].recebidoEm,a.evento.recebidoEm);assert.equal(e.db.pcp_registros[0].registro.saidaEm,undefined);
 assert.equal((await e.call({action:'fotosEvento',osId:'teste',fileId:id,rev:0,ocorridoEm:'2026-09-28T16:00:00Z',motivo:'Outra correção explícita'},gestor)).status,409);
});
test('telas usam o mesmo estado e incluem parcial sem finalização sem confundir baixa administrativa',()=>{
 const o=os();o.valorTotal=18000;o.conferenciasEntrega=[{id:'e1',dia:'2026-09-29',itens:sel(o,1,1)}];
 const ctx=vm.createContext({console,STORE:{getAllOS:()=>[o],getCFG:()=>({}),valores:()=>({})},STATE:{user:{papel:'pcp'}},document:{addEventListener(){},querySelector(){return null;},querySelectorAll(){return [];},getElementById(){return null;}},localStorage:{getItem(){return null;}},window:{},setTimeout(){},clearTimeout(){},OPERACAO:O,CONFERENCIA_ENTREGA:C,esc:x=>String(x||'')});
 vm.runInContext(fs.readFileSync('casa.js','utf8'),ctx);
 assert.equal(vm.runInContext('classificarEntregas().instalacoes[0].id',ctx),o.id);assert.equal(vm.runInContext('diaEntrega(STORE.getAllOS()[0])',ctx),'2026-09-29');
 o.conferenciaERP={classificacao:'baixa_administrativa'};assert.equal(vm.runInContext('classificarEntregas().instalacoes.length',ctx),0);delete o.conferenciaERP;
 vm.runInContext(fs.readFileSync('controle-entrega-ui.js','utf8'),ctx);
 ctx.resumoEntregaFichaTexto=x=>C.estado(x,x.valorTotal).resumo;
 const html=vm.runInContext("controleConferidasHTML(STORE.getAllOS(),{de:'2026-09-01',ate:'2026-09-30'})",ctx);assert.match(html,/Entrega parcial conferida/);assert.match(html,/5 a conferir/);
});
test('projeção dos novos controles não expõe IDs de autoria à operação',async()=>{
 const o={...os(),conferenciaERP:{porId:'222333',responsavelId:'100001',responsavelNome:'Ana',historico:[{porId:'222333',responsavelId:'100001'}]}},e=await edge('pcp-sync',db(o));
 const r=await e.call({action:'list'},{papel:'operacao'});assert.equal(r.os[0].conferenciaERP.porId,undefined);assert.equal(r.os[0].conferenciaERP.historico[0].responsavelId,undefined);assert.equal(e.db.pcp_registros[0].registro.conferenciaERP.porId,'222333');
});
test('fila antiga de apagar foto não destrói anexo preservado de O.S. excluída',async()=>{
 const o={...os(),fotosRetornoIds:['foto-preservada']},e=await edge('pcp-sync',{pcp_registros:[row(o,true)]});let removeu=false;
 e.cliente.storage={from:()=>({remove:async()=>{removeu=true;return {error:null};}})};
 assert.equal((await e.call({action:'deletePhoto',fileId:'foto-preservada'},gestor)).status,409);assert.equal(removeu,false);
 assert.equal((await e.call({action:'deletePhoto',fileId:'foto-solta'},gestor)).ok,true);assert.equal(removeu,true);
});
