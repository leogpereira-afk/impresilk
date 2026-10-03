/* DIÁRIO DE AUDITORIA ESCRITO PELO SERVIDOR (F03, 29/09/2026).
   Coleção 'auditoria' em pcp_registros, só de inserção, escrita pelo pcp-sync:
   upsert que muda campo auditado, delete (a lápide ganha autor) e setCfg de
   instaladores, vínculos e equipes. Só admin e pcp leem; nada desce ao
   aparelho. Cada teste começa pelo caso ruim. Dados fictícios (repo público). */
const {test}=require('node:test'),assert=require('node:assert/strict');
const {edge}=require('./helpers/edge.cjs');
const row=(id,registro)=>({id,colecao:'os',apagado:false,atualizado_em:'2026-09-19T10:00:00Z',registro:{id,rev:1,...registro}});
const base=(extra={})=>row('1',{numero:'5001',tipo:'externo',cliente:'Cliente Fictício',cnpjCpf:'123.456.789-00',equipe:['Ana'],veiculo:'Fiorino',instalacao:{data:'2026-09-30',periodo:'Manhã',hora:'',duracaoDias:1},...extra});
const gestor={papel:'pcp',nome:'Gestor Teste',sub:'gestor'};
const toque={nome:'Ana',sub:'Ana',id:'100001',papel:'montagem',montagemIndividual:true};
const diario=e=>e.db.pcp_registros.filter(r=>r.colecao==='auditoria');
// A régua de pessoas lê as fichas do RH: uma ficha fictícia com apelido = login.
const fichas=[{colecao:'colaboradores',id:'gestor-teste',apagado:false,registro:{id:'gestor-teste',nome:'Gestor Teste',apelido:'gestor',cpf:'111.222.333-44'}}];
const copia=e=>structuredClone(e.db.pcp_registros.find(r=>r.colecao==='os'&&r.id==='1').registro);

test('mudar a equipe gera UMA entrada com antes, depois e o autor do crachá (porId resolvido pelo login, nunca do aparelho)',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[base()],registros:fichas});
 const os={...copia(e),equipe:['Ana','Bruno']};
 const r=await e.call({action:'upsert',os,porId:'999999',autor:{porId:'999999'}},gestor);
 assert.equal(r.status,200);assert.equal(r.ok,true);
 const d=diario(e);assert.equal(d.length,1,JSON.stringify(d));
 const a=d[0].registro;
 assert.equal(a.osId,'1');assert.equal(a.numero,'5001');assert.equal(d[0].id,a.id);
 assert.match(a.id,/^[0-9a-f-]{36}$/,'id é uuid');
 assert.deepEqual(a.campos,['equipe']);
 assert.deepEqual(a.antes.equipe,['Ana']);assert.deepEqual(a.depois.equipe,['Ana','Bruno']);
 assert.equal(a.autor.nome,'Gestor Teste');assert.equal(a.autor.login,'gestor');assert.equal(a.autor.papel,'pcp');
 assert.equal(a.autor.porId,'111222','o servidor resolve o ID pela ficha cujo apelido é o login');
 assert.equal(a.origem,'tela');assert.ok(Date.parse(a.em));
 assert.ok(!/123\.456|cnpjCpf|cpf/i.test(JSON.stringify(a)),'o diário não guarda CPF');
});

test('upsert sem mudança em campo auditado não gera entrada (e mudar só o texto livre também não)',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[base()]});
 // A mesma agenda na ordem do jsonb e o mesmo carro: nada mudou.
 const os={...copia(e),instalacao:{duracaoDias:1,hora:'',periodo:'Manhã',data:'2026-09-30'},obsPCP:'só um recado'};
 const r=await e.call({action:'upsert',os},gestor);
 assert.equal(r.status,200);assert.equal(r.ok,true);
 assert.equal(diario(e).length,0,JSON.stringify(diario(e)));
});

