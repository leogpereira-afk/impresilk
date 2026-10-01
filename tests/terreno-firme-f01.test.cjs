/* TERRENO FIRME (F01, 29/09/2026). Antes da alocação dentro da O.S. (F08):
   (1) a ficha lembra os blocos abertos pela chave data-bloco, não pela posição;
   (2) a baixa automática do ERP grava com trava de versão, relê e repete uma
   vez, e diz a causa quando desiste;
   (3) a lista única CAMPOS_GESTAO entra no "com trabalho" do esqueleto e na
   preservação do ausente, sem aceitar valor novo ainda (só a limpeza
   explícita da gestão: o campo presente e vazio, null, '', [] ou {});
   (4) entregaLancada é carimbada pelo servidor (por, porConta, porId, em) e só
   quem lança com senha grava; null não desfaz, só { desfazer: true } de admin
   e pcp;
   (5) os carimbos da ficha ganham o ID do RH, resolvido pelo crachá, só quando
   o nome é o do crachá; a marca que volta reusa o ID do par já carimbado.
   A parte "Revisão da F01", no fim, traz os casos que os revisores provaram.
   Cada teste começa pelo caso ruim. Dados fictícios (repositório público). */
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {edge}=require('./helpers/edge.cjs');
const row=(id,registro,extra={})=>({id,colecao:'os',apagado:false,atualizado_em:'2026-09-19T10:00:00Z',...extra,registro:{id,rev:1,...registro}});
const base=(extra={})=>row('1',{numero:'5001',tipo:'externo',cliente:'Cliente Fictício',equipe:['Ana'],veiculo:'Fiorino',instalacao:{data:'2026-09-30',periodo:'Manhã',hora:'',duracaoDias:1},...extra});
const gestor={papel:'pcp',nome:'Gestor Teste',sub:'gestor'};
const operacao={papel:'operacao',nome:'Operação Teste',sub:'operacao1'};
const comercial={papel:'comercial',nome:'Vendas Teste',sub:'vendas1'};
const toque={nome:'Ana',sub:'Ana',id:'100001',papel:'montagem',montagemIndividual:true};
// A régua de pessoas lê as fichas do RH: uma ficha fictícia com apelido = login.
const fichas=[{colecao:'colaboradores',id:'gestor-teste',apagado:false,registro:{id:'gestor-teste',nome:'Gestor Teste',apelido:'gestor',cpf:'111.222.333-44'}}];
const gravada=(e,id='1')=>e.db.pcp_registros.find(r=>r.colecao==='os'&&r.id===id).registro;
const copia=(e,id='1')=>structuredClone(gravada(e,id));
const shared=()=>import('../supabase/functions/_shared/pcp-integridade.mjs');

/* ───────────── (3) CAMPOS_GESTAO: lista única, preservar o ausente ───────────── */

test('CAMPOS_GESTAO nasce com os campos das próximas fatias e todos entram no diário',async()=>{
 const {CAMPOS_GESTAO,CAMPOS_AUDITADOS}=await shared();
 assert.deepEqual([...CAMPOS_GESTAO].sort(),['abonos','alocacao','alocacaoLog','cancelamento','chegadasConferidas','ocorrencias','osOriginalId','prazoCombinado','retornoConferido','retornoPrevisto']);
 for(const c of CAMPOS_GESTAO)assert.ok(CAMPOS_AUDITADOS.includes(c),c+' fora do diário');
 assert.ok(!CAMPOS_GESTAO.some(c=>/cpf/i.test(c)));
});

test('preservarAusentes (regra pura): ausente fica o gravado; valor novo ainda não entra; vazio presente da gestão limpa; o log não se apaga',async()=>{
 const {preservarAusentes}=await shared();
 const antes={id:'1',alocacao:{grupos:[{membros:[{pessoaId:'100001'}]}]},retornoPrevisto:{dia:'2026-09-30',hora:'17:00'},alocacaoLog:[{em:'x'}],prazoCombinado:'2026-09-30'};
 // Caso ruim 1: a cópia de uma versão que não conhece o campo apagaria a alocação.
 let r=preservarAusentes({id:'1',cliente:'X'},antes,{podeLimpar:true});
 assert.deepEqual(r.alocacao,antes.alocacao);assert.deepEqual(r.retornoPrevisto,antes.retornoPrevisto);assert.equal(r.cliente,'X');
 // Caso ruim 2: o aparelho inventa um valor antes da fatia que o aceita.
 r=preservarAusentes({id:'1',alocacao:{forjada:true},prazoCombinado:'2099-01-01',osOriginalId:'mub-9'},antes,{podeLimpar:true});
 assert.deepEqual(r.alocacao,antes.alocacao,'nenhum valor novo é aceito na F01');
 assert.equal(r.prazoCombinado,'2026-09-30');
 assert.ok(!('osOriginalId' in r),'campo que não estava gravado não nasce do aparelho');
 // Caso ruim 3: limpar de propósito (desfazer, trocar para Cliente retira) não pode ser impedido.
 r=preservarAusentes({id:'1',retornoPrevisto:null,alocacao:null,alocacaoLog:null},antes,{podeLimpar:true});
 assert.equal(r.retornoPrevisto,null,'null explícito da gestão limpa');assert.equal(r.alocacao,null);
 assert.deepEqual(r.alocacaoLog,antes.alocacaoLog,'o log de alocação é histórico: não se apaga');
 // Quem não é gestão não limpa.
 r=preservarAusentes({id:'1',retornoPrevisto:null},antes,{podeLimpar:false});
 assert.deepEqual(r.retornoPrevisto,antes.retornoPrevisto);
 // Vazio presente ('' é o jeito da casa de desfazer, lista e objeto vazios também) limpa com null.
 r=preservarAusentes({id:'1',retornoPrevisto:'',alocacao:[],prazoCombinado:{},alocacaoLog:[]},antes,{podeLimpar:true});
 assert.equal(r.retornoPrevisto,null);assert.equal(r.alocacao,null);
 assert.deepEqual(r.alocacaoLog,antes.alocacaoLog,'nem o vazio apaga o log');
 // O prazo combinado também não se apaga com vazio: mudar o prazo exige motivo (revisão da F15).
 assert.equal(r.prazoCombinado,'2026-09-30','o vazio não apaga o prazo');
 assert.equal(preservarAusentes({id:'1',prazoCombinado:null},antes,{podeLimpar:true}).prazoCombinado,'2026-09-30','nem o null');
 // Vazio de campo que não estava gravado não cria o campo.
 r=preservarAusentes({id:'1',cancelamento:''},{id:'1'},{podeLimpar:true});
 assert.ok(!('cancelamento' in r));
 // Quem não é gestão não limpa nem com ''.
 r=preservarAusentes({id:'1',retornoPrevisto:''},antes,{podeLimpar:false});
 assert.deepEqual(r.retornoPrevisto,antes.retornoPrevisto);
});

