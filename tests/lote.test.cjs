/* FECHAR O DIA: O LOTE DA GESTÃO (F14, 30/09/2026).
   Bancada: o aparelho da gestão com o store de verdade (store.js, a fila, os
   eventos, o IndexedDB de mentira que sobrevive a "fechar a aba"), a tela
   (operacao, divisao, regras, entrega-item, performance, o componente
   ALOCUI, casa.js, lote.js e, do app.js, a pergunta do retrabalho),
   falando com o pcp-sync de verdade (helpers/edge.cjs). Cada teste parte do
   caso ruim: linha sem data, volta sem equipe, retrabalho Sim no meio, O.S.
   mudada em outro aparelho (409), recusa do servidor, desfazer depois de
   sincronizar, sem internet, rascunho depois de fechar, chegada gravada por
   quem não pode, atalho dentro de campo, entrega parcial, declaração do
   celular e "Não" numa O.S. marcada como retrabalho.
   Tudo fictício: o repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {edge} = require('./helpers/edge.cjs');
const O = require('../operacao.js');
const E = require('../entrega-item.js');
const RAIZ = path.join(__dirname, '..');
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

/* ───────────────────────────── o motor: a conferência do declarado ───── */
const declarada = (id, qtde, dia = '2026-09-29') => ({id, tipo:'entregue', qtde, dia, via:'toque', declarado:true, por:'Ana', porId:'100001', em:dia + 'T15:00:00Z'});
const celular = (extra = {}) => pcpFim('c1', {equipe:['100001', '100002'], veiculo:'Carro 1', finalizadoPor:'Ana',
  finalizadaPorCampo:{finalizadaEm:'2026-09-29T19:10:00.000Z', por:'Ana', porId:'100001', em:'2026-09-29T19:10:05.000Z'},
  itens:[{uid:'c1:1:1', item:'1', descricao:'Placa ACM 2x1', qtde:'10', subtotal:'4000', entregas:[declarada('d-1', 6)]},
    {uid:'c1:2:1', item:'2', descricao:'Adesivo de vitrine', qtde:'1', subtotal:'600'},
    {uid:'c1:3:1', item:'3', descricao:'Servicos de instalação', qtde:'1', subtotal:'400'}], ...extra});

test('motor: a conferência vale na O.S. finalizada, só da gestão, uma vez por declaração, e não apaga a declaração', async () => {
  const M = await import('../supabase/functions/_shared/pcp-entrega-item.mjs');
  for (const X of [E, M.ENTREGA_ITEM]) {
    const os = celular();
    const it = os.itens[0];
    const antes = X.lancamentosDaOS(os);
    assert.ok(antes.declarado > 0 && antes.declaracoes.length, 'a declaração e a finalização do celular estão à parte');
    const pend = X.declaracoesAConferir(os);
    assert.deepEqual(pend.map(d => d.alvo), ['d-1', 'fim:2026-09-29T19:10:00.000Z']);
    // Quem não é gestão não confere; conferir o que não é declaração é recusado.
    for (const papel of ['operacao', 'toque', 'montagem', 'maquina']) assert.equal(X.validarEvento({id:'k-1', tipo:'conferido', alvo:'d-1', dia:HOJE}, it, {papel, os, hoje:HOJE}).ok, false, papel);
    assert.match(X.validarEvento({id:'k-1', tipo:'conferido', alvo:'nao-existe', dia:HOJE}, it, {papel:'pcp', os, hoje:HOJE}).erro, /não existe/);
    assert.match(X.validarEvento({id:'k-1', tipo:'conferido', alvo:'fim:outra', dia:HOJE}, it, {papel:'pcp', os, hoje:HOJE}).erro, /finalização/);
    // A gestão confere a marca e a finalização, com a O.S. finalizada (a marca comum seria recusada).
    assert.match(X.validarEvento({id:'k-0', tipo:'entregue', qtde:1, dia:HOJE}, os.itens[1], {papel:'pcp', os, hoje:HOJE}).erro, /finalizada/);
    const v1 = X.validarEvento({id:'k-1', tipo:'conferido', alvo:'d-1', dia:HOJE, via:'lote'}, it, {papel:'pcp', os, hoje:HOJE});
    assert.equal(v1.ok, true, v1.erro);
    assert.deepEqual({tipo:v1.evento.tipo, alvo:v1.evento.alvo, via:v1.evento.via}, {tipo:'conferido', alvo:'d-1', via:'lote'});
    it.entregas = [...it.entregas, v1.evento];
    // O serviço aceita a conferência da finalização (O.S. só de serviço também é conferida).
    const v2 = X.validarEvento({id:'k-2', tipo:'conferido', alvo:'fim:2026-09-29T19:10:00.000Z', dia:HOJE}, os.itens[2], {papel:'admin', os, hoje:HOJE});
    assert.equal(v2.ok, true, v2.erro);
    os.itens[2].entregas = [v2.evento];
    assert.equal(X.validarEvento({id:'k-3', tipo:'conferido', alvo:'d-1', dia:HOJE}, it, {papel:'pcp', os, hoje:HOJE}).ok, false, 'a mesma declaração não é conferida duas vezes');
    assert.match(X.validarEvento({id:'k-4', tipo:'conferido', alvo:'fim:2026-09-29T19:10:00.000Z', dia:HOJE}, it, {papel:'pcp', os, hoje:HOJE}).erro, /já foi conferida/);
    // A declaração continua gravada como veio; agora conta como entregue conferido.
    assert.deepEqual(it.entregas[0], declarada('d-1', 6));
    const depois = X.lancamentosDaOS(os);
    assert.equal(depois.declarado, 0);
    assert.equal(depois.entregue, antes.entregue + antes.declarado);
    assert.equal(X.declaracoesAConferir(os).length, 0);
    assert.equal(X.entregaImplicita(os).conferido, true);
    assert.equal(X.situacaoItem(it, os).declarado, 0);
    assert.equal(X.resumoOS(os).marcas, 1, 'a conferência não é marca de entrega');
    // Desfazer a conferência (também na O.S. finalizada) devolve a declaração.
    const d = X.validarEvento({id:'k-5', tipo:'desfeito', alvo:'k-1', motivo:'conferi errado', dia:HOJE}, it, {papel:'pcp', os, hoje:HOJE});
    assert.equal(d.ok, true, d.erro);
    it.entregas = [...it.entregas, d.evento];
    assert.equal(X.situacaoItem(it, os).declarado, 6);
    assert.equal(X.validarEvento({id:'k-6', tipo:'desfeito', alvo:'d-1', motivo:'x', dia:HOJE}, it, {papel:'pcp', os, hoje:HOJE}).ok, false, 'a marca de entrega da O.S. finalizada continua travada');
  }
});

