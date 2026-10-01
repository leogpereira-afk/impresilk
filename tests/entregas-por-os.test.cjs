/* ENTREGAS: A VISTA "POR O.S." (F18, 30/09/2026).
 *
 * Uma terceira vista dentro de Entregas: um cartão por O.S. da lista do ERP
 * no período, com status, prazo × entrega, retorno previsto × conferido,
 * equipe com cor e logo, valor e comissão prevista (só admin e pcp) e a linha
 * do tempo única. O que estes testes cobram (o plano, F18):
 *  - os cartões do topo e o total do mês são os mesmos com e sem a vista e
 *    os filtros dela (a lista do ERP continua sendo a verdade);
 *  - o filtro de status usa a statusEntrega; o de equipe, o ID (equipeId da
 *    divisão ou o ID das pessoas, nunca o nome);
 *  - a busca acha por número, cliente e pessoa (nome ou ID);
 *  - o número da vista acompanha o filtro e o topo diz que não acompanha;
 *  - a operação não vê R$;
 *  - a linha do tempo fica em ordem, sem duplicata e no fuso da fábrica,
 *    qualquer que seja o fuso do aparelho;
 *  - com 500 O.S., cada toque repinta em menos de 100 ms.
 * Tudo com dados fictícios (o repositório é público).
 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = path.join(__dirname, '..');
const AGORA = '2026-10-20T12:00:00-03:00';

const EQUIPES = [
  {id: 'eq-aguia', nome: 'Águia', animal: 'aguia', cor: 'marinho', membros: [{chave: '900001'}, {chave: '900002'}], ativo: true},
  {id: 'eq-leao', nome: 'Leão', animal: 'leao', cor: 'laranja', membros: [{chave: '900004'}], ativo: true},
];
const PESSOAS = [
  {id: '900001', nome: 'Ana Paula Fictícia', apelido: 'Ana'},
  {id: '900002', nome: 'Beatriz Lima Teste', apelido: 'Bia'},
  {id: '900004', nome: 'Carlos Prado Exemplo', apelido: 'Carlos'},
];

/* O mesmo arranjo de tests/entregas-vitrine.test.cjs, com os arquivos que a
   vista lê. O performance.js entra (revisão da F18): a equipe da vista é a da
   Performance (perfRegistro), e o index.html o carrega antes da vista. */
