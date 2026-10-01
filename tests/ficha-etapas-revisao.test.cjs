/* AS DUAS REVISÕES DA F23 (ficha da O.S. em etapas), 01/10/2026.
 *
 * Um teste por defeito (D1 a D8 da corretude; M1 a M5 e B1 a B9 do uso).
 * Cada um começa pelo caso ruim, que falha no 5fbf568 (a F23 antes da
 * revisão) e passa depois. Para rodar contra outra cópia (git archive):
 *   PCP_BASELINE=<pasta> node --test tests/ficha-etapas-revisao.test.cjs
 *
 * Decisões do dono que estes testes fixam:
 * - o checklist só diz o efeito que o motor do programa (F19) tem: nenhuma
 *   régua lê o checklist; o item sem efeito é só "falta", e "não impede
 *   finalizar";
 * - a baixa do ERP sem lançamento ganha o item "Lançar a entrega" ("sem
 *   prova": não pontua até lançar);
 * - trocar de etapa não repinta a ficha;
 * - o retorno previsto NÃO é obrigatório: a Equipe fica "ok" sem ele, com a
 *   dica do que se perde.
 *
 * O app.js roda inteiro num DOM falso: cada pintura do #modal-os vira
 * blocos, seções das etapas e elementos com os atributos que a ficha liga.
 * O mesmo objeto vale até a próxima pintura, como no navegador. Dados
 * fictícios.
 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const base = process.env.PCP_BASELINE || root;
const ler = f => fs.readFileSync(path.join(base, f), 'utf8');
const HOJE = '2026-10-05';
const js = v => JSON.parse(JSON.stringify(v));
class DataFixa extends Date { constructor(...a) { super(...(a.length ? a : [HOJE + 'T12:00:00'])); } static now() { return new Date(HOJE + 'T12:00:00').getTime(); } }

function classes(ini) {
  const s = new Set(ini || []);
  return {add: (...c) => c.forEach(x => s.add(x)), remove: (...c) => c.forEach(x => s.delete(x)), contains: c => s.has(c),
    toggle: (c, on) => { const v = on === undefined ? !s.has(c) : !!on; if (v) s.add(c); else s.delete(c); return v; }};
}
const ATTR = '(?:[^>"]|"[^"]*")*';
const camel = k => k.replace(/-(\w)/g, (_, c) => c.toUpperCase());
/* Os elementos de um pedaço de HTML: por atributo e por id, criados uma vez
   por pintura (o onclick ligado pelo app é o que o teste toca). */
