/* REVISÃO DA ONDA ACABAMENTO (12/10/2026). A revisão de uso disse "não" (U1 a
   U4) e a de dados disse "sim" com dois achados (D1 e D2). Cada teste começa
   pelo caso ruim, o que a onda acabamento (acfaae1) fazia. Tudo fictício: o
   repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {edge} = require('./helpers/edge.cjs');
const C = require('../conferencia-entrega.js');
const D = require('../divisao.js');
const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

/* A O.S. das provas da revisão de dados: dois itens de R$ 500, uma entrega
   conferida com 1 das 2 unidades do item A (R$ 250,00 pelo rateio). */
const FICHAS = [{colecao: 'colaboradores', id: 'g', apagado: false, registro: {id: 'g', nome: 'Gestor Teste', apelido: 'gestor', cpf: '44455566677'}}];
const osBase = () => {
  const o = {id: 'v1', numero: '93201', rev: 1, tipo: 'externo', cliente: 'Cliente fictício', valorTotal: 1000, equipe: ['100001'], manual: true,
    itens: [{uid: 'm-a0000000001', item: '1', descricao: 'Painel fictício A', qtde: '2', valorUnit: '250', subtotal: 500, manual: true},
      {uid: 'm-b0000000001', item: '2', descricao: 'Painel fictício B', qtde: '1', valorUnit: '500', subtotal: 500, manual: true}],
    instalacao: {data: '2026-10-05', periodo: 'Manhã', duracaoDias: 1}};
  const i = C.catalogo(o)[0];
  o.conferenciasEntrega = [{id: 'e1', dia: '2026-10-05', itens: [{chave: i.chave, identidade: i.identidade, qtde: 1}], alocacao: D.montar([{equipeId: null, liderId: '100001', membros: ['100001']}]),
    por: 'Gestor Teste', porId: '444555', em: '2026-10-05T20:00:00.000Z'}];
  return o;
};
const banco = () => ({pcp_registros: [{id: 'v1', colecao: 'os', apagado: false, atualizado_em: '2026-10-05T20:00:00Z', registro: osBase()}], registros: structuredClone(FICHAS),
  pcp_config_global: [{id: true, config: {instaladores: []}, atualizado_em: '2026-10-01T00:00:00Z'}]});
const GESTOR = {papel: 'pcp', nome: 'Gestor Teste', sub: 'gestor'};
const gravada = e => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === 'v1').registro;
const valorE1 = o => C.apurar(o, o.valorTotal).entregas[0]?.valor ?? null;

test('revisão acabamento: o item conferido enviado sem a chave do valor fica com o valor gravado (D2, PROVA 3)', async () => {
  const e = await edge('pcp-sync', banco());
  const antes = valorE1(gravada(e));
  const o = structuredClone(gravada(e));
  delete o.itens[0].subtotal; delete o.itens[0].valorUnit;
  o.obsPCP = 'gravação fictícia';
  const r = await e.call({action: 'upsert', os: o}, GESTOR);
  assert.equal(r.status, 200, JSON.stringify(r));
  const g = gravada(e);
  // Caso ruim (acfaae1): o ausente apagava, o item ficava sem valor e a entrega conferida, sem valor (null).
  assert.deepEqual([g.itens[0].valorUnit, g.itens[0].subtotal], ['250', 500], 'o ausente nunca apaga: fica o gravado');
  assert.equal(valorE1(g), antes, 'o valor da entrega conferida não muda');
  assert.equal(g.obsPCP, 'gravação fictícia', 'o resto da gravação passou');
  assert.ok(!(r.avisos || []).some(a => /valor não mudou/.test(a)), 'sem aviso: ninguém pediu mudança');
  // O valor presente e diferente continua protegido, com aviso (onda acabamento, item 8).
  const o2 = structuredClone(gravada(e)); delete o2.itens[0].subtotal; o2.itens[0].valorUnit = '900';
  const r2 = await e.call({action: 'upsert', os: o2}, GESTOR);
  assert.deepEqual([gravada(e).itens[0].valorUnit, gravada(e).itens[0].subtotal], ['250', 500]);
  assert.ok(r2.avisos.some(a => /o valor não mudou/.test(a)), JSON.stringify(r2.avisos));
});

