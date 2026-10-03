/* REGRAS DO PROGRAMA VERSIONADAS E ABA REGRAS (F05, 29/09/2026).
   Decisões do dono: comissão de 1% (não 0,5%) e só na O.S. que pontua;
   divisão 1/2/3/4+ pela regra do motor, com o líder nunca abaixo de um
   ajudante; bônus e redutor da volta em percentual sobre o valor válido
   (+5% carro limpo e arrumado, -10% equipamento faltante ou danificado, volta
   não conferida neutra); validaDesde é DATA e não pode cair em período já
   fechado; só acréscimo (versão nova nunca edita a antiga), autor carimbado
   pelo servidor, diário. Os casos ruins primeiro. Dados fictícios. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const R = require('../regras.js');
const {edge} = require('./helpers/edge.cjs');

const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const regra = (mudar = {}) => ({...JSON.parse(JSON.stringify(R.REGRA_EMBUTIDA)), ...mudar});
const semCampo = (c) => { const r = regra(); delete r[c]; return r; };
const PCP = {papel:'pcp', nome:'Gestor Teste', sub:'gestor.teste'};

/* ---------------- validador (o mesmo na tela e na porta) ---------------- */

test('regra: tabela de divisão com linha que não soma 100% é recusada', () => {
  assert.match(R.validarRegra(regra({divisao:{tabela:{1:[10000], 2:[6000, 3000], 3:[4000, 3000, 3000]}, maisLider:4000}})), /somando 100%/);
  assert.match(R.validarRegra(regra({divisao:{tabela:{1:[10000], 2:[6000, 4000]}, maisLider:4000}})), /1, 2 e 3 pessoas/, 'sem a linha do trio, o trio cairia no "4 ou mais"');
  assert.match(R.validarRegra(regra({divisao:{tabela:{1:[10000], 2:[6000.5, 3999.5], 3:[4000, 3000, 3000]}, maisLider:4000}})), /somando 100%/, 'fração não passa');
});

test('regra: o líder abaixo de um ajudante é recusado em qualquer tamanho de equipe', () => {
  const dupla = R.validarRegra(regra({divisao:{tabela:{1:[10000], 2:[4000, 6000], 3:[4000, 3000, 3000]}, maisLider:4000}}));
  assert.match(dupla, /Com 2 pessoas o líder ficaria com 40% e um ajudante com 60%/);
  assert.match(R.validarRegra(regra({divisao:{tabela:{1:[10000], 2:[6000, 4000], 3:[3000, 4000, 3000]}, maisLider:4000}})), /Com 3 pessoas/);
  assert.match(R.validarRegra(regra({divisao:{tabela:{1:[10000], 2:[6000, 4000], 3:[3000, 3000, 4000]}, maisLider:4000}})), /Com 3 pessoas/, 'o segundo ajudante também conta');
  // 4 ou mais: líder 10% deixaria 30% para cada um dos 3 ajudantes.
  assert.match(R.validarRegra(regra({divisao:{tabela:{1:[10000], 2:[6000, 4000], 3:[4000, 3000, 3000]}, maisLider:1000}})), /Com 4 pessoas o líder ficaria com 10% e um ajudante com 30%/);
  // Empate não é "abaixo": líder 25% com 3 ajudantes de 25% passa.
  assert.equal(R.validarRegra(regra({divisao:{tabela:{1:[10000], 2:[5000, 5000], 3:[3334, 3333, 3333]}, maisLider:2500}})), '');
});

test('regra: comissão fora de 0% a 10% ou fora de inteiro de 0,01% é recusada; 0 é "a definir" e passa', () => {
  for (const ruim of [-1, 1001, 1.5, '100', null, undefined, NaN]) assert.match(R.validarRegra(regra({comissaoBp:ruim})), /comissão vai de 0% a 10%/, String(ruim));
  assert.equal(R.validarRegra(regra({comissaoBp:0})), '');
  assert.equal(R.validarRegra(regra({comissaoBp:1000})), '');
  assert.match(R.validarRegra(regra({comissaoSobre:'toda_entregue'})), /só sobre a O.S. que pontua/);
});

test('regra: validaDesde é DATA real AAAA-MM-DD; mês, data BR e dia inexistente são recusados', () => {
  for (const ruim of ['2026-10', '01/10/2026', '2026-02-30', '2026-13-01', '2026-10-1', '', null, 20261001, '2026-10-01T00:00:00Z'])
    assert.match(R.validarRegra(regra({validaDesde:ruim})), /data de início/, String(ruim));
  assert.equal(R.validarRegra(regra({validaDesde:'2028-02-29'})), '');
});

test('regra: bônus e redutor da volta fora da faixa e volta não conferida que não seja neutra são recusados', () => {
  assert.match(R.validarRegra(regra({volta:{carroLimpoBp:2001, equipamentoFaltaBp:1000, naoConferida:'neutra'}})), /carro limpo/);
  assert.match(R.validarRegra(regra({volta:{carroLimpoBp:-500, equipamentoFaltaBp:1000, naoConferida:'neutra'}})), /carro limpo/);
  assert.match(R.validarRegra(regra({volta:{carroLimpoBp:500, equipamentoFaltaBp:10001, naoConferida:'neutra'}})), /equipamento faltante/);
  assert.match(R.validarRegra(regra({volta:{carroLimpoBp:500, equipamentoFaltaBp:1000, naoConferida:'media'}})), /neutra/, 'contar pela média premiaria quem não foi conferido');
  assert.match(R.validarRegra(regra({volta:null})), /volta do carro/);
  assert.match(R.validarRegra(regra({toleranciaRetornoMin:-1})), /tolerância/);
  assert.match(R.validarRegra(regra({toleranciaRetornoMin:15.5})), /tolerância/);
  assert.match(R.validarRegra(regra({perdas:['atraso', 'chuva']})), /perdas/);
  assert.match(R.validarRegra(regra({perdas:['atraso', 'atraso']})), /perdas/);
  assert.match(R.validarRegra(regra({desempate:[]})), /desempate/);
  assert.match(R.validarRegra(regra({entreEquipes:'igual'})), /proporcional/);
});

