// Regras puras usadas pelas portas de dados e pelos testes de regressão.
// O motor de divisão (F04) confere e recalcula a alocação dentro da O.S. (F08).
import { DIVISAO } from './pcp-divisao.mjs';
// O motor da entrega por item (E2) confere a marca que chega (E3).
import { ENTREGA_ITEM } from './pcp-entrega-item.mjs';
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const objeto = v => v && typeof v === 'object' && !Array.isArray(v);
const proprio = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
export const CAMPOS_ERP = ['cliente','servico','vendedor','dataEntrada','cnpjCpf','valorTotal'];
/* SITUAÇÃO DO ERP (statusERP). A carteira é buscada por situação (PRODUCAO,
   PENDENTE, PAUSADO, CONCLUIDO) e a situação era jogada fora -- justamente o
   dado que diz se a produção terminou (auditoria de 23/09/2026). Grava a
   situação e DESDE QUANDO ela vale; não acende o selo "conferir" (a situação
   anda toda semana e, sozinha, não pede ação). */
export const SITUACOES_ERP = ['PRODUCAO', 'PENDENTE', 'PAUSADO', 'CONCLUIDO'];
export function atualizarSituacaoERP(atual, situacao, em) {
  const s = String(situacao || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
  if (!atual || atual.finalizadaEm || !SITUACOES_ERP.includes(s) || atual.statusERP === s) return null;
  return { ...atual, statusERP: s, statusERPDesde: em };
}
/* TRABALHO DE GENTE NA O.S. A conciliação horária arquivava toda O.S. que
   saiu da carteira aberta do ERP -- inclusive liberada, com equipe, agenda e
   confirmação (54 em 3 dias, 12 liberadas; a 23364 sumiu no dia da
   instalação). Só marcas que uma PESSOA põe contam: a importação preenche
   data e período com a previsão do ERP, então data não prova programação. */
export function temTrabalhoHumano(o) {
  if (!o) return false;
  return !!(o.liberadoPCP || o.aptoEm || (o.equipe || []).some(n => String(n || '').trim())
    || o.confirmacao === 'Confirmado' || o.paradoClienteEm
    || equipeNaRua(o)
    || (o.reabertaEm && String(o.reabertaEm) > String(o.baixaAutoERP?.em || ''))
    || temEntregaItem(o));
}
/* MARCA DE ENTREGA POR ITEM (E3): alguém entregou, retirou ou apontou
   problema num item. A O.S. com entrega parcial saiu da carteira do ERP e
   continua com saldo: arquivá-la apagaria da mesa o que ainda falta entregar.
   Qualquer marca gravada conta (a lista só cresce; a desfeita também é gente). */
export const temEntregaItem = o => !!o && Array.isArray(o.itens)
  && o.itens.some(it => objeto(it) && Array.isArray(it.entregas) && it.entregas.length > 0);
// Saiu e não voltou: a mesma marca do temTrabalhoHumano e da exceção de remarcar do pcp-sync.
export const equipeNaRua = o => !!(o && (o.horaSaida || o.saidaEm) && !(o.horaRetorno || o.retornoEm));
/* ÚLTIMO DIA DA AGENDA: a mesma conta do OPERACAO.prazo (operacao.js). Serviço
   de 3 dias que começou ontem termina amanhã; o interno é de um dia só. */
export function ultimoDiaAgenda(o) {
  const d = String(o?.instalacao?.data ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d + 'T12:00:00Z'))) return '';
  const dur = Math.min(366, Math.max(1, Math.floor(Number(o?.instalacao?.duracaoDias) || 1)));
  const t = new Date(d + 'T12:00:00Z');
  t.setUTCDate(t.getUTCDate() + (o?.tipo === 'interno' ? 0 : dur - 1));
  return t.toISOString().slice(0, 10);
}
/* A BAIXA DO ERP NÃO TIRA DA MESA O SERVIÇO QUE A EQUIPE AINDA ESTÁ FAZENDO
   (revisão da F01, 29/09/2026). O ERP marca ENTREGUE quando o material sai da
   fábrica. Olhar só o PRIMEIRO dia da agenda fechava, no meio do serviço, a
   instalação de vários dias; e a equipe na rua (saiu e não voltou) tinha a O.S.
   finalizada pelo ERP. Uma regra só, usada na escolha das candidatas e na
   releitura antes de gravar. Devolve a causa, ou '' quando pode baixar. */
export function motivoAgendaViva(o, hojeLocal) {
  if (equipeNaRua(o)) return 'a equipe está na rua (saiu e não voltou)';
  const ultimo = ultimoDiaAgenda(o);
  if (ultimo && ultimo >= String(hojeLocal ?? '')) return 'a agenda da equipe ainda não terminou';
  return '';
}
/* ── ERP DIZ ENTREGUE, PCP TEM SALDO (E7, 30/09/2026) ──────────────────────
   Decisão do dono: quando o ERP dá a O.S. como encerrada e o PCP tem entrega
   PARCIAL marcada (alguma unidade já foi por marca, inclusive a DECLARADA pelo
   celular, e ainda sobra item a entregar), o PCP segura a O.S. e a gestão
   decide. Sem marca parcial, a baixa segue exatamente como antes: a baixa só
   poupa quando há marca parcial explícita.
   O QUE CADA SITUAÇÃO DO ERP FAZ COM A O.S. PARCIAL:
     ENTREGUE, FINALIZADO  poupada (fica aberta), com a marca erpComSaldo, que
                           põe a O.S. na lista "ERP diz entregue, PCP tem saldo"
                           da tela Entregas
     CONCLUIDO             poupada sem a marca: é produção concluída, não
                           entrega (e está na carteira aberta, que a reabriria)
     CANCELADO             baixada como antes: o motor lê o saldo como
                           cancelado e o entregue fica no dia dele
   A marca é do SERVIDOR (a baixa grava, o aparelho não cria, não muda e não
   apaga: guardarSaldoERP). O selo (situação e data do ERP) diz a que aviso do
   ERP ela se refere: a decisão "manter aberta" vale para aquele selo e a O.S.
   volta à lista quando o ERP disser outra coisa. */
const situacaoERP = s => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').trim().toUpperCase();
export const SITUACOES_ERP_ENTREGUE = ['ENTREGUE', 'FINALIZADO'];
/* A O.S. aberta com entrega parcial marcada: o resumo do motor, ou null.
   O CANCELAMENTO DA GESTÃO FICA FORA DA CONTA (revisão da junção F16+E7). Na
   O.S. cancelada no PCP o motor lê o saldo como cancelado e ela deixava de
   ser "parcial": a baixa a finalizava por cima do "Manter aberta", e desfazer
   o cancelamento deixava o saldo preso numa O.S. finalizada. Cancelada, ela
   segue poupada; a lista e o card não a mostram enquanto estiver cancelada, e
   ela volta à lista quando o cancelamento é desfeito. O cancelamento do ERP é
   a situação que chega (CANCELADO, em decisaoBaixaERP), não este campo. */
export function entregaParcialMarcada(o) {
  if (!objeto(o) || String(o.finalizadaEm ?? '').trim()) return null;
  let r;
  try { r = ENTREGA_ITEM.resumoOS({ ...o, cancelamento: undefined }); } catch { return null; }
  return r && r.situacao === 'parcial' ? r : null;
}
function textoParcial(r) {
  const itens = r.entregues + r.parciais;
  const decl = r.unidadesDeclaradas > 0 ? `, ${r.unidadesDeclaradas} unidade${r.unidadesDeclaradas === 1 ? '' : 's'} declarada${r.unidadesDeclaradas === 1 ? '' : 's'} pelo celular` : '';
  return `entrega parcial marcada no PCP: ${itens} de ${r.itensTotal} ite${r.itensTotal === 1 ? 'm' : 'ns'} com entrega, ${r.saldoItens} unidade${r.saldoItens === 1 ? '' : 's'} de saldo${decl}`;
}
/* O QUE A BAIXA FAZ COM ESTA O.S. (a O.S. que o ERP deu em situação final).
   { acao: 'baixar' | 'poupar', marcar, parcial (o resumo, quando há), causa }.
   Sem marca parcial: 'baixar' e causa vazia, como sempre foi. */
export function decisaoBaixaERP(o, statusERP) {
  const st = situacaoERP(statusERP);
  const r = entregaParcialMarcada(o);
  if (!r) return { acao: 'baixar', marcar: false, parcial: null, causa: '' };
  if (st === 'CANCELADO') return { acao: 'baixar', marcar: false, parcial: r, causa: `${textoParcial(r)}; o ERP cancelou: o saldo vira cancelado e o entregue fica` };
  if (SITUACOES_ERP_ENTREGUE.includes(st)) return { acao: 'poupar', marcar: true, parcial: r, causa: `${textoParcial(r)}; o ERP diz ${st}: o PCP segura e a gestão decide em Entregas` };
  return { acao: 'poupar', marcar: false, parcial: r, causa: `${textoParcial(r)}; o ERP diz ${st || 'encerrada'} (produção, não entrega): segue aberta` };
}
export const seloSaldoERP = (status, dataEntregue) => `${situacaoERP(status)}|${/^\d{4}-\d{2}-\d{2}$/.test(String(dataEntregue ?? '')) ? dataEntregue : ''}`;
/* A MARCA DA BAIXA NA O.S. PARCIAL. Devolve o registro novo, ou null quando a
   marca já diz o mesmo (a baixa é idempotente: a mesma resposta do ERP não
   grava de novo). `desde` é a primeira vez que o ERP disse ESTA situação:
   mudou a situação (FINALIZADO e depois ENTREGUE), `desde` recomeça (revisão
   da E7). Sem a data de entrega do ERP, a tela usa o dia de `desde` como o
   dia do ENTREGUE, e herdar o do FINALIZADO dava o dia de outro aviso. Só a
   data mudando (ENTREGUE em 25/09 e depois em 27/09) mantém o `desde`. */
export function marcarErpComSaldo(o, { status = '', dataEntregue = '', agora = '' } = {}) {
  if (!objeto(o)) return null;
  const st = situacaoERP(status);
  const data = /^\d{4}-\d{2}-\d{2}$/.test(String(dataEntregue ?? '')) ? String(dataEntregue) : '';
  const selo = seloSaldoERP(st, data);
  const antes = objeto(o.erpComSaldo) ? o.erpComSaldo : null;
  if (antes && antes.selo === selo) return null;
  const mesmaSituacao = !!antes && situacaoERP(antes.status) === st;
  return { ...o, erpComSaldo: { status: st, dataEntregue: data, selo, desde: String((mesmaSituacao && antes.desde) || agora), em: String(agora) } };
}
/* A PORTA DO APARELHO (pcp-sync). erpComSaldo é só do servidor: fica o
   gravado, sempre. erpSaldoDecisao é o "Manter aberta" da gestão: o aparelho
   manda {tipo:'manter', selo} e o servidor carimba quem (ID do RH) e quando.
   Só admin e pcp decidem; o resto fica com o gravado, com aviso. A mesma
   decisão para o mesmo selo não recarimba. Ausente não apaga. */
export const DECISOES_SALDO_ERP = ['manter'];
export function guardarSaldoERP(os, antes, { pode = false, avisar = false, autor = {}, agora = '' } = {}) {
  if (!objeto(os)) return { os, aviso: '', decidiu: false };
  const out = { ...os };
  if (objeto(antes?.erpComSaldo)) out.erpComSaldo = antes.erpComSaldo; else delete out.erpComSaldo;
  const gravada = objeto(antes?.erpSaldoDecisao) ? antes.erpSaldoDecisao : null;
  const pedido = proprio(os, 'erpSaldoDecisao') ? os.erpSaldoDecisao : undefined;
  if (gravada) out.erpSaldoDecisao = gravada; else delete out.erpSaldoDecisao;
  const fica = aviso => ({ os: out, aviso: avisar ? aviso : '', decidiu: false });
  if (!objeto(pedido)) return fica('');
  const tipo = String(pedido.tipo ?? '').trim(), selo = String(pedido.selo ?? '').trim();
  if (gravada && gravada.tipo === tipo && gravada.selo === selo) return fica('');
  /* Decisão já carimbada (tem `em`) é eco de uma cópia, não decisão nova: a
     cópia velha de uma aba não pode refazer, em nome de quem salvou, a
     decisão que outra pessoa trocou depois. A tela manda só {tipo, selo}. */
  if (String(pedido.em ?? '').trim()) return fica('');
  if (!pode) return fica('A decisão sobre o saldo que o ERP deu como entregue é da gestão (admin e PCP): não foi gravada.');
  if (!DECISOES_SALDO_ERP.includes(tipo) || !/^[A-Z]{1,20}\|(\d{4}-\d{2}-\d{2})?$/.test(selo)) return fica('A decisão sobre o saldo do ERP veio incompleta: não foi gravada.');
  out.erpSaldoDecisao = { tipo, selo, por: String(autor?.nome ?? '').trim().slice(0, 80),
    porId: ehIdPessoa(autor?.porId) ? String(autor.porId).trim() : '', em: String(agora ?? '') };
  return { os: out, aviso: '', decidiu: true };
}
/* CAMPOS DA GESTÃO NA O.S. (F01, 29/09/2026). Lista ÚNICA dos campos que as
   próximas fatias põem dentro da O.S. (alocação F08, prazo e retorno F15,
   ocorrências e abonos F17/F18, cancelamento e O.S. original F24). Ela nasce
   antes deles de propósito: a baixa do ERP, o esqueleto da reimportação e a
   tela de uma versão que ainda não conhece o campo gravam a O.S. INTEIRA, e
   apagariam a alocação calados. Nesta fatia nenhum valor novo é aceito:
   a porta só preserva o gravado e deixa a gestão limpar de propósito.
   Cada fatia que abre um campo o faz com uma regra própria, DEPOIS desta
   (F15: carimbarRetornoPrevisto e carimbarPrazoCombinado; F16:
   carimbarCancelamento, em _shared/pcp-status.mjs).
   Toda a lista entra no diário (CAMPOS_AUDITADOS). */
export const CAMPOS_GESTAO = ['alocacao', 'alocacaoLog', 'prazoCombinado', 'retornoPrevisto', 'retornoConferido', 'ocorrencias', 'abonos', 'cancelamento', 'osOriginalId'];
// O log da alocação é histórico: nem a gestão o apaga com null. O prazo
// combinado também não: mudar o prazo exige motivo, e o único caminho é o
// pedido { corrigir: true, data, motivo } (revisão da F15). O cancelamento
// também não (F16): cancelar e desfazer são pedidos explícitos
// ({ cancelar: true, motivo } e { desfazer: true }, carimbarCancelamento em
// _shared/pcp-status.mjs), e o desfeito fica guardado com quem desfez.
const GESTAO_SO_ACRESCIMO = new Set(['alocacaoLog', 'prazoCombinado', 'cancelamento']);
const vazioGestao = v => v == null || v === '' || (Array.isArray(v) && !v.length) || (objeto(v) && !Object.keys(v).length);
// Algum campo da gestão preenchido = a O.S. tem trabalho (o esqueleto do ERP não passa por cima).
export const temCampoGestao = o => !!o && CAMPOS_GESTAO.some(c => !vazioGestao(o[c]));
/* AUSENTE NÃO É APAGAR; VAZIO PRESENTE É. O campo que não veio fica como
   estava gravado: tela que não conhece o campo não o manda. O campo que veio
   VAZIO (null, '', [] ou {}), de quem pode limpar (a gestão: admin e pcp), é
   limpeza de propósito (desfazer um cancelamento, trocar para "Cliente
   retira", tirar o retorno previsto) e grava null. O '' é o jeito da casa de
   desfazer (aptoPor = '', finalizadoPor = ''): tratá-lo como "não mexe"
   engolia o desfazer calado (revisão da F01). Valor novo ainda não entra
   (F01): fica o gravado, e o que não estava gravado não nasce do aparelho. */
export function preservarAusentes(os, antes, { podeLimpar = false } = {}, campos = CAMPOS_GESTAO) {
  const r = { ...os };
  for (const c of campos) {
    const tinha = proprio(antes, c);
    if (podeLimpar && proprio(os, c) && vazioGestao(os[c]) && !GESTAO_SO_ACRESCIMO.has(c)) {
      if (tinha) r[c] = null; else delete r[c];
      continue;
    }
    if (tinha) r[c] = antes[c]; else delete r[c];
  }
  return r;
}
/* PRAZO COMBINADO E RETORNO PREVISTO (F15, 29/09/2026). Decisões do dono:
   - O PRAZO é a PRIMEIRA data agendada no PCP, congelada. O ERP não define
     prazo: a importação põe a previsão do ERP em instalacao.data, e essa data
     não é agenda de ninguém. Remarcar não move o prazo (a remarcação pedida
     pelo cliente vira abono, na F17).
   - O RETORNO PREVISTO é a hora DIGITADA pela gestão, por dia da agenda, sem
     padrão por período. Sem hora digitada, não há perda por retorno antecipado.
   Os dois moram no topo da O.S., fora de instalacao: mexer em instalacao zera
   a confirmação do cliente e o carro liberado. A mesma régua de leitura está
   no operacao.js (OPERACAO.prazoCombinadoDe e retornosPrevistos), e um teste
   confere as duas cópias. */
const DIA_F15 = /^\d{4}-\d{2}-\d{2}$/;
const HORA_F15 = /^([01]\d|2[0-3]):[0-5]\d$/;
// Dia de calendário que existe, entre 2000 e 2100: "0002-08-05" (o ano pela
// metade que o campo de data manda enquanto se digita) não vira prazo.
export function diaPlausivel(v) {
  const s = String(v ?? '').trim().slice(0, 10);
  if (!DIA_F15.test(s) || s < '2000-01-01' || s > '2100-12-31') return '';
  const t = Date.parse(s + 'T12:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s ? s : '';
}
/* A PRIMEIRA DATA AGENDADA NO PCP, na leitura. Ordem:
   1. o prazo gravado (a O.S. nova o grava quando ganha a primeira data; a
      antiga o grava de passagem, na primeira gravação que mudaria o prazo
      lido: carimbarPrazoCombinado);
   2. a marca "sem prazo" (fonte PRAZO_SEM_AGENDA): a O.S. já estava entregue
      quando ganhou data ou equipe no PCP; não há prazo combinado, e a leitura
      não deriva outro;
   3. o histórico de remarcações (agendaLog): o `de` da primeira remarcação
      (o que valia antes dela) ou a primeira data remarcada. O `de` que é a
      previsão do ERP numa O.S. importada (do ERP ou do PDF do ERP) não conta:
      era o que a importação pôs, não o que o PCP combinou;
   4. a data atual, quando é agenda de gente (agendaDeGente).
   Sem nada disso, null: a O.S. ainda não tem prazo combinado.
   O histórico guarda as últimas 40 remarcações; com mais que isso, o começo
   se perde (limite conhecido, raro; a O.S. que passa por lá grava o prazo
   antes de perder). */
export const PRAZO_SEM_AGENDA = 'semAgenda';
/* A data atual é agenda de gente: O.S. feita no PCP, equipe escalada, ou data
   diferente da previsão do ERP. A previsão que o ERP pôs em instalacao.data,
   sem equipe, não é agenda de ninguém. */
export function agendaDeGente(o) {
  const atual = diaPlausivel(o?.instalacao?.data);
  if (!atual) return '';
  const doERP = !!(o?.origemMubisys || o?.origemPDF);
  const comEquipe = (Array.isArray(o?.equipe) ? o.equipe : []).some(x => String(x ?? '').trim());
  return !doERP || comEquipe || atual !== diaPlausivel(o?.previsaoEntrega) ? atual : '';
}
export function prazoCombinadoDe(o) {
  const pc = o?.prazoCombinado;
  const gravado = diaPlausivel(objeto(pc) ? pc.data : pc);
  if (gravado) return { data: gravado, fonte: objeto(pc) && pc.fonte ? String(pc.fonte) : 'agenda', derivado: false };
  if (objeto(pc) && pc.fonte === PRAZO_SEM_AGENDA) return null;
  const doERP = !!(o?.origemMubisys || o?.origemPDF);
  const previsaoERP = diaPlausivel(o?.previsaoEntrega);
  const log = (Array.isArray(o?.agendaLog) ? o.agendaLog : []).filter(objeto);
  if (log.length) {
    const de = diaPlausivel(log[0].de);
    if (de && !(doERP && de === previsaoERP)) return { data: de, fonte: 'agendaLog', derivado: true };
    for (const x of log) { const d = diaPlausivel(x.data); if (d) return { data: d, fonte: 'agendaLog', derivado: true }; }
  }
  const atual = agendaDeGente(o);
  return atual ? { data: atual, fonte: 'agenda', derivado: true } : null;
}
/* OS RETORNOS PREVISTOS, um por dia da agenda: [{dia, hora, saida}] em ordem
   de dia (hora = retorno previsto; saida = saída prevista, opcional). Aceita
   também o formato de um dia só ({dia, hora}). Entrada sem dia ou sem hora
   válida fica de fora. */
export function retornosPrevistos(o) {
  const v = o?.retornoPrevisto;
  const lista = Array.isArray(v) ? v : objeto(v) ? [v] : [];
  const porDia = new Map();
  for (const e of lista) {
    if (!objeto(e)) continue;
    const dia = diaPlausivel(e.dia), hora = HORA_F15.test(String(e.hora ?? '')) ? String(e.hora) : '';
    if (!dia || !hora) continue;
    const saida = HORA_F15.test(String(e.saida ?? '')) && String(e.saida) < hora ? String(e.saida) : '';
    porDia.set(dia, { ...e, dia, hora, saida });
  }
  return [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia));
}
// Os dias da agenda (a mesma conta do OPERACAO.diasAgenda): o retorno previsto só vale neles.
export function diasAgendaF15(o) {
  const d = diaPlausivel(o?.instalacao?.data);
  if (!d || o?.tipo === 'interno') return [];
  const dur = Math.min(366, Math.max(1, Math.floor(Number(o?.instalacao?.duracaoDias) || 1)));
  const t = new Date(d + 'T12:00:00Z'), out = [];
  for (let i = 0; i < dur; i++) { out.push(t.toISOString().slice(0, 10)); t.setUTCDate(t.getUTCDate() + 1); }
  return out;
}
const carimboF15 = (autor, agora) => ({
  por: String(autor?.nome ?? '').slice(0, 120), porConta: String(autor?.login ?? '').slice(0, 120),
  porId: ehIdPessoa(autor?.porId) ? String(autor.porId).trim() : '', em: String(agora ?? ''),
});
const diaBR = d => d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '';
/* GRAVAR O RETORNO PREVISTO (roda depois do preservarAusentes). `veio` é o
   que o aparelho mandou (undefined = não mandou). Só admin e pcp gravam
   (`pode`); para os outros fica o gravado, e quem tem senha ouve o porquê
   (`avisar`). O vazio de propósito já foi tratado pelo preservarAusentes.
   Cada dia leva o carimbo do servidor (por, porConta, porId, em); o dia que
   voltou igual mantém o carimbo de quem digitou. Dia fora do formato ou com a
   saída depois do retorno não entra e não apaga o gravado daquele dia: vira
   aviso, nunca 422 (um 422 prende a fila do aparelho). Devolve { os, avisos }. */
