const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../performance.js');
const {edge}=require('./helpers/edge.cjs');
const pessoas=n=>Array.from({length:n},(_,i)=>({chave:String(i),nome:'Pessoa '+i}));
test('divisão igual conserva 100% com três ou sete pessoas e deduplica identidades',()=>{
 for(const n of [1,3,7,23]){const ps=P.iguais(pessoas(n));assert.equal(P.validar(ps),'');assert.ok(Math.abs(ps.reduce((s,p)=>s+p.percentual,0)-100)<0.001);}
 assert.equal(P.iguais([...pessoas(2),...pessoas(2)]).length,2);
});
test('apuração não duplica valor da O.S. e separa participação de contagem',()=>{
 const membros=P.iguais(pessoas(2));const r=P.resumir([{id:'1',equipeId:'e',equipeNome:'Equipe',valor:100,membros},{id:'2',valor:null,membros:[{...membros[0],percentual:100}]}]);
 assert.equal(r.pessoas.reduce((s,p)=>s+p.valor,0),100);
 assert.equal(r.pessoas[0].equivalentes,1.5);assert.equal(r.pessoas[0].os,2);assert.equal(r.pessoas[0].semValor,1);
 assert.equal(r.equipes[0].os,1);assert.equal(r.equipes[0].valor,100);
});
test('percentuais inválidos e duplicidades não passam',()=>{
 assert.ok(P.validar([{chave:'a',nome:'A',percentual:80}]));
 assert.ok(P.validar([{chave:'a',nome:'A',percentual:NaN}]));
 assert.ok(P.validar([{chave:'a',nome:'A',percentual:50},{chave:'a',nome:'A',percentual:50}]));
});
test('servidor permite apuração pelo PCP, recusa total inválido e carimba autor real',async()=>{
 const base={performancePCP:{equipes:[],participacoes:[]}};
 const e=await edge('pcp-sync',{pcp_config_global:[{id:true,config:base,atualizado_em:'2026-09-19T10:00:00Z'}]});
 const cfg={performancePCP:{equipes:[],participacoes:[{id:'os1',membros:P.iguais(pessoas(2)),por:'Autor forjado'}]}};
 const r=await e.call({action:'setCfg',baseCfg:base,cfg},{papel:'pcp',nome:'Responsável'});
 assert.equal(r.ok,true);assert.equal(r.cfg.performancePCP.participacoes[0].por,'Responsável');
 const invalido=structuredClone(r.cfg);invalido.performancePCP.participacoes[0].membros[0].percentual=80;
 assert.equal((await e.call({action:'setCfg',baseCfg:r.cfg,cfg:invalido},{papel:'pcp'})).status,422);
});
test('mudar equipe não reescreve a composição e percentuais da entrega confirmada',async()=>{
 const membros=P.iguais(pessoas(2));
 const base={performancePCP:{equipes:[{id:'e',nome:'Horizonte',emblema:'🦅',membros:pessoas(2)}],participacoes:[{id:'os1',equipeId:'e',equipeNome:'Horizonte',membros,por:'Gestor',em:'2026-09-19T10:00:00Z'}]}};
 const e=await edge('pcp-sync',{pcp_config_global:[{id:true,config:base,atualizado_em:'2026-09-19T10:00:00Z'}]});
 const cfg=structuredClone(base);cfg.performancePCP.equipes[0].nome='Novo nome';cfg.performancePCP.equipes[0].membros=pessoas(3);
 const r=await e.call({action:'setCfg',baseCfg:base,cfg},{papel:'pcp'});
 assert.equal(r.ok,true);assert.deepEqual(r.cfg.performancePCP.participacoes,base.performancePCP.participacoes);
});

test('confirmação é contada por entrega, sem transformar sugestão em dado confirmado',()=>{
 const membros=P.iguais(pessoas(2));
 const regs=[{id:'1',valor:200,membros,confirmado:true},{id:'2',valor:100,membros,confirmado:false}];
 const tudo=P.resumir(regs), confirmado=P.resumir(regs.filter(r=>r.confirmado));
 assert.equal(tudo.pessoas[0].os,2);assert.equal(tudo.pessoas[0].confirmadas,1);
 assert.equal(tudo.equipes[0].confirmadas,1);
 assert.equal(confirmado.pessoas.reduce((s,p)=>s+p.valor,0),200);
 assert.equal(P.resumir([{valor:500,membros:[],confirmado:false}]).pessoas.length,0);
});