function elementos(getHTML, doc) {
  let cache = new Map(), porId = new Map(), visto = null;
  const novoEl = (p = {}) => {
    const attrs = new Map();
    return {id: '', textContent: '', innerHTML: '', value: '', hidden: false, disabled: false, tagName: 'DIV', dataset: {}, classList: classes(), style: {},
      focus() { doc.activeElement = this; }, scrollIntoView() { this.rolado = true; }, querySelector: () => null, querySelectorAll: () => [], closest: () => null,
      getAttribute: k => (attrs.has(k) ? attrs.get(k) : null), setAttribute: (k, v) => attrs.set(k, String(v)), removeAttribute: k => attrs.delete(k), hasAttribute: k => attrs.has(k), ...p};
  };
  const zerarSeMudou = () => { const h = getHTML(); if (h !== visto) { visto = h; cache = new Map(); porId = new Map(); } return h; };
  const deTag = (m, tag, texto) => {
    const id = (/\sid="([^"]+)"/.exec(tag) || [])[1] || '';
    if (id && porId.has(id)) return porId.get(id);
    const ds = {};
    for (const [, k, v] of tag.matchAll(/\sdata-([\w-]+)(?:="([^"]*)")?/g)) ds[camel(k)] = v === undefined ? '' : v;
    const cls = ((/\sclass="([^"]*)"/.exec(tag) || [])[1] || '').split(/\s+/).filter(Boolean);
    const el = novoEl({id, tagName: m.toUpperCase(), dataset: ds, classList: classes(cls), textContent: texto || '', hidden: /\shidden(\s|$|=)/.test(tag)});
    for (const [, k, v] of tag.matchAll(/\s(aria-[\w-]+|tabindex)="([^"]*)"/g)) el.setAttribute(k, v);
    if (id) porId.set(id, el);
    return el;
  };
  const comAtributo = (attr, valor) => {
    const h = zerarSeMudou();
    const chave = attr + '=' + (valor || '');
    if (!cache.has(chave)) {
      const alvo = valor === undefined ? `\\s${attr}(?:="[^"]*")?` : `\\s${attr}="${valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`;
      cache.set(chave, [...h.matchAll(new RegExp(`<(\\w+)(${ATTR}${alvo}${ATTR})>([^<]*)`, 'g'))].map(m => deTag(m[1], m[2], m[3])));
    }
    return cache.get(chave);
  };
  const porIdDoHTML = id => {
    const h = zerarSeMudou();
    if (porId.has(id)) return porId.get(id);
    const m = new RegExp(`<(\\w+)(${ATTR}\\sid="${id}"${ATTR})>([^<]*)`).exec(h);
    return m ? deTag(m[1], m[2], m[3]) : null;
  };
  // Os seletores que o app usa dentro de um container.
  const qsa = s => {
    let m;
    if ((m = /^\[([\w-]+)\]$/.exec(s))) return comAtributo(m[1]);
    if ((m = /^#([\w-]+)$/.exec(s))) { const e = porIdDoHTML(m[1]); return e ? [e] : []; }
    return [];
  };
  return {comAtributo, porIdDoHTML, qsa};
}
function domFalso() {
  let html = '', blocos = [], secs = [], pinturas = 0;
  const doc = {activeElement: null, body: {contains: () => false, classList: classes(), appendChild() {}}, visibilityState: 'visible', addEventListener() {}};
  const E = elementos(() => html, doc);
  const modal = {classList: classes(), scrollTop: 0,
    get innerHTML() { return html; },
    set innerHTML(v) { pinturas++; html = v;
      blocos = [...v.matchAll(/<details class="card-fs[^"]*"[^>]*data-bloco="([^"]+)"/g)].map(m => ({dataset: {bloco: m[1]}, open: false}));
      secs = [...v.matchAll(/<section class="ficha-etapa" data-etapa-sec="(\w+)"([^>]*)>/g)].map(m => ({dataset: {etapaSec: m[1]}, hidden: /\shidden(\s|$)/.test(m[2])})); },
    querySelector: () => null, querySelectorAll: E.qsa};
  const overlay = {classList: classes()};
  const paineis = new Map();
  doc.querySelector = s => {
    if (s === '#modal-os') return modal;
    if (s === '#modal-overlay') return overlay;
    if (paineis.has(s)) return paineis.get(s);
    const m = /^#modal-os \[aria-describedby="([^"]+)"\]$/.exec(s);
    return m ? E.comAtributo('aria-describedby', m[1])[0] || null : null;
  };
  doc.querySelectorAll = s => (s === '#modal-os .card-fs' ? blocos : s === '#modal-os .ficha-etapa' ? secs
    : s === '#modal-os [data-fmsg]' ? E.comAtributo('data-fmsg')
    : s === '#ficha-etapas [data-ir-etapa]' ? E.comAtributo('data-ir-etapa').filter(b => b.dataset.irFoco === 'passo') : []);
  doc.getElementById = id => E.porIdDoHTML(id);
  // Um painel de aba (a Retrabalho): o innerHTML que o app escreve vira elementos, como no modal.
  const painel = sel => {
    let h = '';
    const P = elementos(() => h, doc);
    const p = {get innerHTML() { return h; }, set innerHTML(v) { h = v; }, querySelector: () => null, querySelectorAll: P.qsa, classList: classes()};
    paineis.set(sel, p);
    return p;
  };
  return {doc, modal, overlay, painel, html: () => html, blocos: () => blocos, secs: () => secs, pinturas: () => pinturas};
}

function tela({papel = 'admin', lista = [], cfg: cfgExtra = {}, comPerformance = false} = {}) {
  const d = domFalso();
  const salvos = [], toasts = [], ocorrencias = [];
  const cfg = {instaladores: ['Ana'], responsaveis: ['Gestor Fictício'], vinculosRH: [], performancePCP: {equipes: [], participacoes: []}, ...cfgExtra};
  const STORE = {getAllOS: () => lista, getCFG: () => cfg, getOS: id => lista.find(o => o.id === id) || null, elenco: () => ({pessoas: [], antigos: []}),
    saveOS(o) { salvos.push(js(o)); const i = lista.findIndex(x => x.id === o.id); if (i >= 0) lista[i] = o; else lista.push(o); },
    getQueue: () => [], on() {}, uuid: () => 'u1', valores: () => ({}), carimbarMomento() {}, pullPhoto: async () => null};
  const ctx = vm.createContext({console, Date: DataFixa, document: d.doc, window: {addEventListener() {}}, navigator: {onLine: true},
    localStorage: {getItem: () => null, setItem() {}, removeItem() {}}, STORE, setTimeout() {}, clearTimeout() {}, setInterval() {},
    __toasts: toasts, __ocorrencias: ocorrencias});
  for (const f of ['operacao.js', 'divisao.js', 'regras.js', 'alocacao-ui.js']) vm.runInContext(ler(f), ctx, {filename: f});
  vm.runInContext(ler('app.js'), ctx, {filename: 'app.js'});
  if (comPerformance) vm.runInContext(ler('performance.js'), ctx, {filename: 'performance.js'});
  vm.runInContext(`STATE.user = {nome: 'Gestor Fictício', papel: '${papel}'};
    bindModalEvents = () => {}; ligarEquipeDaFicha = () => {}; ligarHistoricoAlteracoes = () => {};
    renderActiveTab = () => {}; toast = (m, t, o) => __toasts.push([m, t || '', o || null]);
    registrarOcorrenciaEm = (os, gravar, extra) => __ocorrencias.push([os.id, typeof gravar, extra && extra.fonte]);
    var versoesRegrasCasa = () => [];   // o index.html sempre carrega o casa.js: a regra do dia vem dele (revisão da junção v144)`, ctx);
  const run = code => vm.runInContext(code, ctx);
  // O HTML de cada etapa, até o rodapé comum da ficha.
  const secoes = () => Object.fromEntries(d.html().split('<section class="ficha-etapa" ').slice(1).map(p => {
    const k = /^data-etapa-sec="(\w+)"/.exec(p)[1];
    const fim = p.indexOf('id="modal-pdf"');
    return [k, fim >= 0 ? p.slice(0, fim) : p];
  }));
  const visivel = () => d.secs().filter(s => !s.hidden).map(s => s.dataset.etapaSec);
  const passo = k => (new RegExp(`data-ir-etapa="${k}" data-ir-foco="passo"[^>]*aria-label="([^"]*)"`).exec(d.html()) || [])[1] || '';
  const passoVivo = k => { const nav = d.doc.getElementById('ficha-etapas'); const h = nav && nav.innerHTML ? nav.innerHTML : d.html(); return (new RegExp(`data-ir-etapa="${k}" data-ir-foco="passo"[^>]*aria-label="([^"]*)"`).exec(h) || [])[1] || ''; };
  const abrirOS = (id, alvo) => run(`openModal(STORE.getOS(${JSON.stringify(id)})${alvo ? ', ' + JSON.stringify(alvo) : ''})`);
  const botoes = () => d.modal.querySelectorAll('[data-ir-etapa]');
  return {run, d, salvos, toasts, ocorrencias, lista, secoes, visivel, passo, passoVivo, abrirOS, botoes, el: id => d.doc.getElementById(id), html: () => d.html()};
}

const osBase = (extra = {}) => ({id: 'f1', numero: '7101', tipo: 'externo', cliente: 'Cliente Fictício', responsavelPCP: 'Gestor Fictício', liberadoPCP: true,
  instalacao: {data: HOJE, periodo: 'Manhã', duracaoDias: 1}, equipe: ['Ana'], veiculo: 'Carro 1', itens: [{uid: 'f1:1:1', item: '1', descricao: 'Placa fictícia', qtde: '1', pronto: true}], ...extra});
const osPronta = (extra = {}) => osBase({confirmacao: 'Confirmado', confEm: HOJE + 'T07:00:00', embarqueConferidoPor: 'Gestor Fictício', produtosConferidosPor: 'Gestor Fictício',
  ferramentasConferidas: true, ferramentasConferidasPor: 'Gestor Fictício', carroLiberado: true, horaSaida: '08:00', saidaEm: HOJE + 'T08:00:00',
  instalacaoOK: true, conferidoPor: 'Gestor Fictício', fotosCheckinIds: ['foto-saida-1'], fotosRetornoIds: ['foto-volta-1'], horaRetorno: '15:00', retornoEm: HOJE + 'T15:00:00', ...extra});
const finalizada = (extra = {}) => osPronta({finalizadaEm: HOJE + 'T16:00:00', finalizadoPor: 'Gestor Fictício', ...extra});
const VOLTA_OK = {carroLimpo: 'sim', carroArrumado: 'sim', equipamentosOk: 'sim', semAvaria: 'sim', por: 'Gestor Fictício', em: HOJE + 'T17:00:00'};
const RESPONDIDO_NAO = {resposta: 'nao', em: HOJE + 'T16:00:00', por: 'Gestor Fictício'};
const itensDoChecklist = h => [...h.matchAll(/<li class="fe-ck fe-ck-(\w+)">([\s\S]*?)<\/li>/g)].map(m => ({estado: m[1], html: m[2], rotulo: (/<strong>([^<]*)<\/strong>/.exec(m[2]) || [])[1]}));
const doChecklist = (h, rotulo) => itensDoChecklist(h).find(c => c.rotulo === rotulo) || null;
// O checklist que está na tela: o pedaço repintado ao vivo, se houve, senão o da pintura.
const checklistNaTela = t => { const el = t.el('fe-checklist'); return el && el.innerHTML ? el.innerHTML : (t.secoes().fechamento || ''); };

/* ───────────── D1 · o checklist não promete efeito que nenhuma régua tem ───────────── */
test('revisão: D1, o checklist não diz "fica pendente para a pontuação"; cada item diz o efeito do motor do programa ou nenhum', () => {
  const t = tela({lista: [finalizada({retrabalhoPerguntado: RESPONDIDO_NAO})]});
  t.abrirOS('f1');
  const fech = t.secoes().fechamento;
  // Caso ruim: toda falta "ficava pendente para a pontuação", e a volta sem conferência não muda nada no motor.
  assert.doesNotMatch(fech, /pendente para a pontua/i, 'nenhuma régua lê o checklist');
  const regua = ['performance.js', 'supabase/functions/pcp-sync/index.ts'].map(ler).join('\n');
  assert.doesNotMatch(regua, /checklistFechamento|fechada para pontua/i, 'premissa: a pontuação não lê o checklist');
  // O efeito verdadeiro (pontuacao.js da F19): a volta não conferida é neutra no bônus e no redutor.
  const volta = doChecklist(fech, 'Limpeza e equipamentos da volta');
  assert.equal(volta.estado, 'falta');
  assert.match(volta.html, /Sem a conferência, a volta fica neutra: sem bônus e sem redutor\./);
  // Atraso e retrabalho tiram a O.S. da pontuação; o retrabalho não se abona, o atraso sim.
  const t2 = tela({lista: [finalizada({retrabalho: true, problema: 'Placa torta fictícia', retornoConf: VOLTA_OK, instalacao: {data: '2026-10-02', periodo: 'Manhã', duracaoDias: 1}})]});
  t2.abrirOS('f1');
  const f2 = t2.secoes().fechamento;
  assert.match(doChecklist(f2, 'Retrabalho').html, /Retrabalho tira a O\.S\. da pontuação para todos e não se abona\./);
  assert.match(doChecklist(f2, 'Prazo').html, /Entregue com atraso: a O\.S\. não pontua\. O abono devolve\./);
  assert.match(doChecklist(f2, 'Limpeza e equipamentos da volta').html, /Carro limpo e arrumado: bônus da volta\./);
  // O item sem efeito na pontuação é só "falta": a foto que falta na finalizada não promete nada.
  const t3 = tela({lista: [finalizada({fotosRetornoIds: [], retornoConf: VOLTA_OK, retrabalhoPerguntado: RESPONDIDO_NAO})]});
  t3.abrirOS('f1');
  const foto = doChecklist(t3.secoes().fechamento, 'Fotos antes e depois');
  assert.equal(foto.estado, 'falta');
  assert.doesNotMatch(foto.html, /pontua/, 'a foto não pesa na pontuação');
  // Entregue antes de 01/10, o programa não vale: o efeito não aparece.
  const t4 = tela({lista: [finalizada({finalizadaEm: '2026-09-20T16:00:00'})]});
  t4.abrirOS('f1');
  const f4 = t4.secoes().fechamento;
  assert.doesNotMatch(f4, /fica neutra|bônus|não pontua/);
  assert.match(f4, /Entregue antes de 01\/10\/2026: os efeitos do programa não valem para ela\./);
});

/* ───────────── D2 · a baixa do ERP sem lançamento ───────────── */
test('revisão: D2, a baixa do ERP sem lançamento não é "checklist completo": ganha "Lançar a entrega", sem prova até lançar', () => {
  const erp = osPronta({id: 'e1', numero: '7105', finalizadaEm: HOJE + 'T03:00:00', finalizadoPor: 'Mubisys · baixa automática',
    baixaAutoERP: {em: HOJE + 'T03:00:00', status: 'ENTREGUE'}, prazoCombinado: {data: HOJE, fonte: 'agenda', em: '2026-10-01T10:00:00'},
    retornoConf: VOLTA_OK, retrabalhoPerguntado: RESPONDIDO_NAO});
  const t = tela({lista: [erp]});
  t.abrirOS('e1');
  // Caso ruim: o stepper dizia "finalizada, com o checklist completo" para a O.S. que o servidor tira da pontuação.
  assert.doesNotMatch(t.passo('fechamento'), /checklist completo/);
  assert.equal(t.passo('fechamento'), 'Fechamento: finalizada; 1 item do checklist falta');
  const lancar = doChecklist(t.secoes().fechamento, 'Lançar a entrega');
  assert.ok(lancar, 'o checklist da baixa do ERP tem o lançamento');
  assert.equal(lancar.estado, 'falta');
  assert.match(lancar.html, /Sem o lançamento, a entrega fica sem prova e não pontua\. Lance em Entregas, na fila a lançar\./);
  assert.match(t.secoes().fechamento, /Baixa do ERP: a ficha abre aqui, sem trava\. Falta 1 item\./);
  assert.doesNotMatch(t.secoes().fechamento, /Checklist completo/);
  // Lançada, o item sai e o checklist fica completo.
  const t2 = tela({lista: [{...js(erp), entregaLancada: {em: HOJE + 'T09:00:00', por: 'Gestor Fictício', data: HOJE}}]});
  t2.abrirOS('e1');
  assert.equal(doChecklist(t2.secoes().fechamento, 'Lançar a entrega'), null);
  assert.equal(t2.passo('fechamento'), 'Fechamento: finalizada, com o checklist completo');
});

/* ───────────── D3 · trocar de etapa não repinta ───────────── */
test('revisão: D3, trocar de etapa não repinta a ficha: o motivo digitado e os blocos abertos ficam', () => {
  const t = tela({lista: [osBase()]});
  t.abrirOS('f1', 'agenda');
  const motivo = t.el('prazo-corr-motivo');
  assert.ok(motivo, 'premissa: a "Corrigir o prazo" está na etapa Equipe');
  motivo.value = 'Prazo digitado errado na abertura';
  const antes = t.d.pinturas();
  t.run(`irParaEtapaFicha('jornada')`);
  t.run(`irParaEtapaFicha('equipe')`);
  // Caso ruim: cada troca rodava o renderModal (o campo sem data-f perdia o que foi digitado).
  assert.equal(t.d.pinturas(), antes, 'nenhuma pintura do #modal-os');
  assert.equal(t.el('prazo-corr-motivo'), motivo, 'o mesmo campo');
  assert.equal(motivo.value, 'Prazo digitado errado na abertura');
  assert.deepEqual(t.visivel(), ['equipe'], 'só a etapa escolhida aparece');
  // O stepper acompanha (aria-current) sem repintar a ficha.
  assert.match(t.el('ficha-etapas').innerHTML, /data-ir-etapa="equipe" data-ir-foco="passo" aria-current="step"/);
  // O passo clicado troca a etapa do mesmo jeito.
  t.botoes().find(b => b.dataset.irEtapa === 'fechamento' && b.dataset.irFoco === 'passo').onclick();
  assert.deepEqual(t.visivel(), ['fechamento']);
  assert.equal(t.d.pinturas(), antes);
});

/* ───────────── D4 · a lista do Finalizar acompanha a Exceção de encerramento ───────────── */
test('revisão: D4, digitar a Exceção de encerramento atualiza a lista do que falta no Fechamento', () => {
  const t = tela({lista: [osPronta({fotosRetornoIds: [], horaRetorno: '', retornoEm: ''})]});
  t.abrirOS('f1', 'fechamento');
  const finalNaTela = () => { const el = t.el('fe-final'); return el && el.innerHTML ? el.innerHTML : t.secoes().fechamento; };
  assert.match(finalNaTela(), /Para finalizar, falta:[\s\S]*?pelo menos 1 foto de retorno/);
  // O caminho do campo de texto (bindModalEvents): setField e a pintura ao vivo, sem repintar a ficha.
  t.run(`setField('justificativaConclusao', 'Cliente não deixou fotografar o serviço'); pintarPendenciasFicha();`);
  assert.equal(t.run('validarFinalizacao(_modalDraft).length'), 0, 'com a exceção, nada falta');
  // Caso ruim: o stepper já dizia "pronta" e a lista logo abaixo seguia pedindo a foto e a hora.
  assert.doesNotMatch(finalNaTela(), /pelo menos 1 foto de retorno|hora do retorno/);
  assert.match(finalNaTela(), /<p>Pronta para finalizar\.<\/p>/);
  assert.match(t.passoVivo('fechamento'), /pronta para finalizar/);
});

/* ───────────── D5 · a numeração dos blocos e a ordem das etapas ───────────── */
test('revisão: D5, os blocos não têm número que brigue com a ordem das etapas, e nenhum texto manda ao "bloco 5"', () => {
  const t = tela({lista: [osBase()]});
  t.abrirOS('f1', 'pcp');
  const nums = [...t.html().matchAll(/<details class="card-fs[^"]*"[^>]*data-bloco="(\w+)"[^>]*>\s*<summary>(\d) ·/g)].map(m => [m[1], Number(m[2])]);
  // Caso ruim: Dados 1 e 2, Equipe 3, Divisão "5", Jornada "4".
  assert.deepEqual(nums, [], 'o resumo do bloco não tem número; a etapa dá a posição');
  const app = ler('app.js');
  for (const velho of ['ficam no bloco 5', 'mexida no bloco 5', 'Complete no bloco 5', 'preencha no bloco 1']) assert.ok(!app.includes(velho), velho);
  assert.match(app, /Líder e percentuais ficam na etapa Divisão\./);
  assert.match(app, /a divisão mexida na etapa Divisão não foi confirmada e não foi gravada/);
  assert.match(t.html(), /<summary>Divisão da equipe /);
  assert.match(t.html(), /<summary>Embarque &amp; Execução /);
});

/* ───────────── D6 · a aba Retrabalho abre a ficha na Jornada ───────────── */
test('revisão: D6, a ficha aberta pela aba Retrabalho mostra a etapa de origem e a causa raiz', () => {
  const orig = finalizada({retrabalho: true, problema: 'Placa torta fictícia', dataRetrabalho: HOJE});
  const t = tela({lista: [orig]});
  const painel = t.d.painel('#panel-retrabalho');
  t.run(`STATE._fRetra = {de: '', ate: ''}; renderRetrabalho()`);
  const linha = painel.querySelectorAll('[data-os-id]')[0];
  assert.ok(linha && linha.tagName === 'TR', 'premissa: a linha da original na aba');
  linha.onclick({target: {closest: () => null}});
  const vis = t.visivel()[0];
  // Caso ruim: a finalizada abria no Fechamento, e os campos do retrabalho ficavam escondidos na Jornada.
  assert.equal(vis, 'jornada');
  assert.match(t.secoes()[vis], /data-f="etapaOrigem"[\s\S]*?data-f="causaRaiz"/);
  assert.match(ler('app.js'), /openModal\(os, os\.finalizadaEm \? 'exec' : undefined\)/, 'o botão da O.S. de retrabalho feita também abre na Jornada');
});

/* ───────────── D7 · a cancelada está fora da apuração ───────────── */
test('revisão: D7, a O.S. cancelada (no ERP ou pela gestão) não tem falta de checklist nem manda conferir', () => {
  const noERP = finalizada({id: 'c1', finalizadoPor: 'Mubisys · baixa automática', baixaAutoERP: {em: HOJE + 'T16:00:00', status: 'CANCELADO'}, fotosRetornoIds: []});
  const manual = osBase({id: 'c2', numero: '7110', cancelamento: {ativo: true, motivo: 'Cliente desistiu do pedido fictício', por: 'Gestor Fictício', em: HOJE + 'T09:00:00'}});
  for (const o of [noERP, manual]) {
    const t = tela({lista: [o]});
    t.abrirOS(o.id);
    assert.equal(t.run('canceladaNaTela(_modalDraft)'), true);
    const fech = t.secoes().fechamento;
    // Caso ruim: retrabalho e volta "ficavam pendentes para a pontuação", com "Ir para Jornada".
    assert.deepEqual(itensDoChecklist(fech), [], o.id + ': nenhum item do checklist');
    assert.match(fech, /Cancelada: fora da apuração\./);
    assert.doesNotMatch(fech.split('id="fe-status"')[0], /Ir para/, o.id + ': nada manda conferir');
    assert.equal(t.run('checklistFechamento(_modalDraft).length'), 0);
    assert.match(t.passo('fechamento'), /O\.S\. cancelada/);
  }
});

/* ───────────── D8 · a divisão que não gravou com a pessoa em outra etapa ───────────── */
test('revisão: D8, a falha do Confirmar divisão aparece (aviso que fica) e marca a Divisão, com a pessoa em outra etapa', async () => {
  const t = tela({lista: [osBase()]});
  t.abrirOS('f1', 'divisao');
  let solta;
  t.run(`ALOCUI.iniciar = () => ({}); ALOCUI.montar = () => {}; ALOCUI.bloqueio = () => ''; ALOCUI.estrutura = () => [];`);
  t.run('ALOCUI').gravarNaOS = () => new Promise(r => { solta = r; });
  t.run(`ligarDivisaoDaFicha(document.getElementById('ficha-divisao'), new Map())`);
  const envio = t.el('ficha-div-ok').onclick();
  t.run(`irParaEtapaFicha('jornada')`);   // segue o trabalho enquanto o servidor não responde
  solta({ok: false, estado: 'erro', mensagem: 'Não foi possível gravar: servidor fora (fictício).'});
  await envio;
  assert.deepEqual(t.visivel(), ['jornada']);
  // Caso ruim: a mensagem ia para a etapa Divisão escondida, e nenhum aviso aparecia.
  const aviso = t.toasts.find(([m]) => /servidor fora/.test(m));
  assert.ok(aviso, 'o aviso aparece na Jornada');
  assert.equal(aviso[1], 'error');
  assert.deepEqual(js(aviso[2]), {fica: true}, 'o aviso fica até um toque');
  assert.match(t.passoVivo('divisao'), /^Divisão: a divisão não foi gravada: Não foi possível gravar/);
  assert.match(t.el('ficha-etapas').innerHTML, /class="fe-passo fe-erro" data-ir-etapa="divisao"/);
  // A mensagem também fica na etapa Divisão, para quando a pessoa voltar.
  assert.match(t.el('ficha-div-status').textContent, /servidor fora/);
  // O toast que fica não tem prazo para sumir (o toast de verdade do app).
  assert.match(ler('app.js'), /if \(!\(opt && opt\.fica\)\) setTimeout\(\(\) => el\.remove\(\), ms\);/);
});

/* ───────────── M1 · marcar caixa na Jornada não mexe no layout embaixo do clique ───────────── */
test('revisão: M1, na Jornada a falta só aparece depois de um Finalizar recusado, e a resolvida guarda o lugar', () => {
  const t = tela({lista: [osBase({confirmacao: 'Confirmado', confEm: HOJE + 'T07:00:00'})]});
  t.abrirOS('f1', 'exec');
  const msg = k => t.el('fmsg-' + k);
  // Caso ruim: cada caixa tinha a mensagem embaixo; marcar apagava e o que vinha depois subia 34 px.
  for (const k of ['embarqueConferidoPor', 'produtosConferidosPor', 'ferramentasConferidas', 'instalacaoOK']) assert.equal(msg(k).textContent, '', k + ' sem mensagem antes do Finalizar');
  // Marcar o Embarque (repinta a ficha): nada muda de altura embaixo.
  t.run(`setField('embarqueConferidoPor', 'Gestor Fictício'); saveDraft(); reRenderModalKeepOpen();`);
  assert.equal(msg('produtosConferidosPor').textContent, '');
  assert.equal(msg('embarqueConferidoPor').classList.contains('fe-msg-feita'), false);
  // O resumo junto do botão Finalizar diz o que falta, embaixo dele.
  assert.match(t.secoes().jornada, /id="btn-finalizar"[^>]*>[^<]*<\/button>\s*<div class="fe-fin-resumo" id="fe-fin-jornada"[^>]*><p class="fe-fin-faltas">Para finalizar, faltam \d+: marque Produtos conferidos/);
  // O Finalizar recusado mostra as faltas ao lado dos campos.
  t.run(`finalizarDaFicha(false)`);
  assert.ok(t.toasts.some(([m, tp]) => /^Falta: /.test(m) && tp === 'error'));
  assert.equal(msg('produtosConferidosPor').textContent, 'Para finalizar: marque Produtos conferidos.');
  assert.equal(msg('ferramentasConferidas').textContent, 'Para finalizar: marque Ferramentas conferidas.');
  // Resolvida depois da recusa, a mensagem guarda o lugar (invisível) mesmo com a ficha repintada.
  t.run(`setField('produtosConferidosPor', 'Gestor Fictício'); saveDraft(); reRenderModalKeepOpen();`);
  assert.equal(msg('produtosConferidosPor').classList.contains('fe-msg-feita'), true);
  assert.match(t.html(), /<p class="fe-msg fe-msg-feita" id="fmsg-produtosConferidosPor"[^>]*><span aria-hidden="true">Para finalizar: marque Produtos conferidos\.<\/span><\/p>/);
  assert.match(ler('styles.css'), /\.fe-msg\.fe-msg-feita \{ visibility: hidden; \}/);
  // Fechar e abrir de novo começa limpo.
  t.run('closeModal()');
  t.abrirOS('f1', 'exec');
  assert.equal(msg('ferramentasConferidas').textContent, '');
});

/* ───────────── M2 · Status da entrega, ocorrência e Cancelar à mão ───────────── */
test('revisão: M2, o selo do topo leva ao Status da entrega e a Jornada tem "+ Registrar ocorrência"', () => {
  const t = tela({lista: [osPronta({horaRetorno: '', retornoEm: ''})]});
  t.abrirOS('f1', 'exec');
  // Caso ruim: o selo do topo não era clicável, e a Jornada não tinha caminho para a ocorrência.
  const selo = t.botoes().find(b => b.dataset.irFoco === 'status');
  assert.ok(selo, 'o selo é um botão');
  assert.match(t.html(), /<button type="button" class="fe-selo" data-ir-etapa="fechamento" data-ir-foco="status" aria-label="Status da entrega: [^"]+\. Ver no Fechamento, com as ocorrências">/);
  selo.onclick();
  assert.deepEqual(t.visivel(), ['fechamento']);
  assert.equal(t.d.doc.activeElement, t.el('fe-status'), 'o foco vai para o Status da entrega');
  assert.match(t.secoes().fechamento, /id="fe-status"[\s\S]*?aria-label="Status da entrega"[\s\S]*?id="btn-cancelar-os"[\s\S]*?\+ Registrar ocorrência/);
  // O atalho da Jornada abre o mesmo formulário do Status da entrega.
  t.run(`irParaEtapaFicha('jornada')`);
  assert.match(t.secoes().jornada, /Conferência da volta[\s\S]*?<div class="fe-atalho-oc lock-allow"><button type="button" class="btn-ghost btn-sm" id="btn-jornada-ocorrencia">\+ Registrar ocorrência<\/button>/);
  t.el('btn-jornada-ocorrencia').onclick();
  assert.deepEqual(js(t.ocorrencias), [['f1', 'function', 'ficha']]);
  // Quem não é da gestão não registra ocorrência: o atalho não aparece.
  const op = tela({papel: 'operacao', lista: [osPronta()]});
  op.abrirOS('f1', 'exec');
  assert.doesNotMatch(op.html(), /btn-jornada-ocorrencia/);
});

/* ───────────── M3 · a finalizada: nada de "ok" ao lado de "falta", nada de "Ir para" travado ───────────── */
test('revisão: M3, na finalizada o stepper não marca "ok" o que o checklist diz que falta, e o "Ir para" só leva ao que se edita', () => {
  const t = tela({lista: [finalizada({fotosCheckinIds: [], fotosRetornoIds: []})]});
  t.abrirOS('f1');
  // Caso ruim: Jornada "✓ ok" com 3 itens do checklist mandando ir para a Jornada.
  assert.equal(t.passo('jornada'), 'Jornada: finalizada; 3 itens do checklist faltam');
  assert.match(t.html(), /class="fe-passo fe-aviso" data-ir-etapa="jornada"/);
  const fech = t.secoes().fechamento;
  const foto = doChecklist(fech, 'Fotos antes e depois'), retr = doChecklist(fech, 'Retrabalho'), volta = doChecklist(fech, 'Limpeza e equipamentos da volta');
  assert.doesNotMatch(foto.html, /Ir para/, 'a foto não entra na ficha finalizada');
  assert.match(foto.html, /A ficha finalizada não recebe foto: só reabrindo a O\.S\./);
  assert.doesNotMatch(foto.html, /Reabr[ae]/, 'não induz a reabrir');
  assert.doesNotMatch(retr.html, /Ir para/);
  assert.match(retr.html, /Responda no Fechar o dia, em Entregas\./);
  assert.match(volta.html, /data-ir-etapa="jornada" data-ir-foco="titulo">Ir para Jornada</, 'a conferência da volta a gestão faz na finalizada');
  // Para quem não confere a volta, nada de "Ir para".
  const op = tela({papel: 'operacao', lista: [finalizada()]});
  op.abrirOS('f1');
  const v2 = doChecklist(op.secoes().fechamento, 'Limpeza e equipamentos da volta');
  assert.doesNotMatch(v2.html, /Ir para/);
  assert.match(v2.html, /A gestão confere\./);
  // Tudo conferido: a Jornada volta a "ok".
  const ok = tela({lista: [finalizada({retornoConf: VOLTA_OK, retrabalhoPerguntado: RESPONDIDO_NAO})]});
  ok.abrirOS('f1');
  assert.equal(ok.passo('jornada'), 'Jornada: completa');
});

/* ───────────── M4 · a O.S. confirmada pelo jeito antigo ───────────── */
test('revisão: M4, a O.S. confirmada pela participação antiga da apuração aparece confirmada na Divisão', () => {
  const participacoes = [{id: 'f1', membros: [{chave: '900001', nome: 'Ana Fictícia', percentual: 60}, {chave: '900002', nome: 'Bia Fictícia', percentual: 40}],
    por: 'Gestor Fictício', em: '2026-09-28T10:00:00'}];
  const t = tela({lista: [finalizada({equipe: ['900001', '900002']})], cfg: {performancePCP: {equipes: [], participacoes}}, comPerformance: true});
  t.abrirOS('f1');
  // Caso ruim: "! a confirmar" e "Nada está gravado ainda", convidando a gravar outra divisão.
  assert.equal(t.passo('divisao'), 'Divisão: divisão confirmada pelo jeito antigo (a participação da apuração)');
  assert.match(t.html(), /class="fe-passo fe-ok" data-ir-etapa="divisao"/);
  const div = t.secoes().divisao;
  assert.match(div, /<summary>Divisão da equipe <span class="sum-check">✓ confirmada<\/span>/);
  assert.match(div, /Confirmada pelo jeito antigo[\s\S]*?Ana Fictícia · 60%[\s\S]*?Bia Fictícia · 40%/);
  assert.match(div, /<details class="fe-div-refazer"><summary>Gravar uma divisão nova nesta O.S\.<\/summary><div id="ficha-divisao"/, 'o componente fica recolhido');
  // A régua é a da Performance: a divisão gravada depois manda, e a participação inválida não confirma.
  const nova = tela({lista: [finalizada({equipe: ['900001', '900002'], alocacao: null, alocacaoLog: [{em: '2026-09-29T10:00:00', acao: 'limpar'}]})], cfg: {performancePCP: {equipes: [], participacoes}}, comPerformance: true});
  nova.abrirOS('f1');
  assert.notEqual(nova.passo('divisao'), t.passo('divisao'), 'a divisão limpa depois não ressuscita a participação velha');
  const torta = [{...participacoes[0], membros: [{chave: '900001', nome: 'Ana Fictícia', percentual: 60}]}];
  const inval = tela({lista: [finalizada()], cfg: {performancePCP: {equipes: [], participacoes: torta}}, comPerformance: true});
  inval.abrirOS('f1');
  assert.equal(inval.passo('divisao'), 'Divisão: divisão a confirmar');
});

/* ───────────── M5 · o Finalizar à mão, sem clique a mais ───────────── */
test('revisão: M5, o Finalizar da Jornada fica (44 px) com o resumo do checklist; o do Fechamento vem antes do checklist', () => {
  const t = tela({lista: [osPronta()]});
  t.abrirOS('f1', 'exec');
  const jornada = t.secoes().jornada;
  // Caso ruim: o botão de 38 px não dizia nada do checklist, que só existia no Fechamento.
  assert.match(jornada, /id="btn-finalizar">🏁 Finalizar instalação<\/button>\s*<div class="fe-fin-resumo" id="fe-fin-jornada"[^>]*><p class="fe-fin-faltas">Pronta para finalizar\.<\/p>\s*<p class="fe-ck-mini">Checklist de fechamento: faltam 2 itens, no Fechamento\. Não impede finalizar\./);
  const css = ler('styles.css');
  assert.match(css, /#btn-finalizar \{ min-height: 44px; \}/);
  // No Fechamento, o Finalizar vem primeiro (à vista sem rolar) e o checklist depois.
  const fech = t.secoes().fechamento;
  assert.ok(fech.indexOf('data-fech-finalizar') < fech.indexOf('Checklist de fechamento</h4>'), 'o botão antes do checklist');
  // Finalizar pela Jornada continua num clique e leva ao checklist.
  t.run(`perguntarRetrabalho = (d, fn) => fn(); finalizarComSaldo = (os, fn) => fn('manter');`);
  t.run(`finalizarDaFicha(false)`);
  assert.ok(t.run('_modalDraft.finalizadaEm'), 'finalizou');
  assert.deepEqual(t.visivel(), ['fechamento'], 'e o checklist fica à vista');
});

/* ───────────── B1 · o stepper não pula ───────────── */
test('revisão: B1, o "Ir para" do próximo passo guarda o lugar na própria etapa: a caixa não muda de altura', () => {
  const t = tela({lista: [osBase({confirmacao: ''})]});
  t.abrirOS('f1', 'pcp');
  assert.equal(t.run('proximoPasso(_modalDraft).acao'), 'confirmar', 'premissa: o próximo passo é da Equipe');
  t.run('closeModal()');
  t.abrirOS('f1', 'agenda');
  // Caso ruim: na etapa do próximo passo o botão sumia, e a caixa encolhia 28 px (50 px a 375).
  assert.match(t.html(), /<button type="button" class="btn-ghost btn-sm fe-ir fe-invisivel" id="fe-ir-pp" data-ir-etapa="equipe" data-ir-foco="titulo" aria-hidden="true" tabindex="-1">Ir para Equipe<\/button>/);
  const ir = t.el('fe-ir-pp');
  t.run(`irParaEtapaFicha('dados')`);
  assert.equal(ir.classList.contains('fe-invisivel'), false, 'fora da etapa, o botão aparece no mesmo lugar');
  assert.equal(ir.getAttribute('aria-hidden'), null);
  t.run(`irParaEtapaFicha('equipe')`);
  assert.equal(ir.classList.contains('fe-invisivel'), true);
  assert.equal(ir.getAttribute('tabindex'), '-1');
  assert.match(ler('styles.css'), /\.fe-invisivel \{ visibility: hidden; \}/);
});

/* ───────────── B2 · textos que citam blocos que não existem mais ───────────── */
test('revisão: B2, os textos citam etapas, não blocos, e sem travessão', () => {
  const t = tela({lista: [osBase({whatsapp: ''})]});
  t.abrirOS('f1', 'agenda');
  const eq = t.secoes().equipe;
  // Caso ruim: "⚠ sem WhatsApp — preencha no bloco 1 · PCP".
  assert.doesNotMatch(eq, /bloco 1|sem WhatsApp —/);
  assert.match(eq, /⚠ sem WhatsApp: preencha na etapa Dados/);
  // A etapa é numerada no título; o bloco, não.
  assert.match(eq, /Etapa 2 de 5: Equipe<\/h3>\s*<details class="card-fs[^"]*" data-bloco="agenda">\s*<summary>Agendamento &amp; Confirmação /);
  // O selo da finalizada também sem travessão no meio da frase.
  const f = tela({lista: [finalizada()]});
  f.abrirOS('f1');
  assert.match(f.html(), /\. Somente leitura\.<\/span>/);
  assert.doesNotMatch(f.html(), / — somente leitura/);
});

/* ───────────── B3 · o rótulo do checklist ───────────── */
test('revisão: B3, a O.S. aberta diz "Falta" (não "pendente para a pontuação") e a cancelada não manda ir a lugar nenhum', () => {
  const t = tela({lista: [osBase({confirmacao: 'Confirmado', confEm: HOJE + 'T07:00:00'})]});
  t.abrirOS('f1', 'fechamento');
  const fech = t.secoes().fechamento;
  // Caso ruim: a O.S. que nem saiu já dizia "Fica pendente para a pontuação".
  assert.doesNotMatch(fech, /pendente para a pontua/i);
  const retr = doChecklist(fech, 'Retrabalho');
  assert.match(retr.html, /<strong>Retrabalho<\/strong>: <span class="fe-ck-selo">Falta<\/span> responder se gerou retrabalho\.<span class="fe-ck-efeito">A pergunta vem ao finalizar\. Não impede finalizar\.<\/span>/);
  // A cancelada pela gestão (o S16B da prévia): nenhum "Ir para Jornada" no checklist.
  const c = tela({lista: [osBase({cancelamento: {ativo: true, motivo: 'Cliente desistiu do pedido fictício', por: 'Gestor Fictício', em: HOJE + 'T09:00:00'}})]});
  c.abrirOS('f1');
  const cf = c.secoes().fechamento.split('id="fe-status"')[0];
  assert.equal((cf.match(/Ir para/g) || []).length, 0);
  assert.doesNotMatch(cf, /Falta|pendente/);
});

/* ───────────── B4 · o que impede finalizar e o que só falta completar ───────────── */
test('revisão: B4, o stepper separa o que impede finalizar do que só falta completar; a finalizada não diz "incompleta"', () => {
  const t = tela({lista: [osBase({responsavelPCP: '', confirmacao: 'Confirmado', confEm: HOJE + 'T07:00:00', itens: [{uid: 'f1:1:1', item: '1', descricao: 'Placa fictícia', qtde: '1', pronto: false}]})]});
  t.abrirOS('f1', 'exec');
  // Caso ruim: Dados "faltam 2", com o mesmo amarelo da Jornada, sem nada impedir finalizar.
  assert.equal(t.passo('dados'), 'Dados: 2 itens a completar; não impede finalizar');
  assert.match(t.html(), /class="fe-passo fe-neutro" data-ir-etapa="dados"[^>]*><span class="fe-marca" aria-hidden="true">·<\/span><span class="fe-nome" aria-hidden="true">Dados<\/span><span class="fe-prog" aria-hidden="true">a completar<\/span>/);
  assert.match(t.passo('jornada'), /^Jornada: \d+ pendências impedem finalizar$/);
  assert.match(t.html(), /class="fe-passo fe-falta" data-ir-etapa="jornada"/);
  // Na finalizada, Dados e Equipe não dizem "incompleta" sem dizer o quê.
  const f = tela({lista: [finalizada({responsavelPCP: '', confirmacao: '', retornoConf: VOLTA_OK, retrabalhoPerguntado: RESPONDIDO_NAO})]});
  f.abrirOS('f1');
  assert.doesNotMatch(f.html(), /incompleta/);
  assert.equal(f.passo('dados'), 'Dados: O.S. finalizada');
});

/* ───────────── B5 · a retirada pronta abre no Fechamento ───────────── */
test('revisão: B5, a retirada pronta (cliente retira) abre no Fechamento, onde mora o "Cliente retirou"', () => {
  const t = tela({lista: [osBase({tipo: 'interno', instalacao: {}, equipe: [], veiculo: ''})]});
  t.abrirOS('f1');
  // Caso ruim: abria em Dados, e o próprio próximo passo mandava ir ao Fechamento.
  assert.deepEqual(t.visivel(), ['fechamento']);
  assert.match(t.secoes().fechamento, /id="btn-finalizar-interno" data-fech-finalizar="interno">📦 Cliente retirou: finalizar/);
  // A retirada que ainda espera o PCP abre em Dados, como antes.
  const p = tela({lista: [osBase({tipo: 'interno', instalacao: {}, equipe: [], veiculo: '', liberadoPCP: false})]});
  p.abrirOS('f1');
  assert.deepEqual(p.visivel(), ['dados']);
});

/* ───────────── B6 · as Instruções explicam as etapas ───────────── */
test('revisão: B6, as Instruções explicam a ficha em etapas e onde ficou o Status da entrega', () => {
  const app = ler('app.js');
  const ini = app.indexOf('function abrirInstrucoes()');
  const manual = app.slice(ini, app.indexOf('\n}', ini));
  // Caso ruim: o manual não falava das etapas, do checklist nem de onde foram o Status da entrega e o Cancelar.
  assert.match(manual, /<h2>A ficha em etapas<\/h2>/);
  for (const e of ['Dados', 'Equipe', 'Divisão', 'Jornada', 'Fechamento']) assert.match(manual, new RegExp(`<strong>${e}:</strong>`), e);
  assert.match(manual, /<strong>Fechamento:<\/strong>[^<]*o Finalizar, o checklist de fechamento, a Exceção de encerramento e o <strong>Status da entrega<\/strong>/);
  assert.match(manual, /<em>Cancelar O\.S\.<\/em>/);
  assert.match(manual, /O selo do status no alto da ficha é um atalho/);
  assert.match(manual, /checklist de fechamento<\/strong> não trava o Finalizar/);
  assert.doesNotMatch(manual, /Divisão da equipe<\/strong>, só da gestão/, 'o fluxo típico já fala da etapa');
});

/* ───────────── B7 · o "Ir para" do Finalizar numa linha própria ───────────── */
test('revisão: B7, o "Ir para" da lista do Finalizar fica numa linha própria, fora do texto', () => {
  const t = tela({lista: [osPronta({fotosRetornoIds: [], horaRetorno: '', retornoEm: ''})]});
  t.abrirOS('f1', 'fechamento');
  const li = /<ul class="fe-faltas"><li>([\s\S]*?)<\/li>/.exec(t.secoes().fechamento)[1];
  // Caso ruim: o botão de 44 px no meio da linha abria um vão entre a 2ª e a 3ª linha do texto.
  assert.match(li, /^<span><strong>Jornada:<\/strong> [^<]*\.<\/span><button type="button" class="btn-ghost btn-sm fe-ir" data-ir-etapa="jornada"/);
  assert.match(ler('styles.css'), /\.fe-faltas li \{[^}]*display: flex; flex-direction: column;/);
});

/* ───────────── B8 · contraste ───────────── */
test('revisão: B8, o texto do stepper e do checklist tem contraste de 4,5:1 ou mais (no branco e no passo atual)', () => {
  const css = ler('styles.css');
  const vars = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map(m => [m[1], m[2]]));
  const cor = sel => {
    const m = new RegExp(`(?:^|\\n|\\})\\s*${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css);
    assert.ok(m, sel);
    const v = /(?:^|;|\s)color:\s*([^;]+);/.exec(m[1]);
    const val = v[1].trim();
    return /^var\(--([\w-]+)\)$/.test(val) ? vars[/^var\(--([\w-]+)\)$/.exec(val)[1]] : val;
  };
  const L = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const razao = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  // Caso ruim: o "ok" verde (#16a34a) dava 3,30:1 no branco e 3,03:1 no passo atual; o cinza, 4,37:1 no passo atual.
  for (const sel of ['.fe-ok .fe-prog', '.fe-prog', '.fe-falta .fe-prog, .fe-aviso .fe-prog', '.fe-erro .fe-prog', '.fe-ck-efeito', '.fe-dica']) {
    for (const fundo of ['#ffffff', '#eff6ff']) assert.ok(razao(cor(sel), fundo) >= 4.5, `${sel} ${cor(sel)} sobre ${fundo}: ${razao(cor(sel), fundo).toFixed(2)}`);
  }
});

/* ───────────── B9 · o retorno previsto não é obrigatório ───────────── */
test('revisão: B9, a Equipe fica "ok" sem o retorno previsto, com a dica do que se perde', () => {
  const t = tela({lista: [osBase({confirmacao: 'Confirmado', confEm: HOJE + 'T07:00:00'})]});
  t.abrirOS('f1', 'agenda');
  // Caso ruim: nada perto do campo dizia o que a falta da hora custa.
  assert.match(t.secoes().equipe, /id="rp-rodape-2026-10-05"><p class="fe-dica">Sem retorno previsto: o retorno antecipado não é medido\.<\/p><\/div>/);
  // Decisão do dono: não é obrigatório; a Equipe fica "ok" e o checklist não cobra.
  assert.equal(t.passo('equipe'), 'Equipe: completa');
  assert.doesNotMatch(t.secoes().fechamento.split('id="fe-status"')[0], /retorno previsto/i, 'o checklist não cobra');
  // Digitado, a dica sai.
  const d = tela({lista: [osBase({confirmacao: 'Confirmado', confEm: HOJE + 'T07:00:00', retornoPrevisto: [{dia: HOJE, hora: '17:00', por: 'Gestor Fictício', em: HOJE + 'T07:00:00'}]})]});
  d.abrirOS('f1', 'agenda');
  assert.doesNotMatch(d.secoes().equipe, /Sem retorno previsto: o retorno antecipado não é medido/);
});