test('regra embutida: 1%, divisão do motor, +5% carro limpo, -10% equipamento, 15 min, válida e provisória', () => {
  const e = R.REGRA_EMBUTIDA;
  assert.equal(R.validarRegra(e), '');
  assert.equal(e.comissaoBp, 100, 'decisão do dono: 1%, não 0,5%');
  assert.equal(e.comissaoSobre, 'os_que_pontua');
  assert.deepEqual(e.volta, {carroLimpoBp:500, equipamentoFaltaBp:1000, naoConferida:'neutra'});
  assert.deepEqual(e.divisao, {tabela:{1:[10000], 2:[6000, 4000], 3:[4000, 3000, 3000]}, maisLider:4000});
  assert.equal(e.provisoria, true);
  assert.ok(Object.isFrozen(e) && Object.isFrozen(e.volta), 'ninguém muda a embutida por referência');
});

test('normalizar: autor, id, versão e campos soltos vindos do aparelho não passam', () => {
  const n = R.normalizarRegra({...regra(), id:'forjado', versao:99, autor:{nome:'Forjado'}, criadaEm:'2020-01-01', requestId:'x', extra:1,
    volta:{carroLimpoBp:500, equipamentoFaltaBp:1000, naoConferida:'neutra', escondido:1}, divisao:{...regra().divisao, lixo:1}});
  for (const c of ['id', 'versao', 'autor', 'criadaEm', 'requestId', 'extra', 'provisoria']) assert.ok(!(c in n), c);
  assert.ok(!('escondido' in n.volta)); assert.ok(!('lixo' in n.divisao));
  assert.equal(R.validarRegra(n), '');
});

test('completar: campo ausente vem da versão base (aba antiga não zera nada); o que veio não é trocado', () => {
  const base = regra({comissaoBp:150, toleranciaRetornoMin:20});
  const c = R.completarRegra({validaDesde:'2026-11-01', comissaoBp:0}, base);
  assert.equal(c.comissaoBp, 0, 'zero digitado é zero');
  assert.equal(c.toleranciaRetornoMin, 20);
  assert.deepEqual(c.volta, base.volta);
  const ruim = R.completarRegra({validaDesde:'2026-11-01', comissaoBp:'abc'}, base);
  assert.equal(ruim.comissaoBp, 'abc', 'valor inválido não é consertado em silêncio');
  assert.match(R.validarRegra(ruim), /comissão/);
});

test('vigente: escolhida pela DATA do serviço, a mais nova no mesmo dia; versão quebrada não vale', () => {
  const v1 = {...regra({validaDesde:'2026-10-01', comissaoBp:100}), id:'a', versao:1};
  const v2 = {...regra({validaDesde:'2026-11-15', comissaoBp:200}), id:'b', versao:2};
  const v3 = {...regra({validaDesde:'2026-11-15', comissaoBp:300}), id:'c', versao:3};
  const quebrada = {...regra({validaDesde:'2026-12-01', comissaoBp:5000}), id:'q', versao:4};
  const vs = [v2, quebrada, v1, v3];
  assert.equal(R.regraVigente(vs, '2026-09-30'), null, 'antes da primeira versão: fora do programa');
  assert.equal(R.regraVigente(vs, '2026-10-01').id, 'a');
  assert.equal(R.regraVigente(vs, '2026-11-14').id, 'a');
  assert.equal(R.regraVigente(vs, '2026-11-15').id, 'c', 'mesmo dia: a última gravada');
  assert.equal(R.regraVigente(vs, '2026-12-20').id, 'c', 'a quebrada não vale');
  assert.equal(R.regraVigente(vs, '2026-11'), null, 'mês não é dia');
  // Nada gravado: a embutida, provisória, a partir de 01/10/2026.
  assert.equal(R.regraVigente([], '2026-10-05').id, 'embutida');
  assert.equal(R.regraVigente([], '2026-10-05').provisoria, true);
  assert.equal(R.regraVigente(null, '2026-09-15'), null);
});

test('fechamento: data no último dia fechado ou antes bloqueia; depois passa; sem fechamento, nada bloqueia', () => {
  assert.equal(R.fechamentoBloqueia('2026-10-31', '2026-10-31'), true);
  assert.equal(R.fechamentoBloqueia('2026-09-01', '2026-10-31'), true, 'antes do fechado também mexeria no selado');
  assert.equal(R.fechamentoBloqueia('2026-11-01', '2026-10-31'), false);
  assert.equal(R.fechamentoBloqueia('2026-11-01', ''), false);
});

test('exemplo: dupla, O.S. de R$ 10.000 no prazo = comissão R$ 100, líder R$ 60, ajudante R$ 40', () => {
  const ex = R.exemplo(R.REGRA_EMBUTIDA, 2, 1000000);
  assert.equal(ex.comissaoCentavos, 10000);
  assert.deepEqual(ex.partes.map(p => [p.papel, p.centavos]), [['lider', 6000], ['ajudante', 4000]]);
  // Trio e O.S. quebrada: a soma fecha no centavo, a sobra vai ao líder.
  const trio = R.exemplo(regra({comissaoBp:333}), 3, 1000001);
  assert.equal(trio.partes.reduce((s, p) => s + p.centavos, 0), trio.comissaoCentavos);
  const sete = R.exemplo(R.REGRA_EMBUTIDA, 7, 99999);
  assert.equal(sete.partes.reduce((s, p) => s + p.centavos, 0), sete.comissaoCentavos);
  assert.ok(sete.partes.slice(1).every(p => p.centavos <= sete.partes[0].centavos));
  // O.S. que não pontua não paga ninguém; valor ruim não vira comissão.
  assert.equal(R.exemplo(R.REGRA_EMBUTIDA, 2, 1000000, false).comissaoCentavos, 0);
  assert.equal(R.comissaoCentavos(-500, R.REGRA_EMBUTIDA), 0);
  assert.equal(R.comissaoCentavos('abc', R.REGRA_EMBUTIDA), 0);
});

