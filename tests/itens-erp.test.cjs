/* OS ITENS DA O.S. ABERTA ACOMPANHAM O ERP (E8 do plano de entrega por item,
   01/10/2026). A importação só trazia os itens na primeira vez: o ERP
   acrescentava, mudava ou tirava item e o PCP ficava com a lista velha. Agora
   a atualização horária mescla a lista do ERP na O.S. aberta, sem tocar nas
   marcas (entregas, Verificado, marca do instalador).
   Servidor de verdade: o pcp-mubisys (gravarImportadas, com o mapearOS) e o
   pcp-sync no MESMO banco (helpers/edge.cjs), e o motor da entrega por item
   (ENTREGA_ITEM) para o saldo. Cada teste começa pelo caso ruim. Dados
   fictícios: o repositório é público.
   A MESCLA ESTÁ DESLIGADA EM PRODUÇÃO (MESCLA_ITENS_ERP = false, em _shared,
   até medir o formato do item no ERP). Aqui ela roda LIGADA POR INJEÇÃO: o
   servidor de teste troca a constante só dentro do pcp-sync e do
   pcp-mubisys de teste (o vm de cada um), sem mudar o _shared. O desligado
   está provado em tests/itens-erp-revisao.test.cjs. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {edge} = require('./helpers/edge.cjs');
const root = path.join(__dirname, '..');
const regras = () => import('../supabase/functions/_shared/pcp-integridade.mjs');
const motor = async () => (await import('../supabase/functions/_shared/pcp-entrega-item.mjs')).ENTREGA_ITEM;
const js = x => JSON.parse(JSON.stringify(x));
const ler = f => fs.readFileSync(path.join(root, f), 'utf8');

const diaSP = ms => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo'}).format(new Date(ms));
const HOJE = diaSP(Date.now());
const NUM = '9101', ID = 'mub-' + NUM;

const ficha = (id, nome, apelido, cpf) => ({colecao:'colaboradores', id, apagado:false, registro:{id, nome, apelido, cpf}});
const FICHAS = [ficha('gestor-f', 'Gestor Teste', 'gestor', '11122233344')];
const GESTOR = {papel:'pcp', nome:'Gestor Teste', sub:'gestor'};
const ADMIN = {papel:'admin', nome:'Admin Teste', sub:'admin'};

// O item como a lista do ERP o manda (os nomes que o mapearItem lê).
const itemERP = (posicao, descricao, quantidade, extra = {}) => ({posicao, descricao, quantidade,
  valor_unitario:'100', sub_total:String(Number(quantidade) * 100), ...extra});
const A = (q = '10', extra) => itemERP('1', 'Placa ACM', q, extra);
const B = (q = '1', extra) => itemERP('2', 'Adesivo vitrine - evento de sábado', q, extra);
const C = (q = '2', extra) => itemERP('3', 'Totem', q, extra);
const osERP = itens => ({sequencial_ordem:NUM, status:'PRODUCAO', cliente:'Cliente Fictício', nome_trabalho:'Fachada', itens});

/* O SERVIDOR: pcp-sync e pcp-mubisys no mesmo banco. `importar` é a
   atualização horária (o que a carteira do ERP devolveu, pelo mapearOS). */
async function servidor(registros = []) {
  const sync = await edge('pcp-sync', {pcp_registros:registros, registros:js(FICHAS),
    pcp_config_global:[{id:true, config:{instaladores:['Ana']}, atualizado_em:'2026-09-19T10:00:00Z'}]});
  const mub = await edge('pcp-mubisys', {});
  mub.db.pcp_registros = sync.db.pcp_registros;
  mub.run('console = {...console, warn(){}, log(){}}');
  // A mescla ligada por injeção (a constante de _shared continua false).
  sync.run('MESCLA_ITENS_ERP = true');
  mub.run('MESCLA_ITENS_ERP = true');
  const linha = () => sync.db.pcp_registros.find(r => r.colecao === 'os' && r.id === ID);
  return {sync, mub, linha,
    importar: itens => mub.run(`gravarImportadas(sb, [mapearOS(${JSON.stringify(osERP(itens))})])`),
    os: () => js(linha().registro),
    item: uid => js(linha().registro.itens.find(i => i.uid === uid))};
}
// A gestão marca a entrega pela porta de verdade (o pcp-sync, com o motor).
async function marcar(s, uid, ev) {
  const os = s.os();
  const it = os.itens.find(i => i.uid === uid);
  it.entregas = [...(it.entregas || []), {dia:HOJE, ...ev}];
  const r = await s.sync.call({action:'upsert', os}, GESTOR);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(s.item(uid).entregas.some(e => e.id === ev.id), 'a marca gravou');
  return r;
}
const ultimaAlteracao = os => (os.erpAlteracoes || []).at(-1)?.campos || [];

/* ── Item novo ─────────────────────────────────────────────────────────── */

