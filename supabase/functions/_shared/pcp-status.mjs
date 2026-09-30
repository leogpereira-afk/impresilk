/* STATUS DA ENTREGA EM 7 ESTADOS E CANCELAMENTO (F16, 30/09/2026): cópia do
   servidor. O aparelho mostra o selo com OPERACAO.statusEntrega (operacao.js);
   esta porta lê o mesmo status para tirar a O.S. cancelada da base da
   apuração (perfFonte) e guarda a marca de cancelamento da gestão
   (carimbarCancelamento). O bloco entre as marcas abaixo é o MESMO texto do
   operacao.js, byte a byte (tests/status-paridade.test.cjs compara o texto e
   os resultados). Mudou lá, muda aqui no mesmo commit, e pcp-sync e
   pcp-mubisys sobem juntos. */
import { ENTREGA_ITEM } from './pcp-entrega-item.mjs';
import { prazoCombinadoDe, ehIdPessoa, canon } from './pcp-integridade.mjs';
// O motor da entrega por item (E2): no servidor ele está sempre carregado.
const motorItem = () => ENTREGA_ITEM;
/* ==== STATUS DA ENTREGA: daqui até FIM DO STATUS, cópia byte a byte de _shared/pcp-status.mjs ==== */
/* O STATUS DA ENTREGA EM 7 ESTADOS (F16). Função pura: não lê tela e não
   grava nada. Precedência, do que mais pesa para o que menos pesa:
     Cancelado > Retrabalho > Retorno antecipado > Com atraso > No prazo >
     Em execução > Agendado
   O estado vem SEMPRE com o motivo, e `aplicaveis` traz todos os que valem,
   na mesma ordem: retrabalho entregue com atraso mostra Retrabalho e diz que
   também atrasou.
   - Cancelado: a baixa do ERP com status CANCELADO, ou a marca
     os.cancelamento da gestão. Cancela o saldo dos itens; o que já foi
     entregue por item fica. Item cancelado sozinho não cancela a O.S.
   - Retrabalho: a marca de retrabalho da O.S.
   - Retorno antecipado: SEM DADO até as ocorrências e os abonos (F17). Nunca
     é o estado nesta versão; o campo `retornoAntecipado` diz "sem dado".
   - Com atraso e No prazo: o prazo é o COMBINADO, congelado (F15: a primeira
     data agendada no PCP), até o último dia da duração. A data da entrega é
     a ÚLTIMA entrega por item, quando a O.S. tem marca, e senão a entrega
     lançada, a finalização ou a baixa do ERP (sem prova). A O.S. aberta com
     o prazo vencido também fica Com atraso, ainda sem entrega.
   - Em execução: a O.S. aberta com entrega parcial ("entrega parcial N de
     M"), item com problema de entrega, equipe na rua, equipe que voltou sem
     finalizar, ou no dia da agenda com equipe escalada.
   - Agendado: as outras abertas ("A agendar" quando nem data tem).
   `hoje` é 'AAAA-MM-DD' no calendário da fábrica; sem ele, o dia de hoje em
   São Paulo. `regra` é a versão da regra do programa (F05): aqui ela só diz
   quais estados são perda (`perdas`); a tolerância do retorno entra na F17.
   NÃO muda o status de agenda (OPERACAO.status), que o Painel copia. */
const ESTADOS_ENTREGA = Object.freeze(['cancelado', 'retrabalho', 'retorno_antecipado', 'atraso', 'no_prazo', 'execucao', 'agendado']);
const ROTULOS_ENTREGA = Object.freeze({cancelado:'Cancelado', retrabalho:'Retrabalho', retorno_antecipado:'Retorno antecipado',
  atraso:'Com atraso', no_prazo:'No prazo', execucao:'Em execução', agendado:'Agendado'});
