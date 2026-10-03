const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const C=require('../conferencia-entrega.js');
const D=require('../divisao.js');
const {edge}=require('./helpers/edge.cjs');
const copia=x=>structuredClone(x);
const osBase=()=>({id:'teste-parcial',numero:'99991',rev:1,tipo:'externo',cliente:'Cliente fictício',valorTotal:8500,equipe:['100001'],finalizadaEm:'2026-09-25T15:00:00Z',entregaLancada:{data:'2026-09-25'},itens:[{uid:'a',item:'1',descricao:'Painel A',qtde:'4',subtotal:'5000'},{uid:'b',item:'2',descricao:'Painel B',qtde:'1',subtotal:'5000'}]});
const aloc=id=>D.montar([{equipeId:null,liderId:id,membros:[id]}]);
const selecao=(os,n,qtde)=>{const i=C.catalogo(os)[n];return {chave:i.chave,identidade:i.identidade,qtde};};
const entrega=(os,id='e1',dia='2026-09-25',itens=[selecao(os,0,2)],pessoa='100001')=>({id,dia,itens,alocacao:aloc(pessoa)});
const gestor={papel:'pcp',nome:'Gestor Teste',sub:'gestor'};
const db=os=>({pcp_registros:[{id:os.id,colecao:'os',registro:os,apagado:false,atualizado_em:'2026-09-25T16:00:00Z'}],painel_ordens:[{numero:os.numero,valor:8500}],registros:[{id:'ana',colecao:'colaboradores',apagado:false,registro:{nome:'Ana Fictícia',cpf:'10000111111'}},{id:'bia',colecao:'colaboradores',apagado:false,registro:{nome:'Bia Fictícia',cpf:'10000222222'}}]});
// O banco em memória responde no mesmo milissegundo. Deixa o relógio passar
// da gravação para testar a leitura subsequente, sem disparar a trava de corrida.
const salvar=async(e,os,ent,rev=os.rev,who=gestor)=>{const r=await e.call({action:'conferenciaEntrega',osId:os.id,rev,entrega:ent},who);await new Promise(ok=>setTimeout(ok,3));return r;};
const periodo={action:'performancePeriodo',de:'2026-09-01',ate:'2026-09-30'};