test('ERP acrescenta item: entra no fim, com código novo, sem marca, e o card pede conferência', async () => {
  const s = await servidor();
  await s.importar([A(), B()]);
  const antes = s.os();
  assert.deepEqual(antes.itens.map(i => i.uid), ['9101:1:1', '9101:2:1']);
  const r = await s.importar([A(), B(), C()]);
  const os = s.os();
  assert.deepEqual(os.itens.map(i => i.uid), ['9101:1:1', '9101:2:1', '9101:3:1']);
  const novo = os.itens[2];
  assert.equal(novo.descricao, 'Totem');
  assert.equal(novo.qtde, '2');
  assert.equal(novo.pronto, false);
  assert.equal(novo.entregas, undefined);
  assert.equal(novo.manual, undefined, 'item do ERP não vira manual');
  assert.equal(os.rev, (antes.rev || 0) + 1, 'um rev novo (a O.S. recém-importada ainda não tinha)');
  assert.equal(os.atualizadoPor, 'Mubisys · atualização de origem');
  assert.ok(os.erpConferirEm, 'o selo do card acende');
  assert.deepEqual(ultimaAlteracao(os), [{campo:'item novo do ERP', antes:'não estava na O.S.', depois:'item 3 (Totem), quantidade 2'}]);
  assert.equal(r.itensAtualizados, 1, 'o batimento conta a O.S. cujos itens mudaram');
});

test('código nunca é reaproveitado: item novo na posição de um item que saiu ganha código próprio, e a hora seguinte não o troca', async () => {
  const s = await servidor();
  await s.importar([A(), B(), C()]);
  // Caso ruim: o ERP tira o adesivo (sem marca) e, depois, põe outro produto na posição 2.
  await s.importar([A(), C()]);
  let os = s.os();
  assert.deepEqual(os.itens.map(i => i.uid), ['9101:1:1', '9101:3:1'], 'o item sem marca sai da lista');
  assert.deepEqual(os.itensForaERP.map(f => [f.uid, f.item]), [['9101:2:1', '2']]);
  await s.importar([A(), itemERP('2', 'Lona front', '1'), C()]);
  os = s.os();
  const lona = os.itens.find(i => i.descricao === 'Lona front');
  assert.notEqual(lona.uid, '9101:2:1', 'o código do adesivo que saiu não vai para a lona');
  assert.match(lona.uid, /^s-/);
  assert.equal(lona.chaveERP, '9101:2:1', 'a chave do ERP fica guardada para casar na hora seguinte');
  const rev = os.rev, uid = lona.uid;
  await s.importar([A(), itemERP('2', 'Lona front', '1'), C()]);
  assert.equal(s.os().rev, rev, 'a mesma resposta não grava de novo');
  assert.equal(s.os().itens.find(i => i.descricao === 'Lona front').uid, uid);
});

/* ── Item mudado ───────────────────────────────────────────────────────── */

test('6 de 10 entregues e o ERP muda para 8: a quantidade segue o ERP, a marca fica e o saldo vira 2', async () => {
  const s = await servidor();
  await s.importar([A('10'), B()]);
  await marcar(s, '9101:1:1', {id:'e-seis', tipo:'entregue', qtde:6});
  await s.importar([A('8'), B()]);
  const os = s.os(), placa = s.item('9101:1:1');
  assert.equal(placa.qtde, '8');
  assert.equal(placa.subtotal, '800');
  assert.deepEqual(placa.entregas.map(e => [e.id, e.tipo, e.qtde]), [['e-seis', 'entregue', 6]], 'nenhuma marca apagada');
  const M = await motor();
  const sit = M.situacaoItem(placa, os);
  assert.equal(sit.saldo, 2);
  assert.equal(sit.rotulo, 'parcial 6 de 8');
  assert.deepEqual(ultimaAlteracao(os), [
    {campo:'item 1 (Placa ACM): quantidade', antes:'10', depois:'8 (6 já entregues, saldo 2)'},
    {campo:'item 1 (Placa ACM): valor', antes:null, depois:'atualizado pelo ERP'}]);
  assert.doesNotMatch(JSON.stringify(os.erpAlteracoes), /800|1000/, 'o histórico não leva R$ do item');
});

test('o ERP baixa a quantidade para abaixo do entregue: a marca não some, o saldo zera e o histórico avisa', async () => {
  const s = await servidor();
  await s.importar([A('10'), B()]);
  await marcar(s, '9101:1:1', {id:'e-seis', tipo:'entregue', qtde:6});
  await s.importar([A('4'), B()]);
  const os = s.os(), placa = s.item('9101:1:1');
  assert.equal(placa.qtde, '4');
  assert.deepEqual(placa.entregas.map(e => e.id), ['e-seis']);
  const M = await motor();
  assert.equal(M.situacaoItem(placa, os).saldo, 0);
  assert.equal(M.situacaoItem(placa, os).situacao, 'entregue');
  assert.equal(ultimaAlteracao(os)[0].depois, '4 (6 já entregues, saldo 0: a quantidade ficou abaixo do entregue)');
});

