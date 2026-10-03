const {test}=require('node:test');
const assert=require('node:assert/strict');
const P=require('../performance.js');
const {edge}=require('./helpers/edge.cjs');
const membro={chave:'100001',nome:'Pessoa fictícia',percentual:100};
const registro=(id,fracaoOS,valor=100)=>({id,osId:'os-a',entregaId:id,fracaoOS,valor,confirmado:true,membros:[membro],equipeId:'aguia',equipeNome:'Águia'});
test('ranking de equipes não aumenta quando a mesma O.S. é fracionada',()=>{
 const duas=P.resumir([registro('a',.25,25),registro('b',.75,75)]).equipes[0];
 assert.equal(duas.equivalentes,1);assert.equal(duas.os,2);assert.equal(duas.valor,100);
 const uma=P.resumir([{...registro('a',1),entregaId:undefined}]).equipes[0];
 assert.equal(duas.equivalentes,uma.equivalentes);
});
test('produção proporcional se conserva entre equipes e pessoas',()=>{
 const r={...registro('a',.5),membros:[{...membro,percentual:60},{chave:'100002',nome:'Outra pessoa',percentual:40}],grupos:[{equipeId:'a',cota:6000,membros:['100001']},{equipeId:'b',cota:4000,membros:['100002']}]};
 const s=P.resumir([r]);assert.equal(s.equipes.find(e=>e.chave==='a').equivalentes,.3);assert.equal(s.equipes.find(e=>e.chave==='b').equivalentes,.2);
 assert.equal(s.equipes.reduce((t,e)=>t+e.equivalentes,0),.5);
});
test('parcial sem fração não vira uma O.S. inteira nem conquista de produção',()=>{
 const r=registro('a',undefined,null);assert.equal(P.resumir([r]).equipes[0].equivalentes,0);
 assert.equal(P.resumir([r]).pessoas[0].equivalentes,0);
});
test('auditoria distingue pendências, parciais, valores e não chama falta de dado de erro financeiro',()=>{
 const a=P.auditar([registro('a',.25,25),{...registro('b',.75,null),confirmado:false,retornoConf:null}]);
 assert.equal(a.total,2);assert.equal(a.os,1);assert.equal(a.parciais,2);assert.equal(a.confirmadas,1);
 assert.equal(a.valorConfirmado,25);assert.equal(a.semValor,1);assert.equal(a.aConferir,1);
 assert.ok(a.pendencias.some(p=>p.tipo==='sem-valor'));assert.ok(a.pendencias.some(p=>p.tipo==='pendente'));
 assert.equal(a.pronta,false);
});
test('conquistas exigem evidência: nomes confirmados não confirmam carro ou equipamento',()=>{
 const r={...registro('a',1),voltou:true,volta:'viagem1'};
 let a=P.auditar([r]);assert.equal(a.voltas,1);assert.equal(a.voltasConferidas,0);assert.equal(a.pronta,false);
 a=P.auditar([{...r,retornoConf:{carroLimpo:'sim',carroArrumado:'sim',equipamentosOk:'nao',semAvaria:'sim'}}]);
 assert.equal(a.voltasConferidas,1);assert.equal(a.pronta,true);
 assert.equal(a.voltasSemOcorrencia,0);
});
test('auditoria acusa repetição de registro, percentuais inválidos e soma parcial acima da O.S.',()=>{
 const r=registro('a',.75);const a=P.auditar([r,r,{...registro('b',.75),membros:[{...membro,percentual:80}]}]);
 assert.ok(a.pendencias.some(p=>p.tipo==='duplicado'));assert.ok(a.pendencias.some(p=>p.tipo==='invalida'));assert.ok(a.pendencias.some(p=>p.tipo==='excesso'));
 assert.equal(a.pendencias.find(p=>p.tipo==='excesso').id,'a','abre uma entrega da O.S. afetada');
 assert.equal(a.pronta,false);
});
test('dinheiro de equipe soma em centavos sem resíduo binário',()=>{
 assert.equal(P.resumir([registro('a',.5,.1),registro('b',.5,.2)]).equipes[0].valor,.3);
});
test('apuração integral sem líquido não usa soma de subtotais como dívida ou comissão',async()=>{
 const os={id:'a',numero:'99',tipo:'externo',finalizadaEm:'2026-09-10T12:00:00Z',finalizadoPor:'Pessoa',equipe:[],valorTotal:null,itens:[{subtotal:100},{descricao:'sem preço'}]};
 const e=await edge('pcp-sync',{pcp_registros:[{id:'a',colecao:'os',apagado:false,registro:os}]});
 const r=await e.call({action:'performancePeriodo',de:'2026-09-01',ate:'2026-09-30'},{papel:'pcp'});
 assert.equal(r.registros[0].valor,null);assert.equal(r.registros[0].origemValor,'Sem valor');
});
test('ERP com número duplicado não escolhe silenciosamente o último preço',async()=>{
 const os={id:'a',numero:'99',tipo:'externo',finalizadaEm:'2026-09-10T12:00:00Z',finalizadoPor:'Pessoa',equipe:[],valorTotal:150,itens:[]};
 const e=await edge('pcp-sync',{pcp_registros:[{id:'a',colecao:'os',apagado:false,registro:os}],painel_ordens:[{numero:'99',valor:100},{numero:'99',valor:200}]});
 const r=await e.call({action:'performancePeriodo',de:'2026-09-01',ate:'2026-09-30'},{papel:'pcp'});
 assert.equal(r.registros[0].valor,150);assert.equal(r.registros[0].origemValor,'O.S. do PCP');assert.match(r.registros[0].avisoValor,/mais de um/);assert.ok(P.auditar(r.registros).pendencias.some(p=>p.tipo==='valor-erp'));
});
test('dossiê e ranking conservam os mesmos centavos e não creditam fração desconhecida',()=>{
 const rs=[registro('a',.5,.1),registro('b',.5,.2),registro('c',undefined,null)];
 const d=P.dossie(rs)[0];assert.equal(d.valor,.3);assert.equal(d.membros[0].equivalentes,1);
});
test('TV usa produção confirmada proporcional, sem promover quem só tem sugestão',()=>{
 const fs=require('node:fs'),vm=require('node:vm');
 const s=fs.readFileSync(require('node:path').join(__dirname,'../casa.js'),'utf8');
 const rs=[registro('a',.25,25),registro('b',.75,75),{...registro('c',1,100),confirmado:false,equipeId:'leao',equipeNome:'Leão'}];
 const ctx={PERF:P,STATE:{},perfConfig:()=>({equipes:[]}),perfLista:()=>rs,perfRegistro:r=>r,perfUnirPessoas:r=>r,perfFonteAtual:()=>({}),diaEntrega:()=>'',OPERACAO:{emIntervalo:()=>true},esc:String,avatarRH:()=>'',pessoasRH:()=>[],perfFormato:n=>String(n),carrosHTML:()=>'',retrabalhoHTML:()=>'',rotuloPeriodoCasa:()=>''};
 vm.createContext(ctx);vm.runInContext(s.slice(s.indexOf('function painelTVCasa('),s.indexOf('function rotuloPeriodoCasa(')),ctx);
 const html=ctx.painelTVCasa(0,{}).html;assert.match(html,/1 O.S. equivalentes/);assert.doesNotMatch(html,/Leão/);assert.match(html,/Produção confirmada/);
});
test('cache de valores não converte ausência em zero nem escolhe entre duplicados do ERP',async()=>{
 const ns=['1','2','3','4','5'];const e=await edge('pcp-sync',{pcp_registros:ns.map(numero=>({id:'os'+numero,colecao:'os',apagado:false,registro:{numero}})),painel_ordens:[{numero:'1',valor:100},{numero:'1',valor:200},{numero:'2',valor:null},{numero:'3',valor:''},{numero:'4',valor:-1},{numero:'5',valor:0}]});
 const r=await e.call({action:'valores'},{papel:'pcp'});assert.deepEqual(r.valores,{'5':0});
});
test('tela explica por que valor conflitante impede fechar',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),s=fs.readFileSync(require('node:path').join(__dirname,'../performance.js'),'utf8');
 const ctx={perfRemoto:{},perfHojeISO:()=> '2026-10-02'};vm.createContext(ctx);
 vm.runInContext(s.slice(s.indexOf('function perfFechamentoBloqueio('),s.indexOf('function perfFonteHTML(')),ctx);
 const f={periodo:{ate:'2026-10-01'},registros:[{numero:'20980',valor:100,confirmado:true,avisoValor:'Conflito no ERP'}]};
 assert.match(ctx.perfFechamentoBloqueio(f,0),/valores conflitantes.*20980/);
 delete f.registros[0].avisoValor;assert.equal(ctx.perfFechamentoBloqueio(f,0),'');
});
