/* AUDITORIA DA GESTÃO (25/09/2026): consertos do app.js que mudam o que a
   gestão grava. Cada teste começa pelo caso que dava errado. Mesmo harness do
   telas.test.cjs: o app.js roda num contexto com DOM mínimo e STORE falso. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const hoje = '2026-09-09';
function tela(lista) {
  const nodes = new Map();
  function node(sel) {
    if (!nodes.has(sel)) nodes.set(sel, {innerHTML:'', textContent:'', value:'', querySelector:node, querySelectorAll:()=>[], setAttribute(){}, classList:{toggle(){},add(){},remove(){}}, focus(){}, scrollIntoView(){}, insertAdjacentHTML(_, v){ this.innerHTML += v; }});
    return nodes.get(sel);
  }
  const doc = {querySelector:node, querySelectorAll:()=>[], addEventListener(){}};
  const salvos = [];
  const ctx = vm.createContext({console, Date:class extends Date { constructor(...a){ super(...(a.length ? a : [hoje + 'T12:00:00'])); } }, document:doc, window:{}, localStorage:{getItem:()=>null},
    STORE:{getAllOS:()=>lista, getCFG:()=>({}), getOS:id=>lista.find(o=>o.id===id), uuid:()=>'novo-' + (salvos.length + 1),
      saveOS(os){ const i = lista.findIndex(o => o.id === os.id); if (i >= 0) lista[i] = os; else lista.push(os); salvos.push(JSON.parse(JSON.stringify(os))); }},
    setTimeout(){}, clearTimeout(){}});
  vm.runInContext(fs.readFileSync(path.join(root, 'operacao.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(process.env.PCP_BASELINE || root, 'app.js'), 'utf8'), ctx);
  vm.runInContext(`STATE.user={nome:'Revisão',papel:'pcp'}; renderModal=()=>{}; renderActiveTab=()=>{};`, ctx);
  return {run:code=>vm.runInContext(code, ctx), salvos};
}

test('PDF importado e "Salvar O.S." sem mexer em nada: a O.S. é gravada; a Nova O.S. em branco não', () => {
  const t = tela([]);
  t.run(`openModal({id:'pdf1', numero:'5501', cliente:'Padaria Sol', tipo:'externo', itens:[]}); closeModal();`);
  assert.equal(t.salvos.length, 1, 'a importada precisa ir para o store e para a fila');
  assert.equal(t.salvos[0].numero, '5501');
  t.run(`openModal(novaOS()); closeModal();`);
  assert.equal(t.salvos.length, 1, 'a Nova O.S. em branco continua sem gravar ao fechar');
});

test('parado no cliente: a 2ª gravação da ficha fecha o período com data, não como "legado" sem data', () => {
  const os = {id:'p1', numero:'77', tipo:'externo', liberadoPCP:true, paradoClienteEm:'2026-09-01T10:00:00', instalacao:{}, equipe:[]};
  const t = tela([os]);
  t.run(`openModal(STORE.getOS('p1'));
    setField('instalacao.data','2026-09-12'); saveDraft();
    setField('instalacao.periodo','Manhã'); _modalDraft.equipe=['Ana']; saveDraft();`);
  const gravada = t.salvos[t.salvos.length - 1];
  assert.equal(gravada.paradoClienteEm || '', '', 'o período parado fecha');
  const ultimo = (gravada.paradoClienteLog || []).slice(-1)[0];
  assert.ok(ultimo, 'o período vai para o log');
  assert.notEqual(ultimo.ate, '', 'fechar com "até" em branco apaga o tempo que o cliente segurou');
  assert.equal(ultimo.motivo, 'programada');
});

test('equipe na rua: estender a duração não zera a confirmação nem o carro; antes de sair, zera', () => {
  const t = tela([]);
  t.run(`_modalDraft={id:'r1', confirmacao:'Confirmado', confEm:'2026-09-09T07:00:00', carroLiberado:true, horaSaida:'08:00', instalacao:{data:'${hoje}', duracaoDias:1}};
    setField('instalacao.duracaoDias', 2);`);
  assert.equal(t.run('_modalDraft.confirmacao'), 'Confirmado');
  assert.equal(t.run('_modalDraft.carroLiberado'), true);
  t.run(`_modalDraft={id:'r2', confirmacao:'Confirmado', carroLiberado:true, instalacao:{data:'${hoje}', hora:'08:00'}};
    setField('instalacao.hora', '09:00');`);
  assert.equal(t.run('_modalDraft.confirmacao'), '', 'remarcar antes da saída continua pedindo nova confirmação');
  assert.equal(t.run('_modalDraft.carroLiberado'), false);
});

test('"Sobrescrever (meu)" mantém as fotos, a saída e a foto do problema que a equipe mandou da rua', () => {
  const t = tela([]);
  const r = JSON.parse(t.run(`JSON.stringify((() => {
    const local = {id:'c1', obsPCP:'minha edição', fotosCheckinIds:['a'], itens:[{item:'1', descricao:'Lona'}]};
    const remote = {id:'c1', obsPCP:'velha', fotosCheckinIds:['a','b'], fotosRetornoIds:['z'], saidaEm:'2026-09-09T08:00:00', horaSaida:'08:00',
      itens:[{item:'1', descricao:'Lona', statusInst:'retrab', motivo:'Medida errada', fotoProbId:'fp'}]};
    const m = manterExecucaoDoServidor(local, remote);
    return {local, m};
  })())`));
  assert.equal(r.local.obsPCP, 'minha edição', 'a edição do PCP vence no que ele mexeu');
  assert.deepEqual(r.local.fotosCheckinIds, ['a', 'b']);
  assert.deepEqual(r.local.fotosRetornoIds, ['z']);
  assert.equal(r.local.saidaEm, '2026-09-09T08:00:00');
  assert.equal(r.local.itens[0].fotoProbId, 'fp');
  assert.equal(r.local.itens[0].statusInst, 'retrab');
  assert.equal(r.m.fotos, 3);
});

test('coordenada do GPS que não é número não entra no HTML da ficha', () => {
  const t = tela([]);
  const html = t.run(`blocoExec({id:'g1', tipo:'externo', liberadoPCP:true, confirmacao:'Confirmado', instalacao:{data:'${hoje}', periodo:'Manhã'}, equipe:['Ana'],
    checkinGPS:{lat:'"><img src=x onerror=alert(1)>', lng:1, precisao:'<b>'}}, false, false)`);
  assert.doesNotMatch(html, /<img src=x/);
  assert.doesNotMatch(html, /onerror/);
  const ok = t.run(`blocoExec({id:'g2', tipo:'externo', instalacao:{}, equipe:[], checkinGPS:{lat:-19.9, lng:-43.9, precisao:12.4}}, false, false)`);
  assert.match(ok, /maps\.google\.com\/\?q=-19\.9,-43\.9/);
  assert.match(ok, /±12m/);
});

test('foto do problema que o instalador tirou aparece no item da ficha da gestão', () => {
  const t = tela([]);
  const html = t.run(`blocoItens({id:'i1', itens:[{item:'1', descricao:'Fachada', statusInst:'retrab', motivo:'Peça quebrada', obsProb:'canto', fotoProbId:'fp9'}]}, false, false)`);
  assert.match(html, /Retrabalho na instalação: Peça quebrada \(canto\)/);
  assert.match(html, /data-foto-img="fp9"/);
});

test('"Mais um dia de trabalho" segura a finalização; a lista de faltas usa o nome do campo', () => {
  const t = tela([]);
  const base = {tipo:'externo', liberadoPCP:true, confirmacao:'Confirmado', embarqueConferidoPor:'A', produtosConferidosPor:'A', ferramentasConferidas:true, carroLiberado:true,
    instalacaoOK:true, conferidoPor:'A', fotosCheckinIds:['f'], fotosRetornoIds:['r'], retornoEm:hoje + 'T17:00:00'};
  assert.equal(t.run(`validarFinalizacao(${JSON.stringify(base)}).length`), 0);
  assert.match(t.run(`validarFinalizacao(${JSON.stringify({...base, checkout:{situacao:'Mais um dia de trabalho'}})}).join(',')`), /mais um dia de trabalho/);
  const faltas = t.run(`validarFinalizacao(${JSON.stringify({...base, instalacaoOK:false, conferidoPor:'', fotosRetornoIds:[]})})`);
  assert.equal(faltas.filter(f => /Instalação OK/.test(f)).length, 1, '"Instalação OK" e "conferido por" são o mesmo checkbox');
  assert.ok(faltas.includes('foto de retorno (serviço pronto)'));
});

test('filtro "Próximos 7 dias" acompanha o dia: a aba aberta ontem não fica presa na véspera', () => {
  const t = tela([]);
  // Escolhido ontem (08/09): datas gravadas de 08 a 14. Hoje (09) o 15 entra.
  t.run(`STATE._fProg = {de:'2026-09-08', ate:'2026-09-14', rapido:'7'}`);
  assert.equal(t.run(`dentroPeriodo('2026-09-15', '_fProg')`), true);
  assert.equal(t.run(`dentroPeriodo('2026-09-08', '_fProg')`), false);
  // Data digitada à mão é fixa.
  t.run(`STATE._fProg = {de:'2026-09-01', ate:'2026-09-03', rapido:''}`);
  assert.equal(t.run(`dentroPeriodo('2026-09-09', '_fProg')`), false);
});
