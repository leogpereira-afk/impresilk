/* ABONOS (F17, 30/09/2026). O abono {id, ocorrenciaId, motivo, autor} vale para
   o atraso (a remarcação pedida pelo cliente, decisão do dono) e para o
   retorno antecipado; retrabalho não se abona. Motivo de 15 letras ou mais,
   contadas como na F16 (sem os caracteres invisíveis). Só aponta ocorrência
   que existe na O.S. (o retorno antecipado é medido pela volta: o servidor lê
   as O.S. da volta). Só admin e pcp; o autor e a hora são do crachá e do
   servidor. Revogar é novo carimbo (revogadoEm, revogadoPor), nunca apagar.
   A lista é protegida como os campos da gestão (F01): a aba antiga não
   encolhe, o aparelho não forja, e nada é 422. O status mostra "Com atraso
   (abonado)" e "Retorno antecipado (abonado)", com o motivo, e o abonado não
   é perda. Na tela: Abonar na ficha, no card e no Fechar o dia. Com o store
   real e o pcp-sync real. Cada teste começa pelo caso ruim. Dados fictícios:
   o repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {edge} = require('./helpers/edge.cjs');
const B = require('./helpers/lote-bancada.cjs');
const O = require('../operacao.js');
const R = require('../regras.js');

const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const plano = v => JSON.parse(JSON.stringify(v));
const REGRA = {...R.REGRA_EMBUTIDA};
const DIA = '2026-10-05';
const MOTIVO = 'Cliente pediu para remarcar a instalação';

// Entregue dois dias depois do prazo combinado (atraso), na volta do Carro 1.
const atrasada = (id = '1', extra = {}) => ({id, numero:'8' + id, tipo:'externo', cliente:'Cliente Fictício ' + id, veiculo:'Carro 1', equipe:['100001', '100002'],
  instalacao:{data:DIA, periodo:'Manhã', duracaoDias:1}, prazoCombinado:{data:'2026-10-03', fonte:'agenda'}, finalizadaEm:DIA + 'T20:00:00.000Z', finalizadoPor:'Gestor Teste', ...extra});
const noPrazo = (id = '1', extra = {}) => atrasada(id, {prazoCombinado:{data:DIA, fonte:'agenda'}, ...extra});
const chegada = hora => ({retornoConferido:{dia:DIA, hora, fonte:'lote', por:'Gestor Teste', em:DIA + 'T21:00:00.000Z', recebidoEm:DIA + 'T21:00:05.000Z'}});
const banco = regs => ({pcp_registros:regs.map(B.osRow), registros:plano(B.FICHAS), equipe_contas:[{sistema:'pcp', usuario:'montagem1'}],
  pcp_config_global:[{id:true, config:{instaladores:['Ana']}, atualizado_em:'2026-09-19T10:00:00Z'}]});
const gravada = (e, id = '1') => B.noServidor(e, id);
const diario = e => e.db.pcp_registros.filter(r => r.colecao === 'auditoria').map(r => r.registro);
let _n = 0;
const pedido = (ocorrenciaId, extra = {}) => ({id:'ab-teste' + String(++_n).padStart(4, '0') + 'x', ocorrenciaId, motivo:MOTIVO, pedido:true, ...extra});
const com = (e, id, ...abonos) => ({...gravada(e, id), abonos:[...(gravada(e, id).abonos || []), ...abonos]});

/* ───────────── o motivo ───────────── */
test('abono sem motivo (ou com menos de 15 letras, contadas sem os invisíveis) não grava; aviso, nunca 422', async () => {
  const e = await edge('pcp-sync', banco([atrasada()]));
  // Caso ruim: vinte espaços de largura zero "têm" 20 caracteres e não dizem motivo nenhum.
  for (const motivo of [undefined, '', '               ', '\u200b'.repeat(20), 'remarcou ontem', 'Remarcou\u200b\u200b\u200b\u200b\u200b\u200b hoje']) {
    const r = await e.call({action:'upsert', os:com(e, '1', pedido('1:atraso', {motivo}))}, B.GESTOR);
    assert.equal(r.status, 200, JSON.stringify(r));
    assert.ok(!('abonos' in gravada(e)), JSON.stringify(motivo));
    assert.match(String(r.avisos), /O abono não foi gravado: escreva o motivo do abono com 15 letras ou mais/, JSON.stringify(motivo));
  }
  // A mesma régua no aparelho: o pedido nem vai.
  const o = gravada(e);
  assert.equal(O.pedirAbono(o, '1:atraso', 'remarcou ontem', {regra:REGRA}), 'Escreva o motivo do abono com 15 letras ou mais.');
  assert.equal(O.pedirAbono(o, '1:atraso', '\u200b'.repeat(30), {regra:REGRA}), 'Escreva o motivo do abono com 15 letras ou mais.');
  assert.ok(!('abonos' in o));
  // Com motivo, grava; o motivo fica sem os invisíveis.
  const r = await e.call({action:'upsert', os:com(e, '1', pedido('1:atraso', {motivo:'  Cliente\u200b pediu para remarcar a instalação  '}))}, B.GESTOR);
  assert.equal(r.status, 200);assert.equal(gravada(e).abonos.length, 1);assert.equal(gravada(e).abonos[0].motivo, MOTIVO);
});

