/* A BANCADA DO FECHAR O DIA (F14), para a revisão (tests/lote-revisao.test.cjs):
   o aparelho da gestão com o store de verdade (store.js, a fila, os eventos,
   o IndexedDB de mentira que sobrevive a "fechar a aba") e a tela (operacao,
   divisao, regras, entrega-item, performance, o componente ALOCUI, casa.js,
   lote.js e, do app.js, a pergunta do retrabalho), falando com o pcp-sync de
   verdade (helpers/edge.cjs). A mesma bancada de tests/lote.test.cjs.
   Tudo fictício: o repositório é público. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {edge} = require('./edge.cjs');
const RAIZ = path.join(__dirname, '..', '..');
const O = require(path.join(RAIZ, 'operacao.js'));
const E = require(path.join(RAIZ, 'entrega-item.js'));
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const js = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const esperar = ms => new Promise(r => setTimeout(r, ms));
const HOJE = '2026-09-30';

// Fichas FICTÍCIAS do RH (o ID é o começo do CPF).
const ficha = (id, nome, apelido, cpf) => ({colecao:'colaboradores', id, apagado:false, atualizado_em:'2026-09-01T00:00:00Z', registro:{id, nome, apelido, cpf, statusId:'ativo'}});
const FICHAS = [
  ficha('ana-f', 'Ana Fictícia', 'ana', '10000111111'),
  ficha('bia-f', 'Bia Fictícia', 'bia', '10000222222'),
  ficha('caio-f', 'Caio Fictício', 'caio', '10000333333'),
  ficha('eva-f', 'Eva Fictícia', 'eva', '10000555555'),
  ficha('gestor-f', 'Gestor Teste', 'gestor', '11122233344'),
];
const EQUIPES = [
  {id:'eq-aguia', nome:'Águia', animal:'aguia', cor:'marinho', liderPadraoId:'100001', membros:[{chave:'100001', nome:'Ana'}, {chave:'100002', nome:'Bia'}], ativo:true},
  {id:'eq-leao', nome:'Leão', animal:'leao', cor:'laranja', liderPadraoId:'100005', membros:[{chave:'100005', nome:'Eva'}, {chave:'100003', nome:'Caio'}], ativo:true},
];
const CFG = {instaladores:['Ana'], vinculosRH:[], performancePCP:{equipes:EQUIPES, participacoes:[]}};
const GESTOR = {papel:'pcp', nome:'Gestor Teste', sub:'gestor'};
const OUTRA = {papel:'admin', nome:'Outra Gestora', sub:'outra'};
const OPERA = {papel:'operacao', nome:'Operação Teste', sub:'operacao1'};
const MONTAGEM = {papel:'montagem', nome:'Conta Montagem', sub:'montagem1'};
const TOQUE = {nome:'Ana', sub:'Ana', id:'100001', papel:'montagem', montagemIndividual:true};

const ITENS = id => [
  {uid:id + ':1:1', item:'1', descricao:'Placa ACM 2x1', qtde:'10', subtotal:'4000'},
  {uid:id + ':2:1', item:'2', descricao:'Adesivo de vitrine', qtde:'1', subtotal:'600'},
  {uid:id + ':3:1', item:'3', descricao:'Servicos de instalação', qtde:'1', subtotal:'400'},
];
// Baixa do ERP a lançar (a fila de Entregas): sem equipe, no Carro 1, em 28/09.
const erp = (id, extra = {}) => ({id, numero:'8' + id, tipo:'externo', cliente:'Cliente Fictício ' + id, servico:'Fachada', liberadoPCP:true, equipe:[],
  instalacao:{data:'2026-09-28', periodo:'Manhã', duracaoDias:1}, veiculo:'Carro 1', valorTotal:5000,
  finalizadaEm:'2026-09-28T18:00:00', finalizadoPor:'Mubisys (auto)', baixaAutoERP:{em:'2026-09-28T18:00:00', status:'ENTREGUE'}, itens:ITENS(id), ...extra});
// Instalação finalizada no PCP, com a equipe Leão pelo ID e sem divisão.
const pcpFim = (id, extra = {}) => ({id, numero:'7' + id, tipo:'externo', cliente:'Cliente Fictício ' + id, servico:'Letreiro', liberadoPCP:true, equipe:['100005', '100003'],
  instalacao:{data:'2026-09-29', periodo:'Manhã', duracaoDias:1}, veiculo:'Carro 2', valorTotal:3000, saidaEm:'2026-09-29T11:00:00.000Z', retornoEm:'2026-09-29T19:00:00.000Z',
  finalizadaEm:'2026-09-29T19:10:00.000Z', finalizadoPor:'Gestor Teste', itens:ITENS(id), ...extra});
// Aberta, agendada para hoje, com a equipe Águia.
const aberta = (id, extra = {}) => ({id, numero:'6' + id, tipo:'externo', cliente:'Cliente Fictício ' + id, servico:'Placas', liberadoPCP:true, equipe:['100001', '100002'],
  instalacao:{data:HOJE, periodo:'Manhã', duracaoDias:1}, veiculo:'Carro 3', valorTotal:4200, confirmacao:'Confirmado', itens:ITENS(id), ...extra});
const osRow = o => ({id:o.id, colecao:'os', apagado:false, atualizado_em:'2026-09-19T10:00:00Z', registro:{rev:1, atualizadoEm:'2026-09-19T10:00:00.000Z', ...o}});
const noServidor = (e, id) => js((e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === id) || {}).registro || null);

/* O IndexedDB de mentira: bases por nome, lojas por nome. Sobrevive a
   "fechar a aba" quando o teste passa o mesmo `bases` ao aparelho novo. */
