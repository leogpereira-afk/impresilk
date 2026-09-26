'use strict';

// Participação é uma medida operacional. Não calcula salário ou bônus.
const PERF = (() => {
  const unicos = membros => [...new Map((membros || []).filter(p => p && p.chave).map(p => [String(p.chave), {...p}])).values()];
  const iguais = membros => {
    const ps = unicos(membros), n = ps.length;
    return ps.map((p,i) => ({...p, percentual: (Math.floor(10000/n) + (i < 10000 % n ? 1 : 0))/100}));
  };
  const validar = membros => {
    if (!Array.isArray(membros) || !membros.length) return 'Escolha pelo menos uma pessoa.';
    if (unicos(membros).length !== membros.length) return 'A mesma pessoa está repetida.';
    if (membros.some(p => !p.nome || typeof p.percentual !== 'number' || !Number.isFinite(p.percentual) || p.percentual <= 0 || p.percentual > 100)) return 'Cada participação precisa ser maior que zero e até 100%.';
    if (Math.abs(membros.reduce((s,p) => s + p.percentual,0)-100) > 0.001) return 'As participações precisam somar 100%.';
    return '';
  };
  const composicao = membros => unicos(membros).map(p => String(p.chave)).sort().join('|');
  // Rateio em centavos: distribui o resíduo pelas maiores frações, com desempate estável.
  const ratearCentavos = (valor, membros) => {
    if (valor == null) return membros.map(() => null);
    const total = Math.round(Math.abs(valor) * 100), sinal = valor < 0 ? -1 : 1;
    const partes = membros.map((p,i) => {
      const exato = total * p.percentual / 100;
      return {i, chave:String(p.chave), centavos:Math.floor(exato), resto:exato-Math.floor(exato)};
    });
    let falta = total - partes.reduce((s,p)=>s+p.centavos,0);
    const ordem = [...partes].sort((a,b)=>b.resto-a.resto || a.chave.localeCompare(b.chave));
    for(let i=0;i<falta;i++) ordem[i % ordem.length].centavos++;
    return partes.map(p=>sinal*p.centavos);
  };
  const resumir = registros => {
    const pessoas = new Map(), equipes = new Map();
    for (const r of registros) {
      if (validar(r.membros)) continue;
      const centavos = ratearCentavos(r.valor, r.membros);
      for (const [indice,p] of r.membros.entries()) {
        const x = pessoas.get(p.chave) || {chave:p.chave,nome:p.nome,os:0,equivalentes:0,valor:0,semValor:0,confirmadas:0};
        x.os++; if(r.confirmado) x.confirmadas++; x.equivalentes += p.percentual/100;
        if (r.valor == null) x.semValor++; else x.valor = (Math.round(x.valor*100) + centavos[indice])/100;
        pessoas.set(p.chave,x);
      }
      // A equipe leva cada O.S. uma vez, mesmo com participação individual.
      const k = r.equipeId || ('avulsa:'+composicao(r.membros));
      const x = equipes.get(k) || {chave:k,nome:r.equipeNome || r.membros.map(p=>p.nome).join(' + '),emblema:r.emblema || '🤝',logo:r.logo || '',salva:!!r.equipeId,membros:r.membros.map(p=>({chave:p.chave,nome:p.nome})),os:0,valor:0,semValor:0,confirmadas:0};
      x.os++; if(r.confirmado) x.confirmadas++; if(r.valor == null) x.semValor++; else x.valor+=r.valor;
      equipes.set(k,x);
    }
    return {pessoas:[...pessoas.values()].sort((a,b)=>b.equivalentes-a.equivalentes || a.nome.localeCompare(b.nome)),equipes:[...equipes.values()].sort((a,b)=>b.os-a.os || a.nome.localeCompare(b.nome))};
  };
  const incluiPessoa = (membros,chave) => !chave || membros.some(p=>String(p.chave)===String(chave));
  const manterPesos = (anteriores,selecionados) => selecionados.map(p=>({...p,percentual:anteriores.find(a=>a.chave===p.chave)?.percentual || 0}));
  const dossie = registros => {
    const grupos=new Map();
    for(const r of registros){
      if(validar(r.membros))continue;
      const chave=r.equipeId || 'avulsa:'+composicao(r.membros);
      const g=grupos.get(chave)||{chave,nome:r.equipeNome || 'Composição avulsa',emblema:r.emblema||'🤝',logo:r.logo||'',registros:[],membros:new Map(),confirmadas:0,valor:0,semValor:0,retrabalhos:0};
      g.registros.push(r);if(r.os?.retrabalho || r.retrabalho)g.retrabalhos++;
      if(r.confirmado){g.confirmadas++;if(r.valor==null)g.semValor++;else g.valor+=r.valor;}
      for(const m of r.membros){const pessoa=g.membros.get(m.chave)||{chave:m.chave,nome:m.nome,entregas:0,confirmadas:0,equivalentes:0};pessoa.entregas++;if(r.confirmado){pessoa.confirmadas++;pessoa.equivalentes+=m.percentual/100;}g.membros.set(m.chave,pessoa);}
      grupos.set(chave,g);
    }
    return [...grupos.values()].map(g=>({...g,membros:[...g.membros.values()]})).sort((a,b)=>b.registros.length-a.registros.length || a.nome.localeCompare(b.nome));
  };
  /* A EQUIPE DE UM REGISTRO. Pelo id quando a participação confirmada já diz
     qual foi (vale mesmo que a equipe tenha sido desativada depois: é
     histórico); senão, pela COMPOSIÇÃO EXATA, quando os mesmos integrantes estão
     cadastrados como equipe ativa. Sem esta segunda regra, nomear "Adriano +
     Douglas" como equipe não mudaria nada na tela até alguém reconferir cada
     entrega à mão — e ninguém reconfere 154 entregas para ver um nome. */
  /* A CHAVE DA PESSOA MUDA (apelido -> ficha do RH quando alguém é ligado, ou
     num aparelho em que o elenco ainda não desceu). A equipe guarda as chaves do
     dia em que foi salva; comparar cru faria a equipe sumir do ranking em
     silêncio depois de um "Ligar". `resolver` normaliza as duas pontas. */
  const composicaoCom = (membros, resolver) => resolver
    ? unicos((membros || []).map(m => ({...m, chave: String(resolver(m) || m.chave)}))).map(p => p.chave).sort().join('|')
    : composicao(membros);
  const equipeDoRegistro = (r, salvas, resolver) => {
    const lista = Array.isArray(salvas) ? salvas : [];
    if (r && r.equipeId) return lista.find(e => e.id === r.equipeId) || null;
    /* Registro CONFIRMADO é histórico: vale só o id gravado na confirmação.
       Deduzir pela composição de hoje mudaria o passado a cada equipe nova. */
    if (r && r.confirmado) return null;
    const k = composicaoCom(r && r.membros, resolver);
    if (!k) return null;
    return lista.find(e => e.ativo !== false && composicaoCom(e.membros, resolver) === k) || null;
  };
  /* Cópias só para exibir: o registro original (que alimenta a apuração e o
     hash do fechamento) não é tocado. O nome que aparece é o ATUAL da equipe —
     o id é quem identifica, o nome só exibe. Numa revisão FECHADA
     (`historico`), o nome e o emblema gravados no fechamento ficam; só o logo
     é buscado pelo id, porque o fechamento não o guardava. */
  const comEquipes = (registros, salvas, opcoes) => {
    const o = opcoes || {};
    return (registros || []).map(r => {
      const e = equipeDoRegistro(r, salvas, o.resolver);
      if (!e) return r;
      if (o.historico) return {...r, logo: e.logo || r.logo || ''};
      return {...r, equipeId:e.id, equipeNome:e.nome, emblema:e.emblema || '🤝', logo:e.logo || ''};
    });
  };
  /* POSIÇÃO COM EMPATE. Duas equipes com 6 entregas dividem o 1º lugar e a
     próxima é 3ª (a regra das competições). Numerar 1, 2 por ordem alfabética
     inventaria uma diferença que os números não mostram. */
  const ranquear = (linhas, medida) => {
    const ord = [...(linhas || [])].sort((a,b) => (medida(b) - medida(a)) || String(a.nome).localeCompare(String(b.nome)));
    let posicao = 0, anterior = null;
    return ord.map((l,i) => {
      const v = medida(l);
      if (v !== anterior) { posicao = i + 1; anterior = v; }
      return {...l, posicao};
    });
  };
  /* ------------------------------------------------------ AVALIAÇÃO INDIVIDUAL
   * Pedido do dono (23/09/2026): "o peso é individual, porque pode ter pessoa
   * que participa de mais entregas compartilhadas; tem que entender isso na
   * inteligência" e "a limpeza do carro e a gestão dos equipamentos têm que ter
   * peso nesse critério de avaliação".
   *
   * PRODUÇÃO é o PESO, não a contagem. Quem está em seis entregas divididas ao
   * meio produziu três, igual a quem fez três sozinho. Contar aparições premiaria
   * quem entra em muita equipe, não quem produz. É a soma dos percentuais de
   * cada pessoa (as "O.S. equivalentes"), comparada com a de quem mais produziu
   * no período: o primeiro vale 100.
   *
   * CARRO e EQUIPAMENTOS vêm da conferência da volta, feita pela gestão na ficha
   * da O.S. (quem avalia não é quem é avaliado). Cada conferência pesa para cada
   * pessoa na mesma fração que a entrega pesou para ela: quem fez 70% da entrega
   * responde por 70% daquele carro.
   *
   * O QUE NÃO FOI CONFERIDO NÃO VIRA NOTA, NEM PASSE LIVRE. Volta sem resposta
   * conta pela média do período, volta a volta (ver COBERTURA abaixo). Zero ali
   * afirmaria carro sujo que ninguém viu; cem premiaria fugir da conferência. */
  const CRITERIOS_PADRAO = {producao:60, limpeza:20, equipamentos:20};
  const CRITERIOS = ['producao','limpeza','equipamentos'];
  /* COBERTURA MÍNIMA. Revisão de 23/09/2026: marcar só as exceções (os carros
     sujos) é o jeito natural de usar um campo que nasce em branco — e aí a
     média do período sai 0 e todo mundo tira 0, o sujo igual ao que ninguém
     olhou. Marcar só os elogios dá o contrário. Por isso o critério só entra na
     nota quando a gestão respondeu sim ou não em pelo menos 80% das voltas do
     período; abaixo disso ele fica fora da nota de TODOS e a tela diz quanto
     falta. */
  const COBERTURA_MINIMA = 0.8;
  const criteriosValidos = c => {
    const x = c && typeof c === 'object' ? c : {};
    const n = CRITERIOS.map(k => Number(x[k]));
    if (n.some(v => !Number.isInteger(v) || v < 0 || v > 100) || n.reduce((a,b)=>a+b,0) !== 100) return {...CRITERIOS_PADRAO};
    return Object.fromEntries(CRITERIOS.map((k,i)=>[k,n[i]]));
  };
  // "sim"/"nao" da ficha (ou booleano) -> true/false; qualquer outra coisa é "não conferido".
  const sn = v => v === true || v === 'sim' ? true : (v === false || v === 'nao' ? false : null);
  /* O CARRO É LIMPO E ARRUMADO. "Arrumado" entrou em 24/09/2026 com a fila da
     volta do carro ("se está arrumado etc", o Léo). Não virou critério novo: os
     pesos gravados e as revisões fechadas continuam valendo. Um "não" em
     qualquer dos dois derruba o carro daquela volta; volta antiga, só com
     "limpo", vale pelo que foi respondido. */
  const carroDaVolta = rc => {
    const l = sn(rc && rc.carroLimpo), a = sn(rc && rc.carroArrumado);
    return l === false || a === false ? false : (l || a ? true : null);
  };
  const avaliar = (registros, criterios) => {
    const pesos = criteriosValidos(criterios);
    const pessoas = new Map();
    const cobertura = {limpeza:{conferidas:0,voltas:0}, equipamentos:{conferidas:0,voltas:0}};
    /* UMA VOLTA É UMA VIAGEM (performance-3, 25/09/2026). A fila Volta do
       carro confere dia + carro + equipe uma vez só, e a nota contava cada
       O.S. da viagem: três serviços pequenos com o carro sujo pesavam triplo,
       e "cobriu 12 de 40 voltas" contava O.S. Agora as O.S. da mesma volta
       (r.volta, a chave da fila) viram uma volta, e a fração de cada pessoa
       nela é a média das frações dela nas O.S. da viagem. Registro sem a
       chave (revisão fechada antes) é uma volta por O.S., a conta de antes.
       Baixa do ERP sem viagem (r.voltou === false) não entra no carro: a
       fila nunca a mostra para conferir, e ela só baixava a cobertura. */
    const voltas = new Map();
    (registros || []).forEach((r, i) => {
      if (validar(r.membros)) return;
      for (const p of r.membros) {
        const k = String(p.chave);
        const x = pessoas.get(k) || {chave:k,nome:p.nome,entregas:0,peso:0,pesoConferido:0,voltas:0,base:0,limpeza:{sim:0,total:0,n:0},equipamentos:{sim:0,total:0,n:0}};
        const f = p.percentual / 100;
        x.entregas++; x.peso += f; if (r.confirmado) x.pesoConferido += f;
        pessoas.set(k, x);
      }
      if (r.voltou === false) return;
      const chave = r.volta ? 'v:' + r.volta : 'r:' + i;
      voltas.set(chave, [...(voltas.get(chave) || []), r]);
    });
    // Respostas diferentes na mesma volta: um "não" vale para a viagem.
    const daViagem = xs => xs.includes(false) ? false : (xs.includes(true) ? true : null);
    for (const g of voltas.values()) {
      const limpo = daViagem(g.map(r => carroDaVolta(r.retornoConf)));
      const equip = daViagem(g.map(r => sn(r.retornoConf && r.retornoConf.equipamentosOk)));
      cobertura.limpeza.voltas++; cobertura.equipamentos.voltas++;
      if (limpo !== null) cobertura.limpeza.conferidas++;
      if (equip !== null) cobertura.equipamentos.conferidas++;
      const frac = new Map();
      for (const r of g) for (const p of r.membros) frac.set(String(p.chave), (frac.get(String(p.chave)) || 0) + p.percentual / 100);
      for (const [k, soma] of frac) {
        const x = pessoas.get(k), f = soma / g.length;
        x.voltas++; x.base += f;
        if (limpo !== null) { x.limpeza.total += f; x.limpeza.n++; if (limpo) x.limpeza.sim += f; }
        if (equip !== null) { x.equipamentos.total += f; x.equipamentos.n++; if (equip) x.equipamentos.sim += f; }
      }
    }
    const lista = [...pessoas.values()];
    const lider = lista.reduce((m, x) => Math.max(m, x.peso), 0);
    const arred = v => Math.round(v * 10) / 10;
    const duas = v => Math.round(v * 100) / 100;
    /* A MÉDIA ENTRA VOLTA A VOLTA. Antes ela só valia para quem não tinha
       NENHUMA volta conferida: quem teve 30 entregas e uma única conferência
       "não" (a 25%) ficava com 0 no período inteiro, e o colega nunca
       conferido ficava com a média. Agora cada volta sem resposta da pessoa
       conta pela média do período, na fração que ela teve naquela entrega —
       a evidência pesa o que ela vale. Quem teve tudo conferido e certo segue
       com 100. */
    const media = {}, mediaFrac = {};
    for (const k of ['limpeza', 'equipamentos']) {
      const c = cobertura[k];
      c.ok = c.voltas > 0 && c.conferidas / c.voltas >= COBERTURA_MINIMA;
      const sim = lista.reduce((t, x) => t + x[k].sim, 0), total = lista.reduce((t, x) => t + x[k].total, 0);
      mediaFrac[k] = c.ok && total > 0 ? sim / total : null;
      media[k] = mediaFrac[k] == null ? null : arred(mediaFrac[k] * 100);
    }
    for (const x of lista) {
      const comp = {producao: lider > 0 ? arred(x.peso / lider * 100) : null};
      const imputados = [];
      for (const k of ['limpeza', 'equipamentos']) {
        if (mediaFrac[k] == null || !(x.peso > 0)) { comp[k] = null; continue; }
        // Base = o peso da pessoa nas VOLTAS (não nas O.S.); sem volta nenhuma, vale a média.
        comp[k] = x.base > 0 ? arred((x[k].sim + (x.base - x[k].total) * mediaFrac[k]) / x.base * 100) : arred(mediaFrac[k] * 100);
        if (x[k].total === 0) imputados.push(k);
      }
      let soma = 0, usado = 0; const faltam = [];
      for (const k of CRITERIOS) {
        if (!pesos[k]) continue;
        if (comp[k] == null) { faltam.push(k); continue; }
        soma += comp[k] * pesos[k]; usado += pesos[k];
      }
      x.componentes = comp;
      x.imputados = imputados;   // critérios em que a pessoa não teve nenhuma volta conferida
      x.faltam = faltam;         // critérios fora da conta (cobertura abaixo do mínimo)
      x.nota = usado > 0 ? arred(soma / usado) : null;
      // Só depois de toda a conta: arredondar antes distorceria a comparação com o líder.
      x.peso = duas(x.peso); x.pesoConferido = duas(x.pesoConferido);
    }
    return {pessoas: lista, pesos, lider: duas(lider), media, cobertura, coberturaMinima: COBERTURA_MINIMA};
  };
  /* A MESMA PESSOA NUMA LINHA SÓ. A participação confirmada guarda a chave da
     época: quem era só apelido e depois foi ligado à ficha do RH ficava com
     duas chaves, e o ranking mostrava duas linhas com a produção dividida.
     `trocar(m)` devolve a identidade de hoje ({chave,nome}) ou nada. Dois
     apelidos da mesma pessoa na mesma entrega viram um só, com os percentuais
     somados (sem isso o validar recusaria a entrega calado). Só exibição: o
     registro guardado e o hash do fechamento não mudam. */
  const unirMembros = (membros, trocar) => {
    const por = new Map();
    for (const m of membros || []) {
      const t = trocar && trocar(m);
      const n = t ? {...m, chave:String(t.chave), nome:t.nome || m.nome} : {...m};
      const k = String(n.chave);
      const ja = por.get(k);
      if (ja) ja.percentual = Math.round((Number(ja.percentual) + Number(n.percentual)) * 100) / 100;
      else por.set(k, n);
    }
    return [...por.values()];
  };
  return {unirMembros,unicos,iguais,ratearCentavos,validar,composicao,resumir,incluiPessoa,manterPesos,dossie,equipeDoRegistro,comEquipes,composicaoCom,ranquear,avaliar,criteriosValidos,carroDaVolta,CRITERIOS_PADRAO,COBERTURA_MINIMA};
})();
if (typeof module !== 'undefined') module.exports = PERF;