/* ───────────── a ocorrência que existe ───────────── */
test('abono de ocorrência inexistente é descartado: no prazo, de outra O.S., de tipo que não existe; retrabalho não se abona', async () => {
  const e = await edge('pcp-sync', banco([noPrazo('1', {retrabalho:true, problema:'Adesivo descolou'}), atrasada('2')]));
  // Caso ruim: abonar um atraso que não existe (a O.S. foi entregue no prazo) apagaria nada, e ficaria um abono solto.
  for (const oc of ['1:atraso', '2:atraso', '1:retorno_antecipado', '1:qualquer', '']) {
    const r = await e.call({action:'upsert', os:com(e, '1', pedido(oc))}, B.GESTOR);
    assert.equal(r.status, 200);assert.ok(!('abonos' in gravada(e)), oc);
    assert.match(String(r.avisos), /a ocorrência que ele aponta não existe nesta O\.S\./, oc);
  }
  const r = await e.call({action:'upsert', os:com(e, '1', pedido('1:retrabalho'))}, B.GESTOR);
  assert.equal(r.status, 200);assert.ok(!('abonos' in gravada(e)));assert.match(String(r.avisos), /retrabalho não se abona/);
  assert.equal(O.pedirAbono(gravada(e), '1:retrabalho', MOTIVO, {regra:REGRA}), 'Retrabalho não se abona.');
  // Código do abono fora do formato: aviso.
  const r2 = await e.call({action:'upsert', os:com(e, '2', pedido('2:atraso', {id:'AB-1'}))}, B.GESTOR);
  assert.match(String(r2.avisos), /sem código válido/);assert.ok(!('abonos' in gravada(e, '2')));
});

