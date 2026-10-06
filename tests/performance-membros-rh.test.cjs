const {test}=require('node:test'), assert=require('node:assert/strict'), vm=require('node:vm'), fs=require('node:fs');
const read=f=>fs.readFileSync(require.resolve('../'+f),'utf8');
function contexto(){
 const pessoas=[
  {chave:'lucas-a',id:'900001',nome:'Lucas Alves',apelido:'lucas',ativo:true},
  {chave:'lucas-b',id:'900002',nome:'Lucas Gabriel Teste',ativo:true,statusId:'experiencia'},
  {chave:'freelancer:novo',id:'900003',nome:'Lúcio Freela',apelido:'lucinho',ativo:true,freelancer:true},
  {chave:'inativo',id:'900004',nome:'Inativo Teste',ativo:false},
  {chave:'freelancer:pendente',id:'',nome:'Freela Pendente',freelancer:true,semCpf:true,ativo:true},
 ];
 const cfg={instaladores:['Lucas','900004'],vinculosRH:[]};
 const c={STORE:{getCFG:()=>cfg,getAllOS:()=>[],elenco:()=>({pessoas,antigos:[]})},STATE:{},console,
  pessoasRH:()=>pessoas,esc:s=>String(s??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),
  normCasa:s=>String(s||'').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim(),
  equipeEscalavel:()=>({doPCP:['Lucas'],doRH:pessoas.slice(1).filter(p=>p.ativo)}),
  nomeExibicaoCasa:()=>({id:'900001',chave:'lucas-a',nome:'Lucas Alves'})};
 vm.createContext(c);vm.runInContext(read('operacao.js'),c);
 const app=read('app.js');vm.runInContext(app.slice(app.indexOf('const RH_CONTRATOS_FREELANCER'),app.indexOf('/* `marcadosAgora`')),c);
 vm.runInContext(read('performance.js'),c);return c;
}
test('equipe fixa inclui novos do RH e freelancers que não estão na lista antiga',()=>{
 const c=contexto(), html=c.perfEscolherMembrosHTML([]);
 assert.match(html,/Lucas Gabriel Teste/);assert.match(html,/Lúcio Freela/);assert.match(html,/Freelancer/);
 assert.doesNotMatch(html,/Inativo Teste/);assert.equal((html.match(/value="900001"/g)||[]).length,1);
});
test('cadastro incompleto aparece com motivo e não pode ser escolhido',()=>{
 const html=contexto().perfEscolherMembrosHTML([]);
 assert.match(html,/Freela Pendente/);assert.match(html,/sem CPF/);
 assert.match(html,/<input[^>]*disabled[^>]*>/);
});
test('preserva integrante antigo selecionado sem duplicar sua identidade no RH',()=>{
 const c=contexto(),html=c.perfEscolherMembrosHTML([{chave:'900001',nome:'Lucas antigo'},{chave:'900004',nome:'Inativo Teste'}]);
 assert.equal((html.match(/value="900001"/g)||[]).length,1);assert.match(html,/value="900004"[^>]*checked/);
});
test('busca reconhece apelido, ID e acentos e mantém os selecionados à vista',()=>{
 const c=contexto(), mk=(busca,checked=false)=>({dataset:{busca},textContent:'rótulo',querySelector:()=>({checked}),hidden:false});
 const rows=[mk('Lúcio Freela lucinho 900003'),mk('Lucas Alves 900001'),mk('Selecionado',true)];
 const busca={value:'lucinho'},box={querySelector:s=>s==='[data-perf-busca]'?busca:null,querySelectorAll:()=>rows};
 c.perfWireBusca(box);busca.oninput();assert.equal(rows[0].hidden,false);assert.equal(rows[1].hidden,true);assert.equal(rows[2].hidden,false);
 busca.value='900003';busca.oninput();assert.equal(rows[0].hidden,false);
});

test('atualização mantém escolhas feitas enquanto o RH responde e limpa o cache de identidade',async()=>{
 const c=contexto();let responder,descartou=false,desenhou=false;
 c.STORE.pullElenco=(forcar,opts)=>{assert.equal(forcar,true);assert.equal(opts.semCache,true);return new Promise(r=>responder=r);};
 vm.runInContext('OPERACAO.esquecerPessoas=()=>{cacheEsquecido=true}',c);
 const btn={disabled:false},nota={},lista={innerHTML:'antes'},busca={value:'lucas'},vazio={};
 let marcados=[];c.perfMarcados=()=>marcados;
 const box={open:true,querySelector:s=>({'[data-perf-atualizar-rh]':btn,'[data-perf-rh-status]':nota,'.perf-members':lista,'[data-perf-busca]':busca,'[data-perf-sem-pessoas]':vazio})[s],querySelectorAll:()=>[]};
 const p=c.perfAtualizarMembrosRH(box,()=>desenhou=true);
 marcados=[{chave:'900002',nome:'Lucas Gabriel Teste'}];responder(true);await p;
 assert.match(lista.innerHTML,/value="900002"[^>]*checked/);assert.equal(c.cacheEsquecido,true);assert.equal(desenhou,true);assert.equal(btn.disabled,false);assert.equal(busca.value,'lucas');
 assert.match(nota.textContent,/atualizada/);
});
test('falha ao atualizar não apaga a lista nem anuncia sucesso',async()=>{
 const c=contexto();c.STORE.pullElenco=async()=>false;
 const btn={disabled:false},nota={},lista={innerHTML:'seleções existentes'};
 const box={open:true,querySelector:s=>({'[data-perf-atualizar-rh]':btn,'[data-perf-rh-status]':nota,'.perf-members':lista})[s]};
 await c.perfAtualizarMembrosRH(box,()=>assert.fail('não redesenha em falha'));
 assert.equal(lista.innerHTML,'seleções existentes');assert.match(nota.textContent,/Não foi possível/);assert.equal(btn.disabled,false);
});
