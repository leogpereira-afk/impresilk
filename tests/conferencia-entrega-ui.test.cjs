const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function tela(os,ref=os,fechada=false){
 const chamadas=[],c={console,STORE:{getOS:()=>os}};vm.createContext(c);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../performance.js'),'utf8'),c);
 c.perfPodeEditar=()=>true;c.perfFonteAtual=()=>fechada?{fechadoEm:'2026-10-01'}:null;
 c.perfOS=()=>ref;c.ALOCUI={};c.conferirItensEntrega=async(...args)=>chamadas.push(args);
 return {c,chamadas};
}
test('Conferir da Performance abre diretamente os itens da O.S. antes de atribuir o total',async()=>{
 const {c,chamadas}=tela({id:'os1',numero:'9001',itens:[{uid:'a',descricao:'Fachada',qtde:4}],equipe:['100001']});
 await c.perfEditarParticipacao('os1');assert.deepEqual(chamadas,[['os1']]);
});
test('editar uma parcial abre a entrega correta; revisão fechada não abre edição',async()=>{
 const ref={_perf:{osId:'os1',entregaId:'e2'}};
 const {c,chamadas}=tela(null,ref);await c.perfEditarParticipacao('os1::entrega:e2');assert.deepEqual(chamadas,[['os1','e2']]);
 const fechada=tela(null,ref,true);await fechada.c.perfEditarParticipacao('os1::entrega:e2');assert.deepEqual(fechada.chamadas,[]);
});
