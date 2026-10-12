'use strict';
/* A ONDA "FECHAMENTO" DO PCP (fila única de 11/10/2026), no SERVIDOR real
   (helpers/edge.cjs, banco em memória). Cada teste começa pelo caso ruim, o
   que a v166 deixava passar. Dados fictícios: nenhuma pessoa, O.S. ou valor
   real.
   - item 3: o Fechar é só de mês calendário, depois do fim do mês e sem
     sobrepor outro período fechado; o selo antigo de período livre continua
     legível;
   - item 2: a cobertura do valor entra no Fechar, com a frase escrita abaixo
     de 50%;
   - item 4: a O.S. cancelada depois de ter parte conferida conta pela parte
     entregue, no ranking e na comissão; o cancelado não é saldo;
   - M7: conferir entrega com o dia (novo ou antigo) em mês fechado é recusado;
   - item 14: a base que muda durante a consulta é 409, e não 500;
   - verificação da v166: o ranking dos funcionários lê só o período e só os
     campos da comissão, e sem as decisões sai com aviso, sem cair. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {edge}=require('./helpers/edge.cjs');
const C=require('../conferencia-entrega.js');
const D=require('../divisao.js');

// O crachá vale até depois do relógio fictício do servidor.
const EXP=Math.floor(Date.parse('2027-12-31T00:00:00Z')/1000);
const gestor={papel:'pcp',nome:'Gestor fictício',sub:'gestor',exp:EXP};
const montagem={papel:'montagem',nome:'Montador fictício',sub:'montador',exp:EXP};
const relogio=(e,iso)=>e.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date);
  globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [${JSON.stringify(iso)}])); } static now() { return +new R(${JSON.stringify(iso)}); } }; }`);
const fechados=e=>e.db.pcp_registros.filter(r=>r.colecao==='performance_fechamentos');

// O.S. fictícias com a participação antiga confirmada (a régua mais simples de fechar).
function banco(oss,extra={}){
  const participacoes=oss.filter(o=>o.participa!==false).map(o=>({id:o.id,membros:[{chave:'100001',nome:'Pessoa fictícia',percentual:100}],por:'Gestor',em:'2026-09-01'}));
  return {
    pcp_registros:oss.map(o=>({colecao:'os',id:o.id,apagado:false,atualizado_em:o._atualizado||'2020-01-01',registro:(({participa,_atualizado,...r})=>r)(o)})),
    registros:[{id:'p1',colecao:'colaboradores',apagado:false,registro:{nome:'Pessoa fictícia',cpf:'10000111111'}},{id:'p2',colecao:'colaboradores',apagado:false,registro:{nome:'Outra pessoa fictícia',cpf:'10000222222'}}],
    pcp_config_global:[{id:true,atualizado_em:'2020-01-01',config:{performancePCP:{equipes:[],participacoes}}}],
    painel_ordens:[],...extra};
}
const os=(id,finalizadaEm,valorTotal,extra={})=>({id,numero:'9'+id.replace(/\D/g,'').padStart(4,'0'),tipo:'externo',cliente:'Cliente fictício',finalizadaEm,entregaLancada:{data:finalizadaEm.slice(0,10)},equipe:['100001'],valorTotal,...extra});
async function fechar(e,periodo,corpo={}){
  const fonte=await e.call({action:'performancePeriodo',...periodo,notaPorValor:true},gestor);
  const hist=await e.call({action:'performanceFechamentos',...periodo},gestor);
  return e.call({action:'performanceFechar',...periodo,hash:fonte.hash,anterior:hist.fechamentos?.[0]?.id||'',requestId:'fechar-'+periodo.de+'-'+Math.random().toString(36).slice(2,10),motivo:'Fechamento fictício',leGrupos:true,leEntregasItens:true,notaPorValor:true,...corpo},gestor);
}
const NOV={de:'2026-11-01',ate:'2026-11-30'};

/* ------------------------------------------------------------ item 3 */
test('item 3: período livre não fecha (antes gravava três selos que se cruzavam); o mês inteiro fecha', async()=>{
  const e=await edge('pcp-sync',banco([os('a1','2026-11-10T15:00:00Z',1000)]));
  relogio(e,'2026-12-02T12:00:00Z');
  for(const p of [{de:'2026-11-01',ate:'2026-11-19'},{de:'2026-11-10',ate:'2026-11-30'},{de:'2026-11-15',ate:'2026-11-15'},{de:'2026-10-15',ate:'2026-11-14'}]){
    const r=await fechar(e,p);
    assert.equal(r.status,422,JSON.stringify(p));assert.match(r.error,/só de mês inteiro/);assert.equal(r.mesInteiro,true);
  }
  assert.equal(fechados(e).length,0,'nada foi gravado');
  const ok=await fechar(e,NOV);
  assert.equal(ok.status,200,JSON.stringify(ok));assert.equal(ok.fechamento.de,'2026-11-01');assert.equal(ok.fechamento.ate,'2026-11-30');
  // Uma revisão nova do MESMO mês continua valendo.
  const rev2=await fechar(e,NOV);
  assert.equal(rev2.status,200,JSON.stringify(rev2));assert.equal(rev2.fechamento.revisao,2);
});