test('agenda, carro, valor e retrabalho entram no diário campo a campo',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[base({valorTotal:900})]});
 const os={...copia(e),instalacao:{data:'2026-10-02',periodo:'Tarde',hora:'',duracaoDias:2},veiculo:'Strada',valorTotal:1200,retrabalho:true,causa:'Medida errada'};
 await e.call({action:'upsert',os},gestor);
 const d=diario(e);assert.equal(d.length,1);
 const a=d[0].registro;
 for(const c of ['instalacao.data','instalacao.periodo','instalacao.duracaoDias','veiculo','valorTotal','retrabalho','causa'])assert.ok(a.campos.includes(c),c+' falta em '+a.campos);
 assert.ok(!a.campos.includes('instalacao.hora'),'hora não mudou');
 assert.equal(a.antes['instalacao.data'],'2026-09-30');assert.equal(a.depois['instalacao.data'],'2026-10-02');
 assert.equal(a.antes.valorTotal,900);assert.equal(a.depois.valorTotal,1200);
});

test('crachá de toque: a entrada diz origem toque e o ID que a gestão autorizou no crachá',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[base({liberadoPCP:true,confirmacao:'Confirmado'})]});
 const r=await e.call({action:'upsert',os:{id:'1',rev:1,horaSaida:'08:10',saidaEm:'2026-09-30T11:10:00.000Z'}},toque);
 assert.equal(r.status,200,JSON.stringify(r));
 const d=diario(e);assert.equal(d.length,1);
 const a=d[0].registro;
 assert.equal(a.origem,'toque');assert.equal(a.autor.porId,'100001');assert.equal(a.autor.nome,'Ana');
 assert.ok(a.campos.includes('horaSaida'));
});

test('o delete registra quem apagou; apagar de novo a lápide não repete a entrada',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[base()]});
 const r=await e.call({action:'delete',id:'1',rev:1,motivo:'Registro duplicado confirmado'},gestor);
 assert.equal(r.status,200);
 assert.equal(e.db.pcp_registros.find(x=>x.colecao==='os').apagado,true);
 const d=diario(e);assert.equal(d.length,1);
 const a=d[0].registro;
 assert.equal(a.acao,'excluir');assert.equal(a.osId,'1');assert.equal(a.numero,'5001');
 assert.deepEqual(a.campos,['apagado','cicloRegistro']);assert.equal(a.antes.apagado,false);assert.equal(a.depois.apagado,true);
 assert.equal(a.autor.nome,'Gestor Teste');assert.equal(a.autor.login,'gestor');
 await e.call({action:'delete',id:'1',rev:1,motivo:'Registro duplicado confirmado'},gestor);
 assert.equal(diario(e).length,1,'lápide apagada de novo não é alteração');
 await e.call({action:'delete',id:'nunca-existiu'},gestor);
 assert.equal(diario(e).length,1,'O.S. que não existe não gera entrada');
});

test('leitura do diário: toque, montagem e operação recebem 403; admin e pcp leem a O.S. pedida',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[base(),row('2',{numero:'5002',equipe:['Ana']})],equipe_contas:[{sistema:'pcp',usuario:'montagem'}]});
 await e.call({action:'upsert',os:{...copia(e),equipe:['Ana','Bruno']}},gestor);
 for(const quem of [toque,{nome:'Montagem',sub:'montagem',papel:'montagem'},{nome:'Operação',sub:'operacao',papel:'operacao'},{nome:'Vendas',sub:'vendas',papel:'comercial'}]){
  const r=await e.call({action:'auditoriaOS',osId:'1'},quem);
  assert.equal(r.status,403,quem.papel+': '+JSON.stringify(r));
  assert.equal(r.entradas,undefined);
 }
 for(const papel of ['admin','pcp']){
  const r=await e.call({action:'auditoriaOS',osId:'1'},{papel,nome:'Gestão',sub:papel});
  assert.equal(r.status,200);assert.equal(r.entradas.length,1);assert.deepEqual(r.entradas[0].campos,['equipe']);
  const outra=await e.call({action:'auditoriaOS',osId:'2'},{papel,nome:'Gestão',sub:papel});
  assert.equal(outra.entradas.length,0,'só o diário da O.S. pedida');
 }
 assert.equal((await e.call({action:'auditoriaOS'},gestor)).status,400);
});

