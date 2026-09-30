/* F13 (30/09/2026): o "Lançar entrega" antes e depois de a parte que grava
   virar aplicarLancamento, para o lote do Fechar o dia (F14) usar a mesma
   regra.

   PRIMEIRO, A CARACTERIZAÇÃO: os testes da primeira parte foram escritos e
   rodados contra o código de antes da extração (main cac2272) e passaram lá.
   Eles fixam o que o Lançar entrega FAZ, não o que deveria fazer: nenhuma
   asserção foi mudada depois da extração. A pergunta do retrabalho é a de
   verdade (app.js), com o teste tocando os botões que a pessoa tocaria.

   DOM falso e dados fictícios: o repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const js = x => JSON.parse(JSON.stringify(x));
const HOJE = '2026-10-05';
const AGORA = HOJE + 'T12:00:00Z';

const ELENCO = {pessoas: [
  {chave: 'adriano-f', id: '100001', nome: 'Adriano Fictício Souza', apelido: 'adriano', area: 'Montagem', ativo: true},
  {chave: 'bia-f', id: '100002', nome: 'Bia Fictícia', apelido: 'bia', area: 'Montagem', ativo: true},
  {chave: 'caio-f', id: '100003', nome: 'Caio Fictício', apelido: 'caio', area: 'Montagem', ativo: true},
  {chave: 'eva-f', id: '100005', nome: 'Eva Fictícia', apelido: 'eva', area: 'Montagem', ativo: true},
], antigos: [], ferias: [], ausencias: [], fichaRH: true};
const EQUIPES = [
  {id: 'eq-aguia', nome: 'Águia', animal: 'aguia', cor: 'marinho', liderPadraoId: '100001', membros: [{chave: '100001', nome: 'Adriano'}, {chave: '100002', nome: 'Bia'}], ativo: true},
  {id: 'eq-leao', nome: 'Leão', animal: 'leao', cor: 'laranja', liderPadraoId: '100005', membros: [{chave: '100005', nome: 'Eva'}, {chave: '100003', nome: 'Caio'}], ativo: true},
];
// Divisão gravada da equipe Leão (Eva líder 60, Caio 40), com o carimbo de quem gravou.
const DIVISAO_LEAO = () => ({grupos: [{equipeId: 'eq-leao', cota: 10000, liderId: '100005', membros: [
  {pessoaId: '100005', papel: 'lider', freelancer: false, cota: 6000}, {pessoaId: '100003', papel: 'ajudante', freelancer: false, cota: 4000}]}],
manual: false, final: [{pessoaId: '100005', cota: 6000}, {pessoaId: '100003', cota: 4000}], em: '2026-10-01T10:00:00Z'});
const escH = s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[ch]));
// Baixa do ERP a lançar: finalizada pelo Mubisys em 02/10.
const osBase = (extra = {}) => ({id: 'o1', numero: '8001', tipo: 'externo', cliente: 'Cliente Fictício', servico: 'Fachada', liberadoPCP: true, equipe: [],
  instalacao: {data: '2026-10-02', periodo: 'Manhã', duracaoDias: 1}, veiculo: 'Carro 1', valorTotal: 5000, rev: 3,
  finalizadaEm: '2026-10-02T18:00:00', finalizadoPor: 'Mubisys (auto)', baixaAutoERP: {em: '2026-10-02T18:00:00', status: 'ENTREGUE'}, ...extra});

/* A tela da gestão num contexto isolado: operacao, divisao, regras,
   performance, o componente, o casa.js e, do app.js, o seletor de pessoas, os
   rótulos da volta e a pergunta do retrabalho. O STORE é de mentira e guarda
   uma cópia de cada gravação. Cada createElement vira um elemento falso cujos
   filhos (querySelector) nascem na primeira procura e ficam os mesmos. */