test('item 3: o mês só fecha depois do último dia, no relógio de São Paulo', async()=>{
  const e=await edge('pcp-sync',banco([os('a1','2026-11-10T15:00:00Z',1000)]));
  // 30/11 às 23h em São Paulo ainda é novembro (02h UTC de 01/12).
  for(const agora of ['2026-11-20T12:00:00Z','2026-11-30T15:00:00Z','2026-12-01T02:00:00Z']){
    relogio(e,agora);
    const r=await fechar(e,NOV);
    assert.equal(r.status,422,agora);assert.match(r.error,/O mês ainda não terminou: novembro de 2026 pode ser fechado a partir de 01\/12\/2026/);
  }
  assert.equal(fechados(e).length,0);
  relogio(e,'2026-12-01T03:30:00Z');
  assert.equal((await fechar(e,NOV)).status,200);
});

test('item 3: não sobrepõe período já fechado; o selo antigo de período livre continua legível e não ganha revisão', async()=>{
  // Um selo de período livre gravado antes desta versão (em produção havia 0; aqui é fictício).
  const antigo={id:'2026-10-20:2026-11-10:000001',de:'2026-10-20',ate:'2026-11-10',revisao:1,anterior:null,registros:[],hash:'hash-ficticio',fechadoEm:'2026-11-11T10:00:00Z',fechadoPor:'Gestor fictício',motivo:'Selo antigo'};
  const e=await edge('pcp-sync',banco([os('a1','2026-11-20T15:00:00Z',1000)],{}));
  e.db.pcp_registros.push({colecao:'performance_fechamentos',id:antigo.id,apagado:false,atualizado_em:antigo.fechadoEm,registro:antigo});
  relogio(e,'2026-12-02T12:00:00Z');
  const r=await fechar(e,NOV);
  assert.equal(r.status,409,JSON.stringify(r));assert.match(r.error,/se sobrepõe a um período já fechado \(20\/10\/2026 a 10\/11\/2026\)/);
  assert.equal(fechados(e).length,1,'nada foi gravado');
  const lido=await e.call({action:'performanceFechamentos',de:'2026-10-20',ate:'2026-11-10'},gestor);
  assert.equal(lido.status??200,200);assert.equal(lido.fechamentos.length,1);assert.equal(lido.fechamentos[0].hash,'hash-ficticio');
  const nova=await e.call({action:'performanceFechar',de:'2026-10-20',ate:'2026-11-10',hash:'x',anterior:antigo.id,requestId:'revisao-antiga-0001',motivo:'Revisão do período livre'},gestor);
  assert.equal(nova.status,422);assert.match(nova.error,/só de mês inteiro/);
  // Os períodos fechados, para a tela (aviso do mês sem fechamento, M7 e M8).
  const lista=await e.call({action:'performanceFechados'},gestor);
  assert.deepEqual(lista.fechados.map(f=>[f.de,f.ate,f.revisoes,f.ultimaRevisao]),[['2026-10-20','2026-11-10',1,1]]);
  assert.equal(lista.hoje,'2026-12-02');
  for(const who of [montagem,{...montagem,papel:'operacao'},{...montagem,papel:'comercial'}])assert.equal((await e.call({action:'performanceFechados'},who)).status,403);
});