test('o list completo e o incremental nunca trazem registros do diário (nem para a gestão, nem para a máquina)',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[base({liberadoPCP:true,confirmacao:'Confirmado'})]});
 await e.call({action:'upsert',os:{...copia(e),equipe:['Ana','Bruno']}},gestor);
 await e.call({action:'upsert',os:{id:'1',rev:2,horaSaida:'08:10'}},toque);
 assert.ok(diario(e).length>=2);
 const idsDiario=new Set(diario(e).map(r=>r.id));
 for(const quem of [gestor,toque,'machine']){
  for(const pedido of [{action:'list'},{action:'list',since:'2000-01-01'},{action:'list',escopo:'recentes'}]){
   const r=await e.call(pedido,quem);
   assert.equal(r.status,200);
   assert.ok(r.os.every(o=>!idsDiario.has(o.id)&&!('osId' in o)&&!('autor' in o)),JSON.stringify(r.os));
   assert.equal(r.os.length,1);
  }
 }
});

test('falha ao gravar o diário não perde a O.S.: vira aviso e aparece no contador da saúde',async()=>{
 const e=await edge('pcp-sync',{pcp_registros:[base()]});
 const orig=e.cliente.from.bind(e.cliente);
 e.cliente.from=t=>{const q=orig(t);if(t!=='pcp_registros')return q;const ins=q.insert.bind(q);
  q.insert=v=>{if(v&&v.colecao==='auditoria'){q.then=res=>res({data:null,error:{message:'disco cheio (simulado)'}});return q;}return ins(v);};return q;};
 const avisos=[];const warn=console.warn;console.warn=(...a)=>avisos.push(a.join(' '));
 let r;try{r=await e.call({action:'upsert',os:{...copia(e),equipe:['Ana','Bruno']}},gestor);}finally{console.warn=warn;}
 assert.equal(r.status,200);assert.equal(r.ok,true);
 assert.deepEqual(e.db.pcp_registros.find(x=>x.colecao==='os').registro.equipe,['Ana','Bruno'],'a O.S. gravou');
 assert.equal(diario(e).length,0);
 assert.ok(avisos.some(a=>/auditoria|diário/i.test(a)),'o log avisa: '+avisos);
 const s=await e.call({action:'saude'},gestor);
 assert.equal(s.status,200);assert.ok(s.auditoria&&s.auditoria.falhas>=1,JSON.stringify(s));
 assert.match(s.auditoria.ultimoErro,/disco cheio/);
 // Quem entrou pelo nome só sabe que a porta responde.
 const t=await e.call({action:'saude'},toque);assert.equal(t.auditoria,undefined);
});

