/* O INSTALADOR DECLARA A ENTREGA PELO CELULAR (E5 do plano de entrega por
   item, 30/09/2026). Decisão do dono: o "✅ Instalado" do celular vale como
   entrega DECLARADA. Ela conta no saldo do item, mas só pontua depois de
   conferida no Fechar o dia (F14, que vem depois): quem soma R$, pontos ou o
   "entregue por item" não a conta como entregue conferido.
   É o crachá mais fraco do sistema (sem senha) gravando dado que vira
   dinheiro: autor e hora só do servidor, R$ nunca no aparelho, e a fila
   offline atravessa a troca de crachá. Cada teste começa pelo caso ruim.
   Dados fictícios: o repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto} = require('node:crypto');
const {edge} = require('./helpers/edge.cjs');
const D = require('../entrega-item.js');
const root = path.join(__dirname, '..');
const servidor = async () => (await import('../supabase/functions/_shared/pcp-entrega-item.mjs')).ENTREGA_ITEM;
const regras = () => import('../supabase/functions/_shared/pcp-integridade.mjs');
const copias = async () => [['aparelho', D], ['servidor', await servidor()]];

// O dia no calendário da fábrica: o servidor recusa marca "depois de hoje" em São Paulo.
const diaSP = ms => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo'}).format(new Date(ms));
const HOJE = diaSP(Date.now()), ONTEM = diaSP(Date.now() - 864e5);

const ficha = (id, nome, apelido, cpf) => ({colecao:'colaboradores', id, apagado:false, registro:{id, nome, apelido, cpf}});
const FICHAS = [
  ficha('ana-f', 'Ana Fictícia', 'ana', '10000111111'),
  ficha('bruno-f', 'Bruno Fictício', 'bruno', '10000222222'),
  ficha('gestor-f', 'Gestor Teste', 'gestor', '11122233344'),
];
const ITENS = () => [
  {uid:'8101:1:1', item:'1', descricao:'Placa ACM', qtde:'10', valorUnit:'100', subtotal:'1000'},
  {uid:'8101:2:1', item:'2', descricao:'Adesivo vitrine', qtde:'1', valorUnit:'500', subtotal:'500'},
  {uid:'8101:3:1', item:'3', descricao:'Servicos de instalação', qtde:'1', valorUnit:'200', subtotal:'200'},
];
const row = (id, registro) => ({id, colecao:'os', apagado:false, atualizado_em:'2026-09-19T10:00:00Z', registro:{id, rev:1, ...registro}});
const base = (extra = {}) => row('1', {numero:'8101', tipo:'externo', origemMubisys:true, cliente:'Cliente Fictício', equipe:['100001', '100002'],
  liberadoPCP:true, confirmacao:'Confirmado', valorTotal:'1700', cnpjCpf:'00.000.000/0001-00', itens:ITENS(), ...extra});
const banco = (regs = [base()]) => ({pcp_registros:regs, registros:structuredClone(FICHAS),
  pcp_config_global:[{id:true, config:{instaladores:['Ana', 'Bruno']}, atualizado_em:'2026-09-19T10:00:00Z'}]});
const gestor = {papel:'pcp', nome:'Gestor Teste', sub:'gestor'};
const ana = {nome:'Ana', sub:'Ana', id:'100001', papel:'montagem', montagemIndividual:true};
const bruno = {nome:'Bruno', sub:'Bruno', id:'100002', papel:'montagem', montagemIndividual:true};
const gravada = e => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === '1').registro;
const entregas = (e, uid) => (gravada(e).itens.find(i => i.uid === uid) || {}).entregas || [];
/* O que o celular manda: a cópia PODADA que ele recebeu (sem R$), com as
   marcas acrescentadas ao item `uid`. */
async function doCelular(e, quem = ana) {
  const r = await e.call({action:'list', escopo:'abertas'}, quem);
  return structuredClone(r.os.find(o => o.id === '1'));
}
function comMarca(os, uid, ...eventos) {
  const o = structuredClone(os);
  const it = o.itens.find(i => i.uid === uid);
  it.entregas = [...(it.entregas || []), ...eventos];
  return o;
}
const ev = (id, tipo, extra = {}) => ({id, tipo, dia:HOJE, ...extra});

/* ── Autor e hora: só do crachá e do servidor ─────────────────────────── */

test('autor forjado: o celular manda outro nome, outro ID, hora antiga, via da gestão e "não declarado"; grava o crachá, a hora do servidor e declarado', async () => {
  const e = await edge('pcp-sync', banco());
  const antes = Date.now();
  const os = comMarca(await doCelular(e), '8101:1:1', ev('e-f1', 'entregue', {qtde:10, por:'Gestor Teste', porId:'111222',
    em:'2020-01-01T00:00:00Z', via:'gestao', declarado:false, conferido:true, conferidoPor:'Gestor Teste', valor:100000}));
  const r = await e.call({action:'upsert', os}, ana);
  assert.equal(r.status, 200);
  const [m] = entregas(e, '8101:1:1');
  assert.equal(m.por, 'Ana', 'o nome é o do crachá');
  assert.equal(m.porId, '100001', 'o ID é o do crachá, pela ficha do RH');
  assert.ok(Date.parse(m.em) >= antes - 1000, 'a hora é a do servidor');
  assert.equal(m.via, 'toque', 'o via sai do papel');
  assert.equal(m.declarado, true, 'o celular não se declara conferido');
  for (const k of ['conferido', 'conferidoPor', 'valor']) assert.equal(m[k], undefined, `${k} não entra`);
  // A resposta ao celular também não leva o ID de quem marcou.
  assert.equal(r.os.itens.find(i => i.uid === '8101:1:1').entregas[0].porId, undefined);
});

