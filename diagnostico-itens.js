/* Diagnóstico somente leitura; não cria UID nem consulta o ERP. */
const DIAGNOSTICO_ITENS = (() => {
  const lista=x=>Array.isArray(x)?x:[];
  function medir(ordens) {
    const c=typeof CONFERENCIA_ENTREGA!=='undefined'?CONFERENCIA_ENTREGA:require('./conferencia-entrega.js');
    const linhas=lista(ordens).map(os=>{
      const itens=lista(os.itens), catalogo=c.catalogo(os), repetidos=(campo)=>{
        const cont=new Map();itens.forEach(i=>{const v=String(i?.[campo]??'').trim();if(v)cont.set(v,(cont.get(v)||0)+1);});return [...cont].filter(([,n])=>n>1).map(([v])=>v);
      };
      const referencias=lista(os.conferenciasEntrega).flatMap(e=>lista(e.itens).map(i=>({entrega:e.id,...i})));
      const orfas=referencias.filter(r=>!catalogo.some(i=>i.chave===r.chave&&i.identidade===r.identidade));
      return {id:os.id,numero:os.numero,itens:itens.length,semUID:itens.filter(i=>!i.uid).length,uidDuplicado:repetidos('uid'),posicaoDuplicada:repetidos('item'),posicaoAusente:itens.filter(i=>!String(i.item??'').trim()||String(i.item)==='0').length,ambiguos:catalogo.filter(i=>i.ambiguo).length,alternativasValidas:catalogo.filter(i=>!i.chave.startsWith('uid:')&&!i.ambiguo).length,referenciasOrfas:orfas.length,candidatosERP:['id','idItem','codigoProduto'].map(campo=>({campo,preenchidos:itens.filter(i=>i[campo]!=null&&i[campo]!=='').length,repetidos:repetidos(campo)}))};
    });
    return {fonte:'Cópia local carregada; não consulta ERP e não mede a nuvem integral',consultadoEm:new Date().toISOString(),mesclaAutomatica:false,os:linhas.length,itens:linhas.reduce((n,l)=>n+l.itens,0),semUID:linhas.reduce((n,l)=>n+l.semUID,0),ambiguos:linhas.reduce((n,l)=>n+l.ambiguos,0),linhas};
  }
  return {medir};
})();
if(typeof module!=='undefined')module.exports=DIAGNOSTICO_ITENS;
