/* AS 10 EQUIPES FIXAS (F06, 29/09/2026). Pedido do dono: "10 equipes fixas
 * (Águia, Leão, Pantera, Lobo, Tigre, Falcão, Carcará, Onça, Lobo-Guará,
 * Touro) com cor fixa, ícone do animal, líder e integrantes fixos; renomear ou
 * trocar cor não quebra histórico". Casos ruins primeiro. Dados fictícios:
 * o repositório é público (CPF inventado; o ID é o começo dele).
 */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const P = require('../performance.js');
const {edge} = require('./helpers/edge.cjs');

const fichaRH = (id, nome, apelido, cpf) => ({colecao:'colaboradores', id, apagado:false, registro:{id, nome, apelido, cpf}});
const RH = [fichaRH('carla-lima', 'Carla Ficticia Lima', 'carla', '10000300000'), fichaRH('paulo-tx', 'Paulo Ficticio Teixeira', 'paulo', '20000900000')];
const cfgRow = cfg => [{id:true, config:cfg, atualizado_em:'2026-09-19T10:00:00Z'}];
const CARLA = {chave:'100003', nome:'Carla'}, PAULO = {chave:'200009', nome:'Paulo'};
const equipe = (extra = {}) => ({id:'eq-aguia', nome:'Águia', emblema:'🦅', animal:'aguia', cor:'azul', liderPadraoId:'100003', membros:[CARLA, PAULO], ativo:true, ...extra});
const salvarEquipes = async (e, antes, equipes, quem = {papel:'pcp', nome:'Gestor'}) =>
  e.call({action:'setCfg', baseCfg:{performancePCP:antes}, cfg:{performancePCP:{...antes, equipes}}}, quem);
const gravado = e => e.db.pcp_config_global[0].config.performancePCP;

/* ------------------------------------------------ servidor: cor e animal */

test('servidor: cor fora da paleta é recusada com aviso (não 422) e nunca fica gravada', async () => {
  const perf = {equipes:[], participacoes:[]};
  const e = await edge('pcp-sync', {pcp_config_global:cfgRow({performancePCP:perf}), registros:RH});
  for (const ruim of ['#ff0000', 'azul" style="background:url(x)', 'red', 'AZUL']) {
    const r = await salvarEquipes(e, gravado(e) || perf, [equipe({cor:ruim})]);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(gravado(e).equipes[0].cor, '', 'cor fora da paleta não entra (fica vazia, "nenhuma"): ' + ruim);
    assert.ok((r.avisos || []).some(a => /cor/i.test(a)), 'quem salvou fica sabendo: ' + ruim);
  }
  const ok = await salvarEquipes(e, gravado(e), [equipe({cor:'verde'})]);
  assert.equal(ok.ok, true);
  assert.equal(gravado(e).equipes[0].cor, 'verde');
});

test('servidor: cor inválida numa equipe que já tinha cor mantém a de antes', async () => {
  const perf = {equipes:[equipe()], participacoes:[]};
  const e = await edge('pcp-sync', {pcp_config_global:cfgRow({performancePCP:perf}), registros:RH});
  const r = await salvarEquipes(e, perf, [equipe({cor:'fucsia', nome:'Águia Real'})]);
  assert.equal(r.ok, true);
  assert.equal(gravado(e).equipes[0].cor, 'azul');
  assert.equal(gravado(e).equipes[0].nome, 'Águia Real', 'o resto da edição entra');
});

test('servidor: animal fora da lista é ignorado sem 422; animal válido dita o emblema', async () => {
  const perf = {equipes:[], participacoes:[]};
  const e = await edge('pcp-sync', {pcp_config_global:cfgRow({performancePCP:perf}), registros:RH});
  const r = await salvarEquipes(e, perf, [equipe({animal:'dragao'})]);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(r.ok, true);
  assert.equal(gravado(e).equipes[0].animal, '');
  assert.ok((r.avisos || []).some(a => /animal/i.test(a)));
  const t = await salvarEquipes(e, gravado(e), [equipe({animal:'onca', emblema:'🤝'})]);
  assert.equal(t.ok, true);
  assert.equal(gravado(e).equipes[0].animal, 'onca');
  assert.equal(gravado(e).equipes[0].emblema, '🐆', 'o emblema segue o animal (a aba antiga mostra o emblema)');
});

