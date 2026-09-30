/* F10 (30/09/2026): o componente único de alocação na ficha da O.S., na
   Agenda e no Lançar entrega, com os ocupados marcados antes de gravar e a
   busca tolerante. Cada teste começa pelo caso ruim. DOM falso: o componente
   liga por delegação, então o teste chama as ações pelo nome que a tela usa
   (data-aloc-acao). Tudo fictício: o repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const js = x => JSON.parse(JSON.stringify(x));
const HOJE = '2026-10-05';

const ELENCO = {pessoas: [
  {chave: 'adriano-f', id: '100001', nome: 'Adriano Fictício Souza', apelido: 'adriano', area: 'Montagem', ativo: true},
  {chave: 'bia-f', id: '100002', nome: 'Bia Fictícia', apelido: 'bia', area: 'Montagem', ativo: true},
  {chave: 'caio-f', id: '100003', nome: 'Caio Fictício', apelido: 'caio', area: 'Montagem', ativo: true},
  {chave: 'eva-f', id: '100005', nome: 'Eva Fictícia', apelido: 'eva', area: 'Montagem', ativo: true},
  {chave: 'davi-fl', id: '300004', nome: 'Davi Prestador', apelido: 'davi', ativo: true, freelancer: true},
  {chave: 'rita-f', id: '100009', nome: 'Rita Fictícia', apelido: 'rita', area: 'Montagem', ativo: true, idRepetido: true},
], antigos: [], ferias: [], ausencias: [], fichaRH: true};
const EQUIPES = [
  {id: 'eq-aguia', nome: 'Águia', animal: 'aguia', cor: 'marinho', liderPadraoId: '100001', membros: [{chave: '100001', nome: 'Adriano'}, {chave: '100002', nome: 'Bia'}], ativo: true},
  {id: 'eq-leao', nome: 'Leão', animal: 'leao', cor: 'laranja', liderPadraoId: '100005', membros: [{chave: '100005', nome: 'Eva'}, {chave: '100003', nome: 'Caio'}], ativo: true},
];
const escH = s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[ch]));
// O resultado da busca em duas partes: o achado e o "Você quis dizer".
const partes = h => { const i = h.indexOf('<div class="aloc-sugestoes"'); return i < 0 ? [h, ''] : [h.slice(0, i), h.slice(i)]; };
const osBase = (extra = {}) => ({id: 'o1', numero: '8001', tipo: 'externo', cliente: 'Cliente Fictício', liberadoPCP: true, equipe: [],
  instalacao: {data: HOJE, periodo: 'Manhã', duracaoDias: 1}, veiculo: '', valorTotal: 5000, rev: 1, ...extra});

/* A tela da gestão num contexto isolado: operacao, divisao, regras,
   performance, o componente, o casa.js (Agenda e Lançar entrega) e o seletor
   de pessoas do app.js (as travas da F07). O STORE é de mentira e conta o que
   grava. `dom` liga os elementos que a tela procura pelo id. */