function indexedDBFalso(bases) {
  return {
    open(nome) {
      const req = {};
      queueMicrotask(() => {
        let base = bases.get(nome);
        const nova = !base;
        if (!base) { base = {lojas:new Map()}; bases.set(nome, base); }
        const loja = n => { if (!base.lojas.has(n)) base.lojas.set(n, new Map()); return base.lojas.get(n); };
        const db = {
          objectStoreNames:{contains:n => base.lojas.has(n)},
          createObjectStore(n) { loja(n); },
          close() {},
          transaction() {
            const tx = {objectStore:n => ({
              get(k) { const q = {}; queueMicrotask(() => { const m = loja(n); q.result = m.has(k) ? structuredClone(m.get(k)) : undefined; q.onsuccess && q.onsuccess({target:q}); }); return q; },
              put(v, k) { queueMicrotask(() => { loja(n).set(k !== undefined ? k : v.id, structuredClone(v)); tx.oncomplete && tx.oncomplete(); }); },
              delete(k) { queueMicrotask(() => { loja(n).delete(k); tx.oncomplete && tx.oncomplete(); }); },
            })};
            return tx;
          },
        };
        if (nova && req.onupgradeneeded) req.onupgradeneeded({target:{result:db}});
        req.onsuccess && req.onsuccess({target:{result:db}});
      });
      return req;
    },
    deleteDatabase(nome) { bases.delete(nome); return {}; },
  };
}

/* O elemento falso da tela: cada querySelector devolve um filho que nasce na
   primeira procura e fica o mesmo (o F13 faz igual); a pergunta do
   retrabalho é tocada pelos botões dela. */
function elemento() {
  const filhos = new Map();
  const el = {innerHTML:'', style:{}, hidden:false, removido:false, dataset:{}, __valores:null,
    querySelector:sel => { if (!filhos.has(sel)) filhos.set(sel, elemento()); return filhos.get(sel); },
    querySelectorAll:() => [], remove() { el.removido = true; }, focus() {}};
  return el;
}

/* O APARELHO DA GESTÃO: store.js e a tela num contexto próprio, com o fetch
   ligado ao pcp-sync real. `ls` e `bases` passados de novo = a mesma aba
   reaberta (o localStorage e o IndexedDB ficam). `rede.on=false` derruba a
   rede; `fechar()` para tudo. */