/* ------------------------------------------------------------ item 2 */
test('item 2: abaixo de 50% do valor na base, o Fechar pede a frase escrita; o selo guarda a cobertura', async()=>{
  // a1 lançada (na base, R$ 300); b1 e b2 são baixas do ERP a lançar (fora, R$ 700 e sem valor).
  const baixa=(id,valor)=>({...os(id,'2026-11-12T15:00:00Z',valor),entregaLancada:undefined,finalizadoPor:'Mubisys (baixa automática · ENTREGUE)',baixaAutoERP:{em:'2026-11-12T15:00:00Z',status:'ENTREGUE'},participa:false});
  const e=await edge('pcp-sync',banco([os('a1','2026-11-10T15:00:00Z',300),baixa('b1',700),baixa('b2',null)]));
  relogio(e,'2026-12-02T12:00:00Z');
  const p=await e.call({action:'performancePeriodo',...NOV,notaPorValor:true},gestor);
  assert.equal(p.registros.length,1);
  assert.deepEqual({...p.cobertura,aLancarNumeros:[...p.cobertura.aLancarNumeros]},{entregas:1,entregasCentavos:30000,entregasSemValor:0,aLancar:2,aLancarCentavos:70000,aLancarSemValor:1,aLancarNumeros:['90001','90002'],pctValor:30,baixa:true});
  const sem=await fechar(e,NOV);
  assert.equal(sem.status,422);assert.equal(sem.coberturaBaixa,true);assert.match(sem.error,/Só 30% do valor do mês está na base: 2 baixas do ERP a lançar ficam de fora/);
  assert.equal(fechados(e).length,0);
  const errada=await fechar(e,NOV,{confirmaCobertura:'fechar'});assert.equal(errada.status,422);
  const ok=await fechar(e,NOV,{confirmaCobertura:'  Fechar com   cobertura baixa '});
  assert.equal(ok.status,200,JSON.stringify(ok));
  assert.equal(ok.fechamento.coberturaBaixaConfirmada,'fechar com cobertura baixa');
  assert.equal(ok.fechamento.cobertura.pctValor,30);
  // A cobertura fica fora do hash: o selo continua conferindo pelo conteúdo.
  const atual=await e.call({action:'performancePeriodo',...NOV,notaPorValor:true},gestor);
  assert.equal(atual.hash,ok.fechamento.hash);
});
test('item 2: com 50% ou mais do valor na base, fecha sem a frase', async()=>{
  const baixa={...os('b1','2026-11-12T15:00:00Z',500),entregaLancada:undefined,finalizadoPor:'Mubisys (baixa automática · ENTREGUE)',baixaAutoERP:{em:'2026-11-12T15:00:00Z',status:'ENTREGUE'},participa:false};
  const e=await edge('pcp-sync',banco([os('a1','2026-11-10T15:00:00Z',500),baixa]));
  relogio(e,'2026-12-02T12:00:00Z');
  const r=await fechar(e,NOV);
  assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.fechamento.cobertura.pctValor,50);assert.equal(r.fechamento.cobertura.baixa,false);
  assert.equal(r.fechamento.coberturaBaixaConfirmada,undefined);
});

/* ------------------------------------------------------------ item 4 */
const osItens=()=>({id:'c1',numero:'90101',rev:1,tipo:'externo',cliente:'Cliente fictício',valorTotal:8500,equipe:['100001'],itens:[{uid:'a',item:'1',descricao:'Painel fictício A',qtde:'4',subtotal:'5000'},{uid:'b',item:'2',descricao:'Painel fictício B',qtde:'1',subtotal:'5000'}]});
const sel=(o,n,qtde)=>{const i=C.catalogo(o)[n];return {chave:i.chave,identidade:i.identidade,qtde};};
const conf=(o,id,dia,itens,pessoa='100001')=>({id,dia,itens,alocacao:D.montar([{equipeId:null,liderId:pessoa,membros:[pessoa]}])});
async function conferir(e,o,entrega,rev){const r=await e.call({action:'conferenciaEntrega',osId:o.id,rev,entrega},gestor);await new Promise(ok=>setTimeout(ok,3));return r;}
const SET={de:'2026-09-01',ate:'2026-09-30'};