test('volta: bônus e redutor em percentual; não conferida é neutra', () => {
  const r = R.REGRA_EMBUTIDA;
  assert.equal(R.ajusteDaVolta(r, {carroCerto:null, equipamentoOk:null}), 0);
  assert.equal(R.ajusteDaVolta(r, {}), 0);
  assert.equal(R.ajusteDaVolta(r, {carroCerto:true}), 500);
  assert.equal(R.ajusteDaVolta(r, {equipamentoOk:false}), -1000);
  assert.equal(R.ajusteDaVolta(r, {carroCerto:true, equipamentoOk:false}), -500);
  assert.equal(R.ajusteDaVolta(r, {carroCerto:false, equipamentoOk:true}), 0, 'carro sujo não desconta: a regra só tem bônus para o carro');
});

/* ---------------- paridade: aparelho x servidor ---------------- */

const bloco = arquivo => {
  const s = ler(arquivo), ini = s.indexOf('/* ==== REGRAS DO PROGRAMA'), fim = s.indexOf('/* ==== FIM DAS REGRAS ==== */');
  assert.ok(ini >= 0 && fim > ini, `${arquivo}: marcas das regras não encontradas`);
  return s.slice(ini, fim);
};
test('paridade: o texto das regras é o mesmo nas duas cópias e o resultado também', async () => {
  assert.equal(bloco('supabase/functions/_shared/pcp-regras.mjs'), bloco('regras.js'), 'mudou uma cópia e não a outra');
  const {REGRAS:S} = await import('../supabase/functions/_shared/pcp-regras.mjs');
  const casos = [regra(), regra({comissaoBp:1001}), regra({validaDesde:'2026-02-30'}), regra({divisao:{tabela:{1:[10000], 2:[4000, 6000], 3:[4000, 3000, 3000]}, maisLider:4000}}),
    regra({divisao:{tabela:{1:[10000], 2:[5500, 4500], 3:[3400, 3300, 3300]}, maisLider:1500}}), {}, null, regra({volta:{carroLimpoBp:500, equipamentoFaltaBp:1000, naoConferida:'x'}})];
  for (const c of casos) assert.equal(S.validarRegra(c), R.validarRegra(c));
  const vs = [{...regra({validaDesde:'2026-10-01'}), id:'a', versao:1}, {...regra({validaDesde:'2026-10-20', comissaoBp:50}), id:'b', versao:2}];
  for (const dia of ['2026-09-30', '2026-10-01', '2026-10-19', '2026-10-20', '2027-01-01', 'x']) assert.deepEqual(S.regraVigente(vs, dia), R.regraVigente(vs, dia));
  for (const n of [1, 2, 3, 4, 5, 9]) for (const v of [1, 99999, 1000000, 1234567]) assert.deepEqual(S.exemplo(vs[1], n, v), R.exemplo(vs[1], n, v));
  assert.deepEqual(S.REGRA_EMBUTIDA, R.REGRA_EMBUTIDA);
});

test('regras.js entra no index.html (depois do motor) e no SHELL; nunca no celular do instalador', () => {
  const index = ler('index.html');
  assert.match(index, /<script src="regras\.js\?v=v\d+"><\/script>/);
  assert.ok(index.indexOf('divisao.js?v=') < index.indexOf('regras.js?v='), 'regras.js usa o motor: carrega depois dele');
  assert.ok(index.indexOf('regras.js?v=') < index.indexOf('performance.js?v='));
  assert.match(/const SHELL = \[([\s\S]*?)\];/.exec(ler('sw.js'))[1], /'regras\.js\?v=v\d+'/);
  assert.doesNotMatch(ler('equipe.html'), /regras\.js/);
  for (const f of ['operacao.js', 'equipe.js']) assert.doesNotMatch(ler(f), /\bREGRAS\b|pullRegras|performanceRegra/, f);
});

/* ---------------- servidor ---------------- */

const nova = (mudar = {}, extra = {}) => ({action:'performanceRegraNova', regra:regra({validaDesde:'2026-11-01', ...mudar}), motivo:'Primeira versão do programa', anterior:'', requestId:'pedido-0000000001', ...extra});
const linhas = e => e.db.pcp_registros.filter(r => r.colecao === 'performance_regras');

test('servidor: operação, montagem, toque, comercial e máquina não criam; só admin e pcp leem', async () => {
  const e = await edge('pcp-sync');
  for (const who of [{papel:'operacao'}, {papel:'montagem', montagemIndividual:true, id:'300001'}, {papel:'montagem'}, {papel:'comercial'}]) {
    assert.equal((await e.call(nova(), who)).status, 403, JSON.stringify(who));
    assert.equal((await e.call({action:'performanceRegras'}, who)).status, 403, 'leitura: ' + JSON.stringify(who));
  }
  assert.equal((await e.call(nova(), 'machine')).status, 403, 'regra tem autor de carne e osso');
  assert.equal(linhas(e).length, 0);
  assert.equal((await e.call({action:'performanceRegras'}, {papel:'admin'})).status, 200);
});

test('servidor: regra inválida é 422 com a causa e não grava nada (nem no diário)', async () => {
  const e = await edge('pcp-sync');
  const r = await e.call(nova({divisao:{tabela:{1:[10000], 2:[4000, 6000], 3:[4000, 3000, 3000]}, maisLider:4000}}), PCP);
  assert.equal(r.status, 422);
  assert.match(r.error, /líder não pode ficar abaixo de um ajudante/);
  assert.equal((await e.call(nova({comissaoBp:5000}), PCP)).status, 422);
  assert.equal((await e.call(nova({validaDesde:'2026-11'}), PCP)).status, 422);
  assert.equal((await e.call(nova({}, {motivo:'ok'}), PCP)).status, 422, 'motivo curto');
  assert.equal((await e.call(nova({}, {requestId:'x'}), PCP)).status, 422, 'pedido sem identificação');
  assert.equal(linhas(e).length, 0);
  assert.equal(e.db.pcp_registros.filter(x => x.colecao === 'auditoria').length, 0);
});

