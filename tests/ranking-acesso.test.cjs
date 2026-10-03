const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {edge}=require('./helpers/edge.cjs');
const P=require('../performance.js');
const modulo=()=>import('../supabase/functions/_shared/pcp-ranking-publico.mjs');
const periodo={de:'2026-09-01',ate:'2026-09-30'};
const membro=(id,nome,p=100)=>({chave:id,nome,percentual:p,cpf:'NAO-EXIBIR',telefone:'NAO-EXIBIR'});
function fonte(registros){return {periodo,consultadoEm:'2026-10-01T13:00:00Z',registros,hash:'hash-privado',motivo:'interno',fechadoPor:'login-privado'};}
function dados(n=1){
 const os=Array.from({length:n},(_,i)=>({colecao:'os',id:String(i).padStart(6,'0'),apagado:false,atualizado_em:'2020-01-01',registro:{id:String(i).padStart(6,'0'),numero:'OS-SECRETA-'+i,tipo:'externo',cliente:'CLIENTE-SECRETO',finalizadaEm:'2026-09-10T14:00:00Z',equipe:['Ana'],valorTotal:87654}}));
 const participacoes=os.map(o=>({id:o.id,membros:[membro('rh-interno-ana','Ana')],por:'Gestor',em:'2026-09-11'}));
 return {registros:[],pcp_registros:os,pcp_config_global:[{id:true,atualizado_em:'2020-01-01',config:{performancePCP:{equipes:[],participacoes}}}],painel_ordens:[]};
}
test('ranking autenticado: anônimo, máquina, outro sistema, vencido e papel inventado não entram',async()=>{
 const e=await edge('pcp-sync',dados()),req={action:'performanceRankingEquipe',...periodo,papel:'admin',usuario:'admin'};
 for(const who of [null,'machine',{sis:'rh',papel:'admin'},{papel:'admin',exp:1}])assert.equal((await e.call(req,who)).status,401);
 assert.equal((await e.call(req,{papel:'inventado'})).status,403);
 assert.equal(await e.run("lerCracha('eyJhbGciOiJIUzI1NiJ9.eyJzaXMiOiJwY3AiLCJwYXBlbCI6ImFkbWluIn0.assinatura-forjada')"),null);
});
test('ranking permite crachá existente inclusive montagem individual, sem conceder apuração ou gravação',async()=>{
 const e=await edge('pcp-sync',dados()),antes=structuredClone(e.db);
 e.cliente.beforeWrite=()=>{throw new Error('O acompanhamento não pode gravar.');};
 for(const who of [{papel:'admin'},{papel:'pcp'},{papel:'operacao'},{papel:'comercial'},{papel:'montagem'},{papel:'montagem',montagemIndividual:true}]){
   const r=await e.call({action:'performanceRankingEquipe',...periodo},who);assert.equal(r.status,200);assert.equal(r.resumo.equivalentes,1);
   const s=JSON.stringify(r);for(const privado of ['CLIENTE-SECRETO','OS-SECRETA','87654','rh-interno-ana','NAO-EXIBIR','registros','membros','valor','comissao','percentual'])assert.ok(!s.includes(privado),privado);
 }
 assert.deepEqual(e.db,antes,'leitura não cria nem altera registro');
 assert.equal((await e.call({action:'performancePeriodo',...periodo},{papel:'montagem',montagemIndividual:true})).status,403);
 assert.equal((await e.call({action:'performanceFechar',...periodo},{papel:'montagem',montagemIndividual:true})).status,403);
});
test('ranking recusa conta revogada antes de consultar cache e não aceita futuro nem data impossível',async()=>{
 const e=await edge('pcp-sync',dados());e.cliente.rpc=async()=>({data:true,error:null});
 assert.equal((await e.call({action:'performanceRankingEquipe',...periodo},{papel:'montagem',nome:'Revogada'})).status,401);
 const outro=await edge('pcp-sync',dados());
 for(const p of [{de:'2026-02-30',ate:'2026-03-02'},{de:'2100-01-01',ate:'2100-01-31'},{de:'2020-01-01',ate:'2026-09-30'}])assert.equal((await outro.call({action:'performanceRankingEquipe',...p},{papel:'montagem'})).status,422);
});
test('falha de revogação bloqueia só o ranking e não muda comportamento da operação',async()=>{
 for(const resposta of [{data:null,error:{message:'revocation unavailable'}},{data:null,error:null}]){
  const e=await edge('pcp-sync',dados());e.cliente.rpc=async()=>resposta;
  const r=await e.call({action:'performanceRankingEquipe',...periodo},{papel:'montagem'});assert.equal(r.status,503);assert.equal(r.equipes,undefined);
  assert.equal((await e.call({action:'getCfg'},{papel:'montagem'})).status,200);
 }
});
test('identidade antiga e ID da mesma ficha viram uma linha, aberta ou fechada, sem mudar fonte',async()=>{
 for(const fechada of [false,true]){
  const d=dados(2);d.registros=[{colecao:'colaboradores',id:'ana-rh',apagado:false,registro:{id:'ana-rh',nome:'Ana Maria',apelido:'Ana',cpf:'10000123456'}}];
  const ps=d.pcp_config_global[0].config.performancePCP.participacoes;ps[0].membros=[membro('ana-rh','Ana')];ps[1].membros=[membro('100001','Ana Maria')];
  if(fechada)d.pcp_registros.push({colecao:'performance_fechamentos',id:'fechado',apagado:false,registro:{...fonte(ps.map(p=>({...p,confirmado:true}))),...periodo,fechadoEm:'2026-10-01T12:00:00Z',revisao:1}});
  const e=await edge('pcp-sync',d),antes=structuredClone(e.db.pcp_registros);
  const r=await e.call({action:'performanceRankingEquipe',...periodo},{papel:'montagem'});
  assert.equal(r.status,200);assert.equal(r.equipes.length,1);assert.equal(r.equipes[0].nome,'Ana Maria');assert.equal(r.equipes[0].equivalentes,2);assert.deepEqual(e.db.pcp_registros,antes);
 }
});
test('slug órfão não é atribuído ao xará atual pelo nome',async()=>{
 const {rankingEquipeSeguro}=await modulo();const {resolverPessoas}=await import('../supabase/functions/_shared/pcp-integridade.mjs');
 const pessoas=resolverPessoas({pessoas:[{chave:'ana-nova',id:'100001',nome:'Ana Maria',apelido:'Ana'}]});
 const r=rankingEquipeSeguro(fonte([{id:'1',confirmado:true,membros:[membro('ana-antiga','Ana Maria')]},{id:'2',confirmado:true,membros:[membro('100001','Ana Maria')]}]),[],pessoas);
 assert.equal(r.equipes.length,2);assert.deepEqual(r.equipes.map(e=>e.equivalentes),[1,1]);
});
test('ranking lê mais de uma página e cache não depende de parâmetros de identidade enviados pelo aparelho',async()=>{
 const e=await edge('pcp-sync',dados(502));
 const r=await e.call({action:'performanceRankingEquipe',...periodo},{papel:'montagem',montagemIndividual:true});assert.equal(r.resumo.entregasConfirmadas,502);assert.equal(r.resumo.equivalentes,502);
 const outro=await e.call({action:'performanceRankingEquipe',...periodo,pessoaId:'outra',comValor:true},{papel:'comercial'});assert.deepEqual(outro,r);
});
test('projeção contabiliza parciais e rateio sem duplicar a produção e mantém empates',async()=>{
 const {rankingEquipeSeguro}=await modulo();
 const ms=[membro('100001','Ana',60),membro('100002','Bia',40)];
 const rs=[{id:'p1',entregaId:'p1',fracaoOS:.5,confirmado:true,membros:ms,valor:100,grupos:[{equipeId:'a',equipeNome:'Águia',membros:['100001'],cota:6000},{equipeId:'b',equipeNome:'Lobo',membros:['100002'],cota:4000}]},
 {id:'p2',entregaId:'p2',fracaoOS:.3,confirmado:true,membros:[membro('100003','Caio')],equipeId:'c',equipeNome:'Touro'},
 {id:'pendente',confirmado:false,membros:ms,valor:99999},
 {id:'sem-base',entregaId:'x',confirmado:true,membros:ms}];
 const r=rankingEquipeSeguro(fonte(rs));assert.deepEqual(r.equipes.map(e=>[e.nome,e.equivalentes,e.posicao]),[['Águia',.3,1],['Touro',.3,1],['Lobo',.2,3]]);
 assert.equal(r.resumo.equivalentes,.8);assert.equal(r.resumo.aConferir,1);assert.equal(r.resumo.semBase,1);assert.equal(r.resumo.entregasConfirmadas,3);
 const esperado=P.resumir(rs.slice(0,2)).equipes;for(const e of r.equipes)assert.ok(Math.abs(e.equivalentes-esperado.find(x=>x.nome===e.nome).equivalentes)<1e-8);
});
test('parcial conferida sem base mantém a confirmação e não inventa produção',async()=>{
 const {rankingEquipeSeguro}=await modulo();
 const registro={id:'parcial-sem-base',entregaId:'parcial-sem-base',confirmado:true,fracaoOS:0,valor:null,erroConferencia:'',membros:[membro('100001','Ana')]};
 const r=rankingEquipeSeguro(fonte([registro]));
 assert.deepEqual(r.resumo,{equipes:0,entregasConfirmadas:1,equivalentes:0,aConferir:0,semBase:1});
 assert.deepEqual(r.equipes,[]);assert.doesNotMatch(JSON.stringify(r),/valor|comissao|cpf|100001/);
});
test('projeção rejeita grupo sem cobertura, divisão inválida, duplicada e item com erro',async()=>{
 const {rankingEquipeSeguro}=await modulo(),ms=[membro('1','Ana',60),membro('2','Bia',40)];
 const rs=[{id:'invalida',confirmado:true,membros:[membro('1','Ana',70)]},{id:'grupo',confirmado:true,membros:ms,grupos:[{cota:6000,membros:['1']}]},{id:'erro',confirmado:true,membros:ms,erroConferencia:'Rever itens'}];
 assert.equal(rankingEquipeSeguro(fonte(rs)).equipes.length,0);
 const boa={id:'boa',confirmado:true,membros:[membro('1','Ana')]};assert.equal(rankingEquipeSeguro(fonte([boa,boa])).resumo.equivalentes,1);
});
test('projeção usa logo seguro e identidade confirmada, sem deduzir vínculo pela composição',async()=>{
 const {rankingEquipeSeguro}=await modulo();
 const rs=[{id:'1',confirmado:true,membros:[membro('1','Ana')]},{id:'2',equipeId:'a',equipeNome:'Nome antigo',confirmado:true,membros:[membro('1','Ana')]}];
 const original=structuredClone(rs),eq=[{id:'a',nome:'Águia',animal:'aguia',logo:'https://externo.invalid/rastrear',cor:'#ff0055',membros:[{chave:'1',nome:'Ana'}]}];
 const r=rankingEquipeSeguro(fonte(rs),eq);
 assert.deepEqual(r.equipes.map(e=>e.nome).sort(),['Ana','Águia']);assert.equal(r.equipes.find(e=>e.nome==='Águia').logo,'');assert.equal(r.equipes.find(e=>e.nome==='Águia').animal,'aguia');assert.deepEqual(rs,original);
 assert.ok(!JSON.stringify(r).includes('https://externo'));
});
test('fechamento exato preserva nome e produção selados apesar de mudar cadastro e base atual',async()=>{
 const d=dados(),f={...fonte([{id:'selada',equipeId:'a',equipeNome:'Nome da época',confirmado:true,membros:[membro('1','Ana')],fracaoOS:.5}]),...periodo,revisao:2,fechadoEm:'2026-10-01T14:00:00Z'};
 d.pcp_registros.push({colecao:'performance_fechamentos',id:'selado',apagado:false,registro:f});
 d.pcp_config_global[0].config.performancePCP.equipes=[{id:'a',nome:'Nome novo',animal:'aguia'}];
 const e=await edge('pcp-sync',d),r=await e.call({action:'performanceRankingEquipe',...periodo},{papel:'montagem'});
 assert.equal(r.fechado,true);assert.equal(r.revisao,2);assert.equal(r.equipes[0].nome,'Nome da época');assert.equal(r.resumo.equivalentes,.5);
});
test('página usa autenticação existente, recebe somente projeção e não guarda dados de ranking no aparelho',()=>{
 const js=fs.readFileSync(require.resolve('../ranking.js'),'utf8'),html=fs.readFileSync(require.resolve('../ranking.html'),'utf8');
 assert.match(js,/AUTH\.login\(/);assert.match(js,/AUTH\.cracha\(/);assert.match(js,/performanceRankingEquipe/);assert.match(js,/cache:'no-store'/);
 assert.doesNotMatch(js,/localStorage|innerHTML|STORE\.|performancePeriodo|performanceComissao/);
 assert.doesNotMatch(html,/store\.js|performance\.js|app\.js/);assert.match(html,/autocomplete="current-password"/);
 assert.match(js,/window\.print\(\)/);assert.match(js,/addEventListener\('storage'/);
 assert.doesNotMatch(js,/AUTH\.esquecer\(/);assert.doesNotMatch(html,/Trocar acesso/);assert.match(html,/Sair do acompanhamento/);
 assert.match(js,/if\(AUTH\.temCracha\(\)\)\{/,'crachá de trabalho presente nunca é substituído pelo login do ranking');
});
test('fixture local exige login, usa projeção real e permite falha/expiração sem serviço externo',async()=>{
 const f=require('../scripts/preview-ranking-fixture.cjs'),req={action:'performanceRankingEquipe',...periodo};
 assert.equal((await f.handler(req)).status,401);
 assert.equal((await f.handler({action:'previewLogin',usuario:'ana.demo',senha:'errada'})).status,401);
 const login=await f.handler({action:'previewLogin',usuario:'ana.demo',senha:'equipe-demo'}),auth='Bearer '+login.body.token;
 const r=await f.handler(req,auth);assert.equal(r.status,200);assert.equal(r.body.equipes.filter(e=>e.posicao===1).length,2);
 assert.doesNotMatch(JSON.stringify(r.body),/PRIVADO|PRIVADA|cpf|comissao|87654/);
 await f.handler({action:'previewErro'},auth);assert.equal((await f.handler(req,auth)).status,503);
 await f.handler({action:'previewExpirar'},auth);assert.equal((await f.handler(req,auth)).status,401);
 assert.doesNotMatch(f.script,/supabase|impresilk_inst_cracha/);
});
test('senha temporária bloqueia consulta e exige alteração no PCP antes de continuar',async()=>{
 const vm=require('node:vm'),els=new Map();let entrou=false,consultas=0;
 const el=id=>{if(!els.has(id))els.set(id,{hidden:false,value:'',textContent:'',disabled:false,replaceChildren(){},setAttribute(){},focus(){}});return els.get(id);};
 const ctx={Intl,Date,console,document:{hidden:false,getElementById:el,addEventListener(){}},window:{addEventListener(){}},setInterval(){},AUTH:{temCracha:()=>entrou,dono:()=>entrou?{nome:'Ana',papel:'montagem'}:null,login:async()=>{entrou=true;return {trocarSenha:true};}},fetch:async()=>{consultas++;throw new Error('Não deveria consultar');}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../ranking.js'),'utf8'),ctx);
 el('ranking-usuario').value='ana';el('ranking-senha').value='temporaria';
 await el('ranking-login-form').onsubmit({preventDefault(){}});
 assert.equal(consultas,0);assert.equal(el('ranking-conteudo').hidden,true);assert.equal(el('ranking-retomar').hidden,true);assert.equal(el('ranking-renovar').href,'index.html');assert.match(el('ranking-login-erro').textContent,/senha é temporária/);assert.equal(el('ranking-senha').value,'');
 await el('ranking-retomar').onclick();assert.equal(consultas,0,'não contorna a troca obrigatória pelo botão de retomar');
});
test('acompanhamento explica produção sem base e permite PDF mesmo sem linhas pontuadas',async()=>{
 const vm=require('node:vm'),els=new Map();let entrou=false,impresso=0;
 const elemento=()=>({hidden:false,value:'',textContent:'',disabled:false,children:[],replaceChildren(...xs){this.children=xs;},append(...xs){this.children.push(...xs);},setAttribute(){},focus(){}});
 const el=id=>{if(!els.has(id))els.set(id,elemento());return els.get(id);};
 const resposta={periodo,atualizadoEm:'2026-10-01T13:00:00Z',resumo:{equipes:0,entregasConfirmadas:1,equivalentes:0,aConferir:0,semBase:1},equipes:[]};
 const ctx={Intl,Date,console,AbortController,setTimeout,clearTimeout,API_BASE:'',API_FN:{os:'ranking-api'},document:{hidden:false,getElementById:el,createElement:elemento,addEventListener(){}},window:{addEventListener(){},print(){impresso++;}},setInterval(){},AUTH:{temCracha:()=>entrou,dono:()=>entrou?{nome:'Ana',papel:'montagem'}:null,cracha:()=>'',login:async()=>{entrou=true;return {};}},fetch:async()=>({ok:true,status:200,json:async()=>resposta})};
 vm.runInNewContext(fs.readFileSync(require.resolve('../ranking.js'),'utf8'),ctx);
 await el('ranking-login-form').onsubmit({preventDefault(){}});
 assert.equal(el('ranking-sem-base').hidden,false);assert.match(el('ranking-sem-base').textContent,/1 entrega já conferida/);assert.match(el('ranking-sem-base').textContent,/Ainda não soma/);
 assert.match(el('ranking-vazio').textContent,/aguardam base/);assert.equal(el('ranking-pdf').disabled,false);
 el('ranking-pdf').onclick();assert.equal(impresso,1);
 const textos=el('ranking-resumo').children.map(e=>e.children.map(x=>x.textContent).join(' '));assert.ok(textos.includes('1 entregas conferidas'));assert.ok(textos.includes('0 entregas a conferir'));
 el('ranking-sair').onclick();assert.equal(el('ranking-sem-base').hidden,true);assert.equal(el('ranking-sem-base').textContent,'');assert.equal(el('ranking-pdf').disabled,true);
});
