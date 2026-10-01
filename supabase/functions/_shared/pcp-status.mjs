/* STATUS DA ENTREGA EM 7 ESTADOS E CANCELAMENTO (F16, 30/09/2026): cópia do
   servidor. O aparelho mostra o selo com OPERACAO.statusEntrega (operacao.js);
   esta porta lê o mesmo status para tirar a O.S. cancelada da base da
   apuração (perfFonte) e guarda a marca de cancelamento da gestão
   (carimbarCancelamento). O bloco entre as marcas abaixo é o MESMO texto do
   operacao.js, byte a byte (tests/status-paridade.test.cjs compara o texto e
   os resultados). Mudou lá, muda aqui no mesmo commit, e pcp-sync e
   pcp-mubisys sobem juntos. */
import { ENTREGA_ITEM } from './pcp-entrega-item.mjs';
import { prazoCombinadoDe, retornosPrevistos, ehIdPessoa, canon } from './pcp-integridade.mjs';
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
   - Retrabalho: a marca de retrabalho da O.S., venha de onde vier (F17: zera
     na hora; só desmarcar é da gestão). Retrabalho não se abona.
   - Retorno antecipado (F17): a chegada conferida pela gestão antes do
     retorno previsto da volta, além da tolerância da regra (retornoAntecipado,
     abaixo). O abonado aparece como "Retorno antecipado (abonado)", com o
     motivo, e não é perda.
   - Com atraso e No prazo: o prazo é o COMBINADO, congelado (F15: a primeira
     data agendada no PCP), até o último dia da duração. A data da entrega é
     a ÚLTIMA entrega por item, quando a O.S. tem marca, e senão a entrega
     lançada, a finalização ou a baixa do ERP (sem prova). A O.S. aberta com
     o prazo vencido também fica Com atraso, ainda sem entrega.
   - Em execução: a O.S. aberta com entrega parcial ("entrega parcial N de
     M"), item com problema de entrega, equipe na rua, equipe que voltou sem
     finalizar, ou no dia da agenda com equipe escalada.
   - Agendado: as outras abertas ("A agendar" quando nem data tem).
   - Entregue, SEM MEDIDA DE PRAZO (revisão da F16): a entregue que não tem
     como ser julgada fica neutra, nunca "No prazo" e nunca perda. Sem prazo
     combinado: "Entregue, sem prazo combinado". A baixa do ERP ainda sem
     lançamento, depois do corte: "Entregue (baixa do ERP a lançar)", porque a
     data da baixa é a da sincronização e a data real vem no lançamento. A
     baixa que não diz o dia da entrega (fora da carteira, antes do corte ou
     na retirada): "Entregue (baixa do ERP, sem data)".
   - ABONADO (F17): o atraso abonado (a remarcação pedida pelo cliente) vira
     "Com atraso (abonado)" e o retorno antecipado abonado, "Retorno
     antecipado (abonado)". Os dois trazem o motivo do abono, vêm depois das
     perdas que valem e antes do "No prazo", e nunca são perda.
   `hoje` é 'AAAA-MM-DD' no calendário da fábrica; sem ele, o dia de hoje em
   São Paulo. `regra` é a versão da regra do programa (F05): diz quais estados
   são perda (`perdas`) e a tolerância do retorno (toleranciaRetornoMin).
   `volta` (F17) é a lista das O.S. da mesma volta (voltaDoRetorno): o
   retorno antecipado é medido pela volta; sem ela, pela O.S. sozinha.
   NÃO muda o status de agenda (OPERACAO.status), que o Painel copia. */
const ESTADOS_ENTREGA = Object.freeze(['cancelado', 'retrabalho', 'retorno_antecipado', 'atraso', 'no_prazo', 'entregue', 'execucao', 'agendado']);
const ROTULOS_ENTREGA = Object.freeze({cancelado:'Cancelado', retrabalho:'Retrabalho', retorno_antecipado:'Retorno antecipado',
  atraso:'Com atraso', no_prazo:'No prazo', entregue:'Entregue', execucao:'Em execução', agendado:'Agendado'});
// Os rótulos do "Entregue" neutro, um por motivo de não haver medida.
const ROTULO_SEM_PRAZO_ST = 'Entregue, sem prazo combinado';
const ROTULO_A_LANCAR_ST = 'Entregue (baixa do ERP a lançar)';
const ROTULO_ERP_SEM_DATA_ST = 'Entregue (baixa do ERP, sem data)';
/* O CORTE DO LANÇAMENTO MANUAL (decisão do dono, 14/09/2026): a baixa do ERP
   anterior a este dia conta como entregue sem lançamento; a partir dele, a
   data real da entrega vem do lançamento à mão. O mesmo dia do casa.js e do
   pcp-sync (tests/cancelamento-f16.test.cjs confere). */
const CORTE_LANCAMENTO_ST = '2026-09-15';
// A perda da regra do programa (a lista PERDAS de regras.js) que cada estado mostra.
const PERDA_DO_ESTADO = Object.freeze({atraso:'atraso', retrabalho:'retrabalho', retorno_antecipado:'retornoAntecipado'});
const MOTIVO_CANCELAMENTO_MIN = 15;
const MOTIVO_CANCELAMENTO_MAX = 300;
const txtSt = v => v == null ? '' : String(v).trim();
const objSt = v => !!v && typeof v === 'object' && !Array.isArray(v);
/* O MOTIVO É TEXTO, e as letras contam sem os caracteres invisíveis (largura
   zero, controle, marca de direção): quinze espaços de largura zero não
   dizem motivo nenhum, e um objeto não é motivo (revisão da F16). */
const INVISIVEIS_ST = /[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g;
const letrasMotivoSt = v => typeof v === 'string' ? Array.from(v.replace(INVISIVEIS_ST, '').trim()).length : 0;
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
  const n = letrasMotivoSt(motivo);
  if (n < MOTIVO_CANCELAMENTO_MIN) return `Escreva o motivo do cancelamento com ${MOTIVO_CANCELAMENTO_MIN} letras ou mais.`;
  if (n > MOTIVO_CANCELAMENTO_MAX) return `O motivo do cancelamento vai até ${MOTIVO_CANCELAMENTO_MAX} letras.`;
  return '';
}
/* O PRAZO DA ENTREGA: o combinado (F15, congelado) é o primeiro dia, e a O.S.
   de vários dias tem até o último dia da duração. A duração é a CONGELADA
   junto com a data (prazoCombinado.dias, revisão da F16): mudar a duração
   depois não move o prazo. O carimbo antigo, sem os dias, e o prazo lido do
   histórico usam a duração de agora. Cliente retira: o próprio dia. Sem
   prazo combinado: null, e não há atraso a medir. */
function diasCongeladosSt(o, pc) {
  const d = pc && !pc.derivado && objSt(o.prazoCombinado) ? o.prazoCombinado.dias : undefined;
  return typeof d === 'number' && Number.isInteger(d) && d >= 1 && d <= 366 ? d : 0;
}
function prazoDaEntrega(o) {
  if (!objSt(o)) return null;
  const pc = prazoCombinadoDe(o);
  const inicio = pc ? diaValidoSt(txtSt(pc.data)) : '';
  if (!inicio) return null;
  const dias = o.tipo === 'interno' ? 1 : diasCongeladosSt(o, pc) || duracaoSt(o);
  return {inicio, fim:somarDiasSt(inicio, dias - 1), dias, fonte:txtSt(pc.fonte)};
}
const prazoTxtSt = p => p.dias > 1 ? `${ddmmSt(p.inicio)} a ${ddmmSt(p.fim)}` : ddmmSt(p.fim);
// Os dias da agenda de agora (a data da instalação e a duração); cliente retira não tem.
function diasAgendaSt(o) {
  const d = o.tipo === 'interno' ? '' : diaValidoSt(txtSt(o.instalacao && o.instalacao.data).slice(0, 10));
  return d ? Array.from({length:duracaoSt(o)}, (_, i) => somarDiasSt(d, i)) : [];
}
/* O ERP DISSE ENTREGUE? A mesma régua do erpDisseEntregue do motor da
   entrega por item: a baixa da conciliação da carteira ("fora da carteira")
   e a de CONCLUIDO ou FINALIZADO não dizem o dia da entrega. */
function erpDisseEntregueSt(o) {
  if (!encerradaNoERPSt(o)) return false;
  const b = objSt(o.baixaAutoERP) && o.baixaAutoERP.em === o.finalizadaEm ? o.baixaAutoERP : null;
  if (b && b.carteira) return false;
  const m = /\(baixa autom[aá]tica\s*\S\s*([^)]*)\)\s*$/i.exec(txtSt(o.finalizadoPor));
  const status = b && txtSt(b.status) ? txtSt(b.status) : m ? m[1] : '';
  return txtSt(status).normalize('NFD').replace(/\p{M}/gu, '').toUpperCase() === 'ENTREGUE';
}
/* A ENTREGA DA O.S.: {dia, fonte, semProva} ou null (não entregue).
   Com marca por item: a ÚLTIMA entrega por item, marcada ou implícita,
   quando nenhum item físico ficou a entregar, ou quando a O.S. foi encerrada
   no PCP. Sem marca: a entrega lançada à mão, a finalização no PCP ou a
   baixa do ERP (sem prova). Cancelada: só o que já foi entregue por item.
   A BAIXA DO ERP SEM LANÇAMENTO (revisão da F16) tem a data da
   sincronização, não a da entrega. Depois do corte, a O.S. externa espera o
   lançamento à mão: fica "a lançar", entregue e sem dia ({dia:''}), e o
   prazo não é julgado. Nos outros casos a baixa só dá o dia quando o ERP
   disse ENTREGUE, a régua da entrega implícita do motor ("fora da carteira"
   não conta como entrega no dia da baixa). Com marca por item, vale a última
   marca quando todo item físico foi por marca; o implícito dessa baixa não. */