function tela({lista = [], papel = 'pcp', dom = {}, confirmar = () => true} = {}) {
  const cfg = {instaladores: ['Adriano'], vinculosRH: [], performancePCP: {equipes: js(EQUIPES), participacoes: []}};
  const salvos = [], toasts = [], perguntas = [];
  const STORE = {getCFG: () => cfg, saveCFG() {}, getAllOS: () => lista, getOS: id => lista.find(o => o.id === id) || null,
    saveOS: o => { salvos.push(js(o)); const i = lista.findIndex(x => x.id === o.id); if (i >= 0) lista[i] = o; else lista.push(o); },
    elenco: () => ELENCO, getQueue: () => [], trySync: async () => {}, on() {}, onConflict() {}, regrasLocais: () => null, valores: () => ({}),
    pullPhoto: async () => null, uuid: () => 'u1'};
  const c = {STORE, STATE: {user: {papel, nome: 'Gestor Teste'}}, console, setTimeout, clearTimeout, navigator: {onLine: true},
    Date: class extends Date { constructor(...a) { super(...(a.length ? a : [HOJE + 'T12:00:00'])); } static now() { return +new Date(HOJE + 'T12:00:00'); } },
    esc: escH, toast: (m, t) => toasts.push([m, t]), confirm: m => { perguntas.push(m); return confirmar(m); },
    localStorage: {getItem: () => null, setItem() {}, removeItem() {}},
    document: {getElementById: id => dom[id] || null, querySelectorAll: () => [], querySelector: () => null, createElement: () => dom.__box, body: {appendChild() {}, classList: {add() {}, remove() {}, contains: () => false}}},
    emptyState: () => '', bindCardClicks() {}, fmtInstalacao: () => '', filtroPeriodoHTML: () => '',
    hojeISO: () => HOJE, nowISO: () => HOJE + 'T12:00:00Z', renderEntregas() {}, voltaEquipeHTML: () => '', VOLTA_ROTULO: {},
    registrarRemarcacao() {}, perguntarRetrabalho: (o, cb) => cb()};
  vm.createContext(c);
  for (const f of ['operacao.js', 'divisao.js', 'regras.js', 'performance.js', 'alocacao-ui.js', 'casa.js']) vm.runInContext(ler(f), c, {filename: f});
  const app = ler('app.js');
  vm.runInContext(app.slice(app.indexOf('const RH_CONTRATOS_FREELANCER'), app.indexOf('/* `marcadosAgora` e `novas`')), c, {filename: 'app.js (seletor)'});
  return {c, A: vm.runInContext('ALOCUI', c), run: code => vm.runInContext(code, c), cfg, salvos, toasts, perguntas, lista};
}

/* ───────────── modo só pessoas (operação e montagem com senha) ───────────── */

test('só pessoas: operação monta a equipe sem papel, percentual nem R$, com o aviso de que a divisão é da gestão', () => {
  const os = osBase({equipe: ['100001', '100002'], alocacao: null});
  const {A} = tela({papel: 'operacao', lista: [os]});
  assert.equal(A.modoPara('operacao', os), 'pessoas');
  assert.equal(A.modoPara('montagem', os), 'pessoas');
  assert.equal(A.modoPara('pcp', os), 'divisao');
  assert.equal(A.modoPara('pcp', {...os, tipo: 'interno'}), 'pessoas', 'cliente retira não tem divisão');
  A.iniciar('op', {os, equipes: EQUIPES, papel: 'operacao', modo: 'pessoas', valor: 5000});
  const html = A.html('op');
  // Caso ruim: a operação montava no componente da gestão e a divisão era descartada calada no servidor.
  assert.match(html, /A divisão \(líder e percentuais\) fica para a gestão, admin e PCP/);
  assert.doesNotMatch(html, /R\$/);
  assert.doesNotMatch(html, /Líder/);
  assert.doesNotMatch(html, /data-aloc-pct/);
  assert.doesNotMatch(html, /Tornar líder/);
  assert.doesNotMatch(html, /Prévia por pessoa/);
  assert.doesNotMatch(html, /—/, 'sem travessão no texto');
  assert.equal(A.estado('op').valor, null, 'nem guarda o valor');
  // Ações de divisão são recusadas no modo só pessoas.
  assert.match(A.executar('op', {alocAcao: 'lider', g: '0', p: '100002'}), /ficam para a gestão/);
  assert.match(A.executar('op', {alocAcao: 'pct', g: '0', p: '100001', valor: '70'}), /ficam para a gestão/);
  // A equipe sai como lista de pessoas.
  assert.equal(A.executar('op', {alocAcao: 'painel'}), '');
  assert.equal(A.executar('op', {alocAcao: 'pessoa', p: '100003'}), '');
  assert.deepEqual(js(A.paraEquipe('op').equipe), ['100001', '100002', '100003']);
  assert.equal(A.estado('op').tocado, true);
});

