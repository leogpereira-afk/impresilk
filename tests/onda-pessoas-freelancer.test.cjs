'use strict';
/* ONDA PESSOAS, ITEM 15 (fila de 11/10/2026): A ETIQUETA "FREELANCER" NO
   RANKING INDIVIDUAL, na gestão (Pessoas), no Modo TV e no ranking.html,
   pela marca do contrato de freelancer do RH. O caso ruim: a v169 mostrava o
   freelancer igual ao contratado, e não dava para ver quem pesa na cesta. Na
   revisão fechada com retrato vale quem era freelancer no fechamento. Dados
   fictícios. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const P = require('../performance.js');
const O = require('../operacao.js');
const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const esc = s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[ch]));
const pesos = {producao:100, limpeza:0, equipamentos:0};
const reg = (id, chave, nome, valor) => ({id, membros:[{chave, nome, percentual:100}], valor, confirmado:true, retornoConf:null});
const REGS = () => [reg('a', '600005', 'Gil Freelancer', 9000), reg('b', '600001', 'Ana Contratada', 5000), reg('c', '600002', 'Bia Contratada', 1000), reg('d', '600003', 'Caio Contratado', 500)];
const RH = [{chave:'freelancer:fl-gil', id:'600005', nome:'Gil Freelancer', freelancer:true}, {chave:'ana', id:'600001', nome:'Ana Contratada'}, {chave:'bia', id:'600002', nome:'Bia Contratada'}, {chave:'caio', id:'600003', nome:'Caio Contratado'}];

/* ------------------------------------------------------------ a gestão */
function tela({rh = RH, fonte = null} = {}) {
  const c = {STORE:{getCFG:() => ({performancePCP:{equipes:[], criterios:pesos}}), getAllOS:() => []}, STATE:{user:{papel:'pcp'}, _perfPessoaMedida:'nota'},
    periodoOuMes:() => ({de:'2026-10-01', ate:'2026-10-06'}), nomeExibicaoCasa:n => ({chave:n, nome:n}), pessoasRH:() => rh, avatarRH:() => '', esc, dinheiroCasa:n => 'R$ ' + n};
  vm.createContext(c); vm.runInContext(ler('performance.js'), c);
  c.__fonte = fonte; vm.runInContext('perfFonteAtual=()=>__fonte;', c);
  return c;
}

test('gestão: o freelancer leva a etiqueta no pódio e na tabela; o contratado não', () => {
  const html = tela().perfRankingPessoasHTML(REGS(), {equipes:[]});
  assert.match(html, /<h4 class="perf-podio-nome"><span class="perf-sr">1º lugar: <\/span>Gil Freelancer <span class="tag-freelancer">Freelancer<\/span><\/h4>/);
  assert.doesNotMatch(html, /Ana Contratada <span class="tag-freelancer">/);
  assert.match(html, /<strong>Caio Contratado<\/strong>(?!\s*<span class="tag-freelancer">)/);
  assert.equal((html.match(/tag-freelancer/g) || []).length, 1);
  // Na tabela (do 4º em diante): um freelancer em 4º.
  const regs = [reg('a', '600001', 'Ana Contratada', 9000), reg('b', '600002', 'Bia Contratada', 5000), reg('c', '600003', 'Caio Contratado', 1000), reg('d', '600005', 'Gil Freelancer', 500)];
  assert.match(tela().perfRankingPessoasHTML(regs, {equipes:[]}), /<strong>Gil Freelancer<\/strong> <span class="tag-freelancer">Freelancer<\/span>/);
});

test('gestão: a revisão fechada com retrato mostra quem era freelancer no fechamento, não o cadastro de hoje', () => {
  const fonte = {fechadoEm:'2026-11-02T12:00:00Z', regraNota:P.REGRA_NOTA_VALOR, criterios:pesos, retrato:{equipes:[], pessoas:[{id:'600001', nome:'Ana Contratada', freelancer:true}, {id:'600005', nome:'Gil Freelancer', freelancer:false}]}};
  const html = tela({fonte}).perfRankingPessoasHTML(REGS(), {equipes:[]});
  assert.match(html, /Ana Contratada <span class="tag-freelancer">Freelancer<\/span>/);
  assert.doesNotMatch(html, /Gil Freelancer <span class="tag-freelancer">/);
  // Sem retrato (o selo de antes do retrato): o cadastro de hoje.
  const antigo = tela({fonte:{...fonte, retrato:undefined}}).perfRankingPessoasHTML(REGS(), {equipes:[]});
  assert.match(antigo, /Gil Freelancer <span class="tag-freelancer">/);
  // Sem a marca no elenco (quem não pode ver o contrato): nenhuma etiqueta.
  assert.doesNotMatch(tela({rh:RH.map(({freelancer, ...p}) => p)}).perfRankingPessoasHTML(REGS(), {equipes:[]}), /tag-freelancer/);
});

