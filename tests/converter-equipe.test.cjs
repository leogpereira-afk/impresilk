/* NOMES ANTIGOS VIRAM ID PELA TELA (F12, 30/09/2026).
   A O.S. antiga guarda o nome que o PCP digitava; a tela "Conferir nomes"
   troca esse nome pelo ID da ficha do RH, uma O.S. por vez, pelo upsert
   normal. Cada teste parte do caso ruim: começo de nome, "Lucas" com três
   Lucas, "Terceiro", ID repetido, O.S. com divisão, 409 no meio do lote,
   outra gravação entre a conferência e o botão. Tudo fictício: o repositório
   é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const O = require('../operacao.js');
const {edge} = require('./helpers/edge.cjs');
const root = path.join(__dirname, '..');

// Fichas FICTÍCIAS do RH.
const FICHAS = [
  {chave:'bruno-alves', id:'100001', nome:'Bruno Alves Costa', apelido:'bruno', ativo:true},
  {chave:'bruno-martins', id:'100002', nome:'Bruno Martins Dias', apelido:'', ativo:true},
  {chave:'lucas-gabriel', id:'100010', nome:'Lucas Gabriel Souza', apelido:'', ativo:true},
  {chave:'lucas-natalino', id:'100011', nome:'Lucas Natalino Reis', apelido:'', ativo:true},
  {chave:'jose-adilando', id:'100020', nome:'José Adilando Rocha', apelido:'adilsom', ativo:true},
  {chave:'adriano-pinheiro', id:'100030', nome:'Adriano Pinheiro Lima', apelido:'', ativo:true},
  {chave:'adriano-nunes', id:'100031', nome:'Adriano Nunes Araujo', apelido:'', ativo:true},
  {chave:'rita-moraes', id:'100040', nome:'Rita Moraes', apelido:'rita', ativo:true},
  {chave:'freelancer:fl-renan', id:'100040', nome:'Renan Brito', apelido:'renan', freelancer:true, ativo:true},
  {chave:'freelancer:fl-pantera', id:'', nome:'Paulo Pantera Ficticio', apelido:'pantera', freelancer:true, ativo:true},
];
const DADOS = (vinculos = []) => ({pessoas:FICHAS, vinculos, lista:['Bruno', 'Lucas']});

/* -------------------------------------------------------------- função pura */
test('converterEquipe: idempotente; rodar de novo não muda nada', () => {
  const d = DADOS();
  const a = O.converterEquipe(['Bruno', 'Lucas Gabriel Souza', 'Adilsom'], d);
  assert.equal(a.mudou, true);
  assert.deepEqual(a.equipe, ['100001', '100010', '100020']);
  const b = O.converterEquipe(a.equipe, d);
  assert.equal(b.mudou, false);
  assert.deepEqual(b.equipe, a.equipe);
  assert.deepEqual(b.trocas, []);
});

test('converterEquipe: só troca com vínculo confirmado (salvo, apelido ou nome completo); começo de nome sem confirmação não casa', () => {
  const sem = O.converterEquipe(['Bruno Martins', 'Lucas Gab', 'Jose Adilando'], DADOS());
  assert.equal(sem.mudou, false, 'começo de nome é sugestão, não vínculo');
  assert.deepEqual(sem.equipe, ['Bruno Martins', 'Lucas Gab', 'Jose Adilando']);
  assert.deepEqual(sem.ficam.map(f => f.motivo), ['comeco', 'nenhuma', 'comeco']);
  assert.equal(sem.ficam[0].sugerido, '100002', 'a tela mostra a sugestão para alguém confirmar');
  assert.equal(O.confirmarNome('Bruno Martins', DADOS()).id, '', 'a régua de hoje acha, mas sem confirmação não converte');
  // Confirmado (vínculo salvo pela tela): troca.
  const com = O.converterEquipe(['Bruno Martins', 'Jose Adilando'], DADOS([{apelido:'Bruno Martins', id:'100002', chave:'bruno-martins'}, {apelido:'Jose Adilando', id:'100020', chave:'jose-adilando'}]));
  assert.deepEqual(com.equipe, ['100002', '100020']);
  assert.deepEqual(com.trocas.map(t => t.como), ['vinculo', 'vinculo']);
  // Apelido e nome completo exatos são o casamento único de hoje.
  assert.equal(O.confirmarNome('Adilsom', DADOS()).como, 'apelido');
  assert.equal(O.confirmarNome('Bruno Martins Dias', DADOS()).como, 'nome');
});

test('converterEquipe: não duplica ID (nome e ID da mesma pessoa, dois nomes da mesma pessoa)', () => {
  const r = O.converterEquipe(['Bruno', '100001', 'bruno', 'Bruno Alves Costa', 'Adilsom', 'José Adilando Rocha'], DADOS());
  assert.deepEqual(r.equipe, ['100001', '100020']);
  assert.equal(new Set(r.equipe).size, r.equipe.length);
  // O nome antes do ID: a pessoa fica uma vez só.
  assert.deepEqual(O.converterEquipe(['Lucas Natalino Reis', '100011'], DADOS()).equipe, ['100011']);
});

test('converterEquipe: não mexe em quem já é ID, nem no espaço dele', () => {
  const lista = [' 100002 ', '100002', '999999'];
  const r = O.converterEquipe(lista, DADOS());
  assert.equal(r.mudou, false);
  assert.deepEqual(r.equipe, lista);
  const m = O.converterEquipe([' 100002 ', 'Bruno'], DADOS());
  assert.deepEqual(m.equipe, [' 100002 ', '100001'], 'só o nome muda');
});