test('cópias do motor são idênticas no navegador e servidor',()=>{
 const front=fs.readFileSync('conferencia-entrega.js','utf8').replace('const CONFERENCIA_ENTREGA =','export const CONFERENCIA_ENTREGA =').replace("if (typeof module !== 'undefined') module.exports = CONFERENCIA_ENTREGA;",'');
 assert.equal(fs.readFileSync('supabase/functions/_shared/pcp-conferencia-entrega.mjs','utf8').trimEnd(),("import { ENTREGA_ITEM } from './pcp-entrega-item.mjs';\n"+front).trimEnd());
});
test('desconto proporcional, equipes diferentes e saldo exato: 2125 + 6375 = 8500',()=>{
 const os=osBase();os.conferenciasEntrega=[entrega(os),entrega(os,'e2','2026-09-26',[selecao(os,0,2),selecao(os,1,1)],'100002')];
 const a=C.apurar(os,8500);assert.equal(a.erro,'');assert.deepEqual(a.entregas.map(e=>e.valor),[212500,637500]);assert.equal(a.saldo,0);assert.equal(a.saldoItens.length,0);
});
test('última fração recebe centavo restante',()=>{
 const os={itens:[{uid:'u',qtde:3,subtotal:100}],valorTotal:100};
 const es=[1,2,3].map(n=>entrega(os,'e'+n,'2026-09-2'+n,[selecao(os,0,1)]));
 assert.deepEqual(C.apurar(os,100,es).entregas.map(e=>e.valor),[3333,3333,3334]);
});
test('rejeita repetição, excesso de quantidade, data futura e mudança de identidade',()=>{
 const os=osBase(),e=entrega(os);assert.match(C.validar(os,[e,{...e,id:'e2',itens:[selecao(os,0,3)]}]),/saldo/);
 assert.match(C.validar(os,[e,e]),/repetido/);
 assert.match(C.validar(os,[{...e,itens:[e.itens[0],e.itens[0]]}]),/duas vezes/);
 assert.match(C.validar(os,[{...e,dia:'2026-02-30'}]),/data/);
 assert.match(C.validar(os,[e],'2026-09-24'),/data/);
 os.itens[0].descricao='Outro painel';assert.match(C.validar(os,[e]),/mudou/);
});
test('sem UID usa identidade única, nunca número de posição; duplicatas são bloqueadas',()=>{
 const os=osBase();os.itens.forEach(i=>delete i.uid);const e=entrega(os);os.itens.reverse();assert.equal(C.validar(os,[e]),'');
 os.itens.push(copia(os.itens[1]));assert.match(C.validar(os,[e]),/identificado/);
});
test('subtotal ausente não cria rateio inventado e quantidade fracionada só permite lote inteiro',()=>{
 const os=osBase();delete os.itens[1].subtotal;assert.equal(C.apurar(os,8500,[entrega(os)]).entregas[0].valor,null);
 os.itens[0].qtde='4,5 m²';assert.equal(C.catalogo(os)[0].qtde,1);assert.match(C.validar(os,[entrega(os)]),/Quantidade/);
});
test('servidor salva duas equipes em dias diferentes e Performance usa só os valores selecionados',async()=>{
 const os=osBase(),e=await edge('pcp-sync',db(os));
 const r=await salvar(e,os,entrega(os));assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.ok,true);assert.equal(r.os.rev,2);
 assert.deepEqual(r.os.equipe,os.equipe,'não troca a equipe operacional');assert.equal(r.os.finalizadaEm,os.finalizadaEm);
 let p=await e.call(periodo,gestor);assert.equal(p.registros.length,1);assert.equal(p.registros[0].valor,2125);assert.equal(p.registros[0].confirmado,true);assert.equal(p.registros[0].osId,os.id);assert.equal(p.registros[0].fracaoOS,.25);
 const r2=await salvar(e,os,entrega(os,'e2','2026-09-26',[selecao(os,0,2),selecao(os,1,1)],'100002'),2);assert.equal(r2.status,200,JSON.stringify(r2));
 p=await e.call(periodo,gestor);assert.deepEqual(p.registros.map(x=>[x.dia,x.valor,x.membros[0].chave]),[['2026-09-25',2125,'100001'],['2026-09-26',6375,'100002']]);
 assert.equal(e.db.pcp_registros.filter(x=>x.colecao==='auditoria').length,2);
});
test('O.S. aberta com parcial entra no dia conferido, sem finalização implícita do restante',async()=>{
 const os=osBase();delete os.finalizadaEm;delete os.entregaLancada;const e=await edge('pcp-sync',db(os));
 assert.equal((await salvar(e,os,entrega(os))).status,200);
 const p=await e.call(periodo,gestor);assert.equal(p.registros.length,1);assert.equal(p.registros[0].valor,2125);assert.equal(p.registros[0].saldoItens,2);
 const row=e.db.pcp_registros.find(x=>x.colecao==='os');assert.equal(row.registro.finalizadaEm,undefined);
});
test('permissão, versão e quantidade são conferidas no servidor',async()=>{
 const os=osBase(),e=await edge('pcp-sync',db(os));
 for(const who of ['machine',{papel:'operacao'},{papel:'montagem',montagemIndividual:true}])assert.equal((await salvar(e,os,entrega(os),1,who)).status,403);
 assert.equal((await salvar(e,os,entrega(os),0)).status,409);
 assert.equal((await salvar(e,os,entrega(os))).status,200);
 const demais=entrega(os,'e2','2026-09-26',[selecao(os,0,3)]);const r=await salvar(e,os,demais,2);assert.equal(r.status,422);assert.match(r.error,/saldo/);
});
test('reordenação preserva valores e modificação do produto impede crédito silencioso',async()=>{
 const os=osBase();os.conferenciasEntrega=[entrega(os)];const e=await edge('pcp-sync',db(os));
 e.db.pcp_registros[0].registro.itens.reverse();let p=await e.call(periodo,gestor);assert.equal(p.registros[0].valor,2125);
 e.db.pcp_registros[0].registro.itens[1].descricao='Mudou';p=await e.call(periodo,gestor);assert.equal(p.registros[0].valor,null);assert.equal(p.registros[0].confirmado,false);assert.match(p.registros[0].erroConferencia,/mudou/);
});
test('atualização de cliente antigo não apaga ou injeta conferências',async()=>{
 const os=osBase();os.conferenciasEntrega=[entrega(os)];const e=await edge('pcp-sync',db(os));const antigo=copia(os);delete antigo.conferenciasEntrega;antigo.obs='Nota nova';
 const r=await e.call({action:'upsert',os:antigo},gestor);assert.equal(r.status,200,JSON.stringify(r));assert.deepEqual(r.os.conferenciasEntrega,os.conferenciasEntrega);
});
test('corrida entre duas conferências não sobrescreve a primeira',async()=>{
 const os=osBase(),e=await edge('pcp-sync',db(os));e.cliente.beforeWrite=(b,t)=>{if(t==='pcp_registros') b.pcp_registros[0].atualizado_em='2026-09-25T20:00:00Z';};
 const r=await salvar(e,os,entrega(os));assert.equal(r.status,409);assert.equal(e.db.pcp_registros[0].registro.conferenciasEntrega,undefined);
});

