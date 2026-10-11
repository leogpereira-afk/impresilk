'use strict';
/* A2 (auditoria do PCP v164, 11/10/2026): A FOTO DE O.S. FINALIZADA É A PROVA
   DA ENTREGA. Quem tinha crachá com senha (admin, pcp, montagem, operação)
   apagava do bucket a foto de retorno de uma O.S. viva e já finalizada: a trava
   do deletePhoto só protegia a foto de O.S. excluída, e a tela avisava "Ela sai
   do servidor e não volta". Agora: foto citada por O.S. finalizada só sai pela
   gestão do PCP (admin ou pcp), com motivo, e o pedido fica no diário de
   auditoria da O.S. Os outros papéis recebem 403 com o motivo: a fila do
   aparelho tira o item e diz a recusa (403 não prende a fila; 422 prenderia).
   Servidor real (helpers/edge.cjs), store.js real e dados fictícios. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {edge}=require('./helpers/edge.cjs');

const row=(id,registro)=>({id,colecao:'os',apagado:false,atualizado_em:'2026-10-01T10:00:00Z',registro:{id,rev:1,numero:'N-'+id,tipo:'externo',cliente:'Cliente fictício',equipe:['Ana'],...registro}});
const FINAL='2026-10-05T18:00:00Z';
function banco(extra=[]){
  return {pcp_registros:[
    row('aberta',{fotosCheckinIds:['foto_aberta']}),
    row('final',{finalizadaEm:FINAL,fotosCheckinIds:['foto_antes'],fotosRetornoIds:['foto_prova'],itens:[{uid:'u1',descricao:'Item fictício',fotoProbId:'foto_item'}]}),
    // A gestão tirou a foto da lista antes de o pedido de apagar chegar (fila fora de ordem): fotosTiradas guarda o id.
    row('final2',{finalizadaEm:FINAL,fotosRetornoIds:[],fotosTiradas:['foto_tirada']}),
    // Foto da volta do carro de uma O.S. finalizada.
    row('final3',{finalizadaEm:FINAL,voltaEquipe:{fotos:['foto_volta']}}),
    ...extra],
    equipe_contas:[{sistema:'pcp',usuario:'montador'},{sistema:'pcp',usuario:'operador'}]};
}
const montagem={papel:'montagem',sub:'montador',nome:'Montador fictício'};
const operacao={papel:'operacao',sub:'operador',nome:'Operador fictício'};
const pcp={papel:'pcp',sub:'gestor',nome:'Gestor fictício'};
const admin={papel:'admin',sub:'chefe',nome:'Admin fictício'};
const toque={papel:'montagem',montagemIndividual:true,nome:'Ana'};
const MOTIVO='Foto duplicada enviada por engano';
function bucket(e){
  const removidas=[];e.cliente.storage={from:()=>({remove:async ids=>{removidas.push(...ids);return {error:null};}})};
  return removidas;
}
const diario=e=>e.db.pcp_registros.filter(r=>r.colecao==='auditoria').map(r=>r.registro);

test('A2: montagem, operação, toque e máquina não apagam foto de O.S. finalizada; recebem 403 com o motivo',async()=>{
  for(const [quem,nome] of [[montagem,'montagem'],[operacao,'operação'],[toque,'toque'],['machine','máquina']]){
    for(const fileId of ['foto_prova','foto_antes','foto_item','foto_volta','foto_tirada']){
      const e=await edge('pcp-sync',banco()),removidas=bucket(e);
      const r=await e.call({action:'deletePhoto',fileId,motivo:MOTIVO},quem);
      assert.equal(r.status,403,nome+' '+fileId+': '+JSON.stringify(r));
      assert.ok(String(r.error||'').length>10,'a recusa diz o motivo');
      assert.deepEqual(removidas,[],nome+' '+fileId+': a prova continua no bucket');
    }
  }
});

test('A2: a gestão (pcp, admin) só apaga a prova com motivo, e o pedido entra no diário da O.S.',async()=>{
  for(const quem of [pcp,admin]){
    const e=await edge('pcp-sync',banco()),removidas=bucket(e);
    // Sem motivo (o pedido antigo da fila): 403 com o motivo, a foto fica.
    const sem=await e.call({action:'deletePhoto',fileId:'foto_prova'},quem);
    assert.equal(sem.status,403,JSON.stringify(sem));assert.match(sem.error,/motivo/);
    assert.equal((await e.call({action:'deletePhoto',fileId:'foto_prova',motivo:'abc'},quem)).status,403,'motivo curto não vale');
    assert.deepEqual(removidas,[]);assert.deepEqual(diario(e),[]);
    const ok=await e.call({action:'deletePhoto',fileId:'foto_prova',motivo:MOTIVO},quem);
    assert.equal(ok.status,200,JSON.stringify(ok));
    assert.deepEqual(removidas,['foto_prova']);
    const d=diario(e);
    assert.equal(d.length,1);
    assert.equal(d[0].osId,'final');assert.equal(d[0].numero,'N-final');assert.equal(d[0].acao,'foto-apagada');
    assert.deepEqual(d[0].antes,{fileId:'foto_prova'});
    assert.equal(d[0].depois.motivo,MOTIVO);assert.equal(d[0].depois.fileId,null);
    assert.equal(d[0].autor.papel,quem.papel);assert.equal(d[0].autor.login,quem.sub);assert.equal(d[0].origem,'tela');
  }
});

test('A2: sem diário não apaga (503, a fila tenta de novo) e a foto fica',async()=>{
  const e=await edge('pcp-sync',banco()),removidas=bucket(e);
  e.cliente.beforeWrite=(db,tabela)=>{if(tabela==='pcp_registros')throw new Error('banco recusou o diário');};
  const r=await e.call({action:'deletePhoto',fileId:'foto_prova',motivo:MOTIVO},pcp);
  assert.equal(r.status,503,JSON.stringify(r));
  assert.deepEqual(removidas,[]);
});

test('A2: foto de O.S. aberta e foto solta seguem como antes (montagem apaga sem motivo)',async()=>{
  const e=await edge('pcp-sync',banco()),removidas=bucket(e);
  assert.equal((await e.call({action:'deletePhoto',fileId:'foto_aberta'},montagem)).status,200);
  assert.equal((await e.call({action:'deletePhoto',fileId:'foto_solta'},operacao)).status,200);
  assert.deepEqual(removidas,['foto_aberta','foto_solta']);
  assert.deepEqual(diario(e),[],'apagar foto de O.S. aberta não é evento do diário');
});

/* A fila do aparelho: o motivo vai junto no deletePhoto, e a recusa (403) sai
   da fila e é dita; o envio seguinte não fica preso atrás dela. */