test('item 4: a O.S. cancelada depois de ter parte conferida conta pela parte entregue no período, no ranking e na comissão', async()=>{
  const o=osItens();
  const e=await edge('pcp-sync',banco([{...o,participa:false}],{painel_ordens:[{numero:o.numero,valor:8500}]}));
  const r=await conferir(e,o,conf(o,'e1','2026-09-25',[sel(o,0,2)]),1);
  assert.equal(r.status,200,JSON.stringify(r));
  // O cancelamento chega depois (à mão, pela gestão): ele cancela o SALDO.
  const row=e.db.pcp_registros.find(x=>x.colecao==='os'&&x.id==='c1');
  row.registro={...row.registro,cancelamento:{ativo:true,motivo:'Cliente desistiu do serviço fictício',por:'Gestor fictício',porId:'111222',em:'2026-09-27T10:00:00Z'}};
  const p=await e.call({action:'performancePeriodo',...SET,notaPorValor:true},gestor);
  assert.equal(p.registros.length,1,'a parte conferida continua na base (antes saía inteira: R$ 21,25 de comissão viravam 0)');
  assert.equal(p.registros[0].valor,2125);assert.equal(p.registros[0].confirmado,true);
  assert.equal(p.registros[0].estadoEntrega.situacao,'saldo_cancelado');assert.equal(p.registros[0].estadoEntrega.saldo,0);
  const rk=await e.call({action:'performanceRankingEquipe',...SET},montagem);
  assert.equal(rk.status,200);assert.equal(rk.resumo.entregasConfirmadas,1);assert.equal(rk.resumo.equivalentes,0.25);
  // A comissão parte do selo: a linha da parte entregue está lá, com 1% do líquido entregue (D-001).
  const f=await fechar(e,SET);assert.equal(f.status,200,JSON.stringify(f));
  const nova=await e.call({action:'performanceComissaoNova',...SET,fechamentoId:f.fechamento.id,anterior:'',entrada:{},motivo:'Prévia fictícia',requestId:'previa-cancelada-0001'},gestor);
  assert.equal(nova.status,200,JSON.stringify(nova));
  const linha=nova.revisao.apuracao.linhas.find(l=>l.osId==='c1');
  assert.ok(linha,'a linha da parte entregue entra na prévia');assert.equal(linha.baseLiquidaCentavos,212500);
  // Conferir de novo depois do cancelamento continua recusado (D-009).
  const depois=await conferir(e,o,conf(o,'e2','2026-09-26',[sel(o,1,1)]),row.registro.rev);
  assert.equal(depois.status,422);
});
test('item 4: a cancelada sem nada conferido continua fora da base', async()=>{
  const e=await edge('pcp-sync',banco([os('x1','2026-09-10T15:00:00Z',1000,{cancelamento:{ativo:true,motivo:'Cliente desistiu do serviço fictício',por:'Gestor',em:'2026-09-11T10:00:00Z'}})]));
  const p=await e.call({action:'performancePeriodo',...SET},gestor);
  assert.equal(p.registros.length,0);
});
test('item 4 e Baixa "saldo do cancelado": o cancelado não é saldo a conferir, nas duas cópias do motor', async()=>{
  const {CONFERENCIA_ENTREGA:S}=await import('../supabase/functions/_shared/pcp-conferencia-entrega.mjs');
  for(const M of [C,S]){
    const o=osItens();o.conferenciasEntrega=[conf(o,'e1','2026-09-25',[sel(o,0,2)])];
    // Sem cancelamento: igual a antes, sem campo novo (o hash do período não muda).
    const vivo=M.estado(o,8500);
    assert.equal(vivo.saldo,637500);assert.equal(vivo.situacao,'parcial');assert.equal('cancelado' in vivo,false);assert.equal(vivo.conferidoValor,212500);
    // O.S. cancelada: o resto não é saldo; o valor cancelado vai à parte.
    const canc={...o,cancelamento:{ativo:true,motivo:'Cliente desistiu do serviço fictício'}};
    const e1=M.estado(canc,8500);
    assert.equal(e1.saldo,0);assert.equal(e1.cancelado,637500);assert.equal(e1.canceladoUnidades,3);assert.equal(e1.saldoItens.length,0);
    assert.equal(e1.conferidoValor,212500);assert.equal(e1.situacao,'saldo_cancelado');assert.equal(e1.divergencia,false);
    assert.match(e1.resumo,/Parte entregue conferida, saldo cancelado · 2 unidades conferidas · 3 canceladas/);
    // Cancelada no ERP (baixa automática com CANCELADO): o mesmo.
    const erp={...o,finalizadaEm:'2026-09-28T12:00:00Z',finalizadoPor:'Mubisys (baixa automática · CANCELADO)',baixaAutoERP:{em:'2026-09-28T12:00:00Z',status:'CANCELADO'}};
    assert.equal(M.estado(erp,8500).situacao,'saldo_cancelado');
    // Item cancelado (marca do item) com a O.S. viva: o valor dele sai do saldo.
    const item=JSON.parse(JSON.stringify(o));item.itens[1].entregas=[{id:'m1',tipo:'cancelado',qtde:1,dia:'2026-09-26',motivo:'Item cancelado fictício',via:'gestao',por:'Gestor',porId:'111222',em:'2026-09-26T12:00:00Z'}];
    const a=M.apurar(item,8500);
    assert.equal(a.erro,'');assert.equal(a.saldo,212500);assert.equal(a.cancelado,425000);assert.equal(a.saldoItens.length,1);
  }
});

