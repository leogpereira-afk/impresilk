const {test} = require('node:test');
const assert = require('node:assert/strict');
const O = require('../operacao.js');
const hoje = '2026-09-09';
const os = (extra={}) => ({id:'a',tipo:'externo',liberadoPCP:true,instalacao:{data:hoje,periodo:'Manhã'},equipe:['Ana'],veiculo:'Carro 1',confirmacao:'Confirmado',...extra});
test('status exige PCP, agenda, confirmação e saída; retirada não vira instalação', () => {
  assert.equal(O.status(os({liberadoPCP:false})), 'aguardando_producao');
  assert.equal(O.status(os({equipe:[]})), 'apto');
  assert.equal(O.status(os({confirmacao:''})), 'agendada');
  assert.equal(O.status(os()), 'confirmada');
  assert.equal(O.status(os({horaSaida:'08:00'})), 'em_andamento');
  assert.equal(O.status(os({tipo:'interno',horaSaida:'08:00'})), 'apto');
  assert.equal(O.status(os({finalizadaEm:hoje})), 'finalizada');
  assert.equal(O.agendaCompleta(os({instalacao:{data:hoje,periodo:'Horário',hora:''}})),false);
});
test('atraso considera previsão e agenda, rejeita data inválida, não inclui encerradas', () => {
  assert.equal(O.atrasada(os({instalacao:{},previsaoEntrega:'2026-09-08'}),hoje),true);
  assert.equal(O.atrasada(os({previsaoEntrega:'2026-09-08'}),hoje),false);
  assert.equal(O.atrasada(os({instalacao:{data:'2026-02-30'}}),hoje),false);
  assert.equal(O.atrasada(os({instalacao:{data:'2026-09-08'},finalizadaEm:hoje}),hoje),false);
  assert.equal(O.prazo(os({instalacao:{data:'2026-09-08',duracaoDias:3}})),'2026-09-10');
  assert.equal(O.atrasada(os({instalacao:{data:'2026-09-08',duracaoDias:3}}),hoje),false);
});
test('liberar carro não comprova saída; registro antigo pede conferência', () => {
  assert.equal(O.naRua(os({carroLiberado:true}),hoje),false);
  assert.equal(O.naRua(os({horaSaida:'08:00',saidaEm:hoje+'T08:00:00'}),hoje),true);
  assert.equal(O.situacaoSaida(os({horaSaida:'08:00',saidaEm:'2026-08-01T08:00:00'}),hoje),'sem-retorno');
  assert.equal(O.naRua(os({horaSaida:'08:00',horaRetorno:'12:00'}),hoje),false);
  assert.equal(O.naRua(os({horaSaida:'08:00',tipo:'interno'}),hoje),false);
  assert.equal(O.naRua(os({horaSaida:'08:00',saidaEm:'2026-09-08T08:00:00',instalacao:{data:'2026-09-08',duracaoDias:3}}),hoje),true);
});
test('conclusões usam dia real; ERP e cancelamento não viram entrega; reabertura respeita nova conclusão', () => {
  const humano = os({instalacao:{data:'2026-08-01'},finalizadaEm:hoje+'T12:00:00'});
  const erp = os({id:'b',finalizadaEm:hoje+'T12:00:00',baixaAutoERP:{em:hoje+'T12:00:00',status:'CANCELADO'}});
  assert.deepEqual(O.conclusoes([humano,erp],hoje,hoje),[humano]);
  assert.equal(O.concluida({...erp,finalizadaEm:'2026-09-10T12:00:00',finalizadoPor:'Ana'}),true);
  assert.equal(O.concluida({...erp,finalizadaEm:''}),false);
  assert.equal(O.encerradaERP({...humano,finalizadoPor:'Mubisys (auto)'}),true);
});
test('mensal separa O.S únicas, participações, sem equipe e retiradas', () => {
  const fins = [os({finalizadaEm:hoje,equipe:['Ana','Bia','Ana']}),os({id:'b',finalizadaEm:hoje,equipe:[],retrabalho:true}),os({id:'c',tipo:'interno',finalizadaEm:hoje}),os({id:'d',finalizadaEm:hoje,baixaAutoERP:{em:hoje}})];
  const r=O.mensal(fins,'2026-09');
  assert.deepEqual({total:r.total,participacoes:r.participacoes,semEquipe:r.semEquipe,retrabalho:r.retrabalho},{total:2,participacoes:2,semEquipe:1,retrabalho:1});
  assert.equal(r.pessoas.find(p=>p.nome==='Ana').entregas,1);
});
test('tempo preserva vários dias e mostra ausência de medição em vez de zero', () => {
  assert.equal(O.horas(os()),null);
  assert.equal(O.horas(os({saidaEm:'2026-09-08T08:00:00',retornoEm:'2026-09-09T10:00:00'})),26);
  assert.equal(O.horas(os({horaSaida:'23:00',horaRetorno:'01:00'})),2);
  assert.equal(O.horas(os({horaSaida:'08:00',horaRetorno:'09:00',instalacao:{duracaoDias:2}})),null);
  assert.equal(O.horas(os({saidaEm:'2026-09-09T08:00:00',retornoEm:'2026-09-08T10:00:00'})),null);
});
test('agenda e relatórios incluem continuação e excluem retiradas e encerradas', () => {
  const longa=os({instalacao:{data:'2026-09-08',duracaoDias:3}});
  const itens=[longa,os({id:'b',tipo:'interno'}),os({id:'c',finalizadaEm:hoje})];
  assert.deepEqual(O.programadas(itens,hoje,hoje),[longa]);
  assert.deepEqual(O.programadas(itens,'2026-09-11','2026-09-12'),[]);
});
test('conflitos verificam recursos por turno sem afirmar capacidade', () => {
  const a=os(), b=os({id:'b',equipe:['Bia']}), c=os({id:'c',veiculo:'Carro 2',equipe:['Ana'],instalacao:{data:hoje,periodo:'Tarde'}});
  assert.equal(O.conflitos([a,b,c],hoje).length,1);
  assert.equal(O.conflitos([a,b],hoje)[0].veiculo,'Carro 1');
  assert.equal(O.conflitos([a,{...c,instalacao:{data:hoje,periodo:'Dia inteiro'}}],hoje)[0].equipe[0],'Ana');
  assert.equal(O.conflitos([a,{...c,instalacao:{data:hoje,periodo:'Horário',hora:'11:00'}}],hoje).length,1);
});
test('atalhos têm exatamente 7/30 dias e olham para frente na programação', () => {
  assert.deepEqual(O.periodoRapido('7',hoje),{de:'2026-09-03',ate:hoje});
  assert.deepEqual(O.periodoRapido('7',hoje,true),{de:hoje,ate:'2026-09-15'});
  assert.deepEqual(O.periodoRapido('mes',hoje,true),{de:hoje,ate:'2026-09-30'});
});
test('prioridades preservam pendência de retrabalho mesmo após finalização', () => {
  const r = O.resumo([os(),os({id:'b',instalacao:{}}),os({id:'c',finalizadaEm:hoje,retrabalho:true})],hoje);
  assert.equal(r.hoje.length,1); assert.equal(r.semPrazo.length,1); assert.equal(r.retrabalho.length,1);
});
test('missão padrão é hoje se houver, senão o maior problema', () => {
  assert.equal(O.missaoFoco({ hoje:[1], atrasadas:[1,2], retrabalho:[], retirada:[], semPrazo:[], semRetorno:[] }), 'hoje');
  assert.equal(O.missaoFoco({ hoje:[], atrasadas:[1,2,3], retrabalho:[1], retirada:[], semPrazo:[], semRetorno:[] }), 'atrasadas');
  assert.equal(O.missaoFoco({ hoje:[], atrasadas:[], retrabalho:[1,2], retirada:[1], semPrazo:[], semRetorno:[] }), 'retrabalho');
  assert.equal(O.missaoFoco({ hoje:[], atrasadas:[], retrabalho:[], retirada:[], semPrazo:[], semRetorno:[] }), '');
});
test('taxa de retrabalho exclui ERP e filhas, conta original uma única vez',()=>{
 const f='2026-09-10T12:00:00Z';
 const lista=[{id:'a',numero:'1',finalizadaEm:f},{id:'b',numero:'2',finalizadaEm:f},{id:'c',numero:'3',finalizadaEm:f,finalizadoPor:'Mubisys · baixa'}, {id:'d',numero:'4',osOriginal:'1',finalizadaEm:f},{id:'e',numero:'5',osOriginal:'1'}];
 assert.deepEqual(O.taxaRetrabalho(lista,'2026-09-01','2026-09-30'),{entregues:2,afetadas:1,taxa:50});
 assert.equal(O.taxaRetrabalho(lista,'2026-10-01','2026-10-31').taxa,null);
});
test('pendências respeitam etapa, confirmação exige data do dia',()=>{
 const a={tipo:'externo',liberadoPCP:false};
 assert.equal(O.pendencias(a).includes('Escalar equipe'),false);
 assert.equal(O.pendencias({...a,liberadoPCP:true}).includes('Escalar equipe'),true);
 assert.equal(O.confirmadaHoje({confirmacao:'Confirmado'},'2026-09-19'),false);
 assert.equal(O.confirmadaHoje({confirmacao:'Confirmado',confEm:'2026-09-19T12:00:00-03:00'},'2026-09-19'),true);
 assert.equal(O.confirmadaHoje({confirmacao:'Confirmado',confEm:'2026-09-18T12:00:00-03:00'},'2026-09-19'),false);
});

