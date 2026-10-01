/* REVISÃO DA E8 (01/10/2026): itens da O.S. aberta acompanham o ERP.
   Duas revisões adversariais (servidor e corretude) acharam defeitos com
   prova. Decisão do dono: a mescla vai DESLIGADA (MESCLA_ITENS_ERP = false,
   em _shared) até medir o formato do item no ERP com a ação formatoItens; o
   que não depende da medição foi corrigido na função desligada, e o que vale
   com ela desligada (o carimbo da linha, D4) foi corrigido já.
   - "mescla desligada": a hora do ERP e o upsert tratam os itens como na
     v143. A prova forte roda o servidor da v143 (fc0df82, pelo git) ao lado
     do de hoje com o mesmo roteiro; sem o histórico do git (clone raso) ela
     pula, e a prova sem git fica.
   - "revisão: D...": cada um é o caso ruim de uma das revisões, com a
     mescla LIGADA POR INJEÇÃO (só dentro do vm do servidor de teste; a
     constante de _shared continua false). Todos falham no commit 44a183f.
   Servidor de verdade: pcp-mubisys (gravarImportadas + mapearOS) e pcp-sync
   no mesmo banco (helpers/edge.cjs). Dados fictícios: o repositório é
   público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os_ = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {edge} = require('./helpers/edge.cjs');
const root = path.join(__dirname, '..');
const regras = () => import('../supabase/functions/_shared/pcp-integridade.mjs');
const motor = async () => (await import('../supabase/functions/_shared/pcp-entrega-item.mjs')).ENTREGA_ITEM;
const js = x => x === undefined ? undefined : JSON.parse(JSON.stringify(x));

const diaSP = ms => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo'}).format(new Date(ms));
const HOJE = diaSP(Date.now());
const NUM = '9101', ID = 'mub-' + NUM;
const ficha = (id, nome, apelido, cpf) => ({colecao:'colaboradores', id, apagado:false, registro:{id, nome, apelido, cpf}});
const FICHAS = [ficha('gestor-f', 'Gestor Teste', 'gestor', '11122233344'), ficha('ana-f', 'Ana Fictícia', 'ana', '10000111111')];
const GESTOR = {papel:'pcp', nome:'Gestor Teste', sub:'gestor'};
const ANA = {nome:'Ana', sub:'Ana', id:'100001', papel:'montagem', montagemIndividual:true};

// O item como a lista do ERP o manda (os nomes que o mapearItem lê).
const itemERP = (posicao, descricao, quantidade, extra = {}) => ({posicao, descricao, quantidade,
  valor_unitario:'100', sub_total:String(Number(quantidade) * 100), ...extra});
const osERP = (itens, extra = {}) => ({sequencial_ordem:NUM, status:'PRODUCAO', cliente:'Cliente Fictício', nome_trabalho:'Fachada', itens, ...extra});

/* O SERVIDOR: pcp-sync e pcp-mubisys no mesmo banco. `ligada` liga a mescla
   SÓ no vm deste servidor de teste. `fabrica` é o edge() (o de hoje ou o da
   v143). */
async function servidor({ligada = false, fabrica = edge} = {}) {
  const sync = await fabrica('pcp-sync', {pcp_registros:[], registros:js(FICHAS),
    pcp_config_global:[{id:true, config:{instaladores:['Ana']}, atualizado_em:'2026-09-19T10:00:00Z'}]});
  const mub = await fabrica('pcp-mubisys', {});
  mub.db.pcp_registros = sync.db.pcp_registros;
  mub.run('console = {...console, warn(){}, log(){}}');
  if (ligada) { sync.run('MESCLA_ITENS_ERP = true'); mub.run('MESCLA_ITENS_ERP = true'); }
  const linha = () => sync.db.pcp_registros.find(r => r.colecao === 'os' && r.id === ID);
  return {sync, mub, linha,
    importar: (itens, extra) => mub.run(`gravarImportadas(sb, [mapearOS(${JSON.stringify(osERP(itens, extra))})])`),
    os: () => js(linha().registro),
    item: uid => js(linha().registro.itens.find(i => i.uid === uid))};
}
async function marcar(s, uid, ev) {
  const os = s.os();
  const it = os.itens.find(i => i.uid === uid);
  it.entregas = [...(it.entregas || []), {dia:HOJE, ...ev}];
  const r = await s.sync.call({action:'upsert', os}, GESTOR);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.ok(s.item(uid).entregas.some(e => e.id === ev.id), 'a marca gravou');
  return r;
}
const daMarca = (os, id) => os.itens.find(i => (i.entregas || []).some(e => e.id === id));

