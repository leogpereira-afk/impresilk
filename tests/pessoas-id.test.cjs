/* PESSOA PELO ID (ordem do dono, 29/09/2026: "vamos usar o ID em todo o
   sistema e padrão pra não ter erro"). A O.S. nova grava o ID do RH (6
   primeiros dígitos do CPF); a antiga guarda o nome que o PCP digitava. Estes
   testes partem dos casos ruins: dois com o mesmo primeiro nome, a mesma
   pessoa escrita de dois jeitos, nome antigo ao lado do ID, crachá antigo que
   só tem o nome. Dados fictícios: o repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const O = require('../operacao.js');
const {edge} = require('./helpers/edge.cjs');

const FICHAS = [
  {chave:'bruno-alves', id:'100001', nome:'Bruno Alves Costa', apelido:'bruno', area:'Montagem', ativo:true},
  {chave:'bruno-martins', id:'100002', nome:'Bruno Martins Dias', apelido:'', area:'Montagem', ativo:true},
  {chave:'carla-lima', id:'100003', nome:'Carla Souza Lima', apelido:'', area:'Serralheria', ativo:true},
  {chave:'carla-neves', id:'100004', nome:'Carla Souza Neves', apelido:'', area:'Serralheria', ativo:true},
  {chave:'diego-ramos', id:'100005', nome:'Diego Ramos', apelido:'diego', area:'Montagem', ativo:true},
  {chave:'elias-nunes', id:'100007', nome:'Elias Nunes', apelido:'', area:'Montagem', ativo:false},
  {chave:'fabio-sem-cpf', id:'', nome:'Fábio Sem Cpf', apelido:'', area:'Montagem', ativo:true},
];
const ANTIGOS = [{chave:'elias-prado', id:'100006', nome:'Elias Prado', apelido:'', ativo:false, desligado:true}];
const DADOS = {pessoas:[...FICHAS, ...ANTIGOS], vinculos:[{apelido:'Diegão', id:'100005', chave:'diego-ramos', nome:'Diego Ramos'}], lista:['Bruno', 'Diegão', 'Pantera']};

test('régua: ID é a pessoa; nome antigo vira pessoa por vínculo ou casamento único; ambíguo não escolhe', () => {
  const r = O.resolverPessoas(DADOS);
  assert.equal(r.idDe('100002'), '100002');
  assert.equal(r.idDe('Bruno'), '100001', 'apelido do RH');
  assert.equal(r.idDe(' bruno '), '100001', 'caixa e espaço não mudam a pessoa');
  assert.equal(r.idDe('Bruno Martins'), '100002', 'começo de nome que só uma ficha tem');
  assert.equal(r.idDe('Carla'), '', 'duas Carlas: sem ficha, não a primeira que aparecer');
  assert.equal(r.idDe('Carla Souza'), '', 'o começo ainda é das duas');
  assert.equal(r.idDe('Carla Souza Lima'), '100003');
  assert.equal(r.idDe('Diegão'), '100005', 'vínculo salvo');
  assert.equal(r.idDe('Pantera'), '');
  assert.equal(r.idDe('Elias'), '', 'Elias Prado saiu e Elias Nunes ficou: o nome segue ambíguo, não vai para o xará');
  assert.equal(r.idDe('Elias Prado'), '', 'quem saiu nunca é o resultado');
  assert.equal(r.idDe('Elias Nunes'), '100007');
  assert.equal(r.chave('Pantera'), 'nome:pantera');
  assert.equal(r.chave('Bruno Alves'), '100001');
});

test('régua: nome de exibição é a palavra do PCP; senão o menor começo que só a ficha tem', () => {
  const r = O.resolverPessoas(DADOS);
  assert.equal(r.nome('100001'), 'Bruno', 'lista de instaladores');
  assert.equal(r.nome('Bruno Alves'), 'Bruno', 'nome antigo da mesma pessoa aparece igual');
  assert.equal(r.nome('100005'), 'Diegão', 'a lista chega pelo vínculo');
  assert.equal(r.nome('100002'), 'Bruno Martins');
  assert.equal(r.nome('100004'), 'Carla Souza Neves');
  assert.equal(r.nome('100006'), 'Elias Prado', 'quem saiu ainda tem nome no histórico');
  assert.equal(r.nome('999999'), 'ID 999999', 'ID sem ficha nunca vira nome de outro');
  assert.equal(r.nome('Pantera'), 'Pantera');
});

test('equipe da O.S.: o nome antigo e o ID da mesma pessoa contam uma vez', () => {
  O.usarPessoas(() => DADOS);
  try {
    const os = {equipe:['Bruno', '100001', ' bruno ', 'Bruno Alves', 'Pantera', '']};
    assert.equal(O.equipe(os).join('|'), 'Bruno|Pantera');
    assert.equal(O.equipeNomes({equipe:['100002', '100005']}).join('|'), 'Bruno Martins|Diegão');
  } finally { O.usarPessoas(null); }
});

test('conflito de agenda é pela pessoa: dois Brunos não colidem, o mesmo Bruno escrito de dois jeitos colide', () => {
  O.usarPessoas(() => DADOS);
  try {
    const dia = '2026-09-30';
    const os = (id, equipe) => ({id, tipo:'externo', liberadoPCP:true, instalacao:{data:dia, periodo:'Manhã'}, equipe, veiculo:''});
    assert.equal(O.conflitos([os('a', ['100001']), os('b', ['100002'])], dia).length, 0, 'Bruno Alves e Bruno Martins são dois');
    const c = O.conflitos([os('a', ['Bruno']), os('b', ['Bruno Alves'])], dia);
    assert.equal(c.length, 1, 'antes os dois textos passavam como pessoas diferentes');
    assert.equal(c[0].equipe.join(), 'Bruno');
  } finally { O.usarPessoas(null); }
});

test('entregas do mês e chave da volta: somam pela pessoa, com o nome de exibição', () => {
  O.usarPessoas(() => DADOS);
  try {
    const fin = (id, equipe) => ({id, tipo:'externo', equipe, finalizadaEm:'2026-09-10T12:00:00Z', retornoEm:'2026-09-10T17:00:00Z', veiculo:'Strada'});
    const m = O.mensal([fin('a', ['Bruno']), fin('b', ['100001']), fin('c', ['100002'])], '2026-09');
    const bruno = m.pessoas.find(p => p.id === '100001');
    assert.equal(bruno.entregas, 2); assert.equal(bruno.nome, 'Bruno');
    assert.equal(m.pessoas.length, 2);
    assert.equal(O.chaveDaVolta(fin('a', ['Bruno', 'Diegão'])), O.chaveDaVolta(fin('b', ['100005', '100001'])));
  } finally { O.usarPessoas(null); }
});

test('servidor e aparelho chegam à MESMA pessoa (cópia da régua em _shared)', async () => {
  const S = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const a = O.resolverPessoas(DADOS), b = S.resolverPessoas(DADOS);
  for (const x of ['100001', '100002', '100006', '999999', 'Bruno', 'bruno', 'Bruno Alves', 'Bruno Martins', 'Carla', 'Carla Souza Lima', 'Diegão', 'Diego', 'Pantera', 'Elias', 'Fábio', '']) {
    assert.equal(b.idDe(x), a.idDe(x), 'idDe ' + x);
    assert.equal(b.chave(x), a.chave(x), 'chave ' + x);
    assert.equal(b.nome(x), a.nome(x), 'nome ' + x);
  }
});

/* ---------------------------------------------------------------- servidor */
const cpf = id => id + '12345';
const RH = [...FICHAS.filter(p => p.id), ...ANTIGOS].map(p => ({id:p.chave, colecao:'colaboradores', apagado:false,
  registro:{id:p.chave, nome:p.nome, apelido:p.apelido, cpf:cpf(p.id), statusId:p.ativo === false ? 'inativo' : 'ativo', ...(p.desligado ? {dataDesligamento:'2026-08-31'} : {})}}));
