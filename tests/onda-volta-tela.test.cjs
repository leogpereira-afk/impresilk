'use strict';
/* ONDA VOLTA NA TELA E NAS CÓPIAS (12/10/2026). Cada teste começa pelo caso
   ruim. Dados fictícios (repositório público).
   - A conferência da volta é da viagem: a da primeira viagem não vale para a
     segunda na fila "Volta do carro", e conferir a viagem nova com as mesmas
     respostas grava a conferência dela (com o dia).
   - M11: o diálogo da conferência por item propõe o dia da volta.
   - Item 16: o carro escolhido na lista do Ativos leva o id; a chave da volta
     é o id nas quatro cópias (OPERACAO.chaveDaVolta, o agrupamento do lote, o
     status e o servidor), e o nome é a reserva.
   - As duas cópias da volta por viagem (aparelho e _shared) dão a mesma
     saída num sorteio, e a cópia do aparelho bate com OPERACAO. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const RAIZ=path.join(__dirname,'..');
const ler=f=>fs.readFileSync(path.join(RAIZ,f),'utf8');
const O=require('../operacao.js');
const C=require('../conferencia-entrega.js');
const D=require('../divisao.js');
const hoje='2026-09-09';

function tela(lista,cfg={}){
  const nodes=new Map();
  function node(sel){
    if(!nodes.has(sel))nodes.set(sel,{innerHTML:'',textContent:'',value:'',querySelector:node,querySelectorAll:()=>[],setAttribute(){},classList:{toggle(){},add(){},remove(){}},focus(){},scrollIntoView(){},insertAdjacentHTML(_,v){this.innerHTML+=v;}});
    return nodes.get(sel);
  }
  const ctx=vm.createContext({console,Date:class extends Date{constructor(...a){super(...(a.length?a:[hoje+'T12:00:00']));}},document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){}},window:{},localStorage:{getItem:()=>null},
    STORE:{getAllOS:()=>lista,getCFG:()=>cfg,getOS:id=>lista.find(o=>o.id===id)},setTimeout(){}});
  vm.runInContext(ler('operacao.js'),ctx);
  vm.runInContext(ler('operacao-revisao.js'),ctx);
  vm.runInContext(ler('app.js'),ctx);
  vm.runInContext(`STATE.user={nome:'Gestor fictício',papel:'admin'}; STATE._painelDia='${hoje}'; wireLinhaTempo=()=>{};`,ctx);
  return {run:code=>vm.runInContext(code,ctx),node};
}
const voltaOS=(id,extra={})=>({id,numero:'V'+id,cliente:'Cliente fictício '+id,tipo:'externo',equipe:['Ana','Bia'],veiculo:'Carro fictício',liberadoPCP:true,instalacao:{data:hoje},retornoEm:hoje+'T17:00:00',...extra});
const SIM={carroLimpo:'sim',carroArrumado:'sim',equipamentosOk:'sim',semAvaria:'sim'};

test('fila da volta: a conferência da viagem de 01/09 não vale para a viagem de hoje; conferir com as mesmas respostas grava a desta viagem', ()=>{
  const antiga={...SIM,obs:'',fotos:[],por:'Gestor fictício',em:'2026-09-01T20:00:00Z',dia:'2026-09-01'};
  const t=tela([voltaOS('1',{retornoConf:antiga})]);
  t.run(`globalThis.__salvas=[]; STORE.saveOS=o=>__salvas.push(JSON.parse(JSON.stringify(o)))`);
  const g='voltasDoRecorte().todas[0]';
  assert.equal(t.run(`${g}.situacao`),'conferir','caso ruim: a fila dizia "conferida" e a viagem nova nunca era conferida');
  // O diálogo não parte da conferência de outra viagem.
  assert.equal(t.run(`respostasIniciaisVolta(${g}).carroLimpo`),'');
  assert.equal(t.run(`salvarConferenciaVolta(${g}, {${Object.entries(SIM).map(([k,v])=>k+":'"+v+"'").join(',')},obs:'',fotos:[]})`),1);
  const rc=t.run('__salvas[0].retornoConf');
  assert.equal(rc.dia,hoje,'a conferência leva o dia da viagem');assert.equal(rc.por,'Gestor fictício');assert.notEqual(rc.em,antiga.em);
});

test('fila da volta: a conferência antiga, sem o dia, vale como sempre; a não ser que o servidor já tenha guardado a viagem de hoje sem conferência', ()=>{
  const antiga={...SIM,obs:'',fotos:[],por:'Gestor fictício',em:'2026-09-01T20:00:00Z'};
  assert.equal(tela([voltaOS('1',{retornoConf:antiga})]).run('voltasDoRecorte().todas[0].situacao'),'conferida','legado se lê como era');
  const comViagens=voltaOS('1',{retornoConf:antiga,voltas:[{dia:'2026-09-01',equipe:['Ana','Bia'],veiculo:'Carro fictício',retornoConf:{...SIM,por:'Gestor fictício',porId:'',em:antiga.em}},{dia:hoje,equipe:['Ana','Bia'],veiculo:'Carro fictício',retornoConf:null}]});
  assert.equal(tela([comViagens]).run('voltasDoRecorte().todas[0].situacao'),'conferir');
  // A ficha também: os selects começam vazios, e mexer neles começa a conferência desta viagem.
  assert.equal(O.confDaViagem(comViagens),null);assert.equal(O.confDaViagem({...comViagens,voltas:undefined}),antiga);
});

test('Lançar entrega e o lote: a conferência de outra viagem não é o ponto de partida, e a desta vai com o dia', ()=>{
  const s=ler('casa.js');
  const ctx={OPERACAO:O,STATE:{user:{nome:'Gestor fictício',papel:'pcp'}},nowISO:()=>'2026-10-05T12:00:00Z',podeOrigemRetrabalho:()=>true,REGRAS:{origemRetrabalho:x=>x}};
  vm.createContext(ctx);vm.runInContext(s.slice(s.indexOf('const CAMPOS_RETRABALHO'),s.indexOf('/* A resposta que o perguntarRetrabalho deu')),ctx);
  const os={id:'1',tipo:'externo',equipe:['Ana'],veiculo:'Carro fictício',retornoEm:'2026-10-02T17:00:00',retornoConf:{...SIM,por:'Outro',em:'2026-09-20T12:00:00Z',dia:'2026-09-20'}};
  const nova=ctx.aplicarLancamento(os,{data:'2026-10-02',respostasVolta:{...SIM}});
  assert.equal(nova.retornoConf.dia,'2026-10-02');assert.equal(nova.retornoConf.por,'Gestor fictício');
  // Sem mudança e na mesma viagem, nada recarimba (a regra de sempre).
  const mesma=ctx.aplicarLancamento(nova,{data:'2026-10-02',respostasVolta:{...SIM}});
  assert.equal(mesma.retornoConf.em,nova.retornoConf.em);
  assert.match(ler('lote.js'),/const base = g\.os\.map\(daViagem\)\.find\(c => OPERACAO\.voltaRespondida\(c\)\) \|\| \{\};/);
});

/* ─────────────────────────────── M11 na tela ─────────────────────────────── */
async function dialogoConferir(os){
  let html='';
  const elemento=()=>({textContent:'',hidden:false,disabled:false,value:'',classList:{toggle(){},add(){}},querySelector:()=>null,focus(){},scrollIntoView(){}});
  const els={};
  const c={console,crypto:{randomUUID:()=>'nova-0001'},STATE:{user:{papel:'pcp'}},esc:s=>String(s??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch])),
    perfPodeEditar:()=>true,toast:()=>{},perfConfig:()=>({equipes:[]}),perfRegrasFonte:()=>({versoes:[]}),diaEntrega:()=>'2026-11-10',dinheiroCasa:n=>'R$ '+n,
    STORE:{getQueue:()=>[],api:async()=>({os,valor:8500,fechados:[],inteira:null})},
    ALOCUI:{iniciar(){},montar(){},repintar(){},estado:()=>({}),bloqueio:()=>'',esquecer(){},definirDataEntrega(){}},
    DIVISAO:D,perfDialog:(t,h)=>{html=h;return {open:true,querySelector:sel=>els[sel]||(els[sel]=elemento()),querySelectorAll:()=>[],addEventListener(){},close(){}};}};
  vm.createContext(c);
  for(const f of ['entrega-item.js','conferencia-entrega.js'])vm.runInContext(ler(f).replace(/^const (ENTREGA_ITEM|CONFERENCIA_ENTREGA) =/m,'var $1 ='),c);
  vm.runInContext(ler('conferencia-entrega-ui.js'),c);
  await c.conferirItensEntrega(os.id,'');
  return html.match(/id="conf-data" type="date" value="([^"]*)"/)[1];
}
test('M11: o diálogo da conferência por item propõe o dia da volta, não o da finalização', async()=>{
  const base={id:'c1',numero:'90201',rev:1,tipo:'externo',cliente:'Cliente fictício',valorTotal:8500,equipe:['100001'],finalizadaEm:'2026-11-10T15:00:00Z',
    itens:[{uid:'a',item:'1',descricao:'Painel fictício A',qtde:'4',subtotal:'5000'}]};
  assert.equal(await dialogoConferir({...base,horaRetorno:'18:00',retornoEm:'2026-09-08T18:00:00'}),'2026-09-08','caso ruim: propunha 10/11 (a finalização, aqui do diaEntrega) e a volta de 08/09 ficava de fora');
  assert.equal(await dialogoConferir(base),'2026-11-10','sem retorno, como antes');
  assert.equal(await dialogoConferir({...base,horaRetorno:'18:00',retornoEm:'2099-01-01T18:00:00'}),'2026-11-10','retorno no futuro não é proposto');
});

