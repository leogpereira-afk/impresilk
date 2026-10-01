/* REVISÃO DA F18 (30/09/2026): a vista "Por O.S." de Entregas.
 *
 * Um teste por defeito da revisão, cada um começando pelo caso ruim (as
 * provas da revisão), e dois da junção com a F17 corrigida (a regra do dia
 * do serviço e as chegadas por dia). Todos falham no e8736f3 (a F18 juntada
 * com a F17, antes destas correções). Tudo com dados fictícios: o
 * repositório é público.
 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const AGORA = '2026-10-20T12:00:00-03:00';

const EQUIPES = [
  {id: 'eq-aguia', nome: 'Águia', animal: 'aguia', cor: 'marinho', membros: [{chave: '900001'}, {chave: '900002'}], ativo: true},
  {id: 'eq-leao', nome: 'Leão', animal: 'leao', cor: 'laranja', membros: [{chave: '900004'}], ativo: true},
];
const PESSOAS = () => [
  {id: '900001', nome: 'Ana Paula Fictícia', apelido: 'Ana'},
  {id: '900002', nome: 'Beatriz Lima Teste', apelido: 'Bia'},
  {id: '900004', nome: 'Carlos Prado Exemplo', apelido: 'Carlos'},
];

/* O arranjo de tests/entregas-por-os.test.cjs, com os arquivos que o
   index.html carrega antes da vista (o performance.js entra: a equipe da
   vista é a da Performance). As pessoas vêm do elenco e do CFG, como no
   aparelho (operacao.js: elenco, vinculosRH e instaladores). */