function tela({lista = [], papel = 'pcp', confirmar = () => true} = {}) {
  const cfg = {instaladores: ['Adriano'], vinculosRH: [], performancePCP: {equipes: js(EQUIPES), participacoes: []}};
  const salvos = [], toasts = [], perguntas = [], criados = [], dom = {};
  const contagem = {pinturas: 0};
  const elemento = () => {
    const filhos = new Map();
    const el = {innerHTML: '', style: {}, hidden: false, removido: false, dataset: {}, __valores: null,
      querySelector: sel => { if (!filhos.has(sel)) filhos.set(sel, elemento()); return filhos.get(sel); },
      querySelectorAll: () => [], remove() { el.removido = true; }, focus() {}};
    return el;
  };
  const IDS = new Set(['lancar-form', 'lancar-x', 'lancar-aloc']);
  const STORE = {getCFG: () => cfg, saveCFG() {}, getAllOS: () => lista, getOS: id => lista.find(o => o.id === id) || null,
    saveOS: o => { salvos.push(js(o)); const i = lista.findIndex(x => x.id === o.id); if (i >= 0) lista[i] = o; else lista.push(o); },
    elenco: () => ELENCO, getQueue: () => [], trySync: async () => {}, on() {}, onConflict() {}, regrasLocais: () => null, valores: () => ({}),
    pullPhoto: async () => null, uuid: () => 'u1'};
  const c = {STORE, STATE: {user: {papel, nome: 'Gestor Teste'}}, console, setTimeout, clearTimeout, navigator: {onLine: true},
    Date: class extends Date { constructor(...a) { super(...(a.length ? a : [HOJE + 'T12:00:00'])); } static now() { return +new Date(HOJE + 'T12:00:00'); } },
    esc: escH, toast: (m, t) => toasts.push([m, t]), confirm: m => { perguntas.push(m); return confirmar(m); },
    localStorage: {getItem: () => null, setItem() {}, removeItem() {}},
    document: {getElementById: id => IDS.has(id) ? (dom[id] || (dom[id] = elemento())) : null, querySelector: () => null, querySelectorAll: () => [],
      createElement: () => { const e = elemento(); criados.push(e); return e; }, body: {appendChild() {}, classList: {add() {}, remove() {}, contains: () => false}}},
    // O FormData lê o que o teste pôs no formulário (`__valores`), como a tela leria dos campos.
    FormData: class { constructor(form) { this.v = (form && form.__valores) || {}; }
      get(k) { const x = this.v[k]; return x == null ? null : Array.isArray(x) ? (x[0] ?? null) : x; }
      getAll(k) { const x = this.v[k]; return x == null ? [] : Array.isArray(x) ? x : [x]; } },
    emptyState: () => '', bindCardClicks() {}, fmtInstalacao: () => '', filtroPeriodoHTML: () => '',
    hojeISO: () => HOJE, nowISO: () => AGORA, voltaEquipeHTML: () => '<div class="volta-equipe">registro da equipe</div>',
    registrarRemarcacao() {}, __contagem: contagem};
  vm.createContext(c);
  for (const f of ['operacao.js', 'divisao.js', 'regras.js', 'performance.js', 'alocacao-ui.js', 'casa.js']) vm.runInContext(ler(f), c, {filename: f});
  const app = ler('app.js');
  const trecho = (de, ate) => { const i = app.indexOf(de), j = app.indexOf(ate, i); assert.ok(i >= 0 && j > i, 'trecho do app.js: ' + de); return app.slice(i, j); };
  vm.runInContext(trecho('const $  = ', 'const $$ = '), c, {filename: 'app.js ($)'});
  vm.runInContext(trecho('const RH_CONTRATOS_FREELANCER', '/* `marcadosAgora` e `novas`'), c, {filename: 'app.js (seletor)'});
  vm.runInContext(trecho('const VOLTA_ROTULO', '// Rótulo curto dos selos'), c, {filename: 'app.js (volta)'});
  vm.runInContext(trecho('const ETAPAS_ORIGEM', 'function validarFinalizacao'), c, {filename: 'app.js (retrabalho)'});
  // A repintura da aba Entregas (declarada no casa.js) só conta.
  vm.runInContext('renderEntregas = () => { __contagem.pinturas++; }', c);
  return {c, A: vm.runInContext('ALOCUI', c), run: code => vm.runInContext(code, c), el: id => c.document.getElementById(id),
    cfg, salvos, toasts, perguntas, criados, lista, contagem};
}

// Abre o Lançar entrega da O.S. (como o botão da fila, que só passa o id).
function abrir(t, osId = 'o1') {
  t.run(`lancarEntregaManual('${osId}')`);
  const box = t.criados[t.criados.length - 1];
  assert.equal(box.id, 'lancar-box');
  return {box, chave: 'lancar:' + osId};
}
// O Continuar, com o que o formulário tem (a data vem preenchida como na tela).
function continuar(t, valores = {}) {
  const form = t.el('lancar-form');
  form.__valores = {data: '2026-10-02', ...valores};
  form.onsubmit({preventDefault() {}, target: form});
}
// A pergunta do retrabalho de verdade: o teste toca o botão que a pessoa tocaria.
function retrab(t, acao, campos = {}) {
  const box = t.criados[t.criados.length - 1];
  assert.equal(box.id, 'retrab-pergunta', 'a pergunta do retrabalho abriu');
  if (acao === 'nao') box.querySelector('#retrab-nao').onclick();
  else if (acao === 'voltar') box.querySelector('#retrab-voltar').onclick();
  else {
    box.querySelector('#retrab-sim').onclick();
    const f = box.querySelector('#retrab-form');
    f.__valores = campos;
    f.onsubmit({preventDefault() {}});
  }
}
// Abre, (mexe), Continua e responde o retrabalho.
function lancar(t, {osId = 'o1', valores = {}, resposta = 'nao', campos, mexer} = {}) {
  const l = abrir(t, osId);
  if (mexer) mexer(l);
  continuar(t, valores);
  if (resposta) retrab(t, resposta, campos);
  return l;
}
const VOLTA_SIM = {carroLimpo: 'sim', carroArrumado: 'sim', equipamentosOk: 'nao', semAvaria: 'sim'};

/* ═════════════════════ CARACTERIZAÇÃO (escrita antes da extração) ═════════════════════ */

test('caracterização · sem equipe: pergunta antes; "não" não lança nada e nem abre o retrabalho', () => {
  const t = tela({lista: [osBase()], confirmar: () => false});
  const l = abrir(t);
  continuar(t);
  assert.deepEqual(t.perguntas, ['Lançar sem equipe? A entrega não conta para ninguém e a conferência da volta não entra na nota.']);
  assert.equal(t.salvos.length, 0);
  assert.equal(t.criados.length, 1, 'a pergunta do retrabalho não abriu');
  assert.notEqual(l.box.style.display, 'none', 'o formulário continua à vista');
});

test('caracterização · sem equipe: "sim" lança sem equipe e sem divisão', () => {
  const t = tela({lista: [osBase()]});
  const l = lancar(t);
  assert.equal(t.perguntas.length, 1);
  assert.equal(t.salvos.length, 1);
  const g = t.salvos[0];
  assert.deepEqual(g.equipe, []);
  assert.equal(g.alocacao, undefined);
  assert.deepEqual(g.entregaLancada, {em: AGORA, por: 'Gestor Teste', data: '2026-10-02'});
  assert.equal(t.A.estado(l.chave), null, 'o componente é esquecido depois de gravar');
});

test('caracterização · com equipe: não pergunta; a equipe e a divisão gravadas ficam como estavam', () => {
  const t = tela({lista: [osBase({equipe: ['100005', '100003']})]});
  lancar(t);
  assert.equal(t.perguntas.length, 0);
  assert.equal(t.salvos.length, 1, 'uma gravação só');
  assert.deepEqual(t.salvos[0].equipe, ['100005', '100003']);
  assert.equal(t.salvos[0].alocacao, undefined, 'a sugestão que ninguém conferiu não vira divisão gravada');
  // Com divisão gravada e sem mexer: ela fica igual, carimbo incluído.
  const t2 = tela({lista: [osBase({equipe: ['100005', '100003'], alocacao: DIVISAO_LEAO()})]});
  lancar(t2);
  assert.deepEqual(t2.salvos[0].alocacao, DIVISAO_LEAO());
  assert.deepEqual(t2.salvos[0].equipe, ['100005', '100003']);
});