// Fonte de apuração isolada do cache operacional e dos lançamentos offline.
let perfRemoto = {chave:'',dados:null,fechamentos:[],carregando:false,erro:'',selecionado:'',tentado:false};
function perfChave(){const f=periodoOuMes('_fPerf');return f.de+'|'+f.ate;}
function perfFonteAtual(){
  if(perfRemoto.chave!==perfChave())return null;
  return perfRemoto.selecionado?perfRemoto.fechamentos.find(x=>x.id===perfRemoto.selecionado):perfRemoto.dados;
}
function perfLista(){
  const fonte=perfFonteAtual();
  if(!fonte)return classificarEntregas(STORE.getAllOS()).instalacoes;
  return fonte.registros.map(r=>({id:r.id,numero:r.numero,cliente:r.cliente,finalizadaEm:r.dia,equipe:r.membros.map(p=>p.nome),retrabalho:r.retrabalho,_perf:r}));
}
function perfOS(id){return perfLista().find(o=>o.id===id) || STORE.getOS(id);}
/* A apuração do servidor é só da gestão do PCP (o pcp-sync recusa os outros
   papéis). Para montagem e operação a tela era um alerta vermelho permanente
   e um botão que sempre falhava; agora é uma prévia dita como prévia. */
function perfConsultaServidor(){return typeof STATE==='undefined' || ['admin','pcp'].includes(String(STATE.user?.papel || ''));}
// Erro de rede do navegador e tempo esgotado em português; mensagem termina com ponto.
function perfErroTxt(e){const m=String(e && e.message || '');if(!m || e?.name==='TypeError' || e?.name==='AbortError' || /failed to fetch|load failed|networkerror|network request|abort|timeout|timed out/i.test(m))return 'Sem conexão com o servidor. Tente de novo.';return /[.!?]$/.test(m)?m:m+'.';}
function perfFonteTexto(){const f=perfFonteAtual();if(!f && !perfConsultaServidor())return 'Prévia do aparelho. A apuração oficial é feita pela gestão do PCP.';return f?(f.fechadoEm?'Fechamento preservado · revisão '+f.revisao+' · '+f.fechadoPor+' · '+new Date(f.fechadoEm).toLocaleString('pt-BR'):'Base compartilhada do PCP · consultada em '+new Date(f.consultadoEm).toLocaleString('pt-BR'))+'. '+f.fonte:'Prévia local incompleta. Aguarde a consulta ao servidor antes de apurar.';}
function perfFonteHTML(){
 const f=perfFonteAtual(),pendentes=STORE.getQueue?.().length || 0;
 if(!perfConsultaServidor())return `<section class="perf-fonte"><h3>Base da apuração</h3><p>${esc(perfFonteTexto())}</p></section>`;
 /* Conferir voltas (ou mexer numa O.S.) depois da consulta não muda a nota
    até nova consulta; sem este aviso parecia que a conferência não contou.
    Só conta O.S. finalizada no período apurado e mexida por gente: a
    importação do ERP e um card aberto de outro mês acendiam o aviso a cada
    hora, e aviso sempre ligado ninguém lê. */
 const per=periodoOuMes('_fPerf');
 const consulta=Date.parse(f?.consultadoEm || ''),mudou=!!f && !f.fechadoEm && Number.isFinite(consulta) && (STORE.getAllOS?.() || []).some(o=>o.finalizadaEm && OPERACAO.emIntervalo(o.finalizadaEm,per.de,per.ate) && !/^Mubisys/i.test(String(o.atualizadoPor || '')) && Date.parse(o.atualizadoEm || '')>consulta);
 return `<section class="perf-fonte"><h3>Base da apuração e fechamentos</h3><p>${esc(perfFonteTexto())}</p>${mudou?'<p class="perf-coverage">Houve mudanças nas O.S. depois desta consulta (voltas conferidas, por exemplo). Toque em Atualizar apuração para a nota contar com elas.</p>':''}${pendentes?`<p class="perf-coverage">${pendentes} alterações locais aguardam sincronização. O servidor ainda pode não conter essas alterações.</p>`:''}${perfRemoto.erro?`<p role="alert">${esc(perfRemoto.erro)}</p>`:''}<div class="perf-filtros"><button class="btn-ghost" id="perf-atualizar-fonte" ${perfRemoto.carregando?'disabled':''}>${perfRemoto.carregando?'Consultando servidor…':'Atualizar apuração'}</button><label>Versão da apuração <select id="perf-versao"><option value="">Dados atuais</option>${perfRemoto.fechamentos.map(r=>`<option value="${esc(r.id)}" ${r.id===perfRemoto.selecionado?'selected':''}>Revisão ${r.revisao} · ${esc(r.fechadoEm.slice(0,10))} · ${esc(r.fechadoPor)}</option>`).join('')}</select></label>${perfPodeEditar()?`<button class="btn-primary" id="perf-fechar" ${!f||f.fechadoEm||pendentes||perfRemoto.carregando?'disabled':''}>${perfRemoto.fechamentos.length?'Criar nova revisão':'Fechar período'}</button>`:''}</div>${f?.motivo?`<p>Motivo: ${esc(f.motivo)}</p>`:''}<p class="metricas-nota">Cada revisão preserva datas, participantes, percentuais e valores. Uma nova revisão não apaga a anterior. Fechar não calcula nem paga bonificação.</p></section>`;
}
async function perfCarregarFonte(){
 const chave=perfChave(),f=periodoOuMes('_fPerf');
 if(perfRemoto.chave===chave && perfRemoto.carregando)return;
 const pedido={chave,dados:null,fechamentos:[],carregando:true,erro:'',selecionado:'',tentado:true};perfRemoto=pedido;
 renderPerformanceCasa();
 try{
   if(!f.de||!f.ate)throw new Error('Selecione as datas inicial e final para consultar a base completa.');
   // A configuração vem junto: os pesos da nota na tela têm de ser os que o fechamento vai selar.
   const [dados,historico]=await Promise.all([STORE.api({action:'performancePeriodo',...f}),STORE.api({action:'performanceFechamentos',...f}),typeof STORE.pullCFG==='function'?STORE.pullCFG().catch(()=>false):null]);
   if(!dados?.completo || !Array.isArray(dados.registros) || !Array.isArray(historico?.fechamentos))throw new Error(dados?.error||historico?.error||'Consulta incompleta. O fechamento permanece indisponível.');
   pedido.dados=dados;pedido.fechamentos=historico.fechamentos;
 }catch(e){pedido.erro=perfErroTxt(e);}
 finally{pedido.carregando=false;if(perfRemoto===pedido && perfChave()===chave)renderPerformanceCasa();}
}
function perfWireFonte(el){
 const atualizar=el.querySelector('#perf-atualizar-fonte');if(atualizar)atualizar.onclick=perfCarregarFonte;
 const versao=el.querySelector('#perf-versao');if(versao)versao.onchange=()=>{perfRemoto.selecionado=versao.value;renderPerformanceCasa();};
 const fechar=el.querySelector('#perf-fechar');if(fechar)fechar.onclick=()=>{
   const fonte=perfFonteAtual();if(!fonte || fonte.fechadoEm || STORE.getQueue().length)return;
   // Diz QUAIS travam: com tudo confirmado, uma O.S. sem valor travava o fechamento sem nome.
   const pend=fonte.registros.filter(r=>!r.confirmado),semValor=fonte.registros.filter(r=>r.valor==null);
   if(!fonte.registros.length)return toast('Nenhuma entrega no período para fechar.','error');
   if(pend.length || semValor.length)return toast([pend.length?`${pend.length} ${pend.length===1?'entrega sem participação confirmada':'entregas sem participação confirmada'}`:'',semValor.length?`${semValor.length} sem valor: O.S. ${semValor.slice(0,6).map(r=>r.numero || 's/n').join(', ')}${semValor.length>6?' e outras':''}`:''].filter(Boolean).join('. ')+'. Use o filtro Situação da lista para achar cada uma.','error');
   // Quem fecha sela os pesos do SERVIDOR. Se o aparelho mostra outros (alguém
   // mudou em outro tablet), o ranking visto não é o que seria selado.
   if(fonte.criterios && JSON.stringify(PERF.criteriosValidos(fonte.criterios))!==JSON.stringify(perfCriterios())){perfRemoto.dados=null;perfRemoto.tentado=false;renderPerformanceCasa();return toast('Os pesos da nota mudaram. Atualize e confira o ranking antes de fechar.','error');}
   const d=perfDialog('Conferir fechamento',`<p>${esc(fonte.periodo.de)} a ${esc(fonte.periodo.ate)} · ${fonte.registros.length} entregas. A cópia será preservada no servidor.</p><form><label>Motivo do fechamento ou revisão <textarea name="motivo" minlength="5" maxlength="500" required></textarea></label><p>As revisões anteriores continuarão disponíveis. Não há lançamento de pagamento.</p><button class="btn-primary" type="submit">Confirmar fechamento</button><p role="alert" id="perf-fechar-erro"></p></form>`);
   const requestId=STORE.uuid(),anterior=perfRemoto.fechamentos[0]?.id || '';
   d.querySelector('form').onsubmit=async ev=>{
     ev.preventDefault();const btn=d.querySelector('[type="submit"]');btn.disabled=true;
     try{if(STORE.getQueue().length)throw new Error('Há alterações aguardando envio. Sincronize e atualize a apuração.');
       const r=await STORE.api({action:'performanceFechar',...fonte.periodo,hash:fonte.hash,anterior,requestId,motivo:new FormData(ev.target).get('motivo')});
       if(!r?.ok||!r.fechamento)throw new Error(r?.error || 'Não foi possível confirmar o fechamento.');
       d.close();await perfCarregarFonte();if(perfRemoto.chave===fonte.periodo.de+'|'+fonte.periodo.ate){perfRemoto.selecionado=r.fechamento.id;renderPerformanceCasa();}toast('Fechamento preservado no servidor.','success');
     }catch(e){d.querySelector('#perf-fechar-erro').textContent=e.message;}finally{btn.disabled=false;}
   };
 };
 if(typeof STORE.api==='function' && perfConsultaServidor() && (perfRemoto.chave!==perfChave() || !perfRemoto.tentado))void perfCarregarFonte();
}

