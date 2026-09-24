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

test('filtro por identidade não confunde nome de cliente nem homônimos',()=>{
 const membros=[{chave:'rh-1',nome:'Ana Silva',percentual:100}];
 assert.equal(P.incluiPessoa(membros,'rh-1'),true);
 assert.equal(P.incluiPessoa(membros,'rh-2'),false);
 assert.equal(P.incluiPessoa(membros,''),true);
});
test('alterar integrantes preserva percentuais e exige acertar o total explicitamente',()=>{
 const old=[{chave:'a',nome:'A',percentual:70},{chave:'b',nome:'B',percentual:30}];
 const next=P.manterPesos(old,[old[0],{chave:'c',nome:'C'}]);
 assert.equal(next[0].percentual,70);assert.equal(next[1].percentual,0);
 assert.ok(P.validar(next));assert.equal(P.validar(P.iguais(next)),'');
});
test('cards e relatório usam somente valor confirmado e filtro de período é único',()=>{
 const fs=require('fs'),vm=require('vm');
 const src=fs.readFileSync(require.resolve('../performance.js'),'utf8');
 const regs=[{id:'1',numero:'1',cliente:'Teste',valorTotal:100,equipe:['Ana']},{id:'2',numero:'2',cliente:'Outro',valorTotal:200,equipe:['Ana']}];
 const membros=[{chave:'a',nome:'Ana',percentual:100}];
 // O ranking individual abre pela nota; a regra "só valor confirmado" vale na
 // medida Valor, que é onde o dinheiro aparece.
 const c={STORE:{getCFG:()=>({performancePCP:{equipes:[],participacoes:[{id:'1',membros}]}}),getAllOS:()=>regs},STATE:{user:{papel:'leitura'},_perfPessoaMedida:'valor'},periodoOuMes:()=>({de:'2026-09-01',ate:'2026-09-19'}),classificarEntregas:os=>({instalacoes:os}),OPERACAO:{emIntervalo:()=>true,equipe:os=>os.equipe},diaEntrega:()=> '2026-09-19',valorDaOS:o=>o.valorTotal,nomeExibicaoCasa:()=>({chave:'a',nome:'Ana'}),pessoasRH:()=>[],avatarRH:()=>'',esc:s=>String(s??''),dinheiroCasa:n=>'VALOR-'+n,filtroPeriodoHTML:()=>''};
 vm.createContext(c);vm.runInContext(src,c);
 const cards=c.performanceEquipesHTML(),report=c.performanceRelatorioHTML();
 assert.ok(cards.includes('VALOR-100'));assert.ok(report.includes('VALOR-100'));
 assert.ok(!cards.includes('VALOR-300'));assert.ok(!report.includes('VALOR-300'));
 const casa=fs.readFileSync(require.resolve('../casa.js'),'utf8');
 const prod=casa.slice(casa.indexOf('function produtividadeHTML()'),casa.indexOf('/* ── Retrabalho cruzado'));
 assert.ok(!prod.includes("filtroPeriodoHTML('_fPerf')"));
});

test('dossiê de equipe usa participantes de cada entrega, avulsos e valores só confirmados',()=>{
 const a={chave:'a',nome:'Ana',percentual:60},b={chave:'b',nome:'Bia',percentual:40},c={chave:'c',nome:'Caio',percentual:40};
 const registros=[{id:'1',equipeId:'x',equipeNome:'Horizonte',membros:[a,b],confirmado:true,valor:100,os:{retrabalho:true}},{id:'2',equipeId:'x',equipeNome:'Horizonte',membros:[a,c],confirmado:false,valor:500},{id:'3',membros:[{...c,percentual:100}],confirmado:true,valor:null}];
 const [e,avulsa]=P.dossie(registros);assert.equal(e.registros.length,2);assert.equal(e.membros.length,3);assert.equal(e.valor,100);assert.equal(e.confirmadas,1);assert.equal(e.retrabalhos,1);assert.equal(e.membros.find(p=>p.chave==='a').equivalentes,.6);assert.equal(e.membros.find(p=>p.chave==='c').equivalentes,0);assert.equal(avulsa.semValor,1);assert.equal(avulsa.nome,'Composição avulsa');
});
test('dossiê não atribui equipe ou valor a percentuais inválidos',()=>{
 assert.deepEqual(P.dossie([{membros:[],valor:100,confirmado:true},{membros:[{chave:'a',nome:'Ana',percentual:80}],valor:100,confirmado:true}]),[]);
});
test('rateio conserva cada centavo, inclusive valores pequenos e ordem dos participantes',()=>{
 for(const n of [1,3,7,23]) for(const valor of [0,0.01,8.99,1256.85,-8.99]) {
  const membros=P.iguais(pessoas(n));
  const resumo=P.resumir([{valor,membros,confirmado:true}]);
  assert.equal(resumo.pessoas.reduce((s,p)=>s+Math.round(p.valor*100),0),Math.round(valor*100));
  const invertido=P.resumir([{valor,membros:[...membros].reverse(),confirmado:true}]);
  assert.deepEqual(Object.fromEntries(resumo.pessoas.map(p=>[p.chave,p.valor])),Object.fromEntries(invertido.pessoas.map(p=>[p.chave,p.valor])));
 }
});