test('servidor: data dentro de período já fechado é 409; depois do fechado passa', async () => {
  const fechado = {colecao:'performance_fechamentos', id:'2026-10-01:2026-10-31:000001', apagado:false, registro:{de:'2026-10-01', ate:'2026-10-31', revisao:1}};
  const antigo = {colecao:'performance_fechamentos', id:'2026-09-01:2026-09-30:000001', apagado:false, registro:{de:'2026-09-01', ate:'2026-09-30', revisao:1}};
  const e = await edge('pcp-sync', {pcp_registros:[antigo, fechado]});
  for (const dia of ['2026-10-15', '2026-10-31', '2026-08-01']) {
    const r = await e.call(nova({validaDesde:dia}), PCP);
    assert.equal(r.status, 409, dia);
    assert.match(r.error, /período já fechado \(até 31\/10\/2026\)/);
  }
  assert.equal(linhas(e).length, 0);
  const ok = await e.call(nova({validaDesde:'2026-11-01'}), PCP);
  assert.equal(ok.ok, true);
  const lista = await e.call({action:'performanceRegras'}, PCP);
  assert.equal(lista.fechadoAte, '2026-10-31');
});

test('servidor: autor e carimbos são do servidor; autor, id e versão forjados no corpo não passam; entra no diário', async () => {
  const e = await edge('pcp-sync');
  const r = await e.call(nova({id:'forjado', versao:77, autor:{nome:'Outra Pessoa', porId:'999999'}, criadaEm:'2020-01-01T00:00:00Z'}), PCP);
  assert.equal(r.ok, true);
  assert.equal(r.regra.versao, 1);
  assert.match(r.regra.id, /^[0-9a-f-]{36}$/);
  assert.equal(r.regra.autor.nome, 'Gestor Teste');
  assert.equal(r.regra.autor.login, 'gestor.teste');
  assert.equal(r.regra.autor.papel, 'pcp');
  assert.notEqual(r.regra.criadaEm, '2020-01-01T00:00:00Z');
  assert.equal(r.regra.comissaoBp, 100);
  assert.equal(r.regra.motivo, 'Primeira versão do programa');
  const [linha] = linhas(e);
  assert.equal(linha.id, 'v000001');
  assert.deepEqual(linha.registro, r.regra);
  const diario = e.db.pcp_registros.filter(x => x.colecao === 'auditoria');
  assert.equal(diario.length, 1);
  assert.equal(diario[0].registro.osId, 'regras');
  assert.equal(diario[0].registro.acao, 'regra-nova');
  assert.equal(diario[0].registro.autor.nome, 'Gestor Teste');
  assert.equal(diario[0].registro.depois.performanceRegras.id, r.regra.id);
});

test('servidor: só acréscimo; o mesmo pedido devolve a mesma versão; "anterior" velho é 409', async () => {
  const e = await edge('pcp-sync');
  const v1 = await e.call(nova(), PCP);
  const de_novo = await e.call(nova(), PCP);
  assert.equal(de_novo.ok, true); assert.equal(de_novo.repetida, true);
  assert.equal(de_novo.regra.id, v1.regra.id);
  assert.equal(linhas(e).length, 1, 'reenvio não cria outra versão');
  // Outro aparelho que não viu a v1 tenta gravar como se fosse a primeira.
  const cega = await e.call(nova({comissaoBp:50}, {requestId:'pedido-0000000002', anterior:''}), PCP);
  assert.equal(cega.status, 409);
  const v2 = await e.call(nova({validaDesde:'2026-12-01', comissaoBp:150}, {requestId:'pedido-0000000003', anterior:v1.regra.id}), {papel:'admin', nome:'Dono Teste'});
  assert.equal(v2.ok, true); assert.equal(v2.regra.versao, 2);
  // A versão 1 continua como estava.
  assert.deepEqual(linhas(e).find(x => x.id === 'v000001').registro, v1.regra);
  const lista = await e.call({action:'performanceRegras'}, PCP);
  assert.deepEqual(lista.versoes.map(v => v.versao), [2, 1], 'a mais nova primeiro');
  assert.equal(lista.embutida.comissaoBp, 100);
});

test('servidor: duas versões ao mesmo tempo batem na chave (23505) e a segunda é 409', async () => {
  const e = await edge('pcp-sync');
  e.cliente.beforeWrite = db => db.pcp_registros.push({colecao:'performance_regras', id:'v000001', apagado:false, registro:{...regra({validaDesde:'2026-10-10'}), id:'outra', versao:1}});
  const r = await e.call(nova(), PCP);
  assert.equal(r.status, 409);
  assert.match(r.error, /ao mesmo tempo/);
  assert.equal(linhas(e).length, 1);
});

test('servidor: aba antiga que não manda um campo não zera o campo; ele vem da última versão', async () => {
  const e = await edge('pcp-sync');
  const v1 = await e.call(nova({toleranciaRetornoMin:25}), PCP);
  const semTol = regra({validaDesde:'2026-12-01'}); delete semTol.toleranciaRetornoMin; delete semTol.volta;
  const v2 = await e.call({action:'performanceRegraNova', regra:semTol, motivo:'Mudança de data', anterior:v1.regra.id, requestId:'pedido-0000000009'}, PCP);
  assert.equal(v2.ok, true);
  assert.equal(v2.regra.toleranciaRetornoMin, 25);
  assert.deepEqual(v2.regra.volta, R.REGRA_EMBUTIDA.volta);
});

test('servidor: a regra não desce no list das O.S. (completo nem incremental) nem na configuração do toque', async () => {
  const e = await edge('pcp-sync', {pcp_registros:[{colecao:'os', id:'os-1', apagado:false, atualizado_em:'2026-09-29T10:00:00Z', registro:{id:'os-1', numero:'100', equipe:['Ana']}}]});
  assert.equal((await e.call(nova(), PCP)).ok, true);
  const todos = JSON.stringify([
    await e.call({action:'list'}, PCP),
    await e.call({action:'list', since:'2020-01-01T00:00:00Z'}, PCP),
    await e.call({action:'list'}, {papel:'montagem', montagemIndividual:true, nome:'Ana'}),
    await e.call({action:'getCfg'}, {papel:'montagem', montagemIndividual:true, nome:'Ana'}),
  ]);
  assert.doesNotMatch(todos, /validaDesde|comissaoBp|performance_regras/);
});

/* ---------------- aparelho: cópia local só da gestão ---------------- */