/* A VOLTA DO CARRO (pedido do Léo, 24/09/2026): "algo que avalie a volta do
   carro pelo PCP, se está arrumado etc". A volta é o dia + o carro + a equipe. */
test('volta do carro: carro ainda na rua, retirada, O.S. sem equipe e baixa do ERP sem viagem não entram', () => {
  const na = os({id:'rua',horaSaida:'08:00',saidaEm:hoje+'T08:00:00'});
  const retirada = os({id:'ret',tipo:'interno',finalizadaEm:hoje+'T10:00:00',finalizadoPor:'Bia'});
  const semEquipe = os({id:'sem',equipe:[],retornoEm:hoje+'T12:00:00'});
  const erp = os({id:'erp',finalizadaEm:hoje+'T09:00:00',finalizadoPor:'Mubisys (auto)'});
  assert.equal(O.voltasDoCarro([na,retirada,semEquipe,erp]).length, 0);
  const lancada = os({id:'lan',finalizadaEm:hoje+'T09:00:00',finalizadoPor:'Mubisys (auto)',entregaLancada:{data:hoje}});
  assert.equal(O.voltasDoCarro([lancada]).length, 1, 'baixa do ERP lançada como entrega conta na nota, então entra');
});
test('volta do carro: mesmo dia, carro e equipe viram UMA volta; outro carro é outra volta', () => {
  const a = os({id:'a',numero:'1',retornoEm:hoje+'T12:00:00',equipe:['Ana','Bia']});
  const b = os({id:'b',numero:'2',finalizadaEm:hoje+'T16:00:00',finalizadoPor:'Ana',equipe:['bia','Ana '],veiculo:'carro 1'});
  const c = os({id:'c',numero:'3',retornoEm:hoje+'T17:00:00',veiculo:'Carro 2'});
  const v = O.voltasDoCarro([a,b,c]);
  assert.equal(v.length, 2);
  const junta = v.find(g => g.os.length === 2);
  assert.equal(junta.os.map(o => o.id).sort().join(), 'a,b');
  assert.equal(junta.dia, hoje);
});
test('volta do carro: situação e respostas; registro antigo só com "carro limpo" conta como conferido', () => {
  const r = {carroLimpo:'sim',carroArrumado:'nao',equipamentosOk:'sim',semAvaria:'sim'};
  const a = os({id:'a',retornoEm:hoje+'T12:00:00',retornoConf:r});
  const b = os({id:'b',retornoEm:hoje+'T13:00:00'});
  let [g] = O.voltasDoCarro([a,b]);
  assert.equal(g.situacao, 'parcial'); assert.equal(g.respostas, null);
  [g] = O.voltasDoCarro([a,{...b,retornoConf:{...r}}]);
  assert.equal(g.situacao, 'conferida'); assert.equal(g.respostas.carroArrumado, 'nao');
  [g] = O.voltasDoCarro([a,{...b,retornoConf:{...r,carroArrumado:'sim'}}]);
  assert.equal(g.situacao, 'conferida'); assert.equal(g.respostas, null, 'respostas diferentes não viram uma só');
  [g] = O.voltasDoCarro([os({retornoEm:hoje+'T12:00:00',retornoConf:{carroLimpo:'sim'}})]);
  assert.equal(g.situacao, 'conferida');
  [g] = O.voltasDoCarro([os({retornoEm:hoje+'T12:00:00',retornoConf:{obs:'só anotação'}})]);
  assert.equal(g.situacao, 'conferir', 'observação sem resposta não é conferência');
});
test('volta do carro: a conferir primeiro, depois a mais recente; recorte por dia da volta', () => {
  const velha = os({id:'v',retornoEm:'2026-09-01T12:00:00'});
  const nova = os({id:'n',retornoEm:hoje+'T12:00:00',veiculo:'Carro 2',retornoConf:{carroLimpo:'sim'}});
  const meio = os({id:'m',retornoEm:'2026-09-05T12:00:00',veiculo:'Carro 3'});
  assert.deepEqual(O.voltasDoCarro([velha,nova,meio]).map(g => g.os[0].id), ['m','v','n']);
  assert.deepEqual(O.voltasDoCarro([velha,nova,meio],'2026-09-04',hoje).map(g => g.os[0].id), ['m','n']);
  assert.equal(O.diaDaVolta(os({horaRetorno:'17:00',saidaEm:'2026-09-08T08:00:00'})), '2026-09-08', 'retorno antigo sem data usa o dia da saída');
});
