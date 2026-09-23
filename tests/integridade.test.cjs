const {test} = require('node:test');
const assert = require('node:assert/strict');
const regras = import('../supabase/functions/_shared/pcp-integridade.mjs');
test('ERP atualiza origem, inclusive zero, e preserva todo trabalho humano', async()=>{
 const {atualizarOrigemERP}=await regras;
 const os={origemMubisys:true,cliente:'Antigo',valorTotal:100,rev:2,equipe:['A'],instalacao:{data:'2026-09-20'},fotosRetornoIds:['foto'],obsPCP:'Humano'};
 const r=atualizarOrigemERP(os,{cliente:'Novo',valorTotal:0,equipe:[],obsPCP:'Outro'},'2026-09-19T12:00:00Z');
 assert.equal(r.registro.cliente,'Novo');assert.equal(r.registro.valorTotal,0);assert.equal(r.registro.rev,3);
 assert.deepEqual(r.registro.equipe,['A']);assert.deepEqual(r.registro.fotosRetornoIds,['foto']);assert.equal(r.registro.obsPCP,'Humano');
 assert.equal(atualizarOrigemERP(r.registro,{cliente:'Novo',valorTotal:0},'depois').alteracoes.length,0);
 assert.equal(atualizarOrigemERP({...os,finalizadaEm:'ontem'},{cliente:'Novo'},'agora').alteracoes.length,0);
});
test('ERP incompleto não apaga dados existentes',async()=>{
 const {atualizarOrigemERP}=await regras;const o={origemMubisys:true,cliente:'A',valorTotal:100};
 assert.equal(atualizarOrigemERP(o,{cliente:'',valorTotal:null},'agora').alteracoes.length,0);
});
test('config: dois aparelhos adicionam plantões e campos sem perder nenhum',async()=>{
 const {mesclarConfiguracao:m}=await regras;
 const base={agendaPCP:{plantoes:[{id:'1',obs:'a'}]},tema:'azul'};
 const a={...base,agendaPCP:{plantoes:[{id:'1',obs:'b'},{id:'2',obs:'novo'}]}};
 const b={...base,agendaPCP:{plantoes:[{id:'1',obs:'a'},{id:'3',obs:'outro'}]},tema:'verde'};
 const r=m(base,a,b);assert.deepEqual(r.conflitos,[]);assert.equal(r.cfg.tema,'verde');assert.equal(r.cfg.agendaPCP.plantoes.length,3);assert.equal(r.cfg.agendaPCP.plantoes[0].obs,'b');
});
test('config: alteração concorrente e exclusão conflitante são explícitas',async()=>{
 const {mesclarConfiguracao:m}=await regras;
 const b={agendaPCP:{plantoes:[{id:'1',obs:'a'}]}};
 assert.deepEqual(m(b,{agendaPCP:{plantoes:[{id:'1',obs:'b'}]}},{agendaPCP:{plantoes:[{id:'1',obs:'c'}]}}).conflitos,['agendaPCP.plantoes[1].obs']);
 assert.equal(m(b,{agendaPCP:{plantoes:[]}},{agendaPCP:{plantoes:[{id:'1',obs:'c'}]}}).conflitos.length,1);
});
test('saída e retorno atravessam meia-noite, preservam autor e rejeitam data inválida',async()=>{
 const {validarMomentos:v,carimbarExecucao:c}=await regras;
 const os={saidaEm:'2026-09-19T23:30:00-03:00',retornoEm:'2026-09-20T01:00:00-03:00',saidaPor:'forjado'};
 assert.equal(v(os),'');assert.match(v({...os,retornoEm:'2026-09-19T01:00:00-03:00'}),/anterior/);assert.match(v({...os,saidaEm:'inválida'}),/inválida/);
 const r=c(os,{},'Pessoa autenticada','2026-09-20T10:00:00Z');assert.equal(r.saidaPor,'Pessoa autenticada');assert.equal(r.retornoPor,'Pessoa autenticada');assert.equal(r.saidaEm,os.saidaEm);
});
test('escopo da equipe compara nome completo normalizado sem correspondência parcial',async()=>{
 const {pertenceEquipe:p}=await regras;assert.equal(p({equipe:['João Silva']},'joao silva'),true);assert.equal(p({equipe:['João Silva']},'João'),false);
});

/* Selo "ERP mudou · conferir" (auditoria de 23/09/2026): só acende quando o ERP
   muda um dado que já existia. */
test('selo do ERP: valor que chega pela primeira vez e o valor em R$ não pedem conferência', async () => {
 const {atualizarOrigemERP} = await regras;
 const os = {origemMubisys:true, cliente:'A', cnpjCpf:'', valorTotal:100};
 const r = atualizarOrigemERP(os, {cnpjCpf:'12.345.678/0001-90', valorTotal:250, vendedor:'Bia'}, '2026-09-20T10:00:00Z');
 assert.equal(r.alteracoes.length, 3, 'as três mudanças ficam registradas');
 assert.equal(r.registro.erpConferirEm, undefined, 'mas nenhuma pede conferência');
 const r2 = atualizarOrigemERP(r.registro, {cliente:'B'}, '2026-09-21T10:00:00Z');
 assert.equal(r2.registro.erpConferirEm, '2026-09-21T10:00:00Z', 'cliente trocado pede');
});

test('situação do ERP: aceita as quatro da carteira (com ou sem acento), ignora o resto e O.S. finalizada', async () => {
 const {atualizarSituacaoERP}=await regras;
 assert.equal(atualizarSituacaoERP({statusERP:'PRODUCAO'},'PRODUÇÃO','t'),null,'mesma situação: nada a gravar');
 assert.equal(atualizarSituacaoERP({statusERP:'PRODUCAO'},'concluido','t').statusERP,'CONCLUIDO');
 assert.equal(atualizarSituacaoERP({},'ENTREGUE','t'),null);
 assert.equal(atualizarSituacaoERP({finalizadaEm:'x'},'CONCLUIDO','t'),null);
});
test('trabalho de gente: data e período vindos do ERP não contam; equipe, liberação, confirmação, parado e rua contam', async () => {
 const {temTrabalhoHumano}=await regras;
 assert.equal(temTrabalhoHumano({instalacao:{data:'2026-09-23',periodo:'Manhã'},previsaoEntrega:'2026-09-23'}),false);
 for (const o of [{equipe:['Ana']},{liberadoPCP:true},{confirmacao:'Confirmado'},{paradoClienteEm:'x'},{horaSaida:'08:00'}]) assert.equal(temTrabalhoHumano(o),true,JSON.stringify(o));
 assert.equal(temTrabalhoHumano({horaSaida:'08:00',horaRetorno:'12:00'}),false,'saída com retorno já passou');
 assert.equal(temTrabalhoHumano({equipe:['  ']}),false,'nome em branco não é equipe');
});
