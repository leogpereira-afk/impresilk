/* CANCELAMENTO DA O.S. (F16, 30/09/2026). Só a gestão (admin e pcp) cancela,
   com motivo; o servidor protege o campo como os da gestão (F01): o aparelho
   não forja, a aba antiga não apaga, e desfazer fica no histórico. A O.S.
   cancelada sai da fila "a lançar" e da base da apuração (perfFonte): o hash
   do período aberto muda e o da revisão selada não. O corte do lançamento
   manual (15/09/2026) é uma constante só de cada lado, e as duas dizem o
   mesmo dia. Na tela: o selo no card e na ficha, "Cancelar O.S." com motivo e
   "Desfazer cancelamento", só para a gestão. Cada teste começa pelo caso
   ruim. Dados fictícios: o repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {edge} = require('./helpers/edge.cjs');
const D = require('../divisao.js');
const E = require('../entrega-item.js');

const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const plano = v => JSON.parse(JSON.stringify(v));
const sha = v => createHash('sha256').update(JSON.stringify(v)).digest('hex');

const ficha = (id, nome, apelido, cpf) => ({colecao:'colaboradores', id, apagado:false, registro:{id, nome, apelido, cpf}});
const FICHAS = [
  ficha('gestor-f', 'Gestor Teste', 'gestor', '11122233344'),
  ficha('ana-f', 'Ana Fictícia', 'ana', '10000111111'),
  ficha('bia-f', 'Bia Fictícia', 'bia', '10000222222'),
];
const gestor = {papel:'pcp', nome:'Gestor Teste', sub:'gestor'};
const admin = {papel:'admin', nome:'Admin Teste', sub:'admin1'};
const operacao = {papel:'operacao', nome:'Operação Teste', sub:'operacao1'};
const montagem = {papel:'montagem', nome:'Montagem Casa', sub:'montagem1'};
const toque = {nome:'Ana', sub:'Ana', id:'100001', papel:'montagem', montagemIndividual:true};
const row = (id, registro) => ({id, colecao:'os', apagado:false, atualizado_em:'2026-09-19T10:00:00Z', registro:{id, rev:1, ...registro}});
// A baixa do ERP fora da carteira: finalizada pela máquina, esperando lançamento (a mistura de entregue e cancelado).
const foraDaCarteira = (extra = {}) => ({numero:'6001', tipo:'externo', origemMubisys:true, cliente:'Cliente Fictício', equipe:['100001'],
  finalizadaEm:'2026-09-22T12:00:00.000Z', finalizadoPor:'Mubisys · saiu da carteira aberta',
  baixaAutoERP:{em:'2026-09-22T12:00:00.000Z', status:'FORA DA CARTEIRA ABERTA', carteira:true}, ...extra});
const aberta = (extra = {}) => ({numero:'6002', tipo:'externo', cliente:'Cliente Fictício', equipe:['100001'], veiculo:'Fiorino',
  instalacao:{data:'2026-09-30', periodo:'Manhã', hora:'', duracaoDias:1}, ...extra});
const banco = regs => ({pcp_registros:regs, registros:plano(FICHAS), equipe_contas:[{sistema:'pcp', usuario:'montagem1'}]});
const gravada = (e, id = '1') => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === id).registro;
const copia = (e, id = '1') => structuredClone(gravada(e, id));
const diario = e => e.db.pcp_registros.filter(r => r.colecao === 'auditoria').map(r => r.registro);
const PEDIDO = {cancelar:true, motivo:'Cliente desistiu do serviço'};

/* ───────────── só a gestão cancela ───────────── */
test('só a gestão cancela: toque, montagem com senha, operação e máquina não; o carimbo é do crachá e do servidor', async () => {
  const e = await edge('pcp-sync', banco([row('1', aberta())]));
  // Caso ruim: quem não é gestão manda o pedido (e um carimbo forjado junto).
  const forjado = {...PEDIDO, por:'Forjado', porId:'999999', em:'2020-01-01T00:00:00Z'};
  let r = await e.call({action:'upsert', os:{id:'1', rev:1, cancelamento:forjado, obsTecnicas:'nota'}}, toque);
  assert.equal(r.status, 200, JSON.stringify(r));assert.ok(!('cancelamento' in gravada(e)), 'toque não cancela');
  for (const quem of [montagem, operacao]) {
    r = await e.call({action:'upsert', os:{...copia(e), cancelamento:forjado}}, quem);
    assert.equal(r.status, 200, JSON.stringify(r));assert.ok(!('cancelamento' in gravada(e)), quem.papel + ' não cancela');
    assert.match(String(r.avisos), /só a gestão do PCP \(admin ou pcp\) cancela/, quem.papel + ' ouve o porquê');
  }
  r = await e.call({action:'upsert', os:{...copia(e), cancelamento:forjado}}, 'machine');
  assert.equal(r.status, 200);assert.ok(!('cancelamento' in gravada(e)), 'máquina não cancela');
  r = await e.call({action:'upsert', os:{...copia(e), cancelamento:forjado}}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));
  const c = gravada(e).cancelamento;
  assert.equal(c.ativo, true);assert.equal(c.motivo, 'Cliente desistiu do serviço');
  assert.equal(c.por, 'Gestor Teste', 'o nome do crachá, não o que o aparelho escreveu');assert.equal(c.porConta, 'gestor');assert.equal(c.porId, '111222');
  assert.notEqual(c.em, '2020-01-01T00:00:00Z');assert.ok(!('cancelar' in c), 'o pedido não fica gravado, só a marca');
  assert.ok(diario(e).some(a => a.campos.includes('cancelamento') && a.autor.login === 'gestor'), 'vai para o diário');
  // O admin também cancela.
  const e2 = await edge('pcp-sync', banco([row('1', aberta())]));
  r = await e2.call({action:'upsert', os:{...copia(e2), cancelamento:PEDIDO}}, admin);
  assert.equal(gravada(e2).cancelamento.ativo, true);assert.equal(gravada(e2).cancelamento.por, 'Admin Teste');
});

