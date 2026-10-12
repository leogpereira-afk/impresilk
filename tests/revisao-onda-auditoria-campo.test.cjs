'use strict';
/* AS PROVAS DA REVISÃO "CAMPO" DA ONDA AUDITORIA (12/10/2026), trazidas para a
   suíte com as afirmações no lugar dos registros na tela. Dados fictícios. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {edge}=require('./helpers/edge.cjs');
const diaSP=ms=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date(ms));
const HOJE=diaSP(Date.now());
const ficha=(id,nome,apelido,cpf)=>({colecao:'colaboradores',id,apagado:false,registro:{id,nome,apelido,cpf}});
const agoraISO=()=>new Date().toISOString();
const itens=[{uid:'u1',item:'1',descricao:'Placa ficticia',qtde:'2',valorUnit:'500',subtotal:'1000'}];
const base=()=>({id:'1',rev:1,numero:'8101',tipo:'externo',cliente:'Cliente Ficticio',equipe:['100001','100002'],liberadoPCP:true,
  confirmacao:'Confirmado',confEm:agoraISO(),instalacao:{data:HOJE,periodo:'Manhã'},valorTotal:'1000',itens,
  alocacao:{grupos:[{equipeId:null,cota:10000,liderId:'100001',membros:[{pessoaId:'100001',papel:'lider',cota:10000}]}],por:'Gestor',em:agoraISO()},
  conferenciasEntrega:[{id:'c1',dia:HOJE,itens:[{chave:'uid:u1',identidade:'x',qtde:1}],por:'Gestor',em:agoraISO()}]});
const banco=()=>({pcp_registros:[{id:'1',colecao:'os',apagado:false,atualizado_em:'2026-09-19T10:00:00Z',registro:base()}],
  registros:[ficha('a','Ana Ficticia','ana','10000111111'),ficha('b','Bruno Ficticio','bruno','10000222222'),ficha('o','Olga Ficticia','olga','10000333333'),ficha('g','Gestor Teste','gestor','11122233344')],
  equipe_contas:[{sistema:'pcp',usuario:'bruno'},{sistema:'pcp',usuario:'olga'}],
  pcp_config_global:[{id:true,config:{instaladores:['Ana','Bruno'],performancePCP:{equipes:[],participacoes:[]}},atualizado_em:'2026-09-19T10:00:00Z'}]});
const reg=e=>e.db.pcp_registros.find(r=>r.colecao==='os'&&r.id==='1').registro;
const gestor={papel:'pcp',nome:'Gestor Teste',sub:'gestor'};

for (const quem of [{nome:'Bruno',sub:'bruno',id:'100002',papel:'montagem'},{nome:'Olga',sub:'olga',papel:'operacao'}]) {
  test(`revisão campo (${quem.papel}): a cópia podada volta pela fila sem apagar divisão nem conferência, e a marca conferenciaSoGestao não vira dado`,async()=>{
    const e=await edge('pcp-sync',banco());
    const c=structuredClone((await e.call({action:'list',escopo:'abertas'},quem)).os.find(o=>o.id==='1'));
    assert.equal(c.conferenciaSoGestao,true,'a marca desce');
    assert.ok(!('alocacao' in c)&&!('conferenciasEntrega' in c),'divisão e conferência não descem');
    const r=await e.call({action:'upsert',os:{...c,obs:'nota do campo',atualizadoEm:agoraISO()}},quem);
    assert.equal(r.status,200,JSON.stringify(r));
    const f=reg(e);
    assert.ok(f.alocacao&&f.conferenciasEntrega&&f.conferenciasEntrega.length===1,'divisão e conferência preservadas');
    assert.ok(!('conferenciaSoGestao' in f),'a marca não fica gravada');
  });
}

test('revisão campo: a marca ecoada não fica no banco; anulada a única conferência, ninguém recebe a marca',async()=>{
  const e=await edge('pcp-sync',banco());
  const quem={nome:'Bruno',sub:'bruno',id:'100002',papel:'montagem'};
  const c=structuredClone((await e.call({action:'list',escopo:'abertas'},quem)).os.find(o=>o.id==='1'));
  await e.call({action:'upsert',os:{...c,obs:'nota',atualizadoEm:agoraISO()}},quem);
  const g=reg(e);
  const r=await e.call({action:'conferenciaEntrega',osId:'1',rev:g.rev,entrega:{id:'c1',dia:HOJE,itens:[]},revisao:{acao:'anular',motivo:'Conferencia lancada na O.S. errada por engano'}},gestor);
  assert.equal(r.status,200,JSON.stringify(r).slice(0,300));
  assert.ok(!('conferenciaSoGestao' in reg(e)));
  const lg=(await e.call({action:'list',escopo:'abertas'},gestor)).os.find(o=>o.id==='1');
  const lm=(await e.call({action:'list',escopo:'abertas'},quem)).os.find(o=>o.id==='1');
  assert.ok(!('conferenciaSoGestao' in lg),'a gestão nunca recebe a marca');
  assert.ok(!('conferenciaSoGestao' in lm),'sem conferência, sem marca');
});

test('revisão campo: a marca antiga gravada por engano não desce para a gestão, e a tela da gestão a ignora',async()=>{
  const b=banco();b.pcp_registros[0].registro.conferenciaSoGestao=true;
  const e=await edge('pcp-sync',b);
  assert.ok(!('conferenciaSoGestao' in (await e.call({action:'list',escopo:'abertas'},gestor)).os.find(o=>o.id==='1')));
  const src=fs.readFileSync(path.join(__dirname,'..','app.js'),'utf8');
  const i=src.indexOf('function statusEntregaDe(os)'),j=src.indexOf('const podeCancelarOS');
  const ctx=vm.createContext({esc:s=>String(s??''),temStatusEntrega:()=>true,contextoStatusDe:()=>({}),CONFERENCIA_ENTREGA:{estado:()=>({situacao:'total'})},podeVerValores:()=>true,
    OPERACAO:{statusEntrega:()=>({estado:'no_prazo',rotulo:'No prazo',motivo:'no prazo',aplicaveis:[]})}});
  vm.runInContext(src.slice(i,j),ctx);
  assert.ok(!ctx.statusEntregaDe({conferenciaSoGestao:true}).conferenciaSoGestao,'a gestão não obedece a marca');
  ctx.podeVerValores=()=>false;
  assert.equal(ctx.statusEntregaDe({conferenciaSoGestao:true}).conferenciaSoGestao,true);
});

test('revisão (item 4): um percentual só para o valor, o do mês, com o nome certo', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'performance.js'), 'utf8');
  // Caso ruim: a caixa dizia "14% do valor" (com as baixas no denominador) e "fora da conta"; o detalhe e o "Valor do período" diziam 39%.
  assert.doesNotMatch(src, /, fora da conta`/);
  assert.doesNotMatch(src, /perfPctTxt\(v, k\.valor\.total\)} do valor/);
  assert.doesNotMatch(src, /em entregas confirmadas \(\$\{perfPctTxt/);
  assert.match(src, /% do valor do mês<\/strong> no ranking/);
  assert.match(src, /só \$\{m\.pct\}% do valor do mês está no ranking/);
});

/* Item 10 (C3 legado): a saída antiga gravada fora do formato, que o envio não
   mexeu, contava contra o retorno novo e dava 400 definitivo: o envio inteiro
   (as notas do dia) saía da fila. Agora ela conta como ausente, com aviso; o
   resto grava e o dado antigo não se apaga. A troca para outra data inválida
   continua não gravando. */
