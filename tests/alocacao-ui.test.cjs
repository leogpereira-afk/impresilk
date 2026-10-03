/* COMPONENTE ÚNICO DE ALOCAÇÃO (F09, 30/09/2026). alocacao-ui.js monta a
   divisão da O.S. (os.alocacao, formato do motor DIVISAO) e o Conferir da
   Performance passa a gravá-la pela porta da F08, e não mais na participação
   do blob. Cada teste começa pelo caso ruim. DOM falso: o componente liga
   por delegação no contêiner, então o teste dispara onclick e onchange com
   alvos de mentira. Dados fictícios (o repositório é público). */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {edge} = require('./helpers/edge.cjs');
const D = require('../divisao.js');
const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const js = x => JSON.parse(JSON.stringify(x));

const ELENCO = {pessoas: [
  {chave: 'ana-f', id: '100001', nome: 'Ana Fictícia', apelido: 'ana', area: 'Montagem', ativo: true},
  {chave: 'bia-f', id: '100002', nome: 'Bia Fictícia', apelido: 'bia', area: 'Montagem', ativo: true},
  {chave: 'caio-f', id: '100003', nome: 'Caio Fictício', apelido: 'caio', area: 'Montagem', ativo: true},
  {chave: 'eva-f', id: '100005', nome: 'Eva Fictícia', apelido: 'eva', area: 'Montagem', ativo: true},
  {chave: 'davi-fl', id: '300004', nome: 'Davi Prestador', apelido: 'davi', ativo: true, freelancer: true},
  // As travas da F07: contrato sem CPF (sem ID) e ID que ficha e contrato dividem.
  {chave: 'zeca-fl', id: '', nome: 'Zeca Sem Documento', apelido: 'zeca', ativo: true, freelancer: true, semCpf: true},
  {chave: 'rita-f', id: '100009', nome: 'Rita Fictícia', apelido: 'rita', area: 'Montagem', ativo: true, idRepetido: true},
], antigos: []};
const EQUIPES = [
  {id: 'eq-aguia', nome: 'Águia', animal: 'aguia', cor: 'marinho', liderPadraoId: '100001', membros: [{chave: '100001', nome: 'Ana'}, {chave: '100002', nome: 'Bia'}], ativo: true},
  {id: 'eq-leao', nome: 'Leão', animal: 'leao', cor: 'laranja', liderPadraoId: '100005', membros: [{chave: '100005', nome: 'Eva'}, {chave: '100003', nome: 'Caio'}], ativo: true},
];
const escH = s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[ch]));

/* A tela da gestão num contexto isolado: operacao, divisao, regras,
   performance e o componente, mais o seletor de pessoas de verdade (o trecho
   do app.js com as travas da F07). O STORE é de mentira e conta o que grava. */
function tela({lista = [], papel = 'pcp', participacoes = [], loja = {}} = {}) {
  const cfg = {instaladores: ['Ana'], vinculosRH: [], performancePCP: {equipes: js(EQUIPES), participacoes: js(participacoes)}};
  const salvos = [], cfgs = [], toasts = [];
  const STORE = {getCFG: () => cfg, saveCFG: x => cfgs.push(js(x)), getAllOS: () => lista, getOS: id => lista.find(o => o.id === id) || null,
    saveOS: o => { salvos.push(js(o)); const i = lista.findIndex(x => x.id === o.id); if (i >= 0) lista[i] = o; else lista.push(o); },
    elenco: () => ELENCO, getQueue: () => [], trySync: async () => {}, on() {}, onConflict() {}, regrasLocais: () => null,
    api: async () => ({}), pullCFG: async () => false, ...loja};
  const c = {STORE, STATE: {user: {papel, nome: 'Gestor Teste'}}, console, setTimeout, clearTimeout, navigator: {onLine: true},
    esc: escH, toast: (m, t) => toasts.push([m, t]), dinheiroCasa: n => 'R$ ' + Number(n).toFixed(2).replace('.', ','),
    diaEntrega: o => String((o.entregaLancada && o.entregaLancada.data) || o.finalizadaEm || '').slice(0, 10), valorDaOS: o => o.valorTotal ?? null,
    nomeExibicaoCasa: n => { const p = ELENCO.pessoas.find(x => x.id === n || x.apelido === n || x.chave === n); return p ? {chave: p.chave, id: p.id, nome: p.nome} : {chave: n, id: '', nome: n}; },
    pessoasRH: () => ELENCO.pessoas, avatarRH: (p, cl) => `<span class="casa-avatar ${cl}">${escH((p.nome || '?')[0])}</span>`,
    periodoOuMes: () => ({de: '2026-10-01', ate: '2026-10-31'}), classificarEntregas: os => ({instalacoes: os, aLancar: []}),
    renderPerformanceCasa: () => {}, normNome: s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()};
  vm.createContext(c);
  for (const f of ['operacao.js', 'divisao.js', 'regras.js', 'performance.js', 'alocacao-ui.js']) vm.runInContext(ler(f), c, {filename: f});
  const app = ler('app.js');
  vm.runInContext(app.slice(app.indexOf('const RH_CONTRATOS_FREELANCER'), app.indexOf('/* `marcadosAgora` e `novas`')), c, {filename: 'app.js (seletor)'});
  return {c, A: vm.runInContext('ALOCUI', c), cfg, salvos, cfgs, toasts, STORE};
}
const osBase = (extra = {}) => ({id: '1', numero: '5001', tipo: 'externo', cliente: 'Cliente Fictício', equipe: [], valorTotal: 4200, finalizadaEm: '2026-10-02T15:00:00', rev: 1, ...extra});
// Cópia para este lado do vm (o deepEqual estrito compara protótipos).
const cotas = st => js(st.aloc.grupos.map(g => g.membros.map(m => [m.pessoaId, m.papel, m.cota])));
const somaOk = a => a.grupos.reduce((s, g) => s + g.cota, 0) === 10000 && a.grupos.every(g => g.membros.reduce((s, m) => s + m.cota, 0) === 10000);

