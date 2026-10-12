/* REVISÃO DA ONDA OPERAÇÃO (12/10/2026): os achados da revisão de uso (U1 a
   U8) e da revisão de dados (D1 e D2) sobre f33877d. Cada caso começa pelo
   caso ruim do ramo revisado. Dados fictícios: o repositório é público. */
const {test} = require('node:test');
// Legado (D-016): as marcas antigas por item ficaram só leitura na onda acabamento; este arquivo as cria como a v171 criava (helpers/edge.cjs).
require('./helpers/edge.cjs').ligarMarcasAntigas();
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {edge} = require('./helpers/edge.cjs');
const {telaFicha} = require('./helpers/ficha-tela.cjs');
const B = require('./helpers/lote-bancada.cjs');
const C = require('../conferencia-entrega.js');
const D = require('../divisao.js');

const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const EXP = Math.floor(Date.parse('2027-12-31T00:00:00Z') / 1000);
const gestor = {papel:'pcp', nome:'Gestor Teste', sub:'gestor', exp:EXP};
const aloc = id => D.montar([{equipeId:null, liderId:id, membros:[id]}]);
const g = (e, id) => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === id).registro;
const pausa = () => new Promise(ok => setTimeout(ok, 3));
const sel = (os, n, qtde) => { const i = C.catalogo(os)[n]; return {chave:i.chave, identidade:i.identidade, qtde}; };
const MOTIVO = 'Revisão fictícia da entrega conferida pela gestão';

/* ── D1: cancelar o resto de um item já conferido em parte ──────────────── */
function osParcial(id = 'q3') {
  const o = {id, numero:'93103', rev:1, tipo:'externo', cliente:'Cliente fictício', valorTotal:1000, equipe:['100001'],
    itens:[{uid:'a', item:'1', descricao:'Painel fictício A', qtde:'2', subtotal:'500'}, {uid:'b', item:'2', descricao:'Painel fictício B', qtde:'1', subtotal:'500'}],
    instalacao:{data:'2026-10-05', periodo:'Manhã', duracaoDias:1}};
  o.conferenciasEntrega = [{id:'e1', dia:'2026-10-05', itens:[sel(o, 0, 1), sel(o, 1, 1)], alocacao:aloc('100001'), por:'Gestor Teste', porId:'444555', em:'2026-10-05T20:00:00.000Z'}];
  return o;
}
const bancoParcial = o => ({pcp_registros:[{id:o.id, colecao:'os', registro:o, apagado:false, atualizado_em:'2026-10-06T21:00:00Z'}], painel_ordens:[{numero:o.numero, valor:1000}], registros:B.FICHAS,
  pcp_config_global:[{id:true, atualizado_em:'2020-01-01', config:{performancePCP:{equipes:[], participacoes:[]}}}]});
const cancelarResto = async (e, id) => {
  const gr0 = structuredClone(g(e, id));
  return e.call({action:'upsert', os:{...gr0, itens:[{...gr0.itens[0], entregas:[{id:'mc1', tipo:'cancelado', dia:'2026-10-07', motivo:'Cliente desistiu do resto fictício'}]}, gr0.itens[1]]}}, gestor);
};

test('revisão operação: D1, o item cancelado depois de conferido em parte não tira a parte conferida da apuração (validar e motor, nas duas cópias)', async () => {
  const e = await edge('pcp-sync', bancoParcial(osParcial()));
  const periodo = async () => {
    const p = await e.call({action:'performancePeriodo', de:'2026-10-01', ate:'2026-10-31', notaPorValor:true}, gestor);
    return (p.registros || []).filter(r => String(r.id || '').startsWith('q3')).map(r => ({id:r.id, valor:r.valorCentavos ?? r.valor ?? null}));
  };
  const antes = await periodo();
  assert.deepEqual(antes, [{id:'q3::entrega:e1', valor:750}]);
  const r = await cancelarResto(e, 'q3');
  assert.equal(r.status, 200, JSON.stringify(r));
  const gr = g(e, 'q3');
  assert.ok(gr.itens[0].entregas.some(m => m.tipo === 'cancelado'), 'o cancelamento do saldo entrou');
  // Caso ruim (f33877d): "Item cancelado não pode entrar na entrega." e a entrega saía da apuração (750 → null).
  assert.equal(C.validar(gr, gr.conferenciasEntrega), '', 'a parcial continua se lendo');
  assert.deepEqual(await periodo(), antes, 'a entrega conferida continua na apuração, com o mesmo valor');
  const est = C.estado(gr, 1000);
  assert.equal(est.situacao, 'saldo_concluido', 'o saldo do item cancelado não fica a conferir');
  assert.equal(est.itens[0].conferido, 1);
  assert.equal(est.itens[0].saldo, 0);
  assert.equal(est.canceladoUnidades, 1, 'a unidade cancelada vai à parte');
  // A cópia do servidor dá o mesmo.
  const S = await import(path.join(RAIZ, 'supabase/functions/_shared/pcp-conferencia-entrega.mjs'));
  const CS = S.CONFERENCIA_ENTREGA || S.default;
  assert.equal(CS.validar(gr, gr.conferenciasEntrega), '');
  assert.deepEqual(JSON.parse(JSON.stringify(CS.estado(gr, 1000))), JSON.parse(JSON.stringify(est)));
});

