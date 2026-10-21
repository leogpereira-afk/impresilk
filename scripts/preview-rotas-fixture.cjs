// Apenas o servidor de revisão serve este adaptador. Nenhum acesso à API de O.S.
const fs=require('node:fs'),path=require('node:path');
module.exports=()=>{
 const dados=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/rotas-vias-exemplo.json'),'utf8'));
 return `
 const ROTA_EXEMPLO=${JSON.stringify(dados)};
 const PCP_ROTAS_LOCAIS={
 'ROTA-A':{endereco:'Centro, Montes Claros · exemplo',lng:ROTA_EXEMPLO.pontos[1][0],lat:ROTA_EXEMPLO.pontos[1][1],confirmado:true},
 'ROTA-B':{endereco:'Zona norte, Montes Claros · exemplo',lng:ROTA_EXEMPLO.pontos[2][0],lat:ROTA_EXEMPLO.pontos[2][1],confirmado:true},
 'ROTA-C':{endereco:'Bocaiúva · exemplo de outra cidade',lng:ROTA_EXEMPLO.pontos[3][0],lat:ROTA_EXEMPLO.pontos[3][1],confirmado:true}};
 const pontoExemplo=p=>{const i=ROTA_EXEMPLO.pontos.findIndex(x=>Math.abs(x[0]-Number(p.lng))<.00001&&Math.abs(x[1]-Number(p.lat))<.00001);if(i<0)throw new Error('A demonstração calcula apenas os quatro locais de exemplo. O provedor real ainda precisa ser configurado.');return i;};
 const PCP_ROTAS_PROVEDOR={
 async calcular(pontos){await new Promise(r=>setTimeout(r,150));const legs=[],geometry=[];for(let i=1;i<pontos.length;i++){const a=pontoExemplo(pontos[i-1]),b=pontoExemplo(pontos[i]);if(a===b){legs.push({distance:0,duration:0});geometry.push(ROTA_EXEMPLO.pontos[a]);continue;}const t=ROTA_EXEMPLO.trechos[a+'-'+b];legs.push({distance:t.distance,duration:t.duration});geometry.push(...t.geometry);}return {legs,geometry,fonte:ROTA_EXEMPLO.fonte,demonstracao:true};},
 async matriz(pontos){return pontos.map(a=>pontos.map(b=>{const i=pontoExemplo(a),j=pontoExemplo(b);return i===j?0:ROTA_EXEMPLO.trechos[i+'-'+j].duration;}));}
 };
 function prepararRotasPrevia(){
 for(const [i,id] of ['ROTA-A','ROTA-B','ROTA-C'].entries())lista.push(base(id,{numero:'DEMO-'+(i+1),cliente:['Loja Aurora · fictícia','Clínica Jardim · fictícia','Mercado Horizonte · fictício'][i],servico:['Entrega de letreiro','Instalação de placa','Entrega de painéis'][i],endereco:PCP_ROTAS_LOCAIS[id].endereco,equipe:['900001','900002'],veiculo:'Utilitário de demonstração'}));
 const p=rotaEstado();p.nome='Rota Norte · demonstração';p.equipe='eq-aguia';p.motorista='Motorista de demonstração';p.veiculo='Utilitário de demonstração';p.origem={endereco:'Montes Claros · saída de exemplo',lng:ROTA_EXEMPLO.pontos[0][0],lat:ROTA_EXEMPLO.pontos[0][1],confirmado:true};p.consumo='10';p.preco='6,20';
 for(const id of ['ROTA-A','ROTA-B','ROTA-C']){const o=lista.find(x=>x.id===id);p.paradas.push({id,numero:o.numero,cliente:o.cliente,...PCP_ROTAS_LOCAIS[id],servicoMin:id==='ROTA-B'?'45':'20'});}
 }
 `;
};