function entregaDaOS(o, M, r, canc) {
  const fim = o.finalizadaEm ? diaSt(o.finalizadaEm) : '';
  const erp = encerradaNoERPSt(o);
  const l = o.entregaLancada;
  const lancada = diaSt(l && typeof l === 'object' ? l.data : l);
  const aLancar = erp && !lancada && !!fim && o.tipo !== 'interno' && fim >= CORTE_LANCAMENTO_ST;
  const semDia = aLancar ? {dia:'', fonte:'aLancar', semProva:true}
    : erp && !lancada && !erpDisseEntregueSt(o) ? {dia:'', fonte:'erpSemData', semProva:true} : null;
  if (r && r.marcas > 0) {
    const L = M.lancamentosDaOS(o);
    const linhas = L.lancamentos.filter(x => x.tipo !== 'servico' && diaValidoSt(x.dia));
    const ultimo = linhas.reduce((m, x) => x.dia > m ? x.dia : m, '');
    const semProva = linhas.some(x => x.marca === 'sem prova');
    if (canc) return ultimo ? {dia:ultimo, fonte:'itens', semProva} : null;
    const pendente = r.aEntregar + r.parciais + r.problema > 0;
    if (fim && semDia) return !pendente && !semProva && ultimo ? {dia:ultimo, fonte:'itens', semProva:false} : semDia;
    if (fim) return pendente ? {dia:fim > ultimo ? fim : ultimo, fonte:'itens', semProva:semProva || erp} : {dia:ultimo || fim, fonte:'itens', semProva};
    return !pendente && ultimo ? {dia:ultimo, fonte:'itens', semProva} : null;
  }
  if (canc || !fim) return null;
  if (lancada) return {dia:lancada, fonte:'lancada', semProva:false};
  if (semDia) return semDia;
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
/* OCORRÊNCIAS, RETORNO ANTECIPADO E ABONOS (F17). Toda perda aponta para uma
   ocorrência com id. As DERIVADAS são lidas da O.S., sem gravar nada, e têm
   o id 'osId:tipo' (o mesmo em toda apuração):
     atraso              o prazo combinado vencido (a entregue e a aberta)
     retrabalho          a marca de retrabalho, venha de onde vier
     retorno_antecipado  a chegada conferida pela gestão antes do retorno
                         previsto da volta, além da tolerância da regra
     carro, avaria, equipamentos
                         a conferência da volta da gestão (retornoConf):
                         carro sujo ou desarrumado, avaria nova, equipamentos
                         que não voltaram completos. São o bônus e o redutor
                         da volta (F19), não perda da O.S. (`volta: true`).
   As MANUAIS (equipamento faltante ou danificado, outra) moram em
   os.ocorrencias, com id próprio ('oc-...'): detalham o item e não descontam
   de novo (o redutor de equipamento é um só, o da conferência). Só
   acréscimo; anular é novo carimbo.
   O ABONO ({id, ocorrenciaId, motivo, autor}) vale para o atraso (a
   remarcação pedida pelo cliente, decisão do dono) e para o retorno
   antecipado. Retrabalho não se abona. Revogar é novo carimbo (revogadoEm,
   revogadoPor), nunca apagar. O pedido que o aparelho ainda vai mandar
   ({pedido: true}, {revogar: true}, {anular: true}) já vale na tela, marcado
   "a enviar"; quem carimba autor e hora é o servidor.
   O RETORNO ANTECIPADO é medido PELA VOLTA (recomendação do plano): o
   retorno previsto mais tarde das O.S. da volta naquele dia (o da última O.S.
   do carro) contra a chegada conferida pela gestão (retornoConferido: dia e
   hora da fábrica, sem fuso; o recebidoEm em UTC não entra na conta). A hora
   que a equipe anotou (horaRetorno) é só declaração e nunca decide. Chegar
   até `toleranciaRetornoMin` minutos antes não conta. A perda cai só na O.S.
   do último retorno previsto (regra.retornoNaVolta 'ultima', o padrão: a
   volta é uma só, e zerar as três O.S. puniria quem faz três serviços na
   mesma saída) ou em todas ('todas'). Sem retorno previsto digitado não há
   perda (decisão do dono); sem chegada conferida, "sem dado". */
const TIPOS_OCORRENCIA = Object.freeze(['atraso', 'retrabalho', 'retorno_antecipado', 'carro', 'avaria', 'equipamentos', 'equipamento_faltante', 'equipamento_danificado', 'outra']);
const TIPOS_OCORRENCIA_MANUAL = Object.freeze(['equipamento_faltante', 'equipamento_danificado', 'outra']);
const ROTULOS_OCORRENCIA = Object.freeze({atraso:'Entrega com atraso', retrabalho:'Retrabalho', retorno_antecipado:'Retorno antecipado',
  carro:'Carro sujo ou desarrumado', avaria:'Avaria nova no carro', equipamentos:'Equipamentos com falta na volta',
  equipamento_faltante:'Equipamento faltante', equipamento_danificado:'Equipamento danificado', outra:'Outra ocorrência'});
// Só estas se abonam: retrabalho não se abona, e o que a conferência da volta diz se corrige na conferência.
const OCORRENCIAS_ABONAVEIS = Object.freeze(['atraso', 'retorno_antecipado']);
// A perda da regra do programa (a lista PERDAS de regras.js) que cada ocorrência derivada aplica.
const PERDA_DA_OCORRENCIA = Object.freeze({atraso:'atraso', retrabalho:'retrabalho', retorno_antecipado:'retornoAntecipado'});
const MOTIVO_ABONO_MIN = 15;
const MOTIVO_ABONO_MAX = 300;
// A tolerância da regra embutida (F05); a regra vigente manda quando vem.
const TOLERANCIA_RETORNO_PADRAO = 15;
const RETORNO_NA_VOLTA_PADRAO = 'ultima';
const HORA_ST = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutosSt = h => HORA_ST.test(h) ? Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5)) : NaN;
const minTxtSt = n => n === 1 ? '1 minuto' : n < 60 ? `${n} minutos` : `${Math.floor(n / 60)} h${n % 60 ? ` ${n % 60} min` : ''}`;
const cortarSt = (v, n) => Array.from(txtSt(v)).slice(0, n).join('');
// O motivo do abono: '' quando serve; senão a frase, igual na tela e na porta (contado sem os invisíveis, como o do cancelamento).
function motivoAbonoInvalido(motivo) {
  const n = letrasMotivoSt(motivo);
  if (n < MOTIVO_ABONO_MIN) return `Escreva o motivo do abono com ${MOTIVO_ABONO_MIN} letras ou mais.`;
  if (n > MOTIVO_ABONO_MAX) return `O motivo do abono vai até ${MOTIVO_ABONO_MAX} letras.`;
  return '';
}
const toleranciaRetorno = regra => { const t = objSt(regra) ? regra.toleranciaRetornoMin : undefined; return Number.isInteger(t) && t >= 0 && t <= 240 ? t : TOLERANCIA_RETORNO_PADRAO; };
const retornoNaVolta = regra => objSt(regra) && (regra.retornoNaVolta === 'todas' || regra.retornoNaVolta === 'ultima') ? regra.retornoNaVolta : RETORNO_NA_VOLTA_PADRAO;
// A chegada conferida pela gestão: {dia, hora} no calendário da fábrica, ou null.
function chegadaConferida(o) {
  const c = objSt(o) && objSt(o.retornoConferido) ? o.retornoConferido : null;
  const dia = c ? diaValidoSt(txtSt(c.dia)) : '', hora = c && HORA_ST.test(txtSt(c.hora)) ? txtSt(c.hora) : '';
  return dia && hora ? {dia, hora, por:txtSt(c.por)} : null;
}
/* OS ABONOS da O.S., na ordem gravada: o carimbado pelo servidor (com `em`)
   e o pedido que ainda vai (pedido: true, com motivo que serve). */