/* ------------------------------------- servidor: aba v133 e líder */

test('servidor: aba v133 que renomeia a equipe não apaga cor, animal nem líder', async () => {
  const perf = {equipes:[equipe()], participacoes:[]};
  const e = await edge('pcp-sync', {pcp_config_global:cfgRow({performancePCP:perf}), registros:RH});
  // A v133 não conhece os campos novos e não acha o emblema no rádio: grava 🤝.
  const {animal, cor, liderPadraoId, ...semCampos} = equipe();
  const r = await salvarEquipes(e, perf, [{...semCampos, nome:'Águia Dourada', emblema:'🤝'}]);
  assert.equal(r.ok, true, JSON.stringify(r));
  const g = gravado(e).equipes[0];
  assert.equal(g.nome, 'Águia Dourada');
  assert.equal(g.animal, 'aguia');
  assert.equal(g.cor, 'azul');
  assert.equal(g.liderPadraoId, '100003');
  assert.equal(g.emblema, '🦅');
});

test('servidor: a tela nova que limpa o líder (campo vazio) limpa de verdade', async () => {
  const perf = {equipes:[equipe()], participacoes:[]};
  const e = await edge('pcp-sync', {pcp_config_global:cfgRow({performancePCP:perf}), registros:RH});
  const r = await salvarEquipes(e, perf, [equipe({liderPadraoId:''})]);
  assert.equal(r.ok, true);
  // Fica o vazio, como veio: apagar a chave fazia o banco divergir do aparelho (409 falso).
  assert.equal(gravado(e).equipes[0].liderPadraoId, '');
});

test('servidor: líder que não é membro (ou não é ID) é ignorado com aviso', async () => {
  const perf = {equipes:[], participacoes:[]};
  const e = await edge('pcp-sync', {pcp_config_global:cfgRow({performancePCP:perf}), registros:RH});
  for (const ruim of ['999999', 'Carla', '10000300000']) {
    const r = await salvarEquipes(e, gravado(e) || perf, [equipe({liderPadraoId:ruim})]);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(gravado(e).equipes[0].liderPadraoId, '', 'não entra: ' + ruim);
    assert.ok((r.avisos || []).some(a => /líder/i.test(a)));
  }
  // Aba v133 tira o líder dos integrantes: o líder preservado deixa de valer.
  const antes = {equipes:[equipe()], participacoes:[]};
  const e2 = await edge('pcp-sync', {pcp_config_global:cfgRow({performancePCP:antes}), registros:RH});
  const {liderPadraoId, ...semLider} = equipe();
  const r2 = await salvarEquipes(e2, antes, [{...semLider, membros:[PAULO]}]);
  assert.equal(r2.ok, true);
  assert.equal(gravado(e2).equipes[0].liderPadraoId, '');
  assert.ok((r2.avisos || []).some(a => /líder/i.test(a)));
});

/* A chave do membro fica COMO VEIO (revisão F06): a aba presa na v133 compara
   pelo slug o que ela mesma gravou, e reescrever para o ID quebrava o modelo
   "Equipe salva" e o selo da pessoa naquela aba. Quem lê converte. */
test('servidor: membro gravado pelo slug do RH fica como veio; o líder é conferido pelo ID', async () => {
  const perf = {equipes:[], participacoes:[]};
  const e = await edge('pcp-sync', {pcp_config_global:cfgRow({performancePCP:perf}), registros:RH});
  const r = await salvarEquipes(e, perf, [equipe({membros:[{chave:'carla-lima', nome:'Carla'}, {chave:'paulo', nome:'Paulo', apelido:'paulo'}]})]);
  assert.equal(r.ok, true, JSON.stringify(r));
  const g = gravado(e).equipes[0];
  assert.deepEqual(g.membros.map(m => m.chave), ['carla-lima', 'paulo'], 'o servidor não reescreve a chave');
  assert.deepEqual(g.membros.map(m => m.nome), ['Carla', 'Paulo'], 'o formato não muda: {chave, nome, ...}');
  assert.equal(g.liderPadraoId, '100003', 'o líder é conferido pelo ID de hoje do slug');
  assert.deepEqual(r.cfg.performancePCP.equipes[0].membros.map(m => m.chave), ['carla-lima', 'paulo'], 'e desce como foi mandado');
  // Slug e ID da mesma pessoa na mesma equipe viram um membro só (o primeiro, como veio).
  const t = await salvarEquipes(e, gravado(e), [equipe({membros:[{chave:'carla-lima', nome:'Carla'}, CARLA, PAULO]})]);
  assert.equal(t.ok, true);
  assert.deepEqual(gravado(e).equipes[0].membros.map(m => m.chave), ['carla-lima', '200009']);
});