test('retorno antecipado pela volta: o servidor lê as O.S. da volta; abonar a O.S. que não é a última é descartado, a última grava', async () => {
  const c = chegada('15:00');
  const a = noPrazo('a', {...c, retornoPrevisto:[{dia:DIA, hora:'12:00'}]}), d = noPrazo('d', {...c, retornoPrevisto:[{dia:DIA, hora:'17:00'}]});
  const e = await edge('pcp-sync', banco([a, d]));
  // Caso ruim: sozinha, a O.S. "a" (previsto 12:00, chegada 15:00) nem é antecipada; e sozinha a "d" seria. O servidor mede pela volta.
  let r = await e.call({action:'upsert', os:com(e, 'a', pedido('a:retorno_antecipado'))}, B.GESTOR);
  assert.equal(r.status, 200);assert.ok(!('abonos' in gravada(e, 'a')));assert.match(String(r.avisos), /não existe nesta O\.S\./);
  r = await e.call({action:'upsert', os:com(e, 'd', pedido('d:retorno_antecipado', {motivo:'Cliente liberou o local mais cedo'}))}, B.GESTOR);
  assert.equal(r.status, 200, JSON.stringify(r));
  const ab = gravada(e, 'd').abonos[0];
  assert.equal(ab.ocorrenciaId, 'd:retorno_antecipado');assert.equal(ab.tipo, 'retorno_antecipado');assert.equal(ab.por, 'Gestor Teste');assert.equal(ab.porId, '111222');
  const volta = O.voltaNaLista(gravada(e, 'd'), [gravada(e, 'a')]);
  const st = O.statusEntrega(gravada(e, 'd'), '2026-10-06', REGRA, volta);
  assert.equal(st.estado, 'retorno_antecipado');assert.equal(st.rotulo, 'Retorno antecipado (abonado)');
  assert.match(st.motivo, /abonado por Gestor Teste: Cliente liberou o local mais cedo/);
  assert.deepEqual(st.perdas, [], 'o abonado não é perda');
  assert.equal(st.retornoAntecipado.situacao, 'abonado');
  // O abono junto com a chegada no mesmo envio: a chegada deste envio conta (a regra roda depois das outras).
  const e2 = await edge('pcp-sync', banco([noPrazo('z', {retornoPrevisto:[{dia:DIA, hora:'17:00'}]})]));
  r = await e2.call({action:'upsert', os:{...gravada(e2, 'z'), retornoConferido:{dia:DIA, hora:'14:00', fonte:'lote'}, abonos:[pedido('z:retorno_antecipado')]}}, B.GESTOR);
  assert.equal(r.status, 200, JSON.stringify(r));assert.equal(gravada(e2, 'z').retornoConferido.hora, '14:00');assert.equal(gravada(e2, 'z').abonos.length, 1);
});

/* ───────────── quem grava ───────────── */
test('operação, montagem, toque e máquina não gravam abono; o carimbo forjado não entra; o autor é o do crachá', async () => {
  const e = await edge('pcp-sync', banco([atrasada('1', {liberadoPCP:true, confirmacao:'Confirmado'})]));
  // Caso ruim: o pedido vem com autor, ID e hora escritos pelo aparelho.
  const forjado = pedido('1:atraso', {por:'Forjado', porId:'999999', porConta:'forjado', em:'2020-01-01T00:00:00Z'});
  const forjadoEm = {...forjado}; delete forjadoEm.pedido;
  for (const quem of [B.OPERA, B.MONTAGEM]) {
    const r = await e.call({action:'upsert', os:com(e, '1', forjado)}, quem);
    assert.equal(r.status, 200);assert.ok(!('abonos' in gravada(e)), quem.papel);
    assert.match(String(r.avisos), /só a gestão do PCP \(admin ou pcp\) abona/, quem.papel);
  }
  let r = await e.call({action:'upsert', os:{id:'1', rev:gravada(e).rev, abonos:[forjado], obsTecnicas:'nota'}}, B.TOQUE);
  assert.equal(r.status, 200, JSON.stringify(r));assert.ok(!('abonos' in gravada(e)), 'toque');
  r = await e.call({action:'upsert', os:com(e, '1', forjado)}, 'machine');
  assert.equal(r.status, 200);assert.ok(!('abonos' in gravada(e)), 'máquina');
  // A marca "já carimbada" (sem pedido) não entra nem da gestão: o aparelho não forja.
  r = await e.call({action:'upsert', os:com(e, '1', forjadoEm)}, B.GESTOR);
  assert.ok(!('abonos' in gravada(e)));
  r = await e.call({action:'upsert', os:com(e, '1', forjado)}, B.OUTRA);
  const ab = gravada(e).abonos[0];
  assert.equal(ab.por, 'Outra Gestora');assert.equal(ab.porConta, 'outra');assert.equal(ab.porId, '');assert.notEqual(ab.em, '2020-01-01T00:00:00Z');
  assert.ok(!('pedido' in ab));
  assert.ok(diario(e).some(a => a.campos.includes('abonos') && a.autor.login === 'outra' && a.depois.abonos.novos[0].ocorrenciaId === '1:atraso'), 'vai para o diário');
  // O que desce para a operação e para o toque leva o nome, sem o ID e sem o login.
  r = await e.call({action:'upsert', os:{...gravada(e), obsPCP:'x'}}, B.OPERA);
  assert.equal(r.os.abonos[0].por, 'Outra Gestora');assert.ok(!('porConta' in r.os.abonos[0]) && !('porId' in r.os.abonos[0]));
});

