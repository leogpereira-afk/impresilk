/* PORTA DO SERVIDOR PARA item.entregas (E3 do plano de entrega por item,
   29/09/2026). A marca de entrega por item é dado que vira dinheiro: só
   acréscimo, só de admin, pcp e operação com senha (balcão), cancelar e
   desfazer só admin e pcp, autor e hora do crachá e do servidor, quantidade
   conferida contra o saldo pelo motor (ENTREGA_ITEM). Nada disso é 422: o que
   não passa é descartado com aviso e o resto da gravação segue. Cada teste
   começa pelo caso ruim. Dados fictícios (repositório público). */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {edge} = require('./helpers/edge.cjs');
const shared = () => import('../supabase/functions/_shared/pcp-integridade.mjs');

const ficha = (id, nome, apelido, cpf) => ({colecao:'colaboradores', id, apagado:false, registro:{id, nome, apelido, cpf}});
const FICHAS = [
  ficha('ana-f', 'Ana Fictícia', 'ana', '10000111111'),
  ficha('gestor-f', 'Gestor Teste', 'gestor', '11122233344'),
  ficha('olga-f', 'Olga Balcão', 'operacao1', '12312312312'),
];
const ITENS = () => [
  {uid:'8001:1:1', item:'1', descricao:'Placa ACM', qtde:'10', valorUnit:'100', subtotal:'1000'},
  {uid:'8001:2:1', item:'2', descricao:'Adesivo vitrine', qtde:'1', valorUnit:'500', subtotal:'500'},
  {uid:'8001:3:1', item:'3', descricao:'Servicos de instalação', qtde:'1', valorUnit:'200', subtotal:'200'},
];
const row = (id, registro, extra = {}) => ({id, colecao:'os', apagado:false, atualizado_em:'2026-09-19T10:00:00Z', ...extra, registro:{id, rev:1, ...registro}});
const base = (extra = {}) => row('1', {numero:'8001', tipo:'externo', origemMubisys:true, cliente:'Cliente Fictício', equipe:['100001'],
  liberadoPCP:true, confirmacao:'Confirmado', itens:ITENS(), ...extra});
const banco = (regs = [base()]) => ({pcp_registros:regs, registros:structuredClone(FICHAS),
  pcp_config_global:[{id:true, config:{instaladores:['Ana']}, atualizado_em:'2026-09-19T10:00:00Z'}],
  equipe_contas:[{sistema:'pcp', usuario:'montagem1'}]});
const admin = {papel:'admin', nome:'Admin Teste', sub:'admin1'};
const gestor = {papel:'pcp', nome:'Gestor Teste', sub:'gestor'};
const operacao = {papel:'operacao', nome:'Olga Balcão', sub:'operacao1'};
const montagem = {papel:'montagem', nome:'Conta Montagem', sub:'montagem1'};
const comercial = {papel:'comercial', nome:'Comercial Teste', sub:'comercial1'};
const toque = {nome:'Ana', sub:'Ana', id:'100001', papel:'montagem', montagemIndividual:true};
const gravada = (e, id = '1') => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === id).registro;
const copia = (e, id = '1') => structuredClone(gravada(e, id));
const diario = e => e.db.pcp_registros.filter(r => r.colecao === 'auditoria').map(r => r.registro);
const ONTEM = '2026-09-28';
const ev = (id, tipo, extra = {}) => ({id, tipo, dia:ONTEM, ...extra});
// A O.S. gravada com `eventos` acrescentados ao item `uid` (o que o aparelho manda).
function comMarca(os, uid, ...eventos) {
  const o = structuredClone(os);
  const it = o.itens.find(i => i.uid === uid);
  it.entregas = [...(it.entregas || []), ...eventos];
  return o;
}
const entregas = (e, uid) => (gravada(e).itens.find(i => i.uid === uid) || {}).entregas || [];

/* ── Quem não marca ────────────────────────────────────────────────────── */

