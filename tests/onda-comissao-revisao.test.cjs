'use strict';
/* REVISÃO DA ONDA COMISSÃO (12/10/2026): as ressalvas das duas revisões
   ("com dinheiro" e "com uso"), uma por teste, cada uma começando pelo caso
   ruim. O servidor real (pcp-sync) com banco falso e a tela (performance.js,
   comissao.js e comissao-ui.js) em vm. Dados fictícios. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const RAIZ=path.join(__dirname,'..');
const ler=f=>fs.readFileSync(path.join(RAIZ,f),'utf8');
const C=require('../comissao.js');
const {edge}=require('./helpers/edge.cjs');

/* ------------------------------------------------- o servidor real, fictício */
const EXP=Math.floor(Date.parse('2027-12-31T00:00:00Z')/1000);
const gestor={papel:'pcp',nome:'Gestor fictício',sub:'gestor',id:'044455',exp:EXP};
const doc={origem:'Vistoria PCP',evidencia:'Foto e aceite fictícios 001',justificativa:'Conferido pela gestão fictícia'};
const NOV={de:'2026-11-01',ate:'2026-11-30'};
const relogio=(e,iso)=>e.run(`{ const R = globalThis.__DataReal || (globalThis.__DataReal = Date);
  globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [${JSON.stringify(iso)}])); } static now() { return +new R(${JSON.stringify(iso)}); } }; }`);
const membros=[{chave:'100001',nome:'Pessoa 1',percentual:60},{chave:'100002',nome:'Pessoa 2',percentual:40}];
const osF=id=>({colecao:'os',id,apagado:false,atualizado_em:'2020-01-01',registro:{id,numero:'9'+id.replace(/\D/g,'').padStart(4,'0'),tipo:'externo',cliente:'Cliente fictício',finalizadaEm:'2026-11-10T15:00:00Z',finalizadoPor:'Gestor fictício',equipe:['100001','100002'],veiculo:'Carro fictício',valorTotal:120000}});
async function servidor(){
  const oss=[osF('os1')];
  const e=await edge('pcp-sync',{pcp_registros:oss,
    registros:[1,2].map(i=>({colecao:'colaboradores',id:'p'+i,apagado:false,registro:{id:'p'+i,nome:'Pessoa '+i,cpf:'10000'+i+'12345'}})),
    pcp_config_global:[{id:true,atualizado_em:'2020-01-01',config:{performancePCP:{equipes:[],participacoes:oss.map(o=>({id:o.id,membros,por:'Gestor',em:'2026-11-10'}))}}}],painel_ordens:[]});
  relogio(e,'2026-12-02T12:00:00Z');return e;
}
async function fechar(e){
  const f=await e.call({action:'performancePeriodo',...NOV,notaPorValor:true},gestor);
  const r=await e.call({action:'performanceFechar',...NOV,hash:f.hash,anterior:'',requestId:'fechar-revisao-0001',motivo:'Fechamento fictício',leGrupos:true,leEntregasItens:true,notaPorValor:true},gestor);
  assert.equal(r.ok,true,JSON.stringify(r));return r.fechamento;
}
const entrada=(f,modo)=>({config:modo==='efetivo'?{modo,inicioEfetivo:'2026-11-01',decisaoGestao:'Autorização fictícia',criteriosExtras:'somente_falha_comprovada'}:{modo,criteriosExtras:'somente_falha_comprovada'},
  decisoes:Object.fromEntries(f.registros.map(r=>[r.osId||r.id,{...doc,decisao:'sem_falha',tipo:'nenhuma'}])),
  entregas:Object.fromEntries(f.registros.map(r=>[r.id,{...doc,entregue:true,grupos:[{montadorId:'100001'}],interna:{...doc,situacao:'nao_aplicavel'}}]))});
async function aprovada(e,f,modo='efetivo'){
  const p=await e.call({action:'performanceComissaoNova',...NOV,fechamentoId:f.id,anterior:'',entrada:entrada(f,modo),motivo:'Prévia fictícia',requestId:'previa-revisao-0001'},gestor);assert.equal(p.ok,true,JSON.stringify(p));
  const a=await e.call({action:'performanceComissaoAprovar',...NOV,anterior:p.revisao.id,hash:p.revisao.hash,motivo:'Aprovação fictícia',confirmacao:true,requestId:'aprovar-revisao-0001'},gestor);assert.equal(a.status,200,JSON.stringify(a));
  return a.revisao;
}
const docsDe=e=>e.db.pcp_registros.filter(r=>r.colecao==='performance_documentos');