export function carimbarRetornoPrevisto(veio, os, antes, autor, agora, { pode = false, avisar = false } = {}) {
  const r = { ...os }, avisos = [];
  if (veio === undefined || vazioGestao(veio)) return { os: r, avisos };
  const gravados = retornosPrevistos(antes);
  const semCarimbo = l => canon(l.map(e => ({ dia: e.dia, hora: e.hora, saida: e.saida || '' })));
  if (!pode) {
    if (avisar && semCarimbo(retornosPrevistos({ retornoPrevisto: veio })) !== semCarimbo(gravados))
      avisos.push('O retorno previsto não foi trocado: só a gestão do PCP (admin ou pcp) digita o retorno previsto.');
    return { os: r, avisos };
  }
  const lista = Array.isArray(veio) ? veio : objeto(veio) ? [veio] : null;
  if (!lista) { avisos.push('O retorno previsto não foi gravado: formato inválido.'); return { os: r, avisos }; }
  const antesPorDia = new Map(gravados.map(e => [e.dia, e]));
  const agenda = diasAgendaF15(r);
  const porDia = new Map();
  let lixo = 0;
  for (const e of lista.slice(0, 62)) {
    if (!objeto(e)) { lixo++; continue; }
    const dia = diaPlausivel(e.dia);
    const hora = String(e.hora ?? '').trim(), saida = String(e.saida ?? '').trim();
    if (!dia) { lixo++; avisos.push('Um retorno previsto sem dia válido ficou de fora.'); continue; }
    // Dia sem retorno digitado: não há retorno previsto nele (sem perda).
    if (!hora) continue;
    const manter = () => { if (antesPorDia.has(dia)) porDia.set(dia, antesPorDia.get(dia)); };
    if (!HORA_F15.test(hora) || (saida && !HORA_F15.test(saida))) {
      avisos.push(`O retorno previsto de ${diaBR(dia)} não foi gravado: hora inválida.`); manter(); continue;
    }
    if (saida && saida >= hora) {
      avisos.push(`O retorno previsto de ${diaBR(dia)} não foi gravado: a saída prevista (${saida}) precisa ser antes do retorno (${hora}).`); manter(); continue;
    }
    const velho = antesPorDia.get(dia);
    if (velho && velho.hora === hora && (velho.saida || '') === saida) { porDia.set(dia, velho); continue; }
    // Hora nova só num dia da agenda: a digitada num dia que a O.S. já não tem
    // (a data mudou com a ficha aberta) sumiria da tela e não valeria em dia nenhum.
    if (!agenda.includes(dia)) {
      avisos.push(`O retorno previsto de ${diaBR(dia)} não foi gravado: o dia não está na agenda da O.S.`); manter(); continue;
    }
    porDia.set(dia, { dia, hora, saida, ...carimboF15(autor, agora) });
  }
  const nova = [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia));
  // Envio que só trouxe lixo não apaga o que estava gravado.
  if (!nova.length && lixo) return { os: r, avisos };
  if (nova.length) r.retornoPrevisto = nova;
  else if (proprio(antes, 'retornoPrevisto')) r.retornoPrevisto = null;
  else delete r.retornoPrevisto;
  return { os: r, avisos };
}
/* A CHEGADA CONFERIDA DO CARRO (F14, retornoConferido). É o check-in da
   gestão no Fechar o dia: o Thiago confere a hora em que o carro chegou, uma
   vez por volta, e o lote grava {dia, hora, fonte} em cada O.S. da volta. É
   a régua do retorno antecipado (F17): a hora digitada pelo instalador nunca
   decide. Regras (roda depois do preservarAusentes, que já pôs o gravado no
   lugar do ausente e limpou o vazio da gestão):
   - só admin e pcp gravam (`pode`); para os outros fica o gravado, e quem
     tem senha ouve o porquê (`avisar`). O toque parte do gravado na mescla;
   - o carimbo é do servidor: por, porConta e porId do crachá, recebidoEm do
     relógio daqui. O `em` (a hora da conferência, que pode ter sido feita sem
     rede) vem do aparelho só se for uma data válida e não depois de agora;
   - o mesmo dia e a mesma hora mantêm o carimbo de quem conferiu;
   - CÓPIA VELHA NÃO APAGA (F01): o que volta com o recebidoEm de uma versão
     que não é a gravada é a cópia de outra versão (aba antiga, Sobrescrever)
     e fica o gravado. A conferência nova vai sem recebidoEm;
   - dia ou hora inválidos: fica o gravado, com aviso. Nada aqui é 422.
   Devolve { os, avisos }. */
export const FONTES_RETORNO_CONFERIDO = ['lote', 'ficha'];
export function carimbarRetornoConferido(veio, os, antes, autor, agora, { pode = false, avisar = false } = {}) {
  const r = { ...os }, avisos = [];
  if (veio === undefined || vazioGestao(veio)) return { os: r, avisos };
  const gravado = objeto(antes?.retornoConferido) ? antes.retornoConferido : null;
  const manter = () => { if (gravado) r.retornoConferido = gravado; else if (proprio(antes, 'retornoConferido')) r.retornoConferido = antes.retornoConferido; else delete r.retornoConferido; };
  const v = objeto(veio) ? veio : {};
  const dia = diaPlausivel(v.dia), hora = HORA_F15.test(String(v.hora ?? '').trim()) ? String(v.hora).trim() : '';
  const igual = !!gravado && dia === String(gravado.dia ?? '') && hora === String(gravado.hora ?? '');
  if (igual) { r.retornoConferido = gravado; return { os: r, avisos }; }
  if (!pode) {
    if (avisar) avisos.push('A chegada conferida do carro não foi trocada: só a gestão do PCP (admin ou pcp) confere a chegada.');
    manter(); return { os: r, avisos };
  }
  const recebido = String(v.recebidoEm ?? '').trim();
  if (recebido && recebido !== String(gravado?.recebidoEm ?? '')) {
    if (avisar) avisos.push('A chegada conferida não foi trocada: este aparelho mandou a de uma versão anterior à gravada no servidor.');
    manter(); return { os: r, avisos };
  }
  if (!objeto(veio) || !dia || !hora) {
    avisos.push('A chegada conferida do carro não foi gravada: dia ou hora inválidos. Ficou a que estava gravada.');
    manter(); return { os: r, avisos };
  }
  const tEm = Date.parse(String(v.em ?? '')), tAgora = Date.parse(String(agora ?? ''));
  const em = Number.isFinite(tEm) && Number.isFinite(tAgora) && tEm <= tAgora ? new Date(tEm).toISOString() : String(agora ?? '');
  r.retornoConferido = {
    dia, hora, fonte: FONTES_RETORNO_CONFERIDO.includes(v.fonte) ? v.fonte : 'ficha',
    por: String(autor?.nome ?? '').slice(0, 120), porConta: String(autor?.login ?? '').slice(0, 120),
    porId: ehIdPessoa(autor?.porId) ? String(autor.porId).trim() : '', em, recebidoEm: String(agora ?? ''),
  };
  return { os: r, avisos };
}
/* GRAVAR O PRAZO COMBINADO (roda depois do preservarAusentes e do
   guardarAgendaLog). Revisão da F15 (29/09/2026):
   - CONGELADO DESDE O NASCIMENTO. O gravado não anda com a agenda, nem da
     mesma conta logo depois (a conta pcp é uma só no PC da fábrica: agendar,
     ligar para o cliente e remarcar a pedido dele é justamente o abono).
     Erro de digitação se conserta pela correção com motivo.
   - NASCE da data que a O.S. tem AGORA, quando ela vira agenda de gente
     (agendaDeGente), nunca do histórico que o aparelho mandou.
   - O.S. ANTIGA (sem prazo gravado, com prazo lido): a gravação que mudaria o
     prazo lido (remarcar, limpar a data, tirar a equipe) grava antes o prazo
     lido da versão GRAVADA, com lidoDe. Só a O.S. que está sendo mexida é
     gravada, sem gravação em lote.
   - ENTREGUE ANTES DE AGENDAR (finalizada, baixada pelo ERP ou com entrega
     lançada): não há prazo combinado depois da entrega. Grava a marca "sem
     prazo" (PRAZO_SEM_AGENDA), para a leitura não derivar a previsão do ERP.
   - CORRIGIR é pedido explícito, { corrigir: true, data, motivo }, só de admin
     e pcp, com motivo de 15 letras ou mais; fica no diário com o antes e o
     depois. Valor do aparelho que não é pedido de correção nunca entra; o
     crachá de toque não faz nascer nem corrige. null e '' não apagam
     (preservarAusentes).
   A origem (ERP, PDF) e a previsão do ERP valem as da versão gravada: o
   aparelho que as tira não faz a previsão virar agenda.
   OS DIAS CONGELAM JUNTO (revisão da F16): o prazo de uma O.S. de vários
   dias vai até o último dia da duração, e a duração de agora movia o prazo
   congelado (5 dias escritos depois viravam "no prazo" o que atrasou). O
   carimbo leva `dias`, a duração de quando o prazo nasceu; a correção leva
   os dias do pedido ou a duração de agora. O carimbo antigo, sem os dias,
   ganha os da versão GRAVADA na gravação que mudaria a duração, como o
   prazo lido da O.S. antiga (o resto do carimbo fica como estava).
   Devolve { os, avisos }. */
export const MOTIVO_PRAZO_MIN = 15;
// A duração da agenda em dias (a mesma conta do diasAgendaF15); cliente retira: 1.
export const duracaoF15 = o => o?.tipo === 'interno' ? 1 : Math.min(366, Math.max(1, Math.floor(Number(o?.instalacao?.duracaoDias) || 1)));
const diasValidosF15 = v => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 366 ? v : 0;
export const pedeCorrecaoPrazo = v => objeto(v) && v.corrigir === true;
// Entregue: finalizada, ou baixada pelo ERP ou com entrega lançada e não reaberta depois.
const entregueF15 = o => !!(o && (o.finalizadaEm
  || (!o.reabertaEm && (o.baixaAutoERP || (objeto(o.entregaLancada) ? o.entregaLancada.data : o.entregaLancada)))));
export function carimbarPrazoCombinado(veio, os, antes, autor, agora, { podeCorrigir = false, toque = false, avisar = false } = {}) {
  const r = { ...os }, avisos = [];
  const gravadoCru = proprio(os, 'prazoCombinado') ? os.prazoCombinado : undefined;
  const gravado = objeto(gravadoCru) && diaPlausivel(gravadoCru.data) ? gravadoCru : null;
  const temGravado = !!diaPlausivel(objeto(gravadoCru) ? gravadoCru.data : gravadoCru);
  const semAgenda = !temGravado && objeto(gravadoCru) && gravadoCru.fonte === PRAZO_SEM_AGENDA;
  if (pedeCorrecaoPrazo(veio) && !toque) {
    const data = diaPlausivel(veio.data), motivo = String(veio.motivo ?? '').trim().slice(0, 300);
    const dias = diasValidosF15(veio.dias) || duracaoF15(r);
    // A correção gravada antes desta revisão (sem os dias) é a mesma quando o pedido também não diz os dias.
    const mesmosDias = gravado && (gravado.dias === dias || (!diasValidosF15(gravado.dias) && !diasValidosF15(veio.dias)));
    const igual = gravado && gravado.fonte === 'correcao' && gravado.data === data && String(gravado.motivo ?? '') === motivo && mesmosDias;
    if (igual) return { os: r, avisos };
    if (!podeCorrigir) { if (avisar) avisos.push('O prazo combinado não foi corrigido: só a gestão do PCP (admin ou pcp) corrige o prazo.'); }
    else if (!data) avisos.push('O prazo combinado não foi corrigido: a data não é válida.');
    else if (motivo.length < MOTIVO_PRAZO_MIN) avisos.push(`O prazo combinado não foi corrigido: escreva o motivo com ${MOTIVO_PRAZO_MIN} letras ou mais.`);
    else {
      const original = diaPlausivel(gravado?.original) || (temGravado ? diaPlausivel(objeto(gravadoCru) ? gravadoCru.data : gravadoCru) : '')
        || (semAgenda ? '' : prazoCombinadoDe(antes || r)?.data || '');
      r.prazoCombinado = { data, dias, fonte: 'correcao', motivo, ...(original ? { original } : {}), ...carimboF15(autor, agora) };
      return { os: r, avisos };
    }
  }
  // O carimbo sem os dias (antes desta revisão) congela os da versão gravada quando a duração muda.
  if (gravado && !diasValidosF15(gravado.dias) && antes && duracaoF15(r) !== duracaoF15(antes)) {
    r.prazoCombinado = { ...gravado, dias: duracaoF15(antes) };
    return { os: r, avisos };
  }
  if (temGravado || semAgenda || toque) return { os: r, avisos };
  const fixo = antes ? { origemMubisys: antes.origemMubisys || r.origemMubisys, origemPDF: antes.origemPDF || r.origemPDF, previsaoEntrega: proprio(antes, 'previsaoEntrega') ? antes.previsaoEntrega : r.previsaoEntrega } : {};
  const lidoAntes = antes ? prazoCombinadoDe({ ...antes, prazoCombinado: null }) : null;
  const depois = { ...r, ...fixo, prazoCombinado: null };
  if (lidoAntes) {
    if (prazoCombinadoDe(depois)?.data !== lidoAntes.data || duracaoF15(depois) !== duracaoF15(antes))
      r.prazoCombinado = { data: lidoAntes.data, dias: duracaoF15(antes), fonte: 'agenda', lidoDe: lidoAntes.fonte, ...carimboF15(autor, agora) };
    return { os: r, avisos };
  }
  const nasce = agendaDeGente(depois);
  if (!nasce) return { os: r, avisos };
  if (entregueF15(antes) || entregueF15(r)) {
    r.prazoCombinado = { data: '', fonte: PRAZO_SEM_AGENDA, motivo: 'A O.S. já estava entregue quando ganhou data ou equipe no PCP.', ...carimboF15(autor, agora) };
    return { os: r, avisos };
  }
  r.prazoCombinado = { data: nasce, dias: duracaoF15(depois), fonte: 'agenda', ...carimboF15(autor, agora) };
  return { os: r, avisos };
}
/* O HISTÓRICO DE REMARCAÇÕES (agendaLog) SÓ CRESCE, e só quando a data muda.
   O prazo das O.S. sem prazo gravado é lido dele, então ele não pode ser
   reescrito pelo aparelho (revisão da F15: montagem e operação moviam o prazo
   reescrevendo o histórico, sem diário). Regra:
   - o trecho gravado não muda;
   - só entra entrada nova quando instalacao.data muda neste envio, e ela
     começa na data GRAVADA (`de`) e termina na data nova. As remarcações que o
     aparelho fez sem rede entram quando formam uma cadeia da data gravada até
     a nova (com o `em` do aparelho, se não for do futuro); senão entra uma
     entrada só, com o carimbo do servidor. `por` é sempre o crachá;
   - O.S. nova: entra o histórico que o aparelho montou antes de a O.S.
     existir no servidor, se ele terminar na data que chega;
   - a máquina (integração) não escreve histórico.
   Guarda as últimas 40, como a tela. Devolve a O.S. */
export const AGENDA_LOG_MAX = 40;
const DIA_OU_VAZIO = v => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v);
export function guardarAgendaLog(os, antes, { por = '', agora = '', maquina = false } = {}) {
  const r = { ...os };
  const gravado = antes && Array.isArray(antes.agendaLog) ? antes.agendaLog : null;
  const B = String(r?.instalacao?.data ?? '');
  const A = antes ? String(antes?.instalacao?.data ?? '') : null;
  const tAgora = Date.parse(String(agora ?? ''));
  const emOk = em => { const t = Date.parse(String(em ?? '')); return Number.isFinite(t) && (!Number.isFinite(tAgora) || t <= tAgora + 5 * 60000); };
  const limpa = e => ({ de: String(e.de ?? ''), data: String(e.data ?? ''), em: emOk(e.em) ? String(e.em) : String(agora ?? ''), por: String(por ?? '').slice(0, 120) });
  // A cadeia que o aparelho mandou, do fim para trás, até a data gravada (A) ou, na O.S. nova, até onde ela se encadeia.
  const cadeia = () => {
    const N = (Array.isArray(os?.agendaLog) ? os.agendaLog : []).filter(objeto);
    const fim = N.length - 1;
    if (fim < 0 || String(N[fim].data ?? '') !== B) return null;
    for (let i = fim; i >= 0 && fim - i < AGENDA_LOG_MAX; i--) {
      const e = N[i];
      if (!DIA_OU_VAZIO(String(e.de ?? '')) || !DIA_OU_VAZIO(String(e.data ?? ''))) return null;
      if (A !== null && String(e.de ?? '') === A) return N.slice(i, fim + 1).map(limpa);
      if (i === 0 || String(N[i - 1].data ?? '') !== String(e.de ?? '')) return A === null ? N.slice(i, fim + 1).map(limpa) : null;
    }
    return null;
  };
  let novos = [];
  if (A === null) novos = cadeia() || [];
  else if (!maquina && A !== B) novos = cadeia() || [{ de: A, data: B, em: String(agora ?? ''), por: String(por ?? '').slice(0, 120) }];
  const lista = [...(gravado || []), ...novos].slice(-AGENDA_LOG_MAX);
  if (lista.length || gravado) r.agendaLog = lista;
  else delete r.agendaLog;
  return r;
}
/* ENTREGA LANÇADA À MÃO (F01). Quem lança é quem tem o botão "Lançar entrega"
   e entrou com senha (admin, pcp, operação e a conta de montagem); o toque sem
   senha não lança. O carimbo é do servidor: `autor` sai do crachá (nome,
   login, ID do RH) e nada de por/porId/em que o aparelho escreveu entra. Só a
   data é do formulário. A mesma data regravada mantém o carimbo de quem
   lançou; ausente mantém o gravado. Data que não é dia válido não derruba o
   envio: fica a gravada, com aviso.
   NULL NÃO DESFAZ (revisão da F01). O esqueleto da O.S. (novaOS) nasce com
   entregaLancada: null, e toda cópia que não viu o lançamento o manda: o
   "Sobrescrever" de um tablet apagava a entrega do PCP. Desfazer é um pedido
   EXPLÍCITO, { desfazer: true }, e só de admin e pcp (`podeDesfazer`).
   `autor` null = quem enviou não pode lançar. Devolve { os, aviso }. */
const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const pedeDesfazer = v => objeto(v) && v.desfazer === true;
export const entregaLancadaMudou = (os, antes) => proprio(os, 'entregaLancada') && objeto(os.entregaLancada) && !pedeDesfazer(os.entregaLancada)
  && String(os.entregaLancada.data ?? '') !== String(antes?.entregaLancada?.data ?? '');
/* O.S. CANCELADA (revisão da F16): `cancelada` é o cancelamento que vale
   para este envio (o mesmo das marcas de item: o gravado, ou o desfeito
   neste envio; o pedido de cancelar só vale depois da gravação). Nela o
   lançamento não muda: fica o gravado, com aviso. A aba v139 não conhece o
   cancelamento e lançava a entrega de uma cancelada calada. */
export function carimbarEntregaLancada(os, antes, autor, em, { podeDesfazer = false, cancelada = false } = {}) {
  const r = { ...os };
  const manter = () => { if (proprio(antes, 'entregaLancada')) r.entregaLancada = antes.entregaLancada; else delete r.entregaLancada; };
  if (!proprio(os, 'entregaLancada')) { manter(); return { os: r, aviso: '' }; }
  const v = os.entregaLancada, gravada = objeto(antes?.entregaLancada) ? antes.entregaLancada : null;
  if (!autor) {
    if (!(v == null && !gravada)) manter();
    return { os: r, aviso: '' };
  }
  if (cancelada) {
    const dataVeio = objeto(v) ? String(v.data ?? '').trim() : '';
    const muda = pedeDesfazer(v) ? !!gravada : !!dataVeio && !(gravada && gravada.data === dataVeio);
    manter();
    return { os: r, aviso: muda ? 'A entrega não foi lançada: a O.S. está cancelada. Para lançar, desfaça o cancelamento da O.S.' : '' };
  }
  if (pedeDesfazer(v)) {
    if (podeDesfazer && gravada) r.entregaLancada = null; else manter();
    return { os: r, aviso: '' };
  }
  // Vazio é "não sei do lançamento", não "desfaça": fica o gravado.
  if (v == null || v === '') { if (gravada) r.entregaLancada = gravada; return { os: r, aviso: '' }; }
  const data = objeto(v) ? String(v.data ?? '').trim() : '';
  if (!DIA_ISO.test(data) || !Number.isFinite(Date.parse(data + 'T12:00:00Z'))) {
    manter();
    return { os: r, aviso: 'A entrega não foi lançada: a data não é válida. Ficou a que estava gravada.' };
  }
  if (gravada && gravada.data === data) { r.entregaLancada = gravada; return { os: r, aviso: '' }; }
  r.entregaLancada = {
    data, por: String(autor.nome ?? '').slice(0, 120), porConta: String(autor.login ?? '').slice(0, 120),
    porId: ehIdPessoa(autor.porId) ? String(autor.porId).trim() : '', em,
  };
  return { os: r, aviso: '' };
}
/* FINALIZADA PELO CELULAR (revisão da E5, 30/09/2026). Decisão do dono: a
   palavra do instalador é DECLARAÇÃO. A O.S. que o celular finaliza sem tocar
   no Instalado contava o implícito como entregue CONFERIDO (a finalização da
   gestão), e a do instalador que tocou em cada item, como declarado. Agora o
   servidor carimba `finalizadaPorCampo` {finalizadaEm, por, porId, em} quando
   quem põe a finalização é o celular: o crachá sem senha ou a montagem com
   senha (o papel 'montagem', o mesmo que o motor trata como celular). O motor
   (entregaImplicita) manda o implícito dessa finalização para as
   declarações. Precisa ser aqui: o celular v139 continua finalizando sem
   marca nenhuma.
   Campo do SERVIDOR, protegido como os da gestão (F01): o que o aparelho
   mandou nele nunca entra (nem da gestão), e a aba que não o conhece não o
   apaga. Vale para a finalização de mesmo finalizadaEm: a gestão que reabre e
   finaliza de novo põe uma finalização dela, e o carimbo antigo fica sem
   efeito (o Desfazer do reabrir devolve a do celular, e ele volta a valer).
   `autor` = { nome, porId } quando quem envia é o celular; null nos outros.
   Devolve a O.S. */