function abonosDe(o) {
  const out = [];
  for (const a of objSt(o) && Array.isArray(o.abonos) ? o.abonos : []) {
    if (!objSt(a)) continue;
    const id = txtSt(a.id), ocorrenciaId = txtSt(a.ocorrenciaId), pendente = a.pedido === true && !txtSt(a.em);
    if (!id || !ocorrenciaId || (pendente ? !!motivoAbonoInvalido(a.motivo) : !txtSt(a.em))) continue;
    const revogadoEm = txtSt(a.revogadoEm);
    out.push({id, ocorrenciaId, motivo:cortarSt(a.motivo, MOTIVO_ABONO_MAX), por:txtSt(a.por), em:txtSt(a.em), pendente,
      revogado:!!revogadoEm || a.revogar === true, revogadoEm, revogadoPor:txtSt(a.revogadoPor), revogacaoPendente:a.revogar === true && !revogadoEm});
  }
  return out;
}
// O abono que vale para a ocorrência: o último não revogado.
function abonoVigente(o, ocorrenciaId) {
  let v = null;
  for (const a of abonosDe(o)) if (a.ocorrenciaId === ocorrenciaId && !a.revogado) v = a;
  return v;
}
/* AS OCORRÊNCIAS MANUAIS (os.ocorrencias): as gravadas e os pedidos que
   ainda vão. A anulada fica na lista, marcada. */