function store(papel) {
  const ls = new Map([['impresilk_inst_user', JSON.stringify({papel, nome:'Teste'})]]), disco = new Map(), chamadas = [];
  const db = {transaction() {
    const tx = {objectStore:() => ({
      get(k) { const req = {}; queueMicrotask(() => req.onsuccess?.({target:{result:disco.has(k) ? structuredClone(disco.get(k)) : null}})); return req; },
      put(v, k) { queueMicrotask(() => { disco.set(k, structuredClone(v)); tx.oncomplete?.(); }); },
      delete(k) { queueMicrotask(() => { disco.delete(k); tx.oncomplete?.(); }); },
    })};
    return tx;
  }};
  const ctx = vm.createContext({console:{log() {}, warn() {}, error() {}}, navigator:{onLine:true}, window:{addEventListener() {}},
    localStorage:{getItem:k => ls.get(k) || null, setItem:(k, v) => ls.set(k, v), removeItem:k => ls.delete(k)},
    indexedDB:{open() { const req = {}; queueMicrotask(() => req.onsuccess({target:{result:db}})); return req; }, deleteDatabase() {}},
    setTimeout:() => 1, clearTimeout() {}, AbortController, API_BASE:'http://teste',
    fetch:async (_u, req) => { const b = JSON.parse(req.body); chamadas.push(b.action); return {ok:true, status:200, json:async () => ({versoes:[{...regra(), id:'a', versao:1}], fechadoAte:'2026-09-30'})}; }});
  vm.runInContext(ler('store.js'), ctx);
  return {s:vm.runInContext('STORE', ctx), ls, disco, chamadas, virar:p => ls.set('impresilk_inst_user', JSON.stringify({papel:p}))};
}
const espera = () => new Promise(r => setTimeout(r, 5));

test('aparelho: a gestão guarda a cópia (prévia sem rede); outro papel não pede nem lê a que ficou no disco', async () => {
  const g = store('pcp');
  await g.s.pullRegras();
  assert.equal(g.s.regrasLocais().versoes[0].id, 'a');
  assert.equal(g.s.regrasLocais().fechadoAte, '2026-09-30');
  await espera();
  assert.ok(g.disco.has('regras'), 'guardada no IndexedDB');
  // A montagem pega o mesmo tablet: não vê a cópia, não pede ao servidor.
  g.virar('montagem');
  assert.equal(g.s.regrasLocais(), null);
  assert.equal(await g.s.pullRegras(), null);
  assert.deepEqual(g.chamadas, ['performanceRegras']);
  // Aparelho novo da montagem com a cópia velha no disco: também não lê.
  const m = store('montagem'); m.disco.set('regras', {versoes:[{id:'a'}]});
  assert.equal(await m.s.lerRegrasDisco(), null);
  // Gestão sem rede: abre com a cópia do disco.
  const off = store('admin'); off.disco.set('regras', {versoes:[{...regra(), id:'z', versao:3}], fechadoAte:'', em:'2026-09-29T10:00:00Z'});
  assert.equal((await off.s.lerRegrasDisco()).versoes[0].id, 'z');
});

test('aparelho: sair do sistema apaga a cópia das regras, mesmo com fila pendente', async () => {
  const g = store('pcp');
  await g.s.pullRegras(); await espera();
  g.ls.set('impresilk_inst_fila', JSON.stringify([{action:'upsert', os:{id:'x'}}]));
  g.s.limparCache();
  await espera();
  assert.equal(g.s.regrasLocais(), null);
  assert.equal(g.disco.has('regras'), false);
});

/* ---------------- tela ---------------- */

function tela(papel, copia = null) {
  const c = {STORE:{getCFG:() => ({}), getAllOS:() => [], regrasLocais:() => copia, uuid:() => 'pedido-tela-0001'},
    STATE:{user:{papel}, _perfAba:'regras'}, console,
    esc:s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[ch])),
    dinheiroCasa:n => (Number(n) || 0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'})};
  vm.createContext(c);
  for (const f of ['divisao.js', 'regras.js', 'performance.js']) vm.runInContext(ler(f), c);
  return c;
}
const formDe = campos => ({querySelector:sel => { const m = /name="(\w+)"/.exec(sel); return m && m[1] in campos ? {value:campos[m[1]]} : null; }});
const FORM = {validaDesde:'2026-11-01', lider2:'60', lider3:'40', ajudante3:'30', lider4:'40', comissao:'1', tolerancia:'15', carroLimpo:'5', equipamento:'10'};

test('tela: sem cópia mostra a regra embutida como provisória e o exemplo ao vivo (dupla R$ 10.000: R$ 100, R$ 60, R$ 40)', () => {
  const html = tela('pcp').perfRegrasHTML();
  assert.match(html, /Provisória/);
  assert.match(html, /Dupla<\/strong>, O\.S\. de R\$\s10\.000,00 no prazo: comissão total R\$\s100,00, líder R\$\s60,00, ajudante R\$\s40,00/);
  assert.match(html, /Trio<\/strong>.*comissão total R\$\s100,00, líder R\$\s40,00, cada ajudante R\$\s30,00/);
  assert.match(html, /\+5%/); assert.match(html, /-10%/);
  assert.match(html, /id="perf-regra-nova" disabled/, 'sem consultar o servidor não cria versão');
});

test('tela: com a cópia do servidor mostra a versão em vigor, o histórico recolhível e libera criar', () => {
  const v1 = {...regra({validaDesde:'2026-09-01', comissaoBp:50}), id:'a', versao:1, autor:{nome:'Gestor Teste', login:'gestor.teste'}, criadaEm:'2026-09-01T12:00:00Z', motivo:'Início'};
  const html = tela('admin', {versoes:[v1], fechadoAte:'2026-08-31', em:'2026-09-29T10:00:00Z'}).perfRegrasHTML();
  assert.match(html, /Regra operacional legada em vigor hoje/);
  assert.match(html, /Versão 1/);
  assert.match(html, /comissão total R\$\s50,00/);
  assert.match(html, /<details class="perf-regra-versao">/);
  assert.match(html, /Fechado até 31\/08\/2026/);
  assert.doesNotMatch(html, /Provisória/);
  assert.doesNotMatch(html, /id="perf-regra-nova" disabled/);
});