/* ------------------------------------------------------------------ achado 1 */
test('revisão comissão: do documento 1001 em diante o PDF oficial continua numerando (o último id do ano + 1) e o pedido repetido é achado no banco',async()=>{
  const e=await servidor();const f=await fechar(e);
  // O caso ruim: 1001 documentos de 2026 já emitidos (a leitura antiga parava em 1000 e repetia o número).
  for(let i=1;i<=1001;i++){const id='DOC-2026-'+String(i).padStart(6,'0');
    e.db.pcp_registros.push({colecao:'performance_documentos',id,apagado:false,atualizado_em:'2026-12-01',registro:{id,tipo:'fechamento',...NOV,fechamentoId:f.id,requestId:'antigo-documento-'+String(i).padStart(4,'0')}});}
  // E um de outro ano, com número maior, que não conta para 2026.
  e.db.pcp_registros.push({colecao:'performance_documentos',id:'DOC-2025-999990',apagado:false,atualizado_em:'2025-12-01',registro:{id:'DOC-2025-999990',tipo:'fechamento',requestId:'outro-ano-000001'}});
  const r1=await e.call({action:'performanceDocumento',...NOV,tipo:'fechamento',fechamentoId:f.id,requestId:'doc-revisao-novo-01'},gestor);
  assert.equal(r1.status,200,JSON.stringify(r1));assert.equal(r1.documento.id,'DOC-2026-001002');
  const r2=await e.call({action:'performanceDocumento',...NOV,tipo:'fechamento',fechamentoId:f.id,requestId:'doc-revisao-novo-02'},gestor);
  assert.equal(r2.status,200,JSON.stringify(r2));assert.equal(r2.documento.id,'DOC-2026-001003');
  assert.ok(r2.documento.emitidosAntes>=1000,'conta os documentos do mesmo fechamento pela contagem do banco');
  // O pedido repetido de um documento além da milésima linha devolve o mesmo, sem gravar outro.
  const antes=docsDe(e).length;
  const rep=await e.call({action:'performanceDocumento',...NOV,tipo:'fechamento',fechamentoId:f.id,requestId:'antigo-documento-1001'},gestor);
  assert.equal(rep.status,200,JSON.stringify(rep));assert.equal(rep.repetido,true);assert.equal(rep.documento.id,'DOC-2026-001001');
  assert.equal(docsDe(e).length,antes);
  // O primeiro do ano sai como 000001.
  const e2=await servidor();const f2=await fechar(e2);
  const p=await e2.call({action:'performanceDocumento',...NOV,tipo:'fechamento',fechamentoId:f2.id,requestId:'doc-revisao-prim-01'},gestor);
  assert.equal(p.documento.id,'DOC-2026-000001');assert.equal(p.documento.emitidosAntes,0);
  // O código não lê mais a coleção inteira com .limit(1000).
  assert.doesNotMatch(ler('supabase/functions/pcp-sync/index.ts'),/eq\("colecao","performance_documentos"\)\.order\("id"\)\.limit\(1000\)/);
});

/* ------------------------------------------------------------------ achado 2 */
test('revisão comissão: o mesmo requestId com outro pedido é 409, e não o documento antigo calado',async()=>{
  const e=await servidor();const f=await fechar(e);const a=await aprovada(e,f);
  const d1=await e.call({action:'performanceDocumento',...NOV,tipo:'fechamento',fechamentoId:f.id,requestId:'doc-revisao-mesmo-1'},gestor);
  assert.equal(d1.status,200);
  // O caso ruim: outro tipo de documento com o mesmo requestId.
  const d2=await e.call({action:'performanceDocumento',...NOV,tipo:'comissao',fechamentoId:f.id,revisaoId:a.id,requestId:'doc-revisao-mesmo-1'},gestor);
  assert.equal(d2.status,409,JSON.stringify(d2));assert.equal(d2.documento,undefined);
  assert.match(d2.error,/Este pedido já emitiu o documento DOC-2026-000001 de outro conteúdo/);
  // O mesmo pedido de novo (a resposta se perdeu): o mesmo documento, sem gravar outro.
  const d3=await e.call({action:'performanceDocumento',...NOV,tipo:'fechamento',fechamentoId:f.id,requestId:'doc-revisao-mesmo-1'},gestor);
  assert.equal(d3.status,200);assert.equal(d3.repetido,true);assert.equal(d3.documento.id,d1.documento.id);
  assert.equal(docsDe(e).length,1);
  // O da comissão também: mesmo requestId, outra revisão ou outro tipo, 409.
  const c1=await e.call({action:'performanceDocumento',...NOV,tipo:'comissao',fechamentoId:f.id,revisaoId:a.id,requestId:'doc-revisao-comis-1'},gestor);
  assert.equal(c1.status,200);
  const c2=await e.call({action:'performanceDocumento',...NOV,tipo:'fechamento',fechamentoId:f.id,requestId:'doc-revisao-comis-1'},gestor);
  assert.equal(c2.status,409);
});