test('setCfg que muda instaladores, vínculos ou equipes gera entrada da configuração com antes e depois',async()=>{
 const cfg0={instaladores:['Ana'],vinculosRH:[],performancePCP:{equipes:[],participacoes:[]},agendaPCP:{}};
 const e=await edge('pcp-sync',{pcp_config_global:[{id:true,config:structuredClone(cfg0),atualizado_em:'2026-09-19T10:00:00Z'}]});
 const admin={papel:'admin',nome:'Admin Teste',sub:'admin'};
 // Sem mudança: nada.
 assert.equal((await e.call({action:'setCfg',baseCfg:cfg0,cfg:cfg0},admin)).ok,true);
 assert.equal(diario(e).length,0);
 // Só a agenda (fora da lista auditada): nada.
 const cfgAg={...cfg0,agendaPCP:{plantao:'x'}};
 assert.equal((await e.call({action:'setCfg',baseCfg:cfg0,cfg:cfgAg},admin)).ok,true);
 assert.equal(diario(e).length,0);
 // Instaladores.
 const cfg1={...cfgAg,instaladores:['Ana','Bruno']};
 assert.equal((await e.call({action:'setCfg',baseCfg:cfgAg,cfg:cfg1},admin)).ok,true);
 let d=diario(e);assert.equal(d.length,1);
 let a=d[0].registro;assert.equal(a.osId,'cfg');assert.equal(a.acao,'configuracao');
 assert.deepEqual(a.campos,['instaladores']);assert.deepEqual(a.antes.instaladores,['Ana']);assert.deepEqual(a.depois.instaladores,['Ana','Bruno']);
 assert.equal(a.autor.login,'admin');assert.equal(a.origem,'tela');
 // Vínculos, pelo pcp.
 const cfg2={...cfg1,vinculosRH:[{apelido:'Bruno',id:'100002'}]};
 assert.equal((await e.call({action:'setCfg',baseCfg:cfg1,cfg:cfg2},gestor)).ok,true);
 d=diario(e);assert.equal(d.length,2);a=d[1].registro;
 assert.deepEqual(a.campos,['vinculosRH']);assert.deepEqual(a.antes.vinculosRH,[]);assert.deepEqual(a.depois.vinculosRH,[{apelido:'Bruno',id:'100002'}]);
 // Equipe nova e participação com percentuais.
 const equipe={id:'eq-aguia',nome:'Águia',emblema:'🦅',membros:[{chave:'100001',nome:'Ana'},{chave:'100002',nome:'Bruno'}]};
 const part={id:'1',equipeId:'eq-aguia',membros:[{chave:'100001',nome:'Ana',percentual:60},{chave:'100002',nome:'Bruno',percentual:40}]};
 const cfg3={...cfg2,performancePCP:{equipes:[equipe],participacoes:[part]}};
 const r3=await e.call({action:'setCfg',baseCfg:cfg2,cfg:cfg3},gestor);assert.equal(r3.ok,true,JSON.stringify(r3));
 d=diario(e);assert.equal(d.length,3);a=d[2].registro;
 assert.ok(a.campos.includes('performancePCP.equipes'),a.campos);
 assert.ok(a.campos.includes('performancePCP.participacoes:1'),a.campos);
 assert.deepEqual(a.antes['performancePCP.equipes'],[]);assert.equal(a.depois['performancePCP.equipes'][0].nome,'Águia');
 assert.equal(a.antes['performancePCP.participacoes:1'],null);
 assert.deepEqual(a.depois['performancePCP.participacoes:1'].membros.map(m=>m.percentual),[60,40]);
 // Ninguém fora da gestão lê o diário da configuração.
 assert.equal((await e.call({action:'auditoriaOS',osId:'cfg'},toque)).status,403);
 assert.equal((await e.call({action:'auditoriaOS',osId:'cfg'},admin)).entradas.length,3);
});

test('o logo da equipe não entra inteiro no diário (só a marca de que mudou)',async()=>{
 const logo='data:image/png;base64,'+'A'.repeat(3000);
 const eq={id:'eq-leao',nome:'Leão',emblema:'🦁',membros:[{chave:'100001',nome:'Ana'}]};
 const cfg0={instaladores:['Ana'],performancePCP:{equipes:[eq],participacoes:[]}};
 const e=await edge('pcp-sync',{pcp_config_global:[{id:true,config:structuredClone(cfg0),atualizado_em:'2026-09-19T10:00:00Z'}]});
 const cfg1={...cfg0,performancePCP:{equipes:[{...eq,logo}],participacoes:[]}};
 const r=await e.call({action:'setCfg',baseCfg:cfg0,cfg:cfg1},{papel:'admin',nome:'Admin Teste',sub:'admin'});assert.equal(r.ok,true,JSON.stringify(r));
 const d=diario(e);assert.equal(d.length,1);
 const txt=JSON.stringify(d[0].registro);
 assert.ok(!txt.includes('A'.repeat(200)),'a imagem não vai para o diário');
 assert.notEqual(d[0].registro.antes['performancePCP.equipes'][0].logo,d[0].registro.depois['performancePCP.equipes'][0].logo);
});