function casa(lista, {erp = [], papel = 'pcp', equipes = EQUIPES, pessoas = PESSOAS(), hist = [], buscar = null, estado = {}, participacoes = [], cfgExtra = {}} = {}) {
  const historico = hist.slice();
  const cfg = {instaladores: [], performancePCP: {equipes, participacoes}, ...cfgExtra};
  const ctx = vm.createContext({
    console, setTimeout, clearTimeout,
    Date: class extends Date { constructor(...a) { super(...(a.length ? a : [AGORA])); } static now() { return +new Date(AGORA); } },
    STORE: {
      JANELA_LOCAL_DIAS: 60,
      getAllOS: () => lista, getOS: id => lista.find(o => o.id === id) || historico.find(o => o.id === id) || null,
      getCFG: () => cfg,
      elenco: () => ({pessoas, veiculos: [], ferias: [], ausencias: []}),
      entreguesMes: m => ({v: 3, os: erp.filter(o => String(o.data).slice(0, 7) === m), em: '2026-10-20T10:00:00'}),
      pullEntreguesMes() {}, anosEntregues: () => [2026], valores: () => ({}),
      historico: () => historico,
      buscarHistorico: async q => { const r = buscar ? buscar(q) : {itens: []}; for (const o of r.itens || []) if (!historico.some(x => x.id === o.id)) historico.push(o); return r; },
    },
    STATE: {user: {papel, nome: 'Gestão de teste'}, _fEnt: {de: '2026-10-01', ate: '2026-10-20'}, ...estado},
    document: {getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: {classList: {add() {}, remove() {}, contains: () => false}}},
    localStorage: {getItem: () => null, setItem() {}, removeItem() {}},
    esc: s => String(s ?? '').replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch])),
    emptyState: (i, t) => `<div class="vazio">${t}</div>`, bindCardClicks() {}, toast() {}, fmtInstalacao: () => '', filtroPeriodoHTML: () => '',
    parseLocalDate: () => null, pessoaDoElenco: () => null,
  });
  for (const f of ['operacao.js', 'divisao.js', 'regras.js', 'entrega-item.js', 'casa.js', 'relatorios-entregas.js', 'performance.js', 'entregas-os.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, {filename: f});
  }
  vm.runInContext(`OPERACAO.usarPessoas(() => ({pessoas: STORE.elenco().pessoas, vinculos: STORE.getCFG().vinculosRH || [], lista: STORE.getCFG().instaladores || []}));
    var wireFiltroPeriodo = () => {}; var wireQuadrosCasa = () => {};
    var __el = {innerHTML: '', querySelectorAll: () => [], querySelector: () => ({value: ''})};
    document.getElementById = id => id === 'panel-entregas' ? __el : null;`, ctx);
  // O que volta do contexto vira objeto deste lado (o deepEqual estrito compara o protótipo).
  const run = code => { const r = vm.runInContext(code, ctx); return r && typeof r === 'object' && typeof r.then !== 'function' ? JSON.parse(JSON.stringify(r)) : r; };
  return {run, ctx, cfg, pessoas, tela: (prepara = '') => run(`${prepara}; renderEntregas(); __el.innerHTML`)};
}
const secao = html => (html.match(/<section class="poros"[\s\S]*?<\/section>/) || [''])[0];
const cartoes = html => [...secao(html).matchAll(/<article class="poros-card[^"]*" aria-label="O\.S ([^"]+)">/g)].map(m => m[1]);
const cartao = (html, n) => (secao(html).split(`aria-label="O.S ${n}"`)[1] || '').split('</article>')[0];
const os = (id, numero, extra = {}) => ({id, numero, tipo: 'externo', cliente: 'Cliente fictício ' + numero, servico: 'Fachada fictícia', equipe: [], ...extra});
const erpDe = (lista, dia, valor = 1000) => lista.map(o => ({numero: o.numero, cliente: o.cliente, data: dia, valor, tipo: o.tipo}));
const tique = () => new Promise(r => setTimeout(r, 0));

test('revisão: a equipe da vista é a que a Performance conta (a régua do perfRegistro), e a sugerida vem marcada', () => {
  const D = '2026-10-05', fim = {finalizadaEm: D + 'T18:00:00Z', finalizadoPor: 'Gestão de teste'};
  const lista = [
    // Caso ruim 1: só a Ana. A Águia é Ana e Bia: a composição não é a de nenhuma equipe e a Performance não dá equipe. A vista dava a Águia.
    os('q1', '9101', {equipe: ['900001'], ...fim}),
    // Caso ruim 2: a Ana (Águia) e o Carlos (Leão): a Performance não dá equipe; a vista dava as duas.
    os('q2', '9102', {equipe: ['900001', '900004'], ...fim}),
    // Caso ruim 3: a divisão (desatualizada) escolheu a Águia, e quem está na O.S. hoje é o Carlos. A Performance sugere a Águia; a vista dava o Leão.
    os('q3', '9103', {equipe: ['900004'], ...fim,
      alocacao: {desatualizada: true, grupos: [{equipeId: 'eq-aguia', cota: 10000, liderId: '900001', membros: [{pessoaId: '900001', papel: 'lider', cota: 10000}]}]}}),
    // Caso ruim 4: conferida na Performance (participação do blob) como avulsa, sem equipe: a Performance não dá equipe; a vista dava o Leão.
    os('q4', '9104', {equipe: ['900004'], ...fim}),
    // Ana e Bia, sem divisão: a composição da Águia, como sugestão.
    os('q5', '9105', {equipe: ['Ana', 'Bia'], ...fim}),
    // Conferida na Performance com o Leão: confirmada, sem a marca.
    os('q6', '9106', {equipe: ['900004'], ...fim}),
  ];
  const participacoes = [
    {id: 'q4', membros: [{chave: '900004', nome: 'Carlos', percentual: 100}], por: 'Gestão de teste', em: '2026-10-06T12:00:00Z'},
    {id: 'q6', membros: [{chave: '900004', nome: 'Carlos', percentual: 100}], equipeId: 'eq-leao', equipeNome: 'Leão', por: 'Gestão de teste', em: '2026-10-06T12:00:00Z'},
  ];
  const t = casa(lista, {erp: erpDe(lista, D), participacoes});
  t.tela('STATE._entVista = "poros"');
  const vista = t.run('Object.fromEntries(_porOSDados.linhas.map(l => [l.numero, l.equipes.map(e => e.id + (e.como === "sugerida" ? "*" : "")).join("+")]))');
  assert.deepEqual(vista, {9101: '', 9102: '', 9103: 'eq-aguia*', 9104: '', 9105: 'eq-aguia*', 9106: 'eq-leao'});
  // A mesma conta da tela da Performance (perfRegistro vestido por PERF.comEquipes), O.S. por O.S.
  const perf = t.run(`(() => { const c = perfConfig(), opcoes = {resolver: m => perfIdMembro(m)};
    return Object.fromEntries(STORE.getAllOS().map(o => { const r = PERF.comEquipes(perfUnirPessoas([perfRegistro(o, c)]), c.equipes, opcoes)[0];
      return [o.numero, (r.grupos || (r.equipeId ? [r] : [])).filter(g => g.equipeId).map(g => g.equipeId + (g.sugerida ? '*' : '')).join('+')]; })); })()`);
  assert.deepEqual(vista, perf, 'a vista e a Performance dão a mesma equipe');
  // O filtro e os chips seguem a mesma régua.
  assert.equal(cartoes(t.tela('STATE._porOS = {equipe: "eq-aguia"}')).sort().join(), '9103,9105');
  assert.equal(cartoes(t.tela('STATE._porOS = {equipe: "eq-leao"}')).sort().join(), '9106');
  const html = t.tela('STATE._porOS = {}');
  assert.match(cartao(html, '9105'), /<span class="poros-eq perf-cor-marinho perf-com-cor sugerida" title="Equipe sugerida pela Performance, ainda não confirmada">[\s\S]*?<span>Águia<\/span> <small class="poros-sugerida">sugerida<\/small><\/span>/);
  assert.match(cartao(html, '9106'), /<span class="poros-eq perf-cor-laranja perf-com-cor" title="Equipe confirmada na Performance">/);
  assert.doesNotMatch(cartao(html, '9106'), /sugerida/);
  assert.doesNotMatch(cartao(html, '9101'), /class="poros-eq[ "]/, 'só a Ana não é a Águia');
  assert.match(cartao(html, '9101'), /<span class="poros-pessoa">Ana<\/span>/, 'a pessoa continua no cartão');
});