test('tela: quem não é admin nem pcp não vê regra, número nem exemplo', () => {
  for (const papel of ['montagem', 'operacao', 'comercial']) {
    const html = tela(papel, {versoes:[], fechadoAte:'', em:''}).perfRegrasHTML();
    assert.doesNotMatch(html, /comissão|R\$|perf-regra-nova/, papel);
  }
});

test('tela: o formulário usa o MESMO validador da porta: a frase da tela é a do 422 do servidor', async () => {
  const c = tela('pcp', {versoes:[], fechadoAte:'2026-10-31', em:'x'});
  const ok = c.perfRegraDoForm(formDe(FORM), R.REGRA_EMBUTIDA);
  assert.equal(c.perfRegraErroForm(ok, ''), '');
  assert.equal(ok.comissaoBp, 100); assert.equal(JSON.stringify(ok.divisao.tabela[3]), '[4000,3000,3000]');
  const ruim = c.perfRegraDoForm(formDe({...FORM, lider2:'40'}), R.REGRA_EMBUTIDA);
  const erroTela = c.perfRegraErroForm(ruim, '');
  assert.match(erroTela, /líder não pode ficar abaixo/);
  const e = await edge('pcp-sync');
  const r = await e.call({action:'performanceRegraNova', regra:ruim, motivo:'Teste do formulário', anterior:'', requestId:'pedido-0000000042'}, PCP);
  assert.equal(r.status, 422); assert.equal(r.error, erroTela);
  // Texto no lugar do número e vírgula decimal.
  assert.match(c.perfRegraErroForm(c.perfRegraDoForm(formDe({...FORM, comissao:'um'}), R.REGRA_EMBUTIDA), ''), /comissão/);
  assert.equal(c.perfRegraDoForm(formDe({...FORM, comissao:'0,75'}), R.REGRA_EMBUTIDA).comissaoBp, 75);
  // Data dentro do fechado: a tela avisa antes de mandar.
  assert.match(c.perfRegraErroForm(c.perfRegraDoForm(formDe({...FORM, validaDesde:'2026-10-20'}), R.REGRA_EMBUTIDA), '2026-10-31'), /período já fechado/);
});

/* A aba na tela de Performance (casa.js): só admin e pcp. */
function casaPerf(papel) {
  const ctx = vm.createContext({console, STORE:{getAllOS:() => [], getCFG:() => ({instaladores:[]}), saveCFG() {}, uuid:() => 'x', elenco:() => ({pessoas:[], veiculos:[], ferias:[], ausencias:[]}), entreguesMes:() => null, pullEntreguesMes() {}, anosEntregues:() => [2026], valores:() => ({})},
    STATE:{user:{papel}, _perfAba:'regras'}, document:{getElementById:() => null, querySelectorAll:() => [], body:{classList:{add() {}, remove() {}, contains:() => false}}},
    localStorage:{getItem:() => null, setItem() {}, removeItem() {}}, esc:s => String(s ?? ''), emptyState:() => '', bindCardClicks() {}, toast() {}, fmtInstalacao:() => '', filtroPeriodoHTML:() => '',
    parseLocalDate:() => null, pessoaDoElenco:() => null, wireFiltroPeriodo() {}, abrirTVCasa() {}, perfCompartilharRanking() {}, CSS:{escape:x => x},
    perfRegrasHTML:() => '<p>CONTEUDO-REGRAS</p>', wirePerfRegras() { ctx.__wireRegras = true; }, REGRAS:{}});
  for (const f of ['operacao.js', 'casa.js', 'relatorios-entregas.js']) vm.runInContext(ler(f), ctx);
  const el = {innerHTML:'', querySelectorAll:() => [], querySelector:() => ({value:''})};
  ctx.document.getElementById = () => el;
  vm.runInContext('renderPerformanceCasa()', ctx);
  return {html:el.innerHTML, ctx};
}
test('tela: a aba Regras aparece para admin e pcp; montagem e operação com a aba guardada caem na Equipe', () => {
  for (const papel of ['admin', 'pcp']) {
    const {html, ctx} = casaPerf(papel);
    assert.match(html, /data-perf-aba="regras"/, papel);
    assert.match(html, /CONTEUDO-REGRAS/);
    assert.doesNotMatch(html, /Conferir nomes do PCP/, 'a aba Regras não repete a Equipe');
    assert.equal(ctx.__wireRegras, true);
  }
  for (const papel of ['montagem', 'operacao']) {
    const {html} = casaPerf(papel);
    assert.doesNotMatch(html, /data-perf-aba="regras"|CONTEUDO-REGRAS/, papel);
    assert.match(html, /Conferir nomes do PCP/, 'cai na Equipe');
  }
});

/* ---------------- revisão da F05 (29/09/2026): os casos que os revisores acharam ---------------- */

test('vigente: a primeira versão gravada NÃO apaga a embutida para trás (dias antes dela continuam com a embutida)', () => {
  const v1 = {...regra({validaDesde:'2026-10-06', comissaoBp:150}), id:'v1', versao:1};
  for (const dia of ['2026-10-01', '2026-10-03', '2026-10-05']) assert.equal(R.regraVigente([v1], dia).id, 'embutida', dia);
  assert.equal(R.regraVigente([v1], '2026-10-06').id, 'v1');
  assert.equal(R.regraVigente([v1], '2026-09-30'), null, 'setembro continua fora do programa');
  // No mesmo dia da embutida, a gravada vence (versão maior).
  const mesmoDia = {...regra({validaDesde:'2026-10-01', comissaoBp:150}), id:'m', versao:1};
  assert.equal(R.regraVigente([mesmoDia], '2026-10-01').id, 'm');
  // A embutida nunca passa na frente de uma gravada: a versão que começa antes de 01/10 continua valendo depois.
  const setembro = {...regra({validaDesde:'2026-09-15', comissaoBp:150}), id:'s', versao:1};
  assert.equal(R.regraVigente([setembro], '2026-09-20').id, 's');
  assert.equal(R.regraVigente([setembro], '2026-10-10').id, 's');
  assert.equal(R.regraVigente([setembro], '2026-09-14'), null);
});

