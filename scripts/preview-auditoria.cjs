// Prévia local isolada: dados fictícios, sem config, autenticação ou API real.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const permitidos=new Set(['index.html','equipe.html','app.js','equipe.js','operacao.js','logo.js','styles.css','favicon.svg','icon.svg']);
const fixture=`
const hoje=(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})();
const deslocar=n=>{const d=new Date(hoje+'T12:00:00');d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const base=(id,extra={})=>({id,numero:'T-'+id,cliente:'Cliente de teste '+id,servico:'Fachada e comunicação visual',tipo:'externo',instalacao:{data:hoje,periodo:'Manhã',duracaoDias:1},equipe:['Ana'],veiculo:'Carro 1',liberadoPCP:true,confirmacao:'Confirmado',criadoEm:deslocar(-20)+'T12:00:00',itens:[{descricao:'Painel',qtd:1,pronto:false}],...extra});
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
const AUTH={temCracha:()=>true,listarContas:async()=>({contas:[]})};
const cfg={instaladores:['Ana','Bia'],responsaveis:['Responsável de teste'],gerentes_montagem:[],veiculos:['Carro 1','Carro 2'],ferramentas:[],suprimentos:[],causasRetrabalho:['Erro de medida'],funcionarios:[],niveis:{}};
const STORE={getAllOS:()=>lista,getOS:id=>lista.find(o=>o.id===id),getCFG:()=>cfg,getUser:()=>null,getInstalador:()=>null,getQueue:()=>[],getLastSync:()=>'',getFoto:async()=>null,pullPhoto:async()=>null,on(){},onSync(){},onConflict(){},pull:async()=>{},pullCFG:async()=>{},trySync:async()=>{},pronto:async()=>lista,api:async()=>({ok:true,os:[],total:lista.length}),apiFn:async()=>({ok:true,usuarios:[],configurado:false}),saveOS:o=>{lista=lista.map(x=>x.id===o.id?structuredClone(o):x);},saveCFG(){},uuid:()=>crypto.randomUUID(),carimbarMomento(){}};
`;
const boot=`
document.addEventListener('DOMContentLoaded',()=>{
 STATE.user={nome:'PRÉVIA LOCAL · dados fictícios',papel:'admin'};
 document.querySelector('#login-screen').classList.add('hidden');document.querySelector('#app').classList.remove('hidden');
 document.querySelector('#user-badge').textContent=STATE.user.nome;
 document.querySelector('#topbar-logo').src=LOGO_IMPRESILK;
 document.querySelector('#topbar-date').textContent='Sem acesso ao banco de produção';
 aplicarPermissoes();initTabs();initPicker();initTopbar();initConflictDialog();renderActiveTab();
});`;
http.createServer((req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'none'; form-action 'none'");
  if(name==='fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(fixture);return;}
  if(!permitidos.has(name)){res.writeHead(404);res.end();return;}
  let body=fs.readFileSync(path.join(root,name));
  if(name==='index.html') body=body.toString().replace(/<script src="(?:config|store|auth|frases)\.js"><\/script>/g,'').replace('<script src="operacao.js">','<script src="fixture.js"></script><script src="operacao.js">').replace(/<script>if\('serviceWorker'[^]*?<\/script>/,'');
  if(name==='app.js')body=body.toString().replace("document.addEventListener('DOMContentLoaded', initLogin);",boot);
  const ext=path.extname(name);res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'})[ext]);res.end(body);
}).listen(4178,'127.0.0.1',()=>console.log('Prévia com dados fictícios: http://127.0.0.1:4178'));
