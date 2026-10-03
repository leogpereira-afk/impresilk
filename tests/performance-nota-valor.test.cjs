const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const P=require('../performance.js');
const {edge}=require('./helpers/edge.cjs');
const pesos={producao:60,limpeza:20,equipamentos:20};
const membro=(nome,percentual=100)=>({chave:nome,nome,percentual});
const registro=(id,nome,valor,extra={})=>({id,numero:id,membros:[membro(nome)],valor,confirmado:true,retornoConf:{carroLimpo:'sim',carroArrumado:'sim',equipamentosOk:'sim'},...extra});
const notas=regs=>P.avaliar(regs,pesos,{porValor:true}).pessoas;

test('nota monetária: uma entrega maior supera várias menores com os mesmos cuidados',()=>{
 const regs=[registro('a','Ana',10000),registro('b','Bia',2500),registro('c','Bia',2500)];
 const n=notas(regs);
 assert.equal(n.find(p=>p.nome==='Ana').nota,100);
 assert.equal(n.find(p=>p.nome==='Bia').nota,70);
 assert.equal(n.find(p=>p.nome==='Bia').componentes.producao,50);
 // A régua anterior continua disponível para revisões já fechadas.
 assert.equal(P.avaliar(regs,pesos).pessoas.find(p=>p.nome==='Ana').nota,70);
});

test('nota monetária: carro e equipamentos continuam valendo 20 pontos cada',()=>{
 const regs=[registro('a','Ana',10000,{retornoConf:{carroLimpo:'nao',equipamentosOk:'sim'}}),registro('b','Bia',10000,{retornoConf:{carroLimpo:'sim',equipamentosOk:'nao'}}),registro('c','Caio',10000,{retornoConf:{carroLimpo:'nao',equipamentosOk:'nao'}})];
 assert.deepEqual(notas(regs).map(p=>p.nota),[80,80,60]);
});

test('parcial usa somente o líquido entregue e o rateio individual, sem descontar a fração duas vezes',()=>{
 const parcial=registro('a','Ana',5000,{fracaoOS:.25,entregaId:'parcial-1',valorBrutoCentavos:600000,membros:[membro('Ana',60),membro('Bia',40)]});
 const n=notas([parcial,registro('b','Caio',10000)]);
 assert.equal(n.find(p=>p.nome==='Ana').valorConfirmado,3000);
 assert.equal(n.find(p=>p.nome==='Ana').nota,58);
 assert.equal(n.find(p=>p.nome==='Bia').valorConfirmado,2000);
 assert.equal(n.find(p=>p.nome==='Bia').nota,52);
});

test('valores ausentes, conflitantes e participações pendentes não fabricam liderança ou nota',()=>{
 const regs=[registro('a','Ana',1000),registro('b','Bia',100000,{confirmado:false}),registro('c','Caio',null),registro('d','Davi',90000,{avisoValor:'Valores divergentes'}),registro('e','Eva',NaN),registro('f','Fábio',-10)];
 const n=notas(regs);
 assert.equal(n.find(p=>p.nome==='Ana').nota,100);
 for(const nome of ['Bia','Caio','Davi','Eva','Fábio'])assert.equal(n.find(p=>p.nome===nome).nota,null,nome);
});

test('zero confirmado é zero financeiro; valor conhecido parcial permanece sinalizado',()=>{
 const n=notas([registro('a','Ana',0),registro('b','Bia',null)]);
 assert.equal(n.find(p=>p.nome==='Ana').componentes.producao,0);
 assert.equal(n.find(p=>p.nome==='Ana').nota,40);
 assert.equal(n.find(p=>p.nome==='Bia').nota,null);
 const parcial=notas([registro('c','Caio',2000),registro('d','Caio',null)])[0];
 assert.equal(parcial.valorConfirmado,2000);
 assert.equal(parcial.entregasSemValor,1);
});

test('rateio mantém todos os centavos e não infla o valor com entregas fracionadas',()=>{
 const pessoas=[membro('Ana',60),membro('Bia',40)];
 const inteiras=notas([registro('a','Ana',100.01,{membros:pessoas})]);
 const parciais=notas([registro('a1','Ana',40,{membros:pessoas,fracaoOS:.4}),registro('a2','Ana',60.01,{membros:pessoas,fracaoOS:.6})]);
 assert.equal(Math.round(parciais.reduce((s,p)=>s+p.valorConfirmado,0)*100),10001);
 assert.deepEqual(parciais.map(p=>p.nota),inteiras.map(p=>p.nota));
});