test('revisão operação: D1, a entrega nova não leva o item cancelado e a revisão mantém dele no máximo o que já tinha', async () => {
  const e = await edge('pcp-sync', bancoParcial(osParcial()));
  await cancelarResto(e, 'q3');
  await pausa();
  let gr = g(e, 'q3');
  // A entrega nova com a unidade cancelada: recusada (o cancelamento vale para o saldo).
  let r = await e.call({action:'conferenciaEntrega', osId:'q3', rev:gr.rev, entrega:{id:'e2', dia:'2026-10-08', itens:[sel(gr, 0, 1)], alocacao:aloc('100001')}}, gestor);
  assert.equal(r.status, 422);
  assert.match(String(r.error), /Item cancelado não pode entrar na entrega/);
  // Editar a e1 mantendo a unidade conferida do item cancelado: aceita (antes: 422, a parcial não se consertava).
  r = await e.call({action:'conferenciaEntrega', osId:'q3', rev:gr.rev, entrega:{id:'e1', dia:'2026-10-06', itens:[sel(gr, 0, 1), sel(gr, 1, 1)], alocacao:aloc('100001')}}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(g(e, 'q3').conferenciasEntrega[0].dia, '2026-10-06');
  await pausa();
  gr = g(e, 'q3');
  // A revisão com motivo também aceita o item cancelado com a parte conferida...
  r = await e.call({action:'conferenciaEntrega', osId:'q3', rev:gr.rev, entrega:{id:'e1', dia:'2026-10-06', itens:[sel(gr, 0, 1), sel(gr, 1, 1)], alocacao:aloc('100001')}, revisao:{acao:'revisar', motivo:MOTIVO}}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));
  await pausa();
  gr = g(e, 'q3');
  // ...mas não aumenta o que ela tinha do item cancelado.
  r = await e.call({action:'conferenciaEntrega', osId:'q3', rev:gr.rev, entrega:{id:'e1', dia:'2026-10-06', itens:[sel(gr, 0, 2), sel(gr, 1, 1)], alocacao:aloc('100001')}, revisao:{acao:'revisar', motivo:MOTIVO}}, gestor);
  assert.equal(r.status, 422);
  assert.match(String(r.error), /no máximo o que já tinha sido conferido \(1\)/);
  // E pode tirar a unidade do item cancelado da entrega (reduzir).
  r = await e.call({action:'conferenciaEntrega', osId:'q3', rev:gr.rev, entrega:{id:'e1', dia:'2026-10-06', itens:[sel(gr, 1, 1)], alocacao:aloc('100001')}, revisao:{acao:'revisar', motivo:MOTIVO}}, gestor);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(C.validar(g(e, 'q3'), g(e, 'q3').conferenciasEntrega), '');
});

test('revisão operação: D1, a tela da conferência deixa a entrega editada manter (ou tirar) o item cancelado e não o seleciona no saldo', () => {
  const ui = ler('conferencia-entrega-ui.js');
  assert.match(ui, /validar\(os,\[\.\.\.outros,entrega\],hojeV,\{novas:new Map\(\[\[id,anterior\|\|null\]\]\)\}\)/);
  assert.match(ui, /validarRevisao\(os,outros,entrega,hojeV,anterior\|\|null\)/);
  assert.match(ui, /esta entrega mantém até \$\{tinhaC\} já conferida/);
  assert.match(ui, /if\(el\.disabled\|\|catalogo\[\+el\.dataset\.confItem\]\.cancelado\)return/);
});

/* ── D2: osOriginalId velho quando a gestão troca o número ──────────────── */
const osN = (id, numero, extra = {}) => ({id, numero, tipo:'externo', cliente:'Cliente Fictício', servico:'Fachada fictícia', ...extra});
const linhaN = o => ({colecao:'os', id:o.id, apagado:false, atualizado_em:'2026-10-01T10:00:00Z', registro:{rev:1, ...o}});

