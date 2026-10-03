const {test}=require('node:test'),assert=require('node:assert/strict');
const {edge}=require('./helpers/edge.cjs'),D=require('../divisao.js'),C=require('../conferencia-entrega.js');
const gestor={papel:'pcp',nome:'Gestor Fictício',sub:'gestor'};
const equipe={id:'aguia',nome:'Águia fictícia',animal:'aguia',cor:'marinho',liderPadraoId:'100001',membros:[{chave:'100001',nome:'Ana'},{chave:'100002',nome:'Bia'}],ativo:true};
async function preparar(){
 const os={id:'os-teste',numero:'TESTE-A23',rev:1,tipo:'externo',equipe:['100001','100002'],itens:[{uid:'p',descricao:'Painel',qtde:4,subtotal:1000}],valorTotal:1000};
 const aloc={...D.montar([{equipeId:null,liderId:'100001',membros:['100001','100002']}]),por:'Autor original',em:'2026-09-01T10:00:00Z'};
 const item=C.catalogo(os)[0];os.conferenciasEntrega=[1,2].map(n=>({id:'e'+n,dia:'2026-09-0'+n,itens:[{chave:item.chave,identidade:item.identidade,qtde:1}],alocacao:structuredClone(aloc),por:'Autor original',em:'2026-09-0'+n+'T10:00:00Z'}));
 const e=await edge('pcp-sync',{pcp_registros:[{id:os.id,colecao:'os',registro:os,apagado:false,atualizado_em:'2026-09-01'}],registros:['100001','100002'].map((id,i)=>({id,colecao:'colaboradores',apagado:false,registro:{nome:['Ana','Bia'][i],cpf:id+'11111'}})),pcp_config_global:[{id:true,atualizado_em:'2026-09-01',config:{performancePCP:{equipes:[equipe],participacoes:[]}}}],painel_ordens:[{numero:os.numero,valor:1000}]});
 return {e,os,body:{action:'performanceVincularEquipe',osId:os.id,entregaId:'e1',grupo:0,rev:1,equipeId:'aguia',baseEquipe:JSON.stringify(equipe)}};
}
test('criação posterior não captura avulsas; ato explícito associa só uma parcial sem mudar pessoas, itens, datas e cotas',async()=>{
 const {e,os,body}=await preparar(),p={action:'performancePeriodo',de:'2026-09-01',ate:'2026-09-30'};
 let antes=await e.call(p,gestor);assert.equal(antes.registros.length,2);assert.ok(antes.registros.every(r=>!r.equipeId));
 const r=await e.call(body,gestor);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.os.rev,2);
 const esperado=structuredClone(os.conferenciasEntrega);esperado[0].alocacao.grupos[0].equipeId='aguia';assert.deepEqual(r.os.conferenciasEntrega,esperado);assert.equal(r.os.vinculosEquipes[0].por,'Gestor Fictício');
 await new Promise(r=>setTimeout(r,4));const depois=await e.call(p,gestor);assert.deepEqual(depois.registros.map(r=>r.equipeId),['aguia','']);assert.deepEqual(depois.registros.map(r=>r.valor),antes.registros.map(r=>r.valor));
});
test('rejeita permissão, inatividade, versão antiga e revisão fechada',async()=>{
 const {e,body}=await preparar();assert.equal((await e.call(body,{papel:'montagem'})).status,403);assert.equal((await e.call({...body,rev:0},gestor)).status,409);assert.equal((await e.call({...body,revisaoFechada:'rev1'},gestor)).status,422);
 e.db.pcp_config_global[0].config.performancePCP.equipes[0].ativo=false;assert.equal((await e.call(body,gestor)).status,422);
});
test('edição cadastral concorrente e corrida na O.S. não sobrescrevem',async()=>{
 let {e,body}=await preparar();e.db.pcp_config_global[0].config.performancePCP.equipes[0].nome='Alterada';assert.equal((await e.call(body,gestor)).status,409);
 ({e,body}=await preparar());e.cliente.beforeWrite=(db,t)=>{if(t==='pcp_registros')db.pcp_registros[0].atualizado_em='2026-09-02';};assert.equal((await e.call(body,gestor)).status,409);assert.equal(e.db.pcp_registros[0].registro.rev,1);
});
test('substituição e composição ambígua não trocam integrantes históricos',async()=>{
 const {e,os,body}=await preparar();const eq=e.db.pcp_config_global[0].config.performancePCP.equipes[0];eq.membros=[{chave:'100001',nome:'Ana'}];e.db.pcp_config_global[0].config.performancePCP.equipes.push({...eq,id:'outra',nome:'Outra'});
 const r=await e.call({...body,baseEquipe:JSON.stringify(eq)},gestor);assert.equal(r.status,200,JSON.stringify(r));assert.deepEqual(r.os.conferenciasEntrega[0].alocacao.grupos[0].membros,os.conferenciasEntrega[0].alocacao.grupos[0].membros);
});
test('upsert legado não apaga nem forja a assinatura do vínculo',async()=>{
 const {e,os,body}=await preparar();const r=await e.call(body,gestor);assert.equal(r.status,200);
 const editado={...r.os,obs:'Nota permitida',vinculosEquipes:[{por:'Forjado'}]};const salvo=await e.call({action:'upsert',os:editado},gestor);assert.equal(salvo.status,200,JSON.stringify(salvo));assert.deepEqual(salvo.os.vinculosEquipes,r.os.vinculosEquipes);
});
test('fechamento anterior mantém nomes, pessoas e valores após vínculo da base aberta',async()=>{
 const {e,body}=await preparar(),p={de:'2026-09-01',ate:'2026-09-30'},antes=await e.call({action:'performancePeriodo',...p},gestor);
 const snapshot={id:'fechado',periodo:p,registros:structuredClone(antes.registros),fechadoEm:'2026-10-01',revisao:1};e.db.pcp_registros.push({id:'fechado',colecao:'performance_fechamentos',registro:snapshot,apagado:false});
 assert.equal((await e.call(body,gestor)).status,200);assert.deepEqual(e.db.pcp_registros.find(x=>x.id==='fechado').registro,snapshot);
});
test('categorias e medições: autorização, autoria real, valores inválidos e retorno restrito',async()=>{
 const {e}=await preparar(),base=structuredClone(e.db.pcp_config_global[0].config),cfg={...base,categoriasServico:[{descricao:'ADESIVO',categoria:'Adesivos',por:'forjado'}],prioridadesPCP:{dono:'PCP'}};
 assert.equal((await e.call({action:'setCfg',baseCfg:base,cfg},{papel:'operacao'})).status,403);
 const r=await e.call({action:'setCfg',baseCfg:base,cfg},gestor);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.cfg.categoriasServico[0].por,'Gestor Fictício');
 assert.equal((await e.call({action:'setCfg',baseCfg:r.cfg,cfg:{...r.cfg,categoriasServico:[{descricao:'a',categoria:'inventada'}]}},gestor)).status,422);
 e.db.pcp_config_global[0].config.medicoesRetrabalho={secret:{material:999}};const restrito=await e.call({action:'getCfg'},{papel:'operacao'});assert.equal(restrito.cfg.medicoesRetrabalho,undefined);
});
test('alias exige ficha/placa verificadas e recebe assinatura do servidor',async()=>{
 const {e}=await preparar();e.db.painel_registros=[{id:'v1',colecao:'ativo',registro:{tipo:'veiculo',nome:'UNO - 10',especificacao:{placa:'TST1234'}}}];
 const base=structuredClone(e.db.pcp_config_global[0].config),alias={alias:'Fiat Uno',id:'v1',nome:'inventado',placa:'errada',por:'forjado'};
 const enviar=v=>e.call({action:'setCfg',baseCfg:base,cfg:{...base,veiculosAliases:[v]}},gestor);
 assert.equal((await enviar(alias)).status,422);const r=await enviar({...alias,placa:'TST1234'});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.cfg.veiculosAliases[0].nome,'UNO - 10');assert.equal(r.cfg.veiculosAliases[0].por,'Gestor Fictício');
});
test('identidade removida ou repetida exige revisão, nunca vinculada pelo nome',async()=>{
 let {e,body}=await preparar();e.db.registros=[];assert.equal((await e.call(body,gestor)).status,422);
 ({e,body}=await preparar());e.db.registros.push({id:'homonimo',colecao:'colaboradores',apagado:false,registro:{nome:'Outra pessoa',cpf:'10000122222'}});assert.equal((await e.call(body,gestor)).status,422);
});
test('medição vincula correção por ID explícito e não aceita original diferente',async()=>{
 const {e}=await preparar();e.db.pcp_registros.push({colecao:'os',id:'correcao',registro:{id:'correcao',numero:'TESTE-CORR',osOriginal:'TESTE-A23'},apagado:false});
 const base=structuredClone(e.db.pcp_config_global[0].config),med={material:0,horas:null,km:null,causa:'Em revisão',prevencao:'Medir antes de montar',originalId:'inexistente'};
 const gravar=m=>e.call({action:'setCfg',baseCfg:base,cfg:{...base,medicoesRetrabalho:{correcao:m}}},gestor);
 assert.equal((await gravar(med)).status,422);const r=await gravar({...med,originalId:'os-teste'});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.cfg.medicoesRetrabalho.correcao.originalId,'os-teste');assert.equal(r.cfg.medicoesRetrabalho.correcao.material,0);assert.equal(r.cfg.medicoesRetrabalho.correcao.horas,null);
});
test('transação rejeita desativação cadastral entre leitura e gravação histórica',async()=>{
 const {e,body,os}=await preparar();
 e.cliente.beforeWrite=(db,t)=>{assert.equal(t,'pcp_registros');db.pcp_config_global[0].config.performancePCP.equipes[0].ativo=false;db.pcp_config_global[0].atualizado_em='2026-09-03';};
 const r=await e.call(body,gestor);assert.equal(r.status,409);assert.deepEqual(e.db.pcp_registros[0].registro,os);
});
test('RPC ausente falha sem sucesso e sem alterar o histórico',async()=>{
 const {e,body,os}=await preparar();e.cliente.rpc=async nome=>nome==='pcp_vincular_equipe_cas'?{data:null,error:{message:'RPC indisponível'}}:{data:false,error:null};
 const r=await e.call(body,gestor);assert.ok(r.status>=400);assert.deepEqual(e.db.pcp_registros[0].registro,os);
});
test('migration restringe RPC, trava configuração antes do CAS e fixa resolução de schemas',()=>{
 const sql=require('node:fs').readFileSync(require('node:path').join(__dirname,'../supabase/migrations/0004_vinculo_equipe_cas.sql'),'utf8');
 assert.match(sql,/security definer set search_path = pg_catalog/i);
 assert.ok(sql.indexOf('for update')<sql.indexOf('update public.pcp_registros'));
 assert.match(sql,/v_versao is distinct from p_cfg_versao/);
 assert.match(sql,/atualizado_em = p_os_versao/);
 assert.match(sql,/from public, anon, authenticated/);
 assert.match(sql,/grant execute[^;]+to service_role/);
 assert.doesNotMatch(sql,/execute immediate|commit;|rollback;/i);
});