/* ---------------- Ranking e equipes nomeadas (23/09/2026) ----------------
   Pedido do dono: nome e logo nas equipes e um ranking. O risco não é a soma —
   é o ranking afirmar diferença que não existe, ou nomear a equipe errada. */

test('ranking: empate divide a posição e a próxima pula (1, 1, 3)', () => {
  const r = P.ranquear([{nome:'B',os:6},{nome:'A',os:6},{nome:'C',os:4},{nome:'D',os:1}], x => x.os);
  assert.equal(r.map(x => x.posicao).join(','), '1,1,3,4');
  // Dentro do empate, ordem alfabética — só para a tela ser estável, não é mérito.
  assert.equal(r[0].nome, 'A');
});

test('equipe nomeada: composição EXATA de uma equipe ativa passa a ter o nome dela', () => {
  const a = {chave:'1',nome:'Adriano'}, d = {chave:'2',nome:'Douglas'}, j = {chave:'3',nome:'José'};
  const salvas = [{id:'eq1',nome:'Horizonte',emblema:'🦅',membros:[d,a],ativo:true}];
  const [igual, maior] = P.comEquipes([
    {id:'os1',membros:P.iguais([a,d])},
    {id:'os2',membros:P.iguais([a,d,j])},
  ], salvas);
  assert.equal(igual.equipeId, 'eq1', 'mesmos integrantes, em outra ordem, são a mesma equipe');
  assert.equal(igual.equipeNome, 'Horizonte');
  assert.equal(maior.equipeId, undefined, 'com uma pessoa a mais não é a mesma equipe');
});

test('equipe desativada não captura composição nova, mas continua dona do histórico', () => {
  const a = {chave:'1',nome:'A'}, b = {chave:'2',nome:'B'};
  const salvas = [{id:'velha',nome:'Antiga',emblema:'🦁',membros:[a,b],ativo:false}];
  const [semId, comId] = P.comEquipes([
    {id:'os1',membros:P.iguais([a,b])},
    {id:'os2',equipeId:'velha',equipeNome:'Antiga',membros:P.iguais([a,b])},
  ], salvas);
  assert.equal(semId.equipeId, undefined, 'desativada não nomeia entrega nova');
  assert.equal(comId.equipeId, 'velha', 'entrega confirmada com ela não perde o nome');
});

test('ranking por equipe soma a composição avulsa e a confirmada na MESMA linha', () => {
  const a = {chave:'1',nome:'A'}, b = {chave:'2',nome:'B'};
  const salvas = [{id:'eq',nome:'Dupla',emblema:'🚀',logo:'data:image/png;base64,AAAA',membros:[a,b],ativo:true}];
  const regs = P.comEquipes([
    {id:'os1',membros:P.iguais([a,b]),valor:100},
    {id:'os2',equipeId:'eq',membros:P.iguais([a,b]),valor:50,confirmado:true},
  ], salvas);
  const eqs = P.resumir(regs).equipes;
  assert.equal(eqs.length, 1, 'sem a regra, a mesma dupla viraria duas linhas no ranking');
  assert.equal(eqs[0].os, 2);
  assert.equal(eqs[0].nome, 'Dupla');
  assert.equal(eqs[0].logo, 'data:image/png;base64,AAAA');
  assert.equal(eqs[0].salva, true);
});