test('revisão operação: D2, a ficha limpa o ID da original quando o número novo aponta 0 ou 2+ O.S.', async () => {
  const t = await telaFicha([osN('orig', '97001'), osN('corr', '97050'), osN('d1', '97003'), osN('d2', '97003')]);
  t.abrir('corr');
  t.run(`_modalDraft.osOriginal = '97001'`);
  assert.equal(t.json(`ligarOsOriginal(_modalDraft)`).situacao, 'ligada');
  assert.equal(t.run(`_modalDraft.osOriginalId`), 'orig');
  // Caso ruim (f33877d): com 2+ O.S. do número novo, a ficha ficava com o ID da 97001.
  t.run(`_modalDraft.osOriginal = '97003'`);
  assert.equal(t.json(`ligarOsOriginal(_modalDraft)`).situacao, 'varias');
  assert.equal(t.run(`_modalDraft.osOriginalId`), null);
  // Com 2+, o ID que é de uma delas fica.
  t.run(`_modalDraft.osOriginalId = 'd2'`);
  t.json(`ligarOsOriginal(_modalDraft)`);
  assert.equal(t.run(`_modalDraft.osOriginalId`), 'd2');
  // Número sem O.S. no aparelho: o ID sai.
  t.run(`_modalDraft.osOriginal = '97999'`);
  assert.equal(t.json(`ligarOsOriginal(_modalDraft)`).situacao, 'nenhuma');
  assert.equal(t.run(`_modalDraft.osOriginalId`), null);
});

test('revisão operação: D2, a porta confere o par número e ID sempre que o número muda (aviso, nunca 422)', async () => {
  const e = await edge('pcp-sync', {pcp_registros:[linhaN(osN('orig', '97001')), linhaN(osN('d1', '97003')), linhaN(osN('corr', '97050'))], registros:B.FICHAS});
  let r = await e.call({action:'upsert', os:{...g(e, 'corr'), osOriginal:'97001', osOriginalId:'orig'}}, gestor);
  assert.equal(g(e, 'corr').osOriginalId, 'orig');
  await pausa();
  // Caso ruim (f33877d): número 97003 com o ID da 97001 entrava calado (o aparelho velho devolve o mesmo ID).
  r = await e.call({action:'upsert', os:{...g(e, 'corr'), osOriginal:'97003', osOriginalId:'orig'}}, gestor);
  assert.equal(r.status, 200);
  assert.equal(g(e, 'corr').osOriginal, '97003');
  assert.equal(g(e, 'corr').osOriginalId, null, 'o ID que não é do número novo sai');
  assert.match(String(r.avisos), /o número mudou para 97003/);
  await pausa();
  // O aparelho que nem manda o ID (campo ausente): o gravado também é conferido quando o número muda.
  r = await e.call({action:'upsert', os:{...g(e, 'corr'), osOriginal:'97001', osOriginalId:'orig'}}, gestor);
  assert.equal(g(e, 'corr').osOriginalId, 'orig');
  await pausa();
  const {osOriginalId: _fora, ...semId} = g(e, 'corr');
  r = await e.call({action:'upsert', os:{...semId, osOriginal:'97003'}}, gestor);
  assert.equal(r.status, 200);
  assert.equal(g(e, 'corr').osOriginalId, null);
  await pausa();
  // O par certo continua entrando: número e ID da mesma O.S.
  r = await e.call({action:'upsert', os:{...g(e, 'corr'), osOriginal:'97003', osOriginalId:'d1'}}, gestor);
  assert.equal(r.status, 200);
  assert.equal(g(e, 'corr').osOriginalId, 'd1');
  assert.equal(r.avisos, undefined);
  await pausa();
  // Mudar outro campo sem mexer no número não confere nem tira nada.
  r = await e.call({action:'upsert', os:{...g(e, 'corr'), obs:'nota fictícia'}}, gestor);
  assert.equal(g(e, 'corr').osOriginalId, 'd1');
});

/* ── U1: o Fechar o dia com a O.S. que tem conferência por entrega ─────── */
function painelLote(b) {
  const nos = new Map();
  const no = sel => ({sel, outer:[], inner:[], classList:{add() {}, remove() {}}, focus() {},
    set outerHTML(v) { this.outer.push(String(v)); }, get outerHTML() { return this.outer[this.outer.length - 1] || ''; },
    set innerHTML(v) { this.inner.push(String(v)); }, get innerHTML() { return this.inner[this.inner.length - 1] || ''; }});
  const p = {telas:[], onclick:null, onchange:null,
    set innerHTML(v) { this.telas.push(String(v)); nos.clear(); }, get innerHTML() { return this.telas[this.telas.length - 1] || ''; },
    querySelector(sel) { if (!nos.has(sel)) nos.set(sel, no(sel)); return nos.get(sel); }, querySelectorAll:() => [], contains:() => false};
  b.ctx.document.getElementById = id => id === 'panel-entregas' ? p : null;
  return p;
}
const linhaDoLote = (html, id) => { const i = html.indexOf(`data-lote-linha="${id}"`); assert.ok(i >= 0, 'a linha ' + id + ' está na tela'); const j = html.indexOf('data-lote-linha="', i + 10); return html.slice(i, j < 0 ? undefined : j); };
const comConf = (o, qtde = 4) => { o.conferenciasEntrega = [{id:'e1', dia:'2026-09-28', itens:[sel(o, 0, qtde)], alocacao:aloc('100001'), por:'Gestor Teste', porId:'111222', em:'2026-09-28T20:00:00.000Z'}]; return o; };

