/* REGRAS DO PROGRAMA DAS EQUIPES, VERSIONADAS (F05, 29/09/2026): cópia do
   servidor. O aparelho da gestão valida o formulário da aba Performance >
   Regras com regras.js; esta porta confere aqui o que chega na ação
   performanceRegraNova, com a MESMA função. O bloco abaixo é o mesmo texto de
   regras.js, byte a byte (tests/performance-regras.test.cjs compara o texto e
   os resultados). Mudou lá, muda aqui no mesmo commit, e pcp-sync e
   pcp-mubisys sobem juntos. */
import { DIVISAO } from './pcp-divisao.mjs';
/* ==== REGRAS DO PROGRAMA: daqui até FIM DAS REGRAS, cópia byte a byte de _shared/pcp-regras.mjs ==== */
/* UMA VERSÃO DA REGRA guarda num lugar só tudo o que decide dinheiro e
   ranking. Percentual em inteiros de 0,01% (10000 = 100%, 100 = 1%), como no
   motor de divisão; minutos em inteiros.
     validaDesde           'AAAA-MM-DD': vale para o serviço entregue desse dia
                           em diante, até a próxima versão (revisão 8.1: data,
                           não mês)
     divisao               {tabela:{1,2,3}, maisLider}: a regra do motor
                           (DIVISAO.regraValida); posição 0 de cada linha é o
                           líder, e o líder nunca fica abaixo de um ajudante
     entreEquipes          'proporcional' ao número de pessoas de cada equipe
     comissaoBp            100 = 1% (decisão do dono, 29/09: 1%, não 0,5%)
     comissaoSobre         'os_que_pontua': só a O.S. no prazo, sem retrabalho
                           e sem retorno antecipado
     perdas                o que zera a O.S. (pontos e comissão)
     toleranciaRetornoMin  minutos antes do retorno previsto que não contam
     volta                 bônus e redutor sobre o valor válido da volta:
                           carroLimpoBp (carro limpo e arrumado), equipamento
                           FaltaBp (faltante ou danificado, desconta), e a volta
                           não conferida fica neutra
     desempate             em cascata, na ordem da lista
   Regra é SÓ DE ACRÉSCIMO: versão nova nunca edita a antiga. Id, versão,
   autor e hora são do servidor; normalizarRegra joga fora o que vier do
   aparelho com esses nomes. */
const TOTAL_BP = DIVISAO.TOTAL;
const PERDAS = Object.freeze(['atraso', 'retrabalho', 'retornoAntecipado']);
const DESEMPATES = Object.freeze(['menosOcorrencias', 'maisEntregas']);
const ROTULOS = Object.freeze({
  atraso:'entrega com atraso', retrabalho:'retrabalho', retornoAntecipado:'retorno antecipado',
  menosOcorrencias:'menos ocorrências', maisEntregas:'mais entregas',
});
const CAMPOS = Object.freeze(['validaDesde', 'divisao', 'entreEquipes', 'comissaoBp', 'comissaoSobre', 'perdas', 'toleranciaRetornoMin', 'volta', 'desempate']);
const copiaR = v => v == null ? v : JSON.parse(JSON.stringify(v));
const congelar = o => { if (o && typeof o === 'object') { Object.values(o).forEach(congelar); Object.freeze(o); } return o; };
/* A REGRA EMBUTIDA é o piso (versão 0): vale de 01/10/2026 até o dia antes da
   primeira versão gravada, e a tela a mostra marcada como provisória. Gravar
   uma versão NUNCA a apaga para trás: os dias antes da primeira gravada, e o
   mês fechado com ela, continuam com ela. Começa em 01/10/2026 (recomendação
   do plano: setembro fica na regra de hoje, performance-3). A divisão é a do
   motor. */
const REGRA_EMBUTIDA = congelar({
  id:'embutida', versao:0, provisoria:true, validaDesde:'2026-10-01',
  divisao:copiaR(DIVISAO.REGRA_PADRAO), entreEquipes:'proporcional',
  comissaoBp:100, comissaoSobre:'os_que_pontua', perdas:[...PERDAS],
  toleranciaRetornoMin:15,
  volta:{carroLimpoBp:500, equipamentoFaltaBp:1000, naoConferida:'neutra'},
  desempate:[...DESEMPATES],
});
const intR = v => Number.isInteger(v);
const dentro = (v, min, max) => intR(v) && v >= min && v <= max;
const objR = v => !!v && typeof v === 'object' && !Array.isArray(v);
function dataValida(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [a, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d));
  return a >= 2020 && a <= 2100 && t.getUTCFullYear() === a && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