test('desfeito, cancelado e problema vindos do toque: descartados com aviso e descartado na resposta, 200; a entrega e o resto do envio gravam', async () => {
  const e = await edge('pcp-sync', banco());
  // A gestão entregou 4; o celular tenta desfazer a marca da gestão, cancelar o saldo e apontar problema.
  const g = structuredClone(gravada(e));
  g.itens[0].entregas = [ev('e-g1', 'entregue', {qtde:4})];
  await e.call({action:'upsert', os:g}, gestor);
  let os = comMarca(await doCelular(e), '8101:1:1',
    ev('e-t1', 'desfeito', {alvo:'e-g1', motivo:'contei errado'}), ev('e-t2', 'cancelado', {motivo:'cliente desistiu'}),
    ev('e-t3', 'problema', {motivo:'chuva'}), ev('e-t4', 'entregue', {qtde:2}));
  os.obsTecnicas = 'Parafuso inox';
  const r = await e.call({action:'upsert', os}, ana);
  assert.equal(r.status, 200);
  assert.equal(r.ok, true);
  assert.deepEqual(entregas(e, '8101:1:1').map(m => [m.id, m.tipo, m.via]), [['e-g1', 'entregue', 'gestao'], ['e-t4', 'entregue', 'toque']]);
  assert.equal(gravada(e).obsTecnicas, 'Parafuso inox');
  assert.deepEqual(r.descartado, ['entregas']);
  assert.deepEqual(r.entregasRecusadas.map(x => x.id).sort(), ['e-t1', 'e-t2', 'e-t3']);
  assert.match(r.avisos.join(' '), /crachá sem senha.*não pode marcar "desfazer"/);
  assert.match(r.avisos.join(' '), /não pode marcar "cancelar item"/);
});

/* ── Saldo: o motor decide, e o celular fica sabendo ──────────────────── */

test('soma acima do saldo: o Instalado do celular com a quantidade inteira, depois de a gestão entregar 6, é descartado; o celular recebe o aviso, não "gravado", e sem 422', async () => {
  const e = await edge('pcp-sync', banco());
  const celular = await doCelular(e);                 // o celular leu antes da marca da gestão
  const g = structuredClone(gravada(e));
  g.itens[0].entregas = [ev('e-g6', 'entregue', {qtde:6})];
  await e.call({action:'upsert', os:g}, gestor);
  const r = await e.call({action:'upsert', os:comMarca(celular, '8101:1:1', ev('e-t10', 'entregue', {qtde:10}))}, ana);
  assert.equal(r.status, 200, 'nunca 422: a fila do celular não pode prender');
  assert.deepEqual(r.descartado, ['entregas']);
  assert.deepEqual(r.entregasRecusadas.map(x => [x.id, x.uid]), [['e-t10', '8101:1:1']]);
  assert.match(r.entregasRecusadas[0].motivo, /faltam 4 de 10/);
  assert.match(r.avisos.join(' '), /Placa ACM.*não foi gravada.*faltam 4 de 10/);
  assert.deepEqual(entregas(e, '8101:1:1').map(m => m.id), ['e-g6']);
  assert.ok(!JSON.stringify(r.os).includes('e-t10'), 'a resposta não traz a marca como gravada');
  // Duas partes no mesmo envio: a segunda é conferida contra o saldo que a primeira deixou.
  const r2 = await e.call({action:'upsert', os:comMarca(await doCelular(e), '8101:1:1', ev('e-p3', 'entregue', {qtde:3}), ev('e-p3b', 'entregue', {qtde:3}))}, ana);
  assert.deepEqual(entregas(e, '8101:1:1').map(m => m.id), ['e-g6', 'e-p3']);
  assert.deepEqual(r2.entregasRecusadas.map(x => x.id), ['e-p3b']);
  assert.match(r2.avisos.join(' '), /faltam 1 de 10/);
});

/* ── Offline ──────────────────────────────────────────────────────────── */

test('offline por um dia: a marca de ontem sobe hoje numa cópia velha e grava UMA vez, com o dia da marca e a hora do servidor; o reenvio não duplica', async () => {
  const e = await edge('pcp-sync', banco());
  const celular = await doCelular(e);                 // o celular leu ontem (rev 1)
  const g = structuredClone(gravada(e)); g.obsPCP = 'a gestão gravou no meio';
  await e.call({action:'upsert', os:g}, gestor);       // rev 2: a cópia do celular ficou velha
  const marca = ev('e-off1', 'entregue', {qtde:10, dia:ONTEM, em:new Date(Date.now() - 864e5).toISOString()});
  const envio = comMarca(celular, '8101:1:1', marca);
  const antes = Date.now();
  const r = await e.call({action:'upsert', os:structuredClone(envio)}, ana);
  assert.equal(r.status, 200);
  assert.equal(r.descartado, undefined);
  let ms = entregas(e, '8101:1:1');
  assert.equal(ms.length, 1);
  assert.equal(ms[0].dia, ONTEM, 'o dia é o da marca');
  assert.ok(Date.parse(ms[0].em) >= antes - 1000, 'a hora é a de quando chegou ao servidor');
  assert.equal(gravada(e).obsPCP, 'a gestão gravou no meio', 'a cópia velha não apaga o trabalho da gestão');
  // A resposta se perdeu: a fila manda a mesma gravação de novo, e depois outra com a mesma marca.
  await e.call({action:'upsert', os:structuredClone(envio)}, ana);
  const depois = comMarca(await doCelular(e), '8101:2:1'); depois.itens[0].entregas = [marca];
  await e.call({action:'upsert', os:depois}, ana);
  ms = entregas(e, '8101:1:1');
  assert.deepEqual(ms.map(m => [m.id, m.dia]), [['e-off1', ONTEM]], 'um evento só');
});

