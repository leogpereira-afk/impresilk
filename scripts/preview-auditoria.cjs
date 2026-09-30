// Prévia local isolada: dados fictícios, sem config, autenticação ou API real.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const permitidos=new Set(['index.html','equipe.html','app.js','equipe.js','casa.js','performance.js','relatorios-entregas.js','frases.js','operacao.js','logo.js','styles.css','favicon.svg','icon.svg','divisao.js','entrega-item.js','equipe-aguia.webp','equipe-leao.webp','equipe-pantera.webp','equipe-lobo.webp','equipe-tigre.webp','equipe-falcao.webp','equipe-carcara.webp','equipe-onca.webp','equipe-lobo-guara.webp','equipe-touro.webp']);
const fixture=`
const hoje=(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})();
const deslocar=n=>{const d=new Date(hoje+'T12:00:00');d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const base=(id,extra={})=>({id,numero:'T-'+id,cliente:'Cliente de teste '+id,servico:'Fachada e comunicação visual',tipo:'externo',instalacao:{data:hoje,periodo:'Manhã',duracaoDias:1},equipe:['Ana'],veiculo:'Carro 1',liberadoPCP:true,confirmacao:'Confirmado',confEm:hoje+'T08:00:00-03:00',criadoEm:deslocar(-20)+'T12:00:00',itens:[{descricao:'Painel',qtd:1,pronto:false}],...extra});
let lista=[
base('101',{cliente:'Clínica Horizonte · teste',liberadoPCP:false,equipe:[],veiculo:'',confirmacao:''}),
base('102',{cliente:'Loja Central · teste'}),
base('103',{cliente:'Edifício Jardim · teste',instalacao:{data:deslocar(-1),periodo:'Dia inteiro',duracaoDias:3},equipe:['Ana','Bia'],saidaEm:hoje+'T08:00:00',horaSaida:'08:00'}),
base('104',{cliente:'Escola do Parque · teste',instalacao:{data:deslocar(-5),periodo:'Manhã'},horaSaida:'08:00',saidaEm:deslocar(-5)+'T08:00:00'}),
base('105',{cliente:'Restaurante Alameda · teste',tipo:'interno',instalacao:{},liberadoPCP:true,equipe:[]}),
base('106',{instalacao:{},liberadoPCP:false,equipe:[],veiculo:''}),
base('107',{instalacao:{data:deslocar(2),periodo:'Tarde'},equipe:['Bia'],veiculo:'Carro 2'}),
base('108',{instalacao:{data:deslocar(-5)},finalizadaEm:hoje+'T10:00:00',finalizadoPor:'Ana',equipe:['Ana','Bia'],horaSaida:'08:00',horaRetorno:'10:00',saidaEm:hoje+'T08:00:00',retornoEm:hoje+'T10:00:00'}),
base('109',{finalizadaEm:hoje+'T11:00:00',finalizadoPor:'Mubisys (auto)',baixaAutoERP:{em:hoje+'T11:00:00',status:'CANCELADO'}}),
base('110',{finalizadaEm:hoje+'T11:00:00',finalizadoPor:'Ana',retrabalho:true,problema:'Rever alinhamento da placa',causaRetrabalho:'Erro de medida',equipe:[]}),
base('111',{instalacao:{data:deslocar(-4)},liberadoPCP:false,previsaoEntrega:deslocar(-4),equipe:[]})
];
const APP_VERSAO='v106 · prévia'; const AUTH={dono:()=>({nome:'Ana',papel:'montagem'}),temCracha:()=>true,listarContas:async()=>({contas:[]})};
const cfg={instaladores:['Ana','Bia'],responsaveis:['Responsável de teste'],gerentes_montagem:[],veiculos:['Carro 1','Carro 2'],ferramentas:[],suprimentos:[],causasRetrabalho:['Erro de medida'],funcionarios:[],niveis:{}};
/* A PERFORMANCE COM CARA DE MÊS DE VERDADE (revisão de experiência, 29/09/2026).
   Pódio, tabela, cobertura e equipes só aparecem de fato com várias entregas,
   gente do RH e equipes fixas. Tudo fictício: nomes, valores e O.S. inventados.
   As datas ficam DENTRO do mês corrente (até hoje), para o período padrão da
   tela achá-las em qualquer dia em que a prévia rodar. */
const pvDoMes=n=>{const d=new Date(hoje+'T12:00:00');d.setDate(Math.min(d.getDate(),1+n));return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const PV_OK={carroLimpo:'sim',carroArrumado:'sim',equipamentosOk:'sim',semAvaria:'sim',por:'Gestor de teste'};
const PV_SUJO={carroLimpo:'nao',carroArrumado:'sim',equipamentosOk:'sim',semAvaria:'sim',por:'Gestor de teste'};
const PV_FALTOU={carroLimpo:'sim',carroArrumado:'sim',equipamentosOk:'nao',semAvaria:'sim',por:'Gestor de teste'};
const PV_EQ={aguia:['900001','900002'],leao:['900004','900007'],lobo:['900005','900008']};
const PV_ENTREGAS=[
 ['F01',0,PV_EQ.aguia,4200,PV_OK,'Carro 1'],['F02',1,PV_EQ.aguia,3100,PV_OK,'Carro 1'],['F03',2,PV_EQ.leao,5600,PV_OK,'Carro 2'],
 ['F04',3,PV_EQ.lobo,2300,PV_SUJO,'Carro 3'],['F05',4,PV_EQ.leao,6100,PV_OK,'Carro 2'],['F06',5,PV_EQ.aguia,1850,PV_OK,'Carro 1'],
 ['F07',6,['900004'],2750,PV_OK,'Carro 2'],['F08',7,PV_EQ.lobo,3900,PV_OK,'Carro 3'],['F09',8,PV_EQ.lobo,2200,PV_FALTOU,'Carro 3'],
 ['F10',9,PV_EQ.aguia,4800,PV_OK,'Carro 1'],['F11',10,['900001','900005'],1300,PV_OK,'Carro 1'],['F12',11,PV_EQ.leao,7200,PV_OK,'Carro 2'],
 ['F13',12,PV_EQ.aguia,2600,PV_SUJO,'Carro 1'],['F14',13,['900007'],990,PV_OK,'Carro 2'],['F15',14,PV_EQ.lobo,3350,PV_OK,'Carro 3'],
 ['F16',15,PV_EQ.aguia,5100,PV_OK,'Carro 1'],['F17',16,PV_EQ.leao,2450,PV_OK,'Carro 2'],['F18',17,[],1700,null,''],
 ['F19',18,[],2100,null,''],['F20',19,PV_EQ.aguia,3650,PV_OK,'Carro 1'],['F21',20,[],880,null,''],['F22',21,PV_EQ.lobo,4400,PV_OK,'Carro 3'],
];
for(const [id,n,equipe,valor,rc,carro] of PV_ENTREGAS){const d=pvDoMes(n);lista.push(base(id,{cliente:'Cliente fictício '+id,instalacao:{data:d,periodo:'Manhã'},equipe:[...equipe],veiculo:carro,valorTotal:valor,saidaEm:d+'T08:00:00',horaSaida:'08:00',horaRetorno:'16:00',retornoEm:d+'T16:00:00',finalizadaEm:d+'T15:30:00',finalizadoPor:'Gestor de teste',retornoConf:rc}));}
const pvMembro=(id,nome,pct)=>({chave:id,nome,percentual:pct});
cfg.performancePCP={equipes:[
 {id:'eq-aguia',nome:'Águia',animal:'aguia',cor:'marinho',emblema:'🦅',liderPadraoId:'900001',membros:[{chave:'900001',nome:'Ana Paula Souza'},{chave:'900002',nome:'Beatriz Costa Lima'}],ativo:true},
 {id:'eq-leao',nome:'Leão',animal:'leao',cor:'laranja',emblema:'🦁',liderPadraoId:'900004',membros:[{chave:'900004',nome:'Carlos Lima Prado'},{chave:'900007',nome:'Diego Ramos Teixeira'}],ativo:true},
 {id:'eq-lobo',nome:'Lobo',animal:'lobo',cor:'verde',emblema:'🐺',liderPadraoId:'900005',membros:[{chave:'900005',nome:'Carlos Melo Dias'},{chave:'900008',nome:'Eduardo Farias Neto'}],ativo:true},
 {id:'eq-touro',nome:'Touro',animal:'touro',cor:'vinho',emblema:'🐂',liderPadraoId:'900009',membros:[{chave:'900009',nome:'Fernanda Alves Rocha'}],ativo:true},
 {id:'teste-equipe',nome:'Horizonte · demonstração',emblema:'🚀',membros:[{chave:'Ana',nome:'Ana'},{chave:'Bia',nome:'Bia'}],ativo:false}],
 participacoes:[
 {id:'108',equipeId:'eq-aguia',equipeNome:'Águia',emblema:'🦅',membros:[pvMembro('900001','Ana Paula Souza',60),pvMembro('900002','Beatriz Costa Lima',40)],por:'Gestor de teste',em:hoje,obs:'Exemplo fictício para revisão visual'},
 {id:'F01',equipeId:'eq-aguia',equipeNome:'Águia',emblema:'🦅',membros:[pvMembro('900001','Ana Paula Souza',60),pvMembro('900002','Beatriz Costa Lima',40)],por:'Gestor de teste',em:hoje,obs:''},
 {id:'F03',equipeId:'eq-leao',equipeNome:'Leão',emblema:'🦁',membros:[pvMembro('900004','Carlos Lima Prado',60),pvMembro('900007','Diego Ramos Teixeira',40)],por:'Gestor de teste',em:hoje,obs:''},
 {id:'F08',equipeId:'eq-lobo',equipeNome:'Lobo',emblema:'🐺',membros:[pvMembro('900005','Carlos Melo Dias',50),pvMembro('900008','Eduardo Farias Neto',50)],por:'Gestor de teste',em:hoje,obs:''},
 {id:'F12',equipeId:'eq-leao',equipeNome:'Leão',emblema:'🦁',membros:[pvMembro('900004','Carlos Lima Prado',60),pvMembro('900007','Diego Ramos Teixeira',40)],por:'Gestor de teste',em:hoje,obs:''}]};
const revisoesPreview=[];
async function previewApi(body){
 if(body.action==='equipeHistorico')return {desdeQuando:'2025-01-01',meses:body.meses.map(m=>({mes:m,total:22+Number(m.slice(5)),porArea:{Acabamento:10,Serralheria:8,'Comercial e Atendimento':8},piso:false}))};
 if(body.action==='relatorioEntregas')return {ano:body.ano,de:body.ano+'-01-01',ate:hoje,consultadoEm:new Date().toISOString(),recebimentosEm:new Date().toISOString(),notas:{entregue:'DADOS FICTÍCIOS — demonstração de entregas.',vendido:'DADOS FICTÍCIOS — O.S. por cadastro.',recebido:'DADOS FICTÍCIOS — pagamentos.',retrabalho:'DADOS FICTÍCIOS — taxa das instalações registradas.'},meses:Array.from({length:12},(_,i)=>({mes:body.ano+'-'+String(i+1).padStart(2,'0'),futuro:i+1>Number(hoje.slice(5,7)),entregue:i===3?null:120000+i*27000+Math.sin(i)*50000,vendido:180000+i*18000,recebido:140000+i*23000,retrabalho:8-i*.5,baseRetrabalho:40,entregasEm:new Date().toISOString(),entregas:[{numero:'TESTE-101',cliente:'Demonstração',data:hoje,valor:100}],vendas:[],retrabalhos:[]}))};
 if(body.action==='performancePeriodo'){
  // O mesmo formato do pcp-sync (perfFonte): membro sugerido pelo ID do RH, volta e conferência do carro.
  const nomeRH=n=>(ELENCO_PREVIA.pessoas.find(p=>p.id===n)||{}).nome||n;
  const registros=lista.filter(o=>o.finalizadaEm && !o.baixaAutoERP && o.tipo!=='interno' && o.finalizadaEm.slice(0,10)>=body.de && o.finalizadaEm.slice(0,10)<=body.ate).map(o=>{
   const p=cfg.performancePCP?.participacoes?.find(p=>p.id===o.id),eq=o.equipe||[];
   const membros=p?.membros || eq.map((n,i)=>({chave:n,nome:nomeRH(n),percentual:(Math.floor(10000/eq.length)+(i<10000%eq.length?1:0))/100}));
   return {id:o.id,numero:o.numero,cliente:o.cliente,dia:o.finalizadaEm.slice(0,10),valor:typeof o.valorTotal==='number'?o.valorTotal:null,origemValor:'Simulação local',membros,confirmado:!!p,equipeId:p?.equipeId||'',equipeNome:p?.equipeNome||'',emblema:p?.emblema||'🤝',por:p?.por||'',em:p?.em||'',obs:p?.obs||'',retrabalho:!!o.retrabalho,retornoConf:o.retornoConf||null,voltou:eq.length>0,volta:[o.finalizadaEm.slice(0,10),String(o.veiculo||'').toLowerCase(),[...eq].sort().join('+')].join('|')};
  });return {completo:true,periodo:{de:body.de,ate:body.ate},hash:'simulacao',registros,consultadoEm:new Date().toISOString(),fonte:'DADOS FICTÍCIOS — simulação local'};
 }
 if(body.action==='performanceFechamentos')return {fechamentos:revisoesPreview};
 if(body.action==='performanceFechar'){
  const base=await previewApi({...body,action:'performancePeriodo'});if(base.registros.some(r=>!r.confirmado))return {error:'Confirme as participações.'};
  const f={...structuredClone(base),id:'preview-'+(revisoesPreview.length+1),revisao:revisoesPreview.length+1,fechadoPor:'Teste local',fechadoEm:new Date().toISOString(),motivo:body.motivo};revisoesPreview.unshift(f);return {ok:true,fechamento:f};
 }
 return {ok:true,os:[],totalOS:lista.length,ultimaImportacao:{em:new Date().toISOString(),ok:true,novas:0,atualizadas:1,baixa:{ok:true,semNoticiaDoErp:0,divergencias:[]}}};
}
// Pessoas FICTÍCIAS do RH (a equipe grava o ID de 6 dígitos desde a v133).
// Retrato FICTÍCIO desenhado aqui mesmo (SVG em data:, sem rosto real): serve
// para ver a foto no pódio ao lado de quem só tem as iniciais.
const pvFoto=(fundo,roupa)=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="'+fundo+'"/><circle cx="32" cy="25" r="12" fill="#f1cfae"/><path d="M8 64c2-15 12-22 24-22s22 7 24 22z" fill="'+roupa+'"/></svg>');
const ELENCO_PREVIA={pessoas:[
 {chave:'ana-souza',id:'900001',nome:'Ana Paula Souza',apelido:'ana',area:'Montagem Interna',cargo:'Instaladora',ativo:true,foto:pvFoto('#cfe3f5','#1e2d55')},
 {chave:'bia-costa',id:'900002',nome:'Beatriz Costa Lima',apelido:'',area:'Montagem Interna',cargo:'Instaladora',ativo:true,foto:''},
 {chave:'carlos-lima',id:'900004',nome:'Carlos Lima Prado',apelido:'',area:'Serralheria',cargo:'Serralheiro',ativo:true,foto:pvFoto('#fde2c8','#c2410c')},
 {chave:'carlos-melo',id:'900005',nome:'Carlos Melo Dias',apelido:'',area:'Serralheria',cargo:'Serralheiro',ativo:true,foto:''},
 {chave:'diego-ramos',id:'900007',nome:'Diego Ramos Teixeira',apelido:'',area:'Montagem Externa',cargo:'Instalador',ativo:true,foto:pvFoto('#dcefe3','#15803d')},
 {chave:'eduardo-farias',id:'900008',nome:'Eduardo Farias Neto',apelido:'',area:'Montagem Externa',cargo:'Instalador',ativo:true,foto:''},
 {chave:'fernanda-alves',id:'900009',nome:'Fernanda Alves Rocha',apelido:'',area:'Montagem Externa',cargo:'Instaladora',ativo:true,foto:''}],
 antigos:[{chave:'davi-antigo',id:'900006',nome:'Davi Antigo Nunes',apelido:'',ativo:false,desligado:true}],veiculos:[],ferias:[],ausencias:[]};
cfg.vinculosRH=[{apelido:'Bia',id:'900002',chave:'bia-costa',nome:'Beatriz Costa Lima'}];
lista.push(base('112',{cliente:'Mercado Bairro · teste (equipe por ID)',instalacao:{data:deslocar(1),periodo:'Tarde'},equipe:['900004','Ana'],veiculo:'Carro 1'}));
/* A FILA DE LANÇAMENTO COMO NO PRINT DO DONO (revisão de Entregas, 29/09/2026).
   No ar a fila passou de 50 baixas do ERP esperando lançamento, quase todas sem
   equipe. Aqui são 56 (57 com a 109, que já estava na prévia), com valor
   variado (duas sem valor) e poucas com equipe.
   A data não passa do CORTE_LANCAMENTO_MANUAL (15/09/2026): baixa anterior a
   ele já conta como entregue e não entra na fila, então a fila real só tem
   baixas de 15/09 para cá. Tudo fictício, com sorteio de semente fixa para a
   foto sair igual toda vez. */
let pvSemente=7;const pvSorte=()=>{pvSemente=(pvSemente*9301+49297)%233280;return pvSemente/233280;};
const PV_SERVICOS=['Fachada em ACM','Adesivagem de vitrine','Letreiro luminoso','Totem de sinalização','Placa de obra','Envelopamento de frota','Sinalização interna','Lona com estrutura'];
const pvCorte='2026-09-15';
const pvDiaFila=k=>{const d=deslocar(-k);return d<pvCorte?pvCorte:d;};
for(let i=1;i<=56;i++){
 const id='L'+String(i).padStart(2,'0'),d=pvDiaFila(Math.floor(pvSorte()*15));
 const eq=i%9===0?['900004','900007']:(i%13===0?['Ana']:[]);
 const valor=i===17||i===41?undefined:Math.round((180+Math.pow(pvSorte(),2)*13800)*100)/100;
 lista.push(base(id,{numero:'T-'+id,cliente:'Cliente fictício '+id,servico:PV_SERVICOS[i%PV_SERVICOS.length],instalacao:{data:d,periodo:'Manhã'},equipe:eq,veiculo:'',valorTotal:valor,finalizadaEm:d+'T18:00:00',finalizadoPor:'Mubisys (auto)',baixaAutoERP:{em:d+'T18:00:00',status:'ENTREGUE'}}));
}
/* O PACOTE DO ERP (entreguesMes): sem ele a tela ficava "carregando" e não havia
   lista do período nem cartões para comparar. O mês corrente leva as O.S. do
   aparelho que já saíram (menos as de hoje, para reproduzir o "R$ 0,00 entregue
   hoje" do print) e algumas só do ERP; os meses anteriores do ano são inventados. */
const PV_ERP={};
const pvMesAtual=hoje.slice(0,7);
for(let m=1;m<=Number(hoje.slice(5,7));m++){
 const mes=hoje.slice(0,4)+'-'+String(m).padStart(2,'0'),os=[];
 if(mes===pvMesAtual){
  for(const o of lista){const d=String(o.finalizadaEm||'').slice(0,10);if(!d||d===hoje||d.slice(0,7)!==mes)continue;os.push({numero:o.numero,cliente:o.cliente,servico:o.servico,data:d,valor:typeof o.valorTotal==='number'?o.valorTotal:null,tipo:o.tipo,previsao:d});}
  for(let i=1;i<=6;i++)os.push({numero:'E-'+mes+'-'+i,cliente:'Cliente só do ERP '+i,servico:PV_SERVICOS[i%PV_SERVICOS.length],data:mes+'-'+String(Math.min(Number(hoje.slice(8,10))-1||1,2+i*3)).padStart(2,'0'),valor:Math.round(900+pvSorte()*5000),tipo:i%3?'externo':'interno'});
 }else{
  for(let i=1;i<=28;i++)os.push({numero:'E-'+mes+'-'+i,cliente:'Cliente fictício '+mes+'/'+i,servico:PV_SERVICOS[i%PV_SERVICOS.length],data:mes+'-'+String(1+(i%27)).padStart(2,'0'),valor:Math.round(400+pvSorte()*9000),tipo:i%4?'externo':'interno'});
 }
 PV_ERP[mes]={v:3,os,em:new Date().toISOString()};
}
const STORE={getAllOS:()=>lista,getOS:id=>lista.find(o=>o.id===id),getCFG:()=>cfg,getUser:()=>null,getInstalador:()=>null,elenco:()=>ELENCO_PREVIA, valores:()=>({}), pullValores:async()=>{}, pullElenco:async()=>{}, entreguesMes:m=>PV_ERP[m]||null, pullEntreguesMes:async()=>{}, anosEntregues:()=>[2026], carregarTudoEntregues:async()=>{}, getQueue:()=>[],getLastSync:()=>'',getFoto:async()=>null,pullPhoto:async()=>null,on(){},onSync(){},onConflict(){},pull:async()=>{},pullCFG:async()=>{},trySync:async()=>{},pronto:async()=>lista,api:previewApi,apiFn:async()=>({ok:true,usuarios:[],configurado:false}),saveOS:o=>{lista=lista.map(x=>x.id===o.id?structuredClone(o):x);},saveCFG(c){Object.assign(cfg,c)},conflitoCFG:()=>null,uuid:()=>crypto.randomUUID(),carimbarMomento(){}};
`;
const boot=`
document.addEventListener('DOMContentLoaded',()=>{
 STATE.user={nome:'PRÉVIA LOCAL · dados fictícios',papel:'admin'};
 document.querySelector('#login-screen').classList.add('hidden');document.querySelector('#app').classList.remove('hidden');
 document.querySelector('#user-badge').textContent=STATE.user.nome;
 document.querySelector('#topbar-logo').src=LOGO_IMPRESILK;
 document.querySelector('#topbar-date').textContent='Sem acesso ao banco de produção';
 aplicarPermissoes();initTabs();initCasa();initPicker();initTopbar();initConflictDialog();renderActiveTab();
 /* ATALHO DA PRÉVIA para foto sem clique (Chrome sem janela): #aba=performance
    abre a aba; &modo=equipes troca a vista; &base=1 abre "Base e fechamento".
    Só existe aqui, na prévia com dados fictícios. */
 const pv=new URLSearchParams(location.hash.slice(1));
 if(pv.get('modo'))STATE._perfModo=pv.get('modo');
 // Entregas: &fila=1 abre a fila de lançamento; &ordem=valor e &todas=1 também.
 if(pv.get('fila'))STATE._entFilaAberta=true;
 if(pv.get('ordem'))STATE._entFilaOrdem=pv.get('ordem');
 if(pv.get('todas'))STATE._entFilaTodas=true;
 const pvAba=pv.get('aba')&&document.querySelector('.tab[data-tab="'+pv.get('aba')+'"]:not([data-vista])');
 if(pvAba)pvAba.click();
 if(pv.get('base'))setTimeout(()=>{const d=document.querySelector('[data-quadro="perf-base"]');if(d)d.open=true;},900);
 // &tv=1 abre o Modo TV no painel das equipes; &tv=2 no das pessoas.
 if(pv.get('tv'))setTimeout(()=>{abrirTVCasa();for(let i=1;i<Number(pv.get('tv'));i++)document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight'}));},1200);
 if(pv.get('rolar'))setTimeout(()=>{const alvo=document.querySelector(pv.get('rolar'));if(alvo)alvo.scrollIntoView({block:'start'});},900);
});`;
http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'; form-action 'none'");
  if(name==='fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(fixture);return;}
  if(!permitidos.has(name)){res.writeHead(404);res.end();return;}
  let body=fs.readFileSync(path.join(root,name));
  if(name==='index.html') body=body.toString().replace(/<script src="(?:config|store|auth)\.js(?:\?[^\"]*)?"><\/script>/g,'').replace(/<script src="operacao.js(?:\?[^"]*)?">/,'<script src="fixture.js"></script><script src="operacao.js">').replace(/<script>if\('serviceWorker'[^]*?<\/script>/,'');
  if(name==='app.js')body=body.toString().replace("document.addEventListener('DOMContentLoaded', initLogin);",boot);
  const ext=path.extname(name);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp'})[ext]);res.end(body);
}).listen(Number(process.env.PORT) || 4201,'127.0.0.1',()=>console.log('Prévia com dados fictícios: http://127.0.0.1:4201'));