test('revisão: a retirada no balcão não mostra comissão prevista; diz que fica fora da performance', () => {
  // Caso ruim (prova da revisão): a retirada (O.S. interna) entregue em outubro mostrava "R$ 10,00 prevista, 1% da O.S. que pontua". A Performance pula a O.S. interna.
  const lista = [
    os('r1', '5401', {tipo: 'interno', cliente: 'Retirada fictícia', finalizadaEm: '2026-10-06T18:00:00Z', finalizadoPor: 'Gestão de teste'}),
    os('r2', '5402', {tipo: 'interno', cliente: 'Retirada fictícia com prazo', prazoCombinado: {data: '2026-10-07', fonte: 'agenda'}, finalizadaEm: '2026-10-07T18:00:00Z', finalizadoPor: 'Gestão de teste'}),
    os('r3', '5404', {equipe: ['900004'], prazoCombinado: {data: '2026-10-07', fonte: 'agenda'}, finalizadaEm: '2026-10-07T18:00:00Z', finalizadoPor: 'Gestão de teste'}),
  ];
  const erp = [
    {numero: '5401', data: '2026-10-06', valor: 1000, tipo: 'interno'}, {numero: '5402', data: '2026-10-07', valor: 2500, tipo: 'interno'},
    // Só do ERP, sem ficha no aparelho: também retirada.
    {numero: '5403', data: '2026-10-08', valor: 800, tipo: 'interno'},
    {numero: '5404', data: '2026-10-07', valor: 3000, tipo: 'externo'},
  ];
  const html = casa(lista, {erp}).tela('STATE._entVista = "poros"');
  const comissao = n => (cartao(html, n).match(/<dt>Comissão prevista<\/dt><dd>([\s\S]*?)<\/dd>/) || ['', ''])[1];
  for (const n of ['5401', '5402', '5403']) assert.equal(comissao(n), '<small>retirada no balcão fica fora da performance</small>', n);
  // O valor do ERP continua (é dinheiro que entrou); a externa continua com a comissão.
  assert.match(cartao(html, '5402'), /<dt>Valor \(ERP\)<\/dt><dd><b>R\$\s?2\.500,00<\/b>/);
  assert.match(comissao('5404'), /<b>R\$\s?30,00<\/b> <small>prevista, 1% da O\.S\. que pontua/);
});