/* ───────────── a lista só cresce ───────────── */
test('aba antiga sem o campo não encolhe a lista; revogar mantém o registro; depois de revogar dá para abonar de novo', async () => {
  const e = await edge('pcp-sync', banco([atrasada()]));
  await e.call({action:'upsert', os:com(e, '1', pedido('1:atraso'))}, B.GESTOR);
  const um = gravada(e).abonos;
  assert.equal(um.length, 1);
  // Caso ruim: a v141 não conhece o campo, o Sobrescrever manda a lista vazia, null ou só o pedaço que tinha.
  for (const v of [undefined, [], null, [{id:'ab-outroqualquer', ocorrenciaId:'1:atraso', motivo:MOTIVO, em:'2026-10-05T10:00:00Z'}]]) {
    const os = {...gravada(e)};
    if (v === undefined) delete os.abonos; else os.abonos = v;
    const r = await e.call({action:'upsert', os}, B.GESTOR);
    assert.equal(r.status, 200);assert.deepEqual(gravada(e).abonos, um, JSON.stringify(v));
  }
  // Abonar de novo com um valendo: recusado.
  let r = await e.call({action:'upsert', os:com(e, '1', pedido('1:atraso', {motivo:'Outro motivo bem explicado aqui'}))}, B.GESTOR);
  assert.match(String(r.avisos), /já está abonada/);assert.equal(gravada(e).abonos.length, 1);
  assert.equal(O.pedirAbono(gravada(e), '1:atraso', MOTIVO, {regra:REGRA}), 'A ocorrência já está abonada. Revogue o abono antes de abonar de novo.');
  // O status com o abono: "Com atraso (abonado)", sem perda.
  let st = O.statusEntrega(gravada(e), '2026-10-06', REGRA);
  assert.equal(st.estado, 'atraso');assert.equal(st.rotulo, 'Com atraso (abonado)');assert.deepEqual(st.perdas, []);
  assert.match(st.motivo, /2 dias depois do prazo \(03\/10\); abonado por Gestor Teste: Cliente pediu para remarcar a instalação/);
  // Revogar: operação não; a gestão sim, com carimbo, e o registro fica.
  const revogar = () => ({...gravada(e), abonos:gravada(e).abonos.map(a => ({...a, revogar:true}))});
  r = await e.call({action:'upsert', os:revogar()}, B.OPERA);
  assert.match(String(r.avisos), /só a gestão do PCP \(admin ou pcp\) revoga/);assert.ok(!gravada(e).abonos[0].revogadoEm);
  r = await e.call({action:'upsert', os:revogar()}, B.OUTRA);
  const rev = gravada(e).abonos;
  assert.equal(rev.length, 1, 'nunca apaga');assert.equal(rev[0].motivo, MOTIVO);assert.equal(rev[0].por, 'Gestor Teste');
  assert.equal(rev[0].revogadoPor, 'Outra Gestora');assert.equal(rev[0].revogadoPorConta, 'outra');assert.ok(rev[0].revogadoEm);assert.ok(!('revogar' in rev[0]));
  st = O.statusEntrega(gravada(e), '2026-10-06', REGRA);
  assert.equal(st.rotulo, 'Com atraso');assert.deepEqual(st.perdas, ['atraso'], 'revogado, volta a contar');
  // Revogar de novo não troca o carimbo; abonar de novo agora grava um segundo registro.
  const em = rev[0].revogadoEm;
  await e.call({action:'upsert', os:revogar()}, B.GESTOR);
  assert.equal(gravada(e).abonos[0].revogadoEm, em);
  r = await e.call({action:'upsert', os:com(e, '1', pedido('1:atraso', {motivo:'Remarcação pedida pelo cliente por telefone'}))}, B.GESTOR);
  assert.equal(gravada(e).abonos.length, 2);assert.equal(O.statusEntrega(gravada(e), '2026-10-06', REGRA).rotulo, 'Com atraso (abonado)');
  // O pedido abonado e revogado antes de ir (sem rede) não entra.
  const o = gravada(e);
  r = await e.call({action:'upsert', os:{...o, abonos:o.abonos.map(a => ({...a, revogar:true}))}}, B.GESTOR);
  const sem = gravada(e);
  assert.equal(O.pedirAbono(sem, '1:atraso', MOTIVO, {regra:REGRA}), '');
  assert.equal(O.pedirRevogarAbono(sem, sem.abonos[2].id), '');
  r = await e.call({action:'upsert', os:sem}, B.GESTOR);
  assert.equal(r.status, 200);assert.equal(gravada(e).abonos.length, 2);
});