/* ─────────────────────────────── item 16 na tela ─────────────────────────────── */
test('item 16: o carro escolhido na lista do Ativos leva o id; nome repetido na lista ou fora dela fica sem id', ()=>{
  const s=ler('casa.js');
  const ativos=[{id:'7',nome:'UNO - 10',placa:'AAA0A00'},{id:'8',nome:'Strada'},{id:'9',nome:'Strada'}];
  const ctx={elencoRH:()=>({veiculos:ativos})};vm.createContext(ctx);
  vm.runInContext(s.slice(s.indexOf('function veiculosRH()'),s.indexOf('function',s.indexOf('function definirVeiculoId(')+10)),ctx);
  assert.equal(ctx.definirVeiculoId({veiculo:'UNO - 10'}).veiculoId,'7');
  assert.equal(ctx.definirVeiculoId({veiculo:'Fiat Uno',veiculoId:'7'}).veiculoId,undefined,'nada de semelhança: outro nome, sem id');
  assert.equal(ctx.definirVeiculoId({veiculo:'Strada'}).veiculoId,undefined,'dois carros com o mesmo nome: sem id');
  assert.equal(ctx.definirVeiculoId({veiculo:'Instalação interna',veiculoId:'8'}).veiculoId,undefined);
  // A ficha e o formulário da agenda chamam a mesma função.
  assert.match(ler('app.js'),/if \(el\.dataset\.f === 'veiculo' && typeof definirVeiculoId === 'function'\) definirVeiculoId\(_modalDraft\);/);
  assert.match(s,/if \(veiculo\) \{ os\.veiculo = veiculo; definirVeiculoId\(os\); \}/);
});

