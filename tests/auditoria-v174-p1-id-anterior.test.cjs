'use strict';
/* P1 DA AUDITORIA DE 12/10/2026, LADO DO PCP: uma ficha teve o CPF corrigido e
   o ID trocado à mão no RH. A conta da Central ficou com o ID antigo (o PCP
   gravava as ações da pessoa sem o ID do autor), e o ID antigo ficou em O.S.,
   no histórico e no aprovador, sem nome. O RH passa a gravar os IDs que a
   pessoa já teve em `idPessoaAnteriores`; o PCP lê esse campo das fichas e dos
   contratos e trata cada ID anterior como a MESMA pessoa: nome no histórico e
   nas O.S., conta da Central, equipes, divisões e o aprovador. O ID anterior
   que é hoje o ID de outra pessoa é conflito: avisa, não junta. Começa pelo
   caso ruim da prova da auditoria (no fbc56b9 o campo era ignorado). Dados
   fictícios, com a forma do caso real. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {edge}=require('./helpers/edge.cjs');
const O=require('../operacao.js');
const EXP=Math.floor(Date.parse('2027-12-31T00:00:00Z')/1000);
const DONO={papel:'admin',sub:'dono-ficticio',nome:'Dono Fictício',exp:EXP};
const ficha=(id,nome,apelido,cpf,extra={})=>({id,colecao:'colaboradores',apagado:false,registro:{id,nome,apelido,cpf,statusId:'ativo',...extra}});
// A ficha da direção: CPF corrigido, ID trocado de 700009 para 710002, e o antigo guardado.
const DIRECAO=ficha('dono','Dono Fictício','dono-ficticio','71000222222',{idPessoa:'710002',idPessoaAnteriores:['700009']});
const FICHAS=[DIRECAO,ficha('a','Titular Fictício','titular-ficticio','70000111111',{idPessoa:'700001'}),
  ficha('i','Instaladora Fictícia','inst-ficticia','10001199999',{idPessoa:'100011',idPessoaAnteriores:['100001']})];
const OS={id:'A',numero:'90901',tipo:'externo',cliente:'Cliente fictício',equipe:['100001'],instalacao:{data:'2026-10-08',periodo:'Manhã'},
  alocacaoLog:[{acao:'alocou',em:'2026-10-03T00:00:00Z',por:'dono-ficticio',porId:'700009',antes:null,depois:null}]};
const CONTA_VELHA=[{usuario:'dono-ficticio',id_pessoa:'700009',ativo:true,tipo:'pessoa'},{usuario:'titular-ficticio',id_pessoa:'700001',ativo:true,tipo:'pessoa'}];
const banco=(fichas=FICHAS,contas=CONTA_VELHA,extra={})=>({registros:structuredClone(fichas),acesso_conta:structuredClone(contas),
  pcp_registros:[{colecao:'os',id:'A',apagado:false,atualizado_em:'2026-10-08T00:00:00Z',registro:structuredClone(OS)}],
  pcp_config_global:[{id:true,atualizado_em:'2020-01-01',config:{instaladores:[]}}],
  equipe_contas:[{sistema:'pcp',usuario:'titular-ficticio',papel:'pcp',ativo:true}],...extra});
const S=()=>import('../supabase/functions/_shared/pcp-integridade.mjs');

test('P1: a conta da Central com o ID anterior leva ao ID de hoje, e a gravação da direção sai com o autor',async()=>{
  const e=await edge('pcp-sync',banco());
  const I=await S();
  const regua=await e.run('pessoasDoPCP()'), contas=await e.run('contasAcesso()');
  assert.equal(I.idDaConta('dono-ficticio',contas,regua),'710002','caso ruim (fbc56b9): sem ID');
  const g=await e.call({action:'comissaoAprovadorGravar',operacao:'titular',titularId:'700001',motivo:'Motivo fictício com mais de quinze letras',requestId:'p1-aprov-0001'},DONO);
  assert.equal(g.status,200,JSON.stringify(g).slice(0,300));
  assert.equal(e.db.pcp_registros.find(r=>r.colecao==='comissao_aprovador').registro.por.porId,'710002');
});

test('P1: o histórico e as O.S. com o ID anterior têm o nome da pessoa; a régua do aparelho é a mesma',async()=>{
  const e=await edge('pcp-sync',banco());
  const regua=await e.run('pessoasDoPCP()');
  assert.equal(regua.nome('700009'),'Dono','caso ruim: "ID 700009"');
  assert.equal(regua.pessoa('700009').id,'710002');assert.ok(!regua.pessoa('700009').semFicha);
  assert.equal(regua.idDe('100001'),'100011');
  // O aparelho recebe os IDs anteriores no elenco e chega à mesma pessoa.
  const el=await e.call({action:'elenco'},{papel:'pcp',sub:'titular-ficticio',nome:'Titular Fictício',exp:EXP});
  assert.deepEqual(el.pessoas.find(p=>p.id==='710002').anteriores,['700009']);
  const r=O.resolverPessoas({pessoas:el.pessoas});
  assert.equal(r.nome('700009'),'Dono');assert.equal(r.idDe('100001'),'100011');
});

test('P1: a O.S. e a equipe antigas com o ID anterior são da pessoa de hoje (o crachá dela abre a O.S.)',async()=>{
  const e=await edge('pcp-sync',banco());
  const toque={nome:'Instaladora',sub:'Instaladora',id:'100011',papel:'montagem',montagemIndividual:true,exp:EXP};
  const l=await e.call({action:'list',escopo:'abertas'},toque);
  assert.equal(l.status,200,JSON.stringify(l).slice(0,200));
  assert.ok((l.os||[]).some(o=>o.id==='A'),'a O.S. gravada com o ID anterior dela aparece');
  // O crachá antigo, assinado com o ID anterior, também é ela.
  const I=await S();const regua=await e.run('pessoasDoPCP()');
  assert.equal(I.idDoCracha({nome:'',id:'100001'},regua),'100011');
});

test('P1: o aprovador designado pelo ID anterior continua aprovando com o ID de hoje',async()=>{
  const fichas=[DIRECAO,ficha('a','Titular Fictício','titular-ficticio','71000111111',{idPessoa:'710001',idPessoaAnteriores:['700001']})];
  const ev={id:'2026-10-10T00:00:00Z-a',em:'2026-10-10T00:00:00Z',operacao:'titular',motivo:'Designação fictícia antiga',titularId:'700001',substituto:null};
  const e=await edge('pcp-sync',banco(fichas,[],{pcp_registros:[{colecao:'comissao_aprovador',id:ev.id,apagado:false,atualizado_em:ev.em,registro:ev}]}));
  const cfg=await e.run('comissaoAprovadorAtual()');
  assert.equal(cfg.titularId,'710001');
  const {COMISSAO}=await import('../supabase/functions/_shared/pcp-comissao.mjs');
  assert.equal(COMISSAO.quemAprova({papel:'pcp',porId:'710001'},cfg,'2026-11-05').como,'titular');
});

test('P1: o ID anterior que é hoje o ID de outra pessoa é conflito: avisa e não junta (a conta antiga fica sem ID)',async()=>{
  // O RH deu o ID antigo, livre, a uma pessoa nova (o caso da prova da auditoria).
  const nova=ficha('n','Pessoa Nova Fictícia','nova-ficticia','70000999999',{idPessoa:'700009'});
  const e=await edge('pcp-sync',banco([...FICHAS,nova]));
  const regua=await e.run('pessoasDoPCP()');
  assert.equal(regua.nome('700009'),'Pessoa','o ID fica de quem é hoje');
  assert.equal(regua.idDe('700009'),'700009');
  const I=await S();
  assert.equal(I.idDaConta('dono-ficticio',await e.run('contasAcesso()'),regua),'','a conta da direção não vira a pessoa nova');
  const el=await e.call({action:'elenco'},{papel:'pcp',sub:'titular-ficticio',nome:'Titular Fictício',exp:EXP});
  assert.ok(el.avisos.some(a=>/^O ID 700009 aparece no RH como ID anterior de Dono Fictício, mas hoje é o ID de Pessoa Nova Fictícia\. O PCP não junta os dois/.test(a)),JSON.stringify(el.avisos));
  // Quem não é da gestão não recebe o aviso.
  assert.deepEqual((await e.call({action:'elenco'},{papel:'operacao',sub:'op',nome:'Operação',exp:EXP})).avisos,[]);
  // Dois cadastros dizendo o mesmo ID anterior: também não junta.
  const r=O.resolverPessoas({pessoas:[{id:'111111',nome:'Um Fictício',anteriores:['222222']},{id:'333333',nome:'Outro Fictício',anteriores:['222222']}]});
  assert.equal(r.idDe('222222'),'222222');assert.deepEqual(r.conflitosAnteriores.map(c=>[c.id,c.motivo]),[['222222','dois']]);
});

test('P1: as duas cópias da régua chegam ao mesmo resultado, e o campo vindo em texto também vale',async()=>{
  const I=await S();
  const dados={pessoas:[{id:'111111',nome:'Um Fictício',apelido:'um',anteriores:['999991']},{id:'333333',nome:'Outro Fictício',anteriores:['111111']}]};
  const a=O.resolverPessoas(dados),b=I.resolverPessoas(dados);
  for(const x of ['999991','111111','333333','um'])assert.deepEqual([a.idDe(x),a.nome(x)],[b.idDe(x),b.nome(x)],x);
  assert.deepEqual(I.idsAnterioresDoCadastro({idPessoaAnteriores:'["700009","710002","abc","700009"]'},'710002'),['700009']);
  assert.deepEqual(I.idsAnterioresDoCadastro({idPessoaAnteriores:'700009, 700010'},''),['700009','700010']);
  assert.deepEqual(I.idsAnterioresDoCadastro({},''),[]);
});

test('P1: gravar os IDs anteriores no RH não recalcula diferente o mês fechado de quem não usa o ID anterior',async()=>{
  const NOV={de:'2026-11-01',ate:'2026-11-30'};
  const gestor={papel:'pcp',nome:'Titular Fictício',sub:'titular-ficticio',exp:EXP};
  const os=(id,numero,equipe,dia)=>({id,numero,rev:3,tipo:'externo',cliente:'Cliente fictício',valorTotal:8500,equipe,veiculo:'Carro fictício',
    horaRetorno:'18:00',retornoEm:dia+'T18:00:00',finalizadaEm:dia+'T21:00:00.000Z',finalizadoPor:'Gestor fictício',entregaLancada:{data:dia,em:dia+'T21:00:00.000Z',por:'Gestor fictício'}});
  const semCampo=FICHAS.map(f=>{const g=structuredClone(f);delete g.registro.idPessoaAnteriores;return g;});
  const b=banco(semCampo,[],{pcp_registros:[os('B','90602',['100011'],'2026-11-12')].map(x=>({colecao:'os',id:x.id,apagado:false,atualizado_em:'2026-11-20T00:00:00Z',registro:x})),
    pcp_config_global:[{id:true,atualizado_em:'2020-01-01',config:{performancePCP:{equipes:[],participacoes:[{id:'B',membros:[{chave:'100011',nome:'Instaladora Fictícia',percentual:100}],por:'Gestor',em:'2026-11-13T00:00:00Z'}]}}}]});
  const e=await edge('pcp-sync',b);
  e.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date); let t = +new R("2026-12-02T12:00:00Z"); globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [t++])); } static now() { return t++; } }; }`);
  const fonte=await e.call({action:'performancePeriodo',...NOV,notaPorValor:true},gestor);
  const f=await e.call({action:'performanceFechar',...NOV,hash:fonte.hash,anterior:'',requestId:'fechar-p1-nov',motivo:'Fechamento fictício',leGrupos:true,leEntregasItens:true,notaPorValor:true},gestor);
  assert.equal(f.status,200,JSON.stringify(f).slice(0,300));
  const selo=f.fechamento;
  const com=structuredClone(e.db);com.registros=structuredClone(FICHAS);
  const e2=await edge('pcp-sync',com);
  e2.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date); let t = +new R("2026-12-03T12:00:00Z"); globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [t++])); } static now() { return t++; } }; }`);
  const s=JSON.stringify({regraNota:selo.regraNota,regraPerdas:selo.regraPerdas,regraVolta:selo.regraVolta});
  assert.equal((await e2.run(`perfFonte(perfParametrosDoSelo(${s},${JSON.stringify(NOV)}),perfOpcoesDoSelo(${s}))`)).hash,selo.hash);
});