const PERF_EMBLEMAS = ['🦅','🚀','🎯','🛡️','⚡','🦁','🏔️','🤝'];
function perfConfig() {
  const c = STORE.getCFG().performancePCP || {};
  const base = {equipes:Array.isArray(c.equipes)?c.equipes:[],participacoes:Array.isArray(c.participacoes)?c.participacoes:[]};
  // Os pesos da nota viajam juntos: sem isto, salvar uma equipe apagaria os pesos.
  if (c.criterios) base.criterios = c.criterios;
  return base;
}
function perfPessoa(n) { const p = nomeExibicaoCasa(n); return {chave:String(p.chave),nome:p.nome,apelido:n}; }
// Chave de ficha do RH fica como está (resolver pelo nome completo pode não
// achar a ficha); chave de apelido é trocada pela identidade de hoje.
function perfChaveDeHoje(m) {
  const k = String(m && m.chave || '');
  // Só a chave de APELIDO é trocada (ela é igual ao próprio apelido, ou ao nome
  // em registro antigo). Chave de ficha nunca é: a de quem saiu do elenco iria
  // parar em outra pessoa que hoje responde pelo mesmo apelido.
  if (k !== String((m && (m.apelido || m.nome)) || '')) return null;
  const rh = typeof pessoasRH === 'function' ? pessoasRH() : [];
  if (rh.some(p => String(p.chave) === k || String(p.id) === k)) return null;
  const p = perfPessoa(m.apelido || m.nome || k);
  return p.chave === k ? null : p;
}
/* "Carro limpo 0" precisa dizer DE QUAL volta veio: a conferência aparece em
   cada entrega da lista e no detalhe da O.S. Texto curto e sem ambiguidade,
   porque a busca da lista filtra por ele ("carro não" acha os carros sujos). */