test('só pessoas: nunca grava a divisão, nem pelo gravarNaOS nem no mesmo envio', async () => {
  const os = osBase({equipe: ['100001']});
  const {A, salvos} = tela({papel: 'operacao', lista: [os]});
  A.iniciar('op', {os, equipes: EQUIPES, papel: 'operacao', modo: 'pessoas'});
  A.executar('op', {alocAcao: 'equipe', e: 'eq-leao'});
  const r = await A.gravarNaOS('op');
  assert.equal(r.ok, false);
  assert.match(r.mensagem, /Só a gestão/);
  const alvo = js(os);
  const r2 = A.aplicarNaOS('op', alvo, {soSeTocou: true});
  assert.equal(r2.ok, false);
  assert.equal(r2.estado, 'so-pessoas');
  assert.equal(alvo.alocacao, undefined, 'nada vai para os.alocacao');
  assert.equal(salvos.length, 0);
  // E a operação no modo divisão (tela velha pedindo) também não grava.
  A.iniciar('op2', {os, equipes: EQUIPES, papel: 'operacao'});
  A.executar('op2', {alocAcao: 'equipe', e: 'eq-leao'});
  assert.match((await A.gravarNaOS('op2')).mensagem, /Só a gestão/);
});

test('só pessoas: nome antigo sem ficha no RH aparece marcado e só sai se alguém tirar', () => {
  const os = osBase({equipe: ['Osmane V.', '100002']});
  const {A} = tela({papel: 'operacao', lista: [os]});
  A.iniciar('op', {os, equipes: EQUIPES, papel: 'operacao', modo: 'pessoas'});
  assert.match(A.html('op'), /Osmane V\.[\s\S]*sem ficha no RH/);
  // Caso ruim: mexer na equipe tirava calado quem não tinha ficha.
  A.executar('op', {alocAcao: 'equipe', e: 'eq-leao'});
  assert.deepEqual(js(A.paraEquipe('op').equipe), ['100002', '100005', '100003', 'Osmane V.']);
  assert.equal(A.executar('op', {alocAcao: 'remover-nome', nome: 'osmane v.'}), '');
  assert.deepEqual(js(A.paraEquipe('op').equipe), ['100002', '100005', '100003']);
  // A divisão (admin) trava com o motivo em vez de montar pela metade.
  const {A: G} = tela({papel: 'pcp', lista: [os]});
  assert.equal(G.modoPara('pcp', os), 'pessoas', 'nome sem ficha: a tela da gestão monta só as pessoas');
  G.iniciar('div', {os, equipes: EQUIPES, papel: 'pcp', semAntigo: true});
  assert.match(G.html('div'), /A divisão precisa do cadastro de todos/);
  assert.match(G.bloqueio('div'), /Osmane V\. está nesta O\.S\. só pelo nome/);
});

/* ───────────── ocupados ───────────── */

test('ocupados: o chip de quem já está em outra O.S. no mesmo horário aparece marcado antes de gravar', () => {
  const outra = osBase({id: 'o2', numero: '8002', equipe: ['100002'], veiculo: 'Carro 2'});
  const os = osBase({equipe: ['100001']});
  const {A, c} = tela({papel: 'pcp', lista: [os, outra]});
  const oc = c.ocupadosNoDiaCasa(HOJE, 'Manhã', 'o1', {os});
  assert.ok(oc.pessoas.has('100002'));
  assert.ok(oc.veiculos.has('Carro 2'));
  A.iniciar('t', {os, equipes: EQUIPES, papel: 'pcp', ocupados: oc.pessoas});
  let html = A.html('t');
  assert.match(html, /Águia<\/b><small>2 pessoas · ⚠ 1 ocupada/, 'a equipe diz quantos estão ocupados antes de trazer');
  A.executar('t', {alocAcao: 'equipe', e: 'eq-aguia'});
  html = A.html('t');
  assert.match(html, /class="aloc-chip ocupado"[\s\S]*?Bia[\s\S]*?⚠ Ocupado na O\.S\. 8002 \(Manhã\)/);
  assert.doesNotMatch(html.split('Bia')[0].split('aloc-chip lider')[1] || '', /Ocupado/, 'o Adriano não está ocupado');
  // A tela troca o período: a tarde não bate com a manhã, e o chip deixa de ser marcado.
  assert.equal(A.definirOcupados('t', c.ocupadosNoDiaCasa(HOJE, 'Tarde', 'o1', {os}).pessoas), true);
  assert.doesNotMatch(A.html('t'), /Ocupado na O\.S\./);
  // Férias pelo RH também marcam.
  ELENCO.ferias.push({chave: 'caio-f', de: HOJE, ate: HOJE});
  try { assert.deepEqual(js(c.ocupadosNoDiaCasa(HOJE, 'Tarde', 'o1', {os}).pessoas.get('100003')), [{texto: 'De férias'}]); }
  finally { ELENCO.ferias.length = 0; }
});

