/* PRAZO COMBINADO E RETORNO PREVISTO (F15, 29/09/2026). Decisões do dono:
   o prazo é a PRIMEIRA data agendada no PCP, congelada (o ERP não define
   prazo; remarcação pedida pelo cliente vira abono na F17); o retorno previsto
   é a hora DIGITADA pela gestão, por dia, sem padrão por período. Os dois
   ficam fora de instalacao, só admin e pcp gravam, o autor é carimbado pelo
   servidor e tudo vai para o diário. A O.S. antiga tem o prazo lido do
   histórico de remarcações, sem gravação em lote. O conflito de agenda passa
   a usar a saída prevista até o retorno previsto quando as duas O.S. têm os
   dois. Cada teste começa pelo caso ruim. Dados fictícios (repositório público). */
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const O=require('../operacao.js');
const {edge}=require('./helpers/edge.cjs');
const shared=()=>import('../supabase/functions/_shared/pcp-integridade.mjs');
const row=(id,registro,extra={})=>({id,colecao:'os',apagado:false,atualizado_em:'2026-09-19T10:00:00Z',...extra,registro:{id,rev:1,...registro}});
const agendada={liberadoPCP:true,confirmacao:'Confirmado',confEm:'2026-09-30T08:00:00.000Z',carroLiberado:true,carroLiberadoEm:'2026-09-30T08:05:00.000Z',carroLiberadoPor:'Gestor Teste'};
const base=(extra={})=>row('1',{numero:'5001',tipo:'externo',cliente:'Cliente Fictício',equipe:['Ana'],veiculo:'Fiorino',instalacao:{data:'2026-09-30',periodo:'Manhã',hora:'',duracaoDias:1},...extra});
const gestor={papel:'pcp',nome:'Gestor Teste',sub:'gestor'};
const admin={papel:'admin',nome:'Admin Teste',sub:'admin1'};
const operacao={papel:'operacao',nome:'Operação Teste',sub:'operacao1'};
const montagem={papel:'montagem',nome:'Montagem Casa',sub:'montagem1'};
const toque={nome:'Ana',sub:'Ana',id:'100001',papel:'montagem',montagemIndividual:true};
const fichas=[{colecao:'colaboradores',id:'gestor-teste',apagado:false,registro:{id:'gestor-teste',nome:'Gestor Teste',apelido:'gestor',cpf:'111.222.333-44'}}];
const gravada=(e,id='1')=>e.db.pcp_registros.find(r=>r.colecao==='os'&&r.id===id).registro;
const copia=(e,id='1')=>structuredClone(gravada(e,id));
const diario=e=>e.db.pcp_registros.filter(r=>r.colecao==='auditoria').map(r=>r.registro);
const velho='2026-09-01T10:00:00.000Z';
const prazoVelho={data:'2026-09-30',fonte:'agenda',por:'Gestor Teste',porConta:'gestor',porId:'111222',em:velho};

/* ───────────── Leitura: a primeira data agendada no PCP ───────────── */
const CASOS=[
 ['O.S. do ERP intocada: a previsão do ERP em instalacao.data não é prazo',{origemMubisys:true,previsaoEntrega:'2026-10-05',instalacao:{data:'2026-10-05'},equipe:[]},null],
 ['O.S. do ERP com equipe escalada na data que veio: essa data foi agendada',{origemMubisys:true,previsaoEntrega:'2026-10-05',instalacao:{data:'2026-10-05'},equipe:['Ana']},'2026-10-05'],
 ['O.S. lida do PDF do ERP, intocada: a entrega do PDF não é prazo',{origemPDF:true,previsaoEntrega:'2026-10-05',instalacao:{data:'2026-10-05'},equipe:[]},null],
 ['O.S. do ERP com a data trocada pelo PCP (sem histórico)',{origemMubisys:true,previsaoEntrega:'2026-10-05',instalacao:{data:'2026-10-02'},equipe:[]},'2026-10-02'],
 ['O.S. do ERP remarcada: o `de` que é a previsão do ERP não conta',{origemMubisys:true,previsaoEntrega:'2026-10-05',instalacao:{data:'2026-10-09'},agendaLog:[{de:'2026-10-05',data:'2026-10-02',em:'x'},{de:'2026-10-02',data:'2026-10-09',em:'y'}]},'2026-10-02'],
 ['O.S. do PCP remarcada: vale o que valia antes da primeira remarcação',{instalacao:{data:'2026-10-09'},agendaLog:[{de:'2026-10-01',data:'2026-10-09',em:'x'}]},'2026-10-01'],
 ['histórico que começa sem data: a primeira data remarcada',{instalacao:{data:'2026-10-09'},agendaLog:[{de:'',data:'',em:'a'},{de:'',data:'2026-10-03',em:'b'}]},'2026-10-03'],
 ['sem histórico: a data atual da O.S. feita no PCP',{instalacao:{data:'2026-10-01'}},'2026-10-01'],
 ['ano pela metade ("0002-10-01") nunca é prazo',{instalacao:{data:'0002-10-01'}},null],
 ['dia que não existe nunca é prazo',{instalacao:{data:'2026-02-30'}},null],
 ['sem data nenhuma',{instalacao:{data:''}},null],
 ['o gravado vence o histórico e a agenda',{prazoCombinado:{data:'2026-09-28',fonte:'agenda'},instalacao:{data:'2026-10-09'},agendaLog:[{de:'2026-10-01',data:'2026-10-09'}]},'2026-09-28'],
 ['gravado inválido cai para a derivação',{prazoCombinado:{data:'lixo'},instalacao:{data:'2026-10-09'}},'2026-10-09'],
];
test('prazo combinado lido: casos ruins primeiro, e as duas cópias (tela e servidor) dizem o mesmo',async()=>{
 const S=await shared();
 for(const [nome,o,esperado] of CASOS){
  assert.equal(O.prazoCombinadoDe(o)?.data ?? null,esperado,nome);
  assert.deepEqual(O.prazoCombinadoDe(o),S.prazoCombinadoDe(o),'paridade: '+nome);
 }
 assert.equal(O.prazoCombinadoDe(CASOS[5][1]).derivado,true);
 assert.equal(O.prazoCombinadoDe(CASOS[11][1]).derivado,false);
});
test('retornos previstos lidos: formato de um dia, lixo fora, saída depois do retorno some; paridade',async()=>{
 const S=await shared();
 const casos=[
  {retornoPrevisto:{dia:'2026-09-30',hora:'17:00'}},
  {retornoPrevisto:[{dia:'2026-10-01',hora:'18:00',saida:'19:00'},{dia:'2026-09-30',hora:'17:00',saida:'08:00'},{dia:'x',hora:'10:00'},{dia:'2026-10-02',hora:'25:00'},null,'lixo']},
  {retornoPrevisto:'17:00'},{},
 ];
 for(const o of casos)assert.deepEqual(O.retornosPrevistos(o),S.retornosPrevistos(o));
 assert.deepEqual(O.retornosPrevistos(casos[0]),[{dia:'2026-09-30',hora:'17:00',saida:''}]);
 assert.deepEqual(O.retornosPrevistos(casos[1]).map(e=>[e.dia,e.hora,e.saida]),[['2026-09-30','17:00','08:00'],['2026-10-01','18:00','']]);
 assert.deepEqual(O.retornosPrevistos(casos[2]),[]);
});