test('servidor: mês fechado com a embutida continua com ela depois de gravar a v1 do mês seguinte', async () => {
  const outubro = {colecao:'performance_fechamentos', id:'2026-10-01:2026-10-31:000001', apagado:false, registro:{de:'2026-10-01', ate:'2026-10-31', revisao:1}};
  const e = await edge('pcp-sync', {pcp_registros:[outubro]});
  const antes = await e.call({action:'performanceRegras'}, PCP);
  assert.equal(R.regraVigente(antes.versoes, '2026-10-15').id, 'embutida');
  const v1 = await e.call(nova({validaDesde:'2026-11-01', comissaoBp:150}), PCP);
  assert.equal(v1.ok, true);
  const depois = await e.call({action:'performanceRegras'}, PCP);
  assert.equal(R.regraVigente(depois.versoes, '2026-10-15').id, 'embutida', 'outubro fechado não muda');
  assert.equal(R.regraVigente(depois.versoes, '2026-11-02').id, v1.regra.id);
});

test('regra: a tabela de divisão só tem as linhas 1, 2 e 3; linha de 4 ou mais é recusada na tela e na porta', async () => {
  const extra = {tabela:{1:[10000], 2:[6000, 4000], 3:[4000, 3000, 3000], 4:[2500, 2500, 2500, 2500], 5:[2000, 2000, 2000, 2000, 2000]}, maisLider:4000};
  assert.match(R.validarRegra(regra({divisao:extra})), /só as linhas de 1, 2 e 3 pessoas/);
  const so4 = {tabela:{1:[10000], 2:[6000, 4000], 3:[4000, 3000, 3000], 4:[4000, 2000, 2000, 2000]}, maisLider:4000};
  assert.match(R.validarRegra(regra({divisao:so4})), /só as linhas de 1, 2 e 3 pessoas/);
  const e = await edge('pcp-sync');
  const r = await e.call(nova({divisao:extra}), PCP);
  assert.equal(r.status, 422);
  assert.match(r.error, /só as linhas de 1, 2 e 3 pessoas/);
  assert.equal(linhas(e).length, 0);
  // A embutida (divisão do motor) continua válida.
  assert.equal(R.validarRegra(regra()), '');
});

test('servidor: o mesmo pedido com outros valores (comissão, data ou motivo) é 409 e não troca o que ficou gravado', async () => {
  const e = await edge('pcp-sync');
  const pedido = {requestId:'pedido-idem-000001'};
  const v1 = await e.call(nova({comissaoBp:1000}, pedido), PCP); // 10% digitado por engano; a resposta "se perdeu"
  assert.equal(v1.ok, true);
  for (const [mudar, extra] of [[{comissaoBp:100}, {}], [{validaDesde:'2026-11-05', comissaoBp:1000}, {}], [{comissaoBp:1000}, {motivo:'Outro motivo qualquer'}]]) {
    const r = await e.call(nova(mudar, {...pedido, ...extra}), PCP);
    assert.equal(r.status, 409, JSON.stringify(mudar) + JSON.stringify(extra));
    assert.match(r.error, /Este pedido já gravou a versão 1 com outros valores/);
  }
  assert.equal(linhas(e).length, 1);
  assert.equal(linhas(e)[0].registro.comissaoBp, 1000);
  // O mesmo conteúdo (inclusive sem um campo, que vem da mesma base) devolve a mesma versão.
  const igual = await e.call(nova({comissaoBp:1000}, pedido), PCP);
  assert.equal(igual.ok, true); assert.equal(igual.repetida, true); assert.equal(igual.regra.id, v1.regra.id);
  const r2 = regra({validaDesde:'2026-11-01', comissaoBp:1000}); delete r2.volta;
  const semCampoIgual = await e.call({action:'performanceRegraNova', regra:r2, motivo:'Primeira versão do programa', anterior:'', requestId:pedido.requestId}, PCP);
  assert.equal(semCampoIgual.repetida, true);
  // Depois de uma v2, o reenvio da v2 compara com a base dela (a v1).
  const pedidoV2 = {requestId:'pedido-idem-000002', anterior:v1.regra.id, motivo:'Corrige a comissão'};
  const v2 = await e.call(nova({validaDesde:'2026-11-02', comissaoBp:100}, pedidoV2), PCP);
  assert.equal(v2.ok, true); assert.equal(v2.regra.versao, 2);
  const v2Sem = regra({validaDesde:'2026-11-02', comissaoBp:100}); delete v2Sem.toleranciaRetornoMin;
  assert.equal((await e.call({action:'performanceRegraNova', regra:v2Sem, ...pedidoV2}, PCP)).repetida, true);
  assert.equal((await e.call(nova({validaDesde:'2026-11-02', comissaoBp:150}, pedidoV2), PCP)).status, 409);
  assert.equal(linhas(e).length, 2);
});

test('servidor: fechamento com "até" depois de hoje é recusado com a causa e não grava nada', async () => {
  const hoje = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date());
  const amanha = new Date(Date.parse(hoje + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10);
  const e = await edge('pcp-sync');
  const r = await e.call({action:'performanceFechar', de:hoje, ate:amanha, requestId:'fechar-futuro-000001', motivo:'Fechamento por engano', hash:'x', anterior:''}, PCP);
  assert.equal(r.status, 422);
  assert.match(r.error, /O fechamento vai no máximo até hoje/);
  assert.equal(e.db.pcp_registros.filter(x => x.colecao === 'performance_fechamentos').length, 0);
  // Consultar um período que termina no futuro continua liberado (só lê).
  assert.equal((await e.call({action:'performanceFechamentos', de:hoje, ate:amanha}, PCP)).status ?? 200, 200);
});

test('tela: depois da v1 começar em 06/10, o dia 05/10 continua "Regra operacional legada em vigor hoje" com a embutida, provisória', () => {
  const v1 = {...regra({validaDesde:'2026-10-06', comissaoBp:150}), id:'v1', versao:1, autor:{nome:'Gestor Teste'}, criadaEm:'2026-10-05T12:00:00Z', motivo:'Nova comissão'};
  const c = tela('pcp', {versoes:[v1], fechadoAte:'', em:'2026-10-05T12:00:00Z'});
  c.perfHojeISO = () => '2026-10-05';
  const html = c.perfRegrasHTML();
  assert.match(html, /Regra operacional legada em vigor hoje/);
  assert.match(html, /Provisória: regra embutida, vale até o início da primeira versão gravada/);
  assert.match(html, /comissão total R\$\s100,00/, 'a embutida (1%) e não a v1 (1,5%)');
  c.perfHojeISO = () => '2026-10-06';
  const depois = c.perfRegrasHTML();
  assert.match(depois, /Versão 1/); assert.doesNotMatch(depois, /Provisória/);
  assert.match(depois, /comissão total R\$\s150,00/);
});

