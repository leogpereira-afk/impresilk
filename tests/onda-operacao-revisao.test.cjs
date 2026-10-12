/* REVISÃO DA ONDA OPERAÇÃO (12/10/2026): os achados da revisão de uso (U1 a
   U8) e da revisão de dados (D1 e D2) sobre f33877d. Cada caso começa pelo
   caso ruim do ramo revisado. Dados fictícios: o repositório é público. */
const {test} = require('node:test');
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