test('o PCP tirou o item da lista com o celular sem sinal: a entrega declarada nele volta como recusada, sem pular para o vizinho', async () => {
  const e = await edge('pcp-sync', banco());
  const celular = await doCelular(e);
  const g = structuredClone(gravada(e)); g.itens = g.itens.filter(i => i.uid !== '8101:2:1');
  await e.call({action:'upsert', os:g}, gestor);
  const r = await e.call({action:'upsert', os:comMarca(celular, '8101:2:1', ev('e-sumiu', 'entregue', {qtde:1}))}, ana);
  assert.equal(r.status, 200);
  assert.deepEqual(r.descartado, ['entregas']);
  assert.deepEqual(r.entregasRecusadas.map(x => [x.id, x.uid]), [['e-sumiu', '8101:2:1']]);
  assert.match(r.entregasRecusadas[0].motivo, /não está mais na O\.S\./);
  assert.ok(gravada(e).itens.every(i => !(i.entregas || []).length), 'não caiu em outro item');
});

/* ── O.S. finalizada ─────────────────────────────────────────────────── */

test('O.S. finalizada pela gestão enquanto o celular estava sem sinal: a entrega do toque é ignorada com aviso próprio do celular; o resto grava', async () => {
  const e = await edge('pcp-sync', banco());
  const celular = await doCelular(e);
  const g = structuredClone(gravada(e));
  Object.assign(g, {finalizadaEm:new Date().toISOString(), finalizadoPor:'Gestor Teste', entregaLancada:{data:HOJE}, justificativaConclusao:'Teste: fechada pelo escritório'});
  await e.call({action:'upsert', os:g}, gestor);
  assert.ok(gravada(e).finalizadaEm);
  const os = comMarca(celular, '8101:1:1', ev('e-fin', 'entregue', {qtde:10}));
  os.obsTecnicas = 'Obs escrita na obra';
  const r = await e.call({action:'upsert', os}, ana);
  assert.equal(r.status, 200);
  assert.deepEqual(entregas(e, '8101:1:1'), []);
  assert.deepEqual(r.descartado, ['entregas']);
  assert.match(r.entregasRecusadas[0].motivo, /já foi finalizada: a entrega marcada pelo celular não entra\. Fale com o PCP/);
  assert.doesNotMatch(r.entregasRecusadas[0].motivo, /reabra/, 'reabrir não é do instalador');
  assert.equal(gravada(e).obsTecnicas, 'Obs escrita na obra');
});

/* ── Troca de crachá ─────────────────────────────────────────────────── */

test('troca de crachá: a marca feita ontem com o crachá da Ana e enviada hoje pelo do Bruno leva o crachá do envio; o aparelho não escolhe o autor', async () => {
  const e = await edge('pcp-sync', banco());
  const os = comMarca(await doCelular(e, ana), '8101:1:1', ev('e-tc1', 'entregue', {qtde:10, dia:ONTEM, por:'Ana', porId:'100001'}));
  const r = await e.call({action:'upsert', os}, bruno);
  assert.equal(r.status, 200);
  const [m] = entregas(e, '8101:1:1');
  assert.deepEqual([m.por, m.porId, m.via, m.declarado, m.dia], ['Bruno', '100002', 'toque', true, ONTEM]);
});

test('troca de crachá: a marca da gestão guardada no aparelho e enviada pelo crachá de toque vira DECLARADA, com o autor do toque; cancelar e desfazer dela caem', async () => {
  const e = await edge('pcp-sync', banco());
  const cache = comMarca(await doCelular(e), '8101:1:1',
    {...ev('e-gc1', 'entregue', {qtde:5}), via:'gestao', por:'Gestor Teste', porId:'111222'},
    ev('e-gc2', 'cancelado', {motivo:'saldo cancelado na gestão', via:'gestao'}));
  const r = await e.call({action:'upsert', os:cache}, ana);
  assert.equal(r.status, 200);
  assert.deepEqual(entregas(e, '8101:1:1').map(m => [m.id, m.via, m.declarado, m.por]), [['e-gc1', 'toque', true, 'Ana']]);
  assert.deepEqual(r.entregasRecusadas.map(x => x.id), ['e-gc2']);
});

test('troca de crachá: a marca do celular enviada pela gestão (a fila esvaziada com usuário e senha) leva o crachá da gestão, e CONTINUA declarada', async () => {
  const e = await edge('pcp-sync', banco());
  const cel = comMarca(await doCelular(e), '8101:1:1', ev('e-gx1', 'entregue', {qtde:10, via:'toque', declarado:true, por:'Ana'}));
  // A cópia do celular é podada: a gestão manda o que o aparelho tem, e o servidor devolve o que falta.
  const r = await e.call({action:'upsert', os:cel}, gestor);
  assert.equal(r.status, 200);
  const [m] = entregas(e, '8101:1:1');
  /* Invertido na revisão da E5 (D2): este teste fixava o buraco. O autor é o
     crachá do envio (quem tem senha responde por ela), mas enviar a fila de
     outro não é conferir: a declaração do instalador virava entregue
     conferido só porque o celular foi esvaziado com senha. O aparelho só
     rebaixa a marca; quem confere é o Fechar o dia (F14). */
  assert.deepEqual([m.por, m.porId, m.via, m.declarado], ['Gestor Teste', '111222', 'gestao', true],
    'o autor é o do envio, e a marca segue declarada');
  const L = D.lancamentosDaOS(gravada(e));
  assert.equal(L.entregue, 0, 'nada virou entregue conferido');
});

