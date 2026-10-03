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
function fichaConferencia({suja=false,fila=[]}={}) {
 let render=0,foco=0;const detalhes={open:true},btn={closest:()=>detalhes,focus:()=>foco++},modal={querySelector:()=>btn};
 const c=vm.createContext({console,_modalDraft:{id:'os1',rev:1,obsTecnicas:'anotação local',conferenciasEntrega:[{id:'e1'}]},_modalDirty:suja,STORE:{getOS:()=>null,getQueue:()=>fila},document:{querySelector:()=>modal},reRenderModalKeepOpen:()=>{render++;detalhes.open=false;}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../conferencia-entrega-ui.js'),'utf8'),c);
 return {c,detalhes,conta:()=>({render,foco})};
}
test('salvar saldo atualiza ficha aberta, preserva detalhes abertos e devolve foco',()=>{
 const t=fichaConferencia(),confirmada={id:'os1',rev:2,obsTecnicas:'gravada',conferenciasEntrega:[{id:'e1'},{id:'e2'}]};
 t.c.conferenciaRefletirNaFicha(confirmada);assert.equal(t.c._modalDraft.rev,2);assert.equal(t.c._modalDraft.conferenciasEntrega.length,2);assert.equal(t.detalhes.open,true);assert.deepEqual(t.conta(),{render:1,foco:1});
});
test('resposta de conferência não apaga edição local nem rebasa uma fila pendente',()=>{
 const t=fichaConferencia({suja:true,fila:[{os:{id:'os1'}}]});
 t.c.conferenciaRefletirNaFicha({id:'os1',rev:2,obsTecnicas:'anterior',conferenciasEntrega:[{id:'e1'},{id:'e2'}]});
 assert.equal(t.c._modalDraft.obsTecnicas,'anotação local');assert.equal(t.c._modalDraft.rev,1);assert.equal(t.c._modalDraft.conferenciasEntrega.length,2);
 t.c._modalDraft={id:'outra',rev:1};t.c.conferenciaRefletirNaFicha({id:'os1',rev:2,conferenciasEntrega:[]});assert.equal(t.c._modalDraft.id,'outra');assert.equal(t.conta().render,1);
});