function ocorrenciasManuais(o) {
  const out = [];
  for (const x of objSt(o) && Array.isArray(o.ocorrencias) ? o.ocorrencias : []) {
    if (!objSt(x) || !TIPOS_OCORRENCIA_MANUAL.includes(x.tipo)) continue;
    const id = txtSt(x.id), pendente = x.pedido === true && !txtSt(x.em);
    if (!id || (!pendente && !txtSt(x.em))) continue;
    const an = objSt(x.anulada) && txtSt(x.anulada.em) ? x.anulada : null;
    const item = cortarSt(x.item, 120), obs = cortarSt(x.obs, 300);
    out.push({id, tipo:x.tipo, rotulo:ROTULOS_OCORRENCIA[x.tipo], origem:'manual', perda:'', volta:false, abonavel:false, abonado:false, abono:null,
      motivo:[item, obs].filter(Boolean).join(': ') || ROTULOS_OCORRENCIA[x.tipo].toLowerCase(), item, obs, fonte:txtSt(x.fonte), grupo:txtSt(x.grupo),
      dia:diaValidoSt(txtSt(x.dia)), por:txtSt(x.por), em:txtSt(x.em), pendente,
      anulada:!!an || x.anular === true, anulacaoPendente:x.anular === true && !an, anuladaPor:an ? txtSt(an.por) : '', anuladaEm:an ? txtSt(an.em) : ''});
  }
  return out;
}
/* AS O.S. DA MESMA VOLTA do retorno: a mesma chegada conferida (o dia), o
   mesmo carro e a mesma equipe, como o lote as juntou. `chave` lê a pessoa
   (no aparelho, OPERACAO.chavePessoa; sem ela, o texto da equipe). Sem carro
   e sem equipe nada liga uma O.S. à outra: a volta é ela sozinha. A retirada
   no balcão não tem volta. */
function voltaDoRetorno(o, lista, chave) {
  if (!objSt(o)) return [];
  const c = chegadaConferida(o);
  if (!c || o.tipo === 'interno') return [o];
  const pessoa = typeof chave === 'function' ? chave : txtSt;
  const carro = x => txtSt(x.veiculo).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const gente = x => (Array.isArray(x.equipe) ? x.equipe : []).map(p => txtSt(pessoa(p))).filter(Boolean).sort().join('+');
  const k = carro(o) + '|' + gente(o);
  if (k === '|') return [o];
  const out = [o], vistos = new Set([txtSt(o.id)]);
  for (const x of Array.isArray(lista) ? lista : []) {
    if (!objSt(x) || x.tipo === 'interno' || vistos.has(txtSt(x.id))) continue;
    const cx = chegadaConferida(x);
    if (!cx || cx.dia !== c.dia || carro(x) + '|' + gente(x) !== k) continue;
    vistos.add(txtSt(x.id));
    out.push(x);
  }
  return out;
}
/* O RETORNO ANTECIPADO da O.S.: {situacao, conta, abonado, motivo, ...}.
   situacao: 'antecipado' (conta como perda), 'abonado', 'no horário', 'na
   volta' (a volta chegou antes, e a perda fica na O.S. do último retorno
   previsto), 'sem retorno previsto' (sem perda), 'sem dado' (a gestão ainda
   não conferiu a chegada) ou 'não se aplica' (retirada no balcão). */
function retornoAntecipado(o, regra, volta) {
  const os = objSt(o) ? o : {};
  const tolerancia = toleranciaRetorno(regra), modo = retornoNaVolta(regra);
  const declarada = HORA_ST.test(txtSt(os.horaRetorno)) ? txtSt(os.horaRetorno) : '';
  const r = {situacao:'sem dado', conta:false, abonado:false, abono:null, ocorrenciaId:'', dia:'', previsto:'', chegada:'', minutos:0,
    tolerancia, medida:'volta', modo, osDaVolta:1, ultimaId:'', declarada, medicao:'', motivo:''};
  const decl = declarada ? `; a equipe anotou ${declarada}, que é só declaração` : '';
  if (os.tipo === 'interno') return {...r, situacao:'não se aplica', motivo:'retirada no balcão: não há volta do carro'};
  const c = chegadaConferida(os);
  if (!c) {
    const semPrev = !retornosPrevistos(os).length;
    return {...r, situacao:semPrev ? 'sem retorno previsto' : 'sem dado',
      motivo:(semPrev ? 'sem retorno previsto digitado: não há perda por retorno antecipado' : 'a chegada do carro ainda não foi conferida pela gestão') + decl};
  }
  // As O.S. da volta naquele dia, uma vez cada; a própria entra como está (o rascunho da ficha).
  const id = txtSt(os.id), membros = [os], vistos = new Set([id]);
  for (const x of Array.isArray(volta) ? volta : []) {
    if (!objSt(x) || vistos.has(txtSt(x.id))) continue;
    const cx = chegadaConferida(x);
    if (!cx || cx.dia !== c.dia) continue;
    vistos.add(txtSt(x.id));
    membros.push(x);
  }
  let ultima = null, previsto = '';
  for (const x of membros) {
    const e = retornosPrevistos(x).find(p => p.dia === c.dia);
    if (e && (!ultima || e.hora > previsto || (e.hora === previsto && txtSt(x.id) > txtSt(ultima.id)))) { ultima = x; previsto = e.hora; }
  }
  const n = membros.length, prevTxt = n > 1 ? `retorno previsto da volta (${previsto}, ${n} O.S.)` : `retorno previsto (${previsto})`;
  const base = {...r, dia:c.dia, chegada:c.hora, osDaVolta:n, medida:n > 1 ? 'volta' : 'os'};
  if (!ultima) return {...base, situacao:'sem retorno previsto', motivo:`chegada conferida às ${c.hora} de ${ddmmSt(c.dia)}, sem retorno previsto digitado para o dia: não há perda`};
  const antes = minutosSt(previsto) - minutosSt(c.hora);
  const comPrev = {...base, previsto, ultimaId:txtSt(ultima.id), minutos:Math.max(0, antes)};
  if (antes <= 0) return {...comPrev, situacao:'no horário', motivo:`chegou às ${c.hora}, ${antes < 0 ? 'depois do' : 'no'} ${prevTxt}`};
  if (antes <= tolerancia) return {...comPrev, situacao:'no horário', motivo:`chegou às ${c.hora}, ${minTxtSt(antes)} antes do ${prevTxt}, dentro da tolerância de ${minTxtSt(tolerancia)}`};
  const como = `chegou às ${c.hora}, ${minTxtSt(antes)} antes do ${prevTxt}, além da tolerância de ${minTxtSt(tolerancia)}`;
  if (modo === 'ultima' && txtSt(ultima.id) !== id) return {...comPrev, situacao:'na volta', motivo:`a volta ${como}: a perda fica na O.S. ${txtSt(ultima.numero) || txtSt(ultima.id)}, a do último retorno previsto`};
  const ocorrenciaId = id + ':retorno_antecipado', ab = abonoVigente(os, ocorrenciaId);
  if (ab) return {...comPrev, situacao:'abonado', abonado:true, abono:ab, ocorrenciaId, medicao:como, motivo:comAbonoSt(como, ab)};
  return {...comPrev, situacao:'antecipado', conta:true, ocorrenciaId, medicao:como, motivo:como + decl};
}
/* A CONTA DA ENTREGA, uma vez só para o status e para as ocorrências: o
   cancelamento, o prazo, a entrega e o atraso (a entregue depois do prazo, ou
   a aberta com o prazo vencido). */
