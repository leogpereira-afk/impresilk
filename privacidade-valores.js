const PRIVACIDADE_VALORES = (() => {
// A18: projeção financeira e de autoria pessoal para leitura restrita.
// porId é o identificador do RH do autor; IDs operacionais (id/pessoaId) permanecem.
const CAMPO_FINANCEIRO = /^(?:valor.*|montante|baseLiquida|totalCentavos|reais|subtotal|preco.*|custo.*|comissao.*|premio.*|orcamento.*|salario.*|desconto.*|acrescimo.*|liquido|bruto|centavos|bonusPCP|erpAlteracoes|medicoesRetrabalho)$/i;
function podarValoresPCP(v) {
  if (Array.isArray(v)) return v.map(podarValoresPCP);
  if (!v || typeof v !== 'object') return v;
  return Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'porId' && !CAMPO_FINANCEIRO.test(k)).map(([k,x]) => [k,podarValoresPCP(x)]));
}
return {podar:podarValoresPCP};
})();
if(typeof module!=="undefined")module.exports=PRIVACIDADE_VALORES;