const diario = e => e.db.pcp_registros.filter(r => r.colecao === 'auditoria').map(r => r.registro);
test('revisão acabamento: mudar o valor de OUTRO item muda o valor da entrega conferida com aviso "de R$ X para R$ Y" e linha no diário (D1, PROVA 1)', async () => {
  const e = await edge('pcp-sync', banco());
  const antes = valorE1(gravada(e));
  const o = structuredClone(gravada(e));
  o.itens[1].valorUnit = '1500'; o.itens[1].subtotal = 1500;
  const r = await e.call({action: 'upsert', os: o}, GESTOR);
  assert.equal(r.status, 200, JSON.stringify(r));
  const depois = valorE1(gravada(e));
  assert.deepEqual([antes, depois], [25000, 12500], 'a gestão corrige o valor: a gravação vale');
  // Caso ruim (acfaae1): o valor da entrega conferida mudava sem aviso nenhum (avisos []).
  assert.ok((r.avisos || []).some(a => a.includes('O valor da entrega conferida desta O.S. mudou de R$ 250,00 para R$ 125,00')), JSON.stringify(r.avisos));
  const d = diario(e).find(x => x.acao === 'valor-conferido');
  assert.ok(d, 'a linha do diário');
  assert.deepEqual([d.campos, d.antes, d.depois], [['valorConferido'], {valorConferido: 25000}, {valorConferido: 12500}]);
  assert.equal(d.autor.nome, 'Gestor Teste');
  // A gravação que não muda o rateio não avisa nem escreve a linha.
  const o2 = structuredClone(gravada(e)); o2.obsPCP = 'só a observação';
  const r2 = await e.call({action: 'upsert', os: o2}, GESTOR);
  assert.ok(!(r2.avisos || []).some(a => /entrega conferida desta O\.S\. mudou/.test(a)));
  assert.equal(diario(e).filter(x => x.acao === 'valor-conferido').length, 1);
});

test('revisão acabamento: item NOVO com valor e valor total novo também avisam a gestão (D1, PROVA 2)', async () => {
  const e = await edge('pcp-sync', banco());
  const o = structuredClone(gravada(e));
  o.itens.push({uid: 'm-c0000000001', item: '3', descricao: 'Item novo fictício', qtde: '1', valorUnit: '3000', subtotal: 3000, manual: true});
  const r = await e.call({action: 'upsert', os: o}, GESTOR);
  assert.equal(r.status, 200);
  assert.equal(valorE1(gravada(e)), 6250);
  // Caso ruim (acfaae1): de R$ 250,00 para R$ 62,50 sem aviso.
  assert.ok(r.avisos.some(a => a.includes('de R$ 250,00 para R$ 62,50')), JSON.stringify(r.avisos));
  const o2 = structuredClone(gravada(e)); o2.valorTotal = 2000;
  const r2 = await e.call({action: 'upsert', os: o2}, GESTOR);
  assert.ok(r2.avisos.some(a => a.includes('de R$ 62,50 para R$ 125,00')), JSON.stringify(r2.avisos));
  assert.equal(diario(e).filter(x => x.acao === 'valor-conferido').length, 2);
});

test('revisão acabamento: quem não é gestão não muda o valor, nem recebe aviso com R$ (D1)', async () => {
  const fichas = [...structuredClone(FICHAS), {colecao: 'colaboradores', id: 'op', apagado: false, registro: {id: 'op', nome: 'Operação Teste', apelido: 'operacao1', cpf: '55566677788'}}];
  const b = banco(); b.registros = fichas;
  const e = await edge('pcp-sync', b);
  const o = structuredClone(gravada(e));
  o.itens[1].valorUnit = '1500'; o.itens[1].subtotal = 1500; o.obsPCP = 'fictícia';
  const r = await e.call({action: 'upsert', os: o}, {papel: 'operacao', nome: 'Operação Teste', sub: 'operacao1'});
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(valorE1(gravada(e)), 25000, 'o valor é o gravado');
  assert.ok(!(r.avisos || []).some(a => /R\$/.test(a)), JSON.stringify(r.avisos));
  assert.equal(diario(e).filter(x => x.acao === 'valor-conferido').length, 0);
});

test('revisão acabamento: o Histórico da ficha diz o valor das entregas conferidas em R$ (D1)', () => {
  const ctx = vm.createContext({console, Date, document: {querySelector: () => null, querySelectorAll: () => [], addEventListener() {}}, window: {}, localStorage: {getItem: () => null},
    STORE: {getAllOS: () => [], getCFG: () => ({}), getOS: () => null}, setTimeout() {}});
  for (const f of ['operacao.js', 'entrega-item.js', 'conferencia-entrega.js', 'app.js']) vm.runInContext(ler(f), ctx, {filename: f});
  ctx.__st = {entradas: [{acao: 'valor-conferido', em: '2026-10-12T12:00:00Z', autor: {nome: 'Gestor Teste', papel: 'pcp'}, origem: 'tela',
    campos: ['valorConferido'], antes: {valorConferido: 25000}, depois: {valorConferido: 12500}}]};
  const html = vm.runInContext('htmlHistoricoAlteracoes(__st)', ctx);
  assert.match(html, /O valor das entregas conferidas mudou/);
  assert.match(html, /Valor das entregas conferidas<\/strong>: R\$\s250,00 → R\$\s125,00/);
});