test('upsert da gestão sem o campo preserva o gravado (a versão velha da tela não apaga a alocação)',async()=>{
 const aloc={grupos:[{equipeId:'eq-1',membros:[{pessoaId:'100001',papel:'lider'}]}]};
 const e=await edge('pcp-sync',{pcp_registros:[base({alocacao:aloc,prazoCombinado:'2026-09-30',ocorrencias:[{id:'o1'}]})]});
 const os=copia(e);delete os.alocacao;delete os.prazoCombinado;delete os.ocorrencias;os.obsPCP='recado';
 const r=await e.call({action:'upsert',os},gestor);
 assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.ok,true);
 const g=gravada(e);
 assert.deepEqual(g.alocacao,aloc);assert.equal(g.prazoCombinado,'2026-09-30');assert.deepEqual(g.ocorrencias,[{id:'o1'}]);
 assert.equal(g.obsPCP,'recado');
});

/* TROCADO DE PROPÓSITO NA F15 (29/09/2026): o retorno previsto passou a ser
   digitado pela gestão (admin e pcp), carimbado pelo servidor; o teste dele
   mora em prazo-retorno-f15.test.cjs. Aqui fica o que continua sem entrar: o
   prazo combinado mandado pelo aparelho (ele nasce no servidor) e os campos
   das fatias que ainda não chegaram. */
test('valor novo de CAMPOS_GESTAO vindo do aparelho não é aceito ainda (nem ao criar a O.S.)',async()=>{
 const pc={data:'2026-09-30',fonte:'agenda',por:'Gestor Teste',em:'2026-09-01T10:00:00.000Z'};
 const e=await edge('pcp-sync',{pcp_registros:[base({prazoCombinado:pc})]});
 const os={...copia(e),prazoCombinado:{data:'2026-10-09',fonte:'agenda',por:'Forjado'},cancelamento:{motivo:'forjado'}};
 assert.equal((await e.call({action:'upsert',os},gestor)).status,200);
 assert.deepEqual(gravada(e).prazoCombinado,pc);
 assert.ok(!('cancelamento' in gravada(e)));
 const nova={id:'n1',numero:'7001',tipo:'externo',alocacao:{forjada:true},abonos:[{dias:3}]};
 assert.equal((await e.call({action:'upsert',os:nova},gestor)).status,200);
 const g=gravada(e,'n1');assert.ok(!('alocacao' in g)&&!('abonos' in g),JSON.stringify(g));
});

test('limpeza explícita: gestão com null tira o campo; operação e máquina com null não tiram',async()=>{
 const rp={dia:'2026-09-30',hora:'17:00'};
 const e=await edge('pcp-sync',{pcp_registros:[base({retornoPrevisto:rp,alocacao:{grupos:[]}})]});
 let r=await e.call({action:'upsert',os:{...copia(e),retornoPrevisto:null}},operacao);
 assert.equal(r.status,200);assert.deepEqual(gravada(e).retornoPrevisto,rp,'operação não limpa campo da gestão');
 r=await e.call({action:'upsert',os:{...copia(e),retornoPrevisto:null}},'machine');
 assert.equal(r.status,200);assert.deepEqual(gravada(e).retornoPrevisto,rp,'máquina fica com o gravado');
 r=await e.call({action:'upsert',os:{...copia(e),retornoPrevisto:null}},gestor);
 assert.equal(r.status,200);assert.equal(gravada(e).retornoPrevisto,null,'a gestão limpa de propósito');
 assert.deepEqual(gravada(e).alocacao,{grupos:[]},'o campo que não veio fica');
});

test('crachá de toque não mexe em CAMPOS_GESTAO (nem limpa com null)',async()=>{
 const rp={dia:'2026-09-30',hora:'17:00'};
 const e=await edge('pcp-sync',{pcp_registros:[base({liberadoPCP:true,confirmacao:'Confirmado',retornoPrevisto:rp})]});
 const r=await e.call({action:'upsert',os:{id:'1',rev:1,retornoPrevisto:null,alocacao:{forjada:true},horaSaida:'08:10',saidaEm:'2026-09-30T11:10:00.000Z'}},toque);
 assert.equal(r.status,200,JSON.stringify(r));
 assert.deepEqual(gravada(e).retornoPrevisto,rp);assert.ok(!('alocacao' in gravada(e)));
 assert.equal(gravada(e).horaSaida,'08:10','o resto da execução grava');
});

test('esqueleto do ERP não passa por cima de O.S. que só tem campo de CAMPOS_GESTAO',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[row('mub-9',{numero:'9',origemMubisys:true,tipo:'externo',cliente:'ERP',equipe:[],prazoCombinado:'2026-10-02'})]});
 const esqueleto={id:'mub-9',numero:'9',origemMubisys:true,tipo:'externo',cliente:'ERP',equipe:[],atualizadoEm:'2026-09-29T12:00:00Z',atualizadoPor:'Mubisys (auto)'};
 const r=await e.call({action:'upsert',os:esqueleto},gestor);
 assert.equal(r.status,200);assert.equal(r.duplicataEvitada,true,'o esqueleto é devolvido, não gravado');
 assert.equal(gravada(e,'mub-9').prazoCombinado,'2026-10-02');assert.equal(gravada(e,'mub-9').rev,1);
});

