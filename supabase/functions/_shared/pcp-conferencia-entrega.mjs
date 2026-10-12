import { ENTREGA_ITEM } from './pcp-entrega-item.mjs';
/* Conferências independentes: item + quantidade + dia + divisão da equipe.
   Uma seleção nunca fecha a O.S. nem muda a equipe operacional. */
export const CONFERENCIA_ENTREGA = (() => {
  const motor = () => typeof ENTREGA_ITEM !== 'undefined' ? ENTREGA_ITEM : require('./entrega-item.js');
  const lista = x => Array.isArray(x) ? x : [];
  const identidade = it => JSON.stringify([String(it?.item || ''), String(it?.descricao || ''), String(it?.medidas || ''), String(it?.qtde ?? it?.qtd ?? ''), String(it?.unidade || '')]);
  function catalogo(os) {
    const itens = lista(os?.itens).map((it, indice) => ({indice, chave:it?.uid ? 'uid:' + it.uid : 'item:' + identidade(it), identidade:identidade(it), qtde:motor().qtdeNum(it), descricao:String(it?.descricao || 'Item ' + (indice + 1)), cancelado:!!motor().situacaoItem(it).cancelado}));
    const cont = new Map(); itens.forEach(i => cont.set(i.chave, (cont.get(i.chave) || 0) + 1));
    return itens.map(i => ({...i, ambiguo:cont.get(i.chave) !== 1}));
  }
  /* O ITEM CANCELADO COM PARTE JÁ CONFERIDA (D1 da revisão da onda
     operação): o cancelamento vale só para o saldo. A parte que a gestão já
     conferiu continua valendo na leitura e na apuração (antes a parcial
     inteira deixava de se ler, "Item cancelado não pode entrar na entrega", e
     a entrega conferida saía da apuração). Só a entrega NOVA ou EDITADA
     (`novas`: id → a versão gravada dela, ou null) é conferida contra o
     cancelamento: a nova não leva o item cancelado, e a editada (inclusive na
     revisão) mantém dele no máximo o que já tinha. */
  function validar(os, entregas, hoje = '', {novas = null} = {}) {
    if (!Array.isArray(entregas) || entregas.length > 100) return 'Limite de 100 entregas por O.S.';
    const itens = catalogo(os), por = new Map(itens.map(i => [i.chave, i])), usados = new Map(), ids = new Set();
    for (const e of entregas) {
      if (!e || !/^[a-zA-Z0-9_-]{1,80}$/.test(e.id || '') || ids.has(e.id)) return 'Código de entrega inválido ou repetido.';
      ids.add(e.id);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e.dia || '') || !Number.isFinite(Date.parse(e.dia + 'T12:00:00Z')) || new Date(e.dia + 'T12:00:00Z').toISOString().slice(0,10) !== e.dia || e.dia < '2020-01-01' || (hoje && e.dia > hoje)) return 'Informe uma data de entrega válida, até hoje.';
      if (!Array.isArray(e.itens) || !e.itens.length || e.itens.length > itens.length) return 'Selecione ao menos um item entregue.';
      const vistos = new Set(), nova = !!novas && typeof novas.has === 'function' && novas.has(e.id), antesDela = nova ? novas.get(e.id) : null;
      for (const p of e.itens) {
        const it = por.get(p?.chave);
        if (!it || it.ambiguo || it.identidade !== p.identidade) return 'Um item mudou ou não pode ser identificado. Atualize a O.S. e confira a seleção.';
        if (it.cancelado && nova) {
          const tinha = lista(antesDela && antesDela.itens).filter(x => x && x.chave === p.chave).reduce((n, x) => n + (Number(x.qtde) || 0), 0);
          if (!(Number(p.qtde) <= tinha)) return tinha ? 'Item cancelado: esta entrega mantém dele no máximo o que já tinha sido conferido (' + tinha + ').' : 'Item cancelado não pode entrar na entrega.';
        }
        if (vistos.has(p.chave)) return 'O mesmo item aparece duas vezes nesta entrega.';
        vistos.add(p.chave);
        if (!Number.isInteger(p.qtde) || p.qtde <= 0 || p.qtde > it.qtde) return 'Quantidade entregue inválida.';
        const soma = (usados.get(p.chave) || 0) + p.qtde;
        if (soma > it.qtde) return 'A quantidade ultrapassa o saldo do item entre as entregas.';
        usados.set(p.chave, soma);
      }
    }
    return '';
  }
  /* REVISAR UMA PARCIAL (M12 da auditoria de 11/10/2026, onda operação):
     valida SÓ a entrega editada. As outras entram no saldo só pelos itens que
     ainda se leem (o mesmo código e a mesma identidade); a outra que não se
     lê mais (um item mudou) fica como está, para a revisão dela. Antes cada
     parcial só podia ser refeita se a outra estivesse válida, e duas
     parciais quebradas não tinham conserto pela tela. */
  function lidasParaSaldo(os, entregas) {
    const por = new Map(catalogo(os).map(i => [i.chave, i]));
    return lista(entregas).filter(e => e && typeof e === 'object').map(e => ({...e, itens:lista(e.itens).filter(p => { const it = por.get(p?.chave); return !!it && !it.ambiguo && it.identidade === p.identidade; })})).filter(e => e.itens.length);
  }
  const validarRevisao = (os, outras, editada, hoje = '', antes = null) => validar(os, [...lidasParaSaldo(os, outras), editada], hoje, {novas:new Map([[editada && editada.id, antes || null]])});
  function apurar(os, liquido, entregas = lista(os?.conferenciasEntrega)) {
    const erro = validar(os, entregas);
    if (erro) return {erro, entregas:[], saldo:null, total:null};
    const itens = catalogo(os), por = new Map(itens.map(i => [i.chave, i]));
    const rateio = motor().valorItemRateado(os, {liquido});
    // Sem base monetária confiável, não inventar valor nem rateio igual entre produtos.
    const temBase = liquido != null && liquido !== '' && Number.isFinite(Number(liquido)) && Number(liquido) >= 0;
    const numero = v => v == null || v === '' ? NaN : Number(typeof v === 'string' && v.includes(',') ? v.replace(/\./g,'').replace(',','.') : v);
    const pesos = lista(os.itens).map(it => numero(it.subtotal));
    const valorConhecido = temBase && (itens.length === 1 || pesos.every(v => Number.isFinite(v) && v >= 0) && pesos.some(v => v > 0));
    const usados = new Map();
    const saida = entregas.slice().sort((a,b) => a.dia.localeCompare(b.dia) || a.id.localeCompare(b.id)).map(e => {
      let valor = 0;
      const detalhes = e.itens.map(p => {
        const it = por.get(p.chave), antes = usados.get(p.chave) || 0, depois = antes + p.qtde, v = rateio.itens[it.indice];
        const parte = Math.floor(v * depois / it.qtde) - Math.floor(v * antes / it.qtde);
        usados.set(p.chave, depois); valor += parte;
        return {...p, descricao:it.descricao, valor:valorConhecido ? parte : null};
      });
      return {...e, itens:detalhes, valor:valorConhecido ? valor : null};
    });
    /* O CANCELADO NÃO É SALDO (item 4 da fila de 11/10/2026 e a linha Baixa
       "saldo do cancelado" da auditoria). O item cancelado e, na O.S.
       cancelada (no ERP ou à mão), tudo o que ainda não foi conferido saem do
       saldo a conferir: o cancelamento cancela o SALDO, e o que a gestão já
       conferiu continua valendo. O valor do que foi cancelado vai à parte
       (cancelado), só quando existe: a O.S. sem cancelamento sai igual. */
    const osCancelada = !!(motor().canceladaOS && motor().canceladaOS(os));
    let canceladoValor = 0, canceladoUnidades = 0;
    for (const it of itens) {
      const u = usados.get(it.chave) || 0;
      if (u >= it.qtde || !(it.cancelado || osCancelada)) continue;
      const v = rateio.itens[it.indice] || 0;
      canceladoUnidades += it.qtde - u; canceladoValor += v - Math.floor(v * u / it.qtde);
    }
    const saldoItens = itens.filter(it => !it.cancelado && !osCancelada && (usados.get(it.chave) || 0) < it.qtde).map(it => ({...it, saldo:it.qtde - (usados.get(it.chave) || 0)}));
    return {erro:'', entregas:saida, saldoItens, total:valorConhecido ? rateio.total : null, saldo:valorConhecido ? rateio.total - saida.reduce((s,e) => s + e.valor,0) - canceladoValor : null,
      ...(canceladoUnidades ? {cancelado:valorConhecido ? canceladoValor : null, canceladoUnidades} : {})};
  }
  // Conferência administrativa e declaração física são evidências distintas.
  // Nunca altera finalizadaEm nem soma marcas físicas às quantidades conferidas.
  function estado(os, liquido) {
    const registros = lista(os?.conferenciasEntrega), ap = apurar(os || {}, liquido);
    // A O.S. cancelada: o que não foi conferido não é saldo (item 4). A parte conferida continua.
    const osCancelada = !!(motor().canceladaOS && motor().canceladaOS(os || {}));
    const itens = catalogo(os).map(it => {
      const fisico = motor().situacaoItem(os.itens[it.indice], os);
      const conferido = ap.erro ? null : registros.reduce((n,e) => n + lista(e.itens).filter(p => p.chave === it.chave).reduce((a,p) => a + p.qtde,0),0);
      return {...it, declarado: Number(fisico.declarado) || 0, entregueFisico: Number(fisico.entregue) || 0, conferido, saldo: conferido === null ? null : it.cancelado || osCancelada ? 0 : it.qtde-conferido};
    });
    const saldoUnidades = ap.erro ? null : itens.reduce((n,i)=>n+(i.saldo || 0),0);
    const restoCancelado = !ap.erro && osCancelada && registros.length > 0 && Number(ap.canceladoUnidades) > 0;
    const situacao = ap.erro ? 'inconsistente' : !registros.length ? 'sem_conferencia' : saldoUnidades > 0 ? 'parcial' : restoCancelado ? 'saldo_cancelado' : 'saldo_concluido';
    const divergencia = !!os?.finalizadaEm && registros.length > 0 && situacao !== 'saldo_concluido' && situacao !== 'saldo_cancelado';
    const rotulo = {inconsistente:'Conferência inconsistente',sem_conferencia:'Sem conferência por item',parcial:'Entrega parcial conferida',saldo_concluido:'Saldo de itens conferido',saldo_cancelado:'Parte entregue conferida, saldo cancelado'}[situacao];
    const conferidas = itens.reduce((n,i)=>n+(i.conferido || 0),0);
    const resumo = rotulo + (registros.length && !ap.erro ? ' · ' + conferidas + ' unidades conferidas · ' + (restoCancelado ? ap.canceladoUnidades + ' canceladas' : saldoUnidades + ' a conferir') : '') + (divergencia ? ' · finalização anterior com saldo: revisar' : '') + (ap.erro ? ' · '+ap.erro : '');
    return {...ap,itens,situacao,rotulo,resumo,saldoUnidades,divergencia,conferidoValor:ap.saldo===null?null:ap.total-ap.saldo-(ap.cancelado || 0),ultimoDia:registros.map(e=>e.dia).sort().pop() || ''};
  }
  /* COMO ESTAVA NO FIM DO DIA (revisão da onda fechamento, D2 da lente
     dinheiro, 12/10/2026): a O.S. vista só com o que tinha acontecido até o
     fim de `dia`, no relógio de São Paulo: as conferências com o dia até ele,
     as marcas dos itens com o dia até ele (o desfazer também é marca), e a
     finalização, o lançamento e o cancelamento só se vieram até ele. A
     apuração de um período usa esta O.S. para o estado das entregas dele: a
     parcial conferida em novembro continua "parcial" no recálculo de novembro
     fechado quando o resto chega em dezembro. Antes o estado mudava (parcial
     para saldo concluído), o hash do selo deixava de bater e Aprovar e
     Exportar novembro davam 409 "A fonte mudou". Não muda o valor de nenhuma
     entrega (a parte k vale pela soma acumulada até ela). Sem dia válido,
     devolve a própria O.S.
     GRAVADO ATÉ O FECHAMENTO (onda cancelamento, 12/10/2026; baixa da
     verificação da onda operação): a marca de item tem o dia declarado e o
     carimbo `em` do servidor (quando foi gravada). O cancelamento gravado em
     dezembro com o dia 20/11 passava pelo dia e mudava o recálculo de
     novembro fechado (o hash do selo deixava de bater). Com `gravadoAte` (o
     instante do fechamento, que o recálculo do selo passa), a marca gravada
     depois dele também sai: o que foi gravado depois do fechamento só entra
     numa revisão nova. A marca sem carimbo (antiga) e o corte inválido ficam
     como antes; sem `gravadoAte`, só o dia, como antes. */
  const instante = v => /^\d{4}-\d{2}-\d{2}T/.test(String(v || '')) ? Date.parse(String(v)) : NaN;
  const gravadaDepois = (m, corte) => Number.isFinite(corte) && !!m && typeof m === 'object' && instante(m.em) > corte;
  function noFimDoDia(os, dia, {gravadoAte = ''} = {}) {
    if (!os || typeof os !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(String(dia || ''))) return os;
    const ate = String(dia), depois = v => { const d = motor().diaSP(v); return !!d && d > ate; }, corte = instante(gravadoAte);
    const out = {...os, conferenciasEntrega:lista(os.conferenciasEntrega).filter(e => !(e && String(e.dia || '') > ate))};
    if (Array.isArray(os.itens)) out.itens = os.itens.map(it => it && typeof it === 'object' && Array.isArray(it.entregas) ? {...it, entregas:it.entregas.filter(m => !(m && (depois(m.dia) || gravadaDepois(m, corte))))} : it);
    if (depois(os.finalizadaEm)) for (const k of ['finalizadaEm', 'finalizadoPor', 'baixaAutoERP', 'finalizadaPorCampo']) delete out[k];
    const l = os.entregaLancada;
    if (depois(l && typeof l === 'object' ? l.data : l)) delete out.entregaLancada;
    if (os.cancelamento && typeof os.cancelamento === 'object' && depois(os.cancelamento.em)) delete out.cancelamento;
    return out;
  }
  /* As marcas que o corte tira e o dia não tiraria: as do mês fechado (ou sem
     dia válido) gravadas depois do fechamento. A tela do mês fechado as mostra
     como "mudou depois do fechamento" e "não entra no fechamento" (M8). */
  function gravadasDepois(os, dia, gravadoAte) {
    const corte = instante(gravadoAte);
    if (!os || typeof os !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(String(dia || '')) || !Number.isFinite(corte)) return [];
    const ate = String(dia), out = [];
    for (const it of lista(os.itens)) {
      if (!it || typeof it !== 'object') continue;
      for (const m of lista(it.entregas)) {
        const d = m && typeof m === 'object' ? motor().diaSP(m.dia) : '';
        if ((d && d > ate) || !gravadaDepois(m, corte)) continue;
        out.push({id:String(m.id ?? ''), uid:String(it.uid ?? ''), item:String(it.item ?? ''), tipo:String(m.tipo ?? ''), dia:d || '', em:String(m.em)});
      }
    }
    return out;
  }
  /* A VOLTA DO CARRO DE CADA VIAGEM (onda volta, 12/10/2026; D2 da revisão
     da onda fechamento e M11 da auditoria de 11/10/2026). A O.S. guardava UMA
     volta (retornoEm, retornoConf, equipe e veículo de hoje), e a apuração de
     novembro lia a volta de hoje: a segunda viagem em dezembro (ou só a troca
     da equipe da O.S.) mudava o recálculo de novembro fechado, Aprovar e
     Exportar davam 409 "A fonte mudou" e a revisão nova perdia a volta de
     novembro. Agora o servidor guarda cada viagem em `voltas` (uma por dia da
     volta: o dia, a equipe e o carro da viagem, a conferência da gestão
     daquela viagem, com a observação e as fotos, e a limpeza que a equipe
     registrou), e a entrega de cada período lê a viagem do dia dela. A O.S.
     sem `voltas` (antiga, com um retorno só) é lida pelos campos da O.S., como
     sempre. Cópia em _shared/pcp-conferencia-entrega.mjs (igual por teste,
     texto e sorteio). */
  const PERGUNTAS_VOLTA = ['carroLimpo', 'carroArrumado', 'equipamentosOk', 'semAvaria'];
  const textoV = v => String(v ?? '').trim();
  const normalV = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const respostaV = v => v === 'sim' || v === true ? 'sim' : (v === 'nao' || v === false ? 'nao' : '');
  const objV = x => !!x && typeof x === 'object' && !Array.isArray(x);
  const lancadaV = o => objV(o && o.entregaLancada) && o.entregaLancada.desfazer !== true ? o.entregaLancada : null;
  const diaOk = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
  const somarDiasV = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  /* O dia da volta: o do retorno; sem ele, o da saída (ou da agenda) quando há
     hora de retorno; depois o do lançamento e o da finalização. A mesma ordem
     de OPERACAO.diaDaVolta, no fuso de São Paulo em qualquer aparelho. */
  function diaDaVolta(o) {
    if (!objV(o)) return '';
    const d = motor().diaSP, l = lancadaV(o);
    return d(o.retornoEm) || (o.horaRetorno ? (d(o.saidaEm) || d(objV(o.instalacao) ? o.instalacao.data : '')) : '') || d(l ? l.data : '') || d(o.finalizadaEm);
  }
  /* O CARRO DA VOLTA PELO ID DO ATIVOS (item 16 da fila de 11/10/2026): com o
     id gravado na O.S., a chave é o id; sem ele, o nome, como sempre. Nomes
     parecidos (dois apelidos do mesmo carro) não se juntam aqui: só o id casa.
     REVISÃO DA ONDA VOLTA (D1): a O.S. programada antes do item 16 tem só o
     nome, e a nova tem nome e id: a mesma viagem virava duas voltas. Sem o id
     na O.S., o nome EXATO (sem os espaços das pontas) e ÚNICO na lista do
     Ativos (`ativos`: [{id, nome}]) dá o id, na leitura; nome repetido no
     Ativos ou fora dele continua pelo nome. A mesma régua de OPERACAO.idDoAtivo
     e do status (idDoAtivoSt). */
  function idDoAtivo(nome, ativos) {
    const n = textoV(nome);
    if (!n || !Array.isArray(ativos)) return '';
    const xs = ativos.filter(v => objV(v) && textoV(v.nome) === n);
    return xs.length === 1 ? textoV(xs[0].id) : '';
  }
  const chaveVeiculo = (x, ativos) => { const id = textoV(x && x.veiculoId) || idDoAtivo(x && x.veiculo, ativos); return id ? 'id:' + id : normalV(x && x.veiculo); };
  const semCarroV = x => normalV(x && x.veiculo) === 'instalacao interna';
  // A conferência da gestão, só o que a nota lê: as quatro respostas, quem conferiu e quando.
  function confDaVolta(rc) {
    if (!objV(rc)) return null;
    const r = Object.fromEntries(PERGUNTAS_VOLTA.map(k => [k, respostaV(rc[k])]));
    if (!PERGUNTAS_VOLTA.some(k => r[k])) return null;
    return {...r, por:textoV(rc.por).slice(0, 120), porId:textoV(rc.porId).slice(0, 120), em:textoV(rc.em).slice(0, 40)};
  }
  const fotosV = x => lista(x).filter(f => typeof f === 'string' && f).slice(0, 10);
  /* O QUE A VIAGEM GUARDA (revisão da onda volta, U2): a conferência com a
     observação e as fotos (a nota continua lendo só confDaVolta), e a limpeza
     que a equipe registrou para ela (U1). Assim a conferência da primeira
     viagem não some quando a O.S. ganha outra. */
  function confGuardada(rc) {
    const c = confDaVolta(rc);
    if (!c) return null;
    const porConta = textoV(rc.porConta).slice(0, 120);
    return {...c, ...(porConta ? {porConta} : {}), obs:textoV(rc.obs).slice(0, 300), fotos:fotosV(rc.fotos)};
  }
  function declaracaoGuardada(ve) {
    if (!objV(ve) || !PERGUNTAS_VOLTA.some(k => respostaV(ve[k]))) return null;
    const porConta = textoV(ve.porConta).slice(0, 120);
    return {...Object.fromEntries(PERGUNTAS_VOLTA.map(k => [k, respostaV(ve[k])])), obs:textoV(ve.obs).slice(0, 300), fotos:fotosV(ve.fotos).slice(0, 4),
      por:textoV(ve.por).slice(0, 120), porId:textoV(ve.porId).slice(0, 120), ...(porConta ? {porConta} : {}), em:textoV(ve.em).slice(0, 40)};
  }
  const registroDe = (o, dia) => Array.isArray(o && o.voltas) ? o.voltas.find(r => objV(r) && r.dia === dia) || null : null;
  /* A CONFERÊNCIA DA VIAGEM DE UM DIA. A carimbada com o dia vale só para a
     viagem daquele dia; a viagem guardada responde pela dela; a antiga, sem o
     dia, vale para a viagem de hoje quando o servidor ainda não guardou outra
     coisa para ela (legado se lê como era). A mesma régua de
     OPERACAO.confDaViagemDoDia (o celular não carrega este arquivo). */
  function daViagemDoDia(o, campo, dia) {
    if (!objV(o)) return null;
    const x = objV(o[campo]) ? o[campo] : null, dx = x ? textoV(x.dia) : '', hoje = diaDaVolta(o);
    // Sem o dia da viagem (a O.S. sem volta), vale só a antiga, sem o dia.
    if (!diaOk(dia)) return x && !dx && !hoje ? x : null;
    if (x && dx === dia) return x;
    const reg = registroDe(o, dia);
    if (reg) return objV(reg[campo]) ? reg[campo] : null;
    return x && !dx && (dia === hoje || !hoje) ? x : null;
  }
  const confDaViagemDoDia = (o, dia) => daViagemDoDia(o, 'retornoConf', dia);
  // A limpeza que a equipe registrou para a viagem de um dia (U1): a mesma régua.
  const declaracaoDaViagemDoDia = (o, dia) => daViagemDoDia(o, 'voltaEquipe', dia);
  /* A viagem de hoje, tirada dos campos da O.S. A conferência que o servidor
     carimbou com o dia de outra viagem não é desta; a antiga, sem o dia, vale
     para a viagem de hoje (legado se lê como era). O mesmo para a limpeza. */
  function registroDaVolta(o) {
    if (!objV(o) || o.tipo === 'interno') return null;
    const dia = diaDaVolta(o);
    if (!dia) return null;
    const rc = objV(o.retornoConf) ? o.retornoConf : null, ve = objV(o.voltaEquipe) ? o.voltaEquipe : null;
    const daqui = x => !!x && (!textoV(x.dia) || textoV(x.dia) === dia);
    const decl = daqui(ve) ? declaracaoGuardada(ve) : null;
    return {dia, equipe:[...new Set(lista(o.equipe).map(textoV).filter(Boolean))].slice(0, 30), veiculo:textoV(o.veiculo).slice(0, 80), veiculoId:textoV(o.veiculoId).slice(0, 80),
      retornoEm:textoV(o.retornoEm).slice(0, 40), horaRetorno:textoV(o.horaRetorno).slice(0, 10), retornoConf:daqui(rc) ? confGuardada(rc) : null, ...(decl ? {voltaEquipe:decl} : {})};
  }
  const viagemValida = r => objV(r) && diaOk(r.dia);
  // As viagens da O.S.: as guardadas pelo servidor; sem elas (O.S. antiga), a de hoje.
  function voltasDaOS(o) {
    if (objV(o) && Array.isArray(o.voltas)) return o.voltas.filter(viagemValida);
    const r = registroDaVolta(o);
    return r ? [r] : [];
  }
  /* A VIAGEM DE UMA ENTREGA (revisão da onda volta, D3 e U4). A entrega leva o
     dia do serviço (a finalização na obra); o casamento usa o DIA DA VOLTA:
     a viagem do mesmo dia; sem ela, a do dia seguinte (o serviço noturno que
     voltou depois da meia-noite); sem ela, a última viagem antes do dia, no
     mesmo mês (a gestão que finalizou dias depois do retorno). Nunca uma
     viagem de depois (a segunda viagem de dezembro não é a da entrega de
     novembro) nem de outro mês antes (a volta conta no mês da entrega, uma
     vez só). `aceita` filtra a viagem (a equipe, na entrega por item). */
  function viagemDoDia(vs, dia, aceita = () => true) {
    if (!diaOk(dia)) return null;
    const mesmo = vs.find(r => r.dia === dia && aceita(r));
    if (mesmo) return mesmo;
    const seguinte = somarDiasV(dia, 1), s = vs.find(r => r.dia === seguinte && aceita(r));
    if (s) return s;
    let ant = null;
    for (const r of vs) if (r.dia < dia && r.dia.slice(0, 7) === dia.slice(0, 7) && aceita(r) && (!ant || r.dia > ant.dia)) ant = r;
    return ant;
  }
  /* A entrega conferida por item: a viagem do dia (acima) com a equipe contida
     uma na outra (M11: quem a conferência pôs a mais, ou a menos, na entrega
     não descarta a volta). Equipes que só se cruzam são outra viagem. `chave`
     lê a pessoa (no servidor, o ID do RH; sem ela, o texto). */
  function voltaDaEntrega(o, dia, pessoas, chave) {
    const k = typeof chave === 'function' ? chave : textoV;
    const chaves = xs => new Set(lista(xs).map(p => textoV(k(p))).filter(Boolean));
    const ids = chaves(pessoas);
    if (!ids.size || !diaOk(dia)) return null;
    return viagemDoDia(voltasDaOS(o), dia, r => { const t = chaves(r.equipe); return t.size > 0 && ([...t].every(x => ids.has(x)) || [...ids].every(x => t.has(x))); });
  }
  /* A entrega inteira (sem conferência por item), D3: a viagem do dia da
     entrega da O.S. (o lançamento ou a finalização), pela mesma régua, e
     nunca a viagem de hoje: a segunda viagem de dezembro mudava a volta da
     O.S. entregue em novembro. A O.S. com uma viagem só lê essa (o legado e a
     régua da v167). Sem o dia, a de hoje. */
  function voltaDaOS(o, dia) {
    const vs = voltasDaOS(o);
    if (vs.length <= 1) return vs[0] || null;
    return viagemDoDia(vs, diaOk(dia) ? dia : diaDaVolta(o));
  }
  // A chave da viagem: dia + carro + equipe (pela pessoa), a mesma de OPERACAO.chaveDaVolta.
  function chaveDaViagem(r, chave, ativos) {
    const k = typeof chave === 'function' ? chave : textoV;
    return [textoV(r && r.dia), chaveVeiculo(r, ativos), [...new Set(lista(r && r.equipe).map(p => textoV(k(p))).filter(Boolean))].sort().join('+')].join('|');
  }
  /* A MESMA VIAGEM COM O DIA CORRIGIDO, OU UMA VIAGEM NOVA (revisão da onda
     volta, U2). O Lançar com a data do serviço (diferente da baixa do ERP) e a
     correção do dia do retorno pela gestão mudavam o dia da volta: a
     conferência (com a observação e as fotos) ficava na viagem do dia antigo e
     nascia uma viagem que não existiu. Regra: viagem nova só nasce de FATO
     NOVO, a volta registrada depois da anterior: o dia novo depois do dia da
     última viagem guardada, e a saída registrada depois do retorno dela (sem
     o retorno dela, num dia depois do dela), ou, sem saída, um retorno novo
     depois do dela. Qualquer outra troca do dia (o lançamento, a finalização,
     a agenda, o retorno corrigido com a mesma saída, venha da tela, do celular
     ou do ERP) é a MESMA viagem com o dia corrigido: a conferência, a
     observação, as fotos e a limpeza acompanham, e a correção fica no diário.
     A viagem de antes é a última guardada (a do maior dia); sem viagens
     guardadas, a de hoje da O.S. de antes. Devolve null quando o dia não
     mudou. */
  function ultimaViagem(o) {
    let u = null;
    for (const r of Array.isArray(o && o.voltas) ? o.voltas : []) if (viagemValida(r) && (!u || r.dia > u.dia)) u = r;
    return u;
  }
  function movimentoDaViagem(antes, depois) {
    if (!objV(antes) || !objV(depois)) return null;
    const ult = ultimaViagem(antes);
    const de = ult ? ult.dia : diaDaVolta(antes), para = diaDaVolta(depois);
    if (!de || !para || de === para) return null;
    /* A cópia velha de outra aba (verificação da correção, V1): o dia "para" já é
       de outra viagem guardada, ou anterior a ela. Não é correção da última
       viagem (que apagaria a viagem de dia maior e a conferência dela): a
       viagem guardada fica como está. */
    if (para < de && (Array.isArray(antes.voltas) ? antes.voltas : []).some(r => viagemValida(r) && r.dia !== de && r.dia >= para)) return null;
    const rOld = textoV(ult ? ult.retornoEm : antes.retornoEm), rNew = textoV(depois.retornoEm), sNew = textoV(depois.saidaEm);
    const tOld = Date.parse(rOld), tNew = Date.parse(rNew), tSai = Date.parse(sNew);
    const saiuDepois = Number.isFinite(tSai) && (Number.isFinite(tOld) ? tSai > tOld : motor().diaSP(sNew) > de);
    const voltouDepois = !Number.isFinite(tSai) && !!rNew && rNew !== rOld && Number.isFinite(tOld) && Number.isFinite(tNew) && tNew > tOld;
    return {de, para, nova:para > de && (saiuDepois || voltouDepois)};
  }
  return {catalogo, validar, validarRevisao, lidasParaSaldo, apurar, estado, noFimDoDia, gravadasDepois, PERGUNTAS_VOLTA, diaDaVolta, idDoAtivo, chaveVeiculo, semCarroV, confDaVolta, confGuardada, declaracaoGuardada, confDaViagemDoDia, declaracaoDaViagemDoDia, registroDaVolta, voltasDaOS, viagemDoDia, voltaDaEntrega, voltaDaOS, chaveDaViagem, ultimaViagem, movimentoDaViagem};
})();