function perfVoltaTxt(rc) {
  const v = x => x === 'sim' || x === true ? 'sim' : (x === 'nao' || x === false ? 'não' : 'sem resposta');
  const c = rc || {};
  const avaria = c.semAvaria === 'nao' || c.semAvaria === false ? ' · ⚠️ avaria' : '';
  return `🚗 limpo ${v(c.carroLimpo)} · 📦 arrumado ${v(c.carroArrumado)} · 🧰 equip. ${v(c.equipamentosOk)}${avaria}`;
}
function perfUnirPessoas(regs) { return (regs || []).map(r => ({...r, membros: PERF.unirMembros(r.membros, perfChaveDeHoje)})); }
function perfEquipeOS(os) { return PERF.unicos(OPERACAO.equipe(os).map(perfPessoa)); }
function perfRegistro(os,c) {
  if(os._perf)return {...os._perf,os,membros:os._perf.confirmado?os._perf.membros:os._perf.membros.map(p=>({...perfPessoa(p.nome),percentual:p.percentual}))};
  const salvo = c.participacoes.find(p=>p.id===os.id);
  // Um registro confirmado mantém a composição e o nome da época.
  const membros = salvo ? salvo.membros : PERF.iguais(perfEquipeOS(os));
  // voltou e volta: os mesmos da base do servidor (perfFonte) e da fila Volta do carro.
  // Conferido com typeof: aba com operacao.js antigo em cache não pode derrubar a tela.
  return {...(salvo || {}),id:os.id,os,membros,valor:valorDaOS(os),confirmado:!!salvo && !PERF.validar(membros),retornoConf:os.retornoConf || null,voltou:typeof OPERACAO.voltou==='function'?OPERACAO.voltou(os):undefined,volta:typeof OPERACAO.chaveDaVolta==='function'?OPERACAO.chaveDaVolta(os):''};
}
async function perfSalvar(c) {
  const cfg = STORE.getCFG(); cfg.performancePCP = c; STORE.saveCFG(cfg);
  perfRemoto.dados=null;perfRemoto.erro='Alteração local: aguardando sincronização e nova consulta.';
  toast('Alteração salva no aparelho; sincronizando com o servidor.','success');
  try{await STORE.trySync();if(!STORE.getQueue().length)await perfCarregarFonte();}catch(e){perfRemoto.erro='Alteração guardada no aparelho. Sincronize e atualize a apuração.';}

}
function perfPodeEditar() { return ['admin','pcp'].includes(STATE.user?.papel) && (typeof podeEditar !== 'function' || podeEditar()); }
function perfFormato(n) { return Number(n).toLocaleString('pt-BR',{maximumFractionDigits:2}); }
function perfDialog(titulo,corpo) {
  let d = document.getElementById('perf-dialog');
  if (!d) {d=document.createElement('dialog');d.id='perf-dialog';document.body.appendChild(d);}
  d.innerHTML=`<div class="perf-dialog-head"><h2>${esc(titulo)}</h2><button type="button" class="btn-ghost" aria-label="Fechar edição">✕</button></div>${corpo}`;
  d.querySelector('[aria-label="Fechar edição"]').onclick=()=>d.close(); d.showModal(); return d;
}
function perfEscolherMembrosHTML(membros) {
  const conhecidos = PERF.unicos([...membros,...(equipeEscalavel().doPCP || []).map(perfPessoa)]);
  return `<label>Buscar pessoa <input type="search" data-perf-busca placeholder="Nome ou apelido"></label><div class="perf-members">${conhecidos.map(p=>`<label class="perf-member"><input type="checkbox" name="membro" value="${esc(p.chave)}" data-nome="${esc(p.nome)}" data-apelido="${esc(p.apelido || p.nome)}" ${membros.some(m=>m.chave===p.chave)?'checked':''}><span>${esc(p.nome)}</span></label>`).join('')}</div>`;
}
function perfWireBusca(box) {
  const busca=box.querySelector('[data-perf-busca]');
  if(busca) busca.oninput=()=>box.querySelectorAll('.perf-member').forEach(n=>{n.hidden=!n.querySelector('input').checked && !normCasa(n.textContent).includes(normCasa(busca.value));});
}
function perfMarcados(box) { return [...box.querySelectorAll('input[name="membro"]:checked')].map(e=>({chave:e.value,nome:e.dataset.nome,apelido:e.dataset.apelido})); }
function perfEditarEquipe(id,membrosIniciais=[]) {
  if(!perfPodeEditar()) return;
  const c=perfConfig(), e=c.equipes.find(e=>e.id===id) || {nome:'',emblema:'🦅',membros:membrosIniciais};
  let logo = perfLogoValido(e.logo) ? e.logo : '';
  const d=perfDialog(id?'Editar equipe':'Criar equipe',`<form id="perf-equipe-form">
    <label>Nome da equipe <input name="nome" maxlength="60" required value="${esc(e.nome)}" placeholder="Ex.: Horizonte, Impulso, Precisão"></label>
    <fieldset class="perf-logo-campo"><legend>Logo da equipe</legend>
      <div class="perf-logo-linha">
        <span id="perf-logo-previa">${perfLogoHTML({logo, emblema:e.emblema}, 'perf-logo-grande')}</span>
        <div class="perf-logo-botoes">
          <label class="btn-ghost perf-logo-enviar">📷 Enviar imagem<input type="file" accept="image/png,image/jpeg,image/webp,image/*" id="perf-logo-arquivo" hidden></label>
          <button type="button" class="btn-ghost" id="perf-logo-remover" ${logo?'':'hidden'}>Remover imagem</button>
          <small>Vira um quadrado de 160 px, reduzido no próprio aparelho. Sem imagem, vale o emblema abaixo.</small>
          <small id="perf-logo-uso"></small>
        </div>
      </div>
      <p role="alert" id="perf-logo-erro" class="perf-logo-erro"></p>
    </fieldset>
    <fieldset class="perf-emblemas"><legend>Emblema (quando não houver imagem)</legend>${PERF_EMBLEMAS.map(x=>`<label><input type="radio" name="emblema" value="${x}" ${x===e.emblema?'checked':''}><span>${x}</span></label>`).join('')}</fieldset>
    ${perfEscolherMembrosHTML(e.membros)}
    <p class="metricas-nota">A equipe é um modelo reutilizável. Alterar integrantes aqui não muda entregas já confirmadas. Entregas feitas por exatamente estes integrantes passam a aparecer com este nome.</p>
    <div class="perf-equipe-acoes">
      <button class="btn-primary" type="submit">Salvar equipe</button>
      ${id ? `<button type="button" class="btn-ghost ${e.ativo===false?'':'perf-perigo'}" id="perf-equipe-ativo">${e.ativo===false?'Reativar equipe':'Desativar equipe'}</button>` : ''}
    </div>
  </form>`);
  perfWireBusca(d);
  const previa=d.querySelector('#perf-logo-previa'), remover=d.querySelector('#perf-logo-remover'), erro=d.querySelector('#perf-logo-erro');
  const emblemaAtual=()=>String(new FormData(d.querySelector('form')).get('emblema')||e.emblema||'🤝');
  const uso=d.querySelector('#perf-logo-uso');
  // Soma dos logos de TODAS as equipes (as desativadas também contam: ficam na configuração).
  const somaCom=()=>perfSomaLogos(perfConfig().equipes.filter(x=>x.id!==id))+(logo?logo.length:0);
  const repintar=()=>{previa.innerHTML=perfLogoHTML({logo,emblema:emblemaAtual()},'perf-logo-grande');remover.hidden=!logo;
    const t=somaCom();uso.textContent=`Logos de todas as equipes: ${Math.ceil(t/1024)} de ${PERF_LOGOS_MAX/1000} KB`;uso.classList.toggle('perf-logo-erro',t>PERF_LOGOS_MAX);};
  repintar();
  d.querySelectorAll('input[name="emblema"]').forEach(r=>r.onchange=repintar);
  d.querySelector('#perf-logo-arquivo').onchange=async ev=>{
    const arq=ev.target.files && ev.target.files[0]; if(!arq) return;
    erro.textContent='Reduzindo a imagem…';
    try{logo=await perfReduzirLogo(arq);erro.textContent='';repintar();}
    catch(x){erro.textContent=x.message||'Não foi possível usar esta imagem.';}
    finally{ev.target.value='';}
  };
  remover.onclick=()=>{logo='';repintar();};
  /* DESATIVAR, NÃO APAGAR: a equipe some das escolhas mas continua dona do
     histórico — entrega confirmada com ela não pode ficar sem nome. */
  const alternar=d.querySelector('#perf-equipe-ativo');
  if(alternar) alternar.onclick=()=>{
    const atual=perfConfig(), agora=atual.equipes.find(x=>x.id===id);
    if(!agora) return;
    if(JSON.stringify(agora)!==JSON.stringify(e)) return toast('Esta equipe mudou enquanto você editava. Reabra a edição para conferir.','error');
    // Desativar grava só o estado: o que foi mudado no formulário se perderia calado.
    const fdAgora=new FormData(d.querySelector('form'));
    const editado=String(fdAgora.get('nome')||'').trim()!==e.nome || String(fdAgora.get('emblema')||e.emblema)!==e.emblema || (logo||'')!==(e.logo||'') || PERF.composicao(perfMarcados(d))!==PERF.composicao(e.membros);
    if(editado && !confirm('Há mudanças não salvas neste formulário. Elas serão descartadas. Continuar?')) return;
    if(agora.ativo!==false && !confirm(`Desativar "${agora.nome}"? Ela some das escolhas e as entregas destes integrantes deixam de aparecer com este nome. O histórico já confirmado com ela continua.`)) return;
    if(agora.ativo===false){
      const res=perfOpcoesEquipe().resolver, k=PERF.composicaoCom(agora.membros,res);
      const gemea=atual.equipes.find(x=>x.id!==id && x.ativo!==false && PERF.composicaoCom(x.membros,res)===k);
      if(gemea) return toast(`Estes integrantes já formam a equipe "${gemea.nome}". Desative-a antes de reativar esta.`,'error');
    }
    if(perfSomaLogos(atual.equipes)>PERF_LOGOS_MAX) return toast('Os logos das equipes passam de 400 KB. Remova o logo de alguma equipe antes.','error');
    atual.equipes=atual.equipes.map(x=>x.id===id?{...x,ativo:x.ativo===false}:x);perfSalvar(atual);d.close();renderPerformanceCasa();
  };
  d.querySelector('form').onsubmit=ev=>{
    ev.preventDefault();const fd=new FormData(ev.target), membros=perfMarcados(d);
    if(!membros.length) return toast('Escolha os integrantes.','error');
    const nome=String(fd.get('nome')||'').trim(); if(!nome) return;
    const atual=perfConfig();
    if(id && JSON.stringify(atual.equipes.find(x=>x.id===id))!==JSON.stringify(e)) return toast('Esta equipe mudou enquanto você editava. Reabra a edição para conferir.','error');
    /* A mesma composição não pode virar duas equipes: o ranking não saberia
       de quem é cada entrega. */
    const novo={...e,id:id || STORE.uuid(),nome,emblema:String(fd.get('emblema')||'🤝'),membros,ativo:e.ativo===false?false:true};
    if(logo) novo.logo=logo; else delete novo.logo;
    /* Duas equipes ATIVAS com os mesmos integrantes: o ranking não saberia de
       quem é cada entrega. Equipe desativada não disputa nada — pode ser
       renomeada e ganhar logo à vontade (o servidor aplica a mesma regra). */
    if(novo.ativo!==false){
      const res=perfOpcoesEquipe().resolver, k=PERF.composicaoCom(membros,res);
      const gemea=atual.equipes.find(x=>x.id!==novo.id && x.ativo!==false && PERF.composicaoCom(x.membros,res)===k);
      if(gemea) return toast(`Estes integrantes já formam a equipe "${gemea.nome}". Edite-a em vez de criar outra.`,'error');
    }
    /* O teto da soma dos logos é conferido AQUI, antes de gravar: se só o
       servidor recusasse, a tela diria "salva" e o aparelho carregaria uma
       configuração que nunca chega lá. */
    const soma=perfSomaLogos(atual.equipes.filter(x=>x.id!==novo.id).concat(novo));
    if(soma>PERF_LOGOS_MAX) return toast(`Os logos das equipes somariam ${Math.ceil(soma/1024)} KB, acima do limite de 400 KB. Remova o logo de uma equipe (as desativadas também contam) ou use uma imagem mais simples.`,'error');
    atual.equipes=atual.equipes.filter(x=>x.id!==novo.id).concat(novo);perfSalvar(atual);d.close();renderPerformanceCasa();
  };
}
function perfEditarParticipacao(id) {
  if(!perfPodeEditar()) return;
  const os=perfOS(id); if(!os || perfFonteAtual()?.fechadoEm) return;
  const c=perfConfig(), r=perfRegistro(os,c);
  /* A equipe que a tela já mostra para esta entrega vem marcada. Sem isto, uma
     entrega que o ranking chama de "Horizonte" abria em "avulsa", e confirmar
     gravava equipeId vazio — o histórico ficava dependendo da composição. */
  // A mesma regra do ranking: entrega já confirmada (como avulsa) não ganha, calada,
  // a equipe criada depois. Não confirmada junta os apelidos da mesma pessoa, como
  // a lista mostra; confirmada fica como foi gravada.
  const equipeSugerida = r.equipeId || (PERF.equipeDoRegistro(r, c.equipes, perfOpcoesEquipe().resolver) || {}).id || '';
  let membros=(r.confirmado ? r.membros : perfUnirPessoas([r])[0].membros).map(p=>({...p}));
  const d=perfDialog('Participação · O.S. '+(os.numero||''),`<p>${esc(os.cliente||'')} · ${esc(os.servico||'')}</p><form id="perf-part-form"><label>Usar uma equipe <select name="equipe"><option value="">Participação individual / avulsa</option>${c.equipes.filter(e=>e.ativo!==false || e.id===equipeSugerida).map(e=>`<option value="${esc(e.id)}" ${e.id===equipeSugerida?'selected':''}>${esc(e.emblema)} ${esc(e.nome)}</option>`).join('')}</select></label><p class="metricas-nota">Confirme quem trabalhou nesta entrega. A escolha não altera a programação da O.S.</p><div id="perf-part-members">${perfEscolherMembrosHTML(membros)}</div><div id="perf-pesos"></div><button type="button" class="btn-ghost" id="perf-igual">Dividir igualmente</button><p id="perf-soma" aria-live="polite"></p><label>Observação da apuração <input name="obs" maxlength="300" value="${esc(r.obs||'')}" placeholder="Motivo de um ajuste, participação extra…"></label><button class="btn-primary" type="submit">Confirmar participação</button></form>`);
  const desenharPesos=()=>{
    d.querySelector('#perf-pesos').innerHTML=membros.map(p=>`<label class="perf-peso"><span>${esc(p.nome)}</span><input aria-label="Percentual de ${esc(p.nome)}" type="number" min="0.01" max="100" step="0.01" required data-chave="${esc(p.chave)}" value="${p.percentual}"><span>%</span></label>`).join('');
    const total=()=>{d.querySelector('#perf-soma').textContent='Total: '+perfFormato(membros.reduce((s,p)=>s+Number(p.percentual||0),0))+'% · precisa somar 100%';};
    d.querySelectorAll('[data-chave]').forEach(i=>i.oninput=()=>{membros.find(p=>p.chave===i.dataset.chave).percentual=Number(i.value);total();});total();
  };
  const ligarMembros=()=>{perfWireBusca(d);d.querySelectorAll('[name="membro"]').forEach(cb=>cb.onchange=()=>{membros=PERF.manterPesos(membros,perfMarcados(d));desenharPesos();});};
  d.querySelector('[name="equipe"]').onchange=ev=>{
    const equipe=c.equipes.find(e=>e.id===ev.target.value);if(!equipe) return;
    membros=PERF.iguais(equipe.membros);d.querySelector('#perf-part-members').innerHTML=perfEscolherMembrosHTML(membros);ligarMembros();desenharPesos();
  };
  d.querySelector('#perf-igual').onclick=()=>{membros=PERF.iguais(membros);desenharPesos();};ligarMembros();desenharPesos();
  d.querySelector('form').onsubmit=ev=>{
    ev.preventDefault();const erro=PERF.validar(membros);if(erro)return toast(erro,'error');
    const fd=new FormData(ev.target), equipe=c.equipes.find(e=>e.id===fd.get('equipe'));
    const novo={id,numero:String(os.numero||''),membros:membros.map(p=>({...p})),equipeId:equipe?.id||'',equipeNome:equipe?.nome||'',emblema:equipe?.emblema||'🤝',obs:String(fd.get('obs')||'').trim(),em:new Date().toISOString(),por:STATE.user?.nome||''};
    const atual=perfConfig();
    if(JSON.stringify(atual.participacoes.find(p=>p.id===id))!==JSON.stringify(c.participacoes.find(p=>p.id===id))) return toast('Esta participação mudou enquanto você editava. Reabra a conferência.','error');
    atual.participacoes=atual.participacoes.filter(p=>p.id!==id).concat(novo);perfSalvar(atual);d.close();renderPerformanceCasa();
  };
}
/* ---------------------------------------------------------------- LOGO
 * A imagem da equipe é reduzida NO APARELHO antes de ir para a configuração
 * global, que todo tablet baixa. Recorte quadrado ao centro, 160 px. Tenta WebP
 * (menor, com transparência); o Safari não gera WebP pelo canvas e devolve PNG,
 * então PNG é a segunda tentativa; JPEG por último, sobre fundo branco, porque
 * JPEG não tem transparência e o fundo sairia preto. Mesmo teto do servidor. */
/* As opções da regra de equipe na tela: a chave de cada pessoa resolvida
   agora (ficha do RH ou apelido) e, numa revisão fechada, o histórico intacto. */
