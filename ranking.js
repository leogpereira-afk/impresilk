'use strict';

// Página própria: não carrega STORE nem a base das O.S. no aparelho.
(() => {
  const $ = id => document.getElementById(id);
  const fmt = n => new Intl.NumberFormat('pt-BR', {maximumFractionDigits:2}).format(Number(n) || 0);
  const diaBR = d => String(d || '').split('-').reverse().join('/');
  const hoje = () => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const animais = new Set(['aguia','leao','pantera','lobo','tigre','falcao','carcara','onca','lobo-guara','touro']);
  let dados = null, pedido = 0, ocupado = false, acompanhamentoPausado = false, trocarSenhaPendente = false;
  const criar = (tag, classe, texto) => { const el=document.createElement(tag); if(classe)el.className=classe;if(texto!==undefined)el.textContent=texto;return el; };
  function periodoDoMes(mes) {
    if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error('Escolha um mês válido.');
    const [ano,m]=mes.split('-').map(Number);
    if(ano<2000 || m<1 || m>12 || mes>hoje().slice(0,7)) throw new Error('Escolha um mês até o atual.');
    const ultimo=new Date(Date.UTC(ano,m,0)).toISOString().slice(0,10);
    return {de:mes+'-01',ate:ultimo>hoje()?hoje():ultimo};
  }
  function limparDados() { dados=null;$('ranking-lista').replaceChildren();$('ranking-resumo').replaceChildren();$('ranking-recorte').textContent='';$('ranking-atualizacao').textContent='';$('ranking-sem-base').hidden=true;$('ranking-sem-base').textContent='';$('ranking-vazio').hidden=true;$('ranking-pdf').disabled=true; }
  function mostrarLogin(mensagem='') {
    pedido++;ocupado=false;limparDados();$('ranking-login').hidden=false;$('ranking-conteudo').hidden=true;
    $('ranking-sair').hidden=true;$('ranking-nome').textContent='';$('ranking-login-erro').textContent=mensagem;
    $('ranking-retomar').hidden=!AUTH.temCracha();
    // A fila do espelho pertence ao crachá atual. Acompanhar ou sair daqui
    // não pode substituí-lo; renovação/troca segue o fluxo protegido do PCP.
    $('ranking-login-form').hidden=AUTH.temCracha();
    $('ranking-renovar').hidden=!AUTH.temCracha();
    $('ranking-renovar').href=AUTH.dono({aceitarVencido:true})?.montagemIndividual?'equipe.html':'index.html';
  }
  function mostrarApp() {
    acompanhamentoPausado=false;
    $('ranking-login').hidden=true;$('ranking-conteudo').hidden=false;$('ranking-sair').hidden=false;
    const nome=AUTH.dono()?.nome || '';
    $('ranking-nome').textContent=nome.split(' ')[0];
  }
  function orientarTrocaSenha() {
    trocarSenhaPendente=true;
    mostrarLogin('Sua senha é temporária. Abra o PCP e altere sua senha antes de acompanhar o ranking.');
    $('ranking-retomar').hidden=true;
    $('ranking-renovar').hidden=false;
    $('ranking-renovar').href='index.html';
    $('ranking-renovar').textContent='Abrir PCP para alterar a senha';
  }
  function renderizar() {
    if(!dados)return;
    const resumo=dados.resumo || {}, porValor=dados.criterio==='valor-confirmado';
    $('ranking-resumo').replaceChildren(...[[fmt(resumo.equipes),'equipes no ranking'],[fmt(resumo.equivalentes),'O.S. equivalentes'],[fmt(resumo.entregasConfirmadas),'entregas conferidas'],[fmt(resumo.aConferir),'entregas a conferir']].map(([n,t])=>{const d=criar('div');d.append(criar('strong','',n),criar('span','',t));return d;}));
    const semBase=Number(resumo.semBase)||0;
    $('ranking-sem-base').hidden=semBase<=0;
    $('ranking-sem-base').textContent=semBase>0?fmt(semBase)+(semBase===1?' entrega já conferida aguarda base para calcular a produção. Ainda não soma O.S. equivalentes.':' entregas já conferidas aguardam base para calcular a produção. Ainda não somam O.S. equivalentes.'):'';
    const busca=$('ranking-busca').value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    const todas=Array.isArray(dados.equipes)?dados.equipes:[];
    const linhas=todas.filter(e=>String(e.nome).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(busca));
    const lider=todas[0]?.equivalentes || 1;
    $('ranking-lista').replaceChildren(...linhas.map(e=>{
      const li=criar('li','ranking-linha');li.dataset.posicao=String(e.posicao);
      const pos=criar('div','ranking-posicao',({1:'🥇',2:'🥈',3:'🥉'})[e.posicao] || e.posicao+'º');pos.setAttribute('aria-label',e.posicao+'º lugar');
      const logo=criar('div','ranking-logo');logo.setAttribute('aria-hidden','true');
      const src=typeof e.logo==='string'&&e.logo.length<=40000&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(e.logo)?e.logo:animais.has(e.animal)?'equipe-'+e.animal+'.webp':'';
      if(src){const img=criar('img');img.src=src;img.alt='';img.loading='lazy';logo.append(img);}else logo.textContent=e.emblema || '🤝';
      const equipe=criar('div','ranking-equipe');equipe.append(criar('h3','',e.nome),criar('small','',(e.tipo==='individual'?'Participação individual':e.tipo==='composicao'?'Composição da entrega':'Equipe')+' · '+fmt(e.entregas)+(e.entregas===1?' entrega com produção calculada':' entregas com produção calculada')));
      const barra=criar('progress');barra.max=lider;barra.value=e.equivalentes;barra.setAttribute('aria-label','Produção de '+e.nome);if(!porValor)equipe.append(barra);
      const producao=criar('div','ranking-producao');producao.append(criar('strong','',fmt(e.equivalentes)),criar('small','','O.S. equivalentes'),criar('small','ranking-distancia',porValor?(e.posicao===1?'Maior valor confirmado':'Classificação por valor'):e.faltaLideranca>0?fmt(e.faltaLideranca)+' até a liderança':e.posicao===1?'Na liderança':'Produção confirmada'));
      li.append(pos,logo,equipe,producao);return li;
    }));
    $('ranking-vazio').hidden=linhas.length>0;
    $('ranking-vazio').textContent=busca?'Nenhuma equipe encontrada. Tente outro nome.':semBase>0?'As entregas conferidas aguardam base para entrar no ranking.':'O ranking está esperando as primeiras entregas confirmadas deste período.';
    $('ranking-recorte').textContent=diaBR(dados.periodo?.de)+' a '+diaBR(dados.periodo?.ate)+' · '+(dados.fechado?'Período fechado · revisão '+dados.revisao:'Acompanhamento em andamento')+(busca?' · exibindo '+linhas.length+' de '+todas.length+' equipes':'');
    const data=new Date(dados.atualizadoEm);
    $('ranking-atualizacao').textContent=Number.isFinite(+data)?'Consultado em '+data.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'Consulta concluída';
    $('ranking-pdf').disabled=!todas.length&&!resumo.entregasConfirmadas&&!resumo.aConferir;
  }
  async function carregar() {
    if(trocarSenhaPendente){orientarTrocaSenha();return;}
    let periodo;
    try { periodo=periodoDoMes($('ranking-mes').value); } catch(e) { $('ranking-erro').hidden=false;$('ranking-erro').textContent=e.message;return; }
    if(!AUTH.temCracha()){mostrarLogin();return;}
    const atual=++pedido;ocupado=true;limparDados();mostrarApp();
    $('ranking-erro').hidden=true;$('ranking-atualizacao').textContent='Conferindo o ranking…';$('ranking-resultados').setAttribute('aria-busy','true');$('ranking-atualizar').disabled=true;
    $('ranking-proximo').disabled=$('ranking-mes').value>=hoje().slice(0,7);
    const controle=new AbortController(), prazo=setTimeout(()=>controle.abort(),30000);
    try {
      const r=await fetch(API_BASE+'/'+API_FN.os,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+AUTH.cracha()},body:JSON.stringify({action:'performanceRankingEquipe',...periodo,ordemValor:true}),cache:'no-store',signal:controle.signal});
      const resposta=await r.json();if(atual!==pedido)return;
      if(r.status===401){mostrarLogin('Seu acesso precisa ser renovado. Entre novamente ou peça a autorização à gestão.');return;}
      if(!r.ok)throw new Error(resposta.error || 'Não foi possível consultar o ranking.');
      dados=resposta;renderizar();
    } catch(e) {
      if(atual!==pedido)return;
      $('ranking-erro').hidden=false;$('ranking-erro').textContent=e.name==='AbortError'?'A consulta demorou mais que o esperado. Tente atualizar.':e.message;
      $('ranking-atualizacao').textContent='Sem atualização';
    } finally { clearTimeout(prazo);if(atual===pedido){ocupado=false;$('ranking-atualizar').disabled=false;$('ranking-resultados').setAttribute('aria-busy','false');} }
  }
  $('ranking-mes').value=hoje().slice(0,7);$('ranking-mes').max=hoje().slice(0,7);$('ranking-mes').min='2000-01';
  $('ranking-periodo').onsubmit=e=>{e.preventDefault();carregar();};
  $('ranking-mes').onchange=()=>carregar();
  for(const [id,passo] of [['ranking-anterior',-1],['ranking-proximo',1]])$(id).onclick=()=>{const [a,m]=$('ranking-mes').value.split('-').map(Number);$('ranking-mes').value=new Date(Date.UTC(a,m-1+passo,1)).toISOString().slice(0,7);carregar();};
  $('ranking-atual').onclick=()=>{$('ranking-mes').value=hoje().slice(0,7);carregar();};
  $('ranking-busca').oninput=renderizar;
  $('ranking-pdf').onclick=()=>{if(dados)window.print();};
  $('ranking-sair').onclick=()=>{acompanhamentoPausado=true;mostrarLogin('Você saiu do acompanhamento. O acesso de trabalho deste aparelho foi preservado.');$('ranking-retomar').focus();};
  $('ranking-retomar').onclick=()=>carregar();
  $('ranking-login-form').onsubmit=async e=>{
    e.preventDefault();$('ranking-entrar').disabled=true;$('ranking-login-erro').textContent='';
    if(AUTH.temCracha()){$('ranking-entrar').disabled=false;mostrarLogin('Para renovar ou trocar o acesso, abra o PCP. Assim o trabalho pendente deste aparelho fica protegido.');return;}
    try{const entrada=await AUTH.login($('ranking-usuario').value.trim(),$('ranking-senha').value);$('ranking-senha').value='';if(entrada?.trocarSenha){orientarTrocaSenha();return;}await carregar();}
    catch(erro){$('ranking-login-erro').textContent=erro.message || 'Não foi possível entrar.';}
    finally{$('ranking-entrar').disabled=false;}
  };
  // O crachá é compartilhado com o PCP; sair em outra aba remove o ranking.
  window.addEventListener('storage',e=>{if(e.key==='impresilk_inst_cracha'){if(!e.newValue)mostrarLogin();else if(!acompanhamentoPausado)carregar();}});
  setInterval(()=>{if(!document.hidden&&!$('ranking-conteudo').hidden&&!ocupado)carregar();},300000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('ranking-conteudo').hidden&&!ocupado)carregar();});
  if(AUTH.temCracha())carregar();else mostrarLogin();
})();