/* ── A mescla desligada ───────────────────────────────────────────────── */

test('revisão: a mescla está desligada no _shared, e o atualizarOrigemERP sem a chave não mexe nos itens', async () => {
  const R = await regras();
  assert.equal(R.MESCLA_ITENS_ERP, false, 'MESCLA_ITENS_ERP é false');
  const atual = {id:ID, numero:NUM, origemMubisys:true, rev:2, cliente:'A', itens:[
    {uid:'9101:1:1', item:'1', descricao:'Placa ACM', medidas:'', qtde:'10', valorUnit:'100', subtotal:'1000'}]};
  const remoto = {cliente:'B', itens:[{item:'1', descricao:'Placa ACM', medidas:'', qtde:'8', valorUnit:'100', subtotal:'800'},
    {item:'2', descricao:'Totem', medidas:'', qtde:'1', valorUnit:'100', subtotal:'100'}]};
  const r = R.atualizarOrigemERP(atual, remoto, '2026-10-01T12:00:00Z');
  assert.equal(r.registro.itens, atual.itens, 'a lista de itens é a mesma (nem copiada)');
  assert.equal(r.registro.itensForaERP, undefined);
  assert.equal(r.itens, null, 'a mescla nem rodou');
  assert.deepEqual(r.alteracoes, [{campo:'cliente', antes:'A', depois:'B'}], 'os campos do ERP seguem como antes');
  // Com a chave (o que os testes da mescla fazem por injeção), a mescla roda.
  const ligada = R.atualizarOrigemERP(atual, remoto, '2026-10-01T12:00:00Z', {mesclarItens:true});
  assert.equal(ligada.registro.itens.length, 2);
  // As duas portas leem a constante (e o pcp-sync só roda a porta da mescla com ela ligada).
  const mub = fs.readFileSync(path.join(root, 'supabase/functions/pcp-mubisys/index.ts'), 'utf8');
  const sync = fs.readFileSync(path.join(root, 'supabase/functions/pcp-sync/index.ts'), 'utf8');
  assert.match(mub, /MESCLA_ITENS_ERP \} from "\.\.\/_shared\/pcp-integridade\.mjs"/);
  assert.match(mub, /atualizarOrigemERP\(linha\.registro, remoto, em, \{ mesclarItens: MESCLA_ITENS_ERP \}\)/);
  assert.equal((mub.match(/atualizarOrigemERP\(/g) || []).length, 1, 'uma chamada só, a da hora');
  assert.match(sync, /MESCLA_ITENS_ERP \} from "\.\.\/_shared\/pcp-integridade\.mjs"/);
  assert.match(sync, /if \(MESCLA_ITENS_ERP\) \{\s+const gi = guardarItensERP\(/);
  assert.equal((sync.match(/guardarItensERP\(/g) || []).length, 1, 'uma chamada só, dentro do if');
});

test('revisão: mescla desligada (sem depender do git): a hora do ERP não mexe nos itens e o upsert não roda a porta da mescla', async () => {
  const s = await servidor();
  await s.importar([itemERP('1', 'Placa ACM', '10'), itemERP('2', 'Adesivo', '1')]);
  await marcar(s, '9101:1:1', {id:'e-seis', tipo:'entregue', qtde:6});
  const antes = s.os();
  // Caso ruim: o ERP baixa a quantidade, tira o adesivo, põe um totem e troca o nome do cliente.
  const r = await s.importar([itemERP('1', 'Placa ACM', '8'), itemERP('2', 'Totem', '2')], {cliente:'Cliente Renomeado'});
  const os = s.os();
  assert.deepEqual(os.itens, antes.itens, 'os itens ficam exatamente como estavam');
  assert.equal(os.itensForaERP, undefined);
  assert.equal(os.cliente, 'Cliente Renomeado', 'o resto da hora do ERP segue');
  assert.deepEqual(os.erpAlteracoes.at(-1).campos.map(c => c.campo), ['cliente'], 'o histórico só tem o campo da O.S.');
  assert.equal(r.itensAtualizados, 0);
  // O upsert grava os campos que a porta da mescla guardaria (na v143 nada os olhava).
  const veio = s.os();
  veio.itens[0].saiuDoERP = {em:'2026-01-01T00:00:00Z'};
  veio.itens[1].chaveERP = '9101:9:1';
  veio.itens[1].produtoNoERP = 'Outro';
  veio.itensForaERP = [{uid:'9101:7:1', item:'7', em:'2026-01-01T00:00:00Z'}];
  const u = await s.sync.call({action:'upsert', os:veio}, GESTOR);
  assert.equal(u.ok, true, JSON.stringify(u));
  const g = s.os();
  assert.deepEqual(g.itens[0].saiuDoERP, {em:'2026-01-01T00:00:00Z'});
  assert.equal(g.itens[1].chaveERP, '9101:9:1');
  assert.equal(g.itens[1].produtoNoERP, 'Outro');
  assert.deepEqual(g.itensForaERP, [{uid:'9101:7:1', item:'7', em:'2026-01-01T00:00:00Z'}]);
  assert.doesNotMatch(JSON.stringify(u.avisos || []), /ERP/, 'nenhum aviso da porta da mescla');
  // A cópia velha que tira o adesivo (sem marca) o tira, como na v143.
  const velha = js(antes); velha.rev = s.os().rev; velha.itens = velha.itens.filter(i => i.uid !== '9101:2:1');
  assert.equal((await s.sync.call({action:'upsert', os:velha}, GESTOR)).ok, true);
  assert.deepEqual(s.os().itens.map(i => i.uid), ['9101:1:1']);
});

/* O servidor da v143 (fc0df82) tirado do git para uma pasta temporária: as
   funções, o _shared inteiro e o helper do teste daquela versão. */
function edgeDaV143() {
  const ler = arq => { try { return execFileSync('git', ['-C', root, 'show', 'fc0df82:' + arq], {encoding:'utf8', stdio:['ignore', 'pipe', 'ignore']}); } catch (e) { return ''; } };
  if (!ler('supabase/functions/pcp-sync/index.ts')) return null;
  const shared = execFileSync('git', ['-C', root, 'ls-tree', '--name-only', 'fc0df82', 'supabase/functions/_shared/'], {encoding:'utf8'}).split('\n').filter(Boolean);
  const dir = fs.mkdtempSync(path.join(os_.tmpdir(), 'pcp-v143-'));
  for (const arq of [...shared, 'supabase/functions/pcp-sync/index.ts', 'supabase/functions/pcp-mubisys/index.ts', 'tests/helpers/edge.cjs']) {
    fs.mkdirSync(path.join(dir, path.dirname(arq)), {recursive:true});
    fs.writeFileSync(path.join(dir, arq), ler(arq));
  }
  return {dir, edge: require(path.join(dir, 'tests/helpers/edge.cjs')).edge};
}
// Hora e carimbo mudam de uma rodada para a outra; o resto tem de ser igual.
const semHora = x => JSON.parse(JSON.stringify(x ?? null).replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, '<hora>'));
async function roteiro(fabrica) {
  const s = await servidor({fabrica});
  const fotos = [];
  const foto = (nome, resp) => fotos.push({nome, resp: semHora(resp), os: semHora(s.os())});
  const mub = r => r && {novas:r.novas, atualizadas:r.atualizadas, conflitosAtualizacao:r.conflitosAtualizacao};
  foto('importa', mub(await s.importar([itemERP('1', 'Placa ACM', '10', {medidas:'100x50'}), itemERP('2', 'Adesivo', '1'), itemERP('3', 'Placa ACM', '2', {medidas:'200x100'})])));
  const primeira = s.os();
  const os1 = s.os(); os1.itens[0].entregas = [{id:'e-seis', tipo:'entregue', qtde:6, dia:HOJE}]; os1.itens[1].pronto = true;
  foto('marca', await s.sync.call({action:'upsert', os:os1}, GESTOR));
  // O ERP tira o adesivo e renumera; muda a quantidade; põe um totem; muda o cliente.
  foto('erp muda', mub(await s.importar([itemERP('1', 'Placa ACM', '8', {medidas:'100x50'}), itemERP('2', 'Placa ACM', '2', {medidas:'200x100'}),
    itemERP('3', 'Totem', '1')], {cliente:'Cliente Renomeado'})));
  foto('erp repete', mub(await s.importar([itemERP('1', 'Placa ACM', '8', {medidas:'100x50'}), itemERP('2', 'Placa ACM', '2', {medidas:'200x100'}),
    itemERP('3', 'Totem', '1')], {cliente:'Cliente Renomeado'})));
  // O aparelho manda os campos da mescla (forjados).
  const os2 = s.os(); os2.itens[0].saiuDoERP = {em:'2026-01-01T00:00:00Z'}; os2.itens[2].chaveERP = '9101:9:1'; os2.itensForaERP = [{uid:'9101:7:1', item:'7', em:'x'}];
  foto('forja', await s.sync.call({action:'upsert', os:os2}, GESTOR));
  // O "Sobrescrever": a cópia da primeira importação com o rev do servidor, sem a placa 200x100.
  const os3 = js(primeira); os3.rev = s.os().rev; os3.obsPCP = 'Sobrescrito'; os3.itens = os3.itens.filter(i => i.medidas !== '200x100');
  foto('sobrescrever', await s.sync.call({action:'upsert', os:os3}, GESTOR));
  // O celular: lê, o ERP muda o produto da linha 2, e o Instalado chega.
  Object.assign(s.linha().registro, {equipe:['100001'], liberadoPCP:true, confirmacao:'Confirmado'});
  const doCel = js((await s.sync.call({action:'list', escopo:'abertas'}, ANA)).os.find(o => o.id === ID));
  foto('erp troca produto', mub(await s.importar([itemERP('1', 'Placa ACM', '8', {medidas:'100x50'}), itemERP('2', 'Banner', '1')])));
  const it = doCel.itens.find(i => i.uid === '9101:2:1') || doCel.itens[1];
  Object.assign(it, {statusInst:'ok', pronto:true, entregas:[{id:'d-cel', tipo:'entregue', qtde:1, dia:HOJE}]});
  foto('celular', await s.sync.call({action:'upsert', os:doCel}, ANA));
  return fotos;
}

test('revisão: mescla desligada: a hora do ERP e o upsert tratam os itens exatamente como na v143 (o servidor da v143 lado a lado)', async t => {
  const v143 = edgeDaV143();
  if (!v143) { t.skip('sem o histórico do git (clone raso)'); return; }
  try {
    const [antes, hoje] = [await roteiro(v143.edge), await roteiro(edge)];
    assert.equal(hoje.length, antes.length);
    for (let i = 0; i < antes.length; i++) {
      assert.deepEqual(hoje[i].os, antes[i].os, 'a O.S. gravada, passo ' + antes[i].nome);
      assert.deepEqual(hoje[i].resp, antes[i].resp, 'a resposta, passo ' + antes[i].nome);
    }
    // O roteiro passou pelos casos das revisões: a lista mudou no ERP e nada mudou no PCP.
    assert.deepEqual(hoje.find(f => f.nome === 'erp muda').os.itens.map(i => i.descricao), ['Placa ACM', 'Adesivo', 'Placa ACM']);
  } finally {
    fs.rmSync(v143.dir, {recursive:true, force:true});
  }
});

/* ── D1: o código que desliza não troca duas placas do mesmo produto ──── */

test('revisão: D1 do servidor: o ERP renumera, insere no começo ou devolve a posição repetida na outra ordem, e a entrega fica na placa certa', async () => {
  // D1a: tira o item 1 e renumera.
  let s = await servidor({ligada:true});
  await s.importar([itemERP('1', 'Adesivo X', '1'), itemERP('2', 'Placa ACM', '10', {medidas:'100x50'}), itemERP('3', 'Placa ACM', '2', {medidas:'200x100'})]);
  await marcar(s, '9101:2:1', {id:'e-seis', tipo:'entregue', qtde:6});
  await s.importar([itemERP('1', 'Placa ACM', '10', {medidas:'100x50'}), itemERP('2', 'Placa ACM', '2', {medidas:'200x100'})]);
  let os = s.os(), m = daMarca(os, 'e-seis');
  assert.deepEqual([m.uid, m.medidas, m.qtde], ['9101:2:1', '100x50', '10'], 'D1a: a marca continua na 100x50');
  assert.equal(m.saiuDoERP, undefined);
  assert.equal(os.itens.find(i => i.medidas === '200x100').entregas, undefined);
  assert.equal(os.itens.length, 2, 'o adesivo (sem marca) saiu');
  assert.doesNotMatch(JSON.stringify(os.erpAlteracoes.at(-1).campos), /quantidade|medidas/, 'o histórico não inventa mudança de quantidade ou de medida');
  const rev = os.rev;
  await s.importar([itemERP('1', 'Placa ACM', '10', {medidas:'100x50'}), itemERP('2', 'Placa ACM', '2', {medidas:'200x100'})]);
  assert.equal(s.os().rev, rev, 'a hora seguinte não muda nada');
  // D1b: insere no começo e renumera.
  s = await servidor({ligada:true});
  await s.importar([itemERP('1', 'Placa ACM', '10', {medidas:'100x50'}), itemERP('2', 'Placa ACM', '2', {medidas:'200x100'})]);
  await marcar(s, '9101:1:1', {id:'e-seis', tipo:'entregue', qtde:6});
  await s.importar([itemERP('1', 'Lona front', '1'), itemERP('2', 'Placa ACM', '10', {medidas:'100x50'}), itemERP('3', 'Placa ACM', '2', {medidas:'200x100'})]);
  m = daMarca(s.os(), 'e-seis');
  assert.deepEqual([m.uid, m.medidas, m.qtde], ['9101:1:1', '100x50', '10'], 'D1b');
  assert.equal(s.os().itens.length, 3);
  // D1c: posição repetida devolvida na outra ordem.
  s = await servidor({ligada:true});
  await s.importar([itemERP('1', 'Placa ACM', '10', {medidas:'100x50'}), itemERP('1', 'Placa ACM', '2', {medidas:'200x100'})]);
  await marcar(s, '9101:1:1', {id:'e-seis', tipo:'entregue', qtde:6});
  const revC = s.os().rev;
  await s.importar([itemERP('1', 'Placa ACM', '2', {medidas:'200x100'}), itemERP('1', 'Placa ACM', '10', {medidas:'100x50'})]);
  m = daMarca(s.os(), 'e-seis');
  assert.deepEqual([m.uid, m.medidas, m.qtde], ['9101:1:1', '100x50', '10'], 'D1c');
  assert.equal(s.os().rev, revC, 'os mesmos itens na outra ordem: nada a gravar');
  // Na outra ordem, o ERP baixa a 100x50 para 8: a mudança vai para a 100x50.
  await s.importar([itemERP('1', 'Placa ACM', '2', {medidas:'200x100'}), itemERP('1', 'Placa ACM', '8', {medidas:'100x50'})]);
  m = daMarca(s.os(), 'e-seis');
  assert.deepEqual([m.uid, m.medidas, m.qtde], ['9101:1:1', '100x50', '8'], 'D1c: a quantidade nova cai na placa certa');
  assert.equal(s.item('9101:1:2').qtde, '2');
});

/* A mesma placa e a mesma medida com quantidades diferentes (1 O.S. real): a
   quantidade separa o par quando o código desliza. */
test('revisão: D1 do servidor: mesmo produto e mesma medida, quantidades diferentes; o ERP tira o primeiro e a marca não vai para a outra', async () => {
  const s = await servidor({ligada:true});
  await s.importar([itemERP('1', 'Placa ACM', '10', {medidas:'1x1'}), itemERP('2', 'Placa ACM', '2', {medidas:'1x1'}), itemERP('3', 'Totem', '1')]);
  await marcar(s, '9101:1:1', {id:'e-seis', tipo:'entregue', qtde:6});
  // O vendedor tira a placa de 10 e o ERP renumera: a de 2 passa a ser a posição 1.
  await s.importar([itemERP('1', 'Placa ACM', '2', {medidas:'1x1'}), itemERP('2', 'Totem', '1')]);
  const os = s.os(), m = daMarca(os, 'e-seis');
  assert.equal(m.qtde, '10', 'a marca continua no item de 10');
  assert.ok(m.saiuDoERP, 'e ele saiu do ERP');
  assert.equal(os.itens.find(i => i.uid === '9101:2:1').qtde, '2');
  assert.equal(os.itens.find(i => i.uid === '9101:2:1').entregas, undefined);
});

test('revisão: D1 da corretude: o par "1,1" (posição 0) e a renumeração; a entrega não passa para a outra lona ou placa', async () => {
  const lin = (posicao, descricao, medidas, quantidade) => ({posicao, descricao, medidas, quantidade, valor_unitario:'100', sub_total:String(Number(quantidade) * 100)});
  let s = await servidor({ligada:true});
  await s.importar([lin(0, 'Lona front brilho', '3.00x1.00', '10'), lin(1, 'Lona front brilho', '5.00x1.00', '4'), lin(2, 'Lona front brilho', '4.00x1.00', '1')]);
  assert.deepEqual(s.os().itens.map(i => i.uid), ['9101:1:1', '9101:1:2', '9101:2:1']);
  await marcar(s, '9101:1:1', {id:'e-seis', tipo:'entregue', qtde:6});
  // O vendedor tira a lona 3x1: a 5x1 passa a ser o único "1".
  await s.importar([lin(1, 'Lona front brilho', '5.00x1.00', '4'), lin(2, 'Lona front brilho', '4.00x1.00', '1')]);
  let os = s.os();
  const ex = s.item('9101:1:1');
  assert.deepEqual([ex.medidas, ex.qtde], ['3.00x1.00', '10'], 'a 3x1 continua 3x1');
  assert.ok(ex.saiuDoERP, 'e fica "saiu do ERP"');
  assert.deepEqual(ex.entregas.map(e => e.id), ['e-seis']);
  const cinco = s.item('9101:1:2');
  assert.deepEqual([cinco.medidas, cinco.qtde, cinco.entregas], ['5.00x1.00', '4', undefined], 'a 5x1 continua na lista, sem marca');
  assert.equal(os.itensForaERP, undefined, 'nenhum código saiu');
  assert.ok(!os.erpAlteracoes.at(-1).campos.some(c => /medidas/.test(c.campo)), 'o histórico não chama de "mudou a medida"');
  // Renumeração: Banner sai, a placa 1x1 (com 6) e a 2x2 sobem uma posição.
  s = await servidor({ligada:true});
  await s.importar([lin('1', 'Banner', '1.00x1.00', '1'), lin('2', 'Placa ACM', '1.00x1.00', '10'), lin('3', 'Placa ACM', '2.00x2.00', '4')]);
  await marcar(s, '9101:2:1', {id:'e-seis', tipo:'entregue', qtde:6});
  await s.importar([lin('1', 'Placa ACM', '1.00x1.00', '10'), lin('2', 'Placa ACM', '2.00x2.00', '4')]);
  os = s.os();
  assert.deepEqual([s.item('9101:2:1').medidas, s.item('9101:2:1').qtde], ['1.00x1.00', '10'], 'a placa 1x1 fica com as 6 entregas');
  assert.equal(s.item('9101:3:1').entregas, undefined, 'a 2x2 não ganha entrega');
  assert.equal(os.itens.length, 2);
});

/* ── D2 da corretude: o kit com código deslizado ───────────────────────── */

test('revisão: D2 da corretude: o ERP tira o 1º item do par "1,1" e o kit marcado continua o kit dele (a letra caixa não vira kit)', async () => {
  const lin = (posicao, descricao, medidas, quantidade) => ({posicao, descricao, medidas, quantidade, valor_unitario:'100', sub_total:String(Number(quantidade) * 100)});
  const kit = posicao => ({posicao, quantidade:'1', valor_unitario:'500', sub_total:'500', itens_agrupados:[{item:'ACM', quantidade:'1'}]});
  const s = await servidor({ligada:true});
  await s.importar([lin(0, 'Letras caixa', '2.76x0.42', '1'), kit(1), kit(2)]);
  assert.deepEqual(s.os().itens.map(i => [i.uid, i.descricao]), [['9101:1:1', 'Letras caixa'], ['9101:1:2', 'Item'], ['9101:2:1', 'Item']]);
  await marcar(s, '9101:1:2', {id:'e-kit', tipo:'entregue', qtde:1});
  await s.importar([kit(1), kit(2)]);
  const os = s.os();
  assert.equal(s.item('9101:1:1'), undefined, 'a letra caixa (sem marca) saiu');
  assert.deepEqual(os.itensForaERP.map(f => f.uid), ['9101:1:1']);
  const marcado = s.item('9101:1:2');
  assert.equal(marcado.saiuDoERP, undefined, 'o kit entregue continua no ERP');
  assert.equal(marcado.chaveERP, '9101:1:1');
  assert.equal(marcado.medidas, '', 'sem a medida da letra caixa');
  assert.equal(os.itens.filter(i => i.descricao === 'Item').length, 2, 'dois kits, como no ERP');
  const M = await motor();
  assert.equal(M.resumoOS(os).aEntregar, 1, 'só o kit que não foi entregue');
  const rev = os.rev;
  await s.importar([kit(1), kit(2)]);
  assert.equal(s.os().rev, rev, 'a hora seguinte não muda nada');
});

/* ── D3 da corretude: o item que saiu não volta por outra medida ───────── */

test('revisão: D3 da corretude: o adesivo que saiu do ERP com entrega não "volta" quando entra outro adesivo de outra medida', async () => {
  const lin = (posicao, descricao, medidas, quantidade) => ({posicao, descricao, medidas, quantidade, valor_unitario:'100', sub_total:String(Number(quantidade) * 100)});
  const s = await servidor({ligada:true});
  await s.importar([lin('1', 'Adesivo leitoso', '2.00x1.00', '1'), lin('2', 'Lona front', '1.00x1.00', '1')]);
  await marcar(s, '9101:1:1', {id:'e-ad', tipo:'entregue', qtde:1});
  await s.importar([lin('2', 'Lona front', '1.00x1.00', '1')]);
  assert.ok(s.item('9101:1:1').saiuDoERP);
  await s.importar([lin('2', 'Lona front', '1.00x1.00', '1'), lin('3', 'Adesivo leitoso', '0.50x0.40', '3')]);
  const os = s.os(), ad = s.item('9101:1:1');
  assert.ok(ad.saiuDoERP, 'a marca "saiu do ERP" fica');
  assert.deepEqual([ad.medidas, ad.qtde], ['2.00x1.00', '1']);
  assert.deepEqual(ad.entregas.map(e => e.id), ['e-ad']);
  const novo = s.item('9101:3:1');
  assert.deepEqual([novo.medidas, novo.qtde, novo.entregas], ['0.50x0.40', '3', undefined], 'a linha nova ganha item próprio, sem a entrega');
  assert.equal(os.itens.length, 3);
  assert.ok(!os.erpAlteracoes.at(-1).campos.some(c => c.depois === 'voltou ao ERP'));
});

/* ── D7 da corretude: a medida do produto velho ────────────────────────── */

test('revisão: D7 da corretude: a linha trocada por um kit sem medida não fica com a medida da placa', async () => {
  const R = await regras();
  const atual = {id:ID, numero:NUM, origemMubisys:true, rev:1, itens:[
    {uid:'9101:1:1', item:'1', descricao:'Placa ACM', medidas:'2.00x1.00', qtde:'1', valorUnit:'100', subtotal:'100'}]};
  const r = R.mesclarItensERP(atual, [{item:'1', descricao:'Item', medidas:'', qtde:'1', valorUnit:'500', subtotal:'500'}], {em:'2026-10-01T12:00:00Z', sortear:() => 's-kit0000001'});
  assert.deepEqual(r.itens.map(i => [i.uid, i.descricao, i.medidas]), [['s-kit0000001', 'Item', '']]);
  assert.deepEqual(r.foraERP.map(f => f.uid), ['9101:1:1'], 'a placa saiu; o código dela não vai para o kit');
  assert.equal(r.itens[0].chaveERP, '9101:1:1');
});

/* ── D7 do servidor: o nome corrigido num item entregue ────────────────── */

test('revisão: D7 do servidor: o vendedor corrige o nome do produto de um item já entregue; um item só, nada a entregar, e a mescla pergunta', async () => {
  const M = await motor();
  const s = await servidor({ligada:true});
  await s.importar([itemERP('1', 'Placa ACN 3mm', '1', {medidas:'100x50'})]);
  await marcar(s, '9101:1:1', {id:'e-ent', tipo:'entregue', qtde:1});
  await s.importar([itemERP('1', 'Placa ACM 3mm', '1', {medidas:'100x50'})]);
  let os = s.os();
  assert.equal(os.itens.length, 1, 'um item só');
  const it = s.item('9101:1:1');
  assert.equal(it.descricao, 'Placa ACN 3mm', 'o item com marca não troca de produto sozinho');
  assert.equal(it.produtoNoERP, 'Placa ACM 3mm');
  assert.equal(it.saiuDoERP, undefined);
  assert.equal(M.resumoOS(os).situacao, 'completa', 'nada a entregar');
  assert.equal(M.resumoOS(os).saldoItens, 0);
  assert.equal(M.lancamentosDaOS(os, {liquido:'100'}).entregue, 10000, 'o valor entregue continua o da O.S. inteira');
  assert.ok(os.erpConferirEm, 'o selo pede conferência');
  assert.match(JSON.stringify(os.erpAlteracoes.at(-1).campos), /no ERP: Placa ACM 3mm/);
  // A mesma resposta: nada novo. A cópia do aparelho não apaga a pergunta.
  const rev = os.rev;
  await s.importar([itemERP('1', 'Placa ACM 3mm', '1', {medidas:'100x50'})]);
  assert.equal(s.os().rev, rev);
  const veio = s.os(); delete veio.itens[0].produtoNoERP; veio.obsPCP = 'gravação qualquer';
  assert.equal((await s.sync.call({action:'upsert', os:veio}, GESTOR)).ok, true);
  assert.equal(s.item('9101:1:1').produtoNoERP, 'Placa ACM 3mm');
  // A gestão confere e corrige o nome: a hora seguinte tira a pergunta.
  const corrige = s.os(); corrige.itens[0].descricao = 'Placa ACM 3mm';
  assert.equal((await s.sync.call({action:'upsert', os:corrige}, GESTOR)).ok, true);
  await s.importar([itemERP('1', 'Placa ACM 3mm', '1', {medidas:'100x50'})]);
  os = s.os();
  assert.equal(s.item('9101:1:1').produtoNoERP, undefined);
  assert.deepEqual(s.item('9101:1:1').entregas.map(e => e.id), ['e-ent']);
});

/* ── D6 do servidor: o Instalado sem rede não cai em outro produto ─────── */

test('revisão: D6 do servidor: o ERP troca a Faixa pelo Banner na mesma posição; o Instalado da Faixa feito sem rede não cai no Banner', async () => {
  const s = await servidor({ligada:true});
  await s.importar([itemERP('1', 'Placa ACM', '1'), itemERP('2', 'Faixa', '1')]);
  Object.assign(s.linha().registro, {equipe:['100001'], liberadoPCP:true, confirmacao:'Confirmado'});
  const doCel = js((await s.sync.call({action:'list', escopo:'abertas'}, ANA)).os.find(o => o.id === ID));
  await s.importar([itemERP('1', 'Placa ACM', '1'), itemERP('2', 'Banner', '1')]);
  const banner = s.os().itens.find(i => i.descricao === 'Banner');
  assert.notEqual(banner.uid, '9101:2:1', 'o código da Faixa não passa para o Banner');
  const it = doCel.itens.find(i => i.uid === '9101:2:1');
  assert.equal(it.descricao, 'Faixa');
  Object.assign(it, {statusInst:'ok', pronto:true, entregas:[{id:'d-faixa', tipo:'entregue', qtde:1, dia:HOJE}]});
  await s.sync.call({action:'upsert', os:doCel}, ANA);
  const g = s.os().itens.find(i => i.descricao === 'Banner');
  assert.notEqual(g.statusInst, 'ok', 'o Banner não foi instalado');
  assert.notEqual(g.pronto, true);
  assert.equal((g.entregas || []).length, 0, 'a entrega declarada da Faixa não vai para o Banner');
  assert.ok(!s.os().itens.some(i => i.descricao !== 'Faixa' && (i.entregas || []).some(e => e.id === 'd-faixa')));
});

/* ── D4 do servidor: o carimbo da linha é a hora da gravação ───────────── */

test('revisão: D4 do servidor: o aparelho que puxa no meio do laço da hora recebe, no pull seguinte, a O.S. gravada depois (campos do ERP, mescla desligada)', async () => {
  for (const caminho of ['importação', 'carteira']) {
    const s = await servidor();
    const dois = n => ({sequencial_ordem:n, status:'PRODUCAO', cliente:'Cliente ' + n, itens:[itemERP('1', 'Placa ACM', '1')]});
    await s.mub.run(`gravarImportadas(sb, [mapearOS(${JSON.stringify(dois('9301'))}), mapearOS(${JSON.stringify(dois('9302'))})])`);
    let cursor = '';
    // O pull do aparelho acontece enquanto a hora grava a PRIMEIRA linha de O.S. (depois do `em` do laço).
    s.mub.cliente.beforeWrite = function noPull(_db, tabela) {
      if (tabela !== 'pcp_registros') { s.mub.cliente.beforeWrite = noPull; return; }
      cursor = new Date().toISOString(); const t = Date.now(); while (Date.now() <= t + 2);
    };
    if (caminho === 'importação') {
      await s.mub.run(`gravarImportadas(sb, [mapearOS(${JSON.stringify({...dois('9301'), cliente:'Novo 1'})}), mapearOS(${JSON.stringify({...dois('9302'), cliente:'Novo 2'})})])`);
    } else {
      // As duas saem da carteira aberta (sem trabalho de gente): a conciliação as fecha.
      s.mub.db.pcp_meta = [];
      await s.mub.run(`reconciliarCarteira(sb, [mapearOS(${JSON.stringify({sequencial_ordem:'9399', status:'PRODUCAO', cliente:'Outra', itens:[]})})])`);
    }
    assert.ok(cursor, caminho + ': o pull aconteceu no meio do laço');
    const segunda = s.sync.db.pcp_registros.find(r => r.id === 'mub-9302');
    assert.ok(segunda.atualizado_em > cursor, `${caminho}: a segunda linha leva a hora em que foi gravada (${segunda.atualizado_em} > ${cursor})`);
    const r = await s.sync.call({action:'list', since:cursor}, GESTOR);
    assert.ok(r.os.some(o => o.id === 'mub-9302'), caminho + ': o pull seguinte traz a O.S. gravada depois do cursor');
  }
});