test('comercial (só leitura) leva 403 e nada grava', async () => {
  const e = await edge('pcp-sync', banco());
  const r = await e.call({action:'upsert', os:comMarca(copia(e), '8001:1:1', ev('e-com1', 'entregue', {qtde:2}))}, comercial);
  assert.equal(r.status, 403);
  assert.deepEqual(entregas(e, '8001:1:1'), []);
});

test('crachá sem senha (toque, E5): a entrega grava DECLARADA, com o autor do crachá; o resto grava junto', async () => {
  const e = await edge('pcp-sync', banco());
  const os = comMarca(copia(e), '8001:1:1', ev('e-toq1', 'entregue', {qtde:10}));
  os.obsTecnicas = 'Fixado com parafuso';
  const r = await e.call({action:'upsert', os}, toque);
  assert.equal(r.status, 200);
  const [m] = entregas(e, '8001:1:1');
  assert.deepEqual([m.id, m.tipo, m.qtde, m.via, m.declarado, m.por, m.porId], ['e-toq1', 'entregue', 10, 'toque', true, 'Ana', '100001']);
  assert.equal(gravada(e).obsTecnicas, 'Fixado com parafuso', 'o trabalho do celular grava');
  assert.equal(r.descartado, undefined);
});

test('máquina (integração) não grava marca de entrega', async () => {
  const e = await edge('pcp-sync', banco());
  const r = await e.call({action:'upsert', os:comMarca(copia(e), '8001:1:1', ev('e-maq1', 'entregue', {qtde:10}))});
  assert.equal(r.ok, true);
  assert.deepEqual(entregas(e, '8001:1:1'), []);
});

test('montagem com senha (E5): entrega grava declarada, via toque; problema, cancelar e desfazer são descartados com aviso, resposta 200', async () => {
  const e = await edge('pcp-sync', banco());
  let r = await e.call({action:'upsert', os:comMarca(copia(e), '8001:1:1', ev('e-mon1', 'entregue', {qtde:1}))}, montagem);
  assert.equal(r.status, 200);
  assert.deepEqual(entregas(e, '8001:1:1').map(m => [m.id, m.via, m.declarado, m.por]), [['e-mon1', 'toque', true, 'Conta Montagem']]);
  r = await e.call({action:'upsert', os:comMarca(copia(e), '8001:1:1', ev('e-mon2', 'problema', {motivo:'chuva'}), ev('e-mon3', 'desfeito', {alvo:'e-mon1', motivo:'errei'}))}, montagem);
  assert.equal(r.status, 200);
  assert.deepEqual(entregas(e, '8001:1:1').map(m => m.id), ['e-mon1']);
  assert.match(r.avisos.join(' '), /montagem/);
  assert.deepEqual(r.descartado, ['entregas']);
});

/* ── Balcão: operação com senha ────────────────────────────────────────── */

test('operação com senha entrega pelo balcão; autor, ID, hora e via falsificados são trocados pelo crachá e pelo servidor', async () => {
  const e = await edge('pcp-sync', banco());
  const antes = Date.now();
  const r = await e.call({action:'upsert', os:comMarca(copia(e), '8001:1:1',
    ev('e-op1', 'entregue', {qtde:6, porId:'999999', por:'Outra Pessoa', em:'2020-01-01T00:00:00Z', via:'gestao', valor:12345}))}, operacao);
  assert.equal(r.ok, true);
  const [m] = entregas(e, '8001:1:1');
  assert.equal(m.id, 'e-op1');
  assert.equal(m.qtde, 6);
  assert.equal(m.via, 'balcao', 'o via sai do papel, não do aparelho');
  assert.equal(m.porId, '123123', 'o ID é o do crachá (ficha do RH), não o que o aparelho mandou');
  assert.equal(m.por, 'Olga Balcão');
  assert.ok(Date.parse(m.em) >= antes - 1000, 'a hora é a do servidor');
  assert.equal(m.valor, undefined, 'campo fora do formato não entra');
});