/* --------------------------- servidor: nome repetido e pessoa em duas */

test('servidor: nome repetido entre equipes ATIVAS é recusado (409) só para a nova', async () => {
  // Duplicata que já estava no banco não trava nada.
  const perf = {equipes:[equipe(), equipe({id:'eq-aguia-2', membros:[PAULO], liderPadraoId:'200009'})], participacoes:[]};
  const e = await edge('pcp-sync', {pcp_config_global:cfgRow({performancePCP:perf}), registros:RH});
  const conf = await e.call({action:'setCfg', baseCfg:{performancePCP:perf}, cfg:{performancePCP:{...perf, participacoes:[{id:'os1', membros:[{...CARLA, percentual:60}, {...PAULO, percentual:40}]}]}}}, {papel:'pcp', nome:'Gestor'});
  assert.equal(conf.ok, true, JSON.stringify(conf));
  const atual = gravado(e);
  // A nova, com o nome de outra ativa (maiúscula, acento e hífen não mudam o nome).
  const leao = equipe({id:'eq-leao', nome:'Leão', animal:'leao', cor:'laranja', membros:[CARLA]});
  assert.equal((await salvarEquipes(e, atual, [...atual.equipes, leao])).ok, true);
  const depois = gravado(e);
  const n = await salvarEquipes(e, depois, [...depois.equipes, equipe({id:'eq-x', nome:' leao ', animal:'lobo', cor:'roxo', membros:[PAULO], liderPadraoId:'200009'})]);
  assert.equal(n.status, 409);
  assert.equal(n.conflitoCfg, true);
  assert.match(n.campos.join(' '), /Leão/);
  // Desativada não disputa o nome.
  const d = await salvarEquipes(e, depois, [...depois.equipes, equipe({id:'eq-y', nome:'Leão', animal:'lobo', cor:'roxo', membros:[PAULO], liderPadraoId:'200009', ativo:false})]);
  assert.equal(d.ok, true, JSON.stringify(d));
});

/* A REGRA ANTIGA ERA "UMA EQUIPE ATIVA POR COMPOSIÇÃO" (v124). Com as dez
   equipes fixas ela sai de propósito: duas equipes podem ter a mesma gente
   (a mesma dupla fixa em Tigre e em Touro, enquanto o cadastro é arrumado), e
   quem decide a entrega é a confirmação, não o cadastro. O que fica é o aviso
   de pessoa fixa em duas equipes. */
test('servidor: mesma pessoa fixa em duas equipes ativas grava com aviso', async () => {
  const perf = {equipes:[equipe()], participacoes:[]};
  const e = await edge('pcp-sync', {pcp_config_global:cfgRow({performancePCP:perf}), registros:RH});
  const r = await salvarEquipes(e, perf, [equipe(), equipe({id:'eq-tigre', nome:'Tigre', animal:'tigre', cor:'vermelho'})]);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(gravado(e).equipes.length, 2);
  assert.ok((r.avisos || []).some(a => /Carla/.test(a) && /Águia/.test(a) && /Tigre/.test(a)), JSON.stringify(r.avisos));
});