/* ── O celular nunca vê R$ ───────────────────────────────────────────── */

test('podarToque continua sem valorUnit, subtotal, valorTotal, documento e o ID de quem marcou; a lista e a resposta do toque também', async () => {
  const {podarToque} = await regras();
  const o = podarToque({id:'1', valorTotal:'1700', cnpjCpf:'00.000.000/0001-00', itens:[
    {uid:'u1', item:'1', descricao:'Placa', qtde:'10', valorUnit:'100', subtotal:'1000',
      entregas:[{id:'e1', tipo:'entregue', qtde:4, dia:HOJE, via:'toque', declarado:true, por:'Ana', porId:'100001', em:'x'}]}]});
  assert.equal(o.valorTotal, undefined); assert.equal(o.cnpjCpf, undefined);
  assert.equal(o.itens[0].valorUnit, undefined); assert.equal(o.itens[0].subtotal, undefined);
  assert.equal(o.itens[0].entregas[0].porId, undefined);
  assert.equal(o.itens[0].entregas[0].declarado, true, 'a marca desce, sem R$');
  const e = await edge('pcp-sync', banco());
  const r = await e.call({action:'upsert', os:comMarca(await doCelular(e), '8101:1:1', ev('e-r1', 'entregue', {qtde:10}))}, ana);
  const lista = await e.call({action:'list', escopo:'abertas'}, ana);
  for (const [nome, os] of [['resposta', r.os], ['lista', lista.os.find(x => x.id === '1')]]) {
    assert.doesNotMatch(JSON.stringify(os), /valorUnit|subtotal|valorTotal|cnpjCpf|R\$/, nome);
    assert.equal(os.itens[0].entregas[0].declarado, true, nome);
    assert.equal(os.itens[0].entregas[0].porId, undefined, `${nome}: o ID de quem marcou não desce`);
  }
  // A gravação do toque sem os valores não apaga os valores gravados.
  assert.equal(gravada(e).itens[0].subtotal, '1000');
  assert.equal(gravada(e).valorTotal, '1700');
});

/* ── O motor: declarado não é entregue conferido, nas duas cópias ───────── */

const osDeclarada = () => ({id:'x', numero:'9001', valorTotal:'1700', itens:[
  {uid:'a', item:'1', descricao:'Placa ACM', qtde:'10', subtotal:'1000', entregas:[
    {id:'g6', tipo:'entregue', qtde:6, dia:'2026-09-20', via:'gestao', por:'Gestor Teste', em:'x'},
    {id:'t4', tipo:'entregue', qtde:4, dia:'2026-09-21', via:'toque', declarado:true, por:'Ana', em:'x'}]},
  {uid:'b', item:'2', descricao:'Adesivo vitrine', qtde:'1', subtotal:'500', entregas:[
    {id:'t1', tipo:'entregue', qtde:1, dia:'2026-09-21', via:'toque', declarado:true, por:'Ana', em:'x'}]},
  {uid:'c', item:'3', descricao:'Servicos de instalação', qtde:'1', subtotal:'200'}]});

test('o declarado não entra no valor entregue conferido: fica em `declarado` e `declaracoes`, e valorDoEvento dá 0 (as duas cópias)', async () => {
  for (const [nome, E] of await copias()) {
    const os = osDeclarada();
    const L = E.lancamentosDaOS(os);
    assert.equal(L.total, 170000, nome);
    // Placa: 100.000 (6/10 conferido = 60.000; 4/10 declarado = 40.000). Adesivo: 50.000 declarado. Serviço: 20.000, acompanha o declarado.
    assert.equal(L.entregue, 60000, `${nome}: só a parte da gestão é entregue conferido`);
    assert.equal(L.declarado, 40000 + 50000 + 20000, nome);
    assert.equal(L.entregue + L.declarado + L.saldo + L.cancelado + L.retido + L.semItem, L.total, `${nome}: a conta fecha`);
    assert.deepEqual(L.lancamentos.map(l => [l.eventoId, l.valor]), [['g6', 60000]], nome);
    assert.deepEqual(L.declaracoes.map(l => [l.tipo, l.eventoId, l.valor]), [['entregue', 't4', 40000], ['entregue', 't1', 50000], ['servico', '', 20000]], nome);
    const [placa] = os.itens;
    assert.equal(E.valorDoEvento(placa, placa.entregas[0], 100000), 60000, nome);
    assert.equal(E.valorDoEvento(placa, placa.entregas[1], 100000), 0, `${nome}: pontos por valorDoEvento não contam a declaração`);
    // O saldo conta as duas: o item está entregue (a gestão não é chamada a marcar de novo).
    const s = E.situacaoItem(placa, os);
    assert.deepEqual([s.situacao, s.entregue, s.declarado, s.saldo], ['entregue', 10, 4, 0], nome);
    const r = E.resumoOS(os);
    assert.deepEqual([r.situacao, r.unidadesEntregues, r.unidadesDeclaradas, r.declarados], ['completa', 11, 5, 2], nome);
    // Finalizada depois: a entrega implícita não "confere" o que só foi declarado.
    const fim = E.lancamentosDaOS({...os, finalizadaEm:'2026-09-22T15:00:00.000Z', finalizadoPor:'Gestor Teste'});
    assert.equal(fim.entregue, 60000, `${nome}: finalizar não confere a declaração (isso é o Fechar o dia, F14)`);
    assert.equal(fim.declarado, 110000, nome);
  }
});