function apurarSt(os, hoje) {
  const dHoje = diaValidoSt(txtSt(hoje)) || diaSt(Date.now());
  const M = motorItem();
  const temMarca = (Array.isArray(os.itens) ? os.itens : []).some(it => objSt(it) && Array.isArray(it.entregas) && it.entregas.length > 0);
  const r = M && temMarca ? M.resumoOS(os) : null;
  const canc = cancelamentoDe(os);
  const prazo = prazoDaEntrega(os);
  const entrega = entregaDaOS(os, M, r, canc);
  let atraso = null;
  if (!canc && entrega && entrega.dia && prazo && entrega.dia > prazo.fim) {
    const dias = diasEntreSt(prazo.fim, entrega.dia);
    const como = `${os.tipo === 'interno' ? 'retirada' : 'entregue'} em ${ddmmSt(entrega.dia)} (${FONTE_TXT_ST[entrega.fonte]})`;
    atraso = {dias, entregue:true, motivo:`${como}, ${diasTxtSt(dias)} depois do prazo (${prazoTxtSt(prazo)})`};
  } else if (!canc && !entrega && prazo && dHoje > prazo.fim) {
    const dias = diasEntreSt(prazo.fim, dHoje);
    atraso = {dias, entregue:false, motivo:`prazo (${prazoTxtSt(prazo)}) vencido há ${diasTxtSt(dias)}, sem entrega registrada`};
  }
  return {dHoje, M, temMarca, r, canc, prazo, entrega, atraso};
}
const motivoRetrabalhoSt = os => {
  const prob = Array.from(txtSt(os.problema)).slice(0, 120).join('');
  return `retrabalho marcado${prob ? ': ' + prob : ''}${diaSt(os.dataResolvido) ? ` (resolvido em ${ddmmSt(diaSt(os.dataResolvido))})` : ''}`;
};
const comAbonoSt = (motivo, ab) => ab ? `${motivo}; abonado${ab.por ? ' por ' + ab.por : ''}: ${ab.motivo}${ab.pendente ? ' (a enviar)' : ''}` : motivo;
// As derivadas, com a apuração e o retorno já feitos.
function derivadasDe(os, ap, ret) {
  const id = txtSt(os.id), out = [];
  const poe = (tipo, motivo, extra) => {
    const ocorrenciaId = id + ':' + tipo, abonavel = OCORRENCIAS_ABONAVEIS.includes(tipo);
    const abono = abonavel ? abonoVigente(os, ocorrenciaId) : null;
    out.push({id:ocorrenciaId, tipo, rotulo:ROTULOS_OCORRENCIA[tipo], origem:'derivada', perda:PERDA_DA_OCORRENCIA[tipo] || '', volta:false,
      abonavel, abonado:!!abono, abono, motivo:comAbonoSt(motivo, abono), ...extra});
  };
  if (ap.atraso) poe('atraso', ap.atraso.motivo, {entregue:ap.atraso.entregue, dias:ap.atraso.dias});
  if (os.retrabalho) poe('retrabalho', motivoRetrabalhoSt(os), {});
  if (!ap.canc && (ret.situacao === 'antecipado' || ret.situacao === 'abonado')) poe('retorno_antecipado', ret.medicao, {minutos:ret.minutos, dia:ret.dia});
  const rc = os.tipo !== 'interno' && objSt(os.retornoConf) ? os.retornoConf : null;
  const nao = k => !!rc && (rc[k] === 'nao' || rc[k] === false);
  const quem = rc && txtSt(rc.por) ? ` (conferida por ${txtSt(rc.por)})` : '';
  const obs = rc && txtSt(rc.obs) ? `: ${cortarSt(rc.obs, 120)}` : '';
  if (nao('carroLimpo') || nao('carroArrumado'))
    poe('carro', `a conferência da volta diz carro ${[nao('carroLimpo') ? 'sujo' : '', nao('carroArrumado') ? 'desarrumado' : ''].filter(Boolean).join(' e ')}${quem}`, {volta:true});
  if (nao('equipamentosOk')) poe('equipamentos', `a conferência da volta diz que os equipamentos não voltaram completos${quem}${obs}`, {volta:true});
  if (nao('semAvaria')) poe('avaria', `a conferência da volta aponta avaria nova no carro${quem}`, {volta:true});
  return out;
}
// As ocorrências derivadas da O.S. (id 'osId:tipo'), sem as manuais.
function ocorrenciasDerivadas(o, regra, volta, hoje) {
  const os = objSt(o) ? o : {};
  return derivadasDe(os, apurarSt(os, hoje), retornoAntecipado(os, regra, volta));
}
// Todas: as derivadas e as manuais (a anulada vem marcada).
function ocorrenciasDaOS(o, regra, volta, hoje) {
  return [...ocorrenciasDerivadas(o, regra, volta, hoje), ...ocorrenciasManuais(o)];
}
function statusEntrega(o, hoje, regra, volta) {
  const os = objSt(o) ? o : {};
  const ap = apurarSt(os, hoje);
  const {dHoje, M, temMarca, r, canc, prazo, entrega} = ap;
  const parcial = !canc && !entrega ? parcialDe(os, M, r) : null;
  const ret = retornoAntecipado(os, regra, volta);
  const ocorrencias = [...derivadasDe(os, ap, ret), ...ocorrenciasManuais(os)];
  const abonoAtraso = ap.atraso ? abonoVigente(os, txtSt(os.id) + ':atraso') : null;
  const aplicaveis = [];
  const poe = (estado, motivo, rotulo, abonado) => { aplicaveis.push({estado, rotulo:rotulo || ROTULOS_ENTREGA[estado], motivo, ...(abonado ? {abonado:true} : {})}); };
  let diasAtraso = 0;
  if (canc) {
    const foi = entrega ? '; o que já foi entregue fica' : '';
    poe('cancelado', canc.origem === 'erp' ? `cancelada no ERP (baixa de ${ddmmSt(diaSt(canc.em))})${foi}`
      : `cancelada${canc.por ? ' por ' + canc.por : ''}${diaSt(canc.em) ? ' em ' + ddmmSt(diaSt(canc.em)) : ''}: ${canc.motivo}${canc.pendente ? ' (a enviar)' : ''}${foi}`);
  }
  if (os.retrabalho) poe('retrabalho', motivoRetrabalhoSt(os));
  if (!canc && (ret.situacao === 'antecipado' || ret.situacao === 'abonado'))
    poe('retorno_antecipado', ret.motivo, ret.abonado ? 'Retorno antecipado (abonado)' : '', ret.abonado);
  if (!canc && entrega && !entrega.dia) {
    const baixa = ddmmSt(diaSt(os.finalizadaEm));
    if (entrega.fonte === 'aLancar') poe('entregue', `baixa do ERP em ${baixa}, ainda a lançar: a data real da entrega vem no lançamento, e só com ela o prazo é julgado`, ROTULO_A_LANCAR_ST);
    else poe('entregue', `baixa do ERP em ${baixa} sem o dia da entrega (o ERP não disse entregue): o prazo não é julgado`, ROTULO_ERP_SEM_DATA_ST);
  } else if (!canc && entrega) {
    const como = `${os.tipo === 'interno' ? 'retirada' : 'entregue'} em ${ddmmSt(entrega.dia)} (${FONTE_TXT_ST[entrega.fonte]})`;
    if (ap.atraso) {
      diasAtraso = ap.atraso.dias;
      poe('atraso', comAbonoSt(ap.atraso.motivo, abonoAtraso), abonoAtraso ? 'Com atraso (abonado)' : '', !!abonoAtraso);
    } else if (prazo) poe('no_prazo', `${como}, dentro do prazo (${prazoTxtSt(prazo)})`);
    // Sem prazo combinado não há o que medir: neutro, nunca o verde do "No prazo".
    else poe('entregue', `${como}; sem prazo combinado no PCP, não há atraso a medir`, ROTULO_SEM_PRAZO_ST);
  } else if (!canc) {
    if (ap.atraso) {
      diasAtraso = ap.atraso.dias;
      poe('atraso', comAbonoSt(ap.atraso.motivo, abonoAtraso), abonoAtraso ? 'Com atraso (abonado)' : '', !!abonoAtraso);
    }
    const exec = motivoExecucaoSt(os, dHoje, parcial, prazo);
    if (exec) poe('execucao', exec);
    else if (!diasAtraso) poe('agendado', motivoAgendadoSt(os, prazo));
  }
  /* A ordem da precedência; o ABONADO vem depois das perdas que valem e
     antes do "No prazo" (ele não zera, mas diz o que aconteceu). */
  const ordem = a => a.abonado ? ESTADOS_ENTREGA.indexOf('atraso') + 0.5 + ESTADOS_ENTREGA.indexOf(a.estado) / 100 : ESTADOS_ENTREGA.indexOf(a.estado);
  aplicaveis.sort((a, b) => ordem(a) - ordem(b));
  // Sem data nenhuma, o "Agendado" diz "A agendar" (no selo e na lista).
  if (!prazo) for (const a of aplicaveis) if (a.estado === 'agendado') a.rotulo = 'A agendar';
  const p = aplicaveis[0];
  const perdasRegra = objSt(regra) && Array.isArray(regra.perdas) ? regra.perdas : [];
  // Atraso só é perda da O.S. entregue: a aberta ainda pode ser abonada ou cancelada. O abonado nunca é perda.
  const perdas = aplicaveis.filter(a => !a.abonado && PERDA_DO_ESTADO[a.estado] && perdasRegra.includes(PERDA_DO_ESTADO[a.estado]) && (a.estado !== 'atraso' || !!entrega))
    .map(a => PERDA_DO_ESTADO[a.estado]);
  return {
    estado:p.estado, rotulo:p.rotulo, motivo:p.motivo, aplicaveis,
    entregue:!!entrega, dataEntrega:entrega ? entrega.dia : '', fonteEntrega:entrega ? entrega.fonte : '', semProva:!!(entrega && entrega.semProva),
    prazo:prazo ? prazo.fim : '', prazoInicio:prazo ? prazo.inicio : '', prazoFonte:prazo ? prazo.fonte : '', diasAtraso,
    parcial, cancelamento:canc, retornoAntecipado:ret, ocorrencias, perdas,
    // O.S. com marca por item e sem o motor carregado (versões misturadas): a data e a parcial não leem os itens.
    semMotor:temMarca && !M,
  };
}
/* ==== FIM DO STATUS ==== */
export const STATUS_ENTREGA = { ESTADOS_ENTREGA, ROTULOS_ENTREGA, MOTIVO_CANCELAMENTO_MIN, MOTIVO_CANCELAMENTO_MAX, motivoCancelamentoInvalido, cancelamentoDe, cancelada, prazoDaEntrega, statusEntrega, TIPOS_OCORRENCIA, TIPOS_OCORRENCIA_MANUAL, ROTULOS_OCORRENCIA, OCORRENCIAS_ABONAVEIS, MOTIVO_ABONO_MIN, MOTIVO_ABONO_MAX, TOLERANCIA_RETORNO_PADRAO, motivoAbonoInvalido, toleranciaRetorno, chegadaConferida, abonosDe, abonoVigente, ocorrenciasManuais, voltaDoRetorno, retornoAntecipado, ocorrenciasDerivadas, ocorrenciasDaOS };
export { ESTADOS_ENTREGA, ROTULOS_ENTREGA, MOTIVO_CANCELAMENTO_MIN, MOTIVO_CANCELAMENTO_MAX, motivoCancelamentoInvalido, cancelamentoDe, cancelada, prazoDaEntrega, statusEntrega, TIPOS_OCORRENCIA, TIPOS_OCORRENCIA_MANUAL, ROTULOS_OCORRENCIA, OCORRENCIAS_ABONAVEIS, MOTIVO_ABONO_MIN, MOTIVO_ABONO_MAX, TOLERANCIA_RETORNO_PADRAO, motivoAbonoInvalido, toleranciaRetorno, chegadaConferida, abonosDe, abonoVigente, ocorrenciasManuais, voltaDoRetorno, retornoAntecipado, ocorrenciasDerivadas, ocorrenciasDaOS };

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
/* O CANCELAMENTO QUE AS MARCAS DE ITEM E O LANÇAMENTO DESTE ENVIO VEEM
   (revisão da F16). A fila do aparelho junta os envios da mesma O.S.: o
   "Desfazer cancelamento" e a marca feita depois dele sobem juntos, e a
   marca era recusada porque lia o cancelamento gravado. Vale o desfazer
   aceito neste envio; o pedido de cancelar só vale depois da gravação (a
   marca feita antes dele entra). `antes` é o gravado; `depois`, o resultado
   do carimbarCancelamento. */
