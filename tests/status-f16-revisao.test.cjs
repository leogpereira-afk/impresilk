/* REVISÃO DA F16 (30/09/2026): os defeitos que as duas revisões acharam no
   status da entrega e no cancelamento (lente servidor e lente corretude),
   cada um reproduzido pelo caso ruim ANTES do conserto. Rodados contra o
   commit da junção com a main v140 (antes das correções), todos falham lá.
   - servidor 1 (= corretude 7): desfazer o cancelamento e marcar o item no
     mesmo envio recusava a marca;
   - servidor 2: a aba v139 lançava a entrega de uma O.S. cancelada, calada;
   - servidor 3: o motivo não era conferido como texto (objeto, largura zero);
   - E5: o celular que declara numa cancelada ouve a frase dele;
   - corretude 1: a baixa do ERP ainda não lançada era julgada pela data da
     sincronização (e a prévia do Lançar dizia "não pontua" antes da data real);
   - corretude 2: a duração de agora movia o prazo congelado;
   - corretude 4: entregue sem prazo mostrava "No prazo";
   - corretude 5: o card da aberta cancelada se contradizia;
   - corretude 6: retrabalho pendente e resolvido ficaram iguais no card;
   - corretude 8: o celular não dizia que a O.S. foi cancelada;
   - corretude 9: cache misto quebrava Entregas;
   - corretude 10: "O.S. com entregue com atraso".
   (A corretude 3, a Agenda do Painel, é do repositório do Painel.)
   Dados fictícios: o repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {webcrypto} = require('node:crypto');
const {edge} = require('./helpers/edge.cjs');
const O = require('../operacao.js');
const E = require('../entrega-item.js');
const R = require('../regras.js');

const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const plano = v => JSON.parse(JSON.stringify(v));
const servidor = () => import('../supabase/functions/_shared/pcp-status.mjs');
const motorServidor = () => import('../supabase/functions/_shared/pcp-entrega-item.mjs');
// O dia de hoje na fábrica, e dias antes dele (a tela e o servidor usam o relógio de verdade).
const HOJE = E.diaSP(Date.now());
const menos = n => { const t = new Date(HOJE + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() - n); return t.toISOString().slice(0, 10); };

const ficha = (id, nome, apelido, cpf) => ({colecao:'colaboradores', id, apagado:false, registro:{id, nome, apelido, cpf}});
const FICHAS = [ficha('gestor-f', 'Gestor Teste', 'gestor', '11122233344'), ficha('ana-f', 'Ana Fictícia', 'ana', '10000111111')];
const gestor = {papel:'pcp', nome:'Gestor Teste', sub:'gestor'};
const admin = {papel:'admin', nome:'Admin Teste', sub:'admin1'};
const toque = {nome:'Ana', sub:'Ana', id:'100001', papel:'montagem', montagemIndividual:true};
const row = (id, registro) => ({id, colecao:'os', apagado:false, atualizado_em:'2026-09-19T10:00:00Z', registro:{id, rev:1, ...registro}});
const banco = regs => ({pcp_registros:regs, registros:plano(FICHAS), equipe_contas:[{sistema:'pcp', usuario:'montagem1'}],
  pcp_config_global:[{id:true, config:{instaladores:['Ana']}, atualizado_em:'2026-09-19T10:00:00Z'}]});
const gravada = (e, id = '1') => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === id).registro;
const copia = (e, id = '1') => structuredClone(gravada(e, id));
const CANC = {ativo:true, motivo:'Cliente desistiu do serviço', por:'Gestor Teste', porConta:'gestor', porId:'111222', em:'2026-09-25T10:00:00Z'};
const PEDIDO = {cancelar:true, motivo:'Cliente desistiu do serviço'};
const itens = () => [{uid:'6002:1:1', item:'1', descricao:'Placa ACM', qtde:'2', subtotal:'600'}];
const aberta = (extra = {}) => ({numero:'6002', tipo:'externo', cliente:'Cliente Fictício', equipe:['100001'], veiculo:'Fiorino',
  instalacao:{data:'2026-09-30', periodo:'Manhã', hora:'', duracaoDias:1}, itens:itens(), ...extra});
const marca = (id, dia, extra = {}) => ({id, tipo:'entregue', qtde:1, dia, via:'gestao', por:'Gestor Teste', em:dia + 'T12:00:00Z', ...extra});

/* ═════════════ servidor 1 (corretude 7): desfazer e marcar no mesmo envio ═════════════ */
test('revisão: desfazer o cancelamento e marcar o item no mesmo envio: a marca entra (a fila junta os dois)', async () => {
  const e = await edge('pcp-sync', banco([row('1', aberta({cancelamento:{...CANC}}))]));
  // Caso ruim: offline, o "Desfazer cancelamento" e a marca feita depois dele sobem no mesmo envio.
  const c = copia(e);
  c.cancelamento = {desfazer:true};
  c.itens[0].entregas = [{id:'m-desf-1', tipo:'entregue', qtde:2, dia:'2026-09-29', via:'gestao'}];
  let r = await e.call({action:'upsert', os:c}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(gravada(e).cancelamento.ativo, false, 'o desfazer entrou');
  assert.deepEqual((gravada(e).itens[0].entregas || []).map(x => x.id), ['m-desf-1'], 'e a marca feita depois dele também: ' + JSON.stringify(r.avisos));
  assert.deepEqual(r.entregasRecusadas || [], []);
  assert.doesNotMatch(String(r.avisos || ''), /O\.S\. cancelada/);
  assert.equal(gravada(e).itens[0].entregas[0].porId, '111222', 'com o carimbo do crachá');
  // Cancelar e marcar no mesmo envio: a marca feita ANTES do pedido entra; o saldo é cancelado depois.
  const e2 = await edge('pcp-sync', banco([row('1', aberta())]));
  const c2 = copia(e2);
  c2.cancelamento = {...PEDIDO};
  c2.itens[0].entregas = [{id:'m-antes-1', tipo:'entregue', qtde:1, dia:'2026-09-29', via:'gestao'}];
  r = await e2.call({action:'upsert', os:c2}, gestor);
  assert.equal(gravada(e2).cancelamento.ativo, true);
  assert.deepEqual((gravada(e2).itens[0].entregas || []).map(x => x.id), ['m-antes-1']);
  const L = E.lancamentosDaOS(gravada(e2));
  assert.ok(L.entregue > 0 && L.cancelado > 0 && L.saldo === 0, JSON.stringify(L));
  // Sem pedido nenhum, a cancelada continua recusando a marca (o conserto não abre a porta).
  const c3 = copia(e2);
  c3.itens[0].entregas = [...c3.itens[0].entregas, {id:'m-depois-1', tipo:'entregue', qtde:1, dia:'2026-09-29', via:'gestao'}];
  r = await e2.call({action:'upsert', os:c3}, gestor);
  assert.deepEqual((r.entregasRecusadas || []).map(x => x.id), ['m-depois-1']);
  assert.match(String(r.avisos), /O\.S\. cancelada: desfaça o cancelamento/);
  // O mesmo pedido de desfazer de quem não é gestão não abre a marca.
  const e3 = await edge('pcp-sync', banco([row('1', aberta({cancelamento:{...CANC}}))]));
  const c4 = copia(e3);
  c4.cancelamento = {desfazer:true};
  c4.itens[0].entregas = [{id:'m-op-1', tipo:'entregue', qtde:1, dia:'2026-09-29', via:'gestao'}];
  r = await e3.call({action:'upsert', os:c4}, {papel:'operacao', nome:'Operação Teste', sub:'operacao1'});
  assert.equal(gravada(e3).cancelamento.ativo, true);
  assert.deepEqual((r.entregasRecusadas || []).map(x => x.id), ['m-op-1']);
});

/* ═════════════ servidor 2: entrega lançada em O.S. cancelada ═════════════ */
test('revisão: a aba v139 lança a entrega de uma O.S. cancelada: fica o gravado, com aviso; desfazer e lançar juntos vale', async () => {
  const fora = {numero:'6001', tipo:'externo', origemMubisys:true, cliente:'Cliente Fictício', equipe:['100001'], itens:itens(),
    finalizadaEm:'2026-09-22T12:00:00.000Z', finalizadoPor:'Mubisys · saiu da carteira aberta',
    baixaAutoERP:{em:'2026-09-22T12:00:00.000Z', status:'FORA DA CARTEIRA ABERTA', carteira:true}, cancelamento:{...CANC}};
  const e = await edge('pcp-sync', banco([row('1', fora)]));
  // Caso ruim: a aba da v139 não conhece o cancelamento (não o manda) e lança a entrega da cancelada.
  const v139 = copia(e); delete v139.cancelamento;
  v139.entregaLancada = {data:'2026-09-22', por:'Thiago'};
  let r = await e.call({action:'upsert', os:v139}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.ok(!('entregaLancada' in gravada(e)), 'a entrega não foi lançada: ' + JSON.stringify(gravada(e).entregaLancada));
  assert.match(String(r.avisos), /A entrega não foi lançada: a O\.S\. está cancelada\. Para lançar, desfaça o cancelamento da O\.S\./);
  assert.equal(gravada(e).cancelamento.ativo, true, 'e o cancelamento fica');
  // Desfazer o cancelamento e lançar no mesmo envio: vale (a régua das marcas de item).
  const junto = copia(e); junto.cancelamento = {desfazer:true}; junto.entregaLancada = {data:'2026-09-22'};
  r = await e.call({action:'upsert', os:junto}, gestor);
  assert.equal(gravada(e).cancelamento.ativo, false);
  assert.equal(gravada(e).entregaLancada.data, '2026-09-22');assert.equal(gravada(e).entregaLancada.porId, '111222');
  // Cancelada de novo: a cópia da fila que manda a mesma data não muda nada e não avisa; outra data não entra.
  await e.call({action:'upsert', os:{...copia(e), cancelamento:{cancelar:true, motivo:'Cliente cancelou de novo, por telefone'}}}, gestor);
  const lancada = structuredClone(gravada(e).entregaLancada);
  r = await e.call({action:'upsert', os:copia(e)}, gestor);
  assert.deepEqual(gravada(e).entregaLancada, lancada);assert.doesNotMatch(String(r.avisos || ''), /não foi lançada/);
  r = await e.call({action:'upsert', os:{...copia(e), entregaLancada:{data:'2026-09-23'}}}, gestor);
  assert.deepEqual(gravada(e).entregaLancada, lancada);assert.match(String(r.avisos), /a O\.S\. está cancelada/);
  r = await e.call({action:'upsert', os:{...copia(e), entregaLancada:{desfazer:true}}}, gestor);
  assert.deepEqual(gravada(e).entregaLancada, lancada, 'nem o desfazer do lançamento');
});

/* ═════════════ servidor 3: o motivo é texto ═════════════ */
test('revisão: o motivo do cancelamento é texto, e as letras contam sem os invisíveis (tela e porta)', async () => {
  const S = await servidor();
  const RUINS = [['objeto', {a:1}], ['lista', ['Cliente desistiu do serviço']], ['número', 123456789012345678],
    ['largura zero', '​'.repeat(15)], ['controle', '\u0001'.repeat(20)], ['BOM e direção', '﻿‎‮'.repeat(6)],
    ['invisível completando', 'abc' + '​'.repeat(12)], ['hífen invisível', 'x' + '­'.repeat(20)]];
  const FRASE = 'Escreva o motivo do cancelamento com 15 letras ou mais.';
  for (const [nome, motivo] of RUINS) {
    // Caso ruim: "[object Object]" tem 15 letras, e 15 espaços de largura zero também.
    assert.equal(O.motivoCancelamentoInvalido(motivo), FRASE, 'tela: ' + nome);
    assert.equal(S.motivoCancelamentoInvalido(motivo), FRASE, 'porta: ' + nome);
    const e = await edge('pcp-sync', banco([row('1', aberta())]));
    const r = await e.call({action:'upsert', os:{...copia(e), cancelamento:{cancelar:true, motivo}}}, admin);
    assert.equal(r.status, 200, nome);
    assert.ok(!('cancelamento' in gravada(e)), nome + ': ' + JSON.stringify(gravada(e).cancelamento));
    assert.match(String(r.avisos), /A O\.S\. não foi cancelada: escreva o motivo do cancelamento com 15 letras ou mais/, nome);
  }
  /* O motivo de verdade continua valendo; o invisível no meio não atrapalha.
     Revisão da F17 (decidida): contam só as letras e os números que se veem,
     sem o espaço e a pontuação; "Obra embargada." (13 letras) já não basta. */
  assert.equal(O.motivoCancelamentoInvalido('Obra embargada.'), FRASE);assert.equal(S.motivoCancelamentoInvalido('Obra embargada.'), FRASE);
  for (const bom of ['Cliente desistiu do serviço', 'Obra embargada pela prefeitura', 'Obra​ embargada, sim']) {
    assert.equal(O.motivoCancelamentoInvalido(bom), '', bom);assert.equal(S.motivoCancelamentoInvalido(bom), '', bom);
  }
  assert.equal(O.motivoCancelamentoInvalido('x'.repeat(301)), 'O motivo do cancelamento vai até 300 letras.');
});

/* ═════════════ E5: a frase do celular ═════════════ */
test('revisão: o celular que declara a entrega de uma O.S. cancelada ouve a frase dele, igual nas duas cópias do motor', async () => {
  const MS = await motorServidor();
  const os = {...aberta(), cancelamento:{...CANC}};
  const ev = {id:'e5-1', tipo:'entregue', qtde:2, dia:HOJE};
  for (const [nome, M] of [['aparelho', E], ['servidor', MS]]) {
    // Caso ruim: o celular ouvia "desfaça o cancelamento", o que só a gestão faz.
    assert.equal(M.validarEvento(ev, os.itens[0], {papel:'toque', os}).erro, 'O.S. cancelada pelo PCP: a entrega não entra. Fale com o PCP.', nome + ': crachá');
    assert.equal(M.validarEvento(ev, os.itens[0], {papel:'montagem', os}).erro, 'O.S. cancelada pelo PCP: a entrega não entra. Fale com o PCP.', nome + ': montagem com senha');
    assert.equal(M.validarEvento(ev, os.itens[0], {papel:'pcp', os}).erro, 'O.S. cancelada: desfaça o cancelamento da O.S. para marcar.', nome + ': a gestão');
  }
  // Pela porta: o celular manda a declaração; a marca cai com a frase dele, e volta em `entregasRecusadas`.
  const e = await edge('pcp-sync', banco([row('1', aberta({liberadoPCP:true, confirmacao:'Confirmado', cancelamento:{...CANC}}))]));
  const lista = await e.call({action:'list', escopo:'abertas'}, toque);
  const o = structuredClone(lista.os.find(x => x.id === '1'));
  assert.ok(o && o.cancelamento && o.cancelamento.ativo, 'o celular recebe o cancelamento');
  o.itens[0].entregas = [{id:'e5-1', tipo:'entregue', qtde:2, dia:HOJE}];
  const r = await e.call({action:'upsert', os:o}, toque);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.ok(!(gravada(e).itens[0].entregas || []).length);
  assert.deepEqual((r.entregasRecusadas || []).map(x => x.id), ['e5-1']);
  assert.match(String(r.avisos), /O\.S\. cancelada pelo PCP: a entrega não entra\. Fale com o PCP\./);
});

/* ═════════════ corretude 1: a baixa do ERP a lançar ═════════════ */
// Agendada no PCP para 02/10 com equipe; a equipe instalou em 02/10; o ERP tirou da carteira e a sincronização viu em 06/10.
const baixa = (extra = {}) => ({id:'L1', numero:'8801', tipo:'externo', cliente:'Cliente Fictício', origemMubisys:true, equipe:['100001', '100002'], valorTotal:4200, rev:1,
  instalacao:{data:'2026-10-02', periodo:'Manhã', duracaoDias:1}, previsaoEntrega:'2026-09-28', prazoCombinado:{data:'2026-10-02', fonte:'agenda'},
  finalizadaEm:'2026-10-06T13:00:00.000Z', finalizadoPor:'Mubisys · saiu da carteira aberta', baixaAutoERP:{em:'2026-10-06T13:00:00.000Z', status:'FORA DA CARTEIRA ABERTA', carteira:true}, ...extra});
const erpEntregue = dia => ({finalizadaEm:dia + 'T13:00:00.000Z', finalizadoPor:'Mubisys (baixa automática · ENTREGUE)', baixaAutoERP:{em:dia + 'T13:00:00.000Z', status:'ENTREGUE'}});
test('revisão: a baixa do ERP ainda não lançada não é julgada pela data da sincronização (status, aparelho e servidor)', async () => {
  const S = await servidor();
  const semMotor = vm.createContext({console});
  vm.runInContext(ler('operacao.js'), semMotor);
  const C = vm.runInContext('OPERACAO', semMotor);
  const st = (o, hoje = '2026-10-07') => {
    const a = O.statusEntrega(o, hoje, R.REGRA_EMBUTIDA);
    assert.deepEqual(S.statusEntrega(o, hoje, R.REGRA_EMBUTIDA), a, 'paridade com o servidor');
    const temMarca = (o.itens || []).some(it => Array.isArray(it.entregas) && it.entregas.length);
    if (!temMarca) assert.deepEqual(plano(C.statusEntrega(o, hoje, R.REGRA_EMBUTIDA)), plano(a), 'sem o motor (celular), o mesmo');
    return a;
  };
  // Caso ruim: "Com atraso: entregue em 06/10 (baixa do ERP, sem prova), 4 dias depois do prazo", antes de a gestão lançar.
  const s = st(baixa());
  assert.equal(s.estado, 'entregue', JSON.stringify(s.aplicaveis));
  assert.equal(s.rotulo, 'Entregue (baixa do ERP a lançar)');
  assert.match(s.motivo, /^baixa do ERP em 06\/10, ainda a lançar: a data real da entrega vem no lançamento/);
  assert.equal(s.diasAtraso, 0);assert.deepEqual(s.perdas, []);assert.equal(s.dataEntrega, '');assert.equal(s.entregue, true);
  // O motor da entrega por item já dizia isso: a baixa fora da carteira não é entrega implícita.
  assert.equal(E.entregaImplicita(baixa()), null);
  // O ERP que disse ENTREGUE depois do corte também espera o lançamento.
  assert.equal(st(baixa(erpEntregue('2026-10-06'))).rotulo, 'Entregue (baixa do ERP a lançar)');
  // Lançada: a data digitada é a que conta.
  assert.equal(st(baixa({entregaLancada:{data:'2026-10-02', por:'Gestor Teste'}})).estado, 'no_prazo');
  const tarde = st(baixa({entregaLancada:{data:'2026-10-05', por:'Gestor Teste'}}));
  assert.equal(tarde.estado, 'atraso');assert.equal(tarde.diasAtraso, 3);assert.deepEqual(tarde.perdas, ['atraso']);
  // Antes do corte (decisão do dono): a baixa ENTREGUE conta no dia dela, sem prova, como antes.
  const velha = st(baixa({...erpEntregue('2026-09-11'), instalacao:{data:'2026-09-10'}, prazoCombinado:{data:'2026-09-10', fonte:'agenda'}}), '2026-09-20');
  assert.equal(velha.estado, 'atraso');assert.match(velha.motivo, /baixa do ERP, sem prova/);
  // Fora da carteira sem o dia da entrega, onde não há lançamento (antes do corte, ou a retirada): neutra, sem data.
  const foraVelha = st(baixa({finalizadaEm:'2026-09-11T13:00:00.000Z', baixaAutoERP:{em:'2026-09-11T13:00:00.000Z', status:'FORA DA CARTEIRA ABERTA', carteira:true},
    instalacao:{data:'2026-09-10'}, prazoCombinado:{data:'2026-09-10', fonte:'agenda'}}), '2026-09-20');
  assert.equal(foraVelha.estado, 'entregue');assert.equal(foraVelha.rotulo, 'Entregue (baixa do ERP, sem data)');
  const retirada = st(baixa({tipo:'interno'}));
  assert.equal(retirada.rotulo, 'Entregue (baixa do ERP, sem data)');
  // Com marca por item: todos os itens por marca, vale a última marca real; um item sem marca, a lançar.
  const doisItens = (b2) => [{uid:'L1:1:1', item:'1', descricao:'Placa ACM', qtde:'1', entregas:[marca('m1', '2026-10-02')]},
    {uid:'L1:2:1', item:'2', descricao:'Totem', qtde:'1', ...(b2 ? {entregas:[marca('m2', b2)]} : {})}];
  const tudo = st(baixa({itens:doisItens('2026-10-02')}));
  assert.equal(tudo.estado, 'no_prazo');assert.equal(tudo.dataEntrega, '2026-10-02');assert.equal(tudo.fonteEntrega, 'itens');
  assert.equal(st(baixa({itens:doisItens('2026-10-04')})).estado, 'atraso');
  assert.equal(st(baixa({itens:doisItens(null)})).rotulo, 'Entregue (baixa do ERP a lançar)');
  assert.equal(st(baixa({...erpEntregue('2026-10-06'), itens:doisItens(null)})).rotulo, 'Entregue (baixa do ERP a lançar)', 'o implícito da baixa ENTREGUE não conta como data');
});

// A prévia da divisão (ALOCUI) num contexto isolado, como a tela a mostra.
function componente() {
  const ELENCO = {pessoas:[{chave:'ana-f', id:'100001', nome:'Ana Fictícia', apelido:'ana', ativo:true}, {chave:'bia-f', id:'100002', nome:'Bia Fictícia', apelido:'bia', ativo:true}], antigos:[]};
  const escH = s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[ch]));
  const c = vm.createContext({console, setTimeout, clearTimeout, navigator:{onLine:true}, esc:escH, toast() {},
    STORE:{getCFG:() => ({instaladores:['Ana'], performancePCP:{equipes:[], participacoes:[]}}), getAllOS:() => [], getOS:() => null, elenco:() => ELENCO, getQueue:() => [], on() {}, regrasLocais:() => null},
    STATE:{user:{papel:'pcp', nome:'Gestor Teste'}}, pessoasRH:() => ELENCO.pessoas, avatarRH:() => '', dinheiroCasa:n => 'R$ ' + Number(n).toFixed(2),
    normNome:s => String(s || '').toLowerCase().trim(), diaEntrega:o => String((o.entregaLancada && o.entregaLancada.data) || o.finalizadaEm || '').slice(0, 10)});
  for (const f of ['operacao.js', 'divisao.js', 'regras.js', 'entrega-item.js', 'alocacao-ui.js']) vm.runInContext(ler(f), c, {filename:f});
  const app = ler('app.js');
  vm.runInContext(app.slice(app.indexOf('const RH_CONTRATOS_FREELANCER'), app.indexOf('/* `marcadosAgora` e `novas`')), c, {filename:'app.js (seletor)'});
  return vm.runInContext('ALOCUI', c);
}
const valorDaPrevia = h => ((h.match(/<p class="aloc-valor">[^]*?<\/p>/) || [''])[0]).replace(/<[^>]+>/g, '');
test('revisão: a prévia do Lançar entrega usa a data digitada, não a da baixa do ERP; o texto diz "atraso na entrega"', () => {
  const A = componente();
  A.iniciar('lancar:L1', {os:baixa(), equipes:[], papel:'pcp', valor:4200, reiniciar:true, dia:'2026-10-06'});
  // Caso ruim: antes de digitar a data real, a prévia já dizia "não pontua" pela data da sincronização.
  let v = valorDaPrevia(A.html('lancar:L1'));
  assert.doesNotMatch(v, /não pontua/, v);
  assert.match(v, /Comissão prevista de 1%[^:]*: R\$ 42\.00/);
  // A gestão digita a data real (02/10, no prazo): pontua.
  A.definirDataEntrega('lancar:L1', '2026-10-02');
  v = valorDaPrevia(A.html('lancar:L1'));
  assert.doesNotMatch(v, /não pontua/);assert.match(v, /R\$ 42\.00/);
  // Digita 05/10 (3 dias depois do prazo): não pontua, pelo atraso na entrega (texto da revisão).
  A.definirDataEntrega('lancar:L1', '2026-10-05');
  v = valorDaPrevia(A.html('lancar:L1'));
  assert.match(v, /O\.S\. com atraso na entrega: pela regra do programa, não pontua nem paga comissão\./);
  assert.doesNotMatch(v, /entregue com atraso/);
  // Data apagada no campo: volta ao status da O.S. como está (a lançar, sem julgar).
  A.definirDataEntrega('lancar:L1', '');
  assert.doesNotMatch(valorDaPrevia(A.html('lancar:L1')), /não pontua/);
  // O texto velho não existe mais em lugar nenhum da tela.
  assert.doesNotMatch(ler('alocacao-ui.js'), /entregue com atraso/);
});