/* A ficha (app.js) num contexto de mentira, para o Histórico e a lista de itens. */
function ficha(papel = 'pcp', extra = {}) {
  const ctx = vm.createContext({console, Date, document: {querySelector: () => null, querySelectorAll: () => [], addEventListener() {}}, window: {}, localStorage: {getItem: () => null},
    STORE: {getAllOS: () => [], getCFG: () => ({}), getOS: () => null}, setTimeout() {}, ...extra});
  for (const f of ['operacao.js', 'entrega-item.js', 'conferencia-entrega.js', 'controle-entrega-ui.js', 'app.js']) vm.runInContext(ler(f), ctx, {filename: f});
  vm.runInContext(`STATE.user = {nome: 'Pessoa Teste', papel: ${JSON.stringify(papel)}};`, ctx);
  return ctx;
}
const INTEGRIDADE = () => import('../supabase/functions/_shared/pcp-integridade.mjs');
test('revisão acabamento: o Histórico diz "Edição recusada" e o que a pessoa TENTOU mudar (U2)', async () => {
  const I = await INTEGRIDADE();
  const lapide = {id: 'x', rev: 3, numero: '7001', obsTecnicas: 'antiga fictícia'};
  const diff = I.diffEdicaoRecusada(lapide, {...lapide, obsTecnicas: 'edição fictícia feita sem sinal'});
  const entrada = I.entradaAuditoria({id: 'a1', osId: 'x', numero: '7001', acao: 'edicao-recusada', diff, autor: {nome: 'Gestor Teste', papel: 'pcp'}, origem: 'tela', em: '2026-10-12T12:00:00Z'});
  const ctx = ficha();
  ctx.__st = {entradas: [entrada]};
  const html = vm.runInContext('htmlHistoricoAlteracoes(__st)', ctx);
  // Caso ruim (acfaae1): a ação não tinha rótulo e lia "Alterou", com "antiga → nova" como se tivesse gravado.
  assert.doesNotMatch(html, /<br>Alterou</);
  assert.match(html, /Edição recusada: a O\.S\. estava excluída; nada foi gravado/);
  assert.match(html, /tentou mudar de antiga fictícia para edição fictícia feita sem sinal \(não gravado\)/);
  assert.doesNotMatch(html, /antiga fictícia → /);
  // Entregas por O.S. usa o mesmo texto.
  ctx.__a = entrada;
  for (const f of ['entregas-os.js']) vm.runInContext(ler(f), ctx, {filename: f});
  assert.match(vm.runInContext('porOSDescreverCampo("obsTecnicas", __a)', ctx), /tentou mudar de antiga fictícia para/);
});

test('revisão acabamento: o Histórico diz que os valores foram repostos, com os itens, sem nome interno (U2)', async () => {
  const I = await INTEGRIDADE();
  const antigo = {id: 'r', itens: [{uid: '8101:1:1', item: '1', descricao: 'Placa ACM fictícia', qtde: '10', valorUnit: '100', subtotal: '1000'}]};
  const novo = {id: 'r', itens: [{uid: 'm-pdf000000001', item: '1', descricao: 'Lona do PDF fictícia', qtde: '3', valorUnit: '10', subtotal: 30, manual: true}]};
  const gv = I.guardarValoresPCP(novo, antigo);
  assert.ok(gv.diario, 'a gravação tem linha de diário');
  const entrada = I.entradaAuditoria({id: 'a2', osId: 'r', acao: 'repor-valores', diff: gv.diario, autor: {nome: 'Operação Teste', papel: 'operacao'}, origem: 'tela', em: '2026-10-12T12:00:00Z'});
  const ctx = ficha();
  ctx.__st = {entradas: [entrada]};
  const html = vm.runInContext('htmlHistoricoAlteracoes(__st)', ctx);
  // Caso ruim (acfaae1): "Alterou" e "itens.valores: (vazio) → (vazio)", o nome interno e nada do que aconteceu.
  assert.doesNotMatch(html, /itens\.valores|\(vazio\) → \(vazio\)|<br>Alterou</);
  assert.match(html, /Valores dos itens repostos: quem gravou não muda valor, e os valores gravados ficaram/);
  assert.match(html, /<strong>Valores dos itens<\/strong>: voltaram com o valor gravado: item 1 \(Placa ACM fictícia\) · item novo sem o valor enviado \(só a gestão grava valor\): item 1 \(Lona do PDF fictícia\)/);
  assert.doesNotMatch(html, /R\$|1000/, 'sem R$');
});

