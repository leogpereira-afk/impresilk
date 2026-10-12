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
  assert.match(html, /<strong>Obs técnicas<\/strong>: tentou mudar de antiga fictícia para edição fictícia feita sem sinal \(não gravado\)/, 'com o nome do campo como a ficha o chama');
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

/* U1: a O.S. aberta tinha "Entrega · a entregar (N)" em cada item e nenhum caminho para conferir. */
const osAberta = () => ({id: 'u1', numero: '93211', rev: 1, tipo: 'externo', cliente: 'Cliente fictício', itens: [
  {uid: 'm-u1000000001', item: '1', descricao: 'Placa fictícia', qtde: '2', manual: true},
  {uid: 'm-u1000000002', item: '2', descricao: 'Adesivo fictício', qtde: '1', manual: true}]});
test('revisão acabamento: a O.S. aberta tem, uma vez no bloco de itens, o "Conferir itens e equipe" para a gestão (U1)', async () => {
  const ouvintes = [], abertas = [];
  const doc = {querySelector: () => null, querySelectorAll: () => [], addEventListener: (t, f) => ouvintes.push([t, f])};
  const g = ficha('pcp', {document: doc, conferirItensEntrega: async id => { abertas.push(id); }, perfErroTxt: String, toast() {}});
  g.__os = osAberta();
  const html = vm.runInContext('blocoItens(__os, false, 0)', g);
  // Caso ruim (acfaae1): a linha "Entrega · a entregar" de cada item e nenhum botão nem caminho.
  assert.match(html, /a entregar \(2\)/);
  const botoes = html.match(/<button[^>]*data-controle="itens" data-controle-os="u1"[^>]*>Conferir itens e equipe<\/button>/g) || [];
  assert.equal(botoes.length, 1, 'uma vez no bloco, não um por item');
  assert.match(html, /2 itens a entregar\. A entrega dos itens se confere pela gestão, por unidade e dia:/);
  assert.ok(html.indexOf('ent-conferir') < html.indexOf('<table class="items-table'), 'acima da lista de itens');
  // O botão abre a conferência daquela O.S. (o mesmo caminho de Conferência e acompanhamento).
  const clique = ouvintes.find(([t]) => t === 'click')[1];
  clique({target: {closest: () => ({dataset: {controle: 'itens', controleOs: 'u1'}})}, preventDefault() {}});
  await new Promise(r => setTimeout(r, 5));
  assert.deepEqual(abertas, ['u1']);
  // Finalizada: sem o caminho (a conferência fica em Conferência e acompanhamento).
  g.__os = {...osAberta(), finalizadaEm: '2026-10-10T12:00:00Z'};
  assert.doesNotMatch(vm.runInContext('blocoItens(__os, false, 0)', g), /class="ent-conferir"/);
  // Com conferência gravada: o saldo é o da conferência.
  g.__os = osBase();
  assert.match(vm.runInContext('blocoItens(__os, false, 0)', g), /2 unidades a conferir\. A entrega dos itens se confere pela gestão/);
});

test('revisão acabamento: quem não é gestão lê na O.S. aberta quem confere a entrega e onde (U1)', () => {
  for (const papel of ['montagem', 'operacao']) {
    const m = ficha(papel);
    m.__os = osAberta();
    const html = vm.runInContext('blocoItens(__os, false, 0)', m);
    assert.doesNotMatch(html, /data-controle="itens"/, papel + ': sem o botão da gestão');
    assert.match(html, /<p class="ent-conferir" role="note">2 itens a entregar\. A entrega dos itens não se marca na ficha: quem confere é a gestão do PCP, em &quot;Conferir itens e equipe&quot; \(na ficha, em Conferência e acompanhamento\)\.<\/p>/, papel);
  }
});

