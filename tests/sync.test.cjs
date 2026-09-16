const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const OS='impresilk_inst_os', FILA='impresilk_inst_fila';
function store({lista=[],fila=[],responder=()=>({os:[]}),falhaMigracao=false}={}) {
  const ls=new Map([[OS,JSON.stringify(lista)],[FILA,JSON.stringify(fila)]]);
  const eventos=[], gravados=[];
  const db={transaction(_name,modo){
    const tx={objectStore:()=>({
      get(){const req={};queueMicrotask(()=>req.onsuccess?.({target:{result:null}}));return req;},
      put(value){queueMicrotask(()=>{if(falhaMigracao)tx.onabort?.();else{gravados.push(value);tx.oncomplete?.();}});}
    })}; return tx;
  }};
  const ctx=vm.createContext({console:{log(){},warn(){},error(){}},navigator:{onLine:true},window:{addEventListener(){}},
    localStorage:{getItem:k=>ls.get(k)||null,setItem:(k,v)=>ls.set(k,v),removeItem:k=>ls.delete(k)},
    indexedDB:{open(){const req={};queueMicrotask(()=>req.onsuccess({target:{result:db}}));return req;}},
    setTimeout:()=>1,clearTimeout(){},AbortController,
    fetch:async(_url,req)=>{const r=await responder(JSON.parse(req.body));return {ok:!(r.http>=400),status:r.http||200,json:async()=>r};}
  });
  const src=fs.readFileSync(path.join(process.env.PCP_BASELINE || path.join(__dirname,'..'),'store.js'),'utf8');
  vm.runInContext(src,ctx); const s=vm.runInContext('STORE',ctx);
  s.on('pull-truncado',e=>eventos.push(e));
  return {s,ls,ctx,eventos,gravados};
}
test('erro permanente não descarta edição após 25 tentativas',async()=>{
  const item={action:'upsert',os:{id:'a',numero:'100',atualizadoEm:'2026-09-09'}};
  const {s}=store({lista:[item.os],fila:[item],responder:()=>({http:400})});
  for(let i=0;i<26;i++) await s.trySync();
  assert.equal(s.getQueue().length,1);
  assert.equal(s.getQueue()[0].os.numero,'100');
});
test('migração só remove a origem depois de confirmar a gravação no IndexedDB',async()=>{
  const {s,ls,gravados}=store({lista:[{id:'a'}]});
  await s.pronto(); assert.equal(gravados.length,1); assert.equal(ls.has(OS),false);
});
test('migração abortada preserva original no disco e dados em memória',async()=>{
  const {s,ls}=store({lista:[{id:'a'}],falhaMigracao:true});
  await s.pronto(); assert.equal(ls.has(OS),true);assert.equal(s.getAllOS()[0].id,'a');
});
test('cursor repetido interrompe consulta sem remover nem alterar cache',async()=>{
  const {s,eventos}=store({lista:[{id:'a',rev:1},{id:'b',rev:1}],responder:()=>({os:[{id:'a',rev:2}],nextAfter:'a'})});
  await s.pronto();const r=await s.pull();
  assert.equal(r.incompleta,true);assert.equal(s.getAllOS().length,2);assert.equal(s.getOS('a').rev,1);assert.equal(eventos.length,1);
});
test('falha na segunda página preserva cache inteiro sem alteração parcial',async()=>{
  const {s}=store({lista:[{id:'a',rev:1},{id:'b',rev:1}],responder:q=>q.after?{http:500}:{os:[{id:'a',rev:2}],nextAfter:'a'}});
  await s.pronto();await s.pull();assert.equal(s.getOS('a').rev,1);assert.equal(s.getAllOS().length,2);
});
test('lista completa atualiza remoto, remove ausência e preserva edição offline',async()=>{
  const edit={id:'c',rev:1,cliente:'alterado aqui'};
  const {s}=store({lista:[{id:'a',rev:1},{id:'b'},edit],fila:[{action:'upsert',os:edit}],responder:q=>q.after?{os:[]}:{os:[{id:'a',rev:2}],nextAfter:'a'}});
  await s.pronto();await s.pull();assert.equal(s.getOS('a').rev,2);assert.equal(s.getOS('b'),null);assert.equal(s.getOS('c').cliente,'alterado aqui');
});
test('edição durante a consulta vence a resposta antiga e permanece na fila',async()=>{
  let liberar; const resposta=new Promise(r=>liberar=r);
  const {s,ctx}=store({lista:[{id:'a',rev:1}],responder:()=>resposta});
  await s.pronto();const pull=s.pull();
  ctx.navigator.onLine=false;
  s.saveOS({id:'a',rev:1,cliente:'edição durante a rede',atualizadoEm:'2026-09-09T12:00:00'});
  liberar({os:[{id:'a',rev:2,cliente:'antigo'}]});await pull;
  assert.equal(s.getOS('a').cliente,'edição durante a rede');assert.equal(s.getQueue().length,1);
});
test('401 conserva fila e informa sessão recusada',async()=>{
  const {s}=store({fila:[{action:'delete',id:'a'}],responder:()=>({http:401})});
  let status='';s.onSync(e=>status=e);await s.trySync();assert.equal(s.getQueue().length,1);assert.equal(status,'sem-sessao');
});
test('service worker remove apenas caches deste sistema',async()=>{
  const handlers={},apagados=[];
  const sw=fs.readFileSync(path.join(process.env.PCP_BASELINE || path.join(__dirname,'..'),'sw.js'),'utf8');
  const atual=(sw.match(/impresilk-shell-v\d+/)||[])[0];
  const velhos=['impresilk-shell-v57','impresilk-shell-v58','impresilk-shell-v59','impresilk-shell-v60','impresilk-shell-v61','impresilk-shell-v62','impresilk-shell-v63','impresilk-shell-v64'];
  const ctx=vm.createContext({self:{addEventListener:(e,fn)=>handlers[e]=fn,clients:{claim:async()=>{}}},caches:{keys:async()=>[...velhos,atual,'rh-v20','dre-v5'],delete:async k=>apagados.push(k)}});
  vm.runInContext(sw,ctx);
  let p;handlers.activate({waitUntil:v=>p=v});await p;
  assert.deepEqual(apagados,velhos);
  assert.equal(apagados.includes(atual),false);
  assert.equal(apagados.includes('rh-v20'),false);
});

