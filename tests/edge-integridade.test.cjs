const {test}=require('node:test'),assert=require('node:assert/strict');
const {edge}=require('./helpers/edge.cjs');
const row=(id,registro)=>({id,colecao:'os',apagado:false,atualizado_em:'2026-09-19T10:00:00Z',registro:{id,rev:1,...registro}});
test('servidor recusa emissão de montagem sem sessão autenticada',async()=>{
 const e=await edge('pcp-sync');assert.equal((await e.call({action:'entrarMontagem',nome:'Ana'},null)).status,401);
 assert.equal((await e.call({action:'entrarMontagem',nome:'Ana'},{papel:'comercial'})).status,403);
 const r=await e.call({action:'entrarMontagem',nome:'Ana'},{papel:'admin'});assert.equal(r.status,200);assert.ok(r.token);assert.equal(JSON.parse(Buffer.from(r.token.split('.')[1],'base64url')).montagemIndividual,true);
});
test('montagem grava data completa e autor real sem modificar equipe ou origem',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[row('1',{numero:'1',equipe:['Ana'],cliente:'Cliente',saidaEm:''})]});
 const r=await e.call({action:'upsert',os:{id:'1',rev:1,cliente:'Forjado',equipe:['Outra'],horaSaida:'23:30',saidaEm:'2026-09-19T23:30:00-03:00',atualizadoPor:'Outro'}},{nome:'Ana',papel:'montagem',montagemIndividual:true});
 assert.equal(r.status,200);assert.equal(r.os.saidaEm,'2026-09-19T23:30:00-03:00');assert.equal(r.os.saidaPor,'Ana');assert.equal(r.os.cliente,'Cliente');assert.deepEqual(r.os.equipe,['Ana']);
 const negado=await e.call({action:'upsert',os:{id:'1',rev:2}},{nome:'Outra',papel:'montagem'});assert.equal(negado.status,403);
});
test('montagem lista só suas O.S.; reatribuição incremental vira remoção do cache',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[row('1',{equipe:['Ana']}),row('2',{equipe:['Outra']})]});
 const who={nome:'Ana',papel:'montagem'};const lista=await e.call({action:'list'},who);assert.deepEqual(lista.os.map(o=>o.id),['1']);
 const delta=await e.call({action:'list',since:'2026-09-18'},who);assert.deepEqual(delta.os.find(o=>o.id==='2'),{id:'2',apagado:true});
});
test('servidor bloqueia perda por corrida de O.S.',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[row('1',{cliente:'A'})]});
 e.cliente.beforeWrite=db=>{db.pcp_registros[0].atualizado_em='2026-09-19T11:00:00Z';db.pcp_registros[0].registro={id:'1',rev:2,cliente:'Outro aparelho'};};
 const r=await e.call({action:'upsert',os:{id:'1',rev:1,cliente:'Meu aparelho'}});assert.equal(r.conflito,true);assert.equal(e.db.pcp_registros[0].registro.cliente,'Outro aparelho');
});
test('configuração no servidor combina adições simultâneas e recusa conflito',async()=>{
 const base={agendaPCP:{plantoes:[]},instaladores:['Ana']};const e=await edge('pcp-sync',{pcp_config_global:[{id:true,config:base,atualizado_em:'2026-09-19T10:00:00Z'}]});
 const a=await e.call({action:'setCfg',baseCfg:base,cfg:{...base,agendaPCP:{plantoes:[{id:'a',titulo:'A'}]}}});assert.equal(a.ok,true);
 const b=await e.call({action:'setCfg',baseCfg:base,cfg:{...base,agendaPCP:{plantoes:[{id:'b',titulo:'B'}]}}});assert.equal(b.ok,true);assert.equal(b.cfg.agendaPCP.plantoes.length,2);
 const before=b.cfg;await e.call({action:'setCfg',baseCfg:before,cfg:{...before,instaladores:['Ana','Bia']}});
 const conflict=await e.call({action:'setCfg',baseCfg:before,cfg:{...before,instaladores:['Ana','Caio']}});assert.equal(conflict.status,409);assert.equal(conflict.conflitoCfg,true);
});
test('setCfg PCP não amplia acesso e preserva usuários e segredos',async()=>{
 const e=await edge('pcp-sync',{pcp_config_global:[{id:true,config:{usuarios:['privado'],funcionarios:['privado'],niveis:{admin:true},agendaPCP:{}},atualizado_em:'2026-09-19T10:00:00Z'}]});
 const r=await e.call({action:'setCfg',baseCfg:{agendaPCP:{},niveis:{}},cfg:{agendaPCP:{eventos:[{id:'e'}]},niveis:{pcp:{admin:true}}}},{papel:'pcp'});
 assert.equal(r.ok,true);assert.deepEqual(e.db.pcp_config_global[0].config.niveis,{admin:true});assert.equal(r.cfg.usuarios,undefined);assert.equal(r.cfg.funcionarios,undefined);
});
test('conclusão sem evidência é recusada no servidor, exceção recebe autor',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[row('1',{tipo:'externo'})]});
 const os={id:'1',rev:1,tipo:'externo',finalizadaEm:'2026-09-19T12:00:00Z'};
 assert.equal((await e.call({action:'upsert',os},{papel:'pcp'})).status,422);
 const r=await e.call({action:'upsert',os:{...os,justificativaConclusao:'Cliente não permite fotos internas.'}},{papel:'pcp',nome:'Gestor'});
 assert.equal(r.ok,true);assert.equal(r.os.excecaoConclusao.por,'Gestor');
});
test('importação ERP atualiza origem e não revive lápide nem pisa em escrita concorrente',async()=>{
 const r=row('mub-1',{numero:'1',origemMubisys:true,cliente:'Antigo',equipe:['Ana'],fotosCheckinIds:['f']});
 const morto={...row('mub-2',{numero:'2',origemMubisys:true}),apagado:true};
 const e=await edge('pcp-mubisys',{pcp_registros:[r,morto]});
 let out=await e.run(`gravarImportadas(sb,[{numero:'1',cliente:'Novo'},{numero:'2',cliente:'Não reviver'},{numero:'3',cliente:'Nova'}])`);
 assert.equal(out.atualizadas,1);assert.equal(out.novas,1);assert.deepEqual(e.db.pcp_registros[0].registro.equipe,['Ana']);assert.equal(e.db.pcp_registros[1].apagado,true);
 e.cliente.beforeWrite=db=>{db.pcp_registros[0].atualizado_em='depois';db.pcp_registros[0].registro.equipe=['Outra equipe'];};
 out=await e.run(`gravarImportadas(sb,[{numero:'1',cliente:'Mais novo'}])`);assert.equal(out.conflitosAtualizacao,1);assert.deepEqual(e.db.pcp_registros[0].registro.equipe,['Outra equipe']);
});
test('resposta ERP sem valor não vira valor zero',async()=>{
 const e=await edge('pcp-mubisys');assert.equal(e.run(`mapearOS({numero:'1'}).valorTotal`),null);assert.equal(e.run(`mapearOS({numero:'1',valor_total:0}).valorTotal`),0);
});
test('veículo só libera com confirmação no dia da saída registrada, inclusive envio offline',async()=>{
 const agenda={data:'2026-09-19',periodo:'Manhã'};
 const e=await edge('pcp-sync',{pcp_registros:[row('1',{instalacao:agenda,confirmacao:'Confirmado',confEm:'2026-09-18T09:00:00-03:00'})]});
 const os={id:'1',rev:1,instalacao:agenda,confirmacao:'Confirmado',carroLiberado:true,carroLiberadoEm:'2026-09-19T10:00:00-03:00',confEm:'2026-09-18T09:00:00-03:00'};
 assert.equal((await e.call({action:'upsert',os},{papel:'pcp'})).status,422);
 assert.equal((await e.call({action:'upsert',os:{...os,confEm:'2026-09-19T09:00:00-03:00'}},{papel:'pcp'})).ok,true);
});
test('remarcação limpa confirmação anterior e liberação do veículo',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[row('1',{instalacao:{data:'2026-09-19'},confirmacao:'Confirmado',confEm:'2026-09-19T10:00:00Z',carroLiberado:true})]});
 const r=await e.call({action:'upsert',os:{id:'1',rev:1,instalacao:{data:'2026-09-20'},confirmacao:'Confirmado',confEm:'2026-09-19T10:00:00Z',carroLiberado:true}},{papel:'pcp'});
 assert.equal(r.os.confirmacao,'');assert.equal(r.os.confEm,'');assert.equal(r.os.carroLiberado,false);
});
test('carteira completa restaura exclusão, importa pendente, arquiva o fantasma e só MARCA a O.S. com trabalho de gente',async()=>{
 const morta={...row('mub-1',{numero:'1',origemMubisys:true,equipe:['Ana'],fotosRetornoIds:['foto']}),apagado:true};
 const fora=row('mub-2',{numero:'2',origemMubisys:true,equipe:['Bia'],saidaEm:'2026-09-01T10:00:00Z'});
 const manual=row('local',{numero:'local',equipe:['Ana']});
 const fantasma=row('mub-4',{numero:'4',origemMubisys:true,instalacao:{data:'2026-09-01',periodo:'Manhã'}});
 const e=await edge('pcp-mubisys',{pcp_registros:[morta,fora,manual,fantasma]});
 const r=await e.run(`reconciliarCarteira(sb,[{numero:'1',cliente:'Cliente'},{numero:'3',cliente:'Pendente'}])`);
 assert.equal(r.restauradas,1);assert.equal(r.arquivadas,1);assert.equal(r.marcadasParaConferir,1);assert.equal(r.novas,1);
 assert.equal(e.db.pcp_registros[0].apagado,false);assert.deepEqual(e.db.pcp_registros[0].registro.equipe,['Ana']);
 assert.deepEqual(e.db.pcp_registros[0].registro.fotosRetornoIds,['foto']);
 const f=e.db.pcp_registros[1].registro;
 assert.equal(f.finalizadaEm,undefined,'equipe na rua: o ERP não fecha sozinho');
 assert.ok(f.erpSaiuDaCarteiraEm,'fica marcada para a gestão confirmar');
 assert.equal(f.saidaEm,'2026-09-01T10:00:00Z');
 assert.equal(e.db.pcp_registros[3].registro.baixaAutoERP.status,'FORA DA CARTEIRA ABERTA','o fantasma (data só do ERP) segue a baixa');
 assert.equal(e.db.pcp_registros[2].registro.finalizadaEm,undefined);
 assert.equal(e.db.pcp_meta[0].valor.antes.length,3);
 const marca=f.erpSaiuDaCarteiraEm;
 const deNovo=await e.run(`reconciliarCarteira(sb,[{numero:'1',cliente:'Cliente'},{numero:'3',cliente:'Pendente'}])`);
 assert.equal(deNovo.arquivadas,0);assert.equal(deNovo.restauradas,0);assert.equal(deNovo.novas,0);assert.equal(deNovo.marcadasParaConferir,0);
 assert.equal(e.db.pcp_registros[1].registro.erpSaiuDaCarteiraEm,marca,'a marca diz DESDE QUANDO: não é regravada');
 const volta=await e.run(`reconciliarCarteira(sb,[{numero:'1',cliente:'Cliente'},{numero:'2',cliente:'X'},{numero:'3',cliente:'Pendente'}])`);
 assert.equal(volta.restauradas,1);assert.equal(e.db.pcp_registros[1].registro.erpSaiuDaCarteiraEm,undefined,'voltou à carteira: a marca sai');
});
test('conciliação recusa lista vazia',async()=>{
 const e=await edge('pcp-mubisys',{pcp_registros:[row('1',{numero:'1',origemMubisys:true})]});
 await assert.rejects(e.run('reconciliarCarteira(sb,[])'),/inválida/);
 assert.equal(e.db.pcp_registros[0].registro.finalizadaEm,undefined);
});
test('conciliação usa quatro situações e espera todas antes de gravar',async()=>{
 const e=await edge('pcp-mubisys');
 e.run(`erpGet=async url=>{const s=new URL(url).searchParams.get('status');return s==='PRODUCAO'?[{numero:'1'}]:s==='CONCLUIDO'?[{numero:'2'},{numero:'1'}]:s==='PENDENTE'?[{numero:'3'}]:[{numero:'4'}]}`);
 const r=await e.run(`buscarCarteiraCompleta('https://erp.invalid','key',{},'2026-09-21')`);
 assert.deepEqual(Array.from(r,x=>x.numero).sort(),['1','2','3','4']);
 e.run(`erpGet=async url=>{if(new URL(url).searchParams.get('status')==='PAUSADO')throw Error('indisponível');return [{numero:'1'}]}`);
 await assert.rejects(e.run(`buscarCarteiraCompleta('https://erp.invalid','key',{},'2026-09-21')`),/indisponível/);
 assert.equal(e.db.pcp_registros.length,0);
});