test('servidor: o crachá sem senha não confere a própria declaração (a conferência é da gestão)', async () => {
  const e = await edge('pcp-sync', {pcp_registros:[osRow(celular({finalizadaEm:'', finalizadoPor:'', finalizadaPorCampo:undefined}))], registros:structuredClone(FICHAS),
    pcp_config_global:[{id:true, config:structuredClone(CFG), atualizado_em:'2026-09-19T10:00:00Z'}], painel_registros:[], equipe_contas:[]});
  const os = noServidor(e, 'c1');
  os.itens[0].entregas = [...os.itens[0].entregas, {id:'k-t', tipo:'conferido', alvo:'d-1', dia:HOJE, via:'lote'}];
  const r = await e.call({action:'upsert', os}, TOQUE);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.ok(!noServidor(e, 'c1').itens[0].entregas.some(m => m.tipo === 'conferido'), 'a conferência do celular não entra');
  assert.ok(r.descartado && r.descartado.includes('entregas'));
});

test('operacao: agruparPorVolta junta pela volta sem exigir equipe nem retorno', () => {
  const gs = O.agruparPorVolta([erp('a1'), erp('a2', {veiculo:'carro 1 '}), erp('a3', {veiculo:'Carro 2'}), pcpFim('p1')], o => O.dia(o.finalizadaEm));
  assert.deepEqual(gs.map(g => [g.chave, g.os.map(o => o.id)]), [
    ['2026-09-28|carro 1|', ['a1', 'a2']], ['2026-09-28|carro 2|', ['a3']], ['2026-09-29|carro 2|100003+100005', ['p1']]]);
  assert.deepEqual(O.voltasDoCarro([erp('a1')]), [], 'a fila da volta do carro deixa a baixa sem equipe de fora; o lote não');
});

/* ───────────────────────────── a tela do lote ───────────────────────── */
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

test('pendências do mês: as baixas do ERP a lançar e as entregues sem divisão, por volta, com a sugestão da divisão', async () => {
  const b = await montar({os:[...PEND(), erp('x1', {baixaAutoERP:{em:'2026-09-28T18:00:00', status:'CANCELADO'}, finalizadoPor:'Mubisys (auto)'}),
    pcpFim('ok', {alocacao:{grupos:[{equipeId:'eq-leao', cota:10000, liderId:'100005', membros:[{pessoaId:'100005', papel:'lider', cota:6000}, {pessoaId:'100003', papel:'ajudante', cota:4000}]}], manual:false}})]});
  await abrirPendencias(b);
  const gs = await b.json('LOTE.gruposDaTela().map(g => [g.chave, g.os.map(o => o.id)])');
  assert.deepEqual(gs, [[G_ERP, ['a1', 'a2', 'a3']], [G_P1, ['p1']]], 'a cancelada no ERP e a que já tem divisão ficam fora');
  // A volta do p1 já vem com a divisão sugerida (a composição é a equipe Leão).
  const st = await b.json(`ALOCUI.estado(LOTE.chaveAloc({chave:${JSON.stringify(G_P1)}}))`);
  assert.equal(st.origem, 'equipe');
  assert.equal(st.aloc.grupos[0].equipeId, 'eq-leao');
  // A linha vem com a data e com o "todos os itens" da O.S. encerrada; falta só o retrabalho.
  const l = await b.json(`LOTE.linha('a1')`);
  assert.equal(l.data, '2026-09-28');
  assert.equal(l.entrega, 'todos');
  const f = await b.json(`(() => { const g = LOTE.gruposDaTela()[0]; return LOTE.faltasDaLinha(g.os[0], LOTE.linha('a1'), g, LOTE.grupo(g.chave)); })()`);
  assert.deepEqual(f.trava, ['resposta do retrabalho']);
  assert.ok(f.nota.includes('equipe (o Salvar pergunta)') && f.nota.includes('chegada do carro') && f.nota.includes('conferência da volta'), JSON.stringify(f.nota));
  assert.match(await b.acao({acao:'confirmar', os:'a1'}), /Falta: resposta do retrabalho/);
  b.fechar();
});

test('linha sem data: não confirma, e a que ficou sem data no rascunho não vai; as outras vão', async () => {
  const b = await montar({os:PEND()});
  await abrirPendencias(b);
  await equipeAguia(b);
  for (const id of ['a1', 'a2', 'a3']) await naoEConfirma(b, id);
  // Apagar a data tira a confirmação e trava a linha.
  assert.equal(await b.acao({acao:'data', os:'a2', valor:''}), '');
  assert.equal((await b.json(`LOTE.linha('a2')`)).confirmada, false);
  assert.match(await b.acao({acao:'confirmar', os:'a2'}), /Falta: data da entrega/);
  // O rascunho velho com a linha confirmada sem data (outra aba): o Salvar confere de novo.
  b.run(`LOTE.linha('a2').confirmada = true`);
  const rel = await salvar(b);
  assert.equal(estadoDe(rel, 'a2'), 'pulada');
  assert.match(itemDe(rel, 'a2').motivo, /data da entrega/);
  assert.equal(estadoDe(rel, 'a1'), 'gravada');
  assert.equal(estadoDe(rel, 'a3'), 'gravada', 'a linha depois da ruim também foi');
  assert.equal(noServidor(b.e, 'a2').entregaLancada, undefined, 'nada foi gravado na O.S. sem data');
  assert.equal(noServidor(b.e, 'a1').entregaLancada.data, '2026-09-28');
  assert.deepEqual(noServidor(b.e, 'a1').equipe, ['100001', '100002']);
  assert.equal(noServidor(b.e, 'a1').alocacao.grupos[0].equipeId, 'eq-aguia');
  b.fechar();
});