/* ───────────── (4) entregaLancada carimbada pelo servidor ───────────── */

test('entregaLancada: por, porId e em vindos do aparelho são trocados pelo crachá; o ID sai da ficha do login',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[base({finalizadaEm:'2026-09-20T12:00:00Z',finalizadoPor:'Mubisys (baixa)',baixaAutoERP:{em:'2026-09-20T12:00:00Z'}})],registros:fichas});
 const os={...copia(e),entregaLancada:{data:'2026-09-19',por:'Forjado',porConta:'outra',porId:'999999',em:'2020-01-01T00:00:00Z'}};
 const r=await e.call({action:'upsert',os,porId:'999999'},gestor);
 assert.equal(r.status,200,JSON.stringify(r));
 const el=gravada(e).entregaLancada;
 assert.equal(el.data,'2026-09-19');assert.equal(el.por,'Gestor Teste');assert.equal(el.porConta,'gestor');
 assert.equal(el.porId,'111222','ID do RH pela ficha cujo apelido é o login, nunca do aparelho');
 assert.ok(Date.parse(el.em)>Date.parse('2026-01-01'),'a hora é do servidor');
 assert.deepEqual(r.os.entregaLancada,el,'a resposta devolve o carimbo do servidor');
});

test('entregaLancada: operação e montagem com senha lançam (quem tem o botão); o toque, a máquina e o comercial não gravam',async()=>{
 const fim={finalizadaEm:'2026-09-20T12:00:00Z',baixaAutoERP:{em:'2026-09-20T12:00:00Z'}};
 // Operação com senha
 let e=await edge('pcp-sync',{pcp_registros:[base(fim)]});
 let r=await e.call({action:'upsert',os:{...copia(e),entregaLancada:{data:'2026-09-18',por:'x'}}},operacao);
 assert.equal(r.status,200);assert.equal(gravada(e).entregaLancada.por,'Operação Teste');assert.equal(gravada(e).entregaLancada.porConta,'operacao1');
 // Montagem com conta e senha (não é o toque no nome)
 e=await edge('pcp-sync',{pcp_registros:[base(fim)],equipe_contas:[{sistema:'pcp',usuario:'montagem1'}]});
 r=await e.call({action:'upsert',os:{...copia(e),entregaLancada:{data:'2026-09-18'}}},{papel:'montagem',nome:'Montagem Casa',sub:'montagem1'});
 assert.equal(r.status,200,JSON.stringify(r));assert.equal(gravada(e).entregaLancada.porConta,'montagem1');
 // Toque sem senha: não grava, e o resto do envio passa
 e=await edge('pcp-sync',{pcp_registros:[base({liberadoPCP:true,confirmacao:'Confirmado'})]});
 r=await e.call({action:'upsert',os:{id:'1',rev:1,entregaLancada:{data:'2026-09-18',por:'Ana'},horaSaida:'08:10',saidaEm:'2026-09-30T11:10:00.000Z'}},toque);
 assert.equal(r.status,200,JSON.stringify(r));assert.ok(!gravada(e).entregaLancada,'o toque não lança entrega');assert.equal(gravada(e).horaSaida,'08:10');
 // Máquina e comercial: fica o gravado
 const lancada={data:'2026-09-17',por:'Gestor Teste',porConta:'gestor',porId:'111222',em:'2026-09-21T10:00:00.000Z'};
 for(const quem of ['machine',comercial]){
  e=await edge('pcp-sync',{pcp_registros:[base({...fim,entregaLancada:lancada})]});
  r=await e.call({action:'upsert',os:{...copia(e),entregaLancada:{data:'2026-09-01',por:'Outro'}}},quem);
  assert.deepEqual(gravada(e).entregaLancada,lancada,JSON.stringify(quem));
 }
});

test('entregaLancada: regravar a mesma data mantém o carimbo; ausente e null mantêm; só { desfazer: true } da gestão desfaz; data inválida fica a gravada com aviso',async()=>{
 const lancada={data:'2026-09-17',por:'Outra Pessoa',porConta:'outra',porId:'',em:'2026-09-21T10:00:00.000Z'};
 const e=await edge('pcp-sync',{pcp_registros:[base({entregaLancada:lancada})]});
 await e.call({action:'upsert',os:{...copia(e),obsPCP:'a'}},gestor);
 assert.deepEqual(gravada(e).entregaLancada,lancada,'mesma data: quem lançou continua sendo quem lançou');
 const semCampo=copia(e);delete semCampo.entregaLancada;
 await e.call({action:'upsert',os:semCampo},gestor);
 assert.deepEqual(gravada(e).entregaLancada,lancada,'ausente não apaga');
 const r=await e.call({action:'upsert',os:{...copia(e),entregaLancada:{data:'17/09/2026'}}},gestor);
 assert.equal(r.status,200);assert.deepEqual(gravada(e).entregaLancada,lancada);
 assert.ok((r.avisos||[]).some(a=>/entrega/i.test(a)),JSON.stringify(r));
 // Caso ruim: null é o esqueleto (novaOS) de toda cópia que não viu o lançamento.
 await e.call({action:'upsert',os:{...copia(e),entregaLancada:null}},gestor);
 assert.deepEqual(gravada(e).entregaLancada,lancada,'null não desfaz');
 await e.call({action:'upsert',os:{...copia(e),entregaLancada:''}},gestor);
 assert.deepEqual(gravada(e).entregaLancada,lancada,'texto vazio não desfaz');
 // Operação com senha pede desfazer: não pode (desfazer é só admin e pcp).
 await e.call({action:'upsert',os:{...copia(e),entregaLancada:{desfazer:true}}},operacao);
 assert.deepEqual(gravada(e).entregaLancada,lancada,'operação não desfaz');
 await e.call({action:'upsert',os:{...copia(e),entregaLancada:{desfazer:true}}},gestor);
 assert.equal(gravada(e).entregaLancada,null,'desfazer de propósito, pedido explícito da gestão');
});