/* ───────────── Retorno previsto no servidor ───────────── */
test('retorno previsto: toque, montagem com senha, operação e máquina não gravam; a gestão grava carimbada',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[base(agendada)],registros:fichas,equipe_contas:[{sistema:'pcp',usuario:'montagem1'}]});
 const rp=[{dia:'2026-09-30',hora:'17:00',saida:'08:00',por:'Forjado',porId:'999999',em:'2020-01-01T00:00:00Z'}];
 let r=await e.call({action:'upsert',os:{id:'1',rev:1,retornoPrevisto:rp,horaSaida:'08:10',saidaEm:'2026-09-30T11:10:00.000Z'}},toque);
 assert.equal(r.status,200,JSON.stringify(r));assert.ok(!('retornoPrevisto' in gravada(e)),'toque não grava');
 assert.equal(gravada(e).horaSaida,'08:10','o resto do toque grava');
 r=await e.call({action:'upsert',os:{...copia(e),retornoPrevisto:rp}},montagem);
 assert.equal(r.status,200,JSON.stringify(r));assert.ok(!('retornoPrevisto' in gravada(e)),'montagem com senha não grava');
 assert.match(String(r.avisos),/só a gestão/,'quem tem senha ouve o porquê');
 r=await e.call({action:'upsert',os:{...copia(e),retornoPrevisto:rp}},operacao);
 assert.equal(r.status,200);assert.ok(!('retornoPrevisto' in gravada(e)),'operação não grava');
 r=await e.call({action:'upsert',os:{...copia(e),retornoPrevisto:rp}},'machine');
 assert.equal(r.status,200);assert.ok(!('retornoPrevisto' in gravada(e)),'máquina não grava');
 r=await e.call({action:'upsert',os:{...copia(e),retornoPrevisto:rp}},gestor);
 assert.equal(r.status,200,JSON.stringify(r));
 const [g]=gravada(e).retornoPrevisto;
 assert.equal(g.hora,'17:00');assert.equal(g.saida,'08:00');
 assert.equal(g.por,'Gestor Teste','autor do crachá, não o que o aparelho escreveu');assert.equal(g.porConta,'gestor');assert.equal(g.porId,'111222');
 assert.notEqual(g.em,'2020-01-01T00:00:00Z');
 assert.ok(diario(e).some(a=>a.campos.includes('retornoPrevisto')&&a.autor.login==='gestor'),'vai para o diário');
});
test('mudar o retorno previsto NÃO zera a confirmação do cliente nem o carro liberado',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[base(agendada)],registros:fichas});
 const r=await e.call({action:'upsert',os:{...copia(e),retornoPrevisto:[{dia:'2026-09-30',hora:'16:30'}]}},gestor);
 assert.equal(r.status,200,JSON.stringify(r));
 const g=gravada(e);assert.equal(g.confirmacao,'Confirmado');assert.equal(g.carroLiberado,true);assert.equal(g.confEm,agendada.confEm);
 assert.equal(g.retornoPrevisto[0].hora,'16:30');
});
test('retorno previsto: reenviar igual mantém quem digitou; trocar a hora recarimba; ausente preserva; null da gestão limpa',async()=>{
 const antigo=[{dia:'2026-09-30',hora:'17:00',saida:'',por:'Outra Pessoa',porConta:'outra',porId:'100009',em:velho}];
 const e=await edge('pcp-sync',{pcp_registros:[base({retornoPrevisto:antigo})],registros:fichas});
 let r=await e.call({action:'upsert',os:{...copia(e),obsPCP:'x'}},admin);
 assert.equal(r.status,200);assert.deepEqual(gravada(e).retornoPrevisto,antigo,'igual: o carimbo é de quem digitou');
 const os=copia(e);delete os.retornoPrevisto;
 r=await e.call({action:'upsert',os},gestor);assert.deepEqual(gravada(e).retornoPrevisto,antigo,'ausente preserva');
 r=await e.call({action:'upsert',os:{...copia(e),retornoPrevisto:[{dia:'2026-09-30',hora:'17:30'}]}},gestor);
 assert.equal(gravada(e).retornoPrevisto[0].por,'Gestor Teste');assert.notEqual(gravada(e).retornoPrevisto[0].em,velho);
 r=await e.call({action:'upsert',os:{...copia(e),retornoPrevisto:null}},gestor);assert.equal(gravada(e).retornoPrevisto,null);
});
test('retorno previsto: saída depois do retorno, hora inválida e lixo viram aviso e não apagam o gravado; nunca 422',async()=>{
 const antigo=[{dia:'2026-09-30',hora:'17:00',saida:'',por:'Gestor Teste',porConta:'gestor',porId:'111222',em:velho}];
 const e=await edge('pcp-sync',{pcp_registros:[base({retornoPrevisto:antigo,instalacao:{data:'2026-09-30',periodo:'Manhã',hora:'',duracaoDias:2}})],registros:fichas});
 let r=await e.call({action:'upsert',os:{...copia(e),retornoPrevisto:[{dia:'2026-09-30',hora:'12:00',saida:'13:00'},{dia:'2026-10-01',hora:'18:00'}]}},gestor);
 assert.equal(r.status,200,JSON.stringify(r));assert.match(String(r.avisos),/saída prevista \(13:00\) precisa ser antes do retorno/);
 assert.deepEqual(gravada(e).retornoPrevisto.map(x=>[x.dia,x.hora]),[['2026-09-30','17:00'],['2026-10-01','18:00']],'o dia errado fica como estava; o outro dia entra');
 r=await e.call({action:'upsert',os:{...copia(e),retornoPrevisto:[{dia:'2026-09-30',hora:'99:00'},{dia:'2026-10-01',hora:'18:00'}]}},gestor);
 assert.equal(r.status,200);assert.match(String(r.avisos),/hora inválida/);assert.equal(gravada(e).retornoPrevisto[0].hora,'17:00');
 const antes=copia(e).retornoPrevisto;
 r=await e.call({action:'upsert',os:{...copia(e),retornoPrevisto:[{dia:'lixo',hora:'10:00'}]}},gestor);
 assert.equal(r.status,200);assert.deepEqual(gravada(e).retornoPrevisto,antes,'envio só de lixo não apaga');
 r=await e.call({action:'upsert',os:{...copia(e),retornoPrevisto:'17:00'}},gestor);
 assert.equal(r.status,200);assert.deepEqual(gravada(e).retornoPrevisto,antes,'formato inválido não apaga');
});
test('retorno e prazo descem ao crachá de toque sem o ID e sem o login de quem digitou',async()=>{
 const rp=[{dia:'2026-09-30',hora:'17:00',saida:'',por:'Gestor Teste',porConta:'gestor',porId:'111222',em:velho}];
 const e=await edge('pcp-sync',{pcp_registros:[base({...agendada,retornoPrevisto:rp,prazoCombinado:prazoVelho})]});
 const r=await e.call({action:'upsert',os:{id:'1',rev:1,horaSaida:'08:10',saidaEm:'2026-09-30T11:10:00.000Z'}},toque);
 assert.equal(r.status,200,JSON.stringify(r));
 const txt=JSON.stringify(r.os);assert.ok(!txt.includes('111222')&&!txt.includes('"porConta"'),txt);
 assert.equal(r.os.retornoPrevisto[0].hora,'17:00');assert.equal(r.os.prazoCombinado.data,'2026-09-30');
 assert.equal(gravada(e).retornoPrevisto[0].porId,'111222','no banco o ID fica');
});

