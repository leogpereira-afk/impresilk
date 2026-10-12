'use strict';
/* REVISÃO DA ONDA PESSOAS (12/10/2026): os achados das revisões "com
   dinheiro" e "com uso" da onda, cada um começando pelo caso ruim. Pessoas,
   CPFs, logins e valores fictícios: o repositório é público. */
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const {edge} = require('./helpers/edge.cjs');
const RAIZ = path.join(__dirname, '..');
const ler = f => fs.readFileSync(path.join(RAIZ, f), 'utf8');

const EXP = Math.floor(Date.parse('2027-12-31T00:00:00Z') / 1000);
const conta = (papel, sub, nome, extra = {}) => ({papel, sub, nome, exp:EXP, ...extra});
const ADMIN = conta('admin', 'admin-ficticio', 'Admin Fictício');
const TITULAR = conta('pcp', 'titular-ficticio', 'Titular Fictício');
const INTRUSO = conta('pcp', 'intruso', 'Intruso Fictício');
const ficha = (id, nome, apelido, cpf, extra = {}) => ({id, colecao:'colaboradores', apagado:false, registro:{id, nome, apelido, cpf, statusId:'ativo', ...extra}});
const NOV = {de:'2026-11-01', ate:'2026-11-30'};
const doc = {origem:'Vistoria fictícia', evidencia:'Foto fictícia 001 do serviço', justificativa:'Conferido pela gestão fictícia'};
const relogio = (e, iso) => e.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date); let t = +new R(${JSON.stringify(iso)});
  globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [t++])); } static now() { return t++; } }; }`);
const OS_A = {id:'A', numero:'90901', rev:3, tipo:'externo', cliente:'Cliente fictício', valorTotal:8500, equipe:['700001'], veiculo:'Carro fictício',
  horaRetorno:'18:00', retornoEm:'2026-11-05T18:00:00', finalizadaEm:'2026-11-05T21:00:00.000Z', finalizadoPor:'Gestor fictício', entregaLancada:{data:'2026-11-05', em:'2026-11-05T21:00:00.000Z', por:'Gestor fictício'}};
function banco(fichas, extra = {}) {
  return {pcp_registros:[{colecao:'os', id:'A', apagado:false, atualizado_em:'2026-11-20T00:00:00Z', registro:structuredClone(OS_A)}], registros:structuredClone(fichas),
    pcp_config_global:[{id:true, atualizado_em:'2020-01-01', config:{instaladores:['Intruso'], performancePCP:{equipes:[], participacoes:[{id:'A', membros:[{chave:'700001', nome:'Titular Fictício', percentual:100}], por:'Gestor fictício', em:'2026-11-06T00:00:00Z'}]}}}],
    painel_ordens:[{numero:'90901', valor:8500}], equipe_contas:[{sistema:'pcp', usuario:'titular-ficticio', papel:'pcp', ativo:true}, {sistema:'pcp', usuario:'intruso', papel:'pcp', ativo:true}], ...extra};
}
const entrada = regs => ({config:{modo:'efetivo', inicioEfetivo:'2026-11-01', decisaoGestao:'Autorização fictícia para teste', criteriosExtras:'somente_falha_comprovada'},
  decisoes:Object.fromEntries(regs.map(r => [r.osId || r.id, {...doc, decisao:'sem_falha', tipo:'nenhuma'}])),
  entregas:Object.fromEntries(regs.map(r => [r.id, {...doc, entregue:true, grupos:[{montadorId:r.membros[0].chave, partes:r.membros.map(m => ({pessoaId:m.chave, cota:Math.round(m.percentual * 100)})), justificativa:'Equipe fictícia'}], interna:{...doc, situacao:'nao_aplicavel'}}]))});
let n = 0;
const gravar = (e, corpo, quem = ADMIN) => e.call({action:'comissaoAprovadorGravar', motivo:'Motivo fictício com mais de quinze letras', requestId:'aprovador-revisao-' + (++n), ...corpo}, quem);
const aprovar = (e, previa, quem) => e.call({action:'performanceComissaoAprovar', ...NOV, anterior:previa.id, hash:previa.hash, confirmacao:true, motivo:'Aprovação fictícia', requestId:'aprovar-revisao-' + (++n)}, quem);
async function fecharEPrever(e) {
  const fonte = await e.call({action:'performancePeriodo', ...NOV, notaPorValor:true}, ADMIN);
  const f = await e.call({action:'performanceFechar', ...NOV, hash:fonte.hash, anterior:'', requestId:'fechar-revisao-' + (++n), motivo:'Fechamento fictício', leGrupos:true, leEntregasItens:true, notaPorValor:true}, ADMIN);
  assert.equal(f.status, 200, JSON.stringify(f).slice(0, 400));
  const p = await e.call({action:'performanceComissaoNova', ...NOV, fechamentoId:f.fechamento.id, anterior:'', entrada:entrada(f.fechamento.registros), motivo:'Prévia fictícia', requestId:'previa-revisao-' + (++n)}, ADMIN);
  assert.equal(p.ok, true, JSON.stringify(p).slice(0, 400));
  return p.revisao;
}

/* ═══════════════ P1: o ID gravado repetido entre duas FICHAS ═══════════════ */
// A ficha do intruso vem antes no banco e grava o ID da titular; o CPF dele é outro.
const DUAS_FICHAS = [ficha('b', 'Intruso Fictício', 'intruso', '71000999999', {idPessoa:'700001'}), ficha('a', 'Titular Fictício', 'titular-ficticio', '70000111111')];

test('revisão pessoas: duas FICHAS com o mesmo ID e CPFs diferentes: nenhuma fica com o ID; o aviso diz "duas fichas", sem CPF', async () => {
  const e = await edge('pcp-sync', banco(DUAS_FICHAS));
  const fichas = await e.run('fichasRH()');
  // Caso ruim: nenhuma marca de repetido, e a régua dava a O.S. da titular ao intruso.
  // A ordem é a da chave da linha (o RH é lido em páginas desde a auditoria de 12/10/2026).
  assert.equal(JSON.stringify(fichas.map(f => [f.chave, f.id, !!f.idRepetido])), JSON.stringify([['a', '700001', true], ['b', '700001', true]]));
  const regua = await e.run('pessoasDoPCP()');
  assert.equal(regua.repetido('700001'), true);
  const p = regua.pessoa('700001');
  assert.equal(p.semFicha, true); assert.equal(p.repetido, true); assert.equal(p.nome, '', 'o ID não é de nenhuma das duas');
  assert.equal(regua.idDe('Intruso'), '', 'o nome não leva ao ID repetido');
  assert.equal(regua.idDe('titular-ficticio'), '');
  assert.equal(regua.nome('700001'), 'ID 700001 (repetido no RH)', 'a O.S. não aparece no nome de ninguém');
  const el = await e.call({action:'elenco', freelancers:true}, ADMIN);
  const avisos = el.avisos.join(' ');
  assert.match(avisos, /O ID 700001 está em duas fichas do RH \(a ficha de Intruso Fictício, a ficha de Titular Fictício\), de pessoas com CPFs diferentes\. Nenhum desses cadastros fica com o ID/);
  assert.doesNotMatch(avisos, /vale o ID gravado/, 'o aviso de "vale o gravado" seria mentira no ID repetido');
  assert.doesNotMatch(avisos, /71000999999|70000111111|710009|700001111/, 'nenhum CPF no aviso');
  assert.ok(el.pessoas.filter(x => x.id === '700001').every(x => x.idRepetido === true), 'a gestão vê as duas marcadas no seletor');
});

test('revisão pessoas: ficha x ficha com o MESMO CPF (a pessoa que voltou) não é repetido', async () => {
  const S = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const r = S.juntarFreelancers([{chave:'v1', id:'700001', nome:'Vera Fictícia', cpf:'70000111111', desligado:true}, {chave:'v2', id:'700001', nome:'Vera Fictícia', cpf:'70000111111'}], [], {hoje:'2026-12-02'});
  assert.equal(r.repetidos.size, 0); assert.deepEqual(r.avisos, []);
  // Duas fichas sem CPF com o mesmo ID gravado: não há como provar que é a mesma pessoa.
  const s = S.juntarFreelancers([{chave:'x', id:'700009', nome:'Xis Fictício', cpf:''}, {chave:'y', id:'700009', nome:'Ypsilon Fictício', cpf:''}], [], {hoje:'2026-12-02'});
  assert.deepEqual([...s.repetidos], ['700009']);
});

test('revisão pessoas: o contrato com ID gravado e CPF inválido entra na conferência do repetido', async () => {
  const S = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  // Caso ruim: o contrato sem CPF válido ia direto para a lista, sem conferir o ID contra a ficha.
  const r = S.juntarFreelancers([{chave:'a', id:'700001', nome:'Titular Fictício', cpf:'70000111111'}],
    [{id:'fl-b', nome:'Intruso Fictício', apelido:'intruso', cpf:'71000999999', idPessoa:'700001', funcao:'Instalador', situacao:'ativo', contratoFim:'2099-12-31'}], {hoje:'2026-12-02'});
  assert.deepEqual([...r.repetidos], ['700001']);
  assert.equal(r.contratos[0].idRepetido, true);
  assert.match(r.avisos.join(' '), /O ID 700001 está em uma ficha e um contrato de freelancer do RH/);
  const e = await edge('pcp-sync', banco([ficha('a', 'Titular Fictício', 'titular-ficticio', '70000111111')],
    {registros:[ficha('a', 'Titular Fictício', 'titular-ficticio', '70000111111'), {id:'fl-b', colecao:'freelancers', apagado:false, registro:{id:'fl-b', nome:'Intruso Fictício', apelido:'intruso', cpf:'71000999999', idPessoa:'700001', funcao:'Instalador', situacao:'ativo', contratoFim:'2099-12-31'}}]}));
  const fichas = await e.run('fichasRH()');
  assert.ok(fichas.filter(f => f.id === '700001').every(f => f.idRepetido === true), JSON.stringify(fichas));
});

test('revisão pessoas: designar titular ou substituto com ID repetido é recusado (400) e diz por quê', async () => {
  const e = await edge('pcp-sync', banco(DUAS_FICHAS));
  relogio(e, '2026-12-02T12:00:00Z');
  // Caso ruim: a porta aceitava e o vigente saía com o nome do intruso.
  const t = await gravar(e, {operacao:'titular', titularId:'700001'});
  assert.equal(t.status, 400, JSON.stringify(t));
  assert.match(t.error, /O ID 700001 está em dois cadastros do RH, de pessoas diferentes: ele não é de ninguém até o RH corrigir/);
  assert.equal(e.db.pcp_registros.filter(r => r.colecao === 'comissao_aprovador').length, 0);
});

test('revisão pessoas: com o ID repetido, o crachá de toque do intruso não abre a O.S. da titular e a conta dele não aprova como titular', async () => {
  // O titular foi designado ANTES de a ficha do intruso gravar o ID da titular.
  const evento = {id:'2026-11-30T10:00:00.000Z-aaaa0001', em:'2026-11-30T10:00:00.000Z', requestId:'aprovador-antigo-0001', operacao:'titular', motivo:'Designação fictícia de antes', titularId:'700001', substituto:null, por:{nome:'Admin Fictício', login:'admin-ficticio', papel:'admin', porId:''}};
  const b = banco(DUAS_FICHAS);
  b.pcp_registros.push({colecao:'comissao_aprovador', id:evento.id, apagado:false, atualizado_em:evento.em, registro:evento});
  const e = await edge('pcp-sync', b);
  relogio(e, '2026-12-02T12:00:00Z');
  const toque = {nome:'Intruso', sub:'Intruso', papel:'montagem', montagemIndividual:true, exp:EXP};
  const up = await e.call({action:'upsert', os:{...e.db.pcp_registros.find(r => r.colecao === 'os').registro, horaSaida:'08:00'}}, toque);
  // Caso ruim: 200, o crachá do intruso gravava na O.S. da titular. A porta recusa como O.S. de outra equipe.
  assert.equal(up.status, 422, JSON.stringify(up)); assert.match(up.error, /não está mais na sua equipe/);
  // O crachá com o ID assinado também não vale enquanto o ID está repetido.
  const comId = await e.call({action:'upsert', os:{...e.db.pcp_registros.find(r => r.colecao === 'os').registro, horaSaida:'08:00'}}, {...toque, nome:'Fulano Sem Ficha', sub:'Fulano Sem Ficha', id:'700001'});
  assert.equal(comId.status, 422, JSON.stringify(comId)); assert.match(comId.error, /não está mais na sua equipe/);
  const previa = await fecharEPrever(e);
  // A prévia não paga o ID repetido: a pendência diz o que fazer.
  assert.equal(previa.apuracao.aprovavel, false);
  assert.ok(previa.apuracao.pendencias.some(p => /O ID 700001 está em dois cadastros do RH, de pessoas diferentes: não paga ninguém até o RH corrigir\./.test(p)), JSON.stringify(previa.apuracao.pendencias));
  const ap = await aprovar(e, previa, INTRUSO);
  assert.equal(ap.status, 403, 'caso ruim: o intruso aprovava "como titular"');
  // A conta da gestão com o ID repetido assinado no crachá também não passa por titular.
  const ap2 = await aprovar(e, previa, {...INTRUSO, id:'700001'});
  assert.equal(ap2.status, 403);
});

/* ═══════════════ P3: a conta ligada na Central vale antes do apelido ═══════════════ */
test('revisão pessoas: a conta da gestão é a pessoa da Central de Acessos (acesso_conta.id_pessoa) antes do apelido', async () => {
  const S = await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const fichas = [{chave:'a', id:'700001', nome:'Titular Fictício', apelido:'titular-ficticio'}, {chave:'c', id:'700003', nome:'Outra Fictícia', apelido:'outra'}];
  const regua = S.resolverPessoas({pessoas:fichas});
  // Sem a Central: o apelido (como antes).
  assert.equal(S.idDaConta('titular-ficticio', [], regua), '700001');
  // Login que não é apelido de ninguém, mas está ligado na Central: resolve.
  assert.equal(S.idDaConta('thi.ficticio', [{usuario:'thi.ficticio', id_pessoa:'700001', ativo:true, tipo:'pessoa'}], regua), '700001');
  // A Central manda sobre o apelido.
  assert.equal(S.idDaConta('outra', [{usuario:'outra', id_pessoa:'700001', ativo:true, tipo:'pessoa'}], regua), '700001');
  // Conta da Central com ID fora do RH, de função ou inativa: sem ID (não cai no apelido) ou ignorada.
  assert.equal(S.idDaConta('outra', [{usuario:'outra', id_pessoa:'799999', ativo:true, tipo:'pessoa'}], regua), '');
  assert.equal(S.idDaConta('outra', [{usuario:'outra', id_pessoa:'700001', ativo:false, tipo:'pessoa'}], regua), '700003');
  assert.equal(S.idDaConta('outra', [{usuario:'outra', id_pessoa:'700001', ativo:true, tipo:'funcao'}], regua), '700003');
  // ID repetido não é de ninguém, nem pela Central nem pelo apelido.
  const rep = S.resolverPessoas({pessoas:fichas.map(f => f.id === '700001' ? {...f, idRepetido:true} : f)});
  assert.equal(S.idDaConta('thi.ficticio', [{usuario:'thi.ficticio', id_pessoa:'700001', ativo:true, tipo:'pessoa'}], rep), '');
  assert.equal(S.idDaConta('titular-ficticio', [], rep), '');
  // No servidor: o titular designado entra por um login que não é o apelido, ligado na Central.
  const b = banco([ficha('a', 'Titular Fictício', 'titular-ficticio', '70000111111')], {acesso_conta:[{usuario:'thi.ficticio', id_pessoa:'700001', ativo:true, tipo:'pessoa'}]});
  b.equipe_contas.push({sistema:'pcp', usuario:'thi.ficticio', papel:'pcp', ativo:true});
  const e = await edge('pcp-sync', b);
  relogio(e, '2026-12-02T12:00:00Z');
  assert.equal((await gravar(e, {operacao:'titular', titularId:'700001'})).status, 200);
  const previa = await fecharEPrever(e);
  const ap = await aprovar(e, previa, conta('pcp', 'thi.ficticio', 'Titular Fictício'));
  assert.equal(ap.ok, true, JSON.stringify(ap).slice(0, 300));
  assert.equal(ap.revisao.autor.como, 'titular'); assert.equal(ap.revisao.autor.porId, '700001');
});

/* ═══════════════ P2: quem não consegue aprovar pela tela ═══════════════ */
test('revisão pessoas: designar quem não tem acesso pcp com senha ligado à ficha devolve o aviso; a leitura diz quem aprova pela tela', async () => {
  const fichas = [ficha('a', 'Titular Fictício', 'titular-ficticio', '70000111111'), ficha('s', 'Sem Acesso Fictício', 'sem-acesso', '70000222222'),
    ficha('o', 'Operação Fictícia', 'operacao-ficticia', '70000333333')];
  const b = banco(fichas);
  b.equipe_contas = [{sistema:'pcp', usuario:'titular-ficticio', papel:'pcp', ativo:true}, {sistema:'pcp', usuario:'operacao-ficticia', papel:'operacao', ativo:true}];
  const e = await edge('pcp-sync', b);
  relogio(e, '2026-12-02T12:00:00Z');
  // Caso ruim: o titular sem conta era aceito em silêncio.
  const t = await gravar(e, {operacao:'titular', titularId:'700002'});
  assert.equal(t.status, 200);
  assert.match(t.avisos.join(' '), /^Sem Acesso Fictício não consegue aprovar pela tela: precisa de acesso pcp com senha ligado à ficha do RH/);
  assert.deepEqual(t.gravado, {operacao:'titular', id:'700002', nome:'Sem Acesso Fictício'});
  // Conta com papel operação: a tela de aprovar não abre para ela; desde a S1 da auditoria de 12/10/2026, o substituto assim é recusado.
  const s = await gravar(e, {operacao:'substituto', substitutoId:'700003', de:'2026-12-02'});
  assert.equal(s.status, 400); assert.match(s.error, /Operação Fictícia não pode ser o substituto: o substituto precisa aprovar pela tela/);
  // Com a conta pcp ligada: sem aviso.
  const ok = await gravar(e, {operacao:'titular', titularId:'700001'});
  assert.deepEqual(ok.avisos, []);
  assert.deepEqual(ok.aprovamPelaTela, ['700001']);
  const l = await e.call({action:'comissaoAprovadorLer'}, TITULAR);
  assert.deepEqual(l.aprovamPelaTela, ['700001']); assert.equal(l.gravado, undefined);
});

/* ═══════════════ U1: o grupo "Aprovação da comissão" fica aberto ═══════════════ */
function fatia(arquivo, de, ate) {
  const src = ler(arquivo), i = src.indexOf(de), j = src.indexOf(ate, i);
  assert.ok(i >= 0 && j > i, `${arquivo}: ${de}`);
  return src.slice(i, j);
}
test('revisão pessoas: gravar em Configurações não fecha o grupo aberto, mesmo com outro cfg-grupo aparecendo antes dele', () => {
  const ctx = {STATE:{}};
  vm.createContext(ctx); vm.runInContext(fatia('app.js', '/* OS GRUPOS ABERTOS DE CONFIGURAÇÕES', 'function renderControle() {'), ctx);
  const det = (grupo, open) => ({dataset:{grupo}, open, ouvintes:[], addEventListener(t, f) { this.ouvintes.push(f); }});
  const painel = lista => ({querySelectorAll:sel => { assert.equal(sel, ':scope > details.cfg-grupo[data-grupo]'); return lista; }});
  // 1ª pintura: só Conexões aberta (o padrão do HTML); a pessoa abre "Aprovação da comissão".
  let grupos = [det('conexoes', true), det('equipe', false), det('aprovacao', false)];
  ctx.cfgGruposRestaurar(painel(grupos));
  grupos[2].open = true; grupos[2].ouvintes.forEach(f => f());
  grupos[0].open = false; grupos[0].ouvintes.forEach(f => f());
  // Grava: a aba se refaz com o HTML padrão. Caso ruim: pela posição, um cfg-grupo novo do painel
  // de saúde (aninhado) deslocava a conta, e "Aprovação" voltava fechada.
  ctx.cfgGruposGuardar(painel(grupos));
  grupos = [det('conexoes', true), det('equipe', false), det('aprovacao', false)];
  ctx.cfgGruposRestaurar(painel(grupos));
  assert.equal(grupos[2].open, true, 'a Aprovação da comissão continua aberta');
  assert.equal(grupos[0].open, false, 'Conexões continua como a pessoa deixou');
  // O renderControle usa os dois, e todo grupo de primeiro nível tem nome.
  const rc = fatia('app.js', 'function renderControle() {', '// Handlers de níveis (admin)');
  assert.match(rc, /cfgGruposGuardar\(el\);[\s\S]*el\.innerHTML =[\s\S]*cfgGruposRestaurar\(el\);/);
  assert.doesNotMatch(rc, /gruposAbertos\[i\]/, 'nada pela posição');
  for (const g of ['conexoes', 'equipe', 'regras', 'mensagens', 'aprovacao']) assert.match(rc, new RegExp(`<details class="cfg-grupo" data-grupo="${g}"`));
});

/* ═══════════════ U1, U2 e P2 na tela: os blocos de titular e substituto ═══════════════ */
function telaAprovador(papel, dados) {
  const ctx = {STATE:{user:{papel}}, esc:s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c])),
    pessoasRH:() => [{id:'700001', nome:'Titular Fictício'}, {id:'700002', nome:'Sem Acesso Fictício'}], STORE:{api:async () => ({})}, toast() {}};
  vm.createContext(ctx); vm.runInContext(ler('comissao-ui.js'), ctx);
  ctx.__d = dados; vm.runInContext('comissaoAprovadorDados={carregando:false,dados:__d,erro:""}', ctx);
  return ctx;
}
const LEITURA = {hoje:'2026-12-02', avisos:[], config:{titularId:'700001', titularNome:'Titular Fictício', substituto:null}, vigente:{modo:'titular', id:'700001', nome:'Titular Fictício'}, diario:[], aprovamPelaTela:['700001']};
test('revisão pessoas: titular e substituto em blocos com título, frase, rótulo em cima, botão e retorno no próprio bloco', () => {
  const html = telaAprovador('admin', LEITURA).comissaoAprovadorSecaoHTML();
  const bloco = op => (new RegExp(`<form class="aprov-form" data-aprov-op="${op}">([\\s\\S]*?)</form>`).exec(html) || [])[1] || '';
  const t = bloco('titular'), s = bloco('substituto');
  assert.match(t, /^<h4>Titular<\/h4><p class="aprov-desc">Quem aprova a comissão todo mês\./);
  assert.match(s, /^<h4>Substituto<\/h4><p class="aprov-desc">Um reserva que fica configurado para ajudar o titular: entre o início e o fim, os dois aprovam\./);
  for (const b of [t, s]) {
    assert.match(b, /<label class="aprov-campo"><span>Pessoa<\/span><select name="pessoa">/, 'o rótulo em cima do campo');
    assert.match(b, /<label class="aprov-campo"><span>Motivo da mudança<\/span><input name="motivo"/, 'o motivo dentro do bloco do botão');
    assert.match(b, /<button class="btn-primary btn-sm" type="submit">Designar (titular|substituto)<\/button><\/div><p role="alert" class="aprov-erro"><\/p>/);
  }
  assert.match(s, /<div class="aprov-datas"><label class="aprov-campo"><span>Início<\/span><input type="date" name="de" value="2026-12-02"><\/label><label class="aprov-campo"><span>Fim \(opcional\)<\/span>/);
  assert.doesNotMatch(html, /data-aprov-op="encerrar"/, 'sem substituto, sem o bloco de encerrar');
  // P2: a lista marca quem aprova pela tela.
  assert.match(t, /<option value="700001" selected>Titular Fictício · 700001 · aprova pela tela<\/option>/);
  assert.match(t, /<option value="700002">Sem Acesso Fictício · 700002 · sem acesso pcp ligado<\/option>/);
  // O CSS existe para as peças (antes não havia regra nenhuma) e cabe em 375.
  const css = ler('styles.css');
  for (const r of ['.aprov-blocos {', '.aprov-form {', '.aprov-campo {', '.aprov-datas {', '.aprov-erro {', '.aprov-retorno {']) assert.ok(css.includes(r), r);
  assert.match(css, /\.aprov-blocos \{ display: grid; grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 300px\), 1fr\)\)/);
  assert.match(css, /@media \(max-width: 420px\) \{ \.aprov-datas \{ grid-template-columns: 1fr; \}/);
});

test('revisão pessoas: depois de gravar, o aviso do servidor aparece no bloco gravado (não só no toast) e vem para a vista', async () => {
  const avisos = ['Sem Acesso Fictício não consegue aprovar pela tela: precisa de acesso pcp com senha ligado à ficha do RH.'];
  const resposta = {...LEITURA, avisos, gravado:{operacao:'titular', id:'700002', nome:'Sem Acesso Fictício'}, config:{titularId:'700002', titularNome:'Sem Acesso Fictício', substituto:null}};
  const ctx = telaAprovador('admin', LEITURA);
  ctx.STORE.api = async () => resposta;
  const toasts = []; ctx.toast = (m, t) => toasts.push([m, t]);
  ctx.crypto = {randomUUID:() => 'pedido-ficticio-0001'}; ctx.document = {activeElement:null};
  // Um formulário falso com os campos do titular.
  const campos = {pessoa:{value:'700002'}, motivo:{value:'Motivo fictício com mais de quinze letras'}};
  const erro = {textContent:''}, botao = {disabled:false};
  const form = {dataset:{aprovOp:'titular'}, onsubmit:null, querySelector:sel => sel === '.aprov-erro' ? erro : sel === 'button' ? botao : campos[(/name="(\w+)"/.exec(sel) || [])[1]]};
  let rolou = null, pintou = 0;
  const sec = {querySelector:sel => sel === '[data-aprov-retorno]' ? {scrollIntoView:o => { rolou = o; }} : null, querySelectorAll:() => [form]};
  ctx.comissaoAprovadorWire({querySelector:() => sec}, () => { pintou++; });
  await form.onsubmit({preventDefault() {}});
  assert.equal(pintou, 1);
  assert.deepEqual(toasts, [['Quem aprova a comissão: gravado, com aviso (veja ao lado do bloco).', 'warn']]);
  const html = ctx.comissaoAprovadorSecaoHTML();
  const t = /<form class="aprov-form" data-aprov-op="titular">([\s\S]*?)<\/form>/.exec(html)[1];
  assert.match(t, /<div class="aprov-retorno" role="status" data-aprov-retorno><p class="aprov-ok">Titular designado: Sem Acesso Fictício \(cadastro 700002\)\.<\/p><p class="perf-aviso">Sem Acesso Fictício não consegue aprovar pela tela/);
  assert.equal(html.split('não consegue aprovar pela tela').length - 1, 1, 'o aviso aparece uma vez, no bloco');
  // A repintura seguinte traz o retorno para a vista uma vez só.
  ctx.comissaoAprovadorWire({querySelector:() => sec}, () => {});
  assert.equal(JSON.stringify(rolou), JSON.stringify({block:'center'}));
  rolou = null; ctx.comissaoAprovadorWire({querySelector:() => sec}, () => {});
  assert.equal(rolou, null);
});

/* ═══════════════ U5: o titular com login sem ID ligado ═══════════════ */
test('revisão pessoas: o acesso sem ID ligado não lê "é o titular designado" e o admin não aparece duas vezes', async () => {
  const {COMISSAO:S} = await import('../supabase/functions/_shared/pcp-comissao.mjs');
  const C = require('../comissao.js');
  for (const X of [C, S]) {
    const q = X.quemAprova({papel:'pcp', porId:''}, {titularId:'700001'}, '2026-12-02');
    assert.equal(q.ok, false);
    assert.match(q.erro, /^Seu acesso não está ligado a uma ficha do RH, então a porta não reconhece você pelo ID\. Para aprovar, o admin liga a conta à ficha/);
    assert.doesNotMatch(q.erro, /titular designado|admin também aprova|ou o admin/);
    assert.match(X.quemAprova({papel:'pcp', porId:'700003'}, {titularId:'700001'}, '2026-12-02').erro, /^Você não aprova: quem aprova a comissão é o titular designado pela gestão\.$/);
    const sub = {titularId:'700001', substituto:{id:'700002', de:'2026-12-01'}};
    // D-017: com o substituto valendo, o titular aprova; quem não é nenhum dos dois lê a frase sem o admin.
    assert.equal(X.quemAprova({papel:'pcp', porId:'700001'}, sub, '2026-12-02').ok, true);
    assert.doesNotMatch(X.quemAprova({papel:'pcp', porId:'700003'}, sub, '2026-12-02').erro, /admin/);
  }
  const ctx = telaAprovador('pcp', LEITURA);
  const linha = ctx.comissaoAprovadorLinhaHTML({modo:'titular', id:'700001', nome:'Titular Fictício', podeAprovar:false, motivo:C.quemAprova({papel:'pcp', porId:''}, {titularId:'700001'}, '2026-12-02').erro});
  assert.equal(linha.split('admin também aprova').length - 1, 1, linha);
  assert.match(linha, /<strong>Seu acesso não está ligado a uma ficha do RH/);
});

/* ═══════════════ U3: a etiqueta "Freelancer" não quebra ═══════════════ */
test('revisão pessoas: a etiqueta Freelancer fica inteira no pódio (flex em linha) e na TV (coluna), com letra de TV', () => {
  const css = ler('styles.css');
  // Caso ruim: dentro de .perf-podio-nome (flex) a etiqueta encolhia até "Fre/elan/cer"; na .tv-nome (coluna) esticava na linha.
  assert.match(css, /\.perf-podio-nome \.tag-freelancer, \.tv-nome \.tag-freelancer \{ flex-shrink: 0; white-space: nowrap; align-self: flex-start; \}/);
  assert.match(css, /\.tv-corpo \.tag-freelancer \{ font-size: clamp\(\.8rem, 1\.15vw, 1\.15rem\);/);
  assert.match(ler('performance.js'), /<h4 class="perf-podio-nome">[^\n]*\$\{x\.etiqueta \|\| ''\}<\/h4>/);
  assert.match(ler('casa.js'), /<span class="tv-nome">\$\{esc\(p\.nome\)\}\$\{etiqueta\(p, rosto\)\}<\/span>/);
});

/* ═══════════════ U4: "pessoa a cadastrar" com nome digitado errado ═══════════════ */
test('revisão pessoas: a marca diz "cadastre no RH, ou ligue o nome em Conferir nomes"; Conferir nomes mostra os parecidos sem ligar', () => {
  const app = ler('app.js');
  assert.match(app, /Cadastre no RH \(ficha ou contrato de freelancer\), ou, se a pessoa já tem ficha, ligue o nome em Performance › Conferência › Conferir nomes\./);
  assert.match(app, /Cadastre no RH, ou, se a pessoa já tem ficha \(o nome pode estar digitado diferente\), ligue o nome em Performance › Conferência › Conferir nomes\./);
  const O = require('../operacao.js');
  const ctx = {OPERACAO:O, normCasa:s => O.normPessoa ? O.normPessoa(s) : String(s).toLowerCase()};
  vm.createContext(ctx);
  vm.runInContext(fatia('casa.js', 'function sugestaoParecidaCasa(', 'function gruposDeGrafiasCasa('), ctx);
  const ativos = [{id:'710001', nome:'Ramiro Nonato Ferreira'}, {id:'710002', nome:'Ramira Souza'}, {id:'710003', nome:'Bruno Dorneles'}, {id:'710004', nome:'Ramiro Melo', idRepetido:true}];
  // Caso ruim: "Ramiru" (digitado errado) empatava na sugestão única e saía só "Nenhuma", com a marca mandando cadastrar.
  assert.equal(ctx.sugestaoParecidaCasa('Ramiru', ativos), null, 'a sugestão única empata');
  const ps = ctx.sugestoesParecidasCasa('Ramiru', ativos).map(p => p.id);
  assert.equal(JSON.stringify(ps), JSON.stringify(['710002', '710001']), 'os parecidos (empate pelo nome), sem o ID repetido e sem quem não parece');
  assert.equal(ctx.sugestoesParecidasCasa('Zé Novo', ativos).length, 0);
  const casa = ler('casa.js');
  assert.match(casa, /Parecidos com este nome: \$\{l\.parecidos\.map\(p => `<strong>\$\{esc\(p\.nome\)\}<\/strong>`\)\.join\(', '\)\}\. Se for um deles, escolha e ligue; nada se liga sozinho\./);
});

/* ═══════════════ U6: a busca por documento confere o tamanho antes de limpar ═══════════════ */
test('revisão pessoas: o documento incompleto fica no campo para corrigir; o inteiro sai do campo e vai ao servidor', async () => {
  const casa = ler('casa.js');
  const i = casa.indexOf('/* BUSCA DE PESSOA POR CPF OU CNPJ'), j = casa.indexOf('function ligacaoRHHTML(', i);
  const chamadas = [], campos = {input:{value:'', focus() { this.focado = true; }}, saida:{textContent:''}, botao:{disabled:false}};
  const form = {onsubmit:null, querySelector:sel => sel.startsWith('input') ? campos.input : sel === '.busca-doc-res' ? campos.saida : campos.botao};
  const ctx = {STATE:{user:{papel:'pcp'}}, STORE:{api:async c => { chamadas.push(c); return {pessoas:[]}; }}};
  vm.createContext(ctx); vm.runInContext(casa.slice(i, j), ctx);
  ctx.wireBuscaDocumentoCasa({querySelector:() => form});
  // Caso ruim: um dígito a menos apagava tudo o que foi digitado.
  campos.input.value = '630.001.111-1';
  await form.onsubmit({preventDefault() {}});
  assert.equal(campos.input.value, '630.001.111-1'); assert.equal(campos.input.focado, true);
  assert.equal(campos.saida.textContent, 'Digite o CPF (11 dígitos) ou o CNPJ (14 dígitos) inteiro. Há 10 dígitos no campo.');
  assert.equal(chamadas.length, 0);
  campos.input.value = '630.001.111-11';
  await form.onsubmit({preventDefault() {}});
  assert.equal(campos.input.value, ''); assert.equal(chamadas.length, 1);
});

/* ═══════════════ U7: a lista do fechamento por pessoa ═══════════════ */
test('revisão pessoas: a lista "a cadastrar" do fechamento agrupa por pessoa, com as O.S. de cada uma', () => {
  const ctx = {esc:s => String(s ?? ''), perfACadastrar:null};
  vm.createContext(ctx);
  vm.runInContext(fatia('performance.js', '/* POR PESSOA, COM AS O.S. DE CADA UMA', 'function perfFonteHTML('), ctx);
  ctx.perfACadastrar = () => [{numero:'7001', nomes:['Zé Novo', 'Ana Nova']}, {numero:'7002', nomes:['Zé Novo']}, {numero:'7003', nomes:['zé novo']}];
  const html = ctx.perfACadastrarHTML({});
  // Caso ruim: uma linha por O.S., com o mesmo nome repetido em várias.
  assert.match(html, /<strong>👤 2 pessoas a cadastrar no RH, em 3 O\.S\.<\/strong>/);
  assert.match(html, /<ul><li><strong>Zé Novo<\/strong>: O\.S\. 7001, 7002, 7003<\/li><li><strong>Ana Nova<\/strong>: O\.S\. 7001<\/li><\/ul>/);
  assert.match(html, /ligue o nome em Conferir nomes\./);
});
