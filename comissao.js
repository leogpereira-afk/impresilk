'use strict';
/* Comissão v1: centavos inteiros; não grava no ranking operacional nem na regra legada
 * (o ranking só LÊ a falha comprovada aceita aqui: D-004, revisão da onda a3).
 * Cada revisão referencia fatos selados. Desconhecido é pendência, não punição.
 * Bloco idêntico no navegador e no servidor, verificado nos testes.
 * A RÉGUA DAS PERDAS (D-010 e D-011, 11/10/2026) chega pelo selo: o fechamento
 * apurado com ela guarda o id dela (regraPerdas) e, em cada entrega com
 * retrabalho, a etapa de origem; a de instalação vem com
 * perda:'retrabalho_instalacao'. O motor só lê o selo (a régua mora em
 * regras.js e _shared/pcp-regras.mjs):
 * - retrabalho de instalação: perda automática da entrega, sem pedir decisão,
 *   entrega física, rateio nem montagem interna; zero para todos, inclusive a
 *   parcela interna. A comissão que ela teria gerado vai na linha
 *   (comissaoPerdidaCentavos), para a aba Perdas, pela MESMA conta acumulada
 *   da O.S. que a linha paga usaria (o saldo paralelo; revisão da onda a3:
 *   1% de cada parte, arredondado sozinho, passava 1 centavo do que seria pago);
 * - retrabalho com origem a definir: só a O.S. fica pendente (não paga e não
 *   perde) e o demonstrativo continua aprovável (revisão da onda a3: a origem a
 *   definir travava o mês inteiro). Definida a origem, ela entra numa revisão
 *   seguinte (fechar de novo e nova prévia);
 * - retrabalho de outra etapa, atraso e retorno antecipado: nada muda aqui
 *   sozinho; a gestão decide caso a caso (falha comprovada, D-004).
 * Selo de antes da régua (sem regraPerdas): como sempre foi.
 * A falha comprovada aceita aqui também tira os pontos da O.S. no ranking, na
 * Nota, na Conferência, no Por O.S., no ranking dos funcionários e no
 * Relatório (D-004, "zera só os pontos e a comissão da O.S. afetada"): eles
 * leem a decisão da revisão que vale (demonstrativosVigentes), nunca o hash. */