test('revisão operação: U1, no Fechar o dia a linha da O.S. com conferência mostra a conferência e o botão dela, sem campo Entrega nem marcas antigas', async () => {
  const k1 = comConf(B.aberta('k1')), k2 = comConf(B.erp('k2')), livre = B.aberta('k3');
  const b = await B.montar({os:[k1, k2, livre]});
  b.run(ler('conferencia-entrega.js'));
  const abertas = [];
  b.ctx.conferirItensEntrega = id => { abertas.push(id); return Promise.resolve(); };
  const painel = painelLote(b);
  await b.run(`LOTE.abrir({modo:'dia', dia:'${B.HOJE}'})`);
  b.run('LOTE.render()');
  let html = linhaDoLote(painel.innerHTML, 'k1');
  // Caso ruim (f33877d): a aberta com conferência oferecia "Todos os itens entregues" e "Marcar a parte", com o campo Entrega.
  assert.doesNotMatch(html, /Todos os itens entregues|Marcar a parte|data-lote-campo="data"/);
  assert.match(html, /Conferência por entrega \(1 entrega, a última em 28\/09\/2026\): 4 de 12 unidades conferidas · saldo de 8 a conferir\./);
  assert.match(html, /data-lote-acao="conferencia" data-os="k1"[^>]*>Conferir itens e equipe</);
  // A O.S. sem conferência continua como era.
  assert.match(linhaDoLote(painel.innerHTML, 'k3'), /Todos os itens entregues[\s\S]*Marcar a parte/);
  // A falta não pede a entrega dos itens; a nota diz o saldo e onde conferir.
  const f = await b.json(`(() => { const o = STORE.getOS('k1'); const g = LOTE.gruposDaTela().find(x => x.os.some(y => y.id === 'k1')); return LOTE.faltasDaLinha(o, LOTE.linha('k1'), g, LOTE.grupo(g.chave)); })()`);
  assert.ok(!f.trava.some(t => /entrega dos itens|data da entrega/.test(t)), JSON.stringify(f));
  assert.ok(f.nota.includes('saldo a conferir (Conferir itens e equipe)'), JSON.stringify(f));
  // O botão abre a conferência daquela O.S.
  b.ctx.__t = {dataset:{loteAcao:'conferencia', os:'k1'}, disabled:false, closest:sel => sel === '[data-lote-acao]' ? b.ctx.__t : null};
  b.run('document.getElementById("panel-entregas").onclick({target:__t})');
  await pausa();
  assert.deepEqual(abertas, ['k1']);
  // A baixa do ERP com conferência: não é "a lançar", nem "1 sem prova (baixa do ERP)", nem toda entregue.
  await b.run(`LOTE.abrir({modo:'dia', dia:'2026-09-28'})`);
  b.run('LOTE.render()');
  html = linhaDoLote(painel.innerHTML, 'k2');
  assert.doesNotMatch(html, /a lançar|sem prova \(baixa do ERP\)|pela finalização|Todos os itens entregues|data-lote-campo="data"|Ver os itens/);
  assert.match(html, /Baixa do ERP · sem prova · entrega pela conferência/);
  assert.match(html, /4 de 12 unidades conferidas · saldo de 8 a conferir/);
  // Salvar a linha grava o resto (retrabalho) sem lançamento e sem aviso de data descartada.
  assert.equal(await b.acao({acao:'retrabalho-nao', os:'k2'}), '');
  assert.equal(await b.acao({acao:'confirmar', os:'k2'}), '');
  const rel = await b.json('LOTE.salvar({prazoMs:3000, passoMs:5})');
  const item = rel.itens.find(i => i.id === 'k2');
  assert.equal(item.estado, 'gravada', JSON.stringify(item));
  assert.ok(!(item.avisos || []).some(a => /lançamento/.test(a)), JSON.stringify(item));
  await b.sincronizar();
  const srv = g(b.e, 'k2');
  assert.equal(srv.entregaLancada, undefined);
  assert.equal(srv.retrabalhoPerguntado.resposta, 'nao');
  b.fechar();
});