/* ---------------------------------------------------------------- M7 */
test('M7: conferir com o dia (novo ou antigo) em mês fechado é recusado; mês aberto passa', async()=>{
  const o=osItens();
  const e=await edge('pcp-sync',banco([{...o,participa:false}],{painel_ordens:[{numero:o.numero,valor:8500}]}));
  assert.equal((await conferir(e,o,conf(o,'e1','2026-09-25',[sel(o,0,2)]),1)).status,200);
  const f=await fechar(e,SET);assert.equal(f.status,200,JSON.stringify(f));
  const row=()=>e.db.pcp_registros.find(x=>x.colecao==='os'&&x.id==='c1');
  // O diálogo recebe os períodos fechados ao abrir.
  const abrir=await e.call({action:'conferenciaEntrega',osId:'c1'},gestor);
  assert.deepEqual(abrir.fechados.map(x=>[x.de,x.ate]),[['2026-09-01','2026-09-30']]);
  // Conferência nova com o dia em setembro (fechado): recusada, nada gravado.
  const nova=await conferir(e,o,conf(o,'e2','2026-09-26',[sel(o,1,1)]),row().registro.rev);
  assert.equal(nova.status,409);assert.match(nova.error,/O dia 26\/09\/2026 cai num período já fechado \(01\/09\/2026 a 30\/09\/2026, revisão 1\)/);
  // Levar a parcial do mês fechado para outubro (aberto) contaria a unidade duas vezes: recusado.
  const mover=conf(o,'e1','2026-10-05',[sel(o,0,2)]);mover.alocacao.em=row().registro.conferenciasEntrega[0].alocacao.em;
  const r=await conferir(e,o,mover,row().registro.rev);
  assert.equal(r.status,409);assert.match(r.error,/foi conferida em 25\/09\/2026, num período já fechado/);
  assert.equal(row().registro.conferenciasEntrega.length,1);assert.equal(row().registro.conferenciasEntrega[0].dia,'2026-09-25');
  // Outubro não está fechado: a conferência nova passa.
  const ok=await conferir(e,o,conf(o,'e3','2026-10-05',[sel(o,1,1)]),row().registro.rev);
  assert.equal(ok.status,200,JSON.stringify(ok));
});

/* ------------------------------------------------------------ item 14 */
test('item 14: a base que muda durante a consulta responde 409 "tente de novo", e não 500', async()=>{
  // Uma O.S. gravada durante a leitura (atualizado_em depois do início da consulta).
  const e=await edge('pcp-sync',banco([os('a1','2026-09-10T15:00:00Z',1000),{...os('a2','2026-09-11T15:00:00Z',1000),_atualizado:'2999-01-01T00:00:00Z'}]));
  const p=await e.call({action:'performancePeriodo',...SET},gestor);
  assert.equal(p.status,409);assert.equal(p.tenteDeNovo,true);assert.match(p.error,/A base mudou durante a consulta/);
  const f=await e.call({action:'performanceFechar',...SET,hash:'x',anterior:'',requestId:'fechar-base-mudou-01',motivo:'Fechamento fictício',leGrupos:true,leEntregasItens:true},gestor);
  assert.equal(f.status,409);assert.equal(fechados(e).length,0);
});