test('leitura fecha por omissão: via "toque" sem a bandeira é declarada; a marca que já veio declarada segue declarada com a gestão (o via sai do papel)', async () => {
  for (const [nome, E] of await copias()) {
    assert.equal(E.declarada({id:'a', tipo:'entregue', qtde:1, dia:HOJE, via:'toque'}), true, nome);
    assert.equal(E.declarada({id:'a', tipo:'entregue', qtde:1, dia:HOJE, via:'gestao', declarado:true}), true, nome);
    assert.equal(E.declarada({id:'a', tipo:'entregue', qtde:1, dia:HOJE, via:'gestao'}), false, nome);
    assert.equal(E.declarada({id:'a', tipo:'problema', dia:HOJE, via:'toque'}), false, `${nome}: só entrega e retirada são declaradas`);
    const it = {descricao:'Placa', qtde:'10'};
    // O retirado do celular é o da O.S. interna (revisão da E5, D5: o tipo do celular segue o da O.S.).
    const doCel = E.validarEvento({id:'c1', tipo:'retirado', qtde:2, dia:HOJE, via:'gestao', declarado:false}, it, {papel:'toque', os:{tipo:'interno'}, hoje:HOJE});
    assert.deepEqual([doCel.ok, doCel.evento.via, doCel.evento.declarado], [true, 'toque', true], nome);
    /* Invertido na revisão da E5 (D2): a marca que veio declarada (a fila do
       celular esvaziada pela gestão) segue declarada; o via é o do papel. */
    const daGestao = E.validarEvento({id:'c2', tipo:'entregue', qtde:2, dia:HOJE, via:'toque', declarado:true}, it, {papel:'pcp', os:{}, hoje:HOJE});
    assert.deepEqual([daGestao.evento.via, daGestao.evento.declarado], ['gestao', true], nome);
    // A marca da gestão que não veio declarada continua conferida: o aparelho só rebaixa.
    const propria = E.validarEvento({id:'c3', tipo:'entregue', qtde:2, dia:HOJE, via:'gestao'}, it, {papel:'pcp', os:{}, hoje:HOJE});
    assert.deepEqual([propria.evento.via, propria.evento.declarado], ['gestao', undefined], nome);
  }
});

test('paridade do motor nas marcas declaradas: aparelho e servidor dão o mesmo resultado, e o texto do motor é o mesmo', async () => {
  const M = await servidor();
  const motor = f => { const s = fs.readFileSync(path.join(root, f), 'utf8'); return s.slice(s.indexOf('/* ==== MOTOR DA ENTREGA POR ITEM'), s.indexOf('/* ==== FIM DO MOTOR ==== */')); };
  assert.equal(motor('entrega-item.js'), motor('supabase/functions/_shared/pcp-entrega-item.mjs'));
  const casos = [osDeclarada(), {...osDeclarada(), tipo:'interno'}, {...osDeclarada(), finalizadaEm:'2026-09-30T02:30:00.000Z', finalizadoPor:'Mubisys (baixa automática · ENTREGUE)', baixaAutoERP:{em:'2026-09-30T02:30:00.000Z', status:'ENTREGUE'}}];
  for (const os of casos) {
    const um = E => ({L:E.lancamentosDaOS(os, {liquido:'1.500,00'}), r:E.resumoOS(os), s:os.itens.map(it => E.situacaoItem(it, os)),
      v:os.itens.map(it => (it.entregas || []).map(e => E.valorDoEvento(it, e, 99999)))});
    assert.deepEqual(um(M), um(D));
  }
});

/* ── O celular (equipe.js) ────────────────────────────────────────────── */