test('regra pura: diffAuditavel trata vazio como vazio e compara por conteúdo',async()=>{
 const {diffAuditavel,CAMPOS_AUDITADOS}=await import('../supabase/functions/_shared/pcp-integridade.mjs');
 assert.ok(CAMPOS_AUDITADOS.includes('equipe'));
 assert.ok(!CAMPOS_AUDITADOS.some(c=>/cpf/i.test(c)),'CPF nunca é auditado');
 assert.equal(diffAuditavel({retrabalho:false,equipe:[]},{equipe:[]}),null,'false e ausente são o mesmo');
 assert.equal(diffAuditavel({instalacao:{data:'2026-09-30',hora:''}},{instalacao:{hora:'',data:'2026-09-30'}}),null);
 const d=diffAuditavel(null,{equipe:['Ana']});
 assert.deepEqual(d.campos,['equipe']);assert.equal(d.antes.equipe,null);
});

/* A TELA: a seção da ficha, só da gestão, carregada sob demanda e sem cópia
   no aparelho. Mesmo DOM mínimo do app-gestao.test.cjs. */
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const raiz=path.join(__dirname,'..');
function app(){
 const node=()=>({innerHTML:'',textContent:'',value:'',querySelector:node,querySelectorAll:()=>[],setAttribute(){},classList:{toggle(){},add(){},remove(){}},focus(){},scrollIntoView(){},insertAdjacentHTML(){}});
 const ctx=vm.createContext({console,document:{querySelector:node,querySelectorAll:()=>[],addEventListener(){}},window:{},localStorage:{getItem:()=>null},STORE:{getAllOS:()=>[],getCFG:()=>({})},setTimeout(){},clearTimeout(){}});
 vm.runInContext(fs.readFileSync(path.join(raiz,'operacao.js'),'utf8'),ctx);
 vm.runInContext(fs.readFileSync(path.join(raiz,'app.js'),'utf8'),ctx);
 return code=>vm.runInContext(code,ctx);
}
test('ficha: "Histórico de alterações" é só da gestão e recolhível; a leitura é sob demanda e não guarda no aparelho',()=>{
 const src=fs.readFileSync(path.join(raiz,'app.js'),'utf8');
 assert.match(src,/\['admin','pcp'\]\.includes\(STATE\.user\.papel\) \? `<details class="cfg-grupo lock-allow" id="os-auditoria"><summary>Histórico de alterações<\/summary>/);
 const ligar=src.slice(src.indexOf('function ligarHistoricoAlteracoes'),src.indexOf('/* ── Bloco 1: PCP & Cliente'));
 assert.match(ligar,/addEventListener\('toggle'/,'carrega ao abrir, não ao montar a ficha');
 const loja=fs.readFileSync(path.join(raiz,'store.js'),'utf8');
 const fn=loja.slice(loja.indexOf('async function auditoriaOS'),loja.indexOf('/* ── MAESTRO'));
 assert.match(fn,/action: 'auditoriaOS'/);
 assert.ok(!/lsSet|localStorage|_notify/.test(fn),'o diário não vai para o localStorage');
 assert.match(loja,/\n\s+auditoriaOS,\n/,'exportado pelo STORE');
});
test('ficha: o histórico diz quem, quando, por onde e o antes e depois legíveis; vazio e sem rede não se passam por "ninguém mexeu"',()=>{
 const run=app();
 const html=run(`htmlHistoricoAlteracoes({entradas:[{acao:'alterar',em:'2026-09-29T13:00:00.000Z',origem:'toque',autor:{nome:'Ana',papel:'montagem'},campos:['equipe','valorTotal','retrabalho','fotosRetornoIds'],antes:{equipe:['Ana'],valorTotal:900,retrabalho:null,fotosRetornoIds:null},depois:{equipe:['Ana','Bruno'],valorTotal:1200,retrabalho:true,fotosRetornoIds:['foto_1','foto_2']}}]})`);
 assert.match(html,/Ana \(montagem\)/);assert.match(html,/pelo celular da equipe/);
 assert.match(html,/Equipe<\/strong>: Ana → Ana, Bruno/);
 assert.match(html,/Valor total<\/strong>: R\$\s?900,00 → R\$\s?1\.200,00/);
 assert.match(html,/Retrabalho<\/strong>: \(vazio\) → sim/);
 assert.match(html,/2 fotos/);
 assert.ok(!html.includes('—'),'sem travessão no texto');
 assert.match(run(`htmlHistoricoAlteracoes({entradas:[]})`),/começou a ser gravado nesta versão/);
 assert.match(run(`htmlHistoricoAlteracoes({offline:true})`),/Sem conexão/);
 assert.match(run(`htmlHistoricoAlteracoes({erro:'Histórico de alterações restrito à gestão do PCP.'})`),/restrito à gestão/);
});
test('regra pura: marca vazia dentro do item não vira alteração; marca nova vira',async()=>{
 const {diffAuditavel}=await import('../supabase/functions/_shared/pcp-integridade.mjs');
 assert.equal(diffAuditavel({itens:[{item:'1',descricao:'Fachada'}]},{itens:[{descricao:'Fachada',item:'1',pronto:false,motivo:''}]}),null);
 const d=diffAuditavel({itens:[{item:'1',descricao:'Fachada'}]},{itens:[{item:'1',descricao:'Fachada',pronto:true}]});
 assert.deepEqual(d.campos,['itens']);assert.equal(d.depois.itens[0].pronto,true);
});

/* REVISÃO DA F03 (29/09/2026): QUEM ASSINOU. O diário é só de inserção; um ID
   adivinhado fica para sempre como se outra pessoa tivesse feito. Fichas
   fictícias, CPF inventado (o ID é o começo do CPF). */
const fichaRH=(id,nome,apelido,cpf,extra={})=>({colecao:'colaboradores',id,apagado:false,registro:{id,nome,apelido,cpf,...extra}});
const cfgRow=cfg=>[{id:true,config:cfg,atualizado_em:'2026-09-19T10:00:00Z'}];

test('gestão: nome de exibição e começo de nome nunca dão o ID do autor (conta compartilhada e conta de fora do RH gravam porId vazio)',async()=>{
 const rh=[fichaRH('carla-f','Carla Ficticia Souza','carlinha','22233344455')];
 // Conta compartilhada: login "pcp", nome "Carla" (começo de nome que só uma ficha tem).
 const e=await edge('pcp-sync',{pcp_registros:[base()],registros:rh});
 await e.call({action:'upsert',os:{...copia(e),equipe:['Ana','Bruno']}},{sub:'pcp',nome:'Carla',papel:'pcp'});
 let a=diario(e)[0].registro;
 assert.equal(a.autor.login,'pcp');assert.equal(a.autor.nome,'Carla');
 assert.equal(a.autor.porId,'','"Carla" casa por começo de nome com a ficha, mas nome não concede identidade');
 // Conta de alguém que não está no RH, login "carla" (não é o apelido de ninguém).
 const e2=await edge('pcp-sync',{pcp_registros:[base()],registros:rh});
 await e2.call({action:'delete',id:'1',rev:1,motivo:'Registro duplicado confirmado'},{sub:'carla',nome:'Carla Terceira',papel:'admin'});
 a=diario(e2)[0].registro;assert.equal(a.acao,'excluir');
 assert.equal(a.autor.porId,'');
});

test('gestão: o login igual ao apelido do RH vence o vínculo da lista de instaladores que aponta para a xará',async()=>{
 const rh=[fichaRH('ana-p','Ana Paula Reis','ana','20000100000'),fichaRH('ana-s','Ana Souza','ana.souza','10000100000')];
 const e=await edge('pcp-sync',{pcp_registros:[base({equipe:['100001']})],registros:rh,pcp_config_global:cfgRow({instaladores:['Ana'],vinculosRH:[{apelido:'Ana',id:'100001'}]})});
 await e.call({action:'upsert',os:{...copia(e),veiculo:'Strada'}},{sub:'ana',nome:'Ana Paula Reis',papel:'pcp'});
 assert.equal(diario(e)[0].registro.autor.porId,'200001');
 // Apelido repetido em duas fichas: ambíguo não escolhe.
 const rh2=[fichaRH('x1','Xavier Um','xavi','40000100000'),fichaRH('x2','Xavier Dois','xavi','40000200000')];
 const e2=await edge('pcp-sync',{pcp_registros:[base()],registros:rh2});
 await e2.call({action:'upsert',os:{...copia(e2),veiculo:'Strada'}},{sub:'xavi',nome:'Xavier',papel:'pcp'});
 assert.equal(diario(e2)[0].registro.autor.porId,'');
 // Quem saiu da casa não assina.
 const rh3=[fichaRH('z1','Zeca Saiu','zeca','50000100000',{dataDesligamento:'2026-08-31'})];
 const e3=await edge('pcp-sync',{pcp_registros:[base()],registros:rh3});
 await e3.call({action:'upsert',os:{...copia(e3),veiculo:'Strada'}},{sub:'zeca',nome:'Zeca',papel:'pcp'});
 assert.equal(diario(e3)[0].registro.autor.porId,'');
});

test('toque: o diário usa a mesma régua da trava de equipe (vínculo corrigido vence o id antigo do crachá; "sem ficha" não herda ID)',async()=>{
 const rh=[fichaRH('ana-1','Ana Ficticia Um','ana.um','10000100000'),fichaRH('ana-2','Ana Ficticia Dois','ana.dois','10000700000')];
 const liberada={liberadoPCP:true,confirmacao:'Confirmado'};
 // Crachá assinado como 100001; depois a gestão corrigiu Ana -> 100007.
 const e=await edge('pcp-sync',{pcp_registros:[base({...liberada,equipe:['100007']})],registros:rh,pcp_config_global:cfgRow({instaladores:['Ana'],vinculosRH:[{apelido:'Ana',id:'100007'}]})});
 const r=await e.call({action:'upsert',os:{id:'1',rev:1,horaSaida:'08:10'}},toque);
 assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(diario(e)[0].registro.autor.porId,'100007','quem a trava reconheceu como dono da O.S.');
 // "Ana" marcada como sem ficha (terceiro): a trava ignora o id antigo, o diário também.
 const e2=await edge('pcp-sync',{pcp_registros:[base({...liberada,equipe:['Ana']})],registros:rh,pcp_config_global:cfgRow({instaladores:['Ana'],vinculosRH:[{apelido:'Ana',semFicha:true}]})});
 const r2=await e2.call({action:'upsert',os:{id:'1',rev:1,horaSaida:'08:10'}},toque);
 assert.equal(r2.status,200,JSON.stringify(r2));
 assert.equal(diario(e2)[0].registro.autor.porId,'');
});

test('regra pura: idDoCracha é a régua da trava de equipe; idDaGestao só aceita apelido = login',async()=>{
 const {idDoCracha,idDaGestao,pertenceEquipe,resolverPessoas}=await import('../supabase/functions/_shared/pcp-integridade.mjs');
 const pessoas=[{id:'100001',nome:'Ana Ficticia Um',apelido:'ana.um'},{id:'100007',nome:'Ana Ficticia Dois',apelido:'ana.dois'}];
 const r=resolverPessoas({pessoas,vinculos:[{apelido:'Ana',id:'100007'}]});
 const quem={nome:'Ana',id:'100001'};
 assert.equal(idDoCracha(quem,r),'100007');
 assert.equal(pertenceEquipe({equipe:['100007']},quem,r),true);assert.equal(pertenceEquipe({equipe:['100001']},quem,r),false);
 assert.equal(idDoCracha({nome:'Beto',id:'100009'},r),'100009','nome sem ficha nem decisão: vale o id do crachá');
 assert.equal(idDoCracha({nome:'Ana',id:'100001'},null),'100001','sem régua (RH fora): o id assinado');
 assert.equal(idDaGestao('ana.dois',r),'100007');
 assert.equal(idDaGestao('Ana',r),'','vínculo da lista de instaladores não vale para a gestão');
 assert.equal(idDaGestao('Ana Ficticia Um',r),'','nome completo também não');
 assert.equal(idDaGestao('',r),'');
});

test('tipo, número, baixa do ERP e justificativa entram no diário (mexem na performance e na prova)',async()=>{
 for(const [campo,antes,depois] of [['tipo','externo','interno'],['numero','5001','5002'],['justificativaConclusao','','Cliente fechado no dia da entrega'],['baixaAutoERP',null,{em:'2026-09-29T12:00:00.000Z',status:'FORA DA CARTEIRA ABERTA',confirmadoPor:'Gestor Teste'}]]){
  const e=await edge('pcp-sync',{pcp_registros:[base({valorTotal:900,[campo]:antes})]});
  const r=await e.call({action:'upsert',os:{...copia(e),[campo]:depois}},gestor);
  assert.equal(r.status,200,campo+': '+JSON.stringify(r));
  const d=diario(e);assert.equal(d.length,1,campo);
  assert.deepEqual(d[0].registro.campos,[campo]);
  assert.deepEqual(d[0].registro.depois[campo],depois);
 }
});

test('ficha: objeto no histórico sai com rótulo em português, "não" com til, data legível e sem ID interno; integração não aparece como "maquina"',()=>{
 const run=app();
 const html=run(`htmlHistoricoAlteracoes({entradas:[{acao:'alterar',em:'2026-09-29T13:00:00.000Z',origem:'maquina',autor:{nome:'Integração',papel:'maquina'},
  campos:['retornoConf','voltaEquipe','excecaoConclusao','tipo'],
  antes:{retornoConf:null,voltaEquipe:null,excecaoConclusao:null,tipo:'externo'},
  depois:{retornoConf:{carroLimpo:'nao',carroArrumado:'sim',equipamentosOk:'sim',semAvaria:'sim',obs:'',fotos:[],por:'Gestor',porId:'gestor',em:'2026-09-29T13:00:00.000Z'},
   voltaEquipe:{carroLimpo:'sim',semAvaria:'nao',obs:'Banco rasgado',fotos:['f1'],dia:'2026-09-29',veiculo:'Strada',por:'Ana',porId:'Ana',em:'2026-09-29T12:00:00.000Z',recebidoEm:'2026-09-29T12:01:00.000Z'},
   excecaoConclusao:{motivo:'Cliente fechado sem foto final',por:'Gestor',em:'2026-09-29T13:00:00.000Z'},tipo:'interno'}}]})`);
 assert.match(html,/Carro limpo: não, Carro arrumado: sim, Equipamentos ok: sim, Sem avaria: sim, Por: Gestor, Em: /);
 assert.match(html,/Observação: Banco rasgado, Fotos: 1, Dia: 29\/09\/2026, Veículo: Strada/);
 assert.match(html,/Motivo: Cliente fechado sem foto final/);
 assert.match(html,/Tipo<\/strong>: Externo → Cliente retira/);
 assert.match(html,/Integração \(integração\)/);
 assert.ok(!/porId|recebidoEm|carroLimpo|semAvaria|\bnao\b|maquina|\d{4}-\d{2}-\d{2}T/.test(html),html);
 assert.ok(!html.includes('—'),'sem travessão no texto');
});