test('mudança de formato do número não é mudança do ERP, e o texto depois do " - " muda sem trocar o item', async () => {
  const s = await servidor();
  await s.importar([A('10'), B()]);
  const rev = s.os().rev;
  // Caso ruim 1: o ERP manda '10.00' no lugar de '10'.
  await s.importar([A('10.00', {valor_unitario:'100.00', sub_total:'1000.00'}), B()]);
  assert.equal(s.os().rev, rev, 'nada gravado');
  // Caso ruim 2: o vendedor muda o texto livre do adesivo; o item é o mesmo e a marca fica nele.
  await marcar(s, '9101:2:1', {id:'e-ad', tipo:'entregue', qtde:1});
  await s.importar([A(), itemERP('2', 'Adesivo vitrine - evento de domingo', '1')]);
  const ad = s.item('9101:2:1');
  assert.equal(ad.descricao, 'Adesivo vitrine - evento de domingo');
  assert.deepEqual(ad.entregas.map(e => e.id), ['e-ad']);
  assert.equal(ad.saiuDoERP, undefined);
});

/* ── Item que saiu ─────────────────────────────────────────────────────── */

test('ERP tira item com entrega: ele fica, com a marca "saiu do ERP"; o vizinho não herda nada; voltou ao ERP, a marca sai', async () => {
  const s = await servidor();
  await s.importar([A(), B(), C()]);
  await marcar(s, '9101:2:1', {id:'e-b', tipo:'entregue', qtde:1});
  await marcar(s, '9101:3:1', {id:'e-c', tipo:'entregue', qtde:1});
  // Caso ruim: o ERP tira o adesivo e RENUMERA o totem para a posição 2.
  await s.importar([A(), itemERP('2', 'Totem', '2')]);
  let os = s.os();
  assert.deepEqual(os.itens.map(i => i.uid), ['9101:1:1', '9101:2:1', '9101:3:1'], 'nada sai: os dois têm marca');
  const ad = s.item('9101:2:1'), totem = s.item('9101:3:1');
  assert.ok(ad.saiuDoERP && Date.parse(ad.saiuDoERP.em), 'carimbado com a hora');
  assert.deepEqual(ad.entregas.map(e => e.id), ['e-b'], 'a entrega do adesivo fica no adesivo');
  assert.equal(totem.saiuDoERP, undefined, 'o totem continua no ERP');
  assert.deepEqual(totem.entregas.map(e => e.id), ['e-c'], 'a marca do totem não pulou para a posição 2');
  assert.equal(totem.chaveERP, '9101:2:1');
  assert.ok(ultimaAlteracao(os).some(c => c.campo === 'item 2 (Adesivo vitrine)' && c.depois === 'saiu do ERP; fica na O.S. porque tem marca'));
  assert.ok(os.erpConferirEm);
  // A mesma resposta de novo: nada muda (o carimbo não é renovado).
  const rev = os.rev;
  await s.importar([A(), itemERP('2', 'Totem', '2')]);
  assert.equal(s.os().rev, rev);
  assert.equal(s.item('9101:2:1').saiuDoERP.em, ad.saiuDoERP.em);
  // O vendedor devolve o adesivo: a marca sai.
  await s.importar([A(), itemERP('2', 'Totem', '2'), itemERP('3', 'Adesivo vitrine - evento de sábado', '1')]);
  os = s.os();
  assert.equal(s.item('9101:2:1').saiuDoERP, undefined);
  assert.equal(os.itens.length, 3, 'não duplica o adesivo');
  assert.ok(ultimaAlteracao(os).some(c => c.depois === 'voltou ao ERP'));
});

