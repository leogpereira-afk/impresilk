/* Comissão v1: centavos inteiros; nunca altera ranking operacional ou regra legada.
 * Cada revisão referencia fatos selados. Desconhecido é pendência, não punição.
 * Bloco idêntico no navegador e no servidor, verificado nos testes. */
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
  function apurar(fonte, entrada={}) {
    const config=entrada.config || {}, decisoes=entrada.decisoes || {}, entregas=entrada.entregas || {};
    const pendencias=[], add=t=>{if(!pendencias.includes(t))pendencias.push(t);};
    if(!fonte?.fechadoEm || !fonte.id) add('Selecione um fechamento operacional preservado.');
    const dataInicio=new Date(String(config.inicioEfetivo)+'T12:00:00Z');
    if(config.modo==='efetivo'&&(!Number.isFinite(dataInicio.getTime())||dataInicio.toISOString().slice(0,10)!==config.inicioEfetivo))add('Data de início efetivo inválida.');
    const periodo=fonte?.periodo || {de:fonte?.de,ate:fonte?.ate};
    if(!['teste','efetivo'].includes(config.modo))add('Defina teste ou início efetivo do programa.');
    if(config.modo==='efetivo' && (!/^\d{4}-\d{2}-\d{2}$/.test(config.inicioEfetivo || '') || config.inicioEfetivo<'2026-11-01' || periodo.de<config.inicioEfetivo || !texto(config.decisaoGestao)))add('Início efetivo exige decisão da gestão, desde novembro, anterior ou igual ao período.');
    if(config.criteriosExtras!=='somente_falha_comprovada')add('Valide atraso e retorno antecipado: apenas falha comprovada pode cortar esta comissão.');
    const rs=lista(fonte?.registros), ids=new Set(), fracoes=new Map(), linhas=[], pessoas=new Map();
    if(!rs.length)add('Sem entregas no fechamento.');
    const creditar=(partes,tipo,id)=>{for(const p of partes){const k=tipo+':'+p.pessoaId;const anterior=pessoas.get(k)||{pessoaId:p.pessoaId,tipo,centavos:0,entregas:[]};anterior.centavos+=p.centavos;anterior.entregas.push(id);pessoas.set(k,anterior);}};
    for(const r of rs) {
      const osId=String(r.osId||r.id), d=decisoes[osId]||{}, e=entregas[r.id]||{}, lp=[];
      const falta=t=>{lp.push(t);add('O.S. '+(r.numero||osId)+' · '+t);};
      if(ids.has(r.id))falta('Entrega repetida.');ids.add(r.id);
      const fracao=r.entregaId?r.fracaoOS:1;
      if(r.entregaId&&(!Number.isSafeInteger(r.baseAnteriorCentavos)||r.baseAnteriorCentavos<0))falta('Esta parcial precisa de nova revisão operacional para preservar os centavos acumulados.');
      if(!Number.isFinite(fracao)||fracao<0||fracao>1)falta('Fração da entrega inválida.');
      fracoes.set(osId,(fracoes.get(osId)||0)+(Number.isFinite(fracao)?fracao:0));
      const liquido=centavos(r.valor);
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
      // Parcelas levam a diferença acumulada: duas entregas de R$0,50
      // não geram dois centavos quando 1% de R$1,00 é um centavo.
      const antes=Number.isSafeInteger(r.baseAnteriorCentavos)&&r.baseAnteriorCentavos>=0?r.baseAnteriorCentavos:0;
      const comissao=liquido===null?0:percentual(antes+liquido,100)-percentual(antes,100), total=zerada?0:comissao;
      const internos=interna.situacao==='elegivel'?percentual(total,2000):0, externo=total-internos;
      let pagamentos=[];
      if(!lp.length){
        const porEquipe=ratear(externo,externos);
        pagamentos=porEquipe.flatMap(g=>ratear(g.centavos,g.partes).map(p=>({...p,equipeId:g.equipeId,tipo:'externa'})));
        if(internos)pagamentos.push(...ratear(internos,partesInternas).map(p=>({...p,tipo:'interna'})));
        creditar(pagamentos.filter(p=>p.tipo==='externa'),'externa',r.id);creditar(pagamentos.filter(p=>p.tipo==='interna'),'interna',r.id);
      }
      // O líquido da fonte já contém descontos proporcionais; não descontar outra vez.
      linhas.push({id:r.id,osId,entregaId:r.entregaId||null,numero:r.numero,dia:r.dia,fracaoOS:fracao,origemValor:r.origemValor,baseLiquidaCentavos:liquido,baseBrutaCentavos:r.valorBrutoCentavos??null,descontoCentavos:r.descontoCentavos??null,desconto:Number.isSafeInteger(r.descontoCentavos)?'Diferença entre subtotal bruto e líquido (já deduzida)':'Desconto já incluído no líquido; detalhamento indisponível neste fechamento',comissaoCentavos:lp.length?null:total,internaCentavos:lp.length?null:internos,externaCentavos:lp.length?null:externo,pontos:lp.length?null:zerada?0:fracao,pagamentos,pendencias:lp,decisao:d.decisao||'pendente'});
    }
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
    return {motor:'comissao-1',periodo,fechamentoId:fonte?.id,config,pendencias,aprovavel:pendencias.length===0,linhas,pessoas:[...pessoas.values()],totalCentavos:soma(linhas.map(l=>l.comissaoCentavos||0)),reconhecimento:{situacao:revisado?'criterios_documentados':'pendente',criterios:reconhecimento,equipes,campeao:null,aviso:'Ranking operacional não escolhe campeão nem autoriza prêmio. Resultado e prêmio exigem revisão humana específica.'}};
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
  function csv(revisao) {
    if(revisao?.tipo!=='aprovacao'||!revisao.apuracao?.aprovavel||revisao.apuracao.config.modo!=='efetivo')throw new Error('Pagamento exige aprovação de período efetivo. Outubro é teste.');
    const cel=v=>{let s=String(v??'');if(/^[=+@\-\t\r]/.test(s)&&!/^-[0-9]+,[0-9]{2}$/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
    const rows=[['Revisão','Fechamento','Aprovação anterior','Pessoa ID','Nome','Tipo','Total atual (R$)','Diferença a conciliar (R$)']];
    for(const p of (revisao.apuracao.ajustes||[]))rows.push([revisao.id,revisao.apuracao.fechamentoId,revisao.apuracao.anteriorAprovacao||'',p.pessoaId,p.nome||'',p.tipo,(p.centavos/100).toFixed(2).replace('.',','),(p.diferencaCentavos/100).toFixed(2).replace('.',',')]);
    return '\uFEFF'+rows.map(r=>r.map(cel).join(';')).join('\r\n');
  }
  return {apurar,ratear,erroAprovacao,conciliar,csv};
})();

export { COMISSAO };