/* U3: a classificação em lote da Conferência operacional. */
const R = require('../operacao-revisao.js');
function dialogoOp(lista, cfgInicial) {
  const els = new Map(), salvas = [];
  let cfg = cfgInicial, corpo = '';
  const el = sel => { if (!els.has(sel)) els.set(sel, {sel, value: '', innerHTML: '', textContent: ''}); return els.get(sel); };
  const ctx = vm.createContext({console, Date, structuredClone, STATE: {user: {nome: 'Gestor Teste', papel: 'pcp'}},
    STORE: {getCFG: () => cfg, getAllOS: () => lista, getOS: () => null, saveCFG: c => { salvas.push(c); cfg = c; }, trySync: async () => {}, getQueue: () => []},
    perfPodeEditar: () => true, veiculosRH: () => [], esc: s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'), perfErroTxt: e => String(e),
    perfDialog: (_t, c) => { corpo = c; return {querySelector: el}; }, FormData: class { constructor(f) { this.v = f.valores; } get(k) { return k in this.v ? this.v[k] : null; } }});
  for (const f of ['operacao.js', 'operacao-revisao.js']) vm.runInContext(ler(f), ctx, {filename: f});
  vm.runInContext('abrirRevisaoOperacional()', ctx);
  const enviar = async valores => { const form = el('form'); form.valores = valores; await form.onsubmit({preventDefault() {}, target: form}); return el('#op-revisao-status').textContent; };
  return {el, salvas, enviar, corpo: () => corpo, cfg: () => cfg};
}
const DESCRICOES = ['Adesivagem de vitrine', 'adesivo', 'Fachada e comunicação visual', 'Fachada em ACM', 'Placa ADESIVADA fictícia'];

test('revisão acabamento: o lote pega a palavra inteira ou o começo dela, nunca o meio (U3)', () => {
  // Caso ruim (acfaae1): "ad" pegava as 5, inclusive "Fachada e comunicação visual" e "Fachada em ACM" (o "ad" de fachADa).
  assert.deepEqual(R.paraLote(DESCRICOES, 'ad', {}), ['Adesivagem de vitrine', 'adesivo', 'Placa ADESIVADA fictícia']);
  assert.deepEqual(R.paraLote(DESCRICOES, 'acm', {}), ['Fachada em ACM']);
  assert.deepEqual(R.paraLote(DESCRICOES, 'comunicacao vis', {}), ['Fachada e comunicação visual'], 'sem acento, e a busca de duas palavras');
  assert.deepEqual(R.paraLote(DESCRICOES, 'sivo', {}), [], 'o meio da palavra não vale');
  assert.deepEqual(R.paraLote(['Placa (A) fictícia'], '(a', {}), ['Placa (A) fictícia'], 'o parêntese da busca não quebra');
});

test('revisão acabamento: a categoria do lote começa em "Selecione" e o lote sem categoria não salva (U3)', async () => {
  const d = dialogoOp(DESCRICOES.map((s, i) => ({id: 'o' + i, servico: s})), {categoriasServico: []});
  // Caso ruim (acfaae1): o select começava em "Adesivos", e quem não escolhia classificava em Adesivos.
  assert.match(d.corpo(), /<select name="loteCategoria"><option value="">Selecione<\/option><option>Adesivos<\/option>/);
  assert.match(d.corpo(), /<select name="categoria"><option value="">Selecione<\/option>/);
  const base = {loteBusca: 'ad', loteCategoria: '', loteMotivo: 'Revisão fictícia dos adesivos de outubro', loteConfirma: 'on'};
  assert.match(await d.enviar(base), /Escolha a categoria do lote/);
  assert.equal(d.salvas.length, 0, 'nada salvo sem categoria');
  assert.match(await d.enviar({descricao: 'adesivo', categoria: ''}), /Escolha a categoria da descrição/);
  assert.equal(d.salvas.length, 0);
});