/* ------------------------------------------------------------ o Modo TV */
test('Modo TV: a etiqueta no painel das pessoas, pela mesma régua da tela; a equipe não leva', () => {
  const s = ler('casa.js');
  const g = tela();
  const pessoas = REGS().map(r => r.membros[0]);
  const ctx = {PERF:P, STATE:{}, perfConfig:() => ({equipes:[]}), perfLista:() => REGS(), perfRegistro:r => r, perfUnirPessoas:r => r, diaEntrega:() => '', OPERACAO:{emIntervalo:() => true},
    esc, avatarRH:() => '', pessoasRH:() => RH, perfFormato:String, carrosHTML:() => '', retrabalhoHTML:() => '', rotuloPeriodoCasa:() => '', perfFonteAtual:() => null,
    perfPodioHTML:g.perfPodioHTML, perfCortarPodio:g.perfCortarPodio, perfLogoHTML:() => '', perfCorClasse:() => '', perfEtiquetaFreelancerHTML:g.perfEtiquetaFreelancerHTML};
  vm.createContext(ctx); vm.runInContext(s.slice(s.indexOf('function painelTVCasa('), s.indexOf('function rotuloPeriodoCasa(')), ctx);
  const pessoasHTML = ctx.painelTVCasa(1, {}).html;
  assert.ok(pessoas.length);
  assert.match(pessoasHTML, /Gil Freelancer <span class="tag-freelancer">Freelancer<\/span>/);
  assert.equal((pessoasHTML.match(/tag-freelancer/g) || []).length, 1);
  assert.doesNotMatch(ctx.painelTVCasa(0, {}).html, /tag-freelancer/, 'o painel das equipes não leva etiqueta');
  // Sem o performance.js novo (cache misto): a TV pinta sem a etiqueta, sem quebrar.
  delete ctx.perfEtiquetaFreelancerHTML;
  assert.doesNotMatch(ctx.painelTVCasa(1, {}).html, /tag-freelancer/);
});

/* ------------------------------------------------- o ranking.html (servidor) */
test('ranking.html (servidor): a linha individual do freelancer sai com freelancer:true; a equipe e o contratado não', async () => {
  const {rankingEquipeSeguro} = await import('../supabase/functions/_shared/pcp-ranking-publico.mjs');
  const pessoas = O.resolverPessoas({pessoas:RH});
  const registros = [...REGS(), {id:'e', membros:[{chave:'600005', nome:'Gil Freelancer', percentual:50}, {chave:'600001', nome:'Ana Contratada', percentual:50}], valor:100, confirmado:true, equipeId:'eq1', equipeNome:'Equipe Fictícia'}];
  const r = rankingEquipeSeguro({periodo:{de:'2026-10-01', ate:'2026-10-31'}, registros}, [{id:'eq1', nome:'Equipe Fictícia'}], pessoas);
  const linha = nome => r.equipes.find(e => e.nome === nome);
  assert.equal(linha('Gil Freelancer').freelancer, true);
  assert.equal(linha('Ana Contratada').freelancer, undefined);
  assert.equal(linha('Equipe Fictícia').freelancer, undefined);
  assert.ok(!JSON.stringify(r).includes('600005'), 'nenhum ID sai');
  // Fechamento com retrato: quem era freelancer na época.
  const f = rankingEquipeSeguro({periodo:{de:'2026-10-01', ate:'2026-10-31'}, fechadoEm:'2026-11-02T12:00:00Z', revisao:1, registros:REGS(),
    retrato:{equipes:[], pessoas:[{id:'600001', freelancer:true}, {id:'600005', freelancer:false}]}}, [], pessoas);
  assert.equal(f.equipes.find(e => e.nome === 'Ana Contratada').freelancer, true);
  assert.equal(f.equipes.find(e => e.nome === 'Gil Freelancer').freelancer, undefined);
});