test('produto trocado na mesma posição: o código não passa para o produto novo; com marca e os mesmos números a mescla pergunta, sem duplicar', async () => {
  const R = await regras();
  const base = {id:ID, numero:NUM, origemMubisys:true, rev:3, itens:[
    {uid:'9101:1:1', item:'1', descricao:'Placa ACM', medidas:'', qtde:'1', valorUnit:'100', subtotal:'100'},
    {uid:'9101:2:1', item:'2', descricao:'Faixa', medidas:'', qtde:'1', valorUnit:'100', subtotal:'100'}]};
  const remoto = [{item:'1', descricao:'Placa ACM', medidas:'', qtde:'1', valorUnit:'100', subtotal:'100'},
    {item:'2', descricao:'Banner', medidas:'', qtde:'1', valorUnit:'100', subtotal:'100'}];
  // Sem marca: a Faixa sai (o código dela vai para itensForaERP) e o Banner entra com código próprio.
  const sem = R.mesclarItensERP(base, remoto, {em:'2026-10-01T12:00:00Z', sortear:() => 's-banner00001'});
  assert.deepEqual(sem.itens.map(i => [i.uid, i.descricao]), [['9101:1:1', 'Placa ACM'], ['s-banner00001', 'Banner']]);
  assert.equal(sem.itens[1].chaveERP, '9101:2:1', 'a chave do ERP casa o Banner na hora seguinte');
  assert.deepEqual(sem.foraERP.map(f => f.uid), ['9101:2:1'], 'o código da Faixa não é reaproveitado');
  // Caso ruim 1: a faixa já foi entregue, e o ERP mostra outro nome com a mesma medida, quantidade e valor.
  const comMarca = js(base);
  comMarca.itens[1].entregas = [{id:'e-f', tipo:'entregue', qtde:1, dia:'2026-09-30', via:'gestao'}];
  const com = R.mesclarItensERP(comMarca, remoto, {em:'2026-10-01T12:00:00Z', sortear:() => 's-sorteado01'});
  assert.equal(com.itens.length, 2, 'não entra um segundo item com saldo');
  const faixa = com.itens.find(i => i.uid === '9101:2:1');
  assert.equal(faixa.descricao, 'Faixa', 'o item marcado não muda de produto sozinho');
  assert.equal(faixa.saiuDoERP, undefined);
  assert.equal(faixa.produtoNoERP, 'Banner', 'o nome do ERP fica guardado');
  assert.deepEqual(faixa.entregas.map(e => e.id), ['e-f']);
  assert.deepEqual(com.alteracoes, [{campo:'item 2 (Faixa): produto', antes:'Faixa', depois:'no ERP: Banner. O item tem marca e não troca de produto sozinho: confira'}]);
  assert.ok(com.alteracoes.some(R.pedeConferencia), 'acende o selo');
  // A mesma resposta de novo: nada (a pergunta é feita uma vez por nome).
  assert.equal(R.mesclarItensERP({...comMarca, itens:com.itens}, remoto, {em:'2026-10-01T13:00:00Z'}).mudou, false);
  // A gestão corrige o nome na ficha: a hora seguinte tira a pergunta, sem acender o selo de novo.
  const corrigido = js(com.itens); corrigido[1].descricao = 'Banner';
  const conf = R.mesclarItensERP({...comMarca, itens:corrigido}, remoto, {em:'2026-10-01T14:00:00Z'});
  assert.equal(conf.itens[1].produtoNoERP, undefined);
  assert.equal(conf.alteracoes.some(R.pedeConferencia), false);
  // Caso ruim 2: com marca e outro valor (o vendedor trocou o produto): a Faixa fica 'saiu do ERP' e o Banner entra.
  const outro = js(remoto); outro[1].valorUnit = '300'; outro[1].subtotal = '300';
  const troca = R.mesclarItensERP(comMarca, outro, {em:'2026-10-01T12:00:00Z', sortear:() => 's-sorteado02'});
  assert.deepEqual(troca.itens.find(i => i.uid === '9101:2:1').saiuDoERP, {em:'2026-10-01T12:00:00Z'});
  const banner = troca.itens.find(i => i.descricao === 'Banner');
  assert.equal(banner.uid, 's-sorteado02');
  assert.equal(banner.chaveERP, '9101:2:1');
  assert.equal(banner.entregas, undefined, 'a entrega da Faixa não pula para o Banner');
});

/* ── O que não muda ────────────────────────────────────────────────────── */

test('O.S. finalizada não muda; cancelada à mão também não; e a resposta sem itens não apaga nada', async () => {
  for (const [nome, mexe] of [
    ['finalizada', r => { r.finalizadaEm = '2026-09-30T18:00:00.000Z'; r.finalizadoPor = 'Gestor Teste'; }],
    ['cancelada', r => { r.cancelamento = {ativo:true, motivo:'Cliente desistiu do pedido inteiro', por:'Gestor Teste', em:'2026-09-30T18:00:00.000Z'}; }],
  ]) {
    const s = await servidor();
    await s.importar([A(), B()]);
    mexe(s.linha().registro);
    const antes = s.os();
    await s.importar([A('3'), C()]);
    assert.deepEqual(s.os().itens, antes.itens, nome + ': os itens ficam como estavam');
    assert.equal(s.os().itensForaERP, undefined, nome);
  }
  // A carteira que veio sem a lista de itens não é prova de que os itens saíram.
  const s = await servidor();
  await s.importar([A(), B()]);
  const antes = s.os();
  await s.importar([]);
  await s.mub.run(`gravarImportadas(sb, [mapearOS({sequencial_ordem:'${NUM}', status:'PRODUCAO', cliente:'Cliente Fictício'})])`);
  assert.deepEqual(s.os(), antes, 'nada mudou, nem o rev');
});

test('lista com item do PCP (manual ou do PDF): a mescla não acrescenta nem tira, e o batimento conta', async () => {
  const s = await servidor();
  await s.importar([A(), B()]);
  const os = s.os();
  os.itens.push({uid:'m-manual01', item:'3', descricao:'Faixa extra', medidas:'', qtde:'1', valorUnit:'0', subtotal:0, manual:true});
  assert.equal((await s.sync.call({action:'upsert', os}, GESTOR)).ok, true);
  const antes = s.os();
  const r = await s.importar([A(), C()]);
  assert.deepEqual(s.os().itens, antes.itens);
  assert.equal(r.itensListaPCP, 1);
  const R = await regras();
  assert.equal(R.mesclarItensERP(antes, [{item:'1', descricao:'Placa ACM', qtde:'1'}]).resumo.pulou, 'a lista tem item do PCP');
});