test('revisão: uma O.S. muda e só ela e as da volta dela recalculam; com 1.500 O.S. e a memória vazia, uma conta por O.S.', async () => {
  const lista = [], erp = [];
  for (let i = 0; i < 1500; i++) {
    const d = `2026-10-${String(1 + (i % 19)).padStart(2, '0')}`;
    lista.push(os('x' + i, String(20000 + i), {equipe: i % 3 ? ['900001', '900002'] : ['900004'], veiculo: 'Carro ' + (i % 40), instalacao: {data: d},
      prazoCombinado: {data: d, fonte: 'agenda'}, retornoPrevisto: [{dia: d, hora: '16:30'}], retornoConferido: {dia: d, hora: '16:00', por: 'Gestão de teste'},
      finalizadaEm: d + 'T18:00:00Z', finalizadoPor: 'Gestão de teste', atualizadoEm: d + 'T18:00:00Z'}));
    erp.push({numero: String(20000 + i), cliente: 'Cliente fictício ' + i, data: d, valor: 500 + i, tipo: 'externo'});
  }
  // A e B na mesma volta (mesmo dia, carro e equipe): o previsto mais tarde é o da A, e a perda fica nela.
  const D = '2026-10-06', volta = {equipe: ['900004'], veiculo: 'Carro da volta', instalacao: {data: D}, prazoCombinado: {data: D, fonte: 'agenda'},
    retornoConferido: {dia: D, hora: '15:00', por: 'Gestão de teste'}, finalizadaEm: D + 'T18:00:00Z', finalizadoPor: 'Gestão de teste', atualizadoEm: D + 'T18:00:00Z'};
  lista.push(os('va', '29001', {...volta, retornoPrevisto: [{dia: D, hora: '17:00'}]}), os('vb', '29002', {...volta, retornoPrevisto: [{dia: D, hora: '16:00'}]}));
  erp.push({numero: '29001', data: D, valor: 900, tipo: 'externo'}, {numero: '29002', data: D, valor: 900, tipo: 'externo'});
  const t = casa(lista, {erp});
  t.run('var __chamadas = 0; var __st = OPERACAO.statusEntrega; OPERACAO.statusEntrega = (...a) => { __chamadas++; return __st(...a); };');
  t.tela('STATE._entVista = "poros"');
  const n = t.run('_porOSDados.linhas.length');
  assert.equal(n, 1502);
  assert.equal(t.run('__chamadas'), n, 'a primeira pintura calcula cada status uma vez');
  // Caso ruim (prova da revisão): uma O.S. muda (o que um sync faz) e a pintura recalculava o status das 1.502.
  const naVolta = t.run('OPERACAO.voltaNaLista(STORE.getOS("x10"), STORE.getAllOS()).length');
  assert.ok(naVolta >= 1 && naVolta < 10, `volta da x10: ${naVolta}`);
  t.run('STORE.getOS("x10").atualizadoEm = "2026-10-20T11:00:00Z"');
  t.tela('');
  assert.equal(t.run('__chamadas') - n, naVolta, 'recalcula só a x10 e as O.S. da volta dela');
  // Nada mudou: nada recalcula.
  const antes = t.run('__chamadas');
  t.tela('');
  assert.equal(t.run('__chamadas'), antes);
  // A outra O.S. da volta acompanha, sem ela mesma mudar: o previsto da B passa a ser o mais tarde, e a perda vai para a B.
  const chave = num => t.run(`_porOSDados.linhas.find(l => l.numero === ${JSON.stringify(num)}).chave`);
  assert.deepEqual([chave('29001'), chave('29002')], ['retorno_antecipado', 'no_prazo']);
  t.run('{ const b = STORE.getOS("vb"); b.retornoPrevisto = [{dia: "2026-10-06", hora: "18:00"}]; b.atualizadoEm = "2026-10-20T11:30:00Z"; }');
  t.tela('');
  assert.deepEqual([chave('29001'), chave('29002')], ['no_prazo', 'retorno_antecipado'], 'a A segue a volta');
  const antes2 = t.run('__chamadas');
  /* Com a memória vazia, as 1.502 O.S. com chegada conferida: a vista monta
     as linhas (status, volta, pessoas e equipe de todas) e pinta a seção. O
     que cobra: uma conta de status por O.S. e uma conta da equipe da
     Performance por gente (aqui, duas), cada pintura numa volta nova do laço
     (o índice das voltas e a régua de pessoas valem uma volta). A meta de
     150 ms é do aparelho e foi medida na prévia (Chrome), com a pintura
     inteira; aqui, sozinho, o caminho frio leva ~85 ms, e com a suíte
     rodando os arquivos em paralelo chegou a 150 ms. O teto de 300 ms segura
     a volta do O(N²) (eram 1,7 s) sem fazer a suíte falhar por carga. */
  t.run('var __erp = _porOSDados.linhas.map(l => l.erp); var __perf = 0; var __pr = perfRegistro; perfRegistro = (...a) => { __perf++; return __pr(...a); };');
  let melhor = Infinity;
  for (let k = 0; k < 3; k++) {
    await tique();
    const ini = process.hrtime.bigint();
    t.run('porOSEsquecer(); porOSMontar(__erp, STORE.getAllOS(), "2026-10-20"); porOSSecaoHTML().length');
    melhor = Math.min(melhor, Number(process.hrtime.bigint() - ini) / 1e6);
  }
  assert.equal(t.run('__chamadas') - antes2, 3 * n, 'com a memória vazia, um status por O.S.');
  assert.equal(t.run('__perf'), 3 * 2, 'e uma conta da equipe por gente (900001 com 900002; 900004)');
  assert.ok(melhor < 300, `memória vazia: ${melhor.toFixed(1)} ms`);
  if (process.env.F18_MEDIR) console.log('F18 revisão, memória vazia, 1.502 O.S. (ms):', melhor.toFixed(1));
});

