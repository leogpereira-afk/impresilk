const {test}=require('node:test'),assert=require('node:assert/strict');
const {edge}=require('./helpers/edge.cjs'),D=require('../diagnostico-itens.js'),A=require('../alertas-sync.js'),C=require('../conferencia-entrega.js');
const original=()=>({id:'o',numero:'QA-1',tipo:'externo',rev:1,equipe:['Ana'],cliente:'Cliente fictício',valorTotal:18000,itens:[{uid:'a',item:1,descricao:'Placa',qtde:4,subtotal:12000,valorUnit:3000},{uid:'b',item:2,descricao:'Adesivo',qtde:3,subtotal:8000}],erpAlteracoes:[{campos:[{campo:'valorTotal',antes:20000,depois:18000}]}]});
test('servidor omite monetários em list e upsert restritos e mantém valores ao reordenar/fotografar',async()=>{
 for(const papel of ['montagem','operacao','comercial']){
 const o=original(),e=await edge('pcp-sync',{pcp_registros:[{id:'o',colecao:'os',apagado:false,registro:o}],registros:[]});
 const who={papel,nome:'Ana'},r=await e.call({action:'list'},who);assert.equal(r.status,200);assert.equal(r.os[0].valorTotal,undefined);assert.equal(r.os[0].itens[0].subtotal,undefined);assert.equal(r.os[0].erpAlteracoes,undefined);
 if(papel==='comercial')continue;
 const up=await e.call({action:'upsert',os:{...r.os[0],itens:r.os[0].itens.slice().reverse(),fotosCheckinIds:['foto-ficticia']}},who);
 assert.equal(up.status,200,JSON.stringify(up));assert.equal(up.os.valorTotal,undefined);
 const saved=e.db.pcp_registros.find(r=>r.id==='o').registro;assert.equal(saved.valorTotal,18000);assert.equal(saved.itens.find(i=>i.uid==='a').subtotal,12000);assert.deepEqual(saved.fotosCheckinIds,['foto-ficticia']);
 const gestao=await e.call({action:'list'},{papel:'pcp'});assert.equal(gestao.os[0].valorTotal,18000);
 }
});
test('payload financeiro forjado não altera valores e conflito não os revela',async()=>{
 const o=original(),e=await edge('pcp-sync',{pcp_registros:[{id:'o',colecao:'os',apagado:false,registro:o}]});
 const r=await e.call({action:'upsert',os:{...o,valorTotal:1,itens:o.itens.map(i=>({...i,subtotal:1}))}},{papel:'operacao'});
 assert.equal(r.status,200,JSON.stringify(r));assert.equal(e.db.pcp_registros[0].registro.valorTotal,18000);
 const conflict=await e.call({action:'upsert',os:{...o,rev:1}},{papel:'operacao'});assert.equal(conflict.conflito,true);assert.equal(conflict.servidor.valorTotal,undefined);
});
test('diagnóstico distingue sem UID, alternativa válida, ambiguidade e referência órfã sem alterar dados',()=>{
 const o=original(),cat=C.catalogo(o);o.conferenciasEntrega=[{id:'e',dia:'2026-10-01',itens:[{...cat[0],qtde:1}]}];const antes=JSON.stringify(o);o.itens.reverse();assert.equal(C.validar(o,o.conferenciasEntrega),'');assert.equal(D.medir([o]).linhas[0].referenciasOrfas,0);
 delete o.itens[0].uid;assert.equal(D.medir([o]).linhas[0].alternativasValidas,1);o.itens.push({...o.itens[0]});const r=D.medir([o]);assert.equal(r.semUID,2);assert.equal(r.ambiguos,2);assert.equal(r.mesclaAutomatica,false);assert.ok(antes.includes('18000'));
});
test('fila: data inválida ignorada, mais antiga preservada, offline/sessão/recusa e incidentes deduplicados',()=>{
 const agora=Date.parse('2026-10-03T12:00:00Z'),q=[{enfileiradoEm:'inválida'},{enfileiradoEm:'2026-10-03T10:00:00Z'},{enfileiradoEm:'2026-10-03T11:00:00Z'}];
 assert.equal(Date.parse(A.fila(q,{agora}).desde),Date.parse(q[1].enfileiradoEm));assert.equal(A.fila(q,{agora,online:false}).tipo,'offline');assert.equal(A.fila(q,{agora,sessao:false}).tipo,'sem-sessao');assert.equal(A.fila(q,{agora,recusada:true}).tipo,'recusa');
 const m=new Map(),s={getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)},v=A.fila(q,{agora});assert.equal(A.registrar(s,'fila',v).notificar,true);assert.equal(A.registrar(s,'fila',v).notificar,false);assert.equal(A.registrar(s,'fila',null).recuperou,true);assert.equal(A.registrar(s,'fila',v).notificar,true);
});