function casa(lista, {erp = [], papel = 'pcp', agora = AGORA, equipes = EQUIPES, pessoas = PESSOAS, hist = [], buscar = null, estado = {}} = {}) {
  const historico = hist.slice();
  const ctx = vm.createContext({
    console,
    Date: class extends Date { constructor(...a) { super(...(a.length ? a : [agora])); } static now() { return +new Date(agora); } },
    STORE: {
      JANELA_LOCAL_DIAS: 60,
      getAllOS: () => lista, getOS: id => lista.find(o => o.id === id) || historico.find(o => o.id === id) || null,
      getCFG: () => ({instaladores: [], performancePCP: {equipes}}),
      elenco: () => ({pessoas, veiculos: [], ferias: [], ausencias: []}),
      entreguesMes: m => ({v: 3, os: erp.filter(o => String(o.data).slice(0, 7) === m), em: '2026-10-20T10:00:00'}),
      pullEntreguesMes() {}, anosEntregues: () => [2026], valores: () => ({}),
      historico: () => historico,
      buscarHistorico: async q => { const r = buscar ? buscar(q) : {itens: []}; for (const o of r.itens || []) historico.push(o); return r; },
    },
    STATE: {user: {papel, nome: 'Gestão de teste'}, _fEnt: {de: '2026-10-01', ate: '2026-10-20'}, ...estado},
    document: {getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: {classList: {add() {}, remove() {}, contains: () => false}}},
    localStorage: {getItem: () => null, setItem() {}, removeItem() {}},
    esc: s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[ch])),
    emptyState: (i, t) => `<div class="vazio">${t}</div>`, bindCardClicks() {}, toast() {}, fmtInstalacao: () => '', filtroPeriodoHTML: () => '',
    parseLocalDate: () => null, pessoaDoElenco: () => null,
  });
  for (const f of ['operacao.js', 'divisao.js', 'regras.js', 'entrega-item.js', 'casa.js', 'relatorios-entregas.js', 'performance.js', 'entregas-os.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, {filename: f});
  vm.runInContext(`OPERACAO.usarPessoas(() => ({pessoas: STORE.elenco().pessoas, vinculos: [], lista: []}));
    var wireFiltroPeriodo = () => {}; var wireQuadrosCasa = () => {};
    var __el = {innerHTML: '', querySelectorAll: () => [], querySelector: () => ({value: ''})};
    document.getElementById = id => id === 'panel-entregas' ? __el : null;`, ctx);
  const run = code => vm.runInContext(code, ctx);
  return {run, ctx, tela: (prepara = '') => run(`${prepara}; renderEntregas(); __el.innerHTML`)};
}
const kpis = html => (html.match(/<div class="ent-kpis">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/) || [''])[0];
const secao = html => (html.match(/<section class="poros"[\s\S]*?<\/section>/) || [''])[0];
const cartoes = html => [...secao(html).matchAll(/<article class="poros-card[^"]*" aria-label="O\.S ([^"]+)">/g)].map(m => m[1]);
// O R$ do toLocaleString vem com espaço sem quebra; aqui vira espaço comum.
const resumo = html => ((secao(html).match(/<p class="poros-resumo"[^>]*>([\s\S]*?)<\/p>/) || ['', ''])[1]).replace(/<[^>]+>/g, '').replace(/\u00a0/g, ' ');

// O.S. fictícias: uma de cada estado, todas entregues no período segundo o ERP.
const os = (id, numero, extra = {}) => ({id, numero, tipo: 'externo', cliente: 'Cliente fictício ' + numero, servico: 'Fachada fictícia', equipe: [], ...extra});
const noPrazo = os('np', '5001', {cliente: 'Padaria Fictícia', endereco: 'Rua Inventada, 10', equipe: ['Ana', 'Bia'], instalacao: {data: '2026-10-05'}, prazoCombinado: {data: '2026-10-05', fonte: 'agenda'},
  finalizadaEm: '2026-10-05T18:00:00Z', finalizadoPor: 'Gestão de teste'});
const atrasada = os('at', '5002', {equipe: ['900004'], instalacao: {data: '2026-10-08'}, prazoCombinado: {data: '2026-10-06', fonte: 'agenda'},
  finalizadaEm: '2026-10-08T18:00:00Z', finalizadoPor: 'Gestão de teste'});
/* O abono carimbado guarda a medida que abonou (revisão da F17, decidida): no
   atraso, o prazo e a data da entrega. O servidor sempre carimba a medida
   (guardarAbonos); o abono sem ela é "de outra medida" e não vale. Este
   fixture era de antes dessa regra e vinha sem a medida: a junção F17+F18
   deixou a 5003 como atraso comum, e três testes ficaram vermelhos pelo
   fixture, não pela vista. */
const abonada = os('ab', '5003', {equipe: ['900004'], instalacao: {data: '2026-10-09'}, prazoCombinado: {data: '2026-10-07', fonte: 'agenda'},
  finalizadaEm: '2026-10-09T18:00:00Z', finalizadoPor: 'Gestão de teste',
  abonos: [{id: 'ab-ficticio01', ocorrenciaId: 'ab:atraso', motivo: 'Cliente pediu para remarcar a instalação', por: 'Gestão de teste', em: '2026-10-09T19:00:00Z',
    medida: {prazo: '2026-10-07', entrega: '2026-10-09'}}]});
// Retrabalho E atraso: a precedência da statusEntrega diz Retrabalho; o filtro "Com atraso" não a pega.
const retrab = os('rt', '5004', {equipe: ['Ana'], instalacao: {data: '2026-10-10'}, prazoCombinado: {data: '2026-10-08', fonte: 'agenda'},
  finalizadaEm: '2026-10-10T18:00:00Z', finalizadoPor: 'Gestão de teste', retrabalho: true, problema: 'Placa desalinhada'});
const cancelada = os('cc', '5005', {cancelamento: {ativo: true, motivo: 'Cliente desistiu do serviço fictício', por: 'Gestão de teste', em: '2026-10-11T12:00:00Z'}});
const aberta = os('ae', '5006', {equipe: ['Ana'], instalacao: {data: '2026-10-25'}, prazoCombinado: {data: '2026-10-25', fonte: 'agenda'}});
const LISTA = () => [noPrazo, atrasada, abonada, retrab, cancelada, aberta].map(o => JSON.parse(JSON.stringify(o)));
const ERP = [
  {numero: '5001', cliente: 'Padaria Fictícia', data: '2026-10-05', valor: 2000, tipo: 'externo'},
  {numero: '5002', cliente: 'Cliente fictício 5002', data: '2026-10-08', valor: 1000, tipo: 'externo'},
  {numero: '5003', cliente: 'Cliente fictício 5003', data: '2026-10-09', valor: 1500, tipo: 'externo'},
  {numero: '5004', cliente: 'Cliente fictício 5004', data: '2026-10-10', valor: 800, tipo: 'externo'},
  {numero: '5005', cliente: 'Cliente fictício 5005', data: '2026-10-11', valor: 700, tipo: 'externo'},
  {numero: '5006', cliente: 'Cliente fictício 5006', data: '2026-10-12', valor: 600, tipo: 'externo'},
  {numero: '5007', cliente: 'Só do ERP fictício', data: '2026-10-13', valor: null, tipo: 'interno'},
];

test('os cartões do topo e o total do mês são os mesmos na Tabela e na Por O.S., com e sem os filtros dela', () => {
  const t = casa(LISTA(), {erp: ERP});
  const antes = t.tela();
  const topo = kpis(antes);
  assert.ok(topo, 'a faixa de cartões existe');
  // O total do mês é a soma do ERP (6.600; a 5007 sem valor fica fora e é contada).
  assert.match(topo, /R\$\s?6\.600,00/);
  const porOS = t.tela('STATE._entVista = "poros"');
  assert.equal(kpis(porOS), topo, 'trocar para a vista não muda os cartões');
  const filtrada = t.tela('STATE._porOS = {status: "atraso", equipe: "eq-leao", busca: "5002"}');
  assert.equal(kpis(filtrada), topo, 'os filtros da vista não mudam os cartões');
  assert.equal(cartoes(filtrada).join(), '5002');
  // E a Tabela continua igual depois de passar pela vista.
  assert.equal(kpis(t.tela('STATE._entVista = "tabela"')), topo);
});

test('o filtro de status usa a statusEntrega: a mesma chave do selo, com o abonado separado e a precedência dela', () => {
  const t = casa(LISTA(), {erp: ERP});
  t.tela('STATE._entVista = "poros"');
  const linhas = t.run('_porOSDados.linhas.map(l => [l.numero, l.chave, l.card ? OPERACAO.statusEntrega(l.card).estado : ""])');
  const porNumero = Object.fromEntries(linhas.map(([n, k]) => [n, k]));
  assert.deepEqual(porNumero, {5001: 'no_prazo', 5002: 'atraso', 5003: 'atraso_abonado', 5004: 'retrabalho', 5005: 'cancelado', 5006: 'agendado', 5007: 'sem_ficha'});
  for (const [n, chave, estado] of linhas) if (estado) assert.equal(chave.replace('_abonado', ''), estado, `O.S ${n}: a chave vem do estado da statusEntrega`);
  assert.equal(cartoes(t.tela('STATE._porOS = {status: "atraso"}')).join(), '5002', 'Com atraso: a abonada e a de retrabalho (que também atrasou) ficam de fora');
  assert.equal(cartoes(t.tela('STATE._porOS = {status: "atraso_abonado"}')).join(), '5003');
  assert.equal(cartoes(t.tela('STATE._porOS = {status: "retrabalho"}')).join(), '5004');
  assert.equal(cartoes(t.tela('STATE._porOS = {status: "cancelado"}')).join(), '5005');
  // Os chips contam pelo mesmo estado e seguem os outros filtros.
  const html = t.tela('STATE._porOS = {status: "", busca: "5002"}');
  assert.match(secao(html), /data-poros-status="atraso" aria-pressed="false">Com atraso <b>1<\/b>/);
  assert.doesNotMatch(secao(html), /data-poros-status="no_prazo"/, 'chip sem O.S. com o filtro some');
  // Mudou a O.S. (abono revogado): a próxima pintura relê o status.
  t.run('STORE.getOS("ab").abonos[0].revogadoEm = "2026-10-12T12:00:00Z"; STORE.getOS("ab").atualizadoEm = "2026-10-12T12:00:00Z"');
  assert.equal(cartoes(t.tela('STATE._porOS = {status: "atraso"}')).join(), '5003,5002');
});

/* Revisão da F18 (decidida): a equipe da vista é a que a Performance conta
   (perfRegistro: a divisão confirmada, a participação confirmada ou a
   sugestão da apuração), e a sugerida vem marcada. Este teste fixava a régua
   antiga da vista (a divisão desatualizada voltava às pessoas, e as pessoas
   davam a equipe por qualquer integrante em comum); a 6004 agora é da
   equipe que a divisão escolheu (Águia, sugerida), como na Performance. */
test('o filtro de equipe usa o ID: o equipeId da divisão, ou as pessoas pelo ID, nunca o nome', () => {
  const lista = [
    // Ana e Bia pelo apelido: o ID delas (900001 e 900002) é a composição da Águia (sugerida).
    os('p1', '6001', {equipe: ['Ana', 'Bia'], finalizadaEm: '2026-10-05T18:00:00Z'}),
    // "Ana Fictícia Outra" não é ficha de ninguém: o nome parecido não põe a O.S. na Águia.
    os('p2', '6002', {equipe: ['Ana Fictícia Outra'], finalizadaEm: '2026-10-05T18:00:00Z'}),
    // A divisão diz Leão: vale a divisão, mesmo com gente da Águia na O.S.
    os('p3', '6003', {equipe: ['900001'], finalizadaEm: '2026-10-05T18:00:00Z',
      alocacao: {grupos: [{equipeId: 'eq-leao', cota: 10000, liderId: '900001', membros: [{pessoaId: '900001', papel: 'lider', cota: 10000}]}]}}),
    // Divisão desatualizada (a equipe mudou depois): vale a equipe que a divisão escolheu, como sugestão (a régua da Performance).
    os('p4', '6004', {equipe: ['900004'], finalizadaEm: '2026-10-05T18:00:00Z',
      alocacao: {desatualizada: true, grupos: [{equipeId: 'eq-aguia', cota: 10000, liderId: '900001', membros: [{pessoaId: '900001', papel: 'lider', cota: 10000}]}]}}),
    os('p5', '6005', {equipe: [], finalizadaEm: '2026-10-05T18:00:00Z'}),
  ];
  const erp = lista.map(o => ({numero: o.numero, cliente: o.cliente, data: '2026-10-05', valor: 100, tipo: 'externo'}));
  // A Águia trocou de nome depois: o filtro é pelo id, então nada muda.
  const equipes = [{...EQUIPES[0], nome: 'Águia Dourada'}, EQUIPES[1]];
  const t = casa(lista, {erp, equipes});
  t.tela('STATE._entVista = "poros"');
  assert.equal(cartoes(t.tela('STATE._porOS = {equipe: "eq-aguia"}')).sort().join(), '6001,6004');
  assert.equal(cartoes(t.tela('STATE._porOS = {equipe: "eq-leao"}')).sort().join(), '6003');
  assert.equal(cartoes(t.tela('STATE._porOS = {equipe: "_sem"}')).sort().join(), '6005');
  const html = t.tela('STATE._porOS = {}');
  assert.match(html, /<span class="poros-eq perf-cor-marinho perf-com-cor sugerida"[^>]*>[\s\S]*?<span>Águia Dourada<\/span> <small class="poros-sugerida">sugerida<\/small>/, 'chip com a cor da equipe, o nome de hoje e a marca de sugerida');
  assert.match(html, /<span class="poros-eq perf-cor-laranja perf-com-cor" title="Equipe da divisão da O.S."/);
});

test('a busca acha por número, cliente (sem acento) e pessoa, pelo nome ou pelo ID', () => {
  const t = casa(LISTA(), {erp: ERP});
  t.tela('STATE._entVista = "poros"');
  const achar = b => cartoes(t.tela(`STATE._porOS = {busca: ${JSON.stringify(b)}}`)).sort().join();
  assert.equal(achar('5003'), '5003');
  assert.equal(achar('padaria ficticia'), '5001', 'sem acento e sem caixa');
  assert.equal(achar('Só do ERP'), '5007', 'a O.S. só do ERP também é achada pelo cliente');
  assert.equal(achar('bia'), '5001', 'pelo apelido');
  assert.equal(achar('Beatriz Lima'), '5001', 'pelo nome da ficha');
  assert.equal(achar('900004'), '5002,5003', 'pelo ID');
  assert.equal(achar('carlos'), '5002,5003');
  assert.equal(achar('ana 5004'), '5004', 'cada palavra tem de casar');
  assert.equal(achar('ninguém fictício xyz'), '');
  assert.match(secao(t.tela('STATE._porOS = {busca: "xyz"}')), /Nenhuma O\.S\. com estes filtros\./);
});

test('o número da vista acompanha o filtro, e o topo diz que não acompanha', () => {
  const t = casa(LISTA(), {erp: ERP});
  const semFiltro = t.tela('STATE._entVista = "poros"');
  assert.equal(resumo(semFiltro), '7 O.S. entregues no período, a mesma lista da Tabela · R$ 6.600,00 1 sem valor.');
  assert.match(semFiltro, /<p class="ent-kpi-aviso" id="ent-kpi-poros" role="status" hidden><\/p>/, 'sem filtro, o aviso do topo fica escondido');
  const com = t.tela('STATE._porOS = {status: "atraso"}');
  assert.equal(resumo(com), '1 de 7 O.S. do período, com os filtros desta vista · R$ 1.000,00. Os cartões do topo não mudam com estes filtros.');
  const aviso = (com.match(/<p class="ent-kpi-aviso"[^>]*>[\s\S]*?<\/p>/) || [''])[0];
  assert.doesNotMatch(aviso, /hidden/);
  assert.match(aviso, /não seguem os filtros da vista Por O\.S\./);
  // O aviso mora logo abaixo dos cartões, antes da fila e dos controles.
  assert.ok(com.indexOf('ent-kpi-aviso') > com.indexOf('ent-kpis') && com.indexOf('ent-kpi-aviso') < com.indexOf('ent-controles'));
  // Os filtros moram no STATE: a repintura completa (a cada mês do ERP) mantém o chip e a busca.
  const de_novo = t.tela('STATE._porOS.busca = "5002"');
  assert.match(de_novo, /data-poros-status="atraso" aria-pressed="true"/);
  assert.match(de_novo, /id="poros-busca" value="5002"/);
  assert.equal(cartoes(de_novo).join(), '5002');
});

test('operação, montagem e comercial não veem R$ nem comissão na vista; admin e pcp veem, com "prevista"', () => {
  for (const papel of ['operacao', 'montagem', 'comercial']) {
    const t = casa(LISTA(), {erp: ERP, papel});
    const html = secao(t.tela('STATE._entVista = "poros"; STATE._porOS = {abertas: ["np", "at"]}'));
    assert.ok(cartoes(html).length === 7, papel);
    assert.doesNotMatch(html, /R\$|Valor \(ERP\)|omissão|sem valor/, `${papel} não vê dinheiro`);
  }
  for (const papel of ['admin', 'pcp']) {
    const html = secao(casa(LISTA(), {erp: ERP, papel}).tela('STATE._entVista = "poros"'));
    assert.match(html, /<dt>Valor \(ERP\)<\/dt><dd><b>R\$\s?2\.000,00<\/b>/);
    assert.match(html, /<dt>Comissão prevista<\/dt><dd><b>R\$\s?20,00<\/b> <small>prevista, 1% da O\.S\. que pontua, regra provisória<\/small>/);
  }
});

test('comissão prevista: 1% só na O.S. que pontua, a partir de 01/10; antes disso, não se aplica', () => {
  const t = casa(LISTA(), {erp: ERP});
  const html = secao(t.tela('STATE._entVista = "poros"'));
  const fato = n => ((html.split(`aria-label="O.S ${n}"`)[1] || '').match(/<dt>Comissão prevista<\/dt><dd>([\s\S]*?)<\/dd>/) || ['', ''])[1];
  assert.match(fato('5001'), /R\$\s?20,00/);
  assert.match(fato('5002'), /R\$\s?0,00<\/b> <small>prevista: não pontua \(atraso\)/);
  assert.match(fato('5003'), /R\$\s?15,00/, 'o atraso abonado pontua');
  assert.match(fato('5004'), /não pontua \(retrabalho e atraso\)/);
  assert.match(fato('5005'), /cancelada, não pontua/);
  assert.match(fato('5006'), /a entrega ainda não foi registrada no PCP/);
  // Baixa do ERP ainda a lançar: sem a data da entrega, nada de valor previsto.
  const baixa = casa([os('bx', '7002', {equipe: ['Ana'], prazoCombinado: {data: '2026-10-10', fonte: 'agenda'}, finalizadaEm: '2026-10-12T18:00:00Z', finalizadoPor: 'Mubisys (auto)',
    baixaAutoERP: {em: '2026-10-12T18:00:00Z', status: 'ENTREGUE'}})], {erp: [{numero: '7002', cliente: 'Baixa fictícia', data: '2026-10-12', valor: 3000, tipo: 'externo'}]});
  const bx = secao(baixa.tela('STATE._entVista = "poros"'));
  assert.match(bx, /Entregue \(baixa do ERP a lançar\)/);
  assert.match(bx, /<dt>Comissão prevista<\/dt><dd><small>sai depois do lançamento: sem a data da entrega, o prazo ainda não foi julgado<\/small>/);
  // Setembro fica na regra atual.
  const set = casa([os('s1', '7001', {prazoCombinado: {data: '2026-09-20', fonte: 'agenda'}, finalizadaEm: '2026-09-20T18:00:00Z'})],
    {erp: [{numero: '7001', cliente: 'Setembro fictício', data: '2026-09-20', valor: 5000, tipo: 'externo'}], estado: {_fEnt: {de: '2026-09-01', ate: '2026-09-30'}}});
  assert.match(secao(set.tela('STATE._entVista = "poros"')), /<dt>Comissão prevista<\/dt><dd><small>não se aplica: entregue em 20\/09\/26, antes de 01\/10\/2026 \(fica na regra atual\)<\/small>/);
});

test('o cartão traz nº, cliente, endereço, prazo × entrega, retorno previsto × conferido e a equipe; Técnico e Tipo saem da vista', () => {
  const lista = LISTA();
  Object.assign(lista[0], {retornoPrevisto: [{dia: '2026-10-05', hora: '16:30'}], retornoConferido: {dia: '2026-10-05', hora: '15:40', por: 'Gestão de teste', em: '2026-10-05T18:41:00Z'}, horaRetorno: '17:00'});
  const t = casa(lista, {erp: ERP});
  const html = t.tela('STATE._entVista = "poros"');
  const card = (secao(html).split('aria-label="O.S 5001"')[1] || '').split('</article>')[0];
  assert.match(card, /<strong>O\.S 5001<\/strong><span class="selo-entrega se-retorno_antecipado">Retorno antecipado<\/span>/);
  assert.match(card, /Padaria Fictícia/);
  assert.match(card, /📍<\/span> Rua Inventada, 10/);
  assert.match(card, /<dt>Prazo × entrega<\/dt><dd>Prazo 05\/10 · entregue 05\/10, no prazo<\/dd>/);
  assert.match(card, /<dt>Retorno previsto × conferido<\/dt><dd>Previsto 16:30 · conferido 15:40 \(50 minutos antes: perda\); a equipe anotou 17:00<\/dd>/);
  // O nome de exibição é o da régua de pessoas (o menor começo de nome que só ela tem), nunca o ID.
  assert.match(card, /<span class="poros-pessoa">Ana<\/span><span class="poros-pessoa">Beatriz<\/span>/);
  assert.match(card, /data-os-id="np"/, 'Abrir a ficha');
  // A atrasada diz quantos dias depois do prazo.
  assert.match(secao(html), /Prazo 06\/10 · entregue 08\/10, 2 dias depois/);
  // A vista tem os filtros dela; Técnico e Tipo continuam na Tabela.
  assert.doesNotMatch(html, /id="ent-tecnico"/);
  assert.match(html, /data-ent-vista="poros">Por O\.S\.<\/button>/);
  assert.match(t.tela('STATE._entVista = "tabela"'), /id="ent-tecnico"/);
});

// Uma O.S. com tudo o que a linha do tempo junta, com repetições de propósito.
const COMPLETA = () => ({
  id: 'tl', numero: '8001', tipo: 'externo', cliente: 'Linha do tempo fictícia', equipe: ['900001'],
  dataEntrada: '2026-09-25', criadoEm: '2026-09-25T13:00:00Z', criadoPor: 'Gestão de teste',
  historico: [
    {etapa: 'apto', em: '2026-09-28T12:00:00Z', por: 'Gestão de teste'},
    {etapa: 'agendada', em: '2026-09-29T12:00:00Z', por: 'Gestão de teste'},
    {etapa: 'finalizada', em: '2026-09-30T02:30:00Z', por: 'Gestão de teste'},   // a própria finalização
    {etapa: 'agendada', em: '2026-09-29T12:00:00Z', por: 'Gestão de teste'},     // repetida
  ],
  agendaLog: [
    {de: '', data: '2026-09-29', em: '2026-09-27T12:00:00Z', por: 'Gestão de teste'},
    {de: '2026-09-29', data: '2026-09-29', em: '2026-09-28T15:00:00Z', por: 'Gestão de teste'},
    {de: '2026-09-29', data: '2026-09-29', em: '2026-09-28T15:00:00Z', por: 'Gestão de teste'},   // repetida
  ],
  instalacao: {data: '2026-09-29'}, prazoCombinado: {data: '2026-09-28', fonte: 'agenda', em: '2026-09-27T12:00:00Z', por: 'Gestão de teste'},
  // Hora local da fábrica, sem fuso: é 29/09 às 08:00 em qualquer aparelho.
  saidaEm: '2026-09-29T08:00:00', horaSaida: '08:00', retornoEm: '2026-09-29T23:10:00', horaRetorno: '23:10',
  retornoPrevisto: [{dia: '2026-09-29', hora: '23:00', por: 'Gestão de teste', em: '2026-09-28T12:00:00Z'}],
  retornoConferido: {dia: '2026-09-29', hora: '23:20', por: 'Gestão de teste', em: '2026-09-30T02:25:00Z'},
  itens: [{uid: 'tl:1:1', item: '1', descricao: 'Placa fictícia', qtde: '2', entregas: [
    {id: 'mk-1', tipo: 'entregue', qtde: 2, dia: '2026-09-29', via: 'gestao', por: 'Gestão de teste', em: '2026-09-30T02:20:00Z'},
    {id: 'mk-1', tipo: 'entregue', qtde: 2, dia: '2026-09-29', via: 'gestao', por: 'Gestão de teste', em: '2026-09-30T02:20:00Z'},   // a fila mandou de novo
  ]}],
  // 23:30 de 29/09 na fábrica é 02:30 de 30/09 em UTC.
  finalizadaEm: '2026-09-30T02:30:00Z', finalizadoPor: 'Gestão de teste',
  retornoConf: {carroLimpo: 'nao', carroArrumado: 'sim', equipamentosOk: 'sim', semAvaria: 'sim', por: 'Gestão de teste', em: '2026-09-30T11:00:00Z'},
  ocorrencias: [{id: 'oc-ficticia01', tipo: 'equipamento_faltante', item: 'Escada fictícia', obs: 'não voltou', fonte: 'ficha', dia: '2026-09-29', por: 'Gestão de teste', em: '2026-09-30T11:05:00Z',
    anulada: {em: '2026-09-30T11:30:00Z', por: 'Gestão de teste'}}],
  abonos: [{id: 'ab-ficticio02', ocorrenciaId: 'tl:atraso', motivo: 'Cliente pediu para remarcar por telefone', por: 'Gestão de teste', em: '2026-09-30T12:00:00Z',
    revogadoEm: '2026-09-30T13:00:00Z', revogadoPor: 'Gestão de teste'}],
  cancelamento: {ativo: false, motivo: 'Teste fictício de cancelamento', por: 'Gestão de teste', em: '2026-09-30T14:00:00Z', desfeitoEm: '2026-09-30T14:10:00Z', desfeitoPor: 'Gestão de teste'},
  reabertaEm: '2026-10-01T12:00:00Z', reabertaPor: 'Gestão de teste',
});
const DIARIO = [
  // O mesmo cancelamento (5 minutos depois, carimbo do servidor): vira "no diário" do fato, não outra linha.
  {id: 'd1', em: '2026-09-30T14:05:00Z', acao: 'alterar', autor: {nome: 'Gestão de teste', papel: 'pcp'}, campos: ['cancelamento'], antes: {}, depois: {}},
  // Mexeu na equipe: o diário é a única fonte, então a linha fica.
  {id: 'd2', em: '2026-09-29T13:00:00Z', acao: 'alterar', autor: {nome: 'Gestão de teste', papel: 'pcp'}, campos: ['equipe'], antes: {equipe: []}, depois: {equipe: ['900001']}},
  {id: 'd2', em: '2026-09-29T13:00:00Z', acao: 'alterar', autor: {nome: 'Gestão de teste', papel: 'pcp'}, campos: ['equipe'], antes: {equipe: []}, depois: {equipe: ['900001']}},
  // A criação.
  {id: 'd3', em: '2026-09-25T13:01:00Z', acao: 'criar', autor: {nome: 'Gestão de teste', papel: 'pcp'}, campos: ['numero', 'cliente'], antes: {}, depois: {}},
];

test('linha do tempo: uma lista só, em ordem, sem duplicata, juntando todas as fontes', () => {
  const t = casa([COMPLETA()], {erp: []});
  const ev = t.run(`(() => { const o = STORE.getOS('tl'); return POR_OS.linhaDoTempo(o, {st: OPERACAO.statusEntrega(o, '2026-10-20'), diario: ${JSON.stringify(DIARIO)}}); })()`);
  for (let i = 1; i < ev.length; i++) assert.ok(ev[i - 1].t <= ev[i].t, `fora de ordem: ${ev[i - 1].titulo} depois de ${ev[i].titulo}`);
  assert.equal(new Set(ev.map(e => e.k)).size, ev.length, 'chave repetida');
  const linhas = ev.map(e => [e.data, e.hora, e.titulo, e.detalhe].join(' | '));
  assert.equal(new Set(linhas).size, linhas.length, 'linha repetida');
  const titulos = ev.map(e => e.titulo);
  for (const esperado of ['Pedido entrou', 'O.S. criada no PCP', 'Etapa: Apto', 'Etapa: Agendada', 'Agenda marcada', 'Agenda remarcada', 'Prazo combinado', 'Retorno previsto digitado',
    'Saída da equipe', 'Volta anotada pela equipe', 'Chegada do carro conferida', 'Placa fictícia: entregue 2 unidades', 'Finalizada no PCP', 'Volta do carro conferida',
    'Ocorrência registrada: Equipamento faltante', 'Ocorrência anulada: Equipamento faltante', 'Abono: Entrega com atraso', 'Abono revogado: Entrega com atraso',
    'O.S. cancelada', 'Cancelamento desfeito', 'O.S. reaberta', 'Gestão de teste alterou']) assert.ok(titulos.includes(esperado), `falta "${esperado}"`);
  assert.equal(titulos.filter(x => x === 'Etapa: Agendada').length, 1);
  assert.equal(titulos.filter(x => x === 'Agenda remarcada').length, 1);
  assert.equal(titulos.filter(x => /: entregue/.test(x)).length, 1, 'a marca de item reenviada pela fila aparece uma vez');
  assert.ok(!titulos.includes('Etapa: Finalizada'), 'o "finalizada" do histórico é a própria finalização');
  assert.equal(titulos.filter(x => /^Gestão de teste/.test(x)).length, 1, 'o diário só fica com o que nenhuma outra fonte diz');
  assert.match(ev.find(e => e.titulo === 'Gestão de teste alterou').detalhe, /equipe/);
  assert.equal(ev.find(e => e.titulo === 'O.S. cancelada').noDiario, 'Gestão de teste', 'o diário que repete o cancelamento vira marca');
  assert.equal(ev.find(e => e.titulo === 'O.S. criada no PCP').noDiario, 'Gestão de teste');
  assert.match(ev.find(e => e.titulo === 'Volta do carro conferida').detalhe, /carro sujo/);
  // O atraso derivado (prazo 28/09) entra no dia seguinte ao prazo.
  const venceu = ev.find(e => e.titulo === 'Prazo combinado venceu');
  assert.deepEqual([venceu.data, venceu.hora], ['29/09/26', '']);
});

test('linha do tempo no fuso da fábrica: o mesmo resultado com o aparelho em qualquer fuso', () => {
  const t = casa([COMPLETA()], {erp: []});
  const ev = t.run(`POR_OS.linhaDoTempo(STORE.getOS('tl'), {st: OPERACAO.statusEntrega(STORE.getOS('tl'), '2026-10-20')})`);
  const achar = titulo => ev.find(e => e.titulo === titulo);
  assert.deepEqual([achar('Finalizada no PCP').data, achar('Finalizada no PCP').hora], ['29/09/26', '23:30'], '02:30 UTC é 23:30 do dia anterior');
  assert.deepEqual([achar('Saída da equipe').data, achar('Saída da equipe').hora], ['29/09/26', '08:00'], 'hora sem fuso é a da fábrica');
  assert.deepEqual([achar('Chegada do carro conferida').data, achar('Chegada do carro conferida').hora], ['29/09/26', '23:20']);
  assert.deepEqual([achar('Pedido entrou').data, achar('Pedido entrou').hora], ['25/09/26', ''], 'dia puro sem hora');
  // Em três fusos, a mesma lista.
  const codigo = `const P = require(${JSON.stringify(path.join(root, 'entregas-os.js'))}), O = require(${JSON.stringify(path.join(root, 'operacao.js'))});
    const o = ${JSON.stringify(COMPLETA())};
    console.log(JSON.stringify(P.linhaDoTempo(o, {st: O.statusEntrega(o, '2026-10-20'), diario: ${JSON.stringify(DIARIO)}}).map(e => [e.data, e.hora, e.titulo, e.detalhe])));`;
  const saidas = ['UTC', 'America/Sao_Paulo', 'Asia/Tokyo', 'America/Los_Angeles'].map(tz => {
    const r = spawnSync(process.execPath, ['-e', codigo], {env: {...process.env, TZ: tz, NODE_OPTIONS: ''}, encoding: 'utf8'});
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
  });
  for (const s of saidas.slice(1)) assert.equal(s, saidas[0]);
  assert.match(saidas[0], /\["29\/09\/26","23:30","Finalizada no PCP"/);
});

test('linha do tempo pela tela: abre sob pedido, fica aberta na repintura, e o diário é só da gestão', () => {
  const t = casa(LISTA(), {erp: ERP});
  const fechada = secao(t.tela('STATE._entVista = "poros"'));
  assert.match(fechada, /<details class="poros-tl" data-poros-tl="np"><summary>Linha do tempo<\/summary><div class="poros-tl-corpo"><\/div><\/details>/, 'fechada, a linha nem é montada');
  const aberta = secao(t.tela('STATE._porOS.abertas = ["np"]'));
  assert.match(aberta, /data-poros-tl="np" open>[\s\S]*?<ol class="poros-tl-lista"><li class="tl-[a-z_]+"><time datetime="[^"]+">/);
  assert.match(aberta, /Horários de Brasília\./);
  assert.doesNotMatch(aberta, /data-poros-diario/, 'sem a porta do diário no store, sem o botão');
  t.run('STORE.auditoriaOS = async () => ({entradas: []})');
  assert.match(secao(t.tela('')), /data-poros-diario="np">Juntar o diário de alterações</, 'pcp junta o diário');
  const op = casa(LISTA(), {erp: ERP, papel: 'operacao'});
  op.run('STORE.auditoriaOS = async () => ({entradas: []})');
  assert.doesNotMatch(secao(op.tela('STATE._entVista = "poros"; STATE._porOS = {abertas: ["np"]}')), /data-poros-diario/, 'a operação não pede o diário');
});

test('O.S. fora dos 60 dias do aparelho: aviso e carga sob demanda pelo buscarHistorico', async () => {
  const antiga = os('old', '4001', {cliente: 'Antiga fictícia', equipe: ['Ana'], prazoCombinado: {data: '2026-07-10', fonte: 'agenda'}, finalizadaEm: '2026-07-10T18:00:00Z', finalizadoPor: 'Gestão de teste'});
  const pedidos = [];
  const t = casa([], {erp: [{numero: '4001', cliente: 'Antiga fictícia', data: '2026-07-10', valor: 900, tipo: 'externo'}], estado: {_fEnt: {de: '2026-07-01', ate: '2026-07-31'}},
    buscar: q => { pedidos.push(q); return {itens: q.q === '4001' ? [JSON.parse(JSON.stringify(antiga))] : [], truncou: false}; }});
  const antes = secao(t.tela('STATE._entVista = "poros"'));
  assert.match(antes, /sem cópia no aparelho/);
  assert.match(antes, /Entregue há mais de 60 dias: o aparelho guarda só os últimos 60\./);
  // Revisão da F18: toda linha sem ficha tem o mesmo botão, "Procurar no servidor" (o "Carregar do servidor" de cima carrega todas as antigas).
  assert.match(antes, /data-poros-carregar="4001">Procurar no servidor</);
  assert.match(antes, /1 O\.S\. foi entregue há mais de 60 dias e não tem cópia neste aparelho\./);
  await t.run('porOSCarregar("4001")');
  assert.deepEqual(JSON.parse(JSON.stringify(pedidos)), [{q: '4001'}], 'um pedido, pelo número');
  const depois = secao(t.run('__el.innerHTML'));
  assert.match(depois, /<span class="selo-entrega se-no_prazo">No prazo<\/span>/, 'a ficha veio e o status saiu dela');
  assert.match(depois, /Carregada do servidor: some deste aparelho ao recarregar a página\./);
  assert.doesNotMatch(depois, /data-poros-carregar/);
  // Não achou: diz que a O.S. não passou pelo PCP e não oferece de novo.
  const t2 = casa([], {erp: [{numero: '4002', cliente: 'Só ERP fictício', data: '2026-07-10', valor: 1, tipo: 'externo'}], estado: {_fEnt: {de: '2026-07-01', ate: '2026-07-31'}}});
  t2.tela('STATE._entVista = "poros"');
  await t2.run('porOSCarregar("4002")');
  const nao = secao(t2.run('__el.innerHTML'));
  assert.match(nao, /O servidor também não tem esta O\.S\. no PCP/);
  assert.doesNotMatch(nao, /data-poros-carregar/);
});

/* 500 O.S. FICTÍCIAS: a pintura completa calcula o status uma vez; cada toque
   (chip, equipe, busca letra a letra, mostrar mais, abrir a linha do tempo)
   só filtra e repinta a vista, sem recalcular status. Mede o trabalho de
   cada toque, com a meta de 100 ms (no aparelho, a prévia mediu com o DOM). */
test('500 O.S.: cada filtro ou toque repinta em menos de 100 ms, sem recalcular o status', () => {
  const lista = [], erp = [];
  for (let i = 0; i < 500; i++) {
    const dia = 1 + (i % 19), d = `2026-10-${String(dia).padStart(2, '0')}`;
    // Uma em cada cinco entregue dois dias depois do prazo.
    const prazo = `2026-10-${String(i % 5 === 0 && dia > 2 ? dia - 2 : dia).padStart(2, '0')}`;
    lista.push(os('x' + i, String(10000 + i), {cliente: 'Cliente fictício ' + i, equipe: i % 3 ? ['900001', '900002'] : ['900004'], veiculo: 'Carro ' + (i % 4),
      instalacao: {data: d}, prazoCombinado: {data: prazo, fonte: 'agenda'}, finalizadaEm: d + 'T18:00:00Z', finalizadoPor: 'Gestão de teste',
      retrabalho: i % 17 === 0, retornoPrevisto: [{dia: d, hora: '16:00'}], retornoConferido: i % 2 ? {dia: d, hora: '15:20', por: 'Gestão de teste'} : undefined,
      itens: [{uid: `x${i}:1:1`, item: '1', descricao: 'Placa', qtde: '2', entregas: i % 4 ? [] : [{id: 'mk' + i, tipo: 'entregue', qtde: 2, dia: d, via: 'gestao', por: 'G', em: d + 'T17:00:00Z'}]}]}));
    erp.push({numero: String(10000 + i), cliente: 'Cliente fictício ' + i, data: d, valor: 500 + i, tipo: 'externo'});
  }
  const t = casa(lista, {erp, estado: {_fEnt: {de: '2026-10-01', ate: '2026-10-20'}}});
  // Um DOM mínimo para a vista: os pedaços que o toque repinta.
  t.run(`var __pedacos = {}; var __sec = {querySelector: s => (__pedacos[s] = __pedacos[s] || {innerHTML: '', outerHTML: '', hidden: false, focus() {}, remove() {},
      insertAdjacentHTML(onde, html) { this.innerHTML += html; }, querySelectorAll: () => []}), querySelectorAll: () => []};
    var __statusChamadas = 0; var __st = OPERACAO.statusEntrega; OPERACAO.statusEntrega = (...a) => { __statusChamadas++; return __st(...a); };
    document.getElementById = id => id === 'panel-entregas' ? __el : id === 'ent-poros' ? __sec : null;`);
  t.tela('STATE._entVista = "poros"');
  assert.equal(t.run('__statusChamadas'), 500, 'a primeira pintura calcula cada status uma vez');
  assert.equal(t.run('_porOSDados.linhas.length'), 500);
  const medir = codigo => {
    let pior = 0;
    for (let k = 0; k < 5; k++) {
      const ini = process.hrtime.bigint();
      t.run(codigo);
      pior = Math.max(pior, Number(process.hrtime.bigint() - ini) / 1e6);
    }
    return pior;
  };
  const toques = {
    'chip de status': 'STATE._porOS.status = STATE._porOS.status ? "" : "atraso"; STATE._porOS.limite = 24; pintarPorOS()',
    'equipe': 'STATE._porOS.equipe = STATE._porOS.equipe ? "" : "eq-leao"; pintarPorOS()',
    'busca, letra a letra': '["1", "10", "100", "1003", "10"].forEach(b => { STATE._porOS.busca = b; pintarPorOS(); }); STATE._porOS.busca = ""',
    'mostrar mais': 'porOSMais()',
    'abrir a linha do tempo': 'porOSLinhaHTML(_porOSDados.linhas[7])',
  };
  const tempos = {};
  for (const [nome, codigo] of Object.entries(toques)) tempos[nome] = medir(codigo);
  // A busca acima são 5 repinturas; a meta vale para cada uma.
  tempos['busca, letra a letra'] /= 5;
  for (const [nome, ms] of Object.entries(tempos)) assert.ok(ms < 100, `${nome}: ${ms.toFixed(1)} ms`);
  assert.equal(t.run('__statusChamadas'), 500, 'nenhum toque recalcula o status');
  assert.ok(t.run('__pedacos["#poros-corpo"].innerHTML').includes('poros-card'), 'o toque pintou o corpo');
  // "Mostrar mais" acrescenta só os 24 novos: os que já estão na tela não são pintados de novo.
  t.run('STATE._porOS = {status: "", equipe: "", busca: "", limite: 24, abertas: []}; __pedacos[".poros-grade"].innerHTML = ""');
  const cartoesNaGrade = () => (t.run('__pedacos[".poros-grade"].innerHTML').match(/<article class="poros-card/g) || []).length;
  t.run('porOSMais()');
  assert.equal(cartoesNaGrade(), 24);
  assert.equal(t.run('STATE._porOS.limite'), 48);
  assert.match(t.run('__pedacos[".poros-grade"].innerHTML'), /aria-label="O\.S 10\d+"/);
  t.run('porOSMais()');
  assert.equal(cartoesNaGrade(), 48, 'o segundo lote também entra sozinho');
  assert.match(t.run('__pedacos[".poros-resumo"].outerHTML'), /Mostrando 72\./, 'o número da vista diz quantos aparecem');
  // Trocar o período é pintura completa, mas o status já calculado fica.
  const ini = process.hrtime.bigint();
  t.tela('STATE._fEnt = {de: "2026-10-05", ate: "2026-10-12"}');
  const periodo = Number(process.hrtime.bigint() - ini) / 1e6;
  assert.equal(t.run('__statusChamadas'), 500, 'trocar o período não recalcula');
  assert.ok(periodo < 100, `período: ${periodo.toFixed(1)} ms`);
  /* Mudou uma O.S.: a próxima pintura completa recalcula ela e as da volta
     dela (o retorno é medido pela volta), não as outras (revisão da F18: a
     memória é por O.S.). A x3 deste teste ficou fora do período de 05 a 12 e
     nem precisa do status; a x5 (dia 06, com chegada) está dentro. */
  t.run('STORE.getOS("x5").atualizadoEm = "2026-10-20T11:00:00Z"');
  t.tela('');
  const depois = t.run('__statusChamadas');
  assert.ok(depois > 500 && depois < 520, `recalculou ${depois - 500}`);
  if (process.env.F18_MEDIR) console.log('F18 tempos (ms):', JSON.stringify({...tempos, periodo}));
});

test('entregas-os.js entra no index.html (depois do lote) e no SHELL do sw.js, na versão atual; não no celular', () => {
  const ler = f => fs.readFileSync(path.join(root, f), 'utf8');
  const v = (ler('config.js').match(/APP_VERSAO\s*=\s*'([^']+)'/) || ler('index.html').match(/lote\.js\?v=([^"]+)"/))[1];
  const index = ler('index.html');
  assert.ok(index.includes(`<script src="entregas-os.js?v=${v}"></script>`));
  assert.ok(index.indexOf('entregas-os.js') > index.indexOf('lote.js'));
  assert.ok(/const SHELL = \[([\s\S]*?)\];/.exec(ler('sw.js'))[1].includes(`'entregas-os.js?v=${v}'`));
  assert.ok(!ler('equipe.html').includes('entregas-os.js'), 'a vista é da gestão, não do celular do instalador');
  assert.ok(ler('scripts/preview-auditoria.cjs').includes("'entregas-os.js'"), 'a prévia serve o arquivo');
});

test('textos da vista sem travessão', () => {
  const fonte = fs.readFileSync(path.join(root, 'entregas-os.js'), 'utf8');
  assert.doesNotMatch(fonte, /—/);
  const t = casa(LISTA(), {erp: ERP});
  const html = secao(t.tela('STATE._entVista = "poros"; STATE._porOS = {status: "", abertas: ["np", "at", "ab", "rt", "cc", "ae"]}'));
  assert.doesNotMatch(html.replace(/<[^>]+>/g, ' '), /—/);
});