/* ───────────── Prazo combinado no servidor ───────────── */
test('prazo nasce uma vez, carimbado, quando a O.S. ganha a primeira data; o valor do aparelho não entra',async()=>{
 const e=await edge('pcp-sync',{registros:fichas});
 const nova={id:'n1',numero:'7001',tipo:'externo',cliente:'Cliente Fictício',equipe:[],instalacao:{data:'',periodo:'',hora:'',duracaoDias:1},prazoCombinado:{data:'2099-01-01',fonte:'agenda',por:'Forjado'}};
 let r=await e.call({action:'upsert',os:nova},gestor);
 assert.equal(r.status,200,JSON.stringify(r));assert.ok(!('prazoCombinado' in gravada(e,'n1')),'sem data, sem prazo; o forjado não entra');
 const os=copia(e,'n1');os.instalacao.data='2026-10-06';os.agendaLog=[{de:'',data:'2026-10-06',em:'2026-09-29T10:00:00.000Z',por:'Gestor Teste'}];
 r=await e.call({action:'upsert',os},gestor);
 const pc=gravada(e,'n1').prazoCombinado;
 assert.equal(pc.data,'2026-10-06');assert.equal(pc.fonte,'agenda');assert.equal(pc.por,'Gestor Teste');assert.equal(pc.porId,'111222');
 assert.ok(diario(e).some(a=>a.osId==='n1'&&a.campos.includes('prazoCombinado')));
});
test('remarcar a agenda NÃO move o prazo (nem da gestão, nem com o prazo mandado junto)',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[base({prazoCombinado:prazoVelho})],registros:fichas});
 const os=copia(e);os.instalacao.data='2026-10-03';os.agendaLog=[{de:'2026-09-30',data:'2026-10-03',em:'2026-09-29T10:00:00.000Z'}];
 os.prazoCombinado={...prazoVelho,data:'2026-10-03'};
 const r=await e.call({action:'upsert',os},gestor);
 assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(gravada(e).instalacao.data,'2026-10-03');assert.deepEqual(gravada(e).prazoCombinado,prazoVelho);
});
test('prazo congelado desde o nascimento: a mesma conta remarcando 4 minutos depois (o cliente pediu) não move o prazo',async()=>{
 // Caso ruim da revisão: a conta pcp é uma só no PC da fábrica. Agendar, ligar
 // para o cliente e remarcar a pedido dele é o abono, não erro de digitação.
 const e=await edge('pcp-sync',{registros:fichas});
 let r=await e.call({action:'upsert',os:{id:'n2',numero:'7002',tipo:'externo',equipe:[],instalacao:{data:'2026-09-30',periodo:'Manhã',hora:'',duracaoDias:1}}},gestor);
 assert.equal(gravada(e,'n2').prazoCombinado.data,'2026-09-30');
 let os=copia(e,'n2');os.instalacao.data='2026-10-02';
 r=await e.call({action:'upsert',os},gestor);
 assert.equal(r.status,200);assert.equal(gravada(e,'n2').prazoCombinado.data,'2026-09-30','a mesma conta, logo depois: o prazo fica');
 assert.equal(gravada(e,'n2').instalacao.data,'2026-10-02');
 os=copia(e,'n2');os.instalacao.data='2026-10-03';
 r=await e.call({action:'upsert',os},admin);
 assert.equal(gravada(e,'n2').prazoCombinado.data,'2026-09-30','outra conta: também fica');
 // Erro de digitação se conserta pela correção com motivo.
 r=await e.call({action:'upsert',os:{...copia(e,'n2'),prazoCombinado:{corrigir:true,data:'2026-10-01',motivo:'Data digitada errada no agendamento'}}},gestor);
 assert.equal(gravada(e,'n2').prazoCombinado.data,'2026-10-01');assert.equal(gravada(e,'n2').prazoCombinado.fonte,'correcao');
});
test('O.S. do ERP em andamento (equipe na data do ERP, sem histórico) remarcada: o prazo lido é gravado de passagem e não anda',async()=>{
 const erp=row('mub-9',{numero:'9',origemMubisys:true,tipo:'externo',cliente:'ERP Fictício',previsaoEntrega:'2026-10-05',equipe:['Ana'],instalacao:{data:'2026-10-05',periodo:'Manhã',hora:'',duracaoDias:1}});
 let e=await edge('pcp-sync',{pcp_registros:[erp],registros:fichas});
 assert.equal(O.prazoCombinadoDe(gravada(e,'mub-9')).data,'2026-10-05');
 // Uma gravação que não mexe no prazo lido não grava nada (sem gravação em lote).
 let r=await e.call({action:'upsert',os:{...copia(e,'mub-9'),obsPCP:'olhei'}},gestor);
 assert.equal(r.status,200);assert.ok(!('prazoCombinado' in gravada(e,'mub-9')));
 const os=copia(e,'mub-9');os.agendaLog=[{de:'2026-10-05',data:'2026-10-09',em:'2026-09-29T10:00:00.000Z',por:'Gestor Teste'}];os.instalacao.data='2026-10-09';
 r=await e.call({action:'upsert',os},gestor);
 assert.equal(r.status,200,JSON.stringify(r));
 const pc=gravada(e,'mub-9').prazoCombinado;
 assert.equal(pc.data,'2026-10-05','remarcar não move o prazo');assert.equal(pc.fonte,'agenda');assert.equal(pc.lidoDe,'agenda');assert.equal(pc.porId,'111222');
 assert.equal(O.prazoCombinadoDe(gravada(e,'mub-9')).data,'2026-10-05');
 assert.ok(diario(e).some(a=>a.osId==='mub-9'&&a.campos.includes('prazoCombinado')),'a gravação de passagem fica no diário');
 // Limpar a data e reagendar: o prazo lido também fica.
 e=await edge('pcp-sync',{pcp_registros:[erp],registros:fichas});
 const lim=copia(e,'mub-9');lim.instalacao.data='';
 r=await e.call({action:'upsert',os:lim},gestor);
 assert.equal(gravada(e,'mub-9').prazoCombinado.data,'2026-10-05','limpar a data grava o prazo lido antes');
 const re=copia(e,'mub-9');re.instalacao.data='2026-10-12';
 r=await e.call({action:'upsert',os:re},gestor);
 assert.equal(O.prazoCombinadoDe(gravada(e,'mub-9')).data,'2026-10-05','e reagendar não renasce o prazo');
});
test('histórico de remarcações só cresce: montagem com senha e operação reescrevendo o agendaLog não mudam o prazo lido',async()=>{
 const hist=[{de:'2026-09-30',data:'2026-10-02',em:'2026-09-20T10:00:00.000Z',por:'Gestor Teste'}];
 for(const quem of [montagem,operacao,gestor]){
  const b=row('1',{numero:'5001',tipo:'externo',cliente:'Cliente Fictício',equipe:['Ana'],instalacao:{data:'2026-10-02',periodo:'Manhã',hora:'',duracaoDias:1},agendaLog:hist});
  const e=await edge('pcp-sync',{pcp_registros:[b],registros:fichas,equipe_contas:[{sistema:'pcp',usuario:'montagem1'}]});
  assert.equal(O.prazoCombinadoDe(gravada(e)).data,'2026-09-30');
  const os=copia(e);os.agendaLog=[{de:'2026-12-31',data:'2026-10-02',em:'2026-09-20T10:00:00.000Z'}];
  let r=await e.call({action:'upsert',os},quem);
  assert.equal(r.status,200,JSON.stringify(r));
  assert.deepEqual(gravada(e).agendaLog,hist,quem.papel+': o trecho gravado não muda');
  assert.equal(O.prazoCombinadoDe(gravada(e)).data,'2026-09-30',quem.papel+': o prazo lido não muda');
  // Apagar o histórico também não.
  r=await e.call({action:'upsert',os:{...copia(e),agendaLog:[]}},quem);
  assert.deepEqual(gravada(e).agendaLog,hist,quem.papel+': [] não apaga');
 }
 // Remarcação de verdade: entra no fim, começando na data gravada, com o crachá como autor e no diário.
 const b=row('1',{numero:'5001',tipo:'externo',cliente:'Cliente Fictício',equipe:['Ana'],instalacao:{data:'2026-10-02',periodo:'Manhã',hora:'',duracaoDias:1},agendaLog:hist});
 const e=await edge('pcp-sync',{pcp_registros:[b],registros:fichas});
 const os=copia(e);os.instalacao.data='2026-10-06';os.agendaLog=[{de:'2026-12-31',data:'2026-10-06',em:'2026-09-29T10:00:00.000Z',por:'Forjado'}];
 await e.call({action:'upsert',os},operacao);
 const log=gravada(e).agendaLog;
 assert.equal(log.length,2);assert.deepEqual(log[0],hist[0]);
 assert.equal(log[1].de,'2026-10-02','o `de` é a data gravada, não a que o aparelho mandou');assert.equal(log[1].data,'2026-10-06');assert.equal(log[1].por,'Operação Teste');
 assert.ok(diario(e).some(a=>a.campos.includes('agendaLog')&&a.autor.login==='operacao1'),'o histórico fica no diário');
 assert.equal(O.prazoCombinadoDe(gravada(e)).data,'2026-09-30');
 // Remarcações feitas sem rede entram quando formam cadeia da data gravada até a nova, com o `em` do aparelho.
 const os2=copia(e);os2.instalacao.data='2026-10-09';
 os2.agendaLog=[...log,{de:'2026-10-06',data:'2026-10-07',em:'2026-09-29T11:00:00.000Z'},{de:'2026-10-07',data:'2026-10-09',em:'2026-09-29T11:30:00.000Z'}];
 await e.call({action:'upsert',os:os2},gestor);
 assert.deepEqual(gravada(e).agendaLog.slice(2).map(x=>[x.de,x.data,x.em]),[['2026-10-06','2026-10-07','2026-09-29T11:00:00.000Z'],['2026-10-07','2026-10-09','2026-09-29T11:30:00.000Z']]);
});
test('o prazo nasce da data que a O.S. ganhou, nunca do histórico que o aparelho mandou',async()=>{
 const erp=row('mub-7',{numero:'7',origemMubisys:true,tipo:'externo',cliente:'ERP Fictício',previsaoEntrega:'2026-10-05',equipe:[],instalacao:{data:'2026-10-05',periodo:'Manhã',hora:'',duracaoDias:1}});
 const e=await edge('pcp-sync',{pcp_registros:[erp],registros:fichas,equipe_contas:[{sistema:'pcp',usuario:'montagem1'}]});
 const os=copia(e,'mub-7');os.equipe=['Ana'];os.agendaLog=[{de:'2026-12-31',data:'2026-10-05',em:'2026-09-29T10:00:00.000Z'}];
 const r=await e.call({action:'upsert',os},montagem);
 assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(gravada(e,'mub-7').prazoCombinado.data,'2026-10-05','a data da agenda, não o `de` forjado');
 assert.ok(!('agendaLog' in gravada(e,'mub-7'))||!gravada(e,'mub-7').agendaLog.length,'sem remarcação, o histórico forjado não entra');
 // Tirar a origem do ERP no envio não faz a previsão virar agenda.
 const e2=await edge('pcp-sync',{pcp_registros:[erp],registros:fichas});
 await e2.call({action:'upsert',os:{...copia(e2,'mub-7'),origemMubisys:false,previsaoEntrega:'2026-01-01'}},operacao);
 assert.ok(!('prazoCombinado' in gravada(e2,'mub-7')),'a origem e a previsão da versão gravada valem');
});
test('O.S. já entregue que ganha equipe depois: não nasce prazo; fica a marca "sem prazo" e a leitura não deriva a previsão do ERP',async()=>{
 const erp=row('mub-8',{numero:'8',origemMubisys:true,tipo:'externo',cliente:'ERP Fictício',previsaoEntrega:'2026-09-12',equipe:[],
  instalacao:{data:'2026-09-12',periodo:'',hora:'',duracaoDias:1},
  finalizadaEm:'2026-09-15T12:00:00.000Z',finalizadoPor:'Mubisys (baixa automática · ENTREGUE)',baixaAutoERP:{em:'2026-09-15T12:00:00.000Z',status:'ENTREGUE'}});
 const e=await edge('pcp-sync',{pcp_registros:[erp],registros:fichas});
 const r=await e.call({action:'upsert',os:{...copia(e,'mub-8'),equipe:['Ana']}},gestor);
 assert.equal(r.status,200,JSON.stringify(r));
 const pc=gravada(e,'mub-8').prazoCombinado;
 assert.equal(pc.fonte,O.PRAZO_SEM_AGENDA);assert.equal(pc.data,'');
 assert.equal(O.prazoCombinadoDe(gravada(e,'mub-8')),null,'sem prazo combinado');
 const S=await shared();assert.equal(S.prazoCombinadoDe(gravada(e,'mub-8')),null,'paridade');
 // A O.S. nova que chega já finalizada, ou com a entrega lançada, também não ganha prazo.
 for(const extra of [{finalizadaEm:'2026-09-10T18:00:00.000Z'},{entregaLancada:{data:'2026-09-10'}}]){
  const n={id:'n9',tipo:'externo',equipe:['Ana'],instalacao:{data:'2026-09-10'},...extra};
  assert.equal(S.prazoCombinadoDe(S.carimbarPrazoCombinado(undefined,n,undefined,{nome:'Gestor Teste',login:'gestor'},'2026-09-29T12:00:00Z').os),null,JSON.stringify(extra));
 }
 // A gestão ainda pode corrigir, com motivo.
 await e.call({action:'upsert',os:{...copia(e,'mub-8'),prazoCombinado:{corrigir:true,data:'2026-09-12',motivo:'Prazo combinado por telefone antes da entrega'}}},gestor);
 assert.equal(O.prazoCombinadoDe(gravada(e,'mub-8')).data,'2026-09-12');
 // A tela diz "sem prazo".
 const t=tela([{...erp.registro,equipe:['Ana'],prazoCombinado:pc}]);
 assert.match(t.run(`blocoAgenda(STORE.getOS('mub-8'),false,false)`),/<strong>sem prazo<\/strong>/);
});
test('null e vazio da gestão não apagam o prazo (nem o corrigido): mudar o prazo exige motivo',async()=>{
 const corr={data:'2026-10-10',fonte:'correcao',motivo:'Cliente pediu outra data no contrato',original:'2026-09-30',por:'Gestor Teste',porConta:'gestor',porId:'111222',em:velho};
 for(const pc of [prazoVelho,corr]){
  const e=await edge('pcp-sync',{pcp_registros:[base({prazoCombinado:pc,agendaLog:[{de:'2026-09-30',data:'2026-10-10',em:'2026-09-20T10:00:00.000Z'}]})],registros:fichas});
  for(const vazio of [null,'',{}]){
   const r=await e.call({action:'upsert',os:{...copia(e),prazoCombinado:vazio}},gestor);
   assert.equal(r.status,200,JSON.stringify(r));assert.deepEqual(gravada(e).prazoCombinado,pc,JSON.stringify(vazio)+' não apaga');
  }
  await e.call({action:'upsert',os:{...copia(e),prazoCombinado:null}},admin);
  assert.deepEqual(gravada(e).prazoCombinado,pc,'nem do admin');
 }
});
test('ID e login de quem digitou o prazo e o retorno só descem para admin e pcp (montagem com senha, operação e comercial não)',async()=>{
 const rp=[{dia:'2026-09-30',hora:'17:00',saida:'',por:'Gestor Teste',porConta:'gestor',porId:'111222',em:velho}];
 const b=base({retornoPrevisto:rp,prazoCombinado:prazoVelho});
 const e=await edge('pcp-sync',{pcp_registros:[b],registros:fichas,equipe_contas:[{sistema:'pcp',usuario:'montagem1'}]});
 const comercial={papel:'comercial',nome:'Comercial Teste',sub:'comercial1'};
 const up=await e.call({action:'upsert',os:{...copia(e),obsTecnicas:'x'}},montagem);
 assert.equal(up.status,200,JSON.stringify(up));
 for(const [quem,txt] of [['montagem (upsert)',JSON.stringify(up.os)],['operação (list)',JSON.stringify((await e.call({action:'list',escopo:'tudo'},operacao)).os)],['comercial (list)',JSON.stringify((await e.call({action:'list',escopo:'tudo'},comercial)).os)]]){
  assert.ok(!txt.includes('111222'),quem+' recebeu o ID');assert.ok(!/"porConta":"gestor"/.test(txt),quem+' recebeu o login');
  assert.ok(txt.includes('"por":"Gestor Teste"'),quem+': o nome desce');
 }
 const g=JSON.stringify((await e.call({action:'list',escopo:'tudo'},gestor)).os);
 assert.ok(g.includes('111222'),'a gestão vê');
 // A volta da cópia podada não apaga o carimbo gravado.
 const r=await e.call({action:'upsert',os:{...up.os,obsTecnicas:'y'}},montagem);
 assert.equal(r.status,200);assert.equal(gravada(e).prazoCombinado.porId,'111222');assert.equal(gravada(e).retornoPrevisto[0].porId,'111222');
});
test('retorno previsto: hora nova num dia fora da agenda não entra (aviso), o gravado fica',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[base()],registros:fichas});
 const os=copia(e);os.instalacao.data='2026-10-01';
 os.retornoPrevisto=[{dia:'2026-09-30',hora:'17:00'},{dia:'2026-10-01',hora:'12:00'}];
 const r=await e.call({action:'upsert',os},gestor);
 assert.equal(r.status,200,JSON.stringify(r));assert.match(String(r.avisos),/30\/09 não foi gravado: o dia não está na agenda/);
 assert.deepEqual(gravada(e).retornoPrevisto.map(x=>[x.dia,x.hora]),[['2026-10-01','12:00']]);
});
test('O.S. antiga (já com data, sem prazo gravado) não é gravada: o prazo é lido do histórico',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[base()],registros:fichas});
 const os=copia(e);os.instalacao.data='2026-10-02';os.agendaLog=[{de:'2026-09-30',data:'2026-10-02',em:'2026-09-29T10:00:00.000Z'}];
 const r=await e.call({action:'upsert',os},gestor);
 assert.equal(r.status,200);assert.ok(!('prazoCombinado' in gravada(e)),'sem gravação em lote nem de passagem');
 assert.equal(O.prazoCombinadoDe(gravada(e)).data,'2026-09-30');
});
test('O.S. do ERP: a previsão não vira prazo; o prazo nasce quando o PCP escala a equipe ou troca a data',async()=>{
 const erp=row('mub-9',{numero:'9',origemMubisys:true,tipo:'externo',cliente:'ERP',previsaoEntrega:'2026-10-05',equipe:[],instalacao:{data:'2026-10-05',periodo:'Manhã',hora:'',duracaoDias:1}});
 let e=await edge('pcp-sync',{pcp_registros:[erp],registros:fichas});
 let r=await e.call({action:'upsert',os:{...copia(e,'mub-9'),obsPCP:'olhei'}},gestor);
 assert.equal(r.status,200,JSON.stringify(r));assert.ok(!('prazoCombinado' in gravada(e,'mub-9')));
 r=await e.call({action:'upsert',os:{...copia(e,'mub-9'),equipe:['Ana']}},gestor);
 assert.equal(gravada(e,'mub-9').prazoCombinado.data,'2026-10-05','equipe escalada na data que veio');
 e=await edge('pcp-sync',{pcp_registros:[erp],registros:fichas});
 const os=copia(e,'mub-9');os.instalacao.data='2026-10-02';os.agendaLog=[{de:'2026-10-05',data:'2026-10-02',em:'2026-09-29T10:00:00.000Z'}];
 r=await e.call({action:'upsert',os},gestor);
 assert.equal(gravada(e,'mub-9').prazoCombinado.data,'2026-10-02','a data que o PCP pôs, não a do ERP');
});
test('reimportação do ERP com previsão nova não muda o prazo combinado nem o retorno previsto',async()=>{
 const {atualizarOrigemERP}=await shared();
 const rp=[{dia:'2026-09-30',hora:'17:00'}];
 const atual={id:'mub-1',numero:'1',origemMubisys:true,cliente:'Antigo',previsaoEntrega:'2026-09-30',prazoCombinado:prazoVelho,retornoPrevisto:rp};
 const r=atualizarOrigemERP(atual,{cliente:'Novo',previsaoEntrega:'2026-10-20',prazoCombinado:{data:'2026-10-20'}},'2026-09-29T12:00:00Z');
 assert.deepEqual(r.registro.prazoCombinado,prazoVelho);assert.deepEqual(r.registro.retornoPrevisto,rp);
 const e=await edge('pcp-mubisys',{pcp_registros:[row('mub-1',atual)]});
 await e.run(`gravarImportadas(sb,[{numero:'1',cliente:'Mais novo',previsaoEntrega:'2026-10-20'}])`);
 const g=e.db.pcp_registros.find(x=>x.id==='mub-1').registro;
 assert.equal(g.cliente,'Mais novo');assert.deepEqual(g.prazoCombinado,prazoVelho);assert.deepEqual(g.retornoPrevisto,rp);
});
test('corrigir o prazo: só admin e pcp, com motivo de 15 letras; fica no diário com o antes e o depois',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[base({prazoCombinado:prazoVelho})],registros:fichas});
 const pede=(data,motivo)=>({...copia(e),prazoCombinado:{corrigir:true,data,motivo}});
 let r=await e.call({action:'upsert',os:pede('2026-10-02','Data digitada errada no agendamento')},operacao);
 assert.equal(r.status,200);assert.deepEqual(gravada(e).prazoCombinado,prazoVelho);assert.match(String(r.avisos),/só a gestão/);
 r=await e.call({action:'upsert',os:{id:'1',rev:1,prazoCombinado:{corrigir:true,data:'2026-10-02',motivo:'Data digitada errada no agendamento'}}},toque);
 assert.equal(r.status,200);assert.deepEqual(gravada(e).prazoCombinado,prazoVelho,'o toque não corrige');
 r=await e.call({action:'upsert',os:pede('2026-10-02','errado')},gestor);
 assert.equal(r.status,200);assert.deepEqual(gravada(e).prazoCombinado,prazoVelho);assert.match(String(r.avisos),/15 letras/);
 r=await e.call({action:'upsert',os:pede('0002-10-02','Data digitada errada no agendamento')},gestor);
 assert.deepEqual(gravada(e).prazoCombinado,prazoVelho);assert.match(String(r.avisos),/data não é válida/);
 r=await e.call({action:'upsert',os:pede('2026-10-02','Data digitada errada no agendamento')},gestor);
 const pc=gravada(e).prazoCombinado;
 assert.equal(pc.data,'2026-10-02');assert.equal(pc.fonte,'correcao');assert.equal(pc.original,'2026-09-30');assert.equal(pc.porId,'111222');
 const ent=diario(e).find(a=>a.campos.includes('prazoCombinado'));
 assert.ok(ent,'no diário');assert.equal(ent.antes.prazoCombinado.data,'2026-09-30');assert.equal(ent.depois.prazoCombinado.data,'2026-10-02');
 // O mesmo pedido de novo (cópia que ainda não viu a resposta) não recarimba.
 const em=pc.em;
 r=await e.call({action:'upsert',os:pede('2026-10-02','Data digitada errada no agendamento')},gestor);
 assert.equal(gravada(e).prazoCombinado.em,em);
});

