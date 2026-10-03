// Exclusivo da prévia local. Nenhuma credencial ou registro real é lido.
const {randomUUID}=require('node:crypto');
const sessoes=new Map();
const USUARIO='ana.demo',SENHA='equipe-demo';
const script=`
const API_BASE='', API_FN={os:'ranking-api'};
const AUTH=(()=>{
 const chave='pcp-ranking-sessao-ficticia';
 const token=()=>sessionStorage.getItem(chave)||'';
 return {
  temCracha:()=>!!token(),cracha:token,
  dono:()=>token()?{nome:'Ana · demonstração',papel:'montagem',montagemIndividual:true}:null,
  async login(usuario,senha){
   const r=await fetch('/ranking-api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'previewLogin',usuario,senha})});
   const d=await r.json();if(!r.ok)throw new Error(d.error);sessionStorage.setItem(chave,d.token);return d;
  }
 };
})();
document.addEventListener('DOMContentLoaded',()=>{
 const aviso=document.createElement('aside');aviso.style.cssText='padding:10px 16px;background:#fff2c4;color:#4c3a00;font:12px system-ui;display:flex;gap:12px;flex-wrap:wrap;align-items:center';
 const texto=document.createElement('span');texto.textContent='PRÉVIA FICTÍCIA · usuário: ana.demo · senha: equipe-demo';aviso.append(texto);
 for(const [acao,rotulo] of [['previewErro','Alternar falha de consulta'],['previewExpirar','Expirar acesso fictício'],['previewLimpar','Limpar login da prévia']]){
  const b=document.createElement('button');b.type='button';b.textContent=rotulo;b.className='botao';
  b.onclick=async()=>{if(acao==='previewLimpar'){sessionStorage.removeItem('pcp-ranking-sessao-ficticia');location.reload();return;}
   const r=await fetch('/ranking-api',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+AUTH.cracha()},body:JSON.stringify({action:acao})});
   const d=await r.json();texto.textContent=d.message||d.error||'Cenário alterado';};aviso.append(b);
 }
 document.body.prepend(aviso);
});
`;

function fonteFicticia(periodo){
 const ms=(id,nome,percentual=100)=>({chave:id,nome,percentual,cpf:'CPF-FICTICIO-NAO-SAIR'});
 const comum={confirmado:true,cliente:'CLIENTE-PRIVADO-FICTICIO',numero:'OS-PRIVADA-FICTICIA',valor:87654.32,comissao:876.54,porId:'AUTOR-PRIVADO-FICTICIO'};
 const a=ms('900001','Ana Paula · teste'),b=ms('900002','Bruno Lima · teste'),c=ms('900003','Carla Souza · teste');
 const inteira=(id,equipeId,equipeNome,m)=>({...comum,id,equipeId,equipeNome,membros:[m]});
 const registros=[
  inteira('rank-a','eq-aguia','Águia',a),inteira('rank-b','eq-leao','Leão',b),
  {...inteira('rank-pa','eq-aguia','Águia',a),entregaId:'pa',fracaoOS:.5},
  {...inteira('rank-pb','eq-leao','Leão',b),entregaId:'pb',fracaoOS:.5},
  {...inteira('rank-pc','eq-lobo','Lobo',c),entregaId:'pc',fracaoOS:.4},
  {...comum,id:'rank-duas',entregaId:'duas',fracaoOS:.5,membros:[ms('900004','Davi · teste',60),ms('900005','Eva · teste',40)],
   grupos:[{equipeId:'eq-falcao',equipeNome:'Falcão',cota:6000,membros:['900004']},{equipeId:'eq-touro',equipeNome:'Touro',cota:4000,membros:['900005']}]},
  {...inteira('rank-avulsa','','',ms('900006','Fernanda Alves · teste')),entregaId:'avulsa',fracaoOS:.12},
  {...inteira('rank-pendente','eq-touro','Touro',c),confirmado:false},
 ];
 const equipes=['aguia','leao','lobo','falcao','touro'].map((animal,i)=>({id:'eq-'+animal,nome:['Águia','Leão','Lobo','Falcão','Touro'][i],animal,emblema:['🦅','🦁','🐺','🦅','🐂'][i]}));
 return {fonte:{periodo,consultadoEm:new Date().toISOString(),registros},equipes};
}

async function handler(body,authorization=''){
 const out=(status,body)=>({status,body,headers:{'Cache-Control':'no-store'}});
 if(body.action==='previewLogin'){
  if(body.usuario!==USUARIO||body.senha!==SENHA)return out(401,{error:'Usuário ou senha incorretos nesta prévia fictícia.'});
  const token='preview-ranking-'+randomUUID();sessoes.set(token,{erro:false});return out(200,{token,nome:'Ana · demonstração'});
 }
 const token=String(authorization).replace(/^Bearer\s+/i,''),sessao=sessoes.get(token);
 if(!sessao)return out(401,{error:'Acesso fictício expirado. Limpe o login da prévia para testar nova entrada.',semSessao:true});
 if(body.action==='previewExpirar'){sessoes.delete(token);return out(200,{message:'Acesso fictício expirado. Toque em Atualizar para ver o bloqueio.'});}
 if(body.action==='previewErro'){sessao.erro=!sessao.erro;return out(200,{message:sessao.erro?'Falha fictícia ativada. Toque em Atualizar.':'Consulta fictícia liberada. Toque em Atualizar.'});}
 if(body.action!=='performanceRankingEquipe')return out(404,{error:'Rota não disponível nesta prévia.'});
 if(sessao.erro)return out(503,{error:'Falha fictícia de consulta. Nenhum resultado antigo deve parecer atualizado.'});
 const de=String(body.de||''),ate=String(body.ate||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(de)||!/^\d{4}-\d{2}-\d{2}$/.test(ate)||de>ate)return out(422,{error:'Escolha um período válido.'});
 const {rankingEquipeSeguro}=await import('../supabase/functions/_shared/pcp-ranking-publico.mjs');
 const {fonte,equipes}=fonteFicticia({de,ate});
 if(de.startsWith('2000-01'))fonte.registros=[];
 return out(200,rankingEquipeSeguro(fonte,equipes,null,body.ordemValor===true));
}
module.exports={script,handler,fonteFicticia};