async function aparelho(e, {os = [], cfg = CFG, quem = GESTOR, ls = null, bases = null, confirmar = () => true} = {}) {
  const lista = os.map(o => ({rev:1, atualizadoEm:'2026-09-19T10:00:00.000Z', ...structuredClone(o)}));
  const guard = ls || new Map([['impresilk_inst_os', JSON.stringify(lista)], ['impresilk_inst_fila', '[]'],
    ['impresilk_inst_cfg', JSON.stringify(cfg)], ['impresilk_inst_user', JSON.stringify({nome:quem.nome, papel:quem.papel, usuario:quem.sub})]]);
  const idb = bases || new Map();
  const toasts = [], confirms = [], criados = [];
  const rede = {on:true};
  const estado = {fechada:false};
  const timers = new Set();
  const st = (f, ms, ...a) => { if (estado.fechada) return 0; const t = setTimeout(() => { timers.delete(t); if (!estado.fechada) f(...a); }, ms); timers.add(t); return t; };
  const ct = t => { timers.delete(t); clearTimeout(t); };
  const nav = {onLine:true};
  const ctx = vm.createContext({
    console:{log() {}, warn() {}, error() {}}, navigator:nav, window:{addEventListener() {}}, location:{reload() {}},
    localStorage:{getItem:k => (guard.has(k) ? guard.get(k) : null), setItem:(k, v) => { if (!estado.fechada) guard.set(k, String(v)); }, removeItem:k => { if (!estado.fechada) guard.delete(k); }},
    indexedDB:indexedDBFalso(idb), setTimeout:st, clearTimeout:ct, setInterval:() => 0, clearInterval() {}, AbortController, structuredClone, crypto:globalThis.crypto, API_BASE:'http://teste',
    fetch:async (_url, req) => {
      if (estado.fechada) return new Promise(() => {});
      if (!rede.on) throw new TypeError('Failed to fetch');
      const r = await e.call(JSON.parse(req.body), quem);
      const {status, ...corpo} = r;
      return {ok:!(status >= 400), status:status || 200, json:async () => corpo};
    },
    STATE:{user:{nome:quem.nome, papel:quem.papel, usuario:quem.sub}, activeTab:'entregas', _entAba:'lote'},
    document:{getElementById:() => null, querySelector:() => null, querySelectorAll:() => [], addEventListener() {}, activeElement:null,
      createElement:() => { const x = elemento(); criados.push(x); return x; }, body:{appendChild() {}, classList:{add() {}, remove() {}, contains:() => false}}},
    esc:s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    toast:(m, t) => toasts.push([t, m]), toastDesfazer() {}, confirm:m => { confirms.push(String(m)); return confirmar(m); },
    hojeISO:() => HOJE, nowISO:() => new Date().toISOString(), emptyState:() => '', bindCardClicks() {}, fmtInstalacao:() => '', registrarRemarcacao() {},
    CSS:{escape:s => s}, pessoaDoElenco:() => null,
  });
  for (const f of ['store.js', 'operacao.js', 'divisao.js', 'regras.js', 'entrega-item.js', 'performance.js', 'alocacao-ui.js', 'casa.js', 'lote.js']) vm.runInContext(ler(f), ctx, {filename:f});
  const app = ler('app.js');
  const trecho = (de, ate) => { const i = app.indexOf(de), j = app.indexOf(ate, i); assert.ok(i >= 0 && j > i, 'trecho do app.js: ' + de); return app.slice(i, j); };
  vm.runInContext(trecho('const $  = ', 'const $$ = '), ctx, {filename:'app.js ($)'});
  vm.runInContext(trecho('const VOLTA_ROTULO', '// Rótulo curto dos selos'), ctx, {filename:'app.js (volta)'});
  vm.runInContext(trecho('const ETAPAS_ORIGEM', 'function validarFinalizacao'), ctx, {filename:'app.js (retrabalho)'});
  await vm.runInContext('STORE.pronto()', ctx);
  await vm.runInContext('STORE.pullElenco(true)', ctx);
  const run = c => vm.runInContext(c, ctx);
  return {e, ctx, guard, idb, rede, nav, toasts, confirms, criados, run,
    json:async c => js(await vm.runInContext(c, ctx)),
    fechar() { estado.fechada = true; for (const t of timers) clearTimeout(t); timers.clear(); },
    // Uma ação da tela, esperando o rascunho ir para o IndexedDB.
    async acao(ds) { const erro = run(`LOTE.executar(${JSON.stringify(ds)})`); await run('LOTE.gravando()'); return erro; },
    async sincronizar() { for (let i = 0; i < 30 && vm.runInContext('STORE.getQueue().length', ctx); i++) { await vm.runInContext('STORE.trySync()', ctx); await esperar(5); } }};
}
async function montar({os = [], local = null, cfg = CFG, quem = GESTOR, confirmar} = {}) {
  const e = await edge('pcp-sync', {pcp_registros:os.map(osRow), registros:structuredClone(FICHAS),
    pcp_config_global:[{id:true, config:structuredClone(cfg), atualizado_em:'2026-09-19T10:00:00Z'}], painel_registros:[], equipe_contas:[]});
  return aparelho(e, {os:local || os, cfg, quem, confirmar});
}
const salvar = b => b.json('LOTE.salvar({prazoMs:3000, passoMs:5})');
const estadoDe = (rel, id) => (rel.itens.find(i => i.id === id) || {}).estado;
const itemDe = (rel, id) => rel.itens.find(i => i.id === id) || {};