test('conciliação preserva edição concorrente e informa conflito',async()=>{
 const e=await edge('pcp-mubisys',{pcp_registros:[row('1',{numero:'1',origemMubisys:true,equipe:['Ana']})]});
 e.cliente.beforeWrite=db=>{db.pcp_registros[0].atualizado_em='mais-recente';db.pcp_registros[0].registro.equipe=['Bia'];};
 const r=await e.run("reconciliarCarteira(sb,[{numero:'2',cliente:'Nova'}])");
 assert.equal(r.conflitosCarteira,1);assert.equal(r.arquivadas,0);
 assert.deepEqual(e.db.pcp_registros[0].registro.equipe,['Bia']);
 assert.equal(e.db.pcp_registros[0].registro.finalizadaEm,undefined);
});

/* ---------------- Conferência da volta (revisão de 23/09/2026) ----------------
   Pesa na nota de cada instalador: só a gestão escreve, e o autor é o crachá. */
const volta = extra => row('1', {tipo:'externo', equipe:['Ana'], finalizadaEm:'2026-09-19T12:00:00Z', ...extra});
test('conta de grupo montagem (com senha) NÃO grava a própria conferência da volta', async () => {
 const e = await edge('pcp-sync', {pcp_registros:[volta({})], equipe_contas:[{sistema:'pcp', usuario:'montagem', ativo:true}]});
 const r = await e.call({action:'upsert', os:{...e.db.pcp_registros[0].registro, retornoConf:{carroLimpo:'sim', equipamentosOk:'sim', por:'Léo', em:'2026-01-01'}}}, {papel:'montagem', nome:'Montagem', sub:'montagem'});
 assert.equal(r.status, 200, JSON.stringify(r));
 assert.equal(e.db.pcp_registros[0].registro.retornoConf, undefined, 'nada gravado, e sem 422 que trave a fila');
});
test('operação não apaga a conferência que a gestão fez', async () => {
 const antes = {carroLimpo:'nao', equipamentosOk:'sim', obs:'', por:'Gestor', porId:'gestor', em:'2026-09-19T15:00:00Z'};
 const e = await edge('pcp-sync', {pcp_registros:[volta({retornoConf:antes})]});
 await e.call({action:'upsert', os:{...e.db.pcp_registros[0].registro, retornoConf:{carroLimpo:'sim', equipamentosOk:'sim'}}}, {papel:'operacao', nome:'Op'});
 assert.deepEqual({...e.db.pcp_registros[0].registro.retornoConf}, antes);
});
test('gestão confere: autor e hora vêm do crachá e do relógio do servidor, não do aparelho', async () => {
 const e = await edge('pcp-sync', {pcp_registros:[volta({})]});
 const r = await e.call({action:'upsert', os:{...e.db.pcp_registros[0].registro, retornoConf:{carroLimpo:'sim', equipamentosOk:'nao', obs:'x'.repeat(400), por:'Outro', em:'2020-01-01'}}}, {papel:'pcp', nome:'Gestor', sub:'gestor-id'});
 const rc = e.db.pcp_registros[0].registro.retornoConf;
 assert.equal(r.status, 200);
 assert.equal(rc.por, 'Gestor'); assert.equal(rc.porId, 'gestor-id');
 assert.notEqual(rc.em, '2020-01-01'); assert.ok(Date.now() - Date.parse(rc.em) < 60000);
 assert.equal(rc.obs.length, 300, 'observação cortada no teto, sem travar a fila');
});
test('editar só a observação não troca quem conferiu; "não conferido" nos dois apaga o autor', async () => {
 const antes = {carroLimpo:'sim', equipamentosOk:'sim', obs:'', por:'Gestor', porId:'gestor', em:'2026-09-19T15:00:00Z'};
 const e = await edge('pcp-sync', {pcp_registros:[volta({retornoConf:antes})]});
 await e.call({action:'upsert', os:{...e.db.pcp_registros[0].registro, retornoConf:{...antes, obs:'riscado no para-choque', por:'Outra'}}}, {papel:'admin', nome:'Outra'});
 let rc = e.db.pcp_registros[0].registro.retornoConf;
 assert.equal(rc.por, 'Gestor'); assert.equal(rc.em, antes.em); assert.equal(rc.obs, 'riscado no para-choque');
 await e.call({action:'upsert', os:{...e.db.pcp_registros[0].registro, retornoConf:{carroLimpo:'', equipamentosOk:''}}}, {papel:'admin', nome:'Outra'});
 rc = e.db.pcp_registros[0].registro.retornoConf;
 assert.equal(rc.por, ''); assert.equal(rc.em, '');
});
test('aparelho em versão antiga (sem o campo) não apaga a conferência gravada', async () => {
 const antes = {carroLimpo:'nao', equipamentosOk:'nao', obs:'', por:'Gestor', porId:'gestor', em:'2026-09-19T15:00:00Z'};
 const e = await edge('pcp-sync', {pcp_registros:[volta({retornoConf:antes})]});
 const {retornoConf, ...semCampo} = e.db.pcp_registros[0].registro;
 await e.call({action:'upsert', os:{...semCampo, observacoes:'nota nova'}}, {papel:'pcp', nome:'Gestor'});
 assert.deepEqual({...e.db.pcp_registros[0].registro.retornoConf}, antes);
});
test('aba na versão anterior salvando equipe não apaga os pesos da nota', async () => {
 const perf = {equipes:[], participacoes:[], criterios:{producao:40, limpeza:30, equipamentos:30}};
 const e = await edge('pcp-sync', {pcp_config_global:[{id:true, config:{performancePCP:perf}, atualizado_em:'2026-09-19T10:00:00Z'}]});
 const velho = {equipes:[{id:'eq1', nome:'Águias', emblema:'🦅', membros:[{chave:'Ana', nome:'Ana'}, {chave:'Bia', nome:'Bia'}]}], participacoes:[]};
 const r = await e.call({action:'setCfg', baseCfg:{performancePCP:perf}, cfg:{performancePCP:velho}}, {papel:'pcp', nome:'Gestor'});
 assert.equal(r.ok, true);
 const gravado = e.db.pcp_config_global[0].config.performancePCP;
 assert.equal(gravado.equipes.length, 1, 'a equipe entrou');
 assert.deepEqual({...gravado.criterios}, perf.criterios, 'e os pesos ficaram');
});
test('"✓ Conferi" da gestão apaga o selo do ERP com carimbo do crachá; outro papel não apaga', async () => {
 const base = {origemMubisys:true, numero:'9', cliente:'B', erpConferirEm:'2026-09-21T10:00:00Z', erpAlteracoes:[{em:'2026-09-21T10:00:00Z', campos:[{campo:'cliente', antes:'A', depois:'B'}]}]};
 const e = await edge('pcp-sync', {pcp_registros:[row('mub-9', base)]});
 await e.call({action:'upsert', os:{...e.db.pcp_registros[0].registro, erpConferirEm:'', erpConferiuSelo:base.erpConferirEm}}, {papel:'operacao', nome:'Op'});
 assert.equal(e.db.pcp_registros[0].registro.erpConferirEm, base.erpConferirEm, 'operação não apaga');
 await e.call({action:'upsert', os:{...e.db.pcp_registros[0].registro, erpConferirEm:'', erpConferiuSelo:base.erpConferirEm, erpConferidoPor:'Forjado'}}, {papel:'pcp', nome:'Gestor'});
 const r = e.db.pcp_registros[0].registro;
 assert.equal(r.erpConferirEm, ''); assert.equal(r.erpConferidoPor, 'Gestor');
 await e.call({action:'upsert', os:{...r, erpConferirEm:'2020-01-01'}}, {papel:'pcp', nome:'Gestor'});
 assert.equal(e.db.pcp_registros[0].registro.erpConferirEm, '', 'o aparelho não reacende o selo');
});