test('recuperação isolada valida hashes, relações, idempotência, corrupção e interrupção',()=>{assert.equal(require('../scripts/ensaio-recuperacao.cjs').executar().checks.length,10);});
test('projeção cache e servidor equivalentes, configurações/legados financeiros recursivos',async()=>{
 const server=await import('../supabase/functions/_shared/pcp-integridade.mjs'),client=require('../privacidade-valores.js');
 const v={...original(),catalogo:[{valor:123,preco:456,custo:789,descricao:'Mantida'}],bonusPCP:{orcamento:900},performancePCP:{equipes:[{nome:'Águia'}]}};
 assert.deepEqual(client.podar(v),server.podarValoresPCP(v));assert.deepEqual(client.podar(v).catalogo,[{descricao:'Mantida'}]);assert.equal(client.podar(v).bonusPCP,undefined);
});
test('fixture extensa traz 180 linhas e nomes/valores íntegros, restritos sem coluna financeira',()=>{
 const {pagina}=require('../scripts/preview-relatorios.cjs');const admin=pagina('/?papel=admin&modo=mes'),restrito=pagina('/?papel=montagem');
 assert.match(admin,/QA-0180/);assert.match(admin,/123\.456\.789,99/);assert.match(admin,/2026-10-31/);assert.doesNotMatch(restrito,/123\.456\.789,99|<th>Valor completo/);assert.match(restrito,/table-header-group/);
});
test('item legado financeiro não perde valor em alteração de identidade pelo perfil restrito',async()=>{
 const o=original();delete o.itens[0].uid;const e=await edge('pcp-sync',{pcp_registros:[{id:'o',colecao:'os',apagado:false,registro:o}]});
 const r=await e.call({action:'list'},{papel:'operacao'});r.os[0].itens[0].descricao='Outro produto';
 assert.equal((await e.call({action:'upsert',os:r.os[0]},{papel:'operacao'})).status,422);assert.equal(e.db.pcp_registros[0].registro.itens[0].subtotal,12000);
});
test('payload omitido/malformado não apaga ramos financeiros armazenados',async()=>{
 const {preservarValoresPCP}=await import('../supabase/functions/_shared/pcp-integridade.mjs'),o=original();
 for(const novo of [{id:o.id},{id:o.id,itens:null}]){const r=preservarValoresPCP(novo,o);assert.equal(r.valorTotal,18000);assert.equal(r.itens[0].subtotal,12000);}
});
test('cache previamente da gestão não expõe montantes após trocar papel e mantém operação editável',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),m=new Map([['impresilk_inst_os',JSON.stringify([original()])]]);
 const ctx=vm.createContext({console,navigator:{onLine:false},window:{addEventListener(){}},localStorage:{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)},setTimeout:()=>1,clearTimeout(){},AbortController});
 vm.runInContext(fs.readFileSync('privacidade-valores.js','utf8'),ctx);vm.runInContext(fs.readFileSync('store.js','utf8'),ctx);
 vm.runInContext("STORE.setUser({papel:'pcp'})",ctx);assert.equal(vm.runInContext("STORE.getOS('o').valorTotal",ctx),18000);
 vm.runInContext("STORE.setUser({papel:'montagem'})",ctx);assert.equal(vm.runInContext("STORE.getOS('o').valorTotal",ctx),undefined);assert.equal(vm.runInContext("STORE.getAllOS()[0].itens[0].subtotal",ctx),undefined);
 vm.runInContext("STORE.saveOS({...STORE.getOS('o'),fotosCheckinIds:['foto-teste']})",ctx);assert.equal(vm.runInContext("STORE.getOS('o').fotosCheckinIds[0]",ctx),'foto-teste');assert.equal(vm.runInContext("STORE.getQueue().length",ctx),1);
 assert.ok(Number.isFinite(Date.parse(vm.runInContext('STORE.getQueue()[0].enfileiradoEm',ctx))));
 const primeira=vm.runInContext('STORE.getQueue()[0].enfileiradoEm',ctx);vm.runInContext("STORE.saveOS({...STORE.getOS('o'),obs:'Editado novamente'})",ctx);assert.equal(vm.runInContext('STORE.getQueue()[0].enfileiradoEm',ctx),primeira);
});
test('perfil restrito não duplica valores copiando UID financeiro',async()=>{
 const {preservarValoresPCP}=await import('../supabase/functions/_shared/pcp-integridade.mjs'),o=original();assert.throws(()=>preservarValoresPCP({...o,itens:[...o.itens,{...o.itens[0]}]},o),/identidade/);
});
test('Performance resumo mantém fonte integral para alternar completo com O.S. recolhidas e pendências',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),R=require('../relatorios-pcp.js');
 function fonte(){
  const dados={detalhe:true,pendencia:true,aberto:false};
  const detalhe={remove(){dados.detalhe=false;},set open(v){dados.aberto=v;}};
  const pendencia={remove(){dados.pendencia=false;}};
  return {dados,dataset:{},cloneNode(){const c=fonte();Object.assign(c.dados,dados);c.dataset={...this.dataset};return c;},querySelectorAll(sel){if(sel==='.perf-team-report details,.perf-report-pendencias')return [...(dados.detalhe?[detalhe]:[]),...(dados.pendencia?[pendencia]:[])];if(sel==='details')return dados.detalhe?[detalhe]:[];if(sel==='.perf-report-pendencias')return dados.pendencia?[pendencia]:[];return [];}};
 }
 const origem=fonte(),botao={},el={querySelector:s=>s==='#perf-rel-pdf'?botao:s==='.perf-report'?origem:null,querySelectorAll:()=>[]};let exportado;
 const ctx=vm.createContext({console,STORE:{getAllOS:()=>[]},STATE:{},document:{},imprimirAnalisePCP:(titulo,f)=>exportado=f,periodoOuMes:()=>({de:'2026-10-01',ate:'2026-10-31'}),bindCardClicks(){},el});
 vm.runInContext(fs.readFileSync('performance.js','utf8'),ctx);vm.runInContext('perfWireFonte=()=>{};perfConfig=()=>({equipes:[]});perfFonteTexto=()=>"Fixture";wirePerformanceEquipes(el)',ctx);botao.onclick();
 assert.equal(exportado.dataset.pdfModo,'resumo');const resumo=R.sanearCopia(exportado.cloneNode(true),{completo:false,valores:true});assert.equal(resumo.dados.detalhe,false);assert.equal(resumo.dados.pendencia,false);
 exportado.dataset.pdfModo='completo';const completo=R.sanearCopia(exportado.cloneNode(true),{completo:true,valores:true});assert.equal(completo.dados.detalhe,true);assert.equal(completo.dados.pendencia,true);assert.equal(completo.dados.aberto,true);assert.equal(origem.dados.aberto,false);
 const novamente=R.sanearCopia(exportado.cloneNode(true),{completo:false,valores:true});assert.equal(novamente.dados.detalhe,false);assert.equal(exportado.dados.detalhe,true);
});
test('revisão final: autorias de novos vínculos/cadastros não descem a restritos em nenhuma resposta',async()=>{
 const assinatura={por:'Gestor',porId:'123456',em:'2026-10-03T10:00:00Z'},campos=['categoriasServico','veiculosAliases','prioridadesPCP'];
 for(const papel of ['montagem','operacao','comercial']){
  const o={...original(),vinculosEquipes:[{...assinatura,antes:'a',depois:'b'}]},cfg={categoriasServico:[{descricao:'Placa',categoria:'PLACA',...assinatura}],veiculosAliases:[{id:'veiculo-1',alias:'Carro',placa:'TST1234',...assinatura}],prioridadesPCP:{dono:'PCP',...assinatura}};
  const e=await edge('pcp-sync',{pcp_registros:[{id:'o',colecao:'os',apagado:false,atualizado_em:'2026-10-03T10:00:00Z',registro:o}],equipe_contas:[{sistema:'pcp',usuario:'Ana'}],pcp_config_global:[{id:true,config:cfg,atualizado_em:'2026-10-03T10:00:00Z'}]});const who={papel,nome:'Ana'};
  for(const body of [{action:'list'},{action:'list',since:'2026-10-02T00:00:00Z'}]){const r=await e.call(body,who);assert.equal(r.status,200);assert.equal(r.os[0].vinculosEquipes[0].porId,undefined);assert.equal(r.os[0].vinculosEquipes[0].por,'Gestor');}
  const c=await e.call({action:'getCfg'},who);for(const k of campos){const v=Array.isArray(c.cfg[k])?c.cfg[k][0]:c.cfg[k];assert.equal(v.porId,undefined);assert.equal(v.por,'Gestor');}
  if(papel!=='comercial'){
   const conflict=await e.call({action:'upsert',os:{...o,rev:0}},who);assert.equal(conflict.conflito,true,JSON.stringify(conflict));assert.equal(conflict.servidor.vinculosEquipes[0].porId,undefined);
   const l=await e.call({action:'list'},who),r=await e.call({action:'upsert',os:{...l.os[0],fotosCheckinIds:['foto-ficticia']}},who);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.os.vinculosEquipes[0].porId,undefined);
  }
  assert.equal(e.db.pcp_registros.find(r=>r.id==='o').registro.vinculosEquipes[0].porId,'123456');assert.deepEqual(e.db.pcp_config_global[0].config,cfg);
  for(const papelGestao of ['admin','pcp']){assert.equal((await e.call({action:'list'},{papel:papelGestao})).os[0].vinculosEquipes[0].porId,'123456');assert.equal((await e.call({action:'getCfg'},{papel:papelGestao})).cfg.prioridadesPCP.porId,'123456');}
 }
});
test('revisão final: cache de gestão não reexpõe porId em O.S./CFG após troca de papel',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),id='123456',o={...original(),vinculosEquipes:[{por:'Gestor',porId:id}]},cfg={categoriasServico:[{porId:id,por:'Gestor'}],veiculosAliases:[{id:'carro',porId:id}],prioridadesPCP:{dono:'PCP',porId:id}};
 const m=new Map([['impresilk_inst_os',JSON.stringify([o])],['impresilk_inst_cfg',JSON.stringify(cfg)]]),ctx=vm.createContext({console,navigator:{onLine:false},window:{addEventListener(){}},localStorage:{getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)},setTimeout:()=>1,clearTimeout(){},AbortController});
 vm.runInContext(fs.readFileSync('privacidade-valores.js','utf8'),ctx);vm.runInContext(fs.readFileSync('store.js','utf8'),ctx);
 for(const papel of ['montagem','operacao','comercial']){ctx.papel=papel;vm.runInContext('STORE.setUser({papel})',ctx);assert.equal(vm.runInContext("STORE.getOS('o').vinculosEquipes[0].porId",ctx),undefined);assert.doesNotMatch(vm.runInContext('JSON.stringify(STORE.getCFG())',ctx),/123456/);assert.equal(vm.runInContext('STORE.getCFG().veiculosAliases[0].id',ctx),'carro');}
 vm.runInContext("STORE.setUser({papel:'pcp'})",ctx);assert.equal(vm.runInContext("STORE.getOS('o').vinculosEquipes[0].porId",ctx),id);assert.equal(vm.runInContext('STORE.getCFG().prioridadesPCP.porId',ctx),id);
});
test('PDF preserva colunas curtas e valores sem truncar descrições ou células agrupadas',()=>{
 const R=require('../relatorios-pcp.js');const cell=(textContent,colSpan=1)=>({textContent,colSpan,classes:[],classList:{add(c){this.owner.classes.push(c)}}});
 const headers=['O.S.','Nome completo','Data','Valor completo'].map(x=>cell(x)),dados=['QA-0001','Nome longo '.repeat(20),'2026-10-03','123.456.789,99'].map(x=>cell(x)),grupo=[cell('Total extenso',3),cell('123.456.789,99')];
 for(const c of [...headers,...dados,...grupo])c.classList.owner=c;
 const tabela={tHead:{rows:[{cells:headers}]},rows:[{cells:headers},{cells:dados},{cells:grupo}]};R.prepararTabelas({querySelectorAll:()=>[tabela]});
 assert.deepEqual(dados.map(c=>c.classes),[['pdf-col-id'],[],['pdf-col-data'],['pdf-col-valor']]);assert.deepEqual(grupo[0].classes,[]);assert.equal(dados[3].textContent,'123.456.789,99');assert.match(R.CSS,/td\.pdf-col-valor[^{]*\{white-space:nowrap!important/);assert.match(R.CSS,/text-overflow:clip!important/);
});
test('lista de finalizados permite status longo quebrar sem expulsar ações',()=>{
 const css=require('node:fs').readFileSync('styles.css','utf8');assert.match(css,/\.list-info\s*\{[^}]*min-width:\s*0/);assert.match(css,/\.list-numero \.badge\s*\{[^}]*white-space:\s*normal/);assert.match(css,/\.list-actions\s*\{[^}]*flex-shrink:\s*0/);
});
