/* Incidentes por navegador/origem, compartilhados entre abas via localStorage.
   Não contém dados de O.S., credenciais ou agenda externa. */
const ALERTAS_SYNC = (() => {
  const timestamp=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT/.test(v)&&Number.isFinite(Date.parse(v))?Date.parse(v):null;
  function fila(q,{agora=Date.now(),online=true,sessao=true,recusada=false}={}) {
    if(!q?.length)return null;
    const legado=x=>{const m=String(x.fila||x.em||'').match(/^(\d{13})-/);return m&&Number(m[1])>Date.UTC(2020,0,1)?Number(m[1]):timestamp(x.anexadoEm);};
    const datas=q.map(x=>timestamp(x.enfileiradoEm)??legado(x)).filter(x=>x!==null&&x<=agora);
    const maisAntigo=datas.length?Math.min(...datas):null;
    const tipo=!sessao?'sem-sessao':!online?'offline':(recusada||q.some(x=>x.recusa))?'recusa':maisAntigo===null?'fila-sem-data':agora-maisAntigo>=30*60000?'fila-antiga':null;
    return tipo?{tipo,desde:maisAntigo===null?null:new Date(maisAntigo).toISOString(),quantidade:q.length}:null;
  }
  function transicao(anterior,atual,agora=new Date().toISOString()) {
    if(!atual)return {estado:null,notificar:false,recuperou:!!anterior};
    const mudou=!anterior||anterior.tipo!==atual.tipo;
    return {estado:{...atual,inicio:anterior?.inicio||agora},notificar:mudou,recuperou:false};
  }
  function registrar(storage,escopo,atual) {
    const chave='pcp-incidente-v1:'+escopo;let antes;
    try{antes=JSON.parse(storage.getItem(chave)||'null');}catch{}
    const r=transicao(antes,atual);
    try{if(r.estado)storage.setItem(chave,JSON.stringify(r.estado));else storage.removeItem(chave);}catch{}
    return r;
  }
  return {timestamp,fila,transicao,registrar};
})();
if(typeof module!=='undefined')module.exports=ALERTAS_SYNC;