const dataBR = s => dataValida(s) ? s.split('-').reverse().join('/') : String(s || '');
const pctR = bp => String(bp / 100).replace('.', ',') + '%';
// Lista fechada, sem repetição, na ordem que veio.
const listaDe = (v, permitidos, vazia) => Array.isArray(v) && (vazia || v.length > 0) && v.every(x => permitidos.includes(x)) && new Set(v).size === v.length;
/* SÓ OS CAMPOS DA REGRA. id, versao, autor, criadaEm, requestId e qualquer
   outro campo que venha do aparelho ficam de fora: quem carimba é o servidor. */
function normalizarRegra(x) {
  const r = {};
  if (!objR(x)) return r;
  for (const c of CAMPOS) if (x[c] !== undefined) r[c] = copiaR(x[c]);
  if (objR(r.divisao)) r.divisao = {tabela:r.divisao.tabela, maisLider:r.divisao.maisLider};
  if (objR(r.volta)) r.volta = {carroLimpoBp:r.volta.carroLimpoBp, equipamentoFaltaBp:r.volta.equipamentoFaltaBp, naoConferida:r.volta.naoConferida};
  return r;
}
/* CAMPO AUSENTE NÃO APAGA. Aba antiga que não conhece um campo novo manda a
   regra sem ele; o campo vem da versão mais recente (ou da embutida), nunca
   vira zero. O que veio, mesmo inválido, fica: quem decide é validarRegra. */
function completarRegra(nova, base) {
  const r = normalizarRegra(nova), b = normalizarRegra(base || REGRA_EMBUTIDA);
  for (const c of CAMPOS) if (r[c] === undefined && b[c] !== undefined) r[c] = copiaR(b[c]);
  return r;
}
/* Vazio = válida; senão, a frase para a tela. A mesma função no formulário e
   na porta de dados, para a tela nunca deixar gravar o que o servidor recusa. */
function validarRegra(r) {
  if (!objR(r)) return 'Regra inválida.';
  if (!dataValida(r.validaDesde)) return 'Informe a data de início da regra no formato AAAA-MM-DD.';
  if (!DIVISAO.regraValida(r.divisao)) return 'A tabela de divisão precisa das linhas de 1, 2 e 3 pessoas, cada uma somando 100%, e do líder para 4 ou mais entre 0% e 100%.';
  /* SÓ AS LINHAS 1, 2 E 3. O programa é 1/2/3/4+: linha de 4 em diante o motor
     aplicaria, mas o resumo da aba e o formulário não a mostram, e a versão
     seguinte a perderia sem aviso. */
  if (Object.keys(r.divisao.tabela).sort().join(',') !== '1,2,3') return 'A tabela de divisão tem só as linhas de 1, 2 e 3 pessoas. De 4 pessoas em diante vale o líder de 4 ou mais, com o resto igual entre os ajudantes.';
  /* O LÍDER NUNCA ABAIXO DE UM AJUDANTE, em nenhum tamanho de equipe. Acima de
     50 pessoas o ajudante só diminui; a conta até 51 cobre o "4 ou mais". */
  for (let n = 2; n <= 51; n++) {
    const cotas = DIVISAO.padrao(n, r.divisao);
    const maior = Math.max(...cotas.slice(1));
    if (maior > cotas[0]) return `Com ${n} pessoas o líder ficaria com ${pctR(cotas[0])} e um ajudante com ${pctR(maior)}. O líder não pode ficar abaixo de um ajudante.`;
  }
  if (r.entreEquipes !== 'proporcional') return 'A divisão entre equipes é proporcional ao número de pessoas.';
  if (!dentro(r.comissaoBp, 0, 1000)) return 'A comissão vai de 0% a 10%, com até duas casas decimais.';
  if (r.comissaoSobre !== 'os_que_pontua') return 'A comissão é paga só sobre a O.S. que pontua.';
  if (!listaDe(r.perdas, PERDAS, true)) return 'Lista de perdas inválida.';
  if (!dentro(r.toleranciaRetornoMin, 0, 240)) return 'A tolerância do retorno vai de 0 a 240 minutos.';
  if (!objR(r.volta)) return 'Informe o bônus e o redutor da volta do carro.';
  if (!dentro(r.volta.carroLimpoBp, 0, 2000)) return 'O bônus de carro limpo e arrumado vai de 0% a 20%.';
  if (!dentro(r.volta.equipamentoFaltaBp, 0, TOTAL_BP)) return 'O redutor de equipamento faltante ou danificado vai de 0% a 100%.';
  if (r.volta.naoConferida !== 'neutra') return 'A volta não conferida fica neutra: nem ganha nem perde.';
  if (!listaDe(r.desempate, DESEMPATES, false)) return 'Escolha a ordem do desempate.';
  return '';
}
/* A VERSÃO QUE VALE NUM DIA: a de validaDesde mais recente até esse dia; no
   mesmo dia, a de versão maior (a última gravada). Versão quebrada no banco
   não vale. A embutida é a versão 0: vale de 01/10/2026 nos dias em que
   nenhuma gravada ainda começou, e nunca passa na frente de uma gravada (a
   que começa antes dela continua valendo depois de 01/10). Dia antes de
   01/10/2026 e de qualquer versão: null, fora do programa. */