test('o atraso da O.S. ainda aberta (a remarcação pedida pelo cliente) se abona antes da entrega e segue abonado depois', async () => {
  // O servidor julga a aberta pelo dia de hoje: o prazo combinado fica no passado (20/09).
  const aberta = atrasada('1', {finalizadaEm:'', finalizadoPor:'', prazoCombinado:{data:'2026-09-20', fonte:'agenda'}, instalacao:{data:'2026-10-09', periodo:'Manhã', duracaoDias:1}});
  // Caso ruim: o prazo combinado (20/09) venceu porque o cliente pediu outra data; sem abono, a entrega de 09/10 seria perda.
  assert.ok(O.ocorrenciasDerivadas(aberta, REGRA, null, '2026-09-30').some(o => o.id === '1:atraso'));
  const e = await edge('pcp-sync', banco([aberta]));
  const r = await e.call({action:'upsert', os:com(e, '1', pedido('1:atraso'))}, B.GESTOR);
  assert.equal(r.status, 200, JSON.stringify(r));assert.equal(gravada(e).abonos.length, 1);
  const entregue = {...gravada(e), finalizadaEm:'2026-10-09T20:00:00.000Z'};
  const st = O.statusEntrega(entregue, '2026-10-10', REGRA);
  assert.equal(st.rotulo, 'Com atraso (abonado)');assert.deepEqual(st.perdas, []);assert.equal(st.diasAtraso, 19);
  // Precedência: o abonado vem depois das perdas que valem (o retrabalho manda) e antes do "No prazo".
  const ra = O.statusEntrega({...entregue, retrabalho:true}, '2026-10-10', REGRA);
  assert.deepEqual(ra.aplicaveis.map(a => a.estado), ['retrabalho', 'atraso']);assert.equal(ra.aplicaveis[1].abonado, true);assert.deepEqual(ra.perdas, ['retrabalho']);
});