/* ───────────── (5) carimbos da ficha com o ID do RH ───────────── */

test('carimbos da ficha: o ID vem do crachá; o ID que o aparelho manda é ignorado; tirar a marca tira o ID',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[base()],registros:fichas});
 // Caso ruim: o aparelho manda o ID de outra pessoa junto da liberação.
 let r=await e.call({action:'upsert',os:{...copia(e),liberadoPCP:true,aptoPor:'Gestor Teste',aptoEm:'2026-09-29T10:00:00Z',aptoPorId:'999999',confPorId:'999999'}},gestor);
 assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(gravada(e).aptoPorId,'111222');assert.ok(!gravada(e).confPorId,'carimbo sem marca não ganha ID');
 // Regravar sem mudar a marca: o ID forjado não entra e o certo fica.
 r=await e.call({action:'upsert',os:{...copia(e),aptoPorId:'999999'}},gestor);
 assert.equal(gravada(e).aptoPorId,'111222');
 // Outra conta sem ficha refaz a marca (hora nova): o ID não herda o de quem fez antes.
 r=await e.call({action:'upsert',os:{...copia(e),aptoPor:'Operação Teste',aptoEm:'2026-09-29T11:00:00Z'}},operacao);
 assert.equal(gravada(e).aptoPorId,'','conta sem ficha no RH grava ID vazio');
 // Desfazer tira o ID junto.
 r=await e.call({action:'upsert',os:{...copia(e),liberadoPCP:false,aptoPor:'',aptoEm:''}},gestor);
 assert.equal(gravada(e).aptoPorId,'');
});

test('carimbos da ficha: o toque ganha o ID da régua do crachá (saída), e a gestão o dela (confirmação e carro)',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[base({liberadoPCP:true,confirmacao:'Confirmado',confEm:'2026-09-30T07:00:00-03:00'})],registros:fichas});
 let r=await e.call({action:'upsert',os:{id:'1',rev:1,horaSaida:'08:10',saidaEm:'2026-09-30T11:10:00.000Z',saidaPorId:'999999'}},toque);
 assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(gravada(e).saidaPor,'Ana');assert.equal(gravada(e).saidaPorId,'100001');
 r=await e.call({action:'upsert',os:{...copia(e),confirmacao:'Confirmado',confEm:'2026-09-30T08:00:00-03:00',carroLiberado:true,carroLiberadoPor:'Gestor Teste',carroLiberadoEm:'2026-09-30T08:05:00-03:00'}},gestor);
 assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(gravada(e).confPorId,'111222');assert.equal(gravada(e).carroLiberadoPorId,'111222');
 assert.equal(gravada(e).saidaPorId,'100001','a marca que não mudou mantém o ID de quem fez');
});

/* ───────────── (2) baixa do ERP com trava de versão ───────────── */

async function bancadaBaixa(registros){
 const e=await edge('pcp-mubisys',{pcp_registros:registros});
 // O ERP da bancada: tudo ENTREGUE.
 e.run(`erpGet = async () => ({data:${JSON.stringify(registros.map(r=>({sequencial_ordem:r.registro.numero,status:'ENTREGUE'})))}})`);
 e.run(`console = {...console, warn:(...a)=>globalThis.__avisos.push(a.join(' '))}`);
 e.run('globalThis.__avisos=[]');
 return {...e,baixar:()=>e.run(`baixaAutomatica(sb,'https://erp.invalid','pk',{},{simular:false})`),avisos:()=>e.run('globalThis.__avisos')};
}
const aberta=(id,num,extra={})=>row(id,{numero:num,origemMubisys:true,tipo:'externo',cliente:'ERP',equipe:[],instalacao:{data:'2026-09-01'},...extra});

test('baixa do ERP: gravação concorrente da gestão não se perde (relê e repete) e o rev sobe',async()=>{
 const e=await bancadaBaixa([aberta('mub-1','1')]);
 // Caso ruim: entre a leitura e a gravação da baixa, a gestão aloca a equipe.
 e.cliente.beforeWrite=db=>{const r=db.pcp_registros[0];r.atualizado_em='2026-09-29T15:00:00Z';r.registro={...r.registro,equipe:['Ana'],rev:2};};
 const res=await e.baixar();
 assert.equal(res.baixadas,1,JSON.stringify(res));
 const g=gravada(e,'mub-1');
 assert.deepEqual(g.equipe,['Ana'],'a equipe gravada no meio não some');
 assert.ok(g.finalizadaEm);assert.equal(g.baixaAutoERP.status,'ENTREGUE');
 assert.equal(g.rev,3,'a baixa sobe o rev: a cópia velha do aparelho vira conflito, não sobrescreve');
});

test('baixa do ERP: conflito duas vezes seguidas desiste da O.S. e diz a causa; as outras seguem',async()=>{
 const e=await bancadaBaixa([aberta('mub-1','1'),aberta('mub-2','2')]);
 const mexer=db=>{const r=db.pcp_registros[0];r.atualizado_em='2026-09-29T15:0'+(r.registro.rev)+':00Z';r.registro={...r.registro,obsPCP:'mexida '+r.registro.rev,rev:r.registro.rev+1};};
 e.cliente.beforeWrite=db=>{mexer(db);e.cliente.beforeWrite=mexer;};
 const res=await e.baixar();
 const g=gravada(e,'mub-1');
 assert.ok(!g.finalizadaEm,'O.S. que não parou de mudar não é baixada neste ciclo');
 assert.equal(g.obsPCP,'mexida 2','o que a gestão gravou fica');
 assert.equal(res.baixadas,1,'a outra O.S. foi baixada');assert.ok(gravada(e,'mub-2').finalizadaEm);
 assert.equal(res.desistencias.length,1,JSON.stringify(res));
 assert.equal(res.desistencias[0].numero,'1');assert.match(res.desistencias[0].motivo,/alterada/i);
 assert.ok(e.avisos().some(a=>/desist/i.test(a)&&/\b1\b/.test(a)),JSON.stringify(e.avisos()));
});

