const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const P=require('../performance.js');
const {edge}=require('./helpers/edge.cjs');
const membro=n=>({chave:n,nome:n,percentual:100});
const reg=(id,nome,valor,fracaoOS=1)=>({id,numero:id,membros:[membro(nome)],confirmado:true,valor,fracaoOS,os:{id,numero:id}});
const valores=[8417.24,7000,2965,2711.84,1650,503.4];
const nomes=['Adriano + Osmane + Lucas','Pantera + Reinaldo','Águia','Adlando + Hélio','Adriano','Osmane'];
const regs=valores.map((v,i)=>reg(String(i),nomes[i],v,i===3?2:i===5?.06:1));
function tela(){const c={STORE:{getCFG:()=>({performancePCP:{equipes:[]}}),getAllOS:()=>[]},STATE:{user:{papel:'pcp'}},periodoOuMes:()=>({de:'2026-10-01',ate:'2026-10-03'}),nomeExibicaoCasa:n=>({chave:n,nome:n}),pessoasRH:()=>[],avatarRH:()=>'',esc:s=>String(s??''),dinheiroCasa:v=>'R$ '+Number(v).toFixed(2)};vm.createContext(c);vm.runInContext(fs.readFileSync(require.resolve('../performance.js'),'utf8'),c);return c;}
test('equipes abrem por valor: caso da captura tem seis posições distintas e dinheiro em destaque',()=>{
 const c=tela(),html=c.perfRankingEquipesHTML(regs,{equipes:[]});
 assert.match(html,/Valor confirmado · opções/);
 assert.deepEqual([...html.matchAll(/<h4(?: class="perf-podio-nome")?>(?:<span class="perf-sr">\d+º lugar: <\/span>)?([^<]+)<\/h4>/g)].map(m=>m[1]),nomes);
 assert.equal((html.match(/1º lugar/g)||[]).length,1);
 assert.match(html,/<strong>R\$ 8417.24<\/strong>/);
 assert.match(html,/R\$ 1417.24\s+até a liderança/);
 assert.match(html,/Valores iguais até os centavos/);
});
test('valor por equipe exclui pendência, ausência e conflito; empate só pelo mesmo centavo',()=>{
 const c=tela(),rs=[reg('a','A',500),reg('b','B',500),{...reg('c','C',90000),confirmado:false},{...reg('d','D',80000),avisoValor:'Conflito'},reg('e','E',null)];
 const html=c.perfRankingEquipesHTML(rs,{equipes:[]});
 assert.equal((html.match(/1º lugar/g)||[]).length,2);
 assert.doesNotMatch(html,/R\$ 90000|R\$ 80000/);
 assert.match(html,/3 equipes com entrega mas sem valor confirmado/);
});
test('funcionários têm a mesma ordem por valor sem receber dinheiro, comissão ou cliente',async()=>{
 const {rankingEquipeSeguro}=await import('../supabase/functions/_shared/pcp-ranking-publico.mjs');
 const r=rankingEquipeSeguro({registros:regs},[],null,true);
 assert.deepEqual(r.equipes.map(e=>e.nome),nomes);
 assert.deepEqual(r.equipes.map(e=>e.posicao),[1,2,3,4,5,6]);
 assert.ok(r.equipes.every(e=>e.faltaLideranca===null));
 assert.doesNotMatch(JSON.stringify(r),/8417|7000|centavos|comValor|comissao|membros/);
 const parcial={...reg('p','A',100.01,.2),membros:[{...membro('A'),percentual:60},{...membro('B'),percentual:40}],grupos:[{equipeId:'a',equipeNome:'A',cota:6000,membros:['A']},{equipeId:'b',equipeNome:'B',cota:4000,membros:['B']}]};
 const rs=[parcial,reg('c','C',50),reg('n','N',null),{...reg('x','X',999),avisoValor:'Conflito'}];
 const f=rankingEquipeSeguro({registros:rs},[],null,true);
 assert.deepEqual(f.equipes.map(e=>e.nome),['A','C','B']);
 const admin=P.ranquear(P.resumir(rs.slice(0,2)).equipes,x=>Math.round(x.valor*100));
 assert.deepEqual(f.equipes.map(e=>e.nome),admin.map(e=>e.nome));
});
test('cache separa nova ordem por valor da consulta antiga por produção sem gravar',async()=>{
 const periodo={de:'2026-09-01',ate:'2026-09-30'};
 const os=[{id:'a',nome:'A',valor:100},{id:'a2',nome:'A',valor:100},{id:'b',nome:'B',valor:1000}];
 const e=await edge('pcp-sync',{pcp_registros:os.map(o=>({id:o.id,colecao:'os',apagado:false,registro:{id:o.id,numero:o.id,tipo:'externo',finalizadaEm:'2026-09-10T14:00:00Z',equipe:[o.nome],valorTotal:o.valor}})),pcp_config_global:[{id:true,config:{performancePCP:{equipes:[],participacoes:os.map(o=>({id:o.id,membros:[membro(o.nome)],por:'Gestor',em:'2026-09-11'}))}}}],painel_ordens:[]});
 e.cliente.beforeWrite=()=>{throw Error('Somente leitura');};
 const quem={papel:'montagem'};
 const a=await e.call({action:'performanceRankingEquipe',...periodo},quem);
 const b=await e.call({action:'performanceRankingEquipe',...periodo,ordemValor:true},quem);
 assert.equal(a.equipes[0].nome,'A');assert.equal(b.equipes[0].nome,'B');
 assert.equal(b.criterio,'valor-confirmado');
 assert.deepEqual(await e.call({action:'performanceRankingEquipe',...periodo},quem),a);
});

