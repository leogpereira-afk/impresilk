/* Simulações determinísticas de dados fictícios, sem banco ou rede reais. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../conferencia-entrega.js');
const O=require('../operacao.js');

test('Kaizen: 240 combinações de parcelas conservam centavos e saldo',()=>{
 for(const quantidade of [1,2,3,7,11,37,73,100]) for(let caso=1;caso<=30;caso++){
   const centavos=caso*179+1;
   const os={id:'ficticia',itens:[{uid:'painel',descricao:'Painel fictício',qtde:quantidade,subtotal:centavos/100}]};
   const item=C.catalogo(os)[0];
   const entregas=Array.from({length:quantidade},(_,i)=>({id:'parcela-'+i,dia:'2026-10-01',itens:[{chave:item.chave,identidade:item.identidade,qtde:1}]}));
   const antes=JSON.stringify(os),r=C.apurar(os,centavos/100,entregas);
   assert.equal(r.erro,'');assert.equal(r.saldo,0);assert.equal(r.saldoItens.length,0);
   assert.equal(r.entregas.reduce((s,e)=>s+e.valor,0),centavos);
   assert.ok(r.entregas.every(e=>Number.isInteger(e.valor)&&e.valor>=0));
   assert.equal(JSON.stringify(os),antes);
   const excesso={...entregas[0],id:'excesso'};
   assert.match(C.validar(os,[...entregas,excesso],'2026-10-22'),quantidade===100?/Limite de 100 entregas/:/saldo/);
 }
});

test('Kaizen: duração extrema é limitada e não produz agenda infinita',()=>{
 for(const duracaoDias of [Infinity,1e15,'999999999999',-10,NaN,'inválida']){
   const os={tipo:'externo',instalacao:{data:'2026-10-01',duracaoDias}};
   const dias=O.diasAgenda(os);
   assert.ok(dias.length>=1&&dias.length<=366);
   assert.ok(dias.every(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)));
   assert.equal(new Set(dias).size,dias.length);
 }
});

test('Kaizen: cancelamento prevalece em 64 combinações de progresso operacional',()=>{
 for(let mask=0;mask<64;mask++){
   const os={id:'ficticia-'+mask,tipo:'externo',instalacao:{data:'2026-10-01',duracaoDias:3},equipe:['900001'],veiculo:'Veículo fictício',cancelamento:{ativo:true,motivo:'Cancelamento fictício para teste',em:'2026-10-02T12:00:00Z'},
     liberadoPCP:!!(mask&1),confirmacao:mask&2?'Confirmado':'',horaSaida:mask&4?'08:00':'',horaRetorno:mask&8?'17:00':'',finalizadaEm:mask&16?'2026-10-02T17:00:00Z':'',retrabalho:!!(mask&32)};
   assert.equal(O.status(os),'cancelada');assert.equal(O.concluida(os),false);
   assert.equal(O.programadas([os],'2026-10-01','2026-10-31').length,0);
 }
});


test('Kaizen: acima de 100 entregas exige reorganização sem calcular valor parcial',()=>{
 for(const quantidade of [101,250]){
   const os={id:'limite-ficticio',itens:[{uid:'p',descricao:'Peça fictícia',qtde:quantidade,subtotal:100}]};
   const item=C.catalogo(os)[0];
   const entregas=Array.from({length:quantidade},(_,i)=>({id:'e-'+i,dia:'2026-10-01',itens:[{chave:item.chave,identidade:item.identidade,qtde:1}]}));
   assert.match(C.apurar(os,100,entregas).erro,/Limite de 100 entregas/);
 }
});