test('baixa do ERP: na releitura, O.S. que ganhou agenda futura, foi finalizada ou excluída não é baixada (com a causa)',async()=>{
 const e=await bancadaBaixa([aberta('mub-1','1'),aberta('mub-2','2'),aberta('mub-3','3')]);
 e.cliente.beforeWrite=db=>{
  const [a,b,c]=db.pcp_registros;
  a.atualizado_em='x1';a.registro={...a.registro,instalacao:{data:'2099-12-31'},rev:2};
  b.atualizado_em='x2';b.registro={...b.registro,finalizadaEm:'2026-09-29T14:00:00Z',finalizadoPor:'Gestor',rev:2};
  c.atualizado_em='x3';c.apagado=true;
 };
 const res=await e.baixar();
 assert.equal(res.baixadas,0,JSON.stringify(res));
 assert.equal(gravada(e,'mub-1').instalacao.data,'2099-12-31');assert.ok(!gravada(e,'mub-1').finalizadaEm);
 assert.equal(gravada(e,'mub-2').finalizadoPor,'Gestor','a finalização da gestão não é trocada pela do ERP');
 assert.equal(res.desistencias.length,3);
 const motivos=Object.fromEntries(res.desistencias.map(d=>[d.numero,d.motivo]));
 assert.match(motivos['1'],/agenda/i);assert.match(motivos['2'],/finalizada/i);assert.match(motivos['3'],/exclu/i);
});

/* ───────────── (1) a ficha lembra os blocos pela chave ───────────── */

test('ficha: um bloco novo inserido antes de "agenda" não troca quais blocos ficam abertos',()=>{
 const bloco=(k,open)=>({dataset:{bloco:k},open});
 let blocos=[bloco('pcp',false),bloco('itens',true),bloco('agenda',false),bloco('exec',true)];
 const doc={querySelector:()=>null,querySelectorAll:sel=>sel==='#modal-os .card-fs'?blocos:[],addEventListener(){}};
 const ctx=vm.createContext({console,document:doc,window:{},localStorage:{getItem:()=>null},STORE:{getAllOS:()=>[],getCFG:()=>({})},setTimeout(){},clearTimeout(){}});
 const root=path.join(__dirname,'..');
 vm.runInContext(fs.readFileSync(path.join(root,'operacao.js'),'utf8'),ctx);
 vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8'),ctx);
 // O novo render traz um bloco a mais ('alocacao') antes da agenda, todos fechados.
 ctx.__novo=()=>{blocos=[bloco('pcp',false),bloco('itens',false),bloco('alocacao',false),bloco('agenda',false),bloco('exec',false)];};
 vm.runInContext('renderModal=()=>__novo();reRenderModalKeepOpen();',ctx);
 const abertos=Object.fromEntries(blocos.map(b=>[b.dataset.bloco,b.open]));
 assert.deepEqual(abertos,{pcp:false,itens:true,alocacao:false,agenda:false,exec:true});
});

/* ═════════════ REVISÃO DA F01 (29/09/2026): os casos que os revisores provaram ═════════════ */
const fichasRev=[...fichas,
 {colecao:'colaboradores',id:'maria-teste',apagado:false,registro:{id:'maria-teste',nome:'Maria Teste',apelido:'maria',cpf:'222.333.444-55'}},
 {colecao:'colaboradores',id:'gestor-dois',apagado:false,registro:{id:'gestor-dois',nome:'Gestor Dois',apelido:'gestor2',cpf:'555.666.777-88'}}];
const maria={papel:'pcp',nome:'Maria Teste',sub:'maria'}, dois={papel:'pcp',nome:'Gestor Dois',sub:'gestor2'};
const T0='2026-09-29T10:00:00.000Z';

test('revisão: Desfazer de "Voltar ao PCP" devolve a liberação com o ID de quem liberou, nunca o de quem desfez',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[base()],registros:fichasRev});
 // Maria libera pela tela dela: o servidor carimba o par (Maria Teste, T0) com o ID dela.
 let r=await e.call({action:'upsert',os:{...copia(e),liberadoPCP:true,aptoPor:'Maria Teste',aptoEm:T0}},maria);
 assert.equal(r.status,200,JSON.stringify(r));assert.equal(gravada(e).aptoPorId,'222333');
 // Gestor Dois clica "Voltar ao PCP" e, em seguida, "Desfazer" (o toast devolve aptoPor e aptoEm antigos).
 r=await e.call({action:'upsert',os:{...copia(e),liberadoPCP:false,aptoPor:'',aptoEm:''}},dois);
 assert.equal(gravada(e).aptoPorId,'');
 r=await e.call({action:'upsert',os:{...copia(e),liberadoPCP:true,aptoPor:'Maria Teste',aptoEm:T0}},dois);
 assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(gravada(e).aptoPor,'Maria Teste');assert.equal(gravada(e).aptoPorId,'222333','o par volta com o ID dele');
 // O mesmo no "Cliente liberou" desfeito (paradoClientePor).
 r=await e.call({action:'upsert',os:{...copia(e),paradoClienteEm:T0,paradoClientePor:'Maria Teste'}},maria);
 assert.equal(gravada(e).paradoClientePorId,'222333');
 r=await e.call({action:'upsert',os:{...copia(e),paradoClienteEm:'',paradoClientePor:''}},dois);
 r=await e.call({action:'upsert',os:{...copia(e),paradoClienteEm:T0,paradoClientePor:'Maria Teste'}},dois);
 assert.equal(gravada(e).paradoClientePorId,'222333');
});