test('caracterização · admin e pcp com divisão: equipe num toque grava a alocação com o equipeId e a equipe derivada', () => {
  for (const papel of ['admin', 'pcp']) {
    const t = tela({papel, lista: [osBase()]});
    const l = lancar(t, {mexer: l => {
      assert.equal(t.A.estado(l.chave).modo, 'divisao', papel);
      assert.equal(t.A.executar(l.chave, {alocAcao: 'equipe', e: 'eq-aguia'}), '');
    }});
    assert.equal(t.perguntas.length, 0, papel);
    assert.equal(t.salvos.length, 1, papel + ': a entrega e a divisão numa gravação só');
    const g = t.salvos[0];
    assert.deepEqual(g.equipe, ['100001', '100002'], papel + ': os.equipe derivada da divisão');
    assert.equal(g.alocacao.grupos.length, 1);
    assert.equal(g.alocacao.grupos[0].equipeId, 'eq-aguia', papel);
    assert.equal(g.alocacao.grupos[0].liderId, '100001');
    assert.deepEqual(g.alocacao.grupos[0].membros.map(m => [m.pessoaId, m.papel, m.cota]), [['100001', 'lider', 6000], ['100002', 'ajudante', 4000]]);
    assert.equal(g.alocacao.manual, false);
    assert.ok(Array.isArray(g.alocacao.final) && g.alocacao.final.length === 2, 'vai com o final calculado');
    assert.equal(g.alocacao.em, undefined, 'divisão nova vai sem em');
    assert.deepEqual(g.entregaLancada, {em: AGORA, por: 'Gestor Teste', data: '2026-10-02'});
    assert.equal(t.A.estado(l.chave), null);
    assert.equal(t.toasts.filter(([, tp]) => tp === 'error').length, 0, papel);
  }
});

test('caracterização · pcp editando a divisão gravada devolve o carimbo dela', () => {
  const t = tela({lista: [osBase({equipe: ['100005', '100003'], alocacao: DIVISAO_LEAO()})]});
  lancar(t, {mexer: l => {
    t.A.executar(l.chave, {alocAcao: 'painel', g: '0'});
    assert.equal(t.A.executar(l.chave, {alocAcao: 'pessoa', p: '100002'}), '');
  }});
  const g = t.salvos[0];
  assert.deepEqual(g.equipe, ['100005', '100003', '100002']);
  assert.equal(g.alocacao.em, '2026-10-01T10:00:00Z');
  assert.equal(g.alocacao.grupos[0].equipeId, 'eq-leao');
  assert.equal(g.alocacao.grupos[0].membros.reduce((s, m) => s + m.cota, 0), 10000);
});

test('caracterização · divisão que não fecha: grava as pessoas e diz o motivo', () => {
  const t = tela({lista: [osBase({equipe: ['100001', '100003']})]});
  lancar(t, {mexer: l => {
    t.A.executar(l.chave, {alocAcao: 'painel', g: '0'});
    assert.equal(t.A.executar(l.chave, {alocAcao: 'pessoa', p: '100002'}), '');
  }});
  const g = t.salvos[0];
  assert.deepEqual(g.equipe, ['100001', '100003', '100002']);
  assert.equal(g.alocacao, undefined);
  assert.deepEqual(t.toasts[0], ['Entrega da O.S 8001 lançada.', 'success']);
  assert.match(t.toasts[1][0], /^A equipe foi gravada, mas a divisão não: Escolha o líder[\s\S]* Complete no Conferir da Performance\.$/);
  assert.equal(t.toasts[1][1], 'error');
});

test('caracterização · equipe mudada no STORE com o modal aberto: a divisão não vai por cima e a entrega é lançada', () => {
  const t = tela({lista: [osBase()]});
  lancar(t, {mexer: l => {
    t.A.executar(l.chave, {alocAcao: 'equipe', e: 'eq-aguia'});
    t.lista[0].equipe = ['100003'];   // outro aparelho, no mesmo objeto do STORE
  }});
  const g = t.salvos[0];
  assert.deepEqual(g.equipe, ['100003']);
  assert.equal(g.alocacao, undefined);
  assert.equal(g.entregaLancada.data, '2026-10-02');
  assert.ok(t.toasts.some(([m, tp]) => /^A equipe desta O\.S\. foi mudada em outro aparelho/.test(m) && tp === 'error'), JSON.stringify(t.toasts));
});

test('caracterização · operação grava só as pessoas, nunca a divisão, e não confere a volta', () => {
  const t = tela({papel: 'operacao', lista: [osBase()]});
  const l = abrir(t);
  assert.equal(t.A.estado(l.chave).modo, 'pessoas');
  assert.doesNotMatch(l.box.innerHTML, /conf-volta-grade/, 'a operação não vê a conferência da volta');
  t.A.executar(l.chave, {alocAcao: 'equipe', e: 'eq-leao'});
  continuar(t, VOLTA_SIM);
  retrab(t, 'nao');
  const g = t.salvos[0];
  assert.deepEqual(g.equipe, ['100005', '100003']);
  assert.equal(g.alocacao, undefined);
  assert.equal(g.retornoConf, undefined, 'nem com o FormData trazendo respostas');
  assert.deepEqual(g.entregaLancada, {em: AGORA, por: 'Gestor Teste', data: '2026-10-02'});
});

