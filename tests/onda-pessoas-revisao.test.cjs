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
  assert.equal(JSON.stringify(fichas.map(f => [f.chave, f.id, !!f.idRepetido])), JSON.stringify([['b', '700001', true], ['a', '700001', true]]));
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
  // Conta com papel operação: a porta aceitaria o substituto, mas a tela de aprovar não abre para ela.
  const s = await gravar(e, {operacao:'substituto', substitutoId:'700003', de:'2026-12-02'});
  assert.match(s.avisos.join(' '), /Operação Fictícia não consegue aprovar pela tela/);
  // Com a conta pcp ligada: sem aviso.
  const ok = await gravar(e, {operacao:'titular', titularId:'700001'});
  assert.deepEqual(ok.avisos, []);
  assert.deepEqual(ok.aprovamPelaTela, ['700001']);
  const l = await e.call({action:'comissaoAprovadorLer'}, TITULAR);
  assert.deepEqual(l.aprovamPelaTela, ['700001']); assert.equal(l.gravado, undefined);
});