test('revisão: marca com o nome de outra pessoa, sem par conhecido, fica sem ID (nunca o de quem enviou)',async()=>{
 // Liberação gravada antes da memória de pares: o Desfazer não cola o ID do gestor nela.
 const e=await edge('pcp-sync',{pcp_registros:[base({liberadoPCP:true,aptoPor:'Maria Teste',aptoEm:T0,carroLiberado:true,carroLiberadoPor:'Maria Teste',carroLiberadoEm:T0,confirmacao:'Confirmado',confEm:T0,confPor:'Maria Teste'})],registros:fichasRev});
 const velha=copia(e);
 let r=await e.call({action:'upsert',os:{...copia(e),liberadoPCP:false,aptoPor:'',aptoEm:'',carroLiberado:false,carroLiberadoPor:'',carroLiberadoEm:''}},gestor);
 assert.equal(r.status,200,JSON.stringify(r));
 // "Sobrescrever" com a cópia velha (rev do servidor): revive as marcas da Maria.
 velha.rev=gravada(e).rev;
 r=await e.call({action:'upsert',os:velha},gestor);
 assert.equal(r.status,200,JSON.stringify(r));
 const g=gravada(e);
 assert.equal(g.aptoPor,'Maria Teste');assert.equal(g.aptoPorId||'','');assert.equal(g.carroLiberadoPorId||'','');
 // A memória de pares não vem do aparelho: forjar o par da Maria com outro ID não cola.
 r=await e.call({action:'upsert',os:{...copia(e),aptoPor:'Maria Teste',aptoEm:'2026-09-29T12:00:00.000Z',idsDosCarimbos:{aptoPor:[{nome:'maria teste',em:'2026-09-29T12:00:00.000Z',id:'999999'}]}}},gestor);
 assert.equal(gravada(e).aptoPorId||'','');
 assert.ok(!JSON.stringify(gravada(e).idsDosCarimbos||{}).includes('999999'));
 // A baixa do ERP confirmada pela gestão ("... por <nome do crachá>") é do crachá.
 r=await e.call({action:'upsert',os:{...copia(e),finalizadaEm:'2026-09-29T13:00:00.000Z',finalizadoPor:'Mubisys · baixa confirmada por Gestor Teste',baixaAutoERP:{em:'2026-09-29T13:00:00.000Z',status:'ENTREGUE'},justificativaConclusao:'Encerrada no ERP.'}},gestor);
 assert.equal(r.status,200,JSON.stringify(r));assert.equal(gravada(e).finalizadoPorId,'111222');
});

test('revisão: "Conferido por" digitado no espelho com outro nome não ganha o ID do celular',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[base({liberadoPCP:true,confirmacao:'Confirmado'})],registros:fichasRev});
 let r=await e.call({action:'upsert',os:{id:'1',rev:1,instalacaoOK:true,conferidoPor:'Maria Teste'}},toque);
 assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(gravada(e).conferidoPor,'Maria Teste');assert.equal(gravada(e).conferidoPorId||'','');
 // O próprio nome ganha o ID da régua do crachá.
 r=await e.call({action:'upsert',os:{id:'1',rev:gravada(e).rev,conferidoPor:'Ana'}},toque);
 assert.equal(gravada(e).conferidoPorId,'100001');
});

test('revisão: a lápide que volta a viver pelo número não grava o <campo>Id que o aparelho mandou',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[row('morta',{numero:'8001',tipo:'externo',rev:3},{apagado:true})],registros:fichas});
 // O índice de número recusa o insert (23505): simulado com uma linha do mesmo id que a consulta por número não acha.
 e.cliente.beforeWrite=db=>{db.pcp_registros.push({colecao:'os',id:'nova-1',apagado:true,atualizado_em:'2026-09-19T10:00:00Z',registro:{id:'nova-1',numero:'zzz'}});};
 const os={id:'nova-1',numero:'8001',tipo:'externo',cliente:'Cliente Fictício',liberadoPCP:true,aptoPor:'Gestor Teste',aptoEm:T0,aptoPorId:'999999',finalizadoPorId:'888888',idsDosCarimbos:{confPor:[{nome:'x',em:'',id:'777777'}]}};
 const r=await e.call({action:'upsert',os},gestor);
 assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.duplicataEvitada,true);
 const linha=e.db.pcp_registros.find(x=>x.id==='morta');
 assert.equal(linha.apagado,false);
 assert.equal(linha.registro.aptoPorId,'111222','o ID sai do crachá');
 assert.equal(linha.registro.finalizadoPorId||'','');
 assert.ok(!JSON.stringify(linha.registro).includes('777777'));assert.equal(linha.registro.rev,4);
});

test('revisão: crachá de toque não recebe ID do RH de ninguém (lista, incremental e resposta do upsert), e o ID gravado não se perde',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[base({finalizadaEm:'2026-09-20T12:00:00Z',baixaAutoERP:{em:'2026-09-20T12:00:00Z'}})],registros:fichas});
 let r=await e.call({action:'upsert',os:{...copia(e),liberadoPCP:true,aptoPor:'Gestor Teste',aptoEm:T0,entregaLancada:{data:'2026-09-19'}}},gestor);
 assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(gravada(e).aptoPorId,'111222');assert.equal(gravada(e).entregaLancada.porId,'111222');
 const vazou=o=>{
  const {CARIMBOS_COM_ID}=require_carimbos;
  return Object.keys(CARIMBOS_COM_ID).some(c=>(c+'Id') in o)||'idsDosCarimbos' in o||(o.entregaLancada&&('porId' in o.entregaLancada||'porConta' in o.entregaLancada));
 };
 const require_carimbos=await shared();
 const lista=await e.call({action:'list',escopo:'tudo'},toque);
 assert.equal(lista.status,200,JSON.stringify(lista));
 const o=lista.os.find(x=>x.id==='1');
 assert.ok(o&&!vazou(o),JSON.stringify(o));assert.equal(o.aptoPor,'Gestor Teste','o nome continua');assert.equal(o.entregaLancada.data,'2026-09-19');
 const delta=await e.call({action:'list',since:'2000-01-01'},toque);
 assert.ok(delta.os.every(x=>!vazou(x)),JSON.stringify(delta.os));
 // O toque grava a partir da cópia podada: o que estava gravado fica.
 r=await e.call({action:'upsert',os:{...o,obsTecnicas:'nota do instalador'}},toque);
 assert.equal(r.status,200,JSON.stringify(r));assert.ok(!vazou(r.os),JSON.stringify(r.os));
 assert.equal(gravada(e).aptoPorId,'111222');assert.equal(gravada(e).entregaLancada.porId,'111222');assert.equal(gravada(e).entregaLancada.porConta,'gestor');
});

