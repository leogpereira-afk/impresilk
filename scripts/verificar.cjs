const {spawnSync}=require('node:child_process');
const {readdirSync}=require('node:fs');
const {resolve}=require('node:path');
process.chdir(resolve(__dirname,'..'));
for(const file of readdirSync('.').filter(f=>f.endsWith('.js'))) {
  const r=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(r.status)process.exit(r.status);
}
const tests=readdirSync('tests').filter(f=>f.endsWith('.test.cjs')).map(f=>'tests/'+f);
const r=spawnSync(process.execPath,['--test',...tests],{stdio:'inherit',env:{...process.env,TZ:'America/Sao_Paulo'}});
process.exit(r.status ?? 1);