test('motivo obrigatório (15 letras ou mais): sem ele fica como estava, com aviso; nunca 422', async () => {
  const e = await edge('pcp-sync', banco([row('1', aberta())]));
  for (const motivo of [undefined, '', '   ', 'desistiu']) {
    const r = await e.call({action:'upsert', os:{...copia(e), cancelamento:{cancelar:true, motivo}}}, gestor);
    assert.equal(r.status, 200, JSON.stringify(r));assert.ok(!('cancelamento' in gravada(e)), String(motivo));
    assert.match(String(r.avisos), /A O\.S\. não foi cancelada: escreva o motivo do cancelamento com 15 letras ou mais/);
  }
  const O = require('../operacao.js');
  assert.equal(O.motivoCancelamentoInvalido('desistiu'), 'Escreva o motivo do cancelamento com 15 letras ou mais.', 'a mesma frase na tela');
  assert.equal(O.motivoCancelamentoInvalido('Cliente desistiu do serviço'), '');
});

test('o aparelho não forja e a aba antiga não apaga: só PEDIDO muda o campo', async () => {
  const e = await edge('pcp-sync', banco([row('1', aberta())]));
  // Caso ruim: a marca pronta, sem pedido, vinda da gestão (cópia de outro aparelho, aba adulterada).
  let r = await e.call({action:'upsert', os:{...copia(e), cancelamento:{ativo:true, motivo:'forjado sem pedido algum', por:'X'}}}, gestor);
  assert.ok(r.ok && !r.conflito, JSON.stringify(r));assert.ok(!('cancelamento' in gravada(e)), 'marca sem pedido não entra');
  await e.call({action:'upsert', os:{...copia(e), cancelamento:PEDIDO}}, gestor);
  const cancelada = structuredClone(gravada(e).cancelamento);
  // A aba antiga (não conhece o campo): sem ele, com null e com ''. Nada apaga.
  const versoes = [o => { delete o.cancelamento; return o; }, o => ({...o, cancelamento:null}), o => ({...o, cancelamento:''}), o => ({...o, cancelamento:{}})];
  for (const [i, v] of versoes.entries()) {
    const rev = gravada(e).rev;
    r = await e.call({action:'upsert', os:{...v(copia(e)), obsPCP:'recado ' + i}}, gestor);
    assert.equal(r.status, 200, JSON.stringify(r));assert.ok(r.ok && !r.conflito, 'gravou (não é conflito)');
    assert.equal(gravada(e).rev, rev + 1);assert.equal(gravada(e).obsPCP, 'recado ' + i);
    assert.deepEqual(gravada(e).cancelamento, cancelada, 'versão ' + i);
  }
  // A fila manda o mesmo pedido de novo: o carimbo não muda.
  r = await e.call({action:'upsert', os:{...copia(e), cancelamento:{...PEDIDO, motivo:'Outro motivo qualquer aqui'}}}, gestor);
  assert.deepEqual(gravada(e).cancelamento, cancelada, 'já cancelada: o primeiro carimbo fica');
});