/* ───────────── a montagem ───────────── */

test('equipe: um toque traz os integrantes fixos com o líder padrão, 60/40, com selos, cor e logo', () => {
  const {A} = tela();
  A.iniciar('t', {os: osBase(), equipes: EQUIPES, papel: 'pcp'});
  // Caso ruim: equipe que não existe (ou desativada) não entra calada.
  assert.match(A.executar('t', {alocAcao: 'equipe', e: 'eq-nao-existe'}), /não encontrada/);
  assert.equal(A.estado('t').aloc.grupos.length, 0);
  assert.equal(A.executar('t', {alocAcao: 'equipe', e: 'eq-aguia'}), '');
  const st = A.estado('t'), g = st.aloc.grupos[0];
  assert.equal(g.equipeId, 'eq-aguia');
  assert.equal(g.liderId, '100001');
  assert.deepEqual(cotas(st), [[['100001', 'lider', 6000], ['100002', 'ajudante', 4000]]]);
  const html = A.html('t');
  assert.match(html, /★ Líder/);
  assert.match(html, /Ajudante/);
  assert.match(html, /perf-cor-marinho/, 'a cor da equipe (por classe)');
  assert.match(html, /equipe-aguia\.webp/, 'a logo do animal');
  assert.match(html, /aria-pressed="true" disabled/, 'a equipe já trazida fica marcada no botão');
  assert.doesNotMatch(html, /style=/, 'cor nunca por style=');
  assert.equal(A.bloqueio('t'), '');
  // A mesma equipe de novo não duplica.
  assert.match(A.executar('t', {alocAcao: 'equipe', e: 'eq-aguia'}), /já está na divisão/);
});

test('um terceiro na equipe vira 40/30/30; freelancer entra com o selo; as travas da F07 aparecem no seletor', () => {
  const {A} = tela();
  A.iniciar('t', {os: osBase(), equipes: EQUIPES, papel: 'pcp'});
  A.executar('t', {alocAcao: 'equipe', e: 'eq-aguia'});
  A.executar('t', {alocAcao: 'painel', g: '0'});
  const painel = A.html('t');
  // Caso ruim: contrato sem CPF e ID repetido aparecem TRAVADOS, com o motivo, e não somem.
  assert.match(painel, /Zeca Sem Documento[\s\S]*?CPF/);
  assert.match(painel, /class="aloc-opcao bloqueado" data-aloc-acao="pessoa" data-p=""[^>]*disabled/);
  assert.match(painel, /data-p="100009"[^>]*disabled/, 'ID repetido travado');
  assert.match(painel, /data-p="100001"[^>]*disabled/, 'quem já está na divisão não entra de novo');
  assert.match(painel, /Davi <span class="tag-freelancer">Freelancer<\/span><small>Davi Prestador · ID 300004/, 'o freelancer com a tag, pelo nome curto');
  assert.match(A.executar('t', {alocAcao: 'pessoa', p: '100009'}), /ID repetido/);
  assert.equal(A.executar('t', {alocAcao: 'pessoa', p: '100003'}), '');
  assert.deepEqual(cotas(A.estado('t')), [[['100001', 'lider', 4000], ['100002', 'ajudante', 3000], ['100003', 'ajudante', 3000]]]);
  // Freelancer dentro da equipe: 4 pessoas = líder 40 e o resto igual.
  A.executar('t', {alocAcao: 'painel', g: '0'});
  A.executar('t', {alocAcao: 'pessoa', p: '300004'});
  const g = A.estado('t').aloc.grupos[0];
  assert.deepEqual(js(g.membros.map(m => m.cota)), [4000, 2000, 2000, 2000]);
  assert.equal(g.membros[3].freelancer, true);
  assert.match(A.html('t'), /Davi<\/b><span class="aloc-badges"><span class="aloc-badge">Ajudante<\/span><span class="tag-freelancer">Freelancer/);
});

test('tirar o líder promove o próximo; tirar todos some com a equipe', () => {
  const {A} = tela();
  A.iniciar('t', {os: osBase(), equipes: EQUIPES, papel: 'pcp'});
  A.executar('t', {alocAcao: 'equipe', e: 'eq-aguia'});
  A.executar('t', {alocAcao: 'painel', g: '0'});
  A.executar('t', {alocAcao: 'pessoa', p: '100003'});
  // Caso ruim: sem promover, a equipe ficaria "sem líder" e a divisão não gravaria.
  assert.equal(A.executar('t', {alocAcao: 'remover', g: '0', p: '100001'}), '');
  assert.deepEqual(cotas(A.estado('t')), [[['100002', 'lider', 6000], ['100003', 'ajudante', 4000]]]);
  assert.equal(A.estado('t').aloc.grupos[0].liderId, '100002');
  assert.equal(A.bloqueio('t'), '');
  A.executar('t', {alocAcao: 'remover', g: '0', p: '100002'});
  assert.deepEqual(cotas(A.estado('t')), [[['100003', 'lider', 10000]]]);
  A.executar('t', {alocAcao: 'remover', g: '0', p: '100003'});
  assert.equal(A.estado('t').aloc.grupos.length, 0);
  assert.match(A.bloqueio('t'), /pelo menos uma equipe/);
});

