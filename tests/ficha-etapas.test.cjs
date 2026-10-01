/* A FICHA DA O.S. EM ETAPAS (F23, 30/09/2026).
 *
 * O renderModal reparte os blocos de sempre em Dados > Equipe > Divisão >
 * Jornada > Fechamento. Todas as etapas ficam no DOM e só a ativa aparece; a
 * etapa atual é lembrada por O.S. (a sincronização não volta à primeira); a
 * pendência fica presa ao campo (aria-describedby) sem impedir gravar; o
 * checklist do Fechamento, incompleto, diz o que falta e o efeito verdadeiro
 * de cada item, SEM travar a finalização (decisão de 23/09; revisão da F23).
 * O celular do instalador não muda.
 *
 * O app.js roda inteiro num DOM falso que transforma o HTML da ficha em
 * blocos e botões a cada pintura, como o navegador. Dados fictícios.
 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(root, f), 'utf8');
const HOJE = '2026-10-05';
const js = v => JSON.parse(JSON.stringify(v));
class DataFixa extends Date { constructor(...a) { super(...(a.length ? a : [HOJE + 'T12:00:00'])); } static now() { return new Date(HOJE + 'T12:00:00').getTime(); } }

function classes() {
  const s = new Set();
  return {add: (...c) => c.forEach(x => s.add(x)), remove: (...c) => c.forEach(x => s.delete(x)), contains: c => s.has(c),
    toggle: (c, on) => { const v = on === undefined ? !s.has(c) : !!on; if (v) s.add(c); else s.delete(c); return v; }};
}
/* O DOM FALSO: cada pintura do #modal-os vira blocos (data-bloco) e
   elementos com os atributos que a ficha liga (data-ir-etapa, data-fmsg,
   data-fech-finalizar, id). O mesmo objeto vale até a próxima pintura, então
   o onclick ligado pelo app é o que o teste toca. */