/* ───────────── a tela: ficha e card (app.js), com o store real ───────────── */
function domFalso() {
  const porId = new Map(), nos = new Map();
  const el = tag => ({tag, id:'', className:'', innerHTML:'', textContent:'', value:'', dataset:{}, hidden:false, style:{},
    classList:{add() {}, remove() {}, toggle() {}, contains:() => false},
    setAttribute() {}, getAttribute() {}, focus() {}, addEventListener() {}, remove() {}, querySelector:() => null, querySelectorAll:() => [], closest:() => null,
    insertBefore(n) { if (n && n.id) porId.set(n.id, n); }, appendChild(n) { if (n && n.id) porId.set(n.id, n); }});
  const no = sel => { if (!nos.has(sel)) nos.set(sel, el('div')); return nos.get(sel); };
  return {doc:{activeElement:null, body:el('body'), addEventListener() {}, querySelector:sel => no(sel), querySelectorAll:() => [],
    getElementById:id => porId.get(id) || null, createElement:tag => el(tag)}, porId};
}
async function tela(registros, quem = B.GESTOR) {
  const e = await edge('pcp-sync', banco(registros));
  const inicial = e.db.pcp_registros.filter(r => r.colecao === 'os').map(r => plano(r.registro));
  const d = domFalso(), ls = new Map([['impresilk_inst_os', JSON.stringify(inicial)], ['impresilk_inst_fila', '[]']]);
  const idb = {transaction() { const tx = {objectStore:() => ({get() { const q = {}; queueMicrotask(() => q.onsuccess?.({target:{result:null}})); return q; },
    put() { queueMicrotask(() => tx.oncomplete?.()); }, delete() { queueMicrotask(() => tx.oncomplete?.()); }})}; return tx; }};
  const toasts = [];
  const ctx = vm.createContext({console:{log() {}, warn() {}, error() {}}, navigator:{onLine:true}, window:{addEventListener() {}}, location:{reload() {}},
    localStorage:{getItem:k => ls.has(k) ? ls.get(k) : null, setItem:(k, v) => ls.set(k, String(v)), removeItem:k => ls.delete(k)},
    indexedDB:{open() { const q = {}; queueMicrotask(() => q.onsuccess({target:{result:idb}})); return q; }, deleteDatabase() {}},
    setTimeout:() => 1, clearTimeout() {}, setInterval:() => 1, clearInterval() {}, AbortController, API_BASE:'http://teste',
    fetch:async (_u, req) => { const r = await e.call(JSON.parse(req.body), quem); return {ok:!(r.status >= 400), status:r.status || 200, json:async () => r}; },
    document:d.doc, confirm:() => true});
  for (const f of ['store.js', 'operacao.js', 'entrega-item.js', 'app.js']) vm.runInContext(ler(f), ctx, {filename:f});
  const run = c => vm.runInContext(c, ctx);
  ctx.__toasts = toasts;
  run(`STATE.user = {nome:${JSON.stringify(quem.nome)}, papel:${JSON.stringify(quem.papel)}};
    renderModal = () => {}; renderActiveTab = () => {}; reRenderModalKeepOpen = () => {}; toast = (m, t) => __toasts.push([m, t]);
    abrirDialogoF17 = (cfg, cb) => { __dialogo = cfg; __confirmar = cb; };`);
  const S = run('STORE');
  await S.pronto();
  const esvaziar = async () => { for (let i = 0; i < 100 && S.getQueue().length; i++) { await S.trySync(); await new Promise(r => setTimeout(r, 2)); } };
  return {e, S, run, toasts, esvaziar,
    abrir:id => run(`_modalDraft = JSON.parse(JSON.stringify(STORE.getOS(${JSON.stringify(id)}))); STATE.modalOSId = ${JSON.stringify(id)}; _modalDirty = false;`)};
}

