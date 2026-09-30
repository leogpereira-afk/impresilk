/* REVISÃO DA F12: NOMES ANTIGOS VIRAM ID PELA TELA (30/09/2026).
   A troca do nome pelo ID grava em lote nas O.S. de PRODUÇÃO, e isso decide
   quem pontua e quem recebe comissão. A revisão adversarial achou 8 defeitos;
   cada teste abaixo parte do caso ruim, com o store.js de verdade (a fila, os
   eventos, o pull), o operacao.js e o casa.js da tela, e o pcp-sync de
   VERDADE (tests/helpers/edge.cjs) como servidor. Nada de servidor de
   mentira. Pessoas, CPFs e O.S. FICTÍCIOS: o repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {edge} = require('./helpers/edge.cjs');
const ROOT = path.join(__dirname, '..');

// CPF fictício de 11 dígitos: o ID é o começo.
const cpf = id => id + '00000';
const colab = (chave, id, nome, apelido = '', extra = {}) => ({id:chave, colecao:'colaboradores', apagado:false, atualizado_em:'2026-09-01T00:00:00Z',
  registro:{id:chave, nome, apelido, cpf:id ? cpf(id) : '', statusId:'ativo', ...extra}});
const freela = (chave, id, nome, apelido = '', extra = {}) => ({id:chave, colecao:'freelancers', apagado:false, atualizado_em:'2026-09-01T00:00:00Z',
  registro:{id:chave, nome, apelido, cpf:id ? cpf(id) : '', funcao:'Instalador', situacao:'ativo', contratoFim:'2027-12-31', ...extra}});
const RH = [
  colab('bruno-alves', '100001', 'Bruno Alves Costa', 'bruno'),
  colab('bruno-martins', '100002', 'Bruno Martins Dias'),
  colab('lucas-gabriel', '100010', 'Lucas Gabriel Souza'),
  colab('lucas-natalino', '100011', 'Lucas Natalino Reis'),
  colab('jose-adilando', '100020', 'José Adilando Rocha', 'adilsom'),
];
const BETO = [colab('roberto-alves', '100101', 'Roberto Alves Lima', 'beto'), colab('alberto-dias', '100102', 'Alberto Dias Melo', ''),
  colab('jose-adilando', '100020', 'José Adilando Rocha', 'adilsom')];
const OS = (id, equipe, fim, extra = {}) => ({id, numero:'N' + id, tipo:'externo', cliente:'Cliente Fictício ' + id, equipe, finalizadaEm:fim, atualizadoEm:'2026-09-11T10:00:00Z', ...extra});
const osRow = o => ({id:o.id, colecao:'os', apagado:false, atualizado_em:'2026-09-19T10:00:00Z', registro:{rev:1, ...o}});
const fechamento = (de, ate, revisao = 1) => ({id:`${de}:${ate}:${String(revisao).padStart(6, '0')}`, colecao:'performance_fechamentos', apagado:false, atualizado_em:'2026-09-02T10:00:00Z',
  registro:{id:`${de}:${ate}:${String(revisao).padStart(6, '0')}`, de, ate, revisao, fechadoEm:'2026-09-02T10:00:00Z', fechadoPor:'Gestor Fictício', registros:[], hash:'x'}});
const noServidor = (e, id) => structuredClone((e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === id) || {}).registro || null);
const linhaOS = (e, id) => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === id);
const diario = e => e.db.pcp_registros.filter(r => r.colecao === 'auditoria').map(r => r.registro);
const esperar = ms => new Promise(r => setTimeout(r, ms));
async function ate(cond, ms = 5000) {
  const t0 = Date.now();
  while (!cond()) { if (Date.now() - t0 > ms) throw new Error('não aconteceu a tempo'); await esperar(10); }
}

/* O APARELHO: store.js, operacao.js e casa.js reais num contexto próprio,
   com o fetch ligado ao pcp-sync real. `ls` e `idb` divididos = duas abas do
   mesmo navegador. `rede.travar(pedido)` deixa o pedido sem resposta;
   `rede.antes`/`rede.depois` mexem no servidor em volta de um pedido (outro
   aparelho gravando no meio). `fechar()` é a aba fechada: nada mais roda. */