for (const quem of [{nome:'Bruno',sub:'bruno',id:'100002',papel:'montagem'},gestor]) {
  test(`revisão campo (C3 legado, ${quem.papel}): a saída antiga inválida não derruba o retorno novo nem a nota`,async()=>{
    const b=banco();b.pcp_registros[0].registro.saidaEm=HOJE+' 08:00';
    const e=await edge('pcp-sync',b);
    const c=structuredClone((await e.call({action:'list',escopo:'abertas'},quem)).os.find(o=>o.id==='1'));
    const r=await e.call({action:'upsert',os:{...c,horaRetorno:'17:00',retornoEm:HOJE+'T17:00:00',obs:'trabalho do dia',atualizadoEm:agoraISO()}},quem);
    assert.equal(r.status,200,JSON.stringify({error:r.error,definitivo:r.definitivo}));
    const f=reg(e);
    assert.equal(f.obs,'trabalho do dia');
    assert.equal(f.retornoEm,HOJE+'T17:00:00');
    assert.equal(f.saidaEm,HOJE+' 08:00','o dado antigo não se apaga');
    assert.ok((r.avisos||[]).some(a=>/^A saída gravada antes está fora do formato e não foi conferida/.test(a)),JSON.stringify(r.avisos));
    const r2=await e.call({action:'upsert',os:{...structuredClone(reg(e)),saidaEm:'ontem',obs:'outra nota',atualizadoEm:agoraISO()}},quem);
    assert.equal(r2.status,200,JSON.stringify(r2).slice(0,300));
    assert.equal(reg(e).saidaEm,HOJE+' 08:00','a data inválida nova não é gravada');
    assert.equal(reg(e).obs,'outra nota');
  });
}

/* Item 12 (B3): o resumo "Detalhe da cobertura" (e os outros .perf-method da
   Performance) tinha 34 px (39 px quando quebra em duas linhas no celular),
   abaixo da régua de 40 px de controle da casa. Medido no navegador pela
   prévia: 40 px no computador e no celular depois da correção. */
test('revisão (item 12): o resumo dos quadros .perf-method da Performance tem 40 px de controle', () => {
  const css=fs.readFileSync(path.join(__dirname,'..','performance-layout.css'),'utf8');
  const regra=css.match(/#panel-performance \.perf-method>summary\{([^}]*)\}/);
  assert.ok(regra,'a regra do resumo existe');
  assert.match(regra[1],/min-height:40px/);
  assert.match(regra[1],/box-sizing:border-box/);
  assert.ok(!/#panel-performance \.perf-method>summary\{[^}]*min-height:3\dpx/.test(css),'nenhuma regra volta a 3x px');
  assert.match(fs.readFileSync(path.join(__dirname,'..','performance.js'),'utf8'),/<details class="perf-method perf-cob-detalhe"><summary>Detalhe da cobertura/,'o detalhe da cobertura usa a regra');
});