test('operação não cancela nem desfaz: descartado com aviso, a entrega fica', async () => {
  const e = await edge('pcp-sync', banco());
  await e.call({action:'upsert', os:comMarca(copia(e), '8001:1:1', ev('e-op2', 'entregue', {qtde:4}))}, operacao);
  const r = await e.call({action:'upsert', os:comMarca(copia(e), '8001:1:1',
    ev('e-op3', 'desfeito', {alvo:'e-op2', motivo:'Errei'}), ev('e-op4', 'cancelado', {motivo:'Cliente desistiu'}))}, operacao);
  assert.equal(r.status, 200);
  assert.deepEqual(entregas(e, '8001:1:1').map(m => m.id), ['e-op2']);
  assert.equal(r.avisos.filter(a => /não foi gravada/.test(a)).length, 2);
  assert.match(r.avisos.join(' '), /operação/);
});

test('admin e pcp desfazem e cancelam; o autor é o crachá', async () => {
  const e = await edge('pcp-sync', banco());
  await e.call({action:'upsert', os:comMarca(copia(e), '8001:1:1', ev('e-g1', 'entregue', {qtde:4}))}, gestor);
  let r = await e.call({action:'upsert', os:comMarca(copia(e), '8001:1:1', ev('e-g2', 'desfeito', {alvo:'e-g1', motivo:'Contou errado'}))}, admin);
  assert.equal(r.avisos, undefined);
  r = await e.call({action:'upsert', os:comMarca(copia(e), '8001:1:1', ev('e-g3', 'cancelado', {motivo:'Cliente desistiu do saldo'}))}, gestor);
  const ms = entregas(e, '8001:1:1');
  assert.deepEqual(ms.map(m => [m.id, m.tipo, m.via]), [['e-g1', 'entregue', 'gestao'], ['e-g2', 'desfeito', 'gestao'], ['e-g3', 'cancelado', 'gestao']]);
  assert.equal(ms[0].porId, '111222');
  assert.equal(ms[1].por, 'Admin Teste');
});

/* ── Saldo, dia e teto: o motor da E2 decide ───────────────────────────── */

test('soma maior que a quantidade é descartada com aviso e resposta 200; o resto da gravação passa', async () => {
  const e = await edge('pcp-sync', banco());
  await e.call({action:'upsert', os:comMarca(copia(e), '8001:1:1', ev('e-s1', 'entregue', {qtde:6}))}, gestor);
  const os = comMarca(copia(e), '8001:1:1', ev('e-s2', 'entregue', {qtde:5}));
  os.obsPCP = 'segunda gravação';
  const r = await e.call({action:'upsert', os}, gestor);
  assert.equal(r.status, 200);
  assert.equal(r.ok, true);
  assert.deepEqual(entregas(e, '8001:1:1').map(m => m.id), ['e-s1']);
  assert.match(r.avisos.join(' '), /faltam 4 de 10/);
  assert.equal(gravada(e).obsPCP, 'segunda gravação');
  // Duas partes na mesma gravação: a segunda é conferida contra o saldo que a primeira deixou.
  const r2 = await e.call({action:'upsert', os:comMarca(copia(e), '8001:1:1', ev('e-s3', 'entregue', {qtde:3}), ev('e-s4', 'entregue', {qtde:3}))}, gestor);
  assert.deepEqual(entregas(e, '8001:1:1').map(m => m.id), ['e-s1', 'e-s3']);
  assert.match(r2.avisos.join(' '), /faltam 1 de 10/);
});

test('dia no futuro, item de serviço e quantidade quebrada são recusados com aviso', async () => {
  const e = await edge('pcp-sync', banco());
  let os = comMarca(copia(e), '8001:1:1', ev('e-f1', 'entregue', {qtde:1, dia:'2099-01-01'}));
  os = comMarca(os, '8001:3:1', ev('e-f2', 'entregue'));
  os = comMarca(os, '8001:2:1', ev('e-f3', 'entregue', {qtde:'1,5'}));
  const r = await e.call({action:'upsert', os}, gestor);
  assert.equal(r.status, 200);
  for (const uid of ['8001:1:1', '8001:2:1', '8001:3:1']) assert.deepEqual(entregas(e, uid), [], uid);
  const txt = r.avisos.join(' ');
  assert.match(txt, /depois de hoje/);
  assert.match(txt, /serviço/);
  assert.match(txt, /Quantidade inválida/);
});