function perfOpcoesEquipe() {
  return { resolver: m => perfPessoa(m.apelido || m.nome).chave, historico: !!(perfFonteAtual() && perfFonteAtual().fechadoEm) };
}
const PERF_LOGOS_MAX = 400000;
function perfSomaLogos(equipes) { return (equipes || []).reduce((t, e) => t + (perfLogoValido(e.logo) ? e.logo.length : 0), 0); }
const PERF_LOGO_MAX = 40000;
const PERF_LOGO_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
function perfLogoValido(logo) { return typeof logo === 'string' && logo.length <= PERF_LOGO_MAX && PERF_LOGO_RE.test(logo); }
function perfLogoHTML(e, classe) {
  const cls = classe || 'perf-emblema';
  // Só renderiza imagem que passou na mesma régua do servidor: nada de SVG
  // (carrega script) nem de endereço externo.
  if (e && perfLogoValido(e.logo)) return `<img class="${cls} perf-logo" src="${esc(e.logo)}" alt="" loading="lazy">`;
  return `<span class="${cls}" aria-hidden="true">${esc((e && e.emblema) || '🤝')}</span>`;
}
async function perfReduzirLogo(arquivo) {
  if (!arquivo || !/^image\//.test(arquivo.type || '')) throw new Error('Escolha um arquivo de imagem.');
  // Foto de celular passa de 5 MB; acima de 20 MB é engano de arquivo.
  if (arquivo.size > 20 * 1024 * 1024) throw new Error('Arquivo grande demais para um logo (mais de 20 MB).');
  /* LIDO COMO DADO, não como endereço blob:. Uma política de segurança que
     proíba blob: (a prévia local tem uma) fazia a imagem "não carregar" sem
     dizer por quê; data: passa em qualquer política razoável. */
  const url = await new Promise((ok, erro) => {
    const leitor = new FileReader();
    leitor.onload = () => ok(String(leitor.result || ''));
    leitor.onerror = () => erro(new Error('Não deu para ler este arquivo.'));
    leitor.readAsDataURL(arquivo);
  });
  {
    const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => erro(new Error('Não deu para ler esta imagem. Use PNG, JPEG ou WebP.')); i.src = url; });
    const lado = 160, lado0 = Math.min(img.naturalWidth, img.naturalHeight);
    if (!lado0) throw new Error('Imagem vazia.');
    const sx = (img.naturalWidth - lado0) / 2, sy = (img.naturalHeight - lado0) / 2;
    const tela = document.createElement('canvas'); tela.width = tela.height = lado;
    const g = tela.getContext('2d');
    const desenhar = fundo => { g.clearRect(0, 0, lado, lado); if (fundo) { g.fillStyle = fundo; g.fillRect(0, 0, lado, lado); } g.drawImage(img, sx, sy, lado0, lado0, 0, 0, lado, lado); };
    /* PNG só se sair PEQUENO. No iPad o canvas não gera WebP e cai no PNG, que
       num logo em degradê dá 33 mil caracteres contra 4,5 mil do JPEG: doze
       logos assim estouravam o teto da soma. Logo chapado (poucas cores) sai
       PNG pequeno e mantém a transparência; o resto vai de JPEG. */
    const tentativas = [['image/webp', .86, '', PERF_LOGO_MAX], ['image/webp', .7, '', PERF_LOGO_MAX], ['image/png', 1, '', 12000], ['image/jpeg', .82, '#fff', PERF_LOGO_MAX], ['image/jpeg', .6, '#fff', PERF_LOGO_MAX]];
    for (const [tipo, q, fundo, teto] of tentativas) {
      desenhar(fundo);
      const d = tela.toDataURL(tipo, q);
      if (d.startsWith('data:' + tipo) && d.length <= teto && PERF_LOGO_RE.test(d)) return d;
    }
    throw new Error('Mesmo reduzida, a imagem passou de 40 KB. Tente uma mais simples.');
  }
}

/* ------------------------------------------------- RANKING INDIVIDUAL
 * "O peso é individual" (o dono, 23/09/2026). O ranking que vale é o da
 * pessoa, pela NOTA: produção pelo peso de cada entrega (não pela contagem),
 * mais limpeza do carro e equipamentos conferidos na volta, com os pesos que a
 * gestão define aqui mesmo. As outras duas medidas ficam à mão para quem quer
 * olhar um critério só.
 */
const PERF_CRIT_ROTULO = {producao:'Produção', limpeza:'Carro (limpo e arrumado)', equipamentos:'Equipamentos'};
function perfCriterios() { return PERF.criteriosValidos(perfConfig().criterios); }
function perfEquipeDaPessoa(chave, salvas) {
  const suas = (salvas || []).filter(e => e.ativo !== false && (e.membros || []).some(m => String(m.chave) === String(chave)));
  return suas;
}
function perfRankingPessoasHTML(regs, c) {
  const medida = ['nota', 'peso', 'valor'].includes(STATE._perfPessoaMedida) ? STATE._perfPessoaMedida : 'nota';
  /* Revisão FECHADA usa os pesos selados no fechamento, nunca os de hoje:
     mexer nos pesos depois não pode reordenar um mês já fechado. */
  const fonte = perfFonteAtual(), fechada = !!(fonte && fonte.fechadoEm);
  const av = PERF.avaliar(regs, fechada ? (fonte.criterios || {producao:100, limpeza:0, equipamentos:0}) : perfCriterios());
  const apurado = PERF.resumir(regs.filter(r => r.confirmado)).pessoas;
  const valorDe = new Map(apurado.map(x => [String(x.chave), x]));
  let linhas, fora = [];
  if (medida === 'valor') {
    const com = av.pessoas.filter(p => { const v = valorDe.get(String(p.chave)); return v && v.os > v.semValor; });
    fora = av.pessoas.filter(p => !com.includes(p));
    linhas = PERF.ranquear(com.map(p => ({...p, valorConf: valorDe.get(String(p.chave)).valor})), p => p.valorConf);
  } else if (medida === 'peso') {
    linhas = PERF.ranquear(av.pessoas, p => p.peso);
  } else {
    const com = av.pessoas.filter(p => p.nota != null);
    fora = av.pessoas.filter(p => p.nota == null);
    linhas = PERF.ranquear(com, p => p.nota);
  }
  const fmt = n => perfFormato(n);
  const numero = p => medida === 'valor' ? dinheiroCasa(p.valorConf) : (medida === 'peso' ? fmt(p.peso) : fmt(p.nota));
  const semValorP = p => { const v = valorDe.get(String(p.chave)); return v ? v.semValor : 0; };
  const rotulo = p => medida === 'valor' ? ('rateado e confirmado' + (semValorP(p) ? ` · parcial (${semValorP(p)} sem valor)` : '')) : (medida === 'peso' ? 'O.S. equivalentes' : 'pontos de 100');
  const foto = (p, cls) => `<span class="${cls} perf-foto">${avatarRH(pessoasRH().find(x => [x.chave, x.id].includes(p.chave)) || {nome: p.nome})}</span>`;
  const selo = p => {
    const eqs = perfEquipeDaPessoa(p.chave, c.equipes);
    if (!eqs.length) return '';
    return `<span class="perf-selo-equipe" title="${esc(eqs.map(e => e.nome).join(', '))}">${perfLogoHTML(eqs[0], 'perf-selo-logo')}${esc(eqs[0].nome)}${eqs.length > 1 ? ` +${eqs.length - 1}` : ''}</span>`;
  };
  // A composição da nota, dita, para ninguém ter de adivinhar de onde veio.
  const partes = p => ['producao', 'limpeza', 'equipamentos'].filter(k => av.pesos[k] > 0).map(k => {
    const v = p.componentes[k];
    const media = (p.imputados || []).includes(k);
    const n = k === 'producao' ? null : p[k].n;
    // Voltas da pessoa, não O.S.: três serviços na mesma viagem são uma volta.
    const nv = p.voltas ?? p.entregas;
    const dica = k === 'producao' ? '' : ` · ${n} de ${nv} ${nv === 1 ? 'volta conferida' : 'voltas conferidas'}${n < nv && v != null ? '; as outras contam pela média do período' : ''}`;
    return `<span class="perf-crit ${v == null ? 'sem' : ''} ${media ? 'media' : ''}" title="${esc(PERF_CRIT_ROTULO[k])} · peso ${av.pesos[k]}%${dica}">${esc(PERF_CRIT_ROTULO[k])} <b>${v == null ? 'fora' : fmt(v)}</b>${media ? '<i>média</i>' : (n != null && v != null && n < nv ? `<i>${n}/${nv}</i>` : '')}</span>`;
  }).join('');
  const detalhe = p => medida === 'nota'
    ? `<div class="perf-crits">${partes(p)}</div>${(p.imputados || []).length ? `<small class="perf-parcial">sem volta conferida em ${p.imputados.map(k => PERF_CRIT_ROTULO[k].toLowerCase()).join(' e ')}: usa a média do período</small>` : ''}`
    : `<small class="perf-sub">${p.entregas} ${p.entregas === 1 ? 'entrega' : 'entregas'} · ${fmt(p.peso)} ${p.peso === 1 ? 'equivalente' : 'equivalentes'}${p.pesoConferido < p.peso ? ` · ${fmt(p.pesoConferido)} ${p.pesoConferido === 1 ? 'confirmada' : 'confirmadas'}` : ''}</small>`;
  const {podio, resto} = perfCortarPodio(linhas);
  const acoes = p => `<button class="inline-link" data-perf-pessoa="${esc(p.chave)}">Ver entregas</button>`;
  const podioHTML = podio.map(p => `<article class="perf-podio-item pos-${p.posicao}">
      <span class="perf-medalha" aria-label="${p.posicao}º lugar">${PERF_MEDALHAS[p.posicao] || p.posicao + 'º'}</span>
      ${foto(p, 'perf-podio-logo')}
      <h3>${esc(p.nome)}</h3>${selo(p)}
      <div class="perf-podio-num"><strong>${numero(p)}</strong><span>${rotulo(p)}</span></div>
      ${detalhe(p)}
      <div class="perf-podio-acoes">${acoes(p)}</div>
    </article>`).join('');
  const restoHTML = resto.map(p => `<li class="perf-rank-linha">
      <span class="perf-rank-pos">${PERF_MEDALHAS[p.posicao] || p.posicao + 'º'}</span>
      ${foto(p, 'perf-rank-logo')}
      <div class="perf-rank-nome"><strong>${esc(p.nome)}</strong>${selo(p)}${detalhe(p)}</div>
      <span class="perf-rank-num"><strong>${numero(p)}</strong> <small>${rotulo(p)}</small></span>
      <span class="perf-rank-acoes">${acoes(p)}</span>
    </li>`).join('');
  const pode = perfPodeEditar();
  /* Quanto da conferência existe, dito por critério. Abaixo de 80% o critério
     fica fora da nota de todos — e a tela diz quantas voltas faltam. */
  const voltas = n => `${n} ${n === 1 ? 'volta' : 'voltas'}`;
  const crits = ['limpeza', 'equipamentos'].filter(k => av.pesos[k] > 0 && av.cobertura[k].voltas);
  const mesmaConta = crits.length === 2 && av.cobertura.limpeza.conferidas === av.cobertura.equipamentos.conferidas;
  const grupos = mesmaConta ? [crits] : crits.map(k => [k]);
  const coberturaTxt = grupos.map(ks => {
    const c = av.cobertura[ks[0]];
    const rot = ks.map((k, i) => i ? PERF_CRIT_ROTULO[k].toLowerCase() : PERF_CRIT_ROTULO[k]).join(' e ');
    const plural = ks.length > 1;
    if (c.ok) return ` ${rot}: ${c.conferidas} de ${voltas(c.voltas)} com resposta.`;
    const precisa = Math.ceil(c.voltas * av.coberturaMinima);
    return fechada
      ? ` ${rot} ${plural ? 'ficaram' : 'ficou'} fora da nota nesta revisão: só ${c.conferidas} de ${voltas(c.voltas)} tinham resposta quando o período foi fechado.`
      : ` ${rot} ${plural ? 'estão' : 'está'} FORA da nota de todos: a conferência cobriu ${c.conferidas} de ${voltas(c.voltas)} (precisa de ${precisa}).`;
  }).join('');
  const pesosTxt = ['producao', 'limpeza', 'equipamentos'].map(k => `${PERF_CRIT_ROTULO[k]} ${av.pesos[k]}%`).join(' · ');
  const vazio = !av.pessoas.length
    ? '<p class="perf-rank-vazio">Nenhuma entrega com participantes neste período.</p>'
    : (!linhas.length ? `<p class="perf-rank-vazio">${medida === 'valor' ? 'Ninguém tem valor CONFIRMADO neste período ainda. Confirme as participações na lista abaixo.' : 'Sem dado suficiente para a nota neste período.'}</p>` : '');
  return `<section class="perf-ranking">
    <header class="perf-ranking-head">
      <div><h3>Ranking individual</h3><p>${medida === 'nota'
        ? `Nota de 0 a 100 · ${fechada ? 'pesos desta revisão: ' : ''}${esc(pesosTxt)}. Produção conta o PESO de cada um em cada entrega: seis entregas divididas ao meio valem três. Carro e equipamentos vêm da conferência da volta; volta sem resposta conta pela média do período.${coberturaTxt}`
        : medida === 'peso' ? 'Soma do peso de cada um nas entregas. Aparecer em mais entregas divididas não soma mais que fazer o mesmo sozinho.'
        : 'Valor das entregas rateado pelo peso de cada um. Só participações confirmadas. Não é bônus.'}</p></div>
      <div class="perf-ranking-ctrl">
        <span class="casa-chips-periodo">
          <button type="button" class="casa-chip-per ${medida === 'nota' ? 'on' : ''}" data-perf-pessoa-medida="nota">Nota</button>
          <button type="button" class="casa-chip-per ${medida === 'peso' ? 'on' : ''}" data-perf-pessoa-medida="peso">Produção</button>
          <button type="button" class="casa-chip-per ${medida === 'valor' ? 'on' : ''}" data-perf-pessoa-medida="valor">Valor</button>
        </span>
        ${pode && !fechada ? '<button class="btn-ghost btn-sm" id="perf-criterios">⚖️ Pesos da nota</button>' : ''}
      </div>
    </header>
    ${vazio}
    ${podio.length ? `<div class="perf-podio n${podio.length}">${podioHTML}</div>` : ''}
    ${resto.length ? `<ol class="perf-rank-lista">${restoHTML}</ol>` : ''}
    ${fora.length ? `<p class="perf-rank-nota">${fora.length} ${fora.length === 1 ? 'pessoa fica' : 'pessoas ficam'} fora deste ranking por falta de dado, e não com zero: ${fora.map(p => esc(p.nome)).join(', ')}.</p>` : ''}
  </section>`;
}
function perfEditarCriterios() {
  if (!perfPodeEditar()) return;
  const atual = perfCriterios();
  const d = perfDialog('Pesos da nota', `<form id="perf-crit-form">
    <p>Quanto cada critério vale na nota de 0 a 100. Os três somam 100.</p>
    ${['producao', 'limpeza', 'equipamentos'].map(k => `<label class="perf-peso"><span>${esc(PERF_CRIT_ROTULO[k])}</span><input type="number" name="${k}" min="0" max="100" step="1" required value="${atual[k]}"><span>%</span></label>`).join('')}
    <p id="perf-crit-soma" aria-live="polite"></p>
    <p class="metricas-nota">Produção é o peso de cada pessoa nas entregas, comparado com quem mais produziu no período. Carro (limpo e arrumado) e equipamentos são a parte das voltas conferidas pela gestão que saiu certa; a conferência se faz em PCP › Volta do carro. Volta sem resposta conta pela média do período: ninguém perde nem ganha por a conferência não ter sido feita. O critério só entra na nota quando pelo menos 80% das voltas do período têm resposta; abaixo disso fica fora da nota de todos.</p>
    <button class="btn-primary" type="submit">Salvar pesos</button>
  </form>`);
  const f = d.querySelector('form'), soma = d.querySelector('#perf-crit-soma');
  const ler = () => Object.fromEntries(['producao', 'limpeza', 'equipamentos'].map(k => [k, Number(f.elements[k].value)]));
  const conferir = () => { const v = ler(), t = v.producao + v.limpeza + v.equipamentos; soma.textContent = `Soma: ${t}%${t === 100 ? '' : ': precisa dar 100'}`; return t === 100; };
  f.oninput = conferir; conferir();
  f.onsubmit = ev => {
    ev.preventDefault();
    if (!conferir()) return;
    const v = ler();
    if (Object.values(v).some(n => !Number.isInteger(n) || n < 0 || n > 100)) return toast('Use números inteiros de 0 a 100.', 'error');
    const cfg = perfConfig(); cfg.criterios = v; perfSalvar(cfg); d.close(); renderPerformanceCasa();
  };
}