/* TROCADO DE PROPÓSITO NA F16 (30/09/2026): o cancelamento passou a ser
   como o prazo combinado: o vazio da gestão não o apaga. Cancelar e desfazer
   são pedidos explícitos ({cancelar:true, motivo} e {desfazer:true}), e o
   desfeito fica guardado com quem desfez (tests/cancelamento-f16.test.cjs). */
test('revisão: gestão limpando com texto vazio (o jeito da casa) limpa os campos da gestão (o prazo e o cancelamento não: pedem pedido explícito); operação não',async()=>{
 const campos={retornoPrevisto:{dia:'2026-09-30',hora:'17:00'},cancelamento:{motivo:'cliente desistiu'},prazoCombinado:'2026-09-30'};
 const e=await edge('pcp-sync',{pcp_registros:[base(campos)]});
 let r=await e.call({action:'upsert',os:{...copia(e),retornoPrevisto:'',cancelamento:'',prazoCombinado:''}},operacao);
 assert.equal(r.status,200);assert.deepEqual(gravada(e).cancelamento,campos.cancelamento,'operação não limpa');
 r=await e.call({action:'upsert',os:{...copia(e),retornoPrevisto:'',cancelamento:'',prazoCombinado:''}},gestor);
 assert.equal(r.status,200,JSON.stringify(r));
 const g=gravada(e);assert.equal(g.retornoPrevisto,null);
 assert.deepEqual(g.cancelamento,campos.cancelamento,'o vazio não desfaz o cancelamento: desfazer é o pedido {desfazer:true} (F16)');
 assert.equal(g.prazoCombinado,'2026-09-30','o prazo combinado muda só pela correção com motivo (revisão da F15)');
});

test('revisão: montagem com senha, com a cópia do esqueleto (entregaLancada null), não apaga a entrega lançada pelo PCP',async()=>{
 const lancada={data:'2026-09-17',por:'Gestor Teste',porConta:'gestor',porId:'111222',em:'2026-09-21T10:00:00.000Z'};
 const e=await edge('pcp-sync',{pcp_registros:[base({finalizadaEm:'2026-09-20T12:00:00Z',baixaAutoERP:{em:'2026-09-20T12:00:00Z'},entregaLancada:lancada})],registros:fichas,equipe_contas:[{sistema:'pcp',usuario:'montagem1'}]});
 const montagem={papel:'montagem',nome:'Montagem Casa',sub:'montagem1'};
 let r=await e.call({action:'upsert',os:{...copia(e),entregaLancada:null,obsPCP:'x'}},montagem);
 assert.equal(r.status,200,JSON.stringify(r));assert.deepEqual(gravada(e).entregaLancada,lancada);
 r=await e.call({action:'upsert',os:{...copia(e),entregaLancada:{desfazer:true}}},montagem);
 assert.deepEqual(gravada(e).entregaLancada,lancada,'desfazer é só de admin e pcp');
});

test('revisão: a finalização da máquina não herda o ID de quem confirmou a baixa (restaurar + baixa automática)',async()=>{
 const agora='2026-09-25T12:00:00.000Z';
 const s1=await edge('pcp-sync',{pcp_registros:[row('mub-1',{numero:'1',origemMubisys:true,tipo:'externo',cliente:'ERP',equipe:[],instalacao:{data:'2026-09-01'},erpSaiuDaCarteiraEm:'2026-09-24T12:00:00Z'})],registros:fichas});
 let r=await s1.call({action:'upsert',os:{...copia(s1,'mub-1'),finalizadaEm:agora,finalizadoPor:'Mubisys · baixa confirmada por Gestor Teste',
   baixaAutoERP:{em:agora,status:'FORA DA CARTEIRA ABERTA',confirmadoPor:'Gestor Teste'},justificativaConclusao:'Encerrada no ERP (saiu da carteira aberta); baixa confirmada pela gestão.'}},gestor);
 assert.equal(r.status,200,JSON.stringify(r));assert.equal(gravada(s1,'mub-1').finalizadoPorId,'111222');
 // A carteira volta a listar a O.S.: a conciliação a restaura, e o ID sai junto do nome.
 const m=await edge('pcp-mubisys',{pcp_registros:structuredClone(s1.db.pcp_registros)});
 await m.run(`reconciliarCarteira(sb,[{numero:'1',statusCarteira:'PRODUCAO',cliente:'ERP'}])`);
 assert.equal(gravada(m,'mub-1').finalizadoPor,'');assert.equal(gravada(m,'mub-1').finalizadoPorId,'');
 // O ERP diz ENTREGUE: a baixa automática fecha de novo, sem ID de pessoa.
 m.run(`erpGet = async () => ({data:[{sequencial_ordem:'1',status:'ENTREGUE'}]})`);
 await m.run(`baixaAutomatica(sb,'https://erp.invalid','pk',{},{simular:false})`);
 assert.match(gravada(m,'mub-1').finalizadoPor,/baixa automática/);assert.equal(gravada(m,'mub-1').finalizadoPorId,'');
 // Mesmo que um escritor por fora deixe o ID ao lado, a gravação seguinte da gestão não o mantém:
 // o par (nome, hora) da máquina não é um par que o servidor carimbou com esse ID.
 const regs=structuredClone(m.db.pcp_registros);regs.find(x=>x.id==='mub-1').registro.finalizadoPorId='111222';
 const s2=await edge('pcp-sync',{pcp_registros:regs,registros:fichas});
 r=await s2.call({action:'upsert',os:{...copia(s2,'mub-1'),obsPCP:'recado'}},gestor);
 assert.equal(r.status,200,JSON.stringify(r));assert.equal(gravada(s2,'mub-1').finalizadoPorId,'');
 // A conciliação que arquiva (saiu da carteira, sem trabalho humano) também grava o ID vazio.
 const m2=await edge('pcp-mubisys',{pcp_registros:[row('mub-2',{numero:'2',origemMubisys:true,tipo:'externo',cliente:'ERP',equipe:[],finalizadoPorId:'111222'})]});
 await m2.run(`reconciliarCarteira(sb,[{numero:'3',statusCarteira:'PRODUCAO',cliente:'ERP'}])`);
 assert.match(gravada(m2,'mub-2').finalizadoPor,/saiu da carteira/);assert.equal(gravada(m2,'mub-2').finalizadoPorId,'');
});