test('trocar o líder num toque: a parte de líder vai junto e ele passa para a frente', () => {
  const {A} = tela();
  A.iniciar('t', {os: osBase(), equipes: EQUIPES, papel: 'pcp'});
  A.executar('t', {alocAcao: 'equipe', e: 'eq-aguia'});
  assert.equal(A.executar('t', {alocAcao: 'lider', g: '0', p: '100002'}), '');
  assert.deepEqual(cotas(A.estado('t')), [[['100002', 'lider', 6000], ['100001', 'ajudante', 4000]]]);
  assert.match(A.html('t'), /aria-label="Tornar Ana líder"/);
});

test('o cadeado segura o valor; a redistribuição vai para os livres; restaurar volta à regra e tira o selo', () => {
  const {A} = tela();
  A.iniciar('t', {os: osBase(), equipes: EQUIPES, papel: 'pcp'});
  A.executar('t', {alocAcao: 'equipe', e: 'eq-aguia'});
  A.executar('t', {alocAcao: 'painel', g: '0'});
  A.executar('t', {alocAcao: 'pessoa', p: '100003'});
  A.executar('t', {alocAcao: 'trava', g: '0', p: '100002'});
  assert.equal(A.executar('t', {alocAcao: 'pct', g: '0', p: '100001', valor: '50'}), '');
  assert.deepEqual(cotas(A.estado('t')), [[['100001', 'lider', 5000], ['100002', 'ajudante', 3000], ['100003', 'ajudante', 2000]]]);
  // Caso ruim: editar o travado não mexe em nada e diz por quê.
  assert.match(A.executar('t', {alocAcao: 'pct', g: '0', p: '100002', valor: '10'}), /cadeado/);
  assert.equal(A.estado('t').aloc.grupos[0].membros[1].cota, 3000);
  // Caso ruim: passar do que sobra fora do travado é recusado.
  assert.match(A.executar('t', {alocAcao: 'pct', g: '0', p: '100001', valor: '80'}), /Passa de 100%/);
  assert.match(A.executar('t', {alocAcao: 'pct', g: '0', p: '100001', valor: 'abc'}), /Digite o percentual/);
  assert.equal(A.lerPct('33,34'), 3334);
  assert.equal(A.estado('t').aloc.manual, true);
  assert.match(A.html('t'), /Editado à mão/);
  A.executar('t', {alocAcao: 'restaurar'});
  assert.deepEqual(cotas(A.estado('t')), [[['100001', 'lider', 4000], ['100002', 'ajudante', 3000], ['100003', 'ajudante', 3000]]]);
  assert.equal(A.estado('t').aloc.manual, false);
  assert.match(A.html('t'), /Padrão da regra/);
});

test('duas equipes: a parte de cada uma é proporcional às pessoas, a barra pinta cada cor e o cadeado da equipe segura', () => {
  const {A} = tela();
  A.iniciar('t', {os: osBase(), equipes: EQUIPES, papel: 'pcp'});
  A.executar('t', {alocAcao: 'equipe', e: 'eq-aguia'});
  A.executar('t', {alocAcao: 'equipe', e: 'eq-leao'});
  A.executar('t', {alocAcao: 'painel', g: '1'});
  A.executar('t', {alocAcao: 'pessoa', p: '300004'});
  const st = A.estado('t');
  assert.deepEqual(js(st.aloc.grupos.map(g => g.cota)), [4000, 6000], '2 + 3 pessoas = 40/60');
  assert.ok(somaOk(st.aloc));
  const html = A.html('t');
  assert.match(html, /aloc-seg perf-cor-marinho lider/);
  assert.match(html, /aloc-seg perf-cor-laranja/);
  assert.match(html, /Total 100%/);
  A.executar('t', {alocAcao: 'trava-equipe', g: '0'});
  assert.match(A.executar('t', {alocAcao: 'pct-equipe', g: '0', valor: '10'}), /cadeado/);
  A.executar('t', {alocAcao: 'trava-equipe', g: '0'});
  assert.equal(A.executar('t', {alocAcao: 'pct-equipe', g: '0', valor: '50'}), '');
  assert.deepEqual(js(A.estado('t').aloc.grupos.map(g => g.cota)), [5000, 5000]);
});

