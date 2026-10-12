'use strict';
/* AS PROVAS DA REVISÃO "DINHEIRO" DA ONDA AUDITORIA (12/10/2026), trazidas para a
   suíte. Cada teste é o caso ruim que o revisor achou no ramo onda-auditoria
   (falhava antes da correção). Dados fictícios. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {edge}=require('./helpers/edge.cjs');
const D=require('../divisao.js');
const O=require('../operacao.js');
const EXP=Math.floor(Date.parse('2027-12-31T00:00:00Z')/1000);
const TITULAR={papel:'pcp',sub:'titular-ficticio',nome:'Titular Ficticio',exp:EXP};
const NOV={de:'2026-11-01',ate:'2026-11-30'};
const relogio=(e,iso)=>e.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date); let t = +new R(${JSON.stringify(iso)});
  globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [t++])); } static now() { return t++; } }; }`);
function cpf(base9){const d=base9.split('').map(Number);const dv=n=>{let s=0;for(let i=0;i<n;i++)s+=d[i]*(n+1-i);const r=(s*10)%11;return r===10?0:r;};d.push(dv(9));d.push(dv(10));return d.join('');}
const ficha=(id,nome,apelido,idPessoa,extra={})=>({id,colecao:'colaboradores',apagado:false,registro:{id,nome,apelido,cpf:cpf(idPessoa+'123'),idPessoa,statusId:'ativo',...extra}});
const it=(uid,sub,q)=>({uid,item:uid,descricao:'Painel ficticio '+uid,qtde:String(q),subtotal:String(sub)});
const lancada=dia=>({finalizadaEm:dia+'T21:00:00.000Z',finalizadoPor:'Gestor ficticio',entregaLancada:{data:dia,em:dia+'T21:00:00.000Z',por:'Gestor ficticio'},horaRetorno:'18:00',retornoEm:dia+'T18:00:00'});
const base=(id,numero,valor,equipe,extra={})=>({id,numero,rev:1,tipo:'externo',cliente:'Cliente ficticio',valorTotal:valor,equipe,veiculo:'Carro ficticio',itens:[it('a',valor,1)],...extra});
const aloc=(lider,outro)=>D.montar([{equipeId:null,liderId:lider,membros:outro?[lider,outro]:[lider]}]);
const FIXAS=[ficha('t','Titular Ficticio','titular-ficticio','700001'),ficha('j','Jose Ficticio','jose','100002')];

/* Ajustado (item 7): a apuração que o fechamento sela guarda o ID como está
   gravado (o mês fechado recalcula igual quando o RH grava o ID anterior
   depois); o ID de hoje entra na comissão (teste seguinte) e no ranking. */
test('P1/dinheiro: a divisão confirmada gravada com o ID anterior: a apuração guarda o ID gravado, o ranking dos funcionários soma no de hoje', async()=>{
  // A instaladora tinha 100001; o RH trocou para 100011 e guardou o anterior.
  const I=ficha('i','Instaladora Ficticia','inst','100011',{idPessoaAnteriores:['100001']});
  const A=base('A','91001',10000,['100001','100002'],{...lancada('2026-11-05'),alocacao:aloc('100001','100002')});
  const B=base('B','91002',10000,['100011','100002'],{...lancada('2026-11-06'),alocacao:aloc('100011','100002')});
  const e=await edge('pcp-sync',{pcp_registros:[A,B].map(o=>({colecao:'os',id:o.id,apagado:false,atualizado_em:'2026-11-01T10:00:00.000Z',registro:o})),
    registros:[...FIXAS,I],pcp_config_global:[{id:true,atualizado_em:'2020-01-01',config:{performancePCP:{equipes:[],participacoes:[]}}}],
    painel_ordens:[],equipe_contas:[{sistema:'pcp',usuario:'titular-ficticio',papel:'pcp',ativo:true}]});
  relogio(e,'2026-12-02T12:00:00Z');
  const f=await e.call({action:'performancePeriodo',...NOV,notaPorValor:true},TITULAR);
  assert.equal(f.status,200,JSON.stringify(f).slice(0,300));
  const ch=id=>f.registros.filter(r=>(r.osId||r.id)===id).flatMap(r=>(r.membros||[]).map(m=>m.chave)).sort();
  assert.deepEqual(ch('A'),['100001','100002'],'a apuração guarda o ID gravado na divisão');
  const rk=await e.call({action:'performanceRankingEquipe',...NOV},{papel:'montagem',sub:'inst',nome:'Instaladora Ficticia',exp:EXP});
  assert.equal(rk.status,200);
  assert.equal(rk.equipes.length,1,'a mesma dupla (ID anterior e ID de hoje) é uma composição só: '+JSON.stringify(rk.equipes.map(x=>x.nome)));
  assert.equal(rk.equipes[0].entregas,2);
});