/* ------------------------------------------------------------ RANKING
 * Pedido do dono (23/09/2026): "deixar mais enxuto essa parte das equipes ...
 * poder editar as equipes e colocar nomes e logos ... e criar o ranking
 * deixando bem bacana". Os cards antigos repetiam cinco linhas de conferência
 * em cada equipe; o ranking mostra a posição, a cara da equipe e o número, e
 * deixa a conferência para a lista de entregas, que já existe logo abaixo.
 *
 * Duas medidas: ENTREGAS (cada O.S. conta uma vez na equipe, confirmada ou
 * sugerida) e VALOR (só o que já foi confirmado). Equipe sem valor confirmado
 * NÃO entra no ranking de valor como zero: fica listada à parte, dizendo que
 * falta confirmar. */
const PERF_MEDALHAS = {1: '🥇', 2: '🥈', 3: '🥉'};
/* O PÓDIO É CORTADO PELA POSIÇÃO, não pela ordem da lista. Com cinco empatados
   em 1º, os três primeiros em ordem alfabética ganhavam medalha e card grande e
   os outros dois iam para a lista miúda — a diferença que os números não
   mostram. Se os que cabem no pódio (posição 1 a 3) forem mais de três, não há
   pódio: todos vão para a lista, com a mesma posição e a mesma medalha. */
function perfCortarPodio(linhas) {
  const cabem = linhas.filter(l => l.posicao <= 3);
  if (cabem.length > 3) return {podio: [], resto: linhas};
  return {podio: cabem, resto: linhas.slice(cabem.length)};
}
let perfUltimoRanking = new Map();
function perfRankingEquipesHTML(regs, c) {
  const medida = STATE._perfRankMedida === 'valor' ? 'valor' : 'entregas';
  const vis = PERF.comEquipes(regs, c.equipes, perfOpcoesEquipe());
  const todas = PERF.resumir(vis).equipes;
  const confirmadas = PERF.resumir(vis.filter(r => r.confirmado)).equipes;
  const valorDe = new Map(confirmadas.map(x => [x.chave, x]));
  const pode = perfPodeEditar();
  let linhas, semValor = [];
  if (medida === 'valor') {
    const comValor = todas.filter(x => { const v = valorDe.get(x.chave); return v && v.os > v.semValor; });
    semValor = todas.filter(x => !comValor.includes(x));
    linhas = PERF.ranquear(comValor.map(x => ({...x, valorConf: valorDe.get(x.chave).valor})), x => x.valorConf);
  } else {
    linhas = PERF.ranquear(todas, x => x.os);
  }
  const numero = x => medida === 'valor' ? dinheiroCasa(x.valorConf) : String(x.os);
  const semValorDe = x => { const v = valorDe.get(x.chave); return v ? v.semValor : 0; };
  const rotulo = x => medida === 'valor' ? ('confirmado' + (semValorDe(x) ? ` · parcial (${semValorDe(x)} sem valor)` : '')) : (x.os === 1 ? 'entrega' : 'entregas');
  const aConferir = x => medida === 'entregas' && x.os > x.confirmadas ? `<small class="perf-a-conferir">${x.os - x.confirmadas} a conferir</small>` : '';
  // Equipe salva mostra os integrantes do CADASTRO; a primeira entrega do
  // período pode ter tido um ajudante avulso que não é da equipe.
  const membrosTxt = x => { const e = c.equipes.find(q => q.id === x.chave); return ((e && e.membros) || x.membros || []).map(m => esc(m.nome)).join(' · '); };
  const acoes = x => {
    const ver = `<button class="inline-link" data-perf-grupo="${esc(x.chave)}">Ver entregas</button>`;
    if (!pode) return ver;
    const salva = c.equipes.find(e => e.id === x.chave);
    return ver + (salva
      ? ` <button class="inline-link" data-perf-equipe="${esc(salva.id)}">Editar</button>`
      : ` <button class="inline-link perf-nomear" data-perf-nomear="${esc(x.chave)}">Dar nome e logo</button>`);
  };
  const apelido = x => x.salva ? '' : `<small class="perf-sem-nome">${(x.membros || []).length > 1 ? 'composição sem nome' : 'individual'}</small>`;
  perfUltimoRanking = new Map(todas.map(x => [x.chave, x.membros || []]));
  const {podio, resto} = perfCortarPodio(linhas);
  const podioHTML = podio.map(x => `<article class="perf-podio-item pos-${x.posicao}">
      <span class="perf-medalha" aria-label="${x.posicao}º lugar">${PERF_MEDALHAS[x.posicao] || x.posicao + 'º'}</span>
      ${perfLogoHTML(x, 'perf-podio-logo')}
      <h3>${esc(x.nome)}</h3>${apelido(x)}
      ${x.salva ? `<p class="perf-podio-membros">${membrosTxt(x)}</p>` : ''}
      <div class="perf-podio-num"><strong>${numero(x)}</strong><span>${rotulo(x)}</span></div>
      ${aConferir(x)}
      <div class="perf-podio-acoes">${acoes(x)}</div>
    </article>`).join('');
  const restoHTML = resto.map(x => `<li class="perf-rank-linha">
      <span class="perf-rank-pos">${PERF_MEDALHAS[x.posicao] || x.posicao + 'º'}</span>
      ${perfLogoHTML(x, 'perf-rank-logo')}
      <div class="perf-rank-nome ${x.salva ? '' : 'sem-nome'}"><strong>${esc(x.nome)}</strong>${apelido(x)}${x.salva ? `<small>${membrosTxt(x)}</small>` : ''}</div>
      <span class="perf-rank-num"><strong>${numero(x)}</strong> <small>${rotulo(x)}</small>${aConferir(x)}</span>
      <span class="perf-rank-acoes">${acoes(x)}</span>
    </li>`).join('');
  // Equipes cadastradas que não aparecem no ranking deste período: ainda
  // precisam de um lugar para serem vistas e editadas.
  const noRanking = new Set(todas.map(x => x.chave));
  const paradas = c.equipes.filter(e => !noRanking.has(e.id) && e.ativo !== false);
  const desativadas = c.equipes.filter(e => !noRanking.has(e.id) && e.ativo === false);
  const vazio = !todas.length
    ? '<p class="perf-rank-vazio">Nenhuma entrega com equipe registrada neste período. Quando a O.S. tiver equipe e for finalizada, ela aparece aqui.</p>'
    : (medida === 'valor' && !linhas.length
      ? '<p class="perf-rank-vazio">Nenhuma equipe tem valor CONFIRMADO neste período ainda. O ranking por valor só usa participações conferidas. Confirme na lista de entregas abaixo.</p>'
      : '');
  return `<section class="perf-ranking">
    <header class="perf-ranking-head">
      <div><h3>Ranking das equipes</h3><p>Compara composições: cada entrega conta uma vez na equipe que a fez. A avaliação de cada pessoa é INDIVIDUAL, pelo peso dela em cada entrega. Ela está na vista Pessoas. Entregas incluem divisões sugeridas, ainda a conferir. Mostra volume, não qualidade. E não é bônus.</p></div>
      <div class="perf-ranking-ctrl">
        <span class="casa-chips-periodo">
          <button type="button" class="casa-chip-per ${medida === 'entregas' ? 'on' : ''}" data-perf-rank-medida="entregas">Entregas</button>
          <button type="button" class="casa-chip-per ${medida === 'valor' ? 'on' : ''}" data-perf-rank-medida="valor">Valor confirmado</button>
        </span>
        ${pode ? '<button class="btn-primary btn-sm" id="perf-nova-equipe">+ Nova equipe</button>' : ''}
      </div>
    </header>
    ${vazio}
    ${podio.length ? `<div class="perf-podio n${podio.length}">${podioHTML}</div>` : ''}
    ${resto.length ? `<ol class="perf-rank-lista">${restoHTML}</ol>` : ''}
    ${semValor.length ? `<p class="perf-rank-nota">${semValor.length} equipe${semValor.length === 1 ? '' : 's'} com entrega mas sem valor confirmado ficam fora deste ranking, e não como zero.</p>` : ''}
    ${paradas.length ? `<div class="perf-equipes-paradas"><span>Sem entrega no período:</span>${paradas.map(e => `<button class="perf-equipe-chip" ${pode ? `data-perf-equipe="${esc(e.id)}"` : 'disabled'}>${perfLogoHTML(e, 'perf-chip-logo')} ${esc(e.nome)}</button>`).join('')}</div>` : ''}
    ${desativadas.length ? `<div class="perf-equipes-paradas perf-desativadas"><span>Desativadas:</span>${desativadas.map(e => `<button class="perf-equipe-chip" ${pode ? `data-perf-equipe="${esc(e.id)}"` : 'disabled'}>${perfLogoHTML(e, 'perf-chip-logo')} ${esc(e.nome)}</button>`).join('')}</div>` : ''}
  </section>`;
}