test('o registro original não é alterado ao nomear para exibir', () => {
  const a = {chave:'1',nome:'A'};
  const original = {id:'os1',membros:P.iguais([a])};
  P.comEquipes([original], [{id:'e',nome:'Solo',emblema:'🎯',membros:[a],ativo:true}]);
  assert.equal(original.equipeId, undefined, 'o que alimenta a apuração e o fechamento fica intocado');
});

test('servidor: logo pequeno em PNG/JPEG/WebP passa; SVG, endereço externo e excesso não', async () => {
  const {validarPerformance} = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const base = {id:'e1',nome:'Horizonte',emblema:'🦅',membros:[{chave:'1',nome:'A'}]};
  const cfg = logo => ({equipes:[{...base,logo}],participacoes:[]});
  for (const t of ['png','jpeg','webp']) assert.equal(validarPerformance(cfg(`data:image/${t};base64,AAAA`)), '', t);
  assert.ok(validarPerformance(cfg('data:image/svg+xml;base64,AAAA')), 'SVG carrega script');
  assert.ok(validarPerformance(cfg('https://exemplo.com/logo.png')), 'endereço externo não');
  assert.ok(validarPerformance(cfg('data:image/png;base64,' + 'A'.repeat(41000))), 'acima de 40 KB');
  assert.ok(validarPerformance(cfg('data:image/png;base64,AA"><script>')), 'caractere fora do base64');
  // Sem logo continua valendo, com o emblema.
  assert.equal(validarPerformance({equipes:[base],participacoes:[]}), '');
});

test('servidor: a soma dos logos tem teto, porque a configuração desce para todo tablet', async () => {
  const {validarPerformance} = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const logo = 'data:image/png;base64,' + 'A'.repeat(39000);
  const equipes = Array.from({length:11}, (_, i) => ({id:'e'+i,nome:'Equipe '+i,emblema:'🦅',logo,membros:[{chave:String(i),nome:'P'+i}]}));
  assert.match(validarPerformance({equipes,participacoes:[]}), /400 KB/);
  assert.equal(validarPerformance({equipes:equipes.slice(0,10),participacoes:[]}), '');
});

/* O ranking na tela, com o mesmo ambiente do teste de cards acima. */
function telaRanking(cfgPerf, papel, medida) {
  const fs=require('fs'),vm=require('vm');
  const src=fs.readFileSync(require.resolve('../performance.js'),'utf8');
  const c={STORE:{getCFG:()=>({performancePCP:cfgPerf}),getAllOS:()=>[]},STATE:{user:{papel},_perfRankMedida:medida},
    periodoOuMes:()=>({de:'2026-09-01',ate:'2026-09-19'}),classificarEntregas:os=>({instalacoes:os}),OPERACAO:{emIntervalo:()=>true,equipe:os=>os.equipe||[]},
    diaEntrega:()=>'2026-09-19',valorDaOS:o=>o.valorTotal,nomeExibicaoCasa:n=>({chave:n,nome:n}),pessoasRH:()=>[],avatarRH:()=>'',
    esc:s=>String(s??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])),dinheiroCasa:n=>'VALOR-'+n,filtroPeriodoHTML:()=>''};
  vm.createContext(c);vm.runInContext(src,c);
  return c;
}
const A={chave:'a',nome:'Ana'},B={chave:'b',nome:'Bia'},C={chave:'c',nome:'Caio'};

test('tela: ranking por VALOR não põe equipe sem valor confirmado como zero', () => {
  const c = telaRanking({equipes:[],participacoes:[]}, 'admin', 'valor');
  const regs = [
    {id:'1',membros:P.iguais([A,B]),confirmado:true,valor:500,os:{}},
    {id:'2',membros:P.iguais([C]),confirmado:false,valor:900,os:{}},   // só sugerida
  ];
  const html = c.perfRankingEquipesHTML(regs, {equipes:[]});
  assert.match(html, /VALOR-500/);
  assert.ok(!/VALOR-900/.test(html), 'valor não confirmado não entra no ranking de valor');
  assert.ok(!/VALOR-0\b/.test(html), 'e a equipe sem confirmação não aparece como zero');
  assert.match(html, /1 equipe com entrega mas sem valor confirmado ficam fora/);
});