test('revisão: a O.S. sem ficha no aparelho ganha "Procurar no servidor"; "nunca passou pelo PCP" só depois de o servidor dizer que não tem', async () => {
  /* Caso ruim (prova da revisão): hoje é 20/10 e o aparelho guarda as
     finalizadas desde 21/08. A 5601 foi finalizada no PCP em 19/08 (fora da
     janela) e o ERP deu a entrega em 24/08 (dentro). O cartão dizia "nunca
     passou pelo PCP", com o selo "fora do PCP", e não oferecia a busca. */
  const noServidor = os('srv', '5601', {cliente: 'Instalada fictícia', equipe: ['900004'], prazoCombinado: {data: '2026-08-19', fonte: 'agenda'},
    finalizadaEm: '2026-08-19T18:00:00Z', finalizadoPor: 'Gestão de teste'});
  const pedidos = [];
  const t = casa([], {erp: [{numero: '5601', cliente: 'Instalada fictícia', data: '2026-08-24', valor: 900, tipo: 'externo'},
    {numero: '5602', cliente: 'Retirada fictícia', data: '2026-08-25', valor: 300, tipo: 'interno'}],
  estado: {_fEnt: {de: '2026-08-01', ate: '2026-08-31'}}, buscar: q => { pedidos.push(q.q); return {itens: q.q === '5601' ? [JSON.parse(JSON.stringify(noServidor))] : [], truncou: false}; }});
  const antes = t.tela('STATE._entVista = "poros"');
  assert.doesNotMatch(secao(antes), /nunca passou pelo PCP|fora do PCP/);
  assert.match(cartao(antes, '5601'), /<span class="selo-entrega se-agendado">sem ficha no aparelho<\/span>/);
  assert.match(cartao(antes, '5601'), /O\.S\. sem ficha neste aparelho, que guarda só as finalizadas no PCP nos últimos 60 dias\./);
  assert.match(cartao(antes, '5601'), /data-poros-carregar="5601">Procurar no servidor</);
  // A retirada sem ficha também procura.
  assert.match(cartao(antes, '5602'), /retirada sem ficha no aparelho/);
  assert.match(cartao(antes, '5602'), /data-poros-carregar="5602">Procurar no servidor</);
  // O servidor tem a 5601: a ficha vem e o status sai dela.
  await t.run('porOSCarregar("5601")');
  const achou = t.run('__el.innerHTML');
  assert.match(cartao(achou, '5601'), /<span class="selo-entrega se-no_prazo">No prazo<\/span>/);
  assert.match(cartao(achou, '5601'), /Carregada do servidor/);
  // O servidor não tem a 5602: só agora a frase, o selo "fora do PCP" e nada de procurar de novo.
  await t.run('porOSCarregar("5602")');
  const nao = t.run('__el.innerHTML');
  assert.match(cartao(nao, '5602'), /<span class="selo-entrega se-agendado">fora do PCP<\/span>/);
  assert.match(cartao(nao, '5602'), /O servidor também não tem esta retirada no PCP: ela saiu pelo ERP e nunca passou pelo PCP\./);
  assert.doesNotMatch(cartao(nao, '5602'), /data-poros-carregar/);
  assert.deepEqual(pedidos, ['5601', '5602']);
});

test('revisão: o status e a equipe acompanham o elenco e o vinculosRH, sem nenhuma O.S. mudar', async () => {
  const D = '2026-10-05';
  const base = (id, num, equipe, prev, veiculo) => os(id, num, {equipe, veiculo, instalacao: {data: D}, prazoCombinado: {data: D, fonte: 'agenda'},
    retornoPrevisto: [{dia: D, hora: prev}], retornoConferido: {dia: D, hora: '15:00', por: 'Gestão de teste', em: D + 'T18:05:00Z'},
    finalizadaEm: D + 'T18:00:00Z', finalizadoPor: 'Gestão de teste', atualizadoEm: D + 'T18:00:00Z'});
  const lista = [base('a', '7101', ['Ana', 'Bia'], '16:00', 'Carro 1'), base('b', '7102', ['900001', '900002'], '17:00', 'Carro 1'),
    base('c', '7103', ['Zeca'], '16:00', 'Carro 2'), base('d', '7104', ['900004'], '17:00', 'Carro 2')];
  const t = casa(lista, {erp: erpDe(lista, D), pessoas: []});
  t.tela('STATE._entVista = "poros"');
  const vista = () => t.run('Object.fromEntries(_porOSDados.linhas.map(l => [l.numero, l.chave + " " + l.equipes.map(e => e.id).join("+")]))');
  /* Sem o elenco do RH, "Ana" e "Bia" são só nomes: cada O.S. é uma volta
     sozinha, as quatro voltaram cedo, e a 7101 não tem equipe. Os IDs já
     são gente: 900001 e 900002 são a Águia; 900004, o Leão. */
  assert.deepEqual(vista(), {7101: 'retorno_antecipado ', 7102: 'retorno_antecipado eq-aguia', 7103: 'retorno_antecipado ', 7104: 'retorno_antecipado eq-leao'});
  // Caso ruim (prova da revisão): o elenco chega e "Ana" e "Bia" são a 900001 e a 900002. Nenhuma O.S. mudou; a vista ficava com o status velho.
  t.pessoas.push(...PESSOAS());
  await tique();
  t.tela('');
  assert.deepEqual(vista(), {7101: 'no_prazo eq-aguia', 7102: 'retorno_antecipado eq-aguia', 7103: 'retorno_antecipado ', 7104: 'retorno_antecipado eq-leao'},
    'a 7101 e a 7102 são a mesma volta (a perda fica na do último previsto) e a mesma equipe');
  // O vinculosRH liga o "Zeca" ao 900004 (Carlos): a 7103 entra na volta da 7104 e na equipe dela.
  t.cfg.vinculosRH = [{apelido: 'Zeca', id: '900004', por: 'Gestão de teste', em: '2026-10-10T12:00:00Z'}];
  await tique();
  t.tela('');
  assert.deepEqual(vista()[7103], 'no_prazo eq-leao');
});