/* ───────────── Conflito de agenda pelo intervalo previsto ───────────── */
test('conflito: com saída e retorno previstos nas duas O.S., vale o intervalo; faltando um lado, vale o turno',()=>{
 const d='2026-09-30';
 const os=(id,extra={})=>({id,tipo:'externo',liberadoPCP:true,instalacao:{data:d,periodo:'Manhã',duracaoDias:1},equipe:['Ana'],veiculo:'Carro '+id,...extra});
 const janela=(saida,hora,dia=d)=>({retornoPrevisto:[{dia,hora,saida}]});
 // Caso ruim de antes: mesmo turno, horários que não se cruzam, e o alerta acusava.
 assert.equal(O.conflitos([os('a',janela('08:00','10:00')),os('b',janela('10:00','12:00'))],d).length,0,'8h-10h e 10h-12h não colidem');
 assert.equal(O.conflitos([os('a',janela('08:00','11:00')),os('b',janela('10:00','12:00'))],d).length,1,'8h-11h e 10h-12h colidem');
 assert.equal(O.conflitos([os('a',janela('08:00','10:00')),os('b')],d).length,1,'um lado sem janela: turno');
 assert.equal(O.conflitos([os('a',{retornoPrevisto:[{dia:d,hora:'10:00'}]}),os('b',janela('10:00','12:00'))],d).length,1,'retorno sem saída não é janela');
 // "Horário" colidia com tudo; com as duas janelas, não.
 const h=(id,hora,ret)=>os(id,{instalacao:{data:d,periodo:'Horário',hora,duracaoDias:1},retornoPrevisto:[{dia:d,hora:ret}]});
 assert.equal(O.conflitos([h('a','08:00','10:00'),h('b','13:00','15:00')],d).length,0,'a saída do Horário vale como saída prevista');
 assert.equal(O.conflitos([h('a','08:00','14:00'),h('b','13:00','15:00')],d).length,1);
 // Manhã e Tarde sem janela continuam sem colidir; com janela que se cruza, colidem.
 const t=os('b',{instalacao:{data:d,periodo:'Tarde',duracaoDias:1}});
 assert.equal(O.conflitos([os('a'),t],d).length,0);
 assert.equal(O.conflitos([os('a',janela('08:00','14:00')),{...t,...janela('13:00','17:00')}],d).length,1,'a manhã que avança pela tarde colide');
 // Vários dias: a janela é do dia.
 const longa=os('a',{instalacao:{data:d,periodo:'Manhã',duracaoDias:2},retornoPrevisto:[{dia:'2026-10-01',hora:'10:00',saida:'08:00'}]});
 const dia2=os('b',{instalacao:{data:'2026-10-01',periodo:'Manhã',duracaoDias:1},...janela('10:00','12:00','2026-10-01')});
 assert.equal(O.conflitos([longa,dia2],'2026-10-01').length,0);
 assert.equal(O.conflitos([longa,os('c',{veiculo:'Carro a'})],d).length,1,'no 1º dia a longa não tem janela: turno');
});