test('O.S. finalizada não recebe marca nova; finalizar junto com a marca, na mesma gravação, vale', async () => {
  const e = await edge('pcp-sync', banco([base({finalizadaEm:'2026-09-20T15:00:00Z', finalizadoPor:'Gestor Teste', entregaLancada:{data:'2026-09-20'}})]));
  let r = await e.call({action:'upsert', os:comMarca(copia(e), '8001:2:1', ev('e-fin1', 'entregue'))}, gestor);
  assert.equal(r.status, 200);
  assert.deepEqual(entregas(e, '8001:2:1'), []);
  assert.match(r.avisos.join(' '), /finalizada/);
  const e2 = await edge('pcp-sync', banco([base({fotosRetornoIds:['f1'], conferidoPor:'Gestor Teste'})]));
  const os = comMarca(copia(e2), '8001:2:1', ev('e-fin2', 'entregue'));
  os.finalizadaEm = new Date().toISOString(); os.finalizadoPor = 'Gestor Teste'; os.justificativaConclusao = 'Teste da marca junto com a finalização';
  r = await e2.call({action:'upsert', os}, gestor);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(entregas(e2, '8001:2:1').map(m => m.id), ['e-fin2']);
});

/* ── Só acréscimo e fila idempotente ───────────────────────────────────── */

test('aba antiga (v133) sem o campo e sem o código não apaga o evento; cópia que muda ou tira o evento também não', async () => {
  const e = await edge('pcp-sync', banco());
  await e.call({action:'upsert', os:comMarca(copia(e), '8001:1:1', ev('e-v1', 'entregue', {qtde:6}))}, gestor);
  const gravado = structuredClone(entregas(e, '8001:1:1'));
  // v133: a lista sem uid e sem entregas.
  const velha = copia(e);
  velha.itens = velha.itens.map(({uid: _u, entregas: _e, ...x}) => x);
  velha.obsPCP = 'aba antiga';
  let r = await e.call({action:'upsert', os:velha}, gestor);
  assert.equal(r.ok, true);
  assert.deepEqual(entregas(e, '8001:1:1'), gravado, 'o gravado volta');
  // Cópia que troca a quantidade do evento gravado e outra que o tira da lista.
  const mexida = copia(e);
  mexida.itens[0].entregas = [{...mexida.itens[0].entregas[0], qtde:10, dia:'2026-09-01', por:'Outro'}];
  r = await e.call({action:'upsert', os:mexida}, gestor);
  assert.deepEqual(entregas(e, '8001:1:1'), gravado, 'evento gravado não muda');
  const sem = copia(e);
  sem.itens[0].entregas = [];
  await e.call({action:'upsert', os:sem}, admin);
  assert.deepEqual(entregas(e, '8001:1:1'), gravado, 'evento gravado não some, nem pela gestão');
});

test('mesmo evento enviado duas vezes grava uma; o id repetido em outro item também não entra', async () => {
  const e = await edge('pcp-sync', banco());
  const marca = ev('e-d1', 'entregue', {qtde:2});
  const os = comMarca(copia(e), '8001:1:1', marca, marca);
  let r = await e.call({action:'upsert', os}, gestor);
  assert.equal(r.avisos, undefined, 'repetido é ignorado sem aviso');
  // A fila offline manda de novo (a resposta se perdeu e o rev já andou).
  r = await e.call({action:'upsert', os:comMarca(copia(e), '8001:1:1', marca)}, gestor);
  assert.deepEqual(entregas(e, '8001:1:1').map(m => [m.id, m.qtde]), [['e-d1', 2]]);
  // O mesmo id no item vizinho (item copiado na tela) não vira segunda entrega.
  await e.call({action:'upsert', os:comMarca(copia(e), '8001:2:1', ev('e-d1', 'entregue'))}, gestor);
  assert.deepEqual(entregas(e, '8001:2:1'), []);
});