test('caracterização · operação mudando a equipe de O.S. com divisão: a divisão fica e a tela avisa', () => {
  const t = tela({papel: 'operacao', lista: [osBase({equipe: ['100005', '100003'], alocacao: DIVISAO_LEAO()})]});
  lancar(t, {mexer: l => {
    assert.equal(t.A.executar(l.chave, {alocAcao: 'painel'}), '');
    assert.equal(t.A.executar(l.chave, {alocAcao: 'pessoa', p: '100002'}), '');
  }});
  const g = t.salvos[0];
  assert.deepEqual(g.equipe, ['100005', '100003', '100002']);
  assert.deepEqual(g.alocacao, DIVISAO_LEAO(), 'a divisão não é tocada pela operação');
  assert.deepEqual(t.toasts[1], ['A equipe mudou: a divisão desta O.S. (líder e percentuais) fica para a gestão refazer.', 'error']);
});

test('caracterização · volta: resposta igual à gravada não recarimba; nada respondido não cria a conferência', () => {
  const rc = {...VOLTA_SIM, por: 'Conferente Antigo', em: '2026-10-02T20:00:00Z'};
  const t = tela({lista: [osBase({equipe: ['100005'], retornoConf: {...rc}})]});
  const l = abrir(t);
  assert.match(l.box.innerHTML, /<select name="equipamentosOk">[^]*?<option value="nao" selected>Não<\/option>/, 'a tela mostra o que está gravado');
  continuar(t, VOLTA_SIM);
  retrab(t, 'nao');
  assert.deepEqual(t.salvos[0].retornoConf, rc, 'nem por, nem em mudaram');
  // Nunca conferida e o formulário em branco: a O.S. continua sem retornoConf.
  const t2 = tela({lista: [osBase({equipe: ['100005']})]});
  lancar(t2, {valores: {carroLimpo: '', carroArrumado: '', equipamentosOk: '', semAvaria: ''}});
  assert.equal(t2.salvos[0].retornoConf, undefined);
});

test('caracterização · volta: resposta mudada recarimba com quem lançou; apagar todas tira o carimbo', () => {
  const rc = {...VOLTA_SIM, por: 'Conferente Antigo', em: '2026-10-02T20:00:00Z', obs: 'fica'};
  const t = tela({lista: [osBase({equipe: ['100005'], retornoConf: {...rc}})]});
  lancar(t, {valores: {...VOLTA_SIM, semAvaria: 'nao'}});
  assert.deepEqual(t.salvos[0].retornoConf, {...VOLTA_SIM, semAvaria: 'nao', obs: 'fica', por: 'Gestor Teste', em: AGORA});
  // Primeira conferência, uma pergunta só: as outras vão vazias.
  const t2 = tela({lista: [osBase({equipe: ['100005']})]});
  lancar(t2, {valores: {carroLimpo: 'sim'}});
  assert.deepEqual(t2.salvos[0].retornoConf, {carroLimpo: 'sim', carroArrumado: '', equipamentosOk: '', semAvaria: '', por: 'Gestor Teste', em: AGORA});
  // Apagar todas as respostas: fica sem quem e sem quando.
  const t3 = tela({lista: [osBase({equipe: ['100005'], retornoConf: {...rc}})]});
  lancar(t3, {valores: {carroLimpo: '', carroArrumado: '', equipamentosOk: '', semAvaria: ''}});
  assert.deepEqual(t3.salvos[0].retornoConf, {carroLimpo: '', carroArrumado: '', equipamentosOk: '', semAvaria: '', obs: 'fica', por: '', em: ''});
  // Fixa o de hoje: valor antigo true/false conta como diferente de 'sim'/'nao' e recarimba.
  const t4 = tela({lista: [osBase({equipe: ['100005'], retornoConf: {carroLimpo: true, por: 'Conferente Antigo', em: '2026-10-02T20:00:00Z'}})]});
  lancar(t4, {valores: {carroLimpo: 'sim'}});
  assert.deepEqual(t4.salvos[0].retornoConf, {carroLimpo: 'sim', carroArrumado: '', equipamentosOk: '', semAvaria: '', por: 'Gestor Teste', em: AGORA});
});

test('caracterização · retrabalho Sim: grava os cinco campos e o carimbo junto com a entrega', () => {
  const t = tela({lista: [osBase({equipe: ['100005']})]});
  lancar(t, {resposta: 'sim', campos: {problema: '  Placa fora de prumo ', etapaOrigem: 'Instalação', causaRaiz: 'Erro humano', responsavelEtapa: 'Montagem', dataRetrabalho: '2026-10-03'}});
  assert.equal(t.salvos.length, 1);
  const g = t.salvos[0];
  assert.equal(g.retrabalho, true);
  assert.equal(g.problema, 'Placa fora de prumo');
  assert.equal(g.etapaOrigem, 'Instalação');
  assert.equal(g.causaRaiz, 'Erro humano');
  assert.equal(g.responsavelEtapa, 'Montagem');
  assert.equal(g.dataRetrabalho, '2026-10-03');
  assert.deepEqual(g.retrabalhoPerguntado, {em: AGORA, por: 'Gestor Teste', resposta: 'sim'});
  assert.deepEqual(g.entregaLancada, {em: AGORA, por: 'Gestor Teste', data: '2026-10-02'});
  // Faltando um campo: a pergunta segura e nada é lançado.
  const t2 = tela({lista: [osBase({equipe: ['100005']})]});
  lancar(t2, {resposta: 'sim', campos: {problema: 'x', etapaOrigem: 'Arte', causaRaiz: '', responsavelEtapa: 'Arte', dataRetrabalho: '2026-10-03'}});
  assert.equal(t2.salvos.length, 0);
  assert.deepEqual(t2.toasts, [['Preencha os cinco campos do retrabalho.', 'error']]);
});