test('volta sem equipe: o Salvar pergunta; "não" não manda nada, "sim" lança sem equipe', async () => {
  let resposta = false;
  const b = await montar({os:PEND(), confirmar:m => /sem equipe/.test(m) ? resposta : true});
  await abrirPendencias(b);
  for (const id of ['a1', 'a2']) await naoEConfirma(b, id);
  const r1 = await salvar(b);
  assert.deepEqual(r1, {cancelado:true});
  assert.ok(b.confirms.some(m => /Uma volta vai sem equipe \(28\/09 Carro 1\)/.test(m)), b.confirms.join(' | '));
  assert.equal(await b.json('STORE.getQueue().length'), 0, 'nada foi para a fila');
  assert.equal(noServidor(b.e, 'a1').entregaLancada, undefined);
  resposta = true;
  const r2 = await salvar(b);
  assert.deepEqual(r2.itens.map(i => [i.id, i.estado]), [['a1', 'gravada'], ['a2', 'gravada']]);
  assert.deepEqual(noServidor(b.e, 'a1').equipe, []);
  assert.equal(noServidor(b.e, 'a1').entregaLancada.data, '2026-09-28');
  assert.equal(noServidor(b.e, 'a1').alocacao, undefined);
  b.fechar();
});

test('retrabalho Sim no meio do lote: a pergunta de sempre, os cinco campos só nessa O.S., as outras com Não', async () => {
  const b = await montar({os:PEND()});
  await abrirPendencias(b);
  await equipeAguia(b);
  await naoEConfirma(b, 'a1');
  // "Sim" abre a pergunta do app.js; o teste toca os botões que a pessoa tocaria.
  b.run(`LOTE.abrirRetrabalho('a2')`);
  const box = b.criados[b.criados.length - 1];
  assert.equal(box.id, 'retrab-pergunta');
  box.querySelector('#retrab-sim').onclick();
  const form = box.querySelector('#retrab-form');
  form.__valores = null;
  b.ctx.FormData = class { constructor() { this.v = {problema:'Placa desalinhada na fachada', etapaOrigem:'Instalação', causaRaiz:'Erro humano', responsavelEtapa:'Instalação externa', dataRetrabalho:'2026-09-29'}; } get(k) { return this.v[k] ?? null; } };
  form.onsubmit({preventDefault() {}});
  await b.run('LOTE.gravando()');
  const l2 = await b.json(`LOTE.linha('a2')`);
  assert.equal(l2.retrabalho.resposta, 'sim');
  assert.equal(l2.retrabalho.problema, 'Placa desalinhada na fachada');
  assert.equal(noServidor(b.e, 'a2').retrabalho, undefined, 'a resposta só vai no Salvar');
  assert.equal(await b.acao({acao:'confirmar', os:'a2'}), '');
  await naoEConfirma(b, 'a3');
  const rel = await salvar(b);
  assert.deepEqual(rel.itens.map(i => i.estado), ['gravada', 'gravada', 'gravada']);
  const s2 = noServidor(b.e, 'a2');
  assert.equal(s2.retrabalho, true);
  assert.deepEqual([s2.problema, s2.etapaOrigem, s2.causaRaiz, s2.responsavelEtapa, s2.dataRetrabalho], ['Placa desalinhada na fachada', 'Instalação', 'Erro humano', 'Instalação externa', '2026-09-29']);
  assert.equal(s2.retrabalhoPerguntado.resposta, 'sim');
  for (const id of ['a1', 'a3']) { assert.equal(noServidor(b.e, id).retrabalhoPerguntado.resposta, 'nao', id); assert.ok(!noServidor(b.e, id).retrabalho, id); }
  b.fechar();
});

test('"Não" numa O.S. marcada como retrabalho pede confirmação; confirmado, desmarca de verdade', async () => {
  let resposta = false;
  const marcada = pcpFim('p1', {retrabalho:true, problema:'Letra solta', etapaOrigem:'Produção', causaRaiz:'Material', responsavelEtapa:'Acabamento', dataRetrabalho:'2026-09-29'});
  const b = await montar({os:[marcada], confirmar:m => /marcada como retrabalho/.test(m) ? resposta : true});
  await abrirPendencias(b);
  assert.match(await b.acao({acao:'retrabalho-nao', os:'p1'}), /continua marcada/);
  assert.ok(b.confirms.some(m => /Responder Não desmarca o retrabalho/.test(m)));
  assert.equal((await b.json(`LOTE.linha('p1')`)).retrabalho, null, 'recusado: nada mudou');
  resposta = true;
  assert.equal(await b.acao({acao:'retrabalho-nao', os:'p1'}), '');
  assert.equal(await b.acao({acao:'confirmar', os:'p1'}), '');
  const rel = await salvar(b);
  assert.equal(estadoDe(rel, 'p1'), 'gravada');
  const s = noServidor(b.e, 'p1');
  assert.equal(s.retrabalho, false);
  assert.equal(s.problema, '');
  assert.equal(s.retrabalhoPerguntado.resposta, 'nao');
  b.fechar();
});

test('O.S. mudada em outro aparelho: o 409 fica só naquela linha, sem travar as outras', async () => {
  const b = await montar({os:PEND()});
  await abrirPendencias(b);
  await equipeAguia(b);
  for (const id of ['a1', 'a2', 'a3']) await naoEConfirma(b, id);
  // Outro PC grava a a2 no servidor; este aparelho ainda não puxou.
  const outra = noServidor(b.e, 'a2');
  outra.veiculo = 'Carro 1'; outra.observacao = 'mudado no outro PC';
  const r = await b.e.call({action:'upsert', os:outra}, OUTRA);
  assert.equal(r.status, 200);
  const rel = await salvar(b);
  assert.deepEqual(rel.itens.map(i => [i.id, i.estado]), [['a1', 'gravada'], ['a2', 'conflito'], ['a3', 'gravada']]);
  assert.match(itemDe(rel, 'a2').motivo, /Outra gravação desta O.S. chegou antes/);
  assert.equal(noServidor(b.e, 'a2').observacao, 'mudado no outro PC', 'o que o outro PC gravou fica');
  assert.equal(noServidor(b.e, 'a2').entregaLancada, undefined);
  assert.equal(noServidor(b.e, 'a3').entregaLancada.data, '2026-09-28');
  b.fechar();
});