/* ───────────── busca tolerante no componente ───────────── */

test('busca: "Adrinao" acha o Adriano só em "Você quis dizer"; o ID exato vence; pedaço de CPF não acha', () => {
  const {A} = tela({papel: 'pcp'});
  A.iniciar('t', {os: osBase(), equipes: EQUIPES, papel: 'pcp'});
  A.executar('t', {alocAcao: 'painel'});
  const busca = q => { A.estado('t').painel.busca = q; return A.resultadosHTML('t'); };
  const r = busca('Adrinao');
  const [antes, sugestao] = partes(r);
  assert.ok(sugestao, 'aparece a seção de sugestão');
  assert.match(sugestao, /data-p="100001"/, 'o Adriano é sugerido');
  assert.doesNotMatch(antes, /data-p="100001"/, 'e nunca como achado direto');
  assert.match(sugestao, /class="aloc-opcao sugestao"/);
  // O texto contido continua achado direto.
  assert.match(partes(busca('adri'))[0], /data-p="100001"/);
  // ID exato: só ele.
  const porId = busca('100003');
  assert.match(porId, /data-p="100003"/);
  assert.doesNotMatch(porId, /data-p="100001"|data-p="100002"/);
  assert.doesNotMatch(porId, /Você quis dizer/);
  // Pedaço de CPF (ou do ID) não acha ninguém, e a tela diz por quê.
  for (const q of ['1000', '000.03', '100.003.456-00']) {
    const h = busca(q);
    assert.doesNotMatch(h, /data-p="\d{6}"/, q);
    assert.match(h, /Digite os 6 dígitos do ID inteiro/);
  }
  // As travas da F07 continuam na busca: ID repetido aparece travado.
  assert.match(busca('rita'), /data-p="100009"[^>]*disabled/);
  assert.match(A.executar('t', {alocAcao: 'pessoa', p: '100009'}), /ID repetido/);
});

test('busca: vale para equipe; o parecido também vai para "Você quis dizer"', () => {
  const {A} = tela({papel: 'pcp'});
  A.iniciar('t', {os: osBase(), equipes: EQUIPES, papel: 'pcp'});
  A.executar('t', {alocAcao: 'painel'});
  A.estado('t').painel.busca = 'leao';
  assert.match(partes(A.resultadosHTML('t'))[0], /Equipes[\s\S]*data-aloc-acao="equipe" data-e="eq-leao"/);
  A.estado('t').painel.busca = 'Aguai';
  const [antes, sug] = partes(A.resultadosHTML('t'));
  assert.ok(sug && /data-e="eq-aguia"/.test(sug));
  assert.doesNotMatch(antes, /data-e="eq-aguia"/);
});

/* ───────────── Agenda ───────────── */