/* ───────────── Tela da gestão ───────────── */
function tela(lista,papel='pcp') {
 const node=()=>({innerHTML:'',textContent:'',value:'',querySelector:()=>null,querySelectorAll:()=>[],setAttribute(){},classList:{toggle(){},add(){},remove(){}},focus(){}});
 const doc={querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},getElementById:()=>null};
 const salvos=[];
 const ctx=vm.createContext({console,Date:class extends Date{constructor(...a){super(...(a.length?a:['2026-09-29T12:00:00']));}},document:doc,window:{},localStorage:{getItem:()=>null},
  STORE:{getAllOS:()=>lista,getCFG:()=>({}),getOS:id=>lista.find(o=>o.id===id),uuid:()=>'novo',saveOS(os){salvos.push(JSON.parse(JSON.stringify(os)));}},setTimeout(){},clearTimeout(){}});
 const root=path.join(__dirname,'..');
 vm.runInContext(fs.readFileSync(path.join(root,'operacao.js'),'utf8'),ctx);
 vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8'),ctx);
 vm.runInContext(`STATE.user={nome:'Revisão',papel:'${papel}'}; renderModal=()=>{}; renderActiveTab=()=>{};`,ctx);
 return {run:c=>vm.runInContext(c,ctx),salvos};
}
test('tela: digitar o retorno previsto não passa pelo setField (não zera confirmação nem carro) e guarda por dia',()=>{
 const t=tela([]);
 t.run(`_modalDraft={id:'r1',tipo:'externo',confirmacao:'Confirmado',confEm:'2026-09-29T07:00:00',carroLiberado:true,instalacao:{data:'2026-09-30',periodo:'Manhã',duracaoDias:2},retornoPrevisto:[{dia:'2026-09-20',hora:'17:00'}]};
  definirRetornoPrevisto(_modalDraft,'2026-10-01','hora','18:00');
  definirRetornoPrevisto(_modalDraft,'2026-09-30','saida','08:00');
  definirRetornoPrevisto(_modalDraft,'2026-09-30','hora','17:00');`);
 assert.equal(t.run('_modalDraft.confirmacao'),'Confirmado');assert.equal(t.run('_modalDraft.carroLiberado'),true);
 assert.deepEqual(JSON.parse(t.run('JSON.stringify(_modalDraft.retornoPrevisto)')),[{dia:'2026-09-30',hora:'17:00',saida:'08:00'},{dia:'2026-10-01',hora:'18:00',saida:''}],'o dia que saiu da agenda sai da lista');
 t.run(`definirRetornoPrevisto(_modalDraft,'2026-09-30','hora','');definirRetornoPrevisto(_modalDraft,'2026-09-30','saida','');definirRetornoPrevisto(_modalDraft,'2026-10-01','hora','');`);
 assert.equal(t.run('_modalDraft.retornoPrevisto'),null,'tudo apagado: null (a gestão limpando)');
});
test('tela: digitar 17:30 num campo vazio grava 17:30 (a ficha não é repintada no meio da digitação) e vira um envio só',()=>{
 // Caso ruim da revisão: no Chrome o campo de hora dispara "change" a cada parte
 // completa (17:03 e depois 17:30). Repintar e devolver o foco no primeiro
 // gravava 00:03. Agora o campo fica, o rodapé do dia e os alertas se atualizam.
 const t=tela([]);
 t.run(`var __rend=0; reRenderModalKeepOpen=()=>{__rend++;}; var __salvos=[]; saveDraft=()=>{__salvos.push(JSON.stringify(_modalDraft.retornoPrevisto));_modalDirty=false;};
  var __toasts=[]; toast=m=>{__toasts.push(m);};
  var __t=new Map(),__n=0; setTimeout=fn=>{__t.set(++__n,fn);return __n;}; clearTimeout=id=>{__t.delete(id);};
  var __no=id=>({id,innerHTML:'',value:'',dataset:{},querySelectorAll:()=>[],querySelector:()=>null});
  var __els={}; document.getElementById=id=>(__els[id]||(__els[id]=__no(id)));
  var __in={id:'rp-hora-2026-09-30',value:'',dataset:{rpDia:'2026-09-30',rpCampo:'hora'}};
  var __alert=__no('agenda-alertas'), __box=__no('prazo-retorno');
  var __root={querySelectorAll:s=>s==='[data-rp-dia]'?[__in]:[],querySelector:s=>s==='#agenda-alertas'?__alert:s==='#prazo-retorno'?__box:null};
  _modalDraft={id:'r1',tipo:'externo',instalacao:{data:'2026-09-30',periodo:'Manhã',duracaoDias:1}};
  ligarPrazoRetorno(__root,false);
  __in.value='17:03'; __in.onchange(); __in.value='17:30'; __in.onchange();`);
 assert.equal(t.run('__rend'),0,'a ficha não é repintada');
 assert.equal(t.run('__in.value'),'17:30','o campo não é trocado no meio da digitação');
 assert.equal(t.run('_modalDraft.retornoPrevisto[0].hora'),'17:30');
 t.run('[...__t.values()].forEach(fn=>fn())');
 assert.deepEqual(JSON.parse(t.run('JSON.stringify(__salvos)')).map(x=>JSON.parse(x)[0].hora),['17:30'],'a hora intermediária não vira envio');
 // Saída depois do retorno: o aviso aparece no rodapé do dia, sem repintar.
 t.run(`var __s={id:'rp-saida-2026-09-30',value:'18:00',dataset:{rpDia:'2026-09-30',rpCampo:'saida'}}; __root.querySelectorAll=s=>s==='[data-rp-dia]'?[__in,__s]:[]; ligarPrazoRetorno(__root,false); __s.onchange();`);
 assert.match(t.run(`document.getElementById('rp-rodape-2026-09-30').innerHTML`),/precisa ser antes do retorno/);
 assert.equal(t.run('__rend'),0);
 // A data mudou com a ficha aberta: a hora digitada na linha velha não entra, e o bloco ganha o dia novo.
 t.run(`_modalDraft.instalacao.data='2026-10-01'; __in.value='16:00'; __in.onchange();`);
 assert.match(t.run('__toasts.join()'),/não está na agenda/);
 assert.ok(!t.run(`JSON.stringify(_modalDraft.retornoPrevisto)`).includes('16:00'),'a hora da linha velha não entra');
 assert.match(t.run('__box.innerHTML'),/data-rp-dia="2026-10-01"/,'o bloco foi repintado com o dia novo');
});
test('tela: trocar a data ou a duração repinta o bloco do retorno previsto; definirRetornoPrevisto recusa dia fora da agenda',()=>{
 const t=tela([]);
 t.run(`_modalDraft={id:'r2',tipo:'externo',instalacao:{data:'2026-10-01',periodo:'Manhã',duracaoDias:1}};`);
 assert.equal(t.run(`definirRetornoPrevisto(_modalDraft,'2026-09-30','hora','17:00')`),false);
 assert.equal(t.run('_modalDraft.retornoPrevisto'),undefined,'nada gravado no dia fora da agenda');
 t.run(`var __box={innerHTML:'',querySelectorAll:()=>[],querySelector:()=>null}; var __root={querySelector:s=>s==='#prazo-retorno'?__box:null,querySelectorAll:()=>[]};
  _modalDraft.instalacao.duracaoDias=3; repintarPrazoRetorno(__root,false);`);
 const html=t.run('__box.innerHTML');
 for(const d of ['2026-10-01','2026-10-02','2026-10-03'])assert.match(html,new RegExp(`data-rp-dia="${d}" data-rp-campo="hora"`));
 // O handler dos campos de agenda chama o repintar para a data e a duração.
 const src=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
 assert.match(src,/el\.dataset\.f === 'instalacao\.data' \|\| el\.dataset\.f === 'instalacao\.duracaoDias'\) repintarPrazoRetorno\(root, ro\)/);
});
test('tela: bloco Agenda mostra prazo e retorno; só admin e pcp digitam; retirada não tem retorno',()=>{
 const os={id:'a1',tipo:'externo',instalacao:{data:'2026-10-02',periodo:'Manhã',duracaoDias:2},agendaLog:[{de:'2026-09-30',data:'2026-10-02',em:'x'}],retornoPrevisto:[{dia:'2026-10-02',hora:'17:00',saida:'08:00',por:'Gestor Teste'}],equipe:[]};
 let t=tela([os]);
 const html=t.run(`blocoAgenda(STORE.getOS('a1'),false,false)`);
 assert.match(html,/Prazo combinado: <strong>30\/09\/26<\/strong>/);assert.match(html,/agenda atual 02\/10\/26/);
 assert.match(html,/data-rp-dia="2026-10-02" data-rp-campo="hora" value="17:00"/);assert.match(html,/data-rp-dia="2026-10-03"/,'um campo por dia');
 assert.match(html,/Corrigir o prazo/);
 t=tela([os],'operacao');
 const ro=t.run(`blocoAgenda(STORE.getOS('a1'),false,false)`);
 assert.ok(!/data-rp-dia/.test(ro)&&!/Corrigir o prazo/.test(ro),'operação só lê');assert.match(ro,/Retorno previsto <strong>17:00<\/strong>/);
 t=tela([{...os,tipo:'interno'}]);
 assert.ok(!/prazo-retorno/.test(t.run(`blocoAgenda(STORE.getOS('a1'),false,false)`)));
 t=tela([{id:'e1',tipo:'externo',origemMubisys:true,previsaoEntrega:'2026-10-05',instalacao:{data:'2026-10-05'},equipe:[]}]);
 assert.match(t.run(`blocoAgenda(STORE.getOS('e1'),false,false)`),/A previsão do ERP não conta/);
});
test('tela: pedir correção do prazo exige motivo; a operação não pede',()=>{
 let t=tela([]);
 t.run(`_modalDraft={id:'c1',tipo:'externo',instalacao:{data:'2026-10-02'}};`);
 assert.match(t.run(`pedirCorrecaoPrazo(_modalDraft,'2026-10-03','curto')`),/15 letras/);
 assert.match(t.run(`pedirCorrecaoPrazo(_modalDraft,'','Data digitada errada no agendamento')`),/Escolha a data/);
 assert.equal(t.run(`pedirCorrecaoPrazo(_modalDraft,'2026-10-03','Data digitada errada no agendamento')`),'');
 assert.equal(t.run('_modalDraft.prazoCombinado.corrigir'),true);
 t=tela([],'operacao');t.run(`_modalDraft={id:'c1',tipo:'externo',instalacao:{data:'2026-10-02'}};`);
 assert.match(t.run(`pedirCorrecaoPrazo(_modalDraft,'2026-10-03','Data digitada errada no agendamento')`),/Só a gestão/);
});
test('diário: prazo e retorno aparecem em português, sem o ID de quem digitou',()=>{
 const t=tela([]);
 assert.equal(t.run(`audValor('retornoPrevisto',[{dia:'2026-09-30',hora:'17:00',saida:'08:00',porId:'111222'}])`),'30/09/2026: saída 08:00, retorno 17:00');
 assert.equal(t.run(`audValor('prazoCombinado',{data:'2026-10-02',fonte:'correcao',motivo:'Data digitada errada',porId:'111222'})`),'02/10/2026 · corrigido: Data digitada errada');
 assert.equal(t.run(`AUD_ROTULOS.prazoCombinado`),'Prazo combinado');
});
test('espelho (celular) só lê o retorno previsto: nenhum campo de digitar',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','equipe.js'),'utf8');
 assert.match(src,/retornoPrevistoLinhaHTML/);assert.ok(!/data-rp-dia|retornoPrevisto\s*=/.test(src),'o celular não escreve o retorno previsto');
 assert.equal(O.retornoPrevistoParaMostrar({instalacao:{data:'2026-09-30',duracaoDias:2},retornoPrevisto:[{dia:'2026-10-01',hora:'18:00'}]},'2026-10-01').hora,'18:00');
 assert.equal(O.retornoPrevistoParaMostrar({instalacao:{data:'2026-09-30'},retornoPrevisto:[{dia:'2026-09-30',hora:'17:00'}]},'2026-09-29').hora,'17:00','antes do dia: o do primeiro dia');
 // Vários dias: a saidaEm do 1º dia não é zerada no "Mais um dia de trabalho"; hoje na agenda vence.
 const longa={instalacao:{data:'2026-09-30',duracaoDias:3},saidaEm:'2026-09-30T11:00:00.000Z',retornoPrevisto:[{dia:'2026-09-30',hora:'17:00'},{dia:'2026-10-01',hora:'12:00'}]};
 assert.equal(O.retornoPrevistoParaMostrar(longa,'2026-10-01').hora,'12:00','o de hoje, não o do dia da saída');
 assert.equal(O.retornoPrevistoParaMostrar(longa,'2026-10-05').hora,'17:00','hoje fora da agenda: o do dia da saída');
});
test('PDF do ERP: a data de entrega lida do PDF fica marcada como previsão, e não vira prazo ao gravar',()=>{
 const t=tela([]);
 const os=JSON.parse(t.run(`JSON.stringify(parsePDF('Ordem de serviço: 7003\\nEntrega: 05/10/2026 às 14:00\\n',[]))`));
 assert.equal(os.instalacao.data,'2026-10-05');assert.equal(os.origemPDF,true);assert.equal(os.previsaoEntrega,'2026-10-05');
 assert.equal(O.prazoCombinadoDe(os),null);
 assert.equal(O.prazoCombinadoDe({...os,equipe:['Ana']}).data,'2026-10-05','com a equipe escalada, a data foi agendada');
});
