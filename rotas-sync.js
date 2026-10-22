/* Rascunho local + revisão do servidor. Nenhuma escrita automática de rota. */
const ROTAS_SYNC=(()=>{
 const estado={dono:null,ocupado:false,consultado:false,erro:'',em:''};
 function assinatura(p){const c={...p};for(const k of Object.keys(c))if(k.startsWith('_'))delete c[k];if(c.resultado){c.resultado={...c.resultado};delete c.resultado.mapa;delete c.resultado.avisoMapa;delete c.resultado.mapaNoServidor;}const s=JSON.stringify(c,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(16);}
 const pendente=p=>!p._revision||p._assinatura!==assinatura(p);
 const receber=r=>{const p={...r.registro,_revision:r.revision,_em:r.atualizado_em};p._assinatura=assinatura(p);return p;};
 const api=b=>STORE.apiFn('os',b,60000);
 function preparar(){const dono=rotaChave();if(estado.dono!==dono)Object.assign(estado,{dono,ocupado:false,consultado:false,erro:'',em:''});return dono;}
 async function atualizar(){const dono=preparar();if(estado.ocupado)return;estado.ocupado=true;estado.erro='';estado.consultado=true;
 try{const remotas=[];let cursor=null;do{const r=await api({action:'rotasListar',cursor});if(r.error)throw Error(r.error);remotas.push(...r.rotas);cursor=r.cursor;}while(cursor);
 if(dono!==rotaChave())return;
 const atual=rotaEstado();for(const r of remotas){const i=ROTAS_UI.planos.findIndex(p=>p.id===r.registro.id),p=ROTAS_UI.planos[i];if(p&&pendente(p)){p._noServidor=true;continue;}if(p&&p._revision===r.revision)continue;const novo=receber(r);if(i<0)ROTAS_UI.planos.push(novo);else ROTAS_UI.planos[i]=novo;if(atual.id===novo.id)ROTAS_UI.atual=novo;}
 const p=rotaEstado();if(p.resultado?.mapaNoServidor&&!pendente(p)){const r=await api({action:'rotasObter',id:p.id});if(r.error)throw Error(r.error);if(dono===rotaChave()&&ROTAS_UI.atual===p&&!pendente(p)){const novo=receber(r);ROTAS_UI.planos[ROTAS_UI.planos.indexOf(p)]=novo;ROTAS_UI.atual=novo;}}
 estado.em=new Date().toLocaleTimeString('pt-BR');
 }catch(e){if(dono===rotaChave())estado.erro=e.message||'Sem conexão. O rascunho local foi preservado.';}
 finally{if(dono===rotaChave()){estado.ocupado=false;rotaSalvar();renderRotasEntregas();}}
 }
 async function salvar(){const dono=preparar(),p=rotaEstado();if(estado.ocupado||ROTAS_UI.ocupado)return;estado.ocupado=true;estado.erro='';const antes=assinatura(p),copia=structuredClone(p);const mutationId=p._mutation&&p._mutationAssinatura===antes?p._mutation:crypto.randomUUID();p._mutation=mutationId;p._mutationAssinatura=antes;rotaSalvar();renderRotasEntregas();
 try{const r=await api({action:'rotasSalvar',rota:copia,revision:p._revision||0,mutationId});if(r.error)throw Error(r.error);if(dono!==rotaChave())return;
 const salvo=receber(r);if(assinatura(p)===antes){Object.assign(p,salvo);delete p._mutation;delete p._mutationAssinatura;}else{p._revision=r.revision;p._assinatura=salvo._assinatura;p._em=r.atualizado_em;}
 estado.em=new Date().toLocaleTimeString('pt-BR');
 }catch(e){if(dono===rotaChave())estado.erro=e.message||'Falha ao salvar. Rascunho preservado.';}
 finally{if(dono===rotaChave()){estado.ocupado=false;rotaSalvar();renderRotasEntregas();}}
 }
 async function abrirServidor(){const dono=preparar(),p=rotaEstado();if((!p._revision&&!p._noServidor)||estado.ocupado)return;estado.ocupado=true;try{const r=await api({action:'rotasObter',id:p.id});if(r.error)throw Error(r.error);if(dono!==rotaChave())return;if(pendente(p)){const copia=structuredClone(p);copia.id=crypto.randomUUID();copia.nome+=' (rascunho preservado)';for(const k of Object.keys(copia))if(k.startsWith('_'))delete copia[k];ROTAS_UI.planos.push(copia);}const novo=receber(r);ROTAS_UI.planos[ROTAS_UI.planos.indexOf(p)]=novo;ROTAS_UI.atual=novo;estado.erro='';}catch(e){if(dono===rotaChave())estado.erro=e.message;}finally{if(dono===rotaChave()){estado.ocupado=false;rotaSalvar();renderRotasEntregas();}}}
 function html(p){preparar();return `<div class="rota-nuvem" role="status"><b>${pendente(p)?'Alterações neste aparelho':'Salva no sistema'}</b> ${p._em?'· '+new Date(p._em).toLocaleString('pt-BR'): '· Ainda não enviada'}<div class="rota-acoes"><button class="btn-primary" id="rota-salvar-sistema" ${estado.ocupado||ROTAS_UI.ocupado?'disabled':''}>${estado.ocupado?'Sincronizando…':'Salvar no sistema'}</button><button class="btn-ghost" id="rota-atualizar-sistema" ${estado.ocupado?'disabled':''}>Atualizar rotas</button>${p._revision||p._noServidor?'<button class="btn-ghost" id="rota-versao-sistema">Abrir versão do sistema</button>':''}</div><small>Salvar uma rota confirmada libera o mapa e o roteiro para os integrantes da equipe. Alterações locais aguardam Salvar.</small>${estado.erro?`<p role="alert">${rotaEsc(estado.erro)}</p>`:''}</div>`;}
 function wire(el){el.querySelector('#rota-salvar-sistema').onclick=salvar;el.querySelector('#rota-atualizar-sistema').onclick=atualizar;const v=el.querySelector('#rota-versao-sistema');if(v)v.onclick=abrirServidor;if(!estado.consultado)queueMicrotask(atualizar);}
 return {assinatura,pendente,receber,atualizar,salvar,html,wire};
})();
if(typeof module!=='undefined')module.exports=ROTAS_SYNC;
if(typeof window!=='undefined'){const conferir=()=>{if(typeof STATE!=='undefined'&&STATE.tab==='entregas'&&document.querySelector('#rota-salvar-sistema')&&!document.hidden&&!document.activeElement?.matches('input,select,textarea'))ROTAS_SYNC.atualizar();};setInterval(conferir,30000);window.addEventListener('focus',conferir);window.addEventListener('online',conferir);}