test('kit do ERP ("Item", itens_agrupados) continua uma linha só, e kit não casa com kit pelo nome', async () => {
  const kit = (posicao, quantidade, pecas) => ({posicao, quantidade, valor_unitario:'500', sub_total:'500',
    itens_agrupados:pecas.map(p => ({item:p, quantidade:'1', sub_total:'250'}))});
  const s = await servidor();
  await s.importar([A(), kit('2', '1', ['Letra caixa', 'ACM'])]);
  assert.deepEqual(s.os().itens.map(i => [i.uid, i.descricao]), [['9101:1:1', 'Placa ACM'], ['9101:2:1', 'Item']], 'o kit não é aberto em peças');
  await marcar(s, '9101:2:1', {id:'e-kit', tipo:'entregue', qtde:1});
  // Caso ruim: o kit marcado sai e entra outro kit em outra posição. Os dois se chamam "Item".
  await s.importar([A(), kit('3', '1', ['Adesivo'])]);
  const os = s.os();
  assert.ok(s.item('9101:2:1').saiuDoERP, 'o kit marcado fica, com a marca');
  assert.deepEqual(s.item('9101:2:1').entregas.map(e => e.id), ['e-kit']);
  const novo = os.itens.find(i => i.uid === '9101:3:1');
  assert.equal(novo.descricao, 'Item');
  assert.equal(novo.entregas, undefined, 'a entrega do kit velho não passou para o kit novo');
});

/* ── Reimportação ──────────────────────────────────────────────────────── */

test('reimportação idempotente: a mesma resposta duas vezes grava uma vez; O.S. antiga sem código e sem mudança não é regravada', async () => {
  const s = await servidor();
  await s.importar([A(), B()]);
  await s.importar([A('12'), B(), C()]);
  const uma = s.os(), quando = s.linha().atualizado_em;
  const r = await s.importar([A('12'), B(), C()]);
  assert.deepEqual(s.os(), uma, 'nada mudou');
  assert.equal(s.linha().atualizado_em, quando);
  assert.equal(r.atualizadas, 0);
  // Caso ruim: O.S. de antes da E1 (itens sem código). Sem mudança no ERP, nada de gravação em lote.
  const velho = s.os();
  velho.itens = velho.itens.map(({uid: _u, ...x}) => x);
  s.linha().registro = js(velho);
  await s.importar([A('12'), B(), C()]);
  assert.deepEqual(s.os(), velho, 'não carimba código sozinho');
  // Com mudança, a mesma gravação carimba o código da E1 (o mesmo da importação).
  await s.importar([A('13'), B(), C()]);
  assert.deepEqual(s.os().itens.map(i => i.uid), ['9101:1:1', '9101:2:1', '9101:3:1']);
});

/* ── A porta do aparelho (pcp-sync) ───────────────────────────────────── */

test('cópia velha do aparelho não traz de volta item que o ERP tirou nem desfaz a marca "saiu do ERP"', async () => {
  const s = await servidor();
  await s.importar([A(), B(), C()]);
  await marcar(s, '9101:3:1', {id:'e-c', tipo:'entregue', qtde:1});
  const velha = s.os();                       // o aparelho leu aqui
  await s.importar([A()]);                    // o adesivo (sem marca) sai; o totem (com marca) fica marcado
  assert.deepEqual(s.os().itens.map(i => i.uid), ['9101:1:1', '9101:3:1']);
  // Caso ruim: "Sobrescrever" (o rev do servidor com a lista velha) e a aba antiga sem rev.
  for (const rev of [s.os().rev, undefined]) {
    const os = js(velha);
    if (rev === undefined) delete os.rev; else os.rev = rev;
    os.atualizadoEm = new Date(Date.now() + 60000).toISOString();
    os.obsPCP = 'Gravado pela cópia velha ' + rev;
    // Com trabalho de gente: sem rev e sem trabalho, o servidor já a trata como esqueleto e devolve a dele.
    os.liberadoPCP = true;
    const r = await s.sync.call({action:'upsert', os}, GESTOR);
    assert.equal(r.ok, true, JSON.stringify(r));
    const g = s.os();
    assert.equal(g.obsPCP, 'Gravado pela cópia velha ' + rev, 'o resto da gravação vale');
    assert.deepEqual(g.itens.map(i => i.uid), ['9101:1:1', '9101:3:1'], 'o adesivo não voltou');
    assert.ok(s.item('9101:3:1').saiuDoERP, 'a marca "saiu do ERP" ficou');
    assert.deepEqual(g.itensForaERP.map(f => f.uid), ['9101:2:1']);
    assert.match(r.avisos.join(' '), /Um item que saiu do ERP não voltou para a O\.S\./);
  }
});

test('o aparelho não forja nem apaga o que é da mescla: saiuDoERP, chaveERP e itensForaERP', async () => {
  const s = await servidor();
  await s.importar([A(), B(), C()]);
  await marcar(s, '9101:3:1', {id:'e-c', tipo:'entregue', qtde:1});
  await s.importar([A()]);
  const os = s.os();
  os.itens[0].saiuDoERP = {em:'2026-01-01T00:00:00Z'};    // forja no item que está no ERP
  os.itens[0].chaveERP = '9101:9:1';
  delete os.itens[1].saiuDoERP;                             // apaga a marca do totem
  os.itensForaERP = [];
  assert.equal((await s.sync.call({action:'upsert', os}, GESTOR)).ok, true);
  const g = s.os();
  assert.equal(g.itens[0].saiuDoERP, undefined);
  assert.equal(g.itens[0].chaveERP, undefined);
  assert.ok(g.itens[1].saiuDoERP);
  assert.deepEqual(g.itensForaERP.map(f => f.uid), ['9101:2:1']);
});