/* ---------------- Conexão com o ERP (23/09/2026) ---------------- */
test('O.S. 23364: liberada, com equipe e agenda no dia, NÃO é arquivada quando sai da carteira do ERP', async () => {
 const os=row('mub-23364',{numero:'23364',origemMubisys:true,liberadoPCP:true,aptoEm:'2026-09-20T10:00:00Z',equipe:['Ana','Bia'],instalacao:{data:'2026-09-22',periodo:'Manhã'}});
 const e=await edge('pcp-mubisys',{pcp_registros:[os]});
 const r=await e.run("reconciliarCarteira(sb,[{numero:'9',cliente:'Outra'}])");
 assert.equal(r.arquivadas,0);assert.equal(r.marcadasParaConferir,1);
 assert.equal(e.db.pcp_registros[0].registro.finalizadaEm,undefined);
 assert.equal(e.db.pcp_registros[0].registro.arquivadaEm,undefined);
});
test('O.S. reaberta depois da baixa do ERP não é fechada de novo na hora seguinte', async () => {
 const os=row('mub-7',{numero:'7',origemMubisys:true,baixaAutoERP:{em:'2026-09-20T10:00:00Z'},reabertaEm:'2026-09-21T10:00:00Z',reabertaPor:'Gestor'});
 const e=await edge('pcp-mubisys',{pcp_registros:[os]});
 const r=await e.run("reconciliarCarteira(sb,[{numero:'9',cliente:'Outra'}])");
 assert.equal(r.arquivadas,0);assert.equal(e.db.pcp_registros[0].registro.finalizadaEm,undefined);
});
test('situação do ERP: vem da consulta, entra na O.S. nova e na existente sem somar ao rev nem acender o selo', async () => {
 const e=await edge('pcp-mubisys',{pcp_registros:[row('mub-1',{numero:'1',origemMubisys:true,cliente:'A',statusERP:'PRODUCAO'})]});
 e.run("erpGet=async url=>{const s=new URL(url).searchParams.get('status');return s==='CONCLUIDO'?[{numero:'1',cliente:'A'},{numero:'2',cliente:'B'}]:[]}");
 const carteira=await e.run("buscarCarteiraCompleta('https://erp.invalid','key',{},'2026-09-23')");
 assert.deepEqual(Array.from(carteira,x=>x.statusCarteira),['CONCLUIDO','CONCLUIDO']);
 await e.run("gravarImportadas(sb,"+JSON.stringify(Array.from(carteira))+")");
 const velha=e.db.pcp_registros.find(x=>x.id==='mub-1').registro, nova=e.db.pcp_registros.find(x=>x.id==='mub-2').registro;
 assert.equal(velha.statusERP,'CONCLUIDO');assert.ok(velha.statusERPDesde);
 assert.equal(velha.rev,1,'não vira conflito no aparelho');assert.equal(velha.erpConferirEm,undefined);
 assert.equal(nova.statusERP,'CONCLUIDO');
});
test('aparelho com cópia velha não apaga a situação do ERP nem a marca "ERP fechou"', async () => {
 const base={numero:'5',origemMubisys:true,statusERP:'CONCLUIDO',statusERPDesde:'2026-09-22T10:00:00Z',erpSaiuDaCarteiraEm:'2026-09-23T10:00:00Z'};
 const e=await edge('pcp-sync',{pcp_registros:[row('mub-5',base)]});
 const {statusERP,statusERPDesde,erpSaiuDaCarteiraEm,...velha}=e.db.pcp_registros[0].registro;
 await e.call({action:'upsert',os:{...velha,obsPCP:'nota'}},{papel:'pcp',nome:'Gestor'});
 const r=e.db.pcp_registros[0].registro;
 assert.equal(r.statusERP,'CONCLUIDO');assert.equal(r.erpSaiuDaCarteiraEm,'2026-09-23T10:00:00Z');assert.equal(r.obsPCP,'nota');
});
test('reabrir carimba quem reabriu pelo crachá, no servidor', async () => {
 const e=await edge('pcp-sync',{pcp_registros:[row('9',{tipo:'externo',finalizadaEm:'2026-09-20T10:00:00Z',finalizadoPor:'Mubisys · saiu da carteira aberta',arquivadaEm:'2026-09-20T10:00:00Z'})]});
 await e.call({action:'upsert',os:{...e.db.pcp_registros[0].registro,finalizadaEm:'',finalizadoPor:''}},{papel:'pcp',nome:'Gestor'});
 const r=e.db.pcp_registros[0].registro;
 assert.equal(r.reabertaPor,'Gestor');assert.ok(r.reabertaEm);assert.equal(r.arquivadaEm,undefined);
});
test('"Voltar ao PCP" e o Desfazer do liberar numa O.S. do ERP sem equipe GRAVAM (não são esqueleto)', async () => {
 const e=await edge('pcp-sync',{pcp_registros:[row('mub-7',{numero:'7',origemMubisys:true,liberadoPCP:true,aptoEm:'2026-09-23T10:00:00Z',paradoClienteEm:'2026-09-23T11:00:00Z',equipe:[],rev:3})]});
 const atual=e.db.pcp_registros[0].registro;
 const r=await e.call({action:'upsert',os:{...atual,liberadoPCP:false,aptoEm:'',aptoPor:'',paradoClienteEm:'',paradoClienteLog:[{de:atual.paradoClienteEm,ate:'2026-09-23T12:00:00Z',motivo:'voltou ao PCP'}]}},{papel:'pcp',nome:'Gestor'});
 assert.equal(r.duplicataEvitada,undefined);
 const g=e.db.pcp_registros[0].registro;
 assert.equal(g.liberadoPCP,false);assert.equal(g.paradoClienteEm,'');assert.equal(g.paradoClienteLog.length,1);
});
test('esqueleto do ERP SEM rev sobre ficha trabalhada continua devolvendo a ficha do servidor', async () => {
 const e=await edge('pcp-sync',{pcp_registros:[row('mub-8',{numero:'8',origemMubisys:true,liberadoPCP:true,equipe:['Ana'],rev:2})]});
 const {rev,...semRev}=e.db.pcp_registros[0].registro;
 const r=await e.call({action:'upsert',os:{...semRev,liberadoPCP:false,equipe:[]}},{papel:'pcp',nome:'Gestor'});
 assert.equal(r.duplicataEvitada,true);assert.equal(e.db.pcp_registros[0].registro.liberadoPCP,true);
});