test('a soma é sempre 10000: 400 ações ao acaso nunca deixam gravar divisão torta', () => {
  const {A} = tela();
  let semente = 11;
  const sorte = n => { semente = (semente * 9301 + 49297) % 233280; return Math.floor(semente / 233280 * n); };
  const ids = ['100001', '100002', '100003', '100005', '300004'];
  A.iniciar('t', {os: osBase(), equipes: EQUIPES, papel: 'pcp'});
  let prontas = 0;
  for (let i = 0; i < 400; i++) {
    const st = A.estado('t'), gs = st.aloc.grupos;
    const g = gs.length ? sorte(gs.length) : 0, m = gs[g] && gs[g].membros.length ? gs[g].membros[sorte(gs[g].membros.length)].pessoaId : '100001';
    const acoes = [
      () => A.executar('t', {alocAcao: 'equipe', e: EQUIPES[sorte(2)].id}),
      () => { A.executar('t', {alocAcao: 'painel', g: String(g)}); A.executar('t', {alocAcao: 'pessoa', p: ids[sorte(ids.length)]}); },
      () => A.executar('t', {alocAcao: 'remover', g: String(g), p: m}),
      () => A.executar('t', {alocAcao: 'lider', g: String(g), p: m}),
      () => A.executar('t', {alocAcao: 'trava', g: String(g), p: m}),
      () => A.executar('t', {alocAcao: 'pct', g: String(g), p: m, valor: (sorte(10001) / 100).toFixed(sorte(3)).replace('.', ',')}),
      () => A.executar('t', {alocAcao: 'pct-equipe', g: String(g), valor: String(sorte(101))}),
      () => A.executar('t', {alocAcao: 'restaurar'}),
      () => A.executar('t', {alocAcao: 'remover-equipe', g: String(g)}),
    ];
    acoes[sorte(i % 50 === 0 ? 9 : 8)]();
    const agora = A.estado('t');
    if (!D.validar(agora.aloc)) assert.ok(somaOk(agora.aloc), 'divisão válida soma 10000 nos dois níveis');
    const p = A.paraGravar('t');
    if (!p.erro) { prontas++; assert.ok(somaOk(p.alocacao)); assert.equal(D.validar(p.alocacao), ''); }
  }
  assert.ok(prontas > 100, `a sequência passou por muitas divisões gravadas (${prontas})`);
});

test('gravar nunca é chamado com divisão inválida: sem líder, a tela pede o líder e nada vai ao STORE', async () => {
  // Setembro: Bia e Caio na O.S., sem equipe com essa gente e sem papel: partes iguais, "sem líder".
  const lista = [osBase({equipe: ['100002', '100003']})];
  const {A, salvos} = tela({lista});
  A.iniciar('t', {os: lista[0], equipes: EQUIPES, papel: 'pcp'});
  assert.equal(A.estado('t').origem, 'legado');
  assert.deepEqual(cotas(A.estado('t')), [[['100002', '', 5000], ['100003', '', 5000]]]);
  assert.match(A.bloqueio('t'), /líder/);
  assert.match(A.html('t'), /Sem líder: toque em Tornar líder/);
  const r = await A.gravarNaOS('t', {usuario: 'Gestor'});
  assert.equal(r.estado, 'invalida');
  assert.equal(salvos.length, 0, 'nada foi enviado');
  A.executar('t', {alocAcao: 'lider', g: '0', p: '100003'});
  assert.deepEqual(cotas(A.estado('t')), [[['100003', 'lider', 6000], ['100002', 'ajudante', 4000]]]);
  const ok = await A.gravarNaOS('t', {usuario: 'Gestor', prazoMs: 50});
  assert.equal(ok.estado, 'gravada', JSON.stringify(ok));
  assert.equal(salvos.length, 1);
  assert.ok(somaOk(salvos[0].alocacao));
  assert.equal(salvos[0].alocacao.em, undefined, 'divisão nova vai sem em');
  assert.deepEqual(js(salvos[0].equipe), ['100003', '100002'], 'os.equipe derivada da divisão');
});

/* ───────────── R$ só para a gestão ───────────── */

test('divisão operacional preserva percentuais e base sem previsão financeira ou corte automático', () => {
 const {A}=tela({lista:[osBase({equipe:['100001','100002']})]});
 for(const papel of ['operacao','pcp','admin']){
  A.iniciar(papel,{os:osBase({equipe:['100001','100002']}),equipes:EQUIPES,papel,valor:4200});
  const h=A.html(papel);assert.match(h,/Divisão operacional por pessoa/);assert.doesNotMatch(h,/Comissão prevista|R\$ 25,20|R\$ 16,80/);
  if(papel==='operacao'){assert.doesNotMatch(h,/R\$|[Cc]omissão/);assert.equal(A.estado(papel).valor,null);}else{assert.match(h,/Base da O.S. a conferir/);assert.match(h,/demonstrativo revisado e aprovado/);}
 }
});

/* ───────────── terceiro só pelo nome ───────────── */

/* TROCADO DE PROPÓSITO NA REVISÃO DA F09 (decisão do dono, 30/09/2026): a
   O.S. com alguém só pelo nome confirma pelo jeito antigo (participação do
   blob, como a v138), senão o Fechar período de julho a setembro trava. O que
   continua valendo daqui: a tela diz o que fazer e a DIVISÃO não vai calada
   para a O.S. (tiraria o nome dela). O fluxo inteiro está em
   tests/alocacao-ui-revisao.test.cjs. */
