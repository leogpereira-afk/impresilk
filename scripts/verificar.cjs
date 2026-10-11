const {spawnSync}=require('node:child_process');
const {readdirSync}=require('node:fs');
const {resolve}=require('node:path');
process.chdir(resolve(__dirname,'..'));
// Os testes que carregam o servidor (.ts) usam stripTypeScriptTypes, que só
// existe a partir do Node 22.13 (e do 23.2). Com um Node mais velho a suíte
// falhava teste por teste com "stripTypeScriptTypes is not a function", como se
// o código estivesse quebrado. Falha aqui, uma vez, dizendo a causa.
if(typeof require('node:module').stripTypeScriptTypes!=='function'){
  console.error(`ERRO: este Node (${process.version}) não tem stripTypeScriptTypes, que os testes do servidor usam. Use o Node 22.13 ou mais novo. Neste Mac: ~/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node (v24); o ~/apps/node20 serve para o vez.cjs, não para a suíte.`);
  process.exit(1);
}
for(const file of readdirSync('.').filter(f=>f.endsWith('.js'))) {
  const r=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(r.status)process.exit(r.status);
}
const tests=readdirSync('tests').filter(f=>f.endsWith('.test.cjs')).map(f=>'tests/'+f);
const r=spawnSync(process.execPath,['--test',...tests],{stdio:'inherit',env:{...process.env,TZ:'America/Sao_Paulo'}});
process.exit(r.status ?? 1);