export const finalizacaoMudou = (os, antes) => !!String(os?.finalizadaEm ?? '').trim() && String(os?.finalizadaEm ?? '').trim() !== String(antes?.finalizadaEm ?? '').trim();
export function carimbarFinalizacaoCampo(os, antes, autor, em) {
  const r = { ...os };
  if (objeto(antes?.finalizadaPorCampo)) r.finalizadaPorCampo = antes.finalizadaPorCampo; else delete r.finalizadaPorCampo;
  if (autor && finalizacaoMudou(os, antes)) {
    r.finalizadaPorCampo = {
      // Sem corte: o motor compara este texto com o finalizadaEm gravado.
      finalizadaEm: String(os.finalizadaEm).trim(), por: String(autor.nome ?? '').trim().slice(0, 120),
      porId: ehIdPessoa(autor.porId) ? String(autor.porId).trim() : '', em: String(em ?? ''),
    };
  }
  return r;
}
/* O ID DE QUEM MARCOU (F01). Cada carimbo de nome da ficha ganha, ao lado, o
   ID do RH (<campo>Id). O ID nunca vem do aparelho. O par diz qual hora
   acompanha o nome: refazer com o mesmo nome em outra hora é marca nova.

   O ID PERTENCE AO PAR (nome, hora), NÃO A QUEM ENVIOU (revisão da F01). Dar o
   ID do crachá a todo carimbo que "mudou" colava o ID de quem clicou no nome
   de outra pessoa: o Desfazer de "Voltar ao PCP" devolve aptoPor e aptoEm de
   quem liberou; o "Sobrescrever" com cópia antiga revive a liberação do carro
   de outro; o "Conferido por" do espelho é texto livre. Agora:
   - o servidor guarda, em `idsDosCarimbos`, os pares (nome, hora) que ele
     mesmo carimbou e o ID de cada um (os últimos por campo);
   - par conhecido (a marca que volta com o Desfazer) reusa o ID dele;
   - marca nova só ganha o ID do crachá quando o nome É o do crachá (nome ou
     login; "... por <nome do crachá>" da baixa confirmada também);
   - nome de outra pessoa, sem par conhecido: ID vazio, nunca adivinhado;
   - marca que ninguém carimbou aqui (o pcp-mubisys escreve finalizadoPor por
     fora) não herda o ID gravado ao lado: sem par conhecido, ID vazio.
   A memória também nunca vem do aparelho: parte sempre do gravado. */
export const MEMORIA_IDS = 'idsDosCarimbos';
const MEMORIA_POR_CAMPO = 4;
const ehDoCracha = (nome, autor) => {
  const n = normPessoa(nome);
  return !!n && [autor?.nome, autor?.login].map(normPessoa).filter(Boolean)
    .some(c => n === c || n.endsWith(' por ' + c));
};
export const CARIMBOS_COM_ID = {
  aptoPor: 'aptoEm', confPor: 'confEm', carroLiberadoPor: 'carroLiberadoEm', finalizadoPor: 'finalizadaEm',
  paradoClientePor: 'paradoClienteEm', reabertaPor: 'reabertaEm', erpConferidoPor: 'erpConferidoEm',
  saidaPor: 'saidaRecebidoEm', retornoPor: 'retornoRecebidoEm',
  embarqueConferidoPor: '', produtosConferidosPor: '', ferramentasConferidasPor: '', conferidoPor: '',
};
const textoCarimbo = v => String(v ?? '').trim();
const carimboMudou = (os, antes, c) => {
  const par = CARIMBOS_COM_ID[c];
  return textoCarimbo(os?.[c]) !== textoCarimbo(antes?.[c]) || (!!par && textoCarimbo(os?.[par]) !== textoCarimbo(antes?.[par]));
};
export const carimbosQueMudaram = (os, antes) => Object.keys(CARIMBOS_COM_ID).filter(c => textoCarimbo(os?.[c]) && carimboMudou(os, antes, c));
/* `autor` = { nome, login, porId } do crachá (autorAuditoria do pcp-sync). */
export function carimbarIds(os, antes, autor = {}) {
  const r = { ...os };
  const id = ehIdPessoa(autor?.porId) ? String(autor.porId).trim() : '';
  const memAntes = objeto(antes?.[MEMORIA_IDS]) ? antes[MEMORIA_IDS] : {};
  const memoria = {};
  for (const c of Object.keys(CARIMBOS_COM_ID)) {
    const k = c + 'Id', par = CARIMBOS_COM_ID[c];
    const lista = (Array.isArray(memAntes[c]) ? memAntes[c] : [])
      .filter(p => objeto(p) && ehIdPessoa(p.id) && typeof p.nome === 'string')
      .map(p => ({ nome: p.nome, em: String(p.em ?? ''), id: String(p.id) }));
    const nome = textoCarimbo(os?.[c]);
    let v = '';
    if (nome) {
      const chave = normPessoa(nome), em = par ? textoCarimbo(os?.[par]) : '';
      const conhecido = lista.find(p => p.nome === chave && p.em === em);
      if (conhecido) v = conhecido.id;
      else if (carimboMudou(os, antes, c) && ehDoCracha(nome, autor) && id) {
        v = id;
        lista.push({ nome: chave, em, id });
      }
    }
    if (v || proprio(antes, k) || proprio(os, k)) r[k] = v; else delete r[k];
    if (lista.length) memoria[c] = lista.slice(-MEMORIA_POR_CAMPO);
  }
  if (Object.keys(memoria).length) r[MEMORIA_IDS] = memoria; else delete r[MEMORIA_IDS];
  return r;
}
export const pedeConferencia = a => a && a.campo !== 'valorTotal' && a.antes != null && String(a.antes).trim() !== '';
export function atualizarOrigemERP(atual, remoto, em) {
  if (!atual?.origemMubisys || atual.finalizadaEm) return {registro: atual, alteracoes: []};
  const registro = {...atual}, alteracoes = [];
  for (const campo of CAMPOS_ERP) {
    if (!proprio(remoto, campo) || remoto[campo] == null) continue;
    const valor = remoto[campo];
    if (campo === 'valorTotal' && (!Number.isFinite(Number(valor)) || Number(valor) < 0)) continue;
    // Resposta incompleta não apaga a identificação; valor zero é válido.
    if (campo !== 'valorTotal' && String(valor).trim() === '') continue;
    if (igual(atual[campo], valor)) continue;
    alteracoes.push({campo, antes: atual[campo] ?? null, depois: valor});
    registro[campo] = valor;
  }
  if (alteracoes.length) {
    registro.erpAlteracoes = [...(atual.erpAlteracoes || []), {em, campos: alteracoes}].slice(-20);
    /* O SELO "conferir" só acende quando o ERP MUDOU um dado que já existia.
       Valor que chega pela primeira vez (antes vazio) e o valor em R$ (o card do
       PCP nem mostra) ficam registrados em erpAlteracoes, sem pedir conferência:
       depois da carga de 14/09 o selo estava aceso em metade dos cards e, selo
       em todo card, ninguém lê (auditoria de 23/09/2026). */
    if (alteracoes.some(pedeConferencia)) registro.erpConferirEm = em;
    registro.atualizadoEm = em;
    registro.atualizadoPor = 'Mubisys · atualização de origem';
    registro.rev = (Number(atual.rev) || 0) + 1;
  }
  return {registro, alteracoes};
}
// Mescla de três vias. Coleções com id são comparadas item a item; excluir ou
// alterar o mesmo item simultaneamente gera conflito, nunca vence por relógio.
export function mesclarConfiguracao(base, local, remoto) {
  const conflitos = [];
  function merge(b, l, r, caminho) {
    if (igual(l, b)) return r;
    if (igual(r, b) || igual(l, r)) return l;
    if (objeto(l) && objeto(r) && (objeto(b) || b === undefined)) {
      const result = {};
      for (const k of new Set([...Object.keys(b || {}), ...Object.keys(l), ...Object.keys(r)])) {
        const v = merge(b?.[k], l[k], r[k], caminho ? caminho + '.' + k : k);
        if (v !== undefined) result[k] = v;
      }
      return result;
    }
    const porId = a => Array.isArray(a) && a.every(x => objeto(x) && typeof x.id === 'string' && x.id) && new Set(a.map(x => x.id)).size === a.length;
    if (porId(l) && porId(r) && (porId(b) || b === undefined)) {
      const bm = new Map((b || []).map(x => [x.id,x])), lm = new Map(l.map(x => [x.id,x])), rm = new Map(r.map(x => [x.id,x]));
      return [...new Set([...rm.keys(), ...lm.keys(), ...bm.keys()])].map(id => merge(bm.get(id), lm.get(id), rm.get(id), caminho + '[' + id + ']')).filter(x => x !== undefined);
    }
    conflitos.push(caminho); return r;
  }
  const cfg = merge(base, local, remoto, '');
  return {cfg, conflitos};
}
export function validarMomentos(os) {
  for (const k of ['saidaEm','retornoEm']) if (os[k] && (!/^\d{4}-\d{2}-\d{2}T/.test(os[k]) || !Number.isFinite(Date.parse(os[k])))) return 'Data de saída ou retorno inválida.';
  if (os.saidaEm && os.retornoEm && Date.parse(os.retornoEm) < Date.parse(os.saidaEm)) return 'O retorno não pode ser anterior à saída.';
  return '';
}
export function carimbarExecucao(os, anterior, autor, em) {
  const r = {...os, atualizadoPor: autor};
  for (const tipo of ['saida','retorno']) {
    const campo = tipo + 'Em';
    if (os[campo] && os[campo] !== anterior?.[campo]) { r[tipo + 'Por'] = autor; r[tipo + 'RecebidoEm'] = em; }
    else { r[tipo + 'Por'] = anterior?.[tipo + 'Por'] || ''; r[tipo + 'RecebidoEm'] = anterior?.[tipo + 'RecebidoEm'] || ''; }
  }
  return r;
}
/* PESSOA = FICHA DO RH; O ID MANDA, O NOME SÓ SE EXIBE (ordem do dono,
   29/09/2026). CÓPIA da régua de operacao.js (resolverPessoas): o aparelho e
   esta porta precisam chegar à MESMA pessoa a partir do mesmo nome antigo, e
   tests/pessoas-id.test.cjs roda as duas sobre os mesmos casos. Mudou lá,
   muda aqui. */
export const normPessoa = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
export const ehIdPessoa = v => /^\d{6}$/.test(String(v ?? '').trim());
const id6 = v => { const d = String(v ?? '').replace(/\D/g, ''); return d.length === 6 ? d : d.length === 11 ? d.slice(0, 6) : ''; };
export function resolverPessoas(dados = {}) {
  const todas = Array.isArray(dados.pessoas) ? dados.pessoas : [];
  const fichas = todas.filter(p => p && ehIdPessoa(p.id));
  /* Contrato de freelancer ainda sem ID (sem CPF, ou CPF que não confere, F07)
     conta na ambiguidade e nunca é o resultado: "Lucas" com a ficha do Lucas e
     o contrato do Lucas Prado sem CPF já não é de ninguém, e não muda de dono
     no dia em que o RH preenche o CPF do contrato. */
  const semId = todas.filter(p => p && p.freelancer === true && !ehIdPessoa(p.id) && String(p.nome || '').trim());
  const candidatas = semId.length ? [...fichas, ...semId] : fichas;
  const porId = new Map();
  for (const p of fichas) if (!porId.has(p.id)) porId.set(p.id, p);
  const porChaveRH = new Map(fichas.filter(p => p.chave).map(p => [String(p.chave), p]));
  /* ID REPETIDO ENTRE FICHA E CONTRATO DE FREELANCER (F07, caminho B). O
     ID sai dos 6 primeiros dígitos do CPF, e a ficha de Colaboradores e o
     contrato de freelancer do RH são cadastros diferentes: dois CPFs podem
     começar igual. O servidor junta a MESMA pessoa (CPF inteiro igual) antes
     de mandar e marca `idRepetido` no resto; a régua também percebe o par
     sozinha. ID repetido nunca é o resultado de um nome: melhor "sem ficha"
     do que o ponto indo para a pessoa errada. Contrato com contrato do mesmo
     ID é a mesma pessoa renovada, não repetição. */
  const repetidos = new Set(fichas.filter(p => p.idRepetido === true).map(p => p.id));
  const tipoDoId = new Map();
  for (const p of fichas) {
    const t = p.freelancer === true ? 'contrato' : 'ficha';
    if (tipoDoId.has(p.id) && tipoDoId.get(p.id) !== t) repetidos.add(p.id);
    else if (!tipoDoId.has(p.id)) tipoDoId.set(p.id, t);
  }
  // Casamento automático com a régua de sempre do PCP -- apelido do RH, nome
  // completo, ou começo de nome que só uma ficha tem --, contado entre TODAS
  // as fichas, inclusive quem já saiu. Quem saiu nunca é o resultado: "Elias"
  // com um Elias desligado e outro na casa é ambíguo, e não do que ficou --
  // senão o crachá antigo do que saiu passava a abrir as O.S. do xará
  // (revisão de 29/09/2026). "Adriano" sozinho, com dois Adrianos, fica sem
  // ficha de propósito.
  const auto = texto => {
    const ap = normPessoa(texto), tokens = ap.split(' ');
    const um = achadas => achadas.length === 1 && ehIdPessoa(achadas[0].id) && !achadas[0].desligado && !repetidos.has(achadas[0].id) ? achadas[0] : null;
    const porPrefixo = lista => lista.filter(p => { const n = normPessoa(p.nome).split(' '); return tokens.every((t, i) => n[i] === t); });
    const porApelido = candidatas.filter(p => normPessoa(p.apelido) === ap);
    if (porApelido.length) {
      /* O apelido do CONTRATO não passa por cima do nome de outra pessoa
         (F07): o RH só barra apelido igual ao de outro cadastro, não ao
         primeiro nome de alguém. "Lucas" com a ficha do Lucas Ferreira e o
         contrato do Lucas Prado de apelido "lucas" é ambíguo; senão o
         histórico e o crachá do empregado passavam para o freelancer. */
      const alvo = porApelido.length === 1 && porApelido[0].freelancer === true ? porApelido[0] : null;
      if (alvo && porPrefixo(candidatas).some(p => p !== alvo && (!ehIdPessoa(p.id) || p.id !== alvo.id))) return null;
      return um(porApelido);
    }
    const porNome = candidatas.filter(p => normPessoa(p.nome) === ap);
    if (porNome.length) return um(porNome);
    return um(porPrefixo(candidatas));
  };
  // Vínculo salvo (Performance → "Conferir nomes do PCP × fichas do RH"):
  // decisão de gente, vale mais que o casamento. `semFicha` é a decisão de que
  // o nome NÃO é ninguém do RH (terceiro): ele nunca casa sozinho com um xará.
  // Dois vínculos diferentes para o mesmo nome = ambíguo, e ambíguo não escolhe.
  const vinculos = (Array.isArray(dados.vinculos) ? dados.vinculos : []).filter(v => v && typeof v === 'object');
  const salvos = new Map();
  for (const v of vinculos) {
    const ap = normPessoa(v.apelido || v.nomePCP);
    const p = porId.get(id6(v.id || v.idPessoa)) || porChaveRH.get(String(v.chave || '').trim());
    const id = v.semFicha === true ? '' : (p ? p.id : id6(v.id || v.idPessoa));
    if (!ap || (!id && v.semFicha !== true)) continue;
    salvos.set(ap, salvos.has(ap) && salvos.get(ap) !== id ? '' : id);
  }
  // Nome com decisão salva (vínculo ou "sem ficha") não muda quando o RH muda.
  const fixado = entrada => salvos.has(normPessoa(entrada));
  const memo = new Map();
  const idDe = entrada => {
    const s = String(entrada ?? '').trim();
    if (!s) return '';
    if (ehIdPessoa(s)) return s;
    const ap = normPessoa(s);
    // Vínculo salvo que aponta para ID repetido (ficha e contrato, F07) não
    // resolve: o ID não separa as duas pessoas, e o ponto iria para a errada.
    if (!memo.has(ap)) { const id = salvos.has(ap) ? salvos.get(ap) : (auto(s)?.id || ''); memo.set(ap, id && repetidos.has(id) ? '' : id); }
    return memo.get(ap);
  };
  const chave = entrada => { const s = String(entrada ?? '').trim(); return s ? (idDe(s) || 'nome:' + normPessoa(s)) : ''; };
  // Nome de exibição: a palavra que o PCP já usa (lista de instaladores,
  // depois vínculo salvo); senão o menor começo do nome completo que só
  // aquela ficha tem ("Lucas Gabriel", "Hélio").
  const rotulos = new Map();
  for (const n of Array.isArray(dados.lista) ? dados.lista : []) { const id = idDe(n); if (id && !rotulos.has(id)) rotulos.set(id, String(n).trim()); }
  for (const v of vinculos) { const id = idDe(v.apelido || v.nomePCP); if (id && !rotulos.has(id)) rotulos.set(id, String(v.apelido || v.nomePCP).trim()); }
  const curto = p => {
    const palavras = String(p.nome || '').trim().split(/\s+/).filter(Boolean);
    const alvo = palavras.map(normPessoa);
    for (let k = 1; k <= palavras.length; k++) {
      const pre = alvo.slice(0, k).join(' ');
      if (!fichas.some(q => q.id !== p.id && normPessoa(q.nome).split(' ').slice(0, k).join(' ') === pre)) return palavras.slice(0, k).join(' ');
    }
    return palavras.join(' ') || 'ID ' + p.id;
  };
  const nome = entrada => {
    const s = String(entrada ?? '').trim();
    const id = idDe(s);
    if (!id) return s;
    if (!rotulos.has(id)) { const p = porId.get(id); rotulos.set(id, p ? curto(p) : ehIdPessoa(s) ? 'ID ' + s : s); }
    return rotulos.get(id);
  };
  const pessoa = entrada => { const id = idDe(entrada); return id ? (porId.get(id) || { id, chave: '', nome: '', semFicha: true }) : null; };
  const repetido = id => repetidos.has(String(id ?? '').trim());
  return { idDe, chave, nome, pessoa, fixado, fichas, repetido };
}

/* FREELANCER PELO CONTRATO DO RH (F07, caminho B, decisão do dono de
   29/09/2026). Quem instala como freelancer mora no CONTRATO de freelancer do
   RH (coleção 'freelancers'), nunca numa ficha de Colaboradores: a tela de
   contratos existe para o prestador não entrar no quadro, na folha nem no
   organograma. O ID de 6 dígitos sai do CPF do contrato, como o da ficha.
   Só o servidor vê o CPF inteiro, e é aqui, com ele, que se separa:
   - MESMA PESSOA (CPF inteiro igual): o ex-colaborador que voltou como
     freelancer tem ficha desligada e contrato ativo com o mesmo ID. Conta uma
     vez só: vale o cadastro na ativa (contrato ativo com ficha fora da ativa
     = o contrato; ficha na ativa = a ficha, com aviso se o contrato também
     está ativo). Dois contratos do mesmo CPF (renovação em cadastro novo)
     também são um: fica o ativo, depois o de fim mais tarde.
   - PESSOAS DIFERENTES com os mesmos 6 primeiros dígitos: ID repetido. Os
     dois cadastros ficam marcados, a gestão recebe o aviso e nenhum nome leva
     a esse ID até o RH conferir (a régua acima trava).
   O que sai daqui NUNCA leva o CPF: só o ID, que já é o que a O.S. grava. */
const soDigitosCpf = v => String(v ?? '').replace(/\D/g, '');
/* O MESMO CPF VÁLIDO DO RH (impresilkrh, _shared/freelancerContrato.ts,
   cpfValido): 11 dígitos, os dois verificadores certos, e nunca todos iguais.
   Contrato com CPF que não confere não ganha ID aqui, como lá não ganha: o
   ID de um número errado seria o de outra pessoa, e "000.000.000-00" em dois
   prestadores juntaria os dois num só. */