test('recusa do servidor numa linha (400) não segura as outras e diz o motivo', async () => {
  // A a2 tem retorno antes da saída: o servidor recusa toda gravação dela.
  const ruim = erp('a2', {saidaEm:'2026-09-28T15:00:00.000Z', retornoEm:'2026-09-28T11:00:00.000Z'});
  const b = await montar({os:[erp('a1'), ruim, erp('a3')]});
  await abrirPendencias(b);
  await equipeAguia(b);
  for (const id of ['a1', 'a2', 'a3']) await naoEConfirma(b, id);
  const rel = await salvar(b);
  assert.deepEqual(rel.itens.map(i => [i.id, i.estado]), [['a1', 'gravada'], ['a2', 'recusada'], ['a3', 'gravada']]);
  assert.match(itemDe(rel, 'a2').motivo, /retorno não pode ser anterior à saída/);
  assert.equal(noServidor(b.e, 'a3').entregaLancada.data, '2026-09-28');
  assert.equal(noServidor(b.e, 'a2').entregaLancada, undefined);
  b.fechar();
});

// O que o lote mexe, sem os carimbos do servidor: para comparar o antes e o depois.
const projecao = o => ({equipe:o.equipe || [], alocacao:o.alocacao ? {grupos:o.alocacao.grupos} : null,
  chegada:o.retornoConferido ? {dia:o.retornoConferido.dia, hora:o.retornoConferido.hora} : null,
  volta:O.PERGUNTAS_VOLTA.map(k => O.respostaVolta((o.retornoConf || {})[k])), obs:String((o.retornoConf || {}).obs || ''),
  retrabalho:!!o.retrabalho, problema:o.problema || '', resposta:(o.retrabalhoPerguntado || {}).resposta || '',
  lancada:o.entregaLancada && !o.entregaLancada.desfazer ? o.entregaLancada.data : null,
  entregue:E.lancamentosDaOS(o).entregue, declarado:E.lancamentosDaOS(o).declarado, situacao:E.resumoOS(o).situacao});

test('desfazer depois de sincronizar devolve o antes de cada O.S. (equipe, divisão, chegada, volta, retrabalho, lançamento e marcas)', async () => {
  const marcada = erp('a3', {retrabalho:true, problema:'Letra solta', etapaOrigem:'Produção', causaRaiz:'Material', responsavelEtapa:'Acabamento', dataRetrabalho:'2026-09-28'});
  const b = await montar({os:[erp('a1'), erp('a2', {retornoConf:{carroLimpo:'nao', carroArrumado:'sim', equipamentosOk:'sim', semAvaria:'sim', obs:'banco sujo', por:'Gestor Teste', em:'2026-09-28T20:00:00.000Z'}}), marcada, celular()]});
  const antes = Object.fromEntries(['a1', 'a2', 'a3', 'c1'].map(id => [id, projecao(noServidor(b.e, id))]));
  await abrirPendencias(b);
  await equipeAguia(b);
  assert.equal(await b.acao({acao:'chegada', grupo:G_ERP, valor:'17:40'}), '');
  for (const [k, v] of [['carroLimpo', 'sim'], ['carroArrumado', 'sim'], ['equipamentosOk', 'nao']]) assert.equal(await b.acao({acao:'volta', grupo:G_ERP, k, v}), '');
  assert.equal(await b.acao({acao:'volta-obs', grupo:G_ERP, valor:'faltou a escada'}), '');
  await naoEConfirma(b, 'a1'); await naoEConfirma(b, 'a2'); await naoEConfirma(b, 'a3');
  // A c1 (finalizada pelo celular): confere o declarado e a finalização.
  const G_C1 = (await b.json('LOTE.gruposDaTela().map(g => g.chave)')).find(k => k.startsWith('2026-09-29|carro 1|'));
  assert.equal(await b.acao({acao:'conferir', os:'c1'}), '');
  await naoEConfirma(b, 'c1');
  const rel = await salvar(b);
  assert.deepEqual(rel.itens.map(i => i.estado), ['gravada', 'gravada', 'gravada', 'gravada'], JSON.stringify(rel.itens.map(i => i.motivo)));
  await b.sincronizar();
  const depois = id => projecao(noServidor(b.e, id));
  assert.equal(depois('a1').chegada.hora, '17:40');
  // O ponto de partida é o que o PCP já tinha respondido na volta (a2: sem avaria 'sim'); a pessoa mexeu em três.
  assert.deepEqual(depois('a1').volta, ['sim', 'sim', 'nao', 'sim']);
  assert.equal(depois('a1').obs, 'faltou a escada');
  assert.equal(depois('a3').retrabalho, false);
  assert.equal(depois('c1').declarado, 0);
  assert.ok(G_C1);
  // Desfazer o lote inteiro.
  const des = await b.json(`LOTE.desfazer(${JSON.stringify(rel.id)}, {prazoMs:3000, passoMs:5})`);
  assert.deepEqual(des.itens.map(i => [i.id, i.desfazer && i.desfazer.estado]), [['a1', 'gravada'], ['a2', 'gravada'], ['a3', 'gravada'], ['c1', 'gravada']], JSON.stringify(des.itens.map(i => i.desfazer)));
  await b.sincronizar();
  for (const id of ['a1', 'a2', 'a3', 'c1']) assert.deepEqual(depois(id), antes[id], id);
  // As marcas do lote ficam no histórico como desfeitas: a lista é só de acréscimo.
  const c1 = noServidor(b.e, 'c1');
  assert.deepEqual(c1.itens[0].entregas[0], {...declarada('d-1', 6)}, 'a declaração original está intacta');
  assert.ok(c1.itens.flatMap(it => it.entregas || []).some(m => m.tipo === 'desfeito'));
  // Um segundo Desfazer não faz nada.
  assert.match((await b.json(`LOTE.desfazer(${JSON.stringify(rel.id)})`)).erro, /Nada a desfazer/);
  b.fechar();
});