const cancelamentoAtivoSt = c => objSt(c) && c.ativo === true && !!txtSt(c.motivo);
export const cancelamentoParaMarcas = (antes, depois) => cancelamentoAtivoSt(depois) ? antes : depois;

/* ── OCORRÊNCIAS MANUAIS E ABONOS NA PORTA (F17), só do servidor ──────────
   Os dois moram na O.S. (os.ocorrencias, os.abonos) e são protegidos como os
   campos da gestão (F01). Rodam DEPOIS do preservarAusentes, que já deixou o
   gravado no lugar; `veio` é o que o aparelho mandou (undefined = não mandou).
   - SÓ ACRÉSCIMO. A lista parte da gravada: o que o aparelho tirou, trocou
     ou mandou vazio não muda nada (a aba antiga, v141, não conhece o campo e
     não o encolhe). O que entra é o PEDIDO: item de id novo com
     { pedido: true } (registrar, abonar), ou { anular: true } e
     { revogar: true } num id gravado. Item de id novo sem pedido (a marca
     forjada, com `em` e `por` escritos pelo aparelho) não entra;
   - só admin e pcp (`pode`); para os outros fica o gravado, e quem tem
     senha ouve o porquê (`avisar`). O toque parte do gravado na mescla;
   - o carimbo é do crachá e do servidor (por, porConta, porId, em), nunca o
     que o aparelho escreveu;
   - anular e revogar são novo carimbo (anulada {…}, revogadoEm/revogadoPor),
     e o registro fica na lista para sempre;
   - o que não passa vira aviso, nunca 422 (um 422 prende a fila).
   Devolvem { os, avisos, mudou }. */