test('revisão: a repintura completa devolve o foco ao mesmo controle; com o select da equipe em foco, ela espera o foco sair', async () => {
  const lista = [os('np', '5001', {equipe: ['Ana', 'Bia'], prazoCombinado: {data: '2026-10-05', fonte: 'agenda'}, finalizadaEm: '2026-10-05T18:00:00Z', finalizadoPor: 'Gestão de teste'})];
  const t = casa(lista, {erp: erpDe(lista, '2026-10-05')});
  t.tela('STATE._entVista = "poros"');
  // Um DOM mínimo: a seção da vista acha o elemento pelo seletor e anota quem ganhou o foco.
  t.run(`var __focados = [];
    var __sec = {contains: x => !!x && x.__naVista === true, querySelector: s => ({focus() { __focados.push(s); }, setSelectionRange() {}})};
    document.getElementById = id => id === 'panel-entregas' ? __el : id === 'ent-poros' ? __sec : null;
    var __elem = (tag, attrs) => ({__naVista: true, tagName: tag, id: attrs.id || '', parentElement: attrs.pai || null, __ouv: {},
      getAttribute: n => (Object.prototype.hasOwnProperty.call(attrs, n) ? attrs[n] : null), addEventListener(tipo, fn) { this.__ouv[tipo] = fn; }});`);
  // Caso ruim (prova da revisão): o foco no chip, no "Mostrar mais" ou no select ia para o corpo da página a cada repintura (~10 s).
  for (const [nome, elemento, seletor] of [
    ['chip de status', `__elem('BUTTON', {'data-poros-status': 'no_prazo'})`, '[data-poros-status="no_prazo"]'],
    ['Mostrar mais', `__elem('BUTTON', {'data-poros-mais': ''})`, '[data-poros-mais]'],
    ['Abrir a ficha', `__elem('BUTTON', {'data-os-id': 'np'})`, '[data-os-id="np"]'],
    ['linha do tempo', `__elem('SUMMARY', {pai: __elem('DETAILS', {'data-poros-tl': 'np'})})`, 'details[data-poros-tl="np"] > summary'],
    ['busca', `__elem('INPUT', {id: 'poros-busca'})`, '#poros-busca'],
  ]) {
    t.run(`__focados = []; document.activeElement = ${elemento};`);
    t.tela('');
    assert.deepEqual(t.run('__focados'), [seletor], nome);
  }
  // Fora da vista, nada é tocado.
  t.run(`__focados = []; document.activeElement = {tagName: 'BUTTON', id: 'outro', getAttribute: () => null};`);
  t.tela('');
  assert.deepEqual(t.run('__focados'), []);
  // O select da equipe com a lista aberta: a repintura espera (trocar o select fechava a lista na mão de quem escolhia).
  t.run(`document.activeElement = __elem('SELECT', {id: 'poros-equipe'}); __el.innerHTML = 'esperando';`);
  assert.equal(t.tela(''), 'esperando', 'com o select em foco, a repintura espera');
  assert.equal(t.tela(''), 'esperando', 'e a segunda também');
  // O foco sai do select: repinta na volta seguinte do laço (depois do clique que tirou o foco).
  t.run('var __sel = document.activeElement; document.activeElement = null; __sel.__ouv.blur();');
  assert.equal(t.run('__el.innerHTML'), 'esperando');
  await tique();
  assert.match(t.run('__el.innerHTML'), /<section class="poros"/);
});

