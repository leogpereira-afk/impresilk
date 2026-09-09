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