test('"Sobrescrever" com cópia velha (selo vazio, sem dizer qual viu) NÃO apaga um selo novo do ERP', async () => {
 const base = {origemMubisys:true, numero:'9', cliente:'C', erpConferirEm:'2026-09-23T10:00:00Z', erpConferidoEm:'2026-09-21T11:00:00Z',
  erpAlteracoes:[{em:'2026-09-21T10:00:00Z', campos:[{campo:'cliente', antes:'A', depois:'B'}]},{em:'2026-09-23T10:00:00Z', campos:[{campo:'cliente', antes:'B', depois:'C'}]}]};
 const e = await edge('pcp-sync', {pcp_registros:[row('mub-9', base)]});
 // a cópia do aparelho é de antes do selo novo: selo vazio e o marcador do Conferi ANTERIOR
 await e.call({action:'upsert', os:{...e.db.pcp_registros[0].registro, erpConferirEm:'', erpConferiuSelo:'2026-09-21T10:00:00Z'}}, {papel:'pcp', nome:'Gestor'});
 const r = e.db.pcp_registros[0].registro;
 assert.equal(r.erpConferirEm, '2026-09-23T10:00:00Z', 'o selo novo continua aceso');
 assert.equal(r.erpConferiuSelo, undefined, 'o marcador não fica gravado');
});