test('revisão: o retrabalho do diário vira a marca "no diário" do fato, não uma linha repetida', () => {
  // Caso ruim (prova da revisão): "Retrabalho marcado" e, um minuto depois, "Gestão de teste alterou | retrabalho", o mesmo ato.
  const o = os('rt', '5701', {equipe: ['900001'], prazoCombinado: {data: '2026-10-05', fonte: 'agenda'}, retrabalho: true, problema: 'Placa fictícia torta',
    retrabalhoPerguntado: {resposta: 'sim', em: '2026-10-05T18:01:00Z', por: 'Gestão de teste'}, finalizadaEm: '2026-10-05T18:00:00Z', finalizadoPor: 'Gestão de teste'});
  const t = casa([o]);
  const diario = [
    {id: 'd9', em: '2026-10-05T18:01:05Z', acao: 'alterar', autor: {nome: 'Gestão de teste'}, campos: ['retrabalho', 'finalizadaEm', 'finalizadoPor'], antes: {retrabalho: false}, depois: {retrabalho: true}},
    {id: 'd10', em: '2026-10-05T18:02:00Z', acao: 'alterar', autor: {nome: 'Gestão de teste'}, campos: ['retrabalhoPerguntado'], antes: {}, depois: {}},
  ];
  const ev = t.run(`POR_OS.linhaDoTempo(STORE.getOS('rt'), {st: OPERACAO.statusEntrega(STORE.getOS('rt'), '2026-10-20'), diario: ${JSON.stringify(diario)}})`);
  const titulos = ev.map(e => e.titulo);
  assert.ok(!titulos.some(x => /alterou/.test(x)), titulos.join(' | '));
  assert.equal(titulos.filter(x => x === 'Retrabalho marcado').length, 1);
  assert.equal(ev.find(e => e.titulo === 'Retrabalho marcado').noDiario, 'Gestão de teste');
  assert.equal(ev.find(e => e.titulo === 'Finalizada no PCP').noDiario, 'Gestão de teste');
});

test('revisão: "Sem ninguém na equipe" não traz a retirada no balcão nem a O.S. cancelada', () => {
  const lista = [
    os('b', '5102', {equipe: ['900004'], finalizadaEm: '2026-10-05T18:00:00Z', finalizadoPor: 'G'}),
    // Caso ruim (prova da revisão): a retirada não tem equipe por natureza, e a cancelada saiu da Performance; as duas entravam no filtro.
    os('c', '5103', {tipo: 'interno', cliente: 'Retirada fictícia', finalizadaEm: '2026-10-06T18:00:00Z', finalizadoPor: 'G'}),
    os('d', '5104', {cancelamento: {ativo: true, motivo: 'Cliente desistiu do serviço fictício', por: 'G', em: '2026-10-07T12:00:00Z'}}),
    os('e', '5105', {finalizadaEm: '2026-10-08T18:00:00Z', finalizadoPor: 'G'}),
  ];
  const erp = [
    {numero: '5102', data: '2026-10-05', valor: 100, tipo: 'externo'}, {numero: '5103', data: '2026-10-06', valor: 100, tipo: 'interno'},
    {numero: '5104', data: '2026-10-07', valor: 100, tipo: 'externo'}, {numero: '5105', data: '2026-10-08', valor: 100, tipo: 'externo'},
    {numero: '5106', data: '2026-10-09', valor: 100, tipo: 'externo'},
  ];
  const t = casa(lista, {erp});
  t.tela('STATE._entVista = "poros"');
  assert.equal(cartoes(t.tela('STATE._porOS = {equipe: "_sem"}')).join(), '5105', 'só a O.S. com ficha, de instalação, viva e sem ninguém');
  // As duas continuam na vista, cada uma no status dela.
  assert.equal(cartoes(t.tela('STATE._porOS = {status: "cancelado"}')).join(), '5104');
  assert.ok(cartoes(t.tela('STATE._porOS = {}')).includes('5103'));
});

test('revisão: período sem O.S. com filtro ligado: sem o aviso do topo (a vista não está na tela) e com "Limpar filtros"', () => {
  const t = casa([os('a', '5201', {finalizadaEm: '2026-10-05T18:00:00Z', finalizadoPor: 'G'})], {erp: [{numero: '5201', data: '2026-10-05', valor: 100, tipo: 'externo'}]});
  t.tela('STATE._entVista = "poros"; STATE._porOS = {status: "no_prazo"}');
  // Caso ruim (prova da revisão): agosto não tem entrega; o aviso dizia que o número com os filtros estava "na própria vista, mais abaixo", e não havia vista.
  const h = t.tela('STATE._fEnt = {de: "2026-08-01", ate: "2026-08-31"}');
  assert.equal(secao(h), '', 'o período não tem O.S.: a vista não aparece');
  assert.doesNotMatch(h, /ent-kpi-aviso/);
  assert.match(h, /<p class="poros-vazio" id="ent-poros-vazio">Os filtros da vista Por O\.S\. continuam ligados e valem quando o período tiver O\.S\. <button type="button" class="btn-ghost btn-sm" data-poros-limpar>Limpar filtros<\/button><\/p>/);
  // Limpar: os filtros zeram e a tela repinta sem o botão.
  t.run('porOSLimparFiltros()');
  assert.deepEqual(t.run('[STATE._porOS.status, STATE._porOS.equipe, STATE._porOS.busca]'), ['', '', '']);
  assert.doesNotMatch(t.run('__el.innerHTML'), /data-poros-limpar|ent-poros-vazio/);
  // Com O.S. no período e o filtro ligado, o aviso volta (a vista está logo abaixo).
  const outubro = t.tela('STATE._fEnt = {de: "2026-10-01", ate: "2026-10-20"}; STATE._porOS.status = "no_prazo"');
  assert.match(outubro, /<p class="ent-kpi-aviso" id="ent-kpi-poros" role="status">Estes cartões/);
  assert.ok(secao(outubro));
});