test('caracterização · retrabalho Não: carimba; numa O.S. marcada, desmarca depois de confirmar', () => {
  const t = tela({lista: [osBase({equipe: ['100005']})]});
  lancar(t);
  assert.deepEqual(t.salvos[0].retrabalhoPerguntado, {em: AGORA, por: 'Gestor Teste', resposta: 'nao'});
  assert.equal(t.salvos[0].retrabalho, undefined, 'O.S. sem marca: só o carimbo');
  const marcada = () => osBase({equipe: ['100005'], retrabalho: true, problema: 'Letra caiu', etapaOrigem: 'Produção', causaRaiz: 'Material',
    responsavelEtapa: 'Produção', dataRetrabalho: '2026-10-01', checkout: {situacao: 'Retrabalho', obs: 'fica'}});
  const t2 = tela({lista: [marcada()]});
  lancar(t2);
  assert.match(t2.perguntas[0], /^Esta O\.S\. está marcada como retrabalho\. Responder Não desmarca o retrabalho\./);
  const g = t2.salvos[0];
  assert.equal(g.retrabalho, false);
  assert.deepEqual([g.problema, g.etapaOrigem, g.causaRaiz, g.responsavelEtapa], ['', '', '', '']);
  assert.equal(g.dataRetrabalho, '2026-10-01', 'a data do retrabalho fica');
  assert.deepEqual(g.checkout, {situacao: '', obs: 'fica'});
  assert.deepEqual(g.retrabalhoPerguntado, {em: AGORA, por: 'Gestor Teste', resposta: 'nao'});
  // Não confirmou: nada foi lançado e a marca continua.
  const t3 = tela({lista: [marcada()], confirmar: () => false});
  lancar(t3);
  assert.equal(t3.salvos.length, 0);
  assert.equal(t3.lista[0].retrabalho, true);
  assert.deepEqual(t3.lista[0].checkout, {situacao: 'Retrabalho', obs: 'fica'});
});

test('caracterização · "Voltar ao lançamento" devolve o formulário como estava e não grava', () => {
  const t = tela({lista: [osBase({equipe: ['100005']})]});
  const l = abrir(t);
  t.A.executar(l.chave, {alocAcao: 'painel'});
  t.A.executar(l.chave, {alocAcao: 'pessoa', p: '100003'});
  continuar(t);
  assert.equal(l.box.style.display, 'none', 'o formulário fica escondido durante a pergunta');
  retrab(t, 'voltar');
  assert.equal(t.salvos.length, 0);
  assert.equal(l.box.style.display, '');
  assert.equal(t.A.estado(l.chave).tocado, true, 'a equipe mexida continua no componente');
  // E o segundo Continuar lança com o que estava.
  continuar(t);
  retrab(t, 'nao');
  assert.equal(t.salvos.length, 1);
  assert.deepEqual(t.salvos[0].equipe, ['100005', '100003']);
});

test('caracterização · o × fecha sem gravar e esquece o componente', () => {
  const t = tela({lista: [osBase()]});
  const l = abrir(t);
  t.el('lancar-x').onclick();
  assert.equal(l.box.removido, true);
  assert.equal(t.A.estado(l.chave), null);
  assert.equal(t.salvos.length, 0);
});

test('caracterização · a O.S. é relida do STORE pelo id: a fila desenhada antes do último sync não manda', () => {
  const velha = osBase({equipe: ['100005'], rev: 3});
  const t = tela({lista: [velha]});
  // O sync troca o objeto da O.S. depois que a fila foi desenhada (o botão só guarda o id).
  t.lista[0] = {...js(velha), rev: 4, obs: 'veio do outro aparelho', fotosRetornoIds: ['f1']};
  lancar(t);
  const g = t.salvos[0];
  assert.equal(g.rev, 4);
  assert.equal(g.obs, 'veio do outro aparelho');
  assert.deepEqual(g.fotosRetornoIds, ['f1']);
  assert.ok(g.entregaLancada);
});

test('caracterização · com o modal aberto: o que o STORE muda no próprio objeto vai junto; objeto trocado não (o rev velho vira conflito no servidor)', () => {
  // O store conserta a cópia no lugar (repor do servidor, tirar marcas): vai junto.
  const t = tela({lista: [osBase({equipe: ['100005'], rev: 4})]});
  lancar(t, {mexer: () => { t.lista[0].fotosRetornoIds = ['f9']; }});
  assert.deepEqual(t.salvos[0].fotosRetornoIds, ['f9']);
  /* O pull troca o objeto inteiro: a gravação sai sobre a versão que abriu,
     com o rev dela, e o servidor responde com o aviso de conflito. É o de
     hoje e fica assim: reler aqui passaria por cima da trava do rev e poderia
     apagar a conferência da volta que o outro aparelho gravou. */
  const t2 = tela({lista: [osBase({equipe: ['100005'], rev: 4})]});
  lancar(t2, {mexer: () => { t2.lista[0] = {...js(t2.lista[0]), rev: 5, obs: 'outra versão'}; }});
  assert.equal(t2.salvos[0].rev, 4);
  assert.equal(t2.salvos[0].obs, undefined);
});

test('caracterização · entregaLancada carimbada: a data do formulário, quem lançou e quando; o aviso e a repintura', () => {
  const t = tela({lista: [osBase({equipe: ['100005']})]});
  const l = abrir(t);
  assert.match(l.box.innerHTML, /<input name="data" type="date" required value="2026-10-02">/, 'a data parte da baixa do ERP');
  assert.match(l.box.innerHTML, /O ERP baixou em 02\/10\./);
  continuar(t, {data: '2026-10-01'});
  retrab(t, 'nao');
  const g = t.salvos[0];
  assert.deepEqual(g.entregaLancada, {em: AGORA, por: 'Gestor Teste', data: '2026-10-01'});
  assert.equal(g.atualizadoEm, AGORA);
  assert.equal(g.atualizadoPor, 'Gestor Teste');
  assert.equal(g.finalizadaEm, '2026-10-02T18:00:00', 'a baixa do ERP fica como estava');
  assert.deepEqual(t.toasts, [['Entrega da O.S 8001 lançada.', 'success']]);
  assert.equal(t.contagem.pinturas, 1);
  assert.equal(l.box.removido, true);
  // Sem a data da baixa, o formulário parte de hoje.
  const t2 = tela({lista: [osBase({finalizadaEm: ''})]});
  assert.match(abrir(t2).box.innerHTML, new RegExp(`name="data" type="date" required value="${HOJE}"`));
  // Lançar de novo troca o lançamento inteiro.
  const t3 = tela({lista: [osBase({equipe: ['100005'], entregaLancada: {em: '2026-10-03T09:00:00Z', por: 'Outra Pessoa', data: '2026-09-30'}})]});
  lancar(t3);
  assert.deepEqual(t3.salvos[0].entregaLancada, {em: AGORA, por: 'Gestor Teste', data: '2026-10-02'});
});

