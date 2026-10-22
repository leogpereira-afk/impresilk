/* Rodada repetível de simulações. Somente fixtures, sem acessar produção. */
const {spawnSync}=require('node:child_process');
const {resolve}=require('node:path');
const grupos={
  sincronizacao:['kaizen-concorrencia','sync','fila-mesmo-ms','onda-acabamento-m17'],
  operacao:['kaizen-operacoes','conferencia-entrega','entrega-item-revisao','cancelamento-f16','status-paridade','operacao-revisao'],
  integridade:['edge-integridade','servidor-auditoria','auditoria-v174-d1-mes-fechado','ponta-a-ponta-dois-meses'],
  acesso:['ranking-acesso','auditoria-v174-u1-privacidade','auditoria-v174-u2-sem-gestao'],
  telas:['telas','conferencia-entrega-ui','rotas','rotas-ui','entregas-por-os-revisao']
};
const args=process.argv.slice(2);
if(args.length===1&&args[0]==='--listar'){
  for(const [nome,testes] of Object.entries(grupos)) console.log(`${nome}: ${testes.join(', ')}`);
  process.exit(0);
}
const escolhidos=args.length?args:Object.keys(grupos);
if(escolhidos.some(nome=>!Object.hasOwn(grupos,nome))){
  console.error('Grupo desconhecido. Use --listar ou: '+Object.keys(grupos).join(' '));
  process.exit(2);
}
if(typeof require('node:module').stripTypeScriptTypes!=='function'){
  console.error('Use Node 22.13 ou mais novo para as simulações do servidor.');
  process.exit(1);
}
const arquivos=[...new Set(escolhidos.flatMap(nome=>grupos[nome]))].map(nome=>`tests/${nome}.test.cjs`);
console.log('Kaizen PCP: '+escolhidos.join(', '));
console.log('Dados fictícios. Esta rodada não substitui npm run verificar nem a conferência em aparelho.');
const r=spawnSync(process.execPath,['--test',...arquivos],{
  cwd:resolve(__dirname,'..'),stdio:'inherit',env:{...process.env,TZ:'America/Sao_Paulo'}
});
if(r.error)console.error(r.error.message);
process.exit(r.status??1);
