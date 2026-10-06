// Prévia local isolada: dados fictícios, sem config, autenticação ou API real.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const permitidos=new Set(['performance-layout.css','performance-dashboards.js','performance-dashboards.css','ranking.html','ranking.js','ranking.css','privacidade-valores.js','diagnostico-itens.js','relatorios-pcp.js','alertas-sync.js','index.html','equipe.html','manifest.json','app.js','equipe.js','casa.js','performance.js','comissao.js','comissao-ui.js','relatorios-entregas.js','frases.js','operacao.js','operacao-revisao.js','logo.js','styles.css','favicon.svg','icon.svg','divisao.js','regras.js','entrega-item.js','alocacao-ui.js','conferencia-entrega.js','conferencia-entrega-ui.js','controle-entrega-ui.js','lote.js','entregas-os.js','equipe-aguia.webp','equipe-leao.webp','equipe-pantera.webp','equipe-lobo.webp','equipe-tigre.webp','equipe-falcao.webp','equipe-carcara.webp','equipe-onca.webp','equipe-lobo-guara.webp','equipe-touro.webp']);
const fixture=`
const hoje=(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');})();
const deslocar=n=>{const d=new Date(hoje+'T12:00:00');d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const base=(id,extra={})=>({id,rev:1,numero:'T-'+id,cliente:'Cliente de teste '+id,servico:'Fachada e comunicação visual',tipo:'externo',instalacao:{data:hoje,periodo:'Manhã',duracaoDias:1},equipe:['Ana'],veiculo:'Carro 1',liberadoPCP:true,confirmacao:'Confirmado',confEm:hoje+'T08:00:00-03:00',criadoEm:deslocar(-20)+'T12:00:00',itens:[{descricao:'Painel',qtd:1,pronto:false}],...extra});
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
const APP_VERSAO='v151 · prévia fictícia'; const AUTH={dono:()=>({nome:'Ana',papel:'montagem'}),temCracha:()=>true,listarContas:async()=>({contas:[]})};
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
/* A DIVISÃO DA O.S. NA PERFORMANCE (F11): uma entrega com duas equipes
   (Águia e Leão, cada uma com a sua cota) e uma com a divisão desatualizada
   (uma aba antiga trocou a equipe sem mandar a divisão). Fictícias. */
const pvAloc=(grupos,extra={})=>({grupos,por:'Gestor de teste',em:hoje+'T12:00:00',...extra});
const pvAguia=cota=>({equipeId:'eq-aguia',cota,liderId:'900001',membros:[{pessoaId:'900001',papel:'lider',cota:6000},{pessoaId:'900002',papel:'ajudante',cota:4000}]});
lista.push(base('F23',{cliente:'Cliente fictício F23 · duas equipes',instalacao:{data:pvDoMes(22),periodo:'Manhã'},equipe:['900001','900002','900004'],veiculo:'Carro 1',valorTotal:9000,finalizadaEm:pvDoMes(22)+'T15:30:00',finalizadoPor:'Gestor de teste',retornoConf:PV_OK,
 alocacao:pvAloc([pvAguia(6667),{equipeId:'eq-leao',cota:3333,liderId:'900004',membros:[{pessoaId:'900004',papel:'lider',cota:10000}]}])}));
lista.push(base('F24',{cliente:'Cliente fictício F24 · divisão desatualizada',instalacao:{data:pvDoMes(23),periodo:'Tarde'},equipe:['900001','900005'],veiculo:'Carro 1',valorTotal:1500,finalizadaEm:pvDoMes(23)+'T15:30:00',finalizadoPor:'Gestor de teste',retornoConf:PV_OK,
 alocacao:pvAloc([pvAguia(10000)],{desatualizada:true})}));
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
lista.push(base('PARCIAL',{cliente:'Cliente fictício · entrega por itens',numero:'TESTE-PARCIAL',rev:1,valorTotal:18000,equipe:['900001'],finalizadaEm:hoje+'T12:00:00-03:00',entregaLancada:{data:hoje},itens:[{uid:'pv-parcial-a',item:'1',descricao:'Painel de fachada',qtde:'4',subtotal:'12000'},{uid:'pv-parcial-b',item:'2',descricao:'Letreiro da recepção',qtde:'3',subtotal:'8000'}]}));
const parcialFixture=lista.find(o=>o.id==='PARCIAL');
const itemFixture=(i,q)=>({chave:'uid:'+i.uid,identidade:JSON.stringify([String(i.item||''),String(i.descricao||''),String(i.medidas||''),String(i.qtde??i.qtd??''),String(i.unidade||'')]),qtde:q});
parcialFixture.conferenciasEntrega=[{id:'fixture-primeira',dia:deslocar(-1),itens:parcialFixture.itens.map(i=>itemFixture(i,1)),alocacao:pvAloc([pvAguia(10000)]),por:'Gestor fictício',em:hoje+'T09:00:00Z'}];
lista.push(base('ERP-CONFERIR',{rev:1,numero:'TESTE-ERP',cliente:'Baixa ERP fictícia a classificar',finalizadaEm:hoje+'T10:00:00Z',baixaAutoERP:{em:hoje+'T10:00:00Z',status:'ENTREGUE'},valorTotal:4000}));
lista.push({...structuredClone(parcialFixture),id:'PARCIAL-ABERTA',numero:'TESTE-PARCIAL-ABERTA',finalizadaEm:'',entregaLancada:null,cliente:'Parcial sem finalização fictícia'});
lista.push(base('FOTO-ONTEM',{numero:'TESTE-FOTO-ONTEM',cliente:'Foto tardia fictícia · hora real a confirmar',horaSaida:'',saidaEm:'',horaRetorno:'',retornoEm:'',fotosCheckinIds:['foto_FOTO-ONTEM_1780000000000_teste']}));
// A23: duas entregas já conferidas antes de criar a equipe; nenhuma recebe vínculo implícito.
const a23Equipe={id:'eq-aguia-tardia',nome:'Águia criada depois · fictícia',animal:'aguia',cor:'marinho',emblema:'🦅',liderPadraoId:'900010',membros:[{chave:'900010',nome:'José Adilando Rocha'},{chave:'900011',nome:'Lucas Gabriel Souza'}],ativo:true};
cfg.performancePCP.equipes.push(a23Equipe);
const a23OS=base('A23-VINCULO',{numero:'TESTE-A23',cliente:'Entrega avulsa antes do cadastro · fictícia',equipe:['900010','900011'],valorTotal:1000,finalizadaEm:hoje+'T12:00:00Z',itens:[{uid:'a23-item',item:'1',descricao:'Painel fictício A23',qtde:'4',subtotal:'1000'}]});
a23OS.conferenciasEntrega=[1,2].map(n=>({id:'a23-parcial-'+n,dia:hoje,itens:[itemFixture(a23OS.itens[0],1)],alocacao:pvAloc([{equipeId:null,cota:10000,liderId:'900010',membros:[{pessoaId:'900010',papel:'lider',cota:6000},{pessoaId:'900011',papel:'ajudante',cota:4000}]}]),por:'Autor original fictício',em:hoje+'T09:00:00Z'}));
lista.push(a23OS);
lista.push(base('FROTA-A',{numero:'TESTE-FROTA-A',servico:'ADESIVO',equipe:['900001'],veiculo:'Uno fictício',retornoPrevisto:[{dia:hoje,saida:'08:00',hora:'10:00'}]}));
lista.push(base('FROTA-B',{numero:'TESTE-FROTA-B',servico:'adesivo',equipe:['900004'],veiculo:'UNO - 10 fictício',retornoPrevisto:[{dia:hoje,saida:'09:00',hora:'11:00'}]}));
lista.push(base('RETRAB-ORIGINAL',{numero:'TESTE-ORIGINAL',cliente:'Original fictícia para custo',retrabalho:true,dataRetrabalho:hoje,finalizadaEm:hoje+'T12:00:00Z'}));
lista.push(base('RETRAB-CORRECAO',{numero:'TESTE-CORRECAO',cliente:'Correção fictícia sem medição',osOriginal:'TESTE-ORIGINAL',valorTotal:0}));
let pvCfgBase=structuredClone(cfg),pvCfgPendente=null;
const revisoesPreview=[];
async function previewApi(body){
 if(['previewEstado','getCfg','setCfg','performanceVincularEquipe','controleEntrega','delete','restaurarOS','excluidasOS','fotosEvento','conferenciaEntrega'].includes(body.action)||(!new URLSearchParams(location.hash.slice(1)).has('comissao')&&['performancePeriodo','performanceFechamentos','performanceFechar'].includes(body.action))){
  const r=await fetch('/controle-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,seed:lista,pessoas:ELENCO_PREVIA.pessoas,cfg})});const out=await r.json();
  if(out.error)throw new Error(out.error);if(out.lista)lista=out.lista;if(out.cfg){Object.assign(cfg,out.cfg);pvCfgBase=structuredClone(cfg);}return out;
 }

 if(new URLSearchParams(location.hash.slice(1)).has('comissao') && /^(performanceComissao|performancePeriodo|performanceFechamentos|performanceFechar)/.test(body.action))return fetch('/comissao-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
 if(body.action==='conferenciaEntrega'){
  const os=lista.find(o=>o.id===body.osId);if(!os)throw new Error('O.S. de teste não encontrada');
  if(!body.entrega)return {os:structuredClone(os),valor:os.valorTotal};
  if(os.rev!==body.rev)throw new Error('A O.S. mudou. Reabra a conferência.');
  const entregas=(os.conferenciasEntrega||[]).filter(e=>e.id!==body.entrega.id).concat(structuredClone(body.entrega));
  const erro=CONFERENCIA_ENTREGA.validar(os,entregas,hoje);if(erro)throw new Error(erro);
  entregas[entregas.length-1].alocacao={...entregas[entregas.length-1].alocacao,por:'Gestor de teste',em:new Date().toISOString()};os.conferenciasEntrega=entregas;os.rev++;return {ok:true,os:structuredClone(os)};
 }

 if(body.action==='equipeHistorico')return {desdeQuando:'2025-01-01',meses:body.meses.map(m=>({mes:m,total:22+Number(m.slice(5)),porArea:{Acabamento:10,Serralheria:8,'Comercial e Atendimento':8},piso:false}))};
 if(body.action==='relatorioEntregas')return {ano:body.ano,de:body.ano+'-01-01',ate:hoje,consultadoEm:new Date().toISOString(),recebimentosEm:new Date().toISOString(),notas:{entregue:'DADOS FICTÍCIOS: demonstração de entregas.',vendido:'DADOS FICTÍCIOS: O.S. por cadastro.',recebido:'DADOS FICTÍCIOS: pagamentos.',retrabalho:'DADOS FICTÍCIOS: taxa das instalações registradas.',pontualidade:'DADOS FICTÍCIOS: previsão do Mubisys versus entrega efetiva; dias corridos.'},meses:Array.from({length:12},(_,i)=>{
  const mes=body.ano+'-'+String(i+1).padStart(2,'0'),futuro=mes>hoje.slice(0,7),fim=mes===hoje.slice(0,7)?Number(hoje.slice(8)):28;
  const entregas=Array.from({length:80},(_,j)=>{const data=mes+'-'+String(Math.min(fim,10+j%15)).padStart(2,'0');const prev=new Date(data+'T12:00:00Z');prev.setUTCDate(prev.getUTCDate()+(j%3===0?0:j%3===1?-3:2));return {numero:'TESTE-'+(i+1)+'-'+String(j+1).padStart(3,'0'),cliente:'Cliente fictício '+(j+1),data,previsao:j%8===0?'':prev.toISOString().slice(0,10),valor:1500};});
  return {mes,futuro,entregue:i===3?null:120000+i*27000+Math.sin(i)*50000,vendido:180000+i*18000,recebido:140000+i*23000,retrabalho:8-i*.5,baseRetrabalho:40,entregasCarregadas:!futuro,entregasEm:new Date().toISOString(),entregas,vendas:[],retrabalhos:[]};
 })};
 if(body.action==='performancePeriodo'){
  // O mesmo formato do pcp-sync (perfFonte): membro sugerido pelo ID do RH, volta e conferência do carro.
  const nomeRH=n=>(ELENCO_PREVIA.pessoas.find(p=>p.id===n)||{}).nome||n;
  const registros=lista.flatMap(o=>{if(!o.conferenciasEntrega?.length)return [o];const a=CONFERENCIA_ENTREGA.apurar(o,o.valorTotal);return a.entregas.map(e=>({...o,id:o.id+'::entrega:'+e.id,finalizadaEm:e.dia,alocacao:e.alocacao,equipe:DIVISAO.derivarEquipe(e.alocacao),valorTotal:e.valor==null?null:e.valor/100,_parcial:{estadoEntrega:CONFERENCIA_ENTREGA.estado(o,o.valorTotal),osId:o.id,entregaId:e.id,itensEntrega:e.itens,saldoItens:a.saldoItens.length,fracaoOS:a.total>0?e.valor/a.total:0}}));}).filter(o=>o.finalizadaEm && !o.baixaAutoERP && o.tipo!=='interno' && o.finalizadaEm.slice(0,10)>=body.de && o.finalizadaEm.slice(0,10)<=body.ate).map(o=>{
   const p=cfg.performancePCP?.participacoes?.find(p=>p.id===o.id),eq=o.equipe||[];
   /* A mesma régua do servidor (F11): a divisão válida e atual confirma, com
      as equipes dela (equipesDaDivisao); a desatualizada aparece com a marca e
      não confirma, e a não confirmada leva a sugestão (sugestaoApurada: a
      equipe da divisão, ou a da composição na O.S. sem divisão). */
   const aloc=o.alocacao&&typeof o.alocacao==='object'?o.alocacao:null,alocOk=!!aloc&&DIVISAO.alocacaoConfirmada(o),finais=alocOk?DIVISAO.finais(aloc):[];
   const d=alocOk?PERF.equipesDaDivisao(aloc,finais,cfg.performancePCP.equipes):null,um=d?d.unica:null;
   const membros=alocOk?finais.filter(f=>f.cota>0).map(f=>({chave:f.pessoaId,nome:nomeRH(f.pessoaId),percentual:f.cota/100})):(!aloc&&p?.membros) || eq.map((n,i)=>({chave:n,nome:nomeRH(n),percentual:(Math.floor(10000/eq.length)+(i<10000%eq.length?1:0))/100}));
   const confirmado=alocOk || (!aloc && !!p),fonte=alocOk?'alocacao':aloc?(aloc.conferirRH?'alocacao-conferir-rh':'alocacao-desatualizada'):p?'participacao':'sugestao';
   const quem=alocOk?{equipeId:um?um.equipeId:'',equipeNome:um?um.equipeNome:'',emblema:um?um.emblema:'🤝',por:aloc.por||'',em:aloc.em||'',obs:''}:{equipeId:p?.equipeId||'',equipeNome:p?.equipeNome||'',emblema:p?.emblema||'🤝',por:p?.por||'',em:p?.em||'',obs:p?.obs||''};
   return {id:o.id,...(o._parcial||{}),numero:o.numero,cliente:o.cliente,dia:o.finalizadaEm.slice(0,10),valor:typeof o.valorTotal==='number'?o.valorTotal:null,origemValor:'Simulação local',membros,confirmado,fonte,...quem,retrabalho:!!o.retrabalho,retornoConf:o.retornoConf||null,voltou:eq.length>0,volta:[o.finalizadaEm.slice(0,10),String(o.veiculo||'').toLowerCase(),[...eq].sort().join('+')].join('|'),
    ...(confirmado?(d&&d.grupos?{grupos:d.grupos}:{}):PERF.sugestaoApurada(membros,aloc,aloc?DIVISAO.finais(aloc):[],cfg.performancePCP.equipes,m=>m.chave))};
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
ELENCO_PREVIA.pessoas.push({chave:'freela-teste',id:'900020',nome:'Freelancer fictício ativo',freelancer:true,ativo:true,area:'Montagem Externa'});
ELENCO_PREVIA.fichaRH=['admin','pcp'].includes(new URLSearchParams(location.hash.slice(1)).get('papel')||'admin');
ELENCO_PREVIA.ausencias=ELENCO_PREVIA.fichaRH?[{chave:'bia-costa',data:hoje,tipo:'Ausência fictícia'}]:[];
ELENCO_PREVIA.veiculos=[{id:'ativo-uno',nome:'Uno fictício',placa:'TST1A23',lugares:2}];
cfg.vinculosRH=[{apelido:'Bia',id:'900002',chave:'bia-costa',nome:'Beatriz Costa Lima'}];
/* NOMES ANTIGOS VIRAM ID (F12, 30/09/2026): O.S. antigas com o nome que o PCP
   digitava, grafias variantes da mesma pessoa, xarás, "Terceiro" e uma O.S.
   com divisão. Duas O.S. antigas só vêm pelo "Buscar as antigas no servidor".
   Pessoas e O.S. FICTÍCIAS. #aba=performance&rolar=[data-quadro="perf-rh"]
   mostra o quadro; &converter=1 roda a troca (confirmação automática, só aqui). */
ELENCO_PREVIA.pessoas.push(
 {chave:'jose-adilando',id:'900010',nome:'José Adilando Rocha',apelido:'adilsom',area:'Montagem Externa',cargo:'Instalador',ativo:true,foto:''},
 {chave:'lucas-gabriel',id:'900011',nome:'Lucas Gabriel Souza',apelido:'',area:'Montagem Externa',cargo:'Instalador',ativo:true,foto:''},
 {chave:'lucas-natalino',id:'900012',nome:'Lucas Natalino Reis',apelido:'',area:'Montagem Externa',cargo:'Ajudante',ativo:true,foto:''},
 {chave:'adriano-pinheiro',id:'900013',nome:'Adriano Pinheiro Lima',apelido:'',area:'Serralheria',cargo:'Serralheiro',ativo:true,foto:''},
 {chave:'adriano-nunes',id:'900014',nome:'Adriano Nunes Araújo',apelido:'',area:'Serralheria',cargo:'Serralheiro',ativo:true,foto:''});
const pvLegado=(id,dias,equipe,extra={})=>base(id,{numero:'T-'+id,cliente:'Cliente fictício '+id+' · nome antigo',instalacao:{data:deslocar(dias),periodo:'Manhã'},equipe,veiculo:'Carro 2',valorTotal:1800,finalizadaEm:deslocar(dias)+'T16:00:00',finalizadoPor:'Gestor de teste',...extra});
lista.push(pvLegado('G01',-12,['Adlando','Lucas']),pvLegado('G02',-15,['Adilsom','Lucas Gabriel']),pvLegado('G03',-18,['Jose Adilando','Terceiro']),
 pvLegado('G04',-22,['Adriano','Adriano Pinheiro']),pvLegado('G05',-26,['Adriano Nunes','Lucas Natalino']),pvLegado('G06',-30,['Lucas Gabriel Souza','Adilsom']),
 pvLegado('G07',-33,['Adilsom','900011'],{alocacao:{id:'pv-g07',versao:1,grupos:[{equipeId:null,cota:10000,liderId:'900011',membros:[{pessoaId:'900011',papel:'lider',cota:10000}]}],em:deslocar(-33)+'T17:00:00Z'}}));
const pvHist=new Map();
const PV_ANTIGAS=[pvLegado('H01',-95,['Adilsom','Terceiro']),pvLegado('H02',-104,['Lucas Natalino Reis','Ana'])];
lista.push(base('112',{cliente:'Mercado Bairro · teste (equipe por ID)',instalacao:{data:deslocar(1),periodo:'Tarde'},equipe:['900004','Ana'],veiculo:'Carro 1'}));
/* ENTREGA POR ITEM NA FICHA (E4, 30/09/2026): marcas fictícias para ver a
   coluna Entrega, o selo do card e os casos raros (item com problema,
   cancelado, quantidade abaixo do entregue, serviço, O.S. interna, item sem
   descrição e 38 itens). #ficha=E4A abre a ficha no bloco dos itens. */
const pvMarca=(id,tipo,qtde,dia,extra={})=>({id,tipo,...(qtde?{qtde}:{}),dia,via:'gestao',por:'Gestor de teste',em:dia+'T12:00:00Z',...extra});
lista.push(base('E4A',{cliente:'Cliente fictício E4 · entrega parcial',itens:[
 {uid:'E4A:1:1',item:'1',descricao:'Placa ACM 2x1',medidas:'2,00x1,00',qtde:'10',entregas:[pvMarca('pv-e1','entregue',6,deslocar(-2))]},
 {uid:'E4A:2:1',item:'2',descricao:'Adesivo de vitrine',medidas:'1,20x0,80',qtde:'1',entregas:[pvMarca('pv-e2','entregue',1,deslocar(-2))]},
 {uid:'E4A:3:1',item:'3',descricao:'Totem de sinalização',medidas:'0,60x1,80',qtde:'2'},
 {uid:'E4A:4:1',item:'4',descricao:'Lona com estrutura',medidas:'3,00x1,00',qtde:'3',entregas:[pvMarca('pv-e3','problema',0,deslocar(-1),{motivo:'Estrutura amassada no transporte'})]},
 {uid:'E4A:5:1',item:'5',descricao:'Letreiro luminoso',medidas:'2,00x0,40',qtde:'1',entregas:[pvMarca('pv-e4','cancelado',0,deslocar(-1),{motivo:'Cliente desistiu do letreiro'})]},
 {uid:'E4A:6:1',item:'6',descricao:'Faixa de obra',medidas:'5,00x0,90',qtde:'4',manual:true,entregas:[pvMarca('pv-e5','entregue',6,deslocar(-3))]},
 {uid:'E4A:7:1',item:'7',descricao:'Servicos de instalação',qtde:'1'}]}));
lista.push(base('E4B',{cliente:'Cliente fictício E4 · retira na fábrica',tipo:'interno',instalacao:{},equipe:[],itens:[
 {uid:'E4B:1:1',item:'1',descricao:'Banner 3x1',qtde:'3',entregas:[pvMarca('pv-r1','retirado',1,deslocar(-1),{via:'balcao',retirou:'Fulano Fictício'})]},
 {uid:'E4B:2:1',item:'2',descricao:'',qtde:'1'}]}));
lista.push(base('E4C',{cliente:'Cliente fictício E4 · 38 itens',itens:Array.from({length:38},(_,k)=>({uid:'E4C:'+(k+1)+':1',item:String(k+1),descricao:k===6?'':k===7?'Item':'Peça de sinalização '+(k+1),qtde:String(1+(k%4)),...(k%5===0?{entregas:[pvMarca('pv-c'+k,'entregue',1,deslocar(-1))]}:{})}))}));
/* STATUS DA ENTREGA E CANCELAMENTO (F16, 30/09/2026): uma baixa do ERP fora da
   carteira cancelada à mão pela gestão, uma aberta cancelada, uma entregue com
   atraso e retrabalho, e uma em execução com entrega parcial. Fictícias.
   #ficha=S16A&bloco=pcp abre a ficha da cancelada. */
lista.push(base('S16A',{cliente:'Cliente fictício F16 · cancelada à mão',instalacao:{data:deslocar(-6),periodo:'Manhã'},equipe:[],veiculo:'',valorTotal:2350,
 finalizadaEm:deslocar(-3)+'T18:00:00',finalizadoPor:'Mubisys · saiu da carteira aberta',baixaAutoERP:{em:deslocar(-3)+'T18:00:00',status:'FORA DA CARTEIRA ABERTA',carteira:true},
 cancelamento:{ativo:true,motivo:'Cliente cancelou o pedido por telefone',por:'Gestor de teste',em:deslocar(-1)+'T14:00:00'}}));
lista.push(base('S16B',{cliente:'Cliente fictício F16 · aberta cancelada',instalacao:{data:deslocar(3),periodo:'Tarde'},prazoCombinado:{data:deslocar(3),fonte:'agenda'},
 cancelamento:{ativo:true,motivo:'Obra do cliente foi embargada',por:'Gestor de teste',em:hoje+'T09:00:00'}}));
lista.push(base('S16C',{cliente:'Cliente fictício F16 · atraso e retrabalho',instalacao:{data:deslocar(-6),periodo:'Manhã'},prazoCombinado:{data:deslocar(-7),fonte:'agenda'},
 finalizadaEm:deslocar(-5)+'T17:00:00',finalizadoPor:'Gestor de teste',retrabalho:true,problema:'Adesivo descolou na borda'}));
lista.push(base('S16D',{cliente:'Cliente fictício F16 · entrega parcial',instalacao:{data:hoje,periodo:'Manhã',duracaoDias:2},prazoCombinado:{data:hoje,fonte:'agenda'},itens:[
 {uid:'S16D:1:1',item:'1',descricao:'Placa ACM',qtde:'1',entregas:[pvMarca('pv-s1','entregue',1,hoje)]},
 {uid:'S16D:2:1',item:'2',descricao:'Totem',qtde:'1'},{uid:'S16D:3:1',item:'3',descricao:'Adesivo de porta',qtde:'1'}]}));
/* ENTREGA DECLARADA PELO CELULAR (E5, 30/09/2026): o equipe.html (a Ana, no
   celular) com uma placa em parte declarada pela equipe, um totem marcado
   pelo PCP, itens a entregar e o serviço; e a O.S. interna (Retirado). Na
   gestão, #ficha=E5A mostra o selo "declarado pela equipe". Fictícias.
   No celular: equipe.html#ficha=E5A (&parte=E5A:1:1 abre o campo da parte). */
const pvDecl=(id,qtde,dia)=>({id,tipo:'entregue',qtde,dia,via:'toque',declarado:true,por:'Ana',em:dia+'T15:00:00Z'});
lista.push(base('E5A',{cliente:'Cliente fictício E5 · entrega pelo celular',horaSaida:'08:00',saidaEm:hoje+'T08:00:00',fotosCheckinIds:[],itens:[
 {uid:'E5A:1:1',item:'1',descricao:'Placa ACM 2x1',medidas:'2,00x1,00',qtde:'10',statusInst:'',entregas:[pvDecl('pv-d1',6,hoje)]},
 {uid:'E5A:2:1',item:'2',descricao:'Adesivo de vitrine',medidas:'1,20x0,80',qtde:'1'},
 {uid:'E5A:3:1',item:'3',descricao:'Totem de sinalização',medidas:'0,60x1,80',qtde:'2',statusInst:'ok',pronto:true,entregas:[pvMarca('pv-d2','entregue',2,deslocar(-1))]},
 {uid:'E5A:4:1',item:'4',descricao:'Servicos de instalação',qtde:'1'}]}));
lista.push(base('E5B',{cliente:'Cliente fictício E5 · retira na fábrica',tipo:'interno',instalacao:{data:hoje},itens:[
 {uid:'E5B:1:1',item:'1',descricao:'Banner 3x1',qtde:'3'},{uid:'E5B:2:1',item:'2',descricao:'Wind banner',qtde:'1',statusInst:'ok',pronto:true,entregas:[pvDecl('pv-d3',1,hoje)]}]}));
/* FECHAR O DIA (F14, 30/09/2026): o dia de hoje com voltas de verdade.
   Duas O.S. da mesma volta finalizadas no PCP (Carro 3, equipe Lobo, sem
   divisão), uma finalizada pelo celular com itens declarados, e uma aberta
   com 10 placas para marcar a parte. #aba=entregas&lote=dia abre o modo Dia;
   &lote=pendencias, as pendências do mês. Tudo fictício. */
const pvItens=id=>[{uid:id+':1:1',item:'1',descricao:'Placa ACM 2x1',qtde:'10',subtotal:'4000'},{uid:id+':2:1',item:'2',descricao:'Adesivo de vitrine',qtde:'1',subtotal:'600'},{uid:id+':3:1',item:'3',descricao:'Servicos de instalação',qtde:'1',subtotal:'400'}];
lista.push(base('LT1',{cliente:'Cliente fictício LT1 · fachada',equipe:['900005','900008'],veiculo:'Carro 3',valorTotal:3200,saidaEm:hoje+'T08:00:00',horaSaida:'08:00',horaRetorno:'12:30',retornoEm:hoje+'T12:30:00',finalizadaEm:hoje+'T12:40:00',finalizadoPor:'Gestor de teste',itens:pvItens('LT1')}));
lista.push(base('LT2',{cliente:'Cliente fictício LT2 · vitrine',equipe:['900005','900008'],veiculo:'Carro 3',valorTotal:1450,saidaEm:hoje+'T13:00:00',horaSaida:'13:00',horaRetorno:'17:10',retornoEm:hoje+'T17:10:00',finalizadaEm:hoje+'T17:20:00',finalizadoPor:'Gestor de teste',retornoPrevisto:[{dia:hoje,hora:'17:00'}],itens:pvItens('LT2')}));
lista.push(base('LT3',{cliente:'Cliente fictício LT3 · pelo celular',equipe:['900001','900002'],veiculo:'Carro 1',valorTotal:2600,saidaEm:hoje+'T08:30:00',horaSaida:'08:30',horaRetorno:'15:00',retornoEm:hoje+'T15:00:00',finalizadaEm:hoje+'T15:05:00',finalizadoPor:'Ana',finalizadaPorCampo:{finalizadaEm:hoje+'T15:05:00',por:'Ana',em:hoje+'T15:05:10Z'},
 voltaEquipe:{carroLimpo:'sim',carroArrumado:'sim',equipamentosOk:'sim',semAvaria:'sim',por:'Ana',em:hoje+'T15:06:00Z'},
 itens:[{uid:'LT3:1:1',item:'1',descricao:'Placa ACM 2x1',qtde:'10',subtotal:'2000',entregas:[pvDecl('pv-lt3a',6,hoje)]},{uid:'LT3:2:1',item:'2',descricao:'Totem de sinalização',qtde:'2',subtotal:'600'}]}));
lista.push(base('LT4',{cliente:'Cliente fictício LT4 · entrega em partes',equipe:['900004','900007'],veiculo:'Carro 2',valorTotal:5400,saidaEm:hoje+'T07:30:00',horaSaida:'07:30',itens:pvItens('LT4')}));
/* RETORNO ANTECIPADO, OCORRÊNCIAS E ABONOS (F17, 30/09/2026): uma volta de hoje
   com 3 O.S. (Carro 4, a dupla 900001 e 900002) que chegou às 15:40, 50
   minutos antes do retorno previsto da última (16:30), com a conferência da
   volta dizendo que faltou equipamento; e uma O.S. entregue com atraso, já
   abonada (a remarcação pedida pelo cliente), com uma ocorrência registrada.
   #ficha=RA2&bloco=pcp abre a ficha; #aba=entregas&lote=dia&intro=0, o lote.
   Tudo fictício. */
const pvChegada={dia:hoje,hora:'15:40',fonte:'lote',por:'Gestor de teste',em:hoje+'T18:41:00.000Z',recebidoEm:hoje+'T18:41:05.000Z'};
const pvConfFalta={carroLimpo:'sim',carroArrumado:'sim',equipamentosOk:'nao',semAvaria:'sim',obs:'faltou a escada de 6 m',por:'Gestor de teste',em:hoje+'T18:45:00.000Z'};
const pvVoltaRA=(id,cliente,previsto,saida)=>base(id,{cliente,equipe:['900001','900002'],veiculo:'Carro 4',valorTotal:2800,prazoCombinado:{data:hoje,fonte:'agenda'},
 saidaEm:hoje+'T'+saida+':00',horaSaida:saida,horaRetorno:'17:00',retornoEm:hoje+'T17:00:00',finalizadaEm:hoje+'T15:30:00',finalizadoPor:'Gestor de teste',
 retornoPrevisto:[{dia:hoje,hora:previsto,por:'Gestor de teste',em:deslocar(-1)+'T12:00:00Z'}],retornoConferido:pvChegada,retornoConf:pvConfFalta,itens:pvItens(id),
 ocorrencias:[{id:'oc-pv'+id.toLowerCase()+'escada',tipo:'equipamento_faltante',item:'Escada de 6 m',obs:'não voltou no carro',fonte:'volta',dia:hoje,grupo:'vl-previewvolta4',por:'Gestor de teste',em:hoje+'T18:46:00Z'}]});
lista.push(pvVoltaRA('RA1','Cliente fictício RA1 · placa de obra','11:00','08:00'));
lista.push(pvVoltaRA('RA2','Cliente fictício RA2 · fachada em ACM','16:30','13:00'));
lista.push(pvVoltaRA('RA3','Cliente fictício RA3 · adesivagem','14:00','11:30'));
lista.push(base('AB1',{cliente:'Cliente fictício AB1 · remarcado pelo cliente',instalacao:{data:hoje,periodo:'Manhã'},equipe:['900004','900007'],veiculo:'Carro 2',valorTotal:3900,
 prazoCombinado:{data:deslocar(-4),fonte:'agenda'},saidaEm:hoje+'T08:00:00',horaSaida:'08:00',horaRetorno:'11:30',retornoEm:hoje+'T11:30:00',finalizadaEm:hoje+'T11:40:00',finalizadoPor:'Gestor de teste',
 retrabalho:false,abonos:[{id:'ab-preview0001',ocorrenciaId:'AB1:atraso',tipo:'atraso',motivo:'Cliente pediu para remarcar a instalação por telefone',por:'Gestor de teste',em:hoje+'T12:00:00Z'}],
 ocorrencias:[{id:'oc-preview0001',tipo:'equipamento_danificado',item:'Furadeira de impacto',obs:'cabo partido na volta',fonte:'ficha',dia:hoje,por:'Gestor de teste',em:hoje+'T12:05:00Z'}],itens:pvItens('AB1')}));
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
/* 500 O.S. FICTÍCIAS PARA MEDIR A VISTA POR O.S. (F18, 30/09/2026):
   #aba=entregas&vista=poros&muitas=500. Datas do mês corrente até ontem,
   para entrarem no pacote do ERP abaixo. Tudo fictício. */
{const pvN=Number(new URLSearchParams(location.hash.slice(1)).get('muitas'))||0,pvDias=Math.max(1,Number(hoje.slice(8,10))-1);
 for(let i=0;i<pvN;i++){const d=pvDoMes(i%pvDias);lista.push(base('M'+i,{numero:'M-'+String(i).padStart(3,'0'),cliente:'Cliente fictício em massa '+i,instalacao:{data:d,periodo:'Manhã'},equipe:i%3?['900001','900002']:['900004','900007'],veiculo:'Carro '+(1+i%3),valorTotal:300+i,prazoCombinado:{data:i%7?d:pvDoMes(Math.max(0,(i%pvDias)-2)),fonte:'agenda'},saidaEm:d+'T08:00:00',horaSaida:'08:00',finalizadaEm:d+'T15:30:00',finalizadoPor:'Gestor de teste',retornoConf:PV_OK}));}}
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
/* ERP DIZ ENTREGUE, PCP TEM SALDO (E7, 30/09/2026): três O.S. abertas com
   entrega parcial marcada que o ERP deu como encerradas. A E7A foi poupada
   pela baixa (ENTREGUE com data, uma unidade declarada pelo celular); a E7B
   (FINALIZADO sem data de entrega, um item com problema) manda marcar na
   ficha; a E7C saiu da carteira aberta e o pacote de entregues do ERP a traz
   com a data. Aparecem em Entregas para admin e pcp (#aba=entregas). Fictícias. */
const pvItensE7=(id,marcas)=>[1,2,3,4,5].map(k=>({uid:id+':'+k+':1',item:String(k),descricao:['Placa ACM 2x1','Adesivo de vitrine','Totem de sinalização','Lona com estrutura','Letreiro luminoso'][k-1],qtde:k===1?'10':'1',subtotal:'400.00',...(marcas[k]?{entregas:marcas[k]}:{})}));
const pvE7=(id,erp,extra={})=>base(id,{cliente:'Cliente fictício '+id+' · entrega parcial',servico:'Fachada em ACM',instalacao:{data:deslocar(-6),periodo:'Manhã'},horaSaida:'08:00',horaRetorno:'17:00',saidaEm:deslocar(-6)+'T08:00:00',retornoEm:deslocar(-6)+'T17:00:00',...erp,...extra});
lista.push(pvE7('E7A',{erpComSaldo:{status:'ENTREGUE',dataEntregue:deslocar(-3),selo:'ENTREGUE|'+deslocar(-3),desde:deslocar(-2)+'T13:20:00.000Z',em:deslocar(-2)+'T13:20:00.000Z'}},{itens:pvItensE7('E7A',{1:[pvMarca('pv-7a1','entregue',6,deslocar(-6))],2:[pvDecl('pv-7a2',1,deslocar(-6))]})}));
lista.push(pvE7('E7B',{erpComSaldo:{status:'FINALIZADO',dataEntregue:'',selo:'FINALIZADO|',desde:deslocar(-1)+'T13:20:00.000Z',em:deslocar(-1)+'T13:20:00.000Z'}},{itens:pvItensE7('E7B',{1:[pvMarca('pv-7b1','entregue',10,deslocar(-5))],4:[pvMarca('pv-7b4','problema',0,deslocar(-4),{motivo:'Estrutura amassada no transporte'})]})}));
lista.push(pvE7('E7C',{erpSaiuDaCarteiraEm:deslocar(-1)+'T13:20:00.000Z'},{itens:pvItensE7('E7C',{2:[pvMarca('pv-7c2','entregue',1,deslocar(-5))],3:[pvMarca('pv-7c3','entregue',1,deslocar(-5))]})}));
{const d=deslocar(-2);if(PV_ERP[d.slice(0,7)])PV_ERP[d.slice(0,7)].os.push({numero:'T-E7C',cliente:'Cliente fictício E7C · entrega parcial',servico:'Fachada em ACM',data:d,valor:2000,tipo:'externo',previsao:d});}
const STORE={JANELA_LOCAL_DIAS:60,historico:()=>[...pvHist.values()],faixaHistorico:async()=>({de:deslocar(-120),ate:hoje}),
 buscarHistorico:async q=>{const itens=PV_ANTIGAS.filter(o=>(!q.de||o.finalizadaEm.slice(0,10)>=q.de)&&(!q.ate||o.finalizadaEm.slice(0,10)<=q.ate));for(const o of itens)pvHist.set(o.id,structuredClone(o));return {itens,truncou:false};},
 getAllOS:()=>lista,getOS:id=>lista.find(o=>o.id===id)||pvHist.get(id)||null,getCFG:()=>cfg,getUser:()=>null,getInstalador:()=>null,elenco:()=>ELENCO_PREVIA, valores:()=>({}), pullValores:async()=>{}, pullElenco:async()=>true, entreguesMes:m=>PV_ERP[m]||null, pullEntreguesMes:async()=>{}, anosEntregues:()=>[2026], carregarTudoEntregues:async()=>{}, getQueue:()=>pvCfgPendente?[{action:'setCfg'}]:[],getLastSync:()=>'',getFoto:async()=>null,pullPhoto:async()=>null,on(){},onSync(){},onConflict(){},pull:async()=>{},pullCFG:async()=>false,trySync:async()=>{if(pvCfgPendente){const p=pvCfgPendente;await previewApi({action:'setCfg',cfg:p,baseCfg:pvCfgBase});pvCfgPendente=null;}},pronto:async()=>lista,api:previewApi,conferirNomes:async(nomes,ids)=>{const r=OPERACAO.resolverPessoas({pessoas:[...ELENCO_PREVIA.pessoas,...ELENCO_PREVIA.antigos],vinculos:cfg.vinculosRH,lista:cfg.instaladores});return {nomes:nomes.map(n=>({nome:n,id:r.idDe(n),fixado:r.fixado(n)})),os:Object.fromEntries(ids.map(i=>[i,'viva'])),fechados:[]};},apiFn:async()=>({ok:true,usuarios:[],configurado:false}),saveOS:o=>{if(pvHist.has(o.id))pvHist.set(o.id,structuredClone(o));lista=lista.map(x=>x.id===o.id?structuredClone(o):x);},saveCFG(c){pvCfgPendente=structuredClone(c);Object.assign(cfg,c)},conflitoCFG:()=>null,uuid:()=>crypto.randomUUID(),carimbarMomento(){},
 /* o que o celular (equipe.html) chama */ setInstalador(){},setUser(){},limparCache(){},avisosEntregas:()=>[],dispensarAvisoEntregas(){},delFotoSync(){}};
`;
const boot=`
document.addEventListener('DOMContentLoaded',async()=>{
 await previewApi({action:'previewEstado'});
 STATE.user={nome:'PRÉVIA LOCAL · dados fictícios',papel:new URLSearchParams(location.hash.slice(1)).get('papel')||'admin'};
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
 // &lote=dia ou &lote=pendencias abre o Fechar o dia (F14) nesse modo.
 if(pv.get('relatorios'))STATE._entAba='relatorios';
 if(pv.get('lote')){STATE._entAba='lote';STATE._loteModo=pv.get('lote');}
 // &intro=0 dá o quadro do primeiro uso por lido; &itens=LT4 abre os itens da linha; &rolar= desce até o seletor.
 if(pv.get('intro')==='0')try{localStorage.setItem('impresilk_lote_intro_visto|'+STATE.user.nome,'1');}catch(e){}
 if(pv.get('itens'))setTimeout(()=>{LOTE.executar({acao:'itens',os:pv.get('itens')});LOTE.render();},600);
 // &vista=poros abre Entregas na vista Por O.S. (F18); &abrir=RA2,AB1 abre a linha do tempo dessas; &status= e &busca= filtram.
 if(pv.get('vista'))STATE._entVista=pv.get('vista');
 if(pv.get('abrir')||pv.get('status')||pv.get('busca'))STATE._porOS={status:pv.get('status')||'',equipe:pv.get('equipe')||'',busca:pv.get('busca')||'',abertas:(pv.get('abrir')||'').split(',').filter(Boolean)};
 const pvAba=pv.get('aba')&&document.querySelector('.tab[data-tab="'+pv.get('aba')+'"]:not([data-vista])');
 if(pvAba)pvAba.click();
 // &posicao=1 escreve no título onde cada pedaço de Entregas começa (para recortar a foto sem rolar a página).
 if(pv.get('posicao'))document.title=JSON.stringify(Object.fromEntries(['.ent-kpis','#ent-kpi-poros','.ent-controles','#ent-poros','.poros-grade','.poros-tl[open]'].map(q=>{const e=document.querySelector(q);return [q,e?Math.round(e.getBoundingClientRect().top+scrollY):null];}).concat([['largura',[document.documentElement.scrollWidth,document.documentElement.clientWidth]]])));
 // &medir=1 (com &vista=poros&muitas=500): mede cada toque da vista Por O.S. com o DOM de verdade e escreve o resultado no topo da página (F18).
 if(pv.get('medir')&&document.getElementById('ent-poros')){const sec=()=>document.getElementById('ent-poros'),r={};
  const med=(n,f,k=7)=>{const ts=[];for(let i=0;i<k;i++){const t0=performance.now();f(i);document.body.offsetHeight;ts.push(performance.now()-t0);}ts.sort((a,b)=>a-b);r[n]={mediana:+ts[k>>1].toFixed(1),pior:+ts[k-1].toFixed(1)};};
  med('pintura completa',()=>renderEntregas(),3);
  med('chip de status',i=>sec().querySelector(i%2?'[data-poros-status=""]':'[data-poros-status="no_prazo"]').click());
  med('equipe',i=>{const x=sec().querySelector('#poros-equipe');x.value=i%2?'':'eq-aguia';x.dispatchEvent(new Event('change'));});
  med('busca, uma letra',i=>{const x=sec().querySelector('#poros-busca');x.value=['M','M-','M-1','M-12','M-1','M-',''][i];x.dispatchEvent(new Event('input'));});
  med('mostrar mais',()=>{const b=sec().querySelector('[data-poros-mais]');if(b)b.click();},5);
  med('abrir a linha do tempo',()=>{const d=[...sec().querySelectorAll('details.poros-tl')].find(x=>!x.open);d.open=true;d.dispatchEvent(new Event('toggle'));});
  r.os=_porOSDados.total;r.cartoes=sec().querySelectorAll('.poros-card').length;document.body.insertAdjacentHTML('afterbegin','<pre id="pv-medida">'+JSON.stringify(r)+'</pre>');}
 if(pv.get('base'))setTimeout(()=>{const d=document.querySelector('[data-quadro="perf-base"]');if(d)d.open=true;},900);
 // &tv=1 abre o Modo TV no painel das equipes; &tv=2 no das pessoas.
 if(pv.get('tv'))setTimeout(()=>{abrirTVCasa();for(let i=1;i<Number(pv.get('tv'));i++)document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight'}));},1200);
 // &ficha=E4A abre a ficha dessa O.S. (no bloco &bloco=, padrão itens); &papel=operacao entra como operação.
 if(pv.get('conferir'))setTimeout(()=>conferirItensEntrega(pv.get('conferir')).catch(e=>toast(e.message,'error')),500);
 if(pv.get('ficha'))setTimeout(()=>{openModal(STORE.getOS(pv.get('ficha')),pv.get('bloco')||'itens');},700);
 if(pv.get('rolar'))setTimeout(()=>{const alvo=document.querySelector(pv.get('rolar'));if(alvo)alvo.scrollIntoView({block:'start'});},900);
 // &tarde=<seletor> rola até o elemento depois que o lote abriu (o rascunho pode levar até 3 s) (F17).
 if(pv.get('tarde')){let n=0;const t=setInterval(()=>{const a=document.querySelector(pv.get('tarde'));if(a||++n>60){clearInterval(t);if(a){a.scrollIntoView({block:'start'});window.scrollBy(0,-Number(pv.get('acima')||0));}}},250);}
 // &naFicha=<seletor> rola a ficha aberta até o elemento, abaixo do cabeçalho preso (F17).
 if(pv.get('naFicha'))setTimeout(()=>{const m=document.querySelector('#modal-os'),a=m&&m.querySelector(pv.get('naFicha')),h=m&&m.querySelector('.modal-header');if(a){m.scrollTop+=a.getBoundingClientRect().top-m.getBoundingClientRect().top-(h?h.offsetHeight:0)-8;}},1100);
 // &antigas=1 busca as O.S. antigas; &converter=1 grava o ID (a confirmação responde sim, só na prévia).
 if(pv.get('antigas')||pv.get('converter'))setTimeout(async()=>{if(pv.get('antigas'))await buscarAntigasConferenciaCasa();if(pv.get('converter')){window.confirm=()=>true;await iniciarConversaoNomesCasa(null);}const alvo=pv.get('rolar')&&document.querySelector(pv.get('rolar'));if(alvo)alvo.scrollIntoView({block:'start'});},1000);
});`;
/* O CELULAR NA PRÉVIA: a Ana entra pelo crachá fictício do fixture (AUTH.dono);
   #ficha=E5A abre a ficha no bloco dos itens (&bloco= outro bloco, &desce=px
   rola mais), &parte=<código do item> abre o campo "Entregar parte". Só
   existe aqui, com dados fictícios. */