// O formulário da Agenda com o componente, num DOM falso mínimo.
function agenda(t, os) {
  const host = {innerHTML: '', querySelector: () => null, querySelectorAll: () => []};
  const ouvintes = [];
  const sel = {value: '', options: t.lista.map(o => ({value: o.id})), addEventListener: (_, fn) => ouvintes.push(fn)};
  const campo = v => ({value: v, ouvintes: [], addEventListener(tipo, fn) { this.ouvintes.push([tipo, fn]); }, mudar(x) { this.value = x; this.ouvintes.filter(([t]) => t === 'change').forEach(([, fn]) => fn()); }});
  const opcao = v => ({value: v, textContent: v, dataset: {}});
  const campos = {periodo: campo('Manhã'), hora: campo(''), dias: campo('1'), veiculo: {value: '', options: [opcao(''), opcao('Carro 2'), opcao('Instalação interna')]}};
  const form = {querySelector: q => q === '[data-aloc-host]' ? host : q === '[name="osId"]' ? sel : (/name="(\w+)"/.exec(q) || [])[1] ? campos[/name="(\w+)"/.exec(q)[1]] || null : null,
    querySelectorAll: () => []};
  t.c.document.getElementById = id => (id === 'ag-add' ? form : null);
  t.c.FormData = class { get(k) { return k === 'osId' ? sel.value : k === 'dias' ? '1' : (campos[k] || {}).value || ''; } getAll() { return []; } };
  let gravou = 0;
  t.run('(el, cb) => wireAddOSCasa(el, "ag-add", "' + HOJE + '", cb)')({querySelectorAll: () => []}, () => { gravou++; });
  sel.value = os.id; ouvintes.forEach(fn => fn());
  return {host, campos, submeter: () => { form.onsubmit({preventDefault() {}}); return gravou; }, chave: 'agenda:ag-add'};
}

test('Agenda: com uma equipe, admin e pcp gravam o equipeId e os papéis no mesmo envio da O.S.', () => {
  const os = osBase({instalacao: {}});
  const t = tela({papel: 'pcp', lista: [os]});
  assert.match(t.run(`formAddOSHTML('ag-add', '${HOJE}', STORE.getAllOS())`), /data-aloc-host="ag-add"/, 'o componente no lugar de "Equipe salva"');
  assert.doesNotMatch(t.run(`formAddOSHTML('ag-add', '${HOJE}', STORE.getAllOS())`), /Equipe salva/);
  const ag = agenda(t, os);
  assert.match(ag.host.innerHTML, /Trazer equipe/);
  assert.equal(t.A.executar(ag.chave, {alocAcao: 'equipe', e: 'eq-aguia'}), '');
  assert.equal(ag.submeter(), 1);
  assert.equal(t.salvos.length, 1, 'uma gravação só: a agenda e a divisão juntas');
  const g = t.salvos[0];
  assert.equal(g.instalacao.data, HOJE);
  assert.deepEqual(g.equipe, ['100001', '100002'], 'os.equipe derivada da divisão');
  assert.equal(g.alocacao.grupos.length, 1);
  assert.equal(g.alocacao.grupos[0].equipeId, 'eq-aguia', 'a equipe escolhida vai gravada');
  assert.equal(g.alocacao.grupos[0].liderId, '100001');
  assert.deepEqual(g.alocacao.grupos[0].membros.map(m => [m.pessoaId, m.papel, m.cota]), [['100001', 'lider', 6000], ['100002', 'ajudante', 4000]]);
  assert.equal(g.alocacao.em, undefined, 'divisão nova vai sem em');
  assert.equal(t.A.estado(ag.chave), null, 'o componente é esquecido depois de gravar');
});

test('Agenda: sem mexer na equipe, a O.S. é programada e a equipe e a divisão ficam como estavam', () => {
  const os = osBase({instalacao: {}, equipe: ['100005', '100003']});
  const t = tela({papel: 'pcp', lista: [os]});
  const ag = agenda(t, os);
  ag.submeter();
  const g = t.salvos[0];
  assert.deepEqual(g.equipe, ['100005', '100003']);
  assert.equal(g.alocacao, undefined, 'a sugestão que ninguém conferiu não vira divisão gravada');
});

