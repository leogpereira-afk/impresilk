'use strict';
/* REVISÃO DA ONDA onda-w1-backup (11/10/2026). As duas revisões adversariais
   da onda do backup (A2, M20, M21, M29) acharam:

   R1/S1 (alta): a trava A2 do deletePhoto olhava só o estado ATUAL da O.S., e
     operação e montagem com senha mudam esse estado. Em dois pedidos a prova
     da entrega saía do bucket sem motivo e sem diário: (a) regravar a O.S.
     finalizada com a lista de fotos vazia e depois apagar; (b) Reabrir (o
     botão da ficha não confere papel) e depois tocar no ×. E o caminho com
     motivo feito para a gestão nunca rodava: o × da O.S. finalizada é
     .edit-only, que a trava da ficha esconde.
   R3: a fila descartava o segundo deletePhoto da mesma foto, e com ele o
     motivo que a gestão digitou.
   S2: o motivo ia para o diário, mas a tela do histórico mostrava
     "foto: (vazio) → (vazio)".
   R2/S5 (M21): a aprovação da comissão não guardava o CSV aprovado nem a
     impressão digital (sha256) dele.
   R4: pcp_meta (a cópia de desfazer do robô do ERP e o cache mensal) ficava
     fora da porta de exportação.

   Servidor real (helpers/edge.cjs), store.js real e a régua real da tela,
   com dados fictícios. Cada teste começa pelo caso ruim. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const {edge}=require('./helpers/edge.cjs');

const FINAL='2026-10-05T18:00:00Z';
const REG={id:'final',rev:3,numero:'N-final',tipo:'externo',cliente:'Cliente fictício',equipe:['Ana'],finalizadaEm:FINAL,finalizadoPor:'Gestor fictício',
  retornoEm:'2026-10-05T17:00:00Z',fotosCheckinIds:['foto_antes'],fotosRetornoIds:['foto_prova'],
  itens:[{uid:'u1',item:'1',descricao:'Item fictício',fotoProbId:'foto_item'}],atualizadoEm:'2026-10-05T18:00:00Z'};
const banco=(registro=REG,extra=[])=>({pcp_registros:[{id:registro.id,colecao:'os',apagado:false,atualizado_em:'2026-10-05T18:00:00Z',registro:structuredClone(registro)},...extra],
  equipe_contas:[{sistema:'pcp',usuario:'operador'},{sistema:'pcp',usuario:'montador'}]});
const operacao={papel:'operacao',sub:'operador',nome:'Operador fictício'};
const montagem={papel:'montagem',sub:'montador',nome:'Montador fictício'};
const pcp={papel:'pcp',sub:'gestor',nome:'Gestor fictício'};
const admin={papel:'admin',sub:'chefe',nome:'Admin fictício'};
const MOTIVO='Foto duplicada enviada por engano';
function bucket(e){const removidas=[];e.cliente.storage={from:()=>({remove:async ids=>{removidas.push(...ids);return {error:null};}})};return removidas;}
const diario=e=>e.db.pcp_registros.filter(r=>r.colecao==='auditoria').map(r=>r.registro);
const gravada=(e,id='final')=>e.db.pcp_registros.find(r=>r.colecao==='os'&&r.id===id).registro;

// ---------------------------------------------------------------- R1/S1: servidor
for(const quem of [operacao,montagem]){
  test(`revisão onda-w1-backup: ${quem.papel} regrava a O.S. finalizada sem as fotos e depois apaga; a prova volta à lista, com aviso, e o deletePhoto é 403`,async()=>{
    const e=await edge('pcp-sync',banco()),removidas=bucket(e);
    const atual=gravada(e);
    const itens=atual.itens.map(it=>({...it,fotoProbId:''}));
    const up=await e.call({action:'upsert',os:{...atual,fotosRetornoIds:[],fotosCheckinIds:[],itens}},quem);
    assert.equal(up.status,200,'a gravação não é recusada (422 prenderia a fila): '+JSON.stringify(up).slice(0,300));
    const g=gravada(e);
    assert.deepEqual(g.fotosRetornoIds,['foto_prova'],'a foto do serviço pronto continua na O.S.');
    assert.deepEqual(g.fotosCheckinIds,['foto_antes'],'a foto de antes continua na O.S.');
    assert.equal(g.itens[0].fotoProbId,'foto_item','a foto do item continua no item');
    assert.ok((up.avisos||[]).some(t=>/prova da entrega/.test(t)&&!/—/.test(t)),'o aviso diz por quê: '+JSON.stringify(up.avisos));
    const del=await e.call({action:'deletePhoto',fileId:'foto_prova'},quem);
    assert.equal(del.status,403,JSON.stringify(del));
    assert.deepEqual(removidas,[],'a prova continua no bucket');
  });

  test(`revisão onda-w1-backup: ${quem.papel} reabre a O.S. e depois apaga; a foto da O.S. que já foi finalizada continua protegida`,async()=>{
    const e=await edge('pcp-sync',banco()),removidas=bucket(e);
    // 1) O botão "Reabrir / voltar status" da ficha: finalizadaEm vazio. Reabrir continua valendo.
    const reaberta={...gravada(e),finalizadaEm:'',finalizadoPor:'',arquivadaEm:'',atualizadoEm:'2026-10-11T10:00:00Z'};
    const up=await e.call({action:'upsert',os:reaberta},quem);
    assert.equal(up.status,200,JSON.stringify(up).slice(0,300));
    let g=gravada(e);
    assert.equal(g.finalizadaEm,'','a O.S. foi reaberta');assert.ok(g.reabertaEm,'o servidor carimbou a reabertura');
    assert.ok(g.fotosProva.includes('foto_prova')&&g.fotosProva.includes('foto_antes')&&g.fotosProva.includes('foto_item'),'as fotos da entrega ficam carimbadas: '+JSON.stringify(g.fotosProva));
    // 2) O × da foto: o pedido direto é recusado.
    assert.equal((await e.call({action:'deletePhoto',fileId:'foto_prova'},quem)).status,403);
    // 3) Nem apagando o carimbo de reabertura e as listas, em outro envio, a prova sai.
    const forjada={...gravada(e),reabertaEm:'',reabertaPor:'',fotosProva:[],fotosRetornoIds:[],fotosTiradas:['foto_prova']};
    assert.equal((await e.call({action:'upsert',os:forjada},quem)).status,200);
    g=gravada(e);
    assert.ok(g.fotosProva.includes('foto_prova'),'o carimbo da prova não é do aparelho');
    assert.deepEqual(g.fotosRetornoIds,['foto_prova']);
    assert.equal((g.fotosTiradas||[]).includes('foto_prova'),false,'a foto que voltou não fica anotada como tirada');
    const del=await e.call({action:'deletePhoto',fileId:'foto_prova'},quem);
    assert.equal(del.status,403,JSON.stringify(del));
    assert.deepEqual(removidas,[]);
    assert.equal(diario(e).filter(d=>d.acao==='foto-apagada').length,0);
  });
}

test('revisão onda-w1-backup: a gestão (pcp e admin) apaga a prova da O.S. finalizada sem reabrir, com motivo; a O.S. reaberta também pede motivo',async()=>{
  for(const quem of [pcp,admin]){
    // O.S. finalizada: sem motivo é 403; com motivo apaga e entra no diário.
    let e=await edge('pcp-sync',banco()),removidas=bucket(e);
    assert.equal((await e.call({action:'deletePhoto',fileId:'foto_prova'},quem)).status,403);
    const ok=await e.call({action:'deletePhoto',fileId:'foto_prova',motivo:MOTIVO},quem);
    assert.equal(ok.status,200,JSON.stringify(ok));assert.deepEqual(removidas,['foto_prova']);
    assert.equal(diario(e).filter(d=>d.acao==='foto-apagada').length,1);
    // O.S. reaberta antes desta versão (reabertaEm, sem fotosProva): é prova também.
    const legado={...REG,finalizadaEm:'',finalizadoPor:'',reabertaEm:'2026-10-06T10:00:00Z',reabertaPor:'Operador fictício'};
    e=await edge('pcp-sync',banco(legado));removidas=bucket(e);
    assert.equal((await e.call({action:'deletePhoto',fileId:'foto_prova'},quem)).status,403,'sem motivo, a foto fica');
    assert.equal((await e.call({action:'deletePhoto',fileId:'foto_prova'},operacao)).status,403,'operação não apaga');
    assert.deepEqual(removidas,[]);
    assert.equal((await e.call({action:'deletePhoto',fileId:'foto_prova',motivo:MOTIVO},quem)).status,200);
    assert.deepEqual(removidas,['foto_prova']);
  }
  // A gestão tira a foto da lista pela gravação (o × dela): é dela a decisão; nada volta.
  const e=await edge('pcp-sync',banco());
  const up=await e.call({action:'upsert',os:{...gravada(e),fotosRetornoIds:[],fotosTiradas:['foto_prova']}},pcp);
  assert.equal(up.status,200);assert.deepEqual(gravada(e).fotosRetornoIds,[]);
  assert.ok(gravada(e).fotosProva.includes('foto_prova'),'o arquivo segue protegido até o pedido com motivo');
});

test('revisão onda-w1-backup: foto de O.S. que nunca foi finalizada segue como antes (montagem tira da lista e apaga sem motivo)',async()=>{
  const aberta={...REG,id:'aberta',numero:'N-aberta',finalizadaEm:'',finalizadoPor:'',fotosRetornoIds:['foto_aberta'],fotosCheckinIds:[],itens:[]};
  const e=await edge('pcp-sync',banco(aberta)),removidas=bucket(e);
  const up=await e.call({action:'upsert',os:{...gravada(e,'aberta'),fotosRetornoIds:[]}},montagem);
  assert.equal(up.status,200);assert.deepEqual(gravada(e,'aberta').fotosRetornoIds,[]);
  assert.equal(gravada(e,'aberta').fotosProva,undefined,'O.S. aberta não ganha carimbo');
  assert.equal((await e.call({action:'deletePhoto',fileId:'foto_aberta'},montagem)).status,200);
  assert.deepEqual(removidas,['foto_aberta']);
});

test('revisão onda-w1-backup: o celular (crachá de toque) também não tira da O.S. reaberta a foto da entrega pelo × do espelho',async()=>{
  const toque={papel:'montagem',montagemIndividual:true,nome:'Ana'};
  const e=await edge('pcp-sync',banco()),removidas=bucket(e);
  // A gestão reabre (o carimbo da prova nasce aqui, da versão finalizada).
  assert.equal((await e.call({action:'upsert',os:{...gravada(e),finalizadaEm:'',finalizadoPor:''}},pcp)).status,200);
  // O espelho tira a foto e anota em fotosTiradas: a mescla do celular a tiraria da lista.
  const up=await e.call({action:'upsert',os:{...gravada(e),fotosRetornoIds:[],fotosTiradas:['foto_prova']}},toque);
  assert.equal(up.status,200,JSON.stringify(up).slice(0,300));
  assert.deepEqual(gravada(e).fotosRetornoIds,['foto_prova']);
  assert.equal((gravada(e).fotosTiradas||[]).includes('foto_prova'),false);
  assert.ok((up.avisos||[]).some(t=>/prova da entrega/.test(t)));
  assert.equal((await e.call({action:'deletePhoto',fileId:'foto_prova'},toque)).status,403);
  assert.deepEqual(removidas,[]);
});

// ---------------------------------------------------------------- store.js real
const OS='impresilk_inst_os',FILA='impresilk_inst_fila';
function store(responder,{inicial=[]}={}){
  const ls=new Map([[OS,JSON.stringify(inicial)],[FILA,'[]']]),enviados=[];
  const idb={transaction(){const tx={objectStore:()=>({get(){const q={};queueMicrotask(()=>q.onsuccess?.({target:{result:null}}));return q;},put(){queueMicrotask(()=>tx.oncomplete?.());},delete(){queueMicrotask(()=>tx.oncomplete?.());}})};return tx;}};
  const ctx=vm.createContext({console:{log(){},warn(){},error(){}},navigator:{onLine:true},window:{addEventListener(){}},
    localStorage:{getItem:k=>ls.has(k)?ls.get(k):null,setItem:(k,v)=>ls.set(k,v),removeItem:k=>ls.delete(k)},
    indexedDB:{open(){const q={};queueMicrotask(()=>q.onsuccess({target:{result:idb}}));return q;},deleteDatabase(){}},
    setTimeout:()=>1,clearTimeout(){},AbortController,API_BASE:'http://teste',
    fetch:async(_u,req)=>{const b=JSON.parse(req.body);enviados.push(b);const r=await responder(b);return {ok:!(r.status>=400),status:r.status||200,json:async()=>r};}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'..','store.js'),'utf8'),ctx);
  return {s:vm.runInContext('STORE',ctx),ctx,enviados};
}

test('revisão onda-w1-backup: ponta a ponta (store.js e pcp-sync reais), Reabrir e × pela operação não tiram a prova do bucket nem da O.S.',async()=>{
  const e=await edge('pcp-sync',banco()),removidas=bucket(e);
  const o=store(b=>b.action==='upsert'||b.action==='deletePhoto'?e.call(b,operacao):Promise.resolve({os:[]}),{inicial:[REG]});
  await o.s.pronto();
  o.ctx.navigator.onLine=false;
  const draft={...structuredClone(REG),finalizadaEm:'',finalizadoPor:'',arquivadaEm:'',atualizadoEm:'2026-10-11T10:00:00Z'};
  o.s.saveOS(structuredClone(draft));
  o.s.delFotoSync('foto_prova','');
  draft.fotosRetornoIds=[];draft.fotosTiradas=['foto_prova'];draft.atualizadoEm='2026-10-11T10:00:05Z';
  o.s.saveOS(structuredClone(draft));
  o.ctx.navigator.onLine=true;
  await o.s.trySync();
  assert.deepEqual(removidas,[],'a prova da entrega não sai sem a gestão e o motivo');
  assert.deepEqual(gravada(e).fotosRetornoIds,['foto_prova'],'e continua na O.S.');
  assert.equal(o.s.getQueue().length,0,'a recusa (403) sai da fila; nada prende o aparelho');
});

test('revisão onda-w1-backup: na fila, o deletePhoto com o motivo da gestão substitui o pedido sem motivo da mesma foto',async()=>{
  const o=store(async()=>({ok:true}));await o.s.pronto();
  o.ctx.navigator.onLine=false;
  o.s.delFotoSync('foto_prova');                       // pedido antigo (app sem motivo, ou recusado e refeito)
  o.s.delFotoSync('foto_prova',MOTIVO);
  let fila=o.s.getQueue();
  assert.equal(fila.length,1);assert.equal(fila[0].motivo,MOTIVO,'o motivo da gestão vai no pedido');
  // O inverso não apaga o motivo: um clique sem motivo depois não tira o que foi pedido com ele.
  o.s.delFotoSync('foto_prova');
  fila=o.s.getQueue();
  assert.equal(fila.length,1);assert.equal(fila[0].motivo,MOTIVO);
});

test('revisão onda-w1-backup: o pedido sem motivo em voo volta 403 e o pedido com motivo, feito durante o envio, continua na fila e vai depois',async()=>{
  let soltar;const emVoo=new Promise(r=>{soltar=r;});
  const vistos=[];
  const o=store(async b=>{
    if(b.action!=='deletePhoto')return {os:[]};
    vistos.push(b.motivo||null);
    if(!b.motivo){await emVoo;return {status:403,error:'Foto de O.S. finalizada: informe o motivo.'};}
    return {ok:true};
  });
  await o.s.pronto();
  o.s.delFotoSync('foto_prova');
  await new Promise(r=>setImmediate(r));
  o.s.delFotoSync('foto_prova',MOTIVO);                 // a gestão pede de novo, agora com o motivo
  soltar();
  // O envio em voo termina sozinho; depois a fila anda de novo.
  for(let i=0;i<100&&vistos.length<2;i++){await new Promise(r=>setImmediate(r));await o.s.trySync();}
  assert.deepEqual(vistos,[null,MOTIVO],'o pedido com motivo foi enviado depois da recusa');
  assert.equal(o.s.getQueue().length,0);
});

// ---------------------------------------------------------------- S2: o motivo na tela do diário
function telaDoDiario(){
  const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const pedaco=(ini,fimMarca)=>{const i=app.indexOf(ini);assert.ok(i>=0,ini);const f=app.indexOf(fimMarca,i);return app.slice(i,f);};
  const src=[pedaco('function esc(s)','\n}\n')+'\n}\n',pedaco('const AUD_ROTULOS','function ligarHistoricoAlteracoes')].join('\n');
  return new Function(src+';return htmlHistoricoAlteracoes;')();
}
test('revisão onda-w1-backup: o histórico da O.S. mostra a foto apagada e o motivo (não "foto: (vazio) → (vazio)")',async()=>{
  const e=await edge('pcp-sync',banco());bucket(e);
  assert.equal((await e.call({action:'deletePhoto',fileId:'foto_prova',motivo:MOTIVO},pcp)).status,200);
  const aud=await e.call({action:'auditoriaOS',osId:'final'},admin);
  assert.equal(aud.status,200,JSON.stringify(aud));
  const texto=telaDoDiario()({entradas:aud.entradas}).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
  assert.ok(texto.includes(MOTIVO),'o motivo aparece: '+texto);
  assert.ok(texto.includes('foto_prova'),'o arquivo aparece: '+texto);
  assert.match(texto,/Apagou a foto/);
  assert.doesNotMatch(texto,/foto : \(vazio\) → \(vazio\)/);
});

// ---------------------------------------------------------------- R1: a tela da gestão
function daTela(nome){
  const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const ini=app.indexOf('function '+nome+'('),fim=app.indexOf('\n}\n',ini)+2;
  assert.ok(ini>0,'a regra da tela existe: '+nome);
  return new Function(app.slice(ini,fim)+'; return '+nome+';')();
}
test('revisão onda-w1-backup: o × da foto de O.S. finalizada aparece para a gestão fora da trava da ficha (e some para os outros)',()=>{
  const app=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8');
  assert.match(css,/#modal-os\.os-locked \.edit-only \{ display: none !important; \}/,'a trava da ficha esconde .edit-only');
  // Os dois × (antes e serviço pronto) usam a mesma régua.
  const botoes=app.match(/<button class="\$\{fotoRmClasse\(os\)\}" data-foto-rm(?:-retorno)?=/g)||[];
  assert.equal(botoes.length,2,'os dois × saem da régua fotoRmClasse');
  const fotoRmClasse=daTela('fotoRmClasse');
  const final={finalizadaEm:FINAL},aberta={};
  for(const papel of ['admin','pcp']){
    const c=fotoRmClasse(final,papel).split(/\s+/);
    assert.ok(c.includes('lock-allow')&&!c.includes('edit-only'),papel+': '+c.join(' '));
  }
  for(const papel of ['montagem','operacao','comercial',''])assert.ok(fotoRmClasse(final,papel).split(/\s+/).includes('edit-only'),papel);
  assert.ok(fotoRmClasse(aberta,'pcp').split(/\s+/).includes('edit-only'),'O.S. aberta segue a regra de sempre');
});

test('revisão onda-w1-backup: a tela trata a O.S. reaberta e a foto carimbada como prova (pede motivo à gestão, recusa os outros)',()=>{
  const motivoParaApagarFoto=daTela('motivoParaApagarFoto');
  const avisos=[];
  const reaberta={id:'r',finalizadaEm:'',reabertaEm:'2026-10-11T10:00:00Z'};
  const carimbada={id:'c',fotosProva:['foto_prova']};
  for(const [os,fid] of [[reaberta,'foto_x'],[carimbada,'foto_prova']]){
    assert.deepEqual(motivoParaApagarFoto(os,'operacao',{confirmar:()=>true,perguntar:()=>MOTIVO,avisar:t=>avisos.push(t)},fid),{apagar:false},JSON.stringify(os));
    assert.deepEqual(motivoParaApagarFoto(os,'pcp',{confirmar:()=>true,perguntar:()=>MOTIVO,avisar:()=>{}},fid),{apagar:true,motivo:MOTIVO});
  }
  assert.ok(avisos.length===2&&avisos.every(t=>/gestão do PCP/.test(t)&&!/—/.test(t)),JSON.stringify(avisos));
  // A foto que não é prova, numa O.S. que nunca foi finalizada: o confirm de sempre.
  assert.deepEqual(motivoParaApagarFoto(carimbada,'montagem',{confirmar:()=>true,perguntar:()=>{throw new Error('não pergunta');},avisar:()=>{}},'foto_outra'),{apagar:true,motivo:''});
});

test('revisão onda-w1-backup: o espelho do celular não tira da O.S. reaberta a foto da entrega',()=>{
  const eq=fs.readFileSync(path.join(__dirname,'..','equipe.js'),'utf8');
  const ini=eq.indexOf('const apagarFoto = id =>'),fim=eq.indexOf('\n  };\n',ini)+5;
  assert.ok(ini>0,'a função do espelho existe');
  const chamadas=[],avisos=[];
  const montar=draft=>new Function('STORE','_draft','confirm','toast',eq.slice(ini,fim)+'; return apagarFoto;')({delFotoSync:id=>chamadas.push(id)},draft,()=>true,t=>avisos.push(t));
  assert.equal(montar({id:'r',reabertaEm:'2026-10-11T10:00:00Z',fotosRetornoIds:['foto_prova']})('foto_prova'),false);
  assert.equal(montar({id:'c',fotosProva:['foto_prova'],fotosRetornoIds:['foto_prova']})('foto_prova'),false);
  assert.deepEqual(chamadas,[],'nenhum pedido de apagar foi para a fila');
  assert.ok(avisos.length===2&&avisos.every(t=>/gestão do PCP/.test(t)&&!/—/.test(t)),JSON.stringify(avisos));
  // O.S. aberta: segue apagando.
  assert.equal(montar({id:'a',fotosRetornoIds:['foto_nova']})('foto_nova'),true);
  assert.deepEqual(chamadas,['foto_nova']);
});

// ---------------------------------------------------------------- R4: pcp_meta na porta de exportação
test('revisão onda-w1-backup: pcp_meta entra na exportação (cópia de desfazer do robô e cache do ERP), sem a credencial do ERP',async()=>{
  const SEGREDO='credencial-ficticia-que-nao-pode-sair';
  const meta=[
    {chave:'carteira-auditoria:2026-10-01T10:00:00Z',valor:{em:'2026-10-01T10:00:00Z',numeros:['N1'],antes:[{id:'os-1'}]},atualizado_em:'2026-10-01T10:00:00Z'},
    {chave:'entregues:2026-09',valor:{mes:'2026-09',os:[]},atualizado_em:'2026-10-01T10:00:00Z'},
    {chave:'mubisys',valor:{publicKey:'pk-ficticia',accessToken:SEGREDO},atualizado_em:'2026-10-01T10:00:00Z'},
    {chave:'sync_status',valor:{ok:true},atualizado_em:'2026-10-01T10:00:00Z'},
  ];
  for(const limite of [1,2,3,500]){
    const e=await edge('pcp-sync',{pcp_registros:[{colecao:'os',id:'os-1',apagado:false,atualizado_em:'2026-10-01T10:00:00Z',registro:{id:'os-1',numero:'1'}}],
      pcp_demandas:[{id:'dem-1',registro:{id:'dem-1'},revision:1,mutation_id:'m1',atualizado_em:'2026-10-08T10:00:00Z'}],pcp_meta:structuredClone(meta)});
    const paginas=[];let cursor=null;
    for(let i=0;i<50;i++){const r=await e.call({action:'exportarBackup',...(cursor?{cursor}:{}),limite});assert.equal(r.status,200,JSON.stringify(r));paginas.push(r);cursor=r.nextCursor;if(cursor==null)break;}
    assert.equal(cursor,null,'a exportação terminou');
    const vindas=paginas.flatMap(p=>p.meta||[]);
    assert.deepEqual(vindas.map(m=>m.chave),['carteira-auditoria:2026-10-01T10:00:00Z','entregues:2026-09','sync_status'],'limite '+limite);
    assert.deepEqual(vindas[0].valor,meta[0].valor);assert.equal(vindas[0].atualizado_em,meta[0].atualizado_em);
    assert.equal(paginas[0].contagemInicio.pcp_meta,3,'a contagem não conta a credencial');
    assert.equal(paginas.at(-1).contagemFim.pcp_meta,3);
    assert.equal(paginas.flatMap(p=>p.registros).length,1);assert.equal(paginas.flatMap(p=>p.demandas).length,1);
    assert.ok(!JSON.stringify(paginas).includes(SEGREDO),'a credencial do ERP nunca sai pela porta');
    for(const p of paginas)assert.ok((p.registros.length+p.demandas.length+(p.meta||[]).length)<=limite);
  }
  const e=await edge('pcp-sync',{pcp_meta:meta});
  assert.equal((await e.call({action:'exportarBackup',cursor:'["m","x","a"]'})).status,400,'cursor de meta adulterado');
});

// ---------------------------------------------------------------- M21: o CSV aprovado e a impressão digital dele
test('revisão onda-w1-backup: a aprovação guarda o CSV e o sha256 dele; a exportação devolve o CSV guardado e recusa o adulterado',async()=>{
  const {montarOriginal}=require('../scripts/ensaio-backup-pcp.cjs');
  const {e,aprovada,csv}=await montarOriginal();
  const sha=crypto.createHash('sha256').update(csv,'utf8').digest('hex');
  const linha=e.db.pcp_registros.find(r=>r.colecao==='performance_comissao'&&r.id===aprovada.id);
  assert.equal(linha.registro.csv,csv,'o CSV aprovado fica no registro da aprovação');
  assert.equal(linha.registro.csvSha256,sha,'com a impressão digital dele');
  assert.equal(aprovada.csvSha256,sha,'a resposta da aprovação diz a impressão digital');
  const GESTOR={papel:'pcp',nome:'Gestor fictício',sub:'gestor',exp:Math.floor(Date.parse('2027-12-31T00:00:00Z')/1000)};
  const x=await e.call({action:'performanceComissaoExportar',de:'2026-11-01',ate:'2026-11-30',id:aprovada.id},GESTOR);
  assert.equal(x.status,200,JSON.stringify(x));assert.equal(x.csv,csv);assert.equal(x.csvSha256,sha);
  // A prévia não guarda CSV (não se paga prévia).
  assert.ok(e.db.pcp_registros.filter(r=>r.colecao==='performance_comissao'&&r.registro.tipo==='previa').every(r=>r.registro.csv===undefined));
  // CSV guardado que não confere com a impressão digital: a exportação recusa.
  linha.registro.csv=csv.replace(/\r\n/,'\r\n"adulterado";');
  const ruim=await e.call({action:'performanceComissaoExportar',de:'2026-11-01',ate:'2026-11-30',id:aprovada.id},GESTOR);
  assert.equal(ruim.status,409,JSON.stringify(ruim));assert.match(ruim.error,/impressão digital/);
});
