'use strict';
/* ONDA VOLTA, ITEM 35 DA FILA DE 11/10/2026: A FOTO DA LIMPEZA DA VOLTA COM
   O ID DA O.S. A foto da ficha nasce foto_<osId>_<hora>_<sorteio> desde a F24
   (o arquivo no servidor diz a O.S. sem ninguém varrer as listas), mas a foto
   do carro na limpeza da volta (celular) e na conferência da volta (gestão)
   ia sem a O.S. e nascia foto_<hora>_<sorteio>. A mesma foto vale para todas
   as O.S. da volta: o id que vai no nome é o da primeira O.S. dela. Dados
   fictícios. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const RAIZ=path.join(__dirname,'..');
const ler=f=>fs.readFileSync(path.join(RAIZ,f),'utf8');

test('item 35: a foto do carro na limpeza da volta (celular) nasce com o id da O.S.', async()=>{
  const nodes=new Map(), chamadas=[];
  function node(sel){
    if(!nodes.has(sel))nodes.set(sel,{innerHTML:'',textContent:'',value:'',querySelector:node,querySelectorAll:()=>[],setAttribute(){},classList:{toggle(){},add(){},remove(){}}});
    return nodes.get(sel);
  }
  const lista=[{id:'os-a',numero:'N1',tipo:'externo',equipe:['Ana']},{id:'os-b',numero:'N2',tipo:'externo',equipe:['Ana']}];
  const STORE={getCFG:()=>({}),getAllOS:()=>lista,getOS:id=>lista.find(o=>o.id===id)||null,getQueue:()=>[],
    pushPhoto:async(f,osId)=>{chamadas.push(osId);return 'foto_'+(osId||'sem')+'_1';},pullPhoto:async()=>null,getLastSync:()=>'',saveOS(){},onConflict(){}};
  const ctx=vm.createContext({console,Date,document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){}},window:{},
    localStorage:{getItem:()=>null,setItem(){}},STORE,setTimeout(){},confirm:()=>true,navigator:{onLine:true}});
  vm.runInContext(ler('operacao.js'),ctx);
  vm.runInContext(ler('equipe.js'),ctx);
  vm.runInContext(`toast=()=>{}; EQ.instalador="Ana"; EQ.limpeza={g:{chave:'k',dia:'2026-11-05',veiculo:'Carro fictício',os:[STORE.getOS('os-a'),STORE.getOS('os-b')]},est:{resp:{},obs:'',fotos:[]}}; desenharLimpeza();`,ctx);
  const inp=node('[data-lz-foto]');inp.files=[{}];
  await inp.onchange();
  assert.deepEqual(chamadas,['os-a'],'caso ruim: pushPhoto(f) sem a O.S.');
  assert.deepEqual(vm.runInContext('JSON.stringify(EQ.limpeza.est.fotos)',ctx),'["foto_os-a_1"]');
});

test('item 35: a foto da conferência da volta (gestão) também nasce com o id da O.S.', ()=>{
  const s=ler('app.js');
  const ini=s.indexOf('function abrirConferenciaVolta('), fim=s.indexOf('function salvarConferenciaVolta(');
  const trecho=s.slice(ini,fim);
  assert.ok(ini>0&&fim>ini);
  assert.doesNotMatch(trecho,/STORE\.pushPhoto\(f\)/,'caso ruim: a foto da volta ia sem a O.S.');
  assert.match(trecho,/STORE\.pushPhoto\(f, osDaFoto\)/);
  assert.match(trecho,/const osDaFoto = \(g\.os\[0\] && g\.os\[0\]\.id\) \|\| '';/);
});