test('Agenda: a operação grava só as pessoas, e avisa quando a divisão gravada fica para a gestão', () => {
  const alocacao = {grupos: [{equipeId: 'eq-leao', cota: 10000, liderId: '100005', membros: [{pessoaId: '100005', papel: 'lider', cota: 6000}, {pessoaId: '100003', papel: 'ajudante', cota: 4000}]}], manual: false, em: '2026-10-01T10:00:00Z'};
  const os = osBase({instalacao: {}, equipe: ['100005', '100003'], alocacao});
  const t = tela({papel: 'operacao', lista: [os]});
  const ag = agenda(t, os);
  assert.equal(t.A.estado(ag.chave).modo, 'pessoas');
  assert.doesNotMatch(ag.host.innerHTML, /R\$|data-aloc-pct/);
  assert.equal(t.A.executar(ag.chave, {alocAcao: 'painel'}), '');
  assert.equal(t.A.executar(ag.chave, {alocAcao: 'pessoa', p: '100002'}), '');
  ag.submeter();
  const g = t.salvos[0];
  assert.deepEqual(g.equipe, ['100005', '100003', '100002']);
  assert.deepEqual(g.alocacao, alocacao, 'a divisão não é tocada pela operação (o servidor a marca desatualizada)');
  assert.ok(t.toasts.some(([m, tp]) => /a divisão desta O\.S\. \(líder e percentuais\) fica para a gestão refazer/.test(m) && tp === 'error'), JSON.stringify(t.toasts));
});

test('Agenda: divisão que não fecha grava as pessoas e diz o motivo (nada sai calado)', () => {
  const os = osBase({instalacao: {}, equipe: ['100001', '100003']});
  const t = tela({papel: 'pcp', lista: [os]});
  const ag = agenda(t, os);
  // Sugestão sem líder (duas pessoas avulsas) e um terceiro: tocou, mas continua sem líder.
  t.A.executar(ag.chave, {alocAcao: 'painel', g: '0'});
  assert.equal(t.A.executar(ag.chave, {alocAcao: 'pessoa', p: '100002'}), '');
  ag.submeter();
  const g = t.salvos[0];
  assert.deepEqual(g.equipe, ['100001', '100003', '100002']);
  assert.equal(g.alocacao, undefined);
  assert.ok(t.toasts.some(([m]) => /A equipe foi gravada, mas a divisão não: Escolha o líder/.test(m)), JSON.stringify(t.toasts));
});

/* ───────────── Lançar entrega ───────────── */

function lancar(t, osId) {
  const box = {innerHTML: '', style: {}, querySelectorAll: () => [], remove() {}};
  const host = {innerHTML: '', querySelector: () => null, querySelectorAll: () => []};
  const form = {};
  t.c.document.createElement = () => box;
  t.c.document.getElementById = id => ({'lancar-form': form, 'lancar-x': {}, 'lancar-aloc': host}[id] || null);
  t.c.FormData = class { get(k) { return k === 'data' ? '2026-10-02' : ''; } getAll() { return []; } };
  t.run(`lancarEntregaManual('${osId}')`);
  return {box, host, submeter: () => form.onsubmit({preventDefault() {}, target: form}), chave: 'lancar:' + osId};
}
const baixada = (extra = {}) => osBase({finalizadaEm: '2026-10-02T18:00:00', finalizadoPor: 'Mubisys (auto)', baixaAutoERP: {em: '2026-10-02T18:00:00', status: 'ENTREGUE'}, ...extra});

test('Lançar entrega: sem equipe continua perguntando; "não" não lança', () => {
  const t = tela({papel: 'pcp', lista: [baixada()], confirmar: () => false});
  const l = lancar(t, 'o1');
  assert.match(l.box.innerHTML, /id="lancar-aloc"/, 'o componente no lugar dos chips');
  l.submeter();
  assert.equal(t.perguntas.length, 1);
  assert.match(t.perguntas[0], /Lançar sem equipe\?/);
  assert.equal(t.salvos.length, 0, 'respondeu não: nada foi lançado');
});