const row = (id, registro) => ({id, colecao:'os', apagado:false, atualizado_em:'2026-09-19T10:00:00Z', registro:{id, rev:1, numero:id, tipo:'externo', cliente:'Cliente', liberadoPCP:true, ...registro}});
const cfg = extra => [{id:true, config:{instaladores:['Bruno', 'Bruno Martins', 'Diegão'], vinculosRH:DADOS.vinculos, ...extra}, atualizado_em:'2026-09-19T10:00:00Z'}];
const toque = nome => ({nome, sub:nome, papel:'montagem', montagemIndividual:true});

test('crachá antigo (só o nome) grava na O.S. que já guarda o ID; o outro Bruno não', async () => {
  const e = await edge('pcp-sync', {registros:RH, pcp_config_global:cfg(), pcp_registros:[row('1', {equipe:['100001']})]});
  const ok = await e.call({action:'upsert', os:{...e.db.pcp_registros[0].registro, horaSaida:'08:00'}}, toque('Bruno'));
  assert.equal(ok.status, 200, ok.error);
  const nao = await e.call({action:'upsert', os:{...e.db.pcp_registros[0].registro, horaSaida:'09:00'}}, toque('Bruno Martins'));
  assert.equal(nao.status, 422, 'mesmo primeiro nome não abre a O.S. de outra pessoa');
});

