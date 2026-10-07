const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=process.env.PERF_AUDIT_SOURCE || require.resolve('../performance.js');
const P=require(source);
const m=(chave,percentual=100)=>({chave,nome:chave,percentual});
const r=(id,extra={})=>({id,confirmado:true,valor:100,membros:[m('Ana')],...extra});
function tela(medida='peso'){
 const c={STORE:{getCFG:()=>({performancePCP:{equipes:[]}}),getAllOS:()=>[]},STATE:{user:{papel:'pcp'},_perfPessoaMedida:medida},periodoOuMes:()=>({de:'2026-10-01',ate:'2026-10-07'}),nomeExibicaoCasa:n=>({chave:n,nome:n}),pessoasRH:()=>[],avatarRH:()=>'',esc:s=>String(s??'').replace(/"/g,'&quot;'),dinheiroCasa:n=>'R$ '+n};
 vm.createContext(c);vm.runInContext(fs.readFileSync(source,'utf8'),c);return c;
}
test('individual: sugestão volumosa não ultrapassa produção confirmada e detalhamento usa a mesma base',()=>{
 const regs=[r('a'),...Array.from({length:10},(_,i)=>r('p'+i,{confirmado:false,membros:[m('Pendente')]}))];
 const html=tela().perfRankingPessoasHTML(regs,{equipes:[]});
 assert.match(html,/1º lugar: <\/span>Ana/);
 assert.doesNotMatch(html,/2º lugar: <\/span>Pendente/);
 assert.match(html,/data-perf-fonte-medida="producao" data-perf-pessoa="Ana"/);
 assert.match(html,/fora deste ranking/);
});
test('individual: parcial sem fração conhecida não vira O.S. inteira e peso não é arredondado antes de ordenar',()=>{
 const regs=[r('a',{fracaoOS:.304}),r('b',{membros:[m('Bia')],fracaoOS:.301}),r('c',{membros:[m('Caio')],entregaId:'c'})];
 const html=tela().perfRankingPessoasHTML(regs,{equipes:[]});
 assert.match(html,/1º lugar: <\/span>Ana/);assert.match(html,/2º lugar: <\/span>Bia/);
 assert.doesNotMatch(html,/lugar: <\/span>Caio/);
 assert.match(html,/parciais sem base/);
 const av=P.avaliarGeral(regs,{producao:100,limpeza:0,equipamentos:0},{porValor:true});
 assert.equal(av.pessoas.find(p=>p.nome==='Caio').geral,null,'falta de fração não pode virar nota zero de produção');
});
const compartilhada=()=>r('juntas',{valor:1000,fracaoOS:.5,entregaId:'parcial',membros:[m('Ana',50),m('Bia',30),m('Caio',20)],grupos:[
 {equipeId:'aguia',equipeNome:'Águia',cota:5000,membros:['Ana']},
 {equipeId:'touro',equipeNome:'Touro',cota:3000,membros:['Bia']},
 {equipeId:null,cota:2000,membros:['Caio']}
]});
test('equipes, composição e pessoas conservam o dinheiro sem transferir avulsos',()=>{
 const rs=[compartilhada(),r('propria',{valor:200,equipeId:'aguia',equipeNome:'Águia'}),r('pendente',{confirmado:false})],antes=JSON.stringify(rs);
 const grupos=P.resumir(rs.filter(x=>x.confirmado)).equipes;
 assert.equal(grupos.find(x=>x.chave==='aguia').valor,700);
 assert.equal(grupos.find(x=>x.chave==='touro').valor,300);
 assert.equal(grupos.find(x=>x.chave==='avulsa:Caio').valor,200);
 const composicoes=P.resumir(P.registrosPorComposicao(rs.filter(x=>x.confirmado))).equipes;
 assert.equal(composicoes.length,2);assert.equal(composicoes.reduce((s,x)=>s+x.valor,0),1200);
 assert.equal(composicoes.find(x=>x.nome==='Águia + Touro + Caio').valor,1000);
 assert.equal(composicoes.reduce((s,x)=>s+x.equivalentes,0),1.5);
 assert.deepEqual(P.coberturaEquipes(rs),{total:2,vinculadas:1,comAvulsos:1,valorVinculado:1000,valorAvulso:200,semValor:0});
 assert.equal(JSON.stringify(rs),antes);
});
test('composição estável por IDs, sem confundir mesmo elenco com vínculos diferentes',()=>{
 const a=compartilhada(),b=structuredClone(a);b.grupos.reverse();b.membros.reverse();
 assert.equal(P.chaveComposicao(a),P.chaveComposicao(b));
 b.grupos[1].equipeId='outra';assert.notEqual(P.chaveComposicao(a),P.chaveComposicao(b));
});
test('telas separam fixas de avulsos e oferecem revisão, sem criar equipe nova a partir da composição',()=>{
 const rs=[compartilhada()],c=tela();
 const fixas=c.perfRankingEquipesHTML(rs,{equipes:[]},'equipes');
 assert.match(fixas,/R\$ 500/);assert.match(fixas,/R\$ 300/);
 assert.doesNotMatch(fixas,/data-perf-grupo="avulsa:Caio"/);
 assert.match(fixas,/data-perf-filtrar="avulsos"/);
 const comp=c.perfRankingEquipesHTML(rs,{equipes:[]},'composicoes');
 assert.match(comp,/Águia \+ Touro \+ Caio/);assert.match(comp,/R\$ 1000/);
 assert.match(comp,/data-perf-composicao=/);assert.doesNotMatch(comp,/data-perf-nomear|id="perf-nova-equipe"/);
});
test('cadastro atual oferece apenas hipótese de vínculo; composições ambíguas não são atribuídas',()=>{
 const c=tela(),regs=[r('avulsa',{membros:[m('Ana',50),m('Bia',50)]})];
 const equipes=[{id:'a',nome:'Águia',membros:[{chave:'Ana',nome:'Ana'}]},{id:'b',nome:'Touro',membros:[{chave:'Bia',nome:'Bia'}]}];
 // Este teste usa nomes fictícios como IDs, sem exigir consulta ao RH.
 c.perfIdMembro=m=>m.chave;
 const antes=JSON.stringify(regs),html=c.perfRankingEquipesHTML(regs,{equipes},'composicoes');
 assert.match(html,/Possível vínculo: Águia \+ Touro/);assert.match(html,/confirme na entrega antes de vincular/);
 assert.match(html,/1º lugar: <\/span>Ana \+ Bia/);assert.equal(JSON.stringify(regs),antes);
 const ambigua=c.perfRankingEquipesHTML(regs,{equipes:[...equipes,{id:'c',nome:'Outra',membros:[{chave:'Ana',nome:'Ana'}]}]},'composicoes');
 assert.doesNotMatch(ambigua,/Possível vínculo:/);
});