/* ------------------------------------------ verificação da v166 (baixa) */
test('ranking dos funcionários: a comissão é lida só no período e só com os campos da régua; sem ela, sai com aviso', async()=>{
  const e=await edge('pcp-sync',banco([os('a1','2026-09-10T15:00:00Z',1000)]));
  const revisao=(id,de,ate,extra)=>({colecao:'performance_comissao',id,apagado:false,atualizado_em:'2026-10-02T10:00:00Z',registro:{id,de,ate,revisao:1,tipo:'previa',em:'2026-10-02T10:00:00Z',entrada:{decisoes:{a1:{tipo:'atraso',evidencia:'Evidência fictícia longa'}},entregas:{a1:{evidencia:'x'.repeat(5000)}}},apuracao:{compensacaoDe:null,linhas:[{osId:'a1',decisao:'falha_comprovada',pendencias:[],pagamentos:[]}]},...extra}});
  e.db.pcp_registros.push(revisao('2026-09-01:2026-09-30:000001','2026-09-01','2026-09-30'));
  e.db.pcp_registros.push(revisao('2026-08-01:2026-08-31:000001','2026-08-01','2026-08-31',{csv:'y'.repeat(5000)}));
  const orig=e.cliente.from.bind(e.cliente),vistos=[];let falhar=false;
  e.cliente.from=t=>{
    const q=orig(t);if(t!=='pcp_registros')return q;
    const reg={select:'',filtros:[]};vistos.push(reg);
    for(const m of ['select','eq','lte','gte','gt']){const f=q[m];q[m]=(...a)=>{if(m==='select')reg.select=String(a[0]);else reg.filtros.push([m,...a]);return f.apply(q,a);};}
    const then=q.then;q.then=(ok,erro)=>reg.filtros.some(x=>x[1]==='colecao'&&x[2]==='performance_comissao')&&falhar?ok({data:null,error:{message:'Banco indisponível'}}):then.call(q,ok,erro);
    return q;
  };
  const r=await e.call({action:'performanceRankingEquipe',...SET},montagem);
  assert.equal(r.status,200);assert.equal(r.resumo.falhaComprovada,1,'a falha comprovada do demonstrativo continua valendo com os campos projetados');
  const com=vistos.filter(v=>v.filtros.some(x=>x[1]==='colecao'&&x[2]==='performance_comissao'));
  assert.equal(com.length>0,true);
  for(const v of com){
    const cols=v.select.split(',').map(c=>c.trim());
    assert.ok(!cols.includes('registro'),'não lê o registro inteiro: '+v.select);
    assert.ok(cols.some(c=>/registro->apuracao->linhas$/.test(c)));
    assert.deepEqual(v.filtros.filter(x=>x[0]==='lte'||x[0]==='gte'),[['lte','registro->>de','2026-09-30'],['gte','registro->>ate','2026-09-01']]);
  }
  // Sem as decisões (a leitura falha), o ranking não cai: sai sem elas e com o aviso, e não fica no cache.
  const e2=await edge('pcp-sync',banco([os('a1','2026-09-10T15:00:00Z',1000)]));
  e2.db.pcp_registros.push(revisao('2026-09-01:2026-09-30:000001','2026-09-01','2026-09-30'));
  const orig2=e2.cliente.from.bind(e2.cliente);let quebra=true;
  e2.cliente.from=t=>{const q=orig2(t);if(t!=='pcp_registros')return q;let comissao=false;const eq=q.eq;q.eq=(k,v)=>{if(k==='colecao'&&v==='performance_comissao')comissao=true;return eq.call(q,k,v);};const then=q.then;q.then=(ok,erro)=>comissao&&quebra?ok({data:null,error:{message:'Banco indisponível'}}):then.call(q,ok,erro);return q;};
  const semDecisao=await e2.call({action:'performanceRankingEquipe',...SET},montagem);
  assert.equal(semDecisao.status,200);assert.match(semDecisao.avisoDecisoes,/Não foi possível ler as decisões/);
  assert.equal(semDecisao.resumo.falhaComprovada,undefined);
  quebra=false;
  const depois=await e2.call({action:'performanceRankingEquipe',...SET},montagem);
  assert.equal(depois.avisoDecisoes,undefined,'a resposta com aviso não ficou no cache');assert.equal(depois.resumo.falhaComprovada,1);
  assert.equal(falhar,false);
});