test('O.S. com alguém só pelo nome: a tela diz o que fazer (RH ou tirar o nome) e a divisão não vai para a O.S.', async () => {
  const lista = [osBase({equipe: ['100001', 'Terceiro Fictício']})];
  const {A, salvos} = tela({lista});
  A.iniciar('t', {os: lista[0], equipes: EQUIPES, papel: 'pcp'});
  assert.deepEqual(js(A.estado('t').semId), ['Terceiro Fictício']);
  assert.ok(A.estado('t').antigo, 'confirma pelo jeito antigo');
  const html = A.html('t');
  assert.match(html, /Esta O\.S\. tem nome sem ficha no RH\.<\/strong> A confirmação vale pelo jeito antigo; ligue o nome em Conferir nomes para gravar a divisão na O\.S\./);
  assert.match(html, /Sem ficha no RH: Terceiro Fictício\. Se essa pessoa não trabalhou nesta O\.S\., tire o nome na ficha da O\.S\./);
  assert.match(html, /data-aloc-acao="ir-rh"/);
  assert.match(html, /data-aloc-acao="ir-ficha"/);
  // Mesmo montando uma divisão válida por cima, a divisão não grava.
  A.executar('t', {alocAcao: 'equipe', e: 'eq-aguia'});
  assert.match(A.paraGravar('t').erro, /só pelo nome, sem ID no RH: a divisão não vai para a O\.S\./);
  const r = await A.gravarNaOS('t', {usuario: 'Gestor'});
  assert.equal(r.estado, 'invalida');
  assert.equal(salvos.length, 0);
});

/* ───────────── o Conferir da Performance ───────────── */

// O diálogo de mentira do perfDialog: guarda o corpo e os elementos por seletor.
function dialogo() {
  const els = {}, ouvintes = {};
  const el = q => (els[q] = els[q] || {innerHTML: '', textContent: '', hidden: q === '#perf-aloc-recomecar', disabled: false, classList: {add() {}, remove() {}, toggle() {}}});
  const d = {open: true, corpo: '', els, querySelector: el, querySelectorAll: () => [], addEventListener: (ev, f) => { ouvintes[ev] = f; }, close() { d.open = false; if (ouvintes.close) ouvintes.close(); }};
  return d;
}
const alvo = ds => ({dataset: ds, disabled: false, closest() { return this; }});

test('Conferir: 30 ajustes e uma confirmação = uma gravação, uma linha no alocacaoLog e nada novo em participacoes', async () => {
  const fichaRH = (id, nome, cpf) => ({colecao: 'colaboradores', id, apagado: false, registro: {id, nome, apelido: nome.split(' ')[0].toLowerCase(), cpf}});
  const e = await edge('pcp-sync', {
    pcp_registros: [{id: '1', colecao: 'os', apagado: false, atualizado_em: '2026-10-02T15:00:00Z', registro: osBase({equipe: ['100001', '100002']})}],
    registros: [fichaRH('ana-f', 'Ana Fictícia', '10000111111'), fichaRH('bia-f', 'Bia Fictícia', '10000222222')],
    pcp_config_global: [{id: true, config: {instaladores: ['Ana'], performancePCP: {equipes: js(EQUIPES), participacoes: []}}, atualizado_em: '2026-10-01T10:00:00Z'}]});
  const gravadaNoServidor = () => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === '1').registro;
  const antiga = [{id: '1', membros: [{chave: 'ana-f', nome: 'Ana da Época', apelido: 'ana', percentual: 50}, {chave: '100002', nome: 'Bia', percentual: 50}], por: 'Gestor', em: '2026-09-29'}];
  const lista = [js(gravadaNoServidor())];
  const {c, A, cfg, salvos, cfgs, toasts} = tela({lista, participacoes: antiga});
  const d = dialogo();
  c.perfDialog = (titulo, corpo) => { d.titulo = titulo; d.corpo = corpo; return d; };
  await c.perfEditarParticipacao('1');
  assert.match(d.titulo, /Conferir divisão · O\.S\. 5001/);
  assert.match(d.corpo, /Participação conferida antes <small>só leitura<\/small>/, 'a antiga aparece só para leitura, com aviso');
  assert.match(d.corpo, /Ana da Época · 50%/);
  const box = d.els['#perf-aloc'], ok = d.els['#perf-aloc-ok'];
  assert.match(box.innerHTML, /A sugestão abaixo parte de quem está na O\.S\. agora, que é a mesma gente de uma equipe cadastrada/, 'Ana e Bia = Águia, com a líder padrão');
  assert.doesNotMatch(box.innerHTML, /O\.S\.\./, 'sem ponto dobrado depois de O.S.');
  // O botão de equipe pelo clique (delegação), e trinta ajustes de percentual.
  box.onclick({target: alvo({alocAcao: 'remover-equipe', g: '0'})});
  assert.equal(ok.disabled, true, 'sem ninguém não grava');
  box.onclick({target: alvo({alocAcao: 'equipe', e: 'eq-aguia'})});
  assert.equal(ok.disabled, false);
  for (let i = 0; i < 30; i++) box.onchange({target: {dataset: {alocPct: '', g: '0', p: '100001'}, value: String(41 + (i % 25))}});
  assert.equal(salvos.length, 0, 'ajuste não grava');
  const st = A.estado('perf:1');
  assert.equal(st.aloc.grupos[0].membros[0].cota, 4500, 'vale o último ajuste (45%)');
  assert.equal(st.aloc.manual, true);
  await ok.onclick();
  assert.equal(salvos.length, 1, 'uma confirmação = uma gravação');
  assert.equal(d.open, false, 'gravou e fechou');
  assert.deepEqual(toasts.pop(), ['Divisão gravada na O.S. 5001.', 'success']);
  assert.equal(cfgs.length, 0, 'nada vai para a configuração');
  assert.deepEqual(cfg.performancePCP.participacoes, antiga, 'participacoes intacta');
  const enviada = salvos[0];
  assert.ok(somaOk(enviada.alocacao));
  assert.deepEqual(enviada.alocacao.grupos[0].membros.map(m => m.cota), [4500, 5500]);
  // A porta da F08 aceita e escreve UMA linha no histórico.
  const r = await e.call({action: 'upsert', os: enviada}, {papel: 'pcp', nome: 'Gestor Teste', sub: 'gestor'});
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.ok(!r.descartado, JSON.stringify(r));
  const g = gravadaNoServidor();
  assert.equal(g.alocacaoLog.length, 1);
  assert.equal(g.alocacaoLog[0].acao, 'criar');
  assert.deepEqual(g.equipe, ['100001', '100002']);
  assert.equal(g.alocacao.manual, true);
  assert.equal(A.estado('perf:1'), null, 'fechou e esqueceu o estado');
});