test('desfazer: só a gestão; guarda quem desfez; a cópia velha da cancelada não ressuscita; cancelar de novo vale', async () => {
  const e = await edge('pcp-sync', banco([row('1', aberta())]));
  await e.call({action:'upsert', os:{...copia(e), cancelamento:PEDIDO}}, gestor);
  const velha = copia(e);
  // Caso ruim: a operação tenta desfazer.
  let r = await e.call({action:'upsert', os:{...copia(e), cancelamento:{desfazer:true}}}, operacao);
  assert.equal(r.status, 200);assert.equal(gravada(e).cancelamento.ativo, true);
  assert.match(String(r.avisos), /não foi desfeito: só a gestão/);
  r = await e.call({action:'upsert', os:{...copia(e), cancelamento:{desfazer:true}}}, admin);
  assert.equal(r.status, 200, JSON.stringify(r));
  const d = gravada(e).cancelamento;
  assert.equal(d.ativo, false);assert.equal(d.motivo, 'Cliente desistiu do serviço', 'o histórico não some');
  assert.equal(d.por, 'Gestor Teste');assert.equal(d.desfeitoPor, 'Admin Teste');assert.equal(d.desfeitoPorConta, 'admin1');assert.ok(d.desfeitoEm);
  // A cópia velha (com a marca ativa) volta pela aba de outro tablet: não ressuscita.
  r = await e.call({action:'upsert', os:{...velha, rev:gravada(e).rev, obsPCP:'aba velha'}}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));assert.equal(gravada(e).cancelamento.ativo, false);
  // Desfazer de novo não muda nada.
  const antes = structuredClone(gravada(e).cancelamento);
  await e.call({action:'upsert', os:{...copia(e), cancelamento:{desfazer:true}}}, gestor);
  assert.deepEqual(gravada(e).cancelamento, antes);
  // Cancelar de novo: marca nova.
  await e.call({action:'upsert', os:{...copia(e), cancelamento:{cancelar:true, motivo:'Cliente cancelou de novo, por telefone'}}}, gestor);
  assert.equal(gravada(e).cancelamento.ativo, true);assert.equal(gravada(e).cancelamento.motivo, 'Cliente cancelou de novo, por telefone');
});

test('quem não é gestão recebe o cancelamento sem o ID e sem o login de quem cancelou', async () => {
  const c = {ativo:true, motivo:'Cliente desistiu do serviço', por:'Gestor Teste', porConta:'gestor', porId:'111222', em:'2026-09-25T10:00:00.000Z',
    desfeitoPor:'', desfeitoPorConta:'', desfeitoPorId:''};
  const e = await edge('pcp-sync', banco([row('1', aberta({cancelamento:c}))]));
  for (const quem of [operacao, montagem]) {
    const r = await e.call({action:'list', since:'2000-01-01'}, quem);
    const o = r.os.find(x => x.id === '1');
    assert.ok(o, quem.papel);assert.equal(o.cancelamento.por, 'Gestor Teste');
    assert.ok(!('porId' in o.cancelamento) && !('porConta' in o.cancelamento) && !('desfeitoPorId' in o.cancelamento), JSON.stringify(o.cancelamento));
  }
  const g = await e.call({action:'list', since:'2000-01-01'}, gestor);
  assert.equal(g.os.find(x => x.id === '1').cancelamento.porId, '111222', 'a gestão vê tudo');
  // A volta da cópia podada não apaga nada.
  const podada = (await e.call({action:'list', since:'2000-01-01'}, operacao)).os.find(x => x.id === '1');
  const r = await e.call({action:'upsert', os:{...podada, obsPCP:'x'}}, operacao);
  assert.ok(r.ok && !r.conflito, JSON.stringify(r));assert.equal(gravada(e).obsPCP, 'x');
  assert.equal(gravada(e).cancelamento.porId, '111222');
});

