const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const fonte=fs.readFileSync(require('node:path').join(__dirname,'../conferencia-entrega-ui.js'),'utf8');
const base=()=>({id:'teste-atalho',rev:1,retrabalho:false,itens:[{uid:'a',qtde:4}],conferenciasEntrega:[{id:'e1'}],obsTecnicas:'Original fictícia'});
const resposta=()=>({...base(),retrabalho:true,problema:'Placa desalinhada fictícia',etapaOrigem:'Produção',causaRaiz:'Erro de produção',responsavelEtapa:'Setor fictício',dataRetrabalho:'2026-10-21',retrabalhoPerguntado:{resposta:'sim'}});
function ambiente({local=base(),fila=[],permitido=true}={}){
 const salvos=[];const c=vm.createContext({STORE:{getOS:()=>local,getQueue:()=>fila,saveOS:o=>salvos.push(o)},perfPodeEditar:()=>permitido,podeOrigemRetrabalho:()=>permitido,nowISO:()=> '2026-10-21T12:00:00Z',STATE:{user:{nome:'Gestor fictício'}},_modalDraft:{...base(),obsTecnicas:'Rascunho não salvo'},reRenderModalKeepOpen(){}});
 vm.runInContext(fonte,c);return {c,salvos};
}
test('atalho grava só retrabalho e preserva itens, entregas e edições mais recentes',()=>{
 const local={...base(),rev:2,obsTecnicas:'Edição mais recente'};const {c,salvos}=ambiente({local});
 assert.equal(c.confGravarRetrabalho(base(),resposta()),'');assert.equal(salvos.length,1);
 const r=salvos[0];assert.equal(r.retrabalho,true);assert.equal(r.rev,2);assert.equal(r.obsTecnicas,local.obsTecnicas);
 assert.deepEqual(JSON.parse(JSON.stringify(r.itens)),base().itens);assert.deepEqual(JSON.parse(JSON.stringify(r.conferenciasEntrega)),base().conferenciasEntrega);
 assert.equal(local.retrabalho,false);assert.equal(c._modalDraft.retrabalho,true);assert.equal(c._modalDraft.obsTecnicas,'Rascunho não salvo');assert.equal(c._modalDraft.rev,1);
});
test('atalho não grava sem permissão ou com fila pendente',()=>{
 for(const opt of [{permitido:false},{fila:[{os:{id:base().id}}]},{fila:[{action:'setCfg'}]}]){const {c,salvos}=ambiente(opt);assert.ok(c.confGravarRetrabalho(base(),resposta()));assert.equal(salvos.length,0);}
});
test('atalho recusa retrabalho concorrente e O.S. ausente',()=>{
 for(const local of [null,{...base(),rev:2,problema:'Outra pessoa editou'}]){const {c,salvos}=ambiente({local});assert.ok(c.confGravarRetrabalho(base(),resposta()));assert.equal(salvos.length,0);}
});
test('atalho usa a revisão consultada quando o cache é mais antigo e elimina motivo antigo',()=>{
 const b={...base(),rev:3,etapaOrigemMotivo:'Justificativa anterior'};const {c,salvos}=ambiente();assert.equal(c.confGravarRetrabalho(b,resposta()),'');assert.equal(salvos[0].rev,3);assert.equal('etapaOrigemMotivo' in salvos[0],false);
});