test('serviços próprios e compartilhados acumulam nas equipes de origem sem duplicar valor ou participação',async()=>{
 const {rankingEquipeSeguro}=await import('../supabase/functions/_shared/pcp-ranking-publico.mjs');
 const equipes=[{id:'a',nome:'Águia',membros:[membro('Ana')]},{id:'b',nome:'Leão',membros:[membro('Bia')]}];
 const propria={...reg('propria','Ana',1000),equipeId:'a',equipeNome:'Águia'};
 const parcial={...reg('compartilhada','Ana',10000,.5),entregaId:'parcial',membros:[{...membro('Ana'),percentual:60},{...membro('Bia'),percentual:40}],grupos:[{equipeId:'a',equipeNome:'Águia',cota:6000,membros:['Ana']},{equipeId:'b',equipeNome:'Leão',cota:4000,membros:['Bia']}]};
 const entrada=[propria,parcial],antes=JSON.stringify(entrada);
 const resumo=P.resumir(P.comEquipes(entrada,equipes));
 assert.equal(resumo.equipes.length,2,'não cria terceira equipe para a composição compartilhada');
 const a=resumo.equipes.find(x=>x.chave==='a'),b=resumo.equipes.find(x=>x.chave==='b');
 assert.equal(a.valor,7000);assert.equal(b.valor,4000);
 assert.equal(a.equivalentes,1.3);assert.equal(b.equivalentes,.2);
 assert.equal(a.valor+b.valor,11000);assert.equal(a.equivalentes+b.equivalentes,1.5);
 const publico=rankingEquipeSeguro({registros:entrada},equipes,null,true);
 assert.deepEqual(publico.equipes.map(x=>[x.nome,x.equivalentes]),[['Águia',1.3],['Leão',.2]]);
 assert.equal(publico.resumo.entregasConfirmadas,2,'serviço compartilhado é uma entrega na apuração geral');
 assert.equal(publico.resumo.equivalentes,1.5);
 const avulsa={...reg('sem-vinculo','Ana',500),membros:[membro('Ana')]};
 assert.equal(P.comEquipes([avulsa],equipes)[0].equipeId,undefined,'não altera vínculo histórico só pelo cadastro atual');
 assert.equal(JSON.stringify(entrada),antes,'conferência não regrava registros');
});