test('tela: composição sem nome oferece "Dar nome e logo"; quem não edita não vê o botão', () => {
  const regs = [{id:'1',membros:P.iguais([A,B]),confirmado:false,valor:100,os:{}}];
  const admin = telaRanking({equipes:[],participacoes:[]}, 'pcp', 'entregas').perfRankingEquipesHTML(regs, {equipes:[]});
  assert.match(admin, /data-perf-nomear="avulsa:a\|b"/);
  assert.match(admin, /composição sem nome/);
  const montagem = telaRanking({equipes:[],participacoes:[]}, 'montagem', 'entregas').perfRankingEquipesHTML(regs, {equipes:[]});
  assert.ok(!/data-perf-nomear/.test(montagem), 'quem entra pelo nome não cadastra equipe');
  assert.ok(!/id="perf-nova-equipe"/.test(montagem));
  assert.match(montagem, /data-perf-grupo=/, 'mas pode ver as entregas');
});

test('tela: logo só vira <img> se passar na régua do servidor; o resto cai no emblema', () => {
  const c = telaRanking({equipes:[],participacoes:[]}, 'admin', 'entregas');
  assert.match(c.perfLogoHTML({logo:'data:image/png;base64,AAAA',emblema:'🦅'}), /<img[^>]+src="data:image\/png;base64,AAAA"/);
  for (const ruim of ['data:image/svg+xml;base64,AAAA', 'javascript:alert(1)', 'https://x.com/l.png', 'data:image/png;base64,AA" onerror="x']) {
    const h = c.perfLogoHTML({logo:ruim,emblema:'🦅'});
    assert.ok(!/<img/.test(h), 'não pode virar imagem: ' + ruim);
    assert.match(h, /🦅/);
  }
});

test('tela: equipe cadastrada sem entrega no período continua à vista, para editar', () => {
  const salvas = [{id:'q',nome:'Quieta',emblema:'🛡️',membros:[C],ativo:true}];
  const html = telaRanking({equipes:salvas,participacoes:[]}, 'admin', 'entregas')
    .perfRankingEquipesHTML([{id:'1',membros:P.iguais([A,B]),confirmado:false,valor:1,os:{}}], {equipes:salvas});
  assert.match(html, /Sem entrega no período:/);
  assert.match(html, /data-perf-equipe="q"[^>]*>.*Quieta/s);
});

/* ---------------- Avaliação individual (23/09/2026) ----------------
   "O peso é individual, porque pode ter pessoa que participa de mais entregas
   compartilhadas" e "a limpeza do carro e a gestão dos equipamentos têm que
   ter peso nesse critério". Os casos ruins primeiro. */
const pe = n => ({chave:n,nome:n});

test('avaliação: quem aparece em mais entregas divididas NÃO passa quem produziu o mesmo sozinho', () => {
  // Ana: 6 entregas dividindo com Bia (50%) = 3 equivalentes. Caio: 3 sozinho = 3.
  const regs = [];
  for (let i = 0; i < 6; i++) regs.push({id:'d'+i, membros:P.iguais([pe('Ana'),pe('Bia')])});
  for (let i = 0; i < 3; i++) regs.push({id:'s'+i, membros:P.iguais([pe('Caio')])});
  const {pessoas} = P.avaliar(regs, {producao:100,limpeza:0,equipamentos:0});
  const ana = pessoas.find(p=>p.chave==='Ana'), caio = pessoas.find(p=>p.chave==='Caio');
  assert.equal(ana.entregas, 6); assert.equal(caio.entregas, 3);
  assert.equal(ana.peso, 3); assert.equal(caio.peso, 3);
  assert.equal(ana.nota, caio.nota, 'aparecer em mais entregas não é produzir mais');
});

test('avaliação: sem nenhuma volta conferida, carro e equipamentos NÃO viram zero', () => {
  const {pessoas} = P.avaliar([{id:'1', membros:P.iguais([pe('Ana')])}], P.CRITERIOS_PADRAO);
  const a = pessoas[0];
  assert.equal(a.componentes.limpeza, null);
  assert.equal(a.componentes.equipamentos, null);
  assert.equal(a.nota, 100, 'a nota usa só o que existe — produção, onde ela é a líder');
  assert.equal(a.faltam.join(','), 'limpeza,equipamentos', 'e a tela sabe que é parcial');
});