test('item com entrega não sai da lista: o servidor o mantém, no lugar dele, e avisa', async () => {
  const e = await edge('pcp-sync', banco());
  await e.call({action:'upsert', os:comMarca(copia(e), '8001:1:1', ev('e-r1', 'entregue', {qtde:1}))}, gestor);
  const os = copia(e);
  os.itens = os.itens.filter(i => i.uid !== '8001:1:1');
  const r = await e.call({action:'upsert', os}, gestor);
  assert.equal(r.ok, true);
  assert.deepEqual(gravada(e).itens.map(i => i.uid), ['8001:1:1', '8001:2:1', '8001:3:1']);
  assert.match(r.avisos.join(' '), /Placa ACM/);
  // O item sem marca sai normalmente.
  const os2 = copia(e);
  os2.itens = os2.itens.filter(i => i.uid !== '8001:2:1');
  await e.call({action:'upsert', os:os2}, gestor);
  assert.deepEqual(gravada(e).itens.map(i => i.uid), ['8001:1:1', '8001:3:1']);
});

test('esqueleto do ERP (reimportação sem rev) não passa por cima de O.S. com entrega marcada', async () => {
  const e = await edge('pcp-sync', banco([base({liberadoPCP:false, confirmacao:'', equipe:[]})]));
  await e.call({action:'upsert', os:comMarca(copia(e), '8001:2:1', ev('e-esq1', 'retirado'))}, operacao);
  assert.equal(entregas(e, '8001:2:1').length, 1);
  const esqueleto = {id:'1', numero:'8001', origemMubisys:true, cliente:'Cliente Fictício', atualizadoPor:'Mubisys (auto)', itens:ITENS()};
  const r = await e.call({action:'upsert', os:esqueleto});
  assert.equal(r.duplicataEvitada, true);
  assert.equal(entregas(e, '8001:2:1').length, 1);
});

test('a conciliação da carteira não arquiva O.S. com entrega parcial', async () => {
  const {temTrabalhoHumano} = await shared();
  assert.equal(temTrabalhoHumano({itens:[{uid:'u', entregas:[]}]}), false);
  assert.equal(temTrabalhoHumano({itens:[{uid:'u', entregas:[ev('x', 'entregue', {qtde:1})]}]}), true);
  const parcial = row('mub-9', {numero:'9', origemMubisys:true, itens:[{uid:'9:1:1', item:'1', descricao:'Placa', qtde:'4',
    entregas:[{...ev('e-c1', 'entregue', {qtde:2}), via:'gestao', por:'Gestor Teste', porId:'111222', em:'2026-09-28T12:00:00Z'}]}]});
  const e = await edge('pcp-mubisys', {pcp_registros:[parcial, row('mub-1', {numero:'1', origemMubisys:true})]});
  const r = await e.run(`reconciliarCarteira(sb,[{numero:'1',cliente:'Cliente'}])`);
  assert.equal(r.arquivadas, 0);
  assert.equal(r.marcadasParaConferir, 1);
  assert.equal(e.db.pcp_registros[0].registro.finalizadaEm, undefined);
});

/* ── Diário e o que desce para cada um ─────────────────────────────────── */