test('Lançar entrega: tocar Continuar sem mexer não tira ninguém (nem o nome sem ficha) e não pergunta', () => {
  const t = tela({papel: 'pcp', lista: [baixada({equipe: ['100005', 'Osmane V.']})]});
  const l = lancar(t, 'o1');
  assert.equal(t.A.estado(l.chave).modo, 'pessoas', 'com nome sem ficha, a gestão monta só as pessoas');
  assert.match(l.host.innerHTML, /Osmane V\.[\s\S]*sem ficha no RH/);
  l.submeter();
  assert.equal(t.perguntas.length, 0);
  assert.deepEqual(t.salvos[0].equipe, ['100005', 'Osmane V.']);
  assert.equal(t.salvos[0].entregaLancada.data, '2026-10-02');
});

test('Lançar entrega: tirar todo mundo também pergunta; admin com equipe grava a divisão; operação só as pessoas', () => {
  // Caso ruim: sem pergunta, a equipe antiga ficava calada na O.S.
  const t = tela({papel: 'operacao', lista: [baixada({equipe: ['100005']})], confirmar: () => false});
  const l = lancar(t, 'o1');
  assert.equal(t.A.executar(l.chave, {alocAcao: 'remover', g: '0', p: '100005'}), '');
  l.submeter();
  assert.equal(t.perguntas.length, 1);
  assert.equal(t.salvos.length, 0);
  // Admin: equipe num toque grava a divisão com o equipeId.
  const a = tela({papel: 'admin', lista: [baixada()]});
  const la = lancar(a, 'o1');
  assert.equal(a.A.estado(la.chave).modo, 'divisao');
  a.A.executar(la.chave, {alocAcao: 'equipe', e: 'eq-leao'});
  la.submeter();
  assert.equal(a.salvos[0].alocacao.grupos[0].equipeId, 'eq-leao');
  assert.deepEqual(a.salvos[0].equipe, ['100005', '100003']);
  // Operação: só as pessoas.
  const o = tela({papel: 'operacao', lista: [baixada()]});
  const lo = lancar(o, 'o1');
  o.A.executar(lo.chave, {alocAcao: 'equipe', e: 'eq-leao'});
  lo.submeter();
  assert.deepEqual(o.salvos[0].equipe, ['100005', '100003']);
  assert.equal(o.salvos[0].alocacao, undefined);
});

/* ───────────── ficha: a divisão grava no rascunho aberto ───────────── */

test('ficha: a divisão parte da equipe que o campo Equipe trouxe (equipeId não se perde com um avulso) e grava no rascunho, uma vez', async () => {
  const os = osBase({equipe: []});
  const t = tela({papel: 'pcp', lista: [os]});
  const rascunho = js(os);
  t.A.iniciar('ficha-eq:o1', {os: rascunho, equipes: EQUIPES, papel: 'pcp', modo: 'pessoas', seguirEquipe: true});
  t.A.executar('ficha-eq:o1', {alocAcao: 'equipe', e: 'eq-aguia'});
  t.A.executar('ficha-eq:o1', {alocAcao: 'painel'});
  t.A.executar('ficha-eq:o1', {alocAcao: 'pessoa', p: '100003'});
  rascunho.equipe = js(t.A.paraEquipe('ficha-eq:o1').equipe);
  assert.deepEqual(js(rascunho.equipe), ['100001', '100002', '100003']);
  // A repintura com a mesma equipe mantém a montagem (o campo não volta ao avulso).
  assert.equal(t.A.iniciar('ficha-eq:o1', {os: rascunho, equipes: EQUIPES, papel: 'pcp', modo: 'pessoas', seguirEquipe: true}).aloc.grupos[0].equipeId, 'eq-aguia');
  const st = t.A.iniciar('ficha-div:o1', {os: rascunho, equipes: EQUIPES, papel: 'pcp', semAntigo: true, seguirEquipe: true, estrutura: t.A.estrutura('ficha-eq:o1')});
  assert.deepEqual(js(st.aloc.grupos.map(g => [g.equipeId, g.liderId, g.membros.map(m => m.papel)])), [['eq-aguia', '100001', ['lider', 'ajudante']], [null, '100003', ['lider']]]);
  let salvou = 0;
  const r = await t.A.gravarNaOS('ficha-div:o1', {usuario: 'Gestor Teste', alvo: () => rascunho, salvar: o => { salvou++; assert.equal(o, rascunho); }});
  assert.equal(salvou, 1, 'uma confirmação = uma gravação da ficha');
  assert.ok(['gravada', 'pendente'].includes(r.estado), JSON.stringify(r));
  assert.equal(rascunho.alocacao.grupos[0].equipeId, 'eq-aguia');
  assert.deepEqual(js(rascunho.equipe), ['100001', '100002', '100003']);
  // O campo Equipe mudou de novo: a divisão recomeça pela equipe nova.
  rascunho.equipe = ['100005'];
  const st2 = t.A.iniciar('ficha-div:o1', {os: rascunho, equipes: EQUIPES, papel: 'pcp', semAntigo: true, seguirEquipe: true});
  assert.deepEqual(js(t.A.paraEquipe('ficha-div:o1').equipe), ['100005']);
  assert.notEqual(st2, st);
});