test('item 16: as quatro cópias da chave da volta usam o id do carro, e o nome como reserva', async()=>{
  const S=await import('../supabase/functions/_shared/pcp-status.mjs');
  const a={id:'a',tipo:'externo',equipe:['Ana'],veiculo:'Fiat Uno',veiculoId:'ativo-7',retornoEm:'2026-11-05T18:00:00',retornoConferido:{dia:'2026-11-05',hora:'18:00',em:'x'}};
  const b={...a,id:'b',veiculo:'UNO - 10'}, c={...a,id:'c',veiculo:'UNO - 10',veiculoId:undefined};
  // 1. OPERACAO.chaveDaVolta (a fila e a prévia do aparelho).
  assert.equal(O.chaveDaVolta(a),O.chaveDaVolta(b));assert.notEqual(O.chaveDaVolta(b),O.chaveDaVolta(c));
  assert.equal(O.chaveDaVolta(c),'2026-11-05|uno - 10|nome:ana');
  // 2. O agrupamento do Fechar o dia (lote).
  assert.equal(O.agruparPorVolta([a,b,c]).length,2);
  // 3. O status (retorno antecipado), nas duas cópias.
  assert.deepEqual(O.voltaDoRetorno(a,[b,c]).map(x=>x.id),['a','b']);
  assert.deepEqual(S.voltaDoRetorno(a,[b,c]).map(x=>x.id),['a','b']);
  // 4. A cópia da volta por viagem (a que o servidor usa).
  const k=x=>O.chavePessoa(x);
  assert.equal(C.chaveDaViagem(C.registroDaVolta(a),k),O.chaveDaVolta(a));
  assert.equal(C.chaveDaViagem(C.registroDaVolta(c),k),O.chaveDaVolta(c));
});