test('sem internet: o lote inteiro vai para a fila e sobe quando a rede volta', async () => {
  const b = await montar({os:PEND()});
  await abrirPendencias(b);
  await equipeAguia(b);
  for (const id of ['a1', 'a2', 'a3']) await naoEConfirma(b, id);
  b.nav.onLine = false; b.rede.on = false;
  const rel = await salvar(b);
  assert.deepEqual(rel.itens.map(i => i.estado), ['na-fila', 'na-fila', 'na-fila']);
  assert.match(itemDe(rel, 'a1').motivo, /Sem internet/);
  assert.deepEqual((await b.json('STORE.getQueue().map(q => q.os && q.os.id)')).sort(), ['a1', 'a2', 'a3']);
  assert.equal(noServidor(b.e, 'a1').entregaLancada, undefined);
  b.nav.onLine = true; b.rede.on = true;
  await b.sincronizar();
  for (const id of ['a1', 'a2', 'a3']) {
    assert.equal(noServidor(b.e, id).entregaLancada.data, '2026-09-28', id);
    assert.equal(noServidor(b.e, id).alocacao.grupos[0].equipeId, 'eq-aguia', id);
  }
  // Desfazer continua valendo para o que foi pela fila.
  const des = await b.json(`LOTE.desfazer(${JSON.stringify(rel.id)}, {prazoMs:3000, passoMs:5})`);
  assert.ok(des.itens.every(i => i.desfazer && i.desfazer.estado === 'gravada'), JSON.stringify(des.itens.map(i => i.desfazer)));
  assert.equal(noServidor(b.e, 'a1').entregaLancada, null);
  b.fechar();
});

test('rascunho recuperado depois de fechar a tela e de recarregar a aba (IndexedDB, por modo e dia)', async () => {
  const b = await montar({os:PEND()});
  await abrirPendencias(b);
  await b.run(`ALOCUI.executar(LOTE.chaveAloc({chave:${JSON.stringify(G_ERP)}}), {alocAcao:'equipe', e:'eq-leao'})`);
  assert.equal(await b.acao({acao:'equipe-ok', grupo:G_ERP}), '');
  assert.equal(await b.acao({acao:'chegada', grupo:G_ERP, valor:'16:05'}), '');
  assert.equal(await b.acao({acao:'volta', grupo:G_ERP, k:'carroLimpo', v:'nao'}), '');
  await naoEConfirma(b, 'a1');
  assert.equal(await b.acao({acao:'data', os:'a2', valor:'2026-09-27'}), '');
  // (1) Fechar a tela e voltar, na mesma aba.
  b.run('LOTE.esquecer()');
  await abrirPendencias(b);
  assert.equal((await b.json(`LOTE.linha('a1')`)).confirmada, true);
  // (2) Recarregar a aba: contexto novo, o mesmo localStorage e o mesmo IndexedDB.
  b.fechar();
  const b2 = await aparelho(b.e, {ls:b.guard, bases:b.idb});
  // O modo Dia de outro dia não enxerga o rascunho das pendências.
  await b2.run(`LOTE.abrir({modo:'dia', dia:'2026-09-28'})`);
  assert.equal((await b2.json(`LOTE.linha('a1')`)).confirmada, false);
  await abrirPendencias(b2);
  const l1 = await b2.json(`LOTE.linha('a1')`), l2 = await b2.json(`LOTE.linha('a2')`), g = await b2.json(`LOTE.grupo(${JSON.stringify(G_ERP)})`);
  assert.equal(l1.confirmada, true);
  assert.equal(l1.retrabalho.resposta, 'nao');
  assert.equal(l2.data, '2026-09-27');
  assert.equal(g.chegada, '16:05');
  assert.equal(g.volta.carroLimpo, 'nao');
  assert.equal(g.equipeConfirmada, true);
  // A divisão que a pessoa montou volta com ela (não a sugestão).
  const pronto = await b2.json(`ALOCUI.paraGravar(LOTE.chaveAloc({chave:${JSON.stringify(G_ERP)}}))`);
  assert.equal(pronto.erro, '');
  assert.equal(pronto.alocacao.grupos[0].equipeId, 'eq-leao');
  // E o Salvar da aba reaberta grava o que foi montado antes.
  const rel = await salvar(b2);
  assert.equal(estadoDe(rel, 'a1'), 'gravada');
  assert.deepEqual(noServidor(b2.e, 'a1').equipe.sort(), ['100003', '100005']);
  assert.equal(noServidor(b2.e, 'a1').retornoConferido.hora, '16:05');
  b2.fechar();
});