/* ------------------------------------------------------------- a tela, em vm */
const esc=s=>String(s??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
function tela({papel='pcp',api=null}={}){
  const chamadas=[],toasts=[];
  const c={console,setTimeout,clearTimeout,chamadas,toasts,
    STORE:{getCFG:()=>({performancePCP:{equipes:[],participacoes:[]}}),getAllOS:()=>[],getQueue:()=>[],getOS:()=>null,uuid:()=>'req-ficticio-0001',
      api:async corpo=>{chamadas.push(corpo);return api?api(corpo):{};}},
    STATE:{user:{papel},_fPerf:{...NOV}},periodoOuMes:()=>({...c.STATE._fPerf}),classificarEntregas:xs=>({instalacoes:xs,aLancar:[]}),
    diaEntrega:()=>'2026-11-05',nomeExibicaoCasa:n=>({chave:n,nome:'Pessoa '+n}),pessoasRH:()=>[],avatarRH:()=>'',esc,
    dinheiroCasa:n=>'R$ '+Number(n).toFixed(2).replace('.',','),filtroPeriodoHTML:()=>'',normCasa:s=>String(s||'').toLowerCase(),
    renderPerformanceCasa:()=>{c.renders=(c.renders||0)+1;},toast:(m,t)=>toasts.push([m,t||'']),perfCasaTemAbaConferencia:()=>true,crypto:{randomUUID:()=>'req-ficticio-0002'}};
  vm.createContext(c);
  for(const f of ['operacao.js','divisao.js','comissao.js','performance.js','comissao-ui.js'])vm.runInContext(ler(f),c,{filename:f});
  c.perfHojeISO=()=>'2026-12-11';
  c.run=code=>vm.runInContext(code,c);
  return c;
}
const H_REV='dc9208837bcd817e0d236e9dbb2e82a5a7b4308f87859f536e09bc74a8771275';
const H_FECH='13735e25bbe701170a2387b9c122efac4dcea4930eef998f87cd310d157bd327';
const linha={id:'OS-FICTICIA',numero:'TESTE-120MIL',dia:'2026-11-01',entregaId:'',origemValor:'O.S. do PCP',baseLiquidaCentavos:12000000,descontoCentavos:500000,desconto:'Diferença entre subtotal bruto e líquido (já deduzida)',
  decisao:'sem_falha',pontos:1,pendencias:[],comissaoCentavos:120000,internaCentavos:24000,externaCentavos:96000,
  pagamentos:[{pessoaId:'900001',nome:'Pessoa fictícia A',tipo:'externa',cota:6000,centavos:57600},{pessoaId:'900002',nome:'Pessoa fictícia B',tipo:'externa',cota:4000,centavos:38400},{pessoaId:'900009',nome:'Pessoa fictícia C',tipo:'interna',cota:10000,centavos:24000}]};
const revisao=(extra={})=>({id:'2026-11-01:2026-11-30:000004',revisao:4,tipo:'aprovacao',em:'2026-12-03T12:00:00Z',motivo:'Aprovação fictícia',autor:{login:'gestor',nome:'Gestor fictício',porId:'044455'},fechamentoId:'fechamento-ficticio-nov',hash:H_REV,
  apuracao:{config:{modo:'efetivo'},totalCentavos:120000,pendencias:[],linhas:[linha],
    pessoas:[{pessoaId:'900001',tipo:'externa',centavos:57600},{pessoaId:'900002',tipo:'externa',centavos:38400},{pessoaId:'900009',tipo:'interna',centavos:24000}],
    ajustes:[{pessoaId:'900001',tipo:'externa',centavos:57600,anteriorCentavos:0,diferencaCentavos:57600},{pessoaId:'900002',tipo:'externa',centavos:38400,anteriorCentavos:0,diferencaCentavos:38400},{pessoaId:'900009',tipo:'interna',centavos:24000,anteriorCentavos:0,diferencaCentavos:24000}],
    reconhecimento:{situacao:'pendente',aviso:'Aviso fictício',criterios:{},equipes:[]}},...extra});
const documento={id:'DOC-2026-000009',fechamentoId:'fechamento-ficticio-nov',fechamentoRevisao:1,fechamentoHash:H_FECH,revisaoHash:H_REV,emitidoEm:'2026-12-05T12:00:00Z',emitidoPor:{nome:'Gestor fictício',porId:'044455'},emitidosAntes:0};
// O corpo visível do documento: tudo menos o rodapé técnico.
const semRodape=html=>html.replace(/<p class="perf-doc-rodape">[\s\S]*?<\/p>/g,'');

/* ------------------------------------------------------------------ achado 3 */
test('revisão comissão: no PDF do demonstrativo os valores e os títulos não se partem, e rateios e diferenças trazem o ID e o total por pessoa',()=>{
  const c=tela();c.__r=revisao();
  const html=c.run('comissaoResumoHTML(__r,[__r],[])');
  // O caso ruim: na impressão, a regra comum dos PDFs (th,td{white-space:normal!important;overflow-wrap:anywhere}) partia "R$ 120.000,|00" e "EXTERN|A".
  assert.match(ler('relatorios-pcp.js'),/th,td\{white-space:normal!important;[^}]*overflow-wrap:anywhere/,'a regra comum que partia os valores continua lá; a tabela da comissão a vence');
  const css=ler('styles.css');
  assert.match(css,/@media print\{#impressao-pcp \.comissao-tabela th\{overflow-wrap:normal!important;word-break:normal!important/);
  assert.match(css,/#impressao-pcp \.comissao-tabela td\.comissao-num,#impressao-pcp \.comissao-tabela th\.comissao-num\{white-space:nowrap!important;overflow-wrap:normal!important/);
  // Toda célula de valor da tabela é .comissao-num (nowrap), e os títulos de valor também.
  assert.match(html,/<th class="comissao-num">Base líquida<\/th><th class="comissao-num">Descontos<\/th>.*<th class="comissao-num">Externa<\/th>/s);
  assert.match(html,/<td class="comissao-num">R\$ 120000,00<\/td>/);
  assert.match(html,/<td class="comissao-num">R\$ 960,00<\/td><\/tr>/);
  // Rateios: o ID de 6 dígitos ao lado do nome.
  assert.match(html,/<h4>Rateios por pessoa e entrega<\/h4>.*<td>Pessoa fictícia A \(cadastro 900001\)<\/td><td>Equipe externa<\/td><td class="comissao-num">60%<\/td><td class="comissao-num">R\$ 576,00<\/td>/s);
  // O total por pessoa, com o total da revisão.
  assert.match(html,/<h4>Total por pessoa<\/h4>.*<td>Pessoa fictícia C \(cadastro 900009\)<\/td><td>Montagem interna<\/td><td class="comissao-num"><strong>R\$ 240,00<\/strong><\/td>/s);
  assert.match(html,/Total da revisão<\/th><th class="comissao-num">R\$ 1200,00<\/th>/);
  // Diferenças: o nome vem do rateio e o ID ao lado, com antes, agora e a diferença.
  assert.match(html,/<h4>Diferenças para conciliação<\/h4>.*<td>Pessoa fictícia B \(cadastro 900002\)<\/td><td>Equipe externa<\/td><td class="comissao-num">R\$ 0,00<\/td><td class="comissao-num">R\$ 384,00<\/td><td class="comissao-num"><strong>R\$ 384,00<\/strong><\/td>/s);
  assert.doesNotMatch(html,/<li>O\.S\. TESTE-120MIL/,'a lista antiga, sem ID, saiu');
});

/* ------------------------------------------------------------------ achado 4 */
test('revisão comissão: a recusa do PDF do demonstrativo mostra a mensagem do servidor; "precisa de conexão" só sem resposta',async()=>{
  let falha=null;const impressos=[];
  const c=tela({api:()=>{if(falha)throw falha;return {ok:true,documento};}});
  c.document={createElement:()=>({innerHTML:''})};
  c.imprimirAnalisePCP=(titulo,el)=>impressos.push({titulo,html:el.innerHTML});
  c.__r=revisao();
  // O caso ruim: o servidor recusou (403, 409, 422) e a tela dizia "precisa de conexão".
  falha=new Error('Documento oficial restrito à gestão autenticada do PCP.');
  await assert.rejects(c.run('comissaoPdf(__r,[__r],[],{de:"2026-11-01",ate:"2026-11-30"})'),e=>{assert.equal(e.message,'Documento oficial restrito à gestão autenticada do PCP.');return true;});
  // 409 volta com o corpo (STORE.api não lança): a mensagem dele também.
  falha=null;c.STORE.api=async()=>({error:'Esta revisão da comissão não é deste fechamento. Atualize o demonstrativo antes de emitir o documento.'});
  await assert.rejects(c.run('comissaoPdf(__r,[__r],[],{de:"2026-11-01",ate:"2026-11-30"})'),/não é deste fechamento/);
  // Sem resposta (rede): aí sim, precisa de conexão.
  c.STORE.api=async()=>{throw new TypeError('Failed to fetch');};
  await assert.rejects(c.run('comissaoPdf(__r,[__r],[],{de:"2026-11-01",ate:"2026-11-30"})'),/^Error: O PDF do demonstrativo precisa de conexão: o documento é registrado no servidor\. Sem conexão com o servidor/);
  assert.equal(impressos.length,0);
  // O PDF oficial do fechamento também: a recusa com a mensagem do servidor, sem "precisa de conexão".
  const t=tela({api:()=>{throw new Error('Este fechamento não existe neste período. Atualize a apuração antes de emitir o documento.');}});
  t.__h=[{id:'f1',de:NOV.de,ate:NOV.ate,revisao:1,fechadoEm:'2026-12-01T12:00:00Z',fechadoPor:'Gestor fictício',hash:H_FECH,registros:[],periodo:{...NOV}}];
  t.run('perfRemoto.chave=perfChave();perfRemoto.dados={periodo:{...STATE._fPerf},registros:[]};perfRemoto.fechamentos=__h;perfRemoto.selecionado="f1";perfRemoto.tentado=true;perfFechados.tentado=true;');
  await t.run('perfPdfOficial({querySelector:()=>null})');
  assert.equal(t.toasts.at(-1)[0],'Este fechamento não existe neste período. Atualize a apuração antes de emitir o documento.');
});

/* ------------------------------------------------------------------ achado 5 */
test('revisão comissão: exportar de novo a mesma aprovação (resposta perdida) não manda pagar zero; diz quando e por quem já foi exportada',async()=>{
  const c=tela();
  const primeira={id:'2026-11-01:2026-11-30:000001',revisaoId:'r4',revisao:4,em:'2026-12-04T12:00:00Z',csvSha256:'a'.repeat(64),autor:{nome:'Gestor fictício',porId:'044455'}};
  c.__ev={id:'2026-11-01:2026-11-30:000002',revisaoId:'r4',revisao:4,em:'2026-12-04T12:05:00Z',csvSha256:'a'.repeat(64),autor:{nome:'Gestor fictício',porId:'044455'},
    anterior:{id:primeira.id,revisaoId:'r4',revisao:4,em:primeira.em,csvSha256:primeira.csvSha256},anteriorNaoExportada:true,
    diferencas:[{pessoaId:'900001',nome:'Pessoa fictícia A',tipo:'externa',anteriorCentavos:57600,centavos:57600,diferencaCentavos:0}]};
  c.__x=[primeira];
  const html=c.run('comissaoDiferencasHTML(__ev,__x)');
  // O caso ruim: "pague pela diferença acima" sobre zeros.
  assert.doesNotMatch(html,/pague pela diferença/);
  assert.match(html,/Esta aprovação já foi exportada em 04\/12\/2026.* por Gestor fictício \(cadastro 044455\): confira se aquele CSV foi recebido; esta nova exportação não tem diferença a pagar\./);
  // Diferença de verdade (outra aprovação antes) continua mandando pagar pela diferença.
  c.__ev2={...c.__ev,revisaoId:'r5',anterior:{id:primeira.id,revisaoId:'r3',revisao:3,em:primeira.em},diferencas:[{pessoaId:'900001',nome:'Pessoa fictícia A',tipo:'externa',anteriorCentavos:100,centavos:150,diferencaCentavos:50}]};
  assert.match(c.run('comissaoDiferencasHTML(__ev2,__x)'),/pague pela diferença acima/);
  // No servidor: a segunda exportação da mesma aprovação aponta para a primeira (com quem exportou) e tem diferença zero.
  const e=await servidor();const f=await fechar(e);const a=await aprovada(e,f);
  const x1=await e.call({action:'performanceComissaoExportar',...NOV,id:a.id},gestor);assert.equal(x1.status,200,JSON.stringify(x1));
  const x2=await e.call({action:'performanceComissaoExportar',...NOV,id:a.id},gestor);assert.equal(x2.status,200,JSON.stringify(x2));
  assert.equal(x2.exportacao.anterior.revisaoId,a.id);assert.equal(x2.exportacao.anterior.autor.porId,'044455');
  assert.ok(x2.exportacao.diferencas.every(d=>d.diferencaCentavos===0));
  c.__ev3=x2.exportacao;c.__x3=[x1.exportacao];
  assert.match(c.run('comissaoDiferencasHTML(__ev3,__x3)'),/já foi exportada em .* por Gestor fictício \(cadastro 044455\): confira se aquele CSV foi recebido/);
});

/* ------------------------------------------------------------------ achado 6 */
test('revisão comissão: a impressão digital que o PDF pede para conferir aparece na tela, o mesmo trecho curto, sem o hash inteiro nem ids internos no corpo',()=>{
  const c=tela();c.__r=revisao();c.__d=documento;
  // O caso ruim: o PDF pedia para conferir o hash de 64 caracteres "(sha256)" e nenhuma tela o mostrava.
  const corpo=semRodape(c.run('comissaoDocHTML(__d,__r)'));
  assert.doesNotMatch(corpo,/sha256/);assert.doesNotMatch(corpo,new RegExp(H_REV));assert.doesNotMatch(corpo,new RegExp(H_FECH));
  assert.doesNotMatch(corpo,/2026-11-01:2026-11-30:000004|fechamento-ficticio-nov/,'sem ids internos no corpo');
  assert.match(corpo,/Impressão digital da revisão<\/dt><dd><code class="perf-digital">dc920883<\/code>/);
  assert.match(corpo,/impressão digital <code class="perf-digital">13735e25<\/code>/);
  // O completo fica no rodapé técnico, em letra pequena.
  assert.match(c.run('comissaoDocRodapeHTML(__d,__r)'),new RegExp('<p class="perf-doc-rodape">.*'+H_REV+'.*'+H_FECH));
  // A tela da comissão mostra o mesmo trecho.
  assert.match(c.run('comissaoResumoHTML(__r,[__r],[])'),/Impressão digital desta revisão: <code class="perf-digital">dc920883<\/code>/);
  assert.match(ler('comissao-ui.js'),/Fechamento operacional · revisão \$\{esc\(fonte\.revisao\)\}\$\{comissaoDigitalCurta\(fonte\.hash\)/,'o diálogo diz a do fechamento');
  // O fechamento: a tela ao lado do botão do PDF oficial e o PDF com o mesmo trecho.
  const s={id:'f1',de:NOV.de,ate:NOV.ate,revisao:1,fechadoEm:'2026-12-01T12:00:00Z',fechadoPor:'Gestor fictício',fechadoPorId:'044455',hash:H_FECH,registros:[],periodo:{...NOV},regra:'performance-3'};
  c.__h=[s];
  c.run('perfRemoto.chave=perfChave();perfRemoto.dados={periodo:{...STATE._fPerf},registros:[]};perfRemoto.fechamentos=__h;perfRemoto.selecionado="f1";perfRemoto.tentado=true;perfFechados.tentado=true;');
  c.podeEditar=()=>true;
  assert.match(c.run('perfFonteHTML()'),/id="perf-pdf-oficial">PDF oficial do fechamento<\/button> <small>Registra o documento no servidor, com o número e a impressão digital do fechamento: <code class="perf-digital">13735e25<\/code> \(a mesma do PDF\)\.<\/small>/);
  c.__s=s;c.__fd={...documento,id:'DOC-2026-000010'};
  const oficial=c.run('perfDocOficialHTML(__fd,__s)');
  assert.doesNotMatch(oficial,/sha256/);assert.doesNotMatch(oficial,new RegExp(H_FECH));assert.doesNotMatch(oficial,/ id f1/);
  assert.match(oficial,/Impressão digital do fechamento<\/dt><dd><code class="perf-digital">13735e25<\/code>/);
  assert.match(c.run('perfDocRodapeHTML(__fd,__s)'),new RegExp('fechamento f1, impressão digital '+H_FECH));
});

/* ------------------------------------------------------------------ achado 7 */
test('revisão comissão: depois de exportar, o trecho curto da impressão digital aparece uma vez, logo abaixo dos botões',()=>{
  const c=tela();
  const sha='b31932c2d34eb75cee512520db3a047aad2dc80de8fa13c323dead077ed4b396';
  c.__out={ok:true,arquivo:'comissao-2026-11-01-r4.csv',csvSha256:sha,aviso:'Exportação para conferência; não realiza pagamento. Impressão digital (sha256) do CSV: '+sha+'.',
    exportacao:{id:'e1',revisaoId:'r4',revisao:4,em:'2026-12-04T12:00:00Z',csvSha256:sha,autor:{nome:'Gestor fictício',porId:'044455'},anterior:null,diferencas:[{pessoaId:'900001',nome:'Pessoa fictícia A',tipo:'externa',anteriorCentavos:0,centavos:57600,diferencaCentavos:57600}]}};
  const html=c.run('comissaoExportadoHTML(__out,[])');
  // O caso ruim: o hash inteiro duas vezes (no aviso e no bloco).
  assert.doesNotMatch(html,new RegExp(sha));
  assert.equal(html.split('b31932c2').length-1,1,'o trecho curto uma vez só');
  assert.match(html,/CSV baixado: <b>comissao-2026-11-01-r4\.csv<\/b>/);
  assert.match(html,/<strong>Exportação registrada<\/strong>/);
  // O bloco mora logo abaixo dos botões, e o aviso do servidor (com o hash inteiro) não vai mais para a tela.
  const ui=ler('comissao-ui.js');
  assert.match(ui,/id="comissao-pdf">PDF do demonstrativo<\/button><\/p><div id="comissao-exportado" class="comissao-exportado" aria-live="polite" hidden><\/div><p role="alert" id="comissao-erro"><\/p>/);
  assert.doesNotMatch(ui,/erro\.textContent=out\.aviso/);
  // O histórico "Já exportada" do demonstrativo não repete o trecho do evento que está no quadro dos botões.
  c.__r=revisao({id:'r4'});c.__x=[c.__out.exportacao];
  const resumo=c.run('comissaoResumoHTML(__r,[__r],__x,{noBloco:"e1"})');
  assert.match(resumo,/Já exportada 1 vez:.*Gestor fictício \(cadastro 044455\) · esta, no quadro abaixo dos botões<\/li>/s);
  assert.doesNotMatch(resumo,/b31932c2/);
  assert.match(c.run('comissaoResumoHTML(__r,[__r],__x)'),/impressão digital do CSV <code class="perf-digital">b31932c2<\/code>/,'ao reabrir, o histórico mostra o trecho');
  assert.match(ui,/const caixa=conteudo\.querySelector\('#comissao-exportado'\);caixa\.innerHTML=comissaoExportadoHTML\(out,antes\);caixa\.hidden=false;/);
});

/* ------------------------------------------------------------------ achado 8 */
test('revisão comissão: a fita diz "falta montar a prévia" sem prévia, cada estado tem cor e marca, e o toque leva ao mês em Base e fechamento',()=>{
  const c=tela();c.podeEditar=()=>true;
  const mes=(m,estado,extra={})=>({mes:m,de:m+'-01',ate:m+'-28',estado,teste:m==='2026-10',fechamento:{revisao:2},comissao:null,enviado:null,...extra});
  // O caso ruim: mês fechado sem nenhuma prévia dizia "falta aprovar a comissão".
  assert.equal(c.run(`perfFitaEstadoTxt(${JSON.stringify(mes('2027-02','fechado'))})`),'Fechado (revisão 2): falta montar a prévia da comissão');
  assert.equal(c.run(`perfFitaEstadoTxt(${JSON.stringify(mes('2027-01','fechado',{comissao:{revisao:1,tipo:'previa',modo:'efetivo'}}))})`),'Fechado (revisão 2): falta aprovar a comissão');
  c.__l=[mes('2026-10','aprovado',{comissao:{tipo:'aprovacao',modo:'teste'}}),mes('2026-11','enviado',{comissao:{modo:'efetivo'},enviado:{vezes:1}}),mes('2026-12','aprovado',{comissao:{modo:'efetivo'}}),mes('2027-01','fechado'),mes('2027-02','aberto'),mes('2027-03','em_andamento')];
  c.run('perfMeses={tentado:true,carregando:false,lista:__l,erro:""}');
  const html=c.run('perfFitaMesesHTML()');
  const marcas=[...html.matchAll(/<li class="perf-fita-mes perf-fita-(\w+)( perf-fita-teste)?"><button[^>]*><b><span class="perf-fita-marca" aria-hidden="true">([^<]*)<\/span>/g)].map(m=>[m[1]+(m[2]?'+teste':''),m[3]]);
  assert.deepEqual(marcas,[['aprovado+teste','◌'],['enviado','✓'],['aprovado','◐'],['fechado','○'],['aberto','!'],['em_andamento','…']]);
  assert.equal(new Set(marcas.map(m=>m[1])).size,marcas.length,'cada estado com a sua marca');
  const css=ler('styles.css');
  for(const est of ['em_andamento','aberto','fechado','aprovado','enviado'])assert.match(css,new RegExp('\\.perf-fita-'+est+' \\.btn-sm\\{border-left-color:#'),est);
  // O toque: o mês vai para o filtro, a aba fica (Relatório também mostra a base) e Base e fechamento abre à vista.
  assert.doesNotMatch(html,/data-perf-abrir-mes/,'a fita não usa mais o atalho que levava ao topo de Rankings');
  const botao={dataset:{perfFitaMes:'2027-01'}};
  const el={querySelector:()=>null,querySelectorAll:sel=>sel==='[data-perf-fita-mes]'?[botao]:[]};
  c.STATE._perfAba='relatorio';c.__el=el;
  c.run('perfWireFonte(__el)');
  botao.onclick();
  assert.deepEqual({...c.STATE._fPerf},{de:'2027-01-01',ate:'2027-01-31'});
  assert.equal(c.STATE._perfAba,'relatorio');assert.equal(c.STATE._perfRolarBase,true);
  const quadro={open:false,rolou:null,scrollIntoView(o){this.rolou=o;}};
  c.__el2={querySelector:sel=>sel==='[data-quadro="perf-base"]'?quadro:null,querySelectorAll:()=>[]};
  // Enquanto a apuração do mês tocado não chega, cada desenho rola de novo (o "Consultando" encolhe a página).
  c.run('perfRemoto.chave="2026-11-01|2026-11-30";perfRemoto.carregando=false;perfWireFonte(__el2)');
  assert.equal(quadro.open,true);assert.deepEqual({...quadro.rolou},{block:'start'});assert.equal(c.STATE._perfRolarBase,true);
  c.run('perfRemoto.chave=perfChave();perfRemoto.carregando=true;perfWireFonte(__el2)');assert.equal(c.STATE._perfRolarBase,true);
  c.run('perfRemoto.carregando=false;perfWireFonte(__el2)');assert.equal(c.STATE._perfRolarBase,false);
  // De outra aba (Gestão de equipes), o toque vai para Rankings, onde a base mora.
  c.STATE._perfAba='gestao';c.run('perfWireFonte(__el)');botao.onclick();assert.equal(c.STATE._perfAba,'equipe');
});

/* ------------------------------------------------------------------ achado 9 */
test('revisão comissão: exportar uma aprovação de teste fora de outubro diz o que fazer, sem citar outubro; sem travessão e sem "ERP.."',async()=>{
  const {COMISSAO:S}=await import('../supabase/functions/_shared/pcp-comissao.mjs');
  const r=(de,extra={})=>({id:de+':x',de,ate:de.slice(0,8)+'28',tipo:'aprovacao',apuracao:{aprovavel:true,config:{modo:'teste'},ajustes:[]},...extra});
  for(const M of [C,S]){
    // O caso ruim: novembro em teste dizia "Outubro é teste."
    assert.throws(()=>M.csv(r('2026-11-01')),e=>!/outubro/i.test(e.message)&&/crie uma nova prévia no modo efetivo/.test(e.message));
    assert.throws(()=>M.csv(r('2026-10-01')),/^Error: Outubro é teste: a aprovação em modo teste não exporta para pagamento\.$/);
    assert.throws(()=>M.csv(r('2026-11-01',{tipo:'previa'})),/Só uma aprovação exporta para pagamento: aprove a última prévia/);
    assert.throws(()=>M.csv(r('2026-11-01',{apuracao:{aprovavel:false,config:{modo:'efetivo'}}})),/tem pendências e não exporta/);
  }
  assert.doesNotMatch(ler('comissao-ui.js'),/—/,'sem travessão nos textos da comissão');
  // "ERP.." na linha Fonte dos PDFs: o ponto final da fonte não dobra.
  const app=ler('app.js');
  const m=app.match(/<p>Fonte: \$\{esc\(String\(fonteApuracao \|\| \('registros do PCP disponíveis neste aparelho\. Última sincronização: '\+em\)\)\.trim\(\)\.replace\(\/\[\.!\?\]\+\$\/,''\)\)\}\. /);
  assert.ok(m,'a fonte perde o ponto final antes do ". " da linha');
  const fonte='Fechamento preservado · revisão 1. Todas as instalações; não certifica serviços ausentes do ERP.';
  assert.equal(String(fonte).trim().replace(/[.!?]+$/,'')+'.','Fechamento preservado · revisão 1. Todas as instalações; não certifica serviços ausentes do ERP.');
});

/* ----------------------------------------------------------------- achado 10 */
test('revisão comissão: o ensaio do backup exige as 3 coleções novas na contagem, mesmo com zero linhas',()=>{
  const E=require('../scripts/ensaio-backup-pcp.cjs');
  const novas=['performance_comissao_exportacoes','performance_documentos','performance_retrato_logos'];
  for(const c of novas)assert.ok(E.OBRIGATORIAS.includes(c),c);
  const zero=Object.fromEntries(E.OBRIGATORIAS.map(c=>[c,{total:0,apagados:0}]));
  const pacote=fim=>E.montarPacote({pcp_registros:[],pcp_demandas:[],pcp_meta:[],cfg:{},cfgVersao:'',formato:'pcp-exportacao-1',paginas:1,
    contagemInicio:{pcp_registros:{...zero},pcp_demandas:0,pcp_meta:0},contagemFim:{pcp_registros:fim,pcp_demandas:0,pcp_meta:0}},{});
  // O caso ruim: a contagem sem a coleção dos documentos oficiais passava.
  const sem={...zero};delete sem.performance_documentos;
  assert.throws(()=>E.validarPacote(pacote(sem)),/A contagem do PCP não traz a coleção performance_documentos\./);
  // Com as três em zero (como hoje), passa.
  assert.doesNotThrow(()=>E.validarPacote(pacote({...zero})));
});