test('entrega feita sem rede num item que o ERP tirou: a marca grava, e o item volta com "saiu do ERP"', async () => {
  const s = await servidor();
  await s.importar([A(), B(), C()]);
  const offline = s.os();                    // o tablet da fábrica ficou sem rede aqui
  await s.importar([A(), C()]);              // o adesivo sai do ERP (ainda sem marca)
  assert.deepEqual(s.os().itens.map(i => i.uid), ['9101:1:1', '9101:3:1']);
  const os = js(offline);
  os.rev = s.os().rev;
  os.itens.find(i => i.uid === '9101:2:1').entregas = [{id:'e-off', tipo:'entregue', qtde:1, dia:HOJE}];
  const r = await s.sync.call({action:'upsert', os}, GESTOR);
  assert.equal(r.ok, true);
  const ad = s.item('9101:2:1');
  assert.ok(ad, 'o item com marca nova não se perde');
  assert.deepEqual(ad.entregas.map(e => e.id), ['e-off']);
  assert.ok(ad.saiuDoERP, 'e fica marcado: ele não está mais no ERP');
  assert.match(r.avisos.join(' '), /saiu do ERP e ficou na O\.S\./);
  // A hora seguinte não o tira (tem marca) nem o duplica.
  const rev = s.os().rev;
  await s.importar([A(), C()]);
  assert.equal(s.os().rev, rev);
});

/* ── Tela ──────────────────────────────────────────────────────────────── */

function tela(lista) {
  const nodes = new Map();
  function node(sel) {
    if (!nodes.has(sel)) nodes.set(sel, {innerHTML:'', textContent:'', value:'', querySelector:node, querySelectorAll:()=>[], setAttribute(){}, classList:{toggle(){},add(){},remove(){}}, focus(){}, scrollIntoView(){}, insertAdjacentHTML(_, v){ this.innerHTML += v; }});
    return nodes.get(sel);
  }
  const doc = {querySelector:node, querySelectorAll:()=>[], addEventListener(){}};
  const ctx = vm.createContext({console, Date, document:doc, window:{}, localStorage:{getItem:()=>null},
    STORE:{getAllOS:()=>lista, getCFG:()=>({}), getOS:id=>lista.find(o=>o.id===id), uuid:()=>'novo', saveOS(){}},
    setTimeout(){}, clearTimeout(){}});
  vm.runInContext(ler('operacao.js'), ctx);
  vm.runInContext(ler('entrega-item.js'), ctx);
  vm.runInContext(fs.readFileSync(path.join(process.env.PCP_BASELINE || root, 'app.js'), 'utf8'), ctx);
  vm.runInContext(`STATE.user={nome:'Revisão',papel:'pcp'}; renderModal=()=>{}; renderActiveTab=()=>{};`, ctx);
  return {run:code=>vm.runInContext(code, ctx)};
}
const OS_TELA = () => ({id:ID, numero:NUM, origemMubisys:true, tipo:'externo', itens:[
  {uid:'9101:1:1', item:'1', descricao:'Placa ACM', medidas:'', qtde:'10', valorUnit:'100', subtotal:'1000'},
  {uid:'9101:2:1', item:'2', descricao:'Adesivo vitrine', medidas:'', qtde:'1', valorUnit:'100', subtotal:'100', pronto:true,
    saiuDoERP:{em:'2026-10-01T13:00:00.000Z'}}]});

test('ficha da gestão: o item que saiu do ERP aparece com a marca, e só ele', () => {
  const t = tela([OS_TELA()]);
  const html = t.run(`blocoItens(STORE.getOS(${JSON.stringify(ID)}), false, false)`);
  const linhas = html.split('</tr>');
  const iAd = linhas.findIndex(l => l.includes('value="Adesivo vitrine"'));
  assert.match(linhas[iAd + 1], /item-saiu-erp/);
  assert.match(linhas[iAd + 1], /Saiu do ERP em 01\/10\/26\. Fica na O\.S\. porque tem marca\./);
  assert.equal((html.match(/Saiu do ERP/g) || []).length, 1, 'a placa, que está no ERP, não leva a marca');
  assert.doesNotMatch(linhas[iAd + 1], /—/, 'texto sem travessão');
});

test('celular do instalador: o item com o campo novo abre sem erro', () => {
  const ctx = vm.createContext({console, Date, document:{querySelector:() => ({classList:{add(){}, remove(){}}}), querySelectorAll:()=>[], addEventListener(){}},
    window:{}, localStorage:{getItem:()=>null, setItem(){}}, STORE:{getQueue:()=>[], getCFG:()=>({}), getAllOS:()=>[]}, setTimeout(){}, navigator:{onLine:true}});
  vm.runInContext(ler('operacao.js'), ctx);
  vm.runInContext(ler('entrega-item.js'), ctx);
  vm.runInContext(fs.readFileSync(path.join(process.env.PCP_BASELINE || root, 'equipe.js'), 'utf8'), ctx);
  ctx.__os = OS_TELA();
  const html = vm.runInContext(`__os.itens.map((it, i) => entregaDoItemHTML(it, i, __os, false, '')).join('')`, ctx);
  assert.equal(typeof html, 'string');
});