// A perda da regra do programa (a lista PERDAS de regras.js) que cada estado mostra.
const PERDA_DO_ESTADO = Object.freeze({atraso:'atraso', retrabalho:'retrabalho', retorno_antecipado:'retornoAntecipado'});
const MOTIVO_CANCELAMENTO_MIN = 15;
const MOTIVO_CANCELAMENTO_MAX = 300;
const SEM_DADO_RETORNO = Object.freeze({situacao:'sem dado', motivo:'O retorno antecipado ainda não é medido: entra com as ocorrências e os abonos.'});
const txtSt = v => v == null ? '' : String(v).trim();
const objSt = v => !!v && typeof v === 'object' && !Array.isArray(v);
const letrasSt = v => Array.from(txtSt(v)).length;
function diaValidoSt(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return '';
  const d = new Date(v + 'T12:00:00Z');
  return Number.isFinite(+d) && d.toISOString().slice(0, 10) === v ? v : '';
}
/* O DIA NO FUSO DE SÃO PAULO, igual no aparelho e no servidor (UTC): a
   finalização às 23h30 de 29/09 na fábrica é 02h30 de 30/09 em UTC. Horário
   sem fuso já é o da fábrica. A mesma conta do diaSP do motor da entrega por
   item. */
function diaSt(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return diaValidoSt(v);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(v)) return diaValidoSt(v.slice(0, 10));
  }
  const d = v instanceof Date ? v : new Date(typeof v === 'number' ? v : String(v));
  if (!Number.isFinite(+d)) return '';
  try {
    const p = {};
    for (const x of new Intl.DateTimeFormat('en-US', {timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(d)) p[x.type] = x.value;
    return diaValidoSt(`${p.year}-${p.month}-${p.day}`);
  } catch (e) {
    // Sem a tabela de fusos: São Paulo não tem horário de verão desde 2019.
    return new Date(+d - 3 * 3600000).toISOString().slice(0, 10);
  }
}
const somarDiasSt = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const diasEntreSt = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const ddmmSt = d => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '';
const diasTxtSt = n => n === 1 ? '1 dia' : `${n} dias`;
const duracaoSt = o => o.tipo === 'interno' ? 1 : Math.min(366, Math.max(1, Math.floor(Number(o.instalacao && o.instalacao.duracaoDias) || 1)));
// Baixa da máquina do ERP: a mesma régua de OPERACAO.encerradaERP e do motor da entrega por item.
function encerradaNoERPSt(o) {
  if (!o || !o.finalizadaEm) return false;
  return !!((o.baixaAutoERP && o.baixaAutoERP.em === o.finalizadaEm) || /^Mubisys\b/i.test(txtSt(o.finalizadoPor)));
}
/* O CANCELAMENTO DA O.S., ou null. No ERP: a baixa automática com status
   CANCELADO (a mesma régua do canceladaNoERP do motor da entrega por item).
   À mão: a marca
   os.cancelamento que o servidor gravou ({ativo:true, motivo, por, porId,
   em}) ou o pedido que o aparelho ainda vai mandar ({cancelar:true, motivo},
   `pendente`). O desfeito ({ativo:false, desfeitoEm}), o pedido de desfazer
   e a marca sem motivo não valem (o canceladaAMao do motor, a mesma). */
function cancelamentoDe(o) {
  if (!objSt(o)) return null;
  if (encerradaNoERPSt(o) && /cancel/i.test(`${txtSt(o.baixaAutoERP && o.baixaAutoERP.status)} ${txtSt(o.finalizadoPor)}`))
    return {origem:'erp', motivo:'cancelada no ERP', por:'ERP', porId:'', em:txtSt(o.finalizadaEm), pendente:false};
  const c = o.cancelamento;
  if (!objSt(c) || !txtSt(c.motivo) || !(c.ativo === true || c.cancelar === true)) return null;
  return {origem:'manual', motivo:txtSt(c.motivo), por:txtSt(c.por), porId:txtSt(c.porId), em:txtSt(c.em), pendente:c.ativo !== true};
}
const cancelada = o => !!cancelamentoDe(o);
// O motivo do "Cancelar O.S.": '' quando serve; senão a frase, igual na tela e na porta.
function motivoCancelamentoInvalido(motivo) {
  const n = letrasSt(motivo);
  if (n < MOTIVO_CANCELAMENTO_MIN) return `Escreva o motivo do cancelamento com ${MOTIVO_CANCELAMENTO_MIN} letras ou mais.`;
  if (n > MOTIVO_CANCELAMENTO_MAX) return `O motivo do cancelamento vai até ${MOTIVO_CANCELAMENTO_MAX} letras.`;
  return '';
}
/* O PRAZO DA ENTREGA: o combinado (F15, congelado) é o primeiro dia, e a O.S.
   de vários dias tem até o último dia da duração (a duração de agora: o prazo
   congelado guarda só o dia). Cliente retira: o próprio dia. Sem prazo
   combinado: null, e não há atraso a medir. */
function prazoDaEntrega(o) {
  if (!objSt(o)) return null;
  const pc = prazoCombinadoDe(o);
  const inicio = pc ? diaValidoSt(txtSt(pc.data)) : '';
  if (!inicio) return null;
  const dias = duracaoSt(o);
  return {inicio, fim:somarDiasSt(inicio, dias - 1), dias, fonte:txtSt(pc.fonte)};
}
const prazoTxtSt = p => p.dias > 1 ? `${ddmmSt(p.inicio)} a ${ddmmSt(p.fim)}` : ddmmSt(p.fim);
// Os dias da agenda de agora (a data da instalação e a duração); cliente retira não tem.
function diasAgendaSt(o) {
  const d = o.tipo === 'interno' ? '' : diaValidoSt(txtSt(o.instalacao && o.instalacao.data).slice(0, 10));
  return d ? Array.from({length:duracaoSt(o)}, (_, i) => somarDiasSt(d, i)) : [];
}
/* A ENTREGA DA O.S.: {dia, fonte, semProva} ou null (não entregue).
   Com marca por item: a ÚLTIMA entrega por item, marcada ou implícita,
   quando nenhum item físico ficou a entregar, ou quando a O.S. foi encerrada
   (o item que ficou sem entrega na baixa do ERP que não disse entregue
   conta no dia da baixa, sem prova). Sem marca: a entrega lançada à mão, a
   finalização no PCP ou a baixa do ERP (sem prova). Cancelada: só o que já
   foi entregue por item. */
function entregaDaOS(o, M, r, canc) {
  const fim = o.finalizadaEm ? diaSt(o.finalizadaEm) : '';
  const erp = encerradaNoERPSt(o);
  if (r && r.marcas > 0) {
    const L = M.lancamentosDaOS(o);
    const linhas = L.lancamentos.filter(x => x.tipo !== 'servico' && diaValidoSt(x.dia));
    const ultimo = linhas.reduce((m, x) => x.dia > m ? x.dia : m, '');
    const semProva = linhas.some(x => x.marca === 'sem prova');
    if (canc) return ultimo ? {dia:ultimo, fonte:'itens', semProva} : null;
    const pendente = r.aEntregar + r.parciais + r.problema > 0;
    if (fim) return pendente ? {dia:fim > ultimo ? fim : ultimo, fonte:'itens', semProva:semProva || erp} : {dia:ultimo || fim, fonte:'itens', semProva};
    return !pendente && ultimo ? {dia:ultimo, fonte:'itens', semProva} : null;
  }
  if (canc || !fim) return null;
  const l = o.entregaLancada;
  const lancada = diaSt(l && typeof l === 'object' ? l.data : l);
  if (lancada) return {dia:lancada, fonte:'lancada', semProva:false};
  return erp ? {dia:fim, fonte:'erp', semProva:true} : {dia:fim, fonte:'finalizada', semProva:false};
}
const FONTE_TXT_ST = Object.freeze({itens:'última entrega por item', lancada:'lançada à mão', finalizada:'finalizada no PCP', erp:'baixa do ERP, sem prova'});
/* A ENTREGA PARCIAL da O.S. aberta, a mesma conta do selo do card (E4): itens
   entregues de itens que valem (o cancelado não conta), ou unidades quando é
   um item só ("6 de 10"). Parte entregue só de item cancelado depois não é
   entrega parcial. Item com problema entra no motivo. */
function parcialDe(o, M, r) {
  if (!r || !r.marcas || o.finalizadaEm) return null;
  const itens = (Array.isArray(o.itens) ? o.itens : []).filter(it => objSt(it) && !M.ehServico(it));
  const vivos = itens.map(it => ({it, s:M.situacaoItem(it, o)})).filter(x => x.s.situacao !== 'cancelado');
  const unidades = vivos.reduce((t, x) => t + (x.s.entregue || 0), 0);
  const total = r.itensTotal - r.cancelados;
  const partes = [];
  if (r.situacao === 'parcial' && unidades > 0) {
    if (total === 1 && vivos.length === 1) partes.push(`entrega parcial ${vivos[0].s.entregue} de ${vivos[0].s.qtde}`);
    else partes.push(`entrega parcial ${r.entregues} de ${total}${r.parciais ? ` (${r.parciais} ${r.parciais === 1 ? 'item' : 'itens'} em parte)` : ''}`);
  }
  if (r.problema) partes.push(`${r.problema} ${r.problema === 1 ? 'item' : 'itens'} com problema de entrega`);
  return partes.length ? {entregues:r.entregues, total, parciais:r.parciais, problema:r.problema, unidades, texto:partes.join('; ')} : null;
}
function motivoExecucaoSt(o, hoje, parcial, prazo) {
  const partes = [];
  if (parcial) partes.push(parcial.texto);
  if ((o.horaSaida || o.saidaEm) && !(o.horaRetorno || o.retornoEm)) partes.push('saída registrada, sem retorno');
  else if (o.horaRetorno || o.retornoEm) partes.push('a equipe voltou; falta finalizar');
  // O dia da agenda só é execução com gente escalada: a data sozinha não põe ninguém na rua.
  else if (prazo && diasAgendaSt(o).includes(hoje) && (Array.isArray(o.equipe) ? o.equipe : []).some(x => txtSt(x))) partes.push('no dia da agenda');
  return partes.join('; ');
}
function motivoAgendadoSt(o, prazo) {
  const interno = o.tipo === 'interno';
  if (!prazo) {
    const prev = diaSt(o.previsaoEntrega);
    return (interno ? 'sem data de retirada' : 'sem data na agenda do PCP') + (prev ? ` (previsão do ERP ${ddmmSt(prev)})` : '');
  }
  const atual = interno ? diaValidoSt(txtSt(o.instalacao && o.instalacao.data).slice(0, 10)) : diasAgendaSt(o)[0] || '';
  if (!atual) return `sem data na agenda agora (prazo combinado ${prazoTxtSt(prazo)})`;
  const quando = atual !== prazo.inicio ? `${ddmmSt(atual)} (prazo combinado ${prazoTxtSt(prazo)})` : prazoTxtSt(prazo);
  return (interno ? 'retirada marcada para ' : 'agendada para ') + quando;
}
function statusEntrega(o, hoje, regra) {
  const os = objSt(o) ? o : {};
  const dHoje = diaValidoSt(txtSt(hoje)) || diaSt(Date.now());
  const M = motorItem();
  const temMarca = (Array.isArray(os.itens) ? os.itens : []).some(it => objSt(it) && Array.isArray(it.entregas) && it.entregas.length > 0);
  const r = M && temMarca ? M.resumoOS(os) : null;
  const canc = cancelamentoDe(os);
  const prazo = prazoDaEntrega(os);
  const entrega = entregaDaOS(os, M, r, canc);
  const parcial = !canc && !entrega ? parcialDe(os, M, r) : null;
  const aplicaveis = [];
  const poe = (estado, motivo) => { aplicaveis.push({estado, rotulo:ROTULOS_ENTREGA[estado], motivo}); };
  let diasAtraso = 0;
  if (canc) {
    const foi = entrega ? '; o que já foi entregue fica' : '';
    poe('cancelado', canc.origem === 'erp' ? `cancelada no ERP (baixa de ${ddmmSt(diaSt(canc.em))})${foi}`
      : `cancelada${canc.por ? ' por ' + canc.por : ''}${diaSt(canc.em) ? ' em ' + ddmmSt(diaSt(canc.em)) : ''}: ${canc.motivo}${canc.pendente ? ' (a enviar)' : ''}${foi}`);
  }
  if (os.retrabalho) {
    const prob = Array.from(txtSt(os.problema)).slice(0, 120).join('');
    poe('retrabalho', `retrabalho marcado${prob ? ': ' + prob : ''}${diaSt(os.dataResolvido) ? ` (resolvido em ${ddmmSt(diaSt(os.dataResolvido))})` : ''}`);
  }
  if (!canc && entrega) {
    const como = `${os.tipo === 'interno' ? 'retirada' : 'entregue'} em ${ddmmSt(entrega.dia)} (${FONTE_TXT_ST[entrega.fonte]})`;
    if (prazo && entrega.dia > prazo.fim) {
      diasAtraso = diasEntreSt(prazo.fim, entrega.dia);
      poe('atraso', `${como}, ${diasTxtSt(diasAtraso)} depois do prazo (${prazoTxtSt(prazo)})`);
    } else poe('no_prazo', prazo ? `${como}, dentro do prazo (${prazoTxtSt(prazo)})` : `${como}; sem prazo combinado no PCP, não há atraso a medir`);
  } else if (!canc) {
    if (prazo && dHoje > prazo.fim) {
      diasAtraso = diasEntreSt(prazo.fim, dHoje);
      poe('atraso', `prazo (${prazoTxtSt(prazo)}) vencido há ${diasTxtSt(diasAtraso)}, sem entrega registrada`);
    }
    const exec = motivoExecucaoSt(os, dHoje, parcial, prazo);
    if (exec) poe('execucao', exec);
    else if (!diasAtraso) poe('agendado', motivoAgendadoSt(os, prazo));
  }
  aplicaveis.sort((a, b) => ESTADOS_ENTREGA.indexOf(a.estado) - ESTADOS_ENTREGA.indexOf(b.estado));
  // Sem data nenhuma, o "Agendado" diz "A agendar" (no selo e na lista).
  if (!prazo) for (const a of aplicaveis) if (a.estado === 'agendado') a.rotulo = 'A agendar';
  const p = aplicaveis[0];
  const perdasRegra = objSt(regra) && Array.isArray(regra.perdas) ? regra.perdas : [];
  // Atraso só é perda da O.S. entregue: a aberta ainda pode ser abonada ou cancelada.
  const perdas = aplicaveis.filter(a => PERDA_DO_ESTADO[a.estado] && perdasRegra.includes(PERDA_DO_ESTADO[a.estado]) && (a.estado !== 'atraso' || !!entrega))
    .map(a => PERDA_DO_ESTADO[a.estado]);
  return {
    estado:p.estado, rotulo:p.rotulo, motivo:p.motivo, aplicaveis,
    entregue:!!entrega, dataEntrega:entrega ? entrega.dia : '', fonteEntrega:entrega ? entrega.fonte : '', semProva:!!(entrega && entrega.semProva),
    prazo:prazo ? prazo.fim : '', prazoInicio:prazo ? prazo.inicio : '', prazoFonte:prazo ? prazo.fonte : '', diasAtraso,
    parcial, cancelamento:canc, retornoAntecipado:{...SEM_DADO_RETORNO}, perdas,
    // O.S. com marca por item e sem o motor carregado (versões misturadas): a data e a parcial não leem os itens.
    semMotor:temMarca && !M,
  };
}
/* ==== FIM DO STATUS ==== */
export const STATUS_ENTREGA = { ESTADOS_ENTREGA, ROTULOS_ENTREGA, MOTIVO_CANCELAMENTO_MIN, MOTIVO_CANCELAMENTO_MAX, motivoCancelamentoInvalido, cancelamentoDe, cancelada, prazoDaEntrega, statusEntrega };
export { ESTADOS_ENTREGA, ROTULOS_ENTREGA, MOTIVO_CANCELAMENTO_MIN, MOTIVO_CANCELAMENTO_MAX, motivoCancelamentoInvalido, cancelamentoDe, cancelada, prazoDaEntrega, statusEntrega };

/* ── Só do servidor, fora do bloco copiado ─────────────────────────────── */
/* GRAVAR O CANCELAMENTO À MÃO (F16). Roda depois do preservarAusentes, que
   já deixou em os.cancelamento o que estava gravado. `veio` é o que o
   aparelho mandou (undefined = não mandou). Protegido como os campos da
   gestão (F01):
   - só PEDIDO muda o campo: { cancelar: true, motivo } ou { desfazer: true }.
     Qualquer outro valor (a cópia que a aba antiga devolve, null, '', a
     marca forjada { ativo: true, ... }) fica com o gravado, sem aviso: a aba
     antiga não apaga e o aparelho não forja;
   - só admin e pcp (`pode`); para os outros fica o gravado, e quem tem senha
     ouve o porquê (`avisar`). Nunca 422: um 422 prende a fila do aparelho;
   - cancelar pede motivo de 15 letras ou mais (motivoCancelamentoInvalido, a
     mesma frase da tela). O carimbo (por, porConta, porId, em) é do crachá e
     do servidor; o que o aparelho escreveu nesses campos não entra;
   - cancelar de novo a O.S. já cancelada não troca o carimbo (a fila manda o
     mesmo pedido de novo). Desfazer guarda a marca, com o carimbo de quem
     desfez (desfeitoPor, desfeitoPorConta, desfeitoPorId, desfeitoEm): o
     histórico não some. Desfazer o que não está cancelado não muda nada.
   Devolve { os, avisos }. */
const pedidoCancelar = v => objSt(v) && v.cancelar === true;
const pedidoDesfazer = v => objSt(v) && v.desfazer === true;
export function carimbarCancelamento(veio, os, antes, autor, agora, { pode = false, avisar = false } = {}) {
  const r = { ...os }, avisos = [];
  if (!pedidoCancelar(veio) && !pedidoDesfazer(veio)) return { os: r, avisos };
  const gravado = objSt(antes?.cancelamento) ? antes.cancelamento : null;
  const ativo = !!(gravado && gravado.ativo === true && txtSt(gravado.motivo));
  const quem = { por: String(autor?.nome ?? '').slice(0, 120), porConta: String(autor?.login ?? '').slice(0, 120), porId: ehIdPessoa(autor?.porId) ? String(autor.porId).trim() : '' };
  if (!pode) {
    if (avisar) avisos.push(pedidoCancelar(veio)
      ? 'A O.S. não foi cancelada: só a gestão do PCP (admin ou pcp) cancela a O.S.'
      : 'O cancelamento da O.S. não foi desfeito: só a gestão do PCP (admin ou pcp) desfaz.');
    return { os: r, avisos };
  }
  if (pedidoCancelar(veio)) {
    if (ativo) return { os: r, avisos };
    const erro = motivoCancelamentoInvalido(veio.motivo);
    if (erro) { avisos.push('A O.S. não foi cancelada: ' + erro.charAt(0).toLowerCase() + erro.slice(1)); return { os: r, avisos }; }
    r.cancelamento = { ativo: true, motivo: txtSt(veio.motivo), ...quem, em: String(agora ?? '') };
    return { os: r, avisos };
  }
  if (!ativo) return { os: r, avisos };
  r.cancelamento = { ...gravado, ativo: false, desfeitoPor: quem.por, desfeitoPorConta: quem.porConta, desfeitoPorId: quem.porId, desfeitoEm: String(agora ?? '') };
  return { os: r, avisos };
}
// O pedido mudou o gravado? (para ler o autor do RH só quando precisa)
export const cancelamentoMudou = (antes, depois) => canon(antes ?? null) !== canon(depois ?? null);
