/* Auditoria de 25/09/2026, frente do servidor: o que o crachá grava, o que é
   descartado calado e o que trava a fila. Cada teste começa pelo caso ruim. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {edge}=require('./helpers/edge.cjs');
const row=(id,registro)=>({id,colecao:'os',apagado:false,atualizado_em:'2026-09-19T10:00:00Z',registro:{id,rev:1,...registro}});
const toque={nome:'Ana',papel:'montagem',montagemIndividual:true};
const pronta=(extra={})=>row('1',{numero:'1',tipo:'externo',cliente:'Cliente',equipe:['Ana'],liberadoPCP:true,confirmacao:'Confirmado',...extra});
// Faz a próxima leitura de pcp_registros falhar (soluço do banco).
function falharLeitura(e){
 const orig=e.cliente.from.bind(e.cliente);let uma=true;
 e.cliente.from=t=>{const q=orig(t);if(t!=='pcp_registros'||!uma)return q;uma=false;q.then=res=>res({data:null,error:{message:'tempo esgotado'}});return q;};
}

test('soluço do banco na leitura da O.S. não vira "não cria O.S." (403 tirava o check-in da fila)',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[pronta()]});
 falharLeitura(e);
 const r=await e.call({action:'upsert',os:{id:'1',rev:1,obsTecnicas:'x'}},toque);
 assert.ok(r.status>=500,'falha de leitura é rede: o aparelho reenvia');
});
test('O.S. excluída enquanto a equipe estava sem sinal: 422 (fica na fila, com aviso), não 403',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[{...pronta(),apagado:true}]});
 const r=await e.call({action:'upsert',os:{id:'1',rev:1,obsTecnicas:'x'}},toque);
 assert.equal(r.status,422);assert.match(r.error,/excluída/);
 assert.equal(r.definitivo,true,'sem a marca o envio fica preso na fila para sempre');
 assert.equal((await e.call({action:'upsert',os:{id:'nunca-existiu',rev:1}},toque)).status,403);
});
test('O.S. que saiu da equipe: 422 marcado como definitivo (o aparelho não fica preso)',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[pronta({equipe:['Bruno']})]});
 const r=await e.call({action:'upsert',os:{id:'1',rev:1,obsTecnicas:'x'}},toque);
 assert.equal(r.status,422);assert.match(r.error,/não está mais na sua equipe/);assert.equal(r.definitivo,true);
});

test('CPF/CNPJ e valor não descem para quem entrou pelo nome: nem na lista, nem no histórico do ERP, nem na resposta do upsert',async()=>{
 const reg=pronta({cnpjCpf:'123.456.789-00',valorTotal:900,itens:[{item:'1',descricao:'Fachada',valorUnit:'900',subtotal:900}],
   erpAlteracoes:[{em:'2026-09-19',campos:[{campo:'cnpjCpf',antes:'111',depois:'123.456.789-00'}]}]});
 const e=await edge('pcp-sync',{pcp_registros:[reg]});
 const vazou=o=>/123\.456|"valorTotal"|"valorUnit"|"subtotal"|erpAlteracoes/.test(JSON.stringify(o));
 const lista=await e.call({action:'list'},toque);assert.equal(lista.os.length,1);assert.ok(!vazou(lista.os),JSON.stringify(lista.os));
 const delta=await e.call({action:'list',since:'2026-09-18'},toque);assert.ok(!vazou(delta.os));
 const r=await e.call({action:'upsert',os:{id:'1',rev:1,obsTecnicas:'ok'}},toque);
 assert.equal(r.status,200);assert.ok(!vazou(r.os),JSON.stringify(r.os));
 const g=e.db.pcp_registros[0].registro;assert.equal(g.cnpjCpf,'123.456.789-00','o que não desce não se perde na volta');
 assert.equal(g.valorTotal,900);assert.equal(g.itens[0].valorUnit,'900');assert.equal(g.erpAlteracoes.length,1);
 // A gestão continua recebendo tudo.
 const gestao=await e.call({action:'list'},{papel:'pcp',nome:'Gestor'});assert.equal(gestao.os[0].cnpjCpf,'123.456.789-00');
});
test('config: quem entrou pelo nome não recebe bônus nem apuração da performance',async()=>{
 const e=await edge('pcp-sync',{pcp_config_global:[{id:true,config:{instaladores:['Ana'],bonusPCP:{teto:1000},performancePCP:{equipes:[],participacoes:[]},agendaPCP:{}},atualizado_em:'2026-09-19T10:00:00Z'}]});
 const r=await e.call({action:'getCfg'},toque);assert.equal(r.cfg.bonusPCP,undefined);assert.equal(r.cfg.performancePCP,undefined);assert.ok(r.cfg.agendaPCP);
 const pcp=await e.call({action:'getCfg'},{papel:'pcp',nome:'Gestor'});assert.ok(pcp.cfg.bonusPCP);assert.ok(pcp.cfg.performancePCP);
});

test('remarcação fantasma: a agenda na ordem do jsonb não apaga a confirmação nem a liberação do carro',async()=>{
 // O banco devolve {data, hora, periodo, duracaoDias}; o tablet que criou a O.S. manda {data, periodo, hora, duracaoDias}.
 const e=await edge('pcp-sync',{pcp_registros:[row('1',{instalacao:{data:'2026-09-19',hora:'',periodo:'Manhã',duracaoDias:1},confirmacao:'Confirmado',confEm:'2026-09-19T09:00:00-03:00',carroLiberado:true,carroLiberadoEm:'2026-09-19T10:00:00-03:00'})]});
 const r=await e.call({action:'upsert',os:{id:'1',rev:1,instalacao:{data:'2026-09-19',periodo:'Manhã',hora:'',duracaoDias:1},confirmacao:'Confirmado',confEm:'2026-09-19T09:00:00-03:00',carroLiberado:true,carroLiberadoEm:'2026-09-19T10:00:00-03:00',veiculo:'Fiorino'}},{papel:'pcp',nome:'Gestor'});
 assert.equal(r.ok,true);assert.equal(r.os.confirmacao,'Confirmado');assert.equal(r.os.carroLiberado,true);
});

test('espelho: carro liberado com a confirmação da véspera não prende a O.S. na fila; só a liberação fica de fora',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[pronta({instalacao:{data:'2026-09-19'},confEm:'2026-09-18T09:00:00-03:00'})]});
 const r=await e.call({action:'upsert',os:{id:'1',rev:1,carroLiberado:true,carroLiberadoEm:'2026-09-19T08:00:00-03:00',fotosCheckinIds:['foto_1'],horaSaida:'08:00'}},toque);
 assert.equal(r.status,200);assert.match(r.avisos.join(' '),/carro não foi liberado/);
 const g=e.db.pcp_registros[0].registro;assert.equal(g.carroLiberado,false);assert.deepEqual(g.fotosCheckinIds,['foto_1']);assert.equal(g.horaSaida,'08:00');
 // A gestão continua recebendo a recusa.
 assert.equal((await e.call({action:'upsert',os:{...g,carroLiberado:true,carroLiberadoEm:'2026-09-19T08:00:00-03:00'}},{papel:'pcp'})).status,422);
});
test('espelho: serviço que vira a noite (saída 13h, retorno 9h) grava o retorno no dia seguinte',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[pronta()]});
 const r=await e.call({action:'upsert',os:{id:'1',rev:1,saidaEm:'2026-09-19T13:00:00-03:00',retornoEm:'2026-09-19T09:00:00-03:00',horaRetorno:'09:00'}},toque);
 assert.equal(r.status,200);assert.equal(e.db.pcp_registros[0].registro.retornoEm,'2026-09-20T09:00:00-03:00');
 const e2=await edge('pcp-sync',{pcp_registros:[pronta()]});
 const r2=await e2.call({action:'upsert',os:{id:'1',rev:1,saidaEm:'2026-09-19T13:00:00-03:00',retornoEm:'2026-09-15T09:00:00-03:00',obsTecnicas:'ok'}},toque);
 assert.equal(r2.status,200,'retorno impossível fica de fora; o resto grava');assert.equal(e2.db.pcp_registros[0].registro.retornoEm,'');
 assert.equal(e2.db.pcp_registros[0].registro.obsTecnicas,'ok');assert.match(r2.avisos.join(' '),/retorno/);
});

test('dupla no mesmo serviço: cópia velha não abre conflito, soma as fotos e não apaga o que o colega gravou',async()=>{
 // A (rev 1 -> 2) fez o check-in; B, com a cópia do rev 1, manda as fotos dele.
 const e=await edge('pcp-sync',{pcp_registros:[pronta({rev:2,fotosCheckinIds:['foto_a'],horaSaida:'08:00',carroLiberado:true})]});
 const r=await e.call({action:'upsert',os:{id:'1',rev:1,fotosCheckinIds:['foto_b'],horaSaida:'',carroLiberado:false,obsTecnicas:'faltou fita'}},{...toque,nome:'Ana'});
 assert.equal(r.conflito,undefined);assert.equal(r.status,200);
 const g=e.db.pcp_registros[0].registro;
 assert.deepEqual(g.fotosCheckinIds,['foto_a','foto_b']);assert.equal(g.horaSaida,'08:00');assert.equal(g.carroLiberado,true);assert.equal(g.obsTecnicas,'faltou fita');
 assert.equal(g.rev,3);
});
test('cópia em dia troca a lista de fotos (o × do espelho tira foto da lista)',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[pronta({fotosCheckinIds:['foto_a','foto_b']})]});
 await e.call({action:'upsert',os:{id:'1',rev:1,fotosCheckinIds:['foto_a']}},toque);
 assert.deepEqual(e.db.pcp_registros[0].registro.fotosCheckinIds,['foto_a']);
});
test('cópia velha não refinaliza a O.S. que a gestão reabriu depois',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[pronta({rev:3,reabertaEm:'2026-09-23T19:00:00Z',fotosRetornoIds:['f1'],retornoEm:'2026-09-23T15:00:00-03:00'})]});
 const r=await e.call({action:'upsert',os:{id:'1',rev:2,finalizadaEm:'2026-09-23T15:05:00-03:00',fotosRetornoIds:['f1'],retornoEm:'2026-09-23T15:00:00-03:00'}},toque);
 assert.equal(r.status,200);assert.equal(e.db.pcp_registros[0].registro.finalizadaEm,undefined);assert.match(r.avisos.join(' '),/reabriu/);
});
test('crachá de toque: lista de foto que não é lista, id com caminho e texto enorme não entram',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[pronta({fotosCheckinIds:['foto_a']})]});
 await e.call({action:'upsert',os:{id:'1',rev:1,fotosCheckinIds:'foto_x',fotosRetornoIds:['../../rh/ficha','foto_ok'],obsTecnicas:'x'.repeat(50000)}},toque);
 const g=e.db.pcp_registros[0].registro;
 assert.deepEqual(g.fotosCheckinIds,['foto_a']);assert.deepEqual(g.fotosRetornoIds,['foto_ok']);assert.equal(g.obsTecnicas.length,2000);
});

test('resposta perdida por sinal ruim: o mesmo envio repetido não vira conflito',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[row('1',{cliente:'A',atualizadoEm:'2026-09-19T09:00:00Z'})]});
 const envio={id:'1',rev:1,cliente:'B',atualizadoEm:'2026-09-19T11:00:00Z'};
 assert.equal((await e.call({action:'upsert',os:envio},{papel:'pcp'})).ok,true);
 const de_novo=await e.call({action:'upsert',os:envio},{papel:'pcp'});
 assert.equal(de_novo.conflito,undefined);assert.equal(de_novo.ok,true);assert.equal(de_novo.os.rev,2);
 // Outra escrita com o mesmo rev velho continua sendo conflito.
 assert.equal((await e.call({action:'upsert',os:{...envio,atualizadoEm:'2026-09-19T11:30:00Z'}},{papel:'pcp'})).conflito,true);
});

test('excluir O.S. não apaga as fotos do bucket (a O.S. pode voltar pela conciliação)',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[pronta({fotosCheckinIds:['foto_a'],layoutFotoId:'foto_l'})]});
 const removidas=[];e.cliente.storage={from:()=>({remove:async ids=>{removidas.push(...ids);return {error:null};}})};
 const r=await e.call({action:'delete',id:'1'},{papel:'pcp'});assert.equal(r.ok,true);
 assert.equal(e.db.pcp_registros[0].apagado,true);assert.deepEqual(removidas,[]);
});
test('apagar foto pelo crachá de toque: nunca o layout do PCP nem a prova de O.S. finalizada',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[pronta({layoutFotoId:'foto_l',fotosCheckinIds:['foto_c']}),row('2',{equipe:['Ana'],finalizadaEm:'2026-09-19T10:00:00Z',fotosRetornoIds:['foto_prova']})]});
 e.cliente.storage={from:()=>({remove:async()=>({error:null})})};
 assert.equal((await e.call({action:'deletePhoto',fileId:'foto_l'},toque)).status,403);
 assert.equal((await e.call({action:'deletePhoto',fileId:'foto_prova'},toque)).status,403);
 assert.equal((await e.call({action:'deletePhoto',fileId:'foto_c'},toque)).status,200);
});
test('apagar foto pelo crachá de toque: pôr a prova ou o layout numa O.S. aberta antes não abre a trava',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[pronta({layoutFotoId:'foto_l',fotosCheckinIds:['foto_c','foto_prova','foto_l']}),row('2',{equipe:['Ana'],finalizadaEm:'2026-09-19T10:00:00Z',fotosRetornoIds:['foto_prova']})]});
 const removidas=[];e.cliente.storage={from:()=>({remove:async ids=>{removidas.push(...ids);return {error:null};}})};
 assert.equal((await e.call({action:'deletePhoto',fileId:'foto_prova'},toque)).status,403,'a prova da O.S. finalizada continua no bucket');
 assert.equal((await e.call({action:'deletePhoto',fileId:'foto_l'},toque)).status,403,'o layout do PCP continua no bucket');
 assert.equal((await e.call({action:'deletePhoto',fileId:'foto_c'},toque)).status,200);
 assert.deepEqual(removidas,['foto_c']);
});
test('crachá de toque: foto além do teto de 60 é dita em avisos',async()=>{
 const ids=Array.from({length:60},(_,i)=>'foto_'+String(i).padStart(2,'0'));
 const e=await edge('pcp-sync',{pcp_registros:[pronta({fotosCheckinIds:ids})]});
 const r=await e.call({action:'upsert',os:{id:'1',rev:1,fotosCheckinIds:[...ids,'foto_nova']}},toque);
 assert.equal(r.status,200);
 assert.ok((r.avisos||[]).some(a=>/1 foto ficou de fora/.test(a)),JSON.stringify(r.avisos));
});
test('putPhoto: tipo que o navegador executa, arquivo grande e id com caminho são recusados',async()=>{
 const e=await edge('pcp-sync');const subidas=[];
 e.cliente.storage={from:()=>({upload:async id=>{subidas.push(id);return {error:null};}})};
 const jpg='data:image/jpeg;base64,'+Buffer.from('abc').toString('base64');
 assert.equal((await e.call({action:'putPhoto',base64:'data:text/html;base64,'+Buffer.from('<script>').toString('base64'),fileId:'foto_1758300000000_abc123'},toque)).status,422);
 assert.equal((await e.call({action:'putPhoto',base64:jpg,fileId:'../rh/ficha.jpg'},toque)).status,422);
 assert.equal((await e.call({action:'putPhoto',base64:'data:image/jpeg;base64,'+Buffer.alloc(2_100_000).toString('base64'),fileId:'foto_1758300000000_abc123'},toque)).status,422);
 const ok=await e.call({action:'putPhoto',base64:jpg,mime:'image/jpeg',fileId:'foto_1758300000000_abc123'},toque);
 assert.equal(ok.fileId,'foto_1758300000000_abc123');assert.deepEqual(subidas,['foto_1758300000000_abc123']);
});

test('saúde: o batimento da importação não desce para quem entrou pelo nome',async()=>{
 const e=await edge('pcp-sync',{pcp_meta:[{chave:'sync_status',valor:{ok:false,erro:'x'}}]});
 const r=await e.call({action:'saude'},toque);assert.equal(r.ok,true);assert.equal(r.ultimaImportacao,undefined);
 assert.ok((await e.call({action:'saude'},{papel:'pcp'})).ultimaImportacao);
});

test('pcp-mubisys: fora de Entregas, só o administrador usa a porta do ERP',async()=>{
 const e=await edge('pcp-mubisys');
 for(const action of ['importarLote','listarOS','getOS','preview','importar','ping','pingERP']){
  for(const who of [toque,{papel:'pcp',nome:'Gestor'},{papel:'comercial',nome:'Vendedor'}]){
   const r=await e.call({action,lista:[{sequencial_ordem:'1',cliente:'X'}]},who);
   assert.equal(r.status,403,action+' com '+who.papel);
  }
 }
 // Entregas continua com a trava dela (admin/pcp), sem passar por esta.
 assert.notEqual((await e.call({action:'entreguesMes',mes:'2026-09'},{papel:'pcp',nome:'Gestor'})).status,403);
});
test('pcp-mubisys: o batimento gravado passa por semCredencial campo a campo',async()=>{
 const e=await edge('pcp-mubisys');
 const st=await e.run(`gravarBatimento({em:'2026-09-25T10:00:00Z',ok:true,entregues:{erro:'error sending request for url (https://x.mubisys.com/api/CHAVESECRETA123/ordem-servico?status=X)'}})`);
 assert.doesNotMatch(JSON.stringify(e.db.pcp_meta),/CHAVESECRETA123/);assert.match(st.entregues.erro,/<chave>/);
});
test('conciliação: excluída que o ERP ainda lista volta com a marca de por que voltou',async()=>{
 const morta={...row('mub-1',{numero:'1',origemMubisys:true,equipe:['Ana']}),apagado:true};
 const e=await edge('pcp-mubisys',{pcp_registros:[morta]});
 await e.run(`reconciliarCarteira(sb,[{numero:'1',cliente:'Cliente'}])`);
 assert.equal(e.db.pcp_registros[0].apagado,false);assert.ok(e.db.pcp_registros[0].registro.restauradaPeloERPEm);
});

/* A NOTA DO CARRO CONTA VOLTAS, NÃO O.S. (performance-3). */
const P=require('../performance.js'),O=require('../operacao.js');
const ana={chave:'ana',nome:'Ana',percentual:100};
test('nota do carro: três O.S. na mesma viagem com o carro sujo pesam UMA volta, não três',()=>{
 const sujo={carroLimpo:'nao',equipamentosOk:'sim'},limpo={carroLimpo:'sim',equipamentosOk:'sim'};
 const regs=[
  {id:'1',membros:[ana],retornoConf:sujo,volta:'2026-09-08|fiorino|ana',voltou:true},
  {id:'2',membros:[ana],retornoConf:sujo,volta:'2026-09-08|fiorino|ana',voltou:true},
  {id:'3',membros:[ana],retornoConf:sujo,volta:'2026-09-08|fiorino|ana',voltou:true},
  {id:'4',membros:[ana],retornoConf:limpo,volta:'2026-09-09|fiorino|ana',voltou:true}];
 const av=P.avaliar(regs,{producao:0,limpeza:100,equipamentos:0});
 assert.equal(av.pessoas[0].componentes.limpeza,50,'pelas O.S. seria 25');
 assert.equal(av.cobertura.limpeza.voltas,2);assert.equal(av.pessoas[0].voltas,2);assert.equal(av.pessoas[0].entregas,4);
 // Revisão fechada antes (registro sem a chave da volta) segue a conta de antes: uma volta por O.S.
 const antigo=P.avaliar(regs.map(({volta,voltou,...r})=>r),{producao:0,limpeza:100,equipamentos:0});
 assert.equal(antigo.pessoas[0].componentes.limpeza,25);assert.equal(antigo.cobertura.limpeza.voltas,4);
});
test('nota do carro: baixa do ERP sem viagem não entra na conta do carro (a fila nunca a mostra)',()=>{
 const regs=[{id:'1',membros:[ana],retornoConf:{carroLimpo:'sim',equipamentosOk:'sim'},volta:'a',voltou:true},
  ...Array.from({length:4},(_,i)=>({id:'e'+i,membros:[ana],retornoConf:null,volta:'b'+i,voltou:false}))];
 const av=P.avaliar(regs,P.CRITERIOS_PADRAO);
 assert.equal(av.cobertura.limpeza.voltas,1);assert.equal(av.cobertura.limpeza.ok,true);assert.equal(av.pessoas[0].entregas,5,'a produção continua contando');
});
test('a chave e o filtro da volta no servidor são os mesmos da fila (lista copiada falha calada)',async()=>{
 const base={tipo:'externo',liberadoPCP:true,confirmacao:'Confirmado',instalacao:{data:'2026-09-08',periodo:'Manhã'},valorTotal:10};
 const lista=[
  {...base,id:'a',numero:'1',equipe:['Ána','Bia'],veiculo:'Fiorino ',retornoEm:'2026-09-08T17:00:00-03:00',finalizadaEm:'2026-09-08T17:10:00-03:00',finalizadoPor:'Ana'},
  {...base,id:'b',numero:'2',equipe:['bia','Ana'],veiculo:'fiorino',horaRetorno:'18:00',saidaEm:'2026-09-08T08:00:00-03:00',finalizadaEm:'2026-09-09T09:00:00-03:00',finalizadoPor:'Bia'},
  {...base,id:'c',numero:'3',equipe:['Ana'],veiculo:'Strada',finalizadaEm:'2026-09-05T10:00:00-03:00',finalizadoPor:'Mubisys (baixa automática)',baixaAutoERP:{em:'2026-09-05T10:00:00-03:00'},entregaLancada:{data:'2026-09-04',em:'x',por:'Gestor'}},
  {...base,id:'d',numero:'4',equipe:['Ana'],veiculo:'Strada',finalizadaEm:'2026-09-06T10:00:00-03:00',finalizadoPor:'Mubisys (baixa automática)',baixaAutoERP:{em:'2026-09-06T10:00:00-03:00'}}];
 const e=await edge('pcp-sync',{pcp_registros:lista.map(o=>({id:o.id,colecao:'os',apagado:false,atualizado_em:'2026-09-01T00:00:00Z',registro:o}))});
 const f=await e.call({action:'performancePeriodo',de:'2026-09-01',ate:'2026-09-10'},{papel:'pcp',nome:'Gestor'});
 assert.equal(f.regra,'performance-3');
 for(const o of lista){
  const r=f.registros.find(x=>x.id===o.id);assert.ok(r,o.id);
  assert.equal(r.voltou,O.voltou(o),'voltou '+o.id);
  assert.equal(r.volta,O.chaveDaVolta(o),'volta '+o.id);
 }
 assert.equal(f.registros.find(x=>x.id==='a').volta,f.registros.find(x=>x.id==='b').volta,'mesma viagem, uma volta');
});
test('volta do carro usa a data de entrega lançada pela gestão antes da data da baixa do ERP',()=>{
 const o={tipo:'externo',equipe:['Ana'],finalizadaEm:'2026-09-23T10:00:00-03:00',finalizadoPor:'Mubisys',baixaAutoERP:{em:'2026-09-23T10:00:00-03:00'},entregaLancada:{data:'2026-09-20'}};
 assert.equal(O.diaDaVolta(o),'2026-09-20');
});
test('cartão "Sua próxima instalação": no mesmo dia, a da manhã vem antes da da tarde',()=>{
 const d='2026-09-25',o=(id,periodo,hora='')=>({id,tipo:'externo',liberadoPCP:true,confirmacao:'Confirmado',equipe:['Ana'],instalacao:{data:d,periodo,hora}});
 assert.equal(O.destaqueDoDia([o('t','Tarde'),o('m','Manhã')],d).id,'m');
 assert.equal(O.destaqueDoDia([o('h14','Horário','14:00'),o('h09','Horário','09:30')],d).id,'h09');
});
test('relatório de entregas não cai por O.S. que mudou durante a consulta (só lê)',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[pronta({finalizadaEm:'2026-09-10T10:00:00-03:00',finalizadoPor:'Ana',retornoEm:'2026-09-10T09:00:00-03:00'})]});
 // Uma O.S. gravada no meio da varredura.
 e.db.pcp_registros[0].atualizado_em='2099-01-01T00:00:00Z';
 const r=await e.call({action:'relatorioEntregas',ano:2026},{papel:'pcp',nome:'Gestor'});
 assert.equal(r.error,undefined,r.error);assert.equal(r.ano,2026);
 const f=await e.call({action:'performancePeriodo',de:'2026-09-01',ate:'2026-09-30'},{papel:'pcp',nome:'Gestor'});
 assert.match(f.error,/base mudou/,'a apuração, que sela um hash, continua estrita');
});

