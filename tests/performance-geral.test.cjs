const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const P=require('../performance.js');
const pesos={producao:60,limpeza:20,equipamentos:20};
const registro=(id,nome,valor,extra={})=>({id,membros:[{chave:nome,nome,percentual:100}],valor,confirmado:true,retornoConf:{carroLimpo:'sim',equipamentosOk:'sim'},...extra});
const base=()=>[registro('a','Ana',10000),registro('b','Bia',2500),registro('c','Bia',2500)];

test('Geral combina a Nota preservada com produção e valor na escala de 0 a 100',()=>{
 const regs=base(),antes=structuredClone(regs);
 const r=P.avaliarGeral(regs,pesos,{porValor:true});
 const ana=r.pessoas.find(p=>p.nome==='Ana'),bia=r.pessoas.find(p=>p.nome==='Bia');
 assert.deepEqual(ana.componentesGeral,{nota:100,producao:50,valor:100});
 assert.equal(ana.geral,83.3);assert.equal(bia.geral,73.3);
 assert.equal(ana.nota,100);assert.equal(bia.nota,70);
 assert.deepEqual(regs,antes);
});

test('Geral mantém os pesos configurados dentro da Nota',()=>{
 const r=P.avaliarGeral(base(),{producao:80,limpeza:10,equipamentos:10},{porValor:true});
 const bia=r.pessoas.find(p=>p.nome==='Bia');
 assert.equal(bia.nota,60);assert.equal(bia.geral,70);
});

test('Geral não concede pontos nem liderança a participação pendente ou valor inválido',()=>{
 const regs=[...base(),registro('d','Davi',100000,{confirmado:false}),registro('e','Eva',null),registro('f','Fábio',999999,{avisoValor:'Conflito'})];
 const r=P.avaliarGeral(regs,pesos,{porValor:true});
 for(const nome of ['Davi','Eva','Fábio'])assert.equal(r.pessoas.find(p=>p.nome===nome).geral,null,nome);
 assert.equal(r.pessoas.find(p=>p.nome==='Ana').geral,83.3);
});

test('Geral respeita rateio e entregas parciais, sem contar aparições como produção',()=>{
 const membros=[{chave:'Ana',nome:'Ana',percentual:60},{chave:'Bia',nome:'Bia',percentual:40}];
 const inteiro=P.avaliarGeral([registro('a','Ana',1000,{membros})],pesos,{porValor:true});
 const parcial=P.avaliarGeral([registro('a1','Ana',400,{membros,fracaoOS:.4}),registro('a2','Ana',600,{membros,fracaoOS:.6})],pesos,{porValor:true});
 assert.deepEqual(parcial.pessoas.map(p=>p.geral),inteiro.pessoas.map(p=>p.geral));
 assert.equal(parcial.pessoas[1].componentesGeral.producao,66.7);
});

test('Geral distingue valor zero confirmado de ausência e mantém empates',()=>{
 const r=P.avaliarGeral([registro('a','Ana',0),registro('b','Bia',0),registro('c','Caio',null)],pesos,{porValor:true});
 assert.equal(r.pessoas[0].geral,46.7);assert.equal(r.pessoas[1].geral,46.7);assert.equal(r.pessoas[2].geral,null);
 const ranking=P.ranquear(r.pessoas.filter(p=>p.geral!=null),p=>p.geral);
 assert.deepEqual(ranking.map(p=>p.posicao),[1,1]);
});

function tela(medida,fonte=null){
 const c={STORE:{getCFG:()=>({performancePCP:{equipes:[],criterios:pesos}}),getAllOS:()=>[]},STATE:{user:{papel:'pcp'},_perfPessoaMedida:medida},periodoOuMes:()=>({de:'2026-10-01',ate:'2026-10-06'}),nomeExibicaoCasa:n=>({chave:n,nome:n}),pessoasRH:()=>[],avatarRH:()=>'',esc:s=>String(s??''),dinheiroCasa:n=>'R$ '+n};
 vm.createContext(c);vm.runInContext(fs.readFileSync(require.resolve('../performance.js'),'utf8'),c);
 c.__fonte=fonte;vm.runInContext('perfFonteAtual=()=>__fonte;',c);return c;
}
test('tela acrescenta Geral, conserva as três opções e explica a média no pódio e PDF',()=>{
 const html=tela('geral').perfRankingPessoasHTML(base(),{equipes:[]});
 for(const nome of ['Nota','Produção','Valor','Geral'])assert.match(html,new RegExp('>'+nome+'</button>'));
 assert.match(html,/aria-pressed="true" data-perf-pessoa-medida="geral"/);
 assert.match(html,/83,3/);assert.match(html,/Como o Geral é calculado/);
 assert.match(html,/Nota \+ Produção \+ Valor/);assert.match(html,/um terço/);
 assert.doesNotMatch(html,/style=/);
 const antiga=tela('nota').perfRankingPessoasHTML(base(),{equipes:[]});
 assert.match(antiga,/Valor entregue 60%/);assert.match(antiga,/1º lugar:\s*<\/span>Ana/);
});

test('Geral consulta a Nota histórica sem mudar os pesos ou a régua da revisão fechada',()=>{
 const fonte={fechadoEm:'2026-09-20',criterios:{producao:100,limpeza:0,equipamentos:0},regra:'performance-3'};
 const html=tela('geral',fonte).perfRankingPessoasHTML(base(),{equipes:[]});
 assert.match(html,/83,3/);assert.match(html,/66,7/);
 assert.doesNotMatch(html,/id="perf-criterios"/);
 assert.match(html,/pesos desta revisão/);
});