function performanceEquipesHTML() {
  const c=perfConfig(), f=periodoOuMes('_fPerf');
  const lista=perfLista().filter(o=>OPERACAO.emIntervalo(diaEntrega(o),f.de,f.ate));
  const regs=perfUnirPessoas(lista.map(o=>perfRegistro(o,c))), resumo=PERF.resumir(regs), apurado=PERF.resumir(regs.filter(r=>r.confirmado));
  const confirmado=regs.filter(r=>r.confirmado).length, semEquipe=regs.filter(r=>!r.membros.length).length;
  const modo=STATE._perfModo || 'pessoas', pesquisa=STATE._perfBusca || '';
  /* Ordem fixa (entrega mais recente primeiro, depois o número): a lista vinha
     na ordem do banco (id sorteado) ou do cache, e cada confirmação a
     reembaralhava; a próxima linha fugia do dedo. */
  const linhas=[...regs].sort((a,b)=>String(diaEntrega(b.os)||'').localeCompare(String(diaEntrega(a.os)||'')) || String(a.os.numero||'').localeCompare(String(b.os.numero||''),'pt-BR',{numeric:true}));
  const cards=(modo==='equipes'?resumo.equipes:resumo.pessoas).map(p=>{
    const cf=(modo==='equipes'?apurado.equipes:apurado.pessoas).find(x=>x.chave===p.chave);
    const valor=!cf?'Aguardando conferência':cf.semValor===cf.os?'Valor não disponível':dinheiroCasa(cf.valor)+(cf.semValor?' · parcial':'');
    return `<article class="perf-score"><div class="perf-score-head">${modo==='equipes'?`<span class="perf-emblema">${esc(p.emblema)}</span>`:avatarRH(pessoasRH().find(x=>[x.chave,x.id].includes(p.chave))||{nome:p.nome})}<h3>${esc(p.nome)}</h3><div class="perf-count"><strong>${p.os}</strong><span>entregas</span></div></div><p class="perf-status">${p.confirmadas} confirmadas · ${p.os-p.confirmadas} a conferir</p><p><strong>${valor}</strong><br>Valor confirmado${modo==='pessoas'?' · rateado':''}</p><details><summary>Entender a participação</summary><p>${modo==='equipes'?'Cada O.S. é contada uma vez na equipe.':perfFormato(cf?.equivalentes || 0)+' O.S. equivalentes confirmadas após rateio.'} Entregas inclui sugestões; valores incluem apenas confirmações. Não representa bônus.</p></details><button class="inline-link" ${modo==='pessoas'?`data-perf-pessoa="${esc(p.chave)}"`:`data-perf-grupo="${esc(p.chave)}"`}>Ver entregas →</button></article>`;
  }).join('');
  const sugestoes=new Map();
  for(const os of STORE.getAllOS()) {
    const membros=perfEquipeOS(os);if(membros.length<2)continue;
    const k=PERF.composicao(membros);if(c.equipes.some(e=>PERF.composicao(e.membros)===k))continue;
    const x=sugestoes.get(k)||{membros,n:0};x.n++;sugestoes.set(k,x);
  }
  const sugeridas=[...sugestoes.values()].sort((a,b)=>b.n-a.n).slice(0,4);
  return `<section class="perf-workspace"><div class="filter-bar">${filtroPeriodoHTML('_fPerf')}<button class="btn-ghost" id="perf-pdf">📄 Relatório PDF</button></div>
    <div class="perf-summary"><div><b>${lista.length}</b><span>instalações no período</span></div><div><b>${confirmado}/${lista.length}</b><span>entregas com participação confirmada</span></div><div><b>${semEquipe}</b><span>sem equipe informada</span></div></div>
    <div class="perf-toolbar"><div class="casa-vista"><button class="btn-ghost ${modo==='pessoas'?'active':''}" data-perf-modo="pessoas">👤 Pessoas</button><button class="btn-ghost ${modo==='equipes'?'active':''}" data-perf-modo="equipes">🤝 Equipes</button></div><span>Entregas com participação registrada ou sugerida</span></div>
    <p class="perf-coverage">${semEquipe ? `${semEquipe} de ${lista.length} entregas sem equipe: a comparação por pessoa está incompleta.` : 'Todas as entregas do período têm participantes.'} ${lista.length-confirmado} apurações aguardam confirmação.</p>
    <details class="perf-method"><summary>Como interpretar os indicadores</summary><p>Entregas conta as O.S. em que a pessoa participou; não some essa coluna entre pessoas. O.S. equivalentes divide cada entrega pelos percentuais, sem duplicação. Divisões sugeridas ainda não foram confirmadas. Valores rateados não são faturamento pessoal nem bônus. Qualidade, complexidade e retrabalho precisam de revisão. ${esc(perfFonteTexto())}</p></details>
    ${modo==='equipes' ? perfRankingEquipesHTML(regs, c) : perfRankingPessoasHTML(regs, c)}
    ${''/* Equipes são criadas, nomeadas e editadas no ranking de equipes (vista Equipes). */}
    <section class="perf-entregas"><h3>Conferência por entrega</h3><div class="perf-filtros"><label>Situação <select id="perf-situacao"><option value="">Todas</option><option value="pendente">A conferir</option><option value="confirmada">Confirmadas</option><option value="sem-equipe">Sem equipe</option><option value="invalida">Participação inconsistente</option>${perfPodeEditar()?'<option value="sem-valor">Sem valor</option>':''}</select></label><button class="btn-ghost" id="perf-limpar">Limpar filtros da lista</button><span id="perf-recorte" role="status"></span></div><label>Buscar O.S., cliente ou pessoa · filtra a lista abaixo <input id="perf-busca-os" type="search" value="${esc(pesquisa)}" placeholder="Digite para localizar"></label><div class="casa-tabela-wrap"><table class="casa-tabela"><thead><tr><th>O.S. / Cliente</th><th>Data</th><th>Equipe e participação</th><th>Participação e volta</th><th></th></tr></thead><tbody>${linhas.map(r=>`<tr data-perf-id="${esc(r.id)}"><td><button class="inline-link" data-perf-os="${esc(r.id)}">${esc(r.os.numero)}</button><small class="bloco">${esc(r.os.cliente)}</small></td><td>${esc(diaEntrega(r.os).split('-').reverse().join('/'))}</td><td>${r.equipeNome?`<strong>${esc(r.emblema)} ${esc(r.equipeNome)}</strong><br>`:''}${r.membros.map(p=>`${esc(p.nome)} · ${perfFormato(p.percentual)}%`).join('<br>') || 'Sem equipe'}</td><td><span class="badge">${r.confirmado?'Confirmada':!r.membros.length?'Sem equipe':PERF.validar(r.membros)?'Participação inconsistente':'Divisão sugerida'}</span>${r.os.retrabalho?'<small class="bloco">Serviço de retrabalho</small>':''}<small class="bloco perf-volta">${perfVoltaTxt(r.retornoConf)}</small>${perfPodeEditar()?`<small class="bloco">${r.valor==null?'Sem valor':esc(dinheiroCasa(r.valor))}</small>`:''}</td><td>${perfPodeEditar()&&!perfFonteAtual()?.fechadoEm?`<button class="btn-ghost" data-perf-part="${esc(r.id)}">Conferir</button>`:''}</td></tr>`).join('') || '<tr><td colspan="5">Nenhuma entrega neste filtro.</td></tr>'}</tbody></table></div></section></section>`;
}
function wirePerformanceEquipes(el) {
  perfWireFonte(el);
  el.querySelectorAll('[data-perf-modo]').forEach(b=>b.onclick=()=>{STATE._perfModo=b.dataset.perfModo;renderPerformanceCasa();});
  el.querySelectorAll('[data-perf-equipe]').forEach(b=>b.onclick=()=>perfEditarEquipe(b.dataset.perfEquipe));
  el.querySelectorAll('[data-perf-part]').forEach(b=>b.onclick=()=>perfEditarParticipacao(b.dataset.perfPart));
  const nova=el.querySelector('#perf-nova-equipe');if(nova)nova.onclick=()=>perfEditarEquipe('');
  el.querySelectorAll('[data-perf-rank-medida]').forEach(b=>b.onclick=()=>{STATE._perfRankMedida=b.dataset.perfRankMedida;renderPerformanceCasa();});
  el.querySelectorAll('[data-perf-pessoa-medida]').forEach(b=>b.onclick=()=>{STATE._perfPessoaMedida=b.dataset.perfPessoaMedida;renderPerformanceCasa();});
  const crit=el.querySelector('#perf-criterios');if(crit)crit.onclick=perfEditarCriterios;
  // Nomear uma composição abre a criação já com os integrantes marcados.
  el.querySelectorAll('[data-perf-nomear]').forEach(b=>b.onclick=()=>perfEditarEquipe('',(perfUltimoRanking.get(b.dataset.perfNomear)||[]).map(m=>({...m,apelido:m.apelido||m.nome}))));
  const c=perfConfig(), grupos=new Map();
  for(const os of STORE.getAllOS()){const membros=perfEquipeOS(os),k=PERF.composicao(membros);if(membros.length<2 || c.equipes.some(e=>PERF.composicao(e.membros)===k))continue;const g=grupos.get(k)||{membros,n:0};g.n++;grupos.set(k,g);}
  const sugeridas=[...grupos.values()].sort((a,b)=>b.n-a.n).slice(0,4);
  el.querySelectorAll('[data-perf-sugestao]').forEach(b=>b.onclick=()=>perfEditarEquipe('',sugeridas[Number(b.dataset.perfSugestao)].membros));
  const busca=el.querySelector('#perf-busca-os'), situacao=el.querySelector('#perf-situacao');
  const filtrar=()=>{
    if(!busca)return;
    STATE._perfBusca=busca.value;STATE._perfSituacao=situacao.value;
    let n=0;
    el.querySelectorAll('.perf-entregas tr[data-perf-id]').forEach(tr=>{
      const cfgAtual=perfConfig(),os=perfOS(tr.dataset.perfId),r=perfUnirPessoas([perfRegistro(os,cfgAtual)])[0];
      // A MESMA regra do ranking: sem ela, "Ver entregas" de uma equipe nomeada
      // pela composição filtraria por uma chave que nenhuma linha tem.
      const rv=PERF.comEquipes([r],cfgAtual.equipes,perfOpcoesEquipe())[0];
      const grupo=rv.equipeId || 'avulsa:'+PERF.composicao(r.membros);
      const status=!r.membros.length?'sem-equipe':PERF.validar(r.membros)?'invalida':r.confirmado?'confirmada':'pendente';
      const ok=(!situacao.value || (situacao.value==='pendente'?!r.confirmado:situacao.value==='sem-valor'?r.valor==null:status===situacao.value)) && PERF.incluiPessoa(r.membros,STATE._perfPessoa) && (!STATE._perfGrupo || grupo===STATE._perfGrupo) && normCasa(tr.textContent).includes(normCasa(busca.value));
      tr.hidden=!ok;if(ok)n++;
    });
    el.querySelector('#perf-recorte').textContent=n+(n===1?' entrega na lista':' entregas na lista')+(STATE._perfPessoa || STATE._perfGrupo?' · participante/equipe selecionado':'')+'. Totais dos cards: período completo.';
  };
  el.querySelectorAll('[data-perf-pessoa],[data-perf-grupo]').forEach(b=>b.onclick=()=>{STATE._perfPessoa=b.dataset.perfPessoa||'';STATE._perfGrupo=b.dataset.perfGrupo||'';busca.value='';situacao.value='';filtrar();el.querySelector('.perf-entregas').scrollIntoView({behavior:'smooth',block:'start'});});
  if(busca){situacao.value=STATE._perfSituacao||'';busca.oninput=filtrar;situacao.onchange=filtrar;el.querySelector('#perf-limpar').onclick=()=>{STATE._perfPessoa='';STATE._perfGrupo='';busca.value='';situacao.value='';filtrar();};filtrar();}
  const relPdf=el.querySelector('#perf-rel-pdf');if(relPdf)relPdf.onclick=()=>{const copy=el.querySelector('.perf-report').cloneNode(true);copy.querySelectorAll('.perf-team-report details,.perf-report-pendencias').forEach(n=>n.remove());imprimirAnalisePCP('Performance · resumo de pessoas e equipes',copy,periodoOuMes('_fPerf'),perfFonteTexto());};
  const detalhado=el.querySelector('#perf-rel-detalhado');if(detalhado)detalhado.onclick=()=>{
    const copy=el.querySelector('.perf-report').cloneNode(true);
    imprimirAnalisePCP('Performance · resumo e O.S.',copy,periodoOuMes('_fPerf'),perfFonteTexto());
  };
  const pdf=el.querySelector('#perf-pdf');if(pdf)pdf.onclick=()=>{
    const copy=el.querySelector('.perf-workspace').cloneNode(true);copy.querySelector('.perf-config')?.remove();copy.querySelectorAll('[hidden]').forEach(x=>x.remove());
    const note=document.createElement('p');note.textContent='Detalhamento filtrado por: '+(el.querySelector('#perf-recorte')?.textContent || 'todas as entregas')+' Busca: '+(STATE._perfBusca||'sem busca')+'. Os totais acima abrangem o período completo.';copy.prepend(note);
    imprimirAnalisePCP('Performance e participação',copy,periodoOuMes('_fPerf'),perfFonteTexto());
  };
  el.querySelectorAll('[data-perf-os]').forEach(b=>b.onclick=()=>{
    const r=perfUnirPessoas([perfRegistro(perfOS(b.dataset.perfOs),perfConfig())])[0];
    perfDialog('O.S. '+(r.os.numero||''),`<p>${esc(r.os.cliente||'')}</p><p>Entrega: ${esc(diaEntrega(r.os))}</p><p>Valor: ${r.valor==null?'Não disponível':dinheiroCasa(r.valor)} · ${esc(r.origemValor||'Base local')}</p><p>${r.confirmado?'Participação confirmada':'Participação aguardando confirmação'}</p><p>Volta: ${perfVoltaTxt(r.retornoConf)}${r.retornoConf&&r.retornoConf.por?` · conferida por ${esc(r.retornoConf.por)}${r.retornoConf.em?' em '+esc(new Date(r.retornoConf.em).toLocaleString('pt-BR')):''}`:''}</p><ul>${r.membros.map(p=>`<li>${esc(p.nome)} · ${perfFormato(p.percentual)}%</li>`).join('')}</ul>${r.por?`<p>Participação confirmada por ${esc(r.por)} · ${esc(r.em||'')}</p>`:''}${r.obs?`<p>${esc(r.obs)}</p>`:''}<p>${esc(perfFonteTexto())}</p>`);
  });
  bindCardClicks(el);
}
function perfModeloEquipeHTML() {
  return `<label>Equipe salva <select data-perf-modelo><option value="">Escolher pessoas individualmente</option>${perfConfig().equipes.filter(e=>e.ativo!==false).map(e=>`<option value="${esc(e.id)}">${esc(e.emblema)} ${esc(e.nome)}</option>`).join('')}</select><small>Você pode acrescentar ou retirar pessoas abaixo.</small></label>`;
}
function perfWireModelo(form) {
  const sel=form.querySelector('[data-perf-modelo]');if(!sel)return;
  sel.onchange=()=>{
    const e=perfConfig().equipes.find(e=>e.id===sel.value);if(!e)return;
    const faltando=e.membros.filter(p=>![...form.querySelectorAll('[name="equipe"]')].some(cb=>perfPessoa(cb.value).chave===p.chave));
    if(faltando.length){toast('Equipe possui integrante indisponível no cadastro atual. Confira a seleção individual.','error');return;}
    form.querySelectorAll('[name="equipe"]').forEach(cb=>{cb.checked=e.membros.some(p=>p.chave===perfPessoa(cb.value).chave);cb.closest('.casa-chip').classList.toggle('on',cb.checked);});
  };
}

