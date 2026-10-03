const {test}=require('node:test'),assert=require('node:assert/strict'),R=require('../operacao-revisao.js'),O=require('../operacao.js');
const dia='2026-10-01',base=(id,veiculo='Uno')=>({id,numero:id,tipo:'externo',instalacao:{data:dia,periodo:'Manhã'},equipe:['100001'],veiculo});
test('mesmo turno pede verificação; só intervalo conhecido declara sobreposição',()=>{
 const a=base('a'),b=base('b');let c=O.conflitos([a,b],dia);assert.equal(c.length,1);assert.equal(c[0].confirmado,false);assert.match(c[0].motivo,/duração incompleto/);
 a.retornoPrevisto=[{dia,saida:'08:00',hora:'10:00'}];b.retornoPrevisto=[{dia,saida:'10:00',hora:'12:00'}];assert.equal(O.conflitos([a,b],dia).length,0);
 b.retornoPrevisto[0].saida='09:00';assert.equal(O.conflitos([a,b],dia)[0].confirmado,true);
});
test('veículos só compartilham identidade após confirmação de ID e placa',()=>{
 const a=base('a','Fiat Uno'),b={...base('b','UNO - 10'),equipe:['100002']};assert.equal(O.conflitos([a,b],dia).length,0);
 O.usarVeiculos([{alias:'Fiat Uno',id:'ativo1',nome:'UNO - 10',placa:'TST1234'}]);assert.equal(O.chaveVeiculo(a),O.chaveVeiculo(b));assert.equal(O.conflitos([a,b],dia).length,1);O.usarVeiculos([]);
});
test('categoria confirmada agrupa variantes sem modificar descrições',()=>{
 const a={servico:'ADESIVO'},b={servico:'adesivo'},cfg={categoriasServico:[{descricao:'ADESIVO',categoria:'Adesivos'},{descricao:'adesivo',categoria:'Adesivos'}]};assert.equal(R.categoria(a), 'Sem categoria');assert.equal(R.categoria(a,cfg),R.categoria(b,cfg));assert.equal(a.servico,'ADESIVO');assert.equal(b.servico,'adesivo');
});
test('custo zero medido é diferente de desconhecido e parcial; fecha em centavos',()=>{
 assert.equal(R.custo({},{}).centavos,null);assert.equal(R.custo({},{hora:0,km:0},{material:0,horas:0,km:0}).centavos,0);assert.equal(R.custo({},{hora:10},{material:2,horas:1,km:3}).completo,false);assert.equal(R.custo({},{hora:10,km:2},{material:2,horas:1,km:3}).centavos,1800);
});
test('assistente limita cinco ações com O.S., data, origem e dono; não altera registros',()=>{
 const lista=Array.from({length:8},(_,i)=>({...base('p'+i),criadoEm:dia})),antes=JSON.stringify(lista),a=R.prioridades(lista,dia,O);assert.equal(a.length,5);assert.ok(a.every(x=>x.osId&&x.numero&&x.motivo&&x.data&&x.origem&&x.dono));assert.equal(JSON.stringify(lista),antes);
});
test('custo da correção usa medição efetiva, material isolado e zero explícito',()=>{
 const o={id:'c',kmSaida:100,kmRetorno:120},op={horas:()=>8},base={custoRetrabalho:{hora:10,km:2}};
 const custo=med=>R.custoCorrecao(o,{...base,medicoesRetrabalho:{c:med}},op);
 let c=custo({material:45,horas:null,km:null});assert.equal(c.centavos,4500);assert.equal(c.completo,false);assert.equal(c.horas,null);
 c=custo({material:0,horas:0,km:0});assert.equal(c.centavos,0);assert.equal(c.completo,true);
 c=custo({material:5,horas:2,km:3});assert.equal(c.centavos,3100);assert.equal(c.horas,2);assert.equal(c.km,3);
});