test('revisão (junção com a F17): sem a app.js, a regra do status é a do dia do serviço, nunca a de hoje', () => {
  // Entregue em 20/09 com atraso, vista em 20/10: setembro fica fora do programa (decisão do dono), e a regra de hoje punha a perda.
  const o = os('s1', '7001', {equipe: ['900004'], prazoCombinado: {data: '2026-09-18', fonte: 'agenda'}, finalizadaEm: '2026-09-20T18:00:00Z', finalizadoPor: 'G'});
  const t = casa([o], {erp: [{numero: '7001', data: '2026-09-20', valor: 5000, tipo: 'externo'}], estado: {_fEnt: {de: '2026-09-01', ate: '2026-09-30'}}});
  t.tela('STATE._entVista = "poros"');
  assert.ok(t.run('(REGRAS.regraVigente(versoesRegrasCasa(), "2026-10-20") || {perdas: []}).perdas.includes("atraso")'), 'a regra de outubro pune o atraso');
  assert.equal(t.run('REGRAS.regraVigente(versoesRegrasCasa(), "2026-09-20")'), null, 'setembro não tem regra do programa');
  const st = t.run('_porOSDados.linhas[0].st');
  assert.equal(st.estado, 'atraso');
  assert.deepEqual(st.perdas, [], 'a regra é a do dia da entrega (20/09), como no diaDaRegraDe da app.js');
});

test('revisão (junção com a F17): a linha do tempo mostra a chegada de cada dia da jornada, e o abono do retorno de um dia leva o rótulo dele', () => {
  const D1 = '2026-10-05', D2 = '2026-10-06';
  const o = os('j', '7301', {equipe: ['900004'], veiculo: 'Carro 1', instalacao: {data: D1, duracaoDias: 2}, prazoCombinado: {data: D2, fonte: 'agenda'},
    retornoPrevisto: [{dia: D1, hora: '17:00'}, {dia: D2, hora: '23:30'}],
    // O segundo dia voltou depois da meia-noite: o carro chegou em 07/10 às 00:40.
    chegadasConferidas: [{dia: D1, hora: '15:00', por: 'Gestão de teste', em: D1 + 'T18:10:00Z'}, {dia: D2, hora: '00:40', diaChegada: '2026-10-07', por: 'Gestão de teste', em: '2026-10-07T03:50:00Z'}],
    retornoConferido: {dia: D2, hora: '00:40', diaChegada: '2026-10-07', por: 'Gestão de teste', em: '2026-10-07T03:50:00Z'},
    abonos: [{id: 'ab-ficticio09', ocorrenciaId: 'j:retorno_antecipado:2026-10-04', motivo: 'Cliente liberou o local mais cedo', por: 'Gestão de teste', em: '2026-10-05T19:00:00Z',
      medida: {dia: '2026-10-04', chegada: '2026-10-04T15:00', previsto: '2026-10-04T17:00'}}],
    finalizadaEm: '2026-10-07T04:00:00Z', finalizadoPor: 'Gestão de teste'});
  const t = casa([o]);
  const ev = t.run(`POR_OS.linhaDoTempo(STORE.getOS('j'), {st: OPERACAO.statusEntrega(STORE.getOS('j'), '2026-10-20')})`);
  // Caso ruim: uma chegada só (a do último dia), no dia da jornada (06/10 00:40), em vez de 07/10.
  const chegadas = ev.filter(e => e.titulo === 'Chegada do carro conferida').map(e => [e.data, e.hora]);
  assert.deepEqual(chegadas, [['05/10/26', '15:00'], ['07/10/26', '00:40']]);
  assert.match(ev.find(e => e.titulo === 'Chegada do carro conferida').detalhe, /05\/10: chegou às 15:00, 2 h antes/);
  // O abono aponta para um dia que hoje não tem a ocorrência: o rótulo vem do tipo no id ('osId:retorno_antecipado:dia'), não do dia.
  assert.ok(ev.some(e => e.titulo === 'Abono: Retorno antecipado'), ev.map(e => e.titulo).join(' | '));
});