function tela(fonte){
 const c={STORE:{getCFG:()=>({performancePCP:{equipes:[],criterios:pesos}}),getAllOS:()=>[]},STATE:{user:{papel:'pcp'},_perfPessoaMedida:'nota'},
 periodoOuMes:()=>({de:'2026-09-01',ate:'2026-09-19'}),nomeExibicaoCasa:n=>({chave:n,nome:n}),pessoasRH:()=>[],avatarRH:()=>'',esc:s=>String(s??''),dinheiroCasa:n=>'R$ '+n};
 vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(__dirname,'..','performance.js'),'utf8'),c);
 c.__fonte=fonte;vm.runInContext('perfFonteAtual=()=>__fonte;',c);
 return c;
}
test('tela e PDF usam valor na nota atual e preservam a régua dos fechamentos antigos',()=>{
 const regs=[registro('a','Ana',10000),registro('b','Bia',2500),registro('c','Bia',2500)];
 const atual=tela({regraNota:P.REGRA_NOTA_VALOR,criterios:pesos}).perfRankingPessoasHTML(regs,{equipes:[]});
 assert.match(atual,/Valor entregue 60%/);
 assert.match(atual,/1º lugar:\s*<\/span>Ana/);
 assert.match(atual,/metade do valor do líder soma 30 pontos/);
 const antiga=tela({fechadoEm:'2026-09-20',regra:'performance-3',criterios:pesos}).perfRankingPessoasHTML(regs,{equipes:[]});
 assert.match(antiga,/Produção 60%/);
 assert.match(antiga,/1º lugar:\s*<\/span>Bia/);
 const nova=tela({fechadoEm:'2026-10-03',regraNota:P.REGRA_NOTA_VALOR,criterios:pesos}).perfRankingPessoasHTML(regs,{equipes:[]});
 assert.match(nova,/Valor entregue 60%/);
 assert.match(nova,/1º lugar:\s*<\/span>Ana/);
});

test('servidor sela a régua de valor no hash sem reescrever revisões antigas',async()=>{
 const periodo={de:'2026-09-01',ate:'2026-09-19'},who={papel:'pcp',nome:'Gestor fictício'};
 const dados={pcp_registros:[{colecao:'os',id:'000001',apagado:false,atualizado_em:'2020-01-01',registro:{id:'000001',numero:'1',tipo:'externo',cliente:'Teste',finalizadaEm:'2026-09-10T14:00:00Z',equipe:['Ana'],valorTotal:100}}],pcp_config_global:[{id:true,atualizado_em:'2020-01-01',config:{performancePCP:{equipes:[],criterios:pesos,participacoes:[{id:'000001',membros:[membro('Ana')],por:'Gestor',em:'2026-09-11'}]}}}],painel_ordens:[]};
 const e=await edge('pcp-sync',dados);
 const anterior=await e.call({action:'performancePeriodo',...periodo},who);
 const antiga=await e.call({action:'performanceFechar',...periodo,hash:anterior.hash,requestId:'nota-antiga-001',motivo:'Revisão anterior'},who);
 assert.equal(antiga.ok,true);
 const atual=await e.call({action:'performancePeriodo',...periodo,notaPorValor:true},who);
 assert.equal(atual.regraNota,P.REGRA_NOTA_VALOR);
 assert.notEqual(atual.hash,anterior.hash);
 const req={action:'performanceFechar',...periodo,notaPorValor:true,anterior:antiga.fechamento.id,requestId:'nota-valor-0001',motivo:'Revisão por valor entregue'};
 assert.equal((await e.call({...req,hash:anterior.hash},who)).status,409);
 const fechou=await e.call({...req,hash:atual.hash},who);
 assert.equal(fechou.ok,true);
 assert.equal(fechou.fechamento.regraNota,P.REGRA_NOTA_VALOR);
 const hist=await e.call({action:'performanceFechamentos',...periodo},who);
 assert.equal(hist.fechamentos[1].regraNota,undefined);
 assert.equal(hist.fechamentos[1].hash,anterior.hash);
});