test('caracterização · data fora do período da tela grava como foi digitada, sem aviso; data inválida não lança', () => {
  const t = tela({lista: [osBase({equipe: ['100005']})]});
  t.run(`STATE._fEnt = {de: '2026-10-01', ate: '2026-10-05'}`);
  lancar(t, {valores: {data: '2026-08-15'}});
  assert.equal(t.salvos[0].entregaLancada.data, '2026-08-15');
  assert.deepEqual(t.perguntas, []);
  assert.deepEqual(t.toasts, [['Entrega da O.S 8001 lançada.', 'success']]);
  for (const data of ['', '2026-02-30', 'amanhã']) {
    const t2 = tela({lista: [osBase({equipe: ['100005']})]});
    abrir(t2);
    continuar(t2, {data});
    assert.equal(t2.salvos.length, 0, JSON.stringify(data));
    assert.deepEqual(t2.toasts, [['Informe a data da entrega.', 'error']]);
    assert.equal(t2.criados.length, 1, 'nem abre a pergunta do retrabalho');
  }
});

test('caracterização · O.S. interna: sem conferência da volta, sem "Lançar sem equipe?", só pessoas', () => {
  const t = tela({lista: [osBase({tipo: 'interno'})]});
  const l = abrir(t);
  assert.doesNotMatch(l.box.innerHTML, /conf-volta-grade/);
  assert.doesNotMatch(l.box.innerHTML, /registrou a limpeza|registro da equipe/, 'nem o registro da equipe');
  assert.equal(t.A.estado(l.chave).modo, 'pessoas', 'cliente retira não tem divisão');
  continuar(t, VOLTA_SIM);
  retrab(t, 'nao');
  assert.deepEqual(t.perguntas, []);
  const g = t.salvos[0];
  assert.deepEqual(g.equipe, []);
  assert.equal(g.retornoConf, undefined);
  assert.equal(g.alocacao, undefined);
  assert.deepEqual(g.entregaLancada, {em: AGORA, por: 'Gestor Teste', data: '2026-10-02'});
  assert.deepEqual(g.retrabalhoPerguntado, {em: AGORA, por: 'Gestor Teste', resposta: 'nao'});
});

/* ═════════════════════ aplicarLancamento, direto (a base do lote da F14) ═════════════════════
   Escritos depois da extração. O lote chama a mesma função O.S. por O.S.,
   sobre a versão que acabou de reler do STORE. */
const ENTRADA = () => ({data: '2026-10-02', em: '2026-10-05T15:00:00Z', por: 'Lote Teste', pessoas: ['100005', '100003'],
  respostasVolta: {...VOLTA_SIM}, retrabalho: {resposta: 'nao'}});
const SIM = {resposta: 'sim', problema: 'Letra solta', etapaOrigem: 'Produção', causaRaiz: 'Material', responsavelEtapa: 'Produção', dataRetrabalho: '2026-10-03'};
// A função do contexto, com o resultado trazido para cá (JSON, como o STORE guardaria).
const apl = t => (os, e) => js(t.run('aplicarLancamento')(os, e));

test('aplicarLancamento · duas vezes seguidas com a mesma entrada dá o mesmo resultado, sem mexer no que recebeu', () => {
  const t = tela();
  const os = osBase({equipe: ['100005'], retornoConf: {carroLimpo: 'nao', por: 'Antigo', em: '2026-10-02T20:00:00Z'}, checkout: {situacao: 'Finalizado'}});
  const foto = js(os);
  const e = ENTRADA();
  const r1 = apl(t)(os, e), r2 = apl(t)(os, e);
  assert.deepEqual(r1, r2);
  assert.deepEqual(js(os), foto, 'a O.S. que entrou não mudou');
  assert.deepEqual(e, ENTRADA(), 'nem a entrada');
  assert.notEqual(t.run('aplicarLancamento')(os, e), os, 'devolve outro objeto');
  assert.deepEqual(r1.entregaLancada, {em: '2026-10-05T15:00:00Z', por: 'Lote Teste', data: '2026-10-02'});
  assert.deepEqual([r1.atualizadoEm, r1.atualizadoPor], ['2026-10-05T15:00:00Z', 'Lote Teste']);
  assert.deepEqual(r1.equipe, ['100005', '100003']);
  assert.deepEqual(r1.retornoConf, {...VOLTA_SIM, por: 'Lote Teste', em: '2026-10-05T15:00:00Z'});
  assert.deepEqual(r1.retrabalhoPerguntado, {em: '2026-10-05T15:00:00Z', por: 'Lote Teste', resposta: 'nao'});
  // Aplicada de novo sobre o próprio resultado, não muda nada: o lote pode repetir uma linha sem recarimbar.
  assert.deepEqual(apl(t)(r1, e), r1);
  // Com Sim e com a divisão, também.
  const e2 = {...ENTRADA(), pessoas: undefined, alocacao: DIVISAO_LEAO(), retrabalho: {...SIM}};
  const s1 = apl(t)(os, e2);
  assert.deepEqual(apl(t)(os, e2), s1);
  assert.deepEqual(apl(t)(s1, e2), s1);
  assert.deepEqual(s1.alocacao, DIVISAO_LEAO());
  assert.deepEqual(s1.equipe, ['100005', '100003'], 'a equipe sai da divisão');
  assert.equal(s1.retrabalho, true);
  // Numa O.S. marcada, o Não desmarca a nova e deixa a recebida como estava, checkout incluído.
  const m = osBase({retrabalho: true, problema: 'Letra caiu', checkout: {situacao: 'Retrabalho'}});
  const fm = js(m);
  const rm = apl(t)(m, {data: '2026-10-02', retrabalho: {resposta: 'nao'}});
  assert.equal(rm.retrabalho, false);
  assert.deepEqual(rm.checkout, {situacao: ''});
  assert.deepEqual(js(m), fm);
});