// TROCADO DE PROPÓSITO NA REVISÃO DA F09: o botão confirma pelo jeito antigo (decisão do dono, 30/09/2026).
test('Conferir: com o nome sem ID, o botão confirma pelo jeito antigo (participação, nunca a divisão); "Conferir nomes" leva ao quadro do RH', async () => {
  const lista = [osBase({equipe: ['100001', 'Terceiro Fictício']})];
  const {c, salvos, cfgs} = tela({lista});
  const d = dialogo();
  c.perfDialog = (titulo, corpo) => { d.corpo = corpo; return d; };
  let foiAoRH = false;
  c.document = {querySelector: q => q === '[data-quadro="perf-rh"]' ? {open: false, scrollIntoView() { foiAoRH = true; }} : null};
  await c.perfEditarParticipacao('1');
  const ok = d.els['#perf-aloc-ok'], status = d.els['#perf-aloc-status'];
  assert.equal(ok.disabled, false);
  assert.equal(status.textContent, '');
  assert.match(d.corpo, />Confirmar pelo jeito antigo</);
  d.els['#perf-aloc'].onclick({target: alvo({alocAcao: 'ir-rh'})});
  assert.equal(foiAoRH, true);
  assert.equal(d.open, false);
  assert.equal(salvos.length + cfgs.length, 0, 'ir ao RH não grava nada');
});

test('Conferir: descarte do servidor e conflito (409) aparecem com a mensagem inteira e o Recomeçar', async () => {
  const gravada = D.montar([{equipeId: 'eq-aguia', liderId: '100001', membros: ['100001', '100002']}]);
  gravada.em = '2026-10-02T16:00:00.000Z'; gravada.por = 'Gestor Teste';
  const ouvintes = {};
  let proximo = 'descarte';
  const loja = {on: (ev, f) => { (ouvintes[ev] = ouvintes[ev] || []).push(f); }, onConflict: f => { (ouvintes.conflito = ouvintes.conflito || []).push(f); },
    getQueue: () => [{action: 'upsert', os: {id: '1'}}]};
  const lista = [osBase({equipe: ['100001', '100002'], alocacao: gravada})];
  const t = tela({lista, loja: {...loja, saveOS: o => {
    t.salvos.push(js(o));
    if (proximo === 'descarte') for (const f of ouvintes['os-gravada']) f({id: '1', os: {id: '1'}, enviado: js(o), descartado: ['alocacao'], motivo: {alocacao: 'A pessoa de ID 100002 não está nas fichas nem nos contratos de freelancer do RH.'}});
    else for (const f of ouvintes.conflito) f(js(o), {id: '1', atualizadoPor: 'Outro Tablet'});
  }}});
  const d = dialogo();
  t.c.perfDialog = (titulo, corpo) => { d.corpo = corpo; return d; };
  await t.c.perfEditarParticipacao('1');
  const box = d.els['#perf-aloc'], ok = d.els['#perf-aloc-ok'], status = d.els['#perf-aloc-status'], rec = d.els['#perf-aloc-recomecar'];
  box.onchange({target: {dataset: {alocPct: '', g: '0', p: '100001'}, value: '70'}});
  await ok.onclick();
  assert.equal(t.salvos.length, 1);
  assert.equal(t.salvos[0].alocacao.em, gravada.em, 'editou a partir da gravada: devolve o em dela');
  assert.match(status.textContent, /O servidor não gravou a divisão: A pessoa de ID 100002 não está nas fichas/);
  assert.match(status.textContent, /voltou à divisão que está no servidor/);
  assert.equal(d.open, true, 'fica aberto com o motivo');
  assert.equal(rec.hidden, false, 'oferece recomeçar');
  // O conflito de versão (outra gravação chegou antes).
  proximo = 'conflito';
  lista[0].alocacao = js(gravada);   // o store repôs a divisão do servidor (_reporAlocacao)
  rec.onclick();
  assert.equal(rec.hidden, true);
  box.onchange({target: {dataset: {alocPct: '', g: '0', p: '100001'}, value: '55'}});
  ok.disabled = false;
  await ok.onclick();
  // O aviso de conflito do app fica atrás do diálogo modal: o Conferir fecha e o motivo vai no aviso.
  assert.equal(d.open, false);
  const [msg, tipo] = t.toasts.pop();
  assert.equal(tipo, 'error');
  assert.match(msg, /^O\.S\. 5001: Outra gravação desta O\.S\. chegou ao servidor antes \(Outro Tablet\)\. A sua divisão não foi gravada/);
  assert.match(msg, /toque em Conferir de novo/);
  assert.doesNotMatch(msg + status.textContent, /—/);
});