/* ─────────────────────────────── as cópias, por sorteio ─────────────────────────────── */
function gerador(semente){
  let s=semente>>>0;
  const r=()=>{s=(s+0x6D2B79F5)>>>0;let t=s;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
  const int=(a,b)=>a+Math.floor(r()*(b-a+1));
  return {r,int,um:xs=>xs[int(0,xs.length-1)]};
}
const DIAS=['2026-11-03','2026-11-05','2026-11-06','2026-12-08','',undefined];
const HORAS=['2026-11-05T18:00:00','2026-11-05T23:30:00-03:00','2026-11-06T01:10:00','2026-12-08T18:00:00Z','2026-11-03T08:00:00',''];
function osSorteada(g,i){
  const o={id:'s'+i,tipo:g.um(['externo','externo','externo','interno']),equipe:g.um([['100001'],['100001','200002'],['200002'],[],['Ana',' Ana ','100001']]),
    veiculo:g.um(['Carro fictício','carro ficticio ','Instalação interna','',undefined]),veiculoId:g.um(['', 'ativo-7',undefined,' 7 '])};
  if(g.r()<.6)o.retornoEm=g.um(HORAS);
  if(g.r()<.4)o.horaRetorno=g.um(['18:00','']);
  if(g.r()<.4)o.saidaEm=g.um(HORAS);
  if(g.r()<.3)o.instalacao={data:g.um(DIAS)};
  if(g.r()<.4)o.entregaLancada=g.um([{data:g.um(DIAS)},{data:g.um(DIAS),desfazer:true},null]);
  if(g.r()<.5)o.finalizadaEm=g.um(HORAS);
  if(g.r()<.6)o.retornoConf={carroLimpo:g.um(['sim','nao','',true,false]),equipamentosOk:g.um(['sim','nao','']),por:'Gestor fictício',porId:g.um(['444555','gestor','']),em:'2026-11-06T12:00:00Z',...(g.r()<.5?{dia:g.um(DIAS)}:{})};
  if(g.r()<.4)o.voltas=[{dia:g.um(DIAS),equipe:g.um([['100001'],['200002','100001']]),veiculo:'Carro fictício',veiculoId:g.um(['','ativo-7']),retornoConf:g.r()<.5?{carroLimpo:'sim',carroArrumado:'',equipamentosOk:'nao',semAvaria:'',por:'G',porId:'',em:'x'}:null},{dia:g.um(DIAS),equipe:['100001'],veiculo:'Outro',veiculoId:'',retornoConf:null}];
  return o;
}
test('as duas cópias da volta por viagem (aparelho e _shared) dão a mesma saída em 3000 O.S. sorteadas, e o dia da volta é o de OPERACAO', async()=>{
  const {CONFERENCIA_ENTREGA:S}=await import('../supabase/functions/_shared/pcp-conferencia-entrega.mjs');
  const g=gerador(20261012);let n=0;
  const pessoa=x=>O.chavePessoa(x);
  for(let i=0;i<3000;i++){
    const o=osSorteada(g,i), dia=g.um(DIAS)||'', pessoas=g.um([['100001'],['100001','200002'],['300003'],[]]);
    const saida=X=>JSON.stringify([X.diaDaVolta(o),X.registroDaVolta(o),X.voltasDaOS(o),X.voltaDaOS(o),X.voltaDaEntrega(o,dia,pessoas,pessoa),X.chaveVeiculo(o),X.semCarroV(o),X.confDaVolta(o.retornoConf),
      X.registroDaVolta(o)?X.chaveDaViagem(X.registroDaVolta(o),pessoa):'']);
    assert.equal(saida(C),saida(S),'O.S. sorteada '+i);
    // O dia da volta e a chave são os da fila (OPERACAO), para a O.S. sem viagens guardadas.
    assert.equal(C.diaDaVolta(o),O.diaDaVolta(o),'dia da volta '+i);
    const r=C.registroDaVolta(o);
    if(r&&o.tipo!=='interno')assert.equal(C.chaveDaViagem(r,pessoa),O.chaveDaVolta(o),'chave '+i);
    n++;
  }
  assert.equal(n,3000);
});