test('tela: Abonar na ficha (motivo curto recusado), o card mostra o abonado; Abonar no card; só a gestão vê o botão', async () => {
  const b = await tela([atrasada('1'), atrasada('2')]);
  b.abrir('1');
  let ficha = b.run('statusEntregaFichaHTML(_modalDraft)');
  assert.match(ficha, /class="st-ocorrencias"/);assert.match(ficha, /data-f17-acao="abonar" data-oc="1:atraso"/);assert.match(ficha, /data-f17-acao="registrar"/);
  // Caso ruim: motivo curto. O diálogo mostra a frase e o rascunho não muda.
  b.run(`abonarOcorrenciaEm(_modalDraft, statusEntregaDe(_modalDraft).ocorrencias, gravarNaFichaF17)`);
  assert.equal(b.run('__dialogo.botao'), 'Abonar');
  assert.equal(b.run(`__confirmar({oc:'1:atraso', motivo:'remarcou'})`), 'Escreva o motivo do abono com 15 letras ou mais.');
  assert.equal(b.run('_modalDraft.abonos'), undefined);
  assert.equal(b.run(`__confirmar({oc:'1:atraso', motivo:${JSON.stringify(MOTIVO)}})`), '');
  // Na hora (antes do servidor): a ficha e o card já dizem abonado, "a enviar".
  ficha = b.run('statusEntregaFichaHTML(_modalDraft)');
  assert.match(ficha, /Com atraso \(abonado\)/);assert.match(ficha, /\(a enviar\)/);
  assert.match(b.run(`osCardHTML(STORE.getOS('1'))`), /selo-entrega se-atraso se-abonado/);
  assert.doesNotMatch(b.run(`osCardHTML(STORE.getOS('1'))`), /data-abonar-os="1"/, 'abonado: o card não oferece Abonar');
  await b.esvaziar();
  const g = gravada(b.e);
  assert.equal(g.abonos.length, 1);assert.equal(g.abonos[0].por, 'Gestor Teste');assert.equal(g.abonos[0].porId, '111222');
  assert.ok(b.run(`STORE.getOS('1').abonos[0].em`), 'o aparelho adota o carimbo do servidor');
  // O card da O.S. 2: Abonar direto, sem abrir a ficha.
  assert.match(b.run(`osCardHTML(STORE.getOS('2'))`), /data-abonar-os="2"/);
  b.run(`abonarDoCard('2')`);
  assert.equal(b.run(`__confirmar({oc:'2:atraso', motivo:'Cliente pediu para remarcar a data'})`), '');
  await b.esvaziar();
  assert.equal(gravada(b.e, '2').abonos[0].motivo, 'Cliente pediu para remarcar a data');
  // A operação não vê o botão.
  const op = await tela([atrasada('1')], B.OPERA);
  assert.doesNotMatch(op.run(`osCardHTML(STORE.getOS('1'))`), /data-abonar-os/);
  op.abrir('1');
  assert.doesNotMatch(op.run('statusEntregaFichaHTML(_modalDraft)'), /data-f17-acao/);
});

test('Fechar o dia: Abonar e Revogar pela linha do lote (ação na hora, fora do Desfazer do lote), com o store real', async () => {
  const b = await B.montar({os:[B.pcpFim('p1', {prazoCombinado:{data:'2026-09-26', fonte:'agenda'}})]});
  try {
    await b.run(`LOTE.abrir({modo:'dia', dia:'2026-09-29'})`);
    // Caso ruim: abonar o retrabalho (que a O.S. nem tem) e com motivo curto.
    assert.match(await b.acao({acao:'abonar', os:'p1', oc:'p1:retrabalho', motivo:MOTIVO}), /não existe mais nesta O\.S\./);
    assert.equal(await b.acao({acao:'abonar', os:'p1', oc:'p1:atraso', motivo:'curto'}), 'Escreva o motivo do abono com 15 letras ou mais.');
    assert.equal(await b.acao({acao:'abonar', os:'p1', oc:'p1:atraso', motivo:MOTIVO}), '');
    await b.sincronizar();
    const ab = B.noServidor(b.e, 'p1').abonos;
    assert.equal(ab.length, 1);assert.equal(ab[0].ocorrenciaId, 'p1:atraso');assert.equal(ab[0].porId, '111222');
    assert.equal(await b.acao({acao:'revogar-abono', os:'p1', ab:ab[0].id}), '');
    await b.sincronizar();
    const rev = B.noServidor(b.e, 'p1').abonos;
    assert.equal(rev.length, 1);assert.equal(rev[0].revogadoPor, 'Gestor Teste');
    // A operação não abona pelo lote.
    const op = await B.montar({os:[B.pcpFim('p1', {prazoCombinado:{data:'2026-09-26', fonte:'agenda'}})], quem:B.OPERA});
    try { assert.match(op.run(`LOTE.executar({acao:'abonar', os:'p1', oc:'p1:atraso', motivo:${JSON.stringify(MOTIVO)}})`), /gestão do PCP/); } finally { op.fechar(); }
  } finally { b.fechar(); }
});