const diaSP=(d=0)=>new Date(Date.now()-3*3600e3+d*864e5).toISOString().slice(0,10);
test('revisão: a baixa do ERP não fecha serviço de vários dias em andamento nem O.S. com a equipe na rua',async()=>{
 const e=await bancadaBaixa([
  aberta('mub-1','1',{liberadoPCP:true,confirmacao:'Confirmado',equipe:['Ana'],instalacao:{data:diaSP(-1),periodo:'Manhã',duracaoDias:3}}),
  aberta('mub-2','2',{liberadoPCP:true,confirmacao:'Confirmado',equipe:['Ana'],instalacao:{data:diaSP(-1),periodo:'Tarde',duracaoDias:1},horaSaida:'13:00',saidaEm:diaSP(-1)+'T16:00:00.000Z'}),
  // Terminou ontem e a equipe voltou: pode baixar.
  aberta('mub-3','3',{instalacao:{data:diaSP(-3),periodo:'Manhã',duracaoDias:3},horaSaida:'08:00',horaRetorno:'17:00'}),
  // Cliente retira (interno) é de um dia só: a duração não segura.
  aberta('mub-4','4',{tipo:'interno',instalacao:{data:diaSP(-1),duracaoDias:5}}),
 ]);
 const res=await e.baixar();
 assert.ok(!gravada(e,'mub-1').finalizadaEm,'serviço de 3 dias em andamento');
 assert.ok(!gravada(e,'mub-2').finalizadaEm,'equipe na rua');
 assert.ok(gravada(e,'mub-3').finalizadaEm);assert.ok(gravada(e,'mub-4').finalizadaEm);
 assert.equal(res.baixadas,2,JSON.stringify(res));assert.equal(res.poupadasComAgenda,2);
});

test('revisão: na releitura, a equipe que saiu enquanto a baixa esperava segura a O.S. (com a causa)',async()=>{
 const e=await bancadaBaixa([aberta('mub-1','1')]);
 e.cliente.beforeWrite=db=>{const r=db.pcp_registros[0];r.atualizado_em='2026-09-29T15:00:00Z';r.registro={...r.registro,horaSaida:'08:00',saidaEm:diaSP(0)+'T11:00:00.000Z',rev:2};};
 const res=await e.baixar();
 assert.equal(res.baixadas,0,JSON.stringify(res));assert.ok(!gravada(e,'mub-1').finalizadaEm);
 assert.match(res.desistencias[0].motivo,/na rua/);
});

test('revisão: motivoAgendaViva segue a conta do OPERACAO.prazo (último dia) e a marca de equipe na rua',async()=>{
 const {motivoAgendaViva,ultimoDiaAgenda}=await shared();
 assert.equal(ultimoDiaAgenda({instalacao:{data:'2026-09-28',duracaoDias:3}}),'2026-09-30');
 assert.equal(ultimoDiaAgenda({tipo:'interno',instalacao:{data:'2026-09-28',duracaoDias:3}}),'2026-09-28');
 assert.equal(ultimoDiaAgenda({instalacao:{data:'2026-12-31',duracaoDias:2}}),'2027-01-01');
 assert.equal(ultimoDiaAgenda({instalacao:{data:''}}),'');
 assert.match(motivoAgendaViva({instalacao:{data:'2026-09-28',duracaoDias:3}},'2026-09-30'),/agenda/);
 assert.equal(motivoAgendaViva({instalacao:{data:'2026-09-28',duracaoDias:3}},'2026-10-01'),'');
 assert.match(motivoAgendaViva({saidaEm:'2026-09-01T11:00:00Z'},'2026-10-01'),/na rua/);
 assert.equal(motivoAgendaViva({horaSaida:'08:00',horaRetorno:'17:00'},'2026-10-01'),'');
});

test('revisão: o histórico da ficha não mostra "Por conta" (o login de quem lançou a entrega)',()=>{
 const doc={querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};
 const ctx=vm.createContext({console,document:doc,window:{},localStorage:{getItem:()=>null},STORE:{getAllOS:()=>[],getCFG:()=>({})},setTimeout(){},clearTimeout(){}});
 const root=path.join(__dirname,'..');
 vm.runInContext(fs.readFileSync(path.join(root,'operacao.js'),'utf8'),ctx);
 vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8'),ctx);
 ctx.__v={data:'2026-09-17',por:'Gestor Teste',porConta:'gestor',porId:'111222',em:'2026-09-21T10:00:00.000Z'};
 const txt=vm.runInContext("audValor('entregaLancada',__v)",ctx);
 assert.match(txt,/Por: Gestor Teste/);assert.doesNotMatch(txt,/conta/i);assert.doesNotMatch(txt,/111222/);
});