// O Lançar entrega de verdade (casa.js) num DOM de mentira, como tests/lancar-entrega-f13.test.cjs.
function telaLancar(lista) {
  const cfg = {instaladores:['Ana'], vinculosRH:[], performancePCP:{equipes:[], participacoes:[]}};
  const ELENCO = {pessoas:[{chave:'ana-f', id:'100001', nome:'Ana Fictícia', apelido:'ana', area:'Montagem', ativo:true}, {chave:'bia-f', id:'100002', nome:'Bia Fictícia', apelido:'bia', area:'Montagem', ativo:true}],
    antigos:[], ferias:[], ausencias:[], fichaRH:true};
  const criados = [], dom = {};
  const elemento = () => {
    const filhos = new Map();
    const el = {innerHTML:'', style:{}, hidden:false, dataset:{}, querySelector:sel => { if (!filhos.has(sel)) filhos.set(sel, elemento()); return filhos.get(sel); },
      querySelectorAll:() => [], remove() {}, focus() {}};
    return el;
  };
  const IDS = new Set(['lancar-form', 'lancar-x', 'lancar-aloc']);
  const escH = s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[ch]));
  const c = vm.createContext({console, setTimeout, clearTimeout, navigator:{onLine:true}, esc:escH, toast() {}, confirm:() => true,
    STORE:{getCFG:() => cfg, saveCFG() {}, getAllOS:() => lista, getOS:id => lista.find(o => o.id === id) || null, saveOS() {}, elenco:() => ELENCO, getQueue:() => [],
      trySync:async () => {}, on() {}, onConflict() {}, regrasLocais:() => null, valores:() => ({}), pullPhoto:async () => null, uuid:() => 'u1'},
    STATE:{user:{papel:'pcp', nome:'Gestor Teste'}}, localStorage:{getItem:() => null, setItem() {}, removeItem() {}},
    document:{getElementById:id => IDS.has(id) ? (dom[id] || (dom[id] = elemento())) : null, querySelector:() => null, querySelectorAll:() => [],
      createElement:() => { const e = elemento(); criados.push(e); return e; }, body:{appendChild() {}, classList:{add() {}, remove() {}, contains:() => false}}},
    emptyState:() => '', bindCardClicks() {}, fmtInstalacao:() => '', filtroPeriodoHTML:() => '', hojeISO:() => '2026-10-07', nowISO:() => '2026-10-07T12:00:00Z',
    voltaEquipeHTML:() => '', registrarRemarcacao() {}});
  for (const f of ['operacao.js', 'divisao.js', 'regras.js', 'performance.js', 'entrega-item.js', 'alocacao-ui.js', 'casa.js']) vm.runInContext(ler(f), c, {filename:f});
  const app = ler('app.js');
  const trecho = (de, ate) => { const i = app.indexOf(de), j = app.indexOf(ate, i); assert.ok(i >= 0 && j > i, de); return app.slice(i, j); };
  vm.runInContext(trecho('const $  = ', 'const $$ = '), c);
  vm.runInContext(trecho('const RH_CONTRATOS_FREELANCER', '/* `marcadosAgora` e `novas`'), c);
  vm.runInContext(trecho('const VOLTA_ROTULO', '// Rótulo curto dos selos'), c);
  vm.runInContext(trecho('const ETAPAS_ORIGEM', 'function validarFinalizacao'), c);
  return {A:vm.runInContext('ALOCUI', c), run:code => vm.runInContext(code, c), criados};
}
test('revisão: no Lançar entrega, mudar o campo de data repinta a prévia com a data digitada', () => {
  const t = telaLancar([baixa()]);
  t.run(`lancarEntregaManual('L1')`);
  const box = t.criados[t.criados.length - 1];
  const campo = box.querySelector('#lancar-form input[name="data"]');
  // Caso ruim: o campo de data não falava com a prévia; ela ficava na data da baixa do ERP.
  assert.equal(typeof campo.onchange, 'function', 'o campo de data avisa a prévia');
  assert.doesNotMatch(valorDaPrevia(t.A.html('lancar:L1')), /não pontua/);
  campo.value = '2026-10-05';
  campo.onchange();
  assert.match(valorDaPrevia(t.A.html('lancar:L1')), /atraso na entrega: pela regra do programa, não pontua/);
  campo.value = '2026-10-02';
  campo.onchange();
  assert.doesNotMatch(valorDaPrevia(t.A.html('lancar:L1')), /não pontua/);
});