test('avaliação: a conferência pesa na mesma fração que a entrega pesou para a pessoa', () => {
  // Ana fez 75% de uma entrega com carro sujo e 100% de outra com carro limpo.
  const regs = [
    {id:'1', membros:[{...pe('Ana'),percentual:75},{...pe('Bia'),percentual:25}], retornoConf:{carroLimpo:'nao'}},
    {id:'2', membros:[{...pe('Ana'),percentual:100}], retornoConf:{carroLimpo:'sim'}},
  ];
  const {pessoas} = P.avaliar(regs, {producao:0,limpeza:100,equipamentos:0});
  const ana = pessoas.find(p=>p.chave==='Ana'), bia = pessoas.find(p=>p.chave==='Bia');
  assert.equal(ana.componentes.limpeza, 57.1, '1 de 1,75 conferido limpo');
  assert.equal(bia.componentes.limpeza, 0, 'Bia só esteve no carro sujo');
});

test('avaliação: nota composta respeita os pesos e aceita "sim"/"nao" e booleano', () => {
  const regs = [
    {id:'1', membros:P.iguais([pe('Ana')]), retornoConf:{carroLimpo:true, equipamentosOk:'nao'}},
    {id:'2', membros:P.iguais([pe('Ana')]), retornoConf:{carroLimpo:'sim', equipamentosOk:false}},
  ];
  const {pessoas} = P.avaliar(regs, {producao:60,limpeza:20,equipamentos:20});
  // produção 100 (líder), limpeza 100, equipamentos 0 -> 60+20+0 = 80
  assert.equal(pessoas[0].nota, 80);
});

test('avaliação: pesos inválidos caem no padrão, nunca numa conta torta', () => {
  assert.deepEqual({...P.criteriosValidos({producao:50,limpeza:20,equipamentos:20})}, {...P.CRITERIOS_PADRAO}, 'soma 90');
  assert.deepEqual({...P.criteriosValidos({producao:-10,limpeza:60,equipamentos:50})}, {...P.CRITERIOS_PADRAO});
  assert.deepEqual({...P.criteriosValidos({producao:70,limpeza:15,equipamentos:15})}, {producao:70,limpeza:15,equipamentos:15});
});

test('avaliação: participação inconsistente fica fora, como no resto da apuração', () => {
  const {pessoas} = P.avaliar([{id:'1', membros:[{...pe('Ana'),percentual:80}]}], P.CRITERIOS_PADRAO);
  assert.equal(pessoas.length, 0);
});

test('avaliação: não ser conferido NÃO dá vantagem — recebe a média do período', () => {
  // Ana: líder de produção, nenhuma volta conferida. Bia: mesma produção, carro
  // sujo em 1 de 2 voltas. Caio: mesma produção, tudo limpo.
  const r = (id, n, rc) => ({id, membros:P.iguais([pe(n)]), retornoConf:rc || null});
  // 4 de 5 voltas respondidas: exatamente a cobertura mínima de 80%.
  const regs = [r('a1','Ana'),
    r('b1','Bia',{carroLimpo:'sim'}), r('b2','Bia',{carroLimpo:'nao'}),
    r('c1','Caio',{carroLimpo:'sim'}), r('c2','Caio',{carroLimpo:'sim'})];
  const {pessoas, media} = P.avaliar(regs, {producao:0,limpeza:100,equipamentos:0});
  const ana = pessoas.find(p=>p.chave==='Ana'), caio = pessoas.find(p=>p.chave==='Caio');
  assert.equal(media.limpeza, 75, '3 de 4 voltas conferidas limpas');
  assert.equal(ana.componentes.limpeza, 75, 'Ana recebe a média, não 100 nem zero');
  assert.equal(ana.imputados.join(','), 'limpeza');
  assert.ok(ana.nota < caio.nota, 'quem foi conferido e estava tudo limpo fica acima de quem não foi conferido');
});