test('converterEquipe: "Lucas" com dois Lucas no RH é ambíguo e fica nome', () => {
  const r = O.converterEquipe(['Lucas', 'Adriano'], DADOS());
  assert.equal(r.mudou, false);
  assert.deepEqual(r.ficam.map(f => [f.nome, f.motivo]), [['Lucas', 'ambiguo'], ['Adriano', 'ambiguo']]);
  // Dois vínculos diferentes salvos para o mesmo nome também não escolhem.
  const dois = DADOS([{apelido:'Lucas', id:'100010'}, {apelido:'lucas', id:'100011'}]);
  assert.equal(O.converterEquipe(['Lucas'], dois).mudou, false);
  assert.equal(O.confirmarNome('Lucas', dois).motivo, 'vinculo-invalido');
});

test('converterEquipe: "Terceiro" e nome decidido sem ficha nunca viram pessoa', () => {
  // Nem com um vínculo salvo por engano apontando o marcador para alguém.
  const d = DADOS([{apelido:'Terceiro', id:'100001', chave:'bruno-alves'}, {apelido:'Zeca', semFicha:true}]);
  const r = O.converterEquipe(['Terceiro', 'terceiros', 'Terceirizado', 'Zeca', 'Bruno'], d);
  assert.deepEqual(r.equipe, ['Terceiro', 'terceiros', 'Terceirizado', 'Zeca', '100001']);
  assert.deepEqual(r.ficam.map(f => f.motivo), ['terceiro', 'terceiro', 'terceiro', 'sem-ficha']);
});

test('converterEquipe: ID repetido (ficha e contrato) e contrato sem CPF não convertem', () => {
  const r = O.converterEquipe(['Rita', 'Renan', 'Pantera'], DADOS([{apelido:'Renan', id:'100040'}]));
  assert.equal(r.mudou, false, JSON.stringify(r));
  assert.deepEqual(r.ficam.map(f => f.motivo), ['id-repetido', 'vinculo-invalido', 'sem-cpf']);
});

test('converterEquipe: vínculo salvo para ficha sem CPF é decisão de gente; o xará com ID não leva o nome', () => {
  // A régua de leitura ignora o vínculo sem ID e casa "Lucas" com o Lucas Ferreira; a troca por ID não grava isso.
  const pessoas = [{chave:'lucas-ferreira', id:'100050', nome:'Lucas Ferreira', apelido:'lucas'}, {chave:'lucas-prado', id:'', nome:'Lucas Prado'}];
  const d = {pessoas, vinculos:[{apelido:'Lucas', chave:'lucas-prado', nome:'Lucas Prado'}]};
  assert.equal(O.resolverPessoas(d).idDe('Lucas'), '100050', 'a leitura de hoje');
  const r = O.converterEquipe(['Lucas'], d);
  assert.equal(r.mudou, false);
  assert.equal(r.ficam[0].motivo, 'vinculo-sem-id');
});

test('converterEquipe: opcoes.nomes converte só os nomes escolhidos', () => {
  const r = O.converterEquipe(['Bruno', 'Adilsom'], DADOS(), {nomes:['adilsom']});
  assert.deepEqual(r.equipe, ['Bruno', '100020']);
  assert.equal(r.ficam[0].motivo, 'fora-da-escolha');
});

/* ------------------------------------------------------- a tela e o lote */
const ELENCO = {pessoas:FICHAS, antigos:[], veiculos:[], ferias:[], ausencias:[], avisos:[], fichaRH:true};
const osDe = (id, equipe, extra = {}) => ({id, numero:'N' + id, tipo:'externo', cliente:'Cliente fictício ' + id, rev:1, equipe, finalizadaEm:'2026-09-10T12:00:00', ...extra});
/* Loja falsa com a fila e os eventos do store.js: saveOS põe na lista e na
   fila (uma por O.S.); trySync manda na ordem, avisa 'os-gravada' e, na O.S.
   marcada, o conflito (409), que fica na fila marcado sem travar as outras. */