test('chegada conferida (retornoConferido): só admin e pcp gravam; operação, montagem, crachá e máquina são ignorados; aba antiga não apaga', async () => {
  const e = await edge('pcp-sync', {pcp_registros:[osRow(pcpFim('p1')), osRow(aberta('o1', {equipe:['100001']}))], registros:structuredClone(FICHAS),
    pcp_config_global:[{id:true, config:structuredClone(CFG), atualizado_em:'2026-09-19T10:00:00Z'}], painel_registros:[], equipe_contas:[{sistema:'pcp', usuario:'montagem1'}]});
  const enviar = async (quem, mexer, id = 'p1') => { const os = noServidor(e, id); mexer(os); const r = await e.call({action:'upsert', os}, quem); assert.equal(r.status, 200, JSON.stringify(r)); return r; };
  const nova = {dia:'2026-09-29', hora:'16:40', fonte:'lote', em:'2026-09-29T19:45:00.000Z', por:'Forjado', porId:'999999', recebidoEm:''};
  // Operação e a conta de montagem com senha: o campo novo não entra, e quem tem senha ouve o porquê.
  for (const quem of [OPERA, MONTAGEM]) {
    const r = await enviar(quem, os => { os.retornoConferido = {...nova}; });
    assert.equal(noServidor(e, 'p1').retornoConferido, undefined, quem.papel);
    assert.ok((r.avisos || []).some(a => /só a gestão do PCP/.test(a)), quem.papel + ': ' + JSON.stringify(r.avisos));
  }
  // O crachá sem senha (o celular do instalador) também não: a mescla parte do gravado.
  await enviar(TOQUE, os => { os.retornoConferido = {...nova}; }, 'o1');
  assert.equal(noServidor(e, 'o1').retornoConferido, undefined);
  // A máquina (importação do ERP) idem.
  const m = noServidor(e, 'p1'); m.retornoConferido = {...nova}; delete m.rev;
  await e.call({action:'upsert', os:m}, 'machine');
  assert.equal(noServidor(e, 'p1').retornoConferido, undefined);
  // A gestão grava: o carimbo é do servidor (quem, ID, login, recebido); o que o aparelho forjou não entra.
  await enviar(GESTOR, os => { os.retornoConferido = {...nova}; });
  const g1 = noServidor(e, 'p1').retornoConferido;
  assert.deepEqual({dia:g1.dia, hora:g1.hora, fonte:g1.fonte, em:g1.em, por:g1.por, porConta:g1.porConta}, {dia:'2026-09-29', hora:'16:40', fonte:'lote', em:'2026-09-29T19:45:00.000Z', por:'Gestor Teste', porConta:'gestor'});
  assert.equal(g1.porId, '111222');
  assert.ok(g1.recebidoEm && g1.recebidoEm !== '');
  // A mesma hora mantém o carimbo; a aba antiga (sem o campo) não apaga; a cópia de outra versão não troca.
  await enviar(OUTRA, os => { os.retornoConferido = {dia:g1.dia, hora:g1.hora, fonte:'ficha'}; });
  assert.deepEqual(noServidor(e, 'p1').retornoConferido, g1);
  await enviar(GESTOR, os => { delete os.retornoConferido; });
  assert.deepEqual(noServidor(e, 'p1').retornoConferido, g1, 'aba antiga não apaga');
  const velha = await enviar(OUTRA, os => { os.retornoConferido = {...g1, hora:'09:00', recebidoEm:'2026-09-01T00:00:00.000Z'}; });
  assert.deepEqual(noServidor(e, 'p1').retornoConferido, g1, 'a cópia de outra versão não passa por cima');
  assert.ok((velha.avisos || []).some(a => /versão anterior/.test(a)));
  // Hora inválida: fica a gravada, com aviso (nunca 422).
  const inval = await enviar(GESTOR, os => { os.retornoConferido = {dia:'2026-09-29', hora:'25:99', fonte:'lote'}; });
  assert.deepEqual(noServidor(e, 'p1').retornoConferido, g1);
  assert.ok((inval.avisos || []).some(a => /inválidos/.test(a)));
  // A operação recebe a chegada sem o ID e sem o login de quem conferiu.
  const vista = (await enviar(OPERA, () => {})).os;
  assert.equal(vista.retornoConferido.hora, '16:40');
  assert.equal(vista.retornoConferido.porId, undefined);
  assert.equal(vista.retornoConferido.porConta, undefined);
  assert.deepEqual(noServidor(e, 'p1').retornoConferido, g1, 'a volta sem o ID não apaga nada');
  // A gestão limpa de propósito com null.
  await enviar(GESTOR, os => { os.retornoConferido = null; });
  assert.equal(noServidor(e, 'p1').retornoConferido, null);
});

test('atalhos: setas e Enter nunca disparam dentro de campo; na linha, Enter confirma; Ctrl+Enter salva de qualquer lugar', async () => {
  const b = await montar({os:PEND()});
  await abrirPendencias(b);
  await b.acao({acao:'retrabalho-nao', os:'a1'});
  const linha = id => { const el = {tagName:'DIV', getAttribute:k => k === 'data-lote-linha' ? id : null, closest:() => el}; return el; };
  // O campo do lote fica dentro de #lote-raiz (a tecla que nasce fora do lote não é dele: tests/lote-revisao.test.cjs).
  const raiz = {tagName:'DIV', getAttribute:() => null, closest:() => null};
  const campo = tag => ({tagName:tag, getAttribute:() => null, closest:sel => sel === '[data-lote-linha]' ? linha('a1') : sel === '#lote-raiz' ? raiz : null});
  let prevenido = 0;
  const tecla = (key, target, extra = {}) => { b.ctx.__ev = {key, target, preventDefault() { prevenido++; }, ...extra}; return b.run('LOTE.teclado(__ev)'); };
  b.run(`LOTE.estado().foco = 'a1'`);
  // Dentro de campo: nada.
  for (const tag of ['INPUT', 'SELECT', 'TEXTAREA']) {
    assert.equal(tecla('Enter', campo(tag)), '', tag);
    assert.equal(tecla('ArrowDown', campo(tag)), '', tag);
    assert.equal(tecla('ArrowUp', campo(tag)), '', tag);
  }
  assert.equal(tecla('Enter', {tagName:'DIV', isContentEditable:true, getAttribute:() => null, closest:() => null}), '');
  assert.equal(prevenido, 0, 'nenhuma tecla do campo foi engolida');
  assert.equal((await b.json(`LOTE.linha('a1')`)).confirmada, false);
  assert.equal(await b.json('LOTE.estado().foco'), 'a1');
  // No botão, o Enter é do botão.
  assert.equal(tecla('Enter', {tagName:'BUTTON', getAttribute:() => null, closest:() => linha('a1')}), '');
  // Na linha: Enter confirma e desce; a seta anda entre as linhas.
  assert.equal(tecla('Enter', linha('a1')), 'confirmar');
  assert.equal((await b.json(`LOTE.linha('a1')`)).confirmada, true);
  assert.equal(await b.json('LOTE.estado().foco'), 'a2');
  assert.equal(tecla('ArrowDown', linha('a2')), 'foco');
  assert.equal(await b.json('LOTE.estado().foco'), 'a3');
  assert.equal(tecla('ArrowUp', linha('a3')), 'foco');
  assert.equal(await b.json('LOTE.estado().foco'), 'a2');
  // Enter na linha com falta não confirma e diz o que falta.
  assert.equal(tecla('Enter', linha('a2')), 'falta');
  assert.ok(b.toasts.some(([t, m]) => t === 'error' && /retrabalho/.test(m)));
  // Ctrl+Enter salva mesmo de dentro do campo (é combinação, não tecla simples).
  assert.equal(tecla('Enter', campo('INPUT'), {ctrlKey:true}), 'salvar');
  // Com a pergunta do retrabalho aberta, nada dispara.
  b.ctx.document.getElementById = id => id === 'retrab-pergunta' ? {} : null;
  assert.equal(tecla('Enter', linha('a2')), '');
  assert.equal(tecla('Enter', campo('INPUT'), {ctrlKey:true}), '');
  b.fechar();
});