test('P1/dinheiro: a prévia da comissão com a divisão do ID anterior', async()=>{
  const I=ficha('i','Instaladora Ficticia','inst','100011',{idPessoaAnteriores:['100001']});
  const A=base('A','91001',10000,['100001','100002'],{...lancada('2026-11-05'),alocacao:aloc('100001','100002')});
  const B=base('B','91002',10000,['100011','100002'],{...lancada('2026-11-06'),alocacao:aloc('100011','100002')});
  const e=await edge('pcp-sync',{pcp_registros:[A,B].map(o=>({colecao:'os',id:o.id,apagado:false,atualizado_em:'2026-11-01T10:00:00.000Z',registro:o})),
    registros:[...FIXAS,I],pcp_config_global:[{id:true,atualizado_em:'2020-01-01',config:{performancePCP:{equipes:[],participacoes:[]}}}],
    painel_ordens:[],equipe_contas:[{sistema:'pcp',usuario:'titular-ficticio',papel:'pcp',ativo:true}]});
  relogio(e,'2026-12-02T12:00:00Z');
  const fonte=await e.call({action:'performancePeriodo',...NOV,notaPorValor:true},TITULAR);
  const fr=await e.call({action:'performanceFechar',...NOV,hash:fonte.hash,anterior:'',requestId:'fechar-0001-ficticio',motivo:'Fechamento ficticio do mes',leGrupos:true,leEntregasItens:true,notaPorValor:true},TITULAR);
  assert.equal(fr.status,200,JSON.stringify(fr).slice(0,300));
  const selo=fr.fechamento;
  const doc={origem:'Vistoria ficticia',evidencia:'Foto ficticia 001 do servico',justificativa:'Conferido pela gestao ficticia'};
  const ent={config:{modo:'efetivo',inicioEfetivo:'2026-11-01',decisaoGestao:'Autorizacao ficticia do inicio efetivo',criteriosExtras:'somente_falha_comprovada'},
    decisoes:Object.fromEntries(selo.registros.map(r=>[r.osId||r.id,{...doc,decisao:'sem_falha',tipo:'nenhuma'}])),
    entregas:Object.fromEntries(selo.registros.map(r=>{const ms=(r.membros||[]).map(m=>m.chave);return [r.id,{...doc,entregue:true,grupos:[{montadorId:ms[0]}],interna:{...doc,situacao:'nao_aplicavel'}}];}))};
  const p=await e.call({action:'performanceComissaoNova',...NOV,fechamentoId:selo.id,anterior:'',entrada:ent,motivo:'Previa ficticia',requestId:'previa-0001-ficticio'},TITULAR);
  assert.equal(p.status,200,JSON.stringify(p).slice(0,400));
  const ap=p.revisao.apuracao;
  const x=await e.call({action:'performanceComissaoAprovar',...NOV,anterior:p.revisao.id,hash:p.revisao.hash,confirmacao:true,motivo:'Aprovacao ficticia',requestId:'aprovar-0001-ficticio'},{papel:'admin',sub:'adm',nome:'Adm',exp:EXP});
  const ex=await e.call({action:'performanceComissaoExportar',...NOV,id:x.revisao?.id},{papel:'admin',sub:'adm',nome:'Adm',exp:EXP});
  assert.ok(!ap.pessoas.some(x=>x.pessoaId==='100001'),'a mesma pessoa aparece em duas linhas de pagamento');
  assert.deepEqual(ap.pessoas.filter(x=>x.pessoaId==='100011').map(x=>x.centavos),[12000],'uma linha só, com as duas O.S.');
  assert.equal(x.status,200,JSON.stringify(x).slice(0,300));assert.equal(ex.status,200);
  assert.ok(!ex.csv.includes('100001'),'o CSV paga pelo ID de hoje');
  // O selo gravado não foi reescrito.
  assert.ok(e.db.pcp_registros.find(r=>r.colecao==='performance_fechamentos').registro.registros.some(r=>(r.membros||[]).some(m=>m.chave==='100001')));
});