test('Agenda e Lançar: a divisão mudada em outro aparelho enquanto a tela estava aberta não é gravada por cima', () => {
  const os = osBase({instalacao: {}, equipe: ['100005', '100003']});
  const t = tela({papel: 'pcp', lista: [os]});
  const ag = agenda(t, os);
  t.A.executar(ag.chave, {alocAcao: 'lider', g: '0', p: '100005'});
  // Outro aparelho grava a equipe antes do Programar.
  t.lista[0] = {...os, equipe: ['100005', '100003', '100002']};
  ag.submeter();
  const g = t.salvos[0];
  assert.deepEqual(g.equipe, ['100005', '100003', '100002'], 'quem o outro aparelho pôs fica');
  assert.equal(g.alocacao, undefined);
  assert.ok(t.toasts.some(([m]) => /foi mudada em outro aparelho/.test(m)), JSON.stringify(t.toasts));
});

test('Agenda: trocar o período repinta quem está ocupado (e o carro), antes de gravar', () => {
  const outra = osBase({id: 'o2', numero: '8002', equipe: ['100002'], veiculo: 'Carro 2'});
  const os = osBase({instalacao: {}, equipe: ['100001']});
  const t = tela({papel: 'pcp', lista: [os, outra]});
  const ag = agenda(t, os);
  const st = () => t.A.estado(ag.chave);
  assert.ok(st().ocupados.has('100002'), 'de manhã a Bia está na 8002');
  assert.match(ag.host.innerHTML, /Águia<\/b><small>2 pessoas · ⚠ 1 ocupada/);
  assert.equal(ag.campos.veiculo.options[1].textContent, 'Carro 2 · ocupado na O.S. 8002');
  assert.equal(ag.campos.veiculo.options[2].textContent, 'Instalação interna', 'Instalação interna nunca fica ocupada');
  ag.campos.periodo.mudar('Tarde');
  assert.ok(!st().ocupados.has('100002'), 'à tarde ela está livre');
  assert.equal(ag.campos.veiculo.options[1].textContent, 'Carro 2');
  ag.campos.periodo.mudar('Horário');
  assert.ok(st().ocupados.has('100002'), '"Horário" bate com tudo');
});

test('Agenda: a operação não troca por cima a equipe mudada em outro aparelho com o formulário aberto', () => {
  const os = osBase({instalacao: {}, equipe: ['100005']});
  const t = tela({papel: 'operacao', lista: [os]});
  const ag = agenda(t, os);
  t.A.executar(ag.chave, {alocAcao: 'painel'});
  t.A.executar(ag.chave, {alocAcao: 'pessoa', p: '100002'});
  t.lista[0] = {...os, equipe: ['100005', '100003'], atualizadoPor: 'Outro Gestor'};
  ag.submeter();
  assert.deepEqual(t.salvos[0].equipe, ['100005', '100003'], 'quem o outro aparelho pôs fica');
  assert.ok(t.toasts.some(([m]) => /A equipe desta O\.S\. foi mudada em outro aparelho \(Outro Gestor\)/.test(m)), JSON.stringify(t.toasts));
});