/* TELAS DE LEITURA: relatório e apuração (auditoria de 25/09/2026). */
const fs=require('node:fs'),vm=require('node:vm');
const MES_CURTO=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
function relatorio(extra={}){const ctx=vm.createContext({console,Date,Set,Number,Object,Map,Intl,JSON,MES_CURTO,esc:s=>String(s),...extra});vm.runInContext(fs.readFileSync('relatorios-entregas.js','utf8'),ctx);return c=>vm.runInContext(c,ctx);}
test('relatório: o mês em andamento aparece como parcial (ponto vazado, "até dd/mm"), não como queda',()=>{
 const run=relatorio();
 run("REL_ENT.dados={ate:'2026-10-03',meses:[{mes:'2026-09',entregue:400000},{mes:'2026-10',entregue:30000},{mes:'2026-11',futuro:true}]}");
 assert.equal(run("relEntParcial(REL_ENT.dados.meses[1])"),true);assert.equal(run("relEntParcial(REL_ENT.dados.meses[0])"),false);
 assert.equal(run("relEntMesTxt(REL_ENT.dados.meses[1])"),'out (até 03/10)');
 const html=run("relEntGrafico(['entregue'],'Teste')");
 assert.match(html,/stroke-dasharray/,'trecho até o mês em andamento é tracejado');assert.match(html,/fill="white"/,'ponto vazado');
 assert.match(html,/mês em andamento/);
 // O mês que fechou no último dia não é parcial.
 run("REL_ENT.dados={ate:'2026-09-30',meses:[{mes:'2026-09',entregue:1}]}");assert.equal(run("relEntParcial(REL_ENT.dados.meses[0])"),false);
});
test('relatório: abre no último mês fechado e o erro de rede sai em português, com ponto',()=>{
 const run=relatorio();
 const m=new Date().getMonth();assert.equal(run('REL_ENT.foco'),m?String(m).padStart(2,'0'):'');
 assert.equal(run("relEntErroTxt(new TypeError('Load failed'))"),'Sem conexão com o servidor. Tente de novo.');
 assert.equal(run("relEntErroTxt(new Error('Failed to fetch'))"),'Sem conexão com o servidor. Tente de novo.');
 assert.equal(run("relEntErroTxt(new Error('Ano inválido'))"),'Ano inválido.');
});
test('relatório: a aba Relatórios só aparece para quem o servidor atende (admin e pcp)',()=>{
 assert.equal(relatorio({STATE:{user:{papel:'montagem'}}})("abasEntregasHTML('lista')"),'');
 assert.equal(relatorio({STATE:{user:{papel:'comercial'}}})("abasEntregasHTML('lista')"),'');
 assert.match(relatorio({STATE:{user:{papel:'pcp'}}})("abasEntregasHTML('lista')"),/Relatórios/);
});
test('relatório: as áreas da produção escolhidas voltam depois de recarregar',()=>{
 const guardado={};const localStorage={getItem:k=>guardado[k]??null,setItem:(k,v)=>{guardado[k]=v;}};
 let run=relatorio({localStorage});run("REL_ENT.areasProducao.delete('Serralheria');relEntGuardarAreas()");
 run=relatorio({localStorage});assert.equal(run("REL_ENT.areasProducao.has('Serralheria')"),false);assert.equal(run("REL_ENT.areasProducao.has('Acabamento')"),true);
 // Sem armazenamento (aba privada), vale a lista padrão.
 run=relatorio({localStorage:{getItem(){throw new Error('bloqueado');}}});assert.equal(run("REL_ENT.areasProducao.has('Serralheria')"),true);
});
function apuracao(papel){
 const src=fs.readFileSync('performance.js','utf8');
 const c={STORE:{getCFG:()=>({performancePCP:{equipes:[],participacoes:[]}}),getAllOS:()=>[],getQueue:()=>[],api:()=>{c.chamou=true;return new Promise(()=>{});}},STATE:{user:{papel}},periodoOuMes:()=>({de:'2026-09-01',ate:'2026-09-19'}),esc:s=>String(s??''),renderPerformanceCasa:()=>{},toast:()=>{}};
 vm.createContext(c);vm.runInContext(src,c);return c;
}
test('apuração: montagem e operação veem a prévia dita como prévia, sem consultar o servidor que as recusa',()=>{
 for(const papel of ['montagem','operacao']){
  const c=apuracao(papel);const html=c.perfFonteHTML();
  assert.match(html,/Prévia do aparelho/);assert.doesNotMatch(html,/perf-atualizar-fonte|role="alert"/);
  c.perfWireFonte({querySelector:()=>null});assert.equal(c.chamou,undefined,papel+' não chama performancePeriodo');
 }
 const g=apuracao('pcp');g.perfWireFonte({querySelector:()=>null});assert.equal(g.chamou,true);
 assert.equal(g.perfErroTxt(new TypeError('Failed to fetch')),'Sem conexão com o servidor. Tente de novo.');
});
test('apuração: aviso "Houve mudanças" só acende por O.S. do período mexida por gente, não pela importação do ERP',()=>{
 const c=apuracao('pcp');vm.runInContext(fs.readFileSync('operacao.js','utf8'),c);
 const lista=[
  {id:'erp',finalizadaEm:'2026-09-10T10:00:00',atualizadoEm:'2026-09-20T09:00:00',atualizadoPor:'Mubisys (importação)'},
  {id:'outubro',instalacao:{data:'2026-10-02'},atualizadoEm:'2026-09-20T09:00:00',atualizadoPor:'Gestor'}];
 c.STORE.getAllOS=()=>lista;
 vm.runInContext("perfRemoto.chave=perfChave();perfRemoto.dados={consultadoEm:'2026-09-20T08:00:00',fonte:''};",c);
 assert.doesNotMatch(c.perfFonteHTML(),/Houve mudanças/);
 lista.push({id:'conferida',finalizadaEm:'2026-09-12T10:00:00',atualizadoEm:'2026-09-20T09:30:00',atualizadoPor:'Gestor'});
 assert.match(c.perfFonteHTML(),/Houve mudanças/);
});
test('limpeza do carro: o envio velho do colega não desfaz a correção gravada depois, e é dito',async()=>{
 const ana={por:'Ana',porId:'Ana',em:'2026-09-19T21:10:00.000Z',recebidoEm:'2026-09-19T21:10:05.000Z',carroLimpo:'nao',carroArrumado:'sim',equipamentosOk:'sim',semAvaria:'sim',obs:'banco sujo',fotos:[],dia:'2026-09-19',veiculo:''};
 const e=await edge('pcp-sync',{pcp_registros:[pronta({equipe:['Ana','Bruno'],voltaEquipe:ana})]});
 const bruno={nome:'Bruno',papel:'montagem',montagemIndividual:true};
 const r=await e.call({action:'upsert',os:{id:'1',rev:0,voltaEquipe:{carroLimpo:'sim',carroArrumado:'sim',equipamentosOk:'sim',semAvaria:'sim',obs:'',fotos:[],em:'2026-09-19T21:00:00.000Z'}}},bruno);
 assert.equal(r.status,200);
 const g=e.db.pcp_registros[0].registro.voltaEquipe;
 assert.equal(g.carroLimpo,'nao','a correção das 18:10 fica');assert.equal(g.por,'Ana');
 assert.ok((r.avisos||[]).some(a=>/limpeza do carro não foi trocada/.test(a)),JSON.stringify(r.avisos));
});
test('crachá de toque: foto tirada no × não volta pela soma da cópia velha, nem pelo envio velho do colega',async()=>{
 const {mesclarToqueNoNome}=await import('../supabase/functions/_shared/pcp-integridade.mjs');
 const atual={id:'1',rev:7,fotosCheckinIds:['foto_a1','foto_b1'],itens:[{item:'1',descricao:'Lona',fotoProbId:'foto_p1'}]};
 // Ana tira a1 e a foto do problema com a cópia rev 6 (o colega pôs b1 na 7).
 const r=mesclarToqueNoNome(atual,{id:'1',rev:6,fotosCheckinIds:[],fotosTiradas:['foto_a1','foto_p1'],itens:[{item:'1',descricao:'Lona',fotoProbId:''}]},'Ana','2026-09-25T12:00:00Z');
 assert.deepEqual(r.os.fotosCheckinIds,['foto_b1'],'a foto do colega fica; a tirada sai');
 assert.equal(r.os.itens[0].fotoProbId,'');
 // Envio velho do Bruno, que ainda tinha a1: não traz de volta.
 const b=mesclarToqueNoNome({...r.os,rev:8},{id:'1',rev:5,fotosCheckinIds:['foto_a1']},'Bruno','2026-09-25T12:05:00Z');
 assert.deepEqual(b.os.fotosCheckinIds,['foto_b1']);
});
test('crachá de toque: desmarcar Instalação OK numa cópia velha não vale, mas é dito',async()=>{
 const {mesclarToqueNoNome}=await import('../supabase/functions/_shared/pcp-integridade.mjs');
 const r=mesclarToqueNoNome({id:'1',rev:6,instalacaoOK:true},{id:'1',rev:5,instalacaoOK:false},'Ana','2026-09-25T12:00:00Z');
 assert.equal(r.os.instalacaoOK,true);
 assert.ok(r.avisos.some(a=>/Instalação OK" continua marcada/.test(a)),JSON.stringify(r.avisos));
});