/* ══ PULL INCREMENTAL E MAESTRO (14/09/2026) ══
   Medido no app parado: 6 páginas de 150 O.S a cada 30 s, 5 MB por minuto e
   meio POR APARELHO, para receber 2 O.S por hora. Os testes abaixo travam a
   regra nova: com cursor fresco o app pede só o que mudou; lápide de outro
   aparelho some daqui; edição pendente nunca sai nem é sobrescrita; sem
   cursor (ou com ele velho) vem a lista completa POR ESCOPO. */
const CURSOR = 'impresilk_inst_cursor';
function comCursor(o, em) { o.ls.set(CURSOR, JSON.stringify({ em })); return o; }

test('com cursor fresco o pull pede só o que mudou (since) e guarda o carimbo do SERVIDOR', async () => {
  const pedidos = [];
  const o = comCursor(store({ lista: [{ id: 'a', rev: 1 }, { id: 'b', rev: 1 }],
    responder: q => { pedidos.push(q); return { os: [{ id: 'a', rev: 2, cliente: 'novo' }], agora: '2099-01-01T00:00:00.000Z', incremental: true }; } }),
    new Date().toISOString());
  await o.s.pronto(); const r = await o.s.pull();
  assert.equal(pedidos.length, 1, 'uma requisição, não seis páginas');
  assert.ok(pedidos[0].since, 'manda o carimbo');
  assert.equal(r.incremental, true);
  assert.equal(o.s.getOS('a').cliente, 'novo');
  assert.equal(o.s.getOS('b').rev, 1, 'o que o servidor não mencionou fica como está');
  assert.equal(JSON.parse(o.ls.get(CURSOR)).em, '2099-01-01T00:00:00.000Z', 'cursor = relógio do servidor, não do tablet');
});

test('lápide vinda no incremental remove a O.S — mas não a que tem edição pendente aqui', async () => {
  const edit = { id: 'b', rev: 1, cliente: 'editado offline' };
  const o = comCursor(store({ lista: [{ id: 'a', rev: 1 }, edit], fila: [{ action: 'upsert', os: edit }],
    responder: () => ({ os: [{ id: 'a', apagado: true }, { id: 'b', apagado: true }], agora: '2099-01-01T00:00:00.000Z', incremental: true }) }),
    new Date().toISOString());
  await o.s.pronto(); await o.s.pull();
  assert.equal(o.s.getOS('a'), null, 'apagada em outro aparelho some daqui');
  assert.equal(o.s.getOS('b').cliente, 'editado offline', 'edição pendente nunca sai nem é sobrescrita');
});

test('incremental que vem cheio (500 mudanças) refaz a lista completa por escopo', async () => {
  const pedidos = [];
  const muitos = Array.from({ length: 500 }, (_, i) => ({ id: 'x' + i, rev: 1 }));
  const o = comCursor(store({ lista: [], responder: q => {
    pedidos.push(q);
    if (q.since) return { os: muitos, agora: '2099-01-01T00:00:00.000Z', incremental: true, cheio: true };
    return { os: [{ id: 'a', rev: 1 }], agora: '2099-01-02T00:00:00.000Z', escopo: q.escopo };
  } }), new Date().toISOString());
  await o.s.pronto(); const r = await o.s.pull();
  assert.equal(pedidos[0].since !== undefined, true);
  assert.equal(pedidos[1].escopo, 'recentes', 'o completo pede só abertas + finalizadas recentes');
  assert.equal(pedidos[1].dias, o.s.JANELA_LOCAL_DIAS);
  assert.equal(r.completo, true);
  assert.equal(o.s.getAllOS().length, 1);
});