function loja({lista, cfg = {}, conflitos = [], hist = [], busca = null}) {
  const L = {os:lista.map(o => structuredClone(o)), fila:[], ouv:{}, conf:[], servidor:new Map(lista.map(o => [o.id, structuredClone(o)])),
    gravadas:[], hist:new Map(hist.map(o => [o.id, structuredClone(o)])), buscas:[]};
  const conf = new Set(conflitos);
  const S = {
    JANELA_LOCAL_DIAS:60,
    getAllOS:() => L.os,
    getOS:id => L.os.find(o => o.id === id) || L.hist.get(id) || null,
    historico:() => [...L.hist.values()],
    saveOS(o) {
      const i = L.os.findIndex(x => x.id === o.id);
      if (i >= 0) L.os[i] = o; else L.os.push(o);
      L.fila = L.fila.filter(q => !(q.action === 'upsert' && q.os.id === o.id));
      L.fila.push({action:'upsert', os:structuredClone(o)});
    },
    getCFG:() => cfg,
    saveCFG(c) { Object.assign(cfg, c); L.fila.push({action:'setCfg', cfg:structuredClone(c)}); },
    elenco:() => ELENCO,
    getQueue:() => structuredClone(L.fila),
    on(ev, fn) { (L.ouv[ev] ||= []).push(fn); },
    onConflict(fn) { L.conf.push(fn); },
    async trySync() {
      for (const it of [...L.fila]) {
        if (it.flag) continue;
        if (it.action === 'setCfg') { L.fila = L.fila.filter(q => q !== it); continue; }
        const id = it.os.id;
        if (conf.has(id)) { it.flag = true; for (const f of L.conf) f(structuredClone(it.os), {...structuredClone(L.servidor.get(id)), atualizadoPor:'Outro aparelho'}); continue; }
        L.fila = L.fila.filter(q => q !== it);
        L.servidor.set(id, structuredClone(it.os)); L.gravadas.push(structuredClone(it.os));
        for (const f of L.ouv['os-gravada'] || []) f({id, os:structuredClone(it.os), enviado:structuredClone(it.os), descartado:[]});
      }
    },
    async faixaHistorico() { return {de:'2026-05-01', ate:'2026-09-29'}; },
    async buscarHistorico(q) {
      L.buscas.push(q);
      const r = busca ? busca(q) : {itens:[], truncou:false};
      for (const o of r.itens || []) if (!L.os.some(x => x.id === o.id)) L.hist.set(o.id, structuredClone(o));
      return r;
    },
  };
  return {S, L};
}
function tela(S, papel = 'pcp', {cheio = () => false} = {}) {
  const guardado = {};
  const ctx = vm.createContext({
    console, Date, setTimeout, clearTimeout, structuredClone, STORE:S,
    STATE:{user:{nome:'Gestor Fictício', papel}, activeTab:'entregas'},
    document:{getElementById:() => null, querySelectorAll:() => [], body:{classList:{add() {}, remove() {}, contains:() => false}}},
    localStorage:{getItem:k => (k in guardado ? guardado[k] : null), setItem:(k, v) => { if (cheio(k)) throw new Error('QuotaExceededError'); guardado[k] = String(v); }, removeItem:k => { delete guardado[k]; }},
    esc:s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    toast() {}, confirm:() => true, CSS:{escape:s => s},
    pessoaDoElenco:() => null,
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'operacao.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'casa.js'), 'utf8'), ctx);
  // O que vem do contexto do vm é de outro "realm": vira JSON antes de comparar.
  const copia = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  return {run:code => vm.runInContext(code, ctx), json:async code => copia(await vm.runInContext(code, ctx)), ctx, guardado};
}

test('lote: O.S. com divisão (alocação) é pulada e vai no relatório; as outras convertem', async () => {
  const aloc = {grupos:[{equipeId:null, cota:10000, liderId:'100001', membros:[{pessoaId:'100001', papel:'lider', cota:10000}]}], em:'2026-09-20T10:00:00Z'};
  const {S, L} = loja({lista:[osDe('a', ['Bruno', 'Terceiro']), osDe('b', ['Bruno'], {alocacao:aloc}), osDe('c', ['Adilsom'])]});
  const t = tela(S);
  const plano = t.run('planoConversaoNomes()');
  assert.equal(plano.converte, 2); assert.equal(plano.comDivisao, 1);
  const itens = await t.json('converterNomesNasOSCasa(planoConversaoNomes(), {usuario:"Gestor Fictício"})');
  const por = Object.fromEntries(itens.map(i => [i.id, i]));
  assert.equal(por.a.estado, 'convertida'); assert.deepEqual(por.a.depois, ['100001', 'Terceiro'], '"Terceiro" fica nome');
  assert.equal(por.c.estado, 'convertida'); assert.deepEqual(por.c.depois, ['100020']);
  assert.equal(por.b.estado, 'pulada'); assert.match(por.b.motivo, /divisão/);
  assert.deepEqual(L.servidor.get('b').equipe, ['Bruno'], 'a O.S. com divisão não foi enviada');
  assert.deepEqual(L.gravadas.map(o => o.id), ['a', 'c'], 'uma gravação por O.S., só as que mudam');
  assert.equal(L.gravadas[0].atualizadoPor, 'Gestor Fictício');
});

test('lote: relê cada O.S. do STORE antes de gravar (o que mudou depois da conferência não se perde)', async () => {
  const {S, L} = loja({lista:[osDe('a', ['Bruno']), osDe('b', ['Adilsom']), osDe('c', ['Lucas Gabriel Souza'])]});
  const t = tela(S);
  t.run('var PLANO = planoConversaoNomes()');
  // Entre a conferência e o botão: outro aparelho pôs mais gente na 'a', a
  // 'b' ganhou divisão e a 'c' já foi convertida por outra aba.
  L.os[0] = {...L.os[0], equipe:['Bruno', '100002'], rev:2};
  L.os[1] = {...L.os[1], alocacao:{grupos:[], em:'2026-09-21T10:00:00Z'}};
  L.os[2] = {...L.os[2], equipe:['100010']};
  const itens = await t.json('converterNomesNasOSCasa(PLANO, {usuario:"Gestor Fictício"})');
  assert.equal(itens[0].estado, 'convertida');
  assert.deepEqual(L.servidor.get('a').equipe, ['100001', '100002'], 'a pessoa que entrou depois continua');
  assert.equal(L.servidor.get('a').rev, 2, 'grava sobre a versão relida, não sobre a da conferência');
  assert.equal(itens[1].estado, 'pulada'); assert.match(itens[1].motivo, /divisão/);
  assert.equal(itens[2].estado, 'pulada'); assert.match(itens[2].motivo, /Nada a trocar/);
  assert.deepEqual(L.gravadas.map(o => o.id), ['a']);
});

test('lote: vínculo que mudou no meio pula a O.S. em vez de gravar outra pessoa', async () => {
  const cfg = {instaladores:[], vinculosRH:[{apelido:'Luquinha', id:'100010', chave:'lucas-gabriel'}]};
  const {S, L} = loja({lista:[osDe('a', ['Luquinha'])], cfg});
  const t = tela(S);
  t.run('var PLANO = planoConversaoNomes()');
  cfg.vinculosRH = [{apelido:'Luquinha', id:'100011', chave:'lucas-natalino'}];
  t.run('esquecerVinculosCasa(); OPERACAO.esquecerPessoas()');
  const itens = await t.json('converterNomesNasOSCasa(PLANO, {})');
  assert.equal(itens[0].estado, 'pulada'); assert.match(itens[0].motivo, /mudou desde a conferência/);
  assert.equal(L.gravadas.length, 0);
});

test('lote: 409 numa O.S. não trava as outras; o relatório diz qual e por quê', async () => {
  const {S, L} = loja({lista:[osDe('a', ['Bruno']), osDe('b', ['Adilsom']), osDe('c', ['Bruno Martins Dias'])], conflitos:['b']});
  const t = tela(S);
  const itens = await t.json('converterNomesNasOSCasa(planoConversaoNomes(), {prazoMs:200, passoMs:5})');
  assert.deepEqual(itens.map(i => [i.id, i.estado]), [['a', 'convertida'], ['b', 'recusada'], ['c', 'convertida']]);
  assert.match(itens[1].motivo, /Outra gravação desta O\.S\. chegou antes ao servidor \(Outro aparelho\)/);
  assert.deepEqual(L.servidor.get('c').equipe, ['100002'], 'a O.S. depois do conflito foi gravada');
  assert.equal(L.fila.filter(q => q.flag).length, 1, 'só a do conflito fica presa na fila, marcada');
});

test('lote: sem resposta no prazo a troca fica na fila e o relatório diz; servidor mudo para o lote em vez de encher a fila', async () => {
  const {S, L} = loja({lista:[osDe('a', ['Bruno']), osDe('b', ['Adilsom']), osDe('c', ['Bruno Martins Dias']), osDe('d', ['Lucas Gabriel Souza'])]});
  S.trySync = async () => {};   // servidor mudo
  const t = tela(S);
  const itens = await t.json('converterNomesNasOSCasa(planoConversaoNomes(), {prazoMs:30, passoMs:5})');
  assert.deepEqual(itens.map(i => i.estado), ['na-fila', 'na-fila', 'pulada', 'pulada']);
  assert.match(itens[0].motivo, /fila deste aparelho/);
  assert.match(itens[2].motivo, /o servidor parou de responder/);
  assert.deepEqual(S.getOS('c').equipe, ['Bruno Martins Dias'], 'a que não foi enviada ficou como estava');
  assert.equal(L.fila.length, 2, 'só as duas tentadas ficaram na fila');
});

test('desfazer devolve EXATAMENTE a lista anterior (espaço, caixa, repetição); não desfaz por cima de outra gravação', async () => {
  const original = [' Bruno ', 'Terceiro', 'bruno', 'Adilsom'];
  const {S, L} = loja({lista:[osDe('a', original), osDe('b', ['Lucas Gabriel Souza'])]});
  const t = tela(S);
  t.run('var REL = null');
  await t.run('converterNomesNasOSCasa(planoConversaoNomes(), {}).then(itens => { REL = {itens}; gravarRelConvNomes(REL); })');
  assert.deepEqual(L.servidor.get('a').equipe, ['100001', 'Terceiro', '100020']);
  // Outra gravação mexe na 'b' depois da conversão.
  L.os[1] = {...L.os[1], equipe:['100010', '100002']};
  await t.run('desfazerConversaoNomesCasa(REL, {})');
  assert.deepEqual(L.servidor.get('a').equipe, original, 'a lista de antes, byte a byte');
  assert.deepEqual(S.getOS('b').equipe, ['100010', '100002'], 'a outra gravação ficou');
  const rel = await t.json('lerRelConvNomes()');
  assert.equal(rel.itens[0].desfazer.estado, 'convertida');
  assert.equal(rel.itens[1].desfazer.estado, 'pulada'); assert.match(rel.itens[1].desfazer.motivo, /mudou depois da conversão/);
  // Desfazer de novo não regrava o que já voltou.
  const antes = L.gravadas.length;
  await t.run('desfazerConversaoNomesCasa(lerRelConvNomes(), {})');
  assert.equal(L.gravadas.length, antes, 'já desfeita não vai de novo; a pulada continua pulada');
});

test('desfazer depois de dois lotes na mesma O.S. (um nome, depois outro) volta à lista do começo', async () => {
  const original = ['Bruno', 'Adilsom', 'Terceiro'];
  const {S, L} = loja({lista:[osDe('a', original)], cfg:{instaladores:[]}});
  const t = tela(S);
  await t.run('iniciarConversaoNomesCasa(["Bruno"])');
  assert.deepEqual(L.servidor.get('a').equipe, ['100001', 'Adilsom', 'Terceiro']);
  await t.run('iniciarConversaoNomesCasa(["Adilsom"])');
  assert.deepEqual(L.servidor.get('a').equipe, ['100001', '100020', 'Terceiro']);
  const rel = await t.json('lerRelConvNomes()');
  assert.equal(rel.itens.length, 2, 'o relatório junta os dois lotes');
  assert.match(t.run('ligacaoRHHTML()'), /Desfazer: devolver a lista anterior de 2 O\.S\./);
  await t.run('desfazerConversaoNomesCasa(lerRelConvNomes(), {})');
  assert.deepEqual(L.servidor.get('a').equipe, original, 'do mais novo para o mais velho');
  const fim = await t.json('lerRelConvNomes()');
  assert.deepEqual(fim.itens.map(i => i.desfazer.estado), ['convertida', 'convertida']);
});

test('lote: a O.S. que sai da fila sem o aviso desta troca (conflito resolvido com Recarregar) não vira "convertida"', async () => {
  const {S, L} = loja({lista:[osDe('a', ['Bruno']), osDe('b', ['Adilsom'])]});
  const envio = S.trySync;
  S.trySync = async () => {
    // "Recarregar do servidor": a O.S. 'a' volta à versão do servidor e sai da fila, sem 'os-gravada'.
    const it = L.fila.find(q => q.os && q.os.id === 'a');
    if (it) { L.fila = L.fila.filter(q => q !== it); const i = L.os.findIndex(o => o.id === 'a'); L.os[i] = structuredClone(L.servidor.get('a')); }
    return envio();
  };
  const t = tela(S);
  const itens = await t.json('converterNomesNasOSCasa(planoConversaoNomes(), {prazoMs:200, passoMs:5})');
  assert.equal(itens[0].estado, 'recusada'); assert.match(itens[0].motivo, /voltou a outra versão/);
  assert.equal(itens[1].estado, 'convertida');
});

test('lote: O.S. com saída ou retorno que o servidor recusaria é pulada (a mesma conferência do servidor), para não prender a fila', async () => {
  const Sv = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const {S, L} = loja({lista:[osDe('a', ['Bruno'], {saidaEm:'2026-06-10T15:00:00-03:00', retornoEm:'2026-06-10T09:00:00-03:00'}), osDe('b', ['Adilsom'], {saidaEm:'10/06/2026'}), osDe('c', ['Bruno'])]});
  const t = tela(S);
  for (const o of [{}, {saidaEm:'2026-06-10T08:00:00-03:00'}, {saidaEm:'2026-06-10'}, {retornoEm:'lixo'}, {saidaEm:'2026-06-10T15:00:00Z', retornoEm:'2026-06-10T09:00:00Z'}, {saidaEm:'2026-06-10T08:00:00Z', retornoEm:'2026-06-10T09:00:00Z'}])
    assert.equal(t.run('momentosInvalidosCasa(' + JSON.stringify(o) + ')'), Sv.validarMomentos(o), 'paridade com o servidor: ' + JSON.stringify(o));
  const itens = await t.json('converterNomesNasOSCasa(planoConversaoNomes(), {})');
  assert.deepEqual(itens.map(i => i.id + ':' + i.estado), ['a:pulada', 'b:pulada', 'c:convertida']);
  assert.match(itens[0].motivo, /O retorno não pode ser anterior à saída.*Corrija a saída ou o retorno/);
  assert.deepEqual(L.gravadas.map(o => o.id), ['c'], 'nada foi para a fila que o servidor recusaria');
});

test('relatório: com o localStorage cheio, a tela mostra o relatório novo (não o velho) e o Desfazer age sobre ele', async () => {
  let cheio = false;
  const {S, L} = loja({lista:[osDe('a', ['Bruno']), osDe('b', ['Adilsom'])]});
  const t = tela(S, 'pcp', {cheio:k => cheio && k === 'impresilk_inst_conv_nomes'});
  await t.run('iniciarConversaoNomesCasa(["Bruno"])');
  cheio = true;
  await t.run('iniciarConversaoNomesCasa(["Adilsom"])');
  const rel = await t.json('lerRelConvNomes()');
  assert.deepEqual(rel.itens.map(i => i.id), ['a', 'b'], 'o lote novo está no relatório');
  assert.equal(t.ctx.localStorage.getItem('impresilk_inst_conv_nomes'), null, 'o velho não fica para voltar no lugar do novo');
  await t.run('desfazerConversaoNomesCasa(lerRelConvNomes(), {})');
  assert.deepEqual(L.servidor.get('b').equipe, ['Adilsom']);
});

test('sem a lista do RH neste aparelho, não converte (não dá para conferir ID repetido) e a tela diz por quê', async () => {
  const {S} = loja({lista:[osDe('a', ['Bruno'])], cfg:{instaladores:[], vinculosRH:[{apelido:'Bruno', id:'100001'}]}});
  S.elenco = () => ({pessoas:[], antigos:[], veiculos:[], ferias:[], ausencias:[], fichaRH:true});
  const t = tela(S);
  const html = t.run('ligacaoRHHTML()');
  assert.doesNotMatch(html, /data-lig-converter/);
  assert.match(html, /A lista de pessoas do RH ainda não carregou neste aparelho/);
  await t.run('iniciarConversaoNomesCasa(null)');
  assert.deepEqual(S.getOS('a').equipe, ['Bruno']);
});

test('tela: nome com a contagem, quantas O.S. converteria, grafias parecidas lado a lado e as pendências', () => {
  const lista = [osDe('1', ['Adlando', 'Lucas']), osDe('2', ['Adilsom', 'Lucas Gabriel Souza']), osDe('3', ['Jose Adilando', 'Terceiro']),
    osDe('4', ['Adriano', 'Adriano Pinheiro']), osDe('5', ['Adriano Nunes', 'Pantera']), osDe('6', ['Adilsom'], {alocacao:{grupos:[]}})];
  const {S} = loja({lista, cfg:{instaladores:['Lucas']}});
  const t = tela(S);
  const html = t.run('ligacaoRHHTML()');
  const grupos = [...html.matchAll(/Grafias parecidas: <strong>([^<]*)<\/strong>/g)].map(m => m[1]);
  assert.ok(grupos.some(g => /Adlando/.test(g) && /Adilsom/.test(g) && /Jose Adilando/.test(g)), grupos.join(' | '));
  assert.ok(grupos.some(g => /Adriano/.test(g) && /Adriano Pinheiro/.test(g) && /Adriano Nunes/.test(g)), grupos.join(' | '));
  assert.ok(grupos.some(g => /Lucas/.test(g) && /Lucas Gabriel Souza/.test(g)), grupos.join(' | '));
  // "Adilsom" é apelido exato: converteria em 1 O.S. (a com divisão fica).
  const linhasTab = html.split('<tr>').slice(1);
  const adilsom = linhasTab.find(l => /<strong>Adilsom<\/strong>/.test(l));
  assert.match(adilsom, /<strong>1 O\.S\.<\/strong>/); assert.match(adilsom, /1 com divisão fica/);
  assert.match(adilsom, /data-lig-converter-nome="Adilsom"/);
  // "Jose Adilando" é só começo de nome: pede confirmação.
  const jose = linhasTab.find(l => /<strong>Jose Adilando<\/strong>/.test(l));
  assert.match(jose, /Só pelo começo do nome/); assert.match(jose, /data-lig-confirmar="Jose Adilando"/); assert.match(jose, /depois de confirmar/);
  assert.doesNotMatch(jose, /data-lig-converter-nome/);
  // "Adlando" não tem ficha: a sugestão pela grafia parecida, para alguém decidir.
  const adlando = linhasTab.find(l => /<strong>Adlando<\/strong>/.test(l));
  assert.match(adlando, /Sugestão, grafia parecida: <strong>José Adilando Rocha<\/strong>/);
  assert.doesNotMatch(adlando, /<option value="jose-adilando" selected/, 'a sugestão não vem marcada: um clique em Ligar não pode gravar o palpite');
  // O botão geral e as pendências.
  assert.match(html, /data-lig-converter[^-]/); assert.match(html, />Gravar o ID em 1 O\.S\.</);
  assert.match(html, /1 O\.S\. com divisão fica como está/);
  const pend = html.slice(html.indexOf('Pendências: ficam como nome'));
  assert.match(pend, /Terceiro<\/strong> · 1 O\.S\. · marcador de terceiro/);
  assert.match(pend, /Pantera<\/strong> · 1 O\.S\. · a ficha ou o contrato não tem CPF/);
  assert.match(pend, /Lucas<\/strong> · 1 O\.S\. · serve para mais de uma pessoa/);
  // A janela do aparelho é dita: as antigas ficam de fora até buscar.
  assert.match(html, /As finalizadas antes disso ficam no servidor e não entram na conta nem na troca/);
  assert.match(html, /data-lig-antigas/);
});

test('tela: só admin e pcp veem os botões de gravar o ID e de buscar as antigas; a porta da função também confere', async () => {
  const lista = [osDe('1', ['Bruno'])];
  for (const [papel, ve] of [['admin', true], ['pcp', true], ['operacao', false], ['montagem', false]]) {
    const {S} = loja({lista});
    const t = tela(S, papel);
    const html = t.run('ligacaoRHHTML()');
    assert.equal(/data-lig-converter/.test(html), ve, papel);
    assert.equal(/data-lig-antigas/.test(html), ve, 'buscar as antigas: ' + papel);
    assert.match(html, /As finalizadas antes disso ficam no servidor/, 'a janela é dita para todos: ' + papel);
    if (!ve) {
      await t.run('iniciarConversaoNomesCasa(null)');
      assert.deepEqual(S.getOS('1').equipe, ['Bruno'], 'operação não grava o ID nem chamando a função: ' + papel);
    }
  }
});

test('antigas do servidor: o trecho que passa de 750 é partido; a conversão pega as antigas e o corte é dito', async () => {
  const velhas = [osDe('v1', ['Bruno'], {finalizadaEm:'2026-06-10T12:00:00'}), osDe('v2', ['Adilsom'], {finalizadaEm:'2026-07-20T12:00:00'})];
  let chamadas = 0;
  const {S, L} = loja({lista:[osDe('a', ['Bruno'])], busca:q => {
    chamadas++;
    // A primeira busca (o período todo) volta cortada; as metades, inteiras,
    // menos um dia que não se parte mais.
    if (chamadas === 1) return {itens:velhas.slice(0, 1), truncou:true};
    return {itens:velhas.filter(o => o.finalizadaEm.slice(0, 10) >= q.de && o.finalizadaEm.slice(0, 10) <= q.ate), truncou:q.de === q.ate};
  }});
  const t = tela(S);
  await t.run('buscarAntigasConferenciaCasa()');
  assert.ok(L.buscas.length >= 3, 'partiu o período ' + JSON.stringify(L.buscas));
  assert.equal(L.buscas[0].de, '2026-05-01', 'começa na primeira finalização do servidor');
  const plano = await t.json('planoConversaoNomes().tarefas.map(x => x.id)');
  assert.deepEqual(plano.sort(), ['a', 'v1', 'v2']);
  const html = t.run('ligacaoRHHTML()');
  assert.match(html, /Vieram do servidor 2 O\.S\. finalizadas até \d\d\/\d\d\/\d{4} que não estavam neste aparelho, 2 com nome na equipe/);
  const itens = await t.json('converterNomesNasOSCasa(planoConversaoNomes(), {})');
  assert.deepEqual(itens.map(i => i.estado), ['convertida', 'convertida', 'convertida']);
  assert.deepEqual(L.servidor.get('v2').equipe, ['100020'], 'a antiga vai ao servidor inteira, pelo upsert normal');
  assert.equal(L.servidor.get('v2').cliente, 'Cliente fictício v2');
});

test('antigas do servidor: o que não coube nem partido fica escrito na tela', async () => {
  const {S} = loja({lista:[], busca:() => ({itens:[], truncou:true})});
  const t = tela(S);
  await t.run('buscarAntigasConferenciaCasa()');
  const h = await t.json('_convNomesHist');
  assert.equal(h.estado, 'pronto'); assert.ok(h.truncados.length > 0);
  assert.match(t.run('ligacaoRHHTML()'), /Ficaram de fora O\.S\. de/);
});

test('antes de converter, o nome da lista de instaladores que chega ao ID vira vínculo salvo e vai primeiro ao servidor', async () => {
  const cfg = {instaladores:['Bruno', 'Bruno Martins'], vinculosRH:[]};
  const {S, L} = loja({lista:[osDe('a', ['Bruno Alves Costa']), osDe('b', ['Bruno Martins Dias'])], cfg});
  const t = tela(S);
  const fix = await t.json('listaParaFixarCasa(planoConversaoNomes().aprovado, OPERACAO.dadosPessoas())');
  assert.deepEqual(fix.fixar.map(f => [f.nome, f.id]), [['Bruno', '100001']]);
  assert.deepEqual(fix.avisar, ['Bruno Martins'], 'o nome da lista ligado só pelo começo é avisado, não fixado');
  const ordem = [];
  const envio = S.trySync;
  S.trySync = async () => { for (const q of L.fila) ordem.push(q.action + ':' + (q.os ? q.os.id : '')); return envio(); };
  t.run('STATE.activeTab = "entregas"');
  await t.run('iniciarConversaoNomesCasa(null)');
  assert.equal(ordem[0], 'setCfg:', 'a configuração vai antes das O.S.');
  assert.ok(cfg.vinculosRH.some(v => v.apelido === 'Bruno' && v.id === '100001'));
  const rel = await t.json('lerRelConvNomes()');
  assert.deepEqual(rel.itens.map(i => i.estado), ['convertida', 'convertida']);
  assert.equal(rel.por, 'Gestor Fictício');
});

test('conversão parada: a configuração dos vínculos RECUSADA pelo servidor (sai da fila) não passa como aceita', async () => {
  const cfg = {instaladores:['Bruno'], vinculosRH:[]};
  const {S, L} = loja({lista:[osDe('a', ['Bruno'])], cfg});
  const envio = S.trySync;
  S.trySync = async () => {
    const it = L.fila.find(q => q.action === 'setCfg');
    if (it) { L.fila = L.fila.filter(q => q !== it); for (const f of L.ouv['item-recusado'] || []) f({item:it, motivo:'Configuração recusada (fictício).', status:422}); }
    return envio();
  };
  const t = tela(S);
  await t.run('iniciarConversaoNomesCasa(null)');
  assert.equal(L.gravadas.length, 0, 'nenhuma O.S. foi enviada');
  assert.deepEqual(S.getOS('a').equipe, ['Bruno']);
});

test('conversão parada: sem o vínculo da lista no servidor, nenhuma O.S. é trocada', async () => {
  const cfg = {instaladores:['Bruno'], vinculosRH:[]};
  const {S, L} = loja({lista:[osDe('a', ['Bruno'])], cfg});
  S.trySync = async () => {};   // a configuração não sai da fila
  const t = tela(S);
  t.run('esperarCfgNoServidorCasa = () => Promise.resolve(false)');
  await t.run('iniciarConversaoNomesCasa(null)');
  assert.equal(L.fila.filter(q => q.action === 'upsert').length, 0);
  assert.deepEqual(S.getOS('a').equipe, ['Bruno']);
});

/* --------------------------------------------------------- o servidor */
const row = (id, registro) => ({id, colecao:'os', apagado:false, atualizado_em:'2026-09-19T10:00:00Z', registro:{id, rev:1, ...registro}});
const gestor = {papel:'pcp', nome:'Gestor Teste', sub:'gestor'};
const diario = e => e.db.pcp_registros.filter(r => r.colecao === 'auditoria').map(r => r.registro);

test('servidor: cada troca de nome por ID, e o desfazer, entram no diário com o autor do crachá', async () => {
  const antes = ['Bruno', 'Terceiro'];
  const e = await edge('pcp-sync', {pcp_registros:[row('1', {numero:'5001', tipo:'externo', cliente:'Cliente Fictício', equipe:antes})]});
  const lida = () => structuredClone(e.db.pcp_registros.find(r => r.colecao === 'os' && r.id === '1').registro);
  const r = await e.call({action:'upsert', os:{...lida(), equipe:O.converterEquipe(antes, DADOS()).equipe}}, gestor);
  assert.equal(r.status, 200, r.error);
  assert.deepEqual(lida().equipe, ['100001', 'Terceiro']);
  const volta = await e.call({action:'upsert', os:{...lida(), equipe:antes}}, gestor);
  assert.equal(volta.status, 200, volta.error);
  const d = diario(e);
  assert.equal(d.length, 2);
  assert.deepEqual(d.map(x => x.campos), [['equipe'], ['equipe']]);
  assert.deepEqual(d[0].antes.equipe, antes); assert.deepEqual(d[0].depois.equipe, ['100001', 'Terceiro']);
  assert.deepEqual(d[1].depois.equipe, antes, 'o desfazer também fica com autor');
  for (const x of d) { assert.equal(x.autor.login, 'gestor'); assert.equal(x.autor.papel, 'pcp'); assert.equal(x.origem, 'tela'); }
});

/* ------------------------------------ com o store.js de verdade (a fila) */
/* O lote conversa com a fila e os eventos do store.js real: a O.S. aceita
   vira "convertida" pelo 'os-gravada', o 409 de uma O.S. abre o conflito só
   dela e o resto segue, a recusa de validação (422) fica na fila com o
   motivo, e o desfazer volta pela mesma fila. O servidor aqui é de mentira. */
function lojaReal({lista, responder}) {
  const ls = new Map([['impresilk_inst_os', JSON.stringify(lista)], ['impresilk_inst_fila', '[]'],
    ['impresilk_inst_cfg', JSON.stringify({instaladores:[], vinculosRH:[]})]]);
  const db = {transaction() { const tx = {objectStore:() => ({get() { const req = {}; queueMicrotask(() => req.onsuccess?.({target:{result:null}})); return req; },
    put() { queueMicrotask(() => tx.oncomplete?.()); }, delete() { queueMicrotask(() => tx.oncomplete?.()); }})}; return tx; }};
  const guardado = {};
  const ctx = vm.createContext({console:{log() {}, warn() {}, error() {}}, navigator:{onLine:true}, window:{addEventListener() {}},
    localStorage:{getItem:k => (ls.has(k) ? ls.get(k) : (k in guardado ? guardado[k] : null)), setItem:(k, v) => { if (k.startsWith('impresilk_inst_') && k !== 'impresilk_inst_conv_nomes') ls.set(k, v); else guardado[k] = String(v); }, removeItem:k => { ls.delete(k); delete guardado[k]; }},
    indexedDB:{open() { const req = {}; queueMicrotask(() => req.onsuccess({target:{result:db}})); return req; }},
    setTimeout, clearTimeout, AbortController, structuredClone, API_BASE:'http://teste',
    fetch:async (_url, req) => { const r = await responder(JSON.parse(req.body)); return {ok:!(r.http >= 400), status:r.http || 200, json:async () => r}; },
    STATE:{user:{nome:'Gestor Fictício', papel:'pcp'}, activeTab:'entregas'},
    document:{getElementById:() => null, querySelectorAll:() => [], body:{classList:{add() {}, remove() {}, contains:() => false}}},
    esc:s => String(s ?? ''), toast() {}, confirm:() => true, CSS:{escape:s => s}, pessoaDoElenco:() => null});
  vm.runInContext(fs.readFileSync(path.join(root, 'store.js'), 'utf8'), ctx);
  vm.runInContext('STORE.elenco = () => (' + JSON.stringify(ELENCO) + ')', ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'operacao.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'casa.js'), 'utf8'), ctx);
  const copia = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  return {run:code => vm.runInContext(code, ctx), json:async code => copia(await vm.runInContext(code, ctx))};
}
test('store.js real: aceita, 409 e 422 numa O.S. cada, sem travar as outras; o desfazer volta pela fila', async () => {
  const servidor = new Map();
  const lista = [osDe('a', ['Bruno']), osDe('b', ['Adilsom']), osDe('c', ['Lucas Gabriel Souza']), osDe('d', ['Bruno Martins Dias'])];
  for (const o of lista) servidor.set(o.id, structuredClone(o));
  const envios = [];
  const t = lojaReal({lista, responder:q => {
    if (q.action !== 'upsert') return {ok:true, os:[]};
    envios.push(q.os.id + ':' + q.os.equipe.join('+'));
    const atual = servidor.get(q.os.id);
    if (q.os.id === 'b') return {http:409, conflito:true, servidor:{...atual, rev:atual.rev + 1, atualizadoPor:'Outro aparelho'}};
    if (q.os.id === 'c') return {http:422, error:'Validação fictícia recusou.'};
    const novo = {...q.os, rev:(atual.rev || 0) + 1};
    servidor.set(q.os.id, novo);
    return {ok:true, os:novo};
  }});
  await t.run('STORE.pronto()');
  const itens = await t.json('converterNomesNasOSCasa(planoConversaoNomes(), {usuario:"Gestor Fictício", prazoMs:400, passoMs:5})');
  assert.deepEqual(itens.map(i => i.id + ':' + i.estado), ['a:convertida', 'b:recusada', 'c:recusada', 'd:convertida']);
  assert.match(itens[1].motivo, /Outra gravação desta O\.S\. chegou antes/);
  assert.match(itens[2].motivo, /Validação fictícia recusou\..*fila deste aparelho/);
  assert.deepEqual(servidor.get('a').equipe, ['100001']);
  assert.deepEqual(servidor.get('d').equipe, ['100002'], 'depois do 409 e do 422 a outra O.S. foi');
  assert.equal(servidor.get('a').rev, 2);
  assert.equal(await t.json('STORE.getOS("a").rev'), 2, 'o aparelho adotou o rev do servidor');
  // Desfazer: a e d voltam; b (conflito, cópia do aparelho ainda com o ID) e c (na fila) também tentam, pela mesma fila.
  await t.run('gravarRelConvNomes({itens:' + JSON.stringify(itens) + '})');
  await t.run('desfazerConversaoNomesCasa(lerRelConvNomes(), {prazoMs:400, passoMs:5})');
  assert.deepEqual(servidor.get('a').equipe, ['Bruno']);
  assert.deepEqual(servidor.get('d').equipe, ['Bruno Martins Dias']);
  const rel = await t.json('lerRelConvNomes()');
  const des = Object.fromEntries(rel.itens.map(i => [i.id, i.desfazer && i.desfazer.estado]));
  assert.equal(des.a, 'convertida'); assert.equal(des.d, 'convertida');
});