test('nome antigo da mesma pessoa abre a O.S. (antes "Bruno Alves" e "Bruno" eram dois)', async () => {
  const e = await edge('pcp-sync', {registros:RH, pcp_config_global:cfg(), pcp_registros:[row('1', {equipe:['Bruno Alves']})]});
  const r = await e.call({action:'upsert', os:{...e.db.pcp_registros[0].registro, horaSaida:'08:00'}}, toque('Bruno'));
  assert.equal(r.status, 200, r.error);
});

test('crachá novo leva o ID da pessoa, e é ele que abre a O.S.', async () => {
  const e = await edge('pcp-sync', {registros:RH, pcp_config_global:cfg(), pcp_registros:[row('1', {equipe:['100002']})]});
  const ent = await e.call({action:'entrarMontagem', nome:'Bruno Martins'}, {papel:'admin'});
  assert.equal(ent.status, 200);
  assert.equal(ent.id, '100002');
  assert.equal(JSON.parse(Buffer.from(ent.token.split('.')[1], 'base64url')).id, '100002');
  const r = await e.call({action:'upsert', os:{...e.db.pcp_registros[0].registro, horaSaida:'08:00'}}, {...toque('Bruno Martins'), id:'100002'});
  assert.equal(r.status, 200, r.error);
  // ID antigo no crachá (vínculo corrigido depois): a régua de hoje manda.
  const velho = await e.call({action:'upsert', os:{...e.db.pcp_registros[0].registro, horaSaida:'09:00'}}, {...toque('Bruno Martins'), id:'100001'});
  assert.equal(velho.status, 200, 'o nome ainda leva ao Bruno Martins: o ID velho do crachá não tira o acesso');
  const alheio = await e.call({action:'upsert', os:{...e.db.pcp_registros[0].registro, horaSaida:'10:00'}}, {...toque('Bruno'), id:'100002'});
  assert.equal(alheio.status, 422, 'nem dá acesso: "Bruno" é o Bruno Alves hoje, e o ID velho não passa por cima');
});

test('fotos e lista do espelho: a O.S. gravada por ID é da equipe; a do outro Bruno não', async () => {
  const e = await edge('pcp-sync', {registros:RH, pcp_config_global:cfg(), pcp_registros:[
    row('1', {equipe:['100001'], fotosCheckinIds:['f1']}),
    row('2', {equipe:['100002'], fotosCheckinIds:['f2']}),
  ]});
  e.cliente.storage={from:()=>({download:async()=>({data:new Blob(['foto'],{type:'image/jpeg'}),error:null})})};
  assert.equal((await e.call({action:'getPhoto', fileId:'f1'}, toque('Bruno'))).status, 200);
  assert.equal((await e.call({action:'getPhoto', fileId:'f2'}, toque('Bruno'))).status, 403);
  const lista = await e.call({action:'list'}, toque('Bruno'));
  assert.equal(lista.status, 200, lista.error);
  assert.equal(lista.os.map(o => o.id).join(), '1');
});

test('elenco manda quem saiu só com ID e nome, fora das escolhas', async () => {
  const e = await edge('pcp-sync', {registros:RH, pcp_config_global:cfg()});
  const r = await e.call({action:'elenco'}, {papel:'pcp', nome:'Gestor'});
  assert.equal(r.status, 200, r.error);
  assert.ok(!r.pessoas.some(p => p.id === '100006'), 'desligado não é escolha');
  const elias = r.antigos.find(p => p.id === '100006');
  assert.equal(elias.nome, 'Elias Prado'); assert.equal(elias.desligado, true);
  assert.equal(Object.keys(elias).sort().join(), 'apelido,ativo,chave,desligado,id,nome', 'só o mínimo');
});

test('régua: "terceiro, sem ficha" salvo nunca casa com o xará do RH', () => {
  const r = O.resolverPessoas({...DADOS, vinculos:[...DADOS.vinculos, {apelido:'Diego', semFicha:true}]});
  assert.equal(r.idDe('Diego'), '', 'sem o vínculo, "Diego" seria o Diego Ramos pelo apelido');
  assert.equal(r.fixado('Diego'), true);
  assert.equal(r.fixado('Bruno'), false);
  assert.equal(r.chave('Diego'), 'nome:diego');
});

test('crachá antigo de quem saiu não abre a O.S. do xará que ficou', async () => {
  const e = await edge('pcp-sync', {registros:RH, pcp_config_global:cfg({instaladores:['Elias', 'Bruno']}), pcp_registros:[row('1', {equipe:['100007']})]});
  const r = await e.call({action:'upsert', os:{...e.db.pcp_registros[0].registro, horaSaida:'08:00'}}, toque('Elias'));
  assert.equal(r.status, 422, 'o "Elias" da lista não vira o Elias Nunes só porque o outro saiu');
  const lista = await e.call({action:'list'}, toque('Elias'));
  assert.equal(lista.os.length, 0);
});