function performanceRelatorioHTML() {
  const f=periodoOuMes('_fPerf'),c=perfConfig();
  // Nome e logo das equipes pela mesma regra do ranking, em todos os quadros do
  // relatório: um quadro com o nome e outro com a composição crua seria a
  // mesma equipe parecendo duas.
  // (a mesma pessoa numa linha só, como no ranking)
  const regs=PERF.comEquipes(perfUnirPessoas(perfLista().filter(o=>OPERACAO.emIntervalo(diaEntrega(o),f.de,f.ate)).map(o=>perfRegistro(o,c))),c.equipes,perfOpcoesEquipe());
  const validos=regs.filter(r=>!PERF.validar(r.membros)), confirmados=validos.filter(r=>r.confirmado);
  const resumo=PERF.resumir(validos), confirmado=PERF.resumir(confirmados), grupos=PERF.dossie(regs);
  const semEquipe=regs.filter(r=>!r.membros.length).length, inconsistentes=regs.length-validos.length-semEquipe;
  const cobertura=regs.length?Math.round(confirmados.length/regs.length*100):0;
  const semValor=confirmados.filter(r=>r.valor==null).length,valor=confirmados.reduce((n,r)=>n+(r.valor??0),0);
  const fmtDia=v=>String(v||'').slice(0,10).split('-').reverse().join('/');
  const valorTexto=(n,conhecidas,total)=>!total?'A conferir':!conhecidas?'Sem valor':dinheiroCasa(n)+(conhecidas<total?' · parcial':'');
  const tabela=(titulo,linhas,equipe=false)=>`<section class="perf-report-section"><h3>${titulo}</h3><p class="metricas-nota">${equipe?'Cada entrega conta uma vez na equipe.':'O.S. equivalentes somam os percentuais confirmados: duas participações de 50% equivalem a uma O.S.'}</p><div class="casa-tabela-wrap"><table class="casa-tabela"><thead><tr><th>${equipe?'Equipe':'Pessoa'}</th><th>Entregas</th><th>Confirmadas</th><th>A conferir</th>${equipe?'':'<th>O.S. equivalentes confirmadas</th>'}<th>Valor confirmado${equipe?'':' rateado'}</th></tr></thead><tbody>${linhas.map(p=>{const cf=(equipe?confirmado.equipes:confirmado.pessoas).find(x=>x.chave===p.chave);return `<tr><td><strong>${esc(p.nome)}</strong></td><td>${p.os}</td><td>${p.confirmadas}</td><td>${p.os-p.confirmadas}</td>${equipe?'':`<td>${perfFormato(cf?.equivalentes || 0)}</td>`}<td>${!cf?'—':cf.semValor===cf.os?'Sem valor':dinheiroCasa(cf.valor)+(cf.semValor?' (parcial)':'')}</td></tr>`;}).join('') || `<tr><td colspan="${equipe?5:6}">Sem participantes registrados neste período.</td></tr>`}</tbody></table></div></section>`;
  const equipes=grupos.map(g=>`<article class="perf-team-report"><header>${perfLogoHTML(g,'perf-emblema')}<div><h4>${esc(g.nome)}</h4><p>${g.membros.length} participantes no período · ${g.registros.length} entrega${g.registros.length===1?'':'s'}</p></div><strong>${valorTexto(g.valor,g.confirmadas-g.semValor,g.confirmadas)}<small>valor confirmado da equipe</small></strong></header><div class="perf-team-numbers"><span><b>${g.confirmadas}</b> ${g.confirmadas===1?'confirmada':'confirmadas'}</span><span><b>${g.registros.length-g.confirmadas}</b> a conferir</span><span><b>${g.retrabalhos}</b> com marca de retrabalho</span></div><div class="perf-member-list">${g.membros.map(m=>`<span><strong>${esc(m.nome)}</strong><small>${m.entregas} entrega${m.entregas===1?'':'s'} · ${m.confirmadas} ${m.confirmadas===1?'confirmada':'confirmadas'} · ${perfFormato(m.equivalentes)} O.S. equivalentes</small></span>`).join('')}</div><details><summary>Ver O.S., percentuais e dados de conferência</summary><div class="casa-tabela-wrap"><table class="casa-tabela"><thead><tr><th>O.S. / cliente</th><th>Entrega</th><th>Participação nesta O.S.</th><th>Valor da O.S.</th><th>Conferência</th></tr></thead><tbody>${g.registros.map(r=>`<tr><td><button class="inline-link" data-perf-os="${esc(r.id)}">${esc(r.os?.numero || r.id)}</button><small class="bloco">${esc(r.os?.cliente || '')}</small>${r.os?.retrabalho?'<small class="bloco">Retrabalho marcado</small>':''}</td><td>${fmtDia(diaEntrega(r.os))}</td><td>${r.membros.map(m=>`${esc(m.nome)} · <strong>${perfFormato(m.percentual)}%</strong>`).join('<br>')}</td><td>${r.valor==null?'Sem valor':dinheiroCasa(r.valor)}<small class="bloco">${esc(r.origemValor || 'Base da apuração')}</small></td><td>${r.confirmado?'Confirmada':'Divisão sugerida'}${r.por?`<small class="bloco">${esc(r.por)} · ${fmtDia(r.em)}</small>`:''}${r.obs?`<small class="bloco">${esc(r.obs)}</small>`:''}</td></tr>`).join('')}</tbody></table></div></details></article>`).join('');
  return `<section class="perf-report"><header class="perf-report-heading"><div><span class="perf-report-eyebrow">PRODUÇÃO · PESSOAS · EQUIPES</span><h3>Relatório de performance</h3><p>${fmtDia(f.de)} a ${fmtDia(f.ate)} · ${resumo.pessoas.length} participantes · ${grupos.length} ${grupos.length===1?'equipe / composição utilizada':'equipes / composições utilizadas'}</p></div><span class="perf-report-state">${perfFonteAtual()?.fechadoEm?'Fechamento preservado':'Apuração em acompanhamento'}</span></header><div class="perf-summary"><div><b>${regs.length}</b><span>entregas no período</span></div><div><b>${cobertura}%</b><span>com participação confirmada (${confirmados.length})</span></div><div><b>${semEquipe}</b><span>sem equipe informada</span></div></div><div class="perf-report-value"><span>Valor das entregas com participação confirmada</span><strong>${valorTexto(valor,confirmados.length-semValor,confirmados.length)}</strong><small>${semValor} entrega(s) confirmada(s) sem valor. Valores por pessoa são rateados; não representam pagamento ou bônus.</small></div><p class="perf-coverage">${!regs.length?'Nenhuma instalação registrada neste período.':confirmados.length<regs.length?`Apuração parcial: ${regs.length-confirmados.length} ${regs.length-confirmados.length===1?'participação':'participações'} a conferir, incluindo ${semEquipe} sem equipe e ${inconsistentes} inconsistentes.`:'Participações conferidas. Quantidade de entregas não mede sozinha qualidade, esforço ou complexidade.'}</p><section class="perf-report-section"><h3>Equipes e composição real do período</h3><p class="metricas-nota">Participantes das entregas, incluindo avulsos. Os percentuais variam por O.S.; o cadastro atual da equipe não reescreve o histórico.</p>${equipes || '<p>Nenhuma equipe com participação válida registrada no período.</p>'}</section>${tabela('Participação por pessoa',resumo.pessoas)}${tabela('Resumo das equipes',resumo.equipes,true)}<details class="perf-report-section perf-report-pendencias"><summary>Entregas que ainda não permitem apuração por pessoa</summary><p>${semEquipe} sem equipe · ${inconsistentes} com percentuais inconsistentes.</p><ul>${regs.filter(r=>PERF.validar(r.membros)).map(r=>`<li>O.S. <button class="inline-link" data-perf-os="${esc(r.id)}">${esc(r.os.numero)}</button> · ${esc(r.os.cliente)} · ${r.membros.length?'rever percentuais':'informar participantes'}</li>`).join('') || '<li>Nenhuma pendência de composição.</li>'}</ul></details><p class="metricas-nota">Entregas inclui participações sugeridas e confirmadas. A mesma O.S. pode aparecer para mais de uma pessoa; não some a coluna entre colaboradores. Valores incluem somente participações confirmadas, sem duplicar o valor entre pessoas. Não representam lucro, recebimento ou bônus. Retrabalho indica a marca registrada, não uma avaliação automática do colaborador. ${esc(perfFonteTexto())}</p></section>`;
}