test('linha parcial (E9): a O.S. aberta marca só a parte, via lote; fica aberta, sem lançamento; "todos" marca o saldo', async () => {
  // o1: 10 placas, 1 adesivo e o serviço, agendada hoje (Águia, Carro 3). o2: a mesma volta, entregue inteira.
  const b = await montar({os:[aberta('o1'), aberta('o2'), pcpFim('p9', {instalacao:{data:'2026-09-20'}, finalizadaEm:'2026-09-20T19:00:00.000Z', retornoEm:'2026-09-20T18:00:00.000Z', saidaEm:'2026-09-20T11:00:00.000Z'})]});
  await b.run(`LOTE.abrir({modo:'dia', dia:'${HOJE}'})`);
  const gs = await b.json('LOTE.gruposDaTela().map(g => [g.chave, g.os.map(o => o.id)])');
  assert.deepEqual(gs, [[`${HOJE}|carro 3|100001+100002`, ['o1', 'o2']]], 'no Dia, só as O.S. do dia');
  // A aberta pede a entrega dos itens: todos ou a parte.
  assert.match(await b.acao({acao:'confirmar', os:'o1'}), /entrega dos itens/);
  // A parte: 6 das 10 placas; o adesivo fica.
  assert.equal(await b.acao({acao:'parte', os:'o1', uid:'o1:1:1', valor:'6'}), '');
  assert.equal(await b.acao({acao:'retrabalho-nao', os:'o1'}), '');
  assert.equal(await b.acao({acao:'confirmar', os:'o1'}), '');
  assert.equal(await b.acao({acao:'entrega-todos', os:'o2'}), '');
  await naoEConfirma(b, 'o2');
  // Parte maior que o saldo é recusada com a frase do motor, antes de ir.
  b.run(`LOTE.linha('o1').parte['o1:2:1'] = 5`);
  const ruim = await salvar(b);
  assert.equal(estadoDe(ruim, 'o1'), 'pulada');
  assert.match(itemDe(ruim, 'o1').motivo, /Quantidade maior que o saldo/);
  assert.equal(estadoDe(ruim, 'o2'), 'gravada');
  b.run(`LOTE.linha('o1').parte['o1:2:1'] = 0; LOTE.linha('o1').confirmada = true`);
  const rel = await salvar(b);
  assert.equal(estadoDe(rel, 'o1'), 'gravada', JSON.stringify(itemDe(rel, 'o1')));
  const o1 = noServidor(b.e, 'o1');
  assert.deepEqual(o1.itens[0].entregas.map(m => [m.tipo, m.qtde, m.via, m.dia, m.por]), [['entregue', 6, 'lote', HOJE, 'Gestor Teste']]);
  assert.equal(o1.itens[1].entregas, undefined, 'o adesivo continua a entregar');
  assert.equal(o1.finalizadaEm, undefined, 'o lote não finaliza a O.S. aberta');
  assert.equal(o1.entregaLancada, undefined, 'a entrega da aberta fica pelos itens');
  const r1 = E.resumoOS(o1);
  assert.equal(r1.situacao, 'parcial');
  assert.equal(E.situacaoItem(o1.itens[0], o1).rotulo, 'parcial 6 de 10');
  // "Todos os itens entregues" na o2: o saldo de cada item físico, o serviço acompanha.
  const o2 = noServidor(b.e, 'o2');
  assert.deepEqual(o2.itens.map(it => (it.entregas || []).map(m => [m.tipo, m.qtde, m.via])), [[['entregue', 10, 'lote']], [['entregue', 1, 'lote']], []]);
  assert.equal(E.resumoOS(o2).situacao, 'completa');
  b.fechar();
});

test('declarado pelo celular: a gestão confere num toque; a declaração fica como veio e passa a entregue conferido', async () => {
  const b = await montar({os:[celular()]});
  await abrirPendencias(b);
  const f = await b.json(`(() => { const g = LOTE.gruposDaTela()[0]; return LOTE.faltasDaLinha(g.os[0], LOTE.linha('c1'), g, LOTE.grupo(g.chave)); })()`);
  assert.ok(f.nota.includes('conferir o que a equipe declarou'));
  assert.equal(await b.acao({acao:'conferir', os:'c1'}), '');
  await naoEConfirma(b, 'c1');
  const rel = await salvar(b);
  assert.equal(estadoDe(rel, 'c1'), 'gravada', JSON.stringify(itemDe(rel, 'c1')));
  const c1 = noServidor(b.e, 'c1');
  assert.deepEqual(c1.itens[0].entregas[0], declarada('d-1', 6), 'a declaração original não muda');
  const conf = c1.itens.flatMap(it => (it.entregas || []).filter(m => m.tipo === 'conferido'));
  assert.deepEqual(conf.map(m => [m.alvo, m.via, m.por]).sort(), [['d-1', 'lote', 'Gestor Teste'], ['fim:2026-09-29T19:10:00.000Z', 'lote', 'Gestor Teste']]);
  assert.equal(c1.finalizadaPorCampo.finalizadaEm, '2026-09-29T19:10:00.000Z', 'o carimbo do servidor fica');
  const L = E.lancamentosDaOS(c1);
  assert.equal(L.declarado, 0);
  assert.equal(L.entregue, L.total);
  assert.equal(E.declaracoesAConferir(c1).length, 0);
  // Sem lançamento: finalizada no PCP no mesmo dia (a finalização já diz o dia).
  assert.equal(c1.entregaLancada, undefined);
  b.fechar();
});