test('xará contratado depois: o ID do crachá segura o acesso; sem ele, fecha', async () => {
  const e = await edge('pcp-sync', {registros:RH, pcp_config_global:cfg({instaladores:['Carla']}), pcp_registros:[row('1', {equipe:['100003']})]});
  const com = await e.call({action:'upsert', os:{...e.db.pcp_registros[0].registro, horaSaida:'08:00'}}, {...toque('Carla'), id:'100003'});
  assert.equal(com.status, 200, com.error);
  const sem = await e.call({action:'upsert', os:{...e.db.pcp_registros[0].registro, horaSaida:'09:00'}}, toque('Carla'));
  assert.equal(sem.status, 422, 'nome ambíguo sem ID não abre O.S. gravada por ID');
  const e2 = await edge('pcp-sync', {registros:RH, pcp_config_global:cfg({instaladores:['Carla'], vinculosRH:[{apelido:'Carla', semFicha:true}]}), pcp_registros:[row('1', {equipe:['100003']})]});
  const decidido = await e2.call({action:'upsert', os:{...e2.db.pcp_registros[0].registro, horaSaida:'08:00'}}, {...toque('Carla'), id:'100003'});
  assert.equal(decidido.status, 422, 'decisão salva ("terceiro") vale mais que o ID antigo do crachá');
});

test('autorizar celular de nome sem ficha avisa a gestão', async () => {
  const e = await edge('pcp-sync', {registros:RH, pcp_config_global:cfg({instaladores:['Carla', 'Bruno']})});
  const r = await e.call({action:'entrarMontagem', nome:'Carla'}, {papel:'admin'});
  assert.equal(r.status, 200); assert.equal(r.id, '');
  assert.match(r.aviso, /não está ligado a uma ficha do RH/);
  const ok = await e.call({action:'entrarMontagem', nome:'Bruno'}, {papel:'admin'});
  assert.equal(ok.aviso, undefined);
});

/* ------------------------------------------------ celular do instalador */
function espelho({ lista, elenco = null, dono }) {
  const node = () => ({ innerHTML:'', textContent:'', value:'', querySelector:node, querySelectorAll:()=>[], setAttribute(){}, classList:{toggle(){}, add(){}, remove(){}} });
  const STORE = { getCFG:() => ({instaladores:['Bruno', 'Diegão'], vinculosRH:DADOS.vinculos}), getAllOS:() => lista, getQueue:() => [], onConflict(){},
    ...(elenco ? { elenco:() => elenco } : { elenco:() => ({pessoas:[], antigos:[]}) }) };
  const ctx = vm.createContext({console, Date, document:{querySelector:node, querySelectorAll:()=>[], addEventListener(){}}, window:{}, navigator:{onLine:true},
    localStorage:{getItem:()=>null, setItem(){}}, STORE, AUTH:{dono:() => dono}, setTimeout(){}, confirm:() => true});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'operacao.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'equipe.js'), 'utf8'), ctx);
  return nome => { vm.runInContext(`EQ.instalador=${JSON.stringify(nome)}; EQ.comercial=false;`, ctx); return vm.runInContext('minhasOS().map(o => o.id).join()', ctx); };
}
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const osE = (id, equipe) => ({id, liberadoPCP:true, instalacao:{data:'2026-09-30'}, equipe});
test('celular: a O.S. do colega fica escondida mesmo com crachá de toque; a gravada por ID aparece', () => {
  const lista = [osE('meu-id', ['100001']), osE('meu-nome', ['Bruno Alves']), osE('do-outro', ['Diegão']), osE('outro-id', ['100005'])];
  const ver = espelho({ lista, elenco:{pessoas:FICHAS, antigos:ANTIGOS}, dono:{nome:'Bruno', papel:'montagem', montagemIndividual:true} });
  assert.equal(ver('Bruno'), 'meu-id,meu-nome', 'cache com O.S. de outra equipe não aparece');
});
test('celular sem elenco ainda: a O.S. por ID aparece para o crachá de toque (o servidor já filtrou)', () => {
  const lista = [osE('meu-id', ['100001']), osE('do-outro', ['Diegão'])];
  const semElenco = espelho({ lista, dono:{nome:'Bruno', papel:'montagem', montagemIndividual:true} });
  assert.equal(semElenco('Bruno'), 'meu-id');
  const comId = espelho({ lista:[osE('meu-id', ['100001']), osE('outro-id', ['100005'])], dono:{nome:'Bruno', id:'100001', papel:'montagem', montagemIndividual:true} });
  assert.equal(comId('Bruno'), 'meu-id', 'crachá novo: o ID dele separa as O.S. mesmo sem elenco');
});