const bootEquipe=`
document.addEventListener('DOMContentLoaded', () => {
 STORE.getInstalador=()=>'Ana';
 initSelect();
 // Sem timer: o fixture responde na hora, e a foto sem janela não espera timer de iframe.
 const pv=new URLSearchParams(location.hash.slice(1));
 if(!pv.get('ficha'))return;
 openModal(STORE.getOS(pv.get('ficha')));
 if(pv.get('parte')){EQ.parte='u:'+pv.get('parte');reRender();}
 // O cabeçalho da ficha fica preso no topo: rola até o bloco e devolve a altura dele.
 const b=document.querySelector('#modal-os [data-bloco="'+(pv.get('bloco')||'itens')+'"]'),m=document.querySelector('#modal-os'),h=document.querySelector('#modal-os .modal-header');
 if(b&&m){b.scrollIntoView({block:'start'});m.scrollTop+=Number(pv.get('desce')||0)-(h?h.offsetHeight:0)-8;}
});`;
const comissaoPreview=require('./preview-comissao-fixture.cjs');
const controlePreview=require('./preview-controle-fixture.cjs');
const rankingPreview=require('./preview-ranking-fixture.cjs');
http.createServer(async(req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; form-action 'none'");
  if(name==='ranking-fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(rankingPreview.script);return;}
  if(name==='ranking-api' && req.method==='POST'){
    try{let json='';for await(const chunk of req){json+=chunk;if(json.length>20000)throw new Error('Pedido grande demais.');}
      const out=await rankingPreview.handler(JSON.parse(json),req.headers.authorization);res.statusCode=out.status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(out.body));
    }catch(e){res.writeHead(500);res.end(JSON.stringify({error:e.message}));}return;
  }
  if(['comissao-api','controle-api'].includes(name) && req.method==='POST'){
    try{let json='';for await(const chunk of req){json+=chunk;if(json.length>300000)throw new Error('Pedido grande demais.');}const out=await (name==='controle-api'?controlePreview:comissaoPreview)(JSON.parse(json));res.setHeader('Content-Type','application/json');res.end(JSON.stringify(out));}catch(e){res.writeHead(500);res.end(JSON.stringify({error:e.message}));}return;
  }
  if(name==='fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(fixture);return;}
  if(!permitidos.has(name)){res.writeHead(404);res.end();return;}
  let body=fs.readFileSync(path.join(root,name));
  if(name==='index.html') body=body.toString().replace(/<script src="(?:config|store|auth)\.js(?:\?[^\"]*)?"><\/script>/g,'').replace(/<script src="operacao.js(?:\?[^"]*)?">/,'<script src="fixture.js"></script><script src="operacao.js">').replace(/<script>(?:if\('serviceWorker'|\s*\/\*\s*Service worker)[^]*?<\/script>/,'');
  if(name==='ranking.html')body=body.toString().replace(/<script src="(?:config|auth)\.js(?:\?[^"]*)?"><\/script>/g,'').replace(/<script src="ranking.js/, '<script src="ranking-fixture.js"></script><script src="ranking.js');
  if(name==='app.js')body=body.toString().replace("document.addEventListener('DOMContentLoaded', initLogin);",boot);
  if(name==='equipe.html') body=body.toString().replace(/<script src="(?:config|store|auth)\.js(?:\?[^\"]*)?"><\/script>/g,'').replace(/<script src="operacao.js(?:\?[^"]*)?">/,'<script src="fixture.js"></script><script src="operacao.js">').replace(/<script>\s*\/\*\s*Service worker[^]*?<\/script>/,'');
  if(name==='equipe.js')body=body.toString().replace("document.addEventListener('DOMContentLoaded', initSelect);",bootEquipe);
  const ext=path.extname(name);res.setHeader('Content-Type',({'.json':'application/manifest+json','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp'})[ext]);res.end(body);
}).listen(Number(process.env.PORT) || 4201,'127.0.0.1',()=>console.log('Prévia com dados fictícios: http://127.0.0.1:'+(Number(process.env.PORT)||4201)));
