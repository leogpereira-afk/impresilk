'use strict';
/* M20, M21, M29 e a linha Baixa "O.S. excluída pode voltar numa restauração
   feita só pelo Hub" (auditoria do PCP v164, 11/10/2026).
   O backup do Hub lia o PCP pelo `list`, que entrega só O.S. vivas: ficavam de
   fora as lápides, o diário, os horários das fotos, as Demandas e, assim que
   existirem, o selo do mês, as regras e a comissão aprovada. A porta nova
   `exportarBackup` é só de leitura, só da máquina (o x-token do backup) e
   entrega TODAS as linhas de pcp_registros, a tabela pcp_demandas e a
   configuração, paginada por um cursor estável, com a contagem por coleção.
   Servidor real (helpers/edge.cjs) e dados fictícios. Cada teste começa pelo
   caso ruim. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {edge}=require('./helpers/edge.cjs');

const linha=(colecao,id,registro={},apagado=false)=>({colecao,id,apagado,atualizado_em:'2026-10-0'+(1+id.length%8)+'T10:00:00Z',registro:{id,...registro}});
function banco(){
  const r=[];
  for(let i=1;i<=5;i++)r.push(linha('os','os-viva-'+i,{numero:'Q'+i,cliente:'Cliente fictício '+i}));
  r.push(linha('os','os-lapide-1',{numero:'L1',cliente:'Cliente fictício excluído'},true));
  r.push(linha('os','os-lapide-2',{numero:'L2',cliente:'Cliente fictício excluído'},true));
  for(let i=1;i<=4;i++)r.push(linha('auditoria','aud-'+i,{osId:'os-viva-1',acao:'editar',campos:['cliente']}));
  r.push(linha('foto_evento','foto_1_1700000000000_a',{recebidoEm:'2026-10-01T10:00:00Z'}));
  r.push(linha('foto_evento','foto_1_1700000000001_b',{recebidoEm:'2026-10-01T10:01:00Z'}));
  r.push(linha('performance_fechamentos','fech-1',{de:'2026-11-01',ate:'2026-11-30',hash:'h'.repeat(64)}));
  r.push(linha('performance_regras','v000001',{versao:1,vigenciaInicio:'2026-11-01'}));
  r.push(linha('performance_comissao','com-1',{tipo:'previa',hash:'a'.repeat(64)}));
  r.push(linha('performance_comissao','com-2',{tipo:'aprovacao',hash:'b'.repeat(64)}));
  r.push(linha('performance_comissao_os_versoes','cov-1',{osId:'os-viva-2'}));
  // Coleção que ainda não existe hoje: a porta não pode depender de lista escrita à mão.
  r.push(linha('zz_colecao_futura','zz-1',{exemplo:true}));
  return {
    pcp_registros:r,
    pcp_demandas:[1,2,3].map(i=>({id:'dem-'+i,registro:{id:'dem-'+i,titulo:'Demanda fictícia '+i},revision:i,mutation_id:'mut-'+i,atualizado_em:'2026-10-08T10:00:00Z'})),
    pcp_config_global:[{id:true,atualizado_em:'2026-10-01T00:00:00Z',config:{instaladores:['Ana'],performancePCP:{equipes:[{id:'eq1',nome:'Equipe fictícia'}]},usuarios:[{usuario:'ficticio'}]}}],
    equipe_contas:[{sistema:'pcp',usuario:'montador'}],
  };
}

async function exportarTudo(e,limite){
  const paginas=[];let cursor=null;
  for(let i=0;i<200;i++){
    const r=await e.call({action:'exportarBackup',...(cursor?{cursor}:{}),...(limite?{limite}:{})});
    assert.equal(r.status,200,JSON.stringify(r));
    paginas.push(r);
    cursor=r.nextCursor;
    if(cursor==null)return paginas;
  }
  throw new Error('cursor não terminou');
}

test('M20: a porta de exportação é só da máquina; crachá de pessoa, de toque e sem credencial são recusados',async()=>{
  const e=await edge('pcp-sync',banco());
  for(const quem of [{papel:'admin'},{papel:'pcp'},{papel:'montagem',sub:'montador',nome:'Montador'},{papel:'montagem',montagemIndividual:true,nome:'Ana'},{papel:'operacao'},{papel:'comercial'}]){
    const r=await e.call({action:'exportarBackup'},quem);
    assert.equal(r.status,403,JSON.stringify(quem)+' '+JSON.stringify(r));
    assert.equal(r.registros,undefined);assert.equal(r.cfg,undefined);
  }
  assert.equal((await e.call({action:'exportarBackup'},null)).status,401);
  // Só leitura: nada foi gravado no banco pela porta.
  assert.equal(e.db.pcp_registros.length,banco().pcp_registros.length);
});

test('M20/M21/M29: entrega todas as coleções, lápides, demandas e configuração, sem perder nem repetir linha em nenhum tamanho de página',async()=>{
  const base=banco();
  const chave=r=>r.colecao+'\u0000'+r.id;
  for(const limite of [1,2,3,4,5,7,11,500,undefined]){
    const e=await edge('pcp-sync',banco());
    const paginas=await exportarTudo(e,limite);
    const registros=paginas.flatMap(p=>p.registros||[]),demandas=paginas.flatMap(p=>p.demandas||[]);
    const rotulo='limite '+limite;
    for(const p of paginas)if(limite)assert.ok((p.registros||[]).length+(p.demandas||[]).length<=limite,rotulo+': página maior que o pedido');
    // Nenhuma linha repetida e nenhuma faltando, com o apagado de cada uma.
    assert.equal(new Set(registros.map(chave)).size,registros.length,rotulo+': linha repetida');
    assert.deepEqual(registros.map(chave).sort(),base.pcp_registros.map(chave).sort(),rotulo);
    for(const r of base.pcp_registros){
      const x=registros.find(y=>chave(y)===chave(r));
      assert.equal(x.apagado,r.apagado,rotulo+' '+r.id);assert.deepEqual(x.registro,r.registro);assert.equal(x.atualizado_em,r.atualizado_em);
    }
    assert.equal(registros.filter(r=>r.colecao==='os'&&r.apagado).length,2,rotulo+': as lápides vão junto');
    assert.deepEqual(demandas.map(d=>d.id).sort(),['dem-1','dem-2','dem-3'],rotulo);
    assert.equal(demandas.find(d=>d.id==='dem-2').revision,2);assert.equal(demandas.find(d=>d.id==='dem-2').mutation_id,'mut-2');
    // A configuração inteira (a máquina recebe tudo, como no getCfg) vai na primeira página.
    assert.deepEqual(paginas[0].cfg,base.pcp_config_global[0].config,rotulo);
    assert.equal(paginas[0].cfgVersao,'2026-10-01T00:00:00Z');
    // A contagem por coleção: no começo e no fim da exportação.
    const ini=paginas[0].contagemInicio,fim=paginas.at(-1).contagemFim;
    assert.ok(ini&&fim,rotulo+': falta a contagem');
    for(const c of [ini,fim]){
      assert.deepEqual(c.pcp_registros.os,{total:7,apagados:2});
      assert.deepEqual(c.pcp_registros.auditoria,{total:4,apagados:0});
      assert.deepEqual(c.pcp_registros.foto_evento,{total:2,apagados:0});
      assert.deepEqual(c.pcp_registros.performance_comissao,{total:2,apagados:0});
      assert.deepEqual(c.pcp_registros.zz_colecao_futura,{total:1,apagados:0});
      assert.equal(c.pcp_demandas,3);
    }
    if(paginas.length>1){assert.equal(paginas[0].contagemFim,undefined);assert.equal(paginas.at(-1).contagemInicio,undefined);}
  }
});

test('M21: as coleções conhecidas aparecem na contagem mesmo vazias (o Hub confere que nenhuma sumiu da porta)',async()=>{
  const e=await edge('pcp-sync',{pcp_registros:[linha('os','os-1',{numero:'1'})]});
  const [p]=await exportarTudo(e);
  for(const c of ['os','auditoria','foto_evento','performance_fechamentos','performance_regras','performance_comissao','performance_comissao_os_versoes'])
    assert.ok(p.contagemInicio.pcp_registros[c],'falta '+c);
  assert.deepEqual(p.contagemInicio.pcp_registros.performance_fechamentos,{total:0,apagados:0});
  assert.equal(p.contagemInicio.pcp_demandas,0);
  assert.equal(p.registros.length,1);assert.deepEqual(p.demandas,[]);
});

test('M20: cursor adulterado é recusado (400), e linha nova no meio da exportação não faz pular nem repetir',async()=>{
  const e=await edge('pcp-sync',banco());
  for(const cursor of ['nao-e-json','["x","os","a"]','["r","","a"]','["r","os"]',JSON.stringify({c:'os'}),'["d","x","a"]'])
    assert.equal((await e.call({action:'exportarBackup',cursor})).status,400,cursor);
  // Uma O.S. criada depois que a exportação passou por ela (id menor) fica para a
  // próxima rodada; a contagem do fim acusa a diferença sem repetir ninguém.
  const p1=await e.call({action:'exportarBackup',limite:3});
  e.db.pcp_registros.push(linha('os','os-aaa-nova',{numero:'N1'}));
  const resto=[];let cursor=p1.nextCursor;
  while(cursor){const r=await e.call({action:'exportarBackup',cursor,limite:3});resto.push(r);cursor=r.nextCursor;}
  const todos=[p1,...resto].flatMap(p=>p.registros||[]);
  assert.equal(new Set(todos.map(r=>r.colecao+':'+r.id)).size,todos.length,'linha repetida');
  assert.equal(p1.contagemInicio.pcp_registros.os.total,7);
  assert.equal(resto.at(-1).contagemFim.pcp_registros.os.total,8);
});

test('M20: o list da máquina continua igual (só O.S. vivas): a porta nova não muda o app',async()=>{
  const e=await edge('pcp-sync',banco());
  const r=await e.call({action:'list'});
  assert.equal(r.status,200);
  assert.deepEqual(r.os.map(o=>o.id).sort(),['os-viva-1','os-viva-2','os-viva-3','os-viva-4','os-viva-5']);
});