const ID_OCORRENCIA_MANUAL = /^oc-[a-z0-9]{6,40}$/;
const ID_ABONO = /^ab-[a-z0-9]{6,40}$/;
const ID_GRUPO_VOLTA = /^vl-[a-z0-9]{6,40}$/;
export const OCORRENCIAS_MAX = 60;
export const ABONOS_MAX = 60;
export const FONTES_OCORRENCIA = ['volta', 'ficha', 'lote'];
const quemF17 = autor => ({ por: String(autor?.nome ?? '').slice(0, 120), porConta: String(autor?.login ?? '').slice(0, 120), porId: ehIdPessoa(autor?.porId) ? String(autor.porId).trim() : '' });
const listaObjSt = v => Array.isArray(v) ? v.filter(objSt) : [];
// A base é a gravada; sem nada gravado, o campo não nasce do aparelho.
function manterGravado(r, antes, campo) {
  if (antes && Object.prototype.hasOwnProperty.call(antes, campo)) r[campo] = antes[campo]; else delete r[campo];
}
const semInvisiveis = (v, n) => Array.from(txtSt(v).replace(INVISIVEIS_ST, '').trim()).slice(0, n).join('');
const minusculaInicio = t => t.charAt(0).toLowerCase() + t.slice(1);
// Os pedidos do envio, contra a lista gravada: os de id novo e os que mexem num id gravado.
function pedidosF17(veio, gravados, marca) {
  const porId = new Map(gravados.map(x => [txtSt(x.id), x]));
  const novos = [], sobre = [], vistos = new Set();
  for (const x of listaObjSt(veio)) {
    const id = txtSt(x.id);
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    const g = porId.get(id);
    // O pedido desfeito antes de ir (registrado e anulado, abonado e revogado sem rede) não entra.
    if (!g && x.pedido === true && x[marca] !== true) novos.push(x);
    else if (g && x[marca] === true) sobre.push(x);
  }
  return { novos, sobre };
}
export function guardarOcorrencias(veio, os, antes, autor, agora, { pode = false, avisar = false } = {}) {
  const r = { ...os }, avisos = [];
  manterGravado(r, antes, 'ocorrencias');
  const gravadas = listaObjSt(antes?.ocorrencias);
  const anuladaJa = x => objSt(x.anulada) && !!txtSt(x.anulada.em);
  const { novos, sobre } = pedidosF17(veio, gravadas, 'anular');
  const anular = sobre.filter(x => !anuladaJa(gravadas.find(g => txtSt(g.id) === txtSt(x.id))));
  if (!novos.length && !anular.length) return { os: r, avisos, mudou: false };
  if (!pode) {
    if (avisar) avisos.push(novos.length ? 'A ocorrência não foi registrada: só a gestão do PCP (admin ou pcp) registra ocorrência.'
      : 'A ocorrência não foi anulada: só a gestão do PCP (admin ou pcp) anula ocorrência.');
    return { os: r, avisos, mudou: false };
  }
  const quem = quemF17(autor), em = String(agora ?? '');
  const out = gravadas.map(x => ({ ...x }));
  for (const a of anular) {
    const i = out.findIndex(x => txtSt(x.id) === txtSt(a.id));
    out[i] = { ...out[i], anulada: { ...quem, em, motivo: semInvisiveis(a.motivoAnular, 300) } };
  }
  for (const p of novos) {
    const id = txtSt(p.id);
    if (!ID_OCORRENCIA_MANUAL.test(id)) { avisos.push('Uma ocorrência veio sem código válido e não foi registrada.'); continue; }
    if (!TIPOS_OCORRENCIA_MANUAL.includes(p.tipo)) { avisos.push('Uma ocorrência de tipo desconhecido não foi registrada.'); continue; }
    const item = semInvisiveis(p.item, 120), obs = semInvisiveis(p.obs, 300);
    if (letrasMotivoSt(item) + letrasMotivoSt(obs) < 3) {
      avisos.push(`A ocorrência (${ROTULOS_OCORRENCIA[p.tipo].toLowerCase()}) não foi registrada: diga qual é o item ou o que aconteceu.`); continue;
    }
    if (out.length >= OCORRENCIAS_MAX) { avisos.push(`A O.S. já tem ${OCORRENCIAS_MAX} ocorrências: a nova não foi registrada. Fale com o PCP.`); break; }
    // `grupo` liga a mesma ocorrência registrada em todas as O.S. da volta (conta uma vez só).
    const grupo = ID_GRUPO_VOLTA.test(txtSt(p.grupo)) ? txtSt(p.grupo) : '';
    out.push({ id, tipo: p.tipo, item, obs, fonte: FONTES_OCORRENCIA.includes(p.fonte) ? p.fonte : 'ficha', dia: diaValidoSt(txtSt(p.dia)) || diaSt(em), ...(grupo ? { grupo } : {}), ...quem, em });
  }
  if (canon(out) === canon(gravadas)) return { os: r, avisos, mudou: false };
  r.ocorrencias = out;
  return { os: r, avisos, mudou: true };
}
/* Os abonos de id novo que o envio pede: o pcp-sync lê a volta do banco só
   quando um deles aponta o retorno antecipado (a medida é pela volta). */