test('tela: a data sugerida nunca cai fora do programa nem no fechado; data antes de 01/10 mostra o aviso', () => {
  const c = tela('pcp');
  assert.equal(c.perfRegraDataSugerida('', '2026-09-29'), '2026-10-01', 'hoje em setembro: sugere o início do programa, não 30/09');
  assert.equal(c.perfRegraDataSugerida('', '2026-10-05'), '2026-10-06');
  assert.equal(c.perfRegraDataSugerida('2026-10-31', '2026-10-05'), '2026-11-01');
  assert.equal(c.perfRegraDataSugerida('2026-10-31', '2026-12-31'), '2027-01-01');
  assert.match(c.perfRegraAvisoData('2026-09-30', []), /Atenção: o programa começa em 01\/10\/2026/);
  assert.equal(c.perfRegraAvisoData('2026-10-01', []), '');
  const setembro = {...regra({validaDesde:'2026-09-15'}), id:'s', versao:1};
  assert.equal(c.perfRegraAvisoData('2026-09-20', [setembro]), '', 'o programa já começou em 15/09 por uma versão gravada');
});

/* O diálogo "Nova versão" com um formulário de mentira: o bastante para
   conferir o requestId entre tentativas e a confirmação. */
function dialogoRegra(papel = 'pcp', respostas = []) {
  const c = tela(papel, {versoes:[], fechadoAte:'', em:'2026-09-29T10:00:00Z'});
  let n = 0; const pedidos = [], toasts = [];
  c.STORE.uuid = () => 'pedido-dialogo-' + String(++n).padStart(4, '0');
  c.STORE.api = async body => { pedidos.push(JSON.parse(JSON.stringify(body))); const r = respostas.shift(); if (r instanceof Error) throw r; return r; };
  c.STORE.pullRegras = async () => {};
  c.toast = (m, t) => toasts.push([m, t]);
  c.renderPerformanceCasa = () => {};
  const campos = {...FORM, validaDesde:'2026-11-01', motivo:'Primeira versão do programa'};
  const els = {erro:{textContent:''}, previa:{innerHTML:''}, aviso:{textContent:''}, btn:{disabled:false}};
  let aoDigitar = null, corpo = '';
  const form = {querySelector:sel => sel === '[type="submit"]' ? els.btn : (m => m && m[1] in campos ? {value:campos[m[1]]} : null)(/name="(\w+)"/.exec(sel)),
    addEventListener:(ev, fn) => { if (ev === 'input') aoDigitar = fn; }, onsubmit:null};
  const d = {closed:false, close() { this.closed = true; }, querySelector:sel => ({'#perf-regra-form':form, '#perf-regra-erro':els.erro, '#perf-regra-previa':els.previa, '#perf-regra-aviso':els.aviso})[sel] || null};
  c.perfDialog = (t, html) => { corpo = html; return d; };
  c.perfNovaRegra();
  return {c, d, form, els, campos, pedidos, toasts, corpo:() => corpo, digitar:(nome, v) => { campos[nome] = v; aoDigitar(); }, enviar:() => form.onsubmit({preventDefault() {}})};
}

test('tela: depois de um erro de rede, mexer num campo gera outro pedido; sem mexer, reenvia o mesmo', async () => {
  const gravada = {...regra({validaDesde:'2026-11-01', comissaoBp:150}), id:'v1', versao:1};
  const t = dialogoRegra('pcp', [new TypeError('Failed to fetch'), new TypeError('Failed to fetch'), {ok:true, regra:gravada}]);
  await t.enviar();
  assert.match(t.els.erro.textContent, /Sem conexão/);
  await t.enviar(); // sem mexer: o mesmo pedido
  assert.equal(t.pedidos[0].requestId, t.pedidos[1].requestId);
  t.digitar('comissao', '1,5');
  await t.enviar();
  assert.notEqual(t.pedidos[2].requestId, t.pedidos[1].requestId, 'valor corrigido depois do erro vai como outro pedido');
  assert.equal(t.pedidos[2].regra.comissaoBp, 150);
  assert.equal(t.d.closed, true);
  // A confirmação diz o que o servidor gravou.
  const [msg, tipo] = t.toasts.at(-1);
  assert.equal(tipo, 'success');
  assert.match(msg, /Versão 1 gravada: comissão 1,5%, dupla 60% e 40%, trio 40%, 30% e 30%, 4 ou mais com líder 40%\. Vale a partir de 01\/11\/2026\./);
});

test('tela: sem erro, digitar não troca o pedido; a confirmação de reenvio diz que já estava gravada', async () => {
  const gravada = {...regra({validaDesde:'2026-11-01', comissaoBp:100}), id:'v1', versao:1};
  const t = dialogoRegra('pcp', [{ok:true, regra:gravada, repetida:true}]);
  t.digitar('comissao', '1');
  await t.enviar();
  assert.equal(t.pedidos[0].requestId, 'pedido-dialogo-0001');
  assert.match(t.toasts.at(-1)[0], /Versão 1 já estava gravada: comissão 1%/);
});

test('tela: o formulário sugere 01/10/2026 quando hoje ainda é setembro e mostra o aviso se a data for antes disso', () => {
  const t = dialogoRegra();
  t.c.perfHojeISO = () => '2026-09-29';
  const t2 = (() => { t.c.perfNovaRegra(); return t.corpo(); })();
  assert.match(t2, /name="validaDesde" value="2026-10-01"/);
  t.digitar('validaDesde', '2026-09-30');
  assert.match(t.els.aviso.textContent, /Atenção: o programa começa em 01\/10\/2026/);
  t.digitar('validaDesde', '2026-10-01');
  assert.equal(t.els.aviso.textContent, '');
});