test('duplicata de equipe que JÁ estava no banco não trava a confirmação de uma participação; a NOVA vira conflito 409', async () => {
 const m=[{chave:'1',nome:'A'},{chave:'2',nome:'B'}];
 const eq=(id)=>({id,nome:'Equipe '+id,emblema:'🦅',membros:m,ativo:true});
 const perf={equipes:[eq('x'),eq('y')],participacoes:[]};
 const e=await edge('pcp-sync',{pcp_config_global:[{id:true,config:{performancePCP:perf},atualizado_em:'2026-09-19T10:00:00Z'}]});
 const confirmar={...perf,participacoes:[{id:'os1',membros:[{chave:'1',nome:'A',percentual:50},{chave:'2',nome:'B',percentual:50}]}]};
 const r=await e.call({action:'setCfg',baseCfg:{performancePCP:perf},cfg:{performancePCP:confirmar}},{papel:'pcp',nome:'Gestor'});
 assert.equal(r.ok,true,JSON.stringify(r));
 const atual=e.db.pcp_config_global[0].config.performancePCP;
 const outra={equipes:[eq('x'),eq('y'),{...eq('z'),membros:[{chave:'3',nome:'C'}]},{...eq('k'),membros:[{chave:'3',nome:'C'}]}],participacoes:atual.participacoes};
 const n=await e.call({action:'setCfg',baseCfg:{performancePCP:atual},cfg:{performancePCP:outra}},{papel:'pcp',nome:'Gestor'});
 assert.equal(n.status,409);assert.equal(n.conflitoCfg,true);
});
test('pesos da nota mudados em dois aparelhos viram conflito, não uma soma de 110', async () => {
 const perf={equipes:[],participacoes:[],criterios:{producao:60,limpeza:20,equipamentos:20}};
 const e=await edge('pcp-sync',{pcp_config_global:[{id:true,config:{performancePCP:perf},atualizado_em:'2026-09-19T10:00:00Z'}]});
 const a=await e.call({action:'setCfg',baseCfg:{performancePCP:perf},cfg:{performancePCP:{...perf,criterios:{producao:50,limpeza:30,equipamentos:20}}}},{papel:'pcp',nome:'A'});
 assert.equal(a.ok,true);
 const b=await e.call({action:'setCfg',baseCfg:{performancePCP:perf},cfg:{performancePCP:{...perf,criterios:{producao:60,limpeza:10,equipamentos:30}}}},{papel:'pcp',nome:'B'});
 assert.equal(b.status,409,JSON.stringify(b));assert.equal(b.conflitoCfg,true);
 assert.deepEqual({...e.db.pcp_config_global[0].config.performancePCP.criterios},{producao:50,limpeza:30,equipamentos:20});
});
test('pesos: dois ajustes válidos que tocam chaves diferentes não viram uma soma torta (90) sem conflito', async () => {
 const perf={equipes:[],participacoes:[],criterios:{producao:60,limpeza:20,equipamentos:20}};
 const e=await edge('pcp-sync',{pcp_config_global:[{id:true,config:{performancePCP:perf},atualizado_em:'2026-09-19T10:00:00Z'}]});
 await e.call({action:'setCfg',baseCfg:{performancePCP:perf},cfg:{performancePCP:{...perf,criterios:{producao:60,limpeza:10,equipamentos:30}}}},{papel:'pcp',nome:'A'});
 const b=await e.call({action:'setCfg',baseCfg:{performancePCP:perf},cfg:{performancePCP:{...perf,criterios:{producao:50,limpeza:20,equipamentos:30}}}},{papel:'pcp',nome:'B'});
 assert.equal(b.status,409,JSON.stringify(b));
 assert.deepEqual({...e.db.pcp_config_global[0].config.performancePCP.criterios},{producao:60,limpeza:10,equipamentos:30});
});
test('ERP lento numa situação: o que chegou entra (O.S. nova e situação), e NADA é fechado com a carteira incompleta', async () => {
 const aberta=row('mub-50',{numero:'50',origemMubisys:true,cliente:'Fora da lista parcial'});
 const e=await edge('pcp-mubisys',{pcp_registros:[aberta,row('mub-51',{numero:'51',origemMubisys:true,cliente:'B',statusERP:'PRODUCAO'})]});
 e.run(`erpGet=async url=>{const s=new URL(url).searchParams.get('status');if(s==='PAUSADO')throw Error('o ERP (Mubisys) nao respondeu em 48s');return s==='CONCLUIDO'?[{numero:'51',cliente:'B'},{numero:'52',cliente:'Nova'}]:[]}`);
 const carteira=await e.run(`buscarCarteira('https://erp.invalid','key',{},'2026-09-23',50000)`);
 assert.equal(Object.keys(carteira.falhas).join(),'PAUSADO');
 assert.equal(Object.keys(carteira.tempos).sort().join(),'CONCLUIDO,PAUSADO,PENDENTE,PRODUCAO');
 const r=await e.run('conciliarOuImportar(sb,'+JSON.stringify(carteira)+')');
 assert.equal(r.carteiraCompleta,false);assert.equal(r.novas,1);assert.equal(r.arquivadas,0);
 assert.equal(Array.from(r.situacoesSemResposta).join(),'PAUSADO');
 const reg=id=>e.db.pcp_registros.find(x=>x.id===id).registro;
 assert.equal(reg('mub-50').finalizadaEm,undefined,'fora da lista parcial NÃO é fechada');
 assert.equal(reg('mub-50').erpSaiuDaCarteiraEm,undefined);
 assert.equal(reg('mub-51').statusERP,'CONCLUIDO','a situação das que responderam entra');
 assert.ok(e.db.pcp_registros.find(x=>x.id==='mub-52'),'a O.S. nova entra');
});
test('ERP sem resposta nenhuma: a rodada falha (não finge sucesso vazio)', async () => {
 const e=await edge('pcp-mubisys',{pcp_registros:[]});
 e.run(`erpGet=async()=>{throw Error('o ERP (Mubisys) nao respondeu em 48s')}`);
 const carteira=await e.run(`buscarCarteira('https://erp.invalid','key',{},'2026-09-23',50000)`);
 await assert.rejects(e.run('conciliarOuImportar(sb,'+JSON.stringify(carteira)+')'),/nao respondeu/);
});
test('batimento guarda desde quando a carteira não vem completa', async () => {
 const e=await edge('pcp-mubisys',{pcp_meta:[{chave:'sync_status',valor:{em:'2026-09-23T10:20:00Z',ok:true,carteiraCompleta:true}}]});
 await e.run(`gravarBatimento({em:'2026-09-23T11:20:00Z',ok:true,carteiraCompleta:false,situacoesSemResposta:['PAUSADO']})`);
 let st=e.db.pcp_meta.find(x=>x.chave==='sync_status').valor;
 assert.equal(st.ultimaCarteiraCompleta,'2026-09-23T10:20:00Z');
 await e.run(`gravarBatimento({em:'2026-09-23T12:20:00Z',ok:true,carteiraCompleta:true})`);
 st=e.db.pcp_meta.find(x=>x.chave==='sync_status').valor;
 assert.equal(st.ultimaCarteiraCompleta,'2026-09-23T12:20:00Z');
});