test('ranking.html (servidor real): o contrato de freelancer do RH chega como etiqueta, para a montagem também', async () => {
  const {edge} = require('./helpers/edge.cjs');
  const cpf = nove => { const dv = b => { let s = 0; for (let i = 0; i < b.length; i++) s += Number(b[i]) * (b.length + 1 - i); const x = (s * 10) % 11; return x === 10 ? 0 : x; }; const d1 = dv(nove); return nove + d1 + dv(nove + d1); };
  const os = (id, numero, equipe, dia) => ({id, numero, rev:3, tipo:'externo', cliente:'Cliente fictício', valorTotal:8500, equipe, veiculo:'Carro fictício',
    horaRetorno:'18:00', retornoEm:dia + 'T18:00:00', finalizadaEm:dia + 'T21:00:00.000Z', finalizadoPor:'Gestor fictício', entregaLancada:{data:dia, em:dia + 'T21:00:00.000Z', por:'Gestor fictício'}});
  const oss = [os('A', '90701', ['610005'], '2026-10-05'), os('B', '90702', ['610001'], '2026-10-06')];
  const e = await edge('pcp-sync', {pcp_registros:oss.map(x => ({colecao:'os', id:x.id, apagado:false, atualizado_em:'2026-10-07T00:00:00Z', registro:x})),
    registros:[{id:'ana', colecao:'colaboradores', apagado:false, registro:{id:'ana', nome:'Ana Contratada', cpf:'61000111111', statusId:'ativo'}},
      {id:'fl-gil', colecao:'freelancers', apagado:false, registro:{id:'fl-gil', nome:'Gil Freelancer', cpf:cpf('610005222'), funcao:'Instalador', situacao:'ativo', contratoFim:'2099-12-31'}}],
    pcp_config_global:[{id:true, atualizado_em:'2020-01-01', config:{performancePCP:{equipes:[], participacoes:[
      {id:'A', membros:[{chave:'610005', nome:'Gil Freelancer', percentual:100}], por:'Gestor fictício', em:'2026-10-06T00:00:00Z'},
      {id:'B', membros:[{chave:'610001', nome:'Ana Contratada', percentual:100}], por:'Gestor fictício', em:'2026-10-06T00:00:00Z'}]}}}],
    painel_ordens:oss.map(x => ({numero:x.numero, valor:8500}))});
  const r = await e.call({action:'performanceRankingEquipe', de:'2026-10-01', ate:'2026-10-07'}, {papel:'montagem', nome:'Montagem', sub:'montagem'});
  assert.equal(r.status, 200, JSON.stringify(r));
  const gil = r.equipes.find(x => /Gil/.test(x.nome)), ana = r.equipes.find(x => /Ana/.test(x.nome));
  assert.ok(gil && ana, JSON.stringify(r.equipes));
  assert.equal(gil.freelancer, true);
  assert.equal(ana.freelancer, undefined);
  assert.ok(!JSON.stringify(r).includes('610005'), 'nenhum ID sai');
});

/* ------------------------------------------------- o ranking.html (tela) */
test('ranking.html (tela): a linha individual com a marca ganha a etiqueta; a equipe nunca', async () => {
  const els = new Map(); let entrou = false;
  const elemento = (tag = 'div') => ({tag, hidden:false, value:'', textContent:'', className:'', disabled:false, dataset:{}, children:[], replaceChildren(...xs) { this.children = xs; }, append(...xs) { this.children.push(...xs); }, setAttribute() {}, focus() {}});
  const el = id => { if (!els.has(id)) els.set(id, elemento()); return els.get(id); };
  const resposta = {periodo:{de:'2026-10-01', ate:'2026-10-31'}, atualizadoEm:'2026-10-12T13:00:00Z', fechado:false, resumo:{equipes:3, entregasConfirmadas:3, equivalentes:3, aConferir:0, semBase:0},
    equipes:[{posicao:1, nome:'Gil Freelancer', tipo:'individual', freelancer:true, entregas:1, equivalentes:1, faltaLideranca:0},
      {posicao:2, nome:'Ana Contratada', tipo:'individual', entregas:1, equivalentes:1, faltaLideranca:0},
      {posicao:3, nome:'Equipe Fictícia', tipo:'equipe', freelancer:true, entregas:1, equivalentes:1, faltaLideranca:0}]};
  const ctx = {Intl, Date, console, AbortController, setTimeout, clearTimeout, API_BASE:'', API_FN:{os:'ranking-api'}, document:{hidden:false, getElementById:el, createElement:elemento, addEventListener() {}}, window:{addEventListener() {}, print() {}}, setInterval() {},
    AUTH:{temCracha:() => entrou, dono:() => entrou ? {nome:'Ana', papel:'montagem'} : null, cracha:() => '', login:async () => { entrou = true; return {}; }}, fetch:async () => ({ok:true, status:200, json:async () => resposta})};
  vm.runInNewContext(ler('ranking.js'), ctx);
  await el('ranking-login-form').onsubmit({preventDefault() {}});
  const titulos = el('ranking-lista').children.map(li => li.children[2].children[0]);
  const tags = h => h.children.filter(x => x && x.className === 'tag-freelancer').map(x => x.textContent);
  assert.equal(titulos[0].textContent, 'Gil Freelancer'); assert.deepEqual(tags(titulos[0]), ['Freelancer']);
  assert.deepEqual(tags(titulos[1]), []);
  assert.deepEqual(tags(titulos[2]), [], 'a equipe não leva a etiqueta, mesmo com a marca');
  assert.match(ler('ranking.css'), /\.ranking-equipe \.tag-freelancer\{/);
});