test('aplicarLancamento · não perde campo que chegou por fora: só os campos do lançamento mudam', () => {
  const t = tela();
  const os = osBase({equipe: ['100005'], rev: 9, fotosRetornoIds: ['f1', 'f2'], campoNovoDoServidor: {qualquer: [1, 2]},
    itens: [{uid: 'i1', descricao: 'Placa', entregas: [{id: 'e1', quantidade: 1}]}], alocacaoLog: [{em: '2026-10-01T10:00:00Z'}],
    voltaEquipe: {carroLimpo: 'sim'}, retornoConf: {...VOLTA_SIM, por: 'Outro Aparelho', em: '2026-10-04T08:00:00Z'},
    checkout: {situacao: 'Finalizado', obs: 'da equipe'}, retornoPrevisto: '2026-10-02T17:00', agendaLog: [{de: '2026-10-01'}]});
  const LANCAMENTO = new Set(['equipe', 'alocacao', 'retornoConf', 'retrabalho', 'problema', 'etapaOrigem', 'causaRaiz', 'responsavelEtapa',
    'dataRetrabalho', 'checkout', 'retrabalhoPerguntado', 'entregaLancada', 'atualizadoEm', 'atualizadoPor']);
  const r = apl(t)(os, {data: '2026-10-02', em: '2026-10-05T15:00:00Z', pessoas: ['100005', '100002'], retrabalho: {resposta: 'nao'}});
  for (const k of Object.keys(os)) if (!LANCAMENTO.has(k)) assert.deepEqual(r[k], js(os)[k], k);
  // Quem lança sem conferir não manda respostas: a conferência que outro aparelho gravou fica.
  assert.deepEqual(r.retornoConf, js(os).retornoConf);
  // Resposta Não numa O.S. sem marca: o checkout fica.
  assert.deepEqual(r.checkout, {situacao: 'Finalizado', obs: 'da equipe'});
  // Sem equipe e sem retrabalho na entrada: a equipe fica e o retrabalho não é tocado.
  const r2 = apl(t)(os, {data: '2026-10-02', em: '2026-10-05T15:00:00Z'});
  assert.deepEqual(r2.equipe, ['100005']);
  assert.equal(r2.alocacao, undefined);
  assert.equal(r2.retrabalhoPerguntado, undefined);
  for (const k of Object.keys(os)) if (!['entregaLancada', 'atualizadoEm', 'atualizadoPor'].includes(k)) assert.deepEqual(r2[k], js(os)[k], k);
});

test('aplicarLancamento · o que não dá para lançar vira erro com o motivo', () => {
  const t = tela();
  const f = t.run('aplicarLancamento');
  for (const data of ['', '2026-02-30', 'amanhã', undefined]) assert.throws(() => f(osBase(), {data}), /^Error: Informe a data da entrega\.$/, String(data));
  assert.throws(() => f(null, {data: '2026-10-02'}), /Esta O\.S\. não está mais neste aparelho\./);
  assert.throws(() => f(osBase(), {data: '2026-10-02', retrabalho: {resposta: 'talvez'}}), /A resposta do retrabalho é Sim ou Não\./);
  assert.throws(() => f(osBase(), {data: '2026-10-02', retrabalho: {...SIM, causaRaiz: '  '}}), /Preencha os cinco campos do retrabalho\./);
});

test('aplicarLancamento · padrões: quem e quando vêm do usuário e da hora; interna sem volta; lista vazia grava; divisão copiada e equipe derivada', () => {
  const t = tela();
  const r = apl(t)(osBase({equipe: ['100005']}), {data: '2026-10-02', respostasVolta: {carroLimpo: 'sim'}});
  assert.deepEqual(r.entregaLancada, {em: AGORA, por: 'Gestor Teste', data: '2026-10-02'});
  assert.deepEqual(r.retornoConf, {carroLimpo: 'sim', carroArrumado: '', equipamentosOk: '', semAvaria: '', por: 'Gestor Teste', em: AGORA});
  // O.S. interna não tem volta, venha o que vier.
  assert.equal(apl(t)(osBase({tipo: 'interno'}), {data: '2026-10-02', respostasVolta: {...VOLTA_SIM}}).retornoConf, undefined);
  // Lista vazia grava vazia (quem chama perguntou "Lançar sem equipe?").
  assert.deepEqual(apl(t)(osBase({equipe: ['100005']}), {data: '2026-10-02', pessoas: []}).equipe, []);
  // A divisão entra copiada: mexer depois no objeto de quem chamou não muda a O.S.
  const a = DIVISAO_LEAO();
  const cru = t.run('aplicarLancamento')(osBase(), {data: '2026-10-02', alocacao: a, pessoas: ['100001']});
  a.grupos[0].liderId = '100003';
  assert.equal(cru.alocacao.grupos[0].liderId, '100005');
  assert.deepEqual(js(cru.equipe), ['100005', '100003'], 'os.equipe é derivada da divisão, não da lista');
  // O carimbo do retrabalho pode vir de quem respondeu.
  const s = apl(t)(osBase(), {data: '2026-10-02', em: '2026-10-05T15:00:00Z', por: 'Lote Teste', retrabalho: {resposta: 'nao', em: '2026-10-05T14:59:00Z', por: 'Quem Respondeu'}});
  assert.deepEqual(s.retrabalhoPerguntado, {em: '2026-10-05T14:59:00Z', por: 'Quem Respondeu', resposta: 'nao'});
});