test('o diário grava uma linha compacta por evento, sem R$, e não a lista inteira de itens', async () => {
  const e = await edge('pcp-sync', banco());
  await e.call({action:'upsert', os:comMarca(comMarca(copia(e), '8001:1:1', ev('e-a1', 'entregue', {qtde:6})), '8001:2:1', ev('e-a2', 'entregue'))}, gestor);
  const d = diario(e).filter(x => x.campos.includes('itens.entregas'));
  assert.equal(d.length, 1);
  assert.ok(!d[0].campos.includes('itens'), 'só a marca mudou: a lista de itens não entra');
  const linhas = d[0].depois['itens.entregas'].novos;
  assert.deepEqual(linhas.map(l => [l.uid, l.tipo, l.qtde, l.dia, l.por]),
    [['8001:1:1', 'entregue', 6, ONTEM, 'Gestor Teste'], ['8001:2:1', 'entregue', 1, ONTEM, 'Gestor Teste']]);
  assert.doesNotMatch(JSON.stringify(d[0]), /subtotal|valorUnit|R\$/);
  // Mudança de item E marca na mesma gravação: a lista entra sem as entregas dentro.
  const os = comMarca(copia(e), '8001:1:1', ev('e-a3', 'entregue', {qtde:1}));
  os.itens[1].descricao = 'Adesivo vitrine jateado';
  await e.call({action:'upsert', os}, gestor);
  const u = diario(e).at(-1);
  assert.ok(u.campos.includes('itens') && u.campos.includes('itens.entregas'));
  assert.doesNotMatch(JSON.stringify(u.depois.itens), /entregas/);
  assert.equal(u.depois['itens.entregas'].novos.length, 1);
});

test('o list do toque não traz valor nem o ID de quem marcou; a operação também não recebe o ID', async () => {
  const e = await edge('pcp-sync', banco());
  await e.call({action:'upsert', os:comMarca(copia(e), '8001:1:1', ev('e-l1', 'entregue', {qtde:3}))}, gestor);
  const doToque = (await e.call({action:'list', escopo:'abertas'}, toque)).os.find(o => o.id === '1');
  const it = doToque.itens.find(i => i.uid === '8001:1:1');
  assert.equal(it.valorUnit, undefined);
  assert.equal(it.subtotal, undefined);
  assert.equal(it.entregas.length, 1);
  assert.equal(it.entregas[0].porId, undefined);
  assert.equal(it.entregas[0].por, 'Gestor Teste');
  assert.doesNotMatch(JSON.stringify(it.entregas), /valor/i);
  const daOperacao = (await e.call({action:'list', escopo:'abertas'}, operacao)).os.find(o => o.id === '1');
  assert.equal(daOperacao.itens[0].entregas[0].porId, undefined);
  const daGestao = (await e.call({action:'list', escopo:'abertas'}, gestor)).os.find(o => o.id === '1');
  assert.equal(daGestao.itens[0].entregas[0].porId, '111222');
  // A volta sem o ID (operação edita outra coisa) não apaga o ID gravado.
  const volta = structuredClone(daOperacao); volta.obsPCP = 'balcão';
  await e.call({action:'upsert', os:volta}, operacao);
  assert.equal(entregas(e, '8001:1:1')[0].porId, '111222');
});