export const abonosPedidos = (veio, antes) => pedidosF17(veio, listaObjSt(antes?.abonos), 'revogar').novos;
/* `ocorrencias` é a lista de ocorrências que a O.S. tem DEPOIS das outras
   regras deste envio (ocorrenciasDaOS, com a volta e a regra do dia): o
   abono só aponta ocorrência que existe, abonável, e uma de cada vez (a
   segunda espera a primeira ser revogada). */
export function guardarAbonos(veio, os, antes, autor, agora, { pode = false, avisar = false, ocorrencias = [] } = {}) {
  const r = { ...os }, avisos = [];
  manterGravado(r, antes, 'abonos');
  const gravados = listaObjSt(antes?.abonos);
  const { novos, sobre } = pedidosF17(veio, gravados, 'revogar');
  const revogar = sobre.filter(x => !txtSt(gravados.find(g => txtSt(g.id) === txtSt(x.id)).revogadoEm));
  if (!novos.length && !revogar.length) return { os: r, avisos, mudou: false };
  if (!pode) {
    if (avisar) avisos.push(novos.length ? 'O abono não foi gravado: só a gestão do PCP (admin ou pcp) abona.'
      : 'O abono não foi revogado: só a gestão do PCP (admin ou pcp) revoga abono.');
    return { os: r, avisos, mudou: false };
  }
  const quem = quemF17(autor), em = String(agora ?? '');
  const out = gravados.map(x => ({ ...x }));
  for (const a of revogar) {
    const i = out.findIndex(x => txtSt(x.id) === txtSt(a.id));
    out[i] = { ...out[i], revogadoEm: em, revogadoPor: quem.por, revogadoPorConta: quem.porConta, revogadoPorId: quem.porId };
  }
  const existentes = new Map(listaObjSt(ocorrencias).map(x => [txtSt(x.id), x]));
  for (const p of novos) {
    const id = txtSt(p.id), alvoId = txtSt(p.ocorrenciaId), alvo = existentes.get(alvoId);
    if (!ID_ABONO.test(id)) { avisos.push('Um abono veio sem código válido e não foi gravado.'); continue; }
    if (!alvo || alvo.anulada) { avisos.push('O abono não foi gravado: a ocorrência que ele aponta não existe nesta O.S. Confira o status da entrega.'); continue; }
    if (!OCORRENCIAS_ABONAVEIS.includes(alvo.tipo)) {
      avisos.push(alvo.tipo === 'retrabalho' ? 'O abono não foi gravado: retrabalho não se abona.' : `O abono não foi gravado: ${ROTULOS_OCORRENCIA[alvo.tipo].toLowerCase()} não se abona.`); continue;
    }
    const erro = motivoAbonoInvalido(p.motivo);
    if (erro) { avisos.push('O abono não foi gravado: ' + minusculaInicio(erro)); continue; }
    if (out.some(x => txtSt(x.ocorrenciaId) === alvoId && !txtSt(x.revogadoEm))) { avisos.push('O abono não foi gravado: a ocorrência já está abonada. Revogue o abono antes de abonar de novo.'); continue; }
    if (out.length >= ABONOS_MAX) { avisos.push(`A O.S. já tem ${ABONOS_MAX} abonos: o novo não foi gravado. Fale com o PCP.`); break; }
    out.push({ id, ocorrenciaId: alvoId, tipo: alvo.tipo, motivo: semInvisiveis(p.motivo, MOTIVO_ABONO_MAX), ...quem, em });
  }
  if (canon(out) === canon(gravados)) return { os: r, avisos, mudou: false };
  r.abonos = out;
  return { os: r, avisos, mudou: true };
}