export function cpfValido(v) {
  const n = soDigitosCpf(v);
  if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false;
  const dv = (base, peso) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (peso - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(n.slice(0, 9), 10) === Number(n[9]) && dv(n.slice(0, 10), 11) === Number(n[10]);
}
export function contratoAtivo(c, hoje = '') {
  if (!c || String(c.situacao || '') === 'encerrado') return false;
  const fim = String(c.contratoFim || '').slice(0, 10);
  return !/^\d{4}-\d{2}-\d{2}$/.test(fim) || !hoje || fim >= hoje;
}
export function juntarFreelancers(fichas, contratos, { hoje = '' } = {}) {
  const avisos = [], repetidos = new Set(), fichasFora = new Set();
  const lista = (Array.isArray(contratos) ? contratos : [])
    .filter(c => c && typeof c === 'object' && String(c.nome || '').trim() && String(c.id || '').trim())
    .map(c => {
      const cpf = soDigitosCpf(c.cpf), ok = cpfValido(cpf), ativo = contratoAtivo(c, hoje);
      return { cpf: ok ? cpf : '', entrada: {
        chave: 'freelancer:' + String(c.id).trim(), id: ok ? cpf.slice(0, 6) : '', nome: String(c.nome).trim(),
        apelido: String(c.apelido || '').trim(), funcao: String(c.funcao || '').trim(), freelancer: true,
        ativo, desligado: !ativo, contratoFim: String(c.contratoFim || '').slice(0, 10),
        situacaoContrato: String(c.situacao || '') === 'encerrado' ? 'encerrado' : ativo ? 'ativo' : 'vencido',
        ...(ok ? {} : { semCpf: true, ...(cpf ? { cpfInvalido: true } : {}) }) } };
    });
  // Renovação em cadastro novo: um contrato por CPF.
  const porCpf = new Map(), semCpf = [];
  for (const c of lista) {
    if (!c.cpf) { semCpf.push(c); continue; }
    const a = porCpf.get(c.cpf);
    const melhor = !a || (c.entrada.ativo && !a.entrada.ativo)
      || (c.entrada.ativo === a.entrada.ativo && c.entrada.contratoFim > a.entrada.contratoFim);
    if (melhor) porCpf.set(c.cpf, c);
  }
  const comId = (Array.isArray(fichas) ? fichas : []).filter(f => f && /^\d{6}$/.test(String(f.id || '')));
  /* Ficha com a situação "freelancer" no RH não está na ativa quando há
     contrato de freelancer ativo do mesmo CPF: a pessoa é freelancer, e a
     fonte do freelancer é o contrato (decisão do dono), com a tag e o fim do
     contrato. Sem contrato, a ficha continua valendo como sempre. */
  const naAtiva = f => !f.desligado && f.ativo !== false && String(f.statusId || '').trim() !== 'freelancer';
  const ficam = [];
  for (const c of porCpf.values()) {
    const mesma = comId.filter(f => soDigitosCpf(f.cpf) === c.cpf);
    if (mesma.length) {
      if (c.entrada.ativo && !mesma.some(naAtiva)) { mesma.forEach(f => fichasFora.add(String(f.chave))); ficam.push(c); }
      // Ficha e contrato ativos: vale a ficha até o RH acertar a SITUAÇÃO da
      // ficha. O aviso nunca manda encerrar o contrato, que é a fonte do freelancer.
      else if (c.entrada.ativo) avisos.push(`${c.entrada.nome} tem ficha na ativa em Colaboradores e contrato de freelancer ativo no RH. No PCP vale a ficha até o RH ajustar a situação dela: se a pessoa é freelancer, mude a situação da ficha para Freelancer (ou registre o desligamento) e o contrato passa a valer.`);
      continue;
    }
    ficam.push(c);
  }
  // Mesmos 6 dígitos, CPFs diferentes: entre ficha e contrato, ou entre dois contratos.
  const porId = new Map();
  for (const f of comId) if (!fichasFora.has(String(f.chave))) { const l = porId.get(f.id) || []; l.push({ nome: String(f.nome || ''), cpf: soDigitosCpf(f.cpf) }); porId.set(f.id, l); }
  const contratosPorId = new Map();
  for (const c of ficam) { const l = contratosPorId.get(c.entrada.id) || []; l.push(c); contratosPorId.set(c.entrada.id, l); }
  for (const [id, cs] of contratosPorId) {
    const outros = porId.get(id) || [];
    const cpfs = new Set([...outros.map(o => o.cpf), ...cs.map(c => c.cpf)]);
    if (cpfs.size < 2) continue;
    repetidos.add(id);
    const nomes = [...outros.map(o => `na ficha de ${o.nome}`), ...cs.map(c => `no contrato de freelancer de ${c.entrada.nome}`)];
    avisos.push(`O ID ${id} aparece em ${nomes.join(' e ')}, com CPFs diferentes. Ninguém é escolhido por esse ID até o RH conferir os CPFs.`);
  }
  const contratos2 = [...ficam, ...semCpf].map(c => repetidos.has(c.entrada.id) ? { ...c.entrada, idRepetido: true } : c.entrada);
  return { contratos: contratos2, fichasFora, repetidos, avisos };
}

/* A O.S. É DA EQUIPE DE QUEM? Pelo ID. O nome do crachá (o da lista de
   instaladores) passa pela régua de HOJE -- vínculo corrigido vale na hora --,
   e o `id` que o crachá novo traz só entra quando o nome deixou de levar a
   alguém (entrou um xará e o nome ficou ambíguo). Entrada da O.S. com ID
   compara ID; nome antigo compara pela pessoa a que ele leva e, sem ficha,
   pelo texto -- como sempre foi. Sem resolvedor (chamada antiga), só o texto. */
/* QUEM É O CRACHÁ DE TOQUE, em ID: a régua única da trava de equipe e do
   diário de auditoria. O nome passa pela régua de HOJE (vínculo corrigido
   vale na hora); o `id` assinado no crachá (vale 30 dias) só entra quando o
   nome não leva a ninguém e não tem decisão salva ("sem ficha" é terceiro:
   não herda o ID antigo). Duas réguas deixavam o diário dizer que alguém de
   fora da equipe mexeu na O.S. que a trava tinha aceitado como de outro
   (revisão da F03, 29/09/2026). */
export function idDoCracha(quem, pessoas) {
  const q = typeof quem === 'object' && quem ? quem : { nome: quem };
  const nome = String(q.nome || q.sub || '').trim();
  const r = pessoas && typeof pessoas.chave === 'function' ? pessoas : null;
  // Nome com decisão salva (vínculo ou "sem ficha") não cai no `id` antigo.
  const fixo = !!(r && nome && typeof r.fixado === 'function' && r.fixado(nome));
  return (r && nome ? r.idDe(nome) : '') || (!fixo && ehIdPessoa(q.id) ? String(q.id).trim() : '');
}
/* QUEM É A CONTA DA GESTÃO, em ID. O crachá da gestão não traz ID; a única
   ligação aceita é a da identidade única (apelido do RH = login): UMA ficha,
   da casa, cujo apelido é exatamente o login. Nunca o nome de exibição, nunca
   o começo do nome, nunca os vínculos da lista de instaladores: o diário é só
   de inserção, e um ID adivinhado fica gravado para sempre como se outra
   pessoa tivesse feito (revisão da F03). Sem essa ficha, ID vazio. */
export function idDaGestao(login, pessoas) {
  const ap = normPessoa(login);
  const fichas = pessoas && Array.isArray(pessoas.fichas) ? pessoas.fichas : [];
  if (!ap) return '';
  const achadas = fichas.filter(p => normPessoa(p.apelido) === ap);
  return achadas.length === 1 && !achadas[0].desligado && ehIdPessoa(achadas[0].id) ? String(achadas[0].id) : '';
}
export function pertenceEquipe(os, quem, pessoas) {
  const q = typeof quem === 'object' && quem ? quem : { nome: quem };
  const nome = String(q.nome || q.sub || '').trim();
  const r = pessoas && typeof pessoas.chave === 'function' ? pessoas : null;
  const alvo = idDoCracha(q, r);
  const texto = normPessoa(nome);
  if (!alvo && !texto) return false;
  return (Array.isArray(os?.equipe) ? os.equipe : []).some(n => {
    const s = String(n ?? '').trim();
    if (!s) return false;
    const id = ehIdPessoa(s) ? s : (r ? r.idDe(s) : '');
    if (alvo && id) return id === alvo;
    return !!texto && !ehIdPessoa(s) && normPessoa(s) === texto;
  });
}
export function validarConclusao(os, anterior, papel) {
  if (!os.finalizadaEm || anterior?.finalizadaEm || os.tipo === 'interno') return '';
  const faltas = [];
  if (!(os.fotosRetornoIds || []).length) faltas.push('foto do serviço concluído');
  if (!os.retornoEm) faltas.push('data e hora do retorno');
  if (faltas.length && !(['admin','pcp'].includes(papel) && String(os.justificativaConclusao || '').trim().length >= 15)) return 'Para concluir: ' + faltas.join(', ') + '. A gestão pode registrar uma justificativa de exceção.';
  return '';
}
/* AS DEZ EQUIPES FIXAS (F06, 29/09/2026). Pedido do dono: "10 equipes fixas
   (Águia, Leão, Pantera, Lobo, Tigre, Falcão, Carcará, Onça, Lobo-Guará,
   Touro) com cor fixa, ícone do animal, líder e integrantes fixos". CÓPIA das
   listas de performance.js (PERF.ANIMAIS e PERF.CORES): a tela oferece, esta
   porta confere. tests/equipes-listas.test.cjs cobra as duas iguais. Mudou
   lá, muda aqui.
   A cor é uma CHAVE da paleta, nunca um hex livre: a tela a transforma em
   classe (perf-cor-<chave>), e o hex mora só no styles.css. Texto livre ali
   viraria style= injetado no ranking de todo tablet.
   Águia e Falcão, Pantera e Onça dividem o ícone: quem separa é a cor e o
   rótulo. A equipe Pantera não tem relação nenhuma com a pessoa de apelido
   Pantera: equipe é pelo id da equipe, pessoa é pelo ID do RH. */
export const ANIMAIS_EQUIPE = [
  { id: 'aguia', rotulo: 'Águia', icone: '🦅' },
  { id: 'leao', rotulo: 'Leão', icone: '🦁' },
  { id: 'pantera', rotulo: 'Pantera', icone: '🐆' },
  { id: 'lobo', rotulo: 'Lobo', icone: '🐺' },
  { id: 'tigre', rotulo: 'Tigre', icone: '🐯' },
  { id: 'falcao', rotulo: 'Falcão', icone: '🦅' },
  { id: 'carcara', rotulo: 'Carcará', icone: '🐦' },
  { id: 'onca', rotulo: 'Onça', icone: '🐆' },
  { id: 'lobo-guara', rotulo: 'Lobo-Guará', icone: '🦊' },
  { id: 'touro', rotulo: 'Touro', icone: '🐂' },
];
export const CORES_EQUIPE = [
  { id: 'azul', rotulo: 'Azul' },
  { id: 'vermelho', rotulo: 'Vermelho' },
  { id: 'laranja', rotulo: 'Laranja' },
  { id: 'amarelo', rotulo: 'Amarelo' },
  { id: 'verde', rotulo: 'Verde' },
  { id: 'turquesa', rotulo: 'Turquesa' },
  { id: 'roxo', rotulo: 'Roxo' },
  { id: 'rosa', rotulo: 'Rosa' },
  { id: 'marrom', rotulo: 'Marrom' },
  { id: 'grafite', rotulo: 'Grafite' },
  { id: 'marinho', rotulo: 'Azul-marinho' },
  { id: 'ocre', rotulo: 'Ocre' },
  { id: 'terracota', rotulo: 'Terracota' },
  { id: 'vinho', rotulo: 'Vinho' },
];
// Os emblemas de antes das equipes fixas continuam aceitos (equipe antiga).
export const EMBLEMAS_EQUIPE = ['🦅', '🚀', '🎯', '🛡️', '⚡', '🦁', '🏔️', '🤝'];
const EMBLEMAS_ACEITOS = new Set([...EMBLEMAS_EQUIPE, ...ANIMAIS_EQUIPE.map(a => a.icone)]);
const animalDe = k => ANIMAIS_EQUIPE.find(a => a.id === k) || null;
const corValida = k => CORES_EQUIPE.some(c => c.id === k);
// "Lobo-Guará", "lobo guara" e " LOBO-GUARÁ " são o mesmo nome.
export const nomeEquipeNorm = s => normPessoa(String(s ?? '').replace(/[-_]+/g, ' '));
const CAMPOS_FIXOS = ['animal', 'cor', 'liderPadraoId'];

/* A CHAVE DE UM MEMBRO GRAVADO, em ID. A equipe nova grava o ID do RH; a
   gravada antes pode ter o slug da ficha ('carla-lima') ou o apelido. Slug
   passa pela ficha (é a mesma pessoa, sem adivinhar); apelido passa pela
   régua de pessoas (vínculo salvo ou casamento único). Sem régua (RH fora do
   ar) ou sem ficha, fica a chave crua. */
export function idDoMembro(m, pessoas) {
  const k = String(m && m.chave != null ? m.chave : '').trim();
  if (ehIdPessoa(k)) return k;
  const regua = pessoas && typeof pessoas.idDe === 'function' ? pessoas : null;
  if (!regua || !k) return k;
  const ficha = (Array.isArray(regua.fichas) ? regua.fichas : []).find(p => p && String(p.chave) === k && ehIdPessoa(p.id));
  return ficha ? ficha.id : (regua.idDe(k) || k);
}

/* A ABA NA VERSÃO ANTERIOR (v133) não conhece animal, cor e líder: regrava a
   equipe sem esses campos, e a mescla leria "apagou" (local sem a chave,
   remoto igual à base). A tela nova grava SEMPRE os três (vazio quando não
   há), então campo ausente aqui é versão velha, não decisão: volta o da base.
   Mesma ideia dos pesos da nota no setCfg. */
export function preservarCamposEquipe(basePerf, localPerf) {
  const bs = objeto(basePerf) && Array.isArray(basePerf.equipes) ? basePerf.equipes : [];
  if (!objeto(localPerf) || !Array.isArray(localPerf.equipes)) return localPerf;
  const porId = new Map(bs.filter(e => objeto(e) && e.id).map(e => [e.id, e]));
  localPerf.equipes = localPerf.equipes.map(e => {
    const b = objeto(e) ? porId.get(e.id) : null;
    if (!b) return e;
    const faltam = CAMPOS_FIXOS.filter(k => !(k in e) && k in b);
    return faltam.length ? { ...e, ...Object.fromEntries(faltam.map(k => [k, b[k]])) } : e;
  });
  return localPerf;
}

/* O QUE ENTRA DE CADA EQUIPE, conferido no setCfg ANTES da validação.
   Animal, cor e líder inválidos NÃO viram 422: resposta 422 tira o setCfg
   da fila e desfaz a configuração inteira no aparelho (a aba antiga perderia
   o que estava certo junto). O campo ruim é ignorado: fica o valor que a
   equipe já tinha, se ainda vale, ou nenhum; e quem salvou recebe o aviso.
   - membros: a chave fica COMO VEIO. A aba presa na v133 compara pelo slug
     ('carla-lima') o que ela mesma gravou; reescrever para o ID quebrava o
     modelo "Equipe salva" e o selo da pessoa nela (revisão F06). Quem lê
     converte na hora (idDoMembro aqui, perfIdMembro na tela, idDoMembro na
     divisão). Só slug e ID da MESMA pessoa na mesma equipe viram um membro
     (fica o primeiro, como veio).
   - animal: da lista fechada; o emblema passa a ser o ícone dele (a aba
     antiga só sabe mostrar o emblema).
   - cor: chave da paleta.
   - liderPadraoId: ID de 6 dígitos, e só se for um dos membros.
   Campo vazio ('') é a tela nova dizendo "nenhum": FICA gravado como ''.
   Apagar a chave fazia o banco guardar coisa diferente do que o aparelho
   mandou, e o setCfg seguinte da fila (base = o que foi mandado) levava 409
   de conflito sem ninguém mais ter mexido. Campo recusado também vira ''. */
export function sanearEquipes(perf, antes, pessoas) {
  const avisos = [];
  if (!objeto(perf) || !Array.isArray(perf.equipes)) return { perf, avisos };
  const velhas = new Map((objeto(antes) && Array.isArray(antes.equipes) ? antes.equipes : []).filter(e => objeto(e) && e.id).map(e => [e.id, e]));
  const equipes = perf.equipes.map(e => {
    if (!objeto(e)) return e;
    const n = { ...e }, velha = velhas.get(e.id) || {}, nome = String(e.nome || 'sem nome');
    if (Array.isArray(e.membros)) {
      const vistos = new Set();
      n.membros = e.membros.flatMap(m => {
        if (!objeto(m)) return [m];
        const id = idDoMembro(m, pessoas);
        if (vistos.has(id)) return [];
        vistos.add(id);
        return [m];
      });
    }
    const ids = new Set((n.membros || []).map(m => idDoMembro(m, pessoas)).filter(ehIdPessoa));
    /* Sem a régua (RH fora do ar) e com membro que não é ID (slug ou apelido
       de equipe antiga), não dá para saber se o líder de antes ainda é
       membro: ele fica como estava, em vez de sumir por falta de rede. */
    const semRegua = !(pessoas && typeof pessoas.idDe === 'function') && (n.membros || []).some(m => !ehIdPessoa(idDoMembro(m, pessoas)));
    if (semRegua && ehIdPessoa(velha.liderPadraoId)) ids.add(String(velha.liderPadraoId).trim());
    // rotulo e particípio andam juntos: "A cor ... não foi aceita".
    const conferir = (campo, ok, rotulo, aceito) => {
      if (!(campo in n)) return;
      const v = n[campo];
      if (v === '') return;
      if (v == null) { delete n[campo]; return; }
      if (ok(v)) return;
      const ficou = campo in velha && ok(velha[campo]);
      n[campo] = ficou ? velha[campo] : '';
      avisos.push(`${rotulo} da equipe "${nome}" não foi ${aceito} (${String(v).slice(0, 40)}): ${ficou ? 'ficou o anterior' : 'ficou sem'}.`);
    };
    conferir('animal', v => !!animalDe(v), 'O animal', 'aceito');
    conferir('cor', corValida, 'A cor', 'aceita');
    const eraLider = 'liderPadraoId' in n && ehIdPessoa(n.liderPadraoId) && !ids.has(String(n.liderPadraoId).trim()) && velha.liderPadraoId === n.liderPadraoId;
    if (eraLider) { n.liderPadraoId = ''; avisos.push(`O líder da equipe "${nome}" saiu dos integrantes: a equipe ficou sem líder. Escolha outro.`); }
    else conferir('liderPadraoId', v => ehIdPessoa(v) && ids.has(String(v).trim()), 'O líder', 'aceito');
    const animal = animalDe(n.animal);
    if (animal) n.emblema = animal.icone;
    return n;
  });
  return { perf: { ...perf, equipes }, avisos };
}

/* EQUIPES FIXAS: A REGRA ENTRE AS ATIVAS. A regra antiga era "uma equipe
   ativa por composição" (v124); com as dez fixas duas equipes PODEM ter a
   mesma gente enquanto o cadastro é arrumado, e a entrega é decidida pela
   confirmação (e a sugestão só deduz a equipe quando há EXATAMENTE uma ativa
   com aquela composição). O que não pode repetir é o NOME: duas "Águia"
   ativas no ranking seriam a mesma equipe parecendo duas. Devolve
   `nomes` (nome normalizado -> ids das ativas com ele, só os repetidos) e
   `pessoasEmDuas` (ID -> ids das equipes ativas em que é fixa, só quem está
   em duas ou mais). O setCfg recusa só o nome repetido NOVO (duplicata que já
   estava no banco não trava confirmação nenhuma) e AVISA da pessoa em duas.
   Com a régua de pessoas, slug e ID da mesma ficha são a mesma pessoa. A
   mesma conta mora em PERF.conferirEquipes, na tela. */
export function conferirEquipesAtivas(perf, pessoas) {
  const porNome = new Map(), porPessoa = new Map();
  for (const e of (objeto(perf) && Array.isArray(perf.equipes) ? perf.equipes : [])) {
    if (!objeto(e) || e.ativo === false) continue;
    const k = nomeEquipeNorm(e.nome);
    if (k) porNome.set(k, [...(porNome.get(k) || []), e.id]);
    for (const id of new Set((Array.isArray(e.membros) ? e.membros : []).map(m => idDoMembro(m, pessoas)).filter(Boolean))) {
      porPessoa.set(id, [...(porPessoa.get(id) || []), e.id]);
    }
  }
  return {
    nomes: new Map([...porNome].filter(([, ids]) => ids.length > 1)),
    pessoasEmDuas: new Map([...porPessoa].filter(([, ids]) => ids.length > 1)),
  };
}
// Validação da apuração operacional; nenhum lançamento de folha é criado.
export function validarPerformance(cfg) {
  if (cfg == null) return '';
  if (typeof cfg !== 'object' || !Array.isArray(cfg.equipes) || !Array.isArray(cfg.participacoes)) return 'Estrutura de performance inválida.';
  const texto = (s,n) => typeof s === 'string' && s.trim().length > 0 && s.length <= n;
  const distintos = xs => new Set(xs.map(x=>x?.id)).size === xs.length;
  if (cfg.equipes.length > 300 || cfg.participacoes.length > 20000 || !distintos(cfg.equipes) || !distintos(cfg.participacoes)) return 'Registros de performance repetidos ou acima do limite.';
  const membrosOK = ms => Array.isArray(ms) && ms.length > 0 && ms.length <= 50 && ms.every(p=>p && texto(p.chave,150) && texto(p.nome,150)) && new Set(ms.map(p=>p.chave)).size === ms.length;
  /* O LOGO DA EQUIPE é opcional e vem como imagem já reduzida no aparelho
     (160x160). Só PNG, JPEG ou WebP em base64 — SVG fica de fora de propósito,
     porque carrega script. Teto por logo e teto do conjunto: a configuração
     global desce para todo tablet, e vinte logos de 200 KB transformariam cada
     abertura do app num download de 4 MB. O emblema continua obrigatório: é o
     que aparece quando a imagem não existe ou não carrega. */
  const LOGO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
  const LOGO_MAX = 40000, LOGOS_MAX = 400000;
  let somaLogos = 0;
  for (const e of cfg.equipes) {
    if (!e || !texto(e.id,150) || !texto(e.nome,60) || !EMBLEMAS_ACEITOS.has(e.emblema) || !membrosOK(e.membros)) return 'Equipe inválida. Confira nome, emblema e integrantes.';
    if (e.logo != null && e.logo !== '') {
      if (typeof e.logo !== 'string' || e.logo.length > LOGO_MAX || !LOGO.test(e.logo)) return 'Logo da equipe inválido: use PNG, JPEG ou WebP de até 40 KB.';
      somaLogos += e.logo.length;
    }
    if (e.ativo != null && typeof e.ativo !== 'boolean') return 'Equipe inválida. Confira nome, emblema e integrantes.';
  }
  if (somaLogos > LOGOS_MAX) return 'Logos das equipes somam mais que o limite de 400 KB. Remova ou troque algum.';
  /* (Animal, cor e líder são conferidos antes, em sanearEquipes: inválido é
     ignorado com aviso, nunca 422. O nome repetido entre ativas mora em
     conferirEquipesAtivas: o setCfg recusa só a repetição NOVA.) */
  /* OS PESOS DA AVALIAÇÃO (produção, limpeza do carro, equipamentos): inteiros
     de 0 a 100 que somam 100. Opcional — sem eles vale o padrão da tela. */
  if (cfg.criterios != null) {
    const c = cfg.criterios, ks = ['producao','limpeza','equipamentos'];
    if (typeof c !== 'object' || ks.some(k => !Number.isInteger(c[k]) || c[k] < 0 || c[k] > 100) || ks.reduce((s,k)=>s+c[k],0) !== 100 || Object.keys(c).some(k => !ks.includes(k))) {
      return 'Pesos da avaliação inválidos: produção, limpeza e equipamentos, inteiros que somam 100.';
    }
  }
  for (const p of cfg.participacoes) {
    if (!p || !texto(p.id,150) || !membrosOK(p.membros)) return 'Participação inválida.';
    if (p.equipeId && !cfg.equipes.some(e=>e.id===p.equipeId)) return 'Equipe da participação não encontrada.';
    if (p.membros.some(m=>typeof m.percentual !== 'number' || !Number.isFinite(m.percentual) || m.percentual<=0 || m.percentual>100)) return 'Percentual inválido.';
    if (Math.abs(p.membros.reduce((s,m)=>s+m.percentual,0)-100) > 0.001) return 'As participações precisam somar 100%.';
    if (p.obs && (typeof p.obs !== 'string' || p.obs.length>300)) return 'Observação acima do limite.';
  }
  return '';
}
/* O QUE O CRACHÁ DE TOQUE ESCREVE: só a execução (ver pcp-sync). Ele nasce de
   um primeiro nome, sem senha; reescrever cliente, endereço ou vendedor não é
   trabalho dele. Campo fora da lista é descartado, não recusado: recusar tudo
   faria o aparelho na rua perder o check-in inteiro por um campo a mais.
   conferidoPor, retrabalho e causa entraram com a decisão (B) do Léo
   (23/09/2026): "O instalador finaliza, e o espelho passa a pedir a foto do
   serviço pronto". Sem eles, a finalização do espelho chegava pela metade.
   voltaEquipe (25/09/2026) é a limpeza do carro que a equipe registra no
   espelho. Sem ela aqui, o celular mostrava "registrada", recebia 200 e nada
   chegava ao banco. O que entra dela é saneado no pcp-sync (sanearVoltaEquipe). */
export const CAMPOS_MONTAGEM = new Set([
  'id', 'rev', 'atualizadoEm', 'atualizadoPor',
  'checkin', 'checkinGPS', 'checkout', 'conclusao',
  'fotosCheckinIds', 'fotosRetornoIds',
  'carroLiberado', 'carroLiberadoEm', 'carroLiberadoPor',
  'obsTecnicas', 'instalacaoOK', 'problema', 'conferidoPor', 'retrabalho', 'causa',
  'ferramentasConferidas', 'ferramentasConferidasPor',
  'kmSaida', 'kmRetorno', 'horaSaida', 'horaRetorno', 'saidaEm', 'retornoEm',
  'voltaEquipe', 'fotosTiradas',
]);
/* CÓDIGO FIXO DO ITEM (E1 do plano de entrega por item, 29/09/2026). O item
   não tinha id: a marca casava pelo número e pela descrição, e 10 O.S. reais
   têm esse par repetido. Agora cada item tem `uid`, dado uma vez e nunca
   reaproveitado:
   - item do ERP: '<numero>:<posicao>:<k>' na importação (k conta a posição
     repetida). É determinístico: importar de novo dá o mesmo código;
   - item manual ou do PDF: 'm-' + aleatório, gerado no aparelho (funciona
     sem rede; OPERACAO.novoUidItem);
   - item antigo sem código: o servidor carimba na PRÓXIMA gravação normal da
     O.S. (preservarItens), sem gravação em lote. Item do ERP ganha o mesmo
     código que a importação daria; o resto, 's-' + aleatório.
   Depois de dado, o código não depende da posição na lista. A cópia do
   casamento no aparelho está em operacao.js (OPERACAO.casarItens), e um
   teste confere as duas (tests/itens-uid.test.cjs). */
const UID_ITEM = /^[\w:.-]{1,80}$/;
export const uidItemValido = v => typeof v === 'string' && UID_ITEM.test(v);
const pedacoUid = v => String(v ?? '').trim().replace(/[^\w.-]+/g, '_').slice(0, 30) || '0';
export const uidDoERP = (numero, posicao, k) => `${pedacoUid(numero)}:${pedacoUid(posicao)}:${k}`;
// 's-' (servidor) ou 'm-' (aparelho) + 12 letras e números sorteados.
export function sortearUid(prefixo = 's-') {
  const c = globalThis.crypto, b = new Uint8Array(12);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
  return prefixo + [...b].map(x => (x % 36).toString(36)).join('');
}
/* O ITEM DO ERP COM CÓDIGO. Quem já tem código válido fica com ele; os outros
   ganham '<numero>:<posicao>:<k>', na ordem da lista, sem repetir código que
   já está nela. Devolve uma lista nova (os itens também são cópias). */
export function carimbarUidsERP(numero, itens) {
  if (!Array.isArray(itens)) return itens;
  const usados = new Set(itens.filter(it => objeto(it) && uidItemValido(it.uid)).map(it => it.uid));
  const vezes = new Map();
  return itens.map(it => {
    if (!objeto(it)) return it;
    const pos = String(it.item ?? '');
    const k = (vezes.get(pos) || 0) + 1;
    vezes.set(pos, k);
    if (uidItemValido(it.uid)) return { ...it };
    let uid = uidDoERP(numero, pos, k);
    if (usados.has(uid)) uid = sortearUid('s-');
    usados.add(uid);
    return { ...it, uid };
  });
}
/* O CASAMENTO DE ITEM, um só para o servidor e para o aparelho. Devolve, para
   cada item de `novos`, a posição do mesmo item em `antes`, ou -1.
   1. Pelo código: item que tem código só casa pelo código. Código que o outro
      lado não tem é outro item (o "Substituir" do PDF, o item que o PCP
      removeu): não cai para o número nem para a descrição.
   2. O item sem código (aba antiga, item de antes da E1) casa pelo casamento
      de antes, em rodadas, e só com item do mesmo lado (do ERP com do ERP,
      manual com manual: o item do PDF nunca herda o código de um item do
      ERP que saiu): número, descrição, medida e quantidade iguais, quando a
      combinação é única dos dois lados; depois número e descrição iguais, na
      ordem (nunca pela posição na lista, que muda quando um item antes dele
      sai: isso trocava os códigos do par repetido); depois o número, quando
      só um item de `antes` o tem e só um livre também; depois a descrição,
      com a mesma regra. A marca nunca pula para o vizinho.
      Aba antiga que remove um item manual e cria outro manual com o mesmo
      número (ou a mesma descrição) na mesma gravação: aqui o novo casaria com
      o removido. Quem fecha isso é o preservarItens (E3): item com entrega só
      passa o código ao mesmo produto, e a lista que já leu os códigos do
      servidor só passa o código ao mesmo item sem mudança. */
export function casarItens(antes, novos) {
  const A = Array.isArray(antes) ? antes : [], N = Array.isArray(novos) ? novos : [];
  const par = N.map(() => -1), usadoA = new Set(), comUid = new Set();
  const txt = v => String(v ?? '');
  const porUid = new Map();
  A.forEach((a, i) => { if (objeto(a) && uidItemValido(a.uid) && !porUid.has(a.uid)) porUid.set(a.uid, i); });
  N.forEach((n, j) => {
    if (!objeto(n) || !uidItemValido(n.uid)) return;
    comUid.add(j);
    const i = porUid.get(n.uid);
    if (i !== undefined && !usadoA.has(i)) { par[j] = i; usadoA.add(i); }
  });
  const livresN = () => N.map((_, j) => j).filter(j => par[j] < 0 && !comUid.has(j) && objeto(N[j]));
  const livresA = () => A.map((_, i) => i).filter(i => !usadoA.has(i) && objeto(A[i]));
  const casar = (i, j) => { par[j] = i; usadoA.add(i); };
  // Item do ERP só casa com item do ERP, e manual com manual: o item do PDF
  // ou o manual novo de uma aba antiga nunca herda o código de quem saiu.
  const mesmoLado = (i, j) => !!A[i].manual === !!N[j].manual;
  const igual = (i, j, campos) => mesmoLado(i, j) && campos.every(c => txt(N[j][c]) === txt(A[i][c]));
  const INTEIRO = ['item', 'descricao', 'medidas', 'qtde'], NOME = ['item', 'descricao'];
  // 1a. Número, descrição, medida e quantidade iguais, quando só um de cada
  // lado tem essa combinação: separa o par repetido de medidas diferentes
  // mesmo que um item antes dele (ou um do par) tenha saído da lista.
  for (const i of livresA()) {
    const js = livresN().filter(j => igual(i, j, INTEIRO));
    if (js.length === 1 && livresA().filter(k => igual(k, js[0], INTEIRO)).length === 1) casar(i, js[0]);
  }
  // 1b. Número e descrição iguais, na ordem (nunca pela posição na lista: a
  // posição muda quando um item antes dele sai).
  for (const i of livresA()) {
    const js = livresN().filter(j => igual(i, j, NOME));
    if (js.length) casar(i, js[0]);
  }
  for (const campo of ['item', 'descricao']) {
    for (const i of livresA()) {
      const v = txt(A[i][campo]);
      if (!v || A.filter(o => objeto(o) && txt(o[campo]) === v).length !== 1) continue;
      const js = livresN().filter(j => txt(N[j][campo]) === v && mesmoLado(i, j));
      if (js.length === 1) casar(i, js[0]);
    }
  }
  return par;
}
/* O QUE SÓ O SERVIDOR GUARDA NO ITEM. Aba antiga não conhece estes campos e
   manda o item sem eles: o servidor os recoloca, casando pelo casamento de
   hoje. As marcas de entrega (E3) moram aqui também; a regra de quem grava
   marca nova é a guardarEntregasItens. */
export const CAMPOS_ITEM_SERVIDOR = ['uid', 'entregas'];
// O mesmo item, sem mudança nenhuma: lado, número, descrição, medida e quantidade.
const mesmoItem = (a, b) => !!a.manual === !!b.manual && ['item', 'descricao', 'medidas', 'qtde'].every(c => String(a[c] ?? '') === String(b[c] ?? ''));
// O mesmo produto: lado e descrição. Número, medida e quantidade a gestão corrige.
const mesmoProduto = (a, b) => !!a.manual === !!b.manual && String(a.descricao ?? '').trim() === String(b.descricao ?? '').trim();
const temEntregas = g => objeto(g) && Array.isArray(g.entregas) && g.entregas.length > 0;
/* PRESERVAR OS ITENS (roda em toda gravação de O.S. no pcp-sync, depois das
   travas de conflito). Para cada item que chegou:
   - casado com um item gravado (casarItens): o campo de CAMPOS_ITEM_SERVIDOR
     que não veio volta do gravado (código fora do formato conta como não
     veio);
   - sem código válido, ou com o código repetido de outro item da mesma lista
     (item copiado): ganha código novo. Item do ERP (O.S. do ERP, item não
     manual) ganha o da importação; o resto, 's-' + aleatório.
   O ITEM SEM CÓDIGO NÃO HERDA O CÓDIGO DE OUTRO ITEM (E3). O casamento pelo
   número e pela descrição não separa "o mesmo item editado" de "item novo
   no lugar do removido" (a aba antiga que tira a placa 2 e cria o totem 2
   na mesma gravação). Duas réguas, uma sobre a outra:
   - item gravado COM ENTREGA só passa o código (e com ele as marcas e o
     dinheiro) ao mesmo produto (lado e descrição), com ou sem códigos na
     lista. Fora disso o item que chegou ganha código próprio, e a
     guardarEntregasItens devolve o item com entrega ao lugar dele, com aviso;
   - a lista que LEU os códigos do servidor (traz um código 's-' ou do ERP
     que o servidor conhece: o aparelho não gera esses, só 'm-') só passa o
     código ao mesmo item sem mudança nenhuma. Quem leu a lista carimbada tem
     o código em todo item que leu; o item sem código dela é item novo de aba
     antiga. O 'm-' não conta: a aba v135 dá 'm-' ao item que ela cria e não
     adota o código da resposta, e contar o 'm-' trocava o código do item
     antigo a cada gravação da ficha aberta (revisão da E3).
   O item recusado pelo gravado tenta de novo com os outros gravados, e o
   item com entrega que nenhum da lista pode herdar nem entra no casamento:
   a aba que edita a descrição de um item com entrega não troca o código do
   item novo a cada gravação.
   Nada fora da lista que chegou é criado nem removido. `sortear` só existe
   para o teste. Devolve { os, carimbados, recolocados }. */
export function preservarItens(os, antes, { sortear = sortearUid } = {}) {
  if (!objeto(os) || !Array.isArray(os.itens)) return { os, carimbados: 0, recolocados: 0 };
  const gravados = Array.isArray(antes?.itens) ? antes.itens : [];
  const conhecidos = new Set(gravados.filter(g => objeto(g) && uidItemValido(g.uid)).map(g => g.uid));
  const leuCodigos = os.itens.some(it => objeto(it) && uidItemValido(it.uid) && !it.uid.startsWith('m-') && conhecidos.has(it.uid));
  const recusa = (g, n) => objeto(n) && !uidItemValido(n.uid) && uidItemValido(g.uid) &&
    (leuCodigos ? !mesmoItem(g, n) : temEntregas(g) && !mesmoProduto(g, n));
  /* O item com entrega que nenhum item da lista pode herdar (nem o código dele
     veio, nem o mesmo produto sem código) sai do casamento desde já: senão ele
     e o item novo com o mesmo número se anulavam na regra do número, e o item
     novo trocava de código a cada gravação. */
  const uidsVeio = new Set(os.itens.filter(it => objeto(it) && uidItemValido(it.uid)).map(it => it.uid));
  const semCodigo = os.itens.filter(it => objeto(it) && !uidItemValido(it.uid));
  const mascara = gravados.map(g => objeto(g) && temEntregas(g) && uidItemValido(g.uid) && !uidsVeio.has(g.uid) &&
    !semCodigo.some(n => mesmoProduto(g, n)) ? null : g);
  let par = casarItens(mascara, os.itens);
  for (let volta = 0; volta <= gravados.length; volta++) {
    const fora = par.map((i, j) => i >= 0 && recusa(mascara[i], os.itens[j]) ? i : -1).filter(i => i >= 0);
    if (!fora.length) break;
    for (const i of fora) mascara[i] = null;
    par = casarItens(mascara, os.itens);
  }
  par = par.map((i, j) => i >= 0 && recusa(gravados[i], os.itens[j]) ? -1 : i);
  let recolocados = 0, carimbados = 0;
  const itens = os.itens.map((it, j) => {
    if (!objeto(it)) return it;
    const r = { ...it };
    if (!uidItemValido(r.uid)) delete r.uid;
    const g = par[j] >= 0 ? gravados[par[j]] : null;
    if (g) for (const c of CAMPOS_ITEM_SERVIDOR) {
      if (proprio(r, c) || !proprio(g, c) || (c === 'uid' && !uidItemValido(g.uid))) continue;
      r[c] = g[c]; recolocados++;
    }
    return r;
  });
  const vistos = new Set(), todos = new Set(itens.filter(it => objeto(it) && it.uid).map(it => it.uid));
  // O código do gravado recusado não volta pelo carimbo (o do ERP sai da posição).
  mascara.forEach((m, i) => { if (m === null && !par.includes(i) && uidItemValido(gravados[i]?.uid)) todos.add(gravados[i].uid); });
  const doERP = !!(os.origemMubisys || antes?.origemMubisys);
  const numero = String(os.numero ?? antes?.numero ?? '').trim();
  const vezes = new Map();
  for (const it of itens) {
    if (!objeto(it)) continue;
    const pos = String(it.item ?? '');
    const k = it.manual ? 0 : (vezes.get(pos) || 0) + 1;
    if (!it.manual) vezes.set(pos, k);
    if (it.uid && !vistos.has(it.uid)) { vistos.add(it.uid); continue; }
    let uid = doERP && numero && !it.manual ? uidDoERP(numero, pos, k) : '';
    for (let t = 0; !uid || todos.has(uid); t++) uid = t < 5 ? sortear('s-') : sortearUid('s-') + t;
    it.uid = uid; todos.add(uid); vistos.add(uid); carimbados++;
  }
  return { os: { ...os, itens }, carimbados, recolocados };
}
/* PORTA DAS MARCAS DE ENTREGA POR ITEM (E3 do plano de entrega por item,
   29/09/2026). Roda em toda gravação de O.S. no pcp-sync, depois do
   preservarItens (o item já tem o código). Decisões do dono:
   - marca nova (item.entregas) de admin e pcp e de operação com senha
     (balcão); cancelar e desfazer só admin e pcp. O celular (E5: crachá sem
     senha, papel 'toque', e montagem com senha) só entrega e retira, e a
     marca dele sai DECLARADA (via 'toque', declarado:true): conta no saldo,
     não conta como entregue conferido até o Fechar o dia (F14). A máquina
     não marca. A permissão, o saldo, o dia (nunca depois de hoje), o teto e
     o formato são do motor da E2 (ENTREGA_ITEM.validarEvento, a mesma régua
     que a tela usa);
   - SÓ ACRÉSCIMO: a marca gravada não muda e não some. O item parte das
     marcas GRAVADAS, e o aparelho só acrescenta. Aba antiga sem o campo, ou
     com a marca mexida, fica com o gravado;
   - id já gravado (neste item ou em outro da O.S.) é ignorado sem aviso: é a
     fila offline mandando de novo, ou o item copiado na tela;
   - porId, por e em são do crachá e do relógio do servidor; o via e o
     declarado saem do papel (o motor). O que o aparelho escreveu neles não
     entra. O crachá é o do ENVIO: a fila offline atravessa a troca de
     crachá, e a marca feita ontem por um crachá e enviada hoje por outro
     leva o de hoje (o aparelho não escolhe o autor);
   - marca que não passa é DESCARTADA com aviso, nunca 422 (422 prende a fila
     do aparelho). O resto da gravação segue;
   - item que tem marca não sai da lista: o servidor o devolve ao lugar dele
     e avisa. O saldo de um item que não vai mais se tira com Cancelar item;
   - O.S. finalizada antes e depois desta gravação não recebe marca (o motor
     recusa: a entrega implícita já contou). Finalizar junto com a marca, na
     mesma gravação, vale (o Finalizar da E4 marca o saldo e fecha; o do
     celular também). A entrega do celular numa O.S. que a gestão finalizou
     enquanto ele estava sem sinal é descartada com aviso ao celular.
   Opções: papel (o do crachá; 'toque' e 'maquina' para as portas sem conta),
   avisar (quem ouve o aviso), autor {nome, porId}, agora (ISO do servidor).
   Devolve { os, avisos, eventos, recusadas }: `eventos` são as marcas novas
   gravadas, uma linha compacta cada (a do diário); `recusadas` são as marcas
   descartadas ({ id, uid, motivo }), que a resposta devolve em `descartado`
   para o aparelho tirá-las da cópia e da fila. Sem isso a marca recusada
   voltava na gravação seguinte da mesma cópia e, com o saldo liberado,
   entrava calada, com a hora de agora e o dia antigo (revisão da E3). Nunca
   lança. */
const TETO_AVISOS_ENTREGA = 5;
function rotuloItem(it) {
  // Só o produto: o texto livre depois de ' - ' (dia, local, evento) fica de fora.
  const d = String(it?.descricao ?? '').split(' - ')[0].trim().slice(0, 40);
  const n = String(it?.item ?? '').trim().slice(0, 10);
  return (n ? 'item ' + n : 'item') + (d ? ` (${d})` : '');
}
// A linha do diário para uma marca: sem R$, sem o texto de quem retirou.
function linhaEntrega(it, e) {
  const t = (v, n) => String(v ?? '').slice(0, n);
  return {
    id: t(e.id, 64), uid: t(it?.uid, 80), item: t(it?.item, 20), tipo: t(e.tipo, 20),
    ...(Number.isInteger(e.qtde) ? { qtde: e.qtde } : {}), dia: t(e.dia, 10),
    ...(e.alvo ? { alvo: t(e.alvo, 64) } : {}), ...(e.motivo ? { motivo: t(e.motivo, 200) } : {}),
    via: t(e.via, 10), ...(e.declarado === true ? { declarado: true } : {}),
    por: t(e.por, 80), porId: ehIdPessoa(e.porId) ? String(e.porId).trim() : '',
  };
}
const marcasDe = it => objeto(it) && Array.isArray(it.entregas) ? it.entregas : [];
export function guardarEntregasItens(os, antes, { papel = '', avisar = false, autor = {}, agora = '', cancelamento = antes ? antes.cancelamento : undefined } = {}) {
  const avisos = [], eventos = [], recusas = [], recusadas = [];
  if (!objeto(os)) return { os, avisos, eventos, recusadas };
  const gravados = Array.isArray(antes?.itens) ? antes.itens : [];
  const porUid = new Map();
  for (const g of gravados) if (objeto(g) && uidItemValido(g.uid) && !porUid.has(g.uid)) porUid.set(g.uid, g);
  const idsOS = new Set();
  for (const g of gravados) for (const e of marcasDe(g)) if (objeto(e)) idsOS.add(String(e.id ?? '').trim());
  const hoje = ENTREGA_ITEM.diaSP(agora) || ENTREGA_ITEM.diaSP(Date.now());
  // Finalizada antes E depois desta gravação: o motor recusa. Finalizando agora, ou reabrindo, vale.
  /* O cancelamento que vale é o do SERVIDOR (F16), nunca o do envio: a cópia
     velha sem ele não marca item de O.S. cancelada, e a marca forjada no
     envio não vale. Quem chama passa `cancelamento` (revisão da F16): o
     gravado, ou o desfeito pelo pedido aceito neste mesmo envio (a fila junta
     o desfazer e a marca feita depois dele). O pedido de cancelar que vem
     junto só vale depois desta gravação (o que foi entregue nela fica; o
     saldo é cancelado). Sem a opção, o gravado. */
  const osCtx = { ...os, finalizadaEm: antes?.finalizadaEm && os.finalizadaEm ? os.finalizadaEm : '', cancelamento };
  const carimbo = { por: String(autor?.nome ?? '').trim().slice(0, 80), porId: ehIdPessoa(autor?.porId) ? String(autor.porId).trim() : '', em: String(agora ?? '') };
  const lista = Array.isArray(os.itens) ? os.itens : [];
  const itens = lista.map(it => {
    if (!objeto(it)) return it;
    const g = uidItemValido(it.uid) ? porUid.get(it.uid) : null;
    // Parte do GRAVADO: o que o aparelho mandou da marca antiga não vale.
    const item = { ...it, entregas: marcasDe(g).slice() };
    const doItem = new Set(item.entregas.filter(objeto).map(e => String(e.id ?? '').trim()));
    for (const e of marcasDe(it)) {
      if (!objeto(e)) continue;
      const id = String(e.id ?? '').trim();
      if (doItem.has(id) || idsOS.has(id)) continue;
      const v = ENTREGA_ITEM.validarEvento(e, item, { papel, os: osCtx, hoje });
      if (v.repetido) continue;
      if (!v.ok) {
        recusas.push(`A marca de entrega do ${rotuloItem(it)} não foi gravada: ${v.erro}`);
        recusadas.push({ id: id.slice(0, 64), uid: String(it.uid ?? '').slice(0, 80), motivo: String(v.erro ?? '').slice(0, 200) });
        continue;
      }
      const marca = { ...v.evento, ...carimbo };
      item.entregas.push(marca); doItem.add(marca.id); idsOS.add(marca.id);
      eventos.push(linhaEntrega(it, marca));
    }
    if (!item.entregas.length) delete item.entregas;
    return item;
  });
  // Item com marca que o aparelho tirou da lista: volta ao lugar dele.
  const presentes = new Set(itens.filter(objeto).map(it => it.uid));
  let voltaram = 0;
  gravados.forEach((g, i) => {
    if (!marcasDe(g).length || !uidItemValido(g.uid) || presentes.has(g.uid)) return;
    itens.splice(Math.min(i, itens.length), 0, { ...g });
    presentes.add(g.uid); voltaram++;
    avisos.push(`O ${rotuloItem(g)} já tem marca de entrega e continua na O.S.: item com entrega não sai da lista. Para tirar o saldo que falta, a gestão usa Cancelar item.`);
  });
  avisos.push(...recusas.slice(0, TETO_AVISOS_ENTREGA));
  if (recusas.length > TETO_AVISOS_ENTREGA) avisos.push(`Mais ${recusas.length - TETO_AVISOS_ENTREGA} marcas de entrega não foram gravadas.`);
  const r = Array.isArray(os.itens) || voltaram ? { ...os, itens } : { ...os };
  return { os: r, avisos: avisar ? avisos : [], eventos, recusadas: recusadas.slice(0, 200) };
}
/* A MARCA QUE O APARELHO MANDOU E NÃO FICOU GRAVADA. Para o reenvio da mesma
   gravação (a resposta se perdeu): o servidor responde sem gravar de novo, e
   diz de novo quais marcas caíram, para o aparelho tirá-las da cópia. */
export function entregasNaoGravadas(os, gravado) {
  const ids = new Set();
  for (const g of Array.isArray(gravado?.itens) ? gravado.itens : []) for (const e of marcasDe(g)) if (objeto(e)) ids.add(String(e.id ?? '').trim());
  const fora = [];
  for (const it of Array.isArray(os?.itens) ? os.itens : []) for (const e of marcasDe(it)) {
    if (!objeto(e)) continue;
    const id = String(e.id ?? '').trim();
    if (!ids.has(id)) fora.push({ id: id.slice(0, 64), uid: String(it.uid ?? '').slice(0, 80), motivo: 'A marca não ficou gravada no servidor.' });
  }
  return fora.slice(0, 200);
}
/* Do item, só a marca da montagem: descrição, medida e valor são do PCP e do
   ERP. `entregas` (E5) é a entrega que o celular declara, e entra de outro
   jeito: SÓ ACRÉSCIMO. A mescla parte das marcas gravadas e junta só as de id
   novo (marcasNovasDoToque); quem confere o tipo, o saldo, o autor e a hora é
   a guardarEntregasItens, com o papel do crachá, logo depois no pcp-sync. */
const CAMPOS_ITEM_MONTAGEM = ['statusInst', 'pronto', 'motivo', 'obsProb', 'fotoProbId', 'entregas'];
/* Marcas novas de um item num envio só: a lista gravada tem teto de 40 (o
   motor), e mandar mais que isso é aparelho doido ou abuso. O que passa do
   teto volta como recusado, com o motivo. */
const TETO_MARCAS_TOQUE = 40;
// As marcas do item que o celular mandou e o servidor ainda não tem (id novo na O.S. inteira).
function marcasNovasDoToque(v, idsGravados) {
  const vistos = new Set(), novas = [];
  for (const e of objeto(v) && Array.isArray(v.entregas) ? v.entregas : []) {
    if (!objeto(e)) continue;
    const id = String(e.id ?? '').trim();
    if (!id || idsGravados.has(id) || vistos.has(id)) continue;
    vistos.add(id); novas.push(e);
  }
  return novas;
}
const LISTAS_FOTO = ['fotosCheckinIds', 'fotosRetornoIds'];
// Só fileId simples (o que o STORE.pushPhoto gera); nada de caminho.
const idFoto = f => typeof f === 'string' && /^[\w.-]{1,100}$/.test(f) && !f.includes('..');
const vazio = v => v == null || v === '' || v === false || (Array.isArray(v) && !v.length) || (objeto(v) && !Object.keys(v).length);
/* Teto de texto do crachá de toque: o registro desce para todo tablet, e os 7
   sistemas dividem 5 MB de localStorage. Uma obs de 2 MB estouraria todos. */
const TEXTO_MAX = 2000;
const cortar = v => typeof v === 'string' && v.length > TEXTO_MAX ? v.slice(0, TEXTO_MAX) : v;
/* MESCLA, NÃO FILTRA. O upsert SUBSTITUI a O.S. inteira; partir do que já está
   gravado e deixar o crachá de toque mudar só os campos dele é o que protege
   o resto. Devolve { os, erro, avisos, entregasFora }: erro preenchido vira 422
   e os vem nulo; aviso é o que foi deixado de fora, e o resto grava.
   entregasFora são as entregas declaradas que não acharam item ({ id, uid,
   motivo }): o pcp-sync as devolve em `descartado` com as recusadas.

   SEM CONFLITO DE VERSÃO (25/09/2026). O rev gravado passa a valer sempre: a
   janela "alterada em outro aparelho" só oferecia duas perdas (Recarregar
   apagava o check-in do aparelho; Sobrescrever apagava as fotos do colega), e
   ela abria toda vez que o PCP, o ERP ou o colega da dupla gravavam antes.
   Cópia VELHA (o aparelho leu um rev anterior) é mesclada com cuidado: lista
   de foto SOMA as duas, e valor vazio não apaga o que já está gravado (a
   cópia velha só não sabia dele). Cópia em dia troca a lista, porque o × do
   espelho tira foto da lista.

   ITENS: casa pelo código do item (uid, E1). O item sem código (aba antiga)
   casa pelo número e descrição em qualquer posição; se o PCP mudou a
   descrição, pelo número (quando só um tem aquele número); depois pela
   descrição (casarItens). A marca nunca pula para o vizinho, e item que só o
   aparelho tem não é criado; marca que não achou item vira aviso.

   FINALIZAR: só O.S. que o PCP liberou e o cliente confirmou, as mesmas travas
   do espelho. Faltando uma, a finalização não entra e o resto do trabalho
   grava, com aviso: recusar tudo (422) prendia check-in, fotos e itens na fila
   do celular. O autor é o crachá, nunca o nome que o aparelho escreveu. A hora
   é a do aparelho (quem finalizou offline às 15h finalizou às 15h), a não ser
   que venha do futuro. Reabrir não é do instalador: finalizada segue
   finalizada, com o autor que tinha; e finalização mais velha que a reabertura
   da gestão não fecha a O.S. de novo. */
export function mesclarToqueNoNome(atual, veio, autor, agora) {
  const m = { ...atual }, avisos = [], entregasFora = [];
  const revAtual = typeof atual?.rev === 'number' ? atual.rev : 0;
  const velha = typeof veio?.rev === 'number' && veio.rev !== revAtual;
  /* FOTO TIRADA É DITA, NÃO DEDUZIDA. Na cópia velha a lista SOMA, então o ×
     não valia: a foto apagada voltava à O.S. (e o arquivo já tinha saído do
     bucket), virando miniatura quebrada e "prova" de conclusão que não existe.
     O × do espelho e o da gestão anotam o id em `fotosTiradas`; a mescla tira
     esses ids das listas mesmo em cópia velha, e a lista fica gravada para o
     próximo envio velho de outro aparelho também não trazer a foto de volta. */
  const tiradas = new Set([...(Array.isArray(atual?.fotosTiradas) ? atual.fotosTiradas : []),
    ...(Array.isArray(veio?.fotosTiradas) ? veio.fotosTiradas : [])].filter(idFoto));
  if (tiradas.size) m.fotosTiradas = [...tiradas].slice(-100);
  for (const k of Object.keys(veio || {})) {
    if (!CAMPOS_MONTAGEM.has(k) || k === 'id' || k === 'rev' || k === 'fotosTiradas') continue;
    if (LISTAS_FOTO.includes(k)) {
      if (!Array.isArray(veio[k])) continue; // tipo errado é descartado, como campo fora da lista
      // Id que já está gravado passa como está (foto antiga não some por formato).
      const gravadas = Array.isArray(atual?.[k]) ? atual[k] : [];
      const novas = veio[k].filter(f => idFoto(f) || gravadas.includes(f));
      const lista = [...new Set(velha ? [...gravadas, ...novas] : novas)].filter(f => !tiradas.has(f));
      // O teto segura o registro que desce para todo tablet; o corte é dito,
      // senão a foto subia, sumia da O.S. e ninguém sabia.
      if (lista.length > 60) avisos.push(`${lista.length - 60 === 1 ? '1 foto ficou' : lista.length - 60 + ' fotos ficaram'} de fora da O.S.: o limite é 60 ${k === 'fotosCheckinIds' ? 'de check-in' : 'do serviço pronto'}. Fale com o PCP.`);
      m[k] = lista.slice(0, 60);
      continue;
    }
    if (velha && vazio(veio[k]) && !vazio(atual?.[k])) {
      // Desmarcar numa cópia velha não vale (não dá para saber se foi o
      // toque ou se o aparelho não sabia), mas não fica calado.
      if (k === 'instalacaoOK' && veio[k] === false && atual[k] === true) avisos.push('"Instalação OK" continua marcada: o escritório gravou a O.S. antes. Se era para desmarcar, desmarque de novo.');
      continue;
    }
    // Local do check-in: só os quatro campos que o espelho grava, com número de verdade.
    if (k === 'checkinGPS' && veio[k] != null) {
      const g = veio[k];
      if (!objeto(g) || !Number.isFinite(Number(g.lat)) || !Number.isFinite(Number(g.lng))) continue;
      m[k] = { lat: Number(g.lat), lng: Number(g.lng), precisao: Number.isFinite(Number(g.precisao)) ? Number(g.precisao) : 0, ts: String(g.ts ?? '').slice(0, 40) };
      continue;
    }
    m[k] = cortar(veio[k]);
  }
  m.rev = revAtual;
  if (Array.isArray(veio?.itens) && Array.isArray(atual?.itens)) {
    const txt = v => String(v ?? '');
    // O código do item manda (E1); sem código, o casamento de antes (casarItens).
    const par = casarItens(atual.itens, veio.itens);
    const usados = new Set(par.map((i, j) => i >= 0 ? j : -1).filter(j => j >= 0));
    const doGravado = new Map(par.map((i, j) => [i, j]).filter(([i]) => i >= 0));
    /* ENTREGA DECLARADA PELO CELULAR (E5): a marca de id novo entra no item
       casado, depois das gravadas; a que já está gravada (a fila mandou de
       novo, em qualquer item da O.S.) fica como está. Cópia velha também
       traz marca nova: quem marcou sem sinal ontem marcou de verdade. */
    const idsGravados = new Set();
    for (const g of atual.itens) for (const e of objeto(g) && Array.isArray(g.entregas) ? g.entregas : []) if (objeto(e)) idsGravados.add(String(e.id ?? '').trim());
    const fora = (it, e, motivo) => entregasFora.push({ id: String(e.id ?? '').trim().slice(0, 64), uid: String(it?.uid ?? '').slice(0, 80), motivo });
    m.itens = atual.itens.map((it, i) => {
      if (!objeto(it)) return it;
      const v = doGravado.has(i) ? veio.itens[doGravado.get(i)] : null;
      if (!v) return it;
      const r = { ...it };
      for (const c of CAMPOS_ITEM_MONTAGEM) {
        if (c === 'entregas') {
          const novas = marcasNovasDoToque(v, idsGravados);
          for (const e of novas.slice(TETO_MARCAS_TOQUE)) fora(it, e, 'Marcas demais num envio só: esta não foi gravada. Fale com o PCP.');
          if (novas.length) r.entregas = [...(Array.isArray(it.entregas) ? it.entregas : []), ...novas.slice(0, TETO_MARCAS_TOQUE)];
          continue;
        }
        if (!proprio(v, c) || (velha && vazio(v[c]) && !vazio(it[c]))) continue;
        // O toque só LIGA o Verificado (pronto): desligar é da gestão.
        if (c === 'pronto' && v[c] !== true) continue;
        r[c] = c === 'fotoProbId' && v[c] && !idFoto(v[c]) ? it[c] : cortar(v[c]);
      }
      if (r.fotoProbId && tiradas.has(r.fotoProbId)) r.fotoProbId = '';
      return r;
    });
    /* Item que só o aparelho tem (o PCP tirou da lista): a marca não pula
       para o vizinho e não cria item. A entrega declarada nele volta como
       recusada, para o celular tirá-la da cópia e da fila. */
    const soDoAparelho = veio.itens.filter((v, j) => !usados.has(j) && objeto(v));
    const perdidas = soDoAparelho.filter(v => CAMPOS_ITEM_MONTAGEM.some(c => c === 'entregas' ? marcasNovasDoToque(v, idsGravados).length > 0 : !vazio(v[c])));
    for (const v of soDoAparelho) for (const e of marcasNovasDoToque(v, idsGravados)) fora(v, e, 'O item não está mais na O.S.: a entrega não foi gravada. Fale com o PCP.');
    if (perdidas.length) avisos.push(`${perdidas.length === 1 ? 'A marca do item ' + txt(perdidas[0].item || perdidas[0].descricao) + ' não foi gravada' : perdidas.length + ' marcas de item não foram gravadas'}: o PCP mudou a lista de itens. Confira os itens com o PCP.`);
  }
  if (!atual?.finalizadaEm && veio?.finalizadaEm) {
    const t = Date.parse(String(veio.finalizadaEm)), reaberta = Date.parse(String(atual?.reabertaEm || ''));
    if (!atual.liberadoPCP) avisos.push('A O.S. não foi finalizada: o PCP ainda não liberou. Fale com o PCP.');
    else if (atual.tipo !== 'interno' && atual.confirmacao !== 'Confirmado') avisos.push('A O.S. não foi finalizada: o cliente ainda não confirmou. Fale com o PCP.');
    else if (Number.isFinite(reaberta) && !(Number.isFinite(t) && t > reaberta)) avisos.push('A O.S. não foi finalizada: a gestão reabriu depois. Finalize de novo se o serviço terminou.');
    else {
      m.finalizadaEm = Number.isFinite(t) && t <= Date.parse(agora) + 10 * 60 * 1000 ? String(veio.finalizadaEm) : agora;
      m.finalizadoPor = autor;
    }
  }
  return { os: m, erro: '', avisos, entregasFora: entregasFora.slice(0, 200) };
}
/* HORÁRIOS DO ESPELHO QUE FEREM A REGRA NÃO DERRUBAM O ENVIO (crachá de toque).
   O espelho carimba saída e retorno com o dia AGENDADO: serviço que vira a
   noite (saída 13h, retorno 9h do dia seguinte) chegava com o retorno antes da
   saída, e o 400 prendia a O.S. inteira na fila do celular. Retorno até 24 h
   "antes" da saída é o dia seguinte; o resto que não fecha fica de fora, com
   aviso, e o que já estava gravado vale. Muda `os` e devolve os avisos. */
export function acertarMomentosToque(os, anterior) {
  const avisos = [];
  const valido = v => /^\d{4}-\d{2}-\d{2}T/.test(String(v || '')) && Number.isFinite(Date.parse(String(v)));
  for (const k of ['saidaEm', 'retornoEm']) {
    if (os[k] && !valido(os[k])) {
      os[k] = valido(anterior?.[k]) ? anterior[k] : '';
      avisos.push('Data de ' + (k === 'saidaEm' ? 'saída' : 'retorno') + ' inválida: não foi gravada.');
    }
  }
  if (os.saidaEm && os.retornoEm && Date.parse(os.retornoEm) < Date.parse(os.saidaEm)) {
    const d = new Date(String(os.retornoEm).slice(0, 10) + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    const seguinte = d.toISOString().slice(0, 10) + String(os.retornoEm).slice(10);
    const dif = Date.parse(seguinte) - Date.parse(os.saidaEm);
    if (Number.isFinite(dif) && dif >= 0 && dif < 864e5) os.retornoEm = seguinte;
    else {
      const velho = anterior?.retornoEm;
      os.retornoEm = valido(velho) && Date.parse(velho) >= Date.parse(os.saidaEm) ? velho : '';
      avisos.push('O retorno ficou antes da saída e não foi gravado. Confira a hora do retorno.');
    }
  }
  return avisos;
}
/* O QUE DESCE PARA QUEM ENTROU PELO NOME. O crachá de toque sai de um primeiro
   nome, sem senha: precisa de cliente, endereço e contato, não do documento
   nem do dinheiro de ninguém. Vale para TODA saída de O.S. (lista, resposta do
   upsert, janela de conflito); a mescla parte do que está gravado, então o que
   não desce não se perde na volta. erpAlteracoes sai inteiro: guarda o antes e
   o depois do CPF/CNPJ e do valor.
   Os IDs do RH dos carimbos (<campo>Id, a memória idsDosCarimbos, o porId e
   porConta da entrega lançada e o porId das marcas de entrega por item)
   também não descem: o ID são os 6 primeiros dígitos do CPF de quem é da
   gestão (revisão da F01). O nome continua. */
export function podarToque(r) {
  if (!objeto(r)) return r;
  /* A divisão da equipe (alocacao, F08) e o histórico dela (alocacaoLog)
     também não descem: são os percentuais de cada colega, e o log guarda o
     antes e o depois deles. A mescla parte do gravado: nada se perde. */
  const { cnpjCpf: _c, valorTotal: _v, erpAlteracoes: _h, [MEMORIA_IDS]: _m, alocacao: _a, alocacaoLog: _al, ...resto } = r;
  for (const c of Object.keys(CARIMBOS_COM_ID)) delete resto[c + 'Id'];
  if (objeto(resto.entregaLancada)) {
    const { porId: _pi, porConta: _pc, ...el } = resto.entregaLancada;
    resto.entregaLancada = el;
  }
  const semF15 = podarCarimbosF15(resto);
  if (Array.isArray(semF15.itens)) semF15.itens = semF15.itens.map(it => {
    if (!objeto(it)) return it;
    const { valorUnit: _u, subtotal: _s, ...x } = it;
    return x;
  });
  return semF15;
}
/* O ID E O LOGIN DE QUEM DIGITOU O PRAZO E O RETORNO PREVISTOS (F15) só
   descem para a gestão (admin, pcp) e para a máquina. Para os outros papéis
   (montagem com senha, operação, comercial) e para o toque, desce o nome de
   quem digitou: o ID são os 6 primeiros dígitos do CPF (revisão da F15). A
   volta sem eles não apaga nada: o campo da gestão fica o gravado. */
export function podarCarimbosF15(r) {
  if (!objeto(r)) return r;
  const out = { ...r };
  if (objeto(out.prazoCombinado)) {
    const { porId: _pi, porConta: _pc, ...pc } = out.prazoCombinado;
    out.prazoCombinado = pc;
  }
  if (Array.isArray(out.retornoPrevisto)) out.retornoPrevisto = out.retornoPrevisto.map(e => {
    if (!objeto(e)) return e;
    const { porId: _pi, porConta: _pc, ...x } = e;
    return x;
  });
  else if (objeto(out.retornoPrevisto)) {
    const { porId: _pi, porConta: _pc, ...x } = out.retornoPrevisto;
    out.retornoPrevisto = x;
  }
  /* O CANCELAMENTO DA O.S. (F16) desce com o nome de quem cancelou e de quem
     desfez, sem o ID e sem o login: a mesma régua. A volta sem eles não
     apaga nada (só pedido muda o campo: carimbarCancelamento). */
  if (objeto(out.cancelamento)) {
    const { porId: _pi, porConta: _pc, desfeitoPorId: _di, desfeitoPorConta: _dc, ...c } = out.cancelamento;
    out.cancelamento = c;
  }
  // A chegada conferida (F14) desce com o nome de quem conferiu, sem o ID e sem o login.
  if (objeto(out.retornoConferido)) {
    const { porId: _pi, porConta: _pc, ...x } = out.retornoConferido;
    out.retornoConferido = x;
  }
  // Quem finalizou pelo celular (revisão da E5) desce com o nome, sem o ID; a volta sem ele não apaga.
  if (objeto(out.finalizadaPorCampo)) {
    const { porId: _pi, ...x } = out.finalizadaPorCampo;
    out.finalizadaPorCampo = x;
  }
  /* A MARCA DE ENTREGA POR ITEM (E3) desce com o nome de quem marcou, sem o
     ID: a mesma régua. A volta sem ele não apaga nada, porque marca gravada
     não muda (guardarEntregasItens parte do gravado). */
  if (Array.isArray(out.itens) && out.itens.some(it => objeto(it) && Array.isArray(it.entregas))) {
    out.itens = out.itens.map(it => !objeto(it) || !Array.isArray(it.entregas) ? it
      : { ...it, entregas: it.entregas.map(e => { if (!objeto(e)) return e; const { porId: _pi, ...x } = e; return x; }) });
  }
  return out;
}
/* COMPARAR POR CONTEÚDO, NÃO POR TEXTO. O jsonb do banco reordena as chaves
   (por tamanho): {data, periodo, hora} volta como {data, hora, periodo}. A
   comparação por JSON.stringify via "remarcou" em toda gravação da O.S. criada
   à mão e apagava a confirmação do cliente e a liberação do carro. */
export const canon = v => Array.isArray(v) ? '[' + v.map(canon).join(',') + ']'
  : objeto(v) ? '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}'
  : JSON.stringify(v ?? null);
/* A LIMPEZA DO CARRO QUE A EQUIPE REGISTRA (voltaEquipe, 25/09/2026). As
   mesmas quatro perguntas da conferência da gestão (operacao.js), com a mesma
   polaridade: o PCP compara chave a chave, sem tradução. É uma DECLARAÇÃO: não
   conta na nota (perfFonte lê só retornoConf) e não responde pelo PCP.
   A lista é repetida aqui porque o servidor não carrega operacao.js; um teste
   confere que as duas são iguais. */
export const PERGUNTAS_VOLTA = ['carroLimpo', 'carroArrumado', 'equipamentosOk', 'semAvaria'];
const snVolta = x => x === 'sim' || x === true ? 'sim' : (x === 'nao' || x === false ? 'nao' : '');
// O PCP já conferiu esta O.S.: a partir daí a declaração da equipe não muda mais.
export const voltaConferida = rc => !!objeto(rc) && PERGUNTAS_VOLTA.some(k => snVolta(rc[k]));
/* Devolve o que gravar (ou null para não ter o campo). Ausência e envio vazio
   não apagam: aparelho com app antigo não conhece o campo, e um {} não é
   declaração. Autor e hora de chegada vêm do crachá e do servidor, nunca do
   aparelho. A hora do registro é a do aparelho (quem registrou offline às 18h
   registrou às 18h), a não ser que venha do futuro: a mesma regra do
   finalizadaEm. Resposta igual à gravada mantém o carimbo de quem registrou. */
export function sanearVoltaEquipe(veio, antes, autor, agora) {
  const velho = objeto(antes) ? antes : null;
  if (!objeto(veio)) return velho;
  const n = Object.fromEntries(PERGUNTAS_VOLTA.map(k => [k, veio[k] === 'sim' || veio[k] === 'nao' ? veio[k] : '']));
  if (!PERGUNTAS_VOLTA.some(k => n[k])) return velho;
  n.obs = String(veio.obs ?? '').slice(0, 300);
  // Só fileId simples (o que o STORE.pushPhoto gera); nada de caminho.
  n.fotos = (Array.isArray(veio.fotos) ? veio.fotos : []).filter(f => typeof f === 'string' && /^[\w.-]{1,100}$/.test(f) && !f.includes('..')).slice(0, 4);
  n.dia = /^\d{4}-\d{2}-\d{2}$/.test(String(veio.dia ?? '')) ? String(veio.dia) : '';
  n.veiculo = String(veio.veiculo ?? '').slice(0, 60);
  const igual = velho && PERGUNTAS_VOLTA.every(k => n[k] === velho[k]) && n.obs === (velho.obs || '') &&
    n.fotos.join() === (Array.isArray(velho.fotos) ? velho.fotos : []).join();
  if (igual) return { ...n, por: velho.por || '', porId: velho.porId || '', em: velho.em || '', recebidoEm: velho.recebidoEm || '' };
  const t = Date.parse(String(veio.em ?? ''));
  const em = Number.isFinite(t) && t <= Date.parse(agora) + 10 * 60 * 1000 ? new Date(t).toISOString() : agora;
  /* Declaração MAIS VELHA que a do COLEGA não passa por cima: ele corrigiu às
     18:10 e o envio das 18:00, parado sem sinal, chegava depois e desfazia a
     correção calado. A mesma pessoa corrigindo a própria declaração vale
     sempre (a fila do aparelho só guarda a última). Quem chama avisa. */
  const outro = velho && String(velho.porId || velho.por || '') !== String(autor?.sub || autor?.nome || '');
  if (outro && Date.parse(String(velho.em || '')) > Date.parse(em)) return velho;
  return { ...n, por: String(autor?.nome || ''), porId: String(autor?.sub || ''), em, recebidoEm: agora };
}
/* DIÁRIO DE AUDITORIA (F03, 29/09/2026). Pedido do dono: "log de auditoria
   completo (quem, quando, o que alterou, inclusive percentuais)". Quem escreve
   é o SERVIDOR (pcp-sync), na coleção 'auditoria' de pcp_registros, só de
   inserção. O aparelho nunca escreve nem recebe: o autor vem do crachá e o
   diário não desce (7 sistemas dividem 5 MB de localStorage).

   O QUE ENTRA: o que muda dinheiro, nota ou prova. Equipe (a divisão da
   performance sai dela), agenda campo a campo, carro, valor e itens (o
   diário só é lido por admin e pcp, então pode guardar R$), saída e retorno,
   fotos de prova, conferência da volta, exceção de encerramento, finalização
   e reabertura, entrega lançada, retrabalho e causa. CPF/CNPJ NUNCA entra: não
   está na lista, e o saneamento abaixo tira qualquer chave de documento que
   viesse dentro de um objeto.

   Exportado aqui (e não no index.ts) para o pcp-mubisys poder usar depois: a
   baixa automática e a reimportação gravam direto no banco e ainda não
   passam pelo diário. */
export const CAMPOS_AUDITADOS = [
  'equipe', 'veiculo',
  'instalacao.data', 'instalacao.periodo', 'instalacao.hora', 'instalacao.duracaoDias',
  'previsaoEntrega', 'valorTotal', 'itens',
  // As marcas de entrega por item (E3): uma linha compacta por marca nova,
  // no lugar do antes e depois da lista inteira de itens.
  'itens.entregas',
  'liberadoPCP', 'confirmacao', 'carroLiberado',
  'horaSaida', 'horaRetorno', 'saidaEm', 'retornoEm',
  'fotosCheckinIds', 'fotosRetornoIds', 'layoutFotoId',
  'retornoConf', 'voltaEquipe', 'excecaoConclusao',
  'finalizadaEm', 'finalizadoPor', 'reabertaEm', 'reabertaPor',
  // Quem finalizou pelo celular (revisão da E5): decide se o implícito é declarado.
  'finalizadaPorCampo',
  'entregaLancada', 'retrabalho', 'causa', 'causaRaiz', 'etapaOrigem',
  // O que a apuração da performance e a trava da conclusão leem (perfFonte,
  // validarConclusao): o tipo tira a O.S. da performance e dispensa a prova;
  // o número busca o valor no Painel; a baixa do ERP e a justificativa decidem
  // se a entrega conta e se a prova faltou (revisão da F03).
  'tipo', 'numero', 'baixaAutoERP', 'justificativaConclusao',
  // Os campos da gestão dentro da O.S. (F01): a limpeza de propósito fica com autor.
  ...CAMPOS_GESTAO,
  // O prazo das O.S. sem prazo gravado é lido do histórico de remarcações e
  // da origem (ERP ou PDF do ERP): mexer neles fica com autor (revisão da F15).
  'agendaLog', 'origemPDF',
  // O "Manter aberta" da gestão na O.S. que o ERP deu como entregue com saldo no PCP (E7).
  'erpSaldoDecisao',
];
// Campo com ponto é caminho: 'instalacao.data' lê os.instalacao.data.
const lerCaminho = (o, caminho) => caminho.split('.').reduce((v, k) => (objeto(v) ? v[k] : undefined), o);
/* Vazio é vazio: ausente, null, '', false, [] e {} são a mesma coisa. Sem
   isso, a O.S. antiga sem `retrabalho` e a mesma O.S. regravada com
   `retrabalho:false` virariam "alteração" em toda gravação, e diário que
   registra tudo ninguém lê. */
const vazioAud = v => v == null || v === '' || v === false || (Array.isArray(v) && !v.length) || (objeto(v) && !Object.keys(v).some(k => !vazioAud(v[k])));
/* Para COMPARAR, o vazio some também por dentro: o item {pronto:false} e o
   mesmo item sem `pronto` são o mesmo item. O que se GUARDA é o valor cru. */
const semVazio = v => {
  if (vazioAud(v)) return null;
  if (Array.isArray(v)) return v.map(semVazio);
  if (!objeto(v)) return v;
  return Object.fromEntries(Object.entries(v).filter(([, x]) => !vazioAud(x)).map(([k, x]) => [k, semVazio(x)]));
};
const DOCUMENTO = /^(cpf|cnpj|cnpjcpf|cpfcnpj|documento)$/i;
function semDocumento(v) {
  if (Array.isArray(v)) return v.map(semDocumento);
  if (!objeto(v)) return v === undefined ? null : v;
  return Object.fromEntries(Object.entries(v).filter(([k, x]) => !DOCUMENTO.test(k) && x !== undefined).map(([k, x]) => [k, semDocumento(x)]));
}
/* Compara `antes` e `depois` nos campos auditados, por CONTEÚDO (canon: o
   jsonb reordena chaves). Devolve null quando nada mudou, ou
   { campos, antes, depois } com o valor cru de cada lado (null quando vazio
   do lado de lá). */
/* O código do item (uid, E1) que o servidor carimba não é mudança de ninguém:
   na comparação da lista de itens ele não conta. As marcas de entrega (E3)
   também não: elas têm linha própria ('itens.entregas'), e a lista de itens
   entra no diário sem elas. Fora isso, o que se guarda é cru. */
const semEntregas = it => { if (!objeto(it)) return it; const { entregas: _e, ...x } = it; return x; };
const semUidItens = (c, v) => c === 'itens' && Array.isArray(v) ? v.map(it => {
  if (!objeto(it)) return it;
  const { uid: _u, entregas: _e, ...x } = it;
  return x;
}) : v;
/* As marcas de entrega da O.S. por id, na ordem, com o item de cada uma. */
function marcasDaOS(o) {
  const m = new Map();
  for (const it of Array.isArray(o.itens) ? o.itens : []) {
    for (const e of marcasDe(it)) {
      const id = objeto(e) ? String(e.id ?? '') : '';
      if (id && !m.has(id)) m.set(id, linhaEntrega(it, e));
    }
  }
  return m;
}
export function diffAuditavel(antes, depois, campos = CAMPOS_AUDITADOS) {
  const a = objeto(antes) ? antes : {}, d = objeto(depois) ? depois : {};
  const out = { campos: [], antes: {}, depois: {} };
  for (const c of campos) {
    /* MARCA DE ENTREGA POR ITEM: uma linha por marca nova (uid, tipo,
       quantidade, dia, autor), sem R$. O lado de antes diz quantas havia. */
    if (c === 'itens.entregas') {
      const ma = marcasDaOS(a), md = marcasDaOS(d);
      const novos = [...md.entries()].filter(([id]) => !ma.has(id)).map(([, l]) => l);
      if (!novos.length && [...ma.keys()].every(id => md.has(id))) continue;
      out.campos.push(c);
      out.antes[c] = { marcas: ma.size };
      out.depois[c] = { marcas: md.size, novos };
      continue;
    }
    const va = lerCaminho(a, c), vd = lerCaminho(d, c);
    if (canon(semVazio(semUidItens(c, va))) === canon(semVazio(semUidItens(c, vd)))) continue;
    out.campos.push(c);
    if (c === 'itens') {
      out.antes[c] = semDocumento(Array.isArray(va) ? va.map(semEntregas) : va ?? null);
      out.depois[c] = semDocumento(Array.isArray(vd) ? vd.map(semEntregas) : vd ?? null);
      continue;
    }
    /* O HISTÓRICO DA DIVISÃO (alocacaoLog, F08) só cresce, até 40 linhas: o
       diário guarda o tamanho de cada lado e as linhas novas, não a lista
       inteira duas vezes a cada ajuste de percentual. */
    if (c === 'alocacaoLog' && Array.isArray(vd)) {
      const velhas = new Set((Array.isArray(va) ? va : []).map(canon));
      out.antes[c] = { linhas: Array.isArray(va) ? va.length : 0 };
      out.depois[c] = { linhas: vd.length, novas: semDocumento(vd.filter(x => !velhas.has(canon(x)))) };
      continue;
    }
    out.antes[c] = semDocumento(va ?? null);
    out.depois[c] = semDocumento(vd ?? null);
  }
  return out.campos.length ? out : null;
}
/* A CONFIGURAÇÃO: quem instala (instaladores), quem é quem no RH (vinculosRH),
   as equipes e os pesos da nota, e cada participação com os percentuais.
   Participação muda uma por O.S.: entra só a que mudou, pelo id, para o
   diário não copiar a lista inteira a cada ajuste. O logo da equipe (até
   40 KB de imagem) vira uma marca: o diário diz que trocou, sem a imagem. */
const marcaLogo = l => typeof l === 'string' && l ? `imagem de ${l.length} caracteres, final ${l.slice(-12)}` : l;
const equipesAud = eqs => Array.isArray(eqs) ? eqs.map(e => objeto(e) && 'logo' in e ? { ...e, logo: marcaLogo(e.logo) } : e) : eqs;
export function diffCfgAuditavel(antes, depois) {
  const a = objeto(antes) ? antes : {}, d = objeto(depois) ? depois : {};
  const pa = objeto(a.performancePCP) ? a.performancePCP : {}, pd = objeto(d.performancePCP) ? d.performancePCP : {};
  const lado = (c, p) => ({ instaladores: c.instaladores, vinculosRH: c.vinculosRH, performancePCP: { equipes: equipesAud(p.equipes), criterios: p.criterios } });
  const out = diffAuditavel(lado(a, pa), lado(d, pd), ['instaladores', 'vinculosRH', 'performancePCP.equipes', 'performancePCP.criterios'])
    || { campos: [], antes: {}, depois: {} };
  const porId = xs => new Map((Array.isArray(xs) ? xs : []).filter(p => objeto(p) && p.id != null).map(p => [String(p.id), p]));
  const ma = porId(pa.participacoes), md = porId(pd.participacoes);
  for (const id of [...new Set([...ma.keys(), ...md.keys()])].sort()) {
    const va = ma.get(id) ?? null, vd = md.get(id) ?? null;
    if (canon(va) === canon(vd)) continue;
    const c = 'performancePCP.participacoes:' + id;
    out.campos.push(c); out.antes[c] = semDocumento(va); out.depois[c] = semDocumento(vd);
  }
  return out.campos.length ? out : null;
}
/* A ENTRADA DO DIÁRIO. O autor é montado pelo servidor a partir do crachá
   (nome, login, papel e o ID de pessoa do RH quando se sabe); nada disso vem
   do corpo do pedido. `origem` diz por onde entrou: 'tela' (gestão com
   senha), 'toque' (crachá sem senha do espelho) ou 'maquina' (integração). */
const textoAud = (v, n = 120) => String(v ?? '').slice(0, n);
export function entradaAuditoria({ id, osId, numero, acao, diff, autor, origem, em }) {
  return {
    id: textoAud(id, 80), osId: textoAud(osId, 200), ...(numero ? { numero: textoAud(numero, 40) } : {}),
    acao: textoAud(acao, 40), campos: [...diff.campos], antes: diff.antes, depois: diff.depois,
    autor: { nome: textoAud(autor?.nome), login: textoAud(autor?.login), papel: textoAud(autor?.papel, 40), porId: ehIdPessoa(autor?.porId) ? String(autor.porId).trim() : '' },
    em: textoAud(em, 40), origem: ['tela', 'toque', 'maquina'].includes(origem) ? origem : 'tela',
  };
}
/* ALOCAÇÃO DENTRO DA O.S. (F08, 29/09/2026). A divisão da equipe mora na
   própria O.S. (os.alocacao, formato do motor DIVISAO: grupos com a cota de
   cada equipe, a cota de cada pessoa dentro dela, o líder e a marca de
   freelancer; tudo em 0,01%). Regras desta porta:
   - só admin e pcp (com senha) mudam. Operação, montagem, toque, máquina e
     ERP ficam com o gravado;
   - o que chega é conferido pelo motor (validar) e pela chave estrangeira:
     a equipe existe no cadastro; a pessoa existe nas fichas ou nos contratos
     de freelancer do RH (ficha desligada ou contrato vencido vale quando a
     O.S. é de antes da saída ou do fim do contrato). RH fora do ar: aceita e
     marca `conferirRH`, que não confirma na performance até a próxima
     gravação da gestão com o RH no ar conferir as pessoas;
   - quem está em os.equipe só pelo nome, sem ID no RH, trava a divisão (ela
     tiraria essa pessoa da O.S. calada);
   - a divisão que traz o carimbo (`em`) de uma versão que não é a gravada é
     cópia velha (Sobrescrever de aba antiga) e é descartada;
   - o FINAL de cada pessoa é recalculado aqui, e o que veio do aparelho é
     ignorado; a marca de freelancer sai do RH quando ele responde;
   - os.equipe passa a ser DERIVADA da divisão (lista plana de IDs): o
     celular, os conflitos, a volta do carro, o RH e o Painel leem ela;
   - alocação inválida é DESCARTADA com aviso, nunca 422 (422 prende a fila
     do aparelho). O aparelho recebe `descartado` e volta à versão gravada;
   - aba antiga que muda os.equipe sem mandar a divisão: fica a lista nova e
     a divisão é marcada `desatualizada` (não conta como confirmada);
   - alocacaoLog é só de acréscimo (teto 40), montado aqui com autor, antes
     e depois. O que o aparelho manda nele nunca entra. */
export const ALOCACAO_LOG_MAX = 40;
/* O que a gestão edita: as duas camadas de cotas, papéis, cadeados e o selo
   "editado à mão". O final, as marcas (desatualizada, conferirRH), o carimbo
   e a marca de freelancer (que vem do RH) são do servidor e não contam como
   mudança. A tela v135, que devolve a divisão como recebeu, não muda nada. */
const nucleoAlocacao = a => !objeto(a) ? a : {
  grupos: Array.isArray(a.grupos) ? a.grupos.map(g => !objeto(g) ? g : {
    equipeId: g.equipeId ?? null, cota: g.cota, liderId: g.liderId ?? null, fixo: g.fixo === true,
    membros: Array.isArray(g.membros) ? g.membros.map(m => !objeto(m) ? m : { pessoaId: m.pessoaId, papel: m.papel ?? '', cota: m.cota, fixo: m.fixo === true }) : g.membros,
  }) : a.grupos,
  manual: a.manual === true,
};
// `veio` undefined = o aparelho não mandou o campo (fica o gravado). O vazio
// ('', {}, [], null) é "sem divisão" dos dois lados, como no preservarAusentes:
// limpar com '' e reenviar a limpeza não é mudança nem descarte.
const nucleoOuNada = v => vazioGestao(v) ? null : nucleoAlocacao(v);
export const alocacaoMudou = (veio, antes) => veio !== undefined && canon(nucleoOuNada(veio)) !== canon(nucleoOuNada(antes));
const listaAloc = v => Array.isArray(v) ? v : [];
// O que o log e o diário guardam da divisão: equipes, cotas e papéis.
const resumoAlocacao = a => objeto(a) && Array.isArray(a.grupos) ? {
  grupos: a.grupos.slice(0, 10).map(g => ({
    equipeId: objeto(g) && g.equipeId != null ? String(g.equipeId).slice(0, 150) : null,
    cota: objeto(g) && Number.isInteger(g.cota) ? g.cota : null,
    liderId: objeto(g) && g.liderId != null ? String(g.liderId).slice(0, 20) : null,
    membros: listaAloc(objeto(g) ? g.membros : null).slice(0, 50).map(m => ({
      pessoaId: String(objeto(m) ? m.pessoaId ?? '' : '').slice(0, 20),
      papel: String(objeto(m) ? m.papel ?? '' : '').slice(0, 10),
      cota: objeto(m) && Number.isInteger(m.cota) ? m.cota : null,
    })),
  })),
} : null;
const diaSP = v => {
  if (!v) return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isFinite(+d) ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d) : '';
};
/* O DIA DO TRABALHO, para a ficha desligada. O.S. finalizada: o mesmo dia da
   apuração (perfFonte), a entrega lançada e, sem ela, a finalização. Antes de
   finalizar: a saída, o retorno e a agenda de gente (agendaDeGente); a
   previsão que o ERP pôs em instalacao.data não é dia de trabalho de ninguém. */
export const diaDaOS = o => o?.finalizadaEm
  ? diaSP(o?.entregaLancada?.data) || diaSP(o.finalizadaEm)
  : diaSP(o?.entregaLancada?.data) || diaSP(o?.saidaEm) || diaSP(o?.retornoEm) || agendaDeGente(o);
/* A PESSOA EXISTE NO RH? Pelo ID, nas fichas e nos contratos de freelancer
   que a régua recebeu (desligados inclusive). ID repetido entre dois CPFs
   não é de ninguém. Quem saiu vale só para O.S. do dia da saída ou de antes
   (as pendências de setembro de quem saiu depois). A saída da ficha é a data
   do desligamento; a do contrato de freelancer é o fim do contrato
   (contratoFim). Contrato ENCERRADO no RH antes do fim combinado não tem a
   data do encerramento (o RH não guarda): só vale quando o fim combinado já
   passou, e então o fim é a saída. */
function saidaDoCadastro(p, hoje) {
  if (p.freelancer !== true) return String(p.desligadoEm || '').slice(0, 10);
  const fim = String(p.contratoFim || '').slice(0, 10);
  if (!DIA_ISO.test(fim)) return '';
  if (p.situacaoContrato === 'encerrado' && !(hoje && fim <= hoje)) return '';
  return fim;
}
function conferirPessoaAlocacao(id, pessoas, dia, hoje = '') {
  const achadas = listaAloc(pessoas && pessoas.fichas).filter(p => p && String(p.id) === id);
  if (!achadas.length) return { erro: `A pessoa de ID ${id} não está nas fichas nem nos contratos de freelancer do RH.` };
  if ((typeof pessoas.repetido === 'function' && pessoas.repetido(id)) || achadas.some(p => p.idRepetido === true))
    return { erro: `O ID ${id} aparece em dois cadastros do RH com CPFs diferentes. Confira no RH antes de dividir.` };
  const ativa = achadas.find(p => !p.desligado);
  if (ativa) return { freelancer: ativa.freelancer === true };
  const saida = p => saidaDoCadastro(p, hoje);
  const vale = achadas.find(p => DIA_ISO.test(saida(p)) && dia && dia <= saida(p));
  if (vale) return { freelancer: vale.freelancer === true };
  const nome = String(achadas[0].nome || '').trim().split(/\s+/)[0] || 'ID ' + id;
  const quando = achadas.map(saida).filter(d => DIA_ISO.test(d)).sort().pop();
  if (quando) return { erro: dia
    ? `${nome} (ID ${id}) saiu em ${diaBR(quando)}/${quando.slice(0, 4)}, antes da data desta O.S.`
    : `${nome} (ID ${id}) saiu em ${diaBR(quando)}/${quando.slice(0, 4)}, e esta O.S. ainda não tem o dia do trabalho (entrega, saída ou agenda) para conferir.` };
  const encerrado = achadas.some(p => p.freelancer === true && p.situacaoContrato === 'encerrado');
  return { erro: encerrado
    ? `${nome} (ID ${id}) teve o contrato de freelancer encerrado no RH antes do fim combinado, e o RH não guarda o dia do encerramento.`
    : `${nome} (ID ${id}) não está mais na casa, e o RH não tem a data da saída.` };
}
/* AS PESSOAS DA DIVISÃO, conferidas no RH: a primeira que não passa dá o
   motivo; as que passam levam a marca de freelancer do RH. */
function conferirPessoasDivisao(grupos, pessoas, dia, hoje) {
  const freelancer = new Map();
  for (const g of listaAloc(grupos)) {
    for (const m of listaAloc(objeto(g) ? g.membros : null)) {
      const c = conferirPessoaAlocacao(String(objeto(m) ? m.pessoaId ?? '' : ''), pessoas, dia, hoje);
      if (c.erro) return { motivo: c.erro, freelancer };
      freelancer.set(m.pessoaId, c.freelancer);
    }
  }
  return { motivo: '', freelancer };
}
/* A DIVISÃO QUE O APARELHO MANDOU, conferida. `veio` é o valor cru (antes do
   preservarAusentes); `os` já passou por ele; `antes` é o gravado.
   Opções: pode (admin e pcp com senha), avisar (quem ouve o aviso: não a
   máquina), autor {nome, porId}, agora, equipes (cadastro de hoje), pessoas
   (régua do RH; null = o RH não respondeu).
   Devolve { os, avisos, descartado: null | { motivo }, mudou }. Nunca lança. */
/* QUEM ESTÁ NA O.S. SÓ PELO NOME e não tem ID no RH (o terceiro sem ficha,
   o freelancer antes do CPF): a divisão não o alcança (o motor exige ID), e
   gravá-la trocaria os.equipe pela lista derivada, tirando essa pessoa da
   O.S. calada (o celular dela perde a O.S., a volta do carro muda de chave e
   o RH e o Painel deixam de contar quem trabalhou). A regra do próprio motor
   (alocacaoSugerida): faltando alguém, não sai divisão. Confere a lista que
   veio e a gravada; nome que o RH resolve para um ID passa. */
function semIdNaEquipe(listas, pessoas, rhFora) {
  for (const x of listas.flatMap(listaAloc)) {
    const t = String(x ?? '').trim();
    if (!t || ehIdPessoa(t)) continue;
    if (!rhFora && ehIdPessoa(pessoas.idDe(t))) continue;
    const quem = t.slice(0, 40);
    return rhFora
      ? `O RH não respondeu, e "${quem}" está na equipe desta O.S. só pelo nome. Tente de novo quando o RH responder.`
      : `"${quem}" está na equipe desta O.S. só pelo nome e não tem ID no RH. Resolva o cadastro antes de dividir.`;
  }
  return '';
}
export function sanearAlocacao(veio, os, antes, { pode = false, avisar = false, autor = {}, agora = '', equipes = [], pessoas = null } = {}) {
  const r = { ...os };
  const avisos = [];
  const a0 = objeto(antes) && proprio(antes, 'alocacao') ? antes.alocacao : undefined;
  const log0 = objeto(antes) && Array.isArray(antes.alocacaoLog) ? antes.alocacaoLog : null;
  const carimbo = { por: String(autor?.nome ?? '').slice(0, 120), porId: ehIdPessoa(autor?.porId) ? String(autor.porId).trim() : '', em: String(agora ?? '') };
  const hoje = diaSP(agora);
  const rhFora = !pessoas || typeof pessoas.idDe !== 'function';
  let a = a0, motivo = '', entrada = null;
  if (alocacaoMudou(veio, a0)) {
    /* CÓPIA VELHA: a divisão que veio traz o carimbo do servidor (`em`) de
       uma versão que não é a gravada. É a aba presa numa versão antiga que
       tocou em Sobrescrever e reenviou a cópia local inteira: gravá-la
       apagaria calada a divisão de outro aparelho. A tela da gestão edita a
       partir da divisão gravada e devolve o `em` dela; divisão nova vai sem
       `em`. */
    const emVeio = objeto(veio) && typeof veio.em === 'string' ? veio.em.trim() : '';
    if (emVeio && !(objeto(a0) && String(a0.em ?? '') === emVeio))
      motivo = 'A divisão deste aparelho é de uma versão anterior à que está gravada no servidor.';
    else if (!pode) motivo = 'Só a gestão (admin e PCP) muda a divisão da equipe.';
    else if (vazioGestao(veio)) {
      // Limpar de propósito: a O.S. volta a não ter divisão; os.equipe fica a que veio.
      if (a0 != null) { a = null; entrada = { acao: 'limpar', antes: resumoAlocacao(a0), depois: null }; }
    } else {
      const ids = new Set(listaAloc(equipes).filter(e => objeto(e) && e.id != null).map(e => String(e.id)));
      motivo = DIVISAO.validar(veio);
      if (!motivo) {
        const g = veio.grupos.find(x => x.equipeId != null && !ids.has(x.equipeId));
        if (g) motivo = `A equipe "${String(g.equipeId).slice(0, 40)}" não está no cadastro de equipes.`;
      }
      if (!motivo) motivo = semIdNaEquipe([r.equipe, objeto(antes) ? antes.equipe : null], pessoas, rhFora);
      let freelancer = new Map();
      if (!motivo && !rhFora) {
        const c = conferirPessoasDivisao(veio.grupos, pessoas, diaDaOS(r) || diaDaOS(antes), hoje);
        motivo = c.motivo; freelancer = c.freelancer;
      }
      if (!motivo) {
        const grupos = veio.grupos.map(g => ({
          equipeId: g.equipeId ?? null, cota: g.cota, liderId: g.liderId, ...(g.fixo === true ? { fixo: true } : {}),
          membros: g.membros.map(m => ({ pessoaId: m.pessoaId, papel: m.papel,
            freelancer: rhFora ? m.freelancer === true : freelancer.get(m.pessoaId) === true, cota: m.cota, ...(m.fixo === true ? { fixo: true } : {}) })),
        }));
        // O FINAL É DAQUI: o que o aparelho mandou em `final` não entra.
        a = { grupos, final: DIVISAO.finais({ grupos }), manual: veio.manual === true, ...carimbo, ...(rhFora ? { conferirRH: true } : {}) };
        r.equipe = DIVISAO.derivarEquipe(a);
        entrada = { acao: a0 ? 'alterar' : 'criar', antes: resumoAlocacao(a0), depois: resumoAlocacao(a) };
        if (rhFora && avisar) avisos.push('O RH não respondeu agora: a divisão da equipe foi gravada e fica marcada para conferir as pessoas. Até lá ela não conta na performance.');
      }
    }
    // A lista que veio saiu da divisão recusada: fica a gravada.
    if (motivo && objeto(veio) && Array.isArray(os?.equipe) && objeto(antes) && DIVISAO.mesmaGente(os.equipe, veio)) {
      if (proprio(antes, 'equipe')) r.equipe = antes.equipe; else delete r.equipe;
    }
  } else if (pode && objeto(a0) && a0.conferirRH === true && !rhFora && !DIVISAO.validar(a0)) {
    /* A DIVISÃO GRAVADA COM O RH FORA DO AR é conferida na primeira gravação
       da gestão com o RH no ar. Passou: sai a marca, a marca de freelancer
       vem do RH e o histórico ganha a linha 'conferir' (o carimbo da divisão
       fica o de quem a fez). Não passou: continua marcada, não conta na
       performance e a gestão recebe o motivo. */
    const c = conferirPessoasDivisao(a0.grupos, pessoas, diaDaOS(r) || diaDaOS(antes), hoje);
    if (!c.motivo) {
      const { conferirRH: _c, ...x } = a0;
      const grupos = x.grupos.map(g => ({ ...g, membros: g.membros.map(m => ({ ...m, freelancer: c.freelancer.get(m.pessoaId) === true })) }));
      a = { ...x, grupos, final: DIVISAO.finais({ grupos }) };
      entrada = { acao: 'conferir', antes: resumoAlocacao(a0), depois: resumoAlocacao(a) };
    } else if (avisar) {
      avisos.push(`A divisão da equipe foi gravada com o RH fora do ar e não passou na conferência: ${c.motivo} Ela não conta na performance até a gestão refazer a divisão.`);
    }
  }
  if (motivo && avisar) avisos.push(`A divisão da equipe não foi gravada. ${motivo} ${a0 ? 'Continua valendo a divisão que estava gravada.' : 'A O.S. segue sem divisão gravada.'}`);
  /* DESATUALIZADA: a divisão válida que ficou com gente diferente de
     os.equipe (aba antiga que trocou a equipe sem mandar a divisão). A lista
     nova fica; a divisão vira sugestão até a gestão refazer. Voltar à mesma
     gente tira a marca. */
  if (objeto(a) && !DIVISAO.validar(a)) {
    const velha = !DIVISAO.mesmaGente(r.equipe, a);
    if (velha !== (a.desatualizada === true)) {
      if (velha) a = { ...a, desatualizada: true };
      else { const { desatualizada: _d, ...x } = a; a = x; }
      if (!entrada) entrada = { acao: velha ? 'desatualizar' : 'reatualizar',
        antes: { equipe: DIVISAO.derivarEquipe(a) }, depois: { equipe: listaAloc(r.equipe).map(x => String(x ?? '').slice(0, 60)).slice(0, 50) } };
    }
  }
  if (a === undefined) delete r.alocacao; else r.alocacao = a;
  // O LOG: o gravado e, quando algo mudou aqui, uma linha a mais. Nunca o do aparelho.
  if (entrada) r.alocacaoLog = [...(log0 || []), { ...entrada, ...carimbo }].slice(-ALOCACAO_LOG_MAX);
  else if (objeto(antes) && proprio(antes, 'alocacaoLog')) r.alocacaoLog = antes.alocacaoLog;
  else delete r.alocacaoLog;
  return { os: r, avisos, descartado: motivo ? { motivo } : null, mudou: !!entrada };
}
// O DESCARTE ENTRA NO DIÁRIO: o que estava gravado e o que foi recusado, com o motivo.
export const diarioDescarteAlocacao = (antes, veio, motivo) => ({
  campos: ['alocacao'],
  antes: { alocacao: objeto(antes) && antes.alocacao != null ? antes.alocacao : null },
  depois: { alocacao: { descartada: String(motivo ?? '').slice(0, 300), ...(resumoAlocacao(veio) || {}) } },
});
/* A DIVISÃO FORA DA GESTÃO. A montagem (com senha ou pelo toque) não recebe
   os percentuais nem o histórico deles: o celular do instalador não mostra
   divisão. Os outros papéis (operação, comercial) recebem a divisão sem o ID
   do RH de quem gravou, como nos carimbos da F15. A volta sem os campos não
   apaga nada: ausente fica o gravado. */
export function podarAlocacao(r) {
  if (!objeto(r)) return r;
  const { alocacao: _a, alocacaoLog: _l, ...x } = r;
  return x;
}
export function podarIdsAlocacao(r) {
  if (!objeto(r)) return r;
  const out = { ...r };
  if (objeto(out.alocacao) && 'porId' in out.alocacao) { const { porId: _p, ...a } = out.alocacao; out.alocacao = a; }
  if (Array.isArray(out.alocacaoLog)) out.alocacaoLog = out.alocacaoLog.map(e => { if (!objeto(e)) return e; const { porId: _p, ...x } = e; return x; });
  return out;
}
/* A PARTICIPAÇÃO ANTIGA (blob performancePCP.participacoes) só vale na O.S.
   que nunca teve divisão, ou quando foi confirmada DEPOIS da última mudança
   da divisão. A divisão limpa de propósito (alocacao null, com histórico)
   deixa a O.S. como sugestão: a limpeza não ressuscita a conferência velha.
   A mesma conta no aparelho (performance.js, perfParticipacaoVale). */
export function participacaoVale(os, p) {
  if (!p) return null;
  if (objeto(os?.alocacao)) return null;
  const log = Array.isArray(os?.alocacaoLog) ? os.alocacaoLog.filter(objeto) : [];
  const ultima = log.length ? String(log[log.length - 1].em || '') || '9999' : (objeto(os) && proprio(os, 'alocacao') ? '9999' : '');
  return !ultima || String(p.em || '') > ultima ? p : null;
}
/* CONFIRMADA PARA A PERFORMANCE: a regra única do motor (alocacaoConfirmada),
   exposta aqui para o pcp-sync. */
export const alocacaoConfirmada = os => DIVISAO.alocacaoConfirmada(os);
export const finaisAlocacao = a => DIVISAO.finais(a);
/* ==== RÉGUA DA EQUIPE NA APURAÇÃO (F11): daqui até FIM DA RÉGUA DA EQUIPE, cópia byte a byte de _shared/pcp-integridade.mjs ==== */
/* A MESMA CONTA NO APARELHO (performance.js, dentro do PERF) E NO SERVIDOR
   (_shared/pcp-integridade.mjs, usada pela apuração do pcp-sync). Mudou numa,
   muda na outra no mesmo commit: tests/performance-alocacao-f11.test.cjs
   compara o texto, e tests/performance-alocacao-f11-revisao.test.cjs passa
   casos gerados pela apuração do servidor e pela do aparelho, cada uma com a
   régua de pessoas dela. Funções puras: não leem tela nem banco.
   A COMPOSIÇÃO de uma lista de membros ({chave}): a chave de hoje de cada um
   (`idDe(m)`, a régua de pessoas de cada lado; sem resposta, a chave como
   está), sem repetir e em ordem. A mesma gente em qualquer ordem é a mesma
   composição. */
function composicaoApurada(membros, idDe) {
  const ks = new Set();
  for (const m of Array.isArray(membros) ? membros : []) {
    if (!m || typeof m !== 'object') continue;
    const k = String((idDe ? idDe(m) : '') || (m.chave == null ? '' : m.chave)).trim();
    if (k) ks.add(k);
  }
  return [...ks].sort().join('|');
}
/* A EQUIPE PELA COMPOSIÇÃO (F06, F11): só quando EXATAMENTE UMA equipe ativa
   tem a mesma gente. Com duas ou mais, nenhuma: a ordem do cadastro não é
   mérito. É SUGESTÃO, para a entrega sem divisão e sem confirmação: aparece
   marcada "sugerida", conta nas Entregas e nunca no valor confirmado. */
function equipeDaComposicao(membros, equipes, idDe) {
  const k = composicaoApurada(membros, idDe);
  if (!k) return null;
  const iguais = (Array.isArray(equipes) ? equipes : []).filter(e => e && typeof e === 'object' && e.id && e.ativo !== false && composicaoApurada(e.membros, idDe) === k);
  return iguais.length === 1 ? iguais[0] : null;
}
/* A SUGESTÃO PELA COMPOSIÇÃO: o id, o nome e o emblema da equipe deduzida,
   ou null. */
function equipeSugeridaDe(membros, equipes, idDe) {
  const e = equipeDaComposicao(membros, equipes, idDe);
  return e ? {equipeId:String(e.id), equipeNome:String(e.nome || ''), emblema:e.emblema || '🤝'} : null;
}
/* AS EQUIPES DE UMA DIVISÃO (F11), para a apuração. `finais` é o
   DIVISAO.finais da divisão. Cada equipe leva a cota dela na O.S. (em 0,01%)
   e os IDs de quem tem parte nela; equipe com cota 0, ou sem ninguém com
   parte, fica de fora (não entrou no valor). A equipe que não está no
   cadastro fica sem id e vira composição avulsa, como a equipe única sempre
   foi. O valor da equipe no ranking é a SOMA DAS COTAS: a O.S. com duas
   equipes não conta inteira nas duas. `tamanho` é quanta gente a equipe tem
   na divisão, contando quem ficou em 0%: é por ele que o motor dá o centavo
   que sobra entre as equipes (DIVISAO.ratearCentavosLider), e o ranking dá
   o mesmo centavo à mesma equipe. */
function gruposApurados(aloc, finais, equipes) {
  const gs = aloc && typeof aloc === 'object' && Array.isArray(aloc.grupos) ? aloc.grupos : [];
  const fs = Array.isArray(finais) ? finais : [];
  const cadastro = Array.isArray(equipes) ? equipes : [];
  const out = [];
  gs.forEach((g, gi) => {
    if (!g || typeof g !== 'object') return;
    const cota = Number.isInteger(g.cota) && g.cota > 0 ? g.cota : 0;
    const membros = fs.filter(f => f && f.grupo === gi && Number.isInteger(f.cota) && f.cota > 0).map(f => String(f.pessoaId));
    if (!cota || !membros.length) return;
    const eq = g.equipeId ? cadastro.find(e => e && typeof e === 'object' && e.id === g.equipeId) || null : null;
    const tamanho = (Array.isArray(g.membros) ? g.membros : []).filter(Boolean).length;
    out.push({equipeId:eq ? String(eq.id) : '', equipeNome:eq ? String(eq.nome || '') : '', emblema:(eq && eq.emblema) || '🤝', cota, membros, tamanho});
  });
  return out;
}
/* O QUE A DIVISÃO DÁ AO REGISTRO (F11). Divisão com UMA equipe: ela é a
   equipe do registro (`unica`), e o registro confirmado fica igual ao de
   antes da F11, com o hash da performance-3. Divisão com DUAS OU MAIS, mesmo
   que uma tenha ficado em 0%: as equipes com parte vão em `grupos` e o
   registro fica sem equipe única. A de 0% não leva nada; a outra leva a O.S.
   pela cota dela, e o registro diz que a divisão era de mais de uma equipe
   (é o `grupos` que muda o hash, e só nesse período). */
function equipesDaDivisao(aloc, finais, equipes) {
  const n = aloc && typeof aloc === 'object' && Array.isArray(aloc.grupos) ? aloc.grupos.length : 0;
  const gs = gruposApurados(aloc, finais, equipes);
  return n > 1 ? {unica:null, grupos:gs} : {unica:gs.length === 1 ? gs[0] : null, grupos:null};
}
/* A SUGESTÃO DA ENTREGA NÃO CONFIRMADA (F11): os campos que vão no registro.
   Com divisão na O.S. (desatualizada, esperando o RH ou inválida), vale a
   equipe que a própria divisão escolheu (`equipeId`), nunca a composição:
   quem dividiu disse qual equipe foi. Duas ou mais equipes na divisão vão em
   `grupos`, como na confirmada. Sem divisão, a equipe pela composição
   (equipeSugeridaDe). Entrega sem gente não tem sugestão: está sem equipe.
   Sugestão nunca confirma nem entra no valor confirmado. */
function sugestaoApurada(membros, aloc, finais, equipes, idDe) {
  if (!Array.isArray(membros) || !membros.length) return {equipeSugerida:null};
  if (!aloc || typeof aloc !== 'object') return {equipeSugerida:equipeSugeridaDe(membros, equipes, idDe)};
  const d = equipesDaDivisao(aloc, finais, equipes);
  if (d.grupos) return d.grupos.length ? {equipeSugerida:null, grupos:d.grupos} : {equipeSugerida:null};
  const u = d.unica;
  return {equipeSugerida:u && u.equipeId ? {equipeId:u.equipeId, equipeNome:u.equipeNome, emblema:u.emblema} : null};
}
/* ==== FIM DA RÉGUA DA EQUIPE ==== */
export { composicaoApurada, equipeDaComposicao, equipeSugeridaDe, gruposApurados, equipesDaDivisao, sugestaoApurada };