test('a conferência da volta só vai quando a pessoa mexeu no que viu; a O.S. relida que mudou em outro aparelho não leva o lote por cima', async () => {
  const conf = {carroLimpo:'sim', carroArrumado:'sim', equipamentosOk:'sim', semAvaria:'sim', obs:'', por:'Outra Gestora', em:'2026-09-28T20:00:00.000Z'};
  const b = await montar({os:[erp('a1', {retornoConf:{...conf}}), erp('a2', {retornoConf:{...conf}})]});
  await abrirPendencias(b);
  await equipeAguia(b);
  await naoEConfirma(b, 'a1'); await naoEConfirma(b, 'a2');
  // O aparelho puxou uma gravação de outro PC na a2 depois de o lote mostrá-la.
  b.run(`(() => { const o = JSON.parse(JSON.stringify(STORE.getOS('a2'))); o.equipe = ['100005']; STORE.aceitarServidor ? STORE.aceitarServidor(o) : null; })()`);
  const rel = await salvar(b);
  assert.equal(estadoDe(rel, 'a1'), 'gravada');
  assert.equal(estadoDe(rel, 'a2'), 'pulada');
  assert.match(itemDe(rel, 'a2').motivo, /mudou em outro aparelho/);
  assert.equal((await b.json(`LOTE.linha('a2')`)).confirmada, false, 'a linha pede nova confirmação');
  // A volta que ninguém mexeu não recarimba: fica o carimbo de quem conferiu.
  assert.deepEqual({por:noServidor(b.e, 'a1').retornoConf.por, em:noServidor(b.e, 'a1').retornoConf.em}, {por:'Outra Gestora', em:'2026-09-28T20:00:00.000Z'});
  b.fechar();
});

test('só a gestão (admin e pcp) usa o lote: a operação não grava nada', async () => {
  const b = await montar({os:PEND(), quem:OPERA});
  await abrirPendencias(b);
  assert.match(await b.acao({acao:'retrabalho-nao', os:'a1'}), /só da gestão|da gestão do PCP/);
  assert.match((await salvar(b)).erro, /gestão do PCP/);
  assert.equal(await b.json('STORE.getQueue().length'), 0);
  b.fechar();
});

test('lote.js entra no index.html (depois do componente) e no SHELL do sw.js, na versão atual; não no celular', () => {
  const index = ler('index.html'), sw = ler('sw.js'), v = /APP_VERSAO\s*=\s*'(v\d+)/.exec(ler('config.js'))[1];
  assert.ok(index.indexOf(`lote.js?v=${v}`) > index.indexOf(`alocacao-ui.js?v=${v}`), 'no index, depois do alocacao-ui.js');
  assert.ok(/const SHELL = \[([\s\S]*?)\];/.exec(sw)[1].includes(`'lote.js?v=${v}'`), 'no SHELL do sw.js');
  assert.ok(!ler('equipe.html').includes('lote.js'), 'o celular não carrega o lote');
  assert.match(ler('relatorios-entregas.js'), /data-ent-aba="lote"/);
  assert.match(ler('casa.js'), /STATE\._entAba === 'lote' && typeof renderLoteEntregas === 'function'/);
});

test('a base do rascunho que não abre a tempo não trava a tela nem grava por cima do rascunho guardado; sair do app apaga o rascunho', async () => {
  const b = await montar({os:PEND()});
  await abrirPendencias(b);
  await b.acao({acao:'retrabalho-nao', os:'a1'});
  assert.ok(b.idb.get('impresilk_lote').lojas.get('rascunhos').size >= 1, 'o rascunho foi para o IndexedDB');
  const guardado = JSON.stringify([...b.idb.get('impresilk_lote').lojas.get('rascunhos').values()]);
  b.fechar();
  // Outra aba segura a base: o open não responde.
  const b2 = await aparelho(b.e, {ls:b.guard, bases:b.idb});
  const abrirOriginal = b2.ctx.indexedDB.open;
  b2.ctx.indexedDB.open = nome => nome === 'impresilk_lote' ? {} : abrirOriginal(nome);
  const t0 = Date.now();
  await abrirPendencias(b2);
  assert.ok(Date.now() - t0 < 6000, 'a tela abre sem esperar para sempre');
  assert.match(await b2.json('LOTE.estado().erroRascunho'), /não abriu a tempo/);
  assert.equal((await b2.json(`LOTE.linha('a1')`)).retrabalho, null, 'o rascunho guardado não foi lido');
  await b2.acao({acao:'retrabalho-nao', os:'a2'});
  assert.equal(JSON.stringify([...b.idb.get('impresilk_lote').lojas.get('rascunhos').values()]), guardado, 'e não foi sobrescrito');
  // Sair do app (limparCache, fila vazia) apaga a base do rascunho junto.
  assert.equal(await b2.json('STORE.limparCache()'), true);
  assert.equal(b.idb.has('impresilk_lote'), false);
  b2.fechar();
});

test('a data sugerida: a baixa do ERP que chegou dias depois sugere o dia da agenda; a finalizada no PCP mantém o dia que já vale (sem lançamento calado)', async () => {
  // Agenda 25/09, ERP baixou 28/09. Finalizada no PCP na manhã seguinte ao retorno.
  const tarde = erp('e1', {instalacao:{data:'2026-09-25', periodo:'Manhã', duracaoDias:1}});
  const manha = pcpFim('p2', {retornoEm:'2026-09-24T21:00:00.000Z', saidaEm:'2026-09-24T12:00:00.000Z', finalizadaEm:'2026-09-25T12:30:00.000Z'});
  const b = await montar({os:[tarde, manha]});
  await abrirPendencias(b);
  assert.equal((await b.json(`LOTE.linha('e1')`)).data, '2026-09-25', 'o dia da agenda, não o da baixa');
  assert.equal((await b.json(`LOTE.linha('p2')`)).data, '2026-09-25', 'o dia da finalização, que já vale');
  const gs = await b.json('LOTE.gruposDaTela().map(g => [g.dia, g.os.map(o => o.id)])');
  assert.deepEqual(gs, [['2026-09-24', ['p2']], ['2026-09-25', ['e1']]], 'a volta do p2 é a do dia em que o carro voltou');
  await equipeAguia(b, (await b.json('LOTE.gruposDaTela()'))[1].chave);
  await naoEConfirma(b, 'e1'); await naoEConfirma(b, 'p2');
  const rel = await salvar(b);
  assert.deepEqual(rel.itens.map(i => i.estado), ['gravada', 'gravada']);
  assert.equal(noServidor(b.e, 'e1').entregaLancada.data, '2026-09-25');
  assert.equal(noServidor(b.e, 'p2').entregaLancada, undefined, 'a finalizada no PCP não ganha lançamento');
  b.fechar();
});