async function aparelho(e, {os = [], cfg = {instaladores:[], vinculosRH:[]}, papel = 'pcp', nome = 'Gestor Fictício', ls = null, idb = null} = {}) {
  const who = {papel, nome, sub:nome.toLowerCase().replace(/\s+/g, '.')};
  const lista = os.map(o => ({rev:1, ...structuredClone(o)}));
  const guard = ls || new Map([['impresilk_inst_os', JSON.stringify(lista)], ['impresilk_inst_fila', '[]'],
    ['impresilk_inst_cfg', JSON.stringify(cfg)], ['impresilk_inst_user', JSON.stringify({nome, papel})]]);
  const chamadas = [], toasts = [], confirms = [];
  const rede = {on:true, travar:null, antes:null, depois:null};
  const estado = {fechada:false};
  const idbStores = idb || {fotos:new Map(), os:new Map()};
  const db = {transaction() { const tx = {objectStore:n => ({
    get(k) { const req = {}; queueMicrotask(() => req.onsuccess?.({target:{result:idbStores[n].has(k) ? structuredClone(idbStores[n].get(k)) : null}})); return req; },
    put(v, k) { queueMicrotask(() => { idbStores[n].set(k !== undefined ? k : v.id, structuredClone(v)); tx.oncomplete?.(); }); },
    delete(k) { queueMicrotask(() => { idbStores[n].delete(k); tx.oncomplete?.(); }); }})}; return tx; }};
  const timers = new Set();
  const st = (f, ms, ...a) => { if (estado.fechada) return 0; const t = setTimeout(() => { timers.delete(t); if (!estado.fechada) f(...a); }, ms); timers.add(t); return t; };
  const ct = t => { timers.delete(t); clearTimeout(t); };
  const ctx = vm.createContext({
    console:{log() {}, warn() {}, error() {}}, navigator:{onLine:true}, window:{addEventListener() {}},
    localStorage:{getItem:k => (guard.has(k) ? guard.get(k) : null), setItem:(k, v) => { if (!estado.fechada) guard.set(k, String(v)); }, removeItem:k => { if (!estado.fechada) guard.delete(k); }},
    indexedDB:{open() { const req = {}; queueMicrotask(() => req.onsuccess({target:{result:db}})); return req; }, deleteDatabase() {}},
    setTimeout:st, clearTimeout:ct, AbortController, structuredClone, API_BASE:'http://teste',
    fetch:async (_url, req) => {
      if (estado.fechada) return new Promise(() => {});
      const b = JSON.parse(req.body);
      chamadas.push(b);
      if (!rede.on) throw new TypeError('Failed to fetch');
      if (rede.travar && rede.travar(b)) return new Promise(() => {});
      if (rede.antes) await rede.antes(b);
      const r = await e.call(b, who);
      if (rede.depois) await rede.depois(b, r);
      const {status, ...corpo} = r;
      return {ok:status < 400, status, json:async () => corpo};
    },
    STATE:{user:{nome, papel}, activeTab:'entregas'},
    document:{getElementById:() => null, querySelectorAll:() => [], body:{classList:{add() {}, remove() {}, contains:() => false}}},
    esc:s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    toast:(m, t) => toasts.push([t, m]), confirm:m => { confirms.push(String(m)); return true; }, CSS:{escape:s => s}, pessoaDoElenco:() => null,
  });
  for (const f of ['store.js', 'operacao.js', 'casa.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx);
  await vm.runInContext('STORE.pronto()', ctx);
  await vm.runInContext('STORE.pullElenco(true)', ctx);
  // O que vem do contexto do vm é de outro "realm": vira JSON antes de comparar.
  const copia = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  return {ctx, who, guard, idb:idbStores, chamadas, rede, toasts, confirms,
    fechar() { estado.fechada = true; for (const t of timers) clearTimeout(t); timers.clear(); },
    run:code => vm.runInContext(code, ctx),
    json:async code => copia(await vm.runInContext(code, ctx))};
}
async function montar({rh = RH, os = [], local = null, cfg = {instaladores:[], vinculosRH:[]}, papel = 'pcp', contas = [], registros = []} = {}) {
  const e = await edge('pcp-sync', {
    pcp_registros:[...os.map(osRow), ...registros], registros:rh,
    pcp_config_global:[{id:true, config:structuredClone(cfg), atualizado_em:'2026-09-19T10:00:00Z'}],
    painel_registros:[], equipe_contas:contas,
  });
  return {e, ...(await aparelho(e, {os:local || os, cfg, papel}))};
}
const relGuardado = b => JSON.parse(b.guard.get('impresilk_inst_conv_nomes') || 'null');
const OS_ID = eq => Array.isArray(eq) && eq.length > 0 && eq.every(x => /^\d{6}$/.test(x));

/* ------------------------------------------------ 1. ALTA: O.S. excluída */
test('revisão: a O.S. antiga excluída no servidor não volta pelo lote (conferida uma a uma; a lápide tira do histórico da aba)', async () => {
  // O caso ruim: a antiga 'dup' veio do servidor para esta aba e, depois, outra pessoa a excluiu.
  const todas = [OS('dup', ['Bruno'], '2026-06-10T18:00:00-03:00'), OS('ok', ['Adilsom'], '2026-06-11T18:00:00-03:00'), OS('r1', ['Lucas Natalino Reis'], '2026-09-20T18:00:00-03:00')];
  const b = await montar({os:todas, local:[todas[2]]});
  await b.run('buscarAntigasConferenciaCasa()');
  assert.deepEqual((await b.json('planoConversaoNomes().tarefas.map(t => t.id)')).sort(), ['dup', 'ok', 'r1']);
  const del = await b.e.call({action:'delete', id:'dup'}, {papel:'pcp', nome:'Outra Gestora', sub:'outra.gestora'});
  assert.equal(del.status, 200);
  assert.equal(linhaOS(b.e, 'dup').apagado, true);
  // (a) A lápide ainda não chegou a este aparelho: o lote pergunta ao servidor antes de gravar a antiga.
  await b.run('iniciarConversaoNomesCasa(null)');
  assert.equal(linhaOS(b.e, 'dup').apagado, true, 'a O.S. excluída continua excluída');
  assert.deepEqual(linhaOS(b.e, 'dup').registro.equipe, ['Bruno']);
  assert.ok(!diario(b.e).some(d => d.osId === 'dup' && d.acao === 'restaurar'), 'nada de "restaurar" no diário');
  const dup = relGuardado(b).itens.find(i => i.id === 'dup');
  assert.equal(dup.estado, 'pulada'); assert.match(dup.motivo, /Excluída no servidor/);
  assert.deepEqual(noServidor(b.e, 'ok').equipe, ['100020'], 'a outra antiga, viva, foi trocada');
  assert.deepEqual(noServidor(b.e, 'r1').equipe, ['100011']);
  // (b) A lápide chega pelo pull incremental: a O.S. sai também do histórico desta aba.
  b.guard.set('impresilk_inst_cursor_v2', JSON.stringify({em:new Date(Date.now() - 60000).toISOString(), modo:'completo'}));
  b.guard.set('impresilk_inst_conferencia_completa', String(Date.now()));
  const pull = await b.json('STORE.pull()');
  assert.equal(pull.incremental, true);
  assert.equal(await b.json('STORE.getOS("dup")'), null, 'getOS não devolve a excluída');
  assert.ok(!(await b.json('STORE.historico().map(o => o.id)')).includes('dup'));
  assert.ok(!(await b.json('planoConversaoNomes().tarefas.map(t => t.id)')).includes('dup'), 'nem entra no plano');
});

/* --------------------------------------- 2. ALTA: a régua é a do servidor */
test('revisão: a régua do lote é a do servidor: configuração e RH puxados de novo antes do plano', async () => {
  // Caso ruim 1: outro PC ligou "Beto" ao Alberto há 2 min e este aparelho ainda não puxou a configuração.
  const b = await montar({os:[OS('a', ['Beto'], '2026-09-10T18:00:00-03:00')], rh:BETO});
  const outro = await aparelho(b.e, {nome:'Outra Gestora'});
  assert.equal(outro.run('ligarApelidoRH("Beto", "alberto-dias")'), true);
  await esperar(50); await outro.run('STORE.trySync()');
  assert.ok(b.e.db.pcp_config_global[0].config.vinculosRH.some(v => v.apelido === 'Beto' && v.id === '100102'));
  assert.equal(await b.json('OPERACAO.idPessoa("Beto")'), '100101', 'o retrato velho deste aparelho');
  const desde = b.chamadas.length;
  await b.run('iniciarConversaoNomesCasa(null)');
  assert.deepEqual(noServidor(b.e, 'a').equipe, ['100102'], 'o ID que o servidor lê, não o do retrato velho');
  const pedidos = b.chamadas.slice(desde);
  assert.ok(pedidos.some(p => p.action === 'getCfg'), 'puxou a configuração antes');
  assert.ok(pedidos.some(p => p.action === 'elenco' && p.forcar === true), 'e o RH, sem a cópia de 60 s do servidor');
  assert.ok(pedidos.findIndex(p => p.action === 'conferirNomes') < pedidos.findIndex(p => p.action === 'upsert'), 'conferiu no servidor antes de gravar');

  // Caso ruim 2: o RH corrigiu o apelido ("beto" é do Alberto); o elenco guardado aqui é de antes.
  const c = await montar({os:[OS('a', ['Beto'], '2026-09-10T18:00:00-03:00')], rh:BETO});
  const reg = c.e.db.registros;
  reg.find(r => r.id === 'roberto-alves').registro.apelido = '';
  reg.find(r => r.id === 'alberto-dias').registro.apelido = 'beto';
  assert.equal(await c.json('OPERACAO.confirmarNome("Beto").id'), '100101', 'o elenco guardado neste aparelho');
  await c.run('iniciarConversaoNomesCasa(null)');
  assert.deepEqual(noServidor(c.e, 'a').equipe, ['100102']);
  const perf = await c.e.call({action:'performancePeriodo', de:'2026-09-01', ate:'2026-09-30'}, c.who);
  assert.deepEqual(perf.registros.map(r => r.membros.map(m => m.chave)), [['100102']], 'a Performance credita quem o servidor lê');
});

test('revisão: nome que o servidor lê diferente do aparelho fica como nome, com o motivo, e vai para as pendências', async () => {
  const b = await montar({os:[OS('a', ['Beto'], '2026-09-10T18:00:00-03:00'), OS('b', ['Beto', 'Adilsom'], '2026-09-11T18:00:00-03:00')], rh:BETO});
  // O caso ruim: o RH corrige o apelido logo depois de este aparelho puxar a lista (corrida).
  let feito = false;
  b.rede.depois = async q => {
    if (q.action !== 'elenco' || feito) return;
    feito = true;
    b.e.db.registros.find(r => r.id === 'roberto-alves').registro.apelido = '';
    b.e.db.registros.find(r => r.id === 'alberto-dias').registro.apelido = 'beto';
  };
  await b.run('iniciarConversaoNomesCasa(null)');
  assert.deepEqual(noServidor(b.e, 'a').equipe, ['Beto'], 'o servidor lê o Alberto e o aparelho o Roberto: não grava nenhum dos dois');
  assert.deepEqual(noServidor(b.e, 'b').equipe, ['Beto', '100020'], 'o outro nome da O.S., que bate, vira ID');
  assert.ok(feito, 'a corrida aconteceu depois de o aparelho puxar o RH');
  assert.equal(await b.json('OPERACAO.idPessoa("Beto")'), '100101', 'o aparelho ainda lê o Roberto');
  assert.match(b.confirms.at(-1), /Beto fica como nome: o servidor resolve diferente; atualize e confira/);
  const rel = relGuardado(b);
  assert.ok(!rel.itens.some(i => i.id === 'a'), 'a O.S. só com o nome que não bate fica fora do lote');
  const bb = rel.itens.find(i => i.id === 'b');
  assert.equal(bb.estado, 'convertida'); assert.match(bb.nota, /Ficou como nome: "Beto" \(o servidor resolve diferente; atualize e confira\)/);
  const html = b.run('ligacaoRHHTML()');
  const pend = html.slice(html.indexOf('Pendências: ficam como nome'));
  assert.match(pend, /Beto<\/strong> · 2 O\.S\. · o servidor resolve diferente; atualize e confira/);
  // Chamada direta (sem o preparo da tela): a conferência é feita ali mesmo, e a O.S. é pulada com o motivo.
  const direto = await b.json('converterNomesNasOSCasa(planoConversaoNomes(), {prazoMs:3000, passoMs:20})');
  assert.deepEqual(direto.map(i => i.id + ':' + i.estado), ['a:pulada', 'b:pulada']);
  for (const i of direto) assert.match(i.motivo, /"Beto": o servidor resolve diferente; atualize e confira\. Nada mudou nesta O\.S\./);
  assert.deepEqual(noServidor(b.e, 'a').equipe, ['Beto']);
});

/* ------------------------- 3. MÉDIA: aparelho e servidor com dados diferentes */
test('revisão: contrato encerrado sem CPF desce ao aparelho da gestão e conta na mesma ambiguidade do servidor', async () => {
  // O caso ruim: "Lucas" com a ficha do Lucas Ferreira e o contrato ENCERRADO do Lucas Prado, sem CPF.
  const rh = [colab('lucas-ferreira', '100050', 'Lucas Ferreira Nunes', 'lucas'),
    freela('fl-lucas-prado', '', 'Lucas Prado Ficticio', 'lucas', {situacao:'encerrado', contratoFim:'2026-07-31'})];
  const b = await montar({os:[OS('a', ['Lucas'], '2026-06-10T18:00:00-03:00')], rh});
  const perf = await b.e.call({action:'performancePeriodo', de:'2026-06-01', ate:'2026-06-30'}, b.who);
  assert.ok(!perf.registros[0].membros.some(m => m.chave === '100050'), 'o servidor não lê "Lucas" como o Lucas Ferreira');
  const antigos = await b.json('STORE.elenco().antigos');
  const prado = antigos.find(p => p.nome === 'Lucas Prado Ficticio');
  assert.ok(prado, 'o contrato encerrado sem CPF está no elenco da gestão');
  assert.deepEqual(prado, {id:'', nome:'Lucas Prado Ficticio', apelido:'lucas', ativo:false, desligado:true, freelancer:true}, 'só nome e apelido, desligado');
  assert.deepEqual(await b.json('OPERACAO.confirmarNome("Lucas")'), {id:'', motivo:'ambiguo'});
  await b.run('iniciarConversaoNomesCasa(null)');
  assert.deepEqual(noServidor(b.e, 'a').equipe, ['Lucas'], 'fica nome dos dois lados');
  assert.match(b.toasts.at(-1)[1], /Nenhuma O\.S\. com nome confirmado/);
  // Quem não é da gestão continua sem a lista de quem saiu.
  for (const quem of [{papel:'operacao', nome:'Operação', sub:'operacao'}, {papel:'montagem', nome:'Montagem', sub:'montagem'}]) {
    const r = await b.e.call({action:'elenco', freelancers:true}, quem);
    assert.equal(r.status, 200); assert.deepEqual(r.antigos, [], quem.papel);
  }
});

/* ------------------------- 4. MÉDIA: vínculo "salvo" que o servidor não aceitou */
test('revisão: com a ligação na fila ou em conflito, a segunda tentativa não converte', async () => {
  const b = await montar({os:[OS('a', ['Bruno Alves Costa'], '2026-09-10T18:00:00-03:00')], cfg:{instaladores:['Bruno'], vinculosRH:[]}});
  // O caso ruim: outro aparelho decide outro nome enquanto este grava o vínculo do "Bruno" da lista.
  let uma = false;
  b.rede.antes = async q => {
    if (q.action !== 'setCfg' || uma) return;
    uma = true;
    const g = b.e.db.pcp_config_global[0];
    g.config = {...g.config, vinculosRH:[{apelido:'Zeca', semFicha:true}]}; g.atualizado_em = new Date().toISOString();
  };
  const t0 = Date.now();
  await b.run('iniciarConversaoNomesCasa(null)');
  assert.ok(uma);
  assert.deepEqual(noServidor(b.e, 'a').equipe, ['Bruno Alves Costa'], '1º clique: nada');
  const t1 = Date.now() - t0;
  assert.ok((await b.json('STORE.getQueue()')).some(q => q.action === 'setCfg'), 'a configuração ficou na fila, em conflito');
  assert.equal(await b.json('OPERACAO.pessoaFixada("Bruno")'), true, 'neste aparelho o vínculo parece salvo');
  // 2º clique: o vínculo "salvo" aqui não existe no servidor.
  await b.run('iniciarConversaoNomesCasa(null)');
  assert.deepEqual(noServidor(b.e, 'a').equipe, ['Bruno Alves Costa'], '2º clique: nada');
  assert.match(b.toasts.at(-1)[1], /a ligação ainda não foi aceita pelo servidor/);
  assert.ok(!b.e.db.pcp_config_global[0].config.vinculosRH.some(v => String(v.apelido).toLowerCase() === 'bruno'));
  assert.ok(!b.chamadas.some(c => c.action === 'upsert'), 'nenhuma O.S. foi enviada');
  assert.ok(t1 < 8000, 'o conflito é dito na hora, sem esperar o prazo de 12 s');
});

test('revisão: o vínculo da lista vale pelo que o servidor aceitou, não pelo "saiu da fila"', async () => {
  const b = await montar({os:[OS('a', ['Bruno Alves Costa'], '2026-09-10T18:00:00-03:00')], cfg:{instaladores:['Bruno'], vinculosRH:[]}});
  // O caso ruim: a configuração com o vínculo do "Bruno" é aceita e, logo depois, outro aparelho liga o "Bruno" a outra ficha.
  let uma = false;
  b.rede.depois = async q => {
    if (q.action !== 'setCfg' || uma) return;
    uma = true;
    const g = b.e.db.pcp_config_global[0];
    g.config = {...g.config, vinculosRH:[{apelido:'Bruno', id:'100002', chave:'bruno-martins', nome:'Bruno Martins Dias'}]}; g.atualizado_em = new Date().toISOString();
  };
  await b.run('iniciarConversaoNomesCasa(null)');
  assert.ok(uma, 'a configuração foi aceita pelo servidor');
  assert.deepEqual(noServidor(b.e, 'a').equipe, ['Bruno Alves Costa'], 'nenhuma O.S. trocada: o "Bruno" da lista não leva ao mesmo ID no servidor');
  assert.match(b.toasts.at(-1)[1], /a ligação de Bruno ainda não foi aceita pelo servidor/);
  assert.ok(!b.chamadas.some(c => c.action === 'upsert'));
  // Sem ninguém no meio, o mesmo caminho troca, e a configuração vai antes das O.S.
  const c = await montar({os:[OS('a', ['Bruno Alves Costa'], '2026-09-10T18:00:00-03:00')], cfg:{instaladores:['Bruno'], vinculosRH:[]}});
  await c.run('iniciarConversaoNomesCasa(null)');
  assert.deepEqual(noServidor(c.e, 'a').equipe, ['100001']);
  assert.ok(c.e.db.pcp_config_global[0].config.vinculosRH.some(v => v.apelido === 'Bruno' && v.id === '100001'));
  const ordem = c.chamadas.map(x => x.action);
  assert.ok(ordem.indexOf('setCfg') < ordem.lastIndexOf('conferirNomes') && ordem.lastIndexOf('conferirNomes') < ordem.indexOf('upsert'), ordem.join(','));
});

/* ---------------------------------- 5. MÉDIA: relatório e Desfazer entre abas */
test('revisão: duas abas do mesmo navegador não apagam o relatório uma da outra; o Desfazer alcança todas', async () => {
  const base = [OS('a', ['Bruno'], '2026-09-10T18:00:00-03:00'), OS('b', ['Adilsom'], '2026-09-11T18:00:00-03:00'), OS('c', ['Lucas Gabriel Souza'], '2026-09-12T18:00:00-03:00')];
  // O caso ruim: aba 1 e aba 2 dividem o localStorage e gravam o relatório uma depois da outra.
  const T1 = await montar({os:base});
  const T2 = await aparelho(T1.e, {os:base, ls:T1.guard, idb:T1.idb});
  await T2.run('iniciarConversaoNomesCasa(["Lucas Gabriel Souza"])');
  await T1.run('iniciarConversaoNomesCasa(["Bruno"])');
  await T2.run('iniciarConversaoNomesCasa(["Adilsom"])');
  for (const id of ['a', 'b', 'c']) assert.ok(OS_ID(noServidor(T1.e, id).equipe), id);
  assert.deepEqual(relGuardado(T1).itens.map(i => i.id).sort(), ['a', 'b', 'c'], 'os três lotes, das duas abas');
  // Fecha as duas e abre de novo: a aba nova puxa do servidor e desfaz as três.
  T1.fechar(); T2.fechar();
  const T3 = await aparelho(T1.e, {os:base, ls:T1.guard, idb:T1.idb});
  await T3.run('STORE.pull(null, {completo:true})');
  assert.match(T3.run('ligacaoRHHTML()'), /Desfazer: devolver a lista anterior de 3 O\.S\./);
  await T3.run('desfazerConversaoNomesCasa(lerRelConvNomes(), {prazoMs:3000, passoMs:20})');
  assert.deepEqual(['a', 'b', 'c'].map(id => noServidor(T1.e, id).equipe), [['Bruno'], ['Adilsom'], ['Lucas Gabriel Souza']]);
});
test('revisão: com o localStorage cheio, a tela avisa que o Desfazer some ao fechar esta aba', async () => {
  const U = await montar({os:[OS('x', ['Bruno'], '2026-09-10T18:00:00-03:00')]});
  // O caso ruim: o relatório não cabe no localStorage (os sistemas da casa dividem 5 MB).
  const setOrig = U.ctx.localStorage.setItem;
  U.ctx.localStorage.setItem = (k, v) => { if (k === 'impresilk_inst_conv_nomes') throw new Error('QuotaExceededError'); return setOrig(k, v); };
  await U.run('iniciarConversaoNomesCasa(null)');
  assert.deepEqual(noServidor(U.e, 'x').equipe, ['100001']);
  assert.equal(U.guard.get('impresilk_inst_conv_nomes'), undefined);
  const h = U.run('ligacaoRHHTML()');
  const rel = h.slice(h.indexOf('lig-rel'));
  assert.match(rel, /o Desfazer some ao fechar esta aba/, 'a tela diz');
  assert.match(rel, /data-lig-desfazer/, 'e o Desfazer continua nesta aba');
  assert.match(U.toasts.at(-1)[1], /o Desfazer some ao fechar esta aba/, 'o aviso do fim do lote também');
});

/* -------------------------------------- 6. BAIXA: aba fechada no meio do lote */
test('revisão: aba fechada no meio do lote: a O.S. em envio já está no relatório como "enviando" e o Desfazer a alcança', async () => {
  const base = [OS('m', ['Bruno'], '2026-09-10T18:00:00-03:00'), OS('n', ['Adilsom'], '2026-09-11T18:00:00-03:00')];
  const V = await montar({os:base});
  // O caso ruim: a segunda gravação fica sem resposta e a aba fecha aí.
  let k = 0;
  V.rede.travar = q => q.action === 'upsert' && ++k >= 2;
  V.run('iniciarConversaoNomesCasa(null)');
  await ate(() => JSON.parse(V.guard.get('impresilk_inst_fila') || '[]').some(q => q.os && q.os.id === 'n'));
  V.fechar();
  const n = (relGuardado(V) || {itens:[]}).itens.find(i => i.id === 'n');
  assert.ok(n, 'a O.S. que foi para a fila está no relatório');
  assert.equal(n.estado, 'enviando');
  assert.deepEqual(n.antes, ['Adilsom']); assert.deepEqual(n.depois, ['100020']);
  // Reabre: a fila manda a 'n'; o Desfazer alcança as duas.
  const V2 = await aparelho(V.e, {os:base, ls:V.guard, idb:V.idb});
  await V2.run('STORE.trySync()');
  assert.deepEqual(noServidor(V.e, 'n').equipe, ['100020'], 'a troca chegou pela fila');
  await V2.run('STORE.pull(null, {completo:true})');
  const html = V2.run('ligacaoRHHTML()');
  assert.match(html, /Desfazer: devolver a lista anterior de 2 O\.S\./);
  assert.match(html, /Interrompida/);
  await V2.run('desfazerConversaoNomesCasa(lerRelConvNomes(), {prazoMs:3000, passoMs:20})');
  assert.deepEqual(noServidor(V.e, 'm').equipe, ['Bruno']);
  assert.deepEqual(noServidor(V.e, 'n').equipe, ['Adilsom']);
});

/* ------------------------------------------- 7. BAIXA: período fechado */
test('revisão: O.S. de período fechado na Performance fica como está (na troca e no Desfazer)', async () => {
  // O caso ruim: agosto está fechado (selado) e a O.S. de 10/08 ainda tem o nome antigo.
  const b = await montar({os:[OS('a', ['Bruno', 'Terceiro'], '2026-08-10T18:00:00-03:00'),
    OS('c', ['Lucas Gabriel Souza'], '2026-09-01T18:00:00-03:00', {entregaLancada:{data:'2026-08-30', por:'Gestor Fictício', em:'2026-09-01T18:00:00Z'}}),
    OS('b', ['Adilsom'], '2026-09-10T18:00:00-03:00')], registros:[fechamento('2026-08-01', '2026-08-31'), fechamento('2026-08-01', '2026-08-31', 2)]});
  await b.run('iniciarConversaoNomesCasa(null)');
  assert.deepEqual(noServidor(b.e, 'a').equipe, ['Bruno', 'Terceiro'], 'período fechado: fica');
  assert.deepEqual(noServidor(b.e, 'c').equipe, ['Lucas Gabriel Souza'], 'o dia da Performance é o do lançamento da entrega');
  assert.deepEqual(noServidor(b.e, 'b').equipe, ['100020'], 'setembro, aberto, troca');
  const rel = relGuardado(b);
  for (const id of ['a', 'c']) {
    const it = rel.itens.find(i => i.id === id);
    assert.equal(it.estado, 'pulada', id); assert.match(it.motivo, /Período já fechado na Performance \(01\/08\/2026 a 31\/08\/2026\)/);
  }
  // Setembro fecha depois da troca: o Desfazer também não mexe.
  b.e.db.pcp_registros.push(fechamento('2026-09-01', '2026-09-30'));
  await b.run('desfazerConversaoNomesCasa(lerRelConvNomes(), {prazoMs:3000, passoMs:20})');
  assert.deepEqual(noServidor(b.e, 'b').equipe, ['100020']);
  assert.match(relGuardado(b).itens.find(i => i.id === 'b').desfazer.motivo, /Período já fechado na Performance \(01\/09\/2026 a 30\/09\/2026\)/);
});

/* ------------------------------------ 8. BAIXA: o papel só no botão */
test('revisão: operação e montagem chamando as funções do lote direto (console) não gravam nada', async () => {
  for (const papel of ['operacao', 'montagem']) {
    // Montagem COM senha (conta em equipe_contas): para o servidor, grava a O.S. inteira.
    const b = await montar({os:[OS('a', ['Bruno', 'Adilsom'], '2026-09-10T18:00:00-03:00')], papel, contas:[{usuario:'gestor.fictício', sistema:'pcp'}]});
    const conv = await b.json('converterNomesNasOSCasa(planoConversaoNomes(), {usuario:"x", prazoMs:3000, passoMs:20})');
    assert.deepEqual(conv.map(i => i.estado), ['recusada'], papel); assert.match(conv[0].motivo, /Só a gestão \(admin e pcp\)/);
    const um = await b.json('gravarEquipesUmaAUmaCasa([{id:"a", numero:"Na"}], () => ({equipe:["100001", "100020"]}), {prazoMs:3000, passoMs:20})');
    assert.deepEqual(um.map(i => i.estado), ['recusada'], papel);
    await b.json('desfazerConversaoNomesCasa({itens:[{id:"a", numero:"Na", estado:"convertida", antes:["Bruno"], depois:["Bruno", "Adilsom"]}]}, {prazoMs:3000, passoMs:20})');
    assert.deepEqual(noServidor(b.e, 'a').equipe, ['Bruno', 'Adilsom'], papel);
    assert.ok(!b.chamadas.some(c => c.action === 'upsert'), 'nada foi enviado: ' + papel);
  }
});

/* --------------------------- a ação nova do servidor: conferirNomes */
const gestor = {papel:'pcp', nome:'Gestor Fictício', sub:'gestor.ficticio'};
test('revisão: conferirNomes é só leitura e só da gestão: operação, montagem e toque recebem 403', async () => {
  const e = await edge('pcp-sync', {pcp_registros:[osRow(OS('a', ['Beto'], '2026-09-10T18:00:00-03:00'))], registros:BETO,
    pcp_config_global:[{id:true, config:{instaladores:['Beto'], vinculosRH:[]}, atualizado_em:'2026-09-19T10:00:00Z'}],
    equipe_contas:[{usuario:'montador.senha', sistema:'pcp'}]});
  const antes = JSON.stringify(e.db);
  const pedido = {action:'conferirNomes', nomes:['Beto'], ids:['a']};
  for (const [quem, rotulo] of [[{papel:'operacao', nome:'Operação', sub:'operacao'}, 'operação'],
    [{papel:'montagem', nome:'Montador Com Senha', sub:'montador.senha'}, 'montagem com senha'],
    [{papel:'montagem', nome:'Beto', sub:'Beto', montagemIndividual:true}, 'toque (entrou pelo nome)'],
    [{papel:'comercial', nome:'Comercial', sub:'comercial'}, 'comercial'], ['machine', 'máquina (backup do Hub)']]) {
    const r = await e.call(pedido, quem);
    assert.equal(r.status, 403, rotulo);
    assert.equal(r.nomes, undefined, rotulo);
  }
  for (const papel of ['admin', 'pcp']) {
    const r = await e.call(pedido, {papel, nome:'Gestão Fictícia', sub:'gestao.' + papel});
    assert.equal(r.status, 200, papel + ': ' + r.error);
    assert.deepEqual(r.nomes, [{nome:'Beto', id:'100101', fixado:false}]);
  }
  assert.equal(JSON.stringify(e.db), antes, 'só leitura: o banco não mudou');
  const muitos = await e.call({action:'conferirNomes', nomes:Array.from({length:501}, (_, i) => 'Nome ' + i), ids:[]}, gestor);
  assert.equal(muitos.status, 422);
});

test('revisão: conferirNomes resolve com o vinculosRH gravado e o RH de agora (sem a cópia de 60 s), e diz O.S. e períodos fechados', async () => {
  const e = await edge('pcp-sync', {
    pcp_registros:[osRow(OS('a', ['Beto', 'Zé'], '2026-09-10T18:00:00-03:00')), {...osRow(OS('x', ['Beto'], '2026-09-01T18:00:00-03:00')), apagado:true},
      fechamento('2026-08-01', '2026-08-31'), fechamento('2026-08-01', '2026-08-31', 2), fechamento('2026-07-01', '2026-07-31')],
    registros:structuredClone(BETO),
    pcp_config_global:[{id:true, config:{instaladores:['Beto'], vinculosRH:[]}, atualizado_em:'2026-09-19T10:00:00Z'}]});
  const pedido = {action:'conferirNomes', nomes:['Beto', 'Zé', 'Terceiro', '100020'], ids:['a', 'x', 'nao-existe']};
  const r1 = await e.call(pedido, gestor);
  assert.equal(r1.status, 200, r1.error);
  assert.deepEqual(r1.nomes, [{nome:'Beto', id:'100101', fixado:false}, {nome:'Zé', id:'', fixado:false}, {nome:'Terceiro', id:'', fixado:false}, {nome:'100020', id:'100020', fixado:false}]);
  assert.deepEqual(r1.os, {a:'viva', x:'excluida', 'nao-existe':'ausente'});
  assert.deepEqual(r1.fechados, [{de:'2026-07-01', ate:'2026-07-31'}, {de:'2026-08-01', ate:'2026-08-31'}], 'um período por revisão, não repetido');
  // O caso ruim: logo depois (dentro do minuto da cópia das fichas) o RH corrige o apelido e outro aparelho grava um vínculo.
  e.db.registros.find(r => r.id === 'roberto-alves').registro.apelido = '';
  e.db.registros.find(r => r.id === 'alberto-dias').registro.apelido = 'beto';
  e.db.pcp_config_global[0].config = {instaladores:['Beto'], vinculosRH:[{apelido:'Zé', id:'100020', chave:'jose-adilando', nome:'José Adilando Rocha'}]};
  const r2 = await e.call(pedido, gestor);
  assert.deepEqual(r2.nomes.slice(0, 2), [{nome:'Beto', id:'100102', fixado:false}, {nome:'Zé', id:'100020', fixado:true}]);
  // A mesma régua da Performance (pessoasDoPCP, _shared/pcp-integridade.mjs).
  const perf = await e.call({action:'performancePeriodo', de:'2026-09-01', ate:'2026-09-30'}, gestor);
  assert.deepEqual(perf.registros.find(r => r.id === 'a').membros.map(m => m.chave), ['100102', '100020']);
});