test('sem cópia no aparelho: a mescla mora só no servidor, e a tela lê só a marca', () => {
  for (const f of ['app.js', 'operacao.js', 'equipe.js', 'store.js', 'entrega-item.js']) {
    assert.doesNotMatch(ler(f), /mesclarItensERP|itensForaERP|chaveERP/, f + ' não decide a mescla');
  }
  assert.match(ler('supabase/functions/pcp-mubisys/index.ts'), /atualizarOrigemERP\(linha\.registro, remoto, em, \{ mesclarItens: MESCLA_ITENS_ERP \}\)/);
  assert.match(ler('supabase/functions/pcp-sync/index.ts'), /if \(MESCLA_ITENS_ERP\) \{\s+const gi = guardarItensERP\(os, existing,/);
});

/* ── O diagnóstico do formato (só leitura, só admin) ──────────────────── */

test('formatoItens: só o administrador; devolve nomes e tipos dos campos do item e o retrato dele, nunca os valores', async () => {
  const e = await edge('pcp-mubisys', {pcp_meta:[{chave:'mubisys', valor:{publicKey:'pk-ficticia', accessToken:'tk-ficticio'}}]});
  e.run('console = {...console, warn(){}, log(){}, error(){}}');
  const os = {id:777, sequencial_ordem:NUM, cliente:'Cliente Secreto Ltda', cliente_cnpj_cpf:'00.000.000/0001-00', data_cadastro:'2026-09-20 10:00:00',
    valor_total:'1500.00', itens:[
      {id:5501, posicao:'1', item:'Placa ACM', quantidade:'10.00', valor_unitario:'100.00', sub_total:'1000.00'},
      {id:5502, posicao:'2', item:'', quantidade:'1.00', sub_total:'500.00', itens_agrupados:[{item:'Letra caixa', quantidade:'1.00', sub_total:'500.00'}]}]};
  e.run(`fetchERP = async (url) => { __urls.push(url); return new Response(${JSON.stringify(JSON.stringify(os))}, {status:201}); };
    erpGet = async (url) => { __urls.push(url); return {data:[${JSON.stringify(os)}]}; };`.replace(/__urls/g, 'globalThis.__urls'));
  e.run('globalThis.__urls = []');
  for (const who of [GESTOR, {papel:'operacao', nome:'Olga'}, 'machine']) {
    assert.equal((await e.call({action:'formatoItens', numero:NUM}, who)).status, 403, JSON.stringify(who));
  }
  const r = await e.call({action:'formatoItens', numero:NUM}, ADMIN);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(r.os.length, 1);
  assert.deepEqual(r.naoMedidas, []);
  const m = r.os[0], it = m.porNumero.itens;
  assert.equal(m.numero, NUM);
  assert.equal(it.objetos, 2);
  assert.deepEqual(it.campos.id, {tipos:['número'], em:2, distintos:2});
  assert.deepEqual(it.campos.posicao.tipos, ['texto numérico']);
  assert.deepEqual(it.campos.item.tipos, ['texto', 'texto vazio']);
  assert.deepEqual(Object.keys(it.campos.itens_agrupados.dentro.campos), ['item', 'quantidade', 'sub_total']);
  assert.equal(m.porNumero.chaveDosItens, 'itens');
  // O retrato: posições como número, id provável, tamanho dos textos, qual o PCP lê, e o kit.
  const ret = m.porNumero.retrato;
  assert.deepEqual(ret.posicoes, [1, 2]);
  assert.deepEqual(ret.numerosNoPCP, [1, 2]);
  assert.deepEqual(ret.posicao, {comecaEm:1, temZero:false, semPosicao:0, repetida:false, repetidaNoPCP:false, lacuna:false, emOrdem:true});
  assert.deepEqual(ret.idProvavel, [{campo:'id', peloNome:true, unicoPorItem:true, tipos:['número']}]);
  assert.deepEqual(ret.textos, [{descricao:'ausente', item:9, produto:'ausente', nome:'ausente'}, {descricao:'ausente', item:0, produto:'ausente', nome:'ausente'}]);
  assert.deepEqual(ret.textoQueOPCPLe, ['item', "nenhum (vira 'Item')"]);
  assert.deepEqual(ret.kits, [{linha:2, pecas:1, textoDoPai:0, textosDasPecas:[{descricao:'ausente', item:11, produto:'ausente', nome:'ausente'}], paiVsSomaDasPecas:'igual'}]);
  // A lista vem por padrão, e as duas rotas são comparadas sem valor nenhum.
  assert.ok(m.lista && m.lista.itens.objetos === 2, 'mede também a forma da lista');
  assert.deepEqual(m.compara, {mesmaQuantidade:true, soNaBuscaPorNumero:[], soNaLista:[], mesmasPosicoes:true, mesmosTextos:true, mesmosNumeros:true, mesmosKits:true, mesmoIdPorItem:{id:true}});
  const texto = JSON.stringify({...r, medidoEm:''});
  for (const segredo of ['Cliente Secreto', '0001-00', 'Placa ACM', 'Letra caixa', '1000.00', '5501', '1500']) {
    assert.ok(!texto.includes(segredo), 'não devolve o valor: ' + segredo);
  }
  const chamadas = e.run('JSON.stringify(globalThis.__urls)');
  assert.match(chamadas, /ordem-servico\/numero\/9101/);
  assert.match(chamadas, /datainicial=2026-09-20&datafinal=2026-09-21/, 'janela de um dia, com o dia seguinte');
  assert.equal(e.db.pcp_registros.length, 0, 'só leitura: nada gravado');
});

test('formatoItens com várias O.S.: até 10; o par "1,1", a lacuna e o kit abaixo das peças aparecem; a que falha não derruba as outras', async () => {
  const e = await edge('pcp-mubisys', {pcp_meta:[{chave:'mubisys', valor:{publicKey:'pk-ficticia', accessToken:'tk-ficticio'}}]});
  e.run('console = {...console, warn(){}, log(){}, error(){}}');
  const dia = '2026-09-22 08:00:00';
  const ordens = {
    // O par "1,1": posição 0 no primeiro item (o PCP dá 1) e 1 no segundo.
    '9201': {sequencial_ordem:'9201', cliente:'Cliente Sigiloso', data_cadastro:dia, itens:[
      {posicao:0, descricao:'Lona front', medidas:'3.00x1.00', quantidade:'10', sub_total:'900', valor_final:'850'},
      {posicao:1, descricao:'Lona front', medidas:'5.00x1.00', quantidade:'4', sub_total:'400', valor_final:'400'},
      {posicao:3, descricao:'', item:'', quantidade:'1', sub_total:'85', itens_agrupados:[{item:'Chapa Sigilosa', sub_total:'300'}, {item:'Perfil Sigiloso', sub_total:'295'}]}]},
    // A mesma O.S. vem diferente na lista (outro campo no item).
    '9202': {sequencial_ordem:'9202', cliente:'Outro Sigiloso', data_cadastro:dia, itens:[{posicao:'1', item:'Adesivo leitoso', quantidade:'2', sub_total:'200'}]},
  };
  const naLista = [ordens['9201'], {...ordens['9202'], itens:[{posicao:'1', item:'Adesivo leitoso', quantidade:'2', sub_total:'200', id_item:'77'}]}];
  e.run(`globalThis.__ordens = ${JSON.stringify(ordens)}; globalThis.__lista = ${JSON.stringify(naLista)}; globalThis.__listas = 0;
    fetchERP = async (url) => { const n = url.split('/').pop(); const o = globalThis.__ordens[n];
      return new Response(o ? JSON.stringify({data:o}) : '{}', {status: o ? 201 : 404}); };
    erpGet = async () => { globalThis.__listas++; return {data:globalThis.__lista}; };`);
  assert.equal((await e.call({action:'formatoItens', numeros:['1','2','3','4','5','6','7','8','9','10','11']}, ADMIN)).status, 400, 'no máximo 10');
  assert.equal((await e.call({action:'formatoItens', numeros:['9201', 'abc']}, ADMIN)).status, 400, 'só dígitos');
  const r = await e.call({action:'formatoItens', numeros:['9201', '9202', '9299', '9201']}, ADMIN);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.deepEqual(r.os.map(o => o.numero), ['9201', '9202'], 'repetida conta uma vez');
  assert.deepEqual(r.naoMedidas, [{numero:'9299', motivo:'o Mubisys respondeu HTTP 404'}]);
  assert.equal(e.run('globalThis.__listas'), 1, 'uma busca da lista por dia, para as O.S. do mesmo dia');
  const a = r.os[0].porNumero.retrato;
  assert.deepEqual(a.posicoes, [0, 1, 3]);
  assert.deepEqual(a.numerosNoPCP, [1, 1, 3], 'a posição 0 vira 1 no PCP e colide com a 1');
  assert.equal(a.posicao.temZero, true);
  assert.equal(a.posicao.repetida, false);
  assert.equal(a.posicao.repetidaNoPCP, true);
  assert.equal(a.posicao.lacuna, true);
  assert.deepEqual(a.subtotalVsFinal, ['maior', 'igual', 'sem valor']);
  assert.equal(a.kits[0].paiVsSomaDasPecas, 'menor', 'o kit grava menos que a soma das peças (D8)');
  assert.equal(a.kits[0].pecas, 2);
  assert.deepEqual(a.textoQueOPCPLe, ['descricao', 'descricao', "nenhum (vira 'Item')"]);
  const b = r.os[1].compara;
  assert.deepEqual(b.soNaLista, ['id_item']);
  assert.equal(b.mesmosNumeros, true);
  assert.deepEqual(b.mesmoIdPorItem, {});
  assert.deepEqual(r.os[1].lista.retrato.idProvavel, [{campo:'id_item', peloNome:true, unicoPorItem:null, tipos:['texto numérico']}], 'com um item só, não dá para dizer se é único');
  const texto = JSON.stringify({...r, medidoEm:''});
  for (const segredo of ['Sigilos', 'Lona', 'Chapa', 'Perfil', 'Adesivo', '3.00x1.00', '900', '850', '595', '"77"']) {
    assert.ok(!texto.includes(segredo), 'não devolve o valor: ' + segredo);
  }
  assert.equal(e.db.pcp_registros.length, 0, 'só leitura: nada gravado');
});