const OS='impresilk_inst_os',FILA='impresilk_inst_fila';
function store(responder){
  const ls=new Map([[OS,'[]'],[FILA,'[]']]),eventos=[],enviados=[];
  const idb={transaction(){const tx={objectStore:()=>({get(){const q={};queueMicrotask(()=>q.onsuccess?.({target:{result:null}}));return q;},put(){queueMicrotask(()=>tx.oncomplete?.());},delete(){queueMicrotask(()=>tx.oncomplete?.());}})};return tx;}};
  const ctx=vm.createContext({console:{log(){},warn(){},error(){}},navigator:{onLine:true},window:{addEventListener(){}},
    localStorage:{getItem:k=>ls.has(k)?ls.get(k):null,setItem:(k,v)=>ls.set(k,v),removeItem:k=>ls.delete(k)},
    indexedDB:{open(){const q={};queueMicrotask(()=>q.onsuccess({target:{result:idb}}));return q;},deleteDatabase(){}},
    setTimeout:()=>1,clearTimeout(){},AbortController,API_BASE:'http://teste',
    fetch:async(_u,req)=>{const b=JSON.parse(req.body);enviados.push(b);const r=await responder(b);return {ok:!(r.http>=400),status:r.http||200,json:async()=>r};}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','store.js'),'utf8'),ctx);
  const s=vm.runInContext('STORE',ctx);
  for(const ev of ['item-recusado','item-pendente'])s.on(ev,d=>eventos.push([ev,d]));
  return {s,ctx,eventos,enviados};
}

test('A2: o motivo da gestão vai na fila; a recusa 403 sai da fila, é dita e não prende o resto',async()=>{
  const recusa='Foto de O.S. finalizada é a prova da entrega.';
  const o=store(b=>b.action==='deletePhoto'?(b.fileId==='foto_prova'?{http:403,error:recusa}:{ok:true}):{os:[]});
  await o.s.pronto();
  o.ctx.navigator.onLine=false;
  o.s.delFotoSync('foto_prova',MOTIVO);
  o.s.delFotoSync('foto_aberta');
  const fila=o.s.getQueue();
  assert.equal(fila[0].motivo,MOTIVO,'o motivo vai com o pedido');
  assert.equal('motivo' in fila[1],false,'sem motivo, nada a mais no pedido');
  o.ctx.navigator.onLine=true;
  await o.s.trySync();
  assert.equal(o.s.getQueue().length,0,'403 sai da fila; o pedido seguinte foi enviado');
  const env=o.enviados.filter(b=>b.action==='deletePhoto');
  assert.deepEqual(env.map(b=>[b.fileId,b.motivo]),[['foto_prova',MOTIVO],['foto_aberta',undefined]]);
  const rec=o.eventos.find(([ev])=>ev==='item-recusado');
  assert.ok(rec,'a recusa é dita');assert.equal(rec[1].motivo,recusa);assert.equal(rec[1].status,403);
});

/* A tela da gestão (app.js): O.S. finalizada pede o motivo a admin e pcp, e
   recusa na hora para os outros papéis, antes de tirar a foto da ficha. */
function regraDaTela(){
  const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const ini=app.indexOf('function motivoParaApagarFoto'),fim=app.indexOf('\n}\n',ini)+2;
  assert.ok(ini>0,'a regra da tela existe');
  return new Function(app.slice(ini,fim)+'; return motivoParaApagarFoto;')();
}
test('A2: tela da gestão pede o motivo para apagar foto de O.S. finalizada e recusa os outros papéis',()=>{
  const motivoParaApagarFoto=regraDaTela();
  const avisos=[];
  const aberta={id:'a'},final={id:'f',finalizadaEm:FINAL};
  // O.S. aberta: segue o confirm de sempre (sem motivo).
  assert.deepEqual(motivoParaApagarFoto(aberta,'montagem',{confirmar:()=>true,perguntar:()=>{throw new Error('não pergunta');},avisar:t=>avisos.push(t)}),{apagar:true,motivo:''});
  assert.deepEqual(motivoParaApagarFoto(aberta,'montagem',{confirmar:()=>false,perguntar:()=>'x',avisar:t=>avisos.push(t)}),{apagar:false});
  // O.S. finalizada, papel sem gestão: recusa e diz o motivo, sem perguntar.
  for(const papel of ['montagem','operacao','comercial',''])
    assert.deepEqual(motivoParaApagarFoto(final,papel,{confirmar:()=>true,perguntar:()=>MOTIVO,avisar:t=>avisos.push(t)}),{apagar:false},papel);
  assert.ok(avisos.length===4&&avisos.every(t=>/gestão do PCP/.test(t)&&!/—/.test(t)),JSON.stringify(avisos));
  // Gestão: motivo de 5 a 500 letras; cancelar ou motivo curto não apaga.
  for(const papel of ['admin','pcp']){
    assert.deepEqual(motivoParaApagarFoto(final,papel,{confirmar:()=>true,perguntar:()=>'  '+MOTIVO+'  ',avisar:()=>{}}),{apagar:true,motivo:MOTIVO});
    assert.deepEqual(motivoParaApagarFoto(final,papel,{confirmar:()=>true,perguntar:()=>null,avisar:()=>{}}),{apagar:false});
    assert.deepEqual(motivoParaApagarFoto(final,papel,{confirmar:()=>true,perguntar:()=>'abc',avisar:()=>{}}),{apagar:false});
  }
});