/* ═════════════ corretude 2: a duração congela junto com a data ═════════════ */
test('revisão: a duração de agora não move o prazo congelado; os dias congelam junto com a data', async () => {
  const S = await servidor();
  const base = (extra = {}) => ({id:'t1', numero:'9901', tipo:'externo', cliente:'Cliente Fictício', equipe:['Ana'],
    instalacao:{data:'2026-09-10', periodo:'Manhã', duracaoDias:1}, prazoCombinado:{data:'2026-09-10', fonte:'agenda', dias:1},
    finalizadaEm:'2026-09-14T15:00:00.000Z', finalizadoPor:'Gestor Teste', ...extra});
  // Caso ruim (A2): 5 dias escritos depois, sem remarcar e sem motivo: o atraso de 4 dias virava "No prazo".
  const a2 = base({instalacao:{data:'2026-09-10', periodo:'Manhã', duracaoDias:5}});
  for (const [nome, X] of [['aparelho', O], ['servidor', S]]) {
    const s = X.statusEntrega(a2, '2026-09-20');
    assert.equal(s.estado, 'atraso', nome + ': ' + s.motivo);assert.equal(s.diasAtraso, 4);assert.equal(s.prazo, '2026-09-10');
  }
  // A3: prazo de 3 dias congelado; a agenda foi remarcada para 20/09 com 1 dia; entregue no 3º dia: no prazo.
  const a3 = base({prazoCombinado:{data:'2026-09-10', fonte:'agenda', dias:3}, instalacao:{data:'2026-09-20', periodo:'Manhã', duracaoDias:1}, finalizadaEm:'2026-09-12T15:00:00.000Z'});
  assert.equal(O.statusEntrega(a3, '2026-09-25').estado, 'no_prazo');assert.equal(O.prazoDaEntrega(a3).fim, '2026-09-12');
  // O carimbo antigo, sem os dias, usa a duração de agora, como antes; dias que não são inteiro de 1 a 366 não valem.
  assert.equal(O.prazoDaEntrega(base({prazoCombinado:{data:'2026-09-10', fonte:'agenda'}, instalacao:{data:'2026-09-10', duracaoDias:3}})).fim, '2026-09-12');
  for (const dias of [0, -1, 2.5, '3', 400, null, true]) assert.equal(O.prazoDaEntrega(base({prazoCombinado:{data:'2026-09-10', fonte:'agenda', dias}})).fim, '2026-09-10', String(dias));
  // Cliente retira: o próprio dia, mesmo com dias no carimbo.
  assert.equal(O.prazoDaEntrega(base({tipo:'interno', prazoCombinado:{data:'2026-09-10', fonte:'agenda', dias:4}})).fim, '2026-09-10');
  // O prazo lido do histórico (sem carimbo) usa a duração de agora.
  assert.equal(O.prazoDaEntrega(base({prazoCombinado:undefined, agendaLog:[{de:'2026-09-10', data:'2026-09-20'}], instalacao:{data:'2026-09-20', duracaoDias:2}})).fim, '2026-09-11');

  // Pela porta: o prazo nasce com os dias da agenda; a duração mudada depois não mexe no carimbo.
  const e = await edge('pcp-sync', banco([row('1', {numero:'6101', tipo:'externo', cliente:'Cliente Fictício', equipe:[], instalacao:{data:'', periodo:'', duracaoDias:1}})]));
  let c = copia(e); c.instalacao = {data:'2026-10-10', periodo:'Manhã', duracaoDias:3}; c.equipe = ['100001'];
  let r = await e.call({action:'upsert', os:c}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(gravada(e).prazoCombinado.data, '2026-10-10');assert.equal(gravada(e).prazoCombinado.dias, 3, 'os dias nascem com a data');
  c = copia(e); c.instalacao = {...c.instalacao, duracaoDias:5};
  await e.call({action:'upsert', os:c}, gestor);
  assert.equal(gravada(e).instalacao.duracaoDias, 5);assert.equal(gravada(e).prazoCombinado.dias, 3, 'a duração nova não move o prazo');
  assert.equal(O.prazoDaEntrega(gravada(e)).fim, '2026-10-12');
  // O carimbo de antes desta revisão (sem os dias): a gravação que muda a duração congela a da versão gravada.
  const pcVelho = {data:'2026-10-10', fonte:'agenda', por:'Gestor Teste', porConta:'gestor', porId:'111222', em:'2026-09-29T12:00:00Z'};
  const e2 = await edge('pcp-sync', banco([row('1', {numero:'6102', tipo:'externo', cliente:'Cliente Fictício', equipe:['100001'],
    instalacao:{data:'2026-10-10', periodo:'Manhã', duracaoDias:1}, prazoCombinado:{...pcVelho}})]));
  c = copia(e2); c.instalacao = {...c.instalacao, duracaoDias:5};
  await e2.call({action:'upsert', os:c}, gestor);
  assert.deepEqual(gravada(e2).prazoCombinado, {...pcVelho, dias:1}, 'o resto do carimbo fica como estava');
  assert.equal(O.prazoDaEntrega(gravada(e2)).fim, '2026-10-10');
  // A correção (pedido com motivo) leva os dias junto: os do pedido, ou a duração de agora.
  c = copia(e2); c.prazoCombinado = {corrigir:true, data:'2026-10-11', motivo:'Data digitada errada na agenda'};
  await e2.call({action:'upsert', os:c}, gestor);
  assert.equal(gravada(e2).prazoCombinado.fonte, 'correcao');assert.equal(gravada(e2).prazoCombinado.data, '2026-10-11');assert.equal(gravada(e2).prazoCombinado.dias, 5);
  c = copia(e2); c.prazoCombinado = {corrigir:true, data:'2026-10-11', motivo:'Cliente pediu só dois dias de obra', dias:2};
  await e2.call({action:'upsert', os:c}, gestor);
  assert.equal(gravada(e2).prazoCombinado.dias, 2);assert.equal(O.prazoDaEntrega(gravada(e2)).fim, '2026-10-12');
  // A O.S. antiga, sem carimbo, que só muda a duração: grava o prazo lido da versão gravada, com os dias dela.
  const e3 = await edge('pcp-sync', banco([row('1', {numero:'6103', tipo:'externo', cliente:'Cliente Fictício', equipe:['100001'],
    instalacao:{data:'2026-10-10', periodo:'Manhã', duracaoDias:2}})]));
  c = copia(e3); c.instalacao = {...c.instalacao, duracaoDias:4};
  await e3.call({action:'upsert', os:c}, gestor);
  const pc3 = gravada(e3).prazoCombinado;
  assert.ok(pc3, 'o prazo lido foi gravado');
  assert.deepEqual({data:pc3.data, dias:pc3.dias, fonte:pc3.fonte, lidoDe:pc3.lidoDe}, {data:'2026-10-10', dias:2, fonte:'agenda', lidoDe:'agenda'});
  assert.equal(O.prazoDaEntrega(gravada(e3)).fim, '2026-10-11');
});

/* ═════════════ a tela da gestão (app.js inteiro, store de verdade, porta de verdade) ═════════════ */
function domFalso() {
  const porId = new Map(), nos = new Map();
  const el = tag => ({tag, id:'', className:'', innerHTML:'', textContent:'', value:'', dataset:{}, hidden:false, style:{},
    classList:{add() {}, remove() {}, toggle() {}, contains:() => false},
    setAttribute() {}, getAttribute() {}, focus() {}, addEventListener() {}, remove() {}, querySelector:() => null, querySelectorAll:() => [], closest:() => null,
    insertBefore(n) { if (n && n.id) porId.set(n.id, n); }, appendChild(n) { if (n && n.id) porId.set(n.id, n); }});
  const no = sel => { if (!nos.has(sel)) nos.set(sel, el('div')); return nos.get(sel); };
  return {doc:{activeElement:null, body:el('body'), addEventListener() {}, querySelector:sel => no(sel), querySelectorAll:() => [],
    getElementById:id => porId.get(id) || null, createElement:tag => el(tag)}};
}
async function bancada(registros) {
  const e = await edge('pcp-sync', banco(registros));
  const inicial = e.db.pcp_registros.filter(r => r.colecao === 'os').map(r => plano(r.registro));
  const d = domFalso(), ls = new Map([['impresilk_inst_os', JSON.stringify(inicial)], ['impresilk_inst_fila', '[]']]);
  const idb = {transaction() { const tx = {objectStore:() => ({get() { const q = {}; queueMicrotask(() => q.onsuccess?.({target:{result:null}})); return q; },
    put() { queueMicrotask(() => tx.oncomplete?.()); }, delete() { queueMicrotask(() => tx.oncomplete?.()); }})}; return tx; }};
  const ctx = vm.createContext({console:{log() {}, warn() {}, error() {}}, navigator:{onLine:true}, window:{addEventListener() {}}, location:{reload() {}},
    localStorage:{getItem:k => ls.has(k) ? ls.get(k) : null, setItem:(k, v) => ls.set(k, String(v)), removeItem:k => ls.delete(k)},
    indexedDB:{open() { const q = {}; queueMicrotask(() => q.onsuccess({target:{result:idb}})); return q; }, deleteDatabase() {}},
    setTimeout:() => 1, clearTimeout() {}, setInterval:() => 1, clearInterval() {}, AbortController, API_BASE:'http://teste',
    fetch:async (_u, req) => { const r = await e.call(JSON.parse(req.body), gestor); return {ok:!(r.status >= 400), status:r.status || 200, json:async () => r}; },
    document:d.doc, confirm:() => true});
  for (const f of ['store.js', 'operacao.js', 'entrega-item.js', 'app.js']) vm.runInContext(ler(f), ctx, {filename:f});
  const run = c => vm.runInContext(c, ctx);
  const toasts = [];
  ctx.__toasts = toasts;
  run(`STATE.user = {nome:'Gestor Teste', papel:'pcp'}; renderModal = () => {}; renderActiveTab = () => {}; toast = (m, t) => __toasts.push([m, t]);`);
  await run('STORE').pronto();
  return {run, toasts, card:id => run(`osCardHTML(STORE.getOS(${JSON.stringify(id)}))`)};
}

test('revisão: entregue sem prazo combinado é neutro ("Entregue, sem prazo combinado"), sem o verde e fora das perdas', async () => {
  const o = {id:'s1', numero:'9101', tipo:'externo', cliente:'Cliente Fictício', equipe:['Ana'], instalacao:{data:'2026-09-30'},
    prazoCombinado:{data:'', fonte:'semAgenda'}, finalizadaEm:'2026-09-30T15:00:00.000Z', finalizadoPor:'Gestor Teste'};
  // Caso ruim: "✅ No prazo" sem prazo nenhum para medir.
  const s = O.statusEntrega(o, '2026-10-01', R.REGRA_EMBUTIDA);
  assert.equal(s.estado, 'entregue');assert.equal(s.rotulo, 'Entregue, sem prazo combinado');
  assert.match(s.motivo, /sem prazo combinado no PCP, não há atraso a medir/);
  assert.deepEqual(s.perdas, []);assert.equal(s.entregue, true);assert.equal(s.dataEntrega, '2026-09-30');
  assert.ok(!O.statusEntrega({...o, retrabalho:true}, '2026-10-01', R.REGRA_EMBUTIDA).aplicaveis.some(a => a.estado === 'no_prazo'));
  // Na tela: o selo neutro, sem a classe verde.
  const b = await bancada([row('1', {...o, id:'1'})]);
  const card = b.card('1');
  assert.match(card, /selo-entrega se-entregue[^>]*><span aria-hidden="true">📦<\/span> Entregue, sem prazo combinado</);
  assert.doesNotMatch(card, /se-no_prazo/);
  const css = /\.selo-entrega\.se-entregue \{([^}]*)\}/.exec(ler('styles.css'));
  assert.ok(css, 'o selo neutro tem estilo');assert.doesNotMatch(css[1], /#dcfce7|#166534/, 'sem o verde do No prazo');
});

test('revisão: o card da O.S. aberta cancelada não se contradiz (sem "Itens entregues", sem contador de entrega nem agenda)', async () => {
  const canc = {...CANC};
  const cancelada = aberta({numero:'7701', liberadoPCP:true, confirmacao:'Confirmado', instalacao:{data:menos(5), periodo:'Tarde', duracaoDias:1},
    prazoCombinado:{data:menos(5), fonte:'agenda'}, dataEntrada:menos(20),
    itens:[{uid:'7701:1:1', item:'1', descricao:'Placa ACM', qtde:'1', subtotal:'600', entregas:[marca('m1', menos(5))]}, {uid:'7701:2:1', item:'2', descricao:'Totem', qtde:'1', subtotal:'400'}],
    cancelamento:canc});
  const viva = {...cancelada, numero:'7702'};
  delete viva.cancelamento;
  const b = await bancada([row('1', cancelada), row('2', viva)]);
  const card = b.card('1');
  // Caso ruim: "⛔ Cancelado" ao lado de "📦 Itens entregues: falta finalizar", "📦 atrasada 5d" e "📅 ... Agendada".
  assert.match(card, /selo-entrega se-cancelado/);
  assert.doesNotMatch(card, /Itens entregues: falta finalizar|Entrega parcial/);
  assert.doesNotMatch(card, /atrasada \d+d|entrega em \d+d|entrega hoje|HOJE|AMANHÃ/);
  assert.doesNotMatch(card, /title="Agendada"|title="Finalizada em"/);
  assert.match(card, /prazo-tag prazo-cancelada/);assert.match(card, /title="Data do pedido"/, 'a data do pedido fica');
  // A mesma O.S. sem o cancelamento mostra tudo (o conserto só cala a cancelada).
  const outra = b.card('2');
  assert.match(outra, /Entrega parcial 1 de 2/);assert.match(outra, /atrasada 5d/);assert.match(outra, /title="Agendada"/);
});

test('revisão: no card, o retrabalho a resolver continua diferente do resolvido', async () => {
  const fin = {finalizadaEm:menos(3) + 'T18:00:00.000Z', finalizadoPor:'Gestor Teste', retrabalho:true, problema:'Adesivo descolou na borda'};
  const b = await bancada([row('1', aberta({numero:'7801', ...fin})), row('2', aberta({numero:'7802', ...fin, dataResolvido:menos(1)}))]);
  const pendente = b.card('1'), resolvido = b.card('2');
  // Caso ruim: os dois diziam só "🔴 Retrabalho"; o card perdeu o sinal do que ainda falta resolver.
  assert.match(pendente, /se-retrabalho/);assert.match(pendente, /<span class="tag-retrab"[^>]*>a resolver<\/span>/);
  assert.match(resolvido, /se-retrabalho/);assert.doesNotMatch(resolvido, /a resolver|tag-retrab/);
  // Sem o selo de retrabalho na frente (a cancelada), a marca antiga volta.
  const b2 = await bancada([row('1', aberta({numero:'7803', ...fin, cancelamento:{...CANC}}))]);
  assert.match(b2.card('1'), /se-cancelado/);assert.match(b2.card('1'), /<span class="tag-retrab">🔴 retrabalho<\/span>/);
});

test('revisão: o menu Etapa do card da O.S. cancelada não oferece "Registrar saída" nem "Finalizar" (prova p8)', async () => {
  const pronta = (numero, extra = {}) => aberta({numero, liberadoPCP:true, confirmacao:'Confirmado', confEm:HOJE + 'T08:00:00-03:00',
    instalacao:{data:HOJE, periodo:'Tarde', duracaoDias:1}, prazoCombinado:{data:HOJE, fonte:'agenda'}, ...extra});
  const b = await bancada([row('1', pronta('7901', {cancelamento:{...CANC}})), row('2', pronta('7902')),
    row('3', pronta('7903', {cancelamento:{...CANC}, horaSaida:'08:00', saidaEm:HOJE + 'T11:00:00.000Z'}))]);
  const menu = id => (b.card(id).match(/<ul class="card-etapa-menu">[^]*?<\/ul>/) || [''])[0];
  // Caso ruim (p8): a aberta cancelada seguia oferecendo "🚗 Registrar saída" e "🏁 Finalizar" no menu Etapa.
  const m1 = menu('1');
  assert.ok(m1, 'o card tem o menu Etapa');
  assert.doesNotMatch(m1, /data-etapa-acao="exec"|data-etapa-acao="finalizar"/);
  assert.doesNotMatch(m1, /Registrar saída<\/button>|🏁 Finalizar<\/button>/);
  assert.equal((m1.match(/Cancelada pelo PCP: para seguir, desfaça o cancelamento na ficha\./g) || []).length, 2, 'as duas linhas dizem o porquê');
  // O card desenhado antes do último sync: o clique também não registra saída nem finaliza.
  b.run(`moverEtapa('1', 'finalizar')`);
  assert.ok(!b.run(`STORE.getOS('1').finalizadaEm`), 'não finalizou');
  b.run(`finalizarServicoDoCard('1')`);
  assert.ok(!b.run(`STORE.getOS('1').finalizadaEm`));
  b.run(`STATE.modalOSId = null; moverEtapa('1', 'exec')`);
  assert.equal(b.run('STATE.modalOSId'), null, 'a ficha não abriu na saída');
  assert.equal(b.toasts.filter(([m, t]) => t === 'error' && /O\.S 7901 cancelada pelo PCP: para seguir, desfaça o cancelamento na ficha\./.test(m)).length, 3);
  // A equipe que já saiu ainda abre a execução (para registrar a volta), mas não finaliza.
  const m3 = menu('3');
  assert.match(m3, /data-etapa-acao="exec"[^>]*>🔧 Abrir execução<\/button>/);assert.doesNotMatch(m3, /data-etapa-acao="finalizar"/);
  // A mesma O.S. sem o cancelamento segue com os dois.
  const m2 = menu('2');
  assert.match(m2, /data-etapa-acao="exec"[^>]*>🚗 Registrar saída<\/button>/);assert.match(m2, /data-etapa-acao="finalizar"[^>]*>🏁 Finalizar<\/button>/);
  assert.doesNotMatch(m2, /Cancelada pelo PCP/);
});

/* ═════════════ corretude 8: o celular ═════════════ */
function celular(lista) {
  const nodes = new Map();
  function node(sel) {
    if (!nodes.has(sel)) nodes.set(sel, {innerHTML:'', textContent:'', value:'', style:{}, querySelector:node, querySelectorAll:() => [], setAttribute() {}, addEventListener() {},
      classList:{toggle() {}, add() {}, remove() {}, contains() { return false; }}, focus() {}});
    return nodes.get(sel);
  }
  const STORE = {getCFG:() => ({}), getAllOS:() => lista, getOS:id => lista.find(o => o.id === id) || null, getQueue:() => [], pushPhoto:async () => 'f', pullPhoto:async () => null,
    getLastSync:() => '2026-09-25T10:00:00Z', saveOS() {}, carimbarMomento() {}, delFoto() {}, delFotoSync() {}, onConflict() {}, sobrescreverServidor:o => o, aceitarServidor() {}};
  const toasts = [];
  const ctx = vm.createContext({console, Date, crypto:webcrypto, document:{querySelector:node, querySelectorAll:() => [], addEventListener() {}, getElementById:node},
    window:{}, localStorage:{getItem:() => null, setItem() {}}, STORE, setTimeout() {}, mostrarCelebracao() {}, confirm:() => true, navigator:{onLine:true}});
  for (const f of ['operacao.js', 'entrega-item.js', 'equipe.js']) vm.runInContext(ler(f), ctx, {filename:f});
  ctx.__toasts = toasts;
  vm.runInContext('toast = m => __toasts.push(m); fraseAleatoria = () => ({t:"", a:""}); EQ.instalador = "Ana"; EQ.pronto = true;', ctx);
  return {node, toasts, run:c => vm.runInContext(c, ctx)};
}
test('revisão: o celular mostra a O.S. cancelada pelo PCP num grupo próprio, sem saída e sem finalizar', () => {
  const os = (id, extra) => ({id, numero:'C' + id, cliente:'Cliente ' + id, tipo:'externo', equipe:['Ana'], liberadoPCP:true, confirmacao:'Confirmado',
    confEm:new Date().toISOString(), instalacao:{data:HOJE, periodo:'Manhã'}, itens:[{uid:'C' + id + ':1:1', item:'1', descricao:'Fachada', qtde:'1'}], ...extra});
  const canc = {ativo:true, motivo:'Obra do cliente foi embargada', por:'Gestor Teste', em:menos(1) + 'T12:00:00Z'};
  const lista = [
    os('venc', {instalacao:{data:menos(3), periodo:'Manhã'}, cancelamento:canc}),
    os('hoje', {cancelamento:canc, carroLiberado:true, carroLiberadoPor:'Gestor Teste'}),
    os('erp', {finalizadaEm:menos(2) + 'T12:00:00Z', finalizadoPor:'Mubisys (baixa automática · CANCELADO)', baixaAutoERP:{em:menos(2) + 'T12:00:00Z', status:'CANCELADO'}}),
    os('normal', {}),
  ];
  const t = celular(lista);
  // Caso ruim: a cancelada de hoje ficava em "Hoje" e a vencida em "Próximas", sem dizer nada.
  const g = JSON.parse(t.run(`JSON.stringify(Object.fromEntries(Object.entries(gruposDaLista(STORE.getAllOS(), ${JSON.stringify(HOJE)})).map(([k, v]) => [k, v.map(o => o.id)])))`));
  assert.deepEqual(g.canceladas, ['venc', 'hoje'], JSON.stringify(g));
  assert.deepEqual(g.hoje, ['normal']);assert.deepEqual(g.proximas, []);assert.deepEqual(g.vencidas, []);assert.deepEqual(g.finalizadas, ['erp']);
  t.run('renderList()');
  const listaHtml = t.node('#eq-list').innerHTML;
  assert.match(listaHtml, /Cancelada pelo PCP · não saia para estas <span class="text-muted">\(2\)<\/span>/);
  assert.match(listaHtml, /⛔ Cancelada pelo PCP/);
  // A ficha da cancelada: o aviso, e nada de Liberar carro, Saí agora ou Finalizar.
  t.run(`openModal(STORE.getOS('venc'))`);
  let ficha = t.node('#modal-os').innerHTML;
  assert.match(ficha, /O\.S\. cancelada pelo PCP: Obra do cliente foi embargada\. Não saia para ela e não finalize: fale com o PCP\./);
  assert.doesNotMatch(ficha, /id="m-finalizar"|id="m-carro"|id="m-sai-agora"/);
  assert.match(ficha, /id="m-hora-saida"[^>]*disabled/);
  // O carro já liberado não reabre a saída.
  t.run(`openModal(STORE.getOS('hoje'))`);
  ficha = t.node('#modal-os').innerHTML;
  assert.doesNotMatch(ficha, /id="m-finalizar"|id="m-sai-agora"/);
  // Tocar em Instalado numa cancelada: a frase do celular (E5 com F16), a mesma da porta.
  const v = JSON.parse(t.run('JSON.stringify(declararSaldoDoItem(_draft.itens[0]))'));
  assert.equal(v.ok, false);assert.equal(v.erro, 'O.S. cancelada pelo PCP: a entrega não entra. Fale com o PCP.');
  assert.ok(!(JSON.parse(t.run('JSON.stringify(_draft.itens[0].entregas || [])'))).length);
  // A normal segue igual: saída e finalizar.
  t.run(`openModal(STORE.getOS('normal'))`);
  ficha = t.node('#modal-os').innerHTML;
  assert.match(ficha, /id="m-finalizar"/);assert.doesNotMatch(ficha, /cancelada pelo PCP/);
});

/* ═════════════ corretude 9: cache misto ═════════════ */
test('revisão: cache misto (operacao.js de antes da F16 com o casa.js novo): Entregas não quebra', () => {
  const lista = [{id:'1', numero:'1', tipo:'externo', finalizadaEm:'2026-09-20T12:00:00Z', finalizadoPor:'Ana'},
    {id:'2', numero:'2', tipo:'externo', finalizadaEm:'2026-09-20T12:00:00Z', finalizadoPor:'Mubisys (baixa automática · ENTREGUE)', baixaAutoERP:{em:'2026-09-20T12:00:00Z', status:'ENTREGUE'}}];
  const ctx = vm.createContext({console, STORE:{getAllOS:() => lista, getCFG:() => ({}), elenco:() => ({pessoas:[], veiculos:[], ferias:[], ausencias:[]})},
    STATE:{}, document:{getElementById:() => null, querySelectorAll:() => []}, esc:s => String(s ?? '')});
  vm.runInContext(ler('operacao.js'), ctx);
  // O operacao.js da v139 não tinha o status nem o cancelamento.
  vm.runInContext('for (const k of ["cancelada", "cancelamentoDe", "statusEntrega", "motivoCancelamentoInvalido", "prazoDaEntrega"]) delete OPERACAO[k];', ctx);
  vm.runInContext(ler('casa.js'), ctx);
  // Caso ruim: "OPERACAO.cancelada is not a function" em classificarEntregas, e com ele Entregas e a prévia da Performance.
  const cls = JSON.parse(vm.runInContext('JSON.stringify(Object.fromEntries(Object.entries(classificarEntregas()).map(([k, v]) => [k, v.map(o => o.id)])))', ctx));
  assert.deepEqual(cls, {retiradas:[], instalacoes:['1'], aLancar:['2'], canceladas:[]});
  // Toda chamada do casa.js ao cancelamento passa pela guarda.
  const casa = ler('casa.js');
  const chamadas = casa.match(/OPERACAO\.cancelada\(/g) || [];
  const guardadas = casa.match(/typeof OPERACAO\.cancelada === 'function' && OPERACAO\.cancelada\(/g) || [];
  assert.ok(chamadas.length >= 2);assert.equal(guardadas.length, chamadas.length);
  assert.equal((casa.match(/OPERACAO\.cancelamentoDe\(/g) || []).length, (casa.match(/typeof OPERACAO\.cancelamentoDe === 'function' && OPERACAO\.cancelamentoDe\(/g) || []).length);
});