test('duas parciais da mesma O.S. somam uma O.S. equivalente também na nota de produção',()=>{
 const P=require('../performance.js');
 const regs=[{id:'a',valor:2125,fracaoOS:.25,confirmado:true,voltou:false,membros:[{chave:'ana',nome:'Ana',percentual:100}]},{id:'b',valor:6375,fracaoOS:.75,confirmado:true,voltou:false,membros:[{chave:'bia',nome:'Bia',percentual:100}]}];
 const r=P.avaliar(regs,{producao:100,limpeza:0,equipamentos:0});
 assert.equal(r.pessoas.find(p=>p.chave==='ana').peso,.25);
 assert.equal(r.pessoas.find(p=>p.chave==='bia').peso,.75);
 assert.equal(P.resumir(regs).pessoas.reduce((s,p)=>s+p.equivalentes,0),1);
});
test('tela antiga não fecha parciais; revisão salva preserva itens, equipes e valores após edição',async()=>{
 const os=osBase(),e=await edge('pcp-sync',db(os));await salvar(e,os,entrega(os));
 const p=await e.call(periodo,gestor), fechar={...periodo,action:'performanceFechar',hash:p.hash,anterior:'',requestId:'teste-parcial-fechar-01',motivo:'Conferência de teste',leGrupos:true};
 const velho=await e.call(fechar,gestor);assert.equal(velho.status,422);assert.match(velho.error,/itens/);
 const f=await e.call({...fechar,leEntregasItens:true},gestor);assert.equal(f.status,200,JSON.stringify(f));
 const alterada=entrega(os,'e1','2026-09-26',[selecao(os,0,1)],'100002');alterada.alocacao.em=e.db.pcp_registros[0].registro.conferenciasEntrega[0].alocacao.em;
 assert.equal((await salvar(e,os,alterada,2)).status,200);
 const atual=await e.call(periodo,gestor);assert.equal(atual.registros.length,1);assert.equal(atual.registros[0].valor,1062.5);assert.equal(atual.registros[0].membros[0].chave,'100002');
 const hist=await e.call({...periodo,action:'performanceFechamentos'},gestor);assert.deepEqual(hist.fechamentos[0],f.fechamento);
});
test('prévia e apuração usam a mesma base monetária; subtotal sem líquido não inventa desconto',async()=>{
 for(const valor of ['8.500,00',null,-1]){
  const os=osBase();os.valorTotal=valor;os.conferenciasEntrega=[entrega(os)];const dados=db(os);dados.painel_ordens=[];
  const e=await edge('pcp-sync',dados),abrir=await e.call({action:'conferenciaEntrega',osId:os.id},gestor),p=await e.call(periodo,gestor);
  assert.equal(abrir.valor,valor==='8.500,00'?8500:null);
  assert.equal(p.registros[0].valor,valor==='8.500,00'?2125:null);
 }
});
test('cada parcela entra no próprio mês e não herda inspeção de outra equipe ou dia',async()=>{
 const os=osBase();os.retornoEm='2026-09-25T15:00:00Z';os.retornoConf={carroLimpo:'nao',equipamentosOk:'nao'};
 os.conferenciasEntrega=[entrega(os),entrega(os,'e2','2026-08-31',[selecao(os,0,1)],'100002')];
 const e=await edge('pcp-sync',db(os)),set=await e.call(periodo,gestor),ago=await e.call({action:'performancePeriodo',de:'2026-08-01',ate:'2026-08-31'},gestor);
 assert.equal(set.registros.length,1);assert.equal(set.registros[0].valor,2125);assert.equal(set.registros[0].retornoConf.carroLimpo,'nao');
 assert.equal(ago.registros.length,1);assert.equal(ago.registros[0].valor,1062.5);assert.equal(ago.registros[0].retornoConf,null);assert.equal(ago.registros[0].voltou,false);
});

test('subtotais brasileiros preservam a mesma parcela e líquido negativo não vira comissão',()=>{
 const os=osBase();os.itens.forEach(i=>i.subtotal='5.000,00');
 assert.equal(C.apurar(os,8500,[entrega(os)]).entregas[0].valor,212500);
 assert.equal(C.apurar(os,-1,[entrega(os)]).entregas[0].valor,null);
});

test('celular da montagem e acesso por toque não recebem a divisão; operação não recebe o ID do autor',async()=>{
 const {podarToque,podarAlocacao,podarIdsAlocacao}=await import('../supabase/functions/_shared/pcp-integridade.mjs');
 const os=osBase();const e={...entrega(os),porId:'123456'};e.alocacao.porId='123456';os.conferenciasEntrega=[e];
 assert.equal(podarToque(os).conferenciasEntrega,undefined);
 assert.equal(podarAlocacao(os).conferenciasEntrega,undefined);
 const limitado=podarIdsAlocacao(os);assert.equal(limitado.conferenciasEntrega[0].porId,undefined);assert.equal(limitado.conferenciasEntrega[0].alocacao.porId,undefined);
 assert.equal(os.conferenciasEntrega[0].porId,'123456');
});
test('atualização do ERP preserva as conferências e não remapeia itens silenciosamente',async()=>{
 const {atualizarOrigemERP}=await import('../supabase/functions/_shared/pcp-integridade.mjs');
 const os=osBase();delete os.finalizadaEm;os.origemMubisys=true;os.conferenciasEntrega=[entrega(os)];
 const r=atualizarOrigemERP(os,{valorTotal:9000,itens:[{uid:'outro',descricao:'Resposta diferente'}]},'2026-09-27T12:00:00Z');
 assert.deepEqual(r.registro.conferenciasEntrega,os.conferenciasEntrega);assert.deepEqual(r.registro.itens,os.itens);
});