function regraVigente(versoes, dia) {
  if (!dataValida(dia)) return null;
  const gravadas = (Array.isArray(versoes) ? versoes : []).filter(v => objR(v) && intR(v.versao) && v.versao > 0 && !validarRegra(v));
  const cand = gravadas.filter(v => v.validaDesde <= dia)
    .sort((a, b) => a.validaDesde < b.validaDesde ? 1 : a.validaDesde > b.validaDesde ? -1 : b.versao - a.versao);
  return cand[0] || (REGRA_EMBUTIDA.validaDesde <= dia ? REGRA_EMBUTIDA : null);
}
/* PERÍODO FECHADO. `fechadoAte` é o último dia já fechado (o maior `ate` dos
   fechamentos). Regra que começa nele ou antes mexeria em mês selado: recusa. */
function fechamentoBloqueia(validaDesde, fechadoAte) {
  return dataValida(fechadoAte) && String(validaDesde) <= fechadoAte;
}
/* COMISSÃO DA O.S. QUE PONTUA, em centavos, e a parte de cada um pelo motor
   (dois níveis, sobra no líder). O.S. que não pontua: zero para todos. */
function comissaoCentavos(valorCentavos, regra) {
  const v = Number(valorCentavos);
  if (!Number.isFinite(v) || v <= 0 || !objR(regra) || !intR(regra.comissaoBp)) return 0;
  return Math.round(Math.round(v) * regra.comissaoBp / TOTAL_BP);
}
function exemplo(regra, pessoas, valorCentavos, pontua = true) {
  const n = Math.max(1, Math.floor(Number(pessoas) || 1));
  const ids = Array.from({length:n}, (_, i) => String(900001 + i));
  const aloc = DIVISAO.montar([{equipeId:null, liderId:ids[0], membros:ids}], regra && regra.divisao);
  const comissao = pontua ? comissaoCentavos(valorCentavos, regra) : 0;
  const partes = DIVISAO.ratearCentavosLider(comissao, aloc);
  const fin = DIVISAO.finais(aloc);
  return {pessoas:n, valorCentavos:Math.round(Number(valorCentavos) || 0), comissaoCentavos:comissao,
    partes:partes.map((p, i) => ({papel:fin[i].papel, cota:fin[i].cota, centavos:p.centavos}))};
}
/* BÔNUS E REDUTOR DA VOLTA, em 0,01% sobre o valor válido da volta. `carroCerto`
   e `equipamentoOk`: true, false ou null (não conferido = neutro). */
function ajusteDaVolta(regra, conf) {
  const v = objR(regra) && objR(regra.volta) ? regra.volta : REGRA_EMBUTIDA.volta, c = objR(conf) ? conf : {};
  return (c.carroCerto === true ? v.carroLimpoBp : 0) - (c.equipamentoOk === false ? v.equipamentoFaltaBp : 0);
}
/* ==== FIM DAS REGRAS ==== */
export { TOTAL_BP, PERDAS, DESEMPATES, ROTULOS, CAMPOS, REGRA_EMBUTIDA, dataValida, dataBR, normalizarRegra, completarRegra, validarRegra, regraVigente, fechamentoBloqueia, comissaoCentavos, exemplo, ajusteDaVolta };
export const REGRAS = { TOTAL_BP, PERDAS, DESEMPATES, ROTULOS, CAMPOS, REGRA_EMBUTIDA, dataValida, dataBR, normalizarRegra, completarRegra, validarRegra, regraVigente, fechamentoBloqueia, comissaoCentavos, exemplo, ajusteDaVolta };