test('avaliação: marcar SÓ os carros sujos não zera todo mundo — com pouca cobertura o critério sai da nota', () => {
  // Revisão de 23/09: 30 voltas, a gestão marcou só as 2 da Bia (sujas). Antes a
  // média saía 0 e as três pessoas tiravam 60, a Bia igual a quem ninguém olhou.
  const regs = [];
  for (const n of ['Ana','Bia','Caio']) for (let i = 0; i < 10; i++) regs.push({id:n+i, membros:P.iguais([pe(n)])});
  regs.find(r=>r.id==='Bia0').retornoConf = {carroLimpo:'nao', equipamentosOk:'nao'};
  regs.find(r=>r.id==='Bia1').retornoConf = {carroLimpo:'nao', equipamentosOk:'nao'};
  const {pessoas, media, cobertura} = P.avaliar(regs, P.CRITERIOS_PADRAO);
  assert.equal(media.limpeza, null, 'sem média: 2 de 30 não representa o período');
  assert.equal(cobertura.limpeza.conferidas, 2); assert.equal(cobertura.limpeza.voltas, 30);
  assert.equal(cobertura.limpeza.ok, false);
  for (const p of pessoas) {
    assert.equal(p.nota, 100, p.nome + ' não leva 0 por conferência que não foi feita');
    assert.equal(p.faltam.join(','), 'limpeza,equipamentos');
  }
});

test('avaliação: uma única volta "não" a 25% não derruba o período inteiro para 0', () => {
  // Hugo: 1 entrega sozinho sem resposta + 1 dividida (25%) com carro sujo.
  // Edu: 8 sozinho, todas limpas, mais os 75% da dividida. 9 de 10 respondidas.
  const regs = [{id:'h1', membros:P.iguais([pe('Hugo')])},
    {id:'d', membros:[{...pe('Hugo'),percentual:25},{...pe('Edu'),percentual:75}], retornoConf:{carroLimpo:'nao'}}];
  for (let i = 0; i < 8; i++) regs.push({id:'e'+i, membros:P.iguais([pe('Edu')]), retornoConf:{carroLimpo:'sim'}});
  const {pessoas} = P.avaliar(regs, {producao:0,limpeza:100,equipamentos:0});
  const hugo = pessoas.find(p=>p.chave==='Hugo'), edu = pessoas.find(p=>p.chave==='Edu');
  // média = 8 limpos / 9 respondidos; Hugo: (0 + 1 × 8/9) / 1,25 = 71,1
  assert.equal(hugo.componentes.limpeza, 71.1, 'a volta sem resposta dele conta pela média');
  assert.ok(hugo.componentes.limpeza < edu.componentes.limpeza, 'e o carro sujo ainda pesa contra');
  assert.deepEqual([...hugo.imputados], [], 'ele teve volta conferida: não é "só média"');
});

test('avaliação: quem teve TODAS as voltas conferidas e certas fica com 100, sem puxar para a média', () => {
  const regs = [];
  for (let i = 0; i < 9; i++) regs.push({id:'e'+i, membros:P.iguais([pe('Edu')]), retornoConf:{carroLimpo:'sim'}});
  regs.push({id:'b', membros:P.iguais([pe('Bia')]), retornoConf:{carroLimpo:'nao'}});
  const {pessoas} = P.avaliar(regs, {producao:0,limpeza:100,equipamentos:0});
  assert.equal(pessoas.find(p=>p.chave==='Edu').componentes.limpeza, 100);
  assert.equal(pessoas.find(p=>p.chave==='Bia').componentes.limpeza, 0);
});

test('mesma pessoa com a chave antiga (apelido) e a nova (ficha do RH) sai numa linha só', () => {
  // 5 entregas confirmadas quando "Zé" era só apelido; 5 depois de ligar à ficha.
  const regs = [];
  for (let i = 0; i < 5; i++) regs.push({id:'v'+i, confirmado:true, membros:[{chave:'Zé', nome:'Zé', apelido:'Zé', percentual:100}]});
  for (let i = 0; i < 5; i++) regs.push({id:'n'+i, membros:[{chave:'rh-jose', nome:'José Silva', apelido:'Zé', percentual:100}]});
  const hoje = m => m.chave === 'Zé' ? {chave:'rh-jose', nome:'José Silva'} : null;
  const unidos = regs.map(r => ({...r, membros:P.unirMembros(r.membros, hoje)}));
  const {pessoas} = P.avaliar(unidos, {producao:100, limpeza:0, equipamentos:0});
  assert.equal(pessoas.length, 1, 'uma linha, não duas');
  assert.equal(pessoas[0].peso, 10); assert.equal(pessoas[0].nome, 'José Silva');
  assert.equal(regs[0].membros[0].chave, 'Zé', 'o registro guardado não muda');
});