const declarada = (id, qtde, dia = '2026-09-29') => ({id, tipo:'entregue', qtde, dia, via:'toque', declarado:true, por:'Ana', porId:'100001', em:dia + 'T15:00:00Z'});
const celular = (extra = {}) => pcpFim('c1', {equipe:['100001', '100002'], veiculo:'Carro 1', finalizadoPor:'Ana',
  finalizadaPorCampo:{finalizadaEm:'2026-09-29T19:10:00.000Z', por:'Ana', porId:'100001', em:'2026-09-29T19:10:05.000Z'},
  itens:[{uid:'c1:1:1', item:'1', descricao:'Placa ACM 2x1', qtde:'10', subtotal:'4000', entregas:[declarada('d-1', 6)]},
    {uid:'c1:2:1', item:'2', descricao:'Adesivo de vitrine', qtde:'1', subtotal:'600'},
    {uid:'c1:3:1', item:'3', descricao:'Servicos de instalação', qtde:'1', subtotal:'400'}], ...extra});

// As baixas do ERP a1, a2 e a3 (a mesma volta, sem equipe) e a p1 (Leão, sem divisão).
const PEND = () => [erp('a1'), erp('a2'), erp('a3'), pcpFim('p1')];
const G_ERP = '2026-09-28|carro 1|', G_P1 = '2026-09-29|carro 2|100003+100005';
async function abrirPendencias(b) { await b.run(`LOTE.abrir({modo:'pendencias', mes:'2026-09'})`); }
// Confirma a linha respondendo o retrabalho "Não" (o caso comum).
async function naoEConfirma(b, id) {
  assert.equal(await b.acao({acao:'retrabalho-nao', os:id}), '');
  assert.equal(await b.acao({acao:'confirmar', os:id}), '');
}
// A volta do ERP ganha a equipe Águia num toque (o componente) e a conferência.
async function equipeAguia(b, grupo = G_ERP) {
  assert.equal(b.run(`ALOCUI.executar(LOTE.chaveAloc({chave:${JSON.stringify(grupo)}}), {alocAcao:'equipe', e:'eq-aguia'})`), '');
  assert.equal(await b.acao({acao:'equipe-ok', grupo}), '');
}


// O que o lote mexe, sem os carimbos do servidor: para comparar o antes e o depois.
const projecao = o => ({equipe:o.equipe || [], alocacao:o.alocacao ? {grupos:o.alocacao.grupos} : null,
  chegada:o.retornoConferido ? {dia:o.retornoConferido.dia, hora:o.retornoConferido.hora} : null,
  volta:O.PERGUNTAS_VOLTA.map(k => O.respostaVolta((o.retornoConf || {})[k])), obs:String((o.retornoConf || {}).obs || ''),
  retrabalho:!!o.retrabalho, problema:o.problema || '', resposta:(o.retrabalhoPerguntado || {}).resposta || '',
  lancada:o.entregaLancada && !o.entregaLancada.desfazer ? o.entregaLancada.data : null,
  entregue:E.lancamentosDaOS(o).entregue, declarado:E.lancamentosDaOS(o).declarado, situacao:E.resumoOS(o).situacao});

module.exports = {assert, edge, O, E, RAIZ, ler, js, esperar, HOJE, FICHAS, EQUIPES, CFG, GESTOR, OUTRA, OPERA, MONTAGEM, TOQUE, ITENS, erp, pcpFim, aberta,
  osRow, noServidor, indexedDBFalso, elemento, aparelho, montar, salvar, estadoDe, itemDe, declarada, celular, PEND, G_ERP, G_P1, abrirPendencias, naoEConfirma,
  equipeAguia, projecao};
