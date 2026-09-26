/* AUDITORIA DA GESTÃO (25/09/2026), segunda metade do app.js: busca no
   servidor, análises além dos 60 dias do aparelho, Conferência do dia,
   importação de PDF e restauração de backup. Cada teste começa pelo caso que
   dava errado. Mesmo harness do telas.test.cjs, com o que estas telas usam a
   mais (setTimeout que roda, createElement, confirm e toast observáveis). */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const hoje = '2026-09-09';
const esperar = () => new Promise(r => setImmediate(r));

function tela(lista, extraStore = {}) {
  const nodes = new Map();
  function node(sel) {
    if (!nodes.has(sel)) nodes.set(sel, {innerHTML:'', textContent:'', value:'', querySelector:node, querySelectorAll:()=>[], setAttribute(){}, classList:{toggle(){},add(){},remove(){}}, focus(){}, scrollIntoView(){}, insertAdjacentHTML(_, v){ this.innerHTML += v; }});
    return nodes.get(sel);
  }
  const criados = [], toasts = [], abertos = [], respostas = [];
  const doc = {querySelector:node, querySelectorAll:()=>[], addEventListener(){},
    createElement(tag){ const e = {tag, click(){}, files:[]}; criados.push(e); return e; }};
  const ctx = vm.createContext({console, Date:class extends Date { constructor(...a){ super(...(a.length ? a : [hoje + 'T12:00:00'])); } },
    document:doc, window:{}, localStorage:{getItem:()=>null}, navigator:{onLine:true},
    STORE:Object.assign({getAllOS:()=>lista, getCFG:()=>({}), getOS:id=>lista.find(o=>o.id===id), getQueue:()=>[], saveOS(){}}, extraStore),
    setTimeout(fn){ fn(); return 1; }, clearTimeout(){},
    confirm(){ return respostas.length ? respostas.shift() : true; }});
  vm.runInContext(fs.readFileSync(path.join(root, 'operacao.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(process.env.PCP_BASELINE || root, 'app.js'), 'utf8'), ctx);
  vm.runInContext(`STATE.user={nome:'Revisão',papel:'admin'}; renderModal=()=>{}; renderActiveTab=()=>{};`, ctx);
  ctx.__toasts = toasts; ctx.__abertos = abertos;
  vm.runInContext(`toast=(m,t)=>__toasts.push([m,t]); openModal=os=>__abertos.push(os);`, ctx);
  return {run:code=>vm.runInContext(code, ctx), node, criados, toasts, abertos, respostas};
}

test('Arquivados: busca no servidor que falha não fica em "buscando" e tenta de novo na próxima pintura', async () => {
  let chamadas = 0;
  const t = tela([], {buscarHistorico: async () => { chamadas++; if (chamadas === 1) throw new Error('HTTP 504'); return {itens:[{id:'x'}], truncou:true}; }});
  t.run(`STATE.filtroBusca='avenida'; arqBuscar()`);
  await esperar();
  assert.equal(chamadas, 1);
  assert.doesNotMatch(t.node('#arq-nota').textContent, /buscando/, 'a nota não pode ficar em "buscando" para sempre');
  assert.match(t.node('#arq-nota').textContent, /não respondeu/);
  t.run(`arqBuscar()`);   // a mesma busca, na pintura seguinte
  await esperar();
  assert.equal(chamadas, 2, 'a chave precisa ser solta depois do erro');
  const nota = t.run(`_arqNotaTxt`);
  assert.match(nota, /pode faltar/, 'o aviso de lista cortada fica guardado para a próxima repintura');
  assert.doesNotMatch(nota, /mais antigas/, 'o servidor pagina por id, não por data');
});

test('Participação do mês fora da janela do aparelho não diz "nenhuma instalação"', () => {
  const t = tela([], {buscarHistorico: () => new Promise(() => {})});
  const html = t.run(`tabelaProdutividadeMes('2026-06')`);
  assert.doesNotMatch(html, /Nenhuma instalação concluída/);
  assert.match(html, /buscando no servidor/);
  // Mês dentro da janela continua como antes.
  assert.match(t.run(`tabelaProdutividadeMes('2026-09')`), /Nenhuma instalação concluída/);
});

test('Conferência do dia: confirmação de outro dia conta como "a confirmar" e a instalação de ontem aparece à parte', () => {
  const lista = [
    {id:'sexta', numero:'1', tipo:'externo', instalacao:{data:hoje}, confirmacao:'Confirmado', confEm:'2026-09-05T10:00:00'},
    {id:'hoje', numero:'2', tipo:'externo', instalacao:{data:hoje}, confirmacao:'Confirmado', confEm:hoje + 'T08:00:00'},
    {id:'ontem', numero:'3', tipo:'externo', instalacao:{data:'2026-09-08'}},
    // Saiu e voltou ontem, falta finalizar: não é "agenda passou, sem nova data".
    {id:'voltou', numero:'4', tipo:'externo', instalacao:{data:'2026-09-08'}, horaSaida:'08:00', horaRetorno:'12:00'},
  ];
  const t = tela(lista);
  t.run(`STATE._progDia='${hoje}'; renderConferenciaDia()`);
  const html = t.node('#prog-conferencia').innerHTML;
  assert.match(html, /data-dia-grupo="cliente"[^]*?<strong>1<\/strong>/, 'a confirmação de sexta não libera o carro de hoje');
  assert.match(html, /data-dia-grupo="vencidas"[^>]*><span>[^<]*<\/span><strong>1<\/strong>/, 'a que não saiu ontem não pode sumir do dia; a que já voltou não entra');
});

test('Importar PDF de O.S que o ERP já trouxe abre a ficha existente, sem criar a segunda', async () => {
  const lista = [{id:'mub-5501', numero:'5501', cliente:'Padaria Sol'}];
  const t = tela(lista);
  t.run(`lerPDF = async () => ({texto:'', itensPos:[]}); parsePDF = () => ({id:'novo', numero:' 5501 ', itens:[], instalacao:{}}); importarPDF()`);
  const inp = t.criados.find(e => e.tag === 'input');
  inp.files = [{}];
  await inp.onchange();
  assert.equal(t.abertos.length, 1);
  assert.equal(t.abertos[0].id, 'mub-5501', 'abre a que existe, não uma segunda ficha');
});

test('Importar itens do PDF: "Cancelar" desiste de verdade', async () => {
  const t = tela([]);
  t.run(`lerPDF = async () => ({texto:''}); parseItensPDF = () => [{descricao:'novo'}]; saveDraft = () => { throw new Error('não era para gravar'); };
    __draft = {itens:[{item:'1', descricao:'antigo'}]}; importarItensPDF(__draft)`);
  t.respostas.push(false, false);   // não substitui, não adiciona
  const inp = t.criados.find(e => e.tag === 'input');
  inp.files = [{}];
  await inp.onchange();
  assert.equal(t.run(`__draft.itens.length`), 1);
});

test('Restaurar backup com alterações sem enviar é barrado antes de abrir o arquivo', () => {
  const t = tela([], {getQueue: () => [{action:'saveOS'}, {action:'putPhoto'}]});
  t.run(`importarBackup()`);
  assert.equal(t.criados.length, 0, 'nem abre o seletor de arquivo');
  assert.match(t.toasts[0][0], /1 alteração/);
});