/* ── U2, U7 e U8: Entregas, "Prazos para conferir" e "ERP diz entregue" ─── */
const vm = require('node:vm');
function telaCasa(lista, papel = 'pcp') {
  const STORE = {getAllOS:() => lista, getOS:id => lista.find(o => o.id === id) || null, getCFG:() => ({instaladores:[]}), saveOS() {},
    entreguesMes:() => null, elenco:() => ({pessoas:[], veiculos:[], ferias:[], ausencias:[]}), valores:() => ({})};
  const HOJE = '2026-10-12', abertas = [];
  const c = {STORE, STATE:{user:{papel, nome:'Gestor Teste'}}, console, abertas,
    Date:class extends Date { constructor(...a) { super(...(a.length ? a : [HOJE + 'T12:00:00'])); } static now() { return +new Date(HOJE + 'T12:00:00'); } },
    esc:s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[ch])),
    toast() {}, nowISO:() => HOJE + 'T15:00:00.000Z', emptyState:() => '', bindCardClicks() {}, setTimeout:() => 0,
    openModal:(os, alvo) => abertas.push([os.id, alvo]),
    localStorage:{getItem:() => null, setItem() {}, removeItem() {}},
    document:{getElementById:() => null, querySelectorAll:() => [], body:{classList:{add() {}, remove() {}, contains:() => false}}}};
  vm.createContext(c);
  for (const f of ['operacao.js', 'entrega-item.js', 'conferencia-entrega.js', 'casa.js']) vm.runInContext(ler(f), c, {filename:f});
  return {run:code => vm.runInContext(code, c), abertas};
}
const prazoDuvida = () => ({id:'pz', numero:'9pz', tipo:'externo', cliente:'Cliente Fictício pz', liberadoPCP:true, equipe:['100001'],
  instalacao:{data:'2026-10-02', periodo:'Manhã', duracaoDias:1}, previsaoEntrega:'2026-10-02',
  prazoCombinado:{data:'2026-10-18', fonte:'agenda', em:'2026-09-20T10:00:00.000Z'}, agendaLog:[{de:'', data:'2026-10-02', em:'2026-09-20T10:00:08.000Z'}]});

test('revisão operação: U2, "Abrir a ficha" dos Prazos para conferir cai no Agendamento, e o "Prazo correto" vem com a data da agenda', async () => {
  const t = telaCasa([prazoDuvida()]);
  const html = t.run('prazosParaConferirHTML(STORE.getAllOS())');
  // Caso ruim (f33877d): o botão era o genérico data-os-id, que abre a ficha na etapa da situação (sem o aviso do prazo).
  assert.doesNotMatch(html, /data-os-id=/);
  assert.match(html, /data-prazo-ficha="pz">Abrir a ficha no prazo</);
  t.run(`abrirFichaNoPrazo('pz')`);
  assert.deepEqual(JSON.parse(JSON.stringify(t.abertas)), [['pz', 'agenda']]);
  // O bloco 'agenda' é o da etapa Equipe, onde está o prazo (prazoRetornoHTML).
  const f = await telaFicha([prazoDuvida()]);
  assert.equal(f.run(`etapaDoAlvoFicha('agenda')`), 'equipe');
  assert.match(ler('app.js'), /function blocoAgenda[\s\S]{0,4000}id="prazo-retorno">\$\{prazoRetornoHTML\(os, ro\)\}/);
  f.abrir('pz');
  const ficha = f.run('prazoRetornoHTML(_modalDraft, false)');
  assert.match(ficha, /data-prazo-conferir="minuto"/);
  // Caso ruim (f33877d): o "Prazo correto" vinha com 18/10, a data congelada que está em dúvida.
  assert.match(ficha, /id="prazo-corr-data" value="2026-10-02"/);
});

test('revisão operação: U7, a contagem da parcial não se contradiz (inteiros e com parte, de quantos)', () => {
  const t = telaCasa([]);
  // Caso ruim (f33877d): "2 de 2 itens conferidos; faltam 5 unidades".
  assert.equal(t.run(`contagemItensParcial({itensTotal:2, entregues:0, parciais:2, saldoItens:5}, true)`), '0 de 2 itens conferidos por inteiro, 2 com parte conferida; faltam 5 unidades a conferir');
  assert.equal(t.run(`contagemItensParcial({itensTotal:1, entregues:0, parciais:1, saldoItens:1}, true)`), '0 de 1 item conferido por inteiro, 1 com parte conferida; falta 1 unidade a conferir');
  assert.equal(t.run(`contagemItensParcial({itensTotal:5, entregues:2, parciais:0, saldoItens:3}, false)`), '2 de 5 itens entregues por inteiro; faltam 3 unidades');
});

test('revisão operação: U8, "Prazos para conferir" é recolhível, fechado por padrão, com a contagem no título', () => {
  const t = telaCasa([prazoDuvida(), {...prazoDuvida(), id:'pz2', numero:'9pz2'}]);
  const html = t.run('prazosParaConferirHTML(STORE.getAllOS())');
  // Caso ruim (f33877d): uma <section> sempre aberta no meio de Entregas.
  assert.match(html, /^<details class="erp-saldo prazo-conferir-lista" data-prazos-conferir="2">/);
  assert.match(html, /<summary class="erp-saldo-cab">[\s\S]*Prazos para conferir <span class="erp-saldo-n">2<\/span>[\s\S]*<\/summary>/);
  t.run('STATE._entPrazosAberto = true');
  assert.match(t.run('prazosParaConferirHTML(STORE.getAllOS())'), /data-prazos-conferir="2" open>/, 'aberto pela pessoa, fica aberto ao repintar');
  assert.match(ler('styles.css'), /\.prazo-conferir-lista>summary\{cursor:pointer;list-style:none;min-height:44px\}/);
});