test('sem cursor, ou com cursor velho, vem a lista completa e o cursor nasce da PRIMEIRA página', async () => {
  const pedidos = [];
  const o = store({ lista: [], responder: q => { pedidos.push(q); return q.after ? { os: [{ id: 'b', rev: 1 }], agora: 'T-pag2' } : { os: [{ id: 'a', rev: 1 }], nextAfter: 'a', agora: 'T-pag1' }; } });
  await o.s.pronto(); await o.s.pull();
  assert.equal(pedidos[0].since, undefined);
  assert.equal(JSON.parse(o.ls.get(CURSOR)).em, 'T-pag1', 'o que mudar durante a paginação chega no próximo incremental');
  // cursor velho (7 h) também força o completo
  const v = comCursor(store({ lista: [], responder: q => { pedidos.push(q); return { os: [], agora: 'T3' }; } }), new Date(Date.now() - 7 * 3600000).toISOString());
  await v.s.pronto(); await v.s.pull();
  assert.equal(pedidos[pedidos.length - 1].since, undefined, 'cursor de 7 h não vale como incremental');
});

test('o pull não roda por cima de si mesmo em rede lenta', async () => {
  let liberar; const lento = new Promise(r => liberar = r);
  const o = comCursor(store({ lista: [], responder: () => lento }), new Date().toISOString());
  await o.s.pronto();
  const p1 = o.s.pull(); const p2 = await o.s.pull();
  assert.equal(p2.ocupado, true, 'o segundo pull desiste em vez de empilhar');
  liberar({ os: [], agora: 'T', incremental: true }); await p1;
});

test('config só volta inteira quando a versão mudou', async () => {
  const pedidos = [];
  const o = store({ lista: [], responder: q => { pedidos.push(q); return q.seVersao === 'v1' ? { semMudanca: true, versao: 'v1' } : { cfg: { instaladores: ['X'] }, versao: 'v1' }; } });
  await o.s.pronto();
  assert.equal(await o.s.pullCFG(), true, 'primeira vez: baixou');
  assert.equal(await o.s.pullCFG(), false, 'segunda vez: 40 bytes, nada gravado');
  assert.equal(pedidos[1].seVersao, 'v1');
});

/* CARREGAR TUDO ANDA SOZINHO.
   A fila normal só avança quando a TELA repinta (o render chama
   garantirEntregues de novo a cada notificação). Sair da aba no meio congelava
   o carregamento e a tela voltava dizendo "carregando 7 de 9" com nada em voo.
   Aqui ninguém repinta: se andar, andou sozinho. */
test('carregar tudo: drena a fila sem nenhum render no meio', async () => {
  const pedidos = [];
  const {s} = store({responder: b => {
    pedidos.push(b.action);
    if (b.action === 'entreguesMeses') {
      // O servidor só tem um dos três guardados.
      return {pacotes: {'2026-07': {v: 3, em: '2026-09-15T10:00:00Z', os: [], total: 0}}, faltando: ['2026-09', '2026-08']};
    }
    if (b.action === 'entreguesMes') return {v: 3, em: '2026-09-15T10:00:00Z', mes: b.mes, total: 0, os: []};
    return {os: []};
  }});
  const r = await s.carregarTudoEntregues(['2026-09', '2026-08', '2026-07']);
  assert.equal(r.fim, true);
  assert.equal(r.prontos, 3, 'os três meses ficam guardados');
  assert.deepEqual([...r.erros], []);
  assert.equal(pedidos.filter(a => a === 'entreguesMeses').length, 1, 'o servidor é perguntado uma vez só');
  assert.equal(pedidos.filter(a => a === 'entreguesMes').length, 2, 'só o que o servidor não tinha vai ao ERP');
  assert.ok(s.entreguesMes('2026-08'), 'e fica gravado');
});

test('carregar tudo: mês que não responde é dito, não vira zero', async () => {
  const {s} = store({responder: b => {
    if (b.action === 'entreguesMeses') return {pacotes: {}, faltando: ['2026-08']};
    if (b.action === 'entreguesMes') return {http: 500};
    return {os: []};
  }});
  const r = await s.carregarTudoEntregues(['2026-08']);
  assert.deepEqual([...r.erros], ['2026-08'], 'sem resposta entra como erro');
  assert.equal(r.prontos, 0, 'e não conta como guardado');
});

test('carregar tudo: enquanto roda, a fila do render sai da frente', async () => {
  let emVoo = 0, pico = 0;
  const {s} = store({responder: async b => {
    if (b.action === 'entreguesMeses') return {pacotes: {}, faltando: []};
    if (b.action === 'entreguesMes') {
      emVoo++; pico = Math.max(pico, emVoo);
      await new Promise(r => queueMicrotask(r));
      // O render repinta a cada notificação e tentaria empurrar mais meses.
      s.garantirEntregues(['2026-09', '2026-08', '2026-07', '2026-06', '2026-05']);
      emVoo--;
      return {v: 3, em: '2026-09-15T10:00:00Z', mes: b.mes, total: 0, os: []};
    }
    return {os: []};
  }});
  await s.carregarTudoEntregues(['2026-09', '2026-08', '2026-07', '2026-06', '2026-05']);
  assert.ok(pico <= 3, `nunca mais de 3 varreduras no ERP ao mesmo tempo (foi ${pico})`);
});