test('servidor: pessoa em duas equipes pelo slug e pelo ID é a mesma pessoa (régua do RH)', async () => {
  const {conferirEquipesAtivas, resolverPessoas} = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const pessoas = resolverPessoas({pessoas:[{chave:'carla-lima', id:'100003', nome:'Carla Ficticia Lima', apelido:''}]});
  const perf = {equipes:[
    {id:'a', nome:'Águia', ativo:true, membros:[{chave:'carla-lima', nome:'Carla'}]},
    {id:'b', nome:'AGUIA', ativo:true, membros:[{chave:'100003', nome:'Carla'}]},
    {id:'c', nome:'Águia', ativo:false, membros:[{chave:'100003', nome:'Carla'}]},
  ]};
  const x = conferirEquipesAtivas(perf, pessoas);
  assert.deepEqual([...x.nomes.keys()], ['aguia']);
  assert.deepEqual(x.pessoasEmDuas.get('100003'), ['a', 'b'], 'desativada não conta');
  assert.equal(conferirEquipesAtivas(perf).pessoasEmDuas.size, 0, 'sem a régua (RH fora do ar), fica a chave crua');
  // Mesma conta na tela.
  const tela = P.conferirEquipes(perf.equipes, m => m.chave === 'carla-lima' ? '100003' : m.chave);
  assert.deepEqual([...tela.nomes.keys()], ['aguia']);
  assert.deepEqual(tela.pessoasEmDuas.get('100003'), ['a', 'b']);
});

/* ----------------------------------------------------- logos */

test('dez logos de 40 KB cabem no teto de 400 KB; o décimo primeiro não', async () => {
  const {validarPerformance} = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const prefixo = 'data:image/png;base64,';
  const logo = prefixo + 'A'.repeat(40000 - prefixo.length);
  assert.equal(logo.length, 40000);
  const eqs = P.ANIMAIS.map((a, i) => ({id:'e' + i, nome:a.rotulo, emblema:a.icone, animal:a.id, cor:P.CORES[i].id, logo, membros:[{chave:String(100000 + i), nome:'P' + i}]}));
  assert.equal(validarPerformance({equipes:eqs, participacoes:[]}), '');
  assert.match(validarPerformance({equipes:[...eqs, {...eqs[0], id:'e10', nome:'Extra'}], participacoes:[]}), /400 KB/);
});

/* ----------------------------------------------------- regra da tela */

test('duas equipes ativas com a mesma composição: a entrega fica sem equipe, sem escolher ao acaso', () => {
  const a = {chave:'100001', nome:'Ana'}, b = {chave:'100002', nome:'Bia'};
  const salvas = [
    {id:'tigre', nome:'Tigre', emblema:'🐯', membros:[a, b], ativo:true},
    {id:'touro', nome:'Touro', emblema:'🐂', membros:[b, a], ativo:true},
  ];
  const reg = {id:'os1', membros:P.iguais([a, b])};
  assert.equal(P.equipeDoRegistro(reg, salvas), null);
  assert.equal(P.equipeDoRegistro(reg, [...salvas].reverse()), null, 'a ordem da lista não decide');
  assert.equal(P.comEquipes([reg], salvas)[0].equipeId, undefined);
  // Uma delas desativada: sobra exatamente uma, e ela vale.
  assert.equal(P.equipeDoRegistro(reg, [salvas[0], {...salvas[1], ativo:false}]).id, 'tigre');
  // O id gravado na confirmação continua mandando.
  assert.equal(P.equipeDoRegistro({...reg, equipeId:'touro'}, salvas).id, 'touro');
});

test('revisão fechada mantém o nome e o emblema da época, sem a cor e o animal de hoje', () => {
  const a = {chave:'100001', nome:'Ana'};
  const salvas = [{id:'e', nome:'Carcará Novo', emblema:'🐦', animal:'carcara', cor:'marrom', membros:[a], ativo:true}];
  const reg = {id:'1', confirmado:true, equipeId:'e', equipeNome:'Carcará', emblema:'🦅', membros:P.iguais([a])};
  const [fechada] = P.comEquipes([reg], salvas, {historico:true});
  assert.equal(fechada.equipeNome, 'Carcará');
  assert.equal(fechada.emblema, '🦅');
  assert.equal(fechada.cor, undefined, 'trocar a cor hoje não pinta o fechamento');
  assert.equal(fechada.animal, undefined);
  const [aberta] = P.comEquipes([reg], salvas);
  assert.equal(aberta.equipeNome, 'Carcará Novo');
  assert.equal(aberta.cor, 'marrom');
  assert.equal(aberta.animal, 'carcara');
  assert.equal(reg.cor, undefined, 'o registro original não é tocado');
});