test('conciliação lê TODAS as O.S. mesmo passando de 1000 (o banco corta calado aos 1000)', async () => {
 const linhas=[];
 for(let i=0;i<1100;i++){const n=String(10000+i);linhas.push(row('mub-'+n,{numero:n,origemMubisys:true,cliente:'C'+n}));}
 // a última (fora das 1000 primeiras) saiu da carteira e não tem trabalho de gente: tem de ser vista e arquivada
 const e=await edge('pcp-mubisys',{pcp_registros:linhas});
 const carteira=linhas.slice(0,1099).map(l=>({numero:l.registro.numero,cliente:l.registro.cliente}));
 const r=await e.run('reconciliarCarteira(sb,'+JSON.stringify(carteira)+')');
 assert.equal(r.arquivadas,1);
 assert.equal(e.db.pcp_registros[1099].registro.baixaAutoERP.status,'FORA DA CARTEIRA ABERTA');
});

test('valores das O.S.: a O.S. número 1001 em diante também recebe valor (o banco corta calado aos 1000)', async () => {
 const os=[], ordens=[];
 for(let i=0;i<1100;i++){const n=String(20000+i);os.push(row('mub-'+n,{numero:n,origemMubisys:true}));ordens.push({numero:n,valor:100+i,data:'2026-09-01'});}
 const e=await edge('pcp-sync',{pcp_registros:os,painel_ordens:ordens});
 const r=await e.call({action:'valores'},{papel:'pcp',nome:'Gestor'});
 assert.equal(r.status,200);
 assert.equal(r.valores['21099'],1199,'a última O.S. também tem valor');
 assert.equal(Object.keys(r.valores).length,1100);
});
/* DECISÃO (B) DO LÉO, 23/09/2026: "O instalador finaliza, e o espelho passa a
   pedir a foto do serviço pronto." Antes, o servidor descartava calado o
   finalizadaEm e os itens que vinham do crachá de toque: o instalador via
   "finalizada", o PCP não via nada, e o retrabalho marcado item a item sumia. */