test('P1/mês fechado: o RH grava o ID anterior depois do fechamento; o selo recalcula igual?', async()=>{
  const C=require('../conferencia-entrega.js');
  const I0=ficha('i','Instaladora Ficticia','inst','100001');
  const PART=['A','B'].map(id=>({id,membros:[{chave:'100001',nome:'I',percentual:60},{chave:'100002',nome:'J',percentual:40}],por:'Gestor',em:'2026-11-25T10:00:00Z'}));
  const A=base('A','91001',10000,['100001','100002'],lancada('2026-11-05'));
  const B=base('B','91002',10000,['100001','100002'],lancada('2026-11-06'));
  const P=base('P','91003',10000,['100001','100002'],{itens:[it('a',6000,2),it('b',4000,1)],saidaEm:'2026-11-12T08:00:00',retornoEm:'2026-11-12T18:00:00',horaRetorno:'18:00'});
  const e=await edge('pcp-sync',{pcp_registros:[A,B,P].map(o=>({colecao:'os',id:o.id,apagado:false,atualizado_em:'2026-11-01T10:00:00.000Z',registro:o})),
    registros:[...FIXAS,I0],pcp_config_global:[{id:true,atualizado_em:'2020-01-01',config:{performancePCP:{equipes:[],participacoes:PART}}}],
    painel_ordens:[],equipe_contas:[{sistema:'pcp',usuario:'titular-ficticio',papel:'pcp',ativo:true}]});
  relogio(e,'2026-11-12T20:00:00Z');
  const o=e.db.pcp_registros.find(r=>r.id==='P').registro;const sel=(n,q)=>{const i=C.catalogo(o)[n];return {chave:i.chave,identidade:i.identidade,qtde:q};};
  const cf=await e.call({action:'conferenciaEntrega',osId:'P',rev:o.rev,entrega:{id:'p-nov',dia:'2026-11-12',itens:[sel(0,1),sel(1,1)],alocacao:aloc('100001','100002')}},TITULAR);
  assert.equal(cf.status,200,JSON.stringify(cf).slice(0,300));
  relogio(e,'2026-12-02T12:00:00Z');
  const fonte=await e.call({action:'performancePeriodo',...NOV,notaPorValor:true},TITULAR);
  const fr=await e.call({action:'performanceFechar',...NOV,hash:fonte.hash,anterior:'',requestId:'fechar-0002-ficticio',motivo:'Fechamento ficticio do mes',leGrupos:true,leEntregasItens:true,notaPorValor:true},TITULAR);
  assert.equal(fr.status,200,JSON.stringify(fr).slice(0,300));
  const selo=fr.fechamento;
  const r=e.db.registros.find(x=>x.id==='i');r.registro={...r.registro,cpf:cpf('100011123'),idPessoa:'100011',idPessoaAnteriores:['100001']};
  relogio(e,'2026-12-03T12:00:00Z');
  const s=JSON.stringify(selo);
  const rc=await e.run(`perfFonte(perfParametrosDoSelo(${s},${JSON.stringify(NOV)}),perfOpcoesDoSelo(${s}))`);
  const ver=(regs,id)=>JSON.stringify(regs.filter(x=>(x.osId||x.id)===id).map(x=>({m:(x.membros||[]).map(m=>m.chave),viagem:x.viagem,volta:x.volta,vd:x.voltaDaEntrega})));
  for(const id of ['A','B','P'])console.log(id,'selo',ver(selo.registros,id),'agora',ver(rc.registros,id));
  const c=await e.run(`perfConferirSeloDaComissao(${s},${JSON.stringify(NOV)})`);
  assert.equal(rc.hash,selo.hash,'o mês fechado recalcula diferente depois do ID anterior');
});

test('P1/pessoas: vínculo salvo (vinculosRH) com o ID anterior não leva ao ID de hoje', ()=>{
  const r=O.resolverPessoas({pessoas:[{id:'100011',nome:'Instaladora Ficticia',apelido:'inst',anteriores:['100001']}],vinculos:[{apelido:'Ninha',id:'100001'}]});
  assert.equal(r.idDe('100001'),'100011');
  assert.equal(r.idDe('Ninha'),'100011','o nome com vínculo salvo no ID anterior ficou no ID anterior');
});

test('operação grava a marca conferenciaSoGestao no registro (campo que só o servidor deveria pôr na saída)', async()=>{
  const A=base('A','91001',10000,['100002']);
  const e=await edge('pcp-sync',{pcp_registros:[{colecao:'os',id:'A',apagado:false,atualizado_em:'2026-11-01T10:00:00.000Z',registro:A}],
    registros:[...FIXAS],pcp_config_global:[{id:true,atualizado_em:'2020-01-01',config:{}}],painel_ordens:[],
    equipe_contas:[{sistema:'pcp',usuario:'op',papel:'operacao',ativo:true}]});
  const r=await e.call({action:'upsert',os:{...structuredClone(A),conferenciaSoGestao:true,observacao:'x'}},{papel:'operacao',sub:'op',nome:'Operacao',exp:EXP});
  assert.equal(r.status,200,JSON.stringify(r).slice(0,300));
  assert.equal(e.db.pcp_registros.find(x=>x.id==='A').registro.conferenciaSoGestao,undefined,'a marca ficou gravada');
});

test('P1/pessoas: o crachá de toque cujo nome tem o vínculo salvo no ID anterior abre as próprias O.S. (servidor)', async()=>{
  const I=await import('../supabase/functions/_shared/pcp-integridade.mjs');
  const dados={pessoas:[{id:'100011',nome:'Instaladora Ficticia',apelido:'inst',anteriores:['100001']}],vinculos:[{apelido:'Ninha',id:'100001'}]};
  const r=I.resolverPessoas(dados);
  assert.equal(r.idDe('Ninha'),'100011');
  assert.equal(I.idDoCracha({nome:'Ninha'},r),'100011');
  assert.equal(I.pertenceEquipe({equipe:['100011']},{nome:'Ninha'},r),true);
  assert.equal(I.pertenceEquipe({equipe:['100001']},{nome:'Ninha'},r),true);
});