test('revisão acabamento: a prévia mostra TODAS as descrições, com caixa para tirar uma por uma, e só as marcadas entram (U3)', async () => {
  const muitas = Array.from({length: 60}, (_, i) => `Adesivo fictício ${String(i + 1).padStart(2, '0')}`);
  const d = dialogoOp(muitas.map((s, i) => ({id: 'm' + i, servico: s})), {categoriasServico: []});
  d.el('[name=loteBusca]').value = 'adesivo';
  d.el('[name=loteBusca]').oninput();
  const previa = d.el('#op-lote-previa').innerHTML;
  // Caso ruim (acfaae1): a prévia mostrava 50 e "e mais 10", sem caixa: a gestão não via nem tirava as outras.
  assert.doesNotMatch(previa, /e mais/);
  assert.equal((previa.match(/<input type="checkbox" data-lote-item value="[^"]+" checked>/g) || []).length, 60, 'as 60, marcadas');
  assert.match(previa, /class="op-lote-lista"/);
  assert.match(d.el('#op-lote-conta').textContent, /as 60 descrições marcadas/);
  // Tira duas.
  for (const v of ['Adesivo fictício 07', 'Adesivo fictício 60']) d.el('#op-lote-previa').onchange({target: {dataset: {loteItem: ''}, value: v, checked: false}});
  assert.match(d.el('#op-lote-conta').textContent, /as 58 descrições marcadas/);
  d.el('[name=loteBusca]').oninput();
  assert.match(d.el('#op-lote-previa').innerHTML, /value="Adesivo fictício 07" >/, 'a desmarcada continua desmarcada ao repintar');
  await d.enviar({loteBusca: 'adesivo', loteCategoria: 'Adesivos', loteMotivo: 'Revisão fictícia dos adesivos de outubro', loteConfirma: 'on'});
  assert.equal(d.salvas.length, 1);
  const cats = d.salvas[0].categoriasServico;
  assert.equal(cats.length, 58);
  assert.ok(!cats.some(x => ['Adesivo fictício 07', 'Adesivo fictício 60'].includes(x.descricao)), 'as tiradas não entram');
  const lote = d.salvas[0].lotesCategoria[0];
  assert.deepEqual([lote.busca, lote.categoria, lote.descricoes.length], ['adesivo', 'Adesivos', 58]);
  assert.ok(cats.every(x => x.lote === lote.id), 'cada categoria leva o lote');
});

test('revisão acabamento: "Desfazer este lote" devolve as descrições à classificação de antes, com motivo, e a reclassificada depois fica (U3)', async () => {
  const lista = DESCRICOES.map((s, i) => ({id: 'o' + i, servico: s}));
  const d = dialogoOp(lista, {categoriasServico: [{descricao: 'Fachada em ACM', categoria: 'Fachadas'}]});
  await d.enviar({loteBusca: 'ad', loteCategoria: 'Letreiros', loteMotivo: 'Lote fictício feito por engano na revisão', loteConfirma: 'on'});
  const cfg1 = d.cfg();
  assert.equal(cfg1.categoriasServico.filter(x => x.categoria === 'Letreiros').length, 3);
  // A gestão reclassifica uma do lote, uma a uma, depois.
  const cfg2 = structuredClone(cfg1);
  cfg2.categoriasServico = cfg2.categoriasServico.filter(x => x.descricao !== 'adesivo').concat({descricao: 'adesivo', categoria: 'Adesivos', por: 'Gestor Teste', em: '2026-10-12T13:00:00Z'});
  const d2 = dialogoOp(lista, cfg2);
  const id = cfg2.lotesCategoria[0].id;
  // Caso ruim (acfaae1): não havia registro do lote nem como desfazê-lo.
  assert.match(d2.corpo(), new RegExp(`<button type="button" class="btn-ghost btn-sm" data-lote-desfazer="${id}">Desfazer este lote</button>`));
  assert.match(d2.corpo(), /<strong>Letreiros<\/strong> · 3 descrições · palavra "ad"/);
  const clicar = () => d2.el('#op-lotes').onclick({target: {closest: () => ({dataset: {loteDesfazer: id}})}});
  d2.el(`[data-lote-motivo="${id}"]`).value = 'curto';
  await clicar();
  assert.match(d2.el('#op-revisao-status').textContent, /motivo para desfazer o lote, com 15 letras/);
  assert.equal(d2.salvas.length, 0);
  d2.el(`[data-lote-motivo="${id}"]`).value = 'Lote feito por engano: não são letreiros';
  await clicar();
  assert.equal(d2.salvas.length, 1);
  const c = d2.salvas[0];
  assert.deepEqual(c.categoriasServico.map(x => [x.descricao, x.categoria]).sort(), [['Fachada em ACM', 'Fachadas'], ['adesivo', 'Adesivos']], 'as do lote voltam a ficar sem categoria; a reclassificada e a de antes ficam');
  assert.equal(c.lotesCategoria[0].desfeito.motivo, 'Lote feito por engano: não são letreiros');
  assert.equal(c.lotesCategoria[0].descricoes.length, 3, 'o registro do lote fica');
  assert.match(d2.el('#op-revisao-status').textContent, /Lote desfeito: 2 descrições voltaram a ficar sem categoria; 1 descrição já tinha outra classificação, feita depois, e ficou como está/);
  assert.match(d2.el(`[data-lote-status="${id}"]`).textContent, /Lote desfeito: 2 descrições voltaram/, 'a resposta aparece junto do botão');
  assert.match(d2.corpo(), new RegExp(`<p role="status" aria-live="polite" class="op-lote-status" data-lote-status="${id}"></p>`));
  assert.deepEqual(lista.map(o => o.servico), DESCRICOES, 'nenhuma O.S. muda');
});

test('revisão acabamento: o servidor assina o lote e o desfazer, guarda o lote de cada categoria, e não deixa o registro mudar (nunca 422) (U3)', async () => {
  const e = await edge('pcp-sync', {pcp_registros: [], registros: structuredClone(FICHAS), pcp_config_global: [{id: true, config: {instaladores: []}, atualizado_em: '2026-10-01T10:00:00Z'}]});
  const base = structuredClone(e.db.pcp_config_global[0].config);
  const lote = {id: 'lote-ficticio-1', busca: 'ad', categoria: 'Adesivos', motivo: 'Revisão fictícia dos adesivos de outubro', descricoes: ['adesivo'], por: 'forjado', em: '2020-01-01'};
  const r = await e.call({action: 'setCfg', baseCfg: base, cfg: {...base, categoriasServico: [{descricao: 'adesivo', categoria: 'Adesivos', motivo: lote.motivo, lote: lote.id}], lotesCategoria: [lote]}}, GESTOR);
  assert.equal(r.status, 200, JSON.stringify(r));
  // Caso ruim (acfaae1): a porta não conhecia o lote (o pcp nem gravava a chave) e tirava o lote de cada categoria.
  assert.equal(r.cfg.categoriasServico[0].lote, 'lote-ficticio-1');
  const g = r.cfg.lotesCategoria[0];
  assert.deepEqual([g.id, g.categoria, g.descricoes, g.por], ['lote-ficticio-1', 'Adesivos', ['adesivo'], 'Gestor Teste']);
  assert.notEqual(g.em, '2020-01-01');
  // Mudar o registro (outra categoria) não passa: fica o gravado, com aviso, 200.
  const r2 = await e.call({action: 'setCfg', baseCfg: r.cfg, cfg: {...r.cfg, lotesCategoria: [{...g, categoria: 'Fachadas'}]}}, GESTOR);
  assert.equal(r2.status, 200, JSON.stringify(r2));
  assert.equal(r2.cfg.lotesCategoria[0].categoria, 'Adesivos');
  assert.ok((r2.avisos || []).some(a => /registro de lote de categorias não foi gravado/.test(a)), JSON.stringify(r2.avisos));
  // O desfazer: tira as categorias do lote e acrescenta `desfeito`, assinado.
  const base3 = e.db.pcp_config_global[0].config;
  const r3 = await e.call({action: 'setCfg', baseCfg: base3, cfg: {...base3, categoriasServico: [], lotesCategoria: [{...g, desfeito: {motivo: 'Lote feito por engano na revisão fictícia', por: 'forjado', em: '2020-01-01'}}]}}, GESTOR);
  assert.equal(r3.status, 200, JSON.stringify(r3));
  assert.deepEqual(r3.cfg.categoriasServico, []);
  assert.deepEqual([r3.cfg.lotesCategoria[0].desfeito.motivo, r3.cfg.lotesCategoria[0].desfeito.por], ['Lote feito por engano na revisão fictícia', 'Gestor Teste']);
  assert.equal(r3.cfg.lotesCategoria[0].descricoes.length, 1, 'o registro fica');
});

test('revisão acabamento: a resposta do desfazer concorda no plural e diz "nenhuma" (U3)', async () => {
  const lote = {id: 'lote-x', busca: 'placa', categoria: 'Sinalização', motivo: 'Lote fictício das placas de obra', descricoes: ['Placa fictícia A', 'Placa fictícia B'], por: 'Gestor Teste', em: '2026-10-11T12:00:00Z'};
  const d = dialogoOp([], {categoriasServico: [{descricao: 'Placa fictícia A', categoria: 'Fachadas'}, {descricao: 'Placa fictícia B', categoria: 'Fachadas'}], lotesCategoria: [lote]});
  d.el('[data-lote-motivo="lote-x"]').value = 'Lote fictício feito por engano na revisão';
  await d.el('#op-lotes').onclick({target: {closest: () => ({dataset: {loteDesfazer: 'lote-x'}})}});
  // Caso ruim (primeira versão da correção): "0 descrições voltaram" e "2 descrições já tinham ... e ficou como está".
  assert.match(d.el('#op-revisao-status').textContent, /Lote desfeito: nenhuma descrição voltou a ficar sem categoria; 2 descrições já tinham outra classificação, feita depois, e ficaram como estão\./);
});