/* U4: os textos que mandavam para ações que sumiram com as marcas só leitura (D-016). */
const marcaAntiga = (id, qtde) => ({id, tipo: 'entregue', qtde, dia: '2026-09-20', via: 'gestao', por: 'Gestor Teste', porId: '111222', em: '2026-09-20T12:00:00Z'});
const osMarcaAntiga = () => ({id: 'u4', numero: '93204', rev: 1, tipo: 'externo', cliente: 'Cliente fictício', itens: [
  {uid: 'm-u4000000001', item: '1', descricao: 'Placa manual fictícia', qtde: '4', manual: true, entregas: [marcaAntiga('ma-1', 6)]},
  {uid: 'm-u4000000002', item: '2', descricao: 'Lona fictícia', qtde: '3', manual: true, entregas: [{...marcaAntiga('ma-2', 0), tipo: 'problema', motivo: 'Estrutura amassada fictícia'}]}]});
test('revisão acabamento: o saldo negativo e o item que fica não mandam ao "Avise o PCP" nem ao "Cancelar item" (U4)', () => {
  const g = ficha('pcp');
  g.__os = osMarcaAntiga();
  const html = vm.runInContext('blocoItens(__os, false, 0)', g);
  // Caso ruim (acfaae1): o próprio PCP lia "Avise o PCP.", e o cadeado mandava ao "Cancelar item", que sumiu.
  assert.match(html, /⚠ Saldo -2/);
  assert.doesNotMatch(html, /Avise o PCP|desfaça a marca a mais|a gestão usa Cancelar item/);
  assert.match(html, /Confira a quantidade do item e a entrega em &quot;Conferir itens e equipe&quot;|Confira a quantidade do item e a entrega em "Conferir itens e equipe"/);
  assert.match(html, /title="Item com marca de entrega não sai da lista\. O saldo que falta se confere em &quot;Conferir itens e equipe&quot;/);
  const m = ficha('montagem');
  m.__os = osMarcaAntiga();
  const hm = vm.runInContext('blocoItens(__os, false, 0)', m);
  assert.doesNotMatch(hm, /Avise o PCP|desfaça a marca a mais/);
  assert.match(hm, /Quem confere e corrige a entrega dos itens é a gestão do PCP, em "Conferir itens e equipe"/);
});

test('revisão acabamento: o Finalizar com item com problema não manda "resolver no item" (U4)', () => {
  const caixa = {};
  const doc = {querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, getElementById: () => null, body: {appendChild() {}},
    createElement: () => Object.assign(caixa, {querySelectorAll: () => [], querySelector: () => null, remove() {}})};
  const g = ficha('pcp', {document: doc});
  g.__os = osMarcaAntiga();
  vm.runInContext(`perguntarSaldoEntrega(__os, {pendentes: [], comProblema: [{it: __os.itens[1], s: {problema: {motivo: 'Estrutura amassada fictícia'}}}], unidades: 0}, () => {})`, g);
  // Caso ruim (acfaae1): "fica com problema; resolva no item", e o item não tem mais o que resolver.
  assert.doesNotMatch(caixa.innerHTML, /resolva no item/);
  assert.match(caixa.innerHTML, /fica com problema; o saldo dele se confere em &quot;Conferir itens e equipe&quot;/);
});

test('revisão acabamento: os avisos do remover, da quantidade, do celular e do servidor apontam para a conferência (U4)', async () => {
  const app = ler('app.js'), cel = ler('equipe.js');
  // Caso ruim (acfaae1): o remover dizia "a gestão usa Cancelar item"; a quantidade, ao PCP, "fale com o PCP"; o celular, "Para desfazer, fale com o PCP".
  assert.match(app, /tem marca de entrega e não sai da lista\. \$\{marcasSoLeituraFicha\(\) \? `O saldo que falta se confere em \$\{ONDE_CONFERIR_FICHA\}, pela gestão\.`/);
  assert.match(app, /marcasSoLeituraFicha\(\) \? \(gestaoDaFicha\(\) \? `confira a entrega em \$\{ONDE_CONFERIR_FICHA\}`/);
  assert.match(cel, /marcasNovasCel\(\) \? 'A entrega declarada continua registrada\. Para desfazer, fale com o PCP\.'\s*: 'A entrega declarada continua registrada\. Quem confere a entrega dos itens é a gestão do PCP/);
  const I = await INTEGRIDADE();
  const antes = {itens: [{uid: '8101:1:1', item: '1', descricao: 'Placa fictícia', qtde: '10', entregas: [marcaAntiga('e-seis', 6)]}, {uid: '8101:2:1', item: '2', descricao: 'Adesivo fictício', qtde: '1'}]};
  const r = I.guardarEntregasItens({itens: [structuredClone(antes.itens[1])]}, antes, {papel: 'pcp', avisar: true, agora: new Date().toISOString()});
  const aviso = r.avisos.join(' ');
  assert.match(aviso, /continua na O\.S\./);
  assert.doesNotMatch(aviso, /Cancelar item/);
  assert.match(aviso, /O saldo que falta se confere em "Conferir itens e equipe"/);
});