test('dois apelidos da mesma pessoa na mesma entrega viram um, com os percentuais somados', () => {
  const membros = [{chave:'Zé', nome:'Zé', percentual:30}, {chave:'rh-jose', nome:'José Silva', percentual:20}, {chave:'Ana', nome:'Ana', percentual:50}];
  const r = P.unirMembros(membros, m => m.chave === 'Zé' ? {chave:'rh-jose', nome:'José Silva'} : null);
  assert.equal(r.length, 2);
  assert.equal(r.find(m => m.chave === 'rh-jose').percentual, 50);
  assert.equal(P.validar(r), '', 'sem isso a entrega seria recusada como "pessoa repetida"');
});

test('servidor: pesos da nota só passam como três inteiros que somam 100', async () => {
  const {validarPerformance} = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const cfg = criterios => ({equipes:[],participacoes:[],criterios});
  assert.equal(validarPerformance(cfg({producao:60,limpeza:20,equipamentos:20})), '');
  assert.equal(validarPerformance({equipes:[],participacoes:[]}), '', 'sem pesos vale o padrão');
  assert.ok(validarPerformance(cfg({producao:60,limpeza:20,equipamentos:10})), 'soma 90');
  assert.ok(validarPerformance(cfg({producao:60.5,limpeza:19.5,equipamentos:20})), 'não inteiro');
  assert.ok(validarPerformance(cfg({producao:120,limpeza:-20,equipamentos:0})), 'fora de 0-100');
  assert.ok(validarPerformance(cfg({producao:60,limpeza:20,equipamentos:20,bonus:0})), 'critério inventado');
});

/* ---------------- Acertos da revisão do ranking (23/09/2026) ---------------- */

test('registro CONFIRMADO sem equipe não é renomeado pela composição de hoje (é histórico)', () => {
  const a = pe('Ana'), b = pe('Bia');
  const salvas = [{id:'nova', nome:'Criada depois', emblema:'🚀', membros:[a,b], ativo:true}];
  const [conf] = P.comEquipes([{id:'1', confirmado:true, membros:P.iguais([a,b])}], salvas);
  assert.equal(conf.equipeId, undefined, 'entrega confirmada como avulsa continua avulsa');
});

test('revisão fechada mantém o nome gravado e só busca o logo pelo id', () => {
  const a = pe('Ana');
  const salvas = [{id:'e', nome:'Nome de hoje', emblema:'🦁', logo:'data:image/png;base64,AAAA', membros:[a], ativo:true}];
  const [r] = P.comEquipes([{id:'1', confirmado:true, equipeId:'e', equipeNome:'Nome da época', emblema:'🦅', membros:P.iguais([a])}], salvas, {historico:true});
  assert.equal(r.equipeNome, 'Nome da época');
  assert.equal(r.emblema, '🦅');
  assert.equal(r.logo, 'data:image/png;base64,AAAA');
});

test('a equipe continua achada quando a chave da pessoa muda (apelido -> ficha do RH)', () => {
  // Equipe salva com as chaves-apelido; a entrega de hoje vem com a chave do RH.
  const salvas = [{id:'e', nome:'Dupla', emblema:'🚀', membros:[{chave:'ana',nome:'Ana',apelido:'ana'},{chave:'bia',nome:'Bia',apelido:'bia'}], ativo:true}];
  const reg = {id:'1', membros:P.iguais([{chave:'111111',nome:'Ana',apelido:'ana'},{chave:'222222',nome:'Bia',apelido:'bia'}])};
  const resolver = m => ({ana:'111111', bia:'222222'})[m.apelido] || m.chave;
  assert.equal(P.comEquipes([reg], salvas)[0].equipeId, undefined, 'sem resolver, a equipe sumia calada');
  assert.equal(P.comEquipes([reg], salvas, {resolver})[0].equipeId, 'e');
});