function domFalso() {
  let html = '', blocos = [], secs = [], cache = new Map(), porId = new Map();
  const doc = {activeElement: null, body: {contains: () => false, classList: classes(), appendChild() {}}, visibilityState: 'visible', addEventListener() {}};
  const novoEl = (p = {}) => ({id: '', textContent: '', innerHTML: '', hidden: false, disabled: false, tagName: 'DIV', dataset: {}, classList: classes(),
    focus() { doc.activeElement = this; }, querySelector: () => null, querySelectorAll: () => [], getAttribute: () => null, setAttribute() {}, removeAttribute() {}, closest: () => null, ...p});
  const camel = k => k.replace(/-(\w)/g, (_, c) => c.toUpperCase());
  const deTag = (m, tag, texto) => {
    const id = (/\sid="([^"]+)"/.exec(tag) || [])[1] || '';
    if (id && porId.has(id)) return porId.get(id);
    const ds = {};
    for (const [, k, v] of tag.matchAll(/\sdata-([\w-]+)(?:="([^"]*)")?/g)) ds[camel(k)] = v === undefined ? '' : v;
    const el = novoEl({id, tagName: m.toUpperCase(), dataset: ds, textContent: texto || ''});
    if (id) porId.set(id, el);
    return el;
  };
  const ATTR = '(?:[^>"]|"[^"]*")*';
  const comAtributo = attr => {
    if (!cache.has(attr)) cache.set(attr, [...html.matchAll(new RegExp(`<(\\w+)(${ATTR}\\s${attr}(?:="[^"]*")?${ATTR})>([^<]*)`, 'g'))].map(m => deTag(m[1], m[2], m[3])));
    return cache.get(attr);
  };
  const porIdDoHTML = id => {
    if (porId.has(id)) return porId.get(id);
    const m = new RegExp(`<(\\w+)(${ATTR}\\sid="${id}"${ATTR})>([^<]*)`).exec(html);
    return m ? deTag(m[1], m[2], m[3]) : null;
  };
  const modal = {classList: classes(),
    get innerHTML() { return html; },
    set innerHTML(v) { html = v; cache = new Map(); porId = new Map(); blocos = [...v.matchAll(/<details class="card-fs[^"]*"[^>]*data-bloco="([^"]+)"/g)].map(m => ({dataset: {bloco: m[1]}, open: false}));
      // As seções das etapas: trocar de etapa só mexe no hidden delas (revisão da F23), como o navegador.
      secs = [...v.matchAll(/<section class="ficha-etapa" data-etapa-sec="(\w+)"([^>]*)>/g)].map(m => ({dataset: {etapaSec: m[1]}, hidden: /\shidden(\s|$)/.test(m[2])})); },
    querySelector: () => null,
    querySelectorAll: s => (s === '[data-ir-etapa]' ? comAtributo('data-ir-etapa') : s === '[data-fech-finalizar]' ? comAtributo('data-fech-finalizar') : [])};
  const overlay = {classList: classes()};
  doc.querySelector = s => (s === '#modal-os' ? modal : s === '#modal-overlay' ? overlay : null);
  doc.querySelectorAll = s => (s === '#modal-os .card-fs' ? blocos : s === '#modal-os .ficha-etapa' ? secs : s === '#modal-os [data-fmsg]' ? comAtributo('data-fmsg') : []);
  doc.getElementById = id => porIdDoHTML(id);
  return {doc, modal, overlay, html: () => html, blocos: () => blocos, secs: () => secs};
}

function tela({papel = 'admin', lista = []} = {}) {
  const d = domFalso();
  const salvos = [], toasts = [];
  const cfg = {instaladores: ['Ana'], responsaveis: ['Gestor Fictício'], vinculosRH: [], performancePCP: {equipes: [], participacoes: []}};
  const STORE = {getAllOS: () => lista, getCFG: () => cfg, getOS: id => lista.find(o => o.id === id) || null, elenco: () => ({pessoas: [], antigos: []}),
    saveOS(o) { salvos.push(js(o)); const i = lista.findIndex(x => x.id === o.id); if (i >= 0) lista[i] = o; else lista.push(o); },
    getQueue: () => [], on() {}, uuid: () => 'u1', valores: () => ({}), carimbarMomento() {}, pullPhoto: async () => null};
  const ctx = vm.createContext({console, Date: DataFixa, document: d.doc, window: {addEventListener() {}}, navigator: {onLine: true},
    localStorage: {getItem: () => null, setItem() {}, removeItem() {}}, STORE, setTimeout() {}, clearTimeout() {}, setInterval() {}, __toasts: toasts});
  for (const f of ['operacao.js', 'divisao.js', 'regras.js', 'alocacao-ui.js']) vm.runInContext(ler(f), ctx, {filename: f});
  vm.runInContext(ler('app.js'), ctx, {filename: 'app.js'});
  vm.runInContext(`STATE.user = {nome: 'Gestor Fictício', papel: '${papel}'};
    bindModalEvents = () => {}; ligarEquipeDaFicha = () => {}; ligarHistoricoAlteracoes = () => {};
    renderActiveTab = () => {}; toast = (m, t) => __toasts.push([m, t || '']);`, ctx);
  const run = code => vm.runInContext(code, ctx);
  /* As etapas pintadas: a chave, se aparece e o HTML dela (até o rodapé
     comum da ficha, que não é de etapa nenhuma). */
  const secoes = () => d.html().split('<section class="ficha-etapa" ').slice(1).map(p => {
    const k = /^data-etapa-sec="(\w+)"/.exec(p)[1];
    const cab = p.slice(0, p.indexOf('>'));
    const fim = p.indexOf('id="modal-pdf"');
    return {k, visivel: !/\shidden(\s|$)/.test(' ' + cab), html: fim >= 0 ? p.slice(0, fim) : p};
  });
  const visivel = () => d.secs().filter(s => !s.hidden).map(s => s.dataset.etapaSec);
  const passos = () => [...d.html().matchAll(/<button type="button" class="fe-passo[^"]*" data-ir-etapa="(\w+)"/g)].map(m => m[1]);
  const abrirOS = (id, alvo) => run(`openModal(STORE.getOS(${JSON.stringify(id)})${alvo ? ', ' + JSON.stringify(alvo) : ''})`);
  return {run, d, salvos, toasts, lista, secoes, visivel, passos, abrirOS,
    el: id => d.doc.getElementById(id), html: () => d.html(), blocos: () => d.blocos()};
}

const osBase = (extra = {}) => ({id: 'f1', numero: '7101', tipo: 'externo', cliente: 'Cliente Fictício', responsavelPCP: 'Gestor Fictício', liberadoPCP: true,
  instalacao: {data: HOJE, periodo: 'Manhã', duracaoDias: 1}, equipe: ['Ana'], veiculo: 'Carro 1', itens: [{uid: 'f1:1:1', item: '1', descricao: 'Placa fictícia', qtde: '1', pronto: true}], ...extra});
// Pronta para finalizar pela régua de sempre (validarFinalizacao vazia), sem conferência da volta nem resposta do retrabalho.
const osPronta = (extra = {}) => osBase({confirmacao: 'Confirmado', confEm: HOJE + 'T07:00:00', embarqueConferidoPor: 'Gestor Fictício', produtosConferidosPor: 'Gestor Fictício',
  ferramentasConferidas: true, ferramentasConferidasPor: 'Gestor Fictício', carroLiberado: true, horaSaida: '08:00', saidaEm: HOJE + 'T08:00:00',
  instalacaoOK: true, conferidoPor: 'Gestor Fictício', fotosCheckinIds: ['foto-saida-1'], fotosRetornoIds: ['foto-volta-1'], horaRetorno: '15:00', retornoEm: HOJE + 'T15:00:00', ...extra});
const dataF = h => [...h.matchAll(/\sdata-f="([^"]+)"/g)].map(m => m[1]);
const blocosDe = h => [...h.matchAll(/<details class="card-fs[^"]*"[^>]*data-bloco="([^"]+)"/g)].map(m => m[1]);

/* ───────────── 1. Cada etapa tem os seus campos, e só a ativa aparece ───────────── */

test('F23: cada etapa contém os data-f e os blocos esperados; todas no DOM, só a ativa aparece', () => {
  const t = tela({papel: 'admin', lista: [osBase()]});
  t.abrirOS('f1', 'pcp');
  const s = Object.fromEntries(t.secoes().map(x => [x.k, x]));
  assert.deepEqual(Object.keys(s), ['dados', 'equipe', 'divisao', 'jornada', 'fechamento'], 'as 5 etapas, na ordem do stepper');
  assert.deepEqual(t.passos(), ['dados', 'equipe', 'divisao', 'jornada', 'fechamento']);
  assert.deepEqual(t.visivel(), ['dados'], 'só a etapa ativa aparece');
  const contem = (k, campos) => { const tem = dataF(s[k].html); for (const c of campos) assert.ok(tem.includes(c), `${k} tem data-f="${c}"`); };
  contem('dados', ['numero', 'servico', 'osOriginal', 'cliente', 'contato', 'whatsapp', 'endereco', 'dataEntrada', 'responsavelPCP', 'vendedor', 'obsPCP']);
  contem('equipe', ['instalacao.data', 'instalacao.periodo', 'instalacao.hora', 'instalacao.duracaoDias', 'veiculo', 'obsAgenda', 'confirmacao', 'confCanal', 'confHora', 'confPor', 'confObs']);
  contem('jornada', ['horaSaida', 'kmSaida', 'problema', 'horaRetorno', 'kmRetorno', 'retornoConf.carroLimpo', 'retornoConf.equipamentosOk', 'checkout.situacao', 'checkout.obs', 'obsTecnicas']);
  contem('fechamento', ['justificativaConclusao']);
  assert.deepEqual(dataF(s.divisao.html), [], 'a divisão é o componente, sem data-f');
  assert.match(s.divisao.html, /id="ficha-divisao"/);
  // Nenhum campo em duas etapas, e as chaves dos blocos continuam as de sempre.
  const todos = Object.values(s).flatMap(x => dataF(x.html));
  assert.equal(new Set(todos).size, todos.length, 'nenhum data-f aparece em duas etapas');
  assert.deepEqual(Object.fromEntries(Object.entries(s).map(([k, x]) => [k, blocosDe(x.html)])),
    {dados: ['pcp', 'itens'], equipe: ['agenda'], divisao: ['divisao'], jornada: ['exec'], fechamento: []});
  // O Fechamento tem o checklist, o Finalizar e o status da entrega (ocorrências e abonos).
  assert.match(s.fechamento.html, /Checklist de fechamento/);
  assert.match(s.fechamento.html, /data-fech-finalizar/);
  assert.match(s.fechamento.html, /aria-label="Status da entrega"/);
  // O stepper tem classe própria; a régua do funil virou o selo compacto (fora das etapas).
  const nav = /<ol class="ficha-etapas"[^>]*>([\s\S]*?)<\/ol>/.exec(t.html())[1];
  assert.doesNotMatch(nav, /class="step[\s"]|class="stepper/, 'o stepper da ficha não reaproveita .stepper/.step');
  assert.match(t.html(), /class="stepper stepper-compact"/, 'o funil vira o selo compacto');
  assert.match(nav, /data-ir-etapa="dados" data-ir-foco="passo" aria-current="step"/, 'a etapa ativa é a atual do stepper');
  // blocoExec(os, ro, done) segue igual.
  assert.equal(t.run('blocoExec.length'), 3);
});

/* ───────────── 2. A sincronização no meio não troca de etapa ───────────── */

test('F23: a sincronização, o conflito e a repintura de um campo não voltam a ficha para a primeira etapa', () => {
  const lista = [osBase({rev: 1})];
  const t = tela({lista});
  t.abrirOS('f1', 'exec');
  assert.deepEqual(t.visivel(), ['jornada']);
  // O servidor manda uma versão nova enquanto a ficha está aberta (atualizarFichaAberta repinta).
  lista[0] = {...js(lista[0]), rev: 2, obsPCP: 'mudou no servidor'};
  t.run('atualizarFichaAberta()');
  assert.equal(t.run('_modalDraft.obsPCP'), 'mudou no servidor', 'a ficha trocou pela versão nova');
  assert.deepEqual(t.visivel(), ['jornada'], 'caso ruim: a repintura da sincronização voltava para Dados');
  // O "Recarregar" do conflito reabre a mesma O.S. pelo openModal: nem a etapa nem a rolagem mudam.
  t.d.modal.scrollTop = 500;
  t.run(`openModal(STORE.getOS('f1'))`);
  assert.deepEqual(t.visivel(), ['jornada'], 'o conflito recarrega sem trocar de etapa');
  assert.equal(t.d.modal.scrollTop, 500, 'o conflito não rola a ficha');
  // Navegação livre pelo stepper: o botão do Fechamento.
  t.d.modal.querySelectorAll('[data-ir-etapa]').find(b => b.dataset.irEtapa === 'fechamento' && b.dataset.irFoco === 'passo').onclick();
  assert.deepEqual(t.visivel(), ['fechamento']);
  // Um campo gravado repinta a ficha: continua no Fechamento.
  t.run(`setField('obsPCP', 'anotação'); saveDraft(); reRenderModalKeepOpen();`);
  assert.deepEqual(t.visivel(), ['fechamento']);
  // Fechar e abrir de novo, sem alvo: começa pela etapa que a situação pede (agendada: Equipe).
  t.run('closeModal()');
  t.abrirOS('f1');
  assert.deepEqual(t.visivel(), ['equipe']);
  // A etapa é por O.S.: outra O.S. aberta depois não herda a etapa da anterior.
  t.lista.push(osBase({id: 'f2', numero: '7102', liberadoPCP: false}));
  t.run(`irParaEtapaFicha('jornada'); closeModal();`);
  t.d.modal.scrollTop = 700;   // a rolagem da O.S. anterior
  t.abrirOS('f2');
  assert.deepEqual(t.visivel(), ['dados'], 'a O.S. aguardando produção abre em Dados');
  assert.equal(t.d.modal.scrollTop, 0, 'caso ruim: a ficha nova abria rolada no meio, com o stepper escondido');
});

/* ───────────── 3. Card, CTA, fila da volta e os links abrem a etapa certa ───────────── */

function container(itens) {
  return {querySelectorAll: sel => itens.filter(([s]) => s === sel).map(([, el]) => el), querySelector: () => null};
}
const botao = dataset => ({tagName: 'BUTTON', dataset, setAttribute() {}, closest: () => null});
const toque = b => b.onclick({stopPropagation() {}, target: {closest: () => null}});

test('F23: os botões do card, o CTA, a fila da volta e os links abrem a etapa certa', () => {
  const t = tela({lista: [osBase(), osPronta({id: 'v1', numero: '7103', finalizadaEm: HOJE + 'T16:00:00', finalizadoPor: 'Gestor Fictício'})]});
  const abriu = () => { const v = t.visivel(); t.run('closeModal()'); return v[0]; };
  // Os botões de etapa do card (pcp, itens, agenda, exec).
  for (const [bloco, etapa] of [['pcp', 'dados'], ['itens', 'dados'], ['agenda', 'equipe'], ['exec', 'jornada']]) {
    const b = botao({etapaOs: 'f1', etapaBloco: bloco});
    t.run('bindCardClicks')(container([['[data-etapa-os]', b]]));
    toque(b);
    if (bloco === 'itens') assert.equal(t.blocos().find(x => x.dataset.bloco === 'itens').open, true, 'o botão Itens abre o bloco dos itens');
    assert.equal(abriu(), etapa, `card ${bloco} abre em ${etapa}`);
  }
  // O CTA do card (próximo passo) que abre a ficha.
  for (const [acao, etapa] of [['confirmar', 'equipe'], ['agenda', 'equipe'], ['saida', 'jornada'], ['exec', 'jornada']]) {
    const b = botao({ctaOs: 'f1', ctaAcao: acao});
    t.run('bindCardClicks')(container([['[data-cta-os]', b]]));
    toque(b);
    assert.equal(abriu(), etapa, `CTA ${acao} abre em ${etapa}`);
  }
  // O Finalizar do card com falta abre na etapa da primeira falta.
  t.run(`finalizarServicoDoCard('f1')`);
  assert.equal(abriu(), 'equipe', 'falta a confirmação do cliente: Equipe');
  t.lista.push(osBase({id: 'f3', numero: '7104', confirmacao: 'Confirmado', confEm: HOJE + 'T07:00:00'}));
  t.run(`finalizarServicoDoCard('f3')`);
  assert.equal(abriu(), 'jornada', 'confirmada, falta a execução: Jornada');
  // A fila Volta do carro abre a O.S. da volta na Jornada (a conferência da volta mora lá).
  const v = botao({voltaOs: 'v1'});
  t.run('bindVoltas')(container([['[data-volta-os]', v]]));
  v.onclick();
  assert.equal(abriu(), 'jornada');
  // "Abrir a ficha" da vista Por O.S. abre no Fechamento (status, ocorrências e abonos).
  const p = botao({osId: 'f1', fichaEtapa: 'fechamento'});
  t.run('bindCardClicks')(container([['[data-os-id]', p]]));
  toque(p);
  assert.equal(abriu(), 'fechamento');
  assert.match(ler('entregas-os.js'), /class="btn-ghost btn-sm poros-abrir" data-os-id="\$\{esc\(c\.id\)\}" data-ficha-etapa="fechamento"/);
  // O clique no corpo do card (sem etapa) abre a etapa que a situação pede.
  const c = {tagName: 'DIV', dataset: {osId: 'v1'}, setAttribute() {}};
  t.run('bindCardClicks')(container([['[data-os-id]', c]]));
  toque(c);
  assert.equal(abriu(), 'fechamento', 'finalizada: Fechamento');
  // "Abrir a ficha da O.S." do Conferir (Performance) e do Fechar o dia: o nome sem ficha se tira no campo Equipe.
  assert.match(ler('performance.js'), /if \(destino === 'ficha'\) \{ const o = STORE\.getOS\(id\); if \(o && typeof openModal === 'function'\) openModal\(o, 'agenda'\)/);
  assert.match(ler('lote.js'), /if \(destino === 'ficha' && o && typeof openModal === 'function'\) openModal\(o, 'agenda'\)/);
  // O próximo passo dentro da ficha leva à etapa dele.
  t.abrirOS('f1', 'pcp');
  assert.match(t.html(), /<div class="prox-passo prox-passo-modal">[\s\S]*?data-ir-etapa="equipe" data-ir-foco="titulo">Ir para Equipe<\/button>/);
});

test('F23: a cancelada abre em Dados com o aviso; a baixa do ERP abre direto em Fechamento, sem trava', () => {
  const canc = osBase({id: 'c1', cancelamento: {ativo: true, motivo: 'Cliente desistiu do pedido fictício', por: 'Gestor Fictício', em: HOJE + 'T09:00:00'}});
  const erp = osBase({id: 'e1', numero: '7105', finalizadaEm: HOJE + 'T03:00:00', finalizadoPor: 'Mubisys · baixa automática',
    baixaAutoERP: {em: HOJE + 'T03:00:00', status: 'CONCLUIDO'}, equipe: [], confirmacao: ''});
  const t = tela({lista: [canc, erp]});
  t.abrirOS('c1');
  assert.deepEqual(t.visivel(), ['dados']);
  assert.match(t.html(), /class="fe-cancelada lock-allow" role="note"><p><strong>⛔ O.S. cancelada por Gestor Fictício/);
  assert.match(t.html(), /Motivo: Cliente desistiu do pedido fictício/);
  assert.doesNotMatch(t.html(), /data-fech-finalizar|id="btn-finalizar"/, 'a cancelada não oferece Finalizar');
  assert.match(t.html(), /data-ir-etapa="fechamento" data-ir-foco="titulo">Desfazer no Fechamento/);
  t.run('closeModal()');
  t.abrirOS('e1');
  assert.deepEqual(t.visivel(), ['fechamento'], 'a baixa do ERP abre no Fechamento');
  const fech = t.secoes().find(s => s.k === 'fechamento').html;
  assert.match(fech, /Baixa do ERP: a ficha abre aqui, sem trava/);
  assert.match(fech, /fe-ck fe-ck-na"[\s\S]*?Fotos antes e depois[\s\S]*?na baixa do ERP a foto não é pedida/, 'a foto que falta na baixa do ERP não é falta (revisão da F23: "sem prova" é do lançamento)');
  assert.doesNotMatch(fech, /disabled/, 'nada travado no Fechamento');
});

/* ───────────── 4. A O.S. interna mostra só as etapas que lhe cabem ───────────── */

test('F23: a O.S. interna (cliente retira) tem só Dados e Fechamento; a Divisão é só da gestão', () => {
  const interna = osBase({id: 'i1', numero: '7106', tipo: 'interno', instalacao: {}, equipe: [], veiculo: ''});
  const t = tela({lista: [interna, osBase()]});
  t.abrirOS('i1', 'exec');   // pedido de uma etapa que a interna não tem: abre na que a situação pede
  assert.deepEqual(t.passos(), ['dados', 'fechamento']);
  assert.deepEqual(t.secoes().map(s => s.k), ['dados', 'fechamento']);
  assert.equal(t.visivel().length, 1);
  assert.deepEqual(t.blocos().map(b => b.dataset.bloco), ['pcp', 'itens']);
  const fech = t.secoes().find(s => s.k === 'fechamento').html;
  assert.match(fech, /id="btn-finalizar-interno"/, 'o "Cliente retirou" fica no Fechamento');
  assert.doesNotMatch(fech, /Checklist de fechamento/, 'retirada no balcão não tem checklist de instalação');
  assert.equal(t.run(`irParaEtapaFicha('jornada')`), false, 'não há Jornada para ir');
  t.run('closeModal()');
  // Operação (e quem só lê) não divide: a etapa Divisão não aparece.
  for (const papel of ['operacao', 'comercial']) {
    const o = tela({papel, lista: [osBase()]});
    o.abrirOS('f1', 'divisao');
    assert.deepEqual(o.passos(), ['dados', 'equipe', 'jornada', 'fechamento'], papel + ' não vê a Divisão');
  }
});

/* ───────────── 5. A validação aparece ao lado do campo, sem salvar e sem travar ───────────── */

test('F23: a pendência aparece ao lado do campo (aria-describedby), sem gravar e sem impedir gravar os outros campos', () => {
  const t = tela({lista: [osBase({cliente: '', responsavelPCP: '', confirmacao: 'Pendente'})]});
  t.abrirOS('f1', 'pcp');
  assert.equal(t.salvos.length, 0, 'pintar a ficha não grava nada');
  const h = t.html();
  assert.match(h, /<input data-f="cliente" value=""\s*aria-describedby="fmsg-cliente"><p class="fe-msg" id="fmsg-cliente" data-fmsg="cliente" aria-live="polite">Falta o cliente\.<\/p>/,
    'a mensagem vem logo depois do campo, presa a ele');
  assert.match(h, /data-f="responsavelPCP" aria-describedby="fmsg-responsavelPCP">[\s\S]*?<\/select><p class="fe-msg" id="fmsg-responsavelPCP"[^>]*>Escolha o responsável do PCP\.<\/p>/);
  assert.match(h, /data-f="confirmacao" aria-describedby="fmsg-confirmacao">[\s\S]*?<\/select><p class="fe-msg" id="fmsg-confirmacao"[^>]*>Para finalizar: confirme com o cliente\.<\/p>/,
    'a falta para finalizar (validarFinalizacao) fica no campo dela');
  assert.match(h, /data-ir-etapa="dados" data-ir-foco="passo" aria-current="step" aria-label="Dados: 2 itens a completar; não impede finalizar"/, 'o stepper conta o que falta na etapa (revisão da F23: sem impedir finalizar, é "a completar")');
  // Sem pendência, a mensagem existe vazia (o campo continua apontando para ela).
  assert.match(h, /<p class="fe-msg" id="fmsg-numero" data-fmsg="numero" aria-live="polite"><\/p>/);
  // Os outros campos gravam com a pendência na tela.
  t.run(`setField('obsPCP', 'anotação fictícia'); saveDraft();`);
  assert.equal(t.salvos.length, 1);
  assert.equal(t.salvos[0].obsPCP, 'anotação fictícia');
  assert.equal(t.salvos[0].cliente, '', 'a pendência não trava a gravação');
  // Digitar o cliente resolve a mensagem e atualiza o stepper ao vivo, sem repintar a ficha.
  const msg = t.el('fmsg-cliente');
  t.run(`setField('cliente', 'Cliente Novo Fictício'); pintarPendenciasFicha();`);
  assert.equal(t.el('fmsg-cliente'), msg, 'o mesmo elemento: a ficha não foi repintada');
  // Revisão da F23: a mensagem resolvida guarda o lugar (invisível, o texto num aria-hidden) até a ficha fechar.
  assert.equal(msg.classList.contains('fe-msg-feita'), true);
  assert.equal(msg.innerHTML, '<span aria-hidden="true">Falta o cliente.</span>');
  assert.equal(t.el('fmsg-responsavelPCP').textContent, 'Escolha o responsável do PCP.');
  assert.match(t.el('ficha-etapas').innerHTML, /aria-label="Dados: 1 item a completar; não impede finalizar"/);
  // Toda falta que validarFinalizacao conhece tem um campo: nenhuma some calada.
  const faltas = JSON.parse(t.run(`JSON.stringify([
    ...validarFinalizacao({tipo: 'externo', retrabalho: true, checkout: {situacao: 'Mais um dia de trabalho'}}),
    ...validarFinalizacao({tipo: 'interno'})])`));
  assert.ok(faltas.length >= 13);
  for (const f of faltas) assert.notEqual(t.run(`faltaFinalizarNaFicha(${JSON.stringify(f)}).campo`), '', `"${f}" sem campo na ficha`);
});

/* ───────────── 6. O checklist incompleto não impede finalizar ───────────── */

test('F23: o checklist incompleto aparece como falta, com o efeito verdadeiro, e não impede finalizar', () => {
  const t = tela({lista: [osPronta()]});
  t.abrirOS('f1');
  assert.deepEqual(t.run(`validarFinalizacao(_modalDraft)`).length, 0, 'pela régua de sempre, pronta para finalizar');
  const pend = JSON.parse(t.run(`JSON.stringify(checklistFechamento(_modalDraft).filter(c => c.estado === 'falta').map(c => c.k))`));
  assert.deepEqual(pend, ['retrabalho', 'volta'], 'sem a resposta do retrabalho e sem a conferência da volta');
  // A conferência e a resposta não entram na régua de finalizar (decisão de 23/09).
  assert.equal(t.run(`validarFinalizacao({..._modalDraft, retornoConf: {carroLimpo: 'sim', equipamentosOk: 'sim'}, retrabalhoPerguntado: {resposta: 'nao'}}).length`), 0);
  t.run(`irParaEtapaFicha('fechamento')`);
  const fech = t.secoes().find(s => s.k === 'fechamento').html;
  assert.match(fech, /O checklist não trava o Finalizar\./);
  assert.doesNotMatch(fech, /pendente para a pontuação/i, 'revisão da F23: nenhuma régua tem essa regra');
  assert.equal((fech.match(/Não impede finalizar\./g) || []).length, 3, 'os 2 itens e o resumo junto do Finalizar');
  assert.match(fech, /<p>Pronta para finalizar\.<\/p>/);
  // O Finalizar do Fechamento finaliza com o checklist incompleto.
  t.run(`perguntarRetrabalho = (d, fn) => fn();`);
  const fin = t.d.modal.querySelectorAll('[data-fech-finalizar]')[0];
  assert.ok(fin && typeof fin.onclick === 'function', 'o botão Finalizar do Fechamento está ligado');
  fin.onclick();
  assert.ok(t.run('_modalDraft.finalizadaEm'), 'finalizou');
  assert.ok(t.salvos.at(-1).finalizadaEm, 'e gravou');
  // Finalizada, a ficha diz o que ficou pendente e segue no Fechamento.
  assert.deepEqual(t.visivel(), ['fechamento']);
  assert.match(t.html(), /Faltam 2 itens\. A O\.S\. continua finalizada\./);
  assert.match(t.html(), /data-ir-etapa="fechamento" data-ir-foco="passo" aria-current="step" aria-label="Fechamento: finalizada; 2 itens do checklist faltam"/);
  // Conferida a volta e respondido o retrabalho, o checklist fica completo.
  t.run(`_modalDraft.retornoConf = {carroLimpo: 'sim', carroArrumado: 'sim', equipamentosOk: 'sim', semAvaria: 'sim'}; _modalDraft.retrabalhoPerguntado = {resposta: 'nao', em: '${HOJE}T15:00:00', por: 'Gestor Fictício'}; reRenderModalKeepOpen();`);
  assert.match(t.html(), /Checklist completo\./);
});

/* ───────────── 7. Os blocos abertos (F01) continuam ───────────── */

test('F23: os blocos abertos continuam pela chave na repintura e na troca de etapa', () => {
  const t = tela({lista: [osBase({rev: 1})]});
  t.abrirOS('f1', 'pcp');
  const bloco = k => t.blocos().find(b => b.dataset.bloco === k);
  bloco('pcp').open = false; bloco('itens').open = true; bloco('agenda').open = false;
  t.run('reRenderModalKeepOpen()');
  assert.equal(bloco('pcp').open, false); assert.equal(bloco('itens').open, true); assert.equal(bloco('agenda').open, false);
  // Indo para a Equipe, o bloco fechado da etapa abre (ninguém aberto ali); Dados fica como estava.
  t.run(`irParaEtapaFicha('equipe')`);
  assert.equal(bloco('agenda').open, true);
  assert.equal(bloco('pcp').open, false); assert.equal(bloco('itens').open, true);
  // Fechar o bloco da etapa ativa e repintar (um campo, a sincronização): fica fechado.
  bloco('agenda').open = false;
  t.run('reRenderModalKeepOpen()');
  assert.equal(bloco('agenda').open, false);
  assert.deepEqual(t.visivel(), ['equipe']);
  // Voltar para Dados não mexe no que estava aberto lá.
  t.run(`irParaEtapaFicha('dados')`);
  assert.equal(bloco('pcp').open, false); assert.equal(bloco('itens').open, true);
});

/* ───────────── 8. O celular do instalador não muda ───────────── */

test('F23: o celular do instalador (equipe.js) não muda: a ficha dele não tem etapas', () => {
  const nodes = new Map();
  const node = sel => {
    if (!nodes.has(sel)) nodes.set(sel, {innerHTML: '', textContent: '', value: '', querySelector: node, querySelectorAll: () => [], setAttribute() {}, classList: {toggle() {}, add() {}, remove() {}}});
    return nodes.get(sel);
  };
  const os = osBase({id: '1', numero: '300', equipe: ['Ana'], confirmacao: 'Confirmado', horaSaida: '08:00', instalacaoOK: true, fotosCheckinIds: ['c1']});
  const ctx = vm.createContext({console, Date, document: {querySelector: node, querySelectorAll: () => [], addEventListener() {}}, window: {}, localStorage: {getItem: () => null, setItem() {}},
    STORE: {getCFG: () => ({}), getAllOS: () => [os], getOS: id => (id === os.id ? os : null), getQueue: () => [], pushPhoto: async () => 'fc', saveOS() {}, pullPhoto: async () => null, carimbarMomento() {}},
    setTimeout() {}, mostrarCelebracao() {}, confirm: () => true});
  vm.runInContext(ler('operacao.js'), ctx);
  vm.runInContext(ler('equipe.js'), ctx);
  ctx.__os = os;
  vm.runInContext('toast = () => {}; fraseAleatoria = () => ""; EQ.instalador = "Ana"; _draft = __os; renderModal()', ctx);
  const h = node('#modal-os').innerHTML;
  assert.match(h, /id="m-finalizar"/, 'a ficha do celular foi pintada');
  assert.doesNotMatch(h, /ficha-etapa|fe-passo|data-etapa-sec|data-ir-etapa|fe-msg|fmsg-|Checklist de fechamento/, 'nada da ficha em etapas no celular');
  // O celular não carrega nada novo e o equipe.js não conhece a ficha em etapas.
  const scripts = [...ler('equipe.html').matchAll(/<script src="([\w-]+)\.js/g)].map(m => m[1]);
  assert.deepEqual(scripts, ['config', 'logo', 'frases', 'store', 'auth', 'operacao', 'entrega-item', 'equipe']);
  assert.doesNotMatch(ler('equipe.js'), /etapasDaFicha|ficha-etapa|fe-passo|irParaEtapaFicha/);
});
