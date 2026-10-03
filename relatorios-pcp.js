/* Contrato comum dos PDFs. Os dados já chegam autorizados pelo servidor. */
const RELATORIOS_PCP = (() => {
  const escapar=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const CSS=`@page{size:A4 landscape;margin:14mm 10mm 16mm;@bottom-right{content:"Página " counter(page) " de " counter(pages)}}
    @media print{table{width:100%;border-collapse:collapse;table-layout:auto}thead{display:table-header-group}tfoot{display:table-footer-group}
    th,td{white-space:normal!important;overflow:visible!important;text-overflow:clip!important;overflow-wrap:anywhere;max-width:none!important}
    td.pdf-col-id,td.pdf-col-data,td.pdf-col-valor,td.pdf-col-numero{white-space:nowrap!important;overflow-wrap:normal!important;word-break:normal!important}
    .pdf-col-id{width:1%;min-width:18mm}.pdf-col-data{width:1%;min-width:23mm}.pdf-col-valor{width:1%;min-width:34mm}.pdf-col-numero{width:1%;min-width:12mm}
    td.pdf-col-id small,td.pdf-col-data small,td.pdf-col-valor small{display:block;white-space:normal!important;overflow-wrap:anywhere}
    tr,figure{break-inside:avoid}h1,h2,h3{break-after:avoid}}.pdf-metadados{font-size:10pt;color:#444;border-bottom:1px solid #bbb;padding:8px 0;line-height:1.4}
    @media print{details,details>*{content-visibility:visible!important}details::details-content{display:contents!important}.casa-quadro-corpo,.table-wrap,.perf-table-wrap,.casa-tabela-wrap{max-height:none!important;overflow:visible!important}.pdf-metadados{break-inside:avoid}button{display:none!important}.cards-grid{display:block!important}.os-card{break-inside:avoid;max-width:none!important}}`;
  function metadados({titulo='',periodo={},fonte='Registros do PCP carregados neste aparelho',filtros='Conforme recorte indicado',consulta,versao,cobertura='Somente registros carregados; não representa a base integral',modo='Completo'}={}) {
    return `<div class="pdf-metadados"><strong>${escapar(titulo)}</strong><br>Período: ${escapar(periodo.de||'não delimitado')} a ${escapar(periodo.ate||'não delimitado')} · Filtros: ${escapar(filtros)}<br>Fonte: ${escapar(fonte)} · Consulta: ${escapar(consulta||new Date().toISOString())}<br>Revisão: ${escapar(versao||'não informada')} · Escopo: ${escapar(cobertura)} · Conteúdo: ${escapar(modo)}<br>Paginação: habilite cabeçalhos e rodapés do navegador se a numeração de páginas não aparecer.</div>`;
  }
  // Colunas curtas precisam de largura mínima; nomes/descrições usam o restante.
  function tipoColuna(texto) {
    const t=String(texto||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    if(/^(o\.?s\.?|codigo|numero|id)$/.test(t))return 'id';
    if(/^(data|dia|hora|horario)(?:$|\s)/.test(t))return 'data';
    if(/^(valor|comissao|custo|saldo|r\$)(?:$|\s)/.test(t))return 'valor';
    if(/^(qtde|qtd|quantidade|entregas|total)$/.test(t))return 'numero';
    return '';
  }
  function prepararTabelas(raiz) {
    raiz.querySelectorAll('table').forEach(t=>{
      const cab=t.tHead?.rows?.[0];if(!cab)return;
      const tipos=[];for(const c of cab.cells){const tipo=tipoColuna(c.textContent);for(let n=0;n<(c.colSpan||1);n++)tipos.push(tipo);}
      for(const linha of t.rows){let coluna=0;for(const c of linha.cells){const span=c.colSpan||1,tipo=tipos[coluna];if(tipo&&span===1)c.classList.add('pdf-col-'+tipo);coluna+=span;}}
    });
  }
  function prepararJanela(w,meta) {
    if(!w?.document?.body)return;
    const st=w.document.createElement('style');st.textContent=CSS;w.document.head.appendChild(st);
    w.document.body.insertAdjacentHTML('afterbegin',metadados(meta));
    prepararTabelas(w.document.body);
  }
  function sanearCopia(copia,{completo=true,valores=false}={}) {
    // Controles são rascunhos/segredos, não dados de relatório. Campos exportáveis são explícitos.
    copia.querySelectorAll('input,select,textarea').forEach(n=>n.remove());
    copia.querySelectorAll('script,[data-pdf-excluir],.pdf-secao-acao,[hidden]:not(.painel-bloco-corpo)').forEach(n=>n.remove());
    if(!valores)copia.querySelectorAll('[data-valor],.valor-monetario,[data-pdf-valores]').forEach(n=>n.remove());
    if(!completo)copia.querySelectorAll('.perf-report-pendencias').forEach(n=>n.remove());
    copia.querySelectorAll('details').forEach(n=>{if(completo)n.open=true;else n.remove();});
    copia.querySelectorAll('.painel-bloco-corpo').forEach(n=>{if(completo)n.hidden=false;else if(n.hidden)n.remove();});
    prepararTabelas(copia);
    return copia;
  }
  return {CSS,metadados,prepararJanela,sanearCopia,tipoColuna,prepararTabelas};
})();
if(typeof module!=='undefined')module.exports=RELATORIOS_PCP;