test('409 local: a divisão gravada mudou em outro aparelho depois que a tela abriu; nada é enviado', async () => {
  const gravada = D.montar([{equipeId: 'eq-aguia', liderId: '100001', membros: ['100001', '100002']}]);
  gravada.em = '2026-10-02T16:00:00.000Z';
  const lista = [osBase({equipe: ['100001', '100002'], alocacao: js(gravada)})];
  const {A, salvos} = tela({lista});
  A.iniciar('t', {os: lista[0], equipes: EQUIPES, papel: 'pcp'});
  A.executar('t', {alocAcao: 'pct', g: '0', p: '100001', valor: '70'});
  // O pull trouxe a divisão que outro tablet gravou (50/50).
  const outra = js(gravada); outra.grupos[0].membros[0].cota = 5000; outra.grupos[0].membros[1].cota = 5000; outra.em = '2026-10-02T16:05:00.000Z'; outra.por = 'Outro Gestor';
  lista[0].alocacao = outra;
  const r = await A.gravarNaOS('t', {usuario: 'Gestor'});
  assert.equal(r.estado, 'conflito');
  assert.match(r.mensagem, /foi mudada em outro aparelho \(Outro Gestor\) enquanto você editava\. Nada foi gravado/);
  assert.equal(salvos.length, 0);
  // Sem mudança de conteúdo (só o carimbo andou, a própria gravação): grava com o em de agora.
  lista[0].alocacao = {...js(gravada), em: '2026-10-02T16:09:00.000Z'};
  const ok = await A.gravarNaOS('t', {usuario: 'Gestor', prazoMs: 50});
  assert.equal(ok.estado, 'gravada');
  assert.equal(salvos[0].alocacao.em, '2026-10-02T16:09:00.000Z');
});

test('repintar não perde o estado (variável do módulo) e reabrir a mesma O.S. mantém a montagem', () => {
  const {A} = tela();
  const os = osBase();
  const root = {innerHTML: ''};
  A.iniciar('t', {os, equipes: EQUIPES, papel: 'pcp'});
  A.montar(root, 't');
  root.onclick({target: alvo({alocAcao: 'equipe', e: 'eq-leao'})});
  root.onchange({target: {dataset: {alocPct: '', g: '0', p: '100005'}, value: '75'}});
  assert.match(root.innerHTML, /value="75"/);
  root.innerHTML = '';
  A.repintar('t');
  assert.match(root.innerHTML, /value="75"/, 'a repintura volta com o que foi montado');
  assert.equal(A.iniciar('t', {os, equipes: EQUIPES, papel: 'pcp'}).aloc.grupos[0].membros[0].cota, 7500, 'reabrir sem reiniciar mantém');
  assert.equal(A.iniciar('t', {os, equipes: EQUIPES, papel: 'pcp', reiniciar: true}).aloc.grupos.length, 0);
});

/* ───────────── o store adota o `em` da resposta (pendência da F08) ───────────── */

function lojaReal({lista = [], responder}) {
  const ls = new Map([['impresilk_inst_os', JSON.stringify(lista)], ['impresilk_inst_fila', '[]']]);
  const idb = {transaction() { const tx = {objectStore: () => ({get() { const q = {}; queueMicrotask(() => q.onsuccess?.({target: {result: null}})); return q; }, put() { queueMicrotask(() => tx.oncomplete?.()); }, delete() { queueMicrotask(() => tx.oncomplete?.()); }})}; return tx; }};
  const ctx = vm.createContext({console: {log() {}, warn() {}, error() {}}, navigator: {onLine: true}, window: {addEventListener() {}},
    localStorage: {getItem: k => ls.has(k) ? ls.get(k) : null, setItem: (k, v) => ls.set(k, v), removeItem: k => ls.delete(k)},
    indexedDB: {open() { const q = {}; queueMicrotask(() => q.onsuccess({target: {result: idb}})); return q; }, deleteDatabase() {}},
    setTimeout: () => 1, clearTimeout() {}, AbortController, API_BASE: 'http://teste',
    fetch: async (_u, req) => { const r = await responder(JSON.parse(req.body)); return {ok: !(r.status >= 400), status: r.status || 200, json: async () => r}; }});
  vm.runInContext(ler('store.js'), ctx);
  return vm.runInContext('STORE', ctx);
}
const pausa = ms => new Promise(r => setTimeout(r, ms));
const esvaziar = async s => { for (let i = 0; i < 50 && s.getQueue().length; i++) { await s.trySync(); await pausa(2); } };