test('cancelar a O.S. cancela o saldo dos itens (o entregue fica); marca nova em O.S. cancelada é recusada, mesmo da cópia velha', async () => {
  const itens = [
    {uid:'6002:1:1', item:'1', descricao:'Placa ACM', qtde:'1', subtotal:'600', entregas:[{id:'e1', tipo:'entregue', qtde:1, dia:'2026-09-25', via:'gestao', por:'Gestor Teste', porId:'111222', em:'2026-09-25T12:00:00Z'}]},
    {uid:'6002:2:1', item:'2', descricao:'Totem', qtde:'2', subtotal:'400'},
  ];
  const e = await edge('pcp-sync', banco([row('1', aberta({itens, valorTotal:1000}))]));
  const velha = copia(e);
  await e.call({action:'upsert', os:{...copia(e), cancelamento:PEDIDO}}, gestor);
  const L = E.lancamentosDaOS(gravada(e));
  assert.deepEqual(L.itens.map(x => x.situacao), ['entregue', 'cancelado']);
  assert.deepEqual([L.entregue, L.cancelado, L.saldo], [60000, 40000, 0]);
  // Caso ruim: o tablet com a cópia de antes do cancelamento marca o totem entregue.
  velha.rev = gravada(e).rev;
  velha.itens[1].entregas = [{id:'e9', tipo:'entregue', qtde:2, dia:'2026-09-29', via:'gestao'}];
  const r = await e.call({action:'upsert', os:velha}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.ok(!(gravada(e).itens[1].entregas || []).length, 'a marca não entra');
  assert.match(String(r.avisos), /O\.S\. cancelada: desfaça o cancelamento/);
  assert.deepEqual((r.entregasRecusadas || []).map(x => x.id), ['e9']);
  assert.equal(gravada(e).cancelamento.ativo, true, 'e a cópia velha não desfaz o cancelamento');
});

/* ───────────── fila "a lançar" e apuração ───────────── */
function casa(lista) {
  const ctx = vm.createContext({console, STORE:{getAllOS:() => lista, getCFG:() => ({}), elenco:() => ({pessoas:[], veiculos:[], ferias:[], ausencias:[]})},
    STATE:{}, document:{getElementById:() => null, querySelectorAll:() => []}, esc:s => String(s ?? '')});
  vm.runInContext(ler('operacao.js'), ctx);
  vm.runInContext(ler('casa.js'), ctx);
  return code => vm.runInContext(code, ctx);
}
test('a cancelada sai da fila "a lançar" e não conta como entrega nem como retirada', () => {
  const erp = (id, dia, status, extra = {}) => ({id, numero:id, tipo:'externo', finalizadaEm:dia + 'T12:00:00.000Z', finalizadoPor:`Mubisys (baixa automática · ${status})`, baixaAutoERP:{em:dia + 'T12:00:00.000Z', status}, ...extra});
  const lista = [
    erp('A', '2026-09-20', 'ENTREGUE'),
    erp('B', '2026-09-20', 'FORA DA CARTEIRA ABERTA', {cancelamento:{ativo:true, motivo:'Cancelada pelo cliente', por:'Gestor Teste'}}),
    erp('C', '2026-09-20', 'CANCELADO'),
    erp('D', '2026-09-10', 'CANCELADO'),    // antes do corte: era contada como entregue
    erp('E', '2026-09-10', 'ENTREGUE'),     // antes do corte: continua entregue
    {id:'F', numero:'F', tipo:'interno', finalizadaEm:'2026-09-20T12:00:00.000Z', finalizadoPor:'Ana', cancelamento:{ativo:true, motivo:'Cliente não veio buscar'}},
    {id:'G', numero:'G', tipo:'externo', instalacao:{data:'2026-09-30'}, cancelamento:{cancelar:true, motivo:'Cliente desistiu do serviço'}},
    {id:'H', numero:'H', tipo:'externo', finalizadaEm:'2026-09-20T12:00:00.000Z', finalizadoPor:'Ana', cancelamento:{ativo:false, motivo:'desfeito', desfeitoEm:'2026-09-21'}},
  ];
  const run = casa(lista);
  const cls = run('JSON.stringify(Object.fromEntries(Object.entries(classificarEntregas()).map(([k, v]) => [k, v.map(o => o.id)])))');
  assert.deepEqual(JSON.parse(cls), {aLancar:['A'], instalacoes:['E', 'H'], retiradas:[], canceladas:['B', 'C', 'D', 'F', 'G']});
});

// A base da apuração: duas O.S. confirmadas pela divisão (Ana e Bia, sem equipe cadastrada).
const aloc = () => plano(D.montar([{equipeId:null, liderId:'100001', membros:['100001', '100002']}]));
const entregue = (id, numero, extra = {}) => row(id, {numero, tipo:'externo', cliente:'Cliente ' + numero, veiculo:'Fiorino', equipe:['100001', '100002'],
  finalizadaEm:'2026-09-25T18:00:00Z', finalizadoPor:'Gestor Teste', valorTotal:500, alocacao:{...aloc(), por:'Gestor Teste', em:'2026-09-25T18:00:00Z'}, ...extra});
const bancoPerf = regs => ({...banco(regs), pcp_config_global:[{id:true, config:{instaladores:['Ana', 'Bia'], performancePCP:{equipes:[], participacoes:[]}}, atualizado_em:'2026-09-19T10:00:00Z'}]});
const periodo = {de:'2026-09-01', ate:'2026-09-29'};
test('a cancelada sai da base da apuração: à mão e no ERP (mesmo antes do corte)', async () => {
  const e = await edge('pcp-sync', bancoPerf([
    entregue('K1', '7101'),
    entregue('K2', '7102', {cancelamento:{ativo:true, motivo:'Cliente desistiu do serviço', por:'Gestor Teste'}}),
    entregue('K3', '7103', {finalizadaEm:'2026-09-10T12:00:00.000Z', finalizadoPor:'Mubisys (baixa automática · CANCELADO)', baixaAutoERP:{em:'2026-09-10T12:00:00.000Z', status:'CANCELADO'}}),
    entregue('K4', '7104', {finalizadaEm:'2026-09-10T12:00:00.000Z', finalizadoPor:'Mubisys (baixa automática · ENTREGUE)', baixaAutoERP:{em:'2026-09-10T12:00:00.000Z', status:'ENTREGUE'}}),
    entregue('K5', '7105', {cancelamento:{ativo:false, motivo:'desfeito depois', desfeitoEm:'2026-09-26T10:00:00Z'}}),
  ]));
  const r = await e.call({action:'performancePeriodo', ...periodo}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.deepEqual(r.registros.map(x => x.id).sort(), ['K1', 'K4', 'K5']);
  // O relatório de entregas (retrabalho por mês) usa a mesma base.
  const rel = await e.call({action:'relatorioEntregas', ano:2026}, gestor);
  assert.equal(rel.meses.find(m => m.mes === '2026-09').baseRetrabalho, 3);
});

test('hash: cancelar muda o do período aberto; a revisão selada fica com o mesmo hash e com a O.S. dentro', async () => {
  const e = await edge('pcp-sync', bancoPerf([entregue('K1', '7101'), entregue('K2', '7102')]));
  const fonte = await e.call({action:'performancePeriodo', ...periodo}, gestor);
  assert.ok(fonte.registros.every(x => x.confirmado), JSON.stringify(fonte.registros));
  const f = await e.call({action:'performanceFechar', ...periodo, hash:fonte.hash, requestId:'f16-fechar-0001', motivo:'Fechamento de teste', anterior:'', leGrupos:true}, gestor);
  assert.equal(f.ok, true, JSON.stringify(f));
  const selado = f.fechamento.hash;
  // Depois de fechar, a gestão cancela a K2.
  const r = await e.call({action:'upsert', os:{...copia(e, 'K2'), cancelamento:PEDIDO}}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));
  // A apuração recusa ("a base mudou") o que foi gravado no mesmo milissegundo em que ela começa.
  await new Promise(res => setTimeout(res, 5));
  const aberta = await e.call({action:'performancePeriodo', ...periodo}, gestor);
  assert.equal(aberta.status, 200, JSON.stringify(aberta));
  assert.notEqual(aberta.hash, fonte.hash, 'o período aberto muda');
  assert.deepEqual(aberta.registros.map(x => x.id), ['K1']);
  const velho = await e.call({action:'performanceFechar', ...periodo, hash:fonte.hash, requestId:'f16-fechar-0002', motivo:'Com o hash velho', anterior:f.fechamento.id, leGrupos:true}, gestor);
  assert.equal(velho.status, 409, 'fechar com o hash de antes do cancelamento é recusado');
  const [rev] = (await e.call({action:'performanceFechamentos', ...periodo}, gestor)).fechamentos;
  assert.equal(rev.hash, selado, 'a revisão selada continua com o MESMO hash');
  assert.deepEqual(rev.registros.map(x => x.id).sort(), ['K1', 'K2'], 'e com a O.S. da época');
  assert.equal(sha({periodo:rev.periodo, regra:rev.regra, criterios:rev.criterios, registros:rev.registros}), selado);
  // Sem nada cancelado, o registro não ganha campo novo (o hash da performance-3 é o de antes).
  assert.deepEqual(Object.keys(aberta.registros[0]), ['id', 'numero', 'cliente', 'dia', 'valor', 'origemValor', 'membros', 'confirmado', 'fonte', 'equipeId', 'equipeNome', 'emblema', 'obs', 'por', 'em', 'retrabalho', 'retornoConf', 'voltou', 'volta']);
});

/* ───────────── o corte: uma constante de cada lado, o mesmo dia ───────────── */
test('corte do lançamento manual: casa.js e pcp-sync dizem o mesmo dia, e o literal não se repete', () => {
  const casaJs = ler('casa.js'), index = ler('supabase/functions/pcp-sync/index.ts'), store = ler('store.js');
  const doCasa = /^const CORTE_LANCAMENTO_MANUAL = '(\d{4}-\d{2}-\d{2})';$/m.exec(casaJs);
  const doServidor = /^const CORTE_LANCAMENTO_MANUAL = "(\d{4}-\d{2}-\d{2})";$/m.exec(index);
  assert.ok(doCasa && doServidor, 'as duas constantes existem');
  assert.equal(doServidor[1], doCasa[1], 'o mesmo dia nos dois lados');
  assert.equal(doCasa[1], '2026-09-15');
  // Uma vez só em cada arquivo: a regra usa a constante.
  const vezes = (s, dia) => s.split(dia).length - 1;
  assert.equal(vezes(casaJs, doCasa[1]), 1, 'casa.js');
  assert.equal(vezes(index, doCasa[1]), 1, 'index.ts');
  assert.match(index, /fim>=CORTE_LANCAMENTO_MANUAL/);
  // A reserva do store.js (quando o casa.js não carrega, no celular) diz o mesmo dia.
  const reserva = /typeof CORTE_LANCAMENTO_MANUAL === 'string' \? CORTE_LANCAMENTO_MANUAL : '(\d{4}-\d{2}-\d{2})'/.exec(store);
  assert.ok(reserva);assert.equal(reserva[1], doCasa[1]);
  for (const f of ['operacao.js', 'app.js', 'performance.js', 'relatorios-entregas.js', 'equipe.js']) assert.equal(vezes(ler(f), doCasa[1]), 0, f);
});

/* ───────────── a tela: selo no card e na ficha, Cancelar e Desfazer ───────────── */
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
async function bancada(registros, {papel = 'pcp', cracha = gestor} = {}) {
  const e = await edge('pcp-sync', banco(registros));
  const inicial = e.db.pcp_registros.filter(r => r.colecao === 'os').map(r => plano(r.registro));
  const d = domFalso(), ls = new Map([['impresilk_inst_os', JSON.stringify(inicial)], ['impresilk_inst_fila', '[]']]);
  const idb = {transaction() { const tx = {objectStore:() => ({get() { const q = {}; queueMicrotask(() => q.onsuccess?.({target:{result:null}})); return q; },
    put() { queueMicrotask(() => tx.oncomplete?.()); }, delete() { queueMicrotask(() => tx.oncomplete?.()); }})}; return tx; }};
  const toasts = [], respostas = [];
  const ctx = vm.createContext({console:{log() {}, warn() {}, error() {}}, navigator:{onLine:true}, window:{addEventListener() {}}, location:{reload() {}},
    localStorage:{getItem:k => ls.has(k) ? ls.get(k) : null, setItem:(k, v) => ls.set(k, String(v)), removeItem:k => ls.delete(k)},
    indexedDB:{open() { const q = {}; queueMicrotask(() => q.onsuccess({target:{result:idb}})); return q; }, deleteDatabase() {}},
    setTimeout:() => 1, clearTimeout() {}, setInterval:() => 1, clearInterval() {}, AbortController, API_BASE:'http://teste',
    fetch:async (_u, req) => { const r = await e.call(JSON.parse(req.body), cracha); return {ok:!(r.status >= 400), status:r.status || 200, json:async () => r}; },
    document:d.doc, confirm:() => respostas.length ? respostas.shift() : true});
  for (const f of ['store.js', 'operacao.js', 'entrega-item.js', 'app.js']) vm.runInContext(ler(f), ctx, {filename:f});
  const run = c => vm.runInContext(c, ctx);
  ctx.__toasts = toasts;
  run(`STATE.user = {nome:${JSON.stringify(cracha.nome)}, papel:${JSON.stringify(papel)}};
    renderModal = () => {}; renderActiveTab = () => {}; toast = (m, t) => __toasts.push([m, t]);
    abrirDialogoEntrega = (cfg, cb) => { __dialogo = cfg; __confirmar = cb; };`);
  const S = run('STORE');
  await S.pronto();
  const esvaziar = async () => { for (let i = 0; i < 100 && S.getQueue().length; i++) { await S.trySync(); await new Promise(r => setTimeout(r, 2)); } };
  return {e, S, run, toasts, respostas, esvaziar,
    abrir:id => run(`_modalDraft = JSON.parse(JSON.stringify(STORE.getOS(${JSON.stringify(id)}))); STATE.modalOSId = ${JSON.stringify(id)}; _modalDirty = false;`)};
}

test('tela: selo no card e na ficha; Cancelar O.S. com motivo só para a gestão; Desfazer volta; o servidor confirma', async () => {
  const b = await bancada([row('1', foraDaCarteira())]);
  b.abrir('1');
  let ficha = b.run('statusEntregaFichaHTML(_modalDraft)');
  assert.match(ficha, /class="st-entrega lock-allow"/, 'vale na O.S. finalizada (a baixa fora da carteira)');
  assert.match(ficha, /selo-entrega se-no_prazo/);assert.match(ficha, /baixa do ERP, sem prova/);
  assert.match(ficha, /Retorno antecipado: sem dado ainda\./);
  assert.match(ficha, /id="btn-cancelar-os">Cancelar O\.S\.</);
  // Caso ruim: motivo curto. O diálogo mostra a frase e não grava nada.
  b.run('cancelarOSDaFicha()');
  assert.equal(b.run('__dialogo.motivo'), true);
  assert.equal(b.run(`__confirmar({motivo:'desistiu'})`), 'Escreva o motivo do cancelamento com 15 letras ou mais.');
  assert.equal(b.run('_modalDraft.cancelamento'), undefined);
  assert.equal(b.run(`__confirmar({motivo:'Cliente cancelou o pedido por telefone'})`), '');
  // Na hora (antes do servidor): o card e a ficha já dizem Cancelado.
  assert.match(b.run(`osCardHTML(STORE.getOS('1'))`), /selo-entrega se-cancelado[^>]*>.*Cancelado/);
  assert.match(b.run(`osCardHTML(STORE.getOS('1'))`), /card-fin-tag card-fin-cancelada/);
  await b.esvaziar();
  const g = gravada(b.e);
  assert.equal(g.cancelamento.ativo, true);assert.equal(g.cancelamento.motivo, 'Cliente cancelou o pedido por telefone');assert.equal(g.cancelamento.porId, '111222');
  assert.equal(b.run(`STORE.getOS('1').cancelamento.ativo`), true, 'o aparelho adota a marca do servidor');
  b.abrir('1');
  ficha = b.run('statusEntregaFichaHTML(_modalDraft)');
  assert.match(ficha, /Cancelada por Gestor Teste em \d\d\/\d\d: Cliente cancelou o pedido por telefone\./);
  assert.match(ficha, /id="btn-desfazer-cancelamento"/);assert.doesNotMatch(ficha, /btn-cancelar-os/);
  // Desfazer: confirma e volta.
  b.respostas.push(true);
  b.run('desfazerCancelamentoDaFicha()');
  assert.doesNotMatch(b.run(`osCardHTML(STORE.getOS('1'))`), /se-cancelado/);
  await b.esvaziar();
  assert.equal(gravada(b.e).cancelamento.ativo, false);assert.equal(gravada(b.e).cancelamento.desfeitoPor, 'Gestor Teste');
  b.abrir('1');
  assert.match(b.run('statusEntregaFichaHTML(_modalDraft)'), /Cancelamento desfeito por Gestor Teste em/);
  // O histórico da ficha diz o que aconteceu, sem o ID.
  const aud = b.run(`audValor('cancelamento', STORE.getOS('1').cancelamento)`);
  assert.match(aud, /^cancelamento desfeito por Gestor Teste em .* \(o motivo era: Cliente cancelou o pedido por telefone\)$/);assert.doesNotMatch(aud, /111222/);
});

test('tela: a operação vê o selo e não vê Cancelar O.S.; a O.S. cancelada não oferece marca de item nem próximo passo', async () => {
  const itens = [{uid:'6002:1:1', item:'1', descricao:'Placa ACM', qtde:'2', subtotal:'600'}];
  const c = {ativo:true, motivo:'Cliente desistiu do serviço', por:'Gestor Teste', em:'2026-09-25T10:00:00.000Z'};
  const b = await bancada([row('1', aberta({itens})), row('2', aberta({numero:'6003', itens, cancelamento:c}))], {papel:'operacao', cracha:operacao});
  b.abrir('1');
  const ficha = b.run('statusEntregaFichaHTML(_modalDraft)');
  assert.match(ficha, /selo-entrega/);assert.doesNotMatch(ficha, /btn-cancelar-os|btn-desfazer-cancelamento/);
  b.run('cancelarOSDaFicha()');
  assert.equal(b.run('typeof __dialogo'), 'undefined', 'nem pela função');
  assert.ok(b.run(`acoesEntregaDoItem(STORE.getOS('1').itens[0], STORE.getOS('1')).length`) > 0);
  assert.equal(b.run(`acoesEntregaDoItem(STORE.getOS('2').itens[0], STORE.getOS('2')).length`), 0);
  assert.equal(b.run(`proximoPasso(STORE.getOS('2'))`), null);
  const card = b.run(`osCardHTML(STORE.getOS('2'))`);
  assert.match(card, /se-cancelado/);assert.match(card, /prazo-tag prazo-cancelada/);assert.doesNotMatch(card, /Próximo passo/);
  // O status de agenda (o badge da etapa, que o Painel copia) é o mesmo da aberta.
  assert.equal(b.run(`calcStatus(STORE.getOS('2'))`), b.run(`calcStatus(STORE.getOS('1'))`));
});

/* ───────────── a prévia da divisão (crítica 5.4) ───────────── */
test('prévia da divisão: a O.S. cancelada, ou com a perda da regra, mostra a comissão prevista zerada e o porquê', () => {
  const ELENCO = {pessoas:[{chave:'ana-f', id:'100001', nome:'Ana Fictícia', apelido:'ana', ativo:true}, {chave:'bia-f', id:'100002', nome:'Bia Fictícia', apelido:'bia', ativo:true}], antigos:[]};
  const escH = s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[ch]));
  const c = vm.createContext({console, setTimeout, clearTimeout, navigator:{onLine:true}, esc:escH, toast() {},
    STORE:{getCFG:() => ({instaladores:['Ana'], performancePCP:{equipes:[], participacoes:[]}}), getAllOS:() => [], getOS:() => null, elenco:() => ELENCO, getQueue:() => [], on() {}, regrasLocais:() => null},
    STATE:{user:{papel:'pcp', nome:'Gestor Teste'}}, pessoasRH:() => ELENCO.pessoas, avatarRH:() => '', dinheiroCasa:n => 'R$ ' + Number(n).toFixed(2),
    normNome:s => String(s || '').toLowerCase().trim(), diaEntrega:o => String((o.entregaLancada && o.entregaLancada.data) || o.finalizadaEm || '').slice(0, 10)});
  for (const f of ['operacao.js', 'divisao.js', 'regras.js', 'entrega-item.js', 'alocacao-ui.js']) vm.runInContext(ler(f), c, {filename:f});
  const app = ler('app.js');
  vm.runInContext(app.slice(app.indexOf('const RH_CONTRATOS_FREELANCER'), app.indexOf('/* `marcadosAgora` e `novas`')), c, {filename:'app.js (seletor)'});
  const A = vm.runInContext('ALOCUI', c);
  const base = (extra = {}) => ({id:'1', numero:'5001', tipo:'externo', cliente:'Cliente Fictício', equipe:['100001', '100002'], valorTotal:4200, finalizadaEm:'2026-10-02T15:00:00', rev:1, ...extra});
  const html = (k, os) => { A.iniciar(k, {os, equipes:[], papel:'pcp', valor:4200, reiniciar:true}); return A.html(k); };
  // Caso ruim: a cancelada prometia R$ 42,00 de comissão.
  const canc = html('c', base({cancelamento:{ativo:true, motivo:'Cliente desistiu do serviço'}}));
  assert.match(canc, /O\.S\. cancelada: não pontua nem paga comissão\./);assert.doesNotMatch(canc, /R\$ 21\.00|Comissão prevista de 1%/);
  assert.match(canc, /<td class="num">R\$ 0\.00<\/td>/, 'a coluna da comissão de cada um fica zerada');
  assert.match(canc, /Valor bruto da O\.S\./, 'o valor bruto continua à vista');
  const retrab = html('r', base({retrabalho:true}));
  assert.match(retrab, /O\.S\. com retrabalho: pela regra do programa, não pontua nem paga comissão\./);
  const atraso = html('a', base({instalacao:{data:'2026-10-01'}, prazoCombinado:{data:'2026-10-01', fonte:'agenda'}}));
  assert.match(atraso, /O\.S\. com entregue com atraso: pela regra do programa, não pontua nem paga comissão\./);
  // Antes de 01/10 (regra atual, sem programa): só a cancelada muda a prévia.
  assert.doesNotMatch(html('s', base({retrabalho:true, finalizadaEm:'2026-09-20T10:00:00'})), /não pontua/);
  assert.match(html('s2', base({finalizadaEm:'2026-09-20T10:00:00', cancelamento:{ativo:true, motivo:'Cliente desistiu do serviço'}})), /O\.S\. cancelada: não pontua/);
  // A que pontua segue como antes.
  const ok = html('ok', base());
  assert.match(ok, /Comissão prevista de 1%[^<]*: R\$ 42\.00/);assert.match(ok, /<td class="num">R\$ 21\.00<\/td>/);
  for (const h of [canc, retrab, atraso, ok]) assert.doesNotMatch(h, /—/);
});