test('histórico da ficha: a marca de entrega aparece em uma linha legível, sem o ID de quem marcou', () => {
  const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
  const root = path.join(__dirname, '..');
  const node = () => ({innerHTML:'', textContent:'', value:'', querySelector:node, querySelectorAll:()=>[], setAttribute(){}, classList:{toggle(){}, add(){}, remove(){}}});
  const ctx = vm.createContext({console, document:{querySelector:node, querySelectorAll:()=>[], addEventListener(){}, createElement:() => ({})}, window:{},
    localStorage:{getItem:()=>null}, STORE:{getAllOS:()=>[], getCFG:()=>({}), getOS:()=>null}, setTimeout(){}, clearTimeout(){}});
  vm.runInContext(fs.readFileSync(path.join(root, 'operacao.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), ctx);
  const html = vm.runInContext(`htmlHistoricoAlteracoes({entradas:[{acao:'alterar', origem:'tela', em:'2026-09-28T15:00:00Z', autor:{nome:'Gestor Teste', papel:'pcp'},
    campos:['itens.entregas'], antes:{'itens.entregas':{marcas:0}}, depois:{'itens.entregas':{marcas:2, novos:[
      {id:'e1', uid:'8001:1:1', item:'1', tipo:'entregue', qtde:6, dia:'2026-09-28', via:'gestao', por:'Gestor Teste', porId:'111222'},
      {id:'e2', uid:'8001:2:1', item:'2', tipo:'problema', dia:'2026-09-28', motivo:'Peça riscada', via:'gestao', por:'Gestor Teste', porId:'111222'}]}}}]})`, ctx);
  assert.match(html, /Entrega por item/);
  assert.match(html, /item 1 entregue 6 unidades em 28\/09\/2026/);
  assert.match(html, /item 2 problema em 28\/09\/2026 motivo: Peça riscada/);
  assert.doesNotMatch(html, /111222/);
});

/* ── MARCA RECUSADA NÃO FICA NA CÓPIA (revisão da E3) ──
   A resposta diz quais marcas caíram (`descartado: ['entregas']` e os ids em
   `entregasRecusadas`), e o store as tira da cópia da lista (o próprio
   rascunho da ficha aberta) e da fila. Sem isso a mesma cópia mandava a
   marca de novo e, com o saldo liberado, ela entrava calada. */
const osBalcao = () => row('1', {numero:'7001', tipo:'interno', cliente:'Cliente Fictício', itens:[
  {uid:'7001:1:1', item:'1', descricao:'Placa', qtde:'10',
    entregas:[{id:'e-1', tipo:'entregue', qtde:8, dia:'2026-09-20', via:'gestao', por:'Gestor Teste', porId:'111222', em:'2026-09-20T12:00:00Z'}]}]});
function loja({lista = [], responder}) {
  const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path'), root = path.join(__dirname, '..');
  const ls = new Map([['impresilk_inst_os', JSON.stringify(lista)], ['impresilk_inst_fila', '[]']]);
  const db = {transaction(){ const tx = {objectStore:() => ({
    get(){ const req = {}; queueMicrotask(() => req.onsuccess?.({target:{result:null}})); return req; },
    put(){ queueMicrotask(() => tx.oncomplete?.()); }})}; return tx; }};
  const ctx = vm.createContext({console:{log(){}, warn(){}, error(){}}, navigator:{onLine:true}, window:{addEventListener(){}},
    localStorage:{getItem:k => ls.get(k) || null, setItem:(k, v) => ls.set(k, v), removeItem:k => ls.delete(k)},
    indexedDB:{open(){ const req = {}; queueMicrotask(() => req.onsuccess({target:{result:db}})); return req; }},
    setTimeout:() => 1, clearTimeout(){}, AbortController, API_BASE:'http://teste',
    fetch:async (_url, req) => { const r = await responder(JSON.parse(req.body)); return {ok:!(r.status >= 400), status:r.status || 200, json:async () => r}; }});
  vm.runInContext(fs.readFileSync(path.join(root, 'store.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'operacao.js'), 'utf8'), ctx);
  return vm.runInContext('STORE', ctx);
}
const esvaziar = async s => { for (let i = 0; i < 100 && s.getQueue().length; i++) { await s.trySync(); await new Promise(r => setTimeout(r, 2)); } };

test('marca recusada: a resposta diz qual caiu, e o reenvio da mesma gravação diz de novo', async () => {
  const e = await edge('pcp-sync', banco([osBalcao()]));
  const balcao = copia(e);
  balcao.atualizadoEm = '2026-09-29T10:00:00.000Z';
  balcao.itens[0].entregas.push({id:'e-balcao', tipo:'entregue', qtde:5, dia:'2026-09-21'});
  let r = await e.call({action:'upsert', os:structuredClone(balcao)}, operacao);
  assert.equal(r.ok, true);
  assert.equal(gravada(e).itens[0].entregas.length, 1, 'saldo 2: a marca de 5 não entra');
  assert.deepEqual(r.descartado, ['entregas']);
  assert.deepEqual(r.entregasRecusadas.map(x => [x.id, x.uid]), [['e-balcao', '7001:1:1']]);
  assert.ok(r.entregasRecusadas[0].motivo);
  // A resposta se perdeu: o aparelho manda a mesma gravação de novo.
  r = await e.call({action:'upsert', os:structuredClone(balcao)}, operacao);
  assert.equal(r.repetido, true);
  assert.deepEqual(r.descartado, ['entregas']);
  assert.deepEqual(r.entregasRecusadas.map(x => x.id), ['e-balcao']);
});

test('store: a marca recusada sai do rascunho e da fila; liberado o saldo, a mesma cópia não a grava sem ação nova', async () => {
  const e = await edge('pcp-sync', banco([osBalcao()]));
  let avisou = null;
  const s = loja({lista:[gravada(e)], responder:q => e.call(q, operacao)});
  s.on('entregas-descartadas', d => { avisou = d; });
  await s.pronto();
  const rascunho = structuredClone(s.getOS('1'));             // a ficha aberta no balcão
  rascunho.itens[0].entregas.push({id:'e-balcao', tipo:'entregue', qtde:5, dia:'2026-09-21'});
  rascunho.atualizadoEm = new Date().toISOString();
  s.saveOS(rascunho);
  await esvaziar(s);
  assert.equal(gravada(e).itens[0].entregas.length, 1);
  assert.deepEqual(rascunho.itens[0].entregas.map(x => x.id), ['e-1'], 'a marca recusada saiu do rascunho aberto');
  assert.deepEqual(s.getOS('1').itens[0].entregas.map(x => x.id), ['e-1'], 'e da cópia da lista');
  assert.deepEqual(avisou && avisou.recusadas.map(x => x.id), ['e-balcao']);
  // O PCP desfaz a marca de 8: o saldo volta a 10.
  const pcp = copia(e);
  pcp.itens[0].entregas.push({id:'e-desf', tipo:'desfeito', alvo:'e-1', motivo:'Contou errado', dia:ONTEM});
  await e.call({action:'upsert', os:pcp}, gestor);
  // O balcão grava outra coisa na mesma ficha: a marca recusada não volta.
  rascunho.rev = gravada(e).rev; rascunho.obsPCP = 'cliente ligou'; rascunho.atualizadoEm = new Date(Date.now() + 1000).toISOString();
  s.saveOS(rascunho);
  await esvaziar(s);
  assert.equal(gravada(e).obsPCP, 'cliente ligou');
  assert.equal(gravada(e).itens[0].entregas.find(x => x.id === 'e-balcao'), undefined, 'a marca descartada entrou calada');
});

test('store: a marca recusada sai também do envio que ficou na fila (editado durante o envio)', async () => {
  const e = await edge('pcp-sync', banco([osBalcao()]));
  let s = null, rascunho = null, primeiro = true;
  s = loja({lista:[gravada(e)], responder:async q => {
    if (q.action === 'upsert' && primeiro) {
      primeiro = false;
      rascunho.obsPCP = 'digitando'; rascunho.atualizadoEm = new Date(Date.now() + 1000).toISOString();
      s.saveOS(rascunho);                                     // a edição durante o envio vai para a fila com a marca
    }
    return e.call(q, operacao);
  }});
  await s.pronto();
  rascunho = structuredClone(s.getOS('1'));
  rascunho.itens[0].entregas.push({id:'e-balcao', tipo:'entregue', qtde:5, dia:'2026-09-21'});
  rascunho.atualizadoEm = new Date().toISOString();
  s.saveOS(rascunho);
  const enviada = rascunho.atualizadoEm;
  // O saveOS já disparou o envio: espera a resposta da primeira gravação.
  for (let i = 0; i < 200 && (primeiro || s.getQueue().some(x => x.os && x.os.atualizadoEm === enviada)); i++) await new Promise(r => setTimeout(r, 2));
  const naFila = s.getQueue().filter(x => x.action === 'upsert');
  assert.ok(naFila.length >= 1, 'a edição durante o envio ficou na fila');
  assert.ok(naFila.every(x => !x.os.itens[0].entregas.some(m => m.id === 'e-balcao')), 'o envio da fila ainda leva a marca recusada');
  assert.ok(!rascunho.itens[0].entregas.some(m => m.id === 'e-balcao'));
  await esvaziar(s);
  assert.equal(gravada(e).obsPCP, 'digitando');
  assert.equal(gravada(e).itens[0].entregas.length, 1);
});