/* ── U3: um nome só para abrir a conferência, e o tom do aviso do Lançar ── */
test('revisão operação: U3, as telas chamam a conferência pelo nome do botão que existe, e o Lançar avisa sem tom de erro', async () => {
  const fontes = ['casa.js', 'lote.js', 'conferencia-entrega-ui.js', 'performance.js', 'performance-dashboards.js', 'entregas-os.js', 'controle-entrega-ui.js', 'supabase/functions/_shared/pcp-integridade.mjs'].map(f => [f, ler(f)]);
  // Caso ruim (f33877d): "Conferir entrega" nos textos, e não há botão com esse nome onde a pessoa vai.
  for (const [f, s] of fontes) assert.doesNotMatch(s, /["'>]Conferir entrega["'<]/, f);
  assert.doesNotMatch(ler('conferencia-entrega-ui.js'), /um caminho só, D-016/);
  // Os botões que abrem a conferência têm o mesmo nome.
  const botoes = [['casa.js', /data-ent-itens="\$\{esc\(card\.id\)\}">Conferir itens e equipe</], ['casa.js', /data-conferir-saldo="\$\{esc\(os\.id\)\}">Conferir itens e equipe</],
    ['entregas-os.js', /data-poros-itens="\$\{esc\(c\.id\)\}">Conferir itens e equipe</], ['controle-entrega-ui.js', /data-controle="itens"[^>]*>Conferir itens e equipe</],
    ['lote.js', /data-lote-acao="conferencia"[^>]*>Conferir itens e equipe</], ['performance.js', /'Ver origem':'Conferir itens e equipe'/]];
  for (const [f, re] of botoes) assert.match(ler(f), re, f);
  // O aviso do servidor diz o nome e o lugar.
  const S = await import(path.join(RAIZ, 'supabase/functions/_shared/pcp-integridade.mjs'));
  assert.match(S.AVISO_LANCAR_COM_CONFERENCIA, /"Conferir itens e equipe" \(na ficha da O\.S\., em Conferência e acompanhamento\)/);
  // O Lançar: informação (sem o vermelho do erro); a gestão já cai na conferência.
  const os = osParcial('l1');
  const t = telaCasa([os]);
  t.run('globalThis.__t = []; globalThis.__a = []; toast = (m, tp) => globalThis.__t.push([m, tp]); conferirItensEntrega = id => { globalThis.__a.push(id); return Promise.resolve(); }');
  t.run(`lancarEntregaManual('l1')`);
  const [msg, tipo] = t.run('globalThis.__t[0]');
  assert.equal(tipo, '', 'tom de informação, não "error"');
  assert.match(msg, /Abrimos "Conferir itens e equipe"/);
  assert.deepEqual(JSON.parse(JSON.stringify(t.run('globalThis.__a'))), ['l1']);
  // Quem não é da gestão: o aviso diz onde fica.
  const o2 = telaCasa([osParcial('l2')], 'operacao');
  o2.run('globalThis.__t = []; toast = (m, tp) => globalThis.__t.push([m, tp])');
  o2.run(`lancarEntregaManual('l2')`);
  assert.match(o2.run('globalThis.__t[0][0]'), /"Conferir itens e equipe" \(na ficha da O\.S\., em Conferência e acompanhamento\)/);
  assert.equal(o2.run('globalThis.__t[0][1]'), '');
});

/* ── U4: as duas réguas do relatório de pontualidade, separadas ─────────── */
test('revisão operação: U4, o relatório separa a Régua do ERP (cartões, barra e base) da Régua do PCP (rótulo e base)', () => {
  const ctx = vm.createContext({console, Date, Set, Number, Object, Map, Intl, MES_CURTO:['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'], esc:s => String(s).replaceAll('<', '&lt;').replaceAll('>', '&gt;')});
  vm.runInContext(ler('relatorios-entregas.js'), ctx);
  ctx.fixture = [{mes:'2026-10', entregasCarregadas:true, entregas:[
    {numero:'1', cliente:'A', data:'2026-10-08', previsao:'2026-10-09', valor:1, pcp:{situacao:'atraso', dias:3, prazo:'2026-10-05', entrega:'2026-10-08'}},
    {numero:'2', cliente:'B', data:'2026-10-10', previsao:'2026-10-09', valor:1, pcp:{situacao:'no_prazo', dias:0, prazo:'2026-10-11', entrega:'2026-10-10'}},
    {numero:'3', cliente:'C', data:'2026-10-08', previsao:'2026-10-09', valor:1, pcp:null}]}];
  vm.runInContext("REL_ENT.dados={ate:'2026-10-31',meses:fixture};REL_ENT.ano=2026;REL_ENT.foco='10'", ctx);
  const h = vm.runInContext('relEntPontualidadeHTML()', ctx);
  const iErp = h.indexOf('data-rel-regua-erp'), iPcp = h.indexOf('data-rel-regua-pcp'), iBarra = h.indexOf('rel-ent-prazo-barra');
  // Caso ruim (f33877d): a barra 60/40 do ERP ficava logo abaixo dos cartões do PCP, sem rótulo, e os cartões do ERP sem o nome da régua.
  assert.ok(iErp >= 0 && iPcp > iErp, 'a régua do ERP vem antes, num bloco próprio');
  assert.ok(iBarra > iErp && iBarra < iPcp, 'a barra é do bloco do ERP');
  const erp = h.slice(iErp, iPcp), pcp = h.slice(iPcp);
  assert.match(erp, /<h4 class="rel-ent-regua-tit" id="rel-ent-regua-erp-tit">Régua do ERP/);
  assert.match(erp, /Base: 3 O\.S\. comparáveis de 3 entregues/);
  assert.match(erp, /Indicadores do período pela régua do ERP/);
  assert.match(erp, /aria-label="Régua do ERP: /);
  assert.match(pcp, /<h4 class="rel-ent-regua-tit" id="rel-ent-regua-pcp-tit">Régua do PCP/);
  assert.match(pcp, /Base: 2 O\.S\. medidas de 3 entregues; 1 não medida fica à parte, nunca como zero\./);
  assert.doesNotMatch(pcp, /rel-ent-prazo-barra/);
  const css = ler('styles.css');
  assert.match(css, /\.rel-ent-regua-pcp\{[^}]+\}/);
  assert.match(css, /\.rel-ent-regua-tit\{[^}]+\}/);
});

/* ── U5: o item citado em conferência, só leitura na ficha ──────────────── */
test('revisão operação: U5, o item conferido fica só leitura na ficha (sem "× remover"), com a explicação e o caminho; o aviso do servidor sem nome de campo interno', async () => {
  const o = {id:'u5', numero:'95005', tipo:'externo', cliente:'Cliente Fictício', servico:'Fachada fictícia', valorTotal:1000,
    itens:[{uid:'a', item:'1', descricao:'Painel fictício A', qtde:'2', subtotal:'500', manual:true}, {uid:'b', item:'2', descricao:'Painel fictício B', qtde:'1', subtotal:'500', manual:true}]};
  o.conferenciasEntrega = [{id:'e1', dia:'2026-10-05', itens:[sel(o, 0, 1)], alocacao:aloc('100001'), por:'Gestor Teste', porId:'444555', em:'2026-10-05T20:00:00.000Z'}];
  const t = await telaFicha([o]);
  t.run('globalThis.conferirItensEntrega = () => Promise.resolve()');
  const html = t.run(`blocoItens(STORE.getOS('u5'), false, false)`);
  const linhaA = html.slice(html.indexOf('data-item-row="0"'), html.indexOf('data-item-row="1"'));
  const linhaB = html.slice(html.indexOf('data-item-row="1"'));
  // Caso ruim (f33877d): o item conferido (manual) tinha os campos abertos e o "× remover"; o servidor desfazia calado na tela.
  assert.doesNotMatch(linhaA, /× remover/);
  assert.match(linhaA, /data-item="0\.descricao"[^>]*readonly/);
  assert.match(linhaA, /data-item="0\.qtde"[^>]*readonly/);
  assert.match(linhaA, /🔒 conferido/);
  assert.match(linhaA, /Este item está numa entrega conferida[\s\S]*revisa ou anula antes a entrega conferida, com motivo: <button type="button" class="btn-ghost btn-xs" data-controle="itens" data-controle-os="u5">Conferir itens e equipe<\/button>/);
  // O item que não está em conferência continua como era.
  assert.match(linhaB, /× remover/);
  assert.doesNotMatch(linhaB, /data-item="1\.descricao"[^>]*readonly/);
  // O aviso do servidor: o nome do campo na tela e onde revisar.
  const e = await edge('pcp-sync', {pcp_registros:[{id:'u5', colecao:'os', registro:{rev:1, ...o}, apagado:false, atualizado_em:'2026-10-06T21:00:00Z'}], registros:B.FICHAS});
  const gr = structuredClone(g(e, 'u5'));
  const r = await e.call({action:'upsert', os:{...gr, itens:[{...gr.itens[0], qtde:'3'}, gr.itens[1]]}}, gestor);
  assert.equal(r.status, 200);
  assert.doesNotMatch(String(r.avisos), /qtde|descricao/);
  assert.match(String(r.avisos), /está numa entrega conferida e a quantidade não mudou: para corrigir o item, revise ou anule antes a entrega conferida, com motivo, em "Conferir itens e equipe" \(na ficha da O\.S\., em Conferência e acompanhamento\)\./);
});

/* ── U6: revisar ou anular a parcial que não se lê mais ─────────────────── */
function dialogoConferencia(os, entregaId) {
  const el = () => { const x = {textContent:'', value:'', hidden:false, disabled:false, dataset:{}, classList:{add() {}, remove() {}, toggle() {}}, focus() {}, scrollIntoView() {}, addEventListener() {}, removeEventListener() {}, open:true}; x.querySelector = () => el(); x.querySelectorAll = () => []; return x; };
  const capt = {html:''};
  const c = vm.createContext({console, Date, Map, Set, JSON, Promise, crypto:globalThis.crypto, capt,
    STATE:{user:{papel:'pcp', nome:'Gestor Teste'}}, esc:s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    STORE:{getQueue:() => [], api:async () => ({os, valor:1000, fechados:[], inteira:null})},
    perfPodeEditar:() => true, perfConfig:() => ({equipes:[]}), perfRegrasFonte:() => ({versoes:[]}), diaEntrega:() => '', dinheiroCasa:v => 'R$ ' + v, toast() {},
    ALOCUI:{iniciar() {}, montar() {}, estado:() => ({}), bloqueio:() => '', repintar() {}, definirDataEntrega() {}, paraGravar:() => ({}), esquecer() {}},
    perfDialog:(_t, html) => { capt.html = html; const d = el(); d.open = true; const filhos = new Map(); d.querySelector = sel => { if (!filhos.has(sel)) filhos.set(sel, el()); return filhos.get(sel); }; return d; }});
  for (const f of ['entrega-item.js', 'divisao.js', 'conferencia-entrega.js', 'conferencia-entrega-ui.js']) vm.runInContext(ler(f), c, {filename:f});
  return vm.runInContext(`conferirItensEntrega(${JSON.stringify(os.id)}, ${JSON.stringify(entregaId)})`, c).then(() => ({html:capt.html, c}));
}

test('revisão operação: U6, na entrega que não se lê mais o aviso vem no topo e o botão diz "Salvar a revisão"; a gestão vê quem revisou ou anulou', async () => {
  const o = osParcial('u6');
  o.conferenciasRevisoes = [
    {id:'rev-1', entregaId:'e0', acao:'anular', motivo:'Entrega fictícia registrada em dobro', por:'Gestor Teste', porId:'444555', porConta:'gestor', em:'2026-10-07T13:00:00.000Z', antes:{dia:'2026-10-04', itens:[]}},
    {id:'rev-2', entregaId:'e1', acao:'revisar', motivo:'Item fictício trocado pelo ERP depois', por:'Outra Gestora', porId:'444666', porConta:'outra', em:'2026-10-08T14:30:00.000Z', antes:{dia:'2026-10-05', itens:[]}, depois:{dia:'2026-10-06', itens:[]}}];
  const inconsistente = structuredClone(o); inconsistente.itens[0].descricao = 'Painel fictício A, nova descrição do ERP';
  const {html} = await dialogoConferencia(inconsistente, 'e1');
  // Caso ruim (f33877d): o aviso ficava no fim, dentro de "Revisar ou anular", e o botão dizia "Salvar alterações da entrega".
  const iAviso = html.indexOf('conf-inconsistente'), iCampos = html.indexOf('class="conf-campos');
  assert.ok(iAviso > 0 && iAviso < iCampos, 'o aviso vem antes dos campos');
  assert.match(html, /id="conf-salvar">Salvar a revisão desta entrega</);
  assert.doesNotMatch(html, /Salvar alterações da entrega/);
  // O diário: o mais novo primeiro, com quem, quando e o motivo.
  const iRev = html.indexOf('Revisões e anulações desta O.S. (2)');
  assert.ok(iRev > 0);
  const lista = html.slice(iRev);
  assert.ok(lista.indexOf('Revisou') < lista.indexOf('Anulou'));
  assert.match(lista, /<strong>Revisou<\/strong> a entrega de 05\/10\/2026 \(agora em 06\/10\/2026\) · Outra Gestora · 08\/10\/2026, 11:30/);
  assert.match(lista, /Motivo: Item fictício trocado pelo ERP depois/);
  assert.match(lista, /<strong>Anulou<\/strong> a entrega de 04\/10\/2026 · Gestor Teste/);
  // A entrega que se lê continua com o botão de sempre e sem o aviso.
  const normal = await dialogoConferencia(osParcial('u6b'), 'e1');
  assert.match(normal.html, /id="conf-salvar">Salvar alterações da entrega</);
  assert.doesNotMatch(normal.html, /conf-inconsistente/);
  // Na ficha (Conferência e acompanhamento), a gestão vê o mesmo diário.
  assert.match(ler('controle-entrega-ui.js'), /gestao&&typeof confRevisoesHTML==='function'\?confRevisoesHTML\(os\):''/);
});
