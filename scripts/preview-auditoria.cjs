// Prévia local isolada: dados fictícios, sem config, autenticação ou API real.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const permitidos=new Set(['index.html','equipe.html','app.js','equipe.js','casa.js','performance.js','relatorios-entregas.js','frases.js','operacao.js','logo.js','styles.css','favicon.svg','icon.svg']);
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
cfg.performancePCP={equipes:[{id:'teste-equipe',nome:'Horizonte · demonstração',emblema:'🦅',membros:[{chave:'Ana',nome:'Ana'},{chave:'Bia',nome:'Bia'}]}],participacoes:[{id:'108',equipeId:'teste-equipe',equipeNome:'Horizonte · demonstração',emblema:'🦅',membros:[{chave:'Ana',nome:'Ana',percentual:60},{chave:'Bia',nome:'Bia',percentual:40}],por:'Gestor de teste',em:hoje,obs:'Exemplo fictício para revisão visual'}]};
const revisoesPreview=[];
async function previewApi(body){
 if(body.action==='equipeHistorico')return {desdeQuando:'2025-01-01',meses:body.meses.map(m=>({mes:m,total:22+Number(m.slice(5)),porArea:{Acabamento:10,Serralheria:8,'Comercial e Atendimento':8},piso:false}))};
 if(body.action==='relatorioEntregas')return {ano:body.ano,de:body.ano+'-01-01',ate:hoje,consultadoEm:new Date().toISOString(),recebimentosEm:new Date().toISOString(),notas:{entregue:'DADOS FICTÍCIOS — demonstração de entregas.',vendido:'DADOS FICTÍCIOS — O.S. por cadastro.',recebido:'DADOS FICTÍCIOS — pagamentos.',retrabalho:'DADOS FICTÍCIOS — taxa das instalações registradas.'},meses:Array.from({length:12},(_,i)=>({mes:body.ano+'-'+String(i+1).padStart(2,'0'),futuro:i+1>Number(hoje.slice(5,7)),entregue:i===3?null:120000+i*27000+Math.sin(i)*50000,vendido:180000+i*18000,recebido:140000+i*23000,retrabalho:8-i*.5,baseRetrabalho:40,entregasEm:new Date().toISOString(),entregas:[{numero:'TESTE-101',cliente:'Demonstração',data:hoje,valor:100}],vendas:[],retrabalhos:[]}))};
 if(body.action==='performancePeriodo'){
  const registros=lista.filter(o=>o.finalizadaEm && !o.baixaAutoERP && o.tipo!=='interno').map(o=>{
   const p=cfg.performancePCP?.participacoes?.find(p=>p.id===o.id);return {id:o.id,numero:o.numero,cliente:o.cliente,dia:hoje,valor:100,origemValor:'Simulação local',membros:p?.membros || (o.equipe||[]).map(n=>({chave:n,nome:n,percentual:100/o.equipe.length})),confirmado:!!p,equipeId:p?.equipeId||'',equipeNome:p?.equipeNome||'',emblema:p?.emblema||'🤝',por:p?.por||'',em:p?.em||'',obs:p?.obs||'',retrabalho:!!o.retrabalho};
  });return {completo:true,periodo:{de:body.de,ate:body.ate},hash:'simulacao',registros,consultadoEm:new Date().toISOString(),fonte:'DADOS FICTÍCIOS — simulação local'};
 }
 if(body.action==='performanceFechamentos')return {fechamentos:revisoesPreview};
 if(body.action==='performanceFechar'){
  const base=await previewApi({...body,action:'performancePeriodo'});if(base.registros.some(r=>!r.confirmado))return {error:'Confirme as participações.'};
  const f={...structuredClone(base),id:'preview-'+(revisoesPreview.length+1),revisao:revisoesPreview.length+1,fechadoPor:'Teste local',fechadoEm:new Date().toISOString(),motivo:body.motivo};revisoesPreview.unshift(f);return {ok:true,fechamento:f};
 }
 return {ok:true,os:[],totalOS:lista.length,ultimaImportacao:{em:new Date().toISOString(),ok:true,novas:0,atualizadas:1,baixa:{ok:true,semNoticiaDoErp:0,divergencias:[]}}};
}
const STORE={getAllOS:()=>lista,getOS:id=>lista.find(o=>o.id===id),getCFG:()=>cfg,getUser:()=>null,getInstalador:()=>null,elenco:()=>({pessoas:[],veiculos:[],ferias:[],ausencias:[]}), valores:()=>({}), pullValores:async()=>{}, pullElenco:async()=>{}, entreguesMes:()=>null, pullEntreguesMes:async()=>{}, anosEntregues:()=>[2026], carregarTudoEntregues:async()=>{}, getQueue:()=>[],getLastSync:()=>'',getFoto:async()=>null,pullPhoto:async()=>null,on(){},onSync(){},onConflict(){},pull:async()=>{},pullCFG:async()=>{},trySync:async()=>{},pronto:async()=>lista,api:previewApi,apiFn:async()=>({ok:true,usuarios:[],configurado:false}),saveOS:o=>{lista=lista.map(x=>x.id===o.id?structuredClone(o):x);},saveCFG(c){Object.assign(cfg,c)},conflitoCFG:()=>null,uuid:()=>crypto.randomUUID(),carimbarMomento(){}};
`;
const boot=`
document.addEventListener('DOMContentLoaded',()=>{
 STATE.user={nome:'PRÉVIA LOCAL · dados fictícios',papel:'admin'};
 document.querySelector('#login-screen').classList.add('hidden');document.querySelector('#app').classList.remove('hidden');
 document.querySelector('#user-badge').textContent=STATE.user.nome;
 document.querySelector('#topbar-logo').src=LOGO_IMPRESILK;
 document.querySelector('#topbar-date').textContent='Sem acesso ao banco de produção';
 aplicarPermissoes();initTabs();initCasa();initPicker();initTopbar();initConflictDialog();renderActiveTab();
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
  const ext=path.extname(name);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'})[ext]);res.end(body);
}).listen(Number(process.env.PORT) || 4201,'127.0.0.1',()=>console.log('Prévia com dados fictícios: http://127.0.0.1:4201'));