const toque={nome:'Ana',papel:'montagem',montagemIndividual:true};
const pronta=(extra={})=>row('1',{numero:'1',tipo:'externo',cliente:'Cliente',equipe:['Ana'],liberadoPCP:true,confirmacao:'Confirmado',
  itens:[{item:'1',descricao:'Fachada',medidas:'3x1',valorUnit:'900',statusInst:''},{item:'2',descricao:'Placa',valorUnit:'100',statusInst:''}],...extra});
test('toque no nome: finalizar sem a foto do serviço pronto é recusado e nada é gravado',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[pronta()]});
 const r=await e.call({action:'upsert',os:{id:'1',rev:1,finalizadaEm:'2026-09-23T15:00:00-03:00',finalizadoPor:'Ana',horaRetorno:'15:00',retornoEm:'2026-09-23T15:00:00'}},toque);
 assert.equal(r.status,422);assert.match(r.error,/foto do serviço concluído/);
 assert.equal(e.db.pcp_registros[0].registro.finalizadaEm,undefined);
});
test('toque no nome: não finaliza O.S. que o PCP não liberou nem a que o cliente não confirmou',async()=>{
 const os={id:'1',rev:1,finalizadaEm:'2026-09-23T15:00:00-03:00',fotosRetornoIds:['f1'],horaRetorno:'15:00',retornoEm:'2026-09-23T15:00:00'};
 let e=await edge('pcp-sync',{pcp_registros:[pronta({liberadoPCP:false})]});
 let r=await e.call({action:'upsert',os},toque);assert.equal(r.status,422);assert.match(r.error,/PCP/);
 e=await edge('pcp-sync',{pcp_registros:[pronta({confirmacao:''})]});
 r=await e.call({action:'upsert',os},toque);assert.equal(r.status,422);assert.match(r.error,/cliente/);
 assert.equal(e.db.pcp_registros[0].registro.finalizadaEm,undefined);
});
test('toque no nome: com foto e retorno a finalização chega ao banco, com o autor do crachá e os itens',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[pronta()]});
 const r=await e.call({action:'upsert',os:{id:'1',rev:1,cliente:'Forjado',finalizadaEm:'2026-09-23T15:05:00-03:00',finalizadoPor:'Outro nome',
   fotosRetornoIds:['f1'],horaRetorno:'15:00',retornoEm:'2026-09-23T15:00:00',conferidoPor:'Ana',retrabalho:true,causa:'Medida errada',problema:'2: Medida errada',
   checkout:{situacao:'Finalizado',confirmado:true},
   itens:[{item:'1',descricao:'Fachada',medidas:'3x1',valorUnit:'1',statusInst:'ok',pronto:true},
          {item:'2',descricao:'Placa',valorUnit:'100',statusInst:'retrab',motivo:'Medida errada',obsProb:'faltou 10cm',fotoProbId:'fp'},
          {item:'3',descricao:'Item que o aparelho inventou'}]}},toque);
 assert.equal(r.status,200);
 const g=e.db.pcp_registros[0].registro;
 assert.equal(g.finalizadaEm,'2026-09-23T15:05:00-03:00');assert.equal(g.finalizadoPor,'Ana');
 assert.equal(g.cliente,'Cliente');assert.equal(g.conferidoPor,'Ana');assert.equal(g.retrabalho,true);assert.equal(g.causa,'Medida errada');
 assert.equal(g.itens.length,2);
 assert.equal(g.itens[0].statusInst,'ok');assert.equal(g.itens[0].pronto,true);assert.equal(g.itens[0].valorUnit,'900');
 assert.equal(g.itens[1].statusInst,'retrab');assert.equal(g.itens[1].motivo,'Medida errada');assert.equal(g.itens[1].fotoProbId,'fp');
});
test('toque no nome: item que mudou de lugar não recebe a marca do outro',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[pronta()]});
 const r=await e.call({action:'upsert',os:{id:'1',rev:1,itens:[{item:'2',descricao:'Placa',statusInst:'retrab'},{item:'1',descricao:'Fachada',statusInst:'ok'}]}},toque);
 assert.equal(r.status,200);
 const g=e.db.pcp_registros[0].registro;assert.equal(g.itens[0].statusInst,'');assert.equal(g.itens[1].statusInst,'');
});
test('toque no nome: não reabre nem troca o autor de O.S. já finalizada',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[pronta({finalizadaEm:'2026-09-23T10:00:00Z',finalizadoPor:'Gestor',fotosRetornoIds:['f0'],retornoEm:'2026-09-23T09:00:00'})]});
 let r=await e.call({action:'upsert',os:{id:'1',rev:1,finalizadaEm:'',obsTecnicas:'x'}},toque);assert.equal(r.status,200);
 let g=e.db.pcp_registros[0].registro;assert.equal(g.finalizadaEm,'2026-09-23T10:00:00Z');assert.equal(g.finalizadoPor,'Gestor');assert.equal(g.reabertaEm,undefined);
 r=await e.call({action:'upsert',os:{id:'1',rev:2,finalizadaEm:'2026-09-23T18:00:00Z'}},toque);assert.equal(r.status,200);
 g=e.db.pcp_registros[0].registro;assert.equal(g.finalizadaEm,'2026-09-23T10:00:00Z');assert.equal(g.finalizadoPor,'Gestor');
});
test('toque no nome: a foto do problema de um item pode ser aberta pela equipe',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[pronta({itens:[{item:'1',descricao:'Fachada',fotoProbId:'fp'}]})]});
 assert.notEqual((await e.call({action:'getPhoto',fileId:'fp'},toque)).status,403);
 assert.equal((await e.call({action:'getPhoto',fileId:'de-outra-os'},toque)).status,403);
});
/* A VOLTA DO CARRO (24/09/2026): "arrumado", "sem avaria" e as fotos da volta. */
test('volta do carro: gestão grava arrumado, avaria e fotos; carimbo do crachá', async () => {
 const e = await edge('pcp-sync', {pcp_registros:[volta({})]});
 const r = await e.call({action:'upsert', os:{...e.db.pcp_registros[0].registro, retornoConf:{carroLimpo:'sim', carroArrumado:'nao', equipamentosOk:'sim', semAvaria:'nao', obs:'caçamba cheia de sobra', fotos:['f1', '', 3, 'f2']}}}, {papel:'pcp', nome:'Gestor', sub:'g'});
 assert.equal(r.status, 200);
 const rc = e.db.pcp_registros[0].registro.retornoConf;
 assert.equal(rc.carroArrumado, 'nao'); assert.equal(rc.semAvaria, 'nao'); assert.equal(rc.fotos.join(), 'f1,f2');
 assert.equal(rc.por, 'Gestor');
});
test('volta do carro: aba na v127 (não conhece "arrumado") não apaga a resposta nem as fotos', async () => {
 const antes = {carroLimpo:'sim', carroArrumado:'nao', equipamentosOk:'sim', semAvaria:'sim', obs:'', fotos:['f1'], por:'Gestor', porId:'g', em:'2026-09-24T15:00:00Z'};
 const e = await edge('pcp-sync', {pcp_registros:[volta({retornoConf:antes})]});
 await e.call({action:'upsert', os:{...e.db.pcp_registros[0].registro, retornoConf:{carroLimpo:'sim', equipamentosOk:'sim', obs:'', por:'Gestor', em:antes.em}}}, {papel:'pcp', nome:'Outro'});
 const rc = e.db.pcp_registros[0].registro.retornoConf;
 assert.equal(rc.carroArrumado, 'nao'); assert.equal(rc.fotos.join(), 'f1');
 assert.equal(rc.por, 'Gestor', 'nada mudou nas respostas, o autor fica');
});
test('volta do carro: mudar só o "arrumado" é conferência nova e troca o autor', async () => {
 const antes = {carroLimpo:'sim', carroArrumado:'sim', equipamentosOk:'sim', semAvaria:'sim', obs:'', fotos:[], por:'Gestor', porId:'g', em:'2026-09-24T15:00:00Z'};
 const e = await edge('pcp-sync', {pcp_registros:[volta({retornoConf:antes})]});
 await e.call({action:'upsert', os:{...e.db.pcp_registros[0].registro, retornoConf:{...antes, carroArrumado:'nao'}}}, {papel:'admin', nome:'Léo', sub:'leo'});
 const rc = e.db.pcp_registros[0].registro.retornoConf;
 assert.equal(rc.carroArrumado, 'nao'); assert.equal(rc.por, 'Léo'); assert.notEqual(rc.em, antes.em);
});
