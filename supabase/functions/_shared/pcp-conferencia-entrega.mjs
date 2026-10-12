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
  function validar(os, entregas, hoje = '') {
    if (!Array.isArray(entregas) || entregas.length > 100) return 'Limite de 100 entregas por O.S.';
    const itens = catalogo(os), por = new Map(itens.map(i => [i.chave, i])), usados = new Map(), ids = new Set();
    for (const e of entregas) {
      if (!e || !/^[a-zA-Z0-9_-]{1,80}$/.test(e.id || '') || ids.has(e.id)) return 'Código de entrega inválido ou repetido.';
      ids.add(e.id);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e.dia || '') || !Number.isFinite(Date.parse(e.dia + 'T12:00:00Z')) || new Date(e.dia + 'T12:00:00Z').toISOString().slice(0,10) !== e.dia || e.dia < '2020-01-01' || (hoje && e.dia > hoje)) return 'Informe uma data de entrega válida, até hoje.';
      if (!Array.isArray(e.itens) || !e.itens.length || e.itens.length > itens.length) return 'Selecione ao menos um item entregue.';
      const vistos = new Set();
      for (const p of e.itens) {
        const it = por.get(p?.chave);
        if (!it || it.ambiguo || it.identidade !== p.identidade) return 'Um item mudou ou não pode ser identificado. Atualize a O.S. e confira a seleção.';
        if (it.cancelado) return 'Item cancelado não pode entrar na entrega.';
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
     devolve a própria O.S. */
  function noFimDoDia(os, dia) {
    if (!os || typeof os !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(String(dia || ''))) return os;
    const ate = String(dia), depois = v => { const d = motor().diaSP(v); return !!d && d > ate; };
    const out = {...os, conferenciasEntrega:lista(os.conferenciasEntrega).filter(e => !(e && String(e.dia || '') > ate))};
    if (Array.isArray(os.itens)) out.itens = os.itens.map(it => it && typeof it === 'object' && Array.isArray(it.entregas) ? {...it, entregas:it.entregas.filter(m => !(m && depois(m.dia)))} : it);
    if (depois(os.finalizadaEm)) for (const k of ['finalizadaEm', 'finalizadoPor', 'baixaAutoERP', 'finalizadaPorCampo']) delete out[k];
    const l = os.entregaLancada;
    if (depois(l && typeof l === 'object' ? l.data : l)) delete out.entregaLancada;
    if (os.cancelamento && typeof os.cancelamento === 'object' && depois(os.cancelamento.em)) delete out.cancelamento;
    return out;
  }
  /* A VOLTA DO CARRO DE CADA VIAGEM (onda volta, 12/10/2026; D2 da revisão
     da onda fechamento e M11 da auditoria de 11/10/2026). A O.S. guardava UMA
     volta (retornoEm, retornoConf, equipe e veículo de hoje), e a apuração de
     novembro lia a volta de hoje: a segunda viagem em dezembro (ou só a troca
     da equipe da O.S.) mudava o recálculo de novembro fechado, Aprovar e
     Exportar davam 409 "A fonte mudou" e a revisão nova perdia a volta de
     novembro. Agora o servidor guarda cada viagem em `voltas` (uma por dia da
     volta: o dia, a equipe e o carro como estavam no fim daquele dia e a
     conferência da gestão daquela viagem), e a entrega de cada período lê a
     viagem do dia dela. A O.S. sem `voltas` (antiga, com um retorno só) é
     lida pelos campos da O.S., como sempre. Cópia em
     _shared/pcp-conferencia-entrega.mjs (igual por teste, texto e sorteio). */
  const PERGUNTAS_VOLTA = ['carroLimpo', 'carroArrumado', 'equipamentosOk', 'semAvaria'];
  const textoV = v => String(v ?? '').trim();
  const normalV = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const respostaV = v => v === 'sim' || v === true ? 'sim' : (v === 'nao' || v === false ? 'nao' : '');
  const objV = x => !!x && typeof x === 'object' && !Array.isArray(x);
  const lancadaV = o => objV(o && o.entregaLancada) && o.entregaLancada.desfazer !== true ? o.entregaLancada : null;
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
     parecidos (dois apelidos do mesmo carro) não se juntam aqui: só o id casa. */
  const chaveVeiculo = x => textoV(x && x.veiculoId) ? 'id:' + textoV(x.veiculoId) : normalV(x && x.veiculo);
  const semCarroV = x => normalV(x && x.veiculo) === 'instalacao interna';
  // A conferência da gestão, só o que a nota lê: as quatro respostas, quem conferiu e quando.
  function confDaVolta(rc) {
    if (!objV(rc)) return null;
    const r = Object.fromEntries(PERGUNTAS_VOLTA.map(k => [k, respostaV(rc[k])]));
    if (!PERGUNTAS_VOLTA.some(k => r[k])) return null;
    return {...r, por:textoV(rc.por).slice(0, 120), porId:textoV(rc.porId).slice(0, 120), em:textoV(rc.em).slice(0, 40)};
  }
  /* A viagem de hoje, tirada dos campos da O.S. A conferência que o servidor
     carimbou com o dia de outra viagem não é desta; a antiga, sem o dia, vale
     para a viagem de hoje (legado se lê como era). */
  function registroDaVolta(o) {
    if (!objV(o) || o.tipo === 'interno') return null;
    const dia = diaDaVolta(o);
    if (!dia) return null;
    const rc = objV(o.retornoConf) ? o.retornoConf : null;
    return {dia, equipe:[...new Set(lista(o.equipe).map(textoV).filter(Boolean))].slice(0, 30), veiculo:textoV(o.veiculo).slice(0, 80), veiculoId:textoV(o.veiculoId).slice(0, 80),
      retornoEm:textoV(o.retornoEm).slice(0, 40), horaRetorno:textoV(o.horaRetorno).slice(0, 10), retornoConf:rc && (!textoV(rc.dia) || textoV(rc.dia) === dia) ? confDaVolta(rc) : null};
  }
  const viagemValida = r => objV(r) && /^\d{4}-\d{2}-\d{2}$/.test(String(r.dia || ''));
  // As viagens da O.S.: as guardadas pelo servidor; sem elas (O.S. antiga), a de hoje.
  function voltasDaOS(o) {
    if (objV(o) && Array.isArray(o.voltas)) return o.voltas.filter(viagemValida);
    const r = registroDaVolta(o);
    return r ? [r] : [];
  }
  // A viagem da entrega inteira (sem conferência por item): a do dia da volta de hoje.
  function voltaDaOS(o) {
    const dia = diaDaVolta(o);
    if (!dia) return null;
    if (objV(o) && Array.isArray(o.voltas)) { const r = o.voltas.filter(viagemValida).find(x => x.dia === dia); if (r) return r; }
    return registroDaVolta(o);
  }
  /* A viagem de uma entrega conferida por item: a do mesmo dia, com a equipe
     contida uma na outra (M11: quem a conferência pôs a mais, ou a menos, na
     entrega não descarta a volta). Equipes que só se cruzam são outra viagem.
     `chave` lê a pessoa (no servidor, o ID do RH; sem ela, o texto). */
  function voltaDaEntrega(o, dia, pessoas, chave) {
    const k = typeof chave === 'function' ? chave : textoV;
    const chaves = xs => new Set(lista(xs).map(p => textoV(k(p))).filter(Boolean));
    const ids = chaves(pessoas);
    if (!ids.size || !dia) return null;
    for (const r of voltasDaOS(o)) {
      if (r.dia !== dia) continue;
      const t = chaves(r.equipe);
      if (t.size && ([...t].every(x => ids.has(x)) || [...ids].every(x => t.has(x)))) return r;
    }
    return null;
  }
  // A chave da viagem: dia + carro + equipe (pela pessoa), a mesma de OPERACAO.chaveDaVolta.
  function chaveDaViagem(r, chave) {
    const k = typeof chave === 'function' ? chave : textoV;
    return [textoV(r && r.dia), chaveVeiculo(r), [...new Set(lista(r && r.equipe).map(p => textoV(k(p))).filter(Boolean))].sort().join('+')].join('|');
  }
  return {catalogo, validar, apurar, estado, noFimDoDia, PERGUNTAS_VOLTA, diaDaVolta, chaveVeiculo, semCarroV, confDaVolta, registroDaVolta, voltasDaOS, voltaDaOS, voltaDaEntrega, chaveDaViagem};
})();

