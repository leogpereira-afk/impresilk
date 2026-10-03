/* Conferências independentes: item + quantidade + dia + divisão da equipe.
   Uma seleção nunca fecha a O.S. nem muda a equipe operacional. */
const CONFERENCIA_ENTREGA = (() => {
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
    const saldoItens = itens.filter(it => !it.cancelado && (usados.get(it.chave) || 0) < it.qtde).map(it => ({...it, saldo:it.qtde - (usados.get(it.chave) || 0)}));
    return {erro:'', entregas:saida, saldoItens, total:valorConhecido ? rateio.total : null, saldo:valorConhecido ? rateio.total - saida.reduce((s,e) => s + e.valor,0) : null};
  }
  return {catalogo, validar, apurar};
})();
if (typeof module !== 'undefined') module.exports = CONFERENCIA_ENTREGA;