test('store: a 2a edição da divisão feita com a 1a no ar adota o em da resposta e não é descartada como cópia velha', async () => {
  const fichaRH = (id, nome, cpf) => ({colecao: 'colaboradores', id, apagado: false, registro: {id, nome, apelido: nome.split(' ')[0].toLowerCase(), cpf}});
  const e = await edge('pcp-sync', {
    pcp_registros: [{id: '1', colecao: 'os', apagado: false, atualizado_em: '2026-10-02T15:00:00Z', registro: osBase({equipe: ['100001', '100002']})}],
    registros: [fichaRH('ana-f', 'Ana Fictícia', '10000111111'), fichaRH('bia-f', 'Bia Fictícia', '10000222222')],
    pcp_config_global: [{id: true, config: {instaladores: ['Ana'], performancePCP: {equipes: js(EQUIPES), participacoes: []}}, atualizado_em: '2026-10-01T10:00:00Z'}]});
  const gestor = {papel: 'pcp', nome: 'Gestor Teste', sub: 'gestor'};
  const noServidor = () => e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === '1').registro;
  const aguia = () => js(D.montar([{equipeId: 'eq-aguia', liderId: '100001', membros: ['100001', '100002']}]));
  const r0 = await e.call({action: 'upsert', os: {...js(noServidor()), alocacao: aguia()}}, gestor);
  assert.ok(!r0.descartado, JSON.stringify(r0));
  const em0 = noServidor().alocacao.em;
  const com = (base, lider) => { const a = js(base); const x = D.editar(a, {nivel: 'membros', grupo: 0, pessoaId: '100001'}, lider).alocacao; x.em = base.em; return x; };
  let s = null, primeiro = true, eventos = 0;
  s = lojaReal({lista: [js(noServidor())], responder: async q => {
    await pausa(3);   // carimbos em milissegundos diferentes
    if (q.action === 'upsert' && primeiro) {
      primeiro = false;
      // Com a 1a gravação no ar, a gestão confirma outra divisão a partir da cópia do aparelho (em antigo).
      const rascunho = js(s.getOS('1'));
      rascunho.alocacao = com(rascunho.alocacao, 7000);
      rascunho.atualizadoEm = new Date(Date.now() + 1000).toISOString();
      s.saveOS(rascunho);
    }
    return e.call(q, gestor);
  }});
  s.on('os-gravada', () => { eventos++; });
  await s.pronto();
  const primeira = js(s.getOS('1'));
  primeira.alocacao = com(primeira.alocacao, 5000);
  primeira.atualizadoEm = new Date().toISOString();
  s.saveOS(primeira);
  await esvaziar(s);
  const g = noServidor();
  assert.notEqual(g.alocacao.em, em0, 'o servidor carimbou de novo');
  assert.deepEqual(g.alocacao.grupos[0].membros.map(m => m.cota), [7000, 3000], 'a segunda edição entrou');
  assert.equal(js(s.avisosAlocacao()).length, 0, 'nenhum descarte');
  assert.deepEqual(g.alocacaoLog.map(x => x.acao), ['criar', 'alterar', 'alterar']);
  assert.equal(eventos, 2, 'o store avisa o resultado de cada envio');
  // Prova de que o teste mede: a mesma edição com o em antigo seria descartada.
  const velha = await e.call({action: 'upsert', os: {...js(g), alocacao: com({...g.alocacao, em: em0}, 6000)}}, gestor);
  assert.deepEqual(velha.descartado, ['alocacao']);
});

/* ───────────── casca ───────────── */

/* A VERSÃO VEM DE APP_VERSAO (config.js), nunca escrita aqui: fixar a versão
   no teste travava o deploy na subida seguinte (revisão da F09). */
test('alocacao-ui.js entra no index.html (depois da performance) e no SHELL do sw.js, na versão de APP_VERSAO; não no celular do instalador', () => {
  const v = /const APP_VERSAO = '(v\d+)'/.exec(ler('config.js'))[1];
  const index = ler('index.html'), sw = ler('sw.js');
  assert.match(index, new RegExp(`<script src="performance\\.js\\?v=${v}"></script>\\s*<script src="alocacao-ui\\.js\\?v=${v}"></script>`));
  assert.ok(/const SHELL = \[([\s\S]*?)\];/.exec(sw)[1].includes(`'alocacao-ui.js?v=${v}'`), 'no SHELL do sw.js');
  assert.ok(sw.includes(`const CACHE = 'impresilk-shell-${v}'`), 'CACHE na mesma versão');
  assert.doesNotMatch(ler('equipe.html'), /alocacao-ui/);
  /* O Conferir não grava a participação do blob, com UMA exceção: o jeito
     antigo (O.S. com nome sem ficha no RH, decisão do dono de 30/09/2026). */
  const perf = ler('performance.js');
  const conferir = perf.slice(perf.indexOf('async function perfEditarParticipacao'), perf.indexOf('/* ---------------------------------------------------------------- LOGO'));
  const antigo = conferir.slice(conferir.indexOf('const confirmarAntigo'), conferir.indexOf('ok.onclick'));
  assert.match(antigo, /ALOCUI\.paraParticipacao[\s\S]*perfSalvar\(atual\)/);
  assert.doesNotMatch(conferir.replace(antigo, ''), /perfSalvar|saveCFG|participacoes\s*=/);
  assert.match(conferir, /ALOCUI\.gravarNaOS/);
});
