/* Ensaio exclusivamente fictício em diretório temporário. Sem rede/credenciais. */
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const C=require('../conferencia-entrega.js');
const hash=x=>crypto.createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
function fixture(){
 const ordem={id:'os-ficticia',numero:'QA-RECUPERACAO',itens:[{uid:'a',item:'1',descricao:'Placa fictícia',qtde:4,subtotal:12000},{uid:'b',item:'2',descricao:'Adesivo fictício',qtde:3,subtotal:8000}],valorTotal:18000,fotosCheckinIds:['foto-ficticia']};
 const sel=(a,b)=>C.catalogo(ordem).map((i,n)=>({chave:i.chave,identidade:i.identidade,qtde:n?b:a}));
 ordem.conferenciasEntrega=[{id:'e1',dia:'2026-10-01',itens:sel(1,1),equipeId:'equipe-a'},{id:'e2',dia:'2026-10-02',itens:sel(3,2),equipeId:'equipe-b'}];
 return {os:[ordem,{id:'os-fechada',numero:'QA-FECHADA',finalizadaEm:'2026-10-01T12:00:00Z',itens:[]}],cfg:{performancePCP:{equipes:[{id:'equipe-a',nome:'Equipe A fictícia'},{id:'equipe-b',nome:'Equipe B fictícia'}]}},fotos:[{id:'foto-ficticia',tipo:'image/png',base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII='}],regras:[{id:'regra-1',versao:1,taxa:0.01,teste:true}],fechamentos:[{id:'fechamento-1',regraId:'regra-1',osIds:['os-ficticia'],revisao:1}],auditoria:[{id:'audit-1',osId:'os-ficticia',evento:'conferencia',entregaId:'e1',por:'Gestor fictício'}]};
}
function manifesto(p){return Object.fromEntries(Object.entries(p).map(([k,v])=>[k,{quantidade:Array.isArray(v)?v.length:1,sha256:hash(v)}]));}
function validar(p,m){
 assert.deepEqual(manifesto(p),m,'Hashes ou contagens divergiram');
 const ids=new Set(p.os.map(o=>o.id)),fotos=new Set(p.fotos.map(f=>f.id)),regras=new Set(p.regras.map(r=>r.id));
 for(const o of p.os){assert.equal(C.validar(o,o.conferenciasEntrega||[]),'');for(const id of o.fotosCheckinIds||[])assert.ok(fotos.has(id));}
 for(const f of p.fechamentos){assert.ok(regras.has(f.regraId));f.osIds.forEach(id=>assert.ok(ids.has(id)));}
 for(const a of p.auditoria){const o=p.os.find(o=>o.id===a.osId);assert.ok(o);assert.ok(o.conferenciasEntrega.some(e=>e.id===a.entregaId));}
 assert.deepEqual(C.apurar(p.os[0],18000).entregas.map(e=>e.valor),[510000,1290000]);
 return true;
}
function restaurar(p,m,adapter,interromper=false){validar(p,m);const stage=structuredClone(p);if(interromper)throw Error('Interrupção simulada antes do commit');adapter.estado=stage;return adapter.estado;}
function executar(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pcp-recuperacao-ficticia-')),p=fixture(),m=manifesto(p),adapter={estado:{}};
 fs.writeFileSync(path.join(dir,'pacote.json'),JSON.stringify(p,null,2));fs.writeFileSync(path.join(dir,'manifesto.json'),JSON.stringify(m,null,2));
 const input=JSON.parse(fs.readFileSync(path.join(dir,'pacote.json')));restaurar(input,m,adapter);assert.deepEqual(adapter.estado,p);const antes=hash(adapter.estado);restaurar(input,m,adapter);assert.equal(hash(adapter.estado),antes);
 assert.throws(()=>restaurar(input,m,adapter,true),/Interrupção/);assert.equal(hash(adapter.estado),antes);
 const corrompido=structuredClone(input);corrompido.fotos[0].base64+='x';assert.throws(()=>restaurar(corrompido,m,adapter),/Hashes/);assert.equal(hash(adapter.estado),antes);
 // Exercita as funções reais do backup v4, em sandbox sem rede/IndexedDB.
 const vm=require('node:vm'),ls=new Map([['impresilk_inst_os',JSON.stringify(p.os)],['impresilk_inst_cfg',JSON.stringify(p.cfg)]]);
 const ctx=vm.createContext({console,navigator:{onLine:false},window:{addEventListener(){}},localStorage:{getItem:k=>ls.get(k)||null,setItem:(k,v)=>ls.set(k,v),removeItem:k=>ls.delete(k)},setTimeout:()=>1,clearTimeout(){},AbortController});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../store.js'),'utf8'),ctx);
 const localV4=JSON.parse(vm.runInContext('JSON.stringify(STORE.exportarBackup())',ctx));assert.equal(localV4.versao,4);assert.equal(localV4.fotos,undefined);assert.equal(localV4.regras,undefined);assert.equal(localV4.auditoria,undefined);
 ctx.backup=structuredClone(localV4);vm.runInContext('STORE.importarBackup(backup)',ctx);assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(STORE.getAllOS())',ctx)),p.os);
 const resultado={ambiente:'fixture fictícia, adaptador em memória, sem nuvem',diretorio:dir,checks:['hashes/contagens','relações OS-entrega-item-foto','regras e fechamento preservados','auditoria vinculada','parcelas 5100+12900=18000','reload de JSON','restauração idempotente','interrupção sem commit','corrupção recusada','backup v4 real OS/CFG no sandbox'],backupV4:'OS/CFG locais apenas; não contém objetos de fotos, regras versionadas, fechamentos ou auditoria da nuvem',manifesto:m};
 fs.writeFileSync(path.join(dir,'resultado.json'),JSON.stringify(resultado,null,2));return resultado;
}
if(require.main===module)console.log(JSON.stringify(executar(),null,2));
module.exports={fixture,manifesto,validar,restaurar,executar};
