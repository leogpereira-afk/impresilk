const PRIVACIDADE_VALORES = (() => {
// A18: projeção financeira e de autoria pessoal para leitura restrita.
// porId é o identificador do RH do autor; IDs operacionais (id/pessoaId) permanecem.
/* O LOGIN DE QUEM GRAVOU (porConta, desfeitoPorConta, revogadoPorConta) também
   não desce para quem não é gestão (item 31 da fila de 11/10/2026, onda
   acabamento): o porId já era podado e o login da conta da gestão ia junto
   (na resposta do retrabalho, no lançamento da entrega). O nome continua. As
   duas cópias (privacidade-valores.js e _shared/pcp-integridade.mjs) são
   iguais por teste. */
const AUTORIA_RESTRITA = /^(?:porId|porConta|[a-z]+PorConta)$/;
const CAMPO_FINANCEIRO = /^(?:valor.*|montante|baseLiquida|totalCentavos|reais|subtotal|preco.*|custo.*|comissao.*|premio.*|orcamento.*|salario.*|desconto.*|acrescimo.*|liquido|bruto|centavos|bonusPCP|erpAlteracoes|medicoesRetrabalho)$/i;
function podarValoresPCP(v) {
  if (Array.isArray(v)) return v.map(podarValoresPCP);
  if (!v || typeof v !== 'object') return v;
  return Object.fromEntries(Object.entries(v).filter(([k]) => !AUTORIA_RESTRITA.test(k) && !CAMPO_FINANCEIRO.test(k)).map(([k,x]) => [k,podarValoresPCP(x)]));
}
return {podar:podarValoresPCP};
})();
if(typeof module!=="undefined")module.exports=PRIVACIDADE_VALORES;