test('aplicarLancamento · o retrabalho sai igual ao que o perguntarRetrabalho grava (paridade)', () => {
  const marcada = {retrabalho: true, problema: 'Letra caiu', etapaOrigem: 'Produção', causaRaiz: 'Material', responsavelEtapa: 'Produção',
    dataRetrabalho: '2026-10-01', checkout: {situacao: 'Retrabalho', obs: 'fica'}};
  const campos = {problema: '  Placa fora de prumo ', etapaOrigem: 'Instalação', causaRaiz: 'Erro humano', responsavelEtapa: ' Montagem', dataRetrabalho: '2026-10-03'};
  const casos = [['sem marca, Não', {}, 'nao'], ['sem marca, Sim', {}, 'sim'], ['marcada, Não', marcada, 'nao'], ['marcada, Sim', marcada, 'sim'],
    ['já perguntada antes, Não', {retrabalhoPerguntado: {em: '2026-09-30T10:00:00Z', por: 'Antes', resposta: 'sim'}}, 'nao']];
  const RETRAB = ['retrabalho', 'problema', 'etapaOrigem', 'causaRaiz', 'responsavelEtapa', 'dataRetrabalho', 'checkout', 'retrabalhoPerguntado'];
  for (const [nome, extra, resposta] of casos) {
    const t = tela();
    const os = osBase({equipe: ['100005'], ...js(extra)});
    // A cópia rasa, como o Lançar entrega faz: o perguntarRetrabalho de verdade responde nela.
    const copia = {...os, checkout: os.checkout ? {...os.checkout} : os.checkout};
    let respondeu = 0;
    t.run('perguntarRetrabalho')(copia, () => { respondeu++; });
    retrab(t, resposta, campos);
    assert.equal(respondeu, 1, nome);
    const r = apl(t)(os, {data: '2026-10-02', retrabalho: t.run('respostaRetrabalhoDe')(os, copia)});
    for (const k of RETRAB) assert.deepEqual(r[k], js(copia)[k], nome + ': ' + k);
    /* Todas as chaves, não só as 8 de hoje: se o perguntarRetrabalho passar a
       gravar mais um campo, o Finalizar grava e o Lançar entrega perderia
       calado (revisão da F13). Só os carimbos do lançamento ficam de fora. */
    const FORA = new Set(['entregaLancada', 'atualizadoEm', 'atualizadoPor']);
    for (const k of Object.keys(js(copia))) if (!FORA.has(k)) assert.deepEqual(js(r)[k], js(copia)[k], nome + ' (todas as chaves): ' + k);
  }
  // Sem resposta (Voltar), não há o que aplicar, nem com um carimbo antigo na O.S.
  const t = tela();
  const os = osBase({retrabalhoPerguntado: {em: '2026-09-30T10:00:00Z', por: 'Antes', resposta: 'sim'}});
  const copia = {...os};
  t.run('perguntarRetrabalho')(copia, () => {}, {aoVoltar() {}});
  retrab(t, 'voltar');
  assert.equal(t.run('respostaRetrabalhoDe')(os, copia), null);
});

test('o modal passa pelo aplicarLancamento: uma chamada, grava o que ela devolveu e não mexe antes no objeto do STORE', () => {
  const casos = [
    ['pcp com divisão', 'pcp', osBase({retornoConf: {...VOLTA_SIM, por: 'Antigo', em: '2026-10-02T20:00:00Z'}}), l => t => t.A.executar(l.chave, {alocAcao: 'equipe', e: 'eq-aguia'})],
    ['operação, só pessoas', 'operacao', osBase(), l => t => t.A.executar(l.chave, {alocAcao: 'equipe', e: 'eq-leao'})],
  ];
  for (const [nome, papel, os, acao] of casos) {
    const t = tela({papel, lista: [os]});
    t.run(`var __chamadas = []; var __apl = aplicarLancamento;
      aplicarLancamento = (os, e) => { const r = __apl(os, e); __chamadas.push({e: JSON.parse(JSON.stringify(e)), r: JSON.parse(JSON.stringify(r))}); return r; };`);
    const original = t.lista[0], foto = js(original);
    lancar(t, {valores: {...VOLTA_SIM, semAvaria: 'nao'}, resposta: 'sim', campos: SIM, mexer: l => acao(l)(t)});
    const chamadas = js(t.run('__chamadas'));
    assert.equal(chamadas.length, 1, nome);
    const e = chamadas[0].e;
    assert.equal(e.data, '2026-10-02', nome);
    assert.deepEqual(e.retrabalho, {resposta: 'sim', em: AGORA, por: 'Gestor Teste', problema: SIM.problema, etapaOrigem: SIM.etapaOrigem,
      causaRaiz: SIM.causaRaiz, responsavelEtapa: SIM.responsavelEtapa, dataRetrabalho: SIM.dataRetrabalho}, nome);
    if (papel === 'pcp') {
      assert.equal(e.alocacao.grupos[0].equipeId, 'eq-aguia');
      assert.deepEqual(e.respostasVolta, {...VOLTA_SIM, semAvaria: 'nao'});
    } else {
      assert.equal(e.alocacao, null);
      assert.deepEqual(e.pessoas, ['100005', '100003']);
      assert.equal(e.respostasVolta, null, 'a operação não confere a volta');
    }
    assert.deepEqual(t.salvos, [chamadas[0].r], nome + ': grava o que a função devolveu, uma vez');
    assert.deepEqual(js(original), foto, nome + ': o objeto que estava no STORE não foi mexido antes da gravação');
    assert.notEqual(t.lista[0], original, nome + ': o STORE recebe a O.S. nova');
  }
});

// O formulário do "Sim, gerou" nasce com `hidden`; o display:grid da classe
// vencia o atributo e os cinco campos apareciam antes do toque em "Sim".
test('revisão: o formulário do retrabalho escondido fica escondido (hidden vence o display:grid)', () => {
  const css = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'styles.css'), 'utf8');
  assert.match(css, /\.retrab-form\[hidden\]\s*\{\s*display:\s*none/);
});