test('pódio com empate que não cabe em três vira lista, sem escolher por ordem alfabética', () => {
  const fs=require('fs'),vm=require('vm');
  const c={STORE:{getCFG:()=>({}),getAllOS:()=>[]},STATE:{user:{papel:'admin'}},periodoOuMes:()=>({}),classificarEntregas:o=>({instalacoes:o}),OPERACAO:{emIntervalo:()=>true,equipe:()=>[]},diaEntrega:()=>'',valorDaOS:()=>0,nomeExibicaoCasa:n=>({chave:n,nome:n}),pessoasRH:()=>[],avatarRH:()=>'',esc:s=>String(s),dinheiroCasa:n=>String(n),filtroPeriodoHTML:()=>''};
  vm.createContext(c);vm.runInContext(fs.readFileSync(require.resolve('../performance.js'),'utf8'),c);
  const cinco = P.ranquear(['E','D','C','B','A'].map(n=>({nome:n,os:2})), x=>x.os);
  const r1 = c.perfCortarPodio(cinco);
  assert.equal(r1.podio.length, 0, 'cinco empatados em 1º não cabem no pódio');
  assert.equal(r1.resto.length, 5);
  const normal = P.ranquear([{nome:'A',os:5},{nome:'B',os:4},{nome:'C',os:3},{nome:'D',os:1}], x=>x.os);
  const r2 = c.perfCortarPodio(normal);
  assert.equal(r2.podio.map(x=>x.nome).join(','), 'A,B,C');
  assert.equal(r2.resto.map(x=>x.nome).join(','), 'D');
});

test('servidor: duas equipes ATIVAS com os mesmos integrantes são detectadas; desativada não disputa; vínculo do RH une apelido e ficha', async () => {
  const {composicoesAtivasRepetidas} = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const m = [{chave:'1',nome:'A'},{chave:'2',nome:'B'}];
  const eq = (id, ativo, membros = [...m].reverse()) => ({id, nome:'Equipe '+id, emblema:'🦅', membros, ativo});
  assert.equal(composicoesAtivasRepetidas({equipes:[eq('x',true), eq('y',true)]}).size, 1);
  assert.equal(composicoesAtivasRepetidas({equipes:[eq('x',true), eq('y',false)]}).size, 0);
  const porApelido = eq('z', true, [{chave:'Zé',nome:'Zé'},{chave:'2',nome:'B'}]), porFicha = eq('w', true, [{chave:'rh-jose',nome:'José'},{chave:'2',nome:'B'}]);
  assert.equal(composicoesAtivasRepetidas({equipes:[porApelido, porFicha]}, [{apelido:'Zé', chave:'rh-jose'}]).size, 1);
});

/* "SE ESTÁ ARRUMADO" (o Léo, 24/09/2026). Arrumado entra no critério do carro,
   sem criar critério novo: um "não" em limpo OU arrumado derruba a volta. */
test('avaliação: carro limpo mas desarrumado não é carro certo; volta antiga só com "limpo" vale', () => {
  assert.equal(P.carroDaVolta({carroLimpo:'sim', carroArrumado:'nao'}), false);
  assert.equal(P.carroDaVolta({carroLimpo:'nao', carroArrumado:'sim'}), false);
  assert.equal(P.carroDaVolta({carroLimpo:'sim', carroArrumado:'sim'}), true);
  assert.equal(P.carroDaVolta({carroLimpo:'sim'}), true, 'registro de antes do "arrumado"');
  assert.equal(P.carroDaVolta({carroArrumado:'sim'}), true);
  assert.equal(P.carroDaVolta({equipamentosOk:'sim'}), null, 'sem resposta do carro não é nota');
  assert.equal(P.carroDaVolta(null), null);
  const regs = [
    {id:'1', membros:P.iguais([pe('Ana')]), retornoConf:{carroLimpo:'sim', carroArrumado:'nao'}},
    {id:'2', membros:P.iguais([pe('Ana')]), retornoConf:{carroLimpo:'sim', carroArrumado:'sim'}},
  ];
  const {pessoas} = P.avaliar(regs, {producao:0,limpeza:100,equipamentos:0});
  assert.equal(pessoas[0].componentes.limpeza, 50);
});