function celular(os, {motor = true, store = null, confirmar = true} = {}) {
  const nodes = new Map(), toasts = [], salvas = [];
  function node(sel) {
    if (!nodes.has(sel)) nodes.set(sel, {innerHTML:'', textContent:'', value:'', querySelector:node, querySelectorAll:() => [], setAttribute(){},
      classList:{toggle(){}, add(){}, remove(){}}, focus(){}});
    return nodes.get(sel);
  }
  const lista = store ? [store] : [];
  const ctx = vm.createContext({console, Date, crypto:webcrypto, document:{querySelector:node, querySelectorAll:() => [], addEventListener(){}}, window:{},
    localStorage:{getItem:() => null, setItem(){}},
    STORE:{getCFG:() => ({}), getAllOS:() => lista, getOS:id => lista.find(o => o.id === id) || null, getQueue:() => [], pullPhoto:async () => null,
      saveOS:o => salvas.push(JSON.parse(JSON.stringify(o))), carimbarMomento(){}},
    setTimeout(){}, mostrarCelebracao(){}, confirm:m => { toasts.push('?' + m); return confirmar; }});
  vm.runInContext(fs.readFileSync(path.join(root, 'operacao.js'), 'utf8'), ctx);
  if (motor) vm.runInContext(fs.readFileSync(path.join(root, 'entrega-item.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'equipe.js'), 'utf8'), ctx);
  vm.runInContext('toast=(m,t)=>__toasts.push(m); fraseAleatoria=()=>""; EQ.instalador="Ana";', Object.assign(ctx, {__toasts:toasts}));
  ctx.__os = os;
  vm.runInContext('_draft=__os; EQ.modalId=__os.id; renderModal()', ctx);
  return {html:() => node('#modal-os').innerHTML, node, toasts, salvas, run:c => vm.runInContext(c, ctx), draft:() => JSON.parse(vm.runInContext('JSON.stringify(_draft)', ctx))};
}
// A O.S. como o celular a recebe: podada (sem R$), aberta, liberada.
const naRua = (extra = {}) => ({id:'1', numero:'8101', tipo:'externo', equipe:['100001'], liberadoPCP:true, confirmacao:'Confirmado', rev:3,
  instalacao:{data:HOJE, periodo:'Manhã'}, horaSaida:'08:00', fotosCheckinIds:['c1'], fotosRetornoIds:['r1'], horaRetorno:'15:00', retornoEm:HOJE + 'T15:00:00', instalacaoOK:true,
  itens:[{uid:'8101:1:1', item:'1', descricao:'Placa ACM', qtde:'10'}, {uid:'8101:2:1', item:'2', descricao:'Adesivo vitrine', qtde:'1'},
    {uid:'8101:3:1', item:'3', descricao:'Servicos de instalação', qtde:'1'}], ...extra});

test('celular: o Instalado declara a entrega do saldo inteiro, com id próprio, e entra na fila de sempre (saveOS)', () => {
  const t = celular(naRua());
  t.run(`marcarStatusItem(0, '8101:1:1', 'ok')`);
  const it = t.draft().itens[0];
  assert.equal(it.statusInst, 'ok'); assert.equal(it.pronto, true);
  assert.equal(it.entregas.length, 1);
  const [m] = it.entregas;
  assert.match(m.id, /^e-[a-z0-9]{12}$/);
  assert.deepEqual([m.tipo, m.qtde, m.dia, m.via, m.declarado], ['entregue', 10, HOJE, 'toque', true]);
  assert.equal(t.salvas.at(-1).itens[0].entregas[0].id, m.id, 'foi para a fila no saveOS');
  assert.match(t.toasts.join(' '), /Entrega declarada: 10 de 10\. O PCP confere/);
  assert.match(t.html(), /📝 Entregue 10 de 10 \(declarado pela equipe\)/);
  // Tocar de novo não declara de novo; o serviço não recebe marca.
  t.run(`marcarStatusItem(0, '8101:1:1', 'ok'); marcarStatusItem(2, '8101:3:1', 'ok')`);
  assert.equal(t.draft().itens[0].entregas.length, 1);
  assert.equal(t.draft().itens[2].entregas, undefined);
});

test('celular: na O.S. interna o botão diz Retirado e a marca é "retirado"', () => {
  const t = celular(naRua({tipo:'interno'}));
  assert.match(t.html(), /✅ Retirado/);
  assert.doesNotMatch(t.html(), /✅ Instalado/);
  t.run(`marcarStatusItem(1, '8101:2:1', 'ok')`);
  assert.deepEqual(t.draft().itens[1].entregas.map(m => [m.tipo, m.qtde]), [['retirado', 1]]);
});

test('celular: Entregar parte recusa a parte maior que o saldo com a frase do servidor; a parte certa declara e o resto fica no saldo', () => {
  const t = celular(naRua());
  assert.match(t.html(), /data-iparte="0"[^>]*>Entregar parte</, 'quantidade inteira maior que 1 oferece a parte');
  assert.doesNotMatch(t.html(), /data-iparte="1"/, 'quantidade 1 não oferece');
  t.run(`EQ.parte = chaveParte(0, '8101:1:1'); renderModal()`);
  assert.match(t.html(), /Quantas foram agora\? Faltam 10 de 10\./);
  assert.match(t.html(), /type="number" inputmode="numeric" min="1" max="10"/);
  assert.equal(t.run(`marcarParteDoItem(0, '8101:1:1', '11')`), 'Quantidade maior que o saldo: faltam 10 de 10.');
  assert.equal(t.run(`marcarParteDoItem(0, '8101:1:1', '2,5')`), 'Quantidade inválida: use um número inteiro.');
  assert.equal(t.draft().itens[0].entregas, undefined);
  assert.equal(t.run(`marcarParteDoItem(0, '8101:1:1', '6')`), '');
  assert.deepEqual(t.draft().itens[0].entregas.map(m => m.qtde), [6]);
  assert.equal(t.draft().itens[0].statusInst, undefined, 'a parte não é o item instalado');
  assert.match(t.html(), /Entregue 6 de 10 · faltam 4 \(declarado pela equipe\)/);
  assert.doesNotMatch(t.html(), /R\$/);
  // O Instalado depois declara só o que falta.
  t.run(`marcarStatusItem(0, '8101:1:1', 'ok')`);
  assert.deepEqual(t.draft().itens[0].entregas.map(m => m.qtde), [6, 4]);
});

test('celular: voltar para Pendente não desfaz a marca declarada (o celular não desfaz), e avisa', () => {
  const t = celular(naRua());
  t.run(`marcarStatusItem(0, '8101:1:1', 'ok'); marcarStatusItem(0, '8101:1:1', '')`);
  const it = t.draft().itens[0];
  assert.equal(it.statusInst, '');
  assert.equal(it.entregas.length, 1);
  assert.match(t.toasts.at(-1), /continua registrada\. Para desfazer, fale com o PCP/);
});

test('celular: a marca que a gestão fez depois de abrir a ficha entra na conta antes do Instalado (declara só o saldo)', () => {
  const doStore = naRua(); doStore.itens[0].entregas = [{id:'e-g6', tipo:'entregue', qtde:6, dia:HOJE, via:'gestao', por:'Gestor Teste'}];
  const t = celular(naRua(), {store:doStore});
  t.run(`marcarStatusItem(0, '8101:1:1', 'ok')`);
  assert.deepEqual(t.draft().itens[0].entregas.map(m => [m.id, m.qtde]), [['e-g6', 6], [t.draft().itens[0].entregas[1].id, 4]]);
  assert.match(t.html(), /Entregue 10 de 10 \(4 declarados pela equipe\)/);
});

test('celular: Finalizar com entrega parcial diz que o que falta vai declarado; Cancelar deixa a O.S. aberta', () => {
  const aberta = celular(naRua(), {confirmar:false});
  aberta.run(`marcarParteDoItem(0, '8101:1:1', '6')`);
  aberta.node('#m-finalizar').onclick();
  assert.match(aberta.toasts.find(x => x.startsWith('?')), /Os 2 itens que faltam vão como instalados hoje \(entrega declarada\)/);
  assert.equal(aberta.draft().finalizadaEm, undefined);
  assert.match(aberta.toasts.at(-1), /continua aberta: entrega parcial/);
  assert.equal(aberta.draft().itens[1].entregas, undefined);
  const fecha = celular(naRua());
  fecha.run(`marcarParteDoItem(0, '8101:1:1', '6')`);
  fecha.node('#m-finalizar').onclick();
  const d = fecha.draft();
  assert.ok(d.finalizadaEm);
  assert.deepEqual(d.itens[0].entregas.map(m => m.qtde), [6, 4]);
  assert.deepEqual(d.itens[1].entregas.map(m => [m.qtde, m.declarado]), [[1, true]]);
  assert.equal(d.itens[2].entregas, undefined, 'serviço não recebe marca');
  // Sem marca nenhuma na O.S., finaliza como sempre, sem declarar nada.
  const sem = celular(naRua());
  sem.node('#m-finalizar').onclick();
  assert.ok(sem.draft().finalizadaEm);
  assert.ok(sem.draft().itens.every(i => !i.entregas));
});

test('celular: cache vindo da gestão (troca de crachá no aparelho) não mostra R$ nem o ID de quem marcou', () => {
  const daGestao = naRua({valorTotal:'98765.43', cnpjCpf:'00.000.000/0001-00'});
  daGestao.itens[0] = {...daGestao.itens[0], valorUnit:'9876.54', subtotal:'98765.4',
    entregas:[{id:'e-g1', tipo:'entregue', qtde:3, dia:HOJE, via:'gestao', por:'Gestor Teste', porId:'111222', em:'x'}]};
  const t = celular(daGestao);
  const html = t.html();
  assert.doesNotMatch(html, /R\$|98765|9876|111222|valor/i);
  assert.match(html, /📦 Entregue 3 de 10 · faltam 7 \(marcado pelo PCP\)/);
});

test('celular: sem o entrega-item.js (cache misto de versões), o Instalado funciona como antes, sem marca', () => {
  const t = celular(naRua(), {motor:false});
  t.run(`marcarStatusItem(0, '8101:1:1', 'ok')`);
  const it = t.draft().itens[0];
  assert.equal(it.statusInst, 'ok');
  assert.equal(it.entregas, undefined);
  assert.doesNotMatch(t.html(), /Entregar parte/);
});

test('celular: item cancelado pelo PCP não recebe a entrega do Instalado, e o instalador fica sabendo', () => {
  const os = naRua(); os.itens[0].entregas = [{id:'e-c', tipo:'cancelado', dia:HOJE, motivo:'cliente desistiu', via:'gestao', por:'Gestor Teste'}];
  const t = celular(os);
  assert.match(t.html(), /Cancelado pelo PCP: cliente desistiu/);
  assert.doesNotMatch(t.html(), /data-iparte="0"/, 'item cancelado não oferece parte');
  t.run(`marcarStatusItem(0, '8101:1:1', 'ok')`);
  assert.deepEqual(t.draft().itens[0].entregas.map(m => m.id), ['e-c']);
  assert.match(t.toasts.at(-1), /Item cancelado pelo PCP: a entrega não foi marcada/);
});

test('celular: a marca recusada pelo escritório sai do rascunho aberto', () => {
  const t = celular(naRua());
  t.run(`marcarStatusItem(0, '8101:1:1', 'ok')`);
  const id = t.draft().itens[0].entregas[0].id;
  assert.equal(t.run(`tirarRecusadasDoRascunho({id:'1', recusadas:[{id:${JSON.stringify(id)}, uid:'8101:1:1', motivo:'x'}]})`), 1);
  assert.equal(t.draft().itens[0].entregas, undefined);
});

/* ── A ficha da gestão (E4): "declarado pela equipe" é outro selo ───────── */

function gestao() {
  const ctx = vm.createContext({console, Date, document:{querySelector:() => ({innerHTML:'', classList:{toggle(){}, add(){}, remove(){}}, setAttribute(){}}), querySelectorAll:() => [], addEventListener(){}},
    window:{}, localStorage:{getItem:() => null}, STORE:{getAllOS:() => [], getCFG:() => ({}), getOS:() => null}, setTimeout(){}});
  vm.runInContext(fs.readFileSync(path.join(root, 'operacao.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'entrega-item.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), ctx);
  vm.runInContext(`STATE.user = {nome:'Gestor Teste', papel:'pcp'};`, ctx);
  return code => vm.runInContext(code, ctx);
}

test('ficha da gestão: item todo declarado mostra "declarado pela equipe", distinto de "entregue"; o misto mostra os dois; o card e o resumo avisam', () => {
  const run = gestao();
  const selo = (it, os) => run(`(() => { const os = ${JSON.stringify(os)}; const it = os.itens[${JSON.stringify(it)}]; return seloEntregaItemHTML(it, ENTREGA_ITEM.situacaoItem(it, os), os); })()`);
  const os = osDeclarada();
  // Adesivo: só declarado pelo celular.
  const decl = selo(1, os);
  assert.match(decl, /class="ent-selo st-declarado"[^>]*>declarado pela equipe 21\/09 por Ana</);
  assert.doesNotMatch(decl, /st-entregue|>entregue/);
  // Placa: 6 da gestão e 4 do celular.
  const misto = selo(0, os);
  assert.match(misto, /class="ent-selo st-entregue"/);
  assert.match(misto, /class="ent-selo st-declarado"[^>]*>4 de 10 declarados pela equipe</);
  // Só da gestão: nada de declarado.
  const soGestao = {...os, itens:[{...os.itens[0], entregas:[os.itens[0].entregas[0]]}]};
  assert.doesNotMatch(selo(0, soGestao), /declarado/);
  // Parte declarada: "declarado pela equipe: 4 de 10".
  const parte = {...os, itens:[{...os.itens[0], entregas:[os.itens[0].entregas[1]]}]};
  assert.match(selo(0, parte), /st-declarado[^>]*>declarado pela equipe: 4 de 10 · 21\/09 por Ana</);
  assert.match(run(`resumoEntregaFichaTexto(${JSON.stringify(os)})`), /2 declarados pela equipe \(a conferir\)/);
  assert.match(run(`seloEntregaCardHTML(${JSON.stringify(parte)})`), /tag-entrega-decl[^>]*>📝 1 declarado pela equipe</);
  // O diário diz que a marca foi declarada.
  const hist = run(`htmlHistoricoAlteracoes({entradas:[{acao:'alterar', origem:'toque', em:'2026-09-28T15:00:00Z', autor:{nome:'Ana', papel:'montagem'},
    campos:['itens.entregas'], antes:{'itens.entregas':{marcas:0}}, depois:{'itens.entregas':{marcas:1, novos:[
      {id:'e1', uid:'8101:1:1', item:'1', tipo:'entregue', qtde:10, dia:'2026-09-28', via:'toque', declarado:true, por:'Ana', porId:''}]}}}]})`);
  assert.match(hist, /item 1 entregue 10 unidades em 28\/09\/2026 \(declarado pela equipe\)/);
});

test('diário: a linha compacta da marca do celular leva declarado e não leva R$', async () => {
  const e = await edge('pcp-sync', banco());
  await e.call({action:'upsert', os:comMarca(await doCelular(e), '8101:1:1', ev('e-d1', 'entregue', {qtde:10}))}, ana);
  const d = e.db.pcp_registros.filter(r => r.colecao === 'auditoria').map(r => r.registro).filter(x => x.campos.includes('itens.entregas'));
  assert.equal(d.length, 1);
  const [l] = d[0].depois['itens.entregas'].novos;
  assert.deepEqual([l.id, l.tipo, l.qtde, l.via, l.declarado, l.por], ['e-d1', 'entregue', 10, 'toque', true, 'Ana']);
  assert.equal(d[0].origem, 'toque');
  assert.doesNotMatch(JSON.stringify(d[0]), /subtotal|valorUnit|R\$/);
});

/* ── A fila do celular: a recusa sai da cópia e da fila, e o aviso fica ──── */

function loja({lista = [], responder}) {
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

test('fila do celular: a declaração acima do saldo sai da cópia e da fila, e o aviso fixo fica guardado; a próxima gravação não a manda de novo', async () => {
  const e = await edge('pcp-sync', banco());
  const cel = await doCelular(e);
  const g = structuredClone(gravada(e)); g.itens[0].entregas = [ev('e-g6', 'entregue', {qtde:6})];
  await e.call({action:'upsert', os:g}, gestor);
  const s = loja({lista:[cel], responder:q => e.call(q, ana)});
  let avisou = null;
  s.on('entregas-descartadas', d => { avisou = d; });
  await s.pronto();
  const rascunho = s.getOS('1');
  rascunho.itens[0].entregas = [{id:'e-cel10', tipo:'entregue', qtde:10, dia:HOJE}];
  rascunho.atualizadoEm = new Date().toISOString();
  s.saveOS(rascunho);
  for (let i = 0; i < 100 && s.getQueue().length; i++) { await s.trySync(); await new Promise(r => setTimeout(r, 2)); }
  assert.deepEqual(entregas(e, '8101:1:1').map(m => m.id), ['e-g6']);
  assert.deepEqual(avisou && avisou.recusadas.map(x => x.id), ['e-cel10']);
  assert.ok(!(rascunho.itens[0].entregas || []).some(m => m.id === 'e-cel10'), 'saiu do rascunho (o objeto da lista)');
  assert.equal(s.avisosEntregas().length, 1);
  assert.match(s.avisosEntregas()[0].marcas[0].motivo, /faltam 4 de 10/);
  // O instalador grava outra coisa: a marca recusada não volta.
  rascunho.obsTecnicas = 'segunda gravação'; rascunho.atualizadoEm = new Date(Date.now() + 1000).toISOString();
  s.saveOS(rascunho);
  for (let i = 0; i < 100 && s.getQueue().length; i++) { await s.trySync(); await new Promise(r => setTimeout(r, 2)); }
  assert.equal(gravada(e).obsTecnicas, 'segunda gravação');
  assert.deepEqual(entregas(e, '8101:1:1').map(m => m.id), ['e-g6']);
});