const COMISSAO = (() => {
  const lista = v => Array.isArray(v) ? v : [];
  const texto = v => typeof v === 'string' ? v.trim().slice(0,2000) : '';
  const documentada = d => !!d && texto(d.origem).length >= 3 && texto(d.evidencia).length >= 5 && texto(d.justificativa).length >= 5;
  const idPessoa = v => typeof v === 'string' && /^\d{6}$/.test(v);
  const soma = xs => xs.reduce((a,b)=>a+b,0);
  const centavos = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && Number.isSafeInteger(Math.round(v*100)) ? Math.round(v*100) : null;
  function ratear(total, partes) {
    if (!Number.isSafeInteger(total) || total<0 || !partes.length || partes.some(p=>!Number.isInteger(p.cota)||p.cota<0) || soma(partes.map(p=>p.cota))!==10000) throw new Error('Rateio inválido.');
    // Maior resto, empate na ordem explicitamente confirmada no demonstrativo.
    const valores=partes.map(p=>Number(BigInt(total)*BigInt(p.cota)/10000n));
    const ordem=partes.map((p,i)=>({i,resto:Number(BigInt(total)*BigInt(p.cota)%10000n)})).sort((a,b)=>b.resto-a.resto||a.i-b.i);
    for(let i=0,falta=total-soma(valores);i<falta;i++)valores[ordem[i].i]++;
    return partes.map((p,i)=>({...p,centavos:valores[i]}));
  }
  const percentual = (v,bp) => Number((BigInt(v)*BigInt(bp)+5000n)/10000n);
  // Uma aprovação substitui somente a anterior do mesmo período/regime.
  // Compensação aprovada é um estado vazio, preservando a trilha anterior.
  function ativas(historico, modo) {
    const porPeriodo=new Map();
    for(const r of lista(historico).filter(r=>r.tipo==='aprovacao'&&r.apuracao?.config?.modo===modo).sort((a,b)=>b.revisao-a.revisao)){
      const k=r.de+':'+r.ate;if(!porPeriodo.has(k))porPeriodo.set(k,r);
    }
    return [...porPeriodo.values()];
  }
  const chavePeriodo = r => r.de+':'+r.ate;
  const baseElegivel = l => l.baseElegivelCentavos??(l.decisao!=='falha_comprovada'&&l.comissaoCentavos!=null?l.baseLiquidaCentavos:0);
  // Revalida sem editar snapshots. Ordem fixa evita dependências circulares:
  // revisão anterior pode exigir conciliação posterior, nunca o inverso.
  function divergencias(historico, modo) {
    const saldos=new Map(), erros=[];
    for(const a of ativas(historico,modo).sort((a,b)=>chavePeriodo(a).localeCompare(chavePeriodo(b)))){
      for(const l of lista(a.apuracao.linhas).slice().sort((a,b)=>String(a.dia).localeCompare(String(b.dia))||String(a.id).localeCompare(String(b.id)))){
        const base=baseElegivel(l)||0, saldo=saldos.get(l.osId)||{base:0,comissao:0};
        const esperado=base?percentual(saldo.base+base,100)-saldo.comissao:0;
        if(esperado!==l.comissaoCentavos)erros.push({id:a.id,periodo:chavePeriodo(a),osId:l.osId,esperado,registrado:l.comissaoCentavos});
        saldos.set(l.osId,{base:saldo.base+base,comissao:saldo.comissao+esperado});
      }
    }
    return erros;
  }
  // A comissão de uma base líquida em centavos (1%, a conta do motor), para mostrar o que uma perda tirou.
  const comissaoDaBase = c => Number.isSafeInteger(c) && c >= 0 ? percentual(c,100) : null;
  /* A COMISSÃO DE CADA BASE PELA CONTA ACUMULADA DO MOTOR: 1% do acumulado da
     O.S. menos o que já saiu, a partir de um saldo. É a conta da linha paga, e
     a da comissão perdida (o saldo paralelo); a aba Perdas usa esta mesma
     função quando o demonstrativo ainda não tem a O.S. */
  function comissoesAcumuladas(bases, saldo={base:0,comissao:0}) {
    let b=Number.isSafeInteger(saldo?.base)?saldo.base:0, c=Number.isSafeInteger(saldo?.comissao)?saldo.comissao:0;
    return lista(bases).map(x=>{if(!Number.isSafeInteger(x)||x<0)return null;const v=Math.max(0,percentual(b+x,100)-c);b+=x;c+=v;return v;});
  }
  // A frase da O.S. com a origem do retrabalho a definir: a mesma na linha, no diálogo e na aba Perdas.
  const TEXTO_ORIGEM_A_DEFINIR='Retrabalho com origem a definir: esta O.S. fica pendente (não paga e não perde) e não trava o demonstrativo. Defina a origem na ficha: ela entra numa revisão seguinte (feche o período de novo e gere nova prévia).';
  function apurar(fonte, entrada={}, contexto={}) {
    const config=entrada.config || {}, decisoes=entrada.decisoes || {}, entregas=entrada.entregas || {};
    const comRegua=typeof fonte?.regraPerdas==='string'&&fonte.regraPerdas!=='';
    const pendencias=[], add=t=>{if(!pendencias.includes(t))pendencias.push(t);};
    if(!fonte?.fechadoEm || !fonte.id) add('Selecione um fechamento operacional preservado.');
    const dataInicio=new Date(String(config.inicioEfetivo)+'T12:00:00Z');
    if(config.modo==='efetivo'&&(!Number.isFinite(dataInicio.getTime())||dataInicio.toISOString().slice(0,10)!==config.inicioEfetivo))add('Data de início efetivo inválida.');
    const periodo=fonte?.periodo || {de:fonte?.de,ate:fonte?.ate};
    if(!['teste','efetivo'].includes(config.modo))add('Defina teste ou início efetivo do programa.');
    if(config.modo==='efetivo' && (!/^\d{4}-\d{2}-\d{2}$/.test(config.inicioEfetivo || '') || config.inicioEfetivo<'2026-11-01' || periodo.de<config.inicioEfetivo || !texto(config.decisaoGestao)))add('Início efetivo exige decisão da gestão, desde novembro, anterior ou igual ao período.');
    if(config.criteriosExtras!=='somente_falha_comprovada')add('Valide atraso e retorno antecipado: apenas falha comprovada pode cortar esta comissão.');
    const osDaFonte=new Set(lista(fonte?.registros).map(r=>String(r.osId||r.id)));
    for(const d of divergencias(contexto.aprovacoes,config.modo))if(d.periodo<chavePeriodo(periodo)&&osDaFonte.has(d.osId))add('Concilie primeiro a aprovação do período '+d.periodo+' da O.S. '+d.osId+'. O acumulado de centavos mudou.');
    const acumulados=new Map();
    const referencias=[];
    /* O LÍQUIDO MUDADO DEPOIS DA APROVAÇÃO (M4 da auditoria de 11/10/2026, a
       parte que não depende da pergunta 3): a comissão acumulada vem das
       aprovações gravadas; se o ERP muda o líquido da O.S. depois de uma
       parcial aprovada, a parcela seguinte paga certo pela parte nova, e a
       parte já aprovada fica no líquido antigo, sem aviso. O líquido inteiro da
       O.S. de cada linha aprovada sai da base e da fração dela (a mesma conta
       da conferência por entrega); diferente do de agora, a linha e o
       demonstrativo ganham o aviso (não trava a aprovação: o ajuste no mês
       aberto, item 27 da fila, depende da pergunta 3). */
    const liquidoInteiro=(base,fr)=>Number.isSafeInteger(base)&&Number.isFinite(fr)&&fr>0?Math.round(base/fr):null;
    const liquidosAprovados=new Map(), avisos=[], avisar=t=>{if(!avisos.includes(t))avisos.push(t);};
    for(const a of ativas(contexto.aprovacoes,config.modo)){
      if(chavePeriodo(a)>=chavePeriodo(periodo))continue;
      referencias.push(a.id);
      for(const l of lista(a.apuracao.linhas)){
        const base=baseElegivel(l);
        const x=acumulados.get(l.osId)||{base:0,comissao:0};x.base+=base||0;x.comissao+=l.comissaoCentavos||0;acumulados.set(l.osId,x);
        const inteiro=liquidoInteiro(l.baseLiquidaCentavos,l.fracaoOS);
        if(inteiro!==null)liquidosAprovados.set(l.osId,[...(liquidosAprovados.get(l.osId)||[]),{aprovacaoId:a.id,periodo:{de:a.de,ate:a.ate},liquidoCentavos:inteiro}]);
      }
    }
    const liquidoMudou=(osId,numero,liquido,fracao)=>{
      const agora=liquidoInteiro(liquido,fracao);if(agora===null)return null;
      const x=lista(liquidosAprovados.get(osId)).find(y=>y.liquidoCentavos!==agora);if(!x)return null;
      const br=d=>String(d||'').split('-').reverse().join('/'), rs=c=>(c/100).toFixed(2).replace('.',',');
      avisar('O.S. '+(numero||osId)+' · O líquido mudou desde a aprovação de '+br(x.periodo.de)+' a '+br(x.periodo.ate)+' (R$ '+rs(x.liquidoCentavos)+' na aprovação, R$ '+rs(agora)+' agora). A parte já aprovada ficou no líquido antigo: o ajuste fica pendente (revisão daquele mês ou compensação).');
      return {aprovacaoId:x.aprovacaoId,periodo:x.periodo,liquidoAprovadoCentavos:x.liquidoCentavos,liquidoAtualCentavos:agora};
    };
    const rs=lista(fonte?.registros).slice().sort((a,b)=>String(a.dia).localeCompare(String(b.dia))||String(a.id).localeCompare(String(b.id))), ids=new Set(), fracoes=new Map(), linhas=[], pessoas=new Map();
    if(!rs.length)add('Sem entregas no fechamento.');
    const creditar=(partes,tipo,id)=>{for(const p of partes){const k=tipo+':'+p.pessoaId;const anterior=pessoas.get(k)||{pessoaId:p.pessoaId,tipo,centavos:0,entregas:[]};anterior.centavos+=p.centavos;anterior.entregas.push(id);pessoas.set(k,anterior);}};
    // O saldo paralelo da O.S.: o que ela teria pago sem a perda (o acumulado de verdade mais o que a perda tirou), pela mesma conta acumulada.
    const paralelos=new Map();
    const paralelo=osId=>{if(!paralelos.has(osId)){const x=acumulados.get(osId)||{base:0,comissao:0};paralelos.set(osId,{base:x.base,comissao:x.comissao});}return paralelos.get(osId);};
    for(const r of rs) {
      const osId=String(r.osId||r.id), d=decisoes[osId]||{}, e=entregas[r.id]||{}, lp=[];
      const falta=t=>{lp.push(t);add('O.S. '+(r.numero||osId)+' · '+t);};
      if(ids.has(r.id))falta('Entrega repetida.');ids.add(r.id);
      const fracao=r.entregaId?r.fracaoOS:1;
      if(!Number.isFinite(fracao)||fracao<0||fracao>1)falta('Fração da entrega inválida.');
      fracoes.set(osId,(fracoes.get(osId)||0)+(Number.isFinite(fracao)?fracao:0));
      const liquido=centavos(r.valor);
      const descontoTxt=Number.isSafeInteger(r.descontoCentavos)?'Diferença entre subtotal bruto e líquido (já deduzida)':'Desconto já incluído no líquido; detalhamento indisponível neste fechamento';
      if(comRegua&&r.perda==='retrabalho_instalacao'){
        // Perda automática (D-010): nada a decidir nem a ratear; zero para todos. A comissão perdida é a que a O.S. pagaria (saldo paralelo).
        let perdida=null;
        if(liquido!==null){const p=paralelo(osId);perdida=comissoesAcumuladas([liquido],p)[0];p.base+=liquido;p.comissao+=perdida;}
        linhas.push({id:r.id,osId,entregaId:r.entregaId||null,numero:r.numero,dia:r.dia,fracaoOS:fracao,origemValor:r.origemValor,baseLiquidaCentavos:liquido,baseElegivelCentavos:lp.length?null:0,baseBrutaCentavos:r.valorBrutoCentavos??null,descontoCentavos:r.descontoCentavos??null,desconto:descontoTxt,comissaoCentavos:lp.length?null:0,internaCentavos:lp.length?null:0,externaCentavos:lp.length?null:0,pontos:lp.length?null:0,pagamentos:[],pendencias:lp,decisao:'retrabalho_instalacao',perda:'retrabalho_instalacao',etapaOrigem:r.etapaOrigem,comissaoPerdidaCentavos:perdida});
        continue;
      }
      if(comRegua&&r.retrabalho===true&&Object.prototype.hasOwnProperty.call(r,'etapaOrigem')&&!r.etapaOrigem){
        // Origem a definir: só esta O.S. fica pendente (não paga e não perde), sem travar o demonstrativo; nada a decidir nem a conferir agora.
        linhas.push({id:r.id,osId,entregaId:r.entregaId||null,numero:r.numero,dia:r.dia,fracaoOS:fracao,origemValor:r.origemValor,baseLiquidaCentavos:liquido,baseElegivelCentavos:lp.length?null:0,baseBrutaCentavos:r.valorBrutoCentavos??null,descontoCentavos:r.descontoCentavos??null,desconto:descontoTxt,comissaoCentavos:lp.length?null:0,internaCentavos:lp.length?null:0,externaCentavos:lp.length?null:0,pontos:null,pagamentos:[],pendencias:[...lp,TEXTO_ORIGEM_A_DEFINIR],decisao:'origem_a_definir',origemADefinir:true,etapaOrigem:''});
        continue;
      }
      if(liquido===null || !r.confirmado || r.avisoValor || r.erroConferencia)falta('Valor líquido e participação precisam estar conferidos no fechamento.');
      if(e.entregue!==true || !documentada(e))falta('Comprovação da entrega física pendente.');
      const decisaoOk=documentada(d)&&['sem_falha','falha_comprovada','abono'].includes(d.decisao)&&['nenhuma','producao','cliente','incompleto','ma_conducao','atraso','retorno_antecipado','outra'].includes(d.tipo);
      if(!decisaoOk)falta('Ocorrência e responsabilidade aguardam decisão documentada.');
      if(d.decisao==='falha_comprovada' && ['producao','cliente','nenhuma'].includes(d.tipo))falta('Produção, cliente ou ausência de ocorrência não comprovam falha da instalação.');
      const zerada=decisaoOk&&d.decisao==='falha_comprovada'&&!['producao','cliente','nenhuma'].includes(d.tipo);
      const interna=e.interna || {};
      if(!['elegivel','impeditivo','nao_aplicavel'].includes(interna.situacao)||!documentada(interna))falta('Elegibilidade da montagem interna pendente.');
      const grupos=lista(r.grupos).length?r.grupos:[{equipeId:r.equipeId||'',cota:10000,membros:lista(r.membros).map(m=>m.chave)}];
      if(grupos.some(g=>!Number.isInteger(g.cota)||g.cota<0)||soma(grupos.map(g=>g.cota))!==10000)falta('Participações das equipes não fecham 100%.');
      const vistos=new Set(), externos=[];
      grupos.forEach((g,i)=>{
        const regra=lista(e.grupos)[i] || {}, membros=lista(g.membros).map(String);
        const ident=membros.map(chave=>({chave,pessoaId:idPessoa(chave)?chave:texto(e.identidades?.[chave])}));
        if(!ident.length||new Set(ident.map(p=>p.pessoaId)).size!==ident.length||ident.some(p=>!idPessoa(p.pessoaId)||vistos.has(p.pessoaId)))falta('Resolva os cadastros ambíguos por ID e confira pessoas repetidas.');
        ident.forEach(p=>vistos.add(p.pessoaId));
        let partes=[];
        if(ident.length===2){
          const lider=ident.find(p=>p.pessoaId===regra.montadorId);
          if(!lider)falta('Confirme o montador da dupla para dividir 60% / 40%.');
          else partes=[{pessoaId:lider.pessoaId,cota:6000},{pessoaId:ident.find(p=>p!==lider).pessoaId,cota:4000}];
        } else {
          partes=lista(regra.partes).map(p=>({pessoaId:texto(p.pessoaId),cota:p.cota}));
          if(!texto(regra.justificativa)||partes.length!==ident.length||new Set(partes.map(p=>p.pessoaId)).size!==ident.length||partes.some(p=>!ident.some(m=>m.pessoaId===p.pessoaId))||partes.some(p=>!Number.isInteger(p.cota)||p.cota<0)||soma(partes.map(p=>p.cota))!==10000){falta('Equipe solo, trio ou maior exige rateio explícito de 100% e justificativa.');partes=[];}
        }
        externos.push({equipeId:g.equipeId||'',cota:g.cota,partes});
      });
      const partesInternas=lista(interna.partes).map(p=>({pessoaId:texto(p.pessoaId),cota:p.cota}));
      if(interna.situacao==='elegivel' && (!partesInternas.length||partesInternas.some(p=>!idPessoa(p.pessoaId)||!Number.isInteger(p.cota)||p.cota<0)||new Set(partesInternas.map(p=>p.pessoaId)).size!==partesInternas.length||soma(partesInternas.map(p=>p.cota))!==10000))falta('Defina o rateio interno de 100% entre pessoas identificadas.');
      // Nunca usar acumulado físico da O.S.: ele inclui teste e inelegíveis.
      // O saldo vem de aprovações ativas do mesmo regime + elegíveis desta prévia.
      const saldo=acumulados.get(osId)||{base:0,comissao:0};
      const baseElegivelCentavos=lp.length||zerada?0:liquido;
      const calculado=baseElegivelCentavos?percentual(saldo.base+baseElegivelCentavos,100)-saldo.comissao:0;
      if(calculado<0)falta('Comissão anterior excede a base elegível. Prepare compensação da aprovação anterior.');
      const total=Math.max(0,calculado);
      if(!lp.length)acumulados.set(osId,{base:saldo.base+baseElegivelCentavos,comissao:saldo.comissao+total});
      if(!lp.length&&paralelos.has(osId)){const p=paralelos.get(osId);p.base+=baseElegivelCentavos;p.comissao+=total;}
      const internos=interna.situacao==='elegivel'?percentual(total,2000):0, externo=total-internos;
      let pagamentos=[];
      if(!lp.length){
        const porEquipe=ratear(externo,externos);
        pagamentos=porEquipe.flatMap(g=>ratear(g.centavos,g.partes).map(p=>({...p,equipeId:g.equipeId,tipo:'externa'})));
        if(internos)pagamentos.push(...ratear(internos,partesInternas).map(p=>({...p,tipo:'interna'})));
        creditar(pagamentos.filter(p=>p.tipo==='externa'),'externa',r.id);creditar(pagamentos.filter(p=>p.tipo==='interna'),'interna',r.id);
      }
      // O líquido da fonte já contém descontos proporcionais; não descontar outra vez.
      linhas.push({id:r.id,osId,entregaId:r.entregaId||null,numero:r.numero,dia:r.dia,fracaoOS:fracao,origemValor:r.origemValor,baseLiquidaCentavos:liquido,baseElegivelCentavos:lp.length?null:baseElegivelCentavos,baseBrutaCentavos:r.valorBrutoCentavos??null,descontoCentavos:r.descontoCentavos??null,desconto:descontoTxt,comissaoCentavos:lp.length?null:total,internaCentavos:lp.length?null:internos,externaCentavos:lp.length?null:externo,pontos:lp.length?null:zerada?0:fracao,pagamentos,pendencias:lp,decisao:d.decisao||'pendente'});
    }
    for(const l of linhas){const m=liquidoMudou(l.osId,l.numero,l.baseLiquidaCentavos,l.fracaoOS);if(m)l.liquidoMudou=m;}
    for(const [os,fracao] of fracoes)if(fracao>1.000001)add('O.S. '+os+' · Parciais ultrapassam uma O.S.; não aprovar.');
    const reconhecimento=config.reconhecimento||{};
    const quadro=new Map();
    for(const r of rs){const l=linhas.find(l=>l.id===r.id),gs=lista(r.grupos).length?r.grupos:[{equipeId:r.equipeId,equipeNome:r.equipeNome,cota:10000,membros:lista(r.membros).map(m=>m.chave)}];
      for(const g of gs){const membros=lista(g.membros).map(String).sort(),chave=g.equipeId||'avulsa:'+membros.join('|'),x=quadro.get(chave)||{chave,nome:g.equipeNome||'Composição avulsa',composicoes:[],pontos:0,pendente:false};
        if(!x.composicoes.some(c=>JSON.stringify(c)===JSON.stringify(membros)))x.composicoes.push(membros);
        x.pendente ||= l?.pontos==null;if(l?.pontos!=null)x.pontos+=l.pontos*g.cota/10000;
        quadro.set(chave,x);
      }
    }
    const equipes=[...quadro.values()].map(x=>{const avaliacao=reconhecimento.avaliacoes?.[x.chave]||{};return {...x,substituicao:x.composicoes.length>1,solo:x.composicoes.some(c=>c.length===1),situacao:['elegivel','inelegivel'].includes(avaliacao.situacao)&&texto(avaliacao.justificativa).length>=5?avaliacao.situacao:'pendente',justificativa:texto(avaliacao.justificativa)};});
    equipes.forEach(x=>x.empate=equipes.some(y=>y!==x&&!x.pendente&&!y.pendente&&Math.abs(x.pontos-y.pontos)<0.000001));
    const revisado=equipes.every(e=>e.situacao!=='pendente')&&['elegibilidade','identidade','substituicoes','empates','premios','decisao'].every(k=>texto(reconhecimento[k]).length>=5);
    return {motor:'comissao-2',referencias,periodo,fechamentoId:fonte?.id,config,pendencias,...(avisos.length?{avisos}:{}),aprovavel:pendencias.length===0,linhas,pessoas:[...pessoas.values()],totalCentavos:soma(linhas.map(l=>l.comissaoCentavos||0)),reconhecimento:{situacao:revisado?'criterios_documentados':'pendente',criterios:reconhecimento,equipes,campeao:null,aviso:'Ranking operacional não escolhe campeão nem autoriza prêmio. Resultado e prêmio exigem revisão humana específica.'}};
  }
  function erroAprovacao(revisao, hash, confirmacao) {
    if(!revisao || revisao.tipo!=='previa')return 'Selecione a última prévia financeira.';
    if(revisao.hash!==hash)return 'A prévia mudou. Releia o demonstrativo.';
    if(confirmacao!==true)return 'Confirme a revisão humana do demonstrativo.';
    if(!revisao.apuracao?.aprovavel)return 'Resolva todas as pendências antes de aprovar.';
    return '';
  }
  function conciliar(apuracao, anterior) {
    const mapa=new Map();
    for(const p of lista(anterior?.apuracao?.pessoas))mapa.set(p.tipo+':'+p.pessoaId,{...p,anteriorCentavos:p.centavos,centavos:0});
    for(const p of apuracao.pessoas){const k=p.tipo+':'+p.pessoaId;mapa.set(k,{...p,anteriorCentavos:mapa.get(k)?.anteriorCentavos||0});}
    return {...apuracao,anteriorAprovacao:anterior?.id||null,ajustes:[...mapa.values()].map(p=>({...p,diferencaCentavos:p.centavos-p.anteriorCentavos}))};
  }
  function compensar(anterior) {
    if(anterior?.tipo!=='aprovacao'||!anterior.apuracao?.aprovavel||anterior.apuracao.compensacaoDe)throw new Error('Selecione uma aprovação ativa para compensar.');
    return conciliar({...anterior.apuracao,motor:'comissao-2',compensacaoDe:anterior.id,linhas:[],pessoas:[],totalCentavos:0,pendencias:[],aprovavel:true},anterior);
  }
  function csv(revisao) {
    /* A recusa diz o que fazer (revisão da onda comissão, 12/10/2026): a frase
       antiga citava outubro em qualquer mês. */
    if(revisao?.tipo!=='aprovacao')throw new Error('Só uma aprovação exporta para pagamento: aprove a última prévia em Revisar e aprovar e exporte de novo.');
    if(!revisao.apuracao?.aprovavel)throw new Error('Esta aprovação tem pendências e não exporta: resolva-as numa nova prévia e aprove de novo.');
    if(revisao.apuracao.config?.modo!=='efetivo')throw new Error(String(revisao.de||'').slice(0,7)==='2026-10'?'Outubro é teste: a aprovação em modo teste não exporta para pagamento.':'Esta aprovação é de teste e não exporta para pagamento. Para pagar, crie uma nova prévia no modo efetivo (com o início efetivo e a decisão da gestão) e aprove de novo.');
    const cel=v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s)&&!/^-[0-9]+,[0-9]{2}$/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
    /* O ID E O MÊS COMO TEXTO PARA O EXCEL (item 6 da fila de 11/10/2026): o
       Excel abre 012345 como 12345 (o ID que começa com zero não casaria com o
       RH) e 2026-11 como data. A célula vai como a fórmula de texto ="012345",
       só para o ID de 6 dígitos e o mês AAAA-MM; o resto continua com a
       proteção contra fórmula. */
    const textoExcel=(v,re)=>re.test(String(v??''))?'"=""'+String(v)+'"""':cel(v);
    const ID=/^\d{6}$/,MES=/^\d{4}-\d{2}$/;
    const mes=String(revisao.de||revisao.apuracao.periodo?.de||'').slice(0,7);
    const rows=[['Revisão','Mês','Fechamento','Aprovação anterior','Pessoa ID','Nome','Tipo','Total atual (R$)','Diferença a conciliar (R$)'].map(cel)];
    for(const p of (revisao.apuracao.ajustes||[]))rows.push([cel(revisao.id),textoExcel(mes,MES),cel(revisao.apuracao.fechamentoId),cel(revisao.apuracao.anteriorAprovacao||''),textoExcel(p.pessoaId,ID),cel(p.nome||''),cel(p.tipo),cel((p.centavos/100).toFixed(2).replace('.',',')),cel((p.diferencaCentavos/100).toFixed(2).replace('.',','))]);
    return '\uFEFF'+rows.map(r=>r.join(';')).join('\r\n');
  }
  /* A FALHA COMPROVADA NOS PONTOS (D-004: "zera só os pontos e a comissão da
     O.S. afetada"; revisão da onda a3, 11/10/2026). O ranking, a Nota, a
     Conferência, o Por O.S., o ranking dos funcionários e o Relatório leem a
     decisão de falha comprovada da revisão que vale no demonstrativo que cobre
     a entrega, a mesma escolha da aba Perdas: em cada período, a última
     revisão; se ela for uma compensação, a última que não é. A decisão só vale
     aceita pelo motor (documentada, falha da instalação e a mesma em todas as
     entregas da O.S. no demonstrativo). Vale para as entregas da O.S. dentro do
     período do demonstrativo que a julgou; outro mês da mesma O.S. segue o
     demonstrativo dele (P-010 aberta). Sem revisão, nada muda. É leitura: não
     entra no fechamento nem no hash dele. */
  const SEM_DECISAO='Ocorrência e responsabilidade aguardam decisão documentada.', FALHA_FORA='Produção, cliente ou ausência de ocorrência não comprovam falha da instalação.';
  function falhaAceita(osId, revisao) {
    const ls=lista(revisao?.apuracao?.linhas).filter(l=>l&&String(l.osId)===osId);
    if(!ls.length||ls.some(l=>l.perda==='retrabalho_instalacao'||l.decisao==='origem_a_definir'))return false;
    const pend=ls.flatMap(l=>lista(l.pendencias));
    if(pend.includes(SEM_DECISAO)||pend.includes(FALHA_FORA))return false;
    return ls.every(l=>l.decisao==='falha_comprovada');
  }
  function demonstrativosVigentes(revisoes, periodo={}) {
    const grupos=new Map();
    for(const r of lista(revisoes)){if(!r||typeof r!=='object'||typeof r.de!=='string'||typeof r.ate!=='string')continue;const k=r.de+':'+r.ate;grupos.set(k,[...(grupos.get(k)||[]),r]);}
    const out=[];
    for(const rs of grupos.values()){
      const ordem=[...new Map(rs.map(r=>[String(r.id??r.revisao),r])).values()].sort((a,b)=>(Number(b.revisao)||0)-(Number(a.revisao)||0));
      const r=ordem.find(x=>!x?.apuracao?.compensacaoDe);
      if(!r)continue;
      const decisoes=r.entrada&&typeof r.entrada==='object'&&r.entrada.decisoes&&typeof r.entrada.decisoes==='object'?r.entrada.decisoes:{};
      const ids=[...new Set(lista(r.apuracao?.linhas).map(l=>String(l?.osId??'')).filter(Boolean))];
      out.push({de:r.de,ate:r.ate,exato:r.de===periodo?.de&&r.ate===periodo?.ate,revisao:r.revisao??null,tipo:r.tipo==='aprovacao'?'aprovacao':'previa',em:typeof r.em==='string'?r.em:'',
        os:Object.fromEntries(ids.map(id=>[id,falhaAceita(id,r)?{falha:true,tipo:texto(decisoes[id]?.tipo)}:{falha:false}]))});
    }
    return out;
  }
  // A decisão para a entrega da O.S. no dia: o demonstrativo que cobre o dia e tem a O.S. (o do recorte exato primeiro, depois o de período mais recente).
  function falhaComprovadaNoDia(demos, osId, dia) {
    const id=String(osId??''),d=String(dia||'');
    if(!id||!/^\d{4}-\d{2}-\d{2}$/.test(d))return null;
    const x=lista(demos).filter(z=>z&&z.os&&Object.prototype.hasOwnProperty.call(z.os,id)&&d>=z.de&&d<=z.ate)
      .sort((a,b)=>Number(!!b.exato)-Number(!!a.exato)||String(b.ate).localeCompare(String(a.ate))||String(b.em).localeCompare(String(a.em)))[0];
    return x&&x.os[id].falha?{de:x.de,ate:x.ate,revisao:x.revisao,tipo:x.tipo,em:x.em,tipoFalha:x.os[id].tipo||''}:null;
  }
  // As entregas com a falha comprovada que vale ficam sem pontos (perda:'falha_comprovada'), como o retrabalho de instalação. Devolve cópias; o registro de origem não muda.
  function comFalhasComprovadas(registros, demos, diaDe) {
    const ds=lista(demos);
    if(!ds.length)return lista(registros);
    return lista(registros).map(r=>{
      if(!r||typeof r!=='object'||r.perda)return r;
      const f=falhaComprovadaNoDia(ds,r.osId||r.id,typeof diaDe==='function'?diaDe(r):r.dia);
      return f?{...r,perda:'falha_comprovada',falhaComprovada:f}:r;
    });
  }
  /* A DIFERENÇA CONTRA A ÚLTIMA EXPORTADA (M6 da auditoria de 11/10/2026): a
     coluna "Diferença a conciliar" do CSV é contra a última aprovação; se a
     anterior nunca foi exportada, pagar só a diferença deixava a pessoa sem
     receber, e pagar o total depois de exportada pagava duas vezes. Os totais
     de uma revisão por pessoa e tipo, e a diferença deles contra os totais da
     última exportação do mesmo período (sem exportação anterior, contra zero). */
  function totaisDaRevisao(revisao) {
    const xs=lista(revisao?.apuracao?.ajustes).length?revisao.apuracao.ajustes:lista(revisao?.apuracao?.pessoas);
    return xs.map(p=>({pessoaId:String(p?.pessoaId??''),nome:texto(p?.nome),tipo:String(p?.tipo||''),centavos:Number.isSafeInteger(p?.centavos)?p.centavos:0}))
      .sort((a,b)=>a.pessoaId.localeCompare(b.pessoaId)||a.tipo.localeCompare(b.tipo));
  }
  function diferencaContraExportada(totais, anteriores) {
    const mapa=new Map();
    for(const p of lista(anteriores))mapa.set(p.tipo+':'+p.pessoaId,{pessoaId:p.pessoaId,nome:p.nome||'',tipo:p.tipo,anteriorCentavos:Number.isSafeInteger(p.centavos)?p.centavos:0,centavos:0});
    for(const p of lista(totais)){const k=p.tipo+':'+p.pessoaId,x=mapa.get(k);mapa.set(k,{pessoaId:p.pessoaId,nome:p.nome||x?.nome||'',tipo:p.tipo,anteriorCentavos:x?x.anteriorCentavos:0,centavos:p.centavos});}
    return [...mapa.values()].map(p=>({...p,diferencaCentavos:p.centavos-p.anteriorCentavos})).sort((a,b)=>a.pessoaId.localeCompare(b.pessoaId)||a.tipo.localeCompare(b.tipo));
  }
  /* SÓ O QUE DECIDE A COMISSÃO (onda comissão, 12/10/2026; linha Baixa da
     auditoria de 11/10/2026, "comparar só os campos de dinheiro"). Aprovar e
     Exportar recalculam a fonte do mês e comparavam com o hash do fechamento
     inteiro: a conferência da volta mudada depois, o carro renomeado no
     Ativos, os pesos da Nota ou o cliente renomeado davam 409 "A fonte
     mudou", sem nada mudar no dinheiro. O hash do fechamento NÃO muda (mês
     fechado não se recalcula); o que muda é o que a aprovação confere: de cada
     entrega, só o que este motor lê para pagar. O líquido, quem recebe e a
     parte de cada um (as pessoas, as equipes e as cotas delas), a confirmação
     e a conferência do valor, o dia e a fração (a ordem e o acumulado da O.S.)
     e o efeito da régua das perdas (retrabalho de instalação e a origem a
     definir); e, do selo, o período e a régua. As decisões de falha
     comprovada, a entrega física e os rateios moram na prévia, que tem o hash
     dela. O bruto e o desconto (só exibidos), o cliente, o número, a volta, a
     Nota e quem confirmou ficam de fora.
     A O.S. COM A ORIGEM A DEFINIR NO SELO (item 2 da onda): ela não paga e não
     perde no demonstrativo; definir a origem depois não trava a aprovação nem
     a exportação. A mudança vira pendência para a próxima revisão ou
     compensação (`pendentes`). */
  const proprio=(o,k)=>!!o&&typeof o==='object'&&Object.prototype.hasOwnProperty.call(o,k);
  const canon=v=>{
    if(Array.isArray(v))return '['+v.map(x=>x===undefined?'null':canon(x)).join(',')+']';
    if(v&&typeof v==='object')return '{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}';
    const t=JSON.stringify(v);return t===undefined?'null':t;
  };
  const reguaDoSelo=selo=>typeof selo?.regraPerdas==='string'&&selo.regraPerdas!==''?selo.regraPerdas:'';
  function efeitoNaComissao(r, comRegua) {
    if(!comRegua||!r)return '';
    if(r.perda==='retrabalho_instalacao')return 'retrabalho_instalacao';
    if(r.retrabalho===true&&proprio(r,'etapaOrigem')&&!r.etapaOrigem)return 'origem_a_definir';
    return '';
  }
  function dinheiroDoRegistro(r, comRegua) {
    const fr=r?.entregaId?(Number.isFinite(r.fracaoOS)?Math.round(r.fracaoOS*1e9)/1e9:null):1;
    const efeito=efeitoNaComissao(r,comRegua);
    const base={id:String(r?.id??''),osId:String(r?.osId||r?.id||''),entregaId:r?.entregaId||null,dia:String(r?.dia||''),fracaoOS:fr,efeito};
    // A perda automática não paga ninguém e a origem a definir fica pendente: só a marca conta.
    if(efeito)return base;
    const grupos=lista(r.grupos).length?lista(r.grupos).map(g=>({equipeId:String(g?.equipeId||''),cota:Number.isInteger(g?.cota)?g.cota:null,membros:lista(g?.membros).map(String).sort()})):null;
    return {...base,liquidoCentavos:centavos(r.valor),confirmado:r.confirmado===true,avisoValor:!!r.avisoValor,erroConferencia:!!r.erroConferencia,
      equipeId:grupos?'':String(r.equipeId||''),membros:lista(r.membros).map(m=>String(m?.chave??'')).sort(),grupos};
  }
  // A impressão do dinheiro de uma fonte inteira (o selo ou o recálculo), com a régua do selo.
  function dinheiroDaFonte(fonte, regua=reguaDoSelo(fonte)) {
    const per=fonte?.periodo||{de:fonte?.de,ate:fonte?.ate};
    return {periodo:{de:String(per?.de||''),ate:String(per?.ate||'')},regra:String(fonte?.regra||''),regraPerdas:regua,
      registros:lista(fonte?.registros).map(r=>dinheiroDoRegistro(r,!!regua)).sort((a,b)=>a.id.localeCompare(b.id))};
  }
  const CAMPO_DINHEIRO={liquidoCentavos:'valor líquido',membros:'quem recebe',grupos:'equipes e cotas',equipeId:'equipe',confirmado:'participação confirmada',avisoValor:'conferência do valor',erroConferencia:'conferência dos itens',fracaoOS:'parte da O.S. na entrega',dia:'dia da entrega',entregaId:'entrega',osId:'O.S.',efeito:'retrabalho de instalação ou a origem',saiu:'saiu da base do mês',entrou:'entrou na base do mês',regua:'régua ou período do fechamento'};
  function mudancasDeDinheiro(selo, atual) {
    const regua=reguaDoSelo(selo), comRegua=!!regua;
    const a=new Map(lista(selo?.registros).map(r=>[String(r?.id),r])), b=new Map(lista(atual?.registros).map(r=>[String(r?.id),r]));
    const dinheiro=[], pendentes=[];let foraDoDinheiro=0;
    const da=dinheiroDaFonte(selo,regua), db=dinheiroDaFonte(atual,regua);
    if(canon(da.periodo)!==canon(db.periodo)||da.regra!==db.regra)dinheiro.push({id:'',osId:'',numero:'',dia:'',campos:['regua'],texto:CAMPO_DINHEIRO.regua});
    const linha=(r,campos,antes,depois)=>({id:String(r.id),osId:String(r.osId||r.id),numero:String(r.numero||''),dia:String(r.dia||''),campos,texto:campos.map(c=>CAMPO_DINHEIRO[c]||c).join(', '),
      ...(antes!==undefined?{antesCentavos:antes}:{}),...(depois!==undefined?{depoisCentavos:depois}:{})});
    for(const [id,r] of a){
      const x=b.get(id), pa=dinheiroDoRegistro(r,comRegua);
      if(pa.efeito==='origem_a_definir'){
        const px=x?dinheiroDoRegistro(x,comRegua):null;
        if(!x||canon(px)!==canon(pa))pendentes.push({...linha(r,[x?'efeito':'saiu']),origemDefinida:!!x&&px.efeito!=='origem_a_definir',efeitoAgora:px?px.efeito:''});
        continue;
      }
      if(!x){dinheiro.push(linha(r,['saiu'],pa.liquidoCentavos));continue;}
      const px=dinheiroDoRegistro(x,comRegua);
      const campos=[...new Set([...Object.keys(pa),...Object.keys(px)])].filter(k=>canon(pa[k])!==canon(px[k]));
      if(campos.length)dinheiro.push(linha(r,campos,pa.liquidoCentavos,px.liquidoCentavos));
      else if(canon(r)!==canon(x))foraDoDinheiro++;
    }
    for(const [id,x] of b)if(!a.has(id))dinheiro.push(linha(x,['entrou'],undefined,dinheiroDoRegistro(x,comRegua).liquidoCentavos));
    return {igual:!dinheiro.length,dinheiro,pendentes,foraDoDinheiro};
  }
  // A frase de uma lista de mudanças de dinheiro: a mesma na porta e na tela.
  function textoMudancasDeDinheiro(ms, max=6) {
    const xs=lista(ms);
    const um=m=>m.numero?'O.S. '+m.numero+(m.texto?': '+m.texto:''):m.texto||'';
    return xs.slice(0,max).map(um).join('; ')+(xs.length>max?'; e mais '+(xs.length-max):'');
  }
  /* QUEM APROVA A COMISSÃO (D-013 e D-014, 12/10/2026). A configuração (gravada
     só pelo admin, na ação comissaoAprovadorGravar) diz o TITULAR pelo ID de 6
     dígitos e, opcional, um SUBSTITUTO com início, fim opcional e motivo.
     Enquanto o substituto vale (de <= hoje <= até), ele aprova, mesmo que o
     papel dele não seja pcp, e o titular não; sem substituto, o titular; o
     admin aprova sempre. Sem configuração (ou sem titular), vale a D-013: pcp e
     admin. A comparação é pelo ID do crachá ou da conta (porId), nunca pelo
     nome. `hoje` é o dia de São Paulo (AAAA-MM-DD). */
  const ehId6 = v => /^\d{6}$/.test(String(v ?? '').trim());
  const ehDia = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''));
  function substitutoVigente(cfg, hoje) {
    const s = cfg && cfg.substituto;
    if (!s || !ehId6(s.id) || !ehDia(s.de) || !ehDia(hoje)) return null;
    if (hoje < s.de || (ehDia(s.ate) && hoje > s.ate)) return null;
    return s;
  }
  function aprovadorVigente(cfg, hoje) {
    if (!cfg || !ehId6(cfg.titularId)) return {modo:'d013'};
    const s = substitutoVigente(cfg, hoje);
    return s ? {modo:'substituto', id:String(s.id).trim(), titularId:String(cfg.titularId).trim(), de:s.de, ate:ehDia(s.ate) ? s.ate : ''}
      : {modo:'titular', id:String(cfg.titularId).trim()};
  }
  const diaBR = d => ehDia(d) ? d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4) : '';
  function quemAprova(quem, cfg, hoje) {
    const papel = String(quem && quem.papel || ''), id = String(quem && quem.porId || '').trim();
    const vigente = aprovadorVigente(cfg, hoje);
    if (papel === 'admin') return {ok:true, como:'admin', vigente};
    if (vigente.modo === 'd013') return papel === 'pcp' ? {ok:true, como:'pcp', vigente} : {ok:false, vigente, erro:'A aprovação da comissão é da gestão do PCP (pcp ou admin).'};
    if (ehId6(id) && id === vigente.id) return {ok:true, como:vigente.modo, vigente};
    if (vigente.modo === 'substituto') return {ok:false, vigente, erro:id === vigente.titularId
      ? `Enquanto o substituto designado pela gestão estiver valendo${vigente.ate ? ' (até '+diaBR(vigente.ate)+')' : ''}, quem aprova a comissão é ele, não o titular. O admin também aprova.`
      : 'Quem aprova a comissão hoje é o substituto designado pela gestão (ou o admin).'};
    return {ok:false, vigente, erro:'Quem aprova a comissão é o titular designado pela gestão (ou o admin).' + (ehId6(id) ? '' : ' Este acesso não tem o ID de 6 dígitos ligado: o login precisa ser o apelido da ficha do RH.')};
  }
  return {apurar,ativas,divergencias,ratear,erroAprovacao,conciliar,compensar,csv,comissaoDaBase,comissoesAcumuladas,TEXTO_ORIGEM_A_DEFINIR,demonstrativosVigentes,falhaComprovadaNoDia,comFalhasComprovadas,
    dinheiroDoRegistro,dinheiroDaFonte,mudancasDeDinheiro,textoMudancasDeDinheiro,totaisDaRevisao,diferencaContraExportada,
    aprovadorVigente,substitutoVigente,quemAprova};
})();

if (typeof module !== 'undefined') module.exports = COMISSAO;