/* A tela com o ambiente mínimo (sem DOM), como em performance.test.cjs. */
function tela(cfgPerf, rh = []) {
  const src = fs.readFileSync(require.resolve('../performance.js'), 'utf8');
  const porId = new Map(rh.map(p => [p.id, p]));
  const c = {STORE:{getCFG:() => ({performancePCP:cfgPerf}), getAllOS:() => []}, STATE:{user:{papel:'admin'}, _perfRankMedida:'entregas'},
    periodoOuMes:() => ({de:'2026-09-01', ate:'2026-09-19'}), classificarEntregas:os => ({instalacoes:os}),
    OPERACAO:{emIntervalo:() => true, equipe:os => os.equipe || [], ehIdPessoa:v => /^\d{6}$/.test(String(v || ''))},
    diaEntrega:() => '2026-09-19', valorDaOS:o => o.valorTotal,
    nomeExibicaoCasa:n => { const p = porId.get(n) || rh.find(x => x.apelido === n); return p ? {chave:p.chave, id:p.id, nome:p.nome} : {chave:n, id:'', nome:n}; },
    pessoasRH:() => rh, avatarRH:() => '',
    esc:s => String(s ?? '').replace(/[&<>"]/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[ch])), dinheiroCasa:n => 'VALOR-' + n, filtroPeriodoHTML:() => ''};
  vm.createContext(c); vm.runInContext(src, c);
  return c;
}

test('tela: chips e pódio mostram a cor e o animal; cor fora da paleta não vira classe nem style=', () => {
  const boa = {id:'q', nome:'Pantera', emblema:'🐆', animal:'pantera', cor:'roxo', membros:[{chave:'100001', nome:'Ana'}], ativo:true};
  const ruim = {id:'r', nome:'Onça', emblema:'🐆', animal:'onca', cor:'roxo" style="x', membros:[{chave:'100002', nome:'Bia'}], ativo:true};
  const velha = {id:'s', nome:'Antiga', emblema:'🚀', membros:[{chave:'100003', nome:'Caio'}], ativo:true};
  const c = tela({equipes:[boa, ruim, velha], participacoes:[]});
  const regs = [{id:'1', membros:P.iguais([{chave:'100001', nome:'Ana'}]), confirmado:false, valor:1, os:{}}];
  const html = c.perfRankingEquipesHTML(regs, {equipes:[boa, ruim, velha]});
  assert.doesNotMatch(html, /style=/, 'cor nunca vira style=');
  assert.match(html, /perf-cor-roxo/);
  assert.equal((html.match(/perf-cor-roxo/g) || []).length, 1, 'só o pódio da Pantera; nada da Onça com a cor forjada');
  // Desde as logos das equipes (29/09/2026): o animal aparece com a LOGO dele
  // (arquivo do site), não mais com o emoji.
  assert.match(html, /src="equipe-pantera\.webp"/);
  assert.match(html, /🚀/, 'equipe antiga, sem animal, segue com o emblema');
  // Pódio da equipe que entregou: cor e logo do animal.
  assert.match(html, /perf-podio-item[^"]*perf-cor-roxo/);
});

test('tela: a pessoa na equipe pelo slug antigo do RH é achada pelo ID (selo e composição)', () => {
  const rh = [{chave:'carla-lima', id:'100003', nome:'Carla Ficticia Lima', apelido:'carla'}];
  const eq = {id:'eq', nome:'Lobo', emblema:'🐺', animal:'lobo', cor:'grafite', membros:[{chave:'carla-lima', nome:'Carla Ficticia Lima'}], ativo:true};
  const c = tela({equipes:[eq], participacoes:[]}, rh);
  assert.equal(c.perfIdMembro({chave:'carla-lima', nome:'Carla Ficticia Lima'}), '100003');
  assert.equal(c.perfIdMembro({chave:'100003', nome:'Carla'}), '100003');
  // Apelido antigo sem ficha fica como está (não vira um xará).
  assert.equal(c.perfIdMembro({chave:'Pantera', nome:'Pantera', apelido:'Pantera'}), 'Pantera');
  assert.equal(c.perfPessoa('carla').chave, '100003', 'a chave nova da pessoa é o ID');
  const reg = {id:'os1', membros:P.iguais([{chave:'100003', nome:'Carla'}])};
  assert.equal(P.comEquipes([reg], [eq], c.perfOpcoesEquipe())[0].equipeId, 'eq');
});

test('tela: a equipe Pantera e a pessoa de apelido Pantera não se confundem', () => {
  const rh = [{chave:'pan', id:'300001', nome:'Joao Ficticio Pantera', apelido:'Pantera'}];
  const time = {id:'eq-pantera', nome:'Pantera', emblema:'🐆', animal:'pantera', cor:'roxo', membros:[{chave:'100001', nome:'Ana'}], ativo:true};
  const c = tela({equipes:[time], participacoes:[]}, rh);
  const reg = {id:'os1', membros:P.iguais([{chave:'300001', nome:'Pantera'}])};
  assert.equal(P.comEquipes([reg], [time], c.perfOpcoesEquipe())[0].equipeId, undefined, 'o freelancer Pantera não é a equipe Pantera');
});

/* O aparelho mostra o aviso do setCfg. Sem isto a gestão via a cor inválida
   "sumir" sem saber por quê (o servidor grava o resto e ignora o campo). */
test('aparelho: aviso do setCfg (campo ignorado) chega à tela, e a fila anda', async () => {
  const path = require('node:path');
  // A frase que o servidor produz de verdade (não uma inventada): concordância incluída.
  const {sanearEquipes} = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const avisosServidor = sanearEquipes({equipes:[{id:'a', nome:'Águia', emblema:'🦅', cor:'#ff0000', membros:[CARLA]}]}, null, null).avisos;
  assert.deepEqual(avisosServidor, ['A cor da equipe "Águia" não foi aceita (#ff0000): ficou sem.']);
  const avisoAnimal = sanearEquipes({equipes:[{id:'a', nome:'Águia', emblema:'🦅', animal:'dragao', membros:[CARLA]}]}, null, null).avisos;
  assert.deepEqual(avisoAnimal, ['O animal da equipe "Águia" não foi aceito (dragao): ficou sem.']);
  const ls = new Map([['impresilk_inst_os', '[]'], ['impresilk_inst_fila', JSON.stringify([{action:'setCfg', cfg:{performancePCP:{equipes:[], participacoes:[]}}, baseCfg:{}}])]]);
  const db = {transaction(){ const tx = {objectStore:() => ({get(){ const req = {}; queueMicrotask(() => req.onsuccess?.({target:{result:null}})); return req; }, put(){ queueMicrotask(() => tx.oncomplete?.()); }})}; return tx; }};
  const ctx = vm.createContext({console:{log(){}, warn(){}, error(){}}, navigator:{onLine:true}, window:{addEventListener(){}},
    localStorage:{getItem:k => ls.get(k) || null, setItem:(k, v) => ls.set(k, v), removeItem:k => ls.delete(k)},
    indexedDB:{open(){ const req = {}; queueMicrotask(() => req.onsuccess({target:{result:db}})); return req; }},
    setTimeout:() => 1, clearTimeout(){}, AbortController, API_BASE:'http://teste',
    fetch:async () => ({ok:true, status:200, json:async () => ({ok:true, cfg:{performancePCP:{equipes:[], participacoes:[]}}, versao:'v1', avisos:avisosServidor})})});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'store.js'), 'utf8'), ctx);
  const s = vm.runInContext('STORE', ctx);
  const avisos = []; s.on('item-aviso', e => avisos.push(...e.avisos));
  await s.pronto(); await s.trySync();
  assert.equal(s.getQueue().length, 0);
  assert.deepEqual(avisos, avisosServidor);
});

test('servidor: sem o RH (régua fora do ar), o líder de antes da equipe antiga não some por falta de rede', async () => {
  const {sanearEquipes} = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const antes = {equipes:[{id:'e', nome:'Lobo', emblema:'🐺', animal:'lobo', cor:'grafite', liderPadraoId:'100003', membros:[{chave:'carla-lima', nome:'Carla'}], ativo:true}]};
  const agora = {equipes:[{...antes.equipes[0], nome:'Lobo Cinzento'}]};
  const r = sanearEquipes(agora, antes, null);
  assert.equal(r.perf.equipes[0].liderPadraoId, '100003');
  assert.deepEqual(r.avisos, []);
  // Líder NOVO sem como conferir não entra.
  const novo = sanearEquipes({equipes:[{...agora.equipes[0], liderPadraoId:'999999'}]}, antes, null);
  assert.equal(novo.perf.equipes[0].liderPadraoId, '100003', 'fica o anterior');
});
